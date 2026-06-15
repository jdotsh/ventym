import { Hono } from 'hono'
import type { AppEnv } from '../../config/bindings'

// Protected by RBAC (authenticated). Renders HTML in S6; JSON for now.
export const dashboardRoutes = new Hono<AppEnv>().get('/dashboard', (c) => {
  const session = c.get('session')
  if (!session) return c.redirect('/auth/login')
  return c.json({
    data: {
      userId: session.userId,
      tenantId: session.tenantId,
      roles: session.roles,
      activeRole: session.activeRole,
    },
  })
})
