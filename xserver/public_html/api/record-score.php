<?php
declare(strict_types=1);

// Computer Typing Arena: append-only, mode-separated score records for XServer.
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
    return is_int($value) && $value >= $minimum && $value <= $maximum ? $value : null;
}

function calculateScoreRanking($handle, int $currentScore, string $mode): array {
    rewind($handle);
    $rank = 1;
    $totalRecords = 0;
    $isFirstRow = true;
    while (($row = fgetcsv($handle)) !== false) {
        if ($isFirstRow) {
            $isFirstRow = false;
            continue;
        }
        if (!isset($row[8], $row[2]) || $row[8] !== $mode || !is_numeric($row[2])) {
            continue;
        }
        $totalRecords++;
        if ((int)$row[2] > $currentScore) {
            $rank++;
        }
    }
    return ['rank' => $rank, 'totalRecords' => $totalRecords];
}

function findRecordByPlayId($handle, string $playId): ?array {
    rewind($handle);
    $isFirstRow = true;
    while (($row = fgetcsv($handle)) !== false) {
        if ($isFirstRow) {
            $isFirstRow = false;
            continue;
        }
        if (!isset($row[9], $row[8], $row[2]) || !is_numeric($row[2])) {
            continue;
        }
        if (hash_equals((string)$row[9], $playId)) {
            return ['score' => (int)$row[2], 'mode' => (string)$row[8]];
        }
    }
    return null;
}

function ensureCsvSchema($handle): void {
    $header = ['recorded_at_jst', 'nickname', 'score', 'wpm', 'accuracy_percent', 'completed_terms', 'best_streak', 'duration_seconds', 'mode', 'play_id'];
    rewind($handle);
    $currentHeader = fgetcsv($handle);
    if ($currentHeader === false) {
        rewind($handle);
        fwrite($handle, "\xEF\xBB\xBF");
        fputcsv($handle, $header);
        fflush($handle);
        return;
    }
    $normalizedHeader = array_map(static fn($value) => ltrim((string)$value, "\xEF\xBB\xBF"), $currentHeader);
    if ($normalizedHeader === $header) {
        return;
    }
    $legacyRows = [];
    while (($row = fgetcsv($handle)) !== false) {
        $legacyRows[] = $row;
    }
    rewind($handle);
    ftruncate($handle, 0);
    fwrite($handle, "\xEF\xBB\xBF");
    fputcsv($handle, $header);
    foreach ($legacyRows as $row) {
        $legacy = array_pad($row, 9, '');
        fputcsv($handle, [$legacy[0], $legacy[1], $legacy[2], $legacy[3], $legacy[4], $legacy[5], $legacy[6], $legacy[7], 'hard', $legacy[8]]);
    }
    fflush($handle);
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
$payload = $rawPayload === false ? null : json_decode($rawPayload, true);
if (!is_array($payload) || json_last_error() !== JSON_ERROR_NONE) {
    respond(400, ['ok' => false, 'message' => 'JSON形式が正しくありません。']);
}

$nickname = trim((string)($payload['nickname'] ?? ''));
$playId = (string)($payload['playId'] ?? '');
$mode = (string)($payload['mode'] ?? '');
if (preg_match('/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,23}$/u', $nickname) !== 1) {
    respond(422, ['ok' => false, 'message' => 'ニックネームの形式が正しくありません。']);
}
if (preg_match('/^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/', $playId) !== 1) {
    respond(422, ['ok' => false, 'message' => 'プレイ識別子の形式が正しくありません。']);
}
if ($mode !== 'basic' && $mode !== 'hard') {
    respond(422, ['ok' => false, 'message' => 'ゲームモードの形式が正しくありません。']);
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
$handle = fopen($csvPath, 'c+b');
if ($handle === false || !flock($handle, LOCK_EX)) {
    if ($handle !== false) fclose($handle);
    respond(503, ['ok' => false, 'message' => '記録処理が混み合っています。']);
}

$rateLimited = false;
$wasDuplicate = false;
try {
    ensureCsvSchema($handle);
    $existingRecord = findRecordByPlayId($handle, $playId);
    if ($existingRecord !== null) {
        $ranking = calculateScoreRanking($handle, $existingRecord['score'], $existingRecord['mode']);
        $wasDuplicate = true;
    } else {
        $lastSubmission = is_file($rateLimitPath) ? filemtime($rateLimitPath) : false;
        if ($lastSubmission !== false && (time() - $lastSubmission) < 1) {
            $rateLimited = true;
        } else {
            fseek($handle, 0, SEEK_END);
            $timestamp = (new DateTimeImmutable('now', new DateTimeZone('Asia/Tokyo')))->format('Y-m-d H:i:sP');
            fputcsv($handle, [$timestamp, $nickname, $score, $wpm, $accuracy, $completed, $bestStreak, $duration, $mode, $playId]);
            fflush($handle);
            $ranking = calculateScoreRanking($handle, $score, $mode);
            touch($rateLimitPath);
            @chmod($rateLimitPath, 0600);
        }
    }
} finally {
    flock($handle, LOCK_UN);
    fclose($handle);
}

if ($rateLimited) {
    respond(429, ['ok' => false, 'message' => '送信間隔を空けてください。']);
}

respond($wasDuplicate ? 200 : 201, [
    'ok' => true,
    'message' => '結果を記録しました。',
    'rank' => $ranking['rank'],
    'totalRecords' => $ranking['totalRecords'],
    'duplicate' => $wasDuplicate,
]);
