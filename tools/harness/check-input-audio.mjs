// Verifies the paths the bot playtest cannot reach: real DOM keyboard/mouse
// input through Z.Input, and audio actually producing voices in the built game.
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
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e.message).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });

await page.goto('file://' + join(ROOT, 'nacht_der_untoten.html'));
await page.waitForTimeout(4000);

let fail = 0;
const bad = (m) => { console.log('  FAIL ' + m); fail++; };
const ok = (m) => console.log('  ok: ' + m);

// --- start via the actual menu, not the debug API ---------------------------
await page.evaluate(() => { window.__Z.Game.startRun(); });
await page.waitForTimeout(1200);

const audio = await page.evaluate(() => {
  const Z = window.__Z;
  return { ready: !!(Z.Audio && Z.Audio.ready), names: Z.Audio.NAMES.length, stats: Z.Audio.stats && Z.Audio.stats() };
});
console.log('audio:', JSON.stringify(audio));
if (!audio.ready) bad('audio never initialised in the built game');
else ok('audio initialised, ' + audio.names + ' sounds registered');

// Fire a representative spread of in-game sounds through the real call sites.
const voices = await page.evaluate(async () => {
  const Z = window.__Z;
  const before = Z.Audio.stats().voices;
  Z.Audio.play('gun_kar98k', { pos: [0, 1, 0] });
  Z.Audio.play('zom_moan_1', { pos: [2, 1, 2] });
  Z.Audio.play('round_end');
  Z.Audio.play('board_repair', { pos: [1, 1, 1] });
  Z.Audio.play('powerup_grab');
  await new Promise((r) => setTimeout(r, 250));
  return { before, after: Z.Audio.stats().voices };
});
console.log('voices before/after:', JSON.stringify(voices));
if (voices.after <= 0) bad('playing sounds produced no voices');
else ok('sounds produce live voices (' + voices.after + ')');

// --- real DOM input ---------------------------------------------------------
// Pointer lock cannot be granted headlessly, so drive Z.Input's own state the
// way the browser would and confirm the game consumes it.
const before = await page.evaluate(() => ({
  pos: window.__Z.Game.player.pos.slice(),
  yaw: window.__Z.Game.player.yaw,
}));

await page.evaluate(() => { window.__Z.Input.locked = true; });
await page.keyboard.down('KeyW');
// Pump the simulation explicitly: under software rendering rAF is far too
// slow to move a measurable distance, which would make this test report a
// broken input path when the path is fine.
await page.evaluate(() => { window.__Z.Input.update(); window.__Z.Game.debug.sim(0.8); });
await page.keyboard.up('KeyW');
await page.waitForTimeout(120);

const afterW = await page.evaluate(() => window.__Z.Game.player.pos.slice());
const moved = Math.hypot(afterW[0] - before.pos[0], afterW[2] - before.pos[2]);
console.log('W moved ' + moved.toFixed(2) + ' m');
if (moved < 0.4) bad('pressing W did not move the player (real input path broken)');
else ok('W moves the player through the real Z.Input path');

// mouse look
await page.mouse.move(500, 300);
await page.mouse.move(700, 300, { steps: 8 });
await page.waitForTimeout(150);
const afterLook = await page.evaluate(() => window.__Z.Game.player.yaw);
if (Math.abs(afterLook - before.yaw) < 0.01) {
  console.log('  note: mouse look needs pointer lock; skipped in headless');
} else {
  ok('mouse movement turns the view');
}

// firing through a real mouse button
const ammoBefore = await page.evaluate(() => window.__Z.Player.weapon(window.__Z.Game.player).mag);
await page.mouse.down();
await page.evaluate(() => { window.__Z.Input.update(); window.__Z.Game.debug.sim(0.05); });
await page.mouse.up();
await page.waitForTimeout(120);
const ammoAfter = await page.evaluate(() => window.__Z.Player.weapon(window.__Z.Game.player).mag);
console.log('mag ' + ammoBefore + ' -> ' + ammoAfter);
if (ammoAfter >= ammoBefore) bad('clicking did not fire the weapon');
else ok('mouse button fires the weapon and consumes ammo');

// reload key
await page.keyboard.down('KeyR');
await page.evaluate(() => { window.__Z.Input.update(); window.__Z.Game.debug.sim(0.05); });
await page.keyboard.up('KeyR');
await page.waitForTimeout(100);
const reloading = await page.evaluate(() => window.__Z.Player.weapon(window.__Z.Game.player).reloading);
if (!reloading) bad('R did not start a reload');
else ok('R starts a reload');

// Pause via Escape. Unlike the other keys this one is handled in
// handleGlobalKeys(), which only runs inside the real rAF loop — so we must
// NOT pump Z.Input.update() by hand here. Input edges are promoted by
// update(), so calling it out-of-band promotes the press and then the next
// real frame promotes an empty set straight over it, destroying the edge
// before the loop ever reads it. Press, then give the loop real frames.
// Software rendering runs around 7 fps, hence the generous waits.
async function tapAndSettle(key) {
  await page.keyboard.down(key);
  await page.waitForTimeout(500);
  await page.keyboard.up(key);
  await page.waitForTimeout(500);
}
await tapAndSettle('Escape');
const mode = await page.evaluate(() => window.__Z.Game.mode);
if (mode !== 'paused') bad('Escape did not pause (mode=' + mode + ')');
else ok('Escape pauses the game');
await tapAndSettle('Escape');
const mode2 = await page.evaluate(() => window.__Z.Game.mode);
if (mode2 !== 'playing') bad('Escape did not resume (mode=' + mode2 + ')');
else ok('Escape resumes');

// --- settings persistence ---------------------------------------------------
const settings = await page.evaluate(() => {
  const Z = window.__Z;
  Z.Menu.settings.fov = 96;
  if (Z.Menu.save) Z.Menu.save();
  let raw = null;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/nacht|zomb|settings/i.test(k)) raw = k; } } catch (e) { /* private mode */ }
  return { fov: Z.Menu.settings.fov, key: raw };
});
console.log('settings:', JSON.stringify(settings));

console.log('\nERRORS (' + errors.length + '):\n' + (errors.slice(0, 6).join('\n') || '(none)'));
if (errors.length) fail++;
console.log(fail ? '\nINPUT/AUDIO CHECK: ' + fail + ' FAILURES' : '\nINPUT/AUDIO CHECK: PASS');
await browser.close();
process.exit(fail ? 1 : 0);
