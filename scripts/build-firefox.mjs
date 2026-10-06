// Builds the Firefox package from the same sources: dist/firefox/ (load as a temporary add-on, or sign)
// and dist/french-weave-firefox-<version>.zip. Only the manifest differs: an event-page background,
// a gecko ID instead of Chrome's public key, and a data-collection declaration.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url).pathname;
const out = `${root}dist/firefox/`;
const manifest = JSON.parse(await readFile(`${root}manifest.json`, 'utf8'));

delete manifest.key;
manifest.background = { scripts: ['src/background.js'], type: 'module' };
manifest.browser_specific_settings = {
  gecko: {
    id: 'french-weave@jackieoliver.github.io',
    strict_min_version: '142.0',
    // Enabled reading passages are sent to the configured model provider.
    data_collection_permissions: { required: ['websiteContent'] },
  },
};

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(`${root}src`, `${out}src`, { recursive: true });
await writeFile(`${out}manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
const zip = `${root}dist/french-weave-firefox-${manifest.version}.zip`;
await rm(zip, { force: true });
execFileSync('zip', ['-qr', zip, 'manifest.json', 'src'], { cwd: out });
console.log(`built ${out} and ${zip}`);
