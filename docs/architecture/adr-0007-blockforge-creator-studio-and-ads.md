# ADR-0007: BlockForge Creator Studio, Advertising and Creator Earnings

## Status

Accepted

## Date

2026-09-25

## Last Verified

2026-09-25

## Decision Makers

Project owner ("add a way for me to make games, advertise them and make
forgecoins off of them"); Claude Code session (technical design and
implementation).

## Summary

Creators can hand-build levels for three templates in a Studio tile editor,
advertise their games with ForgeCoin-funded campaigns that buy sponsored
slots, and follow what their games earn on per-minute earnings charts. Studio
layouts are small validated JSON objects handed to the existing game modules
as `ctx.config.layout`. Ads spend a prepaid budget on simulated impressions;
the clicks become visits that pay out through the same creator payouts as
organic visits. Every coin involved is fictional and stays in the local save
(ADR-0004).

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | None (browser JavaScript, Canvas 2D editor) |
| **Domain** | Gameplay / Economy / Tools |
| **Knowledge Risk** | LOW |
| **References Consulted** | None external |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `creator_studio_ads_test.js` (13 tests); e2e checks for Studio, ads, sponsored slot, refund and collect |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0002 (save format: `created[]`, new `ads.campaigns[]`), ADR-0003 (templates reuse game modules), ADR-0004 (fictional economy, ledger categories) |
| **Enables** | Hand-made creator levels, sponsored placements, creator income |
| **Blocks** | None |
| **Ordering Note** | `systems/studio.js` and `systems/ads.js` load after `systems/creator.js`; `pages/studio.js` before `pages/create.js` |

## Context

Creators could already make games from five seeded templates, add passes,
publish them and collect simulated revenue. Missing were real authoring (the
levels were only random seeds), a way to promote a game, and visibility into
what a game earns.

## Decision

### Studio layouts (`BF.studio`)

| Template | Grid | Tiles | Rules |
|----------|------|-------|-------|
| Obby | 240 × 20 cells of 40 px, side view | platform, start, checkpoint, finish, lava, bounce pad, mover, crumbling, blinking, spinner | needs one Start and a Finish to its right; checkpoints number left to right |
| Tower Defense | 20 × 9 | road | one unbroken, unbranched road from the left edge to the castle on the right |
| Arena | 24 × 13 cells of 40 px | cover block | the centre spawn zone always stays clear |

- Saved as `ug.layout = {kind, cells: [[c, r, type?]], v}` after
  `BF.studio.validate()`; `BF.creator.setLayout(id, null)` returns to the
  generated level.
- Modules read `ctx.config.layout` (`BF.studio.obbyCourse`, `tdPath`,
  `arenaRects`) and fall back to their seed generator when a layout is missing
  or invalid, so a game is always playable.
- "Start from generated" converts a seeded level into an editable layout
  (a three-stage course for Obby so it fits the grid).
- Racing and Simulator keep seed-based levels (Settings → regenerate).

### Advertising (`BF.ads`)

- A campaign has a game, a headline (8-60 characters), a tier and placements
  (Home Sponsored row, Discover, Search top result). The whole budget
  (50-250,000 ForgeCoins) is charged up front with ledger category `ads`.
- Tiers set the price and speed: Standard 6, Boosted 10, Premium 16
  ForgeCoins per 1,000 impressions.
- Every world tick (4 s) a running campaign buys impressions (tier rate ×
  placement share), up to the budget left. Clicks = impressions × CTR, where
  CTR = 2.4% × game quality × headline × placement mix × fatigue. Visits are
  78% of clicks.
- Game quality (`BF.creator.quality`) rewards a description, a custom
  thumbnail, passes, a Studio-built level and a good like ratio, so better
  games get more out of the same budget.
- Visits go through `BF.creator.receiveVisits()`: a 0.2 ForgeCoin payout per
  visit, likes and favourites, and pass sales (creator share 70%). Some
  visitors stay: idle bots join the game's servers.
- Pause, resume, top up, or stop. Stopping refunds `floor(budget - spent)`.
  Finished campaigns notify with their results. Deleting a game stops its
  campaigns and refunds them. Drafts and private games never spend.
- Sponsored slots show your running campaigns first (weighted by tier), then
  rotating house promotions for official games. They are always labelled
  "Sponsored".

### Earnings

- Each creation keeps `earn {visits, passes}`, `adSpend` and a per-minute
  history (`hist`, 120 minutes). The Create page and each game's Overview show
  earned, from visits, from passes, ad spend, net profit and a bar chart, with
  Collect and Collect all.

## Alternatives Considered

### Alternative 1: A free-form 3D level editor

- **Cons**: Large UI, hard to validate, and the modules' logic is 2D.
- **Rejection Reason**: Tile grids match each module's own data model and are
  simple to validate.

### Alternative 2: Pay-per-click ads charged live from the wallet

- **Cons**: The balance could drop unexpectedly while the player plays; harder
  to reason about.
- **Rejection Reason**: A prepaid budget with refunds is predictable and can
  never overdraw the wallet.

## Amendment 2026-09-26: Custom template and 25 passes

- A sixth template, **Custom**, builds a game from scratch in the Studio
  (30 × 18 grid, 14 tiles, a rules form). See ADR-0009.
- The pass cap rises from 6 to 25 (`BF.creator.MAX_PASSES`), with new pass
  effects: Sparkle Trail and Supporter.
- Visitors to a creator's games may follow the creator, and the crowd on a
  creator game follows its recent visits. See ADR-0008.

## Consequences

### Positive

- Creators author real levels, promote them, and can earn ForgeCoins back,
  more so when the game is good.

### Negative

- Ads add a coin faucet (visits and pass sales). It is bounded by the budget,
  by fatigue, and by the game's quality, and it stays inside the fictional
  local economy.

### Risks

- Economy inflation through ads: return on spend is roughly 0.5-1.6× by
  quality, so ads are no guaranteed profit.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| Product brief (BlockForge) | "make games, advertise them and make forgecoins off of them" | Studio editor, ad campaigns with sponsored slots, earnings dashboard |

## Performance Implications

- **CPU**: negligible (one loop over campaigns per 4 s tick).
- **Storage**: layouts are compact (at most 1,600 cells); history is capped.

## Validation Criteria

- Unit tests for layouts, validation, campaign charging, spending, refunds,
  sponsored ordering and collecting.
- e2e: a Studio layout saves and plays; a campaign charges, buys visits,
  appears in the Home Sponsored row and refunds when stopped; earnings collect.

## Related Decisions

ADR-0002, ADR-0003, ADR-0004, ADR-0005.
