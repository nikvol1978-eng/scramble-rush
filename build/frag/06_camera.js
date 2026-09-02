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
    const z0 = trackLength + FINISH_ZONE + 200, zEnd = py - 95;
    const zA = z0 + (zEnd - z0)*s;
    const hA = 300 + (95 - 300)*s;
    // The lead has to stay ahead of the camera the whole way. If the target
    // interpolated independently it would cross the camera mid-flight and the
    // shot would end up pointing straight down.
    const lead = 1000 + (300 - 1000)*s;
    const sway = Math.sin(k*Math.PI*1.8)*70*Math.max(0, 1-k/0.85);

    const b  = clamp((k-0.78)/0.22, 0, 1);
    const bs = b*b*(3-2*b);                       // smoothstep the handover

    const cx = sway + (px - sway)*bs;
    const cy = hA + (95 - hA)*bs;
    const tx = sway*0.3 + (px - sway*0.3)*bs;
    const ty = 20 + (14 - 20)*bs;
    const tz = (zA - lead) + ((py+55) - (zA - lead))*bs;

    camera.position.set(cx, cy, zA);
    camera.lookAt(tx, ty, tz);
    dirLight.position.set(px+220, 420, zA-160); dirLight.target.position.set(px, 0, zA+150);
    sky.position.set(camera.position.x, 0, camera.position.z);
    camPos.x = px; camPos.z = py + 55;             // hand over cleanly
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

    const targetX = toSceneX(p.x);
    const pivotZ = p.y + 55*Math.cos(azim);
    const lerp = snap?1:0.12;
    camPos.x += (targetX-camPos.x)*lerp;
    camPos.z += (pivotZ-camPos.z)*lerp;

    const ox = -radius*Math.cos(elev)*Math.sin(azim);
    const oy =  radius*Math.sin(elev);
    const oz = -radius*Math.cos(elev)*Math.cos(azim);

    let shx=0, shy=0;
    if(camShake>0 && settings.shake){ shx=rand(-1,1)*camShake; shy=rand(-1,1)*camShake; camShake*= Math.pow(0.02, dt); if(camShake<0.2) camShake=0; }

    camera.position.set(camPos.x+ox+shx, oy+shy, camPos.z+oz);
    camera.lookAt(camPos.x, 14, camPos.z);
    dirLight.position.set(targetX+220, 420, p.y-160); dirLight.target.position.set(targetX, 0, p.y+150);
    sky.position.set(camera.position.x, 0, camera.position.z);
  }
