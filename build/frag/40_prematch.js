  // ============================================================
  // PRE-MATCH  (v27 §1)
  // ============================================================
  // What this replaces: a loading screen that was an animation with nothing
  // behind it.
  //
  //   THE WORK WAS ALREADY DONE BEFORE THE LOADER APPEARED. startRound
  //   generated the course, built every mesh and made the racers, and only then
  //   set `state='loading'` and started a reel. There was nothing left to wait
  //   for, so the screen could not have been anything but decoration.
  //
  //   THE COUNTDOWN WAS THREE SECONDS OF EACH CLIENT'S OWN `dt`. The host
  //   broadcast the banner TEXT -- `{type:'banner',text:'2'}` -- not a time. Two
  //   browsers therefore counted down independently and each started the moment
  //   its own accumulation reached zero. A throttled tab drifted and nothing
  //   noticed.
  //
  //   AND NOBODY WAITED FOR ANYBODY. A friend on a slow machine arrived into a
  //   race already running.
  //
  // Now: the loader opens FIRST, the work happens behind it in named steps, the
  // client reports ready only when it could genuinely enter the race, and the
  // start instant comes from the server.
  //
  // WHAT IS AND IS NOT SERVER-AUTHORITATIVE. The race is PeerJS, browser to
  // browser, and stays that way -- positions, inputs and eliminations never go
  // near the server. The one thing peers cannot settle honestly among
  // themselves is WHEN to start, so that alone is the server's: it owns the
  // roster, the readiness set and `raceStartAt`. See server/scramble/match.js.

  // Ten seconds once real players are involved. Solo has nobody to wait for, so
  // making a single-player race sit through ten seconds of dead air on a course
  // that is already built would be a regression -- it keeps the short beat. The
  // MECHANISM is identical either way: one timestamp, read every frame. Only
  // where the timestamp comes from differs.
  const PM_COUNTDOWN_MS = 10000;
  const PM_SOLO_MS      = 3000;
  const PM_SYNC_TRIES   = 4;      // clock samples; the lowest round trip wins
  const PM_JOIN_MS      = 4000;   // how long to wait on the server before going it alone
  const PM_MAX_LATE_S   = 1.5;    // the most of a race a late first frame may inherit

  // ---- the clock ---------------------------------------------------------
  // One offset, estimated the way NTP does it: ask several times and keep the
  // sample with the smallest round trip, because that is the one least distorted
  // by a queue in either direction.
  const pmClock = { offset: 0, rtt: Infinity, synced: false };
  const pmServerNow = ()=> performance.now() + pmClock.offset;

  // ---- state -------------------------------------------------------------
  // `startAt` is always in LOCAL performance.now() terms, whatever authority
  // produced it, so exactly one clock drives the countdown, the movement lock
  // and the race timer. The spec's "avoid separate clocks for UI and gameplay"
  // is not a convention here -- there is only ever one number.
  const pm = {
    open:false, phase:'idle', authority:'local',
    round:1, map:null, matchId:null, startAt:null,
    ready:false, shown:null, survivors:null, retryable:false,
    flags:{ profileReady:false, mapReady:false, sceneReady:false, racerReady:false, sessionReady:false },
  };

  // THE ONE CLOCK the pre-match reads. performance.now() is monotonic and
  // unaffected by a system clock change, which is what the start instant has to
  // be measured against. The check harness steps a simulated clock of its own
  // and passes it in to pmTick; nothing else ever does.
  const pmNow = ()=> performance.now();

  const pmAllReady = ()=> Object.values(pm.flags).every(Boolean);
  const pmFrame = ()=> (typeof bootFrame==='function') ? bootFrame()
                     : new Promise(r=>{ requestAnimationFrame(()=>r()); setTimeout(r,400); });

  // ---- the socket --------------------------------------------------------
  // The SAME origin that served the page, so the session cookie rides along and
  // the server knows who this is without a ticket. socket.io is loaded from
  // /socket.io/socket.io.js, which is first-party; when it is absent -- a file://
  // open, a static harness -- `io` is simply undefined and everything below
  // falls back to local authority rather than failing.
  let pmSock = null;
  function pmSocket(){
    if(pmSock !== null) return pmSock || null;
    if(typeof io !== 'function'){ pmSock = false; return null; }
    try{
      pmSock = io({ withCredentials:true });
      pmSock.on('sr:state', (s)=> pmOnState(s));
    }catch(e){ pmSock = false; return null; }
    return pmSock;
  }

  function pmAsk(sock, ev, payload, ms){
    return new Promise((resolve)=>{
      let done = false;
      const fin = (v)=>{ if(!done){ done = true; resolve(v); } };
      try{ sock.emit(ev, payload, fin); }catch(e){ return fin(null); }
      setTimeout(()=>fin(null), ms || 3000);
    });
  }

  async function pmSyncClock(sock){
    for(let i=0;i<PM_SYNC_TRIES;i++){
      const t0 = performance.now();
      // eslint-disable-next-line no-await-in-loop
      const r = await pmAsk(sock, 'sr:time', {}, 2000);
      const t1 = performance.now();
      if(!r || typeof r.serverNow !== 'number') continue;
      const rtt = t1 - t0;
      if(rtt < pmClock.rtt){
        pmClock.rtt = rtt;
        // At local t1 the server's clock reads about serverNow + rtt/2, because
        // it stamped the reply halfway through the trip.
        pmClock.offset = (r.serverNow + rtt/2) - t1;
        pmClock.synced = true;
      }
    }
    return pmClock.synced;
  }

  // ---- the screen --------------------------------------------------------
  // Every text node it will ever show is already in the markup, so this only
  // ever sets textContent. Six message changes in ten seconds must not move a
  // single pixel of anything else, and the countdown number lives in a
  // fixed-width box so 10 -> 9 shifts nothing.
  const pmEl = (id)=> (typeof $==='function' ? $(id) : document.getElementById(id));
  function pmSay(msg, note){
    const m = pmEl('mlMsg'); if(m && msg != null) m.textContent = msg;
    const n = pmEl('mlNote'); if(n) n.textContent = note || '';
  }
  function pmMeter(done, total){
    const b = pmEl('mlBar');
    if(b) b.style.width = Math.max(0, Math.min(1, total ? done/total : 0)) * 100 + '%';
  }

  function pmShowMap(map, round){
    if(!map) return;
    const nm = pmEl('mlName'); if(nm) nm.textContent = String(map.name || '').toUpperCase();
    const md = pmEl('mlMode');
    if(md){
      md.textContent = map.isMinigame ? 'SURVIVAL' : 'RACE';
      md.classList.toggle('survival', !!map.isMinigame);
    }
    const rd = pmEl('mlRound');
    if(rd) rd.textContent = (typeof roundLabel==='function') ? roundLabel(round) : ('ROUND ' + round);
    const tip = pmEl('mlTip'); if(tip) tip.textContent = map.tip || '';
    // cardArt is the reveal carousel's own art source -- the rendered course
    // thumbnail where one exists, the map's own gradient where it does not. Same
    // call, so the loader and the carousel can never disagree about what a
    // course looks like, and no new art is shipped for this.
    const art = pmEl('mlArt');
    if(art && typeof cardArt === 'function') art.setAttribute('style', cardArt(map));
  }

  function pmOpen(round){
    pm.open = true; pm.phase = 'preparing'; pm.startAt = null; pm.ready = false;
    pm.round = round; pm.matchId = null; pm.shown = null; pm.retryable = true;
    for(const k of Object.keys(pm.flags)) pm.flags[k] = false;
    const box = pmEl('matchLoader');
    if(box){
      box.classList.remove('hidden');
      box.classList.remove('counting');
    }
    const f = pmEl('mlFail'); if(f) f.classList.add('hidden');
    const c = pmEl('mlCount'); if(c) c.classList.add('hidden');
    const s = pmEl('mlSpin'); if(s) s.style.display = '';
    const nm = pmEl('mlName'); if(nm) nm.textContent = '';
    const art = pmEl('mlArt'); if(art) art.setAttribute('style', '');
    pmSay('CREATING MATCH…', '');
    pmMeter(0, 1);
    // Exactly one foreground state. The loader sits over everything, and
    // everything under it is closed rather than merely covered -- a hidden
    // full-screen layer keeps its box and goes on eating clicks, which is the
    // fault the startup loader had to be removed rather than hidden to fix.
    if(typeof hideMenuScreens === 'function') hideMenuScreens();
    // hideMenuScreens covers the META screens, and these are not in that list --
    // but a round starts from them: CONTINUE is on the results screen and a
    // multiplayer round begins in the lobby. Left up, they would sit live
    // underneath a full-screen layer, which is the exact shape of the
    // daily-spin fault one layer below this one.
    for(const id of ['results','gameover','lobby','pause','mapLoader','mapIntro']){
      const e = pmEl(id); if(e) e.classList.add('hidden');
    }
    if(typeof syncMenuChrome === 'function') syncMenuChrome();
    const back = pmEl('mlBack');
    if(back) back.onclick = ()=>{ try{ SFX.click(); }catch(e){} pmBail(); };
  }

  function pmClose(){
    pm.open = false;
    // RACE is handed back the moment there is no match being prepared -- on the
    // start instant, on BACK, and on a failure. One place, so it cannot be left
    // dead on a path somebody forgot.
    const go = pmEl('modeGo'); if(go) go.disabled = false;
    const box = pmEl('matchLoader');
    if(box){ box.classList.add('hidden'); box.classList.remove('counting'); }
    const c = pmEl('mlCount'); if(c) c.classList.add('hidden');
  }

  // ---- server state ------------------------------------------------------
  function pmOnState(s){
    if(!s || !pm.open) return;
    pm.server = s;
    if(s.phase === 'gone' && pm.phase !== 'countdown'){
      pmFail('The match is no longer there.');
      return;
    }
    if(pm.phase === 'waiting' || pm.phase === 'preparing'){
      const note = (s.requiredCount > 1)
        ? `${s.readyCount} / ${s.requiredCount} READY`
        : '';
      if(pm.phase === 'waiting') pmSay(s.readyCount >= s.requiredCount ? 'EVERYONE READY' : 'WAITING FOR PLAYERS…', note);
    }
    if(s.phase === 'countdown' && typeof s.raceStartAt === 'number' && pm.phase !== 'countdown'){
      // The server's instant, brought into this page's clock ONCE. From here on
      // the countdown reads a local timestamp every frame; nothing decrements.
      pmStartCountdown(s.raceStartAt - pmClock.offset, 'server');
    }
  }

  function pmStartCountdown(localStartAt, authority){
    pm.phase = 'countdown';
    pm.authority = authority;
    pm.startAt = localStartAt;
    pm.shown = null;
    // THE DEGRADED PATH. No coordinator, but there are peers: the host's clock
    // is the next best authority, and it is the one the game already
    // synchronises obstacles against through mp.tOffset. What goes on the wire
    // is the INSTANT, not a word -- so a client converts a number rather than
    // reacting to "GO" whenever its own timer happens to fire.
    if(authority === 'local' && mp.role === 'host' && mp.conns.length){
      try{ broadcast({ type:'raceStart', hostAt: localStartAt/1000 + mp.tOffset }); }catch(e){}
    }
    const box = pmEl('matchLoader'); if(box) box.classList.add('counting');
    const s = pmEl('mlSpin'); if(s) s.style.display = 'none';
    pmSay('ALL RACERS READY', '');
    pmMeter(1, 1);
    const c = pmEl('mlCount'); if(c) c.classList.remove('hidden');
  }

  // ---- the frame tick ----------------------------------------------------
  // THE NUMBER IS DERIVED, NEVER DECREMENTED. A throttled tab, a long frame or
  // a skipped timer cannot make this drift, because nothing here remembers what
  // it said last except to avoid repainting the same glyph.
  function pmTick(now){
    if(!pm.open || pm.phase !== 'countdown' || pm.startAt == null) return;
    const t = (typeof now === 'number') ? now : pmNow();
    const remain = pm.startAt - t;
    if(remain <= 0){ pmGo(t); return; }
    const n = Math.max(1, Math.ceil(remain / 1000));
    if(n === pm.shown) return;
    pm.shown = n;
    const el = pmEl('mlCountNum'); if(el) el.textContent = String(n);
    const box = pmEl('mlCount');
    if(box){ box.classList.remove('pulse'); void box.offsetWidth; box.classList.add('pulse'); }
    // 10 down to 4 is silent; the last three are the ones worth hearing.
    if(n <= 3){ try{ SFX.count(); }catch(e){} }
  }

  // THE RACE STARTS ON THE TIMESTAMP. Not when an animation ended, not when the
  // DOM reached zero -- the same instant enables movement, starts the race timer
  // and opens finish timing, and it is the instant every other client was given.
  function pmGo(now){
    // HOW FAR INTO THE RACE THIS FRAME ACTUALLY IS. A frame landing 40ms after
    // the instant is 40ms into the race, and saying so is what stops a slow
    // client quietly awarding itself a head start.
    //
    // Capped, and the cap is not cosmetic. `now` and `pm.startAt` can come from
    // different clocks -- the shipped loop passes performance.now(), the check
    // harness passes its own much faster one -- and an unbounded difference put
    // raceTime hundreds of seconds in, so the round ended before it began and
    // half the suite measured a race that was already over. Beyond the cap the
    // honest answer is the start line: a client that far behind has a bigger
    // problem than its timer, and positions come from the host regardless.
    const t = (typeof now === 'number') ? now : pmNow();
    const late = Math.min(PM_MAX_LATE_S, Math.max(0, t - pm.startAt) / 1000);
    pm.phase = 'racing';
    pmClose();
    if(typeof $ === 'function'){
      $('hud').classList.remove('hidden');
      if(settings && settings.touch !== undefined) $('touchControls').classList.toggle('hidden', !settings.touch);
      $('pauseBtn').classList.remove('hidden');
    }
    // Measured from the authoritative instant, not from this frame. A client
    // whose frame lands 40ms after the start is 40ms into the race, and its
    // clock says so rather than quietly giving it a 40ms head start.
    raceTime = late;
    state = 'racing';
    // ON the instant, not blending towards it. The camera spends the
    // preparation on a flyover of the course; the race may not begin with it
    // still travelling in from somewhere else, so it is put exactly where the
    // race wants it as the race starts.
    if(typeof syncCamera === 'function') syncCamera(true);
    if(typeof showBanner === 'function') showBanner('GO!', 600);
    try{ SFX.go(); }catch(e){}
  }

  // ---- failure -----------------------------------------------------------
  function pmFail(msg){
    pm.phase = 'error';
    const box = pmEl('mlFail'); if(!box) return;
    const m = pmEl('mlFailMsg'); if(m) m.textContent = msg;
    const s = pmEl('mlSpin'); if(s) s.style.display = 'none';
    pmSay('FAILED TO PREPARE MATCH', '');
    box.classList.remove('hidden');
    const r = pmEl('mlRetry');
    if(r) r.onclick = ()=>{ try{ SFX.click(); }catch(e){} box.classList.add('hidden'); prepareRound(pm.round, pm.survivors); };
    const b = pmEl('mlBail');
    if(b) b.onclick = ()=>{ try{ SFX.click(); }catch(e){} pmBail(); };
  }

  function pmBail(){
    pmClose();
    pm.phase = 'idle';
    if(pmSock) { try{ pmSock.emit('sr:leave'); }catch(e){} }
    if(typeof goHome === 'function') goHome();
  }

  // ---- joining -----------------------------------------------------------
  // Solo never touches the network. A single-player race that could be blocked
  // by a socket would be a worse game than the one this replaces.
  function pmSolo(){ return !mp || !mp.role; }

  async function pmJoin(){
    if(pmSolo()){ pm.flags.sessionReady = true; return 'local'; }
    const sock = pmSocket();
    if(!sock){ pm.flags.sessionReady = true; return 'peer'; }

    await pmSyncClock(sock);
    // One match per ROUND, so round two re-gathers and nobody carries a ready
    // flag across from a course that no longer exists.
    const code = `${String(mp.code || 'SOLO')}-R${pm.round}`;
    // Only the host knows how many friends are actually in its lobby, because
    // only the host holds the peer connections. It declares that; the server
    // decides everything else. The declaration can only ever make the match
    // wait LONGER, never start sooner.
    const expect = (mp.role === 'host') ? (mp.conns.filter(c=>c.open).length + 1) : undefined;
    const r = await pmAsk(sock, 'sr:join', { code, expect }, PM_JOIN_MS);
    if(!r || r.error || !r.matchId){
      // The server is unreachable or refused. Rather than hanging the race on
      // it, fall back to the PeerJS host's clock -- the authority the game had
      // before this -- and say so in the note.
      pm.note = 'Offline sync';
      pm.flags.sessionReady = true;
      return 'peer';
    }
    pm.matchId = r.matchId;
    pm.flags.sessionReady = true;
    if(r.state) pmOnState(r.state);
    return r.late ? 'late' : 'server';
  }

  // ---- reporting ready ---------------------------------------------------
  // READY IS REPORTED ONCE, AND ONLY WHEN EVERY FLAG IS TRUE. The client says
  // what it knows about itself; it never says the match is ready, and it cannot
  // say anything about anybody else -- the server reads the player off the
  // connection and ignores the payload entirely.
  function pmReport(){
    if(pm.ready || !pmAllReady()) return false;
    pm.ready = true;
    if(pm.authority === 'server' && pmSock){ try{ pmSock.emit('sr:ready', {}); }catch(e){} }
    return true;
  }

  async function pmAwaitStart(kind){
    if(kind === 'server'){
      pm.authority = 'server';
      pm.phase = 'waiting';
      pmSay('WAITING FOR PLAYERS…', '');
      pmReport();
      // From here the SERVER drives. pmOnState opens the countdown when it says
      // every required player is ready, and nothing local may start a race --
      // there is no local timer to race it.
      return;
    }

    if(kind === 'late'){
      // The countdown had already started when this client arrived, so the
      // roster is frozen and it is not part of this race's readiness set. If the
      // server handed over a start instant it is used; there is nothing to
      // report and nothing to wait for.
      pm.authority = 'server';
      if(pm.phase === 'countdown') return;
      pmStartCountdown(pmNow() + PM_COUNTDOWN_MS, 'local');
      return;
    }

    // No server: this client is its own authority. Solo -- which never asks the
    // network at all -- or a peer match whose socket could not be reached, where
    // hanging the race on an unreachable coordinator would be worse than
    // starting on the clock the game used before this.
    pm.authority = 'local';
    pmReport();
    pmStartCountdown(pmNow() + (pmSolo() ? PM_SOLO_MS : PM_COUNTDOWN_MS), 'local');
  }

  // The host's instant, in host seconds, converted through the offset the game
  // already maintains. Ignored once this client is counting down or racing: a
  // late message must never move a start that is already promised.
  function pmOnPeerStart(hostAtSec){
    if(!pm.open || pm.phase === 'countdown' || pm.phase === 'racing') return;
    if(typeof hostAtSec !== 'number') return;
    pmStartCountdown((hostAtSec - mp.tOffset) * 1000, 'peer');
  }

  // ---- the client's side of the same flow --------------------------------
  // A PeerJS client does not draw a map or generate a course -- the host sends
  // both -- but it has exactly the same reason to wait: its meshes are not built
  // yet. Reporting ready before they are is how a friend used to arrive into a
  // race that had already started.
  async function pmClientRound(data){
    round = data.round;
    currentMap = data.mapDef || MAPS[0];
    pm.survivors = null;
    pmOpen(data.round);
    await pmFrame();
    try{
      pm.map = currentMap;
      pmShowMap(currentMap, data.round);
      pm.flags.profileReady = true;

      const TOTAL = 3;

      await pmStep('LOADING ' + String(currentMap.name).toUpperCase() + '…', 0, TOTAL, async ()=>{
        clearGroup(racerGroup); clearGroup(courseGroup); clearParticles(); racers=[];
        obstacles = data.obstacles; trackLength = data.trackLength;
        lavaZ = currentMap.mode==='lava' ? -320 : 0;
        mp.tOffset = data.hostT - performance.now()/1000;
        pm.flags.mapReady = true;
      });

      await pmStep('PREPARING RACERS…', 1, TOTAL, async ()=>{
        buildCourseMeshes(); applyMapSky();
        $('lobby').classList.add('hidden');
        courseGroup.visible=true; racerGroup.visible=true; previewGroup.visible=false;
        pm.flags.sceneReady = true;
        // The grid itself arrives from the host in the first state packet, so
        // there is nothing more for this client to build before it could race.
        pm.flags.racerReady = true;
      });

      $('roundBadge').textContent = (typeof roundLabel==='function') ? roundLabel(round) : ('ROUND ' + round);
      $('hud').classList.add('hidden');
      $('touchControls').classList.add('hidden');
      if(settings.hints) $('hint').classList.remove('hidden');
      if(round===1){ stats.races++; saveProfile(); if(typeof refreshStatsLine==='function') refreshStatsLine(); }

      state='prematch'; bannerTimer=0;

      let kind = 'local';
      await pmStep('SYNCING PLAYERS…', 2, TOTAL, async ()=>{ kind = await pmJoin(); });
      await pmAwaitStart(kind);
    }catch(e){
      pmFail('Could not prepare ' + ((currentMap && currentMap.name) || 'the course') + '.');
    }
  }
