  // ============================================================
  // SPECTATOR
  // ============================================================
  // Being knocked out of a survival round used to mean watching your own faded
  // blob lie there. Now the camera moves to someone still alive and you can
  // switch between them, or bail straight into a new match.
  let spectateIdx = 0;

  function spectating(){
    const p = racers.find(r=>r.isPlayer);
    return !!(p && p.lavaOut && (state==='racing' || state==='countdown'));
  }
  function aliveRacers(){
    return racers.filter(r=>!r.lavaOut && !r.falling);
  }
  // Who the camera is actually following.
  function camSubject(){
    const p = racers.find(r=>r.isPlayer);
    if(!spectating()) return p;
    const alive = aliveRacers();
    if(!alive.length) return p;
    spectateIdx = ((spectateIdx % alive.length) + alive.length) % alive.length;
    return alive[spectateIdx];
  }
  function cycleSpectate(step){
    const alive = aliveRacers();
    if(!alive.length) return;
    spectateIdx = ((spectateIdx + step) % alive.length + alive.length) % alive.length;
    SFX.click();
    updateSpectator();
  }

  function updateSpectator(){
    const bar = $('specBar'); if(!bar) return;
    const on = spectating();
    bar.classList.toggle('hidden', !on);
    // the movement hint sits where the bar does, and you are not moving anyway
    if(on) $('hint').classList.add('hidden');
    if(!on) return;
    const alive = aliveRacers();
    const who = alive.length ? alive[((spectateIdx % alive.length)+alive.length)%alive.length] : null;
    $('specName').textContent = who ? nameOf(who) : '—';
    $('specLeft').textContent = alive.length + ' still in';
  }

  function leaveSpectate(){
    const bar = $('specBar'); if(bar) bar.classList.add('hidden');
  }
