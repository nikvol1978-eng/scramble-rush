#!/usr/bin/env node
// OUR hand's silhouette, in the same terms tools/reference-hand-study.mjs
// reports the official model's: where the palm-view outline splits into
// separate runs, how wide each run is, and how wide the gaps between them are,
// all as fractions of the hand's own length.
//
//   node tools/hand-silhouette.mjs
//   SR_OVERRIDE='{"DIG_LEN":[2.4,3.0]}' node tools/hand-silhouette.mjs
//
// This is the measurement that matters at production distance. A hand forty
// pixels wide has no shading and no detail; what reaches the eye is the
// outline, and an outline that breaks into three thin runs early reads as a
// CLAW however good the close-up looks. The reference's outline is ONE run
// until 0.64 of the hand -- that single number is the difference between a
// mitt and a pincer, and nothing in a close-up render shows it.
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const parts = await Promise.all(['02_skinmat.js', '02b_rig.js', '12_charanim.js']
  .map(f => readFile(resolve(root, 'build/frag', f), 'utf8')));
if (process.env.SR_OVERRIDE) {
  for (const [k, v] of Object.entries(JSON.parse(process.env.SR_OVERRIDE))) {
    const re = new RegExp(`(\\b${k}\\s*=\\s*)(\\[(?:[^\\[\\]]|\\[[^\\]]*\\])*\\]|[-\\d.]+)`);
    if (!re.test(parts[1])) throw new Error('constant not found: ' + k);
    parts[1] = parts[1].replace(re, `$1${Array.isArray(v) ? JSON.stringify(v) : v}`);
  }
}
const api = new Function('THREE', `
  const skinBaseColor=s=>s.color||'#eb5aa2',clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const RADIUS=17,LAND_MS=90,DIVE_GETUP_MS=500;
  let racers=[];const currentMap={slippery:false},pathAngle=()=>0,toWorld=(x,y,h)=>({x,y:h,z:y});
  ${parts.join('\n')}
  return { armGeometry, RIG, HAND_S0, HAND_SS, HAND_L, PALM_END, DIG_RINGS };
`)(THREE);

const { geo, digits } = api.armGeometry(api.RIG, 1, 1, 5, 20, 22);
const LIMB = api.RIG.upperLen + api.RIG.foreLen;
const pos = geo.attributes.position, gi = geo.index;
// the hand is everything at or past HAND_S0 down the limb; s is -y/LIMB, which
// is the sweep's own parameter up to the small roll the cant puts on it
const tOf = v => (-pos.getY(v) / LIMB - api.HAND_S0) / api.HAND_SS;

const tri = [];
for (let f = 0; f < gi.count; f += 3) {
  const a = gi.getX(f), b = gi.getX(f + 1), c = gi.getX(f + 2);
  if (tOf(a) >= 0.02 && tOf(b) >= 0.02 && tOf(c) >= 0.02)
    tri.push([a, b, c].map(v => [pos.getX(v), pos.getZ(v), tOf(v)]));
}

const N = 240;
// ax/ay pick which of (across, through) is the horizontal axis; t is vertical
const raster = (ax) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const T of tri) for (const p of T) {
    x0 = Math.min(x0, p[ax]); x1 = Math.max(x1, p[ax]);
    y0 = Math.min(y0, p[2]); y1 = Math.max(y1, p[2]);
  }
  const g = new Uint8Array(N * N);
  const px = x => (x - x0) / (x1 - x0) * (N - 1), py = y => (y - y0) / (y1 - y0) * (N - 1);
  for (const T of tri) {
    const P = T.map(p => [px(p[ax]), py(p[2])]);
    const [A, B, C] = P;
    const d = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
    if (Math.abs(d) < 1e-12) continue;
    const minx = Math.max(0, Math.floor(Math.min(...P.map(p => p[0])))), maxx = Math.min(N - 1, Math.ceil(Math.max(...P.map(p => p[0]))));
    const miny = Math.max(0, Math.floor(Math.min(...P.map(p => p[1])))), maxy = Math.min(N - 1, Math.ceil(Math.max(...P.map(p => p[1]))));
    for (let j = miny; j <= maxy; j++) for (let i = minx; i <= maxx; i++) {
      const l1 = ((B[1] - C[1]) * (i - C[0]) + (C[0] - B[0]) * (j - C[1])) / d;
      const l2 = ((C[1] - A[1]) * (i - C[0]) + (A[0] - C[0]) * (j - C[1])) / d;
      if (l1 >= -0.02 && l2 >= -0.02 && 1 - l1 - l2 >= -0.02) g[j * N + i] = 1;
    }
  }
  return { g, x0, x1, y0, y1 };
};
// V13 ROLLED THE HAND: the digits are spread along Z now, so the view that
// looks ACROSS them -- the one whose runs are the fingers -- is the Z raster,
// and X is the hand's thickness. Reading these the old way round measures the
// hand edge-on and reports one run all the way up, which looks like a pass.
const W = raster(1), D = raster(0);
const runs = (R, j) => {
  const out = []; let s = -1;
  for (let i = 0; i < N; i++) {
    const on = R.g[j * N + i];
    if (on && s < 0) s = i;
    if ((!on || i === N - 1) && s >= 0) { out.push([s, on ? i : i - 1]); s = -1; }
  }
  return out.filter(([a, b]) => b - a >= 1);
};
const sx = R => (R.x1 - R.x0) / (N - 1) / api.HAND_L;
const rowT = (R, j) => R.y0 + j / (N - 1) * (R.y1 - R.y0);
const jOfT = (R, t) => Math.round((t - R.y0) / (R.y1 - R.y0) * (N - 1));

console.log('OUR HAND — palm-view silhouette runs, as fractions of hand length');
console.log('  HAND_L', api.HAND_L.toFixed(3), ' PALM_END', api.PALM_END.toFixed(3));
console.log('\n  t      runs                                              sideD');
const rows = [];
for (let j = 0; j < N; j++) {
  const t = rowT(W, j);
  if (t < 0.02 || t > 1.01) continue;
  const rr = runs(W, j); if (!rr.length) continue;
  const widths = rr.map(([a, b]) => (b - a) * sx(W));
  const gaps = rr.slice(1).map(([a], k) => (a - rr[k][1]) * sx(W));
  const dj = jOfT(D, t), dr = dj >= 0 && dj < N ? runs(D, dj) : [];
  const sd = dr.length ? (dr[dr.length - 1][1] - dr[0][0]) * sx(D) : 0;
  rows.push({ t, n: rr.length, widths, gaps, sd });
}
for (let k = 0; k < rows.length; k += 8) {
  const r = rows[k];
  console.log('  ' + r.t.toFixed(3).padStart(5) + '   n=' + r.n +
    '  w=[' + r.widths.map(x => x.toFixed(3)).join(' ') + ']' +
    (r.gaps.length ? '  gap=[' + r.gaps.map(x => x.toFixed(3)).join(' ') + ']' : '')
      .padEnd(26) + '  D=' + r.sd.toFixed(3));
}
const f2 = rows.find(r => r.n >= 2), f3 = rows.find(r => r.n >= 3);
const span = r => r.widths.reduce((a, b) => a + b, 0) + r.gaps.reduce((a, b) => a + b, 0);
const widest = rows.reduce((a, b) => span(a) > span(b) ? a : b);
console.log('\n            OURS     REFERENCE');
console.log('  splits into 2 at t  ' + (f2 ? f2.t.toFixed(3) : 'never ').padEnd(9) + '0.637');
console.log('  splits into 3 at t  ' + (f3 ? f3.t.toFixed(3) : 'never ').padEnd(9) + 'never above 0.2');
console.log('  widest row at t     ' + widest.t.toFixed(3).padEnd(9) + '0.605');
console.log('  widest span         ' + span(widest).toFixed(3).padEnd(9) + '1.156');
// ---- the digits, addressed through armGeometry's own map ------------------
// Each entry says where a digit's vertices start and how many it has per ring,
// so nothing here re-derives which grid blocks were opened. Two statements of
// that arithmetic is what had tools/hand-topo.mjs checking a mirror map the
// gate had stopped using.
const V = i => [pos.getX(i), pos.getY(i), pos.getZ(i)];
const NAME = ['finger-short', 'finger-long', 'thumb'];
const palmEnd = rows.reduce((a, r) => r.n === 1 && r.t > a && r.t < 0.85 ? r.t : a, 0);
console.log('\n  digit          root t   tip t   past palm   radius/L   free in diameters');
digits.forEach((dg, n) => {
  let root = 9, tip = -9;
  for (let i = dg.start; i < dg.start + dg.M * dg.rings + 1; i++) {
    const t = tOf(i); root = Math.min(root, t); tip = Math.max(tip, t);
  }
  // radius: the spread of a ring a third of the way up, where the loft has
  // reached the stated section but the dome has not started
  const mid = Math.floor(dg.rings / 3), R = [];
  for (let m = 0; m < dg.M; m++) R.push(V(dg.start + mid * dg.M + m));
  const c = [0, 1, 2].map(k => R.reduce((a, q) => a + q[k], 0) / dg.M);
  const rad = R.reduce((a, q) => Math.max(a, Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2])), 0);
  console.log('  ' + NAME[n].padEnd(14) + root.toFixed(3) + '   ' + tip.toFixed(3) +
    '    ' + (tip - palmEnd).toFixed(3).padStart(6) +
    '     ' + (rad / api.HAND_L).toFixed(3) +
    '      ' + ((tip - root) * api.HAND_L / (2 * rad)).toFixed(2));
});
console.log('  palm mass ends at t = ' + palmEnd.toFixed(3));
console.log('  REFERENCE       root t  tip t   past palm  radius/L   free in diameters');
console.log('  finger-short    0.395   0.880     0.131      0.195       0.34');
console.log('  finger-long     0.708   1.000     0.251      0.141       0.89');
console.log('  thumb           0.376   0.712    -0.037      0.145       1.16');
console.log('  palm mass ends at t = 0.749');

console.log('\n  palm-view silhouette (tips at top):');
for (let j = N - 1; j >= 0; j -= 4) {
  const t = rowT(W, j);
  if (t < -0.02 || t > 1.02) continue;
  let s = '';
  for (let i = 0; i < N; i += 2) s += W.g[j * N + i] ? '#' : ' ';
  console.log('  ' + t.toFixed(2) + ' |' + s.replace(/\s+$/, ''));
}
