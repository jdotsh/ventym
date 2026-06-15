// The machine/API surface — paths that speak JSON (problem+json errors, OpenAPI
// documentation, agent/MCP) as opposed to the HTML view surface (login redirects,
// rendered pages). One source of truth so the RBAC wall and the OpenAPI generator
// agree on what "an API path" is.
export const API_PATH_PREFIXES = ['/api/', '/agent/', '/mcp', '/webhooks/', '/.well-known/'] as const

export function isApiPath(path: string): boolean {
  return API_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))
}
