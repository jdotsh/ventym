import { index, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// SEAM 3 — PII isolation. Person-PII and the tenant↔pseudonym key live ONLY in
// this physically separate schema, never interleaved with analytics-relevant
// attributes. Reachable only in-tenant (RLS) or by the future governed ETL gate.
// Fixes Athena's flagship COMP-1 gap (inline PII, no erasure) from row one.
export const sensitive = pgSchema('sensitive')

// The ONLY home of person-PII. Operational rows reference `party_id` (a surrogate)
// and resolve PII at read time, in-tenant. Erasure = tombstone here (NULL the
// fields, set erased_at); the event log + operational rows keep the surrogate uuid.
export const partyPii = sensitive.table(
  'party_pii',
  {
    partyId: uuid('party_id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name'),
    email: text('email'),
    erasedAt: timestamp('erased_at', { withTimezone: true }),
  },
  (t) => [index('idx_party_pii_tenant').on(t.tenantId)],
)

// Stable, non-reversible outside this schema (keyed pseudonymization). The ONLY
// place tenant identity maps to the analytic surrogate used downstream.
export const tenantPseudonym = sensitive.table('tenant_pseudonym', {
  tenantId: uuid('tenant_id').primaryKey(),
  analyticSurrogate: uuid('analytic_surrogate').notNull().unique(),
})

export type PartyPiiRow = typeof partyPii.$inferSelect
export type TenantPseudonymRow = typeof tenantPseudonym.$inferSelect
