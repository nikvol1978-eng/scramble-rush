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
  // v24 §6: THE FACE IS A CAP ON THE HEAD, NOT A DISC INSIDE IT.
  //
  // v22 widened the head bulge to maxR 12.4 at y 8.6 and the face kept v20's
  // placement -- faceZ 6.8 with a plate squashed to 0.52 in z, so the plate's
  // front sat at z 10.96 against a skin at radius 12.29. It was 1.33 units
  // UNDER the surface: a plain pink head with two dots grazing it, which is
  // what the lobby actually showed. Pushing faceZ out on its own does not fix
  // that, it only floats the middle of a flat disc off a round head and leaves
  // the edges hanging in the air.
  //
  // So the plate is now a SPHERICAL CAP concentric with the head, of radius
  // (head radius at faceY + facePROUD). Every point on it is therefore the same
  // small distance off a curved surface -- it hugs the head by construction
  // rather than by a number somebody tuned -- and the cap's angular size is
  // derived from the width and height the face is supposed to have.
  // v25 §1: THE ATHLETIC PASS. The silhouette the reference study argued for is
  // not a rounder bean, it is a bean with JOINTS. Three numbers moved and the
  // rest follows from them:
  //
  //   * narrower. maxR 12.4 -> 12.0, and the stance grew, which takes the
  //     crown-to-sole ratio from 1.38 : 1 to 1.49 : 1 measured. Check 5 allows
  //     1.30-1.55, so this is the athletic end of the band the game already
  //     agreed to rather than a new licence to be tall.
  //   * a real waist. The pinch went from 10.8 to 9.5, so the head reads as a
  //     head against something narrower instead of against a barely-dented
  //     column, and there is a place for a belt to sit.
  //   * a shoulder shelf at 5.4, wider than the waist and narrower than the
  //     head. That is the "wider shoulders than the reference" line in the
  //     brief: the reference has NO shoulder, it is one smooth capsule, so a
  //     shelf is the cheapest thing that stops us reading as a copy of it.
  //
  // Limbs are now two segments each. A knee is what makes a run legible --
  // measured on the reference, knee flexion is 17-21 deg at a walk and 45-49
  // at a jog, a bigger swing than the hip's -- and our old leg had none, so it
  // scissored and slid its foot up rather than bending.
  const RIG = {
    topY:18.6, bottomY:-8.4, maxR:12.0,
    // ON THE WIDEST LINE OF THE HEAD, not up by the crown. At 10.2 the plate's
    // top edge reached y 18.04 against a topY of 18.6, which is why there was
    // no pink left for a hat to sit on and every hat landed on the face.
    faceY:8.8,
    // everything ON the face -- eyes, pupils, mouth, cheeks -- scales off this
    faceR:6.4,
    // how far the plate stands off the skin. 0.6-1.0 is the brief; 0.7 in the
    // middle keeps the whole cap inside that band once the head curves away.
    facePROUD:0.7,
    // the plate's half-extents. Width is about 1.5x the eye spacing (2*eyeX,
    // and eyeX is faceR*0.45, so 1.5x is 5.1); height is about 0.6 of the head
    // bulge, which runs from the waist pinch at 2.4 to topY 18.6.
    faceHalfW:4.3, faceHalfH:3.7,

    // ---- legs: hip -> knee -> ankle -> shoe.
    // Short and strong: 5.5 units of leg under a 28-unit body, so the figure
    // still sits low and heavy. The segments are equal so a bent knee reads as
    // a knee rather than as a broken shin. The sole lands just under -17, which
    // with a crown at 18.6 and a 24.0-wide body measures 1.49 : 1.
    hipY:-7.6, thighLen:3.2, shinLen:3.2, legX:4.4,
    legR:3.15, kneeR:2.85, ankleR:2.55,
    // The shoe is a separate chunky block, not the end of the leg: 6.9 across
    // and 8.4 long against a 2.55 ankle, so it overhangs the leg on every side
    // and reads as footwear. 19% of height wide, where the reference is 15%.
    footR:3.0, footScale:[1.00, 0.73, 1.40], footDY:-0.05, footDZ:1.30,

    // ---- arms: shoulder -> elbow -> wrist -> mitt.
    // The shoulder sits INSIDE the shell (body radius at y 4.2 is 10.4 against
    // a shoulderX of 9.9), so the joint is never a ball floating on the skin.
    shoulderY:4.2, shoulderX:9.9, upperLen:4.6, foreLen:4.6,
    armR:2.95, elbowR:2.60, armTipR:2.35,
    // 6.7 across, 19% of height -- the reference's hand is 17% and its depth
    // 21%, so a mitt this size is in the same family without being the shape.
    mittR:3.35,

    // ---- suit. Three landmarks down the front, which is what lets a later
    // skin repaint panels instead of repainting one smooth egg.
    // The pinch at 2.4 sits directly under the head bulge, so it reads as a
    // COLLAR, not a waist -- the belt belongs lower, on the actual hips.
    collarY:2.4, collarR:0.50, beltY:-4.0, beltR:0.62,
    emblemY:-0.5, emblemProud:0.30, emblemHalfW:2.7, emblemHalfH:2.3,
    hatScale:0.98
  };
  RIG.waistY = (RIG.topY + RIG.bottomY)/2;

  // Profile of the bean, bottom to top. x is radius, y is height.
  // Bottom to top: a rounded base, a body that swells and then pinches at the
  // waist, and above it a head bulge wider than the body -- which is what puts
  // the head in the silhouette instead of leaving one flat oval.
  // v25: the same four landmarks, moved apart. Hips, then a waist pinched to
  // 9.5 (was 10.8), then a shoulder shelf at 11.1, then the head at 12.0. Four
  // distinct widths up the figure instead of two, which is what gives the
  // silhouette something to read at gameplay distance where detail is gone.
  const BEAN_PROFILE = [
    [0.0, -8.4], [3.4, -8.2], [6.2, -7.4], [8.4, -5.6], [ 9.8, -3.0],
    [10.5, -0.8], [ 9.5,  2.4],
    [11.1,  5.4], [12.0,  8.8], [11.8, 11.8],
    [10.8, 14.4], [ 8.8, 16.6], [5.4, 18.0], [0.0, 18.6]
  ];
  // The head's radius at a height, straight off the profile the lathe is built
  // from. The face reads this rather than carrying its own copy of 12.4, so a
  // head that changes shape takes its face with it instead of swallowing it --
  // which is exactly the regression v22 shipped.
  function beanRadiusAt(y){
    const p = BEAN_PROFILE;
    for(let i=0;i<p.length-1;i++){
      const [r0,y0] = p[i], [r1,y1] = p[i+1];
      if(y >= Math.min(y0,y1) && y <= Math.max(y0,y1)){
        const t = (y - y0) / (y1 - y0);
        return r0 + t*(r1 - r0);
      }
    }
    return RIG.maxR;
  }
  // The cap's radius, and the angles that give it the width and height asked
  // for. asin because the half-extent is a chord across a sphere of that radius.
  const FACE_R3 = beanRadiusAt(RIG.faceY) + RIG.facePROUD;
  const FACE_DPHI   = Math.asin(Math.min(0.95, RIG.faceHalfW / FACE_R3));
  const FACE_DTHETA = Math.asin(Math.min(0.95, RIG.faceHalfH / FACE_R3));
  // A cap centred on +z at the head's widest line. `grow` widens the angles for
  // the dark rim behind the white plate.
  // v25 §2: TESSELLATION, NOT SHAPE. Nothing below changes a radius, a length
  // or a pose -- only how many segments each rounded piece is built from. The
  // jointed limbs and the suit took the racer from 3,644 triangles to 7,836,
  // and at twenty-four racers that is an extra hundred thousand triangles a
  // frame, which pushed the Medium frame past its 14ms cap. The face caps alone
  // were 2,080 of them: 26x20 segments across a cap spanning 0.7 radians is a
  // segment every degree and a half, on a part that is a few dozen pixels wide
  // in play. These are the lowest counts that still read smooth at the lobby
  // camera, which is the closest the player ever gets to the model.
  function faceCapGeometry(radius, grow){
    const dphi = FACE_DPHI*(grow||1), dth = FACE_DTHETA*(grow||1);
    return new THREE.SphereGeometry(radius, 16, 12,
      Math.PI/2 - dphi, dphi*2, Math.PI/2 - dth, dth*2);
  }
  // Where a feature at height `dy` above the cap's centre sits ON the cap, and
  // how far to pitch it so it lies flat against the curve there. One helper, so
  // an eye, a mouth and a cheek cannot each drift off the surface differently.
  const faceOn = (dy, dx, out)=>{
    const r = FACE_R3 + (out||0);
    const z = Math.sqrt(Math.max(0.01, r*r - dy*dy - (dx||0)*(dx||0)));
    return { y:dy, z, pitch:Math.asin(Math.max(-1, Math.min(1, -dy/r))) };
  };
  // v25: the same two ideas, freed from the face so the SUIT can use them. A
  // cap of any size, anywhere on the shell, and a point on that cap. The chest
  // badge is built exactly the way the face is, for exactly the same reason:
  // anything flat laid on a round body either floats at the middle or sinks at
  // the edges, and tuning a z until it looks right only hides which one.
  function capGeometry(radius, halfW, halfH, segW, segH){
    const dphi = Math.asin(Math.min(0.95, halfW/radius));
    const dth  = Math.asin(Math.min(0.95, halfH/radius));
    return new THREE.SphereGeometry(radius, segW||12, segH||9,
      Math.PI/2 - dphi, dphi*2, Math.PI/2 - dth, dth*2);
  }
  const capOn = (radius, dy, dx, out)=>{
    const r = radius + (out||0);
    const z = Math.sqrt(Math.max(0.01, r*r - dy*dy - (dx||0)*(dx||0)));
    return { y:dy, z, pitch:Math.asin(Math.max(-1, Math.min(1, -dy/r))) };
  };

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
  // Indices 0-14 are exactly what they were. The locker, the checks and the
  // profile screen all reach for bones by name off the returned object, but the
  // merged geometry stores a bone INDEX per vertex, so renumbering the existing
  // ones would silently re-parent every part of every character. The new joints
  // are appended instead.
  const BONE = { tilt:0, body:1, legL:2, legR:3, armL:4, armR:5, head:6, face:7,
                 scleraL:8, scleraR:9, pupilL:10, pupilR:11, tongue:12,
                 hat:13, hatSpin:14,
                 // v25: the second segment of each limb, and the thing on the end
                 kneeL:15, kneeR:16, footL:17, footR:18,
                 elbowL:19, elbowR:20, handL:21, handR:22 };
  const BONE_COUNT = 23;

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
    const g = new THREE.CylinderGeometry(r, rTip||r*0.94, len, 8);
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
    const bodyBone = bone(BONE.body, BONE.tilt, 0, 0, 0);
    const legL = bone(BONE.legL, BONE.tilt, -RIG.legX, RIG.hipY, 0);
    const legR = bone(BONE.legR, BONE.tilt,  RIG.legX, RIG.hipY, 0);
    const armL = bone(BONE.armL, BONE.tilt, -RIG.shoulderX, RIG.shoulderY, 0);
    const armR = bone(BONE.armR, BONE.tilt,  RIG.shoulderX, RIG.shoulderY, 0);
    // v25: the second segment of each limb hangs off the end of the first, so
    // a rotation on the knee bends the leg instead of shearing it. Every one of
    // these stands at the END of its parent (0, -parentLength, 0), which is why
    // the animation can treat them as plain hinge angles.
    const kneeL = bone(BONE.kneeL, BONE.legL, 0, -RIG.thighLen, 0);
    const kneeR = bone(BONE.kneeR, BONE.legR, 0, -RIG.thighLen, 0);
    const footL = bone(BONE.footL, BONE.kneeL, 0, -RIG.shinLen, 0);
    const footR = bone(BONE.footR, BONE.kneeR, 0, -RIG.shinLen, 0);
    const elbowL = bone(BONE.elbowL, BONE.armL, 0, -RIG.upperLen, 0);
    const elbowR = bone(BONE.elbowR, BONE.armR, 0, -RIG.upperLen, 0);
    const handL = bone(BONE.handL, BONE.elbowL, 0, -RIG.foreLen, 0);
    const handR = bone(BONE.handR, BONE.elbowR, 0, -RIG.foreLen, 0);
    const head = bone(BONE.head, BONE.tilt, 0, 0, 0);
    const faceGroup = bone(BONE.face, BONE.head, 0, RIG.faceY, 0);

    const FS = RIG.faceR/7.0;                       // everything on the face scales with it
    const eyeX = RIG.faceR*0.45;
    const eyes = opts.eyes||'round';
    // EYES JUST ABOVE THE PLATE'S CENTRE, MOUTH BELOW IT. Every one of these
    // sits ON the cap: `faceOn` gives the z that puts a feature on the curve at
    // that height, so nothing is left floating in front of the middle of the
    // face or sunk into its edge.
    const EYE_DY = 1.35*FS, MOUTH_DY = -2.45*FS;
    const eyeAt = faceOn(EYE_DY, eyeX);
    const scleras = [ bone(BONE.scleraL, BONE.face, -eyeX, EYE_DY, eyeAt.z-0.25),
                      bone(BONE.scleraR, BONE.face,  eyeX, EYE_DY, eyeAt.z-0.25) ];
    // the pupil sits where its expression puts it; the locker's look-at moves
    // it from there, so the bone has to stand at the rest position
    const pupilDY = EYE_DY + (eyes==='happy' ? 0.40*FS : eyes==='sleepy' ? -0.30*FS : 0);
    const pupilAt = faceOn(pupilDY, eyeX);
    const pupils = [ bone(BONE.pupilL, BONE.face, -eyeX, pupilDY, pupilAt.z),
                     bone(BONE.pupilR, BONE.face,  eyeX, pupilDY, pupilAt.z) ];
    const tongueAt = faceOn(MOUTH_DY - 1.5*FS, 0);
    const tongue = bone(BONE.tongue, BONE.face, 0, tongueAt.y, tongueAt.z - 0.15);
    tongue.scale.setScalar(0.0001);                 // only the locker's gurn shows it

    const hat = opts.hat||'none';
    const hatGroup = bone(BONE.hat, BONE.head, 0, RIG.topY - 1.2, 0);
    hatGroup.scale.setScalar(RIG.hatScale);
    // THE CROWN LEANS BACK. Its five points are the one hat that reads as
    // pointing INTO the face from the lobby camera even with the band clear
    // above the plate, because the camera looks slightly down. A small pitch
    // takes the points away from the eyes and looks worn rather than balanced.
    // Set before the bind pose is taken, so it is baked in with everything else
    // rather than being a rotation the animation code has to remember.
    if(hat==='crown') hatGroup.rotation.x = -0.15;
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

    // A hidden copy of a part, in the same place, so a check can still take a
    // bounding box round something that has been merged away. Same trick the
    // feet and hands already use, and the same reason: after the merge there is
    // one geometry for the whole trim mesh and no way to ask it where the face
    // is. Clone BEFORE `at` touches the geometry — `at` bakes the transforms
    // into it in place, so a probe made afterwards would be double-transformed.
    const probeOf = (boneIndex, geo, local)=>{
      const p = new THREE.Mesh(geo.clone(), limbMat);
      if(local) p.applyMatrix4(local);
      p.visible = false;
      bones[boneIndex].add(p);
      return p;
    };
    const hatProbes = [];
    let mouthProbe = null;

    // The shoe and the cuff are the limb colour taken down and up a step. Two
    // shades off one colour, so a skin that sets a limb colour gets footwear
    // that matches it without the skin having to know footwear exists.
    const shoeCol = limbCol.clone().multiplyScalar(0.66);
    const cuffCol = limbCol.clone().lerp(new THREE.Color(0xffffff), 0.34);

    // ---- legs: thigh, knee, shin, and a chunky shoe on the end.
    // A ball at the knee and the ankle, sized to the segment that meets it, is
    // what keeps a bent leg from showing the open end of a cylinder. It costs
    // two small spheres and it is the whole difference between "jointed" and
    // "two sticks that happen to touch".
    const feet = [];
    [[BONE.legL,BONE.kneeL,BONE.footL,-1],[BONE.legR,BONE.kneeR,BONE.footR,1]]
    .forEach(([li,ki,fi,s])=>{
      at(li, limbGeometry(RIG.legR, RIG.thighLen, RIG.kneeR), limbCol);
      at(ki, new THREE.SphereGeometry(RIG.kneeR, 8, 6), limbCol);
      at(ki, limbGeometry(RIG.kneeR, RIG.shinLen, RIG.ankleR), limbCol);
      at(fi, new THREE.SphereGeometry(RIG.ankleR, 6, 5), limbCol);
      const footGeo = new THREE.SphereGeometry(RIG.footR, 10, 7);
      const footLocal = xf(0, RIG.footDY, RIG.footDZ,
                           RIG.footScale[0], RIG.footScale[1], RIG.footScale[2], 0, s*0.10);
      // A hidden copy of the very same geometry, in the very same place, so the
      // rig check can still take a bounding box round a foot. It is never
      // rendered; it exists to be measured, and it cannot drift out of step
      // with the foot because it is the foot. It hangs off the FOOT bone now,
      // so what check 5 measures is where the ankle actually put the shoe.
      const probe = new THREE.Mesh(footGeo.clone(), limbMat);
      probe.applyMatrix4(footLocal); probe.visible = false;
      bones[fi].add(probe); feet.push(probe);
      at(fi, footGeo, shoeCol, footLocal);
      // the sole: a thinner, wider slab under the shoe, in the cuff shade
      at(fi, new THREE.SphereGeometry(RIG.footR, 10, 5), cuffCol,
         xf(0, RIG.footDY - RIG.footR*0.50, RIG.footDZ,
            RIG.footScale[0]*1.02, RIG.footScale[1]*0.34, RIG.footScale[2]*1.00, 0, s*0.10));
    });

    // ---- arms: shoulder, elbow, forearm, mitt.
    const hands = [];
    [[BONE.armL,BONE.elbowL,BONE.handL,-1],[BONE.armR,BONE.elbowR,BONE.handR,1]]
    .forEach(([ai,ei,hi,s])=>{
      at(ai, limbGeometry(RIG.armR, RIG.upperLen, RIG.elbowR), limbCol);
      at(ei, new THREE.SphereGeometry(RIG.elbowR, 8, 6), limbCol);
      at(ei, limbGeometry(RIG.elbowR, RIG.foreLen, RIG.armTipR), limbCol);
      // the cuff: a band where the sleeve ends and the mitt begins, so the hand
      // reads as worn rather than as a ball stuck on a stick
      at(hi, new THREE.SphereGeometry(RIG.armTipR*1.20, 8, 5), cuffCol,
         xf(0, RIG.mittR*0.62, 0, 1, 0.55, 1));
      const handGeo = new THREE.SphereGeometry(RIG.mittR, 9, 7);
      const handLocal = xf(0, 0, 0.25, 1, 1.15, 0.90);
      const probe = new THREE.Mesh(handGeo.clone(), limbMat);
      probe.applyMatrix4(handLocal); probe.visible = false;
      bones[hi].add(probe); hands.push(probe);
      at(hi, handGeo, limbCol, handLocal);
      // The thumb. One small ball on the inboard face is the whole difference
      // between a mitten and a bean bag, and it gives the hand a front.
      at(hi, new THREE.SphereGeometry(RIG.mittR*0.42, 6, 5), limbCol,
         xf(-s*RIG.mittR*0.80, RIG.mittR*0.22, RIG.mittR*0.34, 1, 1.25, 1));
    });

    // ---- the suit: a collar, a belt, and our own mark on the chest.
    // Every one of these takes its size from BEAN_PROFILE rather than carrying
    // a copy of a width, so changing the silhouette moves the suit with it --
    // the lesson the face learned in v24 §6, applied before it can go wrong.
    const ring = (y, tube, col)=>{
      const g = new THREE.TorusGeometry(beanRadiusAt(y) + tube*0.30, tube, 5, 16);
      g.rotateX(Math.PI/2);                       // a torus lies in XY; lay it flat
      g.translate(0, y, 0);
      at(BONE.body, g, col);
    };
    ring(RIG.collarY, RIG.collarR, cuffCol);      // under the head, in the pinch
    ring(RIG.beltY,   RIG.beltR,   shoeCol);      // on the hips

    // THE MARK. Two chevrons leaning into the run, on a rounded badge: it is a
    // speed mark, it is ours, and it is four boxes and a cap. Deliberately not
    // a face-like shape, a letter, or anything borrowed -- the brief asks for a
    // Scramble Rush emblem and this is the cheapest thing that is one.
    const EM_R = beanRadiusAt(RIG.emblemY) + RIG.emblemProud;
    const badge = capGeometry(EM_R, RIG.emblemHalfW, RIG.emblemHalfH, 12, 9);
    badge.translate(0, RIG.emblemY, 0);
    at(BONE.body, badge, DARK);
    const chevron = (dy, span, thick, col)=>{
      [-1, 1].forEach(sx=>{
        const g = new THREE.BoxGeometry(span, thick, 0.40);
        const px = sx*span*0.40;
        const pt = capOn(EM_R, dy, px, 0.14);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pt.pitch, 0, -sx*0.60));
        g.applyMatrix4(new THREE.Matrix4().compose(
          new THREE.Vector3(px, RIG.emblemY + dy, pt.z), q, new THREE.Vector3(1,1,1)));
        at(BONE.body, g, col);
      });
    };
    chevron( 0.62, 2.5, 0.58, WHITE);
    chevron(-0.72, 2.5, 0.58, WHITE);

    // ---- face. A wide oval on the upper third of the body, curved like the
    //      body so it sits on the surface rather than cutting a flat dish.
    //      The dark hairline behind it used to be a back-facing shell; in one
    //      merged mesh every triangle faces the same way, so it is now a
    //      slightly larger plate set far enough back to show only at the edge.
    // The dark rim: the same cap a shade smaller in radius and a shade wider in
    // angle, so it shows as a thin outline round the plate and closes the seam
    // at a grazing angle. It cannot float, because it is concentric with the
    // plate rather than pushed back along z.
    at(BONE.face, faceCapGeometry(FACE_R3 - 0.10, 1.075), RIM);
    const plateGeo = faceCapGeometry(FACE_R3, 1);
    const facePlate = probeOf(BONE.face, plateGeo);
    at(BONE.face, plateGeo, WHITE);

    // ---- eyes: two dots on the plate, shaped by the chosen expression
    const dotScale = eyes==='happy'  ? [1.30, 0.50, 0.45]
                   : eyes==='sleepy' ? [1.40, 0.26, 0.45]
                   :                   [1.00, 1.55, 0.45];
    [[BONE.scleraL, BONE.pupilL, -1],[BONE.scleraR, BONE.pupilR, 1]].forEach(([sb,pb,s],i)=>{
      // the "sclera" slot is kept so the idle blink still has something to squash
      at(sb, new THREE.SphereGeometry(2.5*FS, 8, 6), WHITE, xf(0,0,0, 1,1,0.3));
      // A little bigger than v22's 2.0: at tile size the old dot read as a
      // pinprick, and the highlight below needs something to sit on.
      at(pb, new THREE.SphereGeometry(2.25*FS, 10, 8), DARK,
         xf(0,0,0, dotScale[0], dotScale[1], dotScale[2]));
      // OUR OWN EYE, not a copy of anyone's: one small catchlight, top-left on
      // both eyes because a single light source does not mirror itself. On the
      // pupil bone, so it tracks the locker's look-at instead of sliding off.
      at(pb, new THREE.SphereGeometry(2.25*FS*0.35, 6, 5), WHITE,
         xf(-0.62*FS, 0.62*FS, 1.05*FS));
      if(eyes==='angry'){
        const browAt = faceOn(2.9*FS, s*eyeX);
        at(BONE.face, new THREE.BoxGeometry(3.4*FS, 1.0*FS, 0.7), DARK,
           xf(s*eyeX, browAt.y, browAt.z - 0.15, 1,1,1, i===0 ? -0.42 : 0.42));
      }
    });

    // ---- the mouth. A curved bar lying on the cap, shaped by the expression:
    //      a small smile at rest, a wide grin for happy, a nearly flat line for
    //      sleepy, and the one case that turns over -- angry frowns.
    //      A torus arc rather than a painted texture, because the whole face is
    //      geometry on one merged mesh and a second material would be a third
    //      draw call per racer.
    const MOUTH = eyes==='happy'  ? { r:2.95*FS, tube:0.42*FS, arc:Math.PI*1.00, down:true }
                : eyes==='sleepy' ? { r:5.00*FS, tube:0.30*FS, arc:Math.PI*0.30, down:true }
                : eyes==='angry'  ? { r:2.40*FS, tube:0.38*FS, arc:Math.PI*0.62, down:false }
                :                   { r:2.05*FS, tube:0.36*FS, arc:Math.PI*0.78, down:true };
    {
      const mAt = faceOn(MOUTH_DY, 0, 0.10);
      // TorusGeometry draws its arc from angle 0, which is the UPPER half of the
      // ring. Turning it half a turn about z brings that arc to the bottom and
      // makes it a smile; leaving it alone is a frown, which is the whole of
      // `down`.
      const mm = new THREE.Matrix4()
        .makeTranslation(0, mAt.y, mAt.z)
        .multiply(new THREE.Matrix4().makeRotationX(mAt.pitch))
        .multiply(new THREE.Matrix4().makeRotationZ(MOUTH.down ? Math.PI : 0))
        // the arc is centred on the face rather than starting at one corner
        .multiply(new THREE.Matrix4().makeRotationZ(-MOUTH.arc/2 + Math.PI/2));
      const mouthGeo = new THREE.TorusGeometry(MOUTH.r, MOUTH.tube, 6, 14, MOUTH.arc);
      const mouth = probeOf(BONE.face, mouthGeo, mm);
      at(BONE.face, mouthGeo, DARK, mm);
      mouthProbe = mouth;
    }

    // ---- cheeks: the skin colour a step darker, blended most of the way into
    //      the plate so it reads as a blush rather than a sticker. There is no
    //      opacity to spend -- one opaque merged mesh -- so the 60% is mixed
    //      into the vertex colour instead.
    {
      const cheekCol = WHITE.clone().lerp(limbCol.clone().multiplyScalar(0.82), 0.60);
      for(const s of [-1, 1]){
        const cAt = faceOn(MOUTH_DY + 0.55*FS, s*3.55*FS, 0.06);
        at(BONE.face, new THREE.SphereGeometry(1.05*FS, 8, 6), cheekCol,
           xf(s*3.55*FS, cAt.y, cAt.z, 1, 0.78, 0.30));
      }
    }

    // The tongue only shows in the locker's gurn.
    at(BONE.tongue, new THREE.SphereGeometry(1.3*FS,6,5),
       new THREE.Color(0xff4fa3), xf(0,0,0, 1,0.65,0.45));

    // ---- hat, on the crown. Scaled down: these were sized for a separate head.
    const GOLD = new THREE.Color(0xffcb3d);
    // Every hat part is probed as it is added, so check 5b can box each one
    // against the face without knowing which hat is on.
    const atHat = (boneIndex, geo, color, local, colorAt)=>{
      hatProbes.push(probeOf(boneIndex, geo, local));
      return at(boneIndex, geo, color, local, colorAt);
    };
    if(hat==='crown'){
      atHat(BONE.hat, new THREE.CylinderGeometry(7,5.8,6,5,1,false), GOLD, xf(0,3.0,0));
      for(let i=0;i<5;i++){
        const a=i/5*Math.PI*2;
        atHat(BONE.hat, new THREE.ConeGeometry(2,5.2,4), GOLD, xf(Math.cos(a)*6.6,8.2,Math.sin(a)*6.6));
      }
      atHat(BONE.hat, new THREE.SphereGeometry(1.9,8,6), new THREE.Color(0xff4fa3), xf(0,3.8,7));
    } else if(hat==='party'){
      // The stripes were a texture; on the shared material they are painted
      // into the vertices instead, which is why the cone gained segments.
      const teal = new THREE.Color(0x23e6c9), pink = new THREE.Color(0xff4fa3);
      atHat(BONE.hat, new THREE.ConeGeometry(5.6,16,12,10), null, xf(0,7.4,0),
         (c,g,i)=>{ c.copy(Math.floor(g.attributes.uv.getY(i)*7) % 2 ? pink : teal); });
      atHat(BONE.hat, new THREE.SphereGeometry(2.4,8,6), GOLD, xf(0,15.6,0));
    } else if(hat==='halo'){
      atHat(BONE.hat, new THREE.TorusGeometry(7.0,1.3,8,20), new THREE.Color(0xfff2a8),
         xf(0,7.4,0, 1,1,1).multiply(new THREE.Matrix4().makeRotationX(Math.PI/2)));
      hatGroup.userData.float = true; hatGroup.userData.floatBase = RIG.topY - 1.2;
    } else if(hat==='horns'){
      [-1,1].forEach(s=>{
        atHat(BONE.hat, new THREE.ConeGeometry(2.4,8,8), new THREE.Color(0xff5a4d),
           xf(s*5.8,2.6,0, 1,1,1, -s*0.5));
      });
    } else if(hat==='prop'){
      atHat(BONE.hat, new THREE.SphereGeometry(7.0,14,9,0,Math.PI*2,0,Math.PI/2),
         new THREE.Color(0x60a5fa), xf(0,-1.4,0));
      atHat(BONE.hat, new THREE.CylinderGeometry(0.65,0.65,4.4,6), DARK, xf(0,6.6,0));
      atHat(BONE.hatSpin, new THREE.BoxGeometry(13,0.9,2.3), new THREE.Color(0xff5a4d));
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
    const kneePivots = [kneeL, kneeR], footPivots = [footL, footR];
    const elbowPivots = [elbowL, elbowR], handPivots = [handL, handR];
    // THE REST POSE, set after the bind pose is taken, so these are animation
    // offsets and not baked into the mesh. A figure standing with every joint
    // locked straight reads as a doll; a few degrees of bend everywhere reads
    // as someone standing. The run overwrites all of it each frame anyway.
    //
    // Stated ONCE, here, because neutral() below has to be able to put the
    // character back into exactly this pose. Two copies of these numbers is how
    // one rest pose quietly becomes two different rest poses.
    const REST = { armZ:0.30, elbowX:-0.26, kneeX:0.13, hipX:0, ankleX:0 };

    // Put the character in its documented rest pose and clear every transform
    // that belongs to the ANIMATION rather than to the model: the breath, the
    // weight shift, the lean, the squash keyframe, the eye counter-scale.
    //
    // Check 5 measures the racer's PROPORTIONS, and those are a property of the
    // rig. Sampling whichever frame of the idle loop happened to be running
    // moved the measured ratio between 1.49 and 1.52; a reading that depends on
    // timing is not a proportion, and a 1.55 ceiling judged against it is not
    // really a ceiling.
    function neutral(){
      group.scale.set(1, 1, 1);
      tilt.rotation.set(0, 0, 0); tilt.position.set(0, 0, 0);
      bodyBone.scale.set(1, 1, 1);
      head.position.set(0, 0, 0); head.rotation.set(0, 0, 0);
      for(let i=0;i<2;i++){
        const s = i ? 1 : -1;
        legPivots[i].position.set(s*RIG.legX, RIG.hipY, 0);
        legPivots[i].rotation.set(REST.hipX, 0, -s*REST.armZ*0.35);
        kneePivots[i].rotation.set(REST.kneeX, 0, 0);
        footPivots[i].rotation.set(REST.ankleX, 0, 0);
        armPivots[i].rotation.set(0, 0, -s*REST.armZ);
        elbowPivots[i].rotation.set(REST.elbowX, 0, 0);
        handPivots[i].rotation.set(0, 0, 0);
        pupils[i].scale.set(1, 1, 1); scleras[i].scale.set(1, 1, 1);
      }
      group.updateMatrixWorld(true);
      return group;
    }
    armL.rotation.z = -REST.armZ; armR.rotation.z = REST.armZ;  // flare clear of the hips
    elbowL.rotation.x = elbowR.rotation.x = REST.elbowX;        // a little bend at the elbow
    kneeL.rotation.x = kneeR.rotation.x = REST.kneeX;           // soft knees, weight on them
    return {group, tilt, aura, bodyMat, partsMat, outMat, outline, body, trim, skeleton,
            head, faceGroup, hatGroup, pupils, scleras, tongue,
            facePlate, hatProbes, mouth:mouthProbe,
            arms:armPivots, legs:legPivots, armPivots, legPivots, feet, hands,
            kneePivots, footPivots, elbowPivots, handPivots, bodyBone,
            neutral, REST, RIG};
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
