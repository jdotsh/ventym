// Drift guard (mirrors gate:rbac): every MCP tool that mirrors an HTTP route MUST
// resolve to an RBAC_POLICY entry — so MCP governance can never diverge from the
// API. An MCP tool with a route absent from the policy fails the build.
import { policyFor } from '../src/config/rbacPolicy'
import { TOOLS } from '../src/services/mcp/server'

let missing = 0
let routed = 0
for (const tool of TOOLS) {
  if (!tool.route) continue
  routed++
  const [method, path] = tool.route.split(' ')
  if (!method || !path || !policyFor(method, path)) {
    console.error(`✗ MCP tool '${tool.name}' route '${tool.route}' has no RBAC_POLICY entry`)
    missing++
  }
}

if (missing > 0) {
  console.error(`MCP coverage FAILED: ${missing} tool(s) ungoverned`)
  process.exit(1)
}
console.log(`✓ MCP coverage — ${routed} routed tools, all governed by RBAC_POLICY (one SSOT)`)
