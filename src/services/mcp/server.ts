import type { Database } from '../../../config/db'
import type { TenantRole } from '../../../db/schema'
import type { SessionContext } from '@/services/identity/service'
import type { WorkosClient } from '@/tools/workos/client'
import { buildAdminDeps } from '@/services/admin/deps'
import { listMembers } from '@/services/admin/service'

// Minimal MCP over JSON-RPC 2.0 (Streamable HTTP). Stateless: one request → one
// response. Covers initialize / tools.list / tools.call — enough for a governed
// agent surface without a Durable Object.
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

export type McpDeps = { db: Database; workos: WorkosClient }

// A tool runs with the AGENT's SessionContext — same identity/roles as the human
// who authorized it. `requiredRole` is the per-tool RBAC gate.
type McpTool = {
  name: string
  description: string
  inputSchema: object
  requiredRole?: TenantRole
  run(ctx: SessionContext, deps: McpDeps): Promise<unknown>
}

const NO_ARGS = { type: 'object', properties: {} } as const

const TOOLS: readonly McpTool[] = [
  {
    name: 'whoami',
    description: "Return the calling agent's resolved identity, tenant and roles.",
    inputSchema: NO_ARGS,
    run: async (ctx) => ({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      roles: ctx.roles,
      activeRole: ctx.activeRole,
      actorKind: 'agent',
    }),
  },
  {
    name: 'list_members',
    description: 'List the members of the tenant and their roles. Requires ADMIN.',
    inputSchema: NO_ARGS,
    requiredRole: 'ADMIN',
    run: async (ctx, deps) => {
      const members = await listMembers(
        { tenantId: ctx.tenantId, userId: ctx.userId, sessionId: ctx.sessionId },
        buildAdminDeps(deps.db, deps.workos),
      )
      return members.map((m) => ({ email: m.email, roles: m.roles, active: m.isActive }))
    },
  },
]

const ok = (id: JsonRpcResponse['id'], result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result })
const fail = (id: JsonRpcResponse['id'], code: number, message: string): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id,
  error: { code, message },
})
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
      return ok(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'vms-mcp', version: '0.1.0' },
      })
    case 'notifications/initialized':
      return null
    case 'tools/list':
      return ok(id, {
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      })
    case 'tools/call':
      return callTool(id, req.params ?? {}, ctx, deps)
    default:
      return fail(id, -32601, `Method not found: ${req.method}`)
  }
}

async function callTool(
  id: JsonRpcResponse['id'],
  params: Record<string, unknown>,
  ctx: SessionContext,
  deps: McpDeps,
): Promise<JsonRpcResponse> {
  const tool = TOOLS.find((t) => t.name === params.name)
  if (!tool) return fail(id, -32602, `Unknown tool: ${String(params.name)}`)
  // Fail-closed RBAC: the agent must hold the tool's required role.
  if (tool.requiredRole && !ctx.roles.includes(tool.requiredRole)) {
    return toolText(id, { error: `Forbidden: ${tool.name} requires role ${tool.requiredRole}` }, true)
  }
  const result = await tool.run(ctx, deps)
  return toolText(id, result)
}
