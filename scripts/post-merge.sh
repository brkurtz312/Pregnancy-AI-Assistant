#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

bash scripts/sync-to-github.sh || echo "[sync-to-github] Sync failed but post-merge continues."
