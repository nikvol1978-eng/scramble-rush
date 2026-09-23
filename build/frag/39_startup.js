  // ============================================================
  // STARTUP  (v26 §1)
  // ============================================================
  // What this replaces: `updateHint(); goHome(); loadProfile();` and a boot
  // screen taken down on window.load. Two things were wrong with that.
  //
  //   loadProfile() WAS NEVER AWAITED. It is async -- it reads the profile off
  //   the Nikcade storage bridge -- so the lobby painted first and the coins,
  //   the level, the name and the equipped skin arrived afterwards, visibly.
  //
  //   THE LOBBY WAS ALREADY UP behind the boot screen, which came down on a
  //   load event that has nothing to do with whether the game can be played.
  //
  // Now: the loader stays up until the work is actually done, and the work is
  // real.
  //
  // AND THE HANDOFF IS TO THE LOBBY. v26 §1 sent the player straight to MODE
  // SELECT, on the argument that the first screen should be a question about
  // what to play rather than a screen about their bean. The player asked for
  // the opposite: land on the home page, with the mode picker one PLAY press
  // away as it is from everywhere else. So it is openLobbyTab('play') -- the
  // same route the PLAY pill and Mode Select's own BACK take.
  //
  // THE RULE FOR THE MINIMUM. Transition when `ready && elapsed >= minimum`.
  // Never on a timer alone -- a clock running out is not a reason to show
  // somebody a half-built screen -- and never a fixed sleep, which is the same
  // lie in the other direction. If the work outruns the minimum the minimum
  // costs nothing; if the work is slow the loader simply stays, and says so.
  const BOOT_MIN_MS   = 5000;   // the floor, not the target
  const BOOT_HOLD_MS  = 450;    // READY is a beat, not a pause
  const BOOT_FADE_MS  = 420;    // matches the CSS transition on #bootScreen
  const BOOT_SLOW_MS  = 9000;   // after this, a stage owes the player a word

  // The markup, captured before anything can touch it. RETRY re-mounts from
  // this rather than trying to unpick whatever state the failure left behind:
  // a clean slate is one line and cannot be half-right.
  const BOOT_HTML = (function(){
    const b = document.getElementById('bootScreen');
    return b ? b.outerHTML : '';
  })();

  // THE FIRST SEQUENCE, AS SOMETHING TO WAIT ON.
  // Booting now takes about five seconds and moves the page underneath anyone
  // who starts work before it finishes. The check suite did exactly that: it
  // began the moment window.__checks existed, so ["] found the locker's tabs
  // covered by div.bootStage -- the real loader, still up -- and [-] watched
  // the real handoff open MODE SELECT in the middle of one of its own
  // scenarios. Both were true reports about a page that was still booting.
  // __checks.run waits on this before anything runs. It settles on the failure
  // path too, or a required gate that throws would hang every waiter.
  let bootSettle;
  const bootDone = new Promise(r => { bootSettle = r; });
  const bootWait = (ms)=> new Promise(r => setTimeout(r, ms));
  function bootSay(msg, note){
    const m = $('bootMsg'); if(m) m.textContent = msg;
    const n = $('bootNote'); if(n) n.textContent = note || '';
  }
  function bootMeter(done, total){
    const bar = $('bootBar');
    if(bar) bar.style.width = Math.max(0, Math.min(1, done/total)) * 100 + '%';
  }

  // ---- the gates ---------------------------------------------------------
  // Each one waits on something that is really happening. None of them invents
  // work to fill the minimum: if they all finish in 900ms then they finish in
  // 900ms, and the minimum -- not the gates -- is what holds the screen.
  //
  // `required` is the difference between "the game cannot start" and "this bit
  // is nice to have". loadProfile already swallows its own errors and plays
  // unsaved, which is the fallback the app has always had, so the required set
  // is small on purpose: fonts and cosmetics failing must not strand anyone.
  function startupGates(){
    return [
      { msg:'Connecting…', required:true, run: async ()=>{
          // Everything the page pulls from a CDN -- three.js, PeerJS -- has
          // either landed or failed by the load event. The renderer is the one
          // that decides whether there is a game at all.
          if(document.readyState !== 'complete'){
            await new Promise(r => window.addEventListener('load', r, { once:true }));
          }
          if(typeof renderer === 'undefined' || !renderer) throw new Error('no renderer');
        } },
      { msg:'Loading profile…', required:true, run: ()=> loadProfile() },
      { msg:'Preparing racer…', required:true, run: async ()=>{
          // Builds the lobby podium and the bean standing on it: procedural
          // geometry, and the first thing that asks the skin cache for
          // anything. Then one real frame, so the cost is paid here and not on
          // the first frame the player sees.
          refreshPreview();
          await bootFrame();
        } },
      { msg:'Loading cosmetics…', required:false, run: async ()=>{
          // The skin cache is cold once per page and its misses are not free:
          // a cold cache rolls fresh material parameters per racer. Warming
          // what the player actually owns means the locker, the shop and the
          // first grid of twenty-four open against a warm one.
          const skins = [...ownedSkins()], pats = [...ownedPatterns()];
          const eq = skinOf(custom.skin), eqP = patternOf(custom.pattern);
          makeSkinMaterials(eq, eqP);
          // Yield between batches. This is the one gate that could hold the
          // main thread long enough to stutter the spinner, and a loading
          // screen that janks is worse than one that takes another 80ms.
          for(let i=0;i<skins.length;i+=6){
            for(const id of skins.slice(i,i+6)) skinTexture(skinOf(id), eqP);
            await bootFrame();
          }
          for(const id of pats.slice(0,12)) skinTexture(eq, patternOf(id));
        } },
      { msg:'Preparing game…', required:false, run: async ()=>{
          // Fredoka decides the width of every label on every screen behind
          // this one. Handing over before it lands means the lobby's labels
          // reflow in front of the player. (Mode Select is not built here any
          // more: openModeSelect rebuilds its grid every time it opens, so
          // building it for a boot that does not show it was work thrown away.)
          if(document.fonts && document.fonts.ready) await document.fonts.ready;
          refreshLobby(); refreshCoinChips(); refreshDailyChip();
          await bootFrame();
        } },
    ];
  }

  // A REAL PAINTED FRAME, OR 400ms, WHICHEVER ARRIVES FIRST.
  //
  // requestAnimationFrame does not fire AT ALL in a hidden tab, and opening
  // the game and glancing at something else for a moment is not unusual. A
  // frame that is never going to come is not something to wait for.
  //
  // Found in production, not here: headless pages count as visible, so every
  // local run had frames. On nikcade with the window behind another one, the
  // loader stalled on "Preparing racer" -- and worse, the HANDOFF stalled,
  // between openModeSelect() and taking the loader down. That left the mode
  // picker live underneath a full-screen sheet at z-index 200 that was still
  // eating every click on it. elementFromPoint over MODE SELECT's own buttons
  // returned the loader.
  //
  // The timeout is not a substitute for a frame. It is what happens when there
  // are going to be none.
  function bootFrame(){
    return new Promise(r => {
      let done = false;
      const fin = ()=>{ if(!done){ done = true; r(); } };
      requestAnimationFrame(()=> requestAnimationFrame(fin));
      setTimeout(fin, 400);
    });
  }

  // ---- failure -----------------------------------------------------------
  // A required gate that throws stops the sequence where it is. The player is
  // told which part failed and given the two things worth offering: try again,
  // or leave. What they are never given is the game behind a broken screen.
  function bootFail(msg, retry){
    const box = $('bootFail'); if(!box) return;
    const m = $('bootFailMsg'); if(m) m.textContent = msg;
    const spin = $('bootSpin'); if(spin) spin.style.display = 'none';
    bootSay('Startup failed', '');
    // The bar's own Back to Nikcade goes away with this class. The panel below
    // carries that choice now, and two identical buttons on one screen four
    // inches apart is a worse answer than one.
    { const scr = $('bootScreen'); if(scr) scr.classList.add('failed'); }
    box.classList.remove('hidden');
    const r = $('bootRetry'); if(r) r.onclick = retry;
    const h = $('bootFailHome'); if(h) h.onclick = bootGoNikcade;
  }
  function bootGoNikcade(){ window.location.assign('/'); }

  // ---- the handoff -------------------------------------------------------
  // SWITCH FIRST, THEN FADE. openLobbyTab('play') goes through backToLobby,
  // which rebuilds the character preview, and that is not cheap: measured at 1.8s on
  // a software renderer. Fading the loader out first and opening the screen
  // afterwards left the player looking at a bare canvas for the whole of it --
  // no loader, no screen, just the 3D background. So the screen is put up
  // behind the loader, given a frame to paint, and only then is the loader
  // faded off it. What the fade reveals is a screen that is already finished.
  //
  // And the loader is REMOVED, not hidden. A hidden full-screen layer keeps
  // its box and goes on eating clicks, and this one sits at z-index 200 over
  // every screen in the game -- the daily-spin fault, one layer up.
  async function bootHandoff(){
    openLobbyTab('play');
    await bootFrame();
    const b = $('bootScreen');
    if(b){
      b.classList.add('gone');
      await bootWait(BOOT_FADE_MS);
      if(b.parentNode) b.parentNode.removeChild(b);
    }
  }

  // ---- the sequence ------------------------------------------------------
  // minMs and gates are arguments so that the timing rule can be tested
  // against a fast gate, a slow one and a failing one without waiting five
  // real seconds a time. The defaults are the real ones and the path through
  // this function is identical either way -- nothing here is a test branch.
  async function startupSequence(opts){
    opts = opts || {};
    const minMs = opts.minMs != null ? opts.minMs : BOOT_MIN_MS;
    const hold  = opts.holdMs != null ? opts.holdMs : BOOT_HOLD_MS;
    const gates = opts.gates || startupGates();
    const slow  = opts.slowMs != null ? opts.slowMs : BOOT_SLOW_MS;
    // THE CLOCK STARTS AT NAVIGATION, not here. performance.now() is already
    // measured from there, so the default t0 of 0 makes `elapsed` the thing the
    // player actually experiences: how long they have been looking at this.
    // Starting it here instead would have added the 3.5 seconds the module
    // spends parsing and building the scene ON TOP of the five-second floor,
    // and a nine-second boot is not what "approximately five" means. The tests
    // pass their own t0 to get a clock they can move.
    const t0 = opts.t0 != null ? opts.t0 : 0;

    // Nothing but the loader is live while it is up. goHome() has already put
    // the lobby together behind us; this closes it and everything else, so the
    // handoff opens onto an empty stage rather than on top of one.
    state = 'menu';
    hideMenuScreens();
    syncMenuChrome();
    { const h = $('bootHome'); if(h) h.onclick = bootGoNikcade; }

    // v26 §1: where REAL PREPARATION starts. Everything from here to
    // 'boot:gates:end' is the game genuinely getting ready; the wait after it
    // is the floor. SRPERF keeps them apart -- see frag/26a_perf.js.
    SRPERF.mark('boot:gates:start');

    for(let i = 0; i < gates.length; i++){
      const g = gates[i];
      // Per gate, so a slow startup can be blamed on the stage that was slow
      // rather than on "startup". The name is the message the player was
      // looking at while it ran.
      SRPERF.mark('gate:' + i + ':start:' + g.msg.replace(/…$/, ''));
      bootSay(g.msg, '');
      bootMeter(i, gates.length + 1);
      // The note is the answer to "am I stuck?". It never transitions anything
      // -- it only stops the screen from saying the same four words forever.
      const nag = setTimeout(()=>{
        const n = $('bootNote');
        if(n) n.textContent = 'Still working — this is taking longer than usual.';
      }, slow);
      try {
        await g.run();
      } catch(e) {
        clearTimeout(nag);
        if(g.required){
          bootFail(g.fail || ('Unable to finish: ' + g.msg.replace(/…$/, '') + '.'),
                   ()=>{ bootRemount(); startupSequence(opts); });
          bootSettle(false);
          return false;
        }
        // Not required: the app has a fallback for this, so take it and say
        // nothing. Pretending a cosmetic warm-up is fatal would be the worst
        // of both -- a blocked player and an intact game behind the block.
      }
      clearTimeout(nag);
      SRPERF.mark('gate:' + i + ':end');
      bootMeter(i + 1, gates.length + 1);
    }

    // v26 §1: the work is finished HERE. Anything after this is presentation.
    SRPERF.mark('boot:gates:end');

    bootSay('Ready!', '');
    bootMeter(1, 1);
    // THE RULE, in one line: the work is done, so the only thing left to wait
    // for is the floor -- and READY is held long enough to be read either way.
    await bootWait(Math.max(hold, minMs - (performance.now() - t0)));
    SRPERF.mark('boot:floor:waited');
    await bootHandoff();
    // Mode Select is on the screen and the loader is gone. This is the number
    // a player would call "how long the loading screen lasted", and it is the
    // one that must never be quoted as how long the game took to get ready.
    SRPERF.mark('boot:handoff:end');
    bootSettle(true);
    return true;
  }

  // Put a pristine loader back at the top of the body. Used by RETRY, and by
  // the startup checks, which need to run the sequence more than once.
  // EVERY existing one goes, not the first: two loaders in the document is a
  // state nothing should be able to reach, so it is also a state nothing
  // should be able to leave behind.
  function bootRemount(){
    for(const old of [...document.querySelectorAll('#bootScreen')]){
      if(old.parentNode) old.parentNode.removeChild(old);
    }
    if(!BOOT_HTML) return null;
    document.body.insertAdjacentHTML('afterbegin', BOOT_HTML);
    const b = $('bootScreen');
    const h = $('bootHome'); if(h) h.onclick = bootGoNikcade;
    return b;
  }
