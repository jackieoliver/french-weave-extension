// GitHub transport. No browser state and no credentials in URLs or errors.
import { exactFr } from './levels.js';

export const DATA_REPO = 'jackieoliver/french-weave-data';
const BASE = `https://api.github.com/repos/${DATA_REPO}/contents/`;
const HEADER = 'date,word,event,count,id';
export const encode = (text) => btoa(Array.from(new TextEncoder().encode(text), (b) => String.fromCharCode(b)).join(''));
export const decode = (text) => new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

export function validateState(value) {
  if (!value || typeof value.version !== 'string' || !value.version || value.version.length > 128 ||
      !Number.isInteger(value.stage) || value.stage < 1 || value.stage > 4 ||
      !Array.isArray(value.words) || !value.words.length || value.words.length > 2000) throw new Error('Invalid vocabulary state');
  const seen = new Set();
  const words = value.words.map((w) => {
    if (!w || !['active', 'shaky', 'known'].includes(w.status) ||
        !['fr', 'en', 'hint'].every((k) => typeof w[k] === 'string' && w[k].trim() && w[k].length <= 160 && !/[\r\n\x00-\x1f]/.test(w[k])) ||
        seen.has(exactFr(w.fr))) throw new Error('Invalid vocabulary word');
    seen.add(exactFr(w.fr));
    return { fr: w.fr.trim(), en: w.en.trim(), hint: w.hint.trim(), status: w.status };
  });
  return { version: value.version, stage: value.stage, words };
}

export function githubClient(token, fetchImpl = globalThis.fetch) {
  async function request(path, method = 'GET', body) {
    let res;
    try {
      res = await fetchImpl(BASE + path + (method === 'GET' ? '?ref=main' : ''), {
        method, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000), cache: 'no-store',
      });
    } catch { throw new Error('GitHub is unavailable; saved vocabulary and queued events are retained'); }
    if (!res.ok) {
      const hints = { 401: 'check the GitHub token', 403: 'check repo access, Contents permission, or rate limit', 404: 'check access to the private data repo' };
      const error = new Error(`GitHub HTTP ${res.status}${hints[res.status] ? `: ${hints[res.status]}` : ''}`);
      error.status = res.status;
      throw error;
    }
    return res.json();
  }
  async function read(path, missingOK = false) {
    let file;
    try { file = await request(path); } catch (e) { if (missingOK && e.status === 404) return null; throw e; }
    if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string' || !file.sha || file.size > 1000000) throw new Error('Unsupported GitHub file');
    return { text: decode(file.content), sha: file.sha };
  }
  return {
    async state() { return validateState(JSON.parse((await read('state.json')).text)); },
    async upload(device, events) {
      if (!/^[a-f0-9-]{36}$/.test(device)) throw new Error('Invalid device ID');
      const groups = new Map();
      for (const e of events) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !/^[a-f0-9-]{36}$/.test(e.id) || !['seen', 'flip', 'peek'].includes(e.event) ||
            typeof e.word !== 'string' || !e.word || /[\r\n]/.test(e.word) || e.word.length > 160) throw new Error('Invalid learning event');
        const month = e.date.slice(0, 7);
        if (!groups.has(month)) groups.set(month, []);
        groups.get(month).push(e);
      }
      for (const [month, batch] of groups) {
        const path = `events/extension-${device}-${month}.csv`;
        for (let attempt = 0; attempt < 3; attempt++) {
          const old = await read(path, true);
          const lines = old?.text.trimEnd().split('\n') || [HEADER];
          if (lines[0].replace(/\r$/, '') !== HEADER) throw new Error('Unexpected event file format; upload stopped');
          const ids = new Set(lines.slice(1).map((line) => line.slice(line.lastIndexOf(',') + 1).trim()));
          const fresh = batch.filter((e) => { if (ids.has(e.id)) return false; ids.add(e.id); return true; });
          if (!fresh.length) break;
          const csv = [...lines, ...fresh.map((e) => `${e.date},"${e.word.replace(/"/g, '""')}",${e.event},1,${e.id}`)].join('\n') + '\n';
          if (new TextEncoder().encode(csv).length > 950000) throw new Error('Event file is full; queued events retained');
          try {
            await request(path, 'PUT', { branch: 'main', message: `extension: ${batch.at(-1).date}`, content: encode(csv), ...(old ? { sha: old.sha } : {}) });
            break;
          } catch (e) {
            if (attempt === 2 || ![409, 422].includes(e.status)) throw e;
          }
        }
      }
    },
  };
}
