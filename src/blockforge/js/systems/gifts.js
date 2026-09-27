/**
 * BlockForge — ForgeCoin gifts between the player and other players (bots).
 *
 * You can gift any player you have not blocked. Bots answer like people:
 * they thank you, sometimes send some back, and friends (or followers, if
 * you allow it) gift you now and then: for a level-up, to return a favour,
 * or because they liked your game. You can also just ask a friend in chat.
 *
 * Gifts from bots are capped per day (T.bot) so gifting is a social feature,
 * never a coin fountain. Everything is fictional and local (ADR-0004).
 * Story: BLOCKFORGE-016
 */
(function (BF) {
  'use strict';

  const U = BF.util;

  /** Tuning. Amounts are ForgeCoins, times are minutes unless noted. */
  const T = {
    min: 10,
    maxPerGift: 10000000,
    noteMax: 100,
    confirmAt: 5000,
    history: 80,
    bot: {
      dailyCap: 5000, // most ForgeCoins bots can gift you in one day, all reasons together
      perDay: 5, // most gifts from bots in one day
      firstGap: [6, 15], // first unprompted gift after loading
      gap: [35, 120], // then between unprompted gifts
      askCooldownH: 20, // a bot considers a request from you once per this many hours
      giftBackChance: 0.3,
      giftBackShare: [0.1, 0.4],
      levelChance: 0.3,
    },
  };

  const NOTES = {
    random: ['had extra coins, here u go', 'random gift bc ur cool', 'saw u online, have some coins', 'dont spend it all in one place', 'for the next shop drop', 'felt generous today lol', 'treat yourself'],
    reciprocal: ['paying u back for earlier :)', 'u gifted me before so here', 'returning the favor', 'owed u one'],
    level: ['gg on level {lvl}!!', 'congrats on level {lvl}', 'level {lvl} already?? here'],
    game: ['played {game}, its actually good. tip for u', 'ur game {game} is fun, have a tip', 'tip for making {game}, keep updating it'],
    fan: ['big fan of ur stuff, have a tip', 'u seem cool, have some coins', 'tip from a random fan lol'],
    giftback: ['omg thank u, here have some back', 'sending some back bc ur nice', 'cant let u out-gift me, here'],
    asked: ['here u go', 'fine fine here', 'ok here, dont tell everyone lol', 'sent it'],
  };

  const THANKS = {
    tiny: ['thanks lol', 'aw ty', 'haha ty, every coin counts', 'thank u :)'],
    normal: ['omg thank u!!', 'wait thats so nice, thank u', 'yooo thanks', 'ty ty ty', 'aww u didnt have to, thank u'],
    big: ['WAIT what. thank u so much', 'no way, thats so many coins. thank u!!', 'ur actually the best, thank u', 'omg im gonna buy something cool with this, thanks'],
    huge: ['im literally speechless. thank u', 'did u mean to send that much?? thank u so much', 'this is insane, thank u. i owe u forever'],
  };
  const THANK_EXTRA = {
    competitive: ['gonna spend it on something to beat u with lol'],
    collector: ['this is going straight into my limiteds fund'],
    beginner: ['this is the most coins ive ever had'],
    chaotic: ['im spending all of it on eggs brb'],
    builder: ['gonna put this towards my game'],
    helper: ['ill pay it forward to a new player :)'],
    friendly: ['ur so sweet'],
  };

  function st() { return BF.store.state && BF.store.state.gifts; }
  function name(bot) { return bot.displayName; }
  function between(r, a, b) { return a + (b - a) * r; }

  function resetDay(s) {
    const today = BF.clock.today();
    if (s.gifts.day !== today) { s.gifts.day = today; s.gifts.inToday = 0; s.gifts.countToday = 0; }
  }

  function log(s, entry) {
    const g = s.gifts;
    g.log.push(entry);
    if (g.log.length > T.history) g.log.splice(0, g.log.length - T.history);
    const b = g.byBot[entry.botId] || (g.byBot[entry.botId] = { out: 0, in: 0, n: 0 });
    b[entry.dir] += entry.amount;
    b.n += 1;
    const bs = s.bots[entry.botId] || (s.bots[entry.botId] = {});
    bs.coins = (bs.coins || 0) + (entry.dir === 'out' ? entry.amount : -entry.amount);
  }

  /** A gift card message in the DM thread with that player. */
  function postCard(s, botId, from, text, gift) {
    const c = s.messages[botId] || (s.messages[botId] = { with: botId, msgs: [], updated: 0 });
    c.msgs.push({ id: U.uid('m'), from, text, ts: BF.clock.now(), read: from === 'me' || (BF.ui && BF.ui.currentConversation === botId), gift });
    if (c.msgs.length > 200) c.msgs.splice(0, c.msgs.length - 200);
    c.updated = BF.clock.now();
  }

  /** Send bot chat bubbles one after another with typing in between. */
  function say(bot, lines, startDelay) {
    const account = BF.store.accountId;
    const alive = () => BF.store.state && BF.store.accountId === account && !BF.friends.isBlocked(bot.id);
    const parts = [];
    for (const l of lines) parts.push(...(BF.voice ? BF.voice.parts(bot, l) : [l]));
    let at = startDelay;
    parts.forEach((p) => {
      at += 500 + Math.min(2200, p.length * 40) + Math.random() * 500;
      setTimeout(() => { if (alive()) BF.messages.receive(bot.id, p, { quietIfOpen: true }); }, at);
    });
    return at;
  }

  const gifts = (BF.gifts = {
    T,

    /** Recent gifts, newest first. */
    recent(n) {
      const s = st();
      return s ? s.log.slice(-(n || 20)).reverse() : [];
    },

    /** Totals with one player: {out, in, n}. */
    withBot(id) {
      const s = st();
      return (s && s.byBot[id]) || { out: 0, in: 0, n: 0 };
    },

    /** Totals across everyone. */
    summary() {
      const s = st();
      const out = { sent: 0, received: 0, sentCount: 0, receivedCount: 0, top: [] };
      if (!s) return out;
      for (const id in s.byBot) {
        const b = s.byBot[id];
        out.sent += b.out;
        out.received += b.in;
      }
      for (const e of s.log) { if (e.dir === 'out') out.sentCount++; else out.receivedCount++; }
      out.top = Object.keys(s.byBot).map((id) => ({ id, bot: BF.bots.get(id), out: s.byBot[id].out, in: s.byBot[id].in })).filter((x) => x.bot).sort((a, b) => (b.out + b.in) - (a.out + a.in)).slice(0, 5);
      return out;
    },

    /** How many more ForgeCoins bots can gift you today. */
    remainingToday() {
      const s = st();
      if (!s) return 0;
      return s.day === BF.clock.today() ? Math.max(0, T.bot.dailyCap - s.inToday) : T.bot.dailyCap;
    },

    /** Does the player's privacy setting let this bot gift them? */
    allows(bot) {
      const s = BF.store.state;
      if (!s || !bot || BF.friends.isBlocked(bot.id)) return false;
      const mode = s.settings.privacy.gifts || 'friends';
      if (mode === 'none') return false;
      if (BF.friends.isFriend(bot.id)) return true;
      return mode === 'everyone';
    },

    /** Check a gift before sending it. */
    validate(botId, amount) {
      const bot = BF.bots.get(botId);
      amount = Math.floor(Number(amount));
      if (!bot) return { ok: false, error: 'Player not found.' };
      if (BF.friends.isBlocked(botId)) return { ok: false, error: 'Unblock ' + bot.displayName + ' to send a gift.' };
      if (!(amount >= T.min)) return { ok: false, error: 'Gifts start at ' + T.min + ' ForgeCoins.' };
      if (amount > T.maxPerGift) return { ok: false, error: 'One gift can be up to ' + U.fmt(T.maxPerGift) + ' ForgeCoins.' };
      if (!BF.economy.canAfford(amount)) return { ok: false, error: 'Not enough ForgeCoins.', need: amount - BF.economy.balance() };
      return { ok: true, bot, amount };
    },

    /**
     * Gift ForgeCoins to a player. They thank you in DMs and may gift some back.
     * @param {string} botId
     * @param {number} amount
     * @param {string} [note] up to T.noteMax characters, chat-filtered
     * @returns {{ok:boolean, error?:string, gift?:object}}
     */
    send(botId, amount, note) {
      const v = gifts.validate(botId, amount);
      if (!v.ok) return v;
      const bot = v.bot;
      amount = v.amount;
      note = BF.dialogue.filter(String(note || '').trim().slice(0, T.noteMax));
      const paid = BF.economy.spend(amount, 'Gift to ' + name(bot), 'gift');
      if (!paid.ok) return { ok: false, error: 'Not enough ForgeCoins.' };
      const gift = { id: U.uid('gift'), dir: 'out', botId, amount, note, ts: BF.clock.now(), reason: 'you' };
      BF.store.update(['gifts', 'messages', 'bots', 'player'], (s) => {
        resetDay(s);
        log(s, gift);
        postCard(s, botId, 'me', note, { amount, dir: 'out' });
        s.player.stats.giftsSent = (s.player.stats.giftsSent || 0) + 1;
      });
      BF.bus.emit('gifts:sent', { gift, bot });
      gifts.react(bot, gift);
      return { ok: true, gift };
    },

    /** How a bot reacts to your gift: thanks, a follow or request, maybe some back. */
    react(bot, gift) {
      const amt = gift.amount;
      const size = amt < 50 ? 'tiny' : amt < 1000 ? 'normal' : amt < 100000 ? 'big' : 'huge';
      const lines = [U.pick(THANKS[size])];
      if (size !== 'tiny' && THANK_EXTRA[bot.personality] && Math.random() < 0.45) lines.push(U.pick(THANK_EXTRA[bot.personality]));
      const done = say(bot, lines, 900 + Math.random() * 1600);
      const F = BF.friends;
      setTimeout(() => {
        if (!BF.store.state) return;
        if (!F.followsYou(bot.id) && Math.random() < (size === 'tiny' ? 0.2 : 0.55)) {
          BF.store.update('social', (s) => { if (!s.social.followers.includes(bot.id)) s.social.followers.push(bot.id); });
        }
        if (!F.isFriend(bot.id) && !F.hasIncoming(bot.id) && !F.hasOutgoing(bot.id) && Math.random() < (size === 'tiny' ? 0.15 : 0.45)) F.receiveRequest(bot.id);
      }, done + 800);
      if (amt >= 50 && Math.random() < T.bot.giftBackChance) {
        const share = between(Math.random(), T.bot.giftBackShare[0], T.bot.giftBackShare[1]);
        const back = Math.max(T.min, Math.round(amt * share / 5) * 5);
        setTimeout(() => { if (BF.store.state) gifts.receive(bot, back, U.pick(NOTES.giftback), 'giftback'); }, done + 20000 + Math.random() * 70000);
      }
    },

    /**
     * A bot gifts the player. Respects privacy and the daily limits unless
     * `opts.force` (tests, developer tools). Returns the gift or null.
     */
    receive(bot, amount, note, reason, opts) {
      opts = opts || {};
      const s = BF.store.state;
      if (!s || !bot) return null;
      if (!opts.force && !gifts.allows(bot)) return null;
      BF.store.update('gifts', (st2) => resetDay(st2));
      amount = Math.floor(amount);
      if (!opts.force) {
        if (s.gifts.countToday >= T.bot.perDay) return null;
        amount = Math.min(amount, gifts.remainingToday());
      }
      if (!(amount >= T.min)) return null;
      const text = note ? (BF.voice ? BF.voice.say(bot, note) : note) : '';
      const gift = { id: U.uid('gift'), dir: 'in', botId: bot.id, amount, note: text, ts: BF.clock.now(), reason: reason || 'random' };
      BF.economy.earn(amount, 'Gift from ' + name(bot), 'gift');
      BF.store.update(['gifts', 'messages', 'bots'], (st2) => {
        log(st2, gift);
        st2.gifts.inToday += amount;
        st2.gifts.countToday += 1;
        postCard(st2, bot.id, 'them', text, { amount, dir: 'in' });
      });
      if (!(BF.ui && BF.ui.currentConversation === bot.id)) {
        BF.notify.push({ type: 'gift', title: bot.displayName + ' sent you ' + U.fmt(amount) + ' ForgeCoins', body: text || 'A gift from @' + bot.username + '.', icon: 'gift', route: '#/messages/' + bot.id });
      }
      BF.bus.emit('gifts:received', { gift, bot });
      if (BF.sfx) BF.sfx.play('coin');
      return gift;
    },

    /** How much a bot would gift: small for most, more from the rich. */
    amountFor(bot, rnd) {
      rnd = rnd || Math.random;
      const worth = BF.bots.stats(bot).coins;
      let a = U.pick([25, 30, 40, 50, 50, 75, 100, 100, 150, 200, 250], rnd);
      if (worth > 1e5 && rnd() < 0.5) a = U.pick([250, 300, 500, 750], rnd);
      if (worth > 1e8 && rnd() < 0.4) a = U.pick([1000, 1500, 2000, 2500], rnd);
      if (bot.personality === 'beginner') a = Math.min(a, 60);
      return a;
    },

    /**
     * You asked this bot for coins in chat. Friends sometimes say yes, once
     * per T.bot.askCooldownH hours. Returns {yes, amount?, why} for the chat
     * engine; the gift itself is sent by `give(bot, amount)`.
     */
    consider(bot) {
      const s = BF.store.state;
      const now = BF.clock.now();
      const last = s.gifts.asked[bot.id] || 0;
      BF.store.update('gifts', (st2) => {
        st2.gifts.asked[bot.id] = now;
        const ids = Object.keys(st2.gifts.asked);
        if (ids.length > 60) for (const id of ids.sort((a, b) => st2.gifts.asked[a] - st2.gifts.asked[b]).slice(0, ids.length - 60)) delete st2.gifts.asked[id];
      });
      if (!BF.friends.isFriend(bot.id)) return { yes: false, why: 'stranger' };
      if (now - last < T.bot.askCooldownH * 3600000) return { yes: false, why: 'again' };
      if ((s.settings.privacy.gifts || 'friends') === 'none') return { yes: false, why: 'blocked' };
      if (gifts.remainingToday() < T.min || (s.gifts.day === BF.clock.today() && s.gifts.countToday >= T.bot.perDay)) return { yes: false, why: 'cap' };
      const base = { friendly: 0.5, helper: 0.55, chaotic: 0.4, explorer: 0.35, builder: 0.35, roleplayer: 0.35, speedrunner: 0.3, competitive: 0.25, collector: 0.2, beginner: 0.25 }[bot.personality] || 0.3;
      const kind = gifts.withBot(bot.id).out > 0 ? 0.3 : 0;
      if (Math.random() >= base + kind) return { yes: false, why: bot.personality === 'beginner' ? 'broke' : 'no' };
      return { yes: true, amount: Math.min(gifts.amountFor(bot), gifts.remainingToday()) };
    },

    /** A bot sends the gift it agreed to in chat. */
    give(bot, amount) {
      return gifts.receive(bot, amount, U.pick(NOTES.asked), 'asked');
    },

    /** Who might gift you right now, weighted by how close you are. */
    candidates() {
      const s = BF.store.state;
      const mode = s.settings.privacy.gifts || 'friends';
      if (mode === 'none') return [];
      const ids = new Set(s.social.friends);
      if (mode === 'everyone') for (const id of s.social.followers.slice(-300)) ids.add(id);
      const mem = s.chatmem || {};
      const out = [];
      for (const id of ids) {
        const bot = BF.bots.get(id);
        if (!bot || BF.friends.isBlocked(id) || BF.world.botStatus(id).state === 'offline') continue;
        const g = gifts.withBot(id);
        const w = 1 + (mem[id] ? Math.min(6, mem[id].talks / 4) : 0) + (g.out > g.in ? 3 : 0) + (BF.friends.isFriend(id) ? 1 : 0);
        out.push({ bot, w, owes: g.out > g.in });
      }
      return out;
    },

    /** Pick a reason and a note for an unprompted gift. */
    occasion(bot, owes) {
      const s = BF.store.state;
      const mine = (s.created || []).filter((g) => g.published);
      if (owes && Math.random() < 0.6) return { reason: 'reciprocal', note: U.pick(NOTES.reciprocal) };
      if (mine.length && Math.random() < 0.35) return { reason: 'game', note: U.pick(NOTES.game).replace('{game}', U.pick(mine).name) };
      if (!BF.friends.isFriend(bot.id)) return { reason: 'fan', note: U.pick(NOTES.fan) };
      return { reason: 'random', note: U.pick(NOTES.random) };
    },

    /** World tick (every few seconds): now and then someone gifts you. */
    tick(now) {
      const s = BF.store.state;
      if (!s) return null;
      now = now || BF.clock.now();
      const minutes = (r) => between(Math.random(), r[0], r[1]) * 60000;
      if (!s.gifts.nextAt) { BF.store.update('gifts', (st2) => { st2.gifts.nextAt = now + minutes(T.bot.firstGap); }); return null; }
      if (now < s.gifts.nextAt) return null;
      BF.store.update('gifts', (st2) => { st2.gifts.nextAt = now + minutes(T.bot.gap); });
      const cand = gifts.candidates();
      if (!cand.length) return null;
      let r = Math.random() * cand.reduce((a, c) => a + c.w, 0);
      const pick = cand.find((c) => (r -= c.w) <= 0) || cand[0];
      const o = gifts.occasion(pick.bot, pick.owes);
      return gifts.receive(pick.bot, gifts.amountFor(pick.bot), o.note, o.reason);
    },

    /** A friend may congratulate your level-up with a gift. */
    onLevel(level) {
      const s = BF.store.state;
      if (!s || Math.random() >= T.bot.levelChance) return null;
      const cand = gifts.candidates().filter((c) => BF.friends.isFriend(c.bot.id));
      if (!cand.length) return null;
      const bot = U.pick(cand).bot;
      return gifts.receive(bot, gifts.amountFor(bot), U.pick(NOTES.level).replace('{lvl}', level), 'level');
    },
  });

  BF.bus.on('levelup', (e) => {
    if (!e || e.silent || !BF.store.state) return;
    setTimeout(() => gifts.onLevel(e.level), 4000 + Math.random() * 20000);
  });
})((window.BF = window.BF || {}));
