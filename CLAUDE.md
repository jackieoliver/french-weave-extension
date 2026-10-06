# French Weave — repo notes for Claude

Chrome extension for x.com that swaps a few English words in tweets for French, per the owner's level schedule.

- Read `REQUIREMENTS.md` first. It is the spec. `PLAN.md` says how it is built and what is left (L3/L4 prompts).
- `eval/` holds model comparisons: `eval/RESULTS.md` (synthetic fixture), `eval/live/RESULTS.md` (27 real tweets). Facts only; decisions live in REQUIREMENTS.md. `eval/smoke.mjs` runs one live batch with the extension's prompt.
- Layout: `src/` (MV3, ES modules, no bundler), `test/` (`bun test`, happy-dom). Pure modules take injected fetch/storage so they test without Chrome.
- Verify on real x.com by loading unpacked in the owner's Chrome. Google Chrome stable ignores `--load-extension`; use Chromium for automated loads.
- Never commit keys. `.env` and `*.local` are gitignored. The Gemini key lives only in `chrome.storage.local`.
- Commits use the global git identity (jackieoliver, GitHub no-reply email). Default branch is `master`.
