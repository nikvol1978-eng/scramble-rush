// Debug-only character regressions, also evaluated by tools/character-audit.mjs.
// These measure visible limb geometry, not the legacy hidden hand/foot probes.
function characterLimbs(){
  return [-1,1].flatMap((side,i)=>[
    {name:'arm'+side, segments:40, ...armGeometry(RIG,side,1,4+i,19+i,21+i)},
    {name:'leg'+side, segments:24, ...lowerLimbGeometry(RIG,side,2+i,15+i,17+i)}
  ]);
}
function characterTopology(geo, weights, crossings=false){
  const p=geo.attributes.position, n=geo.attributes.normal, ix=geo.index.array;
  const edges=new Map(), directed=new Set(), used=new Set(), triangles=[];
  const result={vertices:p.count,triangles:ix.length/3,open:0,nonManifold:0,
    duplicateDirected:0,degenerate:0,unused:0,badNormals:0,badWeights:0,volume:0,crossings:0};
  const v=i=>new THREE.Vector3().fromBufferAttribute(p,i);
  for(let k=0;k<ix.length;k+=3){
    const ids=[ix[k],ix[k+1],ix[k+2]], pts=ids.map(v);
    const normal=new THREE.Vector3().subVectors(pts[1],pts[0]).cross(new THREE.Vector3().subVectors(pts[2],pts[0]));
    if(normal.lengthSq()<1e-16) result.degenerate++;
    result.volume+=pts[0].dot(new THREE.Vector3().crossVectors(pts[1],pts[2]))/6;
    ids.forEach((a,j)=>{const b=ids[(j+1)%3], key=Math.min(a,b)+','+Math.max(a,b), d=a+','+b;
      used.add(a);edges.set(key,(edges.get(key)||0)+1);
      if(directed.has(d))result.duplicateDirected++;directed.add(d);
    });
    if(crossings)triangles.push({ids,pts,box:new THREE.Box3().setFromPoints(pts)});
  }
  for(const count of edges.values()){if(count===1)result.open++;if(count>2)result.nonManifold++;}
  result.unused=p.count-used.size;
  for(let i=0;i<p.count;i++){
    if(![p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite))result.degenerate++;
    const length=new THREE.Vector3().fromBufferAttribute(n,i).length();
    if(!Number.isFinite(length)||Math.abs(length-1)>1e-4)result.badNormals++;
    if(weights){let sum=0;for(let j=0;j<4;j++){const w=weights.sw[i*4+j],b=weights.si[i*4+j];sum+=w;
      if(!Number.isFinite(w)||w<0||b<0||b>=23)result.badWeights++;}
      if(Math.abs(sum-1)>1e-6)result.badWeights++;
    }
  }
  if(crossings){
    result.crossingPoints=[];
    // ...and WHICH TWO PARTS crossed, not just where. A coordinate tells you
    // that something near the thumb is intersecting something; it does not say
    // whether that is the palm, the next digit, or the same digit folding
    // through itself, and those three have opposite fixes. Recording one vertex
    // of each triangle is enough for tools/hand-topo.mjs to name both parts.
    result.crossingPairs=[];
    triangles.sort((a,b)=>a.box.min.x-b.box.min.x);
    const hit=new THREE.Vector3(),direction=new THREE.Vector3(),ray=new THREE.Ray();
    const intersects=(a,b)=>a.pts.some((from,j)=>{
      direction.subVectors(a.pts[(j+1)%3],from);const length=direction.length();
      ray.set(from,direction.normalize());
      return ray.intersectTriangle(...b.pts,false,hit) && hit.distanceTo(from)>1e-6 && hit.distanceTo(from)<length-1e-6;
    });
    for(let i=0;i<triangles.length;i++)for(let j=i+1;j<triangles.length;j++){
      const a=triangles[i],b=triangles[j];if(b.box.min.x>a.box.max.x)break;
      if(!a.box.intersectsBox(b.box)||a.ids.some(id=>b.ids.includes(id)))continue;
      if(intersects(a,b)||intersects(b,a)){result.crossings++;result.crossingPoints.push(hit.toArray());
        // the HIGHEST index of each, not the first. A digit's first quad row is
        // built on the opening's own vertices, which belong to the palm, so
        // taking ids[0] files the root of a digit under "palm x palm".
        result.crossingPairs.push([Math.max(...a.ids),Math.max(...b.ids)]);}
    }
    // Segment/triangle crossing test; coplanar overlaps are not certified.
  }
  return result;
}
function characterSole(m){
  m.group.updateMatrixWorld(true);m.skeleton.update();let min=Infinity;
  const v=new THREE.Vector3(),p=m.trim.geometry.attributes.position;
  for(let i=0;i<p.count;i++){m.trim.getVertexPosition(i,v);min=Math.min(min,v.y);}
  return min;
}
function characterFaceClearance(m){
  m.group.updateMatrixWorld(true);
  const inv=m.bodyBone.matrixWorld.clone().invert(),p=m.facePlate.geometry.attributes.position;
  let min=Infinity,max=-Infinity;
  for(let i=0;i<p.count;i++){
    const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(m.facePlate.matrixWorld).applyMatrix4(inv);
    const w=beanRadiusAt(v.y),d=beanDepthAt(v.y);
    const clearance=v.z-beanZAt(v.y)-d*Math.sqrt(Math.max(0,1-(v.x/w)**2));
    min=Math.min(min,clearance);max=Math.max(max,clearance);
  }
  return {min,max};
}
// WHERE VERTEX i's MIRROR LIVES ON THE OTHER LIMB -- AND THE TWO LIMBS DO NOT
// ANSWER THAT THE SAME WAY, SO EACH ONE SAYS WHICH RULE IT OBEYS.
//
// 'identity' -- the ARM. Its section is authored in an ANATOMICAL frame: pt()
// carries side on the width, so ring index k is the outboard flank on both
// arms and the end face walks that ring in the same order on both. The two
// limbs therefore emit the same vertices in the same order with x already
// negated, and vertex i's opposite number is vertex i.
//
// 'ring' -- the LEG, unchanged. Its section is authored in raw coordinates and
// carries no side; it is symmetric in x, so the same index is the same ANGLE
// on both legs and the opposite number is the reflected index.
//
// Taking one rule for both is exactly what went wrong when the arm moved to
// the anatomical frame: identity over a leg that had not changed reported a
// 5.2-unit error against geometry that was, and remains, perfectly symmetric.
// A limb-independent mirror map is an assumption, not a fact.
//
// Note also that 'identity' is STRICTER than the reflection, not weaker. The
// claim is "the left limb is the right limb with x negated", and under identity
// a term that FORGETS to carry side lands at +x on both arms and shows up here
// as a coordinate error -- which is how the digit frame's cross product was
// caught pointing forward on one hand and backward on the other. Under a ring
// reflection that mistake can hide, because reflecting the index undoes it.
//
// Getting this wrong does not fail loudly. The mapping before last ran the ring
// formula over the whole buffer, so for the end face and the digits it produced
// indices past the end, getX returned undefined, the error came out NaN, and
// `NaN > 1e-5` is FALSE -- the check reported "maximum coordinate error NaN"
// and PASSED. A symmetry check that passes on NaN is not checking anything, so
// the guard below rejects a non-finite error explicitly rather than trusting a
// comparison, and that guard stays whatever the map is.
function mirrorIndex(i,count,seg,rings,mode){
  if(mode!=='ring') return i;                    // the arm, and anything new
  if(i===0||i===count-1) return i;
  const ringEnd=1+rings*seg;
  if(i>=ringEnd) return i;
  return 1+Math.floor((i-1)/seg)*seg+(seg/2-(i-1)%seg+seg)%seg;
}
function checkCharacterSymmetry(){
  const limbs=characterLimbs(),bad=[];let error=0;
  for(const kind of ['arm','leg']){
    const left=limbs.find(l=>l.name===kind+'-1'),right=limbs.find(l=>l.name===kind+'1');
    const a=left.geo.attributes.position,b=right.geo.attributes.position,seg=left.segments;
    if(a.count!==b.count) bad.push(kind+' vertex counts differ '+a.count+' vs '+b.count);
    for(let i=0;i<a.count;i++){
      const j=mirrorIndex(i,a.count,seg,left.rings,left.mirror);
      error=Math.max(error,Math.abs(a.getX(i)+b.getX(j)),Math.abs(a.getY(i)-b.getY(j)),Math.abs(a.getZ(i)-b.getZ(j)));
    }
  }
  const m=makeCharacter({color:'#eb5aa2'});m.neutral();m.skeleton.update();
  const leg=limbs.find(l=>l.name==='leg-1'),arm=limbs.find(l=>l.name==='arm-1');
  for(const [limb,offset] of [[leg,0],[arm,2*leg.geo.attributes.position.count]]){
    const count=limb.geo.attributes.position.count,seg=limb.segments,a=new THREE.Vector3(),b=new THREE.Vector3();
    for(let i=0;i<count;i++){
      const j=mirrorIndex(i,count,seg,limb.rings,limb.mirror);
      m.trim.getVertexPosition(offset+i,a);m.trim.getVertexPosition(offset+count+j,b);
      error=Math.max(error,Math.abs(a.x+b.x),Math.abs(a.y-b.y),Math.abs(a.z-b.z));
    }
  }
  for(const l of limbs){l.geo.dispose();(l.handProbe||l.footProbe).dispose();}
  if(!Number.isFinite(error))bad.push('mirror error is not a number -- the index map is wrong, not the geometry');
  else if(error>1e-5)bad.push('mirror error '+error);
  return {name:'! rest limb mirror symmetry',pass:!bad.length,detail:'maximum coordinate error '+error};
}
function checkCharacterTopology(){
  const limbs=characterLimbs(),bad=[],notes=[];
  for(const l of limbs){const r=characterTopology(l.geo,l.weights);
    for(const key of ['open','nonManifold','duplicateDirected','degenerate','unused','badNormals','badWeights'])if(r[key])bad.push(l.name+' '+key+'='+r[key]);
    if(!(r.volume>0))bad.push(l.name+' inward winding');
    notes.push(l.name+': '+r.vertices+'/'+r.triangles);
    l.geo.dispose();(l.handProbe||l.footProbe).dispose();
  }
  return {name:'$ closed outward limb topology and weights',pass:!bad.length,detail:bad.length?bad.join('; '):notes.join('; ')};
}
function checkCharacterFace(){
  const m=makeCharacter({color:'#eb5aa2'});let min=Infinity,max=-Infinity;
  const poses=[{}, {finished:true}, {h:5,vh:8}, {diveT:100}, {landT:90}, {getUpT:260,getUpTotal:500}];
  for(const state of poses)for(const t of [0,.3,.8,1.5,2.5]){
    m.neutral();poseCharacter(m,{h:0,vh:0,...state},t,false,0);
    const c=characterFaceClearance(m);min=Math.min(min,c.min);max=Math.max(max,c.max);
  }
  return {name:'? face clearance through breathing and recovery',pass:min>.01&&max<.65,
    detail:'body-local plate clearance '+min.toFixed(5)+'..'+max.toFixed(5)};
}
function checkCharacterSole(){
  const m=makeCharacter({color:'#eb5aa2'});m.neutral();const sole=characterSole(m);
  const meshes=[m.body,m.trim],vertices=meshes.reduce((s,m)=>s+m.geometry.attributes.position.count,0),triangles=meshes.reduce((s,m)=>s+m.geometry.index.count/3,0);
  return {name:': visible skinned sole and complexity budget',
    // The ceiling sits just over the V5 hand, not comfortably over it. The
    // three-digit hand costs 13259 vertices and 26016 triangles, and the ~1.8%
    // left over is room for a deliberate row or two, not room for a mistake:
    // one more digit ring costs 80 vertices and 160 triangles across the pair,
    // so this budget absorbs exactly THREE and rejects the fourth. Anything
    // that scales -- a doubled DIG_RINGS, a bumped SEG -- is orders past it.
    pass:Math.abs(sole-(-17.63703519246488))<.03&&vertices<=13500&&triangles<=26500&&m.skeleton.bones.length===23,
    detail:'sole '+sole.toFixed(8)+'; '+vertices+' vertices / '+triangles+' triangles; '+m.skeleton.bones.length+' bones'};
}
