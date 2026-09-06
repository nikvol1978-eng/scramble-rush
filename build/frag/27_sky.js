  // ---------------------------------------------------------------- v21 §4.4
  // Every course in v21 hangs in the air, so the sky has to be a real one and
  // there has to be something underneath to fall past. The gradient dome from
  // v5 stays in the scene but hidden -- the Sky shader wants a sun, not three
  // colours, and the dome is what the code elsewhere still holds a handle to.
  const SKY_SUN = {
    sunny:   { elev:42,  azim:158, turbidity:3,  rayleigh:2.2, exposure:0.60 },
    cannonc: { elev:74,  azim:190, turbidity:2,  rayleigh:1.4, exposure:0.60 },  // noon
    slide:   { elev:19,  azim:128, turbidity:2,  rayleigh:3.0, exposure:0.58 },  // cold bright morning
    neon:    { elev:2.4, azim:250, turbidity:8,  rayleigh:3.4, exposure:0.52 },  // dusk
    lava:    { elev:6,   azim:205, turbidity:12, rayleigh:4.2, exposure:0.55 },
    doors:   { elev:30,  azim:180, turbidity:5,  rayleigh:2.2, exposure:0.60 },
    _default:{ elev:35,  azim:170, turbidity:4,  rayleigh:2.2, exposure:0.60 }
  };
  let skyDome = null, cloudGroup = null, _cloudTex = null;
  const sunOff = new THREE.Vector3(220, 420, -160);

  // Built on first use and then kept: the Sky shader is one big fragment
  // program and there is no reason to compile it twice. It rides with the
  // camera, because a course is ten thousand units long and a dome parked at
  // the origin would be behind you by the halfway mark.
  function skyMeshFor(){
    if(!skyDome){
      skyDome = new THREE.Sky();
      skyDome.scale.setScalar(3000);
      skyDome.frustumCulled = false;
      // The dome has to be inside the far plane to be drawn at all, and a
      // course is ten thousand units long, so it rides with the camera. Doing
      // it here rather than in the frame loop covers every path that renders
      // -- the loop, the debug tick and the composer -- and onBeforeRender
      // runs before the model-view matrix is taken, so the move lands.
      skyDome.onBeforeRender = (r, sc, cam)=>{
        skyDome.position.copy(cam.position);
        skyDome.updateMatrixWorld(true);
      };
      scene.add(skyDome);
    }
    return skyDome;
  }

  // The v5 gradient dome is retired: it is still in the scene because other
  // code holds a handle to it, but nothing turns it back on. One switch, so
  // the menu and the course reel do not each get their own idea of a sky.
  function showSky(on){
    sky.visible = false;
    if(on) skyMeshFor();
    if(skyDome) skyDome.visible = !!on;
  }

  function sunVector(elevDeg, azimDeg){
    return new THREE.Vector3().setFromSphericalCoords(
      1, THREE.MathUtils.degToRad(90 - elevDeg), THREE.MathUtils.degToRad(azimDeg));
  }

  // One soft blob, drawn once. Sprites are cheap and a cloud is a blob.
  function cloudTexture(){
    if(_cloudTex) return _cloudTex;
    const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d');
    // three overlapping falloffs, so the edge is lumpy rather than a circle
    for(const [cx,cy,r,a] of [[0.42,0.56,0.34,0.85],[0.62,0.48,0.28,0.75],[0.52,0.62,0.24,0.7]]){
      const grd = g.createRadialGradient(cx*N, cy*N, 0, cx*N, cy*N, r*N);
      grd.addColorStop(0,   'rgba(255,255,255,'+a+')');
      grd.addColorStop(0.55,'rgba(255,255,255,'+(a*0.45)+')');
      grd.addColorStop(1,   'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0,0,N,N);
    }
    _cloudTex = new THREE.CanvasTexture(cv);
    _cloudTex.colorSpace = THREE.SRGBColorSpace;
    return _cloudTex;
  }

  // Fifty of them on a plane two hundred units under the ribbon, following the
  // course rather than sitting in a rectangle -- a bent course would otherwise
  // run off the side of its own weather.
  // Cosmetics draw from their own source. rand() is the seeded course random,
  // and applyMapSky runs before makeRacers -- so fifty clouds taking numbers
  // out of it shifted every bot's speed and slot, and check L noticed.
  function crand(a, b){ return a + Math.random()*(b-a); }

  function buildClouds(){
    if(!cloudGroup){ cloudGroup = new THREE.Group(); scene.add(cloudGroup); }
    clearGroup(cloudGroup);
    // Nearly white, with a breath of the map's sky in it. Tinting them the
    // full sky colour made a dusk map's clouds read as grey pills.
    const tint = new THREE.Color(currentMap.skyTop).lerp(new THREE.Color(0xffffff), 0.86);
    const span = Math.max(2000, trackLength + 900);
    const n = 52;
    for(let i=0;i<n;i++){
      const y = -500 + span*(i + crand(0,0.9))/n;
      const x = crand(-560, TRACK_W + 560);
      const w = toWorld(x, y, -430 + crand(-120, 120));
      const m = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudTexture(), color: tint, transparent:true, depthWrite:false,
        // Not tone mapped. The sky is far brighter than white, so a white
        // sprite put through the same exposure comes out grey, and a grey
        // cloud on a pale sky reads as a hole rather than as weather.
        toneMapped:false, fog:false, opacity: crand(0.4, 0.75) }));
      const s = crand(700, 1500);
      m.scale.set(s, s*0.62, 1);
      m.position.copy(w);
      m.userData.drift = crand(4, 13) * (i%2 ? 1 : -1);
      m.userData.x0 = w.x;
      cloudGroup.add(m);
    }
  }

  // They drift, slowly, and wrap rather than wandering off.
  function syncSky(dt){
    if(!cloudGroup) return;
    for(const c of cloudGroup.children){
      c.position.x += c.userData.drift * dt;
      const d = c.position.x - c.userData.x0;
      if(d >  1600) c.position.x -= 3200;
      if(d < -1600) c.position.x += 3200;
    }
  }
