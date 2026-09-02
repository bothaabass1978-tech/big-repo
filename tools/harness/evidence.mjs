// Captures a fixed battery of screenshots at specific, reproducible game
// states. This is the evidence pack a reviewer judges the game on — it must
// cover the things the game is actually about, not whatever frame happened to
// be on screen.
import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { ROOT } from './load.mjs';

const OUT = join(ROOT, 'production', 'qa', 'evidence');
mkdirSync(OUT, { recursive: true });
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox', '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e.message).slice(0, 300)));
await page.goto('file://' + join(ROOT, 'nacht_der_untoten.html'));
await page.waitForTimeout(4000);

await page.screenshot({ path: join(OUT, 'ev-01-menu.png') });

await page.evaluate(() => {
  const Z = window.__Z;
  Z.Game.startRun();
  Z.Game.debug.godMode(true);
});
await page.waitForTimeout(600);

// Put the camera exactly where we want it, then let one tick settle.
async function shot(name, setup) {
  await page.evaluate((s) => {
    const Z = window.__Z;
    const G = Z.Game;
    // eslint-disable-next-line no-eval
    (new Function('Z', 'G', s))(Z, G);
    G.debug.sim(0.05);
  }, setup);
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(OUT, name) });
}

// --- the opening view a player actually gets -------------------------------
await shot('ev-02-spawn.png', `
  G.debug.teleport(-5.5, 0, 3.0);
  G.player.yaw = Math.PI; G.player.pitch = -0.04;
`);

// --- a boarded window, close, so the barricade reads -----------------------
await shot('ev-03-barricade.png', `
  G.debug.teleport(-7.6, 0, -5.6);
  G.player.yaw = 0; G.player.pitch = -0.02;
`);

// --- a wall buy: can you read the gun and the price? -----------------------
await shot('ev-04-wallbuy.png', `
  G.debug.teleport(-8.6, 0, -6.4);
  G.player.yaw = 0; G.player.pitch = -0.06;
`);

// --- the mystery box -------------------------------------------------------
await shot('ev-05-mysterybox.png', `
  const b = Z.Econ.box;
  G.debug.teleport(b.pos[0] + 1.9, 0, b.pos[2] + 1.9);
  G.player.yaw = Math.atan2(-(b.pos[0] - G.player.pos[0]), -(b.pos[2] - G.player.pos[2]));
  G.player.pitch = -0.20;
`);

// --- a perk machine --------------------------------------------------------
await shot('ev-06-perk.png', `
  const m = Z.Econ.machines[0];
  G.debug.teleport(m.pos[0] + 2.0, m.pos[1], m.pos[2] + 1.4);
  G.player.yaw = Math.atan2(-(m.pos[0] - G.player.pos[0]), -(m.pos[2] - G.player.pos[2]));
  G.player.pitch = -0.05;
`);

// --- the debris that gates the stairs --------------------------------------
await shot('ev-07-debris.png', `
  const d = Z.Level.level.buys.find(function (b) { return b.id === 'stairs_west'; });
  G.debug.teleport(d.use[0], 0, d.use[2]);
  const dx = d.pos[0] - G.player.pos[0], dz = d.pos[2] - G.player.pos[2];
  G.player.yaw = Math.atan2(-dx, -dz); G.player.pitch = -0.10;
`);

// --- upstairs: the HELP room ----------------------------------------------
await shot('ev-08-helproom.png', `
  G.debug.openAll();
  G.debug.teleport(-4.0, 3.62, -4.0);
  G.player.yaw = Math.PI * 0.02; G.player.pitch = 0.02;
`);

// --- a horde mid-round, close quarters -------------------------------------
await shot('ev-09-horde.png', `
  G.debug.setRound(8);
  G.debug.sim(26);
  // Look at the densest group 5-14 m out, not whatever is closest — a zombie
  // pressed against the lens tells you nothing about how a horde reads.
  let best = null, bestScore = -1;
  for (const z of Z.Zombies.list) {
    if (z.dying) continue;
    const d = Z.M.dist3(z.pos, G.player.pos);
    if (d < 5 || d > 14) continue;
    let n = 0;
    for (const o of Z.Zombies.list) { if (!o.dying && Z.M.dist3(o.pos, z.pos) < 5) n++; }
    const score = n - d * 0.1;
    if (score > bestScore) { bestScore = score; best = z; }
  }
  if (best) {
    G.player.yaw = Math.atan2(-(best.pos[0] - G.player.pos[0]), -(best.pos[2] - G.player.pos[2]));
    G.player.pitch = -0.02;
  }
`);

// --- shooting: muzzle flash, tracer, blood ---------------------------------
await page.evaluate(() => {
  const Z = window.__Z;
  const G = Z.Game;
  // Frame a zombie at a range you would actually shoot from. The nearest one
  // is usually inside melee reach, and a head filling a quarter of the screen
  // says nothing about how the horde reads in a fight.
  let z = null, bestD = 1e9;
  for (const c of Z.Zombies.list) {
    if (c.dying) continue;
    const d = Z.M.dist3(c.pos, G.player.pos);
    if (d < 3.5 || d > 9) continue;
    if (Math.abs(d - 5.5) < bestD) { bestD = Math.abs(d - 5.5); z = c; }
  }
  if (!z) z = Z.Zombies.nearestTo(G.player.pos, 40);
  if (z) {
    G.player.yaw = Math.atan2(-(z.pos[0] - G.player.pos[0]), -(z.pos[2] - G.player.pos[2]));
  }
  let n = 0;
  Z.Game.setBot(function () {
    n++;
    return { move: [0, 0], fire: (n % 2) === 0, ads: false };
  });
  Z.Game.debug.sim(0.6);
  Z.Game.setBot(null);
});
await page.waitForTimeout(200);
await page.screenshot({ path: join(OUT, 'ev-10-firing.png') });

// --- damaged: blood overlay + low health -----------------------------------
// God mode stays ON: we want the low-health screen, not a player who gets
// finished off during the settle frames. Health is set after the sim so no
// regen or hit can walk it back before the shot lands.
await shot('ev-11-hurt.png', `
  G.debug.sim(0.4);
  G.player.health = 32;
  G.player.lastDamageTime = G.player.clock;
  G.player.damageDirs.push({ ang: 1.2, t: 1.1 });
`);

// --- bleeding out: the downed screen ---------------------------------------
// Drive the real down path so the post-pass desaturation and the bleedout
// timer are both genuine, then restore before anything else is captured.
await shot('ev-11b-downed.png', `
  Z.Player.goDown(G.player);
  G.player.bleedout = 21.4;
  G.debug.sim(0.9);
`);

// --- high round, fast zombies ----------------------------------------------
await shot('ev-12-round15.png', `
  G.debug.heal();
  G.debug.godMode(true);
  // goDown() strips solo players back to the starting pistol; a round-15 shot
  // should show a round-15 loadout.
  G.debug.giveWeapon('bar');
  G.debug.givePerk('juggernog');
  G.debug.setRound(15);
  G.debug.sim(30);
  G.debug.heal();
  let best = null, bestScore = -1;
  for (const z of Z.Zombies.list) {
    if (z.dying) continue;
    const d = Z.M.dist3(z.pos, G.player.pos);
    if (d < 4.5 || d > 16) continue;
    let n = 0;
    for (const o of Z.Zombies.list) { if (!o.dying && Z.M.dist3(o.pos, z.pos) < 6) n++; }
    const score = n - d * 0.08;
    if (score > bestScore) { bestScore = score; best = z; }
  }
  if (best) G.player.yaw = Math.atan2(-(best.pos[0] - G.player.pos[0]), -(best.pos[2] - G.player.pos[2]));
`);

// --- pause / game over -----------------------------------------------------
await page.evaluate(() => { window.__Z.Game.pause(); });
await page.waitForTimeout(500);
await page.screenshot({ path: join(OUT, 'ev-13-pause.png') });

await page.evaluate(() => {
  const Z = window.__Z;
  Z.Game.resume();
  Z.Game.gameOver();
});
// The stats reveal is staggered; capture it settled, not mid-animation.
await page.waitForTimeout(4200);
await page.screenshot({ path: join(OUT, 'ev-14-gameover.png') });

const stats = await page.evaluate(() => window.__Z.Game.debug.stats());
console.log(JSON.stringify(stats, null, 1));
console.log('\nERRORS (' + errors.length + '):\n' + (errors.slice(0, 8).join('\n') || '(none)'));
await browser.close();
process.exit(errors.length ? 2 : 0);
