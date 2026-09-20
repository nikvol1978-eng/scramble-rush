#!/usr/bin/env node
// Prove the hand pass changed the HAND and nothing else.
//
//   node tools/hand-freeze-proof.mjs [baseline-frag-dir]
//
// The default baseline is HEAD, checked out to a scratch directory. Every mesh
// of the character is built twice -- once from the baseline fragments, once
// from the working tree -- and compared vertex by vertex. A mesh that differs
// anywhere is reported with the size of the largest difference; a mesh that
// matches is reported as frozen.
//
// Why not just quote the sole height and the face clearance: those are two
// scalars, and two scalars agreeing is not the same claim as "the feet did not
// move". A foot can be reshaped without its lowest point changing height. This
// compares the actual vertices, which is the claim that was being made.
import * as THREE from 'three';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve(import.meta.dirname, '..');
const FILES = ['02_skinmat.js', '02b_rig.js', '12_charanim.js'];

const baseDir = process.argv[2] || await (async () => {
  const d = join(tmpdir(), 'sr-freeze-' + process.pid);
  await mkdir(d, { recursive: true });
  for (const f of FILES) {
    const buf = execFileSync('git', ['show', `HEAD:build/frag/${f}`], { cwd: ROOT, maxBuffer: 1 << 28 });
    await writeFile(join(d, f), buf);
  }
  return d;
})();

const load = async dir => {
  const src = (await Promise.all(FILES.map(f => readFile(join(dir, f), 'utf8')))).join('\n');
  return new Function('THREE', `
    const skinBaseColor=s=>s.color||'#eb5aa2',clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    const RADIUS=17,LAND_MS=90,DIVE_GETUP_MS=500;
    let racers=[];const currentMap={slippery:false},pathAngle=()=>0,toWorld=(x,y,h)=>({x,y:h,z:y});
    ${src}
    return {makeCharacter, armGeometry, lowerLimbGeometry, RIG};
  `)(THREE);
};

const A = await load(baseDir), B = await load(join(ROOT, 'build/frag'));

// ---- 1. the limbs, separately: legs must be identical, arms are the change --
// Built straight from the generators rather than through characterLimbs(),
// which lives in build/character-checks.js and is not one of the fragments
// this compares -- pulling it in would mean comparing two different checks
// files as well, and the point here is the geometry.
const limbs = api => [-1, 1].flatMap((side, i) => [
  { name: 'arm' + side, geo: api.armGeometry(api.RIG, side, 1, 4 + i, 19 + i, 21 + i).geo },
  { name: 'leg' + side, geo: api.lowerLimbGeometry(api.RIG, side, 2 + i, 15 + i, 17 + i).geo },
]);
const la = limbs(A), lb = limbs(B);
const cmp = (ga, gb) => {
  const pa = ga.attributes.position, pb = gb.attributes.position;
  if (pa.count !== pb.count) return { same: false, why: `${pa.count} vs ${pb.count} vertices` };
  let worst = 0;
  for (let i = 0; i < pa.count; i++)
    worst = Math.max(worst, Math.abs(pa.getX(i) - pb.getX(i)),
                            Math.abs(pa.getY(i) - pb.getY(i)),
                            Math.abs(pa.getZ(i) - pb.getZ(i)));
  return { same: worst === 0, worst };
};
console.log('LIMBS (built directly, before any merge)');
for (let i = 0; i < la.length; i++) {
  const r = cmp(la[i].geo, lb[i].geo);
  console.log(`  ${la[i].name.padEnd(7)} ${r.same ? 'FROZEN — identical' :
    (r.why || `CHANGED — largest vertex move ${r.worst.toFixed(4)}`)}`);
}

// ---- 2. every mesh of the assembled character ------------------------------
const ma = A.makeCharacter({ color: '#eb5aa2' }), mb = B.makeCharacter({ color: '#eb5aa2' });
ma.neutral(); mb.neutral();
const meshes = m => { const out = []; m.group.traverse(o => { if (o.isMesh && o.geometry?.attributes?.position) out.push(o); }); return out; };
const A2 = meshes(ma), B2 = meshes(mb);
console.log(`\nASSEMBLED CHARACTER (${A2.length} meshes)`);
if (A2.length !== B2.length) console.log(`  MESH COUNT CHANGED: ${A2.length} -> ${B2.length}`);
let frozen = 0, changed = [];
for (let i = 0; i < Math.min(A2.length, B2.length); i++) {
  const r = cmp(A2[i].geometry, B2[i].geometry);
  const name = A2[i].name || `mesh[${i}]`;
  if (r.same) frozen++; else changed.push(`${name}: ${r.why || 'largest vertex move ' + r.worst.toFixed(4)}`);
}
console.log(`  frozen: ${frozen}`);
for (const c of changed) console.log(`  changed: ${c}`);

// ---- 3. the named parts the brief froze ------------------------------------
// The merged trim carries the limbs AND the face, so "the face did not move"
// has to be asked of the face's own probes rather than of the merge.
console.log('\nNAMED PARTS');
const part = (k, ga, gb) => {
  if (!ga || !gb) return console.log(`  ${k.padEnd(16)} no geometry of its own (a group) — see its meshes above`);
  const r = cmp(ga, gb);
  console.log(`  ${k.padEnd(16)} ${r.same ? 'FROZEN — identical' : (r.why || 'CHANGED — ' + r.worst.toFixed(4))}`);
};
// A group rather than a mesh: compare everything hanging off it instead, so
// "the face is frozen" is not resting on a line that silently did nothing.
const sub = (k, ga, gb) => {
  const gs = g => { const o = []; g?.traverse?.(x => { if (x.isMesh && x.geometry?.attributes?.position) o.push(x); }); return o; };
  const a2 = gs(ga), b2 = gs(gb);
  if (!a2.length) return console.log(`  ${k.padEnd(16)} no meshes found`);
  const bad = a2.map((m, i) => b2[i] && cmp(m.geometry, b2[i].geometry)).filter(r => !r || !r.same);
  console.log(`  ${k.padEnd(16)} ${bad.length ? `CHANGED in ${bad.length} of ${a2.length}` :
    `FROZEN — all ${a2.length} meshes identical`}`);
};
part('facePlate', ma.facePlate?.geometry, mb.facePlate?.geometry);
sub('faceGroup', ma.faceGroup, mb.faceGroup);
sub('head', ma.head, mb.head);
// The eyes are separate meshes hung off the face group; naming them one by one
// says so explicitly rather than leaving them inside a count.
for (const k of ['pupils', 'scleras'])
  for (const [i, m] of (ma[k] || []).entries())
    part(`${k}[${i}]`, m?.geometry, mb[k]?.[i]?.geometry);
part('body(bean)', ma.body?.geometry, mb.body?.geometry);
for (const [i, f] of (ma.feet || []).entries()) part(`foot[${i}]`, f.geometry, mb.feet[i]?.geometry);
for (const [i, h] of (ma.hands || []).entries()) part(`handProbe[${i}]`, h.geometry, mb.hands[i]?.geometry);
console.log(`\nbaseline: ${baseDir === process.argv[2] ? baseDir : 'HEAD'}`);
