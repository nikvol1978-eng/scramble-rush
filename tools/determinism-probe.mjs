#!/usr/bin/env node
// What, besides Math.random and the clock, survives from one seeded round into
// the next? Runs the same seeded round twice in one page and reports the first
// thing that differs, rather than a digest that only says "something did".
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = resolve(process.env.SR_ROOT || fileURLToPath(new URL('..', import.meta.url)));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };

let server, browser;
const shutdown = async () => {
  if (browser) { try { await browser.close(); } catch { /* gone */ } }
  if (server) { try { await new Promise((r) => server.close(r)); } catch { /* gone */ } }
};

function serve() {
  return new Promise((ok, fail) => {
    server = createServer(async (req, res) => {
      const rel = decodeURIComponent((req.url || '/').split('?')[0]);
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
  const port = await serve();
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--mute-audio'],
    defaultViewport: { width: 1280, height: 720 }, protocolTimeout: 600000,
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__dbg && window.__checks', { timeout: 180000 });
  const out = await page.evaluate(() => {
    window.__noRender = true;
    const S = window.__checks.seeded;
    const snap = () => ({
      T: window.__T,
      state: window.__dbg.preview().state,
      info: window.__dbg.info(),
      racers: window.__dbg.rstate ? null : null,
    });
    const race = () => {
      S.beginSeeded('sunny', 12345);
      window.__dbg.tick(240);
      return window.__dbg.racerDump();
    };
    // HYPOTHESIS: run 1 differs only because the page is cold. Warm it once.
    if (!window.__noWarm) S.withSeed(1, () => { S.beginSeeded('sunny', 1); });
    const a = S.withSeed(777, race);
    const b = S.withSeed(777, race);
    const c = S.withSeed(777, race);
    return { a, b, c };
  });
  const n = Math.max(out.a.length, out.b.length);
  let diffs = 0;
  for (let i = 0; i < n; i++) {
    const A = JSON.stringify(out.a[i]), B = JSON.stringify(out.b[i]), C = JSON.stringify(out.c[i]);
    if (A !== B || B !== C) {
      if (diffs < 6) console.log(`racer ${i} DIFFERS
   run1 ${A}
   run2 ${B}
   run3 ${C}`);
      diffs++;
    }
  }
  console.log(`${diffs} of ${n} racers differ between identical seeded runs`);
  await shutdown();
}
main().catch(async (e) => { console.error(e); await shutdown(); process.exit(1); });
