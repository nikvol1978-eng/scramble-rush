  // ============================================================
  // THE SHOP  (v24 §5.4, brief §5.3)
  // ============================================================
  // Three featured items across the top, six of the day under them, and a tall
  // card down the right for the season pass. Every card carries a real render
  // of the stumbler wearing the item, from the same cache the locker fills --
  // see 31_locker.js for why that pass turns tone mapping off.
  //
  // What is on sale is a function of the date, not of chance: everybody sees
  // the same shop on the same day, the featured row turns over every three
  // days and the daily row every twenty-four hours. That is what makes the
  // countdown pills mean anything.

  const SHOP_FEATURED = 3, SHOP_DAILY = 6;
  const DAY_MS = 86400000;

  // A small deterministic generator, so a given day always deals the same
  // hand. Math.random would give every reload a different shop and make the
  // countdown a lie.
  function mulberry32(a){
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shopDay(){ return Math.floor(Date.now() / DAY_MS); }

  // Everything that can be bought or unlocked, as one list the shop draws from.
  function shopPool(){
    const out = [];
    for(const s of SKINS)    if(s.unlock.kind !== 'default') out.push({ kind:'skin',    ...s });
    for(const p of PATTERNS) if(p.unlock.kind !== 'default') out.push({ kind:'pattern', ...p });
    return out;
  }
  const FEATURED_TIERS = ['epic','legendary','special','superrare'];
  function shopDeal(seed, n, pool){
    const rnd = mulberry32(seed), bag = pool.slice(), out = [];
    // Fisher-Yates as far as we need it, off the seeded generator.
    for(let i = bag.length-1; i > 0 && out.length < n; i--){
      const j = Math.floor(rnd()*(i+1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    for(let i = 0; i < bag.length && out.length < n; i++) out.push(bag[i]);
    return out;
  }
  function shopRows(){
    const pool = shopPool(), day = shopDay();
    const rare = pool.filter(p=>FEATURED_TIERS.includes(p.rarity));
    const plain = pool.filter(p=>!FEATURED_TIERS.includes(p.rarity));
    return {
      // the featured row turns over every third day, so its seed is the block
      featured: shopDeal(Math.floor(day/3)*7919 + 11, SHOP_FEATURED, rare.length ? rare : pool),
      daily:    shopDeal(day*104729 + 3, SHOP_DAILY, plain.length ? plain : pool)
    };
  }
  function shopCountdown(everyDays){
    const day = shopDay();
    const nextDay = everyDays === 1 ? day + 1 : (Math.floor(day/everyDays) + 1)*everyDays;
    let ms = nextDay*DAY_MS - Date.now();
    if(ms < 0) ms = 0;
    const h = Math.floor(ms/3600000), d = Math.floor(h/24), m = Math.floor((ms%3600000)/60000);
    return d > 0 ? (String(d).padStart(2,'0') + 'd ' + String(h%24).padStart(2,'0') + 'h')
                 : (String(h).padStart(2,'0') + 'h ' + String(m).padStart(2,'0') + 'm');
  }

  // Coins for most of it. The rare tiers are not bought at all: they are the
  // ones our own catalogue already gates behind wins and badges, and inventing
  // a second spendable currency to put on them would mean inventing a way to
  // earn it. A crown on a card means "this is what it takes", not "this is
  // what it costs".
  function shopPrice(item){
    if(item.unlock.kind === 'coins') return { kind:'coins', n:item.unlock.cost };
    if(item.unlock.kind === 'wins')  return { kind:'crowns', n:item.unlock.count };
    return { kind:'badge', n:0 };
  }
  function shopOwned(item){
    return item.kind === 'skin' ? ownedSkins().has(item.id) : ownedPatterns().has(item.id);
  }

  let shCards = [], shIndex = 0, shBuilt = false;

  function shopCard(item, big){
    const card = document.createElement('button');
    card.className = 'shCard' + (big ? ' big' : '');
    const owned = shopOwned(item), price = shopPrice(item);

    const band = document.createElement('div');
    band.className = 'shBand r-' + item.rarity;
    const pill = document.createElement('span');
    pill.className = 'rarityPill r-' + item.rarity;
    pill.textContent = RARITY[item.rarity].name.toUpperCase();
    const nm = document.createElement('span');
    nm.className = 'shName'; nm.textContent = item.name;
    band.appendChild(pill); band.appendChild(nm);
    card.appendChild(band);

    const shot = document.createElement('canvas');
    // Not .lkShot: that one is absolutely positioned to fill a locker tile,
    // and borrowing it for the fade took the positioning too -- the price
    // strip ended up above the art instead of under it.
    shot.className = 'shShot'; shot.width = shot.height = TILE_PX;
    card.appendChild(shot);

    const foot = document.createElement('div');
    foot.className = 'shFoot';
    if(owned){
      foot.innerHTML = '<span class="shOwned">✓ Owned</span>';
    } else if(price.kind === 'coins'){
      foot.innerHTML = '<span class="shCoin"></span><span class="shCost">' + price.n + '</span>';
    } else if(price.kind === 'crowns'){
      foot.innerHTML = '<span class="shCrown"></span><span class="shCost">' + price.n + '</span>';
    } else {
      foot.innerHTML = '<span class="shCost small">' + unlockText(item) + '</span>';
    }
    card.appendChild(foot);

    // The card art comes out of the locker's cache, and fills the same way:
    // painted now if it is already there, queued behind the visible rows if
    // it is not. A shop of nine cards is always "visible", so they all go in
    // the soon queue and land within a frame or two of the screen opening.
    if(tileCache.has(item.kind + ':' + item.id)) lkPaint(shot, item.kind, item.id);
    else lkQueue.push({ canvas:shot, kind:item.kind, id:item.id, soon:true });

    const idx = shCards.length;
    card.addEventListener('mouseenter', ()=>{ shIndex = idx; shSync(); });
    card.addEventListener('click', ()=>{ shIndex = idx; shSync(); shOpenCard(); });
    shCards.push({ el:card, item });
    return card;
  }

  function buildShop(){
    const rows = shopRows();
    shCards = [];
    const f = $('shFeatured'), d = $('shDaily');
    f.innerHTML = ''; d.innerHTML = '';
    rows.featured.forEach(item=>f.appendChild(shopCard(item, true)));
    rows.daily.forEach(item=>d.appendChild(shopCard(item, false)));
    $('shFeatTime').textContent = shopCountdown(3);
    $('shDailyTime').textContent = shopCountdown(1);
    if(lkQueue.length) setTimeout(lkPump, 0);
  }

  function shSync(){
    shIndex = clamp(shIndex, 0, shCards.length-1);
    shCards.forEach((c,i)=>c.el.classList.toggle('hi', i===shIndex));
    const hi = shCards[shIndex];
    if(hi) hi.el.scrollIntoView({block:'nearest', inline:'nearest'});
  }

  function shOpenCard(){
    const c = shCards[shIndex]; if(!c) return;
    const item = c.item;
    if(shopOwned(item)){ SFX.click(); return; }
    const price = shopPrice(item);
    if(price.kind !== 'coins'){
      // Not for sale: say what it actually takes rather than opening a dialog
      // whose only button would be disabled.
      $('shNote').textContent = item.name + ' — ' + unlockText(item);
      SFX.click();
      return;
    }
    openBuy({
      kind: item.kind, id: item.id, name: item.name, cost: price.n,
      onBuy: ()=>{
        stats.coins -= price.n;
        if(item.kind === 'skin'){ (stats.owned = stats.owned||[]).push(item.id); }
        else { (stats.patterns = stats.patterns||[]).push(item.id); }
        saveProfile(); refreshCoinChips(); buildShop(); shSync();
      }
    });
  }

  function openShop(){
    $('shop').classList.remove('hidden');
    shIndex = 0;
    buildShop(); shSync();
    if(!shBuilt){
      shBuilt = true;
      // The pass screen arrives in the next commit. Until it is there the
      // card is a promo that does not pretend to be a button.
      $('shPassCard').addEventListener('click', ()=>{
        if(!$('pass')) return;
        SFX.click(); openLobbyTab('pass');
      });
    }
    if(shTick) clearInterval(shTick);
    // The pills are a clock, so they tick. Once a minute is enough for a
    // readout whose smallest unit is a minute.
    shTick = setInterval(()=>{
      if($('shop').classList.contains('hidden')) return;
      $('shFeatTime').textContent = shopCountdown(3);
      $('shDailyTime').textContent = shopCountdown(1);
    }, 30000);
  }
  let shTick = 0;
  function closeShop(){
    if(shTick){ clearInterval(shTick); shTick = 0; }
    $('shop').classList.add('hidden');
  }

  // ---- keyboard: arrows move, Enter opens, Esc back ----------------------
  window.addEventListener('keydown', e=>{
    if($('shop').classList.contains('hidden')) return;
    if(!$('buyBox').classList.contains('hidden')) return;      // the dialog owns the keys
    if(e.target && (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA')) return;
    let d = 0;
    if(e.key==='ArrowRight') d = 1;
    if(e.key==='ArrowLeft')  d = -1;
    // Down out of the featured row lands in the daily row under it, and up
    // comes back; the rows are different widths, so this is not a grid step.
    if(e.key==='ArrowDown') d = shIndex < SHOP_FEATURED ? SHOP_FEATURED : 0;
    if(e.key==='ArrowUp')   d = shIndex >= SHOP_FEATURED ? -SHOP_FEATURED : 0;
    if(d){ shIndex = clamp(shIndex + d, 0, shCards.length-1); shSync(); e.preventDefault(); return; }
    if(e.key==='Enter'){ shOpenCard(); e.preventDefault(); }
    if(e.key==='Escape'){ SFX.click(); openLobbyTab('play'); e.preventDefault(); }
  });
