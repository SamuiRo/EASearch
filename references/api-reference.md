# Brave Search API — Parameter Reference

> Read this file when you need: advanced request configuration, non-standard parameters,
> JSON response structure, or debugging help.

---

## Endpoints

| Type | URL |
|------|-----|
| Web search | `https://api.search.brave.com/res/v1/web/search` |
| **LLM Context** | **`https://api.search.brave.com/res/v1/llm/context`** |
| News | `https://api.search.brave.com/res/v1/news/search` |
| Images | `https://api.search.brave.com/res/v1/images/search` |
| Video | `https://api.search.brave.com/res/v1/videos/search` |
| Local POI | `https://api.search.brave.com/res/v1/local/pois` (Pro plan) |

---

## LLM Context API (`--mode llm`)

Launched February 12, 2026. Instead of links and snippets, this endpoint opens the top search result pages and returns extracted content: paragraphs, tables, code blocks, structured data. Powers Ask Brave (22M answers/day).

### Parameters

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `q` | string | — | 400 chars, 50 words | Query (required) |
| `max_results` | int | 20 | 50 | Candidate pool size |
| `max_urls` | int | 5 | 20 | URLs to include in output |
| `context_size` | int | 8192 | 32768 | Token limit |
| `threshold` | string | `balanced` | — | `strict` / `balanced` / `lenient` |
| `max_snippets_per_url` | int | 50 | 100 | Chunks per URL |
| `max_tokens_per_url` | int | 4096 | 8192 | Tokens per URL |
| `max_snippets` | int | 50 | 100 | Total chunk count |
| `search_lang` | string | — | — | Result language (BCP 47) |
| `country` | string | — | — | Country code (ISO 3166-1) |
| `freshness` | string | — | — | `pd` / `pw` / `pm` / `py` |
| `safesearch` | string | `moderate` | — | `off` / `moderate` / `strict` |
| `goggles` | string | — | — | Goggle URL or inline definition |
| `enable_local` | bool | auto | — | Include local POI results |

### JSON response structure

```json
{
  "type": "llm_context",
  "grounding": {
    "generic": [
      {
        "url":      "https://example.com/page",
        "title":    "Page title",
        "type":     "text",
        "text":     "Extracted paragraph text...",
        "header":   "Section heading",
        "language": "en"
      },
      {
        "url":      "https://example.com/page",
        "type":     "code",
        "text":     "function hello() { return 'world'; }",
        "language": "javascript"
      },
      {
        "url":      "https://example.com/page",
        "type":     "table",
        "header":   "Comparison",
        "text":     "Col1 | Col2\n...",
        "language": "en"
      }
    ],
    "sources": {
      "https://example.com/page": {
        "title":        "Page title",
        "hostname":     "example.com",
        "page_age":     "2025-04-10T12:00:00",
        "last_updated": "2025-04-10T12:00:00"
      }
    },
    "poi": [],
    "map": null
  }
}
```

### Chunk types (`type` in `generic`)

| Type | Description |
|------|-------------|
| `text` | Plain paragraph |
| `code` | Code block (has `language` field) |
| `table` | Tabular structure |
| `list` | Bullet or numbered list |
| `heading` | Section heading |

### Context size recommendations

| Scenario | Parameters |
|----------|-----------|
| Quick fact | `--tokens 2048 --urls 3 --threshold strict` |
| General research | *(defaults)* |
| Deep analysis | `--tokens 16384 --urls 10 --threshold lenient` |
| Technical docs | `--tokens 32768 --urls 8 --threshold balanced` |

---

## Request headers

```
X-Subscription-Token: <API_KEY>   (required)
Accept: application/json
Accept-Encoding: gzip
```

---

## Web search parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | — | Search query (required) |
| `count` | int | 10 | Results count (1–20) |
| `offset` | int | 0 | Page offset (0–9) |
| `safesearch` | string | `moderate` | `off` / `moderate` / `strict` |
| `search_lang` | string | — | Result language (BCP 47) |
| `country` | string | — | Country code (ISO 3166-1 alpha-2) |
| `ui_lang` | string | — | UI language (BCP 47) |
| `freshness` | string | — | `pd` / `pw` / `pm` / `py` / `YYYY-MM-DDtoYYYY-MM-DD` |
| `result_filter` | string | — | Type filter: `web,news,discussions,faq,infobox,videos,locations` |
| `extra_snippets` | bool | false | Up to 5 additional snippets (AI plan) |
| `goggles` | string | — | Goggle URL or definition for re-ranking |
| `spellcheck` | int | 1 | Spell check (0/1) |
| `text_decorations` | int | 1 | HTML tags in text (0/1) |
| `units` | string | — | `metric` / `imperial` |

---

## Languages & regions

### search_lang codes

| Code | Language | Code | Language |
|------|----------|------|----------|
| `uk` | Ukrainian | `en` | English |
| `ja` | Japanese | `ko` | Korean |
| `de` | German | `fr` | French |
| `pl` | Polish | `es` | Spanish |
| `it` | Italian | `pt` | Portuguese |
| `ru` | Russian | `zh-hans` | Chinese (Simplified) |
| `zh-hant` | Chinese (Traditional) | `ar` | Arabic |
| `tr` | Turkish | `nl` | Dutch |
| `sv` | Swedish | `cs` | Czech |
| `ro` | Romanian | `hu` | Hungarian |
| `fi` | Finnish | `no` | Norwegian |
| `da` | Danish | `he` | Hebrew |
| `vi` | Vietnamese | `th` | Thai |

### country codes (ISO 3166-1 alpha-2)

```
ua  gb  us  jp  kr  de  fr  pl  es  it  pt  br  ru  cn  sa
tr  nl  se  cz  ro  hu  fi  no  dk  il  vn  th  au  ca  in
```

---

## Freshness

| Value | Description |
|-------|-------------|
| `pd` | Past 24 hours |
| `pw` | Past week |
| `pm` | Past month |
| `py` | Past year |
| `2024-01-01to2024-12-31` | Custom date range |

---

## JSON response structure (web)

```json
{
  "type": "search",
  "query": { "original": "query string", "language": "en", "country": "us" },
  "web": {
    "type": "search",
    "results": [
      {
        "title": "Page title",
        "url": "https://example.com",
        "description": "Page description...",
        "page_age": "2024-04-15T10:00:00",
        "language": "en",
        "extra_snippets": ["snippet 1", "snippet 2"],
        "meta_url": { "hostname": "example.com", "breadcrumb": "Example › Page" },
        "thumbnail": { "src": "https://..." }
      }
    ]
  },
  "news":        { "results": [...] },
  "videos":      { "results": [...] },
  "infobox":     { "results": [...] },
  "faq":         { "results": [...] },
  "discussions": { "results": [...] },
  "locations":   { "results": [...] }
}
```

---

## JSON response structure (news)

```json
{
  "type": "news",
  "results": [
    {
      "title": "Article headline",
      "url": "https://example.com/news",
      "description": "Short description...",
      "age": "3 hours ago",
      "page_age": "2024-04-18T07:00:00",
      "meta_url": { "hostname": "bbc.com" }
    }
  ]
}
```

---

## Error codes

| HTTP code | Meaning |
|-----------|---------|
| `200` | Success |
| `400` | Bad request |
| `401` | Invalid or missing API key |
| `403` | Insufficient permissions (check plan) |
| `422` | Invalid parameters |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

## Goggles — custom re-ranking

```
# Hacker News
https://raw.githubusercontent.com/brave/goggles-quickstart/main/goggles/hacker_news.goggle

# Academic sources only
https://raw.githubusercontent.com/brave/goggles-quickstart/main/goggles/academia.goggle

# News without clickbait
https://raw.githubusercontent.com/brave/goggles-quickstart/main/goggles/no-low-quality-news.goggle
```

---

## Plans & limits

| Plan | Requests/month | Extra snippets | Local POI |
|------|---------------|----------------|-----------|
| Free | 2,000 | ❌ | ❌ |
| Base | 20,000 | ❌ | ❌ |
| Pro | 100,000 | ❌ | ✅ |
| Base AI | 20,000 | ✅ | ❌ |
| Pro AI | 100,000 | ✅ | ✅ |

Details: https://api-dashboard.search.brave.com/app/plans
