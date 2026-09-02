// ---------------------------------------------------------------------------
// 15_weapons.js — weapon runtime: firing, spread, recoil, reloads, hit
// resolution and the first-person viewmodel state.
//
// All numbers come from Z.B.WEAPONS. This module owns *feel*: the accumulator
// that makes RPM exact regardless of framerate, the spread bloom, the recoil
// spring, the ADS curve, and the bob/sway that make the gun feel held rather
// than welded to the camera.
// ---------------------------------------------------------------------------
(function () {
  const W = {};
  Z.W = W;
  const M = Z.M;
  const rng = Z.RNG.make(0x9EA7011);

  // Audio ids don't match balance ids one-for-one (the sound designer named
  // them independently), so map explicitly rather than guessing at runtime.
  const SOUND = {
    m1911: 'gun_m1911', kar98k: 'gun_kar98k', m1a1_carbine: 'gun_carbine',
    gewehr43: 'gun_gewehr43', db_shotgun: 'gun_dbshotgun', sawed_off: 'gun_dbshotgun',
    thompson: 'gun_thompson', bar: 'gun_bar', mp40: 'gun_mp40', type100: 'gun_thompson',
    stg44: 'gun_stg44', fg42: 'gun_fg42', springfield: 'gun_kar98k',
    ptrs41: 'gun_ptrs41', m1919: 'gun_browning', trench_gun: 'gun_trenchgun',
    panzerschreck: 'gun_panzerschreck', raygun: 'gun_raygun',
    m2_flamethrower: 'gun_thompson', magnum357: 'gun_m1911', knife: 'plr_knife_swing',
  };
  const RELOAD_SOUND = {
    pistol: 'reload_pistol', smg: 'reload_smg', rifle: 'reload_rifle',
    lmg: 'reload_lmg', shotgun: 'reload_shotgun', launcher: 'reload_rocket',
    wonder: 'reload_raygun', flamethrower: 'reload_rocket', melee: null,
  };

  const byId = Object.create(null);

  W.init = function () {
    for (const def of Z.B.WEAPONS) byId[def.id] = def;
    W.defs = byId;
    return W;
  };
  W.def = function (id) {
    if (!byId[id]) throw new Error('unknown weapon "' + id + '"');
    return byId[id];
  };
  W.exists = (id) => !!byId[id];

  // -------------------------------------------------------------------------
  // Weapon instance
  // -------------------------------------------------------------------------
  W.make = function (id, opts) {
    const def = W.def(id);
    opts = opts || {};
    return {
      id, def,
      mag: opts.mag === undefined ? def.magSize : opts.mag,
      reserve: opts.reserve === undefined ? def.startReserve : opts.reserve,
      // firing
      cooldown: 0,           // seconds until the next shot is allowed
      fireAccum: 0,          // carries fractional shot timing across frames
      burstLeft: 0,
      triggerHeld: false,
      triggerWasHeld: false,
      shotsThisTrigger: 0,
      // reload
      reloading: false,
      reloadT: 0,
      reloadDur: 0,
      reloadShell: 0,        // shell-by-shell shotgun reloads
      reloadStage: '',
      pendingCancel: false,
      // ads
      ads: 0,                // 0..1
      adsWant: false,
      // state
      bloom: 0,              // extra spread from sustained fire, 0..1
      raised: 1,             // 0 while sprinting (gun lowered)
      lastFireTime: -99,
      boltCycle: 0,          // bolt-action rechamber timer
      firstDraw: true,
      drawT: 0,
    };
  };

  W.ammoString = (w) => w.mag + ' / ' + w.reserve;

  // -------------------------------------------------------------------------
  // Modifiers the player's perks apply
  // -------------------------------------------------------------------------
  function rpmOf(w, mods) {
    let rpm = w.def.rpm;
    if (mods && mods.doubleTap) rpm *= 1.33;
    return rpm;
  }
  function reloadScale(mods) { return (mods && mods.speedCola) ? 0.5 : 1.0; }

  // -------------------------------------------------------------------------
  // Spread — degrees of cone half-angle
  // -------------------------------------------------------------------------
  W.currentSpread = function (w, ctx) {
    const d = w.def;
    const base = M.lerp(d.spreadHip, d.spreadAds, easeAds(w.ads));
    let s = base;
    // movement penalty, scaled by how fast you're actually going
    const moveFrac = ctx ? M.clamp01(ctx.speed / Z.B.PLAYER.speedWalk) : 0;
    s *= M.lerp(1, d.spreadMoveMult, moveFrac);
    if (ctx && ctx.crouched) s *= 0.72;
    if (ctx && !ctx.onGround) s *= 1.9;
    // sustained-fire bloom: the reason you tap-fire at range
    s *= 1 + w.bloom * 1.35;
    return s;
  };

  function easeAds(t) { return t * t * (3 - 2 * t); }
  W.easeAds = easeAds;

  W.fovFor = function (w, baseFov) {
    const zoom = w.def.class === 'sniper' ? 0.45 : 0.72;
    return M.lerp(baseFov, baseFov * zoom, easeAds(w.ads));
  };

  // -------------------------------------------------------------------------
  // Update — called every fixed tick
  // ctx: { origin:[3], dir:[3], yaw, pitch, speed, crouched, onGround,
  //        sprinting, mods:{doubleTap,speedCola}, wantFire, wantReload,
  //        wantAds, dt, onShot(info), player }
  // -------------------------------------------------------------------------
  W.update = function (w, ctx) {
    const dt = ctx.dt;
    const d = w.def;

    // --- draw / sprint-out -------------------------------------------------
    if (w.drawT > 0) w.drawT = Math.max(0, w.drawT - dt);

    const canAct = w.drawT <= 0;
    const sprintBlock = ctx.sprinting && ctx.speed > Z.B.PLAYER.speedWalk * 1.02;
    w.raised = M.damp(w.raised, sprintBlock ? 0 : 1, sprintBlock ? 12 : 9, dt);

    // --- ADS ---------------------------------------------------------------
    w.adsWant = !!ctx.wantAds && !sprintBlock && canAct && !w.reloading;
    const adsRate = 1 / Math.max(0.05, d.adsTime);
    w.ads = M.clamp01(w.ads + (w.adsWant ? adsRate : -adsRate * 1.35) * dt);

    // --- timers ------------------------------------------------------------
    if (w.cooldown > 0) w.cooldown = Math.max(0, w.cooldown - dt);
    if (w.boltCycle > 0) w.boltCycle = Math.max(0, w.boltCycle - dt);
    // Bloom decays once you stop shooting; this is what rewards burst fire.
    w.bloom = Math.max(0, w.bloom - dt * 1.9);

    // --- reload ------------------------------------------------------------
    if (w.reloading) {
      w.reloadT += dt;
      if (w.reloadT >= w.reloadDur) finishReloadStage(w, ctx);
      // cancelling into a sprint or a shot (shotguns only) is allowed
      if (w.pendingCancel) { w.reloading = false; w.pendingCancel = false; }
      return;
    }

    // --- trigger -----------------------------------------------------------
    const held = !!ctx.wantFire && canAct && !sprintBlock;
    if (!held) { w.shotsThisTrigger = 0; w.fireAccum = 0; }
    w.triggerWasHeld = w.triggerHeld;
    w.triggerHeld = held;

    if (ctx.wantReload && canAct) { W.beginReload(w, ctx); return; }

    // Auto-reload when the magazine runs dry and the trigger is pulled.
    if (held && w.mag <= 0) {
      if (w.reserve > 0) { W.beginReload(w, ctx); }
      else if (!w.triggerWasHeld) { playDry(w, ctx); }
      return;
    }
    if (!held || w.mag <= 0) return;
    if (w.boltCycle > 0) return;

    // Continuous damage-over-time weapons (currently only the M2
    // Flamethrower) have no discrete "round" and must never reach the
    // rpm/cooldown math below: `rpm` is null for them by design (see
    // B.validate()'s dot/melee rpm exemption), and 60 / null is Infinity —
    // that Infinity cooldown is what jammed the gun after exactly one shot
    // when this used to fall through to the generic path below.
    if (d.dot) { fireContinuous(w, ctx); return; }

    const semi = d.fireMode === 'semi';
    if (semi && w.triggerWasHeld) return;   // one shot per pull

    const rpm = rpmOf(w, ctx.mods);
    const interval = 60 / rpm;
    if (w.cooldown > 0) return;

    // Accumulator keeps sustained auto fire at exactly the stated RPM even
    // when dt doesn't divide evenly into the interval.
    fire(w, ctx);
    w.cooldown = interval;
    if (d.boltAction) w.boltCycle = Math.max(interval, 0.9);
  };

  function playDry(w, ctx) {
    if (Z.Audio && Z.Audio.ready) Z.Audio.play('gun_dryfire', { vol: 0.6 });
  }

  // -------------------------------------------------------------------------
  // Firing
  // -------------------------------------------------------------------------
  function fire(w, ctx) {
    const d = w.def;
    w.mag--;
    w.shotsThisTrigger++;
    w.lastFireTime = ctx.time || 0;

    // bloom grows fast then saturates
    w.bloom = Math.min(1, w.bloom + (d.class === 'lmg' ? 0.14 : 0.22));

    const spreadDeg = W.currentSpread(w, ctx);
    const pellets = d.pellets || 1;
    const hits = [];
    for (let p = 0; p < pellets; p++) {
      const dir = spreadDir(ctx.dir, spreadDeg, p === 0 && pellets === 1);
      if (d.projectile || d.class === 'launcher' || d.id === 'raygun') {
        spawnProjectile(w, ctx, dir);
      } else {
        const h = traceBullet(w, ctx, dir);
        if (h) hits.push(h);
      }
    }

    applyRecoil(w, ctx);

    // --- presentation ------------------------------------------------------
    const snd = SOUND[w.id] || 'gun_m1911';
    if (Z.Audio && Z.Audio.ready) {
      Z.Audio.play(snd, { pos: ctx.origin, vol: 1.0, rate: rng.range(0.97, 1.03) });
    }
    if (ctx.onShot) ctx.onShot({ weapon: w, hits, spread: spreadDeg });

    // camera kick + shake scale with the gun's weight
    const kick = M.clamp(d.recoil.vert / 3.5, 0.15, 1.4);
    Z.FX.shake(kick * 0.35, 0.09 + kick * 0.05);

    W.lastMuzzleFlashT = 0.045;
    w.flashT = 0.045;
    w.flashSeed = rng.f();
  }

  // Uniform-in-disc spread; the centre shot of a single-projectile weapon is
  // dead-centre when standing still and aimed, which is what "first shot
  // accuracy" means to a player.
  const _disc = [0, 0];
  const _right = [0, 0, 0], _up = [0, 0, 0], _out = [0, 0, 0];
  function spreadDir(dir, degrees, perfectIfTiny) {
    if (degrees <= 0.0001 || (perfectIfTiny && degrees < 0.05)) return dir;
    // build a basis around dir
    const ax = Math.abs(dir[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    M.cross3(_right, dir, ax); M.norm3(_right, _right);
    M.cross3(_up, _right, dir); M.norm3(_up, _up);
    rng.disc(_disc);
    const t = Math.tan(degrees * M.DEG);
    _out[0] = dir[0] + _right[0] * _disc[0] * t + _up[0] * _disc[1] * t;
    _out[1] = dir[1] + _right[1] * _disc[0] * t + _up[1] * _disc[1] * t;
    _out[2] = dir[2] + _right[2] * _disc[0] * t + _up[2] * _disc[1] * t;
    return M.norm3(_out, _out);
  }
  W.spreadDir = spreadDir;

  // -------------------------------------------------------------------------
  // Bullet trace — world + zombies, with penetration
  // -------------------------------------------------------------------------
  const MAX_RANGE = 90;
  function traceBullet(w, ctx, dir) {
    const d = w.def;
    let origin = [ctx.origin[0], ctx.origin[1], ctx.origin[2]];
    let remaining = d.penetration || 0;
    let damageScale = 1;
    let firstHit = null;
    const ignored = [];

    for (let pass = 0; pass <= remaining; pass++) {
      const worldHit = Z.Phys.raycast(origin, dir, MAX_RANGE);
      const worldT = worldHit ? worldHit.t : MAX_RANGE;

      const zHit = (Z.Zombies && Z.Zombies.rayHit)
        ? Z.Zombies.rayHit(origin, dir, worldT, ignored) : null;

      if (zHit) {
        const dist = M.dist3(ctx.origin, zHit.point);
        const falloff = rangeMult(d, dist);
        let dmg = d.damage * falloff * damageScale;
        const zone = zHit.zone;
        if (zone === 'head') dmg *= (d.headshotMult || 2);
        else if (zone === 'limb') dmg *= 0.85;
        const res = Z.Zombies.damage(zHit.zombie, dmg, {
          zone, dir, point: zHit.point, weapon: w, source: 'bullet',
        });
        Z.FX.blood(zHit.point, dir, 1, zone === 'head');
        if (!firstHit) firstHit = { zone, zombie: zHit.zombie, killed: res.killed, dmg, point: zHit.point };
        if (res.killed && zone === 'head') firstHit.headshotKill = true;
        // keep going only if the weapon penetrates
        ignored.push(zHit.zombie);
        damageScale *= 0.72;
        origin = [zHit.point[0] + dir[0] * 0.05, zHit.point[1] + dir[1] * 0.05, zHit.point[2] + dir[2] * 0.05];
        if (pass >= remaining) break;
        continue;
      }

      if (worldHit) {
        const mat = worldHit.brush.mat || 'concrete';
        Z.FX.impact(worldHit.point, worldHit.normal, impactKind(mat));
        // A shot through the gap in a barricade should chip the board, not
        // silently vanish — barricades are made of real brushes.
        Z.FX.tracer(muzzleWorld(ctx), worldHit.point, tracerCol(d), 0.02);
      } else {
        const far = [origin[0] + dir[0] * MAX_RANGE, origin[1] + dir[1] * MAX_RANGE, origin[2] + dir[2] * MAX_RANGE];
        Z.FX.tracer(muzzleWorld(ctx), far, tracerCol(d), 0.02);
      }
      break;
    }
    if (firstHit) {
      Z.FX.tracer(muzzleWorld(ctx), firstHit.point, tracerCol(w.def), 0.02);
    }
    return firstHit;
  }

  function muzzleWorld(ctx) {
    // approximate: just ahead and slightly right/below the eye
    return [
      ctx.origin[0] + ctx.dir[0] * 0.55,
      ctx.origin[1] + ctx.dir[1] * 0.55 - 0.08,
      ctx.origin[2] + ctx.dir[2] * 0.55,
    ];
  }
  W.muzzleWorld = muzzleWorld;

  function tracerCol(d) {
    if (d.id === 'raygun') return [0.45, 1.0, 0.4, 0.95];
    return [1.0, 0.83, 0.5, 0.55];
  }

  function rangeMult(d, dist) {
    const f = d.rangeFalloff;
    if (!f || dist <= f.start) return 1;
    if (dist >= f.end) return f.minMult;
    const t = (dist - f.start) / (f.end - f.start);
    return M.lerp(1, f.minMult, t);
  }
  W.rangeMult = rangeMult;

  const MAT_KIND = {
    wood_floor: 'wood', wood_wall: 'wood', wood_plank: 'wood', wood_stair: 'wood',
    ceiling_wood: 'wood', crate_wood: 'wood', window_frame: 'wood', board: 'wood',
    plaster_wall: 'plaster', sign_help: 'plaster', poster_faded: 'plaster',
    brick: 'brick', concrete: 'concrete', roof_shingle: 'concrete',
    metal_rusty: 'metal', barrel_metal: 'metal',
    dirt_ground: 'dirt', rubble: 'dirt', sandbag: 'dirt',
  };
  function impactKind(mat) { return MAT_KIND[mat] || 'concrete'; }
  W.impactKind = impactKind;

  // -------------------------------------------------------------------------
  // Continuous fire — M2 Flamethrower (damage-over-time, no discrete rounds)
  // -------------------------------------------------------------------------
  // Ticks accumulate in w.fireAccum exactly like a classic frame-independent
  // accumulator — that field already existed for this (see W.make), it was
  // just never wired up, which is how rpm:null + the generic cooldown math
  // ended up dividing by zero. Each tick burns exactly one unit of `mag`
  // (fuel, not rounds: 200 fuel / 10 ticks/sec = 20s of continuous fire per
  // tank) and applies Z.B damage to every zombie caught in a short cone, out
  // to rangeFalloff.end. B.dps() already returns the correct 250 dps for
  // this weapon (damage * ticksPerSec) — that figure only holds if a single
  // target is never damaged more than once per tick, which the dedupe below
  // guarantees.
  const FLAME_CONE_DEG = 14; // half-angle of the flame cone, in degrees
  const FLAME_SAMPLE_DIRS = (function () {
    const pts = [[0, 0]]; // dead centre, sampled first
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      pts.push([Math.cos(a), Math.sin(a)]);
    }
    return pts;
  }());
  const _flameHitThisTick = Object.create(null); // dedupe scratch, keyed by zombie id

  function fireContinuous(w, ctx) {
    const d = w.def;
    const tick = 1 / (d.ticksPerSec || 10);
    w.fireAccum += ctx.dt;
    let ticked = false;
    while (w.fireAccum >= tick && w.mag > 0) {
      w.fireAccum -= tick;
      w.mag--;
      flameTick(w, ctx);
      ticked = true;
    }
    // Ran dry mid-stream: don't bank a partial tick into the next tank, and
    // let the normal auto-reload branch (earlier in W.update, next frame)
    // pick it up exactly like any other weapon running empty.
    if (w.mag <= 0) w.fireAccum = 0;
    if (ticked) w.lastFireTime = ctx.time || 0;
  }

  function flameTick(w, ctx) {
    const d = w.def;
    const range = (d.rangeFalloff && d.rangeFalloff.end) || 6;
    const hits = [];
    if (Z.Zombies && Z.Zombies.rayHit) {
      let closest = null, closestT = Infinity;
      for (let i = 0; i < FLAME_SAMPLE_DIRS.length; i++) {
        const off = FLAME_SAMPLE_DIRS[i];
        const deg = FLAME_CONE_DEG * Math.hypot(off[0], off[1]);
        const dir = spreadDir(ctx.dir, deg, false);
        const zh = Z.Zombies.rayHit(ctx.origin, dir, range, null);
        if (!zh || _flameHitThisTick[zh.zombie.id]) continue;
        _flameHitThisTick[zh.zombie.id] = true;
        // Z.Zombies.rayHit reuses one mutable return object across calls, so
        // copy the point out now — the next sample in this same loop will
        // overwrite it.
        const point = [zh.point[0], zh.point[1], zh.point[2]];
        const dist = M.dist3(ctx.origin, point);
        let dmg = d.damage * rangeMult(d, dist);
        if (zh.zone === 'head') dmg *= (d.headshotMult || 1);
        else if (zh.zone === 'limb') dmg *= 0.85;
        const res = Z.Zombies.damage(zh.zombie, dmg, {
          zone: zh.zone, dir, point, weapon: w, source: 'flame',
        });
        hits.push({ zone: zh.zone, zombie: zh.zombie, killed: res.killed, dmg, point });
        if (dist < closestT) { closestT = dist; closest = point; }
      }
      for (const k in _flameHitThisTick) delete _flameHitThisTick[k];
      if (closest) Z.FX.blood(closest, ctx.dir, 0.6, false);
    }
    Z.Render.addLight(muzzleWorld(ctx), [1.0, 0.55, 0.15], 5.0, 1.4);
    const snd = SOUND[w.id] || 'gun_m1911';
    if (Z.Audio && Z.Audio.ready) {
      Z.Audio.play(snd, { pos: ctx.origin, vol: 0.7, rate: rng.range(0.97, 1.03) });
    }
    w.flashT = 0.045;
    w.flashSeed = rng.f();
    if (ctx.onShot) ctx.onShot({ weapon: w, hits, spread: FLAME_CONE_DEG });
  }

  // -------------------------------------------------------------------------
  // Projectiles — Ray Gun bolts and Panzerschreck rockets
  // -------------------------------------------------------------------------
  W.projectiles = [];

  function spawnProjectile(w, ctx, dir) {
    const d = w.def;
    const isRay = d.id === 'raygun';
    W.projectiles.push({
      pos: muzzleWorld(ctx),
      vel: [dir[0] * (isRay ? 42 : 34), dir[1] * (isRay ? 42 : 34), dir[2] * (isRay ? 42 : 34)],
      life: 4,
      radius: isRay ? 0.16 : 0.12,
      damage: d.damage,
      splash: isRay ? 3.0 : (d.splashRadius || 4.2),
      splashDamage: isRay ? d.damage * 0.6 : d.damage,
      selfDamage: !!d.selfDamageClose,
      kind: isRay ? 'ray' : 'rocket',
      owner: 'player',
      weapon: w,
      gravity: isRay ? 0 : 3.0,
    });
  }

  W.updateProjectiles = function (dt) {
    for (let i = W.projectiles.length - 1; i >= 0; i--) {
      const p = W.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) { W.projectiles.splice(i, 1); continue; }
      p.vel[1] -= p.gravity * dt;
      const step = [p.vel[0] * dt, p.vel[1] * dt, p.vel[2] * dt];
      const len = M.len3(step);
      const dir = [step[0] / len, step[1] / len, step[2] / len];

      let hitPoint = null;
      const wh = Z.Phys.raycast(p.pos, dir, len);
      let maxT = wh ? wh.t : len;
      const zh = (Z.Zombies && Z.Zombies.rayHit) ? Z.Zombies.rayHit(p.pos, dir, maxT, null) : null;
      if (zh) hitPoint = zh.point;
      else if (wh) hitPoint = wh.point;

      if (hitPoint) {
        detonate(p, hitPoint, zh ? zh.zombie : null);
        W.projectiles.splice(i, 1);
        continue;
      }
      p.pos[0] += step[0]; p.pos[1] += step[1]; p.pos[2] += step[2];

      // trail + light
      if (p.kind === 'ray') {
        Z.Render.addLight(p.pos, [0.35, 1.0, 0.35], 6.5, 1.6);
      } else {
        Z.Render.addLight(p.pos, [1.0, 0.6, 0.25], 5.0, 1.2);
        Z.FX.spawn(Z.FX.K.SMOKE, p.pos[0], p.pos[1], p.pos[2], 0, 0.3, 0,
          0.55, 0.08, 0.42, [0.5, 0.48, 0.45, 0.5], [0.3, 0.29, 0.28, 0], -0.2, 1.6, 0);
      }
    }
  };

  function detonate(p, point, directZombie) {
    Z.FX.explosion(point, p.kind === 'ray' ? 1.1 : 2.0);
    if (Z.Audio && Z.Audio.ready) {
      Z.Audio.play(p.kind === 'ray' ? 'powerup_nuke' : 'powerup_nuke',
        { pos: point, vol: p.kind === 'ray' ? 0.45 : 0.9, rate: p.kind === 'ray' ? 1.8 : 1.0 });
      Z.Audio.duck(0.5, 0.6);
    }
    Z.Render.addLight(point, [1, 0.8, 0.4], 14, 4);
    if (directZombie && Z.Zombies) {
      Z.Zombies.damage(directZombie, p.damage, { zone: 'torso', dir: p.vel, point, source: 'explosive' });
    }
    if (Z.Zombies && Z.Zombies.splash) {
      Z.Zombies.splash(point, p.splash, p.splashDamage, directZombie);
    }
    // selfDamageClose (Panzerschreck, Ray Gun): the balancing cost of the
    // two strongest wonder weapons. Same falloff shape as the player's own
    // grenade (see Z.Player.updateGrenades in 16_player.js, not edited here)
    // — linear to 0 at the blast radius — scaled by each weapon's own
    // selfDamageFraction (Z.B.WEAPONS), so it's a real, per-weapon-tunable
    // number instead of the declared-but-dead flag it used to be.
    // p.selfDamage is resolved once at spawn time from
    // weapon.def.selfDamageClose (see spawnProjectile above).
    if (p.selfDamage && p.owner === 'player' && Z.Player) {
      const plr = Z.Game && Z.Game.player;
      if (plr && !plr.dead) {
        const frac = (p.weapon && p.weapon.def.selfDamageFraction) || 0;
        if (frac > 0) {
          const dist = M.dist3(point, [plr.pos[0], plr.pos[1] + 0.9, plr.pos[2]]);
          if (dist < p.splash) {
            const dmg = Math.round(p.splashDamage * frac * (1 - dist / p.splash));
            if (dmg > 0) Z.Player.damage(plr, dmg, point, 'explosive');
          }
        }
      }
    }
    if (W.onExplosion) W.onExplosion(point, p);
  }
  W.detonate = detonate;

  // -------------------------------------------------------------------------
  // Recoil — an impulse into a spring the camera reads back
  // -------------------------------------------------------------------------
  W.recoil = { pitch: 0, yaw: 0, vPitch: 0, vYaw: 0, kickBack: 0, vKick: 0 };

  function applyRecoil(w, ctx) {
    const r = w.def.recoil;
    const adsK = M.lerp(1, 0.62, easeAds(w.ads));       // ADS tames the climb
    const crouchK = ctx.crouched ? 0.85 : 1;
    const k = adsK * crouchK;
    // Vertical climb is mostly consistent (learnable); horizontal is random.
    const n = Math.min(w.shotsThisTrigger, 8) / 8;
    W.recoil.vPitch += r.vert * k * (0.75 + n * 0.5) * 0.016;
    W.recoil.vYaw += rng.sym(r.horiz) * k * 0.02;
    W.recoil.vKick += 0.9 * k * (r.vert / 2.5);
  }

  W.updateRecoil = function (dt, recoveryScale) {
    const rec = W.recoil;
    // integrate
    rec.pitch += rec.vPitch;
    rec.yaw += rec.vYaw;
    rec.vPitch *= Math.exp(-26 * dt);
    rec.vYaw *= Math.exp(-26 * dt);
    // recover toward zero
    const rate = 7.5 * (recoveryScale || 1);
    rec.pitch = M.damp(rec.pitch, 0, rate, dt);
    rec.yaw = M.damp(rec.yaw, 0, rate * 0.8, dt);
    rec.kickBack += rec.vKick * dt * 6;
    rec.vKick *= Math.exp(-18 * dt);
    rec.kickBack = M.damp(rec.kickBack, 0, 11, dt);
  };
  W.resetRecoil = function () {
    const r = W.recoil;
    r.pitch = r.yaw = r.vPitch = r.vYaw = r.kickBack = r.vKick = 0;
  };

  // -------------------------------------------------------------------------
  // Reloading
  // -------------------------------------------------------------------------
  W.canReload = function (w) {
    return !w.reloading && w.reserve > 0 && w.mag < w.def.magSize;
  };

  W.beginReload = function (w, ctx) {
    if (!W.canReload(w)) return false;
    const d = w.def;
    const scale = reloadScale(ctx && ctx.mods);
    w.reloading = true;
    w.reloadT = 0;
    if (d.shellReload) {
      w.reloadStage = 'shell';
      w.reloadDur = (d.shellTime || 0.42) * scale;
    } else {
      w.reloadStage = 'full';
      w.reloadDur = (w.mag <= 0 ? d.reloadEmptyTime : d.reloadTime) * scale;
    }
    if (Z.Audio && Z.Audio.ready) {
      const s = RELOAD_SOUND[d.class];
      if (s) Z.Audio.play(s, { vol: 0.85, rate: 1 / Math.max(0.5, scale === 0.5 ? 1.7 : 1) });
    }
    return true;
  };

  function finishReloadStage(w, ctx) {
    const d = w.def;
    if (w.reloadStage === 'shell') {
      const room = d.magSize - w.mag;
      if (room > 0 && w.reserve > 0) { w.mag++; w.reserve--; }
      if (w.mag >= d.magSize || w.reserve <= 0) { w.reloading = false; w.reloadStage = ''; return; }
      w.reloadT = 0;
      w.reloadDur = (d.shellTime || 0.42) * reloadScale(ctx && ctx.mods);
      if (Z.Audio && Z.Audio.ready) Z.Audio.play('shell_insert', { vol: 0.7 });
      return;
    }
    const need = d.magSize - w.mag;
    const take = Math.min(need, w.reserve);
    w.mag += take;
    w.reserve -= take;
    w.reloading = false;
    w.reloadStage = '';
  }

  W.cancelReload = function (w) {
    if (w.reloading) { w.reloading = false; w.reloadStage = ''; w.reloadT = 0; }
  };

  W.giveAmmo = function (w, full) {
    const d = w.def;
    if (full) { w.reserve = d.maxReserve; w.mag = d.magSize; return true; }
    w.reserve = Math.min(d.maxReserve, w.reserve + Math.ceil(d.maxReserve * 0.5));
    return true;
  };
  W.maxAmmo = function (w) { w.reserve = w.def.maxReserve; return true; };

  // Progress 0..1 for the HUD ring.
  W.reloadProgress = (w) => (w.reloading ? M.clamp01(w.reloadT / Math.max(w.reloadDur, 0.001)) : 0);

  // -------------------------------------------------------------------------
  // Melee — the knife. Always lethal to a normal zombie, per WaW.
  // -------------------------------------------------------------------------
  W.melee = { t: 0, cooldown: 0 };

  W.tryMelee = function (ctx) {
    if (W.melee.cooldown > 0) return false;
    W.melee.cooldown = 1 / Z.B.PLAYER.meleeRate;
    W.melee.t = 0.001;
    if (Z.Audio && Z.Audio.ready) Z.Audio.play('plr_knife_swing', { vol: 0.8 });
    // Resolve slightly into the swing so the animation reads before the hit.
    W.meleePending = { at: 0.14, ctx };
    return true;
  };

  W.updateMelee = function (dt, ctx) {
    if (W.melee.cooldown > 0) W.melee.cooldown = Math.max(0, W.melee.cooldown - dt);
    if (W.melee.t > 0) {
      W.melee.t += dt;
      if (W.melee.t > 0.55) W.melee.t = 0;
    }
    if (W.meleePending) {
      W.meleePending.at -= dt;
      if (W.meleePending.at <= 0) {
        const c = ctx || W.meleePending.ctx;
        resolveMelee(c);
        W.meleePending = null;
      }
    }
  };

  function resolveMelee(ctx) {
    if (!Z.Zombies || !Z.Zombies.rayHit) return;
    const range = Z.B.PLAYER.meleeRange;
    // A short fat trace so the knife doesn't feel like a laser pointer.
    let best = null;
    for (const off of [[0, 0], [0.18, 0], [-0.18, 0], [0, 0.14], [0, -0.14]]) {
      const dir = spreadDir(ctx.dir, Math.hypot(off[0], off[1]) * 9, false);
      const h = Z.Zombies.rayHit(ctx.origin, dir, range, null);
      if (h && (!best || h.t < best.t)) best = h;
    }
    if (!best) return;
    if (Z.Audio && Z.Audio.ready) Z.Audio.play('plr_knife_hit', { pos: best.point, vol: 0.9 });
    Z.FX.blood(best.point, ctx.dir, 1.4, false);
    Z.Zombies.damage(best.zombie, Z.B.PLAYER.meleeAlwaysKills ? 1e9 : Z.B.PLAYER.meleeDamage, {
      zone: best.zone, dir: ctx.dir, point: best.point, source: 'melee',
    });
  }

  // -------------------------------------------------------------------------
  // Viewmodel state — everything Z.Models.poseGun needs
  // -------------------------------------------------------------------------
  W.view = {
    sway: [0, 0], swayV: [0, 0],
    bob: [0, 0], bobPhase: 0,
    landDip: 0, landDipV: 0,
    recoilPos: 0, recoilRot: 0,
    sprintPhase: 0,
    ads: 0, reloadPhase: 0, fireT: 1,
  };

  // dt-driven; `look` is the mouse delta in radians this tick.
  W.updateView = function (w, ctx) {
    const v = W.view;
    const dt = ctx.dt;

    // Sway lags the aim: a spring pulled by look input. This is the single
    // biggest contributor to a weapon feeling like it has mass.
    const targetX = M.clamp(-ctx.lookDX * 0.55, -0.09, 0.09);
    const targetY = M.clamp(ctx.lookDY * 0.55, -0.07, 0.07);
    const swayScale = M.lerp(1, 0.25, easeAds(w.ads));
    v.swayV[0] += (targetX * swayScale - v.sway[0]) * 42 * dt;
    v.swayV[1] += (targetY * swayScale - v.sway[1]) * 42 * dt;
    v.swayV[0] *= Math.exp(-11 * dt);
    v.swayV[1] *= Math.exp(-11 * dt);
    v.sway[0] += v.swayV[0] * dt;
    v.sway[1] += v.swayV[1] * dt;

    // Weapon bob — a figure-eight tied to footfall, killed when aiming.
    const moveFrac = M.clamp01(ctx.speed / Z.B.PLAYER.speedSprint);
    v.bobPhase += dt * (6.0 + moveFrac * 6.5) * (ctx.onGround ? moveFrac : 0);
    const bobAmp = moveFrac * 0.024 * M.lerp(1, 0.16, easeAds(w.ads));
    v.bob[0] = Math.sin(v.bobPhase) * bobAmp;
    v.bob[1] = -Math.abs(Math.cos(v.bobPhase)) * bobAmp * 0.85;

    // Landing dip
    v.landDipV -= v.landDip * 190 * dt;
    v.landDipV *= Math.exp(-9 * dt);
    v.landDip += v.landDipV * dt;

    v.ads = w.ads;
    v.sprintPhase = M.damp(v.sprintPhase, 1 - w.raised, 14, dt);
    v.reloadPhase = w.reloading ? M.clamp01(w.reloadT / Math.max(w.reloadDur, 0.001)) : 0;
    v.reloading = w.reloading;

    // Recoil visual — snappy out, slower back.
    const rec = W.recoil;
    v.recoilPos = M.damp(v.recoilPos, rec.kickBack * 0.035, 24, dt);
    v.recoilRot = M.damp(v.recoilRot, rec.pitch * 0.55, 20, dt);
    v.fireT = w.flashT > 0 ? 1 - (w.flashT / 0.045) : 1;
    if (w.flashT > 0) w.flashT = Math.max(0, w.flashT - dt);
    v.flashT = w.flashT;
    v.meleeT = W.melee.t;
    return v;
  };

  W.notifyLanded = function (impactSpeed) {
    const v = W.view;
    v.landDipV -= M.clamp(impactSpeed * 0.09, 0.05, 1.1);
  };

  W.reset = function () {
    W.projectiles.length = 0;
    W.resetRecoil();
    W.melee.t = 0; W.melee.cooldown = 0; W.meleePending = null;
    const v = W.view;
    v.sway[0] = v.sway[1] = v.swayV[0] = v.swayV[1] = 0;
    v.bob[0] = v.bob[1] = 0; v.bobPhase = 0;
    v.landDip = 0; v.landDipV = 0;
    v.recoilPos = 0; v.recoilRot = 0;
  };
}());
