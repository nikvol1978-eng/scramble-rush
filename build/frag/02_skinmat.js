  // ============================================================
  // SKIN + PATTERN TEXTURES (procedural — no external art)
  // ============================================================
  const TEX = 256;
  const canvasCache = {};
  function cachedCanvas(key, build){
    if(!canvasCache[key]) canvasCache[key] = build();
    return canvasCache[key];
  }
  function blankCanvas(){
    const c=document.createElement('canvas'); c.width=TEX; c.height=TEX; return c;
  }

  // ---- base appearance of a skin, as a canvas (null = flat colour, no map needed)
  function skinCanvas(skin){
    switch(skin.type){
      case 'gradient': return cachedCanvas('g_'+skin.colors.join('_'), ()=>{
        const c=blankCanvas(), g=c.getContext('2d');
        const grad=g.createLinearGradient(0,0,0,TEX);
        grad.addColorStop(0,skin.colors[1]); grad.addColorStop(1,skin.colors[0]);
        g.fillStyle=grad; g.fillRect(0,0,TEX,TEX); return c;
      });
      case 'rainbow': case 'rainbowneon': return cachedCanvas('rb', ()=>{
        const c=blankCanvas(), g=c.getContext('2d');
        const grad=g.createLinearGradient(0,0,TEX,0);
        for(let i=0;i<=12;i++) grad.addColorStop(i/12,'hsl('+(i*30)+' 95% 58%)');
        g.fillStyle=grad; g.fillRect(0,0,TEX,TEX); return c;
      });
      case 'galaxy': return cachedCanvas('gal_'+skin.colors.join('_'), ()=>{
        const c=blankCanvas(), g=c.getContext('2d');
        g.fillStyle=skin.colors[0]; g.fillRect(0,0,TEX,TEX);
        for(let i=0;i<22;i++){
          const x=Math.random()*TEX, y=Math.random()*TEX, r=30+Math.random()*80;
          const col=skin.colors[1+Math.floor(Math.random()*(skin.colors.length-1))];
          const rg=g.createRadialGradient(x,y,0,x,y,r);
          rg.addColorStop(0,col); rg.addColorStop(1,'rgba(0,0,0,0)');
          g.globalAlpha=0.30+Math.random()*0.28; g.fillStyle=rg;
          g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill();
        }
        g.globalAlpha=1;
        for(let i=0;i<300;i++){
          const x=Math.random()*TEX, y=Math.random()*TEX, r=Math.random()*1.4+0.3;
          g.fillStyle='rgba(255,255,255,'+(0.35+Math.random()*0.65)+')';
          g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill();
        }
        return c;
      });
      case 'oil': return cachedCanvas('oil', ()=>{
        const c=blankCanvas(), g=c.getContext('2d');
        g.fillStyle='#140b2c'; g.fillRect(0,0,TEX,TEX);
        for(let i=0;i<34;i++){
          const x=Math.random()*TEX, y=Math.random()*TEX, r=26+Math.random()*62;
          const rg=g.createRadialGradient(x,y,0,x,y,r);
          rg.addColorStop(0,'hsla('+Math.floor(Math.random()*360)+',90%,60%,0.55)');
          rg.addColorStop(1,'rgba(0,0,0,0)');
          g.fillStyle=rg; g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill();
        }
        return c;
      });
      default: return null;   // solid / neon / metal — the material colour carries it
    }
  }

  // ---- final map for a (skin, pattern) pair
  const skinTexCache = {};
  function skinTexture(skin, pattern){
    const key = skin.id + '|' + (pattern ? pattern.id : 'none');
    if(skinTexCache[key]) return skinTexCache[key];
    const base = skinCanvas(skin);
    if(!base && (!pattern || pattern.id==='none')) return null;   // nothing to draw
    const c = blankCanvas(), g = c.getContext('2d');
    if(base) g.drawImage(base, 0, 0, TEX, TEX);
    else { g.fillStyle='#ffffff'; g.fillRect(0,0,TEX,TEX); }      // white multiplies to the skin colour
    if(pattern && pattern.id!=='none'){
      g.save();
      g.globalAlpha = pattern.alpha!==undefined ? pattern.alpha : 0.5;
      g.fillStyle = pattern.ink || 'rgba(0,0,0,1)';
      g.strokeStyle = pattern.ink || 'rgba(0,0,0,1)';
      pattern.draw(g, TEX, TEX);
      g.restore();
    }
    // The lathe wraps this once round the body, so the left and right edges
    // meet at the back. Nothing drawn above tiles, and the join showed as a
    // seam. Rainbows are cyclic already; everything else gets blended round.
    const seamless = (skin.type==='rainbow' || skin.type==='rainbowneon') ? c : wrapSeamless(c);
    const t = new THREE.CanvasTexture(seamless);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    skinTexCache[key] = t;
    return t;
  }
  // Roll the image half a turn so its old edges meet in the middle, then fade
  // the original back in over that join. The new edges come from the middle
  // of the original, so they match; the join is a blend, so it does not show.
  function wrapSeamless(src){
    const out = blankCanvas(), g = out.getContext('2d'), half = TEX/2, band = TEX*0.22;
    g.drawImage(src, half, 0, half, TEX, 0, 0, half, TEX);
    g.drawImage(src, 0, 0, half, TEX, half, 0, half, TEX);
    for(let x=Math.floor(half-band); x<half+band; x++){
      const w = 1 - Math.abs(x-half)/band;
      g.globalAlpha = w*w*(3-2*w);
      g.drawImage(src, x, 0, 1, TEX, x, 0, 1, TEX);
    }
    g.globalAlpha = 1;
    return out;
  }

  // Four-step toon ramp, shared by every bean.
  let _toonRamp = null;
  function toonRamp(){
    if(!_toonRamp){
      // Darker than a straight 0..1 ramp: the toon step lights anything facing
      // the key at full, and with the hemisphere fill on top of that a pink
      // bean came out nearly white.
      const data = new Uint8Array([64, 112, 158, 196]);
      // LuminanceFormat went after r136. The toon shader reads .r off this
      // ramp, so a single red channel says exactly what it needs and nothing
      // more.
      _toonRamp = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
      _toonRamp.minFilter = THREE.NearestFilter; _toonRamp.magFilter = THREE.NearestFilter;
      _toonRamp.generateMipmaps = false; _toonRamp.needsUpdate = true;
    }
    return _toonRamp;
  }
  // A soft rim light, folded into whichever material asks for it. Skips the
  // hard black outline the old rig used to separate a bean from the floor.
  function addRim(mat, colorHex, strength){
    mat.onBeforeCompile = shader=>{
      shader.uniforms.uRim = { value: new THREE.Color(colorHex).multiplyScalar(strength) };
      shader.fragmentShader = 'uniform vec3 uRim;\n' + shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        'float rimF = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);\n'
        + 'gl_FragColor.rgb += uRim * rimF * gl_FragColor.a;\n'
        + '#include <dithering_fragment>');
    };
    // a different shader per material, or three.js would share the compiled one
    mat.customProgramCacheKey = ()=>'rim'+colorHex+strength;
    return mat;
  }

  // THE BODY'S CANVAS WRAPS ROUND IT ONCE, AND THE WRAP HAS NO SEAM COLUMN.
  // The bean closes its circle on shared vertices, so one strip of triangles
  // runs from u = 0.98 back to u = 0 and would squeeze the whole canvas into
  // it. Duplicating that column would fix it at the cost of 96 vertices and a
  // second copy of every normal on the line; this fixes it in the sampling
  // instead (Tarini's seamless cylindrical mapping). Each fragment carries u
  // twice -- as stored, which breaks at the front, and shifted half a turn,
  // which breaks at the back -- and reads whichever is not breaking where it
  // is, judged by which one changes least across its own pixel quad. Both
  // name the same texel, so the choice is invisible; the mip level comes from
  // the continuous one, so the join does not show as a line either.
  function wrapAroundUv(mat){
    const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
    mat.onBeforeCompile = (shader, r)=>{
      if(prev) prev(shader, r);
      const decl = '#ifdef USE_MAP\nvarying vec2 vMapUvB;\n#endif\n'
                 + '#ifdef USE_EMISSIVEMAP\nvarying vec2 vEmissiveMapUvB;\n#endif\n';
      shader.vertexShader = decl + shader.vertexShader.replace('#include <uv_vertex>',
        '#include <uv_vertex>\n'
        + '#ifdef USE_MAP\nvMapUvB = ( mapTransform * vec3( fract( MAP_UV.x + 0.5 ) - 0.5, MAP_UV.y, 1.0 ) ).xy;\n#endif\n'
        + '#ifdef USE_EMISSIVEMAP\nvEmissiveMapUvB = ( emissiveMapTransform * vec3( fract( EMISSIVEMAP_UV.x + 0.5 ) - 0.5, EMISSIVEMAP_UV.y, 1.0 ) ).xy;\n#endif\n');
      // Read the chunk through a renamed varying rather than copying it, so
      // three's own map code stays in charge of everything after the lookup.
      // fwidth is core in WebGL2; a WebGL1 context keeps the plain lookup.
      const wrap = (flag, a, chunk)=>'\n#ifdef ' + flag + '\n#if __VERSION__ >= 300\n'
        + 'vec2 ' + a + 'W = fwidth( ' + a + '.x ) <= fwidth( ' + a + 'B.x ) ? ' + a + ' : ' + a + 'B;\n'
        + '#else\nvec2 ' + a + 'W = ' + a + ';\n#endif\n#define ' + a + ' ' + a + 'W\n#endif\n'
        + '#include <' + chunk + '>\n#ifdef ' + flag + '\n#undef ' + a + '\n#endif\n';
      shader.fragmentShader = decl + shader.fragmentShader
        .replace('#include <map_fragment>', wrap('USE_MAP', 'vMapUv', 'map_fragment'))
        .replace('#include <emissivemap_fragment>', wrap('USE_EMISSIVEMAP', 'vEmissiveMapUv', 'emissivemap_fragment'));
    };
    mat.customProgramCacheKey = ()=>(prevKey ? prevKey.call(mat) : '') + '|wrapuv';
    return mat;
  }

  // Materials that need per-frame work (scrolling rainbow, pulsing neon).
  let animatedMats=[];
  function updateSkinMaterials(t){
    for(const a of animatedMats){
      if(a.scroll && a.mat.map) a.mat.map.offset.x = (t*a.scroll)%1;
      if(a.pulse && a.mat.emissive) a.mat.emissiveIntensity = a.base + Math.sin(t*a.pulse)*a.amp;
    }
  }

  // Returns {bodyMat, limbMat}. `skin` is a SKINS entry, `pattern` a PATTERNS entry.
  function makeSkinMaterials(skin, pattern){
    const base = new THREE.Color(skinBaseColor(skin));
    const limb = base.clone().offsetHSL(0,0,-0.16);
    const map = skinTexture(skin, pattern);
    let bodyMat;
    // Toon shading with a four-step ramp for the matte skins; the shiny ones
    // stay Phong, because the highlight is their whole point. Both carry the
    // baked crease darkening in the bean's vertex colours and a soft rim.
    const toon = (extra)=>new THREE.MeshToonMaterial(Object.assign({ map, gradientMap: toonRamp(),
      vertexColors:true, transparent:true, opacity:1 }, extra||{}));
    switch(skin.type){
      case 'neon': {
        const col=new THREE.Color(skin.color);
        bodyMat = toon({ color:col, emissive:col, emissiveIntensity:0.85 });
        animatedMats.push({mat:bodyMat, pulse:3.2, base:0.85, amp:0.22});
        break;
      }
      case 'metal': {
        bodyMat = new THREE.MeshPhongMaterial({ color:new THREE.Color(skin.color), map,
          shininess:skin.shine||160, specular:0xffffff, reflectivity:1, vertexColors:true, transparent:true, opacity:1 });
        break;
      }
      case 'gradient': {
        bodyMat = toon({});
        break;
      }
      case 'galaxy': {
        bodyMat = toon({ emissive:new THREE.Color(skin.colors[skin.colors.length-1]), emissiveIntensity:0.16 });
        animatedMats.push({mat:bodyMat, scroll:0.012});
        break;
      }
      case 'oil': {
        bodyMat = new THREE.MeshPhongMaterial({ map, shininess:170, specular:0xffffff, vertexColors:true, transparent:true, opacity:1 });
        animatedMats.push({mat:bodyMat, scroll:0.05});
        break;
      }
      case 'rainbow': {
        bodyMat = toon({});
        animatedMats.push({mat:bodyMat, scroll: skin.slow?0.04:0.13});
        break;
      }
      case 'rainbowneon': {
        bodyMat = toon({ emissive:0xffffff, emissiveIntensity:0.42 });
        bodyMat.emissiveMap = map;
        animatedMats.push({mat:bodyMat, scroll:0.2, pulse:4.0, base:0.45, amp:0.18});
        break;
      }
      default: {
        bodyMat = toon({ color:base.clone() });
      }
    }
    addRim(bodyMat, 0xbfe6ff, 0.35);
    wrapAroundUv(bodyMat);
    const limbMat = new THREE.MeshToonMaterial({color:limb, gradientMap:toonRamp()});
    return { bodyMat, limbMat };
  }

