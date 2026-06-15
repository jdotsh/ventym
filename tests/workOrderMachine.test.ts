import { describe, expect, it } from 'vitest'
import { canTransition, nextStatus } from '@/services/workOrder/machine'

describe('work order lifecycle machine', () => {
  it('walks the happy bilateral path', () => {
    expect(nextStatus('DRAFT', 'submit')).toBe('PENDING_VENDOR_ACCEPT')
    expect(nextStatus('PENDING_VENDOR_ACCEPT', 'vendor_accept')).toBe('ACCEPTED_BY_VENDOR')
    expect(nextStatus('ACCEPTED_BY_VENDOR', 'activate')).toBe('ACTIVE')
    expect(nextStatus('ACTIVE', 'close')).toBe('CLOSED')
  })

  it('supports the vendor-reject correction loop', () => {
    expect(nextStatus('PENDING_VENDOR_ACCEPT', 'vendor_reject')).toBe('REJECTED_BY_VENDOR')
    expect(nextStatus('REJECTED_BY_VENDOR', 'revise')).toBe('DRAFT')
  })

  it('expires a pending order and cancels from active states', () => {
    expect(nextStatus('PENDING_VENDOR_ACCEPT', 'expire')).toBe('EXPIRED')
    expect(nextStatus('ACTIVE', 'cancel')).toBe('CANCELLED')
    expect(nextStatus('DRAFT', 'cancel')).toBe('CANCELLED')
  })

  it('rejects illegal transitions', () => {
    expect(canTransition('DRAFT', 'close')).toBe(false)
    expect(canTransition('ACTIVE', 'submit')).toBe(false)
    expect(nextStatus('DRAFT', 'activate')).toBeNull()
  })

  it('locks terminal states', () => {
    for (const terminal of ['CLOSED', 'CANCELLED', 'EXPIRED'] as const) {
      expect(canTransition(terminal, 'cancel')).toBe(false)
      expect(canTransition(terminal, 'activate')).toBe(false)
    }
  })
})
