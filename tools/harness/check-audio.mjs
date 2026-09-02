// Measures the synthesized audio, because nobody involved can listen to it.
//
// Every sound is built by a recipe into an OfflineAudioContext, so we can
// render each one headlessly, pull the float samples back, and put real
// numbers against the things that make synthesized audio sound like a toy:
// soft transients, sounds that are all the same loudness, guns that share a
// spectrum, and repeats that are bit-identical.
import { chromium } from 'playwright';
import { join } from 'node:path';
import { ROOT } from './load.mjs';

const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox', '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
await page.goto('file://' + join(ROOT, 'nacht_der_untoten.html'));
await page.waitForTimeout(4000);

// The subject list comes from the game itself rather than being hardcoded:
// guessed names silently render as "no recipe" errors and hide real defects.
// It is a representative spread rather than all of them — the guns that must
// be told apart, the zombie voices that must sound like a crowd, and the cues
// a CoD player would recognise blindfolded.
const SUBJECT = process.argv[2];
const NAMES = SUBJECT ? [SUBJECT] : await page.evaluate(() => {
  const A = window.__Z.Audio;
  // defOf lets us skip aliases and live/sequenced sounds, which have no single
  // bakeable buffer. Without it we take every name and let the unrenderable
  // ones surface as ERROR rows, which is still information.
  const all = A.defOf
    ? A.NAMES.filter((n) => { const d = A.defOf(n); return d && d.build && !d.aliasOf && !d.seq && !d.live; })
    : A.NAMES.slice();
  const pick = (re, n) => all.filter((x) => re.test(x)).slice(0, n);
  return [].concat(
    pick(/^gun_/, 10),
    pick(/^zom_(moan|scream|death|attack)/, 6),
    pick(/^round_/, 3),
    pick(/^(board_|box_|perk_|powerup_)/, 8),
    pick(/^reload_/, 3),
  );
});

const rows = await page.evaluate(async (names) => {
  const A = window.__Z.Audio;
  const out = [];

  function analyse(buf) {
    const n = buf.length;
    const ch = buf.numberOfChannels;
    // Mono-sum for measurement; stereo width is not what we're testing here.
    const x = new Float32Array(n);
    for (let c = 0; c < ch; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) x[i] += d[i] / ch;
    }
    let peak = 0, sumSq = 0, clipped = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(x[i]);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
      sumSq += x[i] * x[i];
    }
    const rms = Math.sqrt(sumSq / n);

    // Time to reach 90% of peak — the transient. A gunshot that takes 40 ms
    // to get there reads as a "pop", not a crack.
    let attack = 0;
    for (let i = 0; i < n; i++) {
      if (Math.abs(x[i]) >= peak * 0.9) { attack = i / buf.sampleRate; break; }
    }
    // Audible tail: last sample above -60 dBFS relative to peak.
    let last = 0;
    for (let i = n - 1; i >= 0; i--) {
      if (Math.abs(x[i]) > peak * 0.001) { last = i / buf.sampleRate; break; }
    }
    // Spectral centroid by Goertzel over log-spaced bands — cheap, and enough
    // to say whether two guns occupy the same place in the spectrum.
    const sr = buf.sampleRate;
    let num = 0, den = 0;
    const step = Math.max(1, Math.floor(n / 8192));
    for (let f = 60; f < Math.min(12000, sr / 2); f *= 1.25) {
      const w = 2 * Math.PI * f / sr;
      const cw = 2 * Math.cos(w);
      let s0 = 0, s1 = 0, s2 = 0;
      for (let i = 0; i < n; i += step) { s0 = x[i] + cw * s1 - s2; s2 = s1; s1 = s0; }
      const mag = Math.sqrt(s1 * s1 + s2 * s2 - cw * s1 * s2);
      num += f * mag; den += mag;
    }
    return {
      peak, rms, attack, dur: last, clipped,
      centroid: den > 0 ? num / den : 0,
    };
  }

  for (const name of names) {
    try {
      const b1 = await A._offlineRender(name, 0);
      const m = analyse(b1);
      const def = A.defOf ? A.defOf(name) : null;
      const variants = def ? (def.variants || 1) : 0;   // 0 = not reported
      // A sound with only one variant plays the identical waveform every time
      // it fires. In a firefight that is the classic synthesized-audio tell.
      // Where variants exist, check they are actually different from each other.
      let same = variants === 1;   // unknown (0) is not a claim either way
      if (variants >= 2) {
        const b2 = await A._offlineRender(name, 1);
        const d1 = b1.getChannelData(0), d2 = b2.getChannelData(0);
        same = d1.length === d2.length;
        if (same) for (let i = 0; i < d1.length; i += 97) { if (d1[i] !== d2[i]) { same = false; break; } }
      }
      out.push(Object.assign({ name, identicalRepeat: same, variants }, m));
    } catch (e) {
      out.push({ name, error: String(e.message || e).slice(0, 90) });
    }
  }
  return out;
}, NAMES);

const dbfs = (v) => (v <= 0 ? -99 : 20 * Math.log10(v));
const pad = (s, n) => String(s).padEnd(n);
const num = (v, n, d) => String(v.toFixed(d)).padStart(n);

console.log(pad('sound', 20) + num(0, 8, 0).replace('0', 'peak').padStart(8)
  + '   rms   attack    dur  centroid  var  same');
console.log('-'.repeat(76));
let fail = 0;
const bad = (m) => { console.log('  FAIL ' + m); fail++; };
const guns = [];
for (const r of rows) {
  if (r.error) { console.log(pad(r.name, 20) + '  ERROR ' + r.error); fail++; continue; }
  console.log(pad(r.name, 20)
    + num(dbfs(r.peak), 7, 1) + num(dbfs(r.rms), 7, 1)
    + num(r.attack * 1000, 8, 1) + 'ms' + num(r.dur, 6, 2) + 's'
    + num(r.centroid, 9, 0) + 'Hz' + (r.variants ? num(r.variants, 4, 0) : '   ?')
    + (r.identicalRepeat ? '  yes' : '   no'));
  if (r.name.startsWith('gun_')) guns.push(r);
  if (r.clipped > 8) bad(r.name + ' clips (' + r.clipped + ' samples at full scale)');
  if (r.peak < 0.02) bad(r.name + ' is effectively silent (peak ' + dbfs(r.peak).toFixed(1) + ' dBFS)');
  if (r.dur < 0.02) bad(r.name + ' is shorter than 20 ms');
  if (r.identicalRepeat) {
    bad(r.name + (r.variants === 1
      ? ' has a single variant — every repeat is the same waveform'
      : ' has ' + r.variants + ' variants that render identically'));
  }
}

// A gunshot's transient is the whole character. Anything slower than ~8 ms to
// 90% of peak reads as a soft pop rather than a crack.
for (const g of guns) {
  if (g.attack > 0.008) bad(g.name + ' has a soft transient (' + (g.attack * 1000).toFixed(1) + ' ms to 90% peak, want < 8)');
}
// Guns must be tellable apart with your eyes shut. If two sit within 8% of
// each other in both loudness and spectral centre, they are reskins.
for (let i = 0; i < guns.length; i++) {
  for (let j = i + 1; j < guns.length; j++) {
    const a = guns[i], b = guns[j];
    const dc = Math.abs(a.centroid - b.centroid) / Math.max(a.centroid, b.centroid, 1);
    const dl = Math.abs(dbfs(a.rms) - dbfs(b.rms));
    if (dc < 0.08 && dl < 1.0) {
      bad(a.name + ' and ' + b.name + ' are near-identical (centroid within '
        + (dc * 100).toFixed(1) + '%, level within ' + dl.toFixed(1) + ' dB)');
    }
  }
}
// Mix consistency: one sound 20 dB above the rest means the mix is not mixed.
const lvls = rows.filter((r) => !r.error).map((r) => dbfs(r.rms));
if (lvls.length) {
  const lo = Math.min(...lvls), hi = Math.max(...lvls);
  console.log('\nRMS spread across the set: ' + lo.toFixed(1) + ' .. ' + hi.toFixed(1)
    + ' dBFS (' + (hi - lo).toFixed(1) + ' dB)');
  if (hi - lo > 26) bad('mix spread is ' + (hi - lo).toFixed(1) + ' dB — some sounds will be inaudible next to others');
}

console.log('\nERRORS (' + errors.length + '): ' + (errors.slice(0, 4).join(' | ') || '(none)'));
if (errors.length) fail++;
console.log(fail ? '\nAUDIO CHECK: ' + fail + ' FAILURES' : '\nAUDIO CHECK: PASS');
await browser.close();
process.exit(fail ? 1 : 0);
