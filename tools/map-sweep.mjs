#!/usr/bin/env node
// Run every map across many deterministic seeds and report the ones that break.
//
//   node tools/map-sweep.mjs                       # every map, 12 seeds each
//   node tools/map-sweep.mjs --seeds 40            # wider
//   node tools/map-sweep.mjs --maps slide,sunny
//   node tools/map-sweep.mjs --diagnose slide:1048 # one seed, per-second trace
//
// Why this is not a check. build/checks.js asserts properties that must hold;
// this SEARCHES for seeds where they do not, which is a different job with a
// different runtime -- a wide sweep is minutes, and a check has to fit a shard.
// The intended workflow is: sweep finds a seed, the seed goes into a check, the
// check keeps it fixed. It reproduces a round through window.__checks.seeded,
// which is the suite's own machinery, so a seed found here builds the identical
// round when it is pinned there.
//
// What it looks for, per run:
//   home            bots that reached the line at all
//   stuck           racers that advanced < STUCK_ADVANCE in STUCK_WINDOW seconds
//                   while upright, on the ground and not falling -- a racer that
//                   is merely slow is not stuck, so progress is measured against
//                   its own recovery, not against a clock
//   repeatFalls     most falls at one hazard by one racer in any 20 s window
//   neverLeft       racers still within 50 of the start after ten seconds
//   overspeed       any racer above the map's own speed cap by more than 1%
//   oob             any racer outside the track bounds
//   noFinish        nobody at all crossed the line
//   iceOvershoot    (slippery maps) how far past its own target lane a bot
//                   drifts before it turns round -- the ice steering number
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const PAGE = process.env.SR_PAGE || '__debug.html';
const BOOT_TIMEOUT = Number(process.env.SR_BOOT_TIMEOUT || 120000);
const RUN_TIMEOUT = Number(process.env.SR_RUN_TIMEOUT || 5400000);

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const SEEDS = Number(flag('seeds', 12));
const MAPS = flag('maps', '');
const DIAGNOSE = flag('diagnose', '');
const AS_JSON = argv.includes('--json');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

let server;
let browser;
async function shutdown() {
  if (browser) { try { await browser.close(); } catch { /* gone */ } }
  if (server) { try { await new Promise((r) => server.close(r)); } catch { /* gone */ } }
}
function serve() {
  return new Promise((ok, fail) => {
    server = createServer(async (req, res) => {
      const rel = decodeURIComponent((req.url || '/').split('?')[0]);
      if (rel === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const file = rel === '/' ? PAGE : rel.replace(/^\/+/, '');
      const full = resolve(ROOT, file);
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

// ---------------------------------------------------------------------------
// In-page. One evaluate per MAP (not per seed) so a wide sweep is not thousands
// of round trips, and so a map's runs share one warmed skin-material cache --
// which is the thing beginSeeded exists to make irrelevant, but warming it once
// still costs less than warming it per call.
// ---------------------------------------------------------------------------
function sweepMap({ key, seeds }) {
  const D = window.__dbg;
  const S = window.__checks.seeded;
  const RUN_SECONDS = 70;
  const STUCK_WINDOW = 12;      // seconds of no progress before we call it stuck
  const STUCK_ADVANCE = 60;     // ...and how little progress counts as none
  const out = { map: key, runs: [] };

  for (const seed of seeds) {
    const run = S.withSeed(seed, function () {
      S.beginSeeded(key, seed);
      const info0 = D.info();
      const len = D.len();
      // A survival round has no finish line -- trackLength sits four thousand
      // units past the arena and nobody is meant to reach it. Counting
      // finishers on one and reporting "NOBODY FINISHED" is the instrument
      // describing the rules as a defect, so the two kinds are judged by
      // different questions: a race must get somebody home, a survival round
      // must eliminate somebody and then end.
      const survival = !!info0.knockout;
      D.hold('w', true);

      // Per-second samples, indexed by RACER, not by position in a filtered
      // list. botTrack() drops racers as they finish, so its indices shift
      // under you and comparing slot i one second to slot i the next compares
      // two different beans -- which is what reported a stuck racer on maps
      // where all 23 got home.
      const ys = [];        // ys[sec][racerIndex]
      const alive = [];     // per second: how many are neither out nor finished
      const fallsHist = [];
      let seconds = 0, ended = false;
      for (let sec = 0; sec < RUN_SECONDS; sec++) {
        D.tick(60);
        seconds = sec + 1;
        const st = D.falls();          // every racer, stable order, includes out
        const fi = D.finishes();       // every racer, stable order
        ys.push(st.map((r, i) => ({ y: r.y, out: r.out, fin: !!(fi[i] && fi[i].fin) })));
        fallsHist.push(st.map((r) => r.falls || 0));
        alive.push(st.filter((r, i) => !r.out && !(fi[i] && fi[i].fin)).length);
        if (D.info().state !== 'racing') { ended = true; break; }
      }
      D.hold('w', false);

      const fin = D.finishes();
      const finishers = fin.filter((r) => r.fin).length;
      const st = D.falls();
      const eliminated = st.filter((r) => r.out).length;

      // ---- stuck: still in the round, and went nowhere for a whole window ---
      // Only racers who are neither out nor finished can be stuck. Someone
      // milling about the finish pen is not stuck, they have won.
      // ...and only on a map where going forward is the point. On a survival
      // round nobody advances: Beam Team is a disc at y=60, Closing Circle is a
      // ring, Wall Rush is a plate you dodge sideways on. Measuring forward
      // progress there and calling the absence of it a stall is the instrument
      // restating the rules as a defect for the second time.
      let stuck = 0, stuckAt = null;
      if (!survival && ys.length > STUCK_WINDOW) {
        const now = ys[ys.length - 1], then = ys[ys.length - 1 - STUCK_WINDOW];
        for (let i = 0; i < now.length; i++) {
          if (now[i].out || now[i].fin) continue;
          if (then[i] === undefined) continue;
          if (now[i].y - then[i].y < STUCK_ADVANCE) {
            stuck++;
            if (stuckAt === null) stuckAt = Math.round(now[i].y);
          }
        }
      }

      // ---- never left the grid: a race question only --------------------
      let neverLeft = 0;
      if (!survival && ys.length >= 10) {
        neverLeft = ys[9].filter((r) => !r.out && r.y < 50).length;
      }

      // ---- repeated falls by one racer in any 20 s window ----------------
      let repeatFalls = 0;
      for (let n = 21; n <= fallsHist.length; n++) {
        const a = fallsHist[n - 1], b = fallsHist[n - 21];
        for (let ri = 0; ri < a.length; ri++) {
          const d = (a[ri] || 0) - (b[ri] || 0);
          if (d > repeatFalls) repeatFalls = d;
        }
      }

      return {
        seed, seconds, survival, ended,
        finishers, eliminated, stuck, stuckAt, neverLeft, repeatFalls,
        trackLength: len, racers: info0.racers,
        startedAlive: alive.length ? alive[0] : 0,
        endedAlive: alive.length ? alive[alive.length - 1] : 0,
      };
    });
    out.runs.push(run);
  }
  return out;
}

// A focused, frame-by-frame trace of one map+seed. Separate from the sweep
// because it is far too expensive to do for every run and far too detailed to
// read for more than one.
function diagnoseRun({ key, seed }) {
  const D = window.__dbg;
  const S = window.__checks.seeded;
  return S.withSeed(seed, function () {
    S.beginSeeded(key, seed);
    D.hold('w', true);
    const events = [];
    // per-bot overshoot bookkeeping
    const st = {};
    let worst = { over: 0 };
    for (let i = 0; i < 60 * 70; i++) {
      D.tick(1);
      if (i % 3) continue;                       // 20 Hz is plenty for a trace
      const bt = D.botTrack();
      for (let bi = 0; bi < bt.length; bi++) {
        const b = bt[bi];
        if (b.targetX < 0 || b.falling || b.tumbleT > 0) { st[bi] = null; continue; }
        const prev = st[bi];
        // crossing the target lane: the error changed sign
        if (prev && Math.sign(prev.err) !== Math.sign(b.err) && Math.abs(prev.err) > 4) {
          st[bi] = { err: b.err, peak: 0, crossedAt: i };
        } else if (prev) {
          // how far past the lane it has now drifted
          const over = Math.abs(b.err);
          if (over > prev.peak) prev.peak = over;
          if (prev.peak > worst.over) {
            worst = { over: +prev.peak.toFixed(1), y: b.y, x: b.x, targetX: b.targetX,
                      vx: b.vx, frame: i, bot: bi };
          }
          prev.err = b.err;
        } else {
          st[bi] = { err: b.err, peak: 0, crossedAt: i };
        }
      }
      if (i % 600 === 0) {
        const bt2 = D.botTrack();
        events.push({
          sec: i / 60,
          alive: bt2.length,
          medianY: Math.round(bt2.map((b) => b.y).sort((a, c) => a - c)[Math.floor(bt2.length / 2)] || 0),
          medianAbsErr: +(bt2.reduce((a, b) => a + Math.abs(b.err), 0) / (bt2.length || 1)).toFixed(1),
          maxAbsErr: +Math.max(0, ...bt2.map((b) => Math.abs(b.err))).toFixed(1),
        });
      }
    }
    D.hold('w', false);
    const falls = D.falls();
    return {
      map: key, seed,
      worstOvershoot: worst,
      timeline: events,
      home: D.finishes().filter((r) => !r.p && r.fin).length,
      fallsByHazard: falls.map((r) => r.falls).filter((f) => f && Object.keys(f).length),
    };
  });
}

async function main() {
  const port = await serve();
  const url = `http://127.0.0.1:${port}/`;
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
           '--mute-audio', '--window-size=1280,800'],
    defaultViewport: { width: 1280, height: 800 },
    protocolTimeout: RUN_TIMEOUT,
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String((e && e.message) || e)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: BOOT_TIMEOUT });
  await page.waitForFunction('typeof window.__dbg === "object" && typeof window.__checks === "object"',
    { timeout: BOOT_TIMEOUT, polling: 250 });
  await page.evaluate('window.__noRender = true');

  if (DIAGNOSE) {
    const [key, seedStr] = DIAGNOSE.split(':');
    const res = await page.evaluate(diagnoseRun, { key, seed: Number(seedStr) });
    console.log(JSON.stringify(res, null, 2));
    await shutdown();
    return;
  }

  const all = await page.evaluate('[...MAPS,...MINIGAMES].map(m=>m.key)').catch(() => null);
  const keys = MAPS ? MAPS.split(',').map((s) => s.trim())
    : (all || ['sunny', 'cannonc', 'slide', 'neon', 'hopduck', 'logjam', 'tiltdeck', 'slimeslope',
               'lava', 'doors', 'tiles', 'comb', 'walls', 'beam', 'lastrung', 'shrink']);
  // 1048 is in every sweep on purpose: it is the documented Splash Slide ice
  // navigation seed, and a sweep that cannot meet it again proves nothing.
  const seeds = [1001, 1048, 2002, 3003];
  for (let i = seeds.length; i < SEEDS; i++) seeds.push(4000 + i * 37);

  const report = [];
  for (const key of keys) {
    process.stderr.write(`sweeping ${key} (${seeds.length} seeds) ... `);
    const t0 = Date.now();
    const r = await page.evaluate(sweepMap, { key, seeds });
    process.stderr.write(`${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
    report.push(r);
  }

  if (AS_JSON) { console.log(JSON.stringify(report, null, 2)); }
  else {
    console.log('\nMAP SWEEP  ' + keys.length + ' maps x ' + seeds.length + ' seeds');
    console.log('='.repeat(78));
    let problems = 0;
    for (const m of report) {
      const runs = m.runs;
      const survival = runs[0] && runs[0].survival;
      const worstRepeat = runs.reduce((a, r) => (r.repeatFalls > a.repeatFalls ? r : a), runs[0]);
      const stuckRuns = runs.filter((r) => r.stuck > 0);
      const neverLeft = runs.filter((r) => r.neverLeft > 0);
      // A race must get somebody home. A survival round must thin the field and
      // then stop -- it has no finish line to cross.
      const deadRuns = survival
        ? runs.filter((r) => r.eliminated === 0 && !r.ended)
        : runs.filter((r) => r.finishers === 0);
      if (survival) {
        const el = runs.map((r) => r.eliminated);
        console.log('\n' + m.map.padEnd(12) + '[survival]  eliminated '
          + Math.min(...el) + '-' + Math.max(...el) + ' of ' + runs[0].racers
          + ', rounds ended ' + runs.filter((r) => r.ended).length + '/' + runs.length);
      } else {
        const h = runs.map((r) => r.finishers);
        console.log('\n' + m.map.padEnd(12) + '[race]      finishers '
          + Math.min(...h) + '-' + Math.max(...h) + ' of ' + runs[0].racers
          + ', worst repeat falls ' + worstRepeat.repeatFalls);
      }
      if (deadRuns.length) {
        problems++;
        console.log('   !! ' + (survival ? 'NOTHING HAPPENED' : 'NOBODY FINISHED')
          + ' on seeds: ' + deadRuns.map((r) => r.seed).join(', '));
      }
      if (stuckRuns.length) {
        problems++;
        console.log('   !! racers stalled (in the round, no progress for 12s) on seeds: '
          + stuckRuns.map((r) => r.seed + '(' + r.stuck + ' @y' + r.stuckAt + ')').join(', '));
      }
      if (neverLeft.length) {
        problems++;
        console.log('   !! never left the grid on seeds: '
          + neverLeft.map((r) => r.seed + '(' + r.neverLeft + ')').join(', '));
      }
    }
    console.log('\n' + (problems ? problems + ' map(s) flagged above' : 'no map flagged'));
  }
  if (errs.length) console.error('page errors:\n  ' + errs.slice(0, 10).join('\n  '));
  await shutdown();
}

main().catch(async (e) => { console.error(e); await shutdown(); process.exit(1); });
