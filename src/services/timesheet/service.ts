import type { Database, TenantScope } from '../../../config/db'
import type { ActorKind, EventType, TimesheetLineRow, TimesheetRow } from '../../../db/schema'
import type { TimesheetRepo } from '@/tools/db/timesheetRepo'
import { err, ok, type Result } from '@/utils/result'
import type { SessionContext } from '@/services/identity/service'
import { nextStatus, type TimesheetTransition } from './machine'
import type { CreateTimesheetInput, TimesheetError } from './schema'

const HOURS_PER_DAY = 8

export type TimesheetDeps = {
  repo: TimesheetRepo
  withTenantScope: <T>(scope: TenantScope, fn: (tx: Database) => Promise<T>) => Promise<T>
  uuid: () => string
  now: () => Date
  actorKind: ActorKind
}

export type CreatedTimesheet = { timesheet: TimesheetRow; lines: TimesheetLineRow[] }

const scopeOf = (ctx: SessionContext): TenantScope => ({
  tenantId: ctx.tenantId,
  userId: ctx.userId,
  sessionId: ctx.sessionId,
})

const money = (n: number): string => n.toFixed(2)

/**
 * Create a DRAFT timesheet for a WO line over a period, costed from the line's
 * bill rate. No event yet — a draft isn't a committed fact; the outbox starts at
 * submit. Idempotent on (tenant, line, period_start).
 */
export async function createTimesheet(
  ctx: SessionContext,
  input: CreateTimesheetInput,
  deps: TimesheetDeps,
): Promise<Result<CreatedTimesheet, TimesheetError>> {
  return deps.withTenantScope(scopeOf(ctx), async (tx) => {
    const rate = await deps.repo.findWorkOrderLineRate(tx, ctx.tenantId, input.workOrderLineId)
    if (rate === null) return err<TimesheetError>({ kind: 'wo_line_not_found' })

    const totalHours = input.lines.reduce((sum, l) => sum + l.hours, 0)
    const daysEquivalent = totalHours / HOURS_PER_DAY
    const totalExcl = daysEquivalent * Number(rate)

    const tsId = deps.uuid()
    const created = await deps.repo.insertTimesheet(tx, {
      id: tsId,
      tenantId: ctx.tenantId,
      workOrderLineId: input.workOrderLineId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      totalHours: money(totalHours),
      totalDaysEquivalent: daysEquivalent.toFixed(4),
      totalExcl: money(totalExcl),
      capacityOverride: input.capacityOverride ?? false,
      capacityOverrideReason: input.capacityOverrideReason ?? null,
      createdByUserId: ctx.userId,
    })
    if (!created) return err<TimesheetError>({ kind: 'duplicate_period' })

    const lines = await deps.repo.insertLines(
      tx,
      input.lines.map((l) => ({
        id: deps.uuid(),
        tenantId: ctx.tenantId,
        timesheetId: tsId,
        workDate: l.workDate,
        hours: l.hours.toString(),
        isOverride: l.isOverride ?? false,
        overrideReason: l.overrideReason ?? null,
        note: l.note ?? null,
      })),
    )
    return ok<CreatedTimesheet>({ timesheet: created, lines })
  })
}

export type TimesheetTransitionCommand = {
  timesheetId: string
  transition: TimesheetTransition
  expectedVersion: number
  eventId: string // idempotency key — replaying it is a no-op
  reason?: string // required for reject
}

type TransitionFields = {
  submittedAt?: Date
  approvedAt?: Date
  rejectedAt?: Date
  approvedByUserId?: string
  rejectionReason?: string
}

type TransitionPlan = { fields: TransitionFields; eventType: EventType }

// Per-transition side effects + governance guards (SoD on approve, reason on reject).
function planTransition(
  transition: TimesheetTransition,
  ctx: SessionContext,
  ts: TimesheetRow,
  reason: string | undefined,
  now: Date,
): Result<TransitionPlan, TimesheetError> {
  switch (transition) {
    case 'submit':
      return ok({ fields: { submittedAt: now }, eventType: 'TIMESHEET_SUBMITTED' })
    case 'approve':
      // Maker-checker: the approver cannot be the submitter.
      if (ctx.userId === ts.createdByUserId) return err<TimesheetError>({ kind: 'sod_violation' })
      return ok({ fields: { approvedByUserId: ctx.userId, approvedAt: now }, eventType: 'TIMESHEET_LINE_APPROVED' })
    case 'reject':
      if (!reason) return err<TimesheetError>({ kind: 'reason_required' })
      return ok({ fields: { rejectionReason: reason, rejectedAt: now }, eventType: 'TIMESHEET_REJECTED' })
    case 'revise':
      return ok({ fields: {}, eventType: 'REWORK_LOOP_OPENED' })
    default: {
      const unhandled: never = transition
      throw new Error(`unhandled timesheet transition: ${JSON.stringify(unhandled)}`)
    }
  }
}

/**
 * Apply a timesheet transition with optimistic concurrency, emitting the matching
 * event in the same transaction. Replaying `eventId` returns the current state.
 */
export async function transitionTimesheet(
  ctx: SessionContext,
  cmd: TimesheetTransitionCommand,
  deps: TimesheetDeps,
): Promise<Result<TimesheetRow, TimesheetError>> {
  return deps.withTenantScope(scopeOf(ctx), async (tx) => {
    const ts = await deps.repo.findById(tx, ctx.tenantId, cmd.timesheetId)
    if (!ts) return err<TimesheetError>({ kind: 'not_found' })
    if (await deps.repo.eventExists(tx, ctx.tenantId, cmd.eventId)) return ok(ts)

    const next = nextStatus(ts.status, cmd.transition)
    if (!next) return err<TimesheetError>({ kind: 'invalid_transition', from: ts.status, transition: cmd.transition })
    if (cmd.expectedVersion !== ts.version) return err<TimesheetError>({ kind: 'version_conflict' })

    const now = deps.now()
    const plan = planTransition(cmd.transition, ctx, ts, cmd.reason, now)
    if (!plan.ok) return plan

    const updated = await deps.repo.updateForTransition(tx, {
      id: cmd.timesheetId,
      tenantId: ctx.tenantId,
      expectedVersion: cmd.expectedVersion,
      status: next,
      fields: plan.value.fields,
      now,
    })
    if (!updated) return err<TimesheetError>({ kind: 'version_conflict' })

    await deps.repo.appendEvent(tx, {
      eventId: cmd.eventId,
      tenantId: ctx.tenantId,
      entityId: cmd.timesheetId,
      eventType: plan.value.eventType,
      woLineId: ts.workOrderLineId, // the spend grain — the approve event is the value event
      actorKind: deps.actorKind,
      actorUserId: ctx.userId,
      actorSessionId: ctx.sessionId,
      payload: { from: ts.status, to: next, transition: cmd.transition, ...(cmd.reason ? { reason: cmd.reason } : {}) },
    })
    return ok(updated)
  })
}

/** Read one timesheet by id, tenant-scoped. */
export async function getTimesheet(
  ctx: SessionContext,
  id: string,
  deps: TimesheetDeps,
): Promise<TimesheetRow | null> {
  return deps.withTenantScope(scopeOf(ctx), (tx) => deps.repo.findById(tx, ctx.tenantId, id))
}
