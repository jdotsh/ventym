import type { SessionContext } from '@/services/identity/service'
import { html, type Html } from '../html'
import { appHeader } from '../components/appHeader'
import { baseLayout } from '../layouts/baseLayout'
import { t, type Locale } from '../i18n'

export function dashboardPage(props: { locale: Locale; session: SessionContext }): Html {
  const { locale, session } = props
  const who = session.displayName ?? session.email
  return baseLayout({
    title: `${t(locale, 'dash.title')} · ${t(locale, 'app.name')}`,
    locale,
    body: html`${appHeader({ locale, email: session.email, showAdmin: session.roles.includes('ADMIN'), active: 'dashboard' })}
      <main class="container stack">
        <h1>${t(locale, 'dash.welcome')}, ${who}</h1>
        <div class="card">
          <table class="table">
            <tbody>
              <tr>
                <th>${t(locale, 'dash.tenant')}</th>
                <td class="mono">${session.tenantId}</td>
              </tr>
              <tr>
                <th>${t(locale, 'dash.roles')}</th>
                <td>${session.roles.map((r) => html`<span class="badge">${r}</span> `)}</td>
              </tr>
              <tr>
                <th>${t(locale, 'dash.activeRole')}</th>
                <td><span class="badge badge--ok">${session.activeRole ?? '—'}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>`,
  })
}
