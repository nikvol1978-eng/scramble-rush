  // ============================================================
  // MINIGAME + OBSTACLE RUNTIME
  // ============================================================
  let boulderTimer=0;
  let shots=[];                     // cannonballs in flight
  const shotMat = new THREE.MeshPhongMaterial({color:0x2b2140, shininess:50});
  const rockMat = new THREE.MeshPhongMaterial({color:0x6b5545, shininess:8, flatShading:true});
  const rockTopMat = new THREE.MeshLambertMaterial({color:0x8a7060, flatShading:true});

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
  function spinlaserAngle(o,t){ return t*o.speed + o.phase; }
  function rollerX(o,t){ return o.cx + Math.sin(t*o.speed+o.phase)*o.amp; }
  function blockShift(o,t){ return Math.sin(t*o.speed+o.phase)*o.amp; }

  function buildMinigameMeshes(){
    const accent = new THREE.Color(currentMap.accent);
    for(const o of obstacles){
      if(o.type==='doors'){
        o.meshes = o.items.map(it=>{
          const g=new THREE.Group();
          const mat = it.fake
            ? new THREE.MeshLambertMaterial({color:0xfff1c9, transparent:true, opacity:0.94})
            : new THREE.MeshPhongMaterial({color:0x5b3aa8, shininess:30});
          const panel=new THREE.Mesh(new THREE.BoxGeometry(it.w, 74, o.d), mat);
          panel.position.y=37; panel.castShadow=true; g.add(panel);
          const frameMat=new THREE.MeshLambertMaterial({color:0x1a1033});
          [-1,1].forEach(s=>{ const p=new THREE.Mesh(new THREE.BoxGeometry(7,80,o.d+4), frameMat); p.position.set(s*(it.w/2+3),40,0); g.add(p); });
          const lintel=new THREE.Mesh(new THREE.BoxGeometry(it.w+14,8,o.d+4), frameMat); lintel.position.y=80; g.add(lintel);
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
          const top=new THREE.Mesh(new THREE.BoxGeometry(tl.w-6,12,tl.d-6), topMat.clone());
          top.receiveShadow=true; g.add(top);
          const under=new THREE.Mesh(new THREE.BoxGeometry(tl.w-14,26,tl.d-14), sideMat);
          under.position.y=-18; g.add(under);
          placeAt(g, tl.x, tl.y, -6);
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

      } else if(o.type==='blockwall'){
        const blockMat=new THREE.MeshPhongMaterial({color:accent.getHex(), shininess:24});
        const edgeMat=new THREE.MeshLambertMaterial({color:0x1a1033});
        o.meshes=o.items.map(it=>{
          const g=new THREE.Group();
          const b=new THREE.Mesh(new THREE.BoxGeometry(it.w,78,o.d), blockMat); b.position.y=39; b.castShadow=true; g.add(b);
          const cap=new THREE.Mesh(new THREE.BoxGeometry(it.w+6,8,o.d+6), edgeMat); cap.position.y=80; g.add(cap);
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
        [-1,1].forEach(s=>{ const e=new THREE.Mesh(new THREE.BoxGeometry(26,34,26), new THREE.MeshLambertMaterial({color:0x1a1033}));
          e.position.set(s*(TRACK_W/2+10), -6, 0); g.add(e); });
        placeAt(g, TRACK_W/2, o.y, o.h);
        courseGroup.add(g);
        o.mesh=g;

      } else if(o.type==='roller'){
        const g=new THREE.Group();
        const barrel=new THREE.Mesh(new THREE.CylinderGeometry(o.r,o.r,86,14),
          new THREE.MeshPhongMaterial({color:accent.getHex(), shininess:26}));
        barrel.rotation.x=Math.PI/2; barrel.castShadow=true; g.add(barrel);
        const band=new THREE.Mesh(new THREE.CylinderGeometry(o.r*1.04,o.r*1.04,14,14),
          new THREE.MeshLambertMaterial({color:0x1a1033}));
        band.rotation.x=Math.PI/2; g.add(band);
        placeAt(g, o.cx, o.y, o.r);
        courseGroup.add(g);
        o.mesh=g; o.barrel=barrel;

      } else if(o.type==='cannon'){
        const barrelMat=new THREE.MeshPhongMaterial({color:0xe6c27a, shininess:40});
        const bandMat=new THREE.MeshLambertMaterial({color:0x1a1033});
        o.meshes=o.items.map(it=>{
          const g=new THREE.Group();
          const barrel=new THREE.Mesh(new THREE.CylinderGeometry(it.r*1.45, it.r*1.2, 92, 14), barrelMat);
          barrel.rotation.z=Math.PI/2; barrel.castShadow=true; g.add(barrel);
          const rim=new THREE.Mesh(new THREE.CylinderGeometry(it.r*1.5, it.r*1.5, 10, 14), bandMat);
          rim.rotation.z=Math.PI/2; rim.position.x=-it.side*28; g.add(rim);
          const mount=new THREE.Mesh(new THREE.BoxGeometry(26,30,40), bandMat);
          mount.position.set(it.side*30,-18,0); g.add(mount);
          // muzzle points into the lane
          placeAt(g, it.side<0 ? 30 : TRACK_W-30, it.y, 54);
          g.rotation.y += it.side<0 ? 0 : Math.PI;
          courseGroup.add(g);
          return {group:g, barrel};
        });

      } else if(o.type==='pendulum'){
        const g=new THREE.Group();
        const barMat=new THREE.MeshLambertMaterial({color:0x1a1033});
        const beam=new THREE.Mesh(new THREE.BoxGeometry(TRACK_W+40,12,12), barMat);
        placeAt(beam, TRACK_W/2, o.y, o.pivotH); courseGroup.add(beam);
        const rod=new THREE.Mesh(new THREE.CylinderGeometry(3,3,o.armLen,8), barMat);
        rod.castShadow=true; g.add(rod);
        const ball=new THREE.Mesh(new THREE.SphereGeometry(o.r,16,12),
          new THREE.MeshPhongMaterial({color:accent.getHex(), shininess:36}));
        ball.castShadow=true; g.add(ball);
        courseGroup.add(g);
        o.mesh=g; o.rod=rod; o.ball=ball;

      } else if(o.type==='bumper'){
        const capMat=new THREE.MeshPhongMaterial({color:0xff4fa3, shininess:60});
        const postMat=new THREE.MeshLambertMaterial({color:0xfff8ec});
        const ringMat=new THREE.MeshBasicMaterial({color:0xffcb3d});
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

      } else if(o.type==='boost'){
        const g=new THREE.Group();
        const pad=new THREE.Mesh(new THREE.BoxGeometry(o.w,3,o.len),
          new THREE.MeshBasicMaterial({color:accent.getHex()}));
        pad.position.y=1.6; g.add(pad);
        // chevrons pointing down the track
        const chevMat=new THREE.MeshBasicMaterial({color:0xfff8ec});
        const n=3;
        for(let i=0;i<n;i++){
          const z=-o.len/2 + o.len*(i+0.5)/n;
          [-1,1].forEach(sd=>{
            const bar=new THREE.Mesh(new THREE.BoxGeometry(o.w*0.42,4,14), chevMat);
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
        const hub=new THREE.Mesh(new THREE.CylinderGeometry(24,30,52,14),
          new THREE.MeshPhongMaterial({color:0x1f2937, shininess:30}));
        hub.position.y=26; hub.castShadow=true; g.add(hub);
        const lamp=new THREE.Mesh(new THREE.SphereGeometry(11,12,10),
          new THREE.MeshBasicMaterial({color:0xa3e635}));
        lamp.position.y=56; g.add(lamp);
        const arms=new THREE.Group(); arms.position.y=o.h; g.add(arms);
        for(let i=0;i<o.arms;i++){
          const arm=new THREE.Group(); arm.rotation.y = i*(Math.PI*2/o.arms); arms.add(arm);
          const beam=new THREE.Mesh(new THREE.CylinderGeometry(4,4,o.len,8),
            new THREE.MeshBasicMaterial({color:0xa3e635}));
          beam.rotation.z=Math.PI/2; beam.position.x=o.len/2; arm.add(beam);
          const halo=new THREE.Mesh(new THREE.CylinderGeometry(9,9,o.len,8),
            new THREE.MeshBasicMaterial({color:0xa3e635, transparent:true, opacity:0.20, depthWrite:false}));
          halo.rotation.z=Math.PI/2; halo.position.x=o.len/2; arm.add(halo);
          const tip=new THREE.Mesh(new THREE.SphereGeometry(8,10,8),
            new THREE.MeshBasicMaterial({color:0xd9f99d}));
          tip.position.x=o.len; arm.add(tip);
        }
        placeAt(g, o.cx, o.y, 0);
        courseGroup.add(g);
        o.mesh=g; o.arms3d=arms;

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
        const mesh=new THREE.Mesh(geo, new THREE.MeshLambertMaterial({color:accent.getHex(), side:THREE.DoubleSide}));
        mesh.receiveShadow=true; mesh.castShadow=true;
        const g=new THREE.Group(); g.add(mesh);
        const lip=new THREE.Mesh(new THREE.BoxGeometry(w+8,6,10), new THREE.MeshLambertMaterial({color:0x1a1033}));
        lip.position.set(0,hgt+2,len/2); g.add(lip);
        placeAt(g, o.cx, (o.yStart+o.yEnd)/2, 0);
        courseGroup.add(g);
        o.mesh=g;
      }
    }
    buildFinishArea();
    if(currentMap.mode==='boulder'){ boulderTimer=1.2; }
  }

  // The line itself plus the pen you can wander in once you are over it.
  function buildFinishArea(){
    const z = trackLength;
    const line=new THREE.Mesh(new THREE.BoxGeometry(TRACK_W,2.4,14),
      new THREE.MeshLambertMaterial({map:checkerTexture('#ffffff','#1a1033',1)}));
    placeAt(line, TRACK_W/2, z, 0.9); courseGroup.add(line);

    const postMat=new THREE.MeshPhongMaterial({color:0xff4fa3, shininess:30});
    const barMat =new THREE.MeshLambertMaterial({color:0x1a1033});
    [-1,1].forEach(s=>{
      const post=new THREE.Mesh(new THREE.CylinderGeometry(9,11,120,10), postMat);
      placeAt(post, TRACK_W/2 + s*(TRACK_W/2-14), z, 60); post.castShadow=true; courseGroup.add(post);
    });
    const beam=new THREE.Mesh(new THREE.BoxGeometry(TRACK_W-8,20,16), postMat);
    placeAt(beam, TRACK_W/2, z, 120); beam.castShadow=true; courseGroup.add(beam);
    const trim=new THREE.Mesh(new THREE.BoxGeometry(TRACK_W+4,6,20), barMat);
    placeAt(trim, TRACK_W/2, z, 132); courseGroup.add(trim);
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

  function updateMinigames(dt,t){
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
        if(it.cool<=0){
          it.cool = it.interval;
          const b = { x: it.side<0 ? 10 : TRACK_W-10, y: it.y, r: it.r,
                      vx: it.side<0 ? it.speed : -it.speed, spin:0 };
          const g = new THREE.Mesh(new THREE.SphereGeometry(it.r,14,10), shotMat);
          g.castShadow=true; placeAt(g, b.x, b.y, it.r+26);
          courseGroup.add(g); b.mesh=g;
          shots.push(b);
          if(o.meshes && o.meshes[i]) o.meshes[i].recoil = 1;
        }
      }
    }
    for(let i=shots.length-1;i>=0;i--){
      const b=shots[i];
      b.x += b.vx*dt; b.spin += b.vx*dt/b.r;
      placeAt(b.mesh, b.x, b.y, b.r+26);
      b.mesh.rotation.z = -b.spin;
      if(b.x < -60 || b.x > TRACK_W+60){ courseGroup.remove(b.mesh); shots.splice(i,1); continue; }
      for(const r of racers){
        if(r.falling||r.finished||r.invuln>0) continue;
        if(r.h > b.r*1.9 + 26) continue;                 // jumped it
        if(Math.hypot(r.x-b.x, r.y-b.y) < b.r+RADIUS-6){
          const dir=Math.sign(b.vx)||1;
          r.vx += dir*11; r.vy += rand(-2,2); r.stumbleT=520; r.invuln=700;
          r.vh=4.2; if(r.h===0) r.h=0.01;
          spawnBurst3D(r.x,r.y,0x2b2140);
          if(r.isPlayer){ SFX.hit(); camShake=8; }
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
        if(tl.touched && !tl.gone){
          tl.fuse -= dt;
          if(tl.mesh){
            const wob = Math.sin(t*26)*Math.max(0, 1-tl.fuse/field.fuseTime)*2.2;
            tl.mesh.position.y = tl.baseY + wob;
            if(tl.topMat && tl.topMat.color) tl.topMat.color.setHex(tl.fuse<field.fuseTime*0.4 ? 0xff7a5c : 0xffd166);
          }
          if(tl.fuse<=0){ tl.gone=true; tl.drop=0; tl.back=field.respawnTime; spawnBurst3D(tl.x, tl.y, 0x8a7060, 5); }
        } else if(tl.gone){
          if(tl.drop<1){
            tl.drop += dt*1.6;
            if(tl.mesh){ tl.mesh.position.y = tl.baseY - tl.drop*140; tl.mesh.rotation.z = tl.drop*0.5;
              if(tl.drop>=1) tl.mesh.visible=false; }
          } else {
            tl.back -= dt;
            if(tl.back<=0){
              // rebuild: rise back into place
              tl.gone=false; tl.touched=false; tl.fuse=-1; tl.drop=0;
              if(tl.mesh){ tl.mesh.visible=true; tl.mesh.rotation.z=0; tl.mesh.position.y=tl.baseY;
                if(tl.topMat && tl.topMat.color) tl.topMat.color.setHex(0xffffff); }
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
        if(c.touched && !c.gone){
          c.fuse -= dt;
          if(c.mesh){
            c.mesh.position.y = c.baseY + Math.sin(t*30)*Math.max(0,1-c.fuse/hf.fuseTime)*2.4;
            if(c.topMat && c.topMat.color) c.topMat.color.setHex(c.fuse<hf.fuseTime*0.45 ? 0xff5a4d : 0xffd166);
          }
          if(c.fuse<=0){ c.gone=true; c.drop=0; c.back=hf.respawnTime; spawnBurst3D(c.x,c.y,0xa78bfa,6); }
        } else if(c.gone){
          if(c.drop<1){
            c.drop += dt*1.5;
            if(c.mesh){ c.mesh.position.y = c.baseY - c.drop*160; c.mesh.rotation.x = c.drop*0.6;
              if(c.drop>=1) c.mesh.visible=false; }
          } else {
            c.back -= dt;
            if(c.back<=0){
              c.gone=false; c.touched=false; c.fuse=-1; c.drop=0;
              if(c.mesh){ c.mesh.visible=true; c.mesh.rotation.x=0; c.mesh.position.y=c.baseY;
                if(c.topMat && c.topMat.color) c.topMat.color.setHex(0xffffff); }
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
    if(!inNarrow){ if(r.x<RADIUS+4){ r.x=RADIUS+4; r.vx=Math.abs(r.vx)*0.3; } if(r.x>TRACK_W-RADIUS-4){ r.x=TRACK_W-RADIUS-4; r.vx=-Math.abs(r.vx)*0.3; } }

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

    // ---- ground hazards (only when on the ground) ----
    if(r.h<=0.5){
      if(inPit){
        let onPlat=false;
        for(const p of inPit.platforms){ if(Math.abs(r.x-platX(p,t))<p.width/2+RADIUS-8){ onPlat=true; break; } }
        if(!onPlat){ fallDown(r); return; }
      }
      if(inNarrow){
        const o=obstacles.find(o=>o.type==='narrow'&&r.y>o.yStart&&r.y<o.yEnd);
        if(Math.abs(r.x-TRACK_W/2)>o.halfWidth+RADIUS-10){ fallDown(r); return; }
      }
      if(field){
        const tl=tileAt(field, r.x, r.y);
        const grace = raceTime < (r.tileGraceUntil||-1);
        if(!grace && (!tl || (tl.gone && tl.drop>0.12))){ fallDown(r); return; }
        if(tl && !tl.gone){ tl.touched=true; tl.fuse=field.fuseTime; }
      }
      if(hf){
        const grace = raceTime < (r.tileGraceUntil||-1);
        const col = hexColumnAt(hf, r.x, r.y);
        const floor = hexFloor(col);
        if(!floor){ if(!grace){ fallDown(r); return; } }
        else {
          r.floorH = floor.hy;
          if(!floor.touched){ floor.touched=true; floor.fuse=hf.fuseTime; }
        }
      }
    }
    if(!field && !hf && !ramp && !r.onRamp) r.floorH = 0;

    if(r.invuln>0) return;
    for(const o of obstacles){
      if(r.y<o.y0-40||r.y>o.y1+40) continue;

      if(o.type==='pillars'){
        for(const it of o.items){
          const dx=r.x-it.x, dy=r.y-o.y; const d=Math.hypot(dx,dy);
          if(d<it.r+RADIUS-4){
            const nx=dx/(d||1), ny=dy/(d||1); const pen=it.r+RADIUS-4-d;
            r.x+=nx*pen; r.y+=ny*pen;
            const vn=r.vx*nx+r.vy*ny;
            if(vn<0){ r.vx-=vn*nx*1.4; r.vy-=vn*ny*1.4; if(-vn>4){ r.stumbleT=250; spawnBurst3D(r.x,r.y,0xffffff,5); if(r.isPlayer) SFX.bump(); } }
            r.vx += (nx>=0?1:-1)*0.8;
          }
        }

      } else if(o.type==='doors'){
        if(Math.abs(r.y-o.y) < o.d/2 + RADIUS && r.h < 62){
          for(let i=0;i<o.items.length;i++){
            const it=o.items[i];
            if(Math.abs(r.x-it.x) > it.w/2 + RADIUS - 8) continue;
            if(it.fake){
              if(!it.broken){
                it.broken=true;
                const m=o.meshes && o.meshes[i];
                if(m){ m.panel.visible=false; }
                spawnBurst3D(it.x, o.y, 0xfff1c9, 14);
                r.vy *= 0.62; r.stumbleT=Math.max(r.stumbleT,120);
                if(r.isPlayer){ SFX.bump(); camShake=3; }
              }
            } else {
              const side = Math.sign(r.y-o.y)||-1;
              r.y = o.y + side*(o.d/2 + RADIUS);
              if(side<0 && r.vy>0){ r.vy = -Math.abs(r.vy)*0.35 - 1; r.stumbleT=340; r.invuln=260;
                spawnBurst3D(r.x, o.y, 0x5b3aa8, 8);
                if(r.isPlayer){ SFX.hit(); camShake=5; } }
              r.vx += (r.x < it.x ? -1 : 1)*5.2;   // deflect toward a gap instead of sticking
            }
          }
        }

      } else if(o.type==='blockwall'){
        if(Math.abs(r.y-o.y) < o.d/2 + RADIUS && r.h < 70){
          const shift=blockShift(o,t);
          for(const it of o.items){
            const bx=it.x+shift;
            if(Math.abs(r.x-bx) > it.w/2 + RADIUS - 6) continue;
            const side = Math.sign(r.y-o.y)||-1;
            r.y = o.y + side*(o.d/2 + RADIUS);
            if(side<0 && r.vy>0){ r.vy=-Math.abs(r.vy)*0.3-1; r.stumbleT=380; r.invuln=280;
              spawnBurst3D(r.x,o.y,0xff8a5c,8); if(r.isPlayer){ SFX.hit(); camShake=5; } }
            // shove sideways toward the nearer edge so you slide off rather than stick
            r.vx += (r.x < bx ? -1 : 1)*3.4;
          }
        }

      } else if(o.type==='laserbar'){
        const by=laserY(o,t);
        if(Math.abs(r.y-by) < 12 + RADIUS*0.60){
          // while diving you are only about half as tall
          const top = r.h + (r.diveT>0 ? 18 : 34);
          const bandLo=o.h-5, bandHi=o.h+5;
          if(r.h < bandHi && top > bandLo){
            const side=Math.sign(r.y-by)||-1;
            r.y = by + side*(9+RADIUS*0.45);
            r.vy = side*Math.abs(r.vy)*0.4 - (side<0?1.5:0);
            r.stumbleT=420; r.invuln=620; r.vh=2.6; if(r.h===0) r.h=0.01;
            spawnBurst3D(r.x, by, o.low?0xff2d6f:0x26d5ff, 10);
            if(r.isPlayer){ SFX.hit(); camShake=6; }
            return;
          }
        }

      } else if(o.type==='roller'){
        const rx=rollerX(o,t);
        if(r.h < o.r*1.4){
          const dx=r.x-rx, dy=r.y-o.y, d=Math.hypot(dx,dy);
          if(d < o.r+RADIUS-6){
            const nx=dx/(d||1), ny=dy/(d||1);
            r.vx += nx*8 + Math.cos(t*o.speed+o.phase)*o.speed*o.amp*0.02;
            r.vy += ny*4;
            r.stumbleT=430; r.invuln=600; r.vh=3; if(r.h===0) r.h=0.01;
            spawnBurst3D(r.x,r.y,0xffcb3d,8);
            if(r.isPlayer){ SFX.hit(); camShake=6; }
            return;
          }
        }

      } else if(o.type==='bumper'){
        for(const it of o.items){
          const dx=r.x-it.x, dy=r.y-o.y, d=Math.hypot(dx,dy);
          if(d < it.r+RADIUS-2 && r.h < 46){
            const nx=dx/(d||1), ny=dy/(d||1);
            r.x = it.x + nx*(it.r+RADIUS); r.y = o.y + ny*(it.r+RADIUS);
            // pinball: fling outward, harder the faster you hit it
            const sp = Math.hypot(r.vx,r.vy);
            const kick = 6.2 + sp*0.55;
            r.vx = nx*kick; r.vy = ny*kick;
            r.squash = 0.9; r.stumbleT = 200; r.invuln = 240; it.hit = 1;
            spawnBurst3D(r.x,r.y,0xff4fa3,8);
            if(r.isPlayer){ SFX.bump(); camShake=4; }
            return;
          }
        }

      } else if(o.type==='boost'){
        if(r.h < 30 && Math.abs(r.y-o.y) < o.len/2 + RADIUS && Math.abs(r.x-o.cx) < o.w/2 + RADIUS - 8){
          // a speed floor rather than an impulse, so it does not depend on frame rate
          if(r.vy < o.power) r.vy = o.power;
          if(r.isPlayer && Math.random()<0.30) spawnBurst3D(r.x,r.y,0xffd54f,3);
        }

      } else if(o.type==='pendulum'){
        const pp = pendPos(o,t);
        if(Math.abs(r.y-o.y) < o.r+RADIUS && Math.abs(r.x-pp.x) < o.r+RADIUS-4){
          const top = r.h + (r.diveT>0?18:34);
          if(top > pp.h-o.r && r.h < pp.h+o.r){
            const dir = Math.sign(Math.cos(pendAngle(o,t))*Math.cos(t*o.speed+o.phase)) || 1;
            const away = Math.sign(r.x-pp.x) || dir;
            r.vx += away*10; r.vy -= 3; r.stumbleT=540; r.invuln=700;
            r.vh=4.6; if(r.h===0) r.h=0.01;
            spawnBurst3D(r.x,r.y,0xffffff,12);
            if(r.isPlayer){ SFX.hit(); camShake=8; }
            return;
          }
        }

      } else if(o.type==='spinlaser'){
        const top = r.h + (r.diveT>0?18:34);
        if(top > o.h-6 && r.h < o.h+6){
          const dx=r.x-o.cx, dy=r.y-o.y, dist=Math.hypot(dx,dy);
          if(dist > 14 && dist < o.len){
            const ang=Math.atan2(dy,dx), base=spinlaserAngle(o,t), step=Math.PI*2/o.arms;
            for(let i=0;i<o.arms;i++){
              let d = ang - (base + i*step);
              while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2;
              // perpendicular distance to the arm, and only the half it points down
              if(Math.cos(d) > 0 && Math.abs(Math.sin(d))*dist < 10+RADIUS-8){
                const away = Math.sign(Math.sin(d)) || 1;
                const px=-Math.sin(base+i*step)*away, py=Math.cos(base+i*step)*away;
                r.vx += px*8; r.vy += py*8;
                r.stumbleT=460; r.invuln=680; r.vh=3.4; if(r.h===0) r.h=0.01;
                spawnBurst3D(r.x,r.y,0xa3e635,10);
                if(r.isPlayer){ SFX.hit(); camShake=6; }
                return;
              }
            }
          }
        }

      } else if(o.type==='hammer'){
        if(Math.abs(r.y-o.y)<o.band/2+RADIUS){
          for(const it of o.items){
            const ang=hammerAngle(it,t); const hx=it.pivotX+Math.sin(ang)*it.armLen; const hy=96-76*Math.cos(ang)-RADIUS;
            const d=Math.hypot(r.x-hx, r.y-o.y);
            if(d<34+RADIUS-8 && hy+24>r.h && hy-24<r.h+RADIUS*2){ knockback(r,hx,o.y,6); return; }
          }
        }

      } else if(o.type==='spinbar'){
        // The mesh spins via rotation.y, which sends local +X to world (cos a, 0, -sin a).
        // The collision segment has to use that same -sin, or the hitbox is mirrored in Z.
        if(r.h<33 && Math.abs(r.y-o.y)<o.length/2+30){
          const ang=spinAngle(o,t);
          const dx=Math.cos(ang)*o.length/2, dy=-Math.sin(ang)*o.length/2;
          const d=segPointDist(o.cx-dx,o.y-dy,o.cx+dx,o.y+dy,r.x,r.y);
          if(d<o.thickness/2+RADIUS-6){
            const relx=r.x-o.cx, rely=r.y-o.y; const sw=Math.sign(o.speed);
            const tx=rely*sw, ty=-relx*sw; const tl=Math.hypot(tx,ty)||1;
            r.vx+=tx/tl*7; r.vy+=ty/tl*7; r.stumbleT=450; r.invuln=650; r.vh=3.5; if(r.h===0) r.h=0.01;
            spawnBurst3D(r.x,r.y,0xffffff); if(r.isPlayer){ SFX.hit(); camShake=6; } return;
          }
        }

      } else if(o.type==='pusher'){
        if(r.h<30 && Math.abs(r.y-o.y)<o.d/2+RADIUS){
          for(const it of o.items){
            const px=platX(it,t);
            if(Math.abs(r.x-px)<it.width/2+RADIUS-4){
              const dir=Math.sign(Math.cos(t*it.speed+it.phase)*it.speed)||1;
              r.vx+=dir*9; r.vy-=2; r.stumbleT=420; r.invuln=600; r.vh=3; if(r.h===0) r.h=0.01;
              spawnBurst3D(r.x,r.y,0x60a5fa); if(r.isPlayer){ SFX.hit(); camShake=6; } return;
            }
          }
        }
      }
    }
  }
