"""Use public Wikidata descriptions to replace remaining generic technical glossary notes."""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

import argostranslate.translate
import requests

PROJECT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT / "client/src/game/termBank.generated.ts"
GENERIC_SUFFIX = "コンピュータ関連の専門用語です。"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "ComputerTypingArenaWikidataEnricher/1.0 (educational festival project)"})
LAST_REQUEST_AT = 0.0


def request_json(base_url: str, params: dict[str, str]) -> dict:
    global LAST_REQUEST_AT
    for attempt in range(6):
        wait = 1.1 - (time.monotonic() - LAST_REQUEST_AT)
        if wait > 0:
            time.sleep(wait)
        response = SESSION.get(base_url, params=params, timeout=30)
        LAST_REQUEST_AT = time.monotonic()
        if response.status_code == 429:
            time.sleep(float(response.headers.get("Retry-After", 5 + 4 * attempt)))
            continue
        response.raise_for_status()
        return response.json()
    raise RuntimeError("Public data endpoint rate limit persisted")


def parse_terms() -> tuple[str, list[dict]]:
    text = OUTPUT.read_text(encoding="utf-8")
    match = re.search(r"export const TERM_BANK: TechnicalTerm\[\] = (.*);\s*$", text, flags=re.S)
    if not match:
        raise ValueError("Could not locate TERM_BANK data")
    return text[:match.start(1)], json.loads(match.group(1))


def translator():
    languages = argostranslate.translate.get_installed_languages()
    source = next(language for language in languages if language.code == "en")
    target = next(language for language in languages if language.code == "ja")
    return source.get_translation(target)


def main() -> None:
    prefix, terms = parse_terms()
    pending = [entry for entry in terms if entry["description"].endswith(GENERIC_SUFFIX)]
    translate = translator().translate
    changed = 0
    for start in range(0, len(pending), 50):
        batch = pending[start:start + 50]
        page_data = request_json(
            "https://en.wikipedia.org/w/api.php",
            {"action": "query", "format": "json", "formatversion": "2", "prop": "pageprops", "titles": "|".join(entry["label"] for entry in batch), "redirects": "1"},
        )
        title_to_qid = {page.get("title", ""): page.get("pageprops", {}).get("wikibase_item") for page in page_data.get("query", {}).get("pages", [])}
        redirects = {redirect.get("from", ""): redirect.get("to", "") for redirect in page_data.get("query", {}).get("redirects", [])}
        qid_to_entry = {}
        for entry in batch:
            qid = title_to_qid.get(entry["label"], title_to_qid.get(redirects.get(entry["label"], "")))
            if qid:
                qid_to_entry[qid] = entry
        if not qid_to_entry:
            continue
        entities = request_json(
            "https://www.wikidata.org/w/api.php",
            {"action": "wbgetentities", "format": "json", "ids": "|".join(qid_to_entry), "props": "descriptions", "languages": "ja|en"},
        ).get("entities", {})
        for qid, entry in qid_to_entry.items():
            descriptions = entities.get(qid, {}).get("descriptions", {})
            japanese = descriptions.get("ja", {}).get("value", "")
            english = descriptions.get("en", {}).get("value", "")
            meaning = japanese or translate(english).strip() if english else ""
            if len(meaning) < 3:
                continue
            entry["description"] = f"「{entry['label']}」は、{meaning}に関する技術用語です。"[:165]
            entry["sourceUrl"] = f"https://www.wikidata.org/wiki/{qid}"
            changed += 1
        print(f"Checked {min(start + 50, len(pending))}/{len(pending)}; updated {changed}", flush=True)
    OUTPUT.write_text(prefix + json.dumps(terms, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"Finished with {changed} Wikidata descriptions")


if __name__ == "__main__":
    main()
