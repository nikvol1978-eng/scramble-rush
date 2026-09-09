  // ============================================================
  // ACTIONS: jump / dive
  // ============================================================
  const GRAV_UP = 0.45, GRAV_DOWN = 0.78;   // floaty rise, snappy fall
  const APEX_GRAV = 1.45;
  // Some maps run at a fraction of normal gravity. The jump impulse is unchanged,
  // so you simply go higher and hang longer -- which is the whole point of Orbit Drop.
  function gravK(){ return (currentMap && currentMap.lowGrav) || 1; }

  // Getting clobbered by something big should look like it. A tumble takes the
  // controls away, spins the racer end over end, and hands off to the get-up.
  // Slippery maps hit differently: you cannot correct a stumble on ice, so the
  // same force costs far more there. Ice maps scale it down on their own dial.
  function hazardK(){ return (currentMap && currentMap.hazardScale) || 1; }
  // How long you are helpless, and how long you are left alone afterwards.
  // v22: a racer caught by a spin bar was down 81% of the next twelve seconds
  // and could be pinned for four and a half unbroken -- and during a FRENZY,
  // with the course running half again as fast, ninety-one percent and nearly
  // seven seconds. Nothing granted a moment's grace on standing up, so the
  // same bar came round and took you again before you could take a step. Two
  // rules fix it: getting up makes you briefly untouchable, and a frenzy
  // shortens the tumble in proportion to how much sooner the hazard returns.
  // v24 §2.6: the ragdoll runs 0.6s for a hit that barely caught you and 1.0s
  // for one that caught you square, and it takes 0.4s to get back up rather
  // than 0.24s. Being floored should cost something; being floored should also
  // be over quickly enough that you are still in the race.
  const TUMBLE_GETUP_MS = 400, GETUP_INVULN_MS = 850;
  const TUMBLE_MIN_MS = 600, TUMBLE_MAX_MS = 1000;
  function sendTumbling(r, force, dirX, dirY){
    if(r.invuln > 0 || r.falling || r.finished || r.lavaOut) return;
    // Already on the floor. Without this a hazard that caught you again while
    // you were still rolling reset the whole tumble, and a spin bar could hold
    // a racer down for four unbroken seconds -- the i-frames on standing up
    // never arrived, because standing up never happened. You cannot be knocked
    // over twice.
    if(r.tumbleT > 0) return;
    r.__tumbles = (r.__tumbles||0) + 1;      // the acceptance run counts these
    const f = clamp(force * hazardK(), 3, 14);
    r.tumbleT   = (TUMBLE_MIN_MS + (f-3)/11*(TUMBLE_MAX_MS-TUMBLE_MIN_MS)) / eventSpeed();
    r.tumbleAng = r.tumbleAng || 0;
    r.tumbleSpin = (5.5 + f*0.55) * (Math.random()<0.5 ? -1 : 1);
    r.tumbleRoll = Math.random()<0.45;          // over the shoulder, or head over heels
    r.stumbleT  = 0;                            // the tumble replaces the wobble
    r.squash    = 1;
    r.vh = Math.max(r.vh, 2.4 + f*0.28);
    if(r.h <= 0) r.h = 0.01;
    if(dirX || dirY){ r.vx += (dirX||0)*f*0.55; r.vy += (dirY||0)*f*0.55; }
    if(r.isPlayer){ SFX.fall(); camShake = Math.max(camShake, 5 + f*0.4); }
  }
  // v24 §2.6: knockback is physical. What throws you is the speed the hazard
  // closes on you at, resolved onto the direction it is about to send you --
  // which is hazardSpeed x cos(contact angle), with the angle falling out of
  // the arithmetic rather than being measured separately. Standing square in
  // front of a sweeping bar is the worst place to be, running with it takes
  // some of the sting out, and a clip on the way past barely turns you round.
  // Every hazard speed handed in here is in units a frame, like a racer's.
  const HAZARD_K = 0.85, HAZARD_MIN = 2.4;
  function hazardHit(r, hvx, hvy, nx, ny){
    const rel = (hvx - r.vx)*nx + (hvy - r.vy)*ny;
    const imp = Math.max(HAZARD_MIN, rel*HAZARD_K);
    sendTumbling(r, imp, nx, ny);
    if(r.isPlayer){ SFX.hit(); camShake = Math.max(camShake, 4 + imp*0.45); }
    return imp;
  }                   // extra pull through the top of the arc — reads far better than symmetric
  const JUMP_V = 8.2;
  // ---- momentum ----------------------------------------------------------
  // v24 §2.1: momentum carries. Ground friction 0.78 -> 0.84, so letting go at
  // full tilt coasts about a fifth of a second rather than an eighth.
  //
  // Top speed must not move, and three constants are solved from the friction
  // rather than authored, so that it cannot. Friction is applied after
  // acceleration, so top speed is A*fr/(1-fr), not A/(1-fr) -- the version
  // that missed that topped out 15% slow. Write down the speed we want and let
  // the acceleration follow it; then a later friction change is one edit
  // rather than four, and none of them can be forgotten.
  const GROUND_FR = 0.84;
  const V_MAX = 4.609;                            // frames per unit, flat dry ground
  const ACCEL = V_MAX*(1-GROUND_FR)/GROUND_FR;    // 0.878 at 0.84, was 1.30 at 0.78
  // Every sideways impulse in the game -- a bot's steering, a bumper, a
  // slipstream -- buys speed of impulse/(1-fr), so raising the friction makes
  // all of them bigger without anyone touching them. This is the factor that
  // puts them back where they were.
  const DRY_LATERAL_K = (1-GROUND_FR)/0.22;
  // A bean in the air used to keep nearly all of its speed (0.955 a frame)
  // while one on the ground lost a fifth, so bunny-hopping was free speed.
  // Air friction now sits close enough to ground that a jump never gains.
  const AIR_FR = 0.84;
  // Ice keeps what you give it, and gives little back: the drive is scaled so
  // the top speed lands where it did -- this is a longer glide, not a faster
  // map -- and the lateral share is what your boots manage across your own
  // momentum. The functions that use these are below, with the reasoning.
  // ICE_DRIVE is solved the same way the dry acceleration is: from the top
  // speed ice is meant to reach. It was 0.39 against ACCEL 1.30; the dry
  // friction changing must not move a slippery map's pace, and this is what
  // stops it.
  const ICE_FR = 0.94, ICE_LATERAL = 0.34;
  const V_MAX_ICE = 7.94;                                 // ice tops out here, unchanged
  const ICE_DRIVE = V_MAX_ICE*(1-ICE_FR)/(ICE_FR*ACCEL);  // 0.577 at ACCEL 0.878
  // Nobody goes faster than this, ever: not off a boost pad, not in a draft,
  // not out of a cannon. Boosts keep their multipliers underneath the cap.
  // The cap follows the surface: ice has its own, higher, terminal speed (7.1
  // a frame against 4.6), and a flat 6.2 cap would have pinned all of Super
  // Slide to one speed, so the gradient there stopped paying (check L).
  // v24 §2.4 widened this from 1.35: an air dive is meant to be worth 45% and
  // a 1.35 ceiling silently cut it to 35%. Nothing else in the game reaches
  // it -- boosts and cannons were already under 1.35.
  const V_CAP = V_MAX*1.50;
  const V_CAP_ICE = V_MAX_ICE*1.35;
  function speedCap(){ return (currentMap && currentMap.slippery) ? V_CAP_ICE : V_CAP; }
  const TURN_RATE_GROUND = 17, TURN_RATE_AIR = 9;   // radians per second
  // How hard a gradient pulls, per frame per unit of sin(slope). At the
  // steepest point of Boom Peak this is about a fifth of ACCEL.
  // Scaled with ACCEL: at 0.50 against the old 0.68 a hill was worth 15%, and
  // against 1.47 it would be worth 7%.
  // A hill is worth pull/(1-fr), so v24 writes down the speed it should be
  // worth rather than the impulse -- the same reason ACCEL is written down
  // that way. At the old 1.08 against friction 0.78 that was 4.909, and it
  // stays 4.909, so raising the friction does not quietly make hills steeper.
  const SLOPE_LIFT = 4.909;
  const SLOPE_PULL = SLOPE_LIFT*(1-GROUND_FR);
  // A gradient's impulse arrives every frame and friction takes a share of it
  // back, so the speed a hill is worth is pull/(1-friction). Ice keeps sixteen
  // times what it is given where dry ground keeps four and a half, and left
  // unscaled the same descent handed Splash Slide 31% more top speed than v21.
  // It is scaled by the same figure the drive is, not by the friction: that
  // keeps a hill worth the same share of your top speed as it is on dry
  // ground, which is what check L measures. Scaling it by the friction instead
  // made the drop worth 4% where it had been worth 7%.
  function slopePull(){ return SLOPE_PULL * iceDriveK(); }
  // How long you stand still after a respawn before the controls answer. Long
  // enough to see where you have been put and what is coming; short enough not
  // to feel like a penalty on top of the fall.
  const RESPAWN_FREEZE_S = 0.8;
  const COYOTE_MS = 110;                    // grace after stepping off an edge
  const BUFFER_MS = 150;                    // a jump pressed just early still fires on landing
  const FINISH_ZONE = 300;                  // how far past the line you may wander
  // A dive used to be a straight loss: measured over three seconds on the flat
  // it covered 12% LESS ground than simply running, and left you with reduced
  // or no control for 86 of those 180 frames. It still must never beat running
  // -- check 8 holds that line -- but it now buys something running cannot:
  // the whole dive, from the moment you leave your feet to the moment you are
  // back on them, is untouchable, so a dive is how you go through a hammer
  // rather than around it. Landing it clean gets you up faster than flopping.
  //
  // v24 §2.4 splits the dive in two. On the ground it is a shorter lunge than
  // it was (5.0 against 6.1). In the air it is the signature move: a jump
  // chained into a dive is the only way across the widest gaps, and it is what
  // the rest of the movement model is built around.
  //
  // §2.5 shrinks the invulnerability to the airborne part. You are untouchable
  // going through the hammer and vulnerable the moment you land, which is what
  // stops a dive being a free pass through anything at all.
  const DIVE_IMPULSE = 5.0, DIVE_PRONE_MS = 380, DIVE_CD_MS = 1400;
  // Both dives end the same way: flat on your face, and half a second before
  // you can run or jump again. The clean-landing discount is gone -- it made
  // a fast dive cheaper than a slow one, which is backwards.
  const DIVE_GETUP_MS = 500;
  // The air dive turns your whole horizontal velocity to face you and
  // multiplies it, rather than adding an impulse to it: the reach of the move
  // should not depend on how much of your run-up you had left. The floor stops
  // a dive from a standstill being worthless.
  const AIR_DIVE_BOOST = 1.45, AIR_DIVE_KICK = 1.6, AIR_DIVE_FLOOR = 0.5;
  function diveGetUp(r){ return DIVE_GETUP_MS; }

  // ---- ice ----------------------------------------------------------------
  // A slippery map used to differ from dry ground in exactly one number: the
  // friction, 0.845 against 0.78. That is a higher top speed, not a slide --
  // measured, Splash Slide coasted for 0.32s where Sunny Sprint coasted for
  // 0.60s, and you could reverse from full speed in five frames. Sliding is
  // not how fast you go, it is your boots not biting sideways. So on ice the
  // friction goes right up and the push you get is scaled by how much it
  // agrees with the way you are already travelling: shoving forward is nearly
  // free, turning is slow, and stopping is a negotiation.
  function iceDriveK(){ return (currentMap && currentMap.slippery) ? ICE_DRIVE : 1; }
  function iceSteerK(){ return (currentMap && currentMap.slippery) ? ICE_DRIVE*ICE_LATERAL : 1; }
  // The player pushes in a direction rather than along a lane, so their scale
  // is the blend between the two: full with their momentum, lateral against it.
  function iceBlend(r, ax, ay){
    if(!(currentMap && currentMap.slippery)) return 1;
    const s = Math.hypot(r.vx, r.vy), a = Math.hypot(ax, ay);
    if(s < 0.8 || a < 1e-6) return ICE_DRIVE;        // standing still, boots bite
    const cos = (ax*r.vx + ay*r.vy)/(a*s);
    return ICE_DRIVE * (ICE_LATERAL + (1-ICE_LATERAL)*Math.max(0, cos));
  }
  // squash-and-stretch keyframes: how long the landing squash and the take-off stretch hold
  const LAND_MS = 90, STRETCH_MS = 60;
  // ---- the landing slide -------------------------------------------------
  // v24 §2.2. You do not stop dead where you land. For eight frames after any
  // touchdown the ground is slicker than it is and your boots have rather less
  // to say about where you go. It is short enough that it never costs you a
  // hazard you had read correctly, and long enough that landing has weight.
  const LAND_SLIDE_F = 8, LAND_SLIDE_FR = 0.90, LAND_SLIDE_STEER = 0.6;

  function doJump(r){
    if(r.falling||r.stumbleT>0||r.diveT>0||r.getUpT>0) return false;
    const grounded = r.h<=0 || (r.coyote||0)>0;
    if(!grounded) return false;
    // v24 §2.3: one tap, one arc. There is no jump cut any more -- letting go
    // early used to halve the rise, which makes the height of a jump a thing
    // you have to hold a button correctly to get rather than a thing you can
    // count on. Coyote time and the input buffer stay: those forgive when you
    // pressed, not how long.
    r.vh=JUMP_V; r.h=Math.max(r.h,0.01); r.coyote=0; r.squash=0; r.landT=0; r.stretchT=STRETCH_MS;
    // What you left the ground with. The air dive multiplies this rather than
    // whatever is left of it by the frame you press, so pressing dive late in
    // the arc is a choice about where you land and not a tax on your run-up.
    r.airSpeed0 = Math.hypot(r.vx, r.vy);
    if(r.isPlayer) SFX.jump();
    return true;
  }
  function doDive(r){
    if(r.finished||r.falling||r.diveCd>0||r.stumbleT>0||r.getUpT>0) return false;
    const ang=r.facing||Math.PI/2;
    if(r.h > 0){
      // ---- the air dive. Everything you had, pointed where you are looking
      // and multiplied. Direction is locked until you land: this is a commit,
      // not a steering aid, and being able to curve it in mid-air would make
      // the gap you can cross a matter of wiggling rather than of timing.
      const spd = Math.max(Math.hypot(r.vx, r.vy), r.airSpeed0||0, V_MAX*AIR_DIVE_FLOOR) * AIR_DIVE_BOOST;
      r.vx = Math.cos(ang)*spd; r.vy = Math.sin(ang)*spd;
      r.vh += AIR_DIVE_KICK;
      r.airDive = true;
    } else {
      // A committed lunge: you go further than a step, but you are prone at the
      // end of it and slow getting up. At 7.5 / 320 / 900 a dive cycle averaged
      // faster than running, so diving down a straight was the fast way to travel.
      r.vx+=Math.cos(ang)*DIVE_IMPULSE; r.vy+=Math.sin(ang)*DIVE_IMPULSE;
      r.vh=2.2; r.h=0.01;
    }
    r.diveT=DIVE_PRONE_MS; r.diveCd=DIVE_CD_MS;
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
