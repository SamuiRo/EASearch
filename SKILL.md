---
name: easearch
description: >
  Multi-provider web search for OpenClaw. Use this skill ALWAYS when the agent needs
  current information from the web: news, articles, technical docs, images, video.
  Triggers: "find", "search", "look up", "what's new about", "latest", "current",
  any query requiring fresh data from the web. Supports language targeting (--lang ua,
  --lang en, --lang ja, --lang ko, etc.), LLM Context mode (--mode llm) which returns
  pre-extracted page text ready for grounding — ideal for deep research without extra
  fetch requests, plus news (--news), images (--images), video (--video), and
  freshness filtering (--fresh pd/pw/pm/py).
---

# EASearch — OpenClaw Skill

Multi-provider search tool. Primary provider: **Brave Search** (30B+ page index, independent of Google/Bing).
Fallback provider: **DuckDuckGo** (scraping-based, no API key required — supports web, news, images).
Automatic fallback to next available provider on failure.

---

## Invocation

```bash
node easearch.js "<query>" [options]
```

## Options

| Flag | Values | Description |
|------|--------|-------------|
| `--lang <code>` | `ua` `en` `ja` `ko` `de` `fr` `pl`… | Result language |
| `--mode <type>` | `web` / `llm` / `news` / `images` / `video` | Search mode (default: `web`) |
| `--news` / `--images` / `--video` | — | Shortcut for `--mode` |
| `--provider <n>` | `brave` `duckduckgo` | Force a specific provider, skip fallback |
| `--no-fallback` | — | Disable automatic provider fallback |
| `--count <N>` | 1–20 (default 10) | Number of results |
| `--fresh <period>` | `pd` `pw` `pm` `py` | Freshness: day/week/month/year |
| `--tokens <N>` | 512–32768 (default 8192) | Token limit for `--mode llm` |
| `--urls <N>` | 1–20 (default 5) | Source count for `--mode llm` |
| `--threshold` | `strict` / `balanced` / `lenient` | Relevance threshold for `--mode llm` |
| `--offset <N>` | 0–9 | Pagination |
| `--safe <level>` | `off` / `moderate` / `strict` | Content filter |
| `--json` | — | Raw JSON output (debug) |
| `--no-snippets` | — | Skip extra_snippets (web mode) |

---

## When to use which mode

| Query type | Command |
|------------|---------|
| Quick facts, navigation, link overview | `--mode web` (default) |
| Research, technical details, RAG grounding | `--mode llm` ⭐ |
| Current events, announcements | `--mode news` |
| Image URLs | `--mode images` |
| Video / tutorials | `--mode video` |

### `--mode llm` — details

Brave opens top pages and returns extracted content: text, tables, code, lists.
Agent receives full article content without additional fetch requests.

| Scenario | Parameters |
|----------|-----------|
| Quick fact | `--tokens 2048 --urls 3 --threshold strict` |
| General research | *(defaults)* |
| Deep analysis | `--tokens 16384 --urls 10 --threshold lenient` |
| Technical docs | `--tokens 32768 --urls 8` |

---

## Examples

```bash
# Web search
node easearch.js "Claude AI new features" --lang en

# LLM Context — full page text
node easearch.js "TypeScript 5.5 new features" --mode llm --lang en

# Deep research
node easearch.js "quantum computing fundamentals" --mode llm --lang en --tokens 16384 --urls 8

# Latest news
node easearch.js "AI news" --news --lang en --fresh pw

# Force provider / disable fallback
node easearch.js "search query" --provider brave --no-fallback
node easearch.js "search query" --provider duckduckgo
```

---

## Agent config (`agent.json`)

```json
{
  "tools": [
    {
      "name": "easearch",
      "description": "Multi-provider web search. Modes: --mode web (links+snippets), --mode llm (pre-extracted page text, ideal for research), --news, --images, --video. Flags: --lang, --fresh, --count, --tokens, --urls.",
      "command": "node /path/to/easearch/easearch.js",
      "args_schema": {
        "query": "search string",
        "flags": "additional flags"
      }
    }
  ]
}
```

---

## Error handling

| Code / situation | Action |
|------------------|--------|
| `401` | Check `BRAVE_API_KEY` in `.env` |
| `429` | Script auto-retries; if persists — wait or upgrade plan |
| `422` | Check query syntax |
| No LLM results | Try `--threshold lenient` or switch to `--mode web` |
| DDG no results | Selector may have changed — check `providers/duckduckgo.js` |
| DDG blocked | Reduce request frequency; built-in UA rotation helps |
| Provider failure | Fallback runs automatically; use `--provider brave` or `--provider duckduckgo` to force |

---

## Reference files

- `references/api-reference.md` — full parameter list, language/country codes, JSON response structure
- `references/llm-context.md` — search strategies, result interpretation, response templates
- `providers/README.md` — how to add a new search provider