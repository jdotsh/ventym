import { html, type Html } from '../html'
import { t, type Locale } from '../i18n'

export type NavKey = 'dashboard' | 'work-orders' | 'timesheets' | 'staffing' | 'admin'
const TITLE: Record<NavKey, string> = {
  dashboard: 'nav.dashboard', 'work-orders': 'nav.workOrders', timesheets: 'nav.timesheets', staffing: 'nav.staffing', admin: 'nav.admin',
}

/** App chrome: a fixed left **sidebar** (brand + nav) + a sticky **top header bar**
 *  (page title left · user + sign-out right) — Athena's institutional shell. The page
 *  content `.container` sits below the header, right of the sidebar (see base.ts). */
export function appHeader(props: { locale: Locale; email: string; showAdmin?: boolean; active?: NavKey }): Html {
  const { locale, active } = props
  const link = (key: NavKey, href: string, label: string): Html =>
    html`<a class="navlink ${active === key ? 'navlink--active' : ''}" href="${href}">${label}</a>`
  return html`<aside class="sidenav">
      <a class="sidenav__brand" href="/dashboard">⬡ ${t(locale, 'app.name')}</a>
      <nav class="sidenav__nav">
        ${link('dashboard', '/dashboard', t(locale, 'nav.dashboard'))}
        ${link('work-orders', '/work-orders', t(locale, 'nav.workOrders'))}
        ${link('timesheets', '/timesheets', t(locale, 'nav.timesheets'))}
        ${link('staffing', '/staffing', t(locale, 'nav.staffing'))}
        ${props.showAdmin ? link('admin', '/admin/users', t(locale, 'nav.admin')) : ''}
      </nav>
    </aside>
    <header class="topbar">
      <span class="topbar__title">${active ? t(locale, TITLE[active]) : t(locale, 'app.name')}</span>
      <div class="topbar__right">
        <span class="topbar__user" title="${props.email}">${props.email}</span>
        <form method="post" action="/auth/logout">
          <button class="btn btn--ghost btn--sm" type="submit">${t(locale, 'nav.signOut')}</button>
        </form>
      </div>
    </header>`
}
