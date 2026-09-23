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
  const PM_SYNC_TRIES   = 3;      // clock samples; the lowest round trip wins
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
    ready:false, shown:null, survivors:null, retryable:false, timer:null,
    // The step being run and what went wrong in it -- diagnostics only, and
    // nothing anywhere decides on either. `frame` is the host's roundStart as
    // it arrived, kept so that a joiner's RETRY can run THAT course again
    // rather than generate one of its own.
    stage:null, error:null, frame:null,
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
    pm.stage = null; pm.error = null; pm.frame = null;
    for(const k of Object.keys(pm.flags)) pm.flags[k] = false;
    const box = pmEl('matchLoader');
    if(box){
      box.classList.remove('hidden');
      box.classList.remove('counting');
      box.classList.remove('failed');
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
    if(pm.timer){ clearInterval(pm.timer); pm.timer = null; }
    // RACE is handed back the moment there is no match being prepared -- on the
    // start instant, on BACK, and on a failure. One place, so it cannot be left
    // dead on a path somebody forgot.
    const go = pmEl('modeGo'); if(go) go.disabled = false;
    const box = pmEl('matchLoader');
    if(box){ box.classList.add('hidden'); box.classList.remove('counting'); box.classList.remove('failed'); }
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
      //
      // TWO WAYS TO CROSS THE CLOCKS, and the second is not a nicety. The
      // offset is the better one -- it is an estimate built from several round
      // trips and it stays right as the countdown runs. But it is only
      // meaningful once a sample has come back, and `sr:state` can arrive
      // before that: the server pushes state on its own tick, not in reply to
      // anything this client did. Converting with an unset offset subtracts
      // nothing from an epoch millisecond and asks the player to wait about
      // fifty-five years.
      //
      // So when there is no estimate yet, the REMAINING time is taken straight
      // out of the message -- every state carries serverNow beside raceStartAt
      // precisely so the difference can be read without a shared clock. The
      // only error left is the one-way trip, which is milliseconds.
      const local = pmClock.synced
        ? (s.raceStartAt - pmClock.offset)
        : pmNow() + Math.max(0, s.raceStartAt - (typeof s.serverNow === 'number' ? s.serverNow : s.raceStartAt));
      pmStartCountdown(local, 'server');
    }
  }

  function pmStartCountdown(localStartAt, authority){
    pm.phase = 'countdown';
    pm.authority = authority;
    pm.startAt = localStartAt;
    pm.shown = null;

    // THE RACE MUST START IN A TAB NOBODY IS LOOKING AT.
    //
    // pmTick is driven from the main loop, and the main loop is
    // requestAnimationFrame. rAF does not fire AT ALL in a hidden tab -- not
    // slowly, not at all -- so a player who glances at another tab during the
    // countdown never reaches the start instant. In multiplayer everyone else
    // starts on the server's timestamp and that client sits on the loader
    // forever: the dead-client case this feature exists to prevent, except it
    // is the client itself that is stuck.
    //
    // Found in production, not here: a headless page counts as visible, so
    // every local run had frames. On nikcade with the window behind another
    // one, document.hidden was true, no frame ever came, and the countdown
    // stayed on its opening number indefinitely.
    //
    // setInterval IS throttled in a background tab -- to about once a second --
    // but it still fires, and that is the whole difference. The number is
    // derived from the timestamp rather than counted, so a coarse tick costs
    // nothing: the moment the tab comes forward rAF resumes and the display is
    // instantly right again. The same lesson bootFrame learned, one layer up.
    if(pm.timer) clearInterval(pm.timer);
    pm.timer = setInterval(()=>{ try{ pmTick(); }catch(e){} }, 250);

    // ...and say the right number NOW rather than on the first frame. The box
    // ships with a placeholder in it, and until something wrote over it the
    // screen showed that placeholder -- a flash of "10" in front of a solo
    // three-count, and in a hidden tab the only number ever displayed.
    pmTick(pmNow());
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
    pmClose();                                  // also stops the countdown timer
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
    // ONE WAY BACK, NOT TWO. The bar keeps its button for every other state; in
    // this one the panel owns that choice, and without this class the screen
    // offered BACK twice -- once in the panel and once in the bar four inches
    // below it. The startup loader carries the same class for the same reason,
    // and the rule in 04b_ui25.css is shared between them.
    { const scr = pmEl('matchLoader'); if(scr) scr.classList.add('failed'); }
    box.classList.remove('hidden');
    const r = pmEl('mlRetry');
    if(r) r.onclick = ()=>{ try{ SFX.click(); }catch(e){} box.classList.add('hidden'); pmRetry(); };
    const b = pmEl('mlBail');
    if(b) b.onclick = ()=>{ try{ SFX.click(); }catch(e){} pmBail(); };
  }

  // RETRY MEANS THE SAME COURSE, NOT ANOTHER ONE.
  //
  // On a joiner this button used to call prepareRound -- the HOST's path. That
  // runs genCourse, so the client built a course of its OWN: the right map,
  // because the host drew it, and a layout nobody else in the room had. It
  // then reported ready on it and raced a track its friends could not see, and
  // nothing anywhere said so. A retry that quietly desynchronises the match is
  // worse than the failure it is recovering from.
  //
  // The host's frame is immutable and already in hand, so the honest retry on
  // a joiner is to run that frame again. Re-running it is safe precisely
  // because it carries no state of its own: the same obstacles, the same
  // length, the same map.
  function pmRetry(){
    if(mp && mp.role === 'client'){
      if(pm.frame) pmClientRound(pm.frame);
      else pmFail('The course never arrived. Ask your friend to start the round again.');
      return;
    }
    prepareRound(pm.round, pm.survivors);
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

    // One match per ROUND, so round two re-gathers and nobody carries a ready
    // flag across from a course that no longer exists.
    const code = `${String(mp.code || 'SOLO')}-R${pm.round}`;
    // Only the host knows how many friends are actually in its lobby, because
    // only the host holds the peer connections. It declares that; the server
    // decides everything else. The declaration can only ever make the match
    // wait LONGER, never start sooner.
    const expect = (mp.role === 'host') ? (mp.conns.filter(c=>c.open).length + 1) : undefined;
    // BOTH AT ONCE. These do not depend on each other, and run one after the
    // other they put the sum of two round trips in front of every race --
    // measured at about seven seconds of "SYNCING PLAYERS" on production's
    // polling transport, on top of the ten the countdown already asks for.
    const [r] = await Promise.all([
      pmAsk(sock, 'sr:join', { code, expect }, PM_JOIN_MS),
      pmSyncClock(sock),
    ]);
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

  // ---- one step of the joiner's preparation ------------------------------
  // The host runs its list in prepareRound; this is the same beat for the
  // client's shorter one -- say what is about to happen, give the screen a
  // frame to paint it, do the work, then move the meter.
  //
  // IT WAS CALLED AND NEVER WRITTEN. Three `await pmStep(...)` shipped against
  // a name nothing defined, so the joiner's very first step threw
  // ReferenceError before it had done anything at all and the catch below
  // reported that as a course that could not be prepared. A joining friend
  // therefore never reached pmJoin and never sent one byte of readiness --
  // four production attempts in five, with the same failure on every map and
  // at every CPU speed, because it was never about the payload or the timing.
  //
  // Nothing in the check suite had ever run this path: every other pre-match
  // check drives prepareRoundNow, which is the HOST's. [{] runs this one.
  //
  // The step's name is kept on `pm` so a failure can say WHERE it happened,
  // which is the difference between the sentence the player reads and a report
  // somebody can act on.
  async function pmStep(msg, i, total, run){
    pm.stage = msg;
    pmSay(msg, '');
    pmMeter(i, total + 1);
    await pmFrame();                             // let the screen show what it said
    await run();
    pmMeter(i + 1, total + 1);
  }

  // ---- what failed, not merely that it did -------------------------------
  // The player keeps the friendly sentence. This is its other half, and its
  // absence is why a day of production failures could only be described as
  // "Could not prepare <map>." -- the catch did not even bind the exception.
  //
  // NOTHING HERE IS ABOUT THE PLAYER: no name, no id, no profile, no room
  // code. The map, the step, the SHAPE of the host's frame, and the exception.
  function pmDiag(e, data){
    const d = {
      stage:   pm.stage || 'before the first step',
      // The map being PREPARED, which on a joiner is the host's and not
      // whatever this client happened to have loaded -- a frame that fails
      // validation never reaches the line that would have made them the same.
      map:     (data && data.mapDef && data.mapDef.key) || (currentMap && currentMap.key) || null,
      round:   pm.round,
      message: (e && e.message) || String(e),
      // Four frames is enough to name the call and its caller; the whole trace
      // of a minified bundle is noise in a console the player may be reading.
      stack:   (e && e.stack) ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null,
      frame:   data ? {
        keys:        Object.keys(data).sort().join(','),
        obstacles:   Array.isArray(data.obstacles) ? data.obstacles.length : ('not an array: ' + typeof data.obstacles),
        trackLength: data.trackLength,
        map:         data.mapDef && data.mapDef.key,
      } : null,
    };
    pm.error = d;
    // SERIALISED, not handed over as an object. A console capture -- a
    // puppeteer run, a bug report pasted out of devtools, a remote session --
    // renders a logged object as "[object Object]", so the one line that
    // carries the answer arrives carrying nothing.
    try{ console.error('[scramble-rush] pre-match preparation failed: ' + JSON.stringify(d)); }catch(_){
      try{ console.error('[scramble-rush] pre-match preparation failed: ' + d.stage + ': ' + d.message); }catch(__){}
    }
    return d;
  }

  // ---- is this frame something a course can be built from? ---------------
  // Checked BEFORE any of it is used, and named when it is not. A missing
  // field used to surface as whatever the first line to touch it happened to
  // throw, three steps later and under the same one sentence as everything
  // else. `obstacles` may legitimately be empty -- an arena map has none --
  // so this asks for an ARRAY, not for a full one.
  function pmFrameFault(data){
    if(!data || typeof data !== 'object')       return 'no frame at all';
    if(!Array.isArray(data.obstacles))          return 'obstacles is ' + (data.obstacles === undefined ? 'missing' : 'a ' + typeof data.obstacles) + ', wanted an array';
    if(typeof data.trackLength !== 'number' || !(data.trackLength > 0))
                                                return 'trackLength is ' + data.trackLength;
    if(typeof data.round !== 'number')          return 'round is ' + data.round;
    if(typeof data.hostT !== 'number')          return 'hostT is ' + data.hostT;
    if(!data.mapDef || !data.mapDef.key)        return 'mapDef carries no key';
    return null;
  }

  // ---- the client's side of the same flow --------------------------------
  // A PeerJS client does not draw a map or generate a course -- the host sends
  // both -- but it has exactly the same reason to wait: its meshes are not built
  // yet. Reporting ready before they are is how a friend used to arrive into a
  // race that had already started.
  async function pmClientRound(data){
    // ONE PREPARATION AT A TIME, which the host has had since startRound and
    // the joiner had not. A duplicated or resent roundStart started a second
    // preparation over the top of the first: two async chains writing the same
    // readiness flags, and two sr:join emissions from one client. Ignoring a
    // resend of an immutable course payload is what makes that transmission
    // idempotent -- and the gate is synchronous, before any await, so there is
    // no window between the test and the claim.
    //
    // A FAILED preparation is deliberately not covered: that is the state
    // RETRY has to be able to leave.
    if(pm.open && pm.phase !== 'error') return;

    pm.survivors = null;
    pmOpen((data && data.round) || 1);
    // AFTER pmOpen, which clears it. Kept so RETRY can run this course again
    // rather than invent one; the frame is the host's and is never modified
    // here.
    pm.frame = data;
    await pmFrame();
    try{
      // CHECKED BEFORE ANY OF IT IS USED, and before one global of this
      // client's has been changed by it. A frame that cannot build a course
      // fails here by name, rather than three steps later as whatever the
      // first line to touch a missing field happened to throw -- and it does
      // not get to leave `round` and `currentMap` describing a course that was
      // never built.
      const fault = pmFrameFault(data);
      if(fault){
        pmDiag(new Error('host frame unusable: ' + fault), data);
        pmFail('The course your friend sent could not be read.');
        return;
      }

      round = data.round;
      currentMap = data.mapDef;
      pm.map = currentMap;
      pmShowMap(currentMap, data.round);
      pm.flags.profileReady = true;

      const TOTAL = 3;

      await pmStep('LOADING ' + String(currentMap.name).toUpperCase() + '…', 0, TOTAL, async ()=>{
        clearGroup(racerGroup); clearGroup(courseGroup); clearParticles(); racers=[];
        // the racers are dressed in their skins now (applyNetworkState), and
        // an animated skin registers its material; drop last round's with them
        animatedMats=[];
        obstacles = data.obstacles; trackLength = data.trackLength;
        // THE SAME WORLD, NOT JUST THE SAME OBSTACLES. The script is what
        // setCoursePath turns into the transform every mesh, every racer and
        // the camera are placed through, and only genCourse makes one -- which
        // a joiner never runs. Without this a joiner laid Boom Peak's climb
        // out flat and straight and had no idea it had: the sim is a flat
        // ribbon either way, so the two of them agreed about every coordinate
        // while drawing them in differently shaped worlds.
        //
        // This is also where the start pad and the checkpoint flags come from
        // -- buildCourseMeshes reads courseScript for both -- so a joiner was
        // missing those as well.
        //
        // The fallback matters: a host on an older build sends no script, and
        // the map's own path is a better answer than none.
        courseScript = data.courseScript || null;
        setCoursePath(courseScript ? scriptPathSpec(courseScript)
                                   : (currentMap.path ? COURSE_PATHS[currentMap.path] : null), trackLength);
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
      // The diagnosis first, then the sentence. The minified release had
      // `catch{}` here -- it did not so much as bind the exception -- so the
      // one thing that could have named this bug was discarded on the way to
      // telling the player something friendly.
      pmDiag(e, data);
      pmFail('Could not prepare ' + ((currentMap && currentMap.name) || 'the course') + '.');
    }
  }
