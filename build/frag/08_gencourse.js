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
    // A clear run-in. At 380, with gaps down to 60, Splash Slide opened with a
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
    } else if(type==='smallDiscs'){
        // Five to eight small discs in a zigzag with nothing between them: a
        // rhythm-jump section. It is a disc field underneath -- same cells,
        // same collision, same respawn -- with no arms and real gaps, so the
        // only thing being asked of you is the timing of the hops.
        // v24: two lines down the same stretch of nothing. The safe one
        // zigzags in short hops a plain jump clears; the hard one runs straight
        // in fewer, longer hops that need the jump chained into an air dive.
        // Fewer landings and no sideways shuffling is what the risk buys, and
        // both lines span exactly the same y, so the only thing being traded
        // is difficulty for time.
        const HARD_GAP = 120, SAFE_GAP = 66;
        // Sixteen racers land on the same disc at the same moment, so a disc
        // that only fits three abreast turns the section into a shoving match
        // and most of the field goes over the side. Wide enough for the pack,
        // still small against the 520-wide track.
        const dr = 86;
        // The sideways step between discs has to be crossable in one hop. At
        // 0.10 of the track that was 104 units between consecutive discs, far
        // more sideways speed than a bean builds in the ~34 frames it is
        // airborne, so racers landed short every time and none of sixteen
        // finished. The grid disc field, which hops straight ahead, was fine
        // throughout -- so the zigzag is a lean, not a slalom.
        const zig = TRACK_W*0.035;
        const yStart2 = cursor + gap + 90;
        const hardSteps = clamp((sec.count||5) - 1, 3, 5);
        const span = hardSteps*(dr*2 + HARD_GAP);
        // The safe line takes as many hops as it needs to keep each one under
        // the width a plain jump clears, over the same span.
        const safeN = Math.max(2, Math.round(span/(dr*2 + SAFE_GAP)) + 1);
        const safeStep = span/(safeN - 1);
        const side = Math.random()<0.5 ? -1 : 1;
        const safeX = cx - side*TRACK_W*0.185, hardX = cx + side*TRACK_W*0.185;
        const cells = [];
        for(let i=0;i<safeN;i++){
          cells.push({ row:i, col:0, x: safeX + ((i%2)?1:-1)*zig, y: yStart2 + dr + i*safeStep, r: dr,
                       noArm:true, phase: rand(0,6.28), speed: ((i%2)?-1:1)*rand(0.35,0.60)*spd,
                       armPhase:0, armSpeed:0 });
        }
        for(let i=0;i<=hardSteps;i++){
          cells.push({ row:i, col:1, x: hardX, y: yStart2 + dr + i*(dr*2 + HARD_GAP), r: dr,
                       noArm:true, phase: rand(0,6.28), speed: rand(0.35,0.60)*spd,
                       armPhase:0, armSpeed:0 });
        }
        // The drop starts at the FIRST disc's centre and ends at the last
        // one's, not at their outer edges. At the leading edge a disc is a
        // single point, so a racer arriving anywhere but exactly on its centre
        // line stepped into nothing the instant it entered -- and, respawning
        // to the same line, did it again every time. One bot in Sunny lost
        // twenty-five lives that way without ever leaving the ground.
        const yA = yStart2 + dr, yB = yA + span;
        obs.push({type:'discField', yStart:yA, yEnd:yB, y0:yA-30, y1:yB+30,
                  cols:2, rows:Math.max(safeN, hardSteps+1), r:dr, cells, small:true,
                  hardCol:1, airGaps:[Math.round(safeStep - dr*2), HARD_GAP]});
        cursor = yB + dr + 70;
    } else if(type==='chevron'){
        // A slope painted with chevrons, net walls down both sides, and a few
        // turnstiles across it. The climb itself comes from the section's own
        // `climb`, through the course script, so it costs speed via SLOPE_PULL
        // like any other gradient. A turnstile is a short spin bar on a
        // vertical axis -- which is exactly what a spinbar already is -- so it
        // arrives with collision, a mesh, a bot plan and check 6 for free.
        const nT = clamp(sec.turnstiles || 3, 2, 4);
        const clen = clamp(len-200, 520, 1200);
        const yStart2 = cursor + gap + 90, yEnd2 = yStart2 + clen;
        obs.push({type:'chevron', yStart:yStart2, yEnd:yEnd2, y0:yStart2, y1:yEnd2,
                  nets: sec.nets !== false});
        for(let i=0;i<nT;i++){
          const ty = yStart2 + clen*(i+0.5)/nT;
          obs.push({type:'spinbar', y:ty, cx: cx + rand(-90,90), length: rand(240,320),
                    // fast enough to be a barrier rather than scenery: at the
                    // old 1.0x floor a turnstile on a slow map took ten seconds
                    // to come round, which you simply walk past
                    speed: rand(1.4,1.9)*spd*(Math.random()<0.5?-1:1), phase: rand(0,6.28),
                    thickness: 26, turnstile:true, y0:ty-170, y1:ty+170});
        }
        cursor = yEnd2 + 80;
    } else if(type==='plank'){
        // Two or three narrow planks side by side over a drop, with a hammer
        // on a rope swinging across the middle of them. Pick a plank, time the
        // hammer, and do not wander off the side.
        const n = sec.planks || 3;
        const plen = clamp(len-240, 380, 680);
        const yStart2 = cursor + gap + 120, yEnd2 = yStart2 + plen;
        const pw = RADIUS*2*2.2;                       // 2.2 bean-widths, per the brief
        const spread = TRACK_W*0.60;
        const planks = [];
        for(let i=0;i<n;i++) planks.push({ x: cx + (n===1?0:(i-(n-1)/2)*(spread/(n-1))), w:pw });
        obs.push({type:'plank', yStart:yStart2, yEnd:yEnd2, y0:yStart2-20, y1:yEnd2+20, planks, w:pw});
        // the hanging hammer, reusing the pendulum that already swings and
        // already has a bot plan and a check of its own
        const py = (yStart2+yEnd2)/2;
        const pArm = rand(165,205), pR = rand(30,38);
        obs.push({type:'pendulum', y:py, cx, armLen:pArm, r:pR, pivotH:pArm+pR+4,
                  swing: rand(0.85,1.05), speed: rand(0.9,1.3)*spd, phase: rand(0,6.28),
                  y0:py-120, y1:py+120});
        cursor = yEnd2 + 60;
    } else if(type==='discField'){
        // A grid of turntables over a drop, each with an arm sweeping across it
        // at knee height. Adjacent discs turn opposite ways, so the floor under
        // you reverses every time you hop; the gaps between them are a fall.
        const cols = sec.cols||3, rows = sec.rows||2;
        const spacing = TRACK_W/cols;
        const dr = spacing*0.44;
        const rowD = dr*2.30;
        const yStart2 = cursor + gap + Math.max(50, (len - rows*rowD)/2);
        // v24: one column is the hard line. Its discs are smaller, so the hop
        // between them is a jump-and-dive rather than a jump -- the radius is
        // solved from the gap we want rather than picked, so a change to the
        // row spacing cannot quietly take it out of the band. What the risk
        // buys is the arm: the small discs have none sweeping across them, so
        // the hard column is the one line up the field with nothing to dodge.
        const HARD_GAP = 120;
        // Solved, not clamped: a disc small enough to make the gap 120 but too
        // small to land on is worse than no hard line at all, so a field whose
        // rows are close together simply does not get one. The zigzag section
        // carries the band on every map regardless.
        const hardR = (rowD - HARD_GAP)/2;
        const hardCol = (cols >= 2 && hardR >= Math.max(26, dr*0.34))
                      ? Math.floor(Math.random()*cols) : -1;
        const cells = [];
        for(let ri=0; ri<rows; ri++) for(let ci=0; ci<cols; ci++){
          const flip = ((ri+ci) % 2) ? -1 : 1;
          const hard = ci === hardCol;
          cells.push({ row:ri, col:ci, x: ci*spacing + spacing/2, y: yStart2 + ri*rowD + dr,
                       r: hard ? hardR : dr, noArm: hard,
                       phase: rand(0,6.28),    speed: flip*rand(0.30,0.50)*spd,
                       armPhase: rand(0,6.28), armSpeed: hard ? 0 : -flip*rand(0.55,0.85)*spd });
        }
        // The drop runs between the first and last rows' CENTRES. Measured to
        // their outer edges instead, the entry and the exit are each a point
        // where the disc has no width, so anyone not exactly on a column's
        // centre line walked straight into the gap.
        const yA = cells[0].y, yB = cells[cells.length-1].y;
        obs.push({type:'discField', yStart:yA, yEnd:yB, y0:yA-30, y1:yB+30,
                  cols, rows, r:dr, cells,
                  hardCol: hardCol >= 0 ? hardCol : undefined,
                  airGaps: hardCol >= 0 ? [Math.round(rowD - dr*2), Math.round(rowD - hardR*2)]
                                        : [Math.round(rowD - dr*2)]});
        cursor = yB + dr + 60;
    } else if(type==='pillars'){
        const count = hard? 3+Math.floor(rand(0,2)) : 2+Math.floor(rand(0,2));
        const lanes=[...LANES].sort(()=>Math.random()-0.5).slice(0,count);
        const y = cursor+gap+80;
        // A row of pillars has to be passable. Two things could make it not:
        // a pillar close enough to a side wall to seal the corner, and two
        // pillars on adjacent lanes whose jitter brought them within less than
        // a bean of each other. A racer that walks into either is held there by
        // both sides at once -- steering out pushes it back in -- and with
        // courses authored it is the same corner every single run. One Super
        // Slide bot stood in one for half a minute.
        const CLEAR = RADIUS*2 + 8;                  // a bean, and room to move
        const raw = lanes.map(l=>({ x: cx+l+rand(-18,18), r: rand(32,42) }))
                         .sort((a,b)=>a.x-b.x);
        const items = [];
        for(const q of raw){
          const lo = q.r + RADIUS + 38, hi = TRACK_W - q.r - RADIUS - 38;
          q.x = clamp(q.x, lo, hi);
          const prev = items[items.length-1];
          if(prev){
            const need = prev.x + prev.r + CLEAR + q.r;
            if(q.x < need) q.x = need;
            if(q.x > hi) continue;                   // no room left: leave it out
          }
          items.push(q);
        }
        obs.push({type, y, y0:y-70, y1:y+70, items});
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
        // v24: a fixed island down the middle. Riding a platform is the safe
        // way over and it costs you the wait; the island is two long hops with
        // nothing to ride and nothing to time, and it is the quickest way
        // across for anyone who can make them. The pit is sized from the hops
        // rather than the hops from the pit, so the gaps land in the band.
        const ISLAND_D = 90, ISLAND_GAP = 120;
        const wantIsland = len - 180 >= ISLAND_D + ISLAND_GAP*2;
        const plen = wantIsland ? ISLAND_D + ISLAND_GAP*2 : clamp(len-180, 220, 340);
        const yStart2 = cursor+gap+90, yEnd2=yStart2+plen;
        const islands = wantIsland
          ? [{ x: clamp(cx + rand(-130,130), 130, TRACK_W-130), w: rand(150,190),
               y0: yStart2 + ISLAND_GAP, y1: yStart2 + ISLAND_GAP + ISLAND_D }]
          : [];
        const count = hard? 2 : (Math.random()<0.5?2:3);
        const width = (hard? rand(85,105): rand(100,125));
        const platforms=[];
        for(let i=0;i<count;i++){
          const base = cx + (i-(count-1)/2)*(count===2?220:230);
          platforms.push({baseX:base, amp:rand(100,160), speed:rand(0.8,1.3)*spd, phase:rand(0,6.28), width});
        }
        obs.push({type,yStart:yStart2,yEnd:yEnd2,y0:yStart2,y1:yEnd2,platforms,islands,
                  // Nought is the platform route: it asks you to clear nothing at
                  // all, which is what makes it the safe one. The island's two
                  // hops are the other entry.
                  airGaps: wantIsland ? [0, ISLAND_GAP] : [0]});
        cursor = yEnd2+40;
      } else if(type==='narrow'){
        const nlen = clamp(len-140, 300, 520);
        const yStart2=cursor+gap+70, yEnd2=yStart2+nlen;
        // v22 made ice genuinely slippery, and a course of tight channels is
        // the wrong course to put on it: threading a gap you cannot steer
        // into is not sliding, it is a punish. On ice the channel is wider and
        // sits nearer the middle, so the section asks you to commit to a line
        // early rather than to correct at the last moment -- which is the
        // skill a slide is supposed to test.
        // 1.75 was too generous: it widened the channel past the bias, so the
        // centre line ran through every one of them and a player holding
        // forward won Splash Slide outright. A channel has to stay a thing you
        // steer into, on ice as much as anywhere.
        const icy = currentMap.slippery ? 1.55 : 1;
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
          const pr = rand(32,42);
          obs.push({type:'pillars', y:py, y0:py-70, y1:py+70,
                    items:[{x: clamp(cx - risk*(TRACK_W/4) + rand(-80,80), pr+RADIUS+38, TRACK_W-pr-RADIUS-38), r:pr}]});
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
                  // Sixteen racers strip a twelve-slab bridge in one pass, and
                  // the field behind them arrives to nothing. A quicker rebuild
                  // is what keeps the back of the pack from queueing at the
                  // edge and then falling in when the wait times out.
                  // On ice you cannot stop to time your crossing, so the slab
                  // has to wait for you rather than the other way round.
                  slabs, h: 26,
                  fuseTime: (hard?1.1:1.4) * (currentMap.slippery ? 1.45 : 1),
                  respawnTime: hard?1.3:1.0});
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
      } else if(type==='slime'){
        // v24 §2.8. A wide sheet of the stuff with a direction and a speed: it
        // carries whatever is standing on it, the way a conveyor does. The flow
        // runs across the track rather than along it, so it is a thing to be
        // crossed and not a moving walkway you ride to the finish -- it shoves
        // you at the wall, and holding a line against it is the section.
        const y = cursor + gap + 150;
        const len = rand(300, 420);
        obs.push({type:'slime', y, cx, w: TRACK_W-80, len,
                  flowX: (Math.random()<0.5?-1:1), flowY: rand(-0.10, 0.10),
                  // as a share of top speed, not as a push: see the collision
                  speed: rand(0.38, 0.52) * spd,
                  y0: y-len/2-30, y1: y+len/2+30});
        cursor = y + len/2 + 90;
      } else if(type==='bounce'){
        // Trampolines. Three to five across the lane, each launching you to the
        // same height however fast you arrived -- a fixed height is what makes
        // them readable, and what stops a quick racer overshooting the one they
        // were aiming for.
        const y = cursor + gap + 130;
        const n = 3 + Math.floor(Math.random()*3);
        const items = [];
        for(let i=0;i<n;i++){
          items.push({ x: clamp(cx + (i-(n-1)/2)*rand(150,190) + rand(-20,20), 90, TRACK_W-90),
                       y: y + rand(-70,70), r: rand(48,62), hit: 0 });
        }
        obs.push({type:'bounce', y, cx, items, power: rand(11.5,13.0),
                  y0: y-170, y1: y+170});
        cursor = y + 200;
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
