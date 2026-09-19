#!/usr/bin/env node
// Is a check sensitive to WHERE IN THE Math.random() STREAM it runs?
//
//   SR_CHECK=r SR_RUNS=12 node tools/flake-probe.mjs
//
// Why this exists: check [r] passes every time it is run on its own and fails
// intermittently inside the full suite. The suite does not reset Math.random()
// between checks, and [r] builds a 23-bot race whose speeds and target lanes
// are drawn from it -- so the bot layout it measures depends on how many draws
// every earlier check happened to make. This burns a varying number of draws
// before running the check, which reproduces that condition directly instead of
// running the whole suite over and over to sample it.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = resolve(process.env.SR_ROOT || fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.env.SR_CHECK || 'r';
const RUNS = Number(process.env.SR_RUNS || 12);
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
  console.log(`probing [${CHECK}] in ${ROOT}`);
  let fails = 0;
  for (let i = 0; i < RUNS; i++) {
    // A fresh page per run, so the only thing that differs is the burn: one
    // page reused would also carry the previous run's leftover round state.
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--mute-audio'],
      defaultViewport: { width: 1280, height: 720 }, protocolTimeout: 600000,
    });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction('window.__dbg && window.__checks', { timeout: 180000 });
    const burn = i * 137;                       // an arbitrary, spread-out offset
    // SR_BURN_TICKS advances the SHARED SIMULATED CLOCK instead of the random
    // stream. window.__T is global to the page and every check's tick() adds to
    // it, and obstacle phases are functions of it -- so a check that runs late
    // in the suite meets a different course than the same check run alone.
    const ticks = Number(process.env.SR_BURN_TICKS || 0);
    const r = await page.evaluate((b, c, tk) => {
      window.__noRender = true;
      for (let k = 0; k < b; k++) Math.random();
      if (tk) window.__dbg.tick(tk, 1 / 60);     // menu state: cheap, but the clock moves
      return window.__checks.run({ only: c });
    }, burn, CHECK, ticks);
    const line = (r.results[0] || '').replace(/\s+/g, ' ');
    if (r.failed) fails++;
    console.log(`  burn ${String(burn).padStart(5)}: ${line}`);
    await browser.close(); browser = null;
  }
  console.log(`[${CHECK}] failed ${fails}/${RUNS} runs at differing stream positions`);
  await shutdown();
}
main().catch(async (e) => { console.error(e); await shutdown(); process.exit(1); });
