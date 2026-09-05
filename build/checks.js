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
  const CORRIDOR_MAPS = ['sunny','neon'];
  const PATH_MAPS     = ['cannonc','slide'];
  const MINIGAME_KEYS = ['lava','doors','tiles','shrink'];
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

  // Everything a previous round can leave lying about. startRound rebuilds
  // racers and obstacles but nothing else, so particles, coin toasts, in-flight
  // cannonballs, the lava height and the arena fence all carried over -- which
  // is why a full-suite number moved depending on what ran before it.
  function wipeRoundState(){
    try{ particles.length = 0; }catch(e){}
    try{ coinPops.length = 0; renderCoinPops(0); }catch(e){}
    try{ shots.length = 0; }catch(e){}
    try{ boulders.length = 0; }catch(e){}
    try{ waves.length = 0; }catch(e){}
    try{ bannerTimer = 0; }catch(e){}
    try{ lavaZ = 0; }catch(e){}
    try{ arenaEnd = 0; }catch(e){}
    try{ camShake = 0; }catch(e){}
    try{ obsBoost = 0; mapEvent = null; hideEventBanner(); }catch(e){}
    try{ stopMusic(); }catch(e){}
    try{ leaveSpectate(); }catch(e){}
    try{ resetLook(); }catch(e){}
    try{ window.__dbg.hold('w', false); window.__dbg.hold('s', false);
         window.__dbg.hold('a', false); window.__dbg.hold('d', false);
         window.__dbg.hold(settings.keys.jump, false); }catch(e){}
  }

  function begin(mapKey, round){
    wipeRoundState();
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
           o.type==='mover'||o.type==='crumble'||o.type==='gap') &&
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
    for(let i=0;i<24;i++){ window.__dbg.tick(50); got.cannonShots = Math.max(got.cannonShots, shots.length); }
    window.__dbg.hold('w',false);
    if(got.cannonShots === 0) bad.push('no cannonballs in flight');

    got.boulders = -1;

    window.__dbg.hold('w',false);

    }
    if(doB){

    begin('tiles'); window.__dbg.hold('w',true); window.__dbg.tick(300);
    const tf = obstacles.find(o=>o.type==='tilefield');
    got.tilesGone = tf ? tf.tiles.filter(x=>x.gone).length : -1;
    window.__dbg.hold('w',false);
    if(got.tilesGone <= 0) bad.push('no tiles crumbled');

    window.__dbg.hold('w',false);
    }

    return { name:'G minigame mechanics tick', pass: bad.length===0,
             detail: bad.length? bad.join('; ') : JSON.stringify(got) };
  }

  // ---------- J: swinging hazards stay above the floor ----------
  function checkJ(){
    const bad = [];
    for(const key of ['neon']){
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
    // Assert the tow itself, not the top speed it produces. Inferring it from
    // peak vy was confounded: both runs saturate at terminal velocity, and the
    // reading swung between +7% and -1% run to run.
    begin('sunny');
    function draftWith(gapAhead){
      const p = player();
      for(const r of racers) if(r!==p){ r.x=-9999; r.y=-9999; r.vx=0; r.vy=0; r.draft=0; }
      p.x=TRACK_W/2; p.y=2000; p.vx=0; p.vy=4; p.h=0; p.falling=false; p.finished=false;
      if(gapAhead !== null){
        const mate = racers.find(r=>!r.isPlayer);
        mate.x=TRACK_W/2; mate.y=p.y+gapAhead; mate.h=0; mate.falling=false; mate.finished=false;
      }
      updateSlipstream();
      return p.draft || 0;
    }
    const alone   = draftWith(null);
    const tucked  = draftWith(70);
    const distant = draftWith(320);          // beyond DRAFT_FAR, no tow

    const bad = [];
    if(alone   > 0.001) bad.push('drafting nobody still gave a tow ('+alone.toFixed(3)+')');
    if(tucked  < 0.05)  bad.push('tucking in 70 behind gave only '+tucked.toFixed(3));
    if(tucked  > 0.30)  bad.push('the tow is a rope ('+tucked.toFixed(3)+')');
    if(distant > 0.001) bad.push('a racer 320 ahead still towed ('+distant.toFixed(3)+')');

    return { name:'K slipstream tows a trailing racer', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : 'alone '+alone.toFixed(3)+', tucked in '+tucked.toFixed(3)+', 320 back '+distant.toFixed(3) };
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
    // Two of the four race maps are built on a path; the other two are meant
    // to be straight corridors, so this is now "both shaped ones are shaped".
    return { name:'M the path maps are shaped, not straight corridors',
             pass: shaped.length >= PATH_MAPS.length,
             detail: shaped.length+' shaped of '+(CORRIDOR_MAPS.length+PATH_MAPS.length)+' -- '+JSON.stringify(prof) };
  }

  // ---------- N: Tile Tumble drops you a floor at a time ----------
  // Judged over five layouts on medians, like the acceptance run: a single
  // layout that collapses early should not fail the build.
  function checkN(){
    const bad = [], runs = [];
    // Nine rounds, not five. A Tile Tumble round is 3-4 out and 50s most of the
    // time, but a quarter of them end early with one or two gone, and a median
    // of five samples lands on that tail often enough to fail a good build.
    for(let i=0;i<9;i++){
      begin('tiles');
      if(!currentMap.knockout) return { name:'N Tile Tumble drops you a floor at a time',
                                        pass:false, detail:'tiles is not flagged knockout' };
      window.__dbg.hold('w', true);
      let ticks = 0, ended = false, everDropped = false;
      while(ticks < 6000 && !ended){
        window.__dbg.tick(60); ticks += 60;
        ended = (state !== 'racing');
        if(racers.some(r=>(r.tileLayer||0) > 0)) everDropped = true;
      }
      window.__dbg.hold('w', false);
      runs.push({ secs: ticks/60, out: racers.filter(r=>r.lavaOut).length, everDropped });
    }
    const med = a => [...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
    const medSecs = med(runs.map(r=>r.secs));
    const medOut  = med(runs.map(r=>r.out));

    if(medSecs < 35)  bad.push('median round only '+medSecs+'s, want 35-60');
    if(medSecs > 60)  bad.push('median round '+medSecs+'s, past the 60s limit');
    if(medOut < 3)    bad.push('median '+medOut+' eliminated, want 3-6');
    if(medOut > 6)    bad.push('median '+medOut+' eliminated, want 3-6');
    if(!runs.some(r=>r.everDropped)) bad.push('nobody ever dropped to a lower floor');

    const spread = runs.map(r=>r.out+'/'+r.secs+'s').join(' ');
    return { name:'N Tile Tumble drops you a floor at a time', pass: bad.length===0,
             detail: (bad.length ? bad.join('; ') + ' -- ' : 'median '+medSecs+'s, '+medOut+' out, floors used -- ')
                     + 'rounds: ' + spread };
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
    // Which wall, and which way the camera swings behind it, both depend on the
    // layout. Hunting one wall in one direction meant the check occasionally
    // found no geometry at all and reported a working camera as broken.
    let blockedMin = 1;
    const spots = [];
    for(const wallX of [26, TRACK_W-26]) for(const sign of [1,-1]) spots.push([wallX,sign]);
    for(const [wallX, sign] of spots){
     for(const yaw of [0.38, 0.52, 0.66, 0.80, 0.94]){
      // The camera lerps to a new orbit over ~25 frames, so hold long enough for
      // the fade to settle after it arrives. Re-pin every slice: over a hold this
      // long the pack barges the racer off the wall, and then of course nothing
      // is blocking the view any more.
      // hold it there: sinceInput stays 0, as though a hand were still on it
      for(let k=0;k<8;k++){
        look.yaw = Math.PI*yaw*sign; look.pitch = -0.5; look.sinceInput = 0;
        p.x = wallX; p.y = openY; p.vx = 0; p.vy = 0; window.__dbg.tick(10);
      }
      blockedMin = Math.min(blockedMin, ...fadeables.map(m=>m.material.opacity));
     }
     if(blockedMin <= 0.6) break;                  // found the blocked view
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
    for(const key of ['slide','neon']){
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
    if(near > 430)     bad.push('camera settled '+near.toFixed(0)+' from the racer it is watching');
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
    while(ticks < 6000 && state === 'racing'){ window.__dbg.tick(60); ticks += 60; }
    if(state === 'racing')                          bad.push('round never ended');
    else if(!$('specBar').classList.contains('hidden')) bad.push('spectator bar survived the round');

    return { name:'R spectator follows survivors when you are out', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : 'watched '+nameOf(a)+' of '+aliveN+' alive, camera '+near.toFixed(0)+' away (own body '+fromMe.toFixed(0)+')' };
  }

  // ---------- T: falling floors drop you, then rebuild ----------
  function checkT(){
    const bad = [];
    let o = null, key = null;
    for(const k of ['sunny','cannonc','slide']){
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

      // Somewhere with room to be blown sideways: a fork divider pins your x,
      // and then a working crosswind reads as no crosswind at all.
      let openY = null;
      for(let y=700; y<trackLength-400; y+=120){
        if(!obstacles.some(o=>y > (o.y0===undefined?-1e9:o.y0)-260 && y < (o.y1===undefined?1e9:o.y1)+260)){ openY = y; break; }
      }
      if(openY === null){        // busy layout: fall back past the last obstacle
        let last = 0;
        for(const o of obstacles) last = Math.max(last, o.y1===undefined?0:o.y1);
        openY = Math.min(last + 300, trackLength - 200);
      }
      p.x = TRACK_W/2; p.y = openY; p.h = 0; p.vx = 0; p.vy = 0; p.falling = false; p.stumbleT = 0;
      const x0 = p.x, y0 = p.y;
      window.__dbg.tick(40);
      if(kind === 'wind'){
        const drift = Math.abs(p.x - x0);
        seen.wind = drift.toFixed(0);
        if(drift < 25) bad.push('wind moved a standing racer only '+drift.toFixed(0)
          +' [map '+currentMap.key+', still active '+!!(mapEvent&&mapEvent.active)
          +', detached '+(p!==player())+', vx '+p.vx.toFixed(2)+', x '+p.x.toFixed(0)+' from '+x0.toFixed(0)+']');
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
    for(const key of ['neon']){
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
          // Only judge a spot where the beam is the only thing in reach: a
          // racer who fell into something else never gets to meet it.
          if(obstacles.some(x=>x.type!=='laserbar' &&
               by > (x.y0===undefined?-1e9:x.y0)-60 && by < (x.y1===undefined?1e9:x.y1)+60)) continue;
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

    // Clear ground, and nobody else in it. A hard-coded y put the racer in the
    // gap hazard on the odd layout: it fell during the settle, and a camera
    // chasing a racer that is no longer there is not off-centre, it is right.
    const { p, pin } = steerRig();
    for(let i=0;i<60;i++){ pin(); window.__dbg.tick(1); }

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
      const wasH = p.h, wasVh = p.vh; pin(); p.h = wasH; p.vh = wasVh;
      window.__dbg.tick(1);
      worst = Math.max(worst, Math.abs(camElev() - flatElev));
      if(p.h <= 0 && i > 6) break;
    }
    if(worst > 0.09) bad.push('camera angle swung '+worst.toFixed(3)+' rad over a jump');

    // (c) the racer stays on screen through the jump
    p.h = 0; p.vh = 0;
    for(let i=0;i<20;i++){ pin(); window.__dbg.tick(1); }
    doJump(p);
    for(let i=0;i<14;i++){ const wasH=p.h, wasVh=p.vh; pin(); p.h=wasH; p.vh=wasVh; window.__dbg.tick(1); }
    const air = racerNDC();
    if(Math.abs(air.x) > 0.25 || Math.abs(air.y) > 0.75) bad.push('racer left frame mid-jump ('+air.x.toFixed(2)+','+air.y.toFixed(2)+')');

    // (d) look away by hand, let go, and the view comes back behind on its own
    p.h = 0; p.vh = 0;
    look.yaw = 1.15; look.sinceInput = 0;
    for(let i=0;i<4;i++){ pin(); p.vy = 4; window.__dbg.tick(1); }
    const swung = look.yaw;
    for(let i=0;i<150;i++){ pin(); p.vy = 4; window.__dbg.tick(1); }   // 2.5s hands off
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
    for(const k of ['sunny','neon']){
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
    for(const k of ['sunny','neon','cannonc']){
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
    while(ticks < 6000 && !ended){ window.__dbg.tick(60); ticks += 60; ended = (state !== 'racing'); }
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

  // ---------- 6: a big hit sends you tumbling, and you get back up ----------
  function check6(){
    const bad = [];
    let o = null;
    for(let a=0; a<10 && !o; a++){ begin('neon'); o = obstacles.find(x=>x.type==='spinbar'); }
    if(!o) return { name:'6 hard hits tumble you, then you recover', pass:false, detail:'no spinbar to be hit by' };

    const p = player();
    let hit = false;
    for(let i=0; i<200 && !hit; i++){
      p.x = o.cx; p.y = o.y; p.h = 0; p.vx = 0; p.vy = 0;
      p.stumbleT = 0; p.tumbleT = 0; p.tumbleAng = 0; p.invuln = 0; p.falling = false;
      window.__dbg.tick(2);
      hit = (p.tumbleT||0) > 0;
    }
    if(!hit) return { name:'6 hard hits tumble you, then you recover', pass:false,
                      detail:'the obstacle connected but never set a tumble going' };

    // it has to actually turn over, not just wobble
    const a0 = p.tumbleAng || 0;
    window.__dbg.tick(30);
    const spun = Math.abs((p.tumbleAng||0) - a0);
    if(spun < 1.2) bad.push('barely rotated in half a second ('+spun.toFixed(2)+' rad)');

    // Out of the bar's reach before timing the recovery: left where they were
    // hit, they simply get hit again on the next pass.
    // Somewhere clear: dropped beside another obstacle they simply get hit
    // again. Ten steps of 260 used to give up inside a laser sweep on Neon's
    // denser layouts, and a bean pinned inside a hazard never stops tumbling;
    // so scan the whole course, and fall back to the clear run-in at the start.
    let restY = null;
    const clearAt = y => !obstacles.some(x=>x!==o && y > (x.y0===undefined?-1e9:x.y0)-220 && y < (x.y1===undefined?1e9:x.y1)+220);
    for(let y=o.y+400; y<trackLength-300 && restY===null; y+=40) if(clearAt(y)) restY = y;
    for(let y=120; y<o.y-300 && restY===null; y+=40) if(clearAt(y)) restY = y;
    if(restY===null) restY = 150;
    p.x = TRACK_W/2; p.y = restY; p.floorH = 0;
    // and it has to end: no permanent cartwheel. Hold them where they were put:
    // the tumble carries them sideways, and drifting back into the bar restarts
    // the whole thing.
    let ticks = 0;
    while(ticks < 300 && (p.tumbleT||0) > 0){
      p.x = TRACK_W/2; p.y = restY; p.vx = 0; p.vy = 0;
      window.__dbg.tick(5); ticks += 5;
    }
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

  // ---------- 9: obstacles set each other off ----------
  function check9(){
    const bad = [], got = {};

    // (a) a cannonball brings a crumbling slab down
    let cr = null;
    for(let a=0; a<8 && !cr; a++){ begin('slide'); cr = obstacles.find(o=>o.type==='crumble'); }
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
    for(let a=0; a<8 && !bp; a++){ begin('cannonc'); bp = obstacles.find(o=>o.type==='bumper'); }
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

  // ---------- L: a hill is worth something, up or down ----------
  function checkL(){
    const bad = [];

    // Terminal speed at one fixed point. The racer is pinned to a single y so
    // the slope under them never changes, and made invulnerable so an obstacle
    // cannot muddy the reading.
    function terminalAt(atY){
      const p = player();
      for(const r of racers) if(!r.isPlayer){ r.y = -9000; r.vx = 0; r.vy = 0; }
      p.x = TRACK_W/2; p.h = 0; p.vx = 0; p.vy = 0;
      p.falling = false; p.stumbleT = 0; p.tumbleT = 0; p.getUpT = 0; p.windT = 0;
      window.__dbg.hold('w', true);
      for(let i=0;i<170;i++){
        p.y = atY; p.h = 0; p.floorH = 0; p.invuln = 9999; p.falling = false;
        window.__dbg.tick(1);
      }
      window.__dbg.hold('w', false);
      return p.vy;
    }
    // Shallowest and steepest point of whatever course is loaded. Both readings
    // come from the same map, so friction and ice are held constant and the
    // only thing that differs is the gradient -- Super Slide is slippery, and
    // comparing it against a flat map measures the ice, not the hill.
    function extremes(){
      let lo = 1e9, hi = -1e9, loY = 800, hiY = 800;
      for(let y=500; y<trackLength-700; y+=110){
        const s = pathSlope(y);
        if(s < lo){ lo = s; loY = y; }
        if(s > hi){ hi = s; hiY = y; }
      }
      return {lo, hi, loY, hiY};
    }

    // a corridor map has no gradient at all, and must be untouched by this
    begin('sunny');
    if(pathSlope(1400) !== 0) bad.push('a corridor map reports a slope ('+pathSlope(1400)+')');
    const flat = terminalAt(1400);
    if(flat < 3) return { name:'L slopes cost you going up and pay going down',
                          pass:false, detail:'could not get a clean flat reading ('+flat.toFixed(2)+')' };

    // uphill: the steeper stretch has to be the slower one
    begin('cannonc');
    const cc = extremes();
    const gentleUp = terminalAt(cc.loY), steepUp = terminalAt(cc.hiY);
    const upCost = 1 - steepUp/gentleUp;
    if(cc.hi - cc.lo < 0.05) bad.push('Cannon Climb has no gradient to speak of');
    if(upCost < 0.05) bad.push('a steeper climb costs nothing ('+(upCost*100).toFixed(0)+'% between '
                               +cc.lo.toFixed(2)+' and '+cc.hi.toFixed(2)+' rad)');
    if(upCost > 0.50) bad.push('the steep part is a wall ('+(upCost*100).toFixed(0)+'% slower)');
    if(steepUp < 1.5) bad.push('the climb cannot be walked up ('+steepUp.toFixed(2)+'/frame)');

    // downhill: the steeper stretch has to be the quicker one
    begin('slide');
    const sl = extremes();
    const gentleDown = terminalAt(sl.hiY), steepDown = terminalAt(sl.loY);
    const downGain = steepDown/gentleDown - 1;
    if(sl.hi - sl.lo < 0.05) bad.push('Super Slide has no gradient to speak of');
    if(downGain < 0.05) bad.push('a steeper drop pays nothing ('+(downGain*100).toFixed(0)+'%)');
    if(downGain > 0.90) bad.push('the steep part is a runaway ('+(downGain*100).toFixed(0)+'% faster)');

    return { name:'L slopes cost you going up and pay going down', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : 'flat '+flat.toFixed(2)+'  |  climb '+gentleUp.toFixed(2)+' -> '+steepUp.toFixed(2)
                 +' (-'+(upCost*100).toFixed(0)+'% over '+cc.lo.toFixed(2)+'..'+cc.hi.toFixed(2)+' rad)'
                 +'  |  slide '+gentleDown.toFixed(2)+' -> '+steepDown.toFixed(2)+' (+'+(downGain*100).toFixed(0)+'%)' };
  }

  // ---------- S: the bean stops, turns and jumps like a platformer ----------
  function checkS(){
    const bad = [];
    // A clear stretch, with nobody else in it, so the numbers are the bean's.
    begin('sunny');
    let openY = null;
    for(let y=700; y<trackLength-400; y+=120){
      if(!obstacles.some(o=>y > (o.y0===undefined?-1e9:o.y0)-300 && y < (o.y1===undefined?1e9:o.y1)+300)){ openY = y; break; }
    }
    if(openY === null){
      let last = 0;
      for(const o of obstacles) last = Math.max(last, o.y1===undefined?0:o.y1);
      openY = Math.min(last + 320, trackLength - 200);
    }
    function reset(){
      for(const r of racers) if(!r.isPlayer){ r.y = -9000; r.vx = 0; r.vy = 0; }
      const q = player();
      q.x = TRACK_W/2; q.y = openY; q.h = 0; q.vx = 0; q.vy = 0; q.vh = 0;
      q.falling = false; q.stumbleT = 0; q.tumbleT = 0; q.getUpT = 0; q.windT = 0; q.invuln = 9999;
      resetLook();
      return q;
    }

    // (a) let go at full tilt and you stop promptly
    let p = reset();
    window.__dbg.hold('w', true);
    for(let i=0;i<120;i++){ p.y = openY; window.__dbg.tick(1); }   // wind up to top speed
    const topSpd = Math.hypot(p.vx, p.vy);
    window.__dbg.hold('w', false);
    let stopFrames = 0;
    for(let i=0;i<40;i++){
      p.y = openY; window.__dbg.tick(1); stopFrames++;
      if(Math.hypot(p.vx, p.vy) < topSpd*0.10) break;
    }
    if(topSpd < 3)      bad.push('never got up to speed ('+topSpd.toFixed(2)+'/frame)');
    if(stopFrames > 10) bad.push('takes '+stopFrames+' frames to stop, want <= 10');

    // (b) a 180 turn completes promptly
    p = reset();
    window.__dbg.hold('w', true);
    for(let i=0;i<120;i++){ p.y = openY; window.__dbg.tick(1); }
    const facing0 = p.facing;
    window.__dbg.hold('w', false); window.__dbg.hold('s', true);
    let turnFrames = 0;
    for(let i=0;i<40;i++){
      p.y = openY; window.__dbg.tick(1); turnFrames++;
      let d = Math.abs(p.facing - facing0); while(d > Math.PI) d = Math.abs(d - Math.PI*2);
      if(d > Math.PI*0.92) break;
    }
    window.__dbg.hold('s', false);
    if(turnFrames > 12) bad.push('a 180 takes '+turnFrames+' frames, want <= 12');

    // (c) the jump hangs for the right length of time
    p = reset();
    window.__dbg.hold(settings.keys.jump, true);   // or jumpCut halves the arc
    doJump(p);
    let air = 0;
    for(let i=0;i<120;i++){
      p.y = openY; window.__dbg.tick(1); air++;
      if(p.h <= 0 && i > 3) break;
    }
    window.__dbg.hold(settings.keys.jump, false);
    if(air < 30 || air > 38) bad.push('jump is airborne '+air+' frames, want 30-38');

    // (d) steering is not mirrored: right on the stick goes right on the screen
    p = reset();
    const ndc = new THREE.Vector3();
    function screenX(){
      const w = toWorld(p.x, p.y, (p.floorH||0) + p.h + RADIUS);
      camera.updateMatrixWorld(true);
      ndc.set(w.x, w.y, w.z).project(camera);
      return ndc.x;
    }
    for(let i=0;i<20;i++){ p.y = openY; window.__dbg.tick(1); }
    const sx0 = screenX();
    window.__dbg.hold('d', true);
    for(let i=0;i<26;i++){ p.y = openY; look.sinceInput = 0; window.__dbg.tick(1); }
    window.__dbg.hold('d', false);
    const sx1 = screenX();
    if(!isFinite(sx0) || !isFinite(sx1)) bad.push('could not project the racer');
    else if(sx1 - sx0 < 0.02) bad.push('holding right moved the bean left on screen ('+sx0.toFixed(2)+' -> '+sx1.toFixed(2)+')');

    return { name:'S the bean stops, turns and jumps like a platformer', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : 'top '+topSpd.toFixed(2)+'/frame, stop '+stopFrames+'f, 180 in '+turnFrames+'f, air '+air+'f, right goes right' };
  }

  // ---------- b (3b): hazards are the loudest thing on screen ----------
  // On every race map, the colour each hazard mesh is painted with must be at
  // least 0.35 more saturated (HSL) than the floor it stands on. Read off the
  // materials as built -- the accent a mesh's body or stripe carries -- rather
  // than off pixels, which shadows and stripes would make a lottery.
  function checkB2(){
    const bad = [], rep = {};
    const sat = hex => { const h = {}; new THREE.Color(hex).getHSL(h); return h.s; };
    for(const key of CORRIDOR_MAPS.concat(PATH_MAPS)){
      begin(key);
      const floorHex = currentMap.__floorHex || currentMap.ground;
      const floorS = sat(floorHex);
      const seen = {};
      courseGroup.traverse(o=>{
        if(!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for(const m of mats) if(m.userData && m.userData.hazard) seen[m.userData.hazard] = (seen[m.userData.hazard]||0) + 1;
      });
      const hexes = Object.keys(seen);
      if(!hexes.length){ bad.push(key+': no hazard mesh carries an accent'); continue; }
      const minS = Math.min(...hexes.map(sat));
      const count = hexes.reduce((n,h)=>n+seen[h], 0);
      rep[key] = 'floor '+floorS.toFixed(2)+', hazards '+minS.toFixed(2)+'+ over '+count+' meshes';
      if(minS < floorS + 0.35) bad.push(key+': hazards at '+minS.toFixed(2)+' saturation over a '+floorS.toFixed(2)+' floor, want +0.35');
    }
    return { name:'b (3b) hazards are the loudest thing on screen', pass: bad.length===0,
             detail: bad.length ? bad.join('; ') : JSON.stringify(rep) };
  }

  // ---------- 5: the bean rig ----------
  // Proportions and the small animations that make a bean read as a bean: it
  // stands about twice as tall as it is wide, its arms reach below the waist,
  // its feet leave the floor one at a time when it runs, and it squashes on
  // landing. Measured off the rendered meshes, not the constants.
  function check5(){
    const bad = [];
    begin('sunny');
    obstacles.length = 0; mapEvent = null;
    for(const r of racers) if(!r.isPlayer){ r.y = -9000; r.vx = 0; r.vy = 0; r.lavaOut = true; }
    const p = player(), m = p.mesh;
    const box = o => new THREE.Box3().setFromObject(o);
    function reset(){
      p.x = TRACK_W/2; p.y = 1200; p.h = 0; p.vx = 0; p.vy = 0; p.vh = 0; p.floorH = 0;
      p.falling = false; p.stumbleT = 0; p.tumbleT = 0; p.getUpT = 0; p.diveT = 0; p.diveCd = 0;
      p.landT = 0; p.stretchT = 0; p.squash = 0; p.invuln = 9999; p.facing = Math.PI/2;
      resetLook();
    }
    // (a) proportions, crown to sole against the body's width, standing still
    reset();
    window.__dbg.hold('w', false);
    for(let i=0;i<30;i++) window.__dbg.tick(1);
    const body = box(m.body), feet = box(m.feet[0]).union(box(m.feet[1]));
    const height = body.max.y - feet.min.y, width = body.max.x - body.min.x, ratio = height/width;
    if(ratio < 1.8 || ratio > 2.0) bad.push('bean stands '+ratio.toFixed(2)+' : 1, want 1.8-2.0');

    // (b) arms hang to below the waist at rest
    const waist = (body.max.y + body.min.y)/2;
    for(const h of m.hands){
      const hy = box(h).getCenter(new THREE.Vector3()).y;
      if(hy > waist) bad.push('an arm ends at '+hy.toFixed(1)+', above the waist at '+waist.toFixed(1));
    }

    // (c) feet clear the floor on alternate steps while running
    reset();
    window.__dbg.hold('w', true);
    for(let i=0;i<40;i++) window.__dbg.tick(1);            // up to speed
    const floorY = toWorld(p.x, p.y, 0).y;
    const lift = [0,0], leads = [0,0];
    for(let i=0;i<40;i++){
      window.__dbg.tick(1);
      const f0 = box(m.feet[0]).min.y - floorY, f1 = box(m.feet[1]).min.y - floorY;
      lift[0] = Math.max(lift[0], f0); lift[1] = Math.max(lift[1], f1);
      if(f0 > f1 + 0.5) leads[0]++; else if(f1 > f0 + 0.5) leads[1]++;
    }
    window.__dbg.hold('w', false);
    if(lift[0] < 1.5 || lift[1] < 1.5) bad.push('feet only lift '+lift[0].toFixed(1)+' / '+lift[1].toFixed(1)+' off the floor');
    if(!leads[0] || !leads[1])         bad.push('feet do not alternate ('+leads[0]+' / '+leads[1]+' frames leading)');

    // (d) the squash keyframes: stretch on take-off, squash on landing
    reset();
    for(let i=0;i<5;i++) window.__dbg.tick(1);
    window.__dbg.hold(settings.keys.jump, true);
    doJump(p); window.__dbg.tick(1);
    const stretchY = m.group.scale.y;
    if(stretchY < 1.05) bad.push('no take-off stretch (scale.y '+stretchY.toFixed(2)+')');
    let landed = false, squashY = 1;
    for(let i=0;i<120 && !landed;i++){
      window.__dbg.tick(1);
      if(p.h <= 0 && i > 3){ landed = true; squashY = m.group.scale.y; }
    }
    window.__dbg.hold(settings.keys.jump, false);
    if(!landed)              bad.push('never landed');
    else if(squashY > 0.90)  bad.push('no landing squash (scale.y '+squashY.toFixed(2)+')');
    if(landed && !((p.landT||0) > 0)) bad.push('the landing keyframe did not fire');

    return { name:'5 the bean rig: proportions, arms, feet and squash', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : ratio.toFixed(2)+' : 1, hands '+box(m.hands[0]).getCenter(new THREE.Vector3()).y.toFixed(1)+' vs waist '+waist.toFixed(1)
                 +', feet lift '+lift[0].toFixed(1)+'/'+lift[1].toFixed(1)+', stretch '+stretchY.toFixed(2)+', squash '+squashY.toFixed(2) };
  }

  // ---------- 8: no free speed ----------
  // A player who held forward and alternated jump and dive used to out-run one
  // who just ran: the air kept nearly all of your speed while the ground took a
  // fifth, and a dive cycle averaged above top speed. Three beans run the same
  // flat, empty stretch for twelve seconds on the same held input, and neither
  // the hopper nor the diver may get further than the runner.
  function check8(){
    const bad = [];
    begin('sunny');
    obstacles.length = 0;                       // a flat, empty course
    mapEvent = null;                            // and no crosswind mid-run
    // The bots sit this one out. Marking them finished would end the round on
    // the one-straggler rule, so they are knocked out instead.
    for(const r of racers) if(!r.isPlayer){ r.y = -9000; r.vx = 0; r.vy = 0; r.lavaOut = true; }
    function run(style){
      const q = player();
      q.x = TRACK_W/2; q.y = 0; q.h = 0; q.vx = 0; q.vy = 0; q.vh = 0; q.floorH = 0;
      q.falling = false; q.stumbleT = 0; q.tumbleT = 0; q.getUpT = 0; q.windT = 0; q.diveT = 0; q.diveCd = 0; q.invuln = 9999;
      q.finished = false; q.draft = 0; q.facing = Math.PI/2;
      resetLook();
      window.__dbg.hold('w', true);
      window.__dbg.hold(settings.keys.jump, style === 'jump');   // held, so no jump-cut shortens the arc
      let top = 0, dives = 0, jumps = 0;
      for(let i=0;i<720 && state==='racing';i++){
        if(style === 'jump' && i % 30 === 0 && doJump(q)) jumps++;
        if(style === 'dive' && doDive(q)) dives++;
        window.__dbg.tick(1);
        top = Math.max(top, Math.hypot(q.vx, q.vy));
      }
      window.__dbg.hold('w', false);
      window.__dbg.hold(settings.keys.jump, false);
      return { dist: q.y, top, dives, jumps };
    }
    const a = run('run'), b = run('jump'), c = run('dive');
    if(state !== 'racing')      bad.push('the round ended mid-run ('+state+')');
    if(a.dist < 600)            bad.push('the runner barely moved ('+Math.round(a.dist)+')');
    if(b.jumps < 20)            bad.push('the hopper only jumped '+b.jumps+' times');
    if(c.dives < 4)             bad.push('the diver only dived '+c.dives+' times');
    if(b.dist > a.dist*1.02)    bad.push('jumping covers '+Math.round(b.dist)+' vs running '+Math.round(a.dist)+' ('+(b.dist/a.dist*100-100).toFixed(1)+'% more)');
    if(c.dist > a.dist*1.00)    bad.push('diving covers '+Math.round(c.dist)+' vs running '+Math.round(a.dist)+' ('+(c.dist/a.dist*100-100).toFixed(1)+'% more)');
    if(a.top < 4.4 || a.top > 4.8) bad.push('v_max is '+a.top.toFixed(2)+' a frame, want 4.4-4.8');
    return { name:'8 no free speed: a jump or a dive never beats a run', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : 'run '+Math.round(a.dist)+', jump '+Math.round(b.dist)+' ('+(b.dist/a.dist*100-100).toFixed(1)+'%), dive '+Math.round(c.dist)+' ('+(c.dist/a.dist*100-100).toFixed(1)+'%), v_max '+a.top.toFixed(2) };
  }

  // ---------- +: the acceptance run, five seeds a map ----------
  // The brief's own test. A player who only holds forward and mashes jump used
  // to finish first or top-three on 8 of 13 race maps. Judged over five layouts
  // per map and on medians, because a single unlucky course should not fail a
  // build -- and a single lucky one should not pass it.
  const ACCEPT_SEEDS = 5;
  function median(xs){
    const a = [...xs].sort((p,q)=>p-q);
    return a.length % 2 ? a[(a.length-1)/2] : (a[a.length/2 - 1] + a[a.length/2])/2;
  }

  function checkAccept(){
    const bad = [], report = {};
    const RACES = ['sunny','cannonc','slide','neon'];
    const SURVIVE = ['lava','doors','tiles','shrink'];
    // Per map, because the maps are not the same shape of problem: Sunny is
    // dense and forgiving, Super Slide is ice and a bot cannot trim a line on it.
    const HURT_MIN = { sunny:2, cannonc:4, slide:4, neon:4 };
    const FALL_MAX = { sunny:5, cannonc:5, slide:8, neon:5 };

    function playThrough(key){
      begin(key);
      const L = trackLength, limit = timeLimit;
      window.__dbg.hold('w', true);
      let ticks = 0, ended = false, stillest = 0;
      const lastY = new Map(), stuckFor = new Map();
      while(ticks < 60*72 && !ended){
        window.__dbg.hold(settings.keys.jump, (ticks % 24) < 12);   // mash it
        window.__dbg.tick(12); ticks += 12;
        ended = (state !== 'racing');
        for(const r of racers){
          if(r.isPlayer || r.finished || r.lavaOut) continue;
          const was = lastY.get(r) === undefined ? -1e9 : lastY.get(r);
          const t2 = (r.y - was > 12) ? 0 : (stuckFor.get(r)||0) + 0.2;
          stuckFor.set(r, t2); lastY.set(r, r.y);
          if(t2 > stillest) stillest = t2;
        }
      }
      window.__dbg.hold(settings.keys.jump, false);
      window.__dbg.hold('w', false);
      const sorted = [...racers].sort(rankCompare);
      const me = racers.find(r=>r.isPlayer);
      const bots = racers.filter(r=>!r.isPlayer);
      const finTimes = bots.filter(b=>b.finished).map(b=>b.finishTime);
      return {
        secs: Math.round(ticks/60), limit,
        // when the field gets home: the v20 brief wants this between 35 and 50 s
        medFinish: finTimes.length ? Math.round(median(finTimes)) : null,
        rank: sorted.findIndex(r=>r.isPlayer)+1,
        hurt: (me.fallCount||0) + (me.__tumbles||0) + (me.lavaOut?1:0),
        finished: bots.filter(b=>b.finished || b.y>=L).length,
        worstBotFalls: Math.max(...bots.map(b=>b.fallCount||0)),
        stillest: Math.round(stillest*10)/10
      };
    }

    for(const key of RACES){
      const runs = [];
      for(let i=0;i<ACCEPT_SEEDS;i++) runs.push(playThrough(key));
      const gapless = !runs.some(()=>false) && (MAPS.find(m=>m.key===key)||{}).forcedGap === false;
      const hurtIn   = runs.filter(r=>r.hurt >= 2).length;
      const medFalls = median(runs.map(r=>r.worstBotFalls));
      const medHome  = median(runs.map(r=>r.finished));
      const medStill = median(runs.map(r=>r.stillest));
      const wonAny   = runs.filter(r=>r.rank === 1).length;
      const medFin   = median(runs.map(r=>r.medFinish===null ? 999 : r.medFinish));
      report[key] = 'hurt '+hurtIn+'/'+ACCEPT_SEEDS+(gapless?' (no forced hole)':'')+', worst-bot falls med '+medFalls
                    +' (max '+Math.max(...runs.map(r=>r.worstBotFalls))+'), '+medHome+' home, still '+medStill+'s'
                    +', field home at '+medFin+'s';
      if(wonAny > 0)   bad.push(key+': hold-forward player won '+wonAny+' of '+ACCEPT_SEEDS);
      const needHurt = HURT_MIN[key]===undefined ? 4 : HURT_MIN[key];
      const capFalls = FALL_MAX[key]===undefined ? 5 : FALL_MAX[key];
      if(hurtIn < needHurt)   bad.push(key+': hurt in only '+hurtIn+' of '+ACCEPT_SEEDS+', want '+needHurt);
      if(medFalls > capFalls) bad.push(key+': median worst-bot falls '+medFalls+', cap '+capFalls);
      if(medHome < 10) bad.push(key+': median '+medHome+' bots home');
      if(medStill > 4) bad.push(key+': a bot idled '+medStill+'s');
    }

    for(const key of SURVIVE){
      const runs = [];
      for(let i=0;i<ACCEPT_SEEDS;i++) runs.push(playThrough(key));
      const medSecs = median(runs.map(r=>r.secs));
      const limit = runs[0].limit;
      report[key] = 'median '+medSecs+'s of '+limit+'s';
      const floorS = key==='lava' ? 20 : 30;
      if(medSecs < floorS)   bad.push(key+': median run only '+medSecs+'s');
      if(medSecs > limit+6)  bad.push(key+': median run '+medSecs+'s, past its '+limit+'s limit');
    }

    return { name:'+ acceptance: five layouts a map, judged on medians',
             pass: bad.length===0,
             detail: bad.length ? bad.join('; ') : JSON.stringify(report) };
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
    const maps = full ? CORRIDOR_MAPS.concat(PATH_MAPS, MINIGAME_KEYS) : PATH_MAPS.concat(['sunny','doors']);
    for(const key of maps){
      begin(key);
      if(currentMap.knockout) continue;      // no finish line to pace towards

      // Lava Rise is a chase, not a race to a distance: the lava is clamped 340
      // behind the leader, so comparing pace against a distance-derived target
      // measures nothing. Assert the chase instead.
      if(currentMap.mode === 'lava'){
        window.__dbg.hold('w', true);
        let worstGap = -1e9, ended = false, ticks = 0;
        while(ticks < 6000 && !ended){
          window.__dbg.tick(30); ticks += 30;
          let lead = -1e9;
          for(const r of racers) if(!r.lavaOut && !r.falling) lead = Math.max(lead, r.y);
          if(lead > -1e8) worstGap = Math.max(worstGap, lavaZ - (lead - 340));
          ended = (state !== 'racing');
        }
        window.__dbg.hold('w', false);
        const caught = racers.filter(r=>r.lavaOut).length;
        rate[key] = 'gap ' + Math.round(worstGap) + ', caught ' + caught;
        if(worstGap > 6)  bad.push(key+': lava got '+Math.round(worstGap)+' past its 340 leash');
        if(caught < 1)    bad.push(key+': lava caught nobody');
        continue;
      }

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

  // ---- shared rig for the steering checks: a clear stretch, nobody else in it ----
  function steerRig(){
    begin('sunny');
    let openY = null;
    for(let y=700; y<trackLength-400; y+=120){
      if(!obstacles.some(o=>y > (o.y0===undefined?-1e9:o.y0)-300 && y < (o.y1===undefined?1e9:o.y1)+300)){ openY = y; break; }
    }
    if(openY === null){
      let last = 0;
      for(const o of obstacles) last = Math.max(last, o.y1===undefined?0:o.y1);
      openY = Math.min(last + 320, trackLength - 200);
    }
    const pin = ()=>{
      for(const r of racers) if(!r.isPlayer){ r.y = -9000; r.vx = 0; r.vy = 0; }
      const q = player();
      q.y = openY; q.h = 0; q.floorH = 0; q.invuln = 9999;
      q.falling = false; q.stumbleT = 0; q.tumbleT = 0; q.getUpT = 0; q.windT = 0;
      return q;
    };
    const p = pin();
    p.x = TRACK_W/2; p.vx = 0; p.vy = 0;
    resetLook();
    return { p, openY, pin };
  }
  const DEG = 180/Math.PI;
  function wrapDeg(d){ while(d > 180) d -= 360; while(d <= -180) d += 360; return d; }

  // ---------- U: a diagonal is a diagonal ----------
  // Holding W+A used to curve, because auto-centre chased the running direction
  // while the input was measured against the camera -- the yaw fed into itself.
  function checkU(){
    const bad = [];
    const { p, openY, pin } = steerRig();
    window.__dbg.hold('w', true); window.__dbg.hold('a', true);
    let worstOff = 0, worstYaw = 0;
    for(let i=0;i<120;i++){                       // two seconds
      pin(); window.__dbg.tick(1);
      if(i < 20) continue;                        // let the turn settle first
      const deg = p.facing*DEG;
      const off = Math.min(...[45,135,-45,-135].map(a=>Math.abs(wrapDeg(deg - a))));
      if(off > worstOff) worstOff = off;
      if(Math.abs(look.yaw) > worstYaw) worstYaw = Math.abs(look.yaw);
    }
    window.__dbg.hold('w', false); window.__dbg.hold('a', false);

    if(worstOff > 3)     bad.push('heading wandered '+worstOff.toFixed(1)+' deg off the diagonal');
    if(worstYaw > 0.02)  bad.push('the view drifted with it (yaw '+worstYaw.toFixed(3)+')');

    return { name:'U W+A holds an exact diagonal', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : 'within '+worstOff.toFixed(1)+' deg of 45, yaw within '+worstYaw.toFixed(3) };
  }

  // ---------- V: letting go moves the bean, not the camera ----------
  function checkV(){
    const bad = [];
    const { p, pin } = steerRig();
    window.__dbg.hold('w', true);
    for(let i=0;i<120;i++){ pin(); window.__dbg.tick(1); }
    const top = Math.hypot(p.vx, p.vy);
    window.__dbg.hold('w', false);

    const yaw0 = look.yaw, zoom0 = camZoom;
    let slide = 0, stopped = false, worstYaw = 0, worstZoom = 0;
    for(let i=0;i<30;i++){                        // half a second
      pin(); window.__dbg.tick(1);
      if(!stopped){
        slide++;
        if(Math.hypot(p.vx, p.vy) < top*0.10) stopped = true;
      }
      worstYaw  = Math.max(worstYaw,  Math.abs(look.yaw - yaw0));
      worstZoom = Math.max(worstZoom, Math.abs(camZoom - zoom0));
    }

    if(top < 3)          bad.push('never reached speed ('+top.toFixed(2)+')');
    if(worstYaw > 0.01)  bad.push('the view yawed on release ('+worstYaw.toFixed(4)+')');
    if(worstZoom > 0.01) bad.push('the camera changed distance on release ('+worstZoom.toFixed(4)+')');
    if(!stopped)         bad.push('still sliding after half a second');

    return { name:'V releasing the stick moves nothing but the bean', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : 'slid '+slide+' frames (want 4-6), yaw moved '+worstYaw.toFixed(4)+', zoom '+worstZoom.toFixed(4) };
  }

  // ---------- W: a hard turn does not skid ----------
  // The body turns at TURN_RATE_GROUND; if the velocity does not follow, the bean
  // reads as facing one way and travelling another. Measured as: how long after a
  // 90 degree change of input before the velocity is -- and stays -- within 15
  // degrees of the facing. Counting the first frame the two agree would be
  // meaningless: at the instant of the turn neither has moved yet.
  function checkW(){
    const bad = [];
    const { p, pin } = steerRig();
    window.__dbg.hold('w', true);
    for(let i=0;i<120;i++){ pin(); window.__dbg.tick(1); }
    const top = Math.hypot(p.vx, p.vy);
    window.__dbg.hold('w', false); window.__dbg.hold('a', true);   // hard left
    const trace = [];
    let peak = 0, settle = 0;
    for(let i=0;i<40;i++){
      pin(); window.__dbg.tick(1);
      const gap = Math.abs(wrapDeg(Math.atan2(p.vy,p.vx)*DEG - p.facing*DEG));
      trace.push({ f:i+1, face:+(p.facing*DEG).toFixed(1), vel:+(Math.atan2(p.vy,p.vx)*DEG).toFixed(1),
                   gap:+gap.toFixed(1), spd:+Math.hypot(p.vx,p.vy).toFixed(2) });
      if(gap > peak) peak = gap;
      if(gap >= 15) settle = i+2;                 // not settled until after this frame
    }
    window.__dbg.hold('a', false);
    window.__turnTrace = trace;

    if(top < 3)     bad.push('never reached speed');
    if(settle > 8)  bad.push('velocity trailed the facing for '+settle+' frames, want <= 8 (peak '+peak.toFixed(0)+' deg)');

    return { name:'W a 90 degree turn does not skid', pass: bad.length===0,
             detail: bad.length ? bad.join('; ')
               : 'velocity settled within 15 deg after '+settle+' frames, peak '+peak.toFixed(0)+' deg' };
  }

  window.__checks = {
    run(opts){
      opts = opts||{};
      const only = opts.only ? new Set(opts.only.split('')) : null;
      const all = [
        ['A',checkA],['B',checkB],['C',checkC],['D',checkD],
        ['E',checkE],['F',checkF],['G',()=>checkG(opts.half)],['H',checkH],
        ['J',checkJ],['K',checkK],['L',checkL],['M',checkM],['N',checkN],['O',checkO],['P',checkP],['Q',checkQ],['R',checkR],['S',checkS],
        ['T',checkT],['U',checkU],['V',checkV],['W',checkW],['X',checkX],
        ['Y',checkY],['Z',checkZ],['1',check1],
        ['2',check2],['3',check3],['b',checkB2],['4',check4],['5',check5],
        ['6',check6],['7',check7],['8',check8],['9',check9],['0',check0],
        ['I',()=>checkI(!!opts.full)]
      ];
      // slow: five layouts a map, so only when asked for
      if(opts.accept || (opts.only && opts.only.indexOf('+')>=0)) all.push(['+',checkAccept]);
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
