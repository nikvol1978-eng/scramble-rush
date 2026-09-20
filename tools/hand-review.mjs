#!/usr/bin/env node
// Photograph the hand for review.
//
//   node tools/hand-review.mjs                      # shoot this tree
//   SR_ROOT=/path/to/other/tree SR_LABEL=v5 \
//     node tools/hand-review.mjs                    # shoot a DIFFERENT tree
//
// SR_ROOT is the whole point of the labelling: the "before" half of a
// comparison has to come from the old geometry actually running, not from the
// new generator with its constants bent back towards roughly the old shape.
// Those are not the same picture and only one of them is evidence.
//
// This does NOT drive the game. It builds the character straight out of the
// same three fragments the release is spliced from and frames a camera on the
// hand bone, because a hand that is forty pixels wide in a chase-camera shot
// cannot be judged for ribbing, and the review is about ribbing.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const HERE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ROOT = resolve(process.env.SR_ROOT || HERE);
const OUT = resolve(process.env.SR_OUT || join(HERE, 'docs', 'hand-review'));
const LABEL = process.env.SR_LABEL || 'new';
const OVERRIDE = process.env.SR_OVERRIDE ? JSON.parse(process.env.SR_OVERRIDE) : null;
const ONLY = (process.env.SR_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const W = 900, H = 900;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };

// The page. It is generated rather than kept on disk so that nothing in here
// can ever ship: it is not in build/frag, so build.py never sees it.
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#20242c;overflow:hidden}canvas{display:block}
</style></head><body><script type="module">
import * as THREE from '/node_modules/three/build/three.module.js';
window.THREE = THREE;
const frag = await Promise.all(['02_skinmat.js','02b_rig.js','12_charanim.js']
  .map(f => fetch('/build/frag/' + f).then(r => r.text())));
const api = new Function('THREE', \`
  const skinBaseColor=s=>s.color||'#eb5aa2',clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const RADIUS=17,LAND_MS=90,DIVE_GETUP_MS=500;
  let racers=[];const currentMap={slippery:false},pathAngle=()=>0,toWorld=(x,y,h)=>({x,y:h,z:y});
  \${frag.join('\\n')}
  return {makeCharacter, syncRacers,
    sync(m,state,t){racers=[{mesh:m,x:0,y:0,h:0,vh:0,vx:0,vy:0,facing:Math.PI/2,
      isPlayer:true,floorH:0,invuln:0,...state}];syncRacers(t);}};
\`)(THREE);

const renderer = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
renderer.setPixelRatio(2); renderer.setSize(${W}, ${H});
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#20242c');
// Three lights, keyed off the camera in shoot() so every view is lit the same
// way. A fixed world light makes the under shot a black rectangle and the
// reviewer then reports a black rectangle rather than a hand.
const key = new THREE.DirectionalLight(0xffffff, 2.6);
const fill = new THREE.DirectionalLight(0xbcd0ff, 0.9);
const rim = new THREE.DirectionalLight(0xffe7c4, 1.5);
scene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 0.55));
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);

const m = api.makeCharacter({ color:'#eb5aa2' });
m.neutral(); m.group.position.set(0, 17, 0);
scene.add(m.group);

const POSE = { neutral:null, idle:{}, run:{vx:4.609}, jump:{h:4,vh:8.2,stretchT:60},
               dive:{diveT:100}, fall:{falling:true,fallT:650}, landing:{landT:90} };

window.__hand = {
  // Frame on the HAND BONE's own probe, which is the hand's geometry expressed
  // in the hand bone's space -- so the framing follows the hand through a pose
  // instead of following the character's root and losing it.
  shoot(view, pose, opts = {}) {
    m.neutral(); m.group.position.set(0, 17, 0);
    if (POSE[pose]) api.sync(m, POSE[pose], 0.3);
    m.group.updateMatrixWorld(true);
    const probe = m.hands[opts.side === 'right' ? 1 : 0];
    probe.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromBufferAttribute(probe.geometry.attributes.position)
      .applyMatrix4(probe.matrixWorld);
    const c = box.getCenter(new THREE.Vector3()), R = box.getSize(new THREE.Vector3()).length() / 2;
    // The view directions are given in the HAND's frame, not the world's, so
    // "under" means the palm side of this hand in this pose and not whatever
    // happens to be underneath the character.
    const B = probe.matrixWorld.clone().setPosition(0, 0, 0);
    const dir = new THREE.Vector3(...view).normalize().applyMatrix4(B).normalize();
    const dist = (opts.wide ? 2.6 : 1.30) * R / Math.tan(Math.PI / 12);
    camera.position.copy(c).addScaledVector(dir, dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(c);
    camera.aspect = 1; camera.updateProjectionMatrix();
    const place = (l, x, y, z) => {
      l.position.copy(camera.position)
        .addScaledVector(new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion), x * dist)
        .addScaledVector(new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion), y * dist)
        .addScaledVector(dir, z * dist);
      l.target.position.copy(c); l.target.updateMatrixWorld();
      scene.add(l.target);
    };
    place(key, -0.55, 0.75, 0.1); place(fill, 0.8, -0.15, 0.2); place(rim, 0.2, 0.4, -1.4);
    // WIREFRAME shows the thing a shaded render cannot: where the stations are
    // and how the quads run. A crease is a shading artefact until you can see
    // that the rows either side of it are three times further apart than the
    // rest, and then it is a sampling decision. The outline hull is hidden for
    // it -- it is an inverted-hull shell, so wireframing it drapes a second
    // cage over the first and neither is readable.
    const undo = [];
    if (opts.wire) {
      m.group.traverse(o => {
        if (!o.isMesh || !o.material) return;
        if (o === m.outline) { undo.push([o, 'visible', o.visible]); o.visible = false; return; }
        for (const mat of (Array.isArray(o.material) ? o.material : [o.material])) {
          undo.push([mat, 'wireframe', mat.wireframe]);
          mat.wireframe = true;
        }
      });
    }
    renderer.render(scene, camera);
    for (const [obj, key2, was] of undo) obj[key2] = was;
    return true;
  },
  // PRODUCTION FRAMING. The lobby stands the racer front-on at roughly the
  // distance the menu preview uses; the Locker is the same racer about twice as
  // close and turned, which is the nearest the shipping game ever puts a camera
  // to a hand. These are the shots the hand is judged at -- a close-up proves
  // the geometry, these prove it SURVIVES to the screen.
  shootChar(angle, pose, zoom, lift) {
    m.neutral(); m.group.position.set(0, 17, 0);
    if (POSE[pose]) api.sync(m, POSE[pose], 0.3);
    m.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m.group);
    const c = box.getCenter(new THREE.Vector3()), R = box.getSize(new THREE.Vector3()).length() / 2;
    c.y += (lift || 0) * R;
    const dir = new THREE.Vector3(Math.sin(angle), 0.12, Math.cos(angle)).normalize();
    const dist = zoom * 1.5 * R / Math.tan(Math.PI / 12);
    camera.position.copy(c).addScaledVector(dir, dist);
    camera.up.set(0, 1, 0); camera.lookAt(c);
    camera.aspect = 1; camera.updateProjectionMatrix();
    key.position.copy(c).add(new THREE.Vector3(-R*2, R*3, R*2.5)); key.target.position.copy(c);
    fill.position.copy(c).add(new THREE.Vector3(R*3, 0, R*1.5)); fill.target.position.copy(c);
    rim.position.copy(c).add(new THREE.Vector3(0, R, -R*3)); rim.target.position.copy(c);
    for (const l of [key, fill, rim]) { l.target.updateMatrixWorld(); scene.add(l.target); }
    renderer.render(scene, camera);
    return true;
  },
  // The whole racer, for the contact sheet: same lighting, framed on the body.
  shootFull(angle, pose) {
    m.neutral(); m.group.position.set(0, 17, 0);
    if (POSE[pose]) api.sync(m, POSE[pose], 0.3);
    m.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m.group);
    const c = box.getCenter(new THREE.Vector3()), R = box.getSize(new THREE.Vector3()).length() / 2;
    const dir = new THREE.Vector3(Math.sin(angle), 0.18, Math.cos(angle)).normalize();
    const dist = 1.5 * R / Math.tan(Math.PI / 12);
    camera.position.copy(c).addScaledVector(dir, dist);
    camera.up.set(0, 1, 0); camera.lookAt(c);
    camera.aspect = 1; camera.updateProjectionMatrix();
    key.position.copy(c).add(new THREE.Vector3(-R*2, R*3, R*2.5)); key.target.position.copy(c);
    fill.position.copy(c).add(new THREE.Vector3(R*3, 0, R*1.5)); fill.target.position.copy(c);
    rim.position.copy(c).add(new THREE.Vector3(0, R, -R*3)); rim.target.position.copy(c);
    for (const l of [key, fill, rim]) { l.target.updateMatrixWorld(); scene.add(l.target); }
    renderer.render(scene, camera);
    return true;
  },
};
window.__ready = true;
<\/script></body></html>`;

let server, browser;
const bye = async () => {
  if (browser) { try { await browser.close(); } catch { /* gone */ } }
  if (server) { try { await new Promise(r => server.close(r)); } catch { /* gone */ } }
};

const serve = () => new Promise((ok, fail) => {
  server = createServer(async (req, res) => {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]);
    if (rel === '/') { res.writeHead(200, { 'Content-Type': MIME['.html'] }); res.end(PAGE); return; }
    if (rel === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    // three comes from THIS tree's node_modules even when SR_ROOT points
    // elsewhere: the old tree is being shot for its GEOMETRY, and an old
    // checkout may not have its modules installed at all.
    const base = rel.startsWith('/node_modules/') ? HERE : ROOT;
    const full = resolve(base, rel.replace(/^\/+/, ''));
    if (full !== base && !full.startsWith(base + sep)) { res.writeHead(403); res.end(); return; }
    try {
      let body = await readFile(full);
      // SR_OVERRIDE rewrites the rig's constants on their way to the browser,
      // so a handful of candidates can be photographed without the file being
      // edited and restored between each one -- which is how a half-applied
      // candidate ends up committed. Same substitution the sweep uses, so a
      // row in the sweep table and a picture from here are the same hand.
      if (OVERRIDE && rel.endsWith('02b_rig.js')) {
        let src = body.toString('utf8');
        for (const [k, v] of Object.entries(OVERRIDE)) {
          // one level of nesting: DIG_DIR and DIG_HOLE are arrays OF arrays, and
          // [^\]]* stops at the first inner ']', rewriting a fragment of the
          // value into something that parses and is not what was asked for.
          const re = new RegExp(`(\\b${k}\\s*=\\s*)(\\[(?:[^\\[\\]]|\\[[^\\]]*\\])*\\]|[-\\d.]+)`);
          if (!re.test(src)) throw new Error('constant not found: ' + k);
          src = src.replace(re, `$1${Array.isArray(v) ? JSON.stringify(v) : v}`);
        }
        body = Buffer.from(src, 'utf8');
      }
      res.writeHead(200, { 'Content-Type': MIME[extname(full)] || 'application/octet-stream' });
      res.end(body);
    } catch (e) { res.writeHead(404); res.end('not found: ' + e.message); }
  });
  server.on('error', fail);
  server.listen(0, '127.0.0.1', () => ok(server.address().port));
});

// view directions in the hand's own frame. -Y is down the hand towards the
// digits, so a camera on +Y would be looking at the wrist; these all look at
// the hand from the side of it or from in front of the digits.
// THE DIGITS ARE SPREAD ALONG X, so a view down X looks along the fan and the
// three of them hide behind each other -- the first "3/4" here was 0.85 of X
// and it photographed a mitten every time, whatever the geometry underneath
// was doing. Every view that is meant to show fingers therefore leads with Z,
// which is the face they are spread across, and the 3/4 is a third of a turn
// off that rather than most of the way round to the side.
const VIEWS = {
  // V13 ROLLED THE HAND, AND EVERY VIEW HERE MOVED WITH IT.
  //
  // The digits used to be spread along X, so these directions led with Z to
  // see the fan. They are spread along Z now -- which is the whole point of
  // the roll, because it is what the official figure does and it is what stops
  // the hand fanning at a front camera -- so the face they are spread across
  // is normal to X, and every view meant to SHOW fingers leads with X.
  //
  // The X components are NEGATIVE because these frame hands[0], the LEFT hand,
  // and for that one outboard is -X. A camera at +X sits on the far side of
  // the body and photographs the torso with a hand behind it.
  //
  // 'front' deliberately still points down Z. That one is the production
  // camera, and what it is for is proving the hand reads as a compact mass
  // from there, not showing the fingers off.
  'hand-v9-front':     { view: [0, -0.30, 1], pose: 'neutral' },
  'hand-v9-palm':      { view: [-1, -0.20, 0.10], pose: 'neutral' },
  'hand-v9-back':      { view: [1, -0.20, 0.55], pose: 'neutral' },
  'hand-v9-34':        { view: [-0.86, -0.26, 0.52], pose: 'neutral' },
  'hand-v9-34b':       { view: [-0.80, -0.26, -0.56], pose: 'neutral' },
  'hand-v9-side':      { view: [0.10, -0.12, 1], pose: 'neutral' },
  'hand-v9-under':     { view: [-0.55, -0.78, 0.26], pose: 'neutral' },
  'hand-v9-end':       { view: [-0.22, -0.94, 0.18], pose: 'neutral' },
  'hand-v9-dive':      { view: [-0.86, -0.26, 0.52], pose: 'dive' },
  'hand-v9-jump':      { view: [-0.86, -0.26, 0.52], pose: 'jump' },
  'hand-v9-run':       { view: [-0.86, -0.26, 0.52], pose: 'run' },
  'hand-v9-wireframe': { view: [-0.86, -0.26, 0.52], pose: 'neutral', wire: true },
};

async function main() {
  await mkdir(OUT, { recursive: true });
  const port = await serve();
  console.log(`serving ${ROOT}  (label: ${LABEL})`);
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--mute-audio'],
    defaultViewport: { width: W, height: H }, protocolTimeout: 600000,
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e && e.message || e)));
  page.on('console', e => { if (e.type() === 'error') errs.push(e.text()); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction('window.__ready === true', { timeout: 180000 });

  const suffix = LABEL === 'new' ? '' : `-${LABEL}`;
  for (const [name, spec] of Object.entries(VIEWS)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    await page.evaluate((v, p, o) => window.__hand.shoot(v, p, o), spec.view, spec.pose,
                       { wire: !!spec.wire });
    const file = join(OUT, `${name}${suffix}.png`);
    await page.screenshot({ path: file });
    console.log('  ' + file);
  }
  // The contact sheet: the whole racer, so a hand pass can be checked for
  // having quietly changed something that is not a hand.
  for (const [name, spec] of Object.entries({
    'hand-v9-lobby':  { angle: 0,    zoom: 1.00, lift: -0.10 },
    'hand-v9-locker': { angle: 0.62, zoom: 0.55, lift: -0.16 },
  })) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    await page.evaluate((a, z, l) => window.__hand.shootChar(a, 'neutral', z, l),
                        spec.angle, spec.zoom, spec.lift);
    const file = join(OUT, `${name}${suffix}.png`);
    await page.screenshot({ path: file });
    console.log('  ' + file);
  }
  if (ONLY.length) return;
  for (const [i, pose] of ['neutral', 'run', 'jump', 'dive'].entries()) {
    for (const [j, ang] of [0, Math.PI * 0.75].entries()) {
      await page.evaluate((a, p) => window.__hand.shootFull(a, p), ang, pose);
      const file = join(OUT, `character-v9-${pose}-${j ? '34' : 'front'}${suffix}.png`);
      await page.screenshot({ path: file });
      console.log('  ' + file);
    }
  }
  if (errs.length) { console.error('PAGE ERRORS:\n  ' + errs.join('\n  ')); process.exitCode = 1; }
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(bye);
