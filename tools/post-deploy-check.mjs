#!/usr/bin/env node
// After a deploy: is the right build live, does the gated game still load for a
// signed-in player, and does the coordinator still answer?
//
// THE SOCKET CHECK IS THE POINT. Everything else here could be inferred from a
// diff. "The multiplayer coordinator still works" cannot: it is settled by
// opening a real socket to the real server and watching a real sr:* exchange.
// This is what caught nothing and proved everything when the socket.io client
// was swapped for its minified build -- the file changed, the protocol did not,
// and only a live round trip can say so.
import puppeteer from 'puppeteer';
import {
  arg, wantsHelp, showHelp, origin, GAME_PATH,
  requireProfile, profileDirName, seedSession, discardSession,
  whoami, assertSession, shortId, redact,
} from './perf-session.mjs';

const HELP = `
post-deploy-check.mjs -- verify a deployed build end to end

  node tools/post-deploy-check.mjs --profile "<chromium user-data dir>" [options]

  --profile <dir>      REQUIRED. A user-data directory already signed in.
  --profile-dir <name> Profile inside it (default: Default)
  --origin <url>       default https://nikcade.win
  --sha <full sha>     assert /health reports exactly this deployed commit
  --asset <path>       assert the page loads this script
                       (default /socket.io/socket.io.min.js)
  --expect <prefix>    fail unless the session's player id starts with this
  --no-socket          skip the live coordinator round trip
  --help

What it changes: nothing persistent. The coordinator probe joins a throwaway
match id of its own and leaves it again; it never touches a real room, a real
round, a grant or any account state.

Exit codes: 0 everything verified; 2 a check failed.
`;

if (wantsHelp()) showHelp(HELP);

const BASE = origin();
const WANT_SHA = arg('sha', process.env.SR_SHA || null);
const WANT_ASSET = arg('asset', '/socket.io/socket.io.min.js');
const fails = [];
const ok = (label, good, detail) => {
  console.log(`  ${good ? 'ok  ' : 'FAIL'}  ${label.padEnd(34)} ${detail}`);
  if (!good) fails.push(label);
};

async function main() {
  const root = requireProfile();

  const h = await (await fetch(`${BASE}/health`)).json();
  ok('/health responding', h.ok === true, `ok=${h.ok}`);
  if (WANT_SHA) ok('/health reports expected SHA', h.version === WANT_SHA, `${h.version}`);
  else console.log(`  --    /health version                 ${h.version}`);

  const anon = await fetch(BASE + GAME_PATH, { redirect: 'manual' });
  ok('anonymous game route blocked', anon.status === 403, `HTTP ${anon.status}`);

  const asset = await fetch(BASE + WANT_ASSET);
  const assetBytes = Buffer.byteLength(await asset.text());
  ok('expected socket.io asset served', asset.status === 200,
    `${WANT_ASSET} ${asset.status} ${assetBytes} bytes etag ${asset.headers.get('etag')}`);

  const seeded = seedSession(root, profileDirName(), 'postdeploy');
  const b = await puppeteer.launch({
    headless: true, userDataDir: seeded,
    args: ['--no-sandbox', '--disable-extensions', '--enable-unsafe-swiftshader', '--mute-audio'],
  });
  try {
    const page = await b.newPage();
    const who = await whoami(page, BASE);
    assertSession(who, 'the supplied profile');
    console.log(`\n  authenticated as ${shortId(who)}\n`);

    // Watch the engine.io frames. engine.io assigns ws.onmessage rather than
    // using addEventListener, so the property setter is where inbound frames
    // are; hooking only addEventListener sees the polling phase and then goes
    // quiet, which reads as a coordinator that stopped talking.
    await page.evaluateOnNewDocument(`(()=>{window.__f=[];
      const w=WebSocket.prototype.send;WebSocket.prototype.send=function(v){try{if(typeof v==='string'&&/sr:/.test(v))window.__f.push('OUT '+v.slice(0,90))}catch(e){}return w.apply(this,arguments)};
      const D=Object.getOwnPropertyDescriptor(WebSocket.prototype,'onmessage');
      if(D&&D.set)Object.defineProperty(WebSocket.prototype,'onmessage',{configurable:true,get(){return D.get&&D.get.call(this)},
        set(f){D.set.call(this,typeof f==='function'?function(e){try{if(typeof e.data==='string'&&/sr:/.test(e.data))window.__f.push('IN  '+e.data.slice(0,90))}catch(q){}return f.apply(this,arguments)}:f)}});
    })()`);
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

    const t0 = Date.now();
    const resp = await page.goto(BASE + GAME_PATH, { waitUntil: 'domcontentloaded', timeout: 120000 });
    ok('authenticated game document', resp.status() === 200, `HTTP ${resp.status()} in ${Date.now() - t0}ms`);

    // The game starts on the lobby. The loader has to be GONE as well: goHome()
    // puts the lobby together behind it before the startup sequence runs, so
    // "#home is visible" alone can be true while the loader still covers it.
    let booted = true;
    try {
      await page.waitForFunction(`(()=>{const e=document.querySelector('#home');return !document.getElementById('bootScreen')&&!!e&&!e.classList.contains('hidden')})()`,
        { timeout: 120000, polling: 500 });
    } catch { booted = false; }
    ok('boots through to the lobby', booted, booted ? 'yes' : 'never reached #home with the loader gone');

    const page_ = await page.evaluate(() => ({
      io: typeof window.io,
      src: [...document.scripts].map((s) => s.src).find((s) => /socket\.io/.test(s)) || null,
    }));
    ok('page loads the expected asset', !!page_.src && page_.src.endsWith(WANT_ASSET), `${page_.src}`);
    ok('window.io is available', page_.io === 'function', page_.io);

    if (!process.argv.includes('--no-socket') && page_.io === 'function') {
      // A THROWAWAY MATCH OF ITS OWN, AND IT LEAVES IT. The id is random and
      // belongs to nothing; joining a real room's id would put this probe into
      // somebody's readiness set and could open their countdown a player short.
      const probe = await page.evaluate(() => new Promise((res) => {
        const s = window.io({ withCredentials: true });
        const out = { connected: false, timeMs: null, serverNow: null, joined: null, left: false, err: null };
        const done = () => { try { s.close(); } catch (e) {} res(out); };
        s.on('connect_error', (e) => { out.err = String((e && e.message) || e); done(); });
        s.on('connect', () => {
          out.connected = true;
          const t = Date.now();
          s.emit('sr:time', {}, (r) => {
            out.timeMs = Date.now() - t;
            out.serverNow = r && typeof r.serverNow === 'number' ? 'number' : String(r);
            // The server normalises to upper case and accepts /^[A-Z0-9-]{1,24}$/,
            // so this stays comfortably inside 24 characters. A longer one is
            // refused as "Bad match code." -- which the first version of this
            // probe was, at exactly 25.
            const code = 'PROBE-' + Math.random().toString(36).slice(2, 10).toUpperCase();
            s.emit('sr:join', { code, expect: 1 }, (j) => {
              out.joined = j && j.matchId ? 'matchId returned' : JSON.stringify(j);
              try { s.emit('sr:leave'); out.left = true; } catch (e) { /* closing anyway */ }
              setTimeout(done, 250);         // let sr:leave reach the server
            });
          });
        });
        setTimeout(done, 20000);
      }));
      ok('socket.io connects', probe.connected, probe.connected ? 'yes' : `no (${probe.err})`);
      ok('sr:time round trip', probe.serverNow === 'number', `${probe.timeMs}ms, serverNow is a ${probe.serverNow}`);
      ok('sr:join / gathering state', probe.joined === 'matchId returned', String(probe.joined));
      ok('probe match left behind it', probe.left === true, probe.left ? 'sr:leave sent' : 'NOT CLEANED UP');
      const frames = (await page.evaluate(() => window.__f || [])).map(redact);
      console.log(`\n  sr:* frames observed: ${frames.length}`);
      for (const f of frames.slice(0, 4)) console.log(`    ${f}`);
    }

    const game = errs.filter((e) => !/404|favicon/i.test(e));
    ok('no game console errors', game.length === 0, game.length ? game.slice(0, 2).join(' | ') : 'clean');
  } finally { await b.close(); discardSession(seeded); }

  console.log(`\n${fails.length ? 'FAIL: ' + fails.join('; ') : 'PASS: every check verified'}`);
  process.exit(fails.length ? 2 : 0);
}

main().catch((e) => { console.error(e.message || e); process.exit(2); });
