  // ============================================================
  // CHARACTER RIG — one continuous bean, face plate, stubby limbs
  // ============================================================
  // Body and head are a single egg shape: no neck, no separate skull. The face is
  // a white plate sitting proud of the front with two dot eyes on it. The whole
  // figure still occupies the same 34-unit box the old sphere did, so the physics
  // (RADIUS = 17) is untouched.
  const RIG = {
    beanR:11.2, beanY:2.4, beanSY:1.50, beanSZ:0.93,   // egg: radius, centre, y/z scale
    topY:19.2,                                          // where a hat sits
    faceY:9.2, faceZ:7.4, faceR:6.4,
    hipY:-10.2, legLen:4.6, legR:3.0, legX:4.4,
    footR:4.2, footY:-14.6,
    shoulderY:7.6, shoulderX:10.1, armLen:8.4, armR:2.9,
    headR:11.2                                          // kept for the halo hat float
  };

  // A capsule built from a cylinder plus two spheres (r128 has no CapsuleGeometry).
  function makeLimb(r, len, mat){
    const g = new THREE.Group();
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
    mid.position.y = -len/2; mid.castShadow = true; g.add(mid);
    const top = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat); g.add(top);
    return g;
  }

  function makeCharacter(opts){
    const skin = opts.skin ? opts.skin : {id:'_flat', type:'solid', color:opts.color||'#ff4fa3'};
    const pattern = opts.pattern || null;
    const group = new THREE.Group();
    const { bodyMat, limbMat } = makeSkinMaterials(skin, pattern);

    // ---- the bean: body and head in one piece
    const body = new THREE.Mesh(new THREE.SphereGeometry(RIG.beanR, 22, 18), bodyMat);
    body.scale.set(1, RIG.beanSY, RIG.beanSZ);
    body.position.y = RIG.beanY; body.castShadow = true; group.add(body);

    // ---- cartoon outline: a single back-faced shell around the bean
    const outMat = new THREE.MeshBasicMaterial({color:0x1a1033, side:THREE.BackSide, transparent:true, opacity:1});
    const outline = new THREE.Group();
    const oBean = new THREE.Mesh(new THREE.SphereGeometry(RIG.beanR*1.085, 18, 14), outMat);
    oBean.scale.set(1, RIG.beanSY, RIG.beanSZ); oBean.position.y = RIG.beanY;
    outline.add(oBean); group.add(outline);

    // ---- glow shell for the light-emitting skins
    if(skin.type==='neon'||skin.type==='rainbowneon'){
      const glow = new THREE.Mesh(new THREE.SphereGeometry(RIG.beanR*1.3, 16, 12),
        new THREE.MeshBasicMaterial({color:new THREE.Color(skinBaseColor(skin)), transparent:true,
          opacity:0.15, side:THREE.BackSide, depthWrite:false}));
      glow.scale.set(1, RIG.beanSY, RIG.beanSZ); glow.position.y = RIG.beanY;
      group.add(glow);
    }

    // ---- legs: short stubs, big feet
    const legPivots=[], feet=[];
    [-1,1].forEach(s=>{
      const pivot=new THREE.Group(); pivot.position.set(s*RIG.legX, RIG.hipY, 0); group.add(pivot);
      pivot.add(makeLimb(RIG.legR, RIG.legLen, limbMat));
      const foot=new THREE.Mesh(new THREE.SphereGeometry(RIG.footR,12,9), limbMat);
      foot.position.set(0, -RIG.legLen, 1.8);
      foot.scale.set(1, 0.55, 1.45); foot.rotation.y = s*0.16; foot.castShadow=true;
      pivot.add(foot);
      legPivots.push(pivot); feet.push(foot);
    });

    // ---- arms: stubby, with mitten hands
    const armPivots=[];
    [-1,1].forEach(s=>{
      const pivot=new THREE.Group(); pivot.position.set(s*RIG.shoulderX, RIG.shoulderY, 0); group.add(pivot);
      pivot.rotation.z = s*0.20;                        // resting flare
      pivot.add(makeLimb(RIG.armR, RIG.armLen, limbMat));
      const hand=new THREE.Mesh(new THREE.SphereGeometry(RIG.armR*1.32,10,8), limbMat);
      hand.position.y=-RIG.armLen; hand.scale.set(1,1.1,1); hand.castShadow=true; pivot.add(hand);
      armPivots.push(pivot);
    });

    // ---- face. `head` is a pivot at the bean's centre so a small turn swings the
    //      plate round the surface, the way the whole head appears to turn.
    const head = new THREE.Group(); head.position.y = RIG.beanY; group.add(head);
    const faceGroup = new THREE.Group(); faceGroup.position.y = RIG.faceY - RIG.beanY; head.add(faceGroup);

    const plate = new THREE.Mesh(new THREE.SphereGeometry(RIG.faceR, 20, 16),
      new THREE.MeshLambertMaterial({color:0xfdfdff}));
    plate.scale.set(1.06, 1.16, 0.34); plate.position.z = RIG.faceZ;
    faceGroup.add(plate);
    // a thin dark rim so the plate reads against a pale skin
    const plateRim = new THREE.Mesh(new THREE.SphereGeometry(RIG.faceR*1.045, 18, 14),
      new THREE.MeshBasicMaterial({color:0x1a1033, side:THREE.BackSide}));
    plateRim.scale.set(1.06, 1.16, 0.34); plateRim.position.z = RIG.faceZ - 0.15;
    faceGroup.add(plateRim);

    // ---- eyes: two dots on the plate, shaped by the chosen expression
    const eyeGroup = new THREE.Group(); faceGroup.add(eyeGroup);
    const eyes = opts.eyes||'round';
    const pupils=[], scleras=[];
    const ez = RIG.faceZ + 2.05;
    [-2.5, 2.5].forEach((x,i)=>{
      // the "sclera" slot is kept so the idle blink still has something to squash
      const slot = new THREE.Mesh(new THREE.SphereGeometry(1.9, 10, 8),
        new THREE.MeshBasicMaterial({color:0xfdfdff}));
      slot.position.set(x, 0.4, ez-0.35); slot.scale.set(1,1,0.35); eyeGroup.add(slot); scleras.push(slot);

      const dot = new THREE.Mesh(new THREE.SphereGeometry(1.45, 12, 10), darkMat);
      dot.position.set(x, 0.4, ez); dot.scale.set(1, 1.3, 0.5);
      eyeGroup.add(dot); pupils.push(dot);

      if(eyes==='happy'){ dot.scale.set(1.25, 0.55, 0.5); dot.position.y=1.0; }
      if(eyes==='sleepy'){ dot.scale.set(1.35, 0.30, 0.5); dot.position.y=0.2; }
      if(eyes==='angry'){
        const brow = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.05, 0.9), darkMat);
        brow.position.set(x, 2.5, ez-0.2); brow.rotation.z = (i===0? -0.42 : 0.42); eyeGroup.add(brow);
      }
    });

    // Fall-Guys faces are just eyes — the mouth only shows when pulling a face.
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(1.7,0.55,6,12,Math.PI), darkMat);
    mouth.position.set(0,-2.6,ez-0.3); mouth.rotation.z=Math.PI; mouth.scale.z=0.4;
    mouth.visible=false; faceGroup.add(mouth);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(1.6,10,8), new THREE.MeshLambertMaterial({color:0xff4fa3}));
    tongue.position.set(0,-3.4,ez-0.2); tongue.scale.set(1,0.65,0.5); tongue.visible=false; faceGroup.add(tongue);

    // ---- hat, on the crown of the bean
    const hatGroup = new THREE.Group(); hatGroup.position.y = RIG.topY - RIG.beanY; head.add(hatGroup);
    const hat = opts.hat||'none';
    if(hat==='crown'){
      const c = new THREE.Mesh(new THREE.CylinderGeometry(7,5.8,6,5,1,true), new THREE.MeshLambertMaterial({color:0xffcb3d, side:THREE.DoubleSide}));
      c.position.y=3.4; hatGroup.add(c);
      for(let i=0;i<5;i++){ const spike=new THREE.Mesh(new THREE.ConeGeometry(2,5.2,4), new THREE.MeshLambertMaterial({color:0xffcb3d})); const a=i/5*Math.PI*2; spike.position.set(Math.cos(a)*6.6,8.6,Math.sin(a)*6.6); hatGroup.add(spike); }
      const gem=new THREE.Mesh(new THREE.SphereGeometry(1.9,8,6), new THREE.MeshPhongMaterial({color:0xff4fa3,shininess:100})); gem.position.set(0,4.2,7); hatGroup.add(gem);
    } else if(hat==='party'){
      const cone=new THREE.Mesh(new THREE.ConeGeometry(6,17,12), new THREE.MeshLambertMaterial({map:stripeTexture('#23e6c9','#ff4fa3')})); cone.position.y=8; cone.castShadow=true; hatGroup.add(cone);
      const pom=new THREE.Mesh(new THREE.SphereGeometry(2.6,8,6), new THREE.MeshLambertMaterial({color:0xffcb3d})); pom.position.y=17; hatGroup.add(pom);
    } else if(hat==='halo'){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(7.6,1.4,8,20), new THREE.MeshPhongMaterial({color:0xfff2a8, emissive:0xffcc44, emissiveIntensity:0.6, shininess:80}));
      ring.rotation.x=Math.PI/2; ring.position.y=8; hatGroup.add(ring); hatGroup.userData.float=true;
      hatGroup.userData.floatBase = RIG.topY - RIG.beanY;
    } else if(hat==='horns'){
      [-1,1].forEach(s=>{ const h=new THREE.Mesh(new THREE.ConeGeometry(2.6,9,8), new THREE.MeshLambertMaterial({color:0xff5a4d})); h.position.set(s*6.4,3.0,0); h.rotation.z=-s*0.5; hatGroup.add(h); });
    } else if(hat==='prop'){
      const cap=new THREE.Mesh(new THREE.SphereGeometry(8.2,12,8,0,Math.PI*2,0,Math.PI/2), new THREE.MeshLambertMaterial({color:0x60a5fa})); cap.position.y=-1.6; hatGroup.add(cap);
      const stick=new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.7,5,6), darkMat); stick.position.y=8; hatGroup.add(stick);
      const prop=new THREE.Mesh(new THREE.BoxGeometry(15,1,2.6), new THREE.MeshLambertMaterial({color:0xff5a4d})); prop.position.y=10.5; hatGroup.add(prop); hatGroup.userData.spin=prop;
    }

    return {group, bodyMat, outMat, outline, body, head, faceGroup, plate, hatGroup, eyeGroup,
            pupils, scleras, mouth, tongue, arms:armPivots, legs:legPivots,
            armPivots, legPivots, feet};
  }
  // v6 name kept so nothing downstream breaks
  const makeBlob = makeCharacter;
