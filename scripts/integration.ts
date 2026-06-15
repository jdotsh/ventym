/**
 * Integration suite (needs a real Postgres — Docker local on :5433, or the CI
 * service). Proves the dual-surface write path end-to-end against the DB as the
 * NON-OWNER vms_app role: the transactional outbox, idempotent replay, RLS
 * isolation, event-log immutability, agent attribution, and the timesheet value
 * loop with maker-checker SoD. Run: `bun run test:integration` (exits non-zero
 * on any failure). Override OWNER/APP env to point at a different Postgres.
 */
import { sql } from 'drizzle-orm'
import { createDatabase, withTenantScope } from '../config/db'
import { appUser, eventLog, tenant, timesheet, workOrder } from '../db/schema'
import { buildWorkOrderDeps } from '../src/services/workOrder/deps'
import { createWorkOrder, getWorkOrder, transitionWorkOrder } from '../src/services/workOrder/service'
import { buildTimesheetDeps } from '../src/services/timesheet/deps'
import { createTimesheet, transitionTimesheet } from '../src/services/timesheet/service'
import type { SessionContext } from '../src/services/identity/service'

const OWNER = process.env.OWNER ?? 'postgres://vms:vms@localhost:5433/vms'
const APP = process.env.APP ?? 'postgres://vms_app:vms_app@localhost:5433/vms'

let passed = 0
let failed = 0
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? '✓' : '✗'} ${name}`)
  if (ok) passed++
  else failed++
}

async function main(): Promise<void> {
  const owner = createDatabase(OWNER) // table owner ⇒ bypasses RLS (seed + assert)
  const app = createDatabase(APP) // non-owner ⇒ RLS-enforced (the service runs here)
  const sfx = crypto.randomUUID().slice(0, 8)

  const [t1] = await owner.insert(tenant).values({ code: `SMOKE_${sfx}`, name: 'Smoke' }).returning()
  const [t2] = await owner.insert(tenant).values({ code: `OTHER_${sfx}`, name: 'Other' }).returning()
  const [u] = await owner.insert(appUser).values({ email: `smoke_${sfx}@x.test`, displayName: 'Smoke' }).returning()
  if (!t1 || !t2 || !u) throw new Error('seed failed')

  const ctx: SessionContext = {
    userId: u.id, email: u.email, displayName: 'Smoke',
    tenantId: t1.id, sessionId: `sess_${sfx}`, roles: ['MANAGER'], activeRole: 'MANAGER',
  }
  const deps = buildWorkOrderDeps(app, 'agent') // simulate the AGENT write path

  // 1. Create (the transactional outbox): WO + 2 lines + 2 events, one tx.
  const created = await createWorkOrder(
    ctx,
    {
      code: `WO_${sfx}`, engagementType: 'T_AND_M', currency: 'EUR', vatRate: 0.22,
      startDate: '2026-01-01', endDate: '2026-03-31',
      lines: [
        { lineNum: 1, roleCode: 'ENG', billRateDailyExcl: 500, plannedDays: 10 },
        { lineNum: 2, roleCode: 'PM', seniorityCode: 'SENIOR', categoryCode: 'IT', geoCode: 'IT-MI', billRateDailyExcl: 700, payRateDailyExcl: 400, plannedDays: 5 },
      ],
    },
    deps,
  )
  check('createWorkOrder ok', created.ok)
  if (!created.ok) throw new Error('create failed: ' + created.error.kind)
  check('total computed (8500.00)', created.value.workOrder.totalExcl === '8500.00')
  const woId = created.value.workOrder.id

  const evCount = async (): Promise<number> => {
    const [r] = await owner.select({ n: sql<number>`count(*)::int` }).from(eventLog).where(sql`${eventLog.entityId} IN (${sql.join(created.value.lines.map((l) => sql`${l.id}`), sql`, `)})`)
    return r?.n ?? 0
  }
  check('outbox: 2 line-committed events appended in the same tx', (await evCount()) === 2)
  const [agentEv] = await owner.select().from(eventLog).where(sql`${eventLog.actorKind} = 'agent'`).limit(1)
  check('events attributed to actor_kind=agent', agentEv !== undefined)
  const [sessEv] = await owner.select().from(eventLog).where(sql`${eventLog.actorSessionId} = ${ctx.sessionId}`).limit(1)
  check('events carry actor_session_id (which agent/token acted)', sessEv !== undefined)

  // 2. Transition + idempotent replay (event_id is a UUID, as REST/MCP pass).
  const evtId = crypto.randomUUID()
  const submit = await transitionWorkOrder(ctx, { workOrderId: woId, transition: 'submit', expectedVersion: 1, eventId: evtId }, deps)
  check('submit DRAFT→PENDING_VENDOR_ACCEPT', submit.ok && submit.value.lifecycleStatus === 'PENDING_VENDOR_ACCEPT' && submit.value.version === 2)
  const replay = await transitionWorkOrder(ctx, { workOrderId: woId, transition: 'submit', expectedVersion: 1, eventId: evtId }, deps)
  check('idempotent replay is a no-op (version stays 2)', replay.ok && replay.value.version === 2)

  // 3. RLS isolation — pure (no predicate): vms_app with the WRONG tenant GUC sees zero rows.
  const wrongTenant = await withTenantScope(app, { tenantId: t2.id, userId: u.id, sessionId: 'x' }, async (tx) => {
    const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(workOrder)
    return r?.n ?? -1
  })
  check('RLS blocks cross-tenant read (0 rows under wrong GUC)', wrongTenant === 0)
  const wrongCtxRead = await getWorkOrder({ ...ctx, tenantId: t2.id }, woId, deps)
  check('service read is tenant-scoped (null cross-tenant)', wrongCtxRead === null)

  // 4. event_log is append-only (immutability trigger) — as vms_app.
  let immutable = false
  try {
    await app.execute(sql`UPDATE event_log SET actor_kind = 'system' WHERE event_id = ${evtId}`)
  } catch {
    immutable = true
  }
  check('event_log UPDATE is rejected (append-only)', immutable)

  // 5. Timesheet value loop (dual-surface write + maker-checker SoD).
  const [u2] = await owner.insert(appUser).values({ email: `appr_${sfx}@x.test`, displayName: 'Approver' }).returning()
  if (!u2) throw new Error('seed approver failed')
  const approver: SessionContext = { ...ctx, userId: u2.id, sessionId: `sess2_${sfx}` }
  const line0 = created.value.lines[0]
  if (!line0) throw new Error('no wo line')
  const tdeps = buildTimesheetDeps(app, 'agent')

  const tsRes = await createTimesheet(
    ctx,
    {
      workOrderLineId: line0.id,
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      lines: [{ workDate: '2026-01-05', hours: 8 }, { workDate: '2026-01-06', hours: 8 }],
    },
    tdeps,
  )
  check('createTimesheet costed from the WO line rate (1000.00)', tsRes.ok && tsRes.value.timesheet.totalExcl === '1000.00')
  if (!tsRes.ok) throw new Error('ts create failed: ' + tsRes.error.kind)
  const tsId = tsRes.value.timesheet.id

  const sub = await transitionTimesheet(ctx, { timesheetId: tsId, transition: 'submit', expectedVersion: 1, eventId: crypto.randomUUID() }, tdeps)
  check('timesheet submit → SUBMITTED', sub.ok && sub.value.status === 'SUBMITTED')

  const selfApprove = await transitionTimesheet(ctx, { timesheetId: tsId, transition: 'approve', expectedVersion: 2, eventId: crypto.randomUUID() }, tdeps)
  check('SoD: submitter cannot self-approve', !selfApprove.ok && selfApprove.error.kind === 'sod_violation')

  const appr = await transitionTimesheet(approver, { timesheetId: tsId, transition: 'approve', expectedVersion: 2, eventId: crypto.randomUUID() }, tdeps)
  check('approve by a different referent → APPROVED', appr.ok && appr.value.status === 'APPROVED' && appr.value.approvedByUserId === u2.id)

  const [apprEv] = await owner
    .select()
    .from(eventLog)
    .where(sql`${eventLog.eventType} = 'TIMESHEET_LINE_APPROVED' AND ${eventLog.woLineId} = ${line0.id}`)
    .limit(1)
  check('TIMESHEET_LINE_APPROVED event at wo_line grain (the value event)', apprEv !== undefined)

  // Cleanup (FK order: events → timesheets → work orders [lines cascade] → tenants → users).
  await owner.delete(eventLog).where(sql`${eventLog.tenantId} IN (${t1.id}, ${t2.id})`)
  await owner.delete(timesheet).where(sql`${timesheet.tenantId} IN (${t1.id}, ${t2.id})`)
  await owner.delete(workOrder).where(sql`${workOrder.tenantId} IN (${t1.id}, ${t2.id})`)
  await owner.delete(tenant).where(sql`${tenant.id} IN (${t1.id}, ${t2.id})`)
  await owner.delete(appUser).where(sql`${appUser.id} IN (${u.id}, ${u2.id})`)

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
