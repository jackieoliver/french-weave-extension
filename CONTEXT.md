# French Weave — technical context

Chrome extension (Manifest V3) for x.com / twitter.com. Swaps a few English words in tweets for French, per a level schedule. Exact-substring replacement only; tweets are never rewritten. Repo: github.com/jackieoliver/french-weave, local ~/GitHub/french-weave, branch master. Spec in REQUIREMENTS.md, build notes in PLAN.md.

## Status (2026-09-20)
- Level 1 and Level 2 built, unit-tested (43 tests, `bun test`), verified on the real x.com timeline in Chrome (swaps, hover tooltip, click flip, off switch).
- Loaded unpacked in Chrome profile "Jacqueline" (personal). Gemini key pasted into the popup; stored only in chrome.storage.local.
- Level 3/4 prompts not built; anything above L2 uses the L2 prompt.
- Not public yet. Open items before publishing: eval/live/tweets.json holds 27 real tweets with IDs (also in git history); no LICENSE.

## Stack
- Plain ES modules, no bundler, no framework. Node 20 / Bun 1.3 for tests only.
- Dev dependency: happy-dom (DOM tests). Everything else is browser-native.
- Model: Google Gemini via generativelanguage.googleapis.com, key sent as `x-goog-api-key` header.
  - Default `gemini-3.8-flash`; fallback `gemini-3.5-flash-lite` (one retry per batch on any failure: 503, 429, 20 s timeout, bad JSON).
  - `thinkingConfig.thinkingLevel: "low"`, `responseMimeType: application/json`, `responseSchema` (see below).
  - Free tier: ~12 requests/min; 3.8 Flash returns 503 under evening load, Lite takes over and is more timid.

## File layout
```
manifest.json           MV3; permissions: storage; host_permissions: generativelanguage.googleapis.com;
                        content script on https://x.com/* and https://twitter.com/*; popup; web_accessible_resources src/*.js
src/levels.js           LEVEL_TABLE, scheduledLevel(), resolveLevel(), L1_WORDS (28), L2_WORDS (149),
                        validateSwaps(), normalizeFr(), matchCase(), wordCount(), isZeroFrench()      (pure)
src/prompt.js           buildSystemPrompt(level), buildUserContent(batch), RESPONSE_SCHEMA               (pure)
src/gemini.js           MODELS, FALLBACK_MODEL, buildRequest(), callGemini({fetchImpl,...}), parseSwapsResponse()
src/engine.js           requestSwaps({apiKey, model, level, batch, fetchImpl, timeoutMs}) -> {results, model, errors}
src/cache.js            createCache(storage) with getMany/setMany/prune/clear; memoryStorage(); chromeStorage adapter
src/text.js             flatten(root), locate(flat, o, ctx), toNode(), applySwaps(root, swaps), revert(root), toggle(span)
src/hash.js             hashKey(str) = cyrb53 hex
src/settings.js         DEFAULT_SETTINGS, withDefaults()
src/background.js       service worker: onMessage {type:'swaps'|'clearCache'}, cache lookup, serialized model calls
src/content-loader.js   classic content script; dynamic import() of src/content.js
src/content.js          MutationObserver, batching, paint, click handler, on/off via storage.onChanged
src/content.css         .fw-word underline; .fw-word:hover::after tooltip from data-tip
src/popup.html/.js      on/off, level display, force level, pause days, model, API key, clear cache
test/*.test.js          bun test: levels, text (happy-dom), prompt, engine+gemini+cache
eval/                   prompt.md + tweets.json (synthetic fixture), live/ (27 real tweets, results), smoke.mjs
```

## Level logic (src/levels.js)
- LEVEL_TABLE: 2026-09-19 → L1, 2026-09-26 → L2, 2026-10-17 → L3, 2026-11-28 → L4 (local dates).
- scheduledLevel(date, pauseDays): shifts date back by pauseDays, picks the row.
- resolveLevel(settings) → {scheduled, chosen, effective}; chosen = levelOverride (1–4) or scheduled; effective = min(chosen, MAX_BUILT_LEVEL=2).
- Word entries: {fr, en, hint}. L1 = the spec's fixed list (spec says 27, enumerates 28; all kept). L2 = L1 + ~120 frequent words, cognates, fixed phrases (c'est, il y a, je pense que, il faut, ...).
- validateSwaps(level, swaps): fail-closed. Keeps a swap only if normalizeFr(f) (NFD, strip diacritics, lowercase, straight apostrophes, collapse spaces) matches a list entry or the entry minus its article. Output f = canonical accented form (capitalized if the original was), g = list gloss, h = list hint, ctx passed through.
- isZeroFrench(text): small regex guard (medical, legal, money, emergency, driving terms). Model prompt carries the real rule.
- Tweets under 6 whitespace tokens are skipped; non-English `lang` attributes skipped.

## Model I/O (src/prompt.js, src/gemini.js)
- System prompt per level (wording from eval/live/prompt-live.md, which scored best on real tweets): density rule, allowed word list, sense rule ("so" as intensifier is not donc), never touch names/handles/hashtags/URLs/numbers/code, zero French on health/medication/legal/money/safety/emergency/driving, comprehension beats level, "default is to swap", accented examples.
- User content: `Tweets:\n` + JSON array of {id, text}. id = cache key string.
- Response schema: {tweets:[{id:string, swaps:[{o, f, g, h, ctx}]}]}; o = exact word(s) as written, f = French, g = gloss, h = sound hint, ctx = 2–4 words copied from the tweet containing o.
- Batch size ≤ 8 (larger batches suppressed swaps on Lite in eval).

## Cache and messaging
- Cache key: `${effectiveLevel}:${hashKey(flattenedText)}`. Same text → same decision (retweets, quotes). Empty decisions cached too.
- Storage: chrome.storage.local, entries `c:<key>` → {s: swaps[], t: ms}. Cap ~5000, prune oldest 1000 when exceeded (checked every 100 writes). Survives restarts.
- Settings: chrome.storage.local `settings` = {enabled, apiKey, model, pauseDays, levelOverride}.
- Content → background: `chrome.runtime.sendMessage({type:'swaps', level, items:[{key, text}]})` → `{results: {key: swaps[]}, error?}`. Cache hits are returned even when the model call fails; misses stay English and retry when X re-renders the node.
- Background serializes model calls (one in flight, promise chain). `{type:'clearCache'}` wipes `c:*`.

## DOM handling (src/text.js, src/content.js)
- Target: every `[data-testid="tweetText"]` (timeline, detail view incl. replies, quoted tweets). Markup shapes observed on x.com: `span(text)`, `img[alt=emoji]`, `div > span > a[href=/handle]` mentions, `a[href=https://t.co/..](span("https://") + text)` links, `a[href=/hashtag/..]`, "Show more" `button[data-testid=tweet-text-show-more-link]` sibling.
- flatten(root): walks text nodes in order; emoji alt and link/code text are included in the string but flagged untouchable; whitespace runs collapsed to one space; keeps map normalized index → raw index and segment list {node, start, end, ok}.
- locate(): find ctx once in the flattened text, then o at word boundaries inside it; fallback to a unique whole-text match; zero or multiple matches → drop.
- toNode(): the raw slice must equal o exactly and sit inside one touchable text node. Swaps applied later-position-first per node via splitText; wrapper `<span class="fw-word" data-en data-fr data-tip data-fw-split="1">`.
- revert(): merges each span back into the surrounding text nodes, restoring the original node object (React-safe). toggle(): flips textContent between data-fr and data-en, class `fw-en`.
- content.js: MutationObserver on documentElement (childList, subtree, characterData). New tweetText nodes → consider(); mutations inside a handled node → re-consider (revert + recompute). Own edits discarded with observer.takeRecords(). Pending requests debounced 250 ms, batches of 8, in-tab memo Map. Click handler on document (capture): closest('.fw-word') → preventDefault, stopPropagation, toggle.
- Off switch / level change: stop() reverts every span and drops dataset keys; start() rescans.

## UI
- `.fw-word`: dotted 1 px underline, rgba(128,128,128,.75), underline-offset 3 px, font-weight inherit, cursor pointer, position relative.
- Tooltip: CSS-only `::after` with `content: attr(data-tip)`; tip = `${g} · "${h}"` (hint at L1–L2).
- Popup: checkbox On; Level text ("L1", "L2 (schedule says L1)", "· using L2 rules for now"); Force level select Auto/1/2/3/4; Pause days number; Model select; Gemini key password field; Clear cache button. Saves on change.

## Testing
- `bun test` — 43 tests: schedule boundaries, pause days, override cap, word lists (L1 exact, L2 140–160, all glossed), validation (accents, articles, capitalization, off-list drop), prompt content, request shape, fallback order, cache prune, hash, and DOM cases (repeated words with ctx, word boundaries, mentions, emoji, links, code, cross-node phrase dropped, newline preservation, overlap, revert identity, toggle).
- `GEMINI_API_KEY=… node eval/smoke.mjs [level] [model] [offset]` — one live batch of 8 tweets from eval/live/tweets.json; prints swaps, model used, fallback reason.
- Headless Chromium check (throwaway, not committed): Playwright launchPersistentContext with Playwright's own Chromium (Google Chrome stable ignores --load-extension), seed settings + cache via the service worker, route a fake x.com page. Confirmed paint from cache, dynamic nodes, tooltip text, click flip, popup, off/on.
- Real X: extension loaded unpacked; verified via Claude in Chrome on the home timeline.

## Conventions
- Commits authored as jackieoliver (global git config, GitHub no-reply email). A global pre-commit hook blocks the `pizzacorruption` alias. No attribution trailers in commit messages.
- Never commit keys. `.env`, `*.local`, node_modules ignored.
- Owner prefers the simplest mechanism; layered fallbacks, circuit breakers, offset schemes were rejected as overengineering.

## Known limits / next
- L3/L4: add two branches to buildSystemPrompt (clause-level swaps) plus 500/1500-word lists; level math, popup, cache already handle 3–4.
- Cognates at L2 are dropped by the strict validator.
- No eval with N runs + pass rate yet; model output varies run to run.
- X DOM changes: selector is one constant (`SEL` in src/content.js); markup shapes pinned in test/text.test.js.
- Free-tier Google terms allow training on prompts.
