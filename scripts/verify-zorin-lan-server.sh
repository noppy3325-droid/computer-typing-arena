#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${ZORIN_TEST_PORT:-4012}"
BASE_URL="http://127.0.0.1:${PORT}"
TMP_DIR="$(mktemp -d)"
LOG_FILE="$TMP_DIR/server.log"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [[ ! -f "$ROOT_DIR/dist/index.js" ]]; then
  echo "FAIL: dist/index.js がありません。先に pnpm build を実行してください。" >&2
  exit 1
fi

if [[ ! -s "$ROOT_DIR/dist/public/manus-storage/signal-lab-chamber-bg_6910abaf.png" ]]; then
  echo "FAIL: LAN用画像がありません。先に pnpm run build:lan を実行してください。" >&2
  exit 1
fi

cd "$ROOT_DIR"
DATABASE_URL='' RANKING_STORE_PATH="$TMP_DIR/typing-arena-scores.json" NODE_ENV=production HOST=0.0.0.0 PORT="$PORT" node dist/index.js >"$LOG_FILE" 2>&1 &
SERVER_PID=$!

for _ in {1..40}; do
  if curl -fsS "$BASE_URL/" -o "$TMP_DIR/home.html"; then
    break
  fi
  sleep 0.25
done

grep -q '<div id="root"></div>' "$TMP_DIR/home.html"
curl -fsS "$BASE_URL/manus-storage/signal-lab-chamber-bg_6910abaf.png" -o "$TMP_DIR/chamber.png"
test -s "$TMP_DIR/chamber.png"

post_score() {
  local play_id="$1"
  local mode="$2"
  local score="$3"
  local output="$4"
  curl -sS -o "$output" -w '%{http_code}' -X POST "$BASE_URL/api/record-score" \
    -H "Content-Type: application/json" \
    -H "Origin: $BASE_URL" \
    --data "{\"playId\":\"$play_id\",\"mode\":\"$mode\",\"nickname\":\"LANテスト\",\"score\":$score,\"wpm\":30,\"accuracy\":100,\"completed\":5,\"bestStreak\":5,\"duration\":30}"
}

assert_status() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL: $label は HTTP $expected の想定でしたが、$actual でした。" >&2
    cat "$TMP_DIR/server.log" >&2
    exit 1
  fi
}

status="$(post_score lan_basic_001 basic 100 "$TMP_DIR/basic-1.json")"
assert_status "$status" 201 "基本モードの初回記録"
grep -q '"rank":1,"totalRecords":1' "$TMP_DIR/basic-1.json"

status="$(post_score lan_basic_002 basic 200 "$TMP_DIR/basic-2.json")"
assert_status "$status" 201 "基本モードの高得点記録"
grep -q '"rank":1,"totalRecords":2' "$TMP_DIR/basic-2.json"

status="$(post_score lan_hard_001 hard 999 "$TMP_DIR/hard-1.json")"
assert_status "$status" 201 "ハードモードの初回記録"
grep -q '"rank":1,"totalRecords":1' "$TMP_DIR/hard-1.json"

status="$(post_score lan_basic_001 basic 100 "$TMP_DIR/duplicate.json")"
assert_status "$status" 200 "同一プレイIDの再送"
grep -q '"duplicate":true' "$TMP_DIR/duplicate.json"
grep -q '"rank":2,"totalRecords":2' "$TMP_DIR/duplicate.json"

parallel_pids=()
for number in 1 2 3 4 5; do
  post_score "lan_parallel_00${number}" basic 50 "$TMP_DIR/parallel-${number}.json" >"$TMP_DIR/parallel-${number}.status" &
  parallel_pids+=("$!")
done
for pid in "${parallel_pids[@]}"; do
  wait "$pid"
done
for number in 1 2 3 4 5; do
  assert_status "$(cat "$TMP_DIR/parallel-${number}.status")" 201 "並列クライアント${number}の記録"
done

status="$(post_score lan_basic_final basic 0 "$TMP_DIR/basic-final.json")"
assert_status "$status" 201 "並列記録後の基本モード順位"
grep -q '"rank":8,"totalRecords":8' "$TMP_DIR/basic-final.json"

foreign_status="$(curl -sS -o "$TMP_DIR/foreign.json" -w '%{http_code}' -X POST "$BASE_URL/api/record-score" -H 'Content-Type: application/json' -H 'Origin: http://192.168.1.99:3000' --data '{}')"
assert_status "$foreign_status" 403 "異なる送信元の拒否"

echo "PASS: Zorin OS向けLANサーバーでローカル記録、モード別順位、重複防止、同時記録、同一LANオリジン確認に成功しました。"
