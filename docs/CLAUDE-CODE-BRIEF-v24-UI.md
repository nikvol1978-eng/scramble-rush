# Scramble Rush v24 — §5, the menu screens

Addendum to `CLAUDE-CODE-BRIEF-v24.md`. Do this **after** §3 and §4 are
committed and the suite is green; it is menu-only and must not touch a
gameplay number.

Four reference screenshots are in `docs/reference/`: `ui-lobby.png`,
`ui-locker.png`, `ui-shop.png`, `ui-pass.png`. They are references for
**layout, hierarchy, panel shapes and motion only**. No logo, wordmark,
character, costume, item name, currency name or text from them may appear
in the game. Everything on screen is Scramble Rush's own: our title art, our
stumbler, our skins and patterns, our coins and crowns, our round names.

Shared language across all four screens, taken from the references:

- One tab strip at the top centre: Play · Locker · Badges · Shop · Pass ·
  Settings, as rounded pills, the active one filled in the accent colour.
  `Q` / `E` (and `[` / `]`) cycle tabs; every screen keeps the strip.
- Currency chips top-right: crowns (wins) and coins, always visible.
- Panels are thick-bordered rounded rectangles with a hard 3–4 px drop
  shadow, on a full-bleed background of soft concentric rings in the
  accent colour, slowly rotating. Every panel scales in with a small
  overshoot; buttons squash on press.
- One display font (the existing Fredoka), all-caps headers with a thin
  dark outline so they read over any background.
- Rarity is a small pill above an item card, colour-coded and using our
  existing tiers (Common · Rare · Super Rare · Epic · Legendary · Special).

## 5.1 Lobby (`ui-lobby.png`)

Already close from v20. Bring it to the reference's proportions:

- Title art top-left, "SEASON 1" beneath it, then the **season progress**
  bar: level badge left, XP fraction right. Make the badge and bar the
  reference's size relative to the screen (roughly a fifth of the width).
- The stumbler on the podium is the largest thing on screen; the podium is
  a squat pink drum about 1.4 bean-widths across, not the current dish.
  Slow idle sway, mouse-drag orbit.
- Bottom-left: player name card with a crown icon and the crown count.
- Bottom-right: "Invite players" line above the large angled **PLAY!**
  button, with the keyboard key drawn as a key-cap, not a gamepad glyph.

## 5.2 Locker (`ui-locker.png`)

Replace the current profile/locker screen with a two-pane layout:

- **Left pane**: the stumbler on the same podium, full height, wearing the
  currently highlighted item live (not the equipped one — hovering previews,
  clicking equips). Mouse-drag orbit.
- **Right pane**: a large rounded panel with the item name as a header and
  its rarity pill in the top-right corner; under it a **4-column grid of
  square tiles** showing each item rendered on a faded silhouette of the
  stumbler, so patterns and hats read at a glance. The highlighted tile
  has a thick white border; the equipped one carries a small tick badge in
  its corner. Scrolls vertically; the header stays.
- Sub-tabs across the top of the right pane: Colour · Pattern · Hat ·
  Eyes. Keyboard: arrows move, Enter equips, Esc back.
- Locked items show their price or unlock badge on the tile; buying is
  one press with a confirm.
- The tile renders come from a small offscreen render target, cached per
  item, so opening the locker does not stutter.

## 5.3 Shop (`ui-shop.png`)

Replace the current shop with:

- Header "SHOP" top-left. Two sections stacked: **FEATURED** (three large
  cards) and **DAILY** (six small cards), each with a countdown pill on
  the right of its section header ("02d 18h", "18h 25m"). Rotation is
  seeded from the date so everyone sees the same shop on a given day;
  featured rotates every 3 days, daily every 24 h.
- A card is: rarity pill top-centre, item name, a big preview of the item
  on the stumbler silhouette, and the price at the bottom with the currency
  icon — coins for most, crowns for legendary and special. Owned items
  show "Owned" with a tick instead of a price.
- Right-hand tall card: a promotional panel for the current season pass
  (our art, our name — "SEASON PASS", not anything else) that links to
  5.4.
- Selecting a card opens a small confirm dialog with the item on the
  stumbler; buying plays the existing coin sound and pops the chip.
- Keyboard: arrows move between cards, Enter opens, Esc back.

## 5.4 Season pass (`ui-pass.png`)

New screen, replacing the plain season-progress bar's role:

- Header top-left: "SEASON PASS", the current tier as a big number in a
  badge, and the XP fraction to the next tier.
- Centre: the stumbler on a tall podium wearing the highlighted reward.
- Right: the highlighted reward's rarity pill, name, type, and an EQUIP or
  CLAIM button.
- Bottom: a **horizontal track of tier tiles**, one per tier, numbered on a
  rail beneath; the highlighted tile is larger with a thick border; claimed
  tiles carry a tick; locked ones are dimmed. Left/right arrows and drag to
  scroll; it opens centred on the next unclaimed tier.
- 30 tiers for Season 1. Rewards alternate coins, patterns, colours, hats
  and eyes from the existing catalogue, with one Special colourway at tier
  30 that is only obtainable here. XP comes from the v20 wiring (20 per
  race finished, +60 top-3, +150 win) — scale the tier curve so a casual
  player reaches tier 30 in about 60 matches.
- No paid track, no tier skip, no real money anywhere.

## Acceptance for §5

- Every gameplay check reads the same before and after (no constant
  moved; acceptance medians identical).
- Each of the four screens screenshotted at 1280×720 and at 960×600, with
  nothing clipped and no text overlapping.
- Keyboard-only navigation of all four screens works end to end.
- The locker grid opens in under 150 ms with all 65 colourways × 14
  patterns cached.
- A grep for any Fall Guys or Stumble Guys term in the repo returns
  nothing.
