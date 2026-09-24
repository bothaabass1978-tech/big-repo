/**
 * BlockForge — deterministic bot population and the local dialogue engine.
 * Bots are regenerated from the account's world seed on every load; only their
 * progress deltas (levels, wins) persist in state.bots.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const POPULATION = 640;

  const PERSONALITY_WEIGHTS = [[20, 'competitive'], [22, 'friendly'], [16, 'explorer'], [14, 'collector'], [12, 'chaotic'], [16, 'beginner']];

  const GAME_TASTE = {
    competitive: ['block-battlegrounds', 'elemental-clash', 'skyline-racers', 'battle-boats', 'speed-trials', 'pixel-soccer'],
    friendly: ['city-life', 'pet-world', 'pixel-soccer', 'treasure-islands', 'factory-tycoon'],
    explorer: ['treasure-islands', 'dungeon-frontier', 'mystery-mansion', 'sky-obby', 'mega-miners'],
    collector: ['pet-world', 'pet-battle-arena', 'mega-miners', 'treasure-tycoon', 'factory-tycoon'],
    chaotic: ['zombie-outbreak', 'block-battlegrounds', 'cosmic-survival', 'sky-obby', 'battle-boats'],
    beginner: ['sky-obby', 'pet-world', 'city-life', 'towerfall-legends', 'castle-siege'],
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
        followers: Math.floor(Math.pow(r(), 3) * 900 + level * 2),
        following: Math.floor(r() * 120 + 5),
        friends: Math.floor(5 + r() * 60),
        created: r() < 0.12 ? 1 + Math.floor(r() * 3) : 0,
      },
    };
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

  const RX = {
    greet: /\b(hi+|hello|hey+|yo|sup|hiya|howdy|heya)\b/i,
    gg: /\bgg+\b/i,
    laugh: /\b(lol+|lmao|haha+|xd|rofl)\b/i,
    thanks: /\b(thanks|thank you|thx|ty)\b/i,
    bye: /\b(bye+|cya|gtg|later|goodnight)\b/i,
    friend: /\b(friend|friends|add me|friend me)\b/i,
    challenge: /\b(1v1|race|fight|duel|battle|versus|vs|compete)\b/i,
    help: /\b(help|how do|how to|stuck|lost)\b/i,
    nice: /\b(nice|cool|wow|awesome|great|gj|good job|amazing|sick)\b/i,
    question: /\?\s*$/,
  };

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
      return style(bot, fill(U.pick(pool), { game }));
    },

    /**
     * Decide whether (and how) a bot answers a player chat message.
     * @returns {string|null}
     */
    respond(bot, text, game, opts) {
      const mentioned = opts && opts.mentioned;
      const t = String(text);
      let cat = null;
      if (RX.friend.test(t)) cat = 'friend';
      else if (RX.challenge.test(t)) cat = 'challenge';
      else if (RX.help.test(t)) cat = 'help';
      else if (RX.greet.test(t)) cat = 'greet';
      else if (RX.gg.test(t)) cat = 'gg';
      else if (RX.thanks.test(t)) cat = 'thanks';
      else if (RX.bye.test(t)) cat = 'bye';
      else if (RX.laugh.test(t)) cat = 'laugh';
      else if (RX.nice.test(t)) cat = 'nice';
      else if (RX.question.test(t)) cat = 'question';
      const chance = mentioned ? 0.95 : cat ? 0.45 : 0.18;
      if (Math.random() > chance * BF.PERSONALITIES[bot.personality].chatty) return null;
      let pool;
      if (cat && BF.DIALOGUE[cat] && BF.DIALOGUE[cat][bot.personality]) pool = BF.DIALOGUE[cat][bot.personality];
      else if (cat && BF.DIALOGUE.reply[cat]) pool = BF.DIALOGUE.reply[cat];
      else if (game && game.chat && game.chat.any && Math.random() < 0.4) pool = game.chat.any;
      else pool = BF.DIALOGUE.reply.default;
      return style(bot, fill(U.pick(pool), { game }));
    },

    /** Opening line for an unsolicited private message. */
    dmOpen(bot) {
      const favorite = BF.GAME_REGISTRY.find((g) => g.id === bot.favoriteGames[0]);
      const invite = Math.random() < 0.35 && favorite;
      if (invite) return { text: style(bot, fill(U.pick(BF.DIALOGUE.invite), { game: favorite })), invite: favorite.id };
      return { text: style(bot, fill(U.pick(BF.DIALOGUE.dmOpen[bot.personality]), { game: favorite })) };
    },

    /** Reply to a private message. */
    dmReply(bot, text) {
      const t = String(text);
      if (RX.greet.test(t)) return style(bot, U.pick(BF.DIALOGUE.greet[bot.personality]));
      if (RX.friend.test(t)) return style(bot, U.pick(BF.DIALOGUE.friend[bot.personality]));
      if (RX.challenge.test(t)) return style(bot, U.pick(BF.DIALOGUE.challenge[bot.personality]));
      if (RX.help.test(t)) return style(bot, U.pick(BF.DIALOGUE.help[bot.personality]));
      if (RX.thanks.test(t)) return style(bot, U.pick(BF.DIALOGUE.reply.thanks));
      if (RX.bye.test(t)) return style(bot, U.pick(BF.DIALOGUE.reply.bye));
      if (RX.gg.test(t)) return style(bot, U.pick(BF.DIALOGUE.reply.gg));
      if (RX.question.test(t)) return style(bot, U.pick(BF.DIALOGUE.reply.question));
      return style(bot, fill(U.pick(BF.DIALOGUE.dmReply[bot.personality])));
    },

    styleFor: style,
  };
})((window.BF = window.BF || {}));
