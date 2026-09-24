/**
 * BlockForge — Create: user-made game listings built on playable templates,
 * with passes, publishing and simulated visits / revenue.
 */
(function (BF) {
  'use strict';

  const U = BF.util;

  const TEMPLATES = {
    arena: { label: 'Arena', gameType: 'arena', base: 'block-battlegrounds', icon: 'sword', genre: 'Fighting', desc: 'Top-down combat arena with rounds, pickups and bot rivals.' },
    racing: { label: 'Racing', gameType: 'racing', base: 'skyline-racers', icon: 'flag', genre: 'Racing', desc: 'A generated race track with checkpoints, laps and AI racers.' },
    obby: { label: 'Obby', gameType: 'obby', base: 'sky-obby', icon: 'chevronUp', genre: 'Obby', desc: 'A procedurally built parkour course with checkpoints.' },
    simulator: { label: 'Simulator', gameType: 'miner', base: 'mega-miners', icon: 'gem', genre: 'Simulator', desc: 'Dig, collect, sell and upgrade in a generated mine.' },
    towerdefense: { label: 'Tower Defense', gameType: 'towerdefense', base: 'towerfall-legends', icon: 'shield', genre: 'Strategy', desc: 'A generated path with towers, upgrades and waves.' },
  };

  const PASS_EFFECTS = {
    double_xp: 'Double XP in this game',
    bonus_coins: '+25% ForgeCoin rewards in this game',
    vip: 'VIP tag and a golden name in chat',
  };

  const creator = (BF.creator = {
    TEMPLATES,
    PASS_EFFECTS,
    THUMB_COLORS: ['#ff7a2e', '#46a8ff', '#4ad17f', '#b67cff', '#ff4f9a', '#ffc940', '#39f3ff', '#e03e5a'],
    THUMB_PATTERNS: ['grid', 'stripes', 'dots', 'stars', 'none'],

    list() {
      return BF.store.state ? BF.store.state.created : [];
    },
    get(id) {
      return creator.list().find((g) => g.id === id) || null;
    },

    /** Validate editable fields. Returns {field: message}. */
    validate(d) {
      const e = {};
      const name = String(d.name || '').trim();
      if (name.length < 3) e.name = 'Game names need at least 3 characters.';
      else if (name.length > 40) e.name = 'Keep the name under 40 characters.';
      else if (BF.GAME_REGISTRY.some((g) => g.name.toLowerCase() === name.toLowerCase())) e.name = 'An official game already uses that name.';
      if (String(d.description || '').length > 600) e.description = 'Descriptions can be up to 600 characters.';
      if (!BF.GAME_CATEGORIES.includes(d.genre)) e.genre = 'Pick a genre.';
      const mp = Number(d.maxPlayers);
      if (!(mp >= 2 && mp <= 50)) e.maxPlayers = 'Max players must be between 2 and 50.';
      if (d.template && !TEMPLATES[d.template]) e.template = 'Pick a template.';
      return e;
    },

    /** Convert a creation into a catalog listing (same shape as built-in games). */
    toListing(ug) {
      const t = TEMPLATES[ug.template] || TEMPLATES.arena;
      const base = BF.GAME_REGISTRY.find((g) => g.id === t.base);
      const s = BF.store.state;
      return {
        id: ug.id,
        name: ug.name,
        gameType: t.gameType,
        genre: ug.genre,
        categories: [ug.genre, t.genre].filter((v, i, a) => a.indexOf(v) === i),
        creator: s ? s.player.username : 'You',
        creatorId: 'me',
        description: ug.description || 'A ' + t.label.toLowerCase() + ' game made in BlockForge Create.',
        maxPlayers: ug.maxPlayers,
        approval: 0.8,
        baseVisits: 0,
        baseFavorites: 0,
        baseLikes: 0,
        createdAt: new Date(ug.createdAt).toISOString().slice(0, 10),
        updatedAt: new Date(ug.updatedAt).toISOString().slice(0, 10),
        ageRating: 'All Ages',
        popularity: ug.published ? 0.22 + Math.min(0.3, (ug.visits || 0) / 4000) : 0,
        passes: (ug.passes || []).map((p) => Object.assign({ gameId: ug.id, kind: 'pass', icon: 'ticket' }, p)),
        products: [],
        badges: [],
        leaderboard: base ? base.leaderboard.slice(0, 1) : [],
        chat: base ? base.chat : {},
        controls: base ? base.controls : '',
        howTo: base ? base.howTo : '',
        activeBots: base ? base.activeBots : 5,
        changelog: [{ v: String(ug.version || 1), date: new Date(ug.updatedAt).toISOString().slice(0, 10), notes: 'Updated by the creator.' }],
        builtIn: false,
        userGame: true,
        published: !!ug.published,
        visibility: ug.visibility,
        template: ug.template,
        thumbnail: ug.thumbnail,
        config: { seed: ug.seed, themeColor: ug.thumbnail && ug.thumbnail.color, difficulty: ug.difficulty || 'normal', custom: true, name: ug.name },
      };
    },

    /** Create a new (unpublished) game. */
    create(d) {
      const errors = creator.validate(d);
      if (Object.keys(errors).length) return { ok: false, errors };
      const now = BF.clock.now();
      const ug = {
        id: U.uid('ug'),
        name: String(d.name).trim(),
        description: String(d.description || '').trim(),
        genre: d.genre,
        template: d.template || 'arena',
        maxPlayers: Math.round(Number(d.maxPlayers)),
        thumbnail: d.thumbnail || { type: 'preset', color: creator.THUMB_COLORS[0], pattern: 'grid' },
        visibility: d.visibility || 'public',
        difficulty: d.difficulty || 'normal',
        seed: U.randInt(1, 1e9),
        published: false,
        createdAt: now,
        updatedAt: now,
        publishedAt: 0,
        version: 1,
        visits: 0, likes: 0, dislikes: 0, favorites: 0, revenue: 0, pending: 0, sales: 0,
        passes: [],
      };
      BF.store.update(['created', 'player'], (s) => {
        s.created.unshift(ug);
        s.player.stats.gamesCreated += 1;
      });
      BF.quests.track('create_game', 1);
      BF.notify.push({ type: 'system', title: 'Game created: ' + ug.name, body: 'Publish it from My Creations when you are ready for players.', icon: 'anvil', route: '#/create/' + ug.id, silent: true });
      BF.bus.emit('creator:changed', { id: ug.id });
      return { ok: true, game: ug };
    },

    /** Edit fields (name, description, genre, max players, thumbnail, visibility, template, difficulty). */
    update(id, patch) {
      const ug = creator.get(id);
      if (!ug) return { ok: false, errors: { name: 'Game not found.' } };
      const merged = Object.assign({}, ug, patch);
      const errors = creator.validate(merged);
      if (Object.keys(errors).length) return { ok: false, errors };
      BF.store.update('created', () => {
        ['name', 'description', 'genre', 'maxPlayers', 'thumbnail', 'visibility', 'template', 'difficulty'].forEach((k) => {
          if (patch[k] !== undefined) ug[k] = k === 'maxPlayers' ? Math.round(Number(patch[k])) : typeof patch[k] === 'string' ? patch[k].trim() : patch[k];
        });
        if (patch.regenerate) ug.seed = U.randInt(1, 1e9);
        ug.updatedAt = BF.clock.now();
        ug.version = (ug.version || 1) + 1;
      });
      (BF.world.servers.get(id) || []).forEach((srv) => { srv.max = ug.maxPlayers; });
      BF.quests.track('create_game', 1);
      BF.bus.emit('creator:changed', { id });
      return { ok: true, game: ug };
    },

    publish(id) {
      const ug = creator.get(id);
      if (!ug) return { ok: false };
      const first = !ug.publishedAt;
      BF.store.update(['created', 'player'], (s) => {
        ug.published = true;
        ug.publishedAt = ug.publishedAt || BF.clock.now();
        ug.updatedAt = BF.clock.now();
        if (first) s.player.stats.gamesPublished += 1;
      });
      if (!BF.world.servers.get(id) || !BF.world.servers.get(id).length) BF.world.newServer(id);
      BF.badges.award('pb_creator');
      BF.notify.push({ type: 'update', title: ug.name + ' is live!', body: 'Players can now find it in Discover and search.', icon: 'globe', route: '#/game/' + id });
      BF.bus.emit('creator:changed', { id });
      return { ok: true };
    },

    unpublish(id) {
      const ug = creator.get(id);
      if (!ug) return { ok: false };
      BF.store.update('created', () => { ug.published = false; ug.updatedAt = BF.clock.now(); });
      for (const srv of BF.world.servers.get(id) || []) for (const b of srv.bots.slice()) BF.world.unplace(b);
      BF.world.servers.set(id, []);
      BF.bus.emit('creator:changed', { id });
      return { ok: true };
    },

    remove(id) {
      creator.unpublish(id);
      BF.store.update(['created', 'catalog', 'recent'], (s) => {
        s.created = s.created.filter((g) => g.id !== id);
        s.catalog.favorites = s.catalog.favorites.filter((g) => g !== id);
        s.recent = s.recent.filter((r) => r.gameId !== id);
        for (const pid of Object.keys(s.passes)) if (s.passes[pid].gameId === id) delete s.passes[pid];
      });
      BF.world.servers.delete(id);
      BF.bus.emit('creator:changed', { id });
      return { ok: true };
    },

    addPass(id, p) {
      const ug = creator.get(id);
      const name = String(p.name || '').trim();
      const price = Math.round(Number(p.price));
      if (!ug) return { ok: false, error: 'Game not found.' };
      if (name.length < 3 || name.length > 30) return { ok: false, error: 'Pass names need 3-30 characters.' };
      if (!(price >= 10 && price <= 100000)) return { ok: false, error: 'Price must be between 10 and 100,000 ForgeCoins.' };
      if ((ug.passes || []).length >= 6) return { ok: false, error: 'A game can have up to 6 passes.' };
      const pass = { id: U.uid('ugp'), name, price, desc: String(p.desc || PASS_EFFECTS[p.effect] || '').trim(), effect: PASS_EFFECTS[p.effect] ? p.effect : 'vip' };
      BF.store.update('created', () => { ug.passes = (ug.passes || []).concat(pass); ug.updatedAt = BF.clock.now(); });
      return { ok: true, pass };
    },

    removePass(id, passId) {
      const ug = creator.get(id);
      if (!ug) return { ok: false };
      BF.store.update('created', () => { ug.passes = (ug.passes || []).filter((p) => p.id !== passId); });
      return { ok: true };
    },

    /** Move pending revenue into your wallet. */
    collect(id) {
      const ug = creator.get(id);
      if (!ug || !(ug.pending > 0)) return { ok: false, error: 'No earnings to collect yet.' };
      const amount = Math.floor(ug.pending);
      BF.store.update('created', () => { ug.pending = 0; });
      BF.economy.earn(amount, 'Creator earnings: ' + ug.name, 'creator');
      return { ok: true, amount };
    },

    /** World tick: published games attract visits, votes and pass sales. */
    simulate() {
      const s = BF.store.state;
      if (!s || !s.created.length) return;
      let touched = false;
      for (const ug of s.created) {
        if (!ug.published || ug.visibility === 'private') continue;
        const quality = 0.4 + Math.min(0.3, (ug.description || '').length / 600) + (ug.thumbnail && ug.thumbnail.type === 'image' ? 0.1 : 0.05) + Math.min(0.2, (ug.passes || []).length * 0.05);
        const playing = BF.world.playerCount(ug.id);
        const visits = (Math.random() < 0.55 * quality ? U.randInt(1, 3) : 0) + (playing > 0 && Math.random() < 0.3 ? 1 : 0);
        if (!visits) continue;
        touched = true;
        ug.visits += visits;
        if (Math.random() < 0.18 * quality) ug.likes += 1;
        if (Math.random() < 0.04) ug.dislikes += 1;
        if (Math.random() < 0.06 * quality) ug.favorites += 1;
        ug.pending = (ug.pending || 0) + visits * 0.2;
        ug.revenue = (ug.revenue || 0) + visits * 0.2;
        for (const p of ug.passes || []) {
          if (Math.random() < 0.012 * quality * Math.max(0.3, 1 - p.price / 3000)) {
            const share = Math.floor(p.price * 0.7);
            ug.pending += share;
            ug.revenue += share;
            ug.sales = (ug.sales || 0) + 1;
            const buyer = U.pick(BF.bots.list);
            BF.notify.push({ type: 'update', title: 'Pass sold in ' + ug.name, body: buyer.displayName + ' bought ' + p.name + '. +' + U.fmt(share) + ' ForgeCoins pending.', icon: 'ticket', route: '#/create/' + ug.id });
          }
        }
      }
      if (touched) BF.store.touch('created');
    },
  });
})((window.BF = window.BF || {}));
