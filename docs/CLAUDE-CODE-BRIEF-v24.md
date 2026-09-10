# Scramble Rush v24 — play like Stumble Guys

Goal: the *feel* of Stumble Guys. Its movement, its match structure, its kind of
courses, its visual energy. The mechanics of a game are fair to adopt; its
maps, names, characters, logo and art are not. So: match how it plays and how
it reads on screen, build our own courses in the same archetypes, and give
everything our own names and art. Do not reproduce a Stumble Guys map layout,
character or asset, and do not use their map names.

**Naming, do first.** Several of our current names are Stumble Guys map names:
Cannon Climb, Super Slide, Block Dash, Honey Drop, Laser Tracer, and Lava Rise
/ Tile Tumble are one word off Lava Rush / Tile Fall. Rename every round to
something ours (see §4 for the new list) before doing anything else, and grep
the docs, tips and checks for the old names.

Start from `scramble-rush-23.0.html`. Fragments only, never the release. Full
suite and five-seed acceptance after every section, one commit per section,
cut `scramble-rush-24.0.html` at the end. Sections in order.

Reference facts this brief is built on (from the Stumble Guys help centre and
control guides): up to 24 players; three rounds, 24 → 16 → final 8; controls
are move, jump, dive, with a jump chained into a mid-air dive for extra reach;
PC movement is full-speed-or-stopped; momentum carries after you release; you
slide briefly on landing; spinners, bumpers and cannons apply knockback scaled
by their speed and your contact angle; being knocked over is a short ragdoll
with quick recovery; ice lowers friction and slime flows in a direction;
respawn is at the last checkpoint.


## Resume here

*(§5 complete; §4: Hop & Duck, Slime Slope and Comb Collapse in. Wall Rush is next.)*

## How "no gameplay number moved" is proved

A menu or look pass must not change how the game plays. Matching acceptance
medians does **not** prove that and cannot: the medians are a sample over
random layouts, and Sunny Sprint alone has read 17, 14, 12, 13 and 14 home
across five runs of builds that differed only in seed. A run that happens to
match is luck and a run that happens not to is a false alarm.

The standard is structural instead. After the section, run

    git diff HEAD -- build/ | grep '^[-+]' | grep -v '^[-+][-+]' | grep -Ei '<constants>'

over the gameplay constants (ACCEL, GROUND_FR, AIR_FR, ICE_*, SLOPE_*, JUMP_V,
DIVE_*, V_MAX, V_CAP, GRAV*, TURN_RATE*, HAZARD_*, TUMBLE_*, LAND_SLIDE*,
RESPAWN*, COYOTE, BUFFER, halfWidth, HARD_GAP, ISLAND*, power:, speed:, bias,
aiRoute, botCount, CUT_LADDER, FINAL_COUNT, throttle) and show that it is
empty, and show that the changed lines in any gameplay file are only the ones
the section was about. Quote both in the commit. The suite and the acceptance
still have to be green -- they catch what a diff cannot -- but the diff is what
carries the claim.

---

## Open items

**Known miss — check `h` on Splash Slide, about one seed in fifteen.**

The rule is that no racer may fall more than three times at one hazard inside
twenty seconds. Splash Slide reads 3 almost always and 4 occasionally, and the
agreed three-step plan for it has now run its course:

1. Re-measure after §2's collision model. Done: twelve seeds, 3 every time.
   Closed at that point.
2. It reopened when the §4 pit changed that map's layout, so the pit rule's
   waiting logic was extended to channels: a bot that has fallen twice at one
   holds at its mouth until the traffic ahead has cleared, up to four seconds.
   That helped a great deal -- the rate went from about one run in three to
   about one in five, which on four map-seeds a run is roughly one seed in
   fifteen -- but it did not remove it.
3. So it is recorded here, with the numbers, the way v21's three misses are.

Measured on the build at §5.5: five consecutive full runs, one of which read
`slide: a bot fell 4 times at narrow@2054`. The other four read 3 or less on
every map (`narrow@4866`, `narrow@2054`, `crumble@8431` and the disc fields).
Nothing was widened and the cap stays at 3.

What is left is one bot, on ice, at a channel it has already fallen into twice,
being caught by the pack while it crawls. Fixing it properly means either
letting a burned bot stop for longer than four seconds -- which the round timer
cannot afford -- or making the pack go round it, which is a crowd-avoidance
behaviour the bots do not have. Neither belongs in a menu pass.

---

## 1. Match structure — 24 players, 24 → 16 → 8

- Field of **24** (player + 23 bots). Start pad widens to fit three rows of
  eight. `FINAL_COUNT = 8`. Cuts: 24 → 16 after round 1, 16 → 8 after round
  2, final 8 to a winner.
- Round 1 race; round 2 race or survival (50/50); round 3 a **final** from a
  pool of finals (see §4), never the same twice in a row.
- HUD shows `QUALIFIED 9/16` style progress the moment the cut is reached,
  and the qualified-count pill fills in as racers cross.
- Bots at 23 must still cost under 14 ms on Medium: this is where the queued
  **bean rig rewrite** (one skinned mesh per racer) becomes mandatory rather
  than optional. Do it here. Acceptance: draw calls under 300 with 24 racers.

## 2. Movement — the Stumble Guys handling model

Keep our tuned constants as the baseline and change only what differs:

1. **Momentum carries.** Ground friction `0.78 → 0.84`: after release the
   character coasts about 0.3 s instead of 0.17 s. Check S's stop window
   moves from 10 frames to 16–20. Acceleration adjusts so `v_max` is
   unchanged.
2. **Landing slide.** For 8 frames after any landing, friction is `0.90` and
   steering authority is 0.6. You slide a little where you land.
3. **Fixed-height jump.** Remove the jump cut (`jumpCut`). One tap, one arc,
   airborne about 0.6 s. Keep coyote time and input buffering.
4. **Jump → air dive is the signature move.** Pressing dive while airborne
   performs an air dive: +45 % horizontal speed in the facing direction,
   slight upward kick, direction locked until landing, and the landing is a
   belly-flop with a `0.5 s` recovery in which you can neither run nor jump.
   A ground dive is shorter (impulse 5.0) with the same 0.5 s recovery. Dive
   cooldown stays. The air dive must clear gaps a plain jump cannot: add a
   check that a jump clears 190 units and a jump+dive clears 260.
5. **Dive invulnerability shrinks** to the airborne part only; the prone
   slide and recovery can be hit. Check 8 (no free speed) must still pass.
6. **Knockback is physical.** Spinners, bumpers, pushers and cannons apply an
   impulse of `hazardSpeed × k × cos(contactAngle)`, ragdoll for 0.6–1.0 s
   scaled by impulse, recovery 0.4 s. Big hits send you flying; glancing
   hits nudge you. Keep the v22 "cannot be re-hit while down" rule.
7. **Crowd shoving.** Player–player collisions push both apart with
   momentum transfer; a diving racer knocks a standing one over. Check Y
   changes from "never knocks anyone over" to "a dive knocks over, a walk
   only shoves".
8. **Surfaces.** Ice as now. Add **slime**: a surface with a flow direction
   and speed that carries anyone standing on it (a conveyor). Add **bounce
   pads**: a trampoline that launches you to a fixed height on contact.
9. **Checkpoints.** Explicit checkpoint flags every 2–3 sections; respawn at
   the last one crossed (replaces "one section back"). The flag lights up
   when you pass it.
10. **Camera.** Slightly higher and further than now (`CAM_UP +20`,
    `CAM_BACK +15`), mouse orbit optional as today, auto-centre behind the
    course heading as today.

## 3. Look — bright, chunky, low-poly

Stumble Guys reads as saturated flat colour on chunky rounded shapes, with
soft simple lighting and no photoreal fuss. We have the renderer; dial it to
that look rather than the glossy-plastic one:

- Materials: `MeshStandardMaterial`, roughness 0.75, metalness 0, **no
  clearcoat** except on ice and water. Colours fully saturated for hazards
  and pads, pastel for floors (the v23 colour-managed helpers already do
  this; raise floor saturation cap to 0.75).
- Geometry: bevel every box and cylinder (`RoundedBoxGeometry` from
  addons); nothing has a hard edge. Obstacles are oversized and simple:
  fat spinner arms, big round bumpers, thick pillars.
- Lighting: one warm key, sky-coloured hemisphere fill, soft shadows; AO at
  half strength; bloom off except confetti.
- Sky: gradient plus clouds as now, more saturated, with a distant
  low-poly skyline or hills per theme.
- Characters: our own stumbler — a low-poly figure with a big round head,
  short rounded body, simple arms and legs, big eyes, a little wobble in
  the run and a floppy ragdoll. Reuse the v22 proportions. Skins stay ours.
- UI: thicker rounded panels, one display font, big colour-blocked buttons,
  bouncy scale-in on every panel. Round names appear as a big stamped title
  with a one-line objective ("RACE TO THE FINISH!" / "DON'T FALL!" /
  "LAST ONE STANDING WINS!").

## 4. Rounds — Stumble Guys archetypes, our courses

Twelve rounds. Existing courses are re-skinned and renamed, not rebuilt;
new ones use the section system and the shelved obstacle code
(`mover`, `roller`, `spinlaser`, `beam`, `boost`, hex, blockwall, laser).
Every new section gets a bot plan and a check.

| Ours | Type | Archetype (mechanic only) | Built from |
|---|---|---|---|
| **Sunny Sprint** | race | flagship gauntlet: hammers, spinners, gate, disc field | existing |
| **Boom Peak** (was Cannon Climb) | race | uphill under cannon fire | existing |
| **Splash Slide** (was Super Slide) | race | downhill water slide, bars and whirlpools, finish through a hoop | existing + hoop finish |
| **Neon Nightrun** | race | dark course, spinners and lasers | existing |
| **Log Jam** | race | rolling logs with embedded pegs you jump over while the log turns under you | new: `roller` scaled up, walkable, with pegs |
| **Hop & Duck** | race | rows of low bars to jump and high bars to duck (dive) under, faster each row | new: `beam` low/high alternating |
| **Slime Slope** | race | conveyor floor sections flowing against you, bounce pads over gaps | new: slime + bounce pads |
| **Tilt Deck** | race | large platforms that tilt with the weight of racers on them | new: tilting platform section |
| **Comb Collapse** (was Honey Drop) | survival | layered hex tiles that fall after you step | shelved hex, layered like Tile Tumble |
| **Wall Rush** (was Block Dash) | survival | walls with gaps slide across the arena, faster over time | shelved blockwall |
| **Beam Team** (was Laser Tracer) | survival | sweeping laser arms, jump the low ones | shelved spinlaser/laser |
| **Closing Circle** | final | shrinking disc | existing |
| **Last Rung** | final | eight racers on hex tiles over a drop, bottom layer never rebuilds | Comb Collapse tuned as a final |

Finals pool: Closing Circle, Last Rung. Survival pool: Comb Collapse, Wall
Rush, Beam Team. Race pool: the eight races. Round 2 picks race or survival.

Tips and objectives are rewritten for the new names. Nothing in the game,
docs or checks may still say the old names when this section is committed.

## 5. Acceptance for v24

- Full suite green; five-seed acceptance passes on all races with the v23
  per-map targets; the new sections have their own checks.
- 24 racers at under 14 ms on Medium and under 300 draw calls.
- The hold-forward + jump player finishes mid-pack, gets hurt on every race,
  never loops more than 3 falls at one hazard, and never beats a plain
  runner by jump-spam or dive-spam (check 8).
- Jump clears 190, jump+dive clears 260; landing slide measurable; knockback
  scales with contact angle (three-angle probe).
- A grep for the old round names across the repo returns nothing.
- Screenshots: lobby, "NEXT UP" reveal, one chase shot per new round, one
  overhead per new round.

This is at least two sessions. Commit after every section so it can stop
anywhere.
