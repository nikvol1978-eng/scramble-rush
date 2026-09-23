  // ============================================================
  // THIRD-PERSON CHASE / ORBIT CAMERA
  // ============================================================
  // The shape of it: a BOOM of fixed length hanging off a PIVOT that floats
  // above the racer, aimed at a point ABOVE the pivot so the bean sits low in
  // the frame rather than dead centre. Three separate things, and keeping them
  // separate is what makes the rest tractable --
  //
  //   pivot   where the orbit is centred. Follows the racer with smoothing, and
  //           deliberately is NOT the racer's transform: bolting the lens to the
  //           transform hands it every squash, stumble and landing bounce.
  //   boom    yaw and pitch and length. Yaw is the player's, all the way round.
  //   aim     what lookAt is given. Above the pivot, and a little up the course.
  //
  // Every number lives in CAM (see 01_data.js). Nothing here is a literal a
  // reviewer would have to go hunting for.
  //
  // WHAT THE CAMERA MUST NEVER DO, because each of these was a bug once:
  //   * turn the racer. Orbiting is looking, not steering.
  //   * be turned BY the racer. Once the player has moved the view it is theirs
  //     until they hand it back.
  //   * clamp yaw. Looking behind you is a thing you are allowed to do.
  const look = { yaw:0, pitch:CAM.PITCH, sinceInput:99 };
  // One warm key and a cool hemisphere fill. With ACES tone mapping on, the
  // v19 levels (1.0 / 0.9) blew the floor out to white; these keep the floor a
  // mid tone so the saturated hazards have something to be louder than.
  // v21: physical lights, so these are not the r128 numbers. The key does
  // the shaping and the environment map carries what the fill used to fake.
  const KEY_LIGHT = 1.7, FILL_LIGHT = 0.40;
  let camZoom = 1, camReach = 0;
  // Counts down after the spectator changes target (20_spectate.js sets it).
  // While it is running the pivot follows on a much slacker weight, which turns
  // a cut across the whole course into a glide.
  let camSwitchT = 0;
  // Set when the racer the camera is on is TELEPORTED rather than moved: a
  // respawn puts them up to a whole section back in one frame. Followed at
  // FOLLOW_XZ that is eight to eleven frames of the lens hanging where the
  // fall happened with the racer behind it -- on Super Slide, under the
  // course. A teleport is a cut, so the next syncCamera snaps. Consumed there.
  let camCutPending = false;
  function cutCameraTo(r){ if(r && typeof camSubject === 'function' && camSubject() === r) camCutPending = true; }
  const _camRay = new THREE.Raycaster();
  // Scratch. The camera runs every frame; allocating here would hand the GC a
  // steady drip for the whole race.
  const _camFrom = new THREE.Vector3(), _camDir = new THREE.Vector3();
  const _camBack = new THREE.Vector3();
  const _camAim  = new THREE.Vector3(), _camPivot = new THREE.Vector3();

  // 'prematch' is the loader's state (v27 §1). It replaced 'loading', 'mapintro'
  // and 'countdown', and it is a look state for the same reason 'countdown' was:
  // the course is on screen behind the loader and the camera has to be sitting
  // where the race will start, not where the menu left it.
  function lookActiveState(){ return state==='racing'||state==='prematch'||state==='paused'; }

  // pitch is stored as the ABSOLUTE elevation of the boom above horizontal, not
  // as an offset from a resting tilt. An offset needs two clamps that have to be
  // reasoned about together, and the limits in CAM then mean nothing on their
  // own. This way PITCH_MIN and PITCH_MAX are exactly the angles they say.
  function nudgeLook(dx, dy){
    if(!settings.freeLook || !lookActiveState()) return;
    const s = settings.lookSens;
    const inv = settings.invertLook ? -1 : 1;
    look.yaw  -= dx*CAM.MOUSE_YAW*s;                         // NOT clamped. Ever.
    look.pitch = clamp(look.pitch - dy*CAM.MOUSE_PITCH*s*inv, CAM.PITCH_MIN, CAM.PITCH_MAX);
    look.sinceInput = 0;
  }
  function resetLook(){ look.yaw=0; look.pitch=CAM.PITCH; look.sinceInput=99; camZoom=1; camReach=0; }

  // ---- right stick -------------------------------------------------------
  // Polled rather than evented, because an axis being HELD produces no events at
  // all -- it just sits at 0.8 and the view has to keep turning. Scaled by dt so
  // the turn rate is the same whatever the frame budget.
  function padLook(dt){
    if(!settings.freeLook || !lookActiveState()) return;
    if(!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let gx=0, gy=0;
    for(let i=0;i<pads.length;i++){
      const g = pads[i];
      if(!g || !g.connected || !g.axes || g.axes.length < 4) continue;
      // Axes 2 and 3 are the right stick under the Standard Gamepad mapping,
      // which is what every pad a browser recognises reports. Take the LARGEST
      // deflection across pads rather than the first, so a second controller
      // sitting at rest cannot veto the one being held.
      if(Math.abs(g.axes[2]) > Math.abs(gx)) gx = g.axes[2];
      if(Math.abs(g.axes[3]) > Math.abs(gy)) gy = g.axes[3];
    }
    const dz = CAM.PAD_DEAD;
    // Squared response past the dead zone: small corrections stay small, and a
    // stick shoved to the rail still whips round.
    const curve = (v)=>{ const a=Math.abs(v); if(a<dz) return 0; const t=(a-dz)/(1-dz); return (v<0?-1:1)*t*t; };
    const rx = curve(gx), ry = curve(gy);
    if(rx===0 && ry===0) return;
    const s = settings.lookSens * (settings.padSens||1);
    const inv = settings.invertLook ? -1 : 1;
    look.yaw  -= rx*CAM.PAD_YAW*s*dt;                        // still not clamped
    look.pitch = clamp(look.pitch - ry*CAM.PAD_PITCH*s*inv*dt, CAM.PITCH_MIN, CAM.PITCH_MAX);
    look.sinceInput = 0;
  }

  // Shoulder buttons step the spectator target. Edge-detected rather than
  // level-read: a button that is merely still held is not a second press, and
  // without this a resting thumb would riffle through the whole field.
  let padLB = false, padRB = false;
  function padSpectate(){
    if(typeof spectating !== 'function' || !spectating()) return;
    if(!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let lb=false, rb=false;
    for(let i=0;i<pads.length;i++){
      const g = pads[i];
      if(!g || !g.connected || !g.buttons || g.buttons.length < 6) continue;
      if(g.buttons[4] && g.buttons[4].pressed) lb = true;   // LB / L1
      if(g.buttons[5] && g.buttons[5].pressed) rb = true;   // RB / R1
    }
    if(lb && !padLB) cycleSpectate(-1);
    if(rb && !padRB) cycleSpectate(1);
    padLB = lb; padRB = rb;
  }

  canvas.addEventListener('wheel', e=>{
    if(!settings.freeLook || !lookActiveState()) return;
    e.preventDefault();
    nudgeLook(e.deltaX*CAM.WHEEL_GAIN, e.deltaY*CAM.WHEEL_GAIN);   // trackpads send both axes
  }, {passive:false});

  // A single pointer down-and-move turns the view: no click-first, no second button.
  // Touches that begin on the joystick or the action buttons are left to them.
  let dragId=null, dragLast={x:0,y:0};
  function overTouchControls(e){
    const el = e.target;
    return !!(el && el.closest && el.closest('#touchControls'));
  }
  canvas.addEventListener('pointerdown', e=>{
    if(!settings.freeLook || !lookActiveState()) return;
    if(dragId!==null || locked()) return;           // one look-pointer at a time
    if(e.pointerType==='touch' && overTouchControls(e)) return;
    dragId=e.pointerId; dragLast={x:e.clientX,y:e.clientY};
    try{ canvas.setPointerCapture(e.pointerId); }catch(err){}
  });
  canvas.addEventListener('pointermove', e=>{
    if(e.pointerId!==dragId) return;
    nudgeLook((e.clientX-dragLast.x)*CAM.DRAG_GAIN, (e.clientY-dragLast.y)*CAM.DRAG_GAIN);
    dragLast={x:e.clientX,y:e.clientY};
  });
  // With mouse look on, a click captures the pointer and plain mouse movement
  // orbits the camera -- the way it works on a laptop in Stumble Guys. Esc
  // releases it (and pauses). Without it, drag-to-look still works, and that is
  // also what touch uses, so pointer lock is never the only way in and the
  // lobby and the settings pane are never behind it.
  function locked(){ return document.pointerLockElement === canvas; }
  canvas.addEventListener('click', ()=>{
    if(settings.mouseLook && settings.freeLook && state==='racing' && !locked()){
      try{ canvas.requestPointerLock(); }catch(err){}
    }
  });
  document.addEventListener('mousemove', e=>{
    if(!locked()) return;
    nudgeLook(e.movementX*CAM.LOCK_GAIN, e.movementY*CAM.LOCK_GAIN);
  });
  document.addEventListener('pointerlockchange', ()=>{
    if(!locked()) dragId=null;
  });

  const endDrag = e=>{ if(e.pointerId===dragId){ dragId=null; try{ canvas.releasePointerCapture(e.pointerId); }catch(err){} } };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('contextmenu', e=>{ if(lookActiveState()) e.preventDefault(); });

  // ---- the three pieces, as functions -------------------------------------
  // Shared, so the opening fly-in can land on EXACTLY where the chase camera
  // wants to be rather than on a second guess at it that drifts whenever the
  // framing is retuned. That drift is why the handover used to jolt.
  function chasePivot(p, out){
    const w = toWorld(p.x, p.y, (p.floorH||0) + p.h + CAM.TARGET_H);
    out.set(w.x, w.y, w.z); return out;
  }
  // Aim: ahead of the racer so the frame shows what is coming, and up in the air
  // so the bean falls to the lower third instead of sitting in the middle.
  //
  // "AHEAD" MEANS AHEAD OF THE LENS, NOT UP THE COURSE. Leading along the course
  // heading is right only while the camera is behind: swing the orbit ninety
  // degrees and that lead points across the frame instead of into it, dragging
  // the aim sideways by atan(LEAD/boom) -- about twelve degrees at these numbers,
  // which is the racer sliding off centre and forward no longer matching what
  // you are looking at. Leading along the camera's own azimuth keeps the bean
  // centred and the two in agreement at every yaw. Check @ measures it.
  function chaseAim(pivX, pivY, pivZ, aw, out){
    out.set(pivX + Math.sin(aw)*CAM.LEAD, pivY + CAM.AIM_RISE, pivZ + Math.cos(aw)*CAM.LEAD);
    return out;
  }
  // Unit vector from the pivot out along the boom.
  function boomDir(yaw, pitch, base, out){
    const aw = yaw + base, ce = Math.cos(pitch);
    out.set(-ce*Math.sin(aw), Math.sin(pitch), -ce*Math.cos(aw));
    return out;
  }

  // The opening shot: sweep the whole arena from beyond the finish back to the
  // start line, then settle exactly where the chase camera wants to be.
  const FLY_MS = 3800;      // 4200 before the reveal took its 400 ms
  function flyCamera(){
    const p=racers.find(r=>r.isPlayer); if(!p) return;
    const k  = clamp(1 - mapIntroTimer/FLY_MS, 0, 1);
    // travel the length of the arena over the first 80%, then hand over to the chase cam
    const eA = clamp(k/0.80, 0, 1);
    const s  = eA<0.5 ? 2*eA*eA : 1-Math.pow(-2*eA+2,2)/2;
    // Travel in ribbon distance, not world Z, so the shot follows a climb or a
    // descent instead of flying through the hillside.
    const s0 = trackLength + FINISH_ZONE + 200, sEnd = p.y;
    const sA = s0 + (sEnd - s0)*s;
    const hA = 300 + (95 - 300)*s;
    // The lead has to stay ahead of the camera the whole way. If the target
    // interpolated independently it would cross the camera mid-flight and the
    // shot would end up pointing straight down.
    const lead = 1000 + (300 - 1000)*s;
    const sway = Math.sin(k*Math.PI*1.8)*70*Math.max(0, 1-k/0.85);

    const b  = clamp((k-0.78)/0.22, 0, 1);
    const bs = b*b*(3-2*b);                       // smoothstep the handover

    const camW  = toWorld(TRACK_W/2 + sway, sA, hA);
    const tgtW  = toWorld(TRACK_W/2 + sway*0.3, sA - lead, 20);
    // Where the chase camera will be on its first frame, computed the way it
    // computes itself, so the cut is not a cut.
    chasePivot(p, _camPivot);
    chaseAim(_camPivot.x, _camPivot.y, _camPivot.z, pathAngle(p.y), _camAim);
    boomDir(0, CAM.PITCH, pathAngle(p.y), _camDir);
    const reach = CAM.DIST*settings.camDist;
    const restX = _camPivot.x + _camDir.x*reach,
          restY = _camPivot.y + _camDir.y*reach,
          restZ = _camPivot.z + _camDir.z*reach;

    camera.position.set(camW.x + (restX-camW.x)*bs,
                        camW.y + (restY-camW.y)*bs,
                        camW.z + (restZ-camW.z)*bs);
    camera.lookAt(tgtW.x + (_camAim.x-tgtW.x)*bs,
                  tgtW.y + (_camAim.y-tgtW.y)*bs,
                  tgtW.z + (_camAim.z-tgtW.z)*bs);
    dirLight.position.set(camera.position.x+220, camera.position.y+330, camera.position.z-160);
    dirLight.target.position.set(camW.x, camW.y-100, camW.z+150);
    sky.position.set(camera.position.x, 0, camera.position.z);
    camPos.x = _camPivot.x; camPos.y = _camPivot.y; camPos.z = _camPivot.z;  // hand over cleanly
  }

  function syncCamera(snap, dt){
    // whoever the camera is on: the player, or a survivor while spectating
    const p=camSubject(); if(!p) return;
    // The flyover runs behind the loader WHILE THE WORK IS HAPPENING, so the
    // course is a living shot rather than a still. It stops the moment the
    // countdown opens: from then on the camera is on the grid, where the race
    // is about to start, which is what the old 'countdown' state showed and
    // what somebody watching "3, 2, 1" needs to be looking at.
    if(state==='prematch' && pm.phase === 'preparing'){
      dirLight.intensity=KEY_LIGHT; hemi.intensity=FILL_LIGHT; showSky(true); flyCamera(); return;
    }
    dt = dt||0.016;
    if(camCutPending){ camCutPending = false; snap = true; }
    // the profile stage dims these; put them back for play
    dirLight.intensity=KEY_LIGHT; hemi.intensity=FILL_LIGHT; showSky(true);

    padLook(dt);
    padSpectate();
    look.sinceInput += dt;

    // ---- optional, gentle, and never in a hurry ---------------------------
    // Off by default (see settings.autoCentre). When it is on it eases the yaw
    // back behind the COURSE heading -- never behind the racer's own heading.
    // Chasing the racer's heading is what once made W+A spiral: the input was
    // rotated by a yaw that was itself chasing the input. A fixed attractor
    // cannot do that.
    if(settings.autoCentre && look.sinceInput > CAM.RECENTRE_DELAY){
      const k = 1 - Math.exp(-CAM.RECENTRE_RATE*dt);
      let d = 0 - look.yaw; while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2;
      look.yaw   += d*k;
      look.pitch += (CAM.PITCH - look.pitch)*k;
    }

    // Pull back a little when the pack is on top of you, so you can still see
    // what is coming.
    let crowd = 0;
    for(const o of racers){
      if(o===p || o.falling || o.finished || o.lavaOut) continue;
      if(Math.abs(o.y-p.y) < CAM.CROWD_NEAR && Math.abs(o.x-p.x) < CAM.CROWD_NEAR) crowd++;
    }
    // Distance no longer breathes with speed -- that read as the camera lurching
    // every time you let go of the stick. Only the crowd pulls it back.
    const wantZoom = 1 + clamp(crowd/5, 0, 1)*CAM.CROWD_MAX;
    camZoom += (wantZoom - camZoom) * (snap ? 1 : 1 - Math.exp(-2.4*dt));

    const radius = CAM.DIST*settings.camDist*camZoom;
    // Clamp and WRITE BACK, rather than clamping a local copy. If look.pitch is
    // allowed to hold a value the camera will never use -- which it can, because
    // the debug setter and any future caller write it directly -- then the
    // recentre eases from a number that was never real, and the next nudge has
    // to unwind it before the view moves. The stored angle is the angle.
    look.pitch = clamp(look.pitch, CAM.PITCH_MIN, CAM.PITCH_MAX);
    const elev = look.pitch;

    // ---- the pivot follows, with separate weights ------------------------
    chasePivot(p, _camPivot);
    // Vertical is softened while the racer is off the ground, and softened
    // further the higher they get. Following a jump one-for-one pumps the whole
    // frame; not following it at all loses the landing off the bottom. The blend
    // is on HEIGHT rather than on a boolean, so a hop and a fall down a shaft do
    // not get the same treatment.
    const airK = clamp((p.h||0)/CAM.AIR_BLEND_H, 0, 1);
    let followY  = CAM.FOLLOW_Y + (CAM.FOLLOW_Y_AIR - CAM.FOLLOW_Y)*airK;
    let followXZ = CAM.FOLLOW_XZ;
    // Mid hand-over between spectator targets: slacken both axes so the move
    // across the course is a glide rather than a whip-pan.
    if(camSwitchT > 0){
      camSwitchT = Math.max(0, camSwitchT - dt);
      followXZ = Math.min(followXZ, CAM.SWITCH_FOLLOW);
      followY  = Math.min(followY,  CAM.SWITCH_FOLLOW);
    }
    const kXZ = snap ? 1 : 1 - Math.exp(-followXZ*dt);
    const kY  = snap ? 1 : 1 - Math.exp(-followY*dt);
    if(camPos.y===undefined || snap){ camPos.y = _camPivot.y; }
    camPos.x += (_camPivot.x-camPos.x)*kXZ;
    camPos.y += (_camPivot.y-camPos.y)*kY;
    camPos.z += (_camPivot.z-camPos.z)*kXZ;

    // Azimuth is relative to the course heading, so "behind" means back along
    // the track rather than back along world Z.
    boomDir(look.yaw, elev, pathAngle(p.y), _camDir);

    // ---- obstruction ------------------------------------------------------
    // Cast from the far end of the boom back toward the pivot and stop short of
    // whatever it meets. camBlockers is the curated list of solid course
    // geometry (see 17_path.js) -- not decoration, not particles, not racers --
    // so this never fights the bean it is trying to show. Coming in is near
    // instant, going back out is slow, or it pops the moment you clear a pillar.
    let reach = radius;
    if(camBlockers.length){
      _camFrom.set(camPos.x + _camDir.x*radius, camPos.y + _camDir.y*radius, camPos.z + _camDir.z*radius);
      _camBack.set(-_camDir.x, -_camDir.y, -_camDir.z);
      _camRay.set(_camFrom, _camBack);
      _camRay.far = radius;
      const hitList = _camRay.intersectObjects(camBlockers, false);
      // The LAST hit, the one nearest the pivot. hitList[0] is the one nearest
      // the far end, and with two walls on the boom stopping short of that one
      // left the lens between them, looking at the back of the inner one.
      if(hitList.length) reach = clamp(radius - hitList[hitList.length-1].distance - CAM.BLOCK_PAD, CAM.BLOCK_MIN, radius);
    }
    if(camReach === 0 || snap) camReach = reach;
    else camReach += (reach - camReach) * (1 - Math.exp(-(reach < camReach ? CAM.BLOCK_IN : CAM.BLOCK_OUT)*dt));

    let shx=0, shy=0;
    if(camShake>0 && settings.shake){ shx=rand(-1,1)*camShake; shy=rand(-1,1)*camShake; camShake*= Math.pow(0.02, dt); if(camShake<0.2) camShake=0; }

    camera.position.set(camPos.x+_camDir.x*camReach+shx, camPos.y+_camDir.y*camReach+shy, camPos.z+_camDir.z*camReach);
    chaseAim(camPos.x, camPos.y, camPos.z, look.yaw + pathAngle(p.y), _camAim);
    camera.lookAt(_camAim.x, _camAim.y, _camAim.z);
    _camPivot.set(camPos.x, camPos.y, camPos.z);
    updateOcclusion(_camPivot, p);
    const lightAt = toWorld(p.x, p.y, 0);
    dirLight.position.set(lightAt.x+220, lightAt.y+420, lightAt.z-160);
    dirLight.target.position.set(lightAt.x, lightAt.y, lightAt.z+150);
    sky.position.set(camera.position.x, 0, camera.position.z);
  }
