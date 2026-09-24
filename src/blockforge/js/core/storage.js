/**
 * BlockForge — persistence adapter.
 * Wraps localStorage behind try/catch with an in-memory fallback so the app keeps
 * working in private windows or sandboxed frames where storage throws.
 */
(function (BF) {
  'use strict';

  const PREFIX = 'blockforge:v1:';
  const memory = new Map();
  let persistent = true;

  try {
    const probe = PREFIX + '__probe';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
  } catch (e) {
    persistent = false;
  }

  function rawGet(key) {
    if (persistent) {
      try {
        return window.localStorage.getItem(PREFIX + key);
      } catch (e) {
        /* fall back to memory */
      }
    }
    return memory.has(key) ? memory.get(key) : null;
  }

  BF.storage = {
    /** True when saves survive a page reload. */
    isPersistent: () => persistent,

    /** Read and JSON-parse a value; returns null when missing or corrupt. */
    get(key) {
      const raw = rawGet(key);
      if (raw == null) return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        console.warn('[BF.storage] corrupt value for', key);
        return null;
      }
    },

    /**
     * Serialize and write a value.
     * @returns {{ok:boolean, bytes:number, error?:string}}
     */
    set(key, value) {
      const raw = JSON.stringify(value);
      if (persistent) {
        try {
          window.localStorage.setItem(PREFIX + key, raw);
          memory.delete(key);
          return { ok: true, bytes: raw.length };
        } catch (e) {
          memory.set(key, raw);
          const quota = e && (e.name === 'QuotaExceededError' || e.code === 22);
          return { ok: false, bytes: raw.length, error: quota ? 'quota' : 'unavailable' };
        }
      }
      memory.set(key, raw);
      return { ok: true, bytes: raw.length, memoryOnly: true };
    },

    remove(key) {
      memory.delete(key);
      if (persistent) {
        try {
          window.localStorage.removeItem(PREFIX + key);
        } catch (e) {
          /* ignore */
        }
      }
    },

    /** All BlockForge keys (without prefix). */
    keys() {
      const out = new Set(memory.keys());
      if (persistent) {
        try {
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (k && k.indexOf(PREFIX) === 0) out.add(k.slice(PREFIX.length));
          }
        } catch (e) {
          /* ignore */
        }
      }
      return Array.from(out);
    },

    /** Wipe every BlockForge key on this device. */
    clearAll() {
      for (const k of BF.storage.keys()) BF.storage.remove(k);
      memory.clear();
    },

    /** Approximate bytes used by BlockForge data. */
    usage() {
      let total = 0;
      for (const k of BF.storage.keys()) {
        const raw = rawGet(k);
        if (raw) total += raw.length + k.length;
      }
      return total;
    },
  };
})((window.BF = window.BF || {}));
