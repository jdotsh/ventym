import { index, integer, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { tenant, type ActorKind } from '../schema'

// SEAM 1 — the append-only validated event log (the analytics feed + lineage SoT).
// Domain events at WO-line grain (+ natural grains). Native codes only; PII-free.
export const EVENT_TYPES = [
  'WORK_ORDER_LINE_COMMITTED',
  'WORK_ORDER_VALIDATED',
  'TIMESHEET_SUBMITTED',
  'TIMESHEET_LINE_APPROVED',
  'MILESTONE_ACCEPTED',
  'ERP_GOODS_RECEIPT_POSTED',
  // vendor-performance FEEDER events (never a stored score — computed downstream):
  'SLA_BREACHED',
  'TIMESHEET_REJECTED',
  'REWORK_LOOP_OPENED',
  'APPROVAL_CYCLE_COMPLETED',
] as const
export type EventType = (typeof EVENT_TYPES)[number]

// `event_id` IS the idempotency key (caller-supplied). Replaying it is a no-op.
// Immutability trigger (append-only) is added in the migration. Mutated in the
// SAME transaction as the operational state change (transactional outbox).
export const eventLog = pgTable(
  'event_log',
  {
    eventId: uuid('event_id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    schemaVersion: integer('schema_version').notNull().default(1),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    actorKind: varchar('actor_kind', { length: 20 }).$type<ActorKind>().notNull().default('human'),
    actorUserId: uuid('actor_user_id'),
    actorSessionId: varchar('actor_session_id', { length: 64 }), // which session/token acted (agent attribution)
    entityType: varchar('entity_type', { length: 40 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    eventType: varchar('event_type', { length: 60 }).$type<EventType>().notNull(),
    woLineId: uuid('wo_line_id'), // atomic spend grain; NULL for non-line events
    payload: jsonb('payload').notNull(),
  },
  (t) => [
    index('idx_event_log_tenant_time').on(t.tenantId, t.occurredAt),
    index('idx_event_log_tenant_entity').on(t.tenantId, t.entityType, t.entityId),
  ],
)

export type EventLogRow = typeof eventLog.$inferSelect
