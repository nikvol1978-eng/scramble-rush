  function genCourse(n){
    const cx=TRACK_W/2;
    const hard = n>=2;
    const spd  = n===1?1.0 : n===2?1.22 : 1.42;
    // A map whose whole mechanic is losing ground needs less ground to lose.
    const total = Math.round((n===1?7000 : n===2?6000 : 5200) * (currentMap.lenScale||1));
    const mode = currentMap.isMinigame ? currentMap.mode : null;
    const obs=[]; let cursor=380; let last='';
    const LANES=[-200,-100,0,100,200];

    // ---- TILE TRAP: a crumbling floor that rebuilds behind you ----
    if(mode==='tiles'){
      // the courses are long now; cap the tile grid or the mesh count runs away
      const yStart=420, yEnd=yStart+6500;
      const cols=8, rowDepth=118;
      const rows=Math.max(6, Math.floor((yEnd-yStart)/rowDepth));
      const tileW=TRACK_W/cols;
      const tiles=[];
      for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
        const preGone = r>2 && Math.random() < (hard?0.07:0.04);
        tiles.push({r,c, x:c*tileW+tileW/2, y:yStart+r*rowDepth+rowDepth/2, w:tileW, d:rowDepth,
                    touched:preGone, fuse:preGone?0:-1, gone:preGone, drop:preGone?1:0, back:preGone?2.0:0});
      }
      // Tiles go fast but come back, so the floor never runs out entirely.
      obs.push({type:'tilefield', yStart, yEnd, y0:yStart, y1:yEnd, cols, rows, tileW, rowDepth, tiles,
                fuseTime: hard?1.9:2.2, respawnTime: hard?4.2:3.6});
      // survival: fence them into the field, and put the line out of reach
      arenaEnd = yEnd-60; trackLength = yEnd+4000;
      return obs;
    }

    // ---- GEM GRAB: not a race. Three gems and you are through. ----
    if(mode==='collect'){
      const yStart = 260, yEnd = 3100;
      const items = [];
      const count = 46;
      for(let i=0;i<count;i++){
        items.push({ x: rand(70, TRACK_W-70), y: rand(yStart, yEnd), taken:false, spin: rand(0,6.28) });
      }
      obs.push({type:'gems', y:(yStart+yEnd)/2, y0:yStart-200, y1:yEnd+200, items, need:3});
      // a bit of trouble to make the picking-up interesting
      for(let z=yStart+300; z<yEnd-200; z+=rand(520,720)){
        obs.push({type:'roller', y:z, y0:z-46-RADIUS, y1:z+46+RADIUS, r:38,
                  amp: rand(200,300), speed: rand(0.9,1.4)*spd, phase: rand(0,6.28), cx});
      }
      arenaEnd = yEnd+180; trackLength = yEnd+4200;
      obs.sort((a,b)=>a.y0-b.y0);
      return obs;
    }

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

    // ---- CAROUSEL: one turning disc, and arms sweeping you toward the edge ----
    if(mode==='spin'){
      const yMid = 560, rad = 840;
      obs.push({type:'disc', cx, y:yMid, y0:yMid-rad-200, y1:yMid+rad-0+200,
                r:rad, speed: (hard?0.42:0.32)*(Math.random()<0.5?-1:1)});
      obs.push({type:'spinlaser', y:yMid, cx, arms: 3, len: rad*0.92,
                speed: rand(0.30,0.46)*(Math.random()<0.5?-1:1), phase: rand(0,6.28),
                h:16, y0:yMid-rad-100, y1:yMid+rad+100});
      arenaEnd = yMid + rad - 40; trackLength = yMid + rad + 4000;
      return obs;
    }

    // ---- HEX DROP: four tiers of hexagons, each drops shortly after you touch it ----
    if(mode==='hex'){
      // A shorter field on purpose: every hex is two meshes, and the whole point
      // is the drop, not the distance.
      const yStart=420, yEnd=yStart+3300;
      const hexR=76, colW=hexR*1.5, rowH=hexR*Math.sqrt(3);
      const cols=Math.max(3, Math.floor(TRACK_W/colW)-1);
      const rows=Math.max(6, Math.floor((yEnd-yStart)/rowH));
      const TIERS=[0,-42,-84,-126];
      const cells=[], columns=[];
      for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
        const x = colW*0.9 + c*colW;
        const y = yStart + r*rowH + (c%2?rowH/2:0);
        if(x<hexR || x>TRACK_W-hexR || y>yEnd) continue;
        const tiers=[];
        for(let ti=0; ti<TIERS.length; ti++){
          const missing = ti>0 && Math.random() < 0.09*ti;
          const cell={x, y, r:hexR, tier:ti, hy:TIERS[ti],
                      touched:false, fuse:-1, gone:missing, drop:missing?1:0, back:missing?3:0};
          tiers.push(cell); cells.push(cell);
        }
        columns.push({x, y, r:hexR, tiers});
      }
      // tiers rebuild, or a crowded field would strand everyone before the line
      obs.push({type:'hexfield', yStart, yEnd, y0:yStart, y1:yEnd, cells, columns, tiers:TIERS,
                fuseTime: hard?1.0:1.3, respawnTime: 4.0});
      arenaEnd = yEnd-60; trackLength = yEnd+4000;
      return obs;
    }

    // ---- LASER DODGE: sweeping beams, low ones you jump, high ones you dive under ----
    if(mode==='laser'){
      let z=560;
      const rowsOut=[];
      while(z < total-360){
        const low = Math.random()<0.55;
        rowsOut.push({type:'laserbar', y:z, low,
          h: low ? 12 : 32,                       // low = jump it, high = dive under it
          speed: rand(0.8,1.5)*spd*(Math.random()<0.5?-1:1),
          phase: rand(0,6.28), span: rand(180,300),
          y0:z-360, y1:z+360});
        z += rand(210,300);
      }
      obs.push(...rowsOut);
      // a couple of pillars so it is not a pure straight line
      for(let i=0;i<3;i++){
        const y=700+i*((total-1000)/3);
        obs.push({type:'pillars', y, y0:y-70, y1:y+70,
          items:[{x:cx+rand(-260,260), r:rand(30,40)}]});
      }
      trackLength = total+200;
      obs.sort((a,b)=>a.y0-b.y0);
      return obs;
    }

    // ---- LASER TRACER: hubs of rotating arms, low enough to jump ----
    if(mode==='tracer'){
      const span=Math.min(total, 6400);
      let z=640;
      while(z < span-420){
        obs.push({type:'spinlaser', y:z, cx, arms: hard?4:3, len: rand(300,380),
                  speed: rand(0.45,0.85)*spd*(Math.random()<0.5?-1:1), phase: rand(0,6.28),
                  h:14, y0:z-400, y1:z+400});
        z += rand(430,540);
      }
      // a few bumpers so there is something to be knocked into
      for(let i=0;i<4;i++){
        const y=760+i*((span-1200)/4);
        obs.push({type:'bumper', y, y0:y-90, y1:y+90,
                  items:[{x:cx+rand(-250,250), r:34}]});
      }
      trackLength = span+200;
      obs.sort((a,b)=>a.y0-b.y0);
      return obs;
    }

    // ---- BLOCK DASH: sliding walls of blocks, one gap each ----
    if(mode==='blockdash'){
      const span=Math.min(total, 7400);
      let z=520;
      while(z < span-420){
        const slots=6, slotW=TRACK_W/slots;
        const gap=Math.floor(Math.random()*slots);
        const gap2=hard?-1:((gap+2+Math.floor(Math.random()*2))%slots);
        const items=[];
        for(let i=0;i<slots;i++){
          if(i===gap||i===gap2) continue;
          items.push({x:i*slotW+slotW/2, w:slotW-8});
        }
        obs.push({type:'blockwall', y:z, d:54, y0:z-54/2-RADIUS, y1:z+54/2+RADIUS, items,
                  amp: rand(60,150), speed: rand(0.5,0.95)*spd, phase: rand(0,6.28)});
        z += rand(340,460);
      }
      trackLength = span+200;
      obs.sort((a,b)=>a.y0-b.y0);
      return obs;
    }

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

    // ---- BOULDER BARRAGE: mostly open, boulders roll at you from ahead ----
    if(mode==='boulder'){
      let z=520;
      while(z < total-500){
        if(Math.random()<0.55){
          const lanes=[...LANES].sort(()=>Math.random()-0.5).slice(0,2);
          obs.push({type:'pillars', y:z, y0:z-70, y1:z+70, items:lanes.map(l=>({x:cx+l+rand(-18,18), r:rand(30,40)}))});
        } else {
          const len=rand(300,420);
          obs.push({type:'narrow', yStart:z, yEnd:z+len, y0:z, y1:z+len, halfWidth: hard? rand(100,130): rand(120,155)});
          z += len;
        }
        z += rand(420,560);
      }
      trackLength = total+200;
      obs.sort((a,b)=>a.y0-b.y0);
      return obs;
    }

    // ---- NORMAL COURSE — each map draws from its own obstacle set ----
    const types = (currentMap.obstacles && currentMap.obstacles.length)
      ? currentMap.obstacles
      : ['pillars','hammer','spinbar','pit','narrow','pusher'];
    while(cursor < total-450){
      let type, guard=0;
      do{ type=pick(types); guard++; }while(guard<20 && (type===last || (type==='narrow'&&last==='pit') || (type==='pit'&&last==='narrow')));
      last=type;
      const gap = rand(60,120);
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
      } else if(type==='mover'){
        // A gap with no floor, crossed by a platform sliding side to side. You
        // have to time getting on, and it carries you while you stand on it.
        const len = rand(300,400);
        const yStart = cursor+gap+100, yEnd = yStart+len;
        obs.push({type:'mover', y:(yStart+yEnd)/2, yStart, yEnd, y0:yStart-30, y1:yEnd+30,
                  cx, amp: rand(170,250), speed: rand(0.55,0.9)*spd, phase: rand(0,6.28),
                  w: rand(180,230), d: len-30, h: 30, dx:0, _px:null});
        cursor = yEnd+150;
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
      } else if(type==='log'){
        // A whole tree trunk on ropes, sweeping across the track at chest height.
        const y = cursor+gap+140;
        const arm = rand(150,190), lr = rand(30,40);
        obs.push({type:'log', y, cx, armLen: arm, r: lr, len: rand(240,320),
                  pivotH: arm + lr + 26, swing: rand(0.80,1.05),
                  speed: rand(0.9,1.35)*spd, phase: rand(0,6.28),
                  y0:y-200, y1:y+200});
        cursor = y+190;
      } else if(type==='roller'){
        // a barrel rolling across the track
        const y=cursor+gap+70;
        obs.push({type:'roller', y, y0:y-46-RADIUS, y1:y+46+RADIUS, r:38,
                  amp: rand(180,300), speed: rand(0.9,1.5)*spd, phase: rand(0,6.28), cx});
        cursor=y+90;
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
      } else if(type==='spinlaser'){
        const y = cursor+gap+320;
        obs.push({type:'spinlaser', y, cx, arms: hard?4:3, len: rand(280,360),
                  speed: rand(0.45,0.85)*spd*(Math.random()<0.5?-1:1), phase: rand(0,6.28),
                  h:14, y0:y-380, y1:y+380});
        cursor = y+400;
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
    }
    // Every race course needs at least two places you can actually fall off.
    // Left to the random draw, a course could come out with none, and then
    // holding forward is a guaranteed finish.
    const holes = obs.filter(o=>o.type==='narrow'||o.type==='pit'||o.type==='crumble').length;
    for(let k=holes; k<2; k++){
      const y = total*(k===0 ? 0.38 : 0.68);
      const clash = obs.some(o=>y < (o.y1===undefined?0:o.y1)+120 && y+300 > (o.y0===undefined?0:o.y0)-120);
      const yStart = clash ? y + 340 : y;
      const icy2 = currentMap.slippery ? 1.4 : 1;
      const hw = (hard? rand(52,66): rand(60,78))*icy2;
      // Off centre enough that holding straight is a gamble, not so far that
      // the middle of the track is always over the drop -- fully offset,
      // bots collected twenty falls a round on a bad layout.
      obs.push({type:'narrow', yStart, yEnd:yStart+300, y0:yStart, y1:yStart+300,
                halfWidth: hw,
                offset: (hw*0.75 + 20) * (Math.random()<0.5?-1:1)});
    }
    trackLength = cursor+300;
    obs.sort((a,b)=>a.y0-b.y0);
    return obs;
  }
