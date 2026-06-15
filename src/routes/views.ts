import { Hono } from 'hono'
import type { AppEnv } from '../../config/bindings'
import { dashboardPage } from '@/views/pages/dashboard'
import { loginPage } from '@/views/pages/login'
import { resolveLocale } from '@/views/i18n'
import { APP_CSS } from '@/views/styles'

/** Server-rendered pages + the stylesheet asset. */
export const viewRoutes = new Hono<AppEnv>()
  .get('/', (c) => c.redirect(c.get('session') ? '/dashboard' : '/login'))

  .get('/assets/app.css', (c) =>
    c.body(APP_CSS, 200, {
      'Content-Type': 'text/css; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    }),
  )

  .get('/login', (c) => {
    if (c.get('session')) return c.redirect('/dashboard')
    const locale = resolveLocale(c.req.query('lang'))
    const error = c.req.query('error')
    return c.html(loginPage({ locale, ...(error ? { error } : {}) }))
  })

  .get('/dashboard', (c) => {
    const session = c.get('session')
    if (!session) return c.redirect('/login')
    return c.html(dashboardPage({ locale: resolveLocale(c.req.query('lang')), session }))
  })
