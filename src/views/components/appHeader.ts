import { html, type Html } from '../html'
import { t, type Locale } from '../i18n'

export type NavKey = 'dashboard' | 'work-orders' | 'timesheets' | 'staffing' | 'admin'
const NAV: Array<{ key: NavKey; href: string; label: string; icon: string }> = [
  { key: 'dashboard', href: '/dashboard', label: 'nav.dashboard', icon: '▦' },
  { key: 'work-orders', href: '/work-orders', label: 'nav.workOrders', icon: '▤' },
  { key: 'timesheets', href: '/timesheets', label: 'nav.timesheets', icon: '◷' },
  { key: 'staffing', href: '/staffing', label: 'nav.staffing', icon: '◍' },
]
const TITLE: Record<NavKey, string> = {
  dashboard: 'nav.dashboard', 'work-orders': 'nav.workOrders', timesheets: 'nav.timesheets', staffing: 'nav.staffing', admin: 'nav.admin',
}

/** The full institutional chrome: collapsible sidebar (icon rail) + sticky header bar
 *  with notifications + a profile/settings menu (theme · language · sign-out). Interactions
 *  are wired by /assets/app.js (collapse persists, menus toggle [hidden]). */
export function appHeader(props: { locale: Locale; email: string; showAdmin?: boolean; active?: NavKey }): Html {
  const { locale, active, email } = props
  const items = props.showAdmin ? [...NAV, { key: 'admin' as NavKey, href: '/admin/users', label: 'nav.admin', icon: '⚙' }] : NAV
  const navlink = (i: (typeof NAV)[number]): Html =>
    html`<a class="navlink ${active === i.key ? 'navlink--active' : ''}" href="${i.href}" title="${t(locale, i.label)}">
      <span class="navlink__icon" aria-hidden="true">${i.icon}</span><span class="navlink__label">${t(locale, i.label)}</span>
    </a>`
  return html`<aside class="sidenav">
      <a class="sidenav__brand" href="/dashboard"><span class="navlink__icon">⬡</span><span class="navlink__label">${t(locale, 'app.name')}</span></a>
      <nav class="sidenav__nav">${items.map(navlink)}</nav>
    </aside>
    <header class="topbar">
      <div class="topbar__left">
        <button class="iconbtn" type="button" data-action="toggle-nav" aria-label="Toggle sidebar" title="Collapse (⌘B)">☰</button>
        <span class="topbar__title">${active ? t(locale, TITLE[active]) : t(locale, 'app.name')}</span>
      </div>
      <div class="topbar__right">
        <div class="menu-wrap">
          <button class="iconbtn" type="button" data-action="toggle-menu" data-menu="m-notif" aria-haspopup="true" aria-label="${t(locale, 'nav.notifications')}">🔔</button>
          <div id="m-notif" class="menu menu--panel" role="dialog" hidden>
            <div class="menu__head">${t(locale, 'nav.notifications')}</div>
            <div class="menu__empty">${t(locale, 'nav.noNotifications')}</div>
          </div>
        </div>
        <div class="menu-wrap">
          <button class="profile-btn" type="button" data-action="toggle-menu" data-menu="m-profile" aria-haspopup="true">
            <span class="avatar">${email.slice(0, 1).toUpperCase()}</span><span class="profile-btn__email">${email}</span><span aria-hidden="true">▾</span>
          </button>
          <div id="m-profile" class="menu" role="menu" hidden>
            <div class="menu__head">${email}</div>
            <div class="menu__row"><span class="menu__lbl">${t(locale, 'nav.theme')}</span>
              <span class="seg"><button type="button" data-action="set-theme" data-theme="light">☀</button><button type="button" data-action="set-theme" data-theme="dark">☾</button></span></div>
            <div class="menu__row"><span class="menu__lbl">${t(locale, 'nav.language')}</span>
              <span class="seg"><a href="?lang=it">IT</a><a href="?lang=en">EN</a></span></div>
            ${props.showAdmin ? html`<a class="menu__item" role="menuitem" href="/admin/users">${t(locale, 'nav.settings')}</a>` : ''}
            <form method="post" action="/auth/logout"><button class="menu__item menu__item--danger" type="submit">${t(locale, 'nav.signOut')}</button></form>
          </div>
        </div>
      </div>
    </header>`
}
