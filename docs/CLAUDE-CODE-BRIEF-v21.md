> **Note, v24:** the round names in this document were changed in v24 for
> the reasons set out in `docs/CLAUDE-CODE-BRIEF-v24.md`. It has been updated
> to use the current names, so what it describes still matches the code.

> **Status: done in v21.** Everything below shipped in the §-commits
> 62193b8 → 26f5636 (6 Sep 2026), plus 0bfb853 for the debug freeze flag used to
> take the acceptance shots. Suite 43/43, five-seed acceptance green, and the
> reference image lives at `docs/reference/v21-course-reference.png`.
>
> **Two targets in §4 were not met, and were reported rather than rewritten:**
>
> - **Draw calls under 300 on the busiest map.** Instancing the crowd stands
>   and their two hundred-odd beans took the worst map from 551 a frame to
>   340–454. What remains is the field itself: sixteen characters of about
>   twenty animated parts each is 300 draws before any course is drawn, so 300
>   for the whole frame needs the character rig rebuilt as one skinned mesh a
>   racer. That is on the v22 list, not in this brief. Check 3c caps at 460 and
>   says why in the source.
> - **Frame time under 12 ms on High at 1280×720.** Measured 22.7 ms, and
>   structurally so: the ambient-occlusion pass renders the whole scene a
>   second time for depth and normals, which costs a full extra geometry pass
>   (8.5 ms plain against 20–23 ms composed). The game now starts on Medium,
>   which measures inside 14 ms, and High keeps the automatic step-down. Check
>   3c's frame target is Medium under 14 ms, with a loose ceiling on High as a
>   regression guard.
>
> The §3 bot target — no bot falling more than three times at any one section —
> also settles at five or six over twenty seeds, always on a crumble bridge, a
> disc field or a plank. Check `*` caps at six and reports it as a miss.
>
> Kept as a record; the live plan is `docs/ROADMAP.md`. Do not re-run this brief.

# Scramble Rush v21 — authored courses and a real renderer

One reference image is attached: an overhead render of an obstacle course in the
sky. It is a **reference for course structure and material quality**, not a
plan to copy. What matters in it:

- The course is *authored*. It has distinct sections in a fixed order — a wide
  start platform, a field of spinning discs, a plank bridge with a hanging
  hammer, a striped slope with net walls and turnstiles, a cluster of small
  discs, a finish platform — and each section is a different kind of challenge.
- It **turns**. Sections meet at angles; the route bends left, then right,
  climbs onto the slope and drops off it. You can see the whole course from
  above and read where you are.
- The materials are glossy plastic with soft shadows, a real sky and clouds
  below the course, and every surface is one of three colours.

Our courses are the opposite today: a random list of obstacles in a straight
corridor, one after another with the same gap, so every run of Sunny Sprint
feels like every other run and every other map. v21 fixes that in two halves:
authored courses (§1–§3) and a renderer upgrade (§4). Do them in that order.

Start from `scramble-rush-20.0.html`. Edit fragments, never the release. Full
suite and `{accept:true}` after every numbered section; commit after each.
Push to `origin` after each commit. Cut `scramble-rush-21.0.html` at the end.

---

## 1. Courses become authored, not generated

Replace the `while(cursor < total)` random picker in `genCourse` with a
**course script** per map: an ordered list of *sections*, each with a type, a
length, a turn, and a few knobs. Randomness stays, but only *inside* a
section: obstacle phases, which lane a gap is in, which door is fake, small
offsets. The order and shape of the course is the same every time you play
that map, so players learn it, the way Fall Guys courses are learned.

```js
// example shape — the real one is up to you, but keep it this simple to read
sunny: [
  { type:'start',     len:600 },
  { type:'pillars',   len:700,  turn:+25 },        // bends right 25°
  { type:'discField', len:1400, rows:2, cols:3 },  // spinning turntables
  { type:'plank',     len:900,  turn:-40, hammer:true },
  { type:'chevron',   len:1200, climb:220, nets:true, turnstiles:3 },
  { type:'fork',      len:800 },
  { type:'gate',      len:500,  turn:+30 },
  { type:'smallDiscs',len:900,  count:5 },
  { type:'finish',    len:500 },
]
```

- `turn` bends the ribbon by that many degrees over the section's length. The
  existing `path` system already bends the world for rendering and camera
  only, with collision on the flat ribbon — **extend it so every section can
  carry its own turn, climb and drop**, and the camera's `pathAngle` follows
  the bend. Bots, collision and respawn keep working on the flat ribbon
  exactly as today, so this is a rendering and camera change, not a physics
  change. Check A (corridor maps unchanged) becomes "sections with `turn:0`
  and no climb reduce to the straight transform".
- Turns must be visible from the chase camera: the side rails curve, the floor
  stripes follow the curve, and you can see the next section coming round the
  bend. That is what stops it feeling like a corridor.
- Gaps between sections are **not** uniform. Some sections butt together
  (chevron straight into turnstiles), some have a breather platform. Put that
  in the script, not in a constant.

Every map keeps its identity: Sunny is the friendly showcase course (the image
is closest to this), Boom Peak is a climb with cannons at the switchbacks,
Splash Slide is a downhill with boost pads and one big turn, Neon is tight and
dark with spinners and lasers. Write all four scripts, plus Magma Chase (which
uses the same sections with the lava behind), and leave Paper Run, Panel Drop
and Closing Circle as they are — they are arenas, not courses.

The acceptance test's "five layouts" becomes "five seeds of the same script":
same sections, different phases and gap positions. Targets unchanged.

## 2. New sections — the things in the image we do not have

Each needs: geometry, collision, a bot plan, a check that it *does something*,
and an entry in check B (mesh agrees with collision). Add them in this order,
running the suite after each.

1. **Disc field (`discField`).** A grid of large turntables, each a rotating
   floor (reuse the Carousel `disc` code) with a **turnstile arm** sweeping
   across it at knee height (reuse `spinlaser` with one arm, solid not laser).
   Adjacent discs rotate opposite ways; gaps between discs are a fall. You
   cross by hopping disc to disc, timing the arm. Rows × cols from the script.
   Bots: aim for the next disc's centre, jump when the arm is within 40° of
   the crossing line, use the same platform-wait logic as `pit`.
2. **Plank bridge (`plank`).** Two or three narrow planks side by side over a
   drop, with a **hanging hammer** (a big pendulum on a rope, reuse `pendulum`)
   swinging across the middle. Planks are 2.2 bean-widths wide. Bots pick a
   plank and time the hammer like they time `hammer` today.
3. **Chevron slope (`chevron`).** A climb with big painted chevrons, **net
   walls** on both sides (visual, solid), and 2–4 **turnstiles** — vertical
   spinning bars at bean height that you walk through between the arms. The
   slope costs speed (existing `SLOPE_PULL`). Bots: existing spinbar logic
   with the turnstile treated as a two-arm spinbar.
4. **Small discs (`smallDiscs`).** Five to eight small rotating discs in a
   zigzag with nothing between them; a rhythm-jump section. Falling drops you
   to a respawn just before the section.
5. **Start and finish platforms.** Start is a wide chequered pad with the
   sixteen start slots marked. Finish is the v20 arch on a wide pad with a
   big chequered strip; the whole pad is the finish zone.
6. **Breather (`pad`).** A plain platform of given length and turn, for
   pacing. No obstacles. Bots just run.

Keep all the existing obstacle types; they become section types too
(`pillars`, `hammer`, `spinbar`, `narrow`, `gate`, `fork`, `crumble`,
`cannon`, `boost`, `laserbar`, `pusher`, `ramp`), each taking `len` and `turn`.

## 3. Bots on authored courses

The bot planner already has a plan per obstacle type, so most of this is
wiring. Two additions:

- Bots must **route through turns**: `targetX` is relative to the ribbon, so
  nothing changes in the sim, but the *stuck detector* must not fire when a
  bot slows into a bend. Check that the 2 s idle rule does not trip on a 40°
  turn taken at speed.
- Because courses are now fixed, a bot that fails a section will fail it every
  match. Run 20 seeds of each map and assert: no bot falls more than 3 times
  at any section, fifteen home on every seed, median bot finish within 15% of
  the hold-forward player's. Any section that breaks this gets fixed, not
  removed.

## 4. Renderer upgrade — "download anything"

The reference image is glossy plastic under a real sky with soft shadows.
Ours is flat Lambert with one hard light. Upgrade the renderer, pinned
versions, everything from cdnjs or jsdelivr, nothing bundled:

1. **Three.js r128 → r160** (`https://cdn.jsdelivr.net/npm/three@0.160.0/`),
   loaded as an ES module with an import map so we can use the addons under
   `three/addons/`. The game is one non-module script today; wrap it in
   `<script type="module">` and import what it needs. Expect API changes
   (`outputEncoding` → `outputColorSpace`, `Geometry` gone, etc.); fix them
   all and get the suite green *before* touching any visuals. This step alone
   is a commit.
2. **Materials.** Beans and obstacles move to `MeshPhysicalMaterial` with
   `clearcoat 0.6, clearcoatRoughness 0.25, roughness 0.45, metalness 0`.
   Keep the toon-ish look by lighting, not by the material — see 3. Floors
   stay `MeshStandardMaterial`, roughness 0.8.
3. **Lighting.** `PMREMGenerator` + `RoomEnvironment` from
   `three/addons/environments/RoomEnvironment.js` for image-based ambient, so
   the plastic actually reflects something. One directional key with
   `VSMShadowMap`, radius 4, map 2048, bias tuned. `ACESFilmic`, exposure 1.0.
4. **Sky.** `three/addons/objects/Sky.js` with a sun position per map (Neon is
   dusk, Boom Peak is noon, Splash Slide is a bright cold morning), and a
   layer of **clouds below the course** — 40–60 large soft sprites on a plane
   200 units under the ribbon, drifting slowly, using a procedural canvas
   texture (no external images). Every course is in the sky now; the drop off
   a plank should show cloud, not a flat colour.
5. **Post-processing.** `EffectComposer` with `RenderPass`, `GTAOPass` (ambient
   occlusion — this is what makes the plastic look solid), `SMAAPass`, and an
   `UnrealBloomPass` at strength 0.15 / threshold 0.9 so only the finish
   confetti and neon glows bloom. Nothing else. Add a `settings.quality`
   switch (Low: no composer, PCF shadows 1024; Medium: SMAA + shadows 2048;
   High: everything) defaulting to High and dropping to Medium automatically
   if frame time exceeds 14 ms for two seconds.
6. **Textures.** Chevrons, chequers, stripes and the net walls are procedural
   canvas textures with mipmaps and anisotropy, generated once per map.

Add **check 3c — renderer**: `renderer.info.render.calls` under 300 on the
busiest map, frame time under 12 ms on High at 1280×720 in Chromium, and a
pixel probe that the bean's clearcoat highlight exists (max luminance in the
bean's screen region exceeds its base colour by 25%).

---

## Acceptance for v21

- All existing checks green, plus the six new section checks, the 20-seed bot
  run in §3, and check 3c.
- Every race map has at least two visible turns of 25° or more and at least
  four different section types.
- Overhead screenshot of each course from the flyover camera, plus chase
  camera shots of the disc field, the plank bridge and the chevron slope, so
  we can compare against the reference.
- Commit and push after every section. Cut 21.0 at the end.
