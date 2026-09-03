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
  const MINIGAME_KEYS = ['lava','boulder','doors','tiles','blockdash','hex','laser','tracer','shrink','spin','collect'];
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
    for(let k=0;k<6;k++){
      look.yaw = 0; look.pitch = 0; look.sinceInput = 0;
      p.x = TRACK_W/2; p.y = openY; p.vx = 0; p.vy = 0; window.__dbg.tick(10);
    }
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
      // hold it there: sinceInput stays 0, as though a hand were still on it
      for(let k=0;k<8;k++){
        look.yaw = Math.PI*yaw; look.pitch = -0.5; look.sinceInput = 0;
        p.x = 26; p.y = openY; p.vx = 0; p.vy = 0; window.__dbg.tick(10);
      }
      blockedMin = Math.min(blockedMin, ...fadeables.map(m=>m.material.opacity));
    }
    if(!fadeables.length) bad.push('nothing registered as fadeable');
    if(clearMin < 0.9)    bad.push('faded with a clear line of sight ('+clearMin.toFixed(2)+')');

    // (b) With the wall in the way the racer must still be visible: either the
    //     boom pulled in short of it, or what is left in the way went see-through.
    const boomBlocked = camReach;
    for(let k=0;k<8;k++){
      look.yaw = 0; look.pitch = -0.5; look.sinceInput = 0;
      p.x = TRACK_W/2; p.y = openY; p.vx = 0; p.vy = 0; window.__dbg.tick(10);
    }
    const boomClear = camReach;
    look.pitch = 0; look.sinceInput = 99;
    const pulledIn = boomClear - boomBlocked;
    if(pulledIn < 25 && blockedMin > 0.6)
      bad.push('camera sat behind the wall: boom '+boomClear.toFixed(0)+'->'+boomBlocked.toFixed(0)
               +' and nothing faded ('+blockedMin.toFixed(2)+')');

    return { name:'P camera fades occluders and keeps out of walls',
             pass: bad.length===0,
             detail: bad.length? bad.join('; ')
                   : fadeables.length+' fadeables, clear '+clearMin.toFixed(2)
                     +', blocked: boom '+boomClear.toFixed(0)+'->'+boomBlocked.toFixed(0)
                     +' and fade '+blockedMin.toFixed(2) };
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

    // And it must come back, or the course runs out of floor. Watch for it
    // rather than sampling one instant: a bot standing there re-arms the fuse
    // the moment it rebuilds, so it can be gone again by the time we look.
    p.x = slab.x; p.y = o.yStart - 400; p.h = 0; p.falling = false;
    let cameBack = false;
    for(let i=0; i<Math.ceil(o.respawnTime*60) + 120 && !cameBack; i++){
      window.__dbg.tick(1);
      if(!slab.gone) cameBack = true;
    }
    if(!cameBack) bad.push('slab never rebuilt after '+o.respawnTime+'s');

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
      p.x = o.cx; p.y = o.y; p.h = 0; p.vx = 0; p.vy = 0;
      p.stumbleT = 0; p.tumbleT = 0; p.falling = false;
      const yBefore = p.y;
      window.__dbg.tick(2);
      if(p.stumbleT > 0 || p.tumbleT > 0){ hit = true; pushed = p.y - yBefore; best = p.vy; }
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
    // Measure the shove against how far the racer had got, not against where
    // they started: drifting forward before the wave lands made a real push
    // read as zero.
    let hit = false, worst = 0, peak = p.y;
    for(let i=0; i<600; i++){
      window.__dbg.tick(2);
      if(p.stumbleT > 0 || (p.tumbleT||0) > 0) hit = true;
      if(p.y > peak) peak = p.y;
      const back = peak - p.y;
      if(back > worst) worst = back;
      if(hit && worst > 60) break;
    }
    if(!hit)        bad.push('no wave reached a racer standing still for 1200 ticks');
    // Racers block each other now, so part of a shove can be absorbed by
    // whoever is standing behind you.
    if(worst < 35)  bad.push('waves pushed the racer back only '+worst.toFixed(0));
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

  // ---------- Y: bumping another racer separates you, it does not floor you ----------
  function checkY(){
    const bad = [];
    begin('sunny');
    const a = player();
    const b = racers.find(r=>!r.isPlayer && !r.falling);
    if(!b) return { name:'Y racers block each other without knocking anyone over', pass:false, detail:'no other racer' };

    // (1) run straight into someone at full tilt
    // just inside contact range (RADIUS*2-2 = 32) and closing hard
    a.x = 300; a.y = 1500; a.h = 0; a.vx = 6.5; a.vy = 0; a.falling=false; a.stumbleT = 0; a.vh = 0; a.diveT = 0; a.invuln = 0;
    b.x = 328; b.y = 1500; b.h = 0; b.vx = 0;   b.vy = 0; b.falling=false; b.stumbleT = 0; b.vh = 0; b.diveT = 0; b.invuln = 0;
    racerCollisions();
    const hit = { aStum:a.stumbleT, bStum:b.stumbleT, aVh:a.vh, bVh:b.vh,
                  aSpd:Math.hypot(a.vx,a.vy), bSpd:Math.hypot(b.vx,b.vy) };
    if(hit.aStum > 0 || hit.bStum > 0) bad.push('contact stumbled someone (a '+hit.aStum+', b '+hit.bStum+')');
    if(hit.aVh > 0.05 || hit.bVh > 0.05) bad.push('contact launched someone off their feet (a '+hit.aVh.toFixed(2)+', b '+hit.bVh.toFixed(2)+')');
    // the runner should not be flung backwards, just slowed and turned aside
    if(a.vx < -0.5) bad.push('the racer who ran in was bounced back ('+a.vx.toFixed(2)+')');

    // (2) a dive is not a weapon either
    a.x = 300; a.y = 1500; a.h=0; a.vx = 8; a.vy=0; a.diveT = 400; a.stumbleT=0; a.vh=0; a.invuln=0;
    b.x = 328; b.y = 1500; b.h=0; b.vx = 0; b.vy=0; b.diveT = 0;   b.stumbleT=0; b.vh=0; b.invuln=0;
    racerCollisions();
    if(b.stumbleT > 0) bad.push('a dive still knocked someone over ('+b.stumbleT+')');

    // (3) but you still cannot walk through them
    a.x = 300; a.y = 1500; a.vx=0; a.vy=0; a.diveT=0;
    b.x = 306; b.y = 1500; b.vx=0; b.vy=0;               // deeply overlapped
    racerCollisions();
    const gap = Math.hypot(b.x-a.x, b.y-a.y);
    if(gap < RADIUS*2 - 6) bad.push('overlapping racers were not pushed apart (gap '+gap.toFixed(1)+' of '+(RADIUS*2)+')');

    // (4) and they still shove each other around enough to matter
    a.x = 300; a.y = 1500; a.vx = 6.5; a.vy = 0; a.stumbleT=0; a.vh=0;
    b.x = 328; b.y = 1500; b.vx = 0;   b.vy = 0; b.stumbleT=0; b.vh=0;
    const bx0 = b.x;
    for(let i=0;i<12;i++){ racerCollisions(); b.x += b.vx; a.x += a.vx*0.2; }
    if(Math.abs(b.x - bx0) < 3) bad.push('walking into someone did not push them at all ('+(b.x-bx0).toFixed(1)+')');

    return { name:'Y racers block each other without knocking anyone over', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : 'no stumble, no launch, separated to '+gap.toFixed(0)+', pushed '+(b.x-bx0).toFixed(1) };
  }

  // ---------- Z: laser hitboxes match the beams you can see ----------
  function checkZ(){
    const bad = [], seen = {};
    // The rig stands from its feet to about 33 above them; RADIUS across.
    const BODY_TOP = 33;
    function racerBox(r){
      const foot = (r.floorH||0) + r.h;
      return { lo: foot, hi: foot + BODY_TOP };
    }
    for(const key of ['laser','tracer','cyber']){
      begin(key);
      const t = window.__T || 0;
      const bars = obstacles.filter(o=>o.type==='laserbar');
      const spins = obstacles.filter(o=>o.type==='spinlaser');
      if(!bars.length && !spins.length) continue;
      const p = player();

      for(const o of bars.slice(0,4)){
        const beamLo = o.h - 5, beamHi = o.h + 5;
        // walk the racer up through the beam, on the floor and on a raised lane
        {
          for(let h=0; h<=70; h+=6){
            p.falling=false; p.invuln=0; p.stumbleT=0; p.tumbleT=0; p.diveT=0; p.vh=0; p.vx=0; p.vy=0;
            p.x = TRACK_W/2; p.y = laserY(o,t); p.h = h; p.floorH = 0;
            // Somewhere with nothing else in reach, or a spinbar takes the blame
            // for a beam that correctly missed.
            if(obstacles.some(o2 => o2.type!=='laserbar' &&
                 p.y > (o2.y0===undefined?-1e9:o2.y0)-40 &&
                 p.y < (o2.y1===undefined? 1e9:o2.y1)+40)) continue;
            const box = racerBox(p);
            // any beam sitting on this spot counts -- widening the sweep window
            // means several can overlap the same stretch of course
            const shouldHit = bars.some(o2 =>
              Math.abs(p.y - laserY(o2,t)) < 12 + RADIUS*0.60 &&
              box.hi > o2.h-5 && box.lo < o2.h+5);
            checkObstacles(p, t);
            const didHit = p.stumbleT > 0 || (p.tumbleT||0) > 0 || p.falling;
            seen.bar = (seen.bar||0)+1;
            if(didHit !== shouldHit){
              bad.push(key+' bar h'+o.h+' at h='+h
                       +': body '+box.lo.toFixed(0)+'-'+box.hi.toFixed(0)
                       +' vs beam '+beamLo+'-'+beamHi+', hit='+didHit+' expected='+shouldHit);
              break;
            }
          }
        }
        if(bad.length) break;

        // ...and it has to be solid the whole way along its sweep. The window
        // was pinned at the beam's home position, so once it slid away it
        // passed straight through everyone.
        for(let step=0; step<10 && !bad.length; step++){
          window.__dbg.tick(9);
          const tt = window.__T || 0;
          const by = laserY(o, tt);
          if(Math.abs(by - o.y) < o.span*0.45) continue;      // only test it out on the swing
          p.falling=false; p.invuln=0; p.stumbleT=0; p.diveT=0; p.vh=0; p.vx=0; p.vy=0;
          p.tumbleT = 0;
          p.x = TRACK_W/2; p.y = by; p.h = 0; p.floorH = 0;
          checkObstacles(p, tt);
          seen.sweep = (seen.sweep||0)+1;
          if(!(p.stumbleT > 0 || (p.tumbleT||0) > 0))
            bad.push(key+' bar swept to '+(by-o.y).toFixed(0)+' from home and passed through the racer');
        }
        if(bad.length) break;
      }
      if(bad.length) break;

      for(const o of spins.slice(0,2)){
        const beamLo = o.h - 6, beamHi = o.h + 6;
        {
          const floorH = 0;
          p.falling=false; p.invuln=0; p.stumbleT=0; p.tumbleT=0; p.diveT=0; p.vh=0; p.vx=0; p.vy=0;
          // sit right under an arm, at ground level on a raised floor
          const ang = spinlaserAngle(o, t);
          p.x = clamp(o.cx + Math.cos(ang)*o.len*0.6, 30, TRACK_W-30);
          p.y = o.y + Math.sin(ang)*o.len*0.6;
          p.h = 0; p.floorH = floorH;
          const box = racerBox(p);
          const shouldHit = box.hi > beamLo && box.lo < beamHi
            && !bars.some(o2 => Math.abs(p.y - laserY(o2,t)) < 12 + RADIUS*0.60
                                && box.hi > o2.h-5 && box.lo < o2.h+5);
          checkObstacles(p, t);
          const didHit = p.stumbleT > 0 || (p.tumbleT||0) > 0 || p.falling;
          seen.spin = (seen.spin||0)+1;
          if(didHit !== shouldHit){
            bad.push(key+' spinlaser floor'+floorH+': body '+box.lo.toFixed(0)+'-'+box.hi.toFixed(0)
                     +' vs beam '+beamLo+'-'+beamHi+', hit='+didHit+' expected='+shouldHit);
            break;
          }
        }
        if(bad.length) break;
      }
      if(bad.length) break;
    }
    return { name:'Z laser hitboxes match the beams on screen', pass: bad.length===0,
             detail: bad.length ? bad.slice(0,3).join(' | ') : JSON.stringify(seen)+' probes agree' };
  }

  // ---------- 1: the chase camera sits behind, stays level, and recentres ----------
  function check1(){
    const bad = [];
    const ndc = new THREE.Vector3();
    function racerNDC(){
      const p = player();
      const w = toWorld(p.x, p.y, (p.floorH||0) + p.h + RADIUS);
      camera.updateMatrixWorld(true);
      ndc.set(w.x, w.y, w.z).project(camera);
      return {x:ndc.x, y:ndc.y};
    }
    function camElev(){
      const p = player();
      const w = toWorld(p.x, p.y, (p.floorH||0) + p.h);
      const dx = camera.position.x - w.x, dy = camera.position.y - w.y, dz = camera.position.z - w.z;
      return Math.atan2(dy, Math.hypot(dx, dz));
    }

    begin('sunny');
    const p = player();
    p.x = TRACK_W/2; p.y = 1400; p.h = 0; p.vx=0; p.vy=0; p.vh=0; p.falling=false;
    resetLook(); window.__dbg.tick(60);

    // (a) the racer sits in the middle of the frame, not down in the corner
    const centred = racerNDC();
    if(!isFinite(centred.x) || !isFinite(centred.y)) bad.push('could not project the racer at all');
    if(Math.abs(centred.x) > 0.14) bad.push('racer is off-centre horizontally ('+centred.x.toFixed(2)+')');
    if(Math.abs(centred.y) > 0.30) bad.push('racer is not vertically centred ('+centred.y.toFixed(2)+')');

    // (b) jumping must not swing the camera down
    const flatElev = camElev();
    doJump(p);
    let worst = 0;
    for(let i=0;i<80;i++){
      window.__dbg.tick(1);
      worst = Math.max(worst, Math.abs(camElev() - flatElev));
      if(p.h <= 0 && i > 6) break;
    }
    if(worst > 0.09) bad.push('camera angle swung '+worst.toFixed(3)+' rad over a jump');

    // (c) the racer stays on screen through the jump
    p.h = 0; p.vh = 0; window.__dbg.tick(20);
    doJump(p); window.__dbg.tick(14);
    const air = racerNDC();
    if(Math.abs(air.x) > 0.25 || Math.abs(air.y) > 0.75) bad.push('racer left frame mid-jump ('+air.x.toFixed(2)+','+air.y.toFixed(2)+')');

    // (d) look away by hand, let go, and the view comes back behind on its own
    p.h = 0; p.vh = 0; p.vy = 4;
    look.yaw = 1.15; look.sinceInput = 0; window.__dbg.tick(4);
    const swung = look.yaw;
    window.__dbg.tick(150);                                   // 2.5s hands off
    const back = Math.abs(look.yaw);
    if(back > 0.22) bad.push('view did not recentre in 2.5s (yaw '+swung.toFixed(2)+' -> '+look.yaw.toFixed(2)+')');
    if(back < 0.0005 && swung > 0) seen1 = 0;                 // fine, fully home

    // (e) it must not snap: one frame cannot eat the whole swing
    look.yaw = 1.15; look.sinceInput = 9; window.__dbg.tick(1);
    const afterOne = Math.abs(look.yaw);
    if(afterOne < 0.55) bad.push('recentre snapped instead of easing (1.15 -> '+look.yaw.toFixed(2)+' in one frame)');

    return { name:'1 chase camera stays centred, level and self-recentring', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : 'centre '+centred.x.toFixed(2)+','+centred.y.toFixed(2)
                 +'  jump swing '+worst.toFixed(3)+' rad  recentre '+swung.toFixed(2)+'->'+back.toFixed(2) };
  }
  let seen1 = 0;

  // ---------- 2: a fork is two routes, and you have to commit to one ----------
  function check2(){
    const bad = [];
    let o = null, key = null;
    for(const k of ['sunny','neon','candy','bumperb']){
      for(let a=0; a<8 && !o; a++){ begin(k); o = obstacles.find(x=>x.type==='fork'); key = k; }
      if(o) break;
    }
    if(!o) return { name:'2 forks offer two routes and make you pick one', pass:false, detail:'no fork generated' };

    // the fast side is a raised lane; the slow side is clear floor with furniture
    const lane = obstacles.find(x=>x.type==='shortcut' && x.yStart >= o.yStart-10 && x.yEnd <= o.yEnd+10);
    if(!lane) bad.push('fork has no fast lane');
    else if(Math.sign(lane.cx - o.cx) !== o.risk) bad.push('the fast lane is not on the risky side');
    const posts = obstacles.filter(x=>x.type==='pillars' && x.y > o.yStart && x.y < o.yEnd
                                      && Math.sign(x.items[0].x - o.cx) === -o.risk);
    if(posts.length < 2) bad.push('the safe side is a clear run ('+posts.length+' obstacles)');

    // the divider must actually stop you crossing
    const p = player();
    const side = -o.risk;                                   // start on the safe side
    p.y = (o.wallFrom + o.yEnd)/2; p.h = 0; p.vy = 0; p.falling = false; p.stumbleT = 0;
    p.x = o.cx + side*70; p.vx = -side*7;                    // drive straight at the wall
    for(let i=0;i<25;i++){ window.__dbg.tick(1); if(Math.sign(p.x-o.cx) !== side) break; }
    if(Math.sign(p.x - o.cx) !== side) bad.push('the divider let a racer walk straight through it');
    const cleared = Math.abs(p.x - o.cx);
    if(cleared < RADIUS) bad.push('racer ended up inside the divider ('+cleared.toFixed(0)+')');

    // ...but before the wall starts, both sides are open
    p.x = o.cx; p.y = o.yStart + 20; p.vx = 0; p.vy = 0;
    window.__dbg.tick(2);
    if(Math.abs(p.x - o.cx) > RADIUS + 12) bad.push('the split is walled off before the choice is offered');

    return { name:'2 forks offer two routes and make you pick one', pass: bad.length===0,
             detail: bad.length ? key+': '+bad.join('; ')
               : key+': fast lane at '+lane.cx.toFixed(0)+', '+posts.length+' obstacles on the safe side, divider held' };
  }

  // ---------- 3: a gate funnels the pack into two doors ----------
  function check3(){
    const bad = [];
    let o = null, key = null;
    for(const k of ['sunny','neon','candy','bumperb']){
      for(let a=0; a<8 && !o; a++){ begin(k); o = obstacles.find(x=>x.type==='gate'); key = k; }
      if(o) break;
    }
    if(!o) return { name:'3 gates funnel the pack through two doors', pass:false, detail:'no gate generated' };

    const p = player();
    // walk into the solid part and you stop
    const solidX = clamp((o.xs[0] + o.xs[1])/2, 40, TRACK_W-40);
    p.x = solidX; p.y = o.y - 90; p.h = 0; p.vx = 0; p.vy = 7; p.falling = false; p.stumbleT = 0;
    window.__dbg.hold('w', true);
    for(let i=0;i<40;i++) window.__dbg.tick(1);
    window.__dbg.hold('w', false);
    const stoppedAt = p.y;
    if(stoppedAt > o.y + o.d/2) bad.push('walked straight through the wall (y '+stoppedAt.toFixed(0)+' past '+o.y+')');

    // ...through a door and you are fine
    p.x = o.xs[0]; p.y = o.y - 90; p.vx = 0; p.vy = 7; p.falling = false; p.stumbleT = 0;
    window.__dbg.hold('w', true);
    for(let i=0;i<60;i++) window.__dbg.tick(1);
    window.__dbg.hold('w', false);
    const through = p.y;
    if(through < o.y + o.d/2) bad.push('the door did not let a racer through (y '+through.toFixed(0)+')');

    // a jam is the point: the pack should not all fit at once
    const doorSpan = o.xs.length * o.gapW;
    if(doorSpan > TRACK_W*0.45) bad.push('doors are too wide to funnel anyone ('+doorSpan+' of '+TRACK_W+')');

    return { name:'3 gates funnel the pack through two doors', pass: bad.length===0,
             detail: bad.length ? key+': '+bad.join('; ')
               : key+': blocked at '+stoppedAt.toFixed(0)+', through at '+through.toFixed(0)+', doors '+doorSpan+' of '+TRACK_W };
  }

  // ---------- 4: the closing circle closes, and takes people with it ----------
  function check4(){
    const bad = [];
    begin('shrink');
    const ring = obstacles.find(o=>o.type==='ring');
    if(!ring) return { name:'4 the closing circle shrinks and eliminates', pass:false, detail:'no ring' };
    if(!currentMap.knockout) bad.push('not flagged knockout');
    const r0 = ring.r;

    let ticks = 0, ended = false;
    window.__dbg.hold('w', true);
    while(ticks < 3600 && !ended){ window.__dbg.tick(60); ticks += 60; ended = (state !== 'racing'); }
    window.__dbg.hold('w', false);

    const shrank = r0 - ring.r;
    const out = racers.filter(r=>r.lavaOut).length;
    const alive = racers.length - out;
    if(shrank < 200)  bad.push('the ring barely moved ('+shrank.toFixed(0)+' of '+r0+')');
    if(ring.r < ring.rMin - 1) bad.push('the ring shrank past its floor ('+ring.r.toFixed(0)+')');
    if(out === 0)     bad.push('nobody was caught outside');
    if(alive === 0)   bad.push('the ring wiped out the entire field');
    if(!ended)        bad.push('round never ended');
    if(ticks/60 < 12) bad.push('ended after only '+(ticks/60)+'s');

    return { name:'4 the closing circle shrinks and eliminates', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : 'closed '+r0.toFixed(0)+' -> '+ring.r.toFixed(0)+', '+out+' out, '+alive+' left, '+(ticks/60)+'s' };
  }

  // ---------- 5: the carousel turns under you, and it is the final ----------
  function check5(){
    const bad = [];
    begin('spin');
    const disc = obstacles.find(o=>o.type==='disc');
    if(!disc) return { name:'5 the carousel turns and finishes the match', pass:false, detail:'no disc' };
    if(!currentMap.knockout) bad.push('not flagged knockout');
    if(!currentMap.final)    bad.push('not marked as a final');

    // stand still off-centre: the floor should carry you round
    const p = player();
    p.x = disc.cx + disc.r*0.55; p.y = disc.y; p.h = 0; p.vx = 0; p.vy = 0; p.falling = false; p.stumbleT = 0;
    const a0 = Math.atan2(p.y-disc.y, p.x-disc.cx);
    for(let i=0;i<60;i++){
      window.__dbg.tick(1);
      if(p.falling) break;
      // hold them at radius so we are measuring rotation, not drift
      const a = Math.atan2(p.y-disc.y, p.x-disc.cx), rr = Math.hypot(p.x-disc.cx, p.y-disc.y);
      if(rr > disc.r*0.9){ p.x = disc.cx + Math.cos(a)*disc.r*0.55; p.y = disc.y + Math.sin(a)*disc.r*0.55; }
    }
    const a1 = Math.atan2(p.y-disc.y, p.x-disc.cx);
    let swept = a1 - a0; while(swept > Math.PI) swept -= Math.PI*2; while(swept < -Math.PI) swept += Math.PI*2;
    if(Math.abs(swept) < 0.05) bad.push('the floor did not carry a standing racer ('+swept.toFixed(3)+' rad)');
    if(Math.sign(swept) !== Math.sign(disc.speed)) bad.push('carried the wrong way round');

    // step off the edge and you are out
    p.x = disc.cx + disc.r + 40; p.y = disc.y; p.h = 0; p.falling = false;
    window.__dbg.tick(3);
    if(!p.falling && !p.lavaOut) bad.push('walking off the edge did nothing');

    return { name:'5 the carousel turns and finishes the match', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : 'swept '+swept.toFixed(3)+' rad at '+disc.speed.toFixed(2)+' rad/s, edge drops you' };
  }

  // ---------- 6: a big hit sends you tumbling, and you get back up ----------
  function check6(){
    const bad = [];
    let o = null;
    for(let a=0; a<10 && !o; a++){ begin('jungle'); o = obstacles.find(x=>x.type==='log'); }
    if(!o) return { name:'6 hard hits tumble you, then you recover', pass:false, detail:'no log to be hit by' };

    const p = player();
    let hit = false;
    for(let i=0; i<200 && !hit; i++){
      p.x = o.cx; p.y = o.y; p.h = 0; p.vx = 0; p.vy = 0;
      p.stumbleT = 0; p.tumbleT = 0; p.tumbleAng = 0; p.invuln = 0; p.falling = false;
      window.__dbg.tick(2);
      hit = (p.tumbleT||0) > 0;
    }
    if(!hit) return { name:'6 hard hits tumble you, then you recover', pass:false,
                      detail:'the log connected but never set a tumble going' };

    // it has to actually turn over, not just wobble
    const a0 = p.tumbleAng || 0;
    window.__dbg.tick(30);
    const spun = Math.abs((p.tumbleAng||0) - a0);
    if(spun < 1.2) bad.push('barely rotated in half a second ('+spun.toFixed(2)+' rad)');

    // and it has to end: no permanent cartwheel
    let ticks = 0;
    while(ticks < 300 && (p.tumbleT||0) > 0){ window.__dbg.tick(5); ticks += 5; }
    if((p.tumbleT||0) > 0) bad.push('still tumbling after 5s');
    if(p.h > 0.5)          bad.push('finished the tumble in mid-air');

    // ...and you can drive again afterwards
    p.invuln = 0; p.stumbleT = 0;
    const y0 = p.y;
    window.__dbg.hold('w', true); window.__dbg.tick(60); window.__dbg.hold('w', false);
    const gained = p.y - y0;
    if(gained < 60) bad.push('could not run after getting up (gained '+gained.toFixed(0)+')');

    return { name:'6 hard hits tumble you, then you recover', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : 'spun '+spun.toFixed(2)+' rad, up in '+(ticks/60).toFixed(1)+'s, ran '+gained.toFixed(0)+' after' };
  }

  // ---------- 7: falling behind gives you something back ----------
  function check7(){
    const bad = [];
    begin('sunny');

    // (a) second wind: get up off the floor and you go again harder
    const p = player();
    // Find a clear stretch first: started inside a gate, both runs went
    // backwards and the comparison was meaningless.
    // Courses are busy enough now that a 600-unit hole may not exist. Fall back
    // to the run-in past the last obstacle rather than to a fixed spot that
    // might sit inside a gate -- both runs then go backwards and prove nothing.
    let openY = null;
    for(let y=700; y<trackLength-400; y+=120){
      if(!obstacles.some(o=>y > (o.y0===undefined?-1e9:o.y0)-260 && y < (o.y1===undefined?1e9:o.y1)+260)){ openY = y; break; }
    }
    if(openY === null){
      let last = 0;
      for(const o of obstacles) last = Math.max(last, o.y1===undefined?0:o.y1);
      openY = Math.min(last + 300, trackLength - 200);
    }
    function runFrom(setup){
      // Nobody else in the lane: the two runs happen back to back, and a bot
      // drifting into the second one was enough to reverse the result.
      for(const r of racers) if(!r.isPlayer){ r.y = -9000; r.vx = 0; r.vy = 0; }
      const q = player();
      q.x = TRACK_W/2; q.y = openY; q.h = 0; q.vx = 0; q.vy = 0; q.falling = false;
      q.stumbleT = 0; q.getUpT = 0; q.windT = 0; q.tumbleT = 0; q.invuln = 900;
      setup(q);
      const y0 = q.y;
      window.__dbg.hold('w', true); window.__dbg.tick(45); window.__dbg.hold('w', false);
      return q.y - y0;
    }
    const plain = runFrom(()=>{});
    const wind  = runFrom(q=>{ q.windT = 1600; });
    if(wind <= plain + 4) bad.push('second wind did nothing ('+wind.toFixed(0)+' vs '+plain.toFixed(0)+')');
    if(wind > plain*1.6)  bad.push('second wind is a rocket ('+wind.toFixed(0)+' vs '+plain.toFixed(0)+')');

    // (b) the draft has to pay more the further back you are
    function draftAt(myY, leadY){
      for(const r of racers){ if(!r.isPlayer){ r.y = -8000; r.draft = 0; } }
      const me = player(); const mate = racers.find(r=>!r.isPlayer);
      me.x = TRACK_W/2; me.y = myY; me.h = 0; me.falling = false; me.finished = false;
      mate.x = TRACK_W/2; mate.y = myY + 90; mate.h = 0; mate.falling = false; mate.finished = false;
      // somebody has to be out in front for "behind" to mean anything
      const lead = racers.find(r=>!r.isPlayer && r!==mate);
      if(lead){ lead.x = 40; lead.y = leadY; lead.h = 0; lead.falling = false; lead.finished = false; }
      updateSlipstream();
      return me.draft || 0;
    }
    const near = draftAt(4000, 4300);
    const far  = draftAt(1200, 6500);
    if(near <= 0)      bad.push('no draft at all');
    if(far <= near+0.005) bad.push('being 5000 back drafted no harder ('+far.toFixed(3)+' vs '+near.toFixed(3)+')');
    if(far > 0.30)     bad.push('draft is a tow rope ('+far.toFixed(3)+')');

    return { name:'7 a knockdown and a deficit both give something back', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : 'wind '+plain.toFixed(0)+' -> '+wind.toFixed(0)+', draft '+near.toFixed(3)+' -> '+far.toFixed(3) };
  }

  // ---------- 8: Gem Grab is collect-and-qualify, not a race ----------
  function check8(){
    const bad = [];
    begin('collect');
    const field = obstacles.find(o=>o.type==='gems');
    if(!field) return { name:'8 Gem Grab collects and qualifies', pass:false, detail:'no gems generated' };
    if(!currentMap.knockout) bad.push('not flagged knockout');
    if(field.items.length < 20) bad.push('only '+field.items.length+' gems for 16 racers');
    if(!field.need || field.need < 2) bad.push('no target to collect ('+field.need+')');

    // walking over one picks it up, once
    const p = player();
    const gem = field.items.find(g=>!g.taken);
    p.gems = 0; p.x = gem.x; p.y = gem.y; p.h = 0; p.vx = 0; p.vy = 0; p.falling = false;
    window.__dbg.tick(1);                     // one frame, one gem
    if(!gem.taken)   bad.push('walked over a gem and it stayed there');
    if(p.gems !== 1) bad.push('pick-up did not count ('+p.gems+')');
    // Stand back on the same spot with nothing else in reach: a taken gem must
    // not keep paying out.
    const before = p.gems;
    for(const g of field.items) if(g !== gem && Math.abs(g.x-gem.x)<80 && Math.abs(g.y-gem.y)<80) g.taken = true;
    window.__dbg.tick(6);
    if(p.gems !== before) bad.push('the same gem counted twice');
    if(!gem.taken) bad.push('the gem came back');

    // the bots have to play it too, or the player wins by walking
    let ticks = 0, ended = false;
    window.__dbg.hold('w', true);
    while(ticks < 3600 && !ended){ window.__dbg.tick(60); ticks += 60; ended = (state !== 'racing'); }
    window.__dbg.hold('w', false);
    const collected = racers.reduce((n,r)=>n+(r.gems||0), 0);
    const qualified = racers.filter(r=>(r.gems||0) >= field.need).length;
    const out = racers.filter(r=>r.lavaOut).length;
    if(collected < 12)  bad.push('the field collected almost nothing ('+collected+')');
    if(qualified === 0) bad.push('nobody reached the target');
    if(!ended)          bad.push('round never ended');
    if(out === 0)       bad.push('nobody was knocked out');
    if(racers.length - out === 0) bad.push('everybody was knocked out');

    return { name:'8 Gem Grab collects and qualifies', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : field.items.length+' gems, need '+field.need+', '+collected+' taken, '
                 +qualified+' qualified, '+out+' out in '+(ticks/60)+'s' };
  }

  // ---------- 9: obstacles set each other off ----------
  function check9(){
    const bad = [], got = {};

    // (a) a cannonball brings a crumbling slab down
    let cr = null;
    for(let a=0; a<8 && !cr; a++){ begin('sky'); cr = obstacles.find(o=>o.type==='crumble'); }
    if(!cr) bad.push('no crumble to shoot at');
    else {
      const slab = cr.slabs.find(s=>!s.gone);
      shots.length = 0;
      shots.push({ x:slab.x, y:slab.y, h:cr.h+6, vx:0, vy:0, r:28, life:3 });
      window.__dbg.tick(3);
      got.slab = slab.gone || slab.fuse > 0;
      if(!got.slab) bad.push('a cannonball went through a slab and left it standing');
    }

    // (b) a cannonball sets a bumper off, and the bumper shoves whoever is on it
    let bp = null;
    for(let a=0; a<8 && !bp; a++){ begin('bumperb'); bp = obstacles.find(o=>o.type==='bumper'); }
    if(!bp) bad.push('no bumper to shoot at');
    else {
      const it = bp.items[0];
      const p = player();
      p.x = it.x + it.r + RADIUS - 4; p.y = bp.y; p.h = 0; p.vx = 0; p.vy = 0;
      p.falling = false; p.stumbleT = 0; p.invuln = 0;
      const vx0 = p.vx;
      shots.length = 0;
      shots.push({ x:it.x, y:bp.y, h:20, vx:0, vy:0, r:26, life:3 });
      window.__dbg.tick(3);
      got.bumper = +(it.hit||0).toFixed(2);
      if(!(it.hit > 0)) bad.push('the bumper ignored a direct hit');
      if(Math.abs(p.vx - vx0) < 1) bad.push('a triggered bumper did not shove anyone ('+p.vx.toFixed(2)+')');
    }

    return { name:'9 obstacles set each other off', pass: bad.length===0,
             detail: bad.length ? bad.join('; ') : JSON.stringify(got) };
  }

  // ---------- 0: each map brings its own music, and it knows when to stop ----------
  function check0(){
    const bad = [];
    settings.sound = true;

    begin('sunny');
    window.__dbg.tick(30);
    const a = musicState();
    if(!a.playing) bad.push('no music during a race');

    begin('neon');
    window.__dbg.tick(30);
    const b = musicState();
    if(!b.playing) bad.push('no music on the second map');
    if(a.key === b.key && a.tempo === b.tempo)
      bad.push('both maps play the same bed (key '+a.key+', tempo '+a.tempo+')');

    // the menu is quiet
    goHome();
    window.__dbg.tick(20);
    if(musicState().playing) bad.push('music kept playing back at the menu');

    // and the sound switch means it
    settings.sound = false;
    begin('sunny');
    window.__dbg.tick(30);
    if(musicState().playing) bad.push('music ignored the sound setting');
    settings.sound = true;
    goHome();

    return { name:'0 each map has its own music, and it stops', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : 'sunny key '+a.key+' at '+a.tempo+', neon key '+b.key+' at '+b.tempo+', quiet in menu' };
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
      if(currentMap.knockout) continue;      // no finish line to pace towards
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
        ['Y',checkY],['Z',checkZ],['1',check1],
        ['2',check2],['3',check3],['4',check4],['5',check5],
        ['6',check6],['7',check7],['8',check8],['9',check9],['0',check0],
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
