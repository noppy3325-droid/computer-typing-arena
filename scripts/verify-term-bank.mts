import { TERM_BANK, TERM_DOMAINS } from "../client/src/game/termBank.generated";

const terms = TERM_BANK.map((entry) => entry.term);
const duplicateTerms = terms.filter((term, index) => terms.indexOf(term) !== index);
const invalidTerms = terms.filter((term) => !/^[a-z0-9]{2,48}$/.test(term));
const counts = new Map(TERM_DOMAINS.map((domain) => [domain.id, 0]));
for (const entry of TERM_BANK) counts.set(entry.domain, (counts.get(entry.domain) ?? 0) + 1);
const invalidDescriptions = TERM_BANK.filter((entry) => !entry.description || !entry.sourceUrl || !entry.label);
const supplementalDescriptions = TERM_BANK.filter((entry) => entry.description.endsWith("コンピュータ関連の専門用語です。")).length;

if (TERM_BANK.length !== 2000) throw new Error(`Expected 2000 terms, received ${TERM_BANK.length}`);
if (new Set(terms).size !== 2000 || duplicateTerms.length) throw new Error(`Duplicate terms: ${[...new Set(duplicateTerms)].join(", ")}`);
if (invalidTerms.length) throw new Error(`Invalid input terms: ${invalidTerms.join(", ")}`);
if (invalidDescriptions.length) throw new Error(`Incomplete glossary entries: ${invalidDescriptions.length}`);
for (const [domain, count] of counts) if (count !== 100) throw new Error(`${domain} has ${count} terms`);

console.log(JSON.stringify({ totalTerms: TERM_BANK.length, domains: Object.fromEntries(counts), uniqueTerms: new Set(terms).size, sourceSummaryDescriptions: TERM_BANK.length - supplementalDescriptions, supplementalDescriptions }, null, 2));
