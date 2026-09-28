# ADR-0017: BlockForge Real Multiplayer Through the Artifact Runtime

## Status

Accepted

## Date

2026-09-28

## Last Verified

2026-09-28

## Decision Makers

- **Project owner.** "I gave my friend access to the artifact but I think we
  are separate. He searched my username and it didn't show up. Make it
  actually multiplayer, and make sure there is backwards compatibility."
- **Claude Code session.** Technical design and implementation.

## Summary

- **The problem.** Until now every BlockForge was a world of its own: bots,
  servers, the economy and your friends list all lived in one browser's save.
- **The fix.** `BF.net` (`js/systems/net.js`) connects the real people who
  open the published BlockForge on claude.ai. It uses three runtime
  capabilities: `user` (an opaque id), `db` (a shared player directory) and
  `room` (live presence).
- **What real players can do.** They find each other by username, send and
  accept friend requests, message each other, gift ForgeCoins, invite and
  join each other's servers, and see each other's characters and chat inside
  a game.
- **Without the platform** (a saved copy, a public-link visitor, the unit
  tests), BlockForge plays exactly as before.
- **Old saves** load unchanged.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | None (browser JavaScript); the claude.ai artifact runtime, contract 0.2.58 |
| **Domain** | Networking / Social / Persistence |
| **Knowledge Risk** | MEDIUM: the runtime's `db`, `room` and `user` capabilities are new. The code follows their published type definitions (`claude.d.ts`, `db.d.ts`, `room.d.ts`, `user.d.ts` for 0.2.58). |
| **References Consulted** | The artifact capability type definitions for contract 0.2.58 |
| **Post-Cutoff APIs Used** | `claude.use()`, `db.collection().onSnapshot`, `db.doc().set`, `room.presence`, `room.onPeers`, `room.onConnection`, `user.id`, `user.can` |
| **Verification Required** | `net_multiplayer_test.js` (18 tests against an in-memory runtime); `multiplayer_e2e_test.js` (two separate browsers, 19 checks) |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0002 (save format), ADR-0006 (chat), ADR-0012 (gifts), ADR-0014 (fame), ADR-0005 (3D rigs) |
| **Enables** | Playing with friends. Later: shared leaderboards, real-player trading |
| **Blocks** | None |
| **Ordering Note** | `systems/net.js` loads after `systems/communities.js`. `main.js` connects after sign-in. |

## Context

BlockForge is published as a claude.ai artifact.

- **Why the friend couldn't find the owner.** Each viewer runs their own copy
  with their own `localStorage`, so two people with access to the same page
  never met.
- **What the runtime offers.** Capabilities the page can declare:
  - `user` gives an opaque per-person id.
  - `db` is a shared JSON document store with per-path access rules.
  - `room` reaches whoever has the page open right now, through presence
    objects and events.
- **Constraints.**
  - A page declaring `db` is organization-internal.
  - Public-link visitors are not admitted to `room` or `db`.
  - Viewers and Commenters (the `view` level) can read shared documents but
    cannot write them.
  - Anyone admitted can set their own presence (4 KiB, identifier keys).
  - Events on topics are editor-only unless opened.
- **Requirements.** Real players must not break solo play, old saves or the
  unit tests, and nothing may use a real name or email.

## Decision

### Identity

- **Ids.** `user.id()` is the only identity. The `user` capability is
  declared without scopes, so no names, avatars or emails are requested.
- **What others see.** Players are known by their in-game username and
  display name. These are chosen in BlockForge and published by the player
  themselves.
- **Links.** The UI never shows or links a raw id. A real player is `rp-<hash>`
  in routes (`#/user/rp-…`, `#/messages/rp-…`) and in the status dots.

### One document per person, holding their outbox (`db`)

- **Path.** `p/<id>`:
  `{v, uid, profile, seenAt, to: {<id>: {friend, at, declinedAt, msgs, gifts, claimed, got, invite}}}`.
- **Access rules** (declared at publish):
  - `p` is read `view`, write `admin`.
  - `p/{self}` is write `interact`.
  - Everyone admitted reads the directory, and Contributors and up write only
    their own document.
- **Only the sender writes.** Receiving is reading the other person's
  `to[myId]`. Because each document has a single writer and there are no
  transactions, there is nothing to conflict on.
- **Friendship** is mutual intent: both outboxes say `friend: true`.
  - Declining or removing sets `declinedAt`, which outranks the other side's
    older request.
- **Gifts.**
  - The sender pays at once, from their local wallet.
  - The recipient claims each gift id once and lists it in `claimed`. That
    is how the sender sees it was received, and how a second device of the
    recipient knows not to claim it again. On connect, your own document
    restores your outbox (`recoverOutbox`).
  - Gifts are limited to 1,000,000 each and respect the recipient's gift
    privacy (friends only by default).
- **Size limits.**
  - Up to 30 messages of 300 characters per recipient.
  - Up to 20 gifts per recipient.
  - A body over 240 KB drops to 8 messages per recipient.
  - 500 directory documents are read.

### Live presence (`room`)

Each open page sets one presence object:

- the player's compact profile (username, level, fame tier, avatar item ids)
- where they are (`g` game, `sv` server number, `pos` = x, y, z, yaw and
  movement, sampled at most every 120 ms)
- their latest in-game chat line (`say`)
- a trimmed outbox, keyed by an identifier-safe hash of the recipient's id

Presence gives:

- **Online status.** Online and "Playing …" statuses, using the same shape
  as the bots' (`world.botStatus` defers to `BF.net.status`).
- **Joining a friend.** Their server number is opened locally
  (`world.openServer`) when a real player or an invite names it, so friends
  land on the same server.
- **Seeing each other in games.** Real players on your server:
  - are drawn with their own avatars in 3D (`net-<key>` actors, eased toward
    their reported positions), with a name tag and chat bubble
  - are listed in the roster and counted in the player count
  - hear each other's server chat
- **Delivery for view-only players.** Viewers cannot write a document, so
  their requests and messages ride in presence.
  - Recipients acknowledge messages with `got` and gifts with `claimed`.
  - Presence keeps carrying anything unacknowledged, so it is delivered the
    next time both are online.

All presence and document content is untrusted and is sanitised:

- Usernames must match `[A-Za-z0-9_]{3,20}`.
- Text is clamped and stripped of control and bidirectional characters, then
  run through the chat filter and always escaped when rendered.
- Avatar items must exist and fit their slot.
- Numbers are clamped.
- A document must name its own owner.
- Anything addressed to someone else is never read.

### Your save (`state.net`, backward compatible)

- **Contents.** `{people, out, threads, claimed, blocked, seen}`:
  - real players you know (so friends and conversations survive while
    they're offline)
  - your outbox
  - conversations
  - claimed gift ids
  - blocked ids
  - which requests and invites were already announced
- **Migration.** `store.migrate` adds an empty slice to older saves and fills
  in partial ones. `SAVE_VERSION` stays 1, and nothing else in the save
  changes.
- **Privacy.** `settings.privacy.realPlayers` (on by default) publishes
  `{hidden: true}` instead of a profile. The player is then invisible and
  unsearchable, while existing conversations keep working.

### UI

Everywhere a bot player can appear, a real player can too, marked
"Real player":

- **Search**: the header suggestions and the search page.
- **Friends**:
  - a Real friends list
  - real requests and a connection status line
  - Find Players
- **Messages**: a merged list. The thread view has gift delivery marks and
  a note that messages are stored in shared data.
- **Profiles**: add, accept, message, gift, join, invite and block.
- **The in-game roster**, plus a Settings > Privacy toggle.
- **Unread and request badges** include real players.
- **Refreshes.** Pages re-render only when who is online changes. Status
  text updates in place.

### Friend-request flood for famous players

This is part of the same request. See the ADR-0014 amendment.

## Alternatives Considered

### Room events for messages and requests
Rejected. Event topics are editor-only unless opened to Contributors, which
would leave Viewers out. Events are also never replayed, so offline delivery
would be impossible. Presence reaches everyone admitted, and documents
persist.

### One shared document per conversation or friendship
Rejected. Two writers on one document would lose each other's
last-writer-wins updates, and nothing can stop a third person writing it.
Single-writer outboxes need neither transactions nor trust in other writers.

### Real names from the `user` profile scope
Rejected. BlockForge identities are in-game handles, and real names are not
needed to play.

## Consequences

### Positive

- The owner and their friend can find each other, be friends, chat, trade
  ForgeCoins and play on the same server, seeing each other move.
- Solo play, saved copies and tests are unaffected.

### Negative

- **Sharing.** Declaring `db` makes the artifact organization-internal, and
  public-link visitors play solo. A friend needs to be invited in the Share
  menu, at Contributor or above to use the directory while the other person
  is offline.
- **No private messaging.** Messages between real players are readable by
  anyone with access to this BlockForge. The UI says so.
- **Shown, not simulated.** Each device runs its own match: bots and scores
  are local, and real players are shown but don't collide or fight.
- **Fictional currency, client-side.** A modified client could send gifts it
  never paid for. This is accepted because the currency is fictional.

### Risks

- The capability APIs are new. The code degrades to solo play on any `null`
  namespace or terminal error.
- Editors (`admin`) could overwrite anyone's directory document. This is the
  platform's level model.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| Product brief (BlockForge) | "Make it actually multiplayer" | `BF.net` directory, presence, friends, messages, gifts, same-server play |
| Product brief | The friend can find you by username | Directory documents and presence feed search and Find Players |
| Product brief | Backwards compatibility | Save migration, `v` fields, tolerant readers, solo fallback |

## Performance Implications

- **Subscriptions.** Each page holds one directory subscription and one room
  subscription.
- **Presence** is diffed per field and sent at most every 120 ms in a game
  (the platform coalesces to about 30 per second).
- **Directory writes** happen only when the document body actually changes.
  Follower counts are rounded to two significant figures so they don't
  churn.
- **Processing** runs only on structural presence changes (not movement),
  and pages refresh only when the online set changes.

## Validation Criteria

**Unit (`net_multiplayer_test.js`)**, two to three simulated people on a
shared in-memory runtime (`tests/blockforge/mock_claude.js`):

- solo without a runtime
- finding by username
- request and accept
- decline and remove
- messages (once, unread, replies)
- gifts (once, delivery mark, second device)
- view-only presence delivery
- same-server join and chat
- invites
- going offline
- hostile documents
- invisibility
- blocking
- migrating old saves
- delayed delivery with acknowledgements
- the flood

**End-to-end (`multiplayer_e2e_test.js`)**: two browsers with separate
saves, driving the real UI:

- search suggestions and Find Players
- a request accepted from the other browser
- the badge
- a message
- Join from the Friends page landing on the same server number
- the friend's 3D character and chat in the game
- a gift
- a view-only third player
- going offline
- no page errors

## Related Decisions

ADR-0002, ADR-0004, ADR-0005, ADR-0012, ADR-0014.
