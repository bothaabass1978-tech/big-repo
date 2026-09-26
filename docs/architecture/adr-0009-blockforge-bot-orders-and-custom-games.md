# ADR-0009: BlockForge Bot Orders and Custom Games

## Status

Accepted

## Date

2026-09-26

## Last Verified

2026-09-26

## Decision Makers

Project owner ("make the bots smarter and able to actually do stuff in game
based on how I speak", "allow me to create my own custom game", "allow me to
have more than 6 gamepasses"); Claude Code session (technical design and
implementation).

## Summary

What the player types in game chat can now be an order: bots follow, come,
stay, leave, team up, attack, help, race, build, pass, gather, emote and jump.
Each game module declares which orders it supports and reads the current order
in its bot AI. Creators get a sixth template, **Custom**: a from-scratch
top-down 3D game built in the Studio from 14 tiles, with its own rules. The
creator cap rises from 6 to 25 passes.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | None (browser JavaScript, three.js r159 view) |
| **Domain** | AI / Gameplay / Tools |
| **Knowledge Risk** | LOW |
| **References Consulted** | None external |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `live_platform_test.js` (orders parse and goal, custom validation and rules, 25 passes); e2e check that a custom game plays in 3D and a bot answers an order |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0003 (module contract, gains `orders` and `onBotOrder`), ADR-0005 (3D kit), ADR-0006 (chat engine and bot memory), ADR-0007 (Studio and templates) |
| **Enables** | Cooperative play with bots, user-authored games |
| **Blocks** | None |
| **Ordering Note** | `systems/orders.js` after `systems/ai.js`; `games/custom.js` after `games/mansion.js` |

## Context

Bots chatted well (ADR-0006) but their in-game behaviour ignored what the
player said. Creators could only build from five fixed genres, and three of
those had tile editors. The pass cap was 6.

## Decision

### Orders (`BF.orders`)

- `parse(text, bots, {partner, nearest})` finds a verb using ordered regexes
  (the first match wins, so "stop following me" becomes `leave`, not `follow`).
  It then works out who should act: named bots (display name, first name or
  username), everyone ("everyone", "guys", "team"), the bot you were just
  talking to, or the nearest bot. "Attack Mocha" names a target, not an actor.
- `willing(bot, order)` depends on personality, whether the bot is a friend,
  and past rudeness from bot memory. `ack` gives the in-character reply, or
  "cant really do that in this game" when the module does not support the
  verb.
- The runtime keeps one order per bot (`s.orders`) with a verb-specific
  `duration`. Modules read it through `ctx.botOrder(id)` and end it with
  `ctx.clearOrder(id)`. Emote, jump and free work in every 3D game.
- `goal(ctx, id, pos, me, opts)` is the shared movement helper for walking
  bots. Each follower gets its own slot around the player so they do not bunch
  up; `leave` retreats and `stay` holds.
- Each module declares `orders: [...]` and handles game-specific verbs in its
  AI or in `onBotOrder`. Examples: arena allies stop targeting you, tower
  defense bots build on request, soccer teammates pass to you, the treasure
  tycoon crew gathers for you, and the mansion bot reads the next hint.
- Chat is parsed for orders before the conversation responders run, so an
  order is acted on and answered once.

### Custom template (`BF.studio.CUSTOM`, `games/custom.js`)

- Grid of 30 × 18 cells of 40 px, capped at 540 tiles. Tiles: start, wall,
  coin, gem (+5), goal, lava, spikes (timed), enemy (patrols), key, door (the
  first key picked up opens every locked door), speed pad, jump pad, extra life,
  checkpoint.
- Rules (`layout.rules`, with defaults from `DEFAULT_RULES` and clamping in
  `BF.studio.rules`):
  - goal: collect every coin, reach the flag, survive, or top score
  - time: 30-900 s
  - lives: 1-9
  - player speed and enemy speed: slow, normal or fast
  - theme: meadow, desert, snowfield, space station, volcano or neon grid
  - bots: on or off
- Validation: exactly one spawn; the goal must be achievable (coins for
  collect, a flag for reach, at least 3 pickups for score); doors need a key.
- The module plays top-down in 3D. Bots collect coins and follow orders, and a
  score leaderboard shows in score mode. `pages/studio.js` adds a rules form
  and keeps the rules through repacks and Clear.

### Pass cap

- `BF.creator.MAX_PASSES = 25`, shown on the pass form as "n / 25". Built-in
  games now ship 5 or 6 passes each: their own two or three, plus VIP (×1.5 coins and XP,
  VIP chat tag), Sparkle Trail, and one game-specific effect checked with
  `ctx.hasPass`.

## Alternatives Considered

### Using Claude to interpret orders
Rejected as the primary path: it needs a network call and consent, and game
input has to respond instantly. The local parser covers the common phrasings.
Claude wording (ADR-0006) still styles replies when enabled.

### A general-purpose scripting language for custom games
Rejected: too much surface and risk for a local toy platform. Tiles plus a
small set of rules cover a wide range of games and stay safe to validate.

## Consequences

### Positive

- Bots feel responsive: they do what you ask, in character, and can say no.
- Creators can make genuinely different games.

### Negative

- Each module has to wire the verbs it supports. Unsupported verbs get a
  polite refusal.

### Risks

- Regex parsing can mistake idle chat for an order ("i follow that game").
  Orders are short-lived and easy to cancel ("never mind").

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| Product brief (BlockForge) | Bots act in game based on what I say | `BF.orders` plus per-module order handling in all 20 games |
| Product brief | Create my own custom game | Custom template, Studio tiles and rules, `games/custom.js` |
| Product brief | More than 6 game passes | `MAX_PASSES = 25`; 5 passes per built-in game |

## Performance Implications

- **CPU**: one parse per chat line; orders are a Map lookup per bot per frame.
- **Storage**: custom layouts are at most 540 cells plus a small rules object.

## Validation Criteria

- Unit: parse verbs, names and groups; goal slots and hold; custom
  validation, rules clamping (a lives value of 0 clamps to 1, not the
  default); 10+ passes on a custom game.
- e2e: a custom game has a rules form and plays in 3D; a bot answers an order
  typed in chat.

## Related Decisions

ADR-0003, ADR-0005, ADR-0006, ADR-0007, ADR-0008.
