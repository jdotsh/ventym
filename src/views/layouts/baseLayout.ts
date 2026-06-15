import { html, type Html } from '../html'
import type { Locale } from '../i18n'

/** The HTML shell. `body` is already-escaped HTML built by a page. */
export function baseLayout(props: { title: string; locale: Locale; body: Html }): Html {
  return html`<!doctype html>
<html lang="${props.locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${props.title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono&display=swap"
    />
    <link rel="stylesheet" href="/assets/app.css" />
  </head>
  <body>
    ${props.body}
  </body>
</html>`
}
