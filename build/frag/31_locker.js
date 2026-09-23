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
    // v25: REFRAMED, from a measurement rather than from the estimate that used
    // to be written here. "A comfortable two thirds of the tile" was not what
    // 150 back produced: reading the alpha bounding box out of a painted tile
    // put the figure at 43% of the width and 46% of the height, sitting about
    // six pixels low in the frame. That is the cream void that made every shop
    // card look like a small render lost in a big box.
    //
    // Measured at the old framing: half-frame 40.19u over 48px = 0.837 u/px, so
    // the figure spans y -19.4..+16.6 (36 tall) and 34.3 wide, centred on
    // y = -1.4 rather than on the +4 the lens was aimed at. For the figure to
    // take ~80% of the tile the half-frame wants to be 36/2/0.8 = 22.5u, and
    // 22.5 / tan(15deg) = 84. Width then sits at 34.3/45 = 76%, so nothing is
    // cropped at the sides -- which is what going to 96 got wrong last time.
    //
    // This is the TILE lens and nothing else. It draws the locker and shop
    // thumbnails; the character, the lobby camera and the race camera are
    // untouched by it.
    tileCam = new THREE.PerspectiveCamera(30, 1, 1, 500);
    tileCam.position.set(0, 8, 84); tileCam.lookAt(0, -1.4, 0);
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
      case 'hat':     return HATS.map(([id,name])=>({ id, name, rarity:itemRarity('hat', id), unlock:{kind:'default'} }));
      case 'eyes':    return EYES.map(([id,name])=>({ id, name, rarity:itemRarity('eyes', id), unlock:{kind:'default'} }));
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

  // v25 SS6: THE LOCKER IS INVENTORY, NOT A STOREFRONT.
  // It used to list the whole catalogue -- everything you owned, greyed out
  // beside everything you did not, each locked one carrying its price. That is
  // a shop with the buying taken out, and it made the one screen whose job is
  // "what do I want to wear" mostly a list of things you cannot wear. What you
  // do not own yet lives in the shop, which is the screen for wanting things.
  function lkInventory(){ return lkItems().filter(lkOwned); }

  // What an empty category should say. Named per tab because "no patterns yet"
  // and "no colourways yet" are different sentences.
  const LK_NOUN = { skin:'colourways', pattern:'patterns', hat:'hats', eyes:'eyes' };

  // The grid is auto-fill, so the column count is whatever fits rather than a
  // constant. The arrow keys have to ask, or Down jumps the wrong distance at
  // every width but the one it was written for.
  function lkCols(){
    const g = $('lkGrid');
    if(!g) return 4;
    const n = getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length;
    return Math.max(1, n);
  }

  // ---- the left pane follows the highlight -------------------------------
  function lkPreview(){
    const item = lkInventory()[lkIndex]; if(!item) return;
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
    const items = lkInventory();

    // An owned-only shelf can legitimately be empty, so that is a state with a
    // design rather than a grid with nothing in it.
    if(!items.length){
      const empty = document.createElement('div');
      empty.className = 'uiEmpty';
      const t = document.createElement('div');
      t.className = 'uiEmptyTitle'; t.textContent = 'Nothing here yet';
      const b = document.createElement('div');
      b.className = 'uiEmptyBody';
      b.textContent = 'You do not own any ' + (LK_NOUN[lkTab]||'items') + ' yet.';
      const go = document.createElement('button');
      go.type = 'button'; go.className = 'btn small gold'; go.textContent = 'OPEN SHOP';
      go.addEventListener('click', ()=>{ SFX.click(); openLobbyTab('shop'); });
      empty.appendChild(t); empty.appendChild(b); empty.appendChild(go);
      grid.appendChild(empty);
      return;
    }

    items.forEach((item, i)=>{
      const on = lkEquipped(item);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'uiCard lkTile' + (i===lkIndex ? ' sel' : '') + (on ? ' equipped' : '');
      card.dataset.i = i;
      card.setAttribute('aria-label', item.name + (on ? ', equipped' : ''));
      card.setAttribute('aria-pressed', String(i===lkIndex));

      // The media box carries the ratio; the canvas fills it with object-fit.
      // This is what keeps a render from being stretched and what keeps the
      // card from growing an empty margin around a small one.
      const media = document.createElement('span');
      media.className = 'uiCardMedia';
      if(lkTab === 'skin') media.style.setProperty('--sw', skinSwatch(skinOf(item.id)));
      const canvas = document.createElement('canvas');
      canvas.className = 'lkShot'; canvas.width = canvas.height = TILE_PX;
      media.appendChild(canvas);
      const pill = document.createElement('span');
      pill.className = 'rarityPill r-' + item.rarity;
      pill.textContent = RARITY[item.rarity].name.toUpperCase();
      media.appendChild(pill);

      // The name gets a row to itself. Sharing the head with the rarity pill
      // left it about forty pixels and every label in the locker truncated.
      const foot = document.createElement('span');
      foot.className = 'uiCardFoot';
      const nm = document.createElement('span');
      nm.className = 'uiCardName'; nm.textContent = item.name;
      foot.appendChild(nm);

      card.appendChild(media); card.appendChild(foot);
      if(on){
        const tick = document.createElement('span');
        tick.className = 'uiTick'; tick.textContent = '\u2713';
        card.appendChild(tick);
      }

      if(tileCache.has(lkTab + ':' + item.id)) lkPaint(canvas, lkTab, item.id);
      else lkQueue.push({ canvas, kind:lkTab, id:item.id, soon: i < LK_SOON });

      // v25 SS7: CLICK SELECTS. IT DOES NOT EQUIP.
      // There is deliberately no mouseenter handler here. The old one set
      // lkIndex on hover, so dragging the pointer across the shelf rewrote the
      // selection and the character preview with it, and the click that
      // followed equipped whatever the pointer had last passed over. Equipping
      // is the EQUIP button's job and nothing else's.
      card.addEventListener('click', ()=>{ SFX.click(); lkIndex = i; lkSync(); });
      grid.appendChild(card);
    });
    if(lkQueue.length && !lkQueueRun) setTimeout(lkPump, 0);
  }

  // ---- header, highlight, footer ----------------------------------------
  function lkSync(){
    const items = lkInventory();
    const act = $('lkAction');
    if(!items.length){
      $('lkName').textContent = '\u2014';
      const rp0 = $('lkRarity'); rp0.textContent = ''; rp0.className = 'rarityPill';
      act.textContent = 'EQUIP'; act.disabled = true; act.className = 'btn small gold';
      $('lkHint').textContent = '';
      return;
    }
    lkIndex = clamp(lkIndex, 0, items.length-1);
    const item = items[lkIndex];
    document.querySelectorAll('#lkGrid .uiCard').forEach((t,i)=>{
      t.classList.toggle('sel', i===lkIndex);
      t.setAttribute('aria-pressed', String(i===lkIndex));
    });
    const hi = document.querySelector('#lkGrid .uiCard.sel');
    if(hi) hi.scrollIntoView({block:'nearest'});
    $('lkName').textContent = item.name;
    const rp = $('lkRarity');
    rp.textContent = RARITY[item.rarity].name.toUpperCase();
    rp.className = 'rarityPill r-' + item.rarity;
    const on = lkEquipped(item);
    // Selected and equipped are different things and say so. The button is the
    // only thing that changes what you are wearing.
    act.textContent = on ? 'EQUIPPED' : 'EQUIP';
    act.disabled = on;
    act.className = 'btn small ' + (on ? 'blue' : 'gold');
    $('lkHint').textContent = on ? 'Wearing this now' : 'Selected \u2014 press EQUIP to wear it';
    lkPreview();
  }

  // ---- equipping ---------------------------------------------------------
  // Everything in here is owned, so this only ever equips. Buying moved to the
  // shop with the locked catalogue it belonged to.
  function lkAct(){
    const item = lkInventory()[lkIndex]; if(!item) return;
    if(lkEquipped(item)) return;
    if(lkTab === 'skin'){ custom.skin = item.id; syncCustomColor(); }
    if(lkTab === 'pattern') custom.pattern = item.id;
    if(lkTab === 'hat')     custom.hat = item.id;
    if(lkTab === 'eyes')    custom.eyes = item.id;
    lkTryOn = null; setPreview(null, null);
    saveProfile(); SFX.click(); buildLockerGrid(); lkSync();
  }

  // ---- the buy confirm ---------------------------------------------------
  // One dialog for the whole menu. It knows how to show an item and take a
  // yes; what buying actually means is the caller's business, because the
  // locker equips what you just bought and the shop does not.
  let buyPending = null, lkTryOn = null;
  function openBuy(o){
    buyPending = o;
    $('buyName').textContent = o.name;
    $('buyCost').textContent = o.cost + ' coins';
    lkPaint($('buyShot'), o.kind, o.id);
    const short = stats.coins < o.cost;
    $('buyWarn').textContent = short ? 'Not enough coins.' : '';
    $('buyYes').disabled = short;
    $('buyBox').classList.remove('hidden');
  }
  function closeBuy(){ $('buyBox').classList.add('hidden'); buyPending = null; }
  function doBuy(){
    const o = buyPending; if(!o || stats.coins < o.cost) return;
    o.onBuy();
    SFX.coin ? SFX.coin() : SFX.click();
    closeBuy();
  }
  $('buyYes').addEventListener('click', doBuy);
  $('buyNo').addEventListener('click', closeBuy);

  // ---- opening it --------------------------------------------------------
  function openLocker(tab){
    lkTab = tab || 'skin'; lkIndex = 0;
    document.querySelectorAll('.lkTab').forEach(b=>b.classList.toggle('sel', b.dataset.lk===lkTab));
    // start on what you are wearing, so the screen opens on you
    const items = lkInventory();
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
    }
  }
  function closeLocker(){
    lkTryOn = null; setPreview(null, null); clearPreview(); syncCustomColor(); saveProfile();
    closeBuy();
    $('locker').classList.add('hidden');
  }

  // ---- keyboard: arrows move, Enter equips, Esc back ---------------------
  window.addEventListener('keydown', e=>{
    if($('locker').classList.contains('hidden')) return;
    if(e.target && (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA')) return;
    const n = lkInventory().length;
    if(!$('buyBox').classList.contains('hidden')){
      if(e.key==='Enter'){ doBuy(); e.preventDefault(); }
      if(e.key==='Escape'){ closeBuy(); e.preventDefault(); }
      return;
    }
    let d = 0;
    if(e.key==='ArrowRight') d = 1;
    if(e.key==='ArrowLeft')  d = -1;
    const cols = lkCols();
    if(e.key==='ArrowDown')  d = cols;
    if(e.key==='ArrowUp')    d = -cols;
    if(d){ lkIndex = clamp(lkIndex + d, 0, n-1); lkSync(); e.preventDefault(); return; }
    if(e.key==='Enter'){ lkAct(); e.preventDefault(); }
    if(e.key==='Escape'){ SFX.click(); openLobbyTab('play'); e.preventDefault(); }
  });
