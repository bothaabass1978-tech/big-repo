/**
 * Test harness: loads BlockForge's classic browser scripts into an isolated
 * Node `vm` context with an in-memory localStorage, so platform systems
 * (economy, quests, achievements, persistence ...) can be unit tested
 * without a browser.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../../../src/blockforge');

/** Scripts needed for headless system tests, in index.html order. */
const SYSTEM_SCRIPTS = [
  'js/core/util.js', 'js/core/bus.js', 'js/core/storage.js', 'js/core/sfx.js', 'js/core/icons.js',
  'js/data/items.js', 'js/data/games.js', 'js/data/progression.js', 'js/data/bots.js', 'js/data/thumbs.js',
  'js/core/store.js',
  'js/systems/bots.js', 'js/systems/avatar.js', 'js/systems/economy.js', 'js/systems/meta.js',
  'js/systems/inventory.js', 'js/systems/social.js', 'js/systems/world.js', 'js/systems/creator.js', 'js/systems/secrets.js',
  'js/systems/chat.js', 'js/systems/ai.js',
];

function memoryStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    key: (i) => Array.from(map.keys())[i] || null,
    get length() { return map.size; },
    clear: () => map.clear(),
    _map: map,
  };
}

/**
 * Create a fresh BlockForge sandbox.
 * @param {{storage?:object}} [opts] pass a previous sandbox's storage to test persistence
 * @returns {{BF:object, ctx:object, storage:object, timers:object}}
 */
function createSandbox(opts) {
  opts = opts || {};
  const storage = opts.storage || memoryStorage();
  const timers = [];
  const ctx = {
    console,
    localStorage: storage,
    queueMicrotask,
    setTimeout: (fn, ms) => { const t = { fn, ms, cancelled: false }; timers.push(t); return t; },
    clearTimeout: (t) => { if (t) t.cancelled = true; },
    setInterval: () => 0,
    clearInterval: () => {},
    performance: { now: () => Date.now() },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    Buffer,
    navigator: {},
    matchMedia: () => ({ matches: false }),
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const rel of SYSTEM_SCRIPTS) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, ctx, { filename: rel });
  }
  /** Run (and clear) every pending timer callback once. */
  const flushTimers = () => {
    const run = timers.splice(0, timers.length);
    run.forEach((t) => { if (!t.cancelled) t.fn(); });
  };
  return { BF: ctx.BF, ctx, storage, timers: { list: timers, flush: flushTimers } };
}

/** Wait for queued microtasks (store change batching). */
const tick = () => new Promise((r) => setImmediate(r));

/**
 * Boot the default ForgePlayer account and sign in.
 * @returns the sandbox with BF.store loaded and the world initialised
 */
function bootDefault(opts) {
  const sb = createSandbox(opts);
  const { BF } = sb;
  BF.accounts.ensureDefault();
  const acc = BF.accounts.list()[0];
  BF.accounts.signIn(acc.id);
  BF.store.load(acc.id);
  BF.world.init();
  BF.world.stop();
  BF.quests.ensure();
  return sb;
}

module.exports = { createSandbox, bootDefault, memoryStorage, tick, ROOT, SYSTEM_SCRIPTS };
