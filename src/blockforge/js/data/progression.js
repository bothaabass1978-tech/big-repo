/**
 * BlockForge — achievements, quests, daily rewards and platform badges (data).
 * Achievement `check(s, h)` receives the state and BF helpers and returns
 * [current, target]; it unlocks when current >= target.
 */
(function (BF) {
  'use strict';

  const st = (s) => s.player.stats;
  const prog = (s, gameId, key) => ((s.progress[gameId] || {})[key]) || 0;

  const A = (id, name, desc, icon, coins, xp, check, extra) =>
    Object.assign({ id, name, desc, icon, reward: { coins, xp }, check }, extra || {});

  BF.ACHIEVEMENTS = [
    A('first_steps', 'First Steps', 'Play your first game.', 'play', 50, 100, (s) => [st(s).gamesPlayed, 1]),
    A('explorer', 'Explorer', 'Play 5 different games.', 'compass', 150, 250, (s) => [st(s).distinctGames.length, 5]),
    A('globetrotter', 'Globetrotter', 'Play 15 different games.', 'globe', 400, 600, (s) => [st(s).distinctGames.length, 15]),
    A('world_tour', 'World Tour', 'Play 20 different official BlockForge games.', 'mapPin', 1000, 1500, (s) => [st(s).distinctGames.filter((id) => BF.GAME_REGISTRY.some((g) => g.id === id && g.builtIn)).length, 20]),
    A('first_win', 'First Victory', 'Win your first match.', 'flag', 75, 150, (s) => [st(s).wins, 1]),
    A('champion', 'Champion', 'Win 10 matches.', 'trophy', 300, 500, (s) => [st(s).wins, 10]),
    A('legend', 'Living Legend', 'Win 50 matches.', 'crown', 1000, 1500, (s) => [st(s).wins, 50]),
    A('collector', 'Collector', 'Own 10 avatar items.', 'box', 150, 250, (s, h) => [h.inventory.wearableCount(), 10]),
    A('hoarder', 'Hoarder', 'Own 30 avatar items.', 'layers', 500, 750, (s, h) => [h.inventory.wearableCount(), 30]),
    A('fashionista', 'Fashionista', 'Wear 5 accessories at once (hat, jacket, back, neck, shoulder, accessory).', 'shirt', 100, 200, (s) => [['hat', 'jacket', 'back', 'neck', 'shoulder', 'accessory'].filter((k) => s.avatar.equipped[k]).length, 5]),
    A('first_purchase', 'Window Shopper No More', 'Buy your first item from the Avatar Shop.', 'bag', 50, 100, (s) => [st(s).itemsBought, 1]),
    A('big_spender', 'Big Spender', 'Spend 5,000 ForgeCoins in total.', 'wallet', 250, 400, (s) => [s.wallet.lifetimeSpent, 5000]),
    A('millionaire', 'Millionaire', 'Accumulate 10,000 ForgeCoins.', 'coin', 500, 800, (s) => [Math.max(s.wallet.balance, s.wallet.highestBalance || 0), 10000]),
    A('pass_holder', 'Pass Holder', 'Own 3 game passes.', 'ticket', 200, 300, (s) => [Object.keys(s.passes).length, 3]),
    A('social_butterfly', 'Social Butterfly', 'Have 12 friends.', 'users', 150, 250, (s) => [s.social.friends.length, 12]),
    A('chatterbox', 'Chatterbox', 'Send 25 chat messages in game servers.', 'chat', 100, 150, (s) => [st(s).chatSent, 25]),
    A('pen_pal', 'Pen Pal', 'Send 10 private messages.', 'mail', 100, 150, (s) => [st(s).messagesSent, 10]),
    A('creator', 'Creator', 'Create your first game.', 'anvil', 150, 250, (s) => [st(s).gamesCreated, 1]),
    A('publisher', 'Publisher', 'Publish a game to the platform.', 'globe', 200, 300, (s) => [st(s).gamesPublished, 1]),
    A('quest_starter', 'Questing', 'Complete 5 quests.', 'target', 150, 200, (s) => [st(s).questsCompleted, 5]),
    A('quest_master', 'Quest Master', 'Complete 25 quests.', 'target', 500, 800, (s) => [st(s).questsCompleted, 25]),
    A('dedicated', 'Dedicated', 'Reach a 7-day login streak.', 'calendar', 500, 700, (s) => [Math.max(s.daily.streak, s.daily.bestStreak || 0), 7]),
    A('level_15', 'Rising Star', 'Reach level 15.', 'star', 200, 0, (s) => [s.player.level, 15]),
    A('level_25', 'Seasoned Forger', 'Reach level 25.', 'sparkle', 600, 0, (s) => [s.player.level, 25]),
    A('speed_demon', 'Speed Demon', 'Win a race in Skyline Racers.', 'rocket', 100, 150, (s) => [st(s).racesWon, 1]),
    A('treasure_hunter', 'Treasure Hunter', 'Collect 50 treasures.', 'gem', 200, 300, (s) => [st(s).treasures, 50]),
    A('tower_master', 'Tower Master', 'Reach wave 15 in Towerfall Legends.', 'shield', 250, 350, (s) => [prog(s, 'towerfall-legends', 'highestWave'), 15]),
    A('pet_lover', 'Pet Lover', 'Hatch 10 pets in Pet World.', 'paw', 150, 250, (s) => [st(s).petsHatched, 10]),
    A('deep_digger', 'Deep Digger', 'Reach 100m in Mega Miners.', 'layers', 150, 250, (s) => [prog(s, 'mega-miners', 'maxDepth'), 100]),
    A('survivor', 'Survivor', 'Survive 10 waves in Zombie Outbreak.', 'skull', 300, 400, (s) => [prog(s, 'zombie-outbreak', 'highestWave'), 10]),
    A('goal_machine', 'Goal Machine', 'Score 10 goals in Pixel Soccer.', 'ball', 150, 250, (s) => [st(s).goals, 10]),
    A('detective', 'Detective', 'Solve the Mystery Mansion case.', 'key', 300, 400, (s) => [prog(s, 'mystery-mansion', 'wins'), 1]),
    A('marathon', 'Marathon', 'Play for 2 hours in total.', 'clock', 300, 500, (s) => [Math.floor(st(s).playSeconds / 60), 120], { unit: 'min' }),
    A('badge_hunter', 'Badge Hunter', 'Earn 10 game badges.', 'medal', 300, 450, (s) => [Object.keys(s.badges).filter((b) => !BF.PLATFORM_BADGES[b]).length, 10]),
    A('forgecore', 'Forgecore', 'You found something that wasn’t supposed to be found.', 'terminal', 0, 1000, (s) => [s.secrets.forgecore && s.secrets.forgecore.unlocked ? 1 : 0, 1], {
      secret: true, hiddenName: '???', hiddenDesc: 'The embers sleep where no one plays.',
    }),
  ];
  BF.ACHIEVEMENT_MAP = Object.fromEntries(BF.ACHIEVEMENTS.map((a) => [a.id, a]));

  /** Platform (non-game) badges shown on profiles. */
  BF.PLATFORM_BADGES = {
    pb_welcome: { id: 'pb_welcome', name: 'Welcome Aboard', desc: 'Joined BlockForge.', icon: 'sparkle', color: '#46a8ff' },
    pb_veteran: { id: 'pb_veteran', name: 'Veteran', desc: 'Reached level 10.', icon: 'shield', color: '#4ad17f' },
    pb_creator: { id: 'pb_creator', name: 'Creator', desc: 'Published a game.', icon: 'anvil', color: '#ff7a2e' },
    pb_collector: { id: 'pb_collector', name: 'Curator', desc: 'Owns a legendary item.', icon: 'gem', color: '#ffb52e' },
    pb_social: { id: 'pb_social', name: 'Friendly Face', desc: 'Has 10 or more friends.', icon: 'users', color: '#b67cff' },
    forgecore_unlocked: { id: 'forgecore_unlocked', name: 'Forgecore Unlocked', desc: 'Woke the core beneath the old house.', icon: 'terminal', color: '#ff5f0f', secret: true },
  };

  /** Daily login rewards, day 1..7 of a streak (repeats after day 7). */
  BF.DAILY_REWARDS = [50, 75, 100, 150, 200, 300, 500];

  const Q = (id, scope, title, event, target, reward, xp, extra) =>
    Object.assign({ id, scope, title, event, target, reward, xp }, extra || {});

  /** Quest pool. Daily quests rotate each day (5 active), weekly each week (4 active). */
  BF.QUESTS = [
    Q('d_play2', 'daily', 'Play 2 games', 'play_game', 2, 100, 80),
    Q('d_distinct3', 'daily', 'Play 3 different games', 'play_game', 3, 150, 120, { distinct: true }),
    Q('d_win1', 'daily', 'Win a match in any game', 'win', 1, 150, 120),
    Q('d_race', 'daily', 'Win a race in Skyline Racers', 'race_win', 1, 150, 120, { game: 'skyline-racers' }),
    Q('d_treasure20', 'daily', 'Collect 20 treasures', 'treasure', 20, 200, 150, { game: 'treasure-islands' }),
    Q('d_matches3', 'daily', 'Complete 3 matches', 'match_complete', 3, 125, 100),
    Q('d_kills10', 'daily', 'Get 10 eliminations', 'kill', 10, 120, 100),
    Q('d_earn300', 'daily', 'Earn 300 ForgeCoins', 'coins_earned', 300, 100, 80),
    Q('d_chat5', 'daily', 'Send 5 chat messages in servers', 'chat', 5, 75, 60),
    Q('d_goals3', 'daily', 'Score 3 goals in Pixel Soccer', 'goal', 3, 150, 120, { game: 'pixel-soccer' }),
    Q('d_mine100', 'daily', 'Mine 100 blocks in Mega Miners', 'mine', 100, 150, 120, { game: 'mega-miners' }),
    Q('d_hatch3', 'daily', 'Hatch 3 pets in Pet World', 'hatch', 3, 125, 100, { game: 'pet-world' }),
    Q('d_waves10', 'daily', 'Clear 10 waves in defense games', 'wave', 10, 175, 140),
    Q('d_checkpoints', 'daily', 'Reach 6 checkpoints in Sky Obby', 'checkpoint', 6, 125, 100, { game: 'sky-obby' }),
    Q('d_boss', 'daily', 'Defeat a boss', 'boss', 1, 200, 160),
    Q('d_equip', 'daily', 'Equip an avatar item', 'equip', 1, 50, 40),
    Q('d_message', 'daily', 'Send a private message to a friend', 'message_sent', 1, 50, 40),
    Q('d_playtime', 'daily', 'Play for 10 minutes', 'play_seconds', 600, 150, 120, { unit: 'sec' }),
    Q('d_jobs', 'daily', 'Complete 3 jobs in City Life', 'job', 3, 125, 100, { game: 'city-life' }),
    Q('w_play15', 'weekly', 'Play 15 games', 'play_game', 15, 500, 400),
    Q('w_wins10', 'weekly', 'Win 10 matches', 'win', 10, 600, 500),
    Q('w_distinct8', 'weekly', 'Play 8 different games', 'play_game', 8, 500, 400, { distinct: true }),
    Q('w_earn2000', 'weekly', 'Earn 2,000 ForgeCoins', 'coins_earned', 2000, 400, 300),
    Q('w_buy2', 'weekly', 'Buy 2 items from the Avatar Shop', 'buy_item', 2, 300, 250),
    Q('w_friend', 'weekly', 'Add a new friend', 'friend_added', 1, 250, 200),
    Q('w_treasure100', 'weekly', 'Collect 100 treasures', 'treasure', 100, 700, 500, { game: 'treasure-islands' }),
    Q('w_kills50', 'weekly', 'Get 50 eliminations', 'kill', 50, 500, 400),
    Q('w_waves40', 'weekly', 'Clear 40 waves in defense games', 'wave', 40, 600, 450),
    Q('w_create', 'weekly', 'Create or update a game in Create', 'create_game', 1, 300, 250),
    Q('w_mansion', 'weekly', 'Solve the Mystery Mansion case', 'mansion_solved', 1, 500, 400, { game: 'mystery-mansion' }),
    Q('w_daily5', 'weekly', 'Claim your daily reward on 5 days', 'daily_claim', 5, 400, 300),
    Q('w_petbattle3', 'weekly', 'Win 3 pet battles', 'pet_battle_win', 3, 400, 300, { game: 'pet-battle-arena' }),
  ];
  BF.QUEST_MAP = Object.fromEntries(BF.QUESTS.map((q) => [q.id, q]));
  BF.QUEST_SLOTS = { daily: 5, weekly: 4 };

  /** XP needed to go from `level` to `level + 1`. Level 12 needs 5,000. */
  BF.xpForLevel = (level) => 400 * level + 200;
  /** ForgeCoins granted on reaching `level`. */
  BF.levelReward = (level) => 50 + 10 * level;
})((window.BF = window.BF || {}));
