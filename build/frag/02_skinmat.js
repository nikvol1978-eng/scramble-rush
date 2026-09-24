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

  // ---- hand-painted skins ---------------------------------------------------
  // Drawn from a fixed seed (the shop's mulberry32), so every racer and every
  // tile gets the same painting, and every motif through halfTurns
  // (01_data.js), so each repeats exactly every half turn: wrapSeamless's roll
  // lands on an identical image and the back shows no ghost. Nothing random is
  // drawn inside halfTurns -- the copies must be the same copy.
  const SKIN_ART = {
    // The neck's royal blue into the tail's teal and green, fine barbs rising
    // from the hem, scalloped head feathers, and three staggered rows of eyes.
    peacock(){
      const c=blankCanvas(), g=c.getContext('2d'), R=mulberry32(0x9EAC0C), W=TEX, H=TEX;
      const bg=g.createLinearGradient(0,0,0,H);
      bg.addColorStop(0,'#16309a'); bg.addColorStop(0.34,'#125f96'); bg.addColorStop(0.58,'#0c7a6a'); bg.addColorStop(1,'#07402c');
      g.fillStyle=bg; g.fillRect(0,0,W,H);
      const barbs=[]; for(let i=0;i<80;i++) barbs.push([R()*W/2, H*(0.36+R()*0.7), 28+R()*52, (R()-0.5)*18, R()<0.55]);
      g.lineWidth=1.2;
      for(const [x,y0,len,lean,green] of barbs) halfTurns(x, W, X=>{ g.strokeStyle = green ? 'rgba(110,230,170,0.28)' : 'rgba(230,196,90,0.22)';
        g.beginPath(); g.moveTo(X,y0); g.quadraticCurveTo(X+lean*0.3,y0-len*0.5,X+lean,y0-len); g.stroke(); });
      g.lineWidth=1.6; g.strokeStyle='rgba(120,190,255,0.30)';
      for(let y=12, row=0; y<H*0.34; y+=9, row++) for(let x=(row%2?6:0); x<W/2; x+=12)
        halfTurns(x, W, X=>{ g.beginPath(); g.arc(X,y,6,0.15*Math.PI,0.85*Math.PI); g.stroke(); });
      const eye=(x,y,s)=>{ const ring=(rx,ry,col)=>{ g.fillStyle=col; g.beginPath(); g.ellipse(x,y,rx*s,ry*s,0,0,Math.PI*2); g.fill(); };
        ring(10.5,16,'#c08a1c'); ring(8.6,13.4,'#2fb36b'); ring(6.6,10.4,'#16c6bd'); ring(4.7,7.6,'#1d3fc4'); ring(2.8,4.8,'#081236');
        g.fillStyle='rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(x-1.3*s,y-2.4*s,1.1*s,1.6*s,0,0,Math.PI*2); g.fill(); };
      for(const [row,y,s] of [[0,H*0.44,0.8],[1,H*0.63,0.95],[2,H*0.82,1.0]])
        for(let k=0;k<3;k++){ const x=(row%2?21:0)+k*42.67; halfTurns(x, W, X=>eye(X,y,s)); }
      return c;
    },
    // Seven crisp spectrum bands wound round the body as a helix, dark
    // leading between them like stained glass. One full cycle per half turn,
    // so the helix closes on itself exactly.
    spectrum(){
      const c=blankCanvas(), g=c.getContext('2d'), W=TEX, H=TEX;
      const HUES=SPECTRUM, band=16, lead=3, cycle=HUES.length*band, slope=cycle/(W/2);
      g.fillStyle='#1b1440'; g.fillRect(0,0,W,H);
      // band k is where y + slope*x lies in [k*band, (k+1)*band): at the right
      // edge that runs up to H + slope*W
      for(let k=-1; k*band<H+slope*W+band; k++){
        const a=k*band+lead/2, b=(k+1)*band-lead/2;
        g.fillStyle=HUES[((k%HUES.length)+HUES.length)%HUES.length];
        g.beginPath(); g.moveTo(0,a); g.lineTo(W,a-slope*W); g.lineTo(W,b-slope*W); g.lineTo(0,b); g.closePath(); g.fill();
      }
      return c;
    },
    // The void is near-black with a faint violet depth; in it hang thin
    // crystal shards whose edges run through the spectrum, each throwing a
    // short fan of dispersed light, and a dust of prismatic sparks. On the
    // rainbowneon material the canvas is also the emissive map, so only the
    // light glows and the void stays dark.
    prismvoid(){
      const c=blankCanvas(), g=c.getContext('2d'), R=mulberry32(0x5EC7A1), W=TEX, H=TEX;
      g.fillStyle='#06030d'; g.fillRect(0,0,W,H);
      const depth=[]; for(let i=0;i<6;i++) depth.push([R()*W/2, R()*H, 40+R()*50]);
      for(const [x,y,r] of depth) halfTurns(x, W, X=>{ const rg=g.createRadialGradient(X,y,0,X,y,r);
        rg.addColorStop(0,'rgba(58,20,108,0.34)'); rg.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=rg; g.fillRect(X-r,y-r,2*r,2*r); });
      g.lineJoin='round'; g.lineCap='round';
      const hsl=(h,l,a)=>'hsla('+(h%360)+',100%,'+l+'%,'+a+')';
      staggered(W, H, 4, 2, (cx,cy,i)=>{ const s=16+R()*14, rot=R()*6.3, n=3+(i%2), hue=i*47;
        const pts=[]; for(let k=0;k<n;k++){ const a=rot+k*6.283/n+(R()-0.5)*0.5, rr=s*(0.75+R()*0.45); pts.push([Math.cos(a)*rr*0.8, Math.sin(a)*rr]); }
        const rays=[0,1,2,3,4,5].map(k=>[rot+0.3+k*0.12, 18+R()*16]);
        halfTurns(cx, W, X=>{ const poly=()=>{ g.beginPath(); pts.forEach(([px,py],k)=>g.lineTo(X+px,cy+py)); g.closePath(); };
          poly(); g.fillStyle=hsl(hue,62,0.2); g.fill();
          // each edge its own hue, with a white-hot line down the middle
          for(let k=0;k<n;k++){ const [ax,ay]=pts[k], [bx,by]=pts[(k+1)%n];
            for(const [col,lw] of [[hsl(hue+k*120,66,1),3],['#fff',1]]){ g.strokeStyle=col; g.lineWidth=lw;
              g.beginPath(); g.moveTo(X+ax,cy+ay); g.lineTo(X+bx,cy+by); g.stroke(); } }
          // the dispersed fan, red to violet, off the first corner
          const [vx,vy]=pts[0]; g.lineWidth=1.6;
          rays.forEach(([a,L],k)=>{ g.strokeStyle=hsl(k*52,64,0.9); g.beginPath();
            g.moveTo(X+vx,cy+vy); g.lineTo(X+vx+Math.cos(a)*L*0.8, cy+vy+Math.sin(a)*L); g.stroke(); }); }); });
      const dust=[]; for(let i=0;i<60;i++) dust.push([R()*W/2, 10+R()*(H-20), 0.6+R()*1.2, Math.floor(R()*360)]);
      for(const [x,y,r,hh] of dust) halfTurns(x, W, X=>{ g.fillStyle=hsl(hh,78,1); g.beginPath(); g.arc(X,y,r,0,Math.PI*2); g.fill(); });
      return c;
    }
  };

  // ---- base appearance of a skin, as a canvas (null = flat colour, no map needed)
  function skinCanvas(skin){
    if(skin.art && SKIN_ART[skin.art]) return cachedCanvas('art_'+skin.art, SKIN_ART[skin.art]);
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
    // A pattern with light parts (lift) cannot go on the white stand-in: that
    // canvas is multiplied by the skin colour, so white on it is a no-op and
    // nothing can come out lighter than the skin. For those, paint the skin's
    // own colour here instead; makeSkinMaterials then turns the material
    // colour white, so plain areas render the same colour as before and the
    // motif renders as itself.
    const bakedFlat = !base && !!(pattern && pattern.lift);
    if(base) g.drawImage(base, 0, 0, TEX, TEX);
    else { g.fillStyle = bakedFlat ? skin.color : '#ffffff'; g.fillRect(0,0,TEX,TEX); }  // white multiplies to the skin colour
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
    // A painted skin is cyclic too, but a pattern on it may not be, so it is
    // blended like any other; its half-turn repeat makes that a no-op on it.
    const seamless = ((skin.type==='rainbow' || skin.type==='rainbowneon') && !skin.art) ? c : wrapSeamless(c);
    const t = new THREE.CanvasTexture(seamless);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    // Canvases painted in real colours -- a flat skin's own colour under a lift
    // pattern, and the painted skins -- are sRGB, so the flat colour decodes to
    // exactly the value THREE.Color gives the material. Every other canvas
    // keeps the colour space it always had.
    if(bakedFlat || skin.art) t.colorSpace = THREE.SRGBColorSpace;
    t.userData.bakedFlat = bakedFlat;
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
    // The skin colour is already painted into a baked map; multiplying it in
    // again would square it.
    const baked = !!(map && map.userData.bakedFlat);
    const scroll = (d)=>skin.scroll !== undefined ? skin.scroll : d;
    let bodyMat;
    // Toon shading with a four-step ramp for the matte skins; the shiny ones
    // stay Phong, because the highlight is their whole point. Both carry the
    // baked crease darkening in the bean's vertex colours and a soft rim.
    const toon = (extra)=>new THREE.MeshToonMaterial(Object.assign({ map, gradientMap: toonRamp(),
      vertexColors:true, transparent:true, opacity:1 }, extra||{}));
    switch(skin.type){
      case 'neon': {
        const col=new THREE.Color(skin.color);
        bodyMat = toon({ color: baked ? new THREE.Color(0xffffff) : col, emissive:col, emissiveIntensity:0.85 });
        animatedMats.push({mat:bodyMat, pulse:3.2, base:0.85, amp:0.22});
        break;
      }
      case 'metal': {
        bodyMat = new THREE.MeshPhongMaterial({ color:new THREE.Color(baked ? 0xffffff : skin.color), map,
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
        animatedMats.push({mat:bodyMat, scroll:scroll(0.05)});
        break;
      }
      case 'rainbow': {
        bodyMat = toon({});
        animatedMats.push({mat:bodyMat, scroll:scroll(skin.slow?0.04:0.13)});
        break;
      }
      case 'rainbowneon': {
        bodyMat = toon({ emissive:0xffffff, emissiveIntensity:0.42 });
        bodyMat.emissiveMap = map;
        // `glow`: a painted void is dark where it is not lit, so it can take
        // a brighter emissive than a canvas that glows all over.
        if(skin.glow) bodyMat.emissiveIntensity = skin.glow;
        animatedMats.push({mat:bodyMat, scroll:scroll(0.2), pulse:4.0, base:skin.glow || 0.45, amp:0.18});
        break;
      }
      default: {
        bodyMat = toon({ color: baked ? new THREE.Color(0xffffff) : base.clone() });
      }
    }
    addRim(bodyMat, 0xbfe6ff, 0.35);
    wrapAroundUv(bodyMat);
    const limbMat = new THREE.MeshToonMaterial({color:limb, gradientMap:toonRamp()});
    return { bodyMat, limbMat };
  }

