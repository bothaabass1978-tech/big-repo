# ADR-0003: BlockForge Game Runtime and Module Contract

## Status

Accepted

## Date

2026-09-25

## Last Verified

2026-09-25

## Decision Makers

Project owner (BlockForge product brief); Claude Code session (technical design
and implementation).

## Summary

BlockForge needs 20 different games that share servers, bots, chat, rewards,
quests, touch controls and pause/results screens, without repeating that
plumbing 20 times. A single runtime (`BF.runtime`) hosts every game. Each game
is a module registered with `BF.GameModules.register(type, def)`. The runtime
passes each module a `ctx` object that is its only door into the platform.
Games draw on a fixed 960×540 logical canvas and put their menus in DOM panels
on top of it.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | None (browser). Uses Canvas 2D, `requestAnimationFrame`, and Pointer, Keyboard and Touch events. |
| **Domain** | Core / Rendering / Input |
| **Knowledge Risk** | LOW |
| **References Consulted** | MDN: CanvasRenderingContext2D, requestAnimationFrame, Pointer Events |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `games_modules_test.js`; the e2e smoke test launches, drives and leaves all 20 games and 5 creator games |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (store, bus, systems), ADR-0002 (`progress[gameId].custom` persistence) |
| **Enables** | All 20 game modules; creator templates; ADR-0004 (the Mystery Mansion part of the Forgecore chain) |
| **Blocks** | None |
| **Ordering Note** | `js/engine/*` loads after pages and before `js/games/*` |

## Context

### Problem Statement

The brief asks for 20 playable, distinct games. Each needs its own loop,
mechanics, UI, scoring, bots, rewards, win/lose conditions, and restart and
exit. They also need platform-wide behaviour: servers you can join and leave,
bots with personalities who chat, a chat box and player list, game passes that
change gameplay, quests and achievements that react to play, leaderboards, and
touch controls on phones. Users can also make their own games from five
templates.

### Current State

`src/blockforge/js/engine/runtime.js` implements this decision, together with
`input.js`, `gfx.js` and `phys.js`. The 20 modules are in
`src/blockforge/js/games/`.

### Constraints

- There is no engine or physics library (ADR-0001). Games use Canvas 2D and
  small helpers.
- Games must work on phones: touch joystick and buttons, and small screens.
- A buggy game must not break the platform or corrupt the save.

### Requirements

- Every game gets servers, a bot roster, chat, pause, results, rewards, XP,
  quests and badges without writing that code itself.
- Creator games reuse a built-in module with a seeded configuration.
- Leaving a game mid-round leaves no timers, listeners or DOM behind.
- The frame loop stays smooth on mid-range laptops and phones.

## Decision

### Architecture

```
Game page ── Play / Join ──► BF.runtime.launch(gameId, serverId?)
                                   │  BF.world.join() → server + bot roster
                                   ▼
          ┌──────────────────── in-game shell (DOM) ───────────────────┐
          │ top bar · player list · chat · feed · pause · results      │
          │ touch joystick + buttons (from module.controls)            │
          │ ┌──────────── <canvas> 960×540 logical ──────────────┐     │
          │ │  module.draw(g)   (scaled to fit, DPR ≤ 2)          │     │
          │ └─────────────────────────────────────────────────────┘     │
          │ .gr-ui: DOM panels from ctx.ui.panel(id, html, cls)         │
          └────────────────────────────────────────────────────────────┘
                                   │
  requestAnimationFrame ─► frame(): dt = min(Δt, 50 ms)
                              ├─ if !paused && !ended: module.update(dt)   (throws → crash overlay)
                              ├─ module.draw(g)                            (throws → crash overlay)
                              └─ input.endFrame()
  world events ('server:join'/'server:leave') ─► module.onBotJoin / onBotLeave
  chat / emotes ───────────────────────────────► module.onChat / onEmote
  ctx.end(result) ─► settle(): coins (+25% pass), XP (×2 pass), wins/losses,
                     quests ('match_complete', 'win') ─► results overlay ─► Play again / Leave
```

### Key Interfaces

```js
BF.GameModules.register('towerdefense', {
  actions: { next: ['Space'], speed: ['KeyF'] },          // keyboard bindings → ctx.input.act/actPressed
  controls: { joystick: false, buttons: [{ act: 'next', label: 'Next wave', icon: 'play' }] },
  maxBots: 3,                                             // active bot participants
  feedTop: 0.1,                                           // optional: move the event feed below a HUD strip
  create(ctx) {
    return {
      update(dt) {}, draw(g) {},                          // required
      destroy() {}, onBotJoin(bot) {}, onBotLeave(bot) {}, onEmote(e) {}, onChat(msg) {},
      _test: {},                                          // optional hooks for automated tests
    };
  },
});

// ctx: the module's only access to the platform
ctx.W, ctx.H (960×540) · ctx.gameId · ctx.config (creator seed/difficulty) · ctx.difficulty · ctx.mobile
ctx.player · ctx.bots (active participants) · ctx.allBots (whole server) · ctx.botLevel(bot)
ctx.input.axis() · act(name) · actPressed(name) · pointer {x, y, down, pressed, released, touch}
ctx.data (persistent per-game object) · ctx.save()
ctx.best(stat, value, 'max'|'min') · ctx.addStat(stat, n) · ctx.playerStat(stat, n)
ctx.hasPass(effect) · ctx.hasItem(itemId) · ctx.useConsumable(key, n)
ctx.reward(coins, reason)      // batched into one ledger entry (≥60 FC or every 5 s)
ctx.xp(n) · ctx.quest(event, n) · ctx.badge(id) · ctx.collectible(itemId)
ctx.feed(text, kind, color) · ctx.chat(text) · ctx.botSay(bot, kind) · ctx.bubbleText(id)
ctx.banner(title, sub, ms) · ctx.toast(title) · ctx.sfx(name, opts)
ctx.ui.panel(id, html, 'center'|'wide'|'right'|'bottom'|'top'|'top end'|'dock'|'tray') · ctx.ui.remove(id) · ctx.ui.on(fn)
ctx.end({ outcome: 'win'|'lose'|'draw'|'complete', title, subtitle, best, coins, xp, stats: [[label, value]], delay })
```

Shared engine helpers: `BF.gfx` (text, bars, panels, rounded rects, avatars,
name tags, speech bubbles), `BF.Particles`, `BF.Floaters`, `BF.Camera` (follow,
shake, bounds, world/screen transforms), and `BF.phys` (segment and rectangle
tests, collision resolution).

### Implementation Guidelines

- **No `setTimeout` or `setInterval` in modules** for anything that touches
  `ctx`. Use timers counted down in `update(dt)`, so nothing fires after the
  player leaves. The runtime's own timers are cleared on leave.
- **Persist through `ctx.data` and `ctx.save()` only.** Keep per-session state
  in closures inside `create()`.
- **Tuning lives in a table** at the top of each module (`const T = {...}`),
  with difficulty variants for creator configs.
- **Badges are scoped.** `ctx.badge(id)` only awards badges that belong to the
  running game, so a creator game built on the Arena template cannot farm Block
  Battlegrounds badges.
- **Compare bots by `id`, not object identity.** The runtime and world recreate
  bot objects.
- **Panels use `data-gact` attributes** and `ctx.ui.on((action, el, e) => ...)`.
  Never attach listeners to `document` from a module.
- **Use real-world grammar in feeds** (`U.withArticle`). Format times with
  `U.fmtTime(ms)` and clocks with `U.fmtClock(sec)`. Leaderboard `bestTime`
  stats are in milliseconds.
- **Randomness in game logic** must be free and fictional. It is never sold for
  money (see ADR-0004). Where odds exist, as with Pet World eggs, the game
  shows them.

## Alternatives Considered

### Alternative 1: Each game as a separate HTML page or iframe

- **Description**: Standalone pages that talk to the platform through
  `postMessage`.
- **Pros**: Strong isolation; a game can use any tech.
- **Cons**: 20 copies of the chat, servers, pause, results and touch-control
  plumbing. Iframes on `file://` have origin quirks. Shared state needs a
  message protocol.
- **Estimated Effort**: Much higher
- **Rejection Reason**: The shared platform features are the point of the
  product, and a shared runtime delivers them once.

### Alternative 2: A small entity-component system (ECS) for all games

- **Description**: One ECS with shared systems (physics, rendering, AI).
- **Pros**: Reuse at the entity level.
- **Cons**: The 20 games are very different: turn-based battles, point-and-click
  puzzles, side-scrolling platforming, top-down shooters and tycoons. A shared
  ECS would be either too thin to help or too heavy for turn-based games.
- **Estimated Effort**: Higher
- **Rejection Reason**: A thin `ctx` contract plus helper libraries gives reuse
  without forcing one simulation model.

## Consequences

### Positive

- A new game is one file with `register()` and a registry entry in
  `js/data/games.js`. It gets servers, bots, chat, rewards, quests, passes,
  touch controls, pause and results for free.
- Creator games are just `{template → gameType, config: {seed, difficulty}}`.
- Crashes are contained: the player sees "Something broke" with a Leave button,
  and the platform keeps running.

### Negative

- Modules share one global canvas size (960×540). Very tall portrait layouts
  are not supported, so phones in portrait get letterboxing and a rotate hint.
- The `ctx` API is broad. Changes to it need care because every module depends
  on it.

### Neutral

- Games render their own HUD on the canvas and their menus in DOM panels. Both
  patterns coexist by design.

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| A module leaks a timer or listener after leave | Low | Medium | The in-update timer rule; the e2e test launches and leaves every game and fails on page errors |
| Large `dt` after a tab switch causes tunnelling | Low | Low | `dt` is clamped to 50 ms, and the game pauses automatically when the tab is hidden |
| An expensive draw on low-end phones | Medium | Medium | DPR capped at 2, a cached minimap canvas (City Life), and particle systems capped at 400 particles each |

## Performance Implications

| Metric | Before | Expected After | Budget |
|--------|--------|---------------|--------|
| CPU (frame time) | n/a | Script time per frame (update + draw): mean 0.1–0.9 ms, 95th percentile ≤ 1.6 ms, worst single frame 9 ms (Sky Obby). A steady 60 fps in all 20 games, with no frame over 16 ms | 16.6 ms |
| Memory | n/a | JS heap ≈ 10 MB during play (Chromium's rounded figure) | 100 MB |
| Load Time | n/a | ≈ 1.1 s "joining server" sequence by design (4 steps × 280 ms), then the first frame | 2 s |
| Network (if applicable) | n/a | 0 | 0 |

Measured 2026-09-25 in headless Chromium at 1440×900. Each game ran for about
4.5 s with scripted keyboard and pointer input after the loading sequence.

## Migration Plan

This is a new system, so there is nothing to migrate.

**Rollback plan**: Remove a module's `<script>` tag. The runtime then shows
"under maintenance" for that game instead of crashing.

## Validation Criteria

- [x] All 20 registry entries map to a registered module (unit).
- [x] Registry ids, passes and badges are unique; every pass has an effect and a price (unit).
- [x] Generated obby courses are always jumpable; speed-trial medal times are achievable (unit).
- [x] Every game launches, accepts input, runs and exits with no page errors (e2e).
- [x] A creator game from each of the 5 templates is playable (e2e).
- [x] Touch controls appear on a touch device (e2e).

## GDD Requirements Addressed

Foundational: no GDD requirement. The brief specifies 20 distinct playable
games with bots, servers, chat, rewards, win/lose, restart and exit; game passes
that change gameplay; creator templates (Arena, Racing, Obby, Simulator, Tower
Defense); and mobile-friendly controls.

## Related

- ADR-0001: Web client architecture
- ADR-0002: Local persistence (`ctx.data`)
- ADR-0004: Fictional economy (how game rewards enter the ledger)
- Code: `src/blockforge/js/engine/runtime.js`, `src/blockforge/js/engine/gfx.js`,
  `src/blockforge/js/games/*.js`, `src/blockforge/js/data/games.js`,
  `src/blockforge/js/systems/creator.js`
- Tests: `tests/blockforge/unit/games_modules_test.js`,
  `tests/blockforge/e2e/platform_smoke_e2e_test.js`
