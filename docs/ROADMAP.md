# Scramble Rush — Roadmap

The plan, in the order it should be built. Tick items off as they land and note
the version they shipped in.

## Update 1 — Core gameplay

- [x] Slipstream: drafting tows a trailing racer by ~7% *(v13)*
- [x] Improved jumping — variable height, coyote time, input buffering *(v8)*
- [x] Dive with a real lunge, slide and get-up *(v8)*
- [x] Make diving more tactically useful (not just faster) — a dive is a commitment, and never faster than running *(v20)*
- [x] Satisfying stumble / fall animations — ragdoll tumbles off big hits *(v17)*
- [x] Better landing and collision reactions — impulse, squash, knocked off your feet *(v13)*
- [x] Collisions that feel deliberate rather than random — racers block and
      shove each other, but never knock each other over *(v16)*
- [x] Obstacles that push, spin, launch and knock players about — cannons,
      pendulums, pinball bumpers, boost pads, rotating laser arms *(v11)*
- [x] Warning animations before dangerous obstacles — cannon floor telegraph *(v13)*
- [x] Obstacles readable at a glance — ground texture filtered, checks doubled *(v19)*

## Update 2 — Maps and variety

- [x] Per-map obstacle sets *(v7)*
- [x] Map intro showing the course — full arena flyover *(v8)*
- [x] A signature mechanic per map:
  - [x] Lava — rising lava *(v6)*
  - [x] Ice — slippery movement *(v8, `slippery` flag)*
  - [x] Tiles — disappearing floor *(v7)*
  - [x] Jungle — swinging logs *(v15)*
  - [x] Space — low gravity, on Orbit Drop *(v15)*
  - [x] Beach — waves pushing players, on Beach Break *(v15)*
- [x] Cannons and boost pads *(v11)*
- [x] Courses that climb and descend, on a path rather than a straight axis *(v12)*
- [x] Climbing and descending affect movement — a gradient costs you going up
      and pays going down, instead of being scenery *(v18)*
- [x] Moving platforms, falling floors *(v15)*
- [x] Risk-vs-reward shortcut lanes — raised, narrow, faster *(v14)*
- [x] Branching routes — a divider, a fast raised lane, a slower clear one *(v16)*
- [x] Traffic jams — gates with two doors and sixteen racers *(v16)*
- [x] Random map events — crosswind, frenzy, tremor *(v15)*
- [x] Survival / last blob standing — Tile Trap and Comb Collapse *(v13)*
- [x] Final showdown in a small arena — Carousel, reserved for the last round *(v16)*
- [x] Shrinking arena — Closing Circle *(v16)*
- [x] Collect mode — Gem Grab: three gems and you are through *(v17)*
- [ ] Team modes

## Update 3 — Multiplayer

- [ ] Easier room joining, clear connection status
- [ ] Host settings (bot count, rounds)
- [ ] Player ready system
- [ ] Map voting before each round
- [ ] Rematch without returning to the menu
- [x] Better bots — same acceleration as the player, plans for every obstacle *(v19)*

## Update 4 — Replayability

- [x] Daily reward — spin the wheel for a skin, weighted by rarity *(v10)*
- [ ] Daily and weekly challenges
- [x] Win streak rewards, and 13 grind badges *(v13)*
- [ ] Level-up rewards
- [x] Season progress bar in the lobby, XP for finishing, podiums and wins *(v20)*
- [ ] Cosmetics locked behind hard achievements

## Update 5 — Polish

- [x] Losing should stay fun: dramatic tumbles, funny launches *(v17)*
- [x] Spectator mode after elimination — follow a survivor, switch targets *(v14)*
- [x] Music that changes per map — key, tempo and waveform from the map itself *(v17)*
- [ ] Better sound effects
- [ ] Graphics quality settings
- [ ] Better mobile controls
- [x] Camera that handles falling behind objects — occluders fade, auto-tilt on drops *(v14)*
- [ ] Tutorial for new players
- [ ] Better countdown
- [x] Clearer finish line — an arch with a chequered banner, confetti for the top three *(v20)*
- [x] Courses that read at a glance — neutral floors, striped hazards, ACES lighting *(v20)*
- [x] Lobby and round reveal in the Fall Guys arrangement *(v20)*

## Cosmetics (purely cosmetic — never a gameplay advantage)

- [x] Skins, patterns, hats, eyes *(v6–v7)*
- [x] Live 3D preview in the shop — browse without equipping *(v14)*
- [ ] Emotes
- [ ] Victory animations
- [ ] Footstep effects and trails
- [ ] Titles / names

## Power-ups — keep it sparse

Temporary pickups on *some* maps only: speed boost, super jump, bounce, shield,
launch forward. The core game stays about movement and obstacles.

---

## Done so far

| Version | What landed |
|---|---|
| v6 | Three rounds, coins, shop, badges, free-look camera, lava minigame |
| v7 | Articulated characters, patterns, 7 minigames, per-map obstacles, ramps |
| v8 | Bean characters, reworked physics, arena flyover, walkable finish area, longer maps |
| v9 | Character remodelled to the Fall Guys silhouette |
| v10 | Free-orbit camera, 22 more skins, daily spin wheel |
| v11 | Five new obstacle types, four new maps, Beam Team, rarity-graded grid |
| v12 | Path-based courses; Boom Peak climbs, Splash Slide descends |
| v13 | Impact physics, slipstream, knockout rounds, 7 shaped maps, 28 badges, special auras |
| v14 | Live shop preview, smart camera, shortcut lanes, spectator mode |
| v15 | Moving platforms, crumbling bridges, swinging logs, Orbit Drop, Beach Break, map events |
| v16 | Chase camera, friendly player collisions, laser hitbox fixes, locker screen, forks, gates, Closing Circle, Carousel |
| v17 | Ragdoll tumbles, second wind, catch-up draft, Gem Grab, cannonball chain reactions, per-map music |
| v18 | Gradients drive movement: hills finally cost and pay |
| v19 | Eight maps that work, Fall Guys movement, bots that actually race, layered Panel Drop, per-map acceptance test |
| v20 | Jumping and diving no longer beat running; a taller toon-shaded bean; neutral floors and loud hazards; the lobby and the "NEXT UP IS…" reveal; longer round-1 courses; bots read the obstacle clock (a frenzy no longer throws every prediction off for the rest of the round); a pit rule that waits at the swing end and commits once |
| v21 | Authored courses: every race map is an ordered list of named sections, each carrying its own turn and climb, so the route bends where it is meant to. Six new sections — a disc field with sweeping arms, a plank bridge under a hammer, a chevron slope with net walls and turnstiles, a zigzag of small discs, and chequered start and finish pads. Bots plan for all of them. Three.js r128 → r160 as ES modules, and a renderer to match: glossy physical materials with a clearcoat, image-based ambient from a room environment, VSM shadows, a real sky with a sun per map, cloud below the ribbon, and a composer with occlusion, bloom and SMAA behind a quality switch that steps itself down |

| v22 | A playtest pass. Being knocked over no longer means being knocked over again: you cannot be tumbled while already down, and standing up buys you a moment nothing can touch — a spin bar could hold a racer for four unbroken seconds, and nearly seven during a FRENZY. The dive is worth pressing: it costs nothing in distance now instead of 12%, and the whole of it is invulnerable, so it is how you go through a hazard. Splash Slide actually slides — ice keeps your momentum, your boots do not bite sideways, the bean banks into the skid, and the channels and bridges widened to suit the surface. A shorter, wider, big-headed character. The locker is lit, and the character is in it rather than behind the card | **Corrected in v23:** the neutral-floor rule was capping saturation and lightness in three's *linear* working space, which v21 had switched on without anyone noticing, so every map came out khaki; the physical sky read as white paper from a chase camera; respawn put you back on the lip of the hazard you fell into; the camera boom collapsed on anything it could also fade; and the v20 fix for the round-reward toast had been deleted at build time every build since, so it had never once run |

| v23 | A fix pass on v22, from an independent play-through. Floors keep their colour and hazards earn contrast by being darker rather than by the floor being drab. The sky carries each map's own blue instead of haze. Falling sends you back a full section with a beat to gather yourself, and nothing can loop you at one hazard more than three times in twenty seconds. The camera fades gate walls and netting instead of shoving past them. Keyboard players get keyboard prompts, and the lobby frames the character rather than the podium | **Corrected in v24:** `baseRacer()` never initialised `tumbleT`, and `undefined <= 0` is false, so six guards written the natural way round had never once opened -- among them the ice skid lean this pass added, which had therefore never been seen |

| v24 | Play like the genre's best. Twenty-four racers on the pad on a stated ladder -- 24 to 16 to 8 -- paid for by a skinned rig that costs two draw calls a racer instead of thirteen. A rebuilt handling model with one friction constant at the root of it and acceleration, ice drive and slope pull all solved from it, so momentum carries, you slide where you land, and a jump into a dive clears gaps a plain jump cannot -- and courses sized so it matters, with a hard route and a safe one. A bright, chunky, low-poly look. Seven new rounds: Hop & Duck, Slime Slope, Tilt Deck, Log Jam, Comb Collapse, Wall Rush and Beam Team, plus Last Rung as a second final, each with its own geometry, collision, bot plan, section check and place in the acceptance. Splash Slide finishes through a ring. Five menu screens -- a shared tab strip, the lobby, the locker, the shop and a season pass -- rebuilt to reference proportions, with the character rendered live into every item tile. The match now draws from three named pools and a check deals a hundred and eighty matches to prove it |

## v25 candidates

- **A GitHub remote.** Everything through v23 is committed locally only.

