#!/bin/bash

if [ -z "" ]; then
  echo "[sync-to-github] Skipping: GITHUB_TOKEN is not set"
  exit 0
fi

if [ -z "" ]; then
  echo "[sync-to-github] Skipping: GITHUB_REPO is not set"
  exit 0
fi

CURRENT_BRANCH=
if [ "" != "main" ]; then
  echo "[sync-to-github] Skipping: current branch is '', not 'main'"
  exit 0
fi

CLEAN_REPO=
REPO_URL="https://x-access-token:@"

echo "[sync-to-github] Pushing to GitHub..."
if git push "" main:main --force 2>&1 | sed "s|x-access-token:[^@]*@|x-access-token:***@|g"; then
  echo "[sync-to-github] Done. GitHub is up to date."
else
  echo "[sync-to-github] WARNING: Push to GitHub failed (exit 0). The Replit repo is unchanged." >&2
  exit 1
fi
