# ADR-0004: BlockForge Fictional Economy, Ledger and the Forgecore Secret

> **Spoiler note**: this ADR describes how the hidden Forgecore feature is
> built. Step-by-step answers are kept separately in
> `docs/blockforge/forgecore-secret.md`.

## Status

Accepted

## Date

2026-09-25

## Last Verified

2026-09-25

## Decision Makers

Project owner (BlockForge product brief, including its safety section and the
Forgecore specification); Claude Code session (technical design and
implementation).

## Summary

BlockForge has its own fictional currency, ForgeCoins. It needs a trustworthy
wallet and ledger, rewards and prices, and a hidden developer "Forgecore"
terminal that grants any positive amount. None of it may resemble real money,
paid randomness or a security bypass. Every balance change goes through
`BF.economy.earn()` / `spend()`, which write categorised ledger entries.
Randomised rewards cost only currency earned inside the game, and they show
their odds. Forgecore is an explicit, local feature in `BF.secrets`. Players
reach it through a repeatable puzzle chain that cannot lock them out, and its
grants appear in the ledger as `FORGECORE +N`.

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | None (browser) |
| **Domain** | Core / Gameplay economy |
| **Knowledge Risk** | LOW |
| **References Consulted** | None needed; plain JavaScript |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `economy_wallet_test.js`, `inventory_shop_test.js`, `secrets_forgecore_test.js`, and the shop checks in the e2e smoke test |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (store), ADR-0002 (ledger and unlock persistence), ADR-0003 (the chain passes through game modules) |
| **Enables** | Shop, game passes and products, daily rewards, quests and achievements payouts, creator earnings, Forgecore |
| **Blocks** | None |
| **Ordering Note** | None |

## Context

### Problem Statement

The brief asks for a wallet shown in the header, a transaction ledger,
purchases with success and failure messages, daily rewards
(50/75/100/150/200/300/500), quest, achievement and level rewards, game passes
that change gameplay, item selling, and creator earnings. It also asks for a
hidden Forgecore feature that grants any positive amount of ForgeCoins. The
brief sets hard limits:

- "This is a local fictional simulation. Do not implement: real payment
  processing, real currency, ... real authentication, real user credentials
  ... All currency is fictional."
- "Do NOT use real-world gambling or paid randomized mechanics."
- Forgecore "must be an intentional developer feature built into the
  fictional/local game economy, not a real-world exploit or security bypass".
- No visible "FREE MONEY", "INFINITE COINS", "ADMIN" or "CHEAT" buttons.
- Forgecore must not appear in the normal onboarding or tutorial.
- "There should be no possibility of permanently locking the player out of the
  secret."

### Current State

`src/blockforge/js/systems/economy.js`, `inventory.js` and `secrets.js`,
together with `src/blockforge/js/ui/forgecore.js`, implement this decision.

### Constraints

- Everything is local (ADR-0002). A save file can be edited by hand, and that
  is fine for a single-player fictional game.
- Balances are JavaScript numbers and must stay exact integers.

### Requirements

- Every change to the balance is explained by a ledger entry.
- A purchase is atomic: either coins and item both move, or neither does.
- Randomness never takes real money, and the currency cannot be bought with
  real money.
- Every step of the Forgecore chain can be retried indefinitely.

## Decision

### Architecture

```
 faucets                                              sinks
 ───────                                              ─────
 daily streak (50…500) ─┐                        ┌─ Avatar Shop items / bundles
 game rewards (ctx) ────┤                        ├─ game passes (gameplay effects)
 quests / achievements ─┤   BF.economy.earn()    ├─ game store products
 level-ups ─────────────┼──► ledger entry ──►    │   BF.economy.spend()
 item sales (40%) ──────┤   {amount, balance,    │   (fails cleanly: "Not enough
 creator earnings ──────┤    desc, cat, ts}      │    ForgeCoins.")
 developer tools ───────┤   cap: MAX_SAFE_INTEGER│
 FORGECORE ─────────────┘   ledger: newest 400   └─
                               │
                               ▼
               'wallet:changed' → header chip, Wallet page, toasts
```

Forgecore chain. Every step can be repeated, and none has a failure limit:

```
 hidden "???" achievement hint ─► 5 dormant "Server #0000" rows (one letter each)
        ─► a hidden character in one game gives riddles ─► a dark cellar in another game
        ─► restore power (lights-out, always solvable) ─► letter dials + lever (unlimited tries)
        ─► 3-round rhythm (a mistake replays the pattern) ─► BF.secrets.unlock()
             ├─ badge "Forgecore Unlocked" + hidden achievement revealed as "Forgecore"
             ├─ secrets.forgecore.unlocked persisted
             └─ terminal (BF.forgecore.open) ─► BF.secrets.execute(n) ─► economy.earn(n, 'FORGECORE', 'forgecore')
 later access: the lit furnace ("Approach the core"), the Forgecore badge or pill on the
 profile, or typing "forgecore" anywhere outside a text field (only once unlocked)
```

### Key Interfaces

```js
BF.economy.balance() · canAfford(n)
BF.economy.earn(amount, desc, cat)   // → tx | null; cat: daily|game|quest|achievement|level|sale|creator|forgecore|debug|gift
BF.economy.spend(amount, desc, cat)  // → {ok, reason?: 'insufficient'|'invalid', need?, tx?}
BF.economy.history(filter)           // 'all' | 'in' | 'out' | category

BF.secrets.sleeper(gameId)           // dormant server row data, or null
BF.secrets.checkWord(word)           // furnace dial check
BF.secrets.markLit() / unlock() / isUnlocked() / state()
BF.secrets.execute(input)            // → {ok, amount, balance} | {ok:false, error}
BF.forgecore.open() / close() / isOpen()
```

### Implementation Guidelines

- **Never write `wallet.balance` directly.** Use `earn` or `spend` so the
  ledger stays complete. Amounts are floored to integers. Credits clamp at
  `Number.MAX_SAFE_INTEGER`, and the ledger records only the amount actually
  credited.
- **Quest progress ignores unearned coins.** The `coins_earned` quest does not
  count `forgecore` or `debug` credits. The Wallet page's "earned this week"
  figure excludes them too.
- **Randomness is free and fictional.** Pet World eggs cost PetBucks, a
  currency earned inside Pet World. Their odds are shown, and a pity counter
  guarantees a Rare or better within 10 hatches of the same egg. Dungeon loot and treasure digs come from
  play. Nothing random is sold for ForgeCoins, and ForgeCoins cannot be bought.
- **Forgecore input is validated.** It accepts a whole number greater than 0
  (commas allowed) that is no larger than `MAX_SAFE_INTEGER − balance`.
  Anything else prints an error line and changes nothing.
- **The obfuscation is not security.** The dial word is stored reversed and
  base64-encoded only so a casual source read doesn't spoil it. The feature is
  meant to be found.
- **No lockout, by construction.**
  - The dormant servers are always listed.
  - The hidden character is always reachable.
  - The power puzzle starts from a scramble of real presses, so it is always
    solvable.
  - The dials allow unlimited attempts.
  - A rhythm mistake replays the same pattern.
  - `wordSolved` persists, so the dial step is never repeated.
  - Resetting the account relocks the secret, and it can then be found again.
- **Never advertise it.** Onboarding, tutorials, help and settings do not
  mention it. The only in-app hints are in-world ones.
- **Developer tools are separate.** They are hidden behind five taps on the
  build number in Settings, and their ledger entries are labelled "Developer
  grant" (category `debug`).

## Alternatives Considered

### Alternative 1: A cheat code or settings toggle for Forgecore

- **Description**: A code typed on the home page, or a hidden switch.
- **Pros**: Trivial to implement.
- **Cons**: The brief asks for a multi-step discovery (clue → hidden location →
  input sequence → terminal) and forbids anything that looks like a cheat
  button.
- **Estimated Effort**: Lower
- **Rejection Reason**: It doesn't meet the specification. Typing "forgecore"
  is allowed only as a convenience after unlocking.

### Alternative 2: Randomised egg or crate purchases with ForgeCoins

- **Description**: Shop crates that roll random items.
- **Pros**: A common engagement pattern.
- **Cons**: It resembles paid randomised mechanics, which the brief forbids.
- **Estimated Effort**: Similar
- **Rejection Reason**: Safety constraint. Game-store "crates" such as the
  Medkit Crate have fixed contents, and eggs use earned in-game currency with
  published odds.

## Consequences

### Positive

- The ledger explains every coin, including Forgecore grants, which are
  clearly labelled.
- The economy is easy to tune: prices, rewards and passes all live in
  `js/data/`.
- The secret is discoverable, satisfying and impossible to fail permanently.

### Negative

- Once Forgecore is unlocked, the economy can be bypassed at will. That is
  intended: it is the player's reward, and it stays local.
- Save files can be edited by hand. This is accepted for a local, single-player,
  fictional game.

### Neutral

- Quests and the Wallet's "earned this week" figure ignore Forgecore credits.
  The global ForgeCoins leaderboard and balance-based achievements (such as
  Millionaire, 10,000 FC) look at the balance, so a Forgecore grant counts
  there. That is a local payoff: the only other leaderboard entries are
  fictional bots.

## Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| A future change credits coins without a ledger entry | Low | Medium | Code review rule above. `economy_wallet_test.js` checks that earn and spend write entries carrying the resulting balance, and that a failed spend writes nothing |
| Someone mistakes Forgecore for a real exploit | Low | Low | The terminal footer reads "LOCAL CORE · FICTIONAL FORGECOINS ONLY · NOTHING HERE LEAVES THIS DEVICE"; no network code exists |
| A player gets stuck partway through the chain | Low | Medium | Every step is retryable (see guidelines). The spoiler doc exists for support |

## Performance Implications

| Metric | Before | Expected After | Budget |
|--------|--------|---------------|--------|
| CPU (frame time) | n/a | Negligible (ledger writes are O(1) with a 400-entry cap) | < 1 ms |
| Memory | n/a | Ledger ≤ about 44 KB in the save | 100 KB |
| Load Time | n/a | None | n/a |
| Network (if applicable) | n/a | 0 | 0 |

## Migration Plan

This is a new system, so there is nothing to migrate.

**Rollback plan**: Removing `js/ui/forgecore.js` and the furnace spot in
`js/games/mansion.js` disables the terminal. The economy itself has no
dependency on Forgecore.

## Validation Criteria

- [x] Starting balance is 1,500 (unit). Clicking the header ForgeCoins balance opens the Wallet (e2e).
- [x] A purchase shows "Purchase successful!"; insufficient funds show "Not enough ForgeCoins." (e2e).
- [x] Every balance change produces a ledger entry (unit).
- [x] Forgecore: execute is refused while locked; unlock awards the badge and
      hidden achievement and persists; execute credits exactly N with a
      `FORGECORE` ledger entry; zero, negative and non-numeric input are rejected (unit).
- [x] The full chain was played end to end in a browser. A wrong dial word was
      refused, a wrong rune replayed the same pattern, and the retry unlocked the
      core with no page errors (2026-09-25).
- [x] No visible "FREE MONEY", "INFINITE COINS", "ADMIN" or "CHEAT" labels anywhere in the UI.

## GDD Requirements Addressed

Foundational: no GDD requirement. This ADR implements the brief's economy
(ForgeCoins, wallet, ledger, shop, passes, daily rewards, quest, achievement
and level rewards), its safety section (fictional currency only, no paid
randomness, no real services), and its Forgecore specification.

## Related

- ADR-0001: Web client architecture
- ADR-0002: Local persistence (ledger and unlock state)
- ADR-0003: Game runtime (game rewards via `ctx.reward` and `ctx.end`)
- Spoilers: `docs/blockforge/forgecore-secret.md`
- Code: `src/blockforge/js/systems/economy.js`, `src/blockforge/js/systems/secrets.js`,
  `src/blockforge/js/ui/forgecore.js`, `src/blockforge/js/games/mansion.js`,
  `src/blockforge/js/games/explore.js`, `src/blockforge/js/pages/game.js`
