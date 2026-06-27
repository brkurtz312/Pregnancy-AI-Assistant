#!/bin/bash

if [ -z "$GITHUB_TOKEN" ]; then
  echo "[sync-to-github] Skipping: GITHUB_TOKEN is not set"
  exit 0
fi

if [ -z "$GITHUB_REPO" ]; then
  echo "[sync-to-github] Skipping: GITHUB_REPO is not set"
  exit 0
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "[sync-to-github] Skipping: current branch is '$CURRENT_BRANCH', not 'main'"
  exit 0
fi

CLEAN_REPO=$(echo "$GITHUB_REPO" | sed 's|^[Hh][Tt][Tt][Pp][Ss]\?://||')
REPO_URL="https://x-access-token:${GITHUB_TOKEN}@${CLEAN_REPO}"

echo "[sync-to-github] Pushing to GitHub..."
if git push "$REPO_URL" main:main 2>&1 | sed "s|x-access-token:[^@]*@|x-access-token:***@|g"; then
  echo "[sync-to-github] Done. GitHub is up to date."
else
  echo "[sync-to-github] WARNING: Push to GitHub failed (exit $?). The Replit repo is unchanged." >&2
  exit 1
fi
