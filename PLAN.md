# French Weave — build plan and status (2026-09-20)

Spec: `REQUIREMENTS.md`. This file records how it is built and what is left.

**Status:** Level 1 and Level 2 built, unit-tested, and exercised in a headless Chromium with the real extension. Real-x.com verification is the remaining step. Level 3/4 prompts are deferred.

## Decisions

| Topic | Decision |
|---|---|
| Sites | `x.com` and `twitter.com`. Every `[data-testid="tweetText"]`: timeline, tweet detail view including replies, quoted tweets. |
| Model path | Direct Gemini API from the service worker with the key pasted in the popup, stored in `chrome.storage.local` (never sync, never in the repo). Default `gemini-3.8-flash`; any failure (503, 429, 20 s timeout, bad JSON) retries the batch once on `gemini-3.5-flash-lite`. `thinkingLevel: low`, JSON `responseSchema`, key sent as a header. |
| Level | Date table minus pause days, plus a popup override (Auto / 1–4). L3 and L4 use the L2 prompt until they are built; the popup says so. |
| Word lists | L1: the fixed list from the spec (it says 27 but enumerates 28; all 28 kept). L2: ~150 words and fixed phrases in `src/levels.js`. Both enforced client-side: a swap whose French is not on the list is dropped, accents are canonicalised, gloss and hint come from the list, capitalisation follows the original. Off-list cognates are dropped for now. |
| Cache | key = `level:hash(flattened text)` → swaps, in `chrome.storage.local`, ~5000 entries, oldest pruned. Same text is never re-decided, including retweets and quotes. Empty decisions are cached too. |
| Prefetch | MutationObserver on the document. X renders tweets a few screens ahead of the viewport, so a tweet is requested the moment its node appears. Batches of ≤8, 250 ms debounce, one model call in flight. |
| Anchors | The model returns `o` (exact word) and `ctx` (2–4 surrounding words). The swap is placed only when it maps to exactly one plain text node outside links, code, buttons. Zero or multiple matches → dropped. |
| Zero-French | Prompt rule, plus a small keyword guard in `src/levels.js` for the obvious cases (those tweets never leave the page). Tweets under 6 words and non-English `lang` are skipped. |
| Reveal | Dotted 1 px underline, weight inherited. Tooltip is CSS-only (`data-tip` on `::after`): gloss · "hint". Click flips to English and back; the click never reaches X's handlers. |
| Off switch | Popup checkbox. Off reverts every swap and merges the split text nodes back, restoring the original node object React created. Level change does the same and re-requests. |
| Packaging | Manifest V3, ES modules, no bundler. `content-loader.js` (classic) dynamic-imports `content.js`. |

## Layout

```
manifest.json
src/levels.js         schedule, word lists, validateSwaps, zero-French guard   (pure)
src/prompt.js         system prompt per level, response schema                 (pure)
src/gemini.js         generateContent call, fetch injectable                   (pure)
src/engine.js         one batch → primary model, fallback once, validated      (pure)
src/cache.js          key→swaps cache over an injectable storage adapter       (pure)
src/text.js           flatten / locate / applySwaps / revert / toggle          (DOM, ownerDocument only)
src/hash.js           cyrb53
src/settings.js       defaults
src/background.js     service worker: cache, queue, messages
src/content-loader.js classic content script that imports content.js
src/content.js        observer, batching, paint, click, on/off
src/content.css       underline + tooltip
src/popup.html/.js    switch, level, override, pause days, model, key, clear cache
test/*.test.js        bun test (happy-dom for the DOM tests)
eval/smoke.mjs        live call with the extension's own prompt on real tweets
```

## Testing

- `bun test` — 43 tests: schedule boundaries, word lists, validation, prompt, request shape, fallback, cache pruning, and the DOM logic against markup shapes copied from x.com (mentions, emoji, links, code, newlines, repeated words, revert identity).
- `GEMINI_API_KEY=… node eval/smoke.mjs [level] [model] [offset]` — one real batch of 8 tweets from `eval/live/tweets.json`; prints swaps, model used, and why it fell back.
- Headless Chromium with the real extension against a fake x.com page (throwaway script, not committed) confirmed: swaps paint from cache, dynamically added tweets paint, handles/health/short tweets untouched, tooltip text, dotted underline, click flips both ways, popup level text, off/on.
- Real X: load unpacked, paste the key in the popup, browse.

Note: Google Chrome stable ignores `--load-extension`; automated loading needs Chromium or Chrome for Testing. "Load unpacked" in `chrome://extensions` still works in stable.

## Not built yet

- L3/L4 prompts (full French clauses). The level math, popup, and cache already handle 3 and 4; only `buildSystemPrompt` needs the two extra branches and the 500/1500-word lists.
- Cognates at L2 (would need a looser validator).
- An eval with N runs and a pass rate on real tweets.

## Known risks

- X DOM changes: the selector is one constant (`SEL` in `src/content.js`); markup shapes are pinned in `test/text.test.js`.
- 3.8 Flash returns 503 under evening load (seen again 2026-09-20); Lite takes over and is more timid (1 swap in 8 tweets at L2 in the smoke run).
- Free tier: ~12 requests/min. A failed batch leaves those tweets English; they are retried when X re-renders them.
- Google may train on free-tier prompts.
