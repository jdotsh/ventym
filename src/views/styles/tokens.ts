// Design tokens — the single source of visual truth. Compose these, never
// hardcode a hex or px in a component.
export const TOKENS = `:root{
  --navy:#1e3a8a; --navy-600:#1d4ed8; --navy-50:#eef2ff;
  --ink:#1c1917; --ink-soft:#57534e; --ink-dim:#a8a29e;
  --surface:#fafaf9; --raised:#fff; --border:#e7e5e4; --border-strong:#d6d3d1;
  --ok:#15803d; --ok-bg:#f0fdf4; --warn:#b45309; --warn-bg:#fffbeb;
  --danger:#b91c1c; --danger-bg:#fef2f2; --info:#1d4ed8;
  --r-sm:6px; --r-md:10px; --r-lg:16px; --r-pill:999px;
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:24px; --sp-6:32px; --sp-7:48px;
  --font:'Inter',system-ui,-apple-system,sans-serif;
  --mono:'JetBrains Mono',ui-monospace,monospace;
  --shadow:0 1px 2px rgba(28,25,23,.04),0 4px 16px rgba(28,25,23,.05);
}`
