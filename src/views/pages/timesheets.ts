import type { TimesheetRow } from '../../../db/schema'
import type { SessionContext } from '@/services/identity/service'
import { html, type Html } from '../html'
import { appHeader } from '../components/appHeader'
import { baseLayout } from '../layouts/baseLayout'
import { t, type Locale } from '../i18n'

const statusClass = (status: string): string =>
  status === 'APPROVED' || status === 'BOOKED' ? 'badge badge--ok' : status === 'REJECTED' ? 'badge badge--danger' : 'badge'

// Approve / reject are shown only to a referent (ADMIN/MANAGER) and only on a
// SUBMITTED timesheet. The server still enforces RBAC + SoD — this just hides the
// controls a member could never use.
function actions(ts: TimesheetRow, locale: Locale): Html {
  if (ts.status !== 'SUBMITTED') return html`<span class="muted small">—</span>`
  return html`<div class="flex-wrap">
    <form method="post" action="/timesheets/${ts.id}/approve">
      <input type="hidden" name="version" value="${String(ts.version)}" />
      <button class="btn btn--sm" type="submit">${t(locale, 'ts.approve')}</button>
    </form>
    <form method="post" action="/timesheets/${ts.id}/reject" class="flex-wrap">
      <input type="hidden" name="version" value="${String(ts.version)}" />
      <input class="input input--sm" type="text" name="reason" placeholder="${t(locale, 'ts.reason')}" required />
      <button class="btn btn--ghost btn--sm" type="submit">${t(locale, 'ts.reject')}</button>
    </form>
  </div>`
}

export function timesheetsPage(props: {
  locale: Locale
  session: SessionContext
  timesheets: readonly TimesheetRow[]
  flash?: string
}): Html {
  const { locale, session, timesheets, flash } = props
  const canApprove = session.roles.includes('ADMIN') || session.roles.includes('MANAGER')
  const flashClass = flash === 'ts_ok' ? 'alert' : 'alert alert--danger'
  return baseLayout({
    title: `${t(locale, 'ts.title')} · ${t(locale, 'app.name')}`,
    locale,
    body: html`${appHeader({ locale, email: session.email, showAdmin: session.roles.includes('ADMIN') })}
      <main class="container stack">
        <h1>${t(locale, 'ts.title')}</h1>
        ${flash ? html`<p class="${flashClass}">${t(locale, `ts.flash.${flash}`)}</p>` : ''}
        ${timesheets.length === 0
          ? html`<div class="card muted">${t(locale, 'ts.empty')}</div>`
          : html`<div class="card">
              <table class="table">
                <thead>
                  <tr>
                    <th>${t(locale, 'ts.period')}</th>
                    <th>${t(locale, 'ts.status')}</th>
                    <th>${t(locale, 'ts.hours')}</th>
                    <th>${t(locale, 'ts.total')}</th>
                    ${canApprove ? html`<th>${t(locale, 'ts.actions')}</th>` : ''}
                  </tr>
                </thead>
                <tbody>
                  ${timesheets.map(
                    (ts) => html`<tr>
                      <td class="mono">${ts.periodStart} → ${ts.periodEnd}</td>
                      <td><span class="${statusClass(ts.status)}">${ts.status}</span></td>
                      <td class="mono">${ts.totalHours}</td>
                      <td class="mono">€ ${ts.totalExcl}</td>
                      ${canApprove ? html`<td>${actions(ts, locale)}</td>` : ''}
                    </tr>`,
                  )}
                </tbody>
              </table>
            </div>`}
      </main>`,
  })
}
