/**
 * SecretVault contract — encrypted-at-rest, per-tenant-keyed storage for
 * connector credentials (a tenant's SAP / Okta / SMTP secrets). Services never
 * touch ciphertext or keys; they hold a `secret_ref` and ask the vault.
 *
 * The vault does CRYPTO; persistence is an injected `SecretStore` port, so the
 * backing store (Postgres `vms_secret`, KV, KMS) swaps with no caller change.
 */

/** Opaque pointer to a stored secret. Branded so a raw string can't pose as one. */
export type SecretRef = string & { readonly __brand: 'SecretRef' }

/** The only sanctioned place to mint a SecretRef from a raw string. */
export function createSecretRef(raw: string): SecretRef {
  return raw as SecretRef
}

export type SecretVault = {
  /** Encrypt + store, returning the ref. Pass an existing `ref` to rotate in place. */
  put: (input: { tenantId: string; plaintext: string; ref?: SecretRef }) => Promise<SecretRef>
  /**
   * Decrypt. Returns null when the ref does not exist for this tenant. THROWS
   * `SecretDecryptError` when a row exists but fails GCM authentication
   * (tamper / wrong-tenant key) — a security event, never a silent null.
   */
  get: (input: { tenantId: string; ref: SecretRef }) => Promise<string | null>
  /** Hard-remove a secret (rotation / teardown). Idempotent. */
  delete: (ref: SecretRef) => Promise<void>
}

/** Ciphertext-at-rest as persisted (opaque base64). */
export type StoredSecret = { tenantId: string; ciphertext: string }

/**
 * Persistence port. `read` binds tenantId in its lookup so a wrong ref cannot
 * reach another tenant's row (defence-in-depth beside RLS + the per-tenant key).
 */
export type SecretStore = {
  write: (input: { ref: string; tenantId: string; ciphertext: string }) => Promise<void>
  read: (input: { ref: string; tenantId: string }) => Promise<StoredSecret | null>
  remove: (ref: string) => Promise<void>
}

/** Thrown when stored ciphertext fails AES-GCM authentication (tamper/wrong key). */
export class SecretDecryptError extends Error {
  readonly code = 'SECRET_DECRYPT_FAILED'
  constructor(message = 'secret failed authenticated decryption') {
    super(message)
    this.name = 'SecretDecryptError'
  }
}
