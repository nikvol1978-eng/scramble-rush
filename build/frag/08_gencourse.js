  function genCourse(n){
    const cx=TRACK_W/2;
    const hard = n>=2;
    const spd  = n===1?1.0 : n===2?1.22 : 1.42;
    // A map whose whole mechanic is losing ground needs less ground to lose.
    const total = Math.round((n===1?7000 : n===2?6000 : 5200) * (currentMap.lenScale||1));
    const mode = currentMap.isMinigame ? currentMap.mode : null;
    // A clear run-in. At 380, with gaps down to 60, Super Slide opened with a
    // crumbling bridge at y=560: anyone walking straight was stopped dead and
    // the camera clipped into the void wall behind them.
    const obs=[]; let cursor=640; let last='';
    const LANES=[-200,-100,0,100,200];

    // ---- TILE TRAP: a crumbling floor that rebuilds behind you ----
    if(mode==='tiles'){
      // the courses are long now; cap the tile grid or the mesh count runs away
      // Three floors, Hex-A-Gone style. Dropping through one lands you on the
      // next; only the bottom one puts you out. A single layer made every miss
      // fatal, and with sixteen racers arming tiles a quarter of the grid was
      // compromised at any moment, so the whole field drowned.
      // 6500 deep in v19. Racers are 12% slower in v20, so the same field was
      // 12% quieter -- tiles got armed less often, nobody fell, and the round
      // ran to the clock with two out. Trimmed by the same 12%.
      const yStart=420, yEnd=yStart+5700;
      const cols=8, rowDepth=118;
      const rows=Math.max(6, Math.floor((yEnd-yStart)/rowDepth));
      const tileW=TRACK_W/cols;
      const LAYER_H = [0, -90, -180];
      const tiles=[], columns=[];
      for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
        const col = {r, c, x:c*tileW+tileW/2, y:yStart+r*rowDepth+rowDepth/2, w:tileW, d:rowDepth, tiers:[]};
        for(let L=0; L<3; L++){
          // A sixth of the top floor is missing from the start (was 4%). The
          // slower v20 pace made the field a stalemate -- nobody armed enough
          // tiles to bring anyone down -- and the fuse and respawn dials flip
          // it straight from stalemate to collapse. Starting holes give a
          // steady trickle of drops instead: measured at 10%, 16% and 22%,
          // three or four out by the clock in eight rounds of nine.
          const preGone = L===0 && r>2 && Math.random() < (hard?0.20:0.16);
          const t = {r, c, layer:L, hy:LAYER_H[L], x:col.x, y:col.y, w:tileW, d:rowDepth,
                     touched:preGone, fuse:preGone?0:-1, gone:preGone, drop:preGone?1:0, back:preGone?2.0:0};
          col.tiers.push(t); tiles.push(t);
        }
        columns.push(col);
      }
      // Tiles go fast but come back, so the floor never runs out entirely.
      obs.push({type:'tilefield', yStart, yEnd, y0:yStart, y1:yEnd, cols, rows, tileW, rowDepth,
                tiles, columns,
                // shorter fuse the further you fall, and the bottom never returns
                fuseByLayer: hard ? [1.4,1.15,0.9] : [1.6,1.3,1.0],
                // the upper floors come back quickly, so a drop is a setback
                // rather than the first step of a cascade to the bottom
                // Quick enough that the field never collapses: four racers going
                // out has to take most of a minute, not fifteen seconds.
                fuseTime: 1.6, respawnTime: hard?0.75:0.6});
      // survival: fence them into the field, and put the line out of reach.
      // A row and a half back from the last tiles, so the fence is never a ledge.
      arenaEnd = yEnd-rowDepth*1.5; trackLength = yEnd+4000;
      return obs;
    }

    //<<shelved:gencourse-collect>>
    // ---- CLOSING CIRCLE: the floor is a disc, and it never stops shrinking ----
    if(mode==='shrink'){
      // Centred over the start line: everyone spawns at y=-60, so an arena
      // further up the course would eliminate the entire field on tick one.
      const yMid = 640, r0 = 940;
      obs.push({type:'ring', cx, y:yMid, y0:yMid-r0-200, y1:yMid+r0+200,
                // rMin has to be smaller than the area the *target* survivor
                // count needs, not just smaller than sixteen. At r=62 thirteen
                // racers still fitted and the round stalled above its own cut.
                r:r0, r0, rMin:34, shrink: hard? 30 : 26, wait: 2.5});
      arenaEnd = yMid + r0 - 40; trackLength = yMid + r0 + 4000;
      return obs;
    }

    //<<shelved:gencourse-spin-hex-laser-tracer-blockdash>>
    // ---- DOOR DASH: rows of doors, half of them paper ----
    if(mode==='doors'){
      const span=Math.min(total, 9000);
      let z=460;
      while(z < span-420){
        // 5 doors with a passable majority: a pack of sixteen jams solid on 4-with-2
        const count = 5;
        const doorW = TRACK_W/count - 14;
        const items=[];
        const fakeIdx = new Set();
        const fakes = hard?2:3;
        while(fakeIdx.size<fakes) fakeIdx.add(Math.floor(Math.random()*count));
        for(let i=0;i<count;i++){
          items.push({x: i*(TRACK_W/count) + (TRACK_W/count)/2, w:doorW, fake:fakeIdx.has(i), broken:false});
        }
        obs.push({type:'doors', y:z, d:26, y0:z-26/2-RADIUS, y1:z+26/2+RADIUS, items});
        z += rand(360,470);
      }
      obs.push({type:'spinbar', y:span-260, cx, length:520, speed:1.2*spd, phase:0, thickness:34,
                y0:span-260-280, y1:span-260+280});
      trackLength = span+200;
      obs.sort((a,b)=>a.y0-b.y0);
      return obs;
    }

    //<<shelved:gencourse-boulder>>
    // ---- NORMAL COURSE — each map draws from its own obstacle set ----
    // One hazard is reserved before anything else is placed: a hole down the
    // middle with both sides open. Hunting for a slot afterwards either found
    // none (and a hold-forward player walked the map) or dropped it on top of a
    // gate (and the field collected fifty falls).
    // Only where the course does not already punish a straight line by itself.
    const wantGap = currentMap.forcedGap !== false;
    const gapY = Math.round(total*0.42), gapLen = 280, gapPad = 170;
    if(wantGap)
      obs.push({type:'gap', yStart:gapY, yEnd:gapY+gapLen, y0:gapY, y1:gapY+gapLen, cx,
                halfWidth: (hard? rand(112,132): rand(104,126)) * (currentMap.slippery ? 0.72 : 1)});

    const types = (currentMap.obstacles && currentMap.obstacles.length)
      ? currentMap.obstacles
      : ['pillars','hammer','spinbar','pit','narrow','pusher'];
    while(cursor < total-450){
      // step over the reserved band rather than building into it
      if(wantGap && cursor > gapY-gapPad-240 && cursor < gapY+gapLen+gapPad) cursor = gapY+gapLen+gapPad;
      let type, guard=0;
      do{ type=pick(types); guard++; }while(guard<20 && (type===last || (type==='narrow'&&last==='pit') || (type==='pit'&&last==='narrow')));
      last=type;
      const gap = rand(60,120);
      const placedFrom = obs.length, cursorWas = cursor;
      if(type==='pillars'){
        const count = hard? 3+Math.floor(rand(0,2)) : 2+Math.floor(rand(0,2));
        const lanes=[...LANES].sort(()=>Math.random()-0.5).slice(0,count);
        const y = cursor+gap+60;
        obs.push({type, y, y0:y-70, y1:y+70, items:lanes.map(l=>({x:cx+l+rand(-18,18), r:rand(32,42)}))});
        cursor = y+70;
      } else if(type==='hammer'){
        const count = hard? (Math.random()<0.5?4:3) : 3;
        const y = cursor+gap+80, band=130;
        const items=[]; const span=620;
        for(let i=0;i<count;i++){
          const px = cx + (i-(count-1)/2)*(span/(count-1));
          items.push({pivotX:px, armLen: count===4? rand(140,165): rand(160,200), speed:rand(1.3,1.9)*spd, phase:rand(0,6.28)});
        }
        obs.push({type,y,band,y0:y-band/2-RADIUS, y1:y+band/2+RADIUS, items});
        cursor = y+band/2+40;
      } else if(type==='spinbar'){
        const length = rand(450,580);
        const y = cursor+gap+length/2+20;
        obs.push({type,y,cx,length,speed:rand(1.1,1.7)*spd*(Math.random()<0.5?-1:1), phase:rand(0,6.28), thickness:34, y0:y-length/2-20, y1:y+length/2+20});
        cursor = y+length/2+20;
      } else if(type==='pit'){
        const len = rand(220,300);
        const yStart = cursor+gap+80, yEnd=yStart+len;
        const count = hard? 2 : (Math.random()<0.5?2:3);
        const width = (hard? rand(85,105): rand(100,125));
        const platforms=[];
        for(let i=0;i<count;i++){
          const base = cx + (i-(count-1)/2)*(count===2?220:230);
          platforms.push({baseX:base, amp:rand(100,160), speed:rand(0.8,1.3)*spd, phase:rand(0,6.28), width});
        }
        obs.push({type,yStart,yEnd,y0:yStart,y1:yEnd,platforms});
        cursor = yEnd+40;
      } else if(type==='narrow'){
        const len=rand(320,460);
        const yStart=cursor+gap+60, yEnd=yStart+len;
        const icy = currentMap.slippery ? 1.4 : 1;
        obs.push({type,yStart,yEnd,y0:yStart,y1:yEnd,
                  halfWidth: (hard? rand(52,66): rand(60,78))*icy,
                  offset: rand(-70,70)*(currentMap.slippery?0.6:1)});
        cursor=yEnd+30;
      } else if(type==='pusher'){
        const y=cursor+gap+70, d=44;
        const count = hard?3:2;
        const items=[];
        for(let i=0;i<count;i++){
          const base = cx + (i-(count-1)/2)*(count===2?180:210);
          items.push({baseX:base, amp:rand(120,200), speed:rand(1.2,1.9)*spd, phase:rand(0,6.28), width:rand(120,160), d});
        }
        obs.push({type,y,d,y0:y-d/2-RADIUS, y1:y+d/2+RADIUS, items});
        cursor=y+d/2+40;
      } else if(type==='ramp'){
        // run up, launch off the lip
        const len=rand(200,300), yStart=cursor+gap+60, yEnd=yStart+len;
        obs.push({type:'ramp', yStart, yEnd, y0:yStart, y1:yEnd+90,
                  height: rand(30,52), width: rand(240,400), cx: cx+rand(-140,140)});
        cursor=yEnd+150;
      } else if(type==='fork'){
        // The track splits and a wall makes you commit. One side is a raised
        // catwalk that spits you out at speed; the other is flat and safe, but
        // there is furniture in the way.
        const len = rand(640, 820);
        const yStart = cursor+gap+110, yEnd = yStart+len;
        const risk = Math.random()<0.5 ? -1 : 1;
        obs.push({type:'fork', y:(yStart+yEnd)/2, yStart, yEnd, y0:yStart-40, y1:yEnd+40,
                  cx, risk, wallFrom: yStart+130});
        obs.push({type:'shortcut', yStart, yEnd:yEnd-40, y0:yStart-40, y1:yEnd+120,
                  cx: cx + risk*(TRACK_W/4), w: rand(112,132),
                  h:46, rampLen:170, boost: rand(6.4,7.4)});
        for(let i=0;i<3;i++){
          const py = yStart + len*(0.30+i*0.22);
          obs.push({type:'pillars', y:py, y0:py-70, y1:py+70,
                    items:[{x: cx - risk*(TRACK_W/4) + rand(-80,80), r:rand(32,42)}]});
        }
        cursor = yEnd+160;
      } else if(type==='gate'){
        // A wall with two doors in it. Sixteen racers, two doors: the jam is
        // the obstacle.
        const y = cursor+gap+100;
        const gapW = hard? 72 : 86;
        const spread = rand(170,220);
        const xs = [cx - spread/2 + rand(-24,24), cx + spread/2 + rand(-24,24)];
        obs.push({type:'gate', y, y0:y-90, y1:y+90, d:34, gapW, xs, h:62});
        cursor = y+150;
      //<<shelved:gencourse-mover>>
      } else if(type==='crumble'){
        // A bridge of slabs over a drop. Each one falls a moment after you put
        // your weight on it, then rebuilds -- so the bridge is never gone for good.
        const cols = 4, rows = 3;
        const len = rand(360,440);
        const yStart = cursor+gap+100, yEnd = yStart+len;
        const slabW = 108, rowD = len/rows;
        const slabs = [];
        for(let ri=0; ri<rows; ri++) for(let ci=0; ci<cols; ci++){
          slabs.push({ x: cx + (ci-1.5)*(slabW+14), y: yStart + ri*rowD + rowD/2,
                       w: slabW, d: rowD-18, touched:false, fuse:-1, gone:false, drop:0, back:0 });
        }
        obs.push({type:'crumble', y:(yStart+yEnd)/2, yStart, yEnd, y0:yStart-30, y1:yEnd+30,
                  slabs, h: 26, fuseTime: hard?1.1:1.4, respawnTime: hard?1.8:1.4});
        cursor = yEnd+150;
      //<<shelved:gencourse-log-roller>>
      } else if(type==='shortcut'){
        // A narrow raised lane hugging one wall. Ramp on, and it runs you past
        // whatever is happening on the floor -- but it is barely wider than you.
        const side = Math.random()<0.5 ? -1 : 1;
        const len = rand(620, 900);
        const yStart = cursor+gap+60, yEnd = yStart+len;
        obs.push({type:'shortcut', yStart, yEnd, y0:yStart-40, y1:yEnd+140,
                  cx: cx + side*(TRACK_W/2 - 96), w: rand(112,140),
                  h: 46, rampLen: 170, boost: rand(6.2,7.2)});
        // something worth skipping, on the floor beside it
        const midY = (yStart+yEnd)/2;
        obs.push({type:'pusher', y:midY, d:44, y0:midY-44/2-RADIUS, y1:midY+44/2+RADIUS,
                  items:[{baseX:cx-side*40, amp:rand(150,230), speed:rand(1.2,1.9)*spd,
                          phase:rand(0,6.28), width:rand(150,200), d:44}]});
        cursor = yEnd+170;
      } else if(type==='cannon'){
        // cannons in the side walls, firing across the lane on a fixed beat
        const count = hard?2:1;
        const y = cursor+gap+110;
        const items=[];
        for(let i=0;i<count;i++){
          items.push({ y: y+i*170, side: Math.random()<0.5?-1:1, r: rand(26,34),
                       interval: rand(1.5,2.4)/spd, cool: rand(0,1.6),
                       speed: rand(430,600)*spd });
        }
        obs.push({type:'cannon', y, items, y0:y-140, y1:y+count*170+140});
        cursor = y + count*170 + 130;
      } else if(type==='pendulum'){
        // a wrecking ball on a long arm, sweeping the full width and low in the middle
        const y = cursor+gap+130;
        const pArm = rand(150,205), pR = rand(27,37);
        // The pivot has to clear the arm, or the ball buries itself in the floor at
        // the bottom of the swing. A fixed pivotH of 168 with arms up to 205 sank
        // the ball as much as 50 units under the ground.
        obs.push({type:'pendulum', y, cx, armLen: pArm, r: pR,
                  pivotH: pArm + pR + 4, swing: rand(0.78,1.02),
                  speed: rand(1.0,1.5)*spd, phase: rand(0,6.28),
                  y0:y-120, y1:y+120});
        cursor = y+150;
      } else if(type==='bumper'){
        // pinball posts: they never kill you, they just fling you somewhere else
        const count = hard?3:2;
        const lanes=[...LANES].sort(()=>Math.random()-0.5).slice(0,count);
        const y = cursor+gap+90;
        obs.push({type:'bumper', y, y0:y-100, y1:y+100,
                  items:lanes.map(l=>({x:cx+l+rand(-24,24), r:rand(30,40), hit:0}))});
        cursor = y+100;
      } else if(type==='boost'){
        const y = cursor+gap+80;
        obs.push({type:'boost', y, cx: cx+rand(-190,190), w: rand(140,210),
                  len: rand(120,180), power: rand(5.2,7.4),
                  y0:y-110, y1:y+110});
        cursor = y+170;
      //<<shelved:gencourse-spinlaser>>
      } else if(type==='beam'){
        const y=cursor+gap+70;
        const low=Math.random()<0.6;
        obs.push({type:'laserbar', y, low, h: low?12:32,
                  speed: rand(0.8,1.5)*spd*(Math.random()<0.5?-1:1),
                  // The window has to cover the whole sweep. At y+-40 the beam
                  // travelled 300 units outside its own hitbox, so it swept
                  // straight through you without touching.
                  phase: rand(0,6.28), span: rand(180,300), y0:y-360, y1:y+360});
        cursor=y+90;
      }
      // The reserved band was only checked against the cursor, and a fork or a
      // shortcut runs 800 units past it. One Sunny layout in four laid a fork
      // straight across the hole, and the bots taking the fork's lanes walked
      // into it over and over: 125 falls in one round. Anything that reaches
      // into the band is taken back and the cursor stepped past it instead.
      if(wantGap){
        let reaches = false;
        for(let i=placedFrom;i<obs.length;i++){
          const o = obs[i];
          if(o.y1 > gapY-gapPad && o.y0 < gapY+gapLen+gapPad) reaches = true;
        }
        if(reaches){ obs.length = placedFrom; cursor = Math.max(cursorWas, gapY+gapLen+gapPad); last = null; }
      }
    }
    // Every race course needs at least two places you can actually fall off.
    // Left to the random draw, a course could come out with none, and then
    // holding forward is a guaranteed finish.
    trackLength = cursor+300;
    obs.sort((a,b)=>a.y0-b.y0);
    return obs;
  }
