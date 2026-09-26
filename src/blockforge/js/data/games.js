/**
 * BlockForge — built-in game registry (data only).
 *
 * Each entry is registered through BF.registerGame(), the same entry point a
 * future game #21, #22 ... #50 would use. `gameType` selects the gameplay module
 * (js/games/*.js registered via BF.GameModules.register). Passes carry an
 * `effect` key that the module checks with ctx.hasPass(passId).
 */
(function (BF) {
  'use strict';

  /** Discover categories (order = display order). */
  BF.GAME_CATEGORIES = ['Action', 'Adventure', 'Obby', 'Racing', 'Simulator', 'Tycoon', 'Strategy', 'Sports', 'Survival', 'Puzzle', 'RPG', 'Social', 'Fighting', 'Horror'];

  BF.GAME_REGISTRY = BF.GAME_REGISTRY || [];

  /**
   * Register a game listing. Missing optional fields get sensible defaults so a
   * minimal entry ({id, name, gameType, genre}) is enough to appear everywhere.
   * @param {object} meta
   */
  BF.registerGame = function (meta) {
    const g = Object.assign({
      categories: [meta.genre],
      creator: 'BlockForge Labs',
      description: '',
      maxPlayers: 12,
      approval: 0.85,
      baseVisits: 100000,
      baseFavorites: 5000,
      baseLikes: 8000,
      createdAt: '2025-01-01',
      updatedAt: '2026-09-01',
      ageRating: 'All Ages',
      popularity: 0.5,
      passes: [],
      products: [],
      badges: [],
      leaderboard: [],
      chat: {},
      controls: '',
      howTo: '',
      changelog: [],
      activeBots: 6,
      builtIn: true,
    }, meta);
    g.categories = Array.from(new Set([g.genre].concat(g.categories || [])));
    g.passes.forEach((p) => { p.gameId = g.id; p.kind = 'pass'; });
    g.products.forEach((p) => { p.gameId = g.id; });
    g.badges.forEach((b) => { b.gameId = g.id; });
    const existing = BF.GAME_REGISTRY.findIndex((x) => x.id === g.id);
    if (existing >= 0) BF.GAME_REGISTRY[existing] = g;
    else BF.GAME_REGISTRY.push(g);
    return g;
  };

  const pass = (id, name, price, desc, effect, icon) => ({ id, name, price, desc, effect, icon: icon || 'ticket' });
  const badge = (id, name, desc, icon) => ({ id, name, desc, icon: icon || 'medal' });
  const lb = (stat, label, order, format) => ({ stat, label, order: order || 'desc', format: format || 'num' });

  BF.registerGame({
    id: 'block-battlegrounds', name: 'Block Battlegrounds', gameType: 'arena', genre: 'Fighting', categories: ['Action'],
    creator: 'IronAnvil Studios', maxPlayers: 20, activeBots: 7, popularity: 1.0, approval: 0.91,
    baseVisits: 48200000, baseFavorites: 812000, baseLikes: 1240000,
    createdAt: '2021-03-14', updatedAt: '2026-09-18', ageRating: '9+', featured: true,
    description: 'Drop into a blocky arena, grab your loadout and battle up to seven rivals across three timed rounds. Grab health packs, speed boosts and shields, keep your streak alive, and take the round with the most eliminations.',
    howTo: 'Most eliminations wins the round. Win two of three rounds to take the match.',
    controls: 'WASD / arrows move · Mouse aims · Click or Space attacks · Q swaps loadout · Shift dashes',
    passes: [
      pass('bb_vip_arena', 'VIP Arena', 250, 'Unlocks the VIP Arena map: lava vents, golden coin drops worth ForgeCoins, and a raised throne platform.', 'vip_arena', 'crown'),
      pass('bb_double_xp', 'Double XP', 400, 'Every match in Block Battlegrounds awards twice the XP.', 'double_xp', 'bolt'),
      pass('bb_extra_loadout', 'Extra Loadout', 300, 'Adds a third loadout slot: the Quake Hammer, a heavy area slam. Swap with Q.', 'extra_loadout', 'hammer'),
    ],
    products: [{ id: 'tool_flame_blade', type: 'item', name: 'Flame Blade', price: 350, desc: 'Blade skin with ember trails.' }],
    badges: [
      badge('bb_first_blood', 'First Blood', 'Score your first elimination.', 'crosshair'),
      badge('bb_victor', 'Arena Victor', 'Win a Block Battlegrounds match.', 'trophy'),
      badge('bb_streak', 'Unstoppable', 'Get a 5-elimination streak without dying.', 'fire'),
    ],
    leaderboard: [lb('kills', 'Eliminations'), lb('wins', 'Wins')],
    chat: {
      any: ['who wants to 1v1', 'this map is so good', 'watch the lava lol', 'hammer is op', 'i need health', 'grab the shield!!', 'teaming is cringe', 'gg so far'],
      start: ['glhf', 'lets goooo', 'round 1 fight!', 'nobody touch my health pack'],
      win: ['ez round', 'gg that was close', 'too good', 'another W'],
      lose: ['lag', 'rematch?', 'how did i lose that', 'next round is mine'],
      kill: ['got em', 'sorry not sorry', 'outplayed', 'bonk'],
    },
    changelog: [{ v: '4.2', date: '2026-09-18', notes: 'New VIP throne platform. Quake Hammer cooldown tuned.' }, { v: '4.1', date: '2026-07-02', notes: 'Shield pickup added. Bots now respect dash cooldowns.' }],
  });

  BF.registerGame({
    id: 'skyline-racers', name: 'Skyline Racers', gameType: 'racing', genre: 'Racing', categories: ['Action'],
    creator: 'Nitro Nest', maxPlayers: 8, activeBots: 5, popularity: 0.85, approval: 0.9,
    baseVisits: 31500000, baseFavorites: 540000, baseLikes: 802000,
    createdAt: '2021-08-02', updatedAt: '2026-09-10', ageRating: 'All Ages', featured: true,
    description: 'Street racing above the clouds. Pick a track, pick a car and fight for the podium over three laps. Hit boost pads, hold the racing line through every checkpoint and set a best time the whole server will chase.',
    howTo: 'Finish three laps through every checkpoint. Top three earn podium rewards.',
    controls: 'W / Up accelerate · S / Down brake · A D / Left Right steer · Shift nitro (pass)',
    passes: [
      pass('sr_nitro', 'Nitro Pack', 300, 'Adds a nitro meter that refills over time. Hold Shift for a big speed burst.', 'nitro', 'rocket'),
      pass('sr_premium_garage', 'Premium Garage', 500, 'Unlocks the Falcon GT and Thunder V8: faster cars with better grip.', 'premium_garage', 'key'),
    ],
    products: [{ id: 'tool_underglow', type: 'item', name: 'Neon Underglow', price: 200, desc: 'Cyan glow under every car you drive.' }],
    badges: [
      badge('sr_podium', 'Podium Finish', 'Finish a race in the top three.', 'podium'),
      badge('sr_winner', 'Speed King', 'Win a race.', 'flag'),
      badge('sr_clean', 'Clean Lap', 'Complete a lap without leaving the track.', 'check'),
    ],
    leaderboard: [lb('bestTime', 'Best Time (Downtown Loop)', 'asc', 'time'), lb('wins', 'Race Wins')],
    chat: {
      any: ['anyone wanna race?', 'that last corner is evil', 'nitro gang', 'who took my line', 'the harbor track is my fav', 'drift king here', 'boost pads op'],
      start: ['3 2 1 go go go', 'dont crash on turn 1', 'see you at the finish'],
      win: ['first place baby', 'gg', 'too fast', 'new pb!'],
      lose: ['i got boxed in', 'rematch', 'so close', 'my car is slow ok'],
    },
    changelog: [{ v: '3.0', date: '2026-09-10', notes: 'Sky Highway track added. Car handling rework.' }],
  });

  BF.registerGame({
    id: 'treasure-islands', name: 'Treasure Islands', gameType: 'explore', genre: 'Adventure', categories: ['RPG'],
    creator: 'Salty Pixel Co.', maxPlayers: 16, activeBots: 5, popularity: 0.7, approval: 0.88,
    baseVisits: 19800000, baseFavorites: 402000, baseLikes: 510000,
    createdAt: '2020-06-21', updatedAt: '2026-08-27', ageRating: 'All Ages',
    description: 'Sail between five sunny islands, dig up X-marked treasure, collect rare shells and chat with the locals. Help Captain Marlow find the pieces of his map, trade with the merchant, and get your haul back to the beach before the tide comes in.',
    howTo: 'Collect 12 treasures before the tide timer runs out. Talk to the islanders for quests.',
    controls: 'WASD / arrows walk · E dig and talk · Shift sprint (Explorer Pack) · M map',
    passes: [
      pass('ti_explorer', 'Explorer Pack', 350, 'Shows every buried treasure on your map and unlocks sprinting.', 'explorer', 'mapPin'),
      pass('ti_magnet', 'Treasure Magnet', 450, 'Shells, gems and coins fly to you from a wide radius.', 'magnet', 'sparkle'),
    ],
    products: [{ id: 'tool_golden_shovel', type: 'item', name: 'Golden Shovel', price: 400, desc: 'Dig twice as fast and find more coins.' }],
    badges: [
      badge('ti_first_dig', 'First Dig', 'Dig up your first treasure.', 'gem'),
      badge('ti_cartographer', 'Cartographer', "Recover all of Captain Marlow's map pieces.", 'mapPin'),
      badge('ti_hidden', 'Off the Map', 'Find the hidden islet.', 'compass'),
    ],
    leaderboard: [lb('treasures', 'Treasures Found')],
    chat: {
      any: ['found a chest by the palm trees!', 'anyone seen the merchant?', 'the crystal isle is so pretty', 'tide is coming in', 'i love this music', 'how do you get to skull rock', 'got a ruby shell!!'],
      start: ['ahoy', 'lets find some loot', 'race you to the first chest'],
      win: ['full haul!', 'rich rich rich'],
      lose: ['the tide got me', 'one more try'],
    },
    changelog: [{ v: '2.6', date: '2026-08-27', notes: 'Crystal Isle rebuilt. New merchant stock.' }],
  });

  BF.registerGame({
    id: 'towerfall-legends', name: 'Towerfall Legends', gameType: 'towerdefense', genre: 'Strategy', categories: ['Action'],
    creator: 'Bastion Works', maxPlayers: 6, activeBots: 2, popularity: 0.65, approval: 0.89,
    baseVisits: 14200000, baseFavorites: 298000, baseLikes: 377000,
    createdAt: '2022-02-11', updatedAt: '2026-09-05', ageRating: 'All Ages',
    description: 'Hold the valley against twenty waves. Place archers, cannons and frost towers along the road, upgrade them three times, and survive the boss waves. Allied players build alongside you, so plan the lane together.',
    howTo: 'Survive all 20 waves. Every enemy that reaches the gate costs base health.',
    controls: 'Click an empty tile to build · Click a tower to upgrade or sell · Space sends the next wave early',
    passes: [
      pass('tl_tesla', 'Tesla Tower', 400, 'Unlocks the Tesla Tower: lightning that chains between enemies.', 'tesla', 'bolt'),
      pass('tl_warchest', 'War Chest', 300, 'Start every game with +150 gold.', 'warchest', 'wallet'),
    ],
    badges: [
      badge('tl_wave10', 'Holding the Line', 'Reach wave 10.', 'shield'),
      badge('tl_victory', 'Legend of the Valley', 'Survive all 20 waves.', 'crown'),
      badge('tl_boss', 'Giant Slayer', 'Defeat a boss wave.', 'skull'),
    ],
    leaderboard: [lb('highestWave', 'Highest Wave')],
    chat: {
      any: ['build frost at the bend', 'who has gold to spare', 'upgrade the cannons', 'boss wave soon!!', 'nice placement', 'the runners are so fast'],
      start: ['lets hold this', 'i got the left side'],
      win: ['we held the valley!', 'gg team'],
      lose: ['the gate fell', 'we needed more cannons'],
    },
  });

  BF.registerGame({
    id: 'pet-world', name: 'Pet World', gameType: 'petsim', genre: 'Simulator', categories: ['Social'],
    creator: 'Pawprint Labs', maxPlayers: 24, activeBots: 6, popularity: 0.95, approval: 0.93,
    baseVisits: 41000000, baseFavorites: 905000, baseLikes: 1103000,
    createdAt: '2021-05-30', updatedAt: '2026-09-20', ageRating: 'All Ages', featured: true,
    description: 'Hatch adorable pets, send them to break coin piles and grow your collection. Unlock the Crystal Caves and Candy Land, level your pets up, dress them in collars, and fill every page of the collection book.',
    howTo: 'Click coin piles to send your pets. Earn PetBucks, hatch eggs and hit the session goal before time runs out.',
    controls: 'WASD / arrows walk · Click piles to mine · E to use eggs and portals · B collection book',
    passes: [
      pass('pw_storage', 'Pet Storage+', 350, 'Equip two more pets at once (5 instead of 3).', 'storage', 'paw'),
      pass('pw_autocollect', 'Auto Collect', 400, 'PetBucks from broken piles go straight into your pouch.', 'autocollect', 'sparkle'),
    ],
    products: [{ id: 'pw_petbucks', type: 'consumable', name: 'PetBucks Pouch', price: 100, desc: '+1,000 PetBucks in Pet World.', grant: { petbucks: 1000 } }],
    badges: [
      badge('pw_first_hatch', 'Egg Cracker', 'Hatch your first pet.', 'paw'),
      badge('pw_legendary', 'Lucky Paws', 'Hatch a legendary or better pet.', 'star'),
      badge('pw_caves', 'Spelunker', 'Unlock the Crystal Caves.', 'gem'),
    ],
    leaderboard: [lb('petbucks', 'PetBucks Earned'), lb('pets', 'Pets Hatched')],
    chat: {
      any: ['omg i got a rainbow pet', 'trading?', 'crystal caves are worth it', 'my pets are so slow lol', 'how many pets can you equip', 'this egg hates me', 'look at my dragon!!'],
      start: ['hi everyone!', 'grinding coins today'],
      win: ['goal done!', 'so many petbucks'],
      lose: ['almost had it', 'need more pets'],
    },
  });

  BF.registerGame({
    id: 'sky-obby', name: 'Sky Obby', gameType: 'obby', genre: 'Obby', categories: ['Adventure'],
    creator: 'CloudHop Games', maxPlayers: 30, activeBots: 6, popularity: 0.8, approval: 0.86,
    baseVisits: 27400000, baseFavorites: 488000, baseLikes: 610000,
    createdAt: '2020-11-08', updatedAt: '2026-09-01', ageRating: 'All Ages',
    description: 'A parkour course floating in the sky. Jump across moving platforms, dodge spinning bars and falling blocks, and touch every checkpoint flag on the way to the golden portal. Chase your best time on the leaderboard.',
    howTo: 'Reach the golden portal before the 6:00 limit. Checkpoints save your progress.',
    controls: 'A D / arrows run · Space / W jump · R respawn at checkpoint',
    passes: [
      pass('so_double_jump', 'Double Jump', 300, 'Jump again in mid-air.', 'double_jump', 'chevronUp'),
      pass('so_speed_coil', 'Speed Coil', 250, 'Run 25% faster.', 'speed', 'bolt'),
    ],
    badges: [
      badge('so_finish', 'Cloud Walker', 'Complete the Sky Obby.', 'flag'),
      badge('so_flawless', 'Flawless', 'Complete the course without falling.', 'star'),
      badge('so_speedrun', 'Speedrunner', 'Finish in under 1:45.', 'timer'),
    ],
    leaderboard: [lb('bestTime', 'Best Time', 'asc', 'time'), lb('wins', 'Completions')],
    chat: {
      any: ['stage 7 is impossible', 'the spinning bar got me again', 'checkpoint!!', 'who else fell off lol', 'tip: wait for the platform', 'almost at the end'],
      start: ['wish me luck', 'first try challenge'],
      win: ['I DID IT', 'finally beat it'],
      lose: ['out of time', 'ugh so close'],
    },
  });

  BF.registerGame({
    id: 'city-life', name: 'City Life', gameType: 'city', genre: 'Social', categories: ['Simulator'],
    creator: 'Metroblock', maxPlayers: 30, activeBots: 7, popularity: 0.9, approval: 0.87,
    baseVisits: 38600000, baseFavorites: 700000, baseLikes: 820000,
    createdAt: '2021-01-19', updatedAt: '2026-09-12', ageRating: '9+',
    description: 'Live your best block life. Deliver pizzas and drive a taxi for City Cash, buy a car, restyle your outfit and walk around a busy city full of neighbors. Every shift has goals to hit before quitting time.',
    howTo: 'Finish 3 jobs before your shift ends. Enter buildings to shop, work and relax.',
    controls: 'WASD / arrows walk or drive · E enter buildings and vehicles · Q exit vehicle',
    passes: [
      pass('cl_sports_car', 'Sports Car', 450, 'Unlocks the Ember Roadster, the fastest car in the city.', 'sports_car', 'rocket'),
      pass('cl_vip_pay', 'VIP Paycheck', 350, 'Every job pays twice as much City Cash.', 'vip_pay', 'wallet'),
    ],
    products: [{ id: 'cl_cash', type: 'consumable', name: 'City Cash Bundle', price: 150, desc: '+5,000 City Cash.', grant: { cash: 5000 } }],
    badges: [
      badge('cl_first_job', 'Clocking In', 'Complete your first job.', 'clock'),
      badge('cl_driver', 'Licensed Driver', 'Buy your first car.', 'key'),
      badge('cl_employee', 'Employee of the Month', 'Complete 25 jobs.', 'trophy'),
    ],
    leaderboard: [lb('jobs', 'Jobs Completed'), lb('cash', 'City Cash Earned')],
    chat: {
      any: ['anyone need a ride', 'pizza delivery pays well', 'nice car!', 'meet at the park', 'whos house is the blue one', 'can i join your family', 'taxi taxi taxi'],
      start: ['hey neighbors', 'time to work'],
      win: ['shift done, time to chill', 'got paid'],
      lose: ['late again lol', 'my boss is gonna be mad'],
    },
  });

  BF.registerGame({
    id: 'dungeon-frontier', name: 'Dungeon Frontier', gameType: 'dungeon', genre: 'RPG', categories: ['Adventure', 'Action'],
    creator: 'Lantern & Key', maxPlayers: 8, activeBots: 1, popularity: 0.6, approval: 0.9,
    baseVisits: 12100000, baseFavorites: 262000, baseLikes: 330000,
    createdAt: '2020-09-15', updatedAt: '2026-08-30', ageRating: '9+',
    description: 'Descend through procedurally built floors of slimes, skeletons and bats. Open chests, loot better swords and armor, level up between rooms and face the Frontier Warden on the third floor. A party member from your server fights at your side.',
    howTo: 'Clear rooms, find the stairs and defeat the Frontier Warden on floor 3.',
    controls: 'WASD / arrows move · J / Space / click attack · Shift dash · Q drink potion',
    passes: [
      pass('df_heroes_kit', "Hero's Kit", 300, 'Start every run with a Steel Sword and two extra potions.', 'heroes_kit', 'sword'),
      pass('df_double_xp', 'Double XP', 400, 'Dungeon Frontier runs award twice the XP.', 'double_xp', 'bolt'),
    ],
    products: [{ id: 'df_revive', type: 'consumable', name: 'Revive Feather', price: 120, desc: 'Revive once when you fall in a run.', grant: { revives: 1 } }],
    badges: [
      badge('df_floor2', 'Deeper Down', 'Reach floor 2.', 'layers'),
      badge('df_warden', 'Warden Breaker', 'Defeat the Frontier Warden.', 'skull'),
      badge('df_hoarder', 'Chest Hoarder', 'Open 10 chests in one run.', 'gift'),
    ],
    leaderboard: [lb('highestFloor', 'Deepest Floor'), lb('kills', 'Monsters Defeated')],
    chat: {
      any: ['need healing', 'chest in the next room', 'skeleton archers hurt', 'follow me', 'this sword is so good', 'careful, trap room'],
      start: ['party up!', 'lets clear it'],
      win: ['warden down!!', 'loot time'],
      lose: ['wiped...', 'bats are the worst'],
    },
  });

  BF.registerGame({
    id: 'elemental-clash', name: 'Elemental Clash', gameType: 'elemental', genre: 'Fighting', categories: ['Action'],
    creator: 'Prism Forge', maxPlayers: 12, activeBots: 5, popularity: 0.6, approval: 0.88,
    baseVisits: 11800000, baseFavorites: 231000, baseLikes: 301000,
    createdAt: '2022-10-04', updatedAt: '2026-09-14', ageRating: '9+',
    description: 'Choose an element and fight in a floating arena. Every element has three abilities with their own cooldowns and energy costs. Chain your combos, dodge through fireballs and outscore every rival before the timer ends.',
    howTo: 'Most points when the timer ends wins. Eliminations are worth 100, damage adds more.',
    controls: 'WASD move · Mouse aim · J / K / L or 1 / 2 / 3 cast abilities',
    passes: [
      pass('ec_void', 'Void Element', 500, 'Unlocks Void: homing orbs, a rift teleport and a crushing singularity.', 'void', 'sparkle'),
      pass('ec_surge', 'Energy Surge', 300, 'Your energy regenerates 50% faster.', 'surge', 'bolt'),
    ],
    badges: [
      badge('ec_first_win', 'Elemental Adept', 'Win an Elemental Clash match.', 'trophy'),
      badge('ec_all', 'Master of Elements', 'Win with three different elements.', 'sparkle'),
    ],
    leaderboard: [lb('kos', 'Eliminations'), lb('wins', 'Wins')],
    chat: {
      any: ['fire is broken', 'water heal saves lives', 'dodge the quake!', 'lightning mains unite', 'nice combo', 'air dash is so smooth'],
      start: ['choose wisely', 'glhf'],
      win: ['elemental master', 'gg wp'],
      lose: ['wrong element lol', 'rematch pls'],
    },
  });

  BF.registerGame({
    id: 'zombie-outbreak', name: 'Zombie Outbreak', gameType: 'zombie', genre: 'Survival', categories: ['Action', 'Horror'],
    creator: 'Last Light Collective', maxPlayers: 8, activeBots: 3, popularity: 0.75, approval: 0.9,
    baseVisits: 22900000, baseFavorites: 455000, baseLikes: 574000,
    createdAt: '2020-10-30', updatedAt: '2026-09-16', ageRating: '13+',
    description: 'Board up the windows, buy weapons off the walls and hold the farmhouse with your squad. Zombies get faster and tougher every wave. Survive ten waves and the rescue chopper lands.',
    howTo: 'Survive 10 waves. Repair barricades for points and spend them on better weapons.',
    controls: 'WASD move · Mouse aim · Click / Space shoot · R reload · E repair or buy · Q medkit',
    passes: [
      pass('zo_arsenal', 'Heavy Arsenal', 400, 'Start every game with a pump shotgun.', 'arsenal', 'crosshair'),
      pass('zo_fortified', 'Fortified', 300, 'Barricades have twice the health.', 'fortified', 'shield'),
    ],
    products: [{ id: 'zo_medkits', type: 'consumable', name: 'Medkit Crate', price: 80, desc: '+2 medkits for your next games.', grant: { medkits: 2 } }],
    badges: [
      badge('zo_wave5', 'Night Watch', 'Survive 5 waves.', 'clock'),
      badge('zo_rescued', 'Rescued', 'Survive all 10 waves.', 'trophy'),
      badge('zo_carpenter', 'Carpenter', 'Repair 50 barricade planks in one game.', 'hammer'),
    ],
    leaderboard: [lb('highestWave', 'Highest Wave'), lb('kills', 'Zombies Defeated')],
    chat: {
      any: ['REPAIR THE WINDOWS', 'reloading!', 'tank zombie incoming', 'shotgun is on the east wall', 'im low', 'nice shot', 'they broke through!!'],
      start: ['stick together', 'barricade everything'],
      win: ['CHOPPER!!', 'we survived'],
      lose: ['they got me', 'too many of them'],
    },
  });

  BF.registerGame({
    id: 'factory-tycoon', name: 'Factory Tycoon', gameType: 'factory', genre: 'Tycoon', categories: ['Simulator'],
    creator: 'Cogwheel Crew', maxPlayers: 6, activeBots: 4, popularity: 0.55, approval: 0.86,
    baseVisits: 16700000, baseFavorites: 310000, baseLikes: 358000,
    createdAt: '2021-11-23', updatedAt: '2026-08-22', ageRating: 'All Ages',
    description: 'Start with one ore dropper and build an empire. Buy droppers, conveyors and upgraders, collect your earnings, open the East Wing and the upper floor, and build the Golden Forge Monument. Production contracts keep every shift interesting.',
    howTo: 'Walk onto buy pads to purchase. Collect cash from the collector. Hit the contract target in time.',
    controls: 'WASD / arrows walk · Step on pads to buy · Walk onto the collector to cash in',
    passes: [
      pass('ft_double_cash', '2x Cash', 450, 'Every block sells for double.', 'double_cash', 'wallet'),
      pass('ft_auto_collect', 'Auto Collector', 300, 'Earnings go straight to your wallet without visiting the collector.', 'auto_collect', 'refresh'),
    ],
    products: [{ id: 'ft_injection', type: 'consumable', name: 'Cash Injection', price: 150, desc: '+$2,500 factory cash.', grant: { cash: 2500 } }],
    badges: [
      badge('ft_upgrader', 'Industrialist', 'Buy your first upgrader.', 'gear'),
      badge('ft_east', 'Expansionist', 'Unlock the East Wing.', 'layers'),
      badge('ft_monument', 'Golden Forge', 'Build the Golden Forge Monument.', 'crown'),
    ],
    leaderboard: [lb('bestScore', 'Lifetime Cash')],
    chat: {
      any: ['my conveyor is so long', 'upgraders stack!', 'saving for the east wing', 'how much is the smelter', 'auto collector is worth it', 'my factory is 90% droppers'],
      start: ['time to build', 'hi tycoons'],
      win: ['contract complete', 'money money'],
      lose: ['missed the contract by like $50', 'need more droppers'],
    },
  });

  BF.registerGame({
    id: 'treasure-tycoon', name: 'Treasure Tycoon', gameType: 'treasuretycoon', genre: 'Tycoon', categories: ['Adventure'],
    creator: 'Salty Pixel Co.', maxPlayers: 6, activeBots: 3, popularity: 0.4, approval: 0.85,
    baseVisits: 7900000, baseFavorites: 150000, baseLikes: 186000,
    createdAt: '2023-04-17', updatedAt: '2026-08-15', ageRating: 'All Ages',
    description: 'Turn a lonely island into a treasure empire. Chop wood, quarry stone and mine crystals, hire workers to gather for you, upgrade the mill, quarry and vault, and unlock the jungle and the volcano. Defend the vault when the pirates raid.',
    howTo: 'Gather, build and upgrade. Raise defenses before each pirate raid arrives.',
    controls: 'WASD / arrows walk · Hold E or click nodes to gather · Click buildings to upgrade',
    passes: [
      pass('tt_foreman', 'Master Foreman', 400, 'Workers gather twice as fast.', 'foreman', 'users'),
      pass('tt_charter', 'Royal Charter', 350, '+1 worker slot and +25% vault production.', 'charter', 'crown'),
    ],
    badges: [
      badge('tt_workers', 'Crew Boss', 'Hire three workers.', 'users'),
      badge('tt_volcano', 'Fire Walker', 'Unlock the volcano.', 'fire'),
      badge('tt_raid', 'Raid Breaker', 'Repel a pirate raid.', 'shield'),
    ],
    leaderboard: [lb('gold', 'Gold Produced')],
    chat: {
      any: ['pirates are coming!', 'hire more workers', 'the vault is printing gold', 'jungle has so much wood', 'need stone pls', 'volcano crystals are huge'],
      start: ['ahoy tycoons'],
      win: ['raid repelled!', 'vault is full'],
      lose: ['pirates took my gold', 'not enough cannons'],
    },
  });

  BF.registerGame({
    id: 'mega-miners', name: 'Mega Miners', gameType: 'miner', genre: 'Simulator', categories: ['Adventure'],
    creator: 'DeepCore Games', maxPlayers: 16, activeBots: 5, popularity: 0.7, approval: 0.89,
    baseVisits: 20400000, baseFavorites: 398000, baseLikes: 470000,
    createdAt: '2021-06-12', updatedAt: '2026-09-08', ageRating: 'All Ages',
    description: 'Dig straight down. Coal, iron, gold, rubies and diamonds wait in deeper zones, but your pickaxe and backpack decide how far you can go. Sell your haul, upgrade, and dig to the Core. Watch out for lava pockets.',
    howTo: 'Mine, fill your backpack, sell on the surface, upgrade. Reach the Core to win.',
    controls: 'A D / arrows move and mine sideways · S / Down mine down · W / Space jump · R return to surface',
    passes: [
      pass('mm_mega_pack', 'Mega Backpack', 350, 'Backpacks hold twice as much.', 'mega_pack', 'bag'),
      pass('mm_drill', 'Drill Upgrade', 400, 'Mine 50% faster with any pickaxe.', 'drill', 'bolt'),
    ],
    products: [{ id: 'tool_titan_pickaxe', type: 'item', name: 'Titan Pickaxe', price: 600, desc: 'Mining power 12 from the first swing.' }],
    badges: [
      badge('mm_depth100', 'Deep Diver', 'Reach 100m depth.', 'layers'),
      badge('mm_diamond', 'Diamond Hands', 'Mine a diamond.', 'gem'),
      badge('mm_core', 'Core Breaker', 'Reach the Core.', 'fire'),
    ],
    leaderboard: [lb('maxDepth', 'Deepest Dig (m)'), lb('blocks', 'Blocks Mined')],
    chat: {
      any: ['found diamonds at 210m', 'backpack full again', 'lava!! careful', 'iron pick is a must', 'how deep are you', 'obsidian takes forever'],
      start: ['time to dig'],
      win: ['I REACHED THE CORE', 'core crystal get'],
      lose: ['lava got me', 'lost my whole backpack'],
    },
  });

  BF.registerGame({
    id: 'battle-boats', name: 'Battle Boats', gameType: 'boats', genre: 'Action', categories: ['Fighting'],
    creator: 'Harbor Havoc', maxPlayers: 12, activeBots: 7, popularity: 0.5, approval: 0.87,
    baseVisits: 9600000, baseFavorites: 176000, baseLikes: 221000,
    createdAt: '2022-06-28', updatedAt: '2026-08-19', ageRating: '9+',
    description: 'Blue fleet against red fleet on open water. Steer with momentum, fire broadsides from port and starboard, sink rival boats and knock down the enemy lighthouse forts. Most points when the clock runs out wins.',
    howTo: 'Sinking a boat is worth 1 point, destroying a fort is worth 3. Destroy all three forts to win instantly.',
    controls: 'W / S throttle · A / D steer · Q fire left · E fire right · Click fires toward the cursor',
    passes: [
      pass('bt_ironclad', 'Ironclad Hull', 350, 'Your boat has 50% more hull points.', 'ironclad', 'shield'),
      pass('bt_twin', 'Twin Cannons', 400, 'Each broadside fires two cannonballs.', 'twin', 'crosshair'),
    ],
    badges: [
      badge('bt_admiral', 'Admiral', 'Win a Battle Boats match.', 'flag'),
      badge('bt_fort', 'Fort Breaker', 'Destroy an enemy fort.', 'target'),
    ],
    leaderboard: [lb('sinks', 'Boats Sunk'), lb('wins', 'Wins')],
    chat: {
      any: ['broadside!!', 'hit the fort', 'someone cover me', 'my hull is at 10%', 'nice shot captain', 'red team is camping'],
      start: ['anchors up', 'blue team rise'],
      win: ['victory at sea', 'gg captains'],
      lose: ['we sank', 'their forts were too strong'],
    },
  });

  BF.registerGame({
    id: 'pixel-soccer', name: 'Pixel Soccer', gameType: 'soccer', genre: 'Sports', categories: ['Action'],
    creator: 'Kickoff Club', maxPlayers: 10, activeBots: 5, popularity: 0.55, approval: 0.88,
    baseVisits: 13300000, baseFavorites: 240000, baseLikes: 296000,
    createdAt: '2022-03-09', updatedAt: '2026-09-03', ageRating: 'All Ages',
    description: 'Three against three on a walled pitch with a ball that bounces off everything. Sprint, charge your kick, and play with bot teammates who pass, defend and keep goal. Win the match before the whistle.',
    howTo: 'Score more goals than the other team before full time.',
    controls: 'WASD / arrows move · Hold and release Space to kick · Shift sprint',
    passes: [
      pass('ps_power_boots', 'Power Boots', 300, 'Your kicks are 35% stronger.', 'power_boots', 'bolt'),
      pass('ps_sprint', 'Super Sprint', 250, 'Sprint drains stamina half as fast.', 'super_sprint', 'run'),
    ],
    badges: [
      badge('ps_first_goal', 'Goal!', 'Score a goal.', 'ball'),
      badge('ps_hat_trick', 'Hat Trick', 'Score three goals in one match.', 'star'),
      badge('ps_champ', 'Match Winner', 'Win a match.', 'trophy'),
    ],
    leaderboard: [lb('goals', 'Goals'), lb('wins', 'Wins')],
    chat: {
      any: ['pass pass pass', 'im open!', 'what a save', 'goalie wake up lol', 'nice shot', 'defend!!'],
      start: ['kick off!', 'lets win this'],
      win: ['champions!', 'gg good game'],
      lose: ['robbed', 'their keeper was insane'],
    },
  });

  BF.registerGame({
    id: 'cosmic-survival', name: 'Cosmic Survival', gameType: 'cosmic', genre: 'Survival', categories: ['Action'],
    creator: 'Starlit Arcade', maxPlayers: 10, activeBots: 3, popularity: 0.45, approval: 0.87,
    baseVisits: 6800000, baseFavorites: 131000, baseLikes: 160000,
    createdAt: '2023-01-25', updatedAt: '2026-08-29', ageRating: 'All Ages',
    description: 'Pilot a tiny ship through a meteor storm that keeps getting worse. Blast rocks into crystals, keep your shields charged and grab power-ups. Hold out until the evacuation window opens at 3:00.',
    howTo: 'Survive until the evacuation window at 3:00. Crystals recharge your shield.',
    controls: 'A / D rotate · W thrust · S brake · Space fire',
    passes: [
      pass('cs_deflector', 'Deflector Array', 400, 'Start every run with a shield 50% larger and already charged.', 'deflector', 'shield'),
      pass('cs_tractor', 'Tractor Beam', 300, 'Crystals are pulled toward your ship.', 'tractor', 'sparkle'),
    ],
    badges: [
      badge('cs_evac', 'Evacuated', 'Survive until evacuation.', 'rocket'),
      badge('cs_5min', 'Iron Will', 'Survive for 5 minutes in one run.', 'timer'),
    ],
    leaderboard: [lb('bestSurvival', 'Longest Survival', 'desc', 'clock'), lb('bestScore', 'High Score')],
    chat: {
      any: ['meteor shower incoming', 'grab the crystals', 'shields at 20%', 'spread shot is nuts', 'watch the comet', 'this is so chill'],
      start: ['launching', 'see you at evac'],
      win: ['evac!!', 'made it out'],
      lose: ['hull breach...', 'that comet came out of nowhere'],
    },
  });

  BF.registerGame({
    id: 'castle-siege', name: 'Castle Siege', gameType: 'siege', genre: 'Strategy', categories: ['Action'],
    creator: 'Bastion Works', maxPlayers: 6, activeBots: 2, popularity: 0.45, approval: 0.86,
    baseVisits: 7200000, baseFavorites: 139000, baseLikes: 171000,
    createdAt: '2022-12-12', updatedAt: '2026-09-07', ageRating: '9+',
    description: 'The army marches from the east. Build gold mines and quarries, raise wooden walls, and fill your battlements with archer towers, catapults and mage towers. Upgrade the keep and survive fifteen waves, boss waves included.',
    howTo: 'Survive 15 waves. Balance income buildings against defenses.',
    controls: 'Click a slot to build · Click a building to upgrade · Space starts the next wave',
    passes: [
      pass('cs_treasury', 'Royal Treasury', 350, 'Gold and stone income +50%.', 'treasury', 'wallet'),
      pass('cs_ballista', 'Ballista Blueprint', 400, 'Unlocks the Ballista: bolts that pierce every enemy in a line.', 'ballista', 'crosshair'),
    ],
    badges: [
      badge('csg_warlord', 'Warlord Toppled', 'Survive all 15 waves.', 'crown'),
      badge('csg_keep', 'Master Mason', 'Upgrade the keep to level 3.', 'hammer'),
    ],
    leaderboard: [lb('highestWave', 'Highest Wave')],
    chat: {
      any: ['walls are down!', 'more catapults', 'the giant is coming', 'mines first, towers later', 'nice defense', 'wyverns ignore walls!!'],
      start: ['to the walls!'],
      win: ['the castle stands!', 'gg lords'],
      lose: ['the keep fell', 'not enough stone'],
    },
  });

  BF.registerGame({
    id: 'speed-trials', name: 'Speed Trials', gameType: 'speedtrial', genre: 'Racing', categories: ['Obby'],
    creator: 'BlockMaster', maxPlayers: 12, activeBots: 4, popularity: 0.4, approval: 0.9,
    baseVisits: 5400000, baseFavorites: 118000, baseLikes: 139000,
    createdAt: '2023-07-07', updatedAt: '2026-09-11', ageRating: 'All Ages',
    description: 'Five hand-built courses of ice, mud, boost arrows and tight gates. Race the ghosts of other players and your own personal best, watch your split times turn green, and earn medals to unlock harder courses.',
    howTo: 'Pass every gate in order. Beat the bronze time to earn a medal and unlock the next course.',
    controls: 'WASD / arrows roll · Space brake · R restart',
    passes: [
      pass('st_turbo', 'Turbo Start', 250, 'Launch off the start line with a speed boost.', 'turbo', 'rocket'),
      pass('st_all', 'All Courses', 450, 'Unlock every course without medals.', 'all_courses', 'unlock'),
    ],
    badges: [
      badge('st_gold', 'Gold Standard', 'Earn a gold medal.', 'medal'),
      badge('st_all_medals', 'Completionist', 'Earn a medal on all five courses.', 'star'),
    ],
    leaderboard: [lb('bestTime', 'Best Time (Neon Sprint)', 'asc', 'time'), lb('medals', 'Medals')],
    chat: {
      any: ['that ice section is brutal', 'my ghost is too fast', 'gold medal on course 3!', 'green splits', 'tip: take the inside line'],
      start: ['new pb incoming'],
      win: ['PB!!', 'medal get'],
      lose: ['so slow today', 'reset reset reset'],
    },
  });

  BF.registerGame({
    id: 'pet-battle-arena', name: 'Pet Battle Arena', gameType: 'petbattle', genre: 'RPG', categories: ['Strategy'],
    creator: 'Pawprint Labs', maxPlayers: 10, activeBots: 5, popularity: 0.5, approval: 0.91,
    baseVisits: 10200000, baseFavorites: 221000, baseLikes: 265000,
    createdAt: '2022-08-14', updatedAt: '2026-09-15', ageRating: 'All Ages',
    description: 'Pick three pets and climb the arena ladder in turn-based battles. Every pet has stats, a type and four abilities: burn, poison, stun, shields and stat changes. Out-think the trainers on your server and level your team up.',
    howTo: 'Knock out all three of the opponent’s pets. Climb all five ladder ranks.',
    controls: 'Click abilities to attack · Switch pets from the team bar',
    passes: [
      pass('pb_aurorix', 'Mythic Companion: Aurorix', 500, 'Adds Aurorix, a mythic light-type pet, to your roster.', 'aurorix', 'star'),
      pass('pb_insight', "Trainer's Insight", 250, 'See exact enemy HP and type effectiveness on every move.', 'insight', 'eye'),
    ],
    badges: [
      badge('pb_first', 'First Victory', 'Win a pet battle.', 'paw'),
      badge('pb_champion', 'Arena Champion', 'Clear the whole ladder.', 'crown'),
    ],
    leaderboard: [lb('wins', 'Battles Won'), lb('ladder', 'Ladder Rank')],
    chat: {
      any: ['water beats fire', 'stun locked lol', 'my emberpup is level 12', 'poison is underrated', 'type chart is everything', 'gg nice switch'],
      start: ['battle me!', 'lets see your team'],
      win: ['my team is unstoppable', 'gg'],
      lose: ['your aquaffin is scary', 'rematch later'],
    },
  });

  BF.registerGame({
    id: 'mystery-mansion', name: 'Mystery Mansion', gameType: 'mansion', genre: 'Puzzle', categories: ['Horror', 'Adventure'],
    creator: 'Old Harrow Games', maxPlayers: 6, activeBots: 3, popularity: 0.35, approval: 0.94,
    baseVisits: 4100000, baseFavorites: 142000, baseLikes: 157000,
    createdAt: '2019-10-31', updatedAt: '2025-02-14', ageRating: '9+',
    description: 'Lord Ashcombe vanished and took the family fortune with him. Search his house room by room, find clues and hidden objects, solve the bookshelf, the safe and the fuse box, then name the culprit. Some say the house has one more secret.',
    howTo: 'Explore, collect clues and items, solve puzzles and name the culprit. Golden beetles lead to the true ending.',
    controls: 'Click objects to inspect · Click items in your bag, then an object, to use them',
    passes: [
      pass('mm_lantern', "Detective's Lantern", 300, 'Hidden objects shimmer faintly in every room.', 'lantern', 'sun'),
      pass('mm_hints', 'Hint Journal', 250, 'Adds a hint button that points you at the next step.', 'hints', 'note'),
    ],
    badges: [
      badge('mym_solved', 'Case Closed', 'Solve the Ashcombe case.', 'key'),
      badge('mym_beetles', 'Beetle Collector', 'Find all five golden beetles.', 'sparkle'),
      badge('mym_true', 'The Whole Truth', 'See the true ending.', 'eye'),
    ],
    leaderboard: [lb('bestTime', 'Fastest Solve', 'asc', 'time'), lb('beetles', 'Golden Beetles')],
    chat: {
      any: ['the library poem is a clue', 'where is the study key', 'this house creeps me out', 'found a golden beetle!', 'check behind the portrait', 'the cellar is so dark'],
      start: ['lets solve this', 'detective mode on'],
      win: ['case closed!', 'it was the butler all along... or was it'],
      lose: ['wrong suspect lol', 'back to the clues'],
    },
    changelog: [
      { v: '1.2', date: '2025-02-14', notes: 'Hint Journal added. Library lighting improved.' },
      { v: '1.0.3', date: '2020-01-11', notes: 'Fixed the cellar door sticking. The furnace down there has been cold since the fire, and it stays that way.' },
      { v: '1.0', date: '2019-10-31', notes: 'Ashcombe Manor opens its doors.' },
    ],
  });

  // ---------------------------------------------------------------- more passes for every game
  // Every built-in game also sells a VIP pass (+50% ForgeCoins and XP, VIP chat tag) and a
  // Sparkle Trail (cosmetic), both handled by the runtime, plus one pass whose effect the
  // game module checks itself.
  const EXTRA = {
    'block-battlegrounds': ['medic', 'Medic Kit', 300, 'Slowly regenerate health, and health packs heal you to full.', 'heart'],
    'skyline-racers': ['rocket_start', 'Rocket Start', 250, 'Launch off the grid with a 2-second boost when the race starts.', 'rocket'],
    'treasure-islands': ['tide_charm', 'Tide Charm', 300, 'The tide comes in a whole minute later.', 'clock'],
    'towerfall-legends': ['sharpshooter', 'Sharpshooter', 350, 'Every tower fires 25% faster.', 'crosshair'],
    'pet-world': ['swift_pets', 'Swift Pets', 350, 'Your pets run 35% faster and mine 20% harder.', 'bolt'],
    'sky-obby': ['feather', 'Feather Fall', 250, 'Fall more gently: more time to steer onto the next platform.', 'sparkle'],
    'city-life': ['overtime', 'Overtime Permit', 250, 'Your shift lasts 90 seconds longer.', 'clock'],
    'dungeon-frontier': ['potion_belt', 'Potion Belt', 300, 'Start every run with two extra potions.', 'heart'],
    'elemental-clash': ['stoneskin', 'Stoneskin', 350, 'Take 20% less damage from every element.', 'shield'],
    'zombie-outbreak': ['body_armor', 'Body Armor', 300, '+50 max health for the whole siege.', 'shield'],
    'factory-tycoon': ['overdrive', 'Belt Overdrive', 350, 'Conveyor belts run 30% faster.', 'bolt'],
    'treasure-tycoon': ['hustle', 'Hard Workers', 300, 'Your workers gather 35% faster.', 'hammer'],
    'mega-miners': ['appraiser', 'Ore Appraiser', 350, 'Sell every backpack for 30% more.', 'gem'],
    'battle-boats': ['fast_reload', 'Quick Crew', 300, 'Your cannons reload 35% faster.', 'crosshair'],
    'pixel-soccer': ['endurance', 'Endurance', 250, 'Your stamina refills 70% faster.', 'run'],
    'cosmic-survival': ['overcharge', 'Overcharged Blaster', 300, 'Fire 30% faster.', 'bolt'],
    'castle-siege': ['royal_mint', 'Royal Mint', 350, 'Mines and quarries produce 30% more.', 'wallet'],
    'speed-trials': ['grip', 'Grip Tyres', 250, 'Better control on ice and less slowdown in mud.', 'target'],
    'pet-battle-arena': ['vitality', 'Vitality Charm', 300, 'Your pets start every battle with 15% more health.', 'heart'],
    'mystery-mansion': ['pocketwatch', 'Pocket Watch', 250, 'Three more minutes before the clock strikes midnight.', 'clock'],
  };
  for (const g of BF.GAME_REGISTRY) {
    if (!g.builtIn) continue;
    const more = [
      pass('gp_' + g.id + '_vip', 'VIP', 800, 'VIP in ' + g.name + ': +50% ForgeCoins and XP from every session, and a gold VIP tag in chat.', 'vip', 'crown'),
      pass('gp_' + g.id + '_trail', 'Sparkle Trail', 150, 'Leave a trail of glitter behind you wherever you go in ' + g.name + ' (3D).', 'trail', 'sparkle'),
    ];
    const x = EXTRA[g.id];
    if (x) more.push(pass('gp_' + g.id + '_' + x[0], x[1], x[2], x[3], x[0], x[4]));
    for (const p of more) if (!g.passes.some((q) => q.id === p.id)) { p.gameId = g.id; p.kind = 'pass'; g.passes.push(p); }
  }
})((window.BF = window.BF || {}));
