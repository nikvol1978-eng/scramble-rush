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
  const TUMBLE_GETUP_MS = 240, GETUP_INVULN_MS = 850;
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
    r.tumbleT   = (620 + f*70) / eventSpeed();
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
  const JUMP_V = 8.2;
  // Tight on the ground with light momentum: friction was 0.885, which took
  // fifteen frames to stop and made the bean feel like it was on a trolley.
  // ACCEL rises to match so top speed lands in the same place.
  // Friction is applied after acceleration, so top speed is A*fr/(1-fr), not
  // A/(1-fr): at 1.25 the bean topped out 15% slower than v18 did.
  // v20: 1.47 gave 5.2 a frame, too quick for the obstacle density. 1.30 puts
  // top speed at 4.6; the friction stays where it is so the stop and turn feel
  // of v19 (checks S, U, V, W) is untouched.
  const ACCEL = 1.30;
  const GROUND_FR = 0.78;
  // A bean in the air used to keep nearly all of its speed (0.955 a frame)
  // while one on the ground lost a fifth, so bunny-hopping was free speed.
  // Air friction now sits close enough to ground that a jump never gains.
  const AIR_FR = 0.84;
  // Ice keeps what you give it, and gives little back: the drive is scaled so
  // the top speed lands where it did -- this is a longer glide, not a faster
  // map -- and the lateral share is what your boots manage across your own
  // momentum. The functions that use these are below, with the reasoning.
  const ICE_FR = 0.94, ICE_DRIVE = 0.39, ICE_LATERAL = 0.34;
  const V_MAX = ACCEL*GROUND_FR/(1-GROUND_FR);          // ~4.6 a frame, flat ground
  // Nobody goes faster than this, ever: not off a boost pad, not in a draft,
  // not out of a cannon. Boosts keep their multipliers underneath the cap.
  // The cap follows the surface: ice has its own, higher, terminal speed (7.1
  // a frame against 4.6), and a flat 6.2 cap would have pinned all of Super
  // Slide to one speed, so the gradient there stopped paying (check L).
  const V_CAP = V_MAX*1.35;
  const V_CAP_ICE = ACCEL*ICE_DRIVE*ICE_FR/(1-ICE_FR)*1.35;
  function speedCap(){ return (currentMap && currentMap.slippery) ? V_CAP_ICE : V_CAP; }
  const TURN_RATE_GROUND = 17, TURN_RATE_AIR = 9;   // radians per second
  // How hard a gradient pulls, per frame per unit of sin(slope). At the
  // steepest point of Cannon Climb this is about a fifth of ACCEL.
  // Scaled with ACCEL: at 0.50 against the old 0.68 a hill was worth 15%, and
  // against 1.47 it would be worth 7%.
  const SLOPE_PULL = 1.08;
  // A gradient's impulse arrives every frame and friction takes a share of it
  // back, so the speed a hill is worth is pull/(1-friction). Ice keeps sixteen
  // times what it is given where dry ground keeps four and a half, and left
  // unscaled the same descent handed Super Slide 31% more top speed than v21.
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
  const DIVE_IMPULSE = 6.1, DIVE_PRONE_MS = 380, DIVE_CD_MS = 1400, DIVE_GETUP_MS = 340;
  const DIVE_CLEAN_SPEED = 2.6, DIVE_CLEAN_GETUP = 0.75;
  function diveGetUp(r){
    return Math.hypot(r.vx, r.vy) > DIVE_CLEAN_SPEED ? DIVE_GETUP_MS*DIVE_CLEAN_GETUP : DIVE_GETUP_MS;
  }

  // ---- ice ----------------------------------------------------------------
  // A slippery map used to differ from dry ground in exactly one number: the
  // friction, 0.845 against 0.78. That is a higher top speed, not a slide --
  // measured, Super Slide coasted for 0.32s where Sunny Sprint coasted for
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

  function doJump(r){
    if(r.falling||r.stumbleT>0||r.diveT>0||r.getUpT>0) return false;
    const grounded = r.h<=0 || (r.coyote||0)>0;
    if(!grounded) return false;
    r.vh=JUMP_V; r.h=Math.max(r.h,0.01); r.coyote=0; r.jumpCut=false; r.squash=0; r.landT=0; r.stretchT=STRETCH_MS;
    if(r.isPlayer) SFX.jump();
    return true;
  }
  function doDive(r){
    if(r.finished||r.falling||r.diveCd>0||r.stumbleT>0||r.getUpT>0) return false;
    const ang=r.facing||Math.PI/2;
    // A committed lunge: you go further than a step, but you are prone at the
    // end of it and slow getting up. At 7.5 / 320 / 900 a dive cycle averaged
    // faster than running, so diving down a straight was the fast way to travel.
    r.vx+=Math.cos(ang)*DIVE_IMPULSE; r.vy+=Math.sin(ang)*DIVE_IMPULSE;
    r.diveT=DIVE_PRONE_MS; r.diveCd=DIVE_CD_MS;
    // through the prone slide and back onto your feet, with a little over
    r.invuln=DIVE_PRONE_MS + DIVE_GETUP_MS + 140;
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
