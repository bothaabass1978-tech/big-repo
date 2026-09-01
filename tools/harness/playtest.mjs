// Headless bot playtest.
//
// Installs a competent-player bot into the running game and plays for N
// rounds, recording per-round telemetry. This is what tells us whether the
// BALANCE actually works — whether a decent player survives, whether points
// keep pace with prices, whether the horde is out-runnable.
//
//   node tools/harness/playtest.mjs [maxRounds] [--shots]
import { chromium } from 'playwright';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { ROOT } from './load.mjs';

const MAX_ROUNDS = Number(process.argv[2] || 15);
const WANT_SHOTS = process.argv.includes('--shots');
const GOD = process.argv.includes('--god');
const OUT = join(ROOT, 'production', 'qa', 'evidence');
mkdirSync(OUT, { recursive: true });

const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--no-sandbox', '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.stack || e.message).slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });

await page.goto('file://' + join(ROOT, 'nacht_der_untoten.html'));
await page.waitForTimeout(4000);

// ---------------------------------------------------------------------------
// The bot brain runs inside the page, once per fixed tick.
// ---------------------------------------------------------------------------
await page.evaluate((god) => {
  window.__GOD = god;
  const Z = window.__Z;
  const M = Z.M;
  Z.Game.startRun();
  if (window.__GOD) Z.Game.debug.godMode(true);

  const log = { rounds: [], events: [] };
  window.__LOG = log;

  let repathT = 0;
  let anchor = null;
  let tick = 0;   // semi-auto weapons need the trigger released between shots
  let botPath = null, botPathI = 0, botPathT = 0;

  Z.Game.setBot(function (p, dt) {
    tick++;
    const inp = { move: [0, 0], fire: false, ads: false, reload: false, use: false, usePress: false };
    if (p.dead) return inp;

    const w = Z.Player.weapon(p);
    const eye = Z.Player.eye(p, [0, 0, 0]);

    // --- pick a target: nearest live zombie with line of sight -------------
    let best = null, bestD = 1e9;
    for (const z of Z.Zombies.list) {
      if (z.dying) continue;
      const c = [z.pos[0], z.pos[1] + z.height * 0.82, z.pos[2]];
      const d = M.dist3(eye, c);
      if (d > 40 || d >= bestD) continue;
      if (!Z.Phys.losClear(eye, c)) continue;
      bestD = d; best = z;
    }

    // --- aim ---------------------------------------------------------------
    if (best) {
      const aimY = best.pos[1] + best.height * (bestD < 12 ? 0.85 : 0.60);
      const dx = best.pos[0] - eye[0], dy = aimY - eye[1], dz = best.pos[2] - eye[2];
      const flat = Math.hypot(dx, dz);
      // Aim angles are added to recoil before the view is built, so the bot
      // has to subtract the current recoil to actually point at anything.
      inp.aimYaw = Math.atan2(-dx, -dz) - Z.W.recoil.yaw;
      inp.aimPitch = Math.atan2(dy, flat) - Z.W.recoil.pitch;
      inp.ads = bestD > 6;
    }

    // --- shoot -------------------------------------------------------------
    // reload early when nothing is close, like a real player
    if (w.mag <= 0 || (w.mag < w.def.magSize * 0.3 && (!best || bestD > 9))) {
      inp.reload = w.reserve > 0;
    } else if (best && bestD < 34 && !w.reloading) {
      // aim tolerance: only pull the trigger when actually pointed at it
      const f = Z.Player.forward(p, [0, 0, 0]);
      const tx = best.pos[0] - eye[0], ty = (best.pos[1] + best.height * 0.7) - eye[1], tz = best.pos[2] - eye[2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      const dot = (f[0] * tx + f[1] * ty + f[2] * tz) / tl;
      const aimed = bestD < 3.0 ? dot > 0.90 : dot > 0.965;
      // Tap the trigger: a held trigger fires a semi-auto exactly once.
      inp.fire = aimed && (w.def.fireMode !== 'semi' || (tick & 1) === 0);
    }

    // nearest live zombie regardless of line of sight — this is the thing
    // that can actually hit us
    let threat = null, threatD = 1e9;
    for (const z of Z.Zombies.list) {
      if (z.dying) continue;
      const d = M.distXZ(p.pos, z.pos);
      if (d < threatD) { threatD = d; threat = z; }
    }

    // --- move: run a training circuit --------------------------------------
    // Nacht is played by kiting the horde around a loop, not by backpedalling
    // into a corner. The bot follows a circuit through the main hall and lets
    // the horde string out behind it, which is what the balance is tuned for.
    if (!window.__LOOP) {
      // Keep the circuit well clear of every wall. Waypoints tucked into
      // corners are how the bot walks itself into a dead end and dies to
      // round-2 shamblers, which tells us nothing about the game.
      const cand = [[-6.6, -4.8], [-6.6, 4.8], [-0.4, 4.8], [-0.4, -4.8]];
      window.__LOOP = cand.filter(function (c) {
        return !Z.Phys.boxSolid([c[0], 0.05, c[1]], 0.4, 1.7);
      });
      window.__LOOPI = 0;
    }
    const loop = window.__LOOP;
    if (loop.length) {
      const wp = loop[window.__LOOPI % loop.length];
      const wd = Math.hypot(wp[0] - p.pos[0], wp[1] - p.pos[2]);
      if (wd < 1.4) window.__LOOPI++;

      // Path to the waypoint so the bot goes around furniture, not into it.
      botPathT -= dt;
      if (botPathT <= 0 || !botPath || botPathI >= botPath.length) {
        botPathT = 0.7;
        const raw = Z.Nav.pathBetween(p.pos, [wp[0], p.pos[1], wp[1]], 3000);
        botPath = raw ? Z.Nav.smooth(raw, []) : null;
        botPathI = 0;
        if (botPath && botPath.length > 1) botPathI = 1;
      }
      let tx = wp[0], tz = wp[1];
      if (botPath && botPathI < botPath.length) {
        const nd = botPath[botPathI];
        if (Math.hypot(nd.x - p.pos[0], nd.z - p.pos[2]) < 0.7) botPathI++;
        if (botPathI < botPath.length) { tx = botPath[botPathI].x; tz = botPath[botPathI].z; }
      }
      let wx = tx - p.pos[0], wz = tz - p.pos[2];
      const wl = Math.hypot(wx, wz) || 1;
      wx /= wl; wz /= wl;

      // Shove directly away from anything that has closed to arm's length,
      // blended over the circuit heading.
      if (threat && threatD < 2.6) {
        const ax = (p.pos[0] - threat.pos[0]) / Math.max(threatD, 0.01);
        const az = (p.pos[2] - threat.pos[2]) / Math.max(threatD, 0.01);
        wx = wx * 0.35 + ax * 0.85;
        wz = wz * 0.35 + az * 0.85;
        const bl = Math.hypot(wx, wz) || 1;
        wx /= bl; wz /= bl;
      }

      // Choose a heading by scoring candidates rather than taking the first
      // one that isn't a wall. Backing into a corner is how a bot dies to
      // round-2 shamblers, and a corner death tells us nothing about balance.
      const clearance = function (dx2, dz2) {
        let open = 0;
        for (let s2 = 0.5; s2 <= 3.5; s2 += 0.5) {
          const q = [p.pos[0] + dx2 * s2, p.pos[1] + 0.15, p.pos[2] + dz2 * s2];
          if (Z.Phys.boxSolid(q, 0.38, 1.7)) break;
          if (Z.Phys.floorAt([q[0], q[1] + 0.4, q[2]], 1.0, 0.3) === null) break;
          open = s2;
        }
        return open;
      };
      const wantX = wx, wantZ = wz;
      let bestH = null, bestScore = -1e9;
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const cx2 = Math.sin(ang), cz2 = Math.cos(ang);
        const open = clearance(cx2, cz2);
        if (open < 1.0) continue;                 // no room that way
        // how well it matches where we wanted to go
        const align = cx2 * wantX + cz2 * wantZ;
        // how much it takes us away from the nearest threats
        let threatPen = 0;
        for (const z of Z.Zombies.list) {
          if (z.dying) continue;
          const zx = z.pos[0] - p.pos[0], zz = z.pos[2] - p.pos[2];
          const zd = Math.hypot(zx, zz);
          if (zd > 8) continue;
          const toward = (zx * cx2 + zz * cz2) / Math.max(zd, 0.01);
          threatPen += Math.max(0, toward) * (8 - zd) * 0.55;
        }
        // When something is close, getting out matters far more than staying
        // on the circuit — otherwise the bot politely walks into a corner.
        const pressed = threatD < 4.0 ? 1 : 0;
        const score = open * (pressed ? 3.4 : 1.15)
          + align * (pressed ? 0.8 : 2.6)
          - threatPen * (pressed ? 1.5 : 1.0);
        if (score > bestScore) { bestScore = score; bestH = [cx2, cz2]; }
      }
      if (bestH) { wx = bestH[0]; wz = bestH[1]; }

      const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
      inp.move[1] = -(wx * sy + wz * cy);
      inp.move[0] = (wx * cy - wz * sy);
      // Sprint needs a forward stick; if we're running away from where we're
      // looking we walk, exactly as a player would.
      inp.sprint = threatD < 7 && inp.move[1] > 0.5;
      // Stop aiming backwards at something far away while a closer one is on
      // top of us: face the direction of travel when nothing is near.
      if (!best || bestD > 14) {
        inp.aimYaw = Math.atan2(-wx, -wz) - Z.W.recoil.yaw;
        inp.aimPitch = -Z.W.recoil.pitch;
      }
    }

    // --- spend points ------------------------------------------------------
    const act = Z.Econ.findInteraction(p, eye, Z.Player.forward(p, [0, 0, 0]));
    if (act && act.kind === 'repair' && (!threat || threatD > 7)) {
      inp.use = true;
    } else if (act && act.cost && p.points >= act.cost + 150 && act.kind !== 'box') {
      inp.usePress = true;
    }
    return inp;
  });

  // Instrument every point of damage so a death can be explained rather
  // than guessed at.
  const origDamage = Z.Player.damage;
  Z.Player.damage = function (p, amount, fromPos, source) {
    const before = p.health;
    const r = origDamage.apply(this, arguments);
    if (r && amount > 0) {
      let near = 0, nearest = 99;
      for (const z of Z.Zombies.list) {
        if (z.dying) continue;
        const d = Z.M.distXZ(p.pos, z.pos);
        if (d < 3) near++;
        if (d < nearest) nearest = d;
      }
      log.events.push({
        t: +p.timeAlive.toFixed(1), round: Z.Rounds.round, source: source,
        amount: amount, hpBefore: Math.round(before), hpAfter: Math.round(p.health),
        pos: p.pos.map((v) => +v.toFixed(2)),
        vel: +Math.hypot(p.vel[0], p.vel[2]).toFixed(2),
        nearWithin3m: near, nearest: +nearest.toFixed(2),
        room: Z.Level.roomAt(p.pos),
      });
    }
    return r;
  };

  // Record a row every time a round ends.
  const prevRoundEnd = Z.Rounds.onRoundEnd;
  Z.Rounds.onRoundEnd = function (n) {
    const p = Z.Game.player;
    log.rounds.push({
      round: n,
      points: p.points,
      health: Math.round(p.health),
      maxHealth: Z.Player.effectiveMaxHealth(p),
      kills: p.kills,
      headshots: p.headshots,
      shots: p.shotsFired,
      hits: p.hits,
      accuracy: p.shotsFired ? +(p.hits / p.shotsFired).toFixed(3) : 0,
      downs: p.downs,
      weapon: Z.Player.weapon(p).id,
      reserve: Z.Player.weapon(p).reserve,
      perks: p.perkOrder.slice(),
      boards: Z.Level.level.windows.reduce((a, w) => a + w.boards, 0),
      maxBoards: Z.Level.level.windows.length * 6,
      timeAlive: +p.timeAlive.toFixed(1),
      roundSecs: +(p.timeAlive - (window.__LASTT || 0)).toFixed(1),
      zHealth: Z.B.roundHealth(n),
      zSpeed: +Z.B.zombieSpeed(n).toFixed(2),
      zCount: Z.B.roundZombieCount(n, 1),
    });
    window.__LASTT = p.timeAlive;
    if (prevRoundEnd) prevRoundEnd(n);
  };
}, GOD);

// ---------------------------------------------------------------------------
// Drive the simulation in chunks so we can poll progress.
// ---------------------------------------------------------------------------
let elapsed = 0;
const CHUNK = 5;             // simulated seconds per step
const LIMIT = 25 * 60;       // hard stop at 25 simulated minutes
let last = { round: 0 };
let stallT = 0, stallRound = 0, stallAlive = -1;
const WALL_LIMIT_MS = 8 * 60 * 1000;
const wallStart = Date.now();

while (elapsed < LIMIT) {
  const st = await page.evaluate((c) => {
    const Z = window.__Z;
    Z.Game.debug.sim(c);
    const p = Z.Game.player;
    return {
      round: Z.Rounds.round, phase: Z.Rounds.phase,
      alive: Z.Zombies.countAlive(), health: Math.round(p.health),
      points: p.points, kills: p.kills, dead: p.dead, downed: p.downed,
      weapon: Z.Player.weapon(p).id,
      rows: window.__LOG.rounds.length,
    };
  }, CHUNK);
  elapsed += CHUNK;
  if (st.round !== last.round) {
    process.stdout.write(`  round ${String(st.round).padStart(2)}  pts ${String(st.points).padStart(6)}  kills ${String(st.kills).padStart(4)}  hp ${String(st.health).padStart(3)}  ${st.weapon}\n`);
    last = st;
    if (WANT_SHOTS && st.round % 5 === 0) {
      await page.waitForTimeout(250);
      await page.screenshot({ path: join(OUT, 'playtest-r' + st.round + '.png') });
    }
  }
  if (st.dead) { console.log('\n  BOT DIED on round ' + st.round + ' after ' + elapsed + 's simulated'); break; }
  if (st.round > MAX_ROUNDS) { console.log('\n  reached round limit ' + MAX_ROUNDS); break; }

  // Stall guard: a round that neither advances nor loses zombies means
  // something cannot reach the player -- a real bug, not slow play.
  if (st.round === stallRound && st.alive === stallAlive) {
    stallT += CHUNK;
    if (stallT >= 90) {
      console.log('\n  STALLED on round ' + st.round + ': ' + st.alive
        + ' zombies alive and unchanged for 90 simulated seconds');
      const diag = await page.evaluate(() => {
        const Z = window.__Z;
        return Z.Zombies.list.filter((z) => !z.dying).slice(0, 8).map((z) => ({
          state: z.state, room: Z.Level.roomAt(z.pos),
          pos: z.pos.map((v) => +v.toFixed(1)),
          hasPath: !!z.path, pathLen: z.path ? z.path.length : 0,
          dist: +Z.M.dist3(z.pos, Z.Game.player.pos).toFixed(1),
          window: z.window ? z.window.id : null,
          boards: z.window ? z.window.boards : null,
        }));
      });
      console.log('  stuck zombies: ' + JSON.stringify(diag));
      break;
    }
  } else { stallT = 0; stallRound = st.round; stallAlive = st.alive; }

  if (Date.now() - wallStart > WALL_LIMIT_MS) {
    console.log('\n  wall-clock limit reached at round ' + st.round);
    break;
  }
}

const result = await page.evaluate(() => {
  const Z = window.__Z;
  const p = Z.Game.player;
  return {
    rounds: window.__LOG.rounds,
    events: window.__LOG.events,
    final: {
      round: Z.Rounds.round, kills: p.kills, headshots: p.headshots,
      accuracy: p.shotsFired ? +(p.hits / p.shotsFired).toFixed(3) : 0,
      downs: p.downs, dead: p.dead, points: p.points,
      timeAlive: +p.timeAlive.toFixed(1),
      roundSecs: +(p.timeAlive - (window.__LASTT || 0)).toFixed(1),
    },
    stats: Z.Game.debug.stats(),
  };
});

console.log('\n=== PER-ROUND ===');
console.log('rnd  pts     kills  acc    hp/max    boards  wpn              secs   zHP    zSpd  n');
for (const r of result.rounds) {
  console.log(
    String(r.round).padStart(3) + '  ' +
    String(r.points).padStart(6) + '  ' +
    String(r.kills).padStart(5) + '  ' +
    String(r.accuracy).padStart(5) + '  ' +
    (r.health + '/' + r.maxHealth).padStart(8) + '  ' +
    (r.boards + '/' + r.maxBoards).padStart(6) + '  ' +
    r.weapon.padEnd(15) + '  ' +
    String(r.roundSecs).padStart(5) + 's  ' +
    String(r.zHealth).padStart(5) + '  ' +
    String(r.zSpeed).padStart(4) + '  ' +
    String(r.zCount).padStart(3));
}
console.log('\n=== FINAL ===');
console.log(JSON.stringify(result.final, null, 1));
console.log('\n=== DAMAGE EVENTS ===');
for (const e of result.events.slice(0, 30)) {
  console.log('  t=' + String(e.t).padStart(6) + ' r' + e.round + ' ' + String(e.source).padEnd(9)
    + ' -' + String(e.amount).padStart(3) + ' hp ' + String(e.hpBefore).padStart(3) + '->' + String(e.hpAfter).padStart(3)
    + '  pos ' + JSON.stringify(e.pos).padEnd(24) + ' spd ' + String(e.vel).padStart(5)
    + ' near3m ' + e.nearWithin3m + ' nearest ' + e.nearest + ' ' + e.room);
}

console.log('\n=== ERRORS (' + errors.length + ') ===');
console.log(errors.slice(0, 10).join('\n') || '(none)');

writeFileSync(join(OUT, 'playtest.json'), JSON.stringify(result, null, 2));
await browser.close();
process.exit(errors.length ? 2 : 0);
