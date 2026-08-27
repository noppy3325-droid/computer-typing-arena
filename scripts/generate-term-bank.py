"""Generate a validated 2,000-term Japanese technical glossary for the static typing game."""
from __future__ import annotations

import concurrent.futures
import collections
import json
import os
import re
import sys
import time
from pathlib import Path

import requests

PROJECT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT / "client/src/game/termBank.generated.ts"
PARTIAL_OUTPUT = PROJECT / "scripts/term-bank.partial.json"
MODEL = "gpt-5-nano"
BATCH_SIZE = 100
TERMS_PER_CATEGORY = 100
ASCII_TERM = re.compile(r"^[a-z0-9]{2,48}$")

CATEGORIES = [
    ("COMPUTING", "コンピュータ基礎・アルゴリズム"),
    ("PROGRAMMING_BASICS", "プログラミング基礎・データ構造"),
    ("LANGUAGES", "プログラミング言語・実行環境"),
    ("FRONTEND", "Webフロントエンド"),
    ("BACKEND", "バックエンド・API"),
    ("DATABASE", "データベース・SQL"),
    ("DATA_ENGINEERING", "データ分析・データ基盤"),
    ("MACHINE_LEARNING", "AI・機械学習"),
    ("OPERATING_SYSTEMS", "OS・システムソフトウェア"),
    ("HARDWARE", "ハードウェア・コンピュータアーキテクチャ"),
    ("NETWORKING", "ネットワーク・通信プロトコル"),
    ("SERVERS", "サーバー・Web運用"),
    ("CLOUD", "クラウド・仮想化・コンテナ"),
    ("DEVOPS", "DevOps・CI/CD・SRE"),
    ("SECURITY", "セキュリティ"),
    ("TESTING", "テスト・品質保証"),
    ("EMBEDDED", "モバイル・組み込み・IoT"),
    ("GRAPHICS", "グラフィックス・ゲーム開発"),
    ("UX_ACCESSIBILITY", "UI・UX・アクセシビリティ"),
    ("DISTRIBUTED_STORAGE", "分散システム・ストレージ・信頼性"),
]

SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "technical_terms",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "terms": {
                    "type": "array",
                    "minItems": BATCH_SIZE,
                    "maxItems": BATCH_SIZE,
                    "items": {
                        "type": "object",
                        "properties": {
                            "term": {"type": "string"},
                            "label": {"type": "string"},
                            "description": {"type": "string"},
                        },
                        "required": ["term", "label", "description"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["terms"],
            "additionalProperties": False,
        },
    },
}


def api_call(category_name: str, excluded_terms: list[str]) -> list[dict[str, str]]:
    base_url = os.environ["OPENAI_API_BASE"].rstrip("/")
    headers = {
        "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
        "Content-Type": "application/json",
    }
    prompt = f"""次の技術領域「{category_name}」だけから、文化祭向け英単語タイピングゲームの用語を厳選してください。

厳守事項:
- ちょうど100件。各件は実在する、確立されたコンピュータ・情報技術の専門用語。
- term はプレイヤーが入力する値。小文字の半角英数字のみ、空白・記号・ハイフンなし、2〜48文字。例: loadbalancer, typescript, zerotrust。
- label は人が読む正式・一般的な英語表記。日本語訳は書かず、略語や単語の大文字表記、空白、ハイフンは使ってよい。
- description は日本語で、用語の意味を正確に1文で説明する。18〜60文字。専門用語を重ねすぎず、高校生にも読める語彙にする。
- 同義語の重複、製品の版番号、固有のベンダー商品名、非技術的な一般名詞、入力に日本語が必要な語は禁止。
- この分類ですでに使った次の入力語は絶対に再利用しない: {', '.join(excluded_terms) if excluded_terms else 'なし'}
- 出力は指定JSONのみ。"""
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": "You are a meticulous Japanese technical glossary editor. Return only schema-valid JSON."},
            {"role": "user", "content": prompt},
        ],
        "response_format": SCHEMA,
        "max_completion_tokens": 12000,
        "reasoning": {"effort": "minimal"},
    }
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            response = requests.post(f"{base_url}/chat/completions", headers=headers, json=payload, timeout=90)
            if not response.ok:
                raise RuntimeError(f"HTTP {response.status_code}: {response.text[:800]}")
            response_body = response.json()
            choices = response_body.get("choices")
            if not isinstance(choices, list) or not choices:
                raise RuntimeError(f"Unexpected response body: {json.dumps(response_body, ensure_ascii=False)[:800]}")
            content = choices[0]["message"]["content"]
            data = json.loads(content)
            return data["terms"]
        except Exception as exc:  # Request failures are retried with a short backoff.
            last_error = exc
            time.sleep(2 ** attempt)
    raise RuntimeError(f"{category_name}: generation failed after retries: {last_error}")


def validate(category_id: str, category_name: str, terms: list[dict[str, str]]) -> list[dict[str, str]]:
    if len(terms) != BATCH_SIZE:
        raise ValueError(f"{category_name}: expected {BATCH_SIZE}, got {len(terms)}")
    cleaned: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in terms:
        term = item["term"].strip().lower()
        label = item["label"].strip()
        description = item["description"].strip()
        if not ASCII_TERM.fullmatch(term):
            raise ValueError(f"{category_name}: invalid input term {term!r}")
        if term in seen:
            raise ValueError(f"{category_name}: duplicate input term {term!r}")
        if not label or not (10 <= len(description) <= 115):
            raise ValueError(f"{category_name}: incomplete glossary entry for {term!r}")
        seen.add(term)
        cleaned.append({"term": term, "label": label, "domain": category_id, "domainLabel": category_name, "description": description})
    return cleaned


def to_typescript(terms: list[dict[str, str]]) -> str:
    payload = json.dumps(terms, ensure_ascii=False, separators=(",", ":"))
    categories = json.dumps(
        [{"id": category_id, "label": category_name} for category_id, category_name in CATEGORIES],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return f'''/** Generated glossary: 2,000 verified-format computing terms grouped evenly across 20 technical domains. */
export type TechnicalTerm = {{
  term: string;
  label: string;
  domain: string;
  domainLabel: string;
  description: string;
}};

export const TERM_DOMAINS = {categories} as const;

export const TERM_BANK: TechnicalTerm[] = {payload};
'''


def main() -> int:
    results: dict[str, list[dict[str, str]]] = {category_id: [] for category_id, _ in CATEGORIES}
    if PARTIAL_OUTPUT.exists():
        loaded = json.loads(PARTIAL_OUTPUT.read_text(encoding="utf-8"))
        for category_id, _ in CATEGORIES:
            partial = loaded.get(category_id, [])
            if len(partial) % BATCH_SIZE != 0 or len(partial) > TERMS_PER_CATEGORY:
                raise ValueError(f"Invalid partial glossary data for {category_id}")
            results[category_id] = partial

    for round_number in range(TERMS_PER_CATEGORY // BATCH_SIZE):
        all_existing = {item["term"] for entries in results.values() for item in entries}
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            jobs = {
                pool.submit(api_call, category_name, sorted(all_existing)): (category_id, category_name)
                for category_id, category_name in CATEGORIES
                if len(results[category_id]) < TERMS_PER_CATEGORY
            }
            generated = {category_id: validate(category_id, category_name, job.result()) for job, (category_id, category_name) in jobs.items()}

        for category_id, category_name in CATEGORIES:
            if category_id not in generated:
                continue
            batch = generated[category_id]
            current_terms = {item["term"] for entries in results.values() for item in entries}
            for attempt in range(4):
                duplicates = current_terms.intersection(item["term"] for item in batch)
                if not duplicates:
                    results[category_id].extend(batch)
                    PARTIAL_OUTPUT.write_text(json.dumps(results, ensure_ascii=False), encoding="utf-8")
                    print(f"Round {round_number + 1}: {category_id} {len(results[category_id])}/{TERMS_PER_CATEGORY}", flush=True)
                    break
                print(f"Retrying {category_id}; generated existing terms: {sorted(duplicates)[:5]}", flush=True)
                batch = validate(category_id, category_name, api_call(category_name, sorted(current_terms)))
            else:
                raise ValueError(f"{category_name}: could not generate a unique batch after retries")

    all_terms = [term for category_id, _ in CATEGORIES for term in results[category_id]]
    duplicates = {term for term, count in collections.Counter(item["term"] for item in all_terms).items() if count > 1}
    if duplicates:
        raise ValueError(f"Global term duplicates detected: {sorted(duplicates)[:20]}")
    if len(all_terms) != 2000:
        raise ValueError(f"Expected 2000 total terms, got {len(all_terms)}")

    OUTPUT.write_text(to_typescript(all_terms), encoding="utf-8")
    PARTIAL_OUTPUT.unlink(missing_ok=True)
    print(f"Wrote {len(all_terms)} terms to {OUTPUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
