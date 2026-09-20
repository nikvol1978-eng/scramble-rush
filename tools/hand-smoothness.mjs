// Measures the three defects reported against the V5 hand, as numbers.
//
// The arm is a ring grid: RING_S stations x SEG segments, plus two apexes.
// That gives every interior quad two kinds of edge, and the two kinds fail in
// two different directions:
//
//   RAIL edges run ALONG the hand, station j to station j+1 at the same angle.
//   The dihedral across a rail edge is the surface bending in the ANGULAR
//   direction, so a crease that runs down the length of a digit -- the
//   "longitudinal ribbing" -- is a rail-edge dihedral spike.
//
//   RING edges run AROUND the hand at one station. The dihedral across a ring
//   edge is bending along the length, so "banding" across the hand is a
//   ring-edge spike.
//
// Reporting one roughness number would average the two together and hide which
// one is actually wrong. They are kept apart.
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const frag = process.argv[2] || resolve(root, 'build/frag');
const source = (await Promise.all(['02_skinmat.js','02b_rig.js','12_charanim.js']
  .map(f => readFile(resolve(frag, f), 'utf8')))).join('\n');

const api = new Function('THREE', `
  const skinBaseColor=s=>s.color||'#eb5aa2',clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const RADIUS=17,LAND_MS=90,DIVE_GETUP_MS=500;
  let racers=[];const currentMap={slippery:false},pathAngle=()=>0,toWorld=(x,y,h)=>({x,y:h,z:y});
  ${source}
  return {armGeometry,RIG};
`)(THREE);

const A = api.armGeometry(api.RIG, 1, 1, 4, 19, 21);
const p = A.geo.attributes.position, idx = A.geo.index.array;
const SEG = 40;
// vertex 0 is the root apex; the last is the tip apex; the grid is between.
const nGrid = p.count - 2, RINGS = nGrid / SEG;
if (!Number.isInteger(RINGS)) throw new Error('grid is not ' + SEG + '-wide: ' + nGrid);

const V = i => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
const gv = (j, k) => 1 + j*SEG + ((k % SEG) + SEG) % SEG;

// Station parameter is not exported, so the hand is found geometrically: the
// grid marches down -y, and the hand is the last HAND_FRAC of that run.
const y0 = V(gv(0,0)).y, y1 = V(gv(RINGS-1,0)).y;
const handFrom = j => (V(gv(j,0)).y - y0) / (y1 - y0) > 0.78;

const faceN = (a,b,c) => new THREE.Vector3().subVectors(V(b),V(a))
  .cross(new THREE.Vector3().subVectors(V(c),V(a))).normalize();

// The quad (j,k)-(j+1,k)-(j+1,k+1)-(j,k+1) is emitted as the two triangles
// below, which is the same split armGeometry uses.
const triA = (j,k) => [gv(j,k),   gv(j+1,k+1), gv(j+1,k)];
const triB = (j,k) => [gv(j,k),   gv(j,k+1),   gv(j+1,k+1)];

const deg = v => v * 180 / Math.PI;
const dihedral = (t1, t2) => {
  const n1 = faceN(...t1), n2 = faceN(...t2);
  return deg(Math.acos(THREE.MathUtils.clamp(n1.dot(n2), -1, 1)));
};

const rail = [], ring = [];
for (let j = 0; j < RINGS-1; j++) {
  if (!handFrom(j) || !handFrom(j+1)) continue;
  for (let k = 0; k < SEG; k++) {
    // rail edge gv(j,k)-gv(j+1,k): triB of the quad to its left, triA of this one
    rail.push({j, k, d: dihedral(triA(j,k), triB(j,k-1))});
    // ring edge gv(j,k)-gv(j,k+1) is shared by triB(j,k) and triA(j-1,k)
    if (j > 0 && handFrom(j-1)) ring.push({j, k, d: dihedral(triB(j,k), triA(j-1,k))});
  }
}

const stat = (rows, label) => {
  const d = rows.map(r => r.d).sort((a,b) => a-b);
  const q = f => d[Math.min(d.length-1, Math.floor(f*d.length))];
  const worst = [...rows].sort((a,b) => b.d-a.d).slice(0,6);
  console.log(`${label}  n=${d.length}  mean=${(d.reduce((s,v)=>s+v,0)/d.length).toFixed(2)}`
    + `  p50=${q(.5).toFixed(2)}  p95=${q(.95).toFixed(2)}  p99=${q(.99).toFixed(2)}  max=${d[d.length-1].toFixed(2)}`);
  console.log('   worst: ' + worst.map(w => `j${w.j}k${w.k}=${w.d.toFixed(1)}`).join('  '));
};

console.log(`hand grid: ${RINGS} rings total, ${rail.length/SEG|0} hand stations x ${SEG} segments`);
stat(rail, 'RAIL  (angular bend -> longitudinal ribbing)');
stat(ring, 'RING  (lengthwise bend -> transverse banding)');

// A crease that runs down a digit shows up as the SAME k being worst on many
// consecutive stations. Counting that directly is more honest than a maximum,
// which one bad quad can produce on its own.
const perK = new Array(SEG).fill(0);
for (const r of rail) perK[r.k] = Math.max(perK[r.k], r.d);
const hot = perK.map((d,k) => ({k,d})).sort((a,b) => b.d-a.d).slice(0,8);
console.log('per-segment worst rail dihedral (a persistent ridge line shows here):');
console.log('   ' + hot.map(h => `k${h.k}=${h.d.toFixed(1)}`).join('  '));

// VALLEY DIP, station by station. The grooves are what make the hand read as
// fingered and the dihedral figures above are what make it read as soft, and
// the two pull against each other -- so both have to be on screen at once, or
// tuning one silently wrecks the other. Dip is read off the ring's own radius
// profile: for each local minimum, how far it sits below the lower of the two
// shoulders beside it.
const dipOf = j => {
  let cx = 0, cz = 0;
  for (let k = 0; k < SEG; k++) { const v = V(gv(j,k)); cx += v.x; cz += v.z; }
  cx /= SEG; cz /= SEG;
  const r = [];
  for (let k = 0; k < SEG; k++) { const v = V(gv(j,k)); r.push(Math.hypot(v.x-cx, v.z-cz)); }
  let dip = 0;
  for (let k = 0; k < SEG; k++) {
    const m = r[k];
    if (!(m < r[(k-1+SEG)%SEG] && m < r[(k+1)%SEG])) continue;
    let lo = m, hi = m;
    for (let i = 0; i < SEG/2; i++) { const v = r[(k-i+SEG)%SEG]; if (v < lo) break; lo = v; }
    for (let i = 0; i < SEG/2; i++) { const v = r[(k+i)%SEG]; if (v < hi) break; hi = v; }
    dip = Math.max(dip, 1 - m/Math.min(lo, hi));
  }
  return dip;
};
const dips = [];
for (let j = 0; j < RINGS; j++) if (handFrom(j)) dips.push({ j, d: dipOf(j) });
const peak = dips.reduce((a, b) => a.d > b.d ? a : b);
console.log(`valley dip: peak ${(peak.d*100).toFixed(1)}% at ring j${peak.j}   profile: `
  + dips.filter((_, i) => i % 2 === 0).map(x => (x.d*100).toFixed(0)).join(' '));
