// ---------------------------------------------------------------------------
// 17_zombie.js — zombie entities, state machine, damage model, rendering.
//
// The behaviour loop is the one from the original: spawn out in the dark,
// walk to your assigned window, tear the boards off one at a time, climb
// through, then walk at the player forever. Speed and health come from the
// round; everything else is constant. The design relies on the horde being
// predictable — a player must be able to read a group and out-walk it, which
// is why the top speed is capped just under the player's sprint.
// ---------------------------------------------------------------------------
(function () {
  const S = {};
  Z.Zombies = S;
  const M = Z.M;
  const rng = Z.RNG.make(0x2B1E5);

  const R = 0.34;            // collision radius
  const H = 1.82;            // standing height
  const CRAWL_H = 0.70;

  // Hitbox geometry, as fractions of height.
  const HEAD_Y = 0.855, HEAD_R = 0.175;
  const TORSO_Y0 = 0.42, TORSO_Y1 = 0.80, TORSO_R = 0.28;

  S.list = [];
  S.aliveCount = 0;
  let idCounter = 0;
  let player = null;
  let level = null;

  S.init = function (lv, plr) {
    level = lv;
    player = plr;
    S.list.length = 0;
    S.aliveCount = 0;
    idCounter = 0;
    rng.reseed(0x2B1E5);
    return S;
  };
  S.setPlayer = function (p) { player = p; };

  // -------------------------------------------------------------------------
  // Spawning
  // -------------------------------------------------------------------------
  S.spawn = function (opts) {
    opts = opts || {};
    const round = opts.round || 1;
    const win = opts.window;
    const zone = opts.zone;

    const spread = M.lerp(Z.B.zombieSpeedSpread.min, Z.B.zombieSpeedSpread.max, rng.f());
    const hp = Z.B.roundHealth(round);
    const z = {
      id: ++idCounter,
      pos: zone ? [zone.pos[0], zone.pos[1], zone.pos[2]] : [win.out[0], win.out[1], win.out[2]],
      vel: [0, 0, 0],
      radius: R, height: H, stepUp: 0.46, onGround: false,

      health: hp, maxHealth: hp,
      speed: Z.B.zombieSpeed(round) * spread,
      baseSpeed: Z.B.zombieSpeed(round) * spread,
      round,

      yaw: 0, targetYaw: 0,
      state: 'approach',
      stateT: 0,
      window: win || null,
      variant: rng.i(4),
      seed: rng.f() * 1000,
      helmet: rng.bool(0.35),

      crawler: false,
      limbsMissing: { armL: false, armR: false, legL: false, legR: false, head: false },

      path: null, pathI: 0, repathT: rng.range(0, 0.5),
      goal: null,
      stuckT: 0, lastPos: [0, 0, 0],

      anim: 'shamble', animT: rng.f() * 2,
      attackPhase: 0, attackCooldown: 0, hasHitThisSwing: false,
      stagger: 0,
      moanT: rng.range(0.5, 4),
      stepT: 0,

      dying: false, deathT: 0, deathAnim: 'death_fall_forward',
      dead: false,
      boardsTornT: 0,
      climbT: 0, climbFrom: null, climbTo: null,
      spawnFade: 0.35,
    };
    z.lastPos[0] = z.pos[0]; z.lastPos[1] = z.pos[1]; z.lastPos[2] = z.pos[2];
    // drop onto the ground
    const f = Z.Phys.floorAt([z.pos[0], z.pos[1] + 1.0, z.pos[2]], 4, R);
    if (f !== null) z.pos[1] = f + 0.01;
    S.list.push(z);
    S.aliveCount++;
    if (Z.Audio && Z.Audio.ready) {
      Z.Audio.play('zom_spawn_crawl', { pos: z.pos, vol: 0.4 });
    }
    return z;
  };

  // -------------------------------------------------------------------------
  // Damage
  // -------------------------------------------------------------------------
  // info: { zone:'head'|'torso'|'limb', dir:[3], point:[3], source, weapon }
  S.damage = function (z, amount, info) {
    if (!z || z.dying || z.dead) return { killed: false };
    info = info || {};
    const before = z.health;
    let dmg = amount;
    if (S.instaKill && info.source !== 'fall') dmg = 1e9;
    z.health -= dmg;

    if (info.zone !== 'head') z.stagger = Math.min(0.35, z.stagger + 0.12);

    if (Z.Audio && Z.Audio.ready && info.point) {
      Z.Audio.play(info.zone === 'head' ? 'zom_hit_head' : 'zom_hit_flesh',
        { pos: info.point, vol: 0.75, rate: rng.range(0.92, 1.08) });
    }

    if (z.health > 0) {
      // Explosives that don't kill can take the legs off — the classic crawler.
      if (info.source === 'explosive' && !z.crawler && before - z.health > z.maxHealth * 0.35) {
        if (rng.bool(0.55)) S.makeCrawler(z, info.point || z.pos);
      }
      return { killed: false, damage: dmg };
    }

    // --- killed ------------------------------------------------------------
    const headshot = info.zone === 'head';
    const gib = info.source === 'explosive' || dmg > z.maxHealth * 3.5;
    S.kill(z, {
      headshot, gib, dir: info.dir || [0, 0, 1], point: info.point || z.pos,
      source: info.source || 'bullet',
    });
    return { killed: true, headshot, gib, damage: dmg };
  };

  S.makeCrawler = function (z, at) {
    z.crawler = true;
    z.limbsMissing.legL = true;
    z.limbsMissing.legR = true;
    z.height = CRAWL_H;
    z.anim = 'crawler';
    z.speed = z.baseSpeed * 0.72;
    Z.FX.gib(at || z.pos, 0.7);
    if (Z.Audio && Z.Audio.ready) Z.Audio.play('zom_gib', { pos: z.pos, vol: 0.8 });
  };

  S.kill = function (z, info) {
    if (z.dying || z.dead) return;
    info = info || {};
    z.dying = true;
    z.deathT = 0;
    z.health = 0;
    S.aliveCount--;

    if (info.gib) {
      z.deathAnim = 'death_gib';
      Z.FX.gib(bodyCenter(z), 1.0);
      if (Z.Audio && Z.Audio.ready) Z.Audio.play('zom_gib', { pos: z.pos, vol: 1.0 });
      z.gibbed = true;
    } else if (info.headshot) {
      z.deathAnim = 'death_headshot';
      z.limbsMissing.head = true;
      Z.FX.blood([z.pos[0], z.pos[1] + z.height * HEAD_Y, z.pos[2]], info.dir || [0, 1, 0], 2.2, true);
      if (Z.Audio && Z.Audio.ready) Z.Audio.play('zom_death_' + (1 + rng.i(4)), { pos: z.pos, vol: 0.9 });
    } else {
      const d = info.dir || [0, 0, 1];
      const facing = M.fromAngles([0, 0, 0], z.yaw, 0);
      z.deathAnim = (d[0] * facing[0] + d[2] * facing[2]) > 0 ? 'death_fall_forward' : 'death_fall_back';
      if (Z.Audio && Z.Audio.ready) Z.Audio.play('zom_death_' + (1 + rng.i(4)), { pos: z.pos, vol: 0.85 });
    }

    // Release the window it was working on.
    if (z.window && z.window.tearer === z) z.window.tearer = null;

    if (S.onKill) S.onKill(z, info);
  };

  // Explosive area damage.
  S.splash = function (point, radius, damage, exclude) {
    let hits = 0;
    for (const z of S.list) {
      if (z.dying || z.dead || z === exclude) continue;
      const c = bodyCenter(z);
      const d = M.dist3(point, c);
      if (d > radius) continue;
      // Line of sight so blasts don't reach through walls.
      if (!Z.Phys.losClear(point, c)) continue;
      const falloff = 1 - (d / radius);
      S.damage(z, damage * falloff * falloff, {
        zone: 'torso', source: 'explosive',
        dir: M.norm3([0, 0, 0], [c[0] - point[0], c[1] - point[1], c[2] - point[2]]),
        point: c,
      });
      hits++;
    }
    return hits;
  };

  // Kill everything currently alive (Nuke power-up).
  S.killAll = function (source) {
    let n = 0;
    for (const z of S.list) {
      if (z.dying || z.dead) continue;
      S.kill(z, { gib: false, source: source || 'nuke', dir: [0, 0, 1] });
      n++;
    }
    return n;
  };

  function bodyCenter(z) {
    return [z.pos[0], z.pos[1] + z.height * 0.55, z.pos[2]];
  }
  S.bodyCenter = bodyCenter;

  // -------------------------------------------------------------------------
  // Hit detection — head sphere over a torso/limb capsule
  // -------------------------------------------------------------------------
  const hitOut = { zombie: null, t: 0, point: [0, 0, 0], zone: 'torso' };

  S.rayHit = function (origin, dir, maxDist, ignore) {
    let best = null, bestT = maxDist;
    for (const z of S.list) {
      if (z.dying || z.dead) continue;
      if (ignore && ignore.indexOf(z) !== -1) continue;
      // quick reject on the bounding capsule
      const tBody = Z.Phys.rayCapsule(origin, dir, z.pos, z.radius + 0.06, z.height, bestT);
      if (tBody < 0) continue;

      let zone = 'torso';
      let t = tBody;
      if (!z.crawler && !z.limbsMissing.head) {
        const hy = z.pos[1] + z.height * HEAD_Y;
        const tHead = raySphere(origin, dir, z.pos[0], hy, z.pos[2], HEAD_R, bestT);
        if (tHead >= 0 && tHead <= tBody + 0.35) { zone = 'head'; t = tHead; }
      }
      if (zone === 'torso') {
        // anything outside the torso band counts as a limb (reduced damage)
        const hitY = origin[1] + dir[1] * t - z.pos[1];
        const frac = hitY / z.height;
        if (frac < TORSO_Y0 || frac > TORSO_Y1) zone = 'limb';
      }
      if (t < bestT) {
        bestT = t; best = z;
        hitOut.zone = zone;
      }
    }
    if (!best) return null;
    hitOut.zombie = best;
    hitOut.t = bestT;
    hitOut.point[0] = origin[0] + dir[0] * bestT;
    hitOut.point[1] = origin[1] + dir[1] * bestT;
    hitOut.point[2] = origin[2] + dir[2] * bestT;
    return hitOut;
  };

  function raySphere(o, d, cx, cy, cz, r, maxT) {
    const ox = o[0] - cx, oy = o[1] - cy, oz = o[2] - cz;
    const b = 2 * (ox * d[0] + oy * d[1] + oz * d[2]);
    const c = ox * ox + oy * oy + oz * oz - r * r;
    const disc = b * b - 4 * c;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    let t = (-b - sq) * 0.5;
    if (t < 0) t = (-b + sq) * 0.5;
    if (t < 0 || t > maxT) return -1;
    return t;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------
  const tmpA = [0, 0, 0], tmpB = [0, 0, 0];

  S.update = function (dt, ctx) {
    const B = Z.B.PLAYER;
    const playerPos = player ? player.pos : [0, 0, 0];
    const paused = ctx && ctx.paused;

    for (let i = S.list.length - 1; i >= 0; i--) {
      const z = S.list[i];

      if (z.dying) {
        z.deathT += dt;
        // let the body fall for a moment, then fade it out
        z.vel[1] -= Z.C.GRAVITY * dt;
        z.vel[0] *= Math.exp(-6 * dt);
        z.vel[2] *= Math.exp(-6 * dt);
        Z.Phys.move(z, dt);
        if (z.deathT > (z.gibbed ? 0.35 : 3.6)) {
          S.list.splice(i, 1);
        }
        continue;
      }
      if (paused) continue;

      z.stateT += dt;
      z.spawnFade = Math.max(0, z.spawnFade - dt);
      if (z.stagger > 0) z.stagger = Math.max(0, z.stagger - dt * 1.6);
      if (z.attackCooldown > 0) z.attackCooldown = Math.max(0, z.attackCooldown - dt);

      switch (z.state) {
        case 'approach': updateApproach(z, dt); break;
        case 'queue': updateQueue(z, dt); break;
        case 'tear': updateTear(z, dt); break;
        case 'climb': updateClimb(z, dt); break;
        case 'hunt': updateHunt(z, dt, playerPos); break;
        case 'attack': updateAttack(z, dt, playerPos); break;
        default: z.state = 'hunt'; break;
      }

      // moans
      z.moanT -= dt;
      if (z.moanT <= 0) {
        z.moanT = rng.range(2.6, 7.5);
        if (Z.Audio && Z.Audio.ready) {
          const close = M.dist3(z.pos, playerPos) < 9;
          const aggressive = z.speed > 3.0 && close;
          Z.Audio.play(aggressive ? ('zom_scream_' + (1 + rng.i(4))) : ('zom_moan_' + (1 + rng.i(6))),
            { pos: z.pos, vol: aggressive ? 0.8 : 0.55, rate: rng.range(0.86, 1.12) });
        }
      }

      // footsteps
      const hspd = Math.hypot(z.vel[0], z.vel[2]);
      if (hspd > 0.35 && z.onGround) {
        z.stepT -= dt * (0.8 + hspd * 0.45);
        if (z.stepT <= 0) {
          z.stepT = 1;
          if (Z.Audio && Z.Audio.ready && M.dist3(z.pos, playerPos) < 16) {
            Z.Audio.play('zom_step', { pos: z.pos, vol: 0.3, rate: rng.range(0.85, 1.15) });
          }
        }
      }

      z.animT += dt;
      z.yaw = M.angDamp(z.yaw, z.targetYaw, 9, dt);
    }

    // Keep the horde from collapsing into a single point.
    separate(dt);
  };

  function separate() {
    const n = S.list.length;
    for (let i = 0; i < n; i++) {
      const a = S.list[i];
      if (a.dying) continue;
      for (let j = i + 1; j < n; j++) {
        const b = S.list[j];
        if (b.dying) continue;
        if (Math.abs(a.pos[1] - b.pos[1]) > 1.4) continue;
        Z.Phys.separate(a, b, 0.55);
      }
    }
  }

  // --- movement helper -------------------------------------------------------
  function steerTo(z, target, dt, speedScale) {
    const dx = target[0] - z.pos[0];
    const dz = target[2] - z.pos[2];
    const d = Math.hypot(dx, dz);
    let sp = z.speed * (speedScale === undefined ? 1 : speedScale);
    if (z.stagger > 0) sp *= 1 - z.stagger * 0.55;
    if (d > 0.001) {
      z.targetYaw = Math.atan2(-dx, -dz);
      const nx = dx / d, nz = dz / d;
      // accelerate toward the desired velocity rather than snapping to it
      const wantX = nx * sp, wantZ = nz * sp;
      const k = 1 - Math.exp(-11 * dt);
      z.vel[0] += (wantX - z.vel[0]) * k;
      z.vel[2] += (wantZ - z.vel[2]) * k;
    } else {
      z.vel[0] *= Math.exp(-8 * dt);
      z.vel[2] *= Math.exp(-8 * dt);
    }
    z.vel[1] -= Z.C.GRAVITY * dt;
    Z.Phys.move(z, dt);
    return d;
  }

  function repath(z, goal) {
    const path = Z.Nav.pathBetween(z.pos, goal, 2600);
    if (path) {
      z.path = Z.Nav.smooth(path, []);
      z.pathI = 0;
      // skip the first node if we're basically standing on it
      if (z.path.length > 1 && M.distXZ(z.pos, [z.path[0].x, 0, z.path[0].z]) < 0.45) z.pathI = 1;
    } else {
      z.path = null;
    }
    z.goal = [goal[0], goal[1], goal[2]];
  }

  // Follow the current path; returns distance remaining to the final goal.
  function followPath(z, goal, dt, speedScale) {
    z.repathT -= dt;
    const goalMoved = !z.goal || M.dist3sq(z.goal, goal) > 2.2;
    if (z.repathT <= 0 || goalMoved || !z.path) {
      repath(z, goal);
      z.repathT = rng.range(0.55, 1.05);
    }
    if (!z.path || z.pathI >= z.path.length) {
      return steerTo(z, goal, dt, speedScale);
    }
    const node = z.path[z.pathI];
    tmpA[0] = node.x; tmpA[1] = node.y; tmpA[2] = node.z;
    const d = M.distXZ(z.pos, tmpA);
    if (d < 0.42 && Math.abs(z.pos[1] - node.y) < 1.2) {
      z.pathI++;
      if (z.pathI >= z.path.length) return steerTo(z, goal, dt, speedScale);
    }
    steerTo(z, tmpA, dt, speedScale);

    // stuck detection: if we've barely moved while trying to, force a repath
    const moved = M.distXZ(z.pos, z.lastPos);
    if (moved < 0.02) {
      z.stuckT += dt;
      if (z.stuckT > 0.75) {
        z.stuckT = 0;
        z.repathT = 0;
        // nudge sideways to break symmetric deadlocks
        z.vel[0] += rng.sym(1.6);
        z.vel[2] += rng.sym(1.6);
      }
    } else {
      z.stuckT = 0;
    }
    z.lastPos[0] = z.pos[0]; z.lastPos[1] = z.pos[1]; z.lastPos[2] = z.pos[2];
    return M.distXZ(z.pos, goal);
  }

  // --- states ---------------------------------------------------------------
  function updateApproach(z, dt) {
    const w = z.window;
    if (!w) { z.state = 'hunt'; return; }
    z.anim = animForSpeed(z);
    const d = followPath(z, w.out, dt, 1);
    if (d < 1.0) {
      z.state = w.boards > 0 ? 'queue' : 'climb';
      z.stateT = 0;
      if (z.state === 'climb') beginClimb(z);
    }
  }

  function updateQueue(z, dt) {
    const w = z.window;
    if (!w) { z.state = 'hunt'; return; }
    if (w.boards <= 0) { beginClimb(z); return; }
    // One zombie works the barricade at a time; the rest crowd behind it.
    if (!w.tearer || w.tearer.dead || w.tearer.dying) w.tearer = z;
    if (w.tearer === z) {
      z.state = 'tear';
      z.stateT = 0;
      z.boardsTornT = tearTime(z);
      z.anim = 'tear_board';
      return;
    }
    // shuffle in place near the window
    const jitter = [
      w.out[0] + Math.sin(z.seed + z.stateT * 0.6) * 0.9,
      w.out[1],
      w.out[2] + Math.cos(z.seed * 1.7 + z.stateT * 0.5) * 0.9,
    ];
    z.anim = 'shamble';
    steerTo(z, jitter, dt, 0.35);
    faceTowards(z, w.pos);
  }

  function tearTime(z) {
    return Z.B.boardTearTime ? Z.B.boardTearTime(z.round)
      : M.lerp(Z.B.BARRICADE.tearTimePerBoardBase, Z.B.BARRICADE.tearTimePerBoardMin,
        M.clamp01((z.round - 1) / (Z.B.BARRICADE.tearTimeRoundsToMin - 1)));
  }

  function updateTear(z, dt) {
    const w = z.window;
    if (!w) { z.state = 'hunt'; return; }
    if (w.boards <= 0) { beginClimb(z); return; }
    if (w.tearer !== z) { z.state = 'queue'; return; }
    z.anim = 'tear_board';
    faceTowards(z, w.pos);
    // hold position at the window
    steerTo(z, w.out, dt, 0.25);
    z.boardsTornT -= dt;
    if (z.boardsTornT <= 0) {
      w.boards = Math.max(0, w.boards - 1);
      z.boardsTornT = tearTime(z);
      const at = w.boardSlots[w.boards] ? w.boardSlots[w.boards].pos : w.pos;
      Z.FX.splinters(at, w.normal, 9);
      if (Z.Audio && Z.Audio.ready) {
        Z.Audio.play('zom_board_pull_' + (1 + rng.i(3)), { pos: at, vol: 1.0, rate: rng.range(0.9, 1.1) });
      }
      if (S.onBoardTorn) S.onBoardTorn(w, z);
      if (w.boards <= 0) { w.tearer = null; beginClimb(z); }
    }
  }

  function beginClimb(z) {
    const w = z.window;
    z.state = 'climb';
    z.stateT = 0;
    z.anim = 'climb';
    z.climbT = 0;
    z.climbFrom = [z.pos[0], z.pos[1], z.pos[2]];
    z.climbTo = [w.inPos[0], w.floorY + 0.01, w.inPos[2]];
    z.climbApex = [
      (z.climbFrom[0] + z.climbTo[0]) * 0.5,
      Math.max(z.climbFrom[1], z.climbTo[1]) + (w.floorY > 0.5 ? w.floorY * 0.55 + 0.9 : 1.05),
      (z.climbFrom[2] + z.climbTo[2]) * 0.5,
    ];
    // Upstairs windows take longer: they're scaling a wall, not stepping over.
    z.climbDur = w.floorY > 0.5 ? 2.6 : 1.45;
    if (w.tearer === z) w.tearer = null;
    if (Z.Audio && Z.Audio.ready) Z.Audio.play('zom_spawn_crawl', { pos: z.pos, vol: 0.7 });
  }

  function updateClimb(z, dt) {
    z.climbT += dt;
    const t = M.clamp01(z.climbT / z.climbDur);
    // quadratic bezier through the apex so they visibly haul themselves up
    const it = 1 - t;
    const a = z.climbFrom, b = z.climbApex, c = z.climbTo;
    z.pos[0] = it * it * a[0] + 2 * it * t * b[0] + t * t * c[0];
    z.pos[1] = it * it * a[1] + 2 * it * t * b[1] + t * t * c[1];
    z.pos[2] = it * it * a[2] + 2 * it * t * b[2] + t * t * c[2];
    z.vel[0] = z.vel[1] = z.vel[2] = 0;
    faceTowards(z, [c[0] + (c[0] - a[0]), c[1], c[2] + (c[2] - a[2])]);
    if (t >= 1) {
      z.state = 'hunt';
      z.stateT = 0;
      z.window = null;
      z.onGround = true;
      z.repathT = 0;
    }
  }

  function updateHunt(z, dt, playerPos) {
    z.anim = z.crawler ? 'crawler' : animForSpeed(z);
    const dist = followPath(z, playerPos, dt, 1);
    const reach = Z.B.PLAYER.meleeRange * 0.8;
    if (dist < reach && Math.abs(z.pos[1] - playerPos[1]) < 1.6 && z.attackCooldown <= 0) {
      z.state = 'attack';
      z.stateT = 0;
      z.attackPhase = 0;
      z.hasHitThisSwing = false;
      z.anim = 'attack';
    }
  }

  const ATTACK_WINDUP = 0.42;   // telegraph — the player must be able to react
  const ATTACK_STRIKE = 0.13;
  const ATTACK_RECOVER = 0.40;
  const ATTACK_TOTAL = ATTACK_WINDUP + ATTACK_STRIKE + ATTACK_RECOVER;

  function updateAttack(z, dt, playerPos) {
    z.anim = 'attack';
    z.attackPhase = M.clamp01(z.stateT / ATTACK_TOTAL);
    faceTowards(z, playerPos);
    // creep forward slowly during the swing so they don't feel frozen
    steerTo(z, playerPos, dt, 0.18);

    if (!z.hasHitThisSwing && z.stateT >= ATTACK_WINDUP) {
      z.hasHitThisSwing = true;
      const d = M.distXZ(z.pos, playerPos);
      if (d < Z.B.PLAYER.meleeRange && Math.abs(z.pos[1] - playerPos[1]) < 1.8) {
        if (Z.Audio && Z.Audio.ready) {
          Z.Audio.play('zom_attack_swipe', { pos: z.pos, vol: 0.85 });
          Z.Audio.play('zom_hit_player', { vol: 0.9 });
        }
        if (player && Z.Player) Z.Player.damage(player, S.hitDamage(), z.pos, 'zombie');
      } else if (Z.Audio && Z.Audio.ready) {
        Z.Audio.play('zom_attack_swipe', { pos: z.pos, vol: 0.55 });
      }
    }
    if (z.stateT >= ATTACK_TOTAL) {
      z.state = 'hunt';
      z.stateT = 0;
      z.attackCooldown = 0.55;
      z.attackPhase = 0;
    }
  }

  // 50 damage: two hits down an unbuffed player, five with Juggernog. This
  // single number is the most load-bearing value in the whole game.
  S.hitDamage = function () { return 50; };

  function faceTowards(z, p) {
    const dx = p[0] - z.pos[0], dz = p[2] - z.pos[2];
    if (Math.abs(dx) + Math.abs(dz) > 0.0001) z.targetYaw = Math.atan2(-dx, -dz);
  }

  function animForSpeed(z) {
    if (z.crawler) return 'crawler';
    if (z.speed < 1.6) return 'shamble';
    if (z.speed < 3.1) return 'walk';
    return 'run';
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  const jointBuf = new Float32Array(264);   // 22 joints x mat3x4 (see Z.Models.poseZombie)
  const modelM = M.m4.create();

  S.render = function () {
    if (!Z.Models || !Z.Models.zombie || !S.gpu) return;
    const cam = Z.Render.camera.pos;
    for (const z of S.list) {
      // cheap distance + behind-camera cull
      const d = M.dist3(z.pos, cam);
      if (d > 55) continue;
      const anim = z.dying ? z.deathAnim : z.anim;
      const t = z.dying ? z.deathT : z.animT;
      Z.Models.poseZombie(jointBuf, anim, t, {
        speed: z.speed, seed: z.seed, crawler: z.crawler,
        attackPhase: z.attackPhase, limbsMissing: z.limbsMissing,
        stagger: z.stagger, variant: z.variant,
      });
      M.m4.compose(modelM, z.pos[0], z.pos[1], z.pos[2], z.yaw, 0, 0, 1, 1, 1);
      const mesh = S.gpu[z.variant] || S.gpu[0];
      Z.Render.drawSkinned(mesh, modelM, jointBuf, null);
    }
  };

  // Blob shadows are drawn as one batch so they cost a single draw call.
  S.renderShadows = function () {
    Z.Render.beginQuads();
    for (const z of S.list) {
      if (z.dying && z.deathT > 1.5) continue;
      Z.FX.blobShadow(z.pos, z.crawler ? 0.42 : 0.52, 0.5);
    }
    Z.Render.flushQuads('smoke_puff', false, 0.9);
  };

  S.uploadModels = function () {
    if (!Z.Models || !Z.Models.zombie) return false;
    S.gpu = [];
    const variants = Z.Models.zombieVariants && Z.Models.zombieVariants.length
      ? Z.Models.zombieVariants : [Z.Models.zombie];
    for (const v of variants) S.gpu.push(Z.Render.uploadMesh(v));
    return true;
  };

  // -------------------------------------------------------------------------
  // Queries used by the round director and HUD
  // -------------------------------------------------------------------------
  S.countAlive = function () {
    let n = 0;
    for (const z of S.list) if (!z.dying && !z.dead) n++;
    return n;
  };
  S.countInside = function () {
    let n = 0;
    for (const z of S.list) if (!z.dying && z.state === 'hunt') n++;
    return n;
  };
  S.nearestTo = function (p, maxDist) {
    let best = null, bestD = maxDist === undefined ? 1e9 : maxDist * maxDist;
    for (const z of S.list) {
      if (z.dying) continue;
      const d = M.dist3sq(z.pos, p);
      if (d < bestD) { bestD = d; best = z; }
    }
    return best;
  };
  S.clear = function () {
    S.list.length = 0;
    S.aliveCount = 0;
    if (level) for (const w of level.windows) w.tearer = null;
  };

  S.stats = function () {
    let tearing = 0, hunting = 0, climbing = 0, approaching = 0, dying = 0;
    for (const z of S.list) {
      if (z.dying) { dying++; continue; }
      if (z.state === 'tear') tearing++;
      else if (z.state === 'hunt' || z.state === 'attack') hunting++;
      else if (z.state === 'climb') climbing++;
      else approaching++;
    }
    return { total: S.list.length, alive: S.countAlive(), tearing, hunting, climbing, approaching, dying };
  };
}());
