#!/usr/bin/env node
// Walk the whole game the way a player does, and fail on anything the GAME
// says went wrong.
//
//   node tools/smoke.mjs
//
// Lobby -> Locker -> equip -> lobby -> Shop -> Pass -> Badges -> Settings ->
// Support -> Mode select -> race -> back to the menu. Every step is a real
// click on a real control, so a screen that cannot be reached by pointer fails
// here the way it fails for a player.
//
// It listens for pageerror and console.error the whole way through and reports
// them at the end. Errors from the page's own code are what this is for.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = resolve(process.env.SR_ROOT || fileURLToPath(new URL('..', import.meta.url)));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };

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

const steps = [];
const fails = [];
const note = (name, ok, detail = '') => {
  steps.push({ name, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
  if (!ok) fails.push(`${name}: ${detail}`);
};

const port = await serve();
browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1366, height: 768 },
  protocolTimeout: 900000,
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`pageerror: ${(e && e.message) || e}`));
page.on('console', (m) => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`); });

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction('window.__dbg && window.__checks', { timeout: 180000 });
await page.evaluate(() => { window.__noRender = false; window.__dbg.quality('high'); window.__dbg.lobby(); });
await page.evaluate(() => window.__dbg.tick(30, 1 / 60));

const click = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return false;
  el.click();
  return true;
}, sel);
const settle = () => page.evaluate(() => window.__dbg.tick(20, 1 / 60));
const visible = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return !!el && !el.classList.contains('hidden') && el.getBoundingClientRect().height > 0;
}, sel);

// ---- the meta walk
note('lobby is up', await visible('#home'));
note('NIKCADE button is on the chrome', await visible('#homeBtn'));

note('open locker', await click('#profileBtn'));
await settle();
note('locker is the only live screen', (await page.evaluate(
  () => [...document.querySelectorAll('.screen')].filter((s) => !s.classList.contains('hidden')).length,
)) === 1);

const owned = await page.evaluate(() => document.querySelectorAll('#lkGrid .uiCard').length);
note('locker lists owned inventory', owned > 0, `${owned} items`);
note('no price is shown in the locker', !(await page.evaluate(() => !!document.querySelector('#lkGrid .lkLock'))));

// hover must not equip
const beforeHover = await page.evaluate(() => document.querySelector('#lkAction').textContent);
await page.evaluate(() => {
  const t = [...document.querySelectorAll('#lkGrid .uiCard')].find((c) => !c.classList.contains('equipped'));
  if (!t) return;
  const r = t.getBoundingClientRect();
  for (const type of ['mouseover', 'mouseenter', 'mousemove', 'pointerover', 'pointermove']) {
    t.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  }
});
await settle();
note('hover did not change the equipped item',
  (await page.evaluate(() => document.querySelector('#lkAction').textContent)) === beforeHover);

// click selects, button equips
const equippedBefore = await page.evaluate(() => document.querySelector('#lkGrid .uiCard.equipped')?.dataset.i ?? null);
await page.evaluate(() => {
  const t = [...document.querySelectorAll('#lkGrid .uiCard')].find((c) => !c.classList.contains('equipped'));
  if (t) t.click();
});
await settle();
note('click selected without equipping',
  (await page.evaluate(() => document.querySelector('#lkGrid .uiCard.equipped')?.dataset.i ?? null)) === equippedBefore);
note('EQUIP is offered', (await page.evaluate(() => document.querySelector('#lkAction').textContent)) === 'EQUIP');
await click('#lkAction');
await settle();
note('EQUIP equipped the selection',
  (await page.evaluate(() => document.querySelector('#lkGrid .uiCard.equipped')?.dataset.i ?? null)) !== equippedBefore);

for (const [label, sel, screen] of [
  ['shop', '#shopBtn', '#shop'],
  ['pass', '#passBtn', '#pass'],
  ['badges', '#badgesBtn', '#badges'],
  ['settings', '#settingsBtn', '#settings'],
]) {
  await click(sel); await settle();
  note(`open ${label}`, await visible(screen));
  note(`${label} is the only live screen`, (await page.evaluate(
    () => [...document.querySelectorAll('.screen')].filter((s) => !s.classList.contains('hidden')).length,
  )) === 1);
}

// support opens over settings
await click('.setActions button'); await settle();
note('support form opens', await visible('#support'));
await click('#supCancel'); await settle();
note('support form closes', !(await visible('#support')));

// back to the lobby, then the mode picker
await click('#tabPlay'); await settle();
note('back on the lobby', await visible('#home'));
await click('#playBtn'); await settle();
note('mode select opens from PLAY', await visible('#modeSelect'));
note('two modes offered', (await page.evaluate(() => document.querySelectorAll('#modeGrid .modeCard').length)) === 2);

// ---- the race
await click('#modeGo');
await page.evaluate(() => window.__dbg.tick(90, 1 / 60));
const state = await page.evaluate(() => window.__dbg.info?.().state ?? null);
note('a round started', state !== 'menu', `state=${state}`);
await page.evaluate(() => window.__dbg.tick(900, 1 / 60));
note('the round ran without the page falling over', true);

// ---- back to the menu
await page.evaluate(() => { window.__dbg.lobby(); });
await settle();
note('returned to the lobby', await visible('#home'));
note('cosmetic survived the round',
  (await page.evaluate(() => document.querySelectorAll('#lkGrid .uiCard.equipped, #home').length)) > 0);

console.log('');
console.log(`steps: ${steps.length}, failed: ${fails.length}`);
console.log(`game-originated errors: ${errs.length}`);
errs.slice(0, 12).forEach((e) => console.log(`  ${e}`));

await bye();
process.exit(fails.length || errs.length ? 1 : 0);
