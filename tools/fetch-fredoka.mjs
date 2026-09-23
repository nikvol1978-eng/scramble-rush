#!/usr/bin/env node
// Fetch the official Fredoka assets that this repository self-hosts.
//
//   node tools/fetch-fredoka.mjs
//
// WHY THE FILES ARE COMMITTED AND THIS SCRIPT EXISTS ANYWAY. The WOFF2s are in
// the tree because a build must not depend on a network fetch, and because the
// bytes being served have to be reviewable. This script is how they got there
// and how they can be checked against upstream again: it writes the same files
// and prints their hashes, so "is this still the official asset?" is a command
// rather than a memory.
//
// NOTHING IS CONVERTED OR SUBSET. These are the exact binaries Google serves to
// a current Chrome for the stylesheet the game used to load, taken unmodified.
// That matters for the OFL: an unmodified redistribution carries no naming
// obligations beyond shipping the licence, which assets/fonts/fredoka/OFL.txt
// does.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// A production-class Chrome. Google Fonts serves different formats by
// user-agent, and asking as anything else gets a different (older) answer.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
         + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Fredoka v17. Every one of the three weights the game uses -- 500, 600 and
// 700 -- resolves to the SAME url per subset, because these are variable fonts
// with a wght axis. That is why the generated CSS can declare one face per
// subset with `font-weight: 500 700` and be delivering exactly what Google did.
const BASE = 'https://fonts.gstatic.com/s/fredoka/v17/';
export const SUBSETS = {
  latin: 'X7n64b87HvSqjb_WIi2yDCRwoQ_k7367_DWu89U.woff2',
  'latin-ext': 'X7n64b87HvSqjb_WIi2yDCRwoQ_k7367_DWg89XyHw.woff2',
  hebrew: 'X7n64b87HvSqjb_WIi2yDCRwoQ_k7367_DWs89XyHw.woff2',
};
const OFL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/fredoka/OFL.txt';
const DIR = new URL('../assets/fonts/fredoka/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

const main = async () => {
  mkdirSync(DIR, { recursive: true });
  for (const [name, file] of Object.entries(SUBSETS)) {
    const b = await get(BASE + file);
    // A WOFF2 starts with the ASCII signature wOF2. Checking it here means a
    // captive portal or an error page cannot quietly become a "font".
    if (b.subarray(0, 4).toString('latin1') !== 'wOF2') throw new Error(`${name}: not a WOFF2`);
    writeFileSync(join(DIR, `fredoka-${name}.woff2`), b);
    console.log(`${name.padEnd(10)} ${String(b.length).padStart(6)} B  sha256 ${createHash('sha256').update(b).digest('hex')}`);
  }
  const ofl = await get(OFL);
  if (!/Reserved Font Name/i.test(ofl.toString('utf8'))) throw new Error('OFL.txt does not look like the SIL OFL');
  writeFileSync(join(DIR, 'OFL.txt'), ofl);
  console.log(`OFL.txt    ${String(ofl.length).padStart(6)} B  (official google/fonts/ofl/fredoka)`);
};

if (process.argv[1] && process.argv[1].endsWith('fetch-fredoka.mjs')) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
