# ADR-0006: BlockForge Bot Conversation Engine and Optional Claude Wording

## Status

Accepted

## Date

2026-09-25

## Last Verified

2026-09-25

## Decision Makers

Project owner ("the bots should be able to dynamically respond to whatever I
say"); Claude Code session (technical design and implementation).

## Summary

Bots answer anything the player says, in direct messages and in game chat,
through a local conversation engine (`BF.chat`). The engine reads the message
(slang, intents, games, items, other bots, maths), keeps a small memory per
bot, and decides what the bot does and says. It works fully offline. When the
page runs in the claude.ai artifact viewer and the viewer allows it, Claude
only re-words the engine's decision in the bot's voice (`BF.ai`, through the
artifact `sample` capability). Facts, actions and safety stay with the local
engine.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | None (browser JavaScript) |
| **Domain** | Gameplay / Social / AI |
| **Knowledge Risk** | LOW |
| **References Consulted** | Artifact runtime `sample` capability contract (call only on a user action; `not_granted` / `rate_limited` handling) |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `chat_brain_test.js` (15 tests), e2e check "a bot answers a direct message with the right result" |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (store, bus), ADR-0003 (in-game chat through the runtime) |
| **Enables** | Dynamic DMs and game chat, invites through chat, friend requests through chat |
| **Blocks** | None |
| **Ordering Note** | `systems/chat.js` then `systems/ai.js`, after `systems/secrets.js` |

## Context

Bots used to pick canned lines by personality. The player asked for bots that
respond to *whatever* they say. There is no backend (ADR-0001), so a hosted
model cannot be assumed; the app must keep working from disk. BlockForge is
also for young players, so child-safety rules (no personal information, "free
coins" scams called out, no rude escalation) must hold whatever the wording.

## Decision

### Flow

```
player text ─► BF.chat.think(bot, text, ctx)   local, synchronous
                 normalize (slang) → safety checks → pending question? → intents
                 → decision {intent, text, facts, goal, after?, invite?}
            ─► BF.chat.reply(...)               async
                 if BF.ai.available() and the intent is not a fixed safety reply:
                     BF.ai.word(bot, text, decision)  → one short line from Claude
                 else: the local text
            ─► runtime / messages show it; decision.after() runs actions
               (friend request, accept, meet the player in a game)
```

- **Intents** cover greetings, how-are-you, names, likes and dislikes
  (remembered), maths (a safe expression parser, no `eval`), jokes and
  riddles with answer checking, game facts with live player counts, item
  facts, help topics, opinions by personality taste, invites, friend
  requests, trading, thanks and goodbyes. Fallbacks reflect questions and
  statements instead of repeating one line.
- **Memory** per bot (`state.chatmem`, at most 80 bots): nickname, likes,
  dislikes, pending question, rudeness count and mute timer, last topics.
- **Personalities** (ten, including builder, speedrunner, roleplayer and
  helper) style the text and choose tastes.

### Safety (always local)

- Personal information (address, phone, email, school, age, passwords) gets a
  "keep it private" reply that never echoes what was shared.
- Requests for free coins or items are called scams.
- Three insults mute the bot for two minutes; an apology lifts the mute.
- These safety intents are never sent to Claude for re-wording (a unit test
  checks this). The Claude instruction also repeats the rules.
- Bots say honestly that they are BlockForge bots when asked.

### Claude wording (`BF.ai`)

- Available only in the claude.ai viewer, when the page declares the `sample`
  capability and the viewer grants it. Calls happen only when the player
  sends a message, never from timers.
- One call per reply, with `modelTier: 'quick'` and `cache: false`. The prompt
  carries the persona, remembered facts, the engine's facts and goal, the last
  eight chat lines, and the player's message.
- `not_granted`, `sampling_disabled`, `not_declared` and `capability_*`
  switch the feature off; `rate_limited` pauses it for 60 s; any failure falls
  back to the local text.
- Settings → Gameplay → Bot replies: Smart (Claude when available) or Local only.

## Alternatives Considered

### Alternative 1: Claude for every reply, no local engine

- **Cons**: Nothing works offline or from disk; facts (player counts, prices)
  would be invented; safety would depend on the model alone; every chat line
  would cost the viewer usage.
- **Rejection Reason**: The local engine is the source of truth and keeps the
  app fully functional without Claude.

### Alternative 2: Bigger canned tables per personality

- **Cons**: Still cannot answer arbitrary questions, remember names or check
  riddle answers.
- **Rejection Reason**: Did not meet "respond to whatever I say".

## Consequences

### Positive

- Bots answer maths, remember names and likes, discuss games with live data,
  accept invites and meet you in-game, and stay safe for kids.
- In the claude.ai viewer, replies read naturally in each bot's voice.

### Negative

- `chat.js` is large (about 1,300 lines of patterns and templates).
- Claude wording costs the viewer's usage; it can be switched off.

### Risks

- Pattern misfires: covered by scripted conversations and unit tests.
- Model drift in wording: the facts and goal are fixed by the engine and the
  reply is trimmed to one line of at most 220 characters.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| Product brief (BlockForge) | "bots should be able to dynamically respond to whatever I say" | Local intent engine with memory, plus optional Claude wording |

## Performance Implications

- **CPU**: under 1 ms per message locally.
- **Memory**: bounded chat memory (80 bots).
- **Network**: none locally; one `sample` call per player message when Smart is on in the viewer.

## Validation Criteria

- Unit tests: maths, names, likes, identity, personal info, scams, mute and
  apology, riddles, live counts, invites, friend requests, responders, local
  fallback, safety replies never re-worded.
- e2e: a DM asking "what is 6 times 7?" gets a reply containing 42.

## Related Decisions

ADR-0001, ADR-0003, ADR-0004 (fictional economy: bots never give coins).
