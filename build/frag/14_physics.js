    // ============================================================
    // MOVEMENT + PHYSICS
    // ============================================================
    updateSlipstream();

    const p=racers.find(r=>r.isPlayer);
    if(p && !p.finished){
      const {ix:ix0,iy:iy0}=computeInputVec();
      const mag=Math.hypot(ix0,iy0);
      // v25: you drive along the BODY, not along the stick.
      //
      // The body already turned toward the stick at TURN_RATE_GROUND while the
      // push went instantly wherever the stick pointed, so the two disagreed
      // for the whole of every turn. Measured, a 180 at full tilt put the
      // velocity through zero in three frames and back to nine tenths of top
      // speed the other way in nine, coasting 1.8 units on the way -- a third
      // of a bean. That is a tank turn wearing a bean's animation, and no
      // amount of tuning the constants fixes it, because the model says a racer
      // may change direction instantly and the picture says it may not.
      //
      // The previous fix for that disagreement went the other way: `turnGrip`
      // spotted a sharp turn and made the GROUND grippier for six frames so the
      // velocity would catch the body up. That treats momentum as the defect.
      // Driving along the body makes the two agree by construction -- the push
      // sweeps round with the bean, the velocity follows it in an arc, and a
      // reversal costs what turning a running body round ought to cost. So
      // turnGrip goes with it: there is no longer a disagreement to paper over.
      let dvx=0, dvy=0, amt=0;
      if(mag>0.05 && !p.airDive){
        // The stick's length is how hard, the body is which way. Clamped,
        // because a keyboard's diagonal is 1.414 and must not out-accelerate a
        // stick pushed all the way.
        amt = Math.min(1, mag);
        const want = Math.atan2(iy0,ix0);
        const rate = (p.h>0 ? TURN_RATE_AIR : TURN_RATE_GROUND) * dt;
        let d = want - p.facing;
        while(d> Math.PI) d-=Math.PI*2;
        while(d<-Math.PI) d+=Math.PI*2;
        p.facing = (Math.hypot(p.vx,p.vy) < TURN_SNAP_SPEED)
                 ? want                                   // no momentum to argue with
                 : p.facing + clamp(d, -rate, rate);
        dvx = Math.cos(p.facing); dvy = Math.sin(p.facing);
      }
      // v22: getting up gives you a little more of yourself back than it did.
      // At 0.30 the last quarter-second of every knock felt like a second knock.
      const control = (p.airDive?0 : (p.respawnFreeze>0)?0 : p.tumbleT>0?0 : p.stumbleT>0?0.15 : p.falling?0 : p.getUpT>0?0.45 : p.diveT>0?0.12 : p.h>0?AIR_CONTROL:1)
                    * ((p.slideT||0) > 0 ? LAND_SLIDE_STEER : 1);
      let pax = dvx*amt*ACCEL*(1+p.draft)*WIND(p)*control, pay = dvy*amt*ACCEL*(1+p.draft)*WIND(p)*control;
      const iceK = iceBlend(p, pax, pay);
      p.vx+=pax*iceK*f; p.vy+=pay*iceK*f;
    }

    for(const r of racers){
      if(r.lavaOut) continue;

      // ---- past the line: you can mill about the finish area, but not leave it
      if(r.finished){
        // Once the spectator screen is up the arrows belong to it, and the
        // player's own bean is not on camera anyway -- reading movement here as
        // well would have one key press both switch who you are watching and
        // shove a bean you cannot see around the finish pen.
        if(r.isPlayer && !spectating()){
          const {ix,iy}=computeInputVec();
          const mag=Math.hypot(ix,iy);
          if(mag>0.05){ r.facing=Math.atan2(iy,ix); r.vx+=ix/mag*0.55*f; r.vy+=iy/mag*0.55*f; }
        } else if(!r.isPlayer) {
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

      // Where this racer starts the tick, so a solid can put it back on the
      // side it came from rather than the side its centre ends up on. Good
      // until checkObstacles has used it, below. See sideOf in 09_minigames.js.
      r.mvX = r.x; r.mvY = r.y; r.mvH = r.h; r.mvOk = true;

      if(r.remoteId){
        const inp=mp.remoteInput[r.remoteId];
        if(inp){
          const ix=inp.ix||0, iy=inp.iy||0;
          const mag=Math.hypot(ix,iy);
          // The same model the local player is on. A remote bean is the same
          // bean: it used to snap its facing to the stick and push along the
          // stick, so every other player in a multiplayer round turned like a
          // tank while the one on your own screen turned like a bean.
          let dvx=0, dvy=0, amt=0;
          if(mag>0.05 && !r.airDive){
            amt = Math.min(1, mag);
            const want=Math.atan2(iy,ix);
            const rate = (r.h>0 ? TURN_RATE_AIR : TURN_RATE_GROUND) * dt;
            let d = want - r.facing;
            while(d> Math.PI) d-=Math.PI*2;
            while(d<-Math.PI) d+=Math.PI*2;
            r.facing = (Math.hypot(r.vx,r.vy) < TURN_SNAP_SPEED)
                     ? want : r.facing + clamp(d, -rate, rate);
            dvx = Math.cos(r.facing); dvy = Math.sin(r.facing);
          }
          const control = (r.airDive?0 : (r.respawnFreeze>0)?0 : r.tumbleT>0?0 : r.stumbleT>0?0.15 : r.falling?0 : r.getUpT>0?0.45 : r.diveT>0?0.12 : r.h>0?AIR_CONTROL:1)
                        * ((r.slideT||0) > 0 ? LAND_SLIDE_STEER : 1);
          r.vx+=dvx*amt*ACCEL*(1+r.draft)*WIND(r)*control*f; r.vy+=dvy*amt*ACCEL*(1+r.draft)*WIND(r)*control*f;
        }
      } else if(!r.isPlayer){ botAirDive(r); updateBotAI(r,dt,t,f); }

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
      if(r.respawnFreeze>0){ r.respawnFreeze-=dt; r.vx=0; r.vy=0; }
      if(r.windT>0) r.windT-=dt*1000;
      if(r.stumbleT>0) r.stumbleT-=dt*1000;
      if(r.diveCd>0)   r.diveCd-=dt*1000;
      if(r.invuln>0)   r.invuln-=dt*1000;
      if(r.getUpT>0)   r.getUpT-=dt*1000;
      if(r.landT>0)    r.landT-=dt*1000;
      if(r.slideT>0)   r.slideT=Math.max(0, r.slideT-f);
      if(r.stretchT>0) r.stretchT-=dt*1000;
      if(r.squash>0)   r.squash=Math.max(0,r.squash-dt*4);
      // An air dive stays a dive until it lands, however long it hangs: the
      // prone timer running out in mid-flight used to drop the pose, the low
      // friction and the belly-flop all at once, so a long dive quietly turned
      // back into an ordinary fall.
      if(r.airDive && r.h>0) r.diveT = Math.max(r.diveT, 60);
      if(r.diveT>0){
        r.diveT-=dt*1000;
        // land the dive flat, then push back up
        if(r.diveT<=0 && r.h<=0){ r.getUpT=diveGetUp(r); r.getUpTotal=r.getUpT; }
      }
      // §2.5: untouchable through the air, and not for a moment after. The
      // prone slide and the half-second on your face are both fair game.
      if(r.diveT>0 && r.h>0.005) r.invuln = Math.max(r.invuln, 34);

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
          r.slideT = LAND_SLIDE_F;              // and the slide it lands in
          if(r.diveT>0 || r.airDive){ const g=diveGetUp(r); r.getUpT=Math.max(r.getUpT, g); r.getUpTotal=g; }
          r.airDive = false;                    // the commit ends where it lands
        }
        r.coyote=0;
      } else {
        // a sliver of grace after walking off an edge, so late jumps still register
        r.coyote=(r.coyote===undefined?COYOTE_MS:Math.max(0,r.coyote-dt*1000));
      }
      // a jump pressed just before landing fires the moment you touch down
      if(r.jumpBuf>0){ r.jumpBuf-=dt*1000; if(r.h<=0 && r.stumbleT<=0 && !r.falling){ r.jumpBuf=0; doJump(r); } }

      // ---- the gradient underfoot ----
      // Boom Peak and Splash Slide bent the world but cost and paid nothing:
      // a hill was scenery. This is the component of gravity along the track,
      // so climbing bleeds speed and a descent hands it back. It stops at the
      // line, or racers milling about in the finish pen get shoved downhill.
      // Only with your feet on it: in the air, ordinary gravity is already
      // doing the work, and a pull up there would just bend jumps sideways.
      if(coursePath && r.h <= 0.5 && !r.falling && !r.finished && r.y < trackLength){
        r.vy -= Math.sin(pathSlope(r.y)) * slopePull() * f;
      }

      // ---- horizontal: prone dives slide, ice holds your momentum
      // Ice first, because a landing does not make ice grippier. Then the
      // landing slide, which outranks the turn bite for the same reason: you
      // cannot dig in with your feet while they are still sliding.
      // v25: the turn-bite is gone. It existed because the body and the push
      // pointed different ways during a turn, and made the ground briefly
      // grippier so the velocity would catch up; the push now sweeps round with
      // the body, so there is nothing to catch up to and nothing here to hide.
      // What is left is the honest order: ice first, because a landing does not
      // make ice grippier, then the landing slide, because you cannot dig in
      // with your feet while they are still sliding.
      const slip = currentMap.slippery ? ICE_FR
                 : (r.slideT||0) > 0    ? LAND_SLIDE_FR
                 :                        GROUND_FR;
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
      frameK = f; checkObstacles(r, obsTime(t)); r.mvOk = false;
      // §2.9: the flag you last went past is where you come back to. Lighting
      // it is the player's business only -- a bot passing one should not tell
      // you that you have banked it.
      for(let ci=checkpoints.length-1; ci>=0; ci--){
        if(r.y >= checkpoints[ci].y){
          if((r.cpIndex===undefined ? -1 : r.cpIndex) < ci){
            r.cpIndex = ci;
            if(r.isPlayer && !checkpoints[ci].lit){
              checkpoints[ci].lit = true;
              if(checkpoints[ci].banner) checkpoints[ci].banner.material.color.setHex(checkpoints[ci].litColor);
            }
          }
          break;
        }
      }
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
