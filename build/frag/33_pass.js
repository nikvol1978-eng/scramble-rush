  // ============================================================
  // THE SEASON PASS  (v24 §5.5, brief §5.4)
  // ============================================================
  // Thirty tiers on a horizontal rail, the stumbler in the middle wearing
  // whichever reward is highlighted, and the reward's name and button on the
  // right. No paid track, no tier skip, no money: the only way up it is
  // playing, and everything on it is reachable.
  //
  // The renders come from the locker's cache -- see 31_locker.js for why that
  // pass turns tone mapping off, and 05_profile.js for why an offset that
  // moves the character aside is positive and measured off the panel.

  const PASS_TIERS = 30;

  // The curve. The v20 wiring pays 20 XP for finishing a race, 60 more for a
  // top three and 150 for a win, so a casual match is worth about 60. Thirty
  // tiers at 70 + 4 per tier is 3,840 XP, which is a little over sixty matches
  // -- which is the pace the brief asks for.
  //
  // This is a second reading of the same XP, not a second currency. The level
  // curve is untouched; the pass just measures the same total differently.
  function passTierCost(n){ return 70 + (n-1)*4; }
  function passTotalXp(){
    let total = stats.xp || 0;
    for(let l = 1; l < (stats.level || 1); l++) total += xpForLevel(l);
    return total;
  }
  function passProgress(){
    let xp = passTotalXp(), tier = 0;
    while(tier < PASS_TIERS && xp >= passTierCost(tier+1)){ xp -= passTierCost(tier+1); tier++; }
    return { tier, into: xp, need: tier >= PASS_TIERS ? 0 : passTierCost(tier+1) };
  }

  // What each tier gives. Coins, then a pattern, a colourway, a hat, an eye
  // set, and round again -- drawn from the catalogue in a fixed order so the
  // track is the same for everyone and can be read ahead of time. Tier thirty
  // is a Special colourway that is only here.
  const PASS_SPECIAL = 'solarflare';
  function passRewards(){
    const out = [];
    const skins = SKINS.filter(s=>s.unlock.kind !== 'default' && s.rarity !== 'special').map(s=>s.id);
    const pats  = PATTERNS.filter(p=>p.unlock.kind !== 'default').map(p=>p.id);
    const hats  = HATS.filter(h=>h[0] !== 'none').map(h=>h[0]);
    const eyes  = EYES.map(e=>e[0]);
    let si = 0, pi = 0, hi = 0, ei = 0;
    for(let t = 1; t <= PASS_TIERS; t++){
      if(t === PASS_TIERS){
        const sp = SKINS.find(s=>s.id === PASS_SPECIAL) || SKINS.find(s=>s.rarity === 'special');
        out.push({ tier:t, kind:'skin', id:sp.id, name:sp.name, rarity:sp.rarity, label:'Colourway' });
        continue;
      }
      switch(t % 5){
        case 1: out.push({ tier:t, kind:'coins', id:null, name:(60 + t*8) + ' coins', rarity:'common', label:'Coins', coins:60 + t*8 }); break;
        case 2: { const id = pats[pi++ % pats.length], p = patternOf(id);
                  out.push({ tier:t, kind:'pattern', id, name:p.name, rarity:p.rarity, label:'Pattern' }); break; }
        case 3: { const id = skins[si++ % skins.length], s = skinOf(id);
                  out.push({ tier:t, kind:'skin', id, name:s.name, rarity:s.rarity, label:'Colourway' }); break; }
        case 4: { const id = hats[hi++ % hats.length];
                  out.push({ tier:t, kind:'hat', id, name:(HATS.find(h=>h[0]===id)||[,id])[1], rarity:'rare', label:'Hat' }); break; }
        default:{ const id = eyes[ei++ % eyes.length];
                  out.push({ tier:t, kind:'eyes', id, name:(EYES.find(e=>e[0]===id)||[,id])[1], rarity:'rare', label:'Eyes' }); break; }
      }
    }
    return out;
  }

  let psRewards = [], psIndex = 0, psBuilt = false;
  function psClaimed(){ return new Set(stats.passClaimed || []); }

  function psGive(r){
    const done = stats.passClaimed = stats.passClaimed || [];
    if(done.includes(r.tier)) return;
    done.push(r.tier);
    if(r.kind === 'coins')        stats.coins += r.coins;
    else if(r.kind === 'skin')    (stats.owned = stats.owned || []).push(r.id);
    else if(r.kind === 'pattern') (stats.patterns = stats.patterns || []).push(r.id);
    // hats and eyes are already everyone's, so those tiers are a flourish
    saveProfile(); refreshCoinChips();
  }

  function buildPassTrack(){
    const rail = $('psTrack'); rail.innerHTML = '';
    const prog = passProgress(), claimed = psClaimed();
    psRewards.forEach((r, i)=>{
      const cell = document.createElement('div');
      cell.className = 'psCell';

      const tile = document.createElement('button');
      tile.className = 'psTile' + (i === psIndex ? ' hi' : '');
      if(r.tier > prog.tier) tile.classList.add('locked');
      if(claimed.has(r.tier)) tile.classList.add('claimed');

      if(r.kind === 'coins'){
        tile.innerHTML = '<span class="psCoins"><span class="shCoin"></span>' + r.coins + '</span>';
      } else {
        const c = document.createElement('canvas');
        c.className = 'psShot'; c.width = c.height = TILE_PX;
        tile.appendChild(c);
        const key = r.kind + ':' + r.id;
        if(tileCache.has(key)) lkPaint(c, r.kind, r.id);
        else lkQueue.push({ canvas:c, kind:r.kind, id:r.id, soon: Math.abs(i - psIndex) < 9 });
      }
      if(claimed.has(r.tier)){
        const tick = document.createElement('span');
        tick.className = 'psTick'; tick.textContent = '✓';
        tile.appendChild(tick);
      }
      // v25 SS7: no mouseenter, and click no longer claims.
      // The hover handler set the selection, and psSync() then called
      // scrollIntoView on it with smooth behaviour -- so moving the pointer
      // across the track made the track scroll away under it. Worse, click ran
      // psAct(), so the release at the end of a drag claimed whichever tier it
      // happened to land on. Claiming is the CLAIM button's job.
      tile.setAttribute('aria-label', 'Tier ' + r.tier + ': ' + r.name);
      tile.addEventListener('click', ()=>{ SFX.click(); psIndex = i; psSync(); });
      cell.appendChild(tile);

      const num = document.createElement('span');
      num.className = 'psNum' + (r.tier <= prog.tier ? ' got' : '');
      num.textContent = r.tier;
      cell.appendChild(num);
      rail.appendChild(cell);
    });
    if(lkQueue.length) setTimeout(lkPump, 0);
    dragShelf(rail);
  }

  function psSync(){
    psIndex = clamp(psIndex, 0, psRewards.length-1);
    const r = psRewards[psIndex], prog = passProgress(), claimed = psClaimed();
    const tiles = document.querySelectorAll('.psTile');
    tiles.forEach((t,i)=>{
      t.classList.toggle('hi', i===psIndex);
      t.setAttribute('aria-pressed', String(i===psIndex));
    });
    const hi = tiles[psIndex];
    // Never while a drag is in flight: a smooth scrollIntoView fights the
    // finger that is doing the dragging.
    if(hi && !shelfIsDragging($('psTrack'))) hi.scrollIntoView({block:'nearest', inline:'nearest'});

    $('psName').textContent = r.name;
    $('psType').textContent = r.label;
    const rp = $('psRarity');
    rp.textContent = RARITY[r.rarity].name.toUpperCase();
    rp.className = 'rarityPill r-' + r.rarity;

    const locked = r.tier > prog.tier, done = claimed.has(r.tier);
    const btn = $('psAction');
    btn.textContent = locked ? 'TIER ' + r.tier : done ? (r.kind==='coins' ? 'CLAIMED' : 'EQUIP') : 'CLAIM';
    btn.disabled = locked || (done && r.kind === 'coins');
    btn.className = 'btn small ' + (locked ? 'blue' : done ? 'gold' : 'pink');

    // the stumbler wears the highlighted reward
    if(r.kind === 'skin')         { setPreview(r.id, null); psTryOn = null; }
    else if(r.kind === 'pattern') { setPreview(null, r.id); psTryOn = null; }
    else if(r.kind === 'hat' || r.kind === 'eyes'){
      setPreview(null, null);
      psTryOn = { hat: r.kind==='hat' ? r.id : null, eyes: r.kind==='eyes' ? r.id : null };
    } else { setPreview(null, null); psTryOn = null; }
    lkTryOn = psTryOn;
    refreshPreview();
  }
  let psTryOn = null;

  function psAct(){
    const r = psRewards[psIndex], prog = passProgress(), claimed = psClaimed();
    if(r.tier > prog.tier) return;
    if(!claimed.has(r.tier)){ psGive(r); SFX.coin ? SFX.coin() : SFX.click(); buildPassTrack(); psSync(); return; }
    // already claimed: the button equips it, which is the only useful thing
    // left to do with a reward you own
    if(r.kind === 'skin'){ custom.skin = r.id; syncCustomColor(); }
    if(r.kind === 'pattern') custom.pattern = r.id;
    if(r.kind === 'hat')     custom.hat = r.id;
    if(r.kind === 'eyes')    custom.eyes = r.id;
    psTryOn = null; lkTryOn = null; setPreview(null, null);
    saveProfile(); SFX.click(); refreshPreview(); psSync();
  }

  function openPass(){
    psRewards = passRewards();
    const prog = passProgress();
    // Opens on the next thing you have not taken, which is the one tier you
    // actually came to look at.
    const claimed = psClaimed();
    let i = psRewards.findIndex(r=>r.tier <= prog.tier && !claimed.has(r.tier));
    if(i < 0) i = Math.min(prog.tier, PASS_TIERS-1);
    psIndex = Math.max(0, i);
    $('psTier').textContent = prog.tier;
    $('psXp').textContent = prog.need ? (prog.into + ' / ' + prog.need + ' XP')
                                      : 'SEASON COMPLETE';
    $('psFill').style.width = (prog.need ? Math.round(prog.into/prog.need*100) : 100) + '%';
    $('pass').classList.remove('hidden');
    buildPassTrack(); psSync();
    if(!psBuilt){ psBuilt = true; $('psAction').addEventListener('click', psAct); }
  }
  function closePass(){
    psTryOn = null; lkTryOn = null; setPreview(null, null); clearPreview();
    syncCustomColor(); saveProfile();
    $('pass').classList.add('hidden');
  }

  // ---- keyboard: left and right along the rail, Enter claims, Esc back ----
  window.addEventListener('keydown', e=>{
    if($('pass').classList.contains('hidden')) return;
    if(e.target && (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA')) return;
    if(e.key==='ArrowRight'){ psIndex = clamp(psIndex+1, 0, psRewards.length-1); psSync(); e.preventDefault(); }
    if(e.key==='ArrowLeft'){  psIndex = clamp(psIndex-1, 0, psRewards.length-1); psSync(); e.preventDefault(); }
    if(e.key==='Enter'){ psAct(); e.preventDefault(); }
    if(e.key==='Escape'){ SFX.click(); openLobbyTab('play'); e.preventDefault(); }
  });
