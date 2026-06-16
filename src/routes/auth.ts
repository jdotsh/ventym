import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { Hono } from 'hono'
import type { Context } from 'hono'
import type { CookieOptions } from 'hono/utils/cookie'
import type { AppEnv } from '../../config/bindings'
import { SESSION_COOKIE } from '@/middleware/session'
import { buildIdentityDeps } from '@/services/identity/deps'
import { resolveLoginContext } from '@/services/identity/service'
import { logger, serializeError } from '@/utils/logger'
import { randomId } from '@/utils/ids'

const STATE_COOKIE = 'wos_state'
const SESSION_TTL_SEC = 60 * 60 * 24

const cookie = (secure: boolean, maxAge: number): CookieOptions => ({
  httpOnly: true,
  secure,
  sameSite: 'Lax',
  path: '/',
  maxAge,
})

// Start AuthKit (password, MFA, SSO at the WorkOS hosted page). `screenHint`
// opens sign-in vs sign-up. A signed `state` cookie protects the round-trip.
function startAuth(c: Context<AppEnv>, screenHint?: 'sign-in' | 'sign-up'): Response {
  const secure = c.get('config').ENVIRONMENT !== 'local'
  const state = randomId()
  setCookie(c, STATE_COOKIE, state, cookie(secure, 600))
  return c.redirect(c.get('workos').authorizationUrl(state, screenHint))
}

export const authRoutes = new Hono<AppEnv>()
  .get('/auth/login', (c) => startAuth(c, 'sign-in'))
  .get('/auth/signup', (c) => startAuth(c, 'sign-up'))

  // Exchange the code, JIT the user + membership, set the sealed session.
  .get('/auth/callback', async (c) => {
    const code = c.req.query('code')
    const state = c.req.query('state')
    const expected = getCookie(c, STATE_COOKIE)
    deleteCookie(c, STATE_COOKIE, { path: '/' })
    if (!code || !state || state !== expected) return c.redirect('/login?error=state')

    try {
      const { identity, sealedSession } = await c.get('workos').completeLogin(code)
      // LOCAL-ONLY: admit a fresh login as a full referent so the whole app is testable.
      // Deployed envs admit as MEMBER (least privilege) — admins grant roles explicitly.
      const jitRoles = c.get('config').ENVIRONMENT === 'local' ? (['ADMIN', 'MANAGER'] as const) : (['MEMBER'] as const)
      await resolveLoginContext(identity, buildIdentityDeps(c.get('db')), jitRoles)
      setCookie(c, SESSION_COOKIE, sealedSession, cookie(c.get('config').ENVIRONMENT !== 'local', SESSION_TTL_SEC))
      return c.redirect('/dashboard')
    } catch (err) {
      logger.error('auth.callback_failed', { traceId: c.get('traceId'), ...serializeError(err) })
      return c.redirect('/login?error=auth')
    }
  })

  .post('/auth/logout', async (c) => {
    const sealed = getCookie(c, SESSION_COOKIE)
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    if (sealed) {
      const url = await c.get('workos').logoutUrl(sealed).catch(() => null)
      if (url) return c.redirect(url)
    }
    return c.redirect('/')
  })
