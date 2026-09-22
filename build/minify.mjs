#!/usr/bin/env node
// Minify a built release IN PLACE, without touching a line of source.
//
//   node build/minify.mjs <assembled.html> <out.html>
//
// WHY. The release is one self-contained document and 43.6% of its inline
// JavaScript is comments -- this codebase explains itself at length, which is
// right for the fragments in build/frag and pure weight for the player. The
// measured effect of removing them:
//
//     raw       952,534 -> 604,660 bytes   (-36.5%)
//     brotli q5 281,670 -> 156,310 bytes   (-44.5%)
//
// 125 KB of brotli is about 610 ms of download on Lighthouse's mobile profile
// (1,638 Kbps). Nothing else on the client side is worth that much.
//
// WHAT IS AND IS NOT DONE. esbuild is given `minifyWhitespace` and
// `minifySyntax` but NOT `minifyIdentifiers`:
//
//   - whitespace/comments: pure removal, nothing to go wrong.
//   - syntax: safe local rewrites (`!0` for `true`, collapsing blocks).
//   - identifiers: DELIBERATELY OFF. Renaming locals would save a further
//     ~5% of brotli and would also rename every function in a stack trace and
//     every `Function.prototype.name`. The debug build, the check registry and
//     the CPU profiles that produced this whole review all read those names.
//     That is a bad trade for five percent, and it can be revisited with
//     evidence rather than assumed.
//
// This is a deterministic transform of a build output: same input and same
// esbuild version give the same bytes, which is what keeps the release
// reproducible.
import { readFile, writeFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const [src, dst] = process.argv.slice(2);
if (!src || !dst) {
  console.error('usage: node build/minify.mjs <assembled.html> <out.html>');
  process.exit(2);
}

let html = await readFile(src, 'utf8');

// The inline module script: everything the game is.
const SCRIPT = /<script type="module">([\s\S]*?)<\/script>/;
const scriptMatch = html.match(SCRIPT);
if (!scriptMatch) { console.error('minify: no <script type="module"> found'); process.exit(1); }

const js = await transform(scriptMatch[1], {
  loader: 'js',
  format: 'esm',
  minifyWhitespace: true,
  minifySyntax: true,
  minifyIdentifiers: false,
  legalComments: 'none',
  target: 'es2022',
});

// A `</script>` produced inside a string literal would close the block early
// and silently truncate the game. esbuild does not escape for an HTML host, so
// this is checked rather than hoped for.
if (/<\/script/i.test(js.code)) {
  console.error('minify: refusing — minified JS contains a literal </script');
  process.exit(1);
}

const STYLE = /<style>([\s\S]*?)<\/style>/;
const styleMatch = html.match(STYLE);
let cssOut = null;
if (styleMatch) {
  const css = await transform(styleMatch[1], { loader: 'css', minify: true });
  if (/<\/style/i.test(css.code)) {
    console.error('minify: refusing — minified CSS contains a literal </style');
    process.exit(1);
  }
  cssOut = css.code;
}

// Replace via a function so a `$&`/`$1` sequence anywhere in the minified
// output is not interpreted as a replacement pattern.
html = html.replace(SCRIPT, () => `<script type="module">\n${js.code}</script>`);
if (cssOut !== null) html = html.replace(STYLE, () => `<style>${cssOut}</style>`);

await writeFile(dst, html, 'utf8');

const before = (await readFile(src)).length;
const after = Buffer.byteLength(html);
console.log(`minified ${dst} (${before} -> ${after} bytes, -${(100 * (before - after) / before).toFixed(1)}%)`);
