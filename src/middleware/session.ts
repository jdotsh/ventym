import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../../config/bindings'
import { buildIdentityDeps } from '@/services/identity/deps'
import { loadDevSessionContext, loadSessionContext } from '@/services/identity/service'
import { logger, serializeError } from '@/utils/logger'

export const SESSION_COOKIE = 'wos_session'
export const DEV_SESSION_COOKIE = 'vms_dev' // local-only login bypass (see below)

/**
 * Resolves the WorkOS sealed session into our SessionContext on every request
 * (roles re-checked each time — revoke-immediately). Anonymous ⇒ session=null.
 */
export function createSessionMiddleware() {
  return createMiddleware<AppEnv>(async (c, next) => {
    // LOCAL-ONLY: a `vms_dev` cookie (carrying an email) resolves a session with NO
    // WorkOS round-trip. Gated on ENVIRONMENT — in any deployed env this branch never
    // runs and the cookie is ignored, so it can't be a backdoor.
    if (c.get('config').ENVIRONMENT === 'local') {
      const devEmail = getCookie(c, DEV_SESSION_COOKIE)
      if (devEmail) {
        try {
          c.set('session', await loadDevSessionContext(devEmail, buildIdentityDeps(c.get('db'))))
        } catch (err) {
          logger.warn('session.dev_load_failed', { traceId: c.get('traceId'), ...serializeError(err) })
          c.set('session', null)
        }
        return next()
      }
    }

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
