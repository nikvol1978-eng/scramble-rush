  // ============================================================
  // BEACH WAVES
  // ============================================================
  // The sea is ahead of you, not behind: waves roll down the course and shove
  // you back toward the start. Jumping clears them, which is the whole trick.
  let waves = [], waveTimer = 0, waveMeshes = [];
  const WAVE_SPEED = 360, WAVE_THICK = 210, WAVE_GAP = 6.5;
  let waveId = 0;

  function resetWaves(){
    waves = []; waveTimer = 3.0;
    for(const m of waveMeshes) m.visible = false;
  }
  function buildWaveMeshes(){
    waveMeshes = [];
    if(!currentMap.waves) return;
    for(let i=0;i<4;i++){
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(TRACK_W+120, 52, WAVE_THICK),
        new THREE.MeshPhongMaterial({color:0x2fb8d8, shininess:70, transparent:true,
                                     opacity:0.72, depthWrite:false}));
      body.position.y = 26; g.add(body);
      const foam = new THREE.Mesh(new THREE.BoxGeometry(TRACK_W+130, 16, WAVE_THICK*0.42),
        new THREE.MeshLambertMaterial({color:0xffffff, transparent:true, opacity:0.9, depthWrite:false}));
      foam.position.set(0, 52, -WAVE_THICK*0.28); g.add(foam);
      g.visible = false;
      courseGroup.add(g);
      g.userData.parts = [{m:body, o:0.72}, {m:foam, o:0.9}];
      waveMeshes.push(g);
    }
  }
  function updateWaves(dt){
    if(!currentMap.waves) return;
    waveTimer -= dt;
    if(waveTimer <= 0 && waves.length < waveMeshes.length){
      waveTimer = WAVE_GAP;
      const front = racers.reduce((m,r)=>Math.max(m, r.y), 0);
      waves.push({ id: ++waveId, y: Math.min(front + 850, trackLength + 400), life: 5.5 });
    }
    for(let i=waves.length-1; i>=0; i--){
      const w = waves[i];
      w.y -= WAVE_SPEED*dt;
      w.life -= dt;
      if(w.life <= 0 || w.y < -500){ waves.splice(i,1); continue; }
      for(const r of racers){
        if(r.finished || r.falling || r.lavaOut) continue;
        if(r.h > 44) continue;                                   // jumped it
        if(Math.abs(r.y - w.y) > WAVE_THICK/2 + RADIUS) continue;
        // one shove per wave. Holding a racer at -4.6 for as long as the wave
        // covered them pinned the whole pack and made the beach unfinishable.
        if(r._waveId === w.id) continue;
        r._waveId = w.id;
        r.vy = Math.min(r.vy, 0) - 7.5;
        r.vx += (Math.random()-0.5)*1.6;
        r.stumbleT = Math.max(r.stumbleT, 300);
        r.squash = Math.max(r.squash, 0.7);
        if(r.isPlayer){ camShake = Math.max(camShake, 5); if(SFX.hit) SFX.hit(); }
      }
    }
    const camPos = new THREE.Vector3(), here = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    waveMeshes.forEach((m,i)=>{
      const w = waves[i];
      m.visible = !!w;
      if(!w) return;
      placeAt(m, TRACK_W/2, w.y, 0);
      // A wave is a full-width slab. Rolling over the camera, it filled the
      // screen with flat blue, so it thins out as it reaches you and is gone by
      // the time it is on top of you.
      m.getWorldPosition(here);
      const near = clamp((camPos.distanceTo(here) - 90) / 190, 0, 1);
      for(const p of m.userData.parts) p.m.material.opacity = p.o * near;
      m.visible = near > 0.02;
    });
  }

  // ============================================================
  // RANDOM MAP EVENTS
  // ============================================================
  // One event per race, announced before it lands. They are course-wide, so
  // nobody gets singled out -- the pack has to deal with the same thing at once.
  let mapEvent = null, obsBoost = 0, quakePulse = 0;
  const EVENT_KINDS = ['wind','frenzy','quake'];
  const EVENT_TEXT = {
    wind:   ['CROSSWIND', 'lean into it'],
    frenzy: ['FRENZY',    'everything speeds up'],
    quake:  ['TREMOR',    'stay on your feet']
  };
  // Obstacle animation runs off this, so a frenzy accelerates the course
  // smoothly instead of jumping every pendulum to a new phase.
  function eventSpeed(){ return (mapEvent && mapEvent.active && mapEvent.kind==='frenzy') ? 1.55 : 1; }
  function obsTime(t){ return t + obsBoost; }

  function resetEvents(){
    mapEvent = null; obsBoost = 0; quakePulse = 0;
    hideEventBanner();
    if(currentMap.isMinigame) return;         // survival rounds are busy enough
    const forced = (typeof window!=='undefined') ? window.__forceEvent : null;
    const kind = forced || pick(EVENT_KINDS);
    mapEvent = { kind, t:0, warnAt: forced ? 2.5 : rand(10, 24), warned:false,
                 active:false, dur: 9, dir: Math.random()<0.5 ? -1 : 1 };
  }
  function showEventBanner(kind){
    const el = $('eventBanner'); if(!el) return;
    $('eventName').textContent = EVENT_TEXT[kind][0];
    $('eventSub').textContent  = EVENT_TEXT[kind][1];
    el.classList.remove('hidden');
    el.classList.remove('evPulse'); void el.offsetWidth; el.classList.add('evPulse');
    if(typeof SFX!=='undefined' && SFX.warn) SFX.warn();
  }
  function hideEventBanner(){ const el = $('eventBanner'); if(el) el.classList.add('hidden'); }

  function updateEvents(dt){
    if(!mapEvent || state !== 'racing') return;
    mapEvent.t += dt;
    const startAt = mapEvent.warnAt + 1.4;
    if(!mapEvent.warned && mapEvent.t >= mapEvent.warnAt){ mapEvent.warned = true; showEventBanner(mapEvent.kind); }
    if(mapEvent.warned && !mapEvent.active && mapEvent.t >= startAt) mapEvent.active = true;
    if(!mapEvent.active) return;
    if(mapEvent.t > startAt + mapEvent.dur){ mapEvent.active = false; hideEventBanner(); return; }

    if(mapEvent.kind === 'wind'){
      for(const r of racers){
        if(r.finished || r.falling || r.lavaOut) continue;
        r.vx += mapEvent.dir * 0.45 * (dt*60);
      }
    } else if(mapEvent.kind === 'frenzy'){
      obsBoost += dt*(eventSpeed()-1);
    } else if(mapEvent.kind === 'quake'){
      quakePulse -= dt;
      if(quakePulse <= 0){
        quakePulse = 0.5;
        camShake = Math.max(camShake, 7);
        for(const r of racers){
          if(r.finished || r.falling || r.lavaOut || r.h > 2) continue;
          if(Math.random() < 0.35){ r.stumbleT = Math.max(r.stumbleT, 260); r.vh = 1.9; r.h = 0.01; r.squash = 0.7; }
        }
      }
    }
  }
