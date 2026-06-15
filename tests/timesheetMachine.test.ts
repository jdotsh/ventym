import { describe, expect, it } from 'vitest'
import { canTransition, nextStatus } from '@/services/timesheet/machine'

describe('timesheet lifecycle machine', () => {
  it('walks submit → approve', () => {
    expect(nextStatus('DRAFT', 'submit')).toBe('SUBMITTED')
    expect(nextStatus('SUBMITTED', 'approve')).toBe('APPROVED')
  })

  it('supports the reject → revise loop', () => {
    expect(nextStatus('SUBMITTED', 'reject')).toBe('REJECTED')
    expect(nextStatus('REJECTED', 'revise')).toBe('DRAFT')
  })

  it('rejects illegal transitions and locks terminal states', () => {
    expect(canTransition('DRAFT', 'approve')).toBe(false)
    expect(canTransition('APPROVED', 'approve')).toBe(false)
    expect(canTransition('BOOKED', 'revise')).toBe(false)
    expect(nextStatus('APPROVED', 'submit')).toBeNull()
  })
})
