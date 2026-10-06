# Prompt contracts

There are three distinct prompt surfaces. None is a hidden provider system prompt:
these are application-generated instructions, user instruction files, and a scheduled
task prompt controlled by the project owner.

## Browser model prompt

The exact builder and response schema live in [src/prompt.js](../src/prompt.js).

With shared state, it divides vocabulary into LEARNING (Active/Shaky) and KNOWN.
Learning words not shown today come first; already-shown learning words follow.
The remaining order is inherited from the state (normally Active then Shaky).
Known words are filler. Without shared state, the older fixed lists and examples
are used. The request also contains the current effective level and passage text.

The prompt asks for contextually equivalent exact-word replacements, preserves
names/URLs/numbers/code, treats passages and vocabulary as data, and favors
comprehension over density. The response is `{passages:[{id,swaps:[{o,f,g,h,ctx}]}]}`:
original span, French replacement, gloss, pronunciation hint, and surrounding context.

| Desired behavior | Where it is enforced |
| --- | --- |
| Valid response shape and complete passage IDs | Provider schema plus parsing and engine checks. |
| Only eligible vocabulary, canonical accents and meanings | `validateSwaps`; ambiguous accented aliases and empty replacements are rejected. |
| Sparse substitutions | Prompt asks for per-sentence density. `capSwaps` imposes a **passage-wide ceiling** derived from sentence count: one per sentence at L1, two at L2. It does not guarantee an even distribution across sentences. |
| Learning words first | Prompt ordering plus keeping learning words before Known when trimming to the ceiling. There is no guaranteed minimum learning-word share. |
| No repetition within a passage | Validator/cap keeps each French word once. Rotation across passages remains model-guided. |
| Original meaning preserved | Prompt rule and exact-span checks help, but do not prove semantic correctness. |

The old generic examples strongly favored easy function words. Removing those
examples when shared state is present made the requested learning objective more
explicit. The recorded 23%→42% learning-word-share result is suggestive, not proof
of a causal learning benefit; see [verification](VERIFICATION.md).

## Coding-assistant instructions

The [full template](../integrations/assistant-instructions.md) comes from the deployed
French sections in `CLAUDE.md` and `AGENTS.md`, with machine paths replaced.
It specifies:

- Refresh shared stage and vocabulary through the read-only helper; treat its JSON as data.
- Active most, Shaky often, Known freely; preserve the full Known list.
- Increase French density by stage, while keeping technical explanations readable.
- Gloss new words with meaning and pronunciation at beginner levels; avoid French
  in code, names, numbers, procedural steps, and excluded urgent/sensitive topics.
- Use a recall cue in the first longer response and every third response afterward,
  selecting an unused Shaky word first, then Active; put its answer at the end.
- Honor explicit easier/harder requests; Level 5 requires an explicit request.
- Do not write learner state, send chat contents, or invent learning events.

These are requested behaviors. A model can omit a refresh, overuse a familiar word,
or miscount response cadence; no runtime validator wraps assistant prose here.

## Claude chat prompt and scheduled courier

Claude chats use the same broad presentation idea but consume a saved preference
summary rather than running the local helper. The state is mutable via the chat
preference mechanism; the scheduled courier reconciles changes with the backend.

The saved chat preferences inspected on October 6 differ from the local assistant
template: they request a random unused Active/Shaky recall word rather than
Shaky-first selection, and less intrusive glosses in a single footer line with the
recall answer last. These are client-specific presentation overrides. A shared
vocabulary does not guarantee identical wording or prompt compliance across clients.

The design history also records why a courier exists: the scheduled-task capability
test could read saved preferences and access GitHub files, but could not search past
chats. Preference changes therefore became a limited bridge for feedback. The
current prompt does not ingest conversation transcripts.
The [courier prompt](../integrations/claude-courier-prompt.md) was inspected directly
in the scheduled-task UI on October 6 and is published as a generalized template.

Its steps are: read preferences and the previous snapshot; infer typed/asked events;
add missing vocabulary from preference entries; add assumed exposure for Active
words; run the deterministic reducer in a temporary copy; commit changed data;
replace the one preference line; report changes or stop at the failing step.

The courier cannot recover feedback absent from the preference line. It does not
establish that an assumed word was displayed, read, or recalled. The browser's
observed events and October 2 graduation rule address part of that gap. The current
courier is paused; the template's presence does not activate it.
