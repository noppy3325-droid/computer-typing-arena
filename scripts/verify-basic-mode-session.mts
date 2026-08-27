import { BASIC_PROMPTS } from "../client/src/game/basicPrompts";
import { TypingSession } from "../client/src/game/TypingSession";

(globalThis as unknown as { window: Window }).window = { setInterval: () => 1, clearInterval: () => undefined } as unknown as Window;

const session = new TypingSession([BASIC_PROMPTS[0]]);
session.start();
const result = session.type("パソコンの電源を入れる");
const snapshot = session.getSnapshot();
if (!result.accepted || snapshot.completed !== 1) throw new Error("Japanese IME-confirmed sentence did not complete");
if (snapshot.correctKeys !== BASIC_PROMPTS[0].term.length) throw new Error("Japanese character count did not match the prompt");
console.log(JSON.stringify({ prompt: BASIC_PROMPTS[0].term, accepted: result.accepted, completed: snapshot.completed, typedCharacters: snapshot.correctKeys }, null, 2));
