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
  // ---- checkpoints (v24 §2.9) --------------------------------------------
  // Falling used to put you back a section, worked out at the moment you fell.
  // A checkpoint is the same idea said out loud: a flag on the course, in a
  // place you can see before you need it, and the place you come back to. You
  // can look ahead and know what a mistake will cost, which "one section back"
  // never told you.
  //
  // Every third section, which on our courses is a flag about every 1400
  // units. Never in the start pad and never inside the finish run: coming back
  // to the line you have already crossed is not a checkpoint, it is a loop.
  let checkpoints = [];
  const CP_EVERY = 3;
  function buildCheckpoints(){
    checkpoints = [];
    if(!courseScript || !courseScript.length) return;
    let acc = 0, n = 0;
    for(const sec of courseScript){
      acc += sec.len; n++;
      if(sec.type === 'finish') break;
      if(n % CP_EVERY === 0 && acc > 400 && acc < trackLength - 500)
        checkpoints.push({ y: acc, lit: false, mesh: null });
    }
  }
  // The last flag at or behind y. Null before the first one, which means the
  // start pad -- there is nowhere further back to go.
  function checkpointBefore(y){
    let best = null;
    for(const c of checkpoints){ if(c.y <= y) best = c; else break; }
    return best;
  }

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
  // Boom Peak rises in stepped pushes: steeper stretches with flatter landings
  // between them, so it reads as a climb rather than one long ramp.
  const PATH_CLIMB = {
    slope: u => 0.055 + 0.115*(1 - Math.cos(u*Math.PI*4))/2 + 0.075*Math.sin(u*Math.PI),
    turn:  u => Math.sin(u*Math.PI*2)*0.13
  };
  // Splash Slide drops away, steepest through the middle, easing out at the bottom.
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
  // Two lists, because they answer different questions. `fadeables` is what
  // the camera may see through: anything in the way of the shot goes
  // translucent. `camBlockers` is the much shorter list of things the camera
  // boom must not pass through -- the outer walls of the corridor, which is
  // the difference between looking through a gate and standing outside the
  // course. Until v23 there was one list doing both, so every gate segment and
  // pillar on Boom Peak both faded AND hauled the boom in to its 58-unit
  // minimum, which is the bean filling the screen against a pale wall.
  let fadeables = [], camBlockers = [];
  const _occRay = new THREE.Raycaster();
  const _occDir = new THREE.Vector3();
  function clearFadeables(){ fadeables = []; camBlockers = []; _fieldFaded.clear(); }
  function registerFadeable(mesh){
    if(!mesh || !mesh.material) return mesh;
    mesh.material = mesh.material.clone();
    mesh.material.transparent = true;
    mesh.material.opacity = 1;
    fadeables.push(mesh);
    return mesh;
  }
  // Fades like the rest, and stops the boom as well.
  function registerBlocker(mesh){
    registerFadeable(mesh);
    if(mesh) camBlockers.push(mesh);
    return mesh;
  }
  // ---- floors above the racer ---------------------------------------------
  // Panel Drop and Last Rung stack floors over floors. Once the racer has
  // dropped through one, the chase camera -- up and behind -- looks down at
  // them THROUGH it, and the tile a row back cut the lens-to-body line on 13%
  // of frames at the default framing. Registering the field as fadeables
  // would put a thousand tiles through the raycast every frame, so this tests
  // only what can be in the way: cells on a floor ABOVE the racer's, near
  // them (or falling past them), against the line to the BODY. A cell gets
  // its own material the
  // first time it has to fade -- Last Rung's cells share one per rung -- and
  // its topMat is pointed at the copy so the fuse flash still lands on it.
  const _fieldFaded = new Map();                 // cell group -> cell
  const _fieldBody = new THREE.Vector3();
  function fadeFieldAbove(r){
    const hitNow = new Map();
    const fh = r ? (r.floorH||0) : 0;
    if(r && r.mesh && fh < -1){
      const f = obstacles.find(o=>(o.type==='tilefield' || o.type==='hexfield') && r.y > o.yStart-60 && r.y < o.yEnd+60);
      if(f){
        const near = CAM.DIST*settings.camDist*1.3 + 120;
        const cand = [], owner = new Map();
        for(const c of (f.type==='tilefield' ? f.tiles : f.cells)){
          // A gone cell still counts while it is visible: it is falling past
          // you, which is exactly when it is between the lens and the racer.
          if(!c.mesh || !c.mesh.visible || c.hy <= fh + 1) continue;
          if(Math.abs(c.y - r.y) > near || Math.abs(c.x - r.x) > near) continue;
          owner.set(c.mesh, c);
          for(const m of c.mesh.children) if(m.isMesh) cand.push(m);
        }
        if(cand.length){
          r.mesh.group.getWorldPosition(_fieldBody);
          _occDir.subVectors(_fieldBody, camera.position);
          const d = _occDir.length();
          if(d > 1){
            _occRay.set(camera.position, _occDir.normalize()); _occRay.far = d;
            for(const h of _occRay.intersectObjects(cand, false)) hitNow.set(h.object.parent, owner.get(h.object.parent));
          }
        }
      }
    }
    for(const [g, c] of hitNow) _fieldFaded.set(g, c);
    for(const [g, c] of _fieldFaded){
      const want = hitNow.has(g) ? 0.20 : 1;
      let settled = true;
      for(const m of g.children){
        if(!m.isMesh || !m.material) continue;
        if(!m.userData.ownFade){
          const was = m.material; m.material = was.clone(); m.userData.ownFade = true;
          if(c && c.topMat === was) c.topMat = m.material;
        }
        const mt = m.material;
        mt.opacity += (want - mt.opacity)*0.22;
        if(want === 1 && mt.opacity > 0.985) mt.opacity = 1; else settled = false;
        mt.transparent = mt.opacity < 0.985;
      }
      if(settled) _fieldFaded.delete(g);
    }
  }
  const _occSph = new THREE.Vector3(), _occLocal = new THREE.Vector3(), _occInv = new THREE.Matrix4();
  function updateOcclusion(target, subject){
    fadeFieldAbove(subject);
    if(!fadeables.length) return;
    _occDir.subVectors(target, camera.position);
    const dist = _occDir.length();
    if(dist < 1) return;
    _occDir.normalize();
    _occRay.set(camera.position, _occDir);
    _occRay.far = Math.max(1, dist - 26);        // do not fade what is behind them
    const hit = new Set(_occRay.intersectObjects(fadeables, false).map(h=>h.object));
    // ...and the line to the racer's BODY. The pivot floats 26 over their
    // feet, so a 30-tall corridor wall seen along its length cut the line to
    // the body and missed the line to the pivot: an opaque wall where the
    // racer should be. Stopped a little inside the body, for the same reason.
    if(subject && subject.mesh){
      subject.mesh.group.getWorldPosition(_fieldBody);
      _occDir.subVectors(_fieldBody, camera.position);
      const bd = _occDir.length();
      if(bd > 1){
        _occRay.set(camera.position, _occDir.normalize());
        _occRay.far = Math.max(1, bd - 12);
        for(const h of _occRay.intersectObjects(fadeables, false)) hit.add(h.object);
      }
    }
    // ...and whatever the lens is INSIDE. A ray leaving a closed mesh meets
    // only its back faces, so neither line above ever reported the pillar the
    // lens was standing in. Bounding sphere first, then the mesh's own box.
    for(const m of fadeables){
      const g = m.geometry; if(!g) continue;
      if(!g.boundingSphere) g.computeBoundingSphere();
      const rad = g.boundingSphere.radius * m.matrixWorld.getMaxScaleOnAxis();
      _occSph.copy(g.boundingSphere.center).applyMatrix4(m.matrixWorld);
      if(_occSph.distanceToSquared(camera.position) > rad*rad) continue;
      if(!g.boundingBox) g.computeBoundingBox();
      _occLocal.copy(camera.position).applyMatrix4(_occInv.copy(m.matrixWorld).invert());
      if(g.boundingBox.containsPoint(_occLocal)) hit.add(m);
    }
    for(const m of fadeables){
      const want = hit.has(m) ? 0.20 : 1;
      m.material.opacity += (want - m.material.opacity)*0.22;
      m.material.transparent = m.material.opacity < 0.985;
    }
  }
