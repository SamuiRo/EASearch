"use strict";

/**
 * EASearch — Brave Search Provider
 *
 * Implements the standard provider interface:
 *   provider.name        {string}
 *   provider.modes       {string[]}  — supported search modes
 *   provider.isAvailable()           — returns true if API key is present
 *   provider.search(opts)            — runs search, returns formatted string
 *
 * Environment:
 *   BRAVE_API_KEY  — required
 */

const NAME = "brave";

// ─── Language / Country mapping ───────────────────────────────────────────────
const LANG_MAP = {
  ua: { search_lang: "uk",      country: "ua", ui_lang: "uk-UA", label: "Ukrainian" },
  uk: { search_lang: "uk",      country: "ua", ui_lang: "uk-UA", label: "Ukrainian" },
  en: { search_lang: "en",      country: "us", ui_lang: "en-US", label: "English" },
  ja: { search_lang: "ja",      country: "jp", ui_lang: "ja-JP", label: "Japanese" },
  ko: { search_lang: "ko",      country: "kr", ui_lang: "ko-KR", label: "Korean" },
  de: { search_lang: "de",      country: "de", ui_lang: "de-DE", label: "German" },
  fr: { search_lang: "fr",      country: "fr", ui_lang: "fr-FR", label: "French" },
  pl: { search_lang: "pl",      country: "pl", ui_lang: "pl-PL", label: "Polish" },
  es: { search_lang: "es",      country: "es", ui_lang: "es-ES", label: "Spanish" },
  it: { search_lang: "it",      country: "it", ui_lang: "it-IT", label: "Italian" },
  pt: { search_lang: "pt",      country: "br", ui_lang: "pt-BR", label: "Portuguese" },
  ru: { search_lang: "ru",      country: "ru", ui_lang: "ru-RU", label: "Russian" },
  zh: { search_lang: "zh-hans", country: "cn", ui_lang: "zh-CN", label: "Chinese" },
  ar: { search_lang: "ar",      country: "sa", ui_lang: "ar-SA", label: "Arabic" },
  tr: { search_lang: "tr",      country: "tr", ui_lang: "tr-TR", label: "Turkish" },
  nl: { search_lang: "nl",      country: "nl", ui_lang: "nl-NL", label: "Dutch" },
  sv: { search_lang: "sv",      country: "se", ui_lang: "sv-SE", label: "Swedish" },
  cs: { search_lang: "cs",      country: "cz", ui_lang: "cs-CZ", label: "Czech" },
  ro: { search_lang: "ro",      country: "ro", ui_lang: "ro-RO", label: "Romanian" },
  hu: { search_lang: "hu",      country: "hu", ui_lang: "hu-HU", label: "Hungarian" },
  fi: { search_lang: "fi",      country: "fi", ui_lang: "fi-FI", label: "Finnish" },
  no: { search_lang: "no",      country: "no", ui_lang: "nb-NO", label: "Norwegian" },
  da: { search_lang: "da",      country: "dk", ui_lang: "da-DK", label: "Danish" },
  he: { search_lang: "he",      country: "il", ui_lang: "he-IL", label: "Hebrew" },
  vi: { search_lang: "vi",      country: "vn", ui_lang: "vi-VN", label: "Vietnamese" },
  th: { search_lang: "th",      country: "th", ui_lang: "th-TH", label: "Thai" },
};

const ENDPOINTS = {
  web:    "https://api.search.brave.com/res/v1/web/search",
  llm:    "https://api.search.brave.com/res/v1/llm/context",
  news:   "https://api.search.brave.com/res/v1/news/search",
  images: "https://api.search.brave.com/res/v1/images/search",
  video:  "https://api.search.brave.com/res/v1/videos/search",
};

// ─── Utilities ────────────────────────────────────────────────────────────────
const SEP  = "━".repeat(54);
const THIN = "─".repeat(54);

function stripHtml(str) {
  if (!str) return "";
  return str
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
}

function fmtDate(raw) {
  if (!raw) return null;
  try { return new Date(raw).toISOString().split("T")[0]; } catch { return String(raw); }
}

function truncate(str, max = 280) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max).trimEnd() + "…";
}

function getHostname(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

function langLabel(lang) {
  if (!lang) return "auto";
  return LANG_MAP[lang.toLowerCase()]?.label ?? lang;
}

// ─── HTTP fetch with auto-retry on 429 ───────────────────────────────────────
async function fetchWithRetry(url, headers, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429 && attempt < retries) {
        const wait = 1200 * (attempt + 1);
        process.stderr.write(`⏳ [brave] Rate limit (429) — waiting ${wait}ms...\n`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
}

// ─── URL builder ─────────────────────────────────────────────────────────────
function buildUrl(opts) {
  const params   = new URLSearchParams();
  const langInfo = opts.lang ? LANG_MAP[opts.lang.toLowerCase()] : null;

  params.set("q", opts.query);

  if (opts.mode === "llm") {
    if (langInfo) {
      params.set("search_lang", langInfo.search_lang);
      params.set("country",     langInfo.country);
    }
    params.set("max_results",  String(Math.min(50, opts.count * 3)));
    params.set("max_urls",     String(opts.urls));
    params.set("context_size", String(opts.tokens));
    params.set("threshold",    opts.threshold);
    if (opts.fresh)                    params.set("freshness",  opts.fresh);
    if (opts.safe !== "moderate")      params.set("safesearch", opts.safe);
  } else {
    params.set("count", String(opts.count));
    if (opts.offset > 0)               params.set("offset",     String(opts.offset));
    if (opts.safe !== "moderate")      params.set("safesearch", opts.safe);
    if (opts.fresh)                    params.set("freshness",  opts.fresh);
    if (langInfo) {
      params.set("search_lang", langInfo.search_lang);
      params.set("country",     langInfo.country);
      params.set("ui_lang",     langInfo.ui_lang);
    }
    if (opts.mode === "web" && opts.snippets) params.set("extra_snippets", "true");
  }

  return `${ENDPOINTS[opts.mode]}?${params.toString()}`;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatLlm(data, opts, elapsed) {
  const lines = [];
  lines.push(`🧠 Brave LLM Context: "${opts.query}"`);
  lines.push(`   lang: ${langLabel(opts.lang)}  |  tokens: ~${opts.tokens}  |  urls: ${opts.urls}  |  threshold: ${opts.threshold}`);
  lines.push(SEP);

  const generic = data?.grounding?.generic ?? [];
  const sources = data?.grounding?.sources ?? {};

  if (generic.length === 0) {
    lines.push("❌ LLM Context returned no content. Try --mode web, adjust the query, or remove --threshold strict.");
    return lines.join("\n");
  }

  // Group chunks by source URL
  const byUrl = new Map();
  for (const chunk of generic) {
    const u = chunk.url || "unknown";
    if (!byUrl.has(u)) byUrl.set(u, []);
    byUrl.get(u).push(chunk);
  }

  let idx = 0;
  for (const [url, chunks] of byUrl) {
    idx++;
    const meta     = sources[url] ?? {};
    const title    = stripHtml(meta.title ?? chunks[0]?.title ?? url);
    const host     = meta.hostname ?? getHostname(url);
    const date     = fmtDate(meta.page_age ?? meta.last_updated);
    const siteMeta = [host, date].filter(Boolean).join("  ·  ");

    lines.push(`\n[${idx}] ${title}`);
    lines.push(`    🔗 ${url}`);
    if (siteMeta) lines.push(`    📌 ${siteMeta}`);
    lines.push("");

    for (const chunk of chunks) {
      const type    = chunk.type ?? "text";
      const header  = stripHtml(chunk.header ?? "");
      const rawText = chunk.text ?? chunk.content ?? "";
      const text    = stripHtml(rawText);

      if (!text && !header) continue;

      switch (type) {
        case "heading":
          lines.push(`    ### ${header || text}`);
          break;
        case "code": {
          const lang      = chunk.language ?? "";
          const codeLines = rawText.split("\n");
          const limit     = 50;
          lines.push(`    \`\`\`${lang}`);
          codeLines.slice(0, limit).forEach((cl) => lines.push(`    ${cl}`));
          if (codeLines.length > limit) lines.push(`    … (+${codeLines.length - limit} more lines)`);
          lines.push("    ```");
          break;
        }
        case "table":
          if (header) lines.push(`    **${header}**`);
          lines.push(text.split("\n").map((l) => `    ${l}`).join("\n"));
          break;
        case "list":
          if (header) lines.push(`    **${header}**`);
          text.split("\n").filter(Boolean).forEach((item) => lines.push(`    • ${item.replace(/^[-*•]\s*/, "")}`));
          break;
        default: // text / paragraph
          if (header) lines.push(`    **${header}**`);
          lines.push(`    ${text.replace(/\n{2,}/g, "\n\n    ").replace(/\n/g, "\n    ")}`);
      }
      lines.push("");
    }

    if (idx < byUrl.size) lines.push(THIN);
  }

  // Local POI (for location-aware queries)
  const poi = data?.grounding?.poi ?? [];
  if (poi.length > 0) {
    lines.push("\n" + THIN);
    lines.push("📍 Local results (POI):");
    poi.slice(0, 6).forEach((p, i) => {
      lines.push(`   [${i + 1}] ${p.name ?? ""}`);
      if (p.address) lines.push(`       📍 ${p.address}`);
      if (p.phone)   lines.push(`       📞 ${p.phone}`);
      if (p.rating)  lines.push(`       ⭐ ${p.rating}`);
      if (p.url)     lines.push(`       🔗 ${p.url}`);
    });
  }

  lines.push("\n" + SEP);
  lines.push(`✅ LLM Context done in ${elapsed}s  ·  ${byUrl.size} sources  ·  ~${opts.tokens} tokens`);
  return lines.join("\n");
}

function formatWeb(data, opts, elapsed) {
  const results = data?.web?.results ?? [];
  const query   = data?.query?.original ?? opts.query;
  const lines   = [];

  lines.push(`🔍 Brave Web: "${query}"  [lang: ${langLabel(opts.lang)}]  [results: ${results.length}]`);
  lines.push(SEP);

  if (!results.length) { lines.push("❌ No results found."); return lines.join("\n"); }

  results.forEach((r, i) => {
    const title = stripHtml(r.title ?? "No title");
    const desc  = truncate(stripHtml(r.description ?? ""), 240);
    const url   = r.url ?? "";
    const date  = fmtDate(r.page_age);

    lines.push(`\n[${i + 1}] ${title}`);
    lines.push(`    🔗 ${url}`);
    if (desc) lines.push(`    📄 ${desc}`);
    if (date) lines.push(`    📅 ${date}`);

    if (r.extra_snippets?.length) {
      r.extra_snippets.slice(0, 2)
        .map((s) => truncate(stripHtml(s), 180))
        .filter(Boolean)
        .forEach((s) => lines.push(`    💬 ${s}`));
    }
  });

  if (data?.infobox?.results?.[0]) {
    const ib = data.infobox.results[0];
    lines.push("\n" + THIN);
    lines.push(`📦 Infobox: ${stripHtml(ib.title ?? "")}`);
    if (ib.description) lines.push(`   ${truncate(stripHtml(ib.description), 320)}`);
    if (ib.url) lines.push(`   🔗 ${ib.url}`);
  }

  if (data?.faq?.results?.length) {
    lines.push("\n" + THIN);
    lines.push("❓ FAQ:");
    data.faq.results.slice(0, 3).forEach((f) => {
      lines.push(`   Q: ${stripHtml(f.question)}`);
      lines.push(`   A: ${truncate(stripHtml(f.answer), 220)}`);
    });
  }

  lines.push("\n" + SEP);
  lines.push(`✅ Search done in ${elapsed}s`);
  return lines.join("\n");
}

function formatNews(data, opts, elapsed) {
  const results = data?.results ?? [];
  const lines   = [];

  lines.push(`📰 Brave News: "${opts.query}"  [lang: ${langLabel(opts.lang)}]  [results: ${results.length}]`);
  lines.push(SEP);

  if (!results.length) { lines.push("❌ No news found."); return lines.join("\n"); }

  results.forEach((r, i) => {
    const title  = stripHtml(r.title ?? "No title");
    const desc   = truncate(stripHtml(r.description ?? ""), 220);
    const url    = r.url ?? "";
    const date   = fmtDate(r.age ?? r.page_age);
    const source = r.meta_url?.hostname ?? r.source ?? "";

    lines.push(`\n[${i + 1}] ${title}`);
    lines.push(`    🔗 ${url}`);
    if (source) lines.push(`    📰 ${source}`);
    if (desc)   lines.push(`    📄 ${desc}`);
    if (date)   lines.push(`    📅 ${date}`);
  });

  lines.push("\n" + SEP);
  lines.push(`✅ Search done in ${elapsed}s`);
  return lines.join("\n");
}

function formatImages(data, opts, elapsed) {
  const results = data?.results ?? [];
  const lines   = [];

  lines.push(`🖼️  Brave Images: "${opts.query}"  [results: ${results.length}]`);
  lines.push(SEP);

  if (!results.length) { lines.push("❌ No images found."); return lines.join("\n"); }

  results.forEach((r, i) => {
    const title = stripHtml(r.title ?? "");
    const src   = r.url ?? r.properties?.url ?? "";
    const page  = r.source ?? r.page_url ?? "";
    const dims  = r.properties?.width && r.properties?.height
      ? `${r.properties.width}×${r.properties.height}`
      : "";

    lines.push(`\n[${i + 1}] ${title}`);
    lines.push(`    🖼  ${src}`);
    if (page) lines.push(`    🔗 ${page}`);
    if (dims) lines.push(`    📐 ${dims}`);
  });

  lines.push("\n" + SEP);
  lines.push(`✅ Search done in ${elapsed}s`);
  return lines.join("\n");
}

function formatVideo(data, opts, elapsed) {
  const results = data?.results ?? [];
  const lines   = [];

  lines.push(`🎬 Brave Video: "${opts.query}"  [results: ${results.length}]`);
  lines.push(SEP);

  if (!results.length) { lines.push("❌ No videos found."); return lines.join("\n"); }

  results.forEach((r, i) => {
    const title    = stripHtml(r.title ?? "No title");
    const url      = r.url ?? "";
    const desc     = truncate(stripHtml(r.description ?? ""), 180);
    const duration = r.video?.duration ?? "";
    const views    = r.video?.views ? `${Number(r.video.views).toLocaleString()} views` : "";
    const date     = fmtDate(r.age);

    lines.push(`\n[${i + 1}] ${title}`);
    lines.push(`    🔗 ${url}`);
    if (desc) lines.push(`    📄 ${desc}`);
    const meta = [duration, views, date].filter(Boolean).join("  ·  ");
    if (meta) lines.push(`    ℹ️  ${meta}`);
  });

  lines.push("\n" + SEP);
  lines.push(`✅ Search done in ${elapsed}s`);
  return lines.join("\n");
}

// ─── Provider interface ───────────────────────────────────────────────────────

function isAvailable() {
  return Boolean(process.env.BRAVE_API_KEY?.trim());
}

async function search(opts) {
  const apiKey = process.env.BRAVE_API_KEY;

  if (!ENDPOINTS[opts.mode]) {
    throw new Error(`[brave] Unknown mode: "${opts.mode}". Available: ${Object.keys(ENDPOINTS).join(", ")}`);
  }
  if (opts.lang && !LANG_MAP[opts.lang.toLowerCase()]) {
    process.stderr.write(`⚠️  [brave] Unknown lang code: "${opts.lang}" — ignoring.\n`);
    opts = { ...opts, lang: null };
  }

  const url     = buildUrl(opts);
  const headers = {
    Accept:                 "application/json",
    "Accept-Encoding":      "gzip",
    "X-Subscription-Token": apiKey,
  };

  const modeLabel = opts.mode === "llm"
    ? `LLM Context [tokens=${opts.tokens}, urls=${opts.urls}, threshold=${opts.threshold}]`
    : opts.mode;
  process.stderr.write(
    `🔎 [brave] ${modeLabel}: "${opts.query}"` +
    (opts.lang  ? ` [${opts.lang}]`        : "") +
    (opts.fresh ? ` [fresh=${opts.fresh}]` : "") + "\n"
  );

  const t0  = Date.now();
  const res = await fetchWithRetry(url, headers);

  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch {}
    const msg = {
      401: "Invalid API key (401). Check BRAVE_API_KEY in your .env file.",
      403: "Access denied (403). Check your plan: https://api-dashboard.search.brave.com/app/plans",
      422: `Invalid request parameters (422): ${body}`,
      429: "Rate limit exceeded (429). Wait or upgrade your plan.",
      500: "Internal server error (500). Try again later.",
    }[res.status] ?? `HTTP error ${res.status}: ${body}`;
    throw new Error(`[brave] ${msg}`);
  }

  const data    = await res.json();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  if (opts.json) return JSON.stringify(data, null, 2);

  return opts.mode === "llm"    ? formatLlm(data, opts, elapsed)
       : opts.mode === "news"   ? formatNews(data, opts, elapsed)
       : opts.mode === "images" ? formatImages(data, opts, elapsed)
       : opts.mode === "video"  ? formatVideo(data, opts, elapsed)
       :                          formatWeb(data, opts, elapsed);
}

module.exports = {
  name:        NAME,
  modes:       Object.keys(ENDPOINTS),
  isAvailable,
  search,
};
