import type { SecretStore, StoredSecret } from './types'

/** In-memory SecretStore — for tests + local dev. A DB-backed store (vms_secret)
 *  lands with the connector framework; the vault crypto is store-agnostic. */
export function createMemorySecretStore(): SecretStore {
  const rows = new Map<string, StoredSecret>()
  return {
    write: async ({ ref, tenantId, ciphertext }) => {
      rows.set(ref, { tenantId, ciphertext })
    },
    read: async ({ ref, tenantId }) => {
      const row = rows.get(ref)
      return row && row.tenantId === tenantId ? row : null
    },
    remove: async (ref) => {
      rows.delete(ref)
    },
  }
}
