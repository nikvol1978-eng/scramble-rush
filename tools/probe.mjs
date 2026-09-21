#!/usr/bin/env node
// Ask the live page a question and print the answer.
//
//   SR_SCREEN=locker-skin SR_EVAL='<expression>' node tools/probe.mjs
//
// A one-off inspector for the UI work: cheaper than a screenshot when the
// question is "what did the box actually compute to", and it keeps the guess
// out of the loop.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OPEN = { 'locker-skin': '#profileBtn', badges: '#badgesBtn', shop: '#shopBtn',
               pass: '#passBtn', settings: '#settingsBtn', daily: '#dailyBtn', home: null };
const SCREEN = process.env.SR_SCREEN || 'home';
const EVAL = process.env.SR_EVAL || '1';
const W = Number(process.env.SR_W || 1366), H = Number(process.env.SR_H || 768);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
               '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
let server, browser;
const bye = async () => {
  if (browser) { try { await browser.close(); } catch { /* gone */ } }
  if (server) { try { await new Promise((r) => server.close(r)); } catch { /* gone */ } }
};

const serve = () => new Promise((ok, fail) => {
  server = createServer(async (req, res) => {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]);
    if (rel === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const full = resolve(ROOT, rel === '/' ? '__debug.html' : rel.replace(/^\/+/, ''));
    if (full !== ROOT && !full.startsWith(ROOT + sep)) { res.writeHead(403); res.end(); return; }
    try {
      const b = await readFile(full);
      res.writeHead(200, { 'Content-Type': MIME[extname(full)] || 'application/octet-stream' });
      res.end(b);
    } catch { res.writeHead(404); res.end('no'); }
  });
  server.on('error', fail);
  server.listen(0, '127.0.0.1', () => ok(server.address().port));
});

const port = await serve();
browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: W, height: H }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR ' + ((e && e.message) || e)));
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__dbg && window.__checks', { timeout: 180000 });
await page.evaluate(() => { window.__noRender = false; window.__dbg.quality('high'); window.__dbg.lobby(); });
const opener = OPEN[SCREEN];
if (opener) await page.evaluate((s) => { const b = document.querySelector(s); if (b) b.click(); }, opener);
await page.evaluate(() => { window.__dbg.tick(20, 1 / 60); });
const out = await page.evaluate(`(()=>{ ${EVAL} })()`);
console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2));
await bye();
