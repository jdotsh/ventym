import { describe, expect, it } from 'vitest'
import { erpErrorCode } from '@/services/erp/httpError'
import { createStubErpAdapter } from '@/tools/erp/adapter'

describe('erpErrorCode mapping', () => {
  it('maps every ErpError kind to a registered domain code', () => {
    expect(erpErrorCode({ kind: 'wo_not_found' })).toBe('WO_NOT_FOUND')
    expect(erpErrorCode({ kind: 'already_linked' })).toBe('WO_ERP_ALREADY_LINKED')
    expect(erpErrorCode({ kind: 'version_conflict' })).toBe('CONFLICT')
    expect(erpErrorCode({ kind: 'ts_not_found' })).toBe('TS_NOT_FOUND')
    expect(erpErrorCode({ kind: 'ts_not_approved' })).toBe('TS_INVALID_TRANSITION')
    expect(erpErrorCode({ kind: 'erp_not_linked' })).toBe('ERP_NOT_LINKED')
  })
})

describe('stub ERP adapter', () => {
  it('is deterministic — same payload yields the same goods-receipt ref', async () => {
    const adapter = createStubErpAdapter()
    const payload = { tenantId: 't', entityType: 'timesheet', entityId: 'e', poCode: 'PO1', amountExcl: '100.00', currency: 'EUR' }
    const a = await adapter.postGoodsReceipt(payload)
    const b = await adapter.postGoodsReceipt(payload)
    expect(a.erpDocumentRef).toBe(b.erpDocumentRef)
    expect(a.erpDocumentRef).toMatch(/^GR-/)
  })
})
