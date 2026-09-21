  // ============================================================
  // MENU: 3D PREVIEW + IDLE PERFORMANCE
  // ============================================================
  let stageSpot=null, stageRing=null, stageBackdrop=null;
  let lobbyBackdrop=null, stageFloor=null;
  // Concentric warm rings with a faint sunburst over them; the plane that
  // carries it turns slowly, so the rays drift.
  //
  // v27: BUILT IN LAYERS, so it has somewhere to go.
  // The first version painted seventeen flat discs two steps apart in the same
  // yellow, then laid an 18-ray sunburst at 0.16 white over the lot. Under the
  // tone mapper that arrived as a pale, even field with one bright horizontal
  // bar across it -- busy enough to be noise, flat enough to have no depth, and
  // the one thing it did read as was a seam behind the character's head.
  //
  // What replaces it is a warm radial gradient for the depth, fewer and WIDER
  // bands drawn as translucent light and shade ON that gradient rather than as
  // opaque fills replacing it, and twice as many sunburst rays at less than
  // half the alpha -- which is what stops any single ray reading as a bar. The
  // gradient also darkens toward the rim, so the middle of the screen, where
  // the character stands, is the brightest part of the frame.
  //
  // Still one canvas, painted once and cached: the rotation that animates it is
  // a transform on the plane, so nothing here runs per frame.
  let _lobbyRingTex=null;
  function lobbyRingTexture(){
    if(_lobbyRingTex) return _lobbyRingTex;
    const N=1024, cv=document.createElement('canvas'); cv.width=cv.height=N; const g=cv.getContext('2d');
    const cx=N/2, cy=N/2;
    // ---- base: bright warm centre falling to a deeper gold at the rim.
    //
    // THESE ARE NOT THE COLOURS THAT REACH THE SCREEN, and they are not meant
    // to be. The game composites through an EffectComposer whose OutputPass
    // applies ACES filmic tone mapping to the finished frame, so a material
    // flag cannot opt out of it -- the curve runs on the composite, after every
    // material has had its say. ACES rolls the top end off hard: a plain
    // unlit surface can never exceed 0.62 linear through it, which is why the
    // old backdrop sampled #e2d39b on screen -- milk -- against the reference's
    // #f2c700. The blue channel is the tell: 0x9b against 0x00.
    //
    // Exposing the plane into HDR to get above the rolloff was tried and is
    // wrong: the bloom pass threshold is 1.15, so anything bright enough to
    // beat the curve is also bright enough to bloom, and the backdrop came back
    // paler still (#f4e69e) with a white haze over it. The ceiling is real.
    //
    // So these stops are chosen UNDER it, solved against the curve rather than
    // eyeballed: deep oranges here, which ACES lifts and desaturates into the
    // saturated mid-golds named beside them. They read wrong in this file and
    // right on the screen, which is the deal. The result is a little deeper
    // than the reference's #f2c700 -- that exact value is not reachable through
    // this pipeline -- and a rich gold beats a bright cream.
    const base=g.createRadialGradient(cx,cy,0, cx,cy,N*0.62);
    base.addColorStop(0,   '#ffc800');   // lands ~#d6b628
    base.addColorStop(0.55,'#ff9e00');   // lands ~#d99416
    base.addColorStop(1,   '#b85f00');   // lands ~#a84c02
    g.fillStyle=base; g.fillRect(0,0,N,N);
    // ---- the rings. BAND is a little over twice the old 0.045, which is what
    //      takes them from a fine corduroy to something that reads as rings at
    //      the size they actually arrive on screen.
    const BAND=N*0.098;
    for(let r=N*0.92, i=0; r>0; r-=BAND, i++){
      g.globalAlpha = (i%2===0) ? 0.34 : 0.20;
      g.fillStyle   = (i%2===0) ? '#ffdc55' : '#7a3a00';
      g.beginPath(); g.arc(cx,cy,r,0,Math.PI*2); g.fill();
    }
    // ---- the sunburst: 36 rays at 0.07, not 18 at 0.16
    g.globalAlpha=0.07; g.fillStyle='#ffffff';
    for(let a=0;a<Math.PI*2;a+=Math.PI/18){
      g.beginPath(); g.moveTo(cx,cy); g.arc(cx,cy,N,a,a+Math.PI/54); g.closePath(); g.fill();
    }
    // ---- a last soft darkening at the very edge, so the corners of a wide
    //      monitor fall away instead of ending on a flat colour
    const vig=g.createRadialGradient(cx,cy,N*0.30, cx,cy,N*0.72);
    vig.addColorStop(0,'rgba(120,52,0,0)'); vig.addColorStop(1,'rgba(120,52,0,0.30)');
    g.globalAlpha=1; g.fillStyle=vig; g.fillRect(0,0,N,N);
    _lobbyRingTex=new THREE.CanvasTexture(cv); _lobbyRingTex.colorSpace=THREE.SRGBColorSpace;
    return _lobbyRingTex;
  }
  // Browsing the shop shows the item on the model without committing to it.
  // Cleared on equip, on leaving the tab, and on closing the profile.
  let previewSkin = null, previewPattern = null;
  function setPreview(skinId, patternId){
    previewSkin = skinId || null; previewPattern = patternId || null;
    refreshPreview();
    const tag = $('previewTag');
    if(tag){
      const on = previewSkin || previewPattern;
      tag.classList.toggle('hidden', !on);
      if(on) tag.textContent = 'PREVIEWING ' + (previewSkin ? skinOf(previewSkin).name : patternOf(previewPattern).name);
    }
  }
  function clearPreview(){ if(previewSkin||previewPattern) setPreview(null,null); }
  function refreshPreview(){
    clearGroup(previewGroup);
    animatedMats=[];

    // ---- the lobby: a round podium in front of a slowly turning ring of
    //      warm colour. The locker keeps its dark stage and spotlight.
    // Half the radius it was. At 40/46 the podium was wider than the bean is
    // tall and read as the subject of the shot; the character is what the
    // lobby is for.
    // v24 §5.2: a squat drum, not a dish. The reference stands its character
    // on something barely wider than the character -- so the eye reads the
    // stumbler and takes the podium as a plinth. Ours was a layered cake 54
    // across against a bean 25 across, which is two and a bit bean-widths and
    // reads as furniture. This is 35 across: 1.4 bean-widths, as asked.
    const DRUM_R = RIG.maxR*1.4;                  // 17.4 -- 1.4 bean-widths across
    // Squat: wider than it is tall, or it reads as a barrel the character is
    // standing on top of rather than a plinth it is standing in front of.
    const ped=new THREE.Mesh(new THREE.CylinderGeometry(DRUM_R, DRUM_R*1.05, 15, 40),
      new THREE.MeshToonMaterial({color:0xff4fa3, gradientMap:toonRamp()}));
    ped.position.y=-RADIUS-8.5; ped.receiveShadow=true; previewGroup.add(ped);
    // A lighter top face, so the drum has a lid rather than being a flat pink
    // shape, and a dark band under it for the same reason.
    const pedTop=new THREE.Mesh(new THREE.CylinderGeometry(DRUM_R*1.03, DRUM_R*1.03, 4, 40),
      new THREE.MeshToonMaterial({color:0xff86c0, gradientMap:toonRamp()}));
    pedTop.position.y=-RADIUS-1; pedTop.receiveShadow=true; previewGroup.add(pedTop);
    const pedBase=new THREE.Mesh(new THREE.CylinderGeometry(DRUM_R*1.10, DRUM_R*1.14, 7, 40),
      new THREE.MeshToonMaterial({color:0xc2276f, gradientMap:toonRamp()}));
    pedBase.position.y=-RADIUS-18; pedBase.receiveShadow=true; previewGroup.add(pedBase);
    lobbyBackdrop=new THREE.Mesh(new THREE.PlaneGeometry(7000,7000),
      new THREE.MeshBasicMaterial({map:lobbyRingTexture(), fog:false}));
    // No exposure gain on this material, deliberately: it is what the texture
    // paints and nothing more. See the note in lobbyRingTexture for why the
    // obvious fix -- expose it past the tone curve -- makes it worse.
    lobbyBackdrop.position.set(0, 0, 1900); lobbyBackdrop.rotation.y = Math.PI;
    previewGroup.add(lobbyBackdrop);
    // The gold ring follows the drum in rather than staying at the old width,
    // where it would now hang off the edge of it.
    stageRing=new THREE.Mesh(new THREE.CylinderGeometry(DRUM_R*1.06, DRUM_R*1.06, 3, 32),
      new THREE.MeshBasicMaterial({color:0xffcb3d}));
    stageRing.position.y=-RADIUS+0.5; previewGroup.add(stageRing);

    // pool of light on the floor
    const pool=new THREE.Mesh(new THREE.CircleGeometry(90,40),
      new THREE.MeshBasicMaterial({color:0xfff0c0, transparent:true, opacity:0.13}));
    pool.rotation.x=-Math.PI/2; pool.position.y=-RADIUS-15.4; previewGroup.add(pool);

    const floor=new THREE.Mesh(new THREE.CircleGeometry(460,40),
      new THREE.MeshLambertMaterial({color:0x140e2a}));
    floor.rotation.x=-Math.PI/2; floor.position.y=-RADIUS-16; floor.receiveShadow=true; previewGroup.add(floor);
    stageFloor=floor;

    stageBackdrop=new THREE.Mesh(new THREE.SphereGeometry(620,20,14, 0, Math.PI*2, 0, Math.PI/2),
      new THREE.MeshBasicMaterial({color:0x120a26, side:THREE.BackSide}));
    stageBackdrop.position.y=-RADIUS-16; previewGroup.add(stageBackdrop);

    // decay 0, on purpose. v21 moved the renderer to physically-based lights,
    // where intensity is candela and falls off with distance: this spotlight
    // sits 340 units from the character, so at the old decay of 1.1 it arrived
    // about six hundred times weaker than it was tuned to be, and the locker
    // went black. A stage light is the one place a flat, aimed beam is what is
    // wanted, so the falloff is switched off rather than compensated for.
    stageSpot=new THREE.SpotLight(0xfff4d6, 2.6, 900, 0.46, 0.5, 0);
    stageSpot.position.set(120, 300, -150);
    stageSpot.target.position.set(0, -4, 0);
    stageSpot.castShadow=true;
    stageSpot.shadow.mapSize.width=1024; stageSpot.shadow.mapSize.height=1024;
    previewGroup.add(stageSpot); previewGroup.add(stageSpot.target);
    const rim=new THREE.PointLight(0x8b5cf6, 1.1, 600, 0);   // same reason
    rim.position.set(-170, 90, 150); previewGroup.add(rim);
    // a soft fill from the front so the face is never in its own shadow
    const faceFill=new THREE.DirectionalLight(0xfff2e2, 0.55);
    faceFill.position.set(-40, 60, -180); previewGroup.add(faceFill);

    // v24 §5.3: the locker tries hats and eyes on the same way it tries
    // colours and patterns on -- lkTryOn is what the grid is highlighting.
    const _try = (typeof lkTryOn !== 'undefined' && lkTryOn) || null;
    menuBlob=makeCharacter({skin:skinOf(previewSkin||custom.skin), pattern:patternOf(previewPattern||custom.pattern),
                            hat:(_try && _try.hat) || custom.hat, eyes:(_try && _try.eyes) || custom.eyes});
    previewGroup.add(menuBlob.group);
    // WHAT THE LOBBY LENS FRAMES, measured off the character rather than
    // written down as a pair of constants. Taken here because the group is at
    // its bind pose for exactly this moment -- once the idle starts it is being
    // scaled, hopped and turned every frame, and a box round that is a
    // different box every frame. Cached on the blob, so the per-frame camera
    // code reads two numbers instead of walking the hierarchy.
    //
    // It has to be measured, not assumed, because the tall hats are part of the
    // silhouette: framing sole-to-crown put the top of the crown through the
    // navigation bar, and any fixed allowance for it is a number that goes
    // wrong the next time a hat is added.
    {
      const b = new THREE.Box3().setFromObject(menuBlob.group);
      menuBlob.frameTop = b.max.y; menuBlob.frameBottom = b.min.y;
      // AND HOW FAR THE FRONT OF IT STANDS TOWARD THE LENS. The camera sits at
      // negative z looking back at the origin, so the smaller z is the nearer
      // surface. Framing that ignores this measures the visible height on the
      // plane through the origin and puts the character's belly a good ten
      // units in front of it -- where the frame is narrower, and where the
      // crown is consequently off the top of it.
      menuBlob.frameNear = b.min.z;
    }
    previewGroup.visible=true;
    idle = {act:'settle', t:0, dur:0.8, seed:0};
    // The lobby has ONE default pose, and this is where it is restored. Every
    // route back to the home screen -- goHome, backToLobby, an equip -- comes
    // through here, so none of them can land you on a character still turned
    // from the last time you dragged it.
    resetPreviewSpin();
  }

  // ---- drag the character round with the mouse (or a finger)
  const spin = { angle:0, vel:0, dragging:false, lastX:0, active:false };
  // Put the turn back where a player lands on it. Used by goHome and by the
  // review harness, so a screenshot is of the resting pose rather than of
  // wherever the last drag left the character.
  function resetPreviewSpin(){ spin.angle=0; spin.vel=0; spin.dragging=false; }
  const wrapPi = (a)=>{ let x=(a+Math.PI)%(Math.PI*2); if(x<0) x+=Math.PI*2; return x-Math.PI; };
  const idleAct = ()=> idle && idle.act;
  // The clear strip of the lobby between the top chrome and the bottom button
  // row, as fractions of the viewport height:
  //   frac   -- how much of the height is clear
  //   offset -- how far that strip's centre sits BELOW the frame's centre
  //
  // Read from the DOM rather than written down, because the tab strip and the
  // button row resize at the CSS breakpoints and a copy of their heights in
  // here would be a second source of truth for them. Cached per viewport size:
  // getBoundingClientRect forces layout, and this is wanted every frame.
  let _band = null, _bandFor = '';
  function lobbySafeBand(){
    const key = W+'x'+H;
    if(_bandFor === key && _band) return _band;
    const chrome = $('menuChrome');
    // A little air beyond the chrome itself, so the silhouette does not sit
    // exactly against it.
    const PAD = 8;
    let topPx = 0;
    if(chrome && !chrome.classList.contains('hidden')){
      const r = chrome.getBoundingClientRect();
      topPx = Math.max(0, r.bottom) + PAD;
    }
    // THE TOP IS RESERVED, THE BOTTOM IS NOT, and the difference is where the
    // chrome sits across the width. The tab strip is CENTRED -- it is directly
    // above the character, so the character has to stop below it. The bottom
    // row is a name card hard left and PLAY hard right with nothing between
    // them, so the middle of that band is clear and the plinth is welcome to
    // run down through it and off the bottom edge. Reserving the row's full
    // height here cost about a sixth of the character's size to protect space
    // that was never occupied.
    const botPx = PAD;
    // Never let the measurement starve the character: if the chrome really
    // does cover most of a very short window, the character keeps half the
    // frame and overlaps rather than shrinking to nothing.
    const clear = Math.max(H*0.5, H - topPx - botPx);
    _band = { frac: clear/H, offset: ((topPx - botPx)/2)/H };
    _bandFor = key;
    return _band;
  }
  function previewDragActive(){
    return state==='menu' && (!$('profile').classList.contains('hidden') || !$('home').classList.contains('hidden'));
  }
  canvas.addEventListener('pointerdown', e=>{
    if(!previewDragActive()) return;
    spin.dragging=true; spin.lastX=e.clientX; spin.vel=0;
    try{ canvas.setPointerCapture(e.pointerId); }catch(err){}
  });
  canvas.addEventListener('pointermove', e=>{
    if(!spin.dragging) return;
    const dx=e.clientX-spin.lastX; spin.lastX=e.clientX;
    // Bounded at the source as well as at the clamp in applyIdle, so a long
    // drag does not wind up a number the release then has to unwind: the
    // character stops turning at the limit instead of storing the rest of the
    // gesture and paying it back when you let go.
    spin.angle = clamp(spin.angle + dx*0.012, -LOBBY_YAW_MAX, LOBBY_YAW_MAX);
    spin.vel = dx*0.012;
  });
  const endSpin=()=>{ spin.dragging=false; };
  canvas.addEventListener('pointerup', endSpin);
  canvas.addEventListener('pointercancel', endSpin);

  // The blob performs a random little routine on the menu.
  //
  // v27: NOTHING IN THIS LIST TURNS THE CHARACTER AWAY FROM THE PLAYER.
  // `spin` added a full 2*PI of yaw and `flip` a full 2*PI of pitch, each one
  // in nine, every couple of seconds -- so the lobby put the bean's back or its
  // soles to camera several times a minute, on no input, and a screenshot of
  // the home screen caught a different pose every time. Measured over sixty
  // seconds of lobby before this change: 343 degrees of yaw travel and 345 of
  // pitch. Both acts are gone rather than slowed, because a turn that shows the
  // back is not a turn that is too fast, and the amplitudes left here are held
  // under LOBBY_YAW_MAX below so the face never leaves the shot.
  //
  // The rest stay: they are hops, stretches and weight shifts, which read as a
  // character standing there being alive rather than as a turntable.
  const IDLE_ACTS = [
    {name:'look',    dur:3.4},
    {name:'hop',     dur:2.2},
    {name:'face',    dur:2.4},
    {name:'wobble',  dur:2.6},
    {name:'stretch', dur:2.0},
    {name:'nod',     dur:1.9},
    {name:'peek',    dur:2.8},
    {name:'settle',  dur:2.6}
  ];
  // How far off dead-ahead the lobby will ever let the character face, by any
  // route -- idle act, drag, or the two adding up. 0.30 rad is 17 degrees: far
  // enough to read as a glance, near enough that the face plate stays square to
  // the player and two screenshots taken a few seconds apart show the same
  // character. Asserted by the lobby checks.
  const LOBBY_YAW_MAX = 0.30;
  // THE IDLE'S ENVELOPE, AND THE HEADROOM THE LENS LEAVES FOR IT.
  //
  // These belong together, which is why they are declared together. The camera
  // frames the character's RESTING silhouette, measured once at its bind pose;
  // the idle then hops it, stretches it and leans it toward the lens, and
  // whatever that adds has to fit in the gap the lens left or the crown ends up
  // behind the tab strip -- which is exactly what happened when the framing was
  // derived from the bind pose alone and the amplitudes below were the ones a
  // full-screen locker preview had been tuned for.
  //
  // So they came down. A lobby hero is meant to breathe, not perform: the hop
  // was 26 units on a 36-unit character, the stretch scaled it by a third, and
  // 'peek' halved its distance to the lens, which read less as curiosity and
  // more as the character lunging at the screen. HEADROOM covers the worst
  // case these leave -- a stretch at full extension, about 5.7 units above
  // rest -- with a little to spare for the floating hats.
  const IDLE_HOP = 5, IDLE_STRETCH = 0.08, IDLE_RISE = 3, IDLE_PEEK = 8;
  const IDLE_HEADROOM = 7;
  let idle = {act:'settle', t:0, dur:1, seed:0};
  function nextIdleAct(){
    const a = IDLE_ACTS[Math.floor(Math.random()*IDLE_ACTS.length)];
    idle = {act:a.name, t:0, dur:a.dur, seed:Math.random()};
  }
  function applyIdle(b, dt){
    idle.t += dt;
    if(idle.t >= idle.dur){ nextIdleAct(); }
    const p = clamp(idle.t/idle.dur, 0, 1);      // 0..1 through the act
    const ease = Math.sin(p*Math.PI);             // 0 -> 1 -> 0, for act intensity
    const g = b.group;

    // baseline: gentle breathing, facing the camera, plus however far you have spun them
    let ry = Math.PI + spin.angle, rz = 0, rx = 0, y = 0;
    let sx = 1 + Math.sin(idle.t*2.4)*0.015, sy = 1 - Math.sin(idle.t*2.4)*0.015, sz = sx;
    let pupilX = 0, pupilY = 0, tongue = false, squint = 0;

    switch(idle.act){
      case 'look': {
        // glance left, hold, glance right, hold, recentre
        const k = Math.sin(p*Math.PI*2);
        ry += k*0.75;
        pupilX = k*1.5;
        break;
      }
      case 'hop': {
        // three quick hops with a squash on each landing
        // v27: IDLE_HOP, not 26. The character is 36 tall, so the old hop
        // lifted it most of its own height clear of the podium -- at any moment
        // during one of these the lobby showed a bean floating in mid-air well
        // above the thing it is meant to be standing on, which is most of what
        // made the home screen read as unanchored.
        const hops = 3, ph = (p*hops)%1;
        y = Math.abs(Math.sin(ph*Math.PI))*IDLE_HOP;
        const land = Math.max(0, 1-Math.abs(ph-0.98)*30);
        sy -= land*0.22; sx += land*0.16; sz += land*0.16;
        break;
      }
      case 'face': {
        // tongue out, eyes squeezed, head waggle
        tongue = p>0.18 && p<0.82;
        squint = ease;
        rz = Math.sin(idle.t*11)*0.13*ease;
        sx += ease*0.06; sy -= ease*0.04;
        break;
      }
      // 'spin' and 'flip' used to live here. See IDLE_ACTS.
      case 'wobble': {
        // shifting weight foot to foot
        rz = Math.sin(idle.t*5.2)*0.17;
        y = Math.abs(Math.sin(idle.t*5.2))*5;
        pupilX = Math.sin(idle.t*5.2)*0.8;
        break;
      }
      case 'stretch': {
        // reach tall, then squash, then settle
        const s = Math.sin(p*Math.PI);
        sy += s*IDLE_STRETCH; sx -= s*IDLE_STRETCH*0.43; sz -= s*IDLE_STRETCH*0.43;
        y = s*IDLE_RISE;
        break;
      }
      case 'nod': {
        rx = Math.sin(idle.t*7)*0.22*ease;
        pupilY = -Math.sin(idle.t*7)*0.7*ease;
        break;
      }
      case 'peek': {
        // lean in close to the camera, look you up and down, lean back
        const s = Math.sin(p*Math.PI);
        g.position.z = -s*IDLE_PEEK;
        sx += s*0.03; sy += s*0.03; sz += s*0.03;
        pupilY = Math.sin(idle.t*3.4)*1.2;
        break;
      }
      default: { // settle
        y = Math.abs(Math.sin(idle.t*4))*4;
      }
    }

    if(idle.act!=='peek') g.position.z += (0 - g.position.z)*0.15;
    // ONE PLACE DECIDES HOW FAR THE CHARACTER CAN TURN. Clamping the total here
    // rather than trimming each act's amplitude is what makes the guarantee
    // hold for the SUM of them: `look` at its full swing plus a drag plus the
    // breathing used to add up to something no individual number in this
    // function looked responsible for. The pitch is held the same way, so a
    // nod can never become a flip.
    g.rotation.set(clamp(rx, -LOBBY_YAW_MAX, LOBBY_YAW_MAX),
                   Math.PI + clamp(ry - Math.PI, -LOBBY_YAW_MAX, LOBBY_YAW_MAX),
                   rz);
    g.position.y = y;
    g.scale.set(sx, sy, sz);

    // eyes + mouth respond to the act
    // REST POSITION FROM THE RIG, NOT A LITERAL. This set `position.y = 5`,
    // which put the lobby's pupils five units above the face bone whatever the
    // rig had decided -- fine while the plate was a flat disc most of the head
    // tall, and wrong the moment the face became a cap centred on the widest
    // line, where y 5 is the plate's top rim. The x offset already worked this
    // way; the y now does too, so the idle nudges the eyes from wherever the
    // rig puts them instead of from a number that has to be kept in step.
    for(const pu of b.pupils){
      if(pu.userData.baseX === undefined) pu.userData.baseX = pu.position.x;
      if(pu.userData.baseY === undefined) pu.userData.baseY = pu.position.y;
    }
    // THE WHOLE EYE MOVES, NOT A PUPIL INSIDE IT. There is no sclera bead --
    // the face is a dark slot on a pale plate -- so what this slides is the eye
    // itself, across a plate that is a curved cap. The old travel was 1.5, more
    // than an eye-width, which slid one eye toward the nose and the other toward
    // the rim and buried whichever of them the curve had moved away under. The
    // rig now stands each eye EYE_PROUD (0.34) off the cap, so the travel has to
    // stay inside what that clearance covers: at this azimuth 0.25 costs about
    // 0.06 of depth, which it does. Small enough to read as life, not as a face
    // coming apart.
    const EYE_TRAVEL = 0.25;
    const px = clamp(pupilX, -1, 1)*EYE_TRAVEL, py = clamp(pupilY, -1, 1)*EYE_TRAVEL;
    b.pupils.forEach(pu=>{ pu.position.x = pu.userData.baseX + px; pu.position.y = pu.userData.baseY + py; });
    b.scleras.forEach(sc=>{ sc.scale.y = (custom.eyes==='happy'||custom.eyes==='sleepy'? (custom.eyes==='happy'?0.55:0.5) : 1) * (1 - squint*0.55); });
    b.tongue.scale.setScalar(tongue ? 1 : 0.0001);
  }

  function syncPreview(t,dt){
    if(!menuBlob) return;
    menuT+=dt;
    // LET GO AND THEY STOP, then drift back to facing you.
    // The inertia used to be the point of this block: release still carried the
    // turn for the better part of a second, which on an unbounded angle is how
    // a drag ended with the bean's back to the room. The coast is now short
    // enough to read as the hand leaving rather than as a throw, and what
    // follows it is a return to the resting angle rather than a stop wherever
    // the momentum ran out -- so the lobby has one default pose and always
    // comes back to it.
    if(!spin.dragging){
      spin.angle += spin.vel;
      spin.vel *= Math.pow(0.0004, dt);
      if(Math.abs(spin.vel)<0.0004) spin.vel=0;
      spin.angle += (0 - spin.angle) * Math.min(1, dt*2.2);
    }
    applyIdle(menuBlob, dt);
    animateAura(menuBlob, menuT);
    if(menuBlob.hatGroup.userData.spin) menuBlob.hatGroup.userData.spin.rotation.y=t*12;
    // slide the character aside when the profile card needs the room
    const profOpen = !$('profile').classList.contains('hidden');
    // world +X reads as screen-left from this camera, so a negative shift stands
    // the character on the right of the screen with the tiles to their left. The
    // visible half-width at this distance is only about 120 units.
    // Far enough clear of the card to read as a separate thing. At -70 the
    // character stood on the card's edge; the panel takes the left three
    // fifths of the screen, so the stage belongs in the right fifth.
    const wantX = profOpen ? (W>=861 ? -132 : -62) : 0;
    previewGroup.position.x += (wantX - previewGroup.position.x)*0.12;

    const dailyOpen = !$('daily').classList.contains('hidden');
    // Never hidden while the locker is open: you are choosing how this
    // character looks, and on a narrow window the old rule removed it from the
    // screen altogether, which is the one place it has to be.
    // The shop has no character on it -- the cards carry their own renders --
    // and a stumbler standing behind them reads as something that got left on.
    const shopOpen = !$('shop').classList.contains('hidden');
    previewGroup.visible = !dailyOpen && !shopOpen;
    // The pass puts the character in the middle between two panels rather
    // than to one side, so it wants the lobby's framing, not the locker's.
    const psOpen = !$('pass').classList.contains('hidden');
    if(stageBackdrop) stageBackdrop.visible = profOpen;      // the stage only dresses the profile
    if(stageRing) stageRing.visible = profOpen;
    if(stageFloor) stageFloor.visible = profOpen;
    if(lobbyBackdrop){ lobbyBackdrop.visible = !profOpen; lobbyBackdrop.rotation.z += dt*0.05; }
    if(stageSpot) stageSpot.intensity = profOpen ? 1.6 : 0.0;
    // Close in while the locker is open: this is the shot the screen is built
    // around, and the character should fill their half of it.
    // pull back when the card is beside them, so the offset stays in frame
    // Closer while the locker is open, not further away: the character is the
    // subject of this screen and was being framed like scenery.
    // In close on the lobby: the bean should be the biggest thing on screen.
    // Closer again on the lobby now the podium is not competing for the frame:
    // the reference gives its character a little over half the screen height,
    // and at -104 with the old wide dish ours was nearer a third.
    const camZ = (profOpen && W>=861) ? -150 : -86;
    // v24 §5.3: the locker's panel takes the right half of the screen, so the
    // character stands in the left half rather than behind it. Moving the
    // group is the whole of it -- the podium, the lights and the backdrop all
    // come with it, which a camera pan would not have done.
    const lkOpen = !$('locker').classList.contains('hidden');
    // Measured off the panel, not guessed. The panel is 56% of the width at
    // full size and 64% below 1000px, so a fixed offset that centres the
    // character in the strip at one size buries it behind the panel at the
    // other -- which is what a hardcoded 22 did at 960.
    //
    // Positive, because the menu camera sits at negative z looking back at the
    // origin: the view is mirrored, and world -x lands on the right of the
    // screen, which is where the panel is.
    if(lkOpen){
      const panel = document.querySelector('#locker .lkPanel');
      const free = panel ? panel.getBoundingClientRect().left : W*0.44;
      const halfFrame = Math.abs(camZ) * Math.tan(camera.fov*Math.PI/360) * camera.aspect;
      previewGroup.position.x = ((W/2 - free/2) / (W/2)) * halfFrame;
    } else previewGroup.position.x = 0;
    // The v22 character is shorter than the v20 one it replaces, so the shot
    // comes down with it rather than framing the empty air above its head.
    camera.position.set(0,34,camZ); camera.lookAt(0,1,0);
    // ---- the LOBBY's own lens.
    //
    // Everything above is the locker's and the profile's shot, and the home
    // screen had been borrowing it: a camera 34 units up looking down at a
    // character whose crown is at 18.6, from 86 away. That is above the bean's
    // head pointing down at it, which is why the podium read as a lid seen from
    // above and why the character came out about 29% of the frame height
    // against the reference's two thirds.
    //
    // So the lobby gets its own, derived rather than dialled in: fill FILL of
    // the frame with a figure SOLE..CROWN tall, and the distance follows from
    // the vertical field of view. Retuning the framing is then a matter of
    // changing FILL, and the locker -- which is a different shot for a
    // different job -- is left alone.
    const homeOpen = !$('home').classList.contains('hidden');
    if(homeOpen && menuBlob.frameTop !== undefined){
      // A slice of the podium, so the character reads as standing ON something
      // rather than as cut off at the ankles by the bottom of the screen.
      const PLINTH = 5;
      // IDLE_HEADROOM, because frameTop is the RESTING silhouette and the idle
      // goes above it -- see where the envelope is declared.
      const top = menuBlob.frameTop + IDLE_HEADROOM;
      const bottom = Math.min(menuBlob.frameBottom, -16) - PLINTH;
      // HOW MUCH OF THE FRAME IS CLEAR, MEASURED RATHER THAN ASSUMED.
      //
      // This was a fraction of the height, and a fraction is the wrong unit.
      // The chrome the character has to stay clear of is a tab strip and a
      // button row whose heights are in PIXELS and barely move, so they take a
      // sixth of a 1080-tall frame and nearly a quarter of a 720-tall one: the
      // single figure that framed the character correctly on a big monitor put
      // the crown's points behind the tab strip at 1280x720. Writing pixel
      // figures here instead would be no better -- the strip resizes at the CSS
      // breakpoints, so they would be a third copy of numbers that already
      // live in 04_menu.css and would go stale the first time one changed.
      //
      // So it asks the DOM. lobbySafeBand gives the clear strip between the
      // bottom of the chrome and the top of the button row, and the character
      // is fitted into that -- wherever the stylesheet has put it.
      const band = lobbySafeBand();
      let half = (top - bottom)/(2*band.frac);
      // On a frame narrower than it is tall the limit is the character's WIDTH,
      // not its height, and a shot framed only on height crops the arms off.
      const needHalfW = RIG.maxR*1.7;
      if(half*camera.aspect < needHalfW) half = needHalfW/camera.aspect;
      // THE FRAME IS MEASURED AT THE NEAREST PART OF THE CHARACTER, NOT AT THE
      // ORIGIN. `half` is a visible half-height, and a perspective frame is
      // narrower the closer you are: this lens is about 73 degrees, so the ten
      // units the bean's belly stands toward the camera cost roughly a quarter
      // of the frame's height. Framed on the origin plane the numbers all said
      // the character fitted and the crown still went through the tab strip --
      // the envelope sweep in tools/lobby-shots.mjs is what caught it, at ndc
      // 1.12 where 1.0 is the edge. Standing off by the near surface's own
      // depth is what makes the fit real.
      //
      // `peek`'s lean is deliberately NOT added here. It looked like it should
      // be, but the sweep says the worst top belongs to `wobble`, which has no
      // lean at all -- so allowing for both at once reserves room for a pose
      // that cannot happen and costs the character about a fifth of its size
      // for it. The sweep is what says this is safe, and it is re-run whenever
      // the framing changes.
      const near = menuBlob.frameNear || 0;
      const dist = half/Math.tan(camera.fov*Math.PI/360) - near;
      // Put the character's own centre at the centre of that clear strip, which
      // is not the centre of the frame: the strip at the top and the row at the
      // bottom are different heights. band.offset is how far the clear middle
      // sits below the frame's middle, as a fraction of the height; world units
      // per fraction is 2*half, and screen-up is world-up, so it subtracts.
      const aim = (top + bottom)/2 - band.offset*2*half;
      // Near eye level, tilted down just enough to keep the podium reading as a
      // disc the character stands ON rather than as a line it stands behind.
      camera.position.set(0, aim + 7.5, -dist); camera.lookAt(0, aim, 0);
    }
    // The review harness's face close-up. Here rather than in the harness
    // because the lobby rewrites the camera every frame, so a lens the tool set
    // from outside would be thrown away before the shutter. Shipped code never
    // sets the flag.
    if(window.__faceCam){ camera.position.set(0, RIG.faceY, -30); camera.lookAt(0, RIG.faceY, 0); }
    // dim the room so the spotlight reads
    // Dimmed for the spotlight to read against, not extinguished. At 0.30 and
    // 0.20 under physical lights the character was a silhouette.
    dirLight.intensity = profOpen ? 1.15 : KEY_LIGHT;
    hemi.intensity     = profOpen ? 0.50 : FILL_LIGHT;
    dirLight.position.set(120,300,-150); dirLight.target.position.set(0,0,0);
    showSky(false);                                         // the ring backdrop is the sky here
    sky.position.set(camera.position.x,0,camera.position.z);
  }

  // ============================================================
  // COINS + PROFILE UI
  // ============================================================
  function fmtNum(n){ return (n||0).toLocaleString('en-GB'); }
  function refreshCoinChips(){
    if(typeof refreshLobby==='function') refreshLobby();
    document.querySelectorAll('.coinChip .coinNum').forEach(el=>{ el.textContent = fmtNum(stats.coins); });
    // One rule for "is there anything to claim", in 34_badges.js.
    refreshBadgePips();
    const owned=ownedSkins(), ownedP=ownedPatterns();
    const affordable = SKINS.some(s=>s.unlock.kind==='coins' && !owned.has(s.id) && stats.coins>=s.unlock.cost)
                    || PATTERNS.some(p=>p.unlock.kind==='coins' && !ownedP.has(p.id) && stats.coins>=p.unlock.cost);
    const sp=$('shopPip'); if(sp) sp.classList.toggle('hidden', !affordable);
  }
  function renderCoinPops(dt){
    const host=$('coinPops'); if(!host) return;
    // Emptying coinPops used to skip the rebuild entirely -- the guard needs a
    // non-empty array -- so the toast stayed up into the next map intro.
    if(!coinPops.length){ if(host.children.length) host.innerHTML=''; return; }
    if(host.children.length!==coinPops.length){
      host.innerHTML = coinPops.map(p=>`<div class="coinPop">+${fmtNum(p.n)}${p.why?`<span class="why">${p.why}</span>`:''}</div>`).join('');
    }
    for(const p of coinPops) p.t+=dt;
    if(coinPops.some(p=>p.t>2.4)){ coinPops=coinPops.filter(p=>p.t<=2.4); host.innerHTML=coinPops.map(p=>`<div class="coinPop">+${fmtNum(p.n)}${p.why?`<span class="why">${p.why}</span>`:''}</div>`).join(''); }
  }

  // One line of flavour under the name, the way a locker entry reads.
  const SKIN_BLURB = {
    solid:'A clean, flat colourway.',
    gradient:'Two colours, blended top to bottom.',
    galaxy:'Stars drifting somewhere under the surface.',
    rainbow:'The whole spectrum, cycling.',
    gold:'Polished metal, and it knows it.',
    neon:'Lit from the inside.',
    rainbowneon:'Lit from the inside, and never twice the same colour.'
  };
  function skinBlurb(s){
    const r = RARITY[s.rarity];
    const line = SKIN_BLURB[s.type] || 'One of a kind.';
    return line + ' Part of the ' + r.name.toLowerCase() + ' set.';
  }

  let profTab='character', shopFilter='all';
  // which tile the locker sidebar is describing (null = whatever is equipped)
  let selSkin=null, selPattern=null;
  function openProfile(tab){
    profTab = tab||'character';
    $('home').classList.add('hidden');
    $('profile').classList.remove('hidden');
    buildProfile();
  }
  function switchTab(name){
    clearPreview();
    profTab=name;
    document.querySelectorAll('#profile .tab').forEach(t=>t.classList.toggle('sel', t.dataset.tab===name));
    document.querySelectorAll('#profile .tabPane').forEach(p=>p.classList.toggle('hidden', p.dataset.pane!==name));
    buildProfile();
  }
  function buildProfile(){
    $('levelNum').textContent = stats.level;
    $('profNameLbl').textContent = custom.name||'YOU';
    const need = xpForLevel(stats.level);
    $('xpBar').style.width = clamp((stats.xp/need)*100,0,100)+'%';
    $('xpText').textContent = `${stats.xp} / ${need} XP`;
    refreshCoinChips();
    document.querySelectorAll('#profile .tab').forEach(t=>t.classList.toggle('sel', t.dataset.tab===profTab));
    document.querySelectorAll('#profile .tabPane').forEach(p=>p.classList.toggle('hidden', p.dataset.pane!==profTab));
    if(profTab==='character') buildCharacterPane();
    if(profTab==='stats')     buildStatsPane();
    if(profTab==='shop')      buildShopPane();
    if(profTab==='patterns')  buildPatternPane();
  }

  function buildCharacterPane(){
    $('nameInput').value = custom.name||'';
    const eq = skinOf(custom.skin);
    $('equippedName').textContent = '— '+eq.name+' ('+RARITY[eq.rarity].name+')';
    const owned = [...ownedSkins()];
    const list = SKINS.filter(s=>owned.includes(s.id));
    const host=$('ownedSwatches'); host.innerHTML='';
    for(const s of list){
      const d=document.createElement('div');
      d.className='sw'+(s.id===custom.skin?' sel':'');
      d.style.background = skinSwatch(s);
      // border carries the rarity, the way a character-select grid does
      d.style.borderColor = RARITY[s.rarity].label;
      d.title = s.name+' · '+RARITY[s.rarity].name;
      d.onclick = ()=>{ custom.skin=s.id; SFX.click(); saveProfile(); refreshPreview(); buildCharacterPane(); $('equippedName').textContent='— '+s.name+' ('+RARITY[s.rarity].name+')'; };
      host.appendChild(d);
    }
    const ep = patternOf(custom.pattern);
    $('equippedPattern').textContent = '— '+ep.name;
    const pHost=$('ownedPatternSwatches'); pHost.innerHTML='';
    const ownedP=[...ownedPatterns()];
    for(const p of PATTERNS.filter(p=>ownedP.includes(p.id))){
      const d=document.createElement('div');
      d.className='sw pat'+(p.id===custom.pattern?' sel':'');
      d.style.backgroundImage = patternPreviewCSS(p);
      d.style.borderColor = RARITY[p.rarity].label;
      if(p.id==='none'){ d.style.backgroundColor='#f4f5f8'; d.textContent=''; }
      d.title = p.name;
      d.onclick = ()=>{ custom.pattern=p.id; SFX.click(); saveProfile(); refreshPreview(); buildCharacterPane(); };
      pHost.appendChild(d);
    }

    const hs=$('hatSeg'); hs.innerHTML='';
    HATS.forEach(([k,label])=>{ const c=document.createElement('div'); c.className='chip'+(custom.hat===k?' sel':''); c.textContent=label;
      c.onclick=()=>{ custom.hat=k; SFX.click(); saveProfile(); refreshPreview(); buildCharacterPane(); }; hs.appendChild(c); });
    const es=$('eyeSeg'); es.innerHTML='';
    EYES.forEach(([k,label])=>{ const c=document.createElement('div'); c.className='chip'+(custom.eyes===k?' sel':''); c.textContent=label;
      c.onclick=()=>{ custom.eyes=k; SFX.click(); saveProfile(); refreshPreview(); buildCharacterPane(); }; es.appendChild(c); });
  }

  function buildPatternPane(){
    const owned = ownedPatterns();
    const list = [...PATTERNS].sort((a,b)=>RARITY_ORDER.indexOf(a.rarity)-RARITY_ORDER.indexOf(b.rarity));
    const host=$('patternGrid');
    host.innerHTML = list.map(p=>{
      const have=owned.has(p.id), equipped=custom.pattern===p.id;
      const r=RARITY[p.rarity];
      const sub = have ? (equipped?'Equipped':'Owned') : (p.unlock.kind==='coins'? p.unlock.cost+' coins' : 'Starter');
      const bg = p.id==='none' ? 'background:#f4f5f8' : `background-image:${patternPreviewCSS(p)}`;
      const sel = (selPattern||custom.pattern)===p.id;
      return `<div class="shopCard ${have?'':'locked'}${sel?' sel':''}">
        <div class="orb pat" style="${bg}"></div>
        <span class="rlab" style="background:${r.label};color:${r.text}">${r.name}</span>
        <div class="sn">${p.name}</div>
        <div class="cost">${sub}</div></div>`;
    }).join('');

    const chosen = patternOf(selPattern || custom.pattern) || list[0];
    if(chosen){
      const cr = RARITY[chosen.rarity], chave = owned.has(chosen.id), ceq = custom.pattern===chosen.id;
      let act;
      if(ceq) act = `<button class="equipped" disabled>EQUIPPED</button>`;
      else if(chave) act = `<button class="btn gold" data-pequip="${chosen.id}">EQUIP</button>`;
      else act = `<button class="btn pink" data-pbuy="${chosen.id}" ${stats.coins<chosen.unlock.cost?'disabled':''}>BUY ${chosen.unlock.cost}</button>`;
      $('patternInfo').innerHTML =
        `<div class="liRarity" style="background:${cr.label};color:${cr.text}">${cr.name}</div>
         <div class="liName">${chosen.name}</div>
         <div class="liDesc">Paints over whatever colourway you have on, so it mixes with all of them.</div>
         <div class="liMeta">${chave ? (ceq?'Equipped':'In your locker') : (chosen.unlock.kind==='coins'? chosen.unlock.cost+' coins' : 'Starter')}</div>
         ${act}`;
    }

    host.querySelectorAll('.shopCard').forEach((card,i)=>{
      card.onclick = ()=>{ selPattern = list[i].id; setPreview(null, list[i].id); SFX.click(); buildPatternPane(); };
    });
    const ppane = host.closest('.tabPane') || host;
    ppane.querySelectorAll('button[data-pequip]').forEach(b=>{ b.onclick=()=>{
      custom.pattern=b.dataset.pequip; selPattern=b.dataset.pequip; SFX.click(); saveProfile(); setPreview(null,null); buildPatternPane(); }; });
    ppane.querySelectorAll('button[data-pbuy]').forEach(b=>{ b.onclick=async ()=>{
      const p=patternOf(b.dataset.pbuy);
      if(p.unlock.kind!=='coins' || stats.coins < p.unlock.cost) return;
      stats.coins -= p.unlock.cost;
      stats.patterns = stats.patterns||[]; stats.patterns.push(p.id);
      custom.pattern = p.id;
      SFX.win();
      await saveProfile();
      selPattern = p.id;
      setPreview(null,null); buildPatternPane(); refreshCoinChips();
    }; });
  }

  function buildStatsPane(){
    const owned = ownedSkins().size;
    const winRate = stats.races ? Math.round((stats.wins/stats.races)*100) : 0;
    const cards = [
      ['Matches played', fmtNum(stats.races)],
      ['Matches won',    fmtNum(stats.wins)],
      ['Win rate',       winRate+'%'],
      ['Podium finishes',fmtNum(stats.podiums)],
      ['Finals reached', fmtNum(stats.finals)],
      ['Level',          fmtNum(stats.level)],
      ['Coins',          fmtNum(stats.coins)],
      ['Dives',          fmtNum(stats.dives)],
      ['Minigames survived', fmtNum(stats.minigamesWon)],
      ['Lava rounds survived', fmtNum(stats.lavaSurvived)],
      ['Clean rounds (no falls)', fmtNum(stats.noFallFinishes)],
      ['Online matches', fmtNum(stats.mpRaces)],
      ['Badges earned',  (stats.badges||[]).length+' / '+ACHIEVEMENTS.length],
      ['Colourways owned', owned+' / '+SKINS.length],
      ['Patterns owned', ownedPatterns().size+' / '+PATTERNS.length]
    ];
    $('statGrid').innerHTML = cards.map(([k,v])=>`<div class="statCard"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')
      + `<div class="statCard wide"><div class="k">Progress to Champion Gold</div><div class="v">${fmtNum(Math.min(stats.wins,100))} / 100 wins</div></div>`;
  }

  function buildShopPane(){
    const filt=$('rarityFilter');
    const opts=[['all','All','#1a1033']].concat(RARITY_ORDER.map(r=>[r,RARITY[r].name,RARITY[r].label]));
    filt.innerHTML = opts.map(([k,label,col])=>
      `<span class="rchip${shopFilter===k?' sel':''}" data-r="${k}" style="background:${col};color:${k==='all'||k==='superrare'||k==='epic'?'#fff':'#1a1033'}">${label}</span>`).join('');
    filt.querySelectorAll('.rchip').forEach(c=>{ c.onclick=()=>{ shopFilter=c.dataset.r; SFX.click(); buildShopPane(); }; });

    const owned = ownedSkins();
    const list = SKINS.filter(s=>shopFilter==='all'||s.rarity===shopFilter)
      .sort((a,b)=>RARITY_ORDER.indexOf(a.rarity)-RARITY_ORDER.indexOf(b.rarity));
    const host=$('shopGrid');
    host.innerHTML = list.map(s=>{
      const have=owned.has(s.id), equipped=custom.skin===s.id;
      const r=RARITY[s.rarity];
      const sub = have ? (equipped?'Equipped':'Owned') : unlockText(s);
      const sel = (selSkin||custom.skin)===s.id;
      return `<div class="shopCard ${have?'':'locked'}${sel?' sel':''}">
        <div class="orb" style="background:${skinSwatch(s)}"></div>
        <span class="rlab" style="background:${r.label};color:${r.text}">${r.name}</span>
        <div class="sn">${s.name}</div>
        <div class="cost">${sub}</div></div>`;
    }).join('');

    // ---- the panel beside the model: what you are looking at, and one action
    const chosen = skinOf(selSkin || custom.skin) || list[0];
    if(chosen){
      const r = RARITY[chosen.rarity], have = owned.has(chosen.id), equipped = custom.skin===chosen.id;
      let act;
      if(equipped) act = `<button class="equipped" disabled>EQUIPPED</button>`;
      else if(have) act = `<button class="btn gold" data-equip="${chosen.id}">EQUIP</button>`;
      else if(chosen.unlock.kind==='coins')
        act = `<button class="btn pink" data-buy="${chosen.id}" ${stats.coins<chosen.unlock.cost?'disabled':''}>BUY ${chosen.unlock.cost}</button>`;
      else act = `<button class="btn blue" disabled>LOCKED</button>`;
      $('shopInfo').innerHTML =
        `<div class="liRarity" style="background:${r.label};color:${r.text}">${r.name}</div>
         <div class="liName">${chosen.name}</div>
         <div class="liDesc">${skinBlurb(chosen)}</div>
         <div class="liMeta">${have ? (equipped?'Equipped':'In your locker') : unlockText(chosen)}</div>
         ${act}`;
    }

    host.querySelectorAll('.shopCard').forEach((card,i)=>{
      card.onclick = ()=>{ selSkin = list[i].id; setPreview(list[i].id, null); SFX.click(); buildShopPane(); };
    });
    const pane = host.closest('.tabPane') || host;
    pane.querySelectorAll('button[data-equip]').forEach(b=>{ b.onclick=()=>{
      custom.skin=b.dataset.equip; selSkin=b.dataset.equip; SFX.click(); saveProfile(); setPreview(null,null); buildShopPane(); }; });
    pane.querySelectorAll('button[data-buy]').forEach(b=>{ b.onclick=async ()=>{
      const s=skinOf(b.dataset.buy);
      if(s.unlock.kind!=='coins' || stats.coins < s.unlock.cost) return;
      stats.coins -= s.unlock.cost;
      stats.owned = stats.owned||[]; stats.owned.push(s.id);
      custom.skin = s.id;
      SFX.win();
      await saveProfile();
      selSkin = s.id;
      setPreview(null,null); buildShopPane(); refreshCoinChips();
    }; });
  }
