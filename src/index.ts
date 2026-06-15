import { createApp } from './app'

// Cloudflare Workers entry. Hono's app is itself a `{ fetch }` handler.
export default createApp()
