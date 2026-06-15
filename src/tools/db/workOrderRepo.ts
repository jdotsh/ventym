import { and, eq, sql } from 'drizzle-orm'
import type { Database } from '../../../config/db'
import {
  eventLog,
  workOrder,
  workOrderLine,
  type ActorKind,
  type EventType,
  type WorkOrderLineRow,
  type WorkOrderRow,
  type WoLifecycleStatus,
} from '../../../db/schema'

export type WorkOrderRepo = ReturnType<typeof createWorkOrderRepo>

type TransitionStamps = Partial<
  Pick<WorkOrderRow, 'submittedAt' | 'activatedAt' | 'closedAt' | 'cancelledAt'>
>

/** Work Order data access. Every method runs inside a tenant-scoped tx; reads
 *  also carry the explicit tenant predicate (defence-in-depth on the Phase-G path). */
export function createWorkOrderRepo(db: Database) {
  void db
  return {
    // Idempotent on (tenant, code): a duplicate yields [] (caller maps to an error).
    async insertWorkOrder(tx: Database, values: typeof workOrder.$inferInsert): Promise<WorkOrderRow | null> {
      const [row] = await tx.insert(workOrder).values(values).onConflictDoNothing().returning()
      return row ?? null
    },

    async insertLines(
      tx: Database,
      values: (typeof workOrderLine.$inferInsert)[],
    ): Promise<WorkOrderLineRow[]> {
      return tx.insert(workOrderLine).values(values).returning()
    },

    async findById(tx: Database, tenantId: string, id: string): Promise<WorkOrderRow | null> {
      const [row] = await tx
        .select()
        .from(workOrder)
        .where(and(eq(workOrder.tenantId, tenantId), eq(workOrder.id, id)))
        .limit(1)
      return row ?? null
    },

    // Optimistic concurrency: matches on `version`; [] ⇒ stale (conflict or gone).
    async updateForTransition(
      tx: Database,
      input: {
        id: string
        tenantId: string
        expectedVersion: number
        status: WoLifecycleStatus
        stamps: TransitionStamps
        now: Date
      },
    ): Promise<WorkOrderRow | null> {
      const [row] = await tx
        .update(workOrder)
        .set({
          lifecycleStatus: input.status,
          version: sql`${workOrder.version} + 1`,
          updatedAt: input.now,
          ...input.stamps,
        })
        .where(
          and(
            eq(workOrder.tenantId, input.tenantId),
            eq(workOrder.id, input.id),
            eq(workOrder.version, input.expectedVersion),
          ),
        )
        .returning()
      return row ?? null
    },

    // The ERP-link facts for the WO behind a line (the booking gate reads these).
    async findErpStatusByLine(
      tx: Database,
      tenantId: string,
      woLineId: string,
    ): Promise<{ workOrderId: string; erpLinkStatus: string; currency: string; poCode: string | null } | null> {
      const [row] = await tx
        .select({
          workOrderId: workOrder.id,
          erpLinkStatus: workOrder.erpLinkStatus,
          currency: workOrder.currency,
          poCode: workOrder.poCode,
        })
        .from(workOrderLine)
        .innerJoin(workOrder, eq(workOrderLine.workOrderId, workOrder.id))
        .where(and(eq(workOrderLine.tenantId, tenantId), eq(workOrderLine.id, woLineId)))
        .limit(1)
      return row ?? null
    },

    // Link a PO: the ERP-link dimension UNLINKED → LINKED (only-once via the WHERE).
    async linkErp(
      tx: Database,
      input: { id: string; tenantId: string; expectedVersion: number; poCode: string; now: Date },
    ): Promise<WorkOrderRow | null> {
      const [row] = await tx
        .update(workOrder)
        .set({ erpLinkStatus: 'LINKED', poCode: input.poCode, version: sql`${workOrder.version} + 1`, updatedAt: input.now })
        .where(
          and(
            eq(workOrder.tenantId, input.tenantId),
            eq(workOrder.id, input.id),
            eq(workOrder.version, input.expectedVersion),
            eq(workOrder.erpLinkStatus, 'UNLINKED'),
          ),
        )
        .returning()
      return row ?? null
    },

    async eventExists(tx: Database, tenantId: string, eventId: string): Promise<boolean> {
      const [row] = await tx
        .select({ eventId: eventLog.eventId })
        .from(eventLog)
        .where(and(eq(eventLog.tenantId, tenantId), eq(eventLog.eventId, eventId)))
        .limit(1)
      return row !== undefined
    },

    // The transactional-outbox append. `event_id` is the idempotency key — a
    // replay is a no-op (returns false). Runs in the SAME tx as the state change.
    async appendEvent(
      tx: Database,
      e: {
        eventId: string
        tenantId: string
        entityType: string
        entityId: string
        eventType: EventType
        woLineId?: string
        actorKind: ActorKind
        actorUserId: string | null
        actorSessionId: string | null
        payload: unknown
      },
    ): Promise<boolean> {
      const rows = await tx
        .insert(eventLog)
        .values({
          eventId: e.eventId,
          tenantId: e.tenantId,
          entityType: e.entityType,
          entityId: e.entityId,
          eventType: e.eventType,
          woLineId: e.woLineId ?? null,
          actorKind: e.actorKind,
          actorUserId: e.actorUserId,
          actorSessionId: e.actorSessionId,
          payload: e.payload,
        })
        .onConflictDoNothing({ target: eventLog.eventId })
        .returning({ eventId: eventLog.eventId })
      return rows.length > 0
    },
  }
}
