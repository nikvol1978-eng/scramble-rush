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

        // Another racer is a body in the way, not an obstacle. Running into one
        // used to hit like a pendulum -- stumble, launch, screen shake -- which
        // made the pack feel hostile. Now the contact is perfectly inelastic:
        // it kills the closing speed and nothing else, so you are stopped, never
        // bounced back and never floored.
        const force = -vn;
        const imp = force;                       // e = 0: blocked, not bounced
        a.vx -= nx*imp*0.5; a.vy -= ny*imp*0.5;
        b.vx += nx*imp*0.5; b.vy += ny*imp*0.5;

        // ...and you can lean on someone to move them. This is a shove, not a hit:
        // it goes on top of the block so the pusher is not thrown off their line.
        const shove = Math.min(force, 5) * 0.30;
        b.vx += nx*shove; b.vy += ny*shove;

        // a little give in both of them, so contact still reads
        const sq = clamp(force*0.10, 0, 0.55);
        if(sq > 0.10){ a.squash=Math.max(a.squash,sq); b.squash=Math.max(b.squash,sq); }
        if(force > 3.4 && (a.isPlayer||b.isPlayer)) SFX.bump();
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
  // Straight after picking yourself up you go again harder. It is not a
  // rubber band -- everyone gets it, and only for being knocked down.
  const WIND_BOOST = 0.30;
  function WIND(r){ return (r.windT>0 ? 1+WIND_BOOST : 1); }

  const DRAFT_MAX = 0.10, DRAFT_NEAR = 20, DRAFT_FAR = 190, DRAFT_WIDE = 80;
  const DRAFT_BEHIND_MAX = 0.85;      // how much extra a back-marker can draw
  function updateSlipstream(){
    let lead = -1e9;
    for(const r of racers) if(!r.falling && !r.lavaOut && r.y > lead) lead = r.y;
    for(const r of racers){
      r.draft = 0;
      if(r.finished||r.falling||r.knockedOut) continue;
      for(const o of racers){
        if(o===r || o.falling || o.finished || o.knockedOut) continue;
        const ahead = o.y - r.y;
        if(ahead < DRAFT_NEAR || ahead > DRAFT_FAR) continue;
        if(Math.abs(o.x - r.x) > DRAFT_WIDE) continue;
        const closeness = 1 - (ahead-DRAFT_NEAR)/(DRAFT_FAR-DRAFT_NEAR);
        // The further off the pace you are, the more the tow is worth. It never
        // makes you faster than the leader, because the leader has nobody to draft.
        const behind = clamp((lead - r.y)/2600, 0, 1)*DRAFT_BEHIND_MAX;
        const boost = DRAFT_MAX*closeness*(1+behind);
        if(boost > r.draft) r.draft = boost;
      }
    }
  }
