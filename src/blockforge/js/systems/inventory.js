/**
 * BlockForge — inventory, shop purchases, selling, game passes and game-store products.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const WEARABLE_GROUPS = ['avatar', 'clothing', 'accessories', 'emotes', 'animations'];
  const SELL_RATE = 0.4;

  const inventory = (BF.inventory = {
    owns(id) {
      const s = BF.store.state;
      return !!(s && s.inventory[id] && s.inventory[id].qty > 0);
    },
    qty(id) {
      const s = BF.store.state;
      return s && s.inventory[id] ? s.inventory[id].qty : 0;
    },

    /** Add items (stackable for collectibles). */
    add(id, qty, source) {
      const item = BF.ITEMS[id];
      if (!item) return false;
      qty = qty || 1;
      BF.store.update('inventory', (s) => {
        const cur = s.inventory[id];
        const stack = item.cat === 'collectible';
        if (cur) cur.qty = stack ? cur.qty + qty : Math.max(1, cur.qty);
        else s.inventory[id] = { qty: stack ? qty : 1, at: BF.clock.now(), fav: false, source: source || 'shop' };
      });
      BF.bus.emit('inventory:added', { item, qty, source });
      return true;
    },

    remove(id, qty) {
      BF.store.update('inventory', (s) => {
        const cur = s.inventory[id];
        if (!cur) return;
        cur.qty -= qty || 1;
        if (cur.qty <= 0) delete s.inventory[id];
      });
    },

    /** Price of a bundle adjusts for pieces you already own. */
    priceFor(item) {
      if (item.cat !== 'bundle') return item.price;
      const parts = item.contents.map((id) => BF.ITEMS[id]);
      const total = parts.reduce((a, p) => a + p.price, 0) || 1;
      const missing = parts.filter((p) => !inventory.owns(p.id)).reduce((a, p) => a + p.price, 0);
      return Math.round((item.price * missing) / total);
    },

    /** Whether an item counts as owned for shop display. */
    isOwned(item) {
      if (item.cat === 'bundle') return item.contents.every((id) => inventory.owns(id));
      return inventory.owns(item.id);
    },

    /**
     * Can the player buy this item right now?
     * @returns {{ok:boolean, reason?:string, price:number}}
     */
    canBuy(item) {
      const price = inventory.priceFor(item);
      if (item.notForSale) return { ok: false, reason: 'notForSale', price };
      if (item.cat !== 'collectible' && inventory.isOwned(item)) return { ok: false, reason: 'owned', price };
      if (item.limited && inventory.qty(item.id) >= item.limited) return { ok: false, reason: 'limit', price };
      if (!BF.economy.canAfford(price)) return { ok: false, reason: 'insufficient', price };
      return { ok: true, price };
    },

    /**
     * Purchase an item or bundle with ForgeCoins.
     * @returns {{ok:boolean, reason?:string, need?:number, item?:object}}
     */
    buy(id) {
      const item = BF.ITEMS[id];
      if (!item) return { ok: false, reason: 'missing' };
      const check = inventory.canBuy(item);
      if (!check.ok && check.reason !== 'insufficient') return check;
      const res = BF.economy.spend(check.price, 'Purchased ' + item.name, item.cat === 'tool' ? 'product' : 'purchase');
      if (!res.ok) return { ok: false, reason: 'insufficient', need: res.need, price: check.price };
      if (item.cat === 'bundle') item.contents.forEach((cid) => { if (!inventory.owns(cid)) inventory.add(cid, 1, 'bundle'); });
      else inventory.add(id, 1, 'shop');
      BF.store.update('player', (s) => { s.player.stats.itemsBought += 1; });
      BF.quests.track('buy_item', 1);
      BF.notify.push({ type: 'purchase', title: 'Purchase successful', body: 'You bought ' + item.name + ' for ' + U.fmt(check.price) + ' ForgeCoins.', icon: 'bag', route: item.cat === 'tool' ? '#/inventory/tools' : '#/inventory', silent: true });
      BF.bus.emit('purchase', { item, price: check.price });
      return { ok: true, item, price: check.price };
    },

    /** ForgeCoins you get back for selling one. */
    sellValue(item) {
      if (item.cat === 'collectible') return Math.floor((item.value || item.price) * 0.5);
      return Math.floor(item.price * SELL_RATE);
    },

    canSell(item) {
      if (!inventory.owns(item.id)) return false;
      if (item.cat === 'bundle' || item.starter) return false;
      return inventory.sellValue(item) > 0;
    },

    /** Sell one copy back to the shop. Equipped items are unequipped first. */
    sell(id) {
      const item = BF.ITEMS[id];
      if (!item || !inventory.canSell(item)) return { ok: false, reason: 'cannot' };
      const value = inventory.sellValue(item);
      const slot = BF.ITEM_CATS[item.cat].slot;
      if (slot && BF.store.state.avatar.equipped[slot] === id && (item.cat !== 'collectible')) BF.avatar.unequip(slot);
      inventory.remove(id, 1);
      BF.store.update('player', (s) => { s.player.stats.itemsSold = (s.player.stats.itemsSold || 0) + 1; });
      BF.economy.earn(value, 'Sold ' + item.name, 'sale');
      return { ok: true, value };
    },

    toggleFavorite(id) {
      BF.store.update('inventory', (s) => {
        if (s.inventory[id]) s.inventory[id].fav = !s.inventory[id].fav;
      });
    },

    /** Paid wearable items owned (starter freebies excluded). */
    wearableCount() {
      const s = BF.store.state;
      return Object.keys(s.inventory).filter((id) => {
        const it = BF.ITEMS[id];
        return it && it.price > 0 && WEARABLE_GROUPS.includes(BF.ITEM_CATS[it.cat].group);
      }).length;
    },

    /** Collection value of one item (rarity multiplier applied). */
    itemValue(item) {
      const base = item.value || item.price || 25;
      return Math.round(base * BF.RARITY[item.rarity].valueMult);
    },

    collectionValue() {
      const s = BF.store.state;
      let total = 0;
      for (const [id, v] of Object.entries(s.inventory)) {
        const it = BF.ITEMS[id];
        if (it) total += inventory.itemValue(it) * v.qty;
      }
      for (const pid of Object.keys(s.passes)) {
        const p = BF.passes.get(pid);
        if (p) total += p.price;
      }
      return total;
    },

    /**
     * Unified inventory view: avatar items, passes, pets (shop + Pet World),
     * tools and collectibles.
     */
    entries() {
      const s = BF.store.state;
      const out = [];
      for (const [id, v] of Object.entries(s.inventory)) {
        const it = BF.ITEMS[id];
        if (!it) continue;
        const group = it.pet ? 'pets' : BF.ITEM_CATS[it.cat].group;
        out.push({ key: id, kind: 'item', item: it, name: it.name, rarity: it.rarity, qty: v.qty, at: v.at, fav: !!v.fav, group, equipped: BF.avatar.isEquipped(id), value: inventory.itemValue(it) });
      }
      for (const [pid, v] of Object.entries(s.passes)) {
        const p = BF.passes.get(pid);
        if (!p) continue;
        const game = BF.catalog.get(p.gameId);
        out.push({ key: pid, kind: 'pass', pass: p, game, name: p.name, rarity: p.price >= 450 ? 'epic' : p.price >= 350 ? 'rare' : 'uncommon', qty: 1, at: v.at, fav: false, group: 'passes', equipped: false, value: p.price });
      }
      const pw = s.progress['pet-world'];
      if (pw && pw.custom && Array.isArray(pw.custom.pets)) {
        const counts = {};
        for (const pet of pw.custom.pets) counts[pet.species] = (counts[pet.species] || 0) + 1;
        for (const [species, qty] of Object.entries(counts)) {
          const def = BF.PET_WORLD_SPECIES && BF.PET_WORLD_SPECIES[species];
          if (!def) continue;
          out.push({ key: 'pw:' + species, kind: 'gamepet', pet: def, name: def.name, rarity: def.rarity, qty, at: pw.lastPlayed || 0, fav: false, group: 'pets', equipped: pw.custom.equipped ? pw.custom.pets.some((p) => p.species === species && pw.custom.equipped.includes(p.id)) : false, value: def.value || 50, source: 'Pet World' });
        }
      }
      return out;
    },
  });

  // ------------------------------------------------------------------ passes

  const passes = (BF.passes = {
    /** Find a pass definition in built-in or created games. */
    get(passId) {
      for (const g of BF.catalog.all(true)) {
        const p = (g.passes || []).find((x) => x.id === passId);
        if (p) return p;
      }
      return null;
    },
    owns(passId) {
      const s = BF.store.state;
      return !!(s && s.passes[passId]);
    },
    /** Does the player own a pass with this effect for a game? */
    hasEffect(gameId, effect) {
      const g = BF.catalog.get(gameId);
      if (!g) return false;
      return (g.passes || []).some((p) => p.effect === effect && passes.owns(p.id));
    },

    /** Buy a game pass with ForgeCoins. */
    buy(passId) {
      const p = passes.get(passId);
      if (!p) return { ok: false, reason: 'missing' };
      if (passes.owns(passId)) return { ok: false, reason: 'owned' };
      const res = BF.economy.spend(p.price, 'Purchased ' + p.name + ' (game pass)', 'pass');
      if (!res.ok) return { ok: false, reason: 'insufficient', need: res.need, price: p.price };
      BF.store.update(['passes', 'player'], (s) => {
        s.passes[passId] = { at: BF.clock.now(), gameId: p.gameId };
        s.player.stats.passesBought += 1;
      });
      const game = BF.catalog.get(p.gameId);
      BF.notify.push({ type: 'purchase', title: 'Game pass unlocked', body: p.name + ' is now active in ' + (game ? game.name : 'its game') + '.', icon: 'ticket', route: '#/game/' + p.gameId + '/store', silent: true });
      BF.bus.emit('pass:purchased', { pass: p, game });
      return { ok: true, pass: p };
    },
  });

  // ---------------------------------------------------------------- products

  BF.products = {
    /** Buy a game-store product: a tool item or a consumable grant. */
    buy(gameId, productId) {
      const game = BF.catalog.get(gameId);
      const p = game && (game.products || []).find((x) => x.id === productId);
      if (!p) return { ok: false, reason: 'missing' };
      if (p.type === 'item') return inventory.buy(p.id);
      const res = BF.economy.spend(p.price, 'Purchased ' + p.name + ' (' + game.name + ')', 'product');
      if (!res.ok) return { ok: false, reason: 'insufficient', need: res.need, price: p.price };
      BF.store.update('progress', (s) => {
        const pr = BF.progressFor(s, gameId);
        for (const [k, v] of Object.entries(p.grant || {})) pr.custom[k] = (pr.custom[k] || 0) + v;
      });
      BF.notify.push({ type: 'purchase', title: 'Purchase successful', body: p.name + ' delivered to ' + game.name + '.', icon: 'bag', route: '#/game/' + gameId + '/store', silent: true });
      BF.bus.emit('purchase', { product: p, price: p.price });
      return { ok: true, product: p };
    },
  };

  /** Get (creating if needed) the progress record for a game. Call inside update(). */
  BF.progressFor = function (s, gameId) {
    if (!s.progress[gameId]) s.progress[gameId] = { plays: 0, wins: 0, losses: 0, lastPlayed: 0, timeSec: 0, custom: {} };
    if (!s.progress[gameId].custom) s.progress[gameId].custom = {};
    return s.progress[gameId];
  };
})((window.BF = window.BF || {}));
