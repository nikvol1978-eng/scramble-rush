#!/usr/bin/env python3
"""Build a Scramble Rush release from the v5 base plus the fragments in frag/.

    python build/build.py

Every version is spliced from `index.html` (v5.0), which is never modified. The
output filename and the <title> version are both derived from VERSION below, and
an existing release is never overwritten without --force. A stale VERSION quietly
eating a released file is how v7 got clobbered, twice.
"""
import io, os, re, sys

VERSION = 24                                  # single source of truth
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRAG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frag")
BASE = os.path.join(ROOT, "index.html")
OUT  = os.path.join(ROOT, "scramble-rush-%d.0.html" % VERSION)

SHELF = os.path.join(FRAG, "25_shelved.js")
WITH_SHELVED = "--with-shelved" in sys.argv
SHELF_MARKER = re.compile(r"^[ \t]*//<<shelved:([A-Za-z0-9_-]+)>>[ \t]*\r?\n", re.M)
SHELF_HEADER = re.compile(r"^// ===== shelved:([A-Za-z0-9_-]+) =====\r?\n", re.M)


def shelf_sections():
    """The cut maps' code, parked in 25_shelved.js and keyed by section name.

    The default build drops these; --with-shelved splices each one back at the
    marker left in its place, which is what makes a shelved build byte-identical
    to the build the code was lifted out of.
    """
    with io.open(SHELF, encoding="utf-8") as f:
        text = f.read()
    out, hits = {}, list(SHELF_HEADER.finditer(text))
    for n, m in enumerate(hits):
        last = n + 1 == len(hits)
        end = len(text) if last else hits[n + 1].start()
        body = text[m.end():end]
        # Sections are written one blank line apart so the file reads; that
        # blank line belongs to the file, not to the code, so give it back.
        # Blocks that genuinely end on a blank line keep theirs.
        if not last:
            body = body[:-1]
        out[m.group(1)] = body
    return out


SHELVED = shelf_sections()
SHELF_USED = set()


def frag(name):
    with io.open(os.path.join(FRAG, name), encoding="utf-8") as f:
        text = f.read()

    def splice(m):
        key = m.group(1)
        if key not in SHELVED:
            errors.append("no shelved section named " + key + " (in " + name + ")")
            return ""
        SHELF_USED.add(key)
        return SHELVED[key] if WITH_SHELVED else ""

    return SHELF_MARKER.sub(splice, text)

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

# --------------------------------------------------------------- three r160
# r128 came off cdnjs as a global. r160 is ES modules only for the addons we
# want (RoomEnvironment, Sky, the composer), so the page gets an import map and
# the game script becomes a module. Module scripts are deferred, which is fine:
# nothing outside the IIFE touches the game, and peerjs stays a global.
sub('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>',
    '<script type="importmap">' + chr(10)
    + '{ "imports": {' + chr(10)
    + '  "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",' + chr(10)
    + '  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"' + chr(10)
    + '} }' + chr(10)
    + '</script>',
    "three r160 import map")
sub("<script>" + chr(10) + "(function(){",
    '<script type="module">' + chr(10) + frag("26_preamble.js") + "(function(){",
    "game script becomes a module")

# ---------------------------------------------------------------- title
# a zero-height window makes aspect NaN, and every projected position with it
sub("  function resize(){ W=window.innerWidth; H=window.innerHeight; renderer.setSize(W,H); camera.aspect=W/H; camera.updateProjectionMatrix(); }",
    "  function resize(){ W=Math.max(1,window.innerWidth); H=Math.max(1,window.innerHeight); renderer.setSize(W,H); camera.aspect=W/H; camera.updateProjectionMatrix(); resizeComposer(W,H); }",
    "resize guard")

# v20 look: filmic tone mapping, and a shadow bias that keeps the beans on the floor
sub("  renderer.outputEncoding = THREE.sRGBEncoding;",
    "  renderer.outputColorSpace = THREE.SRGBColorSpace;"
    + chr(10) + "  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;",
    "tone mapping")

# Soft shadows a clearcoat does not turn into a stencil. VSM blurs the shadow
# map itself, so the radius is a real blur rather than PCF's jitter.
sub("  renderer.shadowMap.type = THREE.PCFSoftShadowMap;",
    "  renderer.shadowMap.type = THREE.VSMShadowMap;", "vsm shadows")

# The plastic has to have something to reflect or the clearcoat is invisible.
# RoomEnvironment is a handful of boxes and area lights rendered once into a
# cube map: one frame at startup, nothing after.
sub("  const scene = new THREE.Scene();",
    "  const scene = new THREE.Scene();"
    + chr(10) + "  {"
    + chr(10) + "    const pmrem = new THREE.PMREMGenerator(renderer);"
    + chr(10) + "    scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;"
    + chr(10) + "    pmrem.dispose();"
    + chr(10) + "  }",
    "image-based ambient")

# Physical lights, so these are not the r128 numbers any more. The key does the
# shaping, the hemisphere tints from the map's sky, and the environment above
# carries the ambient the fill used to fake.
sub("  const hemi = new THREE.HemisphereLight(0xfff3d6, 0x3a2270, 0.9); scene.add(hemi);",
    "  const hemi = new THREE.HemisphereLight(0xfff3d6, 0x3a2270, 0.55); scene.add(hemi);",
    "hemisphere intensity")
sub("  const dirLight = new THREE.DirectionalLight(0xfff4e0, 1.0);",
    "  const dirLight = new THREE.DirectionalLight(0xfff4e0, 2.1);", "key intensity")
sub("  const fillLight = new THREE.DirectionalLight(0xffb0e0, 0.25); fillLight.position.set(-150,150,-100); scene.add(fillLight);",
    "  const fillLight = new THREE.DirectionalLight(0xffb0e0, 0.35); fillLight.position.set(-150,150,-100); scene.add(fillLight);",
    "fill intensity")

# The key light now comes from wherever the map's sun is.
sub("    dirLight.position.set(toSceneX(p.x)+220, 420, p.y-160); dirLight.target.position.set(toSceneX(p.x), 0, p.y+150);",
    "    dirLight.position.set(toSceneX(p.x)+sunOff.x, sunOff.y, p.y+sunOff.z); dirLight.target.position.set(toSceneX(p.x), 0, p.y+150);",
    "the key follows the map sun")

# ------------------------------------------------------------- sky + clouds
sub("  function racerCollisions(){",
    frag("27_sky.js") + chr(10) + "  function racerCollisions(){",
    "sky and clouds")

# --------------------------------------------------------------- the composer
sub("  function racerCollisions(){",
    frag("28_post.js") + chr(10) + "  function racerCollisions(){",
    "the composer")

# The quality switch sits with the other display settings.
sub("    toggle('shadows','Shadows');",
    "    const qseg=document.createElement('div'); qseg.className='seg';"
    + chr(10) + "    [['low','Low'],['medium','Medium'],['high','High']].forEach(([k,l])=>{ const b=document.createElement('button'); b.className='chip'+(settings.quality===k?' sel':''); b.textContent=l; b.onclick=()=>{ settings.quality=k; SFX.click(); applyQuality(k); buildSettings(); }; qseg.appendChild(b); });"
    + chr(10) + "    row('Graphics', qseg);"
    + chr(10) + "    toggle('shadows','Shadows');",
    "quality switch")
sub("  function applySettings(){ renderer.shadowMap.enabled=settings.shadows;",
    "  function applySettings(){ renderer.shadowMap.enabled=settings.shadows; applyQuality(settings.quality||'high');",
    "quality applied with the rest")
sub("  dirLight.shadow.bias = -0.0008;",
    "  dirLight.shadow.bias = -0.0004; dirLight.shadow.normalBias = 1.2;"
    + chr(10) + "  dirLight.shadow.radius = 4; dirLight.shadow.blurSamples = 12;",
    "shadow bias")

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

# Textures name a colour space now, not an encoding. Both canvas textures in
# the base say the same line, so both are renamed before the filtering sub
# below picks the first of them out by its new text.
sub("tex.encoding=THREE.sRGBEncoding;", "tex.colorSpace=THREE.SRGBColorSpace;",
    "texture colour space", count=2)

# The checkerboard moired badly at distance: no mipmaps, no anisotropy.
sub("    const tex=new THREE.CanvasTexture(cv); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.colorSpace=THREE.SRGBColorSpace; return tex;",
    "    const tex=new THREE.CanvasTexture(cv); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.colorSpace=THREE.SRGBColorSpace;"
    + chr(10) + "    tex.generateMipmaps=true; tex.minFilter=THREE.LinearMipmapLinearFilter; tex.magFilter=THREE.LinearFilter;"
    + chr(10) + "    tex.anisotropy=renderer.capabilities.getMaxAnisotropy(); return tex;",
    "ground texture filtering")
# The diagonal stripes moired at distance for the same reason the chequers did.
sub("    const tex=new THREE.CanvasTexture(cv); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.colorSpace=THREE.SRGBColorSpace; return tex;",
    "    const tex=new THREE.CanvasTexture(cv); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.colorSpace=THREE.SRGBColorSpace;"
    + chr(10) + "    tex.generateMipmaps=true; tex.minFilter=THREE.LinearMipmapLinearFilter; tex.magFilter=THREE.LinearFilter;"
    + chr(10) + "    tex.anisotropy=renderer.capabilities.getMaxAnisotropy(); return tex;",
    "stripe texture filtering")

# ...and the checks are half as dense, so the pattern reads instead of shimmering
sub("    const mapGroundTex = checkerTexture(currentMap.ground, currentMap.groundAlt, 2);",
    "    const mapGroundTex = checkerTexture(currentMap.ground, currentMap.groundAlt, 1);",
    "bigger checks")
# The reward-toast clear used to be patched in here. It never survived: the
# round-flow cut further down replaces index.html's startRound wholesale, so
# this sub found its anchor, applied, and was then deleted. It lives in
# 07_rounds.js now, which is the startRound that ships.

# The lava chases the pack rather than running to a fixed schedule. On a
# fixed schedule a few early falls cascade and it sweeps the whole field --
# one run in five ended with nobody left, at every cushion setting.
sub("    if(currentMap.isMinigame){ lavaZ+=lavaSpeed*dt; if(lavaMesh){ lavaMesh.position.z=lavaZ; lavaGlow.position.z=lavaZ+30; } }",
    "    if(currentMap.isMinigame){ lavaZ+=lavaSpeed*dt;"
    + chr(10) + "      if(currentMap.mode==='lava'){"
    + chr(10) + "        let lead__ = -1e9;"
    + chr(10) + "        for(const r of racers) if(!r.lavaOut && !r.falling) lead__ = Math.max(lead__, r.y);"
    + chr(10) + "        if(lead__ > -1e8) lavaZ = Math.min(lavaZ, lead__ - 340);"
    + chr(10) + "      }"
    + chr(10) + "      if(lavaMesh){ lavaMesh.position.z=lavaZ; lavaGlow.position.z=lavaZ+30; } }",
    "lava chases the leader")

# Panel Drop can end on the clock with everyone still in, so survivors are
# separated by which floor they are on, then by how recently they dropped to it.
sub("    if(a.finished&&b.finished) return a.finishTime-b.finishTime;",
    "    if(a.tileLayer !== undefined && b.tileLayer !== undefined){"
    + chr(10) + "      if(a.tileLayer !== b.tileLayer) return a.tileLayer - b.tileLayer;"
    + chr(10) + "      if((a.lastDropT||0) !== (b.lastDropT||0)) return (b.lastDropT||0) - (a.lastDropT||0);"
    + chr(10) + "    }"
    + chr(10) + "    if(a.finished&&b.finished) return a.finishTime-b.finishTime;",
    "tile tumble ranking")

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




# ---------------------------------------------------------------- the field
# makeRacers is replaced outright rather than patched. It used to carry seven
# separate subs -- the field size, the name pool, the wardrobe, the start
# slots -- and one of them was landing on the wrong line: "bot look" anchored
# on a string the survivors branch happened to share, so every racer including
# the player was reskinned at the start of rounds two and three. A field of
# twenty-four needs a grid rather than a row, and that is easier to read whole.
cut("  function makeRacers(survivors){",
    "  function buildRacerMeshes(){",
    frag("29_racers.js"),
    "the field")
sub("      const b=makeBlob({color:r.color, hat:r.hat, eyes:r.eyes});",
    "      const b=makeCharacter(r.skinId ? {skin:skinOf(r.skinId), pattern:patternOf(r.patternId), hat:r.hat, eyes:r.eyes} : {color:r.color, hat:r.hat, eyes:r.eyes});",
    "racer mesh skin")
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
      // the cut count itself -- 12 in an early round, 1 in a final -- or the clock
      const target = isFinal ? 1 : keepN;
      allDone = alive <= target || timeLeft<=0;
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
    "  function baseRacer(){ return {getUpT:0,coyote:0,jumpBuf:0,slideT:0,airDive:false,airSpeed0:0,cpIndex:-1,floorH:0,x:0,y:-60,",
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
# The obstacles run on obsTime(t): a frenzy event advances it and the offset
# stays for the rest of the round. The bots predicted hammers and platforms on
# the raw clock, so after any frenzy every prediction was off by the same
# amount -- which is how a bot could commit to a platform that was not there.
sub("  function updateBotAI(r,dt,t,f){",
    "  function updateBotAI(r,dt,t,f){" + chr(10) + "    t = obsTime(t);",
    "bot ai on the obstacle clock")

# ------------------------------------------------------------- bot plans
sub("  function racerCollisions(){",
    frag("24_botplan.js") + "\n" + "  function racerCollisions(){",
    "bot plan fragment")
sub("    } else if(o.type==='pillars'){",
    "    } else if(botPlan(r,o,dist,t,dt)){ throttle = r.aiThrottle; }" + "\n" +
    "    else if(o.type==='pillars'){",
    "bot plan hook")
# tally a fall against the hazard it happened in, keyed by that hazard
sub("  function fallDown(r){",
    "  function fallDown(r){" + chr(10) +
    "    if(!r.isPlayer){" + chr(10) +
    "      const hz = obstacles.find(x=>(x.type==='pit'||x.type==='narrow'||x.type==='crumble'||x.type==='gap'||x.type==='discField'||x.type==='plank')" + chr(10) +
    "                                  && x.yStart !== undefined && r.y >= x.yStart-60 && r.y <= x.yEnd+60);" + chr(10) +
    "      if(hz){ r.holeFalls = r.holeFalls || {}; const k = obsKey(hz);" + chr(10) +
    "              r.holeFalls[k] = (r.holeFalls[k]||0) + 1; }" + chr(10) +
    "    }",
    "bot fall memory")

# ------------------------------------------------------- bots keep up now
# Bots drove at 0.52*speed(0.84-1.04) against the player's ACCEL. That is a
# 20-35% handicap, which is why holding W won races.
# v22: bots run on the same ice the player does. Without this they steered
# normally down Splash Slide while the player skidded, which is both unfair and
# the reason the map never read as ice from behind a bot.
sub("    r.vy+=0.52*(r.speed||1)*diffMult()*throttle*f;",
    "    r.vy+=ACCEL*iceDriveK()*(r.speed||1)*diffMult()*throttle*WIND(r)*f;",
    "bot accel")
# On ice a bot needs to steer against its own drift as well as towards its
# target -- the second term is the damping, and it is the difference between
# aiming at a gap and arriving in it. The clamp is unchanged, so a bot's
# hardest push sideways is still exactly what it was; it just stops
# overshooting. Bots correct errors they have already made, and on a surface
# that takes a second to answer the helm that alone took them from a median of
# two falls a layout on Splash Slide to eight, all of them at narrow channels
# and crumbling bridges where the line has to be held.
sub("    r.vx+=clamp(dx*0.035,-0.75,0.75)*f;",
    "    const latK = currentMap.slippery ? 1 : DRY_LATERAL_K;" + chr(10)
    + "    const latS = ((r.slideT||0) > 0 ? LAND_SLIDE_STEER : 1);" + chr(10)
    + "    r.vx+=clamp(dx*(currentMap.slippery?0.20:0.055*latK) - (currentMap.slippery?r.vx*0.55:0),-1.5*latK,1.5*latK)*iceSteerK()*latS*f;",
    "bot steering keeps up with the new friction")

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
sub("    boulders=[]; stopMusic(); refreshPreview(); refreshCoinChips(); refreshDailyChip();",
    "    boulders=[]; stopMusic(); refreshPreview(); refreshCoinChips(); refreshDailyChip(); if(typeof selectLobbyTab==='function') selectLobbyTab('play');",
    "goHome lights the play tab")
sub("  $('settingsBackBtn').onclick=()=>{ SFX.click(); listeningFor=null; $('settings').classList.add('hidden'); applySettings(); if(state==='menu') $('home').classList.remove('hidden'); };",
    "  $('settingsBackBtn').onclick=()=>{ SFX.click(); listeningFor=null; $('settings').classList.add('hidden'); applySettings(); if(state==='menu'){ $('home').classList.remove('hidden'); if(typeof selectLobbyTab==='function') selectLobbyTab('play'); } };",
    "settings back lights the play tab")

# ---------------------------------------------------------------- preview + profile UI
cut("  function refreshPreview(){",
    "  function buildSettings(){",
    frag("05_profile.js") + "\n" + frag("16_daily.js") + "\n" + frag("31_locker.js") + "\n" + frag("32_shop.js") + "\n" + frag("33_pass.js") + "\n" + frag("10_wiring.js") + "\n",
    "preview + profile UI")

# ---------------------------------------------------------------- settings additions
sub("""    const bots=document.createElement('div'); bots.className='row'; const br=document.createElement('input'); br.type='range'; br.min=3; br.max=15;""",
    """    const bots=document.createElement('div'); bots.className='row'; const br=document.createElement('input'); br.type='range'; br.min=5; br.max=23;""",
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
    syncSky(dt);
    renderCoinPops(dt);
    renderFrame();
    // dt is the whole frame -- simulation, sync and the composer -- which is
    // what a player would feel, not the slice the renderer alone owns.
    qualityWatch(dt, dt*1000);""",
    "loop hooks")

# HUD progress dots should show the player's colourway
# --------------------------------------------------------------- v24 §3 UI
# Thicker panels, bigger colour-blocked buttons, and a bounce on every one of
# them. The border, the radius and the hard offset shadow were already the
# house style; this is the same style with more of it, which is what "chunky"
# means when the thing being described is a rectangle.
sub("  .panel{background:var(--cream);border:4px solid var(--line);border-radius:20px;box-shadow:0 6px 0 var(--line);}",
    "  .panel{background:var(--cream);border:5px solid var(--line);border-radius:28px;box-shadow:0 9px 0 var(--line);}" + chr(10)
    + "  /* Every panel arrives with a bounce. It overshoots to 1.03 and settles,"
    + " which is the whole difference between a menu appearing and a menu"
    + " being put in front of you. */" + chr(10)
    + "  @keyframes popIn{ 0%{transform:scale(0.86);opacity:0;} 62%{transform:scale(1.03);opacity:1;} 100%{transform:scale(1);opacity:1;} }" + chr(10)
    + "  .panel{animation:popIn .26s cubic-bezier(.34,1.56,.64,1) both;}" + chr(10)
    + "  @media (prefers-reduced-motion: reduce){ .panel{animation:none;} }",
    "chunkier panels, and a bounce on each")
sub("""    font-family:'Fredoka',sans-serif;font-weight:700;font-size:1.1rem;color:var(--line);background:var(--teal);
    border:4px solid var(--line);border-radius:16px;padding:14px 30px;cursor:pointer;box-shadow:0 6px 0 var(--line);
    transition:transform .08s ease, filter .1s;""",
    """    font-family:'Fredoka',sans-serif;font-weight:700;font-size:1.22rem;letter-spacing:0.4px;color:var(--line);background:var(--teal);
    border:5px solid var(--line);border-radius:22px;padding:17px 36px;cursor:pointer;box-shadow:0 8px 0 var(--line);
    transition:transform .08s ease, filter .1s;""",
    "bigger colour-blocked buttons")
sub("  button.btn:active{transform:translateY(4px);box-shadow:0 2px 0 var(--line);}",
    "  button.btn:active{transform:translateY(6px);box-shadow:0 2px 0 var(--line);}",
    "buttons press further")

# ---- the round title is stamped, and says what the round wants
# A name on its own tells you where you are. It does not tell you what you are
# meant to do, which for a survival round is the whole of the information.
sub('<div id="mapIntroName" style="font-family:\'Fredoka\',sans-serif;font-weight:700;font-size:clamp(1.8rem,7vw,3rem);color:#fff;-webkit-text-stroke:2px var(--line);text-shadow:0 5px 0 var(--line);"></div>',
    '<div id="mapIntroName" style="font-family:\'Fredoka\',sans-serif;font-weight:700;font-size:clamp(2.2rem,9vw,4rem);'
    + 'line-height:1.05;color:#fff;-webkit-text-stroke:3px var(--line);text-shadow:0 8px 0 var(--line);'
    + 'transform:rotate(-2.5deg);animation:stampIn .34s cubic-bezier(.2,1.7,.5,1) both;"></div>' + chr(10)
    + '  <div id="mapIntroGoal" style="font-family:\'Fredoka\',sans-serif;font-weight:700;font-size:clamp(0.95rem,3vw,1.4rem);'
    # Gold on a pale course is unreadable, and this line is the one thing on the
    # card a new player has to take in, so it goes on a dark pill.
    + 'letter-spacing:1.5px;margin-top:16px;color:var(--gold);background:rgba(26,16,51,0.78);'
    + 'padding:7px 20px;border-radius:999px;border:3px solid var(--line);'
    + 'animation:stampIn .34s .09s cubic-bezier(.2,1.7,.5,1) both;"></div>',
    "stamped round title plus its objective")
sub("  @keyframes popIn{",
    "  /* A stamp lands: oversized, rotated a touch, and slammed down. */" + chr(10)
    + "  @keyframes stampIn{ 0%{transform:rotate(-2.5deg) scale(2.1);opacity:0;} 70%{transform:rotate(-2.5deg) scale(0.94);opacity:1;} 100%{transform:rotate(-2.5deg) scale(1);opacity:1;} }" + chr(10)
    + "  @keyframes popIn{",
    "the stamp keyframes")

# the qualified badge is the map's teal, and goes gold when the cut is full
sub("  .badge.time{background:var(--red);} .badge.rank{background:var(--purple);}",
    "  .badge.time{background:var(--red);} .badge.rank{background:var(--purple);}" + chr(10)
    + "  .badge.qual{background:var(--teal);color:var(--line);}"
    + " .badge.qual.full{background:var(--gold);color:var(--line);}",
    "qualified badge style")

# the chrome follows the state out of a race as well as into a tab
sub("    state='menu'; $('hud').classList.add('hidden');",
    "    state='menu'; if(typeof syncMenuChrome==='function') setTimeout(syncMenuChrome,0); $('hud').classList.add('hidden');",
    "menu chrome follows the state")

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

# ------------------------------------------------------- QUALIFIED 9/16
# The cut is the thing you are actually racing for, so the HUD says how many
# places are left rather than leaving you to work it out from your rank. It
# fills as racers cross and goes away in the final, which cuts nobody.
sub('<div class="badge rank" id="rankBadge">Rank 1/12</div>',
    '<div class="badge rank" id="rankBadge">Rank 1/12</div>' + chr(10)
    + '    <div class="badge qual hidden" id="qualBadge">QUALIFIED 0/16</div>',
    "qualified badge")
sub("  function updateHud(){" + chr(10) + "    updateSpectator();",
    "  function updateHud(){" + chr(10) + "    updateSpectator();" + chr(10)
    + "    const qb__ = $('qualBadge'), cut__ = (round<ROUNDS) ? survivorsAfter(round, racers.length) : 0;" + chr(10)
    + "    if(cut__ > 0 && !currentMap.knockout){" + chr(10)
    + "      const done__ = racers.filter(r=>r.finished).length;" + chr(10)
    + "      qb__.textContent = 'QUALIFIED ' + Math.min(done__, cut__) + '/' + cut__;" + chr(10)
    + "      qb__.classList.toggle('full', done__ >= cut__);" + chr(10)
    + "      qb__.classList.remove('hidden');" + chr(10)
    + "    } else qb__.classList.add('hidden');",
    "qualified count")

# in a survival round the bar shows the arena, not an unreachable finish line
sub("      const pct=clamp(r.y/trackLength,0,1); const d=document.createElement('div');",
    "      const pct=clamp(r.y/((currentMap.knockout && arenaEnd) ? arenaEnd : trackLength),0,1); const d=document.createElement('div');",
    "knockout progress bar")

# the HUD comes back once the opening shot is over
sub("        $('mapIntro').classList.add('hidden');",
    "        $('mapIntro').classList.add('hidden');"
    + chr(10) + "        $('hud').classList.remove('hidden'); $('pauseBtn').classList.remove('hidden');",
    "hud after flyover")


# A section nothing splices back in is dead weight that no build would ever
# notice was wrong, so say so rather than carrying it.
for key in sorted(set(SHELVED) - SHELF_USED):
    errors.append("shelved section '" + key + "' has no //<<shelved:" + key + ">> marker")

if errors:
    print("FAILED:")
    for e in errors: print("  - " + e)
    sys.exit(1)

with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
    f.write(src)
print("wrote %s (%d bytes, %d lines)" % (OUT, len(src.encode("utf-8")), src.count("\n")+1))
