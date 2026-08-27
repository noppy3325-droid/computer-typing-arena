import { BASIC_PROMPTS } from "../client/src/game/basicPrompts";
import { TypingSession } from "../client/src/game/TypingSession";

(globalThis as unknown as { window: Window }).window = { setInterval: () => 1, clearInterval: () => undefined } as unknown as Window;

const whitePrompt = BASIC_PROMPTS.find((prompt) => prompt.label === "しろ");
if (!whitePrompt) throw new Error("Basic prompt しろ was not found");
const session = new TypingSession([whitePrompt]);
session.start();
session.type("x");
const alternativeResult = session.type("siro");
const history = session.getPresentedPrompts()[0].typedCharacters;
if (!alternativeResult.accepted) throw new Error("Alternative romaji spelling siro was not accepted");
if (history[0]?.correct !== false || history.slice(1).some((entry) => !entry.correct)) throw new Error("Mistype trace did not retain red-highlight information");
console.log(JSON.stringify({ variants: whitePrompt.inputVariants, acceptedAlternative: "siro", mistype: history[0] }, null, 2));
