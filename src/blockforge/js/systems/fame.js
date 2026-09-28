/**
 * BlockForge — fame: how well known you are, and what happens when you show up.
 *
 *   BF.fame.score()                 your fame points
 *   BF.fame.scoreOf(bot)            a bot's fame points
 *   BF.fame.me()                    {score, tier, rank, total, next, progress, level}
 *   BF.fame.board(n)                Most Famous leaderboard {rows, you, total}
 *   BF.fame.arrive(api)             celebrity reactions when you join a server
 *   BF.fame.fanLine(level, name)    a fan's chat line at a reaction level
 *
 * Fame = followers (named + fans) + 1.2 × players in your games right now
 * + 10 × level + wins / 2. Bots are scored the same way (their followers
 * already include the players of their studios and games). Tiers pay a
 * one-time ForgeCoin bonus. The #1 player is the Legend.
 *
 * When you join a server, players react by tier: someone notices you
 * (Popular), players freak out, follow you and ask for friends (Famous), the
 * whole server swarms you and fans pour in (Superstar), and pure frenzy for
 * the Legend. Fans also play your games. Everything is fictional and local.
 * Story: BLOCKFORGE-019
 */
(function (BF) {
  'use strict';

  const U = BF.util;

  /** Tuning (data). */
  const T = {
    tiers: [
      { id: 'newcomer', name: 'Newcomer', min: 0, reward: 0, color: '#9aa5b5', react: 0 },
      { id: 'rising', name: 'Rising Star', min: 1000, reward: 250, color: '#7fd4ff', react: 0 },
      { id: 'known', name: 'Known', min: 10000, reward: 1000, color: '#4ad17f', react: 0 },
      { id: 'popular', name: 'Popular', min: 50000, reward: 5000, color: '#ffd23f', react: 1 },
      { id: 'famous', name: 'Famous', min: 250000, reward: 25000, color: '#ff8a2e', react: 2 },
      { id: 'superstar', name: 'Superstar', min: 1000000, reward: 100000, color: '#ff4f9a', react: 3 },
    ],
    legend: { id: 'legend', name: 'Legend', reward: 250000, color: '#b67cff', react: 4 },
    playingWeight: 1.2,
    levelWeight: 10,
    winWeight: 0.5,
    knownNoticeChance: 0.25, // Known players are recognised now and then
    cacheMs: 60000, // bot fame moves slowly; scoring 2,000 bots is the expensive part
    fanPlayPerMin: 0.0004, // share of your followers who start a session of one of your games each minute
    swarmSec: [18, 30],
    rush: { 3: [3, 7], 4: [6, 12] }, // extra fans who join your server, by reaction level
    followShare: { 1: 0.1, 2: 0.45, 3: 0.8, 4: 0.95 },
    fansFromNews: { 2: [20, 120], 3: [150, 900], 4: [800, 4000] },
    // friend requests from players who know who you are, per minute, by tier (on top of the world's trickle)
    requestsPerMin: { newcomer: 0, rising: 0.15, known: 0.5, popular: 2, famous: 6, superstar: 16, legend: 40 },
    floodMergeMs: 60000, // arrivals within a minute update one notification
    floodPopupMs: 30000, // and it pops up at most this often
  };

  const LINES = {
    1: ['wait is that {name}??', 'hold on... {name}?', 'yo is that the real {name}', 'no way {name} plays this too', 'i think thats {name} lol'],
    2: ['OMG ITS {name}', '{name}!!! can u follow me pls', 'IM IN A SERVER WITH {name}', 'can i have ur autograph lol', 'ur games are so good {name}', 'bro {name} is actually here', 'SCREENSHOTTING THIS', '{name} notice me pls', 'wait wait wait its {name}'],
    3: ['EVERYONE {name} IS HERE', 'I CANT BREATHE ITS {name}', 'guys guys GUYS its {name}', 'follow me back {name} PLEASEEE', 'my friends are not gonna believe this', 'im literally shaking rn', '{name} can u sign my avatar', 'THE {name}???', 'OMGGGG', 'best day of my life fr'],
    4: ['THE MOST FAMOUS PLAYER ON BLOCKFORGE IS IN MY SERVER', 'ITS THE LEGEND {name}', 'history is being made rn', 'bow down {name} is here', 'I NEED TO TELL EVERYONE', '{name} i have been a fan since day one', 'WE ARE NOT WORTHY'],
    during: ['{name} can we be friends', 'can u play my game sometime', 'what are u working on next', 'ur my favorite creator', 'pls follow me i have like 3 followers lol', 'how did u get so famous', '{name} whats ur favorite game', 'can i join ur studio', 'i play ur games every day', 'rate my avatar {name}'],
    join: ['I HEARD {name} WAS HERE', 'is {name} still here??', 'my friend said {name} is in this server', 'omg its true', 'came as fast as i could'],
  };

  let botCache = null, botCacheAt = 0;
  let flood = null, lastFloodPopup = 0;

  function tierFor(score, rank) {
    if (rank === 1 && score >= T.tiers[T.tiers.length - 1].min) return T.legend;
    let t = T.tiers[0];
    for (const x of T.tiers) if (score >= x.min) t = x;
    return t;
  }

  /** Players in your published games right now. */
  function livePlayers() {
    const s = BF.store.state;
    if (!s || !BF.world) return 0;
    let n = 0;
    for (const g of s.created || []) if (g.published) n += BF.world.crowd(g.id);
    // studios you bought (BF.company) bring their players' attention with them
    if (BF.company) n += BF.company.playing();
    return n;
  }

  const fame = (BF.fame = {
    T,
    LINES,

    /** Your fame points. */
    score() {
      const s = BF.store.state;
      if (!s) return 0;
      const follow = BF.followers ? BF.followers.total() : s.social.followers.length;
      return Math.round(follow + livePlayers() * T.playingWeight + s.player.level * T.levelWeight + (s.player.stats.wins || 0) * T.winWeight);
    },

    /** A bot's fame points. */
    scoreOf(bot) {
      const st = BF.bots.stats(bot);
      return Math.round(st.followers + st.level * T.levelWeight + st.wins * T.winWeight);
    },

    /** Every bot's fame, highest first (cached for a few seconds). */
    bots() {
      const now = Date.now();
      if (botCache && now - botCacheAt < T.cacheMs) return botCache;
      botCache = BF.bots.list.map((b) => ({ bot: b, score: fame.scoreOf(b) })).sort((a, b) => b.score - a.score);
      botCacheAt = now;
      return botCache;
    },

    /** Your standing: {score, tier, rank, total, next, progress, level}. */
    me() {
      const score = fame.score();
      const list = fame.bots();
      let above = 0;
      for (const x of list) { if (x.score > score) above++; else break; }
      const rank = above + 1;
      const tier = tierFor(score, rank);
      const i = T.tiers.findIndex((x) => x.id === tier.id);
      const next = tier.id === 'legend' ? null : i < T.tiers.length - 1 ? T.tiers[i + 1] : { id: 'legend', name: 'Legend (#1)', min: list[0] ? list[0].score + 1 : score + 1 };
      const from = tier.min || 0;
      const progress = next ? U.clamp((score - from) / Math.max(1, next.min - from), 0, 1) : 1;
      return { score, tier, rank, total: list.length + 1, next, progress, level: tier.react };
    },

    /** Tier of a bot (for profiles). */
    tierOf(bot) {
      const list = fame.bots();
      const i = list.findIndex((x) => x.bot.id === bot.id);
      const score = i >= 0 ? list[i].score : fame.scoreOf(bot);
      const mine = fame.score();
      const rank = i + 1 + (mine > score ? 1 : 0);
      return tierFor(score, rank);
    },

    /** Most Famous leaderboard. */
    board(n) {
      const s = BF.store.state;
      const mine = fame.me();
      const rows = fame.bots().slice(0, (n || 50) + 1).map((x) => ({ id: x.bot.id, bot: x.bot, name: x.bot.displayName, username: x.bot.username, value: x.score }));
      const you = { id: 'me', me: true, name: s.player.displayName, username: s.player.username, value: mine.score, rank: mine.rank };
      rows.push(you);
      rows.sort((a, b) => b.value - a.value || (a.me ? -1 : 1));
      rows.forEach((r, i) => { if (!r.me) r.rank = i + 1; });
      return { rows: rows.slice(0, n || 50), you, total: mine.total };
    },

    /** A fan's line at a reaction level (1-4, 'during', 'join'). */
    fanLine(level, name) {
      return U.pick(LINES[level] || LINES[2]).replace(/\{name\}/g, name);
    },

    /** Reaction level for this session: 0 none ... 4 legend (Known players are noticed sometimes). */
    reaction(rng) {
      const m = fame.me();
      if (m.level > 0) return m.level;
      return m.tier.id === 'known' && (rng || Math.random)() < T.knownNoticeChance ? 1 : 0;
    },

    /**
     * Celebrity arrival. The runtime passes what it can do:
     * {bots, name, game, chat(bot, text, delayMs), feed(text), follow(bot, seconds),
     *  emote(bot, kind), rush(n), banner(title, desc)}.
     * Returns the reaction level.
     */
    arrive(api, rng) {
      rng = rng || Math.random;
      const level = fame.reaction(rng);
      if (!level || !api || !api.bots || !api.bots.length) return level;
      const bots = U.shuffle(api.bots.slice(), rng);
      const name = api.name;
      const talkers = level === 1 ? bots.slice(0, 1 + Math.floor(rng() * 2)) : bots.slice(0, Math.max(2, Math.ceil(bots.length * (level === 2 ? 0.6 : 1))));
      talkers.forEach((b, i) => {
        api.chat(b, fame.fanLine(Math.min(level, 4), name), 900 + i * (level >= 3 ? 450 : 900) + rng() * 900);
        if (level >= 3 && rng() < 0.5) api.chat(b, fame.fanLine(Math.min(level, 4), name), 4000 + i * 600 + rng() * 2000);
      });
      if (level >= 2) {
        const swarm = level === 2 ? bots.filter(() => rng() < 0.5) : bots;
        for (const b of swarm) {
          api.follow(b, T.swarmSec[0] + rng() * (T.swarmSec[1] - T.swarmSec[0]));
          api.emote(b, rng() < 0.5 ? 'cheer' : 'jacks');
        }
      }
      // some of them follow you on the spot, and word spreads
      const share = T.followShare[level] || 0;
      let followed = 0;
      for (const b of bots) if (rng() < share && BF.followers && BF.followers.gain(b.id, 'in ' + ((api.game && api.game.name) || 'a server'))) followed++;
      const news = T.fansFromNews[level];
      if (news && BF.followers) BF.followers.addFans(news[0] + Math.floor(rng() * (news[1] - news[0])));
      if (level >= 2) for (const b of bots.slice(0, level)) if (rng() < 0.4 && BF.friends) BF.friends.receiveRequest(b.id);
      const r = T.rush[level];
      if (r && api.rush) api.rush(r[0] + Math.floor(rng() * (r[1] - r[0] + 1)));
      if (level >= 2 && api.banner) {
        const t = fame.me().tier;
        api.banner(level >= 4 ? 'The whole server is losing it' : level === 3 ? 'You got mobbed!' : 'You have been recognised!', t.name + ' · ' + (followed ? followed + ' new follower' + (followed > 1 ? 's' : '') + ' here' : 'everyone is watching'));
      }
      if (api.feed) api.feed(level >= 3 ? 'Word is spreading: ' + name + ' is in server #' + ((api.server && api.server.num) || '?') + '!' : name + ' was recognised by the server.');
      return level;
    },

    /** Visits your fans bring to your games each tick (creator.simulate). */
    fanVisits(seconds) {
      const s = BF.store.state;
      if (!s || !BF.followers) return 0;
      const expected = BF.followers.total() * T.fanPlayPerMin * (seconds / 60);
      return Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
    },

    /** Pay tier bonuses once and announce new tiers (world tick). */
    check() {
      const s = BF.store.state;
      if (!s) return null;
      const m = fame.me();
      const order = T.tiers.concat([T.legend]);
      const reached = order.filter((t) => (t.id === 'legend' ? m.tier.id === 'legend' : m.score >= t.min && t.reward));
      let newest = null;
      for (const t of reached) {
        if (s.fame.paid.includes(t.id)) continue;
        BF.store.update('fame', (st) => { st.fame.paid.push(t.id); });
        if (t.reward) BF.economy.earn(t.reward, 'Fame: ' + t.name, 'fame');
        newest = t;
      }
      if (m.score > (s.fame.best || 0)) BF.store.update('fame', (st) => { st.fame.best = m.score; });
      if (newest && BF.notify) {
        const perks = { rising: 'People are starting to notice you.', known: 'Some players will recognise you in games.', popular: 'Players notice you when you join a server.', famous: 'Players freak out when you show up. You get a verified check.', superstar: 'Whole servers swarm you and fans pour in.', legend: 'You are the most famous player on BlockForge.' }[newest.id] || '';
        BF.notify.push({ type: 'reward', title: 'You are now ' + newest.name + '!', body: perks + (newest.reward ? ' +' + U.fmt(newest.reward) + ' ForgeCoins.' : ''), icon: 'star', route: '#/leaderboards/fame' });
        BF.bus.emit('fame:tier', { tier: newest });
      }
      return newest;
    },

    /** Verified check next to your name (Famous and up). */
    verified() {
      return fame.me().level >= 2;
    },

    /**
     * Friend requests from fans (world tick, every `seconds`). Famous players get a
     * steady stream and the Legend a flood; one grouped notification per tick.
     * Returns how many arrived.
     */
    requests(seconds, rng) {
      const s = BF.store.state;
      if (!s || !BF.friends || s.settings.privacy.friendRequests === 'none') return 0;
      rng = rng || Math.random;
      const rate = T.requestsPerMin[fame.me().tier.id] || 0;
      const expected = rate * (seconds / 60);
      let n = Math.floor(expected) + (rng() < expected % 1 ? 1 : 0);
      if (!n) return 0;
      const F = BF.friends;
      const pool = BF.bots.list;
      const got = [];
      for (let tries = 0; got.length < n && tries < n * 6; tries++) {
        const b = pool[Math.floor(rng() * pool.length)];
        if (b && !got.includes(b) && F.receiveRequest(b.id, { quiet: true })) got.push(b);
      }
      if (got.length && BF.notify) fame.floodNotice(got);
      return got.length;
    },

    /**
     * One rolling notification for a request flood: new arrivals within a minute
     * update the same entry, and it pops up at most every 30 seconds.
     */
    floodNotice(got) {
      const s = BF.store.state;
      const now = BF.clock.now();
      const pending = s.social.incoming.length;
      const note = flood && now - flood.at < T.floodMergeMs ? s.notifications.find((n) => n.id === flood.id && !n.read) : null;
      const count = (note ? flood.count : 0) + got.length;
      const names = got.slice(0, 2).map((b) => b.displayName).join(', ');
      const title = count === 1 ? 'Friend request' : U.fmt(count) + ' new friend requests';
      const body = (count === 1 ? got[0].displayName + ' (@' + got[0].username + ') wants to be your friend.' : names + ' and ' + U.fmt(count - Math.min(2, got.length)) + ' more fans want to be your friend.') + ' ' + U.fmt(pending) + ' waiting.';
      if (note) {
        BF.store.update('notifications', () => { note.title = title; note.body = body; note.ts = now; note.action = null; });
        flood.count = count;
        flood.at = now;
        return note;
      }
      const loud = now - lastFloodPopup > T.floodPopupMs;
      if (loud) lastFloodPopup = now;
      const item = BF.notify.push({ type: 'friend', title, body, icon: 'userPlus', route: '#/friends/requests', action: count === 1 ? { kind: 'friendRequest', id: got[0].id } : null, silent: !loud });
      flood = item ? { id: item.id, count, at: now } : null;
      return item;
    },

    worldTick() {
      fame.check();
      fame.requests(4);
    },
  });
})((window.BF = window.BF || {}));
