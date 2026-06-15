type LogFields = Record<string, unknown>
type LogLevel = 'error' | 'warn' | 'info'

// One JSON line per event — the log/SLI pipeline parses these. The only file
// permitted to call console (lint-enforced).
function emit(level: LogLevel, msg: string, fields?: LogFields): void {
  console.log(JSON.stringify({ level, msg, time: new Date().toISOString(), ...fields }))
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
