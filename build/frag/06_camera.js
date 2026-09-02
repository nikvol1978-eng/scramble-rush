  // ============================================================
  // FREE LOOK — one finger, or one drag of the mouse, or a trackpad swipe
  // ============================================================
  const look = { yaw:0, pitch:0, sinceInput:99 };
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
  function resetLook(){ look.yaw=0; look.pitch=0; look.sinceInput=99; }

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
  const FLY_MS = 4200;
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
    const p=racers.find(r=>r.isPlayer); if(!p) return;
    if(state==='mapintro'){ dirLight.intensity=1.0; hemi.intensity=0.9; sky.visible=true; flyCamera(); return; }
    dt = dt||0.016;
    // the profile stage dims these; put them back for play
    dirLight.intensity=1.0; hemi.intensity=0.9; sky.visible=true;

    // after a couple of seconds hands-off, drift the view back behind the racer
    look.sinceInput += dt;
    if(settings.autoCentre && look.sinceInput > 2.0){
      const k = 1 - Math.pow(0.12, dt);
      let d = -look.yaw; while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2;
      look.yaw   += d*k;
      look.pitch += (0 - look.pitch)*k;
    }

    const back = 150*settings.camDist, height = 95*settings.camDist;
    const radius = Math.hypot(back, height);
    const baseElev = Math.atan2(height, back);
    const elev = clamp(baseElev + look.pitch, -0.20, 1.35);
    const azim = look.yaw;

    // Orbit about a point on the ribbon a little ahead of the racer. The
    // azimuth is taken relative to the course heading, so "behind" means back
    // along the track rather than back along world Z.
    const base = pathAngle(p.y);
    const pivotW = toWorld(p.x, p.y + 55*Math.cos(azim), 0);
    const lerp = snap?1:0.12;
    if(camPos.y===undefined || snap){ camPos.y = pivotW.y; }
    camPos.x += (pivotW.x-camPos.x)*lerp;
    camPos.y += (pivotW.y-camPos.y)*lerp;
    camPos.z += (pivotW.z-camPos.z)*lerp;

    const aw = azim + base;
    const ox = -radius*Math.cos(elev)*Math.sin(aw);
    const oy =  radius*Math.sin(elev);
    const oz = -radius*Math.cos(elev)*Math.cos(aw);

    let shx=0, shy=0;
    if(camShake>0 && settings.shake){ shx=rand(-1,1)*camShake; shy=rand(-1,1)*camShake; camShake*= Math.pow(0.02, dt); if(camShake<0.2) camShake=0; }

    camera.position.set(camPos.x+ox+shx, camPos.y+oy+shy, camPos.z+oz);
    camera.lookAt(camPos.x, camPos.y+14, camPos.z);
    const lightAt = toWorld(p.x, p.y, 0);
    dirLight.position.set(lightAt.x+220, lightAt.y+420, lightAt.z-160);
    dirLight.target.position.set(lightAt.x, lightAt.y, lightAt.z+150);
    sky.position.set(camera.position.x, 0, camera.position.z);
  }
