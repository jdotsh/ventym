import type { Database, TenantScope } from '../../../config/db'
import type { ActorKind, AssignmentRow, VendorRow } from '../../../db/schema'
import type { StaffingRepo, WorkerListItem, WorkerWithPii } from '@/tools/db/staffingRepo'
import { err, ok, type Result } from '@/utils/result'
import type { SessionContext } from '@/services/identity/service'
import { nextStatus } from './machine'
import type { CreateAssignmentInput, CreateVendorInput, CreateWorkerInput, StaffingError } from './schema'

export type StaffingDeps = {
  repo: StaffingRepo
  withTenantScope: <T>(scope: TenantScope, fn: (tx: Database) => Promise<T>) => Promise<T>
  uuid: () => string
  now: () => Date
  actorKind: ActorKind
}

const scopeOf = (ctx: SessionContext): TenantScope => ({
  tenantId: ctx.tenantId,
  userId: ctx.userId,
  sessionId: ctx.sessionId,
})

const actor = (ctx: SessionContext, deps: StaffingDeps) => ({
  actorKind: deps.actorKind,
  actorUserId: ctx.userId,
  actorSessionId: ctx.sessionId,
})

// ── Vendor ──────────────────────────────────────────────────────────────────
export async function createVendor(
  ctx: SessionContext,
  input: CreateVendorInput,
  deps: StaffingDeps,
): Promise<Result<VendorRow, StaffingError>> {
  return deps.withTenantScope(scopeOf(ctx), async (tx) => {
    const created = await deps.repo.insertVendor(tx, {
      id: deps.uuid(),
      tenantId: ctx.tenantId,
      code: input.code,
      name: input.name,
      vatNumber: input.vatNumber ?? null,
    })
    if (!created) return err<StaffingError>({ kind: 'vendor_duplicate_code' })
    await deps.repo.appendEvent(tx, {
      eventId: deps.uuid(),
      tenantId: ctx.tenantId,
      entityType: 'vendor',
      entityId: created.id,
      eventType: 'VENDOR_ONBOARDED',
      ...actor(ctx, deps),
      payload: { code: created.code },
    })
    return ok(created)
  })
}

export async function getVendor(ctx: SessionContext, id: string, deps: StaffingDeps): Promise<VendorRow | null> {
  return deps.withTenantScope(scopeOf(ctx), (tx) => deps.repo.findVendorById(tx, ctx.tenantId, id))
}

/** List vendors for the caller's tenant (alpha by code). */
export async function listVendors(ctx: SessionContext, deps: StaffingDeps, limit = 100): Promise<VendorRow[]> {
  return deps.withTenantScope(scopeOf(ctx), (tx) => deps.repo.listVendors(tx, ctx.tenantId, limit))
}

/** List workers for the caller's tenant, with PII name resolved in-tenant. */
export async function listWorkers(ctx: SessionContext, deps: StaffingDeps, limit = 100): Promise<WorkerListItem[]> {
  return deps.withTenantScope(scopeOf(ctx), (tx) => deps.repo.listWorkers(tx, ctx.tenantId, limit))
}

// ── Worker (PII isolated to sensitive.party_pii) ──────────────────────────────
export async function createWorker(
  ctx: SessionContext,
  input: CreateWorkerInput,
  deps: StaffingDeps,
): Promise<Result<WorkerWithPii, StaffingError>> {
  return deps.withTenantScope(scopeOf(ctx), async (tx) => {
    const vendor = await deps.repo.findVendorById(tx, ctx.tenantId, input.vendorId)
    if (!vendor) return err<StaffingError>({ kind: 'vendor_not_found' })

    // Person-PII → the sensitive schema; the worker row holds only the surrogate.
    const partyId = deps.uuid()
    await deps.repo.insertPartyPii(tx, { partyId, tenantId: ctx.tenantId, name: input.name, email: input.email ?? null })

    const created = await deps.repo.insertWorker(tx, {
      id: deps.uuid(),
      tenantId: ctx.tenantId,
      vendorId: input.vendorId,
      partyId,
      skillCode: input.skillCode ?? null,
      seniorityCode: input.seniorityCode ?? null,
      externalId: input.externalId ?? null,
    })
    // PII-free event (skill/seniority are native codes, never the person's name).
    await deps.repo.appendEvent(tx, {
      eventId: deps.uuid(),
      tenantId: ctx.tenantId,
      entityType: 'worker',
      entityId: created.id,
      eventType: 'WORKER_CREATED',
      ...actor(ctx, deps),
      payload: { vendorId: created.vendorId, skillCode: created.skillCode, seniorityCode: created.seniorityCode },
    })
    return ok({ ...created, name: input.name, email: input.email ?? null })
  })
}

export async function getWorker(ctx: SessionContext, id: string, deps: StaffingDeps): Promise<WorkerWithPii | null> {
  return deps.withTenantScope(scopeOf(ctx), (tx) => deps.repo.findWorkerWithPii(tx, ctx.tenantId, id))
}

// ── Assignment (I6 capacity cap) ──────────────────────────────────────────────
export async function createAssignment(
  ctx: SessionContext,
  input: CreateAssignmentInput,
  deps: StaffingDeps,
): Promise<Result<AssignmentRow, StaffingError>> {
  return deps.withTenantScope(scopeOf(ctx), async (tx) => {
    const lineDays = await deps.repo.findLinePlannedDays(tx, ctx.tenantId, input.workOrderLineId)
    if (lineDays === null) return err<StaffingError>({ kind: 'wo_line_not_found' })
    if (!(await deps.repo.workerExists(tx, ctx.tenantId, input.workerId))) return err<StaffingError>({ kind: 'worker_not_found' })

    // Invariant I6: a line cannot be over-allocated.
    const allocated = await deps.repo.sumActiveAssignedDays(tx, ctx.tenantId, input.workOrderLineId)
    const capacity = Number(lineDays)
    if (allocated + input.plannedDays > capacity) {
      return err<StaffingError>({ kind: 'capacity_exceeded', lineDays: capacity, allocated, requested: input.plannedDays })
    }

    const created = await deps.repo.insertAssignment(tx, {
      id: deps.uuid(),
      tenantId: ctx.tenantId,
      workOrderLineId: input.workOrderLineId,
      workerId: input.workerId,
      plannedDays: input.plannedDays.toString(),
      startDate: input.startDate,
      endDate: input.endDate,
    })
    await deps.repo.appendEvent(tx, {
      eventId: deps.uuid(),
      tenantId: ctx.tenantId,
      entityType: 'assignment',
      entityId: created.id,
      eventType: 'ASSIGNMENT_CREATED',
      woLineId: created.workOrderLineId,
      ...actor(ctx, deps),
      payload: { workerId: created.workerId, plannedDays: created.plannedDays },
    })
    return ok(created)
  })
}

export type EndAssignmentCommand = { assignmentId: string; expectedVersion: number; eventId: string; endReason?: string }

export async function endAssignment(
  ctx: SessionContext,
  cmd: EndAssignmentCommand,
  deps: StaffingDeps,
): Promise<Result<AssignmentRow, StaffingError>> {
  return deps.withTenantScope(scopeOf(ctx), async (tx) => {
    const a = await deps.repo.findAssignmentById(tx, ctx.tenantId, cmd.assignmentId)
    if (!a) return err<StaffingError>({ kind: 'assignment_not_found' })
    if (await deps.repo.eventExists(tx, ctx.tenantId, cmd.eventId)) return ok(a)

    const next = nextStatus(a.status, 'end')
    if (!next) return err<StaffingError>({ kind: 'invalid_transition', from: a.status, transition: 'end' })
    if (cmd.expectedVersion !== a.version) return err<StaffingError>({ kind: 'version_conflict' })

    const updated = await deps.repo.updateAssignmentStatus(tx, {
      id: cmd.assignmentId,
      tenantId: ctx.tenantId,
      expectedVersion: cmd.expectedVersion,
      status: next,
      now: deps.now(),
      ...(cmd.endReason ? { endReason: cmd.endReason } : {}),
    })
    if (!updated) return err<StaffingError>({ kind: 'version_conflict' })

    await deps.repo.appendEvent(tx, {
      eventId: cmd.eventId,
      tenantId: ctx.tenantId,
      entityType: 'assignment',
      entityId: cmd.assignmentId,
      eventType: 'ASSIGNMENT_ENDED',
      woLineId: a.workOrderLineId,
      ...actor(ctx, deps),
      payload: { endReason: cmd.endReason ?? null },
    })
    return ok(updated)
  })
}
