  // ============================================================
  // ROUND FLOW — three rounds, six racers in the final
  // ============================================================
  const ROUNDS = 3, FINAL_COUNT = 6;
  // The final leans hard into minigames — that is where they land best.
  const MINIGAME_CHANCE = {1:0.30, 2:0.34, 3:0.55};
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
  const KNOCKOUT_MIN_S = 14;
  function knockoutTarget(total, raceKeep){
    return Math.max(2, Math.min(raceKeep, Math.ceil(total*0.55)));
  }

  // ---- the Stumble-Guys style map reel that plays while the course builds ----
  const LOADER_MS = 2200;
  function showMapLoader(map){
    const host=$('mapLoader'), strip=$('loaderStrip');
    if(!host||!strip) return;
    const pool=[...MAPS,...MINIGAMES];
    const idx=8, cards=[];
    for(let i=0;i<13;i++) cards.push(i===idx ? map : pick(pool));
    strip.innerHTML = cards.map(m=>
      `<div class="loadCard${m.isMinigame?' mini':''}">
         <div class="loadArt" style="background:linear-gradient(160deg,${m.skyTop},${m.skyMid} 52%,${m.ground})"></div>
         <div class="loadName">${m.name}</div>
       </div>`).join('');
    host.classList.remove('hidden');
    strip.style.transition='none';
    strip.style.transform='translateX(0px)';
    void strip.offsetWidth;                       // force a reflow so the transition takes
    // measure rather than hardcode — the cards are narrower on small screens
    const first = strip.children[0];
    const cw = first ? first.getBoundingClientRect().width : 180;
    const cardW = cw + 14;                        // + the flex gap
    // the strip is positioned inside the window, so centre against the window, not the screen
    const win = strip.parentElement;
    const target = -(idx*cardW) + (win.clientWidth/2 - cw/2);
    strip.style.transition='transform '+(LOADER_MS/1000)+'s cubic-bezier(0.10,0.70,0.14,1)';
    strip.style.transform='translateX('+target+'px)';
    setTimeout(()=>{ const el=strip.children[idx]; if(el) el.classList.add('landed'); }, LOADER_MS-200);
  }
  function hideMapLoader(){ const h=$('mapLoader'); if(h) h.classList.add('hidden'); }

  function startRound(n, survivors){
    round=n;
    if(mp.role!=='client'){
      const chance = MINIGAME_CHANCE[n] !== undefined ? MINIGAME_CHANCE[n] : 0.3;
      const finals = MINIGAMES.filter(m=>m.final);
      if(currentMap && currentMap.__forced){ /* a test picked it */ }
      else if(n >= ROUNDS && finals.length && Math.random() < 0.72){
        currentMap = pick(finals);                 // the showdown, not another race
      } else {
        const pool = MINIGAMES.filter(m=>!m.final);
        currentMap = (Math.random()<chance) ? pick(pool) : pick(MAPS);
      }
    }
    obstacles=genCourse(n);
    // genCourse fixes trackLength, and the path table has to span it
    setCoursePath(currentMap.path ? COURSE_PATHS[currentMap.path] : null, trackLength);
    boulders=[]; lasers=[]; shots=[];
    lavaZ = currentMap.mode==='lava' ? -320 : 0;
    timeLimit = n===1?80 : n===2?70 : 62;
    lavaSpeed = currentMap.mode==='lava' ? trackLength/(timeLimit*0.8) : 0;
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
    leaveSpectate();
    const me = sorted.find(r=>r.isPlayer);
    const playerRank = sorted.findIndex(r=>r.isPlayer)+1;

    if(round < ROUNDS){
      let keepCount = survivorsAfter(round, sorted.length);
      if(currentMap.knockout){
        // whoever fell is out; nobody advances on a technicality
        const alive = sorted.filter(r=>!r.lavaOut).length;
        keepCount = Math.max(2, Math.min(keepCount, alive));
      }
      const survivors = sorted.slice(0,keepCount);
      const madeIt = playerRank<=keepCount;
      if(mp.role!=='client' && madeIt){
        if(currentMap.isMinigame){ stats.minigamesWon++; if(currentMap.mode==='lava') stats.lavaSurvived++; }
        if(me && !me.fallCount) stats.noFallFinishes++;
        checkAchievements();
        addCoins(round===1?25:40, roundLabel(round)+' survived');
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
      awardXp(60);
    } else {
      stats.winStreak = 0;
      addCoins(myRank===2?80:myRank===3?60:30, myRank<=3?('Podium — '+myRank+(myRank===2?'nd':'rd')):'Finalist');
      awardXp(30);
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
