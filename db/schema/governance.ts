import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { tenant } from '../schema'

// SEAM 4 support — per-tenant NATIVE code dictionaries. Events reference these
// native codes; the canonical mapping is a downstream SCD2 projection (deferred).
export const CODE_DIMENSIONS = ['category', 'skill', 'seniority', 'geo'] as const
export type CodeDimension = (typeof CODE_DIMENSIONS)[number]

export const tenantCode = pgTable(
  'tenant_code',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id),
    dimension: varchar('dimension', { length: 30 }).$type<CodeDimension>().notNull(),
    code: varchar('code', { length: 60 }).notNull(),
    label: text('label'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uq_tenant_code').on(t.tenantId, t.dimension, t.code)],
)

// SEAM 2 — benchmark consent (opt-in). Default DENY; opt-out ⇒ excluded by the gate.
export const tenantBenchmarkConsent = pgTable('tenant_benchmark_consent', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenant.id),
  consented: boolean('consented').notNull().default(false),
  consentedAt: timestamp('consented_at', { withTimezone: true }),
  consentedByUserId: uuid('consented_by_user_id'),
  scope: jsonb('scope'), // which dimensions/categories the tenant consents to
})

export type TenantCodeRow = typeof tenantCode.$inferSelect
export type TenantBenchmarkConsentRow = typeof tenantBenchmarkConsent.$inferSelect
