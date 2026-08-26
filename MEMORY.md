# Implementation Memory

## Decisions

- The prompt bank uses lower-case English computer terminology so the player can type immediately without an IME requirement. The user-facing instructions remain Japanese.
- The generated chamber visual is deliberately dark; all functional text is placed over an additional dark translucent layer to preserve contrast.
- The game uses Babylon only as the subtle animated signal field. Text, input, menus, and telemetry remain DOM elements for accessibility and reliable keyboard focus.
- `?demo` is a deterministic, non-interactive verification mode. It exercises the same `TypingSession` acceptance path used by manual play.
- 効果音は外部ファイルではなく Web Audio API の短い合成音で実装する。音は最初の開始操作または入力操作でアンロックされ、SFXトグルで即時に無効化できる。
- XServer版では、同一オリジンの `api/record-score.php` に結果を送り、公開ディレクトリ外の `private/scores.csv` にPHPの排他ロックを使って追記する。開発プレビューにはPHPがないため、記録状態が失敗表示となるのは想定内である。

## Cleanup Contract

- `GameCanvas` cleans up the Babylon resize listener and renderer.
- `createGameScene` cleans up the `typing-packet` listener, glow layer, pulse meshes, and scene.
- `TypingSession` clears its interval and listener sets.
