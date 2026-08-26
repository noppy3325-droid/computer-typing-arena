# XServer設置ガイド：Computer Typing Arena

この版では、ゲーム開始前にニックネームを必須入力とし、終了時に**日本時間の記録時刻、ニックネーム、スコア、WPM、精度、完了用語数、最大ストリーク、制限時間**をCSVへ追記します。ブラウザは同一オリジンの `api/record-score.php` に送信するだけで、CSVの更新はXServer上のPHPが行います。したがって、CSVを公開ディレクトリに置かず、ブラウザから直接書き込ませない設計です。

> XServerは、Web公開用のフォルダに `755` または `705`、`.txt`・`.dat`・`.log`などのデータファイルに `600` を推奨しています。[1]

## 配置する構成

以下のとおり、ビルドしたReactアプリとPHP APIを同じドメインに配置してください。`private` は **public_htmlの外側** に置くため、CSVをURLから直接ダウンロードできません。

| XServer上の配置先 | このプロジェクトの元ファイル | 目的 |
|---|---|---|
| `~/your-domain/public_html/` | `pnpm build` で出力される `dist/public/` の全ファイル | ゲーム画面 |
| `~/your-domain/public_html/api/record-score.php` | `xserver/public_html/api/record-score.php` | 結果を受信してCSVに追記するAPI |
| `~/your-domain/public_html/.htaccess` | `xserver/public_html/.htaccess` | 公開フォルダの一覧表示防止とデータ拡張子の保護 |
| `~/your-domain/private/scores.csv` | `xserver/private/scores.csv` | 非公開のスコア記録CSV |
| `~/your-domain/private/.htaccess` | `xserver/private/.htaccess` | 非公開フォルダの直接アクセス防止 |

## 設置手順

まず、ローカルまたは開発環境で `pnpm build` を実行し、`dist/public/` の内容を用意します。次に、XServerのファイルマネージャまたはFTPで上表の配置先へアップロードします。XServerのファイルマネージャは、アップロード、フォルダ作成、展開、パーミッション変更をブラウザ上で行えます。[2]

`private` フォルダは `705`、`scores.csv` は `600` を設定してください。PHPファイルと公開ファイルは `644` を基本とします。[1] `scores.csv` は初期状態でヘッダーのみを持ち、テスト結果や架空の記録は含みません。

PHPはサーバーパネルの **PHP Ver.切替** から設定できます。新規設置では、XServerが提供している現行のPHP 8系を選んでください。[3] 本APIはPHP 8系を対象としています。

## 動作確認

公開URLでゲームを開き、ニックネームを入力して1回プレイしてください。終了画面に `CSV ENTRY WRITTEN` と表示されれば記録は成功です。`RESULT LOG PENDING — XSERVER APIを確認` と表示された場合は、以下の項目を順に確認してください。

| 確認項目 | 期待する状態 |
|---|---|
| URL | ゲーム画面と `api/record-score.php` が同一ドメイン・同一プロトコルで動作している。 |
| API | `public_html/api/record-score.php` に配置され、PHPとして実行される。 |
| データ領域 | `private` が `public_html` の外にあり、`scores.csv` が `600` で書き込み可能である。 |
| PHP | PHP 8系が選択されている。 |
| 通信 | ブラウザの開発者ツールで `api/record-score.php` が `201 Created` を返している。 |

CSVにはニックネームとゲーム結果が継続的に蓄積されます。公開サイトで扱う情報として、運営者は利用者へ記録目的と保管方針を別途明示してください。

## セキュリティ設計

APIはPOSTとJSONだけを受け付け、ニックネームと各数値を検証します。さらに、同一オリジン検査、IPアドレスごとの短い送信間隔制限、排他ロック（`flock`）、公開ディレクトリ外へのCSV保存を行います。これにより、同時送信時の行の混在を避け、CSVをWebから直接閲覧できないようにします。

CSVは簡易記録に適した形式です。利用者数や記録頻度が大きくなった場合、検索・集計・認可・改ざん対策を改善するため、XServerのMySQLへ移行してください。

## 参考資料

[1]: https://www.xserver.ne.jp/manual/man_server_permission.php "XServer：パーミッション"
[2]: https://www.xserver.ne.jp/manual/man_tool_file.php "XServer：ファイルマネージャ"
[3]: https://www.xserver.ne.jp/manual/man_program_php_ver.php "XServer：PHPのバージョンについて"
