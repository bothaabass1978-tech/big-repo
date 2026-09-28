/**
 * BlockForge — your own game studio, and buying other studios.
 *
 *   BF.company.mine()               your studio record or null
 *   BF.company.found({name, color, tagline})
 *   BF.company.value(studio)        what a studio is worth (ForgeCoins)
 *   BF.company.market()             every studio with its price and whether you own it
 *   BF.company.buy(name) / sell(name)
 *   BF.company.owns(name)           do you own this studio?
 *   BF.company.incomePerMin()       the owner's share you earn from studios you own
 *   BF.company.worth()              your studio's total value
 *   BF.company.tick(now)            pay studio income (world tick)
 *
 * A studio is priced from what its owner earns: T.paybackMin minutes of the
 * owner's share, plus a brand premium of T.brandShare of everything the owner
 * has earned so far. Buying one pays the previous owner (their fortune keeps
 * the price) and moves the owner's share of its revenue to you from then on;
 * its players also count toward your fame. You can sell a studio back at
 * T.sellShare of its value. All fictional and local (ADR-0004).
 * Story: BLOCKFORGE-020
 */
(function (BF) {
  'use strict';

  const U = BF.util;

  /** Tuning (data). */
  const T = {
    foundCost: 2500,
    nameLen: [3, 28],
    paybackMin: 2880, // two days of the owner's share
    brandShare: 0.1,
    sellShare: 0.9,
    payEveryMin: 5,
    colors: ['#ff7a2e', '#46a8ff', '#4ad17f', '#b67cff', '#ff4f9a', '#ffc940', '#39f3ff', '#e03e5a'],
  };

  function st() { return BF.store.state; }

  const company = (BF.company = {
    T,

    /** Your studio, or null before you found one. */
    mine() { const s = st(); return s ? s.company : null; },

    /** Found your studio. */
    found(o) {
      const s = st();
      o = o || {};
      if (s.company) return { ok: false, error: 'You already have a studio.' };
      const name = String(o.name || '').replace(/\s+/g, ' ').trim();
      if (name.length < T.nameLen[0] || name.length > T.nameLen[1]) return { ok: false, error: 'Studio names are ' + T.nameLen[0] + '-' + T.nameLen[1] + ' characters.' };
      if (BF.dialogue && BF.dialogue.filter(name) !== name) return { ok: false, error: 'Pick a different name.' };
      if (BF.creatorEconomy && BF.creatorEconomy.studios().some((x) => x.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: 'A studio with that name already exists.' };
      const paid = BF.economy.spend(T.foundCost, 'Founded ' + name, 'studio');
      if (!paid.ok) return { ok: false, error: 'Founding a studio costs ' + U.fmt(T.foundCost) + ' ForgeCoins.' };
      const rec = { name, color: T.colors.includes(o.color) ? o.color : T.colors[0], tagline: String(o.tagline || '').slice(0, 80), founded: BF.clock.now(), acquired: [], pending: 0, paidAt: BF.clock.now(), earned: 0 };
      BF.store.update(['company', 'community'], (x) => { x.company = rec; x.community.members = Math.max(x.community.members || 0, Math.round((BF.followers ? BF.followers.total() : 0) * 0.3)); });
      BF.bus.emit('company:changed', {});
      return { ok: true, company: rec };
    },

    /** Change your studio's name, colour or tagline (free). */
    edit(o) {
      const s = st();
      if (!s.company) return { ok: false };
      BF.store.update('company', (x) => {
        if (o.name && o.name.trim().length >= T.nameLen[0]) x.company.name = o.name.trim().slice(0, T.nameLen[1]);
        if (T.colors.includes(o.color)) x.company.color = o.color;
        if (o.tagline != null) x.company.tagline = String(o.tagline).slice(0, 80);
      });
      return { ok: true };
    },

    /** Is this studio yours? */
    owns(name) {
      const c = company.mine();
      return !!c && c.acquired.some((a) => a.name === name);
    },

    /** The owner's share of a studio's revenue per minute. */
    ownerIncome(studio) {
      return studio.perMin * BF.creatorEconomy.T.ownerShare;
    },

    /** What a studio is worth. */
    value(studio) {
      return Math.round(company.ownerIncome(studio) * T.paybackMin + studio.lifetime * BF.creatorEconomy.T.ownerShare * T.brandShare);
    },

    /** Every studio, with price and whether you own it (most valuable first). */
    market() {
      return BF.creatorEconomy.studios().map((x) => ({ studio: x, name: x.name, value: company.value(x), income: company.ownerIncome(x), mine: company.owns(x.name) })).sort((a, b) => b.value - a.value);
    },

    /** Buy a studio at its value. */
    buy(name) {
      const s = st();
      if (!s.company) return { ok: false, error: 'Found your own studio first.' };
      if (company.owns(name)) return { ok: false, error: 'You already own ' + name + '.' };
      const x = BF.creatorEconomy.studio(name);
      if (!x) return { ok: false, error: 'Studio not found.' };
      const price = company.value(x);
      if (!BF.economy.canAfford(price)) return { ok: false, error: name + ' costs ' + U.fmt(price) + ' ForgeCoins.', need: price - BF.economy.balance() };
      BF.economy.spend(price, 'Bought ' + name, 'studio');
      const seller = x.owner;
      BF.store.update(['company', 'bots'], (y) => {
        y.company.acquired.push({ name, price, at: BF.clock.now(), from: seller.id, lifetimeAt: x.lifetime });
        const b = y.bots[seller.id] || (y.bots[seller.id] = {});
        b.coins = (b.coins || 0) + price;
      });
      BF.creatorEconomy.invalidate();
      if (BF.messages && BF.voice) setTimeout(() => { if (st()) BF.messages.receive(seller.id, BF.voice.say(seller, U.pick(['cant believe i sold ' + name + ' lol. take care of it ok', 'pleasure doing business. ' + name + ' is in good hands', 'wow ok, ' + name + ' is yours now. treat the team well'])), { quietIfOpen: true }); }, 3000);
      if (BF.notify) BF.notify.push({ type: 'update', title: 'You bought ' + name + '!', body: U.fmt(Math.round(company.ownerIncome(x))) + ' ForgeCoins a minute now go to your studio, and its ' + U.compact(x.playing) + ' players count toward your fame.', icon: 'crown', route: '#/mystudio' });
      BF.bus.emit('company:changed', { bought: name });
      return { ok: true, price };
    },

    /** Sell a studio you own back at T.sellShare of its value. */
    sell(name) {
      const s = st();
      const c = s.company;
      const i = c ? c.acquired.findIndex((a) => a.name === name) : -1;
      if (i < 0) return { ok: false, error: 'You do not own ' + name + '.' };
      const x = BF.creatorEconomy.studio(name);
      const price = Math.round(company.value(x) * T.sellShare);
      const buyer = x.owner;
      BF.store.update(['company', 'bots'], (y) => {
        y.company.acquired.splice(i, 1);
        const b = y.bots[buyer.id] || (y.bots[buyer.id] = {});
        b.coins = (b.coins || 0) - price;
      });
      BF.creatorEconomy.invalidate();
      BF.economy.earn(price, 'Sold ' + name, 'studio');
      BF.bus.emit('company:changed', { sold: name });
      return { ok: true, price };
    },

    /** ForgeCoins a minute from studios you own. */
    incomePerMin() {
      const c = company.mine();
      if (!c || !c.acquired.length) return 0;
      return c.acquired.reduce((a, q) => { const x = BF.creatorEconomy.studio(q.name); return a + (x ? company.ownerIncome(x) : 0); }, 0);
    },

    /** Players in games of studios you own (for fame). */
    playing() {
      const c = company.mine();
      if (!c) return 0;
      return c.acquired.reduce((a, q) => { const x = BF.creatorEconomy.studio(q.name); return a + (x ? x.playing : 0); }, 0);
    },

    /** Your studio's value: your own games plus the studios you own. */
    worth() {
      const s = st();
      if (!s.company) return 0;
      let v = 0;
      for (const q of s.company.acquired) { const x = BF.creatorEconomy.studio(q.name); if (x) v += company.value(x); }
      for (const g of s.created || []) {
        if (!g.published) continue;
        const r = BF.creatorEconomy.gameRevenue(BF.catalog.get(g.id));
        v += Math.round(r.perMin * T.paybackMin + (g.revenue || 0) * T.brandShare);
      }
      return v;
    },

    /** World tick: accrue the owner's share and pay it out every few minutes. */
    tick(now) {
      const s = st();
      const c = s && s.company;
      if (!c || !c.acquired.length) return;
      now = now || BF.clock.now();
      const dt = c.tickAt ? U.clamp((now - c.tickAt) / 60000, 0, 10) : 0;
      c.tickAt = now;
      c.pending += company.incomePerMin() * dt;
      if (now - (c.paidAt || 0) >= T.payEveryMin * 60000 && c.pending >= 1) {
        const amt = Math.floor(c.pending);
        c.pending -= amt;
        c.earned = (c.earned || 0) + amt;
        c.paidAt = now;
        BF.economy.earn(amt, 'Studio income (' + c.acquired.length + ' studio' + (c.acquired.length > 1 ? 's' : '') + ')', 'studio');
      }
      BF.store.touch('companyStats');
    },

    worldTick() { company.tick(BF.clock.now()); },
  });
})((window.BF = window.BF || {}));
