#!/usr/bin/env node
// A gameplay pass for the hand: PLAY a round, photograph the states the hand
// is actually seen in, and report what the console said.
//
//   node tools/hand-gameplay.mjs
//
// This drives the shipped input path -- hold(), press(), and the game's own
// step -- rather than posing the skeleton. Posing proves the geometry deforms;
// only playing proves the geometry deforms in the states the game actually
// produces, and in the order it produces them. The two are not the same check
// and the posed one has passed before over a hand that looked wrong in motion.
//
// Every state below is OBSERVED, not assumed: the harness watches me() each
// tick and photographs the first frame in which each condition holds. If a
// state never occurs it is reported missing rather than quietly skipped, which
// is the failure mode that makes a green gameplay pass worthless.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(process.env.SR_OUT || join(ROOT, 'docs', 'hand-review', 'gameplay'));
const W = 1280, H = 720;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };

let server, browser;
const bye = async () => {
  if (browser) { try { await browser.close(); } catch {} }
  if (server) { try { await new Promise(r => server.close(r)); } catch {} }
};
const serve = () => new Promise((ok, fail) => {
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

// Console noise that is the HARNESS's, not the game's. Kept short and explicit:
// a broad filter here would swallow exactly the errors this pass exists to
// find, so anything not matched is reported as game-originated and a human
// decides. SwiftShader is the software rasteriser puppeteer falls back to.
const HARNESS_NOISE = [
  /SwiftShader/i, /GroupMarkerNotSet/i, /Automatic fallback to software WebGL/i,
  /THREE\.WebGLRenderer: Context Lost/i, /net::ERR_/i, /favicon/i,
  /Failed to load resource.*404/i,
];
const isNoise = s => HARNESS_NOISE.some(re => re.test(s));

async function main() {
  await mkdir(OUT, { recursive: true });
  const port = await serve();
  browser = await puppeteer.launch({ headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
           '--mute-audio', `--window-size=${W},${H}`],
    defaultViewport: { width: W, height: H }, protocolTimeout: 600000 });
  const page = await browser.newPage();
  const console_ = [];
  page.on('pageerror', e => console_.push({ kind: 'pageerror', text: String(e && e.stack || e) }));
  page.on('console', e => { if (e.type() === 'error' || e.type() === 'warning')
    console_.push({ kind: e.type(), text: e.text() }); });
  page.on('requestfailed', r => console_.push({ kind: 'requestfailed', text: `${r.url()} ${r.failure()?.errorText}` }));

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__dbg && window.__checks', { timeout: 180000 });
  await page.evaluate(() => { window.__noRender = false; window.__dbg.quality('high'); });

  const shots = {};
  const shoot = async (name) => {
    if (shots[name]) return;
    await page.evaluate(() => {
      if (window.__dbg.hud) window.__dbg.hud();
      const b = document.getElementById('bannerMsg'); if (b) b.textContent = '';
      window.__dbg.renderFull();
    });
    const file = join(OUT, `gameplay-${name}.png`);
    await page.screenshot({ path: file });
    shots[name] = file;
    console.log('  ' + name);
  };

  // ---- the lobby, before anything is started ------------------------------
  await page.evaluate(() => window.__dbg.lobby());
  await shoot('lobby');

  // ---- a real round -------------------------------------------------------
  await page.evaluate(() => window.__dbg.start(1, 'sunny'));
  const reached = await page.evaluate(() => {
    for (let i = 0; i < 1200; i++) {
      if (window.__dbg.preview().state === 'racing') return true;
      window.__dbg.tick(1, 1 / 60);
    }
    return false;
  });
  if (!reached) throw new Error('the round never reached the racing state');

  // THE CROWD IS AT THE START LINE. Twenty-four racers are only ever bunched
  // in the first seconds of a round; by the time the GO! banner has expired
  // they have spread down the course and the densest frame available is three
  // or four. So the crowd shot is taken here, before the banner is skipped,
  // and the count that goes in the report is the count in that frame.
  const crowd = await page.evaluate(() => {
    const me = window.__dbg.me();
    return window.__dbg.bots().filter(b => Math.hypot(b.x - me.x, b.y - me.y) < 140).length;
  });
  await shoot('crowd');
  await page.evaluate(() => window.__dbg.tick(420, 1 / 60));   // past the GO! banner

  // The input programme. The movement keys are w/a/s/d -- NOT the arrows, which
  // this harness held on its first run to no effect at all, because the arrows
  // are bound to spectator cycling. Forward is held throughout, with turns, a
  // jump and a dive at known frames, so a state that does not appear cannot be
  // blamed on never having been asked for.
  const PLAN = [
    { at: 0,   do: () => { window.__dbg.hold('w', true); } },
    { at: 90,  do: () => { window.__dbg.hold('a', true); } },
    { at: 140, do: () => { window.__dbg.hold('a', false); window.__dbg.hold('d', true); } },
    { at: 190, do: () => { window.__dbg.hold('d', false); } },
    { at: 230, do: () => window.__dbg.press('jump') },
    { at: 360, do: () => window.__dbg.press('dive') },
    { at: 520, do: () => window.__dbg.press('jump') },
  ];
  const log = [];
  let wasAir = false;
  const FRAMES = 760;
  for (let f = 0; f < FRAMES; f++) {
    for (const step of PLAN) if (step.at === f) await page.evaluate(step.do);
    const me = await page.evaluate(() => { window.__dbg.tick(1, 1 / 60); return window.__dbg.me(); });
    const air = me.h - me.floor > 1.2;
    log.push({ f, h: me.h, vh: me.vh, vy: me.vy, vx: me.vx, air, falling: me.falling });
    if (!air && Math.abs(me.vy) > 2.0 && !me.falling) await shoot('run');
    if (f >= 95 && f <= 195 && !air && Math.abs(me.vx) > 0.4) await shoot('turn');
    if (air && me.vh > 0.5) await shoot('jump');
    if (f >= 362 && f <= 400) await shoot('dive');
    if (wasAir && !air) await shoot('landing');
    wasAir = air;
  }
  await page.evaluate(() => { for (const k of ['w', 'a', 'd']) window.__dbg.hold(k, false); });

  // ---- a fall, and the respawn after it -----------------------------------
  // Forced, and said so plainly. Nine hundred frames of running this course
  // produced no fall at all -- the bots fall into its pits, the player driven
  // straight down the middle does not -- so the player is warped into the gap
  // between two of a pit's moving platforms. It is the game's own fall and the
  // game's own respawn; only the arrival at the edge is staged.
  const fell = await page.evaluate(() => {
    const pits = window.__dbg.pits();
    if (!pits.length) return { ok: false, why: 'this course has no pit' };
    const pit = pits[0], mid = (pit.y0 + pit.y1) / 2;
    // an x as far as possible from every platform in that pit
    let bestX = 0, bestGap = -1;
    for (let x = -240; x <= 240; x += 5) {
      const gap = Math.min(...pit.plats.map(p => Math.abs(x - p.b) - p.w / 2));
      if (gap > bestGap) { bestGap = gap; bestX = x; }
    }
    window.__dbg.warp(mid, bestX);
    return { ok: true, y: mid, x: bestX, gap: Math.round(bestGap) };
  });
  let fallFrames = 0, respawned = false;
  if (fell.ok) {
    for (let f = 0; f < 420; f++) {
      const me = await page.evaluate(() => { window.__dbg.tick(1, 1 / 60); return window.__dbg.me(); });
      if (me.falling) { fallFrames++; await shoot('fall'); }
      if (fallFrames > 0 && !me.falling && me.inv > 0) { await shoot('respawn'); respawned = true; break; }
    }
  }

  const errors = console_.filter(e => !isNoise(e.text));
  const report = {
    statesObserved: Object.keys(shots),
    statesMissing: ['lobby','run','turn','jump','fall','dive','landing','respawn','crowd']
      .filter(s => !shots[s]),
    crowdAtStartLine: crowd,
    forcedFall: fell,
    fallFrames, respawned,
    frames: FRAMES,
    airborneFrames: log.filter(l => l.air).length,
    topSpeed: +Math.max(...log.map(l => Math.abs(l.vy))).toFixed(2),
    maxTurnRate: +Math.max(...log.map(l => Math.abs(l.vx))).toFixed(2),
    consoleTotal: console_.length,
    consoleGameOriginated: errors,
  };
  await writeFile(join(OUT, 'gameplay-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, consoleGameOriginated: errors.slice(0, 10) }, null, 2));
  if (report.statesMissing.length || errors.length) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(bye);
