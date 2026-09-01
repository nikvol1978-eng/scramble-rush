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
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    skinTexCache[key] = t;
    return t;
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
    switch(skin.type){
      case 'neon': {
        const col=new THREE.Color(skin.color);
        bodyMat = new THREE.MeshPhongMaterial({ color:col, map, emissive:col, emissiveIntensity:0.85,
          shininess:90, specular:0x888888, transparent:true, opacity:1 });
        animatedMats.push({mat:bodyMat, pulse:3.2, base:0.85, amp:0.22});
        break;
      }
      case 'metal': {
        bodyMat = new THREE.MeshPhongMaterial({ color:new THREE.Color(skin.color), map,
          shininess:skin.shine||160, specular:0xffffff, reflectivity:1, transparent:true, opacity:1 });
        break;
      }
      case 'gradient': {
        bodyMat = new THREE.MeshPhongMaterial({ map, shininess:60, specular:0x666666, transparent:true, opacity:1 });
        break;
      }
      case 'galaxy': {
        bodyMat = new THREE.MeshPhongMaterial({ map,
          emissive:new THREE.Color(skin.colors[skin.colors.length-1]), emissiveIntensity:0.16,
          shininess:80, specular:0x555555, transparent:true, opacity:1 });
        animatedMats.push({mat:bodyMat, scroll:0.012});
        break;
      }
      case 'oil': {
        bodyMat = new THREE.MeshPhongMaterial({ map, shininess:170, specular:0xffffff, transparent:true, opacity:1 });
        animatedMats.push({mat:bodyMat, scroll:0.05});
        break;
      }
      case 'rainbow': {
        bodyMat = new THREE.MeshPhongMaterial({ map, shininess:70, specular:0x777777, transparent:true, opacity:1 });
        animatedMats.push({mat:bodyMat, scroll: skin.slow?0.04:0.13});
        break;
      }
      case 'rainbowneon': {
        bodyMat = new THREE.MeshPhongMaterial({ map, emissive:0xffffff, emissiveIntensity:0.42,
          shininess:120, specular:0xffffff, transparent:true, opacity:1 });
        bodyMat.emissiveMap = map;
        animatedMats.push({mat:bodyMat, scroll:0.2, pulse:4.0, base:0.45, amp:0.18});
        break;
      }
      default: {
        bodyMat = new THREE.MeshPhongMaterial({ color:base.clone(), map, shininess:60,
          specular:0x666666, transparent:true, opacity:1 });
      }
    }
    return { bodyMat, limbMat: new THREE.MeshLambertMaterial({color:limb}) };
  }

