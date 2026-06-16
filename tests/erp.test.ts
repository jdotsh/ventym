import { describe, expect, it } from 'vitest'
import { erpErrorCode } from '@/services/erp/httpError'
import { createMockErpAdapter } from '@/tools/erp/adapter'
import { buildErpAdapter } from '@/tools/erp/factory'

describe('erpErrorCode mapping', () => {
  it('maps every ErpError kind to a registered domain code', () => {
    expect(erpErrorCode({ kind: 'wo_not_found' })).toBe('WO_NOT_FOUND')
    expect(erpErrorCode({ kind: 'already_linked' })).toBe('WO_ERP_ALREADY_LINKED')
    expect(erpErrorCode({ kind: 'version_conflict' })).toBe('CONFLICT')
    expect(erpErrorCode({ kind: 'ts_not_found' })).toBe('TS_NOT_FOUND')
    expect(erpErrorCode({ kind: 'ts_not_approved' })).toBe('TS_INVALID_TRANSITION')
    expect(erpErrorCode({ kind: 'erp_not_linked' })).toBe('ERP_NOT_LINKED')
    expect(erpErrorCode({ kind: 'erp_send_failed', retriable: true })).toBe('ERP_SEND_FAILED')
    expect(erpErrorCode({ kind: 'erp_skipped', reason: 'zero-amount' })).toBe('ERP_EXPORT_SKIPPED')
  })
})

const req = (over: Partial<Parameters<ReturnType<typeof createMockErpAdapter>['send']>[0]> = {}) => ({
  kind: 'GOODS_RECEIPT' as const,
  tenantId: 't',
  entityType: 'timesheet',
  entityId: 'e',
  exportLogId: 'export-1',
  poCode: 'PO1',
  amountExcl: '100.00',
  currency: 'EUR',
  ...over,
})

describe('mock ERP adapter', () => {
  it('is deterministic — same exportLogId yields the same doc ref', async () => {
    const adapter = createMockErpAdapter()
    const a = await adapter.send(req())
    const b = await adapter.send(req())
    expect(a).toEqual(b)
    expect(a.type).toBe('sent')
    if (a.type === 'sent') expect(a.erpDocumentRef).toMatch(/^GR-/)
  })

  it('uses the SES prefix for a service-entry-sheet kind', async () => {
    const r = await createMockErpAdapter().send(req({ kind: 'SERVICE_ENTRY_SHEET' }))
    expect(r.type === 'sent' && r.erpDocumentRef.startsWith('SES-')).toBe(true)
  })

  it('skips a zero-amount posting (never a synthetic success)', async () => {
    const r = await createMockErpAdapter().send(req({ amountExcl: '0' }))
    expect(r).toEqual({ type: 'skipped', reason: 'zero-amount' })
  })
})

describe('buildErpAdapter factory', () => {
  it('NONE provider yields the mock', async () => {
    const r = await buildErpAdapter({ provider: 'NONE' }).send(req())
    expect(r.type).toBe('sent')
  })

  it('HTTP provider with missing config fails TERMINAL — never a fabricated ref', async () => {
    const r = await buildErpAdapter({ provider: 'HTTP' }).send(req())
    expect(r).toMatchObject({ type: 'failed', retriable: false })
  })
})
