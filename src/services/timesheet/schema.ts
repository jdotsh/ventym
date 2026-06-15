import { z } from 'zod'
import type { TimesheetStatus } from '../../../db/schema'
import type { TimesheetTransition } from './machine'

export const timesheetLineInputSchema = z.object({
  workDate: z.string().date(),
  hours: z.number().positive().max(24),
  isOverride: z.boolean().optional(),
  overrideReason: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
})

export const createTimesheetSchema = z.object({
  workOrderLineId: z.string().uuid(),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  capacityOverride: z.boolean().optional(),
  capacityOverrideReason: z.string().max(500).optional(),
  lines: z.array(timesheetLineInputSchema).min(1),
})

export const transitionTimesheetSchema = z.object({
  expectedVersion: z.number().int().min(1),
  reason: z.string().max(500).optional(), // required for reject
})

export type TimesheetLineInput = z.infer<typeof timesheetLineInputSchema>
export type CreateTimesheetInput = z.infer<typeof createTimesheetSchema>

// Domain failures — discriminated, exhaustively handled, never thrown.
export type TimesheetError =
  | { kind: 'wo_line_not_found' }
  | { kind: 'duplicate_period' }
  | { kind: 'not_found' }
  | { kind: 'invalid_transition'; from: TimesheetStatus; transition: TimesheetTransition }
  | { kind: 'version_conflict' }
  | { kind: 'sod_violation' }
  | { kind: 'reason_required' }
