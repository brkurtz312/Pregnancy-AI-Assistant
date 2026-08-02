#!/bin/bash
# eas-prebuild.sh
#
# Wrapper used as eas.json `prebuildCommand` on every build profile.
# EAS replaces `expo prebuild` with this script and appends:
#   --platform <ios|android> --non-interactive
# as positional arguments (available here via "$@").
#
# The script:
#   1. Runs both Watch validation checks — exits 1 on failure, aborting the build.
#   2. Delegates to `expo prebuild "$@"` so the normal Expo native code
#      generation step proceeds unchanged.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  EAS pre-build validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "▶ Step 1/2 — provisioning configuration"
node "${SCRIPT_DIR}/validate-eas-provisioning.js"

echo ""
echo "▶ Step 2/2 — Watch icon format"
node "${SCRIPT_DIR}/validate-watch-icon-format.js"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Validation passed — handing off to expo prebuild"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exec npx expo prebuild "$@"
