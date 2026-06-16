// Reset, base elements, the institutional type ladder, and the app shell layout
// (fixed sidebar + content). Calm authority, audit-grade restraint (docs/design-system.md).
export const BASE = `
*,*::before,*::after{box-sizing:border-box;margin:0}
html{-webkit-text-size-adjust:100%}
body{font-family:var(--font);font-size:var(--fs-body);line-height:var(--lh-body);
  color:var(--ink);background:var(--surface);-webkit-font-smoothing:antialiased;
  font-feature-settings:'cv05','ss01'}
h1,h2,h3{font-weight:600;letter-spacing:-.02em;line-height:var(--lh-tight);color:var(--ink)}
h1{font-size:var(--fs-h1)}
h2{font-size:var(--fs-h2);margin-top:var(--sp-2)}
h3{font-size:var(--fs-h3)}
p{line-height:var(--lh-body);color:var(--ink-soft)}
a{color:var(--navy-600);text-decoration:none;transition:color .14s}
a:hover{color:var(--navy);text-decoration:underline}
code,.mono{font-family:var(--mono);font-size:.9em;font-variant-numeric:tabular-nums}
:where(button,a,input,select,textarea):focus-visible{outline:3px solid var(--amber);
  outline-offset:2px;border-radius:var(--r-sm)}
.muted{color:var(--ink-soft)}
.small{font-size:var(--fs-caption)}
.eyebrow{font-size:var(--fs-caption);font-weight:500;color:var(--ink-dim);
  text-transform:uppercase;letter-spacing:.1em}

/* ── App shell: fixed sidebar + content ── */
:root{--nav-w:248px}
.sidenav{position:fixed;top:0;left:0;bottom:0;width:var(--nav-w);background:var(--raised);
  border-right:1px solid var(--border);display:flex;flex-direction:column;padding:var(--sp-4) var(--sp-3);z-index:20}
.sidenav__brand{display:flex;align-items:center;gap:var(--sp-2);font-weight:600;font-size:var(--fs-h3);
  letter-spacing:-.02em;color:var(--ink);padding:var(--sp-2) var(--sp-3) var(--sp-5)}
.sidenav__brand:hover{text-decoration:none;color:var(--ink)}
.sidenav__nav{display:flex;flex-direction:column;gap:2px;flex:1}
.navlink{display:flex;align-items:center;gap:var(--sp-3);height:38px;padding:0 var(--sp-3);
  border-radius:var(--r-md);color:var(--ink-soft);font-weight:500;font-size:var(--fs-body);transition:background .14s,color .14s}
.navlink:hover{background:var(--surface);color:var(--ink);text-decoration:none}
.navlink--active{background:var(--navy-50);color:var(--navy);font-weight:600}
.sidenav__foot{border-top:1px solid var(--border);padding-top:var(--sp-3);margin-top:var(--sp-3);
  display:flex;flex-direction:column;gap:var(--sp-2)}
.sidenav__user{font-size:var(--fs-caption);color:var(--ink-dim);padding:0 var(--sp-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ── Content area (sits right of the sidebar) ── */
.container{margin-left:var(--nav-w);max-width:1320px;padding:clamp(24px,3vw,40px) clamp(16px,3vw,40px)}
.page-head{display:flex;align-items:flex-end;justify-content:space-between;gap:var(--sp-4);margin-bottom:var(--sp-5)}
.stack>*+*{margin-top:var(--sp-5)}
.row{display:flex;align-items:center;gap:var(--sp-3)}
.spread{display:flex;align-items:center;justify-content:space-between;gap:var(--sp-3)}
.flex-wrap{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-2)}
.num{text-align:right;font-variant-numeric:tabular-nums}

@media(max-width:820px){
  .sidenav{position:static;width:auto;flex-direction:row;align-items:center;border-right:0;
    border-bottom:1px solid var(--border);padding:var(--sp-2) var(--sp-3);gap:var(--sp-2);overflow-x:auto}
  .sidenav__brand{padding:0 var(--sp-2) 0 0;font-size:var(--fs-lead)}
  .sidenav__nav{flex-direction:row;flex:1}
  .navlink{height:34px;white-space:nowrap}
  .sidenav__foot{flex-direction:row;border-top:0;border-left:1px solid var(--border);margin:0;padding:0 0 0 var(--sp-2)}
  .sidenav__user{display:none}
  .container{margin-left:0;max-width:100%}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition-duration:.01ms!important;animation-duration:.01ms!important}}
`
