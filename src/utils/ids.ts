/** A fresh random identifier (trace ids, tokens, surrogate keys). */
export const randomId = (): string => crypto.randomUUID()

/**
 * A deterministic UUID derived from `seed` — same seed ⇒ same id. Used to make
 * event_ids idempotent so replaying a command is a no-op. FNV-1a (two keyed
 * passes) → 128 bits formatted as a v8 UUID. Not for security; for replay safety.
 */
export function deterministicId(seed: string): string {
  const fnv = (offset: number): number => {
    let h = offset >>> 0
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    return h >>> 0
  }
  const a = fnv(0x811c9dc5)
  const b = fnv(0x7ee3623b)
  const c = fnv(0x9e3779b1)
  const d = fnv(0x85ebca77)
  const hex = (n: number) => n.toString(16).padStart(8, '0')
  const raw = hex(a) + hex(b) + hex(c) + hex(d)
  // Force UUID v8 layout (version nibble = 8, variant bits = 10xx).
  const v = raw.slice(0, 12) + '8' + raw.slice(13, 16) + ((parseInt(raw[16]!, 16) & 0x3) | 0x8).toString(16) + raw.slice(17)
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`
}
