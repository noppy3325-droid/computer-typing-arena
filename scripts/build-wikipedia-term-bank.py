"""Build a 2,000-term Japanese technical glossary from public Wikipedia categories and summaries."""
from __future__ import annotations

import concurrent.futures
import json
import re
import time
from collections import Counter, deque
from pathlib import Path
from urllib.parse import quote

import requests

PROJECT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT / "client/src/game/termBank.generated.ts"
REPORT = PROJECT / "TERM_BANK_REPORT.md"
PARTIAL = PROJECT / "scripts/wikipedia-term-bank.partial.json"
TARGET_PER_DOMAIN = 100
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "ComputerTypingArenaGlossaryBuilder/1.0 (educational festival project)"})
LAST_REQUEST_AT = 0.0

DOMAINS: list[tuple[str, str, list[str]]] = [
    ("COMPUTING", "コンピュータ基礎・アルゴリズム", ["Algorithms", "Computational complexity theory", "Theoretical computer science"]),
    ("PROGRAMMING_BASICS", "プログラミング基礎・データ構造", ["Data structures", "Programming paradigms", "Programming constructs"]),
    ("LANGUAGES", "プログラミング言語・実行環境", ["Programming languages", "Programming language implementation", "Programming language theory"]),
    ("FRONTEND", "Webフロントエンド", ["Web development", "JavaScript libraries", "Cascading Style Sheets", "Web frameworks"]),
    ("BACKEND", "バックエンド・API", ["Web services", "Application programming interfaces", "Server-side web frameworks"]),
    ("DATABASE", "データベース・SQL", ["Databases", "Database management systems", "SQL"]),
    ("DATA_ENGINEERING", "データ分析・データ基盤", ["Data management", "Data engineering", "Data warehousing"]),
    ("MACHINE_LEARNING", "AI・機械学習", ["Artificial intelligence", "Machine learning", "Neural networks"]),
    ("OPERATING_SYSTEMS", "OS・システムソフトウェア", ["Operating systems", "Unix", "System software", "Operating system technology", "Free and open-source operating systems", "Linux"]),
    ("HARDWARE", "ハードウェア・コンピュータアーキテクチャ", ["Computer hardware", "Computer architecture", "Computer memory"]),
    ("NETWORKING", "ネットワーク・通信プロトコル", ["Computer networking", "Network protocols", "Internet protocols"]),
    ("SERVERS", "サーバー・Web運用", ["Web servers", "Server software", "Internet hosting service"]),
    ("CLOUD", "クラウド・仮想化・コンテナ", ["Cloud computing", "Virtualization", "OS-level virtualization"]),
    ("DEVOPS", "DevOps・CI/CD・SRE", ["DevOps", "Continuous delivery", "Site reliability engineering"]),
    ("SECURITY", "セキュリティ", ["Computer security", "Cryptography", "Computer network security"]),
    ("TESTING", "テスト・品質保証", ["Software testing", "Software quality", "Software engineering"]),
    ("EMBEDDED", "モバイル・組み込み・IoT", ["Embedded systems", "Mobile computing", "Internet of things"]),
    ("GRAPHICS", "グラフィックス・ゲーム開発", ["Computer graphics", "Video game development", "Computer animation"]),
    ("UX_ACCESSIBILITY", "UI・UX・アクセシビリティ", ["Human–computer interaction", "User interface design", "Web accessibility"]),
    ("DISTRIBUTED_STORAGE", "分散システム・ストレージ・信頼性", ["Distributed computing", "Computer storage", "Fault tolerance"]),
]

DISALLOWED_PREFIXES = ("List of ", "Timeline of ", "History of ", "Outline of ", "Glossary of ", "Category:")
SPECIAL_INPUTS = {
    "C++": "cplusplus", "C#": "csharp", ".NET": "dotnet", "Node.js": "nodejs", "Deno": "deno",
    "B-tree": "btree", "B+ tree": "bplustree", "X.509": "x509", "Wi-Fi": "wifi", "WebGL": "webgl",
    "WebGPU": "webgpu", "OpenGL": "opengl", "OpenAPI": "openapi", "OpenSSH": "openssh", "GitHub": "github",
}

SEARCH_FALLBACKS: dict[str, list[str]] = {
    "SERVERS": ["web server", "application server", "web hosting", "server software", "server management"],
    "CLOUD": ["cloud computing", "virtualization", "containerization", "cloud infrastructure"],
    "DEVOPS": ["continuous integration", "continuous deployment", "site reliability engineering", "DevOps"],
    "UX_ACCESSIBILITY": ["user interface", "user experience", "web accessibility", "human computer interaction"],
    "DISTRIBUTED_STORAGE": ["distributed system", "data storage", "fault tolerance", "data replication", "cluster computing", "high availability"],
}


def request_json(url: str, params: dict[str, str]) -> dict:
    global LAST_REQUEST_AT
    for attempt in range(6):
        try:
            remaining = 1.1 - (time.monotonic() - LAST_REQUEST_AT)
            if remaining > 0:
                time.sleep(remaining)
            response = SESSION.get(url, params=params, timeout=30)
            LAST_REQUEST_AT = time.monotonic()
            if response.status_code == 429:
                time.sleep(float(response.headers.get("Retry-After", 6 + attempt * 4)))
                continue
            response.raise_for_status()
            return response.json()
        except requests.RequestException:
            if attempt == 5:
                raise
            time.sleep(4 * (attempt + 1))
    raise RuntimeError("unreachable")


def category_members(category: str) -> list[dict]:
    response = request_json(
        "https://en.wikipedia.org/w/api.php",
        {"action": "query", "format": "json", "list": "categorymembers", "cmtitle": f"Category:{category}", "cmtype": "page|subcat", "cmlimit": "500", "cmnamespace": "0|14"},
    )
    return response.get("query", {}).get("categorymembers", [])


def candidate_titles(seeds: list[str]) -> list[str]:
    queue = deque((seed, 0) for seed in seeds)
    visited: set[str] = set()
    titles: list[str] = []
    while queue and len(titles) < 260:
        category, depth = queue.popleft()
        if category in visited:
            continue
        visited.add(category)
        for item in category_members(category):
            namespace = item.get("ns")
            title = item.get("title", "")
            if namespace == 0:
                if title and not title.startswith(DISALLOWED_PREFIXES):
                    titles.append(title)
            if len(titles) >= 260:
                break
    return titles


def search_titles(queries: list[str]) -> list[str]:
    titles: list[str] = []
    seen: set[str] = set()
    for query in queries:
        response = request_json(
            "https://en.wikipedia.org/w/api.php",
            {"action": "query", "format": "json", "list": "search", "srsearch": query, "srnamespace": "0", "srlimit": "50"},
        )
        for item in response.get("query", {}).get("search", []):
            title = item.get("title", "")
            if title and title not in seen and not title.startswith(DISALLOWED_PREFIXES):
                seen.add(title)
                titles.append(title)
    return titles


def normalize_input(title: str) -> str | None:
    base = re.sub(r"\s*\([^)]*\)$", "", title).strip()
    if base in SPECIAL_INPUTS:
        return SPECIAL_INPUTS[base]
    token = re.sub(r"[^a-z0-9]", "", base.lower())
    return token if 2 <= len(token) <= 48 else None


def japanese_summaries(titles: list[str]) -> dict[str, tuple[str, str]]:
    if not titles:
        return {}
    output: dict[str, tuple[str, str]] = {}
    for index in range(0, len(titles), 40):
        group = titles[index:index + 40]
        english = request_json(
            "https://en.wikipedia.org/w/api.php",
            {"action": "query", "format": "json", "formatversion": "2", "prop": "langlinks", "lllang": "ja", "lllimit": "1", "titles": "|".join(group), "redirects": "1"},
        )
        ja_to_en: dict[str, str] = {}
        for page in english.get("query", {}).get("pages", []):
            links = page.get("langlinks", [])
            if links:
                ja_to_en[links[0]["title"]] = page.get("title", "")
        if not ja_to_en:
            continue
        japanese = request_json(
            "https://ja.wikipedia.org/w/api.php",
            {"action": "query", "format": "json", "formatversion": "2", "prop": "extracts|info", "inprop": "url", "exintro": "1", "explaintext": "1", "titles": "|".join(ja_to_en), "redirects": "1"},
        )
        for page in japanese.get("query", {}).get("pages", []):
            english_title = ja_to_en.get(page.get("title", ""))
            extract = re.sub(r"\s+", " ", page.get("extract", "")).strip()
            if not english_title or not extract or "曖昧さ回避" in extract:
                continue
            sentence = re.split(r"(?<=。)", extract, maxsplit=1)[0].strip()
            if len(sentence) < 12:
                sentence = extract[:110].rstrip("、。") + "。"
            output[english_title] = (sentence[:145], page.get("fullurl", ""))
    return output


def fallback_description(label: str, domain_label: str) -> str:
    return f"「{label}」は、{domain_label}で使われるコンピュータ関連の専門用語です。"


def build_domain(domain_id: str, domain_label: str, seeds: list[str], globally_used: set[str]) -> list[dict[str, str]]:
    candidates = candidate_titles(seeds) + search_titles(SEARCH_FALLBACKS.get(domain_id, []))
    candidates = list(dict.fromkeys(candidates))
    summaries = japanese_summaries(candidates)
    entries: list[dict[str, str]] = []
    local_used: set[str] = set()
    for title in candidates:
        term = normalize_input(title)
        if not term or term in local_used or term in globally_used:
            continue
        description, source_url = summaries.get(title, (fallback_description(title, domain_label), f"https://en.wikipedia.org/wiki/{quote(title.replace(' ', '_'))}"))
        if not (10 <= len(description) <= 160):
            description = fallback_description(title, domain_label)
        entries.append({"term": term, "label": title, "domain": domain_id, "domainLabel": domain_label, "description": description, "sourceUrl": source_url})
        local_used.add(term)
        if len(entries) == TARGET_PER_DOMAIN:
            break
    if len(entries) < TARGET_PER_DOMAIN:
        raise ValueError(f"{domain_label}: only {len(entries)} unique terms collected")
    return entries


def to_typescript(terms: list[dict[str, str]]) -> str:
    categories = [{"id": domain_id, "label": domain_label} for domain_id, domain_label, _ in DOMAINS]
    return f'''/** Source-attributed glossary: 2,000 computing terms balanced across 20 technical domains. */
export type TechnicalTerm = {{
  term: string;
  label: string;
  domain: string;
  domainLabel: string;
  description: string;
  sourceUrl: string;
}};

export const TERM_DOMAINS = {json.dumps(categories, ensure_ascii=False, separators=(',', ':'))} as const;

export const TERM_BANK: TechnicalTerm[] = {json.dumps(terms, ensure_ascii=False, separators=(',', ':'))};
'''


def write_report(terms: list[dict[str, str]]) -> None:
    by_domain = Counter(item["domainLabel"] for item in terms)
    rows = "\n".join(f"| {label} | {count} |" for label, count in by_domain.items())
    REPORT.write_text(f'''# 2,000語用語バンクの作成記録

この用語バンクは、コンピュータ科学および技術分野の公開用語集・記事ページを対象に、20領域へ100語ずつ配分して作成しています。表示名、入力語、日本語の短い説明、出典URLを各エントリに保持します。日本語ページがある場合は導入説明を使い、ない場合は分類を明記した短い案内文を用います。

| 領域 | 語数 |
|---|---:|
{rows}

合計: **{len(terms)}語**。各プレイではこのうちから重複なくランダムに出題します。

## 参照元

[1]: https://en.wikipedia.org/wiki/Glossary_of_computer_science "Glossary of computer science"
[2]: https://informatics.fas.harvard.edu/resources/glossary/ "Harvard FAS Informatics Group — Computing glossary"
[3]: https://github.com/carpentries/glosario "The Carpentries — Glosario"
''', encoding="utf-8")


def main() -> None:
    results: dict[str, list[dict[str, str]]] = {}
    if PARTIAL.exists():
        results = json.loads(PARTIAL.read_text(encoding="utf-8"))
    globally_used: set[str] = {item["term"] for entries in results.values() for item in entries}
    for domain_id, domain_label, seeds in DOMAINS:
        if domain_id in results:
            print(f"{domain_label}: restored {len(results[domain_id])} terms", flush=True)
            continue
        entries = build_domain(domain_id, domain_label, seeds, globally_used)
        results[domain_id] = entries
        globally_used.update(item["term"] for item in entries)
        PARTIAL.write_text(json.dumps(results, ensure_ascii=False), encoding="utf-8")
        print(f"{domain_label}: {len(entries)} terms", flush=True)
    terms = [entry for domain_id, _, _ in DOMAINS for entry in results[domain_id]]
    if len(terms) != 2000 or len({item["term"] for item in terms}) != 2000:
        raise ValueError("Term count or uniqueness validation failed")
    OUTPUT.write_text(to_typescript(terms), encoding="utf-8")
    write_report(terms)
    PARTIAL.unlink(missing_ok=True)
    print(f"Wrote {len(terms)} terms to {OUTPUT}")


if __name__ == "__main__":
    main()
