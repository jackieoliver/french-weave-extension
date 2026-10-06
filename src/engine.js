// One batch, one model call (fallback model once on failure), validated swaps out.
import { buildSystemPrompt, buildUserContent, RESPONSE_SCHEMA } from './prompt.js';
import { buildRequest, callGemini, FALLBACK_MODEL } from './gemini.js';
import { validateSwaps } from './levels.js';

export async function requestSwaps({ apiKey, model, level, batch, fetchImpl, timeoutMs }) {
  const body = buildRequest({ system: buildSystemPrompt(level), user: buildUserContent(batch), schema: RESPONSE_SCHEMA });
  const models = [model];
  if (FALLBACK_MODEL[model]) models.push(FALLBACK_MODEL[model]);
  const errors = [];
  for (const m of models) {
    try {
      const byId = await callGemini({ fetchImpl, apiKey, model: m, body, timeoutMs });
      const results = {};
      for (const [id, swaps] of byId) results[id] = validateSwaps(level, swaps);
      return { results, model: m, errors };
    } catch (e) {
      errors.push(`${m}: ${e?.name === 'TimeoutError' ? 'timeout' : e?.message || e}`);
    }
  }
  throw new Error(errors.join('; '));
}
