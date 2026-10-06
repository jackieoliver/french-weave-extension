// Live check of word choice against the shared learning state: how many swaps use active/shaky words
// versus known filler, and how many passages get nothing. Same prompt, schema and validator as the extension.
// Usage: GEMINI_API_KEY=... node eval/active-share.mjs path/to/state.json [model] [runs]
import { readFile } from 'node:fs/promises';
import { requestSwaps } from '../src/engine.js';
import { validateState } from '../src/sync.js';

const state = validateState(JSON.parse(await readFile(process.argv[2], 'utf8')));
const model = process.argv[3] || 'gemini-3.8-flash';
const runs = Number(process.argv[4] || 1);
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY not set');

const status = new Map(state.words.map((w) => [w.fr, w.status]));
const tweets = JSON.parse(await readFile(new URL('./live/tweets.json', import.meta.url), 'utf8'))
  .map(([id, text]) => ({ id, text }));
const totals = { passages: 0, empty: 0, swaps: 0, active: 0, shaky: 0, known: 0 };
const byWord = new Map();
const usedModels = new Map();
const cooldown = new Map();
for (let r = 0; r < runs; r++) {
  for (let i = 0; i < tweets.length; i += 8) {
    const batch = tweets.slice(i, i + 8);
    let reply;
    for (let attempt = 0; !reply; attempt++) {
      try { reply = await requestSwaps({ apiKey, model, level: state.stage, words: state.words, batch, cooldown }); }
      catch (e) { if (attempt === 3) throw e; await new Promise((done) => setTimeout(done, e.retryAfterMs || 15000)); }
    }
    const { results } = reply;
    usedModels.set(reply.model, (usedModels.get(reply.model) || 0) + 1);
    for (const { id } of batch) {
      const swaps = results[id] || [];
      totals.passages++;
      if (!swaps.length) totals.empty++;
      for (const s of swaps) {
        totals.swaps++;
        totals[status.get(s.word)]++;
        byWord.set(s.word, (byWord.get(s.word) || 0) + 1);
      }
    }
  }
}
const pct = (n) => `${Math.round((100 * n) / (totals.swaps || 1))}%`;
console.log(`answered by: ${[...usedModels].map(([m, n]) => `${m} ${n}`).join(', ')}`);
console.log(`${model}, stage ${state.stage}, ${runs} run(s), ${totals.passages} passages`);
console.log(`swaps ${totals.swaps} (${(totals.swaps / totals.passages).toFixed(2)}/passage), empty passages ${totals.empty}`);
console.log(`active ${totals.active} (${pct(totals.active)}), shaky ${totals.shaky}, known ${totals.known} (${pct(totals.known)})`);
const active = state.words.filter((w) => w.status !== 'known').map((w) => w.fr);
console.log(`active/shaky words used: ${active.filter((w) => byWord.has(w)).length}/${active.length}`);
console.log('top words:', [...byWord].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w, n]) => `${w} ${n}`).join(', '));
