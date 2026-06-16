import { z } from 'zod'

export const linkPoSchema = z.object({
  poCode: z.string().min(1).max(100),
  expectedVersion: z.number().int().min(1),
})

export const bookSchema = z.object({
  expectedVersion: z.number().int().min(1),
})

// Domain failures for the money loop — discriminated, exhaustively handled.
export type ErpError =
  | { kind: 'wo_not_found' }
  | { kind: 'already_linked' }
  | { kind: 'version_conflict' }
  | { kind: 'ts_not_found' }
  | { kind: 'ts_not_approved' }
  | { kind: 'erp_not_linked' } // the parked-approval gate: WO not LINKED
  | { kind: 'erp_send_failed'; retriable: boolean } // the adapter could not post
  | { kind: 'erp_skipped'; reason: string } // intentional no-op (e.g. zero-amount)
