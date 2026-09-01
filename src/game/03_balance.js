// ---------------------------------------------------------------------------
// 03_balance.js — Z.B: the single source of truth for every gameplay number.
// Pure data + pure functions. No DOM, no side effects, no randomness at
// module scope (RNG-driven outcomes like box spins/powerup drops are decided
// by the caller using Z.RNG; this module only exposes the odds/weights).
//
// Companion doc: design/gdd/balance.md — every constant below is explained
// and sourced there. Read that file for the "why", this file for the "what".
//
// Required exports per docs/architecture/MODULE-CONTRACTS.md:
//   roundHealth(r), roundZombieCount(r, players), maxAlive(players),
//   spawnDelay(r), zombieSpeedTier(r), POINTS, PRICES, WEAPONS, PERKS,
//   POWERUP_CHANCE, MAX_POWERUPS_PER_ROUND.
// ---------------------------------------------------------------------------
(function () {
  const B = {};
  Z.B = B;
  const M = Z.M;

  // ===========================================================================
  // PLAYER
  // ===========================================================================

  B.PLAYER = {
    health: 100,          // WaW base health. See B.ZOMBIE.meleeDamage: 2 zombie
                           // hits (50 each) kill an un-perked player exactly.
    regenDelay: 2.4,       // seconds after last damage before regen begins (CoD4/WaW-era pace)
    regenRate: 25,          // hp/sec once regen starts -> 0->100 takes 4s (total ~6.4s to full from a hit)
    speedWalk: 3.6,         // m/s
    speedSprint: 5.6,       // m/s — burst speed only; see sprintDuration.
    // The invariant that matters is not the burst figure, it is the speed a
    // player can hold FOREVER once stamina is accounted for. With a duty cycle
    // of f = 1/(1+regenRatio) spent sprinting, sustained speed is
    //   f*speedSprint + (1-f)*speedWalk
    // and THAT is what must beat the fastest zombie. B.validate() checks it.
    sprintRegenRatio: 0.95, // recovery takes sprintDuration * this
                             // That gap is the entire "kiting is always viable" promise of the game.
    speedAds: 1.9,          // m/s while aiming down sights
    speedCrouch: 1.9,       // m/s
    sprintDuration: 4.0,    // seconds of continuous sprint before WaW-style stamina forces a walk
    jumpVel: 4.7,           // m/s launch velocity; sqrt(2 * Z.C.GRAVITY(22) * 0.5m) ~= a CoD-hop apex of ~0.5m
    meleeDamage: 150,       // raw knife damage value (used for prop/glass/debris damage + as the
                             // number referenced by design). IMPORTANT: see meleeAlwaysKills below —
                             // this number is NOT what makes the knife lethal against zombies.
    meleeAlwaysKills: true, // WaW fact: the knife is a GUARANTEED one-hit kill on any zombie at any
                             // round, regardless of the zombie's current health pool. This is a special
                             // "instant kill" flag in the real game, not a damage-vs-health comparison
                             // (150 raw damage would stop one-shotting after round 1 — see balance.md
                             // Edge Cases). Combat code must special-case melee-vs-zombie: kill on hit,
                             // do not run it through the normal damage pipeline.
    meleeRange: 2.1,       // the PLAYER's knife reach
    // A zombie's claw reach is deliberately shorter than the player's knife:
    // 2.1 m is a lunge, not a swipe, and at that range a walking player gets
    // clipped by shamblers they had already run past.
    zombieAttackRange: 1.72,
    // Minimum spacing between two hits landing on the player. Without it a
    // pair of zombies can strike on the same tick and take you from full
    // health to downed with no chance to react at all.
    damageCooldown: 0.32,        // metres
    meleeRate: 1.35,        // seconds between swings
    downedHealth: 1,        // hp while downed/crawling
    bleedoutTime: 45,       // seconds before permadeath while downed and un-revived
  };

  // ===========================================================================
  // ZOMBIE COMBAT CONSTANTS
  // (movement speed lives in zombieSpeedTier below; AI/pathing is Z.Nav's job)
  // ===========================================================================

  B.ZOMBIE = {
    // *** THE single most important balance fact in this game. ***
    // 50 dmg/hit -> exactly 2 hits drops an un-perked player (100 hp) and
    // exactly 5 hits drops a Juggernog'd player (250 hp, see B.PERKS.juggernog).
    // Every encounter-design and AI-aggro decision downstream assumes this.
    meleeDamage: 50,
    meleeRange: 1.0,          // metres — must land inside this to swing
    meleeAttackInterval: 1.0, // seconds between zombie swings once in range
    boardGrabRange: 1.2,      // metres from a window to start tearing a board
  };

  // ===========================================================================
  // ROUND PROGRESSION
  // ===========================================================================

  // --- Zombie health -----------------------------------------------------
  // Rounds 1-9: linear, +100 hp/round off a 150 base (real WaW curve).
  // Round 10+: compound +10% off the PREVIOUS ROUND'S ROUNDED health. Each
  // step rounds before feeding the next (the real game stores hp as an int),
  // so this function is self-consistent no matter what round you query first.
  const HEALTH_R9 = 150 + 100 * 8; // = 950

  /** Zombie max health at `round` (integer, always >= 1). */
  B.roundHealth = function (round) {
    round = Math.max(1, round | 0);
    if (round <= 9) return Math.round(150 + 100 * (round - 1));
    let hp = HEALTH_R9;
    for (let r = 10; r <= round; r++) hp = Math.round(hp * 1.1);
    return hp;
  };

  // --- Zombie count per round --------------------------------------------
  // Rounds 1-10 are NOT a clean closed-form formula in the source material —
  // Treyarch hand-tuned the early round counts, then let a growth curve take
  // over. We reproduce the documented solo milestones as a lookup, then use
  // a gentle *quadratic* ramp afterward (see balance.md Formulas for the full
  // derivation + why quadratic beats naive exponential compounding, which
  // blows up past round ~40).
  const ROUND_COUNT_TABLE = [6, 8, 13, 18, 24, 27, 28, 28, 29, 33]; // rounds 1..10, solo
  B.ZOMBIE_COUNT_TABLE_R1_10 = ROUND_COUNT_TABLE.slice();

  /** Total zombies spawned across `round` (before the maxAlive cap throttles simultaneity). */
  B.roundZombieCount = function (round, players) {
    round = Math.max(1, round | 0);
    players = M.clamp(players || 1, 1, 4);
    let base;
    if (round <= 10) {
      base = ROUND_COUNT_TABLE[round - 1];
    } else {
      const n = round - 10;
      // +9/round linear term plus a small accelerating quadratic term so
      // round length keeps climbing "steadily" (per design brief) without
      // runaway exponential blowup at very high rounds.
      base = 33 + 9 * n + 0.15 * n * n;
    }
    // Co-op scaling approximation: ~+1/3 more zombies per additional player.
    const scaled = base * (1 + 0.33 * (players - 1));
    return Math.round(scaled);
  };

  /** Simultaneous zombie cap. Solo/duo = 24, trio/quad = 32 (WaW co-op pressure scaling). */
  B.maxAlive = function (players) {
    players = M.clamp(players || 1, 1, 4);
    return players <= 2 ? 24 : 32;
  };

  // --- Spawn pacing --------------------------------------------------------
  // Exponential decay from 2.0s (round 1) to a 0.2s floor, fully reached by
  // round 20 and held thereafter. Exponential (not linear) so the early
  // rounds — where players are still learning the map — ease off gently,
  // while the late-game ramp is felt immediately once it starts.
  const SPAWN_DELAY_START = 2.0;
  const SPAWN_DELAY_FLOOR = 0.2;
  const SPAWN_DELAY_ROUNDS = 19; // rounds 1..20 span the curve (t=0 at r1, t=1 at r20)

  /** Seconds between individual zombie spawns at `round`. */
  B.spawnDelay = function (round) {
    round = Math.max(1, round | 0);
    const t = M.clamp01((round - 1) / SPAWN_DELAY_ROUNDS);
    return SPAWN_DELAY_START * Math.pow(SPAWN_DELAY_FLOOR / SPAWN_DELAY_START, t);
  };

  // --- Zombie movement speed -----------------------------------------------
  // Four hand-authored tiers, linearly interpolated across each tier's round
  // span so the transition feels continuous rather than stepped. The R13+
  // sprint tier is a HARD CAP at 4.6 m/s — deliberately, permanently below
  // the player's 5.6 m/s sprint (B.PLAYER.speedSprint). This is load-bearing:
  // it is what keeps "training" (running a kiting loop) a viable strategy at
  // every round of the game, forever, by design. See balance.md Edge Cases.
  const ZOMBIE_SPEED_TIERS = [
    { from: 1, to: 5, name: 'shamble', v0: 1.0, v1: 1.4 },        // R1-4: slow shamble
    { from: 5, to: 9, name: 'walk', v0: 1.9, v1: 2.6 },           // R5-8: brisk walk
    { from: 9, to: 13, name: 'jog', v0: 3.2, v1: 3.9 },           // R9-12: jog
    { from: 13, to: Infinity, name: 'sprint', v0: 4.35, v1: 4.35 }, // R13+: capped sprint
  ];
  B.ZOMBIE_SPEED_TIERS = ZOMBIE_SPEED_TIERS;

  /** { name, speed } — the movement tier and interpolated base speed (m/s) at `round`. */
  B.zombieSpeedTier = function (round) {
    round = Math.max(1, round | 0);
    for (let i = 0; i < ZOMBIE_SPEED_TIERS.length; i++) {
      const t = ZOMBIE_SPEED_TIERS[i];
      if (round >= t.from && round < t.to) {
        const span = Math.max(1, t.to - t.from - 1);
        const pos = t.to === Infinity ? 0 : M.clamp01((round - t.from) / span);
        return { name: t.name, speed: M.lerp(t.v0, t.v1, pos) };
      }
    }
    const last = ZOMBIE_SPEED_TIERS[ZOMBIE_SPEED_TIERS.length - 1];
    return { name: last.name, speed: last.v1 };
  };

  /** Base zombie movement speed (m/s) at `round`, before per-zombie spread. */
  B.zombieSpeed = function (round) { return B.zombieSpeedTier(round).speed; };

  // Per-zombie multiplier applied on spawn so a horde reads as ragged, not a
  // marching block. Sampled once per zombie at spawn time by the caller.
  // Spread is downward-only at the top tier so the sprint cap is a real cap:
  // a 1.15x roll on 4.35 would put the fastest zombie back above the player's
  // sustainable speed and quietly break kiting again.
  B.zombieSpeedSpread = { min: 0.85, max: 1.15 };
  B.zombieSpeedSpreadTop = { min: 0.86, max: 1.0 };

  /** The speed a player can hold indefinitely once sprint stamina is spent. */
  B.sustainedPlayerSpeed = function () {
    const f = 1 / (1 + B.PLAYER.sprintRegenRatio);
    return f * B.PLAYER.speedSprint + (1 - f) * B.PLAYER.speedWalk;
  };
  /** The fastest a single zombie can ever actually move. */
  B.fastestZombieSpeed = function () {
    const cap = ZOMBIE_SPEED_TIERS[ZOMBIE_SPEED_TIERS.length - 1].v1;
    return cap * B.zombieSpeedSpreadTop.max;
  };

  // ===========================================================================
  // POINTS (WaW rules, exact)
  // ===========================================================================

  B.POINTS = {
    hit: 10,             // any damaging non-lethal hit
    kill: 50,             // bonus ON TOP of `hit` for a body/limb-shot kill -> 60 total
    headshotKill: 100,    // flat total for a headshot kill (not additive with hit/kill)
    meleeKill: 130,        // flat total for a knife kill
    explosiveKill: 50,     // flat total for a grenade/rocket/nuke-splash kill
    repairBoard: 10,       // per plank restored
    reviveTeammate: 200,   // co-op only; documented for completeness, unused in solo
  };

  /**
   * Points awarded for one damage event, matching WaW's exact totals:
   * body-shot kill = 60, headshot kill = 100, melee kill = 130, non-lethal hit = 10.
   * @param {number} dmg - damage dealt (unused in the point math itself; kept in the
   *   signature because callers already have it and future non-WaW variants may need it)
   * @param {boolean} killed
   * @param {"body"|"limb"|"head"} hitZone
   * @param {string} weaponClass - one of B.WEAPONS[].class, or "grenade"
   */
  B.awardForDamage = function (dmg, killed, hitZone, weaponClass) {
    if (weaponClass === 'melee') {
      return killed ? B.POINTS.meleeKill : 0; // WaW: non-lethal knife pokes award nothing
    }
    if (!killed) return B.POINTS.hit;
    if (hitZone === 'head') return B.POINTS.headshotKill;
    if (weaponClass === 'launcher' || weaponClass === 'grenade') return B.POINTS.explosiveKill;
    return B.POINTS.hit + B.POINTS.kill; // 60 — body/limb kill
  };

  // ===========================================================================
  // PRICES
  // ===========================================================================

  B.PRICES = {
    startingPoints: 500,
    startingWeapon: 'm1911',
    mysteryBox: 950,          // flat for the whole game in WaW (no per-spin escalation)
    debrisClear: 1000,        // per barrier/stair debris removal
    wallAmmoRefillRatio: 0.5, // ammo-only wall buy = half the weapon's wall cost, rounded
  };

  // Frag grenade is equipment, not a B.WEAPONS entry (no class in the enum fits it).
  B.GRENADE = {
    id: 'stielhandgranate',
    name: 'Stielhandgranate',
    damage: 300,     // splash damage at the center of the blast
    radius: 3.5,      // metres
    fuseTime: 3.0,     // seconds
    wallCost: 250,      // single source of truth for the grenade wall-buy price
    startCount: 4,
    maxCount: 4,
  };

  /** Ammo-only wall-buy cost for `weaponId` (half wall cost, rounded), or null if not a wall weapon. */
  B.ammoRefillCost = function (weaponId) {
    const w = B.WEAPONS.find(function (x) { return x.id === weaponId; });
    if (!w || !w.wallCost) return null;
    return Math.round(w.wallCost * B.PRICES.wallAmmoRefillRatio);
  };

  // ===========================================================================
  // WEAPONS
  // ===========================================================================
  // damage = per-shot (per-pellet for shotguns) base damage at point-blank range.
  // headshotMult defaults to 2.0 (WaW standard). Bolt-actions (Kar98k,
  // Springfield, PTRS-41) get 3.0: WaW famously lets bolt-action headshots
  // one-shot-kill for a very long time (near-permanent in the original game).
  // We model that as a large-but-finite multiplier rather than an infinite/
  // unconditional flag, so the curve still eventually crosses over (see
  // B.oneShotCrossoverRound and balance.md's crossover table) instead of
  // silently becoming a broken, undocumented exception.
  B.WEAPONS = [
    // --- starting pistol ----------------------------------------------------
    {
      id: 'm1911', name: 'M1911', class: 'pistol', damage: 40, headshotMult: 2.0,
      magSize: 8, startReserve: 32, maxReserve: 96, rpm: 450, fireMode: 'semi',
      reloadTime: 2.0, reloadEmptyTime: 2.3, adsTime: 0.22,
      spreadHip: 3.0, spreadAds: 0.8, spreadMoveMult: 1.8,
      recoil: { vert: 1.1, horiz: 0.3, recovery: 9 },
      rangeFalloff: { start: 14, end: 30, minMult: 0.55 },
      penetration: 0, sprintOutTime: 0.18, swapTime: 0.55,
      wallCost: null, boxOnly: false, weight: 1.1,
      // No dedicated wall buy in Nacht for the starting pistol — ammo comes
      // from Max Ammo powerups or swapping it back in from the box.
    },
    // --- wall rifles ---------------------------------------------------------
    {
      id: 'kar98k', name: 'Kar98k', class: 'rifle', damage: 500, headshotMult: 3.0,
      magSize: 5, startReserve: 30, maxReserve: 90, rpm: 45, fireMode: 'semi', boltAction: true,
      reloadTime: 2.9, reloadEmptyTime: 3.3, adsTime: 0.32,
      spreadHip: 4.5, spreadAds: 0.3, spreadMoveMult: 2.4,
      recoil: { vert: 3.4, horiz: 0.6, recovery: 5 },
      rangeFalloff: { start: 35, end: 80, minMult: 0.85 },
      penetration: 1, sprintOutTime: 0.30, swapTime: 0.6,
      wallCost: 200, boxOnly: false, weight: 3.9,
    },
    {
      id: 'm1a1_carbine', name: 'M1A1 Carbine', class: 'rifle', damage: 100, headshotMult: 2.0,
      magSize: 15, startReserve: 45, maxReserve: 120, rpm: 600, fireMode: 'semi',
      reloadTime: 2.2, reloadEmptyTime: 2.6, adsTime: 0.25,
      spreadHip: 3.4, spreadAds: 0.5, spreadMoveMult: 2.0,
      recoil: { vert: 1.4, horiz: 0.4, recovery: 8 },
      rangeFalloff: { start: 25, end: 55, minMult: 0.7 },
      penetration: 0, sprintOutTime: 0.22, swapTime: 0.5,
      wallCost: 600, boxOnly: false, weight: 2.6,
    },
    {
      id: 'gewehr43', name: 'Gewehr 43', class: 'rifle', damage: 125, headshotMult: 2.0,
      magSize: 10, startReserve: 40, maxReserve: 100, rpm: 500, fireMode: 'semi',
      reloadTime: 2.6, reloadEmptyTime: 3.0, adsTime: 0.28,
      spreadHip: 3.2, spreadAds: 0.45, spreadMoveMult: 2.0,
      recoil: { vert: 1.6, horiz: 0.4, recovery: 8 },
      rangeFalloff: { start: 28, end: 60, minMult: 0.75 },
      penetration: 0, sprintOutTime: 0.24, swapTime: 0.5,
      wallCost: 600, boxOnly: false, weight: 3.0,
    },
    // --- wall shotguns ---------------------------------------------------------
    {
      id: 'db_shotgun', name: 'Double-Barrelled Shotgun', class: 'shotgun', damage: 45, headshotMult: 2.0,
      magSize: 2, startReserve: 16, maxReserve: 32, rpm: 60, fireMode: 'semi',
      reloadTime: 3.6, reloadEmptyTime: 3.6, adsTime: 0.3,
      spreadHip: 6.0, spreadAds: 4.0, spreadMoveMult: 1.4,
      recoil: { vert: 4.0, horiz: 1.0, recovery: 5 },
      pellets: 8, rangeFalloff: { start: 3, end: 9, minMult: 0.15 },
      penetration: 0, sprintOutTime: 0.35, swapTime: 0.7,
      wallCost: 1200, boxOnly: false, weight: 3.6,
    },
    {
      id: 'sawed_off', name: 'Sawed-Off Double-Barrelled Shotgun', class: 'shotgun', damage: 30, headshotMult: 2.0,
      magSize: 2, startReserve: 16, maxReserve: 32, rpm: 90, fireMode: 'semi',
      reloadTime: 2.6, reloadEmptyTime: 2.6, adsTime: 0.2,
      spreadHip: 9.0, spreadAds: 7.0, spreadMoveMult: 1.2,
      recoil: { vert: 3.0, horiz: 1.4, recovery: 6 },
      pellets: 8, rangeFalloff: { start: 2, end: 6, minMult: 0.1 },
      penetration: 0, sprintOutTime: 0.2, swapTime: 0.45,
      wallCost: 1200, boxOnly: false, weight: 2.4,
      // Sawn barrels trade the DB Shotgun's range/damage for handling speed —
      // classic sidegrade, not a strict upgrade.
    },
    // --- wall auto weapons -------------------------------------------------
    {
      id: 'thompson', name: 'Thompson', class: 'smg', damage: 60, headshotMult: 2.0,
      magSize: 30, startReserve: 90, maxReserve: 210, rpm: 700, fireMode: 'auto',
      reloadTime: 2.7, reloadEmptyTime: 3.0, adsTime: 0.24,
      spreadHip: 3.6, spreadAds: 0.9, spreadMoveMult: 1.5,
      recoil: { vert: 0.9, horiz: 0.5, recovery: 11 },
      rangeFalloff: { start: 10, end: 24, minMult: 0.55 },
      penetration: 0, sprintOutTime: 0.18, swapTime: 0.45,
      wallCost: 1200, boxOnly: false, weight: 3.9,
    },
    {
      id: 'bar', name: 'BAR', class: 'lmg', damage: 115, headshotMult: 2.0,
      magSize: 20, startReserve: 80, maxReserve: 180, rpm: 500, fireMode: 'auto',
      reloadTime: 3.3, reloadEmptyTime: 3.7, adsTime: 0.35,
      spreadHip: 3.0, spreadAds: 0.4, spreadMoveMult: 2.2,
      recoil: { vert: 1.8, horiz: 0.3, recovery: 7 },
      rangeFalloff: { start: 22, end: 55, minMult: 0.8 },
      penetration: 1, sprintOutTime: 0.4, swapTime: 0.75,
      wallCost: 1800, boxOnly: false, weight: 8.8,
      // The most expensive wall gun for a reason: best raw damage + capacity
      // combo you can buy without gambling on the box.
    },
    // --- box-only: SMG tier -------------------------------------------------
    {
      id: 'mp40', name: 'MP40', class: 'smg', damage: 55, headshotMult: 2.0,
      magSize: 32, startReserve: 96, maxReserve: 192, rpm: 700, fireMode: 'auto',
      reloadTime: 2.7, reloadEmptyTime: 3.0, adsTime: 0.24,
      spreadHip: 3.8, spreadAds: 1.0, spreadMoveMult: 1.5,
      recoil: { vert: 1.0, horiz: 0.6, recovery: 10 },
      rangeFalloff: { start: 9, end: 22, minMult: 0.5 },
      penetration: 0, sprintOutTime: 0.18, swapTime: 0.45,
      wallCost: null, boxOnly: true, weight: 3.9,
    },
    {
      id: 'type100', name: 'Type 100', class: 'smg', damage: 65, headshotMult: 2.0,
      magSize: 30, startReserve: 90, maxReserve: 210, rpm: 750, fireMode: 'auto',
      reloadTime: 2.6, reloadEmptyTime: 2.9, adsTime: 0.22,
      spreadHip: 3.6, spreadAds: 0.85, spreadMoveMult: 1.5,
      recoil: { vert: 1.0, horiz: 0.55, recovery: 10 },
      rangeFalloff: { start: 10, end: 24, minMult: 0.55 },
      penetration: 0, sprintOutTime: 0.18, swapTime: 0.45,
      wallCost: null, boxOnly: true, weight: 3.7,
    },
    // --- box-only: rifle tier -------------------------------------------------
    {
      id: 'stg44', name: 'STG-44', class: 'rifle', damage: 90, headshotMult: 2.0,
      magSize: 30, startReserve: 90, maxReserve: 240, rpm: 600, fireMode: 'auto',
      reloadTime: 2.8, reloadEmptyTime: 3.1, adsTime: 0.26,
      spreadHip: 3.0, spreadAds: 0.5, spreadMoveMult: 1.7,
      recoil: { vert: 1.2, horiz: 0.35, recovery: 9 },
      rangeFalloff: { start: 20, end: 50, minMult: 0.75 },
      penetration: 1, sprintOutTime: 0.22, swapTime: 0.5,
      wallCost: null, boxOnly: true, weight: 5.2,
      // The community-beloved "all-rounder": no glaring weakness at any range,
      // big mag, full-auto. Deliberately strong to make box gambling feel worth it.
    },
    {
      id: 'fg42', name: 'FG42', class: 'rifle', damage: 110, headshotMult: 2.0,
      magSize: 20, startReserve: 60, maxReserve: 160, rpm: 650, fireMode: 'auto',
      reloadTime: 2.9, reloadEmptyTime: 3.2, adsTime: 0.3,
      spreadHip: 3.2, spreadAds: 0.5, spreadMoveMult: 2.0,
      recoil: { vert: 2.0, horiz: 0.5, recovery: 7 },
      rangeFalloff: { start: 26, end: 58, minMult: 0.8 },
      penetration: 1, sprintOutTime: 0.3, swapTime: 0.55,
      wallCost: null, boxOnly: true, weight: 4.5,
    },
    {
      id: 'springfield', name: 'Springfield', class: 'rifle', damage: 650, headshotMult: 3.0,
      magSize: 5, startReserve: 30, maxReserve: 60, rpm: 45, fireMode: 'semi', boltAction: true,
      reloadTime: 3.0, reloadEmptyTime: 3.4, adsTime: 0.35,
      spreadHip: 4.2, spreadAds: 0.15, spreadMoveMult: 2.5,
      recoil: { vert: 3.6, horiz: 0.5, recovery: 5 },
      rangeFalloff: { start: 38, end: 85, minMult: 0.88 },
      penetration: 1, sprintOutTime: 0.32, swapTime: 0.6,
      wallCost: null, boxOnly: true, weight: 4.0,
      // Scoped bolt-action upgrade over the Kar98k: extends the one-shot
      // headshot window further into the game. See crossover table in balance.md.
    },
    {
      id: 'ptrs41', name: 'PTRS-41', class: 'rifle', damage: 1500, headshotMult: 3.0,
      magSize: 5, startReserve: 25, maxReserve: 50, rpm: 100, fireMode: 'semi', boltAction: true,
      reloadTime: 3.6, reloadEmptyTime: 4.0, adsTime: 0.4,
      spreadHip: 4.0, spreadAds: 0.2, spreadMoveMult: 2.6,
      recoil: { vert: 5.0, horiz: 0.8, recovery: 4 },
      rangeFalloff: { start: 40, end: 90, minMult: 0.9 },
      penetration: 3, sprintOutTime: 0.4, swapTime: 0.7,
      wallCost: null, boxOnly: true, weight: 10.6,
      // Anti-tank rifle: shreds a line of zombies (penetration 3) and one-shots
      // almost everything for a huge stretch of the game.
    },
    // --- box-only: LMG tier -------------------------------------------------
    {
      id: 'm1919', name: 'Browning M1919', class: 'lmg', damage: 130, headshotMult: 2.0,
      magSize: 100, startReserve: 200, maxReserve: 400, rpm: 500, fireMode: 'auto',
      reloadTime: 5.5, reloadEmptyTime: 5.5, adsTime: 0.4,
      spreadHip: 3.4, spreadAds: 0.5, spreadMoveMult: 2.4,
      recoil: { vert: 1.6, horiz: 0.3, recovery: 7 },
      rangeFalloff: { start: 24, end: 55, minMult: 0.8 },
      penetration: 1, sprintOutTime: 0.45, swapTime: 0.8,
      wallCost: null, boxOnly: true, weight: 9.8,
      // Belt-fed 100-round mag means near-zero reload pressure once acquired.
    },
    // --- box-only: shotgun tier -------------------------------------------------
    {
      id: 'trench_gun', name: 'Trench Gun', class: 'shotgun', damage: 55, headshotMult: 2.0,
      magSize: 6, startReserve: 24, maxReserve: 48, rpm: 90, fireMode: 'semi',
      reloadTime: 3.6, reloadEmptyTime: 3.6, adsTime: 0.28,
      spreadHip: 5.5, spreadAds: 3.5, spreadMoveMult: 1.3,
      recoil: { vert: 3.4, horiz: 0.8, recovery: 6 },
      pellets: 8, rangeFalloff: { start: 4, end: 10, minMult: 0.2 },
      penetration: 0, sprintOutTime: 0.3, swapTime: 0.6,
      wallCost: null, boxOnly: true, weight: 3.8,
    },
    // --- box-only: launchers / wonder / special -----------------------------
    {
      id: 'panzerschreck', name: 'Panzerschreck', class: 'launcher', damage: 2000, headshotMult: 1.0,
      magSize: 1, startReserve: 4, maxReserve: 4, rpm: 60, fireMode: 'semi',
      reloadTime: 4.5, reloadEmptyTime: 4.5, adsTime: 0.35,
      spreadHip: 1.0, spreadAds: 0.2, spreadMoveMult: 1.2,
      recoil: { vert: 6.0, horiz: 1.0, recovery: 3 },
      rangeFalloff: { start: 0, end: 999, minMult: 1 }, // splash damage does not fall off with range
      splashRadius: 3.5, selfDamageClose: true,
      penetration: 0, sprintOutTime: 0.5, swapTime: 0.9,
      wallCost: null, boxOnly: true, weight: 9.5,
      // Rocket splash guarantees the kill in its radius, but with only 4
      // rockets total and a heavy reload it's a panic button, not a main gun.
      // selfDamageClose is real: firing too close hurts the player too.
    },
    {
      id: 'raygun', name: 'Ray Gun', class: 'wonder', damage: 1000, headshotMult: 1.0,
      magSize: 20, startReserve: 60, maxReserve: 120, rpm: 200, fireMode: 'semi',
      reloadTime: 2.4, reloadEmptyTime: 2.4, adsTime: 0.22,
      spreadHip: 1.0, spreadAds: 0.1, spreadMoveMult: 1.1,
      recoil: { vert: 0.6, horiz: 0.1, recovery: 14 },
      rangeFalloff: { start: 0, end: 999, minMult: 1 },
      splashRadius: 2.5, selfDamageClose: true,
      penetration: 1, sprintOutTime: 0.2, swapTime: 0.5,
      wallCost: null, boxOnly: true, weight: 3.0,
      // The signature wonder weapon. 1000 direct + splash keeps it relevant
      // far longer than any wall gun (see crossover table). Classic risk:
      // splash damage close range can hurt the shooter (selfDamageClose).
    },
    {
      id: 'm2_flamethrower', name: 'M2 Flamethrower', class: 'launcher', damage: 25, headshotMult: 1.0,
      magSize: 200, startReserve: 200, maxReserve: 400, rpm: null, fireMode: 'auto',
      dot: true, ticksPerSec: 10, // continuous damage-over-time; magSize is fuel, not rounds
      reloadTime: 4.0, reloadEmptyTime: 4.0, adsTime: 0.3,
      spreadHip: 0, spreadAds: 0, spreadMoveMult: 1,
      recoil: { vert: 0, horiz: 0, recovery: 1 },
      rangeFalloff: { start: 0, end: 6, minMult: 0.3 }, // very short effective range
      penetration: 0, sprintOutTime: 0.4, swapTime: 0.8,
      wallCost: null, boxOnly: true, weight: 7.0,
      // `damage` is per-tick (10 ticks/sec = 250 effective dps), not per-shot.
      // Use B.dps(weapon) rather than B.oneShotCrossoverRound for this one.
    },
    {
      id: 'magnum357', name: '.357 Magnum', class: 'pistol', damage: 120, headshotMult: 2.5,
      magSize: 6, startReserve: 24, maxReserve: 48, rpm: 300, fireMode: 'semi',
      reloadTime: 2.4, reloadEmptyTime: 2.6, adsTime: 0.2,
      spreadHip: 2.6, spreadAds: 0.6, spreadMoveMult: 1.6,
      recoil: { vert: 2.2, horiz: 0.4, recovery: 9 },
      rangeFalloff: { start: 16, end: 35, minMult: 0.6 },
      penetration: 0, sprintOutTime: 0.16, swapTime: 0.4,
      wallCost: null, boxOnly: true, weight: 1.4,
      // Sidearm upgrade over the M1911 — same handling philosophy, hits far harder.
    },
    // --- melee ---------------------------------------------------------------
    {
      id: 'knife', name: 'Knife', class: 'melee', damage: 150, headshotMult: 1.0,
      magSize: 0, startReserve: 0, maxReserve: 0, rpm: null, fireMode: null,
      reloadTime: 0, reloadEmptyTime: 0, adsTime: 0,
      spreadHip: 0, spreadAds: 0, spreadMoveMult: 1,
      recoil: { vert: 0, horiz: 0, recovery: 0 },
      rangeFalloff: { start: 0, end: 0, minMult: 1 },
      penetration: 0, sprintOutTime: 0.1, swapTime: 0.3,
      wallCost: null, boxOnly: false, weight: 0.5,
      // Damage-vs-zombie resolution bypasses this number entirely; see
      // B.PLAYER.meleeAlwaysKills. `damage` here is used for non-zombie
      // targets only (breakables, props).
    },
  ];

  /** Look up a weapon definition by id, or undefined. */
  B.getWeapon = function (id) {
    return B.WEAPONS.find(function (w) { return w.id === id; });
  };

  /** Sustained damage-per-second for a fully-automatic (or DOT) weapon. */
  B.dps = function (weapon) {
    if (weapon.dot) return weapon.damage * (weapon.ticksPerSec || 1);
    const shotDmg = weapon.pellets ? weapon.damage * weapon.pellets : weapon.damage;
    return shotDmg * ((weapon.rpm || 0) / 60);
  };

  /** Best possible single-hit damage (headshot, all pellets for shotguns, point-blank). */
  B.bestOneHitDamage = function (weapon) {
    const base = weapon.pellets ? weapon.damage * weapon.pellets : weapon.damage;
    return base * (weapon.headshotMult || 1);
  };

  /**
   * Last round at which `weaponId`'s best single hit still one-shot-kills a
   * zombie (0 means it never one-shots, not even round 1). This is the
   * number that defines the game's difficulty pacing — see balance.md.
   */
  B.oneShotCrossoverRound = function (weaponId, roundCap) {
    roundCap = roundCap || 500;
    const w = B.getWeapon(weaponId);
    if (!w) return null;
    const hitDmg = B.bestOneHitDamage(w);
    let last = 0;
    for (let r = 1; r <= roundCap; r++) {
      if (hitDmg >= B.roundHealth(r)) last = r; else break;
    }
    return last;
  };

  // ===========================================================================
  // MYSTERY BOX
  // ===========================================================================

  B.BOX = {
    cost: 950, // flat for the whole game — no per-spin escalation in WaW
    // Weighted pool. Every wall + box-only gun is eligible except the
    // starting pistol and the knife. Weight is relative, not a percentage —
    // divide by boxPoolTotal() for the actual chance.
    weights: {
      kar98k: 15, m1a1_carbine: 15, gewehr43: 14, db_shotgun: 12, sawed_off: 10,
      thompson: 14, bar: 9, mp40: 14, type100: 12, stg44: 9, fg42: 8,
      m1919: 7, trench_gun: 8, springfield: 8, magnum357: 10,
      ptrs41: 3, panzerschreck: 3, m2_flamethrower: 4,
      raygun: 1, // the classic ultra-rare pull
    },
    teddyBearChance: 1 / 8, // ~1 in 8 spins relocate the box to a new spot
    teddyBearMinUses: 4,     // the box will not relocate before its 4th use at the current spot
  };

  /** Sum of all box pool weights. */
  B.boxPoolTotal = function () {
    let sum = 0;
    for (const k in B.BOX.weights) sum += B.BOX.weights[k];
    return sum;
  };

  /** 0..1 probability of pulling `weaponId` on a single spin. */
  B.boxWeaponChance = function (weaponId) {
    const w = B.BOX.weights[weaponId];
    if (!w) return 0;
    return w / B.boxPoolTotal();
  };

  // ===========================================================================
  // PERKS
  // ===========================================================================
  // NOTE: the real Nacht der Untoten has ZERO Perk-a-Cola machines — it is the
  // only WaW zombies map without perks. Perks are included here at the
  // project owner's explicit request, priced to match their real WaW/Verrückt
  // (the map that introduced them) values. This is a deliberate scope
  // deviation from the source map, documented per the rule that loot-table /
  // economy changes must state their rationale. See balance.md Overview.

  B.PERKS = [
    {
      id: 'quickrevive', name: 'Quick Revive', cost: 500, costMultiplier: 2, maxPurchasesSolo: 3,
      color: '#ff3b3b', effect: { selfRevive: true, maxUsesSolo: 3 },
      // Solo-only consumable: instantly self-revives once on a down. Price
      // DOUBLES each purchase (500 -> 1000 -> 2000) and caps at 3 buys —
      // after the 3rd use, it's gone for the rest of the game.
    },
    {
      id: 'juggernog', name: 'Juggernog', cost: 2500,
      color: '#8b0000', effect: { maxHealth: 250 },
      // 100 -> 250 max health: survive 5 zombie hits instead of 2 (see B.ZOMBIE.meleeDamage).
    },
    {
      id: 'speedcola', name: 'Speed Cola', cost: 3000,
      color: '#f2c400', effect: { reloadMult: 0.5 },
      // Halves every weapon's reload time (both reloadTime and reloadEmptyTime).
    },
    {
      id: 'doubletap', name: 'Double Tap Root Beer', cost: 2000,
      color: '#e07a1f', effect: { rpmMult: 1.33 },
      // +33% fire rate on every weapon (does not affect magSize or reload).
    },
  ];

  /** Look up a perk definition by id, or undefined. */
  B.getPerk = function (id) {
    return B.PERKS.find(function (p) { return p.id === id; });
  };

  /** Points cost for the Nth purchase of a perk (0-indexed: 0 = first buy). Quick Revive doubles each time. */
  B.perkCost = function (perkId, purchaseIndex) {
    const p = B.getPerk(perkId);
    if (!p) return null;
    const mult = p.costMultiplier || 1;
    return Math.round(p.cost * Math.pow(mult, purchaseIndex || 0));
  };

  // ===========================================================================
  // POWER-UPS
  // ===========================================================================

  B.POWERUP_CHANCE = 0.02;        // base drop chance per kill (2%)
  B.MAX_POWERUPS_PER_ROUND = 4;   // hard cap regardless of kill count
  B.POWERUP_LIFETIME = 30;         // seconds a dropped powerup sits before despawning
  B.POWERUP_BLINK_WARN = 5;        // seconds of blinking before despawn (part of the 30s lifetime)

  B.POWERUPS = [
    { id: 'instakill', name: 'Insta-Kill', weight: 15, duration: 30 },
    { id: 'doublepoints', name: 'Double Points', weight: 15, duration: 30 },
    { id: 'maxammo', name: 'Max Ammo', weight: 20, duration: 0 },      // instant effect
    { id: 'nuke', name: 'Nuke', weight: 15, duration: 0, killPoints: 400 }, // instant; kills all on-screen zombies for a flat 400 pts total
    { id: 'carpenter', name: 'Carpenter', weight: 15, duration: 0 },   // instant: rebuilds every window
  ];

  /** 0..1 chance a powerup drops from a kill at `round` (rises gently, capped). */
  B.powerupDropChance = function (round) {
    round = Math.max(1, round | 0);
    return Math.min(0.06, B.POWERUP_CHANCE * (1 + 0.03 * (round - 1)));
  };

  // ===========================================================================
  // BARRICADES
  // ===========================================================================

  B.BARRICADE = {
    boardsPerWindow: 6,
    repairPointsPerBoard: 10,    // matches B.POINTS.repairBoard
    repairTimePerBoard: 0.5,      // seconds player must hold the repair action, per board
    tearTimePerBoardBase: 1.3,    // R1: seconds a zombie needs to claw out one board
    tearTimePerBoardMin: 0.5,      // floor at high rounds
    tearTimeRoundsToMin: 20,       // linear ramp from base -> min across rounds 1..20, holds after
  };

  /** Seconds a zombie needs to tear out one board at `round`. */
  B.boardTearTime = function (round) {
    round = Math.max(1, round | 0);
    const t = M.clamp01((round - 1) / (B.BARRICADE.tearTimeRoundsToMin - 1));
    return M.lerp(B.BARRICADE.tearTimePerBoardBase, B.BARRICADE.tearTimePerBoardMin, t);
  };

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  /** Pure sanity check. Returns [] if the table is internally consistent. */
  B.validate = function () {
    const problems = [];

    // --- round health: positive, integer, strictly increasing ---
    let prevHp = 0;
    for (let r = 1; r <= 60; r++) {
      const hp = B.roundHealth(r);
      if (!Number.isInteger(hp) || hp <= 0) problems.push('roundHealth(' + r + ') is not a positive integer: ' + hp);
      if (hp <= prevHp) problems.push('roundHealth(' + r + ') did not increase over round ' + (r - 1));
      prevHp = hp;
    }
    if (B.roundHealth(1) !== 150) problems.push('roundHealth(1) expected 150, got ' + B.roundHealth(1));
    if (B.roundHealth(9) !== 950) problems.push('roundHealth(9) expected 950, got ' + B.roundHealth(9));

    // --- round zombie counts: positive integers, reference milestones ---
    const refs = { 1: 6, 2: 8, 3: 13, 4: 18, 5: 24, 6: 27, 7: 28, 8: 28, 9: 29, 10: 33 };
    for (const r in refs) {
      const got = B.roundZombieCount(Number(r), 1);
      if (got !== refs[r]) problems.push('roundZombieCount(' + r + ',1) expected ' + refs[r] + ', got ' + got);
    }
    for (let r = 1; r <= 40; r++) {
      const c = B.roundZombieCount(r, 1);
      if (!Number.isInteger(c) || c <= 0) problems.push('roundZombieCount(' + r + ',1) is not a positive integer: ' + c);
    }

    // --- maxAlive ---
    if (B.maxAlive(1) !== 24) problems.push('maxAlive(1) expected 24, got ' + B.maxAlive(1));

    // --- spawn delay: bounded, monotonic non-increasing ---
    let prevDelay = Infinity;
    for (let r = 1; r <= 40; r++) {
      const d = B.spawnDelay(r);
      if (d > prevDelay + 1e-9) problems.push('spawnDelay(' + r + ') increased over round ' + (r - 1));
      if (d < SPAWN_DELAY_FLOOR - 1e-9 || d > SPAWN_DELAY_START + 1e-9) problems.push('spawnDelay(' + r + ') out of bounds: ' + d);
      prevDelay = d;
    }

    // --- zombie speed: load-bearing cap must stay under player sprint ---
    // Burst speed is not the invariant — sustainable speed is.
    const sustained = B.sustainedPlayerSpeed();
    const fastestZ = B.fastestZombieSpeed();
    if (sustained <= fastestZ) {
      problems.push('sustained player speed ' + sustained.toFixed(2)
        + ' m/s does not beat the fastest zombie ' + fastestZ.toFixed(2)
        + ' m/s — kiting breaks down at high rounds');
    }
    if (sustained - fastestZ < 0.15) {
      problems.push('kiting margin is only ' + (sustained - fastestZ).toFixed(2) + ' m/s — too tight');
    }
    const sprintCap = B.zombieSpeedTier(13).speed;
    if (sprintCap >= B.PLAYER.speedSprint) {
      problems.push('zombie sprint cap (' + sprintCap + ') is not below B.PLAYER.speedSprint (' + B.PLAYER.speedSprint + ') — kiting breaks');
    }
    for (let r = 1; r <= 40; r++) {
      const s = B.zombieSpeed(r);
      if (s > B.PLAYER.speedSprint) problems.push('zombieSpeed(' + r + ') = ' + s + ' exceeds player sprint speed');
    }

    // --- the 2-hit / 5-hit melee rule ---
    if (B.ZOMBIE.meleeDamage * 2 !== B.PLAYER.health) {
      problems.push('zombie meleeDamage * 2 (' + (B.ZOMBIE.meleeDamage * 2) + ') != PLAYER.health (' + B.PLAYER.health + ')');
    }
    const jugg = B.getPerk('juggernog');
    if (!jugg) problems.push('juggernog perk missing');
    else if (B.ZOMBIE.meleeDamage * 5 !== jugg.effect.maxHealth) {
      problems.push('zombie meleeDamage * 5 (' + (B.ZOMBIE.meleeDamage * 5) + ') != juggernog maxHealth (' + jugg.effect.maxHealth + ')');
    }

    // --- points totals ---
    if (B.awardForDamage(50, true, 'body', 'rifle') !== 60) problems.push('body-shot kill should total 60 points');
    if (B.awardForDamage(50, true, 'head', 'rifle') !== 100) problems.push('headshot kill should total 100 points');
    if (B.awardForDamage(50, true, 'body', 'melee') !== 130) problems.push('melee kill should total 130 points');
    if (B.awardForDamage(5, false, 'body', 'rifle') !== 10) problems.push('non-lethal hit should award 10 points');

    // --- weapons table ---
    const seenIds = {};
    const numericFields = ['damage', 'headshotMult', 'magSize', 'startReserve', 'maxReserve',
      'reloadTime', 'reloadEmptyTime', 'adsTime', 'spreadHip', 'spreadAds', 'spreadMoveMult',
      'penetration', 'sprintOutTime', 'swapTime', 'weight'];
    B.WEAPONS.forEach(function (w) {
      if (!w.id || !w.name || !w.class) problems.push('weapon missing id/name/class: ' + JSON.stringify(w));
      if (seenIds[w.id]) problems.push('duplicate weapon id: ' + w.id);
      seenIds[w.id] = true;
      const validClasses = ['pistol', 'rifle', 'smg', 'lmg', 'shotgun', 'launcher', 'wonder', 'melee'];
      if (validClasses.indexOf(w.class) === -1) problems.push('weapon ' + w.id + ' has invalid class: ' + w.class);
      numericFields.forEach(function (f) {
        if (typeof w[f] !== 'number' || Number.isNaN(w[f])) {
          problems.push('weapon ' + w.id + ' field "' + f + '" is not a number: ' + w[f]);
        }
      });
      if (w.class !== 'melee' && (w.wallCost === undefined || w.boxOnly === undefined)) {
        problems.push('weapon ' + w.id + ' missing wallCost/boxOnly');
      }
      if (w.wallCost !== null && w.boxOnly === true) {
        problems.push('weapon ' + w.id + ' has both a wallCost and boxOnly:true');
      }
      if (w.wallCost === null && w.boxOnly === false && w.id !== 'm1911' && w.id !== 'knife') {
        problems.push('weapon ' + w.id + ' is neither a wall weapon, box-only, nor a known exception');
      }
      if (!w.rangeFalloff || typeof w.rangeFalloff.minMult !== 'number') {
        problems.push('weapon ' + w.id + ' missing rangeFalloff');
      }
      if (!w.recoil || typeof w.recoil.vert !== 'number') {
        problems.push('weapon ' + w.id + ' missing recoil');
      }
      // Every weapon must eventually stop one-shotting (guards against a
      // silently-infinite or zero damage value slipping through).
      if (w.class !== 'melee') {
        const cross = B.oneShotCrossoverRound(w.id, 300);
        if (cross === 300) problems.push('weapon ' + w.id + ' never crosses over within 300 rounds — suspiciously high damage');
      }
    });

    // --- ammo refill pricing sanity ---
    B.WEAPONS.forEach(function (w) {
      if (w.wallCost) {
        const refill = B.ammoRefillCost(w.id);
        if (refill !== Math.round(w.wallCost * 0.5)) problems.push('ammoRefillCost(' + w.id + ') mismatch: ' + refill);
      }
    });

    // --- box pool ---
    Object.keys(B.BOX.weights).forEach(function (id) {
      if (!B.getWeapon(id)) problems.push('box pool references unknown weapon id: ' + id);
    });
    if (B.boxPoolTotal() <= 0) problems.push('box pool total weight must be > 0');
    if (B.BOX.teddyBearChance <= 0 || B.BOX.teddyBearChance >= 1) problems.push('teddyBearChance out of (0,1) range');

    // --- perks ---
    if (B.PERKS.length !== 4) problems.push('expected 4 perks, got ' + B.PERKS.length);
    B.PERKS.forEach(function (p) {
      if (typeof p.cost !== 'number' || p.cost <= 0) problems.push('perk ' + p.id + ' has invalid cost');
    });
    const qr = B.getPerk('quickrevive');
    if (qr) {
      const costs = [0, 1, 2].map(function (i) { return B.perkCost('quickrevive', i); });
      if (costs[0] !== 500 || costs[1] !== 1000 || costs[2] !== 2000) {
        problems.push('quickrevive cost sequence expected [500,1000,2000], got ' + JSON.stringify(costs));
      }
    }

    // --- powerups ---
    if (B.POWERUPS.length === 0) problems.push('no powerups defined');
    B.POWERUPS.forEach(function (p) {
      if (typeof p.weight !== 'number' || p.weight <= 0) problems.push('powerup ' + p.id + ' has invalid weight');
    });
    if (B.POWERUP_CHANCE <= 0 || B.POWERUP_CHANCE >= 1) problems.push('POWERUP_CHANCE out of (0,1) range');
    if (B.MAX_POWERUPS_PER_ROUND <= 0) problems.push('MAX_POWERUPS_PER_ROUND must be positive');

    // --- barricades ---
    if (B.BARRICADE.boardsPerWindow !== 6) problems.push('boardsPerWindow expected 6, got ' + B.BARRICADE.boardsPerWindow);
    if (B.boardTearTime(1) !== B.BARRICADE.tearTimePerBoardBase) problems.push('boardTearTime(1) should equal tearTimePerBoardBase');
    if (Math.abs(B.boardTearTime(999) - B.BARRICADE.tearTimePerBoardMin) > 1e-9) problems.push('boardTearTime should floor at tearTimePerBoardMin');

    // --- prices reachable from starting points (sanity, not a hard rule) ---
    if (B.PRICES.startingPoints <= 0) problems.push('startingPoints must be positive');
    if (B.getWeapon(B.PRICES.startingWeapon) === undefined) problems.push('startingWeapon id not found in WEAPONS: ' + B.PRICES.startingWeapon);

    return problems;
  };

  // ===========================================================================
  // TOOLING
  // ===========================================================================

  /** Round-by-round summary table for rounds 1..maxRound (solo by default). */
  B.TABLE_SUMMARY = function (maxRound, players) {
    players = players || 1;
    const rows = [];
    for (let r = 1; r <= maxRound; r++) {
      rows.push({
        round: r,
        health: B.roundHealth(r),
        count: B.roundZombieCount(r, players),
        speed: Math.round(B.zombieSpeed(r) * 100) / 100,
        delay: Math.round(B.spawnDelay(r) * 1000) / 1000,
      });
    }
    return rows;
  };
}());
