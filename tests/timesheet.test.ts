import { describe, expect, it } from 'vitest'
import type { Database } from '../config/db'
import type { TimesheetLineRow, TimesheetRow } from '../db/schema'
import type { TimesheetRepo } from '@/tools/db/timesheetRepo'
import type { SessionContext } from '@/services/identity/service'
import { createTimesheet, transitionTimesheet, type TimesheetDeps } from '@/services/timesheet/service'
import { timesheetErrorCode } from '@/services/timesheet/httpError'
import type { CreateTimesheetInput } from '@/services/timesheet/schema'

const ctx = (userId: string): SessionContext => ({
  userId,
  email: `${userId}@acme.test`,
  displayName: userId,
  tenantId: 't1',
  sessionId: `sess_${userId}`,
  roles: ['MANAGER'],
  activeRole: 'MANAGER',
})
const submitter = ctx('vendor_1')
const approver = ctx('referent_2')

const input: CreateTimesheetInput = {
  workOrderLineId: '00000000-0000-4000-8000-000000000001',
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  lines: [
    { workDate: '2026-01-05', hours: 8 },
    { workDate: '2026-01-06', hours: 8 },
  ],
}

function fakeStore(rate: string | null = '500.0000') {
  const sheets = new Map<string, TimesheetRow>()
  const events = new Set<string>()
  let n = 0
  const repo: TimesheetRepo = {
    findWorkOrderLineRate: async () => rate,
    insertTimesheet: async (_tx, v) => {
      for (const s of sheets.values())
        if (s.tenantId === v.tenantId && s.workOrderLineId === v.workOrderLineId && s.periodStart === v.periodStart) return null
      const row: TimesheetRow = {
        id: v.id ?? `ts_${++n}`,
        tenantId: v.tenantId,
        version: 1,
        workOrderLineId: v.workOrderLineId,
        periodStart: v.periodStart,
        periodEnd: v.periodEnd,
        status: 'DRAFT',
        totalHours: v.totalHours ?? '0',
        totalDaysEquivalent: v.totalDaysEquivalent ?? '0',
        totalExcl: v.totalExcl ?? '0',
        capacityOverride: v.capacityOverride ?? false,
        capacityOverrideReason: v.capacityOverrideReason ?? null,
        submittedAt: null,
        approvedAt: null,
        rejectedAt: null,
        bookedAt: null,
        rejectionReason: null,
        erpDocumentRef: null,
        createdByUserId: v.createdByUserId,
        approvedByUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      sheets.set(row.id, row)
      return row
    },
    insertLines: async (_tx, vals) =>
      vals.map(
        (v): TimesheetLineRow => ({
          id: v.id ?? `tl_${++n}`,
          tenantId: v.tenantId,
          timesheetId: v.timesheetId,
          workDate: v.workDate,
          hours: v.hours,
          isOverride: v.isOverride ?? false,
          overrideReason: v.overrideReason ?? null,
          note: v.note ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
    findById: async (_tx, tenantId, id) => {
      const s = sheets.get(id)
      return s && s.tenantId === tenantId ? s : null
    },
    updateForTransition: async (_tx, i) => {
      const s = sheets.get(i.id)
      if (!s || s.tenantId !== i.tenantId || s.version !== i.expectedVersion) return null
      const u: TimesheetRow = { ...s, status: i.status, version: s.version + 1, updatedAt: i.now, ...i.fields }
      sheets.set(s.id, u)
      return u
    },
    eventExists: async (_tx, _t, eventId) => events.has(eventId),
    appendEvent: async (_tx, e) => {
      if (events.has(e.eventId)) return false
      events.add(e.eventId)
      return true
    },
  }
  return { repo, sheets, events }
}

const makeDeps = (repo: TimesheetRepo): TimesheetDeps => ({
  repo,
  withTenantScope: (_scope, fn) => fn({} as Database),
  uuid: (() => {
    let i = 0
    return () => `id_${++i}`
  })(),
  now: () => new Date('2026-06-16T00:00:00.000Z'),
  actorKind: 'human',
})

describe('createTimesheet', () => {
  it('costs the timesheet from the WO line rate (2 days × 500 = 1000)', async () => {
    const res = await createTimesheet(submitter, input, makeDeps(fakeStore().repo))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.timesheet.totalHours).toBe('16.00')
    expect(res.value.timesheet.totalDaysEquivalent).toBe('2.0000')
    expect(res.value.timesheet.totalExcl).toBe('1000.00')
    expect(res.value.lines).toHaveLength(2)
  })

  it('rejects an unknown WO line', async () => {
    const res = await createTimesheet(submitter, input, makeDeps(fakeStore(null).repo))
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.kind).toBe('wo_line_not_found')
  })

  it('rejects a duplicate (tenant, line, period)', async () => {
    const store = fakeStore()
    const deps = makeDeps(store.repo)
    await createTimesheet(submitter, input, deps)
    const res = await createTimesheet(submitter, input, deps)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.kind).toBe('duplicate_period')
  })
})

describe('transitionTimesheet — governance', () => {
  async function seeded() {
    const store = fakeStore()
    const deps = makeDeps(store.repo)
    const created = await createTimesheet(submitter, input, deps)
    if (!created.ok) throw new Error('seed failed')
    const id = created.value.timesheet.id
    await transitionTimesheet(submitter, { timesheetId: id, transition: 'submit', expectedVersion: 1, eventId: 'e_submit' }, deps)
    return { store, deps, id }
  }

  it('submit stamps and emits TIMESHEET_SUBMITTED', async () => {
    const { store, deps, id } = await seeded()
    const ts = await deps.repo.findById({} as Database, 't1', id)
    expect(ts?.status).toBe('SUBMITTED')
    expect(ts?.submittedAt).not.toBeNull()
    expect(store.events.has('e_submit')).toBe(true)
  })

  it('approves when the approver is NOT the submitter (maker-checker)', async () => {
    const { deps, id } = await seeded()
    const res = await transitionTimesheet(approver, { timesheetId: id, transition: 'approve', expectedVersion: 2, eventId: 'e_appr' }, deps)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.status).toBe('APPROVED')
    expect(res.value.approvedByUserId).toBe(approver.userId)
  })

  it('rejects self-approval (SoD violation)', async () => {
    const { deps, id } = await seeded()
    const res = await transitionTimesheet(submitter, { timesheetId: id, transition: 'approve', expectedVersion: 2, eventId: 'e_self' }, deps)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.kind).toBe('sod_violation')
    expect(timesheetErrorCode(res.error)).toBe('SOD_VIOLATION')
  })

  it('requires a reason to reject', async () => {
    const { deps, id } = await seeded()
    const res = await transitionTimesheet(approver, { timesheetId: id, transition: 'reject', expectedVersion: 2, eventId: 'e_rej' }, deps)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.kind).toBe('reason_required')
  })

  it('rejects with a reason → REJECTED', async () => {
    const { deps, id } = await seeded()
    const res = await transitionTimesheet(
      approver,
      { timesheetId: id, transition: 'reject', expectedVersion: 2, eventId: 'e_rej2', reason: 'hours mismatch' },
      deps,
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.status).toBe('REJECTED')
    expect(res.value.rejectionReason).toBe('hours mismatch')
  })

  it('is idempotent on replay and guards stale versions', async () => {
    const { deps, id } = await seeded()
    const replay = await transitionTimesheet(submitter, { timesheetId: id, transition: 'submit', expectedVersion: 1, eventId: 'e_submit' }, deps)
    expect(replay.ok).toBe(true)
    if (!replay.ok) return
    expect(replay.value.status).toBe('SUBMITTED') // not re-applied

    const stale = await transitionTimesheet(approver, { timesheetId: id, transition: 'approve', expectedVersion: 99, eventId: 'e_stale' }, deps)
    expect(stale.ok).toBe(false)
    if (stale.ok) return
    expect(stale.error.kind).toBe('version_conflict')
  })
})
