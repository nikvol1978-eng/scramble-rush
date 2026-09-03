  // ============================================================
  // ACTIONS: jump / dive
  // ============================================================
  const GRAV_UP = 0.36, GRAV_DOWN = 0.68;   // floaty rise, snappy fall
  const APEX_GRAV = 1.45;
  // Some maps run at a fraction of normal gravity. The jump impulse is unchanged,
  // so you simply go higher and hang longer -- which is the whole point of Orbit Drop.
  function gravK(){ return (currentMap && currentMap.lowGrav) || 1; }

  // Getting clobbered by something big should look like it. A tumble takes the
  // controls away, spins the racer end over end, and hands off to the get-up.
  function sendTumbling(r, force, dirX, dirY){
    if(r.invuln > 0 || r.falling || r.finished || r.lavaOut) return;
    const f = clamp(force, 3, 14);
    r.tumbleT   = 620 + f*70;
    r.tumbleAng = r.tumbleAng || 0;
    r.tumbleSpin = (5.5 + f*0.55) * (Math.random()<0.5 ? -1 : 1);
    r.tumbleRoll = Math.random()<0.45;          // over the shoulder, or head over heels
    r.stumbleT  = 0;                            // the tumble replaces the wobble
    r.squash    = 1;
    r.vh = Math.max(r.vh, 2.4 + f*0.28);
    if(r.h <= 0) r.h = 0.01;
    if(dirX || dirY){ r.vx += (dirX||0)*f*0.55; r.vy += (dirY||0)*f*0.55; }
    if(r.isPlayer){ SFX.fall(); camShake = Math.max(camShake, 5 + f*0.4); }
  }                   // extra pull through the top of the arc — reads far better than symmetric
  const JUMP_V = 7.4;
  const ACCEL = 0.68;
  // How hard a gradient pulls, per frame per unit of sin(slope). At the
  // steepest point of Cannon Climb this is about a fifth of ACCEL.
  const SLOPE_PULL = 0.50;
  const COYOTE_MS = 110;                    // grace after stepping off an edge
  const BUFFER_MS = 150;                    // a jump pressed just early still fires on landing
  const FINISH_ZONE = 300;                  // how far past the line you may wander

  function doJump(r){
    if(r.falling||r.stumbleT>0||r.diveT>0||r.getUpT>0) return false;
    const grounded = r.h<=0 || (r.coyote||0)>0;
    if(!grounded) return false;
    r.vh=JUMP_V; r.h=Math.max(r.h,0.01); r.coyote=0; r.jumpCut=false; r.squash=0;
    if(r.isPlayer) SFX.jump();
    return true;
  }
  function doDive(r){
    if(r.finished||r.falling||r.diveCd>0||r.stumbleT>0||r.getUpT>0) return false;
    const ang=r.facing||Math.PI/2;
    // a committed lunge: you go further than a step, but you are prone at the end of it
    r.vx+=Math.cos(ang)*5.4; r.vy+=Math.sin(ang)*5.4;
    r.diveT=260; r.diveCd=1250; r.invuln=420;
    if(r.h===0){ r.vh=2.2; r.h=0.01; }
    if(r.isPlayer){ SFX.dive(); stats.dives++; }
    return true;
  }
  function tryJump(){
    if(state!=='racing') return;
    if(mp.role==='client'){ if(mp.hostConn&&mp.hostConn.open) mp.hostConn.send({type:'action',action:'jump'}); return; }
    const p=racers.find(r=>r.isPlayer); if(!p) return;
    if(p.finished){ doJump(p); return; }
    if(!doJump(p)) p.jumpBuf = BUFFER_MS;   // remember it and fire on landing
  }
  function tryDive(){
    if(state!=='racing') return;
    if(mp.role==='client'){ if(mp.hostConn&&mp.hostConn.open) mp.hostConn.send({type:'action',action:'dive'}); return; }
    const p=racers.find(r=>r.isPlayer); if(p) doDive(p);
  }
