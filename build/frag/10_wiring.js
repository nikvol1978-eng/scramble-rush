  // keep custom.color in step with the equipped skin (multiplayer sends a flat colour)
  function syncCustomColor(){ custom.color = skinBaseColor(skinOf(custom.skin)); }

  $('profileBtn').onclick = ()=>{ SFX.click(); openProfile('character'); };
  $('shopBtn').onclick    = ()=>{ SFX.click(); openProfile('shop'); };
  $('badgesBtn').onclick  = ()=>{ SFX.click(); openProfile('badges'); };
  $('profBackBtn').onclick= ()=>{ SFX.click(); syncCustomColor(); saveProfile(); $('profile').classList.add('hidden'); $('home').classList.remove('hidden'); };
  document.querySelectorAll('#profile .tab').forEach(t=>{ t.onclick=()=>{ SFX.click(); switchTab(t.dataset.tab); }; });
  $('nameInput').addEventListener('input', e=>{ custom.name=e.target.value.slice(0,12); $('profNameLbl').textContent=custom.name||'YOU'; saveProfile(); });
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
