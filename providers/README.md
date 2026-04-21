# Adding a New Provider

Each provider is a single `.js` file in this directory that exports a standard interface.
EASearch's router (`easearch.js`) auto-discovers all `*.js` files here at startup.

## Required exports

```js
module.exports = {
  // Unique provider identifier — used in --provider flag and log output
  name: "myprovider",

  // Search modes this provider supports
  // Must include at least "web". Add only what the API actually supports.
  modes: ["web", "news", "images", "video"],

  // Returns true if the provider is properly configured (API key present, etc.)
  // Called during provider selection — if false, provider is skipped in fallback chain.
  isAvailable() {
    return Boolean(process.env.MYPROVIDER_API_KEY?.trim());
  },

  // Runs the search and returns a formatted string ready for the agent.
  // opts matches the standard EASearch options object (see easearch.js — parseArgs).
  // Throw an Error on unrecoverable failure — the router will catch it and try the next provider.
  async search(opts) {
    // ... your implementation
    return formattedString;
  },
};
```

## Fallback behaviour

Providers are tried in priority order defined in `easearch.js` → `PROVIDER_ORDER`.
A provider is skipped if:
- `isAvailable()` returns `false` (not configured)
- `search()` throws an error (API failure, rate limit, etc.)

When a fallback occurs, EASearch logs `⚠️  [router] Falling back from X to Y` to stderr.

## Mode compatibility

If your provider doesn't support a requested mode, throw an error with a clear message.
The router will only attempt fallback to providers that list the requested mode in `modes`.

## Environment variable convention

Name your key `<PROVIDER_NAME_UPPERCASE>_API_KEY` and document it here:

| Provider | Env var | Get a key |
|----------|---------|-----------|
| brave | `BRAVE_API_KEY` | https://api-dashboard.search.brave.com/register |
| *(future)* duckduckgo | `DDG_API_KEY` | — |
| *(future)* bing | `BING_API_KEY` | https://www.microsoft.com/en-us/bing/apis |

Add a matching entry to `.env.example` in the project root.
