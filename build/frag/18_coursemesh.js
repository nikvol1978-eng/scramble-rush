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

  function buildCourseMeshes(){
    clearGroup(courseGroup);
    clearFadeables();
    const specials = obstacles.filter(o=>o.type==='pit'||o.type==='narrow'||o.type==='tilefield'||o.type==='hexfield'
                                        ||o.type==='mover'||o.type==='crumble')
                              .sort((a,b)=>a.yStart-b.yStart);
    let cursor=-300; const endZ=trackLength+FINISH_ZONE+170;
    // Closing Circle and Carousel are a platform surrounded by nothing. Laying
    // the usual corridor under them would just floor the whole arena.
    const arenaOnly = currentMap.mode==='shrink' || currentMap.mode==='spin';
    const voidMat = new THREE.MeshLambertMaterial({color:0x1b1040});
    const wallMat = new THREE.MeshLambertMaterial({color:currentMap.wall});
    const wallTopMat = new THREE.MeshLambertMaterial({color:currentMap.wallTop});
    const skirtMat = new THREE.MeshLambertMaterial({color:currentMap.groundAlt});
    const mapGroundTex = checkerTexture(currentMap.ground, currentMap.groundAlt, 2);
    const mapStripeTex = stripeTexture(currentMap.accent, '#1a1033');

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

    if(arenaOnly){ buildMinigameMeshes(); buildWaveMeshes(); resetWaves(); resetEvents(); return; }

    for(const o of specials){
      if(o.yStart>cursor){ addGround(0,TRACK_W,cursor,o.yStart,false); addWall(0,cursor,o.yStart); addWall(TRACK_W,cursor,o.yStart); }
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
        const ncx=TRACK_W/2;
        addGround(ncx-o.halfWidth, ncx+o.halfWidth, o.yStart,o.yEnd,false);
        addGround(0, ncx-o.halfWidth, o.yStart,o.yEnd,true);
        addGround(ncx+o.halfWidth, TRACK_W, o.yStart,o.yEnd,true);
        [ncx-o.halfWidth, ncx+o.halfWidth].forEach(x=>{
          for(let z=o.yStart+20; z<o.yEnd; z+=60){
            const post=new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.5,16,6), darkMat);
            placeAt(post, x, z, 8); courseGroup.add(post);
          }
        });
      } else if(o.type==='tilefield'||o.type==='hexfield'){
        addGround(0,TRACK_W,o.yStart,o.yEnd,true);
        addWall(0,o.yStart,o.yEnd); addWall(TRACK_W,o.yStart,o.yEnd);
      }
      cursor=o.yEnd;
    }
    if(cursor<endZ){ addGround(0,TRACK_W,cursor,endZ,false); addWall(0,cursor,endZ); addWall(TRACK_W,cursor,endZ); }

    // start line
    const sl=new THREE.Mesh(new THREE.BoxGeometry(TRACK_W,2,10), new THREE.MeshLambertMaterial({color:0xff4fa3}));
    placeAt(sl, TRACK_W/2, 0, 0.6); courseGroup.add(sl);

    const pillarMat=new THREE.MeshPhongMaterial({color:0x8b5cf6, shininess:40});
    const pillarCapMat=new THREE.MeshLambertMaterial({color:0xc084fc});
    const maceMat=new THREE.MeshPhongMaterial({color:0xff5a4d, shininess:50});
    const poleMat=new THREE.MeshLambertMaterial({color:0x1a1033});
    const barMat=new THREE.MeshLambertMaterial({map:mapStripeTex});
    const pusherMat=new THREE.MeshPhongMaterial({color:0x60a5fa, shininess:30});

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
          const face=new THREE.Mesh(new THREE.BoxGeometry(it.width-10,10,2), new THREE.MeshLambertMaterial({color:0x1a1033})); face.position.set(0,6,-it.d/2-1); g.add(face);
          placeAt(g, TRACK_W/2, o.y, 17); courseGroup.add(g); return g;
        });
      }
    }

    buildMinigameMeshes();
    buildWaveMeshes(); resetWaves(); resetEvents();

    // decorations flanking the track
    const decoMats=[0xff4fa3,0x23e6c9,0x8b5cf6,0xffcb3d,0x60a5fa].map(c=>new THREE.MeshLambertMaterial({color:c}));
    for(let z=-100; z<endZ; z+=rand(140,260)){
      [-1,1].forEach(s=>{
        const offX = TRACK_W/2 + s*(TRACK_W/2 + rand(80,260));
        const kind=Math.random();
        let m, hh;
        if(kind<0.4){ m=new THREE.Mesh(new THREE.SphereGeometry(rand(14,32),10,8), pick(decoMats)); hh=rand(-20,60); }
        else if(kind<0.7){ m=new THREE.Mesh(new THREE.ConeGeometry(rand(12,24),rand(40,90),7), pick(decoMats)); hh=-60+rand(20,40); }
        else { m=new THREE.Mesh(new THREE.TorusGeometry(rand(14,24),5,8,16), pick(decoMats)); hh=rand(20,80); m.rotation.set(rand(0,3),rand(0,3),0); }
        const w=toWorld(offX, z, hh); m.position.set(w.x,w.y,w.z);
        m.userData.deco={y:m.position.y, ph:rand(0,6.28)}; courseGroup.add(m);
      });
    }
    // clouds sit in the sky, not on the ribbon
    for(let i=0;i<14;i++){
      const g=new THREE.Group(); const cm=new THREE.MeshLambertMaterial({color:0xfff8ec, transparent:true, opacity:0.9});
      for(let j=0;j<4;j++){ const c=new THREE.Mesh(new THREE.SphereGeometry(rand(16,30),8,6), cm); c.position.set(j*22-30, rand(-6,6), rand(-8,8)); g.add(c); }
      const w=toWorld(TRACK_W/2, rand(-200,endZ), 0);
      g.position.set(w.x+rand(-900,900), w.y+rand(160,300), w.z); g.userData.cloud=rand(4,10); courseGroup.add(g);
    }

    lavaMesh=null; lavaGlow=null;
    if(currentMap.mode==='lava'){
      lavaMesh=new THREE.Mesh(new THREE.PlaneGeometry(TRACK_W+240, 900), new THREE.MeshBasicMaterial({color:0xff5a2e, transparent:true, opacity:0.93}));
      lavaMesh.rotation.x=-Math.PI/2; lavaMesh.position.set(0,3,lavaZ); courseGroup.add(lavaMesh);
      lavaGlow=new THREE.Mesh(new THREE.PlaneGeometry(TRACK_W+260,44), new THREE.MeshBasicMaterial({color:0xffcb3d, transparent:true, opacity:0.6, side:THREE.DoubleSide}));
      lavaGlow.rotation.x=-Math.PI/2; lavaGlow.position.set(0,5,lavaZ+30); courseGroup.add(lavaGlow);
    }
  }
