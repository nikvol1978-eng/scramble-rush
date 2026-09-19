#!/usr/bin/env node
// Photograph the lobby AFTER a race, which is not the same thing as
// photographing the lobby on a cold boot: goHome hides the course and the
// racers, and whatever it does not hide is still standing in the scene.
//
//   SR_ROOT=/path/to/tree SR_OUT=/tmp/x SR_LABEL=new node tools/return-to-lobby-shot.mjs
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const HERE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ROOT = resolve(process.env.SR_ROOT || HERE);
const OUT = resolve(process.env.SR_OUT || join(HERE, 'docs', 'lobby-review'));
const LABEL = process.env.SR_LABEL || 'new';
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
  await mkdir(OUT, { recursive: true });
  const port = await serve();
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--mute-audio'],
    defaultViewport: { width: 1280, height: 720 }, protocolTimeout: 600000,
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__dbg && window.__checks', { timeout: 180000 });
  await page.evaluate(() => { window.__noRender = false; window.__dbg.quality('high'); });

  // race, then walk back out to the lobby the way a player does
  // page.evaluate runs in the PAGE's global scope, not inside the game's IIFE,
  // so goHome/scene/previewGroup are not reachable from here. __dbg.lobby() is
  // the exposed door onto the same path a player takes out of a round.
  const info = await page.evaluate(() => {
    window.__dbg.start(1, 'sunny');
    for (let i = 0; i < 900 && window.__dbg.preview().state !== 'racing'; i++) window.__dbg.tick(1, 1 / 60);
    window.__dbg.tick(240, 1 / 60);
    // __dbg.lobby() exists only on the new tree; #quitBtn is wired straight to
    // goHome() and is present on both, so the OLD build can be driven down the
    // same path for an honest before/after.
    if (window.__dbg.lobby) window.__dbg.lobby();
    else document.getElementById('quitBtn').click();
    window.__dbg.tick(60, 1 / 60);
    window.__dbg.renderFull();
    return window.__dbg.preview();
  });
  console.log(`${LABEL}: state=${info.state} previewVisible=${info.visible}`);
  const file = join(OUT, `return-to-lobby-${LABEL}.png`);
  await page.screenshot({ path: file });
  console.log(`  ${file}`);
  await shutdown();
}
main().catch(async (e) => { console.error(e); await shutdown(); process.exit(1); });
