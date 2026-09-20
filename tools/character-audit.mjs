// Node-side audit of the same original procedural geometry used by the game.
// Optional baseline fragment directory: node tools/character-audit.mjs <dir>
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),frag=process.argv[2]||resolve(root,'build/frag');
const source=(await Promise.all(['02_skinmat.js','02b_rig.js','12_charanim.js'].map(f=>readFile(resolve(frag,f),'utf8')))).join('\n');
const checks=await readFile(resolve(root,'build/character-checks.js'),'utf8');
const api=new Function('THREE',`
  const skinBaseColor=s=>s.color||'#eb5aa2',clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const RADIUS=17,LAND_MS=90,DIVE_GETUP_MS=500;
  let racers=[];const currentMap={slippery:false},pathAngle=()=>0,toWorld=(x,y,h)=>({x,y:h,z:y});
  ${source}\n${checks}
  return {characterLimbs,characterTopology,characterSole,characterFaceClearance,
    makeCharacter,poseCharacter,beanRadiusAt,beanDepthAt,beanZAt,
    sync(m,state,t){racers=[{mesh:m,x:0,y:0,h:0,vh:0,vx:0,vy:0,facing:Math.PI/2,isPlayer:true,floorH:0,invuln:0,...state}];syncRacers(t);},
    tests:[checkCharacterSymmetry,checkCharacterTopology,checkCharacterFace,checkCharacterSole]};
`)(THREE);
const report={tests:api.tests.map(fn=>fn()),topology:[],poses:[]};
const limbs=api.characterLimbs();
for(const l of limbs)report.topology.push({name:l.name,...api.characterTopology(l.geo,l.weights,true)});
const m=api.makeCharacter({color:'#eb5aa2'});
// The merged trim's order is lower limbs, upper limbs, then face/eyes.
const ordered=['leg-1','leg1','arm-1','arm1'].map(n=>limbs.find(l=>l.name===n));
const poses=[['neutral',null],['idle',{}],['run',{vx:4.609}],['turn',{vx:4.609,lastFacing:-.45}],
  ['jump',{h:4,vh:8.2,stretchT:60}],['fall',{falling:true,fallT:650}],['dive',{diveT:100}],
  ['landing',{landT:90}],['recovery',{getUpT:260,getUpTotal:500}]];
for(const [name,state] of poses){
  m.neutral();m.group.position.set(0,17,0);if(state)api.sync(m,state,.3);
  const sole=api.characterSole(m),clearance=api.characterFaceClearance(m),topology=[];let offset=0;
  for(const l of ordered){
    const geo=l.geo.clone(),p=geo.attributes.position,v=new THREE.Vector3();
    for(let i=0;i<p.count;i++){m.trim.getVertexPosition(offset+i,v);p.setXYZ(i,v.x,v.y,v.z);}
    geo.computeVertexNormals();const r=api.characterTopology(geo,null,true);
    const inv=m.bodyBone.matrixWorld.clone().invert();
    const exposedCrossings=r.crossingPoints.filter(point=>{const v=new THREE.Vector3(...point).applyMatrix4(m.trim.matrixWorld).applyMatrix4(inv);
      return (v.x/api.beanRadiusAt(v.y))**2+((v.z-api.beanZAt(v.y))/api.beanDepthAt(v.y))**2>1;
    }).length;
    topology.push({name:l.name,crossings:r.crossings,exposedCrossings,degenerate:r.degenerate,volume:r.volume});offset+=p.count;geo.dispose();
  }
  let worldSole=Infinity;const v=new THREE.Vector3();
  for(let i=0;i<m.trim.geometry.attributes.position.count;i++){
    m.trim.getVertexPosition(i,v);v.applyMatrix4(m.trim.matrixWorld);worldSole=Math.min(worldSole,v.y);
  }
  report.poses.push({name,sole,worldSole,root:m.group.position.toArray(),scale:m.group.scale.toArray(),clearance,topology});
}
console.log(JSON.stringify(report,null,2));
// Report all crossings, including the unchanged buried limb roots in a dive.
// Static surfaces must be clean everywhere; posed surfaces must be clean outside
// the body. Do not hide the internal counts from the review report.
if(report.tests.some(t=>!t.pass)||report.topology.some(t=>t.crossings)||report.poses.some(p=>p.topology.some(t=>t.exposedCrossings||t.degenerate)))process.exitCode=1;
