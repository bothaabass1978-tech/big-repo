// ---------------------------------------------------------------------------
// 16_player.js — the player: movement, camera, health, inventory, interaction.
//
// Movement is deliberately CoD-shaped rather than Quake-shaped: very high
// ground acceleration (you reach full speed in ~2 ticks), strong friction,
// almost no air control, and a hard speed cap per stance. That combination is
// what makes the character feel *planted* — you stop when you let go, and
// strafing never builds speed.
// ---------------------------------------------------------------------------
(function () {
  const P = {};
  Z.Player = P;
  const M = Z.M;
  const C = Z.C;

  const GROUND_ACCEL = 62;
  const AIR_ACCEL = 7.5;
  const GROUND_FRICTION = 13.5;
  const AIR_FRICTION = 0.15;

  P.create = function (level) {
    const start = level.playerStart;
    const p = {
      pos: [start.pos[0], start.pos[1], start.pos[2]],
      vel: [0, 0, 0],
      radius: C.PLAYER_RADIUS,
      height: C.PLAYER_HEIGHT,
      stepUp: C.STEP_UP,
      onGround: true,
      wasOnGround: true,

      yaw: start.yaw, pitch: 0,
      eyeH: C.EYE_STAND,
      crouched: false,
      wantCrouch: false,
      sprinting: false,
      sprintMeter: 1,
      sprintLocked: false,

      health: Z.B.PLAYER.health,
      maxHealth: Z.B.PLAYER.health,
      lastDamageTime: -99,
      dead: false,
      downed: false,
      bleedout: 0,
      downs: 0,

      points: Z.B.PRICES.startingPoints,
      pointsDisplay: Z.B.PRICES.startingPoints,

      weapons: [Z.W.make(Z.B.PRICES.startingWeapon)],
      slot: 0,
      swapT: 0,
      swapTo: -1,
      grenades: Z.B.GRENADE.startCount,
      hasGrenades: true,

      perks: {},           // id -> true
      perkOrder: [],
      reviveUses: 0,

      // stats
      shotsFired: 0, hits: 0, headshots: 0, kills: 0, boardsRepaired: 0,
      timeAlive: 0,

      // presentation
      bobPhase: 0,
      viewBob: [0, 0],
      landDip: 0, landDipV: 0,
      damageDirs: [],
      lastFootstep: 0,
      stepDist: 0,
      breathT: 0,

      // interaction
      interaction: null,
      useHeld: 0,
      repairTarget: null,
      repairProgress: 0,
    };
    return p;
  };

  P.weapon = (p) => p.weapons[p.slot];
  P.hasPerk = (p, id) => !!p.perks[id];

  P.mods = function (p) {
    return {
      doubleTap: !!p.perks.doubletap,
      speedCola: !!p.perks.speedcola,
      juggernog: !!p.perks.juggernog,
    };
  };

  // -------------------------------------------------------------------------
  // Look
  // -------------------------------------------------------------------------
  const lookDelta = [0, 0];
  P.applyLook = function (p, dx, dy, settings, dt) {
    const w = P.weapon(p);
    const adsScale = M.lerp(1, settings.adsSensScale, Z.W.easeAds(w ? w.ads : 0));
    const sens = settings.sensitivity * 0.0022 * adsScale;
    p.yaw -= dx * sens;
    p.pitch -= dy * sens * (settings.invertY ? -1 : 1);
    p.pitch = M.clamp(p.pitch, -C.PITCH_LIMIT, C.PITCH_LIMIT);
    p.yaw = M.wrapAng(p.yaw);
    lookDelta[0] = dx * sens;
    lookDelta[1] = dy * sens;
    return lookDelta;
  };

  // Final view angles include recoil, which the player can "pull down" against.
  P.viewYaw = (p) => p.yaw + Z.W.recoil.yaw;
  P.viewPitch = (p) => M.clamp(p.pitch + Z.W.recoil.pitch, -C.PITCH_LIMIT, C.PITCH_LIMIT);

  const fwd = [0, 0, 0];
  P.forward = function (p, out) {
    return M.fromAngles(out || fwd, P.viewYaw(p), P.viewPitch(p));
  };
  P.eye = function (p, out) {
    out = out || [0, 0, 0];
    const sh = Z.FX.shakeOffset();
    out[0] = p.pos[0] + p.viewBob[0] + sh[0];
    out[1] = p.pos[1] + p.eyeH + p.viewBob[1] + p.landDip + sh[1];
    out[2] = p.pos[2] + sh[2];
    return out;
  };

  // -------------------------------------------------------------------------
  // Movement
  // -------------------------------------------------------------------------
  P.move = function (p, input, dt) {
    const B = Z.B.PLAYER;
    const w = P.weapon(p);

    // --- stance ------------------------------------------------------------
    const wantCrouch = input.crouch;
    if (wantCrouch !== p.crouched) {
      // Only stand up if there's headroom.
      if (!wantCrouch) {
        if (!Z.Phys.boxSolid(p.pos, p.radius, C.PLAYER_HEIGHT)) p.crouched = false;
      } else {
        p.crouched = true;
      }
    }
    p.height = p.crouched ? C.PLAYER_HEIGHT_CROUCH : C.PLAYER_HEIGHT;
    const targetEye = p.crouched ? C.EYE_CROUCH : C.EYE_STAND;
    p.eyeH = M.damp(p.eyeH, targetEye, 16, dt);

    // --- sprint ------------------------------------------------------------
    const moveMag = Math.hypot(input.move[0], input.move[1]);
    const wantSprint = input.sprint && moveMag > 0.3 && input.move[1] > 0.25
      && !p.crouched && !w.reloading && w.ads < 0.2 && !p.downed;
    if (wantSprint && !p.sprintLocked && p.sprintMeter > 0.02) {
      p.sprinting = true;
      p.sprintMeter = Math.max(0, p.sprintMeter - dt / B.sprintDuration);
      if (p.sprintMeter <= 0) { p.sprinting = false; p.sprintLocked = true; }
    } else {
      p.sprinting = false;
      // recovers slower than it drains, so sprint is a resource
      p.sprintMeter = Math.min(1, p.sprintMeter + dt / (B.sprintDuration * B.sprintRegenRatio));
      if (p.sprintMeter > 0.32) p.sprintLocked = false;
    }

    // --- desired speed -----------------------------------------------------
    let speed = B.speedWalk;
    if (p.downed) speed = 1.15;
    else if (p.crouched) speed = B.speedCrouch;
    else if (p.sprinting) speed = B.speedSprint;
    if (w.ads > 0.05 && !p.sprinting) speed = M.lerp(speed, B.speedAds, Z.W.easeAds(w.ads));
    if (w.reloading) speed *= 0.94;
    speed *= (p.speedMult || 1);

    // --- wish direction in world space ------------------------------------
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    // forward = (-sin, 0, -cos), right = (cos, 0, -sin)
    let wx = (-sy) * input.move[1] + cy * input.move[0];
    let wz = (-cy) * input.move[1] + (-sy) * input.move[0];
    const wl = Math.hypot(wx, wz);
    if (wl > 0.0001) { wx /= wl; wz /= wl; }
    const wish = Math.min(1, moveMag) * speed;

    // --- accelerate --------------------------------------------------------
    const accel = p.onGround ? GROUND_ACCEL : AIR_ACCEL;
    if (wl > 0.0001) {
      // project current velocity onto the wish direction (Quake-style accel,
      // clamped so you can never exceed the stance cap)
      const cur = p.vel[0] * wx + p.vel[2] * wz;
      const add = Math.min(wish - cur, accel * dt * (p.onGround ? 1 : 0.55));
      if (add > 0) { p.vel[0] += wx * add; p.vel[2] += wz * add; }
    }

    // --- friction ----------------------------------------------------------
    const spd = Math.hypot(p.vel[0], p.vel[2]);
    if (spd > 0.0001) {
      const f = p.onGround ? GROUND_FRICTION : AIR_FRICTION;
      const drop = Math.max(spd, 2.0) * f * dt;
      const k = Math.max(0, spd - drop) / spd;
      // Don't fight the player's own input: only bleed off the component that
      // isn't wished for. This is what stops CoD movement feeling icy.
      if (wl < 0.0001) { p.vel[0] *= k; p.vel[2] *= k; }
      else if (spd > wish) { p.vel[0] *= k; p.vel[2] *= k; }
    }

    // --- jump --------------------------------------------------------------
    if (input.jump && p.onGround && !p.crouched && !p.downed) {
      p.vel[1] = B.jumpVel;
      p.onGround = false;
      if (Z.Audio && Z.Audio.ready) Z.Audio.play('plr_jump', { vol: 0.5 });
    }

    // --- gravity + integrate ----------------------------------------------
    p.vel[1] -= C.GRAVITY * dt;
    if (p.vel[1] < -55) p.vel[1] = -55;
    p.wasOnGround = p.onGround;
    const fallSpeed = -p.vel[1];
    Z.Phys.move(p, dt);

    if (!p.wasOnGround && p.onGround) {
      // landed
      const hard = fallSpeed > 9;
      p.landDipV -= M.clamp(fallSpeed * 0.011, 0.01, 0.16);
      Z.W.notifyLanded(fallSpeed);
      if (Z.Audio && Z.Audio.ready) {
        Z.Audio.play(hard ? 'plr_land_hard' : 'plr_land', { vol: hard ? 0.85 : 0.5 });
      }
      if (hard) Z.FX.shake(M.clamp(fallSpeed * 0.03, 0.1, 0.6), 0.22);
      // Falls in this map are short by design — no fall damage under 6 m.
      if (fallSpeed > 17) P.damage(p, Math.round((fallSpeed - 17) * 7), null, 'fall');
    }

    // --- view bob + footsteps ---------------------------------------------
    const hspd = Math.hypot(p.vel[0], p.vel[2]);
    const moveFrac = M.clamp01(hspd / B.speedSprint);
    if (p.onGround) {
      p.bobPhase += dt * (5.6 + moveFrac * 6.2) * moveFrac;
      p.stepDist += hspd * dt;
    }
    const bobAmp = moveFrac * (p.crouched ? 0.012 : 0.026) * M.lerp(1, 0.3, Z.W.easeAds(w.ads));
    p.viewBob[0] = Math.sin(p.bobPhase) * bobAmp * 0.6;
    p.viewBob[1] = -Math.abs(Math.cos(p.bobPhase)) * bobAmp;

    const stride = p.sprinting ? 2.05 : (p.crouched ? 1.5 : 1.75);
    if (p.onGround && p.stepDist > stride) {
      p.stepDist = 0;
      P.footstep(p);
    }

    // landing dip spring
    p.landDipV -= p.landDip * 210 * dt;
    p.landDipV *= Math.exp(-10 * dt);
    p.landDip += p.landDipV * dt;

    p.timeAlive += dt;
  };

  const FOOT_MAT = {
    wood: 'plr_step_wood', plaster: 'plr_step_wood', brick: 'plr_step_concrete',
    concrete: 'plr_step_concrete', metal: 'plr_step_concrete', dirt: 'plr_step_dirt',
  };
  P.footstep = function (p) {
    if (!Z.Audio || !Z.Audio.ready) return;
    let kind = 'wood';
    if (p.groundBrush) kind = Z.W.impactKind(p.groundBrush.mat || 'wood_floor');
    const base = FOOT_MAT[kind] || 'plr_step_wood';
    const n = 1 + ((Math.random() * 4) | 0);
    Z.Audio.play(base + '_' + n, { pos: p.pos, vol: p.crouched ? 0.28 : 0.55, rate: 0.94 + Math.random() * 0.12 });
  };

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------
  P.effectiveMaxHealth = function (p) {
    const jug = Z.B.getPerk ? Z.B.getPerk('juggernog') : null;
    if (p.perks.juggernog) return (jug && jug.maxHealth) || 250;
    return Z.B.PLAYER.health;
  };

  // How many zombies are close enough to be swinging at the player right now.
  // Counted from the live list rather than passed in, so the caller stays a
  // single call and every damage source gets the same crowding rule.
  function attackersNear(p) {
    const list = Z.Zombies && Z.Zombies.list;
    if (!list) return 1;
    const reach = Z.B.PLAYER.zombieAttackRange || 1.72;
    const r2 = (reach + 0.5) * (reach + 0.5);
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      if (z.dying) continue;
      const dx = z.pos[0] - p.pos[0], dy = z.pos[1] - p.pos[1], dz = z.pos[2] - p.pos[2];
      if (dx * dx + dy * dy + dz * dz <= r2) n++;
    }
    return n < 1 ? 1 : n;
  }

  P.damage = function (p, amount, fromPos, source) {
    if (p.dead || amount <= 0) return false;
    if (p.godMode) return false;
    // Two zombies striking on the same tick would take a full-health player
    // straight to downed with nothing they could have done, so hits are spaced
    // out. A flat global cooldown does that but flattens the horde: being
    // boxed in by eight is then exactly as dangerous as being caught by two,
    // which removes the reason to fear a corner. Instead the spacing tightens
    // with the size of the group actually on you, down to a floor that keeps
    // every hit individually reactable.
    const now = p.clock || 0;
    if (source === 'zombie') {
      const B = Z.B.PLAYER;
      const crowd = attackersNear(p);
      const floor = B.damageCooldownMin || B.damageCooldown * 0.55;
      const gap = Math.max(floor, B.damageCooldown - (crowd - 1) * 0.035);
      if ((now - (p.lastHitTime || -99)) < gap) return false;
      p.lastHitTime = now;
    }
    if (p.downed) {
      // Already down: further hits accelerate the bleedout. This shares the
      // spacing above, so a swarm does drain the clock faster than a straggler
      // — but the drain per hit is small enough that the 45 s window is a
      // window, not a formality.
      p.bleedout = Math.max(0, p.bleedout - 1.1);
      return true;
    }
    p.health -= amount;
    p.lastDamageTime = p.clock || 0;
    if (fromPos) {
      const ang = Math.atan2(fromPos[0] - p.pos[0], fromPos[2] - p.pos[2]);
      p.damageDirs.push({ ang: M.wrapAng(ang + p.yaw), t: 1.2 });
      if (p.damageDirs.length > 6) p.damageDirs.shift();
    }
    Z.FX.shake(0.55, 0.28);
    if (Z.Audio && Z.Audio.ready) {
      Z.Audio.play('plr_hurt_' + (1 + ((Math.random() * 3) | 0)), { vol: 0.9 });
    }
    if (p.health <= 0) {
      p.health = 0;
      P.goDown(p);
    }
    return true;
  };

  P.goDown = function (p) {
    if (p.downed || p.dead) return;
    p.downed = true;
    p.downs++;
    p.bleedout = Z.B.PLAYER.bleedoutTime;
    p.crouched = true;
    p.sprinting = false;
    Z.W.cancelReload(P.weapon(p));
    if (Z.Audio && Z.Audio.ready) Z.Audio.play('plr_downed', { vol: 1.0 });
    // Solo rules: you lose your perks and drop back to the starting pistol.
    if (P.onDowned) P.onDowned(p);
  };

  P.selfRevive = function (p) {
    if (!p.downed || p.reviveUses <= 0) return false;
    p.reviveUses--;
    p.downed = false;
    p.health = P.effectiveMaxHealth(p);
    p.bleedout = 0;
    p.crouched = false;
    if (Z.Audio && Z.Audio.ready) Z.Audio.play('plr_revive', { vol: 1.0 });
    return true;
  };

  P.die = function (p) {
    if (p.dead) return;
    p.dead = true;
    p.downed = false;
    if (Z.Audio && Z.Audio.ready) Z.Audio.play('game_over', { vol: 1.0 });
    if (P.onDeath) P.onDeath(p);
  };

  P.updateHealth = function (p, dt) {
    p.clock = (p.clock || 0) + dt;
    for (let i = p.damageDirs.length - 1; i >= 0; i--) {
      p.damageDirs[i].t -= dt;
      if (p.damageDirs[i].t <= 0) p.damageDirs.splice(i, 1);
    }
    if (p.downed) {
      p.bleedout -= dt;
      if (p.bleedout <= 0) P.die(p);
      return;
    }
    if (p.dead) return;
    const B = Z.B.PLAYER;
    const maxH = P.effectiveMaxHealth(p);
    if (p.health < maxH && (p.clock - p.lastDamageTime) > B.regenDelay) {
      p.health = Math.min(maxH, p.health + B.regenRate * (maxH / 100) * dt);
    }
    // ragged breathing under a third health
    const lowFrac = p.health / maxH;
    if (lowFrac < 0.34) {
      p.breathT -= dt;
      if (p.breathT <= 0) {
        p.breathT = M.lerp(0.55, 1.4, lowFrac / 0.34);
        if (Z.Audio && Z.Audio.ready) Z.Audio.play('plr_heartbeat', { vol: 0.55 * (1 - lowFrac) });
      }
    }
  };

  P.healthFrac = (p) => M.clamp01(p.health / P.effectiveMaxHealth(p));

  // -------------------------------------------------------------------------
  // Points
  // -------------------------------------------------------------------------
  P.award = function (p, amount, reason) {
    if (amount === 0) return;
    p.points += amount;
    if (p.points < 0) p.points = 0;
    if (Z.HUD && Z.HUD.notify) Z.HUD.notify('points', { amount, reason });
  };
  P.canAfford = (p, cost) => p.points >= cost;
  P.spend = function (p, cost) {
    if (p.points < cost) {
      if (Z.Audio && Z.Audio.ready) Z.Audio.play('buy_fail', { vol: 0.7 });
      return false;
    }
    p.points -= cost;
    if (Z.HUD && Z.HUD.notify) Z.HUD.notify('points', { amount: -cost, reason: 'spend' });
    return true;
  };

  // -------------------------------------------------------------------------
  // Inventory
  // -------------------------------------------------------------------------
  P.MAX_WEAPONS = 2;

  P.giveWeapon = function (p, id, opts) {
    // Already carrying it? Just refill.
    for (let i = 0; i < p.weapons.length; i++) {
      if (p.weapons[i].id === id) {
        Z.W.giveAmmo(p.weapons[i], true);
        p.slot = i;
        return { replaced: false, refilled: true };
      }
    }
    const w = Z.W.make(id, opts);
    if (p.weapons.length < P.MAX_WEAPONS) {
      p.weapons.push(w);
      p.slot = p.weapons.length - 1;
      return { replaced: false, refilled: false };
    }
    const old = p.weapons[p.slot];
    p.weapons[p.slot] = w;
    return { replaced: true, refilled: false, dropped: old.id };
  };

  P.swapSlot = function (p) {
    if (p.weapons.length < 2 || p.swapT > 0) return false;
    const next = (p.slot + 1) % p.weapons.length;
    p.swapTo = next;
    p.swapT = p.weapons[p.slot].def.swapTime;
    Z.W.cancelReload(P.weapon(p));
    return true;
  };

  P.updateSwap = function (p, dt) {
    if (p.swapT > 0) {
      p.swapT -= dt;
      if (p.swapT <= 0 && p.swapTo >= 0) {
        p.slot = p.swapTo;
        p.swapTo = -1;
        p.swapT = 0;
        const w = P.weapon(p);
        w.drawT = w.def.swapTime * 0.5;
        w.ads = 0;
      }
    }
  };

  P.givePerk = function (p, id) {
    if (p.perks[id]) return false;
    p.perks[id] = true;
    p.perkOrder.push(id);
    if (id === 'juggernog') {
      // Jug tops you up to the new maximum immediately, as in the real game.
      p.health = P.effectiveMaxHealth(p);
    }
    if (id === 'quickrevive') p.reviveUses++;
    return true;
  };

  P.clearPerks = function (p) {
    p.perks = {};
    p.perkOrder.length = 0;
    p.reviveUses = 0;
    if (p.health > Z.B.PLAYER.health) p.health = Z.B.PLAYER.health;
  };

  // -------------------------------------------------------------------------
  // Grenades
  // -------------------------------------------------------------------------
  P.grenadesLive = [];

  P.throwGrenade = function (p, origin, dir, power) {
    if (p.grenades <= 0) return false;
    p.grenades--;
    const G = Z.B.GRENADE;
    const sp = 15 * (power === undefined ? 1 : power);
    P.grenadesLive.push({
      pos: [origin[0] + dir[0] * 0.4, origin[1] + dir[1] * 0.4, origin[2] + dir[2] * 0.4],
      vel: [dir[0] * sp, dir[1] * sp + 2.0, dir[2] * sp],
      fuse: G.fuseTime,
      radius: 0.09,
      spin: [Math.random() * 6, Math.random() * 6, Math.random() * 6],
    });
    return true;
  };

  P.updateGrenades = function (p, dt) {
    const G = Z.B.GRENADE;
    for (let i = P.grenadesLive.length - 1; i >= 0; i--) {
      const g = P.grenadesLive[i];
      g.fuse -= dt;
      g.vel[1] -= C.GRAVITY * dt;
      const ent = { pos: g.pos, vel: g.vel, radius: 0.09, height: 0.16, onGround: false, stepUp: 0 };
      const before = [g.vel[0], g.vel[1], g.vel[2]];
      Z.Phys.move(ent, dt);
      // crude bounce: if an axis got zeroed by the collision, reflect it
      for (let k = 0; k < 3; k++) {
        if (Math.abs(g.vel[k]) < 0.0001 && Math.abs(before[k]) > 0.6) {
          g.vel[k] = -before[k] * 0.34;
        }
      }
      if (ent.onGround) { g.vel[0] *= 0.72; g.vel[2] *= 0.72; }
      if (g.fuse <= 0) {
        Z.FX.explosion(g.pos, 2.2);
        if (Z.Audio && Z.Audio.ready) {
          Z.Audio.play('powerup_nuke', { pos: g.pos, vol: 0.95, rate: 1.25 });
          Z.Audio.duck(0.55, 0.5);
        }
        Z.Render.addLight(g.pos, [1, 0.8, 0.42], 15, 4.5);
        if (Z.Zombies && Z.Zombies.splash) Z.Zombies.splash(g.pos, G.radius, G.damage, null);
        // The player is not immune to their own grenade.
        const d = M.dist3(g.pos, [p.pos[0], p.pos[1] + 0.9, p.pos[2]]);
        if (d < G.radius) {
          P.damage(p, Math.round(G.damage * 0.35 * (1 - d / G.radius)), g.pos, 'explosive');
        }
        P.grenadesLive.splice(i, 1);
      }
    }
  };

  P.reset = function (p, level) {
    const fresh = P.create(level);
    for (const k in fresh) p[k] = fresh[k];
    P.grenadesLive.length = 0;
    Z.W.reset();
  };

  P.stats = function (p) {
    const acc = p.shotsFired > 0 ? (p.hits / p.shotsFired) : 0;
    return {
      kills: p.kills, headshots: p.headshots, shotsFired: p.shotsFired,
      hits: p.hits, accuracy: acc, downs: p.downs,
      timeSurvived: p.timeAlive, boardsRepaired: p.boardsRepaired,
    };
  };
}());
