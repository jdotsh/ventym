import { isDomainCode, resolveError, type DomainCode } from '@/types/errorRegistry'
import type { AppError } from '@/types/errors'

// RFC 7807 problem+json — the one error envelope for every JSON/agent surface.
// `buildProblem` is pure (unit-testable); `problemResponse` wraps it in a Response.

export type ProblemOptions = {
  message?: string
  details?: Record<string, unknown>
}

export type Problem = {
  status: number
  headers: Record<string, string>
  body: { error: Record<string, unknown> }
}

export function buildProblem(traceId: string, code: DomainCode, opts: ProblemOptions = {}): Problem {
  const e = resolveError(code)
  const error: Record<string, unknown> = {
    code: e.domain,
    grpc: e.grpc,
    message: opts.message ?? e.description,
    trace_id: traceId,
  }
  if (opts.details) error.details = opts.details
  const headers: Record<string, string> = {
    'content-type': 'application/problem+json',
    'x-vms-error-code': e.domain,
    'x-trace-id': traceId,
  }
  if (e.retryable && e.retryAfterSeconds !== undefined) {
    error.retry_after = e.retryAfterSeconds
    headers['retry-after'] = String(e.retryAfterSeconds)
  }
  return { status: e.httpStatus, headers, body: { error } }
}

export function problemResponse(traceId: string, code: DomainCode, opts: ProblemOptions = {}): Response {
  const p = buildProblem(traceId, code, opts)
  return new Response(JSON.stringify(p.body), { status: p.status, headers: p.headers })
}

/** Map a thrown AppError to a problem response (unknown codes degrade to INTERNAL). */
export function appErrorToProblem(err: AppError, traceId: string): Response {
  const code: DomainCode = isDomainCode(err.code) ? err.code : 'INTERNAL'
  const details = err.details ? { fields: err.details } : undefined
  return problemResponse(traceId, code, { message: err.message, ...(details ? { details } : {}) })
}
