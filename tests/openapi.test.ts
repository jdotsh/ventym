import { describe, expect, it } from 'vitest'
import { buildOpenApiDocument } from '@/openapi/document'

describe('openapi generator', () => {
  it('emits a 3.1 document with the request-derived server', () => {
    const doc = buildOpenApiDocument({ serverUrl: 'https://api.example' })
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.servers[0]?.url).toBe('https://api.example')
  })

  it('includes the machine surface and excludes HTML views', () => {
    const doc = buildOpenApiDocument()
    expect(doc.paths['/mcp']?.post).toBeDefined()
    expect(doc.paths['/agent/whoami']?.get).toBeDefined()
    expect(doc.paths['/api/v1/openapi.json']?.get).toBeDefined() // self-documenting
    expect(doc.paths['/dashboard']).toBeUndefined() // HTML view, not the API surface
    expect(doc.paths['/login']).toBeUndefined()
  })

  it('infers security from the policy (public surfaces carry none)', () => {
    const doc = buildOpenApiDocument()
    expect(doc.paths['/mcp']?.post?.security).toEqual([])
    expect(doc.paths['/mcp']?.post?.operationId).toBe('postMcp')
  })

  it('wires the problem+json schema with codes sourced from the registry', () => {
    const doc = buildOpenApiDocument()
    expect(doc.components.schemas.Problem).toBeDefined()
    expect(doc.components.securitySchemes.bearerAuth).toBeDefined()
  })
})
