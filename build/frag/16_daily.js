  // ============================================================
  // DAILY SPIN — one free skin a day, rarer tiers are rarer
  // ============================================================
  const SPIN_COOLDOWN_MS = 22*60*60*1000;      // just under a day, so it drifts earlier not later
  // Odds. Everything below common is deliberately steep: a legendary should feel
  // like something happened.
  const SPIN_ODDS = [['common',40],['rare',26],['superrare',18],['epic',10],['legendary',5],['special',1]];
  // What the wheel shows. Each rarity gets at least one wedge; the common ones
  // repeat so the wheel reads as a wheel rather than a rarity list.
  const WHEEL = ['common','rare','superrare','common','epic','rare','legendary','special'];

  function spinReadyIn(){
    const last = stats.lastSpin || 0;
    return Math.max(0, (last + SPIN_COOLDOWN_MS) - Date.now());
  }
  function spinReady(){ return spinReadyIn() === 0; }
  function fmtWait(ms){
    // round to whole minutes first, or 59.6 minutes prints as "21h 60m"
    const mins = Math.ceil(ms/60000);
    const h = Math.floor(mins/60), m = mins%60;
    return h > 0 ? h+'h '+m+'m' : m+'m';
  }
  function rollSpinRarity(){
    const total = SPIN_ODDS.reduce((a,b)=>a+b[1], 0);
    let r = Math.random()*total;
    for(const [k,v] of SPIN_ODDS){ if((r -= v) <= 0) return k; }
    return 'common';
  }
  // Roll a tier, then hand out something you do not already own. If that tier is
  // exhausted we slide to another rather than handing back nothing, and the
  // wheel lands on what you actually won.
  function pickSpinPrize(){
    const owned = ownedSkins();
    const rolled = rollSpinRarity();
    const tiers = [rolled].concat(RARITY_ORDER.filter(r => r !== rolled));
    for(const r of tiers){
      const pool = SKINS.filter(s => s.rarity===r && !owned.has(s.id));
      if(pool.length) return { landed:r, skin:pick(pool) };
    }
    return { landed:rolled, skin:null, coins:600 };   // you own the lot
  }

  function refreshDailyChip(){
    const btn = $('dailyBtn'); if(!btn) return;
    const ready = spinReady();
    btn.classList.toggle('ready', ready);
    const pip = $('dailyPip'); if(pip) pip.classList.toggle('hidden', !ready);
    btn.title = ready ? 'Daily spin ready' : 'Next spin in '+fmtWait(spinReadyIn());
  }

  let spinning = false;
  // THROUGH THE ROUTER, like every other primary screen.
  //
  // #dailyBtn is not on the lobby -- it is in #menuChrome, the shell every
  // menu screen sits in -- so the wheel is reachable from the locker, badges,
  // the shop, the pass and settings as well as from home. This used to hide
  // #home and nothing else, which is fine from home and stacking from
  // anywhere else: SETTINGS -> DAILY left #settings live underneath, and
  // #settingsGrid then sat over the SPIN button and took the click. The wheel
  // was not merely double-exposed, it was unusable.
  //
  // openLobbyTab('play') is the same call the six pills make. It runs each
  // open screen's own teardown, then hideMenuScreens() closes whatever is
  // left by the ONE list in 10_wiring.js, and the strip stops pointing at the
  // screen you came from. Hiding #home afterwards and showing ourselves is
  // exactly what `case 'locker'` and the rest do. No second list of screen
  // ids lives here, so a screen added later is closed by this without anybody
  // remembering to come back.
  function openDaily(){
    openLobbyTab('play');
    $('home').classList.add('hidden');
    $('daily').classList.remove('hidden');
    buildWheel();
    syncMenuChrome();
  }
  // BACK is the one way out, and it goes where the strip has been saying you
  // would go since the wheel opened: the lobby, with PLAY lit. hideMenuScreens
  // closes the wheel on the way past and backToLobby refreshes the chip, so
  // neither is repeated here -- a second copy of either is a second place to
  // forget.
  function closeDaily(){
    openLobbyTab('play');
  }

  // v25 SS-DAILY: THE BUTTON'S LABEL NEVER CHANGES.
  // It used to carry the state -- 'SPIN' / 'SPINNING...' / 'BACK IN 21h 40m'
  // -- which measured 124px, 186px and 235px wide. The row is centred, so
  // every state change shifted the button and the BACK button beside it. The
  // state lives in its own fixed slot now and the button just says SPIN.
  //
  // ONE OWNER, because saying that in two places is how half of it came back.
  // buildWheel() was fixed and the last line of doSpin() was not, so the label
  // went back to carrying the countdown the moment a spin landed -- SPIN grew
  // from 150px to 228px and threw itself and BACK 39px apart, while the player
  // was looking at the prize. Both callers come through here now and neither
  // writes the button or the status line itself.
  function syncSpinControls(){
    const ready = spinReady();
    const btn = $('spinBtn');
    btn.textContent = 'SPIN';
    btn.disabled = !ready;
    $('spinStatus').textContent = ready ? 'Your spin is ready.'
                                        : 'Next spin in ' + fmtWait(spinReadyIn());
  }

  // Light ink gets a dark shadow and dark ink a light one, so every name
  // lifts off its wedge whichever way round its colours are.
  function lightInk(hex){
    const n = parseInt(String(hex).slice(1), 16);
    return ((n>>16 & 255)*299 + (n>>8 & 255)*587 + (n & 255)*114) / 1000 > 150;
  }

  // ONE ROTATING BODY. The wedges, the lines between them and the names are
  // all built INSIDE #wheelRotor, and #wheelRotor is the only thing doSpin
  // turns. The names used to be built into a sibling of the wedge disc and
  // only the disc was rotated, so for the whole spin every name sat still
  // while the colours slid underneath it, and the wheel stopped with each
  // name over the wrong wedge. Carrying them in one parent makes that
  // impossible; animating two elements with copied timings would only make
  // it unlikely.
  function buildWheel(){
    const rotor = $('wheelRotor');
    const seg = 360/WHEEL.length;
    // conic-gradient starts at 12 o'clock and runs clockwise, same as our maths
    const stops = WHEEL.map((r,i)=>`${RARITY[r].label} ${i*seg}deg ${(i+1)*seg}deg`).join(',');
    $('wheel').style.background = `conic-gradient(${stops})`;
    $('wheelSeps').innerHTML = WHEEL.map((r,i)=>`<i class="wsep" style="--a:${i*seg}deg"></i>`).join('');
    // Each name at the middle of its own wedge, in the rotor's frame, so it
    // turns with that wedge and reads level when the wedge is under the pin.
    $('wheelLabels').innerHTML = WHEEL.map((r,i)=>{
      const a = i*seg + seg/2;
      return `<span class="wlab ${lightInk(RARITY[r].text) ? 'lt' : 'dk'}" style="--a:${a}deg;color:${RARITY[r].text}">${RARITY[r].name}</span>`;
    }).join('');
    const win = $('wheelWin');
    win.classList.remove('on', 'still');
    win.style.background = '';
    rotor.style.transition = 'none';
    rotor.style.transform = 'rotate(0deg)';
    // Commit the reset before anything can start a spin. Without a style
    // flush here the next transition runs from whatever was last computed --
    // a previous spin's resting angle, or nothing at all when the screen was
    // display:none a moment ago, in which case the wheel does not spin, it
    // jumps.
    void rotor.offsetWidth;
    $('spinResult').innerHTML = '';
    syncSpinControls();
    spinning = false;
  }

  async function doSpin(){
    if(spinning || !spinReady()) return;
    spinning = true;
    const btn = $('spinBtn'); btn.disabled = true;
    $('spinStatus').textContent = 'Spinning\u2026';

    const prize = pickSpinPrize();
    // land on a wedge of the tier actually won
    const candidates = WHEEL.map((r,i)=>[r,i]).filter(([r])=>r===prize.landed).map(([,i])=>i);
    const idx = candidates.length ? pick(candidates) : 0;
    const seg = 360/WHEEL.length;
    const jitter = rand(-seg*0.32, seg*0.32);
    const target = 360*5 - (idx*seg + seg/2 + jitter);

    const rotor = $('wheelRotor');
    // ONLY THE WHEEL ANIMATES. Everything around it -- title, subtitle, status,
    // buttons, the result slot -- holds its box for the whole spin. And the
    // wheel is ONE element: the rotor carries the wedges and their names
    // together, and the pointer and hub are not on it (see buildWheel).
    // CONSTANT DECELERATION, which is what friction does to a real wheel:
    // this bezier is exactly 1-(1-t)^2. The old curve launched at about seven
    // turns a second and had only 25 degrees left with 30% of the time to
    // run, so the last 1.2s was a crawl too small to see. This one is still
    // visibly slowing at the end -- 72 degrees left at 80%, 18 at 90% -- so
    // the last wedges tick past the pointer where the player can watch them.
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rotor.style.transition = still ? 'none' : 'transform 4.1s cubic-bezier(0.333,0.667,0.667,1)';
    rotor.style.transform = `rotate(${target}deg)`;
    SFX.click();

    // bank the spin immediately, so a reload mid-animation cannot re-roll it --
    // AND its prize in the same write. The all-owned coins used to be paid
    // after the wait, so a reload in those four seconds kept the spent spin
    // and lost the 600. The coin chip and the pop still wait for the landing.
    stats.lastSpin = Date.now();
    if(prize.skin){ stats.owned = stats.owned||[]; stats.owned.push(prize.skin.id); }
    else stats.coins = (stats.coins||0) + prize.coins;
    await saveProfile();

    await new Promise(r => setTimeout(r, still ? 200 : 4250));

    // The landing: light the wedge it stopped on. It lives on the rotor, so
    // it is on that wedge by construction. A short pulse that settles to a
    // faint glow; with reduced motion, just the glow.
    const win = $('wheelWin');
    win.style.background =
      `conic-gradient(from ${idx*seg}deg, rgba(255,255,255,0.92) 0deg ${seg}deg, transparent ${seg}deg 360deg)`;
    win.classList.toggle('still', !!still);
    win.classList.add('on');

    if(prize.skin){
      const r = RARITY[prize.skin.rarity];
      $('spinResult').innerHTML =
        `<div class="prize">
           <div class="orb" style="background:${skinSwatch(prize.skin)}"></div>
           <span class="rlab" style="background:${r.label};color:${r.text}">${r.name}</span>
           <div class="pname">${prize.skin.name}</div>
           <button class="btn small gold" id="equipPrize">EQUIP</button>
         </div>`;
      $('equipPrize').onclick = ()=>{
        custom.skin = prize.skin.id; SFX.click(); syncCustomColor(); saveProfile();
        refreshPreview(); closeDaily();
      };
      SFX.win();
    } else {
      // already banked above; this is only the pop addCoins() would show
      coinPops.push({ n:prize.coins, why:'Daily spin', t:0 });
      while(coinPops.length > 3) coinPops.shift();
      $('spinResult').innerHTML =
        `<div class="prize"><div class="pname">You own every colourway!</div>
         <div class="cost">+${fmtNum(prize.coins)} coins instead</div></div>`;
    }
    refreshCoinChips(); refreshDailyChip();
    syncSpinControls();                 // SPIN, disabled, and the wait in its own slot
    spinning = false;
  }
