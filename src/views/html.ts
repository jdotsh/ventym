import type { HtmlEscapedString } from 'hono/utils/html'

export { html } from 'hono/html'

/** What every view render function returns (hono/html may defer to a Promise). */
export type Html = HtmlEscapedString | Promise<HtmlEscapedString>
