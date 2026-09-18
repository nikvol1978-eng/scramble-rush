#!/usr/bin/env node
// Photograph the chase camera, for the review package.
//
//   node tools/camera-shots.mjs                     # shoot this tree
//   SR_ROOT=/path/to/old/tree SR_LABEL=old \
//     SR_SHOTS=behind node tools/camera-shots.mjs    # shoot a DIFFERENT tree
//
// Why SR_ROOT exists: the "before" picture in the contact sheet has to come
// from the old camera actually running, not from the new one with its constants
// bent back into roughly the old shape. The old framing aimed AT the thing it
// orbited; the new one aims above it. No amount of constant-twiddling turns one
// into the other, so the honest comparison is to build f335dbd in a worktree and
// point this at it.
//
// Rendering is ON here, which is the opposite of what the check suite wants --
// these are pictures, and a picture of a scene that was never rasterised is a
// black rectangle. Quality is pinned to 'high' so the shots show the shipping
// look rather than the CI fallback.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const HERE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ROOT = resolve(process.env.SR_ROOT || HERE);
const OUT = resolve(process.env.SR_OUT || join(HERE, 'docs', 'camera-review'));
const LABEL = process.env.SR_LABEL || 'new';
const MAP = process.env.SR_MAP || 'sunny';
const ONLY = (process.env.SR_SHOTS || '').split(',').map((s) => s.trim()).filter(Boolean);
const W = 1280, H = 720;

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

async function main() {
  await mkdir(OUT, { recursive: true });
  const port = await serve();
  console.log(`serving ${ROOT}  (label: ${LABEL})`);

  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
           '--mute-audio', `--window-size=${W},${H}`],
    defaultViewport: { width: W, height: H },
    protocolTimeout: 600000,
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e && e.message || e)));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__dbg && window.__checks', { timeout: 180000 });

  // Rendering on, at the shipping quality.
  await page.evaluate(() => { window.__noRender = false; window.__dbg.quality('high'); });

  const shoot = async (name) => {
    if (ONLY.length && !ONLY.includes(name)) return null;
    const file = join(OUT, `camera-${name}${LABEL === 'new' ? '' : `-${LABEL}`}.png`);
    // Drive the HUD before the shutter: tick() does not, so without this the
    // overlay in the picture is whatever the DOM last had -- typically the GO!
    // banner, parked over the racer the shot is meant to show.
    await page.evaluate(() => {
      if (window.__dbg.hud) window.__dbg.hud();
      // The GO! banner's countdown is driven by the game's own loop, not by
      // tick(), so under a stepped harness it never expires and parks itself
      // over the racer in every shot. Clearing the text is a HARNESS fix for a
      // harness artefact -- the banner behaves correctly in a real round.
      const b = document.getElementById('bannerMsg'); if (b) b.textContent = '';
      window.__dbg.renderFull();
    });
    await page.screenshot({ path: file });
    console.log(`  ${file}`);
    return file;
  };

  // A fixed map and fixed warps, so two runs of this are comparable and so the
  // "before" and "after" are photographed from the same spot on the same course.
  // startRound opens on the 3.8s map-intro flyover, and syncCamera hands the
  // whole frame to flyCamera while that runs -- shoot too early and every
  // picture is of the establishing shot rather than of the chase camera. So tick
  // until the game says it is actually racing, rather than guessing a number of
  // frames and hoping.
  const toRacing = async () => {
    const st = await page.evaluate(() => {
      for (let i = 0; i < 900; i++) {
        if (window.__dbg.preview().state === 'racing') break;
        window.__dbg.tick(1, 1 / 60);
      }
      // ...and then past the GO! banner, which otherwise sits over the racer in
      // every shot and is the first thing a reviewer would ask about.
      window.__dbg.tick(420, 1 / 60);
      return window.__dbg.preview().state;
    });
    if (st !== 'racing') throw new Error(`never reached racing (stuck in ${st})`);
  };
  await page.evaluate((map) => { window.__dbg.start(1, map); }, MAP);
  await toRacing();

  // ---- the resting frame, and the orbit ---------------------------------
  // The resting pitch, read from the page rather than written down here. The
  // old tree stores pitch as an OFFSET from a fixed tilt (rest = 0); the new one
  // stores the absolute elevation (rest = CAM.PITCH). Asking is the only way one
  // tool shoots both without knowing which it is talking to.
  const restPitch = await page.evaluate(
    () => (window.__dbg.lookState ? window.__dbg.lookState().pitch : 0),
  );
  const settle = async (yaw, pitch, ticks = 30) => {
    await page.evaluate((y, p, n) => {
      window.__dbg.look(y, p);
      for (let i = 0; i < n; i++) window.__dbg.tick(1, 1 / 60);
    }, yaw, pitch === null || pitch === undefined ? restPitch : pitch, ticks);
  };

  // ---- the pack, FIRST ---------------------------------------------------
  // This shot used to warp to a hard-coded y=900 and call the result "crowd".
  // It ran after the jump, dive and depth shots, by which point the bots had
  // run most of the course -- so the picture was an empty stretch with the
  // player last, and it proved nothing about framing in traffic.
  //
  // Two changes, both harness-only. It runs FIRST, while the field is still
  // packed; and the player is placed where the BOTS ACTUALLY ARE -- the median
  // of the live ones -- instead of at a number chosen in advance. Then it
  // counts how many are genuinely inside the camera's own crowd radius
  // (CAM.CROWD_NEAR, 230) and prints it, so the shot cannot claim a pack it
  // does not have.
  const crowd = await page.evaluate(() => {
    const live = window.__dbg.bots().filter((b) => !b.falling);
    if (!live.length) return { near: 0, live: 0 };
    // The MEDIAN put the player at the front edge of the field: the count was
    // honest but the picture read as "pack somewhere ahead of me", which is not
    // the case worth judging. Find the tightest CLUSTER instead -- the bot with
    // the most company inside half the crowd radius -- and stand the player in
    // the middle of it, which is what being in traffic actually looks like.
    let best = live[0], bestN = -1;
    for (const b of live) {
      const n = live.filter((o) => Math.abs(o.y - b.y) < 115 && Math.abs(o.x - b.x) < 115).length;
      if (n > bestN) { bestN = n; best = b; }
    }
    const pack = live.filter((o) => Math.abs(o.y - best.y) < 115 && Math.abs(o.x - best.x) < 115);
    const mid = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    window.__dbg.warp(mid(pack.map((b) => b.y)), mid(pack.map((b) => b.x)));
    // Then RUN WITH THEM. Standing still while twenty-three bots jog past is not
    // what being in the pack looks like: within a few frames they are all ahead
    // and the player is alone at the back again. Holding forward keeps the
    // player inside the group while the camera settles, which is the situation
    // this shot is supposed to be evidence about.
    window.__dbg.hold('w', true);
    window.__dbg.tick(18, 1 / 60);
    window.__dbg.hold('w', false);
    const me = window.__dbg.me();
    const near = window.__dbg.bots().filter(
      (b) => !b.falling && Math.abs(b.y - me.y) < 230 && Math.abs(b.x - me.x) < 230,
    ).length;
    // Where the player actually lands on screen, and whether anything solid is
    // standing between them and the lens. "The bean is not in the picture" has
    // two very different causes and the shot alone cannot tell them apart.
    const g = window.__dbg.gfx();
    const w = window.__dbg.playerWorld ? window.__dbg.playerWorld() : null;
    let ndc = null, blocked = null;
    if (w) {
      const v = new g.THREE.Vector3(w.x, w.y, w.z);
      g.camera.updateMatrixWorld();
      v.project(g.camera);
      ndc = { x: +v.x.toFixed(2), y: +v.y.toFixed(2), onScreen: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
      blocked = window.__dbg.blockedToPlayer ? window.__dbg.blockedToPlayer() : null;
    }
    return { near, live: live.length, atY: me.y, ndc, blocked };
  });
  await settle(0, null, 6);
  await shoot('crowd-awareness');
  console.log(`  crowd: ${crowd.near} bots within 230 of the player (of ${crowd.live} live) at y=${crowd.atY}`);

  // Ahead of the field for the framing shots, so those pictures are of the
  // camera rather than of twenty-three bots.
  await page.evaluate(() => { window.__dbg.warp(2900, 200); window.__dbg.tick(45, 1 / 60); });
  await settle(0, null);
  await shoot('behind');
  await settle(1.25, null);
  await shoot('left-orbit');
  await settle(-1.25, null);
  await shoot('right-orbit');
  await settle(Math.PI, null);
  await shoot('looking-back');

  // ---- jump / dive -------------------------------------------------------
  await settle(0, null);
  await page.evaluate(() => {
    window.__dbg.hold('w', true);
    window.__dbg.tick(20, 1 / 60);
    window.__dbg.press('jump');
    window.__dbg.tick(11, 1 / 60);       // near the top of the arc
  });
  await shoot('jump');
  await page.evaluate(() => {
    window.__dbg.tick(40, 1 / 60);
    window.__dbg.press('dive');
    window.__dbg.tick(7, 1 / 60);
  });
  await shoot('dive');
  await page.evaluate(() => { window.__dbg.hold('w', false); window.__dbg.tick(60, 1 / 60); });

  // ---- depth, and the pack ----------------------------------------------
  // Further up the course, where the generator puts gaps and platforms.
  await page.evaluate(() => { window.__dbg.warp(5200, 260); window.__dbg.tick(40, 1 / 60); });
  await settle(0, null);
  await shoot('platform-depth');

  // ---- spectator ---------------------------------------------------------
  // Finish the local racer and let the camera hand itself over. This is the
  // QUALIFIED path, which is the one that used to leave you filming yourself.
  await page.evaluate(() => {
    window.__dbg.win();
    window.__dbg.tick(90, 1 / 60);
  });
  const spec = await page.evaluate(() => {
    const bar = document.getElementById('specBar');
    const name = document.getElementById('specName');
    const top = document.getElementById('specTop');
    return {
      barVisible: !!bar && !bar.classList.contains('hidden'),
      watching: name ? name.textContent : null,
      banner: top ? top.textContent : null,
    };
  });
  await shoot('spectator');
  console.log(`  spectator HUD: ${JSON.stringify(spec)}`);

  // ---- FOV sweep ---------------------------------------------------------
  // The same frame at several lenses, so the choice is made by looking rather
  // than by picking the biggest number that still sounds reasonable.
  if (process.env.SR_FOV_SWEEP === '1') {
    // A FRESH race: the spectator section above hands the camera to a bot and
    // puts its HUD over the frame, and a lens comparison shot through that is a
    // comparison of the wrong thing.
    await page.evaluate((map) => { window.__dbg.start(1, map); }, MAP);
    await toRacing();
    // CAM lives inside the game's closure, not on window, so the shipped value
    // is read off the camera itself rather than named here — otherwise this
    // tool becomes a second place the FOV is written down.
    const shippedFov = await page.evaluate(() => window.__dbg.gfx().camera.fov);
    console.log(`  shipped FOV is ${shippedFov}`);
    await page.evaluate(() => {
      window.__dbg.warp(2200, 260);
      window.__dbg.look(0, undefined);
      window.__dbg.tick(40, 1 / 60);
    });
    for (const fov of [64, 68, 72, 76, 80]) {
      await page.evaluate((f) => {
        const g = window.__dbg.gfx();
        g.camera.fov = f; g.camera.updateProjectionMatrix();
        window.__dbg.tick(2, 1 / 60);
      }, fov);
      await page.evaluate(() => window.__dbg.renderFull());
      const f = join(OUT, `camera-fov-${fov}.png`);
      await page.screenshot({ path: f });
      console.log(`  ${f}`);
    }
    // put the lens back so nothing after this is shot through the sweep's last value
    await page.evaluate((f) => {
      const g = window.__dbg.gfx();
      g.camera.fov = f; g.camera.updateProjectionMatrix();
    }, shippedFov);
  }

  // ---- pitch sweep -------------------------------------------------------
  // The resting tilt, judged by looking. CAM.PITCH is read off the page for the
  // same reason the FOV sweep reads its own: one place owns the number.
  if (process.env.SR_PITCH_SWEEP === '1') {
    await page.evaluate((map) => { window.__dbg.start(1, map); }, MAP);
    await toRacing();
    await page.evaluate(() => { window.__dbg.warp(2200, 260); window.__dbg.tick(40, 1 / 60); });
    for (const deg of [18, 24, 28, 32, 37]) {
      const rad = (deg * Math.PI) / 180;
      await page.evaluate((r) => {
        window.__dbg.look(0, r);
        for (let i = 0; i < 40; i++) window.__dbg.tick(1, 1 / 60);
      }, rad);
      await page.evaluate(() => window.__dbg.renderFull());
      const f = join(OUT, `camera-pitch-${deg}.png`);
      await page.screenshot({ path: f });
      console.log(`  ${f}`);
    }
    await settle(0, restPitch);
  }

  await writeFile(join(OUT, `shots-${LABEL}.json`),
    JSON.stringify({ label: LABEL, map: MAP, crowd, spectator: spec, pageErrors: errs }, null, 2));
  if (errs.length) console.log(`  ${errs.length} page error(s): ${errs.slice(0, 3).join(' | ')}`);
  console.log('done');
}

main().then(shutdown, async (e) => { await shutdown(); console.error(e); process.exit(1); });
