#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LARK_CLI="${LARK_CLI:-/Users/mac/Library/Application Support/YarboChicagoDashboard/.tools/lark-cli/lark-cli}"
GIT_BIN="${GIT_BIN:-/usr/bin/git}"

export LARK_CLI

cd "$ROOT"
mkdir -p logs

"$GIT_BIN" pull --ff-only origin main
/usr/bin/python3 scripts/sync_feishu_sheet.py

if "$GIT_BIN" diff --quiet -- assets/data.json; then
  echo "No dashboard data changes to publish."
  exit 0
fi

"$GIT_BIN" add assets/data.json
"$GIT_BIN" commit -m "Update dashboard data $(/bin/date '+%Y-%m-%d')"
"$GIT_BIN" push origin main
