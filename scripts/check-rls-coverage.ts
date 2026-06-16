// RLS-coverage gate (R-25) — every tenant-scoped table MUST enable row-level security
// in a migration. Catches the worst silent multi-tenant bug: a new table with tenant_id
// but no RLS policy (cross-tenant reads as the app role). SQL-only, no schema parsing.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'db/migrations'
// Tables with tenant_id that are INTENTIONALLY global (read pre-session, before a
// tenant scope exists). Each needs a documented reason here.
const GLOBAL_OK = new Set<string>([
  'tenant_connection', // org→tenant routing — read pre-session; RLS would fail-closed and break login
])
const sql = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(DIR, f), 'utf8'))
  .join('\n')

// Every CREATE TABLE whose body declares tenant_id is tenant-scoped → needs RLS.
const tenantTables = new Set<string>()
const createRe = /CREATE TABLE(?: IF NOT EXISTS)? "([a-z_]+)" \(([\s\S]*?)\);/g
for (let m = createRe.exec(sql); m; m = createRe.exec(sql)) {
  const [, name, body] = m
  if (name && body && /"tenant_id"/.test(body) && !GLOBAL_OK.has(name)) tenantTables.add(name)
}

const missing = [...tenantTables].filter(
  (t) => !new RegExp(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`).test(sql),
)

if (missing.length > 0) {
  console.error(`✗ RLS-coverage gate — ${missing.length} tenant-scoped table(s) without ENABLE ROW LEVEL SECURITY:`)
  for (const t of missing) console.error(`    ${t}  (add ENABLE ROW LEVEL SECURITY + a <table>_isolation policy in its migration)`)
  process.exit(1)
}
console.log(`✓ RLS-coverage — all ${tenantTables.size} tenant-scoped tables have RLS enabled`)
