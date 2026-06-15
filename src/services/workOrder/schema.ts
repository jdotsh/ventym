import { z } from 'zod'
import { ENGAGEMENT_TYPES, type WoLifecycleStatus } from '../../../db/schema'
import type { WoTransition } from './machine'

// Zod is the SSOT: validate once at the boundary, trust inside. A line carries
// NATIVE structured codes (role/seniority/category/geo) — never free text.
export const workOrderLineInputSchema = z
  .object({
    lineNum: z.number().int().min(1),
    roleCode: z.string().min(1).max(100),
    seniorityCode: z.string().max(40).optional(),
    categoryCode: z.string().max(40).optional(),
    geoCode: z.string().max(40).optional(),
    billRateDailyExcl: z.number().nonnegative(),
    payRateDailyExcl: z.number().nonnegative().optional(),
    plannedDays: z.number().positive(),
  })
  .refine((l) => l.payRateDailyExcl === undefined || l.payRateDailyExcl <= l.billRateDailyExcl, {
    message: 'pay rate must not exceed bill rate',
    path: ['payRateDailyExcl'],
  })

export const createWorkOrderSchema = z.object({
  code: z.string().min(1).max(50),
  engagementType: z.enum(ENGAGEMENT_TYPES),
  title: z.string().max(300).optional(),
  description: z.string().optional(),
  currency: z.string().length(3).default('EUR'),
  vatRate: z.number().min(0).max(1),
  startDate: z.string().date(),
  endDate: z.string().date(),
  lines: z.array(workOrderLineInputSchema).min(1),
})

export type WorkOrderLineInput = z.infer<typeof workOrderLineInputSchema>
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>

// Domain failures as a discriminated union — exhaustively handled, never thrown.
export type WorkOrderError =
  | { kind: 'duplicate_code'; code: string }
  | { kind: 'not_found' }
  | { kind: 'invalid_transition'; from: WoLifecycleStatus; transition: WoTransition }
  | { kind: 'version_conflict' }
