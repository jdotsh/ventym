import { createApp } from '../src/app'
import { RBAC_POLICY } from '../src/config/rbacPolicy'

// Every registered route MUST have an explicit RBAC_POLICY entry. The runtime
// middleware fail-closes anyway, but this catches a missing entry at CI time.
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

const seen = new Set<string>()
const missing: string[] = []

for (const route of createApp().routes) {
  if (!METHODS.has(route.method)) continue // skip middleware (method ALL)
  const key = `${route.method} ${route.path}`
  if (seen.has(key)) continue
  seen.add(key)
  if (!(key in RBAC_POLICY)) missing.push(key)
}

if (missing.length > 0) {
  console.error('✗ RBAC coverage gate — routes missing a policy entry:')
  for (const k of missing) console.error(`    ${k}`)
  process.exit(1)
}
console.log(`✓ RBAC coverage — ${seen.size} routes, all governed`)
