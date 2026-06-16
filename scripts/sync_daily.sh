#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p logs
/usr/bin/python3 scripts/sync_feishu_sheet.py >> logs/sync.log 2>> logs/sync.err.log
