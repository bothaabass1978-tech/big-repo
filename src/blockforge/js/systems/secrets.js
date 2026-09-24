/**
 * BlockForge — core maintenance hooks (internal).
 * Intentionally terse. Nothing in the normal UI points here.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  // Sleeping halls: [game, position, glyph-code]
  const HALLS = [['block-battlegrounds', 1, 69], ['sky-obby', 2, 77], ['dungeon-frontier', 3, 66], ['pet-world', 4, 69], ['skyline-racers', 5, 82]];
  const WORD = 'UkVCTUU='; // stored reversed + encoded

  function decode() {
    try {
      return (typeof atob === 'function' ? atob(WORD) : Buffer.from(WORD, 'base64').toString('binary')).split('').reverse().join('');
    } catch (e) {
      return '';
    }
  }

  const core = (BF.secrets = {
    RUNES: ['◆', '▲', '●', '■'],

    /** A dormant server entry for some game lists, or null. */
    sleeper(gameId) {
      const h = HALLS.find((x) => x[0] === gameId);
      return h ? { id: '0000', index: h[1], of: HALLS.length, glyph: String.fromCharCode(h[2]) } : null;
    },

    /** Does the spoken word wake the furnace? */
    checkWord(word) {
      return String(word || '').trim().toUpperCase() === decode();
    },

    state() {
      const s = BF.store.state;
      return s ? s.secrets.forgecore : { unlocked: false };
    },

    isUnlocked() {
      return !!core.state().unlocked;
    },

    /** Remember that the furnace has been lit (persists). */
    markLit() {
      BF.store.update('secrets', (s) => { s.secrets.forgecore.wordSolved = true; });
    },

    /** A fresh hammer rhythm for the anvil. */
    sequence(len) {
      const out = [];
      for (let i = 0; i < (len || 6); i++) {
        let v;
        do v = U.randInt(0, 3); while (out.length && v === out[out.length - 1] && Math.random() < 0.7);
        out.push(v);
      }
      return out;
    },

    /** First awakening: badge, achievement and persistence. */
    unlock() {
      if (core.isUnlocked()) return false;
      BF.store.update('secrets', (s) => {
        s.secrets.forgecore.unlocked = true;
        s.secrets.forgecore.wordSolved = true;
        s.secrets.forgecore.at = BF.clock.now();
      });
      BF.badges.award('forgecore_unlocked');
      BF.achievements.unlock('forgecore');
      BF.bus.emit('forgecore:unlocked');
      return true;
    },

    /**
     * Execute a grant from the terminal.
     * @param {string|number} input any positive whole number (commas allowed)
     * @returns {{ok:boolean, error?:string, amount?:number, balance?:number}}
     */
    execute(input) {
      if (!core.isUnlocked()) return { ok: false, error: 'CORE OFFLINE' };
      const amount = U.parseAmount(input);
      if (!(amount > 0)) return { ok: false, error: 'INVALID AMOUNT. ENTER A WHOLE NUMBER GREATER THAN 0.' };
      const room = Number.MAX_SAFE_INTEGER - BF.economy.balance();
      if (amount > room) return { ok: false, error: 'AMOUNT EXCEEDS CORE CAPACITY. MAXIMUM RIGHT NOW: ' + U.fmt(room) + '.' };
      const tx = BF.economy.earn(amount, 'FORGECORE', 'forgecore');
      if (!tx) return { ok: false, error: 'TRANSACTION REJECTED' };
      BF.store.update('secrets', (s) => {
        s.secrets.forgecore.uses = (s.secrets.forgecore.uses || 0) + 1;
        s.secrets.forgecore.total = Math.min(Number.MAX_SAFE_INTEGER, (s.secrets.forgecore.total || 0) + amount);
      });
      return { ok: true, amount, balance: BF.economy.balance() };
    },
  });
})((window.BF = window.BF || {}));
