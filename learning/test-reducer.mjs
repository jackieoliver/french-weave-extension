// Synthetic replay only; never reads or writes the owner's learning repository.
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
function replay(events, date = '2026-10-05') {
  const dir = mkdtempSync(join(tmpdir(), 'french-weave-replay-'));
  try {
    copyFileSync(new URL('./reduce.mjs', import.meta.url), join(dir, 'reduce.mjs'));
    mkdirSync(join(dir, 'events'));
    writeFileSync(join(dir, 'lexicon.csv'), 'fr,en,hint\n' + Array.from({length:25}, (_, i) => `word${i},example,hint`).join('\n') + '\n');
    writeFileSync(join(dir, 'events/seed.csv'), 'date,word,event,count\n2026-10-02,word0,active,1\n');
    writeFileSync(join(dir, 'events/test.csv'), 'date,word,event,count\n' + events.join('\n') + '\n');
    const run = () => execFileSync(process.execPath, ['reduce.mjs', date], {cwd:dir});
    const read = () => ['words.csv','state.json','state-line.txt'].map(f => readFileSync(join(dir,f),'utf8'));
    run(); const first=read(); run(); assert.deepEqual(read(),first);
    return JSON.parse(first[1]);
  } finally { rmSync(dir,{recursive:true,force:true}); }
}
const assumed=['02','03','04'].map(d=>`2026-10-${d},word0,assumed,1`);
const status=s=>s.words.find(w=>w.fr==='word0').status;
assert.equal(status(replay(assumed)),'active');
assert.equal(status(replay([...assumed,'2026-10-03,word0,seen,1'])),'known');
assert.equal(status(replay([...assumed,'2026-10-03,word0,seen,1','2026-10-04,word0,peek,1'])),'active');
assert.equal(status(replay(['2026-10-02,word0,typed,1'])),'known');
assert.equal(status(replay(['2026-10-02,word0,typed,1','2026-10-03,word0,asked,1'])),'shaky');
assert.equal(replay([],'2026-10-02').words.filter(w=>w.status==='active').length,6);
assert.equal(replay([],'2026-10-06').words.filter(w=>w.status==='active').length,20);
const shaky=Array.from({length:5},(_,i)=>`2026-10-02,word${i},asked,1`);
assert.equal(replay(shaky,'2026-10-02').words.filter(w=>w.status==='active').length,0);
console.log('PASS: replay, observed exposure, peek gate, typed/asked, admission cap, active window, shaky brake');
