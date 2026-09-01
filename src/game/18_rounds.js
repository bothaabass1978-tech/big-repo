// ---------------------------------------------------------------------------
// 18_rounds.js — the round director.
//
// Owns the round counter, the spawn budget, the drip-feed of zombies through
// the barricades, and the pacing beats between rounds. The rhythm is the point:
// a hard silence, the round sting, then the first shuffling silhouette at a
// window — and the gap between rounds shrinking as the night goes on.
// ---------------------------------------------------------------------------
(function () {
  const Rd = {};
  Z.Rounds = Rd;
  const M = Z.M;
  const rng = Z.RNG.make(0x0FF17ADD);

  const PHASE_INTRO = 'intro';
  const PHASE_ACTIVE = 'active';
  const PHASE_BETWEEN = 'between';

  let level = null;
  let player = null;

  Rd.round = 0;
  Rd.phase = PHASE_BETWEEN;
  Rd.phaseT = 0;
  Rd.toSpawn = 0;
  Rd.spawnedThisRound = 0;
  Rd.totalThisRound = 0;
  Rd.killsThisRound = 0;
  Rd.spawnTimer = 0;
  Rd.powerupsThisRound = 0;
  Rd.running = false;

  // How long the game holds its breath.
  const INTRO_TIME = 4.2;     // round sting + the walk-up before the first spawn
  const BETWEEN_TIME = 7.0;   // the classic breathing room to buy and re-board

  Rd.init = function (lv, plr) {
    level = lv;
    player = plr;
    Rd.round = 0;
    Rd.phase = PHASE_BETWEEN;
    Rd.phaseT = BETWEEN_TIME - 2.0;   // short first wait so the game starts promptly
    Rd.toSpawn = 0;
    Rd.spawnedThisRound = 0;
    Rd.totalThisRound = 0;
    Rd.killsThisRound = 0;
    Rd.powerupsThisRound = 0;
    Rd.running = true;
    return Rd;
  };

  Rd.start = function () { Rd.running = true; };
  Rd.stop = function () { Rd.running = false; };

  // -------------------------------------------------------------------------
  Rd.update = function (dt) {
    if (!Rd.running) return;
    Rd.phaseT += dt;

    switch (Rd.phase) {
      case PHASE_BETWEEN:
        if (Rd.phaseT >= BETWEEN_TIME) beginRound(Rd.round + 1);
        break;

      case PHASE_INTRO:
        if (Rd.phaseT >= INTRO_TIME) {
          Rd.phase = PHASE_ACTIVE;
          Rd.phaseT = 0;
          Rd.spawnTimer = 0;
        }
        break;

      case PHASE_ACTIVE:
        updateSpawning(dt);
        if (Rd.spawnedThisRound >= Rd.totalThisRound && Z.Zombies.countAlive() === 0) {
          endRound();
        }
        break;
    }
  };

  function beginRound(n) {
    Rd.round = n;
    Rd.phase = PHASE_INTRO;
    Rd.phaseT = 0;
    Rd.totalThisRound = Z.B.roundZombieCount(n, 1);
    Rd.spawnedThisRound = 0;
    Rd.killsThisRound = 0;
    Rd.powerupsThisRound = 0;
    Rd.spawnTimer = 0;

    if (Z.Audio && Z.Audio.ready) {
      Z.Audio.play(n === 1 ? 'round_start' : 'round_start', { vol: 1.0 });
      Z.Audio.duck(0.35, 1.4);
      if (Z.Audio.musicIntensity) Z.Audio.musicIntensity(M.clamp01((n - 1) / 25));
    }
    if (Z.HUD && Z.HUD.notify) Z.HUD.notify('round', { round: n });
    if (Rd.onRoundStart) Rd.onRoundStart(n);
  }

  function endRound() {
    Rd.phase = PHASE_BETWEEN;
    Rd.phaseT = 0;
    if (Z.Audio && Z.Audio.ready) {
      Z.Audio.play('round_end', { vol: 1.0 });
      Z.Audio.duck(0.5, 2.5);
    }
    if (Rd.onRoundEnd) Rd.onRoundEnd(Rd.round);
  }

  // -------------------------------------------------------------------------
  // Spawning
  // -------------------------------------------------------------------------
  function updateSpawning(dt) {
    if (Rd.spawnedThisRound >= Rd.totalThisRound) return;
    const cap = Z.B.maxAlive(1);
    if (Z.Zombies.countAlive() >= cap) return;

    Rd.spawnTimer -= dt;
    if (Rd.spawnTimer > 0) return;

    const win = pickWindow();
    if (!win) { Rd.spawnTimer = 0.4; return; }
    const zone = pickZone(win);
    Z.Zombies.spawn({ round: Rd.round, window: win, zone });
    Rd.spawnedThisRound++;
    Rd.spawnTimer = Z.B.spawnDelay(Rd.round) * rng.range(0.82, 1.18);
  }

  // Zombies come from the windows around wherever the player actually is —
  // spawning them across the map would just produce a long boring walk.
  function pickWindow() {
    const open = [];
    let totalW = 0;
    const pp = player ? player.pos : [0, 0, 0];
    for (const w of level.windows) {
      if (!Z.Level.isRoomOpen(w.room)) continue;
      const d = M.dist3(w.inPos, pp);
      // strong preference for nearby windows, but never zero chance for far
      // ones, so the player can't fully camp a single corner
      let weight = 1 / (1 + d * d * 0.03);
      // spread the load: a window already being worked is less attractive
      if (w.tearer) weight *= 0.45;
      if (w.boards <= 0) weight *= 1.35;   // an open window is the easy way in
      open.push({ w, weight });
      totalW += weight;
    }
    if (!open.length) return null;
    let r = rng.f() * totalW;
    for (const o of open) {
      r -= o.weight;
      if (r <= 0) return o.w;
    }
    return open[open.length - 1].w;
  }

  function pickZone(win) {
    const zones = level.spawnZones.filter((s) => s.windowId === win.id);
    if (!zones.length) return null;
    return zones[rng.i(zones.length)];
  }

  // -------------------------------------------------------------------------
  Rd.notifyKill = function () {
    Rd.killsThisRound++;
  };

  Rd.zombiesRemaining = function () {
    return Math.max(0, Rd.totalThisRound - Rd.spawnedThisRound) + Z.Zombies.countAlive();
  };

  Rd.timeToNextRound = function () {
    return Rd.phase === PHASE_BETWEEN ? Math.max(0, BETWEEN_TIME - Rd.phaseT) : 0;
  };

  // Debug / harness: jump straight to a round.
  Rd.setRound = function (n) {
    Z.Zombies.clear();
    Rd.round = n - 1;
    Rd.phase = PHASE_BETWEEN;
    Rd.phaseT = BETWEEN_TIME;   // next update starts round n
  };

  Rd.skipToNextRound = function () {
    Z.Zombies.killAll('debug');
    Rd.spawnedThisRound = Rd.totalThisRound;
  };

  Rd.stats = function () {
    return {
      round: Rd.round, phase: Rd.phase, phaseT: Rd.phaseT,
      spawned: Rd.spawnedThisRound, total: Rd.totalThisRound,
      alive: Z.Zombies.countAlive(), remaining: Rd.zombiesRemaining(),
      health: Z.B.roundHealth(Math.max(1, Rd.round)),
      speed: Z.B.zombieSpeed(Math.max(1, Rd.round)),
    };
  };
}());
