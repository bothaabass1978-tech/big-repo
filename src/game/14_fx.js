// ---------------------------------------------------------------------------
// 14_fx.js — particles, decals, tracers, blob shadows, camera shake and the
// screen-space effect state. Everything here is pooled; no per-frame garbage.
// ---------------------------------------------------------------------------
(function () {
  const F = {};
  Z.FX = F;
  const M = Z.M;
  const rng = Z.RNG.make(0xFACE1234);

  const MAX_P = 1400;
  const MAX_DECALS = 220;

  // Struct-of-arrays particle pool.
  const P = {
    x: new Float32Array(MAX_P), y: new Float32Array(MAX_P), z: new Float32Array(MAX_P),
    vx: new Float32Array(MAX_P), vy: new Float32Array(MAX_P), vz: new Float32Array(MAX_P),
    life: new Float32Array(MAX_P), maxLife: new Float32Array(MAX_P),
    s0: new Float32Array(MAX_P), s1: new Float32Array(MAX_P),
    r0: new Float32Array(MAX_P), g0: new Float32Array(MAX_P), b0: new Float32Array(MAX_P), a0: new Float32Array(MAX_P),
    r1: new Float32Array(MAX_P), g1: new Float32Array(MAX_P), b1: new Float32Array(MAX_P), a1: new Float32Array(MAX_P),
    grav: new Float32Array(MAX_P), drag: new Float32Array(MAX_P),
    rot: new Float32Array(MAX_P), rotV: new Float32Array(MAX_P),
    kind: new Uint8Array(MAX_P),       // index into SPRITE_KEYS
    flags: new Uint8Array(MAX_P),      // 1 = additive, 2 = collide, 4 = leaves blood decal
    alive: new Uint8Array(MAX_P),
  };
  let pHead = 0, pAlive = 0;

  // These must be keys that Z.Tex actually generates — an unknown key silently
  // falls back to a 1x1 white texture, which renders brass casings and tracers
  // as solid white squares.
  const SPRITE_KEYS = [
    'smoke_puff', 'spark', 'blood_drop', 'dust_mote', 'gib_chunk',
    'muzzle_flash_1', 'muzzle_flash_2', 'muzzle_flash_3', 'gib_chunk', 'spark',
  ];
  const K_SMOKE = 0, K_SPARK = 1, K_BLOOD = 2, K_DUST = 3, K_GIB = 4,
    K_FLASH1 = 5, K_FLASH2 = 6, K_FLASH3 = 7, K_SHELL = 8, K_GLOW = 9;
  F.K = { SMOKE: K_SMOKE, SPARK: K_SPARK, BLOOD: K_BLOOD, DUST: K_DUST, GIB: K_GIB, GLOW: K_GLOW };

  const FL_ADD = 1, FL_COLLIDE = 2, FL_BLOOD_DECAL = 4;

  function spawn(kind, x, y, z, vx, vy, vz, life, s0, s1, c0, c1, grav, drag, flags) {
    let i = -1;
    for (let n = 0; n < MAX_P; n++) {
      const j = (pHead + n) % MAX_P;
      if (!P.alive[j]) { i = j; pHead = (j + 1) % MAX_P; break; }
    }
    if (i < 0) { i = pHead; pHead = (pHead + 1) % MAX_P; } // steal oldest slot
    else pAlive++;
    P.alive[i] = 1;
    P.x[i] = x; P.y[i] = y; P.z[i] = z;
    P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz;
    P.life[i] = life; P.maxLife[i] = life;
    P.s0[i] = s0; P.s1[i] = s1;
    P.r0[i] = c0[0]; P.g0[i] = c0[1]; P.b0[i] = c0[2]; P.a0[i] = c0[3];
    P.r1[i] = c1[0]; P.g1[i] = c1[1]; P.b1[i] = c1[2]; P.a1[i] = c1[3];
    P.grav[i] = grav; P.drag[i] = drag;
    P.rot[i] = rng.f() * M.TAU; P.rotV[i] = rng.sym(3);
    P.kind[i] = kind;
    P.flags[i] = flags || 0;
    return i;
  }
  F.spawn = spawn;

  // -------------------------------------------------------------------------
  // Decals — bullet holes and blood, projected onto the surface they hit
  // -------------------------------------------------------------------------
  const decals = [];
  let decalHead = 0;

  F.addDecal = function (pos, normal, size, sprite, life, col) {
    // Build a tangent frame around the surface normal.
    let ux = 0, uy = 1, uz = 0;
    if (Math.abs(normal[1]) > 0.92) { ux = 1; uy = 0; uz = 0; }
    const rx = uy * normal[2] - uz * normal[1];
    const ry = uz * normal[0] - ux * normal[2];
    const rz = ux * normal[1] - uy * normal[0];
    const rl = Math.hypot(rx, ry, rz) || 1;
    const bx = normal[1] * (rz / rl) - normal[2] * (ry / rl);
    const by = normal[2] * (rx / rl) - normal[0] * (rz / rl);
    const bz = normal[0] * (ry / rl) - normal[1] * (rx / rl);
    const a = rng.f() * M.TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    const h = size * 0.5;
    const R1 = [(rx / rl * ca + bx * sa) * h, (ry / rl * ca + by * sa) * h, (rz / rl * ca + bz * sa) * h];
    const U1 = [(-rx / rl * sa + bx * ca) * h, (-ry / rl * sa + by * ca) * h, (-rz / rl * sa + bz * ca) * h];
    const d = decals[decalHead] || (decals[decalHead] = {});
    // lift slightly off the surface to avoid z-fighting
    d.pos = [pos[0] + normal[0] * 0.008, pos[1] + normal[1] * 0.008, pos[2] + normal[2] * 0.008];
    d.right = R1; d.up = U1;
    d.sprite = sprite;
    d.life = life === undefined ? Infinity : life;
    d.maxLife = d.life;
    d.col = col || [1, 1, 1, 1];
    decalHead = (decalHead + 1) % MAX_DECALS;
    return d;
  };
  F.decalCount = () => decals.length;

  // -------------------------------------------------------------------------
  // Tracers — short bright streaks along the bullet path
  // -------------------------------------------------------------------------
  const tracers = [];
  F.tracer = function (from, to, col, width, life) {
    tracers.push({
      a: from.slice(), b: to.slice(), t: 0,
      life: life || 0.055, col: col || [1, 0.86, 0.55, 1], w: width || 0.022,
    });
    if (tracers.length > 64) tracers.shift();
  };

  // -------------------------------------------------------------------------
  // Emitters
  // -------------------------------------------------------------------------

  // Muzzle flash: one bright short-lived sprite plus a puff of smoke and sparks.
  F.muzzleFlash = function (pos, dir, scale) {
    scale = scale || 1;
    const k = K_FLASH1 + (rng.i(3));
    spawn(k, pos[0], pos[1], pos[2], dir[0] * 0.5, dir[1] * 0.5, dir[2] * 0.5,
      0.045, 0.42 * scale, 0.55 * scale,
      [1, 0.93, 0.68, 1], [1, 0.62, 0.22, 0], 0, 6, FL_ADD);
    for (let i = 0; i < 3; i++) {
      spawn(K_SPARK, pos[0], pos[1], pos[2],
        dir[0] * rng.range(3, 9) + rng.sym(2.5),
        dir[1] * rng.range(3, 9) + rng.sym(2.5),
        dir[2] * rng.range(3, 9) + rng.sym(2.5),
        rng.range(0.09, 0.22), 0.028, 0.004,
        [1, 0.88, 0.5, 1], [1, 0.35, 0.08, 0], 9, 2.2, FL_ADD);
    }
    spawn(K_SMOKE, pos[0] + dir[0] * 0.16, pos[1] + dir[1] * 0.16, pos[2] + dir[2] * 0.16,
      dir[0] * 1.4 + rng.sym(0.3), dir[1] * 1.4 + rng.sym(0.3) + 0.3, dir[2] * 1.4 + rng.sym(0.3),
      rng.range(0.5, 0.9), 0.09 * scale, 0.55 * scale,
      [0.42, 0.40, 0.38, 0.42], [0.30, 0.29, 0.28, 0], -0.35, 1.4, 0);
  };

  // Surface impact. `mat` selects debris colour and the bullet-hole decal.
  const IMPACT = {
    wood: { col: [0.36, 0.26, 0.15], hole: 'bullet_hole_wood', sparks: 0 },
    concrete: { col: [0.55, 0.54, 0.52], hole: 'bullet_hole_concrete', sparks: 1 },
    plaster: { col: [0.66, 0.64, 0.60], hole: 'bullet_hole_concrete', sparks: 0 },
    brick: { col: [0.45, 0.30, 0.24], hole: 'bullet_hole_concrete', sparks: 1 },
    metal: { col: [0.55, 0.55, 0.58], hole: 'bullet_hole_metal', sparks: 5 },
    dirt: { col: [0.30, 0.25, 0.18], hole: 'bullet_hole_concrete', sparks: 0 },
  };

  F.impact = function (pos, normal, matKey) {
    const spec = IMPACT[matKey] || IMPACT.concrete;
    for (let i = 0; i < 5; i++) {
      const sx = normal[0] + rng.sym(0.9), sy = normal[1] + rng.sym(0.9), sz = normal[2] + rng.sym(0.9);
      const sp = rng.range(1.2, 4.5);
      spawn(K_DUST, pos[0], pos[1], pos[2], sx * sp, sy * sp + 0.6, sz * sp,
        rng.range(0.3, 0.75), 0.022, 0.06,
        [spec.col[0], spec.col[1], spec.col[2], 0.85],
        [spec.col[0] * 0.7, spec.col[1] * 0.7, spec.col[2] * 0.7, 0], 5.5, 2.2, 0);
    }
    for (let i = 0; i < spec.sparks; i++) {
      const sp = rng.range(3, 9);
      spawn(K_SPARK, pos[0], pos[1], pos[2],
        normal[0] * sp + rng.sym(3), normal[1] * sp + rng.sym(3), normal[2] * sp + rng.sym(3),
        rng.range(0.16, 0.42), 0.02, 0.003,
        [1, 0.9, 0.62, 1], [1, 0.4, 0.1, 0], 11, 1.5, FL_ADD);
    }
    // dust puff hanging in the air
    spawn(K_SMOKE, pos[0] + normal[0] * 0.05, pos[1] + normal[1] * 0.05, pos[2] + normal[2] * 0.05,
      normal[0] * 0.7, normal[1] * 0.7 + 0.4, normal[2] * 0.7,
      rng.range(0.6, 1.1), 0.10, 0.42,
      [spec.col[0] * 1.15, spec.col[1] * 1.15, spec.col[2] * 1.15, 0.32],
      [spec.col[0], spec.col[1], spec.col[2], 0], -0.2, 1.6, 0);
    F.addDecal(pos, normal, rng.range(0.055, 0.085), spec.hole, Infinity, [1, 1, 1, 1]);
  };

  // Flesh hit — the spray that sells every shot in Zombies.
  F.blood = function (pos, dir, amount, crit) {
    const n = Math.min(26, Math.round((crit ? 14 : 6) * (amount || 1)));
    for (let i = 0; i < n; i++) {
      const sp = rng.range(1.5, crit ? 8 : 5);
      const dx = dir[0] + rng.sym(0.85), dy = dir[1] + rng.sym(0.85) + 0.25, dz = dir[2] + rng.sym(0.85);
      spawn(K_BLOOD, pos[0], pos[1], pos[2], dx * sp, dy * sp, dz * sp,
        rng.range(0.35, 0.9), rng.range(0.02, 0.05), 0.012,
        [0.44, 0.035, 0.028, 1], [0.20, 0.012, 0.010, 0.75],
        16, 0.5, FL_COLLIDE | FL_BLOOD_DECAL);
    }
    // a dark mist that lingers for a beat
    spawn(K_SMOKE, pos[0], pos[1], pos[2], dir[0] * 0.8, dir[1] * 0.8, dir[2] * 0.8,
      rng.range(0.25, 0.45), 0.10, 0.34,
      [0.30, 0.02, 0.02, crit ? 0.55 : 0.3], [0.12, 0.01, 0.01, 0], 0.5, 2.4, 0);
    if (crit) {
      for (let i = 0; i < 5; i++) {
        const sp = rng.range(2, 6);
        spawn(K_GIB, pos[0], pos[1], pos[2],
          dir[0] * sp + rng.sym(2.5), dir[1] * sp + rng.sym(2.5) + 1.5, dir[2] * sp + rng.sym(2.5),
          rng.range(0.8, 1.6), rng.range(0.035, 0.075), rng.range(0.03, 0.06),
          [0.42, 0.06, 0.05, 1], [0.30, 0.04, 0.03, 1], 18, 0.4, FL_COLLIDE | FL_BLOOD_DECAL);
      }
    }
  };

  F.gib = function (pos, power) {
    for (let i = 0; i < 16; i++) {
      const d = rng.dir3([0, 0, 0]);
      const sp = rng.range(2, 7) * (power || 1);
      spawn(K_GIB, pos[0], pos[1], pos[2], d[0] * sp, Math.abs(d[1]) * sp + 2, d[2] * sp,
        rng.range(1.0, 2.2), rng.range(0.04, 0.10), rng.range(0.035, 0.08),
        [0.40, 0.06, 0.05, 1], [0.26, 0.035, 0.03, 1], 18, 0.35, FL_COLLIDE | FL_BLOOD_DECAL);
    }
    for (let i = 0; i < 22; i++) {
      const d = rng.dir3([0, 0, 0]);
      const sp = rng.range(2, 9) * (power || 1);
      spawn(K_BLOOD, pos[0], pos[1], pos[2], d[0] * sp, Math.abs(d[1]) * sp + 1.5, d[2] * sp,
        rng.range(0.5, 1.2), 0.035, 0.014,
        [0.46, 0.04, 0.03, 1], [0.22, 0.015, 0.012, 0.6], 16, 0.5, FL_COLLIDE | FL_BLOOD_DECAL);
    }
    spawn(K_SMOKE, pos[0], pos[1], pos[2], 0, 0.6, 0, 0.7, 0.3, 1.1,
      [0.34, 0.03, 0.03, 0.55], [0.10, 0.01, 0.01, 0], 0.4, 2.0, 0);
  };

  // Wood splinters from a barricade board being torn or shot.
  F.splinters = function (pos, dir, count) {
    for (let i = 0; i < (count || 8); i++) {
      const sp = rng.range(1.5, 5);
      spawn(K_GIB, pos[0], pos[1], pos[2],
        dir[0] * sp + rng.sym(2.2), rng.range(0.5, 3.5), dir[2] * sp + rng.sym(2.2),
        rng.range(0.6, 1.4), rng.range(0.02, 0.05), rng.range(0.015, 0.04),
        [0.44, 0.33, 0.20, 1], [0.30, 0.22, 0.13, 1], 16, 0.4, FL_COLLIDE);
    }
    spawn(K_SMOKE, pos[0], pos[1], pos[2], 0, 0.4, 0, 0.5, 0.08, 0.35,
      [0.44, 0.38, 0.28, 0.30], [0.30, 0.26, 0.19, 0], 0.2, 2.0, 0);
  };

  F.shell = function (pos, vel, big) {
    spawn(K_SHELL, pos[0], pos[1], pos[2], vel[0], vel[1], vel[2],
      2.2, big ? 0.035 : 0.020, big ? 0.035 : 0.020,
      [0.72, 0.55, 0.24, 1], [0.60, 0.45, 0.20, 1], 20, 0.15, FL_COLLIDE);
  };

  F.explosion = function (pos, radius) {
    F.shake(0.9, 0.55);
    spawn(K_FLASH1, pos[0], pos[1], pos[2], 0, 0, 0, 0.10, radius * 0.9, radius * 1.6,
      [1, 0.92, 0.66, 1], [1, 0.45, 0.12, 0], 0, 4, FL_ADD);
    for (let i = 0; i < 26; i++) {
      const d = rng.dir3([0, 0, 0]);
      const sp = rng.range(3, 13);
      spawn(K_SMOKE, pos[0], pos[1], pos[2], d[0] * sp, Math.abs(d[1]) * sp * 0.7 + 1.4, d[2] * sp,
        rng.range(0.8, 1.7), 0.25, rng.range(1.2, 2.4),
        [0.30, 0.28, 0.26, 0.75], [0.13, 0.12, 0.12, 0], -0.5, 1.5, 0);
    }
    for (let i = 0; i < 30; i++) {
      const d = rng.dir3([0, 0, 0]);
      const sp = rng.range(6, 22);
      spawn(K_SPARK, pos[0], pos[1], pos[2], d[0] * sp, Math.abs(d[1]) * sp + 2, d[2] * sp,
        rng.range(0.3, 0.9), 0.035, 0.005,
        [1, 0.85, 0.5, 1], [1, 0.3, 0.05, 0], 12, 1.2, FL_ADD);
    }
  };

  // Slow drifting dust in shafts of light — pure atmosphere, always on.
  F.ambientDust = function (center, radius, count) {
    for (let i = 0; i < count; i++) {
      const a = rng.f() * M.TAU, r = Math.sqrt(rng.f()) * radius;
      spawn(K_DUST, center[0] + Math.cos(a) * r, center[1] + rng.range(0.2, 2.9), center[2] + Math.sin(a) * r,
        rng.sym(0.06), rng.range(-0.02, 0.05), rng.sym(0.06),
        rng.range(6, 14), rng.range(0.004, 0.010), rng.range(0.004, 0.010),
        [0.75, 0.74, 0.70, 0.14], [0.75, 0.74, 0.70, 0], 0, 0.15, 0);
    }
  };

  // -------------------------------------------------------------------------
  // Camera shake — decaying noise, applied by the player camera
  // -------------------------------------------------------------------------
  let shakeAmp = 0, shakeT = 0, shakeDur = 0;
  F.shake = function (amp, dur) {
    if (amp > shakeAmp) { shakeAmp = amp; shakeT = 0; shakeDur = dur; }
    else { shakeAmp = Math.min(1.6, shakeAmp + amp * 0.4); shakeDur = Math.max(shakeDur, dur); }
  };
  const shakeOut = [0, 0, 0];
  F.shakeOffset = function () { return shakeOut; };

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------
  F.update = function (dt) {
    // particles
    for (let i = 0; i < MAX_P; i++) {
      if (!P.alive[i]) continue;
      P.life[i] -= dt;
      if (P.life[i] <= 0) { P.alive[i] = 0; pAlive--; continue; }
      const drag = Math.exp(-P.drag[i] * dt);
      P.vx[i] *= drag; P.vz[i] *= drag;
      P.vy[i] = P.vy[i] * drag - P.grav[i] * dt;
      const nx = P.x[i] + P.vx[i] * dt;
      const ny = P.y[i] + P.vy[i] * dt;
      const nz = P.z[i] + P.vz[i] * dt;
      if (P.flags[i] & FL_COLLIDE) {
        const floor = Z.Phys.floorAt ? Z.Phys.floorAt([nx, P.y[i], nz], 0.6, 0.02) : null;
        if (floor !== null && ny <= floor + 0.01 && P.vy[i] < 0) {
          if (P.flags[i] & FL_BLOOD_DECAL) {
            F.addDecal([nx, floor, nz], [0, 1, 0], rng.range(0.16, 0.42),
              'blood_splat_' + (1 + rng.i(4)), 40, [0.85, 0.85, 0.85, 0.9]);
            P.alive[i] = 0; pAlive--; continue;
          }
          // bounce and settle
          P.y[i] = floor + 0.005;
          P.vy[i] *= -0.28;
          P.vx[i] *= 0.55; P.vz[i] *= 0.55;
          P.rotV[i] *= 0.5;
          if (Math.abs(P.vy[i]) < 0.4) { P.vy[i] = 0; P.grav[i] = 0; P.drag[i] = 12; }
          continue;
        }
      }
      P.x[i] = nx; P.y[i] = ny; P.z[i] = nz;
      P.rot[i] += P.rotV[i] * dt;
    }

    // tracers
    for (let i = tracers.length - 1; i >= 0; i--) {
      tracers[i].t += dt;
      if (tracers[i].t >= tracers[i].life) tracers.splice(i, 1);
    }

    // decals
    for (let i = 0; i < decals.length; i++) {
      const d = decals[i];
      if (!d || d.life === Infinity) continue;
      d.life -= dt;
    }

    // shake
    if (shakeAmp > 0) {
      shakeT += dt;
      const k = Math.max(0, 1 - shakeT / Math.max(shakeDur, 0.0001));
      const a = shakeAmp * k * k;
      const t = shakeT;
      shakeOut[0] = (Math.sin(t * 61.3) * 0.6 + Math.sin(t * 113.7) * 0.4) * a * 0.035;
      shakeOut[1] = (Math.sin(t * 74.1) * 0.6 + Math.sin(t * 131.3) * 0.4) * a * 0.030;
      shakeOut[2] = (Math.sin(t * 43.7)) * a * 0.020;
      if (k <= 0) { shakeAmp = 0; shakeOut[0] = shakeOut[1] = shakeOut[2] = 0; }
    }
  };

  // -------------------------------------------------------------------------
  // Render — decals first (alpha, depth-tested), then particles by blend mode
  // -------------------------------------------------------------------------
  F.render = function () {
    const R = Z.Render;

    // decals
    R.beginQuads();
    let lastSprite = null;
    const groups = Object.create(null);
    for (let i = 0; i < decals.length; i++) {
      const d = decals[i];
      if (!d || (d.life !== Infinity && d.life <= 0)) continue;
      if (!groups[d.sprite]) groups[d.sprite] = [];
      groups[d.sprite].push(d);
    }
    for (const sprite in groups) {
      R.beginQuads();
      const list = groups[sprite];
      for (const d of list) {
        let a = d.col[3];
        if (d.life !== Infinity) a *= M.clamp01(d.life / Math.min(d.maxLife, 6));
        R.worldQuad(d.pos, d.right, d.up, [d.col[0], d.col[1], d.col[2], a]);
      }
      R.flushQuads(sprite, false, 0.85);
    }

    // particles, grouped by sprite and blend mode so we get few draw calls
    for (let pass = 0; pass < 2; pass++) {
      const additive = pass === 1;
      for (let k = 0; k < SPRITE_KEYS.length; k++) {
        let any = false;
        R.beginQuads();
        for (let i = 0; i < MAX_P; i++) {
          if (!P.alive[i] || P.kind[i] !== k) continue;
          if (!!(P.flags[i] & FL_ADD) !== additive) continue;
          const t = 1 - P.life[i] / P.maxLife[i];
          const size = P.s0[i] + (P.s1[i] - P.s0[i]) * t;
          const cr = P.r0[i] + (P.r1[i] - P.r0[i]) * t;
          const cg = P.g0[i] + (P.g1[i] - P.g0[i]) * t;
          const cb = P.b0[i] + (P.b1[i] - P.b0[i]) * t;
          const ca = P.a0[i] + (P.a1[i] - P.a0[i]) * t;
          if (ca <= 0.002) continue;
          TMP_POS[0] = P.x[i]; TMP_POS[1] = P.y[i]; TMP_POS[2] = P.z[i];
          TMP_SIZE[0] = size; TMP_SIZE[1] = size;
          TMP_COL[0] = cr; TMP_COL[1] = cg; TMP_COL[2] = cb; TMP_COL[3] = ca;
          R.billboard(TMP_POS, TMP_SIZE, TMP_COL, null, null, P.rot[i]);
          any = true;
        }
        if (any) R.flushQuads(SPRITE_KEYS[k], additive, additive ? 0.6 : 1);
      }
    }

    // tracers: a thin quad stretched along the shot, always additive
    if (tracers.length) {
      R.beginQuads();
      for (const tr of tracers) {
        const k = 1 - tr.t / tr.life;
        const dx = tr.b[0] - tr.a[0], dy = tr.b[1] - tr.a[1], dz = tr.b[2] - tr.a[2];
        const len = Math.hypot(dx, dy, dz) || 1;
        const ux = dx / len * len * 0.5, uy = dy / len * len * 0.5, uz = dz / len * len * 0.5;
        // right vector = cross(dir, camera->point)
        const cam = R.camera.pos;
        const mx = (tr.a[0] + tr.b[0]) * 0.5, my = (tr.a[1] + tr.b[1]) * 0.5, mz = (tr.a[2] + tr.b[2]) * 0.5;
        const vx = mx - cam[0], vy = my - cam[1], vz = mz - cam[2];
        let rx = (dy / len) * vz - (dz / len) * vy;
        let ry = (dz / len) * vx - (dx / len) * vz;
        let rz = (dx / len) * vy - (dy / len) * vx;
        const rl = Math.hypot(rx, ry, rz) || 1;
        rx = rx / rl * tr.w; ry = ry / rl * tr.w; rz = rz / rl * tr.w;
        TMP_POS[0] = mx; TMP_POS[1] = my; TMP_POS[2] = mz;
        TMP_R[0] = rx; TMP_R[1] = ry; TMP_R[2] = rz;
        TMP_U[0] = ux; TMP_U[1] = uy; TMP_U[2] = uz;
        TMP_COL[0] = tr.col[0]; TMP_COL[1] = tr.col[1]; TMP_COL[2] = tr.col[2];
        TMP_COL[3] = tr.col[3] * k;
        R.worldQuad(TMP_POS, TMP_R, TMP_U, TMP_COL);
      }
      R.flushQuads('spark', true, 0.4);
    }
  };
  const TMP_POS = [0, 0, 0], TMP_SIZE = [0, 0], TMP_COL = [0, 0, 0, 0];
  const TMP_R = [0, 0, 0], TMP_U = [0, 0, 0];

  // Soft blob shadow under an entity — cheap, but it grounds characters.
  F.blobShadow = function (pos, radius, alpha) {
    const floor = Z.Phys.floorAt([pos[0], pos[1] + 0.2, pos[2]], 3.2, radius * 0.5);
    if (floor === null) return;
    const fade = M.clamp01(1 - (pos[1] - floor) / 2.2);
    if (fade <= 0.02) return;
    TMP_POS[0] = pos[0]; TMP_POS[1] = floor + 0.012; TMP_POS[2] = pos[2];
    TMP_R[0] = radius; TMP_R[1] = 0; TMP_R[2] = 0;
    TMP_U[0] = 0; TMP_U[1] = 0; TMP_U[2] = radius;
    TMP_COL[0] = 0; TMP_COL[1] = 0; TMP_COL[2] = 0; TMP_COL[3] = (alpha || 0.55) * fade;
    Z.Render.worldQuad(TMP_POS, TMP_R, TMP_U, TMP_COL);
  };

  F.reset = function () {
    for (let i = 0; i < MAX_P; i++) P.alive[i] = 0;
    pAlive = 0;
    decals.length = 0;
    decalHead = 0;
    tracers.length = 0;
    shakeAmp = 0;
    shakeOut[0] = shakeOut[1] = shakeOut[2] = 0;
  };

  F.stats = function () { return { particles: pAlive, decals: decals.length, tracers: tracers.length }; };
}());
