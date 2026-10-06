# French Weave — requirements

## Version 0.2 scope (owner request, 2026-09-22)

This extends the original X-only requirements below. New sites are **on by default**, with per-site disabled exceptions. An alternate **off by default** setting uses enabled exceptions. The global switch overrides both. Chrome must separately grant host access.

- Support bounded English prose on permitted HTTP(S) sites, retaining X-specific selection. Skip editors, controls, hidden content, sensitive routes, and the existing excluded topic categories.
- Read vocabulary/status/stage from `jackieoliver/french-weave-data` at startup, manually, and every 15 minutes. Keep the last validated state offline. Manual level overrides remain; date-based fixed lists are the fallback before first connection. L3/L4 implementation remains future work.
- Record observed viewport exposure and English reveals. Queue events durably, upload per-device files without page text, and make retry/conflict recovery non-destructive.
- Sync small preferences through Chrome Sync. Keep credentials local and inaccessible to content scripts. GitHub data sync does not install or update extension code.
- Fix accented-word collisions, blank replacements, and stale open-tab caches. Off, permission revocation, and blacklist changes restore original text; obsolete requests cannot repaint it.
- Verify regressions and recovery with isolated tests, then distinguish remaining live activation checks in `VERIFICATION.md`.

## Original prototype requirements

### What it is
- A Chrome extension for x.com. It swaps a few English words in tweets for French, following the owner's level schedule. It never rewrites a tweet, only replaces exact words.
- Minimal. No quiz, recall cue, word log, or extra text on the page.

## Level
- Level comes from the date table minus a pause-days setting:
  Sep 19–25 2026 L1 | Sep 26–Oct 16 L2 | Oct 17–Nov 27 L3 | Nov 28+ L4.
- The popup can nudge pause days and force easier/harder.
- L1: one word per sentence or two, only the fixed 27-word list: et, mais, ou, donc, parce que, avec, sans, pour, très, aussi, bien, beaucoup, un peu, maintenant, toujours, peut-être, ici, voilà, oui, non, merci, le problème, la question, l'idée, la réponse, important, possible, difficile.
- L2: 1–2 words per sentence, ~150 most frequent words, cognates, fixed phrases (c'est, il y a, je pense que, il faut).
- L3: one clause in five fully French plus sprinkling. L4: two in five.
- The French must fit the sense in context. Never touch names, handles, hashtags, links, numbers, or code. Zero French on health, medication, legal, money, safety, emergency, or driving tweets. Skip tweets under 6 words.
- Sound hints at L1–L2 only.

## Model (soft requirement, open to others later)
- Gemini 3.8 Flash on the owner's local free-tier Gemini key for now. Chosen because it made the best swap choices on the real timeline. Gemini 3.5 Flash-Lite is the faster fallback when 3.8 is slow. Both provisional; revisit once there is a real-tweet eval with a pass rate.

## Behaviour
- Swaps appear directly, no hiding the tweet. Ideally most land before the tweet scrolls into view.
- Swaps stick: scrolling away and back shows the same French. The same tweet is never re-decided (cached).
- Swapped word: faint dotted underline, never bold; words still being learned (active/shaky) get a faint blue tint. Hovering or focusing for 0.7 s shows meaning and sound hint and records a `peek`. Click flips it to English; click again flips back.
- On/off switch. Off returns everything to English immediately.

## Done when
- Load the extension, open x.com, and tweets show underlined French; hover and click work; nothing inside handles, links, or code changes; a health tweet stays English; the switch turns it off cleanly.

## Repo
- github.com/jackieoliver/french-weave. Eval notes and fixtures in `eval/`.

## 0.3 word choice (2026-10-02)

- With shared state, the prompt lists LEARNING words (active, then shaky; ones not yet shown today first) as the target and KNOWN words as filler. The fixed example swaps ("and"->et…) apply only without shared state, because they pulled 77% of swaps onto known function words.
- Density is counted per sentence: L1 at most one swap per sentence, L2 at most two, enforced after validation with learning words kept first and each French word used once per passage.
- Measured on `eval/live/tweets.json` with the 2026-10-02 state (`eval/active-share.mjs`, 2 runs, 54 passages): before, 0.56 swaps/passage, 23% learning words, 3/10 active words used; after, see VERIFICATION.md.
- A 429/503/timeout puts that model in cooldown (Gemini's `retryDelay`, else 60/30/30 s); later batches skip it. Failed passages are retried up to 3 times with backoff. Before 0.3, 32% of model calls on the free-tier key failed and those passages stayed English.
