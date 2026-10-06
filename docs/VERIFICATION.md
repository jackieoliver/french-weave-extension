# Verification and provenance

## October 6, 2026 publication

- Browser source/build/tests copied from working commit `fe735c82db89f58adfd69acf981d1ada2e963f04` (version 0.3.0). The source branch and remote head matched at inspection.
- `bun install --frozen-lockfile` and `bun test`: **57 pass, 0 fail, 775 assertions**, including DOM, worker restart, stale replies, cache invalidation, event upload conflict/lost-response recovery, site controls, and credential-vault adapters.
- `python3 integrations/test-read-state.py`: mocked GET response, fresh/expired cache, timeout/offline/invalid-data fallback, full Known list, and accent handling passed with synthetic vocabulary.
- `node learning/test-reducer.mjs`: synthetic isolated replay checks; no owner learning files are read or changed.
- `bun run build:firefox`: generated the manifest and ZIP successfully. This is packaging validation, not signing, store publication, or a Firefox runtime test.
- The reader comes from the deployed Mac helper, with executable paths made portable. The reducer is copied byte-for-byte from the inspected learning-data checkout at `8793c15543ac61ebd52dd604ae7f22a3443dcb00`.

Model calls and GitHub event uploads are mocked in these checks. No new live model
quality result, two-machine convergence result, or browser installation is claimed.
The default model IDs still require availability verification with an authorized key.

## Historical evidence

The September 22 development record reports live Chrome translation, English reveal,
site exclusions, and authenticated vocabulary download. Later source includes
changes not covered by that dated browser check.

The October 2 working-project evaluation compared two prompts over 27 passages,
two runs each (54 passages per condition):

| Measure | Earlier prompt | Learning-first prompt |
| --- | --- | --- |
| Swaps per passage | 0.56 | 0.70 |
| Empty passages | 28 / 54 | 21 / 54 |
| Learning-word share of swaps | 23% | 42% |
| Active words used | 3 / 10 | 6 / 10 |

All newer-prompt batches were answered by the fallback model; the earlier run did
not record the answering model. Sampling/model variation and the small fixture
prevent treating this as a controlled estimate. It measures substitutions, not
language acquisition. Real-timeline input text and user learning state are omitted.
The [evaluation runner](../eval/active-share.mjs) requires your own local inputs and
makes provider calls when invoked with credentials; it is not part of offline tests.

## History used to explain the decisions

The documentation was checked against the September 21 backend design conversation,
September 22 shared-state implementation conversation, October 2 prompt/feedback
review, and October 5 coding-assistant integration check. The installed helper,
instruction files, current source, reducer, and October 6 live courier instructions
were inspected independently. Chats explain intent; source establishes behavior.
Raw transcripts, personal memory, credentials, and event history are not published.

The cloud courier was visibly **paused** on October 6, with October 4 as the latest
listed run. Its saved prompt is represented in the generalized template. Historical
claims that it ran daily are not claims about its current scheduling state.
