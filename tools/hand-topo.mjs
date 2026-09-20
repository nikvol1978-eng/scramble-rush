#!/usr/bin/env node
// Fast topology read-out for the arm, for iterating on the hand build.
// The full character audit poses nine skeletons and takes a minute; this builds
// the two arms and prints what is wrong with them, which is what you need
// twenty times in a row while a new construction is being made manifold.
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const parts = await Promise.all(['02_skinmat.js','02b_rig.js','12_charanim.js']
  .map(f => readFile(resolve(root,'build/frag',f),'utf8')));
// SR_OVERRIDE rewrites the rig's constants on the way in, so a candidate can
// be scored for crossings without the fragment being edited and restored
// between each one -- which is how a half-applied candidate gets committed.
if (process.env.SR_OVERRIDE) {
  for (const [k, v] of Object.entries(JSON.parse(process.env.SR_OVERRIDE))) {
    const re = new RegExp(`(\\b${k}\\s*=\\s*)(\\[(?:[^\\[\\]]|\\[[^\\]]*\\])*\\]|[-\\d.]+)`);
    if (!re.test(parts[1])) throw new Error('constant not found: ' + k);
    parts[1] = parts[1].replace(re, `$1${Array.isArray(v) ? JSON.stringify(v) : v}`);
  }
}
const src = parts.join('\n');
const chk = await readFile(resolve(root,'build/character-checks.js'),'utf8');
const api = new Function('THREE', `
  const skinBaseColor=s=>s.color||'#eb5aa2',clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const RADIUS=17,LAND_MS=90,DIVE_GETUP_MS=500;
  let racers=[];const currentMap={slippery:false},pathAngle=()=>0,toWorld=(x,y,h)=>({x,y:h,z:y});
  ${src}\n${chk}
  return {armGeometry, characterTopology, RIG, mirrorIndex};
`)(THREE);

for (const side of [-1, 1]) {
  const A = api.armGeometry(api.RIG, side, 1, side < 0 ? 4 : 5, side < 0 ? 19 : 20, side < 0 ? 21 : 22);
  const r = api.characterTopology(A.geo, A.weights, true);
  const p = A.geo.attributes.position;
  console.log(`arm${side}  v=${r.vertices} tri=${r.triangles} vol=${r.volume.toFixed(1)}`);
  console.log(`   open=${r.open} nonManifold=${r.nonManifold} degenerate=${r.degenerate}` +
    ` dupDirected=${r.duplicateDirected} unused=${r.unused} badNormals=${r.badNormals}` +
    ` badWeights=${r.badWeights} crossings=${r.crossings}`);
  if (r.crossings && r.crossingPairs) {
    // NAME the parts. armGeometry reports where the end face and each digit
    // start, so a vertex index says which surface it belongs to -- and a pair
    // of names says whether a digit is hitting the palm, hitting its neighbour
    // or folding through itself. Those have three different fixes and a
    // coordinate distinguishes none of them.
    const NAME = ['finger-short', 'finger-long', 'thumb'];
    const part = i => {
      if (i < A.capStart) return 'sweep';
      for (let n = A.digits.length - 1; n >= 0; n--)
        if (i >= A.digits[n].start) return NAME[n] || ('digit' + n);
      return 'endface';
    };
    const tally = new Map();
    for (const [x, y] of r.crossingPairs) {
      const k = [part(x), part(y)].sort().join(' x ');
      tally.set(k, (tally.get(k) || 0) + 1);
    }
    console.log('   crossing pairs: ' + [...tally].sort((m, n) => n[1] - m[1])
      .map(([k, v]) => k + ' =' + v).join(', '));
    console.log('   first at: ' + r.crossingPoints.slice(0, 2)
      .map(q => '[' + q.map(v => v.toFixed(2)).join(',') + ']').join(' '));
  }
}
// Mirror check. build/character-checks.js carries the real index map and this
// takes it FROM THERE -- it used to say that and then keep a copy, which is
// how the tool came to be reporting a broken mirror against a map the gate had
// stopped using. A duplicated invariant is a divergent one.
const a = api.armGeometry(api.RIG,-1,1,4,19,21);
const b = api.armGeometry(api.RIG, 1,1,5,20,22);
const pa = a.geo.attributes.position, pb = b.geo.attributes.position;
if (pa.count !== pb.count) console.log(`mirror: VERTEX COUNTS DIFFER ${pa.count} vs ${pb.count}`);
else {
  const SEG = 40;
  const mirrorIndex = i => api.mirrorIndex(i, pa.count, SEG, a.rings);
  let worst = 0, wi = -1, bad = 0;
  for (let i=0;i<pa.count;i++){
    const j = mirrorIndex(i);
    const e = Math.max(Math.abs(pa.getX(i)+pb.getX(j)),
                       Math.abs(pa.getY(i)-pb.getY(j)),
                       Math.abs(pa.getZ(i)-pb.getZ(j)));
    if (e > worst) { worst = e; wi = i; }
    if (e > 1e-5) bad++;
  }
  console.log(`mirror: worst = ${worst.toExponential(3)} at vertex ${wi}` +
              `   over 1e-5: ${bad} of ${pa.count}`);
}
