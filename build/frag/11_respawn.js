  function respawnAfterFall(r){
    if(currentMap.knockout){
      // no second chances in a survival round -- how far you got is your rank
      r.falling=false; r.lavaOut=true; r.lavaCatchY=r.y;
      spawnBurst3D(r.x, r.y, 0xff5a4d, 14);
      if(r.isPlayer){ SFX.fall(); camShake=5; }
      return;
    }
    r.falling=false; r.h=0; r.vh=0;
    // respawn just before the hazard we fell into
    let ry=r.y-260, rx=r.x, hitObs=null;
    for(const o of obstacles){
      if((o.type==='pit'||o.type==='narrow'||o.type==='mover'||o.type==='crumble'||o.type==='gap'||o.type==='discField'||o.type==='plank') && r.y>=o.yStart-5 && r.y<=o.yEnd+5){
        ry=o.yStart-90; hitObs=o;
        // Put them back on the line that works, not on the one that just killed
        // them. Respawning at the same x is how a racer collects eleven falls
        // at a single narrow.
        if(o.type==='narrow') rx = TRACK_W/2 + (o.offset||0);
        else if(o.type==='gap') rx = (r.x < o.cx ? o.cx - o.halfWidth - 55 : o.cx + o.halfWidth + 55);
        // back onto the lane of discs nearest the one they came off, not the
        // middle of the track: the middle can be a gap
        else if(o.type==='plank'){
          let best=null, bd=1e9;
          for(const pl of o.planks){ const d=Math.abs(pl.x-r.x); if(d<bd){ bd=d; best=pl; } }
          if(best) rx = best.x;
        }
        else if(o.type==='discField'){
          let best=null, bd=1e9;
          for(const c of o.cells){ if(c.row!==0) continue; const d=Math.abs(c.x-r.x); if(d<bd){ bd=d; best=c; } }
          if(best) rx = best.x;
        }
        else if(o.type==='pit' && o.platforms && o.platforms.length){
          let best = null, bestD = 1e9;
          for(const pl of o.platforms){
            const px = platX(pl, raceTime), d = Math.abs(px - r.x);
            if(d < bestD){ bestD = d; best = px; }
          }
          if(best !== null) rx = best;
        } else if(o.type==='crumble' && o.slabs){
          let best = null, bestD = 1e9;
          for(const sl of o.slabs){
            if(sl.gone) continue;
            const d = Math.abs(sl.x - r.x);
            if(d < bestD){ bestD = d; best = sl.x; }
          }
          if(best !== null) rx = best;
        }
      }
    }
    const field=obstacles.find(o=>o.type==='tilefield' && r.y>=o.yStart-5 && r.y<=o.yEnd+5);
    if(field){
      // drop back onto the nearest surviving tile behind us, else in front of the field
      const myRow=clamp(Math.floor((r.y-field.yStart)/field.rowDepth), 0, field.rows-1);
      let placed=false;
      for(let row=myRow; row>=0 && !placed; row--){
        const live=[];
        for(let c=0;c<field.cols;c++){ const tl=field.tiles[row*field.cols+c]; if(tl && !tl.gone) live.push(tl); }
        if(live.length){
          // nearest surviving tile in that row
          let best=live[0];
          for(const tl of live) if(Math.abs(tl.x-r.x)<Math.abs(best.x-r.x)) best=tl;
          rx=best.x; ry=best.y;
          best.touched=false; best.fuse=-1; best.gone=false;
          r.tileGraceUntil = raceTime + 1.1;     // a moment to get your bearings
          placed=true;
        }
      }
      if(!placed) ry=field.yStart-90;
    }
    const hex=obstacles.find(o=>o.type==='hexfield' && r.y>=o.yStart-5 && r.y<=o.yEnd+5);
    if(hex){
      // put them back on the nearest column that still has a surviving tier
      let best=null, bestD=1e9;
      for(const col of hex.columns){
        if(col.y > r.y+40) continue;                 // never respawn someone ahead of where they fell
        const floor=col.tiers.find(c=>!c.gone);
        if(!floor) continue;
        const d=Math.hypot(col.x-r.x, col.y-r.y);
        if(d<bestD){ bestD=d; best=col; }
      }
      if(best){
        const floor=best.tiers.find(c=>!c.gone);
        rx=best.x; ry=best.y;
        floor.touched=false; floor.fuse=-1;
        r.floorH=floor.hy;
        r.tileGraceUntil = raceTime + 1.5;
      } else { ry=hex.yStart-90; r.floorH=0; }
    }
    // A full section back, not ninety units. Landing on the lip of the hazard
    // that just took you means arriving at it from a standstill with no run-up
    // and no read on its timing, which is how a player collects twenty-five
    // falls at one hole. Whichever is further back: the start of the previous
    // section, or 400 units.
    if(hitObs){
      // One section, measured from the hazard's own section -- not from ry,
      // which has already been pulled back to the hazard's lip and therefore
      // usually sits in the previous section, so asking what came before *it*
      // sent racers back two. That cost about five seconds a fall on Super
      // Slide and left three bots short of the line inside the round.
      const prev = sectionStartBefore(hitObs.yStart);
      const back = Math.min(ry - 400, prev === null ? Infinity : prev);
      if(isFinite(back)) ry = Math.max(-20, Math.min(ry, back));
    }
    r.y=Math.max(-20, ry); r.x=clamp(rx, 60, TRACK_W-60); r.vx=0; r.vy=0.5;
    r.stumbleT=250; r.invuln=1400; r.aiObs=null; r.aiPlat=null;
    // A bot put back where it started will make the same choice again and fall
    // in the same place. Reroll the lane it fancies; and once it has failed
    // here twice, stop letting it pick -- send it down the middle of whatever
    // it is trying to cross, which is the line that works.
    if(!r.isPlayer){
      r.aiRoute = Math.random();
      const burned = (hitObs && r.holeFalls && r.holeFalls[obsKey(hitObs)]) || 0;
      if(burned >= 2) r.aiRoute = 0.5;
    }
    // A beat on your feet before you have to do anything with them. The
    // invulnerability above covers it and a little more.
    r.respawnFreeze = RESPAWN_FREEZE_S;
  }
