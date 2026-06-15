import { defineConfig } from 'drizzle-kit'

// Migrations are generated (greenfield) — drizzle-kit owns the journal from 0001.
export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://vms:vms@localhost:5432/vms' },
})
