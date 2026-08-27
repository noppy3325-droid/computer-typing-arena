"""Backfill the generated glossary with Japanese Wikipedia lead definitions when available."""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

import requests

PROJECT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT / "client/src/game/termBank.generated.ts"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "ComputerTypingArenaGlossaryEnricher/1.0 (educational festival project)"})
LAST_REQUEST_AT = 0.0


def request_json(base_url: str, params: dict[str, str]) -> dict:
    global LAST_REQUEST_AT
    for attempt in range(6):
        delay = 1.15 - (time.monotonic() - LAST_REQUEST_AT)
        if delay > 0:
            time.sleep(delay)
        response = SESSION.get(base_url, params=params, timeout=30)
        LAST_REQUEST_AT = time.monotonic()
        if response.status_code == 429:
            time.sleep(float(response.headers.get("Retry-After", 6 + attempt * 4)))
            continue
        response.raise_for_status()
        return response.json()
    raise RuntimeError("Wikipedia API rate limit persisted")


def parse_terms() -> tuple[str, list[dict]]:
    text = OUTPUT.read_text(encoding="utf-8")
    match = re.search(r"export const TERM_BANK: TechnicalTerm\[\] = (.*);\s*$", text, flags=re.S)
    if not match:
        raise ValueError("Could not locate TERM_BANK data")
    return text[:match.start(1)], json.loads(match.group(1))


def write_terms(prefix: str, terms: list[dict]) -> None:
    OUTPUT.write_text(prefix + json.dumps(terms, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")


def first_sentence(text: str) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    first = re.split(r"(?<=。)", compact, maxsplit=1)[0].strip()
    return first[:145] if len(first) >= 12 else compact[:145]


def main() -> None:
    prefix, terms = parse_terms()
    title_to_entry = {entry["label"]: entry for entry in terms}
    titles = list(title_to_entry)
    updated = 0

    for start in range(0, len(titles), 40):
        batch = titles[start:start + 40]
        english = request_json(
            "https://en.wikipedia.org/w/api.php",
            {"action": "query", "format": "json", "formatversion": "2", "prop": "langlinks", "lllang": "ja", "lllimit": "1", "titles": "|".join(batch), "redirects": "1"},
        )
        japanese_to_english: dict[str, str] = {}
        for page in english.get("query", {}).get("pages", []):
            links = page.get("langlinks", [])
            if not links:
                continue
            link = links[0]
            japanese_title = link.get("title") or link.get("*")
            if japanese_title:
                japanese_to_english[japanese_title] = page.get("title", "")
        if not japanese_to_english:
            continue
        japanese = request_json(
            "https://ja.wikipedia.org/w/api.php",
            {"action": "query", "format": "json", "formatversion": "2", "prop": "extracts|info", "inprop": "url", "exintro": "1", "explaintext": "1", "titles": "|".join(japanese_to_english), "redirects": "1"},
        )
        for page in japanese.get("query", {}).get("pages", []):
            english_title = japanese_to_english.get(page.get("title", ""))
            extract = page.get("extract", "")
            if not english_title or not extract or "曖昧さ回避" in extract:
                continue
            entry = title_to_entry.get(english_title)
            if not entry:
                continue
            description = first_sentence(extract)
            if len(description) >= 12:
                entry["description"] = description
                entry["sourceUrl"] = page.get("fullurl", entry["sourceUrl"])
                updated += 1
        print(f"Checked {min(start + 40, len(titles))}/{len(titles)}; updated {updated}", flush=True)

    write_terms(prefix, terms)
    print(f"Finished with {updated} Japanese source definitions")


if __name__ == "__main__":
    main()
