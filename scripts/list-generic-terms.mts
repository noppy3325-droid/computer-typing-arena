import { TERM_BANK } from "../client/src/game/termBank.generated";

const generic = TERM_BANK.filter((entry) => entry.description.endsWith("コンピュータ関連の専門用語です。"));
console.log(JSON.stringify(generic.map(({ term, label, domainLabel }) => ({ term, label, domainLabel })), null, 2));
