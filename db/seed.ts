import { sql } from 'drizzle-orm'
import { createDatabase } from '../config/db'
import { appUser, membership, tenant, tenantConnection } from './schema'

// Runs as the owner role (bypasses RLS) via `tsx db/seed.ts`.
const url = process.env.DATABASE_URL ?? 'postgres://vms:vms@localhost:5433/vms'
const db = createDatabase(url)

async function seed(): Promise<void> {
  await db.execute(
    sql`truncate tenant, app_user, membership, tenant_connection, session, api_token, idempotency, audit_log restart identity cascade`,
  )
  const [t] = await db.insert(tenant).values({ code: 'ACME', name: 'Acme Corp' }).returning()
  const [u] = await db
    .insert(appUser)
    .values({ email: 'admin@acme.test', displayName: 'Acme Admin' })
    .returning()
  if (!t || !u) throw new Error('seed failed')
  await db.insert(membership).values({ tenantId: t.id, appUserId: u.id, roles: ['ADMIN'] })
  await db
    .insert(tenantConnection)
    .values({ tenantId: t.id, providerId: 'workos', config: { organizationId: 'org_01KV64ZWNJS5R86C62NJ2DYVZW' } })
  console.log(JSON.stringify({ seeded: { tenant: t.code, admin: u.email } }))
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
