#!/usr/bin/env node
// Measure the official model's HAND, to set the shape targets for ours.
//
//   node tools/reference-hand.mjs [path-to.glb]
//
// Nothing here is copied into the game. What comes out is a handful of RATIOS
// -- where along the hand the digits separate, how deep the valleys between
// them go, how the section's width and depth run -- because ratios are what
// survive a different character at a different scale, and geometry is not.
//
// The hand is isolated BY SKIN WEIGHT, not by a bounding box. A box round the
// hand of a rigged arm catches forearm too, and forearm is round and smooth and
// drags every measurement towards "it is a tube". Only vertices whose weight on
// the hand and finger joints dominates are counted.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// The model is NOT in this repository and must not be: it is someone else's
// asset, it is five megabytes, and shipping it is the thing the cleanup in
// PR #10 existed to stop. So there is no default path that works out of the
// box, deliberately -- pass one, or set SR_REFERENCE_GLB. An absolute path to
// one machine's copy was baked in here while this was being written, which is
// fine for a scratch tool and not fine for a committed one.
const GLB = process.argv[2] || process.env.SR_REFERENCE_GLB;
if (!GLB) {
  console.error('usage: node tools/reference-hand.mjs <path-to.glb>   (or set SR_REFERENCE_GLB)\n' +
    'The official model is intentionally not tracked in this repo.');
  process.exit(2);
}
const buf = await readFile(resolve(GLB));
const gltf = await new Promise((ok, no) =>
  new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', ok, no));

let skinned = null;
gltf.scene.traverse(o => { if (o.isSkinnedMesh && (!skinned || o.geometry.attributes.position.count > skinned.geometry.attributes.position.count)) skinned = o; });
if (!skinned) throw new Error('no skinned mesh in ' + GLB);
gltf.scene.updateMatrixWorld(true);

const bones = skinned.skeleton.bones;
const named = re => bones.map((b, i) => [b.name, i]).filter(([n]) => re.test(n));
console.log('digit-ish joints:', named(/finger|thumb|hand/i).map(([n, i]) => `${i}:${n}`).join('  '));

// One side only. Picking the side with the larger |x| centroid keeps us off the
// mirror plane, where a two-sided average would fold the thumb onto a finger.
const pick = re => named(re).map(([, i]) => i);
// The official rig has no joint called "hand": the digits hang straight off
// WRIST, which is also where its palm starts. Matching only /hand/ found
// nothing at all -- the name is the model's, not ours.
const handIdx = pick(/wrist|hand/i), digIdx = pick(/finger|thumb/i);
if (!handIdx.length) throw new Error('no hand joint found');

const pos = skinned.geometry.attributes.position;
const sIdx = skinned.geometry.attributes.skinIndex, sW = skinned.geometry.attributes.skinWeight;
const wOn = (v, set) => { let s = 0; for (let c = 0; c < 4; c++) if (set.includes(sIdx.getComponent(v, c))) s += sW.getComponent(v, c); return s; };

// Choose the side by whichever hand joint sits further from x=0.
const sideJoint = handIdx.map(i => ({ i, x: new THREE.Vector3().setFromMatrixPosition(bones[i].matrixWorld).x }))
  .sort((a, b) => Math.abs(b.x) - Math.abs(a.x))[0];
const sgn = Math.sign(sideJoint.x) || 1;
const mine = idx => idx.filter(i => Math.sign(new THREE.Vector3().setFromMatrixPosition(bones[i].matrixWorld).x || sgn) === sgn);
const HAND = mine(handIdx), DIG = mine(digIdx);
console.log('side x=' + sideJoint.x.toFixed(3), 'hand joints', HAND, 'digit joints', DIG);

// Hand-local frame: origin at the wrist joint, +L down the hand towards the
// digit tips, and the other two axes from the joint's own basis. Measuring in
// the bone's frame rather than the world's is what makes the numbers ratios of
// the hand instead of readings of however the model happens to be posed.
const wrist = bones[HAND[0]];
const inv = wrist.matrixWorld.clone().invert();
const tipBone = DIG.length ? bones[DIG.reduce((a, b) =>
  new THREE.Vector3().setFromMatrixPosition(bones[a].matrixWorld).distanceTo(new THREE.Vector3().setFromMatrixPosition(wrist.matrixWorld)) >
  new THREE.Vector3().setFromMatrixPosition(bones[b].matrixWorld).distanceTo(new THREE.Vector3().setFromMatrixPosition(wrist.matrixWorld)) ? a : b)] : null;
const axis = tipBone
  ? new THREE.Vector3().setFromMatrixPosition(tipBone.matrixWorld).applyMatrix4(inv).normalize()
  : new THREE.Vector3(0, -1, 0);

const keep = new Uint8Array(pos.count), local = [];
for (let v = 0; v < pos.count; v++) {
  keep[v] = (wOn(v, HAND) + wOn(v, DIG)) >= 0.85 ? 1 : 0;   // forearm and body, dropped
  // The BIND pose, deliberately: no skinning applied. Whatever animation the
  // file happens to be parked on would bend the fingers and turn a measurement
  // of the hand's shape into a measurement of one frame of a clip.
  local.push(new THREE.Vector3().fromBufferAttribute(pos, v)
    .applyMatrix4(skinned.matrixWorld).applyMatrix4(inv));
}
// TRIANGLES, not vertices. The official model is low-poly -- 2360 vertices for
// the whole character and about 340 in a hand -- so a slab three stations wide
// holds a dozen points and a polar histogram of a dozen points is noise. The
// sections below are therefore CUT: each station is a plane, every hand
// triangle crossing it contributes a segment, and the outline is read off those
// segments. That measures the surface the artist actually made, at any station,
// from a mesh this coarse.
const tri = [];
const gi = skinned.geometry.index;
for (let f = 0; f < (gi ? gi.count : pos.count); f += 3) {
  const a = gi ? gi.getX(f) : f, b = gi ? gi.getX(f + 1) : f + 1, c = gi ? gi.getX(f + 2) : f + 2;
  if (keep[a] && keep[b] && keep[c]) tri.push([local[a], local[b], local[c]]);
}
const P = [];
for (let v = 0; v < pos.count; v++) if (keep[v]) P.push({ p: local[v], wd: wOn(v, DIG) });
console.log('hand vertices kept:', P.length, ' hand triangles:', tri.length);

// Build the local basis: axis = along the hand; then the two section axes,
// oriented so +U is across the digits (the widest spread) and +V is palm-to-back.
let U = new THREE.Vector3(1, 0, 0);
if (Math.abs(U.dot(axis)) > 0.9) U.set(0, 0, 1);
U.sub(axis.clone().multiplyScalar(U.dot(axis))).normalize();
let V = new THREE.Vector3().crossVectors(axis, U).normalize();
// Orient U along the real spread: the section halfway out should be widest in U.
const spreadIn = d => { let m = 0; for (const { p } of P) { const t = p.dot(axis); if (t > 0.4 * LEN && t < 0.8 * LEN) m = Math.max(m, Math.abs(p.dot(d))); } return m; };
var LEN = P.reduce((m, { p }) => Math.max(m, p.dot(axis)), 0);
if (spreadIn(V) > spreadIn(U)) { const t = U; U = V; V = t.negate(); }

console.log('hand length along its own axis:', LEN.toFixed(4));

// Section sweep. At each station, the vertices in a thin slab are turned into a
// polar outline and reported as: half-width, half-depth, and VALLEY DIP -- the
// deepest inward notch in the outline, as a fraction of the outline's maximum.
// Valley dip is the number that says "fingers" rather than "club": a smooth
// capsule dips 0%, a hand with three digits laid side by side dips somewhere.
// Cut one station: every hand triangle crossing the plane t=const yields the
// segment where it crosses, in (U,V). The outline is then sampled by casting
// BINS rays from the section's centroid and keeping the FURTHEST crossing --
// the same thing our own generator does, so the two are directly comparable.
const cut = t => {
  const seg = [];
  for (const T of tri) {
    const d = T.map(p => p.dot(axis) - t);
    const pts = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      if ((d[i] > 0) === (d[j] > 0)) continue;
      const f = d[i] / (d[i] - d[j]);
      const q = T[i].clone().lerp(T[j], f);
      pts.push([q.dot(U), q.dot(V)]);
    }
    if (pts.length === 2) seg.push(pts);
  }
  return seg;
};
const outline = (seg, BINS) => {
  // Centre on the segment cloud, so a section that sits off the wrist axis
  // (every hand does, past the knuckles) is still sampled from inside itself.
  let cu = 0, cv = 0, n = 0;
  for (const [a, b] of seg) { cu += a[0] + b[0]; cv += a[1] + b[1]; n += 2; }
  cu /= n; cv /= n;
  const r = new Array(BINS).fill(0);
  for (let b = 0; b < BINS; b++) {
    const th = b / BINS * Math.PI * 2, dx = Math.cos(th), dy = Math.sin(th);
    for (const [A, B] of seg) {
      const ax = A[0] - cu, ay = A[1] - cv, bx = B[0] - cu, by = B[1] - cv;
      const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const s = (ax * ey - ay * ex) / den;          // along the ray
      const u = (ax * dy - ay * dx) / den;          // along the segment
      if (s > 0 && u >= 0 && u <= 1) r[b] = Math.max(r[b], s);
    }
  }
  return { r, cu, cv };
};

const STATIONS = 24;
console.log('\n  t     halfW   halfD   W/Wmax  D/Dmax  valleyDip');
const rows = [];
for (let s = 1; s < STATIONS; s++) {
  const t = LEN * s / STATIONS, seg = cut(t);
  if (seg.length < 6) continue;
  const BINS = 72, { r } = outline(seg, BINS);
  if (r.filter(v => v > 0).length < BINS * 0.9) continue;
  let hw = 0, hd = 0;
  for (const [A, B] of seg) for (const q of [A, B]) { hw = Math.max(hw, Math.abs(q[0])); hd = Math.max(hd, Math.abs(q[1])); }
  // VALLEY DIP: the deepest inward notch in the outline, as a fraction of the
  // shoulder it sits between. A smooth capsule dips 0%; digits laid side by
  // side dip by however far apart the artist set them. This is the one number
  // that separates "a hand with fingers" from "a club", and it is the number
  // our own hand has to be judged against -- ours was at 54%, which is a claw.
  let dip = 0;
  for (let b = 0; b < BINS; b++) {
    const l = r[(b - 1 + BINS) % BINS], m = r[b], hi = r[(b + 1) % BINS];
    if (!(m < l && m < hi)) continue;
    let lo = m, up = m;
    for (let i = 0; i < BINS / 2; i++) { const v = r[(b - i + BINS) % BINS]; if (v < lo) break; lo = v; }
    for (let i = 0; i < BINS / 2; i++) { const v = r[(b + i) % BINS]; if (v < up) break; up = v; }
    dip = Math.max(dip, 1 - m / Math.min(lo, up));
  }
  rows.push({ t: t / LEN, hw, hd, dip });
}
const Wmax = Math.max(...rows.map(r => r.hw)), Dmax = Math.max(...rows.map(r => r.hd));
for (const r of rows) console.log(
  `  ${r.t.toFixed(3)}  ${r.hw.toFixed(4)}  ${r.hd.toFixed(4)}  ${(r.hw / Wmax).toFixed(3)}   ${(r.hd / Dmax).toFixed(3)}   ${(r.dip * 100).toFixed(1)}%`);

const firstDip = rows.find(r => r.dip > 0.06);
console.log('\nSUMMARY');
console.log('  widest section at t =', rows.reduce((a, b) => a.hw > b.hw ? a : b).t.toFixed(3));
console.log('  digits first separate (dip > 6%) at t =', firstDip ? firstDip.t.toFixed(3) : 'never');
console.log('  deepest valley dip =', (Math.max(...rows.map(r => r.dip)) * 100).toFixed(1) + '%',
  'at t =', rows.reduce((a, b) => a.dip > b.dip ? a : b).t.toFixed(3));
console.log('  depth/width at the palm =', (rows.reduce((a, b) => a.hw > b.hw ? a : b).hd / Wmax).toFixed(3));
