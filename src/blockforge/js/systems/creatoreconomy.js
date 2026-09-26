/**
 * BlockForge — the creator economy: who owns the games and what they earn.
 *
 * Every studio behind a built-in game has an owner (one of the fictional bots)
 * and a small dev team. A studio earns from every visit (the same payout your
 * own games get) plus game-pass sales, so a game with billions of visits has
 * made its owner a fortune, and it keeps earning every minute its crowd plays.
 * Bots who publish their own games (systems/botgames.js) earn the same way.
 * Bot ForgeCoin balances include that wealth, so the richest players on the
 * leaderboard are the people who made the hits.
 *
 *   BF.creatorEconomy.studios()        every studio, richest first
 *   BF.creatorEconomy.studio(name)     one studio with owner, team, earnings
 *   BF.creatorEconomy.gameRevenue(g)   {lifetime, perMin} for a listing
 *   BF.creatorEconomy.wealthOf(botId)  a bot's personal fortune from creating
 *   BF.creatorEconomy.topCreators(n)   studios, bot creators and you, by earnings
 *
 * All numbers are fictional ForgeCoins in a local simulation.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  /**
   * Tuning (data):
   *   repeatBuy  share of a studio's visits that are first-time buyers (most visits are regulars)
   *   ownerShare share of studio earnings the owner keeps personally
   *   teamShare  share each team member keeps
   *   cacheMs    how long computed totals are reused
   */
  const T = { repeatBuy: 0.05, ownerShare: 0.35, teamShare: 0.03, teamSize: [2, 4], cacheMs: 1500, ownerMinLevel: 25 };

  let cache = null, cacheAt = 0;
  let owners = null; // studio name -> {owner, team}
  let roles = null; // bot id -> [{studio, role}]

  /** Pick an owner and a team for every studio: stable, unique, drawn from experienced bots. */
  function assignOwners() {
    if (owners && owners.size === studioNames().length) return owners;
    owners = new Map();
    const pool = BF.bots.list.filter((b) => !b.handcrafted && b.level >= T.ownerMinLevel);
    const used = new Set();
    for (const name of studioNames()) {
      const r = U.rng('studio:' + name);
      const take = () => {
        for (let i = 0; i < 50; i++) {
          const b = pool[Math.floor(r() * pool.length)];
          if (b && !used.has(b.id)) { used.add(b.id); return b; }
        }
        return pool[0];
      };
      const owner = take();
      const team = [];
      const n = T.teamSize[0] + Math.floor(r() * (T.teamSize[1] - T.teamSize[0] + 1));
      for (let i = 0; i < n; i++) team.push(take());
      owners.set(name, { owner, team });
    }
    roles = new Map();
    const add = (id, r) => { if (!roles.has(id)) roles.set(id, []); roles.get(id).push(r); };
    for (const [name, o] of owners) { add(o.owner.id, { studio: name, role: 'owner' }); o.team.forEach((b) => add(b.id, { studio: name, role: 'team' })); }
    return owners;
  }

  function studioNames() {
    return Array.from(new Set(BF.GAME_REGISTRY.filter((g) => g.builtIn).map((g) => g.creator)));
  }

  const ce = (BF.creatorEconomy = {
    T,

    /**
     * ForgeCoins a game makes per visit: the visit payout plus pass sales from
     * the share of visitors who are new buyers.
     */
    revenuePerVisit(g) {
      const q = g.approval || 0.8;
      const passes = (g.passes || []).reduce((a, p) => a + BF.creator.passDemand(p.price, q) * Math.floor(p.price * 0.7), 0);
      return BF.creator.VISIT_PAYOUT + (g.builtIn ? T.repeatBuy : 1) * passes;
    },

    /** Lifetime earnings and the current rate for a listing. */
    gameRevenue(g) {
      if (!g) return { lifetime: 0, perMin: 0 };
      if (g.userGame) {
        const ug = BF.creator.get(g.id);
        const h = ((ug && ug.hist) || []).slice(-3);
        return { lifetime: (ug && ug.revenue) || 0, perMin: h.length ? h.reduce((a, b) => a + b.r, 0) / h.length : 0 };
      }
      if (g.botGame && BF.botGames) return BF.botGames.revenue(g.id);
      const rpv = ce.revenuePerVisit(g);
      const visits = BF.catalog.stats(g.id).visits;
      const perMin = (BF.world.playerCount(g.id) / 8) * rpv;
      return { lifetime: Math.floor(visits * rpv), perMin };
    },

    /** Every studio behind a built-in game, richest first (cached briefly). */
    studios() {
      const now = Date.now();
      if (cache && now - cacheAt < T.cacheMs) return cache;
      const own = assignOwners();
      const out = studioNames().map((name) => {
        const games = BF.GAME_REGISTRY.filter((g) => g.builtIn && g.creator === name);
        let lifetime = 0, perMin = 0, visits = 0, playing = 0;
        for (const g of games) {
          const r = ce.gameRevenue(g);
          lifetime += r.lifetime;
          perMin += r.perMin;
          visits += BF.catalog.stats(g.id).visits;
          playing += BF.world.playerCount(g.id);
        }
        const o = own.get(name);
        return { name, games, owner: o.owner, team: o.team, lifetime, perMin, visits, playing };
      }).sort((a, b) => b.lifetime - a.lifetime);
      cache = out;
      cacheAt = now;
      return out;
    },
    studio(name) { return ce.studios().find((s) => s.name === name) || null; },
    ownerOf(name) { const o = assignOwners().get(name); return o ? o.owner : null; },

    /** Studios this bot owns or works at. */
    rolesOf(botId) {
      assignOwners();
      return (roles && roles.get(botId)) || [];
    },

    /** A bot's personal fortune from creating: studio shares plus their own published games. */
    wealthOf(botId) {
      let w = 0;
      const roles = ce.rolesOf(botId);
      if (roles.length) {
        for (const s of ce.studios()) {
          for (const r of roles) if (r.studio === s.name) w += s.lifetime * (r.role === 'owner' ? T.ownerShare : T.teamShare);
        }
      }
      if (BF.botGames) w += BF.botGames.earningsOf(botId);
      return Math.floor(w);
    },

    /**
     * A plausible buyer for an expensive purchase: rich creators buy the big
     * tickets, anyone can buy the cheap ones.
     */
    richBuyer(price) {
      if (price >= 50000) {
        const rich = ce.studios().slice(0, 25).map((s) => (Math.random() < 0.7 ? s.owner : U.pick(s.team)));
        if (rich.length) return U.pick(rich);
      }
      return U.pick(BF.bots.list);
    },

    /** Creators ranked by lifetime earnings: studios, bot creators and you. */
    topCreators(n) {
      const rows = ce.studios().map((s) => ({ kind: 'studio', name: s.name, bot: s.owner, lifetime: s.lifetime, perMin: s.perMin, games: s.games.length, playing: s.playing }));
      if (BF.botGames) for (const c of BF.botGames.creators()) rows.push({ kind: 'bot', name: c.bot.displayName, bot: c.bot, lifetime: c.lifetime, perMin: c.perMin, games: c.games, playing: c.playing });
      const s = BF.store.state;
      if (s) {
        const t = BF.creator.totals();
        const mine = BF.creator.list().filter((g) => g.published);
        rows.push({ kind: 'me', me: true, name: s.player.displayName, lifetime: t.revenue, perMin: BF.creator.series(3).reduce((a, b) => a + b.r, 0) / 3, games: mine.length, playing: mine.reduce((a, g) => a + BF.world.playerCount(g.id), 0) });
      }
      rows.sort((a, b) => b.lifetime - a.lifetime || (a.me ? -1 : 1));
      rows.forEach((r, i) => { r.rank = i + 1; });
      return { rows: rows.slice(0, n || 50), you: rows.find((r) => r.me) || null, total: rows.length };
    },

    /** Forget cached owners (tests, or after new studios appear). */
    reset() { owners = null; roles = null; cache = null; },
  });
})((window.BF = window.BF || {}));
