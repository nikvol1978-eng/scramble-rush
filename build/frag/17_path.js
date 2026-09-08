  // ============================================================
  // COURSE PATH — bends the world around the ribbon the sim runs on
  // ============================================================
  // The simulation never changes: x is across the track [0, TRACK_W], y is
  // distance along it [0, trackLength], h is height above the surface. Collision,
  // bot AI, respawn and the round flow all keep working in that flat space.
  //
  // A path maps that ribbon into the world for RENDERING and the camera only. A
  // map with no `path` gets the straight transform, which reduces exactly to the
  // old `(x - TRACK_W/2, h, y)` — so every corridor map is provably unchanged
  // rather than hopefully unchanged (check A asserts this to 0.001).
  let coursePath = null;
  // The script the current course was built from, so the path and the mesh
  // builder can both read the section list genCourse walked.
  let courseScript = null;

  // The start of the section before the one containing y. Respawning is the
  // only caller: putting a racer back on the lip of the hazard that just took
  // them is how one bad jump turns into ten, so they go back far enough to
  // arrive at it running rather than standing on its edge.
  function sectionStartBefore(y){
    if(!courseScript || !courseScript.length) return null;
    let acc = 0, prevStart = 0, thisStart = 0;
    for(const sec of courseScript){
      if(y < acc + sec.len){ thisStart = acc; break; }
      prevStart = acc; acc += sec.len; thisStart = acc;
    }
    return prevStart < thisStart ? prevStart : thisStart;
  }
  const PATH_STEP = 40;                    // arc-length between samples

  // spec: { slope(u), turn(u) } in radians, u = 0..1 along the course.
  // slope > 0 climbs, slope < 0 descends. turn is an absolute heading, measured
  // from +Z toward +X, so turn = 0 is the legacy straight course.
  function setCoursePath(spec, length){
    if(!spec){ coursePath = null; return; }
    const end = length + FINISH_ZONE + 500;      // cover the finish pen and the flyover
    const tbl = [];
    let x=0, y=0, z=0;
    for(let s=0; s<=end+PATH_STEP; s+=PATH_STEP){
      const u = clamp(s/length, 0, 1);
      const slope = spec.slope ? spec.slope(u) : 0;
      const turn  = spec.turn  ? spec.turn(u)  : 0;
      tbl.push({s, x, y, z, ang:turn, slope});
      // advance one step of ARC length, split into horizontal and vertical
      const horiz = Math.cos(slope)*PATH_STEP;
      x += Math.sin(turn)*horiz;
      z += Math.cos(turn)*horiz;
      y += Math.sin(slope)*PATH_STEP;
    }
    coursePath = {tbl, step:PATH_STEP, end};
  }

  // Centreline sample at distance s, linearly interpolated between table entries.
  function pathAt(s){
    if(!coursePath) return {x:0, y:0, z:s, ang:0, slope:0};
    const tbl = coursePath.tbl;
    const f = clamp(s/coursePath.step, 0, tbl.length-1.0001);
    const i = Math.floor(f), k = f-i;
    const a = tbl[i], b = tbl[i+1] || a;
    return { x:a.x+(b.x-a.x)*k, y:a.y+(b.y-a.y)*k, z:a.z+(b.z-a.z)*k,
             ang:a.ang+(b.ang-a.ang)*k, slope:a.slope+(b.slope-a.slope)*k };
  }

  // The one transform everything renders through.
  function toWorld(simX, simY, h){
    if(!coursePath) return {x:simX-TRACK_W/2, y:h||0, z:simY};   // legacy, bit for bit
    const p = pathAt(simY);
    const off = simX - TRACK_W/2;
    return { x: p.x + Math.cos(p.ang)*off,
             y: p.y + (h||0),
             z: p.z - Math.sin(p.ang)*off };
  }
  // Height the path itself contributes at a distance — what checks D/E/F read.
  function pathHeight(simY){ return coursePath ? pathAt(simY).y : 0; }
  // Heading, for rotating obstacle meshes to sit square on the ribbon.
  function pathAngle(simY){ return coursePath ? pathAt(simY).ang : 0; }
  // Gradient underfoot, in radians: positive climbs, negative descends. The
  // physics reads this, so a course that looks like a hill plays like one.
  function pathSlope(simY){ return coursePath ? pathAt(simY).slope : 0; }
  // Convenience for the many `position.set(toSceneX(x), h, y)` call sites.
  function placeAt(obj, simX, simY, h){
    const w = toWorld(simX, simY, h||0);
    obj.position.set(w.x, w.y, w.z);
    if(coursePath) obj.rotation.y = pathAngle(simY);
    return obj;
  }

  // ---- a course script bends the ribbon section by section --------------------
  // Every section carries its own turn (degrees across its own length) and its
  // own climb or drop (units). This returns the same {slope(u), turn(u)} spec
  // setCoursePath already takes, so a script whose sections are all turn:0
  // with no climb yields turn=0 and slope=0 everywhere -- which is the straight
  // transform, exactly, not approximately. Check A asserts that.
  function scriptPathSpec(sections){
    const segs = []; let y = 0, head = 0;
    for(const sec of sections){
      const len  = Math.max(1, sec.len);
      const turn = (sec.turn||0)*Math.PI/180;
      const rise = (sec.climb||0) - (sec.drop||0);
      segs.push({ y0:y, len, head, turn, slope: rise ? Math.atan2(rise, len) : 0 });
      head += turn; y += len;
    }
    const total = Math.max(1, y);
    function at(s){
      let i = 0;
      while(i < segs.length-1 && s >= segs[i].y0 + segs[i].len) i++;
      return segs[i];
    }
    return {
      total,
      // The heading eases in and out across a section rather than turning at a
      // constant rate, so curvature does not jump at a section boundary and the
      // rails read as one continuous bend instead of a series of creases.
      turn(u){
        const s = clamp(u,0,1)*total, g = at(s);
        const k = clamp((s - g.y0)/g.len, 0, 1);
        return g.head + g.turn * (k*k*(3-2*k));
      },
      slope(u){ return at(clamp(u,0,1)*total).slope; }
    };
  }

  // ---- the two shaped courses -------------------------------------------------
  // Cannon Climb rises in stepped pushes: steeper stretches with flatter landings
  // between them, so it reads as a climb rather than one long ramp.
  const PATH_CLIMB = {
    slope: u => 0.055 + 0.115*(1 - Math.cos(u*Math.PI*4))/2 + 0.075*Math.sin(u*Math.PI),
    turn:  u => Math.sin(u*Math.PI*2)*0.13
  };
  // Super Slide drops away, steepest through the middle, easing out at the bottom.
  const PATH_SLIDE = {
    slope: u => -(0.10 + 0.16*Math.sin(clamp(u,0,1)*Math.PI)),
    turn:  u => Math.sin(u*Math.PI*3)*0.17
  };
  // Gentler shapes for the ordinary race maps: enough to stop them reading as one
  // straight corridor, not so much that they play like the two shaped courses.
  const PATH_ROLLING = {                       // up and over, twice
    slope: u => Math.sin(u*Math.PI*3)*0.15,
    turn:  u => Math.sin(u*Math.PI*2)*0.20
  };
  const PATH_ASCENT = {                        // finishes above the start, gently
    slope: u => 0.085 + 0.045*Math.sin(u*Math.PI*3),
    turn:  u => Math.sin(u*Math.PI*1.5)*0.22
  };
  const PATH_DESCENT = {                       // finishes below, with a long sweep
    slope: u => -(0.075 + 0.05*Math.sin(u*Math.PI)),
    turn:  u => Math.sin(u*Math.PI*2.2)*0.26
  };
  const PATH_WINDING = {                       // flat, but it bends
    slope: u => 0,
    turn:  u => Math.sin(u*Math.PI*2.6)*0.38
  };
  const COURSE_PATHS = { climb: PATH_CLIMB, slide: PATH_SLIDE,
                         rolling: PATH_ROLLING, ascent: PATH_ASCENT,
                         descent: PATH_DESCENT, winding: PATH_WINDING };

  // ============================================================
  // OCCLUSION FADE
  // ============================================================
  // Anything between the camera and the racer goes translucent. Materials are
  // cloned on registration, or fading one wall would fade every mesh sharing it.
  let fadeables = [];
  const _occRay = new THREE.Raycaster();
  const _occDir = new THREE.Vector3();
  function clearFadeables(){ fadeables = []; }
  function registerFadeable(mesh){
    if(!mesh || !mesh.material) return mesh;
    mesh.material = mesh.material.clone();
    mesh.material.transparent = true;
    mesh.material.opacity = 1;
    fadeables.push(mesh);
    return mesh;
  }
  function updateOcclusion(target){
    if(!fadeables.length) return;
    _occDir.subVectors(target, camera.position);
    const dist = _occDir.length();
    if(dist < 1) return;
    _occDir.normalize();
    _occRay.set(camera.position, _occDir);
    _occRay.far = Math.max(1, dist - 26);        // do not fade what is behind them
    const hit = new Set(_occRay.intersectObjects(fadeables, false).map(h=>h.object));
    for(const m of fadeables){
      const want = hit.has(m) ? 0.20 : 1;
      m.material.opacity += (want - m.material.opacity)*0.22;
      m.material.transparent = m.material.opacity < 0.985;
    }
  }
