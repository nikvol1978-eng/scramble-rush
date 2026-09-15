#!/usr/bin/env node
// Run the game's own check suite in headless Chromium and fail the build if any
// check fails.
//
//   node tools/ci/run-checks.mjs
//
// The game is one self-contained HTML file, so there is nothing to bundle: the
// debug build (build/mkdebug.py) is the release with window.__dbg and
// window.__checks added, and this serves it and calls __checks.run().
//
// Why a server rather than file://: the page is a real origin under http, and
// several checks touch storage and module loading that a file:// page does not
// get. This is the same reason the local runner serves it too.
//
// Why one page rather than the chunked local driver: the local driver splits the
// suite across short-lived browsers because it runs with RENDERING ON, and the
// shadow map, the composer targets and the GPU copy of every course mesh add up
// over sixty-one begin() calls. With rendering off the peak stays flat and the
// whole suite fits in one page, which is measurably true -- 61 checks, one page,
// no chunking -- and it is the reason this file is short.
//
// SR_NORENDER (default 1) is the game's OWN mechanism for exactly this, added so
// the acceptance could run on a memory-constrained machine. It changes what is
// DRAWN and nothing that is MEASURED: draw-call counts, geometry, rig
// proportions and hat clearance are all still asserted, because those read the
// scene directly. What it does drop is the real-time frame-budget assertion in
// check 3c, which is a property of the hardware and the load on it -- a
// GitHub-hosted runner is the last place that should be judged. That budget is
// validated locally on known hardware instead; nothing here raises or weakens
// it, and the check itself is untouched.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const PAGE = process.env.SR_PAGE || '__debug.html';
const NORENDER = process.env.SR_NORENDER !== '0';
const QUALITY = process.env.SR_QUALITY || 'low';
const BOOT_TIMEOUT = Number(process.env.SR_BOOT_TIMEOUT || 120000);
// Generous, because a GitHub runner has no GPU and falls back to SwiftShader,
// which makes every begin() and every draw-call measurement far slower than the
// same suite on a desktop: about eight minutes there, comfortably past thirty
// here. The first CI run died on a 30-minute ceiling with no check having
// failed, so this is sized for the slow path. A stuck-job guard, not a target.
const RUN_TIMEOUT = Number(process.env.SR_RUN_TIMEOUT || 5400000);

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
  // Both are best-effort: a failure here must not mask the suite's own verdict.
  if (browser) { try { await browser.close(); } catch { /* already gone */ } }
  if (server) { try { await new Promise((r) => server.close(r)); } catch { /* already gone */ } }
}

function serve() {
  return new Promise((ok, fail) => {
    server = createServer(async (req, res) => {
      const rel = decodeURIComponent((req.url || '/').split('?')[0]);
      // The browser asks for this unprompted and the game declares none, so a
      // 404 here is noise that looks like a broken build in the CI log.
      if (rel === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const file = rel === '/' ? PAGE : rel.replace(/^\/+/, '');
      const full = resolve(ROOT, file);
      // never serve outside the checkout
      if (full !== ROOT && !full.startsWith(ROOT + sep)) { res.writeHead(403); res.end(); return; }
      try {
        const body = await readFile(full);
        res.writeHead(200, { 'Content-Type': MIME[extname(full)] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404); res.end('not found');
      }
    });
    server.on('error', fail);
    // port 0: the OS picks a free one, so two jobs on one runner cannot collide
    server.listen(0, '127.0.0.1', () => ok(server.address().port));
  });
}

async function main() {
  const port = await serve();
  const url = `http://127.0.0.1:${port}/`;
  console.log(`serving ${ROOT}`);
  console.log(`page    ${PAGE}  ->  ${url}`);

  browser = await puppeteer.launch({
    headless: true,
    // --no-sandbox is required on GitHub-hosted runners, which run as root in a
    // container without user namespaces. --enable-unsafe-swiftshader PERMITS the
    // software GL fallback on a machine with no GPU; it does not force it.
    // Forcing it with --use-gl=swiftshader made the suite miss a fifteen-minute
    // timeout on a machine that has a perfectly good GPU, so the choice is left
    // to Chrome: real GL where there is one, SwiftShader where there is not.
    args: ['--no-sandbox', '--disable-dev-shm-usage',
           '--enable-unsafe-swiftshader', '--mute-audio', '--window-size=1280,800'],
    defaultViewport: { width: 1280, height: 800 },
    // The whole suite is ONE Runtime.evaluate that steps sixty-one checks, and
    // it runs for minutes. puppeteer's default protocolTimeout is 180s, and it
    // is the knob that governs this -- page.evaluate takes no timeout of its
    // own, which is why passing one there did nothing.
    protocolTimeout: RUN_TIMEOUT,
  });

  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => { pageErrors.push(String(e && e.message || e)); });
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: BOOT_TIMEOUT });

  // An explicit readiness condition, not a sleep: the suite is injected by
  // mkdebug.py at the end of the game's own boot, so its presence IS "the game
  // finished starting". three.js comes off a CDN, so this can legitimately take
  // a while on a cold runner.
  try {
    await page.waitForFunction(
      'typeof window.__checks === "object" && typeof window.__dbg === "object"',
      { timeout: BOOT_TIMEOUT, polling: 250 },
    );
  } catch (e) {
    console.error('\nthe game never finished booting — window.__checks/__dbg never appeared.');
    if (pageErrors.length) console.error('page errors:\n  ' + pageErrors.join('\n  '));
    throw e;
  }

  if (NORENDER) await page.evaluate('window.__noRender = true');
  if (QUALITY) await page.evaluate(`window.__dbg.quality(${JSON.stringify(QUALITY)})`);
  console.log(`quality ${QUALITY}${NORENDER ? ', rendering off (SR_NORENDER)' : ', rendering on'}\n`);

  // The whole suite is ONE evaluate and the page's JS is single-threaded, so
  // nothing can report progress from inside it. Without a heartbeat the CI log
  // is silent for the better part of an hour and a live run is indistinguishable
  // from a hung one -- which is exactly how the first CI run read.
  const started = Date.now();
  const beat = setInterval(() => {
    console.log(`  ... still running, ${((Date.now() - started) / 1000).toFixed(0)}s elapsed`);
  }, 60000);
  let out;
  try {
    out = await page.evaluate('JSON.stringify(window.__checks.run({}))');
  } finally {
    clearInterval(beat);
  }
  const res = JSON.parse(out);
  console.log(`suite finished in ${((Date.now() - started) / 1000).toFixed(0)}s\n`);

  for (const line of res.results) console.log(line);

  const total = res.passed + res.failed;
  const summary = `${res.passed}/${total} checks passed, ${res.failed} failed`;
  console.log(`\n${summary}`);

  if (pageErrors.length) {
    console.log(`\n${pageErrors.length} page error(s) during the run:`);
    for (const e of pageErrors.slice(0, 20)) console.log(`  ${e}`);
  }

  // The job summary panel, when running under Actions.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const failed = res.results.filter((r) => r.startsWith('FAIL'));
    const md = [
      `### Scramble Rush checks`,
      '',
      `**${summary}** — rendering ${NORENDER ? 'off' : 'on'}, quality \`${QUALITY}\`.`,
      '',
      failed.length
        ? ['Failures:', '', '```', ...failed, '```'].join('\n')
        : 'All checks passed.',
      '',
    ].join('\n');
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
  }

  return res.failed === 0 ? 0 : 1;
}

let code = 1;
try {
  code = await main();
} catch (e) {
  console.error(`\nrun-checks failed: ${e && e.stack || e}`);
  code = 1;
} finally {
  await shutdown();
}
process.exit(code);
