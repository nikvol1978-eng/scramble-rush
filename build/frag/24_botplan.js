  // ============================================================
  // BOT PLANS FOR THE OBSTACLES THEY USED TO IGNORE
  // ============================================================
  // updateBotAI only ever understood pillars, hammers, pushers, spinbars, pits
  // and narrows. Everything added since -- gates, forks, shortcuts, crumbling
  // bridges, cannons, boost pads, beams, doors, tile fields -- it drove straight
  // at. Five bots once stood behind a Sunny Sprint gate for a whole round.
  //
  // Returns true when it has taken charge, having set r.targetX and r.aiThrottle.
  // Hard anti-stall, independent of any plan. The old stuck detector only
  // counted while throttle > 0.5, so a bot in one of the cautious modes (0.45
  // at a hazard, 0.15 under a cannon) could brake to line up, lose its speed to
  // friction, and never accumulate a single frame of "stuck" -- which is how one
  // stood still on Super Slide for 26.8 seconds.
  // Where it is safe to stand, if anything nearby wants to drop you.
  function safeLaneNear(r){
    for(const o of obstacles){
      if(o.yStart === undefined || r.y < o.yStart - 260 || r.y > o.yEnd + 60) continue;
      if(o.type === 'narrow') return clamp(TRACK_W/2 + (o.offset||0), 40, TRACK_W-40);
      if(o.type === 'gap') return clamp(r.x < o.cx ? o.cx - o.halfWidth - 70 : o.cx + o.halfWidth + 70, 40, TRACK_W-40);
      if(o.type === 'pit' && o.platforms && o.platforms.length){
        let best = null, bestD = 1e9;
        for(const pl of o.platforms){
          const px = platX(pl, raceTime), d = Math.abs(px - r.x);
          if(d < bestD){ bestD = d; best = px; }
        }
        if(best !== null) return clamp(best, 40, TRACK_W-40);
      }
      if(o.type === 'crumble' && o.slabs){
        let best = null, bestD = 1e9;
        for(const sl of o.slabs){
          if(sl.gone) continue;
          const d = Math.abs(sl.x - r.x);
          if(d < bestD){ bestD = d; best = sl.x; }
        }
        if(best !== null) return clamp(best, 40, TRACK_W-40);
      }
    }
    return null;
  }

  function botAntiStall(r, dt){
    if(r.escapeT > 0){ r.escapeT -= dt; return; }
    if(Math.abs(r.vy) >= 0.3 || r.falling || r.lavaOut || r.finished
       || r.stumbleT > 0 || r.tumbleT > 0 || r.getUpT > 0){ r.deadT = 0; return; }
    r.deadT = (r.deadT||0) + dt;
    if(r.deadT < 2) return;
    // Two seconds without going anywhere: jump, pick a fresh line, and throw
    // away whatever plan put us here.
    r.deadT = 0;
    r.escapeT = 0.9;
    // A new line, but not a suicidal one: a blind 200-unit sidestep next to a
    // narrow channel is a guaranteed fall, then a respawn, then another stall.
    // If there is a hole in front of us, escape along the line that survives it.
    r.escapeX = safeLaneNear(r) ;
    if(r.escapeX === null)
      r.escapeX = clamp(r.x + (Math.random()<0.5?-1:1)*rand(110,240), 40, TRACK_W-40);
    r.targetX = r.escapeX;
    r.aiSafe = false; r.spotFalls = 0; r.aiObsFor = null;
    r.aiDoor = undefined; r.aiFork = undefined; r.aiLane = undefined; r.aiDoorX = undefined;
    if(r.h <= 0) doJump(r);
  }

  function botPlan(r, o, dist, t, dt){
    // an escape overrides every plan, including "stand still and wait"
    if(r.escapeT > 0){ r.targetX = r.escapeX; r.aiThrottle = 1; return true; }
    if(!o) return false;
    const set = (x, thr)=>{ r.targetX = clamp(x, 40, TRACK_W-40); r.aiThrottle = thr===undefined?1:thr; return true; };
    const near = dist < 340;                       // close enough to commit to a line
    if((r.fallCount||0) >= 5) r.aiSafe = true;     // that is enough for one round

    // Three falls at the same place means the plan is not working: take the
    // safe middle, slow down, and stop feeding the respawn loop.
    if(r.fallCount && r.lastFallY !== undefined && Math.abs(r.lastFallY - o.y) < 150){
      r.spotFalls = (r.spotFalls||0);
      if(r.spotFalls >= 2 && r.y < o.y1) return set(TRACK_W/2 + (o.offset||0), 0.6);
    }

    // The legacy chain handles these, but not after they have already cost you
    // two lives: then take the middle of the safe channel and slow down.
    const HOLE = (o.type==='narrow' || o.type==='pit' || o.type==='crumble');
    if(HOLE && r.aiSafe && r.y < o.y1 + 260) return set(TRACK_W/2 + (o.offset||0), 0.45);
    if(HOLE && (r.spotFalls||0) >= 2 && r.y < o.y1)
      return set(TRACK_W/2 + (o.offset||0), 0.6);
    // ...and once a bot has fallen four times in a round anywhere, it stops
    // gambling entirely. Per-obstacle caution still let them collect two falls
    // at each of four hazards.
    if(HOLE && (r.fallCount||0) >= 3 && r.y < o.y1 + 200)
      return set(TRACK_W/2 + (o.offset||0), 0.55);

    switch(o.type){

      case 'gate': {
        // Pick a door and queue for it. Everyone aiming at the same one is
        // the traffic jam working, not a bug -- but they have to keep shuffling.
        if(r.aiDoor === undefined || r.aiObsFor !== o){
          r.aiObsFor = o;
          r.aiDoor = o.xs[Math.floor(Math.random()*o.xs.length)];
        }
        const gx = r.aiDoor;
        const lined = Math.abs(r.x - gx) < o.gapW*0.28;
        if(near && !lined) return set(gx, 0.45);       // slot in before you push
        if(r.stuckT > 0.5 && r.h<=0){ doJump(r); }     // hop out of a scrum
        return set(gx, 1);
      }

      case 'fork': {
        // A third of them take the raised lane, the rest the clear side.
        if(r.aiSafe) return set(o.cx - o.risk*(TRACK_W/4), 0.8);
        if(r.aiFork === undefined || r.aiObsFor !== o){
          r.aiObsFor = o;
          r.aiFork = Math.random() < 0.35 ? o.risk : -o.risk;
        }
        return set(o.cx + r.aiFork*(TRACK_W/4), 1);
      }

      case 'shortcut': {
        if(r.aiSafe) return set(o.cx > TRACK_W/2 ? o.cx - o.w - 90 : o.cx + o.w + 90, 0.8);
        if(r.aiLane === undefined || r.aiObsFor !== o){
          r.aiObsFor = o;
          r.aiLane = Math.random() < 0.35;
        }
        if(!r.aiLane) return set(o.cx > TRACK_W/2 ? o.cx - o.w - 90 : o.cx + o.w + 90, 1);
        return set(o.cx, 1);
      }

      case 'crumble': {
        // Head for a slab nobody has stood on, and never stop on the bridge.
        let best = null, bestD = 1e9;
        for(const sl of o.slabs){
          if(sl.gone) continue;
          const ahead = sl.y - r.y;
          if(ahead < -40 || ahead > 520) continue;
          const d = Math.abs(sl.x - r.x) + (sl.touched ? 220 : 0) + ahead*0.25;
          if(d < bestD){ bestD = d; best = sl; }
        }
        if(best) return set(best.x, 1);
        return set(o.slabs.length ? o.slabs[0].x : TRACK_W/2, 1);
      }

      case 'cannon': {
        // Wait out the telegraph, then run. Standing in the lane while the
        // floor is flashing is how a bot loses a round.
        let hot = false;
        for(const it of o.items){
          if(Math.abs(it.y - r.y) > 220) continue;
          if(it.cool !== undefined && it.cool < CANNON_WARN) hot = true;
        }
        if(hot && near) return set(r.x, 0.15);
        return set(o.cx===undefined ? TRACK_W/2 : o.cx, 1);
      }

      case 'pit': {
        // Repeat fallers aim straight at a platform and slow down for it.
        if((r.fallCount||0) < 3) return false;
        let best = null, bestD = 1e9;
        for(const pl of o.platforms){
          const px = platX(pl, t), d = Math.abs(px - r.x);
          if(d < bestD){ bestD = d; best = px; }
        }
        return best === null ? false : set(best, 0.5);
      }

      case 'gap':
        // Two wide ways round: take whichever side you are already nearer.
        const clear = 55 + (currentMap.slippery ? 50 : 0);
        return set(r.x < o.cx ? o.cx - o.halfWidth - clear : o.cx + o.halfWidth + clear, 1);

      case 'boost':
        return set(o.cx, 1);                          // free speed, line up on it

      case 'laserbar': {
        // Low beams you jump, high beams you dive under -- the same read the
        // player makes.
        const by = laserY(o, t);
        const gap = by - r.y;
        if(gap > 0 && gap < 90 && r.h <= 0 && r.stumbleT <= 0){
          if(o.low) doJump(r); else doDive(r);
        }
        return set(r.x, 1);
      }

      case 'pendulum': {
        // Cross while the ball is away from the middle.
        const pp = pendPos(o, t);
        if(near && Math.abs(pp.x - r.x) < 90) return set(r.x + Math.sign(r.x - pp.x)*160, 0.5);
        return set(r.targetX===undefined ? TRACK_W/2 : r.targetX, 1);
      }

      case 'bumper': {
        // Nothing here hurts, but bouncing wastes time: aim at a gap.
        let gapX = TRACK_W/2, bestD = -1;
        for(let x=60; x<TRACK_W-60; x+=40){
          let d = 1e9;
          for(const it of o.items) d = Math.min(d, Math.abs(it.x - x));
          if(d > bestD){ bestD = d; gapX = x; }
        }
        return set(gapX, 1);
      }

      case 'doors': {
        // Once anyone has smashed a door, everyone routes to the hole.
        const open = o.items.filter(i=>i.broken);
        if(open.length){
          let b = open[0];
          for(const i of open) if(Math.abs(i.x-r.x) < Math.abs(b.x-r.x)) b = i;
          return set(b.x, 1);
        }
        if(r.aiDoorX === undefined || r.aiObsFor !== o){
          r.aiObsFor = o;
          r.aiDoorX = o.items[Math.floor(Math.random()*o.items.length)].x;
        }
        // bounced off a solid one: try a neighbour instead of shoving forever
        if(r.stuckT > 0.6){
          r.stuckT = 0;
          const others = o.items.filter(i=>Math.abs(i.x - r.aiDoorX) > 20);
          if(others.length) r.aiDoorX = others[Math.floor(Math.random()*others.length)].x;
        }
        return set(r.aiDoorX, 1);
      }

      case 'tilefield': {
        // Keep moving, prefer floor that is not already counting down.
        const tl = tileAt(o, r.x, r.y + 90);
        if(tl && !tl.gone && tl.fuse < 0) return set(tl.x, 1);
        let best = null, bestD = 1e9;
        for(const c of o.tiles){
          if(c.gone || c.fuse >= 0) continue;
          const ahead = c.y - r.y;
          if(ahead < 20 || ahead > 320) continue;
          const d = Math.abs(c.x - r.x) + ahead*0.3;
          if(d < bestD){ bestD = d; best = c; }
        }
        if(best) return set(best.x, 1);
        return set(r.x, 1);
      }
    }
    return false;
  }
