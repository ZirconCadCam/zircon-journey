#!/usr/bin/env bash
# Fails the build if any TS2304 (Cannot find name) errors exist.
# Useful as a pre-commit / CI guard against missing components or imports.
set -euo pipefail

OUTPUT=$(npx tsc --noEmit --pretty false 2>&1 || true)
if echo "$OUTPUT" | grep -E "error TS2304" >/dev/null; then
  echo "❌ Found TS2304 (missing identifier) errors — fix these before merging:"
  echo "$OUTPUT" | grep -E "error TS2304"
  exit 1
fi

echo "✅ No TS2304 errors."
