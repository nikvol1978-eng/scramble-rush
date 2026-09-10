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

old = "      const finals = MINIGAMES.filter(m=>m.final);"
new = ("      if(window.__forceMap){ currentMap = [...MAPS,...MINIGAMES].find(x=>x.key===window.__forceMap);\n"
       "                             // A key naming no map used to leave currentMap alone, so the check\n"
       "                             // quietly measured whatever happened to be loaded, under the wrong\n"
       "                             // label. Say so instead of measuring the wrong thing.\n"
       "                             if(!currentMap) throw new Error('__forceMap: no map named ' + window.__forceMap);\n"
       "                             currentMap.__forced = true; }\n"
       "      else if(currentMap) currentMap.__forced = false;\n"
       "      const finals = MINIGAMES.filter(m=>m.final);")
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

CHECKS = io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "checks.js"),
                 encoding="utf-8").read()

hook = """
  // ---- debug hook (test build only) ----
  window.__dbg = {
    start:(n,map)=>{ window.__forceMap=map||null; ['home','profile','results','gameover'].forEach(id=>$(id).classList.add('hidden')); startRound(n||1,null); },
    skip:()=>{ for(const r of racers) if(!r.isPlayer){ r.finished=true; r.finishTime=raceTime; } },
    win:()=>{ const p=racers.find(r=>r.isPlayer); p.y=trackLength+10; },
    coins:(c)=>{ stats.coins=c; saveProfile(); refreshCoinChips(); return stats.coins; },
    setWins:(w)=>{ stats.wins=w; checkAchievements(); saveProfile(); return stats.wins; },
    equip:(id)=>{ stats.owned=stats.owned||[]; if(!stats.owned.includes(id)) stats.owned.push(id); custom.skin=id; syncCustomColor(); saveProfile(); refreshPreview(); return id; },
    equipPat:(id)=>{ stats.patterns=stats.patterns||[]; if(!stats.patterns.includes(id)) stats.patterns.push(id); custom.pattern=id; saveProfile(); refreshPreview(); return id; },
    look:(y,p)=>{ look.yaw=y; look.pitch=p; look.sinceInput=0; },
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
      renderer.render(scene,camera);
      return window.__dbg.info();
    },
    hold:(k,v)=>{ keys[k]=v!==false; },
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
                   blobWorldX: menuBlob? +menuBlob.group.getWorldPosition(new THREE.Vector3()).x.toFixed(1) : null }),
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
    bots:()=>racers.filter(r=>!r.isPlayer).map(r=>({n:r.name, x:Math.round(r.x), y:Math.round(r.y), h:+r.h.toFixed(1), vh:+r.vh.toFixed(1), vy:+r.vy.toFixed(2), tx:Math.round(r.targetX||0), thr:r.aiThrottle, falls:r.fallCount, hf:r.holeFalls||{}, falling:!!r.falling, esc:+(r.escapeT||0).toFixed(1), pw:r.pitWait?{xw:Math.round(r.pitWait.xWait), c:r.pitWait.committed, w:+r.pitWait.waited.toFixed(1), f:r.pitWait.falls}:null})),
    pits:()=>obstacles.filter(o=>o.type==='pit').map(o=>({y0:Math.round(o.y0), y1:Math.round(o.y1), plats:o.platforms.map(p=>({b:Math.round(p.baseX), a:Math.round(p.amp), s:+p.speed.toFixed(2), w:Math.round(p.width)}))})),
    holeFalls:()=>{ const t={}; for(const r of racers){ if(r.isPlayer) continue; for(const k in (r.holeFalls||{})) t[k]=(t[k]||0)+r.holeFalls[k]; } return t; },
    obsKeys:()=>obstacles.filter(o=>o.yStart!==undefined).map(o=>obsKey(o)+':'+o.type+'@'+Math.round(o.yStart)),
    spread:()=>{ const a=racers.filter(r=>!r.lavaOut); const ring=obstacles.find(o=>o.type==='ring');
      if(!ring||!a.length) return null;
      const d=a.map(r=>Math.hypot(r.x-ring.cx, r.y-ring.y)).sort((x,y)=>x-y);
      return { ringR:Math.round(ring.r), inside:d.filter(x=>x<=ring.r).length, furthest:Math.round(d[d.length-1]) }; },
    arena:()=>({ arenaEnd, state, over: racers.filter(r=>r.y>arenaEnd+5).map(r=>({ n:r.isPlayer?'YOU':r.name, over:+(r.y-arenaEnd).toFixed(1), out:!!r.lavaOut, fin:!!r.finished, fall:!!r.falling, vy:+r.vy.toFixed(2) })) }),
    knockOut:()=>{ const p=racers.find(r=>r.isPlayer); p.lavaOut=true; p.lavaCatchY=p.y; updateHud(); return racers.filter(r=>!r.lavaOut).length; },
    walls:()=>{ const p=obstacles.find(o=>o.type==='plate');
      return { plate: p?{yNear:p.yNear, yFar:p.yFar, w:p.w}:null,
               walls: obstacles.filter(o=>o.type==='blockwall').map(o=>({ wy:Math.round(o.wy), gapStart:o.gapStart, travel:Math.round(o.travel||0), xs:o.items.map(i=>Math.round(i.x)) })),
               racers: racers.map(r=>({ n:r.isPlayer?'YOU':r.name, x:Math.round(r.x), y:Math.round(r.y), out:!!r.lavaOut, fall:!!r.falling })) }; },
    obsTypes:()=>{ const h={}; for(const o of obstacles) h[o.type]=(h[o.type]||0)+1; return h; },
    wipe:()=>{ try{ localStorage.removeItem(SAVE_KEY); }catch(e){} return 'cleared'; },
    info:()=>{
      const hf=obstacles.find(o=>o.type==='hexfield');
      const tf=obstacles.find(o=>o.type==='tilefield');
      return { state, round, map:currentMap.key, mode:currentMap.mode||null, racers:racers.length,
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
