import { html, type Html } from '../html'
import { baseLayout } from '../layouts/baseLayout'
import { t, type Locale } from '../i18n'

const errorKey = (code: string): string => (code === 'state' ? 'login.err.state' : 'login.err.auth')

export function loginPage(props: { locale: Locale; error?: string }): Html {
  const { locale } = props
  return baseLayout({
    title: `${t(locale, 'login.title')} · ${t(locale, 'app.name')}`,
    locale,
    body: html`<main class="auth">
      <div class="card auth__card">
        <div class="brand brand--lg">⬡ ${t(locale, 'app.name')}</div>
        <h1>${t(locale, 'login.title')}</h1>
        ${props.error ? html`<p class="alert alert--danger">${t(locale, errorKey(props.error))}</p>` : ''}
        <a class="btn btn--primary btn--lg btn--block" href="/auth/login">${t(locale, 'login.cta')}</a>
        <p class="muted small">${t(locale, 'login.note')}</p>
      </div>
    </main>`,
  })
}
