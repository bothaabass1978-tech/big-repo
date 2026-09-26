# BlockForge

A fictional platform for user-made games that runs entirely in your browser.
It has 70 playable 3D games, plus community games that fictional bot
creators keep publishing. It also has 3D blocky avatars, an avatar shop, and
friends and messages full of bots who chat like real people. There is a creator
studio with a level editor, ad campaigns and creator earnings, and a ForgeCoin
economy in which the studios behind the hits are the richest players. There is
nothing to install and no server or sign-up.

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
| **Home / Discover / Games** | Continue playing, friends' activity, recommendations, 14 genre categories plus **Official** and **Community**, sorting, favourites, likes and dislikes, live player and visit counts that climb as you watch. Home has a live **Happening on BlockForge** feed (new releases, ad launches, player-count milestones), a **Rising in the Community** row and **Fresh from Creators** |
| **Game pages** | Description, how to play, server browser (join a specific server), game store with 351 game passes (5 per game) and 9 products, 204 game badges, per-game leaderboards, and what the creator has earned from the game |
| **Community games** | Bots publish their own games every few minutes on the creator templates and arcade engines. Each one rises, peaks and fades on its own curve: most stay small and a few become hits. Their creators run ad campaigns that compete with yours for the Sponsored slots. Players you follow tell you when they release something. Every community game is playable |
| **Creator economy** | Every studio has an owner and a team who earn from their games' visits and pass sales. The biggest studios have earned billions of ForgeCoins, and their owners lead the **Richest** board. A **Top Creators** board ranks studios, bot creators and you. Studio pages show the team and live earnings; bot profiles show their studio roles, their own games and their net worth |
| **Avatar Shop** | 133 items in 17 categories across 8 rarities (common → mythic, then exotic and divine), bundles, **Limited Drops** with fixed stock, serial numbers and a resale market (up to 5,000,000 ForgeCoins), two ultra-rare free finds (1 in 4,000 and 1 in 20,000 finished games), "Purchase successful!" and "Not enough ForgeCoins." flows |
| **Inventory / Avatar** | Wear, favourite and sell items (40% back), a 14-slot avatar editor with skin tones, randomize and reset |
| **Wallet** | Live balance in the header (click it to open the Wallet) and a full ledger with categories and filters |
| **Progress** | Daily rewards 50 → 75 → 100 → 150 → 200 → 300 → 500 over a 7-day streak; 32 quests (5 daily and 4 weekly slots); 35 achievements; 6 platform badges; levels with ForgeCoin level-up rewards |
| **3D** | Every game and every avatar renders in 3D (three.js, vendored). The avatar editor and profiles have a live, drag-to-spin viewer. Settings → Gameplay → Graphics: Auto, High, Low or Classic 2D |
| **Social** | 2,000 fictional bots (60 handcrafted) with ten personalities: competitive, friendly, explorer, collector, chaotic, beginner, builder, speedrunner, roleplayer and helper. Friends, requests, **followers** (people follow you as you level up, win and publish games, with milestone rewards), blocking, messages, game invites. The platform runs at real scale: about 40 million online, top games over a million players across tens of thousands of servers |
| **Bot chat** | Bots understand and answer whatever you type, in DMs and in game chat: questions, maths, jokes and riddles, game facts with live player counts, opinions, invites ("wanna play Sky Obby?" and they meet you there) and friend requests. They sound like people: each bot has its own way of typing (lower case or not, slang, a signature laugh, the odd typo and `*fix`), sends short messages one after another, tells little stories and jokes around with other bots in game chat. They remember your name and what you like, and they keep chat safe (no personal info, "free coins" scams called out). In the claude.ai viewer, bots can word their replies with Claude (Settings → Bot replies) |
| **Bot orders** | Tell bots what to do in game chat and they do it: "Poppy follow me", "everyone dance", "stay here", "help me", "fight me", "build a tower", "pass me the ball". Each game supports the orders that make sense there; friendly bots and friends say yes more often |
| **Updates** | The studios behind the games ship an update now and then, never often: the first a day after you start, then one every 4 to 7 days. Each brings patch notes in the game's update log and a three-day event (bonus XP, a bigger crowd, a pass sale) and some bring a new limited item |
| **Create** | Build games from 6 templates (Arena, Racing, Obby, Simulator, Tower Defense, and **Custom** from scratch). Hand-build Obby, Tower Defense, Arena and Custom levels in the **Studio** tile editor. Custom games have 14 tiles (walls, coins, gems, lava, spikes, enemies, keys and doors, pads, checkpoints, a goal) and their own rules (goal, timer, lives, speeds, theme, bots). Add up to 25 passes priced up to 100,000,000 ForgeCoins (pricier passes sell less often, and big-ticket buyers are rich players), publish, and run **ad campaigns**: Standard / Boosted / Premium tiers; Home, Discover and Search placements; prepaid budgets up to 50,000,000 with refunds; and a spending pace from Steady (an hour) to Burst (about 30 seconds), with **Spend faster** on running campaigns. Follow earnings from visits and pass sales on per-minute charts with **Collect all** |
| **Search** | Games, items and players, with autocomplete (press `/`) |
| **Pop-ups** | Settings → Notifications → Pop-ups: show all, important only (friends, invites, messages) or none; switch off banners; stay quiet while playing (the default). **Quiet** in the bell menu is Do Not Disturb. Bursts collapse into one "N more notifications" pop-up, and everything still lands in the bell |
| **Settings** | Account, privacy, notifications, appearance (theme, accent, density, reduced motion, font size), gameplay (volume, touch controls, FPS counter, graphics, bot chat, bot replies), and data (autosave, save now, export or import JSON, reset). Developer tools are hidden: tap the build number 5 times |

## The 70 games

Movement is WASD or the arrow keys unless noted. On touch screens a joystick
and buttons appear automatically.

### The original 20

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

### 50 more on ten arcade engines

Each engine runs five games with their own rules, hazards and look.

| Engine | Games | Goal | Controls |
|---|---|---|---|
| Runner | Metro Dash, Lava Escape, Jungle Sprint, Sugar Sprint, Hyperlane | Outlast the other runners: trains, a chasing lava wall, gaps, launch pads, lasers | Lanes A/D · Jump Space/W · Slide S |
| Party | Party Palooza, Color Craze, Hexfall, Meteor Mayhem, Sumo Smash | Survive minigames (Color Block, Hexfall, Meteor Dodge, Sumo, King of the Hill) and score the most points | Move WASD · Jump Space · Shove E/Shift |
| Tag | Freeze Frenzy, Infection Tag, Hide & Sneak, Flag Wars, Hot Potato Panic | Freeze tag, infection, hide and seek with a flashlight, capture the flag, hot potato | Move WASD · Sprint Shift · Interact E |
| Fishing | Lakeside Lures, Ice Hole Fishing, Deep Sea Legends, Magma Fishing, Koi Garden | Cast, strike and keep the line in the green; sharks, freezing holes, line heat, rare koi | Hold Space to cast, Space to strike, hold Space to reel |
| Farm | Harvest Valley, Pumpkin Patch Tycoon, Star Greenhouse, Honey Hive, Mushroom Grove | Till, plant, water, harvest and sell to hit the season goal; crows, oxygen, bees, slugs | Move WASD · Work E · Seeds 1–4 |
| Restaurant | Pizza Rush, Burger Blitz, Sushi Spin, Scoop Shop, Taco Truck Tycoon | Build each order at the stations, cook it and serve it before patience runs out | Move WASD · Pick up/drop E · Bin Q |
| Flight | Sky Rings, Wingsuit Canyon, Dragon Riders, Jet Stunt League, Paper Plane Pro | Fly the rings for points and time; balloons, a canyon dive, fire breath, boost gates, updrafts | Steer WASD · Boost Shift · Special Space |
| Golf | Mini Golf Mania, Neon Putt, Candy Course Golf, Zero-G Golf, Castle Putt | Six holes in the fewest strokes; windmills, bumpers, syrup, gravity wells, a drawbridge | Aim A/D · Hold and release Space to putt · Reset R (+1) |
| Spooky | Nightshift Arcade, Hollow Halls, Creaky Cottage, Shadow Hotel, Frostbite Station | Find every item and escape; hide in lockers, sneak past the light | Move WASD · Pick up/hide E · Sneak Shift |
| Quiz | Brain Blast, Speed Math Showdown, Lab Coat Quiz, World Tour Trivia, True or False Tower | Stand on the right answer before time runs out; wrong pads drop away | Move WASD onto a pad |

Every game has bots who follow chat orders, rewards, badges, leaderboards,
win and lose conditions, and a results screen with Play again and Leave. Game
passes change gameplay, for example Double Jump, Void Element, Tesla Tower or
Auto Collect.

All games run in 3D on WebGL: arenas with glowing cover, a neon race track
through city blocks, floating islands, a farmhouse at night, a voxel dig
site, a football stadium with a crowd and more. On older devices pick
**Low** graphics; **Classic 2D** brings back the original flat renderer.

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

# end-to-end smoke test in Chromium: all routes, shop, all 70 games in 3D,
# Classic 2D, bot chat, creator templates, Studio, ads, ad pacing and earnings,
# save round-trip, autosave-off reload, 3D thumbnails, limited items, developer
# updates, followers, a custom game with a chat order, Do Not Disturb, the
# Richest and Top Creators boards, a community game, and a phone viewport
npm i -D playwright   # once, if Playwright is not installed globally
node tests/blockforge/e2e/platform_smoke_e2e_test.js --shots /tmp/blockforge-shots
```

Current status: 126 unit tests and 140 end-to-end checks, all passing.

## Code layout

```
src/blockforge/
├── index.html          script order = dependency order
├── vendor/             three.min.js (r159, MIT) + its licence
├── css/                base · components · pages · game
└── js/
    ├── core/           util, event bus + clock, storage adapter, synthesized sfx, icons, store + accounts
    ├── data/           items, games and games2 (passes, badges, products), quests/achievements, bots, thumbnails, developer updates
    ├── systems/        economy, meta (quests, badges, achievements, notifications), inventory,
    │                   avatar, social, world (servers, catalog, leaderboards, search), creator,
    │                   studio (level layouts), ads (campaigns, pacing), creatoreconomy (studio owners, wealth),
    │                   botgames (community games and their ads), secrets, voice (how each bot types),
    │                   chat (bot conversation), ai (Claude wording), followers, limiteds (stock, serials, resale),
    │                   updates (developer updates), orders (bot orders)
    ├── ui/             components, router, shell, actions, terminal
    ├── pages/          one file per area (home, discover, game, items, social, create, studio, profile, settings, progress)
    ├── engine/         input, gfx (particles, camera), g3d (3D world kit), avatar3d (rigs + thumbnails), thumbs3d (3D game thumbnails),
    │                   props3d (merged pets, cars, zombies, ships), phys, runtime (game sessions)
    ├── games/          the 20 original game modules, the Custom template, and arcadekit (shared bots, orders,
    │                   rewards, HUD) with the ten arcade engines (runner, party, tag, fishing, farm,
    │                   restaurant, flight, golf, spooky, quiz)
    └── main.js         boot
```

Design decisions are recorded in `docs/architecture/`:

- [ADR-0001 Web client architecture](../../docs/architecture/adr-0001-blockforge-web-client-architecture.md)
- [ADR-0002 Local persistence and save format](../../docs/architecture/adr-0002-blockforge-local-persistence-and-save-format.md)
- [ADR-0003 Game runtime and module contract](../../docs/architecture/adr-0003-blockforge-game-runtime-and-module-contract.md)
- [ADR-0004 Fictional economy and hidden features](../../docs/architecture/adr-0004-blockforge-fictional-economy-and-forgecore-secret.md) (contains spoilers)
- [ADR-0005 3D rendering for games and avatars](../../docs/architecture/adr-0005-blockforge-3d-rendering.md)
- [ADR-0006 Bot conversation engine and optional Claude wording](../../docs/architecture/adr-0006-blockforge-bot-conversation-engine.md)
- [ADR-0007 Creator Studio, advertising and earnings](../../docs/architecture/adr-0007-blockforge-creator-studio-and-ads.md)
- [ADR-0008 Live platform: followers, scale, limited items and developer updates](../../docs/architecture/adr-0008-blockforge-live-platform.md)
- [ADR-0009 Bot orders and custom games](../../docs/architecture/adr-0009-blockforge-bot-orders-and-custom-games.md)
- [ADR-0010 Creator economy, community games and player controls](../../docs/architecture/adr-0010-blockforge-creator-economy-and-community-games.md)
- [ADR-0011 Arcade engines (50 games) and human bot voices](../../docs/architecture/adr-0011-blockforge-arcade-engines-and-bot-voices.md)

To **add a game**, register a module with `BF.GameModules.register(type, {...})`
in a new `js/games/*.js` file (see ADR-0003). Add `three: true` with a
`render3d(dt)` view and a `hud(g)` to render it in 3D (ADR-0005). Then add its
entry to `js/data/games.js` and a `<script>` tag to `index.html`. To add a game
on an existing arcade engine, add a variant to the engine and one entry to
`js/data/games2.js` (ADR-0011).

Third-party code: three.js r159 (MIT licence, `vendor/LICENSE-three.txt`).

Developer notes on hidden content live in `docs/blockforge/`. **They contain
spoilers.**
