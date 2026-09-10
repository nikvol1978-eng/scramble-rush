  // ============================================================
  // ARENA AND COLLECT BOT AI
  // ============================================================
  // The normal bot runs at the finish line. Two round types do not have one:
  // a closing arena, where the only goal is to stay on the floor, and Gem Grab,
  // where the goal is scattered across it. Returns true when it took the wheel.
  function arenaBotAI(r, dt, t, f){
    const control = r.tumbleT>0?0 : r.stumbleT>0?0.15 : r.falling?0 : r.getUpT>0?0.30 : r.h>0?0.50:1;
    const drive = (tx, ty, stopAt)=>{
      const dx = tx-r.x, dy = ty-r.y, d = Math.hypot(dx,dy)||1;
      if(d > (stopAt||26)){
        r.facing = Math.atan2(dy,dx);
        r.vx += dx/d*ACCEL*WIND(r)*control*f;
        r.vy += dy/d*ACCEL*WIND(r)*control*f;
      }
      return d;
    };

    // ---- Gem Grab: go and get the nearest one you have not been beaten to
    const gems = obstacles.find(o=>o.type==='gems');
    if(gems){
      if(r.gemSafe){
        // already through: drift about rather than hoovering up everyone else's
        if(r.aiIdleT===undefined || r.aiIdleT<=0){ r.aiIdleT = rand(1.2,2.6); r.aiIdleX = rand(80, TRACK_W-80); r.aiIdleY = r.y + rand(-260,260); }
        r.aiIdleT -= dt;
        drive(r.aiIdleX, r.aiIdleY, 40);
        return true;
      }
      let best = null, bestD = 1e9;
      for(const g of gems.items){
        if(g.taken) continue;
        const d = Math.hypot(g.x-r.x, g.y-r.y);
        if(d < bestD){ bestD = d; best = g; }
      }
      if(best) drive(best.x, best.y, 6);
      return true;
    }

    // ---- Wall Rush: get through the gap, and never give ground to do it
    // The plan is one sentence -- go to the gap in the wall that will reach you
    // next, and go through it -- but the second half is what stops it being a
    // queue. Aiming at a point past the wall means a bot presses into the face
    // and slides along it, instead of parking in front of the gap and waiting
    // to be pushed off by the wall behind.
    const plate = obstacles.find(o=>o.type==='plate');
    if(plate){
      if(r.aiGapBias===undefined) r.aiGapBias = rand(-0.42, 0.42);
      let next=null, bestD=1e9;
      for(const o of obstacles){
        if(o.type!=='blockwall' || !o.travel) continue;
        const d = o.wy - r.y;
        if(d < -o.d) continue;                       // already gone past me
        if(d < bestD){ bestD=d; next=o; }
      }
      if(!next){ drive(r.x, Math.min(plate.yFar-140, r.y+420), 20); return true; }
      // Twenty-four bots on one x is a wall of beans in front of the gap, which
      // is the same problem as the wall: they shove each other off the sides in
      // the first four seconds. Each takes its own lane of the gap and holds it.
      const gx = wallGapX(next) + r.aiGapBias*next.gapSlots*next.slotW;
      // And they queue in depth rather than all pressing on the face. Hold a
      // stand-off, lined up, until the wall is close enough to commit to; then
      // aim past it, which is what carries you through the gap instead of
      // parking in front of it.
      const dy = next.wy - r.y;
      drive(gx, dy > 300 ? next.wy - 300 : next.wy + 300, 14);
      return true;
    }

    // ---- Beam Team: hold a spot, and read the arm that is coming to it
    // A bot cannot outrun the arms -- they reach the rim -- so it does not try.
    // It picks somewhere to stand and makes the same read the player makes: how
    // long until an arm gets to my bearing, and is it the one I jump or the one
    // I go under.
    const hubs = obstacles.filter(o=>o.type==='spinlaser');
    if(hubs.length){
      const floor = obstacles.find(o=>o.type==='disc');
      if(floor){
        if(r.aiHome===undefined){ r.aiHome = rand(0.30,0.78); r.aiHomeA = rand(0,6.28); }
        drive(floor.cx + Math.cos(r.aiHomeA)*floor.r*r.aiHome,
              floor.y  + Math.sin(r.aiHomeA)*floor.r*r.aiHome, 30);
      }
      // Written as !(x>0), not x<=0. baseRacer() initialised getUpT and not
      // tumbleT, so on a racer that had never been knocked down the tumbleT
      // half of this read `undefined <= 0` -- false -- and the guard never
      // opened: not one bot jumped a beam in the whole round, and the field
      // stood there and let the arms walk it off the rim. tumbleT starts at
      // zero now, so either spelling works; this one cannot break again if a
      // field is ever added without an initialiser.
      if(r.h<=0 && !(r.stumbleT>0) && !(r.tumbleT>0) && !(r.getUpT>0)){
        for(const o of hubs){
          const dx=r.x-o.cx, dy=r.y-o.y, dist=Math.hypot(dx,dy);
          if(dist < 24 || dist > o.len) continue;
          const ang=Math.atan2(dy,dx), base=spinlaserAngle(o,t), step=Math.PI*2/o.arms;
          const w = o.speed;
          if(!w) continue;
          let soonest = Infinity;
          for(let i=0;i<o.arms;i++){
            let d = ang - (base + i*step);
            while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2;
            // Already in it -- being carried, and the way out is the same one
            // it should have taken. Left to the arithmetic below this reads as
            // a whole revolution away half the time, depending on which side of
            // the beam's line the bot happens to be standing.
            if(Math.cos(d) > 0 && Math.abs(Math.sin(d))*dist < 34){ soonest = 0; break; }
            // otherwise: when this arm's bearing reaches mine, the way it turns
            let tt = d/w;
            if(tt < 0) tt += Math.PI*2/Math.abs(w);
            if(tt < soonest) soonest = tt;
          }
          // Leave it late. Jumping a second early is landing back in it, and a
          // dive that has finished is a racer standing up into a high arm.
          if(soonest < 0.26){ if(o.h < 24) doJump(r); else doDive(r); break; }
        }
      }
      return true;
    }

    // ---- closing arena: hold a spot somewhere off the middle
    const arena = obstacles.find(o=>o.type==='ring'||o.type==='disc');
    if(arena){
      if(r.aiHome===undefined){ r.aiHome = rand(0.18,0.62); r.aiHomeA = rand(0,6.28); }
      const keep = arena.r * r.aiHome;
      drive(arena.cx + Math.cos(r.aiHomeA)*keep, arena.y + Math.sin(r.aiHomeA)*keep, 26);
      return true;
    }
    return false;
  }
