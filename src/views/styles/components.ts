// Components — buttons, cards, tables, forms, badges, header, auth shell.
export const COMPONENTS = `
.btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--sp-2);
  height:40px;padding:0 var(--sp-4);border:1px solid transparent;border-radius:var(--r-md);
  font:inherit;font-weight:500;cursor:pointer;background:var(--raised);color:var(--ink);
  border-color:var(--border-strong);transition:background .12s,border-color .12s}
.btn:hover{border-color:var(--ink-dim);text-decoration:none}
.btn--primary{background:var(--navy);color:#fff;border-color:var(--navy)}
.btn--primary:hover{background:var(--navy-600);border-color:var(--navy-600)}
.btn--ghost{background:transparent;border-color:var(--border)}
.btn--danger{color:var(--danger);border-color:var(--border-strong)}
.btn--sm{height:32px;padding:0 var(--sp-3);font-size:13px}
.btn--lg{height:48px;padding:0 var(--sp-5);font-size:15px}
.btn--block{width:100%}
.card{background:var(--raised);border:1px solid var(--border);border-radius:var(--r-lg);
  padding:var(--sp-5);box-shadow:var(--shadow)}
.field{display:block}
.field>span{display:block;font-size:13px;font-weight:500;margin-bottom:var(--sp-1)}
input,select{width:100%;height:40px;padding:0 var(--sp-3);border:1px solid var(--border-strong);
  border-radius:var(--r-md);font:inherit;background:var(--raised);color:var(--ink)}
input:focus,select:focus{outline:none;border-color:var(--navy);box-shadow:0 0 0 3px var(--navy-50)}
.table{width:100%;border-collapse:collapse;font-size:13px}
.table th{text-align:left;color:var(--ink-soft);font-weight:500;padding:var(--sp-2) var(--sp-3);
  border-bottom:1px solid var(--border)}
.table td{padding:var(--sp-3);border-bottom:1px solid var(--border)}
.table tr:last-child td{border-bottom:0}
.badge{display:inline-flex;align-items:center;padding:2px var(--sp-2);border-radius:var(--r-pill);
  font-size:12px;font-weight:500;background:var(--navy-50);color:var(--navy)}
.badge--ok{background:var(--ok-bg);color:var(--ok)}
.alert{padding:var(--sp-3) var(--sp-4);border-radius:var(--r-md);font-size:13px}
.alert--danger{background:var(--danger-bg);color:var(--danger)}
.topbar{display:flex;align-items:center;justify-content:space-between;height:56px;
  padding:0 var(--sp-5);background:var(--raised);border-bottom:1px solid var(--border)}
.brand{display:flex;align-items:center;gap:var(--sp-2);font-weight:600;letter-spacing:-.01em}
.brand--lg{font-size:20px}
.auth{min-height:100vh;display:grid;place-items:center;padding:var(--sp-5)}
.auth__card{width:100%;max-width:380px;text-align:center}
.auth__card>*+*{margin-top:var(--sp-4)}
`
