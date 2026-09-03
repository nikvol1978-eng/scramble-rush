# Scramble Rush v19 — brief for Claude Code

Goal: make the game *feel* like Fall Guys / Stumble Guys with a small set of maps that
actually work, instead of 24 rounds where half are harmless or broken. Cut maps first,
then fix movement, then bots, then obstacles, then polish. Work in
`scramble-rush-18.0.html` → cut `scramble-rush-19.0.html` with `build/build.py`, and
re-run `build/mkdebug.py` + `window.__checks.run()` after each step.

Everything below comes from an automated play-through of v18: every map was run with a
"player" that only holds forward and mashes jump. That player finished 1st or top‑3 on
8 of 13 race maps, and on 6 maps nobody in the field of 16 fell even once.

---

## 1. Cut the map list down to this

Keep and rebuild these (everything else: delete from `MAPS` / `MINIGAMES`, and delete
their obstacle branches in `genCourse` if nothing else uses them):

| Keep | Type | Why |
|---|---|---|
| Sunny Sprint (`sunny`) | race | flagship course, most obstacle variety |
| Cannon Climb (`cannonc`) | race | climbing path + cannons, distinct |
| Super Slide (`slide`) | race | descending, slippery, boost pads, distinct |
| Neon Nightrun (`neon`) | race | spin bars + lasers, distinct look |
| Lava Rise (`lava`) | minigame | the only minigame that eliminated the test player |
| Tile Trap (`tiles`) | knockout | works, just too short |
| Door Dash (`doors`) | minigame | classic, works once bots understand doors |
| Closing Circle (`shrink`) | final | the only arena round that reliably ends |

Remove: Honey Hive, Candy Canyon, Bumper Bash, Jungle Jam, Frostbite Peak, Cloud Nine,
Cyber Grid, Orbit Drop, Beach Break, Boulder Barrage, Block Dash, Honey Drop, Gem Grab,
Carousel, Laser Tracer, Laser Dodge.

Reasons, in case any get reconsidered later:
- Cloud Nine / Cyber Grid / Orbit Drop / Beach Break all use the `mover` gap and every
  one of them ends with the whole field in a fall–respawn loop (737–832 total falls per
  round, best bot reaches 35–75% of the track).
- Honey Hive / Candy Canyon / Bumper Bash / Jungle Jam: zero falls across 16 racers,
  nothing on them can hurt you, and Jungle Jam is a bare green plane.
- Laser Dodge / Laser Tracer: zero eliminations.
- Carousel (the current final): 78 s with 16 of 16 still standing — the final cannot end.
- Honey Drop / Gem Grab finished in 18 s; Super Slide's `slide` path is fine but the
  round also finished in 18 s (see pacing).

Set `ROUNDS = 3` flow to: round 1 = race, round 2 = race or minigame (50/50),
round 3 = Closing Circle final. `MINIGAME_CHANCE` becomes `{1:0, 2:0.5}` and the
`finals` pick is always `shrink`. Remove `final:true` from Carousel when deleting it.

---

## 2. Movement — make it feel like Fall Guys

Current constants (`ACCEL = 0.68`, ground friction `0.885`/frame, air `0.955`,
ice `0.955`, `JUMP_V = 7.4`, `GRAV_UP = 0.36`, `GRAV_DOWN = 0.68`, dive impulse `5.4`,
`diveT = 260`, `diveCd = 1250`) produce a bean that takes ~0.3 s to get going, slides
for ~0.3 s after you let go, snaps its facing instantly, and turns 90° with a big skid.
That is the "weird" feel. Change to:

1. **Grounded control is tight, momentum is light.**
   - Ground friction `0.885` → `0.80` (stops in ~6 frames instead of ~15).
   - `ACCEL` `0.68` → `1.05` so top speed stays about the same
     (`v_max = ACCEL / (1 - friction)`; keep it near the current ≈5.9 units/frame).
   - Ice: `0.955` → `0.93`. Ice should be noticeably slippery, not skating on glass.
   - Air friction stays `0.955`, air control `0.50` → `0.65`.
2. **Facing turns smoothly.** Replace `p.facing = Math.atan2(iy, ix)` with a lerp
   toward the target angle at ~14 rad/s on the ground, ~8 rad/s in the air, and make
   the mesh yaw follow `facing` (not the velocity vector).
3. **Jump: snappier arc.** `JUMP_V 7.4 → 8.2`, `GRAV_UP 0.36 → 0.48`,
   `GRAV_DOWN 0.68 → 0.78`. Keep `APEX_GRAV`, coyote (110 ms) and buffer (150 ms).
   Total air time should land around 0.55–0.6 s for a full‑height jump.
4. **Dive is a real tool.** Impulse `5.4 → 7.5`, `diveT 260 → 320`, cooldown
   `1250 → 900`. Diving off a ledge or ramp should carry you *further* than a jump but
   leave you prone for the `getUpT`. Diving into another racer should shove them
   (use the existing collision impulse × 1.6).
5. **Steering is always screen‑relative and never inverted.** Remove the
   `ix = -ix` hack in `computeInputVec` and fix the sign at the sim→scene transform
   (`toSceneX`) instead. Keep `camRelative`, but auto‑centre the camera behind the
   bean after 0.6 s without look input (`CAM_RECENTRE_DELAY 1.0 → 0.6`) so "forward"
   is forward again quickly. Free‑orbit mouse look should be *off* by default
   (`mouseLook:false`, `freeLook:true`) — Fall Guys players expect the camera to
   follow, not to have to steer it.
6. **Camera.** `CAM_BACK 158 / CAM_UP 100` sits too low and too close for obstacle
   read‑ahead: obstacles appear ~1.5 s before you hit them. Use `CAM_BACK 190`,
   `CAM_UP 135`, tilt the look‑at point ~60 units ahead of the bean, and widen FOV
   `58 → 64`. Keep the occluder‑fade and drop auto‑tilt.
7. **Hit reactions.** Being hit by any moving obstacle should always call
   `sendTumbling` with force ≥ 6 (right now spinbars, pushers and lasers only set a
   250 ms `stumbleT`). Getting hit must cost roughly 1–1.5 s and 2–3 body lengths.

Add a check in `build/checks.js`: a full‑speed bean releasing the stick must stop
within 10 frames; a 180° turn at full speed must complete within 12 frames; a jump
must be airborne 30–38 frames.

---

## 3. Bots — this is why you win by holding W

- Bot acceleration is `0.52 * speed(0.84–1.04)` vs the player's `0.68`, i.e. 20–35%
  slower. Give bots the same `ACCEL` as the player with `speed` in `0.93–1.03`, and
  add 2–3 "elite" bots per match at `1.00–1.05`.
- `updateBotAI` only handles `pillars`, `hammer/pusher`, `spinbar`, `pit`, `narrow`.
  It has **no branch** for `cannon`, `ramp`, `gate`, `fork`, `shortcut`, `crumble`,
  `boost`, `beam/laserbar`, `pendulum`, `bumper`, `doors`, `tilefield`, `ring`.
  Observed results: five bots stood behind the Sunny Sprint gate at y≈504 for the
  entire round; 110 bot falls at one crumble bridge; nobody passed the first row on
  Door Dash. Add a case for every obstacle type the kept maps use:
  - `gate`: aim at the nearest open door slot, queue behind others, jump when stuck.
  - `fork` / `shortcut`: 35% take the raised lane, the rest the clear lane.
  - `crumble`: cross straight, prefer slabs that are not `touched`, jump the last row.
  - `cannon`: wait for `warn` to clear on the lane ahead, then sprint.
  - `boost`: line up on the pad.
  - `beam/laserbar`: jump low beams, dive high beams (use the same test the player uses).
  - `doors`: pick a random door in the row; on hitting a solid one, side‑step to the
    nearest unbroken neighbour; once any door is `broken`, everyone routes to it.
  - `tilefield`: prefer tiles with `fuse < 0`, keep moving, never reverse.
  - `ring` (Closing Circle): stay inside `r - 60`, jostle toward the centre.
- Bots must never fall more than 3 times at the same `y` ±150. After the third fall,
  force `targetX` to the safe lane and hold throttle at 0.6 until past `o.y1`.
- Bots should use `doDive` on straights (existing 0.3% roll is fine) and, importantly,
  **bump into the player**: turn the "friendly collisions never knock you over" rule
  into "collisions shove ~1 body length" so the pack feels physical.

Check: with the player idle at the start line, at least 10 of 15 bots must finish every
kept race map within the time limit, and no bot may exceed 5 falls per round.

---

## 4. Courses — density and danger

- `TRACK_W = 760` with `RADIUS = 17` is ~22 bean‑widths wide; it feels empty.
  Set `TRACK_W = 520` and re‑derive `LANES = [-200,-100,0,100,200]`.
- Obstacle gap `rand(110,190)` → `rand(60,120)`, and every course must contain at
  least one **combined** obstacle: hammers over a `narrow`, spinbar on a `crumble`,
  pillars inside a `gate`.
- Every kept race map needs at least two places where you can **fall off**: open
  sides (no wall) on the `narrow`, `crumble`, `ramp` and `shortcut` sections.
  Falling respawns you at the last checkpoint with a 1.5 s penalty.
- Round length: `total` for round 1 `9500 → 7000`, round 2 `8000 → 6000`. Time limits
  `80/70/62 → 60/55/50`. Tile Trap `fuseTime 1.1 → 1.6` and grid depth 4600 → 6500 so
  it lasts 40–60 s instead of 24 s.
- Closing Circle final: `shrink 34 → 26`, add two `spinbar`s inside the ring after
  15 s, and end the round the moment one racer is left (currently it uses the round‑2
  cut count).
- Door Dash: 3 rows, each with 2 fake doors out of 6 (currently 1), and make a broken
  door visibly explode (existing `spawnBurst3D`) so the crowd sees where to go.
- Keep the `mover` obstacle code but don't use it on any kept map until the bots can
  cross it.

---

## 5. Visual polish (cheap, high impact)

- Ground checkerboard moirés badly at a distance (Cannon Climb, Sunny Sprint, Super
  Slide). Enable mipmaps + `anisotropy = renderer.capabilities.getMaxAnisotropy()`
  on the ground texture, and double the check size.
- Obstacles must contrast with the floor: give every obstacle mesh a saturated accent
  from `currentMap.accent` with a dark rim, never the ground colour.
- Delete the floating spheres / rings in the sky. Replace with ground‑level props per
  map: crowd stands with waving beans on the side walls, flags at the finish, spotlights
  on Neon, cannon towers on Cannon Climb.
- Finish line: a proper arch with a "FINISH" banner and confetti burst.
- Bug: the "+25 ROUND 1 survived" toast stays visible into the next round's map intro
  — hide `rewardToast` in `startRound`.
- Countdown: bigger, with a punch‑in scale animation and a "GO!" sound.

---

## 6. Acceptance test (add to `build/checks.js`)

For each kept map, run 60 s with the hold‑forward + spam‑jump player:

- Player rank must **not** be 1st on any race map (bots as fast as the player).
- Player must fall or get tumbled at least twice on every race map.
- ≥ 10 bots finish, no bot exceeds 5 falls, no bot stationary for > 4 s outside a gate.
- Every minigame/final ends between 40 s and the time limit, never in under 30 s.
- Movement: stop within 10 frames, 180° turn within 12 frames, jump air‑time 30–38 frames.

Do not cut a v19 release until all of these pass.
