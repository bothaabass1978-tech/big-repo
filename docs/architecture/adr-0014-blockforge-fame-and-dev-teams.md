# ADR-0014: BlockForge Fame and Dev Teams

## Status

Accepted

## Date

2026-09-28

## Last Verified

2026-09-28

## Decision Makers

Project owner ("add a fame system ... if you're the most followed person and
you join a game everyone is gonna be extremely surprised and freaking out and
swarming you", "allow me to hire devs who can improve my game bringing in
more players and more forgecoins"); Claude Code session (technical design and
implementation).

## Summary

Everyone on BlockForge has a fame score and a tier, and the #1 player is the
Legend. Fame changes how servers react when you join. From Popular up,
players notice you. At Famous they freak out, follow you around and add you.
Superstars get mobbed, and fans pour into the server. You can also hire
developers for your games. They ship real updates that raise quality and
bring players back, and they draw salaries from your earnings.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | None (browser JavaScript) |
| **Domain** | Social / Economy / Runtime |
| **Knowledge Risk** | LOW |
| **References Consulted** | None external |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `fame_devs_test.js` (9 tests); browser check of the Superstar mob, the Most Famous board and the Team tab |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0008 (followers), ADR-0009 (bot orders), ADR-0010 (creator economy), ADR-0007 (creator games and regulars), ADR-0006 (chat) |
| **Enables** | A long-term goal for creators: become the most famous player |
| **Blocks** | None |
| **Ordering Note** | `systems/fame.js` and `systems/devteam.js` load after `systems/gifts.js`. The world tick runs gifts, then devs, then fame |

## Context

Your followers were a list of the 2,000 named players, so you could never have
more than 2,000, while top players showed hundreds of thousands. Studio
owners with a million players had a few hundred followers. Nothing reacted to
being well known, and a game only improved when you edited it yourself.

## Decision

### Followers and fans (`BF.followers`)

- `social.fans` counts followers you will never meet one by one, and
  `followers.total()` is named followers plus fans.
- Visits to your games make one or two named followers per batch, and the
  rest become fans. `visitFollowRate` is 0.008.
- Milestones and the UI use the total. The milestones now run to 1,000,000.
- Bots also get `creatorEconomy.fansOf(id)`:
  - 1.2 × the players in their studio's games, for owners
  - 0.08 × for team members
  - 1 × the players in their own community games

### Fame (`BF.fame`)

- **Score.** Followers (named + fans) + 1.2 × players in your games right now
  + 10 × level + wins ÷ 2. Bots are scored the same way.
- **Speed.** Bot scores are cached for 60 s, and scoring all 2,000 takes about
  30 ms.
- **Tiers.** Each tier pays a ForgeCoin bonus once and posts a notification.

  | Tier | Fame needed | Bonus |
  |------|-------------|-------|
  | Newcomer | 0 | none |
  | Rising Star | 1k | 250 |
  | Known | 10k | 1k |
  | Popular | 50k | 5k |
  | Famous | 250k | 25k |
  | Superstar | 1M | 100k |
  | Legend | #1 (and at least 1M) | 250k |

- **Arrival.** `fame.arrive(api)` runs when you join a server. The runtime
  passes chat, follow orders, emotes, `world.rushSession(n)`, a banner and the
  feed, and fame decides what happens:

  | Level | Tier | What happens |
  |-------|------|--------------|
  | 0 | below Popular | Nothing. Known players are noticed 25% of the time |
  | 1 | Popular | One or two players notice you |
  | 2 | Famous | About 60% freak out, half swarm (follow orders, cheers), 45% follow you, friend requests, a banner, then fan chat during play |
  | 3 | Superstar | Everyone freaks out and swarms, 80% follow, 3-7 fans rush into the server, news brings 150-900 fans |
  | 4 | Legend | As Superstar, with 6-12 fans rushing in and 800-4,000 fans from the news |

- **Chat.**
  - A `famous` intent answers "do you know who I am" by your tier.
  - The Claude brief says who you are from Popular up.
- **Extras.**
  - Famous and up get a verified ✔ in game chat.
  - Your fans play your games: `fanVisits` is 0.04% of your followers per
    minute, spread across your published games.
- **UI.**
  - Home: a tier pill with your rank.
  - Profile: a fame card for you, and a tier pill on bot profiles.
  - Leaderboards: a Most Famous tab.

### Dev teams (`BF.devs`)

- **Roles.**

  | Role | What they do |
  |------|--------------|
  | Builder, Scripter, Artist, Game Designer | Ship updates |
  | Marketer | +12% organic visits per skill star |
  | Community Manager | +1.2% quality per star |

- **Candidates.**
  - Six at a time, re-rolled every 30 minutes or on demand.
  - Skill is 1-5★ (30/30/22/12/6%).
  - Salary per hour is 40 × skill² × a role factor.
  - Developers of 3★ or better only work for Known, Popular or Famous creators.
  - Hiring pays the first hour, and a team has at most 8 people.
- **Updates.**
  - They ship every 45 ÷ power minutes (6-45).
  - Each update adds a version with generated patch notes and raises
    `ug.devq` by 0.015 × average skill (at most 0.4).
  - It brings 15% of your regulars back at once, plus 0.2% of your followers.
  - It sets a 30-minute hype of 1 + 0.15 × power (at most ×3) on organic
    visits, and sends a notification.
- **Effects.** `creator.quality` adds `devs.quality(ug)`, which raises
  retention (`keepMax` is now 0.3) and pass demand. Organic visits are
  multiplied by `devs.visitMult(ug)`.
- **Salaries.**
  - Paid pro rata every tick from the game's pending earnings first.
  - The rest comes from the wallet in 10-minute batches (ledger category
    `devs`).
  - A developer unpaid for 10 minutes quits and says so in DMs.
- **UI.** The game dashboard gets a Team tab: stats, the next-update bar, your
  developers, candidates (locked ones show the fame they need) and the update
  log.
- **State.**
  - `state.devs` holds hires, candidates and a log.
  - Salary ticks mark `devStats`, not `devs`, so the Team tab only rebuilds
    on hires, fires, rolls and updates.

## Alternatives Considered

### Fame as followers only
Rejected: a creator whose game has a million players right now should be
famous even before those players follow them.

### Devs that change game code
Rejected: templates are generated, so updates act on the simulation
(quality, retention, visits, patch notes) and never break a playable game.

## Consequences

### Positive

- Creators have a long-term goal, and fame shows up everywhere: in games,
  chat, profiles and boards.
- Money has a new sink with a return. Teams cost ForgeCoins every hour and pay
  back in players.

### Negative

- Superstar servers are loud. Fan chat respects the bot chat setting's pacing
  only loosely, because it is the point of the feature.

### Risks

- Follow orders only apply in games that support follow. Other games still
  get the chat, emotes, follows and fans rushing in.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| Product brief (BlockForge) | A fame system from followers and game players | `BF.fame` score, tiers, rank, Most Famous board |
| Product brief | Famous players get mobbed when they join | `fame.arrive`, `world.rushSession`, follow orders, fan chat |
| Product brief | Hire devs to improve games for players and ForgeCoins | `BF.devs`, Team tab, updates, marketers, salaries |

## Performance Implications

- **Fame.** Scoring 2,000 bots takes about 30 ms, once a minute. Your own
  score is O(your games).
- **Devs.** Work per tick is O(hires). The Team tab does not rebuild on ticks.

## Validation Criteria

- **Unit (`fame_devs_test.js`):**
  - a newcomer's standing, and the Legend
  - fans raising tier and rank, and bonuses paid once
  - creators followed by their players
  - arrival scaling from nothing to a mob
  - fame chat
  - hiring cost and fame gates
  - updates raising quality and visits
  - salaries from earnings and the wallet, and unpaid devs quitting
  - persistence
- **Browser.** A Superstar joining Block Battlegrounds filled the server to
  20/20, with 19 players swarming and every player freaking out in chat. The
  Team tab hired three developers and shipped an update.

## Related Decisions

ADR-0006, ADR-0007, ADR-0008, ADR-0009, ADR-0010.
