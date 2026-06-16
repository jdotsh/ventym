import { describe, expect, it } from 'vitest'
import type { Database } from '../config/db'
import type { WorkOrderLineRow, WorkOrderRow } from '../db/schema'
import type { WorkOrderRepo } from '@/tools/db/workOrderRepo'
import type { SessionContext } from '@/services/identity/service'
import { createWorkOrder, transitionWorkOrder, type WorkOrderDeps } from '@/services/workOrder/service'
import type { CreateWorkOrderInput } from '@/services/workOrder/schema'
import { workOrderErrorCode } from '@/services/workOrder/httpError'

const ctx: SessionContext = {
  userId: 'user_1',
  email: 'rto@acme.test',
  displayName: 'RTO',
  tenantId: 't_1',
  sessionId: 'sess_1',
  roles: ['MANAGER'],
  activeRole: 'MANAGER',
}

const validInput: CreateWorkOrderInput = {
  code: 'WO-1',
  engagementType: 'T_AND_M',
  currency: 'EUR',
  vatRate: 0.22,
  startDate: '2026-01-01',
  endDate: '2026-03-31',
  lines: [
    { lineNum: 1, roleCode: 'ENG', billRateDailyExcl: 500, plannedDays: 10 },
    { lineNum: 2, roleCode: 'PM', seniorityCode: 'SENIOR', categoryCode: 'IT', geoCode: 'IT-MI', billRateDailyExcl: 700, payRateDailyExcl: 400, plannedDays: 5 },
  ],
}

// In-memory fake of WorkOrderRepo — stores WOs + events so we can assert the
// transactional outbox (one event per line), idempotency, and optimistic locking.
function fakeStore() {
  const wos = new Map<string, WorkOrderRow>()
  const events = new Set<string>()
  const lines: WorkOrderLineRow[] = []
  let n = 0
  const repo: WorkOrderRepo = {
    insertWorkOrder: async (_tx, v) => {
      for (const w of wos.values()) if (w.tenantId === v.tenantId && w.code === v.code) return null
      const row: WorkOrderRow = {
        id: v.id ?? `wo_${++n}`,
        tenantId: v.tenantId,
        version: 1,
        code: v.code,
        engagementType: v.engagementType,
        lifecycleStatus: 'DRAFT',
        erpLinkStatus: 'UNLINKED',
        title: v.title ?? null,
        description: v.description ?? null,
        currency: v.currency ?? 'EUR',
        vatRate: v.vatRate,
        totalExcl: v.totalExcl ?? '0',
        startDate: v.startDate,
        endDate: v.endDate,
        vendorId: null,
        poCode: null,
        createdByUserId: v.createdByUserId,
        submittedAt: null,
        activatedAt: null,
        closedAt: null,
        cancelledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      wos.set(row.id, row)
      return row
    },
    insertLines: async (_tx, vals) => {
      const rows = vals.map(
        (v): WorkOrderLineRow => ({
          id: v.id ?? `ln_${++n}`,
          tenantId: v.tenantId,
          workOrderId: v.workOrderId,
          lineNum: v.lineNum,
          roleCode: v.roleCode,
          seniorityCode: v.seniorityCode ?? null,
          categoryCode: v.categoryCode ?? null,
          geoCode: v.geoCode ?? null,
          billRateDailyExcl: v.billRateDailyExcl,
          payRateDailyExcl: v.payRateDailyExcl ?? null,
          plannedDays: v.plannedDays,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      )
      lines.push(...rows)
      return rows
    },
    listByTenant: async (_tx, tenantId, limit) =>
      [...wos.values()].filter((w) => w.tenantId === tenantId).slice(0, limit),
    findById: async (_tx, tenantId, id) => {
      const w = wos.get(id)
      return w && w.tenantId === tenantId ? w : null
    },
    updateForTransition: async (_tx, i) => {
      const w = wos.get(i.id)
      if (!w || w.tenantId !== i.tenantId || w.version !== i.expectedVersion) return null
      const u: WorkOrderRow = { ...w, lifecycleStatus: i.status, version: w.version + 1, updatedAt: i.now, ...i.stamps }
      wos.set(w.id, u)
      return u
    },
    findErpStatusByLine: async () => null,
    linkErp: async () => null,
    eventExists: async (_tx, _t, eventId) => events.has(eventId),
    appendEvent: async (_tx, e) => {
      if (events.has(e.eventId)) return false
      events.add(e.eventId)
      return true
    },
  }
  return { repo, wos, events, lines }
}

const makeDeps = (repo: WorkOrderRepo): WorkOrderDeps => ({
  repo,
  withTenantScope: (_scope, fn) => fn({} as Database),
  uuid: (() => {
    let i = 0
    return () => `id_${++i}`
  })(),
  now: () => new Date('2026-06-15T00:00:00.000Z'),
  actorKind: 'human',
})

describe('createWorkOrder (transactional outbox)', () => {
  it('creates a DRAFT order, sums the total, appends one event per line', async () => {
    const store = fakeStore()
    const res = await createWorkOrder(ctx, validInput, makeDeps(store.repo))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.workOrder.lifecycleStatus).toBe('DRAFT')
    expect(res.value.workOrder.totalExcl).toBe('8500.00') // 500*10 + 700*5
    expect(res.value.lines).toHaveLength(2)
    expect(store.events.size).toBe(2)
  })

  it('rejects a duplicate (tenant, code)', async () => {
    const store = fakeStore()
    const deps = makeDeps(store.repo)
    await createWorkOrder(ctx, validInput, deps)
    const res = await createWorkOrder(ctx, validInput, deps)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.kind).toBe('duplicate_code')
  })
})

describe('transitionWorkOrder (optimistic + idempotent)', () => {
  async function seeded() {
    const store = fakeStore()
    const deps = makeDeps(store.repo)
    const created = await createWorkOrder(ctx, validInput, deps)
    if (!created.ok) throw new Error('seed failed')
    return { store, deps, id: created.value.workOrder.id }
  }

  it('submits a DRAFT order, stamping and versioning it', async () => {
    const { store, deps, id } = await seeded()
    const res = await transitionWorkOrder(ctx, { workOrderId: id, transition: 'submit', expectedVersion: 1, eventId: 'evt_1' }, deps)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.lifecycleStatus).toBe('PENDING_VENDOR_ACCEPT')
    expect(res.value.version).toBe(2)
    expect(res.value.submittedAt).not.toBeNull()
    expect(store.events.has('evt_1')).toBe(true)
  })

  it('rejects an illegal transition', async () => {
    const { deps, id } = await seeded()
    const res = await transitionWorkOrder(ctx, { workOrderId: id, transition: 'close', expectedVersion: 1, eventId: 'evt_x' }, deps)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.kind).toBe('invalid_transition')
  })

  it('rejects a stale version', async () => {
    const { deps, id } = await seeded()
    const res = await transitionWorkOrder(ctx, { workOrderId: id, transition: 'submit', expectedVersion: 99, eventId: 'evt_2' }, deps)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.kind).toBe('version_conflict')
  })

  it('returns not_found for an unknown order', async () => {
    const { deps } = await seeded()
    const res = await transitionWorkOrder(ctx, { workOrderId: 'nope', transition: 'submit', expectedVersion: 1, eventId: 'evt_3' }, deps)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error.kind).toBe('not_found')
  })

  it('is idempotent: replaying the same event_id is a no-op', async () => {
    const { store, deps, id } = await seeded()
    await transitionWorkOrder(ctx, { workOrderId: id, transition: 'submit', expectedVersion: 1, eventId: 'evt_dup' }, deps)
    const before = store.events.size
    const replay = await transitionWorkOrder(ctx, { workOrderId: id, transition: 'submit', expectedVersion: 1, eventId: 'evt_dup' }, deps)
    expect(replay.ok).toBe(true)
    if (!replay.ok) return
    expect(replay.value.version).toBe(2) // not bumped again
    expect(store.events.size).toBe(before) // no new event
  })
})

describe('workOrderErrorCode mapping', () => {
  it('maps every WorkOrderError kind to a registered domain code', () => {
    expect(workOrderErrorCode({ kind: 'duplicate_code', code: 'WO-1' })).toBe('WO_DUPLICATE_CODE')
    expect(workOrderErrorCode({ kind: 'not_found' })).toBe('WO_NOT_FOUND')
    expect(workOrderErrorCode({ kind: 'invalid_transition', from: 'DRAFT', transition: 'close' })).toBe('WO_INVALID_TRANSITION')
    expect(workOrderErrorCode({ kind: 'version_conflict' })).toBe('WO_VERSION_CONFLICT')
  })
})
