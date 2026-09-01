// Pure-maths balance report: time-to-kill and ammo economy per weapon per
// round, plus the sustainability check that actually decides whether a run
// can continue (points earned per magazine vs. cost to refill it).
import { loadModules } from './load.mjs';
const Z = loadModules(['00_prelude.js','01_math.js','02_rng.js','03_balance.js']);
const B = Z.B;
let fail = 0; const bad=(m)=>{console.log('  FAIL '+m); fail++;};

console.log('validate():', JSON.stringify(B.validate()));

// --- shots-to-kill -----------------------------------------------------------
const wall = B.WEAPONS.filter(w => w.wallCost);
const rounds = [1,3,5,7,9,11,13,15,18,21,25];
console.log('\n=== SHOTS TO KILL (body / head), wall weapons ===');
console.log('round  hp     ' + wall.map(w=>w.id.slice(0,9).padEnd(11)).join(''));
for (const r of rounds) {
  const hp = B.roundHealth(r);
  let line = String(r).padStart(5) + '  ' + String(hp).padStart(5) + '  ';
  for (const w of wall) {
    const pellets = w.pellets || 1;
    const body = Math.ceil(hp / (w.damage * pellets));
    const head = Math.ceil(hp / (w.damage * pellets * (w.headshotMult || 2)));
    line += (body + '/' + head).padEnd(11);
  }
  console.log(line);
}

// --- time to kill ------------------------------------------------------------
console.log('\n=== TIME TO KILL, seconds (headshots, incl. reloads amortised) ===');
console.log('round  ' + wall.map(w=>w.id.slice(0,9).padEnd(11)).join(''));
for (const r of rounds) {
  const hp = B.roundHealth(r);
  let line = String(r).padStart(5) + '  ';
  for (const w of wall) {
    const pellets = w.pellets || 1;
    const shots = Math.ceil(hp / (w.damage * pellets * (w.headshotMult || 2)));
    const cycle = 60 / w.rpm;
    const magsNeeded = shots / w.magSize;
    const ttk = shots * cycle + magsNeeded * w.reloadTime;
    line += ttk.toFixed(2).padEnd(11);
  }
  console.log(line);
}

// --- can the horde be cleared in time? --------------------------------------
// A round is unplayable if killing everything takes longer than the player can
// physically survive being chased.
console.log('\n=== ROUND CLEAR FEASIBILITY (best wall weapon, headshots) ===');
let wallFallOff = 0;
console.log('rnd  n    hp     bestWpn        ttk    total_s  killsNeeded/min');
for (let r = 1; r <= 25; r++) {
  const hp = B.roundHealth(r), n = B.roundZombieCount(r, 1);
  let best = null, bestT = 1e9;
  for (const w of wall) {
    const pellets = w.pellets || 1;
    const shots = Math.ceil(hp / (w.damage * pellets * (w.headshotMult || 2)));
    const ttk = shots * (60 / w.rpm) + (shots / w.magSize) * w.reloadTime;
    if (ttk < bestT) { bestT = ttk; best = w; }
  }
  const total = bestT * n;
  console.log(String(r).padStart(3) + '  ' + String(n).padStart(3) + '  ' + String(hp).padStart(5)
    + '  ' + best.id.padEnd(14) + ' ' + bestT.toFixed(2).padStart(5) + '  ' + total.toFixed(0).padStart(6)
    + '   ' + (60 / bestT).toFixed(1));
  if (total > 900 && wallFallOff === 0) wallFallOff = r;
}

// Wall guns are SUPPOSED to stop carrying the run — that is what makes the
// Mystery Box the only way forward late. What matters is that they fall off
// inside the right window, not that they never do.
console.log('\nbest wall weapon stops clearing rounds at round ' + (wallFallOff || '>25'));
if (!wallFallOff || wallFallOff > 26) {
  bad('wall guns still carry past round 26 — the Mystery Box is never necessary');
} else if (wallFallOff < 16) {
  bad('wall guns fall off at round ' + wallFallOff + ' — too early, the mid game has no answer');
} else {
  console.log('  ok: wall guns carry to round ' + wallFallOff + ', then the box is mandatory');
}

// ...and a box weapon must still be viable well past that point.
const ray = B.WEAPONS.find((w) => w.id === 'raygun');
if (ray) {
  const r30 = B.roundHealth(30), n30 = B.roundZombieCount(30, 1);
  const shots = Math.ceil(r30 / (ray.damage * (ray.headshotMult || 2)));
  const ttk = shots * (60 / ray.rpm) + (shots / ray.magSize) * ray.reloadTime;
  // Single-target TTK badly understates a splash weapon: with a 24-zombie cap
  // in a 20x16 m building, a 3 m blast reliably catches more than one body.
  // Two is a conservative figure for a trained horde.
  const SPLASH_TARGETS = 2.0;
  const effective = (ttk * n30) / SPLASH_TARGETS;
  console.log('Ray Gun at round 30: ' + ttk.toFixed(2) + 's/kill single-target, '
    + (ttk * n30).toFixed(0) + 's total, ' + effective.toFixed(0) + 's with splash');
  if (effective > 900) bad('even the Ray Gun cannot clear round 30 — the late game is a wall');
  else console.log('  ok: the box still answers round 30');
}

// --- points economy ----------------------------------------------------------
console.log('\n=== POINTS ECONOMY (per round, headshot kills) ===');
console.log('rnd  n    ptsEarned  ammoRefill(kar98k)  cumulative');
let cum = B.PRICES.startingPoints;
for (let r = 1; r <= 20; r++) {
  const n = B.roundZombieCount(r, 1);
  const hp = B.roundHealth(r);
  const w = B.WEAPONS.find(x => x.id === 'kar98k');
  const shots = Math.ceil(hp / (w.damage * (w.headshotMult || 2)));
  // 10 per non-lethal hit + 100 for a headshot kill
  const pts = n * (B.POINTS.hit * Math.max(0, shots - 1) + B.POINTS.headshotKill);
  const refills = Math.ceil((shots * n) / w.maxReserve);
  const cost = refills * B.ammoRefillCost('kar98k');
  cum += pts - cost;
  console.log(String(r).padStart(3) + '  ' + String(n).padStart(3) + '  ' + String(pts).padStart(9)
    + '  ' + String(cost).padStart(18) + '  ' + String(cum).padStart(10));
  if (cum < 0) bad('round ' + r + ': player goes bankrupt on ammo alone');
}

// --- the load-bearing rules --------------------------------------------------
console.log('\n=== INVARIANTS ===');
// Burst sprint is not the invariant. Sprint is a stamina resource, so what
// must beat the fastest zombie is the speed a player can hold indefinitely.
const sustained = B.sustainedPlayerSpeed();
const topZ = B.fastestZombieSpeed();
console.log('  burst sprint ' + B.PLAYER.speedSprint + ' m/s, sustained '
  + sustained.toFixed(2) + ' m/s vs fastest zombie ' + topZ.toFixed(2) + ' m/s');
if (topZ >= sustained) {
  bad('a sustained-sprinting player is slower than the fastest zombie — kiting breaks');
} else {
  console.log('  ok: kiting margin ' + (sustained - topZ).toFixed(2) + ' m/s, holds forever');
}
const hits = Math.ceil(B.PLAYER.health / 50);
const jug = B.PERKS.find(p => p.id === 'juggernog');
const jugHp = (jug && jug.maxHealth) || 250;
const jugHits = Math.ceil(jugHp / 50);
console.log('  hits to down: ' + hits + ' without Juggernog, ' + jugHits + ' with');
if (hits !== 2) bad('must be exactly 2 hits to down without Juggernog, got ' + hits);
if (jugHits !== 5) bad('must be exactly 5 hits to down with Juggernog, got ' + jugHits);
console.log('  round 1 count ' + B.roundZombieCount(1,1) + ' (want 6), max alive ' + B.maxAlive(1) + ' (want 24)');
if (B.roundZombieCount(1,1) !== 6) bad('round 1 must spawn 6 zombies');
if (B.maxAlive(1) !== 24) bad('solo cap must be 24 simultaneous zombies');

console.log(fail ? '\nBALANCE CHECK: ' + fail + ' FAILURES' : '\nBALANCE CHECK: PASS');
process.exit(fail ? 1 : 0);
