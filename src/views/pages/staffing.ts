import type { VendorRow } from '../../../db/schema'
import type { WorkerListItem } from '@/tools/db/staffingRepo'
import type { SessionContext } from '@/services/identity/service'
import { html, type Html } from '../html'
import { appHeader } from '../components/appHeader'
import { baseLayout } from '../layouts/baseLayout'
import { t, type Locale } from '../i18n'

const vendorClass = (status: string): string =>
  status === 'ACTIVE' ? 'badge badge--ok' : status === 'SUSPENDED' ? 'badge badge--danger' : 'badge'

function vendorsCard(vendors: readonly VendorRow[], locale: Locale): Html {
  if (vendors.length === 0) return html`<div class="card muted">${t(locale, 'staff.noVendors')}</div>`
  return html`<div class="card">
    <table class="table">
      <thead>
        <tr>
          <th>${t(locale, 'staff.code')}</th>
          <th>${t(locale, 'staff.name')}</th>
          <th>${t(locale, 'staff.vat')}</th>
          <th>${t(locale, 'staff.status')}</th>
        </tr>
      </thead>
      <tbody>
        ${vendors.map(
          (v) => html`<tr>
            <td class="mono">${v.code}</td>
            <td>${v.name}</td>
            <td class="mono">${v.vatNumber ?? '—'}</td>
            <td><span class="${vendorClass(v.status)}">${v.status}</span></td>
          </tr>`,
        )}
      </tbody>
    </table>
  </div>`
}

function workersCard(workers: readonly WorkerListItem[], locale: Locale): Html {
  if (workers.length === 0) return html`<div class="card muted">${t(locale, 'staff.noWorkers')}</div>`
  return html`<div class="card">
    <table class="table">
      <thead>
        <tr>
          <th>${t(locale, 'staff.worker')}</th>
          <th>${t(locale, 'staff.vendor')}</th>
          <th>${t(locale, 'staff.skill')}</th>
          <th>${t(locale, 'staff.status')}</th>
        </tr>
      </thead>
      <tbody>
        ${workers.map(
          (w) => html`<tr>
            <td>${w.name ?? '—'}</td>
            <td>${w.vendorName}</td>
            <td class="mono">${w.skillCode ?? '—'}${w.seniorityCode ? html` · ${w.seniorityCode}` : ''}</td>
            <td>
              <span class="${w.isActive ? 'badge badge--ok' : 'badge'}">
                ${t(locale, w.isActive ? 'staff.active' : 'staff.inactive')}
              </span>
            </td>
          </tr>`,
        )}
      </tbody>
    </table>
  </div>`
}

export function staffingPage(props: {
  locale: Locale
  session: SessionContext
  vendors: readonly VendorRow[]
  workers: readonly WorkerListItem[]
}): Html {
  const { locale, session, vendors, workers } = props
  return baseLayout({
    title: `${t(locale, 'staff.title')} · ${t(locale, 'app.name')}`,
    locale,
    body: html`${appHeader({ locale, email: session.email, showAdmin: session.roles.includes('ADMIN'), active: 'staffing' })}
      <main class="container stack">
        <h1>${t(locale, 'staff.title')}</h1>
        <h2>${t(locale, 'staff.vendors')}</h2>
        ${vendorsCard(vendors, locale)}
        <h2>${t(locale, 'staff.workers')}</h2>
        ${workersCard(workers, locale)}
      </main>`,
  })
}
