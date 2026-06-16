import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import type { Database } from '../../../config/db'
import type { SessionContext } from '@/services/identity/service'
import type { WorkosClient } from '@/tools/workos/client'
import { resolveError, type DomainCode } from '@/types/errorRegistry'
import type { Result } from '@/utils/result'
import { workOrderErrorCode } from '@/services/workOrder/httpError'
import { timesheetErrorCode } from '@/services/timesheet/httpError'
import { erpErrorCode } from '@/services/erp/httpError'
import { staffingErrorCode } from '@/services/staffing/httpError'
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

export type McpDeps = { db: Database; workos: WorkosClient }

// A tool runs with the AGENT's SessionContext. `route` joins to RBAC_POLICY (RBAC
// + read/write scope derive from it) and to the capability registry (the input
// schema is generated from the capability's Zod — never hand-written).
export type McpTool = {
  name: string
  description: string
  inputSchema: object
  route?: string
  run(ctx: SessionContext, deps: McpDeps, args: unknown): Promise<unknown>
}

type McpRun = McpTool['run']

const toJsonSchema = (schema: z.ZodTypeAny): object => zodToJsonSchema(schema, { $refStrategy: 'none' })

// Agent-actionable error contract. A run handler throws ToolError(domainCode) for a
// domain/precondition failure; callTool turns it into a structured tool result
// { code, grpc, message, retryable } — single-sourced from the error registry, so an
// agent gets the SAME retry semantics it would over HTTP (retry CONFLICT/UNAVAILABLE,
// stop on FORBIDDEN/precondition).
export class ToolError extends Error {
  constructor(
    readonly code: DomainCode,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'ToolError'
  }
}

export function toolErrorBody(code: DomainCode, message?: string, details?: unknown): { error: Record<string, unknown> } {
  const e = resolveError(code)
  return {
    error: { code: e.domain, grpc: e.grpc, message: message ?? e.description, retryable: e.retryable, ...(details ? { details } : {}) },
  }
}

// Unwrap a service Result for a tool: value on success, ToolError on failure.
function unwrap<T, E>(result: Result<T, E>, mapErr: (error: E) => DomainCode): T {
  if (result.ok) return result.value
  throw new ToolError(mapErr(result.error))
}

export const isReadOnly = (tool: McpTool): boolean => !tool.route || tool.route.startsWith('GET ')

// ── Run handlers (the only hand-written per-capability code — the service wiring).
// Each parses the capability's args schema, so validation can't diverge from the
// advertised inputSchema (both derive from the same Zod).
const tsAction = (transition: TimesheetTransition): McpRun => async (ctx, deps, args) => {
  const a = timesheetActionArgs.parse(args)
  return unwrap(
    await transitionTimesheet(
      ctx,
      { timesheetId: a.id, transition, expectedVersion: a.expectedVersion, eventId: a.idempotencyKey ?? crypto.randomUUID(), ...(a.reason ? { reason: a.reason } : {}) },
      buildTimesheetDeps(deps.db, 'agent'),
    ),
    timesheetErrorCode,
  )
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
    const wo = await getWorkOrder(ctx, id, buildWorkOrderDeps(deps.db, 'agent'))
    if (!wo) throw new ToolError('WO_NOT_FOUND')
    return wo
  },
  'POST /api/v1/work-orders': async (ctx, deps, args) =>
    unwrap(await createWorkOrder(ctx, createWorkOrderArgs.parse(args), buildWorkOrderDeps(deps.db, 'agent')), workOrderErrorCode),
  'POST /api/v1/work-orders/:id/transitions': async (ctx, deps, args) => {
    const a = transitionWorkOrderArgs.parse(args)
    return unwrap(
      await transitionWorkOrder(ctx, { workOrderId: a.id, transition: a.transition, expectedVersion: a.expectedVersion, eventId: a.idempotencyKey ?? crypto.randomUUID() }, buildWorkOrderDeps(deps.db, 'agent')),
      workOrderErrorCode,
    )
  },
  'GET /api/v1/timesheets/:id': async (ctx, deps, args) => {
    const { id } = getTimesheetArgs.parse(args)
    const ts = await getTimesheet(ctx, id, buildTimesheetDeps(deps.db, 'agent'))
    if (!ts) throw new ToolError('TS_NOT_FOUND')
    return ts
  },
  'POST /api/v1/timesheets': async (ctx, deps, args) =>
    unwrap(await createTimesheet(ctx, createTimesheetArgs.parse(args), buildTimesheetDeps(deps.db, 'agent')), timesheetErrorCode),
  'POST /api/v1/timesheets/:id/submit': tsAction('submit'),
  'POST /api/v1/timesheets/:id/approve': tsAction('approve'),
  'POST /api/v1/timesheets/:id/reject': tsAction('reject'),
  'POST /api/v1/timesheets/:id/revise': tsAction('revise'),
  'POST /api/v1/work-orders/:id/link-po': async (ctx, deps, args) => {
    const a = linkPoArgs.parse(args)
    return unwrap(
      await linkPurchaseOrder(ctx, { workOrderId: a.id, poCode: a.poCode, expectedVersion: a.expectedVersion, eventId: a.idempotencyKey ?? crypto.randomUUID() }, buildErpDeps(deps.db, 'agent')),
      erpErrorCode,
    )
  },
  'POST /api/v1/timesheets/:id/book': async (ctx, deps, args) => {
    const a = bookArgs.parse(args)
    return unwrap(
      await bookTimesheet(ctx, { timesheetId: a.id, expectedVersion: a.expectedVersion, eventId: a.idempotencyKey ?? crypto.randomUUID() }, buildErpDeps(deps.db, 'agent')),
      erpErrorCode,
    )
  },
  'GET /api/v1/vendors/:id': async (ctx, deps, args) => {
    const { id } = getVendorArgs.parse(args)
    const vendor = await getVendor(ctx, id, buildStaffingDeps(deps.db, 'agent'))
    if (!vendor) throw new ToolError('VENDOR_NOT_FOUND')
    return vendor
  },
  'POST /api/v1/vendors': async (ctx, deps, args) =>
    unwrap(await createVendor(ctx, createVendorArgs.parse(args), buildStaffingDeps(deps.db, 'agent')), staffingErrorCode),
  'GET /api/v1/workers/:id': async (ctx, deps, args) => {
    const { id } = getWorkerArgs.parse(args)
    const worker = await getWorker(ctx, id, buildStaffingDeps(deps.db, 'agent'))
    if (!worker) throw new ToolError('WORKER_NOT_FOUND')
    return worker
  },
  'POST /api/v1/workers': async (ctx, deps, args) =>
    unwrap(await createWorker(ctx, createWorkerArgs.parse(args), buildStaffingDeps(deps.db, 'agent')), staffingErrorCode),
  'POST /api/v1/assignments': async (ctx, deps, args) =>
    unwrap(await createAssignment(ctx, createAssignmentArgs.parse(args), buildStaffingDeps(deps.db, 'agent')), staffingErrorCode),
  'POST /api/v1/assignments/:id/end': async (ctx, deps, args) => {
    const a = endAssignmentArgs.parse(args)
    return unwrap(
      await endAssignment(ctx, { assignmentId: a.id, expectedVersion: a.expectedVersion, eventId: a.idempotencyKey ?? crypto.randomUUID(), ...(a.endReason ? { endReason: a.endReason } : {}) }, buildStaffingDeps(deps.db, 'agent')),
      staffingErrorCode,
    )
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
