import { boolean, date, index, integer, numeric, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { tenant } from '../schema'
import { workOrderLine } from './workOrder'

// ─── Vendor (supplier org) ─────────────────────────────────────────────────
export const VENDOR_STATUS = ['PENDING', 'ACTIVE', 'SUSPENDED'] as const
export type VendorStatus = (typeof VENDOR_STATUS)[number]

export const vendor = pgTable(
  'vendor',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    version: integer('version').notNull().default(1),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(), // org name — NOT person-PII
    vatNumber: varchar('vat_number', { length: 50 }),
    status: varchar('status', { length: 20 }).$type<VendorStatus>().notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_vendor_tenant_code').on(t.tenantId, t.code)],
)
export type VendorRow = typeof vendor.$inferSelect

// ─── Worker (external person) ──────────────────────────────────────────────
// Person-PII (name/email) lives ONLY in sensitive.party_pii; this row carries a
// surrogate `party_id`, resolved in-tenant at read time (GDPR-correct; erasable).
export const worker = pgTable(
  'worker',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendor.id),
    partyId: uuid('party_id').notNull(), // → sensitive.party_pii (no cross-schema FK; service-enforced)
    skillCode: varchar('skill_code', { length: 60 }), // native moat grain
    seniorityCode: varchar('seniority_code', { length: 40 }),
    externalId: varchar('external_id', { length: 100 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_worker_tenant_vendor').on(t.tenantId, t.vendorId)],
)
export type WorkerRow = typeof worker.$inferSelect

// ─── Assignment (worker ↔ wo_line; the staffing grain) ─────────────────────
export const ASSIGNMENT_STATUS = ['PENDING', 'ACTIVE', 'ENDED'] as const
export type AssignmentStatus = (typeof ASSIGNMENT_STATUS)[number]

export const assignment = pgTable(
  'assignment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    version: integer('version').notNull().default(1),
    workOrderLineId: uuid('work_order_line_id')
      .notNull()
      .references(() => workOrderLine.id, { onDelete: 'cascade' }),
    workerId: uuid('worker_id')
      .notNull()
      .references(() => worker.id),
    status: varchar('status', { length: 20 }).$type<AssignmentStatus>().notNull().default('PENDING'),
    plannedDays: numeric('planned_days', { precision: 8, scale: 2 }).notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    endReason: varchar('end_reason', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_assignment_tenant_line').on(t.tenantId, t.workOrderLineId),
    index('idx_assignment_worker').on(t.tenantId, t.workerId),
  ],
)
export type AssignmentRow = typeof assignment.$inferSelect
