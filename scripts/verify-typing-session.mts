import { TypingSession } from "../client/src/game/TypingSession";
import { TECHNICAL_TERMS } from "../client/src/game/terms";

Object.assign(globalThis, {
  window: {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
  },
});

const session = new TypingSession(TECHNICAL_TERMS, { deterministic: true });
session.start();
const term = session.getSnapshot().current.term;
const firstExpected = term[0];
const wrongCharacter = firstExpected === "x" ? "z" : "x";

const rejected = session.type(wrongCharacter);
if (!rejected.rejected || rejected.typed !== "" || rejected.registeredKey) {
  throw new Error("誤入力が即時ドロップされていません。");
}

const acceptedCharacter = session.type(firstExpected);
if (acceptedCharacter.rejected || acceptedCharacter.typed !== firstExpected || !acceptedCharacter.registeredKey) {
  throw new Error("正しい入力が受け付けられていません。");
}

const result = session.type(term);
if (!result.accepted || session.getSnapshot().completed !== 1) {
  throw new Error("用語の完了とスコアリングが正しく動作していません。");
}

session.dispose();
console.log("TypingSession verification passed");
