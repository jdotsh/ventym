import { sql } from 'drizzle-orm'
import { createDatabase } from '../config/db'
import {
  appUser,
  membership,
  partyPii,
  tenant,
  tenantConnection,
  timesheet,
  vendor,
  worker,
  workOrder,
  workOrderLine,
} from './schema'

// Runs as the owner role (bypasses RLS) via `tsx db/seed.ts`. Dev-only: it
// truncates and re-seeds. Now seeds REAL demo domain data so every screen renders
// populated (work orders, a timesheet awaiting approval, a vendor + worker).
const url = process.env.DATABASE_URL ?? 'postgres://vms:vms@localhost:5433/vms'
const db = createDatabase(url)

async function seed(): Promise<void> {
  await db.execute(
    sql`truncate tenant, app_user, membership, tenant_connection, session, api_token, idempotency, audit_log restart identity cascade`,
  )

  const [t] = await db.insert(tenant).values({ code: 'ACME', name: 'Acme Corp' }).returning()
  const [admin] = await db.insert(appUser).values({ email: 'admin@acme.test', displayName: 'Acme Admin' }).returning()
  // A second user submits the timesheet, so the admin can approve it (maker-checker SoD).
  const [submitter] = await db.insert(appUser).values({ email: 'pm@acme.test', displayName: 'Acme PM' }).returning()
  if (!t || !admin || !submitter) throw new Error('seed failed')

  await db.insert(membership).values({ tenantId: t.id, appUserId: admin.id, roles: ['ADMIN', 'MANAGER'] })
  // pm@acme.test is a MEMBER — so you can log in as a non-admin too (dev login).
  await db.insert(membership).values({ tenantId: t.id, appUserId: submitter.id, roles: ['MEMBER'] })
  await db
    .insert(tenantConnection)
    .values({ tenantId: t.id, providerId: 'workos', config: { organizationId: 'org_01KV64ZWNJS5R86C62NJ2DYVZW' } })

  // ── Staffing: a vendor + a worker (person-PII isolated in party_pii). ──────────
  const [v] = await db
    .insert(vendor)
    .values({ tenantId: t.id, code: 'VEND-01', name: 'Globex Srl', vatNumber: 'IT01234567890', status: 'ACTIVE' })
    .returning()
  const partyId = crypto.randomUUID()
  await db.insert(partyPii).values({ partyId, tenantId: t.id, name: 'Mario Rossi', email: 'mario.rossi@globex.test' })
  await db.insert(worker).values({ tenantId: t.id, vendorId: v!.id, partyId, skillCode: 'BACKEND', seniorityCode: 'SENIOR', isActive: true })

  // ── Work Orders: one ACTIVE (T&M) with a line, one DRAFT (Fixed-Price). ───────
  const [wo1] = await db
    .insert(workOrder)
    .values({
      tenantId: t.id, code: 'WO-2026-001', engagementType: 'T_AND_M', lifecycleStatus: 'ACTIVE',
      title: 'Core banking integration', currency: 'EUR', vatRate: '0.2200', totalExcl: '10000.00',
      startDate: '2026-01-01', endDate: '2026-06-30', createdByUserId: admin.id, activatedAt: new Date(),
    })
    .returning()
  await db.insert(workOrder).values({
    tenantId: t.id, code: 'WO-2026-002', engagementType: 'FIXED_PRICE', lifecycleStatus: 'DRAFT',
    title: 'Mobile app rework', currency: 'EUR', vatRate: '0.2200', totalExcl: '45000.00',
    startDate: '2026-03-01', endDate: '2026-09-30', createdByUserId: admin.id,
  })
  const [line] = await db
    .insert(workOrderLine)
    .values({
      tenantId: t.id, workOrderId: wo1!.id, lineNum: 1, roleCode: 'DEV', seniorityCode: 'SENIOR',
      billRateDailyExcl: '500.0000', payRateDailyExcl: '350.0000', plannedDays: '20.00',
    })
    .returning()

  // ── A SUBMITTED timesheet awaiting approval (submitted by the PM, not the admin). ─
  await db.insert(timesheet).values({
    tenantId: t.id, workOrderLineId: line!.id, periodStart: '2026-02-01', periodEnd: '2026-02-28',
    status: 'SUBMITTED', totalHours: '40.00', totalDaysEquivalent: '5.0000', totalExcl: '2500.00',
    createdByUserId: submitter.id, submittedAt: new Date(),
  })

  console.log(JSON.stringify({ seeded: { tenant: t.code, admin: admin.email, workOrders: 2, timesheets: 1, vendors: 1, workers: 1 } }))
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
