  // ============================================================
  // THE FIELD  (v24 §1)
  // ============================================================
  // Twenty-four beans do not fit in one row. A 760-wide track shared out
  // twenty-five ways leaves twenty-seven units a slot and a bean is
  // thirty-four across, so they would start inside one another and shove each
  // other off the pad before the gun. The field lines up in a grid instead:
  // eight columns wide, as many rows deep as it takes. Rows are staggered a
  // quarter of a column so nobody is directly behind anybody else.
  const START_COLS = 8, START_ROW_D = 52;
  function startSlots(total){
    const cx = TRACK_W/2, colW = (TRACK_W-140)/(START_COLS-1), out = [];
    for(let i=0;i<total;i++){
      const row = Math.floor(i/START_COLS), col = i%START_COLS;
      out.push({ x: cx + (col-(START_COLS-1)/2)*colW + (row%2 ? colW*0.25 : -colW*0.25),
                 y: -60 - row*START_ROW_D });
    }
    return out;
  }

  function makeRacers(survivors){
    const list=[], cx=TRACK_W/2;
    if(survivors){
      // Sixteen carried into round two want the grid as much as the opening
      // field does: at the old fifty-eight-unit pitch they lined up from
      // x=-55 to x=815, which is off both edges of a 760 track.
      const slots = startSlots(survivors.length);
      survivors.forEach((s,i)=>{ list.push(Object.assign(s, baseRacer(), {isPlayer:s.isPlayer, name:s.name, color:s.color, skinId:s.skinId, patternId:s.patternId, hat:s.hat, eyes:s.eyes, speed:s.speed, x:slots[i].x, y:slots[i].y, targetX:cx+rand(-250,250), aiDecideT:rand(0,0.5)})); });
    } else {
      const remotes = (mp.role==='host') ? mp.conns.filter(c=>c.peerProfile) : [];
      const n=clamp(settings.botCount,5,23);
      const slots = startSlots(n+1);
      // The player takes a front-row slot off the middle, so the opening shot
      // looks down the grid rather than over somebody's shoulder.
      const pslot = slots.splice(Math.min(3, slots.length-1), 1)[0];
      list.push(Object.assign(baseRacer(), {isPlayer:true, remoteId:null, _localId:'host', name:custom.name||'YOU', skinId:custom.skin, patternId:custom.pattern, color:skinBaseColor(skinOf(custom.skin)), hat:custom.hat, eyes:custom.eyes, x:pslot.x, y:pslot.y}));
      remotes.forEach(conn=>{
        const s=slots.length?slots.shift():{x:cx+rand(-200,200), y:-60};
        const prof=conn.peerProfile;
        list.push(Object.assign(baseRacer(), {isPlayer:false, remoteId:conn.peer, name:(prof.name||'Friend').slice(0,12), color:prof.color||'#60a5fa', hat:prof.hat||'none', eyes:prof.eyes||'round', x:s.x, y:s.y, speed:1}));
      });
      const botsNeeded=Math.max(0, n-remotes.length);
      const order=[...Array(BOT_NAMES.length).keys()].sort(()=>Math.random()-0.5);
      for(let i=0;i<botsNeeded;i++){
        const k=order[i%BOT_NAMES.length]; const s=slots.length?slots.shift():{x:cx+rand(-200,200), y:-60};
        // botLook() last, so the wardrobe wins over the flat fallback colour.
        // It used to land on the survivors line instead, which reskinned every
        // racer -- the player included -- at the start of every round after the
        // first.
        list.push(Object.assign(baseRacer(), {isPlayer:false, remoteId:null, _localId:'bot'+i, name:BOT_NAMES[k], color:BOT_COLORS[k%BOT_COLORS.length], hat:pick(BOT_HATS), eyes:pick(['round','happy','angry','round']), x:s.x, y:s.y, speed:(i<3 ? rand(1.00,1.05) : rand(0.93,1.03)), targetX:cx+rand(-250,250), aiDecideT:rand(0,0.5)}, botLook()));
      }
    }
    return list;
  }

