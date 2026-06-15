import { z } from 'zod'
import type { Database } from '../../../config/db'
import type { TenantRole } from '../../../db/schema'
import type { SessionContext } from '@/services/identity/service'
import type { WorkosClient } from '@/tools/workos/client'
import { buildAdminDeps } from '@/services/admin/deps'
import { listMembers } from '@/services/admin/service'
import { buildWorkOrderDeps } from '@/services/workOrder/deps'
import { createWorkOrder, getWorkOrder, transitionWorkOrder } from '@/services/workOrder/service'
import { createWorkOrderSchema } from '@/services/workOrder/schema'
import { WO_TRANSITIONS } from '@/services/workOrder/machine'
import { buildTimesheetDeps } from '@/services/timesheet/deps'
import { createTimesheet, getTimesheet, transitionTimesheet } from '@/services/timesheet/service'
import { createTimesheetSchema } from '@/services/timesheet/schema'
import { TIMESHEET_TRANSITIONS } from '@/services/timesheet/machine'
import { buildErpDeps } from '@/services/erp/deps'
import { bookTimesheet, linkPurchaseOrder } from '@/services/erp/service'

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
// who authorized it. `requiredRole` is the per-tool RBAC gate. `args` are the raw
// tool arguments; each tool validates them with Zod (boundary validation).
type McpTool = {
  name: string
  description: string
  inputSchema: object
  requiredRole?: TenantRole // role the agent must hold (feed-only RBAC)
  scope?: 'read' | 'write' // OAuth capability the token must grant (least-privilege)
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

const transitionArgsSchema = z.object({
  id: z.string().uuid(),
  transition: z.enum(WO_TRANSITIONS),
  expectedVersion: z.number().int().min(1),
  idempotencyKey: z.string().optional(),
})

const tsTransitionArgsSchema = z.object({
  id: z.string().uuid(),
  transition: z.enum(TIMESHEET_TRANSITIONS),
  expectedVersion: z.number().int().min(1),
  reason: z.string().optional(),
  idempotencyKey: z.string().optional(),
})

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
    scope: 'read',
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
    scope: 'read',
    run: async (ctx, deps, args) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(args)
      const wo = await getWorkOrder(ctx, id, buildWorkOrderDeps(deps.db, 'agent'))
      return wo ?? { error: 'not_found' }
    },
  },
  {
    name: 'create_work_order',
    description: 'Create a draft work order with lines. Requires MANAGER.',
    inputSchema: { type: 'object', properties: { code: { type: 'string' }, lines: { type: 'array' } }, required: ['code', 'lines'] },
    requiredRole: 'MANAGER',
    scope: 'write',
    run: async (ctx, deps, args) => {
      const input = createWorkOrderSchema.parse(args)
      const result = await createWorkOrder(ctx, input, buildWorkOrderDeps(deps.db, 'agent'))
      return result.ok ? result.value : { error: result.error.kind }
    },
  },
  {
    name: 'transition_work_order',
    description: 'Apply a lifecycle transition to a work order. Requires MANAGER.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        transition: { type: 'string', enum: WO_TRANSITIONS },
        expectedVersion: { type: 'integer' },
        idempotencyKey: { type: 'string' },
      },
      required: ['id', 'transition', 'expectedVersion'],
    },
    requiredRole: 'MANAGER',
    scope: 'write',
    run: async (ctx, deps, args) => {
      const a = transitionArgsSchema.parse(args)
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
    scope: 'read',
    run: async (ctx, deps, args) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(args)
      const ts = await getTimesheet(ctx, id, buildTimesheetDeps(deps.db, 'agent'))
      return ts ?? { error: 'not_found' }
    },
  },
  {
    name: 'create_timesheet',
    description: 'Create a draft timesheet for a work order line. Requires MANAGER.',
    inputSchema: {
      type: 'object',
      properties: { workOrderLineId: { type: 'string' }, periodStart: { type: 'string' }, periodEnd: { type: 'string' }, lines: { type: 'array' } },
      required: ['workOrderLineId', 'periodStart', 'periodEnd', 'lines'],
    },
    requiredRole: 'MANAGER',
    scope: 'write',
    run: async (ctx, deps, args) => {
      const input = createTimesheetSchema.parse(args)
      const result = await createTimesheet(ctx, input, buildTimesheetDeps(deps.db, 'agent'))
      return result.ok ? result.value : { error: result.error.kind }
    },
  },
  {
    name: 'transition_timesheet',
    description: 'Submit/approve/reject/revise a timesheet. Requires MANAGER. SoD: approver ≠ submitter.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        transition: { type: 'string', enum: TIMESHEET_TRANSITIONS },
        expectedVersion: { type: 'integer' },
        reason: { type: 'string' },
        idempotencyKey: { type: 'string' },
      },
      required: ['id', 'transition', 'expectedVersion'],
    },
    requiredRole: 'MANAGER',
    scope: 'write',
    run: async (ctx, deps, args) => {
      const a = tsTransitionArgsSchema.parse(args)
      const result = await transitionTimesheet(
        ctx,
        {
          timesheetId: a.id,
          transition: a.transition,
          expectedVersion: a.expectedVersion,
          eventId: a.idempotencyKey ?? crypto.randomUUID(),
          ...(a.reason ? { reason: a.reason } : {}),
        },
        buildTimesheetDeps(deps.db, 'agent'),
      )
      return result.ok ? result.value : { error: result.error.kind }
    },
  },
  {
    name: 'link_purchase_order',
    description: 'Link a PO to a work order (ERP-link UNLINKED→LINKED). Requires MANAGER.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, poCode: { type: 'string' }, expectedVersion: { type: 'integer' }, idempotencyKey: { type: 'string' } },
      required: ['id', 'poCode', 'expectedVersion'],
    },
    requiredRole: 'MANAGER',
    scope: 'write',
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
    description: 'Book an APPROVED timesheet to ERP (gated on the WO being LINKED). Requires MANAGER.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, expectedVersion: { type: 'integer' }, idempotencyKey: { type: 'string' } },
      required: ['id', 'expectedVersion'],
    },
    requiredRole: 'MANAGER',
    scope: 'write',
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
  // Least-privilege: a scoped token must grant the tool's capability.
  if (tool.scope && !scopeGrants(ctx.tokenScopes, tool.scope)) {
    return toolText(id, { error: `Forbidden: ${tool.name} requires scope '${tool.scope}'` }, true)
  }
  const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {}
  try {
    return toolText(id, await tool.run(ctx, deps, args))
  } catch (err) {
    // Surface Zod/validation errors as a tool error, not a transport crash.
    return toolText(id, { error: err instanceof Error ? err.message : String(err) }, true)
  }
}
