import { describe, expect, it } from 'vitest'
import type { Database } from '../config/db'
import type { SessionContext } from '@/services/identity/service'
import type { WorkosClient } from '@/tools/workos/client'
import { handleMcpRequest, type McpDeps } from '@/services/mcp/server'
import { createWorkOrderArgs } from '@/config/capabilities'
import { buildOpenApiDocument } from '@/openapi/document'

const session = (): SessionContext => ({
  userId: 'u1',
  email: 'a@acme.test',
  displayName: 'A',
  tenantId: 't1',
  sessionId: 's1',
  roles: ['ADMIN'],
  activeRole: 'ADMIN',
})
const deps = { db: {} as Database, workos: {} as WorkosClient } satisfies McpDeps

type JsonSchema = { properties?: Record<string, unknown> }

describe('capability registry — the contract is single-sourced', () => {
  it('the advertised MCP schema for create_work_order no longer lies', async () => {
    const r = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, session(), deps)
    const tools = (r?.result as { tools: { name: string; inputSchema: JsonSchema }[] }).tools
    const advertised = tools.find((t) => t.name === 'create_work_order')?.inputSchema
    const props = Object.keys(advertised?.properties ?? {})
    // The hand-written schema used to list only {code, lines}; it now advertises
    // every field the real Zod requires.
    expect(props).toEqual(expect.arrayContaining(['code', 'engagementType', 'vatRate', 'startDate', 'endDate', 'lines']))
  })

  it('the advertised schema and the enforced schema are the same Zod', () => {
    // The exact payload the old advertised schema implied is rejected by the real one.
    expect(createWorkOrderArgs.safeParse({ code: 'WO', lines: [] }).success).toBe(false)
    expect(
      createWorkOrderArgs.safeParse({
        code: 'WO',
        engagementType: 'T_AND_M',
        vatRate: 0.22,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        lines: [{ lineNum: 1, roleCode: 'ENG', billRateDailyExcl: 500, plannedDays: 10 }],
      }).success,
    ).toBe(true)
  })

  it('OpenAPI now documents request bodies from the same registry', () => {
    const doc = buildOpenApiDocument()
    const op = doc.paths['/api/v1/work-orders']?.post
    expect(op?.requestBody).toBeDefined()
    const schema = op?.requestBody?.content['application/json'].schema as JsonSchema
    expect(Object.keys(schema.properties ?? {})).toEqual(expect.arrayContaining(['engagementType', 'vatRate', 'lines']))
    // GETs carry no request body.
    expect(doc.paths['/api/v1/work-orders/{id}']?.get?.requestBody).toBeUndefined()
  })
})
