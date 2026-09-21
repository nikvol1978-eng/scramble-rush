#!/usr/bin/env node
// Build a contact sheet from whatever meta-shots.mjs has photographed.
//
//   node tools/contact-sheet.mjs
//   SR_OUT=docs/ui-review SR_BEFORE=before SR_AFTER=after node tools/contact-sheet.mjs
//
// One HTML page, pairing each screen's BEFORE with its AFTER at every viewport
// it was shot at, with the audit counts printed beside them. HTML rather than a
// composited JPEG because the shots are 1920px wide and a grid of them baked
// into one image is unreadable at any size that fits on screen -- here they
// stay full resolution and a click opens the original.
//
// The sheet and the shots are gitignored. Nothing here ships.
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(process.env.SR_OUT || join(HERE, 'docs', 'ui-review'));
const BEFORE = process.env.SR_BEFORE || 'before';
const AFTER = process.env.SR_AFTER || 'after';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function loadAudit(label) {
  try { return JSON.parse(await readFile(join(OUT, `audit-${label}.json`), 'utf8')); }
  catch { return null; }
}

const main = async () => {
  const files = (await readdir(OUT)).filter((f) => f.endsWith('.png'));
  // <screen>--<viewport>--<label>.png
  const shots = new Map();          // screen -> viewport -> label -> file
  for (const f of files) {
    const m = basename(f, '.png').split('--');
    if (m.length !== 3) continue;
    const [screen, viewport, label] = m;
    if (!shots.has(screen)) shots.set(screen, new Map());
    const byVp = shots.get(screen);
    if (!byVp.has(viewport)) byVp.set(viewport, {});
    byVp.get(viewport)[label] = f;
  }

  const aBefore = await loadAudit(BEFORE);
  const aAfter = await loadAudit(AFTER);
  const countOf = (audit, screen, viewport) => {
    if (!audit) return null;
    const r = audit.report.find((x) => x.screen === screen && x.viewport === viewport);
    if (!r) return null;
    const n = (k) => (r[k] || []).length;
    return { overlap: n('overlap'), clipped: n('clipped'), offscreen: n('offscreen'),
             stacked: n('stacked'), notes: n('notes') };
  };
  const badge = (c) => {
    if (!c) return '<span class="chip none">not shot</span>';
    const total = c.overlap + c.clipped + c.offscreen + c.stacked + c.notes;
    if (!total) return '<span class="chip ok">clean</span>';
    const bits = [];
    if (c.overlap) bits.push(`${c.overlap} overlap`);
    if (c.clipped) bits.push(`${c.clipped} clipped`);
    if (c.offscreen) bits.push(`${c.offscreen} offscreen`);
    if (c.stacked) bits.push(`${c.stacked} stacked`);
    if (c.notes) bits.push(`${c.notes} covered`);
    return `<span class="chip bad">${esc(bits.join(' &middot; '))}</span>`;
  };

  const rows = [];
  for (const [screen, byVp] of [...shots].sort()) {
    rows.push(`<h2 id="${esc(screen)}">${esc(screen)}</h2>`);
    for (const [viewport, labels] of [...byVp].sort()) {
      const b = labels[BEFORE], a = labels[AFTER];
      if (!b && !a) continue;
      rows.push(`<section class="pair">
        <div class="vp">${esc(viewport)}</div>
        <figure>
          <figcaption>before ${badge(countOf(aBefore, screen, viewport))}</figcaption>
          ${b ? `<a href="${esc(b)}" target="_blank"><img loading="lazy" src="${esc(b)}" alt="${esc(screen)} before"></a>`
              : '<div class="missing">no before shot</div>'}
        </figure>
        <figure>
          <figcaption>after ${badge(countOf(aAfter, screen, viewport))}</figcaption>
          ${a ? `<a href="${esc(a)}" target="_blank"><img loading="lazy" src="${esc(a)}" alt="${esc(screen)} after"></a>`
              : '<div class="missing">no after shot</div>'}
        </figure>
      </section>`);
    }
  }

  const nav = [...shots.keys()].sort()
    .map((s) => `<a href="#${esc(s)}">${esc(s)}</a>`).join('');

  const totals = (audit) => {
    if (!audit) return 'n/a';
    const t = { overlap: 0, clipped: 0, offscreen: 0, stacked: 0, notes: 0 };
    for (const r of audit.report) for (const k of Object.keys(t)) t[k] += (r[k] || []).length;
    return `${t.overlap} overlapping &middot; ${t.clipped} clipped &middot; ${t.offscreen} offscreen &middot; ${t.stacked} stacked &middot; ${t.notes} covered`;
  };

  const html = `<!doctype html>
<meta charset="utf-8">
<title>Scramble Rush v25 &mdash; UI contact sheet</title>
<style>
  :root{ color-scheme:dark; }
  body{ margin:0; padding:28px; background:#150c2e; color:#fff8ec;
        font:15px/1.5 ui-sans-serif,system-ui,sans-serif; }
  h1{ margin:0 0 6px; font-size:1.5rem; }
  .sum{ opacity:.8; margin:0 0 18px; }
  .sum b{ color:#23e6c9; }
  nav{ position:sticky; top:0; background:#150c2e; padding:10px 0 14px;
       border-bottom:2px solid #2b1d5c; margin-bottom:18px; z-index:2; }
  nav a{ display:inline-block; margin:0 10px 6px 0; color:#ffcb3d; text-decoration:none;
         border:1px solid #3b2a7a; border-radius:999px; padding:3px 12px; font-size:.82rem; }
  nav a:hover{ background:#3b2a7a; }
  h2{ margin:30px 0 10px; font-size:1.05rem; letter-spacing:1px; text-transform:uppercase; color:#23e6c9; }
  .pair{ display:grid; grid-template-columns:96px 1fr 1fr; gap:14px; align-items:start;
         margin-bottom:18px; padding-bottom:18px; border-bottom:1px solid #2b1d5c; }
  .vp{ font-size:.78rem; opacity:.7; padding-top:26px; }
  figure{ margin:0; min-width:0; }
  figcaption{ font-size:.76rem; opacity:.85; margin-bottom:6px; display:flex; gap:8px; align-items:center; }
  img{ width:100%; height:auto; display:block; border:2px solid #3b2a7a; border-radius:8px; background:#000; }
  .missing{ padding:28px; text-align:center; border:2px dashed #3b2a7a; border-radius:8px; opacity:.6; font-size:.8rem; }
  .chip{ border-radius:999px; padding:2px 9px; font-size:.7rem; font-weight:700; }
  .chip.ok{ background:#0f5132; color:#a7f3d0; }
  .chip.bad{ background:#5b1720; color:#fecaca; }
  .chip.none{ background:#2b1d5c; color:#c7bde8; }
  @media (max-width:820px){ .pair{ grid-template-columns:1fr; } .vp{ padding-top:0; } }
</style>
<h1>Scramble Rush v25 &mdash; UI contact sheet</h1>
<p class="sum">
  before: <b>${totals(aBefore)}</b><br>
  after: <b>${totals(aAfter)}</b>
</p>
<nav>${nav}</nav>
${rows.join('\n')}
`;

  const out = join(OUT, 'contact-sheet.html');
  await writeFile(out, html);
  const { size } = await stat(out);
  console.log(`contact sheet -> ${out}  (${(size / 1024).toFixed(0)} KB, ${files.length} shots)`);
};

main().catch((e) => { console.error(e); process.exit(1); });
