#!/usr/bin/env node
// Which part of a round still depends on what ran before it?
//
// Builds the SAME seeded round twice in one page -- once on a fresh page, once
// after some other checks have run -- and compares three things separately:
//   * how many Math.random draws the BUILD consumed
//   * the roster it produced (names, skins, speeds, lanes)
//   * the race that followed
// Telling those apart is the point: a build that consumes a different number of
// draws is a different problem from a race that diverges from an identical
// roster, and "the digest differs" cannot distinguish them.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = resolve(process.env.SR_ROOT || fileURLToPath(new URL('..', import.meta.url)));
const PRE = process.env.SR_PRE || '';
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

async function sample(port, pre) {
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--mute-audio'],
    defaultViewport: { width: 1280, height: 720 }, protocolTimeout: 900000,
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__dbg && window.__checks', { timeout: 180000 });
  const out = await page.evaluate((preIds) => {
    window.__noRender = true;
    // Warm on BOTH sides. __dbg.buildProbe does not go through __checks.run, so
    // without this the "fresh page" sample is an unwarmed page being compared
    // against a warmed one, and the warm-up shows up as the leak.
    window.__checks.warm();
    if (preIds) window.__checks.run({ only: preIds });     // let other checks run first
    return window.__dbg.buildProbe('slide', 0xC0FFEE);
  }, pre);
  await browser.close(); browser = null;
  return out;
}

async function main() {
  const port = await serve();
  const a = await sample(port, '');
  const b = await sample(port, PRE || 'chk');
  console.log(`fresh page          : buildDraws=${a.buildDraws}  rosterHash=${a.rosterHash}  raceHash=${a.raceHash}  T0=${a.T0}`);
  console.log(`after checks [${(PRE || 'chk').padEnd(4)}] : buildDraws=${b.buildDraws}  rosterHash=${b.rosterHash}  raceHash=${b.raceHash}  T0=${b.T0}`);
  console.log('');
  console.log(`build consumed the same number of draws : ${a.buildDraws === b.buildDraws ? 'yes' : 'NO  (' + a.buildDraws + ' vs ' + b.buildDraws + ')'}`);
  console.log(`same roster                             : ${a.rosterHash === b.rosterHash ? 'yes' : 'NO'}`);
  console.log(`same race                               : ${a.raceHash === b.raceHash ? 'yes' : 'NO'}`);
  await shutdown();
}
main().catch(async (e) => { console.error(e); await shutdown(); process.exit(1); });
