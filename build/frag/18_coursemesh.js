  // ============================================================
  // COURSE MESHES
  // ============================================================
  // Ground and walls are boxes along Z on a straight course (byte-identical to
  // the original) and swept quad strips when the map has a path. Every obstacle
  // is placed through toWorld/placeAt, which reduces to the old transform when
  // there is no path.

  // Sweep a quad strip along the ribbon. edgeFn(s) returns the two edge points.
  function ribbonStrip(z0, z1, edgeFn, uvFn){
    const steps = Math.max(2, Math.ceil((z1-z0)/PATH_STEP));
    const pos=[], uv=[];
    let prev = edgeFn(z0), prevS = z0;
    for(let i=1;i<=steps;i++){
      const s = z0 + (z1-z0)*(i/steps);
      const cur = edgeFn(s);
      pos.push(prev[0].x,prev[0].y,prev[0].z,  cur[0].x,cur[0].y,cur[0].z,  cur[1].x,cur[1].y,cur[1].z);
      pos.push(prev[0].x,prev[0].y,prev[0].z,  cur[1].x,cur[1].y,cur[1].z,  prev[1].x,prev[1].y,prev[1].z);
      if(uvFn){
        const a=uvFn(prevS), b=uvFn(s);
        uv.push(a[0][0],a[0][1], b[0][0],b[0][1], b[1][0],b[1][1],
                a[0][0],a[0][1], b[1][0],b[1][1], a[1][0],a[1][1]);
      }
      prev = cur; prevS = s;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    if(uvFn) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
    g.computeVertexNormals();
    return g;
  }

  let courseLook = null;
  function buildCourseMeshes(){
    clearGroup(courseGroup);
    clearFadeables();
    const specials = obstacles.filter(o=>o.type==='pit'||o.type==='narrow'||o.type==='tilefield'||o.type==='hexfield'
                                        ||o.type==='mover'||o.type==='crumble'||o.type==='gap'||o.type==='discField'
                                        ||o.type==='plank')
                              .sort((a,b)=>a.yStart-b.yStart);
    let cursor=-300; const endZ=trackLength+FINISH_ZONE+170;
    // Closing Circle and Carousel are a platform surrounded by nothing. Laying
    // the usual corridor under them would just floor the whole arena.
    const arenaOnly = currentMap.mode==='shrink' || currentMap.mode==='spin';
    // ---- the v20 look: a neutral floor, pale walls, loud hazards ----
    // One warm key, a cool fill from the sky, and a haze that matches it.
    const accents = mapAccents();
    const floorHex = neutralFloor(currentMap.ground);
    const floorAltHex = mixHex(floorHex, neutralFloor(currentMap.groundAlt), 0.5);   // half the old contrast
    currentMap.__floorHex = floorHex;
    hemi.color.set(currentMap.skyTop); hemi.groundColor.set(floorHex);
    fillLight.color.set(currentMap.skyMid);
    if(scene.fog){ scene.fog.color.set(currentMap.skyMid); scene.fog.near = 900; scene.fog.far = 2700; }
    const paleWall = paleOf(currentMap.ground);
    const voidMat = new THREE.MeshLambertMaterial({color:0x1b1040});
    const wallMat = new THREE.MeshLambertMaterial({color:paleWall});
    const wallTopMat = new THREE.MeshLambertMaterial({color:accents[0]});       // the accent rail
    const skirtMat = new THREE.MeshLambertMaterial({color:mixHex(paleWall, floorHex, 0.5)});
    const mapGroundTex = checkerTexture(floorHex, floorAltHex, 1);
    const mapStripeTex = stripeTexture('#ffffff', accents[0]);
    // Materials for the things that hit you. Tagged with their accent so the
    // contrast check can read the colour a mesh is painted with.
    const hazardMat = (i, extra)=>{ const m = new THREE.MeshLambertMaterial(Object.assign({color:accents[i%3]}, extra||{})); m.userData.hazard = accents[i%3]; return m; };
    const stripeMat = (i)=>{ const m = new THREE.MeshLambertMaterial({map:stripeTexture('#ffffff', accents[i%3])}); m.userData.hazard = accents[i%3]; return m; };
    courseLook = { accents, floorHex, paleWall, hazardMat, stripeMat, softMat:(i)=>new THREE.MeshLambertMaterial({color:softAccent(accents[i%3])}) };

    function addGround(x0,x1,z0,z1,sunken){
      const w=x1-x0, d=z1-z0; if(w<=0||d<=0) return;
      let mat;
      if(sunken){ mat=voidMat; }
      else { const tex=mapGroundTex.clone(); tex.needsUpdate=true; tex.repeat.set(w/190, d/190); tex.offset.set(x0/190, z0/190); mat=new THREE.MeshLambertMaterial({map:tex}); }
      if(!coursePath){
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,sunken?4:12,d), mat);
        mesh.position.set(toSceneX((x0+x1)/2), sunken?-62:-6, (z0+z1)/2);
        mesh.receiveShadow=true; courseGroup.add(mesh);
        if(!sunken){
          const skirt=new THREE.Mesh(new THREE.BoxGeometry(w+2,40,d+2), skirtMat);
          skirt.position.set(mesh.position.x,-32,mesh.position.z); courseGroup.add(skirt);
        }
        return;
      }
      // swept along the path
      const yTop = sunken ? -62 : -6;
      const surf = ribbonStrip(z0, z1,
        s=>[toWorld(x0,s,yTop), toWorld(x1,s,yTop)],
        sunken ? null : s=>[[x0/190, s/190],[x1/190, s/190]]);
      if(sunken){ mat = voidMat; }
      const m = new THREE.Mesh(surf, mat); m.material.side = THREE.DoubleSide;
      m.receiveShadow=true; courseGroup.add(m);
      if(!sunken){
        // a skirt hanging under each edge, so the ribbon reads as solid ground
        [[x0,-1],[x1,1]].forEach(([xe])=>{
          const side = ribbonStrip(z0, z1, s=>[toWorld(xe,s,-6), toWorld(xe,s,-52)]);
          const sm = new THREE.Mesh(side, skirtMat); sm.material.side=THREE.DoubleSide;
          courseGroup.add(sm);
        });
      }
    }
    function addWall(xPos,z0,z1){
      const d=z1-z0; if(d<=0) return;
      if(!coursePath){
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(8,30,d), wallMat);
        mesh.position.set(toSceneX(xPos),15,(z0+z1)/2); mesh.castShadow=true; mesh.receiveShadow=true; courseGroup.add(mesh); registerFadeable(mesh);
        const top=new THREE.Mesh(new THREE.BoxGeometry(10,4,d), wallTopMat); top.position.set(toSceneX(xPos),31,(z0+z1)/2); courseGroup.add(top);
        return;
      }
      const face = ribbonStrip(z0, z1, s=>[toWorld(xPos,s,0), toWorld(xPos,s,30)]);
      const fm = new THREE.Mesh(face, wallMat); fm.material.side=THREE.DoubleSide;
      fm.castShadow=true; fm.receiveShadow=true; courseGroup.add(fm); registerFadeable(fm);
      const cap = ribbonStrip(z0, z1, s=>[toWorld(xPos-5,s,31), toWorld(xPos+5,s,31)]);
      const cm = new THREE.Mesh(cap, wallTopMat); cm.material.side=THREE.DoubleSide; courseGroup.add(cm);
    }

    if(arenaOnly){ buildMinigameMeshes(); buildWaveMeshes(); resetWaves(); resetEvents(); startMusic(currentMap.key); return; }

    for(const o of specials){
      if(o.yStart>cursor){ addGround(0,TRACK_W,cursor,o.yStart,false); addWall(0,cursor,o.yStart); addWall(TRACK_W,cursor,o.yStart); }
      if(o.type==='gap'){
        addGround(0, o.cx-o.halfWidth, o.yStart, o.yEnd, false);
        addGround(o.cx-o.halfWidth, o.cx+o.halfWidth, o.yStart, o.yEnd, true);
        addGround(o.cx+o.halfWidth, TRACK_W, o.yStart, o.yEnd, false);
        addWall(0,o.yStart,o.yEnd); addWall(TRACK_W,o.yStart,o.yEnd);
        cursor=o.yEnd;
        continue;
      }
      if(o.type==='mover' || o.type==='crumble'){
        // the drop these two are built over -- the platform and the slabs are
        // the only way across, and they are made in buildMinigameMeshes
        addGround(0,TRACK_W,o.yStart,o.yEnd,true);
        addWall(0,o.yStart,o.yEnd); addWall(TRACK_W,o.yStart,o.yEnd);
        cursor=o.yEnd;
        continue;
      }
      if(o.type==='pit'){
        addGround(0,TRACK_W,o.yStart,o.yEnd,true);
        addWall(0,o.yStart,o.yEnd); addWall(TRACK_W,o.yStart,o.yEnd);
        const platMat=new THREE.MeshPhongMaterial({color:0x23e6c9, shininess:30});
        o.platformMeshes=o.platforms.map(p=>{
          const g=new THREE.Group();
          const top=new THREE.Mesh(new THREE.BoxGeometry(p.width,12,o.yEnd-o.yStart), platMat); top.receiveShadow=true; top.castShadow=true; g.add(top);
          const under=new THREE.Mesh(new THREE.BoxGeometry(p.width-10,30,o.yEnd-o.yStart-10), new THREE.MeshLambertMaterial({color:0x0e9e8a})); under.position.y=-20; g.add(under);
          placeAt(g, TRACK_W/2, (o.yStart+o.yEnd)/2, -6); courseGroup.add(g); return g;
        });
      } else if(o.type==='narrow'){
        const ncx=TRACK_W/2 + (o.offset||0);
        addGround(ncx-o.halfWidth, ncx+o.halfWidth, o.yStart,o.yEnd,false);
        addGround(0, ncx-o.halfWidth, o.yStart,o.yEnd,true);
        addGround(ncx+o.halfWidth, TRACK_W, o.yStart,o.yEnd,true);
        [ncx-o.halfWidth, ncx+o.halfWidth].forEach(x=>{
          for(let z=o.yStart+20; z<o.yEnd; z+=60){
            const post=new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.5,16,6), darkMat);
            placeAt(post, x, z, 8); courseGroup.add(post);
          }
        });
      } else if(o.type==='tilefield'||o.type==='hexfield'||o.type==='discField'||o.type==='plank'){
        addGround(0,TRACK_W,o.yStart,o.yEnd,true);
        addWall(0,o.yStart,o.yEnd); addWall(TRACK_W,o.yStart,o.yEnd);
      }
      cursor=o.yEnd;
    }
    if(cursor<endZ){ addGround(0,TRACK_W,cursor,endZ,false); addWall(0,cursor,endZ); addWall(TRACK_W,cursor,endZ); }

    // start line
    const sl=new THREE.Mesh(new THREE.BoxGeometry(TRACK_W,2,10), new THREE.MeshLambertMaterial({color:0xff4fa3}));
    placeAt(sl, TRACK_W/2, 0, 0.6); courseGroup.add(sl);

    // Pillars only block, so they are soft; everything that swings, spins or
    // shoves is a saturated accent with a white-and-accent stripe on the face
    // that hits you.
    const pillarMat=courseLook.softMat(2);
    const pillarCapMat=new THREE.MeshLambertMaterial({color:accents[2]});
    const maceMat=courseLook.stripeMat(0);
    const poleMat=new THREE.MeshLambertMaterial({color:0x1a1033});
    const barMat=courseLook.stripeMat(1);
    const pusherMat=courseLook.hazardMat(1);
    const pusherFaceMat=courseLook.stripeMat(1);

    for(const o of obstacles){
      if(o.type==='pillars'){
        o.meshes = o.items.map(it=>{
          const mesh=new THREE.Mesh(new THREE.CylinderGeometry(it.r,it.r*1.05,60,18), pillarMat);
          placeAt(mesh, it.x, o.y, 30); mesh.castShadow=true; mesh.receiveShadow=true; courseGroup.add(mesh); registerFadeable(mesh);
          const cap=new THREE.Mesh(new THREE.CylinderGeometry(it.r*1.1,it.r*1.1,8,18), pillarCapMat);
          placeAt(cap, it.x, o.y, 62); cap.castShadow=true; courseGroup.add(cap);
          const out=new THREE.Mesh(new THREE.CylinderGeometry(it.r*1.1,it.r*1.15,62,18), outlineMat);
          out.position.copy(mesh.position); courseGroup.add(out);
          return mesh;
        });
      } else if(o.type==='hammer'){
        const xs=o.items.map(i=>i.pivotX);
        const beam=new THREE.Mesh(new THREE.BoxGeometry(Math.max(...xs)-Math.min(...xs)+40,8,8), poleMat);
        placeAt(beam, (Math.max(...xs)+Math.min(...xs))/2, o.y, 100); beam.castShadow=true; courseGroup.add(beam);
        for(const it of o.items){
          const pole=new THREE.Mesh(new THREE.CylinderGeometry(4,5,100,8), poleMat);
          placeAt(pole, it.pivotX, o.y, 50); pole.castShadow=true; courseGroup.add(pole);
          const mace=new THREE.Mesh(new THREE.IcosahedronGeometry(24,0), maceMat); mace.castShadow=true; courseGroup.add(mace);
          const maceOut=new THREE.Mesh(new THREE.IcosahedronGeometry(24*1.16,0), outlineMat); courseGroup.add(maceOut);
          const rod=new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.5,1,6), poleMat); courseGroup.add(rod);
          const pv=toWorld(it.pivotX, o.y, 96);
          it.mesh={mace,maceOut,rod,pivot:{x:pv.x,y:pv.y,z:pv.z}};
        }
      } else if(o.type==='spinbar'){
        const g=new THREE.Group();
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(o.length,22,o.thickness), barMat); mesh.castShadow=true; g.add(mesh);
        const out=new THREE.Mesh(new THREE.BoxGeometry(o.length+5,26,o.thickness+5), outlineMat); g.add(out);
        placeAt(g, o.cx, o.y, 22); courseGroup.add(g);
        const hub=new THREE.Mesh(new THREE.CylinderGeometry(16,18,40,12), darkMat);
        placeAt(hub, o.cx, o.y, 20); courseGroup.add(hub);
        o.mesh=g;
      } else if(o.type==='pusher'){
        const rail=new THREE.Mesh(new THREE.BoxGeometry(TRACK_W-16,3,o.d+6), new THREE.MeshLambertMaterial({color:0x2a1a55}));
        placeAt(rail, TRACK_W/2, o.y, 1); courseGroup.add(rail);
        o.meshes=o.items.map(it=>{
          const g=new THREE.Group();
          const box=new THREE.Mesh(new THREE.BoxGeometry(it.width,34,it.d), pusherMat); box.castShadow=true; g.add(box);
          const out=new THREE.Mesh(new THREE.BoxGeometry(it.width+5,38,it.d+5), outlineMat); g.add(out);
          const face=new THREE.Mesh(new THREE.BoxGeometry(it.width-6,30,3), pusherFaceMat); face.position.set(0,0,-it.d/2-1.2); g.add(face);
          placeAt(g, TRACK_W/2, o.y, 17); courseGroup.add(g); return g;
        });
      }
    }

    buildMinigameMeshes();
    buildWaveMeshes(); resetWaves(); resetEvents(); startMusic(currentMap.key);

    // The floating spheres, cones and rings are gone. What flanks the track
    // now is on the ground: crowd stands with a handful of tiny beans in them,
    // every 900 units, bobbing along.
    if(!arenaOnly){
      const standMat = new THREE.MeshLambertMaterial({color:paleWall});
      const standRail = new THREE.MeshLambertMaterial({color:accents[0]});
      const crowdSkins = SKINS.filter(s=>s.rarity==='common' || s.rarity==='rare');
      for(let z=450; z<trackLength-200; z+=900){
        [-1,1].forEach(s=>{
          const x = s<0 ? -78 : TRACK_W+78;
          const stand = new THREE.Mesh(new THREE.BoxGeometry(100, 24, 230), standMat);
          placeAt(stand, x, z, 12); courseGroup.add(stand);
          const rail = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 230), standRail);
          placeAt(rail, s<0 ? x+50 : x-50, z, 28); courseGroup.add(rail);
          const n = 8 + Math.floor(rand(0,5));
          for(let i=0;i<n;i++){
            const sk = pick(crowdSkins);
            const bean = new THREE.Mesh(beanGeometry(), new THREE.MeshToonMaterial({color:skinBaseColor(sk), gradientMap:toonRamp()}));
            bean.scale.setScalar(0.55);
            placeAt(bean, x + rand(-28, 28), z + (i/(n-1) - 0.5)*200, 24 + 9);
            bean.rotation.y = (s<0 ? -1 : 1) * Math.PI/2 + rand(-0.4, 0.4);
            bean.userData.crowd = { y: bean.position.y, ph: rand(0,6.28), rate: rand(2.5,4.5) };
            courseGroup.add(bean);
          }
        });
      }
    }
    // Big flat low-poly clouds, drifting slowly, well above the course.
    for(let i=0;i<12;i++){
      const g=new THREE.Group(); const cm=new THREE.MeshLambertMaterial({color:0xffffff});
      for(let j=0;j<3;j++){ const c=new THREE.Mesh(new THREE.IcosahedronGeometry(rand(38,66),0), cm); c.scale.set(1.6, 0.42, 1.0); c.position.set(j*64-64, rand(-6,6), rand(-14,14)); g.add(c); }
      const w=toWorld(TRACK_W/2, rand(-200,endZ), 0);
      g.position.set(w.x+rand(-1100,1100), w.y+rand(260,420), w.z); g.userData.cloud=rand(3,8); courseGroup.add(g);
    }

    lavaMesh=null; lavaGlow=null;
    if(currentMap.mode==='lava'){
      lavaMesh=new THREE.Mesh(new THREE.PlaneGeometry(TRACK_W+240, 900), new THREE.MeshBasicMaterial({color:0xff5a2e, transparent:true, opacity:0.93}));
      lavaMesh.rotation.x=-Math.PI/2; lavaMesh.position.set(0,3,lavaZ); courseGroup.add(lavaMesh);
      lavaGlow=new THREE.Mesh(new THREE.PlaneGeometry(TRACK_W+260,44), new THREE.MeshBasicMaterial({color:0xffcb3d, transparent:true, opacity:0.6, side:THREE.DoubleSide}));
      lavaGlow.rotation.x=-Math.PI/2; lavaGlow.position.set(0,5,lavaZ+30); courseGroup.add(lavaGlow);
    }
  }
