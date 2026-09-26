/**
 * BlockForge — Advertising: sponsored slots for creator games.
 *
 * A campaign promotes one of your published games in the Home "Sponsored" row,
 * on Discover and at the top of search results. The whole budget is paid up
 * front in (fictional) ForgeCoins; the campaign then buys impressions over time
 * at its tier's price per 1,000 impressions. A share of viewers click through
 * and visit the game, which earns the usual creator payouts (visits and pass
 * sales), so a good game can earn back more than it spent. Stopping a campaign
 * refunds whatever is left of the budget. Nothing here touches real money.
 */
(function (BF) {
  'use strict';

  const U = BF.util;

  const TIERS = {
    standard: { label: 'Standard', cpm: 6, rate: 900, desc: 'Steady reach at the lowest price.' },
    boosted: { label: 'Boosted', cpm: 10, rate: 2400, desc: 'More impressions per minute, sponsored-row priority.' },
    premium: { label: 'Premium', cpm: 16, rate: 6000, desc: 'Top of every placement. Burns through a budget fast.' },
  };
  const PLACEMENTS = {
    home: { label: 'Home · Sponsored row', share: 0.45, ctr: 1.15 },
    discover: { label: 'Discover · Featured slot', share: 0.3, ctr: 1 },
    search: { label: 'Search · Top result', share: 0.25, ctr: 1.5 },
  };
  /** How fast a campaign spends its budget: roughly `minutes` from launch to empty. */
  const PACES = {
    steady: { label: 'Steady', minutes: 60, desc: 'About an hour' },
    fast: { label: 'Fast', minutes: 10, desc: 'About 10 minutes' },
    blitz: { label: 'Blitz', minutes: 2, desc: 'About 2 minutes' },
    burst: { label: 'Burst', minutes: 0.5, desc: 'About 30 seconds' },
  };
  const LIMITS = { minBudget: 50, maxBudget: 50000000, maxActive: 10, headline: [8, 60] };
  const BASE_CTR = 0.024;
  const CLICK_TO_VISIT = 0.78;
  const HIST_MAX = 90;

  const state = () => {
    const s = BF.store.state;
    if (!s) return null;
    if (!s.ads || !Array.isArray(s.ads.campaigns)) s.ads = { campaigns: [] };
    return s.ads;
  };
  const running = (c) => c.status === 'active';

  function gameOf(c) { return BF.creator.get(c.gameId); }
  function eligible(ug) { return !!ug && ug.published && ug.visibility !== 'private'; }
  function remaining(c) { return Math.max(0, c.budget - c.spent); }

  /** Expected click-through rate right now (before randomness). */
  function ctrOf(c, ug) {
    const q = BF.creator.quality(ug);
    const len = (c.headline || '').length;
    const copy = len >= 16 && len <= 48 ? 1.12 : 1;
    const placement = c.placements.reduce((a, p) => a + PLACEMENTS[p].share * PLACEMENTS[p].ctr, 0) / c.placements.reduce((a, p) => a + PLACEMENTS[p].share, 0);
    // viewers tire of the same ad, but big campaigns keep working (square-root falloff)
    const fatigue = 1 / Math.sqrt(1 + c.impressions / 250000);
    return BASE_CTR * q * copy * placement * fatigue;
  }

  function finish(c, reason) {
    c.status = reason === 'spent' ? 'ended' : 'stopped';
    c.endedAt = BF.clock.now();
    const refund = Math.floor(remaining(c));
    const ug = gameOf(c);
    if (refund > 0) {
      c.refunded = refund;
      BF.economy.earn(refund, 'Ad budget refund: ' + (ug ? ug.name : 'campaign'), 'ads');
    }
    BF.notify.push({ type: 'update', title: (reason === 'spent' ? 'Campaign finished: ' : 'Campaign stopped: ') + (ug ? ug.name : 'your game'), body: U.fmt(c.impressions) + ' impressions, ' + U.fmt(c.clicks) + ' clicks and ' + U.fmt(c.visits) + ' visits for ' + U.fmt(Math.round(c.spent)) + ' ForgeCoins.' + (refund > 0 ? ' ' + U.fmt(refund) + ' refunded.' : ''), icon: 'megaphone', route: ug ? '#/create/' + ug.id + '/ads' : '#/create' });
  }

  const ads = (BF.ads = {
    TIERS,
    PLACEMENTS,
    PACES,
    LIMITS,

    /**
     * Impressions a campaign buys in `seconds`. Paced campaigns spend their
     * budget over the pace's minutes; older campaigns without a pace use the
     * tier's rate. Randomness is injectable for tests.
     */
    impressionsFor(c, seconds, rnd) {
      const r = rnd == null ? Math.random() : rnd;
      const tier = TIERS[c.tier] || TIERS.standard;
      const pace = PACES[c.pace];
      if (pace) {
        const spend = (c.budget / (pace.minutes * 60)) * seconds * (0.85 + r * 0.3);
        return Math.max(1, Math.round((spend / tier.cpm) * 1000));
      }
      const share = c.placements.reduce((s2, p) => s2 + (PLACEMENTS[p] ? PLACEMENTS[p].share : 0), 0);
      return Math.round(tier.rate * share * (seconds / 60) * (0.7 + r * 0.6));
    },

    /** Change how fast a running campaign spends. */
    setPace(id, pace) {
      const c = ads.get(id);
      if (!c || !PACES[pace] || (c.status !== 'active' && c.status !== 'paused')) return { ok: false };
      BF.store.update('ads', () => { c.pace = pace; });
      BF.bus.emit('ads:changed', { id });
      return { ok: true };
    },

    /** Every campaign, newest first. */
    list(gameId) {
      const a = state();
      if (!a) return [];
      return a.campaigns.filter((c) => !gameId || c.gameId === gameId).slice().sort((x, y) => y.createdAt - x.createdAt);
    },
    get(id) { const a = state(); return a ? a.campaigns.find((c) => c.id === id) || null : null; },
    active(gameId) { return ads.list(gameId).filter(running); },

    /** True while a game has a live campaign (bots find it more often). */
    boosting(gameId) {
      const a = state();
      return !!a && a.campaigns.some((c) => c.gameId === gameId && running(c));
    },

    /** Rough forecast for the campaign form. */
    estimate(o) {
      const tier = TIERS[o.tier] || TIERS.standard;
      const places = (o.placements || []).filter((p) => PLACEMENTS[p]);
      const ug = BF.creator.get(o.gameId);
      const budget = Math.max(0, Number(o.budget) || 0);
      if (!ug || !places.length || !budget) return { impressions: 0, clicks: 0, visits: 0, minutes: 0, earn: 0 };
      const impressions = Math.floor((budget / tier.cpm) * 1000);
      const share = places.reduce((a, p) => a + PLACEMENTS[p].share, 0);
      const fake = { headline: o.headline || '', placements: places, impressions: impressions / 2 };
      const clicks = Math.round(impressions * ctrOf(fake, ug));
      const visits = Math.round(clicks * CLICK_TO_VISIT);
      const passEv = (ug.passes || []).reduce((a, p) => a + BF.creator.passDemand(p.price, BF.creator.quality(ug)) * Math.floor(p.price * 0.7), 0);
      const pace = PACES[o.pace];
      const minutes = pace ? pace.minutes : Math.max(1, Math.round(impressions / (tier.rate * share)));
      return { impressions, clicks, visits, minutes, earn: Math.round(visits * (BF.creator.VISIT_PAYOUT + passEv)) };
    },

    /** Check a campaign form. Returns {field: message}. */
    validate(o) {
      const e = {};
      const ug = BF.creator.get(o.gameId);
      if (!ug) e.gameId = 'Pick one of your games.';
      else if (!eligible(ug)) e.gameId = 'Publish the game (public or friends only) before advertising it.';
      const h = String(o.headline || '').trim();
      if (h.length < LIMITS.headline[0] || h.length > LIMITS.headline[1]) e.headline = 'Headlines need ' + LIMITS.headline[0] + '-' + LIMITS.headline[1] + ' characters.';
      if (!TIERS[o.tier]) e.tier = 'Pick a tier.';
      if (!Array.isArray(o.placements) || !o.placements.filter((p) => PLACEMENTS[p]).length) e.placements = 'Pick at least one placement.';
      const b = Math.floor(Number(o.budget));
      if (!(b >= LIMITS.minBudget && b <= LIMITS.maxBudget)) e.budget = 'Budgets run from ' + U.fmt(LIMITS.minBudget) + ' to ' + U.fmt(LIMITS.maxBudget) + ' ForgeCoins.';
      else if (b > BF.economy.balance()) e.budget = 'You only have ' + U.fmt(BF.economy.balance()) + ' ForgeCoins.';
      if (ads.list().filter(running).length >= LIMITS.maxActive) e.gameId = 'You can run up to ' + LIMITS.maxActive + ' campaigns at once.';
      return e;
    },

    /**
     * Start a campaign. The budget is paid now; unspent budget comes back when it stops.
     * @param {{gameId:string, headline:string, tier:string, placements:string[], budget:number}} o
     */
    create(o) {
      const errors = ads.validate(o);
      if (Object.keys(errors).length) return { ok: false, errors };
      const ug = BF.creator.get(o.gameId);
      const budget = Math.floor(Number(o.budget));
      const pay = BF.economy.spend(budget, 'Ad campaign: ' + ug.name, 'ads');
      if (!pay.ok) return { ok: false, errors: { budget: 'Not enough ForgeCoins.' } };
      const c = {
        id: U.uid('ad'), gameId: ug.id, headline: String(o.headline).trim(), tier: o.tier,
        placements: o.placements.filter((p) => PLACEMENTS[p]), budget, spent: 0, pace: PACES[o.pace] ? o.pace : 'fast',
        impressions: 0, clicks: 0, visits: 0, status: 'active', createdAt: BF.clock.now(), endedAt: 0, refunded: 0, hist: [],
      };
      BF.store.update(['ads', 'created'], (s) => {
        if (!s.ads || !Array.isArray(s.ads.campaigns)) s.ads = { campaigns: [] };
        s.ads.campaigns.push(c);
        ug.adSpend = ug.adSpend || 0;
      });
      BF.quests.track('create_game', 1);
      BF.bus.emit('ads:changed', { id: c.id });
      return { ok: true, campaign: c };
    },

    pause(id) {
      const c = ads.get(id);
      if (!c || c.status !== 'active') return { ok: false };
      BF.store.update('ads', () => { c.status = 'paused'; });
      BF.bus.emit('ads:changed', { id });
      return { ok: true };
    },
    resume(id) {
      const c = ads.get(id);
      if (!c || c.status !== 'paused') return { ok: false };
      if (ads.list().filter(running).length >= LIMITS.maxActive) return { ok: false, error: 'Too many running campaigns.' };
      BF.store.update('ads', () => { c.status = 'active'; });
      BF.bus.emit('ads:changed', { id });
      return { ok: true };
    },
    /** Stop for good and refund what is left. */
    stop(id) {
      const c = ads.get(id);
      if (!c || (c.status !== 'active' && c.status !== 'paused')) return { ok: false };
      BF.store.update('ads', () => finish(c, 'stopped'));
      BF.bus.emit('ads:changed', { id });
      return { ok: true, refund: c.refunded };
    },
    /** Stop every campaign of a game (used when the game is deleted). */
    stopForGame(gameId) {
      for (const c of ads.list(gameId)) if (c.status === 'active' || c.status === 'paused') ads.stop(c.id);
    },
    /** Top up a running or paused campaign. */
    topUp(id, amount) {
      const c = ads.get(id);
      amount = Math.floor(Number(amount));
      if (!c || (c.status !== 'active' && c.status !== 'paused')) return { ok: false, error: 'Only running campaigns can be topped up.' };
      if (!(amount >= 10)) return { ok: false, error: 'Add at least 10 ForgeCoins.' };
      const ug = gameOf(c);
      const pay = BF.economy.spend(amount, 'Ad top-up: ' + (ug ? ug.name : 'campaign'), 'ads');
      if (!pay.ok) return { ok: false, error: 'Not enough ForgeCoins.' };
      BF.store.update('ads', () => { c.budget += amount; });
      BF.bus.emit('ads:changed', { id });
      return { ok: true };
    },

    /**
     * World tick: running campaigns buy impressions and send visitors.
     * @param {number} seconds time since the last tick
     * @returns {boolean} whether anything changed
     */
    simulate(seconds) {
      const a = state();
      if (!a) return false;
      let touched = false;
      for (const c of a.campaigns) {
        if (!running(c)) continue;
        const ug = gameOf(c);
        if (!ug) { c.status = 'stopped'; c.endedAt = BF.clock.now(); touched = true; continue; }
        if (!eligible(ug)) continue; // drafts and private games do not spend
        const tier = TIERS[c.tier] || TIERS.standard;
        let imps = ads.impressionsFor(c, seconds);
        const affordable = Math.floor((remaining(c) / tier.cpm) * 1000);
        imps = Math.min(imps, affordable);
        if (imps <= 0) { finish(c, 'spent'); touched = true; continue; }
        const ctr = ctrOf(c, ug);
        const clicks = Math.max(0, Math.round(imps * ctr * (0.6 + Math.random() * 0.8)));
        const visits = Math.round(clicks * CLICK_TO_VISIT);
        const cost = (imps * tier.cpm) / 1000;
        c.impressions += imps;
        c.clicks += clicks;
        c.visits += visits;
        c.spent = Math.min(c.budget, c.spent + cost);
        ug.adSpend = (ug.adSpend || 0) + cost;
        const minute = Math.floor(BF.clock.now() / 60000);
        let b = c.hist[c.hist.length - 1];
        if (!b || b.m !== minute) { b = { m: minute, i: 0, c: 0, v: 0, s: 0 }; c.hist.push(b); if (c.hist.length > HIST_MAX) c.hist.splice(0, c.hist.length - HIST_MAX); }
        b.i += imps; b.c += clicks; b.v += visits; b.s += cost;
        BF.creator.receiveVisits(ug, visits, 'ad');
        // some of the visitors stay and play: idle bots join the game's servers
        if (visits > 0 && BF.world && BF.world.menuOnline && BF.bots) {
          const cap = (ug.maxPlayers || 12) * 3;
          const idle = Array.from(BF.world.menuOnline);
          for (let n = Math.min(3, Math.ceil(visits / 8)); n > 0 && idle.length && BF.world.trackedCount(ug.id) < cap; n--) {
            const bot = BF.bots.get(idle.splice(Math.floor(Math.random() * idle.length), 1)[0]);
            if (bot) BF.world.place(bot, ug.id);
          }
        }
        if (remaining(c) < tier.cpm / 1000) finish(c, 'spent');
        touched = true;
      }
      if (touched) BF.store.touch('ads');
      return touched;
    },

    /**
     * Listings to show as Sponsored in a placement: your running campaigns plus
     * house promotions for official games, so the slot is never empty.
     * @param {'home'|'discover'|'search'} placement
     * @param {number} n
     */
    sponsored(placement, n) {
      const mine = ads.list().filter((c) => running(c) && c.placements.includes(placement)).map((c) => ({ c, ug: gameOf(c) })).filter((x) => eligible(x.ug));
      const weight = (x) => (TIERS[x.c.tier] ? TIERS[x.c.tier].cpm : 6) * (0.6 + Math.random());
      mine.sort((x, y) => weight(y) - weight(x));
      const out = mine.slice(0, n).map((x) => ({ gameId: x.ug.id, headline: x.c.headline, campaignId: x.c.id, own: true }));
      if (out.length < n && BF.catalog) {
        const minute = Math.floor(Date.now() / 90000);
        const house = BF.catalog.all().filter((g) => g.builtIn);
        const r = U.rng('house-ads:' + placement + ':' + minute);
        const picks = U.shuffle(house.slice(), r).slice(0, n - out.length);
        for (const g of picks) out.push({ gameId: g.id, headline: g.tagline || g.description.split('.')[0], campaignId: null, own: false });
      }
      return out;
    },

    /** A player clicked a sponsored card (free for your own campaigns). */
    click(campaignId) {
      const c = ads.get(campaignId);
      if (!c) return;
      BF.store.update('ads', () => { c.clicks += 1; });
    },

    /** Campaign-level totals for dashboards. */
    totals(gameId) {
      return ads.list(gameId).reduce((t, c) => ({ spent: t.spent + c.spent, impressions: t.impressions + c.impressions, clicks: t.clicks + c.clicks, visits: t.visits + c.visits, running: t.running + (running(c) ? 1 : 0) }), { spent: 0, impressions: 0, clicks: 0, visits: 0, running: 0 });
    },
  });

  // clicks on sponsored cards are counted for your own campaigns (never charged)
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', (e) => { const el = e.target && e.target.closest && e.target.closest('[data-ad]'); if (el) ads.click(el.dataset.ad); }, true);
  }
})((window.BF = window.BF || {}));
