#!/usr/bin/env bash
# Sync local reports to the Vercel-deployed dashboard via the /api/reports/sync endpoint.
#
# Usage:
#   ./scripts/sync-reports.sh                    # sync latest report
#   ./scripts/sync-reports.sh 2026-03-07         # sync specific date
#   ./scripts/sync-reports.sh all                # sync all reports
#
# Environment:
#   CYBERSPACE_URL   — dashboard URL (default: https://www.cyberspace.team)
#   CYBERSPACE_TOKEN — auth token (required)

set -euo pipefail

URL="${CYBERSPACE_URL:-https://www.cyberspace.team}"
TOKEN="${CYBERSPACE_TOKEN:-}"
REPORTS_DIR="$(cd "$(dirname "$0")/.." && pwd)/reports"

if [ -z "$TOKEN" ]; then
  echo "Error: CYBERSPACE_TOKEN is not set" >&2
  exit 1
fi

sync_date() {
  local date="$1"
  local dir="$REPORTS_DIR/$date"

  if [ ! -d "$dir" ]; then
    echo "No report directory for $date" >&2
    return 1
  fi

  # Build JSON payload: { "date": "...", "files": { "filename": "content", ... } }
  local files="{}"
  for f in "$dir"/*; do
    [ -f "$f" ] || continue
    local name
    name=$(basename "$f")
    local content
    content=$(cat "$f")
    files=$(printf '%s' "$files" | python3 -c "
import sys, json
d = json.load(sys.stdin)
d[$(printf '%s' "$name" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")] = $(printf '%s' "$content" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
json.dump(d, sys.stdout)
")
  done

  local payload
  payload=$(python3 -c "
import json
print(json.dumps({'date': '$date', 'files': $files}))
")

  echo "Syncing $date..."
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST "$URL/api/reports/sync" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload")

  if [ "$status" = "200" ]; then
    echo "  ✓ $date synced"
  else
    echo "  ✗ $date failed (HTTP $status)" >&2
  fi
}

case "${1:-latest}" in
  all)
    for dir in "$REPORTS_DIR"/20*; do
      [ -d "$dir" ] && sync_date "$(basename "$dir")"
    done
    ;;
  latest)
    latest=$(ls -1d "$REPORTS_DIR"/20* 2>/dev/null | sort | tail -1)
    if [ -z "$latest" ]; then
      echo "No reports found" >&2
      exit 1
    fi
    sync_date "$(basename "$latest")"
    ;;
  *)
    sync_date "$1"
    ;;
esac
