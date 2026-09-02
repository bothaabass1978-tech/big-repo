// ---------------------------------------------------------------------------
// 05_audio.js — Z.Audio. Every sound in Nacht der Untoten, synthesized from
// scratch with WebAudio. Zero sample assets, zero base64, zero network.
//
// Signal flow
//   recipe graph ──► occlusion/air LP ──► voice gain ──┬─► [panner] ──► bus gain
//                                                      │                  │
//                                                      └─► reverb send ──►│
//                                                                         ▼
//                                          bus duck ──► master ──► limiter ──► out
//
// Heavy one-shots are pre-rendered once at init() through an OfflineAudioContext
// and cached as AudioBuffers (several randomized variants each), so firing a
// Thompson at 700 RPM costs one BufferSource instead of a 20-node graph. Cheap
// or parameter-driven sounds (drones, wind, the dread bed) stay live.
// Every recipe is renderable both offline (bake) and online (fallback), so the
// game is never silent while the oven is still warm.
// ---------------------------------------------------------------------------
(function () {
  const A = {};
  Z.Audio = A;

  // ===========================================================================
  // 0 — configuration
  // ===========================================================================
  const VOICE_CAP   = 48;     // hard ceiling on simultaneous voices
  const REF_DIST    = 4.0;    // metres — panner refDistance
  const ROLLOFF     = 0.72;   // inverse rolloff (moan still audible at ~20 m)
  const MAX_DIST    = 70.0;
  const AIR_HALF    = 9.0;    // metres per halving of air-absorption cutoff
  const OCCL_LP     = 380;    // fully occluded cutoff (Hz)
  const IR_SECONDS  = 1.15;   // small wooden building, dark tail
  const BAKE_CHUNK  = 12;     // offline contexts rendered concurrently

  A.ready = false;            // graph is up
  A.ok    = true;             // false once WebAudio is known to be unusable
  A.NAMES = [];               // filled at the bottom of this file

  let ctx = null;
  let master = null, limiter = null;
  let revIn = null, revConv = null, revOut = null;
  const buses = Object.create(null);      // name -> {gain, duck, vol}
  const voices = [];
  let voiceSeq = 0;
  const cache = Object.create(null);      // name -> [AudioBuffer, ...]
  let bakePromise = null;
  let bakedNames = 0;

  const lis = { p: [0, 0, 0], f: [0, 0, -1], u: [0, 1, 0] };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const TAU = Math.PI * 2;

  // ===========================================================================
  // 1 — tiny deterministic RNG (uses Z.RNG when present, own fallback if not)
  // ===========================================================================
  function Rnd(seed) { this.s = (seed >>> 0) || 0x9e3779b9; this.u(); this.u(); }
  Rnd.prototype.u = function () {
    let s = this.s;
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    this.s = s; return s;
  };
  Rnd.prototype.f = function () { return this.u() / 4294967296; };
  Rnd.prototype.i = function (n) { return this.u() % n; };
  Rnd.prototype.range = function (a, b) { return a + (b - a) * this.f(); };
  Rnd.prototype.sym = function (a) { return (this.f() * 2 - 1) * a; };
  Rnd.prototype.pick = function (a) { return a[this.u() % a.length]; };
  Rnd.prototype.gauss = function () { return (this.f() + this.f() + this.f() - 1.5) * 1.1547; };

  function mkRnd(seed) {
    if (Z.RNG && Z.RNG.make) { try { return Z.RNG.make(seed); } catch (e) { /* fall through */ } }
    return new Rnd(seed);
  }
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  // ===========================================================================
  // 2 — node + envelope helpers (all work on any BaseAudioContext)
  // ===========================================================================
  const MIN = 1e-4;   // exponential ramps may never touch zero

  function gain(c, v) { const g = c.createGain(); g.gain.value = (v === undefined ? 1 : v); return g; }
  function osc(c, type, f) { const o = c.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  function filt(c, type, f, q, db) {
    const b = c.createBiquadFilter();
    b.type = type; b.frequency.value = f;
    if (q !== undefined) b.Q.value = q;
    if (db !== undefined) b.gain.value = db;
    return b;
  }
  function delay(c, t, max) { const d = c.createDelay(max || 1.0); d.delayTime.value = t; return d; }

  // --- white noise buffers, cached per context ------------------------------
  const noiseCache = (typeof WeakMap === 'function') ? new WeakMap() : null;
  function noiseBuf(c, dur, seed) {
    dur = Math.max(0.01, dur);
    const key = (Math.round(dur * 50) * 4096) + ((seed | 0) & 4095);
    let m = null;
    if (noiseCache) { m = noiseCache.get(c); if (!m) { m = new Map(); noiseCache.set(c, m); } }
    if (m) { const hit = m.get(key); if (hit) return hit; }
    const n = Math.max(2, Math.ceil(dur * c.sampleRate));
    const b = c.createBuffer(1, n, c.sampleRate);
    const d = b.getChannelData(0);
    const r = new Rnd(0x51ee + key);
    for (let i = 0; i < n; i++) d[i] = r.f() * 2 - 1;
    if (m) m.set(key, b);
    return b;
  }
  function nsrc(c, dur, seed, loop) {
    const s = c.createBufferSource();
    s.buffer = noiseBuf(c, dur, seed);
    if (loop) s.loop = true;
    return s;
  }

  // --- waveshaper curves, cached --------------------------------------------
  const curveCache = new Map();
  function shaperCurve(k) {
    const key = Math.round(k * 8);
    let cv = curveCache.get(key);
    if (cv) return cv;
    const n = 2048;
    cv = new Float32Array(n);
    const kk = Math.max(0.05, key / 8);
    const norm = Math.tanh(kk) || 1;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      cv[i] = Math.tanh(kk * x) / norm;
    }
    curveCache.set(key, cv);
    return cv;
  }
  function shaper(c, k) {
    const w = c.createWaveShaper();
    w.curve = shaperCurve(k);
    w.oversample = '2x';
    return w;
  }

  // --- envelopes ------------------------------------------------------------
  // Percussive attack/decay on a gain param. Exponential = natural.
  function ad(p, t0, atk, dec, peak) {
    atk = Math.max(atk, 0.0004);
    peak = Math.max(peak, MIN * 4);
    p.setValueAtTime(MIN, t0);
    p.exponentialRampToValueAtTime(peak, t0 + atk);
    p.exponentialRampToValueAtTime(MIN, t0 + atk + Math.max(dec, 0.002));
  }
  // Attack / hold / release with a flat sustain — for moans and drones.
  function ahr(p, t0, atk, hold, rel, peak) {
    peak = Math.max(peak, MIN * 4);
    p.setValueAtTime(MIN, t0);
    p.exponentialRampToValueAtTime(peak, t0 + Math.max(atk, 0.001));
    p.setValueAtTime(peak, t0 + Math.max(atk, 0.001) + hold);
    p.exponentialRampToValueAtTime(MIN, t0 + Math.max(atk, 0.001) + hold + Math.max(rel, 0.005));
  }
  // Reversed envelope — silence swelling into a hit. The backwards-tape trick.
  function swell(p, t0, dur, peak, cut) {
    p.setValueAtTime(MIN, t0);
    p.exponentialRampToValueAtTime(Math.max(peak, MIN * 4), t0 + dur);
    p.exponentialRampToValueAtTime(MIN, t0 + dur + (cut === undefined ? 0.05 : cut));
  }
  function sweep(p, t0, f0, f1, dur, expo) {
    p.setValueAtTime(Math.max(f0, 0.01), t0);
    if (expo === false) p.linearRampToValueAtTime(Math.max(f1, 0.01), t0 + dur);
    else p.exponentialRampToValueAtTime(Math.max(f1, 0.01), t0 + dur);
  }
  function go(node, t0, t1) { try { node.start(t0); if (t1 !== undefined) node.stop(t1); } catch (e) { /* already started */ } }

  // Irregular organic amplitude/pitch curve. Returns a Float32Array for
  // setValueCurveAtTime — the cheapest way to get "alive" instead of "synth".
  function organicCurve(n, base, wobbleHz, wobbleAmt, jitter, dur, r, shape) {
    const a = new Float32Array(n);
    const ph = r.f() * TAU, ph2 = r.f() * TAU;
    let drift = 0;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      drift += r.sym(jitter) * 0.5;
      drift *= 0.86;                                   // brownian, bounded
      const w = Math.sin(ph + t * TAU * wobbleHz * dur) * wobbleAmt
              + Math.sin(ph2 + t * TAU * wobbleHz * 2.7 * dur) * wobbleAmt * 0.35;
      const s = shape ? shape(t) : 1;
      a[i] = Math.max(MIN, base * (1 + w + drift) * s);
    }
    return a;
  }

  // ===========================================================================
  // 3 — the room. One shared convolution reverb built from a synthesized IR:
  //     noise x exponential decay, low-passed progressively (dark), with a few
  //     discrete early reflections so the small wooden box is audible.
  // ===========================================================================
  function makeIR(c, seconds, seed) {
    const sr = c.sampleRate;
    const n = Math.max(64, Math.floor(sr * seconds));
    const b = c.createBuffer(2, n, sr);
    const r = new Rnd(seed || 0xBEEF11);
    // early reflection taps (metres -> seconds), wooden room ~7 x 5 x 3.4 m
    const taps = [
      [0.0071, 0.55], [0.0113, -0.42], [0.0166, 0.34], [0.0209, 0.30],
      [0.0281, -0.24], [0.0347, 0.20], [0.0432, 0.16], [0.0561, -0.12],
    ];
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      const skew = ch ? 1.041 : 0.963;             // decorrelate the two ears
      let lp1 = 0, lp2 = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        // dense diffuse tail: exponential decay, steeper at the very start
        const env = Math.pow(1 - t, 2.6) * (1 - Math.exp(-i / (sr * 0.006)));
        let v = (r.f() * 2 - 1) * env;
        // two cascaded one-poles that close as the tail ages => dark decay
        const k = 0.34 - 0.26 * t;
        lp1 += k * (v - lp1);
        lp2 += k * (lp1 - lp2);
        d[i] = lp2 * 1.9;
      }
      for (let k = 0; k < taps.length; k++) {
        const idx = Math.floor(taps[k][0] * skew * sr);
        if (idx < n) d[idx] += taps[k][1] * (ch ? -1 : 1) * 0.5;
      }
      // gentle DC removal
      let acc = 0;
      for (let i = 0; i < n; i++) { acc = acc * 0.999 + d[i] * 0.001; d[i] -= acc; }
    }
    return b;
  }

  // ===========================================================================
  // 4 — recipe building blocks
  //
  // Every recipe has the signature build(c, out, t0, r, ctl):
  //   c    BaseAudioContext (online or offline — recipes must not care)
  //   out  AudioNode to write the DRY signal into
  //   t0   start time in c's clock
  //   r    seeded RNG (per variant when baking, per shot when live)
  //   ctl  voice controller: ctl.reg(node) registers a source for stop/cleanup,
  //        ctl.param(name, fn) exposes a live parameter to handle.set()
  // ===========================================================================

  function Ctl() { this.nodes = []; this.setters = null; }
  Ctl.prototype.reg = function (n) { this.nodes.push(n); return n; };
  Ctl.prototype.param = function (name, fn) {
    if (!this.setters) this.setters = Object.create(null);
    this.setters[name] = fn;
  };

  // --- gunshot -------------------------------------------------------------
  // Real gun design in three acts:
  //   1. transient — 1-3 ms of very bright filtered noise (the "click" of the
  //      muzzle blast wavefront). This is what makes a shot sound close.
  //   2. body      — fast-decaying resonant bands, pitched per weapon, each
  //      sweeping downward slightly as the gas ball expands.
  //   3. tail      — the room: a slap-back plus a dark decaying noise cloud.
  //      (The long convolution tail is added live on the reverb bus.)
  function gunshot(c, out, t0, p, r) {
    const mst = gain(c, p.lvl === undefined ? 0.8 : p.lvl);
    if (p.dist) { const w = shaper(c, p.dist); const pre = gain(c, p.preDist || 1.0); pre.connect(w); w.connect(mst); var inp = pre; }
    else var inp = mst;
    mst.connect(out);

    // (1) transient click
    {
      const s = nsrc(c, 0.03, 7 + r.i(400));
      const hp = filt(c, 'highpass', p.clickHp || 2600, 0.7);
      const bp = filt(c, 'bandpass', (p.clickF || 5400) * r.range(0.93, 1.07), 1.1);
      const g = gain(c, 0);
      s.connect(hp); hp.connect(bp); bp.connect(g); g.connect(inp);
      ad(g.gain, t0, 0.0005, p.clickDec || 0.0035, p.clickAmt === undefined ? 0.85 : p.clickAmt);
      go(s, t0, t0 + 0.04);
    }

    // (2) resonant body bands — FIX: a driven resonant bandpass (Q 3-6) takes
    // several cycles to build to full amplitude no matter how fast the *gain
    // downstream of it* opens, because the filter itself was being fed
    // continuous noise for its whole lifetime. Measured: 9.8-12.2 ms average
    // time-to-peak across the roster, 31-34 ms on the Kar98k/BAR specifically
    // — both guns' loudest band is simultaneously their lowest frequency and
    // highest Q, i.e. the slowest possible to ring up — and by the time it
    // finally did, its resonant overshoot out-peaked the transient click
    // layer entirely, so the buffer's true peak landed tens of ms in instead
    // of at the click. Exciting the filter with a hard, brief hit instead of
    // a sustained tone makes it ring the way a struck resonance actually
    // does — down from an instant peak — instead of ringing up to one.
    for (let i = 0; i < p.body.length; i++) {
      const b = p.body[i];
      const s = nsrc(c, b.dec + 0.08, 90 + i * 13 + r.i(400));
      const f = filt(c, 'bandpass', b.f, b.q === undefined ? 5 : b.q);
      sweep(f.frequency, t0, b.f * (b.up === undefined ? 1.55 : b.up) * r.range(0.97, 1.03),
            b.f * (b.down === undefined ? 0.72 : b.down), b.dec);
      const eg = gain(c, 0);
      s.connect(eg); eg.connect(f);
      ad(eg.gain, t0 + (b.pre || 0), 0.0003, Math.min(0.006, Math.max(0.002, b.dec * 0.25)), 1.0);
      const g = gain(c, 0);
      f.connect(g); g.connect(inp);
      ad(g.gain, t0 + (b.pre || 0), 0.0004, b.dec, b.amt * r.range(0.93, 1.07));
      go(s, t0, t0 + b.dec + (b.pre || 0) + 0.1);
    }

    // (2b) tonal low thump — the punch you feel rather than hear
    if (p.thump) {
      const th = p.thump;
      const o = osc(c, th.type || 'sine', th.f0);
      sweep(o.frequency, t0, th.f0 * r.range(0.96, 1.04), th.f1, th.dec * 0.85);
      const g = gain(c, 0);
      o.connect(g); g.connect(inp);
      ad(g.gain, t0, th.atk || 0.0022, th.dec, th.amt);
      go(o, t0, t0 + th.dec + 0.08);
    }

    // (3) room tail — slap-back off the wooden walls
    if (p.tail) {
      const tl = p.tail;
      const s = nsrc(c, tl.dec + 0.12, 300 + r.i(400));
      const lp = filt(c, 'lowpass', tl.lp, 0.8);
      const hp = filt(c, 'highpass', tl.hp || 120, 0.6);
      const g = gain(c, 0);
      const dl = delay(c, tl.pre === undefined ? 0.014 : tl.pre, 0.3);
      s.connect(lp); lp.connect(hp); hp.connect(g); g.connect(dl); dl.connect(mst);
      ad(g.gain, t0, 0.006, tl.dec, tl.amt);
      sweep(lp.frequency, t0, tl.lp * 1.7, tl.lp * 0.45, tl.dec);
      go(s, t0, t0 + tl.dec + 0.2);
    }

    // (4) mechanical action clack (bolt/blowback), always slightly late
    if (p.mech) {
      const m = p.mech;
      const s = nsrc(c, 0.05, 700 + r.i(400));
      const bp = filt(c, 'bandpass', m.f || 2400, 3);
      const g = gain(c, 0);
      s.connect(bp); bp.connect(g); g.connect(mst);
      ad(g.gain, t0 + m.t, 0.0008, m.dec || 0.02, m.amt);
      go(s, t0 + m.t, t0 + m.t + 0.08);
    }
  }

  // --- mechanical click (reload components, UI ticks, teeth) ----------------
  // A click is a wideband transient plus one or two struck metal resonances.
  function clack(c, out, t0, p, r) {
    const mst = gain(c, p.lvl === undefined ? 0.6 : p.lvl);
    mst.connect(out);
    const s = nsrc(c, 0.06, 40 + r.i(500));
    const hp = filt(c, 'highpass', p.hp || 900, 0.7);
    const lp = filt(c, 'lowpass', (p.lp || 7000) * r.range(0.9, 1.1), 0.8);
    const g = gain(c, 0);
    s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(mst);
    ad(g.gain, t0, 0.0006, p.dec || 0.014, p.amt === undefined ? 0.8 : p.amt);
    go(s, t0, t0 + (p.dec || 0.014) + 0.06);
    const rings = p.ring || [];
    for (let i = 0; i < rings.length; i++) {
      const rr = rings[i];
      const o = osc(c, 'triangle', rr[0] * r.range(0.985, 1.015));
      const gg = gain(c, 0);
      o.connect(gg); gg.connect(mst);
      ad(gg.gain, t0, 0.0008, rr[1], rr[2]);
      go(o, t0, t0 + rr[1] + 0.05);
    }
    if (p.body) {
      // a dull wooden/plastic thud under the metal
      const o = osc(c, 'sine', p.body[0]);
      sweep(o.frequency, t0, p.body[0], p.body[0] * 0.45, p.body[1]);
      const gg = gain(c, 0);
      o.connect(gg); gg.connect(mst);
      ad(gg.gain, t0, 0.002, p.body[1], p.body[2]);
      go(o, t0, t0 + p.body[1] + 0.05);
    }
  }

  // --- vocal tract: glottal source through parallel formant bandpasses ------
  // This is the whole zombie. Pulse-ish source at 60-110 Hz, 3 formants for the
  // vowel, breath noise on top, slow pitch drift + irregular amplitude so it
  // never reads as an oscillator.
  function voxSource(c, o, t0, r) {
    // returns {node, oscs:[...]} — a raw glottal buzz with drift already applied
    const sum = gain(c, 1);
    const saw = osc(c, 'sawtooth', o.f0);
    const sq = osc(c, 'square', o.f0 * 0.5);
    const gsaw = gain(c, 0.85), gsq = gain(c, o.sub === undefined ? 0.3 : o.sub);
    saw.connect(gsaw); gsaw.connect(sum);
    sq.connect(gsq); gsq.connect(sum);

    const N = 96;
    const curve = organicCurve(N, o.f0, o.wobbleHz || 3.1, o.wobble || 0.045,
                               o.jitter || 0.012, o.dur, r,
                               (t) => 1 + (o.bend || 0) * t);
    const half = new Float32Array(N);
    for (let i = 0; i < N; i++) half[i] = curve[i] * 0.5;
    try {
      saw.frequency.setValueCurveAtTime(curve, t0, o.dur);
      sq.frequency.setValueCurveAtTime(half, t0, o.dur);
    } catch (e) {
      sweep(saw.frequency, t0, o.f0, o.f0 * (1 + (o.bend || 0)), o.dur);
      sweep(sq.frequency, t0, o.f0 * 0.5, o.f0 * 0.5 * (1 + (o.bend || 0)), o.dur);
    }
    go(saw, t0, t0 + o.dur + 0.05);
    go(sq, t0, t0 + o.dur + 0.05);
    return { node: sum, oscs: [saw, sq] };
  }

  function formantBank(c, src, dst, formants, r) {
    for (let i = 0; i < formants.length; i++) {
      const F = formants[i];
      const bp = filt(c, 'bandpass', F[0] * r.range(0.96, 1.04), F[1]);
      const g = gain(c, F[2]);
      src.connect(bp); bp.connect(g); g.connect(dst);
    }
  }

  // Full zombie vocalisation: moan, scream, death rattle — all one machine.
  function vocal(c, out, t0, o, r, ctl) {
    const mst = gain(c, o.lvl === undefined ? 0.8 : o.lvl);
    const tone = filt(c, 'lowpass', o.tone || 2600, o.toneQ || 0.7);
    const amp = gain(c, 0);
    let chain = amp;
    if (o.dist) { const w = shaper(c, o.dist); amp.connect(w); chain = w; } else chain = amp;
    chain.connect(tone); tone.connect(mst); mst.connect(out);

    const src = voxSource(c, o, t0, r);
    if (ctl) { ctl.reg(src.oscs[0]); ctl.reg(src.oscs[1]); }
    formantBank(c, src.node, amp, o.formants, r);

    // breath layer — the wet part. Noise shaped by the same formants, quieter.
    if (o.breath) {
      const s = nsrc(c, o.dur + 0.2, 1200 + r.i(500));
      const bp = filt(c, 'bandpass', o.breathF || 1100, o.breathQ || 1.1);
      const bg = gain(c, o.breath);
      s.connect(bp); bp.connect(bg); bg.connect(amp);
      go(s, t0, t0 + o.dur + 0.15);
      if (ctl) ctl.reg(s);
      sweep(bp.frequency, t0, (o.breathF || 1100) * 0.7, (o.breathF || 1100) * 1.5, o.dur);
    }

    // irregular amplitude — the single biggest "organic" cue
    const N = 96;
    const shape = o.shape || function (t) {
      const atk = Math.min(1, t / 0.14);
      const rel = 1 - Math.max(0, (t - 0.62) / 0.38);
      return Math.max(MIN, atk * rel * rel);
    };
    const env = organicCurve(N, 1.0, o.ampWobbleHz || 5.5, o.ampWobble || 0.16,
                             o.ampJitter || 0.05, o.dur, r, shape);
    try { amp.gain.setValueCurveAtTime(env, t0, o.dur); }
    catch (e) { ahr(amp.gain, t0, o.dur * 0.15, o.dur * 0.5, o.dur * 0.35, 1); }

    if (o.toneSweep) sweep(tone.frequency, t0, o.toneSweep[0], o.toneSweep[1], o.dur);
    return mst;
  }

  // --- impacts: flesh, wood, bone ------------------------------------------
  function impact(c, out, t0, p, r) {
    const mst = gain(c, p.lvl === undefined ? 0.85 : p.lvl);
    mst.connect(out);
    // low body thud
    if (p.thump) {
      const o = osc(c, 'sine', p.thump[0]);
      sweep(o.frequency, t0, p.thump[0] * r.range(0.94, 1.06), p.thump[1], p.thump[2] * 0.9);
      const g = gain(c, 0);
      o.connect(g); g.connect(mst);
      ad(g.gain, t0, 0.0016, p.thump[2], p.thump[3]);
      go(o, t0, t0 + p.thump[2] + 0.06);
    }
    // splat / crunch noise band
    if (p.splat) {
      const s = p.splat;
      const n = nsrc(c, s.dec + 0.1, 2000 + r.i(500));
      const bp = filt(c, s.type || 'bandpass', s.f * r.range(0.9, 1.11), s.q === undefined ? 1.4 : s.q);
      const g = gain(c, 0);
      n.connect(bp); bp.connect(g); g.connect(mst);
      ad(g.gain, t0, s.atk || 0.0008, s.dec, s.amt);
      if (s.sweep) sweep(bp.frequency, t0, s.f * s.sweep[0], s.f * s.sweep[1], s.dec);
      go(n, t0, t0 + s.dec + 0.15);
    }
    // sharp crack (bone / headshot)
    if (p.crack) {
      const k = p.crack;
      const n = nsrc(c, 0.09, 2500 + r.i(500));
      const bp = filt(c, 'bandpass', k.f, k.q === undefined ? 7 : k.q);
      const g = gain(c, 0);
      const w = shaper(c, k.dist || 2.5);
      n.connect(bp); bp.connect(g); g.connect(w); w.connect(mst);
      ad(g.gain, t0 + (k.pre || 0), 0.0004, k.dec, k.amt);
      go(n, t0, t0 + 0.14 + (k.pre || 0));
    }
    // wet squelch — a pitch-dropping filtered buzz; sells "meat"
    if (p.squelch) {
      const q = p.squelch;
      const o = osc(c, 'sawtooth', q.f0);
      sweep(o.frequency, t0, q.f0, q.f1, q.dec);
      const bp = filt(c, 'bandpass', 700, 2.2);
      sweep(bp.frequency, t0, 1500, 320, q.dec);
      const g = gain(c, 0);
      o.connect(bp); bp.connect(g); g.connect(mst);
      ad(g.gain, t0, 0.004, q.dec, q.amt);
      go(o, t0, t0 + q.dec + 0.06);
    }
  }

  // --- FM bell (music box, jingles, powerup chimes) -------------------------
  // sine carrier + ~3.5:1 modulator with a fast-decaying index = struck metal.
  function fmBell(c, out, t0, f, dur, amp, ratio, index, r) {
    const car = osc(c, 'sine', f);
    const mod = osc(c, 'sine', f * (ratio || 3.5));
    const mg = gain(c, f * (index || 4.2));
    const g = gain(c, 0);
    mod.connect(mg); mg.connect(car.frequency);
    car.connect(g); g.connect(out);
    ad(mg.gain, t0, 0.001, dur * 0.28, f * (index || 4.2));
    ad(g.gain, t0, 0.002, dur, amp);
    go(car, t0, t0 + dur + 0.08);
    go(mod, t0, t0 + dur + 0.08);
    if (r) { car.detune.value = r.sym(9); }
    return g;
  }

  // --- pitched blip / beep --------------------------------------------------
  function blip(c, out, t0, p) {
    const o = osc(c, p.type || 'square', p.f0);
    if (p.f1) sweep(o.frequency, t0, p.f0, p.f1, p.dur);
    const lp = filt(c, 'lowpass', p.lp || 4200, p.q || 1.0);
    const g = gain(c, 0);
    o.connect(lp); lp.connect(g); g.connect(out);
    if (p.hold) ahr(g.gain, t0, p.atk || 0.004, p.hold, p.dur, p.amt);
    else ad(g.gain, t0, p.atk || 0.004, p.dur, p.amt);
    go(o, t0, t0 + p.dur + (p.hold || 0) + 0.06);
    return g;
  }

  // --- footstep -------------------------------------------------------------
  // A step is a soft low thump plus a surface-coloured scuff.
  function footstep(c, out, t0, p, r) {
    const mst = gain(c, p.lvl === undefined ? 0.5 : p.lvl);
    mst.connect(out);
    const o = osc(c, 'sine', p.thumpF * r.range(0.9, 1.12));
    sweep(o.frequency, t0, p.thumpF * 1.5, p.thumpF * 0.55, p.thumpDec);
    const tg = gain(c, 0);
    o.connect(tg); tg.connect(mst);
    ad(tg.gain, t0, 0.0018, p.thumpDec, p.thumpAmt);
    go(o, t0, t0 + p.thumpDec + 0.06);

    const n = nsrc(c, p.scuffDec + 0.1, 3000 + r.i(600));
    const bp = filt(c, p.scuffType || 'bandpass', p.scuffF * r.range(0.85, 1.18), p.scuffQ || 1.0);
    const g = gain(c, 0);
    n.connect(bp); bp.connect(g); g.connect(mst);
    ad(g.gain, t0 + (p.scuffPre || 0.004), 0.0012, p.scuffDec, p.scuffAmt);
    if (p.scuffSweep) sweep(bp.frequency, t0, p.scuffF * 1.6, p.scuffF * 0.6, p.scuffDec);
    go(n, t0, t0 + p.scuffDec + 0.16);

    // wooden boards ring a little under the boot
    if (p.ring) {
      for (let i = 0; i < p.ring.length; i++) {
        const rr = p.ring[i];
        const oo = osc(c, 'triangle', rr[0] * r.range(0.96, 1.05));
        const gg = gain(c, 0);
        oo.connect(gg); gg.connect(mst);
        ad(gg.gain, t0, 0.003, rr[1], rr[2]);
        go(oo, t0, t0 + rr[1] + 0.05);
      }
    }
  }

  // ===========================================================================
  // 5 — the sound library
  //
  // def fields:
  //   dur       render/lifetime seconds (must cover the whole sound)
  //   bus       'sfx' | 'ui' | 'ambient' | 'music'
  //   gain      base playback level
  //   rev       reverb send 0..1
  //   variants  how many randomized versions to bake (default 1)
  //   vary      {rate, gain, lp} per-shot randomization ranges
  //   live      true = never bake, always build the graph (params / drones)
  //   loop      true = looping voice
  //   prio      0..1, used when stealing voices
  //   seq       composite: [[name, delaySeconds, vol, rate], ...]
  //   build     recipe (see section 4)
  // ===========================================================================
  const DEFS = Object.create(null);
  const NAMES = [];
  function def(name, d) {
    d.name = name;
    if (d.dur === undefined) d.dur = 1.0;
    if (d.bus === undefined) d.bus = 'sfx';
    if (d.gain === undefined) d.gain = 1.0;
    if (d.rev === undefined) d.rev = 0.22;
    if (d.variants === undefined) d.variants = 1;
    if (d.prio === undefined) d.prio = 0.5;
    DEFS[name] = d; NAMES.push(name);
    return d;
  }
  function alias(name, target, variant) {
    DEFS[name] = { name: name, aliasOf: target, variant: variant | 0 };
    NAMES.push(name);
  }

  // ---------------------------------------------------------------------------
  // 5.1 WEAPONS — sixteen guns, sixteen voices. No reskins: each has its own
  // body frequencies, thump, tail length and grit.
  // ---------------------------------------------------------------------------
  const GUN_VARY = { rate: 0.055, gain: 0.16, lp: 0.10 };

  function gunDef(name, dur, lvl, rev, p) {
    def(name, {
      dur: dur, gain: lvl, rev: rev, variants: 4, prio: 0.9, vary: GUN_VARY,
      build: function (c, out, t0, r) { gunshot(c, out, t0, p, r); },
    });
  }

  // .45 ACP pistol — low, dry, short. Small charge, over almost as soon as
  // it starts. FIX: measured centroid was within 5.6% of the MP40 and level
  // within 0.6 dB — a reskin, not a different gun. Pulled the body down and
  // shortened everything so it reads as the smallest, driest gun in the box
  // instead of a duller SMG.
  gunDef('gun_m1911', 0.46, 0.78, 0.24, {
    lvl: 0.60, dist: 1.9, preDist: 1.05, clickF: 5000, clickHp: 2400, clickAmt: 0.8,
    body: [{ f: 660, q: 3.4, dec: 0.052, amt: 0.85 }, { f: 1500, q: 2.8, dec: 0.030, amt: 0.38 }],
    thump: { f0: 220, f1: 80, dec: 0.048, amt: 0.36 },
    tail: { lp: 1750, dec: 0.14, amt: 0.18, pre: 0.011 },
    mech: { t: 0.045, f: 2800, dec: 0.017, amt: 0.15 },
  });

  // Kar98k — the loudest thing in the building. Deep, huge, long dark tail.
  gunDef('gun_kar98k', 1.45, 1.00, 0.62, {
    lvl: 0.78, dist: 3.0, preDist: 1.25, clickF: 4900, clickHp: 2200, clickAmt: 1.0,
    body: [{ f: 430, q: 4.6, dec: 0.17, amt: 1.0 }, { f: 1240, q: 3.6, dec: 0.085, amt: 0.55 },
           { f: 2650, q: 2.8, dec: 0.034, amt: 0.30 }],
    thump: { f0: 158, f1: 40, dec: 0.34, amt: 0.95 },
    tail: { lp: 1450, dec: 0.90, amt: 0.50, pre: 0.021, hp: 90 },
  });

  // M1A1 Carbine — light rifle, tight pop, short tail.
  gunDef('gun_carbine', 0.70, 0.80, 0.34, {
    lvl: 0.62, dist: 2.3, clickF: 6400, clickHp: 3000, clickAmt: 0.85,
    body: [{ f: 720, q: 4.4, dec: 0.088, amt: 0.85 }, { f: 1850, q: 3.4, dec: 0.045, amt: 0.5 }],
    thump: { f0: 192, f1: 58, dec: 0.115, amt: 0.6 },
    tail: { lp: 2100, dec: 0.30, amt: 0.28, pre: 0.015 },
    mech: { t: 0.055, f: 2700, dec: 0.022, amt: 0.14 },
  });

  // Gewehr 43 — mid-weight semi-auto, more body than the carbine.
  gunDef('gun_gewehr43', 0.90, 0.86, 0.42, {
    lvl: 0.66, dist: 2.5, clickF: 5600, clickHp: 2500, clickAmt: 0.9,
    body: [{ f: 565, q: 4.6, dec: 0.115, amt: 0.92 }, { f: 1500, q: 3.4, dec: 0.06, amt: 0.5 },
           { f: 2900, q: 2.6, dec: 0.028, amt: 0.22 }],
    thump: { f0: 176, f1: 52, dec: 0.19, amt: 0.75 },
    tail: { lp: 1750, dec: 0.44, amt: 0.34, pre: 0.017 },
    mech: { t: 0.062, f: 2500, dec: 0.026, amt: 0.15 },
  });

  // Thompson — fat, low, chugging .45. Blowback clack is part of the voice.
  gunDef('gun_thompson', 0.62, 0.80, 0.30, {
    lvl: 0.60, dist: 2.6, preDist: 1.1, clickF: 4800, clickHp: 2100, clickAmt: 0.72,
    body: [{ f: 470, q: 3.4, dec: 0.072, amt: 0.95 }, { f: 1080, q: 3.0, dec: 0.04, amt: 0.45 }],
    thump: { f0: 152, f1: 54, dec: 0.115, amt: 0.82 },
    tail: { lp: 1550, dec: 0.24, amt: 0.30, pre: 0.012 },
    mech: { t: 0.028, f: 1900, dec: 0.026, amt: 0.26 },
  });

  // MP40 — snappier, higher, tinnier than the Thompson. Stamped steel.
  // FIX: pushed further from the M1911 (was measuring as a near-reskin of
  // it): higher dominant body band, tighter decays throughout, brighter
  // click, shorter tail — faster and tighter where the M1911 is now lower
  // and dry.
  gunDef('gun_mp40', 0.44, 0.80, 0.30, {
    lvl: 0.58, dist: 2.7, clickF: 7900, clickHp: 3900, clickAmt: 0.98,
    body: [{ f: 1420, q: 5.6, dec: 0.034, amt: 0.85 }, { f: 3000, q: 4.2, dec: 0.018, amt: 0.52 },
           { f: 720, q: 3.4, dec: 0.038, amt: 0.32 }],
    thump: { f0: 250, f1: 100, dec: 0.048, amt: 0.40 },
    tail: { lp: 3600, dec: 0.13, amt: 0.22, pre: 0.008 },
    mech: { t: 0.022, f: 3900, dec: 0.015, amt: 0.32 },
  });

  // BAR — heavy, slow, authoritative. The most "shoulder" of the automatics.
  gunDef('gun_bar', 1.00, 0.92, 0.46, {
    lvl: 0.70, dist: 2.9, preDist: 1.2, clickF: 5000, clickHp: 2300, clickAmt: 0.92,
    body: [{ f: 385, q: 4.8, dec: 0.135, amt: 1.0 }, { f: 985, q: 3.6, dec: 0.07, amt: 0.52 },
           { f: 2300, q: 2.6, dec: 0.03, amt: 0.24 }],
    thump: { f0: 132, f1: 44, dec: 0.28, amt: 0.92 },
    tail: { lp: 1350, dec: 0.55, amt: 0.40, pre: 0.019, hp: 95 },
    mech: { t: 0.040, f: 2000, dec: 0.03, amt: 0.20 },
  });

  // StG44 — mid, punchy, the modern-sounding one.
  gunDef('gun_stg44', 0.72, 0.84, 0.36, {
    lvl: 0.64, dist: 2.6, clickF: 5900, clickHp: 2700, clickAmt: 0.9,
    body: [{ f: 645, q: 4.8, dec: 0.09, amt: 0.92 }, { f: 1620, q: 3.4, dec: 0.048, amt: 0.5 },
           { f: 3200, q: 2.4, dec: 0.022, amt: 0.2 }],
    thump: { f0: 168, f1: 58, dec: 0.155, amt: 0.76 },
    tail: { lp: 1950, dec: 0.33, amt: 0.30, pre: 0.015 },
    mech: { t: 0.034, f: 2900, dec: 0.022, amt: 0.18 },
  });

  // FG42 — fast and high; the shrillest rifle in the box.
  gunDef('gun_fg42', 0.60, 0.82, 0.32, {
    lvl: 0.60, dist: 2.4, clickF: 6800, clickHp: 3200, clickAmt: 0.95,
    body: [{ f: 910, q: 5.4, dec: 0.058, amt: 0.9 }, { f: 2250, q: 3.6, dec: 0.03, amt: 0.55 }],
    thump: { f0: 214, f1: 74, dec: 0.09, amt: 0.6 },
    tail: { lp: 2650, dec: 0.24, amt: 0.26, pre: 0.012 },
    mech: { t: 0.026, f: 3400, dec: 0.018, amt: 0.2 },
  });

  // Sawed-off double barrel — enormous low end plus a wide spray of shot.
  def('gun_dbshotgun', {
    dur: 1.30, gain: 1.0, rev: 0.55, variants: 4, prio: 0.95, vary: GUN_VARY,
    build: function (c, out, t0, r) {
      gunshot(c, out, t0, {
        lvl: 0.70, dist: 3.4, preDist: 1.3, clickF: 4200, clickHp: 1700, clickAmt: 0.8,
        body: [{ f: 300, q: 2.2, dec: 0.19, amt: 0.95 }, { f: 780, q: 2.0, dec: 0.10, amt: 0.5 }],
        thump: { f0: 112, f1: 31, dec: 0.42, amt: 1.0 },
        tail: { lp: 1200, dec: 0.75, amt: 0.46, pre: 0.020, hp: 70 },
      }, r);
      // the shot column: wide, gritty noise spray that outlives the muzzle blast
      const n = nsrc(c, 0.45, 5100 + r.i(400));
      const lp = filt(c, 'lowpass', 3600, 0.9);
      const hp = filt(c, 'highpass', 210, 0.7);
      const w = shaper(c, 1.8);
      const g = gain(c, 0);
      n.connect(lp); lp.connect(hp); hp.connect(w); w.connect(g); g.connect(out);
      ad(g.gain, t0, 0.0012, 0.32, 0.55);
      sweep(lp.frequency, t0, 5200, 900, 0.32);
      go(n, t0, t0 + 0.5);
    },
  });

  // Trench gun — pump shotgun. Brighter and tighter than the sawed-off.
  def('gun_trenchgun', {
    dur: 1.10, gain: 0.96, rev: 0.50, variants: 4, prio: 0.95, vary: GUN_VARY,
    build: function (c, out, t0, r) {
      gunshot(c, out, t0, {
        lvl: 0.68, dist: 3.0, clickF: 5200, clickHp: 2200, clickAmt: 0.9,
        body: [{ f: 585, q: 2.4, dec: 0.13, amt: 0.92 }, { f: 1310, q: 2.4, dec: 0.07, amt: 0.5 }],
        thump: { f0: 134, f1: 40, dec: 0.30, amt: 0.85 },
        tail: { lp: 1600, dec: 0.55, amt: 0.40, pre: 0.017 },
      }, r);
      const n = nsrc(c, 0.35, 5300 + r.i(400));
      const lp = filt(c, 'lowpass', 5400, 0.9);
      const hp = filt(c, 'highpass', 360, 0.7);
      const g = gain(c, 0);
      n.connect(lp); lp.connect(hp); hp.connect(g); g.connect(out);
      ad(g.gain, t0, 0.001, 0.24, 0.48);
      sweep(lp.frequency, t0, 7000, 1500, 0.24);
      go(n, t0, t0 + 0.4);
    },
  });

  // PTRS-41 anti-tank rifle — not a gun, an artillery piece you can carry.
  def('gun_ptrs41', {
    dur: 2.20, gain: 1.0, rev: 0.75, variants: 3, prio: 1.0, vary: GUN_VARY,
    build: function (c, out, t0, r) {
      gunshot(c, out, t0, {
        lvl: 0.74, dist: 4.0, preDist: 1.35, clickF: 4400, clickHp: 1800, clickAmt: 1.0,
        body: [{ f: 275, q: 5.6, dec: 0.26, amt: 1.0 }, { f: 700, q: 4.0, dec: 0.13, amt: 0.6 },
               { f: 1820, q: 3.0, dec: 0.05, amt: 0.34 }],
        thump: { f0: 92, f1: 23, dec: 0.58, amt: 1.0 },
        tail: { lp: 1050, dec: 1.25, amt: 0.62, pre: 0.026, hp: 60 },
      }, r);
      // the long cannon crack rolling away down the street
      const n = nsrc(c, 1.4, 5500 + r.i(400));
      const lp = filt(c, 'lowpass', 700, 0.8);
      const g = gain(c, 0);
      n.connect(lp); lp.connect(g); g.connect(out);
      ad(g.gain, t0 + 0.05, 0.03, 1.1, 0.30);
      sweep(lp.frequency, t0, 1500, 220, 1.1);
      go(n, t0, t0 + 1.6);
    },
  });

  // M1919 Browning — deep chattering LMG.
  gunDef('gun_browning', 0.85, 0.90, 0.42, {
    lvl: 0.66, dist: 2.8, preDist: 1.15, clickF: 5100, clickHp: 2300, clickAmt: 0.88,
    body: [{ f: 368, q: 4.6, dec: 0.105, amt: 0.98 }, { f: 1055, q: 3.4, dec: 0.055, amt: 0.5 },
           { f: 2450, q: 2.6, dec: 0.026, amt: 0.22 }],
    thump: { f0: 142, f1: 48, dec: 0.20, amt: 0.86 },
    tail: { lp: 1500, dec: 0.38, amt: 0.34, pre: 0.016 },
    mech: { t: 0.030, f: 2200, dec: 0.028, amt: 0.28 },
  });

  // ---- the Ray Gun --------------------------------------------------------
  // Descending zap, ring modulation, bright resonant sweep, wet electric tail.
  def('gun_raygun', {
    dur: 1.40, gain: 0.90, rev: 0.55, variants: 4, prio: 1.0,
    vary: { rate: 0.035, gain: 0.10 },
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.62);
      mst.connect(out);

      // pre-charge blip: the capacitor letting go
      {
        const o = osc(c, 'square', 2400);
        sweep(o.frequency, t0, 1500, 3400, 0.03);
        const g = gain(c, 0);
        const bp = filt(c, 'bandpass', 2800, 4);
        o.connect(bp); bp.connect(g); g.connect(mst);
        ad(g.gain, t0, 0.0015, 0.03, 0.28);
        go(o, t0, t0 + 0.06);
      }

      // main descending zap — sawtooth carrier, 1400 -> 165 Hz
      const car = osc(c, 'sawtooth', 1400);
      sweep(car.frequency, t0 + 0.006, 1420 * r.range(0.97, 1.03), 165, 0.30);
      const car2 = osc(c, 'square', 700);
      sweep(car2.frequency, t0 + 0.006, 710, 82, 0.30);

      // ring modulator: gain node with 0 base, driven bipolar by the modulator
      const ring = gain(c, 0.0);
      const modo = osc(c, 'sine', 430);
      sweep(modo.frequency, t0 + 0.006, 430, 96, 0.30);   // mod tracks the carrier
      const modg = gain(c, 0.95);
      modo.connect(modg); modg.connect(ring.gain);
      const dry = gain(c, 0.35);                           // keep some carrier through
      car.connect(ring); car2.connect(ring);
      car.connect(dry); car2.connect(dry);

      // bright resonant sweep on top of the ring product
      const bp = filt(c, 'bandpass', 6000, 9);
      sweep(bp.frequency, t0 + 0.006, 6200, 420, 0.32);
      const zg = gain(c, 0);
      ring.connect(bp); dry.connect(bp); bp.connect(zg);
      const w = shaper(c, 2.6);
      zg.connect(w); w.connect(mst);
      ad(zg.gain, t0 + 0.004, 0.0035, 0.34, 0.95);

      go(car, t0, t0 + 0.45); go(car2, t0, t0 + 0.45); go(modo, t0, t0 + 0.45);

      // wet electric tail: short feedback comb, sizzling away
      const dl = delay(c, 0.043, 0.4);
      const fb = gain(c, 0.55);
      const tlp = filt(c, 'lowpass', 2200, 0.8);
      const tg = gain(c, 0.42);
      zg.connect(dl); dl.connect(tlp); tlp.connect(fb); fb.connect(dl);
      tlp.connect(tg); tg.connect(mst);
      sweep(tlp.frequency, t0 + 0.05, 3200, 500, 0.8);

      // ionised air crackle
      const n = nsrc(c, 0.5, 6100 + r.i(300));
      const nb = filt(c, 'bandpass', 3800, 2.0);
      const ng = gain(c, 0);
      n.connect(nb); nb.connect(ng); ng.connect(mst);
      ad(ng.gain, t0, 0.002, 0.30, 0.24);
      sweep(nb.frequency, t0, 5200, 900, 0.30);
      go(n, t0, t0 + 0.55);
    },
  });

  // Panzerschreck — rocket whoosh over a launch roar.
  def('gun_panzerschreck', {
    dur: 2.40, gain: 1.0, rev: 0.65, variants: 2, prio: 1.0,
    vary: { rate: 0.03, gain: 0.08 },
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.66);
      mst.connect(out);
      // launch roar — detuned saw cluster through a closing lowpass, distorted
      const w = shaper(c, 3.2);
      const lp = filt(c, 'lowpass', 900, 1.4);
      const rg = gain(c, 0);
      lp.connect(w); w.connect(rg); rg.connect(mst);
      const fs = [52, 55.5, 78, 83.5, 104];
      for (let i = 0; i < fs.length; i++) {
        const o = osc(c, 'sawtooth', fs[i] * r.range(0.97, 1.03));
        sweep(o.frequency, t0, fs[i] * 1.35, fs[i] * 0.8, 0.6);
        const g = gain(c, 0.5 / fs.length * 3);
        o.connect(g); g.connect(lp);
        go(o, t0, t0 + 1.1);
      }
      ad(rg.gain, t0, 0.006, 0.85, 0.9);
      sweep(lp.frequency, t0, 2400, 180, 0.8);
      // big low thump
      const th = osc(c, 'sine', 95);
      sweep(th.frequency, t0, 98, 28, 0.5);
      const tg = gain(c, 0);
      th.connect(tg); tg.connect(mst);
      ad(tg.gain, t0, 0.004, 0.55, 0.85);
      go(th, t0, t0 + 0.65);
      // rocket whoosh — bandpassed noise racing away from the tube
      const n = nsrc(c, 1.6, 6300 + r.i(300));
      const bp = filt(c, 'bandpass', 700, 1.6);
      const ng = gain(c, 0);
      n.connect(bp); bp.connect(ng); ng.connect(mst);
      swell(ng.gain, t0 + 0.02, 0.18, 0.55, 0.0);
      ng.gain.exponentialRampToValueAtTime(0.10, t0 + 1.0);
      ng.gain.exponentialRampToValueAtTime(MIN, t0 + 1.6);
      sweep(bp.frequency, t0, 420, 2600, 1.1);
      go(n, t0, t0 + 1.7);
      // backblast crackle
      const n2 = nsrc(c, 0.8, 6400 + r.i(300));
      const hp = filt(c, 'highpass', 1400, 0.8);
      const g2 = gain(c, 0);
      n2.connect(hp); hp.connect(g2); g2.connect(mst);
      ad(g2.gain, t0, 0.003, 0.7, 0.35);
      go(n2, t0, t0 + 0.9);
    },
  });

  // Empty chamber.
  def('gun_dryfire', {
    dur: 0.20, gain: 0.55, rev: 0.14, variants: 3, prio: 0.4,
    vary: { rate: 0.08, gain: 0.12 },
    build: function (c, out, t0, r) {
      clack(c, out, t0, { lvl: 0.75, hp: 1400, lp: 8000, dec: 0.008, amt: 0.8,
                          ring: [[3100, 0.03, 0.16], [5200, 0.018, 0.09]], body: [180, 0.05, 0.10] }, r);
      clack(c, out, t0 + 0.018, { lvl: 0.4, hp: 2000, lp: 9000, dec: 0.006, amt: 0.5 }, r);
    },
  });

  // ---------------------------------------------------------------------------
  // 5.2 RELOAD COMPONENTS — the vocabulary the sequences are written in.
  // ---------------------------------------------------------------------------
  const CLICK_VARY = { rate: 0.09, gain: 0.14 };

  def('mag_out', {
    dur: 0.35, gain: 0.7, rev: 0.16, variants: 3, prio: 0.45, vary: CLICK_VARY,
    build: function (c, out, t0, r) {
      clack(c, out, t0, { lvl: 0.55, hp: 700, lp: 5200, dec: 0.02, amt: 0.7,
                          ring: [[1450, 0.06, 0.16], [2600, 0.035, 0.09]], body: [140, 0.08, 0.14] }, r);
      // the magazine sliding free of the well
      const n = nsrc(c, 0.2, 7000 + r.i(300));
      const bp = filt(c, 'bandpass', 2100, 1.6);
      const g = gain(c, 0);
      n.connect(bp); bp.connect(g); g.connect(out);
      ad(g.gain, t0 + 0.012, 0.008, 0.075, 0.16);
      sweep(bp.frequency, t0, 2600, 1200, 0.09);
      go(n, t0, t0 + 0.25);
    },
  });

  def('mag_in', {
    dur: 0.35, gain: 0.75, rev: 0.18, variants: 3, prio: 0.45, vary: CLICK_VARY,
    build: function (c, out, t0, r) {
      const n = nsrc(c, 0.2, 7100 + r.i(300));
      const bp = filt(c, 'bandpass', 1600, 1.4);
      const g = gain(c, 0);
      n.connect(bp); bp.connect(g); g.connect(out);
      ad(g.gain, t0, 0.01, 0.06, 0.18);
      sweep(bp.frequency, t0, 1100, 2400, 0.07);
      go(n, t0, t0 + 0.25);
      clack(c, out, t0 + 0.07, { lvl: 0.8, hp: 600, lp: 6000, dec: 0.022, amt: 0.85,
                                 ring: [[1250, 0.07, 0.2], [2300, 0.04, 0.1]], body: [120, 0.10, 0.2] }, r);
    },
  });

  def('bolt_back', {
    dur: 0.30, gain: 0.7, rev: 0.16, variants: 3, prio: 0.45, vary: CLICK_VARY,
    build: function (c, out, t0, r) {
      // steel on steel scrape, then the bolt hitting its rear stop
      const n = nsrc(c, 0.18, 7200 + r.i(300));
      const bp = filt(c, 'bandpass', 3000, 3.2);
      const g = gain(c, 0);
      n.connect(bp); bp.connect(g); g.connect(out);
      ad(g.gain, t0, 0.006, 0.075, 0.28);
      sweep(bp.frequency, t0, 2200, 4200, 0.08);
      go(n, t0, t0 + 0.2);
      clack(c, out, t0 + 0.085, { lvl: 0.7, hp: 1200, lp: 8000, dec: 0.012, amt: 0.8,
                                  ring: [[2400, 0.05, 0.2], [4100, 0.025, 0.1]] }, r);
    },
  });

  def('bolt_forward', {
    dur: 0.30, gain: 0.78, rev: 0.18, variants: 3, prio: 0.45, vary: CLICK_VARY,
    build: function (c, out, t0, r) {
      const n = nsrc(c, 0.16, 7300 + r.i(300));
      const bp = filt(c, 'bandpass', 2800, 3.0);
      const g = gain(c, 0);
      n.connect(bp); bp.connect(g); g.connect(out);
      ad(g.gain, t0, 0.005, 0.055, 0.26);
      sweep(bp.frequency, t0, 4000, 1900, 0.06);
      go(n, t0, t0 + 0.18);
      clack(c, out, t0 + 0.062, { lvl: 0.95, hp: 900, lp: 9000, dec: 0.014, amt: 0.95,
                                  ring: [[1900, 0.055, 0.24], [3600, 0.03, 0.12]], body: [165, 0.06, 0.16] }, r);
    },
  });

  def('slide_rack', {
    dur: 0.30, gain: 0.75, rev: 0.16, variants: 3, prio: 0.45, vary: CLICK_VARY,
    build: function (c, out, t0, r) {
      clack(c, out, t0, { lvl: 0.6, hp: 1600, lp: 9000, dec: 0.01, amt: 0.7,
                          ring: [[2900, 0.035, 0.16]] }, r);
      const n = nsrc(c, 0.12, 7400 + r.i(300));
      const bp = filt(c, 'bandpass', 3400, 2.6);
      const g = gain(c, 0);
      n.connect(bp); bp.connect(g); g.connect(out);
      ad(g.gain, t0 + 0.005, 0.004, 0.045, 0.3);
      go(n, t0, t0 + 0.15);
      clack(c, out, t0 + 0.055, { lvl: 1.0, hp: 1100, lp: 10000, dec: 0.011, amt: 0.95,
                                  ring: [[2200, 0.04, 0.22], [4400, 0.02, 0.1]] }, r);
    },
  });

  def('shell_insert', {
    dur: 0.28, gain: 0.65, rev: 0.16, variants: 4, prio: 0.4, vary: CLICK_VARY,
    build: function (c, out, t0, r) {
      // brass/paper hull sliding into the tube, then seating
      const n = nsrc(c, 0.14, 7500 + r.i(300));
      const bp = filt(c, 'bandpass', 1900, 1.8);
      const g = gain(c, 0);
      n.connect(bp); bp.connect(g); g.connect(out);
      ad(g.gain, t0, 0.008, 0.055, 0.24);
      sweep(bp.frequency, t0, 1300, 2600, 0.055);
      go(n, t0, t0 + 0.18);
      clack(c, out, t0 + 0.055, { lvl: 0.6, hp: 800, lp: 5500, dec: 0.012, amt: 0.7,
                                  ring: [[980, 0.05, 0.18]], body: [190, 0.05, 0.12] }, r);
    },
  });

  def('shell_pump', {
    dur: 0.42, gain: 0.85, rev: 0.20, variants: 3, prio: 0.5, vary: CLICK_VARY,
    build: function (c, out, t0, r) {
      // the classic ka-CHUNK: fore-end back, then slammed forward
      const n = nsrc(c, 0.2, 7600 + r.i(300));
      const bp = filt(c, 'bandpass', 2400, 2.2);
      const g = gain(c, 0);
      n.connect(bp); bp.connect(g); g.connect(out);
      ad(g.gain, t0, 0.006, 0.09, 0.34);
      sweep(bp.frequency, t0, 1700, 3300, 0.09);
      go(n, t0, t0 + 0.24);
      clack(c, out, t0 + 0.085, { lvl: 0.85, hp: 700, lp: 7000, dec: 0.018, amt: 0.9,
                                  ring: [[1500, 0.07, 0.22], [2700, 0.04, 0.11]], body: [150, 0.09, 0.2] }, r);
      clack(c, out, t0 + 0.20, { lvl: 1.0, hp: 600, lp: 8000, dec: 0.02, amt: 1.0,
                                 ring: [[1250, 0.09, 0.28], [2350, 0.05, 0.14]], body: [125, 0.12, 0.28] }, r);
    },
  });

  // ---- reload sequences: components composed with delays so the audio tracks
  // ---- the animation beat for beat.
  def('reload_pistol', { seq: [['mag_out', 0.00, 1.0], ['mag_in', 0.52, 1.0], ['slide_rack', 1.02, 1.0]] });
  def('reload_smg',    { seq: [['mag_out', 0.00, 1.0, 0.94], ['mag_in', 0.58, 1.05, 0.92], ['bolt_back', 1.16, 0.9, 1.05]] });
  def('reload_rifle',  { seq: [['mag_out', 0.00, 0.95, 0.9], ['mag_in', 0.62, 1.0, 0.88], ['bolt_forward', 1.22, 1.0, 0.95]] });
  def('reload_bolt',   { seq: [['bolt_back', 0.00, 1.0, 0.86], ['shell_insert', 0.30, 0.9, 0.8], ['shell_insert', 0.52, 0.9, 0.84], ['shell_insert', 0.74, 0.9, 0.78], ['bolt_forward', 1.05, 1.05, 0.86]] });
  def('reload_lmg',    { seq: [['mag_out', 0.00, 1.0, 0.8], ['mag_in', 0.75, 1.05, 0.78], ['bolt_back', 1.45, 1.0, 0.8], ['bolt_forward', 1.72, 1.0, 0.8]] });
  def('reload_shotgun',{ seq: [['shell_insert', 0.00, 1.0, 1.02], ['shell_insert', 0.34, 1.0, 0.96], ['shell_insert', 0.68, 1.0, 1.06], ['shell_insert', 1.02, 1.0, 0.99], ['shell_pump', 1.42, 1.0, 1.0]] });
  def('reload_dbshotgun', { seq: [['bolt_back', 0.00, 0.8, 0.7], ['shell_insert', 0.34, 1.05, 0.82], ['shell_insert', 0.60, 1.05, 0.78], ['bolt_forward', 0.98, 1.0, 0.72]] });
  def('reload_rocket', { seq: [['mag_out', 0.00, 0.9, 0.66], ['shell_insert', 0.55, 1.0, 0.6], ['bolt_forward', 1.25, 1.05, 0.62], ['slide_rack', 1.65, 0.7, 0.7]] });
  def('reload_raygun', { seq: [['mag_out', 0.00, 0.85, 1.3], ['gun_dryfire', 0.42, 0.5, 1.6], ['mag_in', 0.70, 0.9, 1.35], ['ui_click', 1.25, 0.8, 0.7]] });

  // ---------------------------------------------------------------------------
  // 5.3 ZOMBIES — the horror budget. Everything here is a vocal tract plus meat.
  // Vowel formant tables (F1/F2/F3 with Q and level) pulled toward the dark end.
  // ---------------------------------------------------------------------------
  const VOWEL = {
    uh: [[500, 7, 1.0], [1360, 9, 0.42], [2400, 11, 0.14]],
    aa: [[700, 6, 1.0], [1080, 8, 0.55], [2450, 11, 0.16]],
    oo: [[315, 8, 1.0], [820, 10, 0.30], [2200, 12, 0.08]],
    oh: [[560, 7, 1.0], [860, 9, 0.48], [2380, 11, 0.12]],
    eh: [[540, 7, 1.0], [1780, 8, 0.46], [2470, 11, 0.18]],
    er: [[480, 7, 1.0], [1320, 9, 0.40], [1650, 10, 0.26]],
  };

  const MOANS = [
    { f0: 74,  v: 'uh', dur: 1.85, bend: -0.14, tone: 1900, breath: 0.30 },
    { f0: 88,  v: 'oh', dur: 2.30, bend: -0.09, tone: 2200, breath: 0.24 },
    { f0: 63,  v: 'oo', dur: 2.60, bend: 0.07,  tone: 1500, breath: 0.34 },
    { f0: 101, v: 'aa', dur: 1.55, bend: -0.18, tone: 2600, breath: 0.28 },
    { f0: 69,  v: 'er', dur: 2.10, bend: 0.11,  tone: 1750, breath: 0.38 },
    { f0: 95,  v: 'eh', dur: 1.70, bend: -0.05, tone: 2450, breath: 0.22 },
  ];
  for (let i = 0; i < MOANS.length; i++) {
    (function (m, idx) {
      def('zom_moan_' + (idx + 1), {
        dur: m.dur + 0.25, gain: 0.85, rev: 0.42, variants: 3, prio: 0.55,
        vary: { rate: 0.10, gain: 0.20, lp: 0.15 },
        build: function (c, out, t0, r, ctl) {
          vocal(c, out, t0, {
            dur: m.dur, f0: m.f0 * r.range(0.94, 1.07), bend: m.bend, lvl: 0.72,
            formants: VOWEL[m.v], tone: m.tone, toneQ: 0.8,
            breath: m.breath, breathF: 950 + r.range(-200, 400), breathQ: 0.9,
            wobbleHz: r.range(2.2, 4.4), wobble: r.range(0.03, 0.07),
            jitter: 0.014, ampWobbleHz: r.range(3.5, 7.5), ampWobble: r.range(0.12, 0.26),
            ampJitter: 0.06, sub: 0.34,
            toneSweep: [m.tone * 1.4, m.tone * 0.55],
            shape: function (t) {
              const a = Math.min(1, t / 0.18);
              const rel = 1 - Math.max(0, (t - 0.55) / 0.45);
              return Math.max(MIN, a * a * rel * rel);
            },
          }, r, ctl);
        },
      });
    }(MOANS[i], i));
  }

  const SCREAMS = [
    { f0: 196, v: 'aa', dur: 0.95, bend: 0.22, dist: 5.0 },
    { f0: 245, v: 'eh', dur: 0.78, bend: 0.30, dist: 6.0 },
    { f0: 168, v: 'aa', dur: 1.15, bend: 0.16, dist: 4.4 },
    { f0: 288, v: 'er', dur: 0.70, bend: 0.36, dist: 6.5 },
  ];
  for (let i = 0; i < SCREAMS.length; i++) {
    (function (m, idx) {
      def('zom_scream_' + (idx + 1), {
        dur: m.dur + 0.3, gain: 0.95, rev: 0.48, variants: 3, prio: 0.85,
        vary: { rate: 0.09, gain: 0.14, lp: 0.10 },
        build: function (c, out, t0, r, ctl) {
          const fm = VOWEL[m.v];
          const up = [[fm[0][0] * 1.35, fm[0][1], 1.0],
                      [fm[1][0] * 1.25, fm[1][1], 0.7],
                      [fm[2][0] * 1.15, fm[2][1], 0.4],
                      [4200, 8, 0.22]];
          vocal(c, out, t0, {
            dur: m.dur, f0: m.f0 * r.range(0.93, 1.08), bend: m.bend, lvl: 0.62,
            formants: up, tone: 5200, toneQ: 0.9, dist: m.dist,
            breath: 0.42, breathF: 2600, breathQ: 0.8,
            wobbleHz: r.range(5, 9), wobble: 0.05, jitter: 0.03,
            ampWobbleHz: r.range(9, 16), ampWobble: 0.22, ampJitter: 0.09, sub: 0.12,
            toneSweep: [6500, 1800],
            shape: function (t) {
              const a = Math.min(1, t / 0.025);           // brutal attack
              const rel = 1 - Math.max(0, (t - 0.40) / 0.60);
              return Math.max(MIN, a * rel * rel);
            },
          }, r, ctl);
          // rasp layer: hard-gated noise riding the scream
          const n = nsrc(c, m.dur + 0.1, 8200 + r.i(300));
          const bp = filt(c, 'bandpass', 2400, 2.4);
          const g = gain(c, 0);
          const w = shaper(c, 4);
          const lfo = osc(c, 'square', 34);
          const lg = gain(c, 0.5);
          n.connect(bp); bp.connect(g); g.connect(w); w.connect(out);
          lfo.connect(lg); lg.connect(g.gain);
          ad(g.gain, t0, 0.006, m.dur * 0.9, 0.30);
          sweep(bp.frequency, t0, 1800, 3600, m.dur * 0.5);
          go(n, t0, t0 + m.dur + 0.1); go(lfo, t0, t0 + m.dur + 0.1);
        },
      });
    }(SCREAMS[i], i));
  }

  def('zom_attack_swipe', {
    dur: 0.55, gain: 0.8, rev: 0.28, variants: 4, prio: 0.7,
    vary: { rate: 0.12, gain: 0.16 },
    build: function (c, out, t0, r) {
      // arm through air: bandpassed noise swept up then down (doppler-ish)
      const n = nsrc(c, 0.4, 8400 + r.i(400));
      const bp = filt(c, 'bandpass', 900, 1.5);
      const g = gain(c, 0);
      n.connect(bp); bp.connect(g); g.connect(out);
      g.gain.setValueAtTime(MIN, t0);
      g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.12);
      g.gain.exponentialRampToValueAtTime(MIN, t0 + 0.30);
      bp.frequency.setValueAtTime(420, t0);
      bp.frequency.exponentialRampToValueAtTime(2100, t0 + 0.12);
      bp.frequency.exponentialRampToValueAtTime(500, t0 + 0.30);
      go(n, t0, t0 + 0.45);
      // cloth/rot rustle
      const n2 = nsrc(c, 0.3, 8500 + r.i(400));
      const hp = filt(c, 'highpass', 2600, 0.7);
      const g2 = gain(c, 0);
      n2.connect(hp); hp.connect(g2); g2.connect(out);
      ad(g2.gain, t0 + 0.02, 0.05, 0.2, 0.16);
      go(n2, t0, t0 + 0.35);
    },
  });

  def('zom_hit_player', {
    dur: 0.70, gain: 1.0, rev: 0.30, variants: 4, prio: 0.95,
    vary: { rate: 0.09, gain: 0.12 },
    build: function (c, out, t0, r) {
      impact(c, out, t0, {
        lvl: 0.9,
        thump: [130, 42, 0.20, 0.9],
        splat: { f: 620, q: 1.1, dec: 0.13, amt: 0.5, sweep: [2.4, 0.5] },
        crack: { f: 1500, q: 5, dec: 0.03, amt: 0.35, dist: 3 },
      }, r);
      // the player's own grunt of impact, very short
      const n = nsrc(c, 0.25, 8600 + r.i(300));
      const bp = filt(c, 'bandpass', 380, 3);
      const g = gain(c, 0);
      n.connect(bp); bp.connect(g); g.connect(out);
      ad(g.gain, t0 + 0.01, 0.01, 0.16, 0.22);
      go(n, t0, t0 + 0.3);
    },
  });

  def('zom_step', {
    dur: 0.42, gain: 0.55, rev: 0.30, variants: 4, prio: 0.3,
    vary: { rate: 0.16, gain: 0.25, lp: 0.2 },
    build: function (c, out, t0, r) {
      // heavy, dragging, sloppy — never a crisp footfall
      footstep(c, out, t0, {
        lvl: 0.55, thumpF: 78, thumpDec: 0.13, thumpAmt: 0.72,
        scuffF: 1500, scuffQ: 0.8, scuffDec: 0.16, scuffAmt: 0.30,
        scuffPre: 0.012, scuffSweep: true,
        ring: [[196, 0.10, 0.09], [330, 0.06, 0.05]],
      }, r);
      // the drag of the second foot
      const n = nsrc(c, 0.3, 8700 + r.i(400));
      const bp = filt(c, 'bandpass', 900, 0.9);
      const g = gain(c, 0);
      n.connect(bp); bp.connect(g); g.connect(out);
      ad(g.gain, t0 + 0.09, 0.03, 0.14, 0.13);
      sweep(bp.frequency, t0 + 0.09, 1400, 600, 0.14);
      go(n, t0, t0 + 0.35);
    },
  });

  const DEATHS = [
    { f0: 82, v: 'uh', dur: 1.10, bend: -0.42 },
    { f0: 66, v: 'oh', dur: 1.45, bend: -0.35 },
    { f0: 108, v: 'aa', dur: 0.95, bend: -0.50 },
    { f0: 91, v: 'er', dur: 1.30, bend: -0.38 },
  ];
  for (let i = 0; i < DEATHS.length; i++) {
    (function (m, idx) {
      def('zom_death_' + (idx + 1), {
        dur: m.dur + 0.45, gain: 0.9, rev: 0.45, variants: 2, prio: 0.75,
        vary: { rate: 0.10, gain: 0.16 },
        build: function (c, out, t0, r, ctl) {
          vocal(c, out, t0, {
            dur: m.dur, f0: m.f0 * r.range(0.92, 1.09), bend: m.bend, lvl: 0.66,
            formants: VOWEL[m.v], tone: 1700, toneQ: 0.8, dist: 2.2,
            breath: 0.55, breathF: 780, breathQ: 0.7,
            wobbleHz: 3.2, wobble: 0.06, jitter: 0.03,
            ampWobbleHz: 11, ampWobble: 0.30, ampJitter: 0.10, sub: 0.4,
            toneSweep: [2600, 420],
            shape: function (t) {
              const a = Math.min(1, t / 0.05);
              return Math.max(MIN, a * Math.pow(1 - t, 1.6));   // collapsing
            },
          }, r, ctl);
          // body hitting the boards at the end
          impact(c, out, t0 + m.dur * 0.82, {
            lvl: 0.6, thump: [96, 34, 0.22, 0.7],
            splat: { f: 500, q: 0.9, dec: 0.16, amt: 0.28, sweep: [2.0, 0.4] },
          }, r);
        },
      });
    }(DEATHS[i], i));
  }

  def('zom_gib', {
    dur: 0.90, gain: 1.0, rev: 0.40, variants: 3, prio: 0.85,
    vary: { rate: 0.10, gain: 0.14 },
    build: function (c, out, t0, r) {
      impact(c, out, t0, {
        lvl: 0.9,
        thump: [110, 30, 0.26, 0.85],
        splat: { f: 900, q: 0.8, dec: 0.34, amt: 0.8, sweep: [3.2, 0.28] },
        crack: { f: 2100, q: 4, dec: 0.045, amt: 0.5, dist: 3.5 },
        squelch: { f0: 340, f1: 62, dec: 0.30, amt: 0.42 },
      }, r);
      // scattering chunks
      for (let i = 0; i < 5; i++) {
        const t = t0 + 0.06 + r.f() * 0.28;
        const n = nsrc(c, 0.12, 8800 + r.i(400));
        const bp = filt(c, 'bandpass', r.range(400, 1600), 1.6);
        const g = gain(c, 0);
        n.connect(bp); bp.connect(g); g.connect(out);
        ad(g.gain, t, 0.002, r.range(0.03, 0.09), r.range(0.10, 0.24));
        go(n, t, t + 0.16);
      }
    },
  });

  def('zom_spawn_crawl', {
    dur: 1.90, gain: 0.75, rev: 0.40, variants: 3, prio: 0.6,
    vary: { rate: 0.10, gain: 0.16 },
    build: function (c, out, t0, r) {
      // dragging a body through a broken window: a long wooden scrape with
      // stick-slip grit, plus knees and elbows knocking the frame
      const n = nsrc(c, 1.6, 8900 + r.i(400), true);
      const bp = filt(c, 'bandpass', 1300, 2.6);
      const g = gain(c, 0);
      const w = shaper(c, 1.6);
      n.connect(bp); bp.connect(g); g.connect(w); w.connect(out);
      const N = 64, env = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const grip = 0.55 + 0.45 * Math.sin(t * 34 + r.f() * 6);
        env[i] = Math.max(MIN, 0.34 * grip * Math.sin(Math.PI * Math.pow(t, 0.8)));
      }
      try { g.gain.setValueCurveAtTime(env, t0, 1.5); }
      catch (e) { ahr(g.gain, t0, 0.2, 0.9, 0.4, 0.3); }
      sweep(bp.frequency, t0, 900, 2200, 1.5);
      go(n, t0, t0 + 1.6);
      // three knocks against the frame
      for (let i = 0; i < 3; i++) {
        const t = t0 + 0.25 + i * r.range(0.38, 0.52);
        impact(c, out, t, {
          lvl: 0.4, thump: [150, 58, 0.11, 0.6],
          splat: { f: 1100, q: 1.6, dec: 0.05, amt: 0.22 },
        }, r);
      }
    },
  });

  // ---- the alarm bell of the whole game: boards coming off the window -------
  for (let i = 0; i < 3; i++) {
    (function (idx) {
      def('zom_board_pull_' + (idx + 1), {
        dur: 1.60, gain: 1.0, rev: 0.45, variants: 3, prio: 1.0,
        vary: { rate: 0.08, gain: 0.12 },
        build: function (c, out, t0, r) {
          const mst = gain(c, 0.8);
          mst.connect(out);

          // 1. nails screeching out of the frame — high-Q resonance with
          //    stick-slip amplitude modulation, sweeping as the plank lifts
          const saw = osc(c, 'sawtooth', 2600 + idx * 340);
          const scr = filt(c, 'bandpass', 3000, 22);
          const sg = gain(c, 0);
          const sw = shaper(c, 2.2);
          saw.connect(scr); scr.connect(sg); sg.connect(sw); sw.connect(mst);
          sweep(saw.frequency, t0 + 0.05, 2700 + idx * 300, 1250, 0.55);
          sweep(scr.frequency, t0 + 0.05, 3400, 1500, 0.55);
          const N = 72, env = new Float32Array(N);
          for (let k = 0; k < N; k++) {
            const t = k / (N - 1);
            const slip = 0.35 + 0.65 * Math.abs(Math.sin(t * (18 + idx * 5) + r.f() * 3));
            env[k] = Math.max(MIN, 0.30 * slip * Math.pow(1 - t, 0.9));
          }
          try { sg.gain.setValueCurveAtTime(env, t0 + 0.05, 0.6); }
          catch (e) { ad(sg.gain, t0 + 0.05, 0.02, 0.55, 0.28); }
          go(saw, t0, t0 + 0.7);

          // 2. wood fibres tearing — dense random crackles
          for (let k = 0; k < 14; k++) {
            const t = t0 + 0.02 + Math.pow(r.f(), 0.7) * 0.62;
            const n = nsrc(c, 0.05, 9000 + r.i(500));
            const bp = filt(c, 'bandpass', r.range(900, 3400), r.range(3, 9));
            const g = gain(c, 0);
            n.connect(bp); bp.connect(g); g.connect(mst);
            ad(g.gain, t, 0.0006, r.range(0.008, 0.035), r.range(0.12, 0.42));
            go(n, t, t + 0.08);
          }

          // 3. the plank finally snapping free — the moment you must react to
          const tb = t0 + 0.60 + idx * 0.05;
          impact(c, mst, tb, {
            lvl: 0.95,
            thump: [148, 52, 0.20, 0.9],
            splat: { f: 1700, q: 1.2, dec: 0.14, amt: 0.6, sweep: [2.6, 0.4] },
            crack: { f: 980, q: 8, dec: 0.05, amt: 0.85, dist: 3.2 },
          }, r);
          // splintered board clattering to the floor
          for (let k = 0; k < 4; k++) {
            const t = tb + 0.12 + r.f() * 0.5;
            clack(c, mst, t, {
              lvl: r.range(0.14, 0.30), hp: 500, lp: 4200, dec: 0.02, amt: 0.7,
              ring: [[r.range(320, 780), r.range(0.05, 0.13), 0.22]],
              body: [r.range(110, 190), 0.07, 0.16],
            }, r);
          }
        },
      });
    }(i));
  }

  def('zom_hit_flesh', {
    dur: 0.45, gain: 0.85, rev: 0.22, variants: 5, prio: 0.6,
    vary: { rate: 0.14, gain: 0.20 },
    build: function (c, out, t0, r) {
      impact(c, out, t0, {
        lvl: 0.8,
        thump: [175, 62, 0.10, 0.55],
        splat: { f: 780, q: 0.9, dec: 0.12, amt: 0.6, sweep: [2.8, 0.35] },
        squelch: { f0: 300, f1: 90, dec: 0.11, amt: 0.22 },
      }, r);
    },
  });

  def('zom_hit_head', {
    dur: 0.55, gain: 1.0, rev: 0.26, variants: 5, prio: 0.8,
    vary: { rate: 0.12, gain: 0.16 },
    build: function (c, out, t0, r) {
      // sharper, harder, with a bone crack on top of a tighter splat
      impact(c, out, t0, {
        lvl: 0.95,
        thump: [205, 70, 0.09, 0.5],
        splat: { f: 1250, q: 1.3, dec: 0.10, amt: 0.55, sweep: [3.0, 0.3] },
        crack: { f: 2500, q: 9, dec: 0.028, amt: 0.9, dist: 4.0 },
        squelch: { f0: 420, f1: 120, dec: 0.13, amt: 0.24 },
      }, r);
      const n = nsrc(c, 0.1, 9200 + r.i(400));
      const hp = filt(c, 'highpass', 4200, 0.8);
      const g = gain(c, 0);
      n.connect(hp); hp.connect(g); g.connect(out);
      ad(g.gain, t0, 0.0004, 0.012, 0.45);
      go(n, t0, t0 + 0.1);
    },
  });

  // ---------------------------------------------------------------------------
  // 5.4 PLAYER
  // ---------------------------------------------------------------------------
  const STEP_SURFACES = {
    wood:     { thumpF: 105, thumpDec: 0.075, thumpAmt: 0.62, scuffF: 2100, scuffQ: 0.9,
                scuffDec: 0.055, scuffAmt: 0.26, ring: [[248, 0.075, 0.13], [412, 0.045, 0.07]] },
    dirt:     { thumpF: 82,  thumpDec: 0.065, thumpAmt: 0.5,  scuffF: 1250, scuffQ: 0.6,
                scuffDec: 0.085, scuffAmt: 0.30, scuffSweep: true },
    concrete: { thumpF: 128, thumpDec: 0.045, thumpAmt: 0.44, scuffF: 3400, scuffQ: 1.3,
                scuffDec: 0.038, scuffAmt: 0.34, ring: [[720, 0.03, 0.05]] },
  };
  ['wood', 'dirt', 'concrete'].forEach(function (surf) {
    const base = STEP_SURFACES[surf];
    def('plr_step_' + surf, {
      dur: 0.35, gain: 0.5, rev: 0.18, variants: 4, prio: 0.25,
      vary: { rate: 0.18, gain: 0.24, lp: 0.15 },
      build: function (c, out, t0, r) {
        const p = {};
        for (const k in base) p[k] = base[k];
        p.lvl = 0.55 * r.range(0.85, 1.12);
        p.thumpF = base.thumpF * r.range(0.88, 1.14);
        p.scuffF = base.scuffF * r.range(0.85, 1.2);
        footstep(c, out, t0, p, r);
      },
    });
    // Explicit per-variation ids so gameplay can round-robin instead of
    // randomising — same four baked buffers, addressed directly.
    for (let v = 0; v < 4; v++) alias('plr_step_' + surf + '_' + (v + 1), 'plr_step_' + surf, v);
  });

  def('plr_jump', {
    dur: 0.45, gain: 0.55, rev: 0.16, variants: 3, prio: 0.4,
    vary: { rate: 0.10, gain: 0.14 },
    build: function (c, out, t0, r) {
      // gear rustle + a short exhale
      const n = nsrc(c, 0.3, 9400 + r.i(400));
      const bp = filt(c, 'bandpass', 1800, 0.8);
      const g = gain(c, 0);
      n.connect(bp); bp.connect(g); g.connect(out);
      ad(g.gain, t0, 0.012, 0.16, 0.28);
      sweep(bp.frequency, t0, 1300, 2600, 0.16);
      go(n, t0, t0 + 0.35);
      const n2 = nsrc(c, 0.25, 9410 + r.i(400));
      const bp2 = filt(c, 'bandpass', 620, 2.2);
      const g2 = gain(c, 0);
      n2.connect(bp2); bp2.connect(g2); g2.connect(out);
      ad(g2.gain, t0 + 0.01, 0.02, 0.14, 0.22);
      go(n2, t0, t0 + 0.3);
    },
  });

  def('plr_land', {
    dur: 0.50, gain: 0.7, rev: 0.20, variants: 3, prio: 0.5,
    vary: { rate: 0.10, gain: 0.14 },
    build: function (c, out, t0, r) {
      footstep(c, out, t0, {
        lvl: 0.85, thumpF: 88, thumpDec: 0.13, thumpAmt: 0.85,
        scuffF: 1700, scuffQ: 0.8, scuffDec: 0.09, scuffAmt: 0.32,
        ring: [[212, 0.12, 0.16], [356, 0.07, 0.08]],
      }, r);
      const n = nsrc(c, 0.2, 9420 + r.i(300));
      const hp = filt(c, 'highpass', 2400, 0.7);
      const g = gain(c, 0);
      n.connect(hp); hp.connect(g); g.connect(out);
      ad(g.gain, t0 + 0.01, 0.01, 0.12, 0.16);
      go(n, t0, t0 + 0.25);
    },
  });

  def('plr_land_hard', {
    dur: 0.85, gain: 0.95, rev: 0.30, variants: 3, prio: 0.7,
    vary: { rate: 0.08, gain: 0.12 },
    build: function (c, out, t0, r) {
      footstep(c, out, t0, {
        lvl: 1.0, thumpF: 64, thumpDec: 0.26, thumpAmt: 1.0,
        scuffF: 1400, scuffQ: 0.7, scuffDec: 0.16, scuffAmt: 0.40,
        ring: [[172, 0.22, 0.20], [286, 0.14, 0.11], [455, 0.08, 0.06]],
      }, r);
      // knees and kit taking the shock
      impact(c, out, t0 + 0.012, {
        lvl: 0.5, thump: [118, 40, 0.18, 0.55],
        splat: { f: 900, q: 0.8, dec: 0.10, amt: 0.22 },
      }, r);
      const gr = nsrc(c, 0.3, 9430 + r.i(300));
      const bp = filt(c, 'bandpass', 480, 2.6);
      const g = gain(c, 0);
      gr.connect(bp); bp.connect(g); g.connect(out);
      ad(g.gain, t0 + 0.03, 0.02, 0.24, 0.26);
      sweep(bp.frequency, t0 + 0.03, 620, 320, 0.24);
      go(gr, t0, t0 + 0.4);
    },
  });

  for (let i = 0; i < 3; i++) {
    (function (idx) {
      const f0 = [148, 122, 176][idx];
      def('plr_hurt_' + (idx + 1), {
        dur: 0.75, gain: 0.9, rev: 0.24, variants: 2, prio: 0.85,
        vary: { rate: 0.07, gain: 0.10 },
        build: function (c, out, t0, r, ctl) {
          vocal(c, out, t0, {
            dur: 0.48, f0: f0 * r.range(0.95, 1.06), bend: -0.24, lvl: 0.62,
            formants: VOWEL.uh, tone: 2600, toneQ: 0.8, dist: 2.4,
            breath: 0.5, breathF: 1500, breathQ: 0.8,
            wobbleHz: 6, wobble: 0.04, jitter: 0.02,
            ampWobbleHz: 12, ampWobble: 0.18, ampJitter: 0.06, sub: 0.2,
            toneSweep: [3600, 900],
            shape: function (t) {
              const a = Math.min(1, t / 0.03);
              return Math.max(MIN, a * Math.pow(1 - t, 1.4));
            },
          }, r, ctl);
          // sharp inhale after the hit
          const n = nsrc(c, 0.3, 9500 + r.i(300));
          const bp = filt(c, 'bandpass', 1900, 1.0);
          const g = gain(c, 0);
          n.connect(bp); bp.connect(g); g.connect(out);
          ad(g.gain, t0 + 0.30, 0.05, 0.18, 0.20);
          sweep(bp.frequency, t0 + 0.30, 1200, 2600, 0.2);
          go(n, t0 + 0.28, t0 + 0.62);
        },
      });
    }(i));
  }

  // Ragged breathing at low health — loops seamlessly (silence at both ends).
  def('plr_breath_hurt', {
    dur: 3.20, gain: 0.55, rev: 0.20, loop: true, prio: 0.9,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.85);
      mst.connect(out);
      // inhale (rising band) / exhale (falling band), twice, with a voiced rasp
      const beats = [[0.05, 0.55, 1, 0.9], [0.72, 0.62, 0, 0.75],
                     [1.62, 0.50, 1, 1.0], [2.24, 0.66, 0, 0.7]];
      for (let i = 0; i < beats.length; i++) {
        const b = beats[i];
        const n = nsrc(c, b[1] + 0.15, 9600 + i * 7 + r.i(200));
        const bp = filt(c, 'bandpass', 1200, 0.75);
        const g = gain(c, 0);
        n.connect(bp); bp.connect(g); g.connect(mst);
        const t = t0 + b[0];
        g.gain.setValueAtTime(MIN, t);
        g.gain.exponentialRampToValueAtTime(0.34 * b[3], t + b[1] * 0.42);
        g.gain.exponentialRampToValueAtTime(MIN, t + b[1]);
        if (b[2]) sweep(bp.frequency, t, 700, 2300, b[1]);
        else sweep(bp.frequency, t, 2100, 620, b[1]);
        go(n, t, t + b[1] + 0.1);
        // rasp: a low voiced buzz under the exhales only
        if (!b[2]) {
          const o = osc(c, 'sawtooth', 96 * r.range(0.94, 1.07));
          const f1 = filt(c, 'bandpass', 520, 6);
          const gg = gain(c, 0);
          o.connect(f1); f1.connect(gg); gg.connect(mst);
          ad(gg.gain, t + 0.03, 0.05, b[1] * 0.7, 0.16);
          sweep(o.frequency, t, 104, 82, b[1]);
          go(o, t, t + b[1] + 0.05);
        }
      }
    },
  });

  def('plr_heartbeat', {
    dur: 1.05, gain: 0.7, rev: 0.10, loop: true, prio: 0.9,
    build: function (c, out, t0, r) {
      const mst = gain(c, 1.0);
      mst.connect(out);
      const beat = function (t, amp, f0) {
        const o = osc(c, 'sine', f0);
        sweep(o.frequency, t, f0, f0 * 0.42, 0.16);
        const g = gain(c, 0);
        o.connect(g); g.connect(mst);
        ad(g.gain, t, 0.006, 0.15, amp);
        go(o, t, t + 0.22);
        // the muffled thud of the chest wall
        const n = nsrc(c, 0.16, 9700 + Math.round(t * 1000) % 300);
        const lp = filt(c, 'lowpass', 260, 0.9);
        const gg = gain(c, 0);
        n.connect(lp); lp.connect(gg); gg.connect(mst);
        ad(gg.gain, t, 0.004, 0.10, amp * 0.55);
        go(n, t, t + 0.2);
      };
      beat(t0 + 0.02, 0.85, 58);
      beat(t0 + 0.30, 0.55, 50);
    },
  });

  def('plr_downed', {
    dur: 3.20, gain: 1.0, rev: 0.55, prio: 1.0,
    build: function (c, out, t0, r, ctl) {
      const mst = gain(c, 0.9);
      mst.connect(out);
      // body hitting the floor
      impact(c, mst, t0, {
        lvl: 0.9, thump: [72, 26, 0.42, 1.0],
        splat: { f: 620, q: 0.7, dec: 0.24, amt: 0.34, sweep: [2.2, 0.35] },
      }, r);
      // long groan collapsing in pitch
      vocal(c, mst, t0 + 0.05, {
        dur: 1.6, f0: 118, bend: -0.55, lvl: 0.55,
        formants: VOWEL.uh, tone: 1500, toneQ: 0.8, dist: 2.0,
        breath: 0.5, breathF: 900, breathQ: 0.7,
        wobbleHz: 3, wobble: 0.06, jitter: 0.03,
        ampWobbleHz: 7, ampWobble: 0.24, ampJitter: 0.1, sub: 0.4,
        toneSweep: [2400, 380],
        shape: function (t) { return Math.max(MIN, Math.min(1, t / 0.06) * Math.pow(1 - t, 1.5)); },
      }, r, ctl);
      // the world going away — a falling sub drone with heavy filtering
      const fs = [110, 82.5, 55];
      for (let i = 0; i < fs.length; i++) {
        const o = osc(c, 'sawtooth', fs[i]);
        sweep(o.frequency, t0 + 0.1, fs[i], fs[i] * 0.5, 2.4);
        const lp = filt(c, 'lowpass', 700, 1.6);
        sweep(lp.frequency, t0 + 0.1, 900, 160, 2.4);
        const g = gain(c, 0);
        o.connect(lp); lp.connect(g); g.connect(mst);
        ad(g.gain, t0 + 0.1, 0.35, 2.3, 0.22);
        go(o, t0, t0 + 2.9);
      }
    },
  });

  def('plr_revive', {
    dur: 2.40, gain: 0.9, rev: 0.45, prio: 1.0,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.85);
      mst.connect(out);
      // rising hopeful swell — the only major-ish chord in the whole game
      const fs = [147, 220.5, 294, 441];
      for (let i = 0; i < fs.length; i++) {
        const o = osc(c, 'triangle', fs[i] * 0.5);
        sweep(o.frequency, t0, fs[i] * 0.5, fs[i], 1.1);
        const lp = filt(c, 'lowpass', 900, 1.0);
        sweep(lp.frequency, t0, 500, 4200, 1.2);
        const g = gain(c, 0);
        o.connect(lp); lp.connect(g); g.connect(mst);
        swell(g.gain, t0 + i * 0.06, 1.0, 0.18, 0.9);
        go(o, t0, t0 + 2.2);
      }
      // gasp back to life
      const n = nsrc(c, 0.6, 9800 + r.i(200));
      const bp = filt(c, 'bandpass', 1400, 0.9);
      const g = gain(c, 0);
      n.connect(bp); bp.connect(g); g.connect(mst);
      ad(g.gain, t0 + 0.95, 0.04, 0.42, 0.32);
      sweep(bp.frequency, t0 + 0.95, 800, 2600, 0.4);
      go(n, t0 + 0.9, t0 + 1.6);
      fmBell(c, mst, t0 + 1.05, 587.33, 1.1, 0.16, 3.5, 3.0, r);
    },
  });

  def('plr_knife_swing', {
    dur: 0.35, gain: 0.6, rev: 0.16, variants: 4, prio: 0.5,
    vary: { rate: 0.12, gain: 0.16 },
    build: function (c, out, t0, r) {
      const n = nsrc(c, 0.25, 9900 + r.i(400));
      const bp = filt(c, 'bandpass', 1400, 2.2);
      const g = gain(c, 0);
      n.connect(bp); bp.connect(g); g.connect(out);
      g.gain.setValueAtTime(MIN, t0);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.055);
      g.gain.exponentialRampToValueAtTime(MIN, t0 + 0.16);
      bp.frequency.setValueAtTime(700, t0);
      bp.frequency.exponentialRampToValueAtTime(3200, t0 + 0.055);
      bp.frequency.exponentialRampToValueAtTime(900, t0 + 0.16);
      go(n, t0, t0 + 0.3);
    },
  });

  def('plr_knife_hit', {
    dur: 0.55, gain: 0.85, rev: 0.24, variants: 4, prio: 0.7,
    vary: { rate: 0.10, gain: 0.16 },
    build: function (c, out, t0, r) {
      impact(c, out, t0, {
        lvl: 0.85,
        thump: [190, 70, 0.09, 0.5],
        splat: { f: 1450, q: 1.2, dec: 0.13, amt: 0.6, sweep: [2.6, 0.3] },
        crack: { f: 3200, q: 7, dec: 0.02, amt: 0.5, dist: 3 },
        squelch: { f0: 380, f1: 100, dec: 0.16, amt: 0.28 },
      }, r);
      clack(c, out, t0 + 0.005, { lvl: 0.25, hp: 2600, lp: 11000, dec: 0.008, amt: 0.7,
                                  ring: [[4600, 0.05, 0.2]] }, r);
    },
  });

  // ---------------------------------------------------------------------------
  // 5.5 BARRICADE / INTERACTION
  // ---------------------------------------------------------------------------
  def('board_repair', {
    dur: 0.60, gain: 0.9, rev: 0.30, variants: 4, prio: 0.8,
    vary: { rate: 0.06, gain: 0.10 },
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.85);
      mst.connect(out);
      // hammer face on nail head — bright, immediate
      clack(c, mst, t0, {
        lvl: 0.7, hp: 1800, lp: 12000, dec: 0.007, amt: 0.95,
        ring: [[3900 * r.range(0.97, 1.03), 0.035, 0.30], [6100, 0.018, 0.14]],
      }, r);
      // plank body resonance — this is what makes six in a row feel musical
      const modes = [[196, 0.16, 0.34], [412, 0.10, 0.20], [905, 0.055, 0.11]];
      for (let i = 0; i < modes.length; i++) {
        const m = modes[i];
        const o = osc(c, 'triangle', m[0] * r.range(0.985, 1.02));
        const g = gain(c, 0);
        o.connect(g); g.connect(mst);
        ad(g.gain, t0, 0.0018, m[1], m[2]);
        go(o, t0, t0 + m[1] + 0.06);
      }
      // low wooden thunk
      const o = osc(c, 'sine', 112);
      sweep(o.frequency, t0, 118, 62, 0.14);
      const g = gain(c, 0);
      o.connect(g); g.connect(mst);
      ad(g.gain, t0, 0.0022, 0.15, 0.62);
      go(o, t0, t0 + 0.22);
      // nail biting into wood
      const n = nsrc(c, 0.1, 10100 + r.i(300));
      const bp = filt(c, 'bandpass', 2600, 2.4);
      const gg = gain(c, 0);
      n.connect(bp); bp.connect(gg); gg.connect(mst);
      ad(gg.gain, t0, 0.001, 0.035, 0.28);
      sweep(bp.frequency, t0, 3400, 1700, 0.04);
      go(n, t0, t0 + 0.14);
    },
  });

  def('buy_weapon', {
    dur: 1.10, gain: 0.8, rev: 0.20, bus: 'ui', prio: 0.9,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.7);
      mst.connect(out);
      // cash register clunk + a rising two-note confirm
      clack(c, mst, t0, { lvl: 0.5, hp: 700, lp: 6000, dec: 0.016, amt: 0.8,
                          ring: [[1180, 0.09, 0.24]], body: [150, 0.10, 0.22] }, r);
      fmBell(c, mst, t0 + 0.02, 523.25, 0.42, 0.22, 3.5, 2.4, r);
      fmBell(c, mst, t0 + 0.14, 783.99, 0.62, 0.20, 3.5, 2.2, r);
      // the weight of the weapon landing in your hands
      const o = osc(c, 'sine', 96);
      sweep(o.frequency, t0 + 0.16, 100, 54, 0.24);
      const g = gain(c, 0);
      o.connect(g); g.connect(mst);
      ad(g.gain, t0 + 0.16, 0.008, 0.28, 0.35);
      go(o, t0, t0 + 0.55);
    },
  });

  def('buy_ammo', {
    dur: 0.75, gain: 0.75, rev: 0.18, bus: 'ui', prio: 0.8,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.7);
      mst.connect(out);
      clack(c, mst, t0, { lvl: 0.42, hp: 900, lp: 7000, dec: 0.012, amt: 0.75,
                          ring: [[1560, 0.06, 0.2]] }, r);
      fmBell(c, mst, t0 + 0.01, 659.25, 0.34, 0.20, 3.5, 2.2, r);
      fmBell(c, mst, t0 + 0.10, 987.77, 0.40, 0.16, 3.5, 2.0, r);
      // rounds rattling into the pouches
      for (let i = 0; i < 6; i++) {
        const t = t0 + 0.05 + r.f() * 0.28;
        clack(c, mst, t, { lvl: r.range(0.05, 0.13), hp: 2200, lp: 9000, dec: 0.006, amt: 0.8,
                           ring: [[r.range(2400, 4200), 0.02, 0.2]] }, r);
      }
    },
  });

  def('buy_fail', {
    dur: 0.70, gain: 0.8, rev: 0.16, bus: 'ui', prio: 0.85,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.75);
      mst.connect(out);
      // the "no points" thud: dead low knock, then a flat descending buzz
      const o = osc(c, 'sine', 92);
      sweep(o.frequency, t0, 96, 48, 0.16);
      const g = gain(c, 0);
      o.connect(g); g.connect(mst);
      ad(g.gain, t0, 0.003, 0.18, 0.7);
      go(o, t0, t0 + 0.26);
      const sq = osc(c, 'square', 220);
      sweep(sq.frequency, t0 + 0.03, 218, 158, 0.22);
      const lp = filt(c, 'lowpass', 900, 1.4);
      const g2 = gain(c, 0);
      const w = shaper(c, 2.0);
      sq.connect(lp); lp.connect(w); w.connect(g2); g2.connect(mst);
      ad(g2.gain, t0 + 0.03, 0.006, 0.24, 0.24);
      go(sq, t0, t0 + 0.35);
      const n = nsrc(c, 0.2, 10200 + r.i(200));
      const lp2 = filt(c, 'lowpass', 480, 0.8);
      const g3 = gain(c, 0);
      n.connect(lp2); lp2.connect(g3); g3.connect(mst);
      ad(g3.gain, t0, 0.002, 0.13, 0.3);
      go(n, t0, t0 + 0.25);
    },
  });

  def('debris_clear', {
    dur: 2.60, gain: 0.95, rev: 0.45, prio: 0.9,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.85);
      mst.connect(out);
      // heavy rubble dragging: broadband grind with a slow swell
      const n = nsrc(c, 2.2, 10300 + r.i(300), true);
      const bp = filt(c, 'bandpass', 700, 1.1);
      const w = shaper(c, 1.7);
      const g = gain(c, 0);
      n.connect(bp); bp.connect(w); w.connect(g); g.connect(mst);
      const N = 80, env = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const grind = 0.6 + 0.4 * Math.sin(t * 41 + r.f() * 5);
        env[i] = Math.max(MIN, 0.4 * grind * Math.sin(Math.PI * Math.pow(t, 0.75)));
      }
      try { g.gain.setValueCurveAtTime(env, t0, 2.0); }
      catch (e) { ahr(g.gain, t0, 0.3, 1.2, 0.5, 0.35); }
      sweep(bp.frequency, t0, 420, 1500, 2.0);
      go(n, t0, t0 + 2.2);
      // planks and bricks clattering loose along the way
      for (let i = 0; i < 11; i++) {
        const t = t0 + 0.15 + Math.pow(r.f(), 0.8) * 1.8;
        impact(c, mst, t, {
          lvl: r.range(0.16, 0.42),
          thump: [r.range(90, 170), r.range(40, 70), r.range(0.08, 0.18), 0.6],
          splat: { f: r.range(700, 2400), q: 1.4, dec: r.range(0.03, 0.09), amt: 0.35 },
        }, r);
      }
      // final settle
      impact(c, mst, t0 + 2.0, {
        lvl: 0.6, thump: [78, 30, 0.32, 0.8],
        splat: { f: 900, q: 0.8, dec: 0.2, amt: 0.3, sweep: [2, 0.4] },
      }, r);
    },
  });

  def('perk_buy', {
    // FIX: measured RMS was 27.5 dB under round_end — spending points on a
    // perk must read clearly over a firefight, not disappear under one.
    // Raised the def gain and every internal stage, not just the outer one.
    dur: 1.20, gain: 1.15, rev: 0.28, bus: 'ui', prio: 0.9,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.95);
      mst.connect(out);
      // coin drop into the machine, mechanism, can released
      for (let i = 0; i < 3; i++) {
        clack(c, mst, t0 + i * 0.075, { lvl: 0.32, hp: 2400, lp: 12000, dec: 0.01, amt: 0.9,
                                        ring: [[r.range(3200, 5200), 0.06, 0.42]] }, r);
      }
      const n = nsrc(c, 0.5, 10400 + r.i(200));
      const bp = filt(c, 'bandpass', 1200, 1.8);
      const g = gain(c, 0);
      n.connect(bp); bp.connect(g); g.connect(mst);
      ad(g.gain, t0 + 0.24, 0.02, 0.28, 0.28);
      sweep(bp.frequency, t0 + 0.24, 900, 1900, 0.3);
      go(n, t0 + 0.22, t0 + 0.75);
      clack(c, mst, t0 + 0.62, { lvl: 0.8, hp: 500, lp: 6000, dec: 0.02, amt: 1.0,
                                 ring: [[840, 0.14, 0.36], [1580, 0.08, 0.20]], body: [130, 0.12, 0.34] }, r);
    },
  });

  def('perk_drink', {
    // FIX: measured RMS was 27.5 dB under round_end — three sparse gulps and
    // a fizz across 2.4 s read as inaudible next to anything else in the
    // mix. Raised every stage (tab pop, fizz, gulps, can drops), not just
    // the outer gain, so both peak and RMS move.
    dur: 2.40, gain: 1.2, rev: 0.24, bus: 'ui', prio: 0.9,
    build: function (c, out, t0, r) {
      const mst = gain(c, 1.0);
      mst.connect(out);
      // pop the tab
      clack(c, mst, t0, { lvl: 0.55, hp: 3000, lp: 14000, dec: 0.006, amt: 1.0,
                          ring: [[5400, 0.04, 0.34]] }, r);
      const fizz = nsrc(c, 1.2, 10500 + r.i(200));
      const hp = filt(c, 'highpass', 4200, 0.7);
      const fg = gain(c, 0);
      fizz.connect(hp); hp.connect(fg); fg.connect(mst);
      ad(fg.gain, t0 + 0.02, 0.03, 1.0, 0.18);
      go(fizz, t0, t0 + 1.3);
      // three gulps — resonant swept blips, throat-shaped
      for (let i = 0; i < 3; i++) {
        const t = t0 + 0.22 + i * 0.34;
        const o = osc(c, 'sine', 180);
        sweep(o.frequency, t, 260, 120, 0.16);
        const bp = filt(c, 'bandpass', 620, 5);
        sweep(bp.frequency, t, 900, 380, 0.16);
        const g = gain(c, 0);
        o.connect(bp); bp.connect(g); g.connect(mst);
        ad(g.gain, t, 0.012, 0.15, 0.68);
        go(o, t, t + 0.24);
        const n = nsrc(c, 0.2, 10510 + i * 5 + r.i(100));
        const b2 = filt(c, 'bandpass', 1400, 1.4);
        const g2 = gain(c, 0);
        n.connect(b2); b2.connect(g2); g2.connect(mst);
        ad(g2.gain, t, 0.008, 0.12, 0.24);
        go(n, t, t + 0.2);
      }
      // can dropped on the floorboards
      const tc = t0 + 1.45;
      for (let i = 0; i < 4; i++) {
        const t = tc + i * r.range(0.06, 0.15);
        clack(c, mst, t, {
          lvl: r.range(0.18, 0.42) * (1 - i * 0.18), hp: 1200, lp: 9000, dec: 0.01, amt: 0.95,
          ring: [[r.range(1600, 2600), 0.07, 0.4], [r.range(3600, 5200), 0.03, 0.20]],
          body: [r.range(180, 260), 0.05, 0.18],
        }, r);
      }
    },
  });

  // one short jingle per perk machine — each machine must be identifiable from
  // across the map by its melody alone
  const PERK_JINGLES = {
    jugg:   { notes: [[0, 130.81, 0.55], [0.16, 155.56, 0.5], [0.32, 196.00, 0.5], [0.50, 261.63, 0.85]],
              type: 'triangle', ratio: 2.0, index: 2.2, lp: 1400 },
    speed:  { notes: [[0, 523.25, 0.30], [0.09, 659.25, 0.28], [0.18, 783.99, 0.28], [0.27, 1046.5, 0.5]],
              type: 'square', ratio: 3.5, index: 3.0, lp: 5200 },
    double: { notes: [[0, 392.00, 0.35], [0.12, 392.00, 0.30], [0.24, 587.33, 0.35], [0.36, 587.33, 0.6]],
              type: 'sawtooth', ratio: 2.5, index: 2.6, lp: 3200 },
    revive: { notes: [[0, 349.23, 0.45], [0.20, 293.66, 0.42], [0.40, 246.94, 0.42], [0.62, 220.00, 0.9]],
              type: 'sine', ratio: 4.5, index: 3.6, lp: 2600 },
  };
  Object.keys(PERK_JINGLES).forEach(function (k) {
    const J = PERK_JINGLES[k];
    def('perk_jingle_' + k, {
      dur: 2.20, gain: 0.7, rev: 0.40, bus: 'ui', prio: 0.75,
      build: function (c, out, t0, r) {
        const mst = gain(c, 0.55);
        const lp = filt(c, 'lowpass', J.lp, 0.9);
        mst.connect(lp); lp.connect(out);
        for (let i = 0; i < J.notes.length; i++) {
          const n = J.notes[i];
          fmBell(c, mst, t0 + n[0], n[1], n[2] * 1.6, 0.24, J.ratio, J.index, r);
          // a thin detuned double an octave up gives the machines their cheap
          // 1940s-radio character
          const o = osc(c, J.type, n[1] * 2.005);
          const g = gain(c, 0);
          o.connect(g); g.connect(mst);
          ad(g.gain, t0 + n[0], 0.006, n[2] * 0.8, 0.07);
          go(o, t0 + n[0], t0 + n[0] + n[2] + 0.06);
        }
      },
    });
  });

  def('machine_hum', {
    dur: 2.0, gain: 0.35, rev: 0.30, bus: 'ambient', loop: true, live: true, prio: 0.2,
    build: function (c, out, t0, r, ctl) {
      const mst = gain(c, 0.5);
      const lp = filt(c, 'lowpass', 420, 1.1);
      mst.connect(lp); lp.connect(out);
      // mains buzz: 60 Hz + harmonics, slightly unstable
      const fs = [60, 120, 180, 240];
      const amps = [0.5, 0.26, 0.12, 0.06];
      for (let i = 0; i < fs.length; i++) {
        const o = osc(c, i ? 'sawtooth' : 'triangle', fs[i]);
        o.detune.value = r.sym(6);
        const g = gain(c, amps[i]);
        o.connect(g); g.connect(mst);
        go(o, t0);
        if (ctl) ctl.reg(o);
      }
      // compressor cycling on and off
      const am = osc(c, 'sine', 0.37);
      const amg = gain(c, 0.22);
      am.connect(amg); amg.connect(mst.gain);
      go(am, t0); if (ctl) ctl.reg(am);
      // faint electrical whine from the cooling coil
      const wh = osc(c, 'triangle', 2380);
      const wg = gain(c, 0.012);
      wh.connect(wg); wg.connect(out);
      go(wh, t0); if (ctl) ctl.reg(wh);
      // refrigeration hiss
      const n = nsrc(c, 2.0, 10600, true);
      const bp = filt(c, 'bandpass', 1600, 0.8);
      const ng = gain(c, 0.035);
      n.connect(bp); bp.connect(ng); ng.connect(out);
      go(n, t0); if (ctl) ctl.reg(n);
    },
  });

  // ---------------------------------------------------------------------------
  // 5.6 MYSTERY BOX — the whole ritual
  // ---------------------------------------------------------------------------
  // Music-box voice: FM bell (sine carrier, 3.5:1 modulator, fast index decay)
  // plus the mechanical tick of the comb tooth being plucked.
  function musicBoxNote(c, out, t0, f, dur, amp, r, detune) {
    const g = fmBell(c, out, t0, f, dur, amp, 3.5, 3.4, r);
    if (detune) {
      const g2 = fmBell(c, out, t0 + 0.006, f * detune, dur * 0.85, amp * 0.55, 3.52, 3.1, r);
      if (g2) { /* second, sour voice — the "broken toy" colour */ }
    }
    // comb tooth pluck
    const n = nsrc(c, 0.04, 11000 + Math.round(f) % 400);
    const bp = filt(c, 'bandpass', 4200, 3);
    const ng = gain(c, 0);
    n.connect(bp); bp.connect(ng); ng.connect(out);
    ad(ng.gain, t0, 0.0005, 0.008, amp * 0.35);
    go(n, t0, t0 + 0.06);
    return g;
  }

  def('box_open', {
    dur: 2.20, gain: 0.9, rev: 0.50, prio: 0.95,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.8);
      mst.connect(out);
      // latch
      clack(c, mst, t0, { lvl: 0.5, hp: 1400, lp: 9000, dec: 0.012, amt: 0.85,
                          ring: [[2100, 0.07, 0.24]], body: [160, 0.09, 0.2] }, r);
      // hinge creak: high-Q resonance sweeping up with stick-slip modulation
      const saw = osc(c, 'sawtooth', 320);
      sweep(saw.frequency, t0 + 0.10, 260, 640, 1.05);
      const bp = filt(c, 'bandpass', 900, 18);
      sweep(bp.frequency, t0 + 0.10, 700, 2100, 1.05);
      const g = gain(c, 0);
      const w = shaper(c, 1.9);
      saw.connect(bp); bp.connect(g); g.connect(w); w.connect(mst);
      const N = 64, env = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        env[i] = Math.max(MIN, 0.22 * (0.4 + 0.6 * Math.abs(Math.sin(t * 21 + 1.3)))
                          * Math.sin(Math.PI * Math.pow(t, 0.7)));
      }
      try { g.gain.setValueCurveAtTime(env, t0 + 0.10, 1.1); }
      catch (e) { ahr(g.gain, t0 + 0.1, 0.15, 0.6, 0.35, 0.2); }
      go(saw, t0, t0 + 1.3);
      // lid thumping against its stop
      impact(c, mst, t0 + 1.16, {
        lvl: 0.55, thump: [104, 44, 0.2, 0.7],
        splat: { f: 1300, q: 1.3, dec: 0.07, amt: 0.3 },
      }, r);
      // the light coming on
      const o = osc(c, 'sine', 1174.66);
      const og = gain(c, 0);
      o.connect(og); og.connect(mst);
      swell(og.gain, t0 + 0.5, 0.6, 0.06, 0.4);
      go(o, t0 + 0.5, t0 + 1.7);
    },
  });

  def('box_spin', {
    dur: 1.0, gain: 0.6, rev: 0.28, loop: true, live: true, prio: 0.85,
    build: function (c, out, t0, r, ctl) {
      const mst = gain(c, 0.55);
      mst.connect(out);
      // the mechanism: a buzzing motor gated by the ratchet
      const saw = osc(c, 'sawtooth', 78);
      const bp = filt(c, 'bandpass', 640, 2.4);
      const mg = gain(c, 0.34);
      saw.connect(bp); bp.connect(mg); mg.connect(mst);
      go(saw, t0); if (ctl) ctl.reg(saw);
      // ratchet: a fast square LFO chopping both motor and rattle
      const lfo = osc(c, 'square', 13.5);
      const lg = gain(c, 0.5);
      lfo.connect(lg); lg.connect(mg.gain);
      go(lfo, t0); if (ctl) ctl.reg(lfo);
      // card rattle
      const n = nsrc(c, 1.0, 11100, true);
      const nb = filt(c, 'bandpass', 1900, 1.6);
      const ng = gain(c, 0.11);
      n.connect(nb); nb.connect(ng); ng.connect(mst);
      const lfo2 = osc(c, 'square', 13.5);
      const lg2 = gain(c, 0.16);
      lfo2.connect(lg2); lg2.connect(ng.gain);
      go(n, t0); go(lfo2, t0);
      if (ctl) { ctl.reg(n); ctl.reg(lfo2); }
      // a slow whirring wobble so it never sits still
      const wob = osc(c, 'sine', 0.9);
      const wg = gain(c, 90);
      wob.connect(wg); wg.connect(bp.frequency);
      go(wob, t0); if (ctl) ctl.reg(wob);
      if (ctl) ctl.param('speed', function (v, when) {
        const f = clamp(v, 0.1, 3) * 13.5;
        lfo.frequency.setTargetAtTime(f, when, 0.05);
        lfo2.frequency.setTargetAtTime(f, when, 0.05);
        saw.frequency.setTargetAtTime(78 * clamp(v, 0.2, 2), when, 0.08);
      });
    },
  });

  def('box_land', {
    dur: 1.30, gain: 0.9, rev: 0.42, prio: 0.95,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.85);
      mst.connect(out);
      // mechanism locking, weapon settling into the cradle
      clack(c, mst, t0, { lvl: 0.75, hp: 600, lp: 7000, dec: 0.02, amt: 1.0,
                          ring: [[1120, 0.13, 0.3], [2240, 0.06, 0.14]], body: [128, 0.16, 0.3] }, r);
      const o = osc(c, 'sine', 88);
      sweep(o.frequency, t0, 92, 46, 0.3);
      const g = gain(c, 0);
      o.connect(g); g.connect(mst);
      ad(g.gain, t0, 0.004, 0.34, 0.55);
      go(o, t0, t0 + 0.44);
      // triumphant little rising figure
      fmBell(c, mst, t0 + 0.06, 392.0, 0.5, 0.2, 3.5, 3.0, r);
      fmBell(c, mst, t0 + 0.17, 523.25, 0.55, 0.2, 3.5, 3.0, r);
      fmBell(c, mst, t0 + 0.28, 783.99, 0.85, 0.24, 3.5, 3.2, r);
    },
  });

  def('box_close', {
    dur: 1.40, gain: 0.85, rev: 0.45, prio: 0.9,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.85);
      mst.connect(out);
      // reverse creak (falling), then the lid slamming and the latch
      const saw = osc(c, 'sawtooth', 620);
      sweep(saw.frequency, t0, 640, 250, 0.5);
      const bp = filt(c, 'bandpass', 1900, 16);
      sweep(bp.frequency, t0, 2000, 620, 0.5);
      const g = gain(c, 0);
      saw.connect(bp); bp.connect(g); g.connect(mst);
      ad(g.gain, t0, 0.05, 0.42, 0.17);
      go(saw, t0, t0 + 0.65);
      impact(c, mst, t0 + 0.52, {
        lvl: 0.9, thump: [92, 34, 0.30, 0.9],
        splat: { f: 1100, q: 1.0, dec: 0.11, amt: 0.42, sweep: [2.4, 0.4] },
        crack: { f: 700, q: 6, dec: 0.05, amt: 0.4, dist: 2.4 },
      }, r);
      clack(c, mst, t0 + 0.60, { lvl: 0.35, hp: 1600, lp: 9000, dec: 0.01, amt: 0.8,
                                 ring: [[2600, 0.05, 0.22]] }, r);
    },
  });

  def('box_jingle', {
    dur: 4.60, gain: 0.55, rev: 0.60, bus: 'music', loop: true, prio: 0.7,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.42);
      const lp = filt(c, 'lowpass', 5200, 0.8);
      mst.connect(lp); lp.connect(out);
      // C minor with a flat five — a nursery tune that went wrong
      const S = [261.63, 311.13, 349.23, 369.99, 415.30, 523.25, 622.25, 698.46];
      const mel = [[0.00, 5, 0.55], [0.34, 3, 0.34], [0.60, 6, 0.55], [0.94, 4, 0.34],
                   [1.20, 7, 0.70], [1.62, 5, 0.34], [1.88, 3, 0.45], [2.20, 2, 0.60],
                   [2.62, 5, 0.34], [2.88, 6, 0.34], [3.14, 4, 0.90], [3.70, 0, 0.85]];
      for (let i = 0; i < mel.length; i++) {
        const m = mel[i];
        musicBoxNote(c, mst, t0 + m[0], S[m[1]], m[2] * 1.9, 0.26, r, 1.0043);
      }
      // slow, sour drone underneath
      const dr = osc(c, 'triangle', 130.81);
      const dg = gain(c, 0);
      dr.connect(dg); dg.connect(mst);
      ahr(dg.gain, t0, 0.8, 2.4, 1.2, 0.05);
      go(dr, t0, t0 + 4.5);
      const dr2 = osc(c, 'triangle', 184.99);   // tritone
      const dg2 = gain(c, 0);
      dr2.connect(dg2); dg2.connect(mst);
      ahr(dg2.gain, t0 + 0.6, 1.0, 1.6, 1.2, 0.035);
      go(dr2, t0, t0 + 4.5);
      // the clockwork turning
      for (let i = 0; i < 24; i++) {
        const t = t0 + i * 0.19;
        const n = nsrc(c, 0.03, 11200 + i);
        const bp = filt(c, 'bandpass', 5600, 6);
        const g = gain(c, 0);
        n.connect(bp); bp.connect(g); g.connect(mst);
        ad(g.gain, t, 0.0005, 0.006, 0.05);
        go(n, t, t + 0.05);
      }
    },
  });

  def('box_teddy', {
    dur: 3.60, gain: 0.95, rev: 0.65, prio: 1.0,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.6);
      mst.connect(out);
      // a detuned music-box arpeggio, wound down and wrong
      const S = [523.25, 622.25, 739.99, 830.61, 1046.5];
      for (let i = 0; i < 10; i++) {
        const t = t0 + i * 0.135;
        const f = S[i % S.length] * Math.pow(2, -Math.floor(i / S.length));
        // the spring is failing: everything drifts flat as it goes
        musicBoxNote(c, mst, t, f * (1 - i * 0.012), 0.55, 0.22, r, 1.011);
      }
      // the laugh: a pulse train through child-sized formants, gated in
      // "ha-ha-ha" bursts, pitch drifting downward like a slowing record
      const laughT = t0 + 0.55;
      const bursts = [0, 0.17, 0.34, 0.53, 0.74, 0.98, 1.26, 1.60];
      const src = osc(c, 'sawtooth', 300);
      sweep(src.frequency, laughT, 320, 190, 1.9);
      const sub = osc(c, 'square', 150);
      sweep(sub.frequency, laughT, 160, 95, 1.9);
      const amp = gain(c, 0);
      const sg = gain(c, 0.7), sg2 = gain(c, 0.25);
      src.connect(sg); sg.connect(amp);
      sub.connect(sg2); sg2.connect(amp);
      const bank = gain(c, 1);
      amp.connect(bank);
      const outg = gain(c, 0.5);
      const w = shaper(c, 1.5);
      formantBank(c, bank, w, [[820, 6, 1.0], [1420, 7, 0.55], [2900, 9, 0.2]], r);
      w.connect(outg); outg.connect(mst);
      for (let i = 0; i < bursts.length; i++) {
        const t = laughT + bursts[i];
        const d = 0.075 + i * 0.012;
        amp.gain.setValueAtTime(MIN, t);
        amp.gain.exponentialRampToValueAtTime(0.9 * (1 - i * 0.07), t + 0.012);
        amp.gain.exponentialRampToValueAtTime(MIN, t + d);
      }
      go(src, laughT, laughT + 2.0); go(sub, laughT, laughT + 2.0);
      // and the room drops away — a long dark descending swell behind it
      const dr = osc(c, 'sawtooth', 110);
      sweep(dr.frequency, t0 + 0.3, 112, 41, 3.0);
      const dlp = filt(c, 'lowpass', 600, 1.8);
      sweep(dlp.frequency, t0 + 0.3, 800, 150, 3.0);
      const dg = gain(c, 0);
      dr.connect(dlp); dlp.connect(dg); dg.connect(mst);
      ahr(dg.gain, t0 + 0.3, 0.5, 1.4, 1.2, 0.20);
      go(dr, t0, t0 + 3.5);
    },
  });

  // ---------------------------------------------------------------------------
  // 5.7 ROUNDS & UI
  // ---------------------------------------------------------------------------
  def('round_start', {
    dur: 4.20, gain: 1.0, rev: 0.60, bus: 'music', prio: 1.0,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.7);
      mst.connect(out);
      // the deep rising drone
      const fs = [36.7, 55, 73.4, 110, 146.8];
      const lp = filt(c, 'lowpass', 200, 1.6);
      sweep(lp.frequency, t0, 130, 2200, 2.5);
      const dg = gain(c, 0);
      lp.connect(dg); dg.connect(mst);
      for (let i = 0; i < fs.length; i++) {
        const o = osc(c, i < 2 ? 'sine' : 'sawtooth', fs[i]);
        sweep(o.frequency, t0, fs[i] * 0.72, fs[i], 2.4);
        o.detune.value = r.sym(9);
        const g = gain(c, 0.5 / (1 + i * 0.7));
        o.connect(g); g.connect(lp);
        go(o, t0, t0 + 2.9);
      }
      swell(dg.gain, t0, 2.35, 0.55, 0.12);
      // rising noise bed
      const n = nsrc(c, 2.6, 11400, true);
      const nb = filt(c, 'bandpass', 400, 0.9);
      sweep(nb.frequency, t0, 260, 2400, 2.4);
      const ng = gain(c, 0);
      n.connect(nb); nb.connect(ng); ng.connect(mst);
      swell(ng.gain, t0, 2.35, 0.22, 0.1);
      go(n, t0, t0 + 2.6);
      // the "ready" hit
      const th = t0 + 2.42;
      const o = osc(c, 'sine', 62);
      sweep(o.frequency, th, 68, 24, 0.9);
      const g = gain(c, 0);
      o.connect(g); g.connect(mst);
      ad(g.gain, th, 0.004, 1.0, 0.95);
      go(o, th, th + 1.2);
      const n2 = nsrc(c, 1.2, 11410);
      const lp2 = filt(c, 'lowpass', 2600, 0.9);
      sweep(lp2.frequency, th, 5000, 500, 0.8);
      const g2 = gain(c, 0);
      const w = shaper(c, 2.4);
      n2.connect(lp2); lp2.connect(w); w.connect(g2); g2.connect(mst);
      ad(g2.gain, th, 0.002, 0.85, 0.42);
      go(n2, th, th + 1.3);
      // struck metal on the downbeat
      fmBell(c, mst, th, 98, 1.5, 0.26, 2.7, 5.0, r);
    },
  });

  // THE sound of CoD Zombies: the descending, distorted, backwards screech.
  def('round_end', {
    dur: 4.60, gain: 1.0, rev: 0.90, bus: 'music', prio: 1.0,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.62);
      mst.connect(out);

      // 1. detuned cluster falling in pitch, hard into a waveshaper
      const w = shaper(c, 7.5);
      const pre = gain(c, 0.9);
      const lp = filt(c, 'lowpass', 3000, 1.1);
      const clg = gain(c, 0);
      pre.connect(w); w.connect(lp); lp.connect(clg); clg.connect(mst);
      sweep(lp.frequency, t0, 4200, 420, 2.6);
      const cluster = [318, 322.5, 214, 216.7, 481, 486, 641, 649, 160.5];
      for (let i = 0; i < cluster.length; i++) {
        const o = osc(c, i % 3 === 0 ? 'square' : 'sawtooth', cluster[i]);
        sweep(o.frequency, t0, cluster[i] * r.range(0.99, 1.01), cluster[i] / 6.2, 2.55);
        const g = gain(c, 0.42 / Math.sqrt(cluster.length));
        o.connect(g); g.connect(pre);
        // each voice wobbles independently — that's what makes it sound alive
        const vib = osc(c, 'sine', 3.1 + i * 0.7);
        const vg = gain(c, 3 + i);
        vib.connect(vg); vg.connect(o.frequency);
        go(o, t0, t0 + 2.9); go(vib, t0, t0 + 2.9);
      }
      clg.gain.setValueAtTime(MIN, t0);
      clg.gain.exponentialRampToValueAtTime(0.95, t0 + 0.07);
      clg.gain.exponentialRampToValueAtTime(0.45, t0 + 1.6);
      clg.gain.exponentialRampToValueAtTime(MIN, t0 + 2.75);

      // 2. the screech: high-Q resonance dragged down across the whole fall,
      //    ring-modulated so it never resolves into a pitch
      const scr = osc(c, 'sawtooth', 900);
      sweep(scr.frequency, t0, 940, 96, 2.5);
      const ring = gain(c, 0.0);
      const modo = osc(c, 'sine', 187);
      sweep(modo.frequency, t0, 187, 33, 2.5);
      const modg = gain(c, 1.0);
      modo.connect(modg); modg.connect(ring.gain);
      scr.connect(ring);
      const bp = filt(c, 'bandpass', 4000, 11);
      sweep(bp.frequency, t0, 4200, 300, 2.5);
      const sg = gain(c, 0);
      const w2 = shaper(c, 5);
      ring.connect(bp); bp.connect(sg); sg.connect(w2); w2.connect(mst);
      ad(sg.gain, t0, 0.02, 2.5, 0.42);
      go(scr, t0, t0 + 2.9); go(modo, t0, t0 + 2.9);

      // 3. reversed-envelope swell — silence growing into the impact. This is
      //    the "played backwards" half of the sound.
      const rn = nsrc(c, 2.2, 11500, true);
      const rbp = filt(c, 'bandpass', 600, 1.3);
      sweep(rbp.frequency, t0, 300, 3400, 1.9);
      const rg = gain(c, 0);
      rn.connect(rbp); rbp.connect(rg); rg.connect(mst);
      swell(rg.gain, t0 + 0.1, 1.85, 0.46, 0.06);
      go(rn, t0, t0 + 2.2);
      // and a reversed tonal swell an octave apart
      const ro = osc(c, 'sawtooth', 74);
      sweep(ro.frequency, t0, 74, 300, 1.9);
      const rlp = filt(c, 'lowpass', 1400, 2.2);
      const rog = gain(c, 0);
      ro.connect(rlp); rlp.connect(rog); rog.connect(mst);
      swell(rog.gain, t0 + 0.1, 1.85, 0.30, 0.06);

      // The arrival. Both reversed swells peak at t0+1.95 and then simply cut
      // out — a backwards swell with nothing at the end of it reads as a
      // generic horror riser, not as the round-change alarm. This is the hit
      // they were building toward: a struck-metal toll plus a sub drop.
      const tHit = t0 + 1.95;
      fmBell(c, mst, tHit, 148, 2.6, 0.42, 2.74, 8.5, r);
      impact(c, mst, tHit, { f: 96, dec: 0.42, amt: 0.75, lp: 900, noise: 0.35 }, r);
      const arrSub = osc(c, 'sine', 84);
      sweep(arrSub.frequency, tHit, 92, 26, 1.1);
      const arrSubG = gain(c, 0);
      ad(arrSubG.gain, tHit, 0.004, 1.05, 0.60);
      arrSub.connect(arrSubG); arrSubG.connect(mst);
      go(arrSub, tHit, tHit + 1.3);
      go(ro, t0, t0 + 2.1);

      // 4. sub drop under everything, then a long dark tail
      const sub = osc(c, 'sine', 88);
      sweep(sub.frequency, t0, 92, 21, 2.6);
      const subg = gain(c, 0);
      sub.connect(subg); subg.connect(mst);
      ad(subg.gain, t0, 0.05, 2.6, 0.75);
      go(sub, t0, t0 + 2.9);
      const tail = nsrc(c, 1.8, 11510);
      const tlp = filt(c, 'lowpass', 900, 0.9);
      sweep(tlp.frequency, t0 + 1.9, 1400, 180, 1.6);
      const tg = gain(c, 0);
      tail.connect(tlp); tlp.connect(tg); tg.connect(mst);
      ad(tg.gain, t0 + 1.9, 0.05, 1.5, 0.28);
      go(tail, t0 + 1.9, t0 + 3.7);
    },
  });

  def('round_number_beep', {
    dur: 0.50, gain: 0.7, rev: 0.25, bus: 'ui', prio: 0.8,
    vary: { rate: 0.02, gain: 0.06 },
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.6);
      mst.connect(out);
      // a dead, mechanical tick — a counter advancing, not a chime
      blip(c, mst, t0, { type: 'square', f0: 880, f1: 830, dur: 0.09, lp: 2600, q: 2.0, amt: 0.42, atk: 0.002 });
      const n = nsrc(c, 0.06, 11600 + r.i(200));
      const bp = filt(c, 'bandpass', 3200, 4);
      const g = gain(c, 0);
      n.connect(bp); bp.connect(g); g.connect(mst);
      ad(g.gain, t0, 0.0006, 0.012, 0.35);
      go(n, t0, t0 + 0.08);
      const o = osc(c, 'sine', 147);
      const og = gain(c, 0);
      o.connect(og); og.connect(mst);
      ad(og.gain, t0, 0.002, 0.10, 0.22);
      go(o, t0, t0 + 0.16);
    },
  });

  def('game_over', {
    dur: 6.00, gain: 1.0, rev: 0.85, bus: 'music', prio: 1.0,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.6);
      mst.connect(out);
      // one low tolling hit, then a minor cluster sinking out of the world
      const lp = filt(c, 'lowpass', 900, 1.2);
      sweep(lp.frequency, t0, 1100, 130, 4.5);
      const cg = gain(c, 0);
      lp.connect(cg); cg.connect(mst);
      const fs = [55, 65.41, 82.41, 110, 130.81];
      for (let i = 0; i < fs.length; i++) {
        const o = osc(c, i < 2 ? 'sine' : 'sawtooth', fs[i]);
        sweep(o.frequency, t0, fs[i], fs[i] * 0.94, 4.6);
        o.detune.value = r.sym(11);
        const g = gain(c, 0.45 / (1 + i * 0.5));
        o.connect(g); g.connect(lp);
        go(o, t0, t0 + 5.2);
      }
      cg.gain.setValueAtTime(MIN, t0);
      cg.gain.exponentialRampToValueAtTime(0.85, t0 + 0.08);
      cg.gain.exponentialRampToValueAtTime(0.5, t0 + 2.0);
      cg.gain.exponentialRampToValueAtTime(MIN, t0 + 5.0);
      // the toll
      fmBell(c, mst, t0, 55, 4.6, 0.34, 2.4, 6.0, r);
      fmBell(c, mst, t0 + 0.012, 82.41, 3.6, 0.18, 2.41, 5.4, r);
      // a low impact to start it
      const th = osc(c, 'sine', 58);
      sweep(th.frequency, t0, 62, 19, 1.6);
      const tg = gain(c, 0);
      th.connect(tg); tg.connect(mst);
      ad(tg.gain, t0, 0.006, 1.9, 0.9);
      go(th, t0, t0 + 2.2);
      // last breath of noise
      const n = nsrc(c, 3.0, 11700, true);
      const nb = filt(c, 'lowpass', 500, 0.8);
      sweep(nb.frequency, t0, 900, 120, 4.0);
      const ng = gain(c, 0);
      n.connect(nb); nb.connect(ng); ng.connect(mst);
      ad(ng.gain, t0, 0.4, 4.0, 0.16);
      go(n, t0, t0 + 4.6);
    },
  });

  def('ui_hover', {
    dur: 0.22, gain: 0.4, rev: 0.10, bus: 'ui', prio: 0.3,
    vary: { rate: 0.03, gain: 0.08 },
    build: function (c, out, t0) {
      blip(c, out, t0, { type: 'triangle', f0: 1320, f1: 1480, dur: 0.07, lp: 5200, amt: 0.24, atk: 0.003 });
    },
  });
  def('ui_click', {
    dur: 0.30, gain: 0.55, rev: 0.12, bus: 'ui', prio: 0.5,
    vary: { rate: 0.03, gain: 0.08 },
    build: function (c, out, t0, r) {
      blip(c, out, t0, { type: 'square', f0: 780, f1: 1560, dur: 0.055, lp: 4200, amt: 0.30, atk: 0.002 });
      clack(c, out, t0, { lvl: 0.3, hp: 2200, lp: 11000, dec: 0.006, amt: 0.7, ring: [[3400, 0.02, 0.2]] }, r || mkRnd(7));
    },
  });
  def('ui_back', {
    dur: 0.30, gain: 0.5, rev: 0.12, bus: 'ui', prio: 0.5,
    vary: { rate: 0.03, gain: 0.08 },
    build: function (c, out, t0) {
      blip(c, out, t0, { type: 'square', f0: 880, f1: 420, dur: 0.09, lp: 3200, amt: 0.30, atk: 0.002 });
    },
  });

  def('powerup_drop', {
    dur: 2.60, gain: 0.8, rev: 0.55, prio: 0.9,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.55);
      mst.connect(out);
      // a rising, shimmering, slightly wrong announcement
      for (let i = 0; i < 5; i++) {
        const f = 261.63 * Math.pow(2, i / 4);
        fmBell(c, mst, t0 + i * 0.055, f, 1.6, 0.16, 3.5, 3.4, r);
      }
      const o = osc(c, 'triangle', 130);
      sweep(o.frequency, t0, 110, 523, 1.2);
      const g = gain(c, 0);
      o.connect(g); g.connect(mst);
      swell(g.gain, t0, 1.1, 0.14, 0.5);
      go(o, t0, t0 + 2.0);
      // a low pulse so it reads through gunfire
      const s = osc(c, 'sine', 65);
      const sg2 = gain(c, 0);
      s.connect(sg2); sg2.connect(mst);
      ad(sg2.gain, t0, 0.02, 1.4, 0.34);
      go(s, t0, t0 + 1.6);
    },
  });

  def('powerup_grab', {
    dur: 1.40, gain: 0.85, rev: 0.35, bus: 'ui', prio: 0.95,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.6);
      mst.connect(out);
      const notes = [523.25, 659.25, 783.99, 1046.5];
      for (let i = 0; i < notes.length; i++) fmBell(c, mst, t0 + i * 0.045, notes[i], 0.85, 0.22, 3.5, 3.0, r);
      const n = nsrc(c, 0.4, 11800 + r.i(200));
      const hp = filt(c, 'highpass', 5000, 0.7);
      const g = gain(c, 0);
      n.connect(hp); hp.connect(g); g.connect(mst);
      ad(g.gain, t0, 0.004, 0.32, 0.14);
      go(n, t0, t0 + 0.5);
    },
  });

  // powerup announcements — each is a different colour of "everything changed"
  def('powerup_instakill', {
    dur: 2.80, gain: 0.9, rev: 0.55, bus: 'ui', prio: 1.0,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.55);
      mst.connect(out);
      // a hard, bright, aggressive stab that keeps rising
      const w = shaper(c, 3.4);
      const lp = filt(c, 'lowpass', 3000, 1.4);
      sweep(lp.frequency, t0, 900, 6000, 1.1);
      const g = gain(c, 0);
      lp.connect(w); w.connect(g); g.connect(mst);
      const fs = [220, 277.18, 329.63, 440];
      for (let i = 0; i < fs.length; i++) {
        const o = osc(c, 'sawtooth', fs[i]);
        sweep(o.frequency, t0, fs[i] * 0.5, fs[i], 0.9);
        const gg = gain(c, 0.3);
        o.connect(gg); gg.connect(lp);
        go(o, t0, t0 + 1.8);
      }
      ahr(g.gain, t0, 0.05, 0.9, 0.8, 0.5);
      fmBell(c, mst, t0 + 0.9, 880, 1.5, 0.24, 3.5, 4.0, r);
      fmBell(c, mst, t0 + 0.9, 1108.7, 1.4, 0.16, 3.5, 4.0, r);
    },
  });

  def('powerup_doublepoints', {
    dur: 2.40, gain: 0.85, rev: 0.50, bus: 'ui', prio: 1.0,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.55);
      mst.connect(out);
      // a bouncing, coin-flavoured double figure
      const seqn = [[0.00, 523.25], [0.11, 659.25], [0.22, 523.25], [0.33, 659.25],
                    [0.46, 783.99], [0.57, 1046.5]];
      for (let i = 0; i < seqn.length; i++) {
        fmBell(c, mst, t0 + seqn[i][0], seqn[i][1], 0.7, 0.20, 3.5, 3.2, r);
        blip(c, mst, t0 + seqn[i][0], { type: 'square', f0: seqn[i][1] * 2, dur: 0.05, lp: 6000, amt: 0.07 });
      }
      const o = osc(c, 'sine', 98);
      const g = gain(c, 0);
      o.connect(g); g.connect(mst);
      ad(g.gain, t0, 0.01, 1.0, 0.3);
      go(o, t0, t0 + 1.2);
    },
  });

  def('powerup_maxammo', {
    dur: 2.40, gain: 0.85, rev: 0.50, bus: 'ui', prio: 1.0,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.55);
      mst.connect(out);
      // metallic, industrial: a magazine-fed fanfare
      for (let i = 0; i < 8; i++) {
        clack(c, mst, t0 + i * 0.055, { lvl: 0.16, hp: 1800, lp: 12000, dec: 0.008, amt: 0.8,
                                        ring: [[1600 + i * 260, 0.06, 0.28]] }, r);
      }
      const notes = [349.23, 440, 523.25, 698.46];
      for (let i = 0; i < notes.length; i++) fmBell(c, mst, t0 + 0.42 + i * 0.07, notes[i], 1.3, 0.20, 2.5, 3.4, r);
      const o = osc(c, 'sine', 87.31);
      const g = gain(c, 0);
      o.connect(g); g.connect(mst);
      ad(g.gain, t0 + 0.4, 0.02, 1.2, 0.34);
      go(o, t0 + 0.4, t0 + 1.7);
    },
  });

  def('powerup_nuke', {
    dur: 5.00, gain: 1.0, rev: 0.80, prio: 1.0,
    build: function (c, out, t0, r) {
      const mst = gain(c, 0.62);
      mst.connect(out);
      // the descending whoosh — something very heavy arriving
      const n = nsrc(c, 2.0, 11900, true);
      const bp = filt(c, 'bandpass', 3000, 1.3);
      sweep(bp.frequency, t0, 4200, 120, 1.55);
      const g = gain(c, 0);
      n.connect(bp); bp.connect(g); g.connect(mst);
      g.gain.setValueAtTime(MIN, t0);
      g.gain.exponentialRampToValueAtTime(0.30, t0 + 0.3);
      g.gain.exponentialRampToValueAtTime(0.55, t0 + 1.45);
      g.gain.exponentialRampToValueAtTime(MIN, t0 + 1.7);
      go(n, t0, t0 + 2.0);
      const wo = osc(c, 'sawtooth', 420);
      sweep(wo.frequency, t0, 430, 42, 1.55);
      const wlp = filt(c, 'lowpass', 1600, 2.4);
      sweep(wlp.frequency, t0, 2400, 200, 1.55);
      const wg = gain(c, 0);
      wo.connect(wlp); wlp.connect(wg); wg.connect(mst);
      swell(wg.gain, t0, 1.5, 0.32, 0.08);
      go(wo, t0, t0 + 1.7);

      // the boom
      const tb = t0 + 1.55;
      const sub = osc(c, 'sine', 78);
      sweep(sub.frequency, tb, 84, 17, 2.2);
      const sg2 = gain(c, 0);
      sub.connect(sg2); sg2.connect(mst);
      ad(sg2.gain, tb, 0.008, 2.4, 1.0);
      go(sub, tb, tb + 2.8);
      const bn = nsrc(c, 2.6, 11910, true);
      const blp = filt(c, 'lowpass', 2600, 0.9);
      sweep(blp.frequency, tb, 4600, 160, 2.2);
      const w = shaper(c, 3.0);
      const bg = gain(c, 0);
      bn.connect(blp); blp.connect(w); w.connect(bg); bg.connect(mst);
      ad(bg.gain, tb, 0.004, 2.3, 0.6);
      go(bn, tb, tb + 2.8);
      // the rumble rolling away
      const rn = nsrc(c, 3.0, 11920, true);
      const rlp = filt(c, 'lowpass', 260, 0.9);
      const rg = gain(c, 0);
      rn.connect(rlp); rlp.connect(rg); rg.connect(mst);
      ad(rg.gain, tb + 0.1, 0.35, 3.0, 0.4);
      go(rn, tb, tb + 3.4);
    },
  });

  def('hitmarker', {
    dur: 0.14, gain: 0.5, rev: 0.0, bus: 'ui', prio: 0.6,
    vary: { rate: 0.05, gain: 0.10 },
    build: function (c, out, t0, r) {
      clack(c, out, t0, { lvl: 0.42, hp: 3200, lp: 13000, dec: 0.005, amt: 0.8,
                          ring: [[5200, 0.018, 0.3]] }, r || mkRnd(3));
    },
  });
  def('hitmarker_crit', {
    dur: 0.22, gain: 0.65, rev: 0.0, bus: 'ui', prio: 0.7,
    vary: { rate: 0.04, gain: 0.10 },
    build: function (c, out, t0, r) {
      const rr = r || mkRnd(4);
      clack(c, out, t0, { lvl: 0.45, hp: 3400, lp: 14000, dec: 0.005, amt: 0.85,
                          ring: [[6400, 0.02, 0.3], [9100, 0.012, 0.16]] }, rr);
      blip(c, out, t0 + 0.012, { type: 'square', f0: 2400, f1: 3200, dur: 0.05, lp: 9000, amt: 0.16, atk: 0.001 });
    },
  });

  // ---------------------------------------------------------------------------
  // 5.8 AMBIENCE
  // ---------------------------------------------------------------------------
  def('amb_wind', {
    dur: 4.0, gain: 0.5, rev: 0.20, bus: 'ambient', loop: true, live: true, prio: 0.1,
    build: function (c, out, t0, r, ctl) {
      const mst = gain(c, 0.55);
      mst.connect(out);
      // two noise layers through slowly-swept bandpasses = mournful, moving air
      const layers = [
        { f: 320, q: 1.1, lfo: 0.061, dep: 190, amp: 0.42 },
        { f: 620, q: 1.6, lfo: 0.037, dep: 340, amp: 0.26 },
      ];
      for (let i = 0; i < layers.length; i++) {
        const L = layers[i];
        const n = nsrc(c, 4.0, 12000 + i * 31, true);
        const bp = filt(c, 'bandpass', L.f, L.q);
        const lp = filt(c, 'lowpass', 1400, 0.7);
        const g = gain(c, L.amp);
        n.connect(bp); bp.connect(lp); lp.connect(g); g.connect(mst);
        const lfo = osc(c, 'sine', L.lfo);
        const lg = gain(c, L.dep);
        lfo.connect(lg); lg.connect(bp.frequency);
        const alfo = osc(c, 'sine', L.lfo * 1.7);
        const ag = gain(c, L.amp * 0.55);
        alfo.connect(ag); ag.connect(g.gain);
        go(n, t0); go(lfo, t0); go(alfo, t0);
        if (ctl) { ctl.reg(n); ctl.reg(lfo); ctl.reg(alfo); }
      }
      // the thin whistle through a cracked window pane
      const n = nsrc(c, 4.0, 12100, true);
      const bp = filt(c, 'bandpass', 1750, 14);
      const g = gain(c, 0.035);
      n.connect(bp); bp.connect(g); g.connect(mst);
      const lfo = osc(c, 'sine', 0.083);
      const lg = gain(c, 420);
      lfo.connect(lg); lg.connect(bp.frequency);
      const alfo = osc(c, 'sine', 0.13);
      const ag = gain(c, 0.03);
      alfo.connect(ag); ag.connect(g.gain);
      go(n, t0); go(lfo, t0); go(alfo, t0);
      if (ctl) { ctl.reg(n); ctl.reg(lfo); ctl.reg(alfo); }
      // low rumble bed
      const rn = nsrc(c, 4.0, 12200, true);
      const rlp = filt(c, 'lowpass', 150, 0.8);
      const rg = gain(c, 0.28);
      rn.connect(rlp); rlp.connect(rg); rg.connect(mst);
      go(rn, t0); if (ctl) ctl.reg(rn);
      if (ctl) ctl.param('gust', function (v, when) {
        mst.gain.setTargetAtTime(0.55 * (0.6 + clamp(v, 0, 1) * 1.1), when, 0.6);
      });
    },
  });

  def('amb_creak', {
    dur: 2.20, gain: 0.5, rev: 0.55, bus: 'ambient', variants: 4, prio: 0.2,
    vary: { rate: 0.22, gain: 0.30 },
    build: function (c, out, t0, r) {
      // a joist somewhere above you deciding to move
      const f0 = r.range(160, 460);
      const saw = osc(c, 'sawtooth', f0);
      sweep(saw.frequency, t0, f0, f0 * r.range(1.15, 1.8), r.range(0.5, 1.2));
      const bp = filt(c, 'bandpass', f0 * 2.4, r.range(12, 26));
      sweep(bp.frequency, t0, f0 * 2.2, f0 * 4.0, 0.9);
      const g = gain(c, 0);
      const w = shaper(c, 1.6);
      saw.connect(bp); bp.connect(g); g.connect(w); w.connect(out);
      const N = 56, env = new Float32Array(N);
      const rate = r.range(9, 22);
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        env[i] = Math.max(MIN, 0.20 * (0.25 + 0.75 * Math.abs(Math.sin(t * rate)))
                          * Math.sin(Math.PI * Math.pow(t, 0.65)));
      }
      try { g.gain.setValueCurveAtTime(env, t0, 1.1); }
      catch (e) { ahr(g.gain, t0, 0.2, 0.5, 0.4, 0.18); }
      go(saw, t0, t0 + 1.3);
      // a dull settle at the end
      if (r.f() < 0.6) {
        impact(c, out, t0 + r.range(0.9, 1.3), {
          lvl: r.range(0.1, 0.3), thump: [r.range(70, 130), 40, 0.18, 0.6],
          splat: { f: 800, q: 1.2, dec: 0.05, amt: 0.2 },
        }, r);
      }
    },
  });

  def('amb_distant_moan', {
    dur: 3.20, gain: 0.55, rev: 0.75, bus: 'ambient', variants: 3, prio: 0.25,
    vary: { rate: 0.18, gain: 0.25 },
    build: function (c, out, t0, r, ctl) {
      // the same vocal machine, but heavily lowpassed and drenched — distance
      const lp = filt(c, 'lowpass', 620, 0.9);
      const g = gain(c, 0.55);
      lp.connect(g); g.connect(out);
      vocal(c, lp, t0, {
        dur: 2.4, f0: r.range(58, 96), bend: r.sym(0.16), lvl: 0.6,
        formants: VOWEL[r.pick(['uh', 'oo', 'oh', 'er'])],
        tone: 900, toneQ: 0.7, breath: 0.2, breathF: 700, breathQ: 0.8,
        wobbleHz: r.range(1.6, 3.2), wobble: 0.05, jitter: 0.02,
        ampWobbleHz: r.range(2.5, 5), ampWobble: 0.22, ampJitter: 0.07, sub: 0.45,
        toneSweep: [1100, 500],
        shape: function (t) {
          const a = Math.min(1, t / 0.3);
          const rel = 1 - Math.max(0, (t - 0.45) / 0.55);
          return Math.max(MIN, a * a * rel * rel);
        },
      }, r, ctl);
    },
  });

  // Slow, sparse, dissonant drone bed. intensity 0..1 tracks the round number.
  def('music_dread', {
    dur: 8.0, gain: 0.5, rev: 0.55, bus: 'music', loop: true, live: true, prio: 0.15,
    build: function (c, out, t0, r, ctl) {
      const mst = gain(c, 0.0);
      const lp = filt(c, 'lowpass', 400, 1.2);
      mst.connect(lp); lp.connect(out);

      // root, fifth, minor second (the dissonance), and a distant octave
      const parts = [
        { f: 43.65, type: 'sine',     amp: 0.55, diss: 0.0 },
        { f: 65.41, type: 'triangle', amp: 0.30, diss: 0.0 },
        { f: 46.25, type: 'sawtooth', amp: 0.22, diss: 1.0 },   // b9 against the root
        { f: 92.50, type: 'sawtooth', amp: 0.16, diss: 1.0 },
        { f: 130.81, type: 'triangle', amp: 0.10, diss: 0.6 },
      ];
      const dissGains = [];
      for (let i = 0; i < parts.length; i++) {
        const P = parts[i];
        const o = osc(c, P.type, P.f);
        o.detune.value = r.sym(7);
        const g = gain(c, P.amp * (1 - P.diss * 0.85));
        o.connect(g); g.connect(mst);
        // very slow independent drift so the bed never sits still
        const dr = osc(c, 'sine', 0.031 + i * 0.017);
        const dg = gain(c, 3.5);
        dr.connect(dg); dg.connect(o.detune);
        go(o, t0); go(dr, t0);
        if (ctl) { ctl.reg(o); ctl.reg(dr); }
        dissGains.push({ g: g, base: P.amp, diss: P.diss });
      }
      // breathing noise floor
      const n = nsrc(c, 4.0, 12300, true);
      const nb = filt(c, 'bandpass', 220, 0.7);
      const ng = gain(c, 0.05);
      n.connect(nb); nb.connect(ng); ng.connect(mst);
      const nl = osc(c, 'sine', 0.047);
      const nlg = gain(c, 0.04);
      nl.connect(nlg); nlg.connect(ng.gain);
      go(n, t0); go(nl, t0);
      if (ctl) { ctl.reg(n); ctl.reg(nl); }
      // tremolo that deepens with intensity
      const trem = osc(c, 'sine', 0.9);
      const tremG = gain(c, 0.0);
      trem.connect(tremG); tremG.connect(mst.gain);
      go(trem, t0); if (ctl) ctl.reg(trem);

      let intensity = 0;
      function apply(v, when) {
        intensity = clamp(v, 0, 1);
        mst.gain.setTargetAtTime(0.12 + intensity * 0.55, when, 1.5);
        lp.frequency.setTargetAtTime(240 + intensity * 1900, when, 2.0);
        tremG.gain.setTargetAtTime(intensity * 0.16, when, 1.5);
        trem.frequency.setTargetAtTime(0.7 + intensity * 3.4, when, 2.0);
        for (let i = 0; i < dissGains.length; i++) {
          const d = dissGains[i];
          d.g.gain.setTargetAtTime(d.base * (1 - d.diss * 0.85 * (1 - intensity)), when, 2.0);
        }
      }
      apply(0.0, t0);
      // offline renders need something audible immediately
      mst.gain.setValueAtTime(0.35, t0);
      if (ctl) ctl.param('intensity', apply);
    },
  });

  // ===========================================================================
  // 6 — runtime: buses, reverb send, offline baking, voice engine
  //
  // Playback has two paths per sound:
  //   BAKED  — the common case. init() renders every non-live, non-alias,
  //            non-seq def's `variants` count through OfflineAudioContext once
  //            and caches the resulting AudioBuffers. play()/loop() then just
  //            fire an AudioBufferSourceNode — cheap enough for a Thompson at
  //            700 RPM.
  //   LIVE   — used for `live:true` defs (drones, wind, the dread bed, the box
  //            spin loop) which are parametric and must stay controllable via
  //            handle.set(), and as a same-frame fallback for anything asked
  //            to play before its bake has landed, so the game is never silent
  //            while the oven is still warm.
  // `seq` composites (reload foley) are not baked as a unit — each component
  // is scheduled as its own ordinary trigger at an offset, inheriting the
  // caller's opts.pos/vol/rate.
  // ===========================================================================
  const BUS_NAMES = ['sfx', 'ui', 'ambient', 'music'];
  let duckGain = null;
  let bakeTargetTotal = 0;
  let bakeComplete = false;

  // ---- graph construction ----------------------------------------------
  function buildGraph() {
    master = gain(ctx, 1.0);
    duckGain = gain(ctx, 1.0);
    limiter = ctx.createDynamicsCompressor();
    // Gentle bus glue. At -8 dB / 14:1 this was a near-brickwall that pulled
    // gunfire down to ambience level while never touching the ambience itself.
    limiter.threshold.value = -14;
    limiter.knee.value = 6;
    limiter.ratio.value = 3.5;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;
    master.connect(duckGain); duckGain.connect(limiter); limiter.connect(ctx.destination);

    // shared convolution reverb — one small wooden room for the whole game.
    // Fed post voice-gain by every voice with rev>0; ducks and masters with
    // everything else since it lands on `master`.
    revIn = gain(ctx, 1.0);
    revConv = ctx.createConvolver();
    revConv.normalize = true;
    try { revConv.buffer = makeIR(ctx, IR_SECONDS, 0xBEEF11); } catch (e) { Z.log('Z.Audio: IR build failed', e); }
    revOut = gain(ctx, 0.65);
    revIn.connect(revConv); revConv.connect(revOut); revOut.connect(master);

    BUS_NAMES.forEach(function (name) {
      const g = gain(ctx, 1.0);
      g.connect(master);
      buses[name] = { gain: g, vol: 1.0 };
    });
  }

  // ---- spatial helpers ---------------------------------------------------
  function setPannerPosition(panner, pos) {
    try {
      if (panner.positionX) {
        panner.positionX.value = pos[0]; panner.positionY.value = pos[1]; panner.positionZ.value = pos[2];
      } else if (panner.setPosition) {
        panner.setPosition(pos[0], pos[1], pos[2]);
      }
    } catch (e) { /* older/odd implementations */ }
  }
  function dist3(a, b) {
    const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  // Air absorption + occlusion combine into one lowpass cutoff — whichever is
  // darker wins. Distance alone never goes below 500 Hz (still readable at
  // the far end of the level); full occlusion (a wall between) reaches OCCL_LP.
  function voiceFilterCutoff(pos, occlAmt) {
    let air = 20000;
    if (pos) {
      const d = Math.max(0, dist3(pos, lis.p));
      air = clamp(20000 * Math.pow(0.5, d / AIR_HALF), 500, 20000);
    }
    const occl = clamp(occlAmt || 0, 0, 1);
    const occlCut = 20000 + (OCCL_LP - 20000) * occl;
    return Math.min(air, occlCut);
  }
  function updateVoiceFilter(voice) {
    if (!voice || !voice.lp || !ctx) return;
    const cutoff = voiceFilterCutoff(voice.pos, voice.occlAmt);
    try { voice.lp.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.05); }
    catch (e) { voice.lp.frequency.value = cutoff; }
  }

  // ---- def / alias resolution --------------------------------------------
  function resolveDef(name) {
    const d = DEFS[name];
    if (!d) return null;
    if (d.aliasOf) {
      const t = DEFS[d.aliasOf];
      return t ? { def: t, fixedVariant: d.variant | 0 } : null;
    }
    return { def: d, fixedVariant: -1 };
  }

  // ---- safety limiter --------------------------------------------------
  // Recipes are additive (many bands/layers summed with no final gain-stage
  // bookkeeping), so a busy shot can genuinely peak past 0 dBFS before it
  // ever reaches the master compressor. A WaveShaperNode clamps any input
  // outside [-1,1] to the curve's own edge value (per spec), so this curve
  // doubles as a true brickwall for arbitrarily large overs, not just a
  // shaper of the in-range signal — a hard, silent ceiling under ~0.97
  // rather than a wall of decimation-clipping noise. Linear (transparent)
  // below LIMITER_T, soft-knee tanh above it.
  // A true safety net for overs, not a tone shaper. At 0.80 this per-voice
  // stage was squashing every loud layered sound toward the same ceiling,
  // which — stacked with the master compressor — collapsed the dynamic range
  // the mix depends on (quiet ambience, deafening Kar98k).
  const LIMITER_T = 0.93;
  let limiterCurveCache = null;
  function limiterCurve() {
    if (limiterCurveCache) return limiterCurveCache;
    const n = 4096;
    const cv = new Float32Array(n);
    const span = 1 - LIMITER_T;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      const ax = Math.abs(x), sgn = x < 0 ? -1 : 1;
      cv[i] = sgn * (ax <= LIMITER_T ? ax : LIMITER_T + span * Math.tanh((ax - LIMITER_T) / span));
    }
    limiterCurveCache = cv;
    return cv;
  }
  function safetyLimiter(c) {
    const w = c.createWaveShaper();
    w.curve = limiterCurve();
    w.oversample = '4x';
    return w;
  }

  // ---- offline render (also drives the buffer bake) ----------------------
  function offlineRender(name, variantIdx, seed) {
    const rd = resolveDef(name);
    if (!rd || !rd.def.build) return Promise.reject(new Error('Z.Audio: no recipe for "' + name + '"'));
    const d = rd.def;
    const OAC = (typeof OfflineAudioContext !== 'undefined') ? OfflineAudioContext
              : (typeof webkitOfflineAudioContext !== 'undefined') ? webkitOfflineAudioContext : null;
    if (!OAC) return Promise.reject(new Error('Z.Audio: OfflineAudioContext unavailable'));
    const sr = (ctx && ctx.sampleRate) || 44100;
    const len = Math.max(2, Math.ceil((d.dur + 0.3) * sr));
    let oc;
    try { oc = new OAC(2, len, sr); } catch (e) { return Promise.reject(e); }
    const r = mkRnd(seed === undefined ? (hash(name) ^ ((variantIdx | 0) * 2654435761)) >>> 0 : seed);
    const ctl = new Ctl();
    const pre = gain(oc, 1);
    const lim = safetyLimiter(oc);
    pre.connect(lim); lim.connect(oc.destination);
    try { d.build(oc, pre, 0.002, r, ctl); }
    catch (e) { return Promise.reject(e); }
    return oc.startRendering();
  }
  // Exposed for offline-render verification/tooling — not part of the
  // documented Z.Audio contract, harmless to leave in place.
  A._offlineRender = offlineRender;

  function bakeAll() {
    const targets = [];
    for (let i = 0; i < NAMES.length; i++) {
      const d = DEFS[NAMES[i]];
      if (!d || d.aliasOf || d.seq || d.live || !d.build) continue;
      if (targets.indexOf(d) === -1) targets.push(d);
    }
    bakeTargetTotal = 0;
    for (let i = 0; i < targets.length; i++) bakeTargetTotal += Math.max(1, targets[i].variants || 1);

    let idx = 0;
    function nextChunk() {
      if (idx >= targets.length) { bakeComplete = true; return Promise.resolve(); }
      const chunk = targets.slice(idx, idx + BAKE_CHUNK);
      idx += BAKE_CHUNK;
      const proms = [];
      chunk.forEach(function (d) {
        const n = Math.max(1, d.variants || 1);
        const arr = cache[d.name] || (cache[d.name] = []);
        for (let v = 0; v < n; v++) {
          proms.push(offlineRender(d.name, v).then(
            function (buf) { arr[v] = buf; bakedNames++; },
            function (e) { Z.log('Z.Audio: bake failed for', d.name, v, e); bakedNames++; }
          ));
        }
      });
      return Promise.all(proms).then(nextChunk);
    }
    return nextChunk();
  }

  // ---- voice lifecycle -----------------------------------------------------
  function stopVoice(voice, when) {
    if (!voice || voice.stopped) return;
    voice.stopped = true;
    const t = when === undefined ? (ctx ? ctx.currentTime : 0) : when;
    try { if (voice.source && voice.source.stop) voice.source.stop(t); } catch (e) { /* already stopped */ }
    if (voice.ctl && voice.ctl.nodes) {
      for (let i = 0; i < voice.ctl.nodes.length; i++) {
        try { if (voice.ctl.nodes[i].stop) voice.ctl.nodes[i].stop(t); } catch (e) { /* already stopped */ }
      }
    }
    try { voice.vg.gain.cancelScheduledValues(t); voice.vg.gain.setTargetAtTime(MIN, t, 0.02); } catch (e) { /* ignore */ }
    setTimeout(function () { cleanupVoice(voice); }, 200);
  }
  function cleanupVoice(voice) {
    if (!voice || voice.cleaned) return;
    voice.cleaned = true;
    try { voice.lp.disconnect(); } catch (e) { /* ignore */ }
    try { voice.vg.disconnect(); } catch (e) { /* ignore */ }
    if (voice.panner) { try { voice.panner.disconnect(); } catch (e) { /* ignore */ } }
    if (voice.sendG) { try { voice.sendG.disconnect(); } catch (e) { /* ignore */ } }
    const idx = voices.indexOf(voice);
    if (idx >= 0) voices.splice(idx, 1);
  }
  function enforceVoiceCap() {
    if (voices.length <= VOICE_CAP) return;
    const victims = voices.slice().sort(function (a, b) {
      return (a.prio - b.prio) || (a.startedAt - b.startedAt);
    });
    let over = voices.length - VOICE_CAP;
    for (let i = 0; i < victims.length && over > 0; i++) {
      if (victims[i].stopped) continue;
      stopVoice(victims[i], ctx.currentTime);
      over--;
    }
  }

  function makeHandle(voice) {
    return {
      id: voice.id,
      name: voice.name,
      stop: function (t) { stopVoice(voice, t); },
      set: function (param, value) {
        if (voice.ctl && voice.ctl.setters && voice.ctl.setters[param]) {
          try { voice.ctl.setters[param](value, ctx ? ctx.currentTime : 0); } catch (e) { /* ignore */ }
        }
      },
      setPos: function (pos) {
        voice.pos = pos;
        if (voice.panner) setPannerPosition(voice.panner, pos);
        updateVoiceFilter(voice);
      },
      _occl: function (amount) { voice.occlAmt = amount; updateVoiceFilter(voice); },
    };
  }

  function spawnSingle(rd, playedName, opts, forceLoop) {
    const d = rd.def;
    const now = ctx.currentTime;
    const t0 = now + Math.max(0, opts.delay || 0);
    const rMain = mkRnd((hash(playedName) ^ ((voiceSeq + 1) * 0x9e3779b1) ^ ((Math.random() * 0xffffffff) >>> 0)) >>> 0);

    const varyRate = (d.vary && d.vary.rate) ? rMain.sym(d.vary.rate) : 0;
    const varyGain = (d.vary && d.vary.gain) ? rMain.sym(d.vary.gain) : 0;
    const rate = Math.max(0.05, (opts.rate === undefined ? 1 : opts.rate) * (1 + varyRate));
    const userVol = opts.vol === undefined ? 1 : opts.vol;
    const voiceLevel = clamp(d.gain * userVol * (1 + varyGain), 0, 4);

    const lp = filt(ctx, 'lowpass', 20000, 0.4);
    const vg = gain(ctx, voiceLevel);
    lp.connect(vg);

    let sourceNode = null, liveCtl = null, buffer = null;

    if (!d.live) {
      const arr = cache[d.name];
      if (arr) {
        const nVar = Math.max(1, d.variants || 1);
        const vIdx = (rd.fixedVariant >= 0) ? clamp(rd.fixedVariant, 0, nVar - 1) : rMain.i(nVar);
        buffer = arr[vIdx] || null;
      }
    }

    if (buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      try { src.playbackRate.value = rate; } catch (e) { /* ignore */ }
      if (forceLoop) { src.loop = true; src.loopStart = 0; src.loopEnd = buffer.duration; }
      src.connect(lp);
      go(src, t0, forceLoop ? undefined : (t0 + buffer.duration / rate + 0.05));
      sourceNode = src;
    } else {
      // Live fallback / live-designed recipe — build the recipe straight
      // into the online graph. Rate is not applied here: a live recipe's own
      // internal frequencies are the source of truth.
      const pre = gain(ctx, 1);
      pre.connect(lp);
      const ctl = new Ctl();
      try { d.build(ctx, pre, t0, rMain, ctl); }
      catch (e) { Z.log('Z.Audio: live build failed for', playedName, e); }
      liveCtl = ctl;
      sourceNode = pre;
    }

    const busName = (d.bus && buses[d.bus]) ? d.bus : 'sfx';
    const bus = buses[busName];

    let panner = null;
    if (opts.pos) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = REF_DIST;
      panner.rolloffFactor = ROLLOFF;
      panner.maxDistance = MAX_DIST;
      setPannerPosition(panner, opts.pos);
      vg.connect(panner); panner.connect(bus.gain);
    } else {
      vg.connect(bus.gain);
    }

    let sendG = null;
    if (d.rev > 0 && revIn) {
      sendG = gain(ctx, d.rev);
      vg.connect(sendG); sendG.connect(revIn);
    }

    const dur = buffer ? (buffer.duration / rate) : d.dur;
    const voice = {
      id: ++voiceSeq, name: playedName, prio: d.prio === undefined ? 0.5 : d.prio, bus: busName,
      lp: lp, vg: vg, panner: panner, sendG: sendG, source: sourceNode, ctl: liveCtl,
      pos: opts.pos || null, occlAmt: 0,
      startedAt: now, stopped: false, cleaned: false,
      loop: !!forceLoop,
    };
    updateVoiceFilter(voice);
    voices.push(voice);
    enforceVoiceCap();

    if (!forceLoop) {
      const ms = Math.max(30, (t0 - now + dur + 0.25) * 1000);
      setTimeout(function () { if (!voice.stopped) cleanupVoice(voice); }, ms);
    }

    return makeHandle(voice);
  }

  function trigger(name, opts, forceLoop) {
    if (!ctx || !A.ok) return null;
    opts = opts || {};
    const rd = resolveDef(name);
    if (!rd) { Z.log('Z.Audio: unknown sound "' + name + '"'); return null; }
    const d = rd.def;

    if (d.seq) {
      const kids = [];
      for (let i = 0; i < d.seq.length; i++) {
        const item = d.seq[i];
        const childOpts = {
          pos: opts.pos,
          vol: (opts.vol === undefined ? 1 : opts.vol) * (item[2] === undefined ? 1 : item[2]),
          rate: (opts.rate === undefined ? 1 : opts.rate) * (item[3] === undefined ? 1 : item[3]),
          delay: (opts.delay || 0) + (item[1] || 0),
        };
        const h = trigger(item[0], childOpts, false);
        if (h) kids.push(h);
      }
      return {
        id: 'seq' + (++voiceSeq), name: name,
        stop: function (t) { for (let i = 0; i < kids.length; i++) kids[i].stop(t); },
        set: function () { /* no single parametric target on a sequence */ },
        setPos: function () { /* sequence children were spawned with a fixed opts.pos */ },
        _occl: function () { /* not applicable to a sequence handle */ },
      };
    }

    try { return spawnSingle(rd, name, opts, !!forceLoop); }
    catch (e) { Z.log('Z.Audio: play failed for', name, e); return null; }
  }

  // ===========================================================================
  // 7 — public API
  // ===========================================================================
  A.init = function () {
    if (ctx) return A.ready;
    try {
      const AC = (typeof AudioContext !== 'undefined') ? AudioContext
               : (typeof webkitAudioContext !== 'undefined') ? webkitAudioContext : null;
      if (!AC) { A.ok = false; A.ready = false; return false; }
      ctx = new AC();
      buildGraph();
      A.ready = true;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* needs a gesture */ } }
      bakePromise = bakeAll().catch(function (e) { Z.log('Z.Audio: bake pipeline error', e); });
      return true;
    } catch (e) {
      Z.log('Z.Audio: init failed', e);
      A.ok = false; A.ready = false; ctx = null;
      return false;
    }
  };

  A.play = function (name, opts) { return trigger(name, opts, false); };
  A.loop = function (name, opts) { return trigger(name, opts, true); };

  A.listener = function (pos, forward, up) {
    if (pos) { lis.p[0] = pos[0]; lis.p[1] = pos[1]; lis.p[2] = pos[2]; }
    if (forward) { lis.f[0] = forward[0]; lis.f[1] = forward[1]; lis.f[2] = forward[2]; }
    if (up) { lis.u[0] = up[0]; lis.u[1] = up[1]; lis.u[2] = up[2]; }
    if (!ctx) return;
    const L = ctx.listener;
    try {
      if (L.positionX) {
        const t = ctx.currentTime;
        L.positionX.setTargetAtTime(lis.p[0], t, 0.01); L.positionY.setTargetAtTime(lis.p[1], t, 0.01); L.positionZ.setTargetAtTime(lis.p[2], t, 0.01);
        L.forwardX.setTargetAtTime(lis.f[0], t, 0.01); L.forwardY.setTargetAtTime(lis.f[1], t, 0.01); L.forwardZ.setTargetAtTime(lis.f[2], t, 0.01);
        L.upX.setTargetAtTime(lis.u[0], t, 0.01); L.upY.setTargetAtTime(lis.u[1], t, 0.01); L.upZ.setTargetAtTime(lis.u[2], t, 0.01);
      } else if (L.setPosition) {
        L.setPosition(lis.p[0], lis.p[1], lis.p[2]);
        L.setOrientation(lis.f[0], lis.f[1], lis.f[2], lis.u[0], lis.u[1], lis.u[2]);
      }
    } catch (e) { /* ignore */ }
  };

  A.setMasterVolume = function (v) {
    if (!ctx || !master) return;
    try { master.gain.setTargetAtTime(clamp(v, 0, 4), ctx.currentTime, 0.05); }
    catch (e) { master.gain.value = v; }
  };
  A.setBusVolume = function (busName, v) {
    const b = buses[busName];
    if (!b || !ctx) return;
    b.vol = clamp(v, 0, 4);
    try { b.gain.gain.setTargetAtTime(b.vol, ctx.currentTime, 0.05); }
    catch (e) { b.gain.gain.value = b.vol; }
  };
  // Global duck (no bus argument in the contract): dips everything downstream
  // of the bus mix for `seconds`, then recovers — used for damage hits, radio
  // stingers, anything that needs the mix to duck out from under it briefly.
  A.duck = function (amount, seconds) {
    if (!ctx || !duckGain) return;
    const t = ctx.currentTime;
    const dip = clamp(1 - clamp(amount === undefined ? 0.6 : amount, 0, 1), 0, 1);
    const rel = Math.max(0.05, seconds === undefined ? 0.3 : seconds);
    try {
      duckGain.gain.cancelScheduledValues(t);
      duckGain.gain.setTargetAtTime(dip, t, 0.015);
      duckGain.gain.setTargetAtTime(1.0, t + rel * 0.3, rel * 0.4);
    } catch (e) { /* ignore */ }
  };
  A.setOcclusion = function (handle, amount) {
    if (handle && typeof handle._occl === 'function') handle._occl(amount);
  };
  // Read-only lookup into the def table — lets measurement tooling (and
  // gameplay code that wants to check e.g. variant counts) inspect a sound
  // without duplicating its numbers by hand. Not part of the documented
  // contract beyond that.
  A.defOf = function (name) { return DEFS[name] || null; };
  A.suspend = function () { if (ctx && ctx.state === 'running') { try { ctx.suspend(); } catch (e) { /* ignore */ } } };
  A.resume = function () { if (ctx && ctx.state !== 'closed') { try { ctx.resume(); } catch (e) { /* ignore */ } } };
  A.stopAll = function () {
    const list = voices.slice();
    for (let i = 0; i < list.length; i++) stopVoice(list[i], ctx ? ctx.currentTime : 0);
  };
  A.stats = function () {
    return {
      ok: A.ok, ready: A.ready,
      ctxState: ctx ? ctx.state : 'none',
      sampleRate: ctx ? ctx.sampleRate : 0,
      voices: voices.length, voiceCap: VOICE_CAP,
      names: NAMES.length,
      baked: bakedNames, bakeTargets: bakeTargetTotal, bakeComplete: bakeComplete,
    };
  };

  A.NAMES = NAMES.slice();
}());
