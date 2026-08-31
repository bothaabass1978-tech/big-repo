// Headless structural validation of the Nacht der Untoten level.
//
// Connectivity is tested by actually simulating Z.Phys.move() with a
// player-sized body rather than by a naive grid flood fill — a 0.34 m radius
// body always overlaps the next riser on a staircase, so a purely geometric
// test reports every staircase in the game as impassable.
import { loadModules } from './load.mjs';

const Z = loadModules(['00_prelude.js', '01_math.js', '02_rng.js', '08_mesh.js',
  '09_level.js', '11_phys.js']);

const lv = Z.Level.build();
let fail = 0;
const bad = (m) => { console.log('  FAIL ' + m); fail++; };

console.log('level stats:', JSON.stringify(Z.Level.stats()));
console.log('clutter:', JSON.stringify(Z.Level._clutterStats));

// ---- geometry sanity -------------------------------------------------------
for (const b of lv.brushes) {
  for (let k = 0; k < 3; k++) {
    if (!isFinite(b.min[k]) || !isFinite(b.max[k])) { bad('non-finite brush ' + b.mat); break; }
    if (b.max[k] - b.min[k] <= 0) { bad('degenerate brush ' + b.mat + ' ' + JSON.stringify(b.min)); break; }
  }
}

Z.Phys.setLevel(lv);
const R = 0.34, H = 1.8;
for (const w of lv.windows) {
  if (Z.Phys.boxSolid([w.inPos[0], w.floorY + 0.05, w.inPos[2]], R, H)) bad('window ' + w.id + ' inPos blocked');
  if (Z.Phys.boxSolid([w.out[0], w.floorY + 0.05, w.out[2]], R, H)) bad('window ' + w.id + ' out blocked');
  if (Z.Phys.boxSolid([w.repairFrom[0], w.floorY + 0.05, w.repairFrom[2]], R, H)) bad('window ' + w.id + ' repairFrom blocked');
  if (w.boardSlots.length !== 6) bad('window ' + w.id + ' has ' + w.boardSlots.length + ' board slots');
}
for (const b of lv.buys) {
  if (b.use && Z.Phys.boxSolid([b.use[0], b.use[1] + 0.05, b.use[2]], R, H)) bad('buy ' + b.id + ' use point blocked');
}
for (const p of lv.perkSpots) {
  if (Z.Phys.boxSolid([p.pos[0], p.pos[1] + 0.05, p.pos[2]], 0.2, 1.0)) bad('perk ' + p.id + ' spot blocked');
}
const ps = lv.playerStart.pos;
if (Z.Phys.boxSolid([ps[0], ps[1] + 0.05, ps[2]], R, H)) bad('player start blocked');

// ---- simulation-driven connectivity ---------------------------------------
const CELL = 0.5;
const DT = 1 / 120;
const GRAV = Z.C.GRAVITY;

function simWalk(from, dir, dist, speed) {
  const ent = {
    pos: [from[0], from[1], from[2]], vel: [0, 0, 0],
    radius: R, height: H, onGround: true, stepUp: Z.C.STEP_UP,
  };
  const ticks = Math.ceil(dist / speed / DT);
  for (let i = 0; i < ticks; i++) {
    ent.vel[0] = dir[0] * speed;
    ent.vel[2] = dir[2] * speed;
    ent.vel[1] -= GRAV * DT;
    Z.Phys.move(ent, DT);
    if (ent.onGround && ent.vel[1] < 0) ent.vel[1] = 0;
  }
  // let it settle onto whatever it ended up above
  for (let i = 0; i < 90; i++) {
    ent.vel[0] = 0; ent.vel[2] = 0;
    ent.vel[1] -= GRAV * DT;
    Z.Phys.move(ent, DT);
    if (ent.onGround && ent.vel[1] < 0) ent.vel[1] = 0;
  }
  return ent;
}

const key = (p) => Math.round(p[0] / CELL) + ',' + Math.round(p[1]) + ',' + Math.round(p[2] / CELL);
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

function flood(start, budget) {
  const seen = new Map();
  const q = [start];
  seen.set(key(start), start);
  let n = 0;
  while (q.length && n < (budget || 6000)) {
    const p = q.shift(); n++;
    for (const d of DIRS) {
      const e = simWalk(p, d, CELL, 3.2);
      const moved = Math.hypot(e.pos[0] - p[0], e.pos[2] - p[2]);
      if (moved < CELL * 0.55) continue;         // ran into a wall
      if (e.pos[1] < -3) continue;               // fell out of the world
      const np = [e.pos[0], e.pos[1], e.pos[2]];
      const k = key(np);
      if (seen.has(k)) continue;
      seen.set(k, np);
      q.push(np);
    }
  }
  return seen;
}

function near(seen, p, tol) {
  tol = tol === undefined ? 1.2 : tol;
  for (const q of seen.values()) {
    if (Math.abs(q[1] - p[1]) > 1.0) continue;
    if (Math.hypot(q[0] - p[0], q[2] - p[2]) <= tol) return true;
  }
  return false;
}

const t0 = Date.now();
let reach = flood([ps[0], 0, ps[2]]);
console.log('reachable nodes before debris:', reach.size, '(' + (Date.now() - t0) + 'ms)');

const UPY = Z.Level.DIMS.UP;
if (near(reach, [-6, UPY, -5])) bad('HELP room reachable BEFORE clearing debris');
else console.log('  ok: upstairs gated behind debris');
if (near(reach, [7, UPY, -4])) bad('east upper reachable BEFORE clearing debris');
else console.log('  ok: east upper gated behind debris');

// every ground-floor window and buy must be reachable from spawn immediately
for (const w of lv.windows) {
  if (w.floorY !== 0) continue;
  if (!near(reach, w.repairFrom)) bad('ground window ' + w.id + ' repairFrom unreachable at start');
}
for (const b of lv.buys) {
  if (!b.use || b.use[1] !== 0) continue;
  if (!near(reach, b.use)) bad('ground buy ' + b.id + ' unreachable at start');
}

Z.Level.removeDebris('stairs_west');
Z.Level.removeDebris('stairs_east');
Z.Phys.setLevel(lv);
reach = flood([ps[0], 0, ps[2]], 12000);
console.log('reachable nodes after debris:', reach.size);

if (!near(reach, [-6, UPY, -5])) bad('HELP room NOT reachable after clearing west debris');
else console.log('  ok: HELP room reachable');
if (!near(reach, [7, UPY, -4])) bad('east upper NOT reachable after clearing east debris');
else console.log('  ok: east upper reachable');
if (!near(reach, [-6, UPY, 2])) bad('catwalk NOT reachable');
else console.log('  ok: catwalk reachable');

for (const w of lv.windows) if (!near(reach, w.repairFrom)) bad('window ' + w.id + ' repairFrom unreachable');
for (const b of lv.buys) if (b.use && !near(reach, b.use)) bad('buy ' + b.id + ' unreachable');
for (const p of lv.perkSpots) if (!near(reach, p.pos, 2.0)) bad('perk ' + p.id + ' unreachable');
for (const s of lv.boxSpots) if (!near(reach, s.pos, 2.0)) bad('box spot unreachable ' + JSON.stringify(s.pos));

// ---- zombies must be able to reach every window from outside ---------------
for (const sz of lv.spawnZones) {
  if (Z.Phys.boxSolid([sz.pos[0], sz.pos[1] + 0.05, sz.pos[2]], 0.32, 1.8)) {
    bad('spawn zone for window ' + sz.windowId + ' is inside geometry');
  }
}

// ---- training loops: is there a cycle you can run forever? -----------------
// Ground loop: main hall -> north door -> east rooms -> south door -> back.
function pathExists(a, b) {
  const s = flood(a, 9000);
  return near(s, b, 1.2);
}
const loopA = pathExists([-5.5, 0, 3.0], [6.0, 0, -5.0]);
const loopB = pathExists([6.0, 0, 5.0], [-5.5, 0, 3.0]);
if (!(loopA && loopB)) bad('ground-floor training loop is broken');
else console.log('  ok: ground-floor training loop verified (both directions)');

console.log(fail ? '\nLEVEL CHECK: ' + fail + ' FAILURES' : '\nLEVEL CHECK: PASS');
process.exit(fail ? 1 : 0);
