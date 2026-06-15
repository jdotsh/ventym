import { randomId } from '@/utils/ids'
import { createEnvelopeVault } from './envelope'
import { createMemorySecretStore } from './memoryStore'
import type { SecretStore, SecretVault } from './types'

// A vault that refuses to operate — wired when CONNECTION_SECRETS_KEY is absent,
// so an unconfigured deploy fails LOUD on write instead of storing plaintext.
export function createNoopVault(): SecretVault {
  return {
    put: async () => {
      throw new Error('secret vault not configured (CONNECTION_SECRETS_KEY missing)')
    },
    get: async () => null,
    delete: async () => {},
  }
}

/** Composition root: real envelope vault when a master key is set, else noop. */
export function createSecretVault(input: { masterKeyB64: string; store?: SecretStore }): SecretVault {
  if (!input.masterKeyB64) return createNoopVault()
  return createEnvelopeVault({
    masterKeyB64: input.masterKeyB64,
    store: input.store ?? createMemorySecretStore(),
    uuid: randomId,
  })
}

export { createEnvelopeVault } from './envelope'
export { createMemorySecretStore } from './memoryStore'
export { createSecretRef, SecretDecryptError } from './types'
export type { SecretRef, SecretStore, SecretVault, StoredSecret } from './types'
