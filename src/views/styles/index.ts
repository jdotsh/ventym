import { BASE } from './base'
import { COMPONENTS } from './components'
import { TOKENS } from './tokens'

/** The full stylesheet, composed once and served at /assets/app.css. */
export const APP_CSS = [TOKENS, BASE, COMPONENTS].join('\n')

/** A content hash of the stylesheet → cache-busting query (`/assets/app.css?v=…`).
 *  When the CSS changes the version changes, so a normal reload always re-fetches —
 *  no more stale-cache "the CSS didn't update". djb2, stable per content. */
export const CSS_VERSION = ((): string => {
  let h = 5381
  for (let i = 0; i < APP_CSS.length; i++) h = ((h << 5) + h + APP_CSS.charCodeAt(i)) >>> 0
  return h.toString(36)
})()
