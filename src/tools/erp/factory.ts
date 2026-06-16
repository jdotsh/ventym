import { createHttpErpAdapter, createMockErpAdapter, type ErpAdapter } from './adapter'

// Per-tenant adapter selection (ported from Athena's factory). Routing happens by
// `provider`; v1 ships NONE (mock) and HTTP (signed webhook). SAP/Oracle become new
// providers behind this one function — the rest of the system never changes.
export const ERP_PROVIDERS = ['NONE', 'HTTP'] as const
export type ErpProvider = (typeof ERP_PROVIDERS)[number]

export type ErpProviderConfig = {
  provider: ErpProvider
  endpointUrl?: string
  secret?: string
}

/**
 * Build the adapter for a tenant's config. A declared HTTP provider with a missing
 * endpoint/secret returns a TERMINAL-failing adapter — never a mock that fabricates
 * a success (Athena's scar: a misconfigured tenant once silently posted a fake ref).
 */
export function buildErpAdapter(config: ErpProviderConfig): ErpAdapter {
  if (config.provider === 'HTTP') {
    if (!config.endpointUrl || !config.secret) {
      return { async send() { return { type: 'failed', retriable: false, error: 'ERP provider=HTTP but endpointUrl/secret is missing' } } }
    }
    return createHttpErpAdapter({ endpointUrl: config.endpointUrl, secret: config.secret })
  }
  return createMockErpAdapter()
}
