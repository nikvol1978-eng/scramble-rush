# Scramble Rush 3D

A 3D obstacle-course battle royale in the Fall Guys mould. Sixteen beans, three
rounds: a race, then a race or a minigame, then a six-player final in the
Closing Circle. The field is cut to twelve after round one and six after round
two.

Each version is one self-contained HTML file.

| File | Version | Notes |
|---|---|---|
| `scramble-rush-19.0.html` | **19.0 (current)** | Eight rounds that work, Fall Guys movement, bots that race you, layered Tile Tumble, per-map acceptance test |
| `scramble-rush-18.0.html` | 18.0 | The last "everything" build: 13 race maps and 11 minigames, kept as the reference for the maps cut in v19 |
| `index.html` | 5.0 | The original two-round build. The build system splices every release out of this file, so it is never modified |

Versions 6.0–17.0 were removed from the working tree in September 2026; every one
is still in git history (`git log --oneline -- scramble-rush-13.0.html`, then
`git checkout <sha> -- scramble-rush-13.0.html` to bring one back).

## Running it

```
npm run dev
```

- current: http://localhost:5173/scramble-rush-19.0.html
- v18 reference: http://localhost:5173/scramble-rush-18.0.html

Live reload is on — save the file and the browser refreshes.

Prefer the dev server over double-clicking the file: "Friends" multiplayer uses
WebRTC via PeerJS, which needs a real `http://` origin rather than `file://`.

## Controls

- **WASD / arrows** move, **SPACE** jump (hold for height), **SHIFT** dive, **ESC** pause
- Jumps have coyote time and input buffering, so late and early presses still register
- Steering is relative to the camera, and the camera sits behind the course
  heading and stays there — a held diagonal is an exact 45°, and letting go
  moves nothing but the bean. Mouse look is off by default; turn it on in
  Settings if you want to orbit, and the view eases back behind you 0.6 s after
  you stop.

## Rounds

Round 1 is always a race. Round 2 is a coin flip between a race and a minigame.
Round 3 is always the Closing Circle final.

| Round | Kind | Signature |
|---|---|---|
| Sunny Sprint | race | hammers, pillars, gates, a fork with a fast lane, and one hole down the middle you must steer around |
| Cannon Climb | race | a climbing course with cannons that fire on a rhythm |
| Super Slide | race | a descent on ice, boost pads, crumbling bridges |
| Neon Nightrun | race | spin bars and laser beams in the dark |
| Lava Rise | minigame | the lava chases the pack and never lets a total wipe happen |
| Door Dash | minigame | six doors a row, two are paper |
| Tile Tumble | knockout | three floors of tiles; fall through one and you land on the next, fall through the bottom and you are out |
| Closing Circle | final | a shrinking disc, last six standing to start, one to win |

Bots run at the player's speed, have a plan for every obstacle type on these
maps, and have a fall-loop breaker so one unlucky pit does not cost a bot the
whole round.

The generator and obstacle code for the maps cut in v19 (Honey Hive, Candy
Canyon, Bumper Bash, Jungle Jam, Frostbite Peak, Cloud Nine, Cyber Grid, Orbit
Drop, Beach Break, Boulder Barrage, Block Dash, Honey Drop, Gem Grab, Carousel,
Laser Tracer, Laser Dodge) is still in the build. They were cut because the bots
could not cross a `mover` gap, not because they were bad maps; restoring one is
a one-line change to `MAPS`/`MINIGAMES` once the bots can.

## Cosmetics

- **65 colourways × 14 patterns**, bought with coins across six rarities.
  Champion Gold is the only skin that cannot be bought — it needs 100 wins.
- **Daily spin** — one free colourway every 22 hours, weighted so rarer tiers
  are genuinely rarer (common 40%, special 1%).

## Dependencies

All from CDN at runtime — nothing is bundled, so the game needs a connection to start:

- **Three.js r128** (cdnjs) — 3D rendering
- **PeerJS** (unpkg) — peer-to-peer multiplayer
- **Fredoka** (Google Fonts) — typography

The local `npm` install is only Vite, used as the dev server.

## Saved data

The profile lives in `localStorage` under `scrambleRush.profile.v6` (coins,
skins, patterns, badges, stats). Clearing site data resets it.

## How the builds work

Every release is generated from `index.html` (v5.0) plus the fragments in
`build/frag/` by a Python assembler. `index.html` is the base and is never
modified. **Edit the fragments, not the released file** — a change made only
to `scramble-rush-19.0.html` is lost on the next rebuild.

```
python build/build.py            # cut a new release (bump VERSION first)
python build/build.py --force    # rebuild the current one in place
python build/mkdebug.py          # throwaway __debug.html with window.__dbg
```

The build fails loudly if any splice anchor stops matching, so a generated file
is never silently half-patched. It also refuses to overwrite an existing release
unless you pass `--force` — a stale `VERSION` quietly relabelling newer content
is how v7 once got clobbered.

## Checks

`build/mkdebug.py` also injects `build/checks.js`. Open `__debug.html` and run:

```
window.__checks.run()                     // everything (34 checks)
window.__checks.run({only:'DE'})          // just the named checks
window.__checks.run({only:'G', half:1})   // G is heavy; run it in halves
window.__checks.run({accept:true})        // + the five-seed per-map acceptance test
```

They assert that things *happen* — cannonballs in flight, tiles crumbling, a
climb gaining height, a held diagonal staying at 45° — not merely that a round
reaches state `racing`. A state-only check is what let `updateMinigames()` sit
uncalled for three versions while every regression pass went green.

The acceptance test runs each race map on five layouts with a player that only
holds forward and spams jump, and asserts on medians: that player must get hurt
on at least four of five, the median worst-bot fall count must stay under the
per-map limit, and fifteen bots must finish. Cut a release only when it passes.

## Course paths

Courses are simulated on a flat ribbon: `x` across the track, `y` along it, `h`
above the surface. A map may declare a `path` (`climb` or `slide`), which bends
that ribbon into the world **for rendering and the camera only** — collision,
bot AI, respawn and round flow never see it. A map with no `path` uses the
straight transform, which reduces exactly to the old one, so corridor maps are
provably unchanged (check A asserts this to 0.001). Gradients do affect movement
though: climbing costs speed and descending pays it back (`SLOPE_PULL`).

## Version control

This folder is a git repository. Every release is committed, so an accidental
overwrite is one command away from being undone:

```
git checkout -- scramble-rush-19.0.html
```

Commit after each release rather than relying on the files alone.

Note: the repo lives inside OneDrive. That works, but OneDrive syncing `.git`
can occasionally corrupt it or leave a stale `.git/index.lock` behind. If you
ever see strange git errors, delete the lock file first; moving the project
somewhere outside OneDrive is the permanent fix.

## Plans

- [docs/ROADMAP.md](docs/ROADMAP.md) — the live plan and the version history
- [docs/CLAUDE-CODE-BRIEF.md](docs/CLAUDE-CODE-BRIEF.md) — the v19 brief, kept as a record of what was changed and why
