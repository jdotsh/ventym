import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../../config/bindings'
import { decideRbac, policyFor } from '@/config/rbacPolicy'
import { logger } from '@/utils/logger'

/**
 * Default-deny authorization wall. Matches every request to RBAC_POLICY; a route
 * absent from the policy is forbidden. Runs after the session middleware.
 */
export function requireRoutePolicy() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const session = c.get('session')
    const decision = decideRbac(policyFor(c.req.method, c.req.path), {
      authenticated: session !== null,
      roles: session?.roles ?? [],
    })
    if (decision.kind === 'allow') return next()
    if (decision.kind === 'login') return c.redirect('/auth/login')
    logger.warn('rbac.forbidden', {
      traceId: c.get('traceId'),
      method: c.req.method,
      path: c.req.path,
      roles: session?.roles ?? [],
    })
    return c.json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } }, 403)
  })
}
