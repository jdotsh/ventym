import { RBAC_POLICY, type PolicyEntry } from '@/config/rbacPolicy'
import { DOMAIN_REGISTRY } from '@/types/errorRegistry'
import { isApiPath } from '@/utils/apiPaths'

/**
 * OpenAPI 3.1 generated from the two SSOTs: RBAC_POLICY (paths + security) and
 * the error registry (the problem+json contract). Built early so every new API
 * route is born documented — and so it stays the MCP/SDK substrate. Request/
 * response body schemas (Zod → JSON Schema) attach per-endpoint as they land.
 */

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const
type HttpMethod = (typeof HTTP_METHODS)[number]

type Operation = {
  operationId: string
  summary: string
  tags: string[]
  security: Array<Record<string, string[]>>
  responses: Record<string, unknown>
}
type PathItem = Partial<Record<HttpMethod, Operation>>

export type OpenApiDocument = {
  openapi: '3.1.0'
  info: { title: string; version: string; description: string }
  servers: Array<{ url: string }>
  paths: Record<string, PathItem>
  components: { securitySchemes: Record<string, unknown>; schemas: Record<string, unknown> }
}

function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(value)
}

const toOpenApiPath = (path: string): string => path.replace(/:(\w+)/g, '{$1}')

const securityFor = (entry: PolicyEntry): Array<Record<string, string[]>> =>
  entry.kind === 'public' ? [] : [{ cookieAuth: [] }, { bearerAuth: [] }]

function tagFor(path: string): string {
  const seg = path.split('/').filter(Boolean)[0] ?? 'root'
  const clean = seg.replace(/[^a-z0-9]/gi, ' ').trim() || 'root'
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

function operationId(method: string, path: string): string {
  const parts = path.split('/').filter(Boolean).map((s) => s.replace(/\W/g, ''))
  const camel = parts.map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join('')
  return method.toLowerCase() + camel.charAt(0).toUpperCase() + camel.slice(1)
}

const problemRef = { $ref: '#/components/schemas/Problem' }
const errorResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: problemRef } },
})

const standardResponses = (): Record<string, unknown> => ({
  '200': { description: 'OK' },
  '400': errorResponse('Bad request'),
  '401': errorResponse('Unauthenticated'),
  '403': errorResponse('Forbidden'),
  '404': errorResponse('Not found'),
  '422': errorResponse('Validation failed'),
  '429': errorResponse('Rate limited'),
  default: errorResponse('Unexpected error'),
})

// The problem+json schema — its `code` enum is sourced from the error registry,
// so the documented codes can never drift from the ones the server emits.
const problemSchema = (): Record<string, unknown> => ({
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'grpc', 'message', 'trace_id'],
      properties: {
        code: { type: 'string', enum: Object.keys(DOMAIN_REGISTRY) },
        grpc: { type: 'string' },
        message: { type: 'string' },
        trace_id: { type: 'string' },
        retry_after: { type: 'integer' },
        details: { type: 'object', additionalProperties: true },
      },
    },
  },
})

export function buildOpenApiDocument(opts: { serverUrl?: string } = {}): OpenApiDocument {
  const paths: Record<string, PathItem> = {}
  for (const [key, entry] of Object.entries(RBAC_POLICY)) {
    const [method, rawPath] = key.split(' ')
    if (!method || !rawPath || !isApiPath(rawPath)) continue
    const m = method.toLowerCase()
    if (!isHttpMethod(m)) continue
    const openApiPath = toOpenApiPath(rawPath)
    let item = paths[openApiPath]
    if (!item) {
      item = {}
      paths[openApiPath] = item
    }
    item[m] = {
      operationId: operationId(method, rawPath),
      summary: `${method} ${rawPath}`,
      tags: [tagFor(rawPath)],
      security: securityFor(entry),
      responses: standardResponses(),
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'VMS API',
      version: '1.0.0',
      description: 'Generated from RBAC_POLICY (paths + security) + the error registry (the contract SSOT).',
    },
    servers: [{ url: opts.serverUrl ?? '/' }],
    paths,
    components: {
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'session' },
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: { Problem: problemSchema() },
    },
  }
}
