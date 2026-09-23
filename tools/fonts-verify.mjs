#!/usr/bin/env node
// Is Fredoka served from this origin, and does it actually RENDER?
//
// Scramble Rush self-hosts Fredoka: one content-hashed WOFF2 per subset
// (latin, latin-ext, hebrew), named by the page as ./fredoka-<hash>.woff2 and
// served by the arcade's gated asset route. This checks the DEPLOYED result, in
// a real signed-in browser, rather than the build: the build is covered by
// perf-budget.mjs, and it was never going to notice a route that 404s the font,
// a CDN header that makes it uncacheable, or a page that quietly went back to
// Google.
//
// WHY THE PROOF IS NOT document.fonts.check(). Chrome answers true for a family
// that does not exist at all, and for text no face covers -- "nothing to wait
// for" -- so a check() that is true for 500/600/700 would pass with every font
// file 404ing. It is printed below as a signal and never counted. What counts:
//
//   - the FontFace for each subset exists and reaches status "loaded";
//   - the network log shows WHICH file the page fetched, and when;
//   - the text measures as Fredoka, one character at a time. A glyph set in
//     `Fredoka, monospace` and in `Fredoka, serif` must come out the same
//     width, and different from monospace and from serif on their own; a glyph
//     that fell back measures exactly as its fallback does. A Cyrillic
//     control, which Fredoka has no subset for, must FAIL that test on every
//     character, so a measurement that could never say no is caught too;
//   - 500, 600 and 700 are told apart by rendered ink, because Fredoka's
//     advance widths hardly change along its weight axis and its strokes do.
//
// And every file the page names is fetched once more with the session: 200,
// font/woff2, the immutable public policy, the WOFF2 signature, and bytes whose
// sha256 matches the hash in the filename -- that last one is the only thing
// that makes a year-long `immutable` a promise that can be kept.
//
// Nothing here is a benchmark. No timings are reported or asserted: the output
// is meant to be the same on every passing run.
import puppeteer from 'puppeteer';
import {
  arg, wantsHelp, showHelp, origin, GAME_PATH,
  requireProfile, profileDirName, seedSession, discardSession,
  whoami, assertSession, redact,
} from './perf-session.mjs';

const HELP = `
fonts-verify.mjs -- verify self-hosted Fredoka on a deployed build

  node tools/fonts-verify.mjs --profile "<chromium user-data dir>" [options]

  --profile <dir>      REQUIRED. A user-data directory already signed in.
  --profile-dir <name> Profile inside it (default: Default)
  --origin <url>       default https://nikcade.win
  --runs <n>           independent runs, each a fresh browser and cold cache
                       (default 1, at most 20)
  --help

What it changes: nothing. It loads the game page, renders a few strings off
screen, and fetches the font files the page names.

Exit codes: 0 every invariant held in every run; 2 anything failed.
`;

if (wantsHelp()) showHelp(HELP);

const BASE = origin();
const RUNS = Number(arg('runs', 1));
if (!Number.isInteger(RUNS) || RUNS < 1 || RUNS > 20) {
  console.error('error: --runs must be a whole number from 1 to 20');
  process.exit(2);
}

const FONT_FILE = /^fredoka-([0-9a-f]{12})\.woff2$/;
const GOOGLE = /(^|\.)fonts\.(googleapis|gstatic)\.com$/i;
const WANT_TYPE = 'font/woff2';
const WANT_CACHE = 'public, max-age=31536000, immutable';

// A subset is identified by what it COVERS, never by its hash: one probe code
// point that only that subset's unicode-range contains. Hashes change with the
// bytes; this does not.
const SUBSETS = [
  { name: 'latin', probe: 0x41 },      // A
  { name: 'latin-ext', probe: 0x141 }, // Ł
  { name: 'hebrew', probe: 0x5d0 },    // א
];
// Samples use only characters the font FILE contains, read from its cmap.
// Fredoka's latin-ext file is small: its unicode-range claims U+0100-02BA, but
// the only letters in it are Ł ł Š š Ž ž Ÿ (and ƒ). Ą, Ć, Ğ, ő, Ň and the rest
// fall back in every browser, exactly as they did when Google served the same
// binary -- a property of the typeface, and a sample containing one of them
// would read as a broken font. Hebrew has the full alphabet.
//
// No spaces: U+0020 is in the latin range, and a sample that mixed a latin
// glyph into a Hebrew one would measure partly Fredoka whatever happened.
const SAMPLES = { 'latin-ext': 'ŁłŠšŽžŸ', hebrew: 'שלוםעולם' };
const WEIGHT_SAMPLE = 'ScrambleRush';
const CONTROL = 'Жизнь'; // Cyrillic: no Fredoka subset covers it

function inRange(range, cp) {
  for (const m of String(range || '').matchAll(/U\+([0-9A-F]+)(?:-([0-9A-F]+))?/gi)) {
    const lo = parseInt(m[1], 16);
    const hi = m[2] ? parseInt(m[2], 16) : lo;
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}
const subsetOf = (range) => SUBSETS.find((s) => inRange(range, s.probe))?.name || null;
const fileOf = (url) => { try { return new URL(url).pathname.split('/').pop(); } catch { return String(url); } };

async function oneRun(root, n) {
  const checks = [];
  const ok = (label, good, detail = '') => checks.push({ label, good: !!good, detail: String(detail) });
  const seeded = seedSession(root, profileDirName(), `fonts-${n}`);
  const browser = await puppeteer.launch({
    headless: true, userDataDir: seeded,
    args: ['--no-sandbox', '--disable-extensions', '--enable-unsafe-swiftshader', '--mute-audio'],
  });
  try {
    // FAIL CLOSED ON AN UNSIGNED PROFILE. Without a session the game route is
    // a 403 page with no fonts on it, and every absence below would pass.
    assertSession(await whoami(await browser.newPage(), BASE), 'the supplied profile');

    const page = await browser.newPage();
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    // Every request the page makes, tagged with the phase it happened in.
    // `boot` is the load itself; `lazy` is the on-demand rendering below;
    // `probe` is this tool fetching the files, which is kept out of both.
    const reqs = new Map();
    let phase = 'boot';
    cdp.on('Network.requestWillBeSent', (e) => {
      if (!reqs.has(e.requestId)) reqs.set(e.requestId, { url: e.request.url, phase });
    });
    cdp.on('Network.responseReceived', (e) => {
      const r = reqs.get(e.requestId);
      if (r) { r.status = e.response.status; r.mime = e.response.mimeType; }
    });
    cdp.on('Network.loadingFailed', (e) => {
      const r = reqs.get(e.requestId);
      if (r) r.failed = e.errorText;
    });

    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e.message)));
    // A CSP that blocked a face would show only as a fallback font. Record the
    // violated directive and the blocked host, nothing else.
    await page.evaluateOnNewDocument(`(()=>{window.__csp=[];document.addEventListener('securitypolicyviolation',(e)=>{
      let h='';try{h=new URL(e.blockedURI).host}catch(q){h=String(e.blockedURI).slice(0,20)}
      window.__csp.push(e.effectiveDirective+' '+h)})})()`);

    const resp = await page.goto(BASE + GAME_PATH, { waitUntil: 'domcontentloaded', timeout: 120000 });
    ok('game document', resp.status() === 200, `HTTP ${resp.status()}`);
    let booted = true;
    try {
      await page.waitForFunction("(()=>{const e=document.querySelector('#modeSelect');return !!e&&!e.classList.contains('hidden')})()",
        { timeout: 120000, polling: 250 });
    } catch { booted = false; }
    ok('boots to Mode Select', booted, booted ? 'yes' : 'never reached #modeSelect');

    // ---- what the page declares, and what the boot actually loaded ----------
    const declared = await page.evaluate(async () => {
      await document.fonts.ready;
      const rules = [];
      for (const sheet of document.styleSheets) {
        let list;
        try { list = sheet.cssRules; } catch { rules.push({ unreadable: true }); continue; }
        for (const r of list) {
          if (!(r instanceof CSSFontFaceRule)) continue;
          const src = r.style.getPropertyValue('src');
          const m = src.match(/url\(\s*["']?([^"')]+)["']?\s*\)/);
          rules.push({
            family: r.style.getPropertyValue('font-family').replace(/["']/g, '').trim(),
            url: m ? new URL(m[1], document.baseURI).href : null,
            range: r.style.getPropertyValue('unicode-range'),
          });
        }
      }
      const faces = [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'Fredoka')
        .map((f) => ({ range: f.unicodeRange, weight: f.weight, status: f.status }));
      return {
        rules,
        faces,
        // A SIGNAL, NOT PROOF: see the header. The nonexistent family is here so
        // the report shows why.
        check: ['500', '600', '700'].map((w) => document.fonts.check(`${w} 16px Fredoka`)),
        checkNoSuchFamily: document.fonts.check('16px NoSuchFamilyZzq'),
      };
    });

    const assets = declared.rules.filter((r) => r.family === 'Fredoka')
      .map((r) => ({ ...r, file: fileOf(r.url), subset: subsetOf(r.range) }));
    ok('stylesheets readable', !declared.rules.some((r) => r.unreadable),
      declared.rules.some((r) => r.unreadable) ? 'a cross-origin stylesheet is linked' : 'yes');
    ok('Fredoka faces declared', assets.length === SUBSETS.length,
      `${assets.length}: ${assets.map((a) => `${a.subset || '?'}=${a.file}`).join(' ')}`);
    for (const s of SUBSETS) {
      const a = assets.filter((x) => x.subset === s.name);
      ok(`${s.name} face declared once`, a.length === 1, a.map((x) => x.file).join(' ') || 'none');
    }
    for (const a of assets) {
      ok(`${a.file} named like a hashed Fredoka`, FONT_FILE.test(a.file), a.file);
      let sameOrigin = false;
      try { sameOrigin = new URL(a.url).origin === new URL(BASE).origin; } catch { /* stays false */ }
      ok(`${a.file} served from this origin`, sameOrigin, sameOrigin ? 'yes' : a.url);
    }

    const faceFor = (faces, name) => faces.filter((f) => subsetOf(f.range) === name);
    ok('one FontFace per subset, weights 500..700', SUBSETS.every((s) => {
      const f = faceFor(declared.faces, s.name);
      if (f.length !== 1) return false;
      const [lo, hi = lo] = String(f[0].weight).split(/\s+/).map(Number);
      return lo <= 500 && hi >= 700;
    }), declared.faces.map((f) => `${subsetOf(f.range)}:${f.weight}`).join(' '));

    const local = (p) => [...reqs.values()].filter((r) => r.phase === p && FONT_FILE.test(fileOf(r.url)));
    const bootFiles = local('boot').map((r) => fileOf(r.url));
    const latin = assets.find((a) => a.subset === 'latin');
    ok('boot fetches only the latin subset', bootFiles.length === 1 && latin && bootFiles[0] === latin.file,
      bootFiles.map((f) => `${assets.find((a) => a.file === f)?.subset || '?'}=${f}`).join(' ') || 'none');
    ok('boot leaves latin-ext and hebrew unloaded',
      faceFor(declared.faces, 'latin')[0]?.status === 'loaded'
      && faceFor(declared.faces, 'latin-ext')[0]?.status === 'unloaded'
      && faceFor(declared.faces, 'hebrew')[0]?.status === 'unloaded',
      SUBSETS.map((s) => `${s.name}:${faceFor(declared.faces, s.name)[0]?.status}`).join(' '));

    // ---- render on demand, then measure --------------------------------------
    phase = 'lazy';
    const rendered = await page.evaluate(async ({ samples, weightSample, control, probes }) => {
      const covers = (range, cp) => [...String(range).matchAll(/U\+([0-9A-F]+)(?:-([0-9A-F]+))?/gi)]
        .some((m) => { const lo = parseInt(m[1], 16); const hi = m[2] ? parseInt(m[2], 16) : lo; return cp >= lo && cp <= hi; });
      const fredoka = () => [...document.fonts].filter((f) => f.family.replace(/["']/g, '') === 'Fredoka');
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-10000px;top:0;white-space:nowrap;font-size:32px';
      document.body.appendChild(host);
      const span = (text, font) => {
        const s = document.createElement('span');
        s.textContent = text;
        s.style.font = font;
        host.appendChild(s);
        host.appendChild(document.createElement('br'));
        return s;
      };
      // RENDER FIRST: real laid-out text is what makes a browser fetch a face,
      // so nothing here calls document.fonts.load() on the page's behalf.
      for (const t of [...Object.values(samples), control]) span(t, "600 32px 'Fredoka', monospace");
      void host.offsetWidth; // layout now -- this is the moment the faces are asked for
      // Wait for the faces those samples need to settle, loaded or failed. A
      // face the render never asked for stays "unloaded", the deadline passes,
      // and the checks below say so.
      const targets = () => fredoka().filter((f) => probes.some((cp) => covers(f.unicodeRange, cp)));
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline && !targets().every((f) => f.status === 'loaded' || f.status === 'error')) {
        await new Promise((r) => setTimeout(r, 100));
      }
      // THEN MEASURE, under two unrelated fallbacks.
      const w = (text, font) => span(text, font).getBoundingClientRect().width;
      // ONE CHARACTER AT A TIME. A glyph that Fredoka lacks, set in
      // `Fredoka, monospace`, is resolved exactly as `monospace` alone resolves
      // it, so it measures EXACTLY that fallback's width. A glyph Fredoka draws
      // measures the same under both stacks and differs from each fallback.
      // Per character, because a whole string hides one fallen-back glyph among
      // drawn ones -- and because monospace and serif can resolve to the SAME
      // system font for a script (Hebrew does, in headless Chrome on Windows),
      // which would make any whole-string comparison between them vacuous.
      // Widths are compared to 0.01 px: a real Fredoka glyph can sit only a
      // tenth of a pixel from its fallback.
      const verdict = (text, weight) => {
        const missing = [];
        for (const ch of [...text]) {
          const a = w(ch, `${weight} 32px 'Fredoka', monospace`);
          const b = w(ch, `${weight} 32px 'Fredoka', serif`);
          const m = w(ch, `${weight} 32px monospace`);
          const s = w(ch, `${weight} 32px serif`);
          if (!(Math.abs(a - b) < 0.01 && Math.abs(a - m) > 0.01 && Math.abs(b - s) > 0.01)) missing.push(ch);
        }
        return { glyphs: [...text].length, missing: missing.join('') };
      };
      // WEIGHT IS PROVEN BY INK, NOT WIDTH. Fredoka keeps its advance widths
      // almost constant across the wght axis (under 0.2 px over a whole word
      // from 500 to 700), so a width comparison cannot see the weight at all.
      // The strokes thicken, so the rendered coverage does.
      const ink = (text, weight) => {
        const c = document.createElement('canvas');
        c.width = 1200; c.height = 90;
        const x = c.getContext('2d');
        x.font = `${weight} 48px 'Fredoka', monospace`;
        x.textBaseline = 'top';
        x.fillText(text, 4, 12);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        let a = 0;
        for (let i = 3; i < d.length; i += 4) a += d[i];
        return a;
      };
      const out = { samples: {}, weights: {}, control: verdict(control, 600) };
      for (const [k, t] of Object.entries(samples)) out.samples[k] = verdict(t, 600);
      for (const wt of [500, 600, 700]) out.weights[wt] = { ...verdict(weightSample, wt), ink: ink(weightSample, wt) };
      out.faces = fredoka().map((f) => ({ range: f.unicodeRange, status: f.status }));
      host.remove();
      return out;
    }, {
      samples: SAMPLES, weightSample: WEIGHT_SAMPLE, control: CONTROL,
      probes: SUBSETS.filter((s) => s.name !== 'latin').map((s) => s.probe),
    });

    const allDrawn = (v) => v.missing.length === 0;
    const drawn = (v) => (allDrawn(v) ? `yes, ${v.glyphs}/${v.glyphs} glyphs` : `NO, falls back for ${v.missing}`);
    for (const wt of [500, 600, 700]) {
      const v = rendered.weights[wt];
      ok(`weight ${wt} renders in Fredoka`, allDrawn(v), drawn(v));
    }
    // One variable file per subset carries the whole 500..700 range. If the
    // three weights inked the same, the axis was not being applied and "600"
    // would only be a label.
    const inks = [500, 600, 700].map((wt) => rendered.weights[wt].ink);
    ok('500 < 600 < 700 in rendered ink (wght axis)', inks[0] < inks[1] && inks[1] < inks[2],
      inks[0] < inks[1] && inks[1] < inks[2] ? 'yes' : 'NO');
    for (const name of ['latin-ext', 'hebrew']) {
      const face = faceFor(rendered.faces, name)[0];
      const v = rendered.samples[name];
      ok(`${name} loads on demand and renders in Fredoka`, face?.status === 'loaded' && allDrawn(v),
        `face ${face?.status || 'missing'}, renders ${drawn(v)}`);
    }
    // The render test has to be able to say no. Fredoka has no Cyrillic, so
    // EVERY glyph of this must measure as a fallback -- measured, not assumed.
    const c = rendered.control;
    ok('control: Cyrillic falls back', c.missing.length === c.glyphs,
      c.missing.length === c.glyphs ? `yes, ${c.glyphs}/${c.glyphs} glyphs`
        : `only ${c.missing.length}/${c.glyphs} -- the render test cannot say no`);
    const lazyFiles = local('lazy').map((r) => fileOf(r.url));
    const lazyWant = assets.filter((a) => a.subset !== 'latin').map((a) => a.file).sort();
    ok('on-demand fetches exactly latin-ext and hebrew', JSON.stringify([...lazyFiles].sort()) === JSON.stringify(lazyWant),
      lazyFiles.map((f) => `${assets.find((a) => a.file === f)?.subset || '?'}=${f}`).join(' ') || 'none');
    const pageFontReqs = [...local('boot'), ...local('lazy')];
    const bad = pageFontReqs.filter((r) => r.failed || r.status !== 200 || r.mime !== WANT_TYPE);
    ok("every font request the page made succeeded", bad.length === 0,
      bad.length ? bad.map((r) => `${fileOf(r.url)} ${r.status ?? ''} ${r.mime || r.failed || ''}`).join(' | ') : `${pageFontReqs.length} ok`);

    // ---- every declared file, fetched once more ------------------------------
    phase = 'probe';
    const probed = await page.evaluate(async (urls) => Promise.all(urls.map(async (u) => {
      const r = await fetch(u, { cache: 'no-store', credentials: 'same-origin' });
      const buf = new Uint8Array(await r.arrayBuffer());
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
      return {
        url: u, status: r.status, type: r.headers.get('content-type'), cache: r.headers.get('cache-control'),
        magic: String.fromCharCode(...buf.slice(0, 4)), bytes: buf.length,
        sha12: [...digest].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12),
      };
    })), assets.map((a) => a.url));
    for (const p of probed) {
      const f = fileOf(p.url);
      const hash = (f.match(FONT_FILE) || [])[1];
      const good = p.status === 200 && p.type === WANT_TYPE && String(p.cache).includes(WANT_CACHE)
        && p.magic === 'wOF2' && hash === p.sha12;
      ok(`asset ${f}`, good, `${p.status} ${p.type} "${p.cache}" ${p.magic === 'wOF2' ? 'wOF2' : 'NOT WOFF2'} `
        + `${p.bytes} B, content hash ${hash === p.sha12 ? 'matches name' : `${p.sha12} != name`}`);
    }

    // ---- nothing from Google, nothing blocked, nothing font-shaped in errors -
    const google = [...reqs.values()].filter((r) => { try { return GOOGLE.test(new URL(r.url).host); } catch { return false; } });
    ok('Google font requests', google.length === 0, `${google.length}`);
    const csp = (await page.evaluate(() => window.__csp || [])).filter((v) => /font|style/.test(v));
    const fontErrors = errors.filter((e) => /font|woff|fredoka|googleapis|gstatic/i.test(e));
    ok('font errors (console, CSP)', fontErrors.length === 0 && csp.length === 0,
      fontErrors.length || csp.length ? [...fontErrors.map(redact), ...csp].slice(0, 3).join(' | ') : 'none');

    return {
      checks,
      info: {
        check: declared.check, checkNoSuchFamily: declared.checkNoSuchFamily,
        otherErrors: errors.length - fontErrors.length,
      },
    };
  } finally {
    await browser.close();
    discardSession(seeded);
  }
}

async function main() {
  const root = requireProfile();
  let version = 'unknown';
  try { version = (await (await fetch(`${BASE}/health`)).json()).version || 'unknown'; } catch { /* reported as unknown */ }
  console.log(`fonts-verify: ${BASE}  deployed ${version}  runs ${RUNS}`);

  let failedRuns = 0;
  for (let n = 1; n <= RUNS; n += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { checks, info } = await oneRun(root, n);
    const fails = checks.filter((c) => !c.good);
    if (fails.length) failedRuns += 1;
    console.log(`\nrun ${n}: ${fails.length ? `FAIL (${fails.length})` : 'pass'}`);
    for (const c of checks) console.log(`  ${c.good ? 'ok  ' : 'FAIL'}  ${c.label.padEnd(46)} ${c.detail}`);
    console.log(`  --    document.fonts.check 500/600/700 ${info.check.join('/')} (for a family that does not exist: ${info.checkNoSuchFamily}; a signal, never proof)`);
    console.log(`  --    other console errors            ${info.otherErrors} (not font-related; see post-deploy-check.mjs)`);
  }
  console.log(failedRuns ? `\nFAIL: ${failedRuns} of ${RUNS} run(s) broke an invariant` : `\nPASS: every invariant held in ${RUNS} of ${RUNS} run(s)`);
  process.exit(failedRuns ? 2 : 0);
}

main().catch((e) => { console.error(redact(e.message || e)); process.exit(2); });
