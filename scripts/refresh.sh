#!/usr/bin/env bash
# Rebuild the snapshot and publish it to the gh-pages branch.
# Usage: GH_TOKEN=<token> ./scripts/refresh.sh
set -euo pipefail
cd "$(dirname "$0")/.."
REMOTE="${REMOTE:-https://x-access-token:${GH_TOKEN:?set GH_TOKEN}@github.com/ciperx/taskmarket-market-pulse.git}"
node scripts/build.mjs
TMP="$(mktemp -d)"; cp -r public/. "$TMP"/
cd "$TMP"
git init -q -b gh-pages
git -c user.name=agentskills -c user.email=agentskills@users.noreply.github.com add -A
git -c user.name=agentskills -c user.email=agentskills@users.noreply.github.com commit -qm "deploy: snapshot $(date -u +%FT%TZ)"
git push -qf "$REMOTE" gh-pages
echo "published $(date -u +%FT%TZ)"
