import { describe, test, expect } from 'bun:test';
import {
  scheduledLevel, resolveLevel, L1_WORDS, L2_WORDS, validateSwaps, wordCount, isZeroFrench, normalizeFr, matchCase,
} from '../src/levels.js';

const d = (y, m, day) => new Date(y, m - 1, day, 12);

describe('level schedule', () => {
  test('table boundaries', () => {
    expect(scheduledLevel(d(2026, 9, 18))).toBe(1);
    expect(scheduledLevel(d(2026, 9, 19))).toBe(1);
    expect(scheduledLevel(d(2026, 9, 25))).toBe(1);
    expect(scheduledLevel(d(2026, 9, 26))).toBe(2);
    expect(scheduledLevel(d(2026, 10, 16))).toBe(2);
    expect(scheduledLevel(d(2026, 10, 17))).toBe(3);
    expect(scheduledLevel(d(2026, 11, 27))).toBe(3);
    expect(scheduledLevel(d(2026, 11, 28))).toBe(4);
    expect(scheduledLevel(d(2027, 3, 1))).toBe(4);
  });
  test('pause days shift the date back', () => {
    expect(scheduledLevel(d(2026, 9, 28), 3)).toBe(1);
    expect(scheduledLevel(d(2026, 9, 28), 2)).toBe(2);
    expect(scheduledLevel(d(2026, 10, 20), 10)).toBe(2);
  });
  test('override and effective cap', () => {
    expect(resolveLevel({}, d(2026, 9, 20))).toEqual({ scheduled: 1, chosen: 1, effective: 1 });
    expect(resolveLevel({ levelOverride: 2 }, d(2026, 9, 20))).toEqual({ scheduled: 1, chosen: 2, effective: 2 });
    expect(resolveLevel({ levelOverride: 4 }, d(2026, 9, 20))).toEqual({ scheduled: 1, chosen: 4, effective: 2 });
    expect(resolveLevel({ levelOverride: 9 }, d(2026, 12, 1))).toEqual({ scheduled: 4, chosen: 4, effective: 2 });
    expect(resolveLevel({ pauseDays: 7 }, d(2026, 9, 30)).chosen).toBe(1);
  });
});

describe('word lists', () => {
  test('L1 is exactly the spec list', () => {
    const spec = ['et', 'mais', 'ou', 'donc', 'parce que', 'avec', 'sans', 'pour', 'très', 'aussi', 'bien', 'beaucoup', 'un peu',
      'maintenant', 'toujours', 'peut-être', 'ici', 'voilà', 'oui', 'non', 'merci', 'le problème', 'la question', "l'idée",
      'la réponse', 'important', 'possible', 'difficile'];
    expect(L1_WORDS.map((w) => w.fr)).toEqual(spec);
  });
  test('L2 is about 150 words, includes L1 and the fixed phrases, every entry glossed with a hint', () => {
    expect(L2_WORDS.length).toBeGreaterThanOrEqual(140);
    expect(L2_WORDS.length).toBeLessThanOrEqual(160);
    const frs = L2_WORDS.map((w) => w.fr);
    for (const w of L1_WORDS) expect(frs).toContain(w.fr);
    for (const p of ["c'est", 'il y a', 'je pense que', 'il faut']) expect(frs).toContain(p);
    expect(new Set(frs).size).toBe(frs.length);
    for (const w of L2_WORDS) {
      expect(w.en.length).toBeGreaterThan(0);
      expect(w.hint.length).toBeGreaterThan(0);
    }
  });
});

describe('validateSwaps', () => {
  test('keeps accented homographs distinct and rejects blank replacements', () => {
    expect(validateSwaps(2, [{ o: 'or', f: 'ou' }])[0].f).toBe('ou');
    expect(validateSwaps(2, [{ o: 'where', f: 'où' }])[0].f).toBe('où');
    expect(validateSwaps(2, [{ o: 'and', f: '' }, { o: 'and', f: '  ' }])).toEqual([]);
  });
  test('shared words replace the fixed list and retain the event spelling', () => {
    const words = [{ fr: 'la lumière', en: 'the light', hint: 'loo-myair', status: 'active' }];
    expect(validateSwaps(1, [{ o: 'light', f: 'lumiere' }, { o: 'and', f: 'et' }], words))
      .toEqual([{ o: 'light', f: 'lumière', g: 'light', h: 'loo-myair', ctx: '', word: 'la lumière', status: 'active' }]);
    expect(resolveLevel({}, d(2026, 9, 20), { stage: 2 }).effective).toBe(2);
  });
  test('keeps list words, canonicalizes accents, fills gloss and hint from the list', () => {
    const out = validateSwaps(1, [{ o: 'very', f: 'tres', g: 'x', h: 'y', ctx: 'is very good' }]);
    expect(out).toEqual([{ o: 'very', f: 'très', g: 'very', h: 'treh', ctx: 'is very good' }]);
  });
  test('drops words off the level list and malformed entries', () => {
    expect(validateSwaps(1, [{ o: 'in', f: 'dans' }])).toEqual([]);
    expect(validateSwaps(2, [{ o: 'in', f: 'dans' }])[0].f).toBe('dans');
    expect(validateSwaps(1, [{ o: 'and' }, null, { f: 'et' }, { o: '  ', f: 'et' }])).toEqual([]);
    expect(validateSwaps(1, 'nope')).toEqual([]);
  });
  test('accepts the bare noun and keeps accents', () => {
    const [s] = validateSwaps(1, [{ o: 'problem', f: 'probleme' }]);
    expect(s.f).toBe('problème');
    expect(s.g).toBe('problem');
    const [t] = validateSwaps(1, [{ o: 'the problem', f: 'le problème' }]);
    expect(t.f).toBe('le problème');
  });
  test('matches capitalization of the original', () => {
    expect(validateSwaps(1, [{ o: 'And', f: 'et' }])[0].f).toBe('Et');
    expect(validateSwaps(1, [{ o: 'AND', f: 'et' }])[0].f).toBe('et');
    expect(validateSwaps(1, [{ o: 'Because', f: 'parce que' }])[0].f).toBe('Parce que');
    expect(matchCase("l'idée", 'The idea')).toBe("L'idée");
  });
  test('normalizeFr', () => {
    expect(normalizeFr(' Peut-Être ')).toBe('peut-etre');
    expect(normalizeFr('l’idée')).toBe("l'idee");
  });
});

describe('guards', () => {
  test('wordCount', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('  one two\n\nthree ')).toBe(3);
  });
  test('zero-French topics', () => {
    expect(isZeroFrench('if you take ibuprofen talk to your doctor first')).toBe(true);
    expect(isZeroFrench('my lawyer says the lawsuit is fine')).toBe(true);
    expect(isZeroFrench('call 911 in an emergency')).toBe(true);
    expect(isZeroFrench('shipped the new onboarding flow today')).toBe(false);
    expect(isZeroFrench('the taxi was late again')).toBe(false);
  });
});
