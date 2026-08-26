# Implementation Memory

## Decisions

- The prompt bank uses lower-case English computer terminology so the player can type immediately without an IME requirement. The user-facing instructions remain Japanese.
- The generated chamber visual is deliberately dark; all functional text is placed over an additional dark translucent layer to preserve contrast.
- The game uses Babylon only as the subtle animated signal field. Text, input, menus, and telemetry remain DOM elements for accessibility and reliable keyboard focus.
- `?demo` is a deterministic, non-interactive verification mode. It exercises the same `TypingSession` acceptance path used by manual play.

## Cleanup Contract

- `GameCanvas` cleans up the Babylon resize listener and renderer.
- `createGameScene` cleans up the `typing-packet` listener, glow layer, pulse meshes, and scene.
- `TypingSession` clears its interval and listener sets.
