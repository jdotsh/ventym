import { describe, expect, it } from 'vitest'
import { isDomainCode, resolveError } from '@/types/errorRegistry'
import { appErrorToProblem, buildProblem } from '@/utils/problemResponse'
import { AuthorizationError, AppError } from '@/types/errors'
import { redactFields } from '@/utils/logger'

describe('error registry', () => {
  it('maps a domain code to its gRPC class + HTTP status', () => {
    const e = resolveError('WO_VERSION_CONFLICT')
    expect(e.grpc).toBe('ABORTED')
    expect(e.httpStatus).toBe(409)
    expect(e.retryable).toBe(true)
  })

  it('throws on an unregistered code (drift guard)', () => {
    // @ts-expect-error — 'NOPE' is not a DomainCode
    expect(() => resolveError('NOPE')).toThrow()
  })

  it('narrows known vs unknown codes', () => {
    expect(isDomainCode('WO_NOT_FOUND')).toBe(true)
    expect(isDomainCode('definitely_not')).toBe(false)
  })
})

describe('problem+json envelope (RFC 7807)', () => {
  it('builds the canonical shape with trace id', () => {
    const p = buildProblem('trace_1', 'WO_NOT_FOUND', { message: 'gone' })
    expect(p.status).toBe(404)
    expect(p.headers['content-type']).toBe('application/problem+json')
    expect(p.body.error.code).toBe('WO_NOT_FOUND')
    expect(p.body.error.grpc).toBe('NOT_FOUND')
    expect(p.body.error.trace_id).toBe('trace_1')
    expect(p.body.error.message).toBe('gone')
  })

  it('emits retry_after for retryable codes', () => {
    const p = buildProblem('t', 'RATE_LIMITED')
    expect(p.headers['retry-after']).toBe('60')
    expect(p.body.error.retry_after).toBe(60)
  })

  it('maps an AppError, degrading unknown codes to INTERNAL', async () => {
    const known = appErrorToProblem(new AuthorizationError(), 't')
    expect(known.status).toBe(403)

    const unknown = appErrorToProblem(new AppError('weird', 'MYSTERY', 500), 't')
    expect(unknown.status).toBe(500)
    const body = await unknown.json()
    expect(body).toMatchObject({ error: { code: 'INTERNAL' } })
  })
})

describe('logger PII redaction', () => {
  it('redacts secret keys and value patterns, masks emails', () => {
    const out = redactFields({
      password: 'hunter2',
      nested: { token: 'abc', email: 'ann@acme.test' },
      bearer: 'Bearer xyz.123',
      keep: 'visible',
    })
    expect(out.password).toBe('[redacted]')
    expect(out.nested).toMatchObject({ token: '[redacted]', email: 'u***@acme.test' })
    expect(out.bearer).toBe('[redacted]')
    expect(out.keep).toBe('visible')
  })
})
