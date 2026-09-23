  // keep custom.color in step with the equipped skin (multiplayer sends a flat colour)
  function syncCustomColor(){ custom.color = skinBaseColor(skinOf(custom.skin)); }

  // ---- the lobby: five tabs across the top, Q / E cycle them ----
  const LOBBY_TABS = ['play','locker','badges','shop','pass','settings'];
  // v24 §5.1: the strip and the chips belong to the menu, not to the lobby.
  // Whatever menu screen is up, they are up with it -- a strip that vanishes
  // when you open the locker is a strip you cannot navigate with.
  // ONE LIST. menuScreenOpen asks whether any of them is up; hideMenuScreens
  // puts them all away. Before this there was a list here and a different,
  // shorter list inside backToLobby, and every screen that opened itself had
  // its own idea of what to close first.
  const MENU_SCREENS = ['home','locker','shop','pass','badges','modeSelect','profile','settings','daily','mpHome'];
  function menuScreenOpen(){
    return state === 'menu' && MENU_SCREENS
      .some(id => { const e = $(id); return e && !e.classList.contains('hidden'); });
  }
  // Close every menu screen, whichever one happened to be up.
  //
  // This exists because of a bug that survived the rest of this release:
  // opening SETTINGS from BADGES left both of them live at once. #settingsBtn
  // had its own handler that hid #home and nothing else -- so arriving from any
  // screen other than the lobby stacked settings on top of it. That is the same
  // fault #badgesBtn had, and the reason it is a FUNCTION now rather than a
  // sequence each caller repeats is that a whitelist somebody has to remember
  // to extend is a whitelist that will eventually be short again.
  function hideMenuScreens(){
    for(const id of MENU_SCREENS){ const e = $(id); if(e) e.classList.add('hidden'); }
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
    // The screens with teardown of their own get it first -- a preview to
    // clear, a profile to save, a buy dialog to dismiss -- and then everything
    // is closed generically, so a screen added later is closed whether or not
    // anybody remembered to name it here.
    if(!$('profile').classList.contains('hidden')){ clearPreview(); syncCustomColor(); saveProfile(); }
    if(!$('locker').classList.contains('hidden')) closeLocker();
    if(!$('shop').classList.contains('hidden')) closeShop();
    if(!$('pass').classList.contains('hidden')) closePass();
    if(!$('badges').classList.contains('hidden')) closeBadges();
    if(!$('modeSelect').classList.contains('hidden')) closeModeSelect();
    hideMenuScreens();
    $('home').classList.remove('hidden');
    refreshPreview(); refreshCoinChips(); refreshDailyChip();
    syncMenuChrome();
  }
  function openLobbyTab(name){
    selectLobbyTab(name);
    switch(name){
      case 'play':     backToLobby(); break;
      case 'locker':   backToLobby(); $('home').classList.add('hidden'); openLocker('skin'); break;
      // v25: badges is a screen now, and -- like every other screen here --
      // it hides the lobby behind it. This branch was the ONLY one that did
      // not, which is why the badges page was a panel floating over the lobby
      // instead of a page.
      case 'badges':   backToLobby(); $('home').classList.add('hidden'); openBadges(); break;
      case 'shop':     backToLobby(); $('home').classList.add('hidden'); openShop(); break;
      case 'pass':     backToLobby(); $('home').classList.add('hidden'); openPass(); break;
      case 'settings': backToLobby(); $('home').classList.add('hidden'); buildSettings(); $('settings').classList.remove('hidden'); break;
    }
    syncMenuChrome();
  }
  function cycleLobbyTab(dir){
    const i = LOBBY_TABS.indexOf(lobbyTabSelected());
    openLobbyTab(LOBBY_TABS[(i + dir + LOBBY_TABS.length) % LOBBY_TABS.length]);
  }
  // A dialog that sits over a menu screen owns the keyboard while it is up.
  function menuDialogOpen(){
    return ['buyBox','support'].some(id => { const e = $(id); return e && !e.classList.contains('hidden'); });
  }
  // WHICH SCREEN A KEY BELONGS TO. Q/E and [ ] walk the strip, so they work
  // wherever the strip is -- which is exactly when a menu screen is up: not
  // under the boot loader, and not over the multiplayer room, where the strip
  // is hidden and these keys used to open screens underneath it. ENTER and F
  // are the prompts printed on the lobby's PLAY and INVITE buttons, so they
  // are the LOBBY's. They used to fire from every menu screen: Enter in the
  // locker equipped and then opened Mode Select, Enter in the shop opened Mode
  // Select over its own buy dialog, and Enter on Mode Select's friends card
  // opened the room screen and immediately re-opened Mode Select on top of it.
  window.addEventListener('keydown', e=>{
    if(state!=='menu') return;
    if(!menuScreenOpen() || $('bootScreen') || menuDialogOpen()) return;
    if(e.target && (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA' || e.target.tagName==='SELECT')) return;
    const onLobby = !$('home').classList.contains('hidden');
    if(e.key==='q' || e.key==='Q'){ SFX.click(); cycleLobbyTab(-1); e.preventDefault(); }
    if(e.key==='e' || e.key==='E'){ SFX.click(); cycleLobbyTab(1);  e.preventDefault(); }
    // The bracket keys do the same thing. Q/E is the habit from the pad's
    // shoulder buttons; [ and ] is the habit from everything else.
    if(e.key==='['){ SFX.click(); cycleLobbyTab(-1); e.preventDefault(); }
    if(e.key===']'){ SFX.click(); cycleLobbyTab(1);  e.preventDefault(); }
    // The lobby advertised the gamepad face buttons A and Y whether or not a
    // pad was plugged in, and neither had a keyboard equivalent bound -- so on
    // a keyboard the two prompts on the screen were both wrong and both dead.
    if(onLobby && e.key==='Enter'){ const b=$('playBtn'); if(b){ b.click(); e.preventDefault(); } }
    if(onLobby && (e.key==='f' || e.key==='F')){ const b=$('mpBtn'); if(b){ b.click(); e.preventDefault(); } }
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
  // The pill goes through openLobbyTab like every other one, or the strip's
  // own routing is bypassed and the tab opens a screen the strip does not
  // think is open. This one had its own handler and still opened the old
  // profile pane after §5.3 replaced it.
  // ---- back to the arcade -----------------------------------------------
  // SAME-ORIGIN ROOT, not history.back(). The game is reached from a few
  // different places -- the arcade grid, a direct link, a reload -- so "the
  // previous page" is not reliably Nikcade, and on a fresh tab there is no
  // previous page at all. Going to '/' on this origin is the one thing that
  // always means the arcade, and because it is a same-origin navigation the
  // session cookie travels with it and the player stays signed in.
  function goNikcade(){
    SFX.click();
    try{ saveProfile(); }catch(_){ /* a save failure must not trap anyone here */ }
    window.location.assign('/');
  }
  $('homeBtn').onclick = goNikcade;
  { const pb = $('pauseHomeBtn'); if(pb) pb.onclick = goNikcade; }

  $('profileBtn').onclick = ()=>{ SFX.click(); openLobbyTab('locker'); };
  $('shopBtn').onclick    = ()=>{ SFX.click(); openLobbyTab('shop'); };
  $('passBtn').onclick    = ()=>{ SFX.click(); openLobbyTab('pass'); };
  // v25: through openLobbyTab like every other pill. The note above this
  // block describes exactly this bug -- a tab with its own handler that
  // bypasses the routing -- and badges was the one still doing it: it called
  // openProfile('badges'), so the BADGES pill opened the PROFILE panel, with
  // its CHARACTER / STATS / SKINS / PATTERNS strip and its cosmetic pickers,
  // and the badge list was a pane inside it.
  $('badgesBtn').onclick  = ()=>{ SFX.click(); openLobbyTab('badges'); };
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
  // Spectator switching. The arrows are free here because a spectating racer is
  // no longer steering anything -- 14_physics.js stops reading movement input
  // for a finished player the moment this screen is up, so the two cannot both
  // claim the key. Q and E are the pair the lobby uses for its tabs, and that
  // handler returns early unless state is 'menu', so they never overlap either.
  window.addEventListener('keydown', e=>{
    if(!spectating()) return;
    if(e.target && (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA')) return;
    if(e.key==='ArrowLeft'  || e.key==='q' || e.key==='Q'){ cycleSpectate(-1); e.preventDefault(); }
    if(e.key==='ArrowRight' || e.key==='e' || e.key==='E'){ cycleSpectate(1);  e.preventDefault(); }
  });
