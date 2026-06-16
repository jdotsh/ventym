import { z } from 'zod'
import type { AssignmentStatus } from '../../../db/schema'
import type { AssignmentTransition } from './machine'

export const createVendorSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  vatNumber: z.string().max(50).optional(),
})

// Worker create carries person-PII (name/email) — the service routes it to
// sensitive.party_pii, never to the operational worker row or the event log.
export const createWorkerSchema = z.object({
  vendorId: z.string().uuid(),
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  skillCode: z.string().max(60).optional(),
  seniorityCode: z.string().max(40).optional(),
  externalId: z.string().max(100).optional(),
})

export const createAssignmentSchema = z.object({
  workOrderLineId: z.string().uuid(),
  workerId: z.string().uuid(),
  plannedDays: z.number().positive(),
  startDate: z.string().date(),
  endDate: z.string().date(),
})

export const transitionAssignmentSchema = z.object({
  expectedVersion: z.number().int().min(1),
  endReason: z.string().max(50).optional(), // for 'end'
})

export type CreateVendorInput = z.infer<typeof createVendorSchema>
export type CreateWorkerInput = z.infer<typeof createWorkerSchema>
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>

// Domain failures — discriminated, exhaustively handled.
export type StaffingError =
  | { kind: 'vendor_not_found' }
  | { kind: 'vendor_duplicate_code' }
  | { kind: 'worker_not_found' }
  | { kind: 'wo_line_not_found' }
  | { kind: 'assignment_not_found' }
  | { kind: 'capacity_exceeded'; lineDays: number; allocated: number; requested: number }
  | { kind: 'invalid_transition'; from: AssignmentStatus; transition: AssignmentTransition }
  | { kind: 'version_conflict' }
