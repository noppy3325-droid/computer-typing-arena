import { TypingSession } from "../client/src/game/TypingSession";
import { TECHNICAL_TERMS, TERM_DOMAINS } from "../client/src/game/terms";

(globalThis as unknown as { window: Window }).window = {
  setInterval: () => 1,
  clearInterval: () => undefined,
} as unknown as Window;

const session = new TypingSession(TECHNICAL_TERMS);
session.start();
for (let index = 0; index < 100; index += 1) session.autoComplete();

const presented = session.getPresentedTerms();
const firstRoundDomains = new Set(presented.slice(0, TERM_DOMAINS.length).map((term) => term.domain));
if (presented.length !== 101) throw new Error(`Expected 101 displayed terms; received ${presented.length}`);
if (new Set(presented.map((term) => term.term)).size !== 101) throw new Error("Duplicate term was presented in one run");
if (firstRoundDomains.size !== TERM_DOMAINS.length) throw new Error("First balanced round does not include all domains");

console.log(JSON.stringify({ presented: presented.length, distinct: new Set(presented.map((term) => term.term)).size, firstRoundDomains: firstRoundDomains.size }, null, 2));
