  // ============================================================
  // CHARACTER ANIMATION
  // ============================================================
  // Poses are picked by state, most severe first. Limb rotations are set
  // absolutely each frame (no accumulation) so a state change reads instantly.
  function poseCharacter(m, r, t, moving, speed){
    const L=m.legPivots, A=m.armPivots;
    L[0].position.y = L[1].position.y = RIG.hipY;      // feet down unless the run lifts them
    const setLegs=(l,rr)=>{ L[0].rotation.x=l; L[1].rotation.x=rr; };
    const setArms=(l,rr)=>{ A[0].rotation.x=l; A[1].rotation.x=rr; };
    const flare=(v)=>{ A[0].rotation.z=-v; A[1].rotation.z=v; L[0].rotation.z=-v*0.35; L[1].rotation.z=v*0.35; };

    if(r.lavaOut || r.falling){
      // arms up, legs kicking — the classic wipeout
      setLegs(Math.sin(t*18)*0.8, -Math.sin(t*18)*0.8);
      setArms(-2.5, -2.5); flare(0.6);
      m.tilt.rotation.x = -0.4;
      return;
    }
    m.tilt.rotation.x = 0;

    if(r.tumbleT>0){
      // arms and legs thrown out, whole body turning over. The rotation is on
      // the tilt pivot so it composes with facing instead of fighting it.
      const flail = Math.sin(t*26);
      setLegs(0.9+flail*0.5, -0.9-flail*0.5);
      setArms(-2.2+flail*0.9, -2.2-flail*0.9);
      flare(0.85);
      if(r.tumbleRoll) m.tilt.rotation.z = r.tumbleAng||0;
      else             m.tilt.rotation.x = r.tumbleAng||0;
      return;
    }
    m.tilt.rotation.z = 0;

    if(r.diveT>0){
      // superman: arms straight out front, legs trailing, whole body pitched flat
      setLegs(-0.95,-1.05); setArms(-2.75,-2.75); flare(0.10);
      m.tilt.rotation.x = 1.15;
      return;
    }
    if(r.getUpT>0){
      // Getting up is two moves, not a snap: roll from flat to sitting, then
      // push up off the floor with both arms.
      const k = clamp(r.getUpT/(r.getUpTotal||DIVE_GETUP_MS), 0, 1);   // 1 = just landed, 0 = up
      if(k > 0.5){
        const a = (k-0.5)/0.5;                              // 1 flat -> 0 sitting
        m.tilt.rotation.x = 0.55 + 0.75*a;
        setLegs(-0.9 + 0.5*a, -0.8 + 0.5*a);
        setArms(-2.4*a - 0.6*(1-a), -2.4*a - 0.6*(1-a));
      } else {
        const a = k/0.5;                                    // 1 sitting -> 0 standing
        m.tilt.rotation.x = 0.55*a;
        setLegs(-0.4*a, -0.3*a);
        setArms(0.9*a, 0.9*a);                              // arms back, pushing off
      }
      flare(0.30);
      return;
    }
    if(r.stumbleT>0){
      // windmilling for balance
      setLegs(0.55,-0.55); setArms(Math.sin(t*20)*1.5-1.0, -Math.sin(t*20)*1.5-1.0);
      flare(0.55);
      return;
    }
    if(r.h>0){
      // airborne: arms fly up on the way up, reach for the floor on the way down
      const rising = r.vh > 0;
      if(rising){ setLegs(0.75,-0.35); setArms(-2.7,-2.55); flare(0.55); }
      else       { setLegs(-0.30,0.40); setArms(-0.9,-0.8); flare(0.42); }
      return;
    }
    if(r.finished){
      // milling about past the line — a little victory bounce
      const ph=t*6;
      setLegs(Math.sin(ph)*0.35, -Math.sin(ph)*0.35);
      setArms(-2.2+Math.sin(t*7)*0.35, -2.2-Math.sin(t*7)*0.35);
      flare(0.45);
      return;
    }
    if(moving){
      // the run cycle speeds up and widens with how fast you are actually going
      const gait = 8 + clamp(speed,0,7)*1.1;
      const amp  = 0.38 + clamp(speed,0,7)*0.060;
      const ph = t*gait + r.x*0.08;               // phase offset so the pack isn't in lockstep
      const swing = Math.sin(ph);
      setLegs(swing*amp, -swing*amp);
      setArms(-swing*amp*0.85, swing*amp*0.85);
      // each foot lifts clear of the floor on its forward swing
      L[0].position.y = RIG.hipY + Math.max(0,  swing)*3.2;
      L[1].position.y = RIG.hipY + Math.max(0, -swing)*3.2;
      flare(0.18);
      return;
    }
    // idle — ease everything back to neutral
    const ease=(o,axis,to)=>{ o.rotation[axis] += (to-o.rotation[axis])*0.18; };
    ease(L[0],'x',0); ease(L[1],'x',0); ease(A[0],'x',0); ease(A[1],'x',0);
    flare(0.20);
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
      // a 6% bob at stride rate
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

      poseCharacter(m, r, t, moving, speed);

      // whole-body squash, kept so hits and landings still read
      let sxs=1,sys=1,szs=1;
      if(r.stumbleT>0){ sxs=1.14; sys=0.84; szs=1.14; }
      else if(r.diveT>0){ sxs=0.94; sys=0.88; szs=1.18; }
      else if(r.landT>0){ sys=0.82; sxs=szs=1.12; }               // landing squash, 90 ms
      else if(r.stretchT>0){ sys=1.10; sxs=szs=0.94; }            // take-off stretch, 60 ms
      else if(r.h>0){ const st=clamp(r.vh*0.035,-0.10,0.10); sys=1+st; sxs=1-st*0.7; szs=1-st*0.7; }
      if(r.squash>0){ sys*=1-r.squash*0.32; sxs*=1+r.squash*0.22; szs*=1+r.squash*0.22; }
      m.group.scale.set(sxs,sys,szs);

      m.bodyMat.opacity=opacity; m.outMat.opacity=opacity*0.55;
      m.outline.visible = r.invuln>0 && (Math.floor(t*14)%2===0);
      if(m.hatGroup.userData.spin) m.hatGroup.userData.spin.rotation.y=t*12;
      if(m.hatGroup.userData.float) m.hatGroup.position.y=(m.hatGroup.userData.floatBase||0)+Math.sin(t*3)*2;
      if(m.arrow) m.arrow.position.y=RADIUS+34+Math.sin(t*4)*3;
      animateAura(m, t);
    }
  }
