import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '../../config/bindings'
import { decideRbac, policyFor } from '@/config/rbacPolicy'
import { isApiPath } from '@/utils/apiPaths'
import { problemResponse } from '@/utils/problemResponse'
import { logger } from '@/utils/logger'

/**
 * Default-deny authorization wall. Matches every request to RBAC_POLICY; a route
 * absent from the policy is forbidden. Runs after the session middleware.
 *
 * Surface-aware denial: API/agent clients get problem+json (401/403); only the
 * HTML view surface gets a login redirect (a browser, not a machine).
 */
export function requireRoutePolicy() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const session = c.get('session')
    const decision = decideRbac(policyFor(c.req.method, c.req.path), {
      authenticated: session !== null,
      roles: session?.roles ?? [],
    })
    if (decision.kind === 'allow') return next()

    const traceId = c.get('traceId')
    const apiPath = isApiPath(c.req.path)

    if (decision.kind === 'login') {
      return apiPath ? problemResponse(traceId, 'UNAUTHORIZED') : c.redirect('/auth/login')
    }
    logger.warn('rbac.forbidden', { traceId, method: c.req.method, path: c.req.path, roles: session?.roles ?? [] })
    return problemResponse(traceId, 'FORBIDDEN')
  })
}
