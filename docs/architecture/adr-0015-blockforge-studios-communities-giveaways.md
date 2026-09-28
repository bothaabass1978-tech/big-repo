# ADR-0015: BlockForge Player Studios, Communities, Giveaways and Acquisitions

## Status

Accepted

## Date

2026-09-28

## Last Verified

2026-09-28

## Decision Makers

Project owner ("I should be able to have my own game studio", "a communities
tab where each game studio has their own community where they can post new
info", "host massive giveaways in your community", "buy other game studios
based on how much they are worth"); Claude Code session (technical design and
implementation).

## Summary

- **Your own studio.** You can found a studio (`BF.company`). It gets its own
  community, and it can buy other studios at a price based on their earnings.
  A studio you own pays you its owner's share of revenue, and its players count
  toward your fame.
- **Communities.** Every studio has a community (`BF.communities`) with a feed
  of updates, events, teasers, milestones and polls, and with likes and
  comments from players in their own voices. You post in yours, and members
  reply.
- **Giveaways.** Giveaways you host take the prize from your wallet. They draw
  entrants who join your community, follow you and play your games, and the
  winners are paid at the end. Studios run free giveaways you can enter. All of
  it is fictional and local (ADR-0004).

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | None (browser JavaScript) |
| **Domain** | Economy / Social / UI |
| **Knowledge Risk** | LOW |
| **References Consulted** | None external |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `studio_community_test.js` (10 tests); a browser walkthrough of founding, posting, a giveaway, entering a studio giveaway and buying a studio |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0010 (studios, creator economy), ADR-0014 (fame, fans), ADR-0011 (voices), ADR-0014's dev hype (`ug.hype`) |
| **Enables** | A long-term money goal (owning the big studios), a social hub per studio |
| **Blocks** | None |
| **Ordering Note** | `systems/company.js` and `systems/communities.js` load after `systems/devteam.js`; the world tick runs them after fame |

## Context

Studios were only a byline and a page. There was nowhere for studios to talk
to players, no way to spend a large fortune on anything lasting, and nothing
a creator could run to grow an audience besides ads.

## Decision

### Your studio and acquisitions (`BF.company`, state `company`)

- **Founding.** A studio costs 2,500 ForgeCoins. It has a name (3-28
  characters, unique, filtered), a colour and a tagline, and you can have one.
  Founding gives your community a starting size of 30% of your followers.
- **Value.** A studio is worth its owner's share per minute × 2,880 (two days)
  plus 10% of everything the owner has earned so far. That comes to about 187M
  ForgeCoins for the top studio and about 15M for the smallest.
- **Buying** at that value:
  - The seller's fortune (`bots[id].coins`) keeps the price, and their
    earnings up to the sale stay in their wealth (`lifetimeAt`).
  - The studio shows `mine`.
  - Its owner share accrues to you every tick and is paid into your wallet
    every 5 minutes (ledger category `studio`).
  - Its players count toward your fame (`fame.livePlayers`), and Top Creators
    includes your studio income.
- **Selling** returns 90% of the current value.
- **UI.** My Studio (`#/mystudio`, in the sidebar) shows:
  - the founding form
  - studio value, income, earnings and members
  - the studios you own, with Sell
  - every other studio, with Buy
  Studio pages link to their community and to buying.

### Communities (`BF.communities`, state `community`)

- **One per studio** (id `st-<slug>`), plus `mine` once you found your studio.
  - A studio's members are 1.5 × its players + visits ÷ 20,000.
  - Yours grow from followers, posts and giveaways.
- **Posts.** Studios post every 2-6 minutes somewhere on the platform:

  | Kind | Example |
  |------|---------|
  | Update | New version and patch notes |
  | Event | A weekend or tonight's event |
  | Teaser | A sneak peek |
  | Milestone | A visit or player-count record |
  | Poll | "A or B?" |

  - Studios you joined are preferred, and their updates and events notify you.
  - A studio's first visit seeds five older posts.
  - Comments are in each bot's voice (ADR-0011).
  - Each community keeps 25 posts, and each post 14 comments.
- **Your posts** (3-400 characters, filtered) get 2-10 comments and likes
  scaled to your membership. You can comment on and like any post.

### Giveaways

- **Yours.**
  - Prize 100-100,000,000, 1-50 winners, 2-60 minutes.
  - The prize leaves your wallet when you start (ledger category `giveaway`).
  - Entrants per minute are 0.8 × prize^0.55 + members ÷ 40. Of them, 60% join
    your community and 35% follow you as fans.
  - Your published games get a visit hype of 1.3 + log10(prize) ÷ 6 (at most
    ×3) until 15 minutes after the end.
  - At the end, winners (bots) are paid into their fortunes, results are
    posted, and a winner messages you.
- **Studios'.**
  - One starts every 8-20 minutes, with a prize of 5k-1M scaled to the
    studio's wealth, 1-10 winners and 4-15 minutes.
  - Entrants grow to 800-6,000.
  - Entering is free and joins you to the community.
  - Your chance is winners ÷ entrants, and a win pays prize ÷ winners.
  - This is a free, fictional reward. Nothing is paid to take part, which
    keeps it within the project's no-gambling rule.

## Alternatives Considered

### Letting bots buy your games
Deferred: it would need negotiation UI and could take your work away.

### A real forum with threads
Rejected: a feed of posts with comments matches how game communities are
used, and keeps the save small.

## Consequences

### Positive

- Fortunes have somewhere to go: buying the big studios is a long goal that
  also drives fame.
- The platform feels inhabited: studios talk, fans comment, and giveaways
  happen.

### Negative

- More generated text in the save (capped as above).

### Risks

- Income only accrues while BlockForge is open, like the rest of the economy.

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|--------------------------|
| Product brief (BlockForge) | Your own game studio | `BF.company.found`, My Studio page, your community |
| Product brief | A communities tab where studios post | `BF.communities`, Communities and community pages |
| Product brief | Massive giveaways in your community | `communities.host`, entrants, growth, winners |
| Product brief | Buy studios at their worth | `company.value`, `buy`, `sell`, owner income, fame |

## Performance Implications

- **Ticks.** A tick does O(active giveaways) work, plus one post every few
  minutes.
- **Studio totals.** They come from the creator economy's cache, which is
  cleared after a studio changes hands.

## Validation Criteria

- **Unit (`studio_community_test.js`):**
  - founding costs and name rules
  - values that follow earnings
  - buying moves income and fame and pays the seller
  - income payouts, and selling at 90%
  - buying needs a studio and enough coins
  - seeded community feeds, joining and likes
  - comments on your posts
  - a hosted giveaway grows the community and pays the winners
  - studio giveaways are free and fair
  - persistence
- **Browser walkthrough.**
  - Founded Pixel Forge Games and posted.
  - A 50,000 giveaway drew 463 entrants in its first minute, and members rose
    to 6,285.
  - Entered Boulder Bros' giveaway.
  - Bought Old Harrow Games for 14.5M, earning 2,756 a minute.

## Related Decisions

ADR-0004, ADR-0010, ADR-0011, ADR-0014.
