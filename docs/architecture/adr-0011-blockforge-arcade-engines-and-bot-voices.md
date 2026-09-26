# ADR-0011: BlockForge Arcade Engines (50 Games) and Human Bot Voices

## Status

Accepted

## Date

2026-09-26

## Last Verified

2026-09-26

## Decision Makers

Project owner ("add 50 more unique polished and fun games", "the ai responses
are so bottish not an OUNCE of humanity in them make them sound human");
Claude Code session (technical design and implementation).

## Summary

Fifty new games ship on ten new engines, each engine running five variants that
differ in rules, hazards and look, not just colour. A shared kit (`BF.arcade`)
gives all ten the same bot crews, chat-order handling, rewards and HUD. Bot
chat now goes through a voice layer: every bot has a stable way of typing and
sends several short messages the way people do, and bots also chat with each
other.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | None (browser JavaScript, three.js r159 views) |
| **Domain** | Gameplay / Content / AI chat |
| **Knowledge Risk** | LOW |
| **References Consulted** | None external |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `arcade_games_test.js` (17 tests: every variant played headless to the end); `chat_brain_test.js`; e2e launches all 70 games in 3D and one arcade game in Classic 2D |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0003 (module contract), ADR-0005 (3D kit, thumbnails), ADR-0006 (chat engine), ADR-0009 (bot orders) |
| **Enables** | Community games on any engine (ADR-0010), a far larger catalog |
| **Blocks** | None |
| **Ordering Note** | `data/games2.js` after `data/games.js`; `games/arcadekit.js` before the ten engines; `systems/voice.js` before `systems/chat.js` |

## Context

The platform had 20 games, each on its own module, and bot chat that read like
a template engine. The owner asked for 50 more unique, polished games and for
chat that sounds like people.

## Decision

### Ten engines, five variants each (`config.variant`)

| Engine | Variants | What changes between variants |
|--------|----------|-------------------------------|
| runner | metro, lava, jungle, candy, hyper | trains coming at you, a lava wall that gains when you trip, gaps, launch pads to sky coins, blinking lasers and boost pads |
| party | palooza, color, hexfall, meteor, sumo | playlist of Color Block, Hexfall (three crumbling layers), Meteor Dodge, Sumo, King of the Hill |
| tag | freeze, infection, hide, flag, potato | freeze and thaw, infection spreading, a flashlight seeker with line of sight, capture the flag, a ticking potato |
| fishing | lake, ice, deep, lava, koi | a hole that freezes, sharks that steal slow catches, a line-heat meter, feeding for rare koi |
| farm | valley, pumpkin, space, honey, mushroom | crows, an oxygen pump, bees and pollen, slugs |
| restaurant | pizza, burger, sushi, icecream, taco | cook the dish (oven or rolling mat), grill an ingredient (patty, tortilla), melting patience |
| flight | rings, wingsuit, dragon, jet, paper | balloons, a canyon dive, fire breath at targets, boost gates, gliding with fan updrafts |
| golf | classic, neon, candy, space, castle | windmill, sliding bumpers, syrup and gumdrops, low friction with gravity wells, a drawbridge and moat |
| spooky | arcade, halls, cottage, hotel, frost | mascot, silent tall figure, a ghost through walls with creaky boards, flickering lights, a blizzard |
| quiz | trivia, math, science, world, truefalse | question banks, generated maths, the TRUE/FALSE tower |

- Every engine follows ADR-0003:
  - `update`, a 2D `draw` fallback, `render3d` and `hud`
  - bot join and leave
  - `_test` hooks
  - chat `orders`, handled through `BF.arcade.ordered`
- Game data (`data/games2.js`) sets each game's studio, description, tagline,
  popularity, approval and chat. Each engine type also sets three badges,
  leaderboard stats, controls, the how-to text and three engine passes. Every
  game has five passes: two engine passes, one extra engine pass, VIP, and
  Sparkle Trail. The loop gives the first engine pass a small price bump.
- `BF.arcade.finish` pays the standard rewards. Leaderboards use shared stat
  names, with bot ranges in `STAT_RANGES`.
- 3D thumbnails: `thumbs3d` has one staged scene per engine, themed by variant.
  Community games on an engine use the same scene. Placeholder SVGs carry the
  game id so render swaps never mix games up. localStorage keeps at most 28
  renders, and older art versions are swept out.

### Human voices (`BF.voice`)

- **A stable profile per bot**, from its id and personality:
  - lower case, `u` for "you", shortened words (`im`, `gonna`, `bc`, `rn`), no
    apostrophes
  - a signature laugh and two pet words
  - how often it stretches words, adds faces or shouts
  - a typo rate and whether it follows a typo with a `*fix`
  - how often it splits a reply into bubbles
- **Order of operations.** `chat.think` picks the words, `BF.voice.parts`
  styles them in that bot's voice, and the runtime and DMs deliver the parts
  one by one, with typing time between them.
- **Safety lines stay plain.** Personal info, scams and rudeness go through
  `serious: true`, which leaves them whole and plain.
- **Claude wording** gets `BF.voice.describe(bot)` in its brief, plus "sound
  like a person, not an assistant". Its output only has the case applied and
  is split into bubbles (`light`). It must still answer honestly if sincerely
  asked whether it is an AI.
- **Rewritten lines.** The canned "I'm a BlockForge bot" and system-sounding
  lines are rewritten: identity questions get playful, in-character answers
  from the local engine.
- **Small stories and banter.** Replies on some topics add a short story,
  keyed to the game's engine. Bots answer each other's idle lines in game chat
  (`chat.banter`), without touching what they remember about the player.

## Alternatives Considered

### Fifty separate modules
Rejected: far more code to maintain, and the games would drift apart in
controls and quality. Five variants per engine, each with its own twist, gives
variety on a shared, tested core.

### Letting Claude write every bot line
Rejected as the only path: it needs consent and a network, and it is slow for
game chat. The local voice layer makes every line sound human, and Claude
wording stays an optional extra.

## Consequences

### Positive

- 70 official games across 16 engines, and community games can use any of
  them.
- Bot chat reads like players: messy, short, reactive and consistent per
  person.

### Negative

- Variants share an engine, so some players may notice that two games share a
  core.

### Risks

- Browser storage: 70 or more thumbnails. They are capped and swept as above.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| Product brief (BlockForge) | 50 more unique, polished, fun games | Ten engines × five variants with passes, badges, leaderboards, chat and thumbnails |
| Product brief | Bot responses should sound human | `BF.voice`, rewritten lines, split messages, stories, bot-to-bot banter |

## Performance Implications

- **CPU**: engines use pooled meshes and instanced tiles; the spooky maze
  runs a breadth-first path search at most every 0.45 s per chaser.
- **Load**: about 4,000 lines of new engine code, loaded once.

## Validation Criteria

- Unit: all 50 games registered with five passes and three badges; every
  variant of every engine played headless to the end without errors and with
  sane rewards; engine rules (colour drop, legendary rarity, exact orders, hole
  in one, reachable mazes, quiz answers); voice stability and safety lines.
- e2e: all 70 games launch in 3D and exit cleanly; Pizza Rush runs in Classic 2D.

## Related Decisions

ADR-0003, ADR-0005, ADR-0006, ADR-0009, ADR-0010.
