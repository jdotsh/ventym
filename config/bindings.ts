import type { AppConfig } from './env'
import type { Database } from './db'
import type { WorkosClient } from '@/tools/workos/client'
import type { AgentVerifier } from '@/tools/workos/agentAuth'
import type { SessionContext } from '@/services/identity/service'

/** Raw Cloudflare Worker env: vars + secrets + bindings. */
export type WorkerEnv = {
  ENVIRONMENT: string
  DATABASE_URL?: string
  WORKOS_API_KEY: string
  WORKOS_CLIENT_ID: string
  WORKOS_REDIRECT_URI: string
  SESSION_SECRET: string
  HYPERDRIVE?: Hyperdrive
  SLI?: AnalyticsEngineDataset
  RATE_LIMIT?: KVNamespace
}

/** Per-request context the middleware chain populates. */
export type AppVariables = {
  traceId: string
  config: AppConfig
  db: Database
  workos: WorkosClient
  agentVerifier: AgentVerifier
  session: SessionContext | null // null = anonymous
}

export type AppEnv = { Bindings: WorkerEnv; Variables: AppVariables }
