# Pre-match loading and server-authoritative synchronized start

Date: 2026-09-21
Repos: `scramble-rush` (client), `Haxball` (server, subtree host)

## The problem, measured

The pre-match loader is decoration. On `main` (`892c501`):

```js
if(state==='loading'){                 // build/frag/… → index.html
  loadTimer -= dt*1000;                // a fixed LOADER_MS wall-clock wait
  if(loadTimer<=0){ hideMapLoader(); state='mapintro'; mapIntroTimer=FLY_MS; }
}
if(state==='mapintro'){ mapIntroTimer-=dt*1000; … state='countdown'; countdownVal=3; }
if(state==='countdown'){
  bannerTimer-=dt*1000; countdownVal-=1;         // per-client dt accumulation
  … else { state='racing'; if(mp.role==='host') broadcast({type:'banner',text:'GO!',…}); }
}
```

Three defects follow from that:

1. **No readiness signal exists.** The loader waits out a CSS transition. Nothing
   asks whether the course, the racer meshes, the scene or the peers are ready.
2. **Every client runs its own countdown.** The host broadcasts banner *text*,
   not a time. Two browsers count down independently and start whenever their
   own `dt` accumulation reaches zero.
3. **The countdown is 3 seconds**, not 10, and it begins after two fixed timers
   rather than after the work.

## Architecture: where authority lives

Scramble Rush gameplay is **PeerJS browser-to-browser** (`index.html:15` loads
`peerjs.min.js`; `mp = {role, peer, conns, hostConn, code, tOffset, …}`). That
stays exactly as it is — gameplay is not migrating.

Coordination moves to the **existing authenticated Socket.IO server**, which is
already running in the same process that serves the game:

| Fact | Evidence |
|---|---|
| Socket.IO 4.8.1 runs on the server | `server/index.js:5,332`; `server/package.json` |
| The same process serves `/play/scramble-rush` | `server/index.js:326` → `handlePlay` |
| Connections carry a verified identity | `server/index.js:363-366` — `socket.data.player = token ? await verifySession(token) : null` |
| A second game already added its own socket surface | `server/hoops/sockets.js`, `hoops:`-namespaced, wired by `makeHoopsGame({io, clock})` + `hoops.attach(socket)` |
| The game page is 403 for anonymous | `server/play-routes.js` |

Because the page and the socket are the **same origin**, the `hexball_session`
cookie is sent with the handshake, so `socket.data.player` is populated. That
sidesteps the cross-origin identity gap ORACLE.md documents for the Hexball
client; no ticket is needed.

This is an extension of an existing channel, not a parallel networking layer.

### Split of responsibility

| Concern | Owner |
|---|---|
| Race physics, inputs, positions, eliminations | PeerJS host (unchanged) |
| Match identity, required roster, readiness set, `raceStartAt` | **Server** |
| Rendering the countdown, locking movement, starting the race timer | Client, **derived from `raceStartAt`** |

## Server

Two new modules, mirroring the `online.js` / `hoops` split — a pure state
machine that tests without a socket, and a thin socket surface over it.

**`server/scramble/match.js`** (pure, `clock`-injected)

```
phases: gathering → countdown → racing        (+ terminal: closed)
COUNTDOWN_MS      = 10_000
READY_GRACE_MS    = 30_000     // a player who never reports ready is dropped
```

- `join(matchId, playerKey, meta)` — adds to the required roster.
- `markReady(matchId, playerKey)` — idempotent; ignores unknown players.
- `leave(matchId, playerKey)` — removes from roster *and* readiness set.
- `tick(now)` — drops players past `READY_GRACE_MS`, opens the countdown when
  every required player is ready, and closes matches that emptied.
- When the countdown opens, the roster **freezes** and `raceStartAt = now + 10000`
  is stamped once and never recomputed.
- A disconnect during the countdown removes the player but **leaves
  `raceStartAt` alone**, so the rest start on schedule.

**`server/scramble/sockets.js`** — events all namespaced `sr:`

| Event | Direction | Payload |
|---|---|---|
| `sr:time` | client → server (ack) | `{}` → `{ serverNow }` |
| `sr:join` | client → server (ack) | `{ code, round }` → `{ matchId, state }` |
| `sr:ready` | client → server | `{ matchId }` |
| `sr:state` | server → client | `{ phase, roster, readyCount, requiredCount, raceStartAt, serverNow }` |

Identity is read from `socket.data.player`, **never** from the payload, so a
client cannot mark another player ready or join as someone else. A socket with
no verified player, or one that cannot see the `scramble-rush` drop, is refused
— the same gate the page uses.

Clients cannot choose `raceStartAt` or the countdown length; both are computed
server-side and only ever read by the client.

## Clock synchronization

`sr:time` is acked with the server's clock. The client measures round-trip and
estimates

```
offset = serverNow + rtt/2 − performance.now()
```

taking the best of several samples (lowest RTT wins, the standard NTP-style
pick). The countdown renders every frame from

```
remaining = raceStartAt − (performance.now() + offset)
display   = Math.ceil(remaining / 1000)
```

so a throttled frame or a skipped timer cannot make it drift — the number is
derived from the target, never decremented.

## Solo

Solo has no peers to wait for, so forcing 10 seconds of dead air onto every
single-player race is a regression. Solo uses a **local** authority and the
existing short countdown, through the **same** code path: the same
`raceStartAt` field, the same frame-derived rendering, the same movement lock,
the same race-timer start. Only the source of the timestamp differs, and solo
does not depend on the network at all.

## Client readiness

Explicit flags, not one vague boolean:

| Flag | Satisfied when |
|---|---|
| `profileReady` | profile loaded, skin/pattern resolved |
| `mapReady` | the round's map drawn, course generated, path table built |
| `sceneReady` | course mesh built and in the scene |
| `racerReady` | the player's racer mesh + skin material built |
| `sessionReady` | solo: immediately. multiplayer: joined the match and the roster is known |

`localMatchReady = every flag true`. **`sr:ready` is only sent once all of them
are true** — the client reports readiness, it never asserts the match is ready.

The map shown on the loader is the map the round actually drew (`currentMap`),
with its real name, mode, goal and existing thumbnail art. Maps stay random per
round; no picker is added.

## Loader as one component, five states

One shell, five states — `boot`, `matchPreparing`, `waitingPlayers`,
`countdown`, `error` — rather than a second copy of the loader markup. The
startup loader keeps its own boot path and is not replaced.

The countdown number lives in a fixed-size box so `10 → 9` shifts nothing.

## Movement lock and race timer

One instant governs everything: gameplay input, `raceTime`, obstacle timing and
finish timing all begin at `raceStartAt`, not when an animation ends or the DOM
reaches zero.

## Failure behaviour

- Local preparation fails → never report ready; show `FAILED TO PREPARE MATCH`
  with RETRY and BACK.
- Socket unreachable in multiplayer → fall back to the PeerJS host's clock
  rather than hanging, and say so.
- Server says the match is gone → return to selection with an explanation.
- START is disabled on first click; a second click cannot create a second match.

## Out of scope (frozen)

Character geometry, hands, feet, face, movement characteristics, maps, map
physics, obstacle geometry, Locker, Badges, Shop, Pass, Daily Spin, Support.
