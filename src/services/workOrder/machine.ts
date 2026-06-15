import type { WoLifecycleStatus } from '../../../db/schema'

// The bilateral Work Order lifecycle (client ↔ vendor). Documented before coded.
//
//   DRAFT ──submit──► PENDING_VENDOR_ACCEPT ──vendor_accept──► ACCEPTED_BY_VENDOR
//                          │       │                                   │
//          vendor_reject ◄─┘       └──expire──► EXPIRED          activate│
//                │                                                       ▼
//   REJECTED_BY_VENDOR ──revise──► DRAFT                              ACTIVE ──close──► CLOSED
//
//   * ──cancel──► CANCELLED   (from any non-terminal state)
export type WoTransition =
  | 'submit'
  | 'vendor_accept'
  | 'vendor_reject'
  | 'revise'
  | 'activate'
  | 'close'
  | 'cancel'
  | 'expire'

const TRANSITIONS: Readonly<Record<WoLifecycleStatus, Partial<Record<WoTransition, WoLifecycleStatus>>>> = {
  DRAFT: { submit: 'PENDING_VENDOR_ACCEPT', cancel: 'CANCELLED' },
  PENDING_VENDOR_ACCEPT: {
    vendor_accept: 'ACCEPTED_BY_VENDOR',
    vendor_reject: 'REJECTED_BY_VENDOR',
    expire: 'EXPIRED',
    cancel: 'CANCELLED',
  },
  REJECTED_BY_VENDOR: { revise: 'DRAFT', cancel: 'CANCELLED' },
  ACCEPTED_BY_VENDOR: { activate: 'ACTIVE', cancel: 'CANCELLED' },
  ACTIVE: { close: 'CLOSED', cancel: 'CANCELLED' },
  CLOSED: {},
  CANCELLED: {},
  EXPIRED: {},
}

/** The status `transition` lands in, or null when it isn't allowed from `from`. */
export function nextStatus(from: WoLifecycleStatus, transition: WoTransition): WoLifecycleStatus | null {
  return TRANSITIONS[from][transition] ?? null
}

export function canTransition(from: WoLifecycleStatus, transition: WoTransition): boolean {
  return nextStatus(from, transition) !== null
}
