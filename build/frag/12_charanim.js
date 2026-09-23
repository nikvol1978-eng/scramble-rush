  // ============================================================
  // CHARACTER ANIMATION
  // ============================================================
  // Poses are picked by state, most severe first. Limb rotations are set
  // absolutely each frame (no accumulation) so a state change reads instantly.
  //
  // SIGN CONVENTION, because every pose below depends on it: a limb bone hangs
  // down the -y axis, so rotation.x NEGATIVE swings it FORWARD and up (+z is
  // the way the racer faces), POSITIVE swings it back and down. A knee bends
  // backwards, so its angle is positive; an elbow bends forwards, so its angle
  // is negative. What the world sees is tilt + limb, which is why the dive can
  // set legs to -0.95 and still trail them: the tilt is +1.15 under it.
  //
  // v25: the poses drive a JOINTED limb. Each leg is hip/knee/ankle and each
  // arm is shoulder/elbow/wrist, so a pose is three numbers a side rather than
  // one. The amplitudes are not invented -- they are read off the reference
  // study and kept in the same order of magnitude, because the ratios between
  // them are what carry weight:
  //
  //              hip    knee   shoulder  elbow  ankle   body rise
  //    idle       3     3        2        2      0       2% of height
  //    walk      30    20       13       12     17       5%
  //    run       52    48       38       34     31      14%
  //    fall      85   130       80       23     47      25%
  //
  // The step from walk to run is mostly in the KNEE; the step from run to fall
  // is in the knee and the shoulder. A pose that scales every joint by one
  // factor loses that, which is exactly why the old single-amplitude run read
  // as a scissor -- its knee was zero at every speed, and its foot "lift" was
  // the whole leg sliding up its own socket.
  const KNEE_REST = 0.13, ELBOW_REST = -0.26;

  function poseCharacter(m, r, t, moving, speed){
    const L=m.legPivots, K=m.kneePivots, F=m.footPivots;
    const A=m.armPivots, E=m.elbowPivots, H=m.handPivots;
    // The hips stay where the rig put them. v24 lifted them by hand to fake a
    // step, which is the one thing a knee makes unnecessary.
    L[0].position.y = L[1].position.y = RIG.hipY;
    const leg = (i,hip,knee,ankle)=>{ L[i].rotation.x=hip; K[i].rotation.x=knee; F[i].rotation.x=ankle||0; };
    const arm = (i,sh,el,wr)=>{ A[i].rotation.x=sh; E[i].rotation.x=el; H[i].rotation.x=wr||0; };
    // the old two-argument helpers, kept so every pose below still reads as a
    // pair of numbers; they simply park the second joint at its rest angle
    const setLegs=(l,rr,knee,ankle)=>{ leg(0,l,knee===undefined?KNEE_REST:knee,ankle); leg(1,rr,knee===undefined?KNEE_REST:knee,ankle); };
    const setArms=(l,rr,el)=>{ arm(0,l,el===undefined?ELBOW_REST:el); arm(1,rr,el===undefined?ELBOW_REST:el); };
    const flare=(v)=>{ A[0].rotation.z=-v; A[1].rotation.z=v; L[0].rotation.z=-v*0.35; L[1].rotation.z=v*0.35; };
    // BREATH AND SQUASH LIVE ON THE BODY BONE, NOT ON THE GROUP. The whole bean
    // is bound to BONE.body while the face hangs off BONE.head, so scaling the
    // body moves the shell and leaves the face undistorted -- which is the same
    // split the reference rig buys with a joint it calls NoStrechSquash. The
    // head bone is then nudged by the same proportion at face height so the
    // face rides the surface instead of sinking into it.
    // A BREATH IS MOSTLY WIDTH. Scaling the shell in y moves the crown by the
    // full height times e, which is both wrong -- a chest expands outwards, not
    // upwards -- and quietly harmful: check 5 measures crown-to-sole, so a
    // vertical breath makes the rig's own proportion test depend on which
    // frame of the idle loop it happens to sample. Width carries the breath,
    // y carries a third of it, and the ratio stops wobbling.
    const breathe=(e)=>{
      m.bodyBone.scale.set(1 + e*0.85, 1 + e*0.30, 1 + e*0.85);
      m.head.position.y = RIG.faceY*e*0.30;
    };

    if(r.lavaOut || r.falling){
      // arms up, legs kicking — the classic wipeout
      const f = Math.sin(t*18);
      setLegs(0.9+f*0.8, -0.9-f*0.8, KNEE_REST+0.9+f*0.5);
      setArms(-2.5+f*0.2, -2.5-f*0.2, -0.5);
      flare(0.6);
      m.tilt.rotation.x = -0.4; breathe(0);
      return;
    }
    m.tilt.rotation.x = 0;

    if(r.tumbleT>0){
      // Arms and legs thrown out, whole body turning over. The rotation is on
      // the tilt pivot so it composes with facing instead of fighting it.
      // LOSS OF CONTROL IS ASYMMETRY: the two sides are given different phase
      // and different amounts, because a tumble in which both arms do the same
      // thing reads as a jumping-jack, not as someone who has been hit.
      const f = Math.sin(t*26), g = Math.sin(t*26 + 2.1);
      leg(0, 0.9+f*0.5, KNEE_REST+1.1+g*0.6, -0.3);
      leg(1, -0.9-g*0.5, KNEE_REST+0.7+f*0.7, 0.2);
      arm(0, -2.2+f*0.9, -0.9-g*0.5);
      arm(1, -2.2-g*0.9, -0.3-f*0.6);
      flare(0.85); breathe(0);
      if(r.tumbleRoll) m.tilt.rotation.z = r.tumbleAng||0;
      else             m.tilt.rotation.x = r.tumbleAng||0;
      return;
    }
    m.tilt.rotation.z = 0;

    if(r.diveT>0){
      // Superman: arms straight out front, legs trailing, body pitched flat.
      // The knee is almost straight and the ankle POINTED, so the whole figure
      // makes one line from mitt to toe — which is what separates a dive from
      // a jump at a glance, more than the pitch of the body does.
      setLegs(-0.95,-1.05, KNEE_REST*0.4, -0.55);
      setArms(-2.75,-2.75, -0.05);
      flare(0.10);
      m.tilt.rotation.x = 1.15; breathe(0.02);
      return;
    }
    if(r.getUpT>0){
      // Getting up is two moves, not a snap: roll from flat to sitting, then
      // push up off the floor with both arms.
      const k = clamp(r.getUpT/(r.getUpTotal||DIVE_GETUP_MS), 0, 1);   // 1 = just landed, 0 = up
      if(k > 0.5){
        const a = (k-0.5)/0.5;                              // 1 flat -> 0 sitting
        m.tilt.rotation.x = 0.55 + 0.75*a;
        setLegs(-0.9 + 0.5*a, -0.8 + 0.5*a, KNEE_REST + 0.7*(1-a));
        setArms(-2.4*a - 0.6*(1-a), -2.4*a - 0.6*(1-a), -0.3 - 0.5*(1-a));
      } else {
        const a = k/0.5;                                    // 1 sitting -> 0 standing
        m.tilt.rotation.x = 0.55*a;
        setLegs(-0.4*a, -0.3*a, KNEE_REST + 0.8*a);
        setArms(0.9*a, 0.9*a, -0.2-0.4*a);                  // arms back, pushing off
      }
      flare(0.30); breathe(0);
      return;
    }
    if(r.stumbleT>0){
      // windmilling for balance — knees soft, one arm leading the other
      const w = Math.sin(t*20);
      setLegs(0.55,-0.55, KNEE_REST+0.45);
      arm(0, w*1.5-1.0, -0.7); arm(1, -w*1.5-1.0, -0.2);
      flare(0.55); breathe(0.015);
      return;
    }
    if(r.h>0){
      // AIRBORNE. Rising and falling are different poses, not one pose scaled:
      // on the way up the legs are still finishing the push, so they trail and
      // the knees are nearly straight; on the way down they come forward and
      // OPEN, knees apart, reaching for a floor that is not there yet.
      const rising = r.vh > 0;
      if(rising){
        leg(0, 0.75, KNEE_REST+0.25, -0.35);
        leg(1, -0.35, KNEE_REST+0.55, -0.25);
        setArms(-2.7,-2.55, -0.45);
        flare(0.55); breathe(0.035);
      } else {
        // the open falling pose: legs split and bent, arms low and wide
        leg(0, -0.30, KNEE_REST+0.85, 0.15);
        leg(1,  0.40, KNEE_REST+0.50, 0.05);
        arm(0, -0.9, -0.85); arm(1, -0.8, -0.55);
        flare(0.62); breathe(-0.02);
      }
      return;
    }
    if(r.finished){
      // milling about past the line — a little victory bounce
      const ph=t*6;
      setLegs(Math.sin(ph)*0.35, -Math.sin(ph)*0.35, KNEE_REST+0.25+Math.sin(ph*2)*0.2);
      setArms(-2.2+Math.sin(t*7)*0.35, -2.2-Math.sin(t*7)*0.35, -0.6);
      flare(0.45); breathe(Math.sin(t*5)*0.02);
      return;
    }
    if(moving){
      // ---- THE RUN ------------------------------------------------------
      // One phase drives everything; the right leg is half a cycle behind.
      //
      //   p = 0      legs crossing, this one swinging THROUGH  -> knee tucked
      //   p = pi/2   maximum forward reach                     -> knee opening
      //   p = pi     legs crossing, this one PLANTED           -> knee straight
      //   p = 3pi/2  maximum extension behind, toe-off         -> ankle pointed
      //
      // The knee therefore folds on cos(p), not on sin(p): it is most bent when
      // the leg passes UNDER the body, which is the moment the foot has to
      // clear the floor. Getting that phase wrong is what made the old run look
      // like a pair of scissors -- it bent nothing, and lifted the whole leg.
      const k = clamp(speed, 0, 7)/7;
      const gait = 8 + clamp(speed,0,7)*1.1;
      const ph = t*gait + r.x*0.08;               // phase offset so the pack isn't in lockstep
      const A_HIP  = 0.30 + k*0.40;               // 17 -> 40 deg
      const A_KNEE = 0.55 + k*0.90;               // 32 -> 83 deg at the tuck
      const A_SH   = 0.26 + k*0.40;               // 15 -> 38 deg
      for(let i=0;i<2;i++){
        const p  = ph + i*Math.PI;
        const sp = Math.sin(p), cp = Math.cos(p);
        const fold = Math.max(0, cp);             // 1 at swing-through, 0 at the plant
        leg(i, -A_HIP*sp,
               KNEE_REST + A_KNEE*fold*fold,
               // toes up as the foot clears, pointed through the toe-off
               -0.26*fold + 0.34*Math.max(0, -cp)*Math.max(0, -sp));
        // arms oppose the legs, and the elbow closes as the arm comes forward
        arm(i, A_SH*sp, -0.45 - 0.42*Math.max(0, sp));
      }
      // LEAN INTO IT. A standing start pitches further than a cruise, so the
      // lean is a floor from speed plus a kick from acceleration. Smoothed,
      // because raw frame-to-frame acceleration is noise on a physics step.
      const accel = speed - (r.animSpeed===undefined ? speed : r.animSpeed);
      r.animSpeed = speed;
      r.animLean = (r.animLean||0) + ((0.055 + k*0.10) + clamp(accel*0.9, -0.05, 0.16)
                                      - (r.animLean||0))*0.12;
      m.tilt.rotation.x = r.animLean;
      flare(0.18);
      // the shoulders drop a little at the fastest gait, which reads as effort
      breathe(-0.012*k + Math.sin(ph*2)*0.012);
      return;
    }
    // ---- IDLE -----------------------------------------------------------
    // The reference's idle is a 1-second loop in which nothing exceeds three
    // degrees and the hips rise about 2% of the body's height. It is almost
    // nothing, and that restraint is the point: an idle you can SEE looping is
    // worse than no idle at all. So: one slow breath, a slower weight shift
    // that is barely a lean, and arms that hang and sway a fraction behind it.
    const br = Math.sin(t*1.9);                   // the breath, about a third of a hertz
    const sw = Math.sin(t*0.77);                  // the weight shift, slower still
    const lag = Math.sin(t*1.9 - 0.6);            // arms trail the breath
    // On the frames of a landing the stance is taken at once, as the running
    // pose takes its own: easing out of the air tuck while the landing's bend
    // was added on top folded a standing landing's knee well past a running one's.
    const EK = r.landT > 0 ? 1 : 0.18;
    const ease=(o,axis,to)=>{ o.rotation[axis] += (to-o.rotation[axis])*EK; };
    ease(L[0],'x', 0.03 + sw*0.02); ease(L[1],'x', 0.03 - sw*0.02);
    ease(K[0],'x', KNEE_REST + 0.05 + Math.max(0, sw)*0.07);
    ease(K[1],'x', KNEE_REST + 0.05 + Math.max(0,-sw)*0.07);
    ease(F[0],'x', -0.02); ease(F[1],'x', -0.02);
    ease(A[0],'x', -0.03 + lag*0.05); ease(A[1],'x', -0.03 + lag*0.05);
    ease(E[0],'x', ELBOW_REST - 0.05 - lag*0.04);
    ease(E[1],'x', ELBOW_REST - 0.05 - lag*0.04);
    flare(0.20 + sw*0.015);
    m.tilt.rotation.z = sw*0.010;                 // the weight really does shift
    m.tilt.rotation.x = -0.012 + br*0.008;
    breathe(br*0.013);
  }

  // ---- the fade, applied to the WHOLE racer ----------------------------
  // A fall or a knockout fades the racer, and a racer is several meshes: the
  // body, the trim (limbs, hat and eyes merged onto one material), the
  // player's marker and, on some skins, a glow shell. Fading bodyMat alone
  // left the trim at full strength -- a crown, two mitts and a pair of eyes
  // hanging over the hole. Every one of these materials is this racer's own
  // (makeCharacter and buildRacerMeshes build them per call), so writing them
  // fades nobody else. An opaque one is made transparent only while it is
  // faded, so a racer on its feet draws exactly as it always did. The aura is
  // left to animateAura, which rewrites it every frame; see syncRacers.
  function fadeRacer(m, a){
    m.bodyMat.opacity = a; m.outMat.opacity = a*0.55;
    if(!m._fade){
      const skip = new Set([m.bodyMat, m.outMat]);
      if(m.aura) m.aura.traverse(o=>{ if(o.material) skip.add(o.material); });
      m._fade = [];
      m.group.traverse(o=>{
        if(!o.isMesh || !o.material || skip.has(o.material)) return;
        m._fade.push({ mat:o.material, base:o.material.opacity, trans:o.material.transparent });
      });
    }
    for(const f of m._fade){
      f.mat.opacity = f.base*a;
      const tr = f.trans || a < 1;
      if(f.mat.transparent !== tr){ f.mat.transparent = tr; f.mat.needsUpdate = true; }
    }
  }

  function syncRacers(t){
    for(const r of racers){
      const m=r.mesh; if(!m) continue;
      // position comes from the course path; on a straight course this is the old transform
      let baseY=0, opacity=1;
      if(r.lavaOut){ baseY=-70; opacity=0.15; m.group.rotation.z=2.4; }
      else if(r.falling){ const k=clamp(1-r.fallT/650,0,1); baseY=-90*k*k; opacity=clamp(1-k*1.2,0,1); m.group.rotation.z=k*3; }
      else m.group.rotation.z=0;

      const speed=Math.hypot(r.vx,r.vy);
      const moving=speed>0.4;
      // a light bob from the run cycle, in step with the legs
      const gait = 8 + clamp(speed,0,7)*1.1;
      // A 6% bob at stride rate. It peaks where the legs are at full reach and
      // falls to nothing as they cross, which is the half of the cycle the foot
      // is planted -- so the body is LOWEST over the standing foot, as it is
      // when a real one takes the load.
      const bob = (moving && r.h===0 && !r.diveT && !r.finished) ? Math.abs(Math.sin(t*gait+r.x*0.08))*2.4 : 0;
      const wp = toWorld(r.x, r.y, RADIUS+baseY+bob+(r.floorH||0)+r.h);
      m.group.position.set(wp.x, wp.y, wp.z);

      // Follow the bean's own facing: reading it off velocity meant the model
      // pointed where it was sliding, not where it was being steered.
      if(moving || r.isPlayer){ r.renderFacing = Math.PI/2 - (r.facing||0); }
      m.group.rotation.y=(r.renderFacing||0) + pathAngle(r.y);

      // the head leads the turn a little
      let d = (r.renderFacing||0) - (r.lastFacing===undefined ? (r.renderFacing||0) : r.lastFacing);
      while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2;
      r.headTurn = (r.headTurn||0) + (clamp(d*9,-0.5,0.5) - (r.headTurn||0))*0.15;
      r.lastFacing = r.renderFacing||0;
      m.head.rotation.y = r.headTurn;

      // Take last frame's landing bend back out first. The idle pose EASES its
      // joints from where they are, so a bend left in fed the next frame's
      // ease and the bends compounded: a standing landing folded the knee to
      // 2 rad for fifteen frames. The poses that set joints outright are
      // unaffected -- they overwrite this either way.
      if(r.landGive){
        for(let i=0;i<2;i++){
          m.kneePivots[i].rotation.x -= r.landGive;
          m.footPivots[i].rotation.x += r.landGive*0.45;
          m.elbowPivots[i].rotation.x += r.landGive*0.30;
        }
        r.landGive = 0;
      }
      poseCharacter(m, r, t, moving, speed);

      // ---- THE LANDING, ABSORBED ---------------------------------------
      // The group squash below already says "an impact happened". What it
      // cannot say is that the LEGS took it, because it scales the whole
      // character including them. So the landing is also folded into the knees
      // and ankles, on top of whatever pose the state machine just set -- an
      // additive bend rather than a pose of its own, so a racer that lands
      // running keeps running through it instead of stopping to land.
      if(r.landT>0 && r.h<=0 && r.tumbleT<=0 && r.getUpT<=0 && r.diveT<=0 && !r.falling && !r.lavaOut){
        const a = clamp(r.landT/LAND_MS, 0, 1);        // 1 at touchdown, 0 recovered
        const give = a*a*0.85;
        for(let i=0;i<2;i++){
          m.kneePivots[i].rotation.x += give;
          m.footPivots[i].rotation.x -= give*0.45;     // ankle rolls under the load
          m.elbowPivots[i].rotation.x -= give*0.30;    // arms come up as it sinks
        }
        r.landGive = give;                             // taken back out next frame
        m.tilt.rotation.x -= give*0.10;
      }

      // ---- the skid, on ice -------------------------------------------
      // The one thing that says "sliding" without a number on screen: the gap
      // between where the bean is pointed and where it is actually going. On
      // dry ground that gap is nearly zero, so this does nothing there. It is
      // applied after poseCharacter, which owns tilt.z for tumbles and clears
      // it otherwise.
      if(currentMap.slippery && r.tumbleT<=0 && !r.falling && speed>1.2){
        let slip = Math.atan2(r.vy, r.vx) - (r.facing||0);
        while(slip> Math.PI) slip-=Math.PI*2;
        while(slip<-Math.PI) slip+=Math.PI*2;
        const want = clamp(slip, -1.0, 1.0) * 0.34;   // about 20 degrees at full skid
        r.skidLean = (r.skidLean||0) + (want - (r.skidLean||0))*0.14;
        m.tilt.rotation.z = r.skidLean;
      } else if(r.skidLean){
        r.skidLean *= 0.86;
        if(Math.abs(r.skidLean) < 0.004) r.skidLean = 0;
        else if(r.tumbleT<=0) m.tilt.rotation.z = r.skidLean;
      }

      // whole-body squash, kept so hits and landings still read
      let sxs=1,sys=1,szs=1;
      if(r.stumbleT>0){ sxs=1.14; sys=0.84; szs=1.14; }
      else if(r.diveT>0){ sxs=0.94; sys=0.88; szs=1.18; }
      else if(r.landT>0){ sys=0.82; sxs=szs=1.12; }               // landing squash, 90 ms
      else if(r.stretchT>0){ sys=1.10; sxs=szs=0.94; }            // take-off stretch, 60 ms
      else if(r.h>0){ const st=clamp(r.vh*0.035,-0.10,0.10); sys=1+st; sxs=1-st*0.7; szs=1-st*0.7; }
      if(r.squash>0){ sys*=1-r.squash*0.32; sxs*=1+r.squash*0.22; szs*=1+r.squash*0.22; }
      m.group.scale.set(sxs,sys,szs);

      // THE FACE DOES NOT SQUASH WITH THE BODY. The group scale above is the
      // keyframe the whole game reads for impact, so it stays exactly as it
      // was; what changes is that the eyes are given the inverse of it, so a
      // landing flattens the racer and leaves two round eyes looking out of it
      // rather than two ovals. Same idea as the reference's second torso joint,
      // arrived at from the other end: it un-squashes the features instead of
      // exempting them.
      if(sys!==1 || sxs!==1){
        const ix=1/sxs, iy=1/sys, iz=1/szs;
        for(let i=0;i<2;i++){ m.pupils[i].scale.set(ix,iy,iz); m.scleras[i].scale.set(ix,iy,iz); }
      } else if(m.pupils[0].scale.y!==1){
        for(let i=0;i<2;i++){ m.pupils[i].scale.set(1,1,1); m.scleras[i].scale.set(1,1,1); }
      }

      fadeRacer(m, opacity);
      m.outline.visible = r.invuln>0 && (Math.floor(t*14)%2===0);
      if(m.hatGroup.userData.spin) m.hatGroup.userData.spin.rotation.y=t*12;
      if(m.hatGroup.userData.float) m.hatGroup.position.y=(m.hatGroup.userData.floatBase||0)+Math.sin(t*3)*2;
      if(m.arrow) m.arrow.position.y=RADIUS+34+Math.sin(t*4)*3;
      animateAura(m, t);
      // animateAura sets the aura's opacities outright each frame, so the fade
      // goes on after it; the next frame on your feet puts them back.
      if(m.aura && opacity < 1){
        const au = m.aura.userData;
        au.shell.material.opacity *= opacity;
        for(const mo of au.motes) mo.material.opacity *= opacity;
      }
    }
  }
