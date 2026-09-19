  // ---------------------------------------------------------------- v21 §4.4
  // Every course in v21 hangs in the air, so the sky has to be a real one and
  // there has to be something underneath to fall past. The gradient dome from
  // v5 stays in the scene but hidden -- the Sky shader wants a sun, not three
  // colours, and the dome is what the code elsewhere still holds a handle to.
  const SKY_SUN = {
    // `haze` is how much of the map's own skyMid is blended into the band just
    // above the horizon. A chase camera looks at that band and almost nothing
    // else, and the band is the palest part of a physical sky -- so on the
    // daytime maps the backdrop read as white paper. Turbidity and mie come
    // down to stop the haze washing it out, and the map's blue is mixed back
    // in where the player is actually looking. Neon's dusk and Lava's smoke
    // are the two skies that are supposed to be hazy, and keep theirs.
    sunny:   { elev:42,  azim:158, turbidity:1.5, rayleigh:2.4, mie:0.003, haze:0.85, exposure:0.60 },
    cannonc: { elev:74,  azim:190, turbidity:1.5, rayleigh:1.8, mie:0.003, haze:0.80, exposure:0.60 },  // noon
    slide:   { elev:19,  azim:128, turbidity:1.5, rayleigh:3.0, mie:0.003, haze:0.85, exposure:0.58 },  // cold bright morning
    neon:    { elev:2.4, azim:250, turbidity:8,   rayleigh:3.4, mie:0.006, haze:0.00, exposure:0.52 },  // dusk
    lava:    { elev:6,   azim:205, turbidity:12,  rayleigh:4.2, mie:0.006, haze:0.00, exposure:0.55 },
    doors:   { elev:30,  azim:180, turbidity:1.5, rayleigh:2.2, mie:0.003, haze:0.80, exposure:0.60 },
    _default:{ elev:35,  azim:170, turbidity:4,   rayleigh:2.2, mie:0.006, haze:0.00, exposure:0.60 }
  };
  const NL = String.fromCharCode(10);   // GLSL needs real newlines, not spaces
  let skyDome = null, cloudGroup = null, _cloudTex = null;
  const sunOff = new THREE.Vector3(220, 420, -160);

  // Built on first use and then kept: the Sky shader is one big fragment
  // program and there is no reason to compile it twice. It rides with the
  // camera, because a course is ten thousand units long and a dome parked at
  // the origin would be behind you by the halfway mark.
  function skyMeshFor(){
    if(!skyDome){
      skyDome = new THREE.Sky();
      // Two uniforms spliced into the Sky shader so the horizon band can carry
      // the map's colour. The band is where a chase camera spends its whole
      // life, and the model's own answer there is haze, which is white.
      const m = skyDome.material;
      m.uniforms.uHaze    = { value: new THREE.Color(0x4a90c9) };
      m.uniforms.uHazeAmt = { value: 0.0 };
      m.onBeforeCompile = sh => {
        sh.uniforms.uHaze    = m.uniforms.uHaze;
        sh.uniforms.uHazeAmt = m.uniforms.uHazeAmt;
        sh.fragmentShader = 'uniform vec3 uHaze;' + NL + 'uniform float uHazeAmt;' + NL + sh.fragmentShader
          .replace('gl_FragColor = vec4( retColor, 1.0 );',
            // strongest on the horizon, gone by halfway up the dome, and never
            // applied below it -- there is course down there, not sky
            'float hz = 1.0 - smoothstep(0.0, 0.42, max(0.0, direction.y));' + NL
          // Take the hue, keep the brightness. Mixing straight towards the
          // colour drags a sky that is far brighter than white down towards a
          // dim blue and it still reads as grey; scaling the tint up to the
          // luminance already there swaps the hue and leaves the light alone.
          + 'float skyLum = dot(retColor, vec3(0.2126, 0.7152, 0.0722));' + NL
          + 'float hazeLum = max(1e-4, dot(uHaze, vec3(0.2126, 0.7152, 0.0722)));' + NL
          // ...at about two thirds of it. ACES pulls anything this bright
          // towards white, so a tint applied at the original luminance comes
          // back out as the grey it replaced; giving up a third of the
          // brightness is what lets the colour survive the tone mapper.
          + 'retColor = mix(retColor, uHaze * (skyLum / hazeLum) * 0.66, hz * uHazeAmt);' + NL
          + 'gl_FragColor = vec4( retColor, 1.0 );');
      };
      m.customProgramCacheKey = () => 'skyhaze';
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
    // v27: THE SKYLINE AND THE CLOUDS ARE PART OF THE SKY, and this is the one
    // switch that is supposed to say so. Both groups hang off `scene` rather
    // than off courseGroup, so goHome's `courseGroup.visible = false` never
    // reached them and showSky only ever turned the dome off -- which left a
    // bank of white cloud sprites and the blue skyline drifting across the
    // lobby after every race, in front of the ring backdrop. It is not a new
    // fault; canonical main does it too, and rather more of it, because its
    // lobby camera stands further back. It only became easy to see once the
    // backdrop stopped being pale.
    //
    // Fixed here rather than in goHome so that every caller gets it: the lobby
    // asks for showSky(false), play and the map reel ask for showSky(true),
    // and 07_rounds saves and restores exactly this flag around the reel.
    if(skylineGroup) skylineGroup.visible = !!on;
    if(cloudGroup)   cloudGroup.visible   = !!on;
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
    _cloudTex.generateMipmaps = true;
    _cloudTex.minFilter = THREE.LinearMipmapLinearFilter;
    _cloudTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return _cloudTex;
  }

  // Fifty of them on a plane two hundred units under the ribbon, following the
  // course rather than sitting in a rectangle -- a bent course would otherwise
  // run off the side of its own weather.
  // Cosmetics draw from their own source. rand() is the seeded course random,
  // and applyMapSky runs before makeRacers -- so fifty clouds taking numbers
  // out of it shifted every bot's speed and slot, and check L noticed.
  function crand(a, b){ return a + Math.random()*(b-a); }


  // ---- the skyline (v24 §3) ----------------------------------------------
  // A band of low-poly shapes on the horizon, per theme, so the sky is a place
  // rather than a gradient. It is one merged mesh a map -- fifty separate
  // hills would be fifty draw calls, and §1 spent a long time getting the
  // frame under three hundred -- and it sits far enough out that it never
  // reads as something you could reach.
  //
  // The shape is the theme's, not the map's palette: hills for the sunny and
  // watery maps, towers for the neon one, jagged peaks for lava and the climb.
  // Cosmetics draw from Math.random, never rand(), for the reason the clouds do.
  let skylineGroup = null;
  const SKYLINE = {
    // Sized against the distance they stand at, not against the course. At
    // 1500-3000 units out a 300-tall hill subtends about four degrees and
    // reads as a bump on the horizon line; these are what actually make a
    // shape against the sky from a chase camera 176 units up.
    hills:  { n: 26, w: [900, 1900], h: [420, 900],  shape: 'cone', seg: 5 },
    towers: { n: 34, w: [220,  480], h: [600, 1600], shape: 'box',  seg: 0 },
    peaks:  { n: 22, w: [700, 1500], h: [700, 1400], shape: 'cone', seg: 4 }
  };
  function skylineKind(){
    if(currentMap.mode === 'lava' || currentMap.climbs) return 'peaks';
    if(currentMap.night || currentMap.key === 'neon')   return 'towers';
    return 'hills';
  }
  function buildSkyline(){
    if(!skylineGroup){ skylineGroup = new THREE.Group(); scene.add(skylineGroup); }
    clearGroup(skylineGroup);
    const kind = SKYLINE[skylineKind()];
    // Two shades of the horizon band, darkened, so the row has depth without
    // becoming a second thing to read.
    const base = new THREE.Color(currentMap.skyMid || currentMap.skyTop);
    const parts = [];
    const span = Math.max(3200, trackLength + 2400);
    for(let i=0;i<kind.n;i++){
      const w = crand(kind.w[0], kind.w[1]), h = crand(kind.h[0], kind.h[1]);
      const g = kind.shape === 'cone'
        ? new THREE.ConeGeometry(w*0.5, h, kind.seg)
        : new THREE.BoxGeometry(w, h, w*0.8);
      // far out to one side or the other, and spread the length of the course
      const side = (i % 2) ? 1 : -1;
      const x = TRACK_W/2 + side*crand(1500, 3000);
      const y = -900 + span*(i + crand(0,0.9))/kind.n;
      // Base a little under the ribbon, not far under it: the first version
      // centred each shape at -260 and the whole band sat below the floor,
      // which is a skyline you cannot see.
      const p = toWorld(x, y, -70 + h/2);
      g.translate(p.x, p.y, p.z);
      // a shade per shape, so the band is not one flat silhouette
      const c = base.clone().multiplyScalar(crand(0.34, 0.62));
      const col = new Float32Array(g.attributes.position.count*3);
      for(let v=0; v<g.attributes.position.count; v++){ col[v*3]=c.r; col[v*3+1]=c.g; col[v*3+2]=c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push(g);
    }
    const merged = mergeSimple(parts);
    const m = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors:true, fog:false }));
    m.frustumCulled = false; m.renderOrder = -1;
    skylineGroup.add(m);
  }
  // A concatenation, not a library: three's BufferGeometryUtils is one more
  // module over the wire for something this file can do in ten lines.
  function mergeSimple(parts){
    let nv = 0, ni = 0;
    for(const g of parts){ nv += g.attributes.position.count; ni += g.index.count; }
    const pos = new Float32Array(nv*3), nor = new Float32Array(nv*3), col = new Float32Array(nv*3);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let v = 0, k = 0;
    for(const g of parts){
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, v*3);
      nor.set(g.attributes.normal.array, v*3);
      col.set(g.attributes.color.array, v*3);
      const gi = g.index.array;
      for(let i=0;i<gi.length;i++) idx[k+i] = gi[i] + v;
      v += n; k += gi.length;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal',   new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color',    new THREE.Float32BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }

  function buildClouds(){
    if(!cloudGroup){ cloudGroup = new THREE.Group(); scene.add(cloudGroup); }
    clearGroup(cloudGroup);
    // Nearly white, with a breath of the map's sky in it. Tinting them the
    // full sky colour made a dusk map's clouds read as grey pills.
    // Over one, on purpose. The sky is far brighter than white, so a cloud at
    // a flat white reads as a grey hole in it once the frame is tone mapped --
    // and with a composer the tone mapping happens to the whole buffer at the
    // end, where a material saying toneMapped:false cannot opt out of it.
    const tint = new THREE.Color(currentMap.skyTop).lerp(new THREE.Color(0xffffff), 0.86)
                     .multiplyScalar(2.6);
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
        fog:false, opacity: crand(0.4, 0.75) }));
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
