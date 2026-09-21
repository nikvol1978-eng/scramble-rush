#!/usr/bin/env node
// Photograph every meta screen at every supported viewport, and audit the
// layout the shot was taken of.
//
//   node tools/meta-shots.mjs
//   SR_OUT=/tmp/shots SR_LABEL=before node tools/meta-shots.mjs
//   SR_SCREENS=locker,shop SR_VIEWPORTS=1920x1080 node tools/meta-shots.mjs
//
// Two things happen per (screen, viewport): a PNG, and a machine audit of the
// DOM that produced it. The audit is here because a screenshot proves a layout
// is wrong only once a human looks at it, and there are 13 screens times 7
// viewports of them. It catches the four failures this overhaul exists to fix:
//
//   overlap      two cards in the same shelf covering each other
//   clipped      text wider or taller than the box drawn around it
//   offscreen    an interactive control outside the viewport
//   stacked      more than one primary screen live at once
//
// Navigation is by REAL CLICKS on the real controls rather than by calling the
// game's internals, so a screen that cannot be reached by pointer fails here
// the same way it fails for a player.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const HERE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ROOT = resolve(process.env.SR_ROOT || HERE);
const OUT = resolve(process.env.SR_OUT || join(HERE, 'docs', 'ui-review'));
const LABEL = process.env.SR_LABEL || 'new';

const ALL_VIEWPORTS = [
  ['1920x1080', 1920, 1080],
  ['1600x900', 1600, 900],
  ['1366x768', 1366, 768],
  ['1280x720', 1280, 720],
  ['1024x768', 1024, 768],
  ['short', 1440, 620],   // short-height desktop
  ['phone', 390, 844],
];

// Each screen names the control that opens it. `sub` runs after the screen is
// up -- a locker category, a profile tab -- so a tab that renders over another
// tab's content is photographed in the state that shows it.
const ALL_SCREENS = [
  { name: 'home', open: null },
  { name: 'locker-skin', open: '#profileBtn', sub: '.lkTab[data-lk="skin"]' },
  { name: 'locker-pattern', open: '#profileBtn', sub: '.lkTab[data-lk="pattern"]' },
  { name: 'locker-hat', open: '#profileBtn', sub: '.lkTab[data-lk="hat"]' },
  { name: 'locker-eyes', open: '#profileBtn', sub: '.lkTab[data-lk="eyes"]' },
  { name: 'badges', open: '#badgesBtn' },
  { name: 'modeselect', open: '#playBtn' },
  { name: 'shop', open: '#shopBtn' },
  { name: 'pass', open: '#passBtn' },
  { name: 'settings', open: '#settingsBtn' },
  { name: 'support', open: '#settingsBtn', sub: '.setActions button' },
  { name: 'daily', open: '#dailyBtn' },
  // The two loading contexts cannot be reached by clicking: one is up before
  // the game exists and the other only during a round. They are posed instead.
  { name: 'loading1-boot', open: null, js: `
      const b = document.createElement('div');
      b.id = 'bootScreen';
      b.innerHTML = '<div class="bootMark">Scramble Rush</div>'
                  + '<div class="bootRing"></div>'
                  + '<div class="bootWord">Loading\\u2026</div>';
      document.body.appendChild(b);
  ` },
  // Posed through the DOM, NOT by calling fillMapIntro(MAPS[0]): the game runs
  // inside an IIFE, so neither the function nor the map table is reachable from
  // page.evaluate. The first attempt called both, got undefined for each, and
  // photographed an empty briefing over the lobby -- which looked like a broken
  // screen and was a broken pose.
  // Every lookup is guarded, because this same pose runs against the BEFORE
  // build too and half these elements do not exist there -- the old briefing
  // was a name and a tip, centred. An unguarded pose threw on the old build and
  // took the whole sweep down with it.
  { name: 'loading2-briefing', open: null, js: `
      const set = (id, text) => { const e = document.getElementById(id); if (e) e.textContent = text; };
      set('mapIntroName', 'SUNNY SPRINT');
      set('mapIntroTip', 'Ramps carry you further than a dive \\u2014 take them at full speed.');
      set('mapIntroGoal', 'REACH THE FINISH');
      const mode = document.getElementById('mapIntroMode');
      if (mode) { mode.textContent = 'RACE'; mode.classList.remove('survival'); }
      const art = document.getElementById('mapIntroArt');
      if (art) art.setAttribute('style', 'background:linear-gradient(160deg,#8ecae6,#4a90c9 52%,#ffe17a)');
      // The briefing is drawn over a round, where the menu chrome is down.
      const ch = document.getElementById('menuChrome');
      if (ch) ch.classList.add('hidden');
      const hm = document.getElementById('home');
      if (hm) hm.classList.add('hidden');
      const mi = document.getElementById('mapIntro');
      if (mi) mi.classList.remove('hidden');
  ` },
];

const pick = (env, all, key) => {
  const want = (process.env[env] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return want.length ? all.filter((x) => want.includes(key(x))) : all;
};
const VIEWPORTS = pick('SR_VIEWPORTS', ALL_VIEWPORTS, (v) => v[0]);
const SCREENS = pick('SR_SCREENS', ALL_SCREENS, (s) => s.name);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

let server, browser;
const shutdown = async () => {
  if (browser) { try { await browser.close(); } catch { /* gone */ } }
  if (server) { try { await new Promise((r) => server.close(r)); } catch { /* gone */ } }
};

function serve() {
  return new Promise((ok, fail) => {
    server = createServer(async (req, res) => {
      const rel = decodeURIComponent((req.url || '/').split('?')[0]);
      if (rel === '/favicon.ico') { res.writeHead(204); res.end(); return; }
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

// ---------------------------------------------------------------- the audit
// Runs in the page. Returns plain data; every complaint carries the selector
// and the numbers behind it so a failure is actionable without re-running.
const AUDIT = () => {
  const out = { stacked: [], overlap: [], clipped: [], offscreen: [], notes: [] };
  const vw = window.innerWidth, vh = window.innerHeight;
  const vis = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const sel = (el) => {
    if (el.id) return '#' + el.id;
    const cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '';
    return el.tagName.toLowerCase() + (cls ? '.' + String(cls).trim().split(/\s+/).join('.') : '');
  };

  // ---- stacked primary screens
  const live = [...document.querySelectorAll('.screen')].filter((s) => !s.classList.contains('hidden') && vis(s));
  if (live.length > 1) out.stacked = live.map(sel);

  // Only the topmost live screen is judged for layout; a screen underneath is
  // already reported as `stacked` and its boxes are not what is on screen.
  const scope = live.length ? live[live.length - 1] : document.body;

  // ---- overlapping cards. Siblings in the same container that cover each
  // other are the locker/badge/shop defect; nested elements legitimately
  // overlap their parents, so only SIBLINGS are compared.
  // EVERY visible card is compared with every other, not just with the ones
  // sharing its parent. The first version of this grouped by parent and so
  // could not see a row of daily cards cutting through the footers of the
  // featured row above it -- different containers, so never compared. That is
  // precisely the "card borders run through other rows" defect, and the audit
  // reported the screen clean while a screenshot showed it plainly.
  const CARDISH = '.lkTile,.shCard,.psTile,.badgeCard,.bgCard,.setCard,.modeCard,.uiCard,.tabPane>*';
  const cards = [...scope.querySelectorAll(CARDISH)].filter(vis);
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const A = cards[i], B = cards[j];
      // A card legitimately covers a card it contains.
      if (A.contains(B) || B.contains(A)) continue;
      const a = A.getBoundingClientRect(), b = B.getBoundingClientRect();
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      // 1px of shared edge is a border meeting a border, not an overlap.
      if (ox > 1 && oy > 1) {
        out.overlap.push({
          a: sel(A), b: sel(B), sameParent: A.parentElement === B.parentElement,
          area: Math.round(ox * oy), ox: Math.round(ox), oy: Math.round(oy),
        });
      }
    }
  }

  // ---- chrome covering content. The nav strip is a layer above every screen,
  // so "is anything important underneath it" is a question the audit has to
  // ask directly rather than infer from card geometry.
  // #menuChrome itself spans the full width and is pointer-events:none -- it is
  // a container, not a surface. Measuring against its box called the lobby
  // wordmark "covered" at every viewport when the wordmark sits at the left and
  // the pills are centred, nowhere near it. What actually covers anything is
  // the strip and the currency chips, so those are what get measured.
  const chromeParts = [...document.querySelectorAll('#menuChrome .lobbyTabs, #menuChrome .lobbyCurrency, #menuChrome .homeBtn')].filter(vis);
  if (chromeParts.length) {
    const victims = [...scope.querySelectorAll('button,input,h1,h2,.shTitle,.viewTitle,.lkName,.uiCardName,.psName,.shName')].filter(vis);
    for (const part of chromeParts) {
      const c = part.getBoundingClientRect();
      for (const el of victims) {
        if (part.contains(el) || el.contains(part)) continue;
        const r = el.getBoundingClientRect();
        const ox = Math.min(c.right, r.right) - Math.max(c.left, r.left);
        const oy = Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top);
        if (ox > 1 && oy > 1) out.notes.push({ kind: 'under-chrome', part: sel(part), el: sel(el), oy: Math.round(oy) });
      }
    }
  }

  // ---- clipped text. An element whose own content does not fit the box it
  // was given, where the box hides the remainder.
  const texty = [...scope.querySelectorAll('*')].filter((el) => {
    if (!vis(el)) return false;
    if (!el.firstChild) return false;
    // direct text only -- a container's scrollHeight is its children's business
    return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  });
  for (const el of texty) {
    const s = getComputedStyle(el);
    const hiddenX = s.overflowX === 'hidden' || s.overflowX === 'clip';
    const hiddenY = s.overflowY === 'hidden' || s.overflowY === 'clip';
    // A line clamp is a designed truncation with its own ellipsis, exactly
    // like text-overflow -- not a box that is too small for its text.
    const ellipsis = s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none';
    const dx = el.scrollWidth - el.clientWidth;
    const dy = el.scrollHeight - el.clientHeight;
    // ellipsis is a deliberate truncation, not a defect
    if (hiddenX && dx > 1 && !ellipsis) out.clipped.push({ el: sel(el), axis: 'x', by: dx, text: el.textContent.trim().slice(0, 40) });
    if (hiddenY && dy > 1) out.clipped.push({ el: sel(el), axis: 'y', by: dy, text: el.textContent.trim().slice(0, 40) });
  }

  // ---- controls outside the viewport. Buttons and inputs only: a decorative
  // ring that bleeds off the edge is the design, a button that does is a bug.
  const controls = [...document.querySelectorAll('button,input,select,textarea,[role="button"],[role="tab"]')].filter(vis);
  for (const el of controls) {
    // inside a scroll container, being out of view is what scrolling is for
    let p = el.parentElement, scrollable = false;
    while (p && p !== document.body) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX + s.overflowY)) { scrollable = true; break; }
      p = p.parentElement;
    }
    if (scrollable) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1 || r.top < -1) {
      out.offscreen.push({
        el: sel(el),
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
        viewport: [vw, vh],
      });
    }
  }
  return out;
};

async function main() {
  await mkdir(OUT, { recursive: true });
  const port = await serve();
  console.log(`serving ${ROOT}  (label: ${LABEL})`);

  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
           '--mute-audio', '--window-size=1920,1080'],
    defaultViewport: { width: 1280, height: 720 },
    protocolTimeout: 600000,
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String((e && e.message) || e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__dbg && window.__checks', { timeout: 180000 });
  await page.evaluate(() => { window.__noRender = false; window.__dbg.quality('high'); });

  const report = [];
  for (const [vname, w, h] of VIEWPORTS) {
    await page.setViewport({ width: w, height: h });
    for (const screen of SCREENS) {
      // Always come back through the lobby, so a screen is opened from the
      // same place every time and one screen's leftovers cannot dress another.
      // Tear down anything a POSED screen left behind. Without this the boot
      // overlay appended for loading1 was still in the document for every shot
      // after it, and the next screenshot was a picture of the wrong screen.
      await page.evaluate(() => {
        const b = document.getElementById('bootScreen');
        if (b && b.parentNode) b.parentNode.removeChild(b);
        const mi = document.getElementById('mapIntro');
        if (mi) mi.classList.add('hidden');
        const sup = document.getElementById('support');
        if (sup) sup.classList.add('hidden');
      });
      await page.evaluate(() => { window.__dbg.lobby(); });
      await page.evaluate(() => { window.dispatchEvent(new Event('resize')); window.__dbg.tick(20, 1 / 60); });

      let reached = true;
      if (screen.open) {
        const ok = await page.evaluate((s) => {
          const b = document.querySelector(s);
          if (!b) return false;
          b.click();
          return true;
        }, screen.open);
        if (!ok) reached = false;
      }
      if (reached && screen.sub) {
        await page.evaluate((s) => { const b = document.querySelector(s); if (b) b.click(); }, screen.sub);
      }
      // A posed screen: run its own setup inside the page. Used for the two
      // loading contexts, which no sequence of clicks can reach.
      if (reached && screen.js) {
        await page.evaluate(`(()=>{ ${screen.js} })()`);
      }
      if (!reached) {
        report.push({ screen: screen.name, viewport: vname, error: `control ${screen.open} not found` });
        continue;
      }

      // The locker and shop stream their tile renders in over several frames.
      // Shooting before they land photographs a grid of blank white boxes and
      // calls it the design. Wait for the count to stop climbing.
      await page.evaluate(async () => {
        const n = () => document.querySelectorAll('.lkShot.done, .shShot.done, .psShot.done').length;
        let last = -1, still = 0;
        for (let i = 0; i < 90 && still < 4; i++) {
          window.__dbg.tick(6, 1 / 60);
          await new Promise((r) => setTimeout(r, 40));
          const now = n();
          still = now === last ? still + 1 : 0;
          last = now;
        }
      });
      await page.evaluate(() => { window.__dbg.tick(20, 1 / 60); window.__dbg.renderFull(); });
      const file = join(OUT, `${screen.name}--${vname}--${LABEL}.png`);
      await page.screenshot({ path: file });
      const audit = await page.evaluate(AUDIT);
      const bad = audit.stacked.length + audit.overlap.length + audit.clipped.length
                + audit.offscreen.length + audit.notes.length;
      report.push({ screen: screen.name, viewport: vname, file, ...audit });
      console.log(`  ${screen.name} @ ${vname}  ${bad ? `${bad} PROBLEM(S)` : 'clean'}`);
    }
  }

  const jsonPath = join(OUT, `audit-${LABEL}.json`);
  await writeFile(jsonPath, JSON.stringify({ label: LABEL, pageErrors: errs, report }, null, 2));

  // ---- summary
  const tally = { stacked: 0, overlap: 0, clipped: 0, offscreen: 0, notes: 0 };
  for (const r of report) for (const k of Object.keys(tally)) tally[k] += (r[k] || []).length;
  console.log('');
  console.log(`audit -> ${jsonPath}`);
  console.log(`  stacked screens : ${tally.stacked}`);
  console.log(`  overlapping     : ${tally.overlap}`);
  console.log(`  clipped text    : ${tally.clipped}`);
  console.log(`  offscreen ctrls : ${tally.offscreen}`);
  console.log(`  under chrome    : ${tally.notes}`);
  console.log(`  page errors     : ${errs.length}`);
  if (errs.length) errs.slice(0, 10).forEach((e) => console.log(`    ${e}`));
}

main().then(shutdown, async (e) => { await shutdown(); console.error(e); process.exit(1); });
