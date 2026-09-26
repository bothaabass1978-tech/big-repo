# ADR-0008: BlockForge Live Platform — Followers, Scale, Limited Items and Developer Updates

## Status

Accepted

## Date

2026-09-26

## Last Verified

2026-09-26

## Decision Makers

Project owner ("add a follower system", "the top games should have hundreds of
thousands if not millions of players", "extremely rare and expensive items",
"the devs should add updates that come every once in a while, DO NOT MAKE THEM
HAPPEN TOO OFTEN"); Claude Code session (technical design and implementation).

## Summary

Four systems make the local platform feel live and large: followers who
arrive as the player grows, a crowd model that scales player counts to
millions without simulating millions of bots, limited items with fixed stock,
serial numbers and a resale market (plus two ultra-rare free finds), and rare,
authored developer updates that bring patch notes, short events, pass sales and
new limited drops. All of it is fictional and stays in the local save
(ADR-0004).

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | None (browser JavaScript) |
| **Domain** | Social / Economy / Live ops |
| **Knowledge Risk** | LOW |
| **References Consulted** | None external |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `live_platform_test.js` (15 tests); e2e checks for thumbnails, limited purchase, updates on Home, followers page |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0002 (save: new `limiteds`, `updates`, `social.milestones`), ADR-0004 (fictional economy), ADR-0006 (bots) |
| **Enables** | Social growth, platform scale, a collector economy, live events |
| **Blocks** | None |
| **Ordering Note** | `data/updates.js` after `data/thumbs.js`; `systems/limiteds.js` and `systems/updates.js` after `systems/inventory.js`; `systems/followers.js` after `systems/social.js`. The world tick (every 4 s) calls `followers.worldTick`, `limiteds.worldTick` and `updates.worldTick` |

## Context

The platform had 2,000 named bots and one limited collectible, and a top game
showed a few hundred players. The owner asked for followers, player counts in
the hundreds of thousands to millions, very rare and expensive items, and
occasional developer updates that must not come too often.

## Decision

### Followers (`BF.followers`)

- New followers arrive at `basePerMin × appeal()` per minute, capped at
  `maxPerMin`. Appeal grows with level, wins, badges, chat, creator visits and
  existing followers. People you played with and friends follow first.
- Visitors to your published games follow you at `visitFollowRate` per visit.
- A small share unfollows (`unfollowShare`); friends never do.
- Arrivals batch into one notification per `batchSeconds`. Milestones from 10 to
  10,000 followers pay ForgeCoins once each.
- Bot follower counts scale with a hash-based "star power", so the seeded
  population stays the same.

### Crowd scale (`BF.world.crowd`)

- `playerCount = trackedCount + crowd`. Tracked players are the named bots
  placed in real servers you can join. The crowd is everyone else:
  `CROWD.peak × popularity^CROWD.exp × dayCurve × weekend × drift × boost`.
- The server total adds `ceil(crowd / (maxPlayers × 0.82))`. The server browser
  lists the joinable tracked servers, six public crowd servers and a "+N more"
  line.
- Visits scale ×60 (`VISIT_SCALE`); likes and favourites scale ×12.
- Creator games draw a crowd from recent visits per minute × `sessionMin`.

### Limited items (`BF.limiteds`)

- Item fields: `limitedStock`, `soldAtStart`, `perHour`, `releasedDaysAgo`. A
  save record `{sold, mine[], rap}` is created the first time an item is seen.
- Buying takes the next serial. Other players buy `perHour` copies. Once stock
  is gone, resellers (bots) offer copies around RAP, and your copies sell back
  at 70% of RAP.
- Two new rarities: exotic and divine. Prices run up to 5,000,000.
- Ultra-rare finds (`dropChance` 1/4,000 and 1/20,000) roll when a game
  session ends. They are free and earned only by playing. Nothing is sold as a
  random draw, so there is no paid randomness.

### Developer updates (`BF.updates`, `BF.UPDATES`)

- Cadence: the first `check` only starts the schedule. The first update comes
  `firstDelayDays` (1) later, then one every `gapMinDays` to `gapMaxDays`
  (4-7) days of real time. The gap per release is a stable hash, not random.
- A check delivers at most one update. The next gap is counted from the
  delivery, so a month away brings one update, not a backlog.
- Each update prepends a changelog entry with the next version number and sets
  `updatedAt`. It runs a `eventDays` (3) event with an XP multiplier (applied in
  `ctx.xp` and at settle), a crowd boost (`BF.world.boost`) and a pass sale
  (`BF.passes.price`). Some updates release limited items marked `releasedBy`,
  which stay `notForSale` and out of every listing until then.
- After the ten authored updates, seasonal events built from
  `BF.UPDATES_SEASONAL` continue on the same schedule.
- `apply()` runs on `store:loaded`. It resets update items and changelog
  entries, then re-applies this save's updates, so one account's updates never
  leak into another's.
- UI: a notification, a "What's new" banner on Home (for 7 days), an event
  banner on the game page, and struck-through sale prices on pass cards and in
  the buy dialog.

## Alternatives Considered

### Simulating millions of bots
Rejected: memory and CPU cost. The crowd is aggregate, and only players you can
meet are simulated.

### Random update timing (Poisson)
Rejected: it can bunch updates together, and the owner explicitly asked that
they not happen too often. Fixed minimum gaps with a stable spread give a
guarantee.

### Delivering every overdue update after a break
Rejected: a flood of notifications is exactly what "not too often" rules out.

## Consequences

### Positive

- The platform reads as big and alive, with a collector economy and
  occasional events worth coming back for.

### Negative

- Crowd players are not individually joinable. Crowd servers route you into a
  tracked server.
- Update events add small coin and XP faucets for three days at a time.

### Risks

- Limited resale is a coin sink and source. Resale pays 70% of RAP, and RAP
  only drifts slowly, so flipping is not a reliable profit.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| Product brief (BlockForge) | Followers | `BF.followers`, followers and following tabs, milestones |
| Product brief | Top games with hundreds of thousands to millions of players | Crowd model: about 16M online, top game about 1.7M |
| Product brief | Extremely rare and expensive items | 15 limited items (up to 5M), 2 ultra-rare free finds |
| Product brief | Occasional developer updates, not too often | `BF.updates`: 1 day, then every 4-7 days, at most one per check |

## Performance Implications

- **CPU**: each 4 s tick does a follower roll, a loop over 15 limited items
  and one timestamp comparison for updates.
- **Storage**: limited records are small, and update records are
  `{id, gameId, v, at}`.

## Validation Criteria

- Unit: the update schedule, minimum spacing, one delivery after a long break,
  event effects and expiry, reload and account isolation, seasonal
  continuation; limited serials, sell-out and resale; drops; follower
  uniqueness and milestones; crowd scale.
- e2e: 3D thumbnails, a limited purchase, an update on Home with its sale, and
  the followers page.

## Related Decisions

ADR-0002, ADR-0004, ADR-0005, ADR-0006, ADR-0007, ADR-0009.
