type LogFields = Record<string, unknown>
type LogLevel = 'error' | 'warn' | 'info'

// Keys whose values are always secret, and value patterns that are secret
// wherever they appear. PII redaction happens at the log boundary — callers
// never have to remember to scrub.
const SECRET_KEY = /pass|secret|token|api[-_]?key|authorization|cookie|session|mfa|private[-_]?key/i
const JWT = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/
const BEARER = /^Bearer\s+/i
const SECRET_VALUE = /^sk-[a-z0-9]/i
const EMAIL = /^[^@\s]+@([^@\s]+\.[^@\s]+)$/

function redactValue(value: string): string {
  if (JWT.test(value) || BEARER.test(value) || SECRET_VALUE.test(value)) return '[redacted]'
  const email = EMAIL.exec(value)
  return email ? `u***@${email[1]}` : value
}

function redact(input: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (input === null || depth > 8) return input
  if (typeof input === 'string') return redactValue(input)
  if (typeof input !== 'object') return input
  if (seen.has(input)) return '[circular]'
  seen.add(input)
  if (Array.isArray(input)) return input.map((item) => redact(item, depth + 1, seen))
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    out[key] = SECRET_KEY.test(key) ? '[redacted]' : redact(value, depth + 1, seen)
  }
  return out
}

/** Scrub secrets/PII from a log payload. Exported for unit testing. */
export function redactFields(fields: LogFields): LogFields {
  const out: LogFields = {}
  for (const [key, value] of Object.entries(fields)) {
    out[key] = SECRET_KEY.test(key) ? '[redacted]' : redact(value, 0, new WeakSet())
  }
  return out
}

// One JSON line per event — the log/SLI pipeline parses these. The only file
// permitted to call console (lint-enforced).
function emit(level: LogLevel, msg: string, fields?: LogFields): void {
  const safe = fields ? redactFields(fields) : {}
  console.log(JSON.stringify({ level, msg, time: new Date().toISOString(), ...safe }))
}

export const logger = {
  error: (msg: string, fields?: LogFields) => emit('error', msg, fields),
  warn: (msg: string, fields?: LogFields) => emit('warn', msg, fields),
  info: (msg: string, fields?: LogFields) => emit('info', msg, fields),
}

export function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    return { error: { name: err.name, message: err.message, stack: err.stack } }
  }
  return { error: String(err) }
}
