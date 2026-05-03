"use strict";

/**
 * EASearch — DuckDuckGo Provider (scraping-based, no API key required)
 *
 * Implements the standard provider interface:
 *   provider.name        {string}
 *   provider.modes       {string[]}  — supported modes: web, news, images
 *   provider.isAvailable()           — always true (no API key needed)
 *   provider.search(opts)            — runs search, returns formatted string
 *
 * Strategy:
 *   web   → scrapes https://html.duckduckgo.com/html/  (full result page, no JS)
 *   news  → scrapes https://html.duckduckgo.com/html/  with df (date filter) param
 *   images→ uses DuckDuckGo's internal JSON API (no auth required)
 *   llm   → NOT supported (throws → router falls back to next provider)
 *   video → NOT supported (throws → router falls back to next provider)
 *
 * AI Summary (vqd-based):
 *   Extracted separately from the "AI Search Assist" block if present.
 *   Selector targets: section.At_VJ9... ol li div ... .dyuE6BMumAPpqiH0dQVX
 *   (class names are hashed — matched by structure, not class)
 *
 * No external dependencies beyond cheerio (add to package.json: "cheerio": "^1.0.0")
 * No API key, no rate-limit tokens — DuckDuckGo HTML is freely accessible.
 *
 * Limitations:
 *   - DuckDuckGo may block aggressive scrapers; User-Agent rotation helps
 *   - HTML structure may change without notice (monitor .result__a selector)
 *   - No pagination (DuckDuckGo HTML returns ~10–30 results per page)
 *   - For high-volume use, add delay between requests
 */

const NAME = "duckduckgo";

// ─── Supported modes ──────────────────────────────────────────────────────────
const SUPPORTED_MODES = ["web", "news", "images"];

// ─── Language → DDG kl (region) mapping ──────────────────────────────────────
// kl controls both UI language and result region
const LANG_TO_KL = {
  ua: "uk-ua",   uk: "uk-ua",
  en: "us-en",
  ja: "jp-ja",
  ko: "kr-ko",
  de: "de-de",
  fr: "fr-fr",
  pl: "pl-pl",
  es: "es-es",
  it: "it-it",
  pt: "br-pt",
  ru: "ru-ru",
  zh: "cn-zh",
  ar: "xa-ar",
  tr: "tr-tr",
  nl: "nl-nl",
  sv: "se-sv",
  cs: "cz-cs",
  ro: "ro-ro",
  hu: "hu-hu",
  fi: "fi-fi",
  no: "no-no",
  da: "dk-da",
  he: "il-he",
  vi: "vn-vi",
  th: "th-th",
};

// ─── Freshness → DDG df (date filter) mapping ────────────────────────────────
const FRESH_TO_DF = {
  pd: "d",   // past day
  pw: "w",   // past week
  pm: "m",   // past month
  py: "y",   // past year
};

// ─── Safe search → DDG p param ───────────────────────────────────────────────
const SAFE_TO_P = {
  strict:   "1",
  moderate: "-1",
  off:      "-2",
};

// ─── User-Agent pool (rotate to reduce bot detection) ────────────────────────
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ─── Utilities ────────────────────────────────────────────────────────────────
const SEP  = "━".repeat(54);
const THIN = "─".repeat(54);

function stripHtml(str) {
  if (!str) return "";
  return str
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(str, max = 280) {
  if (!str || str.length <= max) return str;
  return str.slice(0, max).trimEnd() + "…";
}

function langLabel(lang) {
  const labels = {
    ua: "Ukrainian", en: "English", ja: "Japanese", ko: "Korean",
    de: "German", fr: "French", pl: "Polish", es: "Spanish",
    it: "Italian", pt: "Portuguese", ru: "Russian", zh: "Chinese",
  };
  return labels[lang?.toLowerCase()] ?? lang ?? "auto";
}

// ─── Cheerio loader (lazy require — only loaded when provider is called) ──────
function loadCheerio() {
  try {
    return require("cheerio");
  } catch {
    throw new Error(
      '[duckduckgo] cheerio is not installed. Run: npm install cheerio\n' +
      '   Then add "cheerio" to your package.json dependencies.'
    );
  }
}

// ─── HTTP fetch with retry ────────────────────────────────────────────────────
async function fetchPage(url, opts = {}) {
  const { method = "GET", body = null, retries = 2, referer = null } = opts;

  const headers = {
    "User-Agent":      randomUA(),
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control":   "no-cache",
    "DNT":             "1",
  };
  if (referer) headers["Referer"] = referer;
  if (method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { method, headers, body });

      if (res.status === 429 && attempt < retries) {
        const wait = 1500 * (attempt + 1);
        process.stderr.write(`⏳ [duckduckgo] Rate limit — waiting ${wait}ms...\n`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${url}`);
      }

      return await res.text();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
}

// ─── Build web/news search URL & POST body ────────────────────────────────────
// DuckDuckGo HTML endpoint accepts both GET and POST.
// POST is more reliable for special characters.
function buildParams(query, opts, isNews = false) {
  const kl = opts.lang ? (LANG_TO_KL[opts.lang.toLowerCase()] ?? "us-en") : "us-en";
  const df = opts.fresh ? (FRESH_TO_DF[opts.fresh] ?? "") : "";
  const p  = SAFE_TO_P[opts.safe] ?? "-1";

  const params = new URLSearchParams({
    q:  query,
    kl: kl,
    p:  p,
  });

  if (df)     params.set("df", df);
  if (isNews) params.set("iar", "news");   // filter to news results

  return params.toString();
}

// ─── Extract AI Summary block ─────────────────────────────────────────────────
// DuckDuckGo injects an "AI Search Assist" answer at the top of results.
// It's rendered via React so class names are hashed (e.g. "jGCddu2LyYnfu0nZZpiV").
// We can't rely on class names — instead we target the structural container
// that holds the AI answer text: the div directly inside the AI section's ol > li.
// Fallback: look for any block with data-dark-theme attribute that contains a <p>.
function extractAiSummary($) {
  let summary = null;
  let sources = [];

  // Strategy 1: target the known structural path
  // section[data-area] > ol > li > div > ... > div[containing p]
  $("section ol li").each((_, li) => {
    const $li = $(li);

    // Find a <p> inside a deeply nested div — this is the AI answer paragraph
    const $p = $li.find("div[class] p").first();
    if (!$p.length) return;

    const text = stripHtml($p.html() || "");
    if (text.length < 40) return;   // too short to be a real AI answer

    summary = text;

    // Extract source links from the same block
    $li.find("a[href]").each((_, a) => {
      const href  = $(a).attr("href") || "";
      const label = stripHtml($(a).text());
      if (href.startsWith("http") && label) {
        sources.push({ url: href, label });
      }
    });

    return false; // break .each
  });

  // Strategy 2: fallback — find any [data-dark-theme] containing <p>
  if (!summary) {
    $("[data-dark-theme]").each((_, el) => {
      const $el = $(el);
      const $p  = $el.find("p").first();
      if (!$p.length) return;

      const text = stripHtml($p.html() || "");
      if (text.length < 40) return;

      summary = text;

      $el.find("a[href]").each((_, a) => {
        const href  = $(a).attr("href") || "";
        const label = stripHtml($(a).text());
        if (href.startsWith("http") && label) {
          sources.push({ url: href, label });
        }
      });

      return false;
    });
  }

  return { summary, sources };
}

// ─── Parse web HTML results ───────────────────────────────────────────────────
function parseWebResults($, maxCount) {
  const results = [];

  // Primary selector: standard DDG HTML results
  $(".result.results_links, .result.web-result, .result.results_links_deep").each((_, el) => {
    if (results.length >= maxCount) return false;

    const $el   = $(el);
    const title = stripHtml($el.find(".result__a, .result__title a").first().text());
    const url   = $el.find(".result__a, .result__title a").first().attr("href") || "";
    const snippet = stripHtml(
      $el.find(".result__snippet, a.result__snippet").first().text() ||
      $el.find(".result__snippet").first().text()
    );
    const displayed = stripHtml($el.find(".result__url").first().text());
    const date = $el.find(".result__timestamp, .result__age").first().text().trim() || null;

    // Filter out ads and DDG internal links
    if (!title || !url) return;
    if (url.startsWith("//duckduckgo.com") || url.includes("duckduckgo.com/y.js")) return;

    results.push({ title, url, snippet, displayed, date });
  });

  // Fallback selector for lite.duckduckgo.com structure
  if (results.length === 0) {
    $("table.results tr").each((_, tr) => {
      if (results.length >= maxCount) return false;
      const $tr  = $(tr);
      const $a   = $tr.find("td a").first();
      const url  = $a.attr("href") || "";
      const title = stripHtml($a.text());
      const snippet = stripHtml($tr.find("td.result-snippet").text());
      if (!title || !url || url.startsWith("/")) return;
      results.push({ title, url, snippet, displayed: "", date: null });
    });
  }

  return results;
}

// ─── Parse news results ───────────────────────────────────────────────────────
function parseNewsResults($, maxCount) {
  const results = [];

  // News results use same structure but have a timestamp
  $(".result.results_links, .result.web-result").each((_, el) => {
    if (results.length >= maxCount) return false;

    const $el   = $(el);
    const title = stripHtml($el.find(".result__a").first().text());
    const url   = $el.find(".result__a").first().attr("href") || "";
    const snippet = stripHtml($el.find(".result__snippet, a.result__snippet").first().text());
    const source  = stripHtml($el.find(".result__url").first().text());
    const age     = $el.find(".result__timestamp, .result__age").first().text().trim() || null;

    if (!title || !url) return;
    if (url.startsWith("//duckduckgo.com")) return;

    results.push({ title, url, snippet, source, age });
  });

  return results;
}

// ─── Images: DuckDuckGo internal JSON API ─────────────────────────────────────
// DDG images use a 2-step process:
//   1. GET /html/?q=... → extract vqd token from the page
//   2. GET /i.js?q=...&vqd=<token> → returns JSON with image results
async function searchImages(opts) {
  const kl    = opts.lang ? (LANG_TO_KL[opts.lang.toLowerCase()] ?? "us-en") : "us-en";
  const p     = SAFE_TO_P[opts.safe] ?? "-1";

  // Step 1: get the page to extract vqd token
  const htmlUrl = `https://duckduckgo.com/?q=${encodeURIComponent(opts.query)}&kl=${kl}&iax=images&ia=images`;
  const html    = await fetchPage(htmlUrl);

  // vqd is embedded as: vqd="4-xxxxxxxx" or vqd='...'
  const vqdMatch = html.match(/vqd=["']([^"']+)["']/);
  if (!vqdMatch) {
    throw new Error("[duckduckgo] Could not extract vqd token for image search");
  }
  const vqd = vqdMatch[1];

  // Step 2: fetch image results JSON
  const imgParams = new URLSearchParams({
    q:          opts.query,
    kl:         kl,
    p:          p,
    vqd:        vqd,
    f:          ",,,,,",
    o:          "json",
    l:          kl,
  });

  const imgUrl  = `https://duckduckgo.com/i.js?${imgParams.toString()}`;
  const jsonRaw = await fetchPage(imgUrl, {
    referer: htmlUrl,
    headers: { Accept: "application/json" },
  });

  let data;
  try {
    data = JSON.parse(jsonRaw);
  } catch {
    throw new Error("[duckduckgo] Invalid JSON response from image API");
  }

  return (data.results ?? []).slice(0, opts.count).map((r) => ({
    title:  r.title ?? "",
    src:    r.image ?? "",
    thumb:  r.thumbnail ?? "",
    page:   r.url ?? "",
    width:  r.width ?? null,
    height: r.height ?? null,
    source: r.source ?? "",
  }));
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatWeb(results, aiBlock, query, opts, elapsed) {
  const lines = [];

  lines.push(`🦆 DuckDuckGo Web: "${query}"  [lang: ${langLabel(opts.lang)}]  [results: ${results.length}]`);
  lines.push(SEP);

  // AI Summary block (if present)
  if (aiBlock.summary) {
    lines.push("\n🤖 AI Answer:");
    lines.push(`   ${aiBlock.summary}`);
    if (aiBlock.sources.length > 0) {
      lines.push("   Sources: " + aiBlock.sources.map((s) => `${s.label} (${s.url})`).join(" · "));
    }
    lines.push("\n" + THIN);
  }

  if (!results.length) {
    lines.push("❌ No results found.");
    return lines.join("\n");
  }

  results.forEach((r, i) => {
    lines.push(`\n[${i + 1}] ${r.title}`);
    lines.push(`    🔗 ${r.url}`);
    if (r.displayed && r.displayed !== r.url) lines.push(`    🌐 ${r.displayed}`);
    if (r.snippet)  lines.push(`    📄 ${truncate(r.snippet, 240)}`);
    if (r.date)     lines.push(`    📅 ${r.date}`);
  });

  lines.push("\n" + SEP);
  lines.push(`✅ Search done in ${elapsed}s  ·  DuckDuckGo (no API key)`);
  return lines.join("\n");
}

function formatNews(results, query, opts, elapsed) {
  const lines = [];

  lines.push(`🦆 DuckDuckGo News: "${query}"  [lang: ${langLabel(opts.lang)}]  [results: ${results.length}]`);
  lines.push(SEP);

  if (!results.length) {
    lines.push("❌ No news results found.");
    return lines.join("\n");
  }

  results.forEach((r, i) => {
    lines.push(`\n[${i + 1}] ${r.title}`);
    lines.push(`    🔗 ${r.url}`);
    if (r.source)  lines.push(`    📰 ${r.source}`);
    if (r.snippet) lines.push(`    📄 ${truncate(r.snippet, 220)}`);
    if (r.age)     lines.push(`    📅 ${r.age}`);
  });

  lines.push("\n" + SEP);
  lines.push(`✅ Search done in ${elapsed}s  ·  DuckDuckGo News`);
  return lines.join("\n");
}

function formatImages(results, query, opts, elapsed) {
  const lines = [];

  lines.push(`🦆 DuckDuckGo Images: "${query}"  [results: ${results.length}]`);
  lines.push(SEP);

  if (!results.length) {
    lines.push("❌ No image results found.");
    return lines.join("\n");
  }

  results.forEach((r, i) => {
    const dims = r.width && r.height ? `${r.width}×${r.height}` : "";
    lines.push(`\n[${i + 1}] ${r.title}`);
    lines.push(`    🖼  ${r.src}`);
    if (r.page)   lines.push(`    🔗 ${r.page}`);
    if (r.source) lines.push(`    🌐 ${r.source}`);
    if (dims)     lines.push(`    📐 ${dims}`);
  });

  lines.push("\n" + SEP);
  lines.push(`✅ Search done in ${elapsed}s  ·  DuckDuckGo Images`);
  return lines.join("\n");
}

// ─── Provider interface ───────────────────────────────────────────────────────

function isAvailable() {
  // DuckDuckGo requires no API key — always available
  return true;
}

async function search(opts) {
  // Check mode support
  if (!SUPPORTED_MODES.includes(opts.mode)) {
    throw new Error(
      `[duckduckgo] Mode "${opts.mode}" is not supported. ` +
      `Supported: ${SUPPORTED_MODES.join(", ")}. ` +
      `For "llm" or "video" modes, use Brave Search (--provider brave).`
    );
  }

  // Images use a different path
  if (opts.mode === "images") {
    const t0      = Date.now();
    const results = await searchImages(opts);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

    process.stderr.write(
      `🔎 [duckduckgo] images: "${opts.query}"` +
      (opts.lang ? ` [${opts.lang}]` : "") + "\n"
    );

    return formatImages(results, opts.query, opts, elapsed);
  }

  // ── Web & News ──
  const cheerio  = loadCheerio();
  const isNews   = opts.mode === "news";
  const endpoint = "https://html.duckduckgo.com/html/";
  const body     = buildParams(opts.query, opts, isNews);

  process.stderr.write(
    `🔎 [duckduckgo] ${opts.mode}: "${opts.query}"` +
    (opts.lang  ? ` [${opts.lang}]`  : "") +
    (opts.fresh ? ` [fresh=${opts.fresh}]` : "") + "\n"
  );

  const t0   = Date.now();
  const html = await fetchPage(endpoint, { method: "POST", body });
  const $    = cheerio.load(html);

  // Extract AI summary (web mode only — news page doesn't show it)
  const aiBlock = !isNews
    ? extractAiSummary($)
    : { summary: null, sources: [] };

  const maxCount = opts.count;
  const elapsed  = ((Date.now() - t0) / 1000).toFixed(2);

  if (isNews) {
    const results = parseNewsResults($, maxCount);
    return formatNews(results, opts.query, opts, elapsed);
  } else {
    const results = parseWebResults($, maxCount);
    return formatWeb(results, aiBlock, opts.query, opts, elapsed);
  }
}

module.exports = {
  name:        NAME,
  modes:       SUPPORTED_MODES,
  isAvailable,
  search,
};