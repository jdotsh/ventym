import { z } from 'zod'
import { createWorkOrderSchema, transitionWorkOrderBodySchema } from '@/services/workOrder/schema'
import { createTimesheetSchema, transitionTimesheetSchema } from '@/services/timesheet/schema'
import { bookSchema, linkPoSchema } from '@/services/erp/schema'
import { createAssignmentSchema, createVendorSchema, createWorkerSchema, transitionAssignmentSchema } from '@/services/staffing/schema'

/**
 * The capability registry — ONE row per capability, joined to RBAC_POLICY by route.
 * `input` is the HTTP request BODY (the single source of truth). The three faces
 * project from it: the route handler parses it, OpenAPI documents it as a request
 * body, and the MCP tool advertises `args` (the body composed with the path-param
 * id + an idempotency key, since MCP flattens what HTTP splits). No face restates
 * a schema, so the advertised contract can no longer lie. (Output schemas are
 * intentionally absent — they would mirror Drizzle rows and reintroduce drift;
 * derive them from the tables with drizzle-zod when needed.)
 */
export type Capability = {
  route: string // 'METHOD /path' — must exist in RBAC_POLICY
  summary: string
  input: z.ZodTypeAny // the HTTP body (empty object ⇒ no body, e.g. a GET)
  mcp?: { name: string; description: string; args: z.ZodTypeAny } // present ⇒ also a governed tool
}

const EMPTY = z.object({})
const idOnly = z.object({ id: z.string().uuid() })
const idemKey = { idempotencyKey: z.string().optional() } as const
// MCP args for a mutating, id-addressed route: the body + the path id + the key.
const action = <T extends z.ZodRawShape>(body: z.ZodObject<T>) => idOnly.merge(body).extend(idemKey)

// Exported MCP-args schemas — referenced by BOTH the advertised inputSchema and
// the run handlers, so the two cannot diverge.
export const getWorkOrderArgs = idOnly
export const createWorkOrderArgs = createWorkOrderSchema
export const transitionWorkOrderArgs = action(transitionWorkOrderBodySchema)
export const getTimesheetArgs = idOnly
export const createTimesheetArgs = createTimesheetSchema
export const timesheetActionArgs = action(transitionTimesheetSchema)
export const linkPoArgs = action(linkPoSchema)
export const bookArgs = action(bookSchema)
export const getVendorArgs = idOnly
export const createVendorArgs = createVendorSchema
export const getWorkerArgs = idOnly
export const createWorkerArgs = createWorkerSchema
export const createAssignmentArgs = createAssignmentSchema
export const endAssignmentArgs = action(transitionAssignmentSchema)

export const CAPABILITIES: readonly Capability[] = [
  { route: 'GET /admin/users', summary: 'List tenant members', input: EMPTY, mcp: { name: 'list_members', description: 'List the members of the tenant and their roles.', args: EMPTY } },
  { route: 'GET /api/v1/work-orders/:id', summary: 'Fetch a work order', input: EMPTY, mcp: { name: 'get_work_order', description: 'Fetch a work order by id (tenant-scoped).', args: getWorkOrderArgs } },
  { route: 'POST /api/v1/work-orders', summary: 'Create a draft work order', input: createWorkOrderSchema, mcp: { name: 'create_work_order', description: 'Create a draft work order with lines.', args: createWorkOrderArgs } },
  { route: 'POST /api/v1/work-orders/:id/transitions', summary: 'Transition a work order', input: transitionWorkOrderBodySchema, mcp: { name: 'transition_work_order', description: 'Apply a lifecycle transition to a work order.', args: transitionWorkOrderArgs } },
  { route: 'GET /api/v1/timesheets/:id', summary: 'Fetch a timesheet', input: EMPTY, mcp: { name: 'get_timesheet', description: 'Fetch a timesheet by id (tenant-scoped).', args: getTimesheetArgs } },
  { route: 'POST /api/v1/timesheets', summary: 'Create a draft timesheet', input: createTimesheetSchema, mcp: { name: 'create_timesheet', description: 'Create a draft timesheet for a work order line.', args: createTimesheetArgs } },
  { route: 'POST /api/v1/timesheets/:id/submit', summary: 'Submit a timesheet', input: transitionTimesheetSchema, mcp: { name: 'submit_timesheet', description: 'Submit a timesheet for approval.', args: timesheetActionArgs } },
  { route: 'POST /api/v1/timesheets/:id/approve', summary: 'Approve a timesheet', input: transitionTimesheetSchema, mcp: { name: 'approve_timesheet', description: 'Approve a timesheet (SoD: approver ≠ submitter).', args: timesheetActionArgs } },
  { route: 'POST /api/v1/timesheets/:id/reject', summary: 'Reject a timesheet', input: transitionTimesheetSchema, mcp: { name: 'reject_timesheet', description: 'Reject a timesheet (reason required).', args: timesheetActionArgs } },
  { route: 'POST /api/v1/timesheets/:id/revise', summary: 'Revise a rejected timesheet', input: transitionTimesheetSchema, mcp: { name: 'revise_timesheet', description: 'Reopen a rejected timesheet for revision.', args: timesheetActionArgs } },
  { route: 'POST /api/v1/work-orders/:id/link-po', summary: 'Link a PO to a work order', input: linkPoSchema, mcp: { name: 'link_purchase_order', description: 'Link a PO to a work order (ERP-link UNLINKED→LINKED).', args: linkPoArgs } },
  { route: 'POST /api/v1/timesheets/:id/book', summary: 'Book a timesheet to ERP', input: bookSchema, mcp: { name: 'book_timesheet', description: 'Book an APPROVED timesheet to ERP (gated on the WO being LINKED).', args: bookArgs } },
  { route: 'GET /api/v1/vendors/:id', summary: 'Fetch a vendor', input: EMPTY, mcp: { name: 'get_vendor', description: 'Fetch a vendor by id (tenant-scoped).', args: getVendorArgs } },
  { route: 'POST /api/v1/vendors', summary: 'Onboard a vendor', input: createVendorSchema, mcp: { name: 'create_vendor', description: 'Onboard a vendor (supplier org).', args: createVendorArgs } },
  { route: 'GET /api/v1/workers/:id', summary: 'Fetch a worker', input: EMPTY, mcp: { name: 'get_worker', description: "Fetch a worker; the person's name/email is resolved in-tenant.", args: getWorkerArgs } },
  { route: 'POST /api/v1/workers', summary: 'Create a worker', input: createWorkerSchema, mcp: { name: 'create_worker', description: 'Create a worker under a vendor (person-PII isolated to the sensitive schema).', args: createWorkerArgs } },
  { route: 'POST /api/v1/assignments', summary: 'Assign a worker to a WO line', input: createAssignmentSchema, mcp: { name: 'create_assignment', description: 'Assign a worker to a work order line (enforces the I6 capacity cap).', args: createAssignmentArgs } },
  { route: 'POST /api/v1/assignments/:id/end', summary: 'End an assignment', input: transitionAssignmentSchema, mcp: { name: 'end_assignment', description: 'End an assignment (PENDING/ACTIVE → ENDED with a reason).', args: endAssignmentArgs } },
]

export function capabilityByName(name: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.mcp?.name === name)
}
