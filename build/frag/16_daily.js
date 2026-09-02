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
  function openDaily(){
    $('home').classList.add('hidden');
    $('daily').classList.remove('hidden');
    buildWheel();
  }
  function closeDaily(){
    $('daily').classList.add('hidden');
    $('home').classList.remove('hidden');
    refreshDailyChip();
  }

  function buildWheel(){
    const wheel = $('wheel');
    const seg = 360/WHEEL.length;
    // conic-gradient starts at 12 o'clock and runs clockwise, same as our maths
    const stops = WHEEL.map((r,i)=>`${RARITY[r].label} ${i*seg}deg ${(i+1)*seg}deg`).join(',');
    wheel.style.background = `conic-gradient(${stops})`;
    wheel.style.transition = 'none';
    wheel.style.transform = 'rotate(0deg)';
    $('wheelLabels').innerHTML = WHEEL.map((r,i)=>{
      const a = i*seg + seg/2;
      return `<span class="wlab" style="transform:rotate(${a}deg) translateY(-96px) rotate(${-a}deg);color:${RARITY[r].text}">${RARITY[r].name}</span>`;
    }).join('');
    $('spinResult').innerHTML = '';
    const ready = spinReady();
    const btn = $('spinBtn');
    btn.disabled = !ready;
    btn.textContent = ready ? 'SPIN' : 'BACK IN '+fmtWait(spinReadyIn());
    spinning = false;
  }

  async function doSpin(){
    if(spinning || !spinReady()) return;
    spinning = true;
    const btn = $('spinBtn'); btn.disabled = true; btn.textContent = 'SPINNING…';

    const prize = pickSpinPrize();
    // land on a wedge of the tier actually won
    const candidates = WHEEL.map((r,i)=>[r,i]).filter(([r])=>r===prize.landed).map(([,i])=>i);
    const idx = candidates.length ? pick(candidates) : 0;
    const seg = 360/WHEEL.length;
    const jitter = rand(-seg*0.32, seg*0.32);
    const target = 360*5 - (idx*seg + seg/2 + jitter);

    const wheel = $('wheel');
    wheel.style.transition = 'transform 4.1s cubic-bezier(0.12,0.72,0.10,1)';
    wheel.style.transform = `rotate(${target}deg)`;
    SFX.click();

    // bank the spin immediately, so a reload mid-animation cannot re-roll it
    stats.lastSpin = Date.now();
    if(prize.skin){ stats.owned = stats.owned||[]; stats.owned.push(prize.skin.id); }
    await saveProfile();

    await new Promise(r => setTimeout(r, 4250));

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
      await addCoins(prize.coins, 'Daily spin');
      $('spinResult').innerHTML =
        `<div class="prize"><div class="pname">You own every colourway!</div>
         <div class="cost">+${fmtNum(prize.coins)} coins instead</div></div>`;
    }
    refreshCoinChips(); refreshDailyChip();
    btn.textContent = 'BACK IN '+fmtWait(spinReadyIn());
    spinning = false;
  }
