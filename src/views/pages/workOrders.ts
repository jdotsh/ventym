import type { WorkOrderRow } from '../../../db/schema'
import type { SessionContext } from '@/services/identity/service'
import { html, type Html } from '../html'
import { appHeader } from '../components/appHeader'
import { baseLayout } from '../layouts/baseLayout'
import { t, type Locale } from '../i18n'

// Lifecycle/ERP badges reuse the existing token classes (badge / badge--ok) — the
// "happy" terminal states read green, everything else neutral.
const lifecycleClass = (status: string): string => (status === 'ACTIVE' ? 'badge badge--ok' : 'badge')
const erpClass = (status: string): string => (status === 'LINKED' ? 'badge badge--ok' : 'badge')

/** Work Orders list — receives already-fetched, already-validated rows and renders.
 *  Zero DB, zero service calls, zero logic here (the seam law). */
export function workOrdersPage(props: { locale: Locale; session: SessionContext; workOrders: readonly WorkOrderRow[] }): Html {
  const { locale, session, workOrders } = props
  return baseLayout({
    title: `${t(locale, 'wo.title')} · ${t(locale, 'app.name')}`,
    locale,
    body: html`${appHeader({ locale, email: session.email, showAdmin: session.roles.includes('ADMIN'), active: 'work-orders' })}
      <main class="container stack">
        <h1>${t(locale, 'wo.title')}</h1>
        ${workOrders.length === 0
          ? html`<div class="card muted">${t(locale, 'wo.empty')}</div>`
          : html`<div class="card">
              <table class="table">
                <thead>
                  <tr>
                    <th>${t(locale, 'wo.code')}</th>
                    <th>${t(locale, 'wo.titleCol')}</th>
                    <th>${t(locale, 'wo.engagement')}</th>
                    <th>${t(locale, 'wo.lifecycle')}</th>
                    <th>${t(locale, 'wo.erp')}</th>
                    <th>${t(locale, 'wo.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  ${workOrders.map(
                    (w) => html`<tr>
                      <td class="mono">${w.code}</td>
                      <td>${w.title ?? '—'}</td>
                      <td>${t(locale, `wo.eng.${w.engagementType}`)}</td>
                      <td><span class="${lifecycleClass(w.lifecycleStatus)}">${w.lifecycleStatus}</span></td>
                      <td><span class="${erpClass(w.erpLinkStatus)}">${w.erpLinkStatus}</span></td>
                      <td class="mono">${w.currency} ${w.totalExcl}</td>
                    </tr>`,
                  )}
                </tbody>
              </table>
            </div>`}
      </main>`,
  })
}
