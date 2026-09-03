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
