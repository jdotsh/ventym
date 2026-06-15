import { html, type Html } from '../html'
import { t, type Locale } from '../i18n'

/** Top bar: brand + signed-in user + logout. */
export function appHeader(props: { locale: Locale; email: string }): Html {
  return html`<header class="topbar">
    <div class="brand">⬡ ${t(props.locale, 'app.name')}</div>
    <div class="row">
      <span class="muted small">${props.email}</span>
      <form method="post" action="/auth/logout">
        <button class="btn btn--ghost btn--sm" type="submit">${t(props.locale, 'nav.signOut')}</button>
      </form>
    </div>
  </header>`
}
