#!/usr/bin/env python3
"""Throwaway debug copy of the current build, exposing internals for browser tests.

    python build/mkdebug.py

Writes __debug.html (gitignored). It adds window.__dbg with a manual tick(), so
the simulation can be stepped by hand -- handy because requestAnimationFrame is
frozen in some embedded preview panes.
"""
import io, os

VERSION = 9
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "scramble-rush-%d.0.html" % VERSION)
OUT = os.path.join(ROOT, "__debug.html")

s = io.open(SRC, encoding="utf-8").read()

old = "      currentMap = (Math.random()<chance) ? pick(MINIGAMES) : pick(MAPS);"
new = ("      currentMap = window.__forceMap ? [...MAPS,...MINIGAMES].find(x=>x.key===window.__forceMap)\n"
       "        : ((Math.random()<chance) ? pick(MINIGAMES) : pick(MAPS));")
assert s.count(old) == 1, "map-pick anchor: %d" % s.count(old)
s = s.replace(old, new)

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
      renderer.render(scene,camera);
      return window.__dbg.info();
    },
    hold:(k,v)=>{ keys[k]=v!==false; },
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
})();"""
assert s.count("\n})();") == 1
s = s.replace("\n})();", hook)

io.open(OUT, "w", encoding="utf-8", newline="\n").write(s)
print("wrote", OUT)
