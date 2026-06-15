import { and, eq, sql } from 'drizzle-orm'
import type { Database } from '../../../config/db'
import {
  eventLog,
  timesheet,
  timesheetLine,
  workOrderLine,
  type ActorKind,
  type EventType,
  type TimesheetLineRow,
  type TimesheetRow,
  type TimesheetStatus,
} from '../../../db/schema'

export type TimesheetRepo = ReturnType<typeof createTimesheetRepo>

type TransitionFields = Partial<
  Pick<
    TimesheetRow,
    'submittedAt' | 'approvedAt' | 'rejectedAt' | 'approvedByUserId' | 'rejectionReason' | 'bookedAt' | 'erpDocumentRef'
  >
>

/** Timesheet data access. Every method runs inside a tenant-scoped tx; reads also
 *  carry the explicit tenant predicate (defence-in-depth on the Phase-G path). */
export function createTimesheetRepo(db: Database) {
  void db
  return {
    // The bill rate is the WO line's — the rate SSOT, resolved at create time.
    async findWorkOrderLineRate(tx: Database, tenantId: string, lineId: string): Promise<string | null> {
      const [row] = await tx
        .select({ rate: workOrderLine.billRateDailyExcl })
        .from(workOrderLine)
        .where(and(eq(workOrderLine.tenantId, tenantId), eq(workOrderLine.id, lineId)))
        .limit(1)
      return row?.rate ?? null
    },

    async insertTimesheet(tx: Database, values: typeof timesheet.$inferInsert): Promise<TimesheetRow | null> {
      const [row] = await tx.insert(timesheet).values(values).onConflictDoNothing().returning()
      return row ?? null
    },

    async insertLines(tx: Database, values: (typeof timesheetLine.$inferInsert)[]): Promise<TimesheetLineRow[]> {
      return tx.insert(timesheetLine).values(values).returning()
    },

    async findById(tx: Database, tenantId: string, id: string): Promise<TimesheetRow | null> {
      const [row] = await tx
        .select()
        .from(timesheet)
        .where(and(eq(timesheet.tenantId, tenantId), eq(timesheet.id, id)))
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
        status: TimesheetStatus
        fields: TransitionFields
        now: Date
      },
    ): Promise<TimesheetRow | null> {
      const [row] = await tx
        .update(timesheet)
        .set({ status: input.status, version: sql`${timesheet.version} + 1`, updatedAt: input.now, ...input.fields })
        .where(
          and(
            eq(timesheet.tenantId, input.tenantId),
            eq(timesheet.id, input.id),
            eq(timesheet.version, input.expectedVersion),
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

    // Transactional-outbox append — same tx as the state change; replay-safe.
    async appendEvent(
      tx: Database,
      e: {
        eventId: string
        tenantId: string
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
          entityType: 'timesheet',
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
