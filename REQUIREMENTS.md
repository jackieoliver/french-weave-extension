# French Weave — requirements

## What it is
- A Chrome extension for x.com. It swaps a few English words in tweets for French, following the owner's level schedule. It never rewrites a tweet, only replaces exact words.
- Minimal. No quiz, recall cue, word log, or extra text on the page.

## Level
- Level comes from the date table minus a pause-days setting:
  Sep 19–25 2026 L1 | Sep 26–Oct 16 L2 | Oct 17–Nov 27 L3 | Nov 28+ L4.
- The popup can nudge pause days and force easier/harder.
- L1: one word per sentence or two, only the fixed 27-word list: et, mais, ou, donc, parce que, avec, sans, pour, très, aussi, bien, beaucoup, un peu, maintenant, toujours, peut-être, ici, voilà, oui, non, merci, le problème, la question, l'idée, la réponse, important, possible, difficile.
- L2: 1–2 words per sentence, ~150 most frequent words, cognates, fixed phrases (c'est, il y a, je pense que, il faut).
- L3: one clause in five fully French plus sprinkling. L4: two in five.
- The French must fit the sense in context. Never touch names, handles, hashtags, links, numbers, or code. Zero French on health, medication, legal, money, safety, emergency, or driving tweets. Skip tweets under 6 words.
- Sound hints at L1–L2 only.

## Model (soft requirement, open to others later)
- Gemini 3.8 Flash on the owner's local free-tier Gemini key for now. Chosen because it made the best swap choices on the real timeline. Gemini 3.5 Flash-Lite is the faster fallback when 3.8 is slow. Both provisional; revisit once there is a real-tweet eval with a pass rate.

## Behaviour
- Swaps appear directly, no hiding the tweet. Ideally most land before the tweet scrolls into view.
- Swaps stick: scrolling away and back shows the same French. The same tweet is never re-decided (cached).
- Swapped word: faint dotted underline, never bold. Hover shows meaning and sound hint. Click flips it to English; click again flips back.
- On/off switch. Off returns everything to English immediately.

## Done when
- Load the extension, open x.com, and tweets show underlined French; hover and click work; nothing inside handles, links, or code changes; a health tweet stays English; the switch turns it off cleanly.

## Repo
- github.com/jackieoliver/french-weave. Eval notes and fixtures in `eval/`.
