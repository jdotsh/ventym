import { html, type Html } from '../html'
import { t, type Locale } from '../i18n'

export type NavKey = 'dashboard' | 'work-orders' | 'timesheets' | 'staffing' | 'admin'

/** The fixed sidebar: brand · nav (active-highlighted) · user + sign-out. Rendered by
 *  every signed-in page; the content `.container` sits to its right (see base.ts). */
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
    <div class="sidenav__foot">
      <span class="sidenav__user" title="${props.email}">${props.email}</span>
      <form method="post" action="/auth/logout">
        <button class="btn btn--ghost btn--sm btn--block" type="submit">${t(locale, 'nav.signOut')}</button>
      </form>
    </div>
  </aside>`
}
