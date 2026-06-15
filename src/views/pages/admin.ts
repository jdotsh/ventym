import { TENANT_ROLES } from '../../../db/schema'
import type { MemberView } from '@/tools/db/adminRepos'
import { html, type Html } from '../html'
import { appHeader } from '../components/appHeader'
import { baseLayout } from '../layouts/baseLayout'
import { t, type Locale } from '../i18n'

function roleEditor(member: MemberView, locale: Locale): Html {
  const boxes = TENANT_ROLES.map(
    (role) => html`<label class="rolechk">
      <input type="checkbox" name="roles" value="${role}" ${member.roles.includes(role) ? 'checked' : ''} />
      ${role}
    </label>`,
  )
  return html`<form method="post" action="/admin/users/${member.membershipId}/roles" class="flex-wrap">
    ${boxes}
    <input type="hidden" name="version" value="${String(member.version)}" />
    <button class="btn btn--sm" type="submit">${t(locale, 'admin.save')}</button>
  </form>`
}

export function adminPage(props: {
  locale: Locale
  email: string
  members: MemberView[]
  flash?: string
}): Html {
  const { locale, flash } = props
  const flashClass = flash === 'ok' ? 'alert' : 'alert alert--danger'
  return baseLayout({
    title: `${t(locale, 'admin.title')} · ${t(locale, 'app.name')}`,
    locale,
    body: html`${appHeader({ locale, email: props.email, showAdmin: true })}
      <main class="container stack">
        <div class="spread">
          <h1>${t(locale, 'admin.title')}</h1>
          <form method="post" action="/admin/sso/portal">
            <button class="btn" type="submit">${t(locale, 'admin.sso')}</button>
          </form>
        </div>
        ${flash ? html`<p class="${flashClass}">${t(locale, `admin.flash.${flash}`)}</p>` : ''}
        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>${t(locale, 'admin.user')}</th>
                <th>${t(locale, 'admin.roles')}</th>
              </tr>
            </thead>
            <tbody>
              ${props.members.map(
                (m) => html`<tr>
                  <td>${m.displayName ?? m.email}<div class="muted small">${m.email}</div></td>
                  <td>${roleEditor(m, locale)}</td>
                </tr>`,
              )}
            </tbody>
          </table>
        </div>
      </main>`,
  })
}
