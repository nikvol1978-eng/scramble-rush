    // ============================================================
    // MOVEMENT + PHYSICS
    // ============================================================
    const p=racers.find(r=>r.isPlayer);
    if(p && !p.finished){
      const {ix:ix0,iy:iy0}=computeInputVec();
      let ix=ix0, iy=iy0;
      const mag=Math.hypot(ix,iy);
      if(mag>0.05){ ix/=mag; iy/=mag; p.facing=Math.atan2(iy,ix); }
      const control = p.stumbleT>0?0.15 : p.falling?0 : p.getUpT>0?0.30 : p.diveT>0?0.12 : p.h>0?0.50:1;
      p.vx+=ix*ACCEL*control*f; p.vy+=iy*ACCEL*control*f;
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
        if(r.h>0){ r.vh -= (r.vh>0?GRAV_UP:GRAV_DOWN)*f; r.h+=r.vh*f; if(r.h<=0){ r.h=0; r.vh=0; r.squash=0.6; } }
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
          if(mag>0.05){ r.facing=Math.atan2(iy,ix); }
          const control = r.stumbleT>0?0.15 : r.falling?0 : r.getUpT>0?0.30 : r.diveT>0?0.12 : r.h>0?0.50:1;
          r.vx+=ix*ACCEL*control*f; r.vy+=iy*ACCEL*control*f;
        }
      } else if(!r.isPlayer) updateBotAI(r,dt,t,f);

      if(r.stumbleT>0) r.stumbleT-=dt*1000;
      if(r.diveCd>0)   r.diveCd-=dt*1000;
      if(r.invuln>0)   r.invuln-=dt*1000;
      if(r.getUpT>0)   r.getUpT-=dt*1000;
      if(r.squash>0)   r.squash=Math.max(0,r.squash-dt*4);
      if(r.diveT>0){
        r.diveT-=dt*1000;
        // land the dive flat, then push back up
        if(r.diveT<=0 && r.h<=0){ r.getUpT=260; }
      }

      // ---- vertical: floaty on the way up, snappier on the way down
      if(r.h>0){
        r.vh -= (r.vh>0?GRAV_UP:GRAV_DOWN)*f;
        r.h += r.vh*f;
        if(r.h<=0){
          r.h=0; r.squash=clamp(0.45+Math.abs(r.vh)*0.075,0,1.1); r.vh=0;
          if(r.diveT>0) r.getUpT=Math.max(r.getUpT, 200);
        }
        r.coyote=0;
      } else {
        // a sliver of grace after walking off an edge, so late jumps still register
        r.coyote=(r.coyote===undefined?COYOTE_MS:Math.max(0,r.coyote-dt*1000));
      }
      // a jump pressed just before landing fires the moment you touch down
      if(r.jumpBuf>0){ r.jumpBuf-=dt*1000; if(r.h<=0 && r.stumbleT<=0 && !r.falling){ r.jumpBuf=0; doJump(r); } }

      // ---- horizontal: prone dives slide, ice holds your momentum
      const slip = currentMap.slippery ? 0.955 : 0.885;
      const fr = Math.pow(r.diveT>0 ? 0.972 : (r.h>0 ? 0.955 : slip), f);
      r.vx*=fr; r.vy*=fr;
      r.x+=r.vx*f; r.y+=r.vy*f;
      r.x=clamp(r.x,4,TRACK_W-4);
      r.y=Math.max(r.y,-120);
      checkObstacles(r,t);
      if(currentMap.mode==='lava' && !r.falling && r.y<lavaZ-40){ r.lavaOut=true; r.lavaCatchY=r.y; spawnBurst3D(r.x,lavaZ,0xff5a2e,16); continue; }
      if(r.y>=trackLength&&!r.finished){
        r.finished=true; r.finishTime=raceTime; r.vy*=0.4; r.diveT=0; r.getUpT=0;
        spawnBurst3D(r.x,r.y,0xffcb3d,14); if(r.isPlayer) SFX.win();
      }
    }
