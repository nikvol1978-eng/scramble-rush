  // ============================================================
  // SPECTATOR
  // ============================================================
  // Being knocked out of a survival round used to mean watching your own faded
  // blob lie there. Now the camera moves to someone still in it and you can
  // switch between them, or bail straight into a new match.
  //
  // QUALIFYING COUNTS TOO. It used to be elimination only, so crossing the line
  // first -- the good outcome -- left you watching your own bean jog in circles
  // round the finish pen while the race that still mattered happened somewhere
  // off screen. Finishing and being eliminated are the same thing as far as the
  // camera is concerned: you are no longer the interesting racer.
  //
  // The TARGET IS HELD AS A RACER, not as an index. An index into a list that
  // shrinks every time somebody qualifies is an index that silently slides onto
  // a different person, so the view would drift on its own while the player sat
  // still. Holding the racer means the only thing that can move the camera is
  // that racer leaving the race, and then it is a deliberate step to the next
  // one rather than a reshuffle.
  let specTarget = null;

  // Out of it, either way, while there is still a race to watch.
  function spectating(){
    const p = racers.find(r=>r.isPlayer);
    if(!p) return false;
    if(!(state==='racing' || state==='countdown')) return false;
    return !!(p.lavaOut || p.finished);
  }
  // Still in it: not eliminated, not mid-fall, and not already past the line.
  // A racer who has qualified is NOT a candidate -- watching somebody celebrate
  // in the pen is the exact thing this screen exists to get you away from.
  function activeRacers(){
    return racers.filter(r=>!r.lavaOut && !r.falling && !r.finished);
  }
  // The fallback, for the seconds between the last racer finishing and the round
  // actually ending. Anyone still rendering beats a black screen.
  function watchableRacers(){
    const live = activeRacers();
    if(live.length) return live;
    return racers.filter(r=>!r.lavaOut);
  }
  // Who the camera is actually following.
  function camSubject(){
    const p = racers.find(r=>r.isPlayer);
    if(!spectating()){ specTarget = null; return p; }
    const pool = watchableRacers();
    if(!pool.length) return p;
    // AUTOMATIC ADVANCE: the held target qualified, fell in, or is the player
    // themselves. Step to the next one in course order rather than to whoever
    // happens to be first in the racers array, so the jump is to a neighbour.
    if(!specTarget || specTarget.isPlayer || pool.indexOf(specTarget) === -1){
      const next = pool.slice().sort((a,b)=>b.y-a.y)[0];
      if(next !== specTarget){ specTarget = next; noteSpecSwitch(); }
    }
    return specTarget || p;
  }

  // Tell the camera a cut is coming so it glides rather than whips. The camera
  // owns the constant; this only says when.
  function noteSpecSwitch(){ camSwitchT = CAM.SWITCH_BLEND; }

  function cycleSpectate(step){
    const pool = watchableRacers();
    if(!pool.length) return;
    // Ordered by position on the course, so prev/next means "the racer ahead"
    // and "the racer behind" rather than an arbitrary walk through an array.
    const ord = pool.slice().sort((a,b)=>b.y-a.y);
    const at = ord.indexOf(specTarget);
    const i = at === -1 ? 0 : ((at + step) % ord.length + ord.length) % ord.length;
    if(ord[i] === specTarget) return;
    specTarget = ord[i];
    noteSpecSwitch();
    SFX.click();
    updateSpectator();
  }

  function updateSpectator(){
    const bar = $('specBar'); if(!bar) return;
    const on = spectating();
    bar.classList.toggle('hidden', !on);
    // the movement hint sits where the bar does, and you are not racing anyway
    if(on) $('hint').classList.add('hidden');
    if(!on) return;
    const who = camSubject();
    const top = $('specTop');
    // The banner reads differently depending on how you got here. Telling a
    // player who just WON the round that they are out is a small lie that lands
    // badly, and it is one string.
    if(top){
      const p = racers.find(r=>r.isPlayer);
      top.textContent = (p && p.finished && !p.lavaOut) ? 'QUALIFIED — SPECTATING' : "YOU'RE OUT — SPECTATING";
    }
    $('specName').textContent = (who && !who.isPlayer) ? nameOf(who) : '—';
    const live = activeRacers().length;
    $('specLeft').textContent = live + ' still in';
  }

  function leaveSpectate(){
    specTarget = null;
    const bar = $('specBar'); if(bar) bar.classList.add('hidden');
  }
