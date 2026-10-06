# Live run on 27 real timeline tweets, 2026-09-20 (Gemini 3.5 Flash-Lite, direct API, thinkingLevel minimal)

- Same fixture prompt that gave ~1 swap/tweet on synthetic tweets gave 1 swap / 27 real tweets. Real tweets are harder: short, slangy, many hit zero-French rules (stimulants, depression, profanity).
- Batching suppresses swaps on Lite: tweet 4 alone -> "because->parce que"; same tweet in a batch of 14 -> nothing. Batch of 9 with a "default is to swap" instruction -> 5/27, all correct (et, parce que, sans, avec, maintenant), zero-French tweets correctly skipped.
- Run-to-run variance on identical input: 1, 5, 8 swaps. Temperature is not a lever on this model. Any eval must be N runs + pass rate.
- Thinking: thoughtsTokenCount absent at minimal (effectively zero). Latency 0.7-1.0s per call, 1.7-3.9s per batch.
- Gemini 3.5 Flash (non-Lite), batch of 8: 3 swaps, one wrong ("only"->mais), 7.9s. Not better.
- Whitelisting the exact 27 words in the prompt made Lite MORE timid (1-2 swaps), not less. Prompt wording matters more than expected; keep the "default is to swap" phrasing, drop the long whitelist.
- 429s at ~12 requests/min on the local GEMINI_API_KEY -> free tier confirmed -> production goes through OpenRouter.
- Context anchors worked: 5/5 anchors located verbatim, 1/1 applied on the page (others had been unloaded by X's virtualized timeline before apply).

Open risk for the plan: judgment on real tweets is the gap, not cost. Phase 0 eval should run on real tweets (this file's tweets.json), batch ~8-10, 5 runs each, Lite vs Sonnet 5 as reference.

## 3.8 Flash on the same 27 tweets (thinkingLevel low; minimal is rejected with 400)
- 13 swaps in 13/27, all sensible: et x5, parce que, sans, avec x2, pour, maintenant, tres, beaucoup. Zero-French tweets skipped.
- Latency per batch of 9: 2.3s, 20.6s, 32.4s (high-demand evening; 503s earlier). Lite: 1.7-3.9s.
- Free key can call it. Decision: 3.8 Flash default, Lite kept as fallback candidate.
