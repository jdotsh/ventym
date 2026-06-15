import { html, type Html } from '../html'
import { t, type Locale } from '../i18n'

/** Top bar: brand + nav + signed-in user + logout. */
export function appHeader(props: { locale: Locale; email: string; showAdmin?: boolean }): Html {
  return html`<header class="topbar">
    <div class="row">
      <a class="brand" href="/dashboard">⬡ ${t(props.locale, 'app.name')}</a>
      ${props.showAdmin ? html`<a class="muted small" href="/admin/users">${t(props.locale, 'nav.admin')}</a>` : ''}
    </div>
    <div class="row">
      <span class="muted small">${props.email}</span>
      <form method="post" action="/auth/logout">
        <button class="btn btn--ghost btn--sm" type="submit">${t(props.locale, 'nav.signOut')}</button>
      </form>
    </div>
  </header>`
}
