/**
 * Central error registry — the single source of truth for every server-side
 * failure mode, in two layers (ported from Athena, seeded for vms-mvp):
 *
 *   1. gRPC canonical codes (16, frozen) — describe HOW a client reacts. They
 *      drive HTTP status, retryability, and log level. A generic SDK/agent reads
 *      only the gRPC code and retries uniformly.
 *   2. Domain codes — describe WHAT failed in business terms. Each maps to one
 *      gRPC code, so the gRPC class is chosen at definition time, never inline.
 */

// gRPC canonical codes — closed set of 16. Never edit.
export const GRPC_CODES = [
  'OK',
  'CANCELLED',
  'UNKNOWN',
  'INVALID_ARGUMENT',
  'DEADLINE_EXCEEDED',
  'NOT_FOUND',
  'ALREADY_EXISTS',
  'PERMISSION_DENIED',
  'RESOURCE_EXHAUSTED',
  'FAILED_PRECONDITION',
  'ABORTED',
  'OUT_OF_RANGE',
  'UNIMPLEMENTED',
  'INTERNAL',
  'UNAVAILABLE',
  'DATA_LOSS',
  'UNAUTHENTICATED',
] as const
export type GrpcCode = (typeof GRPC_CODES)[number]

export type GrpcMetadata = {
  httpStatus: number
  retryable: boolean
  logLevel: 'info' | 'warn' | 'error'
  pageable: boolean
}

export const GRPC_METADATA: Readonly<Record<GrpcCode, GrpcMetadata>> = {
  OK: { httpStatus: 200, retryable: false, logLevel: 'info', pageable: false },
  CANCELLED: { httpStatus: 499, retryable: false, logLevel: 'info', pageable: false },
  UNKNOWN: { httpStatus: 500, retryable: false, logLevel: 'error', pageable: true },
  INVALID_ARGUMENT: { httpStatus: 400, retryable: false, logLevel: 'warn', pageable: false },
  DEADLINE_EXCEEDED: { httpStatus: 504, retryable: true, logLevel: 'warn', pageable: false },
  NOT_FOUND: { httpStatus: 404, retryable: false, logLevel: 'info', pageable: false },
  ALREADY_EXISTS: { httpStatus: 409, retryable: false, logLevel: 'warn', pageable: false },
  PERMISSION_DENIED: { httpStatus: 403, retryable: false, logLevel: 'warn', pageable: false },
  RESOURCE_EXHAUSTED: { httpStatus: 429, retryable: true, logLevel: 'warn', pageable: false },
  FAILED_PRECONDITION: { httpStatus: 422, retryable: false, logLevel: 'warn', pageable: false },
  ABORTED: { httpStatus: 409, retryable: true, logLevel: 'warn', pageable: false },
  OUT_OF_RANGE: { httpStatus: 400, retryable: false, logLevel: 'warn', pageable: false },
  UNIMPLEMENTED: { httpStatus: 501, retryable: false, logLevel: 'error', pageable: true },
  INTERNAL: { httpStatus: 500, retryable: false, logLevel: 'error', pageable: true },
  UNAVAILABLE: { httpStatus: 503, retryable: true, logLevel: 'error', pageable: true },
  DATA_LOSS: { httpStatus: 500, retryable: false, logLevel: 'error', pageable: true },
  UNAUTHENTICATED: { httpStatus: 401, retryable: false, logLevel: 'warn', pageable: false },
}

export type DomainRegistryEntry = {
  grpc: GrpcCode
  description: string
  retryAfterSeconds?: number
}

// Domain codes — every error a vms-mvp service/route can emit. Add a row to
// register a new code; resolveError() throws on an unregistered code (drift guard).
export const DOMAIN_REGISTRY = {
  // Work Order lifecycle
  WO_NOT_FOUND: { grpc: 'NOT_FOUND', description: 'Work order not found in tenant scope' },
  WO_DUPLICATE_CODE: { grpc: 'ALREADY_EXISTS', description: 'A work order with this code already exists' },
  WO_INVALID_TRANSITION: { grpc: 'FAILED_PRECONDITION', description: 'Illegal lifecycle transition for current state' },
  WO_VERSION_CONFLICT: { grpc: 'ABORTED', description: 'Optimistic-lock version mismatch; reload and retry' },
  // Timesheet
  TS_NOT_FOUND: { grpc: 'NOT_FOUND', description: 'Timesheet not found in tenant scope' },
  TS_WO_LINE_NOT_FOUND: { grpc: 'NOT_FOUND', description: 'Work order line referenced by the timesheet not found' },
  TS_DUPLICATE_PERIOD: { grpc: 'ALREADY_EXISTS', description: 'A timesheet already exists for this line and period' },
  TS_INVALID_TRANSITION: { grpc: 'FAILED_PRECONDITION', description: 'Illegal timesheet transition for current state' },
  TS_VERSION_CONFLICT: { grpc: 'ABORTED', description: 'Optimistic-lock version mismatch; reload and retry' },
  SOD_VIOLATION: { grpc: 'PERMISSION_DENIED', description: 'Separation of duties: the approver cannot be the submitter' },
  REASON_REQUIRED: { grpc: 'INVALID_ARGUMENT', description: 'A reason is required for this action' },
  // Auth / authz
  UNAUTHORIZED: { grpc: 'UNAUTHENTICATED', description: 'Session missing or invalid' },
  FORBIDDEN: { grpc: 'PERMISSION_DENIED', description: 'Authenticated but not authorised for this action' },
  // Validation / input
  VALIDATION_ERROR: { grpc: 'INVALID_ARGUMENT', description: 'Request failed schema validation' },
  BAD_REQUEST: { grpc: 'INVALID_ARGUMENT', description: 'Malformed request' },
  IDEMPOTENCY_MISMATCH: { grpc: 'INVALID_ARGUMENT', description: 'Idempotency-Key reused with a different body' },
  // Generic / platform
  NOT_FOUND: { grpc: 'NOT_FOUND', description: 'Resource not found' },
  CONFLICT: { grpc: 'ABORTED', description: 'Concurrent modification; reload and retry' },
  RATE_LIMITED: { grpc: 'RESOURCE_EXHAUSTED', description: 'Rate limit exceeded', retryAfterSeconds: 60 },
  NOT_IMPLEMENTED: { grpc: 'UNIMPLEMENTED', description: 'Endpoint exists but the feature is not yet shipped' },
  INTERNAL: { grpc: 'INTERNAL', description: 'Unhandled server-side exception' },
} as const satisfies Record<string, DomainRegistryEntry>

export type DomainCode = keyof typeof DOMAIN_REGISTRY

export type ResolvedError = {
  domain: DomainCode
  grpc: GrpcCode
  description: string
  httpStatus: number
  retryable: boolean
  logLevel: 'info' | 'warn' | 'error'
  pageable: boolean
  retryAfterSeconds: number | undefined
}

/** Resolve a domain code to its full operational profile. Throws on drift. */
export function resolveError(code: DomainCode): ResolvedError {
  const entry: DomainRegistryEntry | undefined = DOMAIN_REGISTRY[code]
  if (!entry) throw new Error(`Unregistered error code: ${code}. Add it to DOMAIN_REGISTRY.`)
  const meta = GRPC_METADATA[entry.grpc]
  return {
    domain: code,
    grpc: entry.grpc,
    description: entry.description,
    httpStatus: meta.httpStatus,
    retryable: meta.retryable,
    logLevel: meta.logLevel,
    pageable: meta.pageable,
    retryAfterSeconds: entry.retryAfterSeconds,
  }
}

/** Narrow an arbitrary string to a registered DomainCode (boundary guard). */
export function isDomainCode(value: string): value is DomainCode {
  return value in DOMAIN_REGISTRY
}
