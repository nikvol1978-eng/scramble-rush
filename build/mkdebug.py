#!/usr/bin/env python3
"""Throwaway debug copy of the current build, exposing internals for browser tests.

    python build/mkdebug.py

Writes __debug.html (gitignored). It adds window.__dbg with a manual tick(), so
the simulation can be stepped by hand -- handy because requestAnimationFrame is
frozen in some embedded preview panes.
"""
import io, os

VERSION = 24
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "scramble-rush-%d.0.html" % VERSION)
OUT = os.path.join(ROOT, "__debug.html")

s = io.open(SRC, encoding="utf-8").read()

# v24 §4 named the pools, so `const finals = ...` is gone from startRound and
# this anchors on the line that replaced it.
old = "      if(currentMap && currentMap.__forced){ /* a test picked it */ }"
new = ("      if(window.__forceMap){ currentMap = [...MAPS,...MINIGAMES].find(x=>x.key===window.__forceMap);\n"
       "                             // A key naming no map used to leave currentMap alone, so the check\n"
       "                             // quietly measured whatever happened to be loaded, under the wrong\n"
       "                             // label. Say so instead of measuring the wrong thing.\n"
       "                             if(!currentMap) throw new Error('__forceMap: no map named ' + window.__forceMap);\n"
       "                             currentMap.__forced = true; }\n"
       "      else if(currentMap) currentMap.__forced = false;\n"
       "      if(currentMap && currentMap.__forced){ /* a test picked it */ }")
assert s.count(old) == 1, "map-pick anchor: %d" % s.count(old)
s = s.replace(old, new)

# The rAF loop re-renders from the chase camera the instant anything else has
# finished drawing, which makes a posed shot -- the overhead flyover, a camera
# parked on one obstacle -- impossible to capture. window.__freeze holds it.
old = "  function loop(now){" + chr(10) + "    const dt="
new = ("  function loop(now){" + chr(10)
       + "    if(window.__freeze){ requestAnimationFrame(loop); return; }" + chr(10)
       + "    const dt=")
assert s.count(old) == 1, "loop anchor: %d" % s.count(old)
s = s.replace(old, new)

# ---- __fullTime: let the clock run -------------------------------------
# The acceptance asks how many bots would get home, which is a question about
# the course. The three rules below end a round early on purpose -- twenty
# seconds after the first finisher once enough are home -- which is a good thing
# in play and a measurement of itself rather than of the course. Test build
# only: with __fullTime set, the round runs to its time limit and the harness
# derives what the early-end rule would have counted from the finish times.
old = """    if(isFinal && fin.length && raceTime-firstFinish>6) allDone=true;                      // winner crowned, short grace
    if(!isFinal && fin.length>=racers.length-1 && raceTime-lastFinish>4) allDone=true;      // one straggler left
    if(!isFinal && fin.length>=keepN && raceTime-firstFinish>20) allDone=true;              // cut-off after the leaders"""
new = """    if(!window.__fullTime){
    if(isFinal && fin.length && raceTime-firstFinish>6) allDone=true;                      // winner crowned, short grace
    if(!isFinal && fin.length>=racers.length-1 && raceTime-lastFinish>4) allDone=true;      // one straggler left
    if(!isFinal && fin.length>=keepN && raceTime-firstFinish>20) allDone=true;              // cut-off after the leaders
    }"""
assert s.count(old) == 1, "early-end anchor: %d" % s.count(old)
s = s.replace(old, new)


# ---- where every fall happens (test build only)
old = "  function fallDown(r){" + chr(10) + "    if(!r.isPlayer){"
new = ("  function fallDown(r){" + chr(10)
       + "    (window.__fallLog=window.__fallLog||[]).push((function(){ const e={x:Math.round(r.x), y:Math.round(r.y), h:+r.h.toFixed(1), vy:+r.vy.toFixed(1), n:r.isPlayer?'YOU':r.name};"
       + " for(const o of obstacles){ if(o.type!=='discField') continue; if(r.y<o.y0-40||r.y>o.y1+40) continue;"
       + " let bc=null,bd=1e9; for(const c of o.cells){ const d=Math.hypot(r.x-c.x, r.y-c.y); if(d<bd){bd=d;bc=c;} }"
       + " if(bc){ e.near=Math.round(bd); e.rim=Math.round(bd-bc.r); e.col=bc.col; e.row=bc.row; } } return e; })());" + chr(10)
       + "    if(!r.isPlayer){")
assert s.count(old) == 1, "fallDown anchor: %d" % s.count(old)
s = s.replace(old, new)

CHECKS = io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "checks.js"),
                 encoding="utf-8").read()

hook = """
  // ---- debug hook (test build only) ----

  // How far back a fall actually put a racer.
  //
  // respawnAfterFall IS the v23 section-back fix: before it, falling in left
  // you ninety units before the thing you fell into, standing on its edge with
  // no run-up, and one racer could collect twenty-five falls at a single hole.
  // Check h was written to guard that, but it guards it by counting falls,
  // which cannot tell "put back on the lip" from "ran the whole course again
  // and failed again". Recording the distance lets it assert the fix itself.
  //
  // The knockout path returns without moving anyone, so nothing is recorded
  // for a survival round -- there is no respawn there to measure.
  const __respawnInner = respawnAfterFall;
  respawnAfterFall = function(r){
    const y0 = r.y, out0 = !!r.lavaOut;
    __respawnInner(r);
    if(!r.lavaOut && !out0){
      (r.recoveries = r.recoveries || []).push(Math.round(y0 - r.y));
    }
  };

  window.__dbg = {
    start:(n,map)=>{ window.__forceMap=map||null; ['home','profile','results','gameover'].forEach(id=>$(id).classList.add('hidden')); startRound(n||1,null); },
    skip:()=>{ for(const r of racers) if(!r.isPlayer){ r.finished=true; r.finishTime=raceTime; } },
    win:()=>{ const p=racers.find(r=>r.isPlayer); p.y=trackLength+10; },
    coins:(c)=>{ stats.coins=c; saveProfile(); refreshCoinChips(); return stats.coins; },
    setWins:(w)=>{ stats.wins=w; checkAchievements(); saveProfile(); return stats.wins; },
    equip:(id)=>{ stats.owned=stats.owned||[]; if(!stats.owned.includes(id)) stats.owned.push(id); custom.skin=id; syncCustomColor(); saveProfile(); refreshPreview(); return id; },
    equipPat:(id)=>{ stats.patterns=stats.patterns||[]; if(!stats.patterns.includes(id)) stats.patterns.push(id); custom.pattern=id; saveProfile(); refreshPreview(); return id; },
    look:(y,p)=>{ look.yaw=y; if(p!==null && p!==undefined) look.pitch=p; look.sinceInput=0; },
    // Read-back, so a harness can restore the resting angle instead of keeping
    // its own copy of it. A second copy of the shipped pitch in a tool is a
    // second thing to update when the framing is retuned.
    lookState:()=>({yaw:look.yaw, pitch:look.pitch, sinceInput:look.sinceInput}),
    // tick() steps the simulation and the scene but NOT the HUD, so the DOM a
    // screenshot catches is whatever updateHud last wrote -- which is why the
    // GO! banner sat over the review shots minutes of simulated time after it
    // should have gone. This drives the same path the game's own loop does.
    hud:()=>{ updateHud(); },
    // The player's world position, and whether any camera blocker stands
    // between the lens and them. Used by the review harness to tell "framed out
    // of shot" apart from "behind a wall", which look identical in a PNG.
    playerWorld:()=>{ const p=racers.find(r=>r.isPlayer);
      const w=toWorld(p.x, p.y, (p.floorH||0)+p.h+RADIUS); return {x:w.x,y:w.y,z:w.z}; },
    blockedToPlayer:()=>{ const p=racers.find(r=>r.isPlayer);
      const w=toWorld(p.x, p.y, (p.floorH||0)+p.h+RADIUS);
      const from=camera.position.clone(), to=new THREE.Vector3(w.x,w.y,w.z);
      const dir=to.clone().sub(from), len=dir.length(); dir.normalize();
      const ray=new THREE.Raycaster(from, dir); ray.far=Math.max(1,len-8);
      const hitB=ray.intersectObjects(camBlockers,false).map(h=>h.object.name||'blocker');
      const hitF=ray.intersectObjects(fadeables,false).map(h=>h.object.name||'fadeable');
      return {blockers:hitB.length, fadeables:hitF.length, dist:Math.round(len)}; },
    tick:(n,dt)=>{
      dt = dt||1/60; n = n||60;
      window.__T = window.__T || performance.now()/1000;
      for(let i=0;i<n;i++){
        const t = window.__T;
        if(mp.role==='client'){ clientTick(dt); } else { update(dt,t); }
        if(state==='menu'){ syncPreview(t,dt); } else { syncObstacles(t); syncRacers(t); syncCamera(false,dt); }
        updateSkinMaterials(t);
        window.__T += dt;
      }
      // The plain renderer, not the composer: a check that steps sixty
      // seconds of race would otherwise pay for occlusion and bloom on every
      // one of its ticks, and none of them look at the result. Check 3c uses
      // renderFull() below, which is the real path.
      //
      // Under window.__noRender the rasterising is skipped but the matrix
      // update is NOT. render() quietly does scene.updateMatrixWorld() on its
      // way through, and checks read world positions that come from it: drop
      // the whole call and [5] measures feet 0.0 off the floor, [R] puts the
      // camera nowhere and [h] simulates differently. Updating the matrices
      // and skipping the draw keeps every world position identical and stops
      // paying SwiftShader for a picture nobody looks at -- which is what put
      // [i] bot dives at 34 minutes on a runner and timed its shard out.
      if(window.__noRender){ scene.updateMatrixWorld(); camera.updateMatrixWorld(); }
      else renderer.render(scene,camera);
      return window.__dbg.info();
    },
    hold:(k,v)=>{ keys[k]=v!==false; },
    // The analog stick. computeInputVec reads touchVec for the on-screen pad and
    // the gamepad alike, so this is how a harness presses something other than
    // all-the-way. Screen axes: +y is up the screen, which the input vector
    // flips, so stick(0,1) is forward exactly as the pad's forward is.
    stick:(x,y)=>{ touchVec.x = x||0; touchVec.y = y||0; return {x:touchVec.x, y:touchVec.y}; },
    pops:()=>coinPops.map(p=>p.n+' '+p.why),
    // jump and dive fire on keydown, so holding the key does nothing. These are
    // what a playtest presses.
    press:(what)=>{ const p=racers.find(r=>r.isPlayer); if(!p) return false;
                    return what==='dive' ? doDive(p) : doJump(p); },
    event:(kind)=>{ window.__forceEvent = kind||null; return kind||'random'; },
    ev:()=>mapEvent && ({kind:mapEvent.kind, t:+mapEvent.t.toFixed(1), active:mapEvent.active, warned:mapEvent.warned}),
    parts:()=>({live:particles.length, group:particleGroup.children.length}),
    renderFull:()=>{ renderFrame(); },
    quality:(q)=>applyQuality(q),
    gfx:()=>({renderer, scene, camera, skyDome, cloudGroup, dirLight, hemi, THREE,
              composer, gtaoPass, bloomPass, smaaPass, outputPass, qualityNow}),
    warp:(y,x)=>{ const p=racers.find(r=>r.isPlayer); p.y=y; if(x!==undefined) p.x=x; syncCamera(true); return p.y; },
    doors:()=>obstacles.filter(o=>o.type==='doors').map(o=>({y:Math.round(o.y),
      items:o.items.map(i=>({x:Math.round(i.x), fake:i.fake, broken:i.broken}))})),
    falls:()=>racers.map(r=>({p:!!r.isPlayer, falls:r.fallCount, x:Math.round(r.x), y:Math.round(r.y), out:!!r.lavaOut, h:Math.round(r.h), floor:Math.round(r.floorH||0)})),
    // spinbar hitbox check: compare the collision segment against the actual mesh
    barCheck:()=>{
      const o=obstacles.find(x=>x.type==='spinbar'); if(!o||!o.mesh) return 'no spinbar';
      const t=window.__T||0;
      const ang=spinAngle(o,t);
      o.mesh.rotation.y=ang;              // pin the mesh to the same instant we are testing
      const dx=Math.cos(ang)*o.length/2, dy=-Math.sin(ang)*o.length/2;
      // collision end, in scene space
      const colEnd={x:toSceneX(o.cx+dx), z:o.y+dy};
      // mesh end, straight from the scene graph
      const v=new THREE.Vector3(o.length/2,0,0); o.mesh.updateMatrixWorld(true);
      v.applyMatrix4(o.mesh.matrixWorld);
      return {ang:+ang.toFixed(3), col:[+colEnd.x.toFixed(1),+colEnd.z.toFixed(1)],
              mesh:[+v.x.toFixed(1),+v.z.toFixed(1)],
              err:+Math.hypot(colEnd.x-v.x, colEnd.z-v.z).toFixed(2)};
    },
    rollTest:(n)=>{ const t={}; for(let i=0;i<(n||20000);i++){ const r=rollSpinRarity(); t[r]=(t[r]||0)+1; } return t; },
    spinState:()=>({ lastSpin:stats.lastSpin, readyIn:spinReadyIn(), owned:stats.owned.length }),
    shots:()=>shots.length,
    preview:()=>({ visible:previewGroup.visible, x:+previewGroup.position.x.toFixed(1),
                   hasBlob:!!menuBlob, state, W, camZ:+camera.position.z.toFixed(1),
                   // ry is measured RELATIVE TO FACING THE CAMERA: the rig's
                   // rest yaw is PI, so a raw rotation.y of PI reads as 0 here
                   // and a trace of these numbers says how far the character
                   // ever turns away from the player. rx is already absolute.
                   ry: menuBlob? +wrapPi(menuBlob.group.rotation.y - Math.PI).toFixed(3) : null,
                   rx: menuBlob? +wrapPi(menuBlob.group.rotation.x).toFixed(3) : null,
                   camY:+camera.position.y.toFixed(1), act: idleAct(),
                   blobWorldX: menuBlob? +menuBlob.group.getWorldPosition(new THREE.Vector3()).x.toFixed(1) : null }),
    // Put the lobby up from wherever the game is, with the turn reset, so a
    // harness photographs the screen a player lands on rather than whatever
    // state the previous check left behind.
    lobby:()=>{ goHome(); openLobbyTab('play'); resetPreviewSpin(); syncMenuChrome(); updateHud();
                return window.__dbg.preview(); },
    // The face, big enough to judge an eye by. Moving the LENS rather than
    // cropping the PNG: a crop of a 1280-wide lobby frame has about ninety
    // pixels of face in it. Call with false to put the lobby camera back.
    faceCam:(on)=>{ window.__faceCam = (on===undefined) ? true : !!on;
                    renderFrame(); return window.__faceCam; },
    // Where the eyes and the face plate actually ARE, in the face bone's own
    // frame, after every transform the rig bakes in. The numbers the eye checks
    // assert, and the only honest way to ask whether an eye is symmetric: the
    // source constants say what was intended, this says what was built.
    // The character's top and bottom in NDC, for the review harness's
    // envelope sweep: anything outside -1..1 is off the screen. Asked of the
    // live pose, so it answers for whatever the idle is doing right now.
    previewExtent:()=>{
      if(!menuBlob) return null;
      const b = new THREE.Box3().setFromObject(menuBlob.group);
      const hi = new THREE.Vector3(0, b.max.y, b.getCenter(new THREE.Vector3()).z).project(camera);
      const lo = new THREE.Vector3(0, b.min.y, b.getCenter(new THREE.Vector3()).z).project(camera);
      return { top:hi.y, bottom:lo.y, act:idleAct() }; },
    // Build one seeded round and report, SEPARATELY: how many Math.random
    // draws the build consumed, a hash of the roster it produced, and a hash of
    // the race that followed. Separating them is what tells "the build drew a
    // different number of times" apart from "an identical roster raced
    // differently", which a single digest cannot.
    buildProbe:(map, seed)=>{
      const S = window.__checks.seeded;
      const real = Math.random;
      let n = 0;
      const H = (vals)=>{ let h = 0x811c9dc5; for(const v of vals){ h ^= (Math.round(v*64)|0); h = Math.imul(h, 0x01000193); } return h >>> 0; };
      let buildDraws = 0, rosterHash = 0, raceHash = 0, T0 = 0;
      S.withSeed(seed >>> 0, ()=>{
        const pinned = Math.random;
        Math.random = function(){ n++; return pinned(); };
        T0 = +window.__T.toFixed(3);
        wipeRoundState();
        window.__forceMap = map;
        startRound(1, null);
        buildDraws = n;
        Math.random = pinned;
        rosterHash = H(racers.flatMap(r=>[r.speed||0, (r.aiRoute===undefined?-1:r.aiRoute), r.x, r.y]));
        window.__dbg.tick(600);
        raceHash = H(racers.flatMap(r=>[r.x, r.y, r.h]));
      });
      return { buildDraws, rosterHash, raceHash, T0 }; },
    racerDump:()=>racers.map(r=>({ n:r.name, bot:!r.isPlayer, x:+r.x.toFixed(3), y:+r.y.toFixed(3),
      h:+r.h.toFixed(3), sp:+(r.speed||0).toFixed(4), route:+(r.aiRoute===undefined?-1:r.aiRoute).toFixed(4),
      tx:+(r.targetX||0).toFixed(3), skin:r.skinId, hat:r.hat, eyes:r.eyes, col:r.color })),
    faceMetrics:()=>{
      if(!menuBlob || !menuBlob.eyeProbes || menuBlob.eyeProbes.length!==2) return null;
      const face = menuBlob.facePlate, fb = new THREE.Box3().setFromObject(face);
      const inv = new THREE.Matrix4().copy(menuBlob.faceGroup.matrixWorld).invert();
      const local = (m)=>{ const b=new THREE.Box3(); const g=m.geometry.clone();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
        g.computeBoundingBox(); b.copy(g.boundingBox); g.dispose(); return b; };
      const e = menuBlob.eyeProbes.map(local), f = local(face);
      const dim = (b)=>({ w:+(b.max.x-b.min.x).toFixed(3), h:+(b.max.y-b.min.y).toFixed(3),
                          d:+(b.max.z-b.min.z).toFixed(3),
                          cx:+((b.max.x+b.min.x)/2).toFixed(3), cy:+((b.max.y+b.min.y)/2).toFixed(3),
                          cz:+((b.max.z+b.min.z)/2).toFixed(3) });
      const L=dim(e[0]), R=dim(e[1]), F=dim(f);
      return { left:L, right:R, face:F,
               aspect:+((L.h/L.w+R.h/R.w)/2).toFixed(3),
               sep:+Math.abs(R.cx-L.cx).toFixed(3),
               sepOverFaceW:+(Math.abs(R.cx-L.cx)/F.w).toFixed(3),
               dyMismatch:+Math.abs(R.cy-L.cy).toFixed(4),
               dxAsymmetry:+Math.abs(Math.abs(R.cx-F.cx)-Math.abs(L.cx-F.cx)).toFixed(4),
               sizeMismatch:+Math.max(Math.abs(R.w-L.w), Math.abs(R.h-L.h)).toFixed(4),
               // how far down the plate the eye pair sits, 0 at the top edge
               dropFrac:+(((F.cy+F.h/2)-L.cy)/F.h).toFixed(3),
               insideX:+((F.w/2 - (Math.abs(L.cx-F.cx)+L.w/2))).toFixed(3),
               insideY:+((F.h/2 - (Math.abs(L.cy-F.cy)+L.h/2))).toFixed(3),
               worldFaceY:+fb.getCenter(new THREE.Vector3()).y.toFixed(2) }; },
    warns:()=>obstacles.filter(o=>o.type==='cannon')
      .reduce((n,o)=>n+((o.meshes||[]).filter(m=>m.warn&&m.warn.visible).length),0),
    cannons:()=>obstacles.filter(o=>o.type==='cannon').slice(0,3).map(o=>({
      y:Math.round(o.y), items:o.items.map(i=>({y:Math.round(i.y), cool:+(i.cool===undefined?-999:i.cool).toFixed(2),
        interval:+(i.interval===undefined?-999:i.interval).toFixed(2), side:i.side, speed:Math.round(i.speed||-999)}))})),
    stumbling:()=>racers.filter(r=>r.stumbleT>0).length,
    layers:()=>{ const f=obstacles.find(o=>o.type==='tilefield'); if(!f) return 'none'; const byL={0:0,1:0,2:0,none:0}; for(const r of racers){ if(r.lavaOut){ byL.none++; continue; } byL[r.tileLayer===undefined?0:r.tileLayer]++; } const gone=[0,0,0]; for(const t of f.tiles) if(t.gone) gone[t.layer]++; const armed=[0,0,0]; for(const t of f.tiles) if(!t.gone && t.fuse>=0) armed[t.layer]++; return { racersOnLayer:byL, goneByLayer:gone, armedByLayer:armed, cols:f.columns.length }; },
    planFor:()=>{ const r=racers.find(x=>!x.isPlayer&&!x.lavaOut); if(!r) return 'none'; const o=nextObstacle(r); const handled=botPlan(r,o,o?o.y0-r.y:Infinity,window.__T||0,1/60); return { type:o&&o.type, y:Math.round(r.y), dist:o?Math.round(o.y0-r.y):null, handled, targetX:Math.round(r.targetX||0), thr:r.aiThrottle, goal:r.tileGoal?Math.round(r.tileGoal.y):null }; },
    lavaMargin:(m)=>{ window.__lavaMargin = m; return m; },
    tileUnder:()=>{ const f=obstacles.find(o=>o.type==='tilefield'); const p=racers.find(r=>r.isPlayer); if(!f) return 'no field'; const tl=tileAt(f,p.x,p.y); return { y:Math.round(p.y), h:+p.h.toFixed(2), floor:Math.round(p.floorH||0), inField:(p.y>f.yStart&&p.y<f.yEnd), yStart:f.yStart, yEnd:f.yEnd, tile: tl? {r:tl.r,c:tl.c,touched:tl.touched,fuse:+tl.fuse.toFixed(2),gone:tl.gone,drop:+tl.drop.toFixed(2)} : null, grace:+(p.tileGraceUntil||-1).toFixed(1), raceTime:+raceTime.toFixed(1) }; },
    noGap:(v)=>{ for(const m of MAPS) m.forcedGap = v ? false : undefined; return MAPS.map(m=>m.key+':'+(m.forcedGap===false?'off':'on')).join(','); },
    cam:()=>{ const p=racers.find(r=>r.isPlayer); const w=toWorld(p.x,p.y,(p.floorH||0)+p.h+RADIUS); camera.updateMatrixWorld(true); const v=new THREE.Vector3(w.x,w.y,w.z).project(camera); return { pos:[+camera.position.x.toFixed(1),+camera.position.y.toFixed(1),+camera.position.z.toFixed(1)], aspect:camera.aspect, fov:camera.fov, reach:+camReach.toFixed(1), zoom:+camZoom.toFixed(2), pivot:[+camPos.x.toFixed(1),+camPos.y.toFixed(1),+camPos.z.toFixed(1)], ndc:[+v.x.toFixed(3),+v.y.toFixed(3)] }; },
    fadeMin:()=>fadeables.length? +Math.min(...fadeables.map(m=>m.material.opacity)).toFixed(3) : null,
    obsAt:(ty)=>obstacles.filter(o=>o.type===ty).map(o=>({y:Math.round(o.y), y0:Math.round(o.y0), y1:Math.round(o.y1), r:o.r!==undefined?Math.round(o.r):null})),
    alive:()=>racers.filter(r=>!r.lavaOut).length,
    finishes:()=>racers.map(r=>({p:!!r.isPlayer, fin:!!r.finished, t:r.finished?+r.finishTime.toFixed(1):null})),
    len:()=>Math.round(trackLength),
    centreline:(n)=>{ n=n||14; const out=[];
      for(let i=0;i<=n;i++){ const sy=trackLength*i/n; const w=toWorld(TRACK_W/2, sy, 0);
        out.push([Math.round(sy), Math.round(w.x), Math.round(w.y), Math.round(w.z)]); }
      return out; },
    overhead:()=>{ // look straight down on the whole course, for a shape shot
      const pts=[]; for(let i=0;i<=40;i++){ const w=toWorld(TRACK_W/2, trackLength*i/40, 0); pts.push(w); }
      let minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9,sumY=0;
      for(const w of pts){ minX=Math.min(minX,w.x); maxX=Math.max(maxX,w.x); minZ=Math.min(minZ,w.z); maxZ=Math.max(maxZ,w.z); sumY+=w.y; }
      const cx=(minX+maxX)/2, cz=(minZ+maxZ)/2, span=Math.max(maxX-minX, maxZ-minZ)+900;
      camera.position.set(cx, sumY/pts.length + span*0.95, cz+1);
      camera.lookAt(cx, sumY/pts.length, cz);
      sky.position.set(camera.position.x, 0, camera.position.z);
      courseGroup.visible=true; racerGroup.visible=true;
      renderer.render(scene,camera);
      return { span:Math.round(span), widthX:Math.round(maxX-minX), depthZ:Math.round(maxZ-minZ) }; },
    rig:()=>{ const p=racers.find(r=>r.isPlayer), m=p.mesh;
      const B=o=>new THREE.Box3().setFromObject(o);
      const body=B(m.body), feet=B(m.feet[0]).union(B(m.feet[1]));
      return { h:+(body.max.y-feet.min.y).toFixed(2), w:+(body.max.x-body.min.x).toFixed(2),
        wz:+(body.max.z-body.min.z).toFixed(2),
        ratio:+((body.max.y-feet.min.y)/(body.max.x-body.min.x)).toFixed(3),
        scale:[+m.group.scale.x.toFixed(3),+m.group.scale.y.toFixed(3),+m.group.scale.z.toFixed(3)],
        rotY:+m.group.rotation.y.toFixed(3), tiltX:+m.tilt.rotation.x.toFixed(3),
        landT:Math.round(p.landT||0), stretchT:Math.round(p.stretchT||0), squash:+(p.squash||0).toFixed(2),
        h_:+p.h.toFixed(2), vh:+p.vh.toFixed(2), floorH:Math.round(p.floorH||0) }; },
    course:()=>{ let mx=0; for(let i=0;i<=60;i++) mx=Math.max(mx, Math.abs(pathAngle(trackLength*i/60)));
      const big=(courseScript||[]).filter(s=>Math.abs(s.turn||0)>=25).length;
      return { map:currentMap.key, len:Math.round(trackLength), sections:(courseScript||[]).length,
        types:[...new Set((courseScript||[]).map(s=>s.type))], bigTurns:big,
        maxHeadingDeg:+(mx*180/Math.PI).toFixed(0),
        h0:Math.round(pathHeight(0)), h1:Math.round(pathHeight(trackLength)),
        script:(courseScript||[]).map(s=>s.type+':'+s.len+(s.turn?('t'+s.turn):'')+(s.climb?('c'+s.climb):'')+(s.drop?('d'+s.drop):'')) }; },
    platsNow:()=>obstacles.filter(o=>o.type==='pit').map(o=>({y0:Math.round(o.y0), xs:o.platforms.map(p=>Math.round(platX(p,obsTime(window.__T||0)))), raw:o.platforms.map(p=>Math.round(platX(p,window.__T||0)))})),
    renderMs:(n)=>{ n=n||30; renderer.render(scene,camera); const t0=performance.now(); for(let i=0;i<n;i++) renderer.render(scene,camera); renderer.getContext().finish(); return +((performance.now()-t0)/n).toFixed(2); },
    shadows:(on)=>{ settings.shadows=!!on; applySettings(); return settings.shadows; },
    me:()=>{ const p=racers.find(r=>r.isPlayer); return {x:Math.round(p.x), y:Math.round(p.y), h:+p.h.toFixed(2), vh:+p.vh.toFixed(2), vx:+p.vx.toFixed(2), vy:+p.vy.toFixed(2), tum:Math.round(p.tumbleT||0), stum:Math.round(p.stumbleT||0), inv:Math.round(p.invuln||0), getUp:Math.round(p.getUpT||0), falling:!!p.falling, floor:Math.round(p.floorH||0), spin:+(p.tumbleSpin||0).toFixed(2), tumbles:p.__tumbles||0}; },
    setMe:(o)=>{ const p=racers.find(r=>r.isPlayer); Object.assign(p,o); return window.__dbg.me(); },
    obsDump:(ty)=>obstacles.filter(o=>!ty||o.type===ty).map(o=>({t:o.type, y:Math.round(o.y!==undefined?o.y:o.yStart), y0:Math.round(o.y0), y1:Math.round(o.y1), cx:o.cx===undefined?null:Math.round(o.cx), hw:o.halfWidth===undefined?null:Math.round(o.halfWidth), xs:o.xs?o.xs.map(Math.round):null, items:(o.items||[]).map(i=>Math.round(i.x===undefined?(i.pivotX||0):i.x))})),
    bots:()=>racers.filter(r=>!r.isPlayer).map(r=>({n:r.name, x:Math.round(r.x), y:Math.round(r.y), h:+r.h.toFixed(1), vh:+r.vh.toFixed(1), vy:+r.vy.toFixed(2), tx:Math.round(r.targetX||0), thr:r.aiThrottle, falls:r.fallCount, ad:r.__airDives||0, route:+(r.aiRoute||0).toFixed(2), hf:r.holeFalls||{}, falling:!!r.falling, esc:+(r.escapeT||0).toFixed(1), pw:r.pitWait?{xw:Math.round(r.pitWait.xWait), c:r.pitWait.committed, w:+r.pitWait.waited.toFixed(1), f:r.pitWait.falls}:null})),
    pits:()=>obstacles.filter(o=>o.type==='pit').map(o=>({y0:Math.round(o.y0), y1:Math.round(o.y1), plats:o.platforms.map(p=>({b:Math.round(p.baseX), a:Math.round(p.amp), s:+p.speed.toFixed(2), w:Math.round(p.width)}))})),
    holeFalls:()=>{ const t={}; for(const r of racers){ if(r.isPlayer) continue; for(const k in (r.holeFalls||{})) t[k]=(t[k]||0)+r.holeFalls[k]; } return t; },
    obsKeys:()=>obstacles.filter(o=>o.yStart!==undefined).map(o=>obsKey(o)+':'+o.type+'@'+Math.round(o.yStart)),
    spread:()=>{ const a=racers.filter(r=>!r.lavaOut); const ring=obstacles.find(o=>o.type==='ring');
      if(!ring||!a.length) return null;
      const d=a.map(r=>Math.hypot(r.x-ring.cx, r.y-ring.y)).sort((x,y)=>x-y);
      return { ringR:Math.round(ring.r), inside:d.filter(x=>x<=ring.r).length, furthest:Math.round(d[d.length-1]) }; },
    arena:()=>({ arenaEnd, state, over: racers.filter(r=>r.y>arenaEnd+5).map(r=>({ n:r.isPlayer?'YOU':r.name, over:+(r.y-arenaEnd).toFixed(1), out:!!r.lavaOut, fin:!!r.finished, fall:!!r.falling, vy:+r.vy.toFixed(2) })) }),
    knockOut:()=>{ const p=racers.find(r=>r.isPlayer); p.lavaOut=true; p.lavaCatchY=p.y; updateHud(); return racers.filter(r=>!r.lavaOut).length; },
    beams:()=>{ const d=obstacles.find(o=>o.type==='disc');
      return { disc: d?{cx:Math.round(d.cx), y:Math.round(d.y), r:Math.round(d.r), speed:d.speed}:null,
               rings: obstacles.filter(o=>o.type==='spinlaser').map(o=>({ h:o.h, arms:o.arms, len:Math.round(o.len),
                 speed:+(o.speed||0).toFixed(3), ang:+(spinlaserAngle(o, obsTime(window.__T||0))).toFixed(2), raw:o.ang===undefined?null:+o.ang.toFixed(2) })) }; },
    walls:()=>{ const p=obstacles.find(o=>o.type==='plate');
      return { plate: p?{yNear:p.yNear, yFar:p.yFar, w:p.w}:null,
               walls: obstacles.filter(o=>o.type==='blockwall').map(o=>({ wy:Math.round(o.wy), gapStart:o.gapStart, travel:Math.round(o.travel||0), xs:o.items.map(i=>Math.round(i.x)) })),
               racers: racers.map(r=>({ n:r.isPlayer?'YOU':r.name, x:Math.round(r.x), y:Math.round(r.y), out:!!r.lavaOut, fall:!!r.falling })) }; },
    fallLog:()=>{ const l=window.__fallLog||[]; window.__fallLog=[]; return l; },
    freezeDiscs:()=>{ let n=0; for(const o of obstacles) if(o.type==='discField') for(const c of o.cells){ c.speed=0; n++; } return n; },
    discGaps:()=>obstacles.filter(o=>o.type==='discField').map(o=>{
      const g={};
      for(const col of [0,1]){
        const cs=o.cells.filter(c=>c.col===col).sort((a,b)=>a.row-b.row);
        g['col'+col]={ n:cs.length, gaps:cs.slice(1).map((c,i)=>Math.round(c.y-cs[i].y-o.r*2)),
                       dx:cs.slice(1).map((c,i)=>Math.round(Math.abs(c.x-cs[i].x))) };
      }
      return { y0:Math.round(o.yStart), y1:Math.round(o.yEnd), r:o.r, airGaps:o.airGaps, cols:g };
    }),
    obsTypes:()=>{ const h={}; for(const o of obstacles) h[o.type]=(h[o.type]||0)+1; return h; },
    wipe:()=>{ try{ localStorage.removeItem(SAVE_KEY); }catch(e){} return 'cleared'; },
    // The whole movement state of one racer, in one object. tools/movement-metrics.mjs
    // samples this every frame to measure acceleration, braking, turn rates,
    // jump arcs and dive reach, so that the feel of the bean is a number some-
    // thing can disagree with rather than an opinion. Defaults to the player.
    // Kept deliberately flat and cheap: it is read sixty times a simulated
    // second and anything clever in here shows up as harness overhead.
    rstate:(i)=>{ const r = (i===undefined||i===null) ? racers.find(x=>x.isPlayer) : racers[i];
      if(!r) return null;
      return { x:r.x, y:r.y, h:r.h, vx:r.vx, vy:r.vy, vh:r.vh, facing:r.facing,
               spd:Math.hypot(r.vx,r.vy), floorH:r.floorH||0,
               diveT:r.diveT||0, diveCd:r.diveCd||0, airDive:!!r.airDive,
               getUpT:r.getUpT||0, landT:r.landT||0, slideT:r.slideT||0,
               tumbleT:r.tumbleT||0, stumbleT:r.stumbleT||0, platVX:r.platVX||0,
               coyote:r.coyote===undefined?-1:r.coyote, jumpBuf:r.jumpBuf||0,
               respawnFreeze:r.respawnFreeze||0, falling:!!r.falling,
               finished:!!r.finished, lavaOut:!!r.lavaOut,
               cpIndex:r.cpIndex===undefined?-1:r.cpIndex, fallCount:r.fallCount||0 }; },
    // Where a pit's moving decks are at this instant, and how fast each is
    // travelling sideways. A harness that wants to stand a racer ON a platform
    // has to be told where the platform is: standing them at the middle of the
    // track and hoping is how a carry test silently becomes a falling test.
    platAt:(y)=>{ const o = obstacles.find(x=>x.type==='pit' && y>=x.yStart && y<=x.yEnd)
                          || obstacles.find(x=>x.type==='pit');
      if(!o) return null;
      const t = obsTime(window.__T||0);
      return { yStart:Math.round(o.yStart), yEnd:Math.round(o.yEnd),
               platforms:o.platforms.map(p=>({ x:+platX(p,t).toFixed(1), w:p.width,
                 vx:+(Math.cos(t*p.speed+p.phase)*p.amp*p.speed/60).toFixed(4) })),
               islands:(o.islands||[]).map(i=>({x:i.x,w:i.w,y0:Math.round(i.y0),y1:Math.round(i.y1)})) }; },
    // Where every bot is against where it is trying to be. The lane a bot aims
    // at is r.targetX and the only thing it can do about the difference is push
    // sideways, so these four numbers are the whole of its steering problem --
    // and on ice, where a push takes a second to answer, the gap between them
    // is what a narrow channel is lost by. tools/map-sweep.mjs samples this to
    // tell "aimed at the wrong lane" apart from "aimed at the right lane and
    // could not hold it", which look identical in a fall count.
    botTrack:()=>racers.filter(r=>!r.isPlayer && !r.lavaOut && !r.finished).map(r=>({
      x:+r.x.toFixed(1), y:+r.y.toFixed(1), vx:+r.vx.toFixed(3),
      targetX:+(r.targetX===undefined?-1:r.targetX).toFixed(1),
      err:+(r.targetX===undefined?0:r.targetX-r.x).toFixed(1),
      h:+r.h.toFixed(1), falling:!!r.falling, tumbleT:+(r.tumbleT||0).toFixed(0) })),
    // A controlled starting condition for movement measurement: every bot parked
    // off the course where nothing it does can reach the subject, and the player
    // set down at a chosen point with no velocity and no timer left running from
    // whatever happened before. tools/movement-metrics.mjs calls this before
    // every run; the numbers it reports are only comparable because it does.
    // lavaOut is how the bots are parked because the physics loop skips such a
    // racer outright -- freezing them any later still lets them push the subject.
    mlab:(y,x)=>{ const p=racers.find(r=>r.isPlayer); if(!p) return null;
      for(const r of racers) if(!r.isPlayer){ r.lavaOut = true; r.x = -9000; r.y = -9000; }
      if(y!==undefined) p.y = y;
      if(x!==undefined) p.x = x;
      p.vx=0; p.vy=0; p.vh=0; p.h=0; p.facing=Math.PI/2;
      p.diveT=0; p.diveCd=0; p.airDive=false; p.getUpT=0; p.getUpTotal=0;
      p.landT=0; p.slideT=0; p.tumbleT=0; p.tumbleSpin=0; p.stumbleT=0;
      p.platVX=0; p.jumpBuf=0; p.respawnFreeze=0; p.falling=false;
      p.invuln=0; p.windT=0; p.squash=0; p.stretchT=0;
      touchVec.x=0; touchVec.y=0;
      for(const k in keys) keys[k]=false;
      look.yaw=0; look.pitch=CAM.PITCH;
      syncCamera(true);
      return window.__dbg.rstate(); },
    // The constants the feel is made of, read from the game rather than copied
    // into the tool -- a second copy of ACCEL in a harness is a second thing to
    // forget when the movement is retuned.
    mconst:()=>({ V_MAX, ACCEL, GROUND_FR, AIR_FR, ICE_FR, V_CAP,
                  JUMP_V, GRAV_UP, GRAV_DOWN, APEX_GRAV,
                  TURN_RATE_GROUND, TURN_RATE_AIR,
                  DIVE_IMPULSE, DIVE_PRONE_MS, DIVE_CD_MS, DIVE_GETUP_MS,
                  AIR_DIVE_BOOST, AIR_DIVE_KICK, AIR_DIVE_FLOOR,
                  COYOTE_MS, BUFFER_MS, LAND_SLIDE_F, LAND_SLIDE_FR, LAND_SLIDE_STEER,
                  AIR_CONTROL, RESPAWN_FREEZE_S }),
    info:()=>{
      const hf=obstacles.find(o=>o.type==='hexfield');
      const tf=obstacles.find(o=>o.type==='tilefield');
      return { state, round, map:currentMap.key, mode:currentMap.mode||null, racers:racers.length,
        // What KIND of round this is. A survival map has no finish line, so a
        // sweep that counts finishers on one is measuring nothing -- it has to
        // count survivors instead, and it cannot tell which to do without this.
        knockout:!!currentMap.knockout, isMinigame:!!currentMap.isMinigame,
        arenaEnd:Math.round(arenaEnd||0),
        boulders:boulders.length, obstacles:Object.keys(window.__dbg.obsTypes()),
        tiles:tf?tf.tiles.length:0, gone:tf?tf.tiles.filter(t=>t.gone).length:0,
        hexCells:hf?hf.cells.length:0, hexGone:hf?hf.cells.filter(c=>c.gone).length:0,
        coins:stats.coins, skin:custom.skin, pattern:custom.pattern,
        yaw:+look.yaw.toFixed(2), pitch:+look.pitch.toFixed(2),
        playerY:Math.round((racers.find(r=>r.isPlayer)||{}).y||0), trackLength:Math.round(trackLength) };
    }
  };

__CHECKS__
})();"""
hook = hook.replace("__CHECKS__", CHECKS)
assert s.count("\n})();") == 1
s = s.replace("\n})();", hook)

io.open(OUT, "w", encoding="utf-8", newline="\n").write(s)
print("wrote", OUT)
