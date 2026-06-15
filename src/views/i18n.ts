export type Locale = 'it' | 'en'
type Dict = Record<string, string>

const en: Dict = {
  'app.name': 'VMS',
  'nav.signOut': 'Sign out',
  'login.title': 'Sign in',
  'login.cta': 'Continue with SSO',
  'login.note': 'Secured by WorkOS · SSO · MFA',
  'login.err.state': 'Your sign-in link expired. Please try again.',
  'login.err.auth': 'Sign-in failed. Please try again.',
  'dash.title': 'Dashboard',
  'dash.welcome': 'Welcome',
  'dash.tenant': 'Tenant',
  'dash.roles': 'Roles',
  'dash.activeRole': 'Active role',
}

const it: Dict = {
  'app.name': 'VMS',
  'nav.signOut': 'Esci',
  'login.title': 'Accedi',
  'login.cta': 'Continua con SSO',
  'login.note': 'Protetto da WorkOS · SSO · MFA',
  'login.err.state': 'Il link di accesso è scaduto. Riprova.',
  'login.err.auth': 'Accesso non riuscito. Riprova.',
  'dash.title': 'Dashboard',
  'dash.welcome': 'Benvenuto',
  'dash.tenant': 'Organizzazione',
  'dash.roles': 'Ruoli',
  'dash.activeRole': 'Ruolo attivo',
}

const DICTS: Record<Locale, Dict> = { en, it }

export function t(locale: Locale, key: string): string {
  return DICTS[locale][key] ?? en[key] ?? key
}

export const resolveLocale = (value: string | undefined): Locale => (value === 'it' ? 'it' : 'en')
