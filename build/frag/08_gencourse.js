  function genCourse(n){
    const cx=TRACK_W/2;
    const hard = n>=2;
    const spd  = n===1?1.0 : n===2?1.22 : 1.42;
    // A map whose whole mechanic is losing ground needs less ground to lose.
    // v20 slowed the beans by 12% and the field was home in 24-33 s against a
    // 40-50 s target, so round 1 is 25% longer and round 2 15% longer.
    // Sunny and Neon carry their own round-1 length (10,300): at 8,800 their
    // field was home in 34-35 s against a 40 s target, and they scale with it.
    const total = Math.round((n===1?(currentMap.round1Total||8800) : n===2?6900 : 5200) * (currentMap.lenScale||1));
    const mode = currentMap.isMinigame ? currentMap.mode : null;
    // A clear run-in. At 380, with gaps down to 60, Super Slide opened with a
    // crumbling bridge at y=560: anyone walking straight was stopped dead and
    // the camera clipped into the void wall behind them.
    const obs=[];

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
    // ---- AUTHORED COURSE — the map's own script, section by section ----
    // v21. Until now a course was a random draw from the map's obstacle list at
    // a uniform gap, so every run of Sunny Sprint felt like every other run and
    // like every other map. Now each map has a script: an ordered list of
    // sections, each with a type, a length, and its own turn and climb. The
    // order and the shape are the same every time, so a course can be learned.
    // What stays random lives inside a section -- obstacle phases, which lane a
    // hole is in, which door is fake, small offsets.
    const script = scaleScript(COURSE_SCRIPTS[currentMap.key] || COURSE_SCRIPTS._default, total);
    courseScript = script;
    const ctx = { cx, hard, spd, obs, biasN:0, biasSign: Math.random()<0.5 ? -1 : 1 };
    let sy = 0;
    for(const sec of script){ buildSection(sec, sy, sy + sec.len, ctx); sy += sec.len; }
    // The line sits at the end of the last section; FINISH_ZONE is the pen past it.
    trackLength = sy;
    obs.sort((a,b)=>a.y0-b.y0);
    return obs;
  }

  // Sections are written at the map's natural size. A shorter round scales the
  // whole script rather than dropping sections, so round 2 is the same course
  // in the same order, just tighter -- which is the point of authoring it.
  function scaleScript(sections, total){
    const natural = sections.reduce((a,s)=>a+s.len, 0) || 1;
    const k = total/natural;
    return sections.map(s=>Object.assign({}, s, { len: Math.max(120, Math.round(s.len*k)) }));
  }

  // ---- section builders ----
  // Each one fills [yStart, yEnd) with its own furniture. Anything it does not
  // use is clear ground, which is how the script controls pacing: a section is
  // as long as the script says, not as long as its obstacle happens to be.
  function buildSection(sec, yStart, yEnd, ctx){
    const { cx, hard, spd, obs } = ctx;
    const type = sec.type;
    const len  = yEnd - yStart;
    const LANES = [-200,-100,0,100,200];
    // The legacy bodies below were written against a running cursor and a gap
    // between obstacles. The script owns both now, so the cursor starts at the
    // section and the gap is nothing.
    let cursor = yStart;
    const gap = 0;

    if(type==='start' || type==='pad' || type==='finish'){
      return;                                   // clear ground; the mesh builder dresses it
    } else if(type==='gap'){
      // A hole down the middle with both sides open: the one hazard a player
      // who only holds forward cannot walk through.
      const hw = (hard? rand(112,132): rand(104,126)) * (currentMap.slippery ? 0.72 : 1);
      const gy0 = yStart + Math.max(60, (len-280)/2), gy1 = Math.min(yEnd-40, gy0+280);
      obs.push({type:'gap', yStart:gy0, yEnd:gy1, y0:gy0, y1:gy1, cx, halfWidth:hw});
      return;
    } else if(type==='pillars'){
        const count = hard? 3+Math.floor(rand(0,2)) : 2+Math.floor(rand(0,2));
        const lanes=[...LANES].sort(()=>Math.random()-0.5).slice(0,count);
        const y = cursor+gap+80;
        obs.push({type, y, y0:y-70, y1:y+70, items:lanes.map(l=>({x:cx+l+rand(-18,18), r:rand(32,42)}))});
        cursor = y+70;
      } else if(type==='hammer'){
        const count = hard? (Math.random()<0.5?4:3) : 3;
        const y = cursor+gap+120, band=130;
        const items=[]; const span=620;
        for(let i=0;i<count;i++){
          const px = cx + (i-(count-1)/2)*(span/(count-1));
          items.push({pivotX:px, armLen: count===4? rand(140,165): rand(160,200), speed:rand(1.3,1.9)*spd, phase:rand(0,6.28)});
        }
        obs.push({type,y,band,y0:y-band/2-RADIUS, y1:y+band/2+RADIUS, items});
        cursor = y+band/2+40;
      } else if(type==='spinbar'){
        const length = clamp(len-160, 420, 620);
        const y = cursor+gap+length/2+40;
        obs.push({type,y,cx,length,speed:rand(1.1,1.7)*spd*(Math.random()<0.5?-1:1), phase:rand(0,6.28), thickness:34, y0:y-length/2-20, y1:y+length/2+20});
        cursor = y+length/2+20;
      } else if(type==='pit'){
        const plen = clamp(len-180, 220, 340);
        const yStart2 = cursor+gap+90, yEnd2=yStart2+plen;
        const count = hard? 2 : (Math.random()<0.5?2:3);
        const width = (hard? rand(85,105): rand(100,125));
        const platforms=[];
        for(let i=0;i<count;i++){
          const base = cx + (i-(count-1)/2)*(count===2?220:230);
          platforms.push({baseX:base, amp:rand(100,160), speed:rand(0.8,1.3)*spd, phase:rand(0,6.28), width});
        }
        obs.push({type,yStart:yStart2,yEnd:yEnd2,y0:yStart2,y1:yEnd2,platforms});
        cursor = yEnd2+40;
      } else if(type==='narrow'){
        const nlen = clamp(len-140, 300, 520);
        const yStart2=cursor+gap+70, yEnd2=yStart2+nlen;
        const icy = currentMap.slippery ? 1.4 : 1;
        const halfWidth = (hard? rand(52,66): rand(60,78))*icy;
        // How far off the centre line the channel sits. Left to the old
        // +-70 (halved on ice) the channel always still covered the middle of
        // the track, so a racer holding forward walked every narrow on Super
        // Slide without steering once. A section can now ask for a real bias;
        // the side is still a coin flip, so the shape is learnable and the
        // detail is not memorised.
        // Biased channels alternate sides down the course. Left to a coin flip
        // per section, two in a row landed on the same side often enough that a
        // racer respawning into the first channel was already lined up for the
        // second and walked it -- so the section that is supposed to make you
        // steer did nothing. The first side is still random, so which way you
        // are sent varies; the alternation is what makes it a test every time.
        const offset = sec.bias
          ? ctx.biasSign * (ctx.biasN++ % 2 ? -1 : 1) * rand(sec.bias*0.85, sec.bias*1.15)
          : rand(-70,70)*(currentMap.slippery?0.6:1);
        obs.push({type,yStart:yStart2,yEnd:yEnd2,y0:yStart2,y1:yEnd2, halfWidth, offset});
        cursor=yEnd2+30;
      } else if(type==='pusher'){
        const y=cursor+gap+90, d=44;
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
        const rlen=clamp(len-260, 200, 320), yStart2=cursor+gap+70, yEnd2=yStart2+rlen;
        obs.push({type:'ramp', yStart:yStart2, yEnd:yEnd2, y0:yStart2, y1:yEnd2+90,
                  height: rand(30,52), width: rand(240,400), cx: cx+rand(-140,140)});
        cursor=yEnd2+150;
      } else if(type==='fork'){
        // The track splits and a wall makes you commit. One side is a raised
        // catwalk that spits you out at speed; the other is flat and safe, but
        // there is furniture in the way.
        const flen = clamp(len-200, 620, 860);
        const yStart2 = cursor+gap+120, yEnd2 = yStart2+flen;
        const risk = Math.random()<0.5 ? -1 : 1;
        obs.push({type:'fork', y:(yStart2+yEnd2)/2, yStart:yStart2, yEnd:yEnd2, y0:yStart2-40, y1:yEnd2+40,
                  cx, risk, wallFrom: yStart2+130});
        obs.push({type:'shortcut', yStart:yStart2, yEnd:yEnd2-40, y0:yStart2-40, y1:yEnd2+120,
                  cx: cx + risk*(TRACK_W/4), w: rand(112,132),
                  h:46, rampLen:170, boost: rand(6.4,7.4)});
        for(let i=0;i<3;i++){
          const py = yStart2 + flen*(0.30+i*0.22);
          obs.push({type:'pillars', y:py, y0:py-70, y1:py+70,
                    items:[{x: cx - risk*(TRACK_W/4) + rand(-80,80), r:rand(32,42)}]});
        }
        cursor = yEnd2+160;
      } else if(type==='gate'){
        // A wall with two doors in it. Sixteen racers, two doors: the jam is
        // the obstacle.
        const y = cursor+gap+140;
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
        const clen = clamp(len-220, 340, 460);
        const yStart2 = cursor+gap+110, yEnd2 = yStart2+clen;
        const slabW = 108, rowD = clen/rows;
        const slabs = [];
        for(let ri=0; ri<rows; ri++) for(let ci=0; ci<cols; ci++){
          slabs.push({ x: cx + (ci-1.5)*(slabW+14), y: yStart2 + ri*rowD + rowD/2,
                       w: slabW, d: rowD-18, touched:false, fuse:-1, gone:false, drop:0, back:0 });
        }
        obs.push({type:'crumble', y:(yStart2+yEnd2)/2, yStart:yStart2, yEnd:yEnd2, y0:yStart2-30, y1:yEnd2+30,
                  slabs, h: 26, fuseTime: hard?1.1:1.4, respawnTime: hard?1.8:1.4});
        cursor = yEnd2+150;
      //<<shelved:gencourse-log-roller>>
      } else if(type==='shortcut'){
        // A narrow raised lane hugging one wall. Ramp on, and it runs you past
        // whatever is happening on the floor -- but it is barely wider than you.
        const side = Math.random()<0.5 ? -1 : 1;
        const slen = clamp(len-220, 600, 900);
        const yStart2 = cursor+gap+70, yEnd2 = yStart2+slen;
        obs.push({type:'shortcut', yStart:yStart2, yEnd:yEnd2, y0:yStart2-40, y1:yEnd2+140,
                  cx: cx + side*(TRACK_W/2 - 96), w: rand(112,140),
                  h: 46, rampLen: 170, boost: rand(6.2,7.2)});
        // something worth skipping, on the floor beside it
        const midY = (yStart2+yEnd2)/2;
        obs.push({type:'pusher', y:midY, d:44, y0:midY-44/2-RADIUS, y1:midY+44/2+RADIUS,
                  items:[{baseX:cx-side*40, amp:rand(150,230), speed:rand(1.2,1.9)*spd,
                          phase:rand(0,6.28), width:rand(150,200), d:44}]});
        cursor = yEnd2+170;
      } else if(type==='cannon'){
        // cannons in the side walls, firing across the lane on a fixed beat
        const count = hard?2:1;
        const y = cursor+gap+140;
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
        const y = cursor+gap+160;
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
        const y = cursor+gap+110;
        obs.push({type:'bumper', y, y0:y-100, y1:y+100,
                  items:lanes.map(l=>({x:cx+l+rand(-24,24), r:rand(30,40), hit:0}))});
        cursor = y+100;
      } else if(type==='boost'){
        const y = cursor+gap+100;
        obs.push({type:'boost', y, cx: cx+rand(-190,190), w: rand(140,210),
                  len: rand(120,180), power: rand(5.2,7.4),
                  y0:y-110, y1:y+110});
        cursor = y+170;
      //<<shelved:gencourse-spinlaser>>
      } else if(type==='beam'){
        const y=cursor+gap+110;
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
