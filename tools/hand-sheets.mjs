#!/usr/bin/env node
// Tile the review shots into the two sheets a reviewer actually looks at:
// V5 against V6 on the same views, and the whole racer across its poses.
//
//   node tools/hand-sheets.mjs        # after tools/hand-review.mjs has run
//
// The pictures are laid out in a page and photographed rather than composited
// pixel by pixel, because the labels matter as much as the images -- an
// unlabelled before/after is just two pictures and the reviewer has to be told
// which is which in prose, which is exactly how the wrong one gets approved.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import puppeteer from 'puppeteer';

const HERE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIR = resolve(process.env.SR_OUT || join(HERE, 'docs', 'hand-review'));
const have = new Set(await readdir(DIR));
const b64 = async f => `data:image/png;base64,${(await readFile(join(DIR, f))).toString('base64')}`;

const REF_PAIRS = [
  ['hand-v9-palm',  'reference/ref-palm',  'palm / front'],
  ['hand-v9-34',    'reference/ref-34',    'three-quarter'],
  ['hand-v9-side',  'reference/ref-side',  'side'],
  ['hand-v9-under', 'reference/ref-back',  'underside / back'],
  ['hand-v9-end',   'reference/ref-endon', 'end-on'],
];
// Three columns, not two. V6 is what is live on nikcade.win and V8 is the pass
// that was rejected for reading as a forearm with two balls hanging off it --
// and the interesting comparison is all three at once, because the complaint
// about each pass was that it had not moved far enough from the one before.
const PROD_TRIOS = [
  ['hand-v9-lobby',  'hand-v8-lobby',  'hand-v7-lobby-v6',  'lobby distance'],
  ['hand-v9-locker', 'hand-v8-locker', 'hand-v7-locker-v6', 'Locker distance'],
  ['hand-v9-palm',   'hand-v8-palm',   'hand-v7-palm-v6',   'palm, close'],
  ['hand-v9-34',     'hand-v8-34',     'hand-v7-34-v6',     'three-quarter, close'],
];
const FULL = [
  ['character-v9-neutral-front','neutral'], ['character-v9-run-front','run'],
  ['character-v9-jump-front','jump'],       ['character-v9-dive-front','dive'],
  ['character-v9-neutral-34','neutral 3/4'],['character-v9-run-34','run 3/4'],
  ['character-v9-jump-34','jump 3/4'],      ['character-v9-dive-34','dive 3/4'],
];

const css = `
  body{margin:0;background:#151820;color:#e8ecf4;font:14px/1.4 system-ui,sans-serif}
  h1{font-size:20px;margin:22px 24px 4px} p{margin:0 24px 18px;color:#96a0b4;font-size:13px}
  .grid{display:grid;gap:14px;padding:0 24px 24px}
  figure{margin:0;background:#1d2029;border-radius:10px;overflow:hidden}
  img{display:block;width:100%;height:auto}
  figcaption{padding:7px 10px;font-size:12px;color:#aab4c8;border-top:1px solid #2a2f3b}
  .tag{float:right;font-weight:600}
  .old .tag{color:#ff8b7a} .new .tag{color:#7ee3a8}
`;

const pair = async (rows, aTag, bTag, aCls, bCls) => {
  const out = [];
  for (const [A, B, label] of rows) {
    if (!have.has(`${A}.png`)) continue;
    const bPath = B.includes('/') ? B + '.png' : `${B}.png`;
    let bImg = null;
    try { bImg = await b64(bPath); } catch { continue; }
    out.push(`
      <figure class="${aCls}"><img src="${await b64(A + '.png')}">
        <figcaption>${label}<span class="tag">${aTag}</span></figcaption></figure>
      <figure class="${bCls}"><img src="${bImg}">
        <figcaption>${label}<span class="tag">${bTag}</span></figcaption></figure>`);
  }
  return out.join('');
};
const trio = async rows => {
  const out = [];
  for (const [A, B, C, label] of rows) {
    if (!have.has(`${A}.png`)) continue;
    let bImg, cImg;
    try { bImg = await b64(`${B}.png`); cImg = await b64(`${C}.png`); } catch { continue; }
    out.push(`
      <figure class="new"><img src="${await b64(A + '.png')}">
        <figcaption>${label}<span class="tag">V9 — this pass</span></figcaption></figure>
      <figure class="old"><img src="${bImg}">
        <figcaption>${label}<span class="tag">V8 — rejected</span></figcaption></figure>
      <figure class="old"><img src="${cImg}">
        <figcaption>${label}<span class="tag">V6 — live</span></figcaption></figure>`);
  }
  return out.join('');
};
const refRows  = await pair(REF_PAIRS, 'V9', 'official model', 'new', 'old');
const prodRows = await trio(PROD_TRIOS);
const fullCells = [];
for (const [name, label] of FULL) {
  if (!have.has(`${name}.png`)) continue;
  fullCells.push(`<figure class="new"><img src="${await b64(`${name}.png`)}">
    <figcaption>${label}</figcaption></figure>`);
}

const page = (title, note, grid, cols) => `<!doctype html><meta charset="utf-8">
<style>${css}.grid{grid-template-columns:repeat(${cols},1fr)}</style>
<h1>${title}</h1><p>${note}</p><div class="grid">${grid}</div>`;

const SHEETS = [
  ['hand-v9-reference-compare.png',
   page('Scramble Rush hand V9 vs the official model',
        'REVIEW ONLY. The reference is rendered from the local GLB for visual and proportional guidance; no geometry, topology or asset from it is used, and neither it nor these sheets are tracked or shipped. Views are approximately matched, not identical cameras.',
        refRows, 2), 1500],
  ['hand-v9-production-compare.png',
   page('Scramble Rush hand — V6 live / V8 rejected / V9 this pass',
        'Same camera, same lighting, same pose in every column. V6 is the geometry currently on nikcade.win, V8 is the pass rejected for reading as a forearm with two balls hanging off it, V9 is this branch. The top two rows are production framing, which is THE gate -- the close-ups below are secondary evidence, and a hand that only works in a close-up has failed.',
        prodRows, 3), 1900],
  ['character-v9-contact-sheet.png',
   page('Full character contact sheet — V9',
        'The whole racer across its poses, so a hand pass can be checked for having quietly changed something that is not a hand.',
        fullCells.join(''), 4), 1700],
];

const server = createServer((req, res) => {
  const s = SHEETS.find(([n]) => req.url === '/' + n.replace('.png', '.html'));
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(s ? s[1] : '<h1>no such sheet</h1>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await puppeteer.launch({ headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'] });
try {
  await mkdir(DIR, { recursive: true });
  for (const [name, , width] of SHEETS) {
    const p = await browser.newPage();
    await p.setViewport({ width, height: 1000 });
    await p.goto(`http://127.0.0.1:${port}/${name.replace('.png', '.html')}`, { waitUntil: 'networkidle0' });
    await p.screenshot({ path: join(DIR, name), fullPage: true });
    console.log('  ' + join(DIR, name));
    await p.close();
  }
} finally { await browser.close(); server.close(); }
