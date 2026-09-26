/**
 * BlockForge — game catalog, live server simulation, leaderboards and search.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const REGIONS = [
    ['US-East', 18, 60], ['US-West', 30, 80], ['EU-West', 60, 110], ['EU-Central', 70, 120],
    ['Asia-Pacific', 120, 190], ['South America', 110, 170], ['Oceania', 150, 220],
  ];

  // ---------------------------------------------------------------- catalog

  function userGames(includeUnpublished) {
    const s = BF.store.state;
    if (!s) return [];
    return s.created.filter((g) => includeUnpublished || (g.published && g.visibility !== 'private')).map(BF.creator.toListing);
  }

  /** Crowd tuning (data): the most popular game's peak players, popularity curve, minutes per visit. */
  const CROWD = { peak: 1600000, exp: 2.2, sessionMin: 8 };
  /** Built-in visit counts are stored in data at 1/VISIT_SCALE of the platform's size. */
  const VISIT_SCALE = 60;
  /** Live visit counters start counting from here, so they grow every minute and never go backwards. */
  const VISIT_EPOCH = Date.UTC(2026, 8, 24);
  /** Average share of peak through the day (the day curve's mean). */
  const DAY_MEAN = 0.62;
  function boostOf(gameId) {
    const b = world.boosts.get(gameId);
    if (!b) return 1;
    if (Date.now() > b.until) { world.boosts.delete(gameId); return 1; }
    return b.k;
  }

  const catalog = (BF.catalog = {
    /** Every listed game. Pass true to include your unpublished creations. */
    all(includeUnpublished) {
      return BF.GAME_REGISTRY.concat(userGames(includeUnpublished));
    },
    get(id) {
      return BF.GAME_REGISTRY.find((g) => g.id === id) || userGames(true).find((g) => g.id === id) || null;
    },
    isUserGame(id) {
      return String(id).indexOf('ug_') === 0;
    },

    /** Live and lifetime numbers for a listing. */
    stats(id) {
      const g = catalog.get(id);
      const s = BF.store.state;
      if (!g || !s) return { playing: 0, visits: 0, favorites: 0, likes: 0, dislikes: 0, approval: 0 };
      const vote = s.catalog.votes[id];
      const fav = s.catalog.favorites.includes(id);
      if (!g.builtIn) {
        const ug = s.created.find((x) => x.id === id) || {};
        const likes = (ug.likes || 0) + (vote === 'like' ? 1 : 0);
        const dislikes = (ug.dislikes || 0) + (vote === 'dislike' ? 1 : 0);
        return { playing: BF.world.playerCount(id), visits: ug.visits || 0, favorites: (ug.favorites || 0) + (fav ? 1 : 0), likes, dislikes, approval: likes + dislikes ? likes / (likes + dislikes) : 0 };
      }
      const extraVisits = (s.catalog.visits[id] || 0) + (BF.world.visitDelta.get(id) || 0);
      const baseLikes = g.baseLikes * 12;
      const baseDislikes = Math.round((baseLikes * (1 - g.approval)) / g.approval);
      const likes = baseLikes + (vote === 'like' ? 1 : 0);
      const dislikes = baseDislikes + (vote === 'dislike' ? 1 : 0);
      return {
        playing: BF.world.playerCount(id),
        visits: g.baseVisits * VISIT_SCALE + extraVisits * 40 + BF.world.liveVisits(id),
        favorites: g.baseFavorites * 12 + (fav ? 1 : 0),
        likes,
        dislikes,
        approval: likes / (likes + dislikes),
      };
    },

    isFavorite(id) {
      return BF.store.state.catalog.favorites.includes(id);
    },
    toggleFavorite(id) {
      let on = false;
      BF.store.update('catalog', (s) => {
        const f = s.catalog.favorites;
        const i = f.indexOf(id);
        if (i >= 0) f.splice(i, 1);
        else { f.unshift(id); on = true; }
      });
      return on;
    },
    myVote(id) {
      return BF.store.state.catalog.votes[id] || null;
    },
    /** Toggle a like/dislike vote. */
    vote(id, v) {
      BF.store.update('catalog', (s) => {
        if (s.catalog.votes[id] === v) delete s.catalog.votes[id];
        else s.catalog.votes[id] = v;
      });
      return BF.store.state.catalog.votes[id] || null;
    },
    recordVisit(id) {
      BF.store.update(['catalog', 'recent'], (s) => {
        s.catalog.visits[id] = (s.catalog.visits[id] || 0) + 1;
        s.recent = s.recent.filter((r) => r.gameId !== id);
        s.recent.unshift({ gameId: id, ts: BF.clock.now() });
        if (s.recent.length > 20) s.recent.length = 20;
      });
    },

    /**
     * Sort listings.
     * @param {string} key popular|trending|new|rating|visits|updated|name
     */
    sort(list, key) {
      const st = new Map(list.map((g) => [g.id, catalog.stats(g.id)]));
      const now = Date.now();
      const val = {
        popular: (g) => st.get(g.id).playing,
        trending: (g) => {
          const x = st.get(g.id);
          const fresh = Math.max(0, 1 - (now - new Date(g.updatedAt).getTime()) / (86400000 * 45));
          return (x.playing + 5) * (0.6 + x.approval) * (1 + fresh * 1.5) * (g.builtIn ? 1 : 1.3);
        },
        new: (g) => new Date(g.createdAt).getTime(),
        rating: (g) => st.get(g.id).approval,
        visits: (g) => st.get(g.id).visits,
        updated: (g) => new Date(g.updatedAt).getTime(),
        favorites: (g) => st.get(g.id).favorites,
      }[key];
      if (key === 'name') return list.slice().sort((a, b) => a.name.localeCompare(b.name));
      if (!val) return list.slice();
      return list.slice().sort((a, b) => val(b) - val(a));
    },

    /** Games in a category (Popular/Trending/New are sorts). */
    inCategory(cat, list) {
      list = list || catalog.all();
      if (!cat || cat === 'All') return list;
      if (cat === 'Popular') return catalog.sort(list, 'popular');
      if (cat === 'Trending') return catalog.sort(list, 'trending');
      if (cat === 'New') return catalog.sort(list, 'new');
      return list.filter((g) => (g.categories || [g.genre]).includes(cat));
    },

    /** Personalised picks from genres you play and favourite. */
    recommended() {
      const s = BF.store.state;
      const weight = {};
      const bump = (id, w) => {
        const g = catalog.get(id);
        if (g) (g.categories || [g.genre]).forEach((c) => { weight[c] = (weight[c] || 0) + w; });
      };
      s.recent.forEach((r, i) => bump(r.gameId, 3 / (i + 1)));
      s.catalog.favorites.forEach((id) => bump(id, 2));
      const played = new Set(s.recent.slice(0, 3).map((r) => r.gameId));
      return catalog.all()
        .filter((g) => !played.has(g.id))
        .map((g) => ({ g, score: (g.categories || [g.genre]).reduce((a, c) => a + (weight[c] || 0), 0) + g.popularity + Math.random() * 0.8 }))
        .sort((a, b) => b.score - a.score)
        .map((x) => x.g);
    },
  });

  // -------------------------------------------------------------- simulation

  let tickTimer = null;
  let sessionTimer = null;
  let usedServerIds = new Set();

  function newServerId() {
    let id;
    do id = String(U.randInt(1000, 9999)); while (usedServerIds.has(id));
    usedServerIds.add(id);
    return id;
  }

  const world = (BF.world = {
    servers: new Map(),
    loc: new Map(),
    menuOnline: new Set(),
    visitDelta: new Map(),
    session: null,
    lastSeen: new Map(),
    meets: new Map(),
    drift: new Map(),
    boosts: new Map(),

    /** Build the bot population and fill servers. */
    init() {
      world.stop();
      const s = BF.store.state;
      BF.bots.install(BF.bots.generate(s.world.seed));
      // saves from older builds can name bots the current roster no longer has
      const known = (id) => !!BF.bots.get(id);
      const soc = s.social;
      if (['friends', 'followers', 'following', 'blocked'].some((k) => soc[k].some((id) => !known(id))) || ['incoming', 'outgoing', 'recent'].some((k) => soc[k].some((r) => !known(r.id)))) {
        BF.store.update('social', (st) => {
          for (const k of ['friends', 'followers', 'following', 'blocked']) st.social[k] = st.social[k].filter(known);
          for (const k of ['incoming', 'outgoing', 'recent']) st.social[k] = st.social[k].filter((r) => known(r.id));
        });
      }
      world.servers = new Map();
      world.loc = new Map();
      world.menuOnline = new Set();
      world.visitDelta = new Map();
      world.session = null;
      world.meets = new Map();
      usedServerIds = new Set();
      for (const g of catalog.all()) world.servers.set(g.id, []);
      for (const bot of BF.bots.list) {
        const onlineChance = bot.personality === 'chaotic' ? 0.8 : bot.personality === 'beginner' ? 0.66 : 0.72;
        if (Math.random() > onlineChance) {
          world.lastSeen.set(bot.id, Date.now() - Math.floor(Math.random() * 86400000 * 3));
          continue;
        }
        if (Math.random() < 0.08) { world.menuOnline.add(bot.id); continue; }
        world.place(bot, world.pickGame(bot));
      }
      for (const g of catalog.all()) if (!world.servers.get(g.id).length && g.builtIn) world.newServer(g.id);
      world.start();
      BF.bus.emit('world:ready');
    },

    start() {
      world.stop();
      tickTimer = setInterval(world.tick, 4000);
      const loop = () => {
        sessionTimer = setTimeout(() => { world.sessionTick(); loop(); }, 9000 + Math.random() * 14000);
      };
      loop();
    },

    stop() {
      clearInterval(tickTimer);
      clearTimeout(sessionTimer);
      tickTimer = sessionTimer = null;
    },

    /** Choose a game for a bot (popularity x taste). */
    pickGame(bot) {
      const list = catalog.all();
      return U.weighted(list.map((g) => [Math.pow(g.popularity || 0.3, 1.6) * (bot.favoriteGames.includes(g.id) ? 3 : 1) * (g.builtIn ? 1 : 0.6), g.id]));
    },

    newServer(gameId) {
      const g = catalog.get(gameId);
      if (!g) return null;
      const reg = U.pick(REGIONS);
      const srv = { id: newServerId(), gameId, max: g.maxPlayers || 12, ping: U.randInt(reg[1], reg[2]), region: reg[0], bots: [], createdAt: Date.now() - U.randInt(60, 3 * 3600) * 1000, user: false };
      if (!world.servers.has(gameId)) world.servers.set(gameId, []);
      world.servers.get(gameId).push(srv);
      return srv;
    },

    /** Put a bot into a game, filling servers to a natural 60-95% before opening another. */
    place(bot, gameId) {
      if (!world.servers.has(gameId)) world.servers.set(gameId, []);
      const list = world.servers.get(gameId);
      let srv = list.find((sv) => sv.bots.length + (sv.user ? 1 : 0) < Math.floor(sv.max * (0.72 + Math.random() * 0.26)));
      if (!srv) srv = world.newServer(gameId);
      if (!srv) return null;
      srv.bots.push(bot.id);
      world.loc.set(bot.id, { gameId, serverId: srv.id });
      world.menuOnline.delete(bot.id);
      return srv;
    },

    /** Remove a bot from wherever it is. */
    unplace(botId) {
      const l = world.loc.get(botId);
      if (!l) return null;
      const srv = world.findServer(l.gameId, l.serverId);
      if (srv) srv.bots = srv.bots.filter((b) => b !== botId);
      world.loc.delete(botId);
      if (srv && !srv.bots.length && !srv.user) {
        const list = world.servers.get(l.gameId);
        if (list.length > 1) world.servers.set(l.gameId, list.filter((x) => x !== srv));
      }
      return l;
    },

    findServer(gameId, serverId) {
      return (world.servers.get(gameId) || []).find((s) => s.id === serverId) || null;
    },

    /** Servers for a game, busiest first. */
    serversFor(gameId) {
      if (!world.servers.has(gameId)) world.servers.set(gameId, []);
      const list = world.servers.get(gameId);
      const g = catalog.get(gameId);
      if (!list.length && g && (g.builtIn || g.published)) world.newServer(gameId);
      return list.slice().sort((a, b) => (b.bots.length + (b.user ? 1 : 0)) - (a.bots.length + (a.user ? 1 : 0)) || a.ping - b.ping);
    },

    /** Players you can meet: the named bots actually placed in this game's servers. */
    trackedCount(gameId) {
      return (world.servers.get(gameId) || []).reduce((a, s) => a + s.bots.length + (s.user ? 1 : 0), 0);
    },

    /**
     * Everyone else playing: a crowd sized by popularity, following a day curve
     * (quiet at dawn, busiest in the evening), with a slow random drift and any
     * event boost from a developer update. Creator games draw a crowd from their
     * recent visits (about 8 minutes per visit).
     */
    crowd(gameId) {
      const g = catalog.get(gameId);
      if (!g) return 0;
      if (!g.builtIn) {
        const ug = (BF.store.state && BF.store.state.created.find((x) => x.id === gameId)) || null;
        if (!ug || !ug.published) return 0;
        const h = (ug.hist || []).slice(-3);
        const perMin = h.length ? h.reduce((a, b) => a + b.v, 0) / h.length : 0;
        return Math.round(perMin * CROWD.sessionMin * boostOf(gameId));
      }
      const d = new Date(BF.clock ? BF.clock.now() : Date.now());
      const hour = d.getHours() + d.getMinutes() / 60;
      const day = 0.62 + 0.38 * Math.sin(((hour - 13) / 24) * Math.PI * 2);
      const weekend = d.getDay() === 0 || d.getDay() === 6 ? 1.18 : 1;
      const drift = world.drift.get(gameId) || 1;
      return Math.round(CROWD.peak * Math.pow(g.popularity || 0.3, CROWD.exp) * day * weekend * drift * boostOf(gameId));
    },

    playerCount(gameId) {
      return world.trackedCount(gameId) + world.crowd(gameId);
    },

    /** Typical visits per minute for a built-in game (its crowd over a day, one visit per session). */
    visitRate(gameId) {
      const g = catalog.get(gameId);
      if (!g || !g.builtIn) return 0;
      return (CROWD.peak * Math.pow(g.popularity || 0.3, CROWD.exp) * DAY_MEAN) / CROWD.sessionMin;
    },
    /** Visits since the live counter started: grows every minute, same on every reload. */
    liveVisits(gameId, now) {
      const t = now == null ? (BF.clock ? BF.clock.now() : Date.now()) : now;
      return Math.max(0, Math.floor(world.visitRate(gameId) * ((t - VISIT_EPOCH) / 60000)));
    },

    /** How many servers a game is running (the tracked ones plus the crowd's). */
    serverTotal(gameId) {
      const g = catalog.get(gameId);
      const per = Math.max(2, Math.round(((g && g.maxPlayers) || 12) * 0.82));
      return (world.servers.get(gameId) || []).length + Math.ceil(world.crowd(gameId) / per);
    },

    totalOnline() {
      let n = world.menuOnline.size + 1;
      for (const list of world.servers.values()) for (const s of list) n += s.bots.length;
      for (const g of catalog.all()) n += world.crowd(g.id);
      // players browsing menus, the shop and profiles rather than a game
      return Math.round(n * 1.14);
    },

    /** Temporarily multiply a game's crowd (events from developer updates). */
    boost(gameId, k, ms) { world.boosts.set(gameId, { k, until: Date.now() + ms }); },

    /** Where a bot is right now. */
    botStatus(id) {
      const l = world.loc.get(id);
      if (l) return { state: 'ingame', gameId: l.gameId, serverId: l.serverId };
      if (world.menuOnline.has(id)) return { state: 'online' };
      return { state: 'offline', lastSeen: world.lastSeen.get(id) || Date.now() - 86400000 };
    },

    /**
     * Join a server (or the best one). Returns {ok, server} or {ok:false, reason}.
     */
    join(gameId, serverId) {
      world.leave();
      let srv = serverId ? world.findServer(gameId, serverId) : null;
      if (serverId && !srv) return { ok: false, reason: 'gone' };
      if (srv && srv.bots.length + 1 > srv.max) return { ok: false, reason: 'full' };
      if (!srv) {
        // a bot that agreed in chat to meet you here: join its server when there is room
        for (const [id, mt] of world.meets) {
          if (mt.gameId !== gameId || mt.until < Date.now()) continue;
          const l = world.loc.get(id);
          const cand = l && l.gameId === gameId ? world.findServer(gameId, l.serverId) : null;
          if (cand && cand.bots.length + 1 <= cand.max) { srv = cand; break; }
        }
      }
      if (!srv) {
        const list = world.serversFor(gameId).filter((s) => s.bots.length + 1 <= s.max);
        srv = list.find((s) => s.bots.length >= 2 && s.bots.length + 1 < s.max) || list[0] || world.newServer(gameId);
      }
      if (!srv) return { ok: false, reason: 'missing' };
      srv.user = true;
      world.session = { gameId, serverId: srv.id };
      BF.bus.emit('world:changed');
      return { ok: true, server: srv };
    },

    leave() {
      if (!world.session) return;
      const srv = world.findServer(world.session.gameId, world.session.serverId);
      if (srv) srv.user = false;
      world.session = null;
      BF.bus.emit('world:changed');
    },

    sessionServer() {
      return world.session ? world.findServer(world.session.gameId, world.session.serverId) : null;
    },

    /** Frequent join/leave churn in the server you are playing on. */
    sessionTick() {
      const srv = world.sessionServer();
      if (!srv) return;
      const game = catalog.get(srv.gameId);
      const occupancy = (srv.bots.length + 1) / srv.max;
      const leavers = srv.bots.filter((id) => !world.meets.has(id));
      const wantsLeave = leavers.length > 1 && (occupancy > 0.8 ? Math.random() < 0.6 : Math.random() < 0.35);
      if (wantsLeave) {
        const id = U.pick(leavers);
        const bot = BF.bots.get(id);
        world.unplace(id);
        if (Math.random() < 0.7) world.place(bot, world.pickGame(bot));
        else world.lastSeen.set(id, Date.now());
        BF.bus.emit('server:leave', { gameId: srv.gameId, serverId: srv.id, bot });
      } else if (srv.bots.length + 1 < srv.max) {
        const candidates = [];
        for (const b of BF.bots.list) {
          const l = world.loc.get(b.id);
          if (BF.friends.isBlocked(b.id)) continue;
          if (!l || l.gameId !== srv.gameId || l.serverId !== srv.id) candidates.push(b);
          if (candidates.length > 60) break;
        }
        const bot = U.pick(U.shuffle(candidates).slice(0, 20));
        if (!bot) return;
        world.unplace(bot.id);
        srv.bots.push(bot.id);
        world.loc.set(bot.id, { gameId: srv.gameId, serverId: srv.id });
        world.menuOnline.delete(bot.id);
        world.visitDelta.set(srv.gameId, (world.visitDelta.get(srv.gameId) || 0) + 1);
        BF.bus.emit('server:join', { gameId: srv.gameId, serverId: srv.id, bot, game });
      }
    },

    /** Platform-wide simulation step (every 4 seconds). */
    tick() {
      const s = BF.store.state;
      if (!s) return;
      const sessionSrv = world.sessionServer();
      const churn = Math.max(2, Math.round(BF.bots.list.length * 0.012));
      for (let i = 0; i < churn; i++) {
        const bot = U.pick(BF.bots.list);
        const l = world.loc.get(bot.id);
        if (l && sessionSrv && l.serverId === sessionSrv.id && l.gameId === sessionSrv.gameId) continue;
        const r = Math.random();
        if (l) {
          world.unplace(bot.id);
          if (r < 0.35) world.lastSeen.set(bot.id, Date.now());
          else if (r < 0.45) world.menuOnline.add(bot.id);
          else world.place(bot, world.pickGame(bot));
        } else if (world.menuOnline.has(bot.id)) {
          world.menuOnline.delete(bot.id);
          if (r < 0.8) world.place(bot, world.pickGame(bot));
          else world.lastSeen.set(bot.id, Date.now());
        } else if (r < 0.55) {
          world.place(bot, world.pickGame(bot));
        }
        if (world.loc.has(bot.id)) world.visitDelta.set(world.loc.get(bot.id).gameId, (world.visitDelta.get(world.loc.get(bot.id).gameId) || 0) + 1);
      }

      // Bots win games and earn coins so leaderboards move.
      if (Math.random() < 0.5) {
        const bot = U.pick(BF.bots.list);
        if (world.loc.has(bot.id)) BF.bots.progress(bot.id, { wins: Math.random() < 0.5 ? 1 : 0, played: 1, coins: U.randInt(10, 80), lvl: Math.random() < 0.05 ? 1 : 0 });
      }

      // Social events.
      const socialScale = s.settings.gameplay.botChat === 'quiet' ? 0.5 : s.settings.gameplay.botChat === 'lively' ? 1.8 : 1;
      if (Math.random() < 0.012 * socialScale && s.social.incoming.length < 6) {
        const cand = BF.bots.list.filter((b) => !BF.friends.isFriend(b.id) && !BF.friends.isBlocked(b.id) && world.botStatus(b.id).state !== 'offline');
        if (cand.length) BF.friends.receiveRequest(U.pick(cand).id);
      }
      if (Math.random() < 0.01 * socialScale) world.botDM();
      if (Math.random() < 0.008 * socialScale && s.settings.privacy.invites) world.botInvite();

      for (const req of s.social.outgoing) if (Date.now() - req.at > 20000) BF.friends.resolveOutgoing(req.id);

      // crowds drift slowly (a few percent a minute) so counts feel alive
      for (const g of BF.GAME_REGISTRY) { const v = world.drift.get(g.id) || 1; world.drift.set(g.id, U.clamp(v + (Math.random() - 0.5) * 0.02 + (1 - v) * 0.02, 0.85, 1.15)); }
      if (BF.creator) BF.creator.simulate();
      if (BF.followers) BF.followers.worldTick();
      if (BF.limiteds) BF.limiteds.worldTick();
      if (BF.updates) BF.updates.worldTick();
      BF.bus.emit('world:tick');
    },

    /** A friend (or anyone, depending on privacy) sends a private message. */
    botDM(force) {
      const s = BF.store.state;
      const pref = s.settings.privacy.messages;
      if (pref === 'none' && !force) return;
      const pool = (pref === 'friends' || Math.random() < 0.7 ? BF.friends.list() : BF.bots.list.slice(0, 80)).filter((b) => !BF.friends.isBlocked(b.id));
      const bot = U.pick(pool);
      if (!bot) return;
      const m = BF.dialogue.dmOpen(bot);
      BF.messages.receive(bot.id, m.text, { invite: m.invite });
    },

    /**
     * A bot agreed (in chat) to meet the player in a game: it heads there now,
     * and the player's next Play for that game lands in the same server.
     */
    meetPlayer(botId, gameId) {
      const bot = BF.bots.get(botId);
      if (!bot || !catalog.get(gameId)) return null;
      world.meets.set(botId, { gameId, until: Date.now() + 15 * 60000 });
      const l = world.loc.get(botId);
      const sess = world.sessionServer();
      if (sess && sess.gameId === gameId) {
        if (!sess.bots.includes(botId) && sess.bots.length + 1 < sess.max) {
          world.unplace(botId);
          sess.bots.push(botId);
          world.loc.set(botId, { gameId, serverId: sess.id });
          world.menuOnline.delete(botId);
          BF.bus.emit('server:join', { gameId, serverId: sess.id, bot, game: catalog.get(gameId) });
        }
      } else if (!l || l.gameId !== gameId) {
        const leaving = sess && l && l.gameId === sess.gameId && l.serverId === sess.id;
        world.unplace(botId);
        world.place(bot, gameId);
        if (leaving) BF.bus.emit('server:leave', { gameId: sess.gameId, serverId: sess.id, bot });
      }
      BF.bus.emit('world:changed');
      return world.loc.get(botId) || null;
    },

    /** An in-game friend invites you to their server. */
    botInvite(force) {
      const friendsIn = BF.friends.list().filter((b) => world.loc.has(b.id));
      const bot = U.pick(friendsIn);
      if (!bot) { if (force) world.botDM(true); return; }
      const l = world.loc.get(bot.id);
      const game = catalog.get(l.gameId);
      if (!game) return;
      BF.notify.push({ type: 'invite', title: bot.displayName + ' invited you to play', body: 'Join them in ' + game.name + ' (Server #' + l.serverId + ').', icon: 'gamepad', route: '#/game/' + game.id, action: { kind: 'invite', gameId: game.id, serverId: l.serverId, botId: bot.id } });
    },

    /** Developer panel: add bots to servers of a game. */
    spawnBots(count, gameId) {
      let n = 0;
      const offline = BF.bots.list.filter((b) => !world.loc.has(b.id));
      for (const bot of U.shuffle(offline).slice(0, count)) {
        world.place(bot, gameId || world.pickGame(bot));
        n++;
      }
      BF.bus.emit('world:changed');
      return n;
    },

    /** Developer panel: send every bot offline (your current server is kept). */
    clearBots() {
      const keep = world.sessionServer();
      for (const [id, l] of Array.from(world.loc.entries())) {
        if (keep && l.serverId === keep.id && l.gameId === keep.gameId) continue;
        world.unplace(id);
        world.lastSeen.set(id, Date.now());
      }
      world.menuOnline.clear();
      BF.bus.emit('world:changed');
    },
  });

  // ------------------------------------------------------------ leaderboards

  const RANGES = {
    'block-battlegrounds:kills': [40, 9000], 'block-battlegrounds:wins': [2, 900],
    'skyline-racers:bestTime': [71000, 150000], 'skyline-racers:wins': [1, 600],
    'treasure-islands:treasures': [10, 4000], 'towerfall-legends:highestWave': [4, 20],
    'pet-world:petbucks': [5000, 9000000], 'pet-world:pets': [3, 900],
    'sky-obby:bestTime': [78000, 360000], 'sky-obby:wins': [1, 400],
    'city-life:jobs': [2, 1500], 'city-life:cash': [1500, 2500000],
    'dungeon-frontier:highestFloor': [1, 3], 'dungeon-frontier:kills': [20, 12000],
    'elemental-clash:kos': [10, 8000], 'elemental-clash:wins': [1, 700],
    'zombie-outbreak:highestWave': [2, 10], 'zombie-outbreak:kills': [30, 25000],
    'factory-tycoon:bestScore': [5000, 90000000], 'treasure-tycoon:gold': [2000, 40000000],
    'mega-miners:maxDepth': [20, 400], 'mega-miners:blocks': [100, 200000],
    'battle-boats:sinks': [5, 6000], 'battle-boats:wins': [1, 500],
    'pixel-soccer:goals': [2, 3000], 'pixel-soccer:wins': [1, 800],
    'cosmic-survival:bestSurvival': [30, 900], 'cosmic-survival:bestScore': [800, 400000],
    'castle-siege:highestWave': [3, 15],
    'speed-trials:bestTime': [23000, 60000], 'speed-trials:medals': [1, 15],
    'pet-battle-arena:wins': [1, 1500], 'pet-battle-arena:ladder': [1, 5],
    'mystery-mansion:bestTime': [240000, 1800000], 'mystery-mansion:beetles': [0, 5],
  };

  /** Ranges for stats shared by many games (the arcade engines). */
  const STAT_RANGES = {
    bestDistance: [300, 9000], bestScore: [300, 12000], bestPoints: [8, 60], roundsWon: [1, 400], tags: [1, 1500], bestSurvival: [20, 150],
    bestHaul: [100, 6000], fishCaught: [5, 4000], legendaries: [0, 30], bestSeason: [200, 4000], harvests: [10, 5000], bestShift: [150, 2400],
    served: [10, 6000], ringsHit: [10, 5000], bestRound: [14, 40], aces: [0, 60], bestEscape: [60000, 400000], found: [1, 900], correct: [5, 3000], wins: [1, 900],
  };
  function botStat(bot, gameId, def) {
    const range = RANGES[gameId + ':' + def.stat] || STAT_RANGES[def.stat] || [1, 500];
    const r = U.rng(bot.id + ':' + gameId + ':' + def.stat)();
    const skill = U.clamp(bot.skill * 0.75 + r * 0.35, 0, 1);
    const curve = Math.pow(skill, def.order === 'asc' ? 1 : 2.4);
    if (def.order === 'asc') return Math.round(range[1] - (range[1] - range[0]) * curve);
    const v = range[0] + (range[1] - range[0]) * curve * (0.35 + 0.65 * Math.min(1, bot.level / 60));
    return Math.max(range[0], Math.round(v));
  }

  BF.leaderboards = {
    GLOBAL: [
      { key: 'level', label: 'Level', icon: 'star' },
      { key: 'coins', label: 'Richest', icon: 'coin' },
      { key: 'wins', label: 'Wins', icon: 'trophy' },
      { key: 'games', label: 'Games Played', icon: 'gamepad' },
      { key: 'achievements', label: 'Achievements', icon: 'medal' },
    ],

    /** Global board: every bot plus you. */
    global(key) {
      const s = BF.store.state;
      const rows = BF.bots.list.map((b) => {
        const st = BF.bots.stats(b);
        const value = { level: st.level, coins: st.coins, wins: st.wins, games: st.gamesPlayed, achievements: st.achievements }[key];
        return { id: b.id, bot: b, name: b.displayName, username: b.username, value };
      });
      const mine = { level: s.player.level, coins: s.wallet.balance, wins: s.player.stats.wins, games: s.player.stats.gamesPlayed, achievements: Object.keys(s.achievements).length }[key];
      rows.push({ id: 'me', me: true, name: s.player.displayName, username: s.player.username, value: mine });
      rows.sort((a, b) => b.value - a.value || (a.me ? -1 : 1));
      rows.forEach((r, i) => { r.rank = i + 1; });
      return { rows: rows.slice(0, 50), you: rows.find((r) => r.me), total: rows.length };
    },

    /** Game board for one stat definition. */
    game(gameId, stat) {
      const g = catalog.get(gameId);
      const def = (g.leaderboard || []).find((d) => d.stat === stat) || (g.leaderboard || [])[0];
      if (!def) return { rows: [], def: null };
      const pool = BF.bots.list.filter((b) => b.favoriteGames.includes(gameId) || U.rng(b.id + gameId)() < 0.12);
      const rows = pool.map((b) => ({ id: b.id, bot: b, name: b.displayName, username: b.username, value: botStat(b, gameId, def) }));
      const pr = BF.store.state.progress[gameId];
      const mine = pr ? pr[def.stat] : null;
      if (mine != null && mine !== 0) rows.push({ id: 'me', me: true, name: BF.store.state.player.displayName, username: BF.store.state.player.username, value: mine });
      rows.sort((a, b) => (def.order === 'asc' ? a.value - b.value : b.value - a.value));
      rows.forEach((r, i) => { r.rank = i + 1; });
      return { rows: rows.slice(0, 50), you: rows.find((r) => r.me) || null, def, total: rows.length };
    },

    /** Format a value for a stat definition. */
    format(def, v) {
      if (v == null) return '—';
      if (def && def.format === 'time') return U.fmtTime(v);
      if (def && def.format === 'clock') return U.fmtClock(v);
      return U.fmt(v);
    },
  };

  // ------------------------------------------------------------------ search

  function score(text, q) {
    const t = String(text).toLowerCase();
    if (t === q) return 100;
    if (t.startsWith(q)) return 60;
    const i = t.indexOf(q);
    if (i < 0) return 0;
    return /[\s_]/.test(t[i - 1] || '') ? 40 : 25;
  }

  BF.search = {
    /**
     * Search games, players, avatar items and creators.
     * @returns {{games:object[], players:object[], items:object[], creators:object[]}}
     */
    query(q, limit) {
      q = String(q || '').trim().toLowerCase();
      limit = limit || 50;
      if (!q) return { games: [], players: [], items: [], creators: [] };
      const games = catalog.all()
        .map((g) => ({ g, sc: Math.max(score(g.name, q), score(g.creator, q) * 0.5, (g.categories || []).some((c) => c.toLowerCase() === q) ? 30 : 0) }))
        .filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, limit).map((x) => x.g);
      const s = BF.store.state;
      const players = [];
      if (s && (score(s.player.username, q) || score(s.player.displayName, q))) players.push({ me: true, id: 'me', username: s.player.username, displayName: s.player.displayName });
      BF.bots.list
        .map((b) => ({ b, sc: Math.max(score(b.username, q), score(b.displayName, q)) }))
        .filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc || a.b.username.length - b.b.username.length).slice(0, limit)
        .forEach((x) => players.push(x.b));
      const items = BF.ITEM_LIST
        .filter((i) => i.cat !== 'tool')
        .map((i) => ({ i, sc: Math.max(score(i.name, q), score(BF.ITEM_CATS[i.cat].label, q) * 0.5) }))
        .filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, limit).map((x) => x.i);
      const creatorNames = new Set();
      catalog.all().forEach((g) => creatorNames.add(g.creator));
      BF.ITEM_LIST.forEach((i) => creatorNames.add(i.creator));
      const creators = Array.from(creatorNames)
        .map((name) => ({ name, sc: score(name, q) }))
        .filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, limit)
        .map((x) => ({ name: x.name, games: catalog.all().filter((g) => g.creator === x.name).length, items: BF.ITEM_LIST.filter((i) => i.creator === x.name).length }));
      return { games, players, items, creators };
    },

    /** Grouped autocomplete suggestions. */
    suggest(q) {
      const r = BF.search.query(q, 6);
      return { games: r.games.slice(0, 4), players: r.players.slice(0, 3), items: r.items.slice(0, 3), creators: r.creators.slice(0, 2) };
    },
  };
})((window.BF = window.BF || {}));
