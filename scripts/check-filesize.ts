// File-size gate (ARCHITECTURE.md §1: 250 hard / 150 target). A source file over
// the hard cap fails CI — the charter's anti-monolith rule, enforced not just
// documented. Athena froze a 14k-line styles.ts; we refuse to inherit that.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const HARD_CAP = 250
const ROOTS = ['src', 'config', 'db/schema']
const EXCLUDE = /\.d\.ts$/

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(path))
    else if (entry.name.endsWith('.ts') && !EXCLUDE.test(path)) out.push(path)
  }
  return out
}

const offenders: string[] = []
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, 'utf8').split('\n').length
    if (lines > HARD_CAP) offenders.push(`${file}: ${lines} lines (cap ${HARD_CAP})`)
  }
}

if (offenders.length > 0) {
  console.error(`✗ file-size gate — ${offenders.length} file(s) over the ${HARD_CAP}-line hard cap:`)
  for (const o of offenders) console.error(`    ${o}`)
  process.exit(1)
}
console.log(`✓ file-size — every source file within the ${HARD_CAP}-line hard cap`)
