import { secureHeaders } from 'hono/secure-headers'

/**
 * Defense-in-depth response headers + a strict CSP for the server-rendered MPA.
 * We emit no inline scripts/styles (the stylesheet is at /assets/app.css), so
 * script/style stay 'self' — no 'unsafe-inline'. Fonts come from Google.
 */
export function createSecurityHeaders() {
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
    },
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
  })
}
