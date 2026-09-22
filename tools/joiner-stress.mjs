#!/usr/bin/env node
// Prepare the joiner's side of a round, over and over, and count the failures.
//
//   node tools/joiner-stress.mjs            # 60 preparations across 6 maps
//   SR_RUNS=200 node tools/joiner-stress.mjs
//
// WHY A SWEEP AND NOT JUST THE CHECK. [{] proves a joining peer can prepare a
// course once. Production's report was not "it never works" -- it was four
// failures in five attempts, which is the shape of something intermittent, and
// one passing check cannot tell a fixed bug from a lucky run. This runs the
// same preparation dozens of times across structurally different courses and
// reports the RATE, which is the number the defect was described in.
//
// ONE IMPLEMENTATION, NOT TWO. The scenario comes from the game's own suite --
// window.__checks.joiner, the exact helpers [{] and [}] are built from -- for
// the same reason tools/map-sweep.mjs takes its seeding from __checks.seeded: a
// sweep that builds the joiner its own way is a sweep of something else.
//
// It drives the page in ONE page.evaluate. The loop stays inside the browser
// because a round trip per preparation turns sixty of them into minutes of
// protocol traffic, and because a client role left set between two round trips
// is a state no real client is ever in.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PAGE = process.env.SR_PAGE || '__debug.html';
const RUNS = Number(process.env.SR_RUNS || 60);
const BOOT_TIMEOUT = Number(process.env.SR_BOOT_TIMEOUT || 120000);
const RUN_TIMEOUT = Number(process.env.SR_RUN_TIMEOUT || 1800000);

// Structurally different courses on purpose: a path climb, a dark corridor, a
// slippery one, two minigames built from rows rather than sections, and an
// arena that is a platform over nothing. A joiner that only ever meets one
// course shape has not been tested against the generator.
const MAPS = (process.env.SR_MAPS || 'cannonc,neon,slide,hopduck,shrink,sunny').split(',');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

let server;
let browser;

async function shutdown() {
  if (browser) { try { await browser.close(); } catch { /* already gone */ } }
  if (server) { try { await new Promise((r) => server.close(r)); } catch { /* already gone */ } }
}

function serve() {
  return new Promise((ok, fail) => {
    server = createServer(async (req, res) => {
      const rel = decodeURIComponent((req.url || '/').split('?')[0]);
      if (rel === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const file = rel === '/' ? PAGE : rel.replace(/^\/+/, '');
      const full = resolve(ROOT, file);
      if (full !== ROOT && !full.startsWith(ROOT + sep)) { res.writeHead(403); res.end(); return; }
      try {
        const body = await readFile(full);
        res.writeHead(200, { 'Content-Type': MIME[extname(full)] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`not found: ${rel}\n`);
      }
    });
    server.on('error', fail);
    server.listen(0, '127.0.0.1', () => ok(server.address().port));
  });
}

async function main() {
  const port = await serve();
  const url = `http://127.0.0.1:${port}/`;
  console.log(`serving ${ROOT}`);
  console.log(`page    ${PAGE}  ->  ${url}`);
  console.log(`runs    ${RUNS} across ${MAPS.join(', ')}\n`);

  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage',
           '--enable-unsafe-swiftshader', '--mute-audio', '--window-size=1280,800'],
    defaultViewport: { width: 1280, height: 800 },
    protocolTimeout: RUN_TIMEOUT,
  });

  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String((e && e.message) || e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: BOOT_TIMEOUT });
  await page.waitForFunction(
    'typeof window.__checks === "object" && typeof window.__dbg === "object"',
    { timeout: BOOT_TIMEOUT, polling: 250 },
  );
  await page.evaluate('window.__noRender = true');
  await page.evaluate('window.__dbg.quality("low")');

  const report = await page.evaluate(async (runs, maps) => {
    const J = window.__checks.joiner;
    if (!J || !J.hostFrame || !J.feed) throw new Error('the suite exposes no joiner helpers');
    // The same warm-up every check gets, so the first preparation is not
    // measured against a cold skin cache and counted as the slow one.
    window.__checks.warm();
    const out = { total: 0, failures: [], perMap: {}, slowestMs: 0 };
    for (let i = 0; i < runs; i++) {
      const key = maps[i % maps.length];
      const t0 = performance.now();
      let r;
      try {
        const frame = J.hostFrame(key);
        if (!frame) { out.failures.push({ run: i, map: key, why: 'the host broadcast no frame' }); continue; }
        r = await J.feed([frame]);
      } catch (e) {
        out.failures.push({ run: i, map: key, why: 'threw: ' + ((e && e.message) || e) });
        continue;
      } finally {
        out.total++;
      }
      const ms = performance.now() - t0;
      if (ms > out.slowestMs) out.slowestMs = ms;
      out.perMap[key] = (out.perMap[key] || 0) + 1;
      if (r.failed) {
        out.failures.push({ run: i, map: key, why: r.failMsg,
                            stage: r.diag && r.diag.stage, message: r.diag && r.diag.message });
      } else if (r.missing.length) {
        out.failures.push({ run: i, map: key, why: 'flags still false: ' + r.missing.join(', ') });
      } else if (r.sent.indexOf('sr:join') < 0) {
        out.failures.push({ run: i, map: key, why: 'no sr:join left the client' });
      } else if (String(r.settled).indexOf('STALLED') === 0) {
        out.failures.push({ run: i, map: key, why: r.settled });
      }
    }
    return out;
  }, RUNS, MAPS);

  console.log(`preparations: ${report.total}`);
  console.log(`per map:      ${Object.entries(report.perMap).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  console.log(`slowest:      ${Math.round(report.slowestMs)}ms`);
  console.log(`failures:     ${report.failures.length}`);
  for (const f of report.failures.slice(0, 20)) {
    console.log(`  run ${f.run} [${f.map}] ${f.why}${f.stage ? `  (${f.stage}: ${f.message})` : ''}`);
  }
  // A game-originated console error during a clean sweep is a failure even if
  // every preparation reported success -- it is the half of the evidence the
  // production report said was missing.
  const gameErrors = pageErrors.filter((e) => !/404|favicon/i.test(e));
  if (gameErrors.length) {
    console.log(`\npage errors (${gameErrors.length}):`);
    for (const e of gameErrors.slice(0, 10)) console.log('  ' + e);
  }

  const ok = report.failures.length === 0 && gameErrors.length === 0 && report.total === RUNS;
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  ${report.total - report.failures.length}/${RUNS} preparations clean`);
  await shutdown();
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await shutdown();
  process.exit(1);
});
