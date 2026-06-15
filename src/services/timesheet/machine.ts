import type { TimesheetStatus } from '../../../db/schema'

// Timesheet lifecycle. Documented before coded.
//   DRAFT ──submit──► SUBMITTED ──approve──► APPROVED  (book→BOOKED is D4, ERP-gated)
//                         │ reject(reason)
//                         ▼
//                      REJECTED ──revise──► DRAFT
export const TIMESHEET_TRANSITIONS = ['submit', 'approve', 'reject', 'revise'] as const
export type TimesheetTransition = (typeof TIMESHEET_TRANSITIONS)[number]

const TRANSITIONS: Readonly<Record<TimesheetStatus, Partial<Record<TimesheetTransition, TimesheetStatus>>>> = {
  DRAFT: { submit: 'SUBMITTED' },
  SUBMITTED: { approve: 'APPROVED', reject: 'REJECTED' },
  APPROVED: {}, // book → BOOKED lands in D4 (gated on wo.erp_link_status = LINKED)
  REJECTED: { revise: 'DRAFT' },
  BOOKED: {},
}

export function nextStatus(from: TimesheetStatus, transition: TimesheetTransition): TimesheetStatus | null {
  return TRANSITIONS[from][transition] ?? null
}

export function canTransition(from: TimesheetStatus, transition: TimesheetTransition): boolean {
  return nextStatus(from, transition) !== null
}
