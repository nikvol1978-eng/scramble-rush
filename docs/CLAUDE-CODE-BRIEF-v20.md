> **Status: done in v20.** Everything below shipped in the four §-commits
> 2da4ad8 → 85c439b (5–6 Sep 2026) and the follow-ups 08fdb83, 13c0df6, 6018620
> and after, with Claude Code's corrections: air friction is 0.84 not 0.86, the
> speed cap follows the surface so ice keeps its own ceiling, Tile Tumble's grid
> is 12% shorter with 16% starting holes and check N's window is 30–60 s / 2–7
> out, check 3b reads the accent a hazard is painted with rather than pixels,
> and round-1 courses are longer than the v19 lengths (Sunny and Neon 10,300,
> Cannon Climb 8,800, Super Slide 8,800 × 1.6). Kept as a record; the live plan
> is `docs/ROADMAP.md`. Do not re-run this brief.

# Scramble Rush v20 — brief for Claude Code

Three reference screenshots are attached to this message. They are from Fall Guys
and are **references for layout, proportions and rendering style only**. Do not
copy the logo, the wordmark, the costume designs or any text from them; Scramble
Rush keeps its own name, its own bean and its own skins. What we want is the
*feel*: the layout of the screens, the readability of the courses, the softness
of the shading, and a pace where jumping and diving are tools rather than a
speed exploit.

Start from `scramble-rush-19.0.html` (HEAD `3e08b6b` or later). Edit the
fragments in `build/frag/`, never the released file. Run the full suite plus
`{accept:true}` after every numbered section; nothing in this brief may turn a
check red. Cut `scramble-rush-20.0.html` at the end, commit, and report anything
you could not do.

Do the four sections in this order: pacing first (it is the only gameplay
change and the checks must settle before the visual work), then characters,
then graphics, then the two screens.

---

## 1. Pacing — jump and dive must not be faster than running

Today a player who holds forward and alternates jump and dive covers ground
faster than one who just runs. Three causes, fix all three:

1. **Air friction is lower than ground friction.** Ground is `0.78`, air is
   `0.955`. A bean in the air keeps its speed while a bean on the ground loses
   it, so bunny-hopping is free speed. Set air friction to `0.86` so a jump
   never gains ground on a run. Air control stays `0.65`.
2. **The dive is a net gain.** Impulse `7.5`, prone `320 ms`, cooldown `900 ms`,
   get-up `~300 ms`. Over one cycle the bean averages faster than `v_max`.
   Make the dive a *commitment*: impulse `6.5`, prone `380 ms`, get-up
   `450 ms`, cooldown `1600 ms`. A dive should win you a gap, a ledge or a
   photo-finish, and cost you if you spam it.
3. **Top speed is too high for the course density.** `ACCEL 1.47` with ground
   friction `0.78` gives `v_max = ACCEL·fr/(1−fr) ≈ 5.2`. Bring it to `≈ 4.6`
   by setting `ACCEL = 1.30`. Leave friction alone — the stop and turn feel
   from v19 (checks S, U, V, W) must not change. Boost pads and slipstream keep
   their multipliers but add a hard cap: `|v| ≤ 1.35·v_max` for any racer at
   any time, including after a bumper or a cannon hit.

Bots use the same constants, so they slow down with you. Time limits stay
`60/55/50`; if a race map's median finish time goes above 50 s, shorten that
map's `total` by 10 %, do not touch the constants again.

Add **check 8 — no free speed**: on a flat, empty course, three players run 12 s
each with the same held forward input: (a) run only, (b) run + jump every
0.5 s, (c) run + dive whenever the cooldown allows. Assert `distance(b) ≤
1.02·distance(a)` and `distance(c) ≤ 1.00·distance(a)`, and that `v_max` is
between 4.4 and 4.8. Add it to the default suite.

## 2. Characters — bring the beans up to the reference standard

Keep our silhouette (the lathed bean, the face plate, stubby arms, small feet,
14 patterns, 65 colourways). Do not import the reference's design; improve
ours until it renders as well. Reference image 3 shows what to aim for.

- **Proportions.** Body height to width about 1.9 : 1 (ours reads squatter).
  Arms hang from the shoulder to just below the waist, thick at the shoulder
  and tapering, with a rounded mitt at the end; they swing when running and
  fly up on a jump. Feet are two small rounded pads that lift clear of the
  ground on each step. The face plate is a wide oval on the upper third of the
  body with two tall oval eyes; keep our eye variants.
- **Shading.** Switch the bean material to `MeshToonMaterial` with a 4-step
  gradient map plus a soft rim light, or keep `MeshStandardMaterial` with
  roughness 0.55 / metalness 0 and add a subtle fresnel rim via `onBeforeCompile`.
  Either way: one warm key light, one cool fill from the sky colour, and a
  baked ambient-occlusion darkening in the crease where the arms and legs
  meet the body (vertex colour is fine). No hard black outlines.
- **Costume patterns** sit on the body only, not on the face plate, and wrap
  around the lathe without a visible seam at the back.
- **Squash and stretch.** Land: squash to 0.82 height / 1.12 width for 90 ms.
  Take-off: stretch to 1.10 / 0.94 for 60 ms. Running: a 6 % vertical bob at
  stride rate. The tumble already exists; make the get-up a real animation
  (roll to sitting, then push up) rather than a snap.
- **Bots** get random hats from the existing set and a spread of patterns so
  the pack looks varied from behind.

Add **check 5 — bean rig**: the mesh height/width ratio is within 1.8–2.0,
arm tips are below waist height at rest, feet clear the ground on alternating
frames while running, and the squash keyframes fire on landing.

## 3. Graphics — the courses should read like reference image 3

Reference image 3 is a course seen from the chase camera: saturated flat
colours on a neutral floor, every obstacle in one bold colour with a
contrasting stripe, soft shadows, a bright sky with clouds, and the pack
clearly visible. Ours currently has the right palette and the wrong contrast.

- **Floor** is one flat colour per map with a large, low-contrast check (the
  v19 mipmapped texture is fine; halve the contrast of the alternate check).
- **Obstacles** each get one saturated body colour from a per-map set of three
  accents, with a white-and-accent diagonal stripe on any face that can hit
  you (hammer heads, spin bars, pusher fronts, door panels, gate posts). Walls
  and safe geometry are pale and desaturated. Rule: anything that can hurt
  you must be the most saturated thing on screen.
- **Lighting.** One directional key light with `PCFSoftShadowMap`, shadow map
  2048, bias tuned so beans do not float. Hemisphere fill from sky-top to
  ground colour. Tone mapping `ACESFilmic`, exposure 1.05. Enable
  `renderer.outputEncoding = sRGBEncoding` if it is not already; check every
  colour constant still looks right afterwards.
- **Sky** gets a gradient plus a handful of large, flat, low-poly clouds that
  drift slowly, and a soft horizon haze that matches `skyMid`. Delete every
  floating sphere, ring and cone.
- **Side walls** carry the map's accent as a top rail, and every 900 units a
  short crowd stand with 8–12 tiny static beans in random colourways bobbing.
- **Finish line** is an arch across the track with a chequered banner and
  confetti for the first three across.
- **Post-processing:** none. Keep the frame budget for shadows.

Add **check 3b — hazards are the loudest thing on screen**: for each race
map, sample the rendered colour of every hazard mesh and of the floor, and
assert hazard saturation exceeds floor saturation by at least 0.35 in HSL.

## 4. The two screens

### 4a. Lobby (reference image 1 layout)

Rebuild the home screen to this arrangement, with our own title art and
colours:

- Full-bleed background: a warm radial ring gradient in the map's accent
  family, slowly rotating.
- Top-left: the game title (our "SCRAMBLE RUSH" wordmark, two-tone, slight
  bounce on entry) with "SEASON 1" beneath it; under that, a **season
  progress** bar (level badge on the left, XP fraction on the right). Wire it
  to `stats.xp` — add XP: 20 per race finished, +60 per top-3, +150 per win.
- Top-centre: a row of five tab icons (Play, Locker, Badges, Shop, Settings)
  in rounded pill buttons; keyboard `Q`/`E` cycle them. Play is highlighted.
- Top-right: two currency chips — crowns (wins) and coins.
- Centre: the player's bean on a round podium, idle animation, slow orbit on
  mouse drag. This replaces the current preview.
- Bottom-left: a card with the player's name (editable on click) and crown
  count.
- Bottom-right: a large angled **PLAY!** button with a small "Invite players"
  link above it that opens the Friends panel. Keep the daily-spin entry as a
  small badge on the Play tab.
- Remove the four square menu buttons. Everything they did lives in the tabs.

### 4b. Round reveal (reference image 2)

Replace the current map loader/intro with a **"NEXT UP IS…"** screen:

- Dark title bar across the top with the text, over the same rotating ring
  background.
- A carousel of three cards: the round we are about to play in the centre,
  large and bright, and two other rounds from the pool on either side, smaller
  and dimmed. Cards show a live 3D render of the course (use the existing
  flyover camera at a fixed angle into a render target), the round name and
  its one-line tip.
- The carousel spins for 1.4 s and settles on the chosen round with a soft
  thunk, then the card expands into the existing flyover. No map voting yet —
  the choice is still random, this is presentation.
- Total time from round end to countdown must not grow: shorten the flyover by
  whatever the reveal adds.

---

## Acceptance for v20

- Full suite green (36 checks with 8, 5 and 3b added), five-seed acceptance
  passes with the v19 per-map targets unchanged.
- Check 8 passes on all four race maps.
- Median finish time on each race map between 35 s and 50 s.
- Frame time at 1280×720 in Chromium stays under 12 ms with shadows on; if it
  does not, drop the shadow map to 1024 before touching anything else.
- Report a before/after screenshot of the lobby, the reveal, and Sunny Sprint
  from the chase camera.
