  // keep custom.color in step with the equipped skin (multiplayer sends a flat colour)
  function syncCustomColor(){ custom.color = skinBaseColor(skinOf(custom.skin)); }

  // ---- the lobby: five tabs across the top, Q / E cycle them ----
  const LOBBY_TABS = ['play','locker','badges','shop','settings'];
  // v24 §5.1: the strip and the chips belong to the menu, not to the lobby.
  // Whatever menu screen is up, they are up with it -- a strip that vanishes
  // when you open the locker is a strip you cannot navigate with.
  function menuScreenOpen(){
    return state === 'menu' && ['home','profile','settings','daily','mpHome']
      .some(id => { const e = $(id); return e && !e.classList.contains('hidden'); });
  }
  function syncMenuChrome(){
    const on = menuScreenOpen();
    $('menuChrome').classList.toggle('hidden', !on);
    $('menuRings').classList.toggle('hidden', !on);
  }

  function selectLobbyTab(name){
    document.querySelectorAll('.tabPill').forEach(b=>b.classList.toggle('sel', b.dataset.lobby===name));
  }
  function lobbyTabSelected(){
    const b = document.querySelector('.tabPill.sel');
    return b ? b.dataset.lobby : 'play';
  }
  function backToLobby(){
    if(!$('profile').classList.contains('hidden')){ clearPreview(); syncCustomColor(); saveProfile(); }
    ['profile','settings','mpHome','daily'].forEach(id=>{ const e=$(id); if(e) e.classList.add('hidden'); });
    $('home').classList.remove('hidden');
    refreshPreview(); refreshCoinChips(); refreshDailyChip();
    syncMenuChrome();
  }
  function openLobbyTab(name){
    selectLobbyTab(name);
    switch(name){
      case 'play':     backToLobby(); break;
      case 'locker':   backToLobby(); openProfile('character'); break;
      case 'badges':   backToLobby(); openProfile('badges'); break;
      case 'shop':     backToLobby(); openProfile('shop'); break;
      case 'settings': backToLobby(); $('home').classList.add('hidden'); buildSettings(); $('settings').classList.remove('hidden'); break;
    }
    syncMenuChrome();
  }
  function cycleLobbyTab(dir){
    const i = LOBBY_TABS.indexOf(lobbyTabSelected());
    openLobbyTab(LOBBY_TABS[(i + dir + LOBBY_TABS.length) % LOBBY_TABS.length]);
  }
  window.addEventListener('keydown', e=>{
    if(state!=='menu') return;
    if(e.target && (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA')) return;
    if(e.key==='q' || e.key==='Q'){ SFX.click(); cycleLobbyTab(-1); e.preventDefault(); }
    if(e.key==='e' || e.key==='E'){ SFX.click(); cycleLobbyTab(1);  e.preventDefault(); }
    // The bracket keys do the same thing. Q/E is the habit from the pad's
    // shoulder buttons; [ and ] is the habit from everything else.
    if(e.key==='['){ SFX.click(); cycleLobbyTab(-1); e.preventDefault(); }
    if(e.key===']'){ SFX.click(); cycleLobbyTab(1);  e.preventDefault(); }
    // The lobby advertised the gamepad face buttons A and Y whether or not a
    // pad was plugged in, and neither had a keyboard equivalent bound -- so on
    // a keyboard the two prompts on the screen were both wrong and both dead.
    if(e.key==='Enter'){ const b=$('playBtn'); if(b){ b.click(); e.preventDefault(); } }
    if(e.key==='f' || e.key==='F'){ const b=$('mpBtn'); if(b){ b.click(); e.preventDefault(); } }
  });

  // Which prompts to show. A pad that is plugged in gets its own glyphs; with
  // no pad the hints name keys that do something.
  function padConnected(){
    if(!navigator.getGamepads) return false;
    const pads = navigator.getGamepads();
    for(let i=0;i<pads.length;i++) if(pads[i] && pads[i].connected) return true;
    return false;
  }
  function refreshInputHints(){
    const pad = padConnected();
    const play = $('playBtn') && $('playBtn').querySelector('.keyHint');
    const inv  = $('mpBtn')   && $('mpBtn').querySelector('.keyHint');
    if(play){ play.textContent = pad ? 'A' : 'ENTER'; play.classList.toggle('word', !pad); }
    if(inv){  inv.textContent  = pad ? 'Y' : 'F';     inv.classList.toggle('word', false); }
  }
  window.addEventListener('gamepadconnected', refreshInputHints);
  window.addEventListener('gamepaddisconnected', refreshInputHints);
  refreshInputHints();
  function refreshLobby(){
    const lvl=$('seasonLevel'), fill=$('seasonFill'), txt=$('seasonText');
    if(lvl){ const need = xpForLevel(stats.level||1); lvl.textContent = stats.level||1;
             fill.style.width = clamp(((stats.xp||0)/need)*100, 0, 100)+'%'; txt.textContent = (stats.xp||0)+'/'+need; }
    document.querySelectorAll('#homeCrowns .crownNum, #nameCrowns').forEach(e=>{ e.textContent = stats.wins||0; });
    const nm=$('homeName'); if(nm && document.activeElement!==nm) nm.value = custom.name==='YOU' ? '' : (custom.name||'');
  }
  $('tabPlay').onclick    = ()=>{ SFX.click(); openLobbyTab('play'); };
  $('profileBtn').onclick = ()=>{ SFX.click(); selectLobbyTab('locker'); openProfile('character'); };
  $('shopBtn').onclick    = ()=>{ SFX.click(); selectLobbyTab('shop'); openProfile('shop'); };
  $('badgesBtn').onclick  = ()=>{ SFX.click(); selectLobbyTab('badges'); openProfile('badges'); };
  $('homeName').addEventListener('input', e=>{ custom.name=e.target.value.slice(0,12).trim()||'YOU'; $('profNameLbl').textContent=custom.name; saveProfile(); refreshLobby(); });
  $('homeName').addEventListener('keydown', e=>{ if(e.key==='Enter') e.target.blur(); e.stopPropagation(); });
  $('nameCard').onclick = ()=>{ $('homeName').focus(); };
  $('profBackBtn').onclick= ()=>{ SFX.click(); clearPreview(); syncCustomColor(); saveProfile(); $('profile').classList.add('hidden'); $('home').classList.remove('hidden'); selectLobbyTab('play'); };
  document.querySelectorAll('#profile .tab').forEach(t=>{ t.onclick=()=>{ SFX.click(); switchTab(t.dataset.tab); }; });
  $('nameInput').addEventListener('input', e=>{ custom.name=e.target.value.slice(0,12); $('profNameLbl').textContent=custom.name||'YOU'; saveProfile(); refreshLobby(); });
  $('randomBlobBtn').onclick = ()=>{
    const owned=[...ownedSkins()], ownedP=[...ownedPatterns()];
    custom.skin    = owned[Math.floor(Math.random()*owned.length)];
    custom.pattern = ownedP[Math.floor(Math.random()*ownedP.length)];
    custom.hat  = pick(HATS)[0];
    custom.eyes = pick(EYES)[0];
    SFX.click(); syncCustomColor(); saveProfile(); refreshPreview(); buildCharacterPane();
  };

  $('dailyBtn').onclick     = ()=>{ SFX.click(); openDaily(); };
  $('dailyBackBtn').onclick = ()=>{ SFX.click(); closeDaily(); };
  $('spinBtn').onclick      = ()=>{ doSpin(); };

  $('specPrev').onclick  = ()=>cycleSpectate(-1);
  $('specNext').onclick  = ()=>cycleSpectate(1);
  $('specAgain').onclick = ()=>{ SFX.click(); leaveSpectate(); goHome(); startRound(1,null); };
  $('specQuit').onclick  = ()=>{ SFX.click(); leaveSpectate(); goHome(); };
  window.addEventListener('keydown', e=>{
    if(!spectating()) return;
    if(e.key==='ArrowLeft'){ cycleSpectate(-1); e.preventDefault(); }
    if(e.key==='ArrowRight'){ cycleSpectate(1); e.preventDefault(); }
  });
