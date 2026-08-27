"""Replace generic glossary notes with offline-translated English Wikipedia lead definitions."""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

import argostranslate.package
import argostranslate.translate
import requests

PROJECT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT / "client/src/game/termBank.generated.ts"
GENERIC_SUFFIX = "コンピュータ関連の専門用語です。"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "ComputerTypingArenaDefinitionTranslator/1.0 (educational festival project)"})
LAST_REQUEST_AT = 0.0


def request_json(params: dict[str, str]) -> dict:
    global LAST_REQUEST_AT
    for attempt in range(6):
        delay = 1.1 - (time.monotonic() - LAST_REQUEST_AT)
        if delay > 0:
            time.sleep(delay)
        response = SESSION.get("https://en.wikipedia.org/w/api.php", params=params, timeout=30)
        LAST_REQUEST_AT = time.monotonic()
        if response.status_code == 429:
            time.sleep(float(response.headers.get("Retry-After", 6 + 4 * attempt)))
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


def ensure_translator():
    installed = argostranslate.translate.get_installed_languages()
    source = next((language for language in installed if language.code == "en"), None)
    target = next((language for language in installed if language.code == "ja"), None)
    if source and target:
        translation = source.get_translation(target)
        if translation:
            return translation
    argostranslate.package.update_package_index()
    package = next(
        item for item in argostranslate.package.get_available_packages()
        if item.from_code == "en" and item.to_code == "ja"
    )
    argostranslate.package.install_from_path(package.download())
    installed = argostranslate.translate.get_installed_languages()
    source = next(language for language in installed if language.code == "en")
    target = next(language for language in installed if language.code == "ja")
    return source.get_translation(target)


def lead_sentence(extract: str) -> str:
    compact = re.sub(r"\s+", " ", extract).strip()
    first = re.split(r"(?<=[.!?])\s", compact, maxsplit=1)[0]
    return first[:260]


def main() -> None:
    prefix, terms = parse_terms()
    pending = [entry for entry in terms if entry["description"].endswith(GENERIC_SUFFIX)]
    translator = ensure_translator()
    translated = 0
    for start in range(0, len(pending), 40):
        batch = pending[start:start + 40]
        data = request_json({"action": "query", "format": "json", "formatversion": "2", "prop": "extracts", "exintro": "1", "explaintext": "1", "titles": "|".join(entry["label"] for entry in batch), "redirects": "1"})
        extracts = {page.get("title", ""): page.get("extract", "") for page in data.get("query", {}).get("pages", [])}
        redirects = {redirect.get("from", ""): redirect.get("to", "") for redirect in data.get("query", {}).get("redirects", [])}
        for entry in batch:
            resolved_title = redirects.get(entry["label"], entry["label"])
            english = lead_sentence(extracts.get(entry["label"], extracts.get(resolved_title, "")))
            if len(english) < 16:
                continue
            japanese = translator.translate(english).strip()
            if len(japanese) >= 12:
                entry["description"] = japanese[:165]
                translated += 1
        print(f"Translated {min(start + 40, len(pending))}/{len(pending)}; updated {translated}", flush=True)

    OUTPUT.write_text(prefix + json.dumps(terms, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"Finished with {translated} translated source definitions")


if __name__ == "__main__":
    main()
