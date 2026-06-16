import { ZodError } from 'zod'
import type { SessionContext } from '@/services/identity/service'
import { decideRbac, policyFor } from '@/config/rbacPolicy'
import type { DomainCode } from '@/types/errorRegistry'
import { logger, serializeError } from '@/utils/logger'
import { TOOLS, ToolError, toolErrorBody, isReadOnly, type McpDeps, type McpTool } from './handlers'

// Re-exported so the route, the gate (check-mcp-coverage) and tests keep a single
// import surface (`@/services/mcp/server`) even though the wiring lives in handlers.
export { TOOLS } from './handlers'
export type { McpDeps } from './handlers'

// Minimal MCP over JSON-RPC 2.0 (Streamable HTTP). Stateless: one request → one
// response. Covers initialize / tools.list / tools.call — a governed agent surface.
export type JsonRpcRequest = {
  jsonrpc: '2.0'
  id?: string | number | null | undefined
  method: string
  params?: Record<string, unknown> | undefined
}
type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string }
}

function scopeGrants(tokenScopes: readonly string[] | undefined, need: 'read' | 'write'): boolean {
  if (!tokenScopes || tokenScopes.length === 0) return true
  const has = (cap: string) => tokenScopes.some((s) => s === cap || s === `vms:${cap}` || s.endsWith(`:${cap}`))
  return need === 'read' ? has('read') || has('write') : has('write')
}

const ok = (id: JsonRpcResponse['id'], result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result })
const fail = (id: JsonRpcResponse['id'], code: number, message: string): JsonRpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } })
const toolText = (id: JsonRpcResponse['id'], value: unknown, isError = false): JsonRpcResponse =>
  ok(id, { content: [{ type: 'text', text: JSON.stringify(value) }], isError })

/** Dispatch one JSON-RPC request. Returns null for notifications (no response). */
export async function handleMcpRequest(
  req: JsonRpcRequest,
  ctx: SessionContext,
  deps: McpDeps,
): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null
  switch (req.method) {
    case 'initialize':
      return ok(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'vms-mcp', version: '0.1.0' } })
    case 'notifications/initialized':
      return null
    case 'tools/list':
      // Permission-aware discovery: advertise ONLY the tools this agent (role ×
      // scope) can actually call, each tagged readOnlyHint so the agent knows a
      // GET is side-effect-free. The agent never wastes a turn on a forbidden tool.
      return ok(id, {
        tools: TOOLS.filter((t) => authorizeTool(t, ctx).ok).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: isReadOnly(t) },
        })),
      })
    case 'tools/call':
      return callTool(id, req.params ?? {}, ctx, deps)
    default:
      return fail(id, -32601, `Method not found: ${req.method}`)
  }
}

// Authorize from the SAME RBAC_POLICY the HTTP wall uses (one SSOT), plus the
// read/write scope derived from the route's method. The verdict is structured so
// both discovery (tools/list filtering) and execution (callTool) read it: a denial
// carries a machine-readable DomainCode an agent can act on (FORBIDDEN ⇒ stop).
type ToolAuth = { ok: true } | { ok: false; code: DomainCode; message: string }

function authorizeTool(tool: McpTool, ctx: SessionContext): ToolAuth {
  if (!tool.route) return { ok: true } // routeless (whoami): authenticated-only
  const [method, path] = tool.route.split(' ')
  if (!method || !path) return { ok: false, code: 'INTERNAL', message: `misconfigured tool route: ${tool.route}` }
  const decision = decideRbac(policyFor(method, path), { authenticated: true, roles: ctx.roles })
  if (decision.kind !== 'allow') return { ok: false, code: 'FORBIDDEN', message: `${tool.name} (${tool.route}) is not permitted for this role` }
  const need: 'read' | 'write' = method === 'GET' ? 'read' : 'write'
  if (!scopeGrants(ctx.tokenScopes, need)) return { ok: false, code: 'FORBIDDEN', message: `${tool.name} requires the '${need}' scope` }
  return { ok: true }
}

async function callTool(
  id: JsonRpcResponse['id'],
  params: Record<string, unknown>,
  ctx: SessionContext,
  deps: McpDeps,
): Promise<JsonRpcResponse> {
  const tool = TOOLS.find((t) => t.name === params.name)
  if (!tool) return fail(id, -32602, `Unknown tool: ${String(params.name)}`)
  const auth = authorizeTool(tool, ctx)
  if (!auth.ok) return toolText(id, toolErrorBody(auth.code, auth.message), true)
  const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {}
  try {
    return toolText(id, await tool.run(ctx, deps, args))
  } catch (err) {
    // Domain/precondition failure → the registry-sourced { code, grpc, retryable }
    // the agent needs to decide retry-vs-stop, identical to the HTTP contract.
    if (err instanceof ToolError) return toolText(id, toolErrorBody(err.code, err.message), true)
    if (err instanceof ZodError) return toolText(id, toolErrorBody('BAD_REQUEST', 'invalid arguments', err.flatten()), true)
    // Unexpected: never leak internals to the agent; log server-side, return INTERNAL.
    logger.error('mcp.tool_failed', { tool: tool.name, ...serializeError(err) })
    return toolText(id, toolErrorBody('INTERNAL'), true)
  }
}
