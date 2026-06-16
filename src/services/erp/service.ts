import type { Database, TenantScope } from '../../../config/db'
import type { ActorKind, TimesheetRow, WorkOrderRow } from '../../../db/schema'
import type { WorkOrderRepo } from '@/tools/db/workOrderRepo'
import type { TimesheetRepo } from '@/tools/db/timesheetRepo'
import type { ErpRepo } from '@/tools/db/erpRepo'
import type { ErpAdapter } from '@/tools/erp/adapter'
import { sha256Hex } from '@/utils/hash'
import { err, ok, type Result } from '@/utils/result'
import type { SessionContext } from '@/services/identity/service'
import type { ErpError } from './schema'

export type ErpDeps = {
  woRepo: WorkOrderRepo
  tsRepo: TimesheetRepo
  erpRepo: ErpRepo
  erp: ErpAdapter
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

export type LinkPoCommand = { workOrderId: string; poCode: string; expectedVersion: number; eventId: string }

/** AP links the customer ERP PO: the WO's ERP-link dimension UNLINKED → LINKED.
 *  This unblocks booking of the WO's approved timesheets (the parked approvals). */
export async function linkPurchaseOrder(
  ctx: SessionContext,
  cmd: LinkPoCommand,
  deps: ErpDeps,
): Promise<Result<WorkOrderRow, ErpError>> {
  return deps.withTenantScope(scopeOf(ctx), async (tx) => {
    const wo = await deps.woRepo.findById(tx, ctx.tenantId, cmd.workOrderId)
    if (!wo) return err<ErpError>({ kind: 'wo_not_found' })
    if (await deps.erpRepo.eventExists(tx, ctx.tenantId, cmd.eventId)) return ok(wo)
    if (wo.erpLinkStatus !== 'UNLINKED') return err<ErpError>({ kind: 'already_linked' })
    if (cmd.expectedVersion !== wo.version) return err<ErpError>({ kind: 'version_conflict' })

    const updated = await deps.woRepo.linkErp(tx, {
      id: cmd.workOrderId,
      tenantId: ctx.tenantId,
      expectedVersion: cmd.expectedVersion,
      poCode: cmd.poCode,
      now: deps.now(),
    })
    if (!updated) return err<ErpError>({ kind: 'version_conflict' })

    await deps.erpRepo.appendEvent(tx, {
      eventId: cmd.eventId,
      tenantId: ctx.tenantId,
      entityType: 'work_order',
      entityId: cmd.workOrderId,
      eventType: 'WORK_ORDER_PO_LINKED',
      actorKind: deps.actorKind,
      actorUserId: ctx.userId,
      actorSessionId: ctx.sessionId,
      payload: { poCode: cmd.poCode },
    })
    return ok(updated)
  })
}

export type BookCommand = { timesheetId: string; expectedVersion: number; eventId: string }

/**
 * Book an APPROVED timesheet — the money moment. Gated on the WO's
 * erp_link_status = LINKED (else the approval stays parked). In ONE transaction:
 * post the goods receipt (idempotent), record the erp_export, flip the timesheet
 * to BOOKED with the ERP ref, and emit ERP_GOODS_RECEIPT_POSTED.
 */
export async function bookTimesheet(
  ctx: SessionContext,
  cmd: BookCommand,
  deps: ErpDeps,
): Promise<Result<TimesheetRow, ErpError>> {
  return deps.withTenantScope(scopeOf(ctx), async (tx) => {
    const ts = await deps.tsRepo.findById(tx, ctx.tenantId, cmd.timesheetId)
    if (!ts) return err<ErpError>({ kind: 'ts_not_found' })
    if (await deps.erpRepo.eventExists(tx, ctx.tenantId, cmd.eventId)) return ok(ts)
    if (ts.status !== 'APPROVED') return err<ErpError>({ kind: 'ts_not_approved' })
    if (cmd.expectedVersion !== ts.version) return err<ErpError>({ kind: 'version_conflict' })

    const woErp = await deps.woRepo.findErpStatusByLine(tx, ctx.tenantId, ts.workOrderLineId)
    if (!woErp) return err<ErpError>({ kind: 'ts_not_found' })
    if (woErp.erpLinkStatus !== 'LINKED') return err<ErpError>({ kind: 'erp_not_linked' }) // parked

    const now = deps.now()
    const existing = await deps.erpRepo.findExportByEntity(tx, ctx.tenantId, 'timesheet', cmd.timesheetId)
    let erpRef = existing?.erpDocumentRef ?? null
    if (!erpRef) {
      const exportLogId = deps.uuid()
      const emit = await deps.erp.send({
        kind: 'GOODS_RECEIPT',
        tenantId: ctx.tenantId,
        entityType: 'timesheet',
        entityId: cmd.timesheetId,
        exportLogId, // idempotency key: a replayed post returns the same ERP doc
        poCode: woErp.poCode ?? '',
        amountExcl: ts.totalExcl,
        currency: woErp.currency,
      })
      if (emit.type === 'failed') return err<ErpError>({ kind: 'erp_send_failed', retriable: emit.retriable })
      if (emit.type === 'skipped') return err<ErpError>({ kind: 'erp_skipped', reason: emit.reason })
      erpRef = emit.erpDocumentRef
      const payloadHash = await sha256Hex(`${ctx.tenantId}:timesheet:${cmd.timesheetId}:${ts.totalExcl}:${woErp.poCode ?? ''}`)
      await deps.erpRepo.insertExport(tx, {
        id: exportLogId,
        tenantId: ctx.tenantId,
        entityType: 'timesheet',
        entityId: cmd.timesheetId,
        woLineId: ts.workOrderLineId,
        amountExcl: ts.totalExcl,
        currency: woErp.currency,
        payloadHash,
        status: 'CONFIRMED',
        erpDocumentRef: erpRef,
        sentAt: now,
        confirmedAt: now,
      })
    }

    const booked = await deps.tsRepo.updateForTransition(tx, {
      id: cmd.timesheetId,
      tenantId: ctx.tenantId,
      expectedVersion: cmd.expectedVersion,
      status: 'BOOKED',
      fields: { bookedAt: now, erpDocumentRef: erpRef },
      now,
    })
    if (!booked) return err<ErpError>({ kind: 'version_conflict' })

    await deps.erpRepo.appendEvent(tx, {
      eventId: cmd.eventId,
      tenantId: ctx.tenantId,
      entityType: 'timesheet',
      entityId: cmd.timesheetId,
      eventType: 'ERP_GOODS_RECEIPT_POSTED',
      woLineId: ts.workOrderLineId,
      actorKind: deps.actorKind,
      actorUserId: ctx.userId,
      actorSessionId: ctx.sessionId,
      payload: { erpDocumentRef: erpRef, amount_excl: ts.totalExcl, po_code: woErp.poCode },
    })
    return ok(booked)
  })
}
