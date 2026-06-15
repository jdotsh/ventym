import type { Database, TenantScope } from '../../../config/db'
import type { ActorKind, WoLifecycleStatus, WorkOrderLineRow, WorkOrderRow } from '../../../db/schema'
import type { WorkOrderRepo } from '@/tools/db/workOrderRepo'
import { deterministicId } from '@/utils/ids'
import { err, ok, type Result } from '@/utils/result'
import type { SessionContext } from '@/services/identity/service'
import { nextStatus, type WoTransition } from './machine'
import type { CreateWorkOrderInput, WorkOrderError } from './schema'

export type WorkOrderDeps = {
  repo: WorkOrderRepo
  withTenantScope: <T>(scope: TenantScope, fn: (tx: Database) => Promise<T>) => Promise<T>
  uuid: () => string
  now: () => Date
  actorKind: ActorKind
}

export type CreatedWorkOrder = { workOrder: WorkOrderRow; lines: WorkOrderLineRow[] }

const scopeOf = (ctx: SessionContext): TenantScope => ({
  tenantId: ctx.tenantId,
  userId: ctx.userId,
  sessionId: ctx.sessionId,
})

const money = (n: number): string => n.toFixed(2)

// Stamp the lifecycle timestamp that the target status implies.
function stampFor(status: WoLifecycleStatus, now: Date) {
  if (status === 'PENDING_VENDOR_ACCEPT') return { submittedAt: now }
  if (status === 'ACTIVE') return { activatedAt: now }
  if (status === 'CLOSED') return { closedAt: now }
  if (status === 'CANCELLED') return { cancelledAt: now }
  return {}
}

/**
 * Create a DRAFT Work Order + its lines, and append one WORK_ORDER_LINE_COMMITTED
 * event per line — all in ONE transaction (the transactional outbox). Idempotent
 * on (tenant, code); the per-line event_ids are deterministic, so a replay is a no-op.
 */
export async function createWorkOrder(
  ctx: SessionContext,
  input: CreateWorkOrderInput,
  deps: WorkOrderDeps,
): Promise<Result<CreatedWorkOrder, WorkOrderError>> {
  const total = input.lines.reduce((sum, l) => sum + l.billRateDailyExcl * l.plannedDays, 0)

  return deps.withTenantScope(scopeOf(ctx), async (tx) => {
    const woId = deps.uuid()
    const created = await deps.repo.insertWorkOrder(tx, {
      id: woId,
      tenantId: ctx.tenantId,
      code: input.code,
      engagementType: input.engagementType,
      title: input.title ?? null,
      description: input.description ?? null,
      currency: input.currency,
      vatRate: money(input.vatRate),
      totalExcl: money(total),
      startDate: input.startDate,
      endDate: input.endDate,
      createdByUserId: ctx.userId,
    })
    if (!created) return err<WorkOrderError>({ kind: 'duplicate_code', code: input.code })

    const lines = await deps.repo.insertLines(
      tx,
      input.lines.map((l) => ({
        id: deps.uuid(),
        tenantId: ctx.tenantId,
        workOrderId: woId,
        lineNum: l.lineNum,
        roleCode: l.roleCode,
        seniorityCode: l.seniorityCode ?? null,
        categoryCode: l.categoryCode ?? null,
        geoCode: l.geoCode ?? null,
        billRateDailyExcl: l.billRateDailyExcl.toString(),
        payRateDailyExcl: l.payRateDailyExcl?.toString() ?? null,
        plannedDays: l.plannedDays.toString(),
      })),
    )

    for (const line of lines) {
      await deps.repo.appendEvent(tx, {
        eventId: deterministicId(`${ctx.tenantId}:wo:${input.code}:line:${line.lineNum}`),
        tenantId: ctx.tenantId,
        entityType: 'work_order_line',
        entityId: line.id,
        eventType: 'WORK_ORDER_LINE_COMMITTED',
        woLineId: line.id,
        actorKind: deps.actorKind,
        actorUserId: ctx.userId,
        payload: {
          role_code: line.roleCode,
          seniority_code: line.seniorityCode,
          category_code: line.categoryCode,
          geo_code: line.geoCode,
          bill_rate_excl: line.billRateDailyExcl,
          pay_rate_excl: line.payRateDailyExcl,
          planned_days: line.plannedDays,
          currency: created.currency,
        },
      })
    }
    return ok<CreatedWorkOrder>({ workOrder: created, lines })
  })
}

export type TransitionCommand = {
  workOrderId: string
  transition: WoTransition
  expectedVersion: number
  eventId: string // idempotency key — replaying it is a no-op
}

/**
 * Apply a lifecycle transition with optimistic concurrency, appending a
 * WORK_ORDER_VALIDATED event in the same transaction. Replaying `eventId` returns
 * the current state without re-applying.
 */
export async function transitionWorkOrder(
  ctx: SessionContext,
  cmd: TransitionCommand,
  deps: WorkOrderDeps,
): Promise<Result<WorkOrderRow, WorkOrderError>> {
  return deps.withTenantScope(scopeOf(ctx), async (tx) => {
    const wo = await deps.repo.findById(tx, ctx.tenantId, cmd.workOrderId)
    if (!wo) return err<WorkOrderError>({ kind: 'not_found' })

    // Idempotent replay: the command's event already landed ⇒ already applied.
    if (await deps.repo.eventExists(tx, ctx.tenantId, cmd.eventId)) return ok(wo)

    const next = nextStatus(wo.lifecycleStatus, cmd.transition)
    if (!next) {
      return err<WorkOrderError>({ kind: 'invalid_transition', from: wo.lifecycleStatus, transition: cmd.transition })
    }
    if (cmd.expectedVersion !== wo.version) return err<WorkOrderError>({ kind: 'version_conflict' })

    const now = deps.now()
    const updated = await deps.repo.updateForTransition(tx, {
      id: cmd.workOrderId,
      tenantId: ctx.tenantId,
      expectedVersion: cmd.expectedVersion,
      status: next,
      stamps: stampFor(next, now),
      now,
    })
    if (!updated) return err<WorkOrderError>({ kind: 'version_conflict' })

    await deps.repo.appendEvent(tx, {
      eventId: cmd.eventId,
      tenantId: ctx.tenantId,
      entityType: 'work_order',
      entityId: cmd.workOrderId,
      eventType: 'WORK_ORDER_VALIDATED',
      actorKind: deps.actorKind,
      actorUserId: ctx.userId,
      payload: { from: wo.lifecycleStatus, to: next, transition: cmd.transition },
    })
    return ok(updated)
  })
}
