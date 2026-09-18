#!/usr/bin/env node
// Measure how the bean actually moves, so that "it feels floaty" is a number
// something can disagree with.
//
//   node tools/movement-metrics.mjs                 # the whole battery
//   node tools/movement-metrics.mjs --json          # machine-readable
//   node tools/movement-metrics.mjs --only ground,jump,dive
//
// Why this exists. Every movement constant in 15_actions.js carries a comment
// saying what it was tuned for, and none of them says what the tuning PRODUCED.
// Retuning by feel and then arguing about the result is how a change that makes
// the standing start snappier quietly doubles the braking distance. This runs
// the shipped simulation under a controlled starting condition and reports the
// dozen numbers that actually describe the feel: how long to top speed, how far
// to stop, what a jump clears, what a dive buys over running it.
//
// It is a MEASUREMENT tool, not a test: nothing here passes or fails. The
// properties that must not regress are asserted in build/checks.js, where a CI
// job can see them. This is what you read while deciding what those assertions
// should say.
//
// Units. The simulation steps at a fixed 1/60 s and every velocity in it is
// "units per frame at 60fps" -- f = dt*60 = 1. Distances are sim units; the
// racer's own radius is 17 and the track is 520 across, which is the scale to
// read the gap and jump numbers against. Times are reported in seconds.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const PAGE = process.env.SR_PAGE || '__debug.html';
const BOOT_TIMEOUT = Number(process.env.SR_BOOT_TIMEOUT || 120000);
const RUN_TIMEOUT = Number(process.env.SR_RUN_TIMEOUT || 1800000);

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const ONLY = (() => {
  const i = argv.indexOf('--only');
  return i >= 0 && argv[i + 1] ? new Set(argv[i + 1].split(',').map((s) => s.trim())) : null;
})();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

let server;
let browser;

async function shutdown() {
  if (browser) { try { await browser.close(); } catch { /* already gone */ } }
  if (server) { try { await new Promise((r) => server.close(r)); } catch { /* already gone */ } }
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
// Everything below runs INSIDE the page. It is one evaluate() rather than a few
// thousand, because a round trip per simulated frame turns a two-second battery
// into a four-minute one.
// ---------------------------------------------------------------------------
function inPage(only) {
  const D = window.__dbg;
  const K = D.mconst();
  const out = { constants: K, groups: {} };
  const want = (g) => !only || only.indexOf(g) >= 0;

  // A flat, straight, obstacle-free stretch to measure on. Sunny Sprint has no
  // climb or drop anywhere in its script, so the gradient term contributes
  // nothing and what is left is the movement model on its own.
  const FLAT = 'sunny';
  // Far enough in that the start grid is behind us, and sampled at several
  // places so a run that lands inside an obstacle can be thrown away rather
  // than quietly reported as the movement being strange.
  const SPOTS = [1500, 2600, 3700, 4800, 5900];

  function boot(map) {
    D.start(1, map);
    D.tick(700);            // loader + flyover + countdown
  }
  // True if the sample window was clean: nothing knocked us over, dropped us
  // down a hole or put us in the air when we meant to be on the ground.
  //
  // `fell` is the one that matters and the one that was missing. A racer who
  // drops into a gap is put back on their feet by respawnAfterFall, so by the
  // time the window ends `falling` is false again and the state reads perfectly
  // healthy -- at a standstill, hundreds of units from where it was measuring.
  // That reported a top speed of ZERO as a clean sample. Anything that measures
  // a run has to check that the run happened, not just that it ended tidily.
  function clean(s, allowAir, s0) {
    if (s0 && s.fallCount > s0.fallCount) return false;
    return !s.falling && !s.lavaOut && s.tumbleT <= 0 && s.stumbleT <= 0
        && (allowAir || s.h <= 0.001);
  }
  // Run one scenario at each candidate spot and keep the first clean result.
  function atClearSpot(fn, allowAir) {
    let last = null;
    for (const y of SPOTS) {
      const r = fn(y);
      last = r;
      if (r && r.ok) return r;
    }
    return last;
  }

  // ---- ground ------------------------------------------------------------
  if (want('ground')) {
    boot(FLAT);
    const g = atClearSpot((y) => {
      const s0 = D.mlab(y, 260);
      D.hold('w', true);
      // Settle to terminal speed. 120 frames, not 240: top speed arrives in
      // about fourteen, and a longer window just runs the subject into whatever
      // the course has 1100 units further on.
      const trace = [];
      for (let i = 0; i < 120; i++) { D.tick(1); trace.push(D.rstate()); }
      const end = trace[trace.length - 1];
      if (!clean(end, false, s0)) return { ok: false, why: 'run was interrupted at y=' + y };
      const vmax = end.spd;
      if (vmax < 1) return { ok: false, why: 'never got moving at y=' + y };
      // time and distance to 95% of it, from a standing start
      let t95 = -1, d95 = 0;
      const y0 = trace[0].y, x0 = trace[0].x;
      for (let i = 0; i < trace.length; i++) {
        if (trace[i].spd >= vmax * 0.95) {
          t95 = (i + 1) / 60;
          d95 = Math.hypot(trace[i].x - x0, trace[i].y - y0);
          break;
        }
      }
      // ...and how quickly the first fifth arrives, which is what a standing
      // start actually feels like
      let t20 = -1;
      for (let i = 0; i < trace.length; i++) { if (trace[i].spd >= vmax * 0.20) { t20 = (i + 1) / 60; break; } }

      // ---- braking: let go and see how long it takes to stop --------------
      D.hold('w', false);
      const bx = D.rstate().x, by = D.rstate().y;
      let tStop = -1, dStop = 0;
      for (let i = 0; i < 240; i++) {
        D.tick(1);
        const s = D.rstate();
        if (s.spd <= vmax * 0.05) { tStop = (i + 1) / 60; dStop = Math.hypot(s.x - bx, s.y - by); break; }
      }
      return {
        ok: true, spot: y,
        vmaxPerFrame: +vmax.toFixed(3),
        vmaxPerSec: +(vmax * 60).toFixed(1),
        timeTo20pct: t20, timeTo95pct: t95,
        distTo95pct: +d95.toFixed(1),
        brakeTime: tStop, brakeDist: +dStop.toFixed(1),
      };
    });
    out.groups.ground = g;
  }

  // ---- turning -----------------------------------------------------------
  // The question a 180 answers is whether velocity flips instantly (a tank) or
  // carries its momentum through the reversal (a bean). We measure both the
  // time to come back up to speed the other way and the ground given up doing
  // it -- an instant flip covers no ground at all.
  if (want('turn')) {
    boot(FLAT);
    const turn = atClearSpot((y) => {
      D.mlab(y, 260);
      D.hold('w', true);
      D.tick(200);
      const s0 = D.rstate();
      if (!clean(s0)) return { ok: false, why: 'interrupted at y=' + y };
      const v0 = s0.spd;

      // --- 90 degrees: release forward, hold right ---
      D.hold('w', false); D.hold('d', true);
      let t90 = -1, minSpd90 = v0;
      for (let i = 0; i < 180; i++) {
        D.tick(1);
        const s = D.rstate();
        minSpd90 = Math.min(minSpd90, s.spd);
        const head = Math.atan2(s.vy, s.vx);
        // sim +x is across the track; "right" in input space after the ix
        // negation lands on -x, so accept either sign and measure the angle
        // between the velocity and the across-track axis.
        const off = Math.abs(Math.abs(Math.cos(head)) - 1);
        if (off < 0.02 && s.spd > v0 * 0.5) { t90 = (i + 1) / 60; break; }
      }
      D.hold('d', false);

      // --- 180 degrees, from full speed forward ---
      D.mlab(y, 260);
      D.hold('w', true); D.tick(200);
      const pre = D.rstate();
      const vy0 = pre.vy;
      D.hold('w', false); D.hold('s', true);
      let tFlip = -1, tBack = -1, travelled = 0;
      const ry = pre.y;
      for (let i = 0; i < 240; i++) {
        D.tick(1);
        const s = D.rstate();
        travelled = Math.max(travelled, s.y - ry);   // how far we coasted onward
        if (tFlip < 0 && s.vy <= 0) tFlip = (i + 1) / 60;
        if (s.vy <= -Math.abs(vy0) * 0.9) { tBack = (i + 1) / 60; break; }
      }
      D.hold('s', false);
      return {
        ok: true, spot: y,
        entrySpeed: +v0.toFixed(3),
        turn90Time: t90, turn90SpeedKept: +(minSpd90 / v0).toFixed(3),
        turn180TimeToZero: tFlip, turn180TimeTo90pct: tBack,
        turn180CoastOn: +travelled.toFixed(1),
      };
    });
    out.groups.turn = turn;
  }

  // ---- analog ------------------------------------------------------------
  // A stick held halfway should be a walk, not a run and not nothing. The
  // interesting failure is a dead model where every magnitude saturates to the
  // same top speed, which is what happens if the input is normalised too early.
  if (want('analog')) {
    boot(FLAT);
    const rows = [];
    for (const m of [0.25, 0.5, 0.75, 1.0]) {
      const r = atClearSpot((y) => {
        D.mlab(y, 260);
        D.stick(0, m);                     // screen +y is forward
        for (let i = 0; i < 240; i++) D.tick(1);
        const s = D.rstate();
        D.stick(0, 0);
        if (!clean(s)) return { ok: false };
        return { ok: true, mag: m, speed: +s.spd.toFixed(3) };
      });
      rows.push(r && r.ok ? r : { mag: m, speed: null });
    }
    const full = rows[rows.length - 1].speed;
    out.groups.analog = {
      rows,
      // 1.0 means the speed is exactly proportional to the stick; much less
      // means partial input is being squashed toward full.
      proportionality: rows.map((r) => (r.speed && full ? +(r.speed / full / r.mag).toFixed(3) : null)),
    };
  }

  // ---- jump --------------------------------------------------------------
  if (want('jump')) {
    boot(FLAT);
    const j = atClearSpot((y) => {
      // standing jump
      D.mlab(y, 260);
      D.press('jump');
      let peak = 0, air = 0;
      const sx = D.rstate().x, sy = D.rstate().y;
      for (let i = 0; i < 300; i++) {
        D.tick(1);
        const s = D.rstate();
        peak = Math.max(peak, s.h);
        if (s.h <= 0) { air = (i + 1) / 60; break; }
      }
      const standEnd = D.rstate();
      const standDist = Math.hypot(standEnd.x - sx, standEnd.y - sy);

      // running jump
      D.mlab(y, 260);
      D.hold('w', true);
      D.tick(200);
      const rs = D.rstate();
      if (!clean(rs)) return { ok: false, why: 'interrupted at y=' + y };
      D.press('jump');
      const rx = rs.x, ry = rs.y;
      let runAir = 0, runPeak = 0;
      for (let i = 0; i < 300; i++) {
        D.tick(1);
        const s = D.rstate();
        runPeak = Math.max(runPeak, s.h);
        if (s.h <= 0) { runAir = (i + 1) / 60; break; }
      }
      const re = D.rstate();
      D.hold('w', false);
      const runDist = Math.hypot(re.x - rx, re.y - ry);

      // --- no double jump: press again at the top of the arc ---
      D.mlab(y, 260);
      D.press('jump');
      D.tick(12);
      const midH = D.rstate().h;
      const midVh = D.rstate().vh;
      const second = D.press('jump');
      const afterVh = D.rstate().vh;
      // --- coyote: step off nothing, then jump a few frames later ---
      D.mlab(y, 260);
      return {
        ok: true, spot: y,
        standingPeakH: +peak.toFixed(1), standingAirtime: air, standingDist: +standDist.toFixed(1),
        runningPeakH: +runPeak.toFixed(1), runningAirtime: runAir, runningDist: +runDist.toFixed(1),
        doubleJumpAccepted: !!second,
        doubleJumpChangedRise: Math.abs(afterVh - midVh) > 1e-9,
        midairHeightWhenTried: +midH.toFixed(1),
      };
    });
    out.groups.jump = j;
  }

  // ---- air control -------------------------------------------------------
  // How much of your drive answers while your feet are off the ground, measured
  // rather than read off the constant: the constant is only half the story
  // because air friction and ground friction need not match.
  if (want('air')) {
    boot(FLAT);
    const a = atClearSpot((y) => {
      // Ground: from rest, how much sideways speed in N frames. N is 18, not
      // 30, because a jump only lasts thirty frames in total -- measuring the
      // air half over a longer window than the racer is airborne for was
      // measuring the landing, and threw the whole group away as unclean.
      const N = 18;
      const s0 = D.mlab(y, 260);
      D.hold('d', true);
      for (let i = 0; i < N; i++) D.tick(1);
      const gs = D.rstate();
      D.hold('d', false);
      if (!clean(gs, false, s0)) return { ok: false, why: 'ground leg interrupted' };

      // air: jump straight up, then the same N frames of sideways input
      D.mlab(y, 260);
      D.press('jump');
      D.tick(3);
      const before = D.rstate();
      D.hold('d', true);
      for (let i = 0; i < N; i++) D.tick(1);
      const as = D.rstate();
      D.hold('d', false);
      if (as.h <= 0) return { ok: false, why: 'landed mid-measurement' };

      // and the reversal question: at full speed forward, how much of it can be
      // undone in the air before landing?
      D.mlab(y, 260);
      D.hold('w', true); D.tick(200);
      const runv = D.rstate().vy;
      D.press('jump');
      D.hold('w', false); D.hold('s', true);
      let land = null;
      for (let i = 0; i < 300; i++) { D.tick(1); const s = D.rstate(); if (s.h <= 0) { land = s; break; } }
      D.hold('s', false);
      return {
        ok: true, spot: y,
        groundSideSpeed30f: +gs.spd.toFixed(3),
        airSideSpeed30f: +Math.hypot(as.vx - before.vx, as.vy - before.vy).toFixed(3),
        authorityRatio: +(Math.hypot(as.vx - before.vx, as.vy - before.vy) / (gs.spd || 1)).toFixed(3),
        runSpeedIntoJump: +runv.toFixed(3),
        speedAtLandingAfterFullReverse: land ? +land.vy.toFixed(3) : null,
        // < 0 here would mean a jump can be completely turned round in mid-air
        reversedInAir: land ? land.vy < 0 : null,
      };
    });
    out.groups.air = a;
  }

  // ---- dive --------------------------------------------------------------
  if (want('dive')) {
    boot(FLAT);
    const d = atClearSpot((y) => {
      // ground dive from a standing start
      D.mlab(y, 260);
      const g0 = D.rstate();
      D.press('dive');
      let gDist = 0, gCycle = -1;
      for (let i = 0; i < 300; i++) {
        D.tick(1);
        const s = D.rstate();
        gDist = Math.max(gDist, Math.hypot(s.x - g0.x, s.y - g0.y));
        if (s.diveT <= 0 && s.getUpT <= 0 && s.h <= 0) { gCycle = (i + 1) / 60; break; }
      }

      // running dive
      D.mlab(y, 260);
      D.hold('w', true); D.tick(200);
      const r0 = D.rstate();
      if (!clean(r0)) return { ok: false };
      D.press('dive');
      let rDist = 0, rCycle = -1;
      for (let i = 0; i < 300; i++) {
        D.tick(1);
        const s = D.rstate();
        rDist = Math.max(rDist, Math.hypot(s.x - r0.x, s.y - r0.y));
        if (s.diveT <= 0 && s.getUpT <= 0 && s.h <= 0) { rCycle = (i + 1) / 60; break; }
      }
      D.hold('w', false);
      // what simply running for the same length of time covers, which is the
      // line a dive must not beat
      D.mlab(y, 260);
      D.hold('w', true); D.tick(200);
      const c0 = D.rstate();
      for (let i = 0; i < Math.round((rCycle > 0 ? rCycle : 1) * 60); i++) D.tick(1);
      const c1 = D.rstate();
      D.hold('w', false);
      const runSame = Math.hypot(c1.x - c0.x, c1.y - c0.y);

      // jump then dive -- the signature move
      D.mlab(y, 260);
      D.hold('w', true); D.tick(200);
      const j0 = D.rstate();
      D.press('jump');
      D.tick(10);
      D.press('dive');
      let jDist = 0, jPeak = 0;
      for (let i = 0; i < 300; i++) {
        D.tick(1);
        const s = D.rstate();
        jPeak = Math.max(jPeak, s.h);
        jDist = Math.max(jDist, Math.hypot(s.x - j0.x, s.y - j0.y));
        if (s.h <= 0 && s.diveT <= 0 && s.getUpT <= 0) break;
      }
      D.hold('w', false);

      // --- spam: how many dives actually start in three seconds? ---
      D.mlab(y, 260);
      let accepted = 0;
      for (let i = 0; i < 180; i++) { if (D.press('dive')) accepted++; D.tick(1); }

      // --- mid-air dive chaining: a second dive while still in the first ---
      D.mlab(y, 260);
      D.press('jump'); D.tick(8);
      const first = D.press('dive');
      D.tick(6);
      const chained = D.press('dive');
      return {
        ok: true, spot: y,
        groundDiveDist: +gDist.toFixed(1), groundDiveCycle: gCycle,
        runningDiveDist: +rDist.toFixed(1), runningDiveCycle: rCycle,
        runningSameTimeDist: +runSame.toFixed(1),
        diveBeatsRunning: rDist > runSame,
        airDiveDist: +jDist.toFixed(1), airDivePeakH: +jPeak.toFixed(1),
        divesAcceptedIn3s: accepted,
        firstAirDiveAccepted: !!first, chainedAirDiveAccepted: !!chained,
      };
    });
    out.groups.dive = d;
  }

  // ---- slopes ------------------------------------------------------------
  // Boom Peak climbs the whole way and Splash Slide descends it, so the two
  // together say what a gradient is worth in each direction.
  if (want('slope')) {
    const slope = {};
    for (const [key, map] of [['uphill', 'cannonc'], ['downhill', 'slide']]) {
      boot(map);
      const len = D.len();
      const r = (() => {
        for (const frac of [0.3, 0.45, 0.6]) {
          D.mlab(Math.round(len * frac), 260);
          D.hold('w', true);
          for (let i = 0; i < 240; i++) D.tick(1);
          const s = D.rstate();
          D.hold('w', false);
          if (clean(s)) return { ok: true, at: Math.round(len * frac), speed: +s.spd.toFixed(3) };
        }
        return { ok: false };
      })();
      slope[key] = r;
    }
    out.groups.slope = slope;
  }

  // ---- ice ---------------------------------------------------------------
  // Splash Slide is the slippery map. Sliding is not a higher top speed, it is
  // your boots not biting sideways, so the number that matters is how long a
  // coast lasts and how badly a turn is refused.
  if (want('ice')) {
    boot('slide');
    const len = D.len();
    const ice = (() => {
      for (const frac of [0.3, 0.45, 0.6]) {
        const y = Math.round(len * frac);
        D.mlab(y, 260);
        D.hold('w', true);
        for (let i = 0; i < 300; i++) D.tick(1);
        const s0 = D.rstate();
        if (!clean(s0)) continue;
        // coast
        D.hold('w', false);
        let coastT = -1;
        const c0 = D.rstate();
        let coastD = 0;
        for (let i = 0; i < 600; i++) {
          D.tick(1);
          const s = D.rstate();
          coastD = Math.hypot(s.x - c0.x, s.y - c0.y);
          if (s.spd <= s0.spd * 0.05) { coastT = (i + 1) / 60; break; }
        }
        // sideways authority on ice, from full speed
        D.mlab(y, 260);
        D.hold('w', true); D.tick(300);
        const b = D.rstate();
        D.hold('d', true);
        let maxLateral = 0;
        for (let i = 0; i < 120; i++) {
          D.tick(1);
          const s = D.rstate();
          maxLateral = Math.max(maxLateral, Math.abs(s.x - b.x));
        }
        D.hold('w', false); D.hold('d', false);
        return {
          ok: true, at: y,
          topSpeed: +s0.spd.toFixed(3),
          coastTime: coastT, coastDist: +coastD.toFixed(1),
          lateralIn2s: +maxLateral.toFixed(1),
        };
      }
      return { ok: false };
    })();
    out.groups.ice = ice;
  }

  // ---- moving platforms ---------------------------------------------------
  // Does standing still on something that is moving take you with it? Pits are
  // the only moving floor on a shipping race map.
  if (want('platform')) {
    boot(FLAT);
    const pits = D.obsAt('pit');
    let plat = { ok: false, why: 'no pit obstacle on ' + FLAT };
    if (pits.length) {
      const pit = pits[0];
      const mid = Math.round((pit.y0 + pit.y1) / 2);
      // Put the racer down where the pit's own platform is at this instant,
      // then do NOTHING for a second. If the deck carries its rider, they stay
      // on it; if it does not, it slides out from under them and they fall.
      const found = D.platAt ? D.platAt(mid) : null;
      // Stand on the widest deck, where it actually is, not in the middle of
      // the track and hope.
      const deck = found && found.platforms.length
        ? found.platforms.reduce((a, b) => (Math.abs(b.vx) > Math.abs(a.vx) ? b : a))
        : null;
      D.mlab(mid, deck ? deck.x : 260);
      const start = D.rstate();
      let fellDoingNothing = false, drift = 0;
      for (let i = 0; i < 60; i++) {
        D.tick(1);
        const s = D.rstate();
        if (s.falling || s.fallCount > start.fallCount) { fellDoingNothing = true; break; }
        drift = Math.abs(s.x - start.x);
      }
      const held = D.rstate();
      // ...and what a jump off it keeps. platVX is the deck's own speed; a jump
      // that drops it lands the racer where they took off in world space.
      const f2 = D.platAt ? D.platAt(mid) : null;
      const d2 = f2 && f2.platforms.length
        ? f2.platforms.reduce((a, b) => (Math.abs(b.vx) > Math.abs(a.vx) ? b : a)) : null;
      D.mlab(mid, d2 ? d2.x : 260);
      D.tick(6);
      const pre = D.rstate();
      D.press('jump');
      const post = D.rstate();
      plat = {
        ok: true, pit: mid,
        carriedSidewaysIn1s: +drift.toFixed(1),
        fellWhileStandingStill: fellDoingNothing,
        platformSpeedUnderFoot: +pre.platVX.toFixed(3),
        jumpKeptPlatformSpeed: Math.abs(post.vx - pre.vx) > 1e-9,
        stillUpAfter1s: !held.falling,
        probe: found,
      };
    }
    out.groups.platform = plat;
  }

  // ---- respawn ------------------------------------------------------------
  if (want('respawn')) {
    boot(FLAT);
    const r = (() => {
      D.mlab(3000, 260);
      const before = D.rstate();
      // walk off into a gap and let the fall resolve
      D.hold('w', true);
      let fell = -1;
      for (let i = 0; i < 3000; i++) {
        D.tick(1);
        const s = D.rstate();
        if (s.falling) { fell = i; break; }
      }
      D.hold('w', false);
      if (fell < 0) return { ok: false, why: 'never fell in 50 simulated seconds' };
      let backT = -1, frozen = 0;
      for (let i = 0; i < 600; i++) {
        D.tick(1);
        const s = D.rstate();
        if (s.respawnFreeze > 0) frozen++;
        if (!s.falling && s.respawnFreeze <= 0) { backT = (i + 1) / 60; break; }
      }
      const after = D.rstate();
      return {
        ok: true,
        fellAfter: +(fell / 60).toFixed(2),
        backInControlAfter: backT,
        frozenFrames: frozen,
        cameBackAt: Math.round(after.y),
        movedBackBy: Math.round(before.y - after.y),
        stillFalling: after.falling,
      };
    })();
    out.groups.respawn = r;
  }

  return out;
}

function fmt(v) {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

function report(data) {
  const K = data.constants;
  console.log('\nMOVEMENT METRICS');
  console.log('='.repeat(64));
  console.log('constants: V_MAX ' + K.V_MAX + '  ACCEL ' + K.ACCEL.toFixed(3)
    + '  GROUND_FR ' + K.GROUND_FR + '  AIR_FR ' + K.AIR_FR
    + '  AIR_CONTROL ' + K.AIR_CONTROL);
  console.log('           JUMP_V ' + K.JUMP_V + '  GRAV ' + K.GRAV_UP + '/' + K.GRAV_DOWN
    + '  apex x' + K.APEX_GRAV + '  turn ' + K.TURN_RATE_GROUND + '/' + K.TURN_RATE_AIR + ' rad/s');
  console.log('           dive ' + K.DIVE_IMPULSE + ' impulse, ' + K.DIVE_PRONE_MS + 'ms prone, '
    + K.DIVE_CD_MS + 'ms cooldown, air x' + K.AIR_DIVE_BOOST);
  for (const [name, g] of Object.entries(data.groups)) {
    console.log('\n-- ' + name + ' ' + '-'.repeat(60 - name.length));
    if (!g) { console.log('   (not measured)'); continue; }
    if (g.ok === false) { console.log('   FAILED TO MEASURE: ' + (g.why || 'no clean sample')); continue; }
    for (const [k, v] of Object.entries(g)) {
      if (k === 'ok') continue;
      if (Array.isArray(v)) { console.log('   ' + k.padEnd(30) + v.map(fmt).join(', ')); continue; }
      if (v && typeof v === 'object') {
        for (const [k2, v2] of Object.entries(v)) {
          if (v2 && typeof v2 === 'object') {
            console.log('   ' + (k + '.' + k2).padEnd(30)
              + Object.entries(v2).filter(([a]) => a !== 'ok').map(([a, b]) => a + '=' + fmt(b)).join(' '));
          } else console.log('   ' + (k + '.' + k2).padEnd(30) + fmt(v2));
        }
        continue;
      }
      console.log('   ' + k.padEnd(30) + fmt(v));
    }
  }
  console.log('');
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
  await page.waitForFunction('typeof window.__dbg === "object"', { timeout: BOOT_TIMEOUT, polling: 250 });
  // Rendering off: nothing here looks at a picture, and SwiftShader on a
  // GPU-less box turns a two-minute battery into an hour. The matrix update
  // that render() carries is kept by __dbg.tick itself.
  await page.evaluate('window.__noRender = true');
  const data = await page.evaluate(inPage, ONLY ? [...ONLY] : null);
  if (AS_JSON) console.log(JSON.stringify(data, null, 2));
  else report(data);
  if (errs.length) {
    console.error('\npage errors during measurement:\n  ' + errs.slice(0, 10).join('\n  '));
  }
  await shutdown();
}

main().catch(async (e) => {
  console.error(e);
  await shutdown();
  process.exit(1);
});
