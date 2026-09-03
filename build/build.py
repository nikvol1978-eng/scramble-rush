#!/usr/bin/env python3
"""Build a Scramble Rush release from the v5 base plus the fragments in frag/.

    python build/build.py

Every version is spliced from `index.html` (v5.0), which is never modified. The
output filename and the <title> version are both derived from VERSION below, and
an existing release is never overwritten without --force. A stale VERSION quietly
eating a released file is how v7 got clobbered, twice.
"""
import io, os, sys

VERSION = 19                                  # single source of truth
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRAG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frag")
BASE = os.path.join(ROOT, "index.html")
OUT  = os.path.join(ROOT, "scramble-rush-%d.0.html" % VERSION)

def frag(name):
    with io.open(os.path.join(FRAG, name), encoding="utf-8") as f:
        return f.read()

def guard_output():
    """Released builds are immutable.

    Bumping VERSION is not enough on its own: if the fragments move on to v9
    while VERSION still says 8, the script would happily relabel v9 content as
    v8 and eat the released file. So the only safe rule is that an existing
    output is never touched without saying so explicitly.
    """
    if not os.path.exists(OUT) or "--force" in sys.argv:
        return
    msg = [
        "refusing to overwrite " + os.path.basename(OUT) + " -- it already exists.",
        "  Bump VERSION in build/build.py to cut a new release, or",
        "  pass --force if you really mean to rebuild this one in place.",
        "  (Committed versions are recoverable: git checkout -- <file>)",
    ]
    sys.exit(chr(10).join(msg))

guard_output()

with io.open(BASE, encoding="utf-8") as f:
    src = f.read()

errors = []

def cut(start, end, repl, label):
    """Replace src[start_anchor .. end_anchor) with repl. end_anchor is kept."""
    global src
    i = src.find(start)
    if i < 0:
        errors.append("START not found: " + label); return
    j = src.find(end, i + len(start))
    if j < 0:
        errors.append("END not found: " + label); return
    src = src[:i] + repl + src[j:]

def sub(old, new, label, count=1):
    global src
    if src.count(old) < count:
        errors.append("anchor missing (%d found): %s" % (src.count(old), label)); return
    src = src.replace(old, new, count)

# ---------------------------------------------------------------- title
# a zero-height window makes aspect NaN, and every projected position with it
sub("  function resize(){ W=window.innerWidth; H=window.innerHeight; renderer.setSize(W,H); camera.aspect=W/H; camera.updateProjectionMatrix(); }",
    "  function resize(){ W=Math.max(1,window.innerWidth); H=Math.max(1,window.innerHeight); renderer.setSize(W,H); camera.aspect=W/H; camera.updateProjectionMatrix(); }",
    "resize guard")

# a wider lens: obstacles need to be on screen sooner than 1.5s before impact
sub("  const camera = new THREE.PerspectiveCamera(58, W/H, 0.1, 4000);",
    "  const camera = new THREE.PerspectiveCamera(64, W/H, 0.1, 4000);",
    "wider fov")

# A 760-wide track at RADIUS 17 is 22 bean-widths across, which reads as a field.
sub("  const TRACK_W = 760;", "  const TRACK_W = 520;", "narrower track")

# the narrow channel can sit off-centre now, so the bots have to aim at it
sub("      r.targetX=TRACK_W/2+(r.aiRoute-0.5)*o.halfWidth*0.7;",
    "      r.targetX=TRACK_W/2+(o.offset||0)+(r.aiRoute-0.5)*o.halfWidth*0.7;",
    "bot aims at the narrow channel")

# The checkerboard moired badly at distance: no mipmaps, no anisotropy.
sub("    const tex=new THREE.CanvasTexture(cv); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.encoding=THREE.sRGBEncoding; return tex;",
    "    const tex=new THREE.CanvasTexture(cv); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.encoding=THREE.sRGBEncoding;"
    + chr(10) + "    tex.generateMipmaps=true; tex.minFilter=THREE.LinearMipmapLinearFilter; tex.magFilter=THREE.LinearFilter;"
    + chr(10) + "    tex.anisotropy=renderer.capabilities.getMaxAnisotropy(); return tex;",
    "ground texture filtering")
# ...and the checks are half as dense, so the pattern reads instead of shimmering
sub("    const mapGroundTex = checkerTexture(currentMap.ground, currentMap.groundAlt, 2);",
    "    const mapGroundTex = checkerTexture(currentMap.ground, currentMap.groundAlt, 1);",
    "bigger checks")
# the round-reward toast hung around into the next map intro
sub("  function startRound(n, survivors){",
    "  function startRound(n, survivors){" + chr(10) + "    coinPops.length = 0; renderCoinPops(0);",
    "clear the reward toast")

sub("<title>Scramble Rush 3D</title>",
    "<title>Scramble Rush 3D \u2014 v%d.0</title>" % VERSION, "title")

# ---------------------------------------------------------------- CSS
sub("</style>\n</head>", frag("04_menu.css") + "</style>\n</head>", "css append")

# ---------------------------------------------------------------- HOME + PROFILE markup
cut('<div id="home" class="screen">',
    '<div id="settings" class="screen shade hidden">',
    '<div id="coinPops"></div>\n\n' + frag("03_home.html") + "\n\n",
    "home/profile markup")

# ---------------------------------------------------------------- data layer
cut("  const DEFAULT_SETTINGS = {",
    "  function rankCompare(a,b){",
    frag("01_data.js") + "\n",
    "data layer")

# ---------------------------------------------------------------- profile persistence
cut("  async function loadProfile(){",
    "  // ============================================================\n  // MULTIPLAYER",
    """  const SAVE_KEY = 'scrambleRush.profile.v6';
  async function loadProfile(){
    try{
      let raw = null;
      try{ raw = localStorage.getItem(SAVE_KEY); }catch(e){}
      if(!raw && window.storage){ const p = await window.storage.get('profile', false); if(p && p.value) raw = p.value; }
      if(raw){ const d=JSON.parse(raw); Object.assign(custom, d.custom||{}); Object.assign(stats, d.stats||{}); }
    }catch(e){ /* first run, or storage blocked \u2014 just play unsaved */ }
    if(!SKIN_BY_ID[custom.skin]) custom.skin='pink';
    if(!PATTERN_BY_ID[custom.pattern]) custom.pattern='none';
    stats.owned  = stats.owned  || [];
    stats.patterns = stats.patterns || [];
    stats.badges = stats.badges || [];
    stats.claimed= stats.claimed|| [];
    syncCustomColor();
    checkAchievements();
    refreshCoinChips();
    refreshDailyChip();
    refreshPreview();
  }
  async function saveProfile(){
    const payload = JSON.stringify({custom,stats});
    try{ localStorage.setItem(SAVE_KEY, payload); }catch(e){}
    try{ if(window.storage) await window.storage.set('profile', payload, false); }catch(e){}
  }

""",
    "profile persistence")

# client-side lava reset uses the new mode flag
sub("      lavaZ = currentMap.isMinigame ? -320 : 0;",
    "      lavaZ = currentMap.mode==='lava' ? -320 : 0;", "client lavaZ")
sub("      if(round===1){ stats.races++; saveProfile(); refreshStatsLine(); }",
    "      if(round===1){ stats.races++; saveProfile(); }", "client races++")

# ---------------------------------------------------------------- skins + makeBlob
cut("  function makeBlob(opts){",
    "  // ============================================================\n  // INPUT",
    frag("02_skinmat.js") + frag("02b_rig.js") + "\n",
    "skin materials + character rig")

# ---------------------------------------------------------------- course path
cut("  function buildCourseMeshes(){",
    "  function syncObstacles(t){",
    frag("17_path.js") + "\n" + frag("18_coursemesh.js") + "\n",
    "course path + course meshes")


# ---------------------------------------------------------------- course generation
cut("  function genCourse(n){",
    "  // ============================================================\n  // COURSE MESHES",
    frag("08_gencourse.js") + "\n",
    "genCourse")




# ---------------------------------------------------------------- racers wear skins
sub("      list.push(Object.assign(baseRacer(), {isPlayer:true, remoteId:null, _localId:'host', name:custom.name||'YOU', color:custom.color, hat:custom.hat, eyes:custom.eyes, x:pslot, y:-60}));",
    "      list.push(Object.assign(baseRacer(), {isPlayer:true, remoteId:null, _localId:'host', name:custom.name||'YOU', skinId:custom.skin, color:skinBaseColor(skinOf(custom.skin)), hat:custom.hat, eyes:custom.eyes, x:pslot, y:-60}));",
    "player racer skin")
sub("      const n=clamp(settings.botCount,3,15);",
    "      const n=clamp(settings.botCount,3,19);", "bot clamp")
sub("      const order=[...Array(15).keys()].sort(()=>Math.random()-0.5);",
    "      const order=[...Array(BOT_NAMES.length).keys()].sort(()=>Math.random()-0.5);", "bot order")
sub("        const k=order[i%15];",
    "        const k=order[i%BOT_NAMES.length];", "bot index")
sub("      survivors.forEach((s,i)=>{ list.push(Object.assign(s, baseRacer(), {isPlayer:s.isPlayer, name:s.name, color:s.color, hat:s.hat, eyes:s.eyes,",
    "      survivors.forEach((s,i)=>{ list.push(Object.assign(s, baseRacer(), {isPlayer:s.isPlayer, name:s.name, color:s.color, skinId:s.skinId, hat:s.hat, eyes:s.eyes,",
    "survivor skin carry")
sub("      const b=makeBlob({color:r.color, hat:r.hat, eyes:r.eyes});",
    "      const b=makeCharacter(r.skinId ? {skin:skinOf(r.skinId), pattern:patternOf(r.patternId), hat:r.hat, eyes:r.eyes} : {color:r.color, hat:r.hat, eyes:r.eyes});",
    "racer mesh skin")
sub("skinId:custom.skin, color:skinBaseColor(skinOf(custom.skin))",
    "skinId:custom.skin, patternId:custom.pattern, color:skinBaseColor(skinOf(custom.skin))",
    "player pattern")
sub("{isPlayer:s.isPlayer, name:s.name, color:s.color, skinId:s.skinId, hat:s.hat, eyes:s.eyes,",
    "{isPlayer:s.isPlayer, name:s.name, color:s.color, skinId:s.skinId, patternId:s.patternId, hat:s.hat, eyes:s.eyes,",
    "survivor pattern carry")
sub("  function buildRacerMeshes(){\n    clearGroup(racerGroup);",
    "  function buildRacerMeshes(){\n    clearGroup(racerGroup);\n    animatedMats=[];",
    "reset animated mats")

# ---------------------------------------------------------------- respawn understands tile fields
cut("  function respawnAfterFall(r){",
    "  function spawnBurst3D(",
    frag("11_respawn.js"),
    "respawnAfterFall")

# ---------------------------------------------------------------- collisions + minigames
cut("  function checkObstacles(r,t){",
    "  // ============================================================\n  // RACER vs RACER COLLISION",
    frag("09_minigames.js") + "\n",
    "checkObstacles + minigame runtime")

# ---------------------------------------------------------------- update loop
sub("""  function update(dt,t){
    if(state==='mapintro'){""",
    """  function update(dt,t){
    if(state==='loading'){
      // the map reel is a CSS transition; we just wait it out, then reveal the course
      loadTimer-=dt*1000;
      if(loadTimer<=0){
        hideMapLoader();
        state='mapintro'; mapIntroTimer=FLY_MS;
        $('mapIntro').classList.remove('hidden');
      }
      return;
    }
    if(state==='mapintro'){""",
    "loading state")

sub("        showBanner('ROUND '+round,1200);\n        if(mp.role==='host') broadcast({type:'banner',text:'ROUND '+round,ms:1200});",
    "        showBanner(roundLabel(round),1200);\n        if(mp.role==='host') broadcast({type:'banner',text:roundLabel(round),ms:1200});",
    "round banner")
sub("    if(currentMap.isMinigame){ lavaZ+=lavaSpeed*dt;",
    "    if(currentMap.mode==='lava'){ lavaZ+=lavaSpeed*dt;", "lava advance")
sub("      if(currentMap.isMinigame && !r.falling && r.y<lavaZ-40){",
    "      if(currentMap.mode==='lava' && !r.falling && r.y<lavaZ-40){", "lava catch")
# The minigame tick now lives at the end of 14_physics.js. It used to be
# injected here, but this cut's end anchor is racerCollisions(), so the
# physics splice deleted the call and every minigame stopped ticking.

sub("""    let allDone = (fin.length+out.length)===racers.length || timeLeft<=0;
    if(round===2 && fin.length && raceTime-firstFinish>6) allDone=true;                 // winner crowned, short grace
    if(round===1 && fin.length>=racers.length-1 && raceTime-lastFinish>4) allDone=true;   // one straggler left
    if(round===1 && fin.length>=Math.ceil(racers.length/2) && raceTime-firstFinish>20) allDone=true; // cut-off after leaders
    if(allDone) endRound();
    else if(round===1 && fin.length>=Math.ceil(racers.length/2) && !p.finished && raceTime-firstFinish>15 && raceTime-firstFinish<15.1) showBanner('HURRY!',1200);""",
    """    const isFinal = round===ROUNDS;
    const keepN = isFinal ? 1 : survivorsAfter(round, racers.length);
    let allDone = (fin.length+out.length)===racers.length || timeLeft<=0;
    if(isFinal && fin.length && raceTime-firstFinish>6) allDone=true;                      // winner crowned, short grace
    if(!isFinal && fin.length>=racers.length-1 && raceTime-lastFinish>4) allDone=true;      // one straggler left
    if(!isFinal && fin.length>=keepN && raceTime-firstFinish>20) allDone=true;              // cut-off after the leaders
    if(currentMap.mode==='collect'){
      // Not a race and not a cull: you are through the moment you have your
      // three gems. When enough people are through, everyone else is out.
      const gf = obstacles.find(o=>o.type==='gems');
      const target = knockoutTarget(racers.length, keepN);
      const safe = racers.filter(r=>r.gemSafe).length;
      const nothingLeft = gf && gf.items.every(g=>g.taken);
      allDone = (raceTime > KNOCKOUT_MIN_S && safe >= target) || nothingLeft || timeLeft<=0;
      if(allDone){
        for(const r of racers) if(!r.gemSafe && !r.lavaOut){ r.lavaOut = true; r.lavaCatchY = r.y; }
      } else if(safe === target-1 && p.gemSafe && !p.knockWarned){ p.knockWarned=true; showBanner('ONE SPOT LEFT!',1400); }
    }
    else if(currentMap.knockout){
      // Survival. The normal round-1 cut keeps 12 of 16, which in a knockout ends
      // the round the moment four people fall -- about two seconds. So a knockout
      // cuts harder and cannot end before it has had time to be a round.
      const alive = racers.filter(r=>!r.lavaOut).length;
      const target = knockoutTarget(racers.length, keepN);
      allDone = (raceTime > KNOCKOUT_MIN_S && alive <= target) || timeLeft<=0;
      if(alive === target+1 && !p.lavaOut && !p.knockWarned){ p.knockWarned=true; showBanner('ONE MORE!',1400); }
    }
    if(allDone) endRound();
    else if(!isFinal && !currentMap.knockout && fin.length>=keepN && !p.finished && raceTime-firstFinish>15 && raceTime-firstFinish<15.1) showBanner('HURRY!',1200);""",
    "round end conditions")

# ---------------------------------------------------------------- obstacle animation
cut("  function syncObstacles(t){",
    "  // ============================================================\n  // RACERS",
    frag("13_syncobs.js") + "\n",
    "syncObstacles")

# ---------------------------------------------------------------- character animation
cut("  function syncRacers(t){",
    "  function syncCamera(snap, dt){",
    frag("12_charanim.js") + "\n",
    "syncRacers")

# ---------------------------------------------------------------- jump + dive
cut("  function doJump(r){",
    "  // ============================================================\n  // PHYSICS HELPERS",
    frag("15_actions.js") + "\n",
    "jump/dive actions")

# ------------------------------------------------- movement, physics, finish area
cut("""    const p=racers.find(r=>r.isPlayer);
    if(p&&!p.finished){""",
    "    racerCollisions();",
    frag("14_physics.js"),
    "movement + physics")

# racers carry the new timers
sub("  function baseRacer(){ return {x:0,y:-60,",
    "  function baseRacer(){ return {getUpT:0,coyote:0,jumpBuf:0,jumpCut:false,floorH:0,x:0,y:-60,",
    "baseRacer fields")

# ---------------------------------------------------------------- bot AI must predict the same bar the collision uses
sub("          const tt=t+0.22; const ang=spinAngle(o,tt); const dx=Math.cos(ang)*o.length/2, dy=Math.sin(ang)*o.length/2;",
    "          const tt=t+0.22; const ang=spinAngle(o,tt); const dx=Math.cos(ang)*o.length/2, dy=-Math.sin(ang)*o.length/2;",
    "bot spinbar prediction")

# ----------------------------------------------------------------- music
sub("  function racerCollisions(){",
    frag("23_music.js") + "\n" + "  function racerCollisions(){",
    "music fragment")

# the anti-stall runs every frame, plan or no plan
sub("  function updateBotAI(r,dt,t,f){",
    "  function updateBotAI(r,dt,t,f){" + chr(10) + "    botAntiStall(r,dt);",
    "anti-stall hook")

# ------------------------------------------------------------- bot plans
sub("  function racerCollisions(){",
    frag("24_botplan.js") + "\n" + "  function racerCollisions(){",
    "bot plan fragment")
sub("    } else if(o.type==='pillars'){",
    "    } else if(botPlan(r,o,dist,t,dt)){ throttle = r.aiThrottle; }" + "\n" +
    "    else if(o.type==='pillars'){",
    "bot plan hook")
# remember where a bot fell, so it can stop feeding the same hole
sub("  function fallDown(r){",
    "  function fallDown(r){" + "\n" +
    "    if(!r.isPlayer){ const o = nextObstacle(r);" + "\n" +
    "      if(o && r.lastFallY !== undefined && Math.abs(r.lastFallY - o.y) < 150) r.spotFalls = (r.spotFalls||0)+1;" + "\n" +
    "      else r.spotFalls = 1;" + "\n" +
    "      r.lastFallY = o ? o.y : r.y; }",
    "bot fall memory")

# ------------------------------------------------------- bots keep up now
# Bots drove at 0.52*speed(0.84-1.04) against the player's ACCEL. That is a
# 20-35% handicap, which is why holding W won races.
sub("    r.vy+=0.52*(r.speed||1)*diffMult()*throttle*f;",
    "    r.vy+=ACCEL*(r.speed||1)*diffMult()*throttle*WIND(r)*f;",
    "bot accel")
sub("    r.vx+=clamp(dx*0.035,-0.75,0.75)*f;",
    "    r.vx+=clamp(dx*0.055,-1.5,1.5)*f;",
    "bot steering keeps up with the new friction")
sub("x:s, speed:rand(0.84,1.04),",
    "x:s, speed:(i<3 ? rand(1.00,1.05) : rand(0.93,1.03)),",
    "bot speed spread, with a few elites")

# ------------------------------------------------------------ arena bot ai
sub("  function racerCollisions(){",
    frag("22_arenaai.js") + "\n" + "  function racerCollisions(){",
    "arena ai fragment")

# ------------------------------------------------------- waves + map events
sub("  function racerCollisions(){",
    frag("21_living.js") + "\n" + "  function racerCollisions(){",
    "living maps")

# ------------------------------------------------------------- arena bot AI
sub("  function updateBotAI(r,dt,t,f){",
    "  function updateBotAI(r,dt,t,f){" + "\n" +
    "    if(arenaBotAI(r,dt,t,f)) return;",
    "arena bot ai")

# ---------------------------------------------------------------- spectator
sub("  function racerCollisions(){",
    frag("20_spectate.js") + "\n" + "  function racerCollisions(){",
    "spectator")

# -------------------------------------------------- impacts + slipstream
cut("  function racerCollisions(){",
    "  function nextObstacle(r){",
    frag("19_impacts.js") + "\n",
    "racer collisions + slipstream")

# ---------------------------------------------------------------- camera-relative movement
cut("  function computeInputVec(){",
    "  // ============================================================\n  // GAME STATE",
    """  function computeInputVec(){
    const k=settings.keys; let ix=0, iy=0;
    if(keys[k.left]||keys['arrowleft']) ix-=1;
    if(keys[k.right]||keys['arrowright']) ix+=1;
    if(keys[k.forward]||keys['arrowup']) iy+=1;
    if(keys[k.back]||keys['arrowdown']) iy-=1;
    if(touchVec.x||touchVec.y){ ix+=touchVec.x; iy-=touchVec.y; }
    ix=-ix; // camera looks down +Z, so screen-right is sim -X
    if(settings.invertX) ix=-ix;
    if(settings.camRelative && typeof look!=='undefined'){
      // steer relative to where the camera is pointing, so "forward" is always
      // away from the camera however far you have swung the view round
      const a=look.yaw, c=Math.cos(a), s=Math.sin(a);
      const rx = ix*c - iy*s, ry = ix*s + iy*c;
      ix=rx; iy=ry;
    }
    return {ix,iy};
  }

""",
    "computeInputVec")

# ---------------------------------------------------------------- camera
cut("  function syncCamera(snap, dt){",
    "  // ============================================================\n  // ROUND FLOW",
    frag("06_camera.js") + "\n",
    "camera")

# ---------------------------------------------------------------- round flow (split in two)
rounds = frag("07_rounds.js")
split = rounds.find("  function endRound(){")
assert split > 0, "07_rounds.js: endRound marker missing"
cut("  function startRound(n, survivors){",
    "  function showBanner(text,ms){",
    rounds[:split],
    "startRound")
cut("  function endRound(){",
    "  // ============================================================\n  // MENU: 3D PREVIEW + UI",
    rounds[split:] + "\n",
    "endRound + result screens")

# goHome now knows about the profile screen
sub("    ['results','gameover','pause','settings','customize','mpHome','lobby'].forEach(id=>$(id).classList.add('hidden'));",
    "    ['results','gameover','pause','settings','profile','mpHome','lobby'].forEach(id=>$(id).classList.add('hidden'));",
    "goHome screens")
sub("    courseGroup.visible=false; racerGroup.visible=false; previewGroup.visible=true; clearParticles();\n    refreshPreview();",
    "    courseGroup.visible=false; racerGroup.visible=false; previewGroup.visible=true; clearParticles();\n    boulders=[]; stopMusic(); refreshPreview(); refreshCoinChips(); refreshDailyChip();",
    "goHome refresh")

# ---------------------------------------------------------------- preview + profile UI
cut("  function refreshPreview(){",
    "  function buildSettings(){",
    frag("05_profile.js") + "\n" + frag("16_daily.js") + "\n" + frag("10_wiring.js") + "\n",
    "preview + profile UI")

# ---------------------------------------------------------------- settings additions
sub("""    const bots=document.createElement('div'); bots.className='row'; const br=document.createElement('input'); br.type='range'; br.min=3; br.max=15;""",
    """    const bots=document.createElement('div'); bots.className='row'; const br=document.createElement('input'); br.type='range'; br.min=5; br.max=19;""",
    "bot slider range")
sub("""    toggle('shake','Camera shake');""",
    """    toggle('freeLook','Free look (trackpad / drag)');
    const ls=document.createElement('div'); ls.className='row'; const lr=document.createElement('input'); lr.type='range'; lr.min=0.4; lr.max=2.2; lr.step=0.1; lr.value=settings.lookSens; const lv=document.createElement('span'); lv.className='lbl'; lv.textContent=settings.lookSens.toFixed(1)+'\\u00d7'; lr.oninput=()=>{ settings.lookSens=+lr.value; lv.textContent=settings.lookSens.toFixed(1)+'\\u00d7'; }; ls.appendChild(lr); ls.appendChild(lv); row('Look sensitivity', ls);
    toggle('mouseLook','Mouse look (click to capture)');
    toggle('invertLook','Invert look up/down');
    toggle('camRelative','Move relative to camera');
    toggle('autoCentre','Camera drifts back behind you');
    toggle('shake','Camera shake');""",
    "look settings")

# goHome must also clear the map reel if you bail mid-load
sub("    ['results','gameover','pause','settings','profile','mpHome','lobby'].forEach(id=>$(id).classList.add('hidden'));",
    "    ['results','gameover','pause','settings','profile','mpHome','lobby','mapLoader','mapIntro','daily'].forEach(id=>$(id).classList.add('hidden'));",
    "goHome hides loader")

# settings back button returns to whichever screen was open
sub("""  $('settingsBtn').onclick=()=>{ SFX.click(); $('home').classList.add('hidden'); buildSettings(); $('settings').classList.remove('hidden'); };""",
    """  $('settingsBtn').onclick=()=>{ SFX.click(); $('home').classList.add('hidden'); buildSettings(); $('settings').classList.remove('hidden'); };""",
    "settings open")

# ---------------------------------------------------------------- main loop
sub("""    if(state==='menu'){ syncPreview(t,dt); }
    else { syncObstacles(t+mp.tOffset); syncRacers(t); syncCamera(false,dt); }
    renderer.render(scene,camera);""",
    """    if(state==='menu'){ syncPreview(t,dt); }
    else { syncObstacles(obsTime(t+mp.tOffset)); syncRacers(t); syncCamera(false,dt); }
    updateSkinMaterials(t);
    renderCoinPops(dt);
    renderer.render(scene,camera);""",
    "loop hooks")

# HUD progress dots should show the player's colourway
sub("  function updateHud(){",
    "  function updateHud(){" + chr(10) + "    updateSpectator();",
    "spectator hud tick")

sub("    $('rankBadge').textContent=`Rank ${rank}/${racers.length}`;",
    "    const gf__ = obstacles.find(o=>o.type==='gems');"
    + chr(10) + "    if(gf__){ const me__ = racers.find(r=>r.isPlayer); $('rankBadge').textContent = 'GEMS ' + ((me__&&me__.gems)||0) + '/' + gf__.need; } else"
    + chr(10) + "    $('rankBadge').textContent = currentMap.knockout"
    + chr(10) + "      ? racers.filter(r=>!r.lavaOut).length+' LEFT'"
    + chr(10) + "      : `Rank ${rank}/${racers.length}`;",
    "knockout hud")

# in a survival round the bar shows the arena, not an unreachable finish line
sub("      const pct=clamp(r.y/trackLength,0,1); const d=document.createElement('div');",
    "      const pct=clamp(r.y/((currentMap.knockout && arenaEnd) ? arenaEnd : trackLength),0,1); const d=document.createElement('div');",
    "knockout progress bar")

# the HUD comes back once the opening shot is over
sub("        $('mapIntro').classList.add('hidden');",
    "        $('mapIntro').classList.add('hidden');"
    + chr(10) + "        $('hud').classList.remove('hidden'); $('pauseBtn').classList.remove('hidden');",
    "hud after flyover")


if errors:
    print("FAILED:")
    for e in errors: print("  - " + e)
    sys.exit(1)

with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(src)
print("wrote %s (%d bytes, %d lines)" % (OUT, len(src.encode("utf-8")), src.count("\n")+1))
