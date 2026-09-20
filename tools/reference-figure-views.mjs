#!/usr/bin/env node
// The official model AS A WHOLE FIGURE, at the distances the game is played at.
//
//   SR_REFERENCE_GLB=<path.glb> node tools/reference-figure-views.mjs
//
// tools/reference-hand-views.mjs isolates the hand and fills the frame with
// it, which answers "what shape is that hand" and answers nothing about the
// question the production gate actually asks: what does it look like when it
// is forty pixels wide and attached to a body. It also loses the hand's
// ORIENTATION -- which way the digits are spread relative to the camera -- and
// that turns out to decide whether a hand reads as a hand or as a pincer.
//
// The model stays out of the repository and nothing here is copied into the
// game: these are reference photographs, the same as looking at it in a viewer.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const HERE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const GLB = process.env.SR_REFERENCE_GLB || process.argv[2];
if (!GLB) { console.error('need SR_REFERENCE_GLB or argv[1]'); process.exit(2); }
const OUT = resolve(process.env.SR_OUT || join(HERE, 'docs', 'hand-review', 'reference'));
const W = 900, H = 900;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
 html,body{margin:0;background:#1b1f27;overflow:hidden}canvas{display:block}
</style>
<script type="importmap">
{"imports":{"three":"/node_modules/three/build/three.module.js",
            "three/":"/node_modules/three/"}}
</script>
</head><body><script type="module">
import * as THREE from '/node_modules/three/build/three.module.js';
import { GLTFLoader } from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

const buf = await (await fetch('/glb')).arrayBuffer();
const gltf = await new Promise((ok,no)=>new GLTFLoader().parse(buf,'',ok,no));
gltf.scene.updateMatrixWorld(true);
let sk=null; gltf.scene.traverse(o=>{ if(o.isSkinnedMesh &&
  (!sk||o.geometry.attributes.position.count>sk.geometry.attributes.position.count)) sk=o; });

// THE IDLE POSE, not whatever frame the file is parked on. FG_Idle_A at t=0 is
// what every other measurement in this repo was taken against.
const clip = gltf.animations.find(a=>/idle/i.test(a.name)) || gltf.animations[0];
if(clip){ const mx=new THREE.AnimationMixer(gltf.scene); mx.clipAction(clip).play(); mx.setTime(0); }
gltf.scene.updateMatrixWorld(true);

const scene=new THREE.Scene(); scene.background=new THREE.Color('#1b1f27');
scene.add(gltf.scene);
// flat-ish lighting, so the read is silhouette and form rather than specular
const key=new THREE.DirectionalLight(0xffffff,2.2), fill=new THREE.DirectionalLight(0xbcd0ff,.9),
      rim=new THREE.DirectionalLight(0xffe7c4,1.2);
scene.add(key,fill,rim,new THREE.AmbientLight(0xffffff,.55));
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(2); renderer.setSize(${W},${H});
document.body.appendChild(renderer.domElement);
const cam=new THREE.PerspectiveCamera(30,1,.001,200);

const box=new THREE.Box3().setFromObject(gltf.scene);
const c=box.getCenter(new THREE.Vector3()), size=box.getSize(new THREE.Vector3());
// how many figure-heights back the camera sits: 2.4 is roughly the lobby, 1.0
// is roughly the Locker
window.__shot=(dir,heights)=>{
  const d=new THREE.Vector3(...dir).normalize();
  cam.position.copy(c).addScaledVector(d, size.y*heights);
  cam.up.set(0,1,0); cam.lookAt(c); cam.updateProjectionMatrix();
  for(const [l,o] of [[key,[-.6,.8,.9]],[fill,[.9,-.2,.6]],[rim,[.1,.4,-1.2]]]){
    l.position.copy(c).addScaledVector(new THREE.Vector3(o[0],o[1],o[2]).normalize(), size.y*3);
    l.target.position.copy(c); l.target.updateMatrixWorld(); scene.add(l.target);
  }
  renderer.render(scene,cam); return true;
};

// WHICH WAY ARE THE DIGITS SPREAD, in the standing figure's own frame. This is
// the number the pincer problem turns on: if the two fingers are spread across
// the character's left-right axis they fan straight at a front camera, and if
// they are spread front-to-back the same hand presents its narrow edge.
const B=sk.skeleton.bones, nm=n=>B.findIndex(b=>b.name===n);
const wp=i=>new THREE.Vector3().setFromMatrixPosition(B[i].matrixWorld);
const f1=wp(nm('Finger01_L_jnt_02_011')), f2=wp(nm('Finger02_L_jnt_02_013')),
      th=wp(nm('Thumb_L_jnt_02_015')),    wr=wp(nm('Wrist_L_jnt_09'));
const spread=f1.clone().sub(f2).normalize();
const along=f1.clone().add(f2).multiplyScalar(0.5).sub(wr).normalize();
window.__facts=JSON.stringify({
  digitSpreadAxisWorld:[+spread.x.toFixed(3),+spread.y.toFixed(3),+spread.z.toFixed(3)],
  handAlongAxisWorld:[+along.x.toFixed(3),+along.y.toFixed(3),+along.z.toFixed(3)],
  thumbFromWristWorld:[+(th.x-wr.x).toFixed(3),+(th.y-wr.y).toFixed(3),+(th.z-wr.z).toFixed(3)],
  figureHeight:+(box.getSize(new THREE.Vector3()).y.toFixed(4)),
  note:'x is the figure left-right axis, y up, z front-back'
});
window.__ready=true;
<\/script></body></html>`;

let server, browser;
const serve = () => new Promise((ok, fail) => {
  server = createServer(async (req, res) => {
    if (req.url === '/') { res.writeHead(200, {'Content-Type':'text/html'}); return res.end(PAGE); }
    if (req.url === '/glb') { const b = await readFile(GLB);
      res.writeHead(200, {'Content-Type':'model/gltf-binary'}); return res.end(b); }
    if (req.url.startsWith('/node_modules/')) {
      try { const b = await readFile(resolve(HERE, req.url.slice(1)));
        res.writeHead(200, {'Content-Type':'text/javascript'}); return res.end(b); } catch {}
    }
    res.writeHead(404); res.end('no');
  });
  server.on('error', fail); server.listen(0, '127.0.0.1', () => ok(server.address().port));
});

const VIEWS = {
  'ref-figure-lobby':  { dir: [0, 0.10, 1], h: 2.4 },
  'ref-figure-close':  { dir: [0, 0.05, 1], h: 1.15 },
  'ref-figure-34':     { dir: [0.75, 0.10, 0.9], h: 1.5 },
  'ref-figure-side':   { dir: [1, 0.05, 0.05], h: 1.5 },
};

(async () => {
  await mkdir(OUT, { recursive: true });
  const port = await serve();
  browser = await puppeteer.launch({ headless: true,
    args: ['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader'],
    defaultViewport: { width: W, height: H } });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e && e.stack || e)));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  try { await page.waitForFunction('window.__ready===true', { timeout: 60000 }); }
  catch (e) { console.error('never ready:\n  ' + errs.join('\n  ')); throw e; }
  console.log(await page.evaluate('window.__facts'));
  for (const [n, v] of Object.entries(VIEWS)) {
    await page.evaluate((d, h) => window.__shot(d, h), v.dir, v.h);
    await page.screenshot({ path: join(OUT, n + '.png') });
    console.log('  ' + n);
  }
  if (errs.length) { console.error(errs.join('\n')); process.exitCode = 1; }
})().catch(e => { console.error(e); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); if (server) server.close(); });
