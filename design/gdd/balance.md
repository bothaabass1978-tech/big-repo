# Balance — Nacht der Untoten Recreation

Owning module: `src/game/03_balance.js` (`Z.B`). This document explains and
sources every constant and formula in that file. If a number changes here,
change it there too — they must never drift apart.

## 1. Overview

`Z.B` is the single source of truth for every gameplay number in the game:
round-over-round zombie health/count/speed/spawn-pacing, the WaW points
economy, wall/box weapon prices, the full weapon stat table, the Mystery Box
pool, Perk-a-Cola pricing and effects, power-up drop rules, and barricade
timing. Every other module (`15_weapons.js`, `16_player.js`, `17_zombie.js`,
`18_rounds.js`, `19_econ.js`, `20_hud.js`, `21_menu.js`) reads from `Z.B` and
never hardcodes a balance number of its own. This document is the "why"
behind each value; the code is the "what".

One explicit, deliberate scope deviation from the real Nacht der Untoten:
**the real map has zero Perk-a-Cola machines** — it's the only WaW zombies
map without perks (they were introduced in Verrückt). The project owner
asked for perks anyway, so `B.PERKS` is included, priced to match the real
WaW/Verrückt values. Every other number targets the real Nacht der Untoten
as closely as the source material allows.

## 2. Player Fantasy

The player should feel like they are *always* one bad decision — not one bad
die roll — away from going down, and *always* able to out-plan the horde if
they keep moving. Two numbers do almost all of the emotional work:

- **The 2-hit rule**: an un-perked player survives exactly two zombie hits.
  This is what makes the opening rounds tense despite zombies being slow —
  panic and bad positioning kill you, not raw stats.
- **The 5.6 vs 4.6 m/s gap**: the player's sprint is *always* faster than the
  fastest zombie, at every round, forever. This is what makes "training"
  (running an endless kiting loop around the map) a permanently valid
  strategy rather than something that stops working past round 20 — the
  fantasy is skill and route-knowledge beating brute stats indefinitely.

Money (points) should feel earned through risk (headshots, melee, close
calls) rather than grinding — hence the sharp headshot/melee point premiums
over body shots (100 and 130 vs 60).

## 3. Detailed Rules

### Round progression
- Zombie health rises every round: linearly for rounds 1-9, then compounding
  +10%/round from round 10 onward, forever. There is no cap — every weapon
  in the game eventually stops one-shotting (see Formulas + the crossover
  table below).
- Zombie count per round rises with a hand-tuned table for rounds 1-10 and a
  gently accelerating formula after. `B.maxAlive(players)` caps how many can
  be alive/chasing at once regardless of how many are still queued to spawn.
- Zombie movement speed rises in four discrete-but-interpolated tiers
  (shamble -> walk -> jog -> sprint) and is **permanently capped** at
  4.6 m/s from round 13 onward — always below the player's 5.6 m/s sprint.
- Spawn delay (time between individual zombie spawns) shrinks from 2.0s to a
  0.2s floor by round 20, and holds there.

### Points
- Non-lethal hit: 10. Body/limb-shot kill: 60 (10 hit + 50 kill bonus).
  Headshot kill: 100 flat. Melee kill: 130 flat. Explosive kill: 50 flat.
  Board repair: 10/plank.
- Melee that doesn't kill awards nothing (WaW rule — you don't get poke
  points, only kill points).

### Prices
- Start with 500 points and an M1911 (no dedicated wall buy for it in Nacht
  — ammo comes from Max Ammo or the box).
- Wall guns: Kar98k 200, M1A1 Carbine 600, Gewehr 43 600, Double-Barrelled
  Shotgun 1200, Sawed-Off 1200, Thompson 1200, BAR 1800.
- Stielhandgranate (grenade refill): 250, capped at 4 carried.
- Ammo-only wall buy = half the weapon's wall cost, rounded.
- Mystery Box: 950/spin, flat for the entire game (no escalation).
- Debris/stair clears: 1000 each.
- Perks: Quick Revive 500/1000/2000 (doubles per buy, 3-use cap, solo self-
  revive), Juggernog 2500, Speed Cola 3000, Double Tap 2000.

### Weapons
21 entries in `B.WEAPONS`: the starting pistol, 7 wall guns, 12 box-only
guns/ordnance, and the knife. Every gun has an explicit `wallCost` (number)
XOR `boxOnly:true` — never both, and the starting pistol/knife are the only
weapons with neither.

### Mystery Box
19 eligible weapons (every gun except the M1911 and knife), weighted so the
Ray Gun is a 1-in-~200 pull. The box relocates with ~1-in-8 odds per spin,
but never before its 4th use at the current spot.

### Barricades
6 boards/window, 10 pts/board, zombies tear a board out in 1.3s at round 1,
tightening to a 0.5s floor by round 20.

## 4. Formulas

### Zombie health — `B.roundHealth(round)`
```
health(r) = 150 + 100*(r-1)                         for 1 <= r <= 9
health(r) = round(health(r-1) * 1.1)                 for r >= 10
```
`health(9) = 950` is the fixed base the compounding starts from. Each step
rounds to an integer before feeding the next round (the real game stores hp
as an int), so the function is self-consistent regardless of query order.
Reference values this must hit exactly: `health(1)=150`, `health(9)=950`.

### Zombie count — `B.roundZombieCount(round, players)`
```
count(r)      = TABLE[r]                              for 1 <= r <= 10
                TABLE = [6,8,13,18,24,27,28,28,29,33]
count(r)      = 33 + 9*n + 0.15*n^2, n = r-10          for r > 10
scaled(r,p)   = round(count(r) * (1 + 0.33*(p-1)))
```
**Derivation note**: rounds 1-10 are not reducible to one clean formula in
the community-documented source material — they read as hand-authored
milestones (the differences are 2, 5, 5, 6, 3, 1, 0, 1, 4 — not an arithmetic
or geometric sequence). We reproduce them as an explicit lookup rather than
force-fitting a formula that would drift from the known values. From round
11 on we use a linear-plus-small-quadratic ramp (+9/round, accelerating by
+0.3/round/round) rather than naive geometric compounding: geometric growth
at even a modest 10-18%/round compounds into an ahistorical, absurd zombie
count by round 40+ (thousands of zombies/round), while the quadratic ramp
stays "steadily climbing" — round 20 = 138, round 30 = 273 — which matches
the community-reported experience that rounds keep getting longer without
exploding combinatorially. Player scaling (+33%/extra player) is a documented
approximation, not a reverse-engineered exact figure.

### Max simultaneous zombies — `B.maxAlive(players)`
```
maxAlive(p) = 24   for p <= 2
maxAlive(p) = 32   for p in {3,4}
```

### Spawn delay — `B.spawnDelay(round)`
```
t(r)     = clamp01((r-1) / 19)              // 0 at r1, 1 at r20+
delay(r) = 2.0 * (0.2/2.0)^t(r)
```
Exponential interpolation (not linear) between the 2.0s start and 0.2s floor:
early rounds ease off gently while players are still learning the map, and
the late-game tightening is felt as soon as it starts rather than creeping
in unnoticeably. Floor is reached exactly at round 20 and held for all
rounds after (t clamps at 1).

### Zombie speed — `B.zombieSpeedTier(round)` / `B.zombieSpeed(round)`
Four tiers, each linearly interpolated across its own round span:

| Tier | Rounds | m/s range |
|---|---|---|
| shamble | 1-4 | 1.0 -> 1.4 |
| walk | 5-8 | 1.9 -> 2.6 |
| jog | 9-12 | 3.2 -> 3.9 |
| sprint | 13+ | 4.6 (flat) |

```
pos(r, tier) = clamp01((r - tier.from) / (tier.to - tier.from - 1))
speed(r)     = lerp(tier.v0, tier.v1, pos(r, tier))
```
**The sprint cap (4.6 m/s) is a hard, permanent ceiling — it never rises
past round 13.** This is deliberately, permanently below
`B.PLAYER.speedSprint` (5.6 m/s). That 1.0 m/s gap is what the entire "kite
forever" promise of the game is built on: no matter how far into a run a
player gets, sustained sprinting in a straight line always outpaces the
fastest zombie. `B.validate()` asserts this gap exists on every call.
`B.zombieSpeedSpread` (0.85-1.15x, sampled per-zombie at spawn) keeps a
horde looking ragged instead of a single marching wall, without threatening
the cap (max effective individual speed is 4.6 * 1.15 = 5.29 m/s, *still*
below 5.6 — see Edge Cases).

### Points — `B.awardForDamage(dmg, killed, hitZone, weaponClass)`
```
melee, killed      -> 130
melee, not killed  -> 0
not killed          -> 10
killed, head        -> 100
killed, explosive    -> 50
killed, else (body)  -> 60   (10 hit + 50 kill)
```

### Damage-vs-round crossover — `B.oneShotCrossoverRound(weaponId)`
```
bestHit(w)      = (w.pellets ? w.damage*w.pellets : w.damage) * w.headshotMult
crossover(w)    = max round r such that bestHit(w) >= health(r), or 0
```
This is the number that defines the game's difficulty pacing: it's the round
at which a weapon stops being a reliable one-shot headshot (or, for
shotguns, a reliable point-blank one-shot) and starts requiring multiple
hits. See the full table below.

## 5. Edge Cases

- **Melee vs. the health-pool model.** `B.PLAYER.meleeDamage` is set to 150
  per the spec brief, but 150 raw damage run through the normal
  damage-vs-`roundHealth` pipeline would stop one-shotting after round 1
  (round 2 health is already 250) — which contradicts the real game, where
  the knife is a **guaranteed instant kill on any zombie at any round**,
  full stop. We resolve this with `B.PLAYER.meleeAlwaysKills = true`: combat
  code must special-case melee-vs-zombie as an unconditional kill and must
  **not** compare `meleeDamage` against `roundHealth`. `meleeDamage` (150)
  is retained only for non-zombie targets (breakable props, glass). This is
  called out loudly in the code comment because it is the one place in the
  balance table where "the number on the field" and "the actual game rule"
  intentionally diverge — get this wrong in `17_zombie.js` and knife rounds
  silently stop working past round 1.
- **Zombie speed spread vs. the sprint cap.** At round 13+, an individual
  zombie's speed can be boosted by up to `zombieSpeedSpread.max` (1.15x),
  giving a worst-case instantaneous speed of 4.6 * 1.15 = 5.29 m/s — still
  under the player's 5.6 m/s sprint, but only by ~0.3 m/s. Any future change
  to either the sprint cap, the spread range, or player sprint speed MUST
  re-verify this margin; `B.validate()` currently only checks the
  unmodified 4.6 m/s tier speed, not the worst-case spread. Flagged as a
  balance risk below.
- **Bolt-action rifles crossing over *later* than the most expensive wall
  gun.** The Kar98k (200 pts) has a longer one-shot-headshot window (round
  13) than the BAR (1800 pts, crossover round 2) — this is intentional and
  matches the real game's bolt-action headshot behavior, but it means
  "spend more, get strictly better" is *false* for one-shot potential. BAR
  wins on sustained DPS/mag capacity/multi-target clearing, Kar98k wins on
  precision economy. See Tuning Knobs / risk list.
- **Flamethrower and Panzerschreck don't fit the one-shot model cleanly.**
  The flamethrower is a damage-over-time weapon (`dot:true`); use `B.dps()`
  and `health(r)/dps` for its time-to-kill, not
  `B.oneShotCrossoverRound`. The Panzerschreck is a guaranteed kill anywhere
  inside its splash radius regardless of the target's exact health once that
  health is below the blast's effective damage — its crossover number
  (round 16) is provided for consistency but is less meaningful than for a
  precision weapon.
- **Round 0 / negative rounds.** All round-taking functions clamp their
  input to a minimum of 1 (`Math.max(1, round | 0)`), so a caller passing 0
  or a negative number silently behaves as round 1 rather than throwing.
- **Player count outside 1-4.** `players` is clamped to `[1,4]` everywhere
  it's used; a caller passing 5+ or 0 gets solo/quad behavior rather than a
  crash or unbounded scaling.
- **Quick Revive's 4th purchase.** `B.perkCost` will happily compute a cost
  for purchase index 3 (2000*2=4000) even though `maxPurchasesSolo:3` caps
  it at index 2. Enforcing the cap is `19_econ.js`'s job — `Z.B` only
  supplies the pricing formula, not the purchase-count gate.

## 6. Dependencies

- **Reads**: `Z.M` (`01_math.js`) for `clamp`, `clamp01`, `lerp`. No other
  module dependencies — `Z.B` loads third, right after `Z.RNG`, and must
  stay side-effect-free and RNG-free so it can be required standalone by
  tooling/tests.
- **Read by**: `15_weapons.js` (weapon stats, fire logic), `16_player.js`
  (movement/health/melee constants), `17_zombie.js` (health, speed, melee
  damage — **must** implement the `meleeAlwaysKills` special case),
  `18_rounds.js` (round pacing: health, count, spawn delay, maxAlive),
  `19_econ.js` (points, prices, perks, box, powerups — **must** enforce
  `maxPurchasesSolo`), `20_hud.js`/`21_menu.js` (display only, read-only).
- **Cross-references**: `docs/architecture/MODULE-CONTRACTS.md` for the
  required export list; `design/registry/entities.yaml` for any
  cross-system item facts (currently empty — see note at the end of this
  document about registering weapons/perks/points).

## 7. Tuning Knobs

| Knob | Location | Effect of raising it |
|---|---|---|
| `HEALTH_R9` / the `*1.1` compounding rate | `roundHealth` | Shifts every weapon's crossover round earlier (harder) or later (easier) |
| `ROUND_COUNT_TABLE` (r1-10) + the `9n + 0.15n²` ramp | `roundZombieCount` | Round length / horde pressure |
| `SPAWN_DELAY_START` / `SPAWN_DELAY_FLOOR` / `SPAWN_DELAY_ROUNDS` | `spawnDelay` | How fast the game escalates from a slow trickle to a firehose |
| `ZOMBIE_SPEED_TIERS` (esp. the 4.6 sprint cap) | `zombieSpeedTier` | **Load-bearing** — any increase toward or past 5.6 breaks kiting as a strategy at high rounds |
| `zombieSpeedSpread` | horde raggedness | Wider spread = more readable individual threats but risks the sprint-cap margin (see Edge Cases) |
| Per-weapon `damage` / `headshotMult` | `WEAPONS` | Directly moves that weapon's crossover round; re-run `oneShotCrossoverRound` after any change |
| `B.BOX.weights` | Mystery Box | Pull odds per weapon; keep Ray Gun rare (currently ~0.5%) |
| `B.PERKS[].cost` / `costMultiplier` | Perks | Economy pressure — how many rounds of grinding a perk "costs" |
| `B.POWERUP_CHANCE` / the `powerupDropChance` ramp | Power-ups | Overall generosity of the drop economy |
| `B.BARRICADE.tearTimePerBoard*` | Barricades | How much a full window commits vs. how fast late-game zombies punch through |

## 8. Acceptance Criteria

All of the following are enforced by `B.validate()` and must return `[]`:

1. `roundHealth(1) === 150`, `roundHealth(9) === 950`, strictly increasing
   integer for every round 1-60.
2. `roundZombieCount(r, 1)` matches the reference milestones exactly for
   r = 1..10: `[6,8,13,18,24,27,28,28,29,33]`; stays a positive integer
   through round 40.
3. `maxAlive(1) === 24`.
4. `spawnDelay(r)` is monotonic non-increasing and stays within
   `[0.2, 2.0]` for rounds 1-40.
5. The zombie sprint-tier speed (round 13+) is strictly less than
   `B.PLAYER.speedSprint`, and no round's `zombieSpeed(r)` (1-40) exceeds it.
6. `B.ZOMBIE.meleeDamage * 2 === B.PLAYER.health` (100) and
   `B.ZOMBIE.meleeDamage * 5 === juggernog.effect.maxHealth` (250).
7. `awardForDamage` totals exactly 60 (body kill), 100 (headshot kill), 130
   (melee kill), 10 (non-lethal hit).
8. Every `B.WEAPONS` entry has a unique id, a valid `class`, all required
   numeric fields present and finite, a `rangeFalloff` and `recoil` object,
   and exactly one of `wallCost` (non-null) / `boxOnly:true` (except the
   documented m1911/knife exceptions). Every non-melee weapon's
   one-shot-headshot crossover round resolves within 300 rounds (i.e., no
   silently-unbounded damage value).
9. `ammoRefillCost(id) === round(wallCost * 0.5)` for every wall weapon.
10. Every id in `B.BOX.weights` resolves to a real weapon; pool total weight
    > 0; `teddyBearChance` in (0,1).
11. Exactly 4 perks, each with a positive cost; Quick Revive's purchase
    sequence is exactly `[500, 1000, 2000]` for purchases 0-2.
12. At least one powerup defined, each with positive weight;
    `POWERUP_CHANCE` in (0,1); `MAX_POWERUPS_PER_ROUND` positive.
13. `boardsPerWindow === 6`; `boardTearTime(1)` equals the base value and
    `boardTearTime` at a very high round equals the floor value.
14. `startingPoints` positive; `startingWeapon` resolves to a real weapon id.

---

### Reference: round table, rounds 1-20 (solo)

Generated by `B.TABLE_SUMMARY(20, 1)` — see the economy-designer's session
report for the full 1-30 table and derivation notes.

| Round | Health | Count | Speed (m/s) | Spawn delay (s) |
|---|---|---|---|---|
| 1 | 150 | 6 | 1.00 | 2.000 |
| 2 | 250 | 8 | 1.13 | 1.772 |
| 3 | 350 | 13 | 1.27 | 1.569 |
| 4 | 450 | 18 | 1.40 | 1.390 |
| 5 | 550 | 24 | 1.90 | 1.232 |
| 6 | 650 | 27 | 2.13 | 1.091 |
| 7 | 750 | 28 | 2.37 | 0.967 |
| 8 | 850 | 28 | 2.60 | 0.856 |
| 9 | 950 | 29 | 3.20 | 0.759 |
| 10 | 1045 | 33 | 3.43 | 0.672 |
| 11 | 1150 | 42 | 3.67 | 0.595 |
| 12 | 1265 | 52 | 3.90 | 0.527 |
| 13 | 1392 | 61 | 4.60 | 0.467 |
| 14 | 1531 | 71 | 4.60 | 0.414 |
| 15 | 1684 | 82 | 4.60 | 0.367 |
| 16 | 1852 | 92 | 4.60 | 0.325 |
| 17 | 2037 | 103 | 4.60 | 0.288 |
| 18 | 2241 | 115 | 4.60 | 0.255 |
| 19 | 2465 | 126 | 4.60 | 0.226 |
| 20 | 2712 | 138 | 4.60 | 0.200 |

### Reference: weapon one-shot-headshot crossover rounds

| Weapon | Wall cost | Box only | Best hit dmg (hs, pt-blank) | Crossover round |
|---|---|---|---|---|
| M1911 | — | no | 80 | 0 (never) |
| Kar98k | 200 | no | 1500 | 13 |
| M1A1 Carbine | 600 | no | 200 | 1 |
| Gewehr 43 | 600 | no | 250 | 2 |
| Double-Barrelled Shotgun | 1200 | no | 720 | 6 |
| Sawed-Off | 1200 | no | 480 | 4 |
| Thompson | 1200 | no | 120 | 0 (never) |
| BAR | 1800 | no | 300 | 2 |
| MP40 | — | yes | 110 | 0 (never) |
| Type 100 | — | yes | 130 | 0 (never) |
| STG-44 | — | yes | 180 | 1 |
| FG42 | — | yes | 220 | 1 |
| Browning M1919 | — | yes | 260 | 2 |
| Trench Gun | — | yes | 880 | 8 |
| .357 Magnum | — | yes | 300 | 2 |
| Springfield | — | yes | 1950 | 16 |
| PTRS-41 | — | yes | 4500 | 25 |
| Panzerschreck | — | yes | 2000 | 16 (splash — see Edge Cases) |
| Ray Gun | — | yes | 1000 | 9 (splash/DPS not counted — see Edge Cases) |
| M2 Flamethrower | — | yes | n/a (DOT) | use `B.dps()` instead |

Weapons that "never" one-shot-headshot (M1911, Thompson, MP40, Type 100) are
not undertuned — they're SMG/pistol-class weapons that win on sustained DPS
and mag capacity, not alpha damage. This is intentional and matches WaW.
