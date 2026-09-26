/**
 * BlockForge — limited items, serial numbers, the resale market and ultra-rare finds.
 *
 * A limited item (item.limitedStock) has a fixed number of copies. Other
 * players buy them up over time (item.perHour); every copy you buy gets the
 * next serial number. When the stock is gone the item can only be bought from
 * resellers at a market price (RAP) that drifts with demand, and you can sell
 * yours back to the market. Collectibles with item.dropChance are never sold:
 * they can turn up, free, when a game session ends.
 *
 * All prices are fictional ForgeCoins inside the local save. There is no real
 * money, no paid randomness and no trading with real people.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const T = { resaleFee: 0.7, rapDrift: 0.012, offers: 3, dayMs: 86400000 };
  let lastTick = 0;

  const state = () => BF.store.state && BF.store.state.limiteds;

  const limiteds = (BF.limiteds = {
    T,
    /** Every limited item, newest drop first. */
    list() { return BF.ITEM_LIST.filter((i) => i.limitedStock && !(i.releasedBy && i.notForSale)).sort((a, b) => a.releasedDaysAgo - b.releasedDaysAgo); },
    /** Ultra-rare finds that can drop when a game ends. */
    drops() { return BF.ITEM_LIST.filter((i) => i.dropChance); },

    /** Save record for an item, created on first sight from its data. */
    rec(item) {
      const s = BF.store.state;
      if (!s.limiteds) s.limiteds = {};
      let r = s.limiteds[item.id];
      if (!r) {
        // copies already gone when this save first sees the drop, plus what sold since release
        const since = Math.max(0, item.releasedDaysAgo || 0) * 24 * (item.perHour || 0);
        const sold = Math.min(item.limitedStock, Math.round(item.limitedStock * (item.soldAtStart || 0) + since * 0.15));
        r = s.limiteds[item.id] = { sold, mine: [], rap: Math.round(item.price * (sold >= item.limitedStock ? 1.6 : 1.1)) };
      }
      return r;
    },

    left(item) { return Math.max(0, item.limitedStock - limiteds.rec(item).sold); },
    soldOut(item) { return limiteds.left(item) <= 0; },
    /** Recent average price on the resale market. */
    rap(item) { return limiteds.rec(item).rap; },
    serials(item) { return limiteds.rec(item).mine.slice(); },

    /** Current reseller offers (bots), cheapest first. Only for sold-out items. */
    offers(item) {
      if (!limiteds.soldOut(item)) return [];
      const r = limiteds.rec(item);
      const rng = U.rng('resale:' + item.id + ':' + Math.floor(Date.now() / 600000) + ':' + r.mine.length);
      const out = [];
      for (let i = 0; i < T.offers; i++) {
        const bot = BF.bots.list[Math.floor(rng() * Math.min(BF.bots.list.length, 600))];
        const serial = 1 + Math.floor(rng() * item.limitedStock);
        if (!bot || r.mine.includes(serial)) continue;
        out.push({ bot, serial, price: Math.round(r.rap * (0.96 + rng() * 0.4) / 10) * 10 });
      }
      return out.sort((a, b) => a.price - b.price);
    },

    /** Buy a new copy from the shop's stock. */
    buyNew(item) {
      if (!item.limitedStock) return { ok: false, reason: 'missing' };
      if (limiteds.soldOut(item)) return { ok: false, reason: 'soldout' };
      const res = BF.economy.spend(item.price, 'Purchased ' + item.name + ' (limited)', 'purchase');
      if (!res.ok) return { ok: false, reason: 'insufficient', need: res.need, price: item.price };
      let serial = 0;
      BF.store.update(['limiteds'], () => { const r = limiteds.rec(item); r.sold += 1; serial = r.sold; r.mine.push(serial); });
      BF.inventory.add(item.id, 1, 'limited');
      limiteds.announce(item, serial);
      return { ok: true, item, serial, price: item.price };
    },

    /** Buy a reseller's copy. */
    buyResale(item, offer) {
      if (!offer) return { ok: false, reason: 'missing' };
      const res = BF.economy.spend(offer.price, 'Bought ' + item.name + ' #' + offer.serial + ' from @' + offer.bot.username, 'purchase');
      if (!res.ok) return { ok: false, reason: 'insufficient', need: res.need, price: offer.price };
      BF.store.update(['limiteds'], () => { const r = limiteds.rec(item); r.mine.push(offer.serial); r.rap = Math.round(r.rap * 0.85 + offer.price * 0.15); });
      BF.inventory.add(item.id, 1, 'resale');
      limiteds.announce(item, offer.serial);
      return { ok: true, item, serial: offer.serial, price: offer.price };
    },

    /** Sell one of your copies to the market for a share of RAP. */
    sellToMarket(item) {
      const r = limiteds.rec(item);
      if (!r.mine.length || !BF.inventory.owns(item.id)) return { ok: false, reason: 'none' };
      const value = Math.floor(r.rap * T.resaleFee);
      const serial = r.mine[r.mine.length - 1];
      const slot = BF.ITEM_CATS[item.cat].slot;
      if (slot && BF.avatar.isEquipped(item.id) && BF.inventory.qty(item.id) <= 1) BF.avatar.unequip(slot);
      BF.store.update(['limiteds'], () => { r.mine.pop(); });
      BF.inventory.remove(item.id, 1);
      BF.economy.earn(value, 'Sold ' + item.name + ' #' + serial + ' on the resale market', 'sale');
      return { ok: true, value, serial };
    },

    announce(item, serial) {
      if (BF.notify) BF.notify.push({ type: 'purchase', title: 'You own ' + item.name + ' #' + serial, body: 'Serial ' + serial + ' of ' + U.fmt(item.limitedStock) + '. Only ' + U.fmt(item.limitedStock) + ' will ever exist.', icon: 'gem', route: '#/inventory' });
    },

    /** Market step: other players buy stock, and resale prices drift. */
    tick(seconds) {
      if (!state() && BF.store.state) BF.store.state.limiteds = {};
      if (!BF.store.state) return;
      let changed = false;
      for (const item of limiteds.list()) {
        const r = limiteds.rec(item);
        if (r.sold < item.limitedStock) {
          const expected = (item.perHour * seconds) / 3600;
          const n = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
          if (n) { r.sold = Math.min(item.limitedStock, r.sold + n); changed = true; if (r.sold >= item.limitedStock && BF.notify && BF.inventory.owns(item.id)) BF.notify.push({ type: 'system', title: item.name + ' sold out', body: 'Your copy is now only available on the resale market. Its price is climbing.', icon: 'gem', route: '#/shop' }); }
        }
        // scarcity pushes resale prices up; a little noise keeps them alive
        const target = item.price * (limiteds.soldOut(item) ? 1.6 + (BF.RARITY[item.rarity].rank - 4) * 0.25 : 1.1);
        r.rap = Math.max(Math.round(item.price * 0.8), Math.round(r.rap + (target - r.rap) * 0.02 + r.rap * T.rapDrift * (Math.random() - 0.5)));
      }
      if (changed) BF.store.touch('limiteds');
    },

    /** Roll for ultra-rare finds when a session ends. `rng` is injectable for tests. */
    rollDrops(gameName, rng) {
      const roll = rng || Math.random;
      const got = [];
      for (const item of limiteds.drops()) if (roll() < item.dropChance) got.push(item);
      for (const item of got) {
        BF.inventory.add(item.id, 1, 'drop');
        if (BF.notify) BF.notify.push({ type: 'achievement', title: 'Ultra-rare find: ' + item.name + '!', body: 'You found it after ' + (gameName || 'a game') + '. Worth ' + U.fmt(item.value) + ' ForgeCoins in collection value.', icon: 'gem', route: '#/inventory/collectibles' });
      }
      return got;
    },

    worldTick() {
      const now = Date.now();
      const dt = lastTick ? Math.min(30, (now - lastTick) / 1000) : 4;
      lastTick = now;
      limiteds.tick(dt);
    },
  });
})((window.BF = window.BF || {}));
