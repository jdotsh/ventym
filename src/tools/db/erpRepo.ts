import { and, eq } from 'drizzle-orm'
import type { Database } from '../../../config/db'
import {
  erpExport,
  eventLog,
  type ActorKind,
  type ErpExportEntity,
  type ErpExportRow,
  type EventType,
} from '../../../db/schema'

export type ErpRepo = ReturnType<typeof createErpRepo>

/** ERP export (goods-receipt posting) data access + the event-log append. Every
 *  method runs inside a tenant-scoped tx. */
export function createErpRepo(db: Database) {
  void db
  return {
    async findExportByEntity(
      tx: Database,
      tenantId: string,
      entityType: ErpExportEntity,
      entityId: string,
    ): Promise<ErpExportRow | null> {
      const [row] = await tx
        .select()
        .from(erpExport)
        .where(and(eq(erpExport.tenantId, tenantId), eq(erpExport.entityType, entityType), eq(erpExport.entityId, entityId)))
        .limit(1)
      return row ?? null
    },

    // Idempotent on (tenant, entity_type, entity_id): a duplicate yields null.
    async insertExport(tx: Database, values: typeof erpExport.$inferInsert): Promise<ErpExportRow | null> {
      const [row] = await tx.insert(erpExport).values(values).onConflictDoNothing().returning()
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
