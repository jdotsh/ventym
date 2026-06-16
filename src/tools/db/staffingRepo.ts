import { and, asc, eq, sql } from 'drizzle-orm'
import type { Database } from '../../../config/db'
import {
  assignment,
  eventLog,
  partyPii,
  vendor,
  worker,
  workOrderLine,
  type ActorKind,
  type AssignmentRow,
  type AssignmentStatus,
  type EventType,
  type VendorRow,
  type WorkerRow,
} from '../../../db/schema'

export type StaffingRepo = ReturnType<typeof createStaffingRepo>

// A worker row joined with its person-PII (resolved in-tenant from sensitive.party_pii).
export type WorkerWithPii = WorkerRow & { name: string | null; email: string | null }

// A worker list row — display fields only (PII name resolved in-tenant, vendor joined).
export type WorkerListItem = {
  id: string
  name: string | null
  vendorName: string
  skillCode: string | null
  seniorityCode: string | null
  isActive: boolean
}

export function createStaffingRepo(db: Database) {
  void db
  return {
    // ── Vendor ──────────────────────────────────────────────────────────────
    async insertVendor(tx: Database, values: typeof vendor.$inferInsert): Promise<VendorRow | null> {
      const [row] = await tx.insert(vendor).values(values).onConflictDoNothing().returning()
      return row ?? null
    },
    async listVendors(tx: Database, tenantId: string, limit: number): Promise<VendorRow[]> {
      return tx.select().from(vendor).where(eq(vendor.tenantId, tenantId)).orderBy(asc(vendor.code)).limit(limit)
    },
    async listWorkers(tx: Database, tenantId: string, limit: number): Promise<WorkerListItem[]> {
      return tx
        .select({
          id: worker.id,
          name: partyPii.name,
          vendorName: vendor.name,
          skillCode: worker.skillCode,
          seniorityCode: worker.seniorityCode,
          isActive: worker.isActive,
        })
        .from(worker)
        .leftJoin(partyPii, eq(worker.partyId, partyPii.partyId))
        .innerJoin(vendor, eq(worker.vendorId, vendor.id))
        .where(eq(worker.tenantId, tenantId))
        .orderBy(asc(vendor.name))
        .limit(limit)
    },
    async findVendorById(tx: Database, tenantId: string, id: string): Promise<VendorRow | null> {
      const [row] = await tx
        .select()
        .from(vendor)
        .where(and(eq(vendor.tenantId, tenantId), eq(vendor.id, id)))
        .limit(1)
      return row ?? null
    },

    // ── Worker (+ PII isolation) ─────────────────────────────────────────────
    // Person-PII goes ONLY here (the sensitive schema), never on the worker row.
    async insertPartyPii(tx: Database, input: { partyId: string; tenantId: string; name: string; email: string | null }): Promise<void> {
      await tx.insert(partyPii).values({ partyId: input.partyId, tenantId: input.tenantId, name: input.name, email: input.email })
    },
    async insertWorker(tx: Database, values: typeof worker.$inferInsert): Promise<WorkerRow> {
      const [row] = await tx.insert(worker).values(values).returning()
      if (!row) throw new Error('failed to insert worker')
      return row
    },
    async findWorkerWithPii(tx: Database, tenantId: string, id: string): Promise<WorkerWithPii | null> {
      const [row] = await tx
        .select({
          id: worker.id,
          tenantId: worker.tenantId,
          vendorId: worker.vendorId,
          partyId: worker.partyId,
          skillCode: worker.skillCode,
          seniorityCode: worker.seniorityCode,
          externalId: worker.externalId,
          isActive: worker.isActive,
          createdAt: worker.createdAt,
          updatedAt: worker.updatedAt,
          name: partyPii.name,
          email: partyPii.email,
        })
        .from(worker)
        .leftJoin(partyPii, eq(worker.partyId, partyPii.partyId))
        .where(and(eq(worker.tenantId, tenantId), eq(worker.id, id)))
        .limit(1)
      return row ?? null
    },
    async workerExists(tx: Database, tenantId: string, id: string): Promise<boolean> {
      const [row] = await tx
        .select({ id: worker.id })
        .from(worker)
        .where(and(eq(worker.tenantId, tenantId), eq(worker.id, id)))
        .limit(1)
      return row !== undefined
    },

    // ── Assignment (+ I6 capacity) ───────────────────────────────────────────
    async findLinePlannedDays(tx: Database, tenantId: string, woLineId: string): Promise<string | null> {
      const [row] = await tx
        .select({ days: workOrderLine.plannedDays })
        .from(workOrderLine)
        .where(and(eq(workOrderLine.tenantId, tenantId), eq(workOrderLine.id, woLineId)))
        .limit(1)
      return row?.days ?? null
    },
    // Days already committed to a line by non-ended assignments (the I6 denominator).
    async sumActiveAssignedDays(tx: Database, tenantId: string, woLineId: string): Promise<number> {
      const [row] = await tx
        .select({ total: sql<string>`COALESCE(SUM(${assignment.plannedDays}), 0)` })
        .from(assignment)
        .where(and(eq(assignment.tenantId, tenantId), eq(assignment.workOrderLineId, woLineId), sql`${assignment.status} <> 'ENDED'`))
      return Number(row?.total ?? 0)
    },
    async insertAssignment(tx: Database, values: typeof assignment.$inferInsert): Promise<AssignmentRow> {
      const [row] = await tx.insert(assignment).values(values).returning()
      if (!row) throw new Error('failed to insert assignment')
      return row
    },
    async findAssignmentById(tx: Database, tenantId: string, id: string): Promise<AssignmentRow | null> {
      const [row] = await tx
        .select()
        .from(assignment)
        .where(and(eq(assignment.tenantId, tenantId), eq(assignment.id, id)))
        .limit(1)
      return row ?? null
    },
    async updateAssignmentStatus(
      tx: Database,
      input: { id: string; tenantId: string; expectedVersion: number; status: AssignmentStatus; endReason?: string; now: Date },
    ): Promise<AssignmentRow | null> {
      const [row] = await tx
        .update(assignment)
        .set({ status: input.status, version: sql`${assignment.version} + 1`, updatedAt: input.now, ...(input.endReason ? { endReason: input.endReason } : {}) })
        .where(and(eq(assignment.tenantId, input.tenantId), eq(assignment.id, input.id), eq(assignment.version, input.expectedVersion)))
        .returning()
      return row ?? null
    },

    // ── Outbox ───────────────────────────────────────────────────────────────
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
