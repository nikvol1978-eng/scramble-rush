  const DEFAULT_SETTINGS = {
    keys:{ forward:'w', back:'s', left:'a', right:'d', jump:' ', dive:'shift' },
    camDist:1.0, botCount:23, difficulty:'normal', invertX:false, sound:true, hints:true, shake:true, touch:isTouch, shadows:true,
    freeLook:true, lookSens:1.0, invertLook:false, camRelative:true,
    padSens:1.0,
    // Free-orbit mouse look is opt-in: the camera should follow you, not be
    // something you have to steer as well.
    mouseLook:false,
    // AUTO-RECENTRE IS OFF BY DEFAULT, and that is a decision rather than an
    // oversight. It was on at a 0.6s delay, which is short enough that letting
    // go of the mouse for half a breath swung the view back on its own. With
    // camera-relative movement now live it is worse than cosmetic: recentring
    // the yaw also turns the direction W is pushing you, so a hands-off moment
    // curves your run. It stays available for anyone who wants the camera to
    // tidy itself up, at a delay and a rate that no longer fight the hand.
    autoCentre:false,
    // §4.5: High is everything, Medium drops the occlusion and the bloom, Low
    // skips the composer altogether. Medium is the default because it is the
    // one that holds a frame budget: the occlusion pass on High costs a second
    // full render of the scene. High is still one click away, and still steps
    // itself down if the machine cannot hold it.
    quality:'medium'
  };
  let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  // ============================================================
  // CAMERA — every tuning number the chase/orbit camera has
  // ============================================================
  // It lives HERE rather than beside syncCamera because the PerspectiveCamera
  // is constructed further up the file than the camera fragment lands, and a
  // field of view written in two places is a field of view that will one day
  // disagree with itself. One object, read by the construction and by every
  // frame after it.
  //
  // Units are the simulation's, where the bean's RADIUS is 17 and the lane is
  // 520 across. Angles are radians; each comment gives the degrees, because a
  // reviewer checks degrees and the code needs radians.
  const CAM = {
    // ---- framing -------------------------------------------------------
    // Boom length and the angle it sits above horizontal. v24 ran 205 back by
    // 155 up: a boom of 257 at 37 degrees, high enough that the course read as
    // a map of itself rather than as ground you are standing on. The boom keeps
    // its length; it is the ANGLE that comes down.
    DIST: 258,
    // 28.1 deg. CHOSEN BY LOOKING, against a sweep at 18/24/28/32/37 on the same
    // frame of the same course (docs/camera-review/camera-pitch-*.png).
    //
    // The brief that asked for this work suggested 10-25 deg. That is the right
    // band for a character a couple of units tall; it is the wrong band here,
    // and the sweep is why. At 18 deg the horizon sits across the middle of the
    // screen, the ground ahead collapses to a flat wash and you cannot tell a
    // hammer disc from the floor it is lying on -- unreadable, not cinematic. At
    // 37 (v24's angle) the course reads well but the frame is a map of itself.
    // 28 keeps the discs reading as discs, keeps the pack and the ribbon ahead
    // on screen, and still shows the sides of pillars rather than their lids.
    PITCH: 0.49,          // 28.1 deg above horizontal — the resting tilt
    // What the boom orbits: a point above the racer's feet, not the racer's own
    // transform. Attaching to the transform hands every squash, stumble and
    // landing bounce straight to the lens.
    TARGET_H: 26,
    // What the camera AIMS at, measured up from the orbit point. Aiming above
    // the thing you orbit is what puts the bean in the lower-middle of the frame
    // instead of dead centre, and it costs nothing but this number.
    AIM_RISE: 24,
    // ...and a little up the course, so the frame shows what is coming rather
    // than what has been survived.
    LEAD: 52,

    // ---- the lens ------------------------------------------------------
    FOV: 72,              // vertical; read by the PerspectiveCamera construction

    // ---- orbit limits --------------------------------------------------
    // YAW IS NOT CLAMPED AND MUST NOT BE. The camera goes all the way round:
    // look.yaw may wind past a full turn either way and is only ever reduced
    // modulo 2pi for display, never for control.
    PITCH_MIN: 0.10,      // 5.7 deg: flat enough to sight down a long straight
    PITCH_MAX: 0.92,      // 52.7 deg: steep enough to read a drop, short of top-down

    // ---- sensitivity ---------------------------------------------------
    MOUSE_YAW: 0.0030, MOUSE_PITCH: 0.0026,
    DRAG_GAIN: 3.4,       // one short finger/mouse drag should turn the view
    LOCK_GAIN: 3.0,       // pointer-locked mouse movement
    WHEEL_GAIN: 1.0,      // a trackpad two-finger swipe sends both axes
    PAD_YAW: 2.9, PAD_PITCH: 2.0,   // right stick, radians per second at full tilt
    PAD_DEAD: 0.18,       // stick centres are noisy; below this it is not input

    // ---- smoothing -----------------------------------------------------
    // Horizontal and vertical are separate on purpose. Horizontal can afford
    // weight; vertical cannot chase a jump one-for-one without the whole frame
    // pumping, and cannot lag so far that the landing leaves the screen.
    FOLLOW_XZ: 14,
    FOLLOW_Y: 9,          // grounded
    FOLLOW_Y_AIR: 5.0,    // airborne: softer, so a jump rises THROUGH the frame
    AIR_BLEND_H: 90,      // height by which the vertical follow has fully relaxed

    // ---- auto-recentre (off by default — see settings.autoCentre) -------
    RECENTRE_DELAY: 3.2,
    RECENTRE_RATE: 0.55,

    // ---- obstruction ---------------------------------------------------
    BLOCK_PAD: 16,        // stop this far short of whatever the boom hits
    BLOCK_MIN: 58,        // never closer, or the lens is inside the bean
    BLOCK_IN: 60,         // closing is near-immediate: the wall is in the way NOW
    BLOCK_OUT: 5,         // opening is slow, or clearing a pillar pops the frame

    // ---- crowd ---------------------------------------------------------
    CROWD_NEAR: 230,      // sim units counted as "on top of you"
    CROWD_MAX: 0.12,      // at most 12% further out when the pack is thick

    // ---- spectator hand-overs ------------------------------------------
    // Switching target moves the pivot the length of the course in one frame.
    // At the normal follow weight that reads as a whip-pan; for this long the
    // follow is slackened right off so it reads as a glide instead.
    SWITCH_BLEND: 0.75,   // seconds
    SWITCH_FOLLOW: 3.2,   // the follow weight used during it
  };

  const custom = { name:'YOU', skin:'pink', pattern:'none', hat:'crown', eyes:'round' };
  const HATS = [['none','None'],['crown','Crown'],['party','Party'],['halo','Halo'],['horns','Horns'],['prop','Propeller']];
  const EYES = [['round','Round'],['happy','Happy'],['angry','Angry'],['sleepy','Sleepy']];

  const BOT_COLORS = ['#ff8a5c','#7ee8fa','#c084fc','#ffd166','#06d6a0','#f472b6','#a3e635','#60a5fa','#fca5a5','#fbbf24','#34d399','#ff5a4d','#e879f9','#fde68a','#5eead4','#f97316','#4ade80','#818cf8'];
  // Twenty-four on the pad wants twenty-three of these, all different.
  const BOT_NAMES = ['Waddle','Boingo','Muncher','Squiggle','Tofu','Biscuit','Nugget','Zippy',
                     'Doodle','Blorp','Pudge','Wobble','Gizmo','Splat','Noodle','Pickle',
                     'Mochi','Bingo','Custard','Peanut','Waffle','Dumpling','Sprout'];
  const BOT_HATS = ['none','none','none','party','halo','horns','prop'];
  // The pack wears the wardrobe too: a colourway from the cheaper tiers and a
  // pattern about half the time, so sixteen beans do not read as one flat blob.
  const BOT_SKIN_POOL = ['pink','teal','blue','gold0','red','lime','violet','orange','cream','rose','jade',
                         'sunset','ocean','forest','lavafade','cotton','plum','frost'];
  const BOT_PATTERN_POOL = ['none','none','none','spots','stripes','checker','zigzag','camo','stars','hearts','bubbles'];
  function botLook(){
    const sk = skinOf(pick(BOT_SKIN_POOL));
    return { skinId: sk.id, patternId: pick(BOT_PATTERN_POOL), color: skinBaseColor(sk) };
  }

  // ============================================================
  // RARITIES + SKINS (colourways bought with coins)
  // ============================================================
  const RARITY = {
    common:    { name:'Common',     label:'#9ca3af', text:'#1a1033' },
    rare:      { name:'Rare',       label:'#22c55e', text:'#0b2e18' },
    superrare: { name:'Super Rare', label:'#3b82f6', text:'#f8fbff' },
    epic:      { name:'Epic',       label:'#a855f7', text:'#fdf6ff' },
    legendary: { name:'Legendary',  label:'#eab308', text:'#241a00' },
    special:   { name:'Special',    label:'#ffcb3d', text:'#2a1c00' }
  };
  const RARITY_ORDER = ['common','rare','superrare','epic','legendary','special'];

  // type: solid | gradient | neon | metal | oil | rainbow | rainbowneon | galaxy
  // unlock: {kind:'default'} | {kind:'coins',cost} | {kind:'badge',badge} | {kind:'wins',count}
  const SKINS = [
    // ---- COMMON: flat colours, the starting wardrobe ----
    {id:'pink',   name:'Bubblegum',   rarity:'common', type:'solid', color:'#ff4fa3', unlock:{kind:'default'}},
    {id:'teal',   name:'Mint Chip',   rarity:'common', type:'solid', color:'#23e6c9', unlock:{kind:'default'}},
    {id:'blue',   name:'Blueberry',   rarity:'common', type:'solid', color:'#60a5fa', unlock:{kind:'default'}},
    {id:'gold0',  name:'Custard',     rarity:'common', type:'solid', color:'#ffcb3d', unlock:{kind:'default'}},
    {id:'red',    name:'Tomato',      rarity:'common', type:'solid', color:'#ff5a4d', unlock:{kind:'default'}},
    {id:'lime',   name:'Sour Apple',  rarity:'common', type:'solid', color:'#a3e635', unlock:{kind:'default'}},
    {id:'violet', name:'Grape',       rarity:'common', type:'solid', color:'#8b5cf6', unlock:{kind:'coins',cost:60}},
    {id:'orange', name:'Apricot',     rarity:'common', type:'solid', color:'#ff8a5c', unlock:{kind:'coins',cost:60}},
    {id:'cream',  name:'Vanilla',     rarity:'common', type:'solid', color:'#fff8ec', unlock:{kind:'coins',cost:60}},
    {id:'ink',    name:'Midnight',    rarity:'common', type:'solid', color:'#2a1f4d', unlock:{kind:'coins',cost:80}},
    {id:'rose',   name:'Rosewater',   rarity:'common', type:'solid', color:'#f472b6', unlock:{kind:'coins',cost:80}},
    {id:'jade',   name:'Jade',        rarity:'common', type:'solid', color:'#34d399', unlock:{kind:'badge',badge:'ten_races'}},

    // ---- RARE: two-tone fades ----
    {id:'sunset',  name:'Sunset Fade',  rarity:'rare', type:'gradient', colors:['#ffcb3d','#ff4fa3'], unlock:{kind:'coins',cost:220}},
    {id:'ocean',   name:'Deep Dive',    rarity:'rare', type:'gradient', colors:['#7ee8fa','#1d4ed8'], unlock:{kind:'coins',cost:220}},
    {id:'forest',  name:'Canopy',       rarity:'rare', type:'gradient', colors:['#bef264','#166534'], unlock:{kind:'coins',cost:240}},
    {id:'lavafade',name:'Magma',        rarity:'rare', type:'gradient', colors:['#fde68a','#b91c1c'], unlock:{kind:'coins',cost:240}},
    {id:'cotton',  name:'Cotton Candy', rarity:'rare', type:'gradient', colors:['#f9a8d4','#7dd3fc'], unlock:{kind:'coins',cost:260}},
    {id:'plum',    name:'Plum Dusk',    rarity:'rare', type:'gradient', colors:['#f0abfc','#4c1d95'], unlock:{kind:'badge',badge:'first_win'}},
    {id:'frost',   name:'Frostbite',    rarity:'rare', type:'gradient', colors:['#ffffff','#38bdf8'], unlock:{kind:'badge',badge:'noFalls'}},

    // ---- SUPER RARE: glowing neon, one per colour ----
    {id:'neon_pink',  name:'Neon Pink',   rarity:'superrare', type:'neon', color:'#ff2d95', unlock:{kind:'coins',cost:450}},
    {id:'neon_teal',  name:'Neon Teal',   rarity:'superrare', type:'neon', color:'#00ffd5', unlock:{kind:'coins',cost:450}},
    {id:'neon_lime',  name:'Neon Lime',   rarity:'superrare', type:'neon', color:'#aaff00', unlock:{kind:'coins',cost:450}},
    {id:'neon_blue',  name:'Neon Blue',   rarity:'superrare', type:'neon', color:'#2b6bff', unlock:{kind:'coins',cost:450}},
    {id:'neon_orange',name:'Neon Ember',  rarity:'superrare', type:'neon', color:'#ff7300', unlock:{kind:'coins',cost:480}},
    {id:'neon_violet',name:'Neon Violet', rarity:'superrare', type:'neon', color:'#b026ff', unlock:{kind:'coins',cost:480}},
    {id:'neon_red',   name:'Neon Siren',  rarity:'superrare', type:'neon', color:'#ff1744', unlock:{kind:'badge',badge:'five_wins'}},
    {id:'neon_white', name:'Neon Ghost',  rarity:'superrare', type:'neon', color:'#eaf6ff', unlock:{kind:'badge',badge:'lava'}},

    // ---- EPIC: metals + exotic surfaces ----
    {id:'chrome',    name:'Chrome',       rarity:'epic', type:'metal',  color:'#dfe7ef', shine:180, unlock:{kind:'coins',cost:800}},
    {id:'copper',    name:'Hot Copper',   rarity:'epic', type:'metal',  color:'#e07a3f', shine:150, unlock:{kind:'coins',cost:800}},
    {id:'emerald',   name:'Emerald Cut',  rarity:'epic', type:'metal',  color:'#10b981', shine:160, unlock:{kind:'coins',cost:850}},
    {id:'amethyst',  name:'Amethyst',     rarity:'epic', type:'metal',  color:'#9333ea', shine:160, unlock:{kind:'coins',cost:850}},
    {id:'oil',       name:'Oil Slick',    rarity:'epic', type:'oil',    unlock:{kind:'coins',cost:900}},
    {id:'toxic',     name:'Toxic Ooze',   rarity:'epic', type:'neon',   color:'#7cff2a', unlock:{kind:'badge',badge:'fifty_races'}},
    {id:'voidskin',  name:'Void',         rarity:'epic', type:'galaxy', colors:['#05010f','#3b0764','#1e1b4b'], unlock:{kind:'badge',badge:'diver'}},

    // ---- LEGENDARY: the showpieces ----
    {id:'galaxy',    name:'Galaxy',       rarity:'legendary', type:'galaxy',  colors:['#0b0224','#6d28d9','#db2777'], unlock:{kind:'coins',cost:1400}},
    {id:'nebula',    name:'Nebula Drift', rarity:'legendary', type:'galaxy',  colors:['#04121f','#0891b2','#22d3ee'], unlock:{kind:'coins',cost:1400}},
    {id:'rainbow',   name:'Rainbow',      rarity:'legendary', type:'rainbow', unlock:{kind:'coins',cost:1600}},
    {id:'aurora',    name:'Aurora',       rarity:'legendary', type:'rainbow', slow:true, unlock:{kind:'coins',cost:1600}},
    {id:'prism',     name:'Prism Glow',   rarity:'legendary', type:'rainbowneon', unlock:{kind:'badge',badge:'level10'}},

    // ---- SPECIAL: 1999 coins each, except Gold (100 wins) ----
    {id:'gold',      name:'Champion Gold', rarity:'special', type:'metal', color:'#ffc93d', shine:220,
      unlock:{kind:'wins',count:100}, blurb:'Win 100 matches. Cannot be bought.'},
    {id:'solarflare',name:'Solar Flare',   rarity:'special', type:'rainbowneon', unlock:{kind:'coins',cost:1999}},
    {id:'blackhole', name:'Event Horizon', rarity:'special', type:'galaxy', colors:['#000000','#1c1917','#f59e0b'], unlock:{kind:'coins',cost:1999}},
    {id:'diamond',   name:'Diamond Dust',  rarity:'special', type:'metal', color:'#bfefff', shine:250, unlock:{kind:'coins',cost:1999}}
,

    // ---- second wave ----
    {id:'mint',     name:'Spearmint',    rarity:'common', type:'solid', color:'#7ef2c8', unlock:{kind:'coins',cost:60}},
    {id:'peach',    name:'Peach Fuzz',   rarity:'common', type:'solid', color:'#ffb59e', unlock:{kind:'coins',cost:60}},
    {id:'sky',      name:'Clear Sky',    rarity:'common', type:'solid', color:'#9cd8ff', unlock:{kind:'coins',cost:80}},
    {id:'sand',     name:'Sandcastle',   rarity:'common', type:'solid', color:'#e8d3a3', unlock:{kind:'coins',cost:80}},
    {id:'charcoal', name:'Charcoal',     rarity:'common', type:'solid', color:'#4b4b58', unlock:{kind:'coins',cost:100}},

    {id:'seafoam',  name:'Seafoam',      rarity:'rare', type:'gradient', colors:['#d9fff2','#0f766e'], unlock:{kind:'coins',cost:230}},
    {id:'ember',    name:'Ember',        rarity:'rare', type:'gradient', colors:['#ffd08a','#7c2d12'], unlock:{kind:'coins',cost:230}},
    {id:'orchid',   name:'Orchid',       rarity:'rare', type:'gradient', colors:['#fbcfe8','#6d28d9'], unlock:{kind:'coins',cost:250}},
    {id:'moss',     name:'Mossbank',     rarity:'rare', type:'gradient', colors:['#d9f99d','#3f6212'], unlock:{kind:'coins',cost:250}},
    {id:'duskfade', name:'Dusk',         rarity:'rare', type:'gradient', colors:['#fca5a5','#1e3a8a'], unlock:{kind:'badge',badge:'ten_races'}},

    {id:'neon_yellow',name:'Neon Zest',  rarity:'superrare', type:'neon', color:'#ffe600', unlock:{kind:'coins',cost:460}},
    {id:'neon_mint', name:'Neon Mint',   rarity:'superrare', type:'neon', color:'#4dffb8', unlock:{kind:'coins',cost:460}},
    {id:'neon_rose', name:'Neon Rose',   rarity:'superrare', type:'neon', color:'#ff5ec4', unlock:{kind:'coins',cost:470}},
    {id:'neon_ice',  name:'Neon Ice',    rarity:'superrare', type:'neon', color:'#7bdfff', unlock:{kind:'badge',badge:'minigames'}},

    {id:'obsidian', name:'Obsidian',     rarity:'epic', type:'metal', color:'#2a2a35', shine:200, unlock:{kind:'coins',cost:820}},
    {id:'rosegold', name:'Rose Gold',    rarity:'epic', type:'metal', color:'#f0a89a', shine:190, unlock:{kind:'coins',cost:860}},
    {id:'titanium', name:'Titanium',     rarity:'epic', type:'metal', color:'#9fb3c8', shine:210, unlock:{kind:'coins',cost:860}},
    {id:'peacock',  name:'Peacock',      rarity:'epic', type:'oil',   unlock:{kind:'badge',badge:'podium'}},

    {id:'glacier',  name:'Glacier',      rarity:'legendary', type:'galaxy',  colors:['#04283d','#0ea5e9','#e0f2fe'], unlock:{kind:'coins',cost:1450}},
    {id:'supernova',name:'Supernova',    rarity:'legendary', type:'galaxy',  colors:['#1a0330','#f43f5e','#fde047'], unlock:{kind:'coins',cost:1500}},
    {id:'spectrum', name:'Spectrum',     rarity:'legendary', type:'rainbow', unlock:{kind:'badge',badge:'twenty_wins'}},

    {id:'prismvoid',name:'Prismatic Void', rarity:'special', type:'rainbowneon', unlock:{kind:'coins',cost:1999}},

    // ---- v25: fourteen more colourways --------------------------------
    // All of them are the EXISTING procedural material system -- solid,
    // gradient, neon, metal, galaxy -- with new parameters. Nothing here needs
    // a new shader, a texture or an asset, which is why they cost nothing to
    // ship and why their shop previews render through the same tile pass as
    // everything else.
    //
    // Prices sit in the bands the catalogue already uses: common 60-100,
    // rare 220-260, superrare 450-480, epic 800-900, legendary 1400-1600.
    // Two are badge-gated rather than sold, which exercises the badge ->
    // cosmetic path with the badges added in this same release.

    // common
    {id:'pearl',        name:'Pearl',          rarity:'common', type:'gradient', colors:['#ffffff','#f3e8ff'], unlock:{kind:'coins',cost:100}},
    {id:'candyfloss',   name:'Candy Floss',    rarity:'common', type:'gradient', colors:['#fda4af','#f0abfc'], unlock:{kind:'coins',cost:100}},

    // rare
    {id:'molten',       name:'Molten Core',    rarity:'rare', type:'gradient', colors:['#ffcb3d','#b91c1c'], unlock:{kind:'coins',cost:240}},
    {id:'deepocean',    name:'Deep Ocean',     rarity:'rare', type:'gradient', colors:['#67e8f9','#0c2a4d'], unlock:{kind:'coins',cost:250}},
    {id:'icymint',      name:'Icy Mint',       rarity:'rare', type:'gradient', colors:['#ecfeff','#5eead4'], unlock:{kind:'coins',cost:230}},
    {id:'stormfront',   name:'Storm Front',    rarity:'rare', type:'gradient', colors:['#1e3a8a','#93c5fd'], unlock:{kind:'coins',cost:260}},

    // superrare
    {id:'neon_tide',    name:'Neon Tide',      rarity:'superrare', type:'neon', color:'#22d3ee', unlock:{kind:'coins',cost:460}},
    {id:'neon_bloom',   name:'Neon Bloom',     rarity:'superrare', type:'neon', color:'#ff2fd0', unlock:{kind:'coins',cost:470}},
    {id:'electriclime', name:'Electric Lime',  rarity:'superrare', type:'neon', color:'#a3ff12', unlock:{kind:'coins',cost:450}},
    {id:'brushedgold',  name:'Brushed Gold',   rarity:'superrare', type:'metal', color:'#e8c86a', shine:160, unlock:{kind:'coins',cost:480}},

    // epic
    {id:'polarveil',    name:'Polar Veil',     rarity:'epic', type:'galaxy', colors:['#04121f','#22d3ee','#a78bfa'], unlock:{kind:'coins',cost:850}},
    {id:'violetdrift',  name:'Violet Drift',   rarity:'epic', type:'galaxy', colors:['#1e1b4b','#6d28d9','#c026d3'], unlock:{kind:'badge',badge:'races25'}},
    {id:'emberglow',    name:'Ember Glow',     rarity:'epic', type:'neon', color:'#ff6a00', unlock:{kind:'coins',cost:820}},

    // legendary
    {id:'blackgold',    name:'Black Gold',     rarity:'legendary', type:'gradient', colors:['#0b0b0f','#f0c419'], unlock:{kind:'badge',badge:'wins10'}}
  ];
  const SKIN_BY_ID = Object.fromEntries(SKINS.map(s=>[s.id,s]));
  function skinOf(id){ return SKIN_BY_ID[id] || SKIN_BY_ID['pink']; }

  // CSS background used for shop tiles, HUD dots, roster rows and result rows.
  function skinSwatch(s){
    if(!s) return '#ff4fa3';
    if(s.type==='rainbow'||s.type==='rainbowneon') return 'linear-gradient(90deg,#ff004d,#ffcb3d,#3cff8a,#26d5ff,#b026ff,#ff004d)';
    if(s.type==='galaxy') return 'linear-gradient(135deg,'+s.colors[0]+','+s.colors[1]+','+(s.colors[2]||s.colors[1])+')';
    if(s.type==='gradient') return 'linear-gradient(160deg,'+s.colors[0]+','+s.colors[1]+')';
    if(s.type==='oil') return 'linear-gradient(135deg,#1b1035,#2563eb,#059669,#a21caf)';
    return s.color||'#ff4fa3';
  }
  // Single representative colour (3D particles, progress-bar dots, bot fallbacks).
  function skinBaseColor(s){
    if(!s) return '#ff4fa3';
    if(s.color) return s.color;
    if(s.colors) return s.colors[s.colors.length-1];
    if(s.type==='oil') return '#2563eb';
    return '#ff4fa3';
  }

  // ============================================================
  // PATTERNS (a second cosmetic layer, painted over the skin)
  // ============================================================
  // Each draw(g,w,h) paints onto a 256x256 canvas; the result multiplies over
  // the skin, so ink darkens and white lifts.
  const PATTERNS = [
    {id:'none', name:'Plain', rarity:'common', unlock:{kind:'default'}, draw:()=>{}},

    {id:'spots', name:'Spots', rarity:'common', unlock:{kind:'coins',cost:120}, alpha:0.45,
      draw:(g,w,h)=>{ for(let i=0;i<26;i++){ const x=(i*97)%w, y=(i*151)%h, r=8+((i*37)%14);
        g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill(); } }},

    {id:'stripes', name:'Stripes', rarity:'common', unlock:{kind:'coins',cost:120}, alpha:0.42,
      draw:(g,w,h)=>{ for(let x=0;x<w;x+=32) g.fillRect(x,0,16,h); }},

    {id:'checker', name:'Checkers', rarity:'rare', unlock:{kind:'coins',cost:260}, alpha:0.45,
      draw:(g,w,h)=>{ const s=32; for(let y=0;y<h;y+=s) for(let x=0;x<w;x+=s)
        if(((x/s)+(y/s))%2===0) g.fillRect(x,y,s,s); }},

    {id:'zigzag', name:'Zigzag', rarity:'rare', unlock:{kind:'coins',cost:260}, alpha:0.48,
      draw:(g,w,h)=>{ g.lineWidth=7; for(let y=-16;y<h+32;y+=34){ g.beginPath();
        for(let x=0;x<=w;x+=16) g.lineTo(x, y+((x/16)%2?14:0)); g.stroke(); } }},

    {id:'camo', name:'Camo', rarity:'rare', unlock:{kind:'coins',cost:300}, alpha:0.40,
      draw:(g,w,h)=>{ for(let i=0;i<20;i++){ const x=(i*83)%w, y=(i*127)%h;
        g.beginPath(); g.ellipse(x,y,18+((i*29)%22),12+((i*17)%16),(i*0.7),0,Math.PI*2); g.fill(); } }},

    {id:'stars', name:'Starfield', rarity:'superrare', unlock:{kind:'coins',cost:480}, alpha:0.75, ink:'rgba(255,255,255,1)',
      draw:(g,w,h)=>{ const star=(cx,cy,r)=>{ g.beginPath();
        for(let i=0;i<10;i++){ const a=i*Math.PI/5-Math.PI/2, rr=i%2?r*0.45:r;
          g.lineTo(cx+Math.cos(a)*rr, cy+Math.sin(a)*rr); } g.closePath(); g.fill(); };
        for(let i=0;i<22;i++) star((i*101)%w,(i*61)%h, 6+((i*13)%9)); }},

    {id:'hearts', name:'Hearts', rarity:'superrare', unlock:{kind:'coins',cost:480}, alpha:0.55,
      draw:(g,w,h)=>{ const heart=(cx,cy,s)=>{ g.beginPath(); g.moveTo(cx,cy+s*0.7);
        g.bezierCurveTo(cx-s*1.3,cy-s*0.4,cx-s*0.4,cy-s*1.2,cx,cy-s*0.4);
        g.bezierCurveTo(cx+s*0.4,cy-s*1.2,cx+s*1.3,cy-s*0.4,cx,cy+s*0.7); g.fill(); };
        for(let i=0;i<18;i++) heart((i*113)%w,(i*71)%h, 8+((i*11)%6)); }},

    {id:'bubbles', name:'Bubbles', rarity:'superrare', unlock:{kind:'coins',cost:500}, alpha:0.5, ink:'rgba(255,255,255,1)',
      draw:(g,w,h)=>{ g.lineWidth=4; for(let i=0;i<24;i++){ const x=(i*89)%w, y=(i*137)%h, r=7+((i*23)%16);
        g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.stroke(); } }},

    {id:'circuit', name:'Circuit', rarity:'epic', unlock:{kind:'coins',cost:850}, alpha:0.55, ink:'rgba(255,255,255,1)',
      draw:(g,w,h)=>{ g.lineWidth=3;
        for(let i=0;i<26;i++){ const x=(i*67)%w, y=(i*103)%h, len=24+((i*31)%48);
          g.beginPath(); if(i%2){ g.moveTo(x,y); g.lineTo(x+len,y); g.lineTo(x+len,y+18); }
          else { g.moveTo(x,y); g.lineTo(x,y+len); g.lineTo(x+18,y+len); } g.stroke();
          g.beginPath(); g.arc(x,y,4,0,Math.PI*2); g.fill(); } }},

    {id:'scales', name:'Dragon Scales', rarity:'epic', unlock:{kind:'coins',cost:900}, alpha:0.42,
      draw:(g,w,h)=>{ const s=26; g.lineWidth=3;
        for(let y=0,row=0;y<h+s;y+=s*0.62,row++) for(let x=(row%2?s/2:0);x<w+s;x+=s){
          g.beginPath(); g.arc(x,y,s*0.5,Math.PI,0); g.stroke(); } }},

    {id:'flames', name:'Flames', rarity:'legendary', unlock:{kind:'coins',cost:1500}, alpha:0.55,
      draw:(g,w,h)=>{ for(let i=0;i<14;i++){ const x=(i*79)%w, base=h;
        g.beginPath(); g.moveTo(x-16,base);
        g.quadraticCurveTo(x-10, base-60-((i*17)%50), x, base-90-((i*23)%60));
        g.quadraticCurveTo(x+10, base-60-((i*13)%50), x+16, base); g.closePath(); g.fill(); } }},

    {id:'lightning', name:'Lightning', rarity:'legendary', unlock:{kind:'coins',cost:1600}, alpha:0.7, ink:'rgba(255,255,255,1)',
      draw:(g,w,h)=>{ g.lineWidth=6; g.lineJoin='round';
        for(let i=0;i<9;i++){ let x=(i*97)%w, y=0; g.beginPath(); g.moveTo(x,y);
          while(y<h){ y+=26+((i*7)%14); x+=((y/13|0)%2?22:-22); g.lineTo(x,y); } g.stroke(); } }},

    {id:'glitch', name:'Glitch', rarity:'special', unlock:{kind:'coins',cost:1999}, alpha:0.6,
      draw:(g,w,h)=>{ for(let i=0;i<40;i++){ const y=(i*53)%h, hh=3+((i*11)%9), x=(i*137)%w;
        g.fillStyle = i%3===0 ? 'rgba(255,0,90,1)' : i%3===1 ? 'rgba(0,240,255,1)' : 'rgba(0,0,0,1)';
        g.fillRect(x,y,40+((i*29)%90),hh); g.fillRect(0,y,(i*19)%60,hh); } }}
  ];
  const PATTERN_BY_ID = Object.fromEntries(PATTERNS.map(p=>[p.id,p]));
  function patternOf(id){ return PATTERN_BY_ID[id] || PATTERN_BY_ID['none']; }
  // Only ids the catalogue knows. A save outlives the catalogue it was written
  // against, so it can carry a pattern a later release retired or renamed; the
  // id stays in the save, but it is not a pattern on any count -- "Patterns
  // owned N / total" and the Wardrobe badge both read this.
  function ownedPatterns(){
    const set = new Set((stats.patterns||[]).filter(id=>PATTERN_BY_ID[id]));
    for(const p of PATTERNS){
      if(p.unlock.kind==='default') set.add(p.id);
      if(p.unlock.kind==='badge' && (stats.badges||[]).includes(p.unlock.badge)) set.add(p.id);
    }
    return set;
  }
  // A small CSS preview of the pattern, for shop tiles.
  function patternPreviewCSS(p){
    if(p.id==='none') return 'none';
    const c=document.createElement('canvas'); c.width=c.height=64;
    const g=c.getContext('2d');
    g.save(); g.scale(0.25,0.25);
    g.globalAlpha=p.alpha!==undefined?p.alpha:0.5;
    g.fillStyle=p.ink||'rgba(0,0,0,1)'; g.strokeStyle=p.ink||'rgba(0,0,0,1)';
    p.draw(g,256,256); g.restore();
    return 'url('+c.toDataURL()+')';
  }

  // ============================================================
  // LOCAL PROFILE (saved in this browser)
  // ============================================================
  let stats = { races:0, wins:0, xp:0, level:1, badges:[], lavaSurvived:0, noFallFinishes:0, mpRaces:0, dives:0,
                coins:0, owned:[], patterns:[], podiums:0, finals:0, minigamesWon:0, claimed:[], lastSpin:0,
                winStreak:0, bestStreak:0, cleanWins:0 };
  function xpForLevel(l){ return 100+(l-1)*40; }

  // Only ids the catalogue knows, for the reason ownedPatterns gives: a
  // retired colourway in the save must not reach "Colourways owned N / total"
  // or the Collector badge. The save itself is left as it is.
  function ownedSkins(){
    const set = new Set((stats.owned||[]).filter(id=>SKIN_BY_ID[id]));
    for(const s of SKINS){
      if(s.unlock.kind==='default') set.add(s.id);
      if(s.unlock.kind==='badge' && (stats.badges||[]).includes(s.unlock.badge)) set.add(s.id);
      if(s.unlock.kind==='wins' && stats.wins>=s.unlock.count) set.add(s.id);
    }
    return set;
  }
  function unlockText(s){
    if(s.unlock.kind==='default') return 'Starter';
    if(s.unlock.kind==='coins') return s.unlock.cost+' coins';
    if(s.unlock.kind==='wins') return Math.min(stats.wins,s.unlock.count)+'/'+s.unlock.count+' wins';
    if(s.unlock.kind==='badge'){ const b=ACHIEVEMENTS.find(a=>a.id===s.unlock.badge); return 'Badge: '+(b?b.name:s.unlock.badge); }
    return '';
  }

  let coinPops=[];
  async function addCoins(n, why){
    if(n<=0) return;
    stats.coins=(stats.coins||0)+n;
    coinPops.push({n, why:why||'', t:0});
    while(coinPops.length>3) coinPops.shift();   // a round can pay out five things at once
    await saveProfile();
    refreshCoinChips();
  }

  async function awardXp(amount){
    stats.xp+=amount;
    let leveled=false;
    while(stats.xp>=xpForLevel(stats.level)){ stats.xp-=xpForLevel(stats.level); stats.level++; leveled=true; }
    if(leveled){ showBanner('LEVEL UP! Lv.'+stats.level, 1800); SFX.win(); await addCoins(50,'Level '+stats.level); }
    checkAchievements();
    await saveProfile();
  }

  // Each badge pays out coins the first time you claim it in the Badges tab.
  const ACHIEVEMENTS = [
    {id:'first_win',    name:'First Blood',     desc:'Win a match',                     icon:'\u{1F3C6}', coins:150, check:s=>s.wins>=1},
    {id:'five_wins',    name:'Champion',        desc:'Win 5 matches',                   icon:'\u{1F451}', coins:300, check:s=>s.wins>=5},
    {id:'twenty_wins',  name:'Dominator',       desc:'Win 20 matches',                  icon:'\u{1F4A5}', coins:600, check:s=>s.wins>=20},
    {id:'ten_races',    name:'Getting Started', desc:'Play 10 matches',                 icon:'\u{1F3AE}', coins:100, check:s=>s.races>=10},
    {id:'fifty_races',  name:'Veteran',         desc:'Play 50 matches',                 icon:'\u{1F396}', coins:400, check:s=>s.races>=50},
    {id:'hundred_races',name:'Die Hard',        desc:'Play 100 matches',                icon:'\u{1F579}', coins:800, check:s=>s.races>=100},
    {id:'level5',       name:'Rising Star',     desc:'Reach level 5',                   icon:'\u{2B50}',  coins:200, check:s=>s.level>=5},
    {id:'level10',      name:'All Star',        desc:'Reach level 10',                  icon:'\u{1F31F}', coins:500, check:s=>s.level>=10},
    {id:'lava',         name:'Hot Feet',        desc:'Survive a Magma Chase round',       icon:'\u{1F30B}', coins:250, check:s=>s.lavaSurvived>=1},
    {id:'minigames',    name:'Party Trick',     desc:'Survive 5 minigame rounds',       icon:'\u{1F3B2}', coins:350, check:s=>s.minigamesWon>=5},
    {id:'noFalls',      name:'Sure-Footed',     desc:'Finish a round without falling',  icon:'\u{1F9B6}', coins:200, check:s=>s.noFallFinishes>=1},
    {id:'finalist',     name:'Finalist',        desc:'Reach the final round 10 times',  icon:'\u{1F3AF}', coins:300, check:s=>s.finals>=10},
    {id:'podium',       name:'Podium Regular',  desc:'Finish top 3 in 15 matches',      icon:'\u{1F949}', coins:350, check:s=>s.podiums>=15},
    {id:'friend',       name:'Squad Up',        desc:'Race with a friend online',       icon:'\u{1F91D}', coins:250, check:s=>s.mpRaces>=1},
    {id:'diver',        name:'Belly Flopper',   desc:'Dive 100 times',                  icon:'\u{1F93F}', coins:300, check:s=>s.dives>=100},

    // ---- the long haul: these are meant to take a while ----
    {id:'fifty_wins',   name:'Hall of Famer',   desc:'Win 50 matches',                   icon:'\u{1F3C5}', coins:900,  check:s=>s.wins>=50},
    {id:'hundred_wins', name:'Legend',          desc:'Win 100 matches',                  icon:'\u{1F94A}', coins:1500, check:s=>s.wins>=100},
    {id:'marathon',     name:'Marathon',        desc:'Play 250 matches',                 icon:'\u{1F4C5}', coins:1500, check:s=>s.races>=250},
    {id:'streak3',      name:'On a Roll',       desc:'Win 3 matches in a row',           icon:'\u{1F525}', coins:400,  check:s=>s.bestStreak>=3},
    {id:'streak5',      name:'Unstoppable',     desc:'Win 5 matches in a row',           icon:'\u{26A1}',  coins:900,  check:s=>s.bestStreak>=5},
    {id:'flawless',     name:'Flawless',        desc:'Win without falling once',         icon:'\u{1F48E}', coins:500,  check:s=>s.cleanWins>=1},
    {id:'flawless5',    name:'Untouchable',     desc:'Win 5 matches without falling',    icon:'\u{1F6E1}', coins:1200, check:s=>s.cleanWins>=5},
    {id:'level25',      name:'Prestige',        desc:'Reach level 25',                   icon:'\u{1F31E}', coins:1200, check:s=>s.level>=25},
    {id:'survivor25',   name:'Last One Standing',desc:'Survive 25 minigame rounds',      icon:'\u{1F3AF}', coins:700,  check:s=>s.minigamesWon>=25},
    {id:'podium50',     name:'Ever Present',    desc:'Finish top 3 in 50 matches',       icon:'\u{1F396}', coins:900,  check:s=>s.podiums>=50},
    {id:'dives500',     name:'Faceplant',       desc:'Dive 500 times',                   icon:'\u{1F92F}', coins:600,  check:s=>s.dives>=500},
    {id:'collector30',  name:'Collector',       desc:'Own 30 colourways',                icon:'\u{1F5C3}', coins:700,  check:()=>ownedSkins().size>=30},
    {id:'wardrobe',     name:'Wardrobe',        desc:'Own 8 patterns',                   icon:'\u{1F9F5}', coins:500,  check:()=>ownedPatterns().size>=8},

    // ---- v25: eighteen more, and an XP payout alongside the coins ---------
    // EVERY ONE OF THESE READS A COUNTER THE GAME ALREADY KEEPS. The brief
    // asked for badges on jumps and on recoveries too; there is no jumps
    // counter and no recoveries counter anywhere in the fragments, and adding
    // one means editing 15_actions.js, which this release freezes. A badge
    // whose condition cannot be measured is a badge that never unlocks, so
    // those two are deliberately absent rather than quietly broken.
    //
    // The tracked set, confirmed by reading every `stats.<x>++` in the
    // fragments: races, wins, finals, podiums, minigamesWon, lavaSurvived,
    // noFallFinishes, cleanWins, mpRaces, dives, level, xp, coins, bestStreak,
    // and the two owned-collection sizes.

    // beginner: the first time you do each thing
    {id:'first_race',    name:'Off the Blocks',  desc:'Play your first match',            icon:'\u{1F6A9}', coins:50,   xp:20,  check:s=>s.races>=1},
    {id:'first_final',   name:'Made the Cut',    desc:'Reach a final round',              icon:'\u{1F3C1}', coins:120,  xp:40,  check:s=>s.finals>=1},
    {id:'first_podium',  name:'On the Box',      desc:'Finish top 3 in a match',          icon:'\u{1F947}', coins:100,  xp:40,  check:s=>s.podiums>=1},
    {id:'first_dive',    name:'First Flop',      desc:'Dive for the first time',          icon:'\u{1F938}', coins:40,   xp:15,  check:s=>s.dives>=1},
    {id:'first_mini',    name:'Still Standing',  desc:'Survive a minigame round',         icon:'\u{1F3AA}', coins:80,   xp:30,  check:s=>s.minigamesWon>=1},

    // intermediate: the middle of each ladder, which had gaps in it
    {id:'races25',       name:'Regular',         desc:'Play 25 matches',                  icon:'\u{1F4C6}', coins:220,  xp:80,  check:s=>s.races>=25},
    {id:'wins10',        name:'Contender',       desc:'Win 10 matches',                   icon:'\u{1F94B}', coins:420,  xp:150, check:s=>s.wins>=10},
    {id:'finals25',      name:'Ever Closer',     desc:'Reach the final 25 times',         icon:'\u{1F3AF}', coins:550,  xp:200, check:s=>s.finals>=25},
    {id:'podium30',      name:'Rostered',        desc:'Finish top 3 in 30 matches',       icon:'\u{1F948}', coins:600,  xp:220, check:s=>s.podiums>=30},
    {id:'dives250',      name:'Skid Marks',      desc:'Dive 250 times',                   icon:'\u{1F4A8}', coins:450,  xp:160, check:s=>s.dives>=250},
    {id:'minis12',       name:'Party Animal',    desc:'Survive 12 minigame rounds',       icon:'\u{1F389}', coins:480,  xp:170, check:s=>s.minigamesWon>=12},
    {id:'nofall10',      name:'Steady Feet',     desc:'Finish 10 rounds without falling', icon:'\u{1F45F}', coins:520,  xp:190, check:s=>s.noFallFinishes>=10},
    {id:'lava5',         name:'Fireproof',       desc:'Survive 5 Magma Chase rounds',     icon:'\u{1F525}', coins:500,  xp:180, check:s=>s.lavaSurvived>=5},
    {id:'mp25',          name:'Well Connected',  desc:'Race online 25 times',             icon:'\u{1F310}', coins:800,  xp:260, check:s=>s.mpRaces>=25},

    // long haul: these are meant to take a season
    {id:'level15',       name:'Seasoned',        desc:'Reach level 15',                   icon:'\u{1F320}', coins:750,          check:s=>s.level>=15},
    {id:'level40',       name:'Veteran Class',   desc:'Reach level 40',                   icon:'\u{1F308}', coins:2000,         check:s=>s.level>=40},
    {id:'races500',      name:'Lifer',           desc:'Play 500 matches',                 icon:'\u{231B}',  coins:2500, xp:600, check:s=>s.races>=500},
    {id:'streak10',      name:'Juggernaut',      desc:'Win 10 matches in a row',          icon:'\u{1F680}', coins:2000, xp:500, check:s=>s.bestStreak>=10},

    // a combination, which is the one shape the set did not have
    {id:'allround',      name:'All-Rounder',     desc:'Win a match, survive a minigame and reach a final',
                                                                                          icon:'\u{1F9E9}', coins:300,  xp:120,
     check:s=>s.wins>=1 && s.minigamesWon>=1 && s.finals>=1}
  ];
  function checkAchievements(){
    for(const a of ACHIEVEMENTS){
      if(!stats.badges.includes(a.id) && a.check(stats)){
        stats.badges.push(a.id);
        showBanner('BADGE: '+a.name, 2000);
      }
    }
  }
  function unclaimedBadges(){ return (stats.badges||[]).filter(id=>!(stats.claimed||[]).includes(id)); }

  // ============================================================
  // MAPS
  // ============================================================
  // `obstacles` gives each map its own character — not just a repaint.
  // `obstacles` gives each map its own character — not just a repaint. The four
  // flattest corridors from v10 are gone; what replaced them is built around the
  // new cannon / bumper / pendulum / boost / spinlaser pieces.
  const MAPS = [
    { key:'sunny', name:'Sunny Sprint', tip:'Ramps carry you further than a dive — take them at full speed.', ground:'#ffe17a', groundAlt:'#ffd24c', wall:'#3b2a7a', wallTop:'#ff4fa3', skyTop:'#8ecae6', skyMid:'#4a90c9', skyBot:'#ffd6a0', accent:'#ffcb3d',
      round1Total:10300, obstacles:['pillars','hammer','pit','ramp','fork','gate','narrow','bumper'] },

    { key:'cannonc', name:'Boom Peak', tip:'Cannons fire on a rhythm. Watch one cycle, then walk straight through.', ground:'#c084fc', groundAlt:'#a855f7', wall:'#4c1d95', wallTop:'#ff4fa3', skyTop:'#7ee8fa', skyMid:'#22d3ee', skyBot:'#a5f3fc', accent:'#ff4fa3',
      path:'climb', forcedGap:false, obstacles:['cannon','ramp','narrow','pusher','gate','bumper'] },

    { key:'slide', name:'Splash Slide', tip:'Boost pads chain together. Hold your line and do not brake.', ground:'#4dd0e1', groundAlt:'#26c6da', wall:'#0e7490', wallTop:'#ffd54f', skyTop:'#7fd7ff', skyMid:'#38bdf8', skyBot:'#b9f0ff', accent:'#ffd54f', slippery:true,
      path:'slide', lenScale:1.6, hazardScale:0.62, forcedGap:false, obstacles:['boost','narrow','ramp','pillars','shortcut','crumble'] },

    { key:'neon', name:'Neon Nightrun', tip:'Jump a beat early on spinning bars — it is harder to judge in the dark.', ground:'#2b2140', groundAlt:'#241a37', wall:'#1a1033', wallTop:'#23e6c9', skyTop:'#1a0b2e', skyMid:'#3d1a5b', skyBot:'#ff4fa3', accent:'#23e6c9',
      round1Total:10300, forcedGap:false, obstacles:['spinbar','pusher','gate','beam','pendulum','fork','narrow'] },

    // ---- v24 §4 --------------------------------------------------------
    // Three more races, built out of section types that already exist and are
    // already checked. A round is a shape and a palette, not a new engine:
    // Hop & Duck is rows of beams and nothing else, Slime Slope is the two
    // surfaces §2 added, and Log Jam is the rolling logs off the shelf.
    { key:'hopduck', name:'Hop & Duck', tip:'Low bars you jump, high bars you dive under. The rows come faster as you go.',
      ground:'#ffb4d6', groundAlt:'#ff8ec3', wall:'#7a2a52', wallTop:'#23e6c9', skyTop:'#ffd9ec', skyMid:'#ff9ecb', skyBot:'#fff2d0', accent:'#23e6c9',
      objective:'JUMP THE LOW ONES, DIVE THE HIGH ONES!',
      round1Total:9200, forcedGap:false, obstacles:['beam','laserbar','narrow','gate'] },

    { key:'logjam', name:'Log Jam', tip:'The log turns under you and pushes you off the crown. Lean into it, and jump the pegs as they come up.',
      ground:'#7dd3fc', groundAlt:'#38bdf8', wall:'#155e75', wallTop:'#f97316', skyTop:'#e0f2fe', skyMid:'#0ea5e9', skyBot:'#f0f9ff', accent:'#f97316',
      objective:'RACE TO THE FINISH!',
      round1Total:8600, forcedGap:false, obstacles:['logroll','narrow','ramp','gate','pillars'] },

    { key:'tiltdeck', name:'Tilt Deck', tip:'The decks lean toward whoever is standing on them. Cross on the high side, or cross fast.',
      ground:'#fcd34d', groundAlt:'#f59e0b', wall:'#78350f', wallTop:'#38bdf8', skyTop:'#fef3c7', skyMid:'#fbbf24', skyBot:'#fff7ed', accent:'#38bdf8',
      objective:'RACE TO THE FINISH!',
      round1Total:9000, forcedGap:false, obstacles:['tiltdeck','narrow','ramp','pillars','gate'] },

    { key:'slimeslope', name:'Slime Slope', tip:'The floor flows sideways. Aim upstream of where you want to land.',
      ground:'#a7f3a0', groundAlt:'#6ee76a', wall:'#14532d', wallTop:'#ffcb3d', skyTop:'#d9fbd6', skyMid:'#5ec95a', skyBot:'#fdf6c0', accent:'#ffcb3d',
      objective:'RACE TO THE FINISH!',
      round1Total:9600, forcedGap:false, obstacles:['slime','bounce','gap','pillars','narrow'] },

  ];
  // Three saturated accents a map paints its hazards with. Anything that can
  // hurt you wears one of these, or a white-and-accent stripe; walls, floors
  // and safe geometry are pale, so the dangerous thing is always the loudest.
  const MAP_ACCENTS = {
    sunny:   ['#ff4fa3', '#ff7a3d', '#8b5cf6'],
    cannonc: ['#ff4fa3', '#ffcb3d', '#23e6c9'],
    slide:   ['#ff5a4d', '#ffd54f', '#ff4fa3'],
    neon:    ['#23e6c9', '#ff2d95', '#ffcb3d'],
    lava:    ['#ff5a4d', '#ffcb3d', '#ff4fa3'],
    doors:   ['#ff4fa3', '#23e6c9', '#ffcb3d'],
    tiles:   ['#ff4fa3', '#ffcb3d', '#23e6c9'],
    shrink:  ['#ff4fa3', '#ffcb3d', '#23e6c9']
  };
  function mapAccents(){ const a = MAP_ACCENTS[currentMap.key]; return a || [currentMap.accent, currentMap.accent, currentMap.accent]; }
  // Colour arithmetic in HSL, returned as a hex string.
  //
  // In sRGB, explicitly. v21 turned three's colour management on, which made
  // the working space linear -- and every one of these helpers silently began
  // operating on linear values while still carrying numbers that had been
  // tuned against sRGB ones. Splash Slide's #4dd0e1 reads as lightness 0.59 to
  // the eye and 0.41 to a linear getHSL, so a rule about "light" floors was
  // deciding the opposite of what it was written to decide. The palette is
  // authored in sRGB hex, so the arithmetic belongs there too.
  function withHSL(hex, fn){
    const c = new THREE.Color(hex), h = {};
    c.getHSL(h, THREE.SRGBColorSpace);
    fn(h);
    c.setHSL(h.h, h.s, h.l, THREE.SRGBColorSpace);
    return '#' + c.getHexString(THREE.SRGBColorSpace);
  }
  // The floor keeps the map's colour. v20 capped it at 0.42 saturation and 0.62
  // lightness to stop it competing with the hazards, and the cure was worse
  // than the complaint: Sunny Sprint's #ffe17a came out khaki, Splash Slide
  // grey-teal, Boom Peak a washed lavender. Every map read as the same
  // dishwater. Floors are pastel now -- saturated and light -- and a hazard
  // earns its place by being darker and fully saturated instead.
  //
  // The lightness floor only applies to maps that were light to begin with.
  // Neon Nightrun and Magma Chase are dark on purpose, and lifting their floors
  // to 0.72 would turn a night course into an afternoon one.
  // v24 §3: one line under the round's name saying what it wants. A name tells
  // you where you are; on a survival round what you actually need to know is
  // that there is no finish line to run at.
  function objectiveOf(map){
    if(!map) return '';
    if(map.objective) return map.objective;
    if(map.mode === 'lava' || map.mode === 'shrink' || map.mode === 'spin')
      return 'LAST ONE STANDING WINS!';
    if(map.isMinigame) return "DON'T FALL!";
    return 'RACE TO THE FINISH!';
  }

  function neutralFloor(hex){
    return withHSL(hex, h=>{
      // §3 raises this from 0.70. The floor is allowed to be the map's colour;
      // what it is not allowed to be is as loud as the thing that can hurt you,
      // and check 3b is what holds that line rather than this cap.
      h.s = Math.min(h.s, 0.75);
      h.l = h.l >= 0.45 ? clamp(h.l, 0.72, 0.80) : Math.min(h.l, 0.80);
    });
  }
  // Pale and desaturated: walls and anything that cannot hurt you.
  function paleOf(hex){ return withHSL(hex, h=>{ h.s = h.s*0.35; h.l = Math.max(h.l, 0.80); }); }
  function softAccent(hex){ return withHSL(hex, h=>{ h.s = h.s*0.55; h.l = Math.max(h.l, 0.70); }); }
  function mixHex(a, b, k){ const c = new THREE.Color(a).lerp(new THREE.Color(b), k); return '#' + c.getHexString(); }

  // ============================================================
  // COURSE SCRIPTS — the order and shape of every race course
  // ============================================================
  // One ordered list of sections per map. `len` is the section's length along
  // the ribbon at the map's natural size (a shorter round scales the whole
  // script); `turn` bends the ribbon that many degrees across the section;
  // `climb` and `drop` raise or lower it by that many units. Everything else
  // about a section -- obstacle phases, which lane a hole is in, small offsets
  // -- is still random, so a course is learnable without being identical.
  const COURSE_SCRIPTS = {
    // Sunny Sprint: the friendly showcase, the widest spread of section types,
    // and the one course with the forced hole in it.
    sunny: [
      { type:'start',   len:700 },
      { type:'pillars', len:760, turn:+26 },
      { type:'hammer',  len:820 },
      { type:'discField', len:1300, rows:2, cols:3 },
      { type:'pad',     len:340, turn:-30 },
      { type:'gate',    len:640 },
      { type:'bumper',  len:700, turn:+18 },
      { type:'gap',     len:820 },
      { type:'narrow',  len:760, turn:-27 },
      { type:'pit',     len:780 },
      { type:'bounce',  len:420 },
      { type:'fork',    len:1180 },
      { type:'ramp',    len:820, turn:+24 },
      // count 4, not 5. At 5 this field was 1168 long with six safe discs at a
      // 62 gap, and it was where Sunny lost its field -- essentially every fall
      // on the map, at a median of two units past the rim. See the gap ladder in
      // the smallDiscs generator: 47 is the next rung down and 4 is how you get
      // there.
      { type:'smallDiscs', len:1300, count:4 },
      { type:'crumble', len:760, turn:-20 },
      { type:'finish',  len:580 }
    ],
    // Boom Peak: switchbacks, and a cannon on each one. It only ever goes up.
    // Climbing in stepped pushes -- a steep stretch, then a flat landing --
    // rather than one even gradient. Spread evenly the whole map sat at 0.14
    // rad, which costs about 3% of top speed: a hill you cannot feel.
    cannonc: [
      { type:'start',   len:600 },
      { type:'cannon',  len:820, turn:+28, climb:200 },
      { type:'narrow',  len:760, climb:20 },
      { type:'cannon',  len:820, turn:-32, climb:200 },
      // A pit rather than a zigzag: this map only ever goes up, and a
      // sideways hop taken uphill lands short. The island is two hops
      // straight ahead, which a climb allows.
      { type:'pit',     len:800,  climb:40 },
      { type:'narrow',  len:760, turn:+26, climb:20 },
      { type:'cannon',  len:820, climb:200 },
      { type:'gate',    len:600, turn:-24, climb:20 },
      { type:'chevron', len:900, climb:200, turnstiles:3 },
      { type:'cannon',  len:820, turn:+22, climb:200 },
      { type:'narrow',  len:760, turn:-26, climb:20 },
      { type:'bumper',  len:640, climb:20 },
      { type:'finish',  len:560, climb:30 }
    ],
    // Splash Slide: downhill all the way, boost pads chained down it, and one
    // big sweeping turn in the middle. It only ever goes down.
    // Hop & Duck: rows of bars and nothing else, tightening as it goes. The
    // only thing it asks is whether you read a bar's height in time, so
    // nothing else is allowed on the course to muddy the answer -- one gate
    // near the middle to break the rhythm up, and that is all.
    // Tilt Deck: three decks on a pivot, three times, with something that
    // wants you on a line in between each set -- being shoved off the middle of
    // a deck has to cost you on the next thing, or leaning is just scenery.
    // Log Jam: a narrow before every log, because racers arrive at a section
    // spread across the whole track and a log is a fifth of it. Being funnelled
    // onto the crown is the start of the problem, not a way round it.
    logjam: [
      { type:'start',   len:700 },
      { type:'narrow',  len:520 },
      { type:'logroll', len:1500 },
      { type:'ramp',    len:640, turn:+20 },
      { type:'narrow',  len:520 },
      { type:'logroll', len:1500, turn:-22 },
      { type:'gate',    len:620 },
      { type:'narrow',  len:520 },
      { type:'logroll', len:1400 },
      { type:'finish',  len:580 }
    ],

    tiltdeck: [
      { type:'start',    len:700 },
      { type:'tiltdeck', len:1300 },
      { type:'narrow',   len:720, turn:+20 },
      { type:'hammer',   len:760 },
      { type:'tiltdeck', len:1300, turn:-24 },
      { type:'spinbar',  len:700 },
      { type:'gate',     len:640, turn:+18 },
      { type:'tiltdeck', len:1300 },
      { type:'narrow',   len:700, bias:120 },
      { type:'finish',   len:580 }
    ],

    hopduck: [
      { type:'start',   len:700 },
      { type:'beam',    len:760 },
      { type:'beam',    len:720, turn:+18 },
      { type:'beam',    len:700 },
      { type:'gate',    len:640, turn:-22 },
      { type:'beam',    len:680 },
      { type:'beam',    len:660, turn:+20 },
      { type:'narrow',  len:760, bias:110 },
      { type:'beam',    len:640 },
      { type:'beam',    len:620, turn:-18 },
      { type:'beam',    len:600 },
      { type:'beam',    len:580 },
      { type:'finish',  len:560 }
    ],

    // Slime Slope: the two surfaces v24 added, on a course that drops the
    // whole way. Every slime sheet is followed by something you have to be on
    // a line for, so being shoved sideways costs you rather than just looking
    // odd -- and the bounce pads sit over the gaps, which is what they are for.
    slimeslope: [
      { type:'start',   len:700,  drop:40 },
      { type:'slime',   len:640,  drop:80 },
      { type:'gap',     len:820,  drop:80 },
      { type:'pillars', len:700,  turn:+24, drop:70 },
      { type:'bounce',  len:520,  drop:60 },
      { type:'slime',   len:660,  turn:-26, drop:80 },
      { type:'narrow',  len:780,  drop:80, bias:95 },
      { type:'bounce',  len:520,  drop:60 },
      { type:'slime',   len:640,  turn:+22, drop:80 },
      { type:'smallDiscs', len:1200, count:4, drop:90 },
      { type:'gap',     len:800,  drop:70 },
      { type:'pillars', len:680,  drop:60 },
      { type:'bounce',  len:520,  turn:-20, drop:60 },
      { type:'finish',  len:600,  drop:40 }
    ],

    slide: [
      { type:'start',   len:800,  drop:60 },
      { type:'boost',   len:1100, drop:160 },
      // Gentler than the other two on purpose. You arrive here off a boost
      // pad, downhill, on ice, into a bend -- the hardest combination the game
      // can make -- and it is the map's first real obstacle. At bias 95 it was
      // the one hazard in the whole game that racers looped at: every failing
      // run of check h named this channel and no other. Bias 155 further down,
      // approached off a crumbling bridge rather than a boost, is still the
      // steering test the map is built around.
      { type:'narrow',  len:1000, turn:+22, drop:150, bias:55 },
      { type:'crumble', len:1000, drop:150 },
      { type:'boost',   len:1100, turn:-42, drop:170 },
      { type:'narrow',  len:900,  drop:130, bias:155 },   // the one you must steer for
      { type:'shortcut',len:1500, drop:200 },
      { type:'pillars', len:900,  turn:+20, drop:130 },
      { type:'slime',   len:620,  drop:90 },
      { type:'crumble', len:1000, drop:160 },
      { type:'ramp',    len:1000, turn:-26, drop:140 },
      // A pit rather than a disc zigzag: this map is ice, and a zigzag asks
      // for sideways hops, which is the one thing you cannot do on it. The
      // pit's island is two hops straight ahead, which ice allows.
      { type:'pit',     len:800,  drop:120 },
      { type:'narrow',  len:1000, drop:150, bias:95 },
      { type:'crumble', len:1000, drop:150 },
      { type:'boost',   len:1100, drop:160 },
      // v24 §4: the slide finishes through a ring rather than over a line, and
      // it arrives at it off the last boost pad, which is the point -- you go
      // through the hole at the fastest the map ever goes.
      { type:'hoop',    len:320,  drop:60 },
      { type:'finish',  len:700,  drop:80 }
    ],
    // Neon Nightrun: tight, dark, and it bends four times. Spinners and lasers.
    neon: [
      { type:'start',    len:640 },
      { type:'spinbar',  len:820, turn:+27 },
      { type:'beam',     len:760 },
      { type:'pusher',   len:700, turn:-30 },
      { type:'spinbar',  len:820 },
      { type:'pendulum', len:760, turn:+22 },
      { type:'gate',     len:640 },
      { type:'narrow',   len:780, turn:-26 },
      { type:'plank',    len:900, planks:3 },
      { type:'fork',     len:1180 },
      { type:'spinbar',  len:820, turn:+28 },
      // Three long hops rather than four: Neon already asks for a plank bridge
      // and two pendulums, and at five discs the field came home eleven of
      // twenty-three, which is nearer the floor than a map should sit.
      { type:'smallDiscs', len:1000, count:4 },
      { type:'beam',     len:760 },
      { type:'finish',   len:560 }
    ],
    // Magma Chase runs the same kind of sections with the lava behind you, so it
    // is deliberately the most forgiving furniture on the roster.
    lava: [
      { type:'start',   len:700 },
      { type:'pad',     len:500, turn:+24 },
      { type:'pillars', len:700 },
      { type:'narrow',  len:760, turn:-28 },
      { type:'hammer',  len:760 },
      { type:'pad',     len:420, turn:+26 },
      { type:'ramp',    len:800 },
      { type:'pillars', len:700, turn:-22 },
      { type:'gate',    len:620 },
      { type:'bumper',  len:700, turn:+25 },
      { type:'pad',     len:460 },
      { type:'spinbar', len:760 },
      { type:'finish',  len:600 }
    ],
    _default: [
      { type:'start',   len:700 },
      { type:'pillars', len:760, turn:+25 },
      { type:'hammer',  len:800 },
      { type:'narrow',  len:760, turn:-25 },
      { type:'pit',     len:780 },
      { type:'gate',    len:640 },
      { type:'spinbar', len:760 },
      { type:'finish',  len:600 }
    ]
  };

  // Minigame rounds — picked instead of a normal course.
  const MINIGAMES = [
    { key:'lava', name:'Magma Chase', tip:'The lava behind you never stops rising — keep pace, do not stop to look back.',
      ground:'#3a2a22', groundAlt:'#2c1f19', wall:'#4a1c12', wallTop:'#ffcb3d', skyTop:'#ff8a5c', skyMid:'#c0392b', skyBot:'#2c0a08', accent:'#ff5a4d', isMinigame:true, mode:'lava' },
    { key:'doors', name:'Paper Run', tip:'Half of these doors are paper. Charge them — hesitating is what gets you caught.',
      ground:'#e7d7ff', groundAlt:'#d6c1ff', wall:'#4c1d95', wallTop:'#ffcb3d', skyTop:'#c4b5fd', skyMid:'#7c3aed', skyBot:'#2e1065', accent:'#a855f7', isMinigame:true, mode:'doors', lenScale:1.6 },
    { key:'tiles', name:'Panel Drop', tip:'Three floors down. Drop through one and you land on the next — drop through the last and you are out.',
      ground:'#7dd3fc', groundAlt:'#38bdf8', wall:'#075985', wallTop:'#fde68a', skyTop:'#e0f2fe', skyMid:'#38bdf8', skyBot:'#0c4a6e', accent:'#fde68a', isMinigame:true, mode:'tiles', knockout:true },
    { key:'comb', name:'Comb Collapse', tip:'Every hexagon you touch drops a beat later. Keep moving and never stand still.',
      ground:'#ffd166', groundAlt:'#f2b73d', wall:'#7a4a12', wallTop:'#ff8a5c', skyTop:'#ffe9b0', skyMid:'#ffb84d', skyBot:'#fff3d0', accent:'#ff8a5c',
      objective:"DON'T FALL!", isMinigame:true, mode:'hex', knockout:true },
    { key:'walls', name:'Wall Rush', tip:'The gap is the only way through. Never back away from a wall \u2014 there is nothing behind you.',
      ground:'#93c5fd', groundAlt:'#60a5fa', wall:'#1e3a8a', wallTop:'#ff4fa3', skyTop:'#dbeafe', skyMid:'#3b82f6', skyBot:'#eff6ff', accent:'#ff4fa3',
      objective:'FIND THE GAP!', isMinigame:true, mode:'walls', knockout:true },
    { key:'beam', name:'Beam Team', tip:'Green sweeps low and you jump it. Pink sweeps high and you go under it. They speed up.',
      ground:'#4b5563', groundAlt:'#374151', wall:'#111827', wallTop:'#a3e635', skyTop:'#1f2937', skyMid:'#334155', skyBot:'#64748b', accent:'#a3e635',
      objective:'STAY ON THE DISC!', isMinigame:true, mode:'beam', knockout:true },
    { key:'lastrung', name:'Last Rung', tip:'Two layers and no rebuilding the bottom one. Every hexagon anybody touches is one fewer for everybody.',
      ground:'#a5b4fc', groundAlt:'#818cf8', wall:'#312e81', wallTop:'#fbbf24', skyTop:'#1e1b4b', skyMid:'#4338ca', skyBot:'#c7d2fe', accent:'#fbbf24',
      objective:'LAST ONE STANDING!', isMinigame:true, mode:'hex', knockout:true, final:true },
    { key:'shrink', name:'Closing Circle', tip:'The ring never stops closing. Do not be the one still outside it.',
      ground:'#2dd4bf', groundAlt:'#0f766e', wall:'#065f46', wallTop:'#fde68a', skyTop:'#083344', skyMid:'#0e7490', skyBot:'#134e4a', accent:'#fde68a', isMinigame:true, mode:'shrink', knockout:true, final:true },
  ];
  const LAVA_MAP = MINIGAMES[0];
  let currentMap = MAPS[0], lavaZ=0, lavaSpeed=0, lavaMesh=null, lavaGlow=null, mapIntroTimer=0;
  let boulders=[], tiles=[], doorRows=[], lasers=[];
  // Knockout rounds are survival, not a race: the arena is bounded at arenaEnd
  // and the round ends when few enough racers are left standing.
  let arenaEnd = 0;
  function applyMapSky(){
    // v21: a real sky with a sun in it. The old gradient dome is left in the
    // scene but switched off -- other code still holds a handle to it.
    showSky(true);
    const s = SKY_SUN[currentMap.key] || SKY_SUN._default;
    const dome = skyMeshFor(), u = dome.material.uniforms;
    u.turbidity.value = s.turbidity;
    u.rayleigh.value = s.rayleigh;
    u.mieCoefficient.value = (s.mie !== undefined) ? s.mie : 0.006;
    u.mieDirectionalG.value = 0.8;
    // the map's own sky colour, mixed into the band the camera looks at
    if(u.uHaze){ u.uHaze.value.set(currentMap.skyMid); u.uHazeAmt.value = s.haze || 0; }
    const sun = sunVector(s.elev, s.azim);
    u.sunPosition.value.copy(sun);
    renderer.toneMappingExposure = s.exposure;
    // The shadow camera is a fixed box around the player, so a sun sitting on
    // the horizon would throw its shadows straight out of it. The sky keeps
    // the low sun; the key light is lifted to where it can still cast.
    const lift = sunVector(Math.max(28, s.elev), s.azim);
    sunOff.set(lift.x*520, Math.max(240, lift.y*520), lift.z*520);
    dirLight.color.set(s.elev < 12 ? 0xffb98a : 0xfff4e0);
    if(scene.fog) scene.fog.color.set(currentMap.skyMid);
    buildClouds();
    buildSkyline();
  }
