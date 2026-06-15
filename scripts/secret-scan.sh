#!/usr/bin/env bash
# Fail CI if a live credential is committed to source. (.dev.vars is gitignored.)
set -euo pipefail

PATTERN='sk_live_[A-Za-z0-9]|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|password[[:space:]]*[:=][[:space:]]*['\''"][^'\''"]{8,}'

if grep -rInE "$PATTERN" src config db scripts 2>/dev/null; then
  echo "✗ secret-scan: a credential-like string was found in source"
  exit 1
fi
echo "✓ secret-scan clean"
