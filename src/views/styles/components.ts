// Components — buttons, cards, audit-grade tables, badges, forms, auth shell.
// Token-driven; no raw hex/px (docs/design-system.md). Amber focus is in base.ts.
export const COMPONENTS = `
.btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--sp-2);
  height:38px;padding:0 var(--sp-4);border:1px solid var(--border-strong);border-radius:var(--r-md);
  font:inherit;font-weight:500;font-size:var(--fs-body);cursor:pointer;background:var(--raised);color:var(--ink);
  transition:background .14s,border-color .14s,box-shadow .14s,transform .12s}
.btn:hover{border-color:var(--ink-dim);text-decoration:none}
.btn:active{transform:translateY(1px)}
.btn--primary{background:var(--navy);color:#fff;border-color:var(--navy)}
.btn--primary:hover{background:var(--navy-bright);border-color:var(--navy-bright);box-shadow:0 4px 12px -4px rgba(30,58,138,.35)}
.btn--ghost{background:transparent;border-color:var(--border)}
.btn--ghost:hover{background:var(--surface);color:var(--ink)}
.btn--danger{color:var(--danger);border-color:var(--border-strong)}
.btn--danger:hover{background:var(--danger-bg);border-color:var(--danger)}
.btn--sm{height:30px;padding:0 var(--sp-3);font-size:var(--fs-caption)}
.btn--lg{height:46px;padding:0 var(--sp-5);font-size:var(--fs-lead)}
.btn--block{width:100%}

.card{background:var(--raised);border:1px solid var(--border);border-radius:var(--r-lg);
  padding:var(--sp-5);box-shadow:var(--shadow)}
.card.muted{color:var(--ink-soft);font-size:var(--fs-body)}

/* Audit-grade table (sits inside a .card) */
.table{width:100%;border-collapse:separate;border-spacing:0;font-size:var(--fs-body)}
.table thead th{text-align:left;padding:var(--sp-2) var(--sp-3);font-family:var(--mono);
  font-size:var(--fs-caption);font-weight:500;color:var(--ink-dim);letter-spacing:.08em;
  text-transform:uppercase;border-bottom:1px solid var(--border);white-space:nowrap}
.table tbody td{padding:var(--sp-3);border-bottom:1px solid var(--border);vertical-align:middle;color:var(--ink)}
.table tbody tr:last-child td{border-bottom:0}
.table tbody tr:hover td{background:color-mix(in srgb,var(--ink-dim) 5%,transparent)}
.table th .muted,.table td .muted{font-size:var(--fs-caption)}

/* Status pills — mono, bordered; amber/green/red carry state */
.badge{display:inline-flex;align-items:center;height:24px;padding:0 var(--sp-2);
  border:1px solid var(--border-strong);border-radius:var(--r-sm);font-family:var(--mono);
  font-size:var(--fs-caption);letter-spacing:.02em;color:var(--ink-soft);background:var(--raised)}
.badge--ok{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 30%,var(--ok-bg));background:var(--ok-bg)}
.badge--warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 30%,var(--warn-bg));background:var(--warn-bg)}
.badge--danger{color:var(--danger);border-color:color-mix(in srgb,var(--danger) 30%,var(--danger-bg));background:var(--danger-bg)}

.alert{padding:var(--sp-3) var(--sp-4);border-radius:var(--r-md);font-size:var(--fs-body);
  border:1px solid color-mix(in srgb,var(--ok) 40%,var(--ok-bg));color:var(--ok);background:var(--ok-bg)}
.alert--danger{border-color:color-mix(in srgb,var(--danger) 40%,var(--danger-bg));color:var(--danger);background:var(--danger-bg)}

.field{display:block}
.field>span{display:block;font-size:var(--fs-caption);font-weight:500;margin-bottom:var(--sp-1)}
input:not([type=checkbox]),select{width:100%;height:38px;padding:0 var(--sp-3);
  border:1px solid var(--border-strong);border-radius:var(--r-md);font:inherit;
  background:var(--raised);color:var(--ink);transition:border-color .14s,box-shadow .14s}
input:focus,select:focus{outline:none;border-color:var(--navy);box-shadow:0 0 0 3px var(--navy-50)}
input.input--sm{width:auto;min-width:160px;height:30px;font-size:var(--fs-caption)}
.rolechk{display:inline-flex;align-items:center;gap:4px;font-size:var(--fs-caption)}

/* Login — full screen, no sidebar */
.auth{min-height:100vh;display:grid;place-items:center;padding:var(--sp-5);background:var(--surface)}
.auth__card{width:100%;max-width:400px;text-align:center}
.auth__card>*+*{margin-top:var(--sp-4)}
.brand{display:inline-flex;align-items:center;gap:var(--sp-2);font-weight:600;letter-spacing:-.01em}
.brand--lg{font-size:var(--fs-h2)}
`
