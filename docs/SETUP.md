# Browser setup and operation

A personal Chrome extension that replaces a few English words with French while you read. Swaps stay sparse and context-sensitive; hover or focus shows the meaning, and click, Enter, or Space reveals English.

Version 0.3 makes the words you are learning the target: active and shaky words come first, known words are filler, the passage density ceiling is derived from sentence count, the meaning appears after a short pause (a `peek` when you wait for it), and rate-limited model calls cool down and retry instead of leaving passages English. Version 0.2 added shared GitHub vocabulary, durable learning-event uploads, Chrome preference sync, and site controls. The extension and **new sites default to on**. Turn an individual site off to blacklist it, or choose **New sites: Off by default** and enable only selected sites.

## Install and connect

For your own installation, first [configure a private learning backend](../learning/README.md#configure-your-own-system). The source retains the original owner’s repository name; a new user must change it to a repository they control.

1. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**. Select the folder containing `manifest.json`.
2. Open French Weave. Under **Model and settings**, enter your Gemini key and choose **Save key**.
3. Choose **Allow all websites** and accept Chrome's permission prompt to enable the default-on behavior beyond X. Alternatively, enable only the current site. Reload other already-open pages after granting access.
4. Under **Connect GitHub**, enter a fine-grained token scoped only to your configured private learning repository, with **Contents: read and write**. Choose **Save & sync**. Do not paste credentials into a chat, source file, or issue.
5. Confirm that the popup shows a successful check time and the shared word count. The existing GitHub reducer runs after event uploads; a follow-up check runs one minute later, with normal checks every 15 minutes.

The Gemini key and GitHub token stay in trusted local extension storage. They are not sent to content scripts or Chrome Sync. Both credentials must be configured on each device. A read-only GitHub token can download vocabulary but cannot upload learning events; those remain queued and the popup reports the error.

The manifest has a fixed public key, giving development installations the same ID: `ofpkibndoleiagkalmiaiipamklhalbl`. Install the same version on both devices and enable Chrome Sync for the same Chrome account to synchronize non-secret preferences. An older unpacked installation with a different ID has separate storage: configure this version before disabling the old copy. The public manifest key is an identifier, not a private signing key or credential. [Chrome manifest key](https://developer.chrome.com/docs/extensions/reference/manifest/key)

## Firefox

The same sources build a Firefox add-on (Firefox 142+): `bun run build:firefox` writes `dist/firefox/` and `dist/french-weave-firefox-<version>.zip`. Only the manifest differs (event-page background, gecko ID `french-weave@jackieoliver.github.io`, a `websiteContent` data-collection declaration). Firefox has no storage access levels, so credentials are kept in the extension origin's IndexedDB instead of `storage.local`, out of content scripts' reach.

- **Try it now (until Firefox restarts):** `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → `dist/firefox/manifest.json`.
- **Keep it installed:** release Firefox only installs signed add-ons. Create AMO API credentials at https://addons.mozilla.org/developers/addon/api/key/, then run `WEB_EXT_API_KEY=… WEB_EXT_API_SECRET=… bun run sign:firefox` (unlisted: signed for you, not published). Open the resulting `.xpi` from `dist/` in Firefox.
- Then enter the Gemini key and GitHub token in the add-on's popup and grant website access, as for Chrome. Firefox gets its own device ID and event file; preferences sync through Firefox Sync, not Chrome Sync.

## Controls

- **On:** global translation switch; turning it off restores the original text.
- **This site:** a remembered hostname exception, overriding the new-site default.
- **New sites:** on by default (blacklist) or off by default (allowlist).
- **Site exceptions → Reset:** remove an override and follow the default again.
- **Sync now:** refresh shared vocabulary and upload queued events.
- **Clear cache & retry:** invalidate decisions in storage and open tabs, including in-flight replies, then request fresh substitutions.
- **Force level:** optional override. Otherwise the downloaded learning stage is used; without downloaded state, the original date schedule applies. L3/L4 still use L2 rules and are labeled accordingly.

## What sync does

The configured private learning-data repository is the source of truth. The original deployment uses `jackieoliver/french-weave-data`; its personal records are not required to use this code. The extension validates `state.json`, prioritizes active/shaky words, and retains the last good state offline. Cache identity includes the vocabulary and settings, so a changed state takes effect in open pages.

Observed events are queued in local storage and uploaded to `events/extension-<device UUID>-<UTC month>.csv`. The format is `date,word,event,count,id`; the existing reducer reads these files without modification. IDs make retries safe even if GitHub committed a request whose response was lost. File SHA conflicts are re-read and merged. Device IDs and monthly files keep browser installations from replacing each other's records.

A `seen` event means a swapped word entered the visible viewport while the tab was visible; it is deduplicated to one word/day per installation. Prefetch does not count. A `flip` means the reader revealed English; toggling back to French does not count as another flip. A `peek` means the reader hovered or focused a word for 0.7 s, long enough for its meaning to appear; it is deduplicated to one word/day. In the data reducer a peek blocks an active word's graduation and two peek days within a week make a known word shaky. No page text, URLs, or credentials enter the learning-event files. Queued events survive worker restarts, failed uploads, and disconnection. The queue is bounded at 10,000 entries; reaching the limit produces an explicit error instead of silently deleting older events.

Chrome Sync carries only small non-secret settings and site exceptions (up to 80, within the storage quota). It does not install/update this unpacked extension, transport credentials, or replace GitHub learning sync. [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage)

## Reading behavior and scope

X/Twitter uses the existing tweet selector. Other permitted HTTP(S) sites use visible/near-visible prose blocks, at most 2,000 characters each, in batches of eight. New dynamic content is observed. The original text is preserved, including when a framework edits its text nodes.

Forms, editable regions, controls, code, hidden content, non-English blocks, and recognized excluded topics are skipped. Names and other context-sensitive cases also rely on the model's rules. Enabled reading passages are sent to Gemini; learning events contain only words and event metadata. Chrome internal pages and protected pages cannot run the extension. Text in unsupported structures, frames, or shadow roots may remain English.

The default model remains Gemini 3.8 Flash, with Gemini 3.5 Flash-Lite as fallback. Model calls were mocked for this change's automated tests; live model availability and output quality must be checked using your configured key.

## Verification and development

No bundler or framework. Use the existing locked dependency and test runner:

```sh
bun install --frozen-lockfile
bun test
git diff --check
```

The tests include worker/content integration, delayed responses, offline sync, worker restart, upload deduplication/conflicts, forbidden contexts, credential isolation, viewport exposure, dynamic content, and site controls. They never write to the real learning repo or call a live model.

See [verification](VERIFICATION.md) for this publication and [system architecture](shared-state-integration.md) for the learning backend and assistant paths.
