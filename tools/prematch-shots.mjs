#!/usr/bin/env node
// Photograph the pre-match loader through every state it can be in, at every
// viewport it has to survive, and audit the layout each shot was taken of.
//
//   node tools/prematch-shots.mjs
//   SR_OUT=/tmp/shots SR_LABEL=after node tools/prematch-shots.mjs
//
// The states come from the game's own functions via window.__dbg.pm, which
// mkdebug.py splices into the debug build only -- the same way the startup
// loader is posed for its review shots. So these are photographs of the real
// markup in the real state, not of a mock-up of it.
//
// The audit is here because a screenshot proves a layout is wrong only once a
// human looks at it, and this is twelve states times five viewports. It catches
// the failures this feature could introduce:
//
//   overflow   the document scrolls sideways
//   clipped    text wider or taller than the box drawn around it
//   moved      the countdown box changing size between 10 and 1
//   leaked     something under the loader still reachable by a click
//
// Output is gitignored. Nothing here ships.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ROOT = resolve(process.env.SR_ROOT || HERE);
const OUT = resolve(process.env.SR_OUT || join(HERE, 'docs', 'ui-review'));
const LABEL = process.env.SR_LABEL || 'after';
const PAGE = process.env.SR_PAGE || '__debug.html';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const VIEWPORTS = (process.env.SR_VIEWPORTS || '1920x1080,1366x768,1280x720,1024x768,390x844')
  .split(',').map((s) => { const [w, h] = s.split('x').map(Number); return { w, h, name: s }; });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

// The twelve states, in the order a player meets them. Each returns nothing --
// it drives the game's own loader functions and the shot is of whatever they
// leave on screen.
const STATES = [
  ['01-map-selected',  async (p) => p.evaluate(() => { __dbg.pm.close(); __dbg.pm.lobby(); })],
  ['02-start-pressed', async (p) => p.evaluate(() => { __dbg.pm.open(1); })],
  ['03-preparing-map', async (p) => p.evaluate(() => { __dbg.pm.open(1); __dbg.pm.map('sunny', 1); __dbg.pm.say('LOADING SUNNY SLOPES\u2026', ''); __dbg.pm.meter(1, 5); })],
  ['04-waiting',       async (p) => p.evaluate(() => { __dbg.pm.open(1); __dbg.pm.map('sunny', 1); __dbg.pm.say('WAITING FOR PLAYERS\u2026', '1 / 2 READY'); __dbg.pm.meter(4, 5); })],
  ['05-all-ready',     async (p) => p.evaluate(() => { __dbg.pm.open(1); __dbg.pm.map('sunny', 1); __dbg.pm.say('EVERYONE READY', '2 / 2 READY'); __dbg.pm.meter(1, 1); })],
  ['06-count-10',      async (p) => p.evaluate(() => { __dbg.pm.open(1); __dbg.pm.map('sunny', 1); __dbg.pm.count(10); })],
  ['07-count-5',       async (p) => p.evaluate(() => { __dbg.pm.count(5); })],
  ['08-count-3',       async (p) => p.evaluate(() => { __dbg.pm.count(3); })],
  ['09-count-2',       async (p) => p.evaluate(() => { __dbg.pm.count(2); })],
  ['10-count-1',       async (p) => p.evaluate(() => { __dbg.pm.count(1); })],
  ['11-error',         async (p) => p.evaluate(() => { __dbg.pm.open(1); __dbg.pm.map('sunny', 1); __dbg.pm.fail('Could not prepare Sunny Slopes.'); })],
  ['12-first-frame',   async (p) => p.evaluate(() => { __dbg.pm.race('sunny'); })],
];

// SETTLE FIRST. The countdown pops with a scale(1.28), the meter slides, and
// the loader fades -- photograph or measure 260ms in and you catch a frame
// mid-transform, which reads as "the document scrolls sideways" and is gone by
// the next frame. Wait for the page's own animations to finish instead of
// guessing at a delay.
async function settle(page) {
  await page.evaluate(async () => {
    const running = document.getAnimations().filter((a) => a.playState === 'running');
    await Promise.race([
      Promise.all(running.map((a) => a.finished.catch(() => {}))),
      new Promise((r) => setTimeout(r, 1200)),
    ]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

// What the shot is of, measured rather than eyeballed.
//
// `baseOverflow` is what this page already overflowed by with the loader shut:
// #menuRings is 2497 wide at 1920 and has been since long before this feature,
// so reporting it here would be reporting somebody else's bug every run and
// teaching everyone to ignore the line that matters.
async function audit(page, state, baseOverflow) {
  return page.evaluate(({ stateName, base }) => {
    const out = { state: stateName, problems: [] };
    const doc = document.documentElement;
    const box = document.getElementById('matchLoader');

    // OVERFLOW THIS FEATURE IS RESPONSIBLE FOR, which means overflow caused by
    // something inside the loader. The lobby's #menuRings is a rotating
    // decoration that already extends past every viewport -- measured at 1794
    // on origin/main at 1366 against 1785 here, and at 390 the baseline is
    // WORSE -- so a bare document-width test reports somebody else's bug on
    // every run and teaches everyone to ignore the line that matters.
    if (doc.scrollWidth > doc.clientWidth + 1) {
      const mine = [];
      for (const el of (box ? box.querySelectorAll('*') : [])) {
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > doc.clientWidth + 1 || r.left < -1)) {
          mine.push(`${el.id ? '#' + el.id : el.className || el.tagName} right=${Math.round(r.right)}`);
        }
      }
      if (mine.length) out.problems.push(`the loader overflows sideways: ${mine.slice(0, 3).join(', ')}`);
    }
    out.loaderUp = box ? !box.classList.contains('hidden') : false;

    if (out.loaderUp) {
      // Nothing under a full-screen layer may take a click.
      const W = window.innerWidth, H = window.innerHeight;
      for (const [x, y] of [[W / 2, H / 2], [12, 12], [W - 12, H - 12]]) {
        const el = document.elementFromPoint(x, y);
        if (el && el !== box && !box.contains(el)) {
          out.problems.push(`click at ${Math.round(x)},${Math.round(y)} reaches ${el.id ? '#' + el.id : el.tagName}`);
        }
      }
      // CLIPPED text, not merely text whose line box is taller than its
      // content box. .mlName sets line-height 1.05 on purpose, so its
      // scrollHeight exceeds clientHeight on every single-line heading in the
      // game -- reporting that would flag a deliberate style as a defect at
      // every viewport. Only an element that actually HIDES its overflow can
      // clip anything.
      for (const id of ['mlName', 'mlMsg', 'mlNote', 'mlTip', 'mlCountNum', 'mlFailMsg']) {
        const e = document.getElementById(id);
        if (!e || !e.offsetParent) continue;
        const cs = getComputedStyle(e);
        const hidesX = cs.overflowX !== 'visible', hidesY = cs.overflowY !== 'visible';
        if (hidesX && e.scrollWidth > e.clientWidth + 1) out.problems.push(`#${id} text is clipped horizontally`);
        if (hidesY && e.scrollHeight > e.clientHeight + 1) out.problems.push(`#${id} text is clipped vertically`);
        const r = e.getBoundingClientRect();
        if (r.width && (r.right > window.innerWidth + 1 || r.left < -1)) out.problems.push(`#${id} runs off the side`);
      }
      const c = document.getElementById('mlCount');
      if (c && !c.classList.contains('hidden')) {
        const r = c.getBoundingClientRect();
        out.countBox = { w: Math.round(r.width), h: Math.round(r.height) };
      }
      const art = document.getElementById('mlArt');
      if (art && art.offsetParent) {
        const r = art.getBoundingClientRect();
        out.art = { w: Math.round(r.width), h: Math.round(r.height) };
        if (r.height > window.innerHeight * 0.55) out.problems.push(`the map preview takes ${Math.round(r.height / window.innerHeight * 100)}% of the height`);
      }
    }
    return out;
  }, { stateName: state, base: baseOverflow });
}

const main = async () => {
  await mkdir(OUT, { recursive: true });
  const server = createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\//, '') || PAGE;
    try {
      const buf = await readFile(join(ROOT, p));
      res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
      res.end(buf);
    } catch { res.writeHead(404); res.end('no'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/${PAGE}`;

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const audits = [];
  let shots = 0;

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('typeof window.__dbg === "object" && typeof window.__dbg.pm === "object"', { timeout: 180000, polling: 250 });

    // What this page already overflows by with no loader up. Anything above
    // this line is ours; anything at it is not.
    await page.evaluate(() => { try { __dbg.pm.close(); goHome(); } catch (e) {} });
    await settle(page);
    const baseOverflow = await page.evaluate(() => document.documentElement.scrollWidth);

    for (const [name, pose] of STATES) {
      await pose(page);
      await settle(page);
      await page.screenshot({ path: join(OUT, `${name}--${vp.name}--${LABEL}.png`) });
      shots += 1;
      audits.push({ viewport: vp.name, ...(await audit(page, name, baseOverflow)) });
    }
    await page.close();
  }

  await browser.close();
  server.close();

  const bad = audits.filter((a) => a.problems.length);
  // The countdown box must not change size between 10 and 1, per viewport.
  for (const vp of VIEWPORTS) {
    const ten = audits.find((a) => a.viewport === vp.name && a.state === '06-count-10');
    const one = audits.find((a) => a.viewport === vp.name && a.state === '10-count-1');
    if (ten?.countBox && one?.countBox
        && (ten.countBox.w !== one.countBox.w || ten.countBox.h !== one.countBox.h)) {
      bad.push({ viewport: vp.name, state: 'countdown', problems: [`the box resizes from ${ten.countBox.w}x${ten.countBox.h} at 10 to ${one.countBox.w}x${one.countBox.h} at 1`] });
    }
  }

  await writeFile(join(OUT, `audit-${LABEL}.json`), JSON.stringify({ audits, bad }, null, 2));

  // THE CONTACT SHEET. One page, every state down the side and every viewport
  // across, with what the audit said about each printed beside it. HTML rather
  // than a composited image because these are up to 1920px wide and a grid of
  // them baked into one file is unreadable at any size that fits on a screen --
  // here they stay full resolution and a click opens the original.
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = STATES.map(([name]) => {
    const cells = VIEWPORTS.map((vp) => {
      const a = audits.find((z) => z.viewport === vp.name && z.state === name);
      const probs = a && a.problems.length
        ? `<p class="bad">${a.problems.map(esc).join('<br>')}</p>` : '';
      return `<td><div class="vp">${esc(vp.name)}</div>
        <a href="${name}--${vp.name}--${LABEL}.png" target="_blank">
          <img src="${name}--${vp.name}--${LABEL}.png" loading="lazy"></a>${probs}</td>`;
    }).join('');
    return `<tr><th>${esc(name)}</th>${cells}</tr>`;
  }).join('');
  await writeFile(join(OUT, 'prematch-sheet.html'), `<!doctype html><meta charset="utf-8">
<title>Scramble Rush - pre-match loader review</title>
<style>
 body{background:#14102a;color:#f3ecff;font:14px/1.4 system-ui,sans-serif;margin:24px}
 h1{font-size:18px;margin:0 0 4px} p.sub{opacity:.7;margin:0 0 20px}
 table{border-collapse:collapse} th{text-align:left;padding:10px 14px 10px 0;vertical-align:top;white-space:nowrap}
 td{padding:0 14px 26px 0;vertical-align:top}
 img{width:320px;border:2px solid #2c2450;border-radius:8px;display:block;background:#000}
 .vp{opacity:.55;font-size:12px;margin-bottom:4px}
 .bad{color:#ff9db5;max-width:320px;font-size:12px;margin:6px 0 0}
</style>
<h1>Pre-match loader — ${esc(LABEL)}</h1>
<p class="sub">${STATES.length} states x ${VIEWPORTS.length} viewports. ${bad.length ? bad.length + ' problem(s).' : 'No overflow, clipping or pointer leakage; the countdown box holds its size.'}</p>
<table>${rows}</table>`);
  console.log(`contact sheet: ${join(OUT, 'prematch-sheet.html')}`);
  console.log(`${shots} shots across ${VIEWPORTS.length} viewports -> ${OUT}`);
  if (bad.length) {
    console.log(`\n${bad.length} layout problem(s):`);
    for (const b of bad) console.log(`  ${b.viewport} ${b.state}: ${b.problems.join('; ')}`);
    process.exitCode = 1;
  } else {
    console.log('no overflow, no clipping, no pointer leakage, and the countdown box holds its size.');
  }
};

main().catch((e) => { console.error(e); process.exit(1); });
