# ADR-0001: BlockForge Web Client Architecture

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

BlockForge is a fictional user-generated-games platform with 20 built-in games
and a dozen platform systems. It has to run by opening one HTML file, with no
build step, server or network. It is built as zero-dependency vanilla
JavaScript: classic `<script>` tags share one `window.BF` namespace, and all
account data lives in a single state object. Systems change that object only
through `BF.store.update(slices, fn)`, which batches change events and
schedules autosaves.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | None. Runs in the browser using the DOM, Canvas 2D, Web Audio and `localStorage`. The pinned Godot 4.6 reference does not apply. |
| **Domain** | Core / UI |
| **Knowledge Risk** | LOW: only long-stable web platform APIs |
| **References Consulted** | MDN (Web Storage, Canvas 2D, Web Audio). No `docs/engine-reference/` material applies. |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `node --test 'tests/blockforge/unit/*_test.js'` and `node tests/blockforge/e2e/platform_smoke_e2e_test.js` pass in current Chromium |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | None |
| **Enables** | ADR-0002 (local persistence), ADR-0003 (game runtime), ADR-0004 (fictional economy and Forgecore) |
| **Blocks** | None (already implemented) |
| **Ordering Note** | Script order in `src/blockforge/index.html` is part of this decision (see Implementation Guidelines). |

## Context

### Problem Statement

The brief asks for a complete platform: home, discover, avatar shop, inventory,
avatar editor, friends, messages, notifications, creator tools, leaderboards,
search, settings, a wallet and ledger, quests, achievements, daily rewards,
simulated servers and bots, and 20 playable games. Everything runs locally, with
fictional currency and fictional users, and nothing may touch a real service.
We had to pick a structure that one codebase can grow to about 20k lines
without the systems tangling.

### Current State

Before this work, the repository held the studio template (agents, skills,
docs) and no game code. BlockForge lives in `src/blockforge/`.

### Constraints

- **Local only.** The app must open from `file://`. No backend, no accounts
  server, no network calls. External fonts are optional and have fallbacks.
- **No real services.** No real payments, authentication or third-party
  platform APIs (brief section 37).
- **No toolchain.** No npm install or bundler needed to run it. Tests may use
  Node and Playwright.
- **Phone and desktop.** Must work from phone width (390 px) to wide desktop,
  with touch controls in games.

### Requirements

- Every page shows live state. For example, the header balance updates the
  moment a game pays out.
- Progress is saved automatically and survives reloads. Export, import and
  reset are available.
- Systems can be tested headlessly in Node without a browser.
- A game crash or bad save must never take down the whole app.

## Decision

A layered, zero-dependency browser app. Every file is an IIFE that adds to
`window.BF`:

```js
(function (BF) { 'use strict'; /* ... */ })((window.BF = window.BF || {}));
```

### Architecture

```
index.html (classic <script> tags, loaded in this order)
│
├─ core/     util · bus (event bus + BF.clock) · storage · sfx (Web Audio) · icons (inline SVG)
├─ data/     items · games (+passes, badges, products, leaderboards) · progression · bots · thumbs
├─ core/     store (state, migrate, autosave, accounts)          ◄── single source of truth
├─ systems/  bots+dialogue · avatar · economy+progression+daily · meta (notify, quests,
│            badges, achievements) · inventory+passes+products · social (friends, messages)
│            · world (catalog, servers, presence, leaderboards, search) · creator · secrets
├─ ui/       components (BF.ui) · router (BF.pages/BF.router) · shell · actions · forgecore
├─ pages/    home · discover · game · items · social · create · profile · settings · progress
├─ engine/   input · gfx (+Particles, Floaters, Camera) · phys · runtime (BF.GameModules)
├─ games/    20 game modules, each registering with BF.GameModules
└─ main.js   boot, sign-in, interval save, flush on hide/unload

 data flow:
   user input ─► page/action ─► system API ─► BF.store.update(['wallet',...], fn)
                                                   │ (microtask batch)
                                                   ▼
                              BF.bus 'store:change' {wallet, transactions}
                                    │                         │
                                    ▼                         ▼
                        router re-renders pages     header/shell listeners
                        whose `watch` slices hit    (balance, badges, unread)
                                                   │
                                                   └─► debounced autosave (ADR-0002)
```

### Key Interfaces

```js
// Store: the only way to change state
BF.store.update(keys /* 'wallet' | ['wallet','transactions'] */, (state) => { /* mutate */ });
BF.store.touch(keys);                 // mark slices changed after an in-place mutation
BF.store.on(keys | '*', (changedSet) => {});  // returns an unsubscribe function
BF.store.state                        // read-only by convention

// Event bus for cross-system signals that are not state slices
BF.bus.on(event, fn) / BF.bus.emit(event, payload)
// e.g. 'wallet:changed', 'wallet:insufficient', 'levelup', 'forgecore:unlocked'

// Pages
BF.pages.register(name, { title, nav, watch: ['slice', ...], render(params) -> html, mount(root, params), unmount() });
```

Platform systems and the state slices they own:

| System (file) | Global API | Owns slices |
|---|---|---|
| Accounts and store (`core/store.js`) | `BF.accounts`, `BF.store` | whole state, `meta`, `debug` |
| Economy, XP, daily (`systems/economy.js`) | `BF.economy`, `BF.progression`, `BF.daily` | `wallet`, `transactions`, `player.level/xp`, `daily` |
| Meta (`systems/meta.js`) | `BF.notify`, `BF.quests`, `BF.badges`, `BF.achievements` | `notifications`, `quests`, `badges`, `achievements` |
| Inventory (`systems/inventory.js`) | `BF.inventory`, `BF.passes`, `BF.products`, `BF.progressFor` | `inventory`, `passes`, `progress[gameId]` |
| Avatar (`systems/avatar.js`) | `BF.avatar` | `avatar` |
| Social (`systems/social.js`) | `BF.friends`, `BF.messages` | `social`, `messages` |
| Bots (`systems/bots.js`) | `BF.bots`, `BF.dialogue` | `bots` (per-bot progress); the roster is regenerated from `world.seed` |
| World (`systems/world.js`) | `BF.catalog`, `BF.world`, `BF.leaderboards`, `BF.search` | `catalog`, `recent`, `world` |
| Creator (`systems/creator.js`) | `BF.creator` | `created` |
| Secrets (`systems/secrets.js`) | `BF.secrets` | `secrets` |
| Settings (`pages/settings.js`) | uses `BF.store` directly | `settings` |

### Implementation Guidelines

- **Load order is the dependency graph.** A file may use, at load time, only
  what earlier files defined. Load-time code must not call across systems.
  Cross-system calls happen at runtime, inside functions.
- **Mutate only inside `BF.store.update`** and list every slice you touch. A
  page re-renders only when one of its `watch` slices changes.
- **Content is data.** Items, games, passes, badges, quests, achievements,
  daily rewards and bots are declared in `js/data/*`. Systems and pages read
  them, so balance changes don't touch logic. Game tuning tables sit at the
  top of each game module (`const T = {...}`).
- **Deterministic generation.** The bot roster (640 bots, 22 of them
  handcrafted), game thumbnails and creator courses come from seeded PRNGs
  (`U.rng(seed)`), so saves store seeds rather than generated content.
- **Escape everything** that reaches `innerHTML` with `U.esc`. User and bot
  text goes through `BF.dialogue.filter`.
- **Keep failures contained.** A page that throws while rendering shows an
  in-page error card. A game that throws is stopped by the runtime
  (ADR-0003). Storage failures fall back to memory (ADR-0002).

## Alternatives Considered

### Alternative 1: React (or similar) with a bundler

- **Description**: A component framework, a build step and ES modules.
- **Pros**: A familiar component model, typed props and hot reload.
- **Cons**: Needs a toolchain to run. The build output must still be served,
  because module scripts are blocked on `file://` in Chromium. Adds
  dependencies to audit.
- **Estimated Effort**: Similar
- **Rejection Reason**: It breaks the requirement to open one HTML file with
  no build step.

### Alternative 2: ES modules without a bundler

- **Description**: Native `import` / `export` between files.
- **Pros**: Explicit dependencies and no globals.
- **Cons**: Chromium blocks module scripts loaded from `file://` origins, so
  the app would need a local web server.
- **Estimated Effort**: Lower
- **Rejection Reason**: It fails the double-click-to-run requirement.

### Alternative 3: One state object per system, saved separately

- **Description**: Each system persists its own `localStorage` key.
- **Pros**: Smaller writes.
- **Cons**: Saves are not atomic across systems (a purchase touches wallet,
  ledger and inventory). Export and import become multi-file.
- **Estimated Effort**: Similar
- **Rejection Reason**: The risk of a torn save outweighs the write size,
  which stays small (see ADR-0002).

## Consequences

### Positive

- Runs anywhere a modern browser runs, including offline, from a USB stick or
  as a static page.
- The whole platform can be tested headlessly: `tests/blockforge/unit/harness.js`
  loads the same files into a Node `vm` context.
- Change batching keeps re-rendering cheap. Many updates in one tick (e.g. a
  purchase that also completes a quest) produce one re-render.

### Negative

- The global namespace relies on convention. Nothing stops a file from
  mutating state outside `update()`; code review and tests catch it.
- Pages re-render by replacing `innerHTML` (keeping scroll and focus). That is
  fine at this scale but would not suit very large lists.
- There is no static typing; JSDoc on public APIs is the contract.

### Neutral

- Script order in `index.html` is significant and must be kept in sync when
  files are added.

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| A new file uses a global before it is loaded | Medium | Medium | Keep the layer order above. The e2e test visits all routes and launches all games, failing on any page error |
| State mutated outside `update()`, so the UI goes stale and autosave is missed | Low | Medium | `BF.store.touch()` exists for in-place game data. Autosave also runs every 30 s and on hide/unload |
| The global keyboard handler steals keys from dialogs | Low | Low | Shell and runtime handlers ignore keys while `.modal-scrim` or `.fc-scrim` is open |

## Performance Implications

| Metric | Before | Expected After | Budget |
|--------|--------|---------------|--------|
| CPU (page render) | n/a | Full render including layout: 2–40 ms for most pages; Leaderboards ≈ 58 ms; Avatar Shop ≈ 115 ms (many item cards). Renders happen on navigation or state change, not every frame | 150 ms per render |
| Memory | n/a | JS heap ≈ 10 MB (Chromium's rounded figure) | 150 MB |
| Load Time | n/a | From disk, signed-in reload: DOMContentLoaded ≈ 250–350 ms, load ≈ 340–440 ms (about 20k lines of JS, images are inline SVG) | 2 s |
| Network (if applicable) | n/a | 0 (optional Google Fonts only) | 0 |

Measured 2026-09-25 in headless Chromium at 1440×900 with the sample account.

## Migration Plan

This is a new application, so there is nothing to migrate.

**Rollback plan**: Delete `src/blockforge/` and `tests/blockforge/`. Nothing
else in the repository depends on them.

## Validation Criteria

- [x] `src/blockforge/index.html` opens from `file://` and reaches the home
      page with no console errors.
- [x] All 27 checked routes render. All 20 games launch and exit cleanly (e2e
      smoke test).
- [x] Platform systems pass unit tests headlessly in Node (53 tests).
- [x] No horizontal scroll at 390 px phone width.

## GDD Requirements Addressed

Foundational: no GDD requirement. BlockForge was specified in a single product
brief rather than GDDs. This decision enables every platform system in the
brief: wallet and ledger, shop, inventory, avatar, social, creator,
leaderboards, search, quests, achievements, daily rewards, settings, save
export/import, and the game runtime.

## Related

- ADR-0002: Local persistence and save format
- ADR-0003: Game runtime and module contract
- ADR-0004: Fictional economy, ledger and the Forgecore secret
- Code: `src/blockforge/index.html`, `src/blockforge/js/core/store.js`,
  `src/blockforge/js/ui/router.js`
- Overview: `src/blockforge/README.md`
