  // ============================================================
  // BADGES  (v25 §3)
  // ============================================================
  // ITS OWN SCREEN. Badges used to be a tab pane inside #profile, which is the
  // panel that also holds the colourway swatches, the pattern swatches, the hat
  // segment and the eye segment. So "the badges page" was a list rendered
  // beside four cosmetic pickers, under a second tab strip (CHARACTER / STATS /
  // BADGES / SKINS / PATTERNS) that sat directly beneath the global one -- and
  // the whole thing under a chrome bar that covered its own header and DONE
  // button. Nothing about it read as a page of its own.
  //
  // What replaced it is a .view: one header, one scrolling body, one footer,
  // and nothing in the content area that is not a badge.

  let bgBuilt = false;

  // Earned but not yet paid out. The pip on the nav uses the same call.
  function bgClaimable(){
    return ACHIEVEMENTS.filter(a => (stats.badges||[]).includes(a.id)
                                 && !(stats.claimed||[]).includes(a.id));
  }

  function bgTierOf(a){
    // Cheap banding for the eye, off the size of the payout. It is only used
    // to colour the card's rail, never to decide anything.
    if(a.coins >= 1200) return 'legendary';
    if(a.coins >= 600)  return 'epic';
    if(a.coins >= 300)  return 'rare';
    return 'common';
  }

  function buildBadges(){
    // Evaluate first. THIS IS THE MIGRATION: a player who already had 60 wins
    // before these badges existed has them awarded the moment the screen is
    // opened, rather than having to win a sixty-first to trigger the sweep.
    checkAchievements();

    const grid = $('bgGrid');
    grid.innerHTML = '';
    const earned = new Set(stats.badges||[]), claimed = new Set(stats.claimed||[]);

    for(const a of ACHIEVEMENTS){
      const got = earned.has(a.id), paid = claimed.has(a.id);
      const card = document.createElement('div');
      card.className = 'bgCard t-' + bgTierOf(a) + (got ? ' got' : '') + (paid ? ' paid' : '');

      const ico = document.createElement('div');
      ico.className = 'bgIco'; ico.textContent = a.icon;

      const txt = document.createElement('div');
      txt.className = 'bgTxt';
      const nm = document.createElement('div');
      nm.className = 'bgName'; nm.textContent = a.name;
      const ds = document.createElement('div');
      ds.className = 'bgDesc'; ds.textContent = a.desc;
      txt.appendChild(nm); txt.appendChild(ds);

      const rewards = document.createElement('div');
      rewards.className = 'bgRewards';
      const coin = document.createElement('span');
      coin.className = 'bgReward coins'; coin.textContent = '+' + a.coins;
      rewards.appendChild(coin);
      if(a.xp){
        const xp = document.createElement('span');
        xp.className = 'bgReward xp'; xp.textContent = '+' + a.xp + ' XP';
        rewards.appendChild(xp);
      }
      txt.appendChild(rewards);

      const act = document.createElement('div');
      act.className = 'bgAct';
      if(paid){
        const s = document.createElement('span');
        s.className = 'bgState done'; s.textContent = 'CLAIMED';
        act.appendChild(s);
      } else if(got){
        // A CLAIM BUTTON EXISTS ONLY WHEN THERE IS SOMETHING TO CLAIM.
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn small gold bgClaim';
        b.textContent = 'CLAIM';
        b.setAttribute('aria-label', 'Claim ' + a.name + ', ' + a.coins + ' coins');
        b.addEventListener('click', ()=>bgClaim(a.id, b));
        act.appendChild(b);
      } else {
        const s = document.createElement('span');
        s.className = 'bgState'; s.textContent = 'LOCKED';
        act.appendChild(s);
      }

      card.appendChild(ico); card.appendChild(txt); card.appendChild(act);
      grid.appendChild(card);
    }

    bgSyncHead();
  }

  function bgSyncHead(){
    const total = ACHIEVEMENTS.length;
    const earned = (stats.badges||[]).filter(id=>ACHIEVEMENTS.some(a=>a.id===id)).length;
    const pending = bgClaimable().length;
    $('bgSummary').textContent = earned + ' of ' + total + ' earned';
    $('bgFill').style.width = (total ? (earned/total)*100 : 0) + '%';
    const all = $('bgClaimAll');
    all.disabled = pending === 0;
    all.textContent = pending ? ('CLAIM ALL (' + pending + ')') : 'NOTHING TO CLAIM';
    $('bgPending').textContent = pending
      ? (pending + (pending===1 ? ' badge ready to claim' : ' badges ready to claim'))
      : 'Play a match to make progress.';
  }

  // ---- claiming ----------------------------------------------------------
  // CLAIM ONCE, AND ONLY ONCE. stats.claimed is the ledger; the guard below is
  // what makes a double-click, a double-tap and a re-entrant CLAIM ALL all
  // land on the same single payout. The button is disabled before the first
  // await so a second press cannot get in while saveProfile is in flight.
  let bgClaiming = false;
  async function bgClaim(id, btn){
    if(bgClaiming) return;
    const a = ACHIEVEMENTS.find(x=>x.id===id);
    if(!a) return;
    if(!(stats.badges||[]).includes(id)) return;          // not earned
    if((stats.claimed||[]).includes(id)) return;          // already paid
    bgClaiming = true;
    if(btn) btn.disabled = true;
    try{
      stats.claimed = stats.claimed || [];
      stats.claimed.push(id);
      SFX.win();
      await addCoins(a.coins, a.name);
      if(a.xp) await awardXp(a.xp);
      await saveProfile();
      buildBadges();
      refreshCoinChips();
      refreshBadgePips();
    } finally {
      bgClaiming = false;
    }
  }

  async function bgClaimAll(){
    if(bgClaiming) return;
    // Snapshot first: bgClaim rebuilds the grid, and iterating a list that the
    // loop body is regenerating is how a claim gets skipped.
    const pending = bgClaimable().map(a=>a.id);
    for(const id of pending) await bgClaim(id, null);
  }

  function refreshBadgePips(){
    const n = bgClaimable().length;
    ['badgePip','badgePip2'].forEach(id=>{ const e=$(id); if(e) e.classList.toggle('hidden', n===0); });
  }

  // Which pane owns the content area. Exactly one does.
  let bgPane = 'badges';
  function bgSetPane(name){
    bgPane = (name === 'stats') ? 'stats' : 'badges';
    document.querySelectorAll('#badges .bgTab').forEach(b=>{
      const on = b.dataset.bg === bgPane;
      b.classList.toggle('sel', on);
      b.setAttribute('aria-selected', String(on));
    });
    $('bgGrid').classList.toggle('hidden', bgPane !== 'badges');
    $('bgStats').classList.toggle('hidden', bgPane !== 'stats');
    if(bgPane === 'stats') buildBadgeStats();
  }

  // The fifteen rows the old profile panel used to show. Same numbers, same
  // source; only the box around them is new.
  function buildBadgeStats(){
    const host = $('bgStats');
    if(!host) return;
    const owned = ownedSkins().size;
    const winRate = stats.races ? Math.round((stats.wins/stats.races)*100) : 0;
    const rows = [
      ['Matches played', fmtNum(stats.races)],
      ['Matches won',    fmtNum(stats.wins)],
      ['Win rate',       winRate + '%'],
      ['Podium finishes', fmtNum(stats.podiums)],
      ['Finals reached', fmtNum(stats.finals)],
      ['Level',          fmtNum(stats.level)],
      ['Coins',          fmtNum(stats.coins)],
      ['Dives',          fmtNum(stats.dives)],
      ['Minigames survived', fmtNum(stats.minigamesWon)],
      ['Lava rounds survived', fmtNum(stats.lavaSurvived)],
      ['Clean rounds (no falls)', fmtNum(stats.noFallFinishes)],
      ['Online matches', fmtNum(stats.mpRaces)],
      ['Best win streak', fmtNum(stats.bestStreak || 0)],
      ['Badges earned',  (stats.badges||[]).length + ' / ' + ACHIEVEMENTS.length],
      ['Colourways owned', owned + ' / ' + SKINS.length],
      ['Patterns owned', ownedPatterns().size + ' / ' + PATTERNS.length],
    ];
    host.innerHTML = '';
    for(const [label, value] of rows){
      const card = document.createElement('div');
      card.className = 'statCard';
      // .v and .k are the classes .statCard already styles; reusing them
      // means this pane needs no CSS of its own.
      const l = document.createElement('div');
      l.className = 'k'; l.textContent = label;
      const v = document.createElement('div');
      v.className = 'v'; v.textContent = value;
      card.appendChild(v); card.appendChild(l);
      host.appendChild(card);
    }
  }

  function openBadges(){
    buildBadges();
    bgSetPane(bgPane);
    $('badges').classList.remove('hidden');
    if(!bgBuilt){
      bgBuilt = true;
      $('bgClaimAll').addEventListener('click', ()=>{ SFX.click(); bgClaimAll(); });
      $('bgBackBtn').addEventListener('click', ()=>{ SFX.click(); openLobbyTab('play'); });
      document.querySelectorAll('#badges .bgTab').forEach(b=>{
        b.addEventListener('click', ()=>{ SFX.click(); bgSetPane(b.dataset.bg); });
      });
    }
  }
  function closeBadges(){ $('badges').classList.add('hidden'); }
