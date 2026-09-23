#!/usr/bin/env node
// Deterministic performance budgets for the shipped release.
//
//   node tools/perf-budget.mjs           check
//   node tools/perf-budget.mjs --update  rewrite the budget to today's numbers
//
// WHY THESE NUMBERS AND NOT LIGHTHOUSE NUMBERS. Everything asserted here is a
// property of the BUILD OUTPUT: byte counts, compressed byte counts, how many
// origins the document reaches for, whether anything render-blocking crept
// back into <head>. Run twice on the same commit it gives the same answer, on
// any machine, with no network.
//
// Lighthouse scores are not like that. Measuring this game touches unpkg and
// Google Fonts, and three consecutive runs of one unchanged build scored 62,
// 99 and 99 on this machine depending on cache state. A CI gate on that would
// fail for reasons nobody can act on, and would be switched off within a week.
// Timings belong in tools/release-smoke.mjs, which reports them and does not
// judge them.
//
// The budgets are CEILINGS with room in them, not records of the current
// number. A build that comes in under is fine and is not "failing to improve";
// the gate exists to catch a regression that puts a megabyte back.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { gzipSync, brotliCompressSync, constants as zc } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BUDGET = join(ROOT, 'tools', 'perf-budget.json');
const ENTRY = /^scramble-rush-(\d+)\.(\d+)\.html$/;
const BUNDLE = /^three-[0-9a-f]{12}\.js$/;

// q5, matching what the server actually serves. Budgeting against q11 would
// flatter every number by a few percent that no player receives.
const br = (b) => brotliCompressSync(b, {
  params: { [zc.BROTLI_PARAM_QUALITY]: 5, [zc.BROTLI_PARAM_SIZE_HINT]: b.length },
}).length;

const files = await readdir(ROOT);
const releases = files.filter((n) => ENTRY.test(n)).sort((a, b) => {
  const [, aMaj, aMin] = a.match(ENTRY); const [, bMaj, bMin] = b.match(ENTRY);
  return Number(bMaj) - Number(aMaj) || Number(bMin) - Number(aMin);
});
const relName = releases[0];
if (!relName) { console.error('no release found'); process.exit(2); }
const rel = await readFile(join(ROOT, relName));
const html = rel.toString('utf8');

const bundleName = files.find((n) => BUNDLE.test(n));
const bundle = bundleName ? await readFile(join(ROOT, bundleName)) : Buffer.alloc(0);

// Every absolute URL the document names, by origin. This is the number that
// says "the Three.js waterfall has not come back".
const origins = [...new Set(
  [...html.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"'/]+)/g)].map((m) => m[1]),
)].sort();

// A <script src> in <head> with neither defer nor async stops the parser
// before the boot screen's markup. Two of these were removed in v26; this is
// what stops a third arriving.
const head = html.slice(0, html.indexOf('</head>'));
const blockingScripts = [...head.matchAll(/<script\b([^>]*)\bsrc=([^>]*)>/g)]
  .filter((m) => !/\b(defer|async|type=["']module["'])\b/.test(m[1] + m[2]))
  .map((m) => (m[2].match(/["']([^"']+)["']/) || [])[1]);

const actual = {
  releaseRawBytes: rel.length,
  releaseBrotliBytes: br(rel),
  releaseGzipBytes: gzipSync(rel, { level: 6 }).length,
  threeBundleRawBytes: bundle.length,
  threeBundleBrotliBytes: bundle.length ? br(bundle) : 0,
  startupTransferBrotliBytes: br(rel) + (bundle.length ? br(bundle) : 0),
  thirdPartyOrigins: origins.length,
  parserBlockingScriptsInHead: blockingScripts.length,
};

if (process.argv.includes('--update')) {
  // Ceilings with headroom, so ordinary growth does not trip the gate and a
  // real regression still does.
  const pad = (n, pct) => Math.ceil((n * (100 + pct)) / 100);
  const next = {
    _comment: 'Ceilings, not records. Regenerate with: node tools/perf-budget.mjs --update',
    releaseRawBytes: pad(actual.releaseRawBytes, 8),
    releaseBrotliBytes: pad(actual.releaseBrotliBytes, 8),
    releaseGzipBytes: pad(actual.releaseGzipBytes, 8),
    threeBundleRawBytes: pad(actual.threeBundleRawBytes, 5),
    threeBundleBrotliBytes: pad(actual.threeBundleBrotliBytes, 5),
    startupTransferBrotliBytes: pad(actual.startupTransferBrotliBytes, 8),
    thirdPartyOrigins: actual.thirdPartyOrigins,
    parserBlockingScriptsInHead: 0,
  };
  await writeFile(BUDGET, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`wrote ${BUDGET}`);
  process.exit(0);
}

const budget = JSON.parse(await readFile(BUDGET, 'utf8'));
let failed = 0;
console.log(`release ${relName}${bundleName ? ` + ${bundleName}` : ''}\n`);
for (const [k, limit] of Object.entries(budget)) {
  if (k.startsWith('_')) continue;
  const got = actual[k];
  const ok = got <= limit;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${k.padEnd(30)} ${String(got).padStart(9)} / ${String(limit).padStart(9)}`);
}
if (blockingScripts.length) {
  console.log(`\nparser-blocking <script src> in <head>:\n  ${blockingScripts.join('\n  ')}`);
}
console.log(`\nthird-party origins (${origins.length}): ${origins.join(' ') || 'none'}`);

// ---- Fredoka is served from this origin, and must stay that way -----------
//
// The font used to come from fonts.googleapis.com, whose stylesheet then named
// faces on fonts.gstatic.com: two cross-origin round trips in front of the
// first paint. Restoring either is a one-line mistake with no visible symptom
// -- the font still renders -- so the built release is asserted against it
// rather than trusted.
const text = html.toString('utf8');
const fontFails = [];
for (const gone of ['fonts.googleapis.com', 'fonts.gstatic.com']) {
  if (text.includes(gone)) fontFails.push(`the release still references ${gone}`);
}
const faces = [...text.matchAll(/@font-face\{[^}]*?font-family:\s*['"]?Fredoka['"]?[^}]*\}/g)].map((m) => m[0]);
if (faces.length !== 3) fontFails.push(`${faces.length} local Fredoka @font-face rule(s), wanted 3 (latin, latin-ext, hebrew)`);
if (faces.length && !faces.every((f) => /font-weight:\s*500 700/.test(f))) {
  fontFails.push('a Fredoka face does not declare font-weight: 500 700');
}
// Every hashed asset the release names has to be on disk beside it, or the
// page ships a 404 for its own font.
const refs = [...new Set([...text.matchAll(/fredoka-[0-9a-f]{12}\.woff2/g)].map((m) => m[0]))];
if (refs.length !== 3) fontFails.push(`${refs.length} distinct hashed Fredoka asset(s) referenced, wanted 3`);
let fontBytes = 0;
for (const r of refs) {
  try { fontBytes += (await readFile(join(ROOT, r))).length; }
  catch { fontFails.push(`referenced ${r} is not on disk`); }
}
// Exactly one preload. Preloading all three would put the latin-ext and hebrew
// subsets on the wire for an English session that never needs either.
const preloads = [...text.matchAll(/<link[^>]+rel=["']?preload["']?[^>]*>/g)]
  .map((m) => m[0]).filter((t) => /as=["']?font/.test(t));
if (preloads.length !== 1) fontFails.push(`${preloads.length} font preload(s), wanted exactly 1 (latin only)`);
else if (!/fredoka-[0-9a-f]{12}\.woff2/.test(preloads[0])) fontFails.push('the font preload does not name a hashed Fredoka asset');
else if (!/crossorigin/.test(preloads[0])) fontFails.push('the font preload is missing crossorigin (fonts are fetched in CORS mode)');
console.log(`fredoka: ${faces.length} faces, ${refs.length} assets, ${fontBytes} bytes on disk, ${preloads.length} preload`);
for (const f of fontFails) console.log(`FAIL  ${f}`);
failed += fontFails.length;

console.log(failed ? `\nPERF BUDGET: ${failed} over` : '\nPERF BUDGET: PASS');
process.exit(failed ? 1 : 0);
