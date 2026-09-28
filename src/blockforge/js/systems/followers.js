/**
 * BlockForge — the living follower graph.
 *
 * You can follow anyone (BF.friends.follow) and people follow you back over
 * time. How fast depends on your "appeal": level, wins, badges, how much you
 * play with others and how popular your own games are. Players of your games
 * sometimes follow the creator. A few followers drift away now and then.
 * New followers are announced in batches, and follower milestones pay a
 * one-time ForgeCoin bonus. Everything is simulated locally with fictional bots.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  /** Tuning (data): followers per minute at appeal 1, unfollow share, milestones and their rewards. */
  const T = {
    basePerMin: 0.35,
    maxPerMin: 6,
    unfollowShare: 0.12,
    visitFollowRate: 0.008,
    batchSeconds: 45,
    milestones: [[10, 50], [25, 100], [50, 200], [100, 400], [250, 750], [500, 1500], [1000, 3000], [2500, 6000], [5000, 12000], [10000, 25000], [25000, 40000], [50000, 60000], [100000, 100000], [250000, 150000], [500000, 250000], [1000000, 500000]],
  };
  let pending = [], pendingT = 0, lastTick = 0, pendingFans = 0;

  const followers = (BF.followers = {
    T,
    /** How interesting your profile is to other players (about 0.3 - 20). */
    appeal() {
      const s = BF.store.state;
      if (!s) return 0;
      const st = s.player.stats || {};
      const badges = Object.keys(s.badges || {}).length;
      const visits = (s.created || []).reduce((a, g) => a + (g.visits || 0), 0);
      const followers = s.social.followers.length + (s.social.fans || 0);
      return 0.3 + s.player.level * 0.06 + Math.sqrt(st.wins || 0) * 0.12 + badges * 0.03 + Math.sqrt(st.chatSent || 0) * 0.05 + Math.log10(1 + visits) * 0.6 + Math.sqrt(followers) * 0.08;
    },

    /** Expected new followers per minute right now. */
    ratePerMin() { return Math.min(T.maxPerMin, T.basePerMin * followers.appeal()); },

    /** Candidates who might follow you: people you played with and friends first, then anyone. */
    candidates() {
      const s = BF.store.state;
      const have = new Set(s.social.followers.concat(s.social.blocked));
      const recent = (s.social.recent || []).map((r) => r.id).filter((id) => !have.has(id));
      const friends = s.social.friends.filter((id) => !have.has(id));
      return { warm: recent.concat(friends), any: BF.bots.list };
    },

    /** Add one follower (a bot id, or a good candidate). Returns the bot or null. */
    gain(id, reason) {
      const s = BF.store.state;
      if (!s) return null;
      let bot = id ? BF.bots.get(id) : null;
      if (!bot) {
        const c = followers.candidates();
        const have = new Set(s.social.followers.concat(s.social.blocked));
        const pool = c.warm.length && Math.random() < 0.5 ? c.warm : null;
        if (pool) bot = BF.bots.get(U.pick(pool));
        for (let tries = 0; !bot && tries < 30; tries++) { const b = U.pick(c.any); if (!have.has(b.id)) bot = b; }
      }
      if (!bot || s.social.followers.includes(bot.id) || s.social.blocked.includes(bot.id)) return null;
      BF.store.update('social', (st) => { st.social.followers.push(bot.id); });
      pending.push({ id: bot.id, reason: reason || '' });
      followers.checkMilestones();
      return bot;
    },

    /** Lose one follower who is not a friend. */
    lose() {
      const s = BF.store.state;
      const pool = s.social.followers.filter((id) => !s.social.friends.includes(id));
      if (pool.length < 15) return null;
      const id = U.pick(pool);
      BF.store.update('social', (st) => { st.social.followers = st.social.followers.filter((x) => x !== id); });
      return id;
    },

    /** Simulation step: `seconds` of platform time. */
    tick(seconds) {
      const s = BF.store.state;
      if (!s) return;
      const expected = (followers.ratePerMin() * seconds) / 60;
      let n = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
      while (n-- > 0) followers.gain(null);
      if (Math.random() < expected * T.unfollowShare) followers.lose();
      pendingT += seconds;
      if (pendingT >= T.batchSeconds) followers.flush();
    },

    /** Everyone following you: named players plus fans (people you will never meet one by one). */
    total() {
      const s = BF.store.state;
      return s ? s.social.followers.length + (s.social.fans || 0) : 0;
    },

    /** Add anonymous fans (big audiences follow you by the thousand). */
    addFans(n) {
      n = Math.floor(n);
      if (!(n > 0)) return;
      BF.store.update('social', (st) => { st.social.fans = (st.social.fans || 0) + n; });
      pendingFans += n;
      followers.checkMilestones();
    },

    /** Players who visited your creation sometimes follow its creator: a named player or two, the rest as fans. */
    fromVisits(visits, gameName) {
      const expected = visits * T.visitFollowRate;
      let n = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
      const named = Math.min(n, n <= 2 ? n : 1 + (Math.random() < 0.3 ? 1 : 0));
      for (let i = 0; i < named; i++) followers.gain(null, gameName ? 'after playing ' + gameName : '');
      followers.addFans(n - named);
    },

    /** Announce new followers as one notification. */
    flush() {
      pendingT = 0;
      const fans = pendingFans;
      pendingFans = 0;
      if (!pending.length && fans && BF.notify) BF.notify.push({ type: 'friend', title: U.fmt(fans) + ' new fan' + (fans > 1 ? 's' : '') + ' followed you', body: 'You have ' + U.fmt(followers.total()) + ' followers.', icon: 'users', route: '#/friends/followers' });
      if (!pending.length || !BF.notify) { pending = []; return; }
      const s = BF.store.state;
      if (s && s.settings.notifications && s.settings.notifications.friends === false) { pending = []; return; }
      const first = BF.bots.get(pending[0].id);
      const more = pending.length - 1;
      const why = pending[0].reason ? ' ' + pending[0].reason : '';
      const others = more + fans;
      BF.notify.push({ type: 'friend', title: (first ? first.displayName : 'Someone') + (others ? ' and ' + U.fmt(others) + ' other' + (others > 1 ? 's' : '') : '') + ' followed you' + why, body: 'You have ' + U.fmt(followers.total()) + ' followers.', icon: 'users', route: '#/friends/followers' });
      pending = [];
    },

    /** Pay each follower milestone once. */
    checkMilestones() {
      const s = BF.store.state;
      const n = followers.total();
      const got = s.social.milestones || [];
      for (const [at, reward] of T.milestones) {
        if (n >= at && !got.includes(at)) {
          BF.store.update('social', (st) => { st.social.milestones = (st.social.milestones || []).concat(at); });
          if (BF.economy) BF.economy.earn(reward, U.fmt(at) + ' followers milestone', 'social');
          if (BF.notify) BF.notify.push({ type: 'reward', title: U.fmt(at) + ' followers!', body: 'Milestone bonus: ' + U.fmt(reward) + ' ForgeCoins.', icon: 'star', route: '#/friends/followers' });
        }
      }
    },

    /** Next milestone {at, reward, progress 0-1} or null. */
    nextMilestone() {
      const n = followers.total();
      const m = T.milestones.find(([at]) => at > n);
      if (!m) return null;
      const prev = T.milestones.filter(([at]) => at <= n).pop();
      const from = prev ? prev[0] : 0;
      return { at: m[0], reward: m[1], progress: (n - from) / (m[0] - from) };
    },

    /** What the people you follow are doing right now (for Home). */
    activity(limit) {
      const s = BF.store.state;
      return s.social.following.map((id) => BF.bots.get(id)).filter(Boolean)
        .map((b) => ({ bot: b, status: BF.world.botStatus(b.id) }))
        .filter((x) => x.status.state === 'ingame')
        .slice(0, limit || 12);
    },

    /** Called by the world tick with real elapsed time. */
    worldTick() {
      const now = Date.now();
      const dt = lastTick ? Math.min(30, (now - lastTick) / 1000) : 4;
      lastTick = now;
      followers.tick(dt);
    },
  });
})((window.BF = window.BF || {}));
