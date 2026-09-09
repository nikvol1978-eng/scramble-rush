  // ============================================================
  // CHARACTER RIG — one soft bean, small stubby limbs
  // ============================================================
  // Body and head are a single piece: no neck, no separate skull. The silhouette
  // is a lathed bean — rounded top, widest low down, rounded base — rather than a
  // plain scaled sphere, which reads as an egg. Limbs are deliberately small: an
  // arm that reaches past the body's waist looks like a growth, not a limb.
  // The whole figure still occupies the 34-unit box the old sphere did, so the
  // physics (RADIUS = 17) is untouched.
  // v22: shorter, wider, and top-heavy. v20 stretched the bean to 1.9 : 1,
  // which reads as a tall oval with a face painted halfway down it -- the
  // silhouette had no head. This one is built the other way round: a big
  // rounded head that is the widest part of the figure, a waist pinched in
  // under it, a short chunky body, and stubby legs on big feet. It stands
  // about 1.45 : 1. The collision sphere is untouched at RADIUS = 17, so
  // nothing in the simulation moves; this is the silhouette only.
  //
  // v24 §1: SKINNED. The shape is unchanged; what changed is how it is drawn.
  // The old rig was twenty-odd separate meshes hung off nested Groups, which
  // cost about thirteen and a half draw calls a racer. Sixteen racers made that
  // 216 draws and v21 recorded "one skinned mesh per racer" as the fix; at
  // twenty-four racers it is no longer optional, because the field alone was
  // over the 300-call budget for the whole frame.
  //
  // So every part is baked into one buffer and bound rigidly -- weight 1 -- to
  // a bone standing where its Group used to stand. Bones are Object3D, so the
  // animation code sets `legPivots[0].rotation.x` exactly as it did before and
  // does not know the difference. Two meshes come out rather than one: the bean
  // keeps the skin material with all its patterns, rim light and shader work,
  // and everything else -- limbs, face, eyes, hat -- shares one plastic
  // material and carries its colour in the vertices. Two draws a racer.
  const RIG = {
    topY:18.6, bottomY:-9.2, maxR:12.4,
    // the face sits on the head bulge, and is bigger for it
    faceY:10.2, faceZ:6.8, faceR:8.0,
    hipY:-8.6, legLen:4.2, legR:3.0, legX:5.2,
    footR:4.1, footY:-12.8,
    // arms hang from the waist pinch, under the head, and end at the hip
    shoulderY:3.2, shoulderX:10.3, armLen:9.6, armR:3.0, armTipR:2.1, mittR:3.0,
    hatScale:0.98
  };
  RIG.waistY = (RIG.topY + RIG.bottomY)/2;

  // Profile of the bean, bottom to top. x is radius, y is height.
  // Bottom to top: a rounded base, a body that swells and then pinches at the
  // waist, and above it a head bulge wider than the body -- which is what puts
  // the head in the silhouette instead of leaving one flat oval.
  const BEAN_PROFILE = [
    [0.0, -9.2], [3.9, -9.1], [7.4, -8.3], [9.8, -6.4], [11.1, -3.6],
    [11.4, -0.6], [10.8,  2.2],
    [11.7,  5.2], [12.4,  8.6], [12.2, 11.6],
    [11.2, 14.2], [9.2, 16.4], [5.6, 17.9], [0.0, 18.6]
  ];
  let _beanGeo=null, _beanOutGeo=null;
  function beanGeometry(){
    if(!_beanGeo){
      _beanGeo = new THREE.LatheGeometry(BEAN_PROFILE.map(p=>new THREE.Vector2(p[0],p[1])), 28);
      // Baked ambient occlusion, as a vertex colour: the crease where the legs
      // meet the body and the hollow under each shoulder go a shade darker.
      const pos = _beanGeo.attributes.position, n = pos.count, col = new Float32Array(n*3);
      for(let i=0;i<n;i++){
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        let ao = 1;
        if(y < -3.4) ao -= 0.24 * Math.min(1, (-3.4 - y)/5.0);
        // and the shade under the head, which is what sells the pinch
        if(y > 0.4 && y < 4.6) ao -= 0.16 * (1 - Math.abs(y - 2.4)/2.2);
        for(const s of [-1,1]){
          const d = Math.hypot(x - s*RIG.shoulderX, y - RIG.shoulderY, z);
          if(d < 6.5) ao -= 0.16 * (1 - d/6.5);
        }
        col[i*3] = col[i*3+1] = col[i*3+2] = ao;
      }
      _beanGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      // The bean is the only thing on the body mesh, so every vertex of it is
      // bound to one bone. That is the same for every racer, so it is baked in
      // here once and the geometry is shared by all twenty-four.
      rigidWeights(_beanGeo, BONE.body);
    }
    return _beanGeo;
  }
  function beanOutlineGeometry(){
    if(!_beanOutGeo){
      // grown along the profile normal-ish, so the rim stays even top to bottom
      _beanOutGeo = new THREE.LatheGeometry(
        BEAN_PROFILE.map(p=>new THREE.Vector2(p[0]*1.018 + (p[0]>0.5?0.34:0), p[1]*1.016)), 24);
    }
    return _beanOutGeo;
  }

  // ---- the skeleton ------------------------------------------------------
  // One index per animated pivot. Anything that never moves on its own hangs
  // off the nearest thing that does, which is why there are no bones for the
  // feet, the hands, the eyebrows or most of a hat: a foot is part of its leg.
  const BONE = { tilt:0, body:1, legL:2, legR:3, armL:4, armR:5, head:6, face:7,
                 scleraL:8, scleraR:9, pupilL:10, pupilR:11, tongue:12,
                 hat:13, hatSpin:14 };
  const BONE_COUNT = 15;

  function rigidWeights(geo, boneIndex){
    const n = geo.attributes.position.count;
    const si = new Uint16Array(n*4), sw = new Float32Array(n*4);
    for(let i=0;i<n;i++){ si[i*4] = boneIndex; sw[i*4] = 1; }
    geo.setAttribute('skinIndex',  new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  }

  // Concatenate the parts into one indexed buffer. Every part arrives already
  // in the bind pose (its geometry has had its bone's matrix applied), carries
  // a flat colour, and belongs to exactly one bone.
  function mergeParts(parts){
    let nv = 0, ni = 0;
    for(const p of parts){ nv += p.geo.attributes.position.count; ni += p.geo.index.count; }
    const pos = new Float32Array(nv*3), nor = new Float32Array(nv*3), col = new Float32Array(nv*3);
    const si  = new Uint16Array(nv*4),  sw  = new Float32Array(nv*4);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let v = 0, k = 0;
    const c = new THREE.Color();
    for(const p of parts){
      const g = p.geo, n = g.attributes.position.count;
      pos.set(g.attributes.position.array, v*3);
      nor.set(g.attributes.normal.array, v*3);
      for(let i=0;i<n;i++){
        if(p.colorAt) p.colorAt(c, g, i); else c.copy(p.color);
        col[(v+i)*3] = c.r; col[(v+i)*3+1] = c.g; col[(v+i)*3+2] = c.b;
        si[(v+i)*4] = p.bone; sw[(v+i)*4] = 1;
      }
      const gi = g.index.array;
      for(let i=0;i<gi.length;i++) idx[k+i] = gi[i] + v;
      v += n; k += gi.length;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal',   new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color',    new THREE.Float32BufferAttribute(col, 3));
    out.setAttribute('skinIndex',  new THREE.Uint16BufferAttribute(si, 4));
    out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    // Limbs swing well outside the bind pose, and a sphere drawn round the
    // bind pose culls an arm-first racer at the edge of the screen.
    out.computeBoundingSphere(); out.boundingSphere.radius *= 1.4;
    return out;
  }

  // A stubby capsule. No ball at the shoulder end — the joint sits inside the
  // body, and an extra sphere there just bulges through the surface.
  function limbGeometry(r, len, rTip){
    const g = new THREE.CylinderGeometry(r, rTip||r*0.94, len, 10);
    g.translate(0, -len/2, 0);
    return g;
  }

  function makeCharacter(opts){
    const skin = opts.skin ? opts.skin : {id:'_flat', type:'solid', color:opts.color||'#ff4fa3'};
    const pattern = opts.pattern || null;
    const group = new THREE.Group();
    const { bodyMat, limbMat } = makeSkinMaterials(skin, pattern);
    const limbCol = limbMat.color;

    // ---- bones. Positions are the positions the old Groups had, so the
    //      animation code's absolute rotations mean exactly what they meant.
    const bones = [];
    const bone = (i, parent, x, y, z)=>{
      const b = new THREE.Bone(); b.position.set(x||0, y||0, z||0);
      bones[i] = b; (parent===null ? group : bones[parent]).add(b); return b;
    };
    const tilt = bone(BONE.tilt, null, 0, 0, 0);   // pitch pivot, inside the yaw group
    bone(BONE.body, BONE.tilt, 0, 0, 0);
    const legL = bone(BONE.legL, BONE.tilt, -RIG.legX, RIG.hipY, 0);
    const legR = bone(BONE.legR, BONE.tilt,  RIG.legX, RIG.hipY, 0);
    const armL = bone(BONE.armL, BONE.tilt, -RIG.shoulderX, RIG.shoulderY, 0);
    const armR = bone(BONE.armR, BONE.tilt,  RIG.shoulderX, RIG.shoulderY, 0);
    const head = bone(BONE.head, BONE.tilt, 0, 0, 0);
    const faceGroup = bone(BONE.face, BONE.head, 0, RIG.faceY, 0);

    const FS = RIG.faceR/7.0;                       // everything on the face scales with it
    const ez = RIG.faceZ + RIG.faceR*0.52 - 0.6;
    const eyeX = RIG.faceR*0.45;
    const eyes = opts.eyes||'round';
    const scleras = [ bone(BONE.scleraL, BONE.face, -eyeX, 0.5*FS, ez-0.3),
                      bone(BONE.scleraR, BONE.face,  eyeX, 0.5*FS, ez-0.3) ];
    // the pupil sits where its expression puts it; the locker's look-at moves
    // it from there, so the bone has to stand at the rest position
    const pupilY = eyes==='happy' ? 1.0*FS : eyes==='sleepy' ? 0.3*FS : 0.6*FS;
    const pupils = [ bone(BONE.pupilL, BONE.face, -eyeX, pupilY, ez),
                     bone(BONE.pupilR, BONE.face,  eyeX, pupilY, ez) ];
    const tongue = bone(BONE.tongue, BONE.face, 0, -3.2*FS, ez-0.15);
    tongue.scale.setScalar(0.0001);                 // only the locker's gurn shows it

    const hat = opts.hat||'none';
    const hatGroup = bone(BONE.hat, BONE.head, 0, RIG.topY - 1.2, 0);
    hatGroup.scale.setScalar(RIG.hatScale);
    // the only hat with a moving part of its own
    const hatSpin = bone(BONE.hatSpin, BONE.hat, 0, hat==='prop' ? 8.7 : 0, 0);

    group.updateMatrixWorld(true);                  // bind pose, group at identity
    const skeleton = new THREE.Skeleton(bones);

    // ---- the parts. `at` bakes a part into the bind pose of its bone.
    const parts = [];
    const at = (boneIndex, geo, color, local, colorAt)=>{
      if(local) geo.applyMatrix4(local);
      geo.applyMatrix4(bones[boneIndex].matrixWorld);
      parts.push({ geo, bone:boneIndex, color, colorAt });
      return geo;
    };
    const xf = (px,py,pz, sx,sy,sz, rz, ry)=>{
      const m = new THREE.Matrix4(), q = new THREE.Quaternion();
      q.setFromEuler(new THREE.Euler(0, ry||0, rz||0));
      return m.compose(new THREE.Vector3(px||0,py||0,pz||0), q,
                       new THREE.Vector3(sx===undefined?1:sx, sy===undefined?1:sy, sz===undefined?1:sz));
    };
    const DARK = new THREE.Color(0x1a1033), WHITE = new THREE.Color(0xfdfdff),
          RIM  = new THREE.Color(0x2b1a4d);

    // ---- legs: short stubs on two small rounded pads that lift on each step
    const feet = [];
    [[BONE.legL,-1],[BONE.legR,1]].forEach(([bi,s])=>{
      at(bi, limbGeometry(RIG.legR, RIG.legLen), limbCol);
      const footGeo = new THREE.SphereGeometry(RIG.footR,12,9);
      const footLocal = xf(0, -RIG.legLen, 1.6, 1.0, 0.6, 1.35, 0, s*0.13);
      // A hidden copy of the very same geometry, in the very same place, so the
      // rig check can still take a bounding box round a foot. It is never
      // rendered; it exists to be measured, and it cannot drift out of step
      // with the foot because it is the foot.
      const probe = new THREE.Mesh(footGeo.clone(), limbMat);
      probe.applyMatrix4(footLocal); probe.visible = false;
      bones[bi].add(probe); feet.push(probe);
      at(bi, footGeo, limbCol, footLocal);
    });

    // ---- arms: shoulder to just below the waist, tapering to a rounded mitt
    const hands = [];
    [[BONE.armL,-1],[BONE.armR,1]].forEach(([bi,s])=>{
      at(bi, limbGeometry(RIG.armR, RIG.armLen, RIG.armTipR), limbCol);
      const handGeo = new THREE.SphereGeometry(RIG.mittR,10,8);
      const handLocal = xf(0, -RIG.armLen, 0, 1, 1.15, 0.9);
      const probe = new THREE.Mesh(handGeo.clone(), limbMat);
      probe.applyMatrix4(handLocal); probe.visible = false;
      bones[bi].add(probe); hands.push(probe);
      at(bi, handGeo, limbCol, handLocal);
    });

    // ---- face. A wide oval on the upper third of the body, curved like the
    //      body so it sits on the surface rather than cutting a flat dish.
    //      The dark hairline behind it used to be a back-facing shell; in one
    //      merged mesh every triangle faces the same way, so it is now a
    //      slightly larger plate set far enough back to show only at the edge.
    at(BONE.face, new THREE.SphereGeometry(RIG.faceR*1.04, 18, 14), RIM,
       xf(0, 0, RIG.faceZ - 0.55, 1.22, 0.98, 0.52));
    at(BONE.face, new THREE.SphereGeometry(RIG.faceR, 20, 16), WHITE,
       xf(0, 0, RIG.faceZ, 1.22, 0.98, 0.52));

    // ---- eyes: two dots on the plate, shaped by the chosen expression
    const dotScale = eyes==='happy'  ? [1.30, 0.50, 0.45]
                   : eyes==='sleepy' ? [1.40, 0.26, 0.45]
                   :                   [1.00, 1.55, 0.45];
    [[BONE.scleraL, BONE.pupilL, -1],[BONE.scleraR, BONE.pupilR, 1]].forEach(([sb,pb,s],i)=>{
      // the "sclera" slot is kept so the idle blink still has something to squash
      at(sb, new THREE.SphereGeometry(2.5*FS, 10, 8), WHITE, xf(0,0,0, 1,1,0.3));
      at(pb, new THREE.SphereGeometry(2.0*FS, 12, 10), DARK,
         xf(0,0,0, dotScale[0], dotScale[1], dotScale[2]));
      if(eyes==='angry')
        at(BONE.face, new THREE.BoxGeometry(3.4*FS, 1.0*FS, 0.7), DARK,
           xf(s*eyeX, 2.6*FS, ez-0.15, 1,1,1, i===0 ? -0.42 : 0.42));
    });
    // A bean's face is just eyes. The tongue only shows in the locker's gurn.
    at(BONE.tongue, new THREE.SphereGeometry(1.3*FS,10,8),
       new THREE.Color(0xff4fa3), xf(0,0,0, 1,0.65,0.45));

    // ---- hat, on the crown. Scaled down: these were sized for a separate head.
    const GOLD = new THREE.Color(0xffcb3d);
    if(hat==='crown'){
      at(BONE.hat, new THREE.CylinderGeometry(7,5.8,6,5,1,false), GOLD, xf(0,3.0,0));
      for(let i=0;i<5;i++){
        const a=i/5*Math.PI*2;
        at(BONE.hat, new THREE.ConeGeometry(2,5.2,4), GOLD, xf(Math.cos(a)*6.6,8.2,Math.sin(a)*6.6));
      }
      at(BONE.hat, new THREE.SphereGeometry(1.9,8,6), new THREE.Color(0xff4fa3), xf(0,3.8,7));
    } else if(hat==='party'){
      // The stripes were a texture; on the shared material they are painted
      // into the vertices instead, which is why the cone gained segments.
      const teal = new THREE.Color(0x23e6c9), pink = new THREE.Color(0xff4fa3);
      at(BONE.hat, new THREE.ConeGeometry(5.6,16,12,10), null, xf(0,7.4,0),
         (c,g,i)=>{ c.copy(Math.floor(g.attributes.uv.getY(i)*7) % 2 ? pink : teal); });
      at(BONE.hat, new THREE.SphereGeometry(2.4,8,6), GOLD, xf(0,15.6,0));
    } else if(hat==='halo'){
      at(BONE.hat, new THREE.TorusGeometry(7.0,1.3,8,20), new THREE.Color(0xfff2a8),
         xf(0,7.4,0, 1,1,1).multiply(new THREE.Matrix4().makeRotationX(Math.PI/2)));
      hatGroup.userData.float = true; hatGroup.userData.floatBase = RIG.topY - 1.2;
    } else if(hat==='horns'){
      [-1,1].forEach(s=>{
        at(BONE.hat, new THREE.ConeGeometry(2.4,8,8), new THREE.Color(0xff5a4d),
           xf(s*5.8,2.6,0, 1,1,1, -s*0.5));
      });
    } else if(hat==='prop'){
      at(BONE.hat, new THREE.SphereGeometry(7.0,14,9,0,Math.PI*2,0,Math.PI/2),
         new THREE.Color(0x60a5fa), xf(0,-1.4,0));
      at(BONE.hat, new THREE.CylinderGeometry(0.65,0.65,4.4,6), DARK, xf(0,6.6,0));
      at(BONE.hatSpin, new THREE.BoxGeometry(13,0.9,2.3), new THREE.Color(0xff5a4d));
      hatGroup.userData.spin = hatSpin;
    }

    // ---- the two meshes
    const body = new THREE.SkinnedMesh(beanGeometry(), bodyMat);
    body.castShadow = true; body.frustumCulled = false;
    group.add(body); body.bind(skeleton, new THREE.Matrix4());

    const partsMat = new THREE.MeshLambertMaterial({ vertexColors:true });
    const trim = new THREE.SkinnedMesh(mergeParts(parts), partsMat);
    trim.castShadow = true; trim.frustumCulled = false;
    group.add(trim); trim.bind(skeleton, new THREE.Matrix4());

    // ---- no outline any more: the rim light in the material does that job.
    // The shell is kept for the invulnerability flash, and is otherwise hidden.
    // It hangs off the tilt bone, which is where the body it wraps hangs.
    const outMat = new THREE.MeshBasicMaterial({color:0xffffff, side:THREE.BackSide, transparent:true, opacity:0.55, depthWrite:false});
    const outline = new THREE.Mesh(beanOutlineGeometry(), outMat);
    outline.visible = false; tilt.add(outline);

    // ---- specials get an aura: a breathing shell plus motes drifting up off them
    let aura = null;
    if(skin.rarity === 'special'){
      aura = new THREE.Group();
      const col = new THREE.Color(skinBaseColor(skin));
      const shell = new THREE.Mesh(beanGeometry(), new THREE.MeshBasicMaterial({
        color:col, transparent:true, opacity:0.16, side:THREE.BackSide, depthWrite:false }));
      shell.scale.setScalar(1.42); aura.add(shell);
      const motes = [];
      for(let i=0;i<8;i++){
        const m = new THREE.Mesh(new THREE.SphereGeometry(1.7,8,6), new THREE.MeshBasicMaterial({
          color:col, transparent:true, opacity:0.85, depthWrite:false }));
        aura.add(m); motes.push(m);
      }
      aura.userData = {motes, shell};
      tilt.add(aura);
    }

    // ---- glow shell for the light-emitting skins
    if(skin.type==='neon'||skin.type==='rainbowneon'){
      const glow = new THREE.Mesh(beanGeometry(),
        new THREE.MeshBasicMaterial({color:new THREE.Color(skinBaseColor(skin)), transparent:true,
          opacity:0.14, side:THREE.BackSide, depthWrite:false}));
      glow.scale.setScalar(1.22); tilt.add(glow);
    }

    const armPivots = [armL, armR], legPivots = [legL, legR];
    armL.rotation.z = -0.30; armR.rotation.z = 0.30;    // flare clear of the hips
    return {group, tilt, aura, bodyMat, partsMat, outMat, outline, body, trim, skeleton,
            head, faceGroup, hatGroup, pupils, scleras, tongue,
            arms:armPivots, legs:legPivots, armPivots, legPivots, feet, hands};
  }
  // v6 name kept so nothing downstream breaks
  const makeBlob = makeCharacter;

  // Drives the special-skin aura. Called from both the race loop and the menu
  // preview, so a special reads the same wherever you see it.
  function animateAura(m, t){
    if(!m || !m.aura) return;
    const {motes, shell} = m.aura.userData;
    for(let i=0;i<motes.length;i++){
      const a  = t*1.5 + i*(Math.PI*2/motes.length);
      const rr = 15 + Math.sin(t*2.2 + i)*2.6;
      const rise = ((t*34 + i*7) % 52) - 10;          // drift upward, then loop
      motes[i].position.set(Math.cos(a)*rr, rise, Math.sin(a)*rr*0.92);
      motes[i].material.opacity = 0.20 + 0.55*Math.max(0, Math.sin(t*2.6 + i*0.8));
      const sc = 1 - clamp((rise+10)/62, 0, 1)*0.55;   // shrink as they rise
      motes[i].scale.setScalar(sc);
    }
    shell.material.opacity = 0.12 + Math.sin(t*2.4)*0.055;
  }
