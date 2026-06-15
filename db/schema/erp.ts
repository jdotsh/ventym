import { index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { tenant } from '../schema'

export const ERP_EXPORT_ENTITY = ['timesheet', 'milestone'] as const
export type ErpExportEntity = (typeof ERP_EXPORT_ENTITY)[number]

export const ERP_EXPORT_STATUS = ['PENDING', 'SENT', 'CONFIRMED', 'FAILED'] as const
export type ErpExportStatus = (typeof ERP_EXPORT_STATUS)[number]

// The goods-receipt posting record — idempotent (one per booked entity) and
// reconstructable (payload_hash). The async inbound/reconcile path is D6.
export const erpExport = pgTable(
  'erp_export',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    version: integer('version').notNull().default(1),
    entityType: varchar('entity_type', { length: 20 }).$type<ErpExportEntity>().notNull(),
    entityId: uuid('entity_id').notNull(),
    woLineId: uuid('wo_line_id'), // spend grain
    kind: varchar('kind', { length: 40 }).notNull().default('GOODS_RECEIPT'),
    amountExcl: numeric('amount_excl', { precision: 14, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
    payloadHash: varchar('payload_hash', { length: 64 }).notNull(), // sha256 — idempotency + audit
    status: varchar('status', { length: 20 }).$type<ErpExportStatus>().notNull().default('PENDING'),
    erpDocumentRef: varchar('erp_document_ref', { length: 100 }),
    attempt: integer('attempt').notNull().default(1),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_erp_export_entity').on(t.tenantId, t.entityType, t.entityId),
    index('idx_erp_export_tenant_status').on(t.tenantId, t.status),
  ],
)

export type ErpExportRow = typeof erpExport.$inferSelect
