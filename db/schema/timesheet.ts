import {
  boolean,
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
import { workOrderLine } from './workOrder'

// Timesheet lifecycle. APPROVED ≠ BOOKED: booking is gated on the WO's
// erp_link_status = LINKED (the parked-approval gate, wired in D4).
export const TIMESHEET_STATUS = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'BOOKED'] as const
export type TimesheetStatus = (typeof TIMESHEET_STATUS)[number]

// vms timesheet — the consuntivo for a WO line over a period. The client's
// validation (approve) is the single source of truth that triggers ERP (D4).
export const timesheet = pgTable(
  'timesheet',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    version: integer('version').notNull().default(1),
    workOrderLineId: uuid('work_order_line_id')
      .notNull()
      .references(() => workOrderLine.id),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    status: varchar('status', { length: 20 }).$type<TimesheetStatus>().notNull().default('DRAFT'),
    totalHours: numeric('total_hours', { precision: 8, scale: 2 }).notNull().default('0'),
    totalDaysEquivalent: numeric('total_days_equivalent', { precision: 8, scale: 4 }).notNull().default('0'),
    totalExcl: numeric('total_excl', { precision: 14, scale: 2 }).notNull().default('0'),
    capacityOverride: boolean('capacity_override').notNull().default(false),
    capacityOverrideReason: text('capacity_override_reason'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    bookedAt: timestamp('booked_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    erpDocumentRef: varchar('erp_document_ref', { length: 100 }), // set at BOOK (D4)
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => appUser.id),
    approvedByUserId: uuid('approved_by_user_id').references(() => appUser.id), // SoD: ≠ creator
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_timesheet_line_period').on(t.tenantId, t.workOrderLineId, t.periodStart),
    index('idx_timesheet_tenant_status').on(t.tenantId, t.status),
  ],
)

export type TimesheetRow = typeof timesheet.$inferSelect

// vms timesheet_line — daily grain. is_override flags a capacity override (a
// compliance signal surfaced in the audit/feeder events).
export const timesheetLine = pgTable(
  'timesheet_line',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    timesheetId: uuid('timesheet_id')
      .notNull()
      .references(() => timesheet.id, { onDelete: 'cascade' }),
    workDate: date('work_date').notNull(),
    hours: numeric('hours', { precision: 5, scale: 2 }).notNull(),
    isOverride: boolean('is_override').notNull().default(false),
    overrideReason: text('override_reason'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_timesheet_line_date').on(t.timesheetId, t.workDate),
    index('idx_ts_line_tenant').on(t.tenantId),
  ],
)

export type TimesheetLineRow = typeof timesheetLine.$inferSelect
