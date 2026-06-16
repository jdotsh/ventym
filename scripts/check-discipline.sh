#!/usr/bin/env bash
# Discipline gate — the charter's "type & style law" rules that tsc/eslint don't
# enforce structurally. Fails CI on a violation. Cheap grep, runs in <1s.
set -uo pipefail
fail=0
flag() { echo "✗ $1"; printf '%s\n' "$2" | sed 's/^/    /'; fail=1; }

# 1. App code reads the validated AppConfig (parseConfig), never raw process.env.
hits=$(grep -rn "process\.env" src/ --include='*.ts' || true)
[ -n "$hits" ] && flag "process.env in src/ (use the validated AppConfig, not raw env):" "$hits"

# 2. All logging goes through the structured logger (trace + PII redaction).
hits=$(grep -rn "console\." src/ --include='*.ts' | grep -v "src/utils/logger.ts" || true)
[ -n "$hits" ] && flag "console.* outside utils/logger.ts (use the logger):" "$hits"

# 3. Vocabularies are string-literal unions + CHECK, never pgEnum (Athena scar).
hits=$(grep -rn "pgEnum" src/ db/ --include='*.ts' || true)
[ -n "$hits" ] && flag "pgEnum found (use varchar + CHECK + a Zod literal union):" "$hits"

# 4. No 'any' in source — use 'unknown' and narrow.
hits=$(grep -rnE ': any\b|as any\b|<any>' src/ config/ db/ --include='*.ts' | grep -v '\.test\.' || true)
[ -n "$hits" ] && flag "'any' in source (use 'unknown' and narrow):" "$hits"

if [ "$fail" -ne 0 ]; then echo "discipline gate FAILED"; exit 1; fi
echo "✓ discipline — process.env / console / pgEnum / any all clean"
