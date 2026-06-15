import type { Context } from 'hono'
import type { AppEnv } from '../../../../config/bindings'
import type { SessionContext } from '@/services/identity/service'
import { AuthError } from '@/types/errors'

// RBAC middleware has already gated the route; this narrows the type and guards
// defensively. Throws AuthError → onError maps it to a 401 problem+json.
export function requireSession(c: Context<AppEnv>): SessionContext {
  const session = c.get('session')
  if (!session) throw new AuthError()
  return session
}
