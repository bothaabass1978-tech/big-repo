# ADR-0012: BlockForge ForgeCoin Gifts

## Status

Accepted

## Date

2026-09-27

## Last Verified

2026-09-27

## Decision Makers

Project owner ("add a gifting feature where you can gift forgecoins to others
and vice versa"); Claude Code session (technical design and implementation).

## Summary

The player can gift ForgeCoins to any player they have not blocked, and other
players (bots) gift the player too. Bots react like people: they thank you,
sometimes follow you or send a friend request, and now and then send some
back. Friends gift you for a level-up, to return a favour, because they liked
your game, or because you asked nicely in chat. Gifts from bots have a daily
limit, so gifting stays a social feature and never becomes a coin source. All
of it is fictional and local (ADR-0004).

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | None (browser JavaScript) |
| **Domain** | Economy / Social |
| **Knowledge Risk** | LOW |
| **References Consulted** | None external |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `gifts_test.js` (8 tests); e2e: gift from a profile, gift cards in DMs, the Wallet gift list |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0002 (save format), ADR-0004 (fictional economy), ADR-0006 (chat engine), ADR-0010 (bot wealth), ADR-0011 (bot voices) |
| **Enables** | Social play around the economy |
| **Blocks** | None |
| **Ordering Note** | `systems/gifts.js` loads after `systems/botgames.js`; the world tick calls `gifts.tick()` |

## Context

ForgeCoins could only be earned from the platform and spent in shops. Players
could not share them, and bots, some of whom are now very rich (ADR-0010),
never shared theirs.

## Decision

### Model (`BF.gifts`, state `gifts`)

- **Records.** `state.gifts` holds:
  - `log`: the last 80 gifts
  - `byBot`: totals given and received per player
  - `day`, `inToday`, `countToday`: today's bot-gift totals
  - `nextAt`: when the next unprompted gift may arrive
  - `asked`: when you last asked each bot for coins
- **Privacy.** `settings.privacy.gifts` is `everyone`, `friends` (the default)
  or `none`. Everyone also lets followers send tips.
- **Money.** Every gift goes through `economy.spend` or `economy.earn` with the
  category `gift`, so the ledger stays complete. The bot's side is recorded in
  `state.bots[id].coins`, so gifts show in their net worth.

### Sending (`send`)

- Gifts are 10 to 10,000,000 ForgeCoins, with an optional 100-character note
  that goes through the chat filter.
- The form asks for confirmation for gifts of 5,000 or more, or more than half
  your balance.
- A gift posts a gift card in the DM thread. The bot answers in its own voice,
  scaled to the size of the gift (`THANKS`, `THANK_EXTRA`). It may follow you
  or send a friend request.
- For gifts of 50 or more there is a 30% chance the bot sends 10-40% back
  20-90 seconds later. That is always less than you sent, so there is no loop.

### Receiving (`receive`, `tick`, `onLevel`, `consider`)

- **Limits.** Bots can gift you at most 5,000 ForgeCoins and 5 gifts a day
  (`T.bot`), all reasons together.
- **Unprompted gifts.** The first comes 6-15 minutes after loading, then one
  every 35-120 minutes. The giver is an online friend (or follower), weighted
  by how much you chat and whether they owe you a gift. The note fits the
  reason: returning a favour, liking your game, a fan tip, or just because.
- **Level-ups.** After a level-up there is a 30% chance a friend sends a
  congratulations gift.
- **Size.** Most gifts are 25-250. Rich players sometimes send up to 2,500.
- **Asking in chat.** Only friends can say yes, and each bot considers you once
  every 20 hours. The chance depends on personality, and is higher if you have
  gifted them before. "No" comes with a human reason: we just met, you just
  asked, I'm saving, I'm broke.
- **Delivery.** A gift arrives as a DM gift card plus a `gift` notification,
  which counts as important for pop-up settings (ADR-0010).

### Chat (ADR-0006)

- The scam rule now covers only promises of free coins, generators, hacks and
  dupes. Asking a friend for coins is a real request (`ask_gift`).
- New intents:
  - `gift_offer`: "can I send you coins"
  - `gift_got` / `gift_what`: "did you get my gift"
  - `gift_thanks`: thanks for a gift they sent
- A bot that says yes sends the gift through the reply's `after` action.

### Players stay in character

The owner asked that bots "firmly believe they are real humans playing a
popular game".

- **Scripted replies.** The local engine's identity answers ("are you a bot?",
  "r u real", "is this an npc") are firm, human replies. Goals that leaked the
  truth are rewritten: "you are a bot", "you live on the BlockForge servers",
  "no weather inside the servers".
- **Claude wording.** The brief casts Claude as a real person who plays a
  hugely popular platform, and tells it to stay in character when asked in the
  game whether it is a bot. One narrow exception: if a viewer clearly steps
  outside the game and sincerely asks whether an AI model writes the messages
  (for example they name Claude or say "out of character"), it does not deny
  it.
- **Why this is not deceptive.** The app itself says the players are
  generated: the Messages page says bots reply, and the Settings text and
  README say so too. Characters playing humans inside that disclosed fiction
  is ordinary game dialogue.
- **Money.** `BF.chat.wealth(bot)` gives each bot's net worth, studio and games.
  It feeds:
  - a new `wealth` intent ("how are you so rich" names their studio and game)
  - rich-player versions of the gift refusals (`rich_no`, `rich_stranger`,
    never "I'm broke")
  - the Claude brief, which now says that gifting is real, to follow the gift
    decision exactly, and never to claim to have no coins

### UI

- **Where to gift from:**
  - the Gift button on bot profiles
  - Send a gift in the player menu
  - the Gift button in DM threads
  - the Wallet's Gifts section: totals, recent gifts, today's remaining
    allowance and Send a gift (friends and recent players)
- **Other places:**
  - a Gifts filter on Notifications
  - Settings → Privacy → Who can gift me ForgeCoins

## Alternatives Considered

### Unlimited gifts from bots
Rejected: 2,000 bots, some worth billions, would make gifting a faucet that
outweighs every other source of coins, and against ADR-0004's intent.

### Gifting items instead of coins
Deferred: items have stock, serials and resale rules (ADR-0008) that gifting
would complicate. Coins were asked for.

## Consequences

### Positive

- Gifting gives friendships weight: people you help remember it.
- Rich creators occasionally share, which fits the economy of ADR-0010.

### Negative

- More small DM traffic. Gift notifications respect Quiet mode and the pop-up
  settings.

### Risks

- Bot gifts could inflate coins. The daily limit and per-bot request cooldown
  bound this at 5,000 a day, less than a few games' rewards.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| Product brief (BlockForge) | Gift ForgeCoins to others and receive gifts | `BF.gifts.send`, `receive`, `tick`, `onLevel`, chat requests, UI entry points |

## Performance Implications

- **CPU**: one comparison per world tick until a gift is due, then O(friends).
- **Storage**: at most 80 gift records, per-player totals, and 60 request times.

## Validation Criteria

- Unit (`gifts_test.js`):
  - sending moves coins and posts a card; bad amounts and blocked players fail
  - receiving follows the privacy setting and the daily limit
  - requests: strangers get no, the cooldown holds
  - chat routing
  - the timed gift
  - persistence and migration
- e2e:
  - gift from a profile
  - both gift cards in the DM thread
  - the Wallet gift list

## Related Decisions

ADR-0002, ADR-0004, ADR-0006, ADR-0010, ADR-0011.
