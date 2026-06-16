import { Hono } from 'hono'
import type { AppEnv } from '../../config/bindings'
import { dashboardPage } from '@/views/pages/dashboard'
import { loginPage } from '@/views/pages/login'
import { workOrdersPage } from '@/views/pages/workOrders'
import { timesheetsPage } from '@/views/pages/timesheets'
import { staffingPage } from '@/views/pages/staffing'
import { buildWorkOrderDeps } from '@/services/workOrder/deps'
import { listWorkOrders } from '@/services/workOrder/service'
import { buildTimesheetDeps } from '@/services/timesheet/deps'
import { listTimesheets, transitionTimesheet } from '@/services/timesheet/service'
import { buildStaffingDeps } from '@/services/staffing/deps'
import { listVendors, listWorkers } from '@/services/staffing/service'
import { randomId } from '@/utils/ids'
import { resolveLocale } from '@/views/i18n'
import { APP_CSS } from '@/views/styles'
import { APP_JS } from '@/views/scripts/app'

// A timesheet transition error → a flash key the page can localize.
const tsFlash = (kind: string): string => kind

/** Server-rendered pages + the stylesheet asset. */
export const viewRoutes = new Hono<AppEnv>()
  .get('/', (c) => c.redirect(c.get('session') ? '/dashboard' : '/login'))

  .get('/assets/app.css', (c) =>
    c.body(APP_CSS, 200, {
      'Content-Type': 'text/css; charset=utf-8',
      // Local dev: never cache, so style edits show on a normal refresh. Prod: 1h.
      'Cache-Control': c.get('config').ENVIRONMENT === 'local' ? 'no-store' : 'public, max-age=3600',
    }),
  )

  .get('/assets/app.js', (c) =>
    c.body(APP_JS, 200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': c.get('config').ENVIRONMENT === 'local' ? 'no-store' : 'public, max-age=3600',
    }),
  )

  .get('/login', (c) => {
    if (c.get('session')) return c.redirect('/dashboard')
    const locale = resolveLocale(c.req.query('lang'))
    const error = c.req.query('error')
    const dev = c.get('config').ENVIRONMENT === 'local'
    return c.html(loginPage({ locale, dev, ...(error ? { error } : {}) }))
  })

  .get('/dashboard', (c) => {
    const session = c.get('session')
    if (!session) return c.redirect('/login')
    return c.html(dashboardPage({ locale: resolveLocale(c.req.query('lang')), session }))
  })

  .get('/work-orders', async (c) => {
    const session = c.get('session')
    if (!session) return c.redirect('/login')
    // REAL data: the same workOrder service the JSON API + MCP tools use, tenant-scoped.
    const workOrders = await listWorkOrders(session, buildWorkOrderDeps(c.get('db'), 'human'))
    return c.html(workOrdersPage({ locale: resolveLocale(c.req.query('lang')), session, workOrders }))
  })

  .get('/timesheets', async (c) => {
    const session = c.get('session')
    if (!session) return c.redirect('/login')
    const timesheets = await listTimesheets(session, buildTimesheetDeps(c.get('db'), 'human'))
    const flash = c.req.query('flash')
    return c.html(timesheetsPage({ locale: resolveLocale(c.req.query('lang')), session, timesheets, ...(flash ? { flash } : {}) }))
  })

  // Approve / reject — the REAL transitionTimesheet service (SoD + version-checked).
  .post('/timesheets/:id/approve', async (c) => {
    const session = c.get('session')
    if (!session) return c.redirect('/login')
    const form = await c.req.parseBody()
    const result = await transitionTimesheet(
      session,
      { timesheetId: c.req.param('id'), transition: 'approve', expectedVersion: Number(form['version']), eventId: randomId() },
      buildTimesheetDeps(c.get('db'), 'human'),
    )
    return c.redirect(`/timesheets?flash=${result.ok ? 'ts_ok' : tsFlash(result.error.kind)}`)
  })

  .post('/timesheets/:id/reject', async (c) => {
    const session = c.get('session')
    if (!session) return c.redirect('/login')
    const form = await c.req.parseBody()
    const reason = typeof form['reason'] === 'string' ? form['reason'] : ''
    const result = await transitionTimesheet(
      session,
      { timesheetId: c.req.param('id'), transition: 'reject', expectedVersion: Number(form['version']), eventId: randomId(), reason },
      buildTimesheetDeps(c.get('db'), 'human'),
    )
    return c.redirect(`/timesheets?flash=${result.ok ? 'ts_ok' : tsFlash(result.error.kind)}`)
  })

  .get('/staffing', async (c) => {
    const session = c.get('session')
    if (!session) return c.redirect('/login')
    const deps = buildStaffingDeps(c.get('db'), 'human')
    const [vendors, workers] = await Promise.all([listVendors(session, deps), listWorkers(session, deps)])
    return c.html(staffingPage({ locale: resolveLocale(c.req.query('lang')), session, vendors, workers }))
  })
