// Live smoke check of the extension's model path: real prompt, real schema, real model, batch of 8 real tweets.
// Usage: GEMINI_API_KEY=... node eval/smoke.mjs [level] [model] [offset]
import { readFile } from 'node:fs/promises';
import { requestSwaps } from '../src/engine.js';

const level = Number(process.argv[2] || 1);
const model = process.argv[3] || 'gemini-3.8-flash';
const offset = Number(process.argv[4] || 0);
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY not set');

const tweets = JSON.parse(await readFile(new URL('./live/tweets.json', import.meta.url), 'utf8'));
const batch = tweets.slice(offset, offset + 8).map(([id, text]) => ({ id, text }));
const t0 = Date.now();
const { results, model: used, errors } = await requestSwaps({ apiKey, model, level, batch });
const ms = Date.now() - t0;
let n = 0;
for (const { id, text } of batch) {
  const swaps = results[id] || [];
  n += swaps.length;
  console.log(`- ${text.slice(0, 60).replace(/\n/g, ' ')} :: ${swaps.map((s) => `${s.o}->${s.f} [${s.ctx}]`).join('; ') || '(none)'}`);
}
console.log(`${n} swaps in ${batch.length} tweets, level ${level}, model ${used}, ${ms} ms${errors.length ? ' (fallback after: ' + errors.join('; ') + ')' : ''}`);
