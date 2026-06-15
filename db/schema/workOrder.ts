import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { appUser, tenant } from '../schema'

// ─── Vocabularies (string-literal unions + varchar+CHECK, never pg enums) ──────
export const ENGAGEMENT_TYPES = ['T_AND_M', 'FIXED_PRICE'] as const
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number]

// Operational dimension — the bilateral client↔vendor handshake.
export const WO_LIFECYCLE_STATUS = [
  'DRAFT',
  'PENDING_VENDOR_ACCEPT',
  'ACCEPTED_BY_VENDOR',
  'REJECTED_BY_VENDOR',
  'ACTIVE',
  'CLOSED',
  'CANCELLED',
  'EXPIRED',
] as const
export type WoLifecycleStatus = (typeof WO_LIFECYCLE_STATUS)[number]

// Accounting dimension — INDEPENDENT of lifecycle (the parked-approval ERP gate).
export const ERP_LINK_STATUS = ['UNLINKED', 'LINKED', 'SYNC_ERROR'] as const
export type ErpLinkStatus = (typeof ERP_LINK_STATUS)[number]

// vms work_order — two independent state dimensions (operational + accounting).
// `version` powers optimistic concurrency; money is decimal `_excl`, never float.
export const workOrder = pgTable(
  'work_order',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    version: integer('version').notNull().default(1),
    code: varchar('code', { length: 50 }).notNull(),
    engagementType: varchar('engagement_type', { length: 20 }).$type<EngagementType>().notNull(),
    lifecycleStatus: varchar('lifecycle_status', { length: 30 })
      .$type<WoLifecycleStatus>()
      .notNull()
      .default('DRAFT'),
    erpLinkStatus: varchar('erp_link_status', { length: 20 })
      .$type<ErpLinkStatus>()
      .notNull()
      .default('UNLINKED'),
    title: varchar('title', { length: 300 }),
    description: text('description'),
    currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
    vatRate: numeric('vat_rate', { precision: 5, scale: 4 }).notNull(),
    totalExcl: numeric('total_excl', { precision: 14, scale: 2 }).notNull().default('0'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    vendorId: uuid('vendor_id'), // D5 — counterparty link
    poCode: varchar('po_code', { length: 100 }), // the customer ERP PO ref (set at link_po)
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => appUser.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_work_order_tenant_code').on(t.tenantId, t.code),
    index('idx_work_order_tenant_lifecycle').on(t.tenantId, t.lifecycleStatus),
    index('idx_work_order_tenant_erp_link').on(t.tenantId, t.erpLinkStatus),
  ],
)

export type WorkOrderRow = typeof workOrder.$inferSelect

// vms work_order_line — the atomic spend grain. Carries NATIVE structured codes
// (role/seniority/category/geo), never free text — the canonical-mapping seam.
// I13: pay_rate ≤ bill_rate (margin guard) enforced at the schema.
export const workOrderLine = pgTable(
  'work_order_line',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrder.id, { onDelete: 'cascade' }),
    lineNum: integer('line_num').notNull(),
    roleCode: varchar('role_code', { length: 100 }).notNull(),
    seniorityCode: varchar('seniority_code', { length: 40 }),
    categoryCode: varchar('category_code', { length: 40 }),
    geoCode: varchar('geo_code', { length: 40 }),
    billRateDailyExcl: numeric('bill_rate_daily_excl', { precision: 12, scale: 4 }).notNull(),
    payRateDailyExcl: numeric('pay_rate_daily_excl', { precision: 12, scale: 4 }),
    plannedDays: numeric('planned_days', { precision: 8, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_wo_line_workorder_num').on(t.workOrderId, t.lineNum),
    index('idx_wo_line_tenant').on(t.tenantId),
    check(
      'chk_wo_line_pay_le_bill',
      sql`${t.payRateDailyExcl} IS NULL OR ${t.payRateDailyExcl} <= ${t.billRateDailyExcl}`,
    ),
  ],
)

export type WorkOrderLineRow = typeof workOrderLine.$inferSelect
