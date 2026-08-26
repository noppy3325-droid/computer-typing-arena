# Game Plan: Computer Typing Arena

## Risk Tasks

### 1. DOM typing input over an animated Babylon field
- **Why isolated:** The typing input must retain focus and respond to every keystroke while a full-screen WebGL canvas runs beneath it. A canvas that captures pointers or a React double mount can make the game appear playable but reject real input.
- **Approach:** Keep the Babylon canvas non-interactive and transparent, render all keyboard controls as DOM, protect engine initialization with a React ref, and dispose the engine, scene, session timer, and all window listeners on unmount.
- **Verify:** Starting a run focuses the input; characters immediately update the visible prompt; clicks on the central channel return focus; the `?demo` route produces accepted packets without input; no duplicate renderer or event behavior appears after hot reload.

### 2. Deterministic visual proof mode
- **Why isolated:** A static first screen cannot prove term transitions, score updates, packet effects, and active telemetry simultaneously.
- **Approach:** `?demo` starts a deterministic term sequence and accepts one term every 800ms using the same session logic as a player, while emitting visual packets into the Babylon scene.
- **Verify:** A `?demo` screenshot shows a nonzero score, a changing technical term, live channel status, and the packet animation or recent accepted-packet log.

## Main Build

Build a 30/60/90-second browser typing game that draws only from a curated list of computer-related terms. The player starts a timing window, types the displayed English term, corrects mistakes with Backspace, and receives score, streak, WPM, accuracy, completed terms, and best score telemetry. The central signal channel presents the prompt at large scale while side rails hold supporting measurement data.

- **Assets:**
  - `signal-lab-chamber-bg` background (`/manus-storage/signal-lab-chamber-bg_6910abaf.png`) — fullscreen viewport ambience behind the console.
  - `signal-packet-burst` overlay (`/manus-storage/signal-packet-burst_4c103518.png`) — 106px confirmation burst near the prompt.
  - `signal-gate-logo` icon (`/manus-storage/signal-gate-logo_f663d1fc.png`) — 48px header mark and favicon.
- **Verify:**
  - Only `TECHNICAL_TERMS` are ever presented as playable prompts.
  - Correct, pending, and incorrect characters are visually distinguishable.
  - Score, completed count, streak, WPM, accuracy, and time window react to live play.
  - The 30/60/90-second selection works from the ready state; completing a run shows a retry summary.
  - Desktop and mobile views keep the prompt and input readable without overflow.
  - No missing texture, image placeholder, console error, or TypeScript failure occurs.
  - Reference consistency: midnight-blue Signal Lab, phosphor-mint signals, central prompt channel, peripheral measurement rails.
