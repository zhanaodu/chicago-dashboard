#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LARK_CLI="${LARK_CLI:-/Users/mac/Library/Application Support/YarboChicagoDashboard/.tools/lark-cli/lark-cli}"
export LARK_CLI
exec /usr/bin/python3 "$ROOT/scripts/publish_daily.py"
