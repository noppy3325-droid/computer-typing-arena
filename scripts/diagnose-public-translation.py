"""Test a public translation endpoint with one short technical definition."""
import requests

response = requests.get(
    "https://api.mymemory.translated.net/get",
    params={"q": "A router forwards data packets between computer networks.", "langpair": "en|ja"},
    timeout=30,
)
response.raise_for_status()
print(response.json()["responseData"]["translatedText"])
