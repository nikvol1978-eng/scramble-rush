#!/usr/bin/env node
// Build three + the addons the game uses into ONE fingerprinted local module.
//
//   node build/three-bundle.mjs        -> prints the filename it wrote
//
// WHAT IT REPLACES. The release carried an import map pointing at jsDelivr, so
// a cold load fetched twenty separate modules from a third-party origin:
//
//     20 requests, 1,399 KiB raw (jsDelivr serves three.module.js UNMINIFIED
//     at 1.27 MB), ~326 KB over the wire, graph depth 2.
//
// And it was on the critical path in the strongest sense: the boot sequence's
// first gate waits for `window.load`, so the loading screen could not advance
// past "Connecting…" until every one of those had landed. Measured, that gate
// was 1,776 ms of a 1,940 ms preparation -- the CDN waterfall WAS the startup.
//
// WHY A FILE AND NOT INLINE. Inlining it into the release would remove the
// requests too, and would be worse: the game document is `private, no-store`
// (it is behind an account gate), so an inlined three would be re-downloaded
// on every single visit. A separate file with a content hash in its name can
// be cached immutably and costs nothing on the second visit. That is the
// whole reason for the hash.
//
// TREE-SHAKING IS NOT THE POINT and is barely possible here: the game does
// `import * as R160 from 'three'` and copies the namespace, so rollup or
// esbuild must keep essentially all of three. The wins are minification
// (1.27 MB -> ~600 KB), one request instead of twenty, and one origin instead
// of two.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { writeFile, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
export const BUNDLE_RE = /^three-[0-9a-f]{12}\.js$/;

export async function buildThree() {
  const out = await build({
    entryPoints: [join(HERE, 'three-entry.js')],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    minify: true,
    write: false,
    legalComments: 'none',
    // three's addons import 'three' and each other by bare specifier; this is
    // the same mapping the old import map expressed, pointed at the copy in
    // node_modules so the bundle is built from the LOCKED version rather than
    // whatever the CDN is serving today.
    alias: { three: join(ROOT, 'node_modules/three/build/three.module.js') },
    plugins: [{
      name: 'three-addons',
      setup(b) {
        b.onResolve({ filter: /^three\/addons\// }, (a) => ({
          path: join(ROOT, 'node_modules/three/examples/jsm', a.path.slice('three/addons/'.length)),
        }));
      },
    }],
  });
  const code = out.outputFiles[0].text;
  // Content hash: the same inputs give the same name, so a rebuild that
  // changed nothing does not churn the release or bust anyone's cache.
  const hash = createHash('sha256').update(code).digest('hex').slice(0, 12);
  const name = `three-${hash}.js`;

  // Old bundles go. Leaving them behind would ship every three.js the project
  // has ever built inside the Docker image, and the server picks files out of
  // this directory by pattern.
  for (const f of await readdir(ROOT)) {
    if (BUNDLE_RE.test(f) && f !== name) await unlink(join(ROOT, f));
  }
  await writeFile(join(ROOT, name), code, 'utf8');
  return { name, bytes: Buffer.byteLength(code) };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const r = await buildThree();
  console.log(`${r.name} (${r.bytes} bytes)`);
}
