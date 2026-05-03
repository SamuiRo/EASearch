# EASearch

Multi-provider search skill for [OpenClaw](https://github.com/openclaw).
Pluggable provider architecture — start with **Brave Search**, add more providers (DuckDuckGo, Bing, etc.) as needed with zero changes to the core router.

---

## Structure

```
easearch/
├── SKILL.md                  ← agent entry point (OpenClaw reads this)
├── README.md                 ← this file
├── easearch.js               ← main router — provider selection & fallback
├── .env.example              ← API key template
├── providers/
│   ├── brave.js              ← Brave Search provider (primary)
│   ├── duckduckgo.js         ← DuckDuckGo provider (fallback, no API key)
│   └── README.md             ← how to add a new provider
└── references/
    ├── api-reference.md      ← Brave API parameter reference
    └── llm-context.md        ← LLM Context strategies & response templates
```

---

## Installation

### 1. Dependencies

```bash
cd easearch
npm install
```

> Node.js ≥ 18 has `fetch` built-in. Dependencies (`dotenv`, `cheerio`) are installed automatically via `npm install`.

### 2. API key

```bash
cp .env.example .env
```

Open `.env` and fill in your key:

```
BRAVE_API_KEY=your_key_here
```

Get a key at: <https://api-dashboard.search.brave.com/register>

> `.env` is already in `.gitignore`. Never commit it.

### 3. Verify

```bash
node easearch.js "hello world" --lang en --count 3
```

---

## Usage

```bash
node easearch.js "<query>" [options]
```

### Modes

| Mode | Flag | When to use |
|------|------|-------------|
| Web (default) | `--mode web` | Quick facts, navigation, link overview |
| LLM Context | `--mode llm` | Research, technical details — Brave returns full extracted page text |
| News | `--news` | Current events and announcements |
| Images | `--images` | Image URLs |
| Video | `--video` | Videos and tutorials |

### Examples

```bash
# Web search
node easearch.js "new Claude features" --lang en

# LLM Context — get full article text
node easearch.js "TypeScript 5.5 new features" --mode llm --lang en

# Deep research with larger context
node easearch.js "Rust ownership system" --mode llm --lang en --tokens 16384 --urls 8

# Fresh news from the past week
node easearch.js "AI news" --news --lang en --fresh pw

# Force a specific provider
node easearch.js "search query" --provider brave
node easearch.js "search query" --provider duckduckgo
```

### All options

| Flag | Values | Description |
|------|--------|-------------|
| `--lang <code>` | `ua` `en` `ja` `ko` `de` `fr` `pl`… | Result language |
| `--mode <type>` | `web` `llm` `news` `images` `video` | Search mode |
| `--provider <n>` | `brave` `duckduckgo` | Force a specific provider |
| `--no-fallback` | — | Disable automatic provider fallback |
| `--count <N>` | 1–20 | Number of results (default 10) |
| `--fresh <period>` | `pd` `pw` `pm` `py` | Freshness: day/week/month/year |
| `--tokens <N>` | 512–32768 | Token limit for `--mode llm` (default 8192) |
| `--urls <N>` | 1–20 | Source count for `--mode llm` (default 5) |
| `--threshold` | `strict` `balanced` `lenient` | Relevance threshold for `--mode llm` |
| `--offset <N>` | 0–9 | Pagination |
| `--safe <level>` | `off` `moderate` `strict` | Content filter |
| `--json` | — | Raw JSON output (debug) |
| `--no-snippets` | — | Skip extra_snippets (speeds up web mode) |

---

## Providers

| Provider | Priority | API key | Modes | Notes |
|----------|----------|---------|-------|-------|
| **Brave** | Primary | `BRAVE_API_KEY` (required) | web, llm, news, images, video | Full-featured, 30B+ index |
| **DuckDuckGo** | Fallback | — (no key needed) | web, news, images | Scraping-based; no llm/video |

The router tries providers in order (`PROVIDER_ORDER` in `easearch.js`). A provider is skipped if it's unavailable or doesn't support the requested mode. To add more providers, see [`providers/README.md`](providers/README.md).

> **Note:** DuckDuckGo uses web scraping — its HTML structure may change without notice. If results stop working, check for selector changes in `providers/duckduckgo.js`.

---

## API key security

The script searches for `.env` automatically — starting from the script's directory and walking up to the project root. Priority: `.env` file → shell environment variable (`export BRAVE_API_KEY=...`).

Rules:
- **Never** hardcode keys in source files
- **Never** commit `.env` to git (it's in `.gitignore`)
- `.env.example` (no real keys) is safe and should be committed
- Revoke a compromised key at <https://api-dashboard.search.brave.com>

---

## Plans & limits (Brave)

| Plan | Requests/month | LLM Context | Extra snippets |
|------|---------------|-------------|----------------|
| Free | 2,000 | ✅ | ❌ |
| Base | 20,000 | ✅ | ❌ |
| Base AI | 20,000 | ✅ | ✅ |
| Pro | 100,000 | ✅ | ❌ |
| Pro AI | 100,000 | ✅ | ✅ |

Details: <https://api-dashboard.search.brave.com/app/plans>

**DuckDuckGo** — no account or limits; subject to scraping rate limits if requests are too frequent.

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `BRAVE_API_KEY not set` | No `.env` or env var | Add key to `.env` in project root |
| `401` | Invalid Brave key | Check value in `.env` |
| `429` | Rate limit (Brave or DDG) | Wait; for Brave — upgrade plan |
| `ENOTFOUND` | No network | Check connection |
| LLM no results | Threshold too strict | Try `--threshold lenient` or `--mode web` |
| DDG no results | Selector changed | Update selectors in `providers/duckduckgo.js` |
| DDG blocked | Bot detection triggered | Reduce request frequency; UA rotation is built-in |
| Provider failed | API / scrape error | Fallback runs automatically |