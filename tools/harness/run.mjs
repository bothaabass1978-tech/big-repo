// Launches the built game in headless Chromium, drives it through the debug
// API, and reports errors + telemetry. This is the ground truth for "does it
// actually work", not a syntax check.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './load.mjs';

const OUT = join(ROOT, 'production', 'qa', 'evidence');
mkdirSync(OUT, { recursive: true });

const scenario = process.argv[2] || 'smoke';
const HEADLESS = true;

// The image ships a newer Chromium than this Playwright build expects, so
// point at the installed binary rather than trying to download one.
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox', '--disable-dev-shm-usage',
         '--autoplay-policy=no-user-gesture-required',
         '--use-gl=angle', '--use-angle=swiftshader',
         '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
const logs = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + (e.stack || e.message)));
page.on('console', (m) => {
  const t = m.text();
  logs.push(m.type() + ': ' + t);
  if (m.type() === 'error') errors.push('CONSOLE: ' + t);
});

await page.goto('file://' + join(ROOT, 'nacht_der_untoten.html'));
await page.waitForTimeout(4000);

const fatal = await page.evaluate(() => {
  const el = document.getElementById('fatal');
  return (el && el.style.display === 'block') ? el.textContent.slice(0, 3000) : null;
});
if (fatal) {
  console.log('=== FATAL ===\n' + fatal);
  console.log('\n=== ERRORS ===\n' + errors.join('\n').slice(0, 3000));
  await browser.close();
  process.exit(1);
}

const boot = await page.evaluate(() => {
  const Z = window.__Z;
  if (!Z) return { error: 'no __Z' };
  return {
    mode: Z.Game.mode,
    hasGL: !!Z.GL.gl,
    gl2: Z.GL.gl2,
    materials: Z.Tex.KEYS.length,
    sprites: Object.keys(Z.Tex.SPRITES).length,
    texBuildMs: Z.Tex._buildMs,
    level: Z.Level.stats(),
    nav: Z.Nav.stats,
    worldTris: Z.Render.world.tris,
    models: {
      zombie: !!(Z.Models && Z.Models.zombie),
      variants: (Z.Models && Z.Models.zombieVariants) ? Z.Models.zombieVariants.length : 0,
      guns: (Z.Models && Z.Models.guns) ? Object.keys(Z.Models.guns).length : 0,
      props: (Z.Models && Z.Models.props) ? Object.keys(Z.Models.props).length : 0,
      anims: (Z.Models && Z.Models.ANIMS) ? Z.Models.ANIMS.length : 0,
    },
    audioNames: (Z.Audio && Z.Audio.NAMES) ? Z.Audio.NAMES.length : 0,
  };
});
console.log('=== BOOT ===');
console.log(JSON.stringify(boot, null, 1));

await page.screenshot({ path: join(OUT, 'shot-menu.png') });

// --- start a run ------------------------------------------------------------
await page.evaluate(() => { window.__Z.Game.startRun(); });
await page.waitForTimeout(1500);
await page.screenshot({ path: join(OUT, 'shot-round0.png') });

// --- simulate gameplay ------------------------------------------------------
const sim1 = await page.evaluate(() => window.__Z.Game.debug.sim(20));
console.log('\n=== AFTER 20s SIM ===');
console.log(JSON.stringify(sim1, null, 1));
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, 'shot-round1.png') });

const sim2 = await page.evaluate(() => {
  const Z = window.__Z;
  Z.Game.debug.godMode(true);
  Z.Game.debug.sim(60);
  return Z.Game.debug.stats();
});
console.log('\n=== AFTER 80s SIM ===');
console.log(JSON.stringify(sim2, null, 1));
await page.waitForTimeout(400);
await page.screenshot({ path: join(OUT, 'shot-round2.png') });

// --- fps over 90 real frames ------------------------------------------------
const perf = await page.evaluate(async () => {
  const Z = window.__Z;
  const t0 = performance.now();
  let frames = 0;
  await new Promise((res) => {
    function f() { frames++; if (frames < 90) requestAnimationFrame(f); else res(); }
    requestAnimationFrame(f);
  });
  return { frames, ms: performance.now() - t0, fps: Z.Game.fps, render: Z.Render.stats() };
});
console.log('\n=== PERF ===');
console.log(JSON.stringify(perf, null, 1));

console.log('\n=== ERRORS (' + errors.length + ') ===');
console.log(errors.slice(0, 25).join('\n').slice(0, 6000) || '(none)');

await browser.close();
process.exit(errors.length ? 2 : 0);
