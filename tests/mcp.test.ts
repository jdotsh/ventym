import { describe, expect, it } from 'vitest'
import type { Database } from '../config/db'
import type { SessionContext } from '@/services/identity/service'
import type { WorkosClient } from '@/tools/workos/client'
import { handleMcpRequest, type McpDeps } from '@/services/mcp/server'

const session = (roles: SessionContext['roles'], tokenScopes?: readonly string[]): SessionContext => ({
  userId: 'u1',
  email: 'a@acme.test',
  displayName: 'A',
  tenantId: 't1',
  sessionId: 's1',
  roles,
  activeRole: roles[0] ?? null,
  ...(tokenScopes ? { tokenScopes } : {}),
})

const callAs = (ctx: SessionContext, name: string, args?: Record<string, unknown>) =>
  handleMcpRequest(
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, ...(args ? { arguments: args } : {}) } },
    ctx,
    deps,
  )

// whoami + the RBAC gate never touch deps; a stub is enough.
const deps = { db: {} as Database, workos: {} as WorkosClient } satisfies McpDeps

const call = (method: string, params?: Record<string, unknown>, ctx: SessionContext = session(['MEMBER'])) =>
  handleMcpRequest({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }, ctx, deps)

type ToolAnnotations = { readOnlyHint: boolean }
type ListedTool = { name: string; annotations?: ToolAnnotations }
const listedTools = (r: JsonRpcResult): ListedTool[] => (r?.result as { tools: ListedTool[] }).tools
const toolNames = (r: JsonRpcResult): string[] => listedTools(r).map((t) => t.name)

// The structured tool-error body an agent reads: { code, grpc, message, retryable }.
type ToolErrorShape = { error: { code: string; grpc: string; message: string; retryable: boolean } }
const errorOf = (r: JsonRpcResult): { isError: boolean; body: ToolErrorShape } => {
  const result = r?.result as { isError: boolean; content: { text: string }[] }
  return { isError: result.isError, body: JSON.parse(result.content[0]?.text ?? '{}') as ToolErrorShape }
}
const textOf = (r: JsonRpcResult): string => (r?.result as { content: { text: string }[] }).content[0]?.text ?? ''
type JsonRpcResult = Awaited<ReturnType<typeof handleMcpRequest>>

describe('handleMcpRequest', () => {
  it('initialize advertises the server + tools capability', async () => {
    const r = await call('initialize')
    expect(r?.result).toMatchObject({ serverInfo: { name: 'vms-mcp' }, capabilities: { tools: {} } })
  })

  it('tools/list returns the registry to a fully-privileged agent', async () => {
    const r = await call('tools/list', undefined, session(['ADMIN']))
    const names = toolNames(r)
    expect(names).toContain('whoami')
    expect(names).toContain('list_members')
  })

  it('exposes the work-order and timesheet tools to an ADMIN agent', async () => {
    const r = await call('tools/list', undefined, session(['ADMIN']))
    expect(toolNames(r)).toEqual(
      expect.arrayContaining([
        'get_work_order',
        'create_work_order',
        'transition_work_order',
        'get_timesheet',
        'create_timesheet',
        'submit_timesheet',
        'approve_timesheet',
        'reject_timesheet',
        'link_purchase_order',
        'book_timesheet',
      ]),
    )
  })

  it('permission-aware discovery: a MEMBER agent sees only the tools it can call', async () => {
    const names = toolNames(await call('tools/list', undefined, session(['MEMBER'])))
    // Allowed for MEMBER (reads are AUTHENTICATED; these writes list MEMBER).
    expect(names).toEqual(expect.arrayContaining(['whoami', 'get_work_order', 'create_timesheet', 'submit_timesheet', 'create_worker', 'create_assignment']))
    // Forbidden for MEMBER → never advertised, so the agent can't waste a turn on them.
    for (const hidden of ['create_work_order', 'transition_work_order', 'approve_timesheet', 'link_purchase_order', 'book_timesheet', 'list_members']) {
      expect(names).not.toContain(hidden)
    }
  })

  it('discovery annotates side-effect-free tools with readOnlyHint', async () => {
    const tools = listedTools(await call('tools/list', undefined, session(['ADMIN'])))
    const byName = (n: string) => tools.find((t) => t.name === n)
    expect(byName('get_work_order')?.annotations?.readOnlyHint).toBe(true)
    expect(byName('whoami')?.annotations?.readOnlyHint).toBe(true)
    expect(byName('create_work_order')?.annotations?.readOnlyHint).toBe(false)
  })

  it('fail-closed: a MEMBER agent cannot create or transition work orders', async () => {
    for (const name of ['create_work_order', 'transition_work_order']) {
      const { isError, body } = errorOf(await call('tools/call', { name }))
      expect(isError).toBe(true)
      // Machine-readable, registry-sourced — the agent reads code+grpc, not prose.
      expect(body.error.code).toBe('FORBIDDEN')
      expect(body.error.grpc).toBe('PERMISSION_DENIED')
      expect(body.error.retryable).toBe(false)
    }
  })

  it('governance is single-sourced: an ADMIN agent may create a WO over MCP (matches the API)', async () => {
    // RBAC_POLICY allows ADMIN|MANAGER to create; MCP derives from it, so this is
    // allowed (it fails later on the stub DB, not on authz). Previously diverged.
    const r = await callAs(session(['ADMIN']), 'create_work_order', { code: 'WO', lines: [] })
    expect(errorOf(r).body.error.code).not.toBe('FORBIDDEN')
  })

  it('per-token scope: a read-scoped agent is denied a write tool', async () => {
    const { isError, body } = errorOf(await callAs(session(['MANAGER'], ['vms:read']), 'create_work_order'))
    expect(isError).toBe(true)
    expect(body.error.code).toBe('FORBIDDEN')
    expect(body.error.message).toContain("'write' scope")
  })

  it('per-token scope: a write-scoped agent passes the role+scope gates', async () => {
    const r = await callAs(session(['MANAGER'], ['vms:write']), 'transition_work_order', {
      id: '00000000-0000-4000-8000-000000000000',
      transition: 'submit',
      expectedVersion: 1,
    })
    // Cleared both gates (it fails later on the stub DB, not on authz).
    expect(errorOf(r).body.error.code).not.toBe('FORBIDDEN')
  })

  it('tools/call whoami returns the agent identity', async () => {
    const r = await call('tools/call', { name: 'whoami' })
    expect(JSON.parse(textOf(r) || '{}')).toMatchObject({ userId: 'u1', tenantId: 't1', actorKind: 'agent' })
  })

  it('fail-closed: a MEMBER agent is forbidden from the ADMIN tool', async () => {
    const { isError, body } = errorOf(await call('tools/call', { name: 'list_members' }))
    expect(isError).toBe(true)
    expect(body.error.code).toBe('FORBIDDEN')
  })

  it('unknown tool → JSON-RPC error', async () => {
    const r = await call('tools/call', { name: 'nope' })
    expect(r?.error?.code).toBe(-32602)
  })

  it('unknown method → method-not-found', async () => {
    const r = await call('frobnicate')
    expect(r?.error?.code).toBe(-32601)
  })

  it('notifications/initialized has no response', async () => {
    const r = await handleMcpRequest({ jsonrpc: '2.0', method: 'notifications/initialized' }, session(['MEMBER']), deps)
    expect(r).toBeNull()
  })
})
