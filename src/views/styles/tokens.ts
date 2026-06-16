// Design tokens — Athena's institutional palette, exact values (OKLCH for perceptual
// uniformity). Cool-slate canvas (hue 264) + navy #1e3a8a + amber-as-signal, JetBrains
// Mono for every identifier/number. Bloomberg/Stripe register. Spec: docs/design-system.md.
export const TOKENS = `:root{
  /* Brand — navy + amber accent */
  --navy:oklch(33.4% 0.151 264); --navy-600:oklch(48% 0.156 264); --navy-bright:oklch(48% 0.156 264);
  --navy-50:oklch(95.5% 0.018 264);
  --amber:oklch(76.7% 0.158 71); --amber-signal:oklch(70% 0.180 72); --amber-soft:oklch(98.4% 0.022 100);
  /* Cool-slate surface + ink ladder */
  --surface:oklch(98.6% 0.003 264); --raised:oklch(99.5% 0.002 264); --surface-warm:oklch(97.5% 0.005 264);
  --border:oklch(91% 0.004 264); --border-strong:oklch(85% 0.006 264);
  --ink:oklch(15.4% 0.004 264); --ink-soft:oklch(38.6% 0.006 264); --ink-dim:oklch(51.6% 0.006 264);
  /* 5-state status palette — settled/waiting/breach/live/neutral */
  --ok:oklch(50.5% 0.143 142); --ok-bg:oklch(97.5% 0.024 145);
  --warn:oklch(60% 0.180 75); --warn-bg:oklch(97% 0.040 80);
  --danger:oklch(50% 0.182 26); --danger-bg:oklch(97.4% 0.013 17);
  --info:oklch(48% 0.140 240);
  /* Type — Inter + JetBrains Mono; 6-step scale, body 13px, H1 capped 22px */
  --fs-caption:.6875rem; --fs-body:.8125rem; --fs-lead:.9375rem; --fs-h3:1rem; --fs-h2:1.125rem; --fs-h1:1.375rem; --fs-display:1.75rem;
  --lh-tight:1.15; --lh-body:1.55;
  /* Space · radius · elevation (institutional = flat) */
  --r-sm:6px; --r-md:10px; --r-lg:16px; --r-pill:999px;
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:24px; --sp-6:32px; --sp-7:40px;
  --font:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  --mono:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;
  --shadow:0 1px 2px rgba(0,0,0,.06);
}`
