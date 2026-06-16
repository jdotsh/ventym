import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema'

// Accepts both the root client and a transaction (repos work with either).
export type Database = PgDatabase<PostgresJsQueryResultHKT, typeof schema>

export type OpenDb = { db: Database; close: () => Promise<void> }

/**
 * Open a connection for ONE request. Cloudflare Workers forbids reusing an I/O
 * object (the DB socket) created in one request from another, so a cached
 * cross-request connection throws "Cannot perform I/O on behalf of a different
 * request". The app therefore opens a fresh max:1 connection per request and closes
 * it after the response. Deployed envs front this with Hyperdrive (edge pooling),
 * so the per-request open is cheap.
 */
export function openDatabase(connectionString: string, max = 1): OpenDb {
  const client = postgres(connectionString, { max, prepare: false })
  return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 5 }).catch(() => undefined) }
}

/** Long-lived pool for scripts (migrate / seed / scheduled) where the process owns it. */
export function createDatabase(connectionString: string): Database {
  return openDatabase(connectionString, 5).db
}

/**
 * Fail-closed guard: assert the app connects as a role that RLS actually
 * constrains — i.e. NOT a BYPASSRLS role and NOT a public-table owner (owners
 * bypass RLS via ownership). Misconfigure the connection to the owner and RLS
 * silently no-ops; this turns that into a loud boot failure. Run once per isolate.
 */
export async function assertRlsEnforced(db: Database): Promise<void> {
  const result = await db.execute(sql`
    SELECT current_user AS role,
      COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user), false) AS bypass,
      EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user) AS owns
  `)
  const row = result[0] as { role: string; bypass: boolean; owns: boolean } | undefined
  if (!row) throw new Error('RLS guard: could not resolve current_user')
  if (row.bypass || row.owns) {
    const why = row.bypass ? 'has BYPASSRLS' : 'owns public tables'
    throw new Error(
      `RLS is NOT enforced: the app connects as '${row.role}' which ${why} and bypasses row-level security. Connect as the non-owner vms_app role.`,
    )
  }
}

export type TenantScope = { tenantId: string; userId: string; sessionId: string }

/**
 * Run `fn` in a transaction with the three RLS GUCs set, so every statement is
 * tenant-isolated. Use for mutations; reads also carry an explicit predicate.
 */
export function withTenantScope<T>(
  db: Database,
  scope: TenantScope,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction((tx) =>
    tx
      .execute(
        sql`select set_config('app.tenant_id', ${scope.tenantId}, true),
                   set_config('app.user_id', ${scope.userId}, true),
                   set_config('app.session_id', ${scope.sessionId}, true)`,
      )
      .then(() => fn(tx)),
  )
}
