// Layer-integrity gate (R-1/R-5/R-6) — enforces the seam law mechanically, exceeding a
// plain circular-dep check: imports may only flow DOWN the layer stack, and there are
// no cycles. utils/types (pure) → tools (I/O) → services (rules) → routes/views/middleware.
// config + db/schema are shared (any layer may import them). External deps are ignored.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

type Layer = 'util' | 'tool' | 'service' | 'top' | 'shared'
const RANK: Record<Exclude<Layer, 'shared'>, number> = { util: 0, tool: 1, service: 2, top: 3 }

function layerOf(file: string): Layer {
  const p = file.replace(/\\/g, '/')
  if (/\/(utils|types)\//.test(p)) return 'util'
  if (/\/tools\//.test(p)) return 'tool'
  if (/\/services\//.test(p)) return 'service'
  if (/\/(routes|views|middleware)\//.test(p)) return 'top'
  return 'shared' // src/config, root config/, db/schema, app.ts, index.ts
}

// Collect all .ts under src/.
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') && !p.endsWith('.d.ts') ? [p] : []
  })
}
const files = walk('src')

// Resolve an internal import specifier to a file path; null for external/unresolved.
function resolveImport(fromFile: string, spec: string): string | null {
  let base: string | null = null
  if (spec.startsWith('@/')) base = resolve('src', spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
  else return null // external (or ../config — handled below)
  for (const cand of [base + '.ts', join(base, 'index.ts')]) {
    try { if (statSync(cand).isFile()) return relative('.', cand) } catch { /* keep trying */ }
  }
  // ../../config/* and ../db/* resolve outside src
  try { if (statSync(base + '.ts').isFile()) return relative('.', base + '.ts') } catch { /* none */ }
  return null
}

const graph = new Map<string, string[]>()
const violations: string[] = []
const importRe = /^\s*import[^'"]*['"]([^'"]+)['"]/gm

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const edges: string[] = []
  for (let m = importRe.exec(src); m; m = importRe.exec(src)) {
    const target = resolveImport(file, m[1]!)
    if (!target) continue
    edges.push(target)
    const a = layerOf(file)
    const b = layerOf(target)
    if (a !== 'shared' && b !== 'shared' && RANK[b] > RANK[a]) {
      violations.push(`${file} (${a}) imports ${target} (${b}) — imports must flow DOWN the stack`)
    }
  }
  graph.set(file, edges)
}

// Tarjan SCC — any component with >1 node (or a self-loop) is a cycle.
let idx = 0
const index = new Map<string, number>()
const low = new Map<string, number>()
const onStack = new Set<string>()
const stack: string[] = []
const cycles: string[][] = []
function strongconnect(v: string): void {
  index.set(v, idx); low.set(v, idx); idx++
  stack.push(v); onStack.add(v)
  for (const w of graph.get(v) ?? []) {
    if (!index.has(w)) { strongconnect(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)) }
    else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!))
  }
  if (low.get(v) === index.get(v)) {
    const comp: string[] = []
    let w: string
    do { w = stack.pop()!; onStack.delete(w); comp.push(w) } while (w !== v)
    if (comp.length > 1 || (graph.get(v) ?? []).includes(v)) cycles.push(comp)
  }
}
for (const f of graph.keys()) if (!index.has(f)) strongconnect(f)

if (violations.length || cycles.length) {
  if (violations.length) {
    console.error(`✗ layer-integrity — ${violations.length} upward import(s):`)
    for (const v of violations) console.error(`    ${v}`)
  }
  if (cycles.length) {
    console.error(`✗ layer-integrity — ${cycles.length} import cycle(s):`)
    for (const c of cycles) console.error(`    ${c.join(' → ')}`)
  }
  process.exit(1)
}
console.log(`✓ layer-integrity — ${files.length} files: imports flow down the stack, no cycles`)
