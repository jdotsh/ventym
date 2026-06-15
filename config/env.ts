import { z } from 'zod'

/** Boot config — validated once, fail-fast. Schema is the single source of truth. */
const configSchema = z.object({
  ENVIRONMENT: z.enum(['local', 'dev', 'staging', 'production']).default('local'),
  DATABASE_URL: z.string().url().optional(), // falls back to the Hyperdrive binding
  WORKOS_API_KEY: z.string().startsWith('sk_'),
  WORKOS_CLIENT_ID: z.string().min(1),
  WORKOS_REDIRECT_URI: z.string().url(),
  SESSION_SECRET: z.string().min(32),
})

export type AppConfig = z.infer<typeof configSchema>

export function parseConfig(env: Record<string, unknown>): AppConfig {
  return configSchema.parse(env)
}
