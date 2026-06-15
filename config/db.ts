import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema'

// Accepts both the root client and a transaction (repos work with either).
export type Database = PgDatabase<PostgresJsQueryResultHKT, typeof schema>

export function createDatabase(connectionString: string): Database {
  const client = postgres(connectionString, { max: 5, prepare: false })
  return drizzle(client, { schema })
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
