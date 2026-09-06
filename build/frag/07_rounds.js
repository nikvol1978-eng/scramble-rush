  // ============================================================
  // ROUND FLOW — three rounds, six racers in the final
  // ============================================================
  const ROUNDS = 3, FINAL_COUNT = 6;
  // The final leans hard into minigames — that is where they land best.
  // Round 1 is always a race so everyone learns the controls; round 2 is a
  // coin flip; round 3 is always the Closing Circle.
  const MINIGAME_CHANCE = {1:0, 2:0.5};
  let loadTimer = 0;

  function survivorsAfter(roundNum, total){
    if(roundNum>=ROUNDS) return 1;
    if(roundNum===ROUNDS-1) return Math.max(2, Math.min(FINAL_COUNT, total-1));
    const target = Math.max(FINAL_COUNT+1, Math.ceil(total*0.72));
    return Math.max(2, Math.min(target, total-1));
  }
  function roundLabel(n){ return n===ROUNDS ? 'FINAL' : 'ROUND '+n; }

  // A survival round cuts harder than a race and runs for a minimum time, or it
  // is over before anyone has understood what the map is.
  const KNOCKOUT_MIN_S = 40;      // a survival round has to last like one
  // Swept the cushion with the lava clamped behind the leader. Every positive
  // setting still produced the odd run where the field was wiped; -1 gives
  // 12-15 survivors every time with no cascade, which is worth more than
  // hitting a median exactly.
  const CLEAN_PACE = 260, LAVA_MARGIN = -1;
  function knockoutTarget(total, raceKeep){
    return Math.max(2, Math.min(raceKeep, Math.ceil(total*0.55)));
  }

  // ---- "NEXT UP IS..." -- a carousel of course cards that spins for 1.4 s,
  // settles on the round we are about to play, then expands into the flyover.
  // Round end to countdown is no longer than the old reel + flyover was: the
  // reveal takes 2600 ms and the flyover gave up the difference (4200 -> 3800).
  const LOADER_MS = 2600, REVEAL_SPIN_MS = 1400;
  // A snapshot of each course the first time it is built, so the side cards
  // can show a real render of a round once you have seen it.
  const courseThumbs = {};
  let _thumbRT = null;
  function captureCourseThumb(){
    try{
      const W_ = 480, H_ = 270;
      if(!_thumbRT) _thumbRT = new THREE.WebGLRenderTarget(W_, H_);
      const p = racers.find(r=>r.isPlayer);
      const s = Math.max(600, Math.min(trackLength*0.45, trackLength-600));
      const cw = toWorld(TRACK_W/2 - 420, s - 520, 300), tw = toWorld(TRACK_W/2, s + 420, 20);
      const savedPos = camera.position.clone(), savedAspect = camera.aspect;
      camera.aspect = W_/H_; camera.updateProjectionMatrix();
      camera.position.set(cw.x, cw.y, cw.z); camera.lookAt(tw.x, tw.y, tw.z);
      sky.position.set(camera.position.x, 0, camera.position.z);
      const vis = [courseGroup.visible, racerGroup.visible, previewGroup.visible, sky.visible];
      courseGroup.visible = true; racerGroup.visible = true; previewGroup.visible = false; sky.visible = true;
      renderer.setRenderTarget(_thumbRT); renderer.render(scene, camera); renderer.setRenderTarget(null);
      const px = new Uint8Array(W_*H_*4);
      renderer.readRenderTargetPixels(_thumbRT, 0, 0, W_, H_, px);
      const cv = document.createElement('canvas'); cv.width = W_; cv.height = H_;
      const g = cv.getContext('2d'), img = g.createImageData(W_, H_);
      for(let y=0;y<H_;y++){ const src=(H_-1-y)*W_*4, dst=y*W_*4; img.data.set(px.subarray(src, src+W_*4), dst); }
      g.putImageData(img, 0, 0);
      courseThumbs[currentMap.key] = cv.toDataURL('image/jpeg', 0.82);
      courseGroup.visible = vis[0]; racerGroup.visible = vis[1]; previewGroup.visible = vis[2]; sky.visible = vis[3];
      camera.aspect = savedAspect; camera.updateProjectionMatrix(); camera.position.copy(savedPos);
      if(p) syncCamera(true);
    }catch(e){ /* no thumbnail is not a failure */ }
  }
  function cardArt(m){
    return courseThumbs[m.key] ? `background-image:url(${courseThumbs[m.key]})`
                               : `background:linear-gradient(160deg,${m.skyTop},${m.skyMid} 52%,${m.ground})`;
  }
  function showMapLoader(map){
    const host=$('mapLoader'), strip=$('loaderStrip');
    if(!host||!strip) return;
    const pool=[...MAPS,...MINIGAMES].filter(m=>m.key!==map.key);
    const idx=8, cards=[];
    for(let i=0;i<13;i++) cards.push(i===idx ? map : pick(pool));
    strip.innerHTML = cards.map(m=>
      `<div class="revealCard${m.isMinigame?' mini':''}">
         <div class="revealArt" style="${cardArt(m)}"></div>
         <div class="revealTip">${m.tip}</div>
         <div class="revealName">${m.name}</div>
       </div>`).join('');
    host.classList.remove('hidden');
    strip.style.transition='none';
    strip.style.transform='translateX(0px)';
    void strip.offsetWidth;                       // force a reflow so the transition takes
    // Land the chosen card dead centre. Measured off that card's own layout
    // position rather than card width times count, so a gap in vw or a card
    // that clamped to its min-width cannot push the landing off by a card.
    const chosen = strip.children[idx];
    const win = strip.parentElement;
    const target = chosen ? -chosen.offsetLeft + (win.clientWidth/2 - chosen.offsetWidth/2) : 0;
    strip.style.transition='transform '+(REVEAL_SPIN_MS/1000)+'s cubic-bezier(0.10,0.70,0.14,1)';
    strip.style.transform='translateX('+target+'px)';
    // settle with a soft thunk: the chosen card pops up, its neighbours lean in
    setTimeout(()=>{
      const el=strip.children[idx]; if(!el) return;
      el.classList.add('landed');
      if(strip.children[idx-1]) strip.children[idx-1].classList.add('near');
      if(strip.children[idx+1]) strip.children[idx+1].classList.add('near');
      try{ SFX.bump(); }catch(e){}
    }, REVEAL_SPIN_MS-60);
    // ...then the card grows into the flyover
    setTimeout(()=>{ const el=strip.children[idx]; if(el) el.classList.add('expand'); }, LOADER_MS-520);
  }
  function hideMapLoader(){ const h=$('mapLoader'); if(h) h.classList.add('hidden'); }

  function startRound(n, survivors){
    round=n;
    if(mp.role!=='client'){
      const chance = MINIGAME_CHANCE[n] !== undefined ? MINIGAME_CHANCE[n] : 0.3;
      const finals = MINIGAMES.filter(m=>m.final);
      if(currentMap && currentMap.__forced){ /* a test picked it */ }
      else if(n >= ROUNDS && finals.length){
        currentMap = pick(finals);                 // the showdown, always
      } else {
        const pool = MINIGAMES.filter(m=>!m.final);
        currentMap = (Math.random()<chance) ? pick(pool) : pick(MAPS);
      }
    }
    obstacles=genCourse(n);
    // genCourse fixes trackLength, and the path table has to span it
    // An authored course carries its own bends, section by section; the old
    // whole-course path shapes stay for the arenas, which have no script.
    setCoursePath(courseScript ? scriptPathSpec(courseScript)
                               : (currentMap.path ? COURSE_PATHS[currentMap.path] : null), trackLength);
    boulders=[]; lasers=[]; shots=[];
    lavaZ = currentMap.mode==='lava' ? -320 : 0;
    timeLimit = n===1?60 : n===2?55 : 50;
    // Chase the pack, do not outrun it: a clean run finishes about eight
    // seconds ahead of the lava. Tying this to the time limit meant a 60s
    // limit against an 11,780-long course caught thirteen of sixteen.
    const margin = (typeof window!=='undefined' && window.__lavaMargin !== undefined) ? window.__lavaMargin : LAVA_MARGIN;
    lavaSpeed = currentMap.mode==='lava' ? trackLength/(trackLength/CLEAN_PACE + margin) : 0;
    if(n===1 && mp.role!=='client'){ stats.races++; saveProfile(); }
    if(n===ROUNDS && mp.role!=='client'){ stats.finals++; checkAchievements(); saveProfile(); }
    if(mp.role==='host' && mp.conns.length){
      broadcast({type:'roundStart', obstacles:JSON.parse(JSON.stringify(obstacles)), trackLength, round:n, hostT:performance.now()/1000, mapDef:currentMap});
    }
    buildCourseMeshes(); applyMapSky();
    racers=makeRacers(survivors); buildRacerMeshes();
    for(const r of racers){ r.floorH=0; r.onRamp=null; }
    clearParticles(); resetLook();
    courseGroup.visible=true; racerGroup.visible=true; previewGroup.visible=false;
    syncCamera(true);
    captureCourseThumb();                         // the reveal card shows this course, live
    raceTime=0;
    $('mapIntroName').textContent=currentMap.name.toUpperCase();
    $('mapIntroTip').textContent=currentMap.tip;
    $('roundBadge').textContent=roundLabel(n);
    $('hud').classList.add('hidden'); $('pauseBtn').classList.add('hidden');   // the flyover owns the screen first
    if(settings.hints) $('hint').classList.remove('hidden');
    $('touchControls').classList.toggle('hidden', !settings.touch);
    // reel first, then the map card, then go
    state='loading'; loadTimer=LOADER_MS; bannerTimer=0; mapIntroTimer=0;
    showMapLoader(currentMap);
  }

  function endRound(){
    state='roundEnd';
    const sorted=[...racers].sort(rankCompare);
    $('hud').classList.add('hidden'); $('hint').classList.add('hidden'); $('pauseBtn').classList.add('hidden');
    leaveSpectate(); stopMusic();
    const me = sorted.find(r=>r.isPlayer);
    const playerRank = sorted.findIndex(r=>r.isPlayer)+1;

    if(round < ROUNDS){
      let keepCount = survivorsAfter(round, sorted.length);
      if(currentMap.knockout && round >= ROUNDS){
        // in the final, only someone still standing can win it
        const alive = sorted.filter(r=>!r.lavaOut).length;
        keepCount = Math.max(1, Math.min(keepCount, alive));
      }
      // Earlier rounds keep the normal cut even if the field is wiped out:
      // clamping to the survivors turned a bad Tile Trap into "2 of 16 advance".
      // rankCompare already puts survivors first and then orders by how far
      // everyone got, so the cut is still earned.
      const survivors = sorted.slice(0,keepCount);
      const madeIt = playerRank<=keepCount;
      if(mp.role!=='client' && madeIt){
        if(currentMap.isMinigame){ stats.minigamesWon++; if(currentMap.mode==='lava') stats.lavaSurvived++; }
        if(me && !me.fallCount) stats.noFallFinishes++;
        checkAchievements();
        addCoins(round===1?25:40, roundLabel(round)+' survived');
        if(!currentMap.isMinigame && me && me.finished) awardXp(20);      // a race finished
      }
      if(mp.role==='host') broadcast({type:'roundEnd', sorted:sorted.map(serializeRacer), keepCount, victory:false});
      showResults(sorted,keepCount,()=>{
        if(madeIt){
          if(mp.role==='host'){
            const survivorIds=new Set(survivors.map(s=>s.remoteId).filter(Boolean));
            mp.conns.forEach(c=>{ if(!survivorIds.has(c.peer) && c.open) c.send({type:'eliminated'}); });
          }
          startRound(round+1,survivors);
        } else showGameOver(playerRank,sorted.length);
      },madeIt);
    } else {
      const w=sorted[0]; spawnConfetti(w.x, Math.min(w.y,trackLength));
      if(mp.role!=='client' && currentMap.isMinigame && playerRank<=FINAL_COUNT) stats.minigamesWon++;
      if(mp.role==='host') broadcast({type:'roundEnd', sorted:sorted.map(serializeRacer), victory:true});
      showVictory(sorted);
    }
  }

  function nameOf(r){ return r.isPlayer?(custom.name||'YOU'):r.name; }
  function dotFor(r){
    const s = r.isPlayer ? skinOf(custom.skin) : null;
    const bg = s ? skinSwatch(s) : r.color;
    return `<span style="width:14px;height:14px;border-radius:50%;background:${bg};border:2px solid var(--line);display:inline-block"></span>`;
  }

  function showResults(sorted,keepCount,onContinue,madeIt){
    const el=$('results'); el.classList.remove('hidden');
    const rows=sorted.map((r,i)=>{ const safe=i<keepCount; return `<div style="display:flex;justify-content:space-between;gap:16px;padding:6px 10px;border-radius:10px;background:${safe?'rgba(35,230,201,0.25)':'rgba(255,90,77,0.2)'};${r.isPlayer?'outline:3px solid var(--gold);':''}">
      <span style="font-weight:700;color:var(--line);display:flex;align-items:center;gap:8px;">${dotFor(r)}${i+1}. ${nameOf(r)}</span>
      <span style="font-weight:600;color:var(--line);">${safe?'ADVANCES':'ELIMINATED'}</span></div>`; }).join('');
    const nextLabel = (round+1)===ROUNDS ? 'CONTINUE TO THE FINAL' : 'CONTINUE TO ROUND '+(round+1);
    const btnRow = mp.role==='client'
      ? `<div class="row"><div class="lbl">Waiting for host…</div><button class="btn small blue" id="resQuit">LEAVE</button></div>`
      : `<div class="row"><button class="btn ${madeIt?'gold':'pink'}" id="continueBtn">${madeIt?nextLabel:'SEE RESULT'}</button><button class="btn small blue" id="resQuit">MENU</button></div>`;
    el.innerHTML=`<h1 class="title" style="font-size:2.4rem;">${roundLabel(round)} RESULTS</h1>
      <div class="subtitle">${keepCount} of ${sorted.length} advance</div>
      <div class="panel cardbox" style="padding:18px 22px;max-height:46vh;overflow:auto;display:flex;flex-direction:column;gap:6px;width:min(440px,92vw);">${rows}</div>
      ${btnRow}`;
    if(mp.role!=='client') $('continueBtn').onclick=()=>{ SFX.click(); el.classList.add('hidden'); onContinue(); };
    $('resQuit').onclick=()=>{ SFX.click(); goHome(); };
  }

  function showGameOver(rank,total){
    const el=$('gameover'); el.classList.remove('hidden');
    if(mp.role) stats.mpRaces++;
    stats.winStreak = 0;
    const coins = 20 + Math.max(0, (total-rank))*2;
    addCoins(coins, 'Match reward');
    awardXp(15);
    el.innerHTML=`<h1 class="title">ELIMINATED</h1><div class="panel cardbox" style="padding:20px 26px;"><p>You placed <strong>${rank} of ${total}</strong>. So close! Give it another scramble?</p></div>
      <div class="row"><button class="btn pink" id="retryBtn">TRY AGAIN</button><button class="btn small blue" id="goQuit">MENU</button></div>`;
    $('retryBtn').onclick=()=>{ SFX.click(); el.classList.add('hidden'); startRound(1,null); };
    $('goQuit').onclick=()=>{ SFX.click(); goHome(); };
  }

  function showVictory(sorted){
    const el=$('results'); el.classList.remove('hidden');
    const top3=sorted.slice(0,3); const winner=sorted[0];
    const me=sorted.find(r=>r.isPlayer);
    const myRank=sorted.findIndex(r=>r.isPlayer)+1;
    if(mp.role) stats.mpRaces++;
    if(myRank>0 && myRank<=3) stats.podiums++;
    if(winner.isPlayer){
      stats.wins++;
      stats.winStreak = (stats.winStreak||0) + 1;
      stats.bestStreak = Math.max(stats.bestStreak||0, stats.winStreak);
      if(me && !me.fallCount){ stats.noFallFinishes++; stats.cleanWins = (stats.cleanWins||0)+1; }
      addCoins(150,'Victory');
      if(stats.winStreak>=2) addCoins(50*Math.min(stats.winStreak,6), stats.winStreak+' win streak');
      awardXp(150);
    } else {
      stats.winStreak = 0;
      addCoins(myRank===2?80:myRank===3?60:30, myRank<=3?('Podium — '+myRank+(myRank===2?'nd':'rd')):'Finalist');
      awardXp(myRank<=3 ? 60 : (me && me.finished ? 20 : 0));
    }
    checkAchievements(); saveProfile();
    const btnRow = mp.role==='client'
      ? `<div class="row"><div class="lbl">Match over</div><button class="btn small blue" id="vicQuit">MENU</button></div>`
      : `<div class="row"><button class="btn gold" id="playAgainBtn">PLAY AGAIN</button><button class="btn small blue" id="vicQuit">MENU</button></div>`;
    el.innerHTML=`<h1 class="title">${winner.isPlayer?'VICTORY!':nameOf(winner)+' WINS'}</h1>
      <div class="subtitle" style="color:var(--gold);">${winner.isPlayer?'You crossed the line first!':'You finished '+myRank+' of '+sorted.length+'.'}</div>
      <div class="podiumRow">
        <div class="podiumStep p2"><div class="podiumName">${top3[1]?nameOf(top3[1]):''}</div><div class="podiumBlock">2</div></div>
        <div class="podiumStep p1"><div class="podiumName">${nameOf(top3[0])}</div><div class="podiumBlock">1</div></div>
        <div class="podiumStep p3"><div class="podiumName">${top3[2]?nameOf(top3[2]):''}</div><div class="podiumBlock">3</div></div>
      </div>
      ${btnRow}`;
    if(mp.role!=='client') $('playAgainBtn').onclick=()=>{ SFX.click(); el.classList.add('hidden'); startRound(1,null); };
    $('vicQuit').onclick=()=>{ SFX.click(); goHome(); };
  }
