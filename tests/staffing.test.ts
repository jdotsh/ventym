import { describe, expect, it } from 'vitest'
import type { Database } from '../config/db'
import type { AssignmentRow, VendorRow, WorkerRow } from '../db/schema'
import type { StaffingRepo, WorkerWithPii } from '@/tools/db/staffingRepo'
import type { SessionContext } from '@/services/identity/service'
import { createAssignment, createWorker, type StaffingDeps } from '@/services/staffing/service'
import { staffingErrorCode } from '@/services/staffing/httpError'
import { canTransition, nextStatus } from '@/services/staffing/machine'

const ctx: SessionContext = {
  userId: 'u1',
  email: 'm@acme.test',
  displayName: 'M',
  tenantId: 't1',
  sessionId: 's1',
  roles: ['MANAGER'],
  activeRole: 'MANAGER',
}

// Configurable in-memory fake — exposes what was written so we can assert PII routing.
function fakeStaffing(opts: { lineDays?: string | null; allocated?: number; vendorExists?: boolean; workerExists?: boolean } = {}) {
  const pii = new Map<string, { name: string; email: string | null }>()
  const events: { eventType: string; payload: Record<string, unknown> }[] = []
  let n = 0
  const repo: StaffingRepo = {
    insertVendor: async () => null,
    listVendors: async () => [],
    listWorkers: async () => [],
    findVendorById: async (_tx, _t, id): Promise<VendorRow | null> =>
      opts.vendorExists === false ? null : { id, tenantId: 't1', version: 1, code: 'V', name: 'Vendor', vatNumber: null, status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() },
    insertPartyPii: async (_tx, i) => {
      pii.set(i.partyId, { name: i.name, email: i.email })
    },
    insertWorker: async (_tx, v): Promise<WorkerRow> => ({
      id: v.id ?? `w_${++n}`,
      tenantId: v.tenantId,
      vendorId: v.vendorId,
      partyId: v.partyId,
      skillCode: v.skillCode ?? null,
      seniorityCode: v.seniorityCode ?? null,
      externalId: v.externalId ?? null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    findWorkerWithPii: async (): Promise<WorkerWithPii | null> => null,
    workerExists: async () => opts.workerExists !== false,
    findLinePlannedDays: async () => (opts.lineDays === undefined ? '10.00' : opts.lineDays),
    sumActiveAssignedDays: async () => opts.allocated ?? 0,
    insertAssignment: async (_tx, v): Promise<AssignmentRow> => ({
      id: v.id ?? `a_${++n}`,
      tenantId: v.tenantId,
      version: 1,
      workOrderLineId: v.workOrderLineId,
      workerId: v.workerId,
      status: 'PENDING',
      plannedDays: v.plannedDays,
      startDate: v.startDate,
      endDate: v.endDate,
      endReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    findAssignmentById: async () => null,
    updateAssignmentStatus: async () => null,
    eventExists: async () => false,
    appendEvent: async (_tx, e) => {
      events.push({ eventType: e.eventType, payload: (e.payload ?? {}) as Record<string, unknown> })
      return true
    },
  }
  return { repo, pii, events }
}

const makeDeps = (repo: StaffingRepo): StaffingDeps => ({
  repo,
  withTenantScope: (_scope, fn) => fn({} as Database),
  uuid: (() => {
    let i = 0
    return () => `id_${++i}`
  })(),
  now: () => new Date('2026-06-16T00:00:00.000Z'),
  actorKind: 'human',
})

describe('createWorker — PII isolation', () => {
  it('routes person-PII to party_pii and keeps the event PII-free', async () => {
    const store = fakeStaffing()
    const res = await createWorker(
      ctx,
      { vendorId: '00000000-0000-4000-8000-000000000001', name: 'Mario Rossi', email: 'mario@vendor.test', skillCode: 'JAVA', seniorityCode: 'SENIOR' },
      makeDeps(store.repo),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    // PII lives in the sensitive store, not on the worker row.
    expect([...store.pii.values()][0]).toEqual({ name: 'Mario Rossi', email: 'mario@vendor.test' })
    expect(res.value).not.toHaveProperty('name', undefined)
    expect(Object.prototype.hasOwnProperty.call(res.value, 'partyId')).toBe(true)
    // The WORKER_CREATED event carries native codes — never the person's name.
    const ev = store.events.find((e) => e.eventType === 'WORKER_CREATED')
    expect(ev?.payload).toMatchObject({ skillCode: 'JAVA', seniorityCode: 'SENIOR' })
    expect(JSON.stringify(ev?.payload)).not.toContain('Mario')
  })

  it('rejects an unknown vendor', async () => {
    const store = fakeStaffing({ vendorExists: false })
    const res = await createWorker(ctx, { vendorId: '00000000-0000-4000-8000-000000000009', name: 'X' }, makeDeps(store.repo))
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.kind).toBe('vendor_not_found')
  })
})

describe('createAssignment — I6 capacity', () => {
  const input = {
    workOrderLineId: '00000000-0000-4000-8000-000000000002',
    workerId: '00000000-0000-4000-8000-000000000003',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    plannedDays: 5,
  }

  it('allows an assignment within the line capacity', async () => {
    const res = await createAssignment(ctx, input, makeDeps(fakeStaffing({ lineDays: '10.00', allocated: 3 }).repo))
    expect(res.ok).toBe(true) // 3 + 5 ≤ 10
  })

  it('rejects an assignment that exceeds the line planned days (I6)', async () => {
    const res = await createAssignment(ctx, input, makeDeps(fakeStaffing({ lineDays: '10.00', allocated: 8 }).repo))
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.kind).toBe('capacity_exceeded') // 8 + 5 > 10
    expect(staffingErrorCode(res.error)).toBe('CAPACITY_EXCEEDED')
  })

  it('rejects an unknown WO line', async () => {
    const res = await createAssignment(ctx, input, makeDeps(fakeStaffing({ lineDays: null }).repo))
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.kind).toBe('wo_line_not_found')
  })
})

describe('assignment machine + error mapping', () => {
  it('PENDING/ACTIVE → ENDED, terminal locked', () => {
    expect(nextStatus('PENDING', 'end')).toBe('ENDED')
    expect(nextStatus('ACTIVE', 'end')).toBe('ENDED')
    expect(canTransition('ENDED', 'end')).toBe(false)
  })

  it('maps every StaffingError kind', () => {
    expect(staffingErrorCode({ kind: 'vendor_not_found' })).toBe('VENDOR_NOT_FOUND')
    expect(staffingErrorCode({ kind: 'vendor_duplicate_code' })).toBe('VENDOR_DUPLICATE_CODE')
    expect(staffingErrorCode({ kind: 'worker_not_found' })).toBe('WORKER_NOT_FOUND')
    expect(staffingErrorCode({ kind: 'assignment_not_found' })).toBe('ASSIGNMENT_NOT_FOUND')
    expect(staffingErrorCode({ kind: 'invalid_transition', from: 'ENDED', transition: 'end' })).toBe('ASSIGNMENT_INVALID_TRANSITION')
    expect(staffingErrorCode({ kind: 'version_conflict' })).toBe('CONFLICT')
  })
})
