// Tenant-predicate gate (R-19) — the moat's CI enforcement. Walks every Drizzle
// query in the repo layer (src/tools/db) via the TS compiler API and fails if a
// query on a TENANT-SCOPED table isn't tenant-scoped (the enclosing function must
// reference `tenantId`, or carry an explicit `@audit:unscoped` waiver with a reason).
// Statement-precise — unlike a file grep, one unscoped query in a scoped file fails.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

const REPO_DIR = 'src/tools/db'
// Global (non-RLS) tables that legitimately have no tenant predicate.
const GLOBAL_TABLES = new Set(['tenant', 'appUser', 'tenantConnection', 'session', 'apiToken', 'idempotency'])
// Only SELECT reads (`.from`). Inserts/updates/deletes carry tenant_id in the payload
// and are guarded by the RLS USING/WITH CHECK policy inside withTenantScope; a READ is
// where a missing predicate leaks (the read path may skip the tx → RLS off → R-19).
const QUERY_ROOTS = new Set(['from'])

type Violation = { file: string; line: number; table: string; fn: string }
const violations: Violation[] = []

function tableArg(node: ts.CallExpression): string | null {
  const arg = node.arguments[0]
  return arg && ts.isIdentifier(arg) ? arg.text : null
}

// The nearest enclosing function-like node (where the tenant predicate must appear).
function enclosingFn(node: ts.Node): ts.Node | null {
  let n: ts.Node | undefined = node.parent
  while (n) {
    if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) return n
    n = n.parent
  }
  return null
}

function check(file: string): void {
  const text = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text
      if (QUERY_ROOTS.has(method)) {
        const table = tableArg(node)
        if (table && !GLOBAL_TABLES.has(table)) {
          const fn = enclosingFn(node)
          const scope = fn ? fn.getText(sf) : text
          const scoped = /tenantId\b/.test(scope)
          const waived = /@audit:unscoped/.test(scope) || /@audit:unscoped/.test(text.slice(Math.max(0, node.getStart(sf) - 120), node.getStart(sf)))
          if (!scoped && !waived) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
            const name = fn && (ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) && fn.name ? fn.name.getText(sf) : '<anon>'
            violations.push({ file, line: line + 1, table, fn: name })
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

for (const f of readdirSync(REPO_DIR).filter((f) => f.endsWith('.ts'))) check(join(REPO_DIR, f))

if (violations.length > 0) {
  console.error(`✗ tenant-predicate gate — ${violations.length} query(ies) on a tenant-scoped table without a tenant predicate:`)
  for (const v of violations) console.error(`    ${v.file}:${v.line}  ${v.fn}() → ${v.table}  (add the tenantId WHERE, or // @audit:unscoped <reason>)`)
  process.exit(1)
}
console.log('✓ tenant-predicate — every repo query is tenant-scoped or explicitly waived')
