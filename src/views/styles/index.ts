import { BASE } from './base'
import { COMPONENTS } from './components'
import { TOKENS } from './tokens'

/** The full stylesheet, composed once and served at /assets/app.css. */
export const APP_CSS = [TOKENS, BASE, COMPONENTS].join('\n')
