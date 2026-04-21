#!/usr/bin/env node
/**
 * easearch.js — EASearch: multi-provider search tool for OpenClaw
 *
 * Usage:
 *   node easearch.js "<query>" [options]
 *
 * Modes (--mode):
 *   web      Classic web search — URLs, titles, snippets (default)
 *   llm      LLM Context — pre-extracted page text, ideal for grounding
 *   news     News search
 *   images   Image search
 *   video    Video search
 *
 * Options:
 *   --lang <code>         Language: ua, en, ja, ko, de, fr, pl, ...
 *   --mode <type>         web | llm | news | images | video
 *   --news                Shortcut for --mode news
 *   --images              Shortcut for --mode images
 *   --video               Shortcut for --mode video
 *   --provider <name>     Force a specific provider (brave, ...)
 *   --no-fallback         Disable automatic provider fallback
 *   --count <N>           Results 1–20 (default 10)
 *   --fresh <period>      pd|pw|pm|py — day/week/month/year
 *   --safe <level>        off|moderate|strict (default: moderate)
 *   --offset <N>          Pagination offset 0–9
 *   --tokens <N>          Max tokens for llm mode (512–32768, default 8192)
 *   --urls <N>            Max URLs for llm mode (1–20, default 5)
 *   --threshold <level>   strict|balanced|lenient (llm mode, default: balanced)
 *   --json                Raw JSON output (debug)
 *   --no-snippets         Skip extra_snippets (web mode)
 *
 * Environment (in .env or shell):
 *   BRAVE_API_KEY         Brave Search API key
 */

"use strict";

// ─── Load .env — searches upward from this file's directory ──────────────────
(function loadEnv() {
  try {
    const { config } = require("dotenv");
    const path       = require("path");
    const locations  = [
      path.resolve(__dirname, ".env"),
      path.resolve(__dirname, "..", ".env"),
      path.resolve(__dirname, "..", "..", ".env"),
      path.resolve(process.cwd(), ".env"),
    ];
    for (const p of locations) {
      const result = config({ path: p });
      if (!result.error) break;
    }
  } catch {
    // dotenv not installed — fall back to process.env (shell export)
  }
})();

// ─── Provider registry ────────────────────────────────────────────────────────
// Order determines fallback priority: first available provider that supports
// the requested mode will be used. Add new providers here as they are implemented.
const PROVIDER_ORDER = ["brave"];

const fs       = require("fs");
const path     = require("path");
const PROVIDERS = {};

for (const name of PROVIDER_ORDER) {
  const file = path.join(__dirname, "providers", `${name}.js`);
  if (fs.existsSync(file)) {
    try {
      PROVIDERS[name] = require(file);
    } catch (err) {
      process.stderr.write(`⚠️  [router] Failed to load provider "${name}": ${err.message}\n`);
    }
  }
}

// ─── Argument parsing ─────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    query:    null,
    lang:     null,
    mode:     "web",
    provider: null,   // null = auto-select via fallback chain
    fallback: true,
    count:    10,
    fresh:    null,
    safe:     "moderate",
    offset:   0,
    tokens:   8192,
    urls:     5,
    threshold: "balanced",
    json:     false,
    snippets: true,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) { if (!opts.query) opts.query = a; continue; }
    switch (a) {
      case "--lang":        opts.lang      = args[++i]; break;
      case "--mode":        opts.mode      = args[++i]; break;
      case "--news":        opts.mode      = "news";    break;
      case "--images":      opts.mode      = "images";  break;
      case "--video":       opts.mode      = "video";   break;
      case "--provider":    opts.provider  = args[++i]; break;
      case "--no-fallback": opts.fallback  = false;     break;
      case "--count":       opts.count     = Math.min(20,    Math.max(1,   parseInt(args[++i], 10) || 10));   break;
      case "--fresh":       opts.fresh     = args[++i]; break;
      case "--safe":        opts.safe      = args[++i]; break;
      case "--offset":      opts.offset    = Math.min(9,     Math.max(0,   parseInt(args[++i], 10) || 0));    break;
      case "--tokens":      opts.tokens    = Math.min(32768, Math.max(512, parseInt(args[++i], 10) || 8192)); break;
      case "--urls":        opts.urls      = Math.min(20,    Math.max(1,   parseInt(args[++i], 10) || 5));    break;
      case "--threshold":   opts.threshold = args[++i]; break;
      case "--json":        opts.json      = true;      break;
      case "--no-snippets": opts.snippets  = false;     break;
      default: process.stderr.write(`⚠️  Unknown flag: ${a}\n`);
    }
  }
  return opts;
}

// ─── Provider selection & fallback ───────────────────────────────────────────
async function runWithFallback(opts) {
  // If a specific provider is forced, skip the fallback chain entirely
  if (opts.provider) {
    const p = PROVIDERS[opts.provider];
    if (!p) {
      process.stderr.write(`❌ Unknown provider: "${opts.provider}". Available: ${Object.keys(PROVIDERS).join(", ")}\n`);
      process.exit(1);
    }
    if (!p.isAvailable()) {
      process.stderr.write(`❌ Provider "${opts.provider}" is not configured (API key missing).\n`);
      process.exit(1);
    }
    return await p.search(opts);
  }

  // Auto-select: walk PROVIDER_ORDER, skip unavailable or unsupporting providers
  const candidates = PROVIDER_ORDER
    .filter((name) => PROVIDERS[name])
    .filter((name) => PROVIDERS[name].isAvailable())
    .filter((name) => !PROVIDERS[name].modes || PROVIDERS[name].modes.includes(opts.mode));

  if (candidates.length === 0) {
    process.stderr.write("❌ No configured providers available. Check your .env file.\n");
    process.stderr.write(`   Expected at least one of: ${PROVIDER_ORDER.join(", ")}\n`);
    process.exit(1);
  }

  let lastError;
  for (let i = 0; i < candidates.length; i++) {
    const name     = candidates[i];
    const provider = PROVIDERS[name];

    try {
      return await provider.search(opts);
    } catch (err) {
      lastError = err;
      process.stderr.write(`⚠️  [router] Provider "${name}" failed: ${err.message}\n`);

      if (!opts.fallback || i === candidates.length - 1) break;

      process.stderr.write(`⚠️  [router] Falling back to "${candidates[i + 1]}"...\n`);
    }
  }

  process.stderr.write(`❌ All providers failed. Last error: ${lastError?.message}\n`);
  process.exit(1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv);

  if (!opts.query?.trim()) {
    process.stderr.write("❌ Error: search query is required.\n");
    process.stderr.write('   Example: node easearch.js "kubernetes basics" --lang en\n');
    process.stderr.write('   LLM:     node easearch.js "React hooks" --mode llm --lang en\n');
    process.exit(1);
  }

  const output = await runWithFallback(opts);
  process.stdout.write(output + "\n");
}

main().catch((err) => {
  process.stderr.write(`❌ Unexpected error: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
