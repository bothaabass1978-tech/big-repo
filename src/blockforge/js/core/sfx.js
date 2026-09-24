/**
 * BlockForge — synthesized sound effects (WebAudio, no audio files).
 * Audio starts only after the first user gesture (browser autoplay rules).
 */
(function (BF) {
  'use strict';

  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  const lastPlayed = new Map();

  const sfx = (BF.sfx = {
    enabled: true,
    volume: 0.6,

    /** Create the AudioContext lazily. */
    init() {
      if (ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = sfx.volume * 0.5;
        master.connect(ctx.destination);
        noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        return true;
      } catch (e) {
        ctx = null;
        return false;
      }
    },

    /** Resume audio after a user gesture. */
    unlock() {
      if (!sfx.init()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    },

    setVolume(v) {
      sfx.volume = BF.util.clamp(v, 0, 1);
      if (master) master.gain.value = sfx.volume * 0.5;
    },

    setEnabled(on) {
      sfx.enabled = !!on;
    },

    /**
     * Play a named effect.
     * @param {string} name effect id from the table below
     * @param {{pitch?:number, vol?:number}} [opts]
     */
    play(name, opts) {
      if (!sfx.enabled || sfx.volume <= 0) return;
      if (!ctx && !sfx.init()) return;
      if (ctx.state !== 'running') return;
      const fx = EFFECTS[name];
      if (!fx) return;
      const now = performance.now();
      const gap = fx.gap || 30;
      if (now - (lastPlayed.get(name) || 0) < gap) return;
      lastPlayed.set(name, now);
      try {
        fx.play((opts && opts.pitch) || 1, (opts && opts.vol) || 1);
      } catch (e) {
        /* audio glitches are never fatal */
      }
    },
  });

  function tone(freq, dur, o) {
    o = o || {};
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t0 + dur);
    if (o.detune) osc.detune.value = o.detune;
    const vol = (o.vol == null ? 0.3 : o.vol);
    const attack = o.attack == null ? 0.005 : o.attack;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(o.dest || master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, o) {
    o = o || {};
    const t0 = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = o.filter || 'lowpass';
    filter.frequency.setValueAtTime(o.freq || 1200, t0);
    if (o.freqTo) filter.frequency.exponentialRampToValueAtTime(o.freqTo, t0 + dur);
    const gain = ctx.createGain();
    const vol = o.vol == null ? 0.3 : o.vol;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  const notes = (list, step, o) => list.forEach((f, i) => tone(f, (o && o.dur) || 0.18, Object.assign({}, o, { delay: i * step })));

  const EFFECTS = {
    click: { gap: 25, play: (p, v) => tone(1100 * p, 0.04, { type: 'square', vol: 0.05 * v }) },
    tab: { gap: 25, play: (p, v) => tone(700 * p, 0.05, { type: 'triangle', vol: 0.08 * v }) },
    open: { play: (p, v) => tone(420 * p, 0.12, { type: 'sine', vol: 0.12 * v, slideTo: 640 * p }) },
    close: { play: (p, v) => tone(560 * p, 0.1, { type: 'sine', vol: 0.1 * v, slideTo: 360 * p }) },
    coin: { gap: 60, play: (p, v) => { tone(988 * p, 0.09, { type: 'triangle', vol: 0.18 * v }); tone(1319 * p, 0.22, { type: 'triangle', vol: 0.18 * v, delay: 0.07 }); } },
    purchase: { play: (p, v) => { notes([523, 659, 784, 1047].map((f) => f * p), 0.06, { type: 'triangle', vol: 0.16 * v, dur: 0.22 }); tone(2093 * p, 0.35, { type: 'sine', vol: 0.06 * v, delay: 0.26 }); } },
    error: { play: (p, v) => { tone(180 * p, 0.18, { type: 'sawtooth', vol: 0.09 * v, slideTo: 120 * p }); tone(150 * p, 0.2, { type: 'square', vol: 0.05 * v, delay: 0.09 }); } },
    notify: { gap: 200, play: (p, v) => { tone(660 * p, 0.12, { vol: 0.12 * v }); tone(880 * p, 0.2, { vol: 0.12 * v, delay: 0.09 }); } },
    levelup: { play: (p, v) => { notes([392, 523, 659, 784, 1047].map((f) => f * p), 0.07, { type: 'square', vol: 0.07 * v, dur: 0.2 }); notes([523, 659, 784].map((f) => f * p), 0, { type: 'triangle', vol: 0.12 * v, dur: 0.7, delay: 0.38 }); } },
    achievement: { play: (p, v) => { notes([523, 784, 1047, 1568].map((f) => f * p), 0.09, { type: 'triangle', vol: 0.15 * v, dur: 0.35 }); tone(1047 * p, 0.9, { type: 'sine', vol: 0.08 * v, delay: 0.36 }); } },
    join: { gap: 150, play: (p, v) => tone(520 * p, 0.12, { vol: 0.08 * v, slideTo: 780 * p }) },
    leave: { gap: 150, play: (p, v) => tone(640 * p, 0.12, { vol: 0.07 * v, slideTo: 380 * p }) },
    chat: { gap: 80, play: (p, v) => tone(1500 * p, 0.05, { type: 'sine', vol: 0.05 * v }) },
    shoot: { gap: 45, play: (p, v) => tone(900 * p, 0.09, { type: 'square', vol: 0.05 * v, slideTo: 220 * p }) },
    laser: { gap: 45, play: (p, v) => tone(1400 * p, 0.12, { type: 'sawtooth', vol: 0.04 * v, slideTo: 300 * p }) },
    swing: { gap: 60, play: (p, v) => noise(0.12, { filter: 'bandpass', freq: 1800 * p, freqTo: 600 * p, vol: 0.18 * v }) },
    hit: { gap: 35, play: (p, v) => { noise(0.08, { freq: 2200 * p, vol: 0.2 * v }); tone(220 * p, 0.08, { type: 'square', vol: 0.05 * v, slideTo: 90 }); } },
    hurt: { gap: 90, play: (p, v) => tone(300 * p, 0.2, { type: 'sawtooth', vol: 0.07 * v, slideTo: 110 * p }) },
    explosion: { gap: 70, play: (p, v) => { noise(0.5, { freq: 900 * p, freqTo: 80, vol: 0.35 * v }); tone(90 * p, 0.35, { type: 'sine', vol: 0.2 * v, slideTo: 40 }); } },
    jump: { gap: 60, play: (p, v) => tone(320 * p, 0.14, { type: 'square', vol: 0.06 * v, slideTo: 720 * p }) },
    land: { gap: 90, play: (p, v) => noise(0.06, { freq: 500 * p, vol: 0.12 * v }) },
    pickup: { gap: 40, play: (p, v) => { tone(880 * p, 0.07, { type: 'triangle', vol: 0.12 * v }); tone(1320 * p, 0.1, { type: 'triangle', vol: 0.1 * v, delay: 0.05 }); } },
    powerup: { play: (p, v) => notes([440, 554, 659, 880].map((f) => f * p), 0.05, { type: 'square', vol: 0.06 * v, dur: 0.12 }) },
    dig: { gap: 120, play: (p, v) => noise(0.14, { freq: 700 * p, vol: 0.2 * v }) },
    mine: { gap: 70, play: (p, v) => { noise(0.05, { filter: 'highpass', freq: 2500 * p, vol: 0.12 * v }); tone(1800 * p, 0.05, { type: 'square', vol: 0.03 * v }); } },
    splash: { gap: 80, play: (p, v) => noise(0.3, { filter: 'bandpass', freq: 900 * p, freqTo: 300, vol: 0.2 * v }) },
    boost: { gap: 200, play: (p, v) => tone(200 * p, 0.45, { type: 'sawtooth', vol: 0.06 * v, slideTo: 900 * p }) },
    beep: { gap: 100, play: (p, v) => tone(440 * p, 0.16, { type: 'square', vol: 0.07 * v }) },
    go: { gap: 100, play: (p, v) => tone(880 * p, 0.45, { type: 'square', vol: 0.08 * v }) },
    win: { play: (p, v) => { notes([523, 659, 784, 659, 784, 1047].map((f) => f * p), 0.1, { type: 'triangle', vol: 0.14 * v, dur: 0.25 }); } },
    lose: { play: (p, v) => notes([392, 349, 311, 262].map((f) => f * p), 0.16, { type: 'triangle', vol: 0.12 * v, dur: 0.3 }) },
    hatch: { play: (p, v) => { noise(0.08, { freq: 3000 * p, vol: 0.15 * v }); notes([784, 988, 1175, 1568].map((f) => f * p), 0.05, { type: 'triangle', vol: 0.1 * v, dur: 0.2, delay: 0.08 }); } },
    build: { gap: 80, play: (p, v) => { noise(0.1, { freq: 400 * p, vol: 0.2 * v }); tone(160 * p, 0.12, { type: 'square', vol: 0.05 * v }); } },
    goal: { play: (p, v) => { noise(0.8, { filter: 'bandpass', freq: 1200, vol: 0.12 * v }); notes([523, 659, 784, 1047].map((f) => f * p), 0.08, { type: 'square', vol: 0.06 * v, dur: 0.25 }); } },
    whistle: { play: (p, v) => { tone(2100 * p, 0.25, { type: 'sine', vol: 0.12 * v }); tone(2100 * p, 0.45, { type: 'sine', vol: 0.12 * v, delay: 0.3 }); } },
    type: { gap: 18, play: (p, v) => tone(1800 + Math.random() * 400, 0.025, { type: 'square', vol: 0.025 * v }) },
    anvil: { gap: 90, play: (p, v) => { [523, 1231, 1873, 2654].forEach((f, i) => tone(f * p, 0.9 - i * 0.15, { type: 'sine', vol: (0.16 - i * 0.03) * v })); noise(0.05, { filter: 'highpass', freq: 3000, vol: 0.15 * v }); } },
    rune: { gap: 60, play: (p, v) => { tone(440 * p, 0.45, { type: 'triangle', vol: 0.13 * v }); tone(880 * p, 0.3, { type: 'sine', vol: 0.05 * v }); } },
    secret: {
      gap: 1000,
      play: (p, v) => {
        tone(55, 2.6, { type: 'sawtooth', vol: 0.05 * v, attack: 0.6 });
        tone(110, 2.4, { type: 'sine', vol: 0.12 * v, attack: 0.4, detune: 7 });
        [659, 880, 1175, 1568, 1976].forEach((f, i) => tone(f, 1.4, { type: 'sine', vol: 0.06 * v, delay: 0.5 + i * 0.16, attack: 0.02 }));
        noise(1.6, { filter: 'bandpass', freq: 400, freqTo: 4000, vol: 0.06 * v, delay: 0.2 });
      },
    },
  };
})((window.BF = window.BF || {}));
