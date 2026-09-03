  const DEFAULT_SETTINGS = {
    keys:{ forward:'w', back:'s', left:'a', right:'d', jump:' ', dive:'shift' },
    camDist:1.0, botCount:15, difficulty:'normal', invertX:false, sound:true, hints:true, shake:true, touch:isTouch, shadows:true,
    freeLook:true, lookSens:1.0, invertLook:false, camRelative:true,
    // Free-orbit mouse look is opt-in: the camera should follow you, not be
    // something you have to steer as well.
    mouseLook:false, autoCentre:true
  };
  let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  const custom = { name:'YOU', skin:'pink', pattern:'none', hat:'crown', eyes:'round' };
  const HATS = [['none','None'],['crown','Crown'],['party','Party'],['halo','Halo'],['horns','Horns'],['prop','Propeller']];
  const EYES = [['round','Round'],['happy','Happy'],['angry','Angry'],['sleepy','Sleepy']];

  const BOT_COLORS = ['#ff8a5c','#7ee8fa','#c084fc','#ffd166','#06d6a0','#f472b6','#a3e635','#60a5fa','#fca5a5','#fbbf24','#34d399','#ff5a4d','#e879f9','#fde68a','#5eead4','#f97316','#4ade80','#818cf8'];
  const BOT_NAMES = ['Waddle','Boingo','Muncher','Squiggle','Tofu','Biscuit','Nugget','Zippy','Doodle','Blorp','Pudge','Wobble','Gizmo','Splat','Noodle','Pickle','Mochi','Bingo'];
  const BOT_HATS = ['none','none','none','party','halo','horns','prop'];

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

    {id:'prismvoid',name:'Prismatic Void', rarity:'special', type:'rainbowneon', unlock:{kind:'coins',cost:1999}}
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
  function ownedPatterns(){
    const set = new Set(stats.patterns||[]);
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

  function ownedSkins(){
    const set = new Set(stats.owned||[]);
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
    {id:'lava',         name:'Hot Feet',        desc:'Survive a Lava Rise round',       icon:'\u{1F30B}', coins:250, check:s=>s.lavaSurvived>=1},
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
    {id:'wardrobe',     name:'Wardrobe',        desc:'Own 8 patterns',                   icon:'\u{1F9F5}', coins:500,  check:()=>ownedPatterns().size>=8}
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
      obstacles:['pillars','hammer','pit','ramp','fork','gate','narrow','bumper'] },

    { key:'cannonc', name:'Cannon Climb', tip:'Cannons fire on a rhythm. Watch one cycle, then walk straight through.', ground:'#c084fc', groundAlt:'#a855f7', wall:'#4c1d95', wallTop:'#ff4fa3', skyTop:'#7ee8fa', skyMid:'#22d3ee', skyBot:'#a5f3fc', accent:'#ff4fa3',
      path:'climb', forcedGap:false, obstacles:['cannon','ramp','narrow','pusher','gate','bumper'] },

    { key:'slide', name:'Super Slide', tip:'Boost pads chain together. Hold your line and do not brake.', ground:'#4dd0e1', groundAlt:'#26c6da', wall:'#0e7490', wallTop:'#ffd54f', skyTop:'#7fd7ff', skyMid:'#38bdf8', skyBot:'#b9f0ff', accent:'#ffd54f', slippery:true,
      path:'slide', lenScale:1.6, hazardScale:0.62, forcedGap:false, obstacles:['boost','narrow','ramp','pillars','shortcut','crumble'] },

    { key:'neon', name:'Neon Nightrun', tip:'Jump a beat early on spinning bars — it is harder to judge in the dark.', ground:'#2b2140', groundAlt:'#241a37', wall:'#1a1033', wallTop:'#23e6c9', skyTop:'#1a0b2e', skyMid:'#3d1a5b', skyBot:'#ff4fa3', accent:'#23e6c9',
      forcedGap:false, obstacles:['spinbar','pusher','gate','beam','pendulum','fork','narrow'] },

  ];
  // Minigame rounds — picked instead of a normal course.
  const MINIGAMES = [
    { key:'lava', name:'Lava Rise', tip:'The lava behind you never stops rising — keep pace, do not stop to look back.',
      ground:'#3a2a22', groundAlt:'#2c1f19', wall:'#4a1c12', wallTop:'#ffcb3d', skyTop:'#ff8a5c', skyMid:'#c0392b', skyBot:'#2c0a08', accent:'#ff5a4d', isMinigame:true, mode:'lava' },
    { key:'doors', name:'Door Dash', tip:'Half of these doors are paper. Charge them — hesitating is what gets you caught.',
      ground:'#e7d7ff', groundAlt:'#d6c1ff', wall:'#4c1d95', wallTop:'#ffcb3d', skyTop:'#c4b5fd', skyMid:'#7c3aed', skyBot:'#2e1065', accent:'#a855f7', isMinigame:true, mode:'doors', lenScale:1.6 },
    { key:'tiles', name:'Tile Trap', tip:'Tiles drop the moment you step off — but they do rebuild. Keep moving.',
      ground:'#7dd3fc', groundAlt:'#38bdf8', wall:'#075985', wallTop:'#fde68a', skyTop:'#e0f2fe', skyMid:'#38bdf8', skyBot:'#0c4a6e', accent:'#fde68a', isMinigame:true, mode:'tiles', knockout:true },
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
    sky.material.uniforms.top.value.set(currentMap.skyTop);
    sky.material.uniforms.mid.value.set(currentMap.skyMid);
    sky.material.uniforms.bot.value.set(currentMap.skyBot);
    if(scene.fog) scene.fog.color.set(currentMap.skyMid);
  }
