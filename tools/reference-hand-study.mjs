#!/usr/bin/env node
// The reference hand, measured the way the EYE reads it: as a silhouette.
//
//   SR_REFERENCE_GLB=<path.glb> node tools/reference-hand-study.mjs
//
// tools/reference-hand.mjs cuts polar sections and reports a "valley dip". That
// number is dominated by how FLAT the hand is, not by how separated the digits
// are: a smooth ellipse 3.25 times wider than it is thick already dips 69% at
// its minor axis, so a reading of 79% says almost nothing about grooves. What
// decides whether three digits read as three digits is where the palm-view
// OUTLINE splits into separate runs, and how far apart those runs are. That is
// what this measures.
//
// Nothing here is copied into the game. It prints ratios.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const GLB = process.argv[2] || process.env.SR_REFERENCE_GLB;
if (!GLB) { console.error('need SR_REFERENCE_GLB or argv[1]'); process.exit(2); }
const buf = await readFile(resolve(GLB));
const gltf = await new Promise((ok, no) =>
  new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', ok, no));
gltf.scene.updateMatrixWorld(true);
let sk = null;
gltf.scene.traverse(o => { if (o.isSkinnedMesh && (!sk || o.geometry.attributes.position.count > sk.geometry.attributes.position.count)) sk = o; });

const B = sk.skeleton.bones, nm = n => B.findIndex(b => b.name === n);
const WRIST = nm('Wrist_L_jnt_09');
const ELBOW = B.findIndex(b => /Elbow_L/.test(b.name));
const GROUP = {
  finger01: [nm('Finger01_L_jnt_01_010'), nm('Finger01_L_jnt_02_011')],
  finger02: [nm('Finger02_L_jnt_01_012'), nm('Finger02_L_jnt_02_013')],
  thumb:    [nm('Thumb_L_jnt_01_014'),    nm('Thumb_L_jnt_02_015')],
};
const ALL = [WRIST, ...Object.values(GROUP).flat()];
const inv = B[WRIST].matrixWorld.clone().invert();
const bp = i => new THREE.Vector3().setFromMatrixPosition(B[i].matrixWorld).applyMatrix4(inv);

const pos = sk.geometry.attributes.position, si = sk.geometry.attributes.skinIndex, sw = sk.geometry.attributes.skinWeight;
const wOn = (v, set) => { let s = 0; for (let c = 0; c < 4; c++) if (set.includes(si.getComponent(v, c))) s += sw.getComponent(v, c); return s; };
const local = [];
for (let v = 0; v < pos.count; v++)
  local.push(new THREE.Vector3().fromBufferAttribute(pos, v).applyMatrix4(sk.matrixWorld).applyMatrix4(inv));

// The hand's own frame, exactly as reference-hand-views.mjs builds it so the
// numbers and the pictures are in the same coordinates.
const tips = Object.values(GROUP).map(g => bp(g[1]));
const L = tips.reduce((a, v) => a.add(v.clone()), new THREE.Vector3()).divideScalar(3).normalize();
let Wx = tips[0].clone().sub(tips[1]); Wx.sub(L.clone().multiplyScalar(Wx.dot(L))).normalize();
const D = new THREE.Vector3().crossVectors(L, Wx).normalize();
const uvw = p => [p.dot(Wx), p.dot(D), p.dot(L)];

// FIGURE HEIGHT, so every ratio below can also be quoted at the racer's scale.
let hi = -Infinity, lo = Infinity;
for (let v = 0; v < pos.count; v++) {
  const y = new THREE.Vector3().fromBufferAttribute(pos, v).applyMatrix4(sk.matrixWorld).y;
  hi = Math.max(hi, y); lo = Math.min(lo, y);
}
const FIG = hi - lo;

const keep = new Uint8Array(pos.count);
const owner = new Array(pos.count).fill(null);
for (let v = 0; v < pos.count; v++) {
  if (wOn(v, ALL) < 0.85) continue;
  keep[v] = 1;
  const best = Object.keys(GROUP).reduce((a, b) => wOn(v, GROUP[a]) > wOn(v, GROUP[b]) ? a : b);
  owner[v] = wOn(v, [WRIST]) > wOn(v, GROUP[best]) ? 'palm' : best;
}
const gi = sk.geometry.index, tri = [];
for (let f = 0; f < gi.count; f += 3) {
  const a = gi.getX(f), b = gi.getX(f + 1), c = gi.getX(f + 2);
  if (keep[a] && keep[b] && keep[c]) tri.push([local[a], local[b], local[c]]);
}

// hand length runs 0 at the wrist joint to HL at the furthest tip
let HL = 0; for (let v = 0; v < pos.count; v++) if (keep[v]) HL = Math.max(HL, local[v].dot(L));

// ---- SILHOUETTE RASTER ---------------------------------------------------
// Scan-convert the kept triangles into a boolean grid in a chosen projection,
// then read each row's occupied RUNS. Runs are what a groove actually is.
const raster = (ax, ay, N) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const T of tri) for (const p of T) {
    const x = p.dot(ax), y = p.dot(ay);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const pad = 0.02 * Math.max(x1 - x0, y1 - y0);
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  const g = new Uint8Array(N * N);
  const px = (x) => (x - x0) / (x1 - x0) * (N - 1), py = (y) => (y - y0) / (y1 - y0) * (N - 1);
  for (const T of tri) {
    const P = T.map(p => [px(p.dot(ax)), py(p.dot(ay))]);
    const minx = Math.max(0, Math.floor(Math.min(...P.map(p => p[0])))), maxx = Math.min(N - 1, Math.ceil(Math.max(...P.map(p => p[0]))));
    const miny = Math.max(0, Math.floor(Math.min(...P.map(p => p[1])))), maxy = Math.min(N - 1, Math.ceil(Math.max(...P.map(p => p[1]))));
    const [A, Bp, C] = P;
    const d = (Bp[1] - C[1]) * (A[0] - C[0]) + (C[0] - Bp[0]) * (A[1] - C[1]);
    if (Math.abs(d) < 1e-12) continue;
    for (let j = miny; j <= maxy; j++) for (let i = minx; i <= maxx; i++) {
      const l1 = ((Bp[1] - C[1]) * (i - C[0]) + (C[0] - Bp[0]) * (j - C[1])) / d;
      const l2 = ((C[1] - A[1]) * (i - C[0]) + (A[0] - C[0]) * (j - C[1])) / d;
      const l3 = 1 - l1 - l2;
      if (l1 >= -0.02 && l2 >= -0.02 && l3 >= -0.02) g[j * N + i] = 1;
    }
  }
  return { g, N, x0, x1, y0, y1 };
};
const runsOfRow = (R, j) => {
  const out = []; let s = -1;
  for (let i = 0; i < R.N; i++) {
    const on = R.g[j * R.N + i];
    if (on && s < 0) s = i;
    if ((!on || i === R.N - 1) && s >= 0) { out.push([s, on ? i : i - 1]); s = -1; }
  }
  return out.filter(([a, b]) => b - a >= 1);           // drop single-pixel specks
};
const toX = (R, i) => R.x0 + i / (R.N - 1) * (R.x1 - R.x0);
const toY = (R, j) => R.y0 + j / (R.N - 1) * (R.y1 - R.y0);

const N = 240;
const palmView = raster(Wx, L, N);                       // across the digits vs along
const sideView = raster(D, L, N);                        // through the thickness vs along

console.log('REFERENCE HAND — silhouette study');
console.log('  figure height          ', FIG.toFixed(4), '  (racer scale x' + (36.813 / FIG).toFixed(3) + ')');
console.log('  hand length  L         ', HL.toFixed(4), ' = ' + (HL / FIG * 100).toFixed(2) + '% of figure');
const bb = { w: [Infinity, -Infinity], d: [Infinity, -Infinity], l: [Infinity, -Infinity] };
for (let v = 0; v < pos.count; v++) if (keep[v]) {
  const [u, d2, l2] = uvw(local[v]);
  bb.w[0] = Math.min(bb.w[0], u); bb.w[1] = Math.max(bb.w[1], u);
  bb.d[0] = Math.min(bb.d[0], d2); bb.d[1] = Math.max(bb.d[1], d2);
  bb.l[0] = Math.min(bb.l[0], l2); bb.l[1] = Math.max(bb.l[1], l2);
}
const Wtot = bb.w[1] - bb.w[0], Dtot = bb.d[1] - bb.d[0];
console.log('  bbox  W x D x L        ', Wtot.toFixed(4), 'x', Dtot.toFixed(4), 'x', HL.toFixed(4));
console.log('  ratios (L = 1)          W=' + (Wtot / HL).toFixed(3), ' D=' + (Dtot / HL).toFixed(3));
console.log('  at racer scale (x' + (36.813 / FIG).toFixed(3) + ')  L=' + (HL * 36.813 / FIG).toFixed(2),
  ' W=' + (Wtot * 36.813 / FIG).toFixed(2), ' D=' + (Dtot * 36.813 / FIG).toFixed(2));

// ---- where the outline splits --------------------------------------------
console.log('\n  t      palmView runs (width of each, and the gaps)          sideView width');
const splitRows = [];
for (let j = 0; j < N; j++) {
  const t = (toY(palmView, j)) / HL;
  if (t < 0.02 || t > 1.01) continue;
  const rr = runsOfRow(palmView, j);
  if (!rr.length) continue;
  const widths = rr.map(([a, b]) => (toX(palmView, b) - toX(palmView, a)) / HL);
  const gaps = rr.slice(1).map(([a], k) => (toX(palmView, a) - toX(palmView, rr[k][1])) / HL);
  const sr = runsOfRow(sideView, Math.round((t * HL - sideView.y0) / (sideView.y1 - sideView.y0) * (N - 1)));
  const sd = sr.length ? (toX(sideView, sr[sr.length - 1][1]) - toX(sideView, sr[0][0])) / HL : 0;
  splitRows.push({ t, n: rr.length, widths, gaps, sd });
}
for (let k = 0; k < splitRows.length; k += 8) {
  const r = splitRows[k];
  console.log('  ' + r.t.toFixed(3).padStart(5) + '   n=' + r.n + '  w=[' + r.widths.map(x => x.toFixed(3)).join(' ') + ']' +
    (r.gaps.length ? '  gap=[' + r.gaps.map(x => x.toFixed(3)).join(' ') + ']' : '').padEnd(24) +
    '   D=' + r.sd.toFixed(3));
}
const firstSplit = splitRows.find(r => r.n >= 2);
const firstThree = splitRows.find(r => r.n >= 3);
console.log('\n  outline first splits into 2 at t =', firstSplit ? firstSplit.t.toFixed(3) : 'never');
console.log('  outline first splits into 3 at t =', firstThree ? firstThree.t.toFixed(3) : 'never');
const widest = splitRows.reduce((a, b) => (a.widths.reduce((s, x) => s + x, 0) + a.gaps.reduce((s, x) => s + x, 0)) >
  (b.widths.reduce((s, x) => s + x, 0) + b.gaps.reduce((s, x) => s + x, 0)) ? a : b);
console.log('  widest palm-view row at t =', widest.t.toFixed(3));

// ---- per digit ------------------------------------------------------------
console.log('\n  digit      root t   tip t   free past palm   axis(W,D,L)              mean radius');
const palmMaxL = Math.max(...local.filter((_, v) => owner[v] === 'palm').map(p => p.dot(L)));
for (const k of Object.keys(GROUP)) {
  const P = local.filter((_, v) => owner[v] === k);
  if (!P.length) { console.log('  ' + k + ' — no vertices'); continue; }
  const rootL = Math.min(...P.map(p => p.dot(L))), tipL = Math.max(...P.map(p => p.dot(L)));
  const root = bp(GROUP[k][0]), tip = bp(GROUP[k][1]);
  const ax = tip.clone().sub(root).normalize();
  // radius: mean distance of the digit's own vertices from its bone segment,
  // over the middle half of the digit, which is the straight part.
  let rs = [];
  for (const p of P) {
    const q = p.clone().sub(root); const alongT = q.dot(ax);
    if (alongT < 0.25 * tip.distanceTo(root) || alongT > 0.95 * tip.distanceTo(root)) continue;
    rs.push(q.clone().sub(ax.clone().multiplyScalar(alongT)).length());
  }
  const r = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
  console.log('  ' + k.padEnd(10) + ' ' + (rootL / HL).toFixed(3) + '   ' + (tipL / HL).toFixed(3) +
    '     ' + ((tipL - palmMaxL) / HL).toFixed(3).padStart(6) +
    '        (' + uvw(ax).map(x => x.toFixed(2).padStart(5)).join(',') + ')' +
    '     ' + (r / HL).toFixed(3) + '  (' + (2 * r / HL).toFixed(3) + ' across)');
}
console.log('  palm mass ends at t =', (palmMaxL / HL).toFixed(3));

// ---- the wrist: what the hand grows out of --------------------------------
if (ELBOW >= 0) {
  const FORE = [ELBOW];
  let fw = 0, fd = 0, n = 0;
  for (let v = 0; v < pos.count; v++) {
    if (wOn(v, FORE) < 0.85) continue;
    const [u, d2, l2] = uvw(local[v]);
    if (l2 > -0.18 * HL || l2 < -0.55 * HL) continue;    // a band just behind the wrist
    fw = Math.max(fw, Math.abs(u)); fd = Math.max(fd, Math.abs(d2)); n++;
  }
  console.log('\n  forearm just behind the wrist (' + n + ' verts):  W=' + (2 * fw / HL).toFixed(3) +
    '  D=' + (2 * fd / HL).toFixed(3) + '   (hand L = 1)');
  console.log('  palm/forearm  width x' + (Wtot / (2 * fw)).toFixed(2) + '   depth x' + (Dtot / (2 * fd)).toFixed(2));
}

// ---- ASCII of the palm-view silhouette, because a picture settles arguments
console.log('\n  palm-view silhouette (tips at top):');
for (let j = N - 1; j >= 0; j -= 4) {
  const t = toY(palmView, j) / HL;
  if (t < -0.02 || t > 1.02) continue;
  let s = '';
  for (let i = 0; i < N; i += 2) s += palmView.g[j * N + i] ? '#' : ' ';
  console.log('  ' + t.toFixed(2) + ' |' + s);
}
