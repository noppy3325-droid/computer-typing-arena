"""Check one structured glossary request and print the raw API result for diagnostics."""
import json
import os

import requests

request_body = {
    "model": "gpt-5-nano",
    "messages": [
        {"role": "system", "content": "Return only JSON."},
        {"role": "user", "content": "『プログラミング言語・実行環境』から実在する技術用語を100件、term（英小文字のみ）、label、description（日本語）で返してください。"},
    ],
    "response_format": {
        "type": "json_schema",
        "json_schema": {
            "name": "terms",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {"terms": {"type": "array", "minItems": 100, "maxItems": 100, "items": {"type": "object", "properties": {"term": {"type": "string"}, "label": {"type": "string"}, "description": {"type": "string"}}, "required": ["term", "label", "description"], "additionalProperties": False}}},
                "required": ["terms"],
                "additionalProperties": False,
            },
        },
    },
    "max_completion_tokens": 12000,
    "reasoning": {"effort": "minimal"},
}
response = requests.post(
    os.environ["OPENAI_API_BASE"].rstrip("/") + "/chat/completions",
    headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}", "Content-Type": "application/json"},
    json=request_body,
    timeout=90,
)
print(response.status_code)
print(response.text)
