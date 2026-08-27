#!/usr/bin/env bash
# XServer deployment validation: mirror public_html and private as sibling directories, then exercise the PHP API over HTTP.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_ROOT="$PROJECT_ROOT/xserver"
STAGE_ROOT="$(mktemp -d)"
PORT="18765"
BASE_URL="http://127.0.0.1:${PORT}"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$STAGE_ROOT"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_equals() {
  [[ "$1" == "$2" ]] || fail "$3 (expected: $2, actual: $1)"
}

assert_contains() {
  grep -Fq "$2" "$1" || fail "$3 (missing: $2)"
}

post_json() {
  local ip="$1"
  local payload="$2"
  local output="$3"
  curl --silent --show-error --interface "$ip" --output "$output" --write-out '%{http_code}' \
    --request POST "$BASE_URL/api/record-score.php" \
    --header "Origin: $BASE_URL" \
    --header 'Content-Type: application/json' \
    --data "$payload"
}

mkdir -p "$STAGE_ROOT/public_html/api" "$STAGE_ROOT/private"
cp "$SOURCE_ROOT/public_html/api/record-score.php" "$STAGE_ROOT/public_html/api/"
cp "$SOURCE_ROOT/public_html/.htaccess" "$STAGE_ROOT/public_html/"
cp "$SOURCE_ROOT/private/.htaccess" "$STAGE_ROOT/private/"
cat > "$STAGE_ROOT/private/scores.csv" <<'CSV'
recorded_at_jst,nickname,score,wpm,accuracy_percent,completed_terms,best_streak,duration_seconds,play_id
2026-08-27 12:00:00+09:00,Legacy,700,50,95,10,5,60,legacy-player-0001
CSV
chmod 0705 "$STAGE_ROOT/private"
chmod 0600 "$STAGE_ROOT/private/scores.csv"
assert_contains "$STAGE_ROOT/public_html/.htaccess" 'RewriteEngine On' "SPAルーティングの有効化"
assert_contains "$STAGE_ROOT/public_html/.htaccess" 'RewriteRule ^ index.html [L]' "SPAの画面直アクセス用フォールバック"

php -l "$STAGE_ROOT/public_html/api/record-score.php" >/dev/null
php -S "127.0.0.1:${PORT}" -t "$STAGE_ROOT/public_html" >"$STAGE_ROOT/php-server.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do
  if curl --silent --output /dev/null "$BASE_URL/api/record-score.php"; then
    break
  fi
  sleep 0.1
done

status="$(post_json '127.0.0.1' '{"nickname":"ゲスト","score":1000,"wpm":80,"accuracy":98,"completed":20,"bestStreak":9,"duration":60,"mode":"basic","playId":"basic-guest-0001"}' "$STAGE_ROOT/basic-guest.json")"
assert_equals "$status" "201" "匿名の基本モード初回記録"
assert_contains "$STAGE_ROOT/basic-guest.json" '"rank":1' "匿名の基本モード初回順位"
assert_contains "$STAGE_ROOT/basic-guest.json" '"totalRecords":1' "匿名の基本モード初回総数"
assert_contains "$STAGE_ROOT/private/scores.csv" 'mode,play_id' "旧CSVヘッダーのモード列移行"
assert_equals "$(awk -F, 'NR == 2 { print $9 }' "$STAGE_ROOT/private/scores.csv")" "hard" "旧CSVの既存行をハードモードへ移行"

status="$(post_json '127.0.0.1' '{"nickname":"RateTest","score":900,"wpm":60,"accuracy":96,"completed":18,"bestStreak":7,"duration":60,"mode":"basic","playId":"basic-rate-0001"}' "$STAGE_ROOT/rate-limit.json")"
assert_equals "$status" "201" "同一IPの連続した別プレイ記録"
assert_contains "$STAGE_ROOT/rate-limit.json" '"totalRecords":2' "同一IPの連続した別プレイ総数"

status="$(post_json '127.0.0.1' '{"nickname":"Mika","score":1200,"wpm":95,"accuracy":99,"completed":23,"bestStreak":12,"duration":60,"mode":"basic","playId":"basic-mika-0001"}' "$STAGE_ROOT/basic-mika.json")"
assert_equals "$status" "201" "高スコアの基本モード記録"
assert_contains "$STAGE_ROOT/basic-mika.json" '"rank":1' "高スコアの基本モード順位"
assert_contains "$STAGE_ROOT/basic-mika.json" '"totalRecords":3' "高スコアの基本モード総数"

status="$(post_json '127.0.0.2' '{"nickname":"Kai","score":1000,"wpm":82,"accuracy":97,"completed":21,"bestStreak":10,"duration":60,"mode":"basic","playId":"basic-kai-0001"}' "$STAGE_ROOT/basic-kai.json")"
assert_equals "$status" "201" "同点の基本モード記録"
assert_contains "$STAGE_ROOT/basic-kai.json" '"rank":2' "同点の基本モード順位"
assert_contains "$STAGE_ROOT/basic-kai.json" '"totalRecords":4' "同点の基本モード総数"

status="$(post_json '127.0.0.3' '{"nickname":"Hard","score":1000,"wpm":75,"accuracy":96,"completed":15,"bestStreak":8,"duration":60,"mode":"hard","playId":"hard-user-0001"}' "$STAGE_ROOT/hard-first.json")"
assert_equals "$status" "201" "ハードモード初回記録"
assert_contains "$STAGE_ROOT/hard-first.json" '"rank":1' "ハードモードの独立順位"
assert_contains "$STAGE_ROOT/hard-first.json" '"totalRecords":2' "ハードモードの旧CSVを含む総数"

status="$(post_json '127.0.0.1' '{"nickname":"ゲスト","score":1000,"wpm":80,"accuracy":98,"completed":20,"bestStreak":9,"duration":60,"mode":"basic","playId":"basic-guest-0001"}' "$STAGE_ROOT/duplicate.json")"
assert_equals "$status" "200" "同一プレイ識別子の再送"
assert_contains "$STAGE_ROOT/duplicate.json" '"duplicate":true' "二重記録防止フラグ"
assert_contains "$STAGE_ROOT/duplicate.json" '"rank":2' "再送時の既存順位"
assert_contains "$STAGE_ROOT/duplicate.json" '"totalRecords":4' "再送時に総数を増やさない"

status="$(post_json '127.0.0.4' '{"nickname":"bad,name","score":100,"wpm":10,"accuracy":90,"completed":1,"bestStreak":1,"duration":60,"mode":"basic","playId":"invalid-name-0001"}' "$STAGE_ROOT/invalid-nickname.json")"
assert_equals "$status" "422" "不正ニックネームの拒否"

status="$(curl --silent --show-error --output "$STAGE_ROOT/foreign-origin.json" --write-out '%{http_code}' --request POST "$BASE_URL/api/record-score.php" --header 'Origin: https://untrusted.example' --header 'Content-Type: application/json' --data '{"nickname":"Origin","score":100,"wpm":10,"accuracy":90,"completed":1,"bestStreak":1,"duration":60,"mode":"basic","playId":"foreign-origin-0001"}')"
assert_equals "$status" "403" "異なるオリジンの拒否"

parallel_pids=()
for number in $(seq 20 27); do
  (
    post_json '127.0.0.6' "{\"nickname\":\"P${number}\",\"score\":$((500 + number)),\"wpm\":50,\"accuracy\":95,\"completed\":10,\"bestStreak\":4,\"duration\":60,\"mode\":\"basic\",\"playId\":\"parallel-${number}-0001\"}" "$STAGE_ROOT/parallel-${number}.json" > "$STAGE_ROOT/parallel-${number}.status"
  ) &
  parallel_pids+=("$!")
done
for pid in "${parallel_pids[@]}"; do
  wait "$pid"
done

for number in $(seq 20 27); do
  status="$(cat "$STAGE_ROOT/parallel-${number}.status")"
  assert_equals "$status" "201" "異なる利用者からの同時記録 ${number}"
done

for number in $(seq 40 69); do
  status="$(post_json '127.0.0.5' "{\"nickname\":\"Burst${number}\",\"score\":$number,\"wpm\":40,\"accuracy\":94,\"completed\":8,\"bestStreak\":3,\"duration\":60,\"mode\":\"basic\",\"playId\":\"burst-${number}-0001\"}" "$STAGE_ROOT/burst-${number}.json")"
  assert_equals "$status" "201" "同一IPの短時間バースト記録 ${number}"
done

status="$(post_json '127.0.0.5' '{"nickname":"BurstLimit","score":1,"wpm":1,"accuracy":1,"completed":1,"bestStreak":1,"duration":60,"mode":"basic","playId":"burst-limit-0001"}' "$STAGE_ROOT/burst-limit.json")"
assert_equals "$status" "429" "同一IPのバースト上限"
assert_contains "$STAGE_ROOT/burst-limit.json" '短時間に送信が集中しています。' "バースト上限メッセージ"

data_rows="$(tail -n +2 "$STAGE_ROOT/private/scores.csv" | wc -l | tr -d ' ')"
basic_rows="$(awk -F, 'NR > 1 && $9 == "basic" { count++ } END { print count + 0 }' "$STAGE_ROOT/private/scores.csv")"
hard_rows="$(awk -F, 'NR > 1 && $9 == "hard" { count++ } END { print count + 0 }' "$STAGE_ROOT/private/scores.csv")"
assert_equals "$data_rows" "44" "CSVの記録行数"
assert_equals "$basic_rows" "42" "基本モードの記録行数"
assert_equals "$hard_rows" "2" "ハードモードの記録行数"
assert_equals "$(stat -c '%a' "$STAGE_ROOT/private")" "705" "privateディレクトリの権限"
assert_equals "$(stat -c '%a' "$STAGE_ROOT/private/scores.csv")" "600" "CSVファイルの権限"

printf 'PASS: XServer想定のPHP API、CSV記録、モード別ランキング、再送防止、同時書き込み、入力・送信元検証を確認しました。\n'
