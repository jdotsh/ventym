import { html, type Html } from '../html'
import { baseLayout } from '../layouts/baseLayout'
import { t, type Locale } from '../i18n'

const errorKey = (code: string): string => (code === 'state' ? 'login.err.state' : 'login.err.auth')

export function loginPage(props: { locale: Locale; error?: string; dev?: boolean }): Html {
  const { locale } = props
  // Local dev: the primary CTA bypasses WorkOS entirely (no redirect-URI dance).
  const primary = props.dev
    ? html`<a class="btn btn--primary btn--lg btn--block" href="/auth/dev">${t(locale, 'login.dev')}</a>
        <a class="btn btn--ghost btn--block" href="/auth/login">${t(locale, 'login.cta')} (WorkOS)</a>`
    : html`<a class="btn btn--primary btn--lg btn--block" href="/auth/login">${t(locale, 'login.cta')}</a>`
  return baseLayout({
    title: `${t(locale, 'login.title')} · ${t(locale, 'app.name')}`,
    locale,
    body: html`<main class="auth">
      <div class="card auth__card">
        <div class="brand brand--lg">⬡ ${t(locale, 'app.name')}</div>
        <h1>${t(locale, 'login.title')}</h1>
        ${props.error ? html`<p class="alert alert--danger">${t(locale, errorKey(props.error))}</p>` : ''}
        ${primary}
        <p class="small">
          ${t(locale, 'login.signupPrompt')} <a href="/auth/signup">${t(locale, 'login.signupCta')}</a>
        </p>
        <p class="muted small">${t(locale, 'login.note')}</p>
      </div>
    </main>`,
  })
}
