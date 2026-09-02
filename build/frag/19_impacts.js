  // ============================================================
  // RACER vs RACER COLLISION
  // ============================================================
  function racerCollisions(){
    const active=racers.filter(r=>!r.finished&&!r.falling&&!r.knockedOut);
    for(let i=0;i<active.length;i++){
      for(let j=i+1;j<active.length;j++){
        const a=active[i], b=active[j];
        if(Math.abs(a.h-b.h)>RADIUS*1.6) continue;
        const dx=b.x-a.x, dy=b.y-a.y; const d=Math.hypot(dx,dy); const minD=RADIUS*2-2;
        if(d>=minD||d===0) continue;
        const nx=dx/d, ny=dy/d; const pen=(minD-d)/2;
        a.x-=nx*pen; a.y-=ny*pen; b.x+=nx*pen; b.y+=ny*pen;
        const rvx=b.vx-a.vx, rvy=b.vy-a.vy; const vn=rvx*nx+rvy*ny;
        if(vn>=0) continue;

        // A diving blob hits like a cannonball; everyone else trades momentum with
        // some bounce. The old impulse was scaled by 0.9*0.6, which read as a nudge
        // rather than a collision.
        const wa = a.diveT>0?2.2:1, wb = b.diveT>0?2.2:1;
        const imp = -vn * 1.35;
        a.vx -= nx*imp*wb/(wa+wb); a.vy -= ny*imp*wb/(wa+wb);
        b.vx += nx*imp*wa/(wa+wb); b.vy += ny*imp*wa/(wa+wb);

        // squash both of them, scaled by how hard it was
        const force = -vn;
        const sq = clamp(force*0.16, 0, 1.1);
        if(sq > 0.12){ a.squash=Math.max(a.squash,sq); b.squash=Math.max(b.squash,sq); }

        if(force > 3.2){
          const victim = a.diveT>0 ? b : b.diveT>0 ? a
                       : (Math.hypot(a.vx,a.vy) > Math.hypot(b.vx,b.vy) ? b : a);
          if(victim.stumbleT<=0 && victim.invuln<=0){
            victim.stumbleT = 180 + Math.min(260, force*30);
            victim.squash = 1;
            // a hard enough hit takes you off your feet
            if(victim.h<=0 && force>5){ victim.vh = Math.min(3.4, force*0.4); victim.h = 0.01; }
          }
          spawnBurst3D((a.x+b.x)/2,(a.y+b.y)/2,0xffffff, 4+Math.min(10, force|0));
          if(a.isPlayer||b.isPlayer){ SFX.bump(); camShake = Math.min(6, 1.5+force*0.5); }
        }
      }
    }
    // Pushing each other apart can shove someone through the arena fence, because
    // this runs after the movement clamp. Put them back.
    if(currentMap.knockout && arenaEnd){
      // Eliminated racers were exempt, so a knocked-out blob kept its momentum
      // and sailed straight out through the end wall in full view.
      for(const r of racers){
        if(r.y > arenaEnd){ r.y = arenaEnd; if(r.vy>0) r.vy = 0; }
      }
    }
  }

  // ============================================================
  // SLIPSTREAM
  // ============================================================
  // Running just behind someone gives a small tow. It keeps the pack together and
  // lets a trailing player claw back, without ever making the leader faster —
  // there is nobody in front of them to draft.
  const DRAFT_MAX = 0.10, DRAFT_NEAR = 20, DRAFT_FAR = 190, DRAFT_WIDE = 80;
  function updateSlipstream(){
    for(const r of racers){
      r.draft = 0;
      if(r.finished||r.falling||r.knockedOut) continue;
      for(const o of racers){
        if(o===r || o.falling || o.finished || o.knockedOut) continue;
        const ahead = o.y - r.y;
        if(ahead < DRAFT_NEAR || ahead > DRAFT_FAR) continue;
        if(Math.abs(o.x - r.x) > DRAFT_WIDE) continue;
        const closeness = 1 - (ahead-DRAFT_NEAR)/(DRAFT_FAR-DRAFT_NEAR);
        const boost = DRAFT_MAX*closeness;
        if(boost > r.draft) r.draft = boost;
      }
    }
  }
