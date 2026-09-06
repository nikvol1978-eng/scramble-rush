  // ============================================================
  // FREE LOOK — one finger, or one drag of the mouse, or a trackpad swipe
  // ============================================================
  const look = { yaw:0, pitch:0, sinceInput:99 };
  // A fixed frame: back and up, looking slightly down, with the racer in the
  // middle of it. Nothing here changes on its own except distance.
  const CAM_BACK = 190, CAM_UP = 135, CAM_FOCUS = 20, CAM_LEAD = 60;
  // One warm key and a cool hemisphere fill. With ACES tone mapping on, the
  // v19 levels (1.0 / 0.9) blew the floor out to white; these keep the floor a
  // mid tone so the saturated hazards have something to be louder than.
  // v21: physical lights, so these are not the r128 numbers. The key does
  // the shaping and the environment map carries what the fill used to fake.
  const KEY_LIGHT = 1.7, FILL_LIGHT = 0.40;
  const CAM_RECENTRE_DELAY = 0.6;   // hands off this long and the view comes home
  let camZoom = 1, camReach = 0;
  const _camRay = new THREE.Raycaster();
  // Yaw is deliberately unbounded: the camera orbits the racer all the way
  // round. Movement is taken relative to it (see computeInputVec), so holding
  // forward always runs away from the camera whichever way you have swung it.
  const LOOK_PITCH_MIN = -0.55, LOOK_PITCH_MAX = 1.05;
  function lookActiveState(){ return state==='racing'||state==='countdown'||state==='paused'; }
  function nudgeLook(dx, dy){
    if(!settings.freeLook || !lookActiveState()) return;
    const s = settings.lookSens;
    const inv = settings.invertLook ? -1 : 1;
    look.yaw  -= dx*0.0030*s;
    look.pitch = clamp(look.pitch - dy*0.0026*s*inv, LOOK_PITCH_MIN, LOOK_PITCH_MAX);
    look.sinceInput = 0;
  }
  function resetLook(){ look.yaw=0; look.pitch=0; look.sinceInput=99; camZoom=1; camReach=0; }

  canvas.addEventListener('wheel', e=>{
    if(!settings.freeLook || !lookActiveState()) return;
    e.preventDefault();
    nudgeLook(e.deltaX, e.deltaY);          // trackpads send both axes
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
    // 3.4 rather than v6's 2.2 — one short drag should be enough to turn the view
    nudgeLook((e.clientX-dragLast.x)*3.4, (e.clientY-dragLast.y)*3.4);
    dragLast={x:e.clientX,y:e.clientY};
  });
  // With mouse look on, a click captures the pointer and plain mouse movement
  // orbits the camera -- the way it works on a laptop in Stumble Guys. Esc
  // releases it (and pauses). Without it, drag-to-look still works.
  function locked(){ return document.pointerLockElement === canvas; }
  canvas.addEventListener('click', ()=>{
    if(settings.mouseLook && settings.freeLook && state==='racing' && !locked()){
      try{ canvas.requestPointerLock(); }catch(err){}
    }
  });
  document.addEventListener('mousemove', e=>{
    if(!locked()) return;
    nudgeLook(e.movementX*3.0, e.movementY*3.0);
  });
  document.addEventListener('pointerlockchange', ()=>{
    if(!locked()) dragId=null;
  });

  const endDrag = e=>{ if(e.pointerId===dragId){ dragId=null; try{ canvas.releasePointerCapture(e.pointerId); }catch(err){} } };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('contextmenu', e=>{ if(lookActiveState()) e.preventDefault(); });

  // The opening shot: sweep the whole arena from beyond the finish back to the
  // start line, then settle exactly where the chase camera wants to be.
  const FLY_MS = 3800;      // 4200 before the reveal took its 400 ms
  function flyCamera(){
    const p=racers.find(r=>r.isPlayer); if(!p) return;
    const px=toSceneX(p.x), py=p.y;
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
    // where the chase camera wants to be, so the handover is seamless
    const restW = toWorld(p.x, p.y - 95, 95);
    const restT = toWorld(p.x, p.y + 55, 14);

    camera.position.set(camW.x + (restW.x-camW.x)*bs,
                        camW.y + (restW.y-camW.y)*bs,
                        camW.z + (restW.z-camW.z)*bs);
    camera.lookAt(tgtW.x + (restT.x-tgtW.x)*bs,
                  tgtW.y + (restT.y-tgtW.y)*bs,
                  tgtW.z + (restT.z-tgtW.z)*bs);
    dirLight.position.set(camera.position.x+220, camera.position.y+330, camera.position.z-160);
    dirLight.target.position.set(camW.x, camW.y-100, camW.z+150);
    sky.position.set(camera.position.x, 0, camera.position.z);
    const hand = toWorld(p.x, p.y + 55, 0);
    camPos.x = hand.x; camPos.y = hand.y; camPos.z = hand.z;   // hand over cleanly
  }

  function syncCamera(snap, dt){
    // whoever the camera is on: the player, or a survivor while spectating
    const p=camSubject(); if(!p) return;
    if(state==='mapintro'){ dirLight.intensity=KEY_LIGHT; hemi.intensity=FILL_LIGHT; showSky(true); flyCamera(); return; }
    dt = dt||0.016;
    // the profile stage dims these; put them back for play
    dirLight.intensity=KEY_LIGHT; hemi.intensity=FILL_LIGHT; showSky(true);

    // Hands off for a moment and the view eases back behind the way the racer
    // is actually running -- not instantly, and not so slowly you give up and
    // drag it yourself.
    look.sinceInput += dt;
    if(settings.autoCentre && look.sinceInput > CAM_RECENTRE_DELAY){
      // The camera settles back behind the COURSE heading, never behind the
      // direction you happen to be running. Settling behind your velocity while
      // steering is camera-relative made W+A curve into a spiral: the input was
      // rotated by a yaw that was itself chasing the input.
      const want = 0;
      const k = 1 - Math.exp(-2.2*dt);
      let d = want - look.yaw; while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2;
      look.yaw   += d*k;
      look.pitch += (0 - look.pitch)*k;
    }

    // Pull back a little when the pack is on top of you, so you can still see
    // what is coming.
    let crowd = 0;
    for(const o of racers){
      if(o===p || o.falling || o.finished || o.lavaOut) continue;
      if(Math.abs(o.y-p.y) < 230 && Math.abs(o.x-p.x) < 230) crowd++;
    }
    // Distance no longer breathes with speed -- that read as the camera lurching
    // every time you let go of the stick. Only the crowd pulls it back.
    const wantZoom = 1 + clamp(crowd/5, 0, 1)*0.12;
    camZoom += (wantZoom - camZoom) * (snap ? 1 : 1 - Math.exp(-2.4*dt));

    const back = CAM_BACK*settings.camDist*camZoom, height = CAM_UP*settings.camDist*camZoom;
    const radius = Math.hypot(back, height);
    // The frame is fixed. It used to tilt down whenever you were falling, which
    // meant the view swung every time you landed a jump.
    const elev = clamp(Math.atan2(height, back) + look.pitch, -0.20, 1.35);
    const azim = look.yaw;

    // Orbit the racer themselves, at chest height, so they sit in the middle of
    // the frame. The azimuth is relative to the course heading, so "behind"
    // means back along the track rather than back along world Z.
    const base = pathAngle(p.y);
    const footH = (p.floorH||0) + p.h;
    // Aim a little up the course so you can read what is coming, without
    // pushing the bean off the middle of the frame.
    const pivotW = toWorld(p.x, p.y + CAM_LEAD*0.35, footH + CAM_FOCUS);
    // Vertical follow is quick -- a lagging pivot is the same as a tilting
    // camera -- while the horizontal follow keeps a little weight.
    const kXZ = snap ? 1 : 1 - Math.exp(-16*dt);
    const kY  = snap ? 1 : 1 - Math.exp(-36*dt);
    if(camPos.y===undefined || snap){ camPos.y = pivotW.y; }
    camPos.x += (pivotW.x-camPos.x)*kXZ;
    camPos.y += (pivotW.y-camPos.y)*kY;
    camPos.z += (pivotW.z-camPos.z)*kXZ;

    const aw = azim + base;
    const ox = -Math.cos(elev)*Math.sin(aw);
    const oy =  Math.sin(elev);
    const oz = -Math.cos(elev)*Math.cos(aw);

    // Don't let the camera end up on the far side of a wall: cast back along the
    // boom and stop short of whatever it meets. Coming in is instant, going back
    // out is gradual, or it pops the moment you clear a pillar.
    let reach = radius;
    if(fadeables.length){
      _camRay.set(new THREE.Vector3(camPos.x+ox*radius, camPos.y+oy*radius, camPos.z+oz*radius),
                  new THREE.Vector3(-ox, -oy, -oz));
      _camRay.far = radius;
      const hitList = _camRay.intersectObjects(fadeables, false);
      if(hitList.length) reach = clamp(radius - hitList[0].distance - 16, 58, radius);
    }
    if(camReach === 0 || snap) camReach = reach;
    else camReach += (reach - camReach) * (1 - Math.exp(-(reach < camReach ? 60 : 5)*dt));

    let shx=0, shy=0;
    if(camShake>0 && settings.shake){ shx=rand(-1,1)*camShake; shy=rand(-1,1)*camShake; camShake*= Math.pow(0.02, dt); if(camShake<0.2) camShake=0; }

    camera.position.set(camPos.x+ox*camReach+shx, camPos.y+oy*camReach+shy, camPos.z+oz*camReach);
    camera.lookAt(camPos.x, camPos.y, camPos.z);
    updateOcclusion(new THREE.Vector3(camPos.x, camPos.y, camPos.z));
    const lightAt = toWorld(p.x, p.y, 0);
    dirLight.position.set(lightAt.x+220, lightAt.y+420, lightAt.z-160);
    dirLight.target.position.set(lightAt.x, lightAt.y, lightAt.z+150);
    sky.position.set(camera.position.x, 0, camera.position.z);
  }
