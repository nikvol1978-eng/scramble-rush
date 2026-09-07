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

  // A stubby capsule. No ball at the shoulder end — the joint sits inside the
  // body, and an extra sphere there just bulges through the surface.
  function makeLimb(r, len, mat, rTip){
    const g = new THREE.Group();
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(r, rTip||r*0.94, len, 10), mat);
    mid.position.y = -len/2; mid.castShadow = true; g.add(mid);
    return g;
  }

  function makeCharacter(opts){
    const skin = opts.skin ? opts.skin : {id:'_flat', type:'solid', color:opts.color||'#ff4fa3'};
    const pattern = opts.pattern || null;
    const group = new THREE.Group();
    // Pitch lives on its own pivot inside the yaw group. Putting rotation.x on
    // `group` alongside rotation.y would apply it in the wrong order (Three's
    // default XYZ euler), so a diving racer facing sideways would tilt oddly.
    const tilt = new THREE.Group(); group.add(tilt);
    const { bodyMat, limbMat } = makeSkinMaterials(skin, pattern);

    // ---- the bean
    const body = new THREE.Mesh(beanGeometry(), bodyMat);
    body.castShadow = true; tilt.add(body);

    // ---- no outline any more: the rim light in the material does that job.
    // The shell is kept for the invulnerability flash, and is otherwise hidden.
    const outMat = new THREE.MeshBasicMaterial({color:0xffffff, side:THREE.BackSide, transparent:true, opacity:0.55, depthWrite:false});
    const outline = new THREE.Group();
    outline.add(new THREE.Mesh(beanOutlineGeometry(), outMat));
    outline.visible = false;
    tilt.add(outline);

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

    // ---- legs: short stubs on two small rounded pads that lift on each step
    const legPivots=[], feet=[];
    [-1,1].forEach(s=>{
      const pivot=new THREE.Group(); pivot.position.set(s*RIG.legX, RIG.hipY, 0); tilt.add(pivot);
      pivot.add(makeLimb(RIG.legR, RIG.legLen, limbMat));
      const foot=new THREE.Mesh(new THREE.SphereGeometry(RIG.footR,12,9), limbMat);
      foot.position.set(0, -RIG.legLen, 1.6);
      foot.scale.set(1.0, 0.6, 1.35); foot.rotation.y = s*0.13; foot.castShadow=true;
      pivot.add(foot);
      legPivots.push(pivot); feet.push(foot);
    });

    // ---- arms: shoulder to just below the waist, tapering to a rounded mitt
    const armPivots=[], hands=[];
    [-1,1].forEach(s=>{
      const pivot=new THREE.Group(); pivot.position.set(s*RIG.shoulderX, RIG.shoulderY, 0); tilt.add(pivot);
      pivot.rotation.z = s*0.30;                         // flare clear of the hips
      pivot.add(makeLimb(RIG.armR, RIG.armLen, limbMat, RIG.armTipR));
      const hand=new THREE.Mesh(new THREE.SphereGeometry(RIG.mittR,10,8), limbMat);
      hand.position.y=-RIG.armLen; hand.scale.set(1,1.15,0.9); hand.castShadow=true; pivot.add(hand);
      armPivots.push(pivot); hands.push(hand);
    });

    // ---- face. `head` pivots about the bean's centre so a small turn swings the
    //      plate round the surface, the way a whole head appears to turn.
    const head = new THREE.Group(); tilt.add(head);
    const faceGroup = new THREE.Group(); faceGroup.position.y = RIG.faceY; head.add(faceGroup);

    // A wide oval on the upper third of the body. Curved like the body, so
    // it sits on the surface rather than cutting a flat dish into it.
    const plate = new THREE.Mesh(new THREE.SphereGeometry(RIG.faceR, 20, 16),
      new THREE.MeshLambertMaterial({color:0xfdfdff}));
    plate.scale.set(1.22, 0.98, 0.52); plate.position.z = RIG.faceZ;
    faceGroup.add(plate);
    // a hairline rim, or the plate vanishes on a pale skin
    const plateRim = new THREE.Mesh(new THREE.SphereGeometry(RIG.faceR*1.03, 18, 14),
      new THREE.MeshBasicMaterial({color:0x2b1a4d, side:THREE.BackSide}));
    plateRim.scale.set(1.22, 0.98, 0.52); plateRim.position.z = RIG.faceZ - 0.1;
    faceGroup.add(plateRim);

    // ---- eyes: two dots on the plate, shaped by the chosen expression
    const eyeGroup = new THREE.Group(); faceGroup.add(eyeGroup);
    const eyes = opts.eyes||'round';
    const pupils=[], scleras=[];
    const ez = RIG.faceZ + RIG.faceR*0.52 - 0.6;
    // Everything on the face is a fraction of the face, so a bigger head gets
    // bigger eyes rather than the same two dots lost on a wider plate.
    const FS = RIG.faceR/7.0;
    [-RIG.faceR*0.45, RIG.faceR*0.45].forEach((x,i)=>{
      // the "sclera" slot is kept so the idle blink still has something to squash
      const slot = new THREE.Mesh(new THREE.SphereGeometry(2.5*FS, 10, 8),
        new THREE.MeshBasicMaterial({color:0xfdfdff}));
      slot.position.set(x, 0.5*FS, ez-0.3); slot.scale.set(1,1,0.3); eyeGroup.add(slot); scleras.push(slot);

      // two tall ovals
      const dot = new THREE.Mesh(new THREE.SphereGeometry(2.0*FS, 12, 10), darkMat);
      dot.position.set(x, 0.6*FS, ez); dot.scale.set(1, 1.55, 0.45);
      eyeGroup.add(dot); pupils.push(dot);

      if(eyes==='happy'){ dot.scale.set(1.30, 0.50, 0.45); dot.position.y=1.0*FS; }
      if(eyes==='sleepy'){ dot.scale.set(1.40, 0.26, 0.45); dot.position.y=0.3*FS; }
      if(eyes==='angry'){
        const brow = new THREE.Mesh(new THREE.BoxGeometry(3.4*FS, 1.0*FS, 0.7), darkMat);
        brow.position.set(x, 2.6*FS, ez-0.15); brow.rotation.z = (i===0? -0.42 : 0.42); eyeGroup.add(brow);
      }
    });

    // A bean's face is just eyes — the mouth only shows when pulling a face.
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(1.4*FS,0.45*FS,6,12,Math.PI), darkMat);
    mouth.position.set(0,-2.4*FS,ez-0.25); mouth.rotation.z=Math.PI; mouth.scale.z=0.4;
    mouth.visible=false; faceGroup.add(mouth);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(1.3*FS,10,8), new THREE.MeshLambertMaterial({color:0xff4fa3}));
    tongue.position.set(0,-3.2*FS,ez-0.15); tongue.scale.set(1,0.65,0.45); tongue.visible=false; faceGroup.add(tongue);

    // ---- hat, on the crown. Scaled down: these were sized for a separate head.
    const hatGroup = new THREE.Group();
    hatGroup.position.y = RIG.topY - 1.2; hatGroup.scale.setScalar(RIG.hatScale); head.add(hatGroup);
    const hat = opts.hat||'none';
    if(hat==='crown'){
      const c = new THREE.Mesh(new THREE.CylinderGeometry(7,5.8,6,5,1,true), new THREE.MeshLambertMaterial({color:0xffcb3d, side:THREE.DoubleSide}));
      c.position.y=3.0; hatGroup.add(c);
      for(let i=0;i<5;i++){ const spike=new THREE.Mesh(new THREE.ConeGeometry(2,5.2,4), new THREE.MeshLambertMaterial({color:0xffcb3d})); const a=i/5*Math.PI*2; spike.position.set(Math.cos(a)*6.6,8.2,Math.sin(a)*6.6); hatGroup.add(spike); }
      const gem=new THREE.Mesh(new THREE.SphereGeometry(1.9,8,6), new THREE.MeshPhongMaterial({color:0xff4fa3,shininess:100})); gem.position.set(0,3.8,7); hatGroup.add(gem);
    } else if(hat==='party'){
      const cone=new THREE.Mesh(new THREE.ConeGeometry(5.6,16,12), new THREE.MeshLambertMaterial({map:stripeTexture('#23e6c9','#ff4fa3')})); cone.position.y=7.4; cone.castShadow=true; hatGroup.add(cone);
      const pom=new THREE.Mesh(new THREE.SphereGeometry(2.4,8,6), new THREE.MeshLambertMaterial({color:0xffcb3d})); pom.position.y=15.6; hatGroup.add(pom);
    } else if(hat==='halo'){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(7.0,1.3,8,20), new THREE.MeshPhongMaterial({color:0xfff2a8, emissive:0xffcc44, emissiveIntensity:0.6, shininess:80}));
      ring.rotation.x=Math.PI/2; ring.position.y=7.4; hatGroup.add(ring);
      hatGroup.userData.float=true; hatGroup.userData.floatBase = RIG.topY - 1.2;
    } else if(hat==='horns'){
      [-1,1].forEach(s=>{ const h=new THREE.Mesh(new THREE.ConeGeometry(2.4,8,8), new THREE.MeshLambertMaterial({color:0xff5a4d})); h.position.set(s*5.8,2.6,0); h.rotation.z=-s*0.5; hatGroup.add(h); });
    } else if(hat==='prop'){
      const cap=new THREE.Mesh(new THREE.SphereGeometry(7.0,14,9,0,Math.PI*2,0,Math.PI/2), new THREE.MeshLambertMaterial({color:0x60a5fa})); cap.position.y=-1.4; hatGroup.add(cap);
      const stick=new THREE.Mesh(new THREE.CylinderGeometry(0.65,0.65,4.4,6), darkMat); stick.position.y=6.6; hatGroup.add(stick);
      const prop=new THREE.Mesh(new THREE.BoxGeometry(13,0.9,2.3), new THREE.MeshLambertMaterial({color:0xff5a4d})); prop.position.y=8.7; hatGroup.add(prop); hatGroup.userData.spin=prop;
    }

    return {group, tilt, aura, bodyMat, outMat, outline, body, head, faceGroup, plate, hatGroup, eyeGroup,
            pupils, scleras, mouth, tongue, arms:armPivots, legs:legPivots,
            armPivots, legPivots, feet, hands};
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
