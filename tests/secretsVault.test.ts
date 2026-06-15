import { describe, expect, it } from 'vitest'
import { createEnvelopeVault } from '@/tools/secrets/envelope'
import { createMemorySecretStore } from '@/tools/secrets/memoryStore'
import { SecretDecryptError } from '@/tools/secrets/types'

const masterKeyB64 = btoa('k'.repeat(32)) // 32-byte master key

function vault(store = createMemorySecretStore()) {
  let n = 0
  return { v: createEnvelopeVault({ masterKeyB64, store, uuid: () => `ref_${++n}` }), store }
}

describe('envelope secret vault', () => {
  it('round-trips a secret for its tenant', async () => {
    const { v } = vault()
    const ref = await v.put({ tenantId: 't1', plaintext: 'sap-password' })
    expect(await v.get({ tenantId: 't1', ref })).toBe('sap-password')
  })

  it('rotates in place when given an existing ref', async () => {
    const { v } = vault()
    const ref = await v.put({ tenantId: 't1', plaintext: 'old' })
    await v.put({ tenantId: 't1', plaintext: 'new', ref })
    expect(await v.get({ tenantId: 't1', ref })).toBe('new')
  })

  it('returns null when reading another tenant (store binds tenant)', async () => {
    const { v } = vault()
    const ref = await v.put({ tenantId: 't1', plaintext: 'secret' })
    expect(await v.get({ tenantId: 't2', ref })).toBeNull()
  })

  it('throws SecretDecryptError on tampered ciphertext', async () => {
    const { v, store } = vault()
    const ref = await v.put({ tenantId: 't1', plaintext: 'secret' })
    const row = await store.read({ ref, tenantId: 't1' })
    if (!row) throw new Error('expected stored row')
    // Flip the last byte (part of the GCM auth tag), keeping valid base64.
    const raw = atob(row.ciphertext)
    const tampered = raw.slice(0, -1) + String.fromCharCode(raw.charCodeAt(raw.length - 1) ^ 0xff)
    await store.write({ ref, tenantId: 't1', ciphertext: btoa(tampered) })
    await expect(v.get({ tenantId: 't1', ref })).rejects.toBeInstanceOf(SecretDecryptError)
  })

  it('rejects a too-short master key at construction', () => {
    expect(() => createEnvelopeVault({ masterKeyB64: btoa('short'), store: createMemorySecretStore(), uuid: () => 'x' })).toThrow()
  })
})
