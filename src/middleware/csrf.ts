import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../../config/bindings'
import { problemResponse } from '@/utils/problemResponse'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF wall for cookie-authenticated state changes. A forged cross-site request
 * carries the victim's session cookie, so any unsafe method made WITH a session
 * must be same-origin. Token/signature surfaces (agents, webhooks) carry no
 * ambient cookie ⇒ no CSRF vector ⇒ exempt. Runs after the session middleware.
 */
export function createCsrf() {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (SAFE_METHODS.has(c.req.method) || c.get('session') === null) return next()
    if (
      isSameOrigin(c.req.header('origin'), c.req.header('host')) ||
      c.req.header('sec-fetch-site') === 'same-origin'
    ) {
      return next()
    }
    return problemResponse(c.get('traceId'), 'FORBIDDEN', { message: 'CSRF: cross-site state change rejected' })
  })
}

function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
