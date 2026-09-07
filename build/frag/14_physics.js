    // ============================================================
    // MOVEMENT + PHYSICS
    // ============================================================
    updateSlipstream();

    const p=racers.find(r=>r.isPlayer);
    if(p && !p.finished){
      const {ix:ix0,iy:iy0}=computeInputVec();
      let ix=ix0, iy=iy0;
      const mag=Math.hypot(ix,iy);
      if(mag>0.05){
        ix/=mag; iy/=mag;
        // Turn toward the stick rather than snapping to it. Snapping is what
        // made a change of direction read as a teleport plus a skid.
        const want = Math.atan2(iy,ix);
        const rate = (p.h>0 ? TURN_RATE_AIR : TURN_RATE_GROUND) * dt;
        let d = want - p.facing;
        while(d> Math.PI) d-=Math.PI*2;
        while(d<-Math.PI) d+=Math.PI*2;
        p.facing += clamp(d, -rate, rate);
        // A sharp change of direction read as a skid: the body swings at
        // TURN_RATE_GROUND while the velocity carries on the old way. Bite
        // harder for a few frames so the two arrive together. This belongs with
        // the turn rather than with the surface -- bots snap their facing
        // instead of turning, so it is part of the control model, not the
        // ground. Ice is exempt: sliding is the point of a slippery map.
        let off = want - Math.atan2(p.vy, p.vx);
        while(off> Math.PI) off-=Math.PI*2;
        while(off<-Math.PI) off+=Math.PI*2;
        if(Math.hypot(p.vx,p.vy) > 1.5 && Math.abs(off) > Math.PI*0.45) p.turnGrip = 6;
      }
      // v22: getting up gives you a little more of yourself back than it did.
      // At 0.30 the last quarter-second of every knock felt like a second knock.
      const control = p.tumbleT>0?0 : p.stumbleT>0?0.15 : p.falling?0 : p.getUpT>0?0.45 : p.diveT>0?0.12 : p.h>0?0.65:1;
      let pax = ix*ACCEL*(1+p.draft)*WIND(p)*control, pay = iy*ACCEL*(1+p.draft)*WIND(p)*control;
      const iceK = iceBlend(p, pax, pay);
      p.vx+=pax*iceK*f; p.vy+=pay*iceK*f;
      // let go of jump early and the hop is short — hold it and you clear more
      if(p.h>0 && p.vh>2.6 && !keys[settings.keys.jump] && !p.jumpCut){ p.vh*=0.5; p.jumpCut=true; }
      if(p.h<=0) p.jumpCut=false;
    }

    for(const r of racers){
      if(r.lavaOut) continue;

      // ---- past the line: you can mill about the finish area, but not leave it
      if(r.finished){
        if(r.isPlayer){
          const {ix,iy}=computeInputVec();
          const mag=Math.hypot(ix,iy);
          if(mag>0.05){ r.facing=Math.atan2(iy,ix); r.vx+=ix/mag*0.55*f; r.vy+=iy/mag*0.55*f; }
        } else {
          r.celebT=(r.celebT||0)-dt;
          if(r.celebT<=0){ r.celebT=rand(0.9,2.2);
            r.celebX=rand(70,TRACK_W-70); r.celebY=trackLength+rand(60,FINISH_ZONE-50); }
          const dx=(r.celebX||TRACK_W/2)-r.x, dy=(r.celebY||trackLength+120)-r.y, d=Math.hypot(dx,dy)||1;
          if(d>26){ r.facing=Math.atan2(dy,dx); r.vx+=dx/d*0.30*f; r.vy+=dy/d*0.30*f; }
          if(r.h===0 && Math.random()<0.008) doJump(r);
        }
        if(r.h>0){ r.vh -= (r.vh>0?GRAV_UP:GRAV_DOWN)*gravK()*f; r.h+=r.vh*f; if(r.h<=0){ r.h=0; r.vh=0; r.landT=LAND_MS; } }
        if(r.landT>0) r.landT-=dt*1000;
        if(r.stretchT>0) r.stretchT-=dt*1000;
        const ffr=Math.pow(0.86,f); r.vx*=ffr; r.vy*=ffr;
        r.x+=r.vx*f; r.y+=r.vy*f;
        r.x=clamp(r.x, RADIUS+6, TRACK_W-RADIUS-6);
        // an invisible fence: no going back over the line, no running off the far end
        if(r.y < trackLength+8){ r.y=trackLength+8; if(r.vy<0) r.vy=0; }
        if(r.y > trackLength+FINISH_ZONE){ r.y=trackLength+FINISH_ZONE; if(r.vy>0) r.vy=0; }
        if(r.squash>0) r.squash=Math.max(0,r.squash-dt*4);
        continue;
      }

      if(r.falling){ r.fallT-=dt*1000; if(r.fallT<=0) respawnAfterFall(r); continue; }

      if(r.remoteId){
        const inp=mp.remoteInput[r.remoteId];
        if(inp){
          let ix=inp.ix||0, iy=inp.iy||0;
          const mag=Math.hypot(ix,iy);
          if(mag>0.05){
            const want=Math.atan2(iy,ix);
            let off = want - Math.atan2(r.vy, r.vx);
            while(off> Math.PI) off-=Math.PI*2;
            while(off<-Math.PI) off+=Math.PI*2;
            if(Math.hypot(r.vx,r.vy) > 1.5 && Math.abs(off) > Math.PI*0.45) r.turnGrip = 6;
            r.facing=want;
          }
          const control = r.tumbleT>0?0 : r.stumbleT>0?0.15 : r.falling?0 : r.getUpT>0?0.45 : r.diveT>0?0.12 : r.h>0?0.65:1;
          r.vx+=ix*ACCEL*(1+r.draft)*WIND(r)*control*f; r.vy+=iy*ACCEL*(1+r.draft)*WIND(r)*control*f;
        }
      } else if(!r.isPlayer) updateBotAI(r,dt,t,f);

      // A tumble runs its course in the air and only settles once you land, or
       // racers finish their cartwheel hovering.
      // A tumble that ends in a hole never lands, and the airborne guard below
      // kept re-extending it, so the racer stayed flagged as tumbling for good.
      if(r.tumbleT>0 && (r.falling || r.lavaOut)){ r.tumbleT = 0; r.tumbleSpin = 0; }
      if(r.tumbleT>0){
        r.tumbleAng = (r.tumbleAng||0) + r.tumbleSpin*dt;
        if(r.h<=0.02) r.tumbleSpin *= Math.pow(0.12, dt);
        r.tumbleT -= dt*1000;
        if(r.tumbleT<=0){
          if(r.h>0.5){ r.tumbleT = 60; }        // still airborne: hold the pose
          else {
            r.tumbleT = 0; r.tumbleSpin = 0;
            r.getUpT = Math.max(r.getUpT, TUMBLE_GETUP_MS); r.getUpTotal = r.getUpT; r.windT = 1800;
            // and a moment on your feet before anything may touch you again,
            // or the hazard that put you down simply takes you again
            r.invuln = Math.max(r.invuln, GETUP_INVULN_MS);
          }
        }
      }
      if(r.windT>0) r.windT-=dt*1000;
      if(r.stumbleT>0) r.stumbleT-=dt*1000;
      if(r.diveCd>0)   r.diveCd-=dt*1000;
      if(r.invuln>0)   r.invuln-=dt*1000;
      if(r.getUpT>0)   r.getUpT-=dt*1000;
      if(r.landT>0)    r.landT-=dt*1000;
      if(r.stretchT>0) r.stretchT-=dt*1000;
      if(r.squash>0)   r.squash=Math.max(0,r.squash-dt*4);
      if(r.diveT>0){
        r.diveT-=dt*1000;
        // land the dive flat, then push back up
        if(r.diveT<=0 && r.h<=0){ r.getUpT=diveGetUp(r); r.getUpTotal=r.getUpT; }
      }

      // ---- vertical: floaty on the way up, snappier on the way down
      if(r.h>0){
        // Extra pull through the top of the arc: hanging at the apex is what makes
        // a jump feel floaty, so the arc snaps over instead.
        const apex = Math.abs(r.vh) < 1.7 ? APEX_GRAV : 1;
        r.vh -= (r.vh>0?GRAV_UP:GRAV_DOWN)*apex*gravK()*f;
        r.h += r.vh*f;
        if(r.h<=0){
          r.h=0; r.vh=0;
          r.landT = LAND_MS;                    // the landing squash keyframe
          if(r.diveT>0){ const g=diveGetUp(r); r.getUpT=Math.max(r.getUpT, g); r.getUpTotal=g; }
        }
        r.coyote=0;
      } else {
        // a sliver of grace after walking off an edge, so late jumps still register
        r.coyote=(r.coyote===undefined?COYOTE_MS:Math.max(0,r.coyote-dt*1000));
      }
      // a jump pressed just before landing fires the moment you touch down
      if(r.jumpBuf>0){ r.jumpBuf-=dt*1000; if(r.h<=0 && r.stumbleT<=0 && !r.falling){ r.jumpBuf=0; doJump(r); } }

      // ---- the gradient underfoot ----
      // Cannon Climb and Super Slide bent the world but cost and paid nothing:
      // a hill was scenery. This is the component of gravity along the track,
      // so climbing bleeds speed and a descent hands it back. It stops at the
      // line, or racers milling about in the finish pen get shoved downhill.
      // Only with your feet on it: in the air, ordinary gravity is already
      // doing the work, and a pull up there would just bend jumps sideways.
      if(coursePath && r.h <= 0.5 && !r.falling && !r.finished && r.y < trackLength){
        r.vy -= Math.sin(pathSlope(r.y)) * slopePull() * f;
      }

      // ---- horizontal: prone dives slide, ice holds your momentum
      const slip = currentMap.slippery ? ICE_FR : ((r.turnGrip||0) > 0 ? 0.70 : GROUND_FR);
      if(r.turnGrip) r.turnGrip = Math.max(0, r.turnGrip - f);
      const fr = Math.pow(r.diveT>0 ? 0.972 : (r.h>0 ? AIR_FR : slip), f);
      r.vx*=fr; r.vy*=fr;
      // The hard ceiling. Applied after every impulse of the frame has landed,
      // so a cannon hit or a bumper cannot launch anyone past it either.
      const cap__ = speedCap(), spd__ = Math.hypot(r.vx, r.vy);
      if(spd__ > cap__){ r.vx *= cap__/spd__; r.vy *= cap__/spd__; }
      r.x+=r.vx*f; r.y+=r.vy*f;
      r.x = arenaMode() ? clamp(r.x, TRACK_W/2-1400, TRACK_W/2+1400) : clamp(r.x,4,TRACK_W-4);
      r.y = arenaMode() ? Math.max(r.y,-1400) : Math.max(r.y,-120);
      if(currentMap.knockout && arenaEnd && r.y>arenaEnd){ r.y=arenaEnd; if(r.vy>0) r.vy=0; }
      checkObstacles(r, obsTime(t));
      if(currentMap.mode==='lava' && !r.falling && r.y<lavaZ-40){ r.lavaOut=true; r.lavaCatchY=r.y; spawnBurst3D(r.x,lavaZ,0xff5a2e,16); continue; }
      if(r.y>=trackLength&&!r.finished){
        r.finished=true; r.finishTime=raceTime; r.vy*=0.4; r.diveT=0; r.getUpT=0;
        // confetti for the first three across, a spark for everyone after
        if(racers.filter(q=>q.finished).length <= 3) spawnConfetti(r.x, r.y);
        else spawnBurst3D(r.x,r.y,0xffcb3d,14);
        if(r.isPlayer) SFX.win();
      }
    }

    // Runs here, after the racer loop has marked tiles and before racers push each
    // other about. Kept inside this fragment on purpose: it used to be injected
    // just before racerCollisions(), which is this cut's end anchor, so the cut
    // deleted the call and every minigame quietly stopped ticking.
    updateMinigames(dt, obsTime(t));
    updateWaves(dt);
    updateEvents(dt);
    updateMusic();
