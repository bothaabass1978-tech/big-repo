/**
 * BlockForge — ForgeCoin economy (ledger), XP/levels and daily login rewards.
 * Every balance change goes through earn()/spend() so the ledger is complete.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const MAX_TX = 400;
  const MAX_BAL = Number.MAX_SAFE_INTEGER;

  function record(s, amount, desc, cat) {
    const tx = { id: U.uid('tx'), ts: BF.clock.now(), amount, balance: s.wallet.balance, desc, cat };
    s.transactions.push(tx);
    if (s.transactions.length > MAX_TX) s.transactions.splice(0, s.transactions.length - MAX_TX);
    return tx;
  }

  const economy = (BF.economy = {
    /** Current ForgeCoin balance. */
    balance() {
      return BF.store.state ? BF.store.state.wallet.balance : 0;
    },

    canAfford(amount) {
      return economy.balance() >= amount;
    },

    /**
     * Credit ForgeCoins and write a ledger entry.
     * @param {number} amount positive integer
     * @param {string} desc ledger description, e.g. "Completed Daily Challenge"
     * @param {string} cat daily|game|quest|achievement|level|sale|creator|forgecore|debug|gift
     * @returns {object|null} the transaction
     */
    earn(amount, desc, cat) {
      amount = Math.floor(Number(amount));
      if (!(amount > 0) || !BF.store.state) return null;
      let tx = null;
      BF.store.update(['wallet', 'transactions'], (s) => {
        const next = Math.min(MAX_BAL, s.wallet.balance + amount);
        const actual = next - s.wallet.balance;
        if (actual <= 0) return;
        s.wallet.balance = next;
        s.wallet.lifetimeEarned = Math.min(MAX_BAL, s.wallet.lifetimeEarned + actual);
        s.wallet.highestBalance = Math.max(s.wallet.highestBalance || 0, next);
        tx = record(s, actual, desc, cat || 'earn');
      });
      if (!tx) return null;
      BF.bus.emit('wallet:changed', { delta: tx.amount, tx });
      if (cat !== 'forgecore' && cat !== 'debug' && BF.quests) BF.quests.track('coins_earned', tx.amount);
      return tx;
    },

    /**
     * Debit ForgeCoins. Fails without side effects when the balance is too low.
     * @returns {{ok:boolean, reason?:string, need?:number, tx?:object}}
     */
    spend(amount, desc, cat) {
      amount = Math.floor(Number(amount));
      if (!(amount >= 0) || !BF.store.state) return { ok: false, reason: 'invalid' };
      const bal = economy.balance();
      if (bal < amount) {
        BF.bus.emit('wallet:insufficient', { amount, balance: bal });
        return { ok: false, reason: 'insufficient', need: amount - bal };
      }
      if (amount === 0) return { ok: true, tx: null };
      let tx = null;
      BF.store.update(['wallet', 'transactions'], (s) => {
        s.wallet.balance -= amount;
        s.wallet.lifetimeSpent += amount;
        tx = record(s, -amount, desc, cat || 'purchase');
      });
      BF.bus.emit('wallet:changed', { delta: -amount, tx });
      return { ok: true, tx };
    },

    /** Ledger entries, newest first, optional filter by 'in' / 'out' / category. */
    history(filter) {
      const list = (BF.store.state ? BF.store.state.transactions : []).slice().reverse();
      if (!filter || filter === 'all') return list;
      if (filter === 'in') return list.filter((t) => t.amount > 0);
      if (filter === 'out') return list.filter((t) => t.amount < 0);
      return list.filter((t) => t.cat === filter);
    },
  });

  // ------------------------------------------------------------- progression

  BF.progression = {
    /** XP needed to reach the next level from `level`. */
    xpNeeded(level) {
      return BF.xpForLevel(level);
    },

    /**
     * Grant XP, rolling over into as many level-ups as it covers.
     * Each level-up pays BF.levelReward(level) ForgeCoins.
     */
    addXP(amount, source) {
      amount = Math.floor(Number(amount));
      if (!(amount > 0) || !BF.store.state) return [];
      const gained = [];
      BF.store.update('player', (s) => {
        s.player.xp += amount;
        let guard = 0;
        while (s.player.xp >= BF.xpForLevel(s.player.level) && guard++ < 500) {
          s.player.xp -= BF.xpForLevel(s.player.level);
          s.player.level += 1;
          gained.push(s.player.level);
        }
      });
      BF.bus.emit('xp:gain', { amount, source });
      for (const lvl of gained) {
        const reward = BF.levelReward(lvl);
        economy.earn(reward, 'Reached level ' + lvl, 'level');
        BF.notify.push({ type: 'level', title: 'Level up! You reached level ' + lvl, body: '+' + U.fmt(reward) + ' ForgeCoins level reward.', icon: 'star', route: '#/profile' });
        BF.bus.emit('levelup', { level: lvl, reward });
      }
      if (gained.length && BF.store.state.player.level >= 10) BF.badges.award('pb_veteran');
      return gained;
    },

    /** Developer panel: jump straight to a level (keeps XP within range). */
    setLevel(level) {
      level = U.clamp(Math.floor(level) || 1, 1, 999);
      BF.store.update('player', (s) => {
        s.player.level = level;
        s.player.xp = Math.min(s.player.xp, BF.xpForLevel(level) - 1);
      });
      BF.bus.emit('levelup', { level, reward: 0, silent: true });
    },

    /** Fraction of the way to the next level. */
    ratio() {
      const p = BF.store.state.player;
      return U.clamp(p.xp / BF.xpForLevel(p.level), 0, 1);
    },
  };

  // ------------------------------------------------------------ daily reward

  BF.daily = {
    /**
     * Streak status for today.
     * @returns {{canClaim:boolean, claimedToday:boolean, streak:number, nextDay:number, nextAmount:number, currentIndex:number}}
     */
    status() {
      const d = BF.store.state.daily;
      const today = BF.clock.today();
      const claimedToday = d.lastClaimDay === today;
      const diff = d.lastClaimDay ? U.dayDiff(d.lastClaimDay, today) : null;
      const alive = claimedToday || diff === 1;
      const streakIfClaim = claimedToday ? d.streak : alive ? d.streak + 1 : 1;
      const idx = (streakIfClaim - 1) % 7;
      return {
        canClaim: !claimedToday,
        claimedToday,
        streak: alive ? d.streak : 0,
        nextDay: idx + 1,
        nextAmount: BF.DAILY_REWARDS[idx],
        currentIndex: idx,
        totalClaims: d.totalClaims,
      };
    },

    /** Claim today's reward (once per calendar day). */
    claim() {
      const st = BF.daily.status();
      if (!st.canClaim) return { ok: false, reason: 'claimed' };
      const today = BF.clock.today();
      let streak = 0;
      BF.store.update('daily', (s) => {
        const d = s.daily;
        const diff = d.lastClaimDay ? U.dayDiff(d.lastClaimDay, today) : null;
        d.streak = diff === 1 ? d.streak + 1 : 1;
        d.bestStreak = Math.max(d.bestStreak || 0, d.streak);
        d.lastClaimDay = today;
        d.totalClaims = (d.totalClaims || 0) + 1;
        streak = d.streak;
      });
      const day = ((streak - 1) % 7) + 1;
      const amount = BF.DAILY_REWARDS[day - 1];
      economy.earn(amount, 'Daily reward (day ' + day + ')', 'daily');
      BF.progression.addXP(25 + day * 10, 'daily');
      BF.notify.push({ type: 'daily', title: 'Daily reward claimed', body: 'Day ' + day + ' streak: +' + U.fmt(amount) + ' ForgeCoins. Come back tomorrow for more.', icon: 'gift', route: '#/wallet', silent: true });
      BF.quests.track('daily_claim', 1);
      BF.bus.emit('daily:claimed', { day, amount, streak });
      return { ok: true, day, amount, streak };
    },
  };
})((window.BF = window.BF || {}));
