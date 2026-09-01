# Scramble Rush 3D

A 3D obstacle-course battle royale. Race the pack through three courses —
the field is cut twice on the way to a six-player final.

Each version is one self-contained HTML file.

| File | Version | Notes |
|---|---|---|
| `scramble-rush-8.0.html` | **8.0 (current)** | Fall Guys-style beans, reworked physics, arena flyover, walkable finish area, longer maps |
| `scramble-rush-7.0.html` | 7.0 | Articulated characters, patterns, 7 minigames, per-map obstacles, ramps |
| `scramble-rush-6.0.html` | 6.0 | 3 rounds, shop + coins, new menu, free-look camera |
| `index.html` | 5.0 | The original two-round build, kept as-is |

## Running it

```
npm run dev
```

- v8: http://localhost:5173/scramble-rush-8.0.html
- v7: http://localhost:5173/scramble-rush-7.0.html
- v6: http://localhost:5173/scramble-rush-6.0.html
- v5: http://localhost:5173/

Live reload is on — save the file and the browser refreshes.

Prefer the dev server over double-clicking the file: "Friends" multiplayer uses
WebRTC via PeerJS, which needs a real `http://` origin rather than `file://`.

## Controls

- **WASD / arrows** move, **SPACE** jump (hold for height), **SHIFT** dive, **ESC** pause
- Jumps have coyote time and input buffering, so late and early presses still register
- **Drag anywhere** (one finger, one mouse drag, or a trackpad two-finger swipe)
  to look around. It recentres about 2s after you stop.
- Movement follows the camera, so "forward" is always away from the view.
  Both behaviours have toggles in Settings.

## Content

- **10 race maps**, each with its own obstacle set — pillars, hammers, spin bars,
  pits, narrows, pushers, ramps, rollers and laser beams, mixed differently per map.
- **7 minigames** — Lava Rise, Boulder Barrage, Door Dash, Tile Trap, Block Dash,
  Hex Drop, Laser Dodge. They appear ~30% of the time in the qualifying rounds
  and 55% of the time in the final.
- **43 colourways × 14 patterns**, bought with coins across six rarities.
  Champion Gold is the only skin that cannot be bought — it needs 100 wins.

## Dependencies

All from CDN at runtime — nothing is bundled, so the game needs a connection to start:

- **Three.js r128** (cdnjs) — 3D rendering
- **PeerJS** (unpkg) — peer-to-peer multiplayer
- **Fredoka** (Google Fonts) — typography

The local `npm` install is only Vite, used as the dev server.

## Saved data

The profile lives in `localStorage` under `scrambleRush.profile.v6` (shared by
v6 and v7: coins, skins, patterns, badges, stats). Clearing site data resets it.

Note: v5 saved via `window.storage`, which only exists inside the Claude
Artifacts runtime — so running v5 locally never actually persisted anything.

## How v7 was built

`scramble-rush-7.0.html` is generated from the v5 file plus fragment files by a
Python assembler. The source fragments and build script are not in this folder;
the shipped HTML is the artifact. The build fails loudly if any splice anchor
stops matching, so the generated file is never silently half-patched.

Every match opens with a flyover of the whole arena, from beyond the finish line
back to the start. Cross the line and you can walk around the finish pen, but a
fence keeps you in it.

Implementation plan (v7): [docs/superpowers/plans/2026-09-01-scramble-rush-v7.md](docs/superpowers/plans/2026-09-01-scramble-rush-v7.md)
