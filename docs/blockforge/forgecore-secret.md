# Forgecore: Full Walkthrough (Spoilers)

> **Spoiler warning.** This page gives away BlockForge's hidden secret step by
> step. It is for developers, testers and support. Keep it out of player-facing
> text: the brief requires that Forgecore never appears in onboarding, tutorials
> or help.

## What it is

Forgecore is an intentional, hidden developer console inside BlockForge. Once
unlocked, it grants any positive amount of **fictional ForgeCoins** to the local
save. It has no network code and does not touch real money, payments, external
accounts or other platforms. Every grant appears in the Wallet ledger as
**FORGECORE +N**. Design notes are in
`docs/architecture/adr-0004-blockforge-fictional-economy-and-forgecore-secret.md`.

## The trail

| # | Where | What to do | What you learn |
|---|---|---|---|
| 0 | **Achievements** page | Find the hidden achievement shown as **???**, with the hint *"The embers sleep where no one plays."* | Look for sleeping, empty servers |
| 1 | **Servers** tab of five games | Each has a dormant row, **Server #0000**, with 0/0 players, ∞ ping, one glowing letter and a position n/5. Its button says *Sleeping* ("…the core is cold.") | The letters, in order, spell the word |
| 2 | **Treasure Islands** | Find the hidden sandbar, cross to Hermit's Islet and talk to **Old Cinder** | Riddles pointing to the house and its furnace |
| 3 | **Mystery Mansion** cellar | Restore the power, then wake the furnace with the word | The anvil begins to glow |
| 4 | The anvil | Repeat the fire's rhythm for 3 rounds | **Forgecore unlocked**, and the terminal opens |

### 1. The five sleeping servers

| Game | Letter | Position |
|---|---|---|
| Block Battlegrounds | **E** | 1/5 |
| Sky Obby | **M** | 2/5 |
| Dungeon Frontier | **B** | 3/5 |
| Pet World | **E** | 4/5 |
| Skyline Racers | **R** | 5/5 |

The word is **EMBER**.

### 2. Old Cinder on Hermit's Islet (Treasure Islands)

- Pip, one of the islanders, drops a hint: *"I saw someone walk into the sea by
  those bushes. Into the sea!"*
- On **Crystal Isle's south-east shore**, walk through the bushes into the
  shallows. A hidden sandbar runs south-east to **Hermit's Islet**. The banner
  says "A place not on any map", and you earn the **Off the Map** badge.
- Talk to **Old Cinder**:
  - "Five embers, sleeping in five cold halls where no one ever plays."
  - "Wake them with their word, spoken at the hearth beneath the old house."
  - "The house on the hill with the moon behind it. Below its stairs, the
    furnace still listens." (The Mystery Mansion thumbnail shows the house
    with the moon behind it.)
  - "When it wakes, strike as the core remembers. It never forgets a rhythm."

### 3. The cellar furnace (Mystery Mansion)

1. In the **Foyer**, the **cellar door is under the stairs**. The cellar is
   pitch dark until the power is back on.
2. In the **Kitchen**, open the **fuse box**. Each of the five switches flips
   itself and its neighbours. Light all five lamps. The puzzle always starts
   from a solvable scramble, and it is also part of the regular murder case.
3. Back in the **Cellar**, click the **Old furnace**. The plaque reads *SPEAK
   THE WORD AND I WILL WAKE.* Set the five letter dials to **E M B E R** and
   pull the lever.
   - A wrong word just clanks ("The furnace stays cold"). You can retry as many
     times as you like.
   - The right word makes the furnace roar awake. This step is saved, so it is
     never needed again.

### 4. The anvil rhythm

- Click the **anvil**, which is marked ◆ ▲ ● ■. The fire lights the marks in a
  pattern. Strike the same marks in the same order.
- There are **3 rounds**, of 4, 5 and 6 strikes.
- A wrong strike shows "The rhythm falters. The fire shows it again." The same
  pattern replays and you try again. **Watch again** replays it at any time.
  There is no limit on attempts.
- Finishing round 3 unlocks the core:
  - A **FORGECORE** banner: "You found something that wasn't supposed to be
    found."
  - The **Forgecore Unlocked** badge.
  - The hidden achievement is revealed as **Forgecore** ("You found something
    that wasn't supposed to be found.", +1,000 XP).
  - The unlock is saved permanently.
  - The terminal opens about 1.6 s later.

### 5. The terminal

- It boots, then shows **SYSTEM STATUS: ONLINE**, **WELCOME BACK, <USERNAME>.**
  and **ENTER FORGECOIN AMOUNT**.
- Type any whole number greater than 0 (commas are fine, e.g. `250,000`) and
  press **EXECUTE** or Enter. A processing bar runs, then the terminal prints
  **FORGECORE TRANSACTION COMPLETE**, **+N FORGECOINS CREDITED** and the new
  balance.
- Invalid input (0, negative numbers, text) prints a red error and changes
  nothing. The largest allowed amount is `Number.MAX_SAFE_INTEGER` minus your
  current balance.
- Close it with **EXIT**, **Esc** or by clicking outside the terminal.
- Side effects:
  - The global ForgeCoins leaderboard counts the new balance.
  - Balance-based achievements such as **Millionaire** (10,000 FC) may unlock.
  - Quests and the Wallet's "earned this week" figure ignore Forgecore credits.

### Getting back to the terminal later

Once unlocked, any of these works:

- The lit furnace in the Mystery Mansion cellar ("Approach the core"). This
  still needs the power restored in that session.
- The **Forgecore** pill next to your level on the Profile page, or the
  Forgecore Unlocked tile under Profile → Badges.
- Typing `forgecore` anywhere in the app, outside a text field.

## No-lockout guarantees

- The sleeping servers are always listed, in every session.
- Hermit's Islet and Old Cinder are reachable in every Treasure Islands round.
- The fuse box is scrambled with real presses, so it is always solvable.
- The dials take unlimited attempts, and a solved word is saved (`wordSolved`).
- Rhythm mistakes replay the same pattern, with no failure cap.
- Resetting the account (Settings → Data) relocks the secret, and the whole
  trail can be done again.
- An imported save keeps whatever unlock state it contains.

## For developers and testers

- Code:
  - `src/blockforge/js/systems/secrets.js`: sleepers, word check, unlock and
    execute.
  - `src/blockforge/js/ui/forgecore.js`: the terminal.
  - `src/blockforge/js/games/mansion.js`: fuse box, furnace and anvil.
  - `src/blockforge/js/games/explore.js`: the sandbar and Old Cinder.
  - `src/blockforge/js/pages/game.js`: the sleeping server rows.
- Tests: `tests/blockforge/unit/secrets_forgecore_test.js`.
- To skip the trail in a dev console: `BF.secrets.unlock(); BF.forgecore.open();`.
  The developer tools (tap the build number in Settings 5 times) deliberately
  do not include a Forgecore shortcut.
