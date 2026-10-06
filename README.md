# French Weave

Chrome extension that weaves a little French into tweets on X, following a leveled schedule (Level 1 = one common word per sentence or two, up to full French clauses by Level 4). Swaps are exact-word replacements chosen by a small model, so a tweet is never rewritten. Swapped words get a faint dotted underline; hover shows the meaning and a sound hint; click flips a word back to English.

Model: Gemini 3.8 Flash on your own Gemini key, with Gemini 3.5 Flash-Lite as the fallback when 3.8 is slow or overloaded (see `eval/live/RESULTS.md`).

## Install

1. `chrome://extensions` → Developer mode → Load unpacked → this folder.
2. Click the French Weave icon and paste your Gemini key.
3. Open x.com.

The popup also has the on/off switch, the level (from the date schedule minus pause days, or forced), the model choice, and a cache reset.

## Develop

- No build step. `bun install` once for the test dependency, then `bun test`.
- `GEMINI_API_KEY=… node eval/smoke.mjs [level] [model]` runs one real batch with the extension's prompt.
- Spec: `REQUIREMENTS.md`. How it is built and what is left: `PLAN.md`. Model evals: `eval/`. The 27-tweet live eval set is not included; `eval/live/run_batches.py` expects your own `eval/live/tweets.json`.
