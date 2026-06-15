import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppEnv } from '../../config/bindings'
import { buildAdminDeps } from '@/services/admin/deps'
import { listMembers, setMemberRoles, setRolesSchema, ssoPortalLink, type AdminActor } from '@/services/admin/service'
import { adminPage } from '@/views/pages/admin'
import { resolveLocale } from '@/views/i18n'
import { logger, serializeError } from '@/utils/logger'

const actorOf = (c: Context<AppEnv>): AdminActor | null => {
  const s = c.get('session')
  return s ? { tenantId: s.tenantId, userId: s.userId, sessionId: s.sessionId } : null
}

const asArray = (v: string | File | (string | File)[] | undefined): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : []

export const adminRoutes = new Hono<AppEnv>()
  .get('/admin/users', async (c) => {
    const session = c.get('session')
    if (!session) return c.redirect('/login')
    const actor: AdminActor = { tenantId: session.tenantId, userId: session.userId, sessionId: session.sessionId }
    const members = await listMembers(actor, buildAdminDeps(c.get('db'), c.get('workos')))
    const flash = c.req.query('flash')
    return c.html(
      adminPage({ locale: resolveLocale(c.req.query('lang')), email: session.email, members, ...(flash ? { flash } : {}) }),
    )
  })

  .post('/admin/users/:id/roles', async (c) => {
    const actor = actorOf(c)
    if (!actor) return c.redirect('/login')
    const form = await c.req.parseBody({ all: true })
    const parsed = setRolesSchema.safeParse({ roles: asArray(form['roles']), expectedVersion: form['version'] })
    if (!parsed.success) return c.redirect('/admin/users?flash=invalid')
    const result = await setMemberRoles(actor, c.req.param('id'), parsed.data, buildAdminDeps(c.get('db'), c.get('workos')))
    return c.redirect(`/admin/users?flash=${result.type === 'ok' ? 'ok' : result.type}`)
  })

  .post('/admin/sso/portal', async (c) => {
    const actor = actorOf(c)
    if (!actor) return c.redirect('/login')
    try {
      const link = await ssoPortalLink(actor, 'sso', buildAdminDeps(c.get('db'), c.get('workos')))
      return link ? c.redirect(link) : c.redirect('/admin/users?flash=no_org')
    } catch (err) {
      logger.error('admin.portal_failed', { traceId: c.get('traceId'), ...serializeError(err) })
      return c.redirect('/admin/users?flash=portal_error')
    }
  })
