import { z, ZodError } from 'zod'
import type { Database } from '../../../config/db'
import type { SessionContext } from '@/services/identity/service'
import type { WorkosClient } from '@/tools/workos/client'
import { decideRbac, policyFor } from '@/config/rbacPolicy'
import { logger, serializeError } from '@/utils/logger'
import { buildAdminDeps } from '@/services/admin/deps'
import { listMembers } from '@/services/admin/service'
import { buildWorkOrderDeps } from '@/services/workOrder/deps'
import { createWorkOrder, getWorkOrder, transitionWorkOrder } from '@/services/workOrder/service'
import { createWorkOrderSchema } from '@/services/workOrder/schema'
import { WO_TRANSITIONS } from '@/services/workOrder/machine'
import { buildTimesheetDeps } from '@/services/timesheet/deps'
import { createTimesheet, getTimesheet, transitionTimesheet } from '@/services/timesheet/service'
import { createTimesheetSchema } from '@/services/timesheet/schema'
import type { TimesheetTransition } from '@/services/timesheet/machine'
import { buildErpDeps } from '@/services/erp/deps'
import { bookTimesheet, linkPurchaseOrder } from '@/services/erp/service'

// Minimal MCP over JSON-RPC 2.0 (Streamable HTTP). Stateless: one request → one
// response. Covers initialize / tools.list / tools.call — a governed agent
// surface without a Durable Object.
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

// A tool runs with the AGENT's SessionContext. `route` is the HTTP route it
// mirrors — its RBAC and read/write scope DERIVE from RBAC_POLICY (one SSOT, so
// the API and MCP faces cannot disagree; gate:mcp asserts the route exists). A
// tool with no route is authenticated-only (e.g. whoami).
export type McpTool = {
  name: string
  description: string
  inputSchema: object
  route?: string // 'METHOD /path' — must be present in RBAC_POLICY
  run(ctx: SessionContext, deps: McpDeps, args: unknown): Promise<unknown>
}

// A scoped token narrows what its agent may do; an unscoped token (no `scope`
// claim) is full delegation. 'write' implies 'read'.
function scopeGrants(tokenScopes: readonly string[] | undefined, need: 'read' | 'write'): boolean {
  if (!tokenScopes || tokenScopes.length === 0) return true
  const has = (cap: string) => tokenScopes.some((s) => s === cap || s === `vms:${cap}` || s.endsWith(`:${cap}`))
  return need === 'read' ? has('read') || has('write') : has('write')
}

const NO_ARGS = { type: 'object', properties: {} } as const

const woTransitionArgs = z.object({
  id: z.string().uuid(),
  transition: z.enum(WO_TRANSITIONS),
  expectedVersion: z.number().int().min(1),
  idempotencyKey: z.string().optional(),
})

const tsActionArgs = z.object({
  id: z.string().uuid(),
  expectedVersion: z.number().int().min(1),
  reason: z.string().optional(),
  idempotencyKey: z.string().optional(),
})

// Per-action timesheet tool — 1:1 with the REST action route, so RBAC is single-sourced.
function timesheetTransitionTool(name: string, transition: TimesheetTransition, route: string): McpTool {
  return {
    name,
    route,
    description: `${transition} a timesheet (governed by ${route}).`,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, expectedVersion: { type: 'integer' }, reason: { type: 'string' }, idempotencyKey: { type: 'string' } },
      required: ['id', 'expectedVersion'],
    },
    run: async (ctx, deps, args) => {
      const a = tsActionArgs.parse(args)
      const result = await transitionTimesheet(
        ctx,
        { timesheetId: a.id, transition, expectedVersion: a.expectedVersion, eventId: a.idempotencyKey ?? crypto.randomUUID(), ...(a.reason ? { reason: a.reason } : {}) },
        buildTimesheetDeps(deps.db, 'agent'),
      )
      return result.ok ? result.value : { error: result.error.kind }
    },
  }
}

export const TOOLS: readonly McpTool[] = [
  {
    name: 'whoami',
    description: "Return the calling agent's resolved identity, tenant and roles.",
    inputSchema: NO_ARGS,
    run: async (ctx) => ({ userId: ctx.userId, tenantId: ctx.tenantId, roles: ctx.roles, activeRole: ctx.activeRole, actorKind: 'agent' }),
  },
  {
    name: 'list_members',
    description: 'List the members of the tenant and their roles.',
    inputSchema: NO_ARGS,
    route: 'GET /admin/users',
    run: async (ctx, deps) => {
      const members = await listMembers(
        { tenantId: ctx.tenantId, userId: ctx.userId, sessionId: ctx.sessionId },
        buildAdminDeps(deps.db, deps.workos),
      )
      return members.map((m) => ({ email: m.email, roles: m.roles, active: m.isActive }))
    },
  },
  {
    name: 'get_work_order',
    description: 'Fetch a work order by id (tenant-scoped).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    route: 'GET /api/v1/work-orders/:id',
    run: async (ctx, deps, args) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(args)
      const wo = await getWorkOrder(ctx, id, buildWorkOrderDeps(deps.db, 'agent'))
      return wo ?? { error: 'not_found' }
    },
  },
  {
    name: 'create_work_order',
    description: 'Create a draft work order with lines.',
    inputSchema: { type: 'object', properties: { code: { type: 'string' }, lines: { type: 'array' } }, required: ['code', 'lines'] },
    route: 'POST /api/v1/work-orders',
    run: async (ctx, deps, args) => {
      const input = createWorkOrderSchema.parse(args)
      const result = await createWorkOrder(ctx, input, buildWorkOrderDeps(deps.db, 'agent'))
      return result.ok ? result.value : { error: result.error.kind }
    },
  },
  {
    name: 'transition_work_order',
    description: 'Apply a lifecycle transition to a work order.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, transition: { type: 'string', enum: WO_TRANSITIONS }, expectedVersion: { type: 'integer' }, idempotencyKey: { type: 'string' } },
      required: ['id', 'transition', 'expectedVersion'],
    },
    route: 'POST /api/v1/work-orders/:id/transitions',
    run: async (ctx, deps, args) => {
      const a = woTransitionArgs.parse(args)
      const result = await transitionWorkOrder(
        ctx,
        { workOrderId: a.id, transition: a.transition, expectedVersion: a.expectedVersion, eventId: a.idempotencyKey ?? crypto.randomUUID() },
        buildWorkOrderDeps(deps.db, 'agent'),
      )
      return result.ok ? result.value : { error: result.error.kind }
    },
  },
  {
    name: 'get_timesheet',
    description: 'Fetch a timesheet by id (tenant-scoped).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    route: 'GET /api/v1/timesheets/:id',
    run: async (ctx, deps, args) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(args)
      const ts = await getTimesheet(ctx, id, buildTimesheetDeps(deps.db, 'agent'))
      return ts ?? { error: 'not_found' }
    },
  },
  {
    name: 'create_timesheet',
    description: 'Create a draft timesheet for a work order line.',
    inputSchema: {
      type: 'object',
      properties: { workOrderLineId: { type: 'string' }, periodStart: { type: 'string' }, periodEnd: { type: 'string' }, lines: { type: 'array' } },
      required: ['workOrderLineId', 'periodStart', 'periodEnd', 'lines'],
    },
    route: 'POST /api/v1/timesheets',
    run: async (ctx, deps, args) => {
      const input = createTimesheetSchema.parse(args)
      const result = await createTimesheet(ctx, input, buildTimesheetDeps(deps.db, 'agent'))
      return result.ok ? result.value : { error: result.error.kind }
    },
  },
  timesheetTransitionTool('submit_timesheet', 'submit', 'POST /api/v1/timesheets/:id/submit'),
  timesheetTransitionTool('approve_timesheet', 'approve', 'POST /api/v1/timesheets/:id/approve'),
  timesheetTransitionTool('reject_timesheet', 'reject', 'POST /api/v1/timesheets/:id/reject'),
  timesheetTransitionTool('revise_timesheet', 'revise', 'POST /api/v1/timesheets/:id/revise'),
  {
    name: 'link_purchase_order',
    description: 'Link a PO to a work order (ERP-link UNLINKED→LINKED).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, poCode: { type: 'string' }, expectedVersion: { type: 'integer' }, idempotencyKey: { type: 'string' } },
      required: ['id', 'poCode', 'expectedVersion'],
    },
    route: 'POST /api/v1/work-orders/:id/link-po',
    run: async (ctx, deps, args) => {
      const a = z.object({ id: z.string().uuid(), poCode: z.string().min(1).max(100), expectedVersion: z.number().int().min(1), idempotencyKey: z.string().optional() }).parse(args)
      const result = await linkPurchaseOrder(
        ctx,
        { workOrderId: a.id, poCode: a.poCode, expectedVersion: a.expectedVersion, eventId: a.idempotencyKey ?? crypto.randomUUID() },
        buildErpDeps(deps.db, 'agent'),
      )
      return result.ok ? result.value : { error: result.error.kind }
    },
  },
  {
    name: 'book_timesheet',
    description: 'Book an APPROVED timesheet to ERP (gated on the WO being LINKED).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, expectedVersion: { type: 'integer' }, idempotencyKey: { type: 'string' } },
      required: ['id', 'expectedVersion'],
    },
    route: 'POST /api/v1/timesheets/:id/book',
    run: async (ctx, deps, args) => {
      const a = z.object({ id: z.string().uuid(), expectedVersion: z.number().int().min(1), idempotencyKey: z.string().optional() }).parse(args)
      const result = await bookTimesheet(
        ctx,
        { timesheetId: a.id, expectedVersion: a.expectedVersion, eventId: a.idempotencyKey ?? crypto.randomUUID() },
        buildErpDeps(deps.db, 'agent'),
      )
      return result.ok ? result.value : { error: result.error.kind }
    },
  },
]

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

// Authorize a tool from the SAME RBAC_POLICY the HTTP wall uses (one SSOT), plus
// the read/write scope derived from the route's method. Returns an error string
// when denied, else null.
function authorizeTool(tool: McpTool, ctx: SessionContext): string | null {
  if (!tool.route) return null // authenticated-only (the agent is already authenticated)
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
    // Boundary redaction (matches the API): validation detail is the agent's own
    // input (safe); anything else is logged with the trace and returned generic.
    if (err instanceof ZodError) return toolText(id, { error: 'invalid arguments', details: err.flatten() }, true)
    logger.error('mcp.tool_failed', { tool: tool.name, ...serializeError(err) })
    return toolText(id, { error: 'tool execution failed' }, true)
  }
}
