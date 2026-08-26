# Runtime Structure

## Experience Map

`App.tsx` renders only `GameCanvas`, preserving the game as a full-screen performance console rather than a multi-page site.

| Module | Ownership | Responsibility |
|---|---|---|
| `client/src/components/GameCanvas.tsx` | React picture frame | Creates the Babylon engine once, renders the DOM console, owns focus and presentation state, and bridges packet events to the scene. |
| `client/src/game/TypingSession.ts` | Game logic | Owns timing, prompt selection, scoring, typing analysis, WPM/accuracy calculation, state transitions, and deterministic demo behavior. |
| `client/src/game/terms.ts` | Data | Contains the curated computer-term-only prompt bank and technical domain metadata. |
| `client/src/game/scene.ts` | Babylon signal field | Owns transparent background motion, pulse meshes, glowing instrument tracks, and window-event cleanup. |
| `client/src/index.css` | Visual system | Implements Signal Lab typography, rail layout, contrast rules, responsive behavior, and motion. |

## Data Flow

1. `GameCanvas` instantiates `TypingSession` and subscribes to immutable snapshots.
2. The player’s DOM input sends its current buffer to `TypingSession.type()`.
3. `TypingSession` updates game state and emits a packet callback after a correctly completed technical term.
4. `GameCanvas` updates its DOM readouts and dispatches `typing-packet` to the Babylon scene.
5. `scene.ts` adds a brief mint pulse across the signal tracks while the DOM overlay presents the packet burst asset.

## Asset Hints

| Asset | Role | Intended size | Runtime URL |
|---|---|---:|---|
| Signal Lab chamber | Dark visual field behind all UI | viewport cover | `/manus-storage/signal-lab-chamber-bg_6910abaf.png` |
| Signal packet burst | Successful input accent | 106×106 px | `/manus-storage/signal-packet-burst_4c103518.png` |
| Signal gate mark | Header and favicon identity | 48×48 px | `/manus-storage/signal-gate-logo_f663d1fc.png` |

## State Machine

| State | Entry | Player action | Exit |
|---|---|---|---|
| `ready` | Initial load or duration selection | Start button or Enter | `running` |
| `running` | Session begins | Type a technical term, correct with Backspace | `finished` when the clock reaches zero |
| `finished` | Timing window closes | Retry | `running` |
