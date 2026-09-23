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

  // Procedural, cached by colour: chevrons for the slope and a mesh for the
  // net walls. Nothing in this project loads an image from anywhere.
  const _v21Tex = {};
  function chevronTexture(hex){
    const k = 'chev'+hex; if(_v21Tex[k]) return _v21Tex[k];
    const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d');
    g.fillStyle = hex; g.fillRect(0,0,N,N);
    g.strokeStyle = '#ffffff'; g.lineWidth = N*0.11;
    for(let i=-2;i<5;i++){
      const y = i*(N/3);
      g.beginPath(); g.moveTo(0,y); g.lineTo(N/2, y+N/4); g.lineTo(N, y); g.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    _v21Tex[k] = t; return t;
  }
  function netTexture(hex){
    const k = 'net'+hex; if(_v21Tex[k]) return _v21Tex[k];
    const N = 128, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d');
    g.clearRect(0,0,N,N);
    g.strokeStyle = hex; g.lineWidth = 4;
    for(let i=0;i<=8;i++){
      const p = i*(N/8);
      g.beginPath(); g.moveTo(p,0); g.lineTo(p,N); g.stroke();
      g.beginPath(); g.moveTo(0,p); g.lineTo(N,p); g.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    _v21Tex[k] = t; return t;
  }

  // PAINT ON THE FLOOR. The start and finish aprons are plates a hair over the
  // ground, not slabs standing 3 proud of it that a racer stands in to the
  // ankles. A hair is not something the depth buffer can see at a distance
  // (the near plane is 0.1), so the plate is also pulled toward the lens in
  // depth, and a stripe on a plate a step further, so each always wins over
  // what it lies on instead of flickering against it.
  const FLOOR_PAINT_TOP = 0.1;
  function floorPaint(mat, rank){
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -(rank||1); mat.polygonOffsetUnits = -4*(rank||1);
    return mat;
  }
  // placeAt, and pitched to the course's slope there. placeAt turns a mesh to
  // the path's heading only, which is right for a hazard standing on the
  // floor and wrong for a plate LYING on it: 150 long on a climb, one end is
  // under the ground and the other over it.
  function placeOnSlope(obj, simX, simY, h){
    placeAt(obj, simX, simY, h);
    if(coursePath){
      const a = toWorld(simX, simY - 4, 0), b = toWorld(simX, simY + 4, 0);
      obj.rotation.order = 'YXZ';
      obj.rotation.x = -Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z));
    }
    return obj;
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
    const arenaOnly = currentMap.mode==='shrink' || currentMap.mode==='spin'
                   || currentMap.mode==='walls'    // Wall Rush is a plate over nothing too
                   || currentMap.mode==='beam';    // and Beam Team is a disc over nothing
    // ---- the v20 look: a neutral floor, pale walls, loud hazards ----
    // One warm key, a cool fill from the sky, and a haze that matches it.
    const accents = mapAccents();
    const floorHex = neutralFloor(currentMap.ground);
    // §3: no clearcoat except on ice and water. A slippery map's floor is
    // the one surface that has to say "you cannot stand on me" before you
    // step on it, and a wet highlight is how it says so.
    const FloorMat = currentMap.slippery ? THREE.MeshGlossMaterial : THREE.MeshFloorMaterial;
    const floorAltHex = mixHex(floorHex, neutralFloor(currentMap.groundAlt), 0.5);   // half the old contrast
    currentMap.__floorHex = floorHex;
    hemi.color.set(currentMap.skyTop); hemi.groundColor.set(floorHex);
    fillLight.color.set(currentMap.skyMid);
    if(scene.fog){ scene.fog.color.set(currentMap.skyMid); scene.fog.near = 900; scene.fog.far = 2700; }
    const paleWall = paleOf(currentMap.ground);
    const voidMat = new THREE.MeshLambertMaterial({color:0x1b1040});
    const wallMat = new THREE.MeshLambertMaterial({color:paleWall});
    const wallTopMat = new THREE.MeshLambertMaterial({color:accents[0]});       // the accent rail
    const skirtMat = new FloorMat({color:mixHex(paleWall, floorHex, 0.5)});
    const mapGroundTex = checkerTexture(floorHex, floorAltHex, 1);
    const mapStripeTex = stripeTexture('#ffffff', accents[0]);
    // Materials for the things that hit you. Tagged with their accent so the
    // contrast check can read the colour a mesh is painted with.
    const hazardMat = (i, extra)=>{ const m = new THREE.MeshLambertMaterial(Object.assign({color:accents[i%3]}, extra||{})); m.userData.hazard = accents[i%3]; return m; };
    const stripeMat = (i)=>{ const m = new THREE.MeshLambertMaterial({map:stripeTexture('#ffffff', accents[i%3])}); m.userData.hazard = accents[i%3]; return m; };
    courseLook = { accents, floorHex, paleWall, hazardMat, stripeMat, softMat:(i)=>new THREE.MeshLambertMaterial({color:softAccent(accents[i%3])}) };

    // voidY: how deep a sunken floor sits. -62 unless something stands lower
    // than that -- Panel Drop's bottom floor is at -180 and Last Rung's at
    // -126, and a void drawn at -62 over them is a dark sheet between the
    // chase camera and anyone who has dropped that far.
    function addGround(x0,x1,z0,z1,sunken,voidY){
      const w=x1-x0, d=z1-z0; if(w<=0||d<=0) return;
      const vy = voidY===undefined ? -62 : voidY;
      let mat;
      if(sunken){ mat=voidMat; }
      else { const tex=mapGroundTex.clone(); tex.needsUpdate=true; tex.repeat.set(w/190, d/190); tex.offset.set(x0/190, z0/190); mat=new FloorMat({map:tex}); }
      if(!coursePath){
        const mesh=new THREE.Mesh(THREE.RoundedBox(w,sunken?4:12,d), mat);
        mesh.position.set(toSceneX((x0+x1)/2), sunken?vy:-6, (z0+z1)/2);
        mesh.receiveShadow=true; courseGroup.add(mesh);
        if(!sunken){
          const skirt=new THREE.Mesh(THREE.RoundedBox(w+2,40,d+2), skirtMat);
          skirt.position.set(mesh.position.x,-32,mesh.position.z); courseGroup.add(skirt);
        }
        return;
      }
      // swept along the path. THE TOP IS 0, where the simulation's floor is.
      // It was -6 -- the CENTRE of the 12-tall box above, whose top is 0,
      // carried over as though it were the top -- so on every course with a
      // path, which is every race map, racers ran 4-5 units over the ground.
      const yTop = sunken ? vy : 0;
      const surf = ribbonStrip(z0, z1,
        s=>[toWorld(x0,s,yTop), toWorld(x1,s,yTop)],
        sunken ? null : s=>[[x0/190, s/190],[x1/190, s/190]]);
      if(sunken){ mat = voidMat; }
      const m = new THREE.Mesh(surf, mat); m.material.side = THREE.DoubleSide;
      m.receiveShadow=true; courseGroup.add(m);
      if(!sunken){
        // a skirt hanging under each edge, so the ribbon reads as solid ground
        [[x0,-1],[x1,1]].forEach(([xe])=>{
          const side = ribbonStrip(z0, z1, s=>[toWorld(xe,s,0), toWorld(xe,s,-52)]);
          const sm = new THREE.Mesh(side, skirtMat); sm.material.side=THREE.DoubleSide;
          courseGroup.add(sm);
        });
      }
    }
    function addWall(xPos,z0,z1){
      const d=z1-z0; if(d<=0) return;
      if(!coursePath){
        const mesh=new THREE.Mesh(THREE.RoundedBox(8,30,d), wallMat);
        mesh.position.set(toSceneX(xPos),15,(z0+z1)/2); mesh.castShadow=true; mesh.receiveShadow=true; courseGroup.add(mesh); registerBlocker(mesh);
        const top=new THREE.Mesh(THREE.RoundedBox(10,4,d), wallTopMat); top.position.set(toSceneX(xPos),31,(z0+z1)/2); courseGroup.add(top);
        return;
      }
      const face = ribbonStrip(z0, z1, s=>[toWorld(xPos,s,0), toWorld(xPos,s,30)]);
      const fm = new THREE.Mesh(face, wallMat); fm.material.side=THREE.DoubleSide;
      fm.castShadow=true; fm.receiveShadow=true; courseGroup.add(fm); registerBlocker(fm);
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
        // the island: solid, still, and obviously not a platform
        // Its TOP is the floor, 0, which is what the simulation stands you on:
        // the slab used to rise 14 out of the pit, and a racer on the island
        // stood in it up to the knees. The lip stays a rim just under the top.
        for(const is of (o.islands||[])){
          const slab = new THREE.Mesh(THREE.RoundedBox(is.w, 14, is.y1-is.y0),
            new FloorMat({color: accents[1]}));
          slab.receiveShadow = true;
          placeAt(slab, is.x, (is.y0+is.y1)/2, -7); courseGroup.add(slab);
          const lip = new THREE.Mesh(THREE.RoundedBox(is.w+10, 5, is.y1-is.y0+10),
            new THREE.MeshLambertMaterial({color:0xfff8ec}));
          placeAt(lip, is.x, (is.y0+is.y1)/2, -3.5); courseGroup.add(lip);
        }
        const platMat=new THREE.MeshPhongMaterial({color:0x23e6c9, shininess:30});
        o.platformMeshes=o.platforms.map(p=>{
          const g=new THREE.Group();
          const top=new THREE.Mesh(THREE.RoundedBox(p.width,12,o.yEnd-o.yStart), platMat); top.receiveShadow=true; top.castShadow=true; g.add(top);
          const under=new THREE.Mesh(THREE.RoundedBox(p.width-10,30,o.yEnd-o.yStart-10), new THREE.MeshLambertMaterial({color:0x0e9e8a})); under.position.y=-20; g.add(under);
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
        const floors = o.type==='tilefield' ? o.tiles : o.type==='hexfield' ? o.cells : [];
        const lowest = floors.reduce((m, c)=>Math.min(m, c.hy||0), 0);
        addGround(0,TRACK_W,o.yStart,o.yEnd,true, Math.min(-62, lowest-62));
        addWall(0,o.yStart,o.yEnd); addWall(TRACK_W,o.yStart,o.yEnd);
      }
      cursor=o.yEnd;
    }
    if(cursor<endZ){ addGround(0,TRACK_W,cursor,endZ,false); addWall(0,cursor,endZ); addWall(TRACK_W,cursor,endZ); }

    // ---- the start pad: a wide chequered apron with the grid painted on it
    // The lanes are the same arithmetic makeRacers uses to place the field, so
    // what is painted is where the racers actually stand rather than a
    // decoration that drifts out of step with them. The apron now reaches back
    // behind the line, because three rows of eight stand there.
    const startSec = (courseScript||[]).find(s=>s.type==='start');
    if(startSec){
      const padEnd = startSec.len, padStart = -220, padLen = padEnd - padStart;
      const chk = checkerTexture('#ffffff', currentMap.wallTop, 6);
      // SWEPT, like the ground it lies on, not a run of flat plates. A rigid
      // plate 750 wide and 150 long cannot follow a ribbon that climbs and
      // bends at once -- its corners stood up to six units off the floor on
      // Super Slide -- and one strip is one draw call instead of ten. The
      // checker keeps its old scale: four across, one square per 90 along.
      const padTex = chk.clone(); padTex.needsUpdate = true;
      const padMat = floorPaint(new FloorMat({map:padTex}), 1);
      padMat.side = THREE.DoubleSide;
      const apron = new THREE.Mesh(ribbonStrip(padStart, padEnd,
        s=>[toWorld(7, s, FLOOR_PAINT_TOP), toWorld(TRACK_W-7, s, FLOOR_PAINT_TOP)],
        s=>[[0, s/90], [4, s/90]]), padMat);
      apron.receiveShadow = true; courseGroup.add(apron);
      // One lane stripe between each pair of columns, in the map's accent --
      // eight strips down the grid rather than a mark under every slot, which
      // at twenty-four slots would be twenty-four more draw calls for paint.
      const colW = (TRACK_W-140)/(START_COLS-1);
      // Painted on the apron, swept the same way, a step further forward.
      const bayMat = floorPaint(new THREE.MeshLambertMaterial({color:accents[0], side:THREE.DoubleSide}), 2);
      for(let i=0;i<=START_COLS;i++){
        const bx = TRACK_W/2 + (i-START_COLS/2)*colW;
        if(bx < 20 || bx > TRACK_W-20) continue;
        const top = FLOOR_PAINT_TOP + 0.1;
        const bay = new THREE.Mesh(ribbonStrip(-205, -5, s=>[toWorld(bx-2, s, top), toWorld(bx+2, s, top)]), bayMat);
        courseGroup.add(bay);
      }
    }
    // ---- the checkpoint flags. A post either side of the track with a
    // banner across it, so it reads from a long way back and does not have to
    // be run through to count.
    buildCheckpoints();
    for(const c of checkpoints){
      const g = new THREE.Group();
      const postMat = new THREE.MeshLambertMaterial({color:0x1a1033});
      [-1,1].forEach(s=>{
        const post = new THREE.Mesh(THREE.RoundedBox(9, 84, 9), postMat);
        post.position.set(s*(TRACK_W/2-26), 42, 0); post.castShadow = true; g.add(post);
        registerFadeable(post);
      });
      const banner = new THREE.Mesh(THREE.RoundedBox(TRACK_W-52, 26, 4),
        new THREE.MeshLambertMaterial({color: accents[0]}));
      banner.position.y = 74; g.add(banner);
      // The gantry fades like anything else in the way. It is scenery rather
      // than a hazard, but it is scenery 26 units deep sitting at head height
      // right across the track, and the chase camera's sightline passes through
      // 38..147 above the floor -- so every checkpoint on every map put a solid
      // bar between the lens and the racer for the stride or two either side of
      // it, and nothing faded it because nothing had registered it. Registering
      // the mesh and not the group is deliberate: updateOcclusion raycasts
      // non-recursively, so a Group in the list matches nothing.
      registerFadeable(banner);
      placeAt(g, TRACK_W/2, c.y, 0); courseGroup.add(g);
      c.mesh = g; c.banner = banner;
      // dim until you pass it, the map's accent afterwards
      c.litColor = new THREE.Color(accents[0]).getHex();
      banner.material.color.set(new THREE.Color(accents[0]).multiplyScalar(0.42));
    }

    // start line
    const sl=new THREE.Mesh(THREE.RoundedBox(TRACK_W,2,10), floorPaint(new THREE.MeshLambertMaterial({color:0xff4fa3}), 2));
    placeOnSlope(sl, TRACK_W/2, 0, FLOOR_PAINT_TOP + 0.3 - 1); courseGroup.add(sl);

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
          // The body was registered and its trim was not, so a pillar in the way
          // faded to a fifth and left a fully opaque cap and a fully opaque
          // outline shell standing in front of the racer -- which reads worse
          // than not fading at all, because the silhouette is all that is left.
          const cap=new THREE.Mesh(new THREE.CylinderGeometry(it.r*1.1,it.r*1.1,8,18), pillarCapMat);
          placeAt(cap, it.x, o.y, 62); cap.castShadow=true; courseGroup.add(cap); registerFadeable(cap);
          const out=new THREE.Mesh(new THREE.CylinderGeometry(it.r*1.1,it.r*1.15,62,18), outlineMat);
          out.position.copy(mesh.position); courseGroup.add(out); registerFadeable(out);
          return mesh;
        });
      } else if(o.type==='logroll'){
        o.meshes = o.logs.map(l=>{
          const g = new THREE.Group();
          const len = l.b - l.a;
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(o.R, o.R, len, 22),
            new THREE.MeshPhongMaterial({color:mixHex(floorHex, accents[0], 0.30), shininess:16}));
          // a cylinder stands up by default; lay it down the course
          barrel.rotation.x = Math.PI/2; barrel.castShadow = true; barrel.receiveShadow = true;
          g.add(barrel); registerFadeable(barrel);
          // Bands, so you can see it turning. A smooth barrel rolls invisibly.
          const bandMat = new THREE.MeshLambertMaterial({color:accents[1]});
          for(let i=1;i<6;i++){
            const b = new THREE.Mesh(new THREE.CylinderGeometry(o.R*1.012, o.R*1.012, 10, 22, 1, true), bandMat);
            b.rotation.x = Math.PI/2; b.position.z = -len/2 + len*i/6; g.add(b);
          }
          const pegMat = new THREE.MeshLambertMaterial({color:currentMap.wallTop});
          l.pegMeshes = l.pegs.map(peg=>{
            const pg = new THREE.Group();
            const stub = new THREE.Mesh(THREE.RoundedBox(o.pegW*1.7, o.pegLen*2.1, o.pegW*1.7), pegMat);
            stub.castShadow = true; pg.add(stub);
            pg.position.z = (peg.y - (l.a+l.b)/2);
            g.add(pg);
            return pg;
          });
          placeAt(g, l.cx, (l.a+l.b)/2, o.crown - o.R);
          courseGroup.add(g);
          return g;
        });
      } else if(o.type==='tiltdeck'){
        o.meshes = o.decks.map(dk=>{
          const g = new THREE.Group();
          const slab = new THREE.Mesh(THREE.RoundedBox(dk.w, 22, dk.d),
            new FloorMat({map:checkerTexture(floorHex, floorAltHex, 4)}));
          slab.position.y = -11; slab.receiveShadow = true; g.add(slab);
          // A rim in the accent, because a deck you cannot see the edge of is a
          // deck you walk off without knowing it was there.
          const rimMat = new THREE.MeshLambertMaterial({color:accents[0]});
          [[dk.w+10, 9, 14, 0, dk.d/2], [dk.w+10, 9, 14, 0, -dk.d/2],
           [14, 9, dk.d+10, dk.w/2, 0], [14, 9, dk.d+10, -dk.w/2, 0]].forEach(b=>{
            const m = new THREE.Mesh(new THREE.BoxGeometry(b[0], b[1], b[2]), rimMat);
            m.position.set(b[3], 3, b[4]); g.add(m);
          });
          placeAt(g, dk.cx, dk.y, 0);
          courseGroup.add(g);
          // the pivot, drawn separately so it does not tilt with the deck
          const post = new THREE.Mesh(new THREE.CylinderGeometry(26, 34, 120, 12),
            new THREE.MeshLambertMaterial({color:paleWall}));
          placeAt(post, dk.cx, dk.y, -60); courseGroup.add(post);
          return g;
        });
      } else if(o.type==='hammer'){
        const xs=o.items.map(i=>i.pivotX);
        // The whole rig fades. A mace on a 100-unit pole sweeps straight through
        // the camera's sightline twice a swing, and the gantry it hangs from
        // spans every pivot on the row -- so the one hazard whose timing you
        // most need to read was also the one most likely to be hiding you while
        // you read it.
        const beam=new THREE.Mesh(THREE.RoundedBox(Math.max(...xs)-Math.min(...xs)+40,8,8), poleMat);
        placeAt(beam, (Math.max(...xs)+Math.min(...xs))/2, o.y, 100); beam.castShadow=true; courseGroup.add(beam); registerFadeable(beam);
        for(const it of o.items){
          const pole=new THREE.Mesh(new THREE.CylinderGeometry(4,5,100,8), poleMat);
          placeAt(pole, it.pivotX, o.y, 50); pole.castShadow=true; courseGroup.add(pole); registerFadeable(pole);
          const mace=new THREE.Mesh(new THREE.IcosahedronGeometry(24,0), maceMat); mace.castShadow=true; courseGroup.add(mace); registerFadeable(mace);
          const maceOut=new THREE.Mesh(new THREE.IcosahedronGeometry(24*1.16,0), outlineMat); courseGroup.add(maceOut); registerFadeable(maceOut);
          const rod=new THREE.Mesh(new THREE.CylinderGeometry(2.5,2.5,1,6), poleMat); courseGroup.add(rod);
          const pv=toWorld(it.pivotX, o.y, 96);
          it.mesh={mace,maceOut,rod,pivot:{x:pv.x,y:pv.y,z:pv.z}};
        }
      } else if(o.type==='spinbar'){
        const g=new THREE.Group();
        // The course bar. It rotates a full turn around the lane, so unlike a
        // wall it is GUARANTEED to pass between the camera and the racer on
        // every pass -- and at a low camera pitch its 11..33 band is exactly
        // where the sightline sits. Registering the meshes, not the group: the
        // occlusion ray is non-recursive and a Group would match nothing, which
        // is the trap that made this look registered when it was not.
        const mesh=new THREE.Mesh(THREE.RoundedBox(o.length,22,o.thickness), barMat); mesh.castShadow=true; g.add(mesh); registerFadeable(mesh);
        const out=new THREE.Mesh(THREE.RoundedBox(o.length+5,26,o.thickness+5), outlineMat); g.add(out); registerFadeable(out);
        placeAt(g, o.cx, o.y, 22); courseGroup.add(g);
        const hub=new THREE.Mesh(new THREE.CylinderGeometry(16,18,40,12), darkMat);
        placeAt(hub, o.cx, o.y, 20); courseGroup.add(hub);
        o.mesh=g;
      } else if(o.type==='pusher'){
        const rail=new THREE.Mesh(THREE.RoundedBox(TRACK_W-16,3,o.d+6), new THREE.MeshLambertMaterial({color:0x2a1a55}));
        placeAt(rail, TRACK_W/2, o.y, 1); courseGroup.add(rail);
        o.meshes=o.items.map(it=>{
          const g=new THREE.Group();
          const box=new THREE.Mesh(THREE.RoundedBox(it.width,34,it.d), pusherMat); box.castShadow=true; g.add(box);
          const out=new THREE.Mesh(THREE.RoundedBox(it.width+5,38,it.d+5), outlineMat); g.add(out);
          const face=new THREE.Mesh(THREE.RoundedBox(it.width-6,30,3), pusherFaceMat); face.position.set(0,0,-it.d/2-1.2); g.add(face);
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
      // A long course carries twenty-odd stands and a couple of hundred tiny
      // beans in them. As separate meshes that was the single largest thing on
      // the draw-call bill -- more than the sixteen racers put together, for
      // scenery you never touch. They are all one geometry and differ only in
      // colour and where they stand, so the whole crowd is one instanced draw,
      // and the stands and their rails one each.
      const seats = [];
      for(let z=450; z<trackLength-200; z+=900){
        [-1,1].forEach(s=>{
          const x = s<0 ? -78 : TRACK_W+78;
          const n = 8 + Math.floor(rand(0,5));
          for(let i=0;i<n;i++){
            seats.push({ x: x + rand(-28, 28), z: z + (i/(n-1) - 0.5)*200,
                         yaw: (s<0 ? -1 : 1) * Math.PI/2 + rand(-0.4, 0.4),
                         col: skinBaseColor(pick(crowdSkins)),
                         ph: rand(0,6.28), rate: rand(2.5,4.5) });
          }
        });
      }
      const standAt = [];
      for(let z=450; z<trackLength-200; z+=900) [-1,1].forEach(s=>standAt.push({x: s<0 ? -78 : TRACK_W+78, z, s}));
      if(standAt.length){
        const stands = new THREE.InstancedMesh(THREE.RoundedBox(100, 24, 230), standMat, standAt.length);
        const rails  = new THREE.InstancedMesh(THREE.RoundedBox(6, 8, 230), standRail, standAt.length);
        const probe = new THREE.Object3D();
        standAt.forEach((q, i)=>{
          placeAt(probe, q.x, q.z, 12); probe.updateMatrix(); stands.setMatrixAt(i, probe.matrix);
          placeAt(probe, q.s<0 ? q.x+50 : q.x-50, q.z, 28); probe.updateMatrix(); rails.setMatrixAt(i, probe.matrix);
        });
        stands.instanceMatrix.needsUpdate = rails.instanceMatrix.needsUpdate = true;
        stands.receiveShadow = true;
        courseGroup.add(stands); courseGroup.add(rails);
      }
      if(seats.length){
        const crowd = new THREE.InstancedMesh(beanGeometry(),
          new THREE.MeshToonMaterial({ gradientMap:toonRamp() }), seats.length);
        const probe = new THREE.Object3D();
        seats.forEach((q, i)=>{
          placeAt(probe, q.x, q.z, 24 + 9);
          probe.rotation.y = q.yaw; probe.scale.setScalar(0.55);
          probe.updateMatrix();
          crowd.setMatrixAt(i, probe.matrix);
          crowd.setColorAt(i, new THREE.Color(q.col));
          q.y = probe.position.y;
        });
        crowd.instanceMatrix.needsUpdate = true;
        if(crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
        // syncObstacles bobs them; the seat table is what it bobs against
        crowd.userData.crowdSeats = seats;
        crowd.userData.crowdProbe = new THREE.Object3D();
        courseGroup.add(crowd);
      }
    }
    // Big flat low-poly clouds, drifting slowly, well above the course. Unlit
    // and outside the exposure: the key comes from over the top of them, so
    // shaded they read from below as dark slabs hanging in a bright sky --
    // which is exactly the angle a course in the air is seen from.
    for(let i=0;i<12;i++){
      const g=new THREE.Group();
      const cm=new THREE.MeshBasicMaterial({color:new THREE.Color(0xf6fbff).multiplyScalar(2.6),
                                            transparent:true, opacity:0.92});
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
