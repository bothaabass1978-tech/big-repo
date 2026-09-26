# ADR-0010: BlockForge Creator Economy, Community Games and Player Controls

## Status

Accepted

## Date

2026-09-26

## Last Verified

2026-09-26

## Decision Makers

Project owner ("the creators of the other games should be ROLLING in
forgecoins", "allow the other players to create their own games run their own
ad campaigns", "allow me to make game passes that cost more than 100k", "allow
me to spend faster on ad campaigns", "the popups get annoying really fast add a
way to disable them"); Claude Code session (technical design and implementation).

## Summary

Every studio behind an official game now has an owner and a team who earn from
their games' visits and pass sales. The hits are worth billions, and the owners
top the Richest board. Other players (bots) publish their own games over time
on the same templates and engines. Those games rise, plateau and fade, and
their creators run ad campaigns that compete for the Sponsored slots. On the
player's side, ads have a spending pace (down to about 30 seconds per
campaign), passes can cost up to 100,000,000, and pop-ups can be turned down or
off. All of it is fictional and local (ADR-0004).

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | None (browser JavaScript) |
| **Domain** | Economy / Social / Live simulation / UX |
| **Knowledge Risk** | LOW |
| **References Consulted** | None external |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `community_economy_test.js` (13 tests); e2e checks for Do Not Disturb, the Richest and Top Creators boards, a community game in Discover and in play |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0004 (fictional economy), ADR-0007 (creator templates, ads), ADR-0008 (crowd model, followers), ADR-0011 (arcade engines that bot games reuse) |
| **Enables** | A believable wealth ladder, a living catalog, meaningful ad competition |
| **Blocks** | None |
| **Ordering Note** | `systems/creatoreconomy.js` and `systems/botgames.js` load after `systems/ads.js`; the world tick calls `botGames.worldTick()` before `creator.simulate()` |

## Context

The player's game with 15,000 visits made them richer than the studios behind
games with billions of visits. Bot ForgeCoin balances ignored creation
entirely, the catalog only changed when the player published something, pass
prices stopped at 100,000, ads took an hour to spend a budget, and every
background event raised a pop-up.

## Decision

### Creator economy (`BF.creatorEconomy`)

- **Owners and teams.** Each studio gets an owner and a team of 2-4 bots:
  experienced, non-handcrafted bots, picked with a stable per-studio hash.
- **Revenue per visit.** `VISIT_PAYOUT` (0.2), plus pass sales from
  first-time buyers. For studios that share is `repeatBuy` (5%) of visits,
  because most visits come from regulars.
- **Lifetime earnings** are `visits × revenue per visit`. Built-in visits grow
  live from `VISIT_EPOCH` at each game's typical visit rate, so the counters
  climb every minute and never drop on reload.
- **Personal wealth.** Owners keep 35%, team members 3%, and bot creators 80%
  of their own games' revenue minus what they spent on ads. `BF.bots.stats().coins`
  includes this, so the Richest board is led by studio owners.
- **UI.** A Top Creators leaderboard. Studio pages show the team, lifetime
  earnings and the live rate. Game pages show "Creator earned". Bot profiles
  show studio roles and "Net worth".

### Community games (`BF.botGames`)

- **Records** live in `state.botGames = {list, feed, nextAt}`. Each record
  holds the bot, the kind (a creator template or an arcade engine and
  variant), a generated name, a potential, an approval rating, visits and an
  ad.
- **Listings** have the same shape as built-in listings (`botGame: true`,
  `creatorId`). They are cached and served by `catalog.all/get/stats`, so
  Discover, search, the servers, playing and passes all work unchanged.
- **Potential** is `0.012 + r^14 × 0.8`: most games stay small, and roughly one
  in twenty takes off.
- **Life curve.** A game rises over 20 minutes, plateaus for 10 days, then
  fades with a 25-day half-life (never below 8%). Its crowd follows the
  built-in formula `peak × popularity^2.2`.
- **Visits** accumulate every tick at `players / 8` per minute.
- **Releases** happen every 170-420 seconds. Players you follow or have
  friended trigger a notification. The list is capped at 90 games; old games
  with the smallest crowds retire first, and favourites are never retired.
- **Ads.** A creator starts a campaign with a small chance per tick, three
  times as likely for games under a day old. Campaigns last 2-8 minutes, give
  a 1.35× popularity boost and take sponsored slots after the player's own
  campaigns and before house promotions.
- **Activity feed.** Releases, ads and player-count milestones (1k, 10k, 100k,
  500k) feed the Home "Happening on BlockForge" panel. Home also has a
  "Rising in the Community" row, and Discover has Official and Community
  categories.

### Player-side controls

- **Ad pacing.** `PACES` are steady (60 min), fast (10), blitz (2) and burst
  (0.5). A paced campaign buys `budget / (minutes × 60) × seconds` worth of
  impressions per tick. "Spend faster" moves a running campaign up one pace.
  Budgets go up to 50,000,000, and top-ups are 10% of the budget.
- **Pass pricing.** `MAX_PASS_PRICE` is 100,000,000. Demand per visitor is
  `0.02 × q × (100 / price)^0.85`, so expensive passes sell rarely. Sales are
  announced in one notification per batch, and big-ticket buyers are drawn
  from the rich.
- **Pop-ups.** `settings.notifications` gains:
  - `popupMode` (all, important, off)
  - `banners`
  - `inGame`
  - `dnd`

  `BF.notify.allowsPopup` and `allowsBanner` gate the toasts and banners.
  Bursts within 6 seconds collapse into one "N more notifications" toast. The
  bell menu has a Quiet (Do Not Disturb) toggle, and the bell shows a dot while
  it is on. Old saves with pop-ups off migrate to `off`.

## Alternatives Considered

### Storing a running balance for every bot
Rejected: 2,000 balances in the save, drifting on every tick. Wealth is derived
from visits, which are either deterministic (built-ins) or already stored (bot
games).

### Letting bots publish through `BF.creator`
Rejected: that system owns the player's creations (payouts to the player's
wallet, the Studio, ads paid from the wallet). Bot games only need listings and
stats, so they have their own small model.

## Consequences

### Positive

- The platform reads as an economy: famous creators are rich, and a new
  player's first game is small.
- The catalog changes while you watch, and the Sponsored slots are contested.

### Negative

- About 40M players online across 70+ games is a large, clearly fictional
  number. Crowd players are aggregate, not individually joinable (ADR-0008).

### Risks

- Catalog size: each call returns up to 160 listings (70 built-in plus up to
  90 community games). Listings are cached, and stats are O(1) per game.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| Product brief (BlockForge) | Creators of big games should be rich | `BF.creatorEconomy`, Richest and Top Creators boards |
| Product brief | Other players create games and run ads | `BF.botGames`, bot campaigns in sponsored slots |
| Product brief | Passes over 100k | `MAX_PASS_PRICE`, the demand curve |
| Product brief | Spend faster on ads | `PACES`, Spend faster |
| Product brief | A way to disable pop-ups | Pop-up modes, banner and in-game toggles, Do Not Disturb, bundling |

## Performance Implications

- **CPU**: a 4-second tick does O(bot games) arithmetic. Studio totals are
  cached for 1.5 s. The Richest board computes 2,000 bot balances through a
  precomputed role map.
- **Storage**: up to 90 small bot-game records and a 40-entry feed. Rendered
  thumbnails are capped at 28 in localStorage (ADR-0011).

## Validation Criteria

- Unit: pop-up gating and migration, burst pacing, the pass cap and demand
  curve, studio wealth and the Richest board, the Top Creators rows, live
  visits, the bot game life curve, releases and follower notifications, bot
  ads in sponsored slots, persistence.
- e2e: Do Not Disturb from the bell, owners on the Richest board, the Top
  Creators table, a new community game in Discover and in play.

## Related Decisions

ADR-0004, ADR-0006, ADR-0007, ADR-0008, ADR-0011.
