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

// What the shot is of, measured rather than eyeballed.
async function audit(page, state) {
  return page.evaluate((stateName) => {
    const out = { state: stateName, problems: [] };
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) {
      out.problems.push(`document scrolls sideways: ${doc.scrollWidth} > ${doc.clientWidth}`);
    }
    const box = document.getElementById('matchLoader');
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
      // Text that does not fit the box drawn around it.
      for (const id of ['mlName', 'mlMsg', 'mlNote', 'mlTip', 'mlCountNum', 'mlFailMsg']) {
        const e = document.getElementById(id);
        if (!e || !e.offsetParent) continue;
        if (e.scrollWidth > e.clientWidth + 1) out.problems.push(`#${id} text is wider than its box`);
        if (e.scrollHeight > e.clientHeight + 1) out.problems.push(`#${id} text is taller than its box`);
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
  }, state);
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

    for (const [name, pose] of STATES) {
      await pose(page);
      await new Promise((r) => setTimeout(r, 260));      // let a transition land
      await page.screenshot({ path: join(OUT, `${name}--${vp.name}--${LABEL}.png`) });
      shots += 1;
      audits.push({ viewport: vp.name, ...(await audit(page, name)) });
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
