// Separates CPU simulation cost from GPU rasterisation cost.
//
// Screenshots here are taken under SwiftShader, which is 50-100x slower than a
// real GPU at fill, so end-to-end fps says nothing about shipping performance.
// What matters is the JS budget: if a fixed step costs more than ~2 ms with a
// full horde, the game cannot hit 60 Hz on any hardware.
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('file://' + join(ROOT, 'nacht_der_untoten.html'));
await page.waitForTimeout(4000);

const boot = await page.evaluate(() => ({
  tex: window.__Z.Tex._buildMs,
  nav: window.__Z.Nav.buildMs,
  worldTris: window.__Z.Render.world.tris,
}));
console.log('build costs: textures ' + boot.tex.toFixed(0) + 'ms, nav '
  + boot.nav.toFixed(0) + 'ms, world ' + boot.worldTris + ' tris');

const results = [];
for (const round of [1, 5, 10, 15, 20]) {
  const r = await page.evaluate(async (rd) => {
    const Z = window.__Z;
    Z.Game.startRun();
    Z.Game.debug.godMode(true);
    Z.Game.debug.setRound(rd);
    Z.Game.debug.sim(30);              // let the horde build up
    const alive = Z.Zombies.countAlive();

    // Time pure simulation: N fixed steps, no rendering.
    const N = 600;
    const t0 = performance.now();
    Z.Game.debug.sim(N / 120);
    const simMs = (performance.now() - t0) / N;

    // Time a full frame including the GL submission (not the GPU itself).
    const t1 = performance.now();
    let frames = 0;
    await new Promise((res) => {
      function f() { frames++; if (frames < 20) requestAnimationFrame(f); else res(); }
      requestAnimationFrame(f);
    });
    const frameMs = (performance.now() - t1) / frames;

    return {
      round: rd, alive, simMs, frameMs,
      draws: Z.Render.stats().draws, tris: Z.Render.stats().tris,
      particles: Z.FX.stats().particles,
      navCalls: Z.Nav.searchStats.calls,
    };
  }, round);
  results.push(r);
  console.log('round ' + String(r.round).padStart(2) + '  alive ' + String(r.alive).padStart(2)
    + '  sim/step ' + r.simMs.toFixed(3) + 'ms'
    + '  budget@60Hz ' + ((r.simMs * 2 / 16.67) * 100).toFixed(1) + '%'
    + '  draws ' + r.draws + '  tris ' + r.tris);
}

let fail = 0;
const worst = results.reduce((a, b) => (b.simMs > a.simMs ? b : a));
console.log('\nworst simulation cost: ' + worst.simMs.toFixed(3)
  + ' ms/step at round ' + worst.round + ' with ' + worst.alive + ' zombies');
// A 60 Hz frame runs 2 fixed steps at 1/120.
const perFrame = worst.simMs * 2;
console.log('simulation per 60 Hz frame: ' + perFrame.toFixed(2) + ' ms of the 16.67 ms budget');
if (perFrame > 8) { console.log('  FAIL: simulation alone eats over half the frame budget'); fail++; }
else console.log('  ok: leaves ' + (16.67 - perFrame).toFixed(1) + ' ms for rendering');

const maxDraws = Math.max(...results.map((r) => r.draws));
console.log('peak draw calls: ' + maxDraws);
if (maxDraws > 300) { console.log('  FAIL: too many draw calls'); fail++; }
else console.log('  ok: draw call count is low');

console.log(fail ? '\nPERF CHECK: ' + fail + ' FAILURES' : '\nPERF CHECK: PASS');
await browser.close();
process.exit(fail ? 1 : 0);
