import type { DomainCode } from '@/types/errorRegistry'
import type { WorkOrderError } from './schema'

/** Map a WorkOrderError to a registered domain code (the HTTP/problem+json bridge). */
export function workOrderErrorCode(error: WorkOrderError): DomainCode {
  switch (error.kind) {
    case 'duplicate_code':
      return 'WO_DUPLICATE_CODE'
    case 'not_found':
      return 'WO_NOT_FOUND'
    case 'invalid_transition':
      return 'WO_INVALID_TRANSITION'
    case 'version_conflict':
      return 'WO_VERSION_CONFLICT'
    default: {
      // Exhaustiveness: a new WorkOrderError kind makes this a compile error.
      const unhandled: never = error
      throw new Error(`unhandled work order error kind: ${JSON.stringify(unhandled)}`)
    }
  }
}
