// ---------------------------------------------------------------------------
// 19_econ.js — everything you spend points on, plus the barricades.
//
// Wall buys, the Mystery Box ritual, Perk-a-Cola machines, power-up drops and
// board repair all live here, along with the single "what am I looking at"
// interaction scan the HUD prompt is driven from.
// ---------------------------------------------------------------------------
(function () {
  const E = {};
  Z.Econ = E;
  const M = Z.M;
  const rng = Z.RNG.make(0xB0F5EED);

  let level = null;
  let player = null;

  E.powerups = [];
  E.box = null;
  E.machines = [];
  E.hums = [];

  const USE_RANGE = 2.6;
  const USE_DOT = 0.62;        // must be roughly facing it

  // -------------------------------------------------------------------------
  E.init = function (lv, plr) {
    level = lv;
    player = plr;
    E.powerups.length = 0;
    rng.reseed(0xB0F5EED);

    E.box = {
      spotIndex: rng.i(lv.boxSpots.length),
      state: 'idle',           // idle | opening | spinning | offering | closing | moving
      t: 0,
      uses: 0,
      offer: null,
      spinId: null,
      spinT: 0,
      teddy: false,
      fireSale: false,
    };
    E.box.pos = lv.boxSpots[E.box.spotIndex].pos.slice();
    E.box.yaw = lv.boxSpots[E.box.spotIndex].yaw;

    E.machines = lv.perkSpots.map((s) => ({
      id: s.id, pos: s.pos.slice(), yaw: s.yaw, room: s.room,
      cost: perkCost(s.id), purchases: 0, drinkT: 0,
    }));

    for (const w of lv.windows) { w.boards = w.maxBoards; w.tearer = null; }
    buildMeshes();
    return E;
  };

  function perkCost(id) {
    const p = Z.B.PERKS.find((x) => x.id === id);
    return p ? p.cost : 2000;
  }

  // -------------------------------------------------------------------------
  // Local fallback geometry, so the game is complete even if the model module
  // has nothing for a given prop.
  // -------------------------------------------------------------------------
  let plankMesh = null, boxMesh = null, machineMesh = null, orbMesh = null;

  function buildMeshes() {
    if (plankMesh) return;
    if (!Z.Render || !Z.Render.uploadMesh) return;

    let b = Z.Mesh.builder();
    b.setColor(1, 1, 1);
    b.box([-0.5, -0.5, -0.5], [0.5, 0.5, 0.5], { uvScale: 1 });
    plankMesh = Z.Render.uploadMesh(b.finish('wood_plank'));

    b = Z.Mesh.builder();
    b.box([-0.5, 0, -0.35], [0.5, 0.62, 0.35], { uvScale: 1 });
    boxMesh = Z.Render.uploadMesh(b.finish('mystery_box'));

    b = Z.Mesh.builder();
    b.box([-0.42, 0, -0.32], [0.42, 1.95, 0.32], { uvScale: 0.6 });
    machineMesh = Z.Render.uploadMesh(b.finish('metal_rusty'));

    b = Z.Mesh.builder();
    b.cyl(0, 0, 0.16, 0.16, -0.16, 0.16, 10, { uvScale: 1 });
    orbMesh = Z.Render.uploadMesh(b.finish('concrete'));
  }

  // -------------------------------------------------------------------------
  // Interaction scan
  // -------------------------------------------------------------------------
  // Returns the single best thing the player could act on right now, or null.
  E.findInteraction = function (p, eye, dir) {
    let best = null, bestScore = -1;

    const consider = (cand, pos) => {
      const dx = pos[0] - eye[0], dy = pos[1] - eye[1], dz = pos[2] - eye[2];
      const dist = Math.hypot(dx, dy, dz);
      if (dist > USE_RANGE) return;
      const dot = (dx * dir[0] + dy * dir[1] + dz * dir[2]) / Math.max(dist, 0.001);
      if (dot < USE_DOT) return;
      const score = dot * 2 - dist * 0.2;
      if (score > bestScore) { bestScore = score; best = cand; }
    };

    // --- wall buys and debris ---------------------------------------------
    for (const buy of level.buys) {
      if (buy.kind === 'debris' && buy.bought) continue;
      const pos = buy.pos;
      if (buy.kind === 'weapon') {
        const isGrenade = buy.id === Z.B.GRENADE.id;
        const held = !isGrenade && p.weapons.find((w) => w.id === buy.id);
        let cost, label;
        if (isGrenade) {
          cost = Z.B.GRENADE.wallCost;
          label = 'Buy ' + Z.B.GRENADE.name + ' [' + cost + ']';
          if (p.grenades >= Z.B.GRENADE.maxCount) continue;
        } else if (held) {
          cost = Z.B.ammoRefillCost(buy.id) || Math.round(buy.cost * 0.5);
          label = 'Buy ' + Z.W.def(buy.id).name + ' Ammo [' + cost + ']';
          if (held.reserve >= held.def.maxReserve) continue;
        } else {
          cost = buy.cost;
          label = 'Buy ' + Z.W.def(buy.id).name + ' [' + cost + ']';
        }
        consider({ kind: 'wallbuy', buy, cost, label, hold: false }, pos);
      } else if (buy.kind === 'debris') {
        consider({
          kind: 'debris', buy, cost: buy.cost,
          label: 'Clear Debris [' + buy.cost + ']', hold: false,
        }, pos);
      }
    }

    // --- perk machines -----------------------------------------------------
    for (const mch of E.machines) {
      if (p.perks[mch.id]) continue;
      const perk = Z.B.PERKS.find((x) => x.id === mch.id);
      let cost = mch.cost;
      // Solo Quick Revive doubles each time, as in the real game.
      if (mch.id === 'quickrevive' && perk && perk.soloPriceDoubles) {
        cost = mch.cost * Math.pow(2, mch.purchases);
      }
      consider({
        kind: 'perk', machine: mch, cost,
        label: 'Buy ' + (perk ? perk.name : mch.id) + ' [' + cost + ']', hold: false,
      }, [mch.pos[0], mch.pos[1] + 1.1, mch.pos[2]]);
    }

    // --- mystery box -------------------------------------------------------
    if (E.box.state === 'idle') {
      consider({
        kind: 'box', cost: Z.B.BOX.cost,
        label: 'Mystery Box [' + Z.B.BOX.cost + ']', hold: false,
      }, [E.box.pos[0], E.box.pos[1] + 0.7, E.box.pos[2]]);
    } else if (E.box.state === 'offering' && E.box.offer) {
      consider({
        kind: 'boxtake', cost: 0,
        label: 'Take ' + Z.W.def(E.box.offer).name, hold: false,
      }, [E.box.pos[0], E.box.pos[1] + 1.25, E.box.pos[2]]);
    }

    // --- barricades --------------------------------------------------------
    for (const w of level.windows) {
      if (w.boards >= w.maxBoards) continue;
      const pos = [w.pos[0], w.pos[1], w.pos[2]];
      const d = M.dist3(p.pos, w.repairFrom);
      if (d > 1.9) continue;
      consider({
        kind: 'repair', window: w, cost: 0,
        label: 'Hold to Rebuild Barricade', hold: true,
      }, pos);
    }

    return best;
  };

  // -------------------------------------------------------------------------
  // Using
  // -------------------------------------------------------------------------
  E.use = function (p, act) {
    if (!act) return false;
    switch (act.kind) {
      case 'wallbuy': return buyWall(p, act);
      case 'debris': return buyDebris(p, act);
      case 'perk': return buyPerk(p, act);
      case 'box': return buyBox(p, act);
      case 'boxtake': return takeBox(p);
      default: return false;
    }
  };

  function buyWall(p, act) {
    const buy = act.buy;
    if (!p.canAfford && !Z.Player.canAfford(p, act.cost)) { fail(); return false; }
    if (!Z.Player.spend(p, act.cost)) return false;
    if (buy.id === Z.B.GRENADE.id) {
      p.grenades = Z.B.GRENADE.maxCount;
      if (Z.Audio && Z.Audio.ready) Z.Audio.play('buy_ammo', { pos: buy.pos, vol: 0.8 });
      return true;
    }
    const held = p.weapons.find((w) => w.id === buy.id);
    if (held) {
      Z.W.giveAmmo(held, true);
      if (Z.Audio && Z.Audio.ready) Z.Audio.play('buy_ammo', { pos: buy.pos, vol: 0.8 });
    } else {
      Z.Player.giveWeapon(p, buy.id);
      if (Z.Audio && Z.Audio.ready) Z.Audio.play('buy_weapon', { pos: buy.pos, vol: 0.9 });
    }
    return true;
  }

  function buyDebris(p, act) {
    if (!Z.Player.spend(p, act.cost)) return false;
    const id = act.buy.id;
    Z.Level.removeDebris(id);
    // The world changed: rebuild collision, render chunks and navigation.
    Z.Phys.setLevel(Z.Level.level);
    Z.Render.loadLevel(Z.Level.level);
    Z.Nav.build(Z.Level.level);
    if (Z.Audio && Z.Audio.ready) Z.Audio.play('debris_clear', { pos: act.buy.pos, vol: 1.0 });
    Z.FX.splinters(act.buy.pos, [0, 1, 0], 22);
    Z.FX.shake(0.35, 0.5);
    if (E.onDebrisCleared) E.onDebrisCleared(id);
    return true;
  }

  function buyPerk(p, act) {
    if (!Z.Player.spend(p, act.cost)) return false;
    const mch = act.machine;
    mch.purchases++;
    mch.drinkT = 1.6;
    Z.Player.givePerk(p, mch.id);
    if (Z.Audio && Z.Audio.ready) {
      Z.Audio.play('perk_buy', { pos: mch.pos, vol: 0.9 });
      Z.Audio.play('perk_drink', { vol: 0.9, delay: 0.35 });
      const jingle = { juggernog: 'perk_jingle_jugg', speedcola: 'perk_jingle_speed',
        doubletap: 'perk_jingle_double', quickrevive: 'perk_jingle_revive' }[mch.id];
      if (jingle) Z.Audio.play(jingle, { pos: mch.pos, vol: 0.7 });
    }
    if (Z.HUD && Z.HUD.notify) Z.HUD.notify('perk', { id: mch.id });
    return true;
  }

  function fail() {
    if (Z.Audio && Z.Audio.ready) Z.Audio.play('buy_fail', { vol: 0.7 });
  }

  // -------------------------------------------------------------------------
  // Mystery Box
  // -------------------------------------------------------------------------
  function buyBox(p, act) {
    if (!Z.Player.spend(p, act.cost)) return false;
    const b = E.box;
    b.uses++;
    b.state = 'opening';
    b.t = 0;
    b.spinT = 0;
    // Teddy bear: only after a minimum number of uses, then a flat chance.
    b.teddy = b.uses > Z.B.BOX.teddyBearMinUses && rng.f() < Z.B.BOX.teddyBearChance;
    b.offer = b.teddy ? null : Z.B.rollBoxWeapon ? Z.B.rollBoxWeapon(rng.f()) : rollWeapon();
    if (Z.Audio && Z.Audio.ready) {
      Z.Audio.play('box_open', { pos: b.pos, vol: 0.95 });
      Z.Audio.play('box_jingle', { pos: b.pos, vol: 0.6, delay: 0.25 });
    }
    return true;
  }

  function rollWeapon() {
    const weights = Z.B.BOX.weights;
    let total = 0;
    for (const k in weights) total += weights[k];
    let r = rng.f() * total;
    for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
    return 'mp40';
  }

  function takeBox(p) {
    const b = E.box;
    if (!b.offer) return false;
    Z.Player.giveWeapon(p, b.offer);
    if (Z.Audio && Z.Audio.ready) Z.Audio.play('buy_weapon', { pos: b.pos, vol: 0.95 });
    b.offer = null;
    b.state = 'closing';
    b.t = 0;
    return true;
  }

  function updateBox(dt) {
    const b = E.box;
    b.t += dt;
    switch (b.state) {
      case 'opening':
        if (b.t > 0.55) { b.state = 'spinning'; b.t = 0; b.spinT = 0; }
        break;
      case 'spinning': {
        b.spinT += dt;
        // cycle the displayed weapon, slowing down as it settles
        const rate = M.lerp(14, 2.2, M.clamp01(b.spinT / 4.0));
        b.spinAccum = (b.spinAccum || 0) + dt * rate;
        if (b.spinAccum > 1) {
          b.spinAccum = 0;
          b.spinId = rollWeapon();
          if (Z.Audio && Z.Audio.ready) Z.Audio.play('box_spin', { pos: b.pos, vol: 0.35 });
        }
        if (b.spinT > 4.2) {
          if (b.teddy) {
            b.state = 'moving';
            b.t = 0;
            if (Z.Audio && Z.Audio.ready) Z.Audio.play('box_teddy', { pos: b.pos, vol: 1.0 });
          } else {
            b.state = 'offering';
            b.t = 0;
            b.spinId = b.offer;
            if (Z.Audio && Z.Audio.ready) Z.Audio.play('box_land', { pos: b.pos, vol: 0.9 });
          }
        }
        break;
      }
      case 'offering':
        // The weapon hangs there for a while; miss the window and it's gone.
        if (b.t > 11) { b.state = 'closing'; b.t = 0; b.offer = null; }
        break;
      case 'closing':
        if (b.t > 0.7) { b.state = 'idle'; b.t = 0; }
        if (b.t > 0.05 && !b.closeSfx) {
          b.closeSfx = true;
          if (Z.Audio && Z.Audio.ready) Z.Audio.play('box_close', { pos: b.pos, vol: 0.8 });
        }
        break;
      case 'moving':
        if (b.t > 2.2) {
          let next = rng.i(level.boxSpots.length);
          if (level.boxSpots.length > 1) {
            while (next === b.spotIndex) next = rng.i(level.boxSpots.length);
          }
          b.spotIndex = next;
          b.pos = level.boxSpots[next].pos.slice();
          b.yaw = level.boxSpots[next].yaw;
          b.state = 'idle';
          b.t = 0;
          b.uses = 0;
          b.teddy = false;
          if (E.onBoxMoved) E.onBoxMoved(b);
        }
        break;
      default:
        b.closeSfx = false;
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Barricade repair
  // -------------------------------------------------------------------------
  E.updateRepair = function (p, act, held, dt) {
    if (!act || act.kind !== 'repair' || !held) {
      p.repairProgress = 0;
      p.repairTarget = null;
      return false;
    }
    const w = act.window;
    if (p.repairTarget !== w) { p.repairTarget = w; p.repairProgress = 0; }
    p.repairProgress += dt;
    const per = Z.B.BARRICADE.repairTimePerBoard;
    if (p.repairProgress >= per) {
      p.repairProgress -= per;
      w.boards = Math.min(w.maxBoards, w.boards + 1);
      p.boardsRepaired++;
      Z.Player.award(p, Z.B.POINTS.repairBoard, 'repair');
      if (Z.Audio && Z.Audio.ready) {
        Z.Audio.play('board_repair', { pos: w.pos, vol: 0.9, rate: 0.95 + w.boards * 0.03 });
      }
      if (w.boards >= w.maxBoards) { p.repairProgress = 0; return true; }
    }
    return true;
  };

  // -------------------------------------------------------------------------
  // Power-ups
  // -------------------------------------------------------------------------
  const LIFETIME = 30, BLINK_AT = 5;

  E.maybeDrop = function (z, round) {
    if (Z.Rounds.powerupsThisRound >= 4) return null;
    // Drop rate ramps a little with the round, as the real game's does.
    const chance = 0.02 + Math.min(0.02, round * 0.0012);
    if (rng.f() > chance) return null;
    return E.dropPowerup(z.pos);
  };

  E.dropPowerup = function (at, forceId) {
    const defs = Z.B.POWERUPS;
    let id = forceId;
    if (!id) {
      let total = 0;
      for (const d of defs) total += d.weight;
      let r = rng.f() * total;
      for (const d of defs) { r -= d.weight; if (r <= 0) { id = d.id; break; } }
    }
    const def = defs.find((d) => d.id === id) || defs[0];
    const floor = Z.Phys.floorAt([at[0], at[1] + 1.0, at[2]], 4, 0.2);
    const pu = {
      id: def.id, def,
      pos: [at[0], (floor === null ? at[1] : floor) + 0.75, at[2]],
      t: 0, life: LIFETIME, taken: false, bob: rng.f() * 6,
    };
    E.powerups.push(pu);
    Z.Rounds.powerupsThisRound++;
    if (Z.Audio && Z.Audio.ready) Z.Audio.play('powerup_drop', { pos: pu.pos, vol: 0.8 });
    return pu;
  };

  E.instaKillT = 0;
  E.doublePointsT = 0;

  function updatePowerups(dt, p) {
    for (let i = E.powerups.length - 1; i >= 0; i--) {
      const pu = E.powerups[i];
      pu.t += dt;
      if (pu.t >= pu.life) { E.powerups.splice(i, 1); continue; }
      if (M.dist3(pu.pos, [p.pos[0], p.pos[1] + 0.9, p.pos[2]]) < 1.7) {
        grabPowerup(pu, p);
        E.powerups.splice(i, 1);
      }
    }
    if (E.instaKillT > 0) {
      E.instaKillT -= dt;
      if (E.instaKillT <= 0) { E.instaKillT = 0; Z.Zombies.instaKill = false; }
    }
    if (E.doublePointsT > 0) {
      E.doublePointsT = Math.max(0, E.doublePointsT - dt);
    }
  }

  function grabPowerup(pu, p) {
    if (Z.Audio && Z.Audio.ready) {
      Z.Audio.play('powerup_grab', { vol: 0.9 });
      Z.Audio.play('powerup_' + pu.id, { vol: 1.0 });
    }
    if (Z.HUD && Z.HUD.notify) Z.HUD.notify('powerup', { id: pu.id, name: pu.def.name });
    switch (pu.id) {
      case 'instakill':
        E.instaKillT = pu.def.duration;
        Z.Zombies.instaKill = true;
        break;
      case 'doublepoints':
        E.doublePointsT = pu.def.duration;
        break;
      case 'maxammo':
        for (const w of p.weapons) Z.W.maxAmmo(w);
        p.grenades = Z.B.GRENADE.maxCount;
        break;
      case 'nuke': {
        const n = Z.Zombies.killAll('nuke');
        Z.Player.award(p, pu.def.killPoints || 400, 'nuke');
        Z.FX.shake(0.9, 0.9);
        if (E.onNuke) E.onNuke(n);
        break;
      }
      case 'carpenter':
        for (const w of Z.Level.level.windows) w.boards = w.maxBoards;
        Z.Player.award(p, 200, 'carpenter');
        if (Z.Audio && Z.Audio.ready) Z.Audio.play('board_repair', { vol: 0.9 });
        break;
    }
  }

  E.pointsMultiplier = () => (E.doublePointsT > 0 ? 2 : 1);

  // -------------------------------------------------------------------------
  E.update = function (dt, p) {
    updateBox(dt);
    updatePowerups(dt, p);
    for (const m of E.machines) if (m.drinkT > 0) m.drinkT = Math.max(0, m.drinkT - dt);
  };

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  const mm = M.m4.create();

  E.render = function () {
    if (!plankMesh) buildMeshes();
    if (!plankMesh) return;

    // --- barricade boards --------------------------------------------------
    for (const w of level.windows) {
      for (let i = 0; i < w.boards; i++) {
        const s = w.boardSlots[i];
        if (!s) continue;
        M.m4.compose(mm, s.pos[0], s.pos[1], s.pos[2], s.yaw, 0, s.roll, s.len, s.w, s.t);
        Z.Render.drawMesh(plankMesh, mm, { mat: 'wood_plank' });
      }
    }

    // --- mystery box -------------------------------------------------------
    const b = E.box;
    const lidOpen = (b.state === 'opening') ? M.clamp01(b.t / 0.55)
      : (b.state === 'spinning' || b.state === 'offering') ? 1
        : (b.state === 'closing') ? 1 - M.clamp01(b.t / 0.7) : 0;
    if (b.state !== 'moving' || b.t < 1.6) {
      const boxProp = Z.Models && Z.Models.props && Z.Models.props.mystery_box;
      M.m4.compose(mm, b.pos[0], b.pos[1], b.pos[2], b.yaw, 0, 0, 1, 1, 1);
      Z.Render.drawMesh(boxProp ? boxProp.gpu || boxMesh : boxMesh, mm, { mat: 'mystery_box' });
      if (lidOpen > 0.02) {
        // shaft of light out of the open box
        Z.Render.addLight([b.pos[0], b.pos[1] + 1.0, b.pos[2]], [0.95, 0.85, 0.55], 5.5, 1.4 * lidOpen);
      }
    }
    // the weapon hovering above an open box
    if ((b.state === 'spinning' || b.state === 'offering') && (b.spinId || b.offer)) {
      const id = b.state === 'offering' ? b.offer : b.spinId;
      const gun = Z.Models && Z.Models.guns && Z.Models.guns[id];
      const y = b.pos[1] + 1.25 + Math.sin(Z.Render.time * 2.2) * 0.05;
      if (gun && gun.gpu) {
        M.m4.compose(mm, b.pos[0], y, b.pos[2], Z.Render.time * 1.4, 0, 0, 1, 1, 1);
        Z.Render.drawMesh(gun.gpu, mm, null);
      } else {
        M.m4.compose(mm, b.pos[0], y, b.pos[2], Z.Render.time * 1.4, 0, 0, 0.9, 0.22, 0.22);
        Z.Render.drawMesh(boxMesh, mm, { mat: 'gun_metal' });
      }
    }

    // --- perk machines -----------------------------------------------------
    for (const m of E.machines) {
      const prop = Z.Models && Z.Models.props && Z.Models.props['perk_machine_' + shortPerk(m.id)];
      M.m4.compose(mm, m.pos[0], m.pos[1], m.pos[2], m.yaw, 0, 0, 1, 1, 1);
      Z.Render.drawMesh(prop && prop.gpu ? prop.gpu : machineMesh, mm, { mat: 'metal_rusty' });
      // lit front panel
      M.m4.compose(mm, m.pos[0] + Math.sin(m.yaw) * 0.33, m.pos[1] + 1.15,
        m.pos[2] + Math.cos(m.yaw) * 0.33, m.yaw, 0, 0, 0.62, 0.78, 0.06);
      Z.Render.drawMesh(machineMesh, mm, { mat: panelMat(m.id), emissive: 0.75 });
      Z.Render.addLight([m.pos[0], m.pos[1] + 1.3, m.pos[2]], perkLight(m.id), 3.4, 0.6);
    }
  };

  function shortPerk(id) {
    return { juggernog: 'jugg', speedcola: 'speed', doubletap: 'doubletap', quickrevive: 'revive' }[id] || id;
  }
  function panelMat(id) {
    return { juggernog: 'perk_jugg', speedcola: 'perk_speed',
      doubletap: 'perk_doubletap', quickrevive: 'perk_revive' }[id] || 'perk_jugg';
  }
  function perkLight(id) {
    return { juggernog: [1.0, 0.18, 0.16], speedcola: [0.25, 1.0, 0.35],
      doubletap: [1.0, 0.72, 0.18], quickrevive: [0.42, 0.72, 1.0] }[id] || [1, 1, 1];
  }

  // Power-ups are billboards so they read from any angle, like the real ones.
  E.renderPowerups = function () {
    if (!E.powerups.length) return;
    const t = Z.Render.time;
    // Group by icon so each type is one additive draw call.
    const byIcon = Object.create(null);
    for (const pu of E.powerups) {
      (byIcon[pu.id] = byIcon[pu.id] || []).push(pu);
    }
    for (const id in byIcon) {
      Z.Render.beginQuads();
      for (const pu of byIcon[id]) {
        const remain = pu.life - pu.t;
        // blink out over the last few seconds, exactly like the real drops
        const alpha = remain < BLINK_AT ? ((Math.sin(remain * 18) > 0) ? 1 : 0.15) : 1;
        const y = pu.pos[1] + Math.sin(t * 2.4 + pu.bob) * 0.07;
        const size = 0.42 + Math.sin(t * 3.1 + pu.bob) * 0.02;
        Z.Render.billboard([pu.pos[0], y, pu.pos[2]], [size, size], [1, 1, 1, alpha]);
        Z.Render.addLight([pu.pos[0], y, pu.pos[2]], powerupLight(id), 4.5, 0.9 * alpha);
      }
      Z.Render.flushQuads('powerup_icon_' + id, true, 0.4);
    }
  };

  function powerupLight(id) {
    return { instakill: [1.0, 0.25, 0.2], doublepoints: [1.0, 0.9, 0.35],
      maxammo: [0.4, 1.0, 0.45], nuke: [1.0, 0.75, 0.3],
      carpenter: [0.7, 0.55, 0.35] }[id] || [1, 1, 1];
  }

  E.stats = function () {
    return {
      box: { state: E.box.state, uses: E.box.uses, spot: E.box.spotIndex, offer: E.box.offer },
      powerups: E.powerups.length,
      instaKill: E.instaKillT, doublePoints: E.doublePointsT,
    };
  };
}());
