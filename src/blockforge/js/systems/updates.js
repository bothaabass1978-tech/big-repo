/**
 * BlockForge — occasional developer updates.
 *
 * The studios behind the built-in games ship an update now and then: patch
 * notes in the game's update log, a short event (bonus XP, a bigger crowd, a
 * pass sale) and sometimes a new limited item. Updates are deliberately rare:
 * the first one arrives a day after this save starts, then one every 4 to 7
 * days of real time. Only one is ever delivered per check, so coming back
 * after a month away brings one update, not a pile of them.
 *
 *   BF.updates.check(now)      deliver the next update if one is due (clock injectable)
 *   BF.updates.apply(now)      re-apply delivered updates after a load
 *   BF.updates.active(gameId)  the event running in a game, or null
 *   BF.updates.xpMult(gameId)  XP multiplier from that event
 *   BF.updates.passPrice(pass) a pass's price with any update sale applied
 *   BF.updates.latest()        most recent delivered update with its details
 *   BF.updates.released(id)    has this update shipped?
 *
 * Everything is fictional and local; there is no server and no real money.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const DAY = 86400000;
  const T = { firstDelayDays: 1, gapMinDays: 4, gapMaxDays: 7, eventDays: 3 };

  const st = () => BF.store.state && BF.store.state.updates;
  const now0 = (now) => (now == null ? BF.clock.now() : now);

  /** The update definition for the n-th release (authored list, then seasonal events). */
  function defAt(n) {
    if (n < BF.UPDATES.length) return BF.UPDATES[n];
    const k = n - BF.UPDATES.length;
    const games = BF.GAME_REGISTRY.filter((g) => g.builtIn);
    const game = games[U.hash('seasonal:' + k) % games.length];
    const s = BF.UPDATES_SEASONAL[k % BF.UPDATES_SEASONAL.length];
    return Object.assign({ id: 'upd_season_' + k, gameId: game.id }, s);
  }
  const defById = (id) => {
    const a = BF.UPDATES.find((d) => d.id === id);
    if (a) return a;
    const m = /^upd_season_(\d+)$/.exec(id);
    return m ? defAt(BF.UPDATES.length + Number(m[1])) : null;
  };

  /** Next version number after a game's latest changelog entry ("4.2" -> "4.3"). */
  function nextVersion(g) {
    const top = g.changelog && g.changelog[0] && String(g.changelog[0].v);
    if (!top) return '1.1';
    const [maj, min] = top.split('.').map((x) => parseInt(x, 10) || 0);
    return maj + '.' + (min + 1);
  }

  /** Days between release n and n+1 (steady per save, 4-7 days). */
  const gapDays = (n) => T.gapMinDays + (U.hash('updgap:' + n) % 1000) / 1000 * (T.gapMaxDays - T.gapMinDays);

  const updates = (BF.updates = {
    T,
    defAt,

    /** When the next update is due (ms timestamp), or 0 before the schedule starts. */
    due() {
      const s = st();
      if (!s || !s.last) return 0;
      return s.last + (s.seen.length ? gapDays(s.seen.length) : T.firstDelayDays) * DAY;
    },

    released(id) { const s = st(); return !!(s && s.seen.some((r) => r.id === id)); },

    /**
     * Deliver the next update if it is due. At most one per call.
     * @param {number} [now] injectable clock (ms)
     * @returns {object|null} the delivered record
     */
    check(now) {
      const s = st();
      if (!s) return null;
      now = now0(now);
      if (!s.last) { BF.store.update('updates', (x) => { x.updates.last = now; }); return null; }
      if (now < updates.due()) return null;
      const def = defAt(s.seen.length);
      const g = BF.catalog.get(def.gameId);
      if (!g) return null;
      const rec = { id: def.id, gameId: def.gameId, v: nextVersion(g), at: now };
      // the next gap counts from now, so a long break never queues several updates
      BF.store.update('updates', (x) => { x.updates.seen.push(rec); x.updates.last = now; });
      updates.applyOne(rec, now);
      const extras = [];
      if (def.event && def.event.xp > 1) extras.push(def.event.xp + 'x XP');
      if (def.sale) extras.push(def.sale + '% off passes');
      if (def.items && def.items.length) extras.push('new limited item');
      if (BF.notify) BF.notify.push({ type: 'system', title: g.name + ' v' + rec.v + ': ' + def.title, body: (extras.length ? extras.join(' · ') + ' for ' + T.eventDays + ' days. ' : '') + def.notes, icon: 'refresh', route: '#/game/' + g.id });
      if (BF.bus) BF.bus.emit('update:released', { rec, def, game: g });
      return rec;
    },

    /** Apply one delivered update: update log, release items, start the event crowd. */
    applyOne(rec, now) {
      const def = defById(rec.id);
      const g = BF.catalog.get(rec.gameId);
      if (!def || !g) return;
      g.changelog = g.changelog || [];
      if (!g.changelog.some((c) => c.updateId === rec.id)) {
        g.changelog.unshift({ v: rec.v, date: new Date(rec.at).toISOString().slice(0, 10), notes: def.title + ': ' + def.notes, updateId: rec.id });
        if (new Date(g.updatedAt).getTime() < rec.at) g.updatedAt = new Date(rec.at).toISOString().slice(0, 10);
      }
      for (const id of def.items || []) { const it = BF.ITEMS[id]; if (it) it.notForSale = false; }
      const left = rec.at + T.eventDays * DAY - now0(now);
      if (left > 0 && def.event && def.event.crowd && BF.world && BF.world.boost) BF.world.boost(g.id, def.event.crowd, left);
    },

    /** Re-apply every delivered update (after a load or account switch). */
    apply(now) {
      const s = st();
      if (!s) return;
      // start from the shipped data so another account's updates never leak into this one
      for (const it of BF.ITEM_LIST) if (it.releasedBy) it.notForSale = true;
      for (const g of BF.GAME_REGISTRY) if (g.changelog) g.changelog = g.changelog.filter((c) => !c.updateId);
      for (const rec of s.seen) updates.applyOne(rec, now);
    },

    /** The event running in a game right now, or null. */
    active(gameId, now) {
      const s = st();
      if (!s) return null;
      now = now0(now);
      for (let i = s.seen.length - 1; i >= 0; i--) {
        const rec = s.seen[i];
        if (rec.gameId !== gameId) continue;
        const until = rec.at + T.eventDays * DAY;
        if (now < until && now >= rec.at) return { rec, def: defById(rec.id), until };
      }
      return null;
    },

    xpMult(gameId, now) { const a = updates.active(gameId, now); return a && a.def.event && a.def.event.xp ? a.def.event.xp : 1; },
    salePct(gameId, now) { const a = updates.active(gameId, now); return a && a.def.sale ? a.def.sale : 0; },
    passPrice(pass, now) {
      const pct = pass && pass.gameId ? updates.salePct(pass.gameId, now) : 0;
      return pct ? Math.max(1, Math.round(pass.price * (1 - pct / 100))) : pass.price;
    },

    /** Delivered updates, newest first, with their definitions. */
    history() {
      const s = st();
      if (!s) return [];
      return s.seen.slice().reverse().map((rec) => ({ rec, def: defById(rec.id), game: BF.catalog.get(rec.gameId) })).filter((x) => x.def && x.game);
    },
    latest() { return updates.history()[0] || null; },

    /** Called by the world tick; cheap when nothing is due. */
    worldTick() { updates.check(); },
  });

  if (BF.bus) BF.bus.on('store:loaded', () => updates.apply());
})((window.BF = window.BF || {}));
