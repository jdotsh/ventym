// Reset, base elements, layout primitives.
export const BASE = `
*,*::before,*::after{box-sizing:border-box;margin:0}
html{-webkit-text-size-adjust:100%}
body{font-family:var(--font);font-size:14px;line-height:1.5;color:var(--ink);background:var(--surface);-webkit-font-smoothing:antialiased}
h1{font-size:22px;line-height:1.2;font-weight:600;letter-spacing:-.01em}
h2{font-size:16px;font-weight:600}
a{color:var(--navy-600);text-decoration:none}
a:hover{text-decoration:underline}
code,.mono{font-family:var(--mono);font-size:.92em}
:focus-visible{outline:3px solid var(--navy);outline-offset:2px;border-radius:var(--r-sm)}
.muted{color:var(--ink-soft)}
.small{font-size:12px}
.container{max-width:960px;margin:0 auto;padding:var(--sp-6) var(--sp-5)}
.stack>*+*{margin-top:var(--sp-4)}
.row{display:flex;align-items:center;gap:var(--sp-3)}
.spread{display:flex;align-items:center;justify-content:space-between;gap:var(--sp-3)}
`
