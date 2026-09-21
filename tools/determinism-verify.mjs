#!/usr/bin/env node
// Prove that a check's result does not depend on what ran before it.
//
//   node tools/determinism-verify.mjs
//   SR_CHECK=r node tools/determinism-verify.mjs
//
// It compares the check's full DETAIL STRING, not its pass/fail. A check that
// measures "worst idle in the bend 1.4s" and then "2.8s" has changed its answer
// even while both runs are green, and pass/fail would hide exactly the drift
// this is here to catch.
//
// Each scenario gets a FRESH PAGE, so a scenario cannot be made to look
// deterministic by state the previous scenario left behind.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = resolve(process.env.SR_ROOT || fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.env.SR_CHECK || 'r';
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

// Run one scenario in a brand-new page and return the target check's line.
async function scenario(port, label, opts) {
  const t0 = Date.now();
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--mute-audio'],
    defaultViewport: { width: 1280, height: 720 }, protocolTimeout: 900000,
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e && e.message || e)));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__dbg && window.__checks', { timeout: 180000 });
  const res = await page.evaluate(async (o, target) => {
    window.__noRender = true;
    const r = await window.__checks.run(o);   // async: [,] waits on a real spin
    // Match the check's ID AT THE START of its name. Searching the whole line
    // picked up check [y], whose detail reads "orbit r 228-228" -- a substring
    // search for " r " finds that, and the comparison silently became a
    // comparison of a different check's result.
    // Every line is exactly 'PASS  ' or 'FAIL  ' followed by the name, and
    // every name begins '<id> ', so this needs no pattern at all.
    const line = r.results.find((s) => s.slice(6).startsWith(target + ' ')) || '(target not run)';
    return { line, passed: r.passed, failed: r.failed };
  }, opts, CHECK);
  await browser.close(); browser = null;
  // strip the leading PASS/FAIL so the comparison is of the MEASUREMENT
  const detail = res.line.replace(/^(PASS|FAIL)\s+/, '');
  // REPORT AS IT GOES, not in a table at the end. Printing only at the end
  // meant that a run which stalled on scenario four looked exactly like a run
  // that was making progress: forty minutes of a single header line, with no
  // way to tell which it was without killing it.
  const tag = errs.length ? ` [${errs.length} PAGE ERRORS]` : '';
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`${label.padEnd(18)} ${String(secs).padStart(4)}s  ${detail}${tag}`);
  return { label, detail, passed: res.passed, failed: res.failed, errs };
}

async function main() {
  const port = await serve();
  console.log(`verifying [${CHECK}] in ${ROOT}\n`);
  const runs = [];

  // A — alone, three times, fresh page each time
  for (let i = 1; i <= 3; i++) runs.push(await scenario(port, `A alone #${i}`, { only: CHECK }));
  // B — first in a subset (registration order puts r before these)
  runs.push(await scenario(port, 'B first-in-subset', { only: CHECK + 'chk' }));
  // C — last in a subset (reverse order puts r after them)
  runs.push(await scenario(port, 'C last-in-subset', { only: CHECK + 'chk', order: 'reverse' }));
  // D — after an arbitrary randomised subset
  runs.push(await scenario(port, 'D after-subset', { only: CHECK + 'ABCDEFhkgi', order: 90210 }));
  runs.push(await scenario(port, 'D after-subset2', { only: CHECK + 'ABCDEFhkgi', order: 1337 }));
  // E/F — the whole suite, in registration order and in two other orders.
  // SR_FAST=1 skips these: they are ~5 minutes each and the cheap scenarios
  // above already localise most regressions.
  if (!process.env.SR_FAST) {
    runs.push(await scenario(port, 'E full-suite', {}));
    runs.push(await scenario(port, 'F full-reversed', { order: 'reverse' }));
    runs.push(await scenario(port, 'F full-shuffled', { order: 424242 }));
  }

  let worstSuite = null;
  for (const r of runs) if (r.failed > 0) worstSuite = r;

  const details = new Set(runs.map((r) => r.detail));
  const anyErrs = runs.reduce((n, r) => n + r.errs.length, 0);
  console.log('');
  console.log(`distinct results for [${CHECK}] across ${runs.length} scenarios: ${details.size}`);
  if (details.size === 1) console.log(`DETERMINISTIC — identical measurement alone, first, last, shuffled and in full runs`);
  else { console.log('*** NOT DETERMINISTIC ***'); for (const d of details) console.log(`  ${d}`); }
  console.log(`page errors across all scenarios: ${anyErrs}`);
  if (worstSuite) console.log(`NOTE: a scenario reported ${worstSuite.failed} failing check(s) (${worstSuite.label})`);
  await shutdown();
  process.exit(details.size === 1 && anyErrs === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await shutdown(); process.exit(1); });
