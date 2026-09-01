# Nacht der Untoten — Level Design

Recreation of the Call of Duty: World at War map, built as procedural geometry
in `src/game/09_level.js`. Every number below is the one the code actually uses;
`tools/harness/check-level.mjs` verifies the claims in this document on each build.

## 1. Overview

A bombed-out two-storey German farmhouse standing alone in absolute darkness.
Interior footprint 20 m × 16 m, ground-floor ceiling 3.3 m, upper floor at
3.6 m, roof at 6.9 m. Outside the walls is an 8 m ring of mud and then nothing —
the fog swallows everything past ~30 m, so the building is the entire world.

## 2. Player Fantasy

Trapped. The map is small enough to cross in six seconds and every room is a
dead end you have to leave before it fills. The only progression is spatial:
1000 points buys a staircase, and the staircase is the only thing that changes
the shape of the night.

## 3. Layout

```
            x=-10          x=3           x=10
      z=-8  +--------------+-------------+
            |              |             |   N wall: 4 ground windows (n1-n4)
            |  MAIN HALL   |  NE ROOM    |   + 2 upper windows (n5, n6)
            |  (spawn)     |             |
      z=-2  |      ,-------+  [door]     |   E stair rises -7.6 -> -2.0
            |      | CONN  |             |
      z= 1  |======+=======+             |   upper divider wall, x=3
      z= 3  |   CATWALK    |             |
            |              |  SE ROOM    |   double-height, fire barrel
      z= 8  +--------------+-------------+
             ^W stair rises 7.6 -> 3.0
```

**Ground floor.** One large hall where the player spawns, divided from the east
side by a wall at x=3 with two doorways (z −5.6..−3.4 and z 3.4..5.6). Those two
doorways are what make the ground floor a *loop* rather than a pocket.

**Upper floor.** Covers the HELP room (z −8..−2 over the main hall), a narrow
connector strip (x 1..3, z −2..1), the catwalk (z 1..3), and the whole east side
(z −8..2). Everything else is open to the floor below. Those openings are not
decoration — they are the escape routes, and the drop is 3.6 m, under the 6 m
fall-damage threshold, so dropping through is always free.

## 4. Windows (13)

| id | wall | position | floor | room |
|----|------|----------|-------|------|
| n1 | north | x −7.6 | ground | main |
| n2 | north | x −3.4 | ground | main |
| n3 | north | x 0.6 | ground | main |
| n4 | north | x 6.4 | ground | ne |
| w1 | west | z −4.6 | ground | main |
| w2 | west | z 0.4 | ground | main |
| s1 | south | x −6.2 | ground | main |
| s2 | south | x −1.2 | ground | main |
| e1 | east | z 5.2 | ground | se |
| n5 | north | x −6.0 | upper | help |
| n6 | north | x −1.0 | upper | help |
| e2 | east | z −5.0 | upper | east_up |
| w3 | west | z 2.0 | upper | catwalk |

Openings are 1.15 m wide × 1.25 m tall with a 0.95 m sill, boarded with six
planks each at slightly wrong angles so a barricade looks nailed up in a hurry.
The player can shoot through the gaps between planks; zombies tear them off one
at a time and only climb through once the window is bare.

**Upstairs windows queue on the ground.** A zombie assigned to n5/n6/e2/w3
stands on the mud outside at y=0 and scales the wall (a 2.6 s climb instead of
1.45 s). Putting the queue point at the window's own height would leave it
hanging in mid-air with no navigation node beneath it.

## 5. Buys

| buy | cost | where | room |
|-----|------|-------|------|
| Kar98k | 200 | north wall, x −8.6 | main |
| Stielhandgranate | 250 | west wall, z −6.6 | main |
| M1A1 Carbine | 600 | south wall, x −3.8 | main |
| Double-Barrelled Shotgun | 1200 | north wall, x 4.6 | ne |
| Gewehr 43 | 600 | north wall upper, x −7.2 | help |
| BAR | 1800 | west wall upper, z −5.6 | help |
| Thompson | 1200 | west wall, catwalk, z 2.4 | catwalk |
| Sawed-Off Shotgun | 1200 | east wall upper, z −3.2 | east_up |
| **Debris — west stair** | **1000** | south end of the west wall | main |
| **Debris — east stair** | **1000** | north end of the east wall | ne |

The cheap guns are downstairs and the good ones are upstairs behind a 1000-point
staircase, so the debris purchase is the moment the run opens up. Chalk outlines
are drawn as real wall geometry (not decals) so they light and fog with the wall
they are painted on, and their prices are generated from `Z.B` — the chalk can
never disagree with what the game charges.

## 6. Perks and the Mystery Box

Perk machines are a deliberate addition — the original Nacht der Untoten has
none — placed so each is a spatial commitment:

| perk | cost | position | why there |
|------|------|----------|-----------|
| Quick Revive | 500 | main hall, x −9.0 z −3.4 | near spawn; the safety net |
| Juggernog | 2500 | HELP room, x −8.2 z −6.9 | deepest point on the map |
| Speed Cola | 3000 | east upper, x 7.4 z −7.0 | far corner, opposite Jugg |
| Double Tap | 2000 | SE room, x 8.6 z 6.4 | ground floor, but the wrong end |

Mystery box spots: main hall (−1.8, 4.6), HELP room (−3.0, −5.4), east upper
(6.2, −0.6), SE room (5.4, 5.4). The box moves between them after a teddy bear.

## 7. Lighting

Six sources, all weak. A swinging bulb over the main hall (amber, flickering),
a fire barrel in the SE room, a dim bulb on the east upper floor, a dying bulb
in the HELP room, and two cold moon shafts through the blown-open roof. Ambient
is a cold hemispheric term barely above black. If a room looks evenly lit,
something is wrong.

## 8. Training Loops (verified, not asserted)

`check-level.mjs` proves both of these by simulating `Z.Phys.move` with a
player-sized body rather than by flood-filling a grid — a 0.34 m radius body
always overlaps the next riser on a staircase, so a purely geometric test
reports every staircase in the game as impassable.

1. **Ground loop.** Main hall → north doorway (z −5.6..−3.4) → NE/SE rooms →
   south doorway (z 3.4..5.6) → main hall. Verified traversable in both
   directions.
2. **Two-floor loop.** Catwalk → the x=3 gap at z 0.8..2 → east upper → east
   stair down → NE room → north doorway → main hall → west stair → catwalk.
   Requires both debris purchases.

## 9. Verification

`node tools/harness/check-level.mjs` asserts, every run:

- no degenerate or non-finite brushes
- every window's inside drop point, outside queue point and repair position is
  in open space
- every window has exactly 6 board slots
- every wall buy, perk machine and box spot is standable and reachable
- the upper floor is **unreachable** before the debris is cleared and
  **reachable** after — both directions of the gate
- both training loops are traversable
- every zombie spawn zone is in open space

`node tools/harness/check-nav.mjs` additionally proves every window links into
the navigation graph and that a zombie can path from every spawn zone to its
window and from every window's inside drop point to the player.

## 10. Deviations from the original

- **Perk-a-Cola machines** do not exist in the real Nacht der Untoten. Added on
  request; priced to WaW/Verrückt canon and placed to cost the player position.
- Exact wall-gun placement is reconstructed rather than measured — the room
  shapes, the debris-gated staircases, the HELP scrawl, the drop-through holes
  and the window count are the load-bearing fidelity, and those are matched.
- Decoration is dropped automatically if it would land on a window approach, a
  wall buy, a perk machine or the spawn point. 19 of 34 clutter pieces are
  currently culled this way; the map reads slightly barer than intended as a
  result, which is a known trade against never blocking a barricade.
