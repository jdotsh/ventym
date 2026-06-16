import { z, ZodError } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { Database } from '../../../config/db'
import type { SessionContext } from '@/services/identity/service'
import type { WorkosClient } from '@/tools/workos/client'
import { decideRbac, policyFor } from '@/config/rbacPolicy'
import {
  CAPABILITIES,
  bookArgs,
  createAssignmentArgs,
  createTimesheetArgs,
  createVendorArgs,
  createWorkerArgs,
  createWorkOrderArgs,
  endAssignmentArgs,
  getTimesheetArgs,
  getVendorArgs,
  getWorkerArgs,
  getWorkOrderArgs,
  linkPoArgs,
  timesheetActionArgs,
  transitionWorkOrderArgs,
} from '@/config/capabilities'
import { logger, serializeError } from '@/utils/logger'
import { buildAdminDeps } from '@/services/admin/deps'
import { listMembers } from '@/services/admin/service'
import { buildWorkOrderDeps } from '@/services/workOrder/deps'
import { createWorkOrder, getWorkOrder, transitionWorkOrder } from '@/services/workOrder/service'
import { buildTimesheetDeps } from '@/services/timesheet/deps'
import { createTimesheet, getTimesheet, transitionTimesheet } from '@/services/timesheet/service'
import type { TimesheetTransition } from '@/services/timesheet/machine'
import { buildErpDeps } from '@/services/erp/deps'
import { bookTimesheet, linkPurchaseOrder } from '@/services/erp/service'
import { buildStaffingDeps } from '@/services/staffing/deps'
import { createAssignment, createVendor, createWorker, endAssignment, getVendor, getWorker } from '@/services/staffing/service'

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

export type McpDeps = { db: Database; workos: WorkosClient }

// A tool runs with the AGENT's SessionContext. `route` joins to RBAC_POLICY (RBAC
// + read/write scope derive from it) and to the capability registry (the input
// schema is generated from the capability's Zod — never hand-written here).
export type McpTool = {
  name: string
  description: string
  inputSchema: object
  route?: string
  run(ctx: SessionContext, deps: McpDeps, args: unknown): Promise<unknown>
}

type McpRun = McpTool['run']

function scopeGrants(tokenScopes: readonly string[] | undefined, need: 'read' | 'write'): boolean {
  if (!tokenScopes || tokenScopes.length === 0) return true
  const has = (cap: string) => tokenScopes.some((s) => s === cap || s === `vms:${cap}` || s.endsWith(`:${cap}`))
  return need === 'read' ? has('read') || has('write') : has('write')
}

const toJsonSchema = (schema: z.ZodTypeAny): object => zodToJsonSchema(schema, { $refStrategy: 'none' })

// ── Run handlers (the only hand-written per-capability code — the service wiring).
// Each parses the capability's args schema, so validation can't diverge from the
// advertised inputSchema (both derive from the same Zod).
const tsAction = (transition: TimesheetTransition): McpRun => async (ctx, deps, args) => {
  const a = timesheetActionArgs.parse(args)
  const result = await transitionTimesheet(
    ctx,
    { timesheetId: a.id, transition, expectedVersion: a.expectedVersion, eventId: a.idempotencyKey ?? crypto.randomUUID(), ...(a.reason ? { reason: a.reason } : {}) },
    buildTimesheetDeps(deps.db, 'agent'),
  )
  return result.ok ? result.value : { error: result.error.kind }
}

const RUN: Readonly<Record<string, McpRun>> = {
  'GET /admin/users': async (ctx, deps) => {
    const members = await listMembers(
      { tenantId: ctx.tenantId, userId: ctx.userId, sessionId: ctx.sessionId },
      buildAdminDeps(deps.db, deps.workos),
    )
    return members.map((m) => ({ email: m.email, roles: m.roles, active: m.isActive }))
  },
  'GET /api/v1/work-orders/:id': async (ctx, deps, args) => {
    const { id } = getWorkOrderArgs.parse(args)
    return (await getWorkOrder(ctx, id, buildWorkOrderDeps(deps.db, 'agent'))) ?? { error: 'not_found' }
  },
  'POST /api/v1/work-orders': async (ctx, deps, args) => {
    const result = await createWorkOrder(ctx, createWorkOrderArgs.parse(args), buildWorkOrderDeps(deps.db, 'agent'))
    return result.ok ? result.value : { error: result.error.kind }
  },
  'POST /api/v1/work-orders/:id/transitions': async (ctx, deps, args) => {
    const a = transitionWorkOrderArgs.parse(args)
    const result = await transitionWorkOrder(ctx, { workOrderId: a.id, transition: a.transition, expectedVersion: a.expectedVersion, eventId: a.idempotencyKey ?? crypto.randomUUID() }, buildWorkOrderDeps(deps.db, 'agent'))
    return result.ok ? result.value : { error: result.error.kind }
  },
  'GET /api/v1/timesheets/:id': async (ctx, deps, args) => {
    const { id } = getTimesheetArgs.parse(args)
    return (await getTimesheet(ctx, id, buildTimesheetDeps(deps.db, 'agent'))) ?? { error: 'not_found' }
  },
  'POST /api/v1/timesheets': async (ctx, deps, args) => {
    const result = await createTimesheet(ctx, createTimesheetArgs.parse(args), buildTimesheetDeps(deps.db, 'agent'))
    return result.ok ? result.value : { error: result.error.kind }
  },
  'POST /api/v1/timesheets/:id/submit': tsAction('submit'),
  'POST /api/v1/timesheets/:id/approve': tsAction('approve'),
  'POST /api/v1/timesheets/:id/reject': tsAction('reject'),
  'POST /api/v1/timesheets/:id/revise': tsAction('revise'),
  'POST /api/v1/work-orders/:id/link-po': async (ctx, deps, args) => {
    const a = linkPoArgs.parse(args)
    const result = await linkPurchaseOrder(ctx, { workOrderId: a.id, poCode: a.poCode, expectedVersion: a.expectedVersion, eventId: a.idempotencyKey ?? crypto.randomUUID() }, buildErpDeps(deps.db, 'agent'))
    return result.ok ? result.value : { error: result.error.kind }
  },
  'POST /api/v1/timesheets/:id/book': async (ctx, deps, args) => {
    const a = bookArgs.parse(args)
    const result = await bookTimesheet(ctx, { timesheetId: a.id, expectedVersion: a.expectedVersion, eventId: a.idempotencyKey ?? crypto.randomUUID() }, buildErpDeps(deps.db, 'agent'))
    return result.ok ? result.value : { error: result.error.kind }
  },
  'GET /api/v1/vendors/:id': async (ctx, deps, args) => {
    const { id } = getVendorArgs.parse(args)
    return (await getVendor(ctx, id, buildStaffingDeps(deps.db, 'agent'))) ?? { error: 'not_found' }
  },
  'POST /api/v1/vendors': async (ctx, deps, args) => {
    const result = await createVendor(ctx, createVendorArgs.parse(args), buildStaffingDeps(deps.db, 'agent'))
    return result.ok ? result.value : { error: result.error.kind }
  },
  'GET /api/v1/workers/:id': async (ctx, deps, args) => {
    const { id } = getWorkerArgs.parse(args)
    return (await getWorker(ctx, id, buildStaffingDeps(deps.db, 'agent'))) ?? { error: 'not_found' }
  },
  'POST /api/v1/workers': async (ctx, deps, args) => {
    const result = await createWorker(ctx, createWorkerArgs.parse(args), buildStaffingDeps(deps.db, 'agent'))
    return result.ok ? result.value : { error: result.error.kind }
  },
  'POST /api/v1/assignments': async (ctx, deps, args) => {
    const result = await createAssignment(ctx, createAssignmentArgs.parse(args), buildStaffingDeps(deps.db, 'agent'))
    return result.ok ? result.value : { error: result.error.kind }
  },
  'POST /api/v1/assignments/:id/end': async (ctx, deps, args) => {
    const a = endAssignmentArgs.parse(args)
    const result = await endAssignment(ctx, { assignmentId: a.id, expectedVersion: a.expectedVersion, eventId: a.idempotencyKey ?? crypto.randomUUID(), ...(a.endReason ? { endReason: a.endReason } : {}) }, buildStaffingDeps(deps.db, 'agent'))
    return result.ok ? result.value : { error: result.error.kind }
  },
}

// whoami is the one tool with no HTTP route — authenticated-only, no args.
const whoami: McpTool = {
  name: 'whoami',
  description: "Return the calling agent's resolved identity, tenant and roles.",
  inputSchema: { type: 'object', properties: {} },
  run: async (ctx) => ({ userId: ctx.userId, tenantId: ctx.tenantId, roles: ctx.roles, activeRole: ctx.activeRole, actorKind: 'agent' }),
}

// Tools are PROJECTIONS of the capability registry: name/description/inputSchema
// all derive from the capability; only the run handler is hand-written.
const routedTools: McpTool[] = CAPABILITIES.flatMap((cap) => {
  const run = cap.mcp ? RUN[cap.route] : undefined
  if (!cap.mcp || !run) return []
  return [{ name: cap.mcp.name, description: cap.mcp.description, inputSchema: toJsonSchema(cap.mcp.args), route: cap.route, run }]
})

export const TOOLS: readonly McpTool[] = [whoami, ...routedTools]

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
      return ok(id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) })
    case 'tools/call':
      return callTool(id, req.params ?? {}, ctx, deps)
    default:
      return fail(id, -32601, `Method not found: ${req.method}`)
  }
}

// Authorize from the SAME RBAC_POLICY the HTTP wall uses (one SSOT), plus the
// read/write scope derived from the route's method.
function authorizeTool(tool: McpTool, ctx: SessionContext): string | null {
  if (!tool.route) return null
  const [method, path] = tool.route.split(' ')
  if (!method || !path) return `misconfigured tool route: ${tool.route}`
  const decision = decideRbac(policyFor(method, path), { authenticated: true, roles: ctx.roles })
  if (decision.kind !== 'allow') return `Forbidden: ${tool.name} (${tool.route})`
  const need: 'read' | 'write' = method === 'GET' ? 'read' : 'write'
  if (!scopeGrants(ctx.tokenScopes, need)) return `Forbidden: ${tool.name} requires scope '${need}'`
  return null
}

async function callTool(
  id: JsonRpcResponse['id'],
  params: Record<string, unknown>,
  ctx: SessionContext,
  deps: McpDeps,
): Promise<JsonRpcResponse> {
  const tool = TOOLS.find((t) => t.name === params.name)
  if (!tool) return fail(id, -32602, `Unknown tool: ${String(params.name)}`)
  const denied = authorizeTool(tool, ctx)
  if (denied) return toolText(id, { error: denied }, true)
  const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {}
  try {
    return toolText(id, await tool.run(ctx, deps, args))
  } catch (err) {
    if (err instanceof ZodError) return toolText(id, { error: 'invalid arguments', details: err.flatten() }, true)
    logger.error('mcp.tool_failed', { tool: tool.name, ...serializeError(err) })
    return toolText(id, { error: 'tool execution failed' }, true)
  }
}
