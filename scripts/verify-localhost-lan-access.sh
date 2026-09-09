#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
PORT="${TEST_PORT:-4013}"
STORE_DIR="$(mktemp -d)"
STORE_PATH="$STORE_DIR/scores.json"
SERVER_LOG="$STORE_DIR/server.log"
SERVER_PID=""
cleanup() {
  if [[ -n "$SERVER_PID" ]]; then kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; fi
  rm -rf "$STORE_DIR"
}
trap cleanup EXIT

NODE_ENV=production HOST=0.0.0.0 PORT="$PORT" DATABASE_URL='' RANKING_STORE_PATH="$STORE_PATH" node dist/index.js >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null; then break; fi
  sleep 0.2
done

server_ip="$(hostname -I | awk '{print $1}')"
if [[ -z "$server_ip" ]]; then echo "FAIL: LAN IPを取得できません" >&2; exit 1; fi

post_score() {
  local base="$1" play_id="$2" score="$3" output="$4"
  curl -fsS -o "$STORE_DIR/$output" -w '%{http_code}' \
    -H 'content-type: application/json' -H "origin: $base" \
    --data "{\"playId\":\"$play_id\",\"mode\":\"basic\",\"nickname\":\"LAN検証\",\"score\":$score,\"wpm\":55,\"accuracy\":98,\"completed\":20,\"bestStreak\":15,\"duration\":60}" \
    "$base/api/record-score"
}

localhost_base="http://127.0.0.1:$PORT"
lan_base="http://$server_ip:$PORT"
localhost_status="$(post_score "$localhost_base" localhost_lan_check_01 13000 first.json)"
lan_status="$(post_score "$lan_base" lan_localhost_check_02 12000 second.json)"
localhost_duplicate="$(post_score "$localhost_base" localhost_lan_check_01 13000 duplicate.json)"

python3 - "$STORE_PATH" "$STORE_DIR/first.json" "$STORE_DIR/second.json" "$STORE_DIR/duplicate.json" <<'PY'
import json
import sys
store_path, first_path, second_path, duplicate_path = sys.argv[1:]
first = json.load(open(first_path, encoding="utf-8"))
second = json.load(open(second_path, encoding="utf-8"))
duplicate = json.load(open(duplicate_path, encoding="utf-8"))
assert first["ok"] is True and first["rank"] == 1 and first["totalRecords"] == 1
assert second["ok"] is True and second["rank"] == 2 and second["totalRecords"] == 2
assert duplicate["ok"] is True and duplicate.get("duplicate") is True and duplicate["totalRecords"] == 2
scores = json.load(open(store_path, encoding="utf-8"))
assert len(scores) == 2
PY

[[ "$localhost_status" == 201 ]]
[[ "$lan_status" == 201 ]]
[[ "$localhost_duplicate" == 200 ]]
printf 'PASS: localhost=%s, LAN IP=%s, duplicate=%s, shared_records=2\n' "$localhost_status" "$lan_status" "$localhost_duplicate"
