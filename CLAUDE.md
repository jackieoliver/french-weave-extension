# Repository notes

Read README.md and docs/shared-state-integration.md for current scope. Default branch: main.

Use `bun test`, `python3 integrations/test-read-state.py`, and `node learning/test-reducer.mjs` for offline checks. Keep fixtures synthetic. Never run tests against the owner's learning records, upload synthetic events, or commit credentials, local state, real-timeline inputs, or chat transcripts. Browser source uses ES modules without a bundler. Provider calls and storage are injected in tests.
