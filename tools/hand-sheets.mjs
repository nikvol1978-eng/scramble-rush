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

const COMPARE = [['hand-v6-front', 'front — the digit face straight on']];
const FULL = [
  ['character-v6-neutral-front', 'neutral'], ['character-v6-run-front', 'run'],
  ['character-v6-jump-front', 'jump'], ['character-v6-dive-front', 'dive'],
  ['character-v6-neutral-34', 'neutral 3/4'], ['character-v6-run-34', 'run 3/4'],
  ['character-v6-jump-34', 'jump 3/4'], ['character-v6-dive-34', 'dive 3/4'],
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

const cmpRows = [];
for (const [name, label] of COMPARE) {
  const o = `${name}-v5.png`, n = `${name}.png`;
  if (!have.has(o) || !have.has(n)) continue;
  cmpRows.push(`
    <figure class="old"><img src="${await b64(o)}">
      <figcaption>${label}<span class="tag">V5 — before</span></figcaption></figure>
    <figure class="new"><img src="${await b64(n)}">
      <figcaption>${label}<span class="tag">V6 — after</span></figcaption></figure>`);
}
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
  ['hand-v6-before-after-front.png',
   page('Scramble Rush hand — V5 before / V6 after, front',
        'Same camera, same lighting, same pose. The V5 side is V5 geometry actually running: it was never committed, so it was rebuilt from the diff of the working tree it lived in and checked against the roughness the real V5 measured before it was replaced — rail p95 90.10 / max 125.50, ring p95 45.86 / max 87.01, to the hundredth.',
        cmpRows.join(''), 2), 1500],
  ['character-v6-contact-sheet.png',
   page('Full character contact sheet — V6',
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
