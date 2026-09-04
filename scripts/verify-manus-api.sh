#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${MANUS_TEST_PORT:-4010}"
LOG_FILE="$(mktemp)"
HOME_BODY="$(mktemp)"
INVALID_BODY="$(mktemp)"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -f "$LOG_FILE" "$HOME_BODY" "$INVALID_BODY"
}
trap cleanup EXIT

cd "$ROOT_DIR"
NODE_ENV=production PORT="$PORT" node dist/index.js >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

for _ in {1..20}; do
  if curl -fsS "http://127.0.0.1:${PORT}/" -o "$HOME_BODY"; then
    break
  fi
  sleep 0.25
done

grep -q '<div id="root"></div>' "$HOME_BODY"

status="$(curl -sS -o "$INVALID_BODY" -w '%{http_code}' -X POST "http://127.0.0.1:${PORT}/api/record-score" -H 'Content-Type: application/json' --data '{}')"
if [[ "$status" != "422" ]]; then
  echo "FAIL: invalid score request returned HTTP $status" >&2
  cat "$INVALID_BODY" >&2
  cat "$LOG_FILE" >&2
  exit 1
fi

grep -q '正しくありません' "$INVALID_BODY"
echo "PASS: Manus production server serves the SPA and rejects malformed scores without inserting data."
