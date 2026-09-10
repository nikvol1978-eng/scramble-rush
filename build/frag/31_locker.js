  // ============================================================
  // THE LOCKER  (v24 §5.3)
  // ============================================================
  // Two panes. On the left the stumbler, full height, wearing whatever tile is
  // highlighted right now -- not the equipped item. Hovering is trying it on;
  // clicking is buying it or putting it on. On the right a grid of square
  // tiles, each one an actual render of the stumbler wearing that item, so a
  // pattern or a hat reads at a glance instead of being a swatch you have to
  // imagine on a character.
  //
  // Those renders are the point of the screen and they are also the expensive
  // part of it, so most of what follows is about paying for them once.

  const LK_TABS = [
    { id:'skin',    label:'COLOUR'  },
    { id:'pattern', label:'PATTERN' },
    { id:'hat',     label:'HAT'     },
    { id:'eyes',    label:'EYES'    }
  ];
  let lkTab = 'skin', lkIndex = 0, lkBuilt = false;

  // ---- the tile renderer -------------------------------------------------
  // One 96px render target, one throwaway scene, and a cache that lives for
  // the session. A tile is rendered once ever: the second time the locker is
  // opened it is 88 cache hits and no GPU work at all.
  const TILE_PX = 96;
  const tileCache = new Map();
  let tileRT = null, tileScene = null, tileCam = null, tileCanvas = null, tileCtx = null, tilePixels = null;

  function ensureTileRig(){
    if(tileRT) return;
    tileRT = new THREE.WebGLRenderTarget(TILE_PX, TILE_PX, { depthBuffer:true });
    tileScene = new THREE.Scene();
    // The rig runs from -9 to +19 about its own origin, plus a hat on top of
    // that, so the whole figure is about 34 tall. At 96 back on a 30-degree
    // lens the frame is 51 units and the character was cropped at the sides
    // and the crown lost off the top. 150 back gives 80 units of frame, which
    // leaves the figure a comfortable two thirds of the tile.
    tileCam = new THREE.PerspectiveCamera(30, 1, 1, 500);
    tileCam.position.set(0, 14, 150); tileCam.lookAt(0, 4, 0);
    // Flat and even: a tile is an icon, not a portrait, and a key light with a
    // falloff would make the same hat read differently in two rows.
    tileScene.add(new THREE.HemisphereLight(0xffffff, 0x8899bb, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(60, 120, 90); tileScene.add(key);
    tileCanvas = document.createElement('canvas');
    tileCanvas.width = tileCanvas.height = TILE_PX;
    tileCtx = tileCanvas.getContext('2d');
    tilePixels = new Uint8Array(TILE_PX*TILE_PX*4);
  }

  // What a tile of each kind is wearing. An item is shown on a neutral base so
  // the tile is about the item: a pattern tile is that pattern on a plain
  // stumbler, a hat tile is that hat on a plain stumbler. It also means the
  // cache key is the item alone and never goes stale when the player changes
  // something else.
  const TILE_BASE_SKIN = 'cream';
  function tileLook(kind, id){
    switch(kind){
      case 'skin':    return { skin:skinOf(id), pattern:patternOf('none'), hat:'none', eyes:'round' };
      case 'pattern': return { skin:skinOf(TILE_BASE_SKIN), pattern:patternOf(id), hat:'none', eyes:'round' };
      case 'hat':     return { skin:skinOf(TILE_BASE_SKIN), pattern:patternOf('none'), hat:id, eyes:'round' };
      case 'eyes':    return { skin:skinOf(TILE_BASE_SKIN), pattern:patternOf('none'), hat:'none', eyes:id };
    }
  }

  // Rendering a tile has three costs and only one of them is the render: a
  // character to build, a readback that stalls the GPU, and -- in the first
  // version of this -- a PNG encode per tile, which is what took the locker
  // two full seconds to open. There is no PNG now. The pixels go straight
  // into the tile's own canvas, and what is cached is the ImageData.
  function tilePixelsFor(kind, id){
    const key = kind + ':' + id;
    const hit = tileCache.get(key);
    if(hit) return hit;
    ensureTileRig();
    const m = makeCharacter(tileLook(kind, id));
    // Turned a few degrees: a straight-on bean reads as a circle.
    m.group.rotation.y = 0.42;
    m.group.position.y = -2;
    tileScene.add(m.group);

    const prevTarget = renderer.getRenderTarget();
    // A tile is an icon and wants the colour the item actually is. The race
    // view is tone mapped by the composer at the end of the frame; a direct
    // render to a target goes through the renderer's own ACES curve instead,
    // which took every colourway two shades darker and flatter than its own
    // swatch -- a locker full of muddy beans next to vivid pills.
    const prevTone = renderer.toneMapping;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setRenderTarget(tileRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(tileScene, tileCam);
    renderer.readRenderTargetPixels(tileRT, 0, 0, TILE_PX, TILE_PX, tilePixels);
    renderer.setRenderTarget(prevTarget);
    renderer.toneMapping = prevTone;

    // readRenderTargetPixels hands rows back bottom-up; a canvas wants them
    // the other way round.
    const img = tileCtx.createImageData(TILE_PX, TILE_PX);
    for(let y=0; y<TILE_PX; y++){
      const src = (TILE_PX-1-y)*TILE_PX*4, dst = y*TILE_PX*4;
      img.data.set(tilePixels.subarray(src, src + TILE_PX*4), dst);
    }
    tileScene.remove(m.group);
    disposeCharacter(m);
    tileCache.set(key, img);
    return img;
  }
  // A character built for one render and thrown away has to give its buffers
  // back, or eighty-eight of them leak eighty-eight geometries. The bean and
  // the outline are shared by every character ever made and are not ours to
  // dispose of.
  function disposeCharacter(m){
    m.group.traverse(o=>{
      if(o.isMesh || o.isSkinnedMesh){
        if(o.geometry && o.geometry !== beanGeometry() && o.geometry !== beanOutlineGeometry()) o.geometry.dispose();
        if(o.material && o.material.dispose && o.material !== m.bodyMat) o.material.dispose();
      }
    });
    if(m.bodyMat) m.bodyMat.dispose();
  }

  function lkPaint(canvas, kind, id){
    canvas.getContext('2d').putImageData(tilePixelsFor(kind, id), 0, 0);
    canvas.classList.add('done');
    // The swatch behind is a placeholder for the render, and once the render
    // is there it is only competing with it -- a pink bean on a pink square
    // has no silhouette at all.
    if(canvas.parentElement) canvas.parentElement.classList.add('shot');
  }

  // ---- what is in each tab -----------------------------------------------
  function lkItems(){
    switch(lkTab){
      case 'skin':    return SKINS.map(s=>({ id:s.id, name:s.name, rarity:s.rarity, unlock:s.unlock }));
      case 'pattern': return PATTERNS.map(p=>({ id:p.id, name:p.name, rarity:p.rarity, unlock:p.unlock }));
      case 'hat':     return HATS.map(([id,name])=>({ id, name, rarity:'common', unlock:{kind:'default'} }));
      case 'eyes':    return EYES.map(([id,name])=>({ id, name, rarity:'common', unlock:{kind:'default'} }));
    }
  }
  function lkOwned(item){
    if(lkTab === 'skin')    return ownedSkins().has(item.id);
    if(lkTab === 'pattern') return ownedPatterns().has(item.id);
    return true;                                    // hats and eyes are all yours
  }
  function lkEquipped(item){
    if(lkTab === 'skin')    return custom.skin === item.id;
    if(lkTab === 'pattern') return (custom.pattern||'none') === item.id;
    if(lkTab === 'hat')     return (custom.hat||'none') === item.id;
    return (custom.eyes||'round') === item.id;
  }

  // ---- the left pane follows the highlight -------------------------------
  function lkPreview(){
    const item = lkItems()[lkIndex]; if(!item) return;
    if(lkTab === 'skin')         setPreview(item.id, null);
    else if(lkTab === 'pattern') setPreview(null, item.id);
    else {
      // Hats and eyes are not part of the skin preview, so they are tried on
      // by changing the look and rebuilding -- which is what refreshPreview
      // does anyway, and is cheap because it is one character.
      setPreview(null, null);
      lkTryOn = { hat: lkTab==='hat' ? item.id : null, eyes: lkTab==='eyes' ? item.id : null };
    }
    if(lkTab === 'skin' || lkTab === 'pattern') lkTryOn = null;
    refreshPreview();
  }

  // ---- the grid ----------------------------------------------------------
  // The grid is put on screen with every tile in place and none of them
  // rendered, which costs nothing and is what keeps the open under the
  // budget. The renders then stream in: the rows you can actually see first,
  // a few a frame so nothing janks, and the rest in idle time behind them.
  // Until a tile has its render it shows the item's flat swatch, so the grid
  // is never a wall of empty boxes -- but the swatch is a placeholder for a
  // few frames, not the tile. The renders are the screen.
  let lkQueue = [], lkQueueRun = false;
  const LK_PER_FRAME = 3;
  function lkPump(){
    if(!lkQueue.length){ lkQueueRun = false; return; }
    lkQueueRun = true;
    const t0 = performance.now();
    let n = 0;
    while(lkQueue.length && n < LK_PER_FRAME && performance.now() - t0 < 9){
      const t = lkQueue.shift();
      // One bad tile must not stop the queue: the rest of the grid is still
      // worth having, and the swatch underneath is a survivable fallback.
      try { if(t.canvas.isConnected) lkPaint(t.canvas, t.kind, t.id); }
      catch(e){ window.__lkErr = String(e && e.message || e); }
      n++;
    }
    // The visible rows go on animation frames so they land immediately; once
    // those are done the tail can wait for the browser to be idle.
    // A timer, not requestAnimationFrame. The debug build exists partly
    // because rAF is frozen in some embedded preview panes, and a queue that
    // only advances on a frame never advances there at all.
    if(lkQueue.length){
      if(lkQueue[0].soon) setTimeout(lkPump, 0);
      else lkIdle(lkPump);
    } else lkQueueRun = false;
  }
  const lkIdle = (fn)=> (window.requestIdleCallback ? window.requestIdleCallback(()=>fn(), {timeout:600})
                                                    : setTimeout(fn, 16));

  const LK_SOON = 16;                               // a 4-wide grid, so four rows
  function buildLockerGrid(){
    const grid = $('lkGrid'); grid.innerHTML = '';
    lkQueue = [];
    const items = lkItems(), owned = lkTab==='skin' ? ownedSkins()
                          : lkTab==='pattern' ? ownedPatterns() : null;
    items.forEach((item, i)=>{
      const tile = document.createElement('button');
      tile.className = 'lkTile' + (i===lkIndex ? ' hi' : '');
      tile.dataset.i = i;
      const have = owned ? owned.has(item.id) : true;
      if(!have) tile.classList.add('locked');
      if(lkEquipped(item)) tile.classList.add('on');

      // the placeholder underneath: the item's own colour, so an unrendered
      // tile still says which item it is
      if(lkTab === 'skin') tile.style.setProperty('--sw', skinSwatch(skinOf(item.id)));

      const pill = document.createElement('span');
      pill.className = 'rarityPill r-' + item.rarity;
      pill.textContent = RARITY[item.rarity].name.toUpperCase();
      tile.appendChild(pill);

      const canvas = document.createElement('canvas');
      canvas.className = 'lkShot'; canvas.width = canvas.height = TILE_PX;
      tile.appendChild(canvas);

      const cap = document.createElement('span');
      cap.className = 'lkCap'; cap.textContent = item.name;
      tile.appendChild(cap);

      if(!have){
        const lock = document.createElement('span');
        lock.className = 'lkLock';
        lock.textContent = item.unlock.kind==='coins' ? (item.unlock.cost + ' coins') : unlockText(item);
        tile.appendChild(lock);
      }
      if(lkEquipped(item)){
        const tick = document.createElement('span');
        tick.className = 'lkTick'; tick.textContent = '\u2713';
        tile.appendChild(tick);
      }

      // A tile already in the cache is painted now -- it costs a putImageData
      // and nothing else, and it would be silly to queue it.
      if(tileCache.has(lkTab + ':' + item.id)) lkPaint(canvas, lkTab, item.id);
      else lkQueue.push({ canvas, kind:lkTab, id:item.id, soon: i < LK_SOON });

      tile.addEventListener('mouseenter', ()=>{ lkIndex = i; lkSync(); });
      tile.addEventListener('click', ()=>{ lkIndex = i; lkSync(); lkAct(); });
      grid.appendChild(tile);
    });
    if(lkQueue.length && !lkQueueRun) setTimeout(lkPump, 0);
  }

  // ---- header, highlight, footer ----------------------------------------
  function lkSync(){
    const items = lkItems();
    lkIndex = clamp(lkIndex, 0, items.length-1);
    const item = items[lkIndex];
    document.querySelectorAll('.lkTile').forEach((t,i)=>t.classList.toggle('hi', i===lkIndex));
    const hi = document.querySelector('.lkTile.hi');
    if(hi) hi.scrollIntoView({block:'nearest'});
    $('lkName').textContent = item.name;
    const rp = $('lkRarity');
    rp.textContent = RARITY[item.rarity].name.toUpperCase();
    rp.className = 'rarityPill r-' + item.rarity;
    const have = lkOwned(item), on = lkEquipped(item);
    const act = $('lkAction');
    act.textContent = on ? 'EQUIPPED' : have ? 'EQUIP' : (item.unlock.kind==='coins' ? 'BUY' : 'LOCKED');
    act.disabled = on || (!have && item.unlock.kind!=='coins');
    act.className = 'btn small ' + (on ? 'blue' : have ? 'gold' : 'pink');
    $('lkHint').textContent = have ? '' : unlockText(item);
    lkPreview();
  }

  // ---- equipping and buying ---------------------------------------------
  function lkAct(){
    const item = lkItems()[lkIndex]; if(!item) return;
    if(lkOwned(item)){
      if(lkTab === 'skin'){ custom.skin = item.id; syncCustomColor(); }
      if(lkTab === 'pattern') custom.pattern = item.id;
      if(lkTab === 'hat')     custom.hat = item.id;
      if(lkTab === 'eyes')    custom.eyes = item.id;
      lkTryOn = null; setPreview(null, null);
      saveProfile(); SFX.click(); buildLockerGrid(); lkSync();
      return;
    }
    if(item.unlock.kind !== 'coins') return;
    lkConfirm(item);
  }

  function lkConfirm(item){
    const cost = item.unlock.cost;
    const box = $('lkBuy');
    $('lkBuyName').textContent = item.name;
    $('lkBuyCost').textContent = cost + ' coins';
    lkPaint($('lkBuyShot'), lkTab, item.id);
    $('lkBuyWarn').textContent = stats.coins >= cost ? '' : 'Not enough coins.';
    $('lkBuyYes').disabled = stats.coins < cost;
    box.classList.remove('hidden');
    lkBuyItem = item;
  }
  let lkBuyItem = null, lkTryOn = null;
  function lkBuyDo(){
    const item = lkBuyItem; if(!item) return;
    const cost = item.unlock.cost;
    if(stats.coins < cost) return;
    stats.coins -= cost;
    if(lkTab === 'skin'){ (stats.owned = stats.owned||[]).push(item.id); custom.skin = item.id; syncCustomColor(); }
    else { (stats.patterns = stats.patterns||[]).push(item.id); custom.pattern = item.id; }
    saveProfile(); SFX.coin ? SFX.coin() : SFX.click(); refreshCoinChips();
    $('lkBuy').classList.add('hidden'); lkBuyItem = null;
    buildLockerGrid(); lkSync();
  }

  // ---- opening it --------------------------------------------------------
  function openLocker(tab){
    lkTab = tab || 'skin'; lkIndex = 0;
    document.querySelectorAll('.lkTab').forEach(b=>b.classList.toggle('sel', b.dataset.lk===lkTab));
    // start on what you are wearing, so the screen opens on you
    const items = lkItems();
    const i = items.findIndex(it=>lkEquipped(it));
    if(i >= 0) lkIndex = i;
    buildLockerGrid(); lkSync();
    $('locker').classList.remove('hidden');
    if(!lkBuilt){
      lkBuilt = true;
      document.querySelectorAll('.lkTab').forEach(b=>b.addEventListener('click', ()=>{
        SFX.click(); openLocker(b.dataset.lk);
      }));
      $('lkAction').addEventListener('click', ()=>lkAct());
      $('lkBuyYes').addEventListener('click', lkBuyDo);
      $('lkBuyNo').addEventListener('click', ()=>{ $('lkBuy').classList.add('hidden'); lkBuyItem=null; });
    }
  }
  function closeLocker(){
    lkTryOn = null; setPreview(null, null); clearPreview(); syncCustomColor(); saveProfile();
    $('lkBuy').classList.add('hidden'); lkBuyItem = null;
    $('locker').classList.add('hidden');
  }

  // ---- keyboard: arrows move, Enter equips, Esc back ---------------------
  window.addEventListener('keydown', e=>{
    if($('locker').classList.contains('hidden')) return;
    if(e.target && (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA')) return;
    const n = lkItems().length;
    if(!$('lkBuy').classList.contains('hidden')){
      if(e.key==='Enter'){ lkBuyDo(); e.preventDefault(); }
      if(e.key==='Escape'){ $('lkBuy').classList.add('hidden'); lkBuyItem=null; e.preventDefault(); }
      return;
    }
    let d = 0;
    if(e.key==='ArrowRight') d = 1;
    if(e.key==='ArrowLeft')  d = -1;
    if(e.key==='ArrowDown')  d = 4;
    if(e.key==='ArrowUp')    d = -4;
    if(d){ lkIndex = clamp(lkIndex + d, 0, n-1); lkSync(); e.preventDefault(); return; }
    if(e.key==='Enter'){ lkAct(); e.preventDefault(); }
    if(e.key==='Escape'){ SFX.click(); openLobbyTab('play'); e.preventDefault(); }
  });
