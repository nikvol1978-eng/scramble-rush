#!/usr/bin/env node
// Run the whole suite in a given order and NAME whatever failed.
//
//   SR_ORDER=reverse node tools/order-sweep.mjs
//   SR_ORDER=424242 node tools/order-sweep.mjs
//
// determinism-verify reports only how many checks failed in a scenario, which
// is enough to know something is order-dependent and not enough to fix it.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = resolve(process.env.SR_ROOT || fileURLToPath(new URL('..', import.meta.url)));
const ORDER = process.env.SR_ORDER || 'reverse';
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
    defaultViewport: { width: 1280, height: 720 }, protocolTimeout: 1800000,
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e && e.message || e)));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__dbg && window.__checks', { timeout: 180000 });
  // QUALITY, for the same reason tools/ci/run-checks.mjs sets it: this runs all
  // 73 checks in ONE long-lived page, and at default quality the shadow map and
  // the composer targets are large enough that the browser's footprint climbs
  // until the machine starts killing things. It is not a weakening of the run --
  // rendering is already off below, and what these tools measure reads the scene
  // directly -- it is the difference between the suite finishing and the OOM
  // killer picking a process.
  const QUALITY = process.env.SR_QUALITY || 'low';
  await page.evaluate((q) => window.__dbg.quality(q), QUALITY);
  const order = ORDER === 'reverse' ? 'reverse' : Number(ORDER);
  const r = await page.evaluate((o) => {
    window.__noRender = true;
    return window.__checks.run({ order: o });
  }, order);
  console.log(`order=${ORDER}  quality=${QUALITY}  ${r.passed} passed, ${r.failed} failed`);
  for (const line of r.results) if (line.startsWith('FAIL')) console.log(`  ${line}`);
  if (errs.length) { console.log('PAGE ERRORS:'); errs.forEach((e) => console.log(`  ${e}`)); }
  await shutdown();
  process.exit(r.failed ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await shutdown(); process.exit(1); });
