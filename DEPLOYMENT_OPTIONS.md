# Computer Typing Arena
## XServer版とManus公開版の運用・環境設定ガイド

このゲームは、同じフロントエンドを **XServer版** と **Manus公開版** の2通りで運用できます。違いは、プレイ結果を保存するバックエンドです。XServer版はPHP APIと非公開CSV、Manus版は同一プロジェクト内のExpress APIとMySQL互換データベースを使います。

> **推奨:** 文化祭の準備中はManus公開版で動作確認し、実際にXServerを使う場合は本番前にXServer版へ切り替えてください。両方の記録は別々に保存され、片方のランキングがもう片方へ自動で移行されることはありません。

---

## 1. 2つの公開方式の比較

| 項目 | XServer版 | Manus公開版 |
|---|---|---|
| 公開ファイル | `dist/public/` の中身 | Manusのチェックポイントから公開 |
| 結果送信先 | `/api/record-score.php` | `/api/record-score` |
| 保存先 | `private/scores.csv` | `typing_scores` データベーステーブル |
| 実行環境 | XServerのPHP 8系 | ManusのNode.js / Expressサーバー |
| フロントエンド | React静的ファイル | React静的ファイル＋Express API |
| 環境変数 | 通常は不要。PHPの保存先は配置で決まる | `DATABASE_URL` はManus側で提供・管理 |
| XServerへのFTP | 必要 | 不要 |
| CSVの直接バックアップ | `private/scores.csv` をバックアップ | Manusのデータベースを管理画面で管理 |
| ランキング | モード別、同点同順位 | モード別、同点同順位 |
| 二重送信防止 | `play_id` のCSV重複検出 | `play_id` の一意制約 |
| 使うURL | XServerの独自ドメイン | Manusの公開ドメインまたは設定済み独自ドメイン |

フロントエンドはまず `/api/record-score` を呼びます。Manus版ではそのAPIが成功します。XServer版では通常404になるため、自動的に `/api/record-score.php` を呼びます。このため、同じビルド成果物を両方の環境で利用できます。

---

## 2. Manus公開版の構成

Manus版では、Node.jsのExpressサーバーがReactの静的ファイルとランキングAPIを同じオリジンで提供します。

```text
Manusプロジェクト
├── Reactアプリ
│   ├── /                  # 開始画面
│   ├── /glossary          # 振り返り
│   └── /result            # 結果・ランキング
├── Express API
│   └── POST /api/record-score
└── MySQL互換DB
    └── typing_scores
```

Manusの公開版を使う場合、XServerの `record-score.php`、`.htaccess`、`private/scores.csv` は必要ありません。Manusの公開機能がNode.jsサーバーを起動し、データベース接続情報を環境へ渡します。`DATABASE_URL` をソースコードへ書いたり、`.env` をGitHubへ登録したりしないでください。[1]

データベースには、次の情報だけを保存します。

| 列 | 用途 |
|---|---|
| `play_id` | 同一プレイの再送を一意制約で拒否する。 |
| `nickname` | ニックネーム。空欄開始時はフロントエンドが `ゲスト` を送る。 |
| `score`、`wpm`、`accuracy_percent` | 結果と順位計算。 |
| `completed_terms`、`best_streak`、`duration_seconds` | 結果画面に表示・保存する計測値。 |
| `mode` | `basic` と `hard` を分ける。 |
| `recorded_at` | サーバー側の記録時刻。 |

本プロジェクトでは、Manusのデータベースへ `typing_scores` テーブルを作成済みです。別のプロジェクトへコピーする場合は、次のSQLをデータベースのマイグレーションとして適用してください。

```sql
CREATE TABLE typing_scores (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  play_id VARCHAR(80) NOT NULL,
  nickname VARCHAR(24) NOT NULL,
  score INT NOT NULL,
  wpm DECIMAL(10,2) NOT NULL,
  accuracy_percent DECIMAL(5,2) NOT NULL,
  completed_terms INT NOT NULL,
  best_streak INT NOT NULL,
  duration_seconds INT NOT NULL,
  mode ENUM('basic','hard') NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_typing_scores_play_id (play_id),
  KEY idx_typing_scores_mode_score (mode, score),
  KEY idx_typing_scores_mode (mode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 3. Manus公開版を使う手順

### 手順1: プロジェクトをチェックポイントへ保存する

Manus上でコードを変更した後は、チェックポイントを保存します。自動公開が有効なプロジェクトでは、チェックポイント保存が公開処理を兼ねます。公開後のURLはプロジェクトの公開画面で確認してください。

### 手順2: データベースを確認する

管理画面のデータベース接続が有効であることを確認します。`typing_scores` テーブルがないプロジェクトへ移植する場合は、先のSQLをマイグレーションとして適用します。SQLの本番データに対して、確認なしの `DROP TABLE` や全件削除を行わないでください。

### 手順3: 公開URLで記録を確認する

次の順にテストします。

1. 公開URLの開始画面を開き、ニックネームを空欄にして基本モードを短時間プレイする。
2. 振り返り画面から結果画面へ進み、「ゲスト」として記録が完了することを確認する。
3. ハードモードでも同じ確認を行う。
4. 結果画面を再読み込みし、同じ `play_id` で記録数が増えないことを確認する。
5. 異なるプレイをもう一度行い、同じモードの総記録数だけが1増えることを確認する。
6. `/glossary` と `/result` を直接開き、404にならないことを確認する。

Manus版でランキングDBが未設定の場合は、APIが503を返し、結果画面には記録失敗が表示されます。その場合はデータベース接続とテーブルを先に確認してください。

---

## 4. XServer版を使う手順

XServer版では、開発環境で次のコマンドを実行します。

```bash
pnpm install --frozen-lockfile
pnpm check
NODE_OPTIONS=--max-old-space-size=1536 pnpm build
```

Windowsのcmdでは、メモリ指定を分けて実行します。

```cmd
set NODE_OPTIONS=--max-old-space-size=1536
pnpm build
```

その後、次のファイルをXServerへアップロードします。

```text
dist/public/ の中身
xserver/public_html/.htaccess
xserver/public_html/api/record-score.php
xserver/private/.htaccess
xserver/private/scores.csv
```

完成形は次のとおりです。

```text
対象ドメイン/
├── public_html/
│   ├── index.html
│   ├── assets/
│   ├── .htaccess
│   └── api/
│       └── record-score.php
└── private/
    ├── .htaccess
    └── scores.csv
```

`private` は `public_html` の外へ置きます。`private/scores.csv` は `600`、PHP・HTML・JavaScript・CSS・`.htaccess` は `644`、フォルダは `705` または `755` を目安にします。XServerのPHPバージョンはPHP 8系に設定してください。[2] [3]

XServer版での直接テストは、プロジェクト内の次のスクリプトを使用します。これはXServerと同じ公開・非公開フォルダを一時的に作り、PHP APIへHTTP送信します。

```bash
scripts/verify-xserver-score-api.sh
```

---

## 5. PHPとデータベース接続の注意点

### XServerのPHPとCSV

XServerでは、ブラウザからCSVへ直接書き込ませません。PHP APIだけがCSVを開き、`flock` による排他ロックを取得してから追記します。これにより、複数端末が同時に結果を送信しても、同じ行の途中に別の行が混ざることを防ぎます。

PHP APIには、モード、数値範囲、ニックネーム、プレイID、同一オリジン、短時間の送信回数の検証があります。APIファイルを更新した場合は、構文チェックと総合テストを再実行してください。

```bash
php -l xserver/public_html/api/record-score.php
scripts/verify-xserver-score-api.sh
```

### XServerで外部データベースを使う場合

XServer上でMySQLを使う場合は、PHPの接続情報をソースコードへ直書きしません。可能ならXServerのサーバー設定または、Web公開領域の外に置く設定ファイルから読み込みます。設定ファイルには `644` より緩い権限を付けず、外部から直接取得できない場所に置いてください。データベースのホスト名、ポート、データベース名、ユーザー名、パスワードを公開リポジトリや公開フォルダへ置かないでください。

接続時は、文字コードを `utf8mb4` に設定し、SQLインジェクション対策としてPDOのプリペアドステートメントまたはmysqliのプレースホルダーを使います。ランキング集計は `mode` と `score` にインデックスを作り、同じ `play_id` に一意制約を設定します。外部DBはCSVより運用が複雑になるため、文化祭規模であれば、まず現在の排他ロック付きCSV構成を維持する方が管理しやすい場合があります。

### Manusのデータベース

Manus版では、`DATABASE_URL` はManus側の環境変数として扱います。コード、Markdown文書、スクリーンショット、GitHubへ接続文字列を記載しないでください。Manusのフルスタック構成では、サーバー処理は `server/`、DBアクセスはサーバー側、画面は `client/` に分けます。[1]

データベースへ保存する時刻はサーバー時刻を基準にし、画面表示時に必要なタイムゾーンへ変換します。記録の削除・初期化は不可逆になり得るため、文化祭前にテスト記録を削除する場合は、先にバックアップを取ってください。

---

## 6. どちらを使うかの判断

| 状況 | 推奨 |
|---|---|
| XServerの独自ドメインで公開したい | XServer版 |
| FTP操作なしで、すぐに確認用URLを共有したい | Manus公開版 |
| CSVファイルを手元で保存・集計したい | XServer版 |
| 複数イベントで大量の記録を管理したい | Manus版のDB |
| PHPの設定や権限に不慣れ | Manus公開版 |
| 会場にインターネットがなく、ローカル設置したい | どちらも別途ネットワーク設計が必要 |

Manus版を文化祭の本番で使う場合は、公開URLへのアクセスが安定していること、会場のWi-Fiから同URLを開けること、データベースが有効であることを前日までに確認してください。XServer版を使う場合は、公開URL、PHP、CSV権限、`.htaccess`、ゲスト記録、モード別順位、再読み込み重複防止を前日に確認してください。

---

## 参考資料

[1]: https://www.xserver.ne.jp/manual/man_program_php_ver.php "XServer：PHPのバージョンについて"
[2]: https://www.xserver.ne.jp/manual/man_server_permission.php "XServer：パーミッション"
[3]: https://www.xserver.ne.jp/manual/man_server_htaccess.php "XServer：.htaccess"
