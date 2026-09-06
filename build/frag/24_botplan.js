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
  // A stable id for a hazard, since these spans have no o.y of their own.
  function obsMid(o){ return o.y !== undefined ? o.y : Math.round((o.yStart + o.yEnd)/2); }
  function obsKey(o){ return o.type + '@' + obsMid(o); }

  // The lane through a particular hazard, right now.
  function safeLaneFor(o, r){
    if(o.type === 'narrow') return clamp(TRACK_W/2 + (o.offset||0), 40, TRACK_W-40);
    if(o.type === 'gap')    return clamp(r.x < o.cx ? o.cx - o.halfWidth - 60 : o.cx + o.halfWidth + 60, 40, TRACK_W-40);
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
    return null;
  }

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
    if(r.pitWait){ r.deadT = 0; return; }        // standing at a pit edge on purpose
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

    // ---- the fall-loop breaker, per hazard ----
    // Three falls at the same hazard and the bot stops improvising: it takes
    // that hazard's own lane and crawls until it is past. The old version keyed
    // off o.y, which pit, narrow, gap and crumble do not have -- they are
    // yStart/yEnd spans -- so it compared against undefined and never fired for
    // the four types that need it. One Sunny pit collected ninety falls.
    const HOLE = (o.type==='narrow' || o.type==='pit' || o.type==='crumble' || o.type==='gap');
    if(o.type !== 'pit' && r.pitWait) r.pitWait = null;          // past it, or somewhere else entirely
    if(HOLE){
      const hereFalls = (r.holeFalls && r.holeFalls[obsKey(o)]) || 0;

      // ---- the pit has its own rule ----
      // A moving platform punishes the generic breaker: crawling at 0.6 gives
      // the platform longer to move out from under you, and nothing carries a
      // rider. After two falls here the bot walks to the edge, stops dead,
      // waits at the end of a platform's swing (the one spot it pauses over),
      // commits at full throttle only when that platform is under its line
      // now, halfway across and at the far side -- the swing is a sine, so all
      // three are known -- and then holds that line until it is past.
      if(o.type === 'pit' && hereFalls >= 2 && o.platforms && o.platforms.length && r.y < o.y1 + 120){
        // Which end of a platform's swing to wait at: whichever is actually on
        // the track (an end clamped to the wall is a spot the platform never
        // reaches) and nearer to us.
        const waitSpot = (pl)=>{
          const lo = RADIUS+10, hi = TRACK_W-RADIUS-10;
          const ends = [pl.baseX + pl.amp, pl.baseX - pl.amp].filter(x=>x >= lo && x <= hi);
          return ends.length ? ends.reduce((a,b)=>Math.abs(a-r.x) <= Math.abs(b-r.x) ? a : b) : clamp(pl.baseX, lo, hi);
        };
        // a fresh wait after every fall: a commit that failed is not carried over
        if(!r.pitWait || r.pitWait.o !== o || r.pitWait.falls !== hereFalls){
          let nearest = 0, bestD = 1e9;
          o.platforms.forEach((pl, i)=>{ const d = Math.abs(pl.baseX - r.x); if(d < bestD){ bestD = d; nearest = i; } });
          // the third fall and after move along a platform, so the waiters spread out
          const idx = (nearest + Math.max(0, hereFalls - 2)) % o.platforms.length;
          r.pitWait = { o, idx, plat: o.platforms[idx], xWait: waitSpot(o.platforms[idx]), committed:false, xCommit:0, falls: hereFalls, waited: 0 };
        }
        const pw = r.pitWait;
        const edge = o.yStart - RADIUS - 6;
        if(pw.committed){
          if(r.y > o.y1){ r.pitWait = null; return false; }    // across: back to the ordinary plans
          return set(pw.xCommit, 1);                           // hold the line: no steering, no drifting either
        }
        // Only a bot still short of the edge waits. One already over the pit
        // (or past it -- the pit stays "next" for 20 units beyond its end) is
        // never dragged back to the edge: that teleport was the loop itself.
        else if(r.y > edge + 4){ r.pitWait = null; return false; }
        else {
          if(r.y < edge - 90) return set(pw.xWait, 1);           // still walking up to the edge
          pw.waited += dt;
          // six seconds without a clean window here: try the next platform along
          if(pw.waited > 6){ pw.idx = (pw.idx + 1) % o.platforms.length; pw.plat = o.platforms[pw.idx]; pw.xWait = waitSpot(pw.plat); pw.waited = 0; }
          {
            r.vy *= 0.6; if(r.y > edge){ r.y = edge; r.vy = Math.min(r.vy, 0); }
            if(Math.abs(r.x - pw.xWait) > 10) return set(pw.xWait, 0);   // sidle to the wait spot first
            const crossFrames = (o.yEnd - o.yStart + 2*RADIUS + 12 + 16) / V_MAX;   // +16: starting from rest
            const tEnd = t + crossFrames/60;
            for(const pl of o.platforms){
              const half = pl.width/2 - 6;
              if(Math.abs(platX(pl, t) - r.x) <= half && Math.abs(platX(pl, tEnd) - r.x) <= half
                 && Math.abs(platX(pl, (t+tEnd)/2) - r.x) <= half){
                pw.plat = pl; pw.committed = true; pw.xCommit = r.x; r.vx = 0;
                return set(pw.xCommit, 1);
              }
            }
            return set(pw.xWait, 0);
          }
        }
      }
      if(hereFalls >= 3 && r.y < o.y1 + 120){
        const lane = safeLaneFor(o, r);
        // five is the ceiling: past that it barely moves until it is through
        return set(lane === null ? TRACK_W/2 : lane, hereFalls >= 5 ? 0.45 : 0.6);
      }
      if(r.aiSafe && r.y < o.y1 + 260){
        const lane = safeLaneFor(o, r);
        return set(lane === null ? TRACK_W/2 : lane, 0.5);
      }
      // A per-hazard breaker alone lets a bot take two falls at each of six
      // hazards and still total twenty. The global guard stays as well.
      if((r.fallCount||0) >= 4 && r.y < o.y1 + 200){
        const lane = safeLaneFor(o, r);
        return set(lane === null ? TRACK_W/2 : lane, 0.55);
      }
    }

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
        // Tile Trap is an arena, not a course. Running the field end to end
        // bunched the whole pack at the far side, where they ate the tiles
        // around them and eleven of twelve drowned inside five seconds. They
        // roam instead: pick a tile that is not counting down, go to it, pick
        // another, and never go near the fence.
        const fence = (typeof arenaEnd === 'number' && arenaEnd) ? arenaEnd : o.yEnd;
        const roamMax = fence - 850, roamMin = o.yStart + 160;
        const g = r.tileGoal;
        // Re-pick well before arriving: a tile arms the moment you touch it and
        // goes 2.2s later, so anything that slows to a stop over its goal dies.
        const spent = !g || !tileFloor(g) || (tileFloor(g).fuse >= 0)
                      || Math.hypot(g.x - r.x, g.y - r.y) < 230;
        if(spent){
          // Pick at random from everything in reach, not the nearest: nearest is
          // always a little ahead, so the whole pack drifted forward in lockstep
          // and then died together at the far end.
          const near = [];
          for(const col of o.columns){
            const f = tileFloor(col);
            if(!f || f.fuse >= 0) continue;
            if(col.y > roamMax || col.y < roamMin) continue;
            const d = Math.hypot(col.x - r.x, col.y - r.y);
            if(d > 120 && d < 950) near.push(col);
          }
          r.tileGoal = near.length ? near[Math.floor(Math.random()*near.length)] : null;
        }
        const goal = r.tileGoal;
        if(!goal) return set(clamp(r.x + rand(-140,140), 40, TRACK_W-40), 0.35);
        // throttle carries the sign, so they will happily walk back down the field
        // never idle: keep at least half throttle in whichever direction
        const drive = (goal.y - r.y)/150;
        const thr = drive >= 0 ? Math.max(0.6, Math.min(1, drive))
                               : Math.min(-0.6, Math.max(-0.9, drive));

        // Look at the floor we are about to step on. Steering straight at a goal
        // is what actually killed them: with sixteen racers arming tiles, about a
        // quarter of the field is missing or counting down at any moment, and a
        // straight line walks into it.
        const step = Math.sign(thr) * 110;
        // Only judge floor that is actually part of the field. Off the end of
        // the grid tileColumnAt returns null, which read as "a hole" -- so bots
        // approaching the field backed away from solid ground and never got on
        // it at all.
        const aheadY = r.y + step;
        const insideAhead = aheadY > o.yStart && aheadY < o.yEnd;
        const front = tileFloor(tileColumnAt(o, r.x, aheadY));
        // Not perfectly, and the quicker bots read it better. 94% works now
        // that a miss costs a storey rather than the round.
        const sees = Math.random() < 0.94 + ((r.speed||1) - 0.98) * 0.4;
        // Unsafe means missing OR already counting down. Checking only for a
        // missing floor meant nothing was ever unsafe -- every column still had
        // three tiers -- so no bot missed anything and none of them descended.
        if(insideAhead && (!front || front.fuse >= 0) && sees){
          let side = null, sideD = 1e9;
          for(const dx of [-o.tileW, o.tileW, -2*o.tileW, 2*o.tileW]){
            const c = tileFloor(tileColumnAt(o, r.x + dx, r.y + step));
            if(c && c.fuse < 0 && Math.abs(dx) < sideD){ sideD = Math.abs(dx); side = r.x + dx; }
          }
          if(side !== null) return set(side, thr * 0.7);
          return set(r.x, -0.6);            // nothing ahead: back off the edge
        }
        return set(goal.x, thr);
      }
    }
    return false;
  }
