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
