  // ============================================================
  // MINIGAME + OBSTACLE RUNTIME
  // ============================================================
  let boulderTimer=0;
  const CANNON_WARN = 0.75;          // seconds of floor warning before a cannon fires
  let shots=[];                     // cannonballs in flight
  const shotMat = new THREE.MeshPhongMaterial({color:0x2b2140, shininess:50});
  function shotMaterial(){ return courseLook ? courseLook.stripeMat(0) : shotMat; }
  const rockMat = new THREE.MeshPhongMaterial({color:0x6b5545, shininess:8, flatShading:true});
  const rockTopMat = new THREE.MeshLambertMaterial({color:0x8a7060, flatShading:true});

  // Which column of the grid you are over, and the highest floor left in it.
  function tileColumnAt(field, x, y){
    if(x<0||x>=TRACK_W||y<field.yStart||y>=field.yEnd) return null;
    const c=Math.floor(x/field.tileW), r=Math.floor((y-field.yStart)/field.rowDepth);
    if(c<0||c>=field.cols||r<0||r>=field.rows) return null;
    return field.columns[r*field.cols+c] || null;
  }
  function tileFloor(col){
    if(!col) return null;
    for(const t of col.tiers) if(!t.gone) return t;
    return null;
  }
  function tileAt(field, x, y){
    if(x<0||x>=TRACK_W||y<field.yStart||y>=field.yEnd) return null;
    const c=Math.floor(x/field.tileW), r=Math.floor((y-field.yStart)/field.rowDepth);
    if(c<0||c>=field.cols||r<0||r>=field.rows) return null;
    return field.tiles[r*field.cols+c] || null;
  }
  // Highest surviving tier of the hex column under (x,y); null if nothing holds you.
  function hexColumnAt(field, x, y){
    // The nearest centre IS the hexagon you are standing on — a hex lattice's
    // Voronoi cells are the hexagons themselves. Testing a circle instead leaves
    // uncovered gaps at the lattice's triangle centres, and racers drop through them.
    let best=null, bestD=1e9;
    for(const col of field.columns){
      const d=Math.hypot(col.x-x, col.y-y);
      if(d<bestD){ bestD=d; best=col; }
    }
    return (best && bestD < best.r*1.15) ? best : null;
  }
  // What a hexagon's fuse is worth at this moment in the round. A field with
  // no ramp on it answers with the number it was built with, so Last Rung and
  // anything else that wants a flat fuse reads the same as before.
  function hexFuse(o){
    if(o.fuse0 === undefined) return o.fuseTime;
    const k = clamp(raceTime/(o.fuseRampS||45), 0, 1);
    return o.fuse0 + (o.fuse1 - o.fuse0)*k;
  }
  function hexFloor(col){
    if(!col) return null;
    for(const c of col.tiers){ if(!c.gone) return c; }
    return null;
  }
  function laserY(o,t){ return o.y + Math.sin(t*o.speed+o.phase)*o.span; }
  // A pendulum hangs from a pivot above the lane: it sweeps the full width and
  // rides lowest through the middle, which is exactly where you want to run.
  function pendAngle(o,t){ return Math.sin(t*o.speed+o.phase)*o.swing; }
  function pendPos(o,t){
    const a=pendAngle(o,t);
    return { x: o.cx + Math.sin(a)*o.armLen, h: o.pivotH - Math.cos(a)*o.armLen };
  }
  // Beam Team's rings speed up over the round, and a ring whose speed changes
  // cannot be read off the clock: t*speed would jump the whole arm every time
  // the multiplier moved. A ring that ramps carries its own accumulated angle,
  // the way the closing ring carries its own radius. One that does not is still
  // the clock, so the shelved sections read the same.
  function spinlaserAngle(o,t){ return o.ang===undefined ? t*o.speed + o.phase : o.ang; }
  function rollerX(o,t){ return o.cx + Math.sin(t*o.speed+o.phase)*o.amp; }
  // The log a racer is over, and how high its surface is under them. The crown
  // is the high line down the middle; the further off it you are the lower and
  // the steeper the ground, until there is none.
  function logOver(o, y){ return o.logs.find(l=>y >= l.a && y <= l.b); }
  function logSurface(o, l, x){
    const dx = x - l.cx;
    if(Math.abs(dx) > o.band) return null;
    return o.crown - (o.R - Math.sqrt(Math.max(0, o.R*o.R - dx*dx)));
  }
  // Where a peg is in its turn: zero is straight up, and how far it stands
  // proud of the surface is the cosine of that.
  function pegRise(o, l, peg){
    let a = (peg.a + l.ang) % (Math.PI*2);
    if(a > Math.PI) a -= Math.PI*2;
    if(a < -Math.PI) a += Math.PI*2;
    return { ang:a, rise: Math.cos(a)*o.pegLen };
  }
  function blockShift(o,t){ return Math.sin(t*o.speed+o.phase)*o.amp; }
  // A Wall Rush wall carries its own y and moves it in updateMinigames, the way
  // the closing ring carries its own radius. Everything else that draws or hits
  // a blockwall reads it through here, so a wall that does not travel is still
  // the fixed one the race sections use.
  function wallY(o,t){ return o.travel ? o.wy : o.y; }
  // Blocks are whole slots, and the gap is a run of them. The count never
  // changes, so the meshes built for a wall are the meshes it keeps -- moving
  // the gap moves them, it does not rebuild them.
  function wallItems(o){
    const items=[];
    for(let i=0;i<o.slots;i++){
      if(i>=o.gapStart && i<o.gapStart+o.gapSlots) continue;
      items.push({x:o.x0 + i*o.slotW + o.slotW/2, w:o.slotW-6});
    }
    return items;
  }
  function wallGapX(o){ return o.x0 + (o.gapStart + o.gapSlots/2)*o.slotW; }
  // Closing Circle and Carousel are a platform in the void: the track's side
  // walls do not exist there, and clamping to them made the edge unreachable.
  // Rounds whose floor is a shape rather than a corridor: the track walls do
  // not apply, because going off the side is the round.
  function arenaMode(){ return currentMap.mode==='shrink' || currentMap.mode==='spin'
                            || currentMap.mode==='walls' || currentMap.mode==='beam'; }
  // How high a racer's feet are above the COURSE surface, not above whatever
  // they happen to be standing on. A hazard bolted to the floor -- a pusher, a
  // spin bar, a bumper, a boost pad -- has to be measured against this: a racer
  // up on the shortcut catwalk has r.h = 0 with r.floorH = 46, and on the old
  // r.h test a floor-level pusher swept straight through the catwalk and
  // knocked the rider off it. Authored courses put the shortcut's companion
  // pusher in the same place every run, which turned that into check Q failing
  // half the time instead of once in a while.
  function surfaceH(r){ return (r.floorH||0) + r.h; }
  // ---- which side of a solid a racer is put back on ----
  // The physics loop notes where each racer was before this tick moved it
  // (mvX, mvY, mvH, good while mvOk), and a solid pushes a racer back out the
  // side it came in by. Deciding that from where the centre is NOW is what made
  // the old dive a way through: once anything had carried the centre past a
  // slab's middle line, the push-out chose the far face and finished the
  // crossing for it. A centre that crossed the line in THIS tick has got
  // through only if the point where it crossed was open -- a gap, or over the
  // top -- and is otherwise put back where it came from. Nothing but the
  // physics loop records a start, so a check or a teleport that calls
  // checkObstacles on its own gets the plain answer, as does a jump in position
  // no tick of movement could make.
  function moveKnown(r){
    return r.mvOk === true && Math.abs(r.x - r.mvX) + Math.abs(r.y - r.mvY) < 80;
  }
  // The side (sign) of the line x=c (axisX) or y=c the racer belongs on; 0 only
  // for a centre exactly on the line. open(along, h) is whether the solid
  // leaves room at that point of its middle line, `along` being the other
  // coordinate and h the height of the feet.
  function sideOf(r, axisX, c, open){
    const cur = axisX ? r.x : r.y, from = axisX ? r.mvX : r.mvY;
    const now = Math.sign(cur - c);
    if(!moveKnown(r)) return now;
    const was = Math.sign(from - c);
    if(!was || was === now) return now;
    const k = (c - from)/(cur - from);
    const along = axisX ? r.mvY + (r.y - r.mvY)*k : r.mvX + (r.x - r.mvX)*k;
    return open(along, r.mvH + (r.h - r.mvH)*k) ? now : was;
  }
  // The way out of a round solid: straight out from its centre, from where the
  // racer is -- unless this tick took the centre past the solid's own (the
  // offsets before and after point apart) while it was low enough to be
  // stopped, in which case back out along the side it came from. `top` is the
  // solid's height over the course surface (Infinity for a pillar).
  let outNX = 0, outNY = 0;
  function roundOut(r, cx, cy, top){
    let nx = r.x - cx, ny = r.y - cy;
    if(moveKnown(r)){
      const px = r.mvX - cx, py = r.mvY - cy;
      if(nx*px + ny*py < 0 && (r.floorH||0) + r.mvH < top){ nx = px; ny = py; }
    }
    const d = Math.hypot(nx, ny) || 1;
    outNX = nx/d; outNY = ny/d;
  }
  // checkObstacles is handed a racer and a clock, not the frame's step, and a
  // surface that pushes every frame needs the step or it pushes harder on a
  // slow machine. The physics loop leaves it here.
  let frameK = 1;
  // Disc-field angles are derived from the clock, never accumulated, so the
  // same instant always gives the same disc -- which is what lets a check
  // assert where an arm is, and what keeps a multiplayer client in step.
  function discAng(c, t){ return c.phase + t*c.speed; }
  function discArmAng(c, t){ return c.armPhase + t*c.armSpeed; }
  // The cell a racer is standing on, or null if they are over a gap.
  function discCellAt(o, x, y){
    let on = null, best = 1e9;
    for(const c of o.cells){
      const d = Math.hypot(x-c.x, y-c.y);
      if(d < c.r && d < best){ best = d; on = c; }
    }
    return on;
  }
  // Is the arm about to sweep through this racer? Used by the bots to time a
  // hop, and by the check to prove the arm can actually reach someone.
  function discArmNear(c, x, y, t, tol){
    const dx = x-c.x, dy = y-c.y;
    if(Math.hypot(dx,dy) < 16) return false;              // standing on the hub
    const a = discArmAng(c, t);
    let d = Math.atan2(dy,dx) - a;
    while(d > Math.PI) d -= Math.PI*2;
    while(d < -Math.PI) d += Math.PI*2;
    return Math.abs(d) < (tol===undefined?0.70:tol) && d*c.armSpeed > 0;
  }
  function moverX(o,t){ return o.cx + Math.sin(t*o.speed+o.phase)*o.amp; }
  function logAngle(o,t){ return Math.sin(t*o.speed+o.phase)*o.swing; }
  function logPos(o,t){ const a=logAngle(o,t);
    return { x:o.cx + Math.sin(a)*o.armLen, h:o.pivotH - Math.cos(a)*o.armLen, ang:a }; }

  function buildMinigameMeshes(){
    const accent = new THREE.Color(currentMap.accent);
    const look = courseLook || { accents:[currentMap.accent,currentMap.accent,currentMap.accent],
      hazardMat:(i)=>new THREE.MeshLambertMaterial({color:currentMap.accent}),
      stripeMat:(i)=>new THREE.MeshLambertMaterial({map:stripeTexture('#ffffff', currentMap.accent)}),
      softMat:(i)=>new THREE.MeshLambertMaterial({color:softAccent(currentMap.accent)}), paleWall:paleOf(currentMap.ground) };
    for(const o of obstacles){
      if(o.type==='doors'){
        o.meshes = o.items.map(it=>{
          const g=new THREE.Group();
          // every door wears the same stripe: a paper one must not give itself away
          const mat = look.stripeMat(0);
          if(it.fake){ mat.transparent = true; mat.opacity = 0.96; }
          const panel=new THREE.Mesh(THREE.RoundedBox(it.w, 74, o.d), mat);
          panel.position.y=37; panel.castShadow=true; g.add(panel); registerFadeable(panel);
          const frameMat=new THREE.MeshLambertMaterial({color:0x1a1033});
          [-1,1].forEach(s=>{ const p=new THREE.Mesh(THREE.RoundedBox(7,80,o.d+4), frameMat); p.position.set(s*(it.w/2+3),40,0); g.add(p); });
          const lintel=new THREE.Mesh(THREE.RoundedBox(it.w+14,8,o.d+4), frameMat); lintel.position.y=80; g.add(lintel);
          const knob=new THREE.Mesh(new THREE.SphereGeometry(4,8,6), new THREE.MeshPhongMaterial({color:0xffcb3d,shininess:80}));
          knob.position.set(it.w*0.28, 36, -o.d/2-2); g.add(knob);
          placeAt(g, it.x, o.y, 0);
          courseGroup.add(g);
          return {group:g, panel};
        });

      } else if(o.type==='tilefield'){
        const topMat=new THREE.MeshLambertMaterial({map:checkerTexture(currentMap.ground,currentMap.groundAlt,1)});
        const sideMat=new THREE.MeshLambertMaterial({color:currentMap.wall});
        for(const tl of o.tiles){
          const g=new THREE.Group();
          const top=new THREE.Mesh(THREE.RoundedBox(tl.w-6,12,tl.d-6), topMat.clone());
          top.receiveShadow=true; g.add(top);
          const under=new THREE.Mesh(THREE.RoundedBox(tl.w-14,26,tl.d-14), sideMat);
          under.position.y=-18; g.add(under);
          placeAt(g, tl.x, tl.y, (tl.hy||0)-6);
          g.visible = !tl.gone;
          courseGroup.add(g);
          tl.mesh=g; tl.topMat=top.material; tl.baseY=g.position.y;
        }

      } else if(o.type==='hexfield'){
        const tierMats = o.tiers.map((hy,i)=> new THREE.MeshPhongMaterial({
          color:new THREE.Color(currentMap.ground).offsetHSL(0,0,-0.10*i), shininess:20, flatShading:true }));
        const sideMat=new THREE.MeshLambertMaterial({color:currentMap.wall});
        for(const c of o.cells){
          const g=new THREE.Group();
          const top=new THREE.Mesh(new THREE.CylinderGeometry(c.r*0.97,c.r*0.97,14,6), tierMats[c.tier]);
          top.rotation.y=Math.PI/6; top.receiveShadow=true; g.add(top);
          const rim=new THREE.Mesh(new THREE.CylinderGeometry(c.r*0.99,c.r*0.99,6,6), sideMat);
          rim.rotation.y=Math.PI/6; rim.position.y=-8; g.add(rim);
          placeAt(g, c.x, c.y, c.hy-6);
          g.visible=!c.gone;
          courseGroup.add(g);
          c.mesh=g; c.topMat=top.material; c.baseY=g.position.y;
        }

      } else if(o.type==='hoop'){
        // A torus in the XY plane already has its hole facing down the course,
        // because scene z is the course. No rotation needed.
        const g = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.TorusGeometry(o.r, o.tube, 10, 44),
          new THREE.MeshPhongMaterial({color:accent.getHex(), shininess:40}));
        ring.castShadow = true; g.add(ring); registerFadeable(ring);
        const inner = new THREE.Mesh(new THREE.TorusGeometry(o.r, o.tube*0.42, 8, 44),
          new THREE.MeshBasicMaterial({color:0xffffff}));
        inner.position.z = o.tube*0.8; g.add(inner);
        placeAt(g, o.cx, o.y, o.hc);
        courseGroup.add(g);
        o.mesh = g;

      } else if(o.type==='plate'){
        // The floor, and the two things a player has to be able to read at a
        // glance: the sides are solid, and the near end is not.
        const g=new THREE.Group();
        const slab=new THREE.Mesh(new THREE.BoxGeometry(o.w, 26, o.d),
          new THREE.MeshLambertMaterial({map:checkerTexture(currentMap.ground, currentMap.groundAlt, Math.round(o.w/95))}));
        slab.position.y=-13; slab.receiveShadow=true; g.add(slab);
        // Three of the four edges are edges, so all three are painted. The
        // far one is a fence you cannot cross and is left plain.
        const lipMat=new THREE.MeshBasicMaterial({color:currentMap.accent});
        const near=new THREE.Mesh(new THREE.BoxGeometry(o.w+24, 11, 22), lipMat);
        near.position.set(0, 3, -(o.d/2)-6); g.add(near);
        [-1,1].forEach(s=>{
          const side=new THREE.Mesh(new THREE.BoxGeometry(22, 11, o.d), lipMat);
          side.position.set(s*(o.w/2+6), 3, 0); g.add(side);
        });
        const back=new THREE.Mesh(new THREE.BoxGeometry(o.w+24, 34, 20),
          new THREE.MeshLambertMaterial({color:look.paleWall}));
        back.position.set(0, 17, (o.d/2)-4); g.add(back); registerFadeable(back);
        placeAt(g, o.cx, o.y, 0);
        courseGroup.add(g);
        o.mesh=g;

      } else if(o.type==='blockwall'){
        const blockMat=new THREE.MeshPhongMaterial({color:accent.getHex(), shininess:24});
        const edgeMat=new THREE.MeshLambertMaterial({color:0x1a1033});
        o.meshes=o.items.map(it=>{
          const g=new THREE.Group();
          const bh = o.hi || 78;
          const b=new THREE.Mesh(THREE.RoundedBox(it.w,bh,o.d), blockMat); b.position.y=bh/2; b.castShadow=true; g.add(b); registerFadeable(b);
          const cap=new THREE.Mesh(THREE.RoundedBox(it.w+6,8,o.d+6), edgeMat); cap.position.y=bh+2; g.add(cap);
          placeAt(g, it.x, o.y, 0);
          courseGroup.add(g);
          return g;
        });

      } else if(o.type==='laserbar'){
        const col = o.low ? 0xff2d6f : 0x26d5ff;
        const g=new THREE.Group();
        const beam=new THREE.Mesh(new THREE.CylinderGeometry(5,5,TRACK_W,8),
          new THREE.MeshBasicMaterial({color:col}));
        beam.rotation.z=Math.PI/2; g.add(beam);
        const halo=new THREE.Mesh(new THREE.CylinderGeometry(11,11,TRACK_W,8),
          new THREE.MeshBasicMaterial({color:col, transparent:true, opacity:0.22, depthWrite:false}));
        halo.rotation.z=Math.PI/2; g.add(halo);
        // emitters at each end so the beam reads as machinery
        [-1,1].forEach(s=>{ const e=new THREE.Mesh(THREE.RoundedBox(26,34,26), new THREE.MeshLambertMaterial({color:0x1a1033}));
          e.position.set(s*(TRACK_W/2+10), -6, 0); g.add(e); });
        placeAt(g, TRACK_W/2, o.y, o.h);
        courseGroup.add(g);
        o.mesh=g;

      } else if(o.type==='fork'){
        const g=new THREE.Group();
        const len = o.yEnd - o.wallFrom;
        const wall=new THREE.Mesh(THREE.RoundedBox(16, 44, len),
          new THREE.MeshLambertMaterial({color:look.paleWall}));
        wall.position.y=22; wall.castShadow=true; g.add(wall);
        const cap=new THREE.Mesh(THREE.RoundedBox(22, 6, len),
          new THREE.MeshLambertMaterial({color:look.accents[0]}));
        cap.position.y=46; g.add(cap);
        placeAt(g, o.cx, (o.wallFrom+o.yEnd)/2, 0);
        courseGroup.add(g); registerFadeable(wall);
        o.mesh=g;
        // a sign at the split so the choice reads before you are on top of it
        const sign=new THREE.Mesh(THREE.RoundedBox(120, 34, 8),
          new THREE.MeshLambertMaterial({color:0x1a1033}));
        placeAt(sign, o.cx, o.wallFrom-40, 74); courseGroup.add(sign);
        const arrow=new THREE.Mesh(new THREE.ConeGeometry(15, 30, 3),
          new THREE.MeshBasicMaterial({color:accent.getHex()}));
        arrow.rotation.z = -o.risk*Math.PI/2; arrow.rotation.x = Math.PI/2;
        placeAt(arrow, o.cx + o.risk*34, o.wallFrom-44, 74); courseGroup.add(arrow);

      } else if(o.type==='gate'){
        const g=new THREE.Group();
        // solid between the doors, and out to each wall
        const edges=[0, ...o.xs.slice().sort((a,b)=>a-b), TRACK_W];
        for(let i=0;i<edges.length-1;i++){
          let x0 = edges[i], x1 = edges[i+1];
          if(i>0) x0 += o.gapW/2;
          if(i<edges.length-2) x1 -= o.gapW/2;
          const w = x1-x0; if(w<=4) continue;
          const seg=new THREE.Mesh(THREE.RoundedBox(w, o.h, o.d),
            new THREE.MeshLambertMaterial({color:look.paleWall}));
          seg.position.set(x0 + w/2 - TRACK_W/2, o.h/2, 0); seg.castShadow=true; g.add(seg);
          registerFadeable(seg);
          const top=new THREE.Mesh(THREE.RoundedBox(w+4, 7, o.d+4),
            new THREE.MeshLambertMaterial({color:look.accents[0]}));
          top.position.set(seg.position.x, o.h+3, 0); g.add(top);
        }
        // striped posts either side of each door: the bit you run into
        for(const dx of o.xs){
          [-1,1].forEach(sd=>{
            const post=new THREE.Mesh(THREE.RoundedBox(10, o.h+6, o.d+6), look.stripeMat(1));
            post.position.set(dx + sd*(o.gapW/2+5) - TRACK_W/2, (o.h+6)/2, 0); post.castShadow=true; g.add(post);
          });
        }
        placeAt(g, TRACK_W/2, o.y, 0);
        courseGroup.add(g);
        o.mesh=g;

      } else if(o.type==='gems'){
        o.meshes = o.items.map(gm=>{
          const m=new THREE.Mesh(new THREE.OctahedronGeometry(15,0),
            new THREE.MeshPhongMaterial({color:0x7ee8fa, shininess:90, emissive:0x1b6f88}));
          m.castShadow=true;
          placeAt(m, gm.x, gm.y, 32);
          m.userData.baseY = m.position.y;
          courseGroup.add(m);
          return m;
        });

      } else if(o.type==='ring'){
        const g=new THREE.Group();
        const disc=new THREE.Mesh(new THREE.CylinderGeometry(1,1,16,52),
          new THREE.MeshLambertMaterial({color:currentMap.ground}));
        disc.position.y=-8; disc.receiveShadow=true; g.add(disc);
        // A flat annulus, not a second disc: the old lip was a full cylinder
        // slightly wider than the floor, so it painted the whole arena accent.
        // Each band scales itself. Scaling the parent instead applies before the
        // child's own -90 degree rotation, which squashed every ring into a line.
        const bands = [];
        const rim=new THREE.Mesh(new THREE.RingGeometry(0.955, 1.0, 64),
          new THREE.MeshBasicMaterial({color:currentMap.accent, side:THREE.DoubleSide}));
        rim.rotation.x = -Math.PI/2; rim.position.y = 1.4; g.add(rim); bands.push(rim);
        // inner bands, so you can read how much room is left as it closes
        for(const [a,b] of [[0.32,0.36],[0.56,0.60],[0.80,0.84]]){
          const ring=new THREE.Mesh(new THREE.RingGeometry(a, b, 64),
            new THREE.MeshBasicMaterial({color:currentMap.groundAlt, side:THREE.DoubleSide}));
          ring.rotation.x = -Math.PI/2; ring.position.y = 1.0; g.add(ring); bands.push(ring);
        }
        placeAt(g, o.cx, o.y, 0);
        courseGroup.add(g);
        o.mesh=g; o.disc=disc; o.lip=bands;

      } else if(o.type==='chevron'){
        // Built in segments so the paint and the nets follow the bend rather
        // than cutting the corner off it.
        const segs = Math.max(4, Math.round((o.yEnd-o.yStart)/150));
        const segLen = (o.yEnd-o.yStart)/segs;
        const chev = chevronTexture(look.accents[0]);
        const net  = netTexture(look.accents[1]);
        // the chevrons and the netting are the same on every segment, so the
        // slope is two textures and two materials rather than two per segment
        const chevTex = chev.clone(); chevTex.needsUpdate = true;
        chevTex.repeat.set(1, segLen/150);
        const chevMat = new THREE.MeshFloorMaterial({map:chevTex});
        const netTex = net.clone(); netTex.needsUpdate = true;
        netTex.repeat.set(segLen/110, 0.8);
        const netMat = new THREE.MeshLambertMaterial({map:netTex, transparent:true, side:THREE.DoubleSide});
        for(let i=0;i<segs;i++){
          const sy = o.yStart + segLen*(i+0.5);
          const plate = new THREE.Mesh(THREE.RoundedBox(TRACK_W-18, 3, segLen*0.99),
            chevMat);
          plate.receiveShadow = true;
          placeAt(plate, TRACK_W/2, sy, 1.8);
          courseGroup.add(plate);
          if(o.nets) for(const sx of [8, TRACK_W-8]){
            const wall = new THREE.Mesh(new THREE.PlaneGeometry(segLen*0.99, 88), netMat);
            const w = toWorld(sx, sy, 44);
            wall.position.set(w.x, w.y, w.z);
            wall.rotation.y = pathAngle(sy) + Math.PI/2;   // placeAt would drop the quarter turn
            courseGroup.add(wall);
            registerFadeable(wall);      // see through the netting, do not shove the camera

          }
        }

      } else if(o.type==='plank'){
        const deck = look.softMat(0);
        const edge = look.hazardMat(0);
        for(const pl of o.planks){
          const g = new THREE.Group();
          const top = new THREE.Mesh(THREE.RoundedBox(pl.w, 14, o.yEnd-o.yStart), deck);
          top.position.y = -7; top.receiveShadow = true; top.castShadow = true; g.add(top);
          // a rail down each side, so the width of the plank reads from above
          for(const sx of [-1,1]){
            const rail = new THREE.Mesh(THREE.RoundedBox(5, 9, o.yEnd-o.yStart), edge);
            rail.position.set(sx*(pl.w/2-2), 3, 0); g.add(rail);
          }
          placeAt(g, pl.x, (o.yStart+o.yEnd)/2, 0);
          courseGroup.add(g);
          pl.mesh = g;
        }

      } else if(o.type==='discField'){
        const deckMat = new THREE.MeshLambertMaterial({color:currentMap.ground});
        const spokeMat = new THREE.MeshLambertMaterial({color:currentMap.groundAlt});
        for(const c of o.cells){
          const g = new THREE.Group();
          // the turning part: deck, spokes and rim all share the disc's spin
          const spin = new THREE.Group(); g.add(spin);
          const top = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r*0.97, 16, 40), deckMat);
          top.position.y = -8; top.receiveShadow = true; spin.add(top);
          for(let i=0;i<6;i++){
            const spoke = new THREE.Mesh(THREE.RoundedBox(c.r*1.90, 3, 16), spokeMat);
            spoke.position.y = 0.6; spoke.rotation.y = i*Math.PI/6; spin.add(spoke);
          }
          const rim = new THREE.Mesh(new THREE.TorusGeometry(c.r, 7, 8, 40), look.hazardMat(0));
          rim.rotation.x = Math.PI/2; rim.position.y = 1.5; spin.add(rim);
          // the arm turns on its own, at its own rate and the other way
          const armPivot = new THREE.Group(); g.add(armPivot);
          if(!c.noArm){
            const arm = new THREE.Mesh(THREE.RoundedBox(c.r*0.94, 16, 14), look.stripeMat(1));
            arm.position.set(c.r*0.47, 14, 0); arm.castShadow = true; armPivot.add(arm);
          }
          const hub = new THREE.Mesh(new THREE.CylinderGeometry(12, 15, 30, 14), look.hazardMat(2));
          hub.position.y = 15; g.add(hub);
          placeAt(g, c.x, c.y, 0);
          courseGroup.add(g);
          c.mesh = g; c.spin = spin; c.armPivot = armPivot;
        }

      } else if(o.type==='disc'){
        const g=new THREE.Group();
        const top=new THREE.Mesh(new THREE.CylinderGeometry(o.r,o.r,18,60),
          new THREE.MeshLambertMaterial({color:currentMap.ground}));
        top.position.y=-9; top.receiveShadow=true; g.add(top);
        // spokes, so you can actually see the thing turning under you
        for(let i=0;i<8;i++){
          const spoke=new THREE.Mesh(THREE.RoundedBox(o.r*0.98, 3, 26),
            new THREE.MeshLambertMaterial({color:currentMap.groundAlt}));
          spoke.position.set(Math.cos(i*Math.PI/4)*o.r/2, 0.6, Math.sin(i*Math.PI/4)*o.r/2);
          spoke.rotation.y = -i*Math.PI/4; g.add(spoke);
        }
        const rim=new THREE.Mesh(new THREE.TorusGeometry(o.r, 9, 8, 60),
          new THREE.MeshLambertMaterial({color:currentMap.accent}));
        rim.rotation.x=Math.PI/2; rim.position.y=2; g.add(rim);
        placeAt(g, o.cx, o.y, 0);
        courseGroup.add(g);
        o.mesh=g;

      //<<shelved:mesh-mover>>
      } else if(o.type==='crumble'){
        o.meshes = o.slabs.map(sl=>{
          const g=new THREE.Group();
          const top=new THREE.Mesh(THREE.RoundedBox(sl.w, 12, sl.d),
            new THREE.MeshLambertMaterial({color:accent.getHex()}));
          top.position.y=-6; top.castShadow=true; top.receiveShadow=true; g.add(top);
          const skirt=new THREE.Mesh(THREE.RoundedBox(sl.w-14, 26, sl.d-14),
            new THREE.MeshLambertMaterial({color:0x1a1033}));
          skirt.position.y=-24; g.add(skirt);
          placeAt(g, sl.x, sl.y, o.h);
          courseGroup.add(g);
          return g;
        });

      //<<shelved:mesh-log-roller>>
      } else if(o.type==='cannon'){
        const barrelMat=look.hazardMat(1);
        const bandMat=look.stripeMat(1);
        o.meshes=o.items.map(it=>{
          const g=new THREE.Group();
          const barrel=new THREE.Mesh(new THREE.CylinderGeometry(it.r*1.45, it.r*1.2, 92, 14), barrelMat);
          barrel.rotation.z=Math.PI/2; barrel.castShadow=true; g.add(barrel);
          const rim=new THREE.Mesh(new THREE.CylinderGeometry(it.r*1.5, it.r*1.5, 10, 14), bandMat);
          rim.rotation.z=Math.PI/2; rim.position.x=-it.side*28; g.add(rim);
          const mount=new THREE.Mesh(THREE.RoundedBox(26,30,40), bandMat);
          mount.position.set(it.side*30,-18,0); g.add(mount);
          // muzzle points into the lane
          placeAt(g, it.side<0 ? 30 : TRACK_W-30, it.y, 54);
          g.rotation.y += it.side<0 ? 0 : Math.PI;
          courseGroup.add(g);
          // A ball crosses in under a second from off to one side, so the shot has
          // to be telegraphed on the floor or it is not a fair dodge.
          const warn = new THREE.Mesh(THREE.RoundedBox(TRACK_W-20, 2, 34),
            new THREE.MeshBasicMaterial({color:0xff3b3b, transparent:true, opacity:0, depthWrite:false}));
          placeAt(warn, TRACK_W/2, it.y, 1.2);
          warn.visible = false; courseGroup.add(warn);
          return {group:g, barrel, warn};
        });

      } else if(o.type==='pendulum'){
        const g=new THREE.Group();
        const barMat=new THREE.MeshLambertMaterial({color:0x1a1033});
        const beam=new THREE.Mesh(THREE.RoundedBox(TRACK_W+40,12,12), barMat);
        placeAt(beam, TRACK_W/2, o.y, o.pivotH); courseGroup.add(beam);
        const rod=new THREE.Mesh(new THREE.CylinderGeometry(3,3,o.armLen,8), barMat);
        rod.castShadow=true; g.add(rod); registerFadeable(rod);
        // A ball 27..38 across swinging the full width of the track at head
        // height. Nothing in the game is better placed to hide the racer from
        // the camera at the moment it matters, and it faded nothing.
        const ball=new THREE.Mesh(new THREE.SphereGeometry(o.r,16,12), look.stripeMat(0));
        ball.castShadow=true; g.add(ball); registerFadeable(ball);
        courseGroup.add(g);
        o.mesh=g; o.rod=rod; o.ball=ball;

      } else if(o.type==='bumper'){
        const capMat=look.hazardMat(2);
        const postMat=new THREE.MeshLambertMaterial({color:0xfff8ec});
        const ringMat=look.stripeMat(2);
        o.meshes=o.items.map(it=>{
          const g=new THREE.Group();
          const post=new THREE.Mesh(new THREE.CylinderGeometry(it.r*0.86,it.r,30,16), postMat);
          post.position.y=15; post.castShadow=true; post.receiveShadow=true; g.add(post);
          const cap=new THREE.Mesh(new THREE.SphereGeometry(it.r*0.9,16,10,0,Math.PI*2,0,Math.PI/2), capMat);
          cap.position.y=30; cap.castShadow=true; g.add(cap);
          const ring=new THREE.Mesh(new THREE.TorusGeometry(it.r*0.95,2.4,8,20), ringMat);
          ring.rotation.x=Math.PI/2; ring.position.y=31; g.add(ring);
          placeAt(g, it.x, o.y, 0);
          courseGroup.add(g);
          return g;
        });

      } else if(o.type==='slime'){
        const g=new THREE.Group();
        // The sheet sits a whisker above the floor, so it reads as a coating
        // rather than as a hole in the ground.
        const sheet=new THREE.Mesh(THREE.RoundedBox(o.w, 4, o.len),
          new THREE.MeshFloorMaterial({color:accent.getHex()}));
        sheet.position.y=2.0; sheet.receiveShadow=true; g.add(sheet);
        // Chevrons pointing the way it flows. This is the one thing a player
        // has to read before stepping on, and the reason it is not a colour.
        const arrowMat=new THREE.MeshBasicMaterial({color:0xfff8ec});
        const rows=Math.max(2, Math.round(o.len/120));
        for(let i=0;i<rows;i++){
          for(let k=-2;k<=2;k++){
            const bar=new THREE.Mesh(THREE.RoundedBox(46,3,11), arrowMat);
            bar.position.set(k*118, 4.3, -o.len/2 + o.len*(i+0.5)/rows);
            bar.rotation.y = o.flowX>0 ? -0.55 : 0.55;
            g.add(bar);
          }
        }
        placeAt(g, o.cx, o.y, 0); courseGroup.add(g); o.mesh=g;

      } else if(o.type==='bounce'){
        const padMat=look.softMat(1);
        const rimMat=new THREE.MeshLambertMaterial({color:0xfff8ec});
        o.meshes=o.items.map(it=>{
          const g=new THREE.Group();
          const pad=new THREE.Mesh(new THREE.CylinderGeometry(it.r, it.r*0.80, 14, 18), padMat);
          pad.position.y=7; pad.receiveShadow=true; g.add(pad);
          const rim=new THREE.Mesh(new THREE.TorusGeometry(it.r, 4.5, 8, 20), rimMat);
          rim.rotation.x=Math.PI/2; rim.position.y=14; g.add(rim);
          placeAt(g, it.x, it.y, 0); courseGroup.add(g);
          return g;
        });

      } else if(o.type==='boost'){
        const g=new THREE.Group();
        const pad=new THREE.Mesh(THREE.RoundedBox(o.w,3,o.len),
          new THREE.MeshBasicMaterial({color:accent.getHex()}));
        pad.position.y=1.6; g.add(pad);
        // chevrons pointing down the track
        const chevMat=new THREE.MeshBasicMaterial({color:0xfff8ec});
        const n=3;
        for(let i=0;i<n;i++){
          const z=-o.len/2 + o.len*(i+0.5)/n;
          [-1,1].forEach(sd=>{
            const bar=new THREE.Mesh(THREE.RoundedBox(o.w*0.42,4,14), chevMat);
            bar.position.set(sd*o.w*0.2, 3.2, z);
            bar.rotation.y = sd*0.62;
            g.add(bar);
          });
        }
        placeAt(g, o.cx, o.y, 0);
        courseGroup.add(g);
        o.mesh=g;

      } else if(o.type==='spinlaser'){
        const g=new THREE.Group();
        // Beam Team stacks a low ring and a high ring on one spindle, so the
        // second of a pair draws its arms and leaves the post alone.
        if(o.hub !== false){
          const hh = o.post || 52;
          const hub=new THREE.Mesh(new THREE.CylinderGeometry(24,30,hh,14),
            new THREE.MeshPhongMaterial({color:0x1f2937, shininess:30}));
          hub.position.y=hh/2; hub.castShadow=true; g.add(hub);
          const lamp=new THREE.Mesh(new THREE.SphereGeometry(11,12,10),
            new THREE.MeshBasicMaterial({color:0xa3e635}));
          lamp.position.y=hh+4; g.add(lamp);
        }
        const arms=new THREE.Group(); arms.position.y=o.h; g.add(arms);
        for(let i=0;i<o.arms;i++){
          const arm=new THREE.Group(); arm.rotation.y = i*(Math.PI*2/o.arms); arms.add(arm);
          const col = o.h >= 24 ? 0xff4fa3 : 0xa3e635;   // pink you duck, green you jump
          const beam=new THREE.Mesh(new THREE.CylinderGeometry(4,4,o.len,8),
            new THREE.MeshBasicMaterial({color:col}));
          beam.rotation.z=Math.PI/2; beam.position.x=o.len/2; arm.add(beam);
          const halo=new THREE.Mesh(new THREE.CylinderGeometry(9,9,o.len,8),
            new THREE.MeshBasicMaterial({color:col, transparent:true, opacity:0.20, depthWrite:false}));
          halo.rotation.z=Math.PI/2; halo.position.x=o.len/2; arm.add(halo);
          const tip=new THREE.Mesh(new THREE.SphereGeometry(8,10,8),
            new THREE.MeshBasicMaterial({color:col}));
          tip.position.x=o.len; arm.add(tip);
        }
        placeAt(g, o.cx, o.y, 0);
        courseGroup.add(g);
        o.mesh=g; o.arms3d=arms;

      //<<shelved:mesh-spinlaser>>
      } else if(o.type==='shortcut'){
        const deckMat = look.softMat(0);                  // a reward, not a threat: soft
        const railMat = new THREE.MeshLambertMaterial({color:0x1a1033});
        const step = 40;
        for(let z=o.yStart; z<o.yEnd; z+=step){
          const k0 = clamp((z-o.yStart)/o.rampLen, 0, 1);
          const seg = new THREE.Mesh(THREE.RoundedBox(o.w, 10, step+2), deckMat);
          placeAt(seg, o.cx, z+step/2, o.h*k0 - 5);
          seg.receiveShadow = true; courseGroup.add(seg);
          // legs, so it reads as a raised deck rather than a floating strip
          if(k0>=1 && ((z-o.yStart)/step)%3===0){
            const leg = new THREE.Mesh(THREE.RoundedBox(10, o.h, 10), railMat);
            placeAt(leg, o.cx, z+step/2, o.h/2 - 6); courseGroup.add(leg);
          }
          // a rail on the open side only; the other side is the wall
          const railX = o.cx + (o.cx > TRACK_W/2 ? -o.w/2 : o.w/2);
          const rail = new THREE.Mesh(THREE.RoundedBox(4, 16, step+2), railMat);
          placeAt(rail, railX, z+step/2, o.h*k0 + 8); courseGroup.add(rail);
        }
        // chevrons on the deck, so it reads as the fast line
        for(let i=0;i<4;i++){
          const z = o.yStart + o.rampLen + (o.yEnd-o.yStart-o.rampLen)*(i+0.5)/4;
          const ch = new THREE.Mesh(THREE.RoundedBox(o.w*0.5, 3, 12),
            new THREE.MeshBasicMaterial({color:0xfff8ec}));
          placeAt(ch, o.cx, z, o.h + 1.5); courseGroup.add(ch);
        }

      } else if(o.type==='ramp'){
        // a wedge: flat at the bottom, `height` at the far lip
        const len=o.yEnd-o.yStart, w=o.width, hgt=o.height;
        const geo=new THREE.BufferGeometry();
        const x0=-w/2, x1=w/2, z0=-len/2, z1=len/2;
        const v=[
          x0,0,z0,  x1,0,z0,  x1,hgt,z1,   x0,0,z0,  x1,hgt,z1,  x0,hgt,z1,   // slope
          x0,0,z0,  x0,hgt,z1, x0,0,z1,                                        // left side
          x1,0,z0,  x1,0,z1,   x1,hgt,z1,                                      // right side
          x0,0,z1,  x0,hgt,z1, x1,hgt,z1,  x0,0,z1,  x1,hgt,z1,  x1,0,z1,      // back face
          x0,0,z0,  x0,0,z1,   x1,0,z1,    x0,0,z0,  x1,0,z1,    x1,0,z0       // underside
        ];
        geo.setAttribute('position', new THREE.Float32BufferAttribute(v,3));
        geo.computeVertexNormals();
        const mesh=new THREE.Mesh(geo, new THREE.MeshLambertMaterial({color:softAccent(look.accents[0]), side:THREE.DoubleSide}));
        mesh.receiveShadow=true; mesh.castShadow=true;
        const g=new THREE.Group(); g.add(mesh);
        const lip=new THREE.Mesh(THREE.RoundedBox(w+8,6,10), new THREE.MeshLambertMaterial({color:0x1a1033}));
        lip.position.set(0,hgt+2,len/2); g.add(lip);
        placeAt(g, o.cx, (o.yStart+o.yEnd)/2, 0);
        courseGroup.add(g);
        o.mesh=g;
      }
    }
    buildFinishArea();
    if(currentMap.mode==='boulder'){ boulderTimer=1.2; }
  }

  let _finishBanner = null;
  function finishBanner(){
    if(!_finishBanner){
      const cv=document.createElement('canvas'); cv.width=512; cv.height=104; const g=cv.getContext('2d');
      g.fillStyle='#ff4fa3'; g.fillRect(0,0,512,104);
      g.fillStyle='#ffffff'; g.font='bold 78px Fredoka, Arial, sans-serif'; g.textAlign='center'; g.textBaseline='middle';
      g.fillText('FINISH', 256, 56);
      _finishBanner = new THREE.CanvasTexture(cv); _finishBanner.colorSpace = THREE.SRGBColorSpace;
    }
    return _finishBanner;
  }
  // The line itself plus the pen you can wander in once you are over it.
  function buildFinishArea(){
    const z = trackLength;
    // ---- a wide chequered apron running up to the arch, and on past it, so
    // the whole finish reads as one pad rather than a line drawn on the course
    {
      const fin = (courseScript||[]).find(s=>s.type==='finish');
      const runIn = fin ? Math.min(fin.len, 520) : 400;
      const chk = checkerTexture('#ffffff', '#1a1033', 6);
      // one texture and one material for the whole apron -- and one swept
      // strip painted on the floor, like the start apron (18_coursemesh.js)
      const finTex = chk.clone(); finTex.needsUpdate = true;
      const finMat = floorPaint(new THREE.MeshFloorMaterial({map:finTex, side:THREE.DoubleSide}), 1);
      const apron = new THREE.Mesh(ribbonStrip(z - runIn, z + FINISH_ZONE,
        s=>[toWorld(7, s, FLOOR_PAINT_TOP), toWorld(TRACK_W-7, s, FLOOR_PAINT_TOP)],
        s=>[[0, s/90], [4, s/90]]), finMat);
      apron.receiveShadow = true; courseGroup.add(apron);
    }
    const line=new THREE.Mesh(THREE.RoundedBox(TRACK_W,2.4,14),
      floorPaint(new THREE.MeshLambertMaterial({map:checkerTexture('#ffffff','#1a1033',1)}), 2));
    placeOnSlope(line, TRACK_W/2, z, FLOOR_PAINT_TOP + 0.3 - 1.2); courseGroup.add(line);

    const postMat=new THREE.MeshLambertMaterial({map:stripeTexture('#ffffff', (courseLook?courseLook.accents[0]:currentMap.accent))});
    const barMat =new THREE.MeshLambertMaterial({color:0x1a1033});
    [-1,1].forEach(s=>{
      const post=new THREE.Mesh(new THREE.CylinderGeometry(9,11,150,10), postMat);
      placeAt(post, TRACK_W/2 + s*(TRACK_W/2-14), z, 75); post.castShadow=true; courseGroup.add(post);
    });
    // an arch with a chequered banner, and the word on it
    // It fades, because the moment it is in the way is the moment the racer
    // crosses under it: from there to the end of the pen the arch stands
    // squarely between the chase camera and the bean, so the last thing you saw
    // of your own finish was a chequered beam.
    const chk=checkerTexture('#ffffff','#1a1033',8); chk.repeat.set(TRACK_W/64, 1);
    const beam=new THREE.Mesh(THREE.RoundedBox(TRACK_W-8,44,16), new THREE.MeshLambertMaterial({map:chk}));
    placeAt(beam, TRACK_W/2, z, 150); beam.castShadow=true; courseGroup.add(beam); registerFadeable(beam);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(200, 40), new THREE.MeshBasicMaterial({map:finishBanner(), transparent:true, side:THREE.DoubleSide}));
    placeAt(sign, TRACK_W/2, z-9, 150); sign.rotation.y = Math.PI; courseGroup.add(sign);
    const trim=new THREE.Mesh(THREE.RoundedBox(TRACK_W+4,6,20), barMat);
    placeAt(trim, TRACK_W/2, z, 175); courseGroup.add(trim);
    // bunting either side of the pen so the area reads as somewhere to stand
    for(let i=0;i<10;i++){
      const f=new THREE.Mesh(new THREE.ConeGeometry(7,16,4),
        new THREE.MeshLambertMaterial({color:i%2?0xffcb3d:0x23e6c9}));
      placeAt(f, TRACK_W/2 + (i%2?-1:1)*(TRACK_W/2-24), z + 40 + i*24, 96);
      f.rotation.x=Math.PI; courseGroup.add(f);
    }
  }

  function spawnBoulder(){
    const lead = racers.reduce((m,r)=>Math.max(m, r.y), 0);
    const r = rand(34,54);
    const b = { x: rand(r+30, TRACK_W-r-30), y: Math.min(lead+1500, trackLength+400), r,
                speed: rand(400,560)*(round>=2?1.15:1), spin:0 };
    const g = new THREE.Group();
    const ball=new THREE.Mesh(new THREE.DodecahedronGeometry(r,0), rockMat); ball.castShadow=true; g.add(ball);
    const cap=new THREE.Mesh(new THREE.DodecahedronGeometry(r*0.72,0), rockTopMat); cap.position.set(r*0.2,r*0.35,0); g.add(cap);
    placeAt(g, b.x, b.y, r-4);
    b.mesh=g; b.ball=ball;
    courseGroup.add(g);
    boulders.push(b);
  }

  // ============================================================
  // WHAT A MINIGAME LOOKS LIKE, AND WHAT A JOINER IS TOLD ABOUT IT
  // ============================================================
  // updateMinigames is the simulation, and only a host or a solo game runs it:
  // a joiner's loop runs clientTick instead. It used to draw as it went -- the
  // tiles wobbling and dropping, the ring's scale, the cannon's warning, the
  // cannonballs' meshes -- so a joiner drew none of it, and since the state
  // message carried no obstacle state either, a joiner's walls, arms, ring,
  // floors, logs, decks, slabs and doors all stood as they were at the gun.
  //
  // Now the drawing is presentMinigames, which syncObstacles runs every frame
  // on both, so a host and a joiner render the same state by the same code.
  // The host puts that state in its existing periodic 'state' message
  // (netObsSnapshot), the joiner applies it (applyObsSnapshot) and carries the
  // moving parts on between messages by the host's own rules (netObsTick).
  // A client that predates this ignores the extra field; a joiner of a host
  // that predates it gets no field and nothing changes.
  const shotMeshes = [];                  // [{b, m}]: the mesh drawn for each ball in flight
  function presentFloor(cells, fuseTime, warnAt, warnHex, wobRate, wobAmp, dropBy, axis, turnBy, t){
    for(const c of cells){
      const m = c.mesh; if(!m) continue;
      if(c.touched && !c.gone){
        m.position.y = c.baseY + Math.sin(t*wobRate)*Math.max(0, 1-c.fuse/fuseTime)*wobAmp;
        if(c.topMat && c.topMat.color) c.topMat.color.setHex(c.fuse<warnAt ? warnHex : 0xffd166);
      } else if(c.gone){
        if(m.visible){
          const d = Math.min(1, c.drop||0);
          m.position.y = c.baseY - d*dropBy; m.rotation[axis] = d*turnBy;
          if(d >= 1) m.visible = false;
        }
      } else if(!m.visible || m.position.y !== c.baseY || m.rotation[axis] !== 0){
        // rebuilt: back into place
        m.visible = true; m.rotation[axis] = 0; m.position.y = c.baseY;
        if(c.topMat && c.topMat.color) c.topMat.color.setHex(0xffffff);
      }
    }
  }
  function presentMinigames(t){
    for(const o of obstacles){
      if(o.type==='gems'){
        if(o.meshes) o.meshes.forEach((m,i)=>{
          const g=o.items[i];
          m.visible = !g.taken;
          if(!g.taken){
            m.rotation.y = t*2 + g.spin; m.rotation.x = 0.5;
            m.position.y = m.userData.baseY + Math.sin(t*3+g.spin)*5;
          }
        });
      } else if(o.type==='ring'){
        if(o.disc){ o.disc.scale.set(o.r, 1, o.r); for(const m of o.lip) m.scale.set(o.r, o.r, 1); }
      } else if(o.type==='disc'){
        if(o.mesh) o.mesh.rotation.y = pathAngle(o.y) + (o.ang||0);
      } else if(o.type==='doors'){
        if(o.meshes) o.items.forEach((it,i)=>{ const m=o.meshes[i]; if(it.broken && m && m.panel && m.panel.visible) m.panel.visible=false; });
      } else if(o.type==='cannon'){
        // Drawn when the fuse moved, which is exactly the cannons the pack is
        // near: one far down the course keeps the warning it had.
        if(o.meshes) o.items.forEach((it,i)=>{
          const m = o.meshes[i];
          if(!m || !m.warn || it.cool === it._drawnCool) return;
          // the first sight of it only notes where the fuse stands: a fuse
          // that never moves never lights anything
          if(it._drawnCool === undefined){ it._drawnCool = it.cool; return; }
          it._drawnCool = it.cool;
          const lead = it.cool;                       // seconds until this one fires
          if(lead <= CANNON_WARN && lead > 0){
            m.warn.visible = true;
            // flash faster as it gets closer, so urgency reads without a HUD
            const urgency = 1 - lead/CANNON_WARN;
            m.warn.material.opacity = (0.18 + 0.42*urgency) * (0.55 + 0.45*Math.sin(t*(14+urgency*22)));
          } else { m.warn.visible = false; }
        });
      } else if(o.type==='tilefield'){
        presentFloor(o.tiles, o.fuseTime, o.fuseTime*0.4, 0xff7a5c, 26, 2.2, 140, 'z', 0.5, t);
      } else if(o.type==='hexfield'){
        presentFloor(o.cells, o.fuseTime, hexFuse(o)*0.45, 0xff5a4d, 30, 2.4, 160, 'x', 0.6, t);
      }
    }
    // cannonballs: a mesh for each one in flight, gone with it
    for(let i=shotMeshes.length-1;i>=0;i--){
      const e = shotMeshes[i];
      if(shots.indexOf(e.b) < 0){ if(e.m.parent) e.m.parent.remove(e.m); shotMeshes.splice(i,1); }
    }
    for(const b of shots){
      if(!b.mesh){
        const g = new THREE.Mesh(new THREE.SphereGeometry(b.r,14,10), shotMaterial());
        g.castShadow = true; courseGroup.add(g); b.mesh = g; shotMeshes.push({b, m:g});
        const co = b.src && obstacles[b.src[0]];
        const cm = co && co.type==='cannon' && co.meshes && co.meshes[b.src[1]];
        if(cm) cm.recoil = 1;
      }
      placeAt(b.mesh, b.x, b.y, b.r+26); b.mesh.rotation.z = -(b.spin||0);
    }
  }

  // ---- the host's side: the stateful part of the course, compactly ----
  // Continuous values in every message. Tiles and hexes are two bits a cell
  // (touched, gone): all of them about once a second, and in between only the
  // cells that changed, so a message that goes missing costs at most a second.
  let netSeq = 0, netShotId = 0, netClock = 0;
  // The obstacle list a snapshot has been heard for. A joiner of a host that
  // sends none -- one that predates this -- never carries anything on.
  let netHeardFor = null;
  const NET_FULL_EVERY = 22;              // at the 45ms cadence, about a second
  const netQ2 = (v)=>Math.round(v*100)/100, netQ4 = (v)=>Math.round(v*1e4)/1e4;
  function netCellState(c){ return (c.touched?1:0) | (c.gone?2:0); }
  function netPack(states){
    const bytes = new Uint8Array(Math.ceil(states.length/4));
    for(let i=0;i<states.length;i++) bytes[i>>2] |= states[i] << ((i&3)*2);
    let s = ''; for(let i=0;i<bytes.length;i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function netUnpack(str, n){
    const raw = atob(str), out = new Array(n);
    for(let i=0;i<n;i++) out[i] = (raw.charCodeAt(i>>2) >> ((i&3)*2)) & 3;
    return out;
  }
  function netObsSnapshot(){
    const full = (netSeq++ % NET_FULL_EVERY) === 0;
    const o = [];
    obstacles.forEach((ob,i)=>{
      switch(ob.type){
        case 'blockwall': if(ob.travel) o.push([i,'w', netQ2(ob.wy), netQ2(ob.travel), ob.gapStart]); break;
        case 'spinlaser': if(ob.ramp) o.push([i,'b', netQ4(ob.ang||0), netQ4(ob.speed)]); break;
        case 'ring': o.push([i,'r', netQ2(ob.r), netQ2(ob.wait)]); break;
        case 'disc': o.push([i,'d', netQ4(ob.ang||0)]); break;
        case 'logroll': o.push([i,'l'].concat(ob.logs.map(l=>netQ4(l.ang)))); break;
        case 'tiltdeck': { const e = [i,'t']; for(const d of ob.decks) e.push(netQ4(d.tx), netQ4(d.ty)); o.push(e); break; }
        case 'crumble': {
          // only the slabs that are not simply standing there; the rest are
          const e = [i,'c'];
          ob.slabs.forEach((sl,k)=>{ if(sl.touched || sl.gone || sl.drop>0 || sl.fuse>0)
            e.push(k, netQ4(sl.fuse), netQ4(sl.back||0), netQ4(sl.drop||0), (sl.touched?1:0)|(sl.gone?2:0)); });
          o.push(e); break;
        }
        case 'tilefield': case 'hexfield': {
          const cells = ob.type==='tilefield' ? ob.tiles : ob.cells;
          const now = cells.map(netCellState), e = [i, ob.type==='tilefield' ? 'T' : 'H'];
          if(full || !ob._netSent) e.push(1, netPack(now));
          else { const ch = []; for(let k=0;k<now.length;k++) if(now[k]!==ob._netSent[k]) ch.push(k, now[k]); e.push(0, ch); }
          ob._netSent = now;
          // how far gone each shaking cell is, which is what the shake and the colour read
          const fz = []; cells.forEach((c,k)=>{ if(c.touched && !c.gone) fz.push(k, netQ2(c.fuse)); });
          e.push(fz); o.push(e); break;
        }
        case 'doors': { let m = 0; ob.items.forEach((it,k)=>{ if(it.broken) m |= 1<<k; }); o.push([i,'o', m]); break; }
        case 'gems': o.push([i,'g', ob.items.map(g=>g.taken?1:0).join('')]); break;
        case 'cannon': o.push([i,'k'].concat(ob.items.map(it=>netQ4(it.cool)))); break;
      }
    });
    const s = [];
    for(const b of shots){
      if(!b.id) b.id = ++netShotId;
      s.push(b.id, netQ2(b.x), netQ2(b.y), b.r, netQ2(b.vx), netQ4(b.spin||0), b.src?b.src[0]:-1, b.src?b.src[1]:-1);
    }
    return { f:full?1:0, o, s };
  }

  // ---- the joiner's side ----
  function netSetCell(c, st){
    const touched = !!(st&1), gone = !!(st&2);
    if(gone && !c.gone) c.drop = 0;                        // it starts to fall now, here
    if(!gone && c.gone){ c.drop = 0; c.fuse = -1; }        // rebuilt
    c.touched = touched; c.gone = gone;
  }
  function applyObsSnapshot(snap){
    if(!snap || !Array.isArray(snap.o)) return;
    netHeardFor = obstacles;
    const num = (v)=> typeof v === 'number' && isFinite(v);
    for(const e of snap.o){
      if(!Array.isArray(e)) continue;
      const ob = obstacles[e[0]]; if(!ob) continue;
      switch(e[1]){
        case 'w':
          if(ob.type!=='blockwall' || !ob.travel) break;
          if(num(e[2])) ob.wy = e[2]; if(num(e[3])) ob.travel = e[3];
          if(num(e[4]) && e[4] !== ob.gapStart){
            ob.gapStart = e[4];
            const it = wallItems(ob);
            for(let k=0;k<ob.items.length && k<it.length;k++) ob.items[k].x = it[k].x;
          }
          break;
        case 'b': if(ob.type==='spinlaser'){ if(num(e[2])) ob.ang = e[2]; if(num(e[3])) ob.speed = e[3]; } break;
        case 'r': if(ob.type==='ring'){ if(num(e[2])) ob.r = e[2]; if(num(e[3])) ob.wait = e[3]; } break;
        case 'd': if(ob.type==='disc' && num(e[2])) ob.ang = e[2]; break;
        case 'l': if(ob.type==='logroll') ob.logs.forEach((l,k)=>{ if(num(e[2+k])) l.ang = e[2+k]; }); break;
        case 't':
          // the deck's lean follows the weight on it, which only the host
          // knows: carry on at the rate the last two messages showed, briefly
          if(ob.type==='tiltdeck') ob.decks.forEach((d,k)=>{
            const tx = e[2+2*k], ty = e[3+2*k]; if(!num(tx) || !num(ty)) return;
            const el = d._netT===undefined ? 0 : netClock - d._netT;
            d._vx = el > 0.001 ? (tx - d._nx)/el : 0; d._vy = el > 0.001 ? (ty - d._ny)/el : 0;
            d._nx = tx; d._ny = ty; d._netT = netClock; d._ext = 0;
            d.tx = tx; d.ty = ty;
          });
          break;
        case 'c':
          if(ob.type==='crumble'){
            const listed = new Set();
            for(let k=2;k+4<e.length;k+=5){
              const sl = ob.slabs[e[k]]; if(!sl) continue; listed.add(e[k]);
              if(num(e[k+1])) sl.fuse = e[k+1]; if(num(e[k+2])) sl.back = e[k+2]; if(num(e[k+3])) sl.drop = e[k+3];
              sl.touched = !!(e[k+4]&1); sl.gone = !!(e[k+4]&2);
            }
            ob.slabs.forEach((sl,k)=>{ if(!listed.has(k)){ sl.touched = false; sl.gone = false; sl.drop = 0; sl.fuse = -1; } });
          }
          break;
        case 'T': case 'H': {
          const cells = (e[1]==='T' && ob.type==='tilefield') ? ob.tiles : (e[1]==='H' && ob.type==='hexfield') ? ob.cells : null;
          if(!cells) break;
          if(e[2]===1 && typeof e[3]==='string'){ const st = netUnpack(e[3], cells.length); cells.forEach((c,k)=>netSetCell(c, st[k])); }
          else if(Array.isArray(e[3])) for(let k=0;k+1<e[3].length;k+=2){ const c = cells[e[3][k]]; if(c) netSetCell(c, e[3][k+1]); }
          if(Array.isArray(e[4])) for(let k=0;k+1<e[4].length;k+=2){ const c = cells[e[4][k]]; if(c && num(e[4][k+1])) c.fuse = e[4][k+1]; }
          break;
        }
        case 'o': if(ob.type==='doors' && num(e[2])) ob.items.forEach((it,k)=>{ if(e[2] & (1<<k)) it.broken = true; }); break;
        case 'g': if(ob.type==='gems' && typeof e[2]==='string') ob.items.forEach((g,k)=>{ g.taken = e[2][k]==='1'; }); break;
        case 'k': if(ob.type==='cannon') ob.items.forEach((it,k)=>{ if(num(e[2+k])) it.cool = e[2+k]; }); break;
      }
    }
    if(Array.isArray(snap.s)){
      const keep = new Set();
      for(let k=0;k+7<snap.s.length;k+=8){
        const q = snap.s, id = q[k];
        if(!num(q[k+1]) || !num(q[k+2]) || !num(q[k+3]) || !num(q[k+4])) continue;
        keep.add(id);
        let b = shots.find(x=>x.id===id);
        if(!b){ b = { id, spin:0 }; if(q[k+6] >= 0) b.src = [q[k+6], q[k+7]]; shots.push(b); }
        b.x = q[k+1]; b.y = q[k+2]; b.r = q[k+3]; b.vx = q[k+4]; if(num(q[k+5])) b.spin = q[k+5];
      }
      for(let k=shots.length-1;k>=0;k--) if(!keep.has(shots[k].id)) shots.splice(k,1);
    }
  }
  // Between messages the course keeps moving on a joiner's screen by the
  // host's own rules. Nothing here decides anything: a tile shakes until the
  // host says it went, and every message puts the joiner back on the host.
  function netObsTick(dt){
    netClock += dt;
    if(state!=='racing' || netHeardFor !== obstacles) return;
    let packBack = 1e9, packFront = -1e9;
    for(const r of racers){ if(r.y < packBack) packBack = r.y; if(r.y > packFront) packFront = r.y; }
    for(const o of obstacles){
      if(o.type==='blockwall' && o.travel){
        o.travel = Math.min(o.travelMax, o.travel + o.ramp*dt);
        o.wy -= o.travel*dt;
        if(o.wy < o.wrapLo) o.wy += o.cycle;           // the new gap comes with the next message
      } else if(o.type==='spinlaser' && o.ramp){
        const dir = Math.sign(o.speed) || 1;
        if(Math.abs(o.speed) < o.speedMax) o.speed += dir*o.ramp*dt;
        o.ang = (o.ang||0) + o.speed*dt;
      } else if(o.type==='ring'){
        if(o.wait > 0) o.wait -= dt; else o.r = Math.max(o.rMin, o.r - o.shrink*dt);
      } else if(o.type==='disc'){
        o.ang = (o.ang||0) + o.speed*dt;
      } else if(o.type==='logroll'){
        for(const l of o.logs) l.ang += l.spin*dt;
      } else if(o.type==='tiltdeck'){
        for(const d of o.decks){
          if(d._netT===undefined || d._ext >= 0.1) continue;
          const k = Math.min(dt, 0.1 - d._ext); d._ext += dt;
          d.tx = clamp(d.tx + d._vx*k, -1, 1); d.ty = clamp(d.ty + d._vy*k, -1, 1);
        }
      } else if(o.type==='crumble'){
        for(const sl of o.slabs){
          if(sl.fuse > 0){ sl.fuse -= dt; if(sl.fuse <= 0){ sl.gone = true; sl.back = o.respawnTime; } }
          if(sl.gone){
            sl.drop = Math.min(1, sl.drop + dt*2.4);
            sl.back -= dt;
            if(sl.back <= 0){ sl.gone = false; sl.touched = false; sl.fuse = -1; }
          } else if(sl.drop > 0) sl.drop = Math.max(0, sl.drop - dt*3.2);
        }
      } else if(o.type==='tilefield' || o.type==='hexfield'){
        const cells = o.type==='tilefield' ? o.tiles : o.cells, rate = o.type==='tilefield' ? 1.6 : 1.5;
        for(const c of cells){
          if(c.touched && !c.gone) c.fuse = Math.max(0, c.fuse - dt);
          else if(c.gone && c.drop < 1) c.drop += dt*rate;
        }
      } else if(o.type==='cannon'){
        for(const it of o.items){
          if(it.y > packFront+2200 || it.y < packBack-700) continue;
          it.cool -= dt; if(it.cool <= 0) it.cool = it.interval;
        }
      }
    }
    for(const b of shots){ b.x += b.vx*dt; b.spin = (b.spin||0) + b.vx*dt/b.r; }
  }

  function updateMinigames(dt,t){
    for(const o of obstacles){
      if(o.type==='mover'){
        const x = moverX(o,t);
        o.dx = (o._px===null || o._px===undefined) ? 0 : x - o._px;
        o._px = x;
      } else if(o.type==='blockwall' && o.travel){
        // Faster for as long as the round lasts, and a new gap every lap: a
        // wall you have already read is not a wall you get to read twice.
        // Only from the gun, position as well as speed. The reveal and the
        // flyover are not a fixed length, so a wall that moved through them
        // arrived at the grid in a different place every time.
        if(state!=='racing') continue;
        o.travel = Math.min(o.travelMax, o.travel + o.ramp*dt);
        o.wy -= o.travel*dt;
        if(o.wy < o.wrapLo){
          o.wy += o.cycle;
          o.gapStart = Math.floor(Math.random()*(o.slots-o.gapSlots+1));
          const it = wallItems(o);
          for(let i=0;i<o.items.length;i++) o.items[i].x = it[i].x;
        }
      } else if(o.type==='ring'){
        // the ring waits a beat, then closes for the rest of the round
        if(o.wait > 0) o.wait -= dt;
        else o.r = Math.max(o.rMin, o.r - o.shrink*dt);
      } else if(o.type==='spinlaser' && o.ramp){
        // Not until the gun. The reveal and the flyover run about eleven
        // seconds and the field cannot move for any of it, so arms that swept
        // through them mowed down a stationary grid: eight racers gone before
        // the countdown finished, which is the cut, so the round ended on the
        // spot. How many depended on where the arms happened to start.
        if(state!=='racing') continue;
        const dir = Math.sign(o.speed) || 1;
        if(Math.abs(o.speed) < o.speedMax) o.speed += dir*o.ramp*dt;
        o.ang += o.speed*dt;
      } else if(o.type==='logroll'){
        for(const l of o.logs) l.ang += l.spin*dt;
      } else if(o.type==='tiltdeck'){
        for(const dk of o.decks){
          let sx = 0, sy = 0, n = 0;
          for(const r of racers){
            if(r.lavaOut || r.falling || r.h > 40) continue;
            if(Math.abs(r.x-dk.cx) > dk.w/2 || Math.abs(r.y-dk.y) > dk.d/2) continue;
            sx += (r.x-dk.cx)/(dk.w/2); sy += (r.y-dk.y)/(dk.d/2); n++;
          }
          // Weight, not position. Divided by the count alone this was the mean
          // offset, so one racer standing at the edge tipped the deck as hard as
          // twenty did -- which is not what a deck on a pivot does and not what
          // the round is called. Dividing by at least `hold` racers instead
          // makes the first few of them count for what they weigh: one at the
          // edge is a lean you can feel, five is the deck going over.
          const w = Math.max(o.hold, n);
          const tX = n ? clamp(sx/w*o.lean, -1, 1) : 0;
          const tY = n ? clamp(sy/w*o.lean, -1, 1) : 0;
          const k = Math.min(1, o.spring*dt);
          dk.tx += (tX - dk.tx)*k;
          dk.ty += (tY - dk.ty)*k;
        }
      } else if(o.type==='disc'){
        o.ang = (o.ang||0) + o.speed*dt;
      } else if(o.type==='crumble'){
        for(const sl of o.slabs){
          if(sl.fuse > 0){ sl.fuse -= dt; if(sl.fuse <= 0){ sl.gone = true; sl.back = o.respawnTime; } }
          if(sl.gone){
            sl.drop = Math.min(1, sl.drop + dt*2.4);
            sl.back -= dt;
            if(sl.back <= 0){ sl.gone = false; sl.touched = false; sl.fuse = -1; }
          } else if(sl.drop > 0){
            sl.drop = Math.max(0, sl.drop - dt*3.2);
          }
        }
      }
    }
    if(currentMap.mode==='boulder'){
      boulderTimer-=dt;
      if(boulderTimer<=0){
        boulderTimer = (round>=2?0.42:0.58) + rand(0,0.25);
        spawnBoulder();
        if(Math.random()<0.35) spawnBoulder();
      }
      const minY = racers.reduce((m,r)=>Math.min(m,r.y), 1e9);
      for(let i=boulders.length-1;i>=0;i--){
        const b=boulders[i];
        b.y -= b.speed*dt;
        b.spin += b.speed*dt/b.r;
        placeAt(b.mesh, b.x, b.y, b.r-4);
        b.ball.rotation.x = -b.spin;
        if(b.y < minY-520){ courseGroup.remove(b.mesh); boulders.splice(i,1); continue; }
        for(const r of racers){
          if(r.falling||r.finished||r.invuln>0) continue;
          if(r.h > b.r*1.25) continue;
          const dx=r.x-b.x, dy=r.y-b.y, d=Math.hypot(dx,dy);
          if(d < b.r+RADIUS-6){
            const nx=dx/(d||1);
            r.vx += nx*10; r.vy -= 7; r.stumbleT=520; r.invuln=700; r.vh=4; if(r.h===0) r.h=0.01;
            spawnBurst3D(r.x,r.y,0x8a7060);
            if(r.isPlayer){ SFX.hit(); camShake=8; }
          }
        }
      }
    }

    // ---- cannons: fire on a beat, then the ball crosses the lane ----
    const packBack = racers.reduce((m,r)=>Math.min(m,r.y),  1e9);
    const packFront= racers.reduce((m,r)=>Math.max(m,r.y), -1e9);
    for(const o of obstacles){
      if(o.type!=='cannon') continue;
      for(let i=0;i<o.items.length;i++){
        const it=o.items[i];
        // Live for anyone still coming, not just the leader: gating on the front
        // runner switched cannons off for the whole pack behind them.
        if(it.y > packFront+2200 || it.y < packBack-700) continue;
        it.cool -= dt;
        // The warning on the floor is drawn by presentMinigames from it.cool;
        // what stays here is the sound, once, as it lights.
        const m = o.meshes && o.meshes[i];
        if(m && m.warn){
          const lead = it.cool;                       // seconds until this one fires
          if(lead <= CANNON_WARN && lead > 0){
            if(!it.warned){ it.warned = true;
              const p = racers.find(r=>r.isPlayer);
              if(p && Math.abs(p.y - it.y) < 900) SFX.count();
            }
          }
        }
        if(it.cool<=0){
          it.warned = false;
          it.cool = it.interval;
          // Which cannon fired it travels with it: presentMinigames gives the
          // ball its mesh and that barrel its recoil, on a host and a joiner alike.
          const b = { x: it.side<0 ? 10 : TRACK_W-10, y: it.y, r: it.r,
                      vx: it.side<0 ? it.speed : -it.speed, spin:0, src:[obstacles.indexOf(o), i] };
          shots.push(b);
        }
      }
    }
    for(let i=shots.length-1;i>=0;i--){
      const b=shots[i];
      b.x += b.vx*dt; b.spin = (b.spin||0) + b.vx*dt/b.r;
      if(b.x < -60 || b.x > TRACK_W+60){ shots.splice(i,1); continue; }

      // ---- a cannonball is not only a threat to racers ----
      // It brings a crumbling slab down under it...
      for(const o of obstacles){
        if(o.type!=='crumble' || b.y < o.yStart || b.y > o.yEnd) continue;
        for(const sl of o.slabs){
          if(sl.gone || sl.fuse > 0) continue;
          if(Math.abs(sl.x-b.x) > sl.w/2 + b.r || Math.abs(sl.y-b.y) > sl.d/2 + b.r) continue;
          sl.touched = true; sl.fuse = Math.min(sl.fuse<0 ? 0.18 : sl.fuse, 0.18);
          spawnBurst3D(sl.x, sl.y, 0xffffff, 10);
        }
      }
      // ...and it sets a bumper off, which throws whoever is leaning on it
      for(const o of obstacles){
        if(o.type!=='bumper' || Math.abs(b.y-o.y) > 110) continue;
        for(const it of o.items){
          if(Math.hypot(it.x-b.x, o.y-b.y) > it.r + b.r) continue;
          it.hit = 1;
          for(const r of racers){
            if(r.falling||r.finished||r.lavaOut) continue;
            const dx=r.x-it.x, dy=r.y-o.y, d=Math.hypot(dx,dy);
            if(d > it.r + RADIUS + 26 || d < 0.001) continue;
            r.vx += dx/d*9; r.vy += dy/d*9;
            r.squash = Math.max(r.squash, 0.6);
            if(r.isPlayer){ SFX.bump(); camShake = Math.max(camShake, 5); }
          }
          spawnBurst3D(it.x, o.y, 0xffcb3d, 12);
        }
      }

      for(const r of racers){
        if(r.falling||r.finished||r.invuln>0) continue;
        if(r.h > b.r*1.9 + 26) continue;                 // jumped it
        if(Math.hypot(r.x-b.x, r.y-b.y) < b.r+RADIUS-6){
          const dir=Math.sign(b.vx)||1;
          r.vy += rand(-2,2);
          sendTumbling(r, 8, dir, 0);
          r.invuln=700;
          spawnBurst3D(r.x,r.y,0x2b2140);
        }
      }
    }

    // ---- bumper squash decays ----
    for(const o of obstacles){
      if(o.type!=='bumper') continue;
      for(let i=0;i<o.items.length;i++){
        const it=o.items[i];
        if(it.hit>0){ it.hit=Math.max(0,it.hit-dt*3.2);
          const m=o.meshes && o.meshes[i];
          if(m){ const k=1+it.hit*0.30; m.scale.set(k,1-it.hit*0.22,k); } }
      }
    }

    // ---- crumbling tiles, which rebuild after a while ----
    const field = obstacles.find(o=>o.type==='tilefield');
    if(field){
      for(const tl of field.tiles){
        // State only: presentMinigames draws each tile from it.
        if(tl.touched && !tl.gone){
          tl.fuse -= dt;
          if(tl.fuse<=0){ tl.gone=true; tl.drop=0;
            tl.back = (tl.layer>=2) ? Infinity : field.respawnTime;   // the bottom floor stays gone
            spawnBurst3D(tl.x, tl.y, 0x8a7060, 5); }
        } else if(tl.gone){
          if(tl.drop<1){
            tl.drop += dt*1.6;
          } else {
            tl.back -= dt;
            if(tl.back<=0){
              // rebuild: rise back into place
              tl.gone=false; tl.touched=false; tl.fuse=-1; tl.drop=0;
              spawnBurst3D(tl.x, tl.y, 0xffffff, 4);
            }
          }
        }
      }
    }

    // ---- hex tiers ----
    const hf = obstacles.find(o=>o.type==='hexfield');
    if(hf){
      for(const c of hf.cells){
        // State only, as for the tiles.
        if(c.touched && !c.gone){
          c.fuse -= dt;
          // Infinity, not a flag checked at the other end: the rebuild below
          // counts this down, so a rung that is never coming back is one whose
          // countdown never finishes.
          if(c.fuse<=0){ c.gone=true; c.drop=0; c.back = c.noBack ? Infinity : hf.respawnTime;
                         spawnBurst3D(c.x,c.y,0xa78bfa,6); }
        } else if(c.gone){
          if(c.drop<1){
            c.drop += dt*1.5;
          } else {
            c.back -= dt;
            if(c.back<=0){
              c.gone=false; c.touched=false; c.fuse=-1; c.drop=0;
            }
          }
        }
      }
    }
  }

  // ============================================================
  // OBSTACLE COLLISION
  // ============================================================
  function checkObstacles(r,t){
    if(r.falling) return;
    const inNarrow=obstacles.some(o=>o.type==='narrow'&&r.y>o.yStart&&r.y<o.yEnd);
    const inPit=obstacles.find(o=>o.type==='pit'&&r.y>o.yStart&&r.y<o.yEnd);
    const field=obstacles.find(o=>o.type==='tilefield'&&r.y>o.yStart&&r.y<o.yEnd);
    const hf=obstacles.find(o=>o.type==='hexfield'&&r.y>o.yStart&&r.y<o.yEnd);
    if(!inNarrow && !arenaMode()){ if(r.x<RADIUS+4){ r.x=RADIUS+4; r.vx=Math.abs(r.vx)*0.3; } if(r.x>TRACK_W-RADIUS-4){ r.x=TRACK_W-RADIUS-4; r.vx=-Math.abs(r.vx)*0.3; } }

    // ---- ramps: raise the floor, then launch you off the lip ----
    const ramp = obstacles.find(o=>o.type==='ramp' && r.y>=o.yStart && r.y<=o.yEnd && Math.abs(r.x-o.cx)<o.width/2);
    if(ramp){
      const k = clamp((r.y-ramp.yStart)/(ramp.yEnd-ramp.yStart), 0, 1);
      r.floorH = ramp.height*k;
      r.onRamp = ramp;
    } else if(r.onRamp){
      const off = r.onRamp;
      if(r.y > off.yEnd && r.h<=0.5){
        // carried off the top — convert the run-up into air
        r.h = Math.max(r.h, r.floorH||0);
        r.vh = Math.max(r.vh, 1.4 + Math.max(0,r.vy)*0.55);
      }
      r.floorH = 0; r.onRamp = null;
    }

    // ---- the raised side lane ----
    const sc = obstacles.find(o=>o.type==='shortcut' && r.y>=o.yStart && r.y<=o.yEnd
                                 && Math.abs(r.x-o.cx) < o.w/2);
    if(sc){
      const k = clamp((r.y - sc.yStart)/sc.rampLen, 0, 1);
      r.floorH = sc.h*k;
      r.onShortcut = sc;
      if(k >= 1 && r.h<=0.5 && r.vy < sc.boost) r.vy = sc.boost;   // the reward
    } else if(r.onShortcut){
      // stepped off the side, or ran out of lane: arc down rather than teleport
      if(r.h<=0.5){ r.h = Math.max(r.h, r.floorH||0); r.vh = 0.5; }
      r.floorH = 0; r.onShortcut = null;
    }

    // ---- moving platform: hold the racer up, and carry them with it ----
    // Up on the raised lane you are above both of these, so neither one may
    // reach up and overwrite the height the lane is holding you at.
    const upTop = !!(sc || r.onShortcut);
    const mv = upTop ? null : obstacles.find(o=>o.type==='mover' && r.y>=o.yStart && r.y<=o.yEnd);
    if(mv){
      const mx = moverX(mv, t);
      if(Math.abs(r.x-mx) < mv.w/2 + RADIUS - 10){
        r.floorH = mv.h;
        r.onMover = mv;
        // carried: the deck takes you with it while your feet are on it
        if(r.h <= mv.h + 0.5 && mv.dx) r.x += mv.dx;
      } else if(r.h <= mv.h + 0.5){
        r.onMover = null; r.floorH = 0; fallDown(r); return;
      }
    } else if(r.onMover){
      if(r.h<=0.5){ r.h = Math.max(r.h, r.floorH||0); r.vh = 0.4; }
      r.floorH = 0; r.onMover = null;
    }

    // ---- crumbling bridge: solid until you put your weight on it ----
    const cr = upTop ? null : obstacles.find(o=>o.type==='crumble' && r.y>=o.yStart && r.y<=o.yEnd);
    if(cr){
      let slab = null;
      for(const sl of cr.slabs){
        if(!sl.gone && Math.abs(r.x-sl.x) < sl.w/2 + RADIUS - 8 && Math.abs(r.y-sl.y) < sl.d/2 + RADIUS - 6){ slab = sl; break; }
      }
      if(slab){
        r.floorH = cr.h; r.onCrumble = cr;
        if(r.h <= cr.h + 0.5 && !slab.touched){ slab.touched = true; slab.fuse = cr.fuseTime; }
      } else if(r.h <= cr.h + 0.5){
        r.onCrumble = null; r.floorH = 0; fallDown(r); return;
      }
    } else if(r.onCrumble){
      if(r.h<=0.5){ r.h = Math.max(r.h, r.floorH||0); r.vh = 0.4; }
      r.floorH = 0; r.onCrumble = null;
    }

    // ---- the fork divider: once you have picked a side you are on it ----
    const fk = obstacles.find(o=>o.type==='fork' && r.y>=o.wallFrom-RADIUS && r.y<=o.yEnd);
    if(fk && r.h < 44){
      const dx = r.x - fk.cx, minD = 8 + RADIUS;
      if(Math.abs(dx) < minD){
        // over it, or round either end of it, is a fair way across
        const sgn = sideOf(r, true, fk.cx, (y,h)=> h >= 44 || y < fk.wallFrom-RADIUS || y > fk.yEnd)
                 || (Math.sign(r.vx) || 1);
        r.x = fk.cx + sgn*minD;
        // squash on a real impact only: leaning on it re-armed this every frame
        if(sgn*r.vx < 0){ if(-sgn*r.vx > 1.5) r.squash = Math.max(r.squash, 0.3); r.vx = 0; }
      }
    }

    // ---- the gate: two doors, sixteen racers, and a queue ----
    const gt = obstacles.find(o=>o.type==='gate' && Math.abs(r.y-o.y) < o.d/2 + RADIUS);
    if(gt && r.h < gt.h){
      const through = gt.xs.some(gx => Math.abs(r.x-gx) < gt.gapW/2 - RADIUS*0.35);
      if(!through){
        // A racer whose feet were over the top where they crossed its middle
        // went over it, and comes down on the far side; anyone else goes back.
        const side = sideOf(r, false, gt.y, (x,h)=> h >= gt.h
                       || gt.xs.some(gx => Math.abs(x-gx) < gt.gapW/2 - RADIUS*0.35)) || -1;
        r.y = gt.y + side*(gt.d/2 + RADIUS);
        if(side*r.vy < 0){ if(-side*r.vy > 1.5) r.squash = Math.max(r.squash, 0.3); r.vy = 0; }
        // slide toward the nearer door rather than standing there pressing into it
        let best = gt.xs[0];
        for(const gx of gt.xs) if(Math.abs(gx-r.x) < Math.abs(best-r.x)) best = gx;
        r.vx += Math.sign(best - r.x)*0.34;
      }
    }

    // ---- surfaces you stand on ------------------------------------------
    // Above the ground-hazard gate below, not inside it. That gate is
    // `r.h<=0.5 && (r.floorH||0) <= 20`, which is right for a hole in the floor
    // and wrong for a floor that is not at zero: the first frame on a log sets
    // floorH to 61 and the frame after that the gate is shut, so the log turned
    // under nobody, its pegs swept through nobody, and stepping off its
    // shoulder was stepping onto thin air that never noticed. Tilt Deck had it
    // too -- a leaning deck is up to 49 off zero -- which is why its slide had
    // never once moved a racer.
    const lr = obstacles.find(o=>o.type==='logroll' && r.y>o.yStart && r.y<o.yEnd);
    if(lr){
      const lg = logOver(lr, r.y);
      if(lg){
        const surf = logSurface(lr, lg, r.x);
        // Off the shoulder is off. There is nothing beside a log.
        if(surf === null){ if(r.h <= 0.5){ fallDown(r); return; } }
        else {
          r.floorH = surf;
          r.onLog = lg;
          // !(x>0), not x<=0. tumbleT was the one field baseRacer() did not
          // initialise, so on a racer that had never been knocked down this
          // read `undefined <= 0` and was false: the log turned, the pegs went
          // round with it, and neither ever touched anybody. It starts at zero
          // now and check f keeps it that way.
          if(r.h <= 0.5 && !(r.tumbleT > 0)){
            // The surface of a turning log moves sideways at spin x radius,
            // and it takes what is standing on it with it. This is the round:
            // everything else is you arguing with this line.
            r.x += lg.spin*lr.R/60*frameK;
            // and a peg that is coming up over the crown catches anything
            // whose feet are still down
            for(const peg of lg.pegs){
              if(Math.abs(r.y - peg.y) > lr.pegW + RADIUS) continue;
              const p = pegRise(lr, lg, peg);
              if(p.rise <= 6) continue;                 // still under the log
              if(r.h >= p.rise) continue;               // jumped it
              if(r.invuln > 0) continue;
              const dir = Math.sign(lg.spin) || 1;
              hazardHit(r, dir*lr.R*Math.abs(lg.spin)/60, 0, dir, 0);
              r.invuln = 620;
              spawnBurst3D(r.x, r.y, 0xffcb3d, 8);
              break;
            }
          }
        }
      } else if(r.onLog){ r.floorH = 0; r.onLog = null; }
    } else if(r.onLog){ r.floorH = 0; r.onLog = null; }
    const td = obstacles.find(o=>o.type==='tiltdeck' && r.y>o.yStart && r.y<o.yEnd);
    if(td){
      // A little tolerance at the seams: the decks touch, and a racer exactly
      // on the join between two of them is on both, not on neither.
      const dk = td.decks.find(d=>Math.abs(r.x-d.cx)<=d.w/2+4 && Math.abs(r.y-d.y)<=d.d/2+4);
      // Between two decks is a step you jump, so only a racer with their feet
      // down is over nothing.
      if(!dk){ if(r.h <= 0.5){ fallDown(r); return; } }
      else {
        const ox = r.x-dk.cx, oy = r.y-dk.y;
        // the surface, so the camera and the feet agree about where the floor is
        r.floorH = -(dk.tx*ox + dk.ty*oy)*td.maxTilt;
        r.onDeck = dk;
        // And the same here, which is why Tilt Deck's lean has been visual
        // only since it landed: the decks tilted, the floor under you moved,
        // and nothing ever slid. It needed a hammer bolted to the course to
        // hurt anybody at all.
        if(r.h <= 0.5 && !(r.tumbleT > 0)){
          r.vx += dk.tx*td.slide*frameK;
          r.vy += dk.ty*td.slide*frameK;
        }
      }
    } else if(r.onDeck){ r.floorH = 0; r.onDeck = null; }

    // ---- ground hazards (only when on the ground, and only at ground level) ----
    if(r.h<=0.5 && (r.floorH||0) <= 20){
      if(inPit){
        let onPlat=false, ridden=null;
        for(const p of inPit.platforms){ if(Math.abs(r.x-platX(p,t))<p.width/2+RADIUS-8){ onPlat=true; ridden=p; break; } }
        // ...and the island, which does not move and does not need timing
        if(!onPlat) for(const is of (inPit.islands||[])){
          if(Math.abs(r.x-is.x) < is.w/2 + RADIUS - 8 && r.y > is.y0 - RADIUS && r.y < is.y1 + RADIUS){ onPlat=true; break; }
        }
        if(!onPlat){ fallDown(r); return; }
        // A platform takes what is standing on it with it. It did not: a racer
        // who stood still on a pit platform held a fixed world position while
        // the deck slid out from under them, and the only reason that was
        // survivable is that the bots were written to steer against it by hand.
        // platX is baseX + sin(t*speed + phase)*amp, so the deck's own sideways
        // speed is the derivative of that -- the same expression `pusher`
        // already uses to work out how hard it is closing on you.
        //
        // Kept as a position write, like every other carrier in the game, so
        // that it cannot be spent twice or accumulate through friction. What it
        // is worth on take-off is remembered separately, below.
        // The EXACT distance the deck moved this frame, not its speed times the
        // length of the frame. platX is a sine, so its derivative is only right
        // at the instant it is taken: integrating that forward drifts a little
        // every frame and a lot through the turn at each end of the swing, and
        // a rider who drifts a few units a second off a deck ends up standing
        // on nothing. Differencing the position itself cannot drift, because it
        // IS the position.
        if(ridden && !(r.tumbleT>0)){
          // t is the OBSTACLE clock, which a frenzy runs at eventSpeed(): step
          // back by what it advanced this frame, or the deck outruns its rider
          const step = platX(ridden, t) - platX(ridden, t - eventSpeed()*frameK/60);
          r.x += step;
          // ...and the same thing as a velocity, in the units r.vx is in, so
          // that doJump can hand it to the jump.
          r.platVX = frameK > 0 ? step/frameK : 0;
        } else r.platVX = 0;
      } else if(r.platVX) r.platVX = 0;
      if(inNarrow){
        // inNarrow was measured before the gate block, which can shove r.y --
        // so by the time we look the racer may no longer be in one.
        const nb=obstacles.find(o=>o.type==='narrow'&&r.y>o.yStart&&r.y<o.yEnd);
        if(nb && Math.abs(r.x-(TRACK_W/2+(nb.offset||0)))>nb.halfWidth+RADIUS-10){ fallDown(r); return; }
      }
      if(field){
        const grace = raceTime < (r.tileGraceUntil||-1);
        const col = tileColumnAt(field, r.x, r.y);
        const floor = tileFloor(col);
        if(!floor){ if(!grace){ fallDown(r); return; } }     // through the last floor: out
        else {
          if(r.tileLayer !== undefined && floor.layer > r.tileLayer){
            // dropped a storey: remember it, for ranking if the clock runs out
            r.lastDropT = raceTime;
            if(r.isPlayer){ SFX.fall(); camShake = Math.max(camShake, 4); }
          }
          r.tileLayer = floor.layer;
          r.floorH = floor.hy;
          if(!floor.touched){ floor.touched = true; floor.fuse = field.fuseByLayer[floor.layer]; }
        }
      }
      const pk = obstacles.find(o=>o.type==='plank' && r.y>o.yStart && r.y<o.yEnd);
      if(pk && r.h <= 0.5){
        let onPlank = false;
        for(const pl of pk.planks) if(Math.abs(r.x-pl.x) < pl.w/2 + RADIUS - 14){ onPlank = true; break; }
        if(!onPlank){ fallDown(r); return; }
      }
      const df = obstacles.find(o=>o.type==='discField' && r.y>o.yStart-4 && r.y<o.yEnd+4);
      if(df){
        const on = discCellAt(df, r.x, r.y);
        // Only a fall with your feet down. You cross this section by hopping
        // disc to disc, so a racer in the air over a gap is mid-hop, not
        // falling -- testing it unconditionally made the row gaps uncrossable
        // by anyone, player and bot alike.
        if(!on){ if(r.h <= 0.5){ fallDown(r); return; } }
        else {
        // the arm is read before the disc carries the racer, or the hit test
        // would be against a position the racer was never actually in
        if(r.h < 26 && r.invuln <= 0 && discArmNear(on, r.x, r.y, t, 0.16)){
          const bx = r.x-on.x, by = r.y-on.y, bd = Math.hypot(bx,by)||1;
          sendTumbling(r, 7, bx/bd, by/bd);
        }
        // the floor is turning: it takes you round with it
        const dx = r.x-on.x, dy = r.y-on.y;
        r.x += -dy*on.speed*(1/60)*frameK;
        r.y +=  dx*on.speed*(1/60)*frameK;
        }
      }
      const gp = obstacles.find(o=>o.type==='gap' && r.y>o.yStart && r.y<o.yEnd);
      if(gp && Math.abs(r.x-gp.cx) < gp.halfWidth - RADIUS*0.35){ fallDown(r); return; }
      const gems = obstacles.find(o=>o.type==='gems');
      if(gems && r.h < 62){
        for(const g of gems.items){
          if(g.taken) continue;
          if(Math.abs(g.x-r.x) > 34 || Math.abs(g.y-r.y) > 34) continue;
          g.taken = true;
          r.gems = (r.gems||0) + 1;
          if(r.gems >= gems.need) r.gemSafe = true;
          spawnBurst3D(r.x, r.y, 0x7ee8fa, 12);
          if(r.isPlayer){ SFX.click(); if(r.gems>=gems.need) SFX.win(); }
          break;
        }
      }
      // Wall Rush: three sides are fenced, so this is the only way out --
      // and being carried out by a wall is the point of the round, not a
      // mistake to be forgiven, so it is not gated on having your feet down.
      const plate = obstacles.find(o=>o.type==='plate');
      if(plate && (r.y < plate.yNear || r.x < plate.x0-12 || r.x > plate.x1+12)){ fallDown(r); return; }
      const ring = obstacles.find(o=>o.type==='ring');
      if(ring && Math.hypot(r.x-ring.cx, r.y-ring.y) > ring.r){ fallDown(r); return; }
      const disc = obstacles.find(o=>o.type==='disc');
      if(disc){
        const dx=r.x-disc.cx, dy=r.y-disc.y, dd=Math.hypot(dx,dy);
        if(dd > disc.r){ fallDown(r); return; }
        // the floor is turning: it carries you round with it
        const w = disc.speed;
        r.x += -dy*w*(1/60)*frameK; r.y += dx*w*(1/60)*frameK;
      }
      if(hf){
        const grace = raceTime < (r.tileGraceUntil||-1);
        const col = hexColumnAt(hf, r.x, r.y);
        const floor = hexFloor(col);
        if(!floor){ if(!grace){ fallDown(r); return; } }
        else {
          r.floorH = floor.hy;
          if(!floor.touched){ floor.touched=true; floor.fuse=hexFuse(hf); }
        }
      }
    }
    if(!field && !hf && !ramp && !r.onRamp && !sc && !r.onShortcut && !mv && !cr && !r.onDeck && !r.onLog) r.floorH = 0;

    // ---- terrain (v24 §2.8) ------------------------------------------------
    // Slime and bounce pads are ground, not hazards, so they go above the
    // invulnerability gate below. A racer who has just picked themselves up is
    // briefly immune to being hit; they are not briefly immune to the floor,
    // and a conveyor that stopped conveying for the eight hundred milliseconds
    // after a knockdown would be a floor that lies about where it takes you.
    for(const o of obstacles){
      if(r.y<o.y0-40||r.y>o.y1+40) continue;
      if(o.type==='slime'){
        // A conveyor adds its own velocity to yours every frame you stand on
        // it, which is what a surface that flows actually does -- standing
        // still on it means going where it goes. In the air you are clear.
        if(r.h < 6 && Math.abs(r.y-o.y) < o.len/2 && Math.abs(r.x-o.cx) < o.w/2){
          // o.speed is the share of top speed the flow carries you at, and the
          // push that reaches it is solved from the surface -- the impulse that
          // gives 40% of top speed on dry ground gives three times that on ice,
          // and Splash Slide would fire you into the wall.
          const sfr = currentMap.slippery ? ICE_FR : GROUND_FR;
          const push = o.speed*V_MAX*(1-sfr)/sfr;
          r.vx += o.flowX*push*frameK;
          r.vy += o.flowY*push*frameK;
          if(r.isPlayer && Math.random()<0.10) spawnBurst3D(r.x,r.y,0x7ee87e,2);
        }
      } else if(o.type==='bounce'){
        for(const it of o.items){
          if(Math.hypot(r.x-it.x, r.y-it.y) < it.r + RADIUS - 6 && surfaceH(r) < 16 && r.vh <= 0.5){
            // A fixed height, whatever you arrived with: that is what makes a
            // trampoline readable. Your horizontal speed is yours to keep.
            r.vh = o.power; r.h = Math.max(r.h, 0.01);
            r.squash = 0.8; it.hit = 1;
            spawnBurst3D(r.x, r.y, 0x23e6c9, 6);
            if(r.isPlayer) SFX.jump();
            break;
          }
        }
      }
    }

    // ---- solids ----------------------------------------------------------
    // Above the invulnerability gate, not behind it. A racer who cannot be hurt
    // -- in a dive, just up off the floor, just back from a fall -- is still a
    // body, and a pillar is still a pillar. The gate used to sit above all of
    // these, so every dive was a pass through any of them: the audit sweep put
    // up to one approach in five through a pillar that way. What being
    // untouchable still buys is the HIT -- the stumble off a pillar, the bounce
    // off a door or the rim, a bumper's fling, a wall's knockdown -- so those
    // stay behind it, which is also what stops a racer held against a solid
    // being hit by it again on every frame of the invulnerability its first hit
    // handed out. `inv` is read once, as the gate did, so a hit here does not
    // spare the racer something further down the list this same frame.
    const inv = r.invuln > 0;
    for(const o of obstacles){
      if(r.y<o.y0-40||r.y>o.y1+40) continue;

      if(o.type==='pillars'){
        for(const it of o.items){
          const dx=r.x-it.x, dy=r.y-o.y; const d=Math.hypot(dx,dy);
          if(d<it.r+RADIUS-4){
            roundOut(r, it.x, o.y, Infinity);
            const nx=outNX, ny=outNY;
            r.x = it.x + nx*(it.r+RADIUS-4); r.y = o.y + ny*(it.r+RADIUS-4);
            const vn=r.vx*nx+r.vy*ny;
            if(vn<0){ r.vx-=vn*nx*1.4; r.vy-=vn*ny*1.4;
              if(-vn>4 && !inv){ r.stumbleT=320; spawnBurst3D(r.x,r.y,0xffffff,5); if(r.isPlayer) SFX.bump(); } }
            r.vx += (nx>=0?1:-1)*0.8;
          }
        }

      } else if(o.type==='doors'){
        if(Math.abs(r.y-o.y) < o.d/2 + RADIUS && r.h < 62){
          for(let i=0;i<o.items.length;i++){
            const it=o.items[i];
            if(Math.abs(r.x-it.x) > it.w/2 + RADIUS - 8) continue;
            if(it.fake){
              // Paper tears whoever goes through it -- a diver used to pass
              // through an intact panel. Being slowed by it is the hit.
              if(!it.broken){
                it.broken=true;
                const m=o.meshes && o.meshes[i];
                if(m){ m.panel.visible=false; }
                spawnBurst3D(it.x, o.y, 0xfff1c9, 14);
                if(!inv){ r.vy *= 0.62; r.stumbleT=Math.max(r.stumbleT,120); }
                if(r.isPlayer){ SFX.bump(); camShake=3; }
              }
            } else {
              const side = sideOf(r, false, o.y, (x,h)=> h >= 62 || !o.items.some(q=>!q.fake
                             && Math.abs(x-q.x) <= q.w/2 + RADIUS - 8)) || -1;
              r.y = o.y + side*(o.d/2 + RADIUS);
              if(inv){ if(side*r.vy < 0) r.vy = 0; }
              else {
                if(side<0 && r.vy>0){ r.vy = -Math.abs(r.vy)*0.35 - 1; r.stumbleT=340; r.invuln=260;
                  spawnBurst3D(r.x, o.y, 0x5b3aa8, 8);
                  if(r.isPlayer){ SFX.hit(); camShake=5; } }
                r.vx += (r.x < it.x ? -1 : 1)*5.2;   // deflect toward a gap instead of sticking
              }
            }
          }
        }

      } else if(o.type==='hoop'){
        if(Math.abs(r.y - o.y) < o.tube + RADIUS){
          // Where the racer is on the ring's own plane: across the track, and
          // up it. Measured from the middle of the bean rather than its feet,
          // or ducking would be a way through the bottom of a ring that is
          // buried in the floor.
          const dx = r.x - o.cx, dh = (r.h + RADIUS) - o.hc;
          const d = Math.hypot(dx, dh);
          if(Math.abs(d - o.r) < o.tube + RADIUS*0.55){
            const side = sideOf(r, false, o.y, (x,h)=>
                           Math.abs(Math.hypot(x - o.cx, h + RADIUS - o.hc) - o.r) >= o.tube + RADIUS*0.55) || -1;
            r.y = o.y + side*(o.tube + RADIUS);
            if(inv){ if(side*r.vy < 0) r.vy = 0; }
            else {
              if(side < 0 && r.vy > 0){
                r.vy = -Math.abs(r.vy)*0.40 - 1;
                r.stumbleT = Math.max(r.stumbleT, 380); r.invuln = Math.max(r.invuln, 320);
                spawnBurst3D(r.x, o.y, 0xffd54f, 10);
                if(r.isPlayer){ SFX.hit(); camShake = Math.max(camShake, 5); }
              }
              // and shoved back toward the hole, which is always inward
              r.vx -= Math.sign(dx)*2.2;
            }
          }
        }

      } else if(o.type==='blockwall'){
        const wy = wallY(o,t);
        // A Wall Rush wall carries its own height, because 70 is not enough of
        // one: a standing jump tops out within a unit or two of it, so the
        // round's whole premise -- a wall you cannot jump -- came down to
        // rounding. The race sections keep the 70 they were built against.
        const hi = o.hi || 70;
        if(Math.abs(r.y-wy) < o.d/2 + RADIUS && r.h < hi){
          const shift=blockShift(o,t);
          for(const it of o.items){
            const bx=it.x+shift;
            if(Math.abs(r.x-bx) > it.w/2 + RADIUS - 6) continue;
            const side = sideOf(r, false, wy, (x,h)=> h >= hi || !o.items.some(q=>
                           Math.abs(x-(q.x+shift)) <= q.w/2 + RADIUS - 6)) || -1;
            r.y = wy + side*(o.d/2 + RADIUS);
            if(o.travel){
              // A wall that is coming for you carries you. Knocking you down
              // instead would be kinder than it looks: on the floor you stop
              // steering, and the wall keeps going, so one clip at the far end
              // would be a free ride to the near one.
              if(side<0) r.vy = Math.min(r.vy, -o.travel/60);
              else if(r.vy<0) r.vy = 0;
              if(r.isPlayer && raceTime > (r.wallSfxT||0)){ SFX.bump(); camShake=Math.max(camShake,3); r.wallSfxT = raceTime + 0.5; }
              // Enough along the face to break a dead stop on a block's centre
              // line, and no more. At 1.6 it was an escape in itself: a racer
              // pinned at the far side of the wall slid to the gap on its own
              // in under two seconds, and nobody was ever swept off.
              r.vx += (r.x < bx ? -1 : 1)*0.30;
            } else if(inv){ if(side*r.vy < 0) r.vy = 0; }
            else {
              if(side<0 && r.vy>0){ r.vy=-Math.abs(r.vy)*0.3-1;
                sendTumbling(r, 6, 0, -1); r.invuln=520;
                spawnBurst3D(r.x,wy,0xff8a5c,8); }
              // shove sideways toward the nearer edge so you slide off rather than stick
              r.vx += (r.x < bx ? -1 : 1)*3.4;
            }
          }
        }

      } else if(o.type==='bumper'){
        for(const it of o.items){
          const dx=r.x-it.x, dy=r.y-o.y, d=Math.hypot(dx,dy);
          if(d < it.r+RADIUS-2 && surfaceH(r) < 46){
            roundOut(r, it.x, o.y, 46);
            const nx=outNX, ny=outNY;
            r.x = it.x + nx*(it.r+RADIUS); r.y = o.y + ny*(it.r+RADIUS);
            // Untouchable, it does not fling you; it is still in the way.
            if(inv){ const vn = r.vx*nx + r.vy*ny; if(vn < 0){ r.vx -= vn*nx; r.vy -= vn*ny; } continue; }
            // Pinball: fling outward, harder the faster you hit it -- but
            // only the part of your speed that was actually going into it.
            // Brushing past one at full tilt used to fling you as hard as
            // running straight at it.
            const closing = Math.max(0, -(r.vx*nx + r.vy*ny));
            const kick = 6.2 + closing*0.75;
            r.vx = nx*kick; r.vy = ny*kick;
            r.squash = 0.9; r.stumbleT = 200; r.invuln = 240; it.hit = 1;
            spawnBurst3D(r.x,r.y,0xff4fa3,8);
            if(r.isPlayer){ SFX.bump(); camShake=4; }
            return;
          }
        }
      }
    }

    // ---- hazards: these only HIT, so being untouchable is a pass ----
    if(inv) return;
    for(const o of obstacles){
      if(r.y<o.y0-40||r.y>o.y1+40) continue;

      if(o.type==='laserbar'){
        const by=laserY(o,t);
        if(Math.abs(r.y-by) < 12 + RADIUS*0.60){
          // Measured from the surface underfoot, not from the racer's own h.
          // Standing on a shortcut lane or a platform put you visibly above a
          // low beam and it still cut you down.
          const foot = (r.floorH||0) + r.h;
          const top = foot + (r.diveT>0 ? 18 : 33);   // diving you are half as tall
          const bandLo=o.h-5, bandHi=o.h+5;
          if(foot < bandHi && top > bandLo){
            const side=Math.sign(r.y-by)||-1;
            r.y = by + side*(9+RADIUS*0.45);
            r.vy = side*Math.abs(r.vy)*0.4 - (side<0?1.5:0);
            sendTumbling(r, 7, 0, side); r.invuln=620;
            spawnBurst3D(r.x, by, o.low?0xff2d6f:0x26d5ff, 10);
            return;
          }
        }

      //<<shelved:hit-roller>>
      } else if(o.type==='boost'){
        if(surfaceH(r) < 30 && Math.abs(r.y-o.y) < o.len/2 + RADIUS && Math.abs(r.x-o.cx) < o.w/2 + RADIUS - 8){
          // a speed floor rather than an impulse, so it does not depend on frame rate
          if(r.vy < o.power) r.vy = o.power;
          if(r.isPlayer && Math.random()<0.30) spawnBurst3D(r.x,r.y,0xffd54f,3);
        }

      //<<shelved:hit-log>>
      } else if(o.type==='pendulum'){
        const pp = pendPos(o,t);
        if(Math.abs(r.y-o.y) < o.r+RADIUS && Math.abs(r.x-pp.x) < o.r+RADIUS-4){
          const top = r.h + (r.diveT>0?18:34);
          if(top > pp.h-o.r && r.h < pp.h+o.r){
            const dir = Math.sign(Math.cos(pendAngle(o,t))*Math.cos(t*o.speed+o.phase)) || 1;
            const away = Math.sign(r.x-pp.x) || dir;
            r.vy -= 3;
            sendTumbling(r, 10, away, 0);
            r.invuln=700;
            spawnBurst3D(r.x,r.y,0xffffff,12);
            return;
          }
        }

      } else if(o.type==='spinlaser'){
        // Inert until the round starts, for the same reason they do not turn:
        // a frozen arm across the grid is still an arm across the grid, and
        // nobody can step off it during a countdown.
        //
        // And inert for a beat after it, the way the closing ring waits before
        // it closes. Twenty-four racers start shoulder to shoulder in a box
        // four hundred by a hundred and sixty, well inside the arms' reach, and
        // the first sweep across that took a third of the field off before
        // anyone had taken a step -- eight, which is the cut, so the round
        // ended in its own countdown. The arms turn from the gun so the round
        // reads as live; they take hold once the grid has had time to scatter.
        if(state!=='racing' || raceTime < (o.grace||0)) continue;
        const foot = (r.floorH||0) + r.h;
        const top = foot + (r.diveT>0?18:33);
        if(top > o.h-6 && foot < o.h+6){
          const dx=r.x-o.cx, dy=r.y-o.y, dist=Math.hypot(dx,dy);
          if(dist > 14 && dist < o.len){
            const ang=Math.atan2(dy,dx), base=spinlaserAngle(o,t), step=Math.PI*2/o.arms;
            for(let i=0;i<o.arms;i++){
              let d = ang - (base + i*step);
              while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2;
              // perpendicular distance to the arm, and only the half it points down
              if(Math.cos(d) > 0 && Math.abs(Math.sin(d))*dist < 10+RADIUS-8){
                // A beam is a bar, not a slap.
                //
                // As a race section this knocked you over and let you get up,
                // because on a corridor a knockdown costs you distance and that
                // was the whole punishment. On a disc it costs nothing: an
                // impulse moves a racer twenty units against a rim four hundred
                // away, and sendTumbling caps the force at 14 whatever you hand
                // it, so no amount of arm speed would have done it either.
                // Twenty-four racers took a hundred hits between them in a
                // minute and not one went over the edge.
                //
                // So the arm carries you, the way Wall Rush's walls do: pinned
                // to its line, swept round with it, and worked outward a little
                // every frame until the rim runs out. And it leaves you the way
                // out you should have taken in the first place -- over the low
                // one, under the high one -- because it does not knock you down
                // and a racer on their feet can still jump.
                const armAng = base + i*step;
                const out = dist + (o.push||150)/60;
                r.x = o.cx + Math.cos(armAng)*out;
                r.y = o.y  + Math.sin(armAng)*out;
                r.vx *= 0.5; r.vy *= 0.5;
                r.squash = Math.max(r.squash||0, 0.35);
                if(r.isPlayer && raceTime > (r.beamSfxT||0)){
                  SFX.hit(); camShake = Math.max(camShake, 4); r.beamSfxT = raceTime + 0.4;
                }
                if(!(raceTime % 0.12 > 0.02))
                  spawnBurst3D(r.x, r.y, o.h>=24?0xff4fa3:0xa3e635, 4);
                return;
              }
            }
          }
        }

      //<<shelved:hit-spinlaser>>
      } else if(o.type==='hammer'){
        if(Math.abs(r.y-o.y)<o.band/2+RADIUS){
          for(const it of o.items){
            const ang=hammerAngle(it,t); const hx=it.pivotX+Math.sin(ang)*it.armLen; const hy=96-76*Math.cos(ang)-RADIUS;
            const d=Math.hypot(r.x-hx, r.y-o.y);
            if(d<34+RADIUS-8 && hy+24>r.h && hy-24<r.h+RADIUS*2){
              // the head's own sideways speed, in units a frame
              const hv=Math.cos(ang)*it.armLen*1.15*it.speed*Math.cos(t*it.speed+it.phase)/60;
              const nx=Math.sign(r.x-hx)||1;
              hazardHit(r, hv, 0, nx, 0); r.invuln=700;
              spawnBurst3D(r.x,r.y,0xffffff); return;
            }
          }
        }

      } else if(o.type==='spinbar'){
        // The mesh spins via rotation.y, which sends local +X to world (cos a, 0, -sin a).
        // The collision segment has to use that same -sin, or the hitbox is mirrored in Z.
        if(surfaceH(r)<33 && Math.abs(r.y-o.y)<o.length/2+30){
          const ang=spinAngle(o,t);
          const dx=Math.cos(ang)*o.length/2, dy=-Math.sin(ang)*o.length/2;
          const d=segPointDist(o.cx-dx,o.y-dy,o.cx+dx,o.y+dy,r.x,r.y);
          if(d<o.thickness/2+RADIUS-6){
            const relx=r.x-o.cx, rely=r.y-o.y; const sw=Math.sign(o.speed);
            const tx=rely*sw, ty=-relx*sw; const tl=Math.hypot(tx,ty)||1;
            const nx=tx/tl, ny=ty/tl;
            // The bar's own speed where it caught you: radians a second times
            // how far out along the arm you were standing. Out at the tip it
            // throws you across the lane; near the hub it barely moves you.
            const tan = Math.abs(o.speed)*Math.hypot(relx,rely)/60;
            hazardHit(r, nx*tan, ny*tan, nx, ny); r.invuln=650;
            spawnBurst3D(r.x,r.y,0xffffff); return;
          }
        }

      } else if(o.type==='pusher'){
        if(surfaceH(r)<30 && Math.abs(r.y-o.y)<o.d/2+RADIUS){
          for(const it of o.items){
            const px=platX(it,t);
            if(Math.abs(r.x-px)<it.width/2+RADIUS-4){
              // d/dt of platX, in units a frame: a pusher at the end of its
              // travel is nearly stopped and hardly a hazard at all.
              const pv=it.amp*it.speed*Math.cos(t*it.speed+it.phase)/60;
              const dir=Math.sign(pv)||1;
              r.vy-=2; hazardHit(r, pv, 0, dir, 0); r.invuln=600;
              spawnBurst3D(r.x,r.y,0x60a5fa); return;
            }
          }
        }
      }
    }
  }
