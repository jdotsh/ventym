import type { AssignmentStatus } from '../../../db/schema'

// Assignment lifecycle (the staffing grain).
//   PENDING ──activate──► ACTIVE ──end──► ENDED
//      └──────────────────end──────────────► ENDED
export const ASSIGNMENT_TRANSITIONS = ['activate', 'end'] as const
export type AssignmentTransition = (typeof ASSIGNMENT_TRANSITIONS)[number]

const TRANSITIONS: Readonly<Record<AssignmentStatus, Partial<Record<AssignmentTransition, AssignmentStatus>>>> = {
  PENDING: { activate: 'ACTIVE', end: 'ENDED' },
  ACTIVE: { end: 'ENDED' },
  ENDED: {},
}

export function nextStatus(from: AssignmentStatus, transition: AssignmentTransition): AssignmentStatus | null {
  return TRANSITIONS[from][transition] ?? null
}

export function canTransition(from: AssignmentStatus, transition: AssignmentTransition): boolean {
  return nextStatus(from, transition) !== null
}
