import type { DomainCode } from '@/types/errorRegistry'
import type { TimesheetError } from './schema'

/** Map a TimesheetError to a registered domain code (the HTTP/problem+json bridge). */
export function timesheetErrorCode(error: TimesheetError): DomainCode {
  switch (error.kind) {
    case 'wo_line_not_found':
      return 'TS_WO_LINE_NOT_FOUND'
    case 'duplicate_period':
      return 'TS_DUPLICATE_PERIOD'
    case 'not_found':
      return 'TS_NOT_FOUND'
    case 'invalid_transition':
      return 'TS_INVALID_TRANSITION'
    case 'version_conflict':
      return 'TS_VERSION_CONFLICT'
    case 'sod_violation':
      return 'SOD_VIOLATION'
    case 'reason_required':
      return 'REASON_REQUIRED'
    default: {
      const unhandled: never = error
      throw new Error(`unhandled timesheet error kind: ${JSON.stringify(unhandled)}`)
    }
  }
}
