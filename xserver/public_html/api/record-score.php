<?php
declare(strict_types=1);

// Computer Typing Arena: same-origin PHP endpoint for append-only score records on XServer.
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function respond(int $statusCode, array $body): void {
    http_response_code($statusCode);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function integerValue(array $payload, string $key, int $minimum, int $maximum): ?int {
    $value = $payload[$key] ?? null;
    if (!is_int($value) || $value < $minimum || $value > $maximum) {
        return null;
    }
    return $value;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    respond(405, ['ok' => false, 'message' => 'POSTメソッドのみ利用できます。']);
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host = $_SERVER['HTTP_HOST'] ?? '';
if ($origin !== '') {
    $originHost = parse_url($origin, PHP_URL_HOST);
    $requestHost = preg_replace('/:\d+$/', '', $host);
    if (!is_string($originHost) || !is_string($requestHost) || !hash_equals(strtolower($requestHost), strtolower($originHost))) {
        respond(403, ['ok' => false, 'message' => '許可されていない送信元です。']);
    }
}

$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
if (stripos($contentType, 'application/json') !== 0) {
    respond(415, ['ok' => false, 'message' => 'JSON形式で送信してください。']);
}

$rawPayload = file_get_contents('php://input', false, null, 0, 4096);
if ($rawPayload === false) {
    respond(400, ['ok' => false, 'message' => 'リクエストを読み取れませんでした。']);
}

$payload = json_decode($rawPayload, true);
if (!is_array($payload) || json_last_error() !== JSON_ERROR_NONE) {
    respond(400, ['ok' => false, 'message' => 'JSON形式が正しくありません。']);
}

$nickname = trim((string)($payload['nickname'] ?? ''));
if (preg_match('/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,23}$/u', $nickname) !== 1) {
    respond(422, ['ok' => false, 'message' => 'ニックネームの形式が正しくありません。']);
}

$score = integerValue($payload, 'score', 0, 10000000);
$wpm = integerValue($payload, 'wpm', 0, 10000);
$accuracy = integerValue($payload, 'accuracy', 0, 100);
$completed = integerValue($payload, 'completed', 0, 100000);
$bestStreak = integerValue($payload, 'bestStreak', 0, 100000);
$duration = integerValue($payload, 'duration', 10, 600);
if ($score === null || $wpm === null || $accuracy === null || $completed === null || $bestStreak === null || $duration === null) {
    respond(422, ['ok' => false, 'message' => '記録値の形式が正しくありません。']);
}

$privateDirectory = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'private';
$csvPath = $privateDirectory . DIRECTORY_SEPARATOR . 'scores.csv';
if (!is_dir($privateDirectory) || !is_writable($privateDirectory)) {
    respond(500, ['ok' => false, 'message' => '記録領域に書き込めません。XServerの権限設定を確認してください。']);
}

$clientIp = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$rateLimitPath = $privateDirectory . DIRECTORY_SEPARATOR . '.rate_' . hash('sha256', $clientIp);
if (is_file($rateLimitPath) && (time() - filemtime($rateLimitPath)) < 1) {
    respond(429, ['ok' => false, 'message' => '送信間隔を空けてください。']);
}

$handle = fopen($csvPath, 'c+b');
if ($handle === false) {
    respond(500, ['ok' => false, 'message' => '記録ファイルを開けません。']);
}

if (!flock($handle, LOCK_EX)) {
    fclose($handle);
    respond(503, ['ok' => false, 'message' => '記録処理が混み合っています。']);
}

try {
    $metadata = fstat($handle);
    if (($metadata['size'] ?? 0) === 0) {
        fwrite($handle, "\xEF\xBB\xBF");
        fputcsv($handle, ['recorded_at_jst', 'nickname', 'score', 'wpm', 'accuracy_percent', 'completed_terms', 'best_streak', 'duration_seconds']);
    }

    fseek($handle, 0, SEEK_END);
    $timestamp = (new DateTimeImmutable('now', new DateTimeZone('Asia/Tokyo')))->format('Y-m-d H:i:sP');
    fputcsv($handle, [$timestamp, $nickname, $score, $wpm, $accuracy, $completed, $bestStreak, $duration]);
    fflush($handle);
    touch($rateLimitPath);
    @chmod($rateLimitPath, 0600);
} finally {
    flock($handle, LOCK_UN);
    fclose($handle);
}

respond(201, ['ok' => true, 'message' => '結果を記録しました。']);
