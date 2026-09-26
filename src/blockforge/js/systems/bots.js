/**
 * BlockForge — deterministic bot population and the local dialogue engine.
 * Bots are regenerated from the account's world seed on every load; only their
 * progress deltas (levels, wins) persist in state.bots.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const POPULATION = 2000;

  const PERSONALITY_WEIGHTS = [[18, 'competitive'], [20, 'friendly'], [14, 'explorer'], [12, 'collector'], [11, 'chaotic'], [15, 'beginner'], [9, 'builder'], [7, 'speedrunner'], [8, 'roleplayer'], [7, 'helper']];

  const GAME_TASTE = {
    competitive: ['block-battlegrounds', 'elemental-clash', 'skyline-racers', 'battle-boats', 'speed-trials', 'pixel-soccer'],
    friendly: ['city-life', 'pet-world', 'pixel-soccer', 'treasure-islands', 'factory-tycoon'],
    explorer: ['treasure-islands', 'dungeon-frontier', 'mystery-mansion', 'sky-obby', 'mega-miners'],
    collector: ['pet-world', 'pet-battle-arena', 'mega-miners', 'treasure-tycoon', 'factory-tycoon'],
    chaotic: ['zombie-outbreak', 'block-battlegrounds', 'cosmic-survival', 'sky-obby', 'battle-boats'],
    beginner: ['sky-obby', 'pet-world', 'city-life', 'towerfall-legends', 'castle-siege'],
    builder: ['factory-tycoon', 'treasure-tycoon', 'castle-siege', 'towerfall-legends', 'mega-miners'],
    speedrunner: ['sky-obby', 'speed-trials', 'skyline-racers', 'mega-miners'],
    roleplayer: ['city-life', 'mystery-mansion', 'dungeon-frontier', 'treasure-islands', 'pet-world'],
    helper: ['pet-world', 'city-life', 'towerfall-legends', 'treasure-islands', 'sky-obby'],
  };

  const OPTIONAL_SLOTS = { jacket: 0.3, hat: 0.6, back: 0.3, neck: 0.3, shoulder: 0.22, accessory: 0.35 };

  function rarityWeights(level) {
    const boost = 1 + level / 35;
    return { common: 50, uncommon: 26, rare: 13 * boost, epic: 6 * boost, legendary: 2.5 * boost, mythic: 0.6 * boost };
  }

  const byCat = {};
  function itemsIn(cat) {
    if (!byCat[cat]) byCat[cat] = BF.ITEM_LIST.filter((i) => i.cat === cat);
    return byCat[cat];
  }

  function pickItem(cat, r, level) {
    const w = rarityWeights(level);
    return U.weighted(itemsIn(cat).map((it) => [w[it.rarity] || 1, it.id]), r);
  }

  /** Generate an avatar config for a bot. */
  function makeAvatar(id, level) {
    const r = U.rng('av:' + id);
    const human = BF.SKIN_TONES.slice(0, 7);
    const skin = r() < 0.78 ? U.pick(human, r) : U.pick(BF.SKIN_TONES, r);
    const eq = {};
    for (const slot of BF.AVATAR_SLOTS) {
      if (slot === 'animation') { eq.animation = r() < 0.7 ? 'anim_default' : pickItem('animation', r, level); continue; }
      if (slot === 'emote') { eq.emote = pickItem('emote', r, level); continue; }
      const p = OPTIONAL_SLOTS[slot];
      if (p != null && r() > p) { eq[slot] = null; continue; }
      eq[slot] = pickItem(slot, r, level);
    }
    if (r() < 0.12) eq.hair = null;
    return { skin, equipped: eq };
  }

  function makeBot(username, displayName, personality, level, handcrafted, r) {
    const pers = BF.PERSONALITIES[personality];
    const id = 'bot_' + username.toLowerCase();
    const skill = U.clamp(U.lerp(pers.skill[0], pers.skill[1], r()) + level / 400, 0.05, 0.98);
    const taste = GAME_TASTE[personality];
    const favs = U.shuffle(taste, r).slice(0, 2);
    const extra = U.pick(BF.GAME_REGISTRY, r).id;
    if (!favs.includes(extra)) favs.push(extra);
    const joinDaysAgo = Math.floor(30 + r() * 1500 * Math.min(1, level / 40 + 0.2));
    const bioT = U.pick(BF.BOT_BIOS[personality], r);
    const game = BF.GAME_REGISTRY.find((g) => g.id === favs[0]);
    return {
      id,
      username,
      displayName,
      personality,
      level,
      skill,
      handcrafted: !!handcrafted,
      joinDate: Date.UTC(2026, 8, 24) - joinDaysAgo * 86400000,
      favoriteGames: favs,
      bio: bioT.replace('{game}', game ? game.name : 'BlockForge').replace('{n}', String(10 + Math.floor(r() * 90))),
      avatar: makeAvatar(id, level),
      base: {
        wins: Math.floor(level * (4 + r() * 10) * (0.4 + skill)),
        gamesPlayed: Math.floor(level * (12 + r() * 20)),
        coins: Math.floor(200 + level * level * (3 + r() * 9) + r() * 2000),
        achievements: Math.min(BF.ACHIEVEMENTS.length - 1, Math.floor(level / 4 + r() * 6)),
        // a platform this size has stars: about 1 in 60 players has tens of thousands to millions of followers
        followers: Math.floor(Math.pow(r(), 3) * 900 + level * 2) * starPower(id, level),
        following: Math.floor(r() * 120 + 5),
        friends: Math.floor(5 + r() * 60),
        created: r() < 0.12 ? 1 + Math.floor(r() * 3) : 0,
      },
    };
  }

  /** Follower multiplier from a stable hash of the id (keeps the seeded population unchanged). */
  function starPower(id, level) {
    const h = U.hash(id + ':star') % 1000;
    if (h < 3) return 800 + (h * 397) % 2400;
    if (h < 16) return 60 + (h * 131) % 300;
    if (h < 60) return 8 + (h * 17) % 30;
    return 1 + Math.floor(level / 40);
  }

  const bots = (BF.bots = {
    list: [],
    map: new Map(),

    /** Deterministically generate the full population for a world seed. */
    generate(seed) {
      const r = U.rng('bots:' + seed);
      const out = [];
      const used = new Set();
      for (const [u, d, p, lvl] of BF.BOT_SEEDS) {
        used.add(u.toLowerCase());
        out.push(makeBot(u, d, p, lvl, true, U.rng('hand:' + u)));
      }
      let guard = 0;
      while (out.length < POPULATION && guard++ < 20000) {
        const pre = U.pick(BF.BOT_PREFIXES, r);
        const suf = U.pick(BF.BOT_SUFFIXES, r);
        if (pre === suf) continue;
        const style = r();
        let u;
        if (style < 0.55) u = pre + suf;
        else if (style < 0.75) u = pre + suf + U.randInt(2, 99, r);
        else if (style < 0.85) u = (pre + '_' + suf).toLowerCase();
        else if (style < 0.93) u = pre + suf + U.randInt(100, 999, r);
        else u = 'The' + pre + suf;
        if (u.length > 20 || used.has(u.toLowerCase())) continue;
        used.add(u.toLowerCase());
        const personality = U.weighted(PERSONALITY_WEIGHTS, r);
        const level = personality === 'beginner' ? U.randInt(1, 12, r) : Math.floor(3 + Math.pow(r(), 1.7) * 115);
        out.push(makeBot(u, pre + ' ' + suf, personality, level, false, r));
      }
      return out;
    },

    /** Install a population (called by BF.world.init). */
    install(list) {
      bots.list = list;
      bots.map = new Map(list.map((b) => [b.id, b]));
    },

    get(id) {
      return bots.map.get(id) || null;
    },

    /** Current level including persisted progress. */
    level(bot) {
      const s = BF.store.state && BF.store.state.bots[bot.id];
      return bot.level + ((s && s.lvl) || 0);
    },

    /** Aggregate stats including persisted progress. */
    stats(bot) {
      const s = (BF.store.state && BF.store.state.bots[bot.id]) || {};
      return {
        level: bot.level + (s.lvl || 0),
        wins: bot.base.wins + (s.wins || 0),
        gamesPlayed: bot.base.gamesPlayed + (s.played || 0),
        coins: bot.base.coins + (s.coins || 0),
        achievements: bot.base.achievements,
        followers: bot.base.followers,
        following: bot.base.following,
        friends: bot.base.friends,
      };
    },

    /** Record simulated bot progress (persisted sparsely). */
    progress(botId, delta) {
      BF.store.update('bots', (s) => {
        const b = s.bots[botId] || (s.bots[botId] = {});
        for (const k of Object.keys(delta)) b[k] = (b[k] || 0) + delta[k];
      });
    },

    search(q, limit) {
      q = q.toLowerCase();
      const out = [];
      for (const b of bots.list) {
        if (b.username.toLowerCase().includes(q) || b.displayName.toLowerCase().includes(q)) {
          out.push(b);
          if (out.length >= (limit || 20)) break;
        }
      }
      return out;
    },
  });

  // ---------------------------------------------------------------- dialogue

  const FILTER = /\b(idiot|stupid|dumb|loser|shut ?up|trash)\b/gi;

  function style(bot, text) {
    const p = bot.personality;
    if (p === 'chaotic' && Math.random() < 0.35) text = text.toUpperCase();
    if (p === 'chaotic' && Math.random() < 0.25) text += U.pick([' lol', '!!!', ' xD', ' :P']);
    if (p === 'beginner') text = text.toLowerCase().replace(/[.!]+$/, '');
    if (p === 'friendly' && Math.random() < 0.2 && !/[:)!]$/.test(text)) text += ' :)';
    return text;
  }

  function fill(text, ctx) {
    ctx = ctx || {};
    return text
      .replace(/\{game\}/g, ctx.game ? ctx.game.name : U.pick(BF.GAME_REGISTRY).name)
      .replace(/\{name\}/g, ctx.name || 'friend')
      .replace(/\{item\}/g, ctx.item || U.pick(BF.ITEM_LIST.filter((i) => i.price > 500 && i.cat !== 'collectible')).name);
  }

  const lastSaid = new Map();

  BF.dialogue = {
    /** Chat filter used on player text and bot text. */
    filter(text) {
      const s = BF.store.state;
      if (s && s.settings.gameplay.chatFilter === false) return text;
      return String(text).replace(FILTER, (m) => '#'.repeat(m.length));
    },

    /**
     * A context-appropriate chat line for a bot.
     * @param {object} bot
     * @param {string} kind idle|join|leave|greet|start|win|lose|kill|...
     * @param {object} [game] game meta (uses its chat table)
     */
    line(bot, kind, game) {
      const gameLines = game && game.chat ? game.chat[kind] || (kind === 'idle' ? game.chat.any : null) : null;
      const persLines = (BF.DIALOGUE[kind] && BF.DIALOGUE[kind][bot.personality]) || null;
      let pool;
      if (gameLines && persLines) pool = Math.random() < 0.62 ? gameLines : persLines;
      else pool = gameLines || persLines || BF.DIALOGUE.idle[bot.personality];
      // avoid saying the same thing twice in a row
      let raw = U.pick(pool);
      if (pool.length > 1 && raw === lastSaid.get(bot.id)) raw = U.pick(pool.filter((x) => x !== raw));
      lastSaid.set(bot.id, raw);
      return style(bot, fill(raw, { game }));
    },

    /**
     * Synchronous reply for a player chat message in a game (null = stays quiet).
     * Kept for callers that cannot wait; the runtime uses BF.chat.reply().
     */
    respond(bot, text, game, opts) {
      const d = BF.chat.think(bot, text, { channel: 'game', game, mentioned: !!(opts && opts.mentioned) });
      return d ? d.text : null;
    },

    /** Opening line for an unsolicited private message. */
    dmOpen(bot) {
      const favorite = BF.GAME_REGISTRY.find((g) => g.id === bot.favoriteGames[0]);
      const invite = Math.random() < 0.35 && favorite;
      if (invite) return { text: style(bot, fill(U.pick(BF.DIALOGUE.invite), { game: favorite })), invite: favorite.id };
      return { text: style(bot, fill(U.pick(BF.DIALOGUE.dmOpen[bot.personality]), { game: favorite })) };
    },

    /** Synchronous reply to a private message (see BF.chat for the async path). */
    dmReply(bot, text) {
      const d = BF.chat.think(bot, text, { channel: 'dm' });
      return d ? d.text : style(bot, fill(U.pick(BF.DIALOGUE.dmReply[bot.personality] || BF.DIALOGUE.reply.default)));
    },

    styleFor: style,
  };
})((window.BF = window.BF || {}));
