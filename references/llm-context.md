# LLM Context — How the agent should work with EASearch results

> Read this file before synthesizing a response to the user based on search results.

---

## When to use which mode

| Mode | Flag | When |
|------|------|------|
| **LLM Context** | `--mode llm` | Research, deep questions, technical details, RAG grounding |
| **Web** | `--mode web` (default) | Quick facts, navigation, link overview, topic scanning |
| **News** | `--mode news` | Current events, announcements, recent articles |
| **Images** | `--mode images` | Need image URLs |
| **Video** | `--mode video` | Video content, YouTube tutorials |

---

## What is the LLM Context API (`--mode llm`)

Endpoint `/res/v1/llm/context` — launched by Brave on February 12, 2026. Instead of links and snippets it:

1. Runs a search across the Brave index (30B+ pages)
2. Opens the top pages from the results
3. Extracts content: text, tables, code, lists, headings
4. Ranks and compiles "smart chunks" by relevance to the query
5. Returns a ready context in a format optimized for LLMs

**Result:** the agent receives real article content without needing to make separate page fetch requests. Brave handles the fetching, extraction, and ranking.

---

## Search strategies

### `web` mode — for simple queries
```bash
node easearch.js "capital of Japan" --lang en --count 3
```
Returns links + descriptions. Agent synthesizes an answer from snippets.

### `llm` mode — for complex queries
```bash
node easearch.js "TypeScript 5.5 new features" --mode llm --lang en
```
Returns extracted text from the top 5 pages. Agent receives full explanations, tables, code examples.

### Cascaded strategy for very complex topics
```bash
# Step 1: quick overview
node easearch.js "React vs Svelte 2025" --mode web --lang en --count 5

# Step 2: deep research
node easearch.js "React vs Svelte 2025 performance comparison" --mode llm --lang en --tokens 16384

# Step 3: latest news
node easearch.js "Svelte 5 release" --mode news --lang en --fresh pm
```

---

## Interpreting LLM Context fields

### `grounding.generic` — main chunk array

Each chunk has:
- `url` — source (cross-reference with `sources` for metadata)
- `type` — `text` / `code` / `table` / `list` / `heading`
- `text` or `content` — the actual content
- `header` — section heading (if present)
- `language` — content language

**Important:** chunks from the same URL are ordered by relevance. First chunks are most important.

### `grounding.sources` — URL metadata

```json
{
  "https://example.com": {
    "title": "Page title",
    "hostname": "example.com",
    "page_age": "2025-04-10T12:00:00"
  }
}
```

Use `page_age` to assess freshness. If absent — the source may be outdated.

### `grounding.poi` — local businesses / places

Appears for queries like "coffee near me" or "restaurants in Kyiv". Contains name, address, phone, rating.

---

## Response templates

### Factual question (`--mode web`)
```
Based on Brave Search:

**[Main fact]** — 1-2 sentences.

Details:
- [Detail 1] ([Source](URL))
- [Detail 2] ([Source](URL))

*Current as of: [page_age of the freshest source]*
```

### Technical question (`--mode llm`)
```
Found content from N sources.

**[Answer / explanation]**

[Detailed write-up from LLM Context — up to 3-4 paragraphs]

**Key sources:**
1. [Title](URL) — [why useful]
2. [Title](URL)

*Data: Brave LLM Context, [count] tokens of context*
```

### News (`--mode news`)
```
**Latest news on "[topic]":**

📰 [Headline] · [hostname] · [date]
   [1-2 sentence summary]

📰 ...
```

---

## Choosing `--tokens` and `--threshold`

### `--tokens` (context_size)
- `2048–4096` → fast, for simple facts
- `8192` → default, good for most queries
- `16384–32768` → for deep research, technical details, documentation

More tokens = more content = longer API response. Match to query complexity.

### `--threshold`
- `strict` → only the most relevant chunks. Less noise, but may miss useful content
- `balanced` → balance of relevance and coverage (default)
- `lenient` → maximum coverage, may include less relevant content

---

## Edge cases

### No results (`--mode llm`)
```bash
# Try a looser threshold
node easearch.js "query" --mode llm --threshold lenient

# Or more URLs
node easearch.js "query" --mode llm --urls 10

# Or switch to web
node easearch.js "query" --mode web
```

### Stale content
If `page_age` > 6 months for technical topics:
```bash
node easearch.js "query" --mode llm --fresh py
```

### Conflicting information
If different LLM Context sources contradict each other — tell the user and present all versions with sources. Do not pick one version on your own.

---

## Limitations

1. **LLM Context** — requires a Search plan subscription. Check at https://api-dashboard.search.brave.com/app/plans
2. **Token limit** — 32768 maximum per request
3. **Privacy** — Brave does not store queries or use them for model training
4. **Language** — `--lang en` means priority; Brave may include pages in other languages if more relevant
5. **Rate limit** — on 429 the script auto-retries with a pause. If that doesn't help — wait or check your plan

---

## Full agent workflow example (LLM Context)

```
Question: "How to set up TypeScript with ESLint in 2025?"

Step 1: LLM Context for main content
  → node easearch.js "TypeScript ESLint setup 2025" \
       --mode llm --lang en --tokens 12288 --urls 6 --fresh py

  Agent receives:
  - Extracted text from TypeScript documentation
  - Config files from GitHub repositories
  - Tables comparing eslint-plugin-ts versions
  - Code examples from real projects

Step 2: (if needed) Fresh updates
  → node easearch.js "ESLint TypeScript 2025 changes" \
       --mode news --lang en --fresh pm

Step 3: Synthesize response
  - Step-by-step instructions with source links
  - Config files (from code chunks)
  - Freshness caveat if sources are older
```
