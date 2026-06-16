# Ventym — Tech-debt & deferral register

> Known, **deliberately deferred** work. Each item: why it's deferred, the risk if it
> stays open, and the explicit condition that closes it. Nothing here is a hidden gap —
> deferral is a recorded decision (the tier-1 bar: no surprise debt at review). Cross-ref
> rule numbers in `docs/RULES.md`.

Priority: **P1** = blocks first production / closes a moat or money-loop hole · **P2** =
hardening / observability · **P3** = breadth & polish.

| ID | Item | Why deferred | Risk if open | Closes when | Pri |
|----|------|--------------|--------------|-------------|-----|
| **TD-1** | **OTel exporter** (Block 7) — zero-dep OTLP/JSON → Grafana (logs+metrics+traces), no-op when unconfigured | observability depth not needed for localhost; SLI + structured logger cover the basics today | can't run a bank pilot blind — no p95/error-rate dashboards, no trace correlation across services | a `services/observability/otelExporter.ts` ships logs/metrics/traces via `waitUntil`, wired into requestTiming + logger, sampled per env (R-70) | **P2** |
| **TD-2** | **Real ERP dispatcher** (Queues-backed) + inbound reconcile | the dispatcher I built was reverted for being fake-tested (no real producer, fake-repo tests only) | the money loop (approve→post-to-ERP) posts to a **mock** — the core value prop is unproven | a Cloudflare-Queue consumer drains a real `PENDING` `erp_export` (producer = `bookTimesheet` enqueues), with a **real Postgres integration test**, bounded retry→DEAD, stale-reaper, + inbound `SES_POSTED` → BOOKED (R-38) | **P1** |
| **TD-3** | **Cloudflare primitives** — R2 (docs), Durable Objects (atomic rate-limit + notifications), Queues (TD-2) | not on the critical path for the first value-loop deploy | no real-time notifications; KV rate-limit is racy vs a DO; no document storage | each bound in `wrangler.toml` per env with its handler shape (enabling a queue binding without the consumer fails CF deploy) | **P2** |
| **TD-4** | **Idempotency body-fingerprint** — key-reuse-with-different-body → 422 | durable claim-first idempotency already ships; the fingerprint is a hardening | a client reusing an `Idempotency-Key` with a different body could replay the wrong cached response | a SHA-256 body fingerprint guard returns `IDEMPOTENCY_MISMATCH` (the code exists, unused); TTL set **below** the retry window (R-38) | **P2** |
| **TD-5** | **CSP per-request nonce** — report-only → enforce | views render server-side HTML with no inline scripts yet | weaker browser-side script-injection posture for a bank UI | `middleware/security` emits a per-request nonce, threads it into any inline `<script>`, report-only then flip (R-73) | **P2** |
| **TD-7** | **Live deployment** — `dev`/`int`/`prod` actually running | needs real Neon instances + Hyperdrive/KV ids + `wrangler secret put` (account resources, not code) | "works on localhost" ≠ "running"; production is unproven until one env is live + `/health/ready` smoke-green | a real Neon dev URL + secrets → `wrangler deploy --env dev` green (R-52/53). **Needs the operator.** | **P1** |
| **TD-8** | **Domain breadth** — milestones (fixed-price), rate cards, job codes, sites/stores, master SOWs, worker profiles, **BU-scope**, compliance/PSL, CFO spend/analytics | ventym is the value-loop spine (~17% of Athena's surface); breadth is post-first-customer | can't fully replace Athena until these ship; BU-scope + compliance are bank table-stakes | each as a vertical slice on the canonical pattern (ventym-backend skill) | **P3** |
| **TD-9** | **VENDOR role + vendor-scope** | current roles are ADMIN/MANAGER/MEMBER/AUDITOR; vendor *users* aren't modeled | a vendor user can't be data-isolated to their own vendor (sees the tenant) | a `VENDOR` role + a `vendor_id`-scoped read predicate (RLS-style) + SCIM/group mapping (R-16/19) | **P2** |
| **TD-10** | **WorkOS deeper integration** — finish SCIM membership sync, group→role mapping, org provisioning, optional Audit-Log streaming | login + feed-only identity work today; provisioning is enterprise Phase-2 | manual member/role setup; no SIEM export | group→role map + SCIM `user.*` → membership shell + Organizations-API provisioning (docs/workos-setup.md §6) | **P3** |
| **TD-11** | **Athena UI/UX design-language port** | ventym's UI is real but visually plainer than Athena's | weaker first-impression polish for a tier-1 demo | port Athena's tokens/component recipes into ventym's **modular** `views/styles/*` (not the frozen monolith), re-skin live pages (R-45/48) | **P3** |
| **TD-12** | **Branch protection on `main`** | solo repo, just pushed to GitHub | a force-push/delete of `main` with no second reviewer | GitHub ruleset enforced (needs a paid plan for private repos) | **P2** |

## How to close an item

Pick it up under the matching skill, ship it real + green + committed, and **delete its
row here** in the same change (the register only lists *open* debt). A closed item leaves
a commit, not a register entry.
