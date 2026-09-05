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
  function sendTumbling(r, force, dirX, dirY){
    if(r.invuln > 0 || r.falling || r.finished || r.lavaOut) return;
    r.__tumbles = (r.__tumbles||0) + 1;      // the acceptance run counts these
    const f = clamp(force * hazardK(), 3, 14);
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
  const ICE_FR = 0.845;
  const V_MAX = ACCEL*GROUND_FR/(1-GROUND_FR);          // ~4.6 a frame, flat ground
  // Nobody goes faster than this, ever: not off a boost pad, not in a draft,
  // not out of a cannon. Boosts keep their multipliers underneath the cap.
  // The cap follows the surface: ice has its own, higher, terminal speed (7.1
  // a frame against 4.6), and a flat 6.2 cap would have pinned all of Super
  // Slide to one speed, so the gradient there stopped paying (check L).
  const V_CAP = V_MAX*1.35;
  const V_CAP_ICE = ACCEL*ICE_FR/(1-ICE_FR)*1.35;
  function speedCap(){ return (currentMap && currentMap.slippery) ? V_CAP_ICE : V_CAP; }
  const TURN_RATE_GROUND = 17, TURN_RATE_AIR = 9;   // radians per second
  // How hard a gradient pulls, per frame per unit of sin(slope). At the
  // steepest point of Cannon Climb this is about a fifth of ACCEL.
  // Scaled with ACCEL: at 0.50 against the old 0.68 a hill was worth 15%, and
  // against 1.47 it would be worth 7%.
  const SLOPE_PULL = 1.08;
  const COYOTE_MS = 110;                    // grace after stepping off an edge
  const BUFFER_MS = 150;                    // a jump pressed just early still fires on landing
  const FINISH_ZONE = 300;                  // how far past the line you may wander
  const DIVE_IMPULSE = 6.5, DIVE_PRONE_MS = 380, DIVE_CD_MS = 1600, DIVE_GETUP_MS = 450;

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
    // A committed lunge: you go further than a step, but you are prone at the
    // end of it and slow getting up. At 7.5 / 320 / 900 a dive cycle averaged
    // faster than running, so diving down a straight was the fast way to travel.
    r.vx+=Math.cos(ang)*DIVE_IMPULSE; r.vy+=Math.sin(ang)*DIVE_IMPULSE;
    r.diveT=DIVE_PRONE_MS; r.diveCd=DIVE_CD_MS; r.invuln=420;
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
