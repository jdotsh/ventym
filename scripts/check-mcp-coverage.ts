// Drift guards (mirror gate:rbac) — make "one service, three faces" true by
// construction. Fails the build if:
//   1. an MCP capability's route is absent from RBAC_POLICY (access drift), or
//   2. a routed MCP tool isn't declared in the capability registry (i.e. someone
//      hand-wrote a tool/schema instead of projecting it — contract drift).
import { policyFor } from '../src/config/rbacPolicy'
import { CAPABILITIES } from '../src/config/capabilities'
import { TOOLS } from '../src/services/mcp/server'

let failures = 0
const fail = (msg: string) => {
  console.error(`✗ ${msg}`)
  failures++
}

const capNames = new Set<string>()
for (const cap of CAPABILITIES) {
  if (!cap.mcp) continue
  capNames.add(cap.mcp.name)
  const [method, path] = cap.route.split(' ')
  if (!method || !path || !policyFor(method, path)) {
    fail(`capability '${cap.mcp.name}' route '${cap.route}' has no RBAC_POLICY entry`)
  }
}

for (const tool of TOOLS) {
  if (!tool.route) continue
  if (!capNames.has(tool.name)) {
    fail(`MCP tool '${tool.name}' is routed but not declared in CAPABILITIES (hand-written governance/schema)`)
  }
}

if (failures > 0) {
  console.error(`MCP coverage FAILED: ${failures} issue(s)`)
  process.exit(1)
}
console.log(`✓ MCP coverage — ${capNames.size} capabilities, all governed by RBAC_POLICY; every routed tool is a registry projection`)
