/**
 * BlockForge — performance: device tier, background-work pacing and the
 * in-game frame-rate governor, so BlockForge stays smooth on weak laptops.
 *
 *   BF.perf.tier()              'low' | 'normal' (hardware hints, then what we measure)
 *   BF.perf.lite()              true when page effects should be light
 *   BF.perf.idle(fn)            run background work when the page is idle and no game is on
 *   BF.perf.governor(world)     per-game governor: .frame(dtSeconds) adjusts resolution and shadows
 *
 * Levels (T.levels) trade sharpness for speed: 0 is full resolution with
 * shadows, 3 renders at 55% resolution without shadows. In Auto graphics the
 * governor steps down when the frame rate stays low and back up when there is
 * headroom, and remembers the level for next time on this device.
 * Story: BLOCKFORGE-018
 */
(function (BF) {
  'use strict';

  const T = {
    levels: [
      { scale: 1, shadows: true, name: 'Sharp' },
      { scale: 0.85, shadows: false, name: 'Balanced' },
      { scale: 0.7, shadows: false, name: 'Fast' },
      { scale: 0.55, shadows: false, name: 'Fastest' },
    ],
    downFps: 45, // below this for downSec, drop a level
    downSec: 1.5,
    upFps: 57, // above this for upSec, raise a level
    upSec: 8,
    warmupSec: 1.2, // ignore the first frames of a game (shader compiles, loading)
    lowStart: 2, // Low graphics starts here
    idleGapMs: 140, // at least this between background jobs
  };
  const KEY_LEVEL = 'bf.perf.level';
  const KEY_TIER = 'bf.perf.tier';

  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* no storage */ } }

  let tierCache = null;
  /** Rough device class from hardware hints; a measured slow game also marks it low. */
  function tier() {
    if (tierCache) return tierCache;
    const saved = read(KEY_TIER);
    if (saved === 'low' || saved === 'normal') return (tierCache = saved);
    let low = false;
    const nav = typeof navigator !== 'undefined' ? navigator : {};
    if (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) low = true;
    if (nav.deviceMemory && nav.deviceMemory <= 4) low = true;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      if (/swiftshader|llvmpipe|software|intel\(r\) (hd|uhd) graphics [0-9]{3}\b|mali-[gt][0-9]{2}\b|adreno \(tm\) [2-5]/i.test(gpu)) low = true;
      if (gl && gl.getExtension('WEBGL_lose_context')) gl.getExtension('WEBGL_lose_context').loseContext();
    } catch (e) { /* no WebGL */ }
    return (tierCache = low ? 'low' : 'normal');
  }

  /** The level the governor settled on last time (Auto graphics). */
  function learned() {
    const v = parseInt(read(KEY_LEVEL), 10);
    return v >= 0 && v < T.levels.length ? v : tier() === 'low' ? 1 : 0;
  }

  // ------------------------------------------------------------ background work

  const jobs = [];
  let running = false;
  function busy() {
    return (BF.runtime && BF.runtime.active) || (typeof document !== 'undefined' && document.hidden);
  }
  function pump() {
    if (!jobs.length) { running = false; return; }
    if (busy()) { setTimeout(pump, 1000); return; }
    const run = () => {
      if (busy()) { setTimeout(pump, 1000); return; }
      const job = jobs.shift();
      const t0 = performance.now();
      try { job(); } catch (e) { console.error(e); }
      // give the page at least as long as the job took before the next one
      const took = performance.now() - t0;
      setTimeout(pump, Math.max(T.idleGapMs, took * (tier() === 'low' ? 2 : 1)));
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 });
    else setTimeout(run, 50);
  }

  // ------------------------------------------------------------ governor

  /**
   * Frame-rate governor for one game session.
   * @param {object} world a g3d World (setLevel)
   * @returns {{frame(dt:number):void, level:number}}
   */
  function governor(world) {
    // the player's own choice (quality() turns Auto into High or Low by screen size)
    const st = BF.store && BF.store.state;
    const q = (st && st.settings.gameplay.graphics) || 'auto';
    const fixed = q === 'high' ? 0 : null;
    const g = {
      level: fixed != null ? fixed : q === 'low' ? Math.max(T.lowStart, learned()) : learned(),
      t: 0, slow: 0, fast: 0, ema: 60,
      frame(dt) {
        g.t += dt;
        if (g.t < T.warmupSec || !(dt > 0)) return;
        // frame rate smoothed over about half a second of real time, however slow the frames
        g.ema += (1 / Math.min(dt, 0.5) - g.ema) * (1 - Math.exp(-dt / 0.5));
        if (fixed != null) return;
        if (g.ema < T.downFps) { g.slow += dt; g.fast = 0; } else if (g.ema > T.upFps) { g.fast += dt; g.slow = 0; } else { g.slow = 0; g.fast = 0; }
        const min = q === 'low' ? T.lowStart : 0;
        if (g.slow > T.downSec && g.level < T.levels.length - 1) { g.set(g.level + 1); if (g.level >= 2 && tierCache !== 'low') { tierCache = 'low'; write(KEY_TIER, 'low'); } }
        else if (g.fast > T.upSec && g.level > min) g.set(g.level - 1);
      },
      set(l) {
        g.level = l; g.slow = 0; g.fast = 0; g.ema = 50;
        if (world && world.setLevel) world.setLevel(T.levels[l]);
        write(KEY_LEVEL, l);
        if (BF.bus) BF.bus.emit('perf:level', { level: l, name: T.levels[l].name });
      },
    };
    if (world && world.setLevel) world.setLevel(T.levels[g.level]);
    return g;
  }

  BF.perf = {
    T,
    tier,
    learned,
    /** Light page effects: a low-end device, or reduced motion. */
    lite() {
      const s = BF.store && BF.store.state;
      return tier() === 'low' || !!(s && s.settings.appearance && s.settings.appearance.reduceMotion);
    },
    /** Queue background work (thumbnails): runs when idle, never during a game. */
    idle(fn) {
      jobs.push(fn);
      if (!running) { running = true; setTimeout(pump, 0); }
    },
    /** Jobs still waiting. */
    pending() { return jobs.length; },
    governor,
    /** Forget what we learned about this device (Settings → Graphics changes). */
    reset() { tierCache = null; try { localStorage.removeItem(KEY_LEVEL); localStorage.removeItem(KEY_TIER); } catch (e) { /* no storage */ } },
  };
})((window.BF = window.BF || {}));
