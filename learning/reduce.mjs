// Rebuilds words.csv, state.json and state-line.txt from lexicon.csv + events/*.csv.
// Node 20+, no dependencies. Usage: node reduce.mjs [YYYY-MM-DD]   (default: today, UTC)
// Rules and formats: README.md
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- tunables ----
const WINDOW = 20;             // target number of active words
const MAX_NEW_PER_DAY = 5;     // refill cap per day (seed rows bypass it)
const SHAKY_BLOCK = 5;         // no refill while shaky has this many or more
const ASSUMED_WEIGHT = 1;      // a day with only "assumed" exposure counts this much (0.5 -> 1 on 2026-09-22)
const GRADUATE_DAYS = 3;       // active -> known: exposure days needed, and length of the clean streak (4 -> 3 on 2026-09-22; ~5 new words/day)
const SHAKY_RECOVER_DAYS = 7;  // shaky -> known: days with no new flip/asked
const OBSERVED_FROM = '2026-10-02'; // from this day, active -> known also needs >= 1 observed day (seen); assumed alone no longer graduates
const PEEK_WINDOW = 7;         // a known word peeked on 2 different days within this many days becomes shaky
const STAGE_THRESHOLDS = [[400, 4], [150, 3], [40, 2]]; // [known count, stage], first match wins
const STAGE_OVERRIDE = null;   // 1..4 pins the stage; null = automatic
const KNOWN_LIST_MAX = 150;    // above this, state-line.txt summarizes known words instead of listing them
const STATE_VERSION = 1;

const ROOT = dirname(fileURLToPath(import.meta.url));
const TODAY = process.argv[2] || new Date().toISOString().slice(0, 10);

// ---- csv ----
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter((r) => r.some((v) => v !== '')).map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}
const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const toCsv = (header, rows) => [header.join(','), ...rows.map((r) => header.map((h) => q(r[h] ?? '')).join(','))].join('\n') + '\n';

// ---- helpers ----
// Matching key: lowercase, straight apostrophes, single spaces. Accents are kept ("ou" and "où" are different words).
const norm = (s) => String(s).normalize('NFC').toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim();
const dayNum = (d) => Math.round(Date.parse(d + 'T00:00:00Z') / 86400000);
const addDays = (d, n) => new Date((dayNum(d) + n) * 86400000).toISOString().slice(0, 10);
const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); }

// ---- load ----
const lexicon = parseCsv(readFileSync(join(ROOT, 'lexicon.csv'), 'utf8'));
const words = new Map(); // norm(fr) -> state
for (const w of lexicon) {
  if (!w.fr || words.has(norm(w.fr))) { console.error(`lexicon: skipping empty/duplicate "${w.fr}"`); continue; }
  words.set(norm(w.fr), { fr: w.fr, en: w.en, hint: w.hint, status: 'queue', added: '', changed: '', exposure: new Map(), flips: 0, typed: 0, peeks: [], lastBad: '' });
}
const events = [];
const evDir = join(ROOT, 'events');
for (const f of readdirSync(evDir).filter((f) => f.endsWith('.csv')).sort()) {
  for (const e of parseCsv(readFileSync(join(evDir, f), 'utf8'))) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) { console.error(`${f}: bad date "${e.date}"`); continue; }
    if (!words.has(norm(e.word))) { console.error(`${f}: "${e.word}" not in lexicon, ignored`); continue; }
    events.push({ ...e, count: Number(e.count) || 1, seed: f === 'seed.csv' });
  }
}
events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (b.seed - a.seed))); // stable; seed rows first within a day
const byDay = new Map();
for (const e of events) (byDay.get(e.date) ?? byDay.set(e.date, []).get(e.date)).push(e);

// ---- replay, one day at a time ----
const setStatus = (w, status, day) => { w.status = status; w.changed = day; if (!w.added) w.added = day; };
const firstDay = events.length ? events[0].date : TODAY;
for (let day = firstDay; day <= TODAY; day = addDays(day, 1)) {
  for (const e of byDay.get(day) ?? []) {
    const w = words.get(norm(e.word));
    switch (e.event) {
      case 'known': case 'active': setStatus(w, e.event, day); break;
      case 'seen': w.exposure.set(day, 'seen'); break;
      case 'assumed': if (!w.exposure.has(day)) w.exposure.set(day, 'assumed'); break;
      case 'flip': w.flips += e.count; w.lastBad = day; setStatus(w, 'shaky', day); break;
      case 'asked': w.lastBad = day; setStatus(w, 'shaky', day); break;
      case 'typed': w.typed += e.count; if (w.status !== 'known') setStatus(w, 'known', day); break;
      case 'peek': // waited for the gloss: not yet recalled on sight
        if (w.peeks.at(-1) !== day) w.peeks.push(day);
        if (w.status === 'shaky') w.lastBad = day;
        else if (w.status === 'known' && w.peeks.length >= 2 && dayNum(day) - dayNum(w.peeks.at(-2)) < PEEK_WINDOW) { w.lastBad = day; setStatus(w, 'shaky', day); }
        break;
      default: console.error(`unknown event "${e.event}" for ${e.word}, ignored`);
    }
  }
  // graduation
  for (const w of words.values()) {
    if (w.status === 'active') {
      const days = [...w.exposure.keys()].sort();
      const total = days.reduce((n, d) => n + (w.exposure.get(d) === 'seen' ? 1 : ASSUMED_WEIGHT), 0);
      const streakStart = days[days.length - GRADUATE_DAYS];
      const clean = streakStart && (!w.lastBad || w.lastBad < streakStart) && !(w.peeks.at(-1) >= streakStart);
      const observed = day < OBSERVED_FROM || days.some((d) => w.exposure.get(d) === 'seen');
      if (total >= GRADUATE_DAYS && clean && observed) setStatus(w, 'known', day);
    } else if (w.status === 'shaky') {
      if (dayNum(day) - dayNum(w.lastBad || w.changed) >= SHAKY_RECOVER_DAYS) setStatus(w, 'known', day);
    }
  }
  // refill from lexicon order
  const all = [...words.values()];
  if (all.filter((w) => w.status === 'shaky').length < SHAKY_BLOCK) {
    let room = Math.min(MAX_NEW_PER_DAY, WINDOW - all.filter((w) => w.status === 'active').length);
    for (const w of all) { if (room <= 0) break; if (w.status === 'queue') { setStatus(w, 'active', day); room--; } }
  }
}

// ---- outputs ----
const all = [...words.values()];
const known = all.filter((w) => w.status === 'known');
const stage = STAGE_OVERRIDE ?? (STAGE_THRESHOLDS.find(([n]) => known.length >= n)?.[1] ?? 1);
const seenDays = (w) => [...w.exposure.values()].reduce((n, v) => n + (v === 'seen' ? 1 : ASSUMED_WEIGHT), 0);
writeFileSync(join(ROOT, 'words.csv'), toCsv(['fr', 'en', 'hint', 'status', 'added', 'seen_days', 'flips', 'typed', 'changed'],
  all.map((w) => ({ ...w, seen_days: seenDays(w) }))));

const byAdded = (a, b) => (a.added < b.added ? -1 : a.added > b.added ? 1 : 0);
const active = all.filter((w) => w.status === 'active').sort(byAdded);
const shaky = all.filter((w) => w.status === 'shaky').sort(byAdded);
const pick = ({ fr, en, hint, status }) => ({ fr, en, hint, status });
const stateWords = [...active, ...shaky, ...known].map(pick);
const state = { version: `${STATE_VERSION}.${hash(JSON.stringify([stage, stateWords]))}`, stage, words: stateWords };
writeFileSync(join(ROOT, 'state.json'), JSON.stringify(state, null, 2) + '\n');

const entry = (w, d) => `${w.fr} = ${w.en}, "${w.hint}" (${md(d)})`;
const list = (xs) => (xs.length ? xs.join('; ') : 'none');
const knownText = known.length > KNOWN_LIST_MAX ? `top ~${KNOWN_LIST_MAX} common words` : (known.map((w) => w.fr).join(', ') || 'none');
const line = `French weave state (auto-updated; full record in [[french-progress]]) — Stage: ${stage}` +
  ` | Active (use most; gloss in footer): ${list(active.map((w) => entry(w, w.added)))}` +
  ` | Shaky (use often; gloss in footer): ${list(shaky.map((w) => entry(w, w.changed)))}` +
  ` | Known (use freely; never gloss): ${knownText}`;
writeFileSync(join(ROOT, 'state-line.txt'), line + '\n');
console.log(`${TODAY}: stage ${stage}, active ${active.length}, shaky ${shaky.length}, known ${known.length}, queue ${all.length - active.length - shaky.length - known.length}`);
