/**
 * BlockForge — games made by other players.
 *
 * The fictional players (bots) publish their own games: obbies, tycoons, tag
 * games, quizzes... built on the same templates and engines you can use.
 * Most stay small, a few blow up. A new one comes out every few minutes,
 * games rise when they are new, plateau, then slowly fade, and their creators
 * run ad campaigns that show up in the Sponsored slots next to yours. What
 * they earn counts toward their fortune (systems/creatoreconomy.js).
 *
 *   BF.botGames.list()           listings (same shape as built-in games)
 *   BF.botGames.byCreator(id)    one bot's games
 *   BF.botGames.stats(id)        {playing, visits, favorites, likes, dislikes, approval}
 *   BF.botGames.revenue(id)      {lifetime, perMin}
 *   BF.botGames.creators()       bot creators by earnings
 *   BF.botGames.sponsored(p, n)  bot ad campaigns running in a placement
 *   BF.botGames.feed(n)          recent platform activity (releases, ads, milestones)
 *   BF.botGames.tick(now, rng)   world tick (clock and randomness injectable)
 *
 * Everything is fictional and local.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const MIN = 60000, DAY = 86400000;
  /**
   * Tuning (data):
   *   seed         games that already exist on a fresh save
   *   max          games kept (the least popular old ones are retired)
   *   release      seconds between new releases [min, max]
   *   rise         minutes a new game takes to reach its audience
   *   plateauDays  days at full popularity before fading
   *   halfLifeDays how fast old games fade
   *   adChance     chance per tick that a creator starts a campaign (x3 for new games)
   *   adMinutes    campaign length [min, max]
   *   rpv          ForgeCoins a bot creator earns per visit (payout + passes)
   */
  const T = { seed: 36, max: 90, release: [170, 420], rise: 20, plateauDays: 10, halfLifeDays: 25, adChance: 0.0003, adMinutes: [2, 8], adBoost: 1.35, rpv: 0.36, sessionMin: 8, peak: 1600000, exp: 2.2, feedMax: 40, milestones: [1000, 10000, 100000, 500000] };

  /** What bots build: creator templates and arcade engines, with name parts. */
  const KINDS = {
    obby: { tpl: 'obby', a: ['Mega', 'Impossible', 'Easy', 'Rainbow', 'Lava', 'Noob vs Pro', 'Speed', 'Candy', 'Sky', '100 Stage'], b: ['Obby', 'Tower Climb', 'Parkour', 'Stairs', 'Obby Run'] },
    arena: { tpl: 'arena', a: ['Epic', 'Ultimate', 'Blocky', 'Ninja', 'Pillow', 'Knockout', 'Hammer', 'Laser'], b: ['Sword Fight', 'Battle', 'Brawl', 'Duels', 'Arena'] },
    racing: { tpl: 'racing', a: ['Turbo', 'Drift', 'Kart', 'Mega Ramp', 'Street', 'Neon'], b: ['Racing', 'Speedway', 'Rally', 'Circuit', 'Grand Prix'] },
    simulator: { tpl: 'simulator', a: ['Gem', 'Crystal', 'Gold', 'Diamond', 'Dig'], b: ['Simulator', 'Tycoon', 'Mine', 'Caves', 'Clicker'] },
    towerdefense: { tpl: 'towerdefense', a: ['Toy', 'Robot', 'Kingdom', 'Castle', 'Galaxy'], b: ['Defense', 'Tower Defense', 'Guard', 'Siege'] },
    custom: { tpl: 'custom', a: ['Coin', 'Lava', 'Ghost', 'Dungeon', 'Key', 'Gem'], b: ['Chase', 'Maze', 'Hunt', 'Dash', 'Quest'] },
    runner: { type: 'runner', a: ['Endless', 'Rooftop', 'Volcano', 'Cake', 'Train'], b: ['Run', 'Dash', 'Rush', 'Sprint'] },
    party: { type: 'party', a: ['Minigame', 'Party', 'Floor Is', 'Color', 'Sumo'], b: ['Mania', 'Island', 'Lava', 'Clash', 'Showdown'] },
    tag: { type: 'tag', a: ['Freeze', 'Zombie', 'Mansion', 'Flag', 'Potato'], b: ['Tag', 'Tag Deluxe', 'Hide & Seek', 'Fight', 'Chaos'] },
    fishing: { type: 'fishing', a: ['Fishing', 'Tropical', 'Big', 'Lake', 'Reel'], b: ['Paradise', 'Catch', 'Life', 'It In', 'Legends'] },
    farm: { type: 'farm', a: ['Farm', 'Veggie', 'Tiny', 'Crop', 'Bee'], b: ['Life', 'Valley', 'Farm', 'Tycoon', 'Garden'] },
    restaurant: { type: 'restaurant', a: ['Cafe', 'Pancake', 'Noodle', 'Food Truck', 'Cook-Off'], b: ['Rush', 'Palace', 'House', 'Frenzy', 'Kitchen'] },
    flight: { type: 'flight', a: ['Sky', 'Ring', 'Glide', 'Cloud'], b: ['Race', 'Rush', 'Heaven', 'Flyers'] },
    golf: { type: 'golf', a: ['Putt', 'Crazy', 'Mini Putt', 'Hole in One'], b: ['Party', 'Golf', 'World', 'Club'] },
    spooky: { type: 'spooky', a: ['Haunted', 'Midnight', 'Creepy', 'Escape the'], b: ['School', 'Mall', 'Carnival', 'Basement', 'Janitor'] },
    quiz: { type: 'quiz', a: ['Quiz', 'Guess the', 'Smart', 'Trivia', 'Brain'], b: ['Quest', 'Answer', 'Kid Quiz', 'Tower', 'Boost'] },
  };
  const COLORS = ['#ff7a2e', '#46a8ff', '#4ad17f', '#b67cff', '#ff4f9a', '#ffc940', '#39f3ff', '#e03e5a'];

  const cache = new Map(); // id -> listing
  let lastTick = 0;

  const st = () => {
    const s = BF.store.state;
    if (!s) return null;
    if (!s.botGames || !Array.isArray(s.botGames.list)) s.botGames = { list: [], feed: [], nextAt: 0 };
    if (!Array.isArray(s.botGames.feed)) s.botGames.feed = [];
    return s.botGames;
  };

  /** Popularity multiplier by age: rising, plateau, then a slow fade. */
  function life(age) {
    const m = age / MIN;
    if (m < T.rise) return 0.25 + 0.75 * (m / T.rise);
    const d = age / DAY;
    if (d < T.plateauDays) return 1;
    return Math.max(0.08, Math.pow(0.5, (d - T.plateauDays) / T.halfLifeDays));
  }

  function nameFor(kind, bot, r) {
    const k = KINDS[kind];
    let n = U.pick(k.a, r) + ' ' + U.pick(k.b, r);
    if (r() < 0.28) n = bot.displayName.split(' ')[0] + "'s " + n;
    const suf = r();
    if (suf < 0.08) n += ' 2'; else if (suf < 0.12) n += ' [UPDATE]'; else if (suf < 0.15) n += '!!';
    return n.slice(0, 40);
  }

  /** A new game record. */
  function make(bot, createdAt, r) {
    const kind = U.pick(Object.keys(KINDS), r);
    const k = KINDS[kind];
    // most games stay small; about one in twenty takes off
    const potential = Math.min(0.85, 0.012 + Math.pow(r(), 14) * 0.8);
    const rec = {
      id: 'bg_' + U.hash(bot.id + ':' + createdAt + ':' + kind).toString(36),
      botId: bot.id, kind, name: nameFor(kind, bot, r), createdAt,
      potential, approval: +(0.6 + r() * 0.35).toFixed(3), seed: Math.floor(r() * 1e9),
      color: U.pick(COLORS, r), pattern: U.pick(['grid', 'stripes', 'dots', 'stars'], r),
      visits: 0, favorites: 0, milestone: 0, ad: null, adSpend: 0,
      passes: [['VIP', 400 + Math.round(r() * 20) * 50, 'vip'], ['Double XP', 150 + Math.round(r() * 10) * 25, 'double_xp']].concat(r() < 0.4 ? [['Mega Coins', 999, 'bonus_coins']] : []),
    };
    if (k.type) { const variants = BF.GAME_REGISTRY.filter((g) => g.builtIn && g.gameType === k.type); rec.variant = variants.length ? U.pick(variants, r).config.variant : null; }
    return rec;
  }

  /** Turn a record into a catalog listing (cached; popularity refreshed each tick). */
  function listing(rec) {
    let g = cache.get(rec.id);
    if (g) return g;
    const bot = BF.bots.get(rec.botId) || BF.bots.list[0];
    const k = KINDS[rec.kind];
    const T2 = k.tpl ? BF.creator.TEMPLATES[k.tpl] : null;
    const base = T2 ? BF.GAME_REGISTRY.find((x) => x.id === T2.base) : BF.GAME_REGISTRY.find((x) => x.builtIn && x.gameType === k.type && x.config && x.config.variant === rec.variant);
    const gameType = T2 ? T2.gameType : k.type;
    const genre = base ? base.genre : T2 ? T2.genre : 'Adventure';
    g = {
      id: rec.id, name: rec.name, gameType, genre, categories: base ? base.categories.slice() : [genre],
      creator: '@' + bot.username, creatorId: bot.id, creatorName: bot.displayName,
      description: bot.displayName + ' made this ' + (T2 ? T2.label.toLowerCase().replace(' (from scratch)', '') : genre.toLowerCase()) + ' game. ' + (base ? base.description.split('.')[0] + '.' : ''),
      maxPlayers: base ? base.maxPlayers : 12, approval: rec.approval, baseVisits: 0, baseFavorites: 0, baseLikes: 0,
      createdAt: new Date(rec.createdAt).toISOString().slice(0, 10), updatedAt: new Date(rec.createdAt).toISOString().slice(0, 10), ageRating: 'All Ages',
      popularity: 0.02,
      passes: rec.passes.map((p, i) => ({ id: rec.id + '_p' + i, name: p[0], price: p[1], effect: p[2], desc: { vip: 'VIP: +50% ForgeCoins and XP, and a VIP tag in chat', double_xp: 'Double XP in this game', bonus_coins: '+25% ForgeCoin rewards in this game' }[p[2]], gameId: rec.id, kind: 'pass', icon: 'ticket' })),
      products: [], badges: [], leaderboard: base ? (base.leaderboard || []).slice(0, 1) : [], chat: base ? base.chat : {},
      controls: base ? base.controls : '', howTo: base ? base.howTo : '', activeBots: base ? Math.min(6, base.activeBots || 5) : 5,
      changelog: [{ v: '1.0', date: new Date(rec.createdAt).toISOString().slice(0, 10), notes: 'Released by @' + bot.username + '.' }],
      builtIn: false, userGame: false, botGame: true, published: true, visibility: 'public',
      template: k.tpl || k.type, thumbnail: { type: 'preset', color: rec.color, pattern: rec.pattern },
      config: k.tpl ? { seed: rec.seed, themeColor: rec.color, difficulty: 'normal', custom: true, name: rec.name, layout: null } : { variant: rec.variant },
    };
    cache.set(rec.id, g);
    if (BF.world && BF.world.servers && !BF.world.servers.has(rec.id)) BF.world.servers.set(rec.id, []);
    return g;
  }

  function popularityOf(rec, now) {
    return rec.potential * life(now - rec.createdAt) * (rec.ad && rec.ad.until > now ? T.adBoost : 1);
  }
  /** Players right now (same crowd model as the built-in games, before the day curve). */
  function crowdOf(rec, now) {
    return T.peak * Math.pow(popularityOf(rec, now), T.exp);
  }

  function event(kind, text, gameId, botId, now) {
    const s = st();
    if (!s) return;
    s.feed.unshift({ t: now, kind, text, gameId: gameId || null, botId: botId || null });
    if (s.feed.length > T.feedMax) s.feed.length = T.feedMax;
  }

  /** Games that existed before this save: spread over the last 240 days, visits filled in. */
  function seed(now, r) {
    const s = st();
    const makers = BF.bots.list.filter((b) => !b.handcrafted && b.level >= 8);
    for (let i = 0; i < T.seed; i++) {
      const bot = makers[Math.floor(r() * makers.length)];
      const age = (r() < 0.25 ? r() * 2 : Math.pow(r(), 1.6) * 240) * DAY + MIN * 30;
      const rec = make(bot, now - age, r);
      // visits so far: the audience over its life (one visit per session)
      const days = age / DAY;
      const avg = Math.pow(rec.potential * (days < T.plateauDays ? 0.9 : 0.6), T.exp) * T.peak * 0.62;
      rec.visits = Math.round((avg / T.sessionMin) * (age / MIN) * 0.5 + 40 + r() * 300);
      rec.favorites = Math.round(rec.visits * 0.018 * rec.approval);
      s.list.push(rec);
    }
    s.nextAt = now + U.rand(T.release[0], T.release[1], r) * 1000;
  }

  const bg = (BF.botGames = {
    T,
    KINDS,
    life,

    list() { const s = st(); return s ? s.list.map(listing) : []; },
    get(id) { const s = st(); const rec = s && s.list.find((x) => x.id === id); return rec ? listing(rec) : null; },
    rec(id) { const s = st(); return (s && s.list.find((x) => x.id === id)) || null; },
    byCreator(botId) { const s = st(); return s ? s.list.filter((x) => x.botId === botId).map(listing) : []; },

    /** Live numbers for a bot game. */
    stats(id) {
      const rec = bg.rec(id);
      if (!rec) return null;
      const s = BF.store.state;
      const vote = s.catalog.votes[id], fav = s.catalog.favorites.includes(id);
      const likes = Math.round(rec.visits * 0.022 * rec.approval) + (vote === 'like' ? 1 : 0);
      const dislikes = Math.round(likes * (1 - rec.approval) / rec.approval) + (vote === 'dislike' ? 1 : 0);
      return { playing: BF.world.playerCount(id), visits: Math.floor(rec.visits), favorites: Math.floor(rec.favorites) + (fav ? 1 : 0), likes, dislikes, approval: likes + dislikes ? likes / (likes + dislikes) : rec.approval };
    },
    /** Players now (crowd part), used by the world model. */
    crowd(id, now) { const rec = bg.rec(id); return rec ? Math.round(crowdOf(rec, now == null ? BF.clock.now() : now)) : 0; },

    revenue(id) {
      const rec = bg.rec(id);
      if (!rec) return { lifetime: 0, perMin: 0 };
      return { lifetime: Math.floor(rec.visits * T.rpv), perMin: (BF.world.playerCount(id) / T.sessionMin) * T.rpv };
    },
    /** What a bot has earned from its own games (after ad spend). */
    earningsOf(botId) {
      const s = st();
      if (!s) return 0;
      let w = 0;
      for (const rec of s.list) if (rec.botId === botId) w += rec.visits * T.rpv * 0.8 - (rec.adSpend || 0);
      return Math.max(0, Math.floor(w));
    },
    /** Bot creators ranked by lifetime earnings. */
    creators() {
      const s = st();
      if (!s) return [];
      const by = new Map();
      for (const rec of s.list) {
        const e = by.get(rec.botId) || { bot: BF.bots.get(rec.botId), lifetime: 0, perMin: 0, games: 0, playing: 0 };
        const r2 = bg.revenue(rec.id);
        e.lifetime += r2.lifetime; e.perMin += r2.perMin; e.games++; e.playing += BF.world.playerCount(rec.id);
        by.set(rec.botId, e);
      }
      return Array.from(by.values()).filter((e) => e.bot).sort((a, b) => b.lifetime - a.lifetime);
    },

    /** Bot campaigns showing in a placement right now. */
    sponsored(placement, n, now) {
      const s = st();
      if (!s) return [];
      now = now == null ? BF.clock.now() : now;
      return s.list.filter((rec) => rec.ad && rec.ad.until > now && rec.ad.placements.includes(placement))
        .sort((a, b) => b.ad.bid - a.ad.bid).slice(0, n)
        .map((rec) => ({ gameId: rec.id, headline: rec.ad.headline, campaignId: null, own: false, bot: rec.botId }));
    },

    feed(n) { const s = st(); return s ? s.feed.slice(0, n || 10) : []; },
    /** Newest releases and the fastest risers. */
    newest(n) { const s = st(); return s ? s.list.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, n || 10).map(listing) : []; },
    rising(n, now) {
      const s = st();
      if (!s) return [];
      now = now == null ? BF.clock.now() : now;
      return s.list.filter((rec) => now - rec.createdAt < 3 * DAY).sort((a, b) => crowdOf(b, now) - crowdOf(a, now)).slice(0, n || 10).map(listing);
    },

    /** A bot publishes a new game now. */
    release(now, r, bot) {
      const s = st();
      if (!s) return null;
      r = r || Math.random;
      if (!bot) {
        const builders = BF.bots.list.filter((b) => b.personality === 'builder' && b.level >= 5);
        bot = r() < 0.6 && builders.length ? U.pick(builders, r) : U.pick(BF.bots.list.filter((b) => b.level >= 8), r);
      }
      const rec = make(bot, now, r);
      if (s.list.some((x) => x.id === rec.id)) return null;
      s.list.push(rec);
      // retire the least popular old games when the list is full
      if (s.list.length > T.max) {
        const favs = new Set(BF.store.state.catalog.favorites);
        const old = s.list.filter((x) => !favs.has(x.id) && now - x.createdAt > DAY).sort((a, b) => crowdOf(a, now) - crowdOf(b, now));
        const drop = new Set(old.slice(0, s.list.length - T.max).map((x) => x.id));
        s.list = s.list.filter((x) => !drop.has(x.id));
        drop.forEach((id) => cache.delete(id));
      }
      const g = listing(rec);
      event('release', bot.displayName + ' released ' + rec.name, rec.id, bot.id, now);
      const follows = BF.friends && (BF.friends.isFollowing(bot.id) || BF.friends.isFriend(bot.id));
      if (follows && BF.notify) BF.notify.push({ type: 'update', title: bot.displayName + ' released a new game', body: rec.name + ' is out now. Be one of the first to play!', icon: 'sparkle', route: '#/game/' + rec.id });
      BF.store.touch('botGames');
      if (BF.bus) BF.bus.emit('botgames:released', { game: g, bot });
      return g;
    },

    /**
     * World tick: visits roll in, games hit milestones, creators start ads,
     * and now and then someone releases a new game.
     */
    tick(now, r) {
      const s = st();
      if (!s) return;
      now = now == null ? BF.clock.now() : now;
      r = r || Math.random;
      if (!s.list.length) seed(now, U.rng('botgames:' + (BF.store.state.world && BF.store.state.world.seed)));
      const dt = lastTick ? Math.min(60000, now - lastTick) : 4000;
      lastTick = now;
      for (const rec of s.list) {
        const g = listing(rec);
        g.popularity = popularityOf(rec, now);
        const playing = BF.world ? BF.world.playerCount(rec.id) : crowdOf(rec, now);
        rec.visits += (playing / T.sessionMin) * (dt / MIN);
        rec.favorites += (playing / T.sessionMin) * (dt / MIN) * 0.012 * rec.approval;
        const next = T.milestones[rec.milestone || 0];
        if (next && playing >= next) {
          rec.milestone = (rec.milestone || 0) + 1;
          const bot = BF.bots.get(rec.botId);
          event('milestone', rec.name + ' just hit ' + U.compact(next) + ' players!', rec.id, rec.botId, now);
          if (bot && BF.friends && BF.friends.isFollowing(bot.id) && BF.notify && next >= 10000) BF.notify.push({ type: 'update', title: rec.name + ' is blowing up', body: bot.displayName + '\'s game just passed ' + U.compact(next) + ' players.', icon: 'fire', route: '#/game/' + rec.id });
        }
        if (rec.ad && rec.ad.until <= now) rec.ad = null;
        if (!rec.ad && r() < T.adChance * (now - rec.createdAt < DAY ? 3 : 1) * (dt / 4000)) {
          const mins = U.rand(T.adMinutes[0], T.adMinutes[1], r);
          const budget = Math.round((200 + r() * 4000) * (1 + rec.potential * 20));
          rec.ad = { until: now + mins * MIN, bid: r() * 10 + rec.potential * 10, headline: U.pick(['NEW GAME! Play ' + rec.name, rec.name + ': play free now', 'Can you beat ' + rec.name + '?', 'UPDATE out now!', 'The #1 ' + (g.genre || 'game') + ' game'], r).slice(0, 48), placements: U.shuffle(['home', 'discover', 'search'], r).slice(0, 1 + Math.floor(r() * 3)), budget };
          rec.adSpend = (rec.adSpend || 0) + budget;
          const bot = BF.bots.get(rec.botId);
          if (bot) event('ad', bot.displayName + ' is advertising ' + rec.name, rec.id, rec.botId, now);
        }
      }
      if (!s.nextAt) s.nextAt = now + U.rand(T.release[0], T.release[1], r) * 1000;
      if (now >= s.nextAt) { bg.release(now, r); s.nextAt = now + U.rand(T.release[0], T.release[1], r) * 1000; }
      // visits and ads change every tick; save them now and then rather than every tick
      if (now - (s.touched || 0) > 30000) { s.touched = now; BF.store.touch('botGames'); }
    },
    worldTick() { bg.tick(); },
    /** Forget cached listings (after an account switch). */
    reset() { cache.clear(); lastTick = 0; },
  });

  if (BF.bus) BF.bus.on('store:loaded', () => bg.reset());
})((window.BF = window.BF || {}));
