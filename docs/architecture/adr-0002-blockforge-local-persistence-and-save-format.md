# ADR-0002: BlockForge Local Persistence and Save Format

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

BlockForge must keep every account's progress on the device, with no server,
and support export, import and reset. Each local account is saved as one JSON
document in `localStorage`, behind an adapter that falls back to memory.
Autosave is debounced and can be switched off. Saves carry a format tag and a
version, and loading migrates older saves by filling in structural defaults.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | None (browser). Uses the Web Storage API (`localStorage`). |
| **Domain** | Core |
| **Knowledge Risk** | LOW |
| **References Consulted** | MDN: Web Storage API, storage quotas and eviction |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `persistence_save_test.js` (unit); the save round-trip and autosave-off reload checks in the e2e smoke test |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (single state object, `BF.store.update`) |
| **Enables** | ADR-0003 (per-game persistent data in `progress[gameId].custom`), ADR-0004 (the ledger and the Forgecore unlock persist) |
| **Blocks** | None |
| **Ordering Note** | Bump `BF.SAVE_VERSION` and extend `migrate()` before shipping any change that renames or restructures a state slice. |

## Context

### Problem Statement

Players expect progress to stick: coins, items, levels, quests, per-game
unlocks such as pets, factories and pickaxes, friends, messages and creator
games. The brief also asks for settings to reset data and to export and
import saves as JSON, and it forbids real accounts or credentials.

### Current State

`src/blockforge/js/core/storage.js` and `src/blockforge/js/core/store.js`
implement this decision.

### Constraints

- There is no backend: `localStorage` is the only durable store available on
  `file://`.
- `localStorage` can throw: in private windows, sandboxed frames, when the
  quota is exceeded, or when site data is blocked.
- Local "accounts" are profiles on this device. They must not have passwords,
  tokens or real credentials.

### Requirements

- Saving never blocks gameplay and never crashes the app.
- A save written by an older build loads in a newer build.
- Export produces a single JSON file. Import validates it before replacing
  anything.
- The player can turn automatic saving off and save manually.

## Decision

### Architecture

```
BF.store.update(...) ──► touch() ──► scheduleSave()  (900 ms debounce, only if autosave on)
                                            │
 main.js: every 30 s ─► backgroundSave('interval') ┐  (skipped when autosave is off)
 tab hidden / unload ─► backgroundSave('unload')  ┘
 explicit actions ─────► save(reason)  load · Save now (Ctrl+S) · import · reset ·
                                        profile edit · autosave switch · sign-out
                                            │
                                            ▼
                     BF.storage.set('save:<accountId>', state)
                                            │
                  ┌─────────────────────────┴─────────────────────────┐
                  ▼                                                   ▼
   localStorage["blockforge:v1:save:<id>"]            in-memory Map (fallback when storage
   localStorage["blockforge:v1:accounts"]             throws: private mode, quota, sandbox)
                                                      → header shows "Saving to memory only"
                                                        or "Storage full: export your save"
```

### Key Interfaces

```js
// Storage adapter: JSON in and out, never throws
BF.storage.get(key)            // parsed value, or null when missing or corrupt
BF.storage.set(key, value)     // {ok, bytes, error?: 'quota'|'unavailable', memoryOnly?}
BF.storage.isPersistent()      // false when only the in-memory fallback is available
BF.storage.usage() / keys() / remove(key) / clearAll()

// Store persistence
BF.store.load(accountId)       // read + migrate(), or create the initial state
BF.store.save(reason)          // write now; emits 'store:saved' {reason, result}
BF.store.backgroundSave(reason)// save only while settings.data.autosave is true
BF.store.autosaveEnabled()
BF.store.exportData()          // {format:'blockforge-save', version, app, exportedAt, account, state}
BF.store.validateImport(data)  // {ok, error?, state?}
BF.store.importData(data)      // validate → migrate → keep the current account id → save
BF.store.resetAccount()        // back to the account's starting state

// Local profiles (no credentials)
BF.accounts.create(username, displayName, {sample?}) / signIn(id) / signOut() / remove(id)
BF.accounts.validateUsername(name)  // 3–20 letters/digits/_, unique on the device; bot and reserved names refused
```

Save document (version 1). Top-level slices: `version, meta, player, wallet,
transactions, inventory, avatar, passes, progress, catalog, recent, social,
messages, notifications, quests, achievements, badges, daily, created,
settings, secrets, bots, world, debug`.

### Implementation Guidelines

- **One document per account.** A purchase touches the wallet, ledger,
  inventory and quests, and they are written together in one `setItem`.
  There are no partial saves.
- **Keep generated data out of saves.** Store seeds (`world.seed`, creator
  `config.seed`), not generated rosters or courses.
- **Cap the growing lists.** The ledger keeps its newest 400 entries
  (`MAX_TX` in `economy.js`). Notifications are capped at 150 and each
  conversation at 200 messages.
- **Migrate by filling defaults.** `migrate()` deep-fills missing structural
  keys from a fresh state skeleton. It never copies a fresh account's content
  lists over real data, and it coerces missing arrays and objects. Renames
  need explicit code plus a `SAVE_VERSION` bump.
- **Import is all-or-nothing.** `validateImport` rejects anything without
  `format: "blockforge-save"`, any save from a newer version, and saves
  missing `player` or `wallet.balance`. Only then is the state replaced.
- **Game modules persist through `ctx.data`.** This is
  `progress[gameId].custom`, followed by `ctx.save()`, which calls
  `BF.store.touch('progress')`. Modules never touch storage directly.
- **"Autosave off" means no background writes.** Explicit player actions
  still save.

## Alternatives Considered

### Alternative 1: IndexedDB

- **Description**: Store the state and ledger in IndexedDB object stores.
- **Pros**: Much larger quota; asynchronous; can store ledger rows
  individually.
- **Cons**: The API is asynchronous only, so the page-close save cannot be
  guaranteed. There is more code, and it is harder to test in a plain Node
  `vm` sandbox.
- **Estimated Effort**: Higher
- **Rejection Reason**: Saves are small (below), so `localStorage` has more
  than enough room and is simpler.

### Alternative 2: A file on disk via download and upload only

- **Description**: No automatic persistence. Players export and import files.
- **Pros**: Nothing stored in the browser.
- **Cons**: Terrible for a game platform, because progress is lost on every
  reload.
- **Estimated Effort**: Lower
- **Rejection Reason**: The brief requires autosave. Export and import exist
  in addition to it.

## Consequences

### Positive

- Progress survives reloads and browser restarts, with no backend.
- If storage breaks, the session still works in memory, and the header says
  so.
- Save files are readable JSON, which makes support and debugging easy.

### Negative

- Saves are tied to one browser profile, with no sync across devices.
  Export and import are the manual path.
- Save files are not tamper-proof, which is acceptable because the currency is
  fictional and the game is single-player.
- Clearing site data deletes all BlockForge accounts on that browser.

### Neutral

- Several local accounts can exist on one device. Each is a profile with its
  own save.

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Storage quota exceeded | Very low (saves are 10–60 KB against a ~5 MB quota) | Medium | Memory fallback plus a "Storage full: export your save" header warning |
| Corrupt JSON in storage | Low | Medium | `BF.storage.get` returns null and logs a warning. The account loads fresh rather than crashing |
| A future build changes the state shape | Medium | High | `SAVE_VERSION` plus `migrate()`. Import rejects saves from newer builds |

## Performance Implications

| Metric | Before | Expected After | Budget |
|--------|--------|---------------|--------|
| CPU (frame time) | n/a | One `JSON.stringify` of 10–60 KB per debounced save (well under 1 ms) | 2 ms |
| Memory | n/a | One copy of the state (< 100 KB) | 1 MB |
| Load Time | n/a | One parse (< 1 ms) | 50 ms |
| Network (if applicable) | n/a | 0 | 0 |

Measured on the sample account: a fresh save is about 9.7 KB. With the ledger
full at 400 entries it is about 53 KB, of which the ledger is about 44 KB.

## Migration Plan

This is the first version (`SAVE_VERSION = 1`), so there is nothing to
migrate.

**Rollback plan**: Saves carry `format` and `version`. An older build rejects
imports from a newer one instead of misreading them.

## Validation Criteria

- [x] State survives a reload (unit: `test_state_survives_a_reload_from_storage`).
- [x] Export → change → import restores the save (unit and e2e).
- [x] Foreign, broken or newer-version JSON is rejected (unit).
- [x] Reset restores the starting values (unit).
- [x] Accounts store no password, token or secret fields (unit).
- [x] With autosave off, interval and page-close saves are skipped but manual
      saves still write (unit, plus the e2e reload check).

## GDD Requirements Addressed

Foundational: no GDD requirement. The brief specifies: autosave; settings to
reset data; JSON export and import; persistence of the Forgecore unlock; and
local fictional accounts with no real authentication or credentials.

## Related

- ADR-0001: Web client architecture (single state object)
- ADR-0003: Game runtime (`ctx.data` per-game persistence)
- ADR-0004: Fictional economy and Forgecore (ledger and unlock persistence)
- Code: `src/blockforge/js/core/storage.js`, `src/blockforge/js/core/store.js`,
  `src/blockforge/js/main.js`
- Tests: `tests/blockforge/unit/persistence_save_test.js`
