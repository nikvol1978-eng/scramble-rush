#!/usr/bin/env node
// An authenticated, extension-free production Lighthouse runner.
//
// THREE THINGS DECIDE WHETHER TWO LIGHTHOUSE NUMBERS CAN BE COMPARED, and all
// three are pinned here because each one silently ruined a run while this was
// being written:
//
//   THE VERSION. Desktop FCP, LCP, TBT and Speed Index are Lantern
//   SIMULATIONS, not measurements, and the model changes between majors. A 13.x
//   number and a 12.x number are different questions with the same name. The
//   version is an argument and it is printed in the report.
//
//   THE SESSION. The game route is gated -- anonymous gets 403 -- so an
//   unauthenticated run measures an error page and reports it as a score. The
//   profile is supplied and the session is checked against the server.
//
//   THE CACHE. Attached to a persistent profile over --port, Lighthouse clears
//   storage but the HTTP cache survives, so run 1 fetched 408 KiB over 8
//   requests and runs 2-3 fetched 164 over 7. A median across that describes no
//   state a player is ever in. Every run gets a freshly seeded profile, and the
//   report prints transfer size and request count per run so a warm run is
//   visible rather than averaged in.
//
// AND IT REPORTS THE DISTRIBUTION. A median alone hid the failure that made the
// first attempt at this useless: runs that disagreed by a factor of ten. If
// min and max are far apart, the middle is not a measurement of the site.
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import puppeteer from 'puppeteer';
import {
  arg, wantsHelp, showHelp, origin, GAME_PATH,
  requireProfile, profileDirName, seedSession, discardSession,
  whoami, assertSession, shortId, stats, r1,
} from './perf-session.mjs';

const exec = promisify(execFile);

const HELP = `
prod-lighthouse.mjs -- authenticated production Lighthouse runner

  node tools/prod-lighthouse.mjs --profile "<chromium user-data dir>" [options]

  --profile <dir>      REQUIRED. A user-data directory already signed in.
  --profile-dir <name> Profile inside it (default: Default)
  --origin <url>       default https://nikcade.win
  --path <path>        page to measure (default /play/scramble-rush)
  --runs <n>           number of runs (default 10)
  --lh <version>       Lighthouse version to pin (default 13.4.1)
  --preset <name>      desktop | perf   (default desktop)
  --expect <prefix>    fail unless the session's player id starts with this
  --out <dir>          where to write reports (default: a temp directory)
  --help

Every run gets a cold HTTP cache. The server is warmed once first and that
warm-up is discarded, because the first request after idle pays for a cold
database pool and is a different measurement.

Exit codes: 0 ran; 2 configuration or session problem.
`;

if (wantsHelp()) showHelp(HELP);

const BASE = origin();
const PAGE_PATH = arg('path', GAME_PATH);
const URL_ = BASE + PAGE_PATH;
const RUNS = Number(arg('runs', process.env.SR_LH_RUNS || 10));
const LH = arg('lh', process.env.SR_LH_VERSION || '13.4.1');
const PRESET = arg('preset', 'desktop');
const OUT = arg('out', null) || mkdtempSync(join(tmpdir(), 'sr-lh-'));
const PORT = Number(arg('port', 9333));

const ARGS = [
  `--remote-debugging-port=${PORT}`,
  '--disable-extensions',
  '--disable-component-extensions-with-background-pages',
  '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--no-sandbox', '--mute-audio',
];
const num = (v) => (typeof v === 'number' ? v : null);

async function main() {
  const root = requireProfile();
  const profile = profileDirName();
  console.log(`Lighthouse ${LH}  preset=${PRESET}  runs=${RUNS}`);
  console.log(`url ${URL_}`);

  { // the session, checked once against the server
    const seeded = seedSession(root, profile, 'lh-probe');
    const b = await puppeteer.launch({ headless: true, userDataDir: seeded, args: ['--no-sandbox', '--disable-extensions'] });
    try {
      const id = await whoami(await b.newPage(), BASE);
      assertSession(id, 'the supplied profile');
      console.log(`authenticated as ${shortId(id)}  (extensions disabled)\n`);
    } finally { await b.close(); discardSession(seeded); }
  }

  { // warm the SERVER once, and throw the result away
    const seeded = seedSession(root, profile, 'lh-warm');
    const b = await puppeteer.launch({ headless: true, userDataDir: seeded, args: ['--no-sandbox', '--disable-extensions'] });
    try {
      const p = await b.newPage();
      const t0 = Date.now();
      const r = await p.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120000 });
      console.log(`warm-up (discarded): HTTP ${r.status()} in ${Date.now() - t0}ms`);
      if (r.status() !== 200) console.log('  NOTE: the warm-up did not get a 200 — check the session.');
    } finally { await b.close(); discardSession(seeded); }
  }

  const rows = [];
  for (let i = 1; i <= RUNS; i += 1) {
    const seeded = seedSession(root, profile, `lh-${i}`);      // cold cache, same session
    const browser = await puppeteer.launch({ headless: true, userDataDir: seeded, args: ARGS, defaultViewport: null });
    try {
      const out = join(OUT, `run${i}.json`);
      const t = Date.now();
      await exec('npx', ['--yes', `lighthouse@${LH}`, URL_, `--port=${PORT}`, `--preset=${PRESET}`,
        '--only-categories=performance', '--output=json', `--output-path=${out}`, '--quiet'],
        { maxBuffer: 256 * 1024 * 1024, shell: true });
      const j = JSON.parse(readFileSync(out, 'utf8'));
      const a = j.audits;
      rows.push({
        run: i, lhVersion: j.lighthouseVersion,
        score: Math.round((j.categories.performance.score || 0) * 100),
        fcp: num(a['first-contentful-paint']?.numericValue),
        lcp: num(a['largest-contentful-paint']?.numericValue),
        tbt: num(a['total-blocking-time']?.numericValue),
        cls: num(a['cumulative-layout-shift']?.numericValue),
        si: num(a['speed-index']?.numericValue),
        ttfb: num(a['server-response-time']?.numericValue),
        payloadKiB: num(a['total-byte-weight']?.numericValue) != null
          ? Math.round(a['total-byte-weight'].numericValue / 1024) : null,
        requests: a['network-requests']?.details?.items?.length ?? null,
        mainThreadMs: num(a['mainthread-work-breakdown']?.numericValue),
        jsExecMs: num(a['bootup-time']?.numericValue),
        took: Date.now() - t,
      });
      const last = rows[rows.length - 1];
      console.log(`run ${i}: score ${last.score}  FCP ${Math.round(last.fcp)}  LCP ${Math.round(last.lcp)}  ` +
        `TBT ${Math.round(last.tbt)}  SI ${Math.round(last.si)}  TTFB ${Math.round(last.ttfb)}  ` +
        `${last.payloadKiB}KiB  ${last.requests} reqs  (${Math.round(last.took / 1000)}s)`);
    } finally { await browser.close(); discardSession(seeded); }
  }

  // A COLD RUN IS ONE THAT FETCHED EVERYTHING. Warm-cache runs pull far fewer
  // bytes over fewer requests; they are reported and then excluded rather than
  // quietly averaged in.
  const maxReq = Math.max(...rows.map((r) => r.requests || 0));
  const cold = rows.filter((r) => r.requests === maxReq);
  const warm = rows.length - cold.length;
  console.log(`\n-- ${cold.length}/${rows.length} runs cold-cache (${maxReq} requests)` +
    `${warm ? `; ${warm} warm run(s) EXCLUDED` : ''} --`);
  const KEYS = ['score', 'fcp', 'lcp', 'tbt', 'cls', 'si', 'ttfb', 'payloadKiB', 'requests', 'mainThreadMs', 'jsExecMs'];
  console.log('  metric            min       p25       p50       p75       max');
  for (const k of KEYS) {
    const s = stats(cold.map((r) => r[k]));
    if (!s) { console.log(`  ${k.padEnd(14)}  (no data)`); continue; }
    console.log(`  ${k.padEnd(14)}` + [s.min, s.p25, s.p50, s.p75, s.max].map((v) => String(r1(v)).padStart(9)).join(' '));
  }
  const spread = stats(cold.map((r) => r.tbt));
  if (spread && spread.min > 0 && spread.max / spread.min > 3) {
    console.log('\n  WARNING: TBT max is more than 3x its min across cold runs. These are Lantern');
    console.log('  simulations and that spread means they are measuring this machine, not the site.');
  }
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ url: URL_, preset: PRESET, lighthouse: LH, rows }, null, 1));
  console.log(`\nreports: ${OUT}`);
}

main().catch((e) => { console.error(e.message || e); process.exit(2); });
