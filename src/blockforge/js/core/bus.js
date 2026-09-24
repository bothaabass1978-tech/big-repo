/**
 * BlockForge — event bus and clock.
 * Systems never touch the DOM; they emit events here and the UI listens.
 */
(function (BF) {
  'use strict';

  const listeners = new Map();

  /**
   * Global publish/subscribe bus.
   * @example const off = BF.bus.on('wallet:changed', fn); off();
   */
  BF.bus = {
    /** Subscribe; returns an unsubscribe function. */
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt).add(fn);
      return () => BF.bus.off(evt, fn);
    },
    off(evt, fn) {
      const set = listeners.get(evt);
      if (set) set.delete(fn);
    },
    once(evt, fn) {
      const off = BF.bus.on(evt, (p) => {
        off();
        fn(p);
      });
      return off;
    },
    /** Emit synchronously; a throwing listener never breaks the others. */
    emit(evt, payload) {
      const set = listeners.get(evt);
      if (!set || !set.size) return;
      for (const fn of Array.from(set)) {
        try {
          fn(payload);
        } catch (e) {
          console.error('[BF.bus] listener for "' + evt + '" failed', e);
        }
      }
    },
    /** Remove every listener (used by tests and account switches). */
    reset() {
      listeners.clear();
    },
  };

  /**
   * Application clock. The developer panel can shift "today" forward so daily
   * rewards and quest rotation can be exercised without waiting a real day.
   */
  BF.clock = {
    offsetDays: 0,
    now() {
      return Date.now() + BF.clock.offsetDays * 86400000;
    },
    today() {
      return BF.util.dayKey(BF.clock.now());
    },
    week() {
      return BF.util.weekKey(BF.clock.now());
    },
  };
})((window.BF = window.BF || {}));
