# Scramble Rush v7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the sphere "blobs" into articulated Stumble Guys-style characters, add a purchasable pattern layer, fix the spinbar hitbox and dive tuning, make controls camera-relative with single-drag look, give each map its own obstacle set plus ramps, and add four new minigames.

**Architecture:** The game is one self-contained HTML file. v7 is built from v6 by a Python assembler (`scratchpad/build.py`) that splices fragment files into anchor points in the v6 source. Fragments are authored separately so each system stays reviewable; the assembler fails loudly if any anchor stops matching. Verification is browser-based via a throwaway debug build (`mkdebug.py`) that exposes internals and a manual `tick()` stepper — the Browser pane's `requestAnimationFrame` is frozen, so the simulation must be stepped by hand.

**Tech Stack:** Three.js r128 (CDN), PeerJS (CDN), vanilla ES2015+ inside one IIFE, Vite as a static dev server, Python 3.9 for the assembler.

## Global Constraints

- Output file: `scramble-rush-7.0.html`. **Do not modify `scramble-rush-6.0.html` or `index.html`** — the user has no git, so old versions are the only history.
- All dependencies stay CDN-loaded. No new libraries, no bundling, no external art assets. Every texture must be procedurally generated on a `<canvas>`.
- Sim coordinates: `x` across the track (0..`TRACK_W`=760), `y` along it (0..`trackLength`), `h` is height above ground. Scene coords: `toSceneX(simX) = simX - TRACK_W/2`, scene `z` = sim `y`, scene `y` = height. **Sim +X maps to scene +X with no flip; sim +Y maps to scene +Z with no flip.**
- Three.js `rotation.y = a` maps local `(x,0,z)` to world `(x·cos a + z·sin a, 0, −x·sin a + z·cos a)`. Any collision maths that mirrors a rotating mesh must account for the sign on Z.
- `RADIUS = 17` is the collision radius and must stay 17 — physics, AI, and every obstacle are tuned against it. The new character model must be built to read correctly at that radius, not resized.
- Existing save data (`localStorage` key `scrambleRush.profile.v6`) must keep loading. New fields get defaults; never wipe a returning player's coins or unlocks.
- Multiplayer serialisation (`serializeRacer`) must keep sending a flat `color` string; remote peers may be on an older build.
- Keep the existing rarity ladder and its label colours: common grey, rare green, superrare blue, epic purple, legendary yellow, special gold.

---

## File Structure

Fragments live in `scratchpad/frag/`. The assembler splices each into the v6 source at a named anchor.

| Fragment | Responsibility |
|---|---|
| `01_data.js` | Settings, skins, **patterns**, rarities, stats, badges, maps, minigame list |
| `02_skinmat.js` | Procedural textures, skin materials, **pattern overlay**, `makeCharacter()` |
| `03_home.html` | Home menu + profile markup, **loading screen**, **pattern tab** |
| `04_menu.css` | Menu, profile, shop, **loading screen**, **stage** styling |
| `05_profile.js` | 3D preview, idle performance, **mouse-spin**, profile/shop/pattern UI |
| `06_camera.js` | Free look (**single-drag + touch**), camera-relative input basis |
| `07_rounds.js` | Three-round flow, **minigame weighting by round**, results, coins |
| `08_gencourse.js` | Course generation, **per-map obstacle sets**, **ramps**, minigame courses |
| `09_minigames.js` | Minigame runtime + `checkObstacles` (**incl. spinbar fix**) |
| `10_wiring.js` | Button/tab wiring |
| `11_respawn.js` | Respawn that understands tile fields and hex platforms |
| `12_charanim.js` | `syncRacers` — run cycle, jump, dive, stumble poses for the new rig |

---

## Task 1: Articulated character rig

Replace the sphere-with-feet with a Stumble Guys-style figure: rounded torso, separate head, two arms, two legs. Skin material goes on torso + head; limbs use the darker shade. The rig must expose named joints so Task 2 can animate them.

**Files:**
- Modify: `scratchpad/frag/02_skinmat.js` — replace `makeBlob` with `makeCharacter`
- Create: `scratchpad/frag/12_charanim.js` — new `syncRacers`
- Modify: `scratchpad/build.py` — add the `syncRacers` splice

**Interfaces:**
- Produces: `makeCharacter(opts) -> {group, bodyMat, outMat, outline, body, head, hatGroup, eyeGroup, pupils, scleras, mouth, tongue, arms:[L,R], legs:[L,R], armPivots:[L,R], legPivots:[L,R], feet:[L,R]}`
  - `opts` = `{skin, pattern, color, hat, eyes}`. `feet` is kept as an alias for the leg pivots so v6 code that touches `m.feet[0].position.z` keeps working.
- Consumes: `makeSkinMaterials(skin, pattern)` from Task 3.

**Proportions (world units, character centred so its feet sit at `y = -RADIUS`):**
- Torso: `SphereGeometry(RADIUS*0.86)` scaled `(1, 1.15, 0.92)`, centre `y = 2`
- Head: `SphereGeometry(RADIUS*0.62)`, centre `y = RADIUS*1.05`
- Arm: `CapsuleGeometry`-equivalent (cylinder + two spheres, r=`RADIUS*0.17`, len=`RADIUS*0.78`), pivot at shoulder `(±RADIUS*0.82, RADIUS*0.42, 0)`
- Leg: same build, r=`RADIUS*0.21`, len=`RADIUS*0.62`, pivot at hip `(±RADIUS*0.38, -RADIUS*0.42, 0)`
- Foot: `SphereGeometry(RADIUS*0.30)` scaled `(1, 0.62, 1.35)`, at the bottom of each leg

- [ ] **Step 1: Build the limb helper**

```js
// A capsule built from a cylinder plus two spheres (r128 has no CapsuleGeometry).
function makeLimb(r, len, mat){
  const g = new THREE.Group();
  const mid = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
  mid.position.y = -len/2; mid.castShadow = true; g.add(mid);
  const top = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat); g.add(top);
  const bot = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
  bot.position.y = -len; g.add(bot);
  return g;
}
```

- [ ] **Step 2: Replace `makeBlob` with `makeCharacter`**

Keep the hat/eye/mouth code from v6 verbatim but re-parent: eyes, mouth and tongue attach to `head`, not to the root group, so the head can turn independently. The hat group attaches to `head` at `y = RADIUS*0.6`.

- [ ] **Step 3: Keep the outline silhouette readable**

The v6 outline is a single back-faced sphere. Replace with a back-faced copy of the torso **and** head so the figure keeps its cartoon outline:

```js
const outMat = new THREE.MeshBasicMaterial({color:0x1a1033, side:THREE.BackSide, transparent:true, opacity:1});
const outline = new THREE.Group();
const oTorso = new THREE.Mesh(new THREE.SphereGeometry(RADIUS*0.86*1.16, 16, 12), outMat);
oTorso.scale.set(1, 1.15, 0.92); oTorso.position.y = 2; outline.add(oTorso);
const oHead = new THREE.Mesh(new THREE.SphereGeometry(RADIUS*0.62*1.16, 16, 12), outMat);
oHead.position.y = RADIUS*1.05; outline.add(oHead);
group.add(outline);
```

- [ ] **Step 4: Update every `makeBlob(` call site**

Call sites: `buildRacerMeshes` (via the `r.skinId` ternary), `refreshPreview`. Rename to `makeCharacter` and pass `pattern`.

- [ ] **Step 5: Rebuild and syntax-check**

Run: `python scratchpad/build.py && node --check` on the extracted script.
Expected: `SYNTAX OK`, no missing-anchor errors.

- [ ] **Step 6: Visual check**

Load the debug build, screenshot the menu. Expected: a recognisable figure with head, torso, two arms, two legs — not a sphere.

---

## Task 2: Character animation

**Files:**
- Modify: `scratchpad/frag/12_charanim.js`

**Interfaces:**
- Consumes: the rig from Task 1.
- Produces: `syncRacers(t)` driving `armPivots`/`legPivots` rotation.

Poses, by priority (first match wins):

| State | Legs | Arms | Torso |
|---|---|---|---|
| `falling` / `lavaOut` | splayed `±0.6` | up `-2.4` | roll `k*3` |
| `diveT>0` | straight back `-1.1` | straight forward `-2.6` | pitch forward `1.15` |
| `stumbleT>0` | wide `±0.5` | windmill `sin(t*20)` | roll `sin(t*18)*0.35` |
| `h>0` (airborne) | tucked `0.5` / `-0.3` | up `-1.6` | slight pitch `0.2` |
| moving on ground | run cycle `sin(ph)*0.85` opposed | opposed `sin(ph)*0.7` | bob |
| idle | settle to `0` | settle to `0` | breathing |

- [ ] **Step 1: Write the run cycle**

```js
const ph = t*11 + r.x*0.08;              // per-racer phase offset so the pack isn't in lockstep
const swing = Math.sin(ph);
m.legPivots[0].rotation.x =  swing*0.85;
m.legPivots[1].rotation.x = -swing*0.85;
m.armPivots[0].rotation.x = -swing*0.70;
m.armPivots[1].rotation.x =  swing*0.70;
```

- [ ] **Step 2: Add the head turn**

The head leads the turn: `m.head.rotation.y = clamp((r.renderFacing - lastFacing)*2.5, -0.5, 0.5)`, eased.

- [ ] **Step 3: Remove the old feet-waddle block** from `syncRacers` (it targeted `m.feet[i].position.z`).

- [ ] **Step 4: Verify** — step a race with the debug harness, screenshot mid-run. Expected: legs visibly alternating, arms counter-swinging.

---

## Task 3: Patterns (purchasable, on top of skins)

**Files:**
- Modify: `scratchpad/frag/01_data.js` — `PATTERNS` array, `stats.patterns`, `custom.pattern`
- Modify: `scratchpad/frag/02_skinmat.js` — `patternTex()`, overlay in `makeSkinMaterials`
- Modify: `scratchpad/frag/03_home.html` — a `PATTERNS` tab
- Modify: `scratchpad/frag/05_profile.js` — `buildPatternPane()`

**Interfaces:**
- Produces: `PATTERNS` (array of `{id,name,rarity,draw,unlock}`), `patternOf(id)`, `makeSkinMaterials(skin, pattern)`.
- `draw(ctx, w, h, colour)` paints the pattern in white-on-transparent onto a 256×256 canvas; the material multiplies it over the skin.

Patterns and costs (rarity ladder reused; `none` is the free default):

| id | name | rarity | cost |
|---|---|---|---|
| `none` | Plain | common | default |
| `spots` | Spots | common | 120 |
| `stripes` | Stripes | common | 120 |
| `checker` | Checkers | rare | 260 |
| `zigzag` | Zigzag | rare | 260 |
| `camo` | Camo | rare | 300 |
| `stars` | Starfield | superrare | 480 |
| `hearts` | Hearts | superrare | 480 |
| `bubbles` | Bubbles | superrare | 500 |
| `circuit` | Circuit | epic | 850 |
| `scales` | Dragon Scales | epic | 900 |
| `flames` | Flames | legendary | 1500 |
| `lightning` | Lightning | legendary | 1600 |
| `glitch` | Glitch | special | 1999 |

- [ ] **Step 1: Add the `PATTERNS` table with `draw` functions** (canvas 2D, no assets).
- [ ] **Step 2: Composite the pattern into the skin texture.** Build a 256×256 canvas: fill with the skin's base appearance, then draw the pattern with `globalAlpha≈0.55` and a contrasting colour. Cache by `skinId + '|' + patternId`.
- [ ] **Step 3: Add the PATTERNS tab** — same card layout as the shop, with BUY/EQUIP and rarity labels.
- [ ] **Step 4: Persist** `custom.pattern` and `stats.patterns` (owned list); default `'none'` for existing saves.
- [ ] **Step 5: Verify** — buy a pattern in the debug build, confirm coins decrease, the pattern equips, and it survives a reload.

---

## Task 4: Spinbar hitbox fix + dive tuning

**Files:**
- Modify: `scratchpad/frag/09_minigames.js` (collision)
- Modify: `scratchpad/build.py` (bot-AI prediction, `doDive`)

**The bug:** the mesh is a box along local X inside a group with `rotation.y = a`. Its end lands at scene `z = o.y − (L/2)·sin(a)`. The collision segment uses `o.y + sin(a)·L/2`. The hitbox is therefore **mirrored in Z** and only agrees with the visual when `sin(a)=0`. Players get hit by nothing and walk through the bar.

- [ ] **Step 1: Fix the collision segment**

```js
// mesh rotates via rotation.y, which sends local +X to world (cos a, 0, -sin a)
const ang=spinAngle(o,t);
const dx=Math.cos(ang)*o.length/2, dy=-Math.sin(ang)*o.length/2;
```

- [ ] **Step 2: Apply the identical fix to the bot-AI look-ahead** (the `tt=t+0.22` prediction), or bots will dodge a phantom bar.

- [ ] **Step 3: Make the height test match the mesh.** Bar centre `y=22`, height 22 → occupies 11..33. Replace `r.h<30` with `r.h < 33`.

- [ ] **Step 4: Tune the dive.** v6: `r.vx+=cos*7.5; r.vy+=sin*7.5; diveT=260; diveCd=1100`. Change the impulse to `4.2` and shorten `diveT` to `210`, raise `diveCd` to `1300`. Dive stays useful for crossing a gap but stops being a strictly-better way to travel.

- [ ] **Step 5: Verify the hitbox numerically** — in the debug build, sample the bar angle, compute the mesh endpoint from the scene graph, and assert the collision segment endpoint is within 1 unit. Expected: matches at every angle, not just multiples of π.

---

## Task 5: Camera-relative controls + single-drag look

**Files:**
- Modify: `scratchpad/frag/06_camera.js`
- Modify: `scratchpad/build.py` (`computeInputVec`)

Two separate complaints: (a) look needs a plain single-pointer drag including touch, (b) movement should follow where the camera points, so pressing forward runs away from the camera regardless of yaw.

- [ ] **Step 1: Rotate the input vector by the camera yaw**

```js
// Movement is relative to where the camera is pointing, not to the track.
function computeInputVec(){
  const k=settings.keys; let ix=0, iy=0;
  if(keys[k.left]||keys['arrowleft']) ix-=1;
  if(keys[k.right]||keys['arrowright']) ix+=1;
  if(keys[k.forward]||keys['arrowup']) iy+=1;
  if(keys[k.back]||keys['arrowdown']) iy-=1;
  if(touchVec.x||touchVec.y){ ix+=touchVec.x; iy-=touchVec.y; }
  ix=-ix;                                  // camera looks down +Z, so screen-right is sim -X
  if(settings.invertX) ix=-ix;
  if(settings.camRelative){
    const a=look.yaw;                      // yaw the stick by the current camera yaw
    const c=Math.cos(a), s=Math.sin(a);
    const rx = ix*c - iy*s, ry = ix*s + iy*c;
    ix=rx; iy=ry;
  }
  return {ix,iy};
}
```

Add `camRelative:true` to `DEFAULT_SETTINGS` and a Settings toggle ("Move relative to camera").

- [ ] **Step 2: Accept touch in the look handler.** v6 bails on `e.pointerType==='touch'`. Instead, accept touch pointers that start outside the joystick and action buttons:

```js
canvas.addEventListener('pointerdown', e=>{
  if(!settings.freeLook || !lookActiveState()) return;
  if(e.pointerType==='touch' && e.target.closest && e.target.closest('#touchControls')) return;
  dragId=e.pointerId; dragLast={x:e.clientX,y:e.clientY};
  ...
```

- [ ] **Step 3: Lower the drag threshold.** v6 multiplies mouse deltas by `2.2`; that plus `0.0030` needs a deliberate shove. Use `3.4` so a single short drag turns the view.

- [ ] **Step 4: Verify** — set `look.yaw = π/2`, press forward, assert the racer's velocity is perpendicular to what it was at `yaw = 0`.

---

## Task 6: Per-map obstacle sets and ramps

**Files:**
- Modify: `scratchpad/frag/01_data.js` (add `obstacles:[...]` to each map)
- Modify: `scratchpad/frag/08_gencourse.js` (honour the per-map list; generate ramps)
- Modify: `scratchpad/frag/09_minigames.js` (ramp collision)
- Modify: `scratchpad/build.py` (ramp meshes)

Right now every map draws from the same six obstacle types, so only the palette changes. Give each map a weighted set plus one signature obstacle.

| Map | Obstacle set |
|---|---|
| Sunny Sprint | pillars, hammer, pit, ramp |
| Neon Nightrun | spinbar, pusher, narrow, beam |
| Candy Canyon | pillars, pit, ramp, roller |
| Dustbowl Dash | pit, pusher, narrow, ramp |
| Frostbite Peak | narrow, spinbar, pit, ramp (slippery) |
| Jungle Jam | pillars, hammer, roller, narrow |
| Cloud Nine | pit, ramp, beam (mostly gaps) |
| Cyber Grid | spinbar, beam, pusher, narrow |
| Sunset Circuit | hammer, pillars, ramp, roller |
| Inkwell | pillars, spinbar, pusher, pit |

New obstacle types:
- **`ramp`** — a wedge you run up; gives height on exit. Racer `h` follows the wedge surface while inside.
- **`roller`** — a horizontal cylinder spinning across the track that shoves you sideways.
- **`beam`** — a sweeping laser at ankle height; jump it or get knocked down.

- [ ] **Step 1: Add `obstacles` to each MAPS entry** and make `genCourse` pick from `currentMap.obstacles` (falling back to the full list).
- [ ] **Step 2: Generate ramps.** `{type:'ramp', yStart, yEnd, y0, y1, height: rand(28,52), width: rand(220,380), cx}`.
- [ ] **Step 3: Ramp meshes** — a wedge from `BufferGeometry` with 6 triangles, plus a landing lip.
- [ ] **Step 4: Ramp collision** — inside the ramp footprint, set a floor height `hFloor = height * (r.y - yStart)/(yEnd - yStart)` and clamp `r.h` up to it; on exit, convert the run-up into `vh`.
- [ ] **Step 5: Roller and beam** — meshes, collision, and `syncObstacles` animation.
- [ ] **Step 6: Verify** — generate each map in the debug build, assert its obstacle type histogram only contains that map's allowed set, and that ramps produce airtime.

---

## Task 7: New minigames

**Files:**
- Modify: `scratchpad/frag/01_data.js` (`MINIGAMES` entries)
- Modify: `scratchpad/frag/08_gencourse.js` (course generators)
- Modify: `scratchpad/frag/09_minigames.js` (runtime + collision)
- Modify: `scratchpad/frag/11_respawn.js` (hex platforms)

- [ ] **Step 1: Block Dash** — walls of blocks slide across the track in rows; gaps shift. Reuse the `pusher` movement maths with full-height blocks and a guaranteed gap per row.
- [ ] **Step 2: Hex Falling** — a field of hexagons; each drops shortly after being stood on, revealing a lower tier, then the void. Three tiers. Respawn logic must place a fallen racer on a surviving hex.
- [ ] **Step 3: Laser Dodge** — horizontal beams sweep along the track at two heights: low ones you jump, high ones you duck under by diving. Contact knocks you back.
- [ ] **Step 4: Tile Trap rework** — the user wants tiles to disappear *faster* and *come back*. Set `fuseTime` to `1.1/0.85`, and add `respawnTime: 4.5` so a gone tile rebuilds after 4.5s with a rising animation. This keeps the floor survivable without the fall-loop problem solved in v6.
- [ ] **Step 5: Round-3 minigame weighting.** v6 excludes minigames from the final. Change to: round 1 → 0.30, round 2 → 0.34, round 3 → 0.55.
- [ ] **Step 6: Verify each** — step 20 simulated seconds per minigame; assert total falls per racer stays under ~4 and that the leader still reaches the finish.

---

## Task 8: Loading screen with scrolling maps

**Files:**
- Modify: `scratchpad/frag/03_home.html`, `04_menu.css`, `07_rounds.js`

- [ ] **Step 1: Add the markup** — a full-screen overlay with a horizontally scrolling strip of map cards, each a gradient swatch built from that map's `skyTop`/`ground`/`accent` plus its name.
- [ ] **Step 2: Animate** with a CSS keyframe translating the strip; the strip holds two copies of the list so it loops seamlessly.
- [ ] **Step 3: Land on the chosen map** — after ~1.5s, stop the scroll on the selected map card and scale it up, then fade to the map intro.
- [ ] **Step 4: Hook into `startRound`** — show the loader, build the course during it, then reveal.
- [ ] **Step 5: Verify** — screenshot mid-scroll and at the landing frame.

---

## Task 9: Character stage with spotlight + mouse spin

**Files:**
- Modify: `scratchpad/frag/05_profile.js`, `04_menu.css`

- [ ] **Step 1: Add a stage** to the preview scene — a raised disc, a dark vignette backdrop, and a `THREE.SpotLight` aimed at the character with `castShadow` on.
- [ ] **Step 2: Dim the surroundings** while the profile is open so the character reads as lit on a stage.
- [ ] **Step 3: Drag-to-spin** — pointer drag over the preview area sets `previewSpin`, with inertia and a slow auto-rotate when idle; the idle performance keeps running underneath.
- [ ] **Step 4: Verify** — screenshot the Character tab; the figure should be clearly lit against a darker background and respond to a simulated drag.

---

## Task 10: Full regression pass

- [ ] **Step 1:** Syntax-check the built file.
- [ ] **Step 2:** Three-round progression still 16 → 12 → 6.
- [ ] **Step 3:** Coins, badge claims, shop and pattern purchases, and persistence across reload.
- [ ] **Step 4:** Every map generates a valid course; every minigame completes.
- [ ] **Step 5:** Delete the debug build; confirm no `__dbg` in the shipped file.
- [ ] **Step 6:** Update `README.md` for v7.

## Self-Review

**Spec coverage:** real characters (T1/T2), patterns for coins (T3), spinbar hitbox (T4), dive nerf (T4), round-3 minigame chance (T7.5), per-map obstacles (T6), loading animation (T8), lit stage + mouse spin (T9), single-drag look (T5.2), camera-relative controls (T5.1), new obstacles + ramps (T6), block dash / hexagon / laser (T7), tiles faster + reappearing (T7.4). All covered.

**Known risk:** Task 1 changes the visual scale of every racer while `RADIUS` stays 17 for physics. If the figure reads as too large or small next to obstacles, adjust the *model* proportions, never `RADIUS`.
