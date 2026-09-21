  // ============================================================
  // MODE SELECT  (v25 §6)
  // ============================================================
  // There was no mode-select screen to rework. What there was: a PLAY button
  // wired straight to startRound(1,null), and an "Invite players" link off to
  // one side that opened the multiplayer room panel. So the game HAD two modes
  // and never asked which one you wanted -- it picked solo for you and hid the
  // other choice in a link.
  //
  // This makes the choice that already existed explicit. It does not invent a
  // mode: SOLO is the bots race PLAY always started, and FRIENDS is #mpHome
  // exactly as it was.
  //
  // Interaction, per the rule this release is about: HOVER HIGHLIGHTS. CLICK
  // SELECTS. The PLAY button starts it. Nothing begins because the pointer
  // crossed a card, and nothing follows the cursor.

  const MODES = [
    { id:'solo', name:'Solo Race', tag:'Single player',
      blurb:'Race a full grid of bots through the rounds. Your progress, badges and coins all count.',
      icon:'\u{1F3C1}' },
    { id:'friends', name:'Play with Friends', tag:'Multiplayer',
      blurb:'Host a room and share the code, or join one. Real players take the grid first, bots fill the rest.',
      icon:'\u{1F465}' },
  ];
  let modeIndex = 0, modeBuilt = false;

  function buildModeSelect(){
    const grid = $('modeGrid');
    grid.innerHTML = '';
    MODES.forEach((m, i)=>{
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'modeCard' + (i === modeIndex ? ' sel' : '');
      card.setAttribute('aria-pressed', String(i === modeIndex));
      card.setAttribute('aria-label', m.name + '. ' + m.blurb);

      const ico = document.createElement('span');
      ico.className = 'modeIco'; ico.textContent = m.icon;
      const tag = document.createElement('span');
      tag.className = 'modeTag'; tag.textContent = m.tag;
      const nm = document.createElement('span');
      nm.className = 'modeName'; nm.textContent = m.name;
      const bl = document.createElement('span');
      bl.className = 'modeBlurb'; bl.textContent = m.blurb;

      card.appendChild(ico); card.appendChild(tag);
      card.appendChild(nm); card.appendChild(bl);
      // CLICK, not mouseenter. Selecting is all it does.
      card.addEventListener('click', ()=>{ SFX.click(); modeIndex = i; modeSync(); });
      // Double-click is a reasonable shortcut for "this one, go" -- it is still
      // a deliberate press, not a hover.
      card.addEventListener('dblclick', ()=>{ modeIndex = i; modeStart(); });
      grid.appendChild(card);
    });
    modeSync();
  }

  function modeSync(){
    document.querySelectorAll('#modeGrid .modeCard').forEach((c, i)=>{
      c.classList.toggle('sel', i === modeIndex);
      c.setAttribute('aria-pressed', String(i === modeIndex));
    });
    $('modeGo').textContent = modeIndex === 0 ? 'RACE' : 'CONTINUE';
  }

  function modeStart(){
    const m = MODES[modeIndex];
    closeModeSelect();
    if(m.id === 'solo'){ startRound(1, null); return; }
    mpErr('');
    $('mpHome').classList.remove('hidden');
  }

  function openModeSelect(){
    buildModeSelect();
    $('home').classList.add('hidden');
    $('modeSelect').classList.remove('hidden');
    if(!modeBuilt){
      modeBuilt = true;
      $('modeGo').addEventListener('click', ()=>{ SFX.click(); modeStart(); });
      $('modeBack').addEventListener('click', ()=>{ SFX.click(); closeModeSelect(); backToLobby(); });
    }
    syncMenuChrome();
  }
  function closeModeSelect(){ $('modeSelect').classList.add('hidden'); }

  // Arrows move the selection, Enter takes it, Esc backs out. The screen is
  // two cards; it should not need a mouse.
  window.addEventListener('keydown', e=>{
    const el = $('modeSelect');
    if(!el || el.classList.contains('hidden')) return;
    if(e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if(e.key === 'ArrowRight' || e.key === 'ArrowDown'){ modeIndex = (modeIndex+1)%MODES.length; modeSync(); e.preventDefault(); }
    if(e.key === 'ArrowLeft'  || e.key === 'ArrowUp'){   modeIndex = (modeIndex-1+MODES.length)%MODES.length; modeSync(); e.preventDefault(); }
    if(e.key === 'Enter'){ modeStart(); e.preventDefault(); }
    if(e.key === 'Escape'){ closeModeSelect(); backToLobby(); e.preventDefault(); }
  });
