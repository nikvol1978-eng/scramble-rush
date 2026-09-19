#!/usr/bin/env node
// Photograph the lobby, for visual review.
//
//   node tools/lobby-shots.mjs
//   SR_OUT=/tmp/shots SR_LABEL=before node tools/lobby-shots.mjs
//
// Rendering is ON: these are pictures, and a picture of a scene that was never
// rasterised is a black rectangle. Quality is pinned to 'high' so the shots
// show the shipping look rather than the CI fallback.
//
// Shots are written for a set of viewports, plus a face close-up taken by
// moving the LENS rather than by cropping the PNG -- a crop of a 1280-wide
// frame has about ninety pixels of face in it, which is not enough to judge an
// eye by. The close-up restores the lobby camera afterwards so a later shot in
// the same run is not taken through it.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const HERE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ROOT = resolve(process.env.SR_ROOT || HERE);
const OUT = resolve(process.env.SR_OUT || join(HERE, 'docs', 'lobby-review'));
const LABEL = process.env.SR_LABEL || 'new';
const ONLY = (process.env.SR_SHOTS || '').split(',').map((s) => s.trim()).filter(Boolean);

const VIEWPORTS = [
  ['1920x1080', 1920, 1080],
  ['1600x900', 1600, 900],
  ['1366x768', 1366, 768],
  ['1280x720', 1280, 720],
  ['narrow', 820, 900],
  ['phone', 430, 860],
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

let server, browser;
const shutdown = async () => {
  if (browser) { try { await browser.close(); } catch { /* gone */ } }
  if (server) { try { await new Promise((r) => server.close(r)); } catch { /* gone */ } }
};

function serve() {
  return new Promise((ok, fail) => {
    server = createServer(async (req, res) => {
      const rel = decodeURIComponent((req.url || '/').split('?')[0]);
      if (rel === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const full = resolve(ROOT, rel === '/' ? '__debug.html' : rel.replace(/^\/+/, ''));
      if (full !== ROOT && !full.startsWith(ROOT + sep)) { res.writeHead(403); res.end(); return; }
      try {
        const body = await readFile(full);
        res.writeHead(200, { 'Content-Type': MIME[extname(full)] || 'application/octet-stream' });
        res.end(body);
      } catch { res.writeHead(404); res.end('not found'); }
    });
    server.on('error', fail);
    server.listen(0, '127.0.0.1', () => ok(server.address().port));
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const port = await serve();
  console.log(`serving ${ROOT}  (label: ${LABEL})`);

  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
           '--mute-audio', '--window-size=1920,1080'],
    defaultViewport: { width: 1280, height: 720 },
    protocolTimeout: 600000,
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e && e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__dbg && window.__checks', { timeout: 180000 });
  await page.evaluate(() => { window.__noRender = false; window.__dbg.quality('high'); });

  // Land on the lobby with a known look, so two runs of this are comparable.
  await page.evaluate(() => {
    window.__dbg.lobby();
    window.__dbg.tick(30, 1 / 60);
  });

  const shoot = async (name, prep) => {
    if (ONLY.length && !ONLY.includes(name)) return;
    if (prep) await prep();
    await page.evaluate(() => { window.__dbg.renderFull(); });
    const file = join(OUT, `lobby-${name}${LABEL === 'new' ? '' : `-${LABEL}`}.png`);
    await page.screenshot({ path: file });
    console.log(`  ${file}`);
  };

  for (const [name, w, h] of VIEWPORTS) {
    await page.setViewport({ width: w, height: h });
    await page.evaluate(() => { window.dispatchEvent(new Event('resize')); window.__dbg.tick(20, 1 / 60); });
    await shoot(name);
  }

  // ---- face close-up: move the lens in, do not crop the frame.
  await page.setViewport({ width: 1280, height: 720 });
  await page.evaluate(() => { window.dispatchEvent(new Event('resize')); window.__dbg.tick(20, 1 / 60); });
  await shoot('face', async () => {
    await page.evaluate(() => { window.__dbg.faceCam(); });
  });
  // PUT THE LOBBY LENS BACK. Leaving the close-up on is how the envelope sweep
  // below came to report the same crop at every viewport size: it was measuring
  // the character against a face camera 30 units away, not against the lobby's.
  await page.evaluate(() => { window.__dbg.faceCam(false); });

  // ---- the rotation trace. Ticks a long stretch of lobby time and records the
  //      character's yaw and pitch every few frames, so an unwanted full turn
  //      shows up as a number rather than as a shot that happened to catch it.
  const trace = await page.evaluate(() => {
    window.__dbg.lobby();
    const ys = [], xs = [];
    for (let i = 0; i < 3600; i++) {          // 60 seconds of lobby at 1/60
      window.__dbg.tick(1, 1 / 60);
      if (i % 5 === 0) { const r = window.__dbg.preview(); ys.push(r.ry); xs.push(r.rx); }
    }
    return { ys, xs };
  });
  // ---- does the character stay in the frame through the WHOLE idle envelope?
  //      The lens is framed on the resting silhouette plus a headroom
  //      allowance; this is the check that the allowance is actually big
  //      enough, taken over a long enough stretch that every act peaks.
  // ---- is every element a player needs to see or press inside the viewport,
  //      at every size? The in-page check asserts this too, but only at the
  //      harness's one viewport; multi-viewport belongs here, where the tool
  //      actually controls the window. This is what the phone's runaway coin
  //      chip was, and it is checked by bounding box rather than by eye.
  for (const [name, w, h] of VIEWPORTS) {
    await page.setViewport({ width: w, height: h });
    const off = await page.evaluate(() => {
      window.dispatchEvent(new Event('resize'));
      window.__dbg.lobby();
      const W = window.innerWidth, H = window.innerHeight, out = [];
      const want = [['PLAY', '#playBtn'], ['invite', '#mpBtn'], ['nameCard', '#nameCard'],
        ['crowns', '#homeCrowns'], ['coins', '#homeCoins'], ['strip', '.lobbyTabs'],
        ['brand', '.lobbyBrand']];
      for (const [label, sel] of want) {
        const el = document.querySelector(sel); if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1)
          out.push(`${label}[${Math.round(r.left)},${Math.round(r.top)}..${Math.round(r.right)},${Math.round(r.bottom)}]`);
      }
      document.querySelectorAll('.tabPill').forEach((p) => {
        const r = p.getBoundingClientRect();
        if (r.width > 0 && (r.right > W + 1 || r.left < -1)) out.push(`tab:${p.dataset.lobby}`);
      });
      return out;
    });
    console.log(`  layout   ${name.padEnd(9)} ${off.length ? `*** OFF SCREEN: ${off.join(' ')} ***` : 'all key elements inside the viewport'}`);
  }

  for (const [name, w, h] of VIEWPORTS) {
    await page.setViewport({ width: w, height: h });
    const worst = await page.evaluate(() => {
      window.dispatchEvent(new Event('resize'));
      window.__dbg.lobby();
      let top = -Infinity, bot = Infinity, act = '', bact = '';
      for (let i = 0; i < 4200; i++) {
        window.__dbg.tick(1, 1 / 60);
        const e = window.__dbg.previewExtent();
        if (e.top > top) { top = e.top; act = e.act; }
        if (e.bottom < bot) { bot = e.bottom; bact = e.act; }
      }
      return { top: +top.toFixed(3), bottom: +bot.toFixed(3), act, bact };
    });
    const bad = worst.top > 1 || worst.bottom < -1;
    console.log(`  envelope ${name.padEnd(9)} ndc top ${worst.top.toFixed(2)} (${worst.act})`
      + `  bottom ${worst.bottom.toFixed(2)} (${worst.bact})  ${bad ? '*** CROPPED ***' : 'ok'}`);
  }
  await page.setViewport({ width: 1280, height: 720 });

  const span = (a) => {
    const lo = Math.min(...a), hi = Math.max(...a);
    return { lo: +lo.toFixed(3), hi: +hi.toFixed(3), span: +(hi - lo).toFixed(3) };
  };
  console.log(`  yaw  (rad, relative to facing camera): ${JSON.stringify(span(trace.ys))}`);
  console.log(`  pitch(rad)                           : ${JSON.stringify(span(trace.xs))}`);

  // ---- what a lobby frame costs. Not a pass/fail -- this runs on SwiftShader,
  //      which is not the hardware anyone plays on -- but a regression that
  //      rebuilt geometry or a material per frame would show up here as a
  //      number several times larger than its neighbour.
  const cost = await page.evaluate(() => {
    // Re-pin the quality: the game steps its own quality down when frames run
    // long, and the envelope sweep above is 25,000 frames of exactly that, so
    // without this the figure below is measured at whatever setting the sweep
    // left behind rather than at the shipping one.
    window.__dbg.quality('high');
    window.__dbg.lobby();
    for (let i = 0; i < 30; i++) { window.__dbg.tick(1, 1 / 60); window.__dbg.renderFull(); }  // warm
    const t0 = performance.now();
    const N = 120;
    for (let i = 0; i < N; i++) { window.__dbg.tick(1, 1 / 60); window.__dbg.renderFull(); }
    return (performance.now() - t0) / N;
  });
  console.log(`  lobby frame: ${cost.toFixed(2)} ms/frame (tick + full render, software GL)`);

  if (errs.length) { console.log('PAGE ERRORS:'); errs.forEach((e) => console.log(`  ${e}`)); }
  else console.log('no page errors');
  await shutdown();
}

main().catch(async (e) => { console.error(e); await shutdown(); process.exit(1); });
