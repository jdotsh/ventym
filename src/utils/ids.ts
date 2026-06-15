/** A fresh random identifier (trace ids, tokens, surrogate keys). */
export const randomId = (): string => crypto.randomUUID()
