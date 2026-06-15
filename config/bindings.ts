import type { AppConfig } from './env'

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
}

/** Per-request context the middleware chain populates. */
export type AppVariables = {
  traceId: string
  config: AppConfig
}

export type AppEnv = { Bindings: WorkerEnv; Variables: AppVariables }
