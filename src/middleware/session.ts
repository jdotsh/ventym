import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../../config/bindings'
import { buildIdentityDeps } from '@/services/identity/deps'
import { loadSessionContext } from '@/services/identity/service'
import { logger, serializeError } from '@/utils/logger'

export const SESSION_COOKIE = 'wos_session'

/**
 * Resolves the WorkOS sealed session into our SessionContext on every request
 * (roles re-checked each time — revoke-immediately). Anonymous ⇒ session=null.
 */
export function createSessionMiddleware() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const sealed = getCookie(c, SESSION_COOKIE)
    if (!sealed) {
      c.set('session', null)
      return next()
    }
    try {
      const identity = await c.get('workos').authenticateSession(sealed)
      c.set('session', identity ? await loadSessionContext(identity, buildIdentityDeps(c.get('db'))) : null)
    } catch (err) {
      logger.warn('session.load_failed', { traceId: c.get('traceId'), ...serializeError(err) })
      c.set('session', null)
    }
    return next()
  })
}
