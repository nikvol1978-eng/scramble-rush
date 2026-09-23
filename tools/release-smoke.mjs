#!/usr/bin/env node
// Boot THE SHIPPED RELEASE and report what the startup actually cost.
//
//   node tools/release-smoke.mjs [release.html]
//
// WHY THIS EXISTS SEPARATELY FROM THE CHECK SUITE. tools/ci/run-checks.mjs
// runs against __debug.html, which mkdebug.py builds from the readable
// assembly -- it has to, because debug hooks are spliced in at text anchors
// that minified code does not have. That leaves exactly one thing the check
// suite cannot see: whether MINIFICATION broke the file players download.
// This is the gate for that, and it is deliberately small -- it asserts the
// release boots all the way to the lobby with nothing in the console,
// which is the failure mode a minifier has.
//
// It also prints the startup breakdown, because the numbers are already there
// once the page has booted and the distinction they carry is one this project
// keeps having to re-make:
//
//   REAL PREPARATION    the gates doing work.
//   PRESENTATION FLOOR  BOOT_MIN_MS holding the loader after the work is done.
//   VISIBLE LOADER      what the player experienced -- the sum, and never a
//                       statement about how long the game takes to get ready.
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ENTRY = /^scramble-rush-(\d+)\.(\d+)\.html$/;

async function newestRelease() {
  const names = (await readdir(ROOT)).filter((n) => ENTRY.test(n));
  names.sort((a, b) => {
    const [, aMaj, aMin] = a.match(ENTRY); const [, bMaj, bMin] = b.match(ENTRY);
    return Number(bMaj) - Number(aMaj) || Number(bMin) - Number(aMin);
  });
  return names[0] ? join(ROOT, names[0]) : null;
}

const file = process.argv[2] ? resolve(process.argv[2]) : await newestRelease();
if (!file) { console.error('no release found'); process.exit(2); }
const html = await readFile(file);

// The release imports its three bundle as ./three-<hash>.js, which from
// /play/scramble-rush resolves to /play/three-<hash>.js. Serving it from the
// release's own directory is what the host server does too.
const BUNDLE = /^\/(?:play\/)?(three-[0-9a-f]{12}\.js)$/;

const server = createServer(async (req, res) => {
  const bundle = (req.url || '').match(BUNDLE);
  if (bundle) {
    try {
      const js = await readFile(join(ROOT, bundle[1]));
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(js);
    } catch {
      res.writeHead(404); res.end();
    }
    return;
  }
  if (req.url === '/' || req.url.startsWith('/play')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  // /socket.io/socket.io.js belongs to the host server, not this repo. The
  // page carries onerror="window.__noCoordinator=1" for precisely this, so a
  // 404 here is the designed path, not a failure.
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/play/scramble-rush`;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
         '--mute-audio', '--disable-extensions', '--window-size=1280,800'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${(e && e.message) || e}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  // The socket.io 404 above is expected and is the only one allowed through.
  if (/socket\.io|Failed to load resource/.test(t)) return;
  problems.push(`console: ${t}`);
});

let ok = true;
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
try {
  await page.waitForFunction(() => !document.getElementById('bootScreen'),
    { timeout: 120000, polling: 250 });
} catch {
  problems.push('the loader never handed off to the lobby');
  ok = false;
}

// THE LOBBY, AND ONLY THE LOBBY. The game starts on the home page; Mode Select
// is one PLAY press away. The live-screen list is the whole answer -- a screen
// left up behind the lobby is as much a failure as the lobby not arriving.
const state = await page.evaluate(() => {
  const play = document.getElementById('playBtn');
  return {
    live: [...document.querySelectorAll('.screen')]
      .filter((e) => !e.classList.contains('hidden') && e.offsetParent !== null).map((e) => e.id),
    play: !!play && play.getBoundingClientRect().height > 0,
    report: window.__srperf ? window.__srperf.report() : null,
  };
});
if (state.live.length !== 1 || state.live[0] !== 'home') {
  problems.push(`booted to [${state.live.join(', ') || 'nothing'}], wanted [home]`); ok = false;
}
if (!state.play) { problems.push('the lobby has no visible PLAY button'); ok = false; }
if (!state.report) { problems.push('window.__srperf missing — the instrumentation did not survive the build'); ok = false; }

console.log(`release   ${file.replace(/^.*[\\/]/, '')}  ${html.length} bytes`);
if (state.report) {
  const r = state.report;
  console.log(`\nfirst contentful paint   ${Math.round(r.paint.fcp)} ms`);
  console.log(`REAL PREPARATION         ${r.realPreparationMs} ms   <- what the game needed`);
  console.log(`presentation floor       ${r.presentationFloorMs} ms   <- BOOT_MIN_MS holding it`);
  console.log(`visible loader           ${r.visibleLoaderMs} ms   <- what the player saw`);
  console.log('\nper gate:');
  const s = r.stages;
  for (const k of Object.keys(s)) {
    if (!/^gate:\d+:start:/.test(k)) continue;
    const i = k.split(':')[1];
    const end = s[`gate:${i}:end`];
    if (end == null) continue;
    console.log(`  ${String(end - s[k]).padStart(6)} ms  ${k.split(':').slice(3).join(':')}`);
  }
}
if (problems.length) { console.error('\nPROBLEMS:'); problems.forEach((p) => console.error('  - ' + p)); ok = false; }
else console.log('\nno game-originated console output');

await browser.close();
server.close();
console.log(ok ? '\nRELEASE SMOKE: PASS' : '\nRELEASE SMOKE: FAIL');
process.exit(ok ? 0 : 1);
