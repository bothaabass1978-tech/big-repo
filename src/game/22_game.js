// ---------------------------------------------------------------------------
// 22_game.js — state machine, fixed-timestep loop, render order, HUD feed.
// ---------------------------------------------------------------------------
(function () {
  const G = {};
  Z.Game = G;
  const M = Z.M;
  const C = Z.C;

  G.mode = 'boot';        // boot | loading | menu | playing | paused | gameover
  G.level = null;
  G.player = null;
  G.time = 0;
  G.frame = 0;
  G.fps = 60;

  let viewCanvas = null, hudCanvas = null, uiRoot = null;
  let accumulator = 0;
  let lastNow = 0;
  let running = false;
  const gunGpu = Object.create(null);
  let armsGpu = null;

  const eye = [0, 0, 0];
  const dir = [0, 0, 0];
  const look = [0, 0];

  // Screen-effect state the post pass and HUD both read.
  const screen = { blood: 0, flash: 0, fade: 1, hurtPulse: 0 };
  const hudPointsDelta = [];
  const hitmarker = { t: 99, crit: false };

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  G.boot = function (opts) {
    viewCanvas = opts.view;
    hudCanvas = opts.hud;
    uiRoot = opts.ui;

    G.mode = 'loading';
    Z.Input.init(viewCanvas);
    Z.GL.init(viewCanvas);
    G.resize();

    // --- procedural content ------------------------------------------------
    Z.Tex.build();
    Z.W.init();
    if (Z.Models && Z.Models.build) {
      try { Z.Models.build(); } catch (e) { console.warn('models build failed:', e); }
    }
    Z.Render.init(Z.GL.gl);

    G.level = Z.Level.build();
    G.level.navBounds = { min: [-20, 0, -18], max: [20, 0, 18] };
    Z.Phys.setLevel(G.level);
    Z.Render.loadLevel(G.level);
    Z.Nav.build(G.level);

    G.player = Z.Player.create(G.level);
    Z.Zombies.init(G.level, G.player);
    Z.Zombies.uploadModels();
    Z.Rounds.init(G.level, G.player);
    Z.Econ.init(G.level, G.player);

    Z.HUD.init(hudCanvas);
    G.resize();

    wireCallbacks();

    Z.Menu.init(uiRoot, {
      onStart: () => G.startRun(),
      onResume: () => G.resume(),
      onRestart: () => G.startRun(),
      onQuit: () => G.toMenu(),
      onSettingsChange: (s) => G.applySettings(s),
    });
    G.applySettings(Z.Menu.settings);

    G.mode = 'menu';
    Z.Menu.show('main');
    running = true;
    lastNow = nowMs();
    requestAnimationFrame(tick);
    window.addEventListener('resize', G.resize);
    return G;
  };

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  G.resize = function () {
    const w = window.innerWidth, h = window.innerHeight;
    Z.GL.resize(w, h, (Z.Render.quality && Z.Render.quality.scale) || 1);
    if (Z.Render.resize) Z.Render.resize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (hudCanvas) {
      hudCanvas.width = Math.round(w * dpr);
      hudCanvas.height = Math.round(h * dpr);
      if (Z.HUD.resize) Z.HUD.resize(w, h, dpr);
    }
  };

  G.applySettings = function (s) {
    if (!s) return;
    Z.Input.sensitivity = s.sensitivity;
    Z.Input.invertY = !!s.invertY;
    Z.Input.adsSensScale = s.adsSensScale;
    Z.Render.camera.fov = s.fov || C.FOV;
    Z.Render.quality.grain = s.grain !== false;
    Z.Render.quality.aberration = s.aberration !== false;
    if (Z.Audio && Z.Audio.ready) {
      Z.Audio.setMasterVolume(s.volMaster === undefined ? 1 : s.volMaster);
      Z.Audio.setBusVolume('sfx', s.volSfx === undefined ? 1 : s.volSfx);
      Z.Audio.setBusVolume('music', s.volMusic === undefined ? 0.7 : s.volMusic);
      Z.Audio.setBusVolume('ambient', s.volAmbient === undefined ? 0.8 : s.volAmbient);
    }
  };

  function wireCallbacks() {
    Z.Zombies.onKill = function (z, info) {
      const p = G.player;
      const mult = Z.Econ.pointsMultiplier();
      let pts;
      if (info.source === 'melee') pts = Z.B.POINTS.meleeKill;
      else if (info.source === 'explosive' || info.source === 'nuke') pts = Z.B.POINTS.explosiveKill;
      else if (info.headshot) pts = Z.B.POINTS.headshotKill;
      else pts = Z.B.POINTS.kill;
      if (info.source !== 'nuke') Z.Player.award(p, pts * mult, 'kill');
      p.kills++;
      if (info.headshot) p.headshots++;
      Z.Rounds.notifyKill();
      Z.Econ.maybeDrop(z, Z.Rounds.round);
    };

    Z.Player.onDowned = function (p) {
      // Solo rules: you lose your perks the moment you go down.
      Z.Player.clearPerks(p);
      G.setMode('playing');   // still playing, just crawling
    };
    Z.Player.onDeath = function () {
      G.gameOver();
    };
    Z.Rounds.onRoundStart = function (n) {
      if (Z.HUD.notify) Z.HUD.notify('round', { round: n });
    };
  }

  // -------------------------------------------------------------------------
  // Run lifecycle
  // -------------------------------------------------------------------------
  G.startRun = function () {
    if (Z.Audio && !Z.Audio.ready) {
      try { Z.Audio.init(); } catch (e) { console.warn('audio init failed', e); }
      G.applySettings(Z.Menu.settings);
    }
    // Reset the world.
    G.level = Z.Level.build();
    G.level.navBounds = { min: [-20, 0, -18], max: [20, 0, 18] };
    Z.Phys.setLevel(G.level);
    Z.Render.loadLevel(G.level);
    Z.Nav.build(G.level);

    G.player = Z.Player.create(G.level);
    Z.Zombies.init(G.level, G.player);
    Z.Zombies.uploadModels();
    Z.Rounds.init(G.level, G.player);
    Z.Econ.init(G.level, G.player);
    Z.FX.reset();
    Z.W.reset();
    Z.HUD.reset();
    wireCallbacks();

    hudPointsDelta.length = 0;
    hitmarker.t = 99;
    screen.blood = 0; screen.flash = 0; screen.fade = 1; screen.hurtPulse = 0;

    G.mode = 'playing';
    Z.Menu.hide();
    Z.Input.lock();

    if (Z.Audio && Z.Audio.ready) {
      if (G.ambWind && G.ambWind.stop) G.ambWind.stop(0.2);
      G.ambWind = Z.Audio.loop('amb_wind', { vol: 0.55 });
      if (G.music && G.music.stop) G.music.stop(0.2);
      G.music = Z.Audio.loop('music_dread', { vol: 0.5 });
    }
  };

  G.setMode = function (m) { G.mode = m; };

  G.pause = function () {
    if (G.mode !== 'playing') return;
    G.mode = 'paused';
    Z.Input.unlock();
    Z.Menu.show('pause');
    if (Z.Audio && Z.Audio.ready) Z.Audio.setBusVolume('sfx', 0.25);
  };
  G.resume = function () {
    if (G.mode !== 'paused') return;
    G.mode = 'playing';
    Z.Menu.hide();
    Z.Input.lock();
    G.applySettings(Z.Menu.settings);
  };
  G.toMenu = function () {
    G.mode = 'menu';
    Z.Input.unlock();
    Z.Menu.show('main');
    Z.Zombies.clear();
    if (G.ambWind && G.ambWind.stop) { G.ambWind.stop(0.4); G.ambWind = null; }
    if (G.music && G.music.stop) { G.music.stop(0.4); G.music = null; }
  };
  G.gameOver = function () {
    if (G.mode === 'gameover') return;
    G.mode = 'gameover';
    Z.Rounds.stop();
    Z.Input.unlock();
    const p = G.player;
    const st = Z.Player.stats(p);
    Z.Menu.setStats({
      round: Z.Rounds.round, kills: st.kills, headshots: st.headshots,
      accuracy: st.accuracy, shotsFired: st.shotsFired, pointsEarned: p.points,
      timeSurvived: st.timeSurvived, downs: st.downs,
    });
    if (G.music && G.music.stop) { G.music.stop(1.5); G.music = null; }
    // The HUD draws the stats screen; the menu takes over after the fade.
    G.gameOverT = 0;
  };

  // -------------------------------------------------------------------------
  // Main loop
  // -------------------------------------------------------------------------
  function tick() {
    if (!running) return;
    requestAnimationFrame(tick);
    const n = nowMs();
    let dt = (n - lastNow) / 1000;
    lastNow = n;
    if (dt > C.MAX_FRAME_DT) dt = C.MAX_FRAME_DT;
    G.fps = M.lerp(G.fps, 1 / Math.max(dt, 0.0001), 0.08);
    G.frame++;

    Z.Input.update();
    handleGlobalKeys();

    if (G.mode === 'playing' || G.mode === 'gameover') {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= C.FIXED_DT && steps < 8) {
        fixedStep(C.FIXED_DT);
        accumulator -= C.FIXED_DT;
        steps++;
      }
      if (steps >= 8) accumulator = 0;   // don't spiral
    }

    G.time += dt;
    Z.FX.update(dt);
    render(dt);
    Z.Input.postUpdate();
  }

  function handleGlobalKeys() {
    if (Z.Input.actPressed('pause')) {
      if (G.mode === 'playing') G.pause();
      else if (G.mode === 'paused') G.resume();
    }
    // Clicking the canvas re-acquires pointer lock after an accidental escape.
    if (G.mode === 'playing' && !Z.Input.locked && Z.Input.mbPressed(0)) Z.Input.lock();
  }

  // -------------------------------------------------------------------------
  // Fixed-rate simulation
  // -------------------------------------------------------------------------
  function fixedStep(dt) {
    const p = G.player;
    if (!p) return;

    const locked = Z.Input.locked;
    const w = Z.Player.weapon(p);

    // --- look ---------------------------------------------------------------
    let dx = 0, dy = 0;
    if (locked && G.mode === 'playing') {
      Z.Input.takeMouse(look);
      dx = look[0]; dy = look[1];
      const gl = Z.Input.gamepadLook([0, 0], dt);
      dx += gl[0]; dy += gl[1];
    }
    const lookRad = Z.Player.applyLook(p, dx, dy, Z.Menu.settings, dt);

    // --- input snapshot -----------------------------------------------------
    const alive = !p.dead;
    const canAct = alive && G.mode === 'playing' && !p.downed;
    const input = {
      move: [0, 0],
      jump: false, crouch: false, sprint: false,
    };
    if (alive && G.mode === 'playing') {
      Z.Input.moveAxis(input.move);
      input.jump = Z.Input.act('jump') || Z.Input.gpButton(0);
      input.crouch = (Z.Menu.settings.toggleCrouch ? p.wantCrouch : Z.Input.act('crouch'))
        || Z.Input.gpButton(1);
      if (Z.Menu.settings.toggleCrouch && Z.Input.actPressed('crouch')) {
        p.wantCrouch = !p.wantCrouch;
        input.crouch = p.wantCrouch;
      }
      input.sprint = Z.Input.act('sprint') || Z.Input.gpButton(10);
      if (p.downed) { input.jump = false; input.sprint = false; input.crouch = true; }
    }

    Z.Player.move(p, input, dt);
    Z.Player.updateSwap(p, dt);
    Z.Player.updateHealth(p, dt);
    Z.Player.updateGrenades(p, dt);

    // --- solo Quick Revive --------------------------------------------------
    if (p.downed && p.reviveUses > 0) {
      p.selfReviveT = (p.selfReviveT || 0) + dt;
      if (p.selfReviveT > 5.0) { Z.Player.selfRevive(p); p.selfReviveT = 0; }
    } else if (!p.downed) {
      p.selfReviveT = 0;
    }

    // --- weapon -------------------------------------------------------------
    Z.Player.eye(p, eye);
    Z.Player.forward(p, dir);

    const wantFire = canAct && p.swapT <= 0
      && (Z.Input.mb(0) || Z.Input.gpAxis(7) > 0.4 || Z.Input.gpButton(7));
    const wantAds = canAct && (Z.Menu.settings.toggleAds ? p.wantAds
      : (Z.Input.mb(2) || Z.Input.gpButton(6)));
    if (Z.Menu.settings.toggleAds && canAct && Z.Input.mbPressed(2)) p.wantAds = !p.wantAds;

    const speed = Math.hypot(p.vel[0], p.vel[2]);
    const wctx = {
      origin: eye, dir, yaw: p.yaw, pitch: p.pitch,
      speed, crouched: p.crouched, onGround: p.onGround, sprinting: p.sprinting,
      mods: Z.Player.mods(p),
      wantFire, wantAds,
      wantReload: canAct && (Z.Input.actPressed('reload') || Z.Input.gpPressed(2)),
      dt, time: G.time, player: p,
      lookDX: lookRad[0], lookDY: lookRad[1],
      onShot: onShot,
    };
    Z.W.update(w, wctx);
    Z.W.updateRecoil(dt, Z.Player.hasPerk(p, 'juggernog') ? 1.0 : 1.0);
    Z.W.updateProjectiles(dt);
    Z.W.updateMelee(dt, wctx);
    Z.W.updateView(w, wctx);

    if (canAct && (Z.Input.actPressed('melee') || Z.Input.gpPressed(9))) Z.W.tryMelee(wctx);
    if (canAct && (Z.Input.actPressed('swap') || Z.Input.gpPressed(3))) Z.Player.swapSlot(p);
    if (canAct && (Z.Input.actPressed('grenade') || Z.Input.gpButton(5))
      && !p.grenadeThrown) {
      p.grenadeThrown = true;
      Z.Player.throwGrenade(p, eye, dir, 1);
    }
    if (!Z.Input.act('grenade')) p.grenadeThrown = false;

    // --- interaction --------------------------------------------------------
    const act = canAct ? Z.Econ.findInteraction(p, eye, dir) : null;
    G.interaction = act;
    const useHeld = canAct && (Z.Input.act('use') || Z.Input.gpButton(2));
    if (act && act.hold) {
      Z.Econ.updateRepair(p, act, useHeld, dt);
    } else {
      Z.Econ.updateRepair(p, null, false, dt);
      if (act && (Z.Input.actPressed('use') || Z.Input.gpPressed(2))) Z.Econ.use(p, act);
    }
    // Downed players can still self-revive by holding use if they own the perk.
    if (p.downed && p.reviveUses > 0 && useHeld) p.selfReviveT += dt * 1.5;

    // --- world --------------------------------------------------------------
    Z.Zombies.update(dt, { paused: false });
    Z.Rounds.update(dt);
    Z.Econ.update(dt, p);

    // --- camera -------------------------------------------------------------
    const cam = Z.Render.camera;
    Z.Player.eye(p, cam.pos);
    cam.yaw = Z.Player.viewYaw(p);
    cam.pitch = Z.Player.viewPitch(p);
    // subtle roll when strafing; sells the weight of the character
    const strafe = (p.vel[0] * Math.cos(p.yaw) - p.vel[2] * Math.sin(p.yaw));
    cam.roll = M.damp(cam.roll, M.clamp(-strafe * 0.006, -0.03, 0.03), 8, dt);
    cam.fov = Z.W.fovFor(w, Z.Menu.settings.fov || C.FOV);
    if (p.downed) cam.pos[1] = p.pos[1] + 0.45;

    // --- screen effects -----------------------------------------------------
    const hf = Z.Player.healthFrac(p);
    screen.blood = M.damp(screen.blood, M.clamp01(1 - hf), 6, dt);
    screen.hurtPulse = M.damp(screen.hurtPulse, p.downed ? 0.7 : M.clamp01((1 - hf) * 0.9), 5, dt);
    screen.fade = M.damp(screen.fade, G.mode === 'gameover' ? 1 : 0, 2.2, dt);
    screen.flash = Math.max(0, screen.flash - dt * 4);

    // hud timers
    hitmarker.t += dt;
    for (let i = hudPointsDelta.length - 1; i >= 0; i--) {
      hudPointsDelta[i].t += dt;
      if (hudPointsDelta[i].t > 1.1) hudPointsDelta.splice(i, 1);
    }
    p.pointsDisplay = M.damp(p.pointsDisplay, p.points, 9, dt);

    if (Z.Audio && Z.Audio.ready) {
      Z.Audio.listener(cam.pos, M.fromAngles([0, 0, 0], cam.yaw, cam.pitch), [0, 1, 0]);
    }

    if (G.mode === 'gameover') {
      G.gameOverT = (G.gameOverT || 0) + dt;
      if (G.gameOverT > 7.5 && !Z.Menu.visible) Z.Menu.show('gameover');
    }
  }

  // Called by the weapon system after every shot.
  function onShot(info) {
    const p = G.player;
    p.shotsFired++;
    const mw = Z.W.muzzleWorld({ origin: eye, dir });
    Z.FX.muzzleFlash(mw, dir, 1);
    Z.Render.addLight(mw, [1.0, 0.82, 0.45], 8.5, 3.2);
    screen.flash = Math.min(0.10, screen.flash + 0.05);
    // brass
    const right = [Math.cos(p.yaw), 0, -Math.sin(p.yaw)];
    Z.FX.shell([mw[0] + right[0] * 0.12, mw[1] + 0.02, mw[2] + right[2] * 0.12],
      [right[0] * 2.2 + dir[0], 1.9, right[2] * 2.2 + dir[2]],
      info.weapon.def.class === 'shotgun');

    const mult = Z.Econ.pointsMultiplier();
    let anyHit = false, crit = false;
    for (const h of info.hits) {
      anyHit = true;
      if (h.zone === 'head') crit = true;
      if (!h.killed) Z.Player.award(p, Z.B.POINTS.hit * mult, 'hit');
    }
    if (anyHit) {
      p.hits++;
      hitmarker.t = 0;
      hitmarker.crit = crit;
      if (Z.Audio && Z.Audio.ready) {
        Z.Audio.play(crit ? 'hitmarker_crit' : 'hitmarker', { vol: 0.5 });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  function render(dt) {
    if (!Z.GL.gl) return;
    Z.Render.beginFrame(dt);

    if (G.mode === 'menu' || G.mode === 'loading') {
      // Slow drifting camera over the level behind the main menu.
      const cam = Z.Render.camera;
      const t = G.time * 0.06;
      cam.pos[0] = Math.sin(t) * 5.5;
      cam.pos[1] = 2.1 + Math.sin(t * 0.7) * 0.4;
      cam.pos[2] = Math.cos(t) * 5.5 + 1.0;
      cam.yaw = -t + Math.PI;
      cam.pitch = -0.06;
      cam.roll = 0;
      cam.fov = 62;
    }

    Z.Render.beginScene();
    Z.Render.drawWorld();
    Z.Econ.render();
    Z.Zombies.render();
    Z.Zombies.renderShadows();
    Z.FX.render();
    Z.Econ.renderPowerups();
    renderViewmodel(dt);

    Z.Render.post({
      vignette: 0.52 + screen.blood * 0.22,
      grain: 0.55,
      aberration: 0.45 + screen.blood * 0.7,
      exposure: 1.0,
      fade: G.mode === 'gameover' ? M.clamp01(screen.fade) : 0,
      flash: screen.flash,
      saturation: M.lerp(0.78, 0.32, screen.blood),
      hurtPulse: screen.hurtPulse,
    });

    if (Z.HUD && Z.HUD.draw) {
      try { Z.HUD.draw(G.hudState(), dt); } catch (e) { console.warn('hud', e); }
    }
  }

  const vmM = Z.M.m4.create();
  function renderViewmodel(dt) {
    if (G.mode !== 'playing' && G.mode !== 'gameover') return;
    const p = G.player;
    if (!p || p.downed) return;
    const w = Z.Player.weapon(p);
    if (!Z.Models || !Z.Models.guns) return;
    const gun = Z.Models.guns[w.id] || Z.Models.guns[remapGun(w.id)];
    if (!gun || !gun.mesh) return;

    if (!gunGpu[w.id]) gunGpu[w.id] = Z.Render.uploadMesh(gun.mesh);
    if (!armsGpu && Z.Models.arms) armsGpu = Z.Render.uploadMesh(Z.Models.arms);

    Z.Render.beginViewmodel();
    if (Z.Models.poseGun) {
      Z.Models.poseGun(vmM, w.id, Z.W.view);
    } else {
      Z.M.m4.compose(vmM, 0.16, -0.16, -0.36, 0, 0, 0, 1, 1, 1);
    }
    Z.Render.drawMesh(gunGpu[w.id], vmM, null);
    if (armsGpu) Z.Render.drawMesh(armsGpu, vmM, { mat: 'hands' });
    Z.Render.endViewmodel();
  }

  // Some ids differ between the model set and the balance table.
  function remapGun(id) {
    return { m1a1_carbine: 'carbine', db_shotgun: 'dbshotgun', sawed_off: 'sawnoff',
      trench_gun: 'trenchgun', m1919: 'browning', m2_flamethrower: 'flamethrower' }[id] || id;
  }

  // -------------------------------------------------------------------------
  // HUD state snapshot
  // -------------------------------------------------------------------------
  const PERK_HUD = { juggernog: 'jugg', speedcola: 'speed', doubletap: 'doubletap', quickrevive: 'quickrevive' };

  G.hudState = function () {
    const p = G.player;
    if (!p) return { mode: G.mode };
    const w = Z.Player.weapon(p);
    const st = Z.Player.stats(p);

    const powerups = [];
    if (Z.Econ.instaKillT > 0) powerups.push({ id: 'instakill', t: Z.Econ.instaKillT });
    if (Z.Econ.doublePointsT > 0) powerups.push({ id: 'doublepoints', t: Z.Econ.doublePointsT });

    const damageDir = [];
    for (const d of p.damageDirs) damageDir.push({ ang: d.ang, t: 1.2 - d.t });

    const act = G.interaction;
    let prompt = null;
    if (act) {
      prompt = {
        text: act.hold ? act.label : act.label,
        cost: act.cost,
        affordable: act.cost <= 0 || p.points >= act.cost,
        hold: !!act.hold,
        progress: act.hold ? M.clamp01(p.repairProgress / Z.B.BARRICADE.repairTimePerBoard) : 0,
      };
    }

    return {
      mode: p.dead ? 'gameover' : (p.downed ? 'downed' : (G.mode === 'paused' ? 'paused' : G.mode)),
      round: Z.Rounds.round,
      roundPhase: Z.Rounds.phase,
      roundTimer: Z.Rounds.timeToNextRound(),
      points: p.points,
      pointsDelta: hudPointsDelta,
      health: p.health,
      maxHealth: Z.Player.effectiveMaxHealth(p),
      lowHealth: Z.Player.healthFrac(p) < 0.34,
      damageDir,
      weapon: {
        id: w.id, name: w.def.name, mag: w.mag, magSize: w.def.magSize,
        reserve: w.reserve, reloading: w.reloading, ads: w.ads,
        firemode: w.def.fireMode,
      },
      weapons: p.weapons.map((x) => ({ id: x.id, name: x.def.name, mag: x.mag, reserve: x.reserve })),
      slot: p.slot,
      grenades: p.grenades,
      perks: p.perkOrder.map((id) => PERK_HUD[id] || id),
      powerups,
      prompt,
      hitmarker: { t: hitmarker.t, crit: hitmarker.crit },
      crosshairSpread: Z.W.currentSpread(w, {
        speed: Math.hypot(p.vel[0], p.vel[2]), crouched: p.crouched, onGround: p.onGround,
      }) / 8,
      zombiesAlive: Z.Zombies.countAlive(),
      zombiesRemaining: Z.Rounds.zombiesRemaining(),
      kills: p.kills,
      headshots: p.headshots,
      downs: p.downs,
      downedTimer: p.downed ? p.bleedout : undefined,
      stats: {
        shotsFired: st.shotsFired, hits: st.hits, accuracy: st.accuracy,
        timeAlive: st.timeSurvived,
      },
      fps: G.fps,
      draws: Z.GL.stats.draws,
      voices: (Z.Audio && Z.Audio.stats) ? (Z.Audio.stats().voices || 0) : 0,
      debug: !!G.debugHud,
      screen: { blood: screen.blood, flash: screen.flash, fade: screen.fade },
    };
  };

  // HUD point-gain floaters are pushed from Z.Player.award via Z.HUD.notify;
  // mirror them into our own list so the roll-up animation has data.
  const origNotify = null;
  G.pushPointsDelta = function (v, crit) {
    hudPointsDelta.push({ v, t: 0, crit: !!crit });
    if (hudPointsDelta.length > 8) hudPointsDelta.shift();
  };

  // -------------------------------------------------------------------------
  // Debug API used by the headless harness
  // -------------------------------------------------------------------------
  G.debug = {
    stats() {
      return {
        mode: G.mode, fps: G.fps,
        round: Z.Rounds.stats(),
        zombies: Z.Zombies.stats(),
        player: G.player ? {
          pos: G.player.pos.slice(), health: G.player.health, points: G.player.points,
          weapon: Z.Player.weapon(G.player).id,
          mag: Z.Player.weapon(G.player).mag,
          reserve: Z.Player.weapon(G.player).reserve,
          downed: G.player.downed, dead: G.player.dead,
          kills: G.player.kills, headshots: G.player.headshots,
        } : null,
        render: Z.Render.stats(),
        fx: Z.FX.stats(),
        econ: Z.Econ.stats(),
        nav: Z.Nav.stats,
      };
    },
    setRound(n) { Z.Rounds.setRound(n); },
    giveWeapon(id) { Z.Player.giveWeapon(G.player, id); },
    givePoints(n) { G.player.points += n; },
    givePerk(id) { Z.Player.givePerk(G.player, id); },
    teleport(x, y, z) { G.player.pos[0] = x; G.player.pos[1] = y; G.player.pos[2] = z; },
    openAll() {
      Z.Level.removeDebris('stairs_west');
      Z.Level.removeDebris('stairs_east');
      Z.Phys.setLevel(Z.Level.level);
      Z.Render.loadLevel(Z.Level.level);
      Z.Nav.build(Z.Level.level);
    },
    godMode(on) { G.player.godMode = on !== false; },
    killAll() { return Z.Zombies.killAll('debug'); },
    dropPowerup(id) { return Z.Econ.dropPowerup(G.player.pos, id); },
    // Advance the simulation without waiting for real frames.
    sim(seconds) {
      const steps = Math.round(seconds / C.FIXED_DT);
      for (let i = 0; i < steps; i++) fixedStep(C.FIXED_DT);
      return G.debug.stats();
    },
    setMode(m) { G.mode = m; },
    hudState() { return G.hudState(); },
  };
}());
