#!/usr/bin/env node
// Time-to-first-byte against production, sampled directly.
//
// WHY NOT LIGHTHOUSE FOR THIS. Desktop FCP, LCP, TBT and Speed Index are
// Lantern SIMULATIONS built on a trace, and they move with machine load: two
// runs of the same page minutes apart disagreed about TBT by a factor of ten
// while this was being written. TTFB is not modelled -- it is how long the
// server took to start answering -- so it can be sampled many times, cheaply,
// with no browser in the way, and it stays meaningful on a busy machine.
//
// Three endpoints, because "the document is slow" and "the server is slow" are
// different claims and only the comparison separates them.
import { request } from 'node:https';
import { request as httpRequest } from 'node:http';
import puppeteer from 'puppeteer';
import {
  arg, flag, wantsHelp, showHelp, origin, GAME_PATH,
  requireProfile, profileDirName, seedSession, discardSession,
  whoami, assertSession, shortId, stats,
} from './perf-session.mjs';

const HELP = `
prod-ttfb.mjs -- direct TTFB sampler for production endpoints

  node tools/prod-ttfb.mjs --profile "<chromium user-data dir>" [options]

  --profile <dir>      REQUIRED. A user-data directory already signed in to the
                       site. Read only; cookies are copied to a temp dir for the
                       run and never printed.
  --profile-dir <name> Profile inside it (default: Default)
  --origin <url>       default https://nikcade.win
  --samples <n>        samples per endpoint (default 12)
  --expect <prefix>    fail unless the session's player id starts with this
  --cold               additionally idle, then take one cold and one warm sample
  --cold-idle <sec>    how long to idle first (default 65)
  --help

Exit codes: 0 all endpoints answered; 2 configuration or session problem.
`;

if (wantsHelp()) showHelp(HELP);

const BASE = origin();
const N = Number(arg('samples', process.env.SR_SAMPLES || 12));
const COLD_IDLE = Number(arg('cold-idle', 65)) * 1000;

// TTFB proper: from writing the request to the first byte of the response.
// Measuring from connection setup would fold TLS in and answer something else.
function ttfb(path, cookie) {
  const url = new URL(BASE + path);
  const send = url.protocol === 'http:' ? httpRequest : request;
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const req = send(url, { headers: cookie ? { Cookie: cookie } : {} }, (res) => {
      res.once('readable', () => {
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        res.resume();
        // The BODY IS NEVER READ INTO ANYTHING. /auth/me answers with account
        // data, and this tool has no reason to hold it, let alone print it.
        res.on('end', () => resolve({ status: res.statusCode, ms }));
      });
    });
    req.setMaxListeners(0);
    req.on('error', (e) => resolve({ status: 'ERR', ms: null, err: e.message }));
    req.end();
  });
}

const pad = (v, w) => String(v).padStart(w);

async function main() {
  const root = requireProfile();
  const seeded = seedSession(root, profileDirName(), 'ttfb');
  let cookie = null;
  let who = null;
  const b = await puppeteer.launch({ headless: true, userDataDir: seeded, args: ['--no-sandbox', '--disable-extensions'] });
  try {
    const p = await b.newPage();
    who = await whoami(p, BASE);
    assertSession(who, 'the supplied profile');
    // Held in memory for the run and never logged, written or returned.
    cookie = (await p.cookies(BASE)).map((c) => `${c.name}=${c.value}`).join('; ');
  } finally { await b.close(); }

  console.log(`origin ${BASE}   authenticated as ${shortId(who)}   samples=${N}\n`);
  console.log('endpoint                        http     min     p50     p90     max   (ms)');

  let bad = 0;
  for (const [label, path, auth] of [
    ['/health (no database)        ', '/health', false],
    ['/auth/me (anonymous)         ', '/auth/me', false],
    ['/auth/me (signed in)         ', '/auth/me', true],
    [`${GAME_PATH} (signed in)`.padEnd(29), GAME_PATH, true],
  ]) {
    const got = [];
    for (let i = 0; i < N; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      got.push(await ttfb(path, auth ? cookie : null));
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 250));
    }
    const s = stats(got.map((g) => g.ms));
    const codes = [...new Set(got.map((g) => g.status))];
    if (!s || codes.some((c) => c === 'ERR')) bad += 1;
    console.log(`${label}  ${pad(codes.join(','), 5)}  ${pad(Math.round(s.min), 6)}  ` +
      `${pad(Math.round(s.p50), 6)}  ${pad(Math.round(s.p90), 6)}  ${pad(Math.round(s.max), 6)}`);
  }

  // THE COLD PATH IS SAMPLED SEPARATELY OR NOT AT ALL. The first request after
  // the connection pool idles out costs several hundred ms more, and folding
  // one of those into the series above would move a percentile and describe
  // neither state. It is opt-in, and reported on its own line.
  if (flag('cold')) {
    console.log(`\nidling ${Math.round(COLD_IDLE / 1000)}s for the connection pool to go cold...`);
    await new Promise((r) => setTimeout(r, COLD_IDLE));
    const cold = await ttfb(GAME_PATH, cookie);
    const warm = await ttfb(GAME_PATH, cookie);
    console.log(`  cold  http ${cold.status}  ${Math.round(cold.ms)}ms`);
    console.log(`  warm  http ${warm.status}  ${Math.round(warm.ms)}ms  (immediately after)`);
  }

  discardSession(seeded);
  process.exit(bad ? 2 : 0);
}

main().catch((e) => { console.error(e.message || e); process.exit(2); });
