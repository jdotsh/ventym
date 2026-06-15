import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

// ─── Vocabularies (string-literal unions, never pg enums) ──────────────────
export const TENANT_ROLES = ['ADMIN', 'MANAGER', 'MEMBER', 'AUDITOR'] as const
export type TenantRole = (typeof TENANT_ROLES)[number]

export const ACTOR_KINDS = ['human', 'agent', 'system'] as const
export type ActorKind = (typeof ACTOR_KINDS)[number]

// ─── Shared column groups (DRY) ────────────────────────────────────────────
const id = uuid('id').primaryKey().defaultRandom()
const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
const tenantId = uuid('tenant_id').notNull().references(() => tenant.id)

// ─── Global tables (not tenant-scoped) ─────────────────────────────────────
export const tenant = pgTable('tenant', {
  id,
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 200 }).notNull(),
  defaultLocale: varchar('default_locale', { length: 5 }).notNull().default('en'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt,
  updatedAt,
})

// One login account, possibly a member of several tenants. Auth lives in WorkOS;
// we never store a password.
export const appUser = pgTable('app_user', {
  id,
  workosUserId: varchar('workos_user_id', { length: 255 }).unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 200 }),
  locale: varchar('locale', { length: 5 }).notNull().default('en'),
  isActive: boolean('is_active').notNull().default(true),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  createdAt,
  updatedAt,
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
})

// ─── Tenant-scoped tables (RLS on tenant_id — appended in the migration) ────
export const membership = pgTable(
  'membership',
  {
    id,
    tenantId,
    appUserId: uuid('app_user_id').notNull().references(() => appUser.id),
    roles: jsonb('roles').$type<TenantRole[]>().notNull().default([]),
    externalId: varchar('external_id', { length: 255 }), // IdP/SCIM idempotent key
    idpProvider: varchar('idp_provider', { length: 40 }),
    isActive: boolean('is_active').notNull().default(true),
    version: integer('version').notNull().default(1), // optimistic concurrency
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex('membership_tenant_user').on(t.tenantId, t.appUserId)],
)

// Per-tenant identity-broker config (WorkOS org_id in `config`). NOT RLS-scoped:
// it's the org→tenant ROUTING table, read pre-session during login.
export const tenantConnection = pgTable(
  'tenant_connection',
  {
    id,
    tenantId,
    providerId: varchar('provider_id', { length: 60 }).notNull(), // 'workos' | …
    config: jsonb('config').$type<Record<string, string>>().notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
    createdAt,
    updatedAt,
  },
  (t) => [uniqueIndex('tenant_connection_provider').on(t.tenantId, t.providerId)],
)

// Thin session: a reference to the WorkOS session + the pinned active role.
export const session = pgTable('session', {
  id: varchar('id', { length: 64 }).primaryKey(),
  tenantId,
  appUserId: uuid('app_user_id').notNull().references(() => appUser.id),
  activeRole: varchar('active_role', { length: 40 }).$type<TenantRole>(),
  workosSessionRef: text('workos_session_ref'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt,
})

// Agent/automation credential — OAuth-scoped, least-privilege single role.
export const apiToken = pgTable('api_token', {
  id,
  tenantId,
  appUserId: uuid('app_user_id').notNull().references(() => appUser.id),
  name: varchar('name', { length: 120 }).notNull(),
  tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
  tokenPrefix: varchar('token_prefix', { length: 24 }).notNull(),
  activeRole: varchar('active_role', { length: 40 }).$type<TenantRole>().notNull(),
  scope: varchar('scope', { length: 60 }),
  version: integer('version').notNull().default(1),
  createdAt,
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})

// Idempotency store: claim-first per (tenant, key). status_code/response_json are
// NULL while a request is in flight (claimed), set on completion (safe replay).
export type StoredResponse = { body: string; ct: string }
export const idempotency = pgTable(
  'idempotency',
  {
    id,
    tenantId,
    idemKey: varchar('idem_key', { length: 200 }).notNull(),
    requestFingerprint: varchar('request_fingerprint', { length: 64 }), // sha256(method:path:body)
    statusCode: integer('status_code'), // NULL = claimed / in-progress
    responseJson: jsonb('response_json').$type<StoredResponse>(),
    createdAt,
  },
  (t) => [uniqueIndex('idempotency_tenant_key').on(t.tenantId, t.idemKey)],
)

// Append-only audit trail (immutability trigger added in the migration).
export const auditLog = pgTable('audit_log', {
  id,
  tenantId: uuid('tenant_id').references(() => tenant.id), // nullable for platform events
  entityType: varchar('entity_type', { length: 60 }).notNull(),
  entityId: uuid('entity_id'),
  action: varchar('action', { length: 80 }).notNull(),
  actorKind: varchar('actor_kind', { length: 20 }).$type<ActorKind>().notNull().default('human'),
  actorUserId: uuid('actor_user_id'),
  actorIp: varchar('actor_ip', { length: 45 }),
  beforeJson: jsonb('before_json'),
  afterJson: jsonb('after_json'),
  reason: text('reason'),
  createdAt,
})

// Tables whose rows are isolated by the `app.tenant_id` GUC (see RLS migration).
export const TENANT_SCOPED_TABLES = ['membership', 'session', 'api_token', 'idempotency'] as const

// ─── Domain aggregates (one file per aggregate; barrel re-export) ──────────────
// Defined after the foundation tables so their `references(() => tenant.id)` see
// an initialised `tenant` binding during module evaluation.
export * from './schema/workOrder'
export * from './schema/timesheet'
export * from './schema/erp'
export * from './schema/event'
export * from './schema/governance'
export * from './schema/sensitive'

