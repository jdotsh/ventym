import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../../config/bindings'
import { withTenantScope, type TenantScope } from '../../config/db'
import { createIdempotencyRepo } from '@/tools/db/idempotencyRepo'
import { problemResponse } from '@/utils/problemResponse'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Durable, claim-first idempotency for mutating requests carrying an
 * `Idempotency-Key`. The first request claims the key (a row insert), runs the
 * handler, then stores its response; a retry replays the stored response, a
 * concurrent retry gets 409, and the same key with a different body gets 422.
 * Runs after RBAC, so only authorized requests touch the store.
 */
export function createIdempotency() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const key = c.req.header('idempotency-key')
    const session = c.get('session')
    if (SAFE_METHODS.has(c.req.method) || !key || !session) return next()

    const body = await c.req.raw.clone().text()
    const fingerprint = await sha256(`${c.req.method}:${c.req.path}:${body}`)
    const db = c.get('db')
    const scope: TenantScope = { tenantId: session.tenantId, userId: session.userId, sessionId: session.sessionId }
    const repo = createIdempotencyRepo(db)
    const traceId = c.get('traceId')

    const claim = await withTenantScope(db, scope, (tx) => repo.claim(tx, { tenantId: session.tenantId, key, fingerprint }))
    if (claim.kind === 'mismatch') return problemResponse(traceId, 'IDEMPOTENCY_MISMATCH')
    if (claim.kind === 'in_progress') return problemResponse(traceId, 'CONFLICT', { message: 'request already in progress' })
    if (claim.kind === 'replay') {
      return new Response(claim.body, {
        status: claim.statusCode,
        headers: { 'content-type': claim.contentType, 'idempotency-replayed': 'true' },
      })
    }

    // Claimed: run the handler, then persist its response (or release on 5xx/throw
    // so a retry can re-run — transient failures must not poison the key).
    try {
      await next()
    } catch (err) {
      await withTenantScope(db, scope, (tx) => repo.release(tx, { tenantId: session.tenantId, key }))
      throw err
    }
    const res = c.res
    if (res.status >= 500) {
      await withTenantScope(db, scope, (tx) => repo.release(tx, { tenantId: session.tenantId, key }))
      return
    }
    const captured = await res.clone().text()
    const contentType = res.headers.get('content-type') ?? 'application/json'
    await withTenantScope(db, scope, (tx) =>
      repo.complete(tx, { tenantId: session.tenantId, key, statusCode: res.status, body: captured, contentType }),
    )
  })
}

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
