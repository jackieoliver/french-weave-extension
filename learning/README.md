# Learning backend

`reduce.mjs` is the deployed dependency-free Node.js algorithm. It expects inputs
alongside itself and writes outputs there. Use a separate private repository for
real learner records. This public repository contains code and synthetic tests.

| Input | Format and owner |
| --- | --- |
| `lexicon.csv` | `fr,en,hint`; canonical vocabulary in queue order. |
| `events/seed.csv` | Initial `active`/`known` events; bypass the admission cap. |
| `events/extension-<device>-<month>.csv` | `date,word,event,count,id`; browser `seen`, `flip`, `peek`. |
| `events/claude.csv` | `date,word,event,count`; courier `typed`, `asked`, `assumed`. |
| `events/fixes.csv` | Deliberate corrections separate from other writers. |

Outputs: `words.csv` (full ledger), `state.json` (Active/Shaky/Known, version and
stage), and `state-line.txt` (compact chat summary). Matching preserves accents,
normalizing case, apostrophes and whitespace. Unknown words and bad dates produce
warnings. Replay uses UTC days. The uploader deduplicates event IDs; the reducer
does not globally deduplicate every writer's IDs. Writers own that contract.

## Offline check

```sh
node learning/test-reducer.mjs
```

The test copies the reducer into temporary folders, creates synthetic records,
verifies replay, and removes those temporary folders. No network or user data.

## Configure your own system

1. Put the reducer, your lexicon and an `events/` directory in a private repository.
2. Run `node reduce.mjs` there to generate the outputs.
3. Run reduction after inputs change and daily for quiet-day recovery. The original
   deployment uses GitHub Actions with input-only path filters, serialized runs,
   and commits only changed outputs. Output commits must not retrigger the workflow.
4. Set `DATA_REPO` in `src/sync.js` and `ENDPOINT` in `integrations/read-state.py`
   to your repository before connecting clients.
5. Browser uploads need Contents read/write access. The coding-assistant reader
   uses an existing `gh` login and sends GET requests only. Never commit credentials.

The helper caches to `integrations/state.json` (gitignored). Replace absolute paths
in [the assistant template](../integrations/assistant-instructions.md), then place
its section in your Claude Code/Codex instruction file. Cloning does not install it.
