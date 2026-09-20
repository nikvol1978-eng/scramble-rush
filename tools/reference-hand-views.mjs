#!/usr/bin/env node
// LOOK at the official model's hand as a 3D object, from the angles that decide
// whether a hand reads as a hand.
//
//   SR_REFERENCE_GLB=<path.glb> node tools/reference-hand-views.mjs
//
// tools/reference-hand.mjs measures the same hand and returns ratios. Ratios
// were not enough: a hand built to the right proportions still shipped reading
// as stacked horizontal lips, because the numbers describe how big the parts
// are and say nothing about which DIRECTION they point. This renders it
// instead — palm, back, side, end-on, and two three-quarters — so the shape
// language can be seen rather than inferred.
//
// The model stays out of the repository. Nothing here is copied into the game:
// these are reference photographs, the same as looking at it in a viewer.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const HERE = resolve(fileURLToPath(new URL('..', import.meta.url)));
const GLB = process.env.SR_REFERENCE_GLB || process.argv[2];
if (!GLB) { console.error('need SR_REFERENCE_GLB or argv[1]'); process.exit(2); }
const OUT = resolve(process.env.SR_OUT || join(HERE, 'docs', 'hand-review', 'reference'));
const W = 800, H = 800;

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
 html,body{margin:0;background:#1b1f27;overflow:hidden}canvas{display:block}
</style>
<!-- GLTFLoader imports from the bare specifier "three", which a browser
     cannot resolve on its own. Without this map the module never evaluates,
     __ready is never set, and the harness times out with nothing to show. -->
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

const B=sk.skeleton.bones, nm=n=>B.findIndex(b=>b.name===n);
const WRIST=nm('Wrist_L_jnt_09');
const GROUP={finger01:[nm('Finger01_L_jnt_01_010'),nm('Finger01_L_jnt_02_011')],
             finger02:[nm('Finger02_L_jnt_01_012'),nm('Finger02_L_jnt_02_013')],
             thumb:[nm('Thumb_L_jnt_01_014'),nm('Thumb_L_jnt_02_015')]};
const ALL=[WRIST,...Object.values(GROUP).flat()];
const inv=B[WRIST].matrixWorld.clone().invert();
const bp=i=>new THREE.Vector3().setFromMatrixPosition(B[i].matrixWorld).applyMatrix4(inv);

// Keep only the hand, by skin weight, and rebuild it as a plain mesh in the
// WRIST's frame so the camera angles below mean something anatomically.
const pos=sk.geometry.attributes.position, si=sk.geometry.attributes.skinIndex, sw=sk.geometry.attributes.skinWeight;
const wOn=(v,set)=>{let s=0;for(let c=0;c<4;c++) if(set.includes(si.getComponent(v,c))) s+=sw.getComponent(v,c);return s;};
const keep=new Uint8Array(pos.count), local=[];
for(let v=0;v<pos.count;v++){
  keep[v]=wOn(v,ALL)>=0.85?1:0;
  local.push(new THREE.Vector3().fromBufferAttribute(pos,v).applyMatrix4(sk.matrixWorld).applyMatrix4(inv));
}
const gi=sk.geometry.index, verts=[];
for(let f=0;f<gi.count;f+=3){
  const a=gi.getX(f),b=gi.getX(f+1),c=gi.getX(f+2);
  if(keep[a]&&keep[b]&&keep[c]) verts.push(local[a],local[b],local[c]);
}
const geo=new THREE.BufferGeometry().setFromPoints(verts);
geo.computeVertexNormals();

// The hand's own frame: L along it, W across the digits, D through its thickness.
const tips=Object.values(GROUP).map(g=>bp(g[1]));
const L=tips.reduce((a,v)=>a.add(v),new THREE.Vector3()).divideScalar(3).normalize();
let Wx=tips[0].clone().sub(tips[1]); Wx.sub(L.clone().multiplyScalar(Wx.dot(L))).normalize();
const D=new THREE.Vector3().crossVectors(L,Wx).normalize();

const scene=new THREE.Scene(); scene.background=new THREE.Color('#1b1f27');
const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#e56aa8',roughness:.65,metalness:0,side:THREE.DoubleSide}));
scene.add(mesh);
const key=new THREE.DirectionalLight(0xffffff,2.4), fill=new THREE.DirectionalLight(0xbcd0ff,.8),
      rim=new THREE.DirectionalLight(0xffe7c4,1.4);
scene.add(key,fill,rim,new THREE.AmbientLight(0xffffff,.5));
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(2); renderer.setSize(${W},${H});
document.body.appendChild(renderer.domElement);
const cam=new THREE.PerspectiveCamera(28,1,.001,100);

const box=new THREE.Box3().setFromObject(mesh), c=box.getCenter(new THREE.Vector3()),
      R=box.getSize(new THREE.Vector3()).length()/2;
window.__shot=(dir,up)=>{
  const d=new THREE.Vector3(...dir).normalize();
  const world=new THREE.Vector3().addScaledVector(Wx,d.x).addScaledVector(D,d.y).addScaledVector(L,d.z).normalize();
  const dist=2.1*R/Math.tan(Math.PI/12.86);
  cam.position.copy(c).addScaledVector(world,dist);
  const u=new THREE.Vector3().addScaledVector(Wx,up[0]).addScaledVector(D,up[1]).addScaledVector(L,up[2]).normalize();
  cam.up.copy(u); cam.lookAt(c); cam.updateProjectionMatrix();
  for(const [l,o] of [[key,[-.6,.8,.3]],[fill,[.9,-.2,.4]],[rim,[.1,.3,-1.3]]]){
    l.position.copy(cam.position)
      .addScaledVector(new THREE.Vector3(1,0,0).applyQuaternion(cam.quaternion),o[0]*dist)
      .addScaledVector(new THREE.Vector3(0,1,0).applyQuaternion(cam.quaternion),o[1]*dist)
      .addScaledVector(world,o[2]*dist);
    l.target.position.copy(c); l.target.updateMatrixWorld(); scene.add(l.target);
  }
  renderer.render(scene,cam); return true;
};
// how far each digit's tip stands out past the palm's own mass, for the caption
const palmPts=[], digPts={};
for(let v=0;v<pos.count;v++){
  if(!keep[v]) continue;
  const p=local[v], l=p.dot(L);
  const own=Object.keys(GROUP).reduce((a,b)=>wOn(v,GROUP[a])>wOn(v,GROUP[b])?a:b);
  if(wOn(v,[WRIST])>wOn(v,GROUP[own])) palmPts.push(l); else (digPts[own]=digPts[own]||[]).push(l);
}
const pMax=Math.max(...palmPts), HL=Math.max(...palmPts,...Object.values(digPts).flat());
window.__facts=JSON.stringify({handLen:+HL.toFixed(4), palmEndsAt:+(pMax/HL).toFixed(3),
  digitTipAt:Object.fromEntries(Object.entries(digPts).map(([k,v])=>[k,+(Math.max(...v)/HL).toFixed(3)])),
  digitProjectionPastPalm:Object.fromEntries(Object.entries(digPts).map(([k,v])=>[k,+((Math.max(...v)-pMax)/HL).toFixed(3)]))});
window.__ready=true;
<\/script></body></html>`;

let server,browser;
const serve=()=>new Promise((ok,fail)=>{
  server=createServer(async(req,res)=>{
    if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(PAGE);}
    if(req.url==='/glb'){const b=await readFile(GLB);res.writeHead(200,{'Content-Type':'model/gltf-binary'});return res.end(b);}
    if(req.url.startsWith('/node_modules/')){
      try{const b=await readFile(resolve(HERE,req.url.slice(1)));
        res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(b);}catch{}
    }
    res.writeHead(404);res.end('no');
  });
  server.on('error',fail); server.listen(0,'127.0.0.1',()=>ok(server.address().port));
});

// dir/up are given in the HAND's frame: x across the digits, y through the
// thickness (palm->back), z along the hand towards the tips.
const VIEWS={
  'ref-palm':   {dir:[0,-1,0],  up:[0,0,1]},
  'ref-back':   {dir:[0,1,0],   up:[0,0,1]},
  'ref-side':   {dir:[1,0,0],   up:[0,0,1]},
  'ref-side2':  {dir:[-1,0,0],  up:[0,0,1]},
  'ref-endon':  {dir:[0,0,1],   up:[0,1,0]},
  'ref-34':     {dir:[0.75,-0.55,0.45], up:[0,0,1]},
  'ref-34back': {dir:[0.7,0.6,0.4], up:[0,0,1]},
};

(async()=>{
  await mkdir(OUT,{recursive:true});
  const port=await serve();
  browser=await puppeteer.launch({headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader'],
    defaultViewport:{width:W,height:H}});
  const page=await browser.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(String(e && e.stack || e)));
  page.on('console',e=>{ if(e.type()==='error') errs.push('console: '+e.text()); });
  page.on('requestfailed',r=>errs.push('reqfail: '+r.url()));
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'domcontentloaded',timeout:120000});
  try{ await page.waitForFunction('window.__ready===true',{timeout:60000}); }
  catch(e){ console.error('page never became ready:\n  ' + errs.join('\n  ')); throw e; }
  console.log(await page.evaluate('window.__facts'));
  for(const [n,v] of Object.entries(VIEWS)){
    await page.evaluate((d,u)=>window.__shot(d,u), v.dir, v.up);
    await page.screenshot({path:join(OUT,n+'.png')});
    console.log('  '+n);
  }
  if(errs.length){console.error(errs.join('\n'));process.exitCode=1;}
})().catch(e=>{console.error(e);process.exitCode=1;})
  .finally(async()=>{ if(browser)await browser.close(); if(server)server.close(); });
