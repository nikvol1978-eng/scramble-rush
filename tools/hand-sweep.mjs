#!/usr/bin/env node
// Sweep the hand's shape constants and score each candidate, so the choice
// between "clearly fingered" and "soft and rounded" is made on numbers instead
// of on which render happened to be looked at first.
//
//   node tools/hand-sweep.mjs
//
// Each candidate is the shipping fragment with a few constants substituted --
// not a reimplementation of the generator, which would let the sweep and the
// game drift apart. Scores:
//
//   railP95 / railMax  the angular-direction dihedral. This is the ribbing and
//                      the pinched valleys. A section sampled 40 ways round
//                      that is genuinely smooth sits near 9 degrees; anything
//                      past about 30 is a fold the eye finds.
//   ringP95            the lengthwise dihedral: banding across the hand.
//   dip                the deepest groove between digits, as a fraction of the
//                      ring's radius. Too little and it is a mitten with no
//                      fingers; too much and it is a claw. V5 shipped 54%.
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = ['02_skinmat.js', '02b_rig.js', '12_charanim.js'];
const [skin, rigSrc, anim] = await Promise.all(files.map(f => readFile(resolve(root, 'build/frag', f), 'utf8')));

const SEG = 40;
const build = over => {
  let rig = rigSrc;
  for (const [k, v] of Object.entries(over)) {
    const re = new RegExp(`(\\b${k}\\s*=\\s*)(\\[[^\\]]*\\]|[-\\d.]+)`);
    if (!re.test(rig)) throw new Error('constant not found: ' + k);
    rig = rig.replace(re, `$1${Array.isArray(v) ? JSON.stringify(v) : v}`);
  }
  const api = new Function('THREE', `
    const skinBaseColor=s=>s.color||'#eb5aa2',clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    const RADIUS=17,LAND_MS=90,DIVE_GETUP_MS=500;
    let racers=[];const currentMap={slippery:false},pathAngle=()=>0,toWorld=(x,y,h)=>({x,y:h,z:y});
    ${skin}\n${rig}\n${anim}
    return {armGeometry,RIG};
  `)(THREE);
  return api.armGeometry(api.RIG, 1, 1, 4, 19, 21);
};

const score = A => {
  const p = A.geo.attributes.position, RINGS = (p.count - 2) / SEG;
  const gv = (j, k) => 1 + j*SEG + ((k % SEG) + SEG) % SEG;
  const V = i => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
  const y0 = V(gv(0,0)).y, y1 = V(gv(RINGS-1,0)).y;
  const hand = j => (V(gv(j,0)).y - y0) / (y1 - y0) > 0.78;
  const fn = (a,b,c) => new THREE.Vector3().subVectors(V(b),V(a))
    .cross(new THREE.Vector3().subVectors(V(c),V(a))).normalize();
  const dih = (t1,t2) => Math.acos(THREE.MathUtils.clamp(fn(...t1).dot(fn(...t2)), -1, 1)) * 180/Math.PI;
  const triA = (j,k) => [gv(j,k), gv(j+1,k+1), gv(j+1,k)];
  const triB = (j,k) => [gv(j,k), gv(j,k+1), gv(j+1,k+1)];
  const rail = [], ring = [];
  for (let j = 0; j < RINGS-1; j++) {
    if (!hand(j) || !hand(j+1)) continue;
    for (let k = 0; k < SEG; k++) {
      rail.push(dih(triA(j,k), triB(j,k-1)));
      if (j > 0 && hand(j-1)) ring.push(dih(triB(j,k), triA(j-1,k)));
    }
  }
  const q = (arr, f) => { const s = [...arr].sort((a,b)=>a-b); return s[Math.min(s.length-1, Math.floor(f*s.length))]; };
  // GROOVE DEPTH, and only groove depth. Reading off local minima of the raw
  // radius counts the section's OWN FLATNESS as a valley -- an ellipse 3.12 by
  // 2.44 has a 22% "dip" at each end of its minor axis and no fingers at all,
  // which is most of what the first version of this measurement was reporting.
  // So the elliptical part is removed first: fit the constant and the second
  // harmonic, which between them are exactly an ellipse, and measure how far
  // the surface falls BELOW that fit. What is left is the grooves.
  let dip = 0, dipAt = 0, grooved = 0, handRings = 0;
  for (let j = 0; j < RINGS; j++) {
    if (!hand(j)) continue;
    handRings++;
    let cx = 0, cz = 0;
    for (let k = 0; k < SEG; k++) { const v = V(gv(j,k)); cx += v.x; cz += v.z; }
    cx /= SEG; cz /= SEG;
    const r = [], th = [];
    for (let k = 0; k < SEG; k++) {
      const v = V(gv(j,k));
      r.push(Math.hypot(v.x-cx, v.z-cz));
      th.push(Math.atan2(v.z-cz, v.x-cx));
    }
    let a0 = 0, a2 = 0, b2 = 0;
    for (let k = 0; k < SEG; k++) { a0 += r[k]; a2 += r[k]*Math.cos(2*th[k]); b2 += r[k]*Math.sin(2*th[k]); }
    a0 /= SEG; a2 = 2*a2/SEG; b2 = 2*b2/SEG;
    let here = 0;
    for (let k = 0; k < SEG; k++) {
      const fit = a0 + a2*Math.cos(2*th[k]) + b2*Math.sin(2*th[k]);
      here = Math.max(here, 1 - r[k]/fit);
    }
    if (here > dip) { dip = here; dipAt = j; }
    // RUN: the share of the hand's length that has a groove worth seeing at
    // all. The peak alone is not enough and tuning on it produced a smooth
    // paddle with three faint dimples on the very end -- one ring deep, which
    // scores well and does not read as a hand. A digit has to run back a real
    // distance before it is a digit.
    if (here >= 0.08) grooved++;
  }
  // A generous fillet rounds the valleys, and it also INFLATES: a smooth
  // maximum is never less than a maximum. Unwatched, that turns the hand back
  // into the blob this whole pass exists to get rid of, so the widest section
  // is reported beside the smoothness and has to stay near the profile table's
  // own 3.14.
  let wide = 0;
  for (let j = 0; j < RINGS; j++) {
    if (!hand(j)) continue;
    for (let k = 0; k < SEG; k++) wide = Math.max(wide, Math.abs(V(gv(j,k)).x - V(gv(j,0)).x*0));
  }
  return { railP95: q(rail,.95), railMax: Math.max(...rail), ringP95: q(ring,.95),
           ringMax: Math.max(...ring), dip: dip*100, dipAt, wide, verts: p.count,
           run: 100*grooved/handRings };
};

const CASES = [];
// EMPTY on purpose: every constant not named in the grid comes from the
// fragment as it currently stands. A baseline hard-coded here drifts away
// from the file the moment a value is settled, and then the sweep is
// scoring a hand that nobody is going to ship.
const base = {};
const grid = JSON.parse(process.env.SR_GRID || 'null') || {
  DIG_FILLET: [1.3, 1.8, 2.4, 3.2],
  DIG_SPREAD: [0.54, 0.62, 0.70],
};
const keys = Object.keys(grid);
const walk = (i, over, name) => {
  if (i === keys.length) return CASES.push({ name: name.trim(), over });
  for (const v of grid[keys[i]])
    walk(i+1, { ...over, [keys[i]]: v }, `${name} ${keys[i].replace('DIG_','')} ${JSON.stringify(v)}`);
};
walk(0, base, '');

console.log('candidate                           railP95  railMax  ringP95  ringMax    dip    run   wide');
for (const c of CASES) {
  let s;
  try { s = score(build(c.over)); }
  catch (e) { console.log(c.name.padEnd(35), "FAILED", e.message); continue; }
  console.log(c.name.padEnd(35),
    s.railP95.toFixed(1).padStart(7), s.railMax.toFixed(1).padStart(8),
    s.ringP95.toFixed(1).padStart(8), s.ringMax.toFixed(1).padStart(8),
    s.dip.toFixed(1).padStart(7), s.run.toFixed(0).padStart(6)+'%', s.wide.toFixed(2).padStart(7));
}
