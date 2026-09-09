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
    const rest = ()=>{ r.deadT = 0; r.markY = r.y; r.markT = 0; };
    if(r.escapeT > 0){ r.escapeT -= dt; return; }
    if(r.pitWait || r.crumbleWait){ rest(); return; }   // waiting at an edge on purpose
    if(r.falling || r.lavaOut || r.finished
       || r.stumbleT > 0 || r.tumbleT > 0 || r.getUpT > 0){ rest(); return; }
    // Two ways of being stuck. The first is standing still.
    if(Math.abs(r.vy) >= 0.3) r.deadT = 0; else r.deadT = (r.deadT||0) + dt;
    // The second is moving and getting nowhere: a bot wedged between a pillar
    // and the side wall keeps twitching at more than 0.3 a frame, so the speed
    // test reset itself every frame and the escape never fired. With courses
    // authored, that corner is in the same place every run -- one Super Slide
    // bot stood in it for 24 seconds. So also watch net progress over a window.
    // ...but only on a course you run down. On a knockout arena a bot roaming
    // its floor makes no headway up the map on purpose, and treating that as
    // stuck had them escaping every few seconds on Tile Tumble -- which made
    // them survive it, and dropped the round's eliminations below its floor.
    if(currentMap.knockout || arenaMode()){ r.markY = r.y; r.markT = 0; }
    else {
      if(r.markY === undefined){ r.markY = r.y; r.markT = 0; }
      r.markT += dt;
      if(r.y - r.markY > 60){ r.markY = r.y; r.markT = 0; }
    }
    if(r.deadT < 2 && r.markT < 3.5) return;
    r.markY = r.y; r.markT = 0;
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
    // The crawl below is right for a hazard that stays put -- a narrow channel,
    // a moving platform, a hole -- where a slow precise line gets you through.
    // It is exactly wrong for a bridge whose slabs fall a beat after you stand
    // on them: crawling guarantees the slab goes while you are on it, and a
    // bot that fell three times then fell nine more. A crumble's own plan,
    // which crosses at full speed on slabs that are not already counting down,
    // handles repeat failure better than the crawl does.
    const HOLE = (o.type==='narrow' || o.type==='pit' || o.type==='gap');
    if(o.type !== 'pit' && r.pitWait) r.pitWait = null;          // past it, or somewhere else entirely
    if(o.type !== 'crumble' && r.crumbleWait) r.crumbleWait = false;
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
      // On ice this has to start a fall earlier and approach slower. A bot
      // arriving at a narrow channel on Super Slide at speed cannot steer into
      // it -- that is the whole point of the surface -- so waiting until the
      // third fall to slow down means the third fall is guaranteed, and a
      // fourth inside twenty seconds follows. Dry ground keeps the old
      // threshold; there is nothing to fix there.
      const escalateAt = currentMap.slippery ? 2 : 3;
      if(hereFalls >= escalateAt && r.y < o.y1 + (currentMap.slippery ? 320 : 120)){
        const lane = safeLaneFor(o, r);
        // five is the ceiling: past that it barely moves until it is through
        const slow = currentMap.slippery ? (hereFalls >= 4 ? 0.30 : 0.42)
                                         : (hereFalls >= 5 ? 0.45 : 0.6);
        return set(lane === null ? TRACK_W/2 : lane, slow);
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
        // Once the divider has started, the side you are on is the side you
        // have. Aiming at the lane beyond the wall pinned a bot between the
        // wall and a pillar for the whole section -- thirteen seconds still
        // with the throttle wide open.
        if(r.y > o.wallFrom - RADIUS*2){ const side = r.x >= o.cx ? 1 : -1; if(side !== r.aiFork) r.aiFork = side; }
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
        // A slab whose fuse is already lit is worse than one merely touched:
        // it is going, and going soon.
        // Three falls at this bridge and the bot stops taking anything that
        // merely happens to be standing: it will only step on a slab nobody
        // has touched, which is the one kind that cannot go out from under it
        // mid-crossing.
        const burned = (r.holeFalls && r.holeFalls[obsKey(o)]) || 0;
        let best = null, bestD = 1e9;
        for(const sl of o.slabs){
          if(sl.gone) continue;
          if(burned >= 3 && (sl.touched || sl.fuse >= 0)) continue;
          const ahead = sl.y - r.y;
          if(ahead < -40 || ahead > 520) continue;
          const lit = sl.fuse >= 0 ? 460 : (sl.touched ? 120 : 0);
          const d = Math.abs(sl.x - r.x) + lit + ahead*0.25;
          if(d < bestD){ bestD = d; best = sl; }
        }
        // Off the far end, hop: the last row falls like the rest, and walking
        // off it is how a bot ends up under the bridge instead of past it.
        if(r.h <= 0 && r.stumbleT <= 0 && o.yEnd - r.y < 70 && r.y > o.yStart) doJump(r);
        if(best){ r.crumbleWait = false; r.crumbleWaitT = 0; return set(best.x, 1); }
        // Nothing standing ahead. Sixteen racers crossing a twelve-slab bridge
        // drop most of it, and it takes a second and a half to come back --
        // walking in anyway is a fall, a respawn, and the same walk again. A
        // bot short of the bridge waits at the edge for the slabs to return;
        // one already on it makes for whatever is still standing.
        let any = null, ad = 1e9;
        for(const sl of o.slabs){
          if(sl.gone) continue;
          const d = Math.hypot(sl.x - r.x, sl.y - r.y);
          if(d < ad){ ad = d; any = sl; }
        }
        // The wait is bounded. Sixteen racers can keep a bridge stripped for
        // longer than a bot should stand there, and a bot that waits forever
        // is a bot that idles -- which is its own failure, and one the
        // acceptance measures at four seconds.
        if(r.y < o.yStart - 10){
          r.crumbleWaitT = (r.crumbleWaitT || 0) + dt;
          if(r.crumbleWaitT < 2.2){ r.crumbleWait = true; return set(any ? any.x : r.x, 0); }
        }
        r.crumbleWait = false;
        return set(any ? any.x : r.x, 1);
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

      case 'plank': {
        // Pick a plank and stay on it; time the hammer the way the hammer plan
        // does. The pendulum sits inside the bridge's own span, so it is never
        // the "next obstacle" while a bot is on the planks -- if this did not
        // read it, nothing would.
        if(r.aiPlank === undefined || r.aiObsFor !== o){
          r.aiObsFor = o;
          r.aiPlank = o.planks[Math.floor(Math.random()*o.planks.length)].x;
        }
        const px = r.aiPlank;
        const pend = obstacles.find(q=>q.type==='pendulum' && q.y > o.yStart && q.y < o.yEnd);
        if(pend){
          const pp = pendPos(pend, t), gapY = pend.y - r.y;
          // hold short while the ball is over our line, then go
          if(gapY > 30 && gapY < 170 && Math.abs(pp.x - px) < 110) return set(px, 0);
        }
        return set(px, Math.abs(r.x - px) > 40 ? 0.5 : 1);
      }

      case 'discField': {
        // Hop disc to disc. The whole difficulty for a bot is that the ground
        // it is aiming at is not the ground it is standing on, so it commits
        // to one disc and holds that line until it is on it -- an earlier
        // version re-chose every frame, and a bot halfway across a gap picked
        // the disc BEHIND it as nearest, turned back, and oscillated until the
        // clock ran out with none of sixteen home.
        if(r.aiObsFor !== o){ r.aiObsFor = o; r.aiDiscGoal = null; }
        const cur = discCellAt(o, r.x, r.y);
        if(cur){
          let g = null, gd = 1e9;
          for(const c of o.cells){
            if(c.row !== cur.row + 1) continue;
            const d = Math.abs(c.x - r.x);
            if(d < gd){ gd = d; g = c; }
          }
          r.aiDiscGoal = g;
          // the arm sweeping onto us is jumped, the same read the player makes
          if(r.h <= 0 && r.stumbleT <= 0 && discArmNear(cur, r.x, r.y, t, 0.34)) doJump(r);
          if(!g){
            // last row: hop off its trailing edge rather than stepping over it
            const halfL = Math.sqrt(Math.max(0, cur.r*cur.r - (r.x-cur.x)*(r.x-cur.x)));
            if(r.h <= 0 && (cur.y + halfL) - r.y < 26) doJump(r);
            return set(r.x, 1);
          }
          // Line up on the deck when the next disc is within this deck's
          // reach -- true on a grid, false on a zigzag, where walking all the
          // way toward the next disc walks off the edge of this one.
          if(Math.abs(g.x - cur.x) < cur.r*0.80){
            if(Math.abs(g.x - r.x) > 26) return set(g.x, 0.15);
          } else {
            // Zigzag: cross to the rim of THIS disc on the side the next one
            // is, so the hop starts as near to it as the deck allows and with
            // sideways speed already built. Aiming straight at the far disc
            // from wherever you stand asks the hop to cover ground a bean
            // cannot cover in the air.
            const launch = cur.x + Math.sign(g.x - cur.x)*cur.r*0.62;
            if(r.h <= 0 && Math.abs(r.x - launch) > 16) return set(launch, 0.55);
          }
          // Hop when the rim is close along the line we are actually
          // travelling, rather than straight up the course.
          const gx = g.x - r.x, gy = g.y - r.y, gdist = Math.hypot(gx,gy) || 1;
          const ux = gx/gdist, uy = gy/gdist;
          const px = r.x - cur.x, py = r.y - cur.y;
          const bq = px*ux + py*uy, cq = px*px + py*py - cur.r*cur.r;
          const toEdge = -bq + Math.sqrt(Math.max(0, bq*bq - cq));
          if(r.h <= 0 && toEdge < 30) doJump(r);
          return set(g.x, 1);
        }
        // In the air over a gap: hold the line to the disc we committed to.
        if(r.aiDiscGoal) return set(r.aiDiscGoal.x, 1);
        // No commitment at all -- came in off the side. Take the nearest disc
        // that is still ahead; never one behind, or we walk back into the gap.
        let n = null, nd = 1e9;
        for(const c of o.cells){
          if(c.y < r.y - 20) continue;
          const d = Math.hypot(c.x-r.x, c.y-r.y);
          if(d < nd){ nd = d; n = c; }
        }
        return n ? set(n.x, 1) : set(r.x, 1);
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
