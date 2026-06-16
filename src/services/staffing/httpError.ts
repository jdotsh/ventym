import type { DomainCode } from '@/types/errorRegistry'
import type { StaffingError } from './schema'

/** Map a StaffingError to a registered domain code (the HTTP/problem+json bridge). */
export function staffingErrorCode(error: StaffingError): DomainCode {
  switch (error.kind) {
    case 'vendor_not_found':
      return 'VENDOR_NOT_FOUND'
    case 'vendor_duplicate_code':
      return 'VENDOR_DUPLICATE_CODE'
    case 'worker_not_found':
      return 'WORKER_NOT_FOUND'
    case 'wo_line_not_found':
      return 'WO_LINE_NOT_FOUND'
    case 'assignment_not_found':
      return 'ASSIGNMENT_NOT_FOUND'
    case 'capacity_exceeded':
      return 'CAPACITY_EXCEEDED'
    case 'invalid_transition':
      return 'ASSIGNMENT_INVALID_TRANSITION'
    case 'version_conflict':
      return 'CONFLICT'
    default: {
      const unhandled: never = error
      throw new Error(`unhandled staffing error kind: ${JSON.stringify(unhandled)}`)
    }
  }
}
