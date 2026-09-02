  // ============================================================
  // PLAY-MECHANIC CHECKS
  // ============================================================
  // Injected into __debug.html only. Run with:  window.__checks.run()
  //
  // These assert that things actually HAPPEN, not merely that a round reaches
  // state 'racing'. A state-only check is what let updateMinigames() sit
  // uncalled for three versions while every regression pass went green.
  //
  // Checks D and E are expected to FAIL before the spline generator exists. A
  // check that cannot fail proves nothing.

  // Four maps stay genuinely flat, so the straight fallback keeps being exercised.
  const CORRIDOR_MAPS = ['sunny','neon','sky','cyber'];
  const PATH_MAPS     = ['cannonc','slide','honey','candy','jungle','bumperb','frost','space','beach'];
  const MINIGAME_KEYS = ['lava','boulder','doors','tiles','blockdash','hex','laser','tracer'];
  const TO_RACING     = 700;                 // ticks to clear loader + flyover + countdown

  function player(){ return racers.find(r=>r.isPlayer); }

  // Where the game actually renders a racer, minus everything we already know
  // about. Whatever is left is the height the course path contributes.
  function pathHeightAt(simY, simX){
    const p = player();
    p.y = simY; if(simX!==undefined) p.x = simX;
    p.h = 0; p.floorH = 0; p.vx = 0; p.vy = 0;
    syncRacers(0);                            // t=0 kills the run-cycle bob
    return p.mesh.group.position.y - RADIUS;
  }

  function begin(mapKey, round){
    window.__forceMap = mapKey || null;
    ['home','profile','results','gameover','daily'].forEach(id=>$(id).classList.add('hidden'));
    startRound(round||1, null);
    window.__dbg.tick(TO_RACING);
  }

  // ---------- A: corridor maps render exactly where they always did ----------
  function checkA(){
    const bad = [];
    for(const key of CORRIDOR_MAPS){
      begin(key);
      const p = player();
      for(let i=0;i<20;i++){
        const sy = trackLength*(i/19), sx = 60 + (TRACK_W-120)*((i*7)%20)/19;
        p.y=sy; p.x=sx; p.h=0; p.floorH=0; p.vx=0; p.vy=0;
        syncRacers(0);
        const got = p.mesh.group.position;
        const want = { x: sx - TRACK_W/2, y: RADIUS, z: sy };
        const err = Math.max(Math.abs(got.x-want.x), Math.abs(got.y-want.y), Math.abs(got.z-want.z));
        if(err > 0.001){ bad.push(`${key} @${Math.round(sy)}: off by ${err.toFixed(3)}`); break; }
      }
    }
    return { name:'A corridor maps use the legacy straight transform',
             pass: bad.length===0, detail: bad.length? bad.slice(0,4).join('; ') : CORRIDOR_MAPS.length+' maps exact' };
  }

  // ---------- B: every obstacle mesh sits where collision thinks it does ----------
  // Returns [{simX, simY, mesh:Object3D}] for whatever the map has.
  function obstacleProbes(t){
    const out = [];
    const push = (x,y,mesh,tag)=>{ if(mesh) out.push({x,y,mesh,tag}); };
    for(const o of obstacles){
      switch(o.type){
        case 'pillars': (o.meshes||[]).forEach((m,i)=>push(o.items[i].x, o.y, m, 'pillars')); break;
        case 'bumper':  (o.meshes||[]).forEach((m,i)=>push(o.items[i].x, o.y, m, 'bumper')); break;
        case 'doors':   (o.meshes||[]).forEach((m,i)=>push(o.items[i].x, o.y, m.group, 'doors')); break;
        case 'blockwall': (o.meshes||[]).forEach((m,i)=>push(o.items[i].x + blockShift(o,t), o.y, m, 'blockwall')); break;
        case 'cannon':  (o.meshes||[]).forEach((m,i)=>push(o.items[i].side<0?30:TRACK_W-30, o.items[i].y, m.group, 'cannon')); break;
        case 'pusher':  (o.meshes||[]).forEach((m,i)=>push(platX(o.items[i],t), o.y, m, 'pusher')); break;
        case 'pit':     (o.platformMeshes||[]).forEach((m,i)=>push(platX(o.platforms[i],t), (o.yStart+o.yEnd)/2, m, 'pit')); break;
        case 'roller':  push(rollerX(o,t), o.y, o.mesh, 'roller'); break;
        case 'laserbar':push(TRACK_W/2, laserY(o,t), o.mesh, 'laserbar'); break;
        case 'pendulum':{ const pp=pendPos(o,t); push(pp.x, o.y, o.mesh, 'pendulum'); break; }
        case 'boost':   push(o.cx, o.y, o.mesh, 'boost'); break;
        case 'spinlaser':push(o.cx, o.y, o.mesh, 'spinlaser'); break;
        case 'ramp':    push(o.cx, (o.yStart+o.yEnd)/2, o.mesh, 'ramp'); break;
        case 'spinbar': push(o.cx, o.y, o.mesh, 'spinbar'); break;
        case 'mover':   push(moverX(o,t), (o.yStart+o.yEnd)/2, o.mesh, 'mover'); break;
        case 'crumble': (o.meshes||[]).forEach((m,i)=>{ if(!o.slabs[i].gone) push(o.slabs[i].x, o.slabs[i].y, m, 'crumble'); }); break;
        case 'log':     { const lp=logPos(o,t); push(lp.x, o.y, o.mesh, 'log'); break; }
        case 'tilefield': o.tiles.slice(0,40).forEach(tl=>{ if(tl.mesh) push(tl.x, tl.y, tl.mesh, 'tile'); }); break;
        case 'hexfield':  o.cells.slice(0,40).forEach(c=>{ if(c.mesh) push(c.x, c.y, c.mesh, 'hex'); }); break;
      }
    }
    return out;
  }
  // The horizontal position the renderer should put a sim point at.
  function expectedWorldXZ(simX, simY){
    if(typeof toWorld === 'function'){ const w = toWorld(simX, simY, 0); return {x:w.x, z:w.z}; }
    return { x: toSceneX(simX), z: simY };                    // legacy straight course
  }
  function checkB(){
    const bad = [], seen = {};
    const maps = CORRIDOR_MAPS.concat(PATH_MAPS, MINIGAME_KEYS);
    for(const key of maps){
      begin(key);
      window.__dbg.tick(30);
      const t = window.__T || 0;
      syncObstacles(t);
      for(const pr of obstacleProbes(t)){
        pr.mesh.updateMatrixWorld(true);
        const w = new THREE.Vector3().setFromMatrixPosition(pr.mesh.matrixWorld);
        const want = expectedWorldXZ(pr.x, pr.y);
        const err = Math.hypot(w.x-want.x, w.z-want.z);
        seen[pr.tag] = (seen[pr.tag]||0)+1;
        if(err > 1.0){ bad.push(`${key}/${pr.tag}: mesh ${err.toFixed(1)} from collision`); break; }
      }
    }
    return { name:'B obstacle meshes agree with collision positions',
             pass: bad.length===0,
             detail: bad.length? bad.slice(0,4).join('; ')
                   : Object.keys(seen).length+' types, '+Object.values(seen).reduce((a,b)=>a+b,0)+' probes' };
  }

  // ---------- C: the floor actually holds you up ----------
  function checkC(){
    const bad = [];
    for(const key of CORRIDOR_MAPS.concat(PATH_MAPS)){
      begin(key);
      const p = player();
      let tested = 0;
      for(let i=0;i<60;i++){
        const sy = 200 + (trackLength-500)*(i/59);
        // skip anywhere the course is meant to drop you
        const hazard = obstacles.some(o=>
          (o.type==='pit'||o.type==='narrow'||o.type==='tilefield'||o.type==='hexfield'||
           o.type==='mover'||o.type==='crumble') &&
          sy > o.yStart-120 && sy < o.yEnd+120);
        if(hazard) continue;
        p.y=sy; p.x=TRACK_W/2; p.h=0; p.vx=0; p.vy=0; p.falling=false; p.floorH=0;
        p.tileGraceUntil=-1;
        checkObstacles(p, window.__T||0);
        tested++;
        if(p.falling){ bad.push(`${key} @${Math.round(sy)} fell through`); break; }
      }
      if(tested < 8) bad.push(`${key}: only ${tested} safe sample points`);
    }
    return { name:'C ground supports a racer along the whole course',
             pass: bad.length===0, detail: bad.length? bad.slice(0,4).join('; ') : 'all sample points supported' };
  }

  // ---------- D / E / F: does the course go up, down, or stay flat ----------
  function heightProfile(key){
    begin(key);
    const out = [];
    for(let i=0;i<=20;i++) out.push(pathHeightAt(trackLength*(i/20), TRACK_W/2));
    return out;
  }
  function checkD(){
    const h = heightProfile('cannonc');
    const start = h[0], near = h[18];               // 90% of the way
    const gain = near - start;
    let worstDrop = 0;
    for(let i=1;i<h.length;i++) worstDrop = Math.min(worstDrop, h[i]-h[i-1]);
    return { name:'D Cannon Climb gains real height',
             pass: gain > 350 && worstDrop > -30,
             detail: `gain ${gain.toFixed(0)} (need >350), worst step ${worstDrop.toFixed(0)} (need >-30)` };
  }
  function checkE(){
    const h = heightProfile('slide');
    const drop = h[18] - h[0];
    let worstRise = 0;
    for(let i=1;i<h.length;i++) worstRise = Math.max(worstRise, h[i]-h[i-1]);
    return { name:'E Super Slide loses real height',
             pass: drop < -350 && worstRise < 30,
             detail: `drop ${drop.toFixed(0)} (need <-350), worst step +${worstRise.toFixed(0)} (need <30)` };
  }
  function checkF(){
    const bad = [];
    for(const key of CORRIDOR_MAPS){
      const h = heightProfile(key);
      const worst = Math.max(...h.map(Math.abs));
      if(worst > 1) bad.push(`${key} deviates ${worst.toFixed(1)}`);
    }
    return { name:'F corridor maps stay flat', pass: bad.length===0,
             detail: bad.length? bad.join('; ') : CORRIDOR_MAPS.length+' maps flat' };
  }

  // ---------- G: the minigame mechanics actually tick ----------
  function checkG(half){
    const bad = [], got = {};
    const doA = half!==2, doB = half!==1;
    if(doA){
    // Shots and boulders are transient: a ball crosses the lane in about 1.3s, so
    // sampling the array once can legitimately catch zero. Take the peak over the
    // window instead -- a single snapshot made this check flaky, not the game.
    begin('cannonc'); window.__dbg.hold('w',true);
    got.cannonShots = 0;
    for(let i=0;i<6;i++){ window.__dbg.tick(50); got.cannonShots = Math.max(got.cannonShots, shots.length); }
    window.__dbg.hold('w',false);
    if(got.cannonShots === 0) bad.push('no cannonballs in flight');

    begin('boulder'); window.__dbg.hold('w',true);
    got.boulders = 0;
    for(let i=0;i<5;i++){ window.__dbg.tick(50); got.boulders = Math.max(got.boulders, boulders.length); }
    window.__dbg.hold('w',false);
    if(got.boulders === 0) bad.push('no boulders spawned');
    }
    if(doB){

    begin('tiles'); window.__dbg.hold('w',true); window.__dbg.tick(300);
    const tf = obstacles.find(o=>o.type==='tilefield');
    got.tilesGone = tf ? tf.tiles.filter(x=>x.gone).length : -1;
    window.__dbg.hold('w',false);
    if(got.tilesGone <= 0) bad.push('no tiles crumbled');

    begin('hex'); window.__dbg.hold('w',true); window.__dbg.tick(300);
    const hf = obstacles.find(o=>o.type==='hexfield');
    got.hexGone = hf ? hf.cells.filter(c=>c.gone).length : -1;
    window.__dbg.hold('w',false);
    if(got.hexGone <= 0) bad.push('no hexes crumbled');
    }

    return { name:'G minigame mechanics tick', pass: bad.length===0,
             detail: bad.length? bad.join('; ') : JSON.stringify(got) };
  }

  // ---------- J: swinging hazards stay above the floor ----------
  function checkJ(){
    const bad = [];
    for(const key of ['honey','neon','jungle']){
      begin(key);
      for(const o of obstacles){
        if(o.type!=='pendulum') continue;
        let lowest = 1e9;
        for(let i=0;i<=60;i++){                       // sweep a whole cycle
          const t = i/60 * (Math.PI*2/Math.abs(o.speed||1));
          lowest = Math.min(lowest, pendPos(o,t).h - o.r);
        }
        if(lowest < -2){
          bad.push(`${key}: ball dips ${(-lowest).toFixed(0)} below the floor (arm ${Math.round(o.armLen)}, pivot ${Math.round(o.pivotH)})`);
          break;
        }
      }
    }
    return { name:'J pendulums swing above the floor', pass: bad.length===0,
             detail: bad.length? bad.slice(0,3).join('; ') : 'all pendulums clear' };
  }

  // ---------- K: drafting behind someone actually tows you ----------
  function checkK(){
    // Measure top speed alone, then with a partner parked just ahead.
    // The player must be re-fetched after each begin(): startRound rebuilds the
    // racers array, so a reference taken earlier points at a detached object.
    function topSpeed(withPartner){
      const p = player();
      const bot = racers.find(r=>!r.isPlayer);
      p.x=TRACK_W/2; p.y=120; p.vx=0; p.vy=0; p.h=0; p.falling=false;
      for(const r of racers) if(r!==p){ r.x=-9999; r.y=-9999; r.vx=0; r.vy=0; }
      window.__dbg.hold('w',true);
      let best=0;
      for(let i=0;i<90;i++){
        if(withPartner){ bot.y = p.y + 70; bot.x = TRACK_W/2; bot.vx=0; bot.vy=0; }
        window.__dbg.tick(1);
        best = Math.max(best, p.vy);
      }
      window.__dbg.hold('w',false);
      return best;
    }
    begin('sunny'); const alone = topSpeed(false);
    begin('sunny'); const drafting = topSpeed(true);
    const gain = (drafting/alone - 1)*100;
    return { name:'K slipstream tows a trailing racer',
             pass: gain > 3 && gain < 16,
             detail: `alone ${alone.toFixed(2)}, drafting ${drafting.toFixed(2)} (+${gain.toFixed(1)}%, want 3-16%)` };
  }

  // ---------- M: the course roster is not one flat corridor ----------
  function checkM(){
    const prof = {}, shaped = [];
    for(const key of CORRIDOR_MAPS.concat(PATH_MAPS)){
      const h = heightProfile(key);
      const net = h[20] - h[0];
      let turn = 0;
      begin(key);
      for(let i=0;i<=20;i++) turn = Math.max(turn, Math.abs(pathAngle(trackLength*(i/20))));
      prof[key] = Math.round(net) + (turn>0.08 ? ' (turns)' : '');
      if(Math.abs(net) > 250 || turn > 0.08) shaped.push(key);
    }
    return { name:'M most maps are shaped, not straight corridors',
             pass: shaped.length >= 7,
             detail: shaped.length+' shaped of '+(CORRIDOR_MAPS.length+PATH_MAPS.length)+' -- '+JSON.stringify(prof) };
  }

  // ---------- N: knockout rounds eliminate rather than race ----------
  function checkN(){
    const bad = [], got = {};
    for(const key of ['tiles','hex']){
      begin(key);
      if(!currentMap.knockout){ bad.push(key+' is not flagged knockout'); continue; }
      const reach = arenaEnd;
      window.__dbg.hold('w',true);
      let ended = false, ticks = 0;
      while(ticks < 3600 && !ended){ window.__dbg.tick(60); ticks += 60; ended = (state !== 'racing'); }
      window.__dbg.hold('w',false);
      const out   = racers.filter(r=>r.lavaOut).length;
      const alive = racers.length - out;
      const past  = racers.filter(r=>r.y > reach + 5).length;
      got[key] = {out, alive, endedIn: (ticks/60)+'s'};
      if(out === 0)   bad.push(key+': nobody was eliminated');
      if(past > 0)    bad.push(key+': '+past+' racers left the arena');
      if(!ended)      bad.push(key+': round never ended');
      if(alive > 9)   bad.push(key+': ended with '+alive+' still standing');
      // a two-second round is not a round
      if(ticks/60 < 12) bad.push(key+': ended after only '+(ticks/60)+'s');
    }
    return { name:'N knockout rounds eliminate and end on survivors',
             pass: bad.length===0, detail: bad.length? bad.join('; ') : JSON.stringify(got) };
  }

  // ---------- O: browsing the shop previews on the model, without equipping ----------
  function checkO(){
    const bad = [];
    stats.coins = 9999;
    $('home').classList.add('hidden'); $('profile').classList.remove('hidden');
    profTab = 'shop'; buildProfile();
    const equippedBefore = custom.skin;
    const cards = document.querySelectorAll('#shopGrid .shopCard');
    if(cards.length < 3) return { name:'O shop previews live on the model', pass:false, detail:'no shop cards' };
    // click a card that is NOT the equipped one
    let target = null, idx = -1;
    const list = SKINS.filter(x=>shopFilter==='all'||x.rarity===shopFilter)
                      .sort((a,b)=>RARITY_ORDER.indexOf(a.rarity)-RARITY_ORDER.indexOf(b.rarity));
    for(let i=0;i<list.length;i++) if(list[i].id !== equippedBefore){ target = list[i]; idx = i; break; }
    cards[idx].click();
    const previewedMat = menuBlob.bodyMat;
    if(custom.skin !== equippedBefore) bad.push('clicking a card changed the equipped skin');
    // the model should now be built from the previewed skin, not the equipped one
    const wantColour = new THREE.Color(skinBaseColor(target));
    const gotColour  = previewedMat.color;
    const same = Math.abs(gotColour.r-wantColour.r)+Math.abs(gotColour.g-wantColour.g)+Math.abs(gotColour.b-wantColour.b) < 0.05;
    const usesMap = !!previewedMat.map;
    if(!same && !usesMap) bad.push('model did not change to the previewed skin');
    if($('previewTag').classList.contains('hidden')) bad.push('preview badge stayed hidden');
    // leaving the tab must drop the preview
    switchTab('stats');
    if(previewSkin !== null) bad.push('preview survived a tab change');
    $('profile').classList.add('hidden'); $('home').classList.remove('hidden');
    return { name:'O shop previews live on the model', pass: bad.length===0,
             detail: bad.length? bad.join('; ') : 'previewed '+(target?target.name:'?')+', equipped unchanged' };
  }

  // ---------- P: the camera gets out of its own way ----------
  function checkP(){
    const bad = [];
    // (a) occlusion: stand against a wall, then swing the camera round so the
    //     wall is between it and the racer. Something must fade.
    begin('sunny');
    const p = player();
    // Pick a stretch with nothing in it. Measuring the clear view from a fixed
    // spot meant that on the odd layout a pillar really was in the way, and the
    // camera was marked broken for doing its job.
    let openY = 1200;
    for(let y=900; y<Math.min(6000, trackLength-600); y+=140){
      if(!obstacles.some(o=>y > (o.y0??o.yStart)-260 && y < (o.y1??o.yEnd)+260)){ openY = y; break; }
    }
    look.yaw = 0; look.pitch = 0;
    for(let k=0;k<6;k++){ p.x = TRACK_W/2; p.y = openY; p.vx = 0; p.vy = 0; window.__dbg.tick(10); }
    const clearMin = Math.min(...fadeables.map(m=>m.material.opacity));
    p.x = 26;                                        // now hard against the left wall
    // Swing the camera round behind the wall. One hand-picked angle was too
    // brittle -- depending on where the racer stands the camera can clear the
    // wall top -- so sweep and take the best occlusion the arc produces.
    let blockedMin = 1;
    for(const yaw of [0.38, 0.52, 0.66, 0.80, 0.94]){
      // The camera lerps to a new orbit over ~25 frames, so hold long enough for
      // the fade to settle after it arrives. Re-pin every slice: over a hold this
      // long the pack barges the racer off the wall, and then of course nothing
      // is blocking the view any more.
      look.yaw = Math.PI*yaw;
      for(let k=0;k<8;k++){ p.x = 26; p.y = openY; p.vx = 0; p.vy = 0; window.__dbg.tick(10); }
      blockedMin = Math.min(blockedMin, ...fadeables.map(m=>m.material.opacity));
    }
    if(!fadeables.length) bad.push('nothing registered as fadeable');
    if(clearMin < 0.9)    bad.push('faded with a clear line of sight ('+clearMin.toFixed(2)+')');
    if(blockedMin > 0.6)  bad.push('nothing faded when the wall blocked the view ('+blockedMin.toFixed(2)+')');

    // (b) auto-tilt: the camera should ride higher on a descent than on the flat
    begin('sunny'); window.__dbg.tick(30);
    const flatElev = camera.position.y - (racers.find(r=>r.isPlayer).h);
    begin('slide');
    const ps = player(); ps.y = trackLength*0.45; window.__dbg.tick(40);
    const dropTilt = camAuto;
    if(dropTilt <= 0.02) bad.push('no auto-tilt on a descent ('+dropTilt.toFixed(3)+')');

    return { name:'P camera fades occluders and tilts over drops',
             pass: bad.length===0,
             detail: bad.length? bad.join('; ')
                   : fadeables.length+' fadeables, clear '+clearMin.toFixed(2)
                     +' blocked '+blockedMin.toFixed(2)+', drop tilt '+dropTilt.toFixed(3) };
  }

  // ---------- Q: the shortcut lane lifts you, speeds you up, and drops you ----------
  function checkQ(){
    const bad = [];
    let found = 0, detail = '';
    for(const key of ['sunny','neon','jungle','sky']){
      for(let attempt=0; attempt<6 && !found; attempt++){
        begin(key);
        const sc = obstacles.find(o=>o.type==='shortcut');
        if(!sc) continue;
        found++;
        const p = player();
        // ride the lane
        p.x = sc.cx; p.y = sc.yStart + sc.rampLen + 40; p.h=0; p.vx=0; p.vy=0; p.falling=false;
        window.__dbg.hold('w',true); window.__dbg.tick(30);
        const onLane = { floor: p.floorH, speed: p.vy };
        // step off the side
        p.x = sc.cx + (sc.cx > TRACK_W/2 ? -1 : 1) * (sc.w/2 + 30);
        window.__dbg.tick(4);
        const offLane = { floor: p.floorH, h: p.h };
        window.__dbg.hold('w',false);

        if(onLane.floor < sc.h - 2)  bad.push(key+': lane did not lift the racer ('+onLane.floor.toFixed(0)+' of '+sc.h+')');
        if(onLane.speed < sc.boost-0.3) bad.push(key+': no speed reward ('+onLane.speed.toFixed(1)+' of '+sc.boost.toFixed(1)+')');
        if(offLane.floor > 1)        bad.push(key+': still raised after stepping off');
        if(offLane.h < sc.h - 6)     bad.push(key+': dropped instantly instead of falling ('+offLane.h.toFixed(0)+')');
        detail = 'lifted to '+onLane.floor.toFixed(0)+', boost '+onLane.speed.toFixed(1)+', fell from '+offLane.h.toFixed(0);
      }
      if(found) break;
    }
    if(!found) bad.push('no shortcut generated on any of the four maps offering it');
    return { name:'Q shortcut lane lifts, rewards and drops', pass: bad.length===0,
             detail: bad.length? bad.join('; ') : detail };
  }

  // ---------- R: being knocked out puts you on a survivor, not on your own corpse ----------
  function checkR(){
    const bad = [];
    begin('tiles');
    if(!currentMap.knockout)
      return { name:'R spectator follows survivors', pass:false, detail:'tiles is not a knockout map' };
    const p = player();

    // while you are alive nothing changes
    updateHud();
    if(spectating())                                  bad.push('spectating while still alive');
    if(camSubject() !== p)                             bad.push('camera left the player while alive');
    if(!$('specBar').classList.contains('hidden'))     bad.push('spectator bar showing while alive');

    // ...then you go out, mid-round, with others still in
    p.lavaOut = true; p.lavaCatchY = p.y;
    updateHud();
    const s1 = camSubject();
    if(!spectating())                                  bad.push('not spectating after elimination');
    if(s1 === p)                                       bad.push('camera stayed on the eliminated player');
    if(s1 && s1.lavaOut)                               bad.push('spectating someone already out');
    if($('specBar').classList.contains('hidden'))      bad.push('spectator bar stayed hidden');
    if(s1 && $('specName').textContent !== nameOf(s1))
      bad.push('bar reads "'+$('specName').textContent+'" but the camera is on "'+nameOf(s1)+'"');

    // the camera travels to them and settles
    window.__dbg.tick(90);
    const t1 = camSubject();
    const w1 = toWorld(t1.x, t1.y, t1.h + RADIUS);
    const near = camera.position.distanceTo(new THREE.Vector3(w1.x, w1.y, w1.z));
    const own = toWorld(p.x, p.y, p.h + RADIUS);
    const fromMe = camera.position.distanceTo(new THREE.Vector3(own.x, own.y, own.z));
    if(near > 300)     bad.push('camera settled '+near.toFixed(0)+' from the racer it is watching');
    if(fromMe < near)  bad.push('camera is still nearer the eliminated player than the survivor');

    // switching targets
    const aliveN = racers.filter(r=>!r.lavaOut && !r.falling).length;
    const a = camSubject();
    cycleSpectate(1);
    const b = camSubject();
    if(aliveN > 1 && a === b)   bad.push('next did not change target ('+aliveN+' alive)');
    cycleSpectate(-1);
    if(camSubject() !== a)      bad.push('prev did not return to the first target');

    // and it goes away when the round does
    let ticks = 0;
    while(ticks < 3600 && state === 'racing'){ window.__dbg.tick(60); ticks += 60; }
    if(state === 'racing')                          bad.push('round never ended');
    else if(!$('specBar').classList.contains('hidden')) bad.push('spectator bar survived the round');

    return { name:'R spectator follows survivors when you are out', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : 'watched '+nameOf(a)+' of '+aliveN+' alive, camera '+near.toFixed(0)+' away (own body '+fromMe.toFixed(0)+')' };
  }

  // ---------- S: moving platforms carry whoever is standing on them ----------
  function checkS(){
    const bad = [];
    let o = null, key = null;
    for(const k of ['sky','cyber','sunny']){
      for(let a=0; a<8 && !o; a++){ begin(k); o = obstacles.find(x=>x.type==='mover'); key = k; }
      if(o) break;
    }
    if(!o) return { name:'S moving platforms carry a racer', pass:false, detail:'no mover generated on sky, cyber or sunny' };

    const p = player();
    const t0 = window.__T || 0;
    const x0 = moverX(o, t0);
    // stand on the platform, dead centre
    p.x = x0; p.y = o.y; p.h = o.h; p.vx = 0; p.vy = 0; p.vh = 0; p.falling = false;
    window.__dbg.tick(1);
    const supported = p.floorH;
    // Ride it without touching the controls, watching every step: net
    // displacement is worthless here, because a platform that swings out and
    // back over the window reads as having never moved at all.
    let lo = x0, hi = x0, drift = 0;
    for(let i=0;i<110;i++){
      window.__dbg.tick(1);
      const mx = moverX(o, window.__T || 0);
      if(mx < lo) lo = mx; if(mx > hi) hi = mx;
      drift = Math.max(drift, Math.abs(p.x - mx));
    }
    const t1 = window.__T || 0;
    const platMoved = hi - lo;
    const meMoved = p.x - x0;

    if(supported < o.h - 2)            bad.push('platform did not hold the racer up ('+supported.toFixed(0)+' of '+o.h+')');
    if(platMoved < 40)                 bad.push('platform barely travelled in 110 ticks ('+platMoved.toFixed(0)+')');

    // carried means the racer never came adrift of the deck, at any point
    if(drift > o.w/2)
      bad.push('racer came adrift of the deck by '+drift.toFixed(0)+' (deck half-width '+(o.w/2).toFixed(0)+')');

    // step off over the gap and you should be in the air, falling
    p.x = clamp(moverX(o, t1) + o.w, 30, TRACK_W-30);
    p.h = 0; p.falling = false;
    window.__dbg.tick(3);
    const offFloor = p.floorH, fell = p.falling;
    if(offFloor > 1)  bad.push('still supported after stepping off the platform');
    if(!fell)         bad.push('stepping off into the gap did not drop the racer');

    return { name:'S moving platforms carry a racer', pass: bad.length===0,
             detail: bad.length ? key+': '+bad.join('; ')
               : key+': held at '+supported.toFixed(0)+', deck travelled '+platMoved.toFixed(0)+', racer never more than '+drift.toFixed(0)+' off centre' };
  }

  // ---------- T: falling floors drop you, then rebuild ----------
  function checkT(){
    const bad = [];
    let o = null, key = null;
    for(const k of ['sky','cyber','sunny']){
      for(let a=0; a<8 && !o; a++){ begin(k); o = obstacles.find(x=>x.type==='crumble'); key = k; }
      if(o) break;
    }
    if(!o) return { name:'T falling floors drop and rebuild', pass:false, detail:'no crumble generated on sky, cyber or sunny' };

    const slab = o.slabs.find(s=>!s.gone) || o.slabs[0];
    const p = player();
    p.x = slab.x; p.y = slab.y; p.h = 0; p.vx = 0; p.vy = 0; p.vh = 0; p.falling = false;
    window.__dbg.tick(1);
    const heldAtFirst = p.floorH >= o.h - 2 || !slab.gone;
    if(!heldAtFirst) bad.push('slab was not solid when stepped on');

    // wait out the fuse
    const fuseTicks = Math.ceil(o.fuseTime*60) + 20;
    window.__dbg.tick(fuseTicks);
    if(!slab.touched) bad.push('standing on the slab did not arm it');
    if(!slab.gone)    bad.push('slab never fell after '+o.fuseTime+'s of standing on it');

    // and it must come back, or the course runs out of floor
    window.__dbg.tick(Math.ceil(o.respawnTime*60) + 60);
    if(slab.gone) bad.push('slab never rebuilt after '+o.respawnTime+'s');

    return { name:'T falling floors drop and rebuild', pass: bad.length===0,
             detail: bad.length ? key+': '+bad.join('; ')
               : key+': '+o.slabs.length+' slabs, fell in '+o.fuseTime+'s, back in '+o.respawnTime+'s' };
  }

  // ---------- U: jungle logs sweep across and knock you back ----------
  function checkU(){
    const bad = [];
    let o = null;
    for(let a=0; a<10 && !o; a++){ begin('jungle'); o = obstacles.find(x=>x.type==='log'); }
    if(!o) return { name:'U swinging logs knock racers back', pass:false, detail:'no log generated on jungle' };

    const p = player();
    let hit = false, pushed = 0, best = 0;
    // park in the middle of the sweep and let the log come round
    for(let i=0; i<180 && !hit; i++){
      p.x = o.cx; p.y = o.y; p.h = 0; p.vx = 0; p.vy = 0; p.stumbleT = 0; p.falling = false;
      const yBefore = p.y;
      window.__dbg.tick(2);
      if(p.stumbleT > 0){ hit = true; pushed = p.y - yBefore; best = p.vy; }
    }
    if(!hit) bad.push('the log never connected in 180 ticks of standing in its path');
    else {
      if(pushed >= 0 && best >= 0) bad.push('log hit but did not push the racer back (dy '+pushed.toFixed(0)+', vy '+best.toFixed(2)+')');
    }
    return { name:'U swinging logs knock racers back', pass: bad.length===0,
             detail: bad.length ? bad.join('; ') : 'log hit, knocked back dy '+pushed.toFixed(0)+' vy '+best.toFixed(2) };
  }

  // ---------- V: low gravity makes a higher, longer jump ----------
  function checkV(){
    const bad = [];
    function arc(key){
      begin(key);
      const p = player();
      p.x = TRACK_W/2; p.h = 0; p.vh = 0; p.vx = 0; p.vy = 0; p.falling = false; p.stumbleT = 0;
      doJump(p);
      let apex = 0, air = 0;
      for(let i=0; i<200; i++){
        window.__dbg.tick(1); air++;
        if(p.h > apex) apex = p.h;
        if(p.h <= 0 && i > 3) break;
      }
      return {apex, air};
    }
    const norm = arc('sunny');
    const low  = arc('space');
    if(!MAPS.find(m=>m.key==='space')) bad.push('no space map');
    if(low.apex < norm.apex*1.35) bad.push('space jump is not floaty ('+low.apex.toFixed(0)+' vs '+norm.apex.toFixed(0)+')');
    if(low.air  < norm.air*1.2)   bad.push('space hang time is not longer ('+low.air+' vs '+norm.air+' ticks)');
    // ...but it must still come down
    if(low.air > 200) bad.push('racer never landed on space');
    return { name:'V low gravity makes a higher, longer jump', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : 'apex '+norm.apex.toFixed(0)+' -> '+low.apex.toFixed(0)+', airtime '+norm.air+' -> '+low.air+' ticks' };
  }

  // ---------- W: beach waves shove a standing racer back ----------
  function checkW(){
    const bad = [];
    begin('beach');
    if(!currentMap.waves) return { name:'W waves push racers back down the beach', pass:false, detail:'beach map has no waves flag' };
    const p = player();
    p.x = TRACK_W/2; p.y = 1200; p.h = 0; p.vx = 0; p.vy = 0; p.falling = false; p.stumbleT = 0;
    const y0 = p.y;
    let hit = false, worst = 0;
    for(let i=0; i<600; i++){
      window.__dbg.tick(2);
      if(p.stumbleT > 0) hit = true;
      const back = y0 - p.y;
      if(back > worst) worst = back;
      if(hit && worst > 60) break;
    }
    if(!hit)        bad.push('no wave reached a racer standing still for 1200 ticks');
    if(worst < 40)  bad.push('waves pushed the racer back only '+worst.toFixed(0));
    // and they must not push you through the start of the course
    if(p.y < -50)   bad.push('a wave washed the racer off the back of the course ('+p.y.toFixed(0)+')');
    return { name:'W waves push racers back down the beach', pass: bad.length===0,
             detail: bad.length ? bad.join('; ') : 'washed back '+worst.toFixed(0)+' and stumbled' };
  }

  // ---------- X: random map events fire mid-round and actually do something ----------
  function checkX(){
    const bad = [], seen = {};
    for(const kind of ['wind','frenzy','quake']){
      window.__forceEvent = kind;
      begin('sunny');
      const p = player();
      // let the event arrive
      let fired = false;
      for(let i=0; i<60 && !fired; i++){ window.__dbg.tick(10); fired = !!(mapEvent && mapEvent.kind===kind && mapEvent.active); }
      if(!fired){ bad.push(kind+': never fired'); continue; }
      if(!$('eventBanner') || $('eventBanner').classList.contains('hidden'))
        bad.push(kind+': fired with no warning on screen');

      p.x = TRACK_W/2; p.y = 900; p.h = 0; p.vx = 0; p.vy = 0; p.falling = false; p.stumbleT = 0;
      const x0 = p.x, y0 = p.y;
      window.__dbg.tick(40);
      if(kind === 'wind'){
        const drift = Math.abs(p.x - x0);
        seen.wind = drift.toFixed(0);
        if(drift < 25) bad.push('wind moved a standing racer only '+drift.toFixed(0));
      } else if(kind === 'frenzy'){
        seen.frenzy = eventSpeed().toFixed(2)+'x';
        if(eventSpeed() <= 1.05) bad.push('frenzy did not speed the obstacles up ('+eventSpeed().toFixed(2)+')');
      } else if(kind === 'quake'){
        let shook = false;
        for(let i=0; i<40 && !shook; i++){ window.__dbg.tick(1); shook = camShake > 0.5 || p.stumbleT > 0; }
        seen.quake = shook ? 'shook' : 'nothing';
        if(!shook) bad.push('quake neither shook the camera nor stumbled anyone');
      }
      // every event must end on its own
      let ended = false;
      for(let i=0; i<80 && !ended; i++){ window.__dbg.tick(10); ended = !(mapEvent && mapEvent.active); }
      if(!ended) bad.push(kind+': never ended');
    }
    window.__forceEvent = null;
    return { name:'X random map events fire, land and end', pass: bad.length===0,
             detail: bad.length ? bad.join('; ') : JSON.stringify(seen) };
  }

  // ---------- H: the match still cuts 16 -> 12 -> 6 ----------
  function checkH(){
    begin('sunny');
    const seq = [racers.length];
    const winRound = ()=>{ const p=player(); p.y=trackLength+10; window.__dbg.tick(8);
      for(const r of racers) if(!r.isPlayer){ r.finished=true; r.finishTime=raceTime; }
      window.__dbg.tick(60); };
    winRound(); const b1=$('continueBtn'); if(b1) b1.click(); window.__dbg.tick(TO_RACING);
    seq.push(racers.length);
    winRound(); const b2=$('continueBtn'); if(b2) b2.click(); window.__dbg.tick(TO_RACING);
    seq.push(racers.length);
    winRound();
    const title = (document.querySelector('#results .title')||{}).textContent || '';
    const ok = seq[0]===16 && seq[1]===12 && seq[2]===6 && /VICTORY/.test(title);
    return { name:'H match cuts 16 -> 12 -> 6 -> victory', pass: ok,
             detail: seq.join(' -> ')+' -> '+title };
  }

  // ---------- I: the finish is reachable inside the round timer ----------
  function checkI(full){
    const bad = [], rate = {};
    const maps = full ? CORRIDOR_MAPS.concat(PATH_MAPS, MINIGAME_KEYS) : PATH_MAPS.concat(['sunny','doors','blockdash']);
    for(const key of maps){
      begin(key);
      const y0 = Math.max(...racers.map(r=>r.y));
      window.__dbg.hold('w',true); window.__dbg.tick(1200); window.__dbg.hold('w',false);
      const y1 = Math.max(...racers.map(r=>r.y));
      const perSec = (y1-y0)/20;
      const reach = perSec*timeLimit;
      rate[key] = Math.round(perSec);
      // 20s of pace, extrapolated over the round, must clear the line with room
      if(reach < trackLength*1.05) bad.push(`${key}: ${Math.round(reach)} vs ${Math.round(trackLength)}`);
    }
    return { name:'I leader pace clears the finish within the round timer',
             pass: bad.length===0, detail: bad.length? bad.join('; ') : JSON.stringify(rate) };
  }

  window.__checks = {
    run(opts){
      opts = opts||{};
      const only = opts.only ? new Set(opts.only.split('')) : null;
      const all = [
        ['A',checkA],['B',checkB],['C',checkC],['D',checkD],
        ['E',checkE],['F',checkF],['G',()=>checkG(opts.half)],['H',checkH],
        ['J',checkJ],['K',checkK],['M',checkM],['N',checkN],['O',checkO],['P',checkP],['Q',checkQ],['R',checkR],
        ['S',checkS],['T',checkT],['U',checkU],['V',checkV],['W',checkW],['X',checkX],
        ['I',()=>checkI(!!opts.full)]
      ];
      const results = [];
      for(const [id,fn] of all){
        if(only && !only.has(id)) continue;
        try { results.push(fn()); }
        catch(e){ results.push({ name:id+' THREW', pass:false, detail:e.message }); }
      }
      const failed = results.filter(r=>!r.pass);
      return {
        passed: results.length - failed.length,
        failed: failed.length,
        results: results.map(r=>(r.pass?'PASS  ':'FAIL  ')+r.name+'  ['+r.detail+']')
      };
    }
  };
