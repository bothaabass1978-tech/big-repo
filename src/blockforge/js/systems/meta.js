/**
 * BlockForge — notifications, quests, achievements and badges.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const MAX_NOTIFS = 150;

  // ----------------------------------------------------------- notifications

  BF.notify = {
    /**
     * Add a notification (respects per-type settings).
     * @param {{type:string, title:string, body?:string, icon?:string, route?:string, silent?:boolean, action?:object}} n
     */
    push(n) {
      const s = BF.store.state;
      if (!s) return null;
      const types = s.settings.notifications.types;
      if (types[n.type] === false) return null;
      const item = { id: U.uid('n'), type: n.type, title: n.title, body: n.body || '', ts: BF.clock.now(), read: false, icon: n.icon || 'bell', route: n.route || null, action: n.action || null };
      BF.store.update('notifications', (st) => {
        st.notifications.unshift(item);
        if (st.notifications.length > MAX_NOTIFS) st.notifications.length = MAX_NOTIFS;
      });
      BF.bus.emit('notify:new', Object.assign({ silent: !!n.silent }, item));
      return item;
    },
    /** Notification types that still pop up in "Important only" mode. */
    IMPORTANT: { friend: true, invite: true, bot: true },

    /**
     * Should this notification show as a pop-up? Pure check of the player's
     * pop-up settings (mode, do-not-disturb, in-game quiet).
     * @param {{type:string, action?:object}} n
     * @param {boolean} inGame a game session is running
     */
    allowsPopup(n, inGame) {
      const s = BF.store.state;
      if (!s) return false;
      const ns = s.settings.notifications;
      if (ns.dnd || ns.popupMode === 'off' || ns.popups === false) return false;
      if (ns.popupMode === 'important' && !BF.notify.IMPORTANT[n.type]) return false;
      if (inGame && !ns.inGame && n.type !== 'invite' && !(n.type === 'friend' && n.action)) return false;
      return true;
    },
    /** Achievement, badge and level-up banners. */
    allowsBanner() {
      const s = BF.store.state;
      return !!s && !s.settings.notifications.dnd && s.settings.notifications.banners !== false;
    },
    /** Toggle do-not-disturb. Returns the new state. */
    toggleDnd(on) {
      let v = false;
      BF.store.update('settings', (s) => { const ns = s.settings.notifications; ns.dnd = on == null ? !ns.dnd : !!on; v = ns.dnd; });
      return v;
    },

    unread() {
      const s = BF.store.state;
      return s ? s.notifications.filter((x) => !x.read).length : 0;
    },
    markRead(id) {
      BF.store.update('notifications', (s) => {
        const it = s.notifications.find((x) => x.id === id);
        if (it) it.read = true;
      });
    },
    markUnread(id) {
      BF.store.update('notifications', (s) => {
        const it = s.notifications.find((x) => x.id === id);
        if (it) it.read = false;
      });
    },
    markAllRead() {
      BF.store.update('notifications', (s) => s.notifications.forEach((x) => { x.read = true; }));
    },
    remove(id) {
      BF.store.update('notifications', (s) => { s.notifications = s.notifications.filter((x) => x.id !== id); });
    },
    clear() {
      BF.store.update('notifications', (s) => { s.notifications = []; });
    },
  };

  // ------------------------------------------------------------------ quests

  function roll(s, scope, key) {
    const pool = BF.QUESTS.filter((q) => q.scope === scope);
    const r = U.rng(s.world.seed + ':' + s.player.username + ':' + scope + ':' + key);
    const picks = U.shuffle(pool, r).slice(0, BF.QUEST_SLOTS[scope]);
    return { key, list: picks.map((q) => ({ id: q.id, progress: 0, done: false, claimed: false, seen: [] })) };
  }

  const quests = (BF.quests = {
    /** Rotate daily/weekly sets when the calendar moves on. */
    ensure() {
      const s = BF.store.state;
      if (!s) return;
      const day = BF.clock.today(), week = BF.clock.week();
      const needDaily = !s.quests.daily || s.quests.daily.key !== day;
      const needWeekly = !s.quests.weekly || s.quests.weekly.key !== week;
      if (!needDaily && !needWeekly) return;
      BF.store.update('quests', (st) => {
        if (needDaily) st.quests.daily = roll(st, 'daily', day);
        if (needWeekly) st.quests.weekly = roll(st, 'weekly', week);
      });
    },

    /** Active quests with their definitions. */
    active(scope) {
      quests.ensure();
      const s = BF.store.state;
      const out = [];
      for (const sc of scope ? [scope] : ['daily', 'weekly']) {
        for (const inst of s.quests[sc].list) {
          const def = BF.QUEST_MAP[inst.id];
          if (def) out.push({ def, inst, scope: sc });
        }
      }
      return out;
    },

    /**
     * Advance quests listening for `event`.
     * @param {string} event e.g. 'play_game', 'win', 'treasure'
     * @param {number} [amount=1]
     * @param {{gameId?:string}} [meta]
     */
    track(event, amount, meta) {
      const s = BF.store.state;
      if (!s) return;
      quests.ensure();
      amount = amount == null ? 1 : amount;
      meta = meta || {};
      const completed = [];
      let changed = false;
      for (const sc of ['daily', 'weekly']) {
        for (const inst of s.quests[sc].list) {
          const def = BF.QUEST_MAP[inst.id];
          if (!def || def.event !== event || inst.done) continue;
          if (def.game && meta.gameId && meta.gameId !== def.game) continue;
          if (def.game && !meta.gameId && event !== 'coins_earned') continue;
          if (def.distinct) {
            if (!meta.gameId || inst.seen.includes(meta.gameId)) continue;
            inst.seen.push(meta.gameId);
            inst.progress = inst.seen.length;
          } else {
            inst.progress = Math.min(def.target, inst.progress + amount);
          }
          changed = true;
          if (inst.progress >= def.target) {
            inst.done = true;
            completed.push({ def, scope: sc });
          }
        }
      }
      if (changed) BF.store.touch('quests');
      for (const c of completed) {
        BF.notify.push({ type: 'quest', title: (c.scope === 'daily' ? 'Daily Challenge' : 'Weekly Quest') + ' complete!', body: c.def.title + ' · Claim ' + U.fmt(c.def.reward) + ' ForgeCoins', icon: 'target', route: '#/quests' });
        BF.bus.emit('quest:complete', c);
      }
    },

    /** Claim a finished quest's reward. */
    claim(scope, id) {
      const s = BF.store.state;
      const inst = s.quests[scope] && s.quests[scope].list.find((q) => q.id === id);
      const def = BF.QUEST_MAP[id];
      if (!inst || !def) return { ok: false, reason: 'missing' };
      if (!inst.done) return { ok: false, reason: 'incomplete' };
      if (inst.claimed) return { ok: false, reason: 'claimed' };
      BF.store.update(['quests', 'player'], (st) => {
        inst.claimed = true;
        st.quests.completed = (st.quests.completed || 0) + 1;
        st.player.stats.questsCompleted += 1;
      });
      BF.economy.earn(def.reward, 'Completed ' + (scope === 'daily' ? 'Daily Challenge' : 'Weekly Quest') + ': ' + def.title, 'quest');
      BF.progression.addXP(def.xp, 'quest');
      BF.bus.emit('quest:claimed', { def, scope });
      return { ok: true, reward: def.reward, xp: def.xp };
    },

    /** Claim everything that is ready. */
    claimAll() {
      let total = 0;
      for (const q of quests.active()) {
        if (q.inst.done && !q.inst.claimed) {
          const r = quests.claim(q.scope, q.def.id);
          if (r.ok) total += r.reward;
        }
      }
      return total;
    },

    claimable() {
      return quests.active().filter((q) => q.inst.done && !q.inst.claimed).length;
    },
  });

  // ------------------------------------------------------------------ badges

  const badges = (BF.badges = {
    /** Look up a game badge or platform badge definition. */
    def(id) {
      if (BF.PLATFORM_BADGES[id]) return BF.PLATFORM_BADGES[id];
      for (const g of BF.GAME_REGISTRY) {
        const b = g.badges.find((x) => x.id === id);
        if (b) return Object.assign({ gameName: g.name }, b);
      }
      return null;
    },
    has(id) {
      const s = BF.store.state;
      return !!(s && s.badges[id]);
    },
    /** Award a badge once. Returns true when newly earned. */
    award(id) {
      if (badges.has(id)) return false;
      const def = badges.def(id);
      if (!def) return false;
      BF.store.update('badges', (s) => { s.badges[id] = { at: BF.clock.now(), gameId: def.gameId || null }; });
      BF.notify.push({ type: 'achievement', title: 'Badge earned: ' + def.name, body: def.desc + (def.gameName ? ' (' + def.gameName + ')' : ''), icon: def.icon || 'medal', route: '#/profile/badges' });
      BF.bus.emit('badge:earned', { def });
      return true;
    },
    /** Earned badges, newest first. */
    earned() {
      const s = BF.store.state;
      return Object.entries(s.badges).map(([id, v]) => Object.assign({ at: v.at }, badges.def(id) || { id, name: id, desc: '' })).sort((a, b) => b.at - a.at);
    },
  });

  // ------------------------------------------------------------ achievements

  const helpers = () => ({ inventory: BF.inventory });

  const achievements = (BF.achievements = {
    /** [current, target] for an achievement. */
    progress(id) {
      const def = BF.ACHIEVEMENT_MAP[id];
      const s = BF.store.state;
      if (!def || !s) return [0, 1];
      try {
        return def.check(s, helpers());
      } catch (e) {
        return [0, 1];
      }
    },
    unlocked(id) {
      const s = BF.store.state;
      return !!(s && s.achievements[id]);
    },

    /** Unlock (idempotent) and pay out the reward. */
    unlock(id) {
      const def = BF.ACHIEVEMENT_MAP[id];
      if (!def || achievements.unlocked(id)) return false;
      BF.store.update('achievements', (s) => { s.achievements[id] = { at: BF.clock.now() }; });
      if (def.reward.coins) BF.economy.earn(def.reward.coins, 'Achievement unlocked: ' + def.name, 'achievement');
      if (def.reward.xp) BF.progression.addXP(def.reward.xp, 'achievement');
      BF.notify.push({ type: 'achievement', title: 'Achievement unlocked: ' + def.name, body: def.desc + (def.reward.coins ? ' +' + U.fmt(def.reward.coins) + ' ForgeCoins' : ''), icon: def.icon, route: '#/achievements', silent: true });
      BF.bus.emit('achievement:unlocked', { def });
      return true;
    },

    /** Check every locked achievement and platform badge. */
    evaluate() {
      const s = BF.store.state;
      if (!s) return;
      for (const def of BF.ACHIEVEMENTS) {
        if (s.achievements[def.id]) continue;
        const [cur, target] = achievements.progress(def.id);
        if (cur >= target) achievements.unlock(def.id);
      }
      if (s.player.level >= 10) badges.award('pb_veteran');
      if (s.player.stats.gamesPublished > 0) badges.award('pb_creator');
      if (s.social.friends.length >= 10) badges.award('pb_social');
      if (Object.keys(s.inventory).some((id) => BF.ITEMS[id] && BF.RARITY[BF.ITEMS[id].rarity].rank >= 4)) badges.award('pb_collector');
    },

    /** List for the achievements page. */
    list() {
      const s = BF.store.state;
      return BF.ACHIEVEMENTS.map((def) => {
        const un = s.achievements[def.id];
        const [cur, target] = achievements.progress(def.id);
        const hidden = def.secret && !un;
        return {
          def,
          unlocked: !!un,
          at: un ? un.at : 0,
          current: Math.min(cur, target),
          target,
          name: hidden ? def.hiddenName : def.name,
          desc: hidden ? def.hiddenDesc : def.desc,
          hidden,
        };
      });
    },
  });

  let evalTimer = null;
  BF.achievements.scheduleEvaluate = () => {
    clearTimeout(evalTimer);
    evalTimer = setTimeout(() => achievements.evaluate(), 60);
  };
})((window.BF = window.BF || {}));
