# BlockForge

A fictional platform for user-made games that runs entirely in your browser.
It has 20 playable games, an avatar shop, friends and messages full of
fictional bots, a creator studio and a ForgeCoin economy. There is nothing to
install and no server or sign-up.

> **Fictional and local only.** ForgeCoins are not real money and cannot be
> bought or cashed out. All players you meet are generated bots. Nothing leaves
> your device: there is no backend, payment system, real authentication or
> third-party service. BlockForge is an original project and is not affiliated
> with any real game platform.

## Run it

1. Open `src/blockforge/index.html` in a current Chrome, Edge, Firefox or
   Safari. Double-clicking the file works.
2. Pick **Forge Player** (@ForgePlayer). This sample account is level 12 with
   1,500 ForgeCoins, 2,450/5,000 XP, 8 friends, 23 followers and 15 following.
   Or create a new local profile. Profiles have no passwords.
3. Claim your daily reward, then press **Play** on any game.

To serve it instead: `cd src/blockforge && python3 -m http.server 8000`, then
open <http://localhost:8000>.

Nothing needs to be downloaded. Fonts come from Google Fonts when you are
online and fall back to system fonts when you are not.

## What's inside

| Area | Highlights |
|---|---|
| **Home / Discover / Games** | Continue playing, friends' activity, recommendations, 14 genre categories, sorting, favourites, likes and dislikes, live player counts |
| **Game pages** | Description, how to play, server browser (join a specific server), game store with 41 game passes and 9 products, 54 game badges, per-game leaderboards |
| **Avatar Shop** | 116 items in 17 categories across 6 rarities (common → mythic), bundles, a limited one-per-account collectible, "Purchase successful!" and "Not enough ForgeCoins." flows |
| **Inventory / Avatar** | Wear, favourite and sell items (40% back), a 14-slot avatar editor with skin tones, randomize and reset |
| **Wallet** | Live balance in the header (click it to open the Wallet) and a full ledger with categories and filters |
| **Progress** | Daily rewards 50 → 75 → 100 → 150 → 200 → 300 → 500 over a 7-day streak; 32 quests (5 daily and 4 weekly slots); 35 achievements; 6 platform badges; levels with ForgeCoin level-up rewards |
| **Social** | 640 fictional bots (22 handcrafted) with six personalities: competitive, friendly, explorer, collector, chaotic and beginner. Friends, requests, follows, blocking, messages with typing and replies, game invites, and servers that bots join and leave |
| **Create** | Build games from 5 templates (Arena, Racing, Obby, Simulator, Tower Defense) with a seed and difficulty. Publish, unpublish or delete them, add passes, and watch simulated visits and earnings |
| **Search** | Games, items and players, with autocomplete (press `/`) |
| **Settings** | Account, privacy, notifications, appearance (theme, accent, density, reduced motion, font size), gameplay (volume, touch controls, FPS counter, bot chat), and data (autosave, save now, export or import JSON, reset). Developer tools are hidden: tap the build number 5 times |

## The 20 games

Movement is WASD or the arrow keys unless noted. On touch screens a joystick
and buttons appear automatically.

| Game | Genre | Goal | Controls |
|---|---|---|---|
| Block Battlegrounds | Fighting | Win 2 of 3 timed rounds on eliminations | Attack Space/J/click · Dash Shift/K · Swap weapon Q/L |
| Skyline Racers | Racing | Three laps through every checkpoint; the top three earn podium rewards | Gas W · Brake S/Space · Steer A/D · Nitro Shift |
| Treasure Islands | Adventure | Find 12 treasures before the tide comes in; islanders have quests | Dig/Talk E/Space/Enter · Sprint Shift · Map M |
| Towerfall Legends | Strategy | Survive 20 waves of tower defense | Pick a tower 1–4, click to build · Next wave Space · Speed F · Cancel X |
| Pet World | Simulator | Send pets to coin piles, hatch eggs and hit the session goal | Send pets Space/F or click piles · Use E · Pets P · Book B |
| Sky Obby | Obby | Reach the golden portal within 6:00; checkpoints save progress | Jump Space/W · Respawn R |
| City Life | Social | Finish 3 jobs (pizza, taxi, clean-up) before your shift ends | Enter E · Leave car Q |
| Dungeon Frontier | RPG | Clear 3 floors and defeat the Frontier Warden | Attack J/Space · Dash Shift/K · Potion Q |
| Elemental Clash | Fighting | Score the most points before time runs out with fire, water, earth or air | Abilities J/K/L or 1/2/3 |
| Zombie Outbreak | Survival | Hold the farmhouse for 10 waves; repair windows and buy guns | Shoot Space/click · Reload R · Repair/Buy E · Medkit Q · Weapons 1/2 |
| Factory Tycoon | Tycoon | Buy droppers and upgraders and hit the contract target in time | Walk onto buy pads · Use E |
| Treasure Tycoon | Tycoon | Gather, build and upgrade, and survive three pirate raids | Gather/Hit E/Space |
| Mega Miners | Simulator | Mine, sell, upgrade your pickaxe and backpack, and reach the Core | Jump Space/W · Dig down S · Surface R · Use E |
| Battle Boats | Action | Sink boats (1 pt) and forts (3 pts); destroy all three forts to win | Throttle W/S · Rudder A/D · Fire left Q · Fire right E (or click) |
| Pixel Soccer | Sports | Outscore the other team 3v3, with golden goal on a draw | Kick Space/J (hold to charge) · Sprint Shift/K |
| Cosmic Survival | Survival | Survive the meteor storm until the evacuation beam at 3:00 | Turn A/D or aim with the mouse · Thrust W · Brake S · Fire Space/J |
| Castle Siege | Strategy | Survive 15 waves while balancing village income and defenses | Click plots and battlements to build · Next wave Space |
| Speed Trials | Racing | Roll through every gate in order and earn medals | Roll WASD · Brake Space · Restart R |
| Pet Battle Arena | RPG | Turn-based battles: knock out all 3 opposing pets and climb 5 ranks | Moves 1–4 or click |
| Mystery Mansion | Puzzle | Collect clues, solve puzzles and name the culprit before midnight | Point and click |

Every game has bots, rewards, win and lose conditions, and a results screen
with Play again and Leave. Game passes change gameplay, for example Double
Jump, Void Element, Tesla Tower or Auto Collect.

**Keyboard shortcuts:**

- `/` search · `?` all shortcuts · `g` then a letter to jump
  (`g h` Home, `g s` Shop, `g w` Wallet …) · `Ctrl+S` save now.
- In a game: `Enter` chat · `Esc` pause · `Tab` show or hide the side panel.

## Saving

- **Autosave.** Progress saves automatically to `localStorage` about a second
  after each change, every 30 s, and when you close the tab.
- **Autosave off.** Switch it off in Settings → Data and only **Save now**
  (or `Ctrl+S`) keeps changes.
- **Export and import.** Export downloads your save as JSON; Import restores
  it. Reset returns the account to its starting state.
- **Storage failures.** If the browser blocks storage (private mode, full
  quota), BlockForge keeps running in memory and says so in the header.

## Tests

```bash
# unit tests: platform systems and all game modules, run headlessly in Node (no browser needed)
node --test 'tests/blockforge/unit/*_test.js'

# end-to-end smoke test in Chromium: all routes, shop, all 20 games, creator
# templates, save round-trip, autosave-off reload and a phone viewport
npm i -D playwright   # once, if Playwright is not installed globally
node tests/blockforge/e2e/platform_smoke_e2e_test.js --shots /tmp/blockforge-shots
```

Current status: 53 unit tests and 66 end-to-end checks, all passing.

## Code layout

```
src/blockforge/
├── index.html          script order = dependency order
├── css/                base · components · pages · game
└── js/
    ├── core/           util, event bus + clock, storage adapter, synthesized sfx, icons, store + accounts
    ├── data/           items, games (passes, badges, products), quests/achievements, bots, thumbnails
    ├── systems/        economy, meta (quests, badges, achievements, notifications), inventory,
    │                   avatar, social, world (servers, catalog, leaderboards, search), creator, secrets
    ├── ui/             components, router, shell, actions, terminal
    ├── pages/          one file per area (home, discover, game, items, social, create, profile, settings, progress)
    ├── engine/         input, gfx (particles, camera), phys, runtime (game sessions)
    ├── games/          the 20 game modules
    └── main.js         boot
```

Design decisions are recorded in `docs/architecture/`:

- [ADR-0001 Web client architecture](../../docs/architecture/adr-0001-blockforge-web-client-architecture.md)
- [ADR-0002 Local persistence and save format](../../docs/architecture/adr-0002-blockforge-local-persistence-and-save-format.md)
- [ADR-0003 Game runtime and module contract](../../docs/architecture/adr-0003-blockforge-game-runtime-and-module-contract.md)
- [ADR-0004 Fictional economy and hidden features](../../docs/architecture/adr-0004-blockforge-fictional-economy-and-forgecore-secret.md) (contains spoilers)

To **add a game**, register a module with `BF.GameModules.register(type, {...})`
in a new `js/games/*.js` file (see ADR-0003). Then add its entry to
`js/data/games.js` and a `<script>` tag to `index.html`.

Developer notes on hidden content live in `docs/blockforge/`. **They contain
spoilers.**
