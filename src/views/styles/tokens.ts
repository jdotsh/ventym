// Design tokens — the single source of visual truth (spec: docs/design-system.md).
// Compose these; never hardcode a hex/px in a component. Brand: navy authority +
// warm stone, with amber as the "human must act" accent. Calm, restrained, audit-grade.
export const TOKENS = `:root{
  /* Brand — navy authority + amber accent */
  --navy:#1e3a8a; --navy-600:#1d4ed8; --navy-bright:#3c56ab; --navy-50:#eef2ff;
  --amber:#f59e0b; --amber-soft:#fff8e1;
  /* Warm stone neutrals */
  --ink:#1c1917; --ink-soft:#57534e; --ink-dim:#78716c;
  --surface:#fafaf9; --raised:#fff; --border:#e7e5e4; --border-strong:#d6d3d1;
  /* Semantic — status only, never brand */
  --ok:#15803d; --ok-bg:#f0fdf4; --warn:#b45309; --warn-bg:#fffbeb;
  --danger:#b91c1c; --danger-bg:#fef2f2; --info:#1d4ed8;
  /* Type ladder — LOCKED; never invent an intermediate size */
  --fs-caption:12px; --fs-body:14px; --fs-lead:16px; --fs-h3:20px; --fs-h2:26px; --fs-h1:32px; --fs-display:44px;
  --lh-tight:1.2; --lh-body:1.55;
  /* Radii · spacing · shadow */
  --r-sm:6px; --r-md:10px; --r-lg:16px; --r-pill:999px;
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:24px; --sp-6:32px; --sp-7:48px;
  --font:'Inter',system-ui,-apple-system,sans-serif;
  --mono:'JetBrains Mono',ui-monospace,monospace;
  --shadow:0 1px 2px rgba(28,25,23,.04),0 4px 16px rgba(28,25,23,.05);
}`
