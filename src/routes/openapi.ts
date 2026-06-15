import { Hono } from 'hono'
import type { AppEnv } from '../../config/bindings'
import { buildOpenApiDocument } from '@/openapi/document'

// The contract SSOT, served for SDK generation, MCP tooling, and humans.
export const openapiRoutes = new Hono<AppEnv>().get('/api/v1/openapi.json', (c) => {
  const url = new URL(c.req.url)
  return c.json(buildOpenApiDocument({ serverUrl: `${url.protocol}//${url.host}` }))
})
