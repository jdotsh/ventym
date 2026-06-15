import type { DomainCode } from '@/types/errorRegistry'
import type { ErpError } from './schema'

/** Map an ErpError to a registered domain code (the HTTP/problem+json bridge). */
export function erpErrorCode(error: ErpError): DomainCode {
  switch (error.kind) {
    case 'wo_not_found':
      return 'WO_NOT_FOUND'
    case 'already_linked':
      return 'WO_ERP_ALREADY_LINKED'
    case 'version_conflict':
      return 'CONFLICT'
    case 'ts_not_found':
      return 'TS_NOT_FOUND'
    case 'ts_not_approved':
      return 'TS_INVALID_TRANSITION'
    case 'erp_not_linked':
      return 'ERP_NOT_LINKED'
    default: {
      const unhandled: never = error
      throw new Error(`unhandled erp error kind: ${JSON.stringify(unhandled)}`)
    }
  }
}
