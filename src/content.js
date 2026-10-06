// Content script: watch for tweet text, ask the background for swaps, paint them, handle hover/click/off.
import { flatten, applySwaps, revert, toggle, SWAP_CLASS } from './text.js';
import { wordCount, isZeroFrench, resolveLevel } from './levels.js';
import { hashKey } from './hash.js';
import { withDefaults } from './settings.js';

const SEL = '[data-testid="tweetText"]';
const BATCH = 8;
const DEBOUNCE_MS = 250;
const MIN_WORDS = 6;

let settings = withDefaults();
let observer = null;
let timer = null;
const memo = new Map();     // key -> swaps (this tab's copy; background holds the durable cache)
const pending = new Map();  // key -> { text, els: Set<Element> }
const inflight = new Set();

const active = (s) => !!(s.enabled && s.apiKey);
const currentLevel = () => resolveLevel(settings).effective;

function isEnglish(el) {
  const lang = el.getAttribute('lang');
  return !lang || /^(en|und|qme|zxx|art)/i.test(lang);
}

function consider(el) {
  if (!el.isConnected || !isEnglish(el)) return;
  if (el.querySelector(`.${SWAP_CLASS}`)) revert(el);
  const { text } = flatten(el);
  if (wordCount(text) < MIN_WORDS || isZeroFrench(text)) {
    el.dataset.fwKey = 'skip';
    return;
  }
  const key = `${currentLevel()}:${hashKey(text)}`;
  el.dataset.fwKey = key;
  if (memo.has(key)) {
    paint(el, key);
    return;
  }
  let p = pending.get(key);
  if (!p) {
    p = { text, els: new Set() };
    pending.set(key, p);
  }
  p.els.add(el);
  if (!timer) timer = setTimeout(flush, DEBOUNCE_MS);
}

function paint(el, key) {
  const swaps = memo.get(key);
  if (!swaps || !swaps.length || el.dataset.fwKey !== key || !el.isConnected) return;
  applySwaps(el, swaps);
  observer?.takeRecords(); // our own edits are not X re-renders
}

async function flush() {
  timer = null;
  const items = [];
  for (const [key, p] of pending) {
    if (inflight.has(key)) continue;
    items.push({ key, text: p.text });
    if (items.length >= BATCH) break;
  }
  if (!items.length) return;
  for (const i of items) inflight.add(i.key);
  let res;
  try {
    res = await chrome.runtime.sendMessage({ type: 'swaps', level: currentLevel(), items });
  } catch (e) {
    res = { results: {}, error: String(e) };
  }
  for (const i of items) {
    inflight.delete(i.key);
    const p = pending.get(i.key);
    pending.delete(i.key);
    const swaps = res?.results?.[i.key];
    if (!swaps) continue; // model failed for this batch; those tweets stay English
    memo.set(i.key, swaps);
    if (p) for (const el of p.els) paint(el, i.key);
  }
  if (res?.error) console.warn('[french-weave]', res.error);
  if ([...pending.keys()].some((k) => !inflight.has(k))) timer = setTimeout(flush, 50);
}

function onMutations(records) {
  const todo = new Set();
  for (const r of records) {
    for (const n of r.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches(SEL)) todo.add(n);
      else for (const el of n.querySelectorAll(SEL)) todo.add(el);
    }
    const base = r.target.nodeType === 1 ? r.target : r.target.parentElement;
    const host = base?.closest?.(SEL);
    if (host && host.dataset.fwKey) todo.add(host); // X re-rendered inside a tweet we handled
  }
  for (const el of todo) consider(el);
}

function onClick(e) {
  const span = e.target?.closest?.(`span.${SWAP_CLASS}`);
  if (!span) return;
  e.preventDefault();
  e.stopPropagation();
  toggle(span);
  observer?.takeRecords(); // the flip is ours, not an X re-render
}

function start() {
  if (observer) return;
  observer = new MutationObserver(onMutations);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  for (const el of document.querySelectorAll(SEL)) consider(el);
}

function stop() {
  observer?.disconnect();
  observer = null;
  clearTimeout(timer);
  timer = null;
  pending.clear();
  inflight.clear();
  for (const el of document.querySelectorAll(SEL)) {
    revert(el);
    delete el.dataset.fwKey;
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  const prev = settings;
  settings = withDefaults(changes.settings.newValue);
  const wasOn = active(prev);
  const on = active(settings);
  const levelChanged = resolveLevel(prev).effective !== resolveLevel(settings).effective;
  if (wasOn && (!on || levelChanged)) stop();
  if (on && (!wasOn || levelChanged)) start();
});

document.addEventListener('click', onClick, true);

chrome.storage.local.get('settings').then(({ settings: s }) => {
  settings = withDefaults(s);
  if (active(settings)) start();
});
