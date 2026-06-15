import { describe, expect, it } from 'vitest'
import type { Database } from '../config/db'
import type { SessionContext } from '@/services/identity/service'
import type { WorkosClient } from '@/tools/workos/client'
import { handleMcpRequest, type McpDeps } from '@/services/mcp/server'

const session = (roles: SessionContext['roles']): SessionContext => ({
  userId: 'u1',
  email: 'a@acme.test',
  displayName: 'A',
  tenantId: 't1',
  sessionId: 's1',
  roles,
  activeRole: roles[0] ?? null,
})

// whoami + the RBAC gate never touch deps; a stub is enough.
const deps = { db: {} as Database, workos: {} as WorkosClient } satisfies McpDeps

const call = (method: string, params?: Record<string, unknown>) =>
  handleMcpRequest({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }, session(['MEMBER']), deps)

describe('handleMcpRequest', () => {
  it('initialize advertises the server + tools capability', async () => {
    const r = await call('initialize')
    expect(r?.result).toMatchObject({ serverInfo: { name: 'vms-mcp' }, capabilities: { tools: {} } })
  })

  it('tools/list returns the registry', async () => {
    const r = await call('tools/list')
    const names = (r?.result as { tools: { name: string }[] }).tools.map((t) => t.name)
    expect(names).toContain('whoami')
    expect(names).toContain('list_members')
  })

  it('exposes the work-order tools', async () => {
    const r = await call('tools/list')
    const names = (r?.result as { tools: { name: string }[] }).tools.map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['get_work_order', 'create_work_order', 'transition_work_order']))
  })

  it('fail-closed: a MEMBER agent cannot create or transition work orders', async () => {
    for (const name of ['create_work_order', 'transition_work_order']) {
      const r = await call('tools/call', { name })
      const result = r?.result as { isError: boolean; content: { text: string }[] }
      expect(result.isError).toBe(true)
      expect(result.content[0]?.text).toContain('requires role MANAGER')
    }
  })

  it('tools/call whoami returns the agent identity', async () => {
    const r = await call('tools/call', { name: 'whoami' })
    const text = (r?.result as { content: { text: string }[] }).content[0]?.text ?? '{}'
    expect(JSON.parse(text)).toMatchObject({ userId: 'u1', tenantId: 't1', actorKind: 'agent' })
  })

  it('fail-closed: a MEMBER agent is forbidden from the ADMIN tool', async () => {
    const r = await call('tools/call', { name: 'list_members' })
    const result = r?.result as { content: { text: string }[]; isError: boolean }
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('requires role ADMIN')
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
