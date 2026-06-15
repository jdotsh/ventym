/**
 * Envelope-encryption SecretVault — AES-256-GCM with a per-tenant key derived
 * from one master key via HKDF-SHA256 (salt = tenantId). Tenant A's ciphertext
 * cannot be decrypted in tenant B's context even if a ref leaks — a crypto wall
 * beside RLS. The `info` is versioned so a master-key rotation is a new
 * derivation context, not a breaking change. WebCrypto only — zero deps.
 */
import {
  createSecretRef,
  SecretDecryptError,
  type SecretRef,
  type SecretStore,
  type SecretVault,
} from './types'

const ALGO = 'AES-GCM'
const IV_BYTES = 12 // 96-bit IV — the GCM standard
const KEY_INFO = 'vms-connection-secret-v1'
const MIN_MASTER_KEY_BYTES = 32 // 256-bit input keying material

const enc = new TextEncoder()
const dec = new TextDecoder()

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export type EnvelopeVaultDeps = {
  masterKeyB64: string // base64 master key, >= 32 bytes decoded (a Workers secret)
  store: SecretStore
  uuid: () => string
}

export function createEnvelopeVault(deps: EnvelopeVaultDeps): SecretVault {
  const masterKeyBytes = base64ToBytes(deps.masterKeyB64)
  if (masterKeyBytes.length < MIN_MASTER_KEY_BYTES) {
    throw new Error(
      `CONNECTION_SECRETS_KEY too short: ${masterKeyBytes.length} bytes decoded, need >= ${MIN_MASTER_KEY_BYTES}`,
    )
  }

  async function deriveTenantKey(tenantId: string): Promise<CryptoKey> {
    const ikm = await crypto.subtle.importKey('raw', masterKeyBytes, 'HKDF', false, ['deriveKey'])
    return crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(tenantId), info: enc.encode(KEY_INFO) },
      ikm,
      { name: ALGO, length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
  }

  return {
    put: async ({ tenantId, plaintext, ref }) => {
      const key = await deriveTenantKey(tenantId)
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: ALGO, iv }, key, enc.encode(plaintext)))
      const packed = new Uint8Array(iv.length + ct.length) // IV ‖ ciphertext+tag — self-describing
      packed.set(iv, 0)
      packed.set(ct, iv.length)
      const id: SecretRef = ref ?? createSecretRef(deps.uuid())
      await deps.store.write({ ref: id, tenantId, ciphertext: bytesToBase64(packed) })
      return id
    },

    get: async ({ tenantId, ref }) => {
      const row = await deps.store.read({ ref, tenantId })
      if (!row) return null
      const key = await deriveTenantKey(tenantId)
      const packed = base64ToBytes(row.ciphertext)
      const iv = packed.subarray(0, IV_BYTES)
      const ct = packed.subarray(IV_BYTES)
      try {
        return dec.decode(await crypto.subtle.decrypt({ name: ALGO, iv }, key, ct))
      } catch {
        // GCM auth failed: tampered ciphertext or wrong-tenant key. Fail loud.
        throw new SecretDecryptError()
      }
    },

    delete: async (ref) => deps.store.remove(ref),
  }
}
