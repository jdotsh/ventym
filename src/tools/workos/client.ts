import { WorkOS } from '@workos-inc/node'

/**
 * The federated identity WorkOS hands us after authentication. Roles are NOT
 * taken from here — they come from our own membership (feed-only RBAC).
 */
export type WorkosIdentity = {
  workosUserId: string
  email: string
  firstName: string | null
  lastName: string | null
  emailVerified: boolean
  organizationId: string | null
  sessionId: string
}

/**
 * Port over WorkOS AuthKit. The whole app depends on this abstraction; the SDK
 * lives only here, so swapping the broker (or faking it in tests) is one file.
 */
export type WorkosClient = {
  authorizationUrl(state: string): string
  /** Exchange the callback code → identity + the sealed session cookie value. */
  completeLogin(code: string): Promise<{ identity: WorkosIdentity; sealedSession: string }>
  /** Validate (and transparently refresh) a sealed session cookie. */
  authenticateSession(sealedSession: string): Promise<WorkosIdentity | null>
  logoutUrl(sealedSession: string): Promise<string | null>
}

type WorkosConfig = {
  apiKey: string
  clientId: string
  redirectUri: string
  cookiePassword: string
}

export function createWorkosClient(config: WorkosConfig): WorkosClient {
  const workos = new WorkOS(config.apiKey)
  const { clientId, redirectUri, cookiePassword } = config
  const users = workos.userManagement

  return {
    authorizationUrl(state) {
      return users.getAuthorizationUrl({ provider: 'authkit', clientId, redirectUri, state })
    },

    async completeLogin(code) {
      const auth = await users.authenticateWithCode({
        clientId,
        code,
        session: { sealSession: true, cookiePassword },
      })
      const sealedSession = auth.sealedSession
      if (!sealedSession) throw new Error('WorkOS did not return a sealed session')
      return { identity: toIdentity(auth.user, auth.organizationId ?? null, ''), sealedSession }
    },

    async authenticateSession(sealedSession) {
      const session = users.loadSealedSession({ sessionData: sealedSession, cookiePassword })
      const result = await session.authenticate()
      if (!result.authenticated) return null
      return toIdentity(result.user, result.organizationId ?? null, result.sessionId)
    },

    async logoutUrl(sealedSession) {
      const session = users.loadSealedSession({ sessionData: sealedSession, cookiePassword })
      const result = await session.authenticate()
      return result.authenticated ? session.getLogoutUrl() : null
    },
  }
}

type WorkosUser = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  emailVerified: boolean
}

function toIdentity(user: WorkosUser, organizationId: string | null, sessionId: string): WorkosIdentity {
  return {
    workosUserId: user.id,
    email: user.email.toLowerCase(),
    firstName: user.firstName,
    lastName: user.lastName,
    emailVerified: user.emailVerified,
    organizationId,
    sessionId,
  }
}
