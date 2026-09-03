  // ============================================================
  // MENU: 3D PREVIEW + IDLE PERFORMANCE
  // ============================================================
  let stageSpot=null, stageRing=null, stageBackdrop=null;
  // Browsing the shop shows the item on the model without committing to it.
  // Cleared on equip, on leaving the tab, and on closing the profile.
  let previewSkin = null, previewPattern = null;
  function setPreview(skinId, patternId){
    previewSkin = skinId || null; previewPattern = patternId || null;
    refreshPreview();
    const tag = $('previewTag');
    if(tag){
      const on = previewSkin || previewPattern;
      tag.classList.toggle('hidden', !on);
      if(on) tag.textContent = 'PREVIEWING ' + (previewSkin ? skinOf(previewSkin).name : patternOf(previewPattern).name);
    }
  }
  function clearPreview(){ if(previewSkin||previewPattern) setPreview(null,null); }
  function refreshPreview(){
    clearGroup(previewGroup);
    animatedMats=[];

    // ---- a small stage: raised disc, dark backdrop, spotlight from above
    const ped=new THREE.Mesh(new THREE.CylinderGeometry(46,54,16,32),
      new THREE.MeshPhongMaterial({color:0x2a1f4d, shininess:60}));
    ped.position.y=-RADIUS-8; ped.receiveShadow=true; previewGroup.add(ped);
    stageRing=new THREE.Mesh(new THREE.CylinderGeometry(48,48,3,32),
      new THREE.MeshBasicMaterial({color:0xffcb3d}));
    stageRing.position.y=-RADIUS+0.5; previewGroup.add(stageRing);

    // pool of light on the floor
    const pool=new THREE.Mesh(new THREE.CircleGeometry(150,40),
      new THREE.MeshBasicMaterial({color:0xfff0c0, transparent:true, opacity:0.13}));
    pool.rotation.x=-Math.PI/2; pool.position.y=-RADIUS-15.4; previewGroup.add(pool);

    const floor=new THREE.Mesh(new THREE.CircleGeometry(460,40),
      new THREE.MeshLambertMaterial({color:0x140e2a}));
    floor.rotation.x=-Math.PI/2; floor.position.y=-RADIUS-16; floor.receiveShadow=true; previewGroup.add(floor);

    stageBackdrop=new THREE.Mesh(new THREE.SphereGeometry(620,20,14, 0, Math.PI*2, 0, Math.PI/2),
      new THREE.MeshBasicMaterial({color:0x120a26, side:THREE.BackSide}));
    stageBackdrop.position.y=-RADIUS-16; previewGroup.add(stageBackdrop);

    stageSpot=new THREE.SpotLight(0xfff4d6, 1.5, 900, 0.44, 0.55, 1.1);
    stageSpot.position.set(70, 320, -120);
    stageSpot.target.position.set(0, -4, 0);
    stageSpot.castShadow=true;
    stageSpot.shadow.mapSize.width=1024; stageSpot.shadow.mapSize.height=1024;
    previewGroup.add(stageSpot); previewGroup.add(stageSpot.target);
    const rim=new THREE.PointLight(0x8b5cf6, 0.9, 600);
    rim.position.set(-160, 90, 120); previewGroup.add(rim);

    menuBlob=makeCharacter({skin:skinOf(previewSkin||custom.skin), pattern:patternOf(previewPattern||custom.pattern), hat:custom.hat, eyes:custom.eyes});
    previewGroup.add(menuBlob.group);
    previewGroup.visible=true;
    idle = {act:'settle', t:0, dur:0.8, seed:0};
  }

  // ---- drag the character round with the mouse (or a finger)
  const spin = { angle:0, vel:0, dragging:false, lastX:0, active:false };
  function previewDragActive(){
    return state==='menu' && (!$('profile').classList.contains('hidden') || !$('home').classList.contains('hidden'));
  }
  canvas.addEventListener('pointerdown', e=>{
    if(!previewDragActive()) return;
    spin.dragging=true; spin.lastX=e.clientX; spin.vel=0;
    try{ canvas.setPointerCapture(e.pointerId); }catch(err){}
  });
  canvas.addEventListener('pointermove', e=>{
    if(!spin.dragging) return;
    const dx=e.clientX-spin.lastX; spin.lastX=e.clientX;
    spin.angle += dx*0.012; spin.vel = dx*0.012;
  });
  const endSpin=()=>{ spin.dragging=false; };
  canvas.addEventListener('pointerup', endSpin);
  canvas.addEventListener('pointercancel', endSpin);

  // The blob performs a random little routine on the menu.
  const IDLE_ACTS = [
    {name:'look',    dur:3.4},
    {name:'hop',     dur:2.2},
    {name:'face',    dur:2.4},
    {name:'spin',    dur:1.8},
    {name:'wobble',  dur:2.6},
    {name:'stretch', dur:2.0},
    {name:'flip',    dur:1.6},
    {name:'nod',     dur:1.9},
    {name:'peek',    dur:2.8}
  ];
  let idle = {act:'settle', t:0, dur:1, seed:0};
  function nextIdleAct(){
    const a = IDLE_ACTS[Math.floor(Math.random()*IDLE_ACTS.length)];
    idle = {act:a.name, t:0, dur:a.dur, seed:Math.random()};
  }
  function applyIdle(b, dt){
    idle.t += dt;
    if(idle.t >= idle.dur){ nextIdleAct(); }
    const p = clamp(idle.t/idle.dur, 0, 1);      // 0..1 through the act
    const ease = Math.sin(p*Math.PI);             // 0 -> 1 -> 0, for act intensity
    const g = b.group;

    // baseline: gentle breathing, facing the camera, plus however far you have spun them
    let ry = Math.PI + spin.angle, rz = 0, rx = 0, y = 0;
    let sx = 1 + Math.sin(idle.t*2.4)*0.015, sy = 1 - Math.sin(idle.t*2.4)*0.015, sz = sx;
    let pupilX = 0, pupilY = 0, tongue = false, squint = 0;

    switch(idle.act){
      case 'look': {
        // glance left, hold, glance right, hold, recentre
        const k = Math.sin(p*Math.PI*2);
        ry += k*0.75;
        pupilX = k*1.5;
        break;
      }
      case 'hop': {
        // three quick hops with a squash on each landing
        const hops = 3, ph = (p*hops)%1;
        y = Math.abs(Math.sin(ph*Math.PI))*26;
        const land = Math.max(0, 1-Math.abs(ph-0.98)*30);
        sy -= land*0.22; sx += land*0.16; sz += land*0.16;
        break;
      }
      case 'face': {
        // tongue out, eyes squeezed, head waggle
        tongue = p>0.18 && p<0.82;
        squint = ease;
        rz = Math.sin(idle.t*11)*0.13*ease;
        sx += ease*0.06; sy -= ease*0.04;
        break;
      }
      case 'spin': {
        ry += p*Math.PI*2;
        y = Math.sin(p*Math.PI)*14;
        break;
      }
      case 'wobble': {
        // shifting weight foot to foot
        rz = Math.sin(idle.t*5.2)*0.17;
        y = Math.abs(Math.sin(idle.t*5.2))*5;
        pupilX = Math.sin(idle.t*5.2)*0.8;
        break;
      }
      case 'stretch': {
        // reach tall, then squash, then settle
        const s = Math.sin(p*Math.PI);
        sy += s*0.30; sx -= s*0.13; sz -= s*0.13;
        y = s*10;
        break;
      }
      case 'flip': {
        rx = p*Math.PI*2;
        y = Math.sin(p*Math.PI)*46;
        break;
      }
      case 'nod': {
        rx = Math.sin(idle.t*7)*0.22*ease;
        pupilY = -Math.sin(idle.t*7)*0.7*ease;
        break;
      }
      case 'peek': {
        // lean in close to the camera, look you up and down, lean back
        const s = Math.sin(p*Math.PI);
        g.position.z = -s*26;
        sx += s*0.05; sy += s*0.05; sz += s*0.05;
        pupilY = Math.sin(idle.t*3.4)*1.2;
        break;
      }
      default: { // settle
        y = Math.abs(Math.sin(idle.t*4))*4;
      }
    }

    if(idle.act!=='peek') g.position.z += (0 - g.position.z)*0.15;
    g.rotation.set(rx, ry, rz);
    g.position.y = y;
    g.scale.set(sx, sy, sz);

    // eyes + mouth respond to the act
    for(const pu of b.pupils){ pu.position.x = pu.userData.baseX !== undefined ? pu.userData.baseX : (pu.userData.baseX = pu.position.x); }
    b.pupils.forEach(pu=>{ pu.position.x = pu.userData.baseX + pupilX; pu.position.y = 5 + pupilY; });
    b.scleras.forEach(sc=>{ sc.scale.y = (custom.eyes==='happy'||custom.eyes==='sleepy'? (custom.eyes==='happy'?0.55:0.5) : 1) * (1 - squint*0.55); });
    b.tongue.visible = tongue;
    b.mouth.scale.set(1 + (tongue?0.35:0), 1 + (tongue?0.35:0), 1);
  }

  function syncPreview(t,dt){
    if(!menuBlob) return;
    menuT+=dt;
    // spin inertia — let go and they keep turning, then settle
    if(!spin.dragging){
      spin.angle += spin.vel;
      spin.vel *= Math.pow(0.06, dt);
      if(Math.abs(spin.vel)<0.0004) spin.vel=0;
    }
    applyIdle(menuBlob, dt);
    animateAura(menuBlob, menuT);
    if(menuBlob.hatGroup.userData.spin) menuBlob.hatGroup.userData.spin.rotation.y=t*12;
    // slide the character aside when the profile card needs the room
    const profOpen = !$('profile').classList.contains('hidden');
    // world +X reads as screen-left from this camera, so a negative shift stands
    // the character on the right of the screen with the tiles to their left. The
    // visible half-width at this distance is only about 120 units.
    const wantX = (profOpen && W>=861) ? -70 : 0;
    previewGroup.position.x += (wantX - previewGroup.position.x)*0.12;

    const dailyOpen = !$('daily').classList.contains('hidden');
    previewGroup.visible = (!profOpen || W>=861) && !dailyOpen;
    if(stageBackdrop) stageBackdrop.visible = profOpen;      // the stage only dresses the profile
    if(stageRing) stageRing.visible = profOpen;
    if(stageSpot) stageSpot.intensity = profOpen ? 1.6 : 0.0;
    // Close in while the locker is open: this is the shot the screen is built
    // around, and the character should fill their half of it.
    // pull back when the card is beside them, so the offset stays in frame
    const camZ = (profOpen && W>=861) ? -186 : -150;
    camera.position.set(0,40,camZ); camera.lookAt(0,4,0);
    // dim the room so the spotlight reads
    dirLight.intensity = profOpen ? 0.30 : 1.0;
    hemi.intensity     = profOpen ? 0.20 : 0.9;
    dirLight.position.set(120,300,-150); dirLight.target.position.set(0,0,0);
    sky.visible = !profOpen;
    sky.position.set(camera.position.x,0,camera.position.z);
  }

  // ============================================================
  // COINS + PROFILE UI
  // ============================================================
  function fmtNum(n){ return (n||0).toLocaleString('en-GB'); }
  function refreshCoinChips(){
    document.querySelectorAll('.coinChip .coinNum').forEach(el=>{ el.textContent = fmtNum(stats.coins); });
    const n = unclaimedBadges().length;
    ['badgePip','badgePip2'].forEach(id=>{ const e=$(id); if(e) e.classList.toggle('hidden', n===0); });
    const owned=ownedSkins(), ownedP=ownedPatterns();
    const affordable = SKINS.some(s=>s.unlock.kind==='coins' && !owned.has(s.id) && stats.coins>=s.unlock.cost)
                    || PATTERNS.some(p=>p.unlock.kind==='coins' && !ownedP.has(p.id) && stats.coins>=p.unlock.cost);
    const sp=$('shopPip'); if(sp) sp.classList.toggle('hidden', !affordable);
  }
  function renderCoinPops(dt){
    const host=$('coinPops'); if(!host) return;
    // Emptying coinPops used to skip the rebuild entirely -- the guard needs a
    // non-empty array -- so the toast stayed up into the next map intro.
    if(!coinPops.length){ if(host.children.length) host.innerHTML=''; return; }
    if(host.children.length!==coinPops.length){
      host.innerHTML = coinPops.map(p=>`<div class="coinPop">+${fmtNum(p.n)}${p.why?`<span class="why">${p.why}</span>`:''}</div>`).join('');
    }
    for(const p of coinPops) p.t+=dt;
    if(coinPops.some(p=>p.t>2.4)){ coinPops=coinPops.filter(p=>p.t<=2.4); host.innerHTML=coinPops.map(p=>`<div class="coinPop">+${fmtNum(p.n)}${p.why?`<span class="why">${p.why}</span>`:''}</div>`).join(''); }
  }

  // One line of flavour under the name, the way a locker entry reads.
  const SKIN_BLURB = {
    solid:'A clean, flat colourway.',
    gradient:'Two colours, blended top to bottom.',
    galaxy:'Stars drifting somewhere under the surface.',
    rainbow:'The whole spectrum, cycling.',
    gold:'Polished metal, and it knows it.',
    neon:'Lit from the inside.',
    rainbowneon:'Lit from the inside, and never twice the same colour.'
  };
  function skinBlurb(s){
    const r = RARITY[s.rarity];
    const line = SKIN_BLURB[s.type] || 'One of a kind.';
    return line + ' Part of the ' + r.name.toLowerCase() + ' set.';
  }

  let profTab='character', shopFilter='all';
  // which tile the locker sidebar is describing (null = whatever is equipped)
  let selSkin=null, selPattern=null;
  function openProfile(tab){
    profTab = tab||'character';
    $('home').classList.add('hidden');
    $('profile').classList.remove('hidden');
    buildProfile();
  }
  function switchTab(name){
    clearPreview();
    profTab=name;
    document.querySelectorAll('#profile .tab').forEach(t=>t.classList.toggle('sel', t.dataset.tab===name));
    document.querySelectorAll('#profile .tabPane').forEach(p=>p.classList.toggle('hidden', p.dataset.pane!==name));
    buildProfile();
  }
  function buildProfile(){
    $('levelNum').textContent = stats.level;
    $('profNameLbl').textContent = custom.name||'YOU';
    const need = xpForLevel(stats.level);
    $('xpBar').style.width = clamp((stats.xp/need)*100,0,100)+'%';
    $('xpText').textContent = `${stats.xp} / ${need} XP`;
    refreshCoinChips();
    document.querySelectorAll('#profile .tab').forEach(t=>t.classList.toggle('sel', t.dataset.tab===profTab));
    document.querySelectorAll('#profile .tabPane').forEach(p=>p.classList.toggle('hidden', p.dataset.pane!==profTab));
    if(profTab==='character') buildCharacterPane();
    if(profTab==='stats')     buildStatsPane();
    if(profTab==='badges')    buildBadgesPane();
    if(profTab==='shop')      buildShopPane();
    if(profTab==='patterns')  buildPatternPane();
  }

  function buildCharacterPane(){
    $('nameInput').value = custom.name||'';
    const eq = skinOf(custom.skin);
    $('equippedName').textContent = '— '+eq.name+' ('+RARITY[eq.rarity].name+')';
    const owned = [...ownedSkins()];
    const list = SKINS.filter(s=>owned.includes(s.id));
    const host=$('ownedSwatches'); host.innerHTML='';
    for(const s of list){
      const d=document.createElement('div');
      d.className='sw'+(s.id===custom.skin?' sel':'');
      d.style.background = skinSwatch(s);
      // border carries the rarity, the way a character-select grid does
      d.style.borderColor = RARITY[s.rarity].label;
      d.title = s.name+' · '+RARITY[s.rarity].name;
      d.onclick = ()=>{ custom.skin=s.id; SFX.click(); saveProfile(); refreshPreview(); buildCharacterPane(); $('equippedName').textContent='— '+s.name+' ('+RARITY[s.rarity].name+')'; };
      host.appendChild(d);
    }
    const ep = patternOf(custom.pattern);
    $('equippedPattern').textContent = '— '+ep.name;
    const pHost=$('ownedPatternSwatches'); pHost.innerHTML='';
    const ownedP=[...ownedPatterns()];
    for(const p of PATTERNS.filter(p=>ownedP.includes(p.id))){
      const d=document.createElement('div');
      d.className='sw pat'+(p.id===custom.pattern?' sel':'');
      d.style.backgroundImage = patternPreviewCSS(p);
      d.style.borderColor = RARITY[p.rarity].label;
      if(p.id==='none'){ d.style.backgroundColor='#f4f5f8'; d.textContent=''; }
      d.title = p.name;
      d.onclick = ()=>{ custom.pattern=p.id; SFX.click(); saveProfile(); refreshPreview(); buildCharacterPane(); };
      pHost.appendChild(d);
    }

    const hs=$('hatSeg'); hs.innerHTML='';
    HATS.forEach(([k,label])=>{ const c=document.createElement('div'); c.className='chip'+(custom.hat===k?' sel':''); c.textContent=label;
      c.onclick=()=>{ custom.hat=k; SFX.click(); saveProfile(); refreshPreview(); buildCharacterPane(); }; hs.appendChild(c); });
    const es=$('eyeSeg'); es.innerHTML='';
    EYES.forEach(([k,label])=>{ const c=document.createElement('div'); c.className='chip'+(custom.eyes===k?' sel':''); c.textContent=label;
      c.onclick=()=>{ custom.eyes=k; SFX.click(); saveProfile(); refreshPreview(); buildCharacterPane(); }; es.appendChild(c); });
  }

  function buildPatternPane(){
    const owned = ownedPatterns();
    const list = [...PATTERNS].sort((a,b)=>RARITY_ORDER.indexOf(a.rarity)-RARITY_ORDER.indexOf(b.rarity));
    const host=$('patternGrid');
    host.innerHTML = list.map(p=>{
      const have=owned.has(p.id), equipped=custom.pattern===p.id;
      const r=RARITY[p.rarity];
      const sub = have ? (equipped?'Equipped':'Owned') : (p.unlock.kind==='coins'? p.unlock.cost+' coins' : 'Starter');
      const bg = p.id==='none' ? 'background:#f4f5f8' : `background-image:${patternPreviewCSS(p)}`;
      const sel = (selPattern||custom.pattern)===p.id;
      return `<div class="shopCard ${have?'':'locked'}${sel?' sel':''}">
        <div class="orb pat" style="${bg}"></div>
        <span class="rlab" style="background:${r.label};color:${r.text}">${r.name}</span>
        <div class="sn">${p.name}</div>
        <div class="cost">${sub}</div></div>`;
    }).join('');

    const chosen = patternOf(selPattern || custom.pattern) || list[0];
    if(chosen){
      const cr = RARITY[chosen.rarity], chave = owned.has(chosen.id), ceq = custom.pattern===chosen.id;
      let act;
      if(ceq) act = `<button class="equipped" disabled>EQUIPPED</button>`;
      else if(chave) act = `<button class="btn gold" data-pequip="${chosen.id}">EQUIP</button>`;
      else act = `<button class="btn pink" data-pbuy="${chosen.id}" ${stats.coins<chosen.unlock.cost?'disabled':''}>BUY ${chosen.unlock.cost}</button>`;
      $('patternInfo').innerHTML =
        `<div class="liRarity" style="background:${cr.label};color:${cr.text}">${cr.name}</div>
         <div class="liName">${chosen.name}</div>
         <div class="liDesc">Paints over whatever colourway you have on, so it mixes with all of them.</div>
         <div class="liMeta">${chave ? (ceq?'Equipped':'In your locker') : (chosen.unlock.kind==='coins'? chosen.unlock.cost+' coins' : 'Starter')}</div>
         ${act}`;
    }

    host.querySelectorAll('.shopCard').forEach((card,i)=>{
      card.onclick = ()=>{ selPattern = list[i].id; setPreview(null, list[i].id); SFX.click(); buildPatternPane(); };
    });
    const ppane = host.closest('.tabPane') || host;
    ppane.querySelectorAll('button[data-pequip]').forEach(b=>{ b.onclick=()=>{
      custom.pattern=b.dataset.pequip; selPattern=b.dataset.pequip; SFX.click(); saveProfile(); setPreview(null,null); buildPatternPane(); }; });
    ppane.querySelectorAll('button[data-pbuy]').forEach(b=>{ b.onclick=async ()=>{
      const p=patternOf(b.dataset.pbuy);
      if(p.unlock.kind!=='coins' || stats.coins < p.unlock.cost) return;
      stats.coins -= p.unlock.cost;
      stats.patterns = stats.patterns||[]; stats.patterns.push(p.id);
      custom.pattern = p.id;
      SFX.win();
      await saveProfile();
      selPattern = p.id;
      setPreview(null,null); buildPatternPane(); refreshCoinChips();
    }; });
  }

  function buildStatsPane(){
    const owned = ownedSkins().size;
    const winRate = stats.races ? Math.round((stats.wins/stats.races)*100) : 0;
    const cards = [
      ['Matches played', fmtNum(stats.races)],
      ['Matches won',    fmtNum(stats.wins)],
      ['Win rate',       winRate+'%'],
      ['Podium finishes',fmtNum(stats.podiums)],
      ['Finals reached', fmtNum(stats.finals)],
      ['Level',          fmtNum(stats.level)],
      ['Coins',          fmtNum(stats.coins)],
      ['Dives',          fmtNum(stats.dives)],
      ['Minigames survived', fmtNum(stats.minigamesWon)],
      ['Lava rounds survived', fmtNum(stats.lavaSurvived)],
      ['Clean rounds (no falls)', fmtNum(stats.noFallFinishes)],
      ['Online matches', fmtNum(stats.mpRaces)],
      ['Badges earned',  (stats.badges||[]).length+' / '+ACHIEVEMENTS.length],
      ['Colourways owned', owned+' / '+SKINS.length],
      ['Patterns owned', ownedPatterns().size+' / '+PATTERNS.length]
    ];
    $('statGrid').innerHTML = cards.map(([k,v])=>`<div class="statCard"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')
      + `<div class="statCard wide"><div class="k">Progress to Champion Gold</div><div class="v">${fmtNum(Math.min(stats.wins,100))} / 100 wins</div></div>`;
  }

  function buildBadgesPane(){
    const host=$('badgeList');
    host.innerHTML = ACHIEVEMENTS.map(a=>{
      const got=(stats.badges||[]).includes(a.id);
      const claimed=(stats.claimed||[]).includes(a.id);
      const right = !got ? `<span class="paid">+${a.coins}</span>`
        : claimed ? `<span class="paid">CLAIMED</span>`
        : `<button class="claim" data-badge="${a.id}">CLAIM +${a.coins}</button>`;
      return `<div class="badgeCard ${got?'got':''}">
        <div class="ico">${a.icon}</div>
        <div class="txt"><div class="bn">${a.name}</div><div class="bd">${a.desc}</div></div>
        ${right}</div>`;
    }).join('');
    host.querySelectorAll('button.claim').forEach(b=>{
      b.onclick = async ()=>{
        const id=b.dataset.badge, a=ACHIEVEMENTS.find(x=>x.id===id);
        if(!a || (stats.claimed||[]).includes(id)) return;
        stats.claimed = stats.claimed||[]; stats.claimed.push(id);
        SFX.win();
        await addCoins(a.coins, a.name);
        await saveProfile();
        buildBadgesPane(); refreshCoinChips();
      };
    });
  }

  function buildShopPane(){
    const filt=$('rarityFilter');
    const opts=[['all','All','#1a1033']].concat(RARITY_ORDER.map(r=>[r,RARITY[r].name,RARITY[r].label]));
    filt.innerHTML = opts.map(([k,label,col])=>
      `<span class="rchip${shopFilter===k?' sel':''}" data-r="${k}" style="background:${col};color:${k==='all'||k==='superrare'||k==='epic'?'#fff':'#1a1033'}">${label}</span>`).join('');
    filt.querySelectorAll('.rchip').forEach(c=>{ c.onclick=()=>{ shopFilter=c.dataset.r; SFX.click(); buildShopPane(); }; });

    const owned = ownedSkins();
    const list = SKINS.filter(s=>shopFilter==='all'||s.rarity===shopFilter)
      .sort((a,b)=>RARITY_ORDER.indexOf(a.rarity)-RARITY_ORDER.indexOf(b.rarity));
    const host=$('shopGrid');
    host.innerHTML = list.map(s=>{
      const have=owned.has(s.id), equipped=custom.skin===s.id;
      const r=RARITY[s.rarity];
      const sub = have ? (equipped?'Equipped':'Owned') : unlockText(s);
      const sel = (selSkin||custom.skin)===s.id;
      return `<div class="shopCard ${have?'':'locked'}${sel?' sel':''}">
        <div class="orb" style="background:${skinSwatch(s)}"></div>
        <span class="rlab" style="background:${r.label};color:${r.text}">${r.name}</span>
        <div class="sn">${s.name}</div>
        <div class="cost">${sub}</div></div>`;
    }).join('');

    // ---- the panel beside the model: what you are looking at, and one action
    const chosen = skinOf(selSkin || custom.skin) || list[0];
    if(chosen){
      const r = RARITY[chosen.rarity], have = owned.has(chosen.id), equipped = custom.skin===chosen.id;
      let act;
      if(equipped) act = `<button class="equipped" disabled>EQUIPPED</button>`;
      else if(have) act = `<button class="btn gold" data-equip="${chosen.id}">EQUIP</button>`;
      else if(chosen.unlock.kind==='coins')
        act = `<button class="btn pink" data-buy="${chosen.id}" ${stats.coins<chosen.unlock.cost?'disabled':''}>BUY ${chosen.unlock.cost}</button>`;
      else act = `<button class="btn blue" disabled>LOCKED</button>`;
      $('shopInfo').innerHTML =
        `<div class="liRarity" style="background:${r.label};color:${r.text}">${r.name}</div>
         <div class="liName">${chosen.name}</div>
         <div class="liDesc">${skinBlurb(chosen)}</div>
         <div class="liMeta">${have ? (equipped?'Equipped':'In your locker') : unlockText(chosen)}</div>
         ${act}`;
    }

    host.querySelectorAll('.shopCard').forEach((card,i)=>{
      card.onclick = ()=>{ selSkin = list[i].id; setPreview(list[i].id, null); SFX.click(); buildShopPane(); };
    });
    const pane = host.closest('.tabPane') || host;
    pane.querySelectorAll('button[data-equip]').forEach(b=>{ b.onclick=()=>{
      custom.skin=b.dataset.equip; selSkin=b.dataset.equip; SFX.click(); saveProfile(); setPreview(null,null); buildShopPane(); }; });
    pane.querySelectorAll('button[data-buy]').forEach(b=>{ b.onclick=async ()=>{
      const s=skinOf(b.dataset.buy);
      if(s.unlock.kind!=='coins' || stats.coins < s.unlock.cost) return;
      stats.coins -= s.unlock.cost;
      stats.owned = stats.owned||[]; stats.owned.push(s.id);
      custom.skin = s.id;
      SFX.win();
      await saveProfile();
      selSkin = s.id;
      setPreview(null,null); buildShopPane(); refreshCoinChips();
    }; });
  }
