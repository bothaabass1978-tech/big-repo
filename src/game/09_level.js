// ---------------------------------------------------------------------------
// 09_level.js — Nacht der Untoten.
//
// A bombed-out two-storey German farmhouse standing alone in absolute
// darkness. Roughly 21 x 17 m of interior. The smallness IS the design: every
// sightline is short, every room is a trap, and the only thing that opens the
// map up is spending 1000 points to clear a staircase.
//
// Layout (top-down, -Z is north / up the page):
//
//        x=-10        x=3        x=10
//   z=-8  +------------+-----------+
//         | MAIN HALL  | NE ROOM   |   ground: north wall has 4 windows
//         |            |           |   upper : HELP room over the main hall
//   z=-2  |     ,------+ (door)    |
//         |     |CONN  |           |
//   z=1   |=====+======+ (upper    |
//   z=3   | CATWALK    |  divider) |
//         |            |           |
//   z=8   +------------+-----------+
//          ^west stair            ^east stair (both behind 1000pt debris)
//
// Upper floor covers: HELP room (z -8..-2), a connector strip (x 1..3,
// z -2..1), the catwalk (z 1..3) and the whole east side (z -8..2). Everything
// else is open to the floor below — those holes are the escape routes.
// ---------------------------------------------------------------------------
(function () {
  const L = {};
  Z.Level = L;
  const M = Z.M;

  // --- dimensions -----------------------------------------------------------
  const X0 = -10, X1 = 10;        // interior extents
  const Z0 = -8, Z1 = 8;
  const WALL = 0.35;              // wall thickness
  const DIV = 3;                  // x of the interior dividing wall
  const C1 = 3.30;                // ground-floor ceiling (underside of slab)
  const SLAB = 0.30;
  const UP = C1 + SLAB;           // 3.60 — upper floor walking surface
  const C2 = UP + 3.00;           // 6.60 — upper ceiling
  const ROOF = C2 + 0.30;

  const SILL = 0.95, HEAD = 2.20, WIN_W = 1.15;   // window opening
  const SILL2 = UP + 0.95, HEAD2 = UP + 2.20;

  L.DIMS = { X0, X1, Z0, Z1, WALL, DIV, C1, SLAB, UP, C2, ROOF, SILL, HEAD, WIN_W };

  const rng = Z.RNG.make(Z.ART_SEED ^ 0x4E41);

  let brushes, meshes, windows, buys, perkSpots, boxSpots, spawnZones, lights, navSeeds;

  function box(min, max, mat, opts) {
    const b = {
      min: [min[0], min[1], min[2]],
      max: [max[0], max[1], max[2]],
      mat: mat,
      solid: true,
      faces: 63,
      uvScale: 0.5,
    };
    if (opts) for (const k in opts) b[k] = opts[k];
    brushes.push(b);
    return b;
  }

  // Queued decoration. Emitted only if it does not intrude on a reserved
  // zone (window approach, wall-buy, perk machine, box spot, player start).
  let pendingClutter = [];
  // `opts.lowProfile` marks a prop short enough to step over. Those are
  // allowed inside a window's approach slab: a knee-high crate beside a
  // window is set dressing, and cannot stop a player repairing or a zombie
  // landing, whereas a chest-high one in front of it would.
  function clutter(min, max, mat, opts) {
    pendingClutter.push({ min, max, mat, opts });
  }

  // Narrow a window's approach slab along the wall, keeping its depth.
  function shrinkAlong(r) {
    const a = r.along || [1, 0, 0];
    const cx = (r.min[0] + r.max[0]) / 2, cz = (r.min[2] + r.max[2]) / 2;
    const hx = (r.max[0] - r.min[0]) / 2, hz = (r.max[2] - r.min[2]) / 2;
    const sx = a[0] ? 0.45 : 1, sz = a[2] ? 0.45 : 1;
    return {
      min: [cx - hx * sx, r.min[1], cz - hz * sz],
      max: [cx + hx * sx, r.max[1], cz + hz * sz],
    };
  }

  function aabbHit(min, max, r) {
    return max[0] > r.min[0] && min[0] < r.max[0]
      && max[1] > r.min[1] && min[1] < r.max[1]
      && max[2] > r.min[2] && min[2] < r.max[2];
  }

  function reserveAround(p, rad, hgt) {
    return {
      min: [p[0] - rad, p[1] - 0.05, p[2] - rad],
      max: [p[0] + rad, p[1] + (hgt === undefined ? 2.0 : hgt), p[2] + rad],
    };
  }

  function emitClutter(reserved) {
    let kept = 0, dropped = 0;
    for (const c of pendingClutter) {
      const low = !!(c.opts && c.opts.lowProfile) && (c.max[1] - c.min[1]) <= 0.44;
      let blocked = false;
      for (const r of reserved) {
        // A short prop may sit BESIDE a window but never in front of it: the
        // approach slab keeps its full depth and loses half its width, so the
        // landing point and the repair stance stay clear while the flanks open
        // up for set dressing. Skipping the slab outright put crates on the
        // spawn point itself, which check-level catches immediately.
        if (low && r.kind === 'window') {
          if (aabbHit(c.min, c.max, shrinkAlong(r))) { blocked = true; break; }
          continue;
        }
        if (aabbHit(c.min, c.max, r)) { blocked = true; break; }
      }
      if (blocked) { dropped++; continue; }
      box(c.min, c.max, c.mat, c.opts);
      kept++;
    }
    pendingClutter = [];
    L._clutterStats = { kept, dropped };
  }

  // -------------------------------------------------------------------------
  // wall(): a slab with rectangular holes punched through it.
  //   axis 'x' -> runs along X at a fixed Z band.  axis 'z' -> along Z at X.
  //   holes are {u0,u1,v0,v1} in (along-axis, world height) coordinates.
  // -------------------------------------------------------------------------
  function wall(o) {
    const holes = (o.holes || []).slice().sort((a, b) => a.u0 - b.u0);
    const segs = [];
    let cur = o.from;
    for (const h of holes) {
      if (h.u0 > cur + 0.001) segs.push({ u0: cur, u1: h.u0, v0: o.y0, v1: o.y1 });
      if (h.v0 > o.y0 + 0.001) segs.push({ u0: h.u0, u1: h.u1, v0: o.y0, v1: h.v0 });
      if (h.v1 < o.y1 - 0.001) segs.push({ u0: h.u0, u1: h.u1, v0: h.v1, v1: o.y1 });
      cur = Math.max(cur, h.u1);
    }
    if (cur < o.to - 0.001) segs.push({ u0: cur, u1: o.to, v0: o.y0, v1: o.y1 });

    const t = o.thick === undefined ? WALL : o.thick;
    for (const s of segs) {
      if (o.axis === 'x') {
        box([s.u0, s.v0, o.at], [s.u1, s.v1, o.at + t], o.mat, o.opts);
      } else {
        box([o.at, s.v0, s.u0], [o.at + t, s.v1, s.u1], o.mat, o.opts);
      }
    }
    return segs.length;
  }

  // -------------------------------------------------------------------------
  // Windows
  // -------------------------------------------------------------------------
  // side: 'n' (north wall, normal +Z), 's' (+? -Z), 'w' (+X), 'e' (-X)
  const SIDE_NORMAL = { n: [0, 0, 1], s: [0, 0, -1], w: [1, 0, 0], e: [-1, 0, 0] };

  function makeWindow(id, side, u, floorY, room) {
    const n = SIDE_NORMAL[side];
    const sill = floorY + 0.95;
    const cy = sill + (HEAD - SILL) * 0.5;
    let pos;
    if (side === 'n') pos = [u, cy, Z0];
    else if (side === 's') pos = [u, cy, Z1];
    else if (side === 'w') pos = [X0, cy, u];
    else pos = [X1, cy, u];

    // Zombies always queue on the ground outside, even for upstairs windows —
    // they scale the wall to get in, exactly as they do in the real game.
    // Putting `out` at the window's own floor height would leave it hanging in
    // mid-air with no navigation node under it.
    const out = [pos[0] - n[0] * 1.25, 0, pos[2] - n[2] * 1.25];
    const inPos = [pos[0] + n[0] * 0.95, floorY, pos[2] + n[2] * 0.95];
    const repairFrom = [pos[0] + n[0] * 1.15, floorY, pos[2] + n[2] * 1.15];

    // Six planks nailed across the opening at slightly wrong angles, so a
    // boarded window looks hand-made and desperate rather than tidy.
    const boardSlots = [];
    const along = (side === 'n' || side === 's') ? [1, 0, 0] : [0, 0, 1];
    for (let i = 0; i < 6; i++) {
      const ty = sill - 0.06 + (i + 0.5) * ((HEAD - SILL) + 0.12) / 6;
      const roll = rng.sym(0.10) + (i % 2 ? 0.035 : -0.035);
      const slide = rng.sym(0.09);
      boardSlots.push({
        pos: [pos[0] + along[0] * slide, ty, pos[2] + along[2] * slide],
        yaw: (side === 'n' || side === 's') ? 0 : Math.PI / 2,
        roll: roll,
        len: WIN_W + 0.42,
        w: 0.155,
        t: 0.05,
      });
    }

    const w = {
      id, side, room,
      pos, normal: n.slice(), out, inPos, repairFrom,
      boards: 6, maxBoards: 6,
      floorY,
      boardSlots,
      openW: WIN_W, openY0: sill, openY1: sill + (HEAD - SILL),
    };
    windows.push(w);
    return w;
  }

  // Punch the matching hole into whichever wall the window belongs to.
  function winHole(w) {
    const u = (w.side === 'n' || w.side === 's') ? w.pos[0] : w.pos[2];
    return { u0: u - WIN_W / 2, u1: u + WIN_W / 2, v0: w.openY0, v1: w.openY1 };
  }

  // -------------------------------------------------------------------------
  // Stairs
  // -------------------------------------------------------------------------
  function stair(o) {
    // Rises from `zFrom` to `zTo` (or xFrom/xTo) over `steps` treads.
    const steps = o.steps;
    const rise = (o.top - o.bottom) / steps;
    const dz = (o.zTo - o.zFrom) / steps;
    for (let i = 0; i < steps; i++) {
      const za = o.zFrom + dz * i;
      const zb = o.zFrom + dz * (i + 1);
      const y = o.bottom + rise * (i + 1);
      box([o.x0, o.bottom - 0.2, Math.min(za, zb)], [o.x1, y, Math.max(za, zb)],
        'wood_stair', { group: o.group, uvScale: 0.7 });
    }
  }

  // -------------------------------------------------------------------------
  // build()
  // -------------------------------------------------------------------------
  L.build = function () {
    brushes = []; meshes = []; windows = []; buys = [];
    perkSpots = []; boxSpots = []; spawnZones = []; lights = []; navSeeds = [];
    rng.reseed(Z.ART_SEED ^ 0x4E41);

    // ---- exterior ground: mud ring, then the void ------------------------
    // The outdoor ground spans the whole map, including under the building,
    // and the interior wood floor's top face is also at y=0. Two coplanar
    // surfaces z-fight, and which one wins varies with view angle and depth
    // precision — that is the "spilled paper / snow" blotching on the floor
    // that three separate reviews attributed to a texture. Drop the ground a
    // few centimetres so the two never coincide; it is far below the 0.46 m
    // step-up, so nothing about walking or climbing in changes.
    box([-24, -0.45, -22], [24, -0.04, 22], 'dirt_ground', { uvScale: 0.25, group: 'outside' });

    // ---- ground floor slab -----------------------------------------------
    box([X0 - WALL, -0.30, Z0 - WALL], [X1 + WALL, 0, Z1 + WALL], 'wood_floor',
      { uvScale: 0.45, group: 'floor1' });

    // ---- windows (declare before walls so we can punch the holes) --------
    // Ground floor
    const wN1 = makeWindow('n1', 'n', -7.6, 0, 'main');
    const wN2 = makeWindow('n2', 'n', -3.4, 0, 'main');
    const wN3 = makeWindow('n3', 'n', 0.6, 0, 'main');
    const wN4 = makeWindow('n4', 'n', 6.4, 0, 'ne');
    const wW1 = makeWindow('w1', 'w', -4.6, 0, 'main');
    const wW2 = makeWindow('w2', 'w', 0.4, 0, 'main');
    const wS1 = makeWindow('s1', 's', -6.2, 0, 'main');
    const wS2 = makeWindow('s2', 's', -1.2, 0, 'main');
    const wE1 = makeWindow('e1', 'e', 5.2, 0, 'se');
    // Upper floor
    const wN5 = makeWindow('n5', 'n', -6.0, UP, 'help');
    const wN6 = makeWindow('n6', 'n', -1.0, UP, 'help');
    const wE2 = makeWindow('e2', 'e', -5.0, UP, 'east_up');
    const wW3 = makeWindow('w3', 'w', 2.0, UP, 'catwalk');

    // ---- exterior walls ---------------------------------------------------
    // North (z = Z0-WALL .. Z0), normal into building is +Z
    wall({
      axis: 'x', at: Z0 - WALL, from: X0 - WALL, to: X1 + WALL, y0: 0, y1: ROOF,
      mat: 'plaster_wall', holes: [wN1, wN2, wN3, wN4, wN5, wN6].map(winHole),
      opts: { group: 'wall_n', uvScale: 0.3 },
    });
    // South
    wall({
      axis: 'x', at: Z1, from: X0 - WALL, to: X1 + WALL, y0: 0, y1: ROOF,
      mat: 'plaster_wall', holes: [wS1, wS2].map(winHole),
      opts: { group: 'wall_s', uvScale: 0.3 },
    });
    // West
    wall({
      axis: 'z', at: X0 - WALL, from: Z0 - WALL, to: Z1 + WALL, y0: 0, y1: ROOF,
      mat: 'brick', holes: [wW1, wW2, wW3].map(winHole),
      opts: { group: 'wall_w', uvScale: 0.34 },
    });
    // East
    wall({
      axis: 'z', at: X1, from: Z0 - WALL, to: Z1 + WALL, y0: 0, y1: ROOF,
      mat: 'brick', holes: [wE1, wE2].map(winHole),
      opts: { group: 'wall_e', uvScale: 0.34 },
    });

    // ---- window frames (a lintel and jambs around each opening) ----------
    for (const w of windows) {
      const horiz = (w.side === 'n' || w.side === 's');
      const cx = w.pos[0], cz = w.pos[2];
      const t = WALL + 0.06;
      const zA = horiz ? (w.side === 'n' ? Z0 - WALL - 0.03 : Z1 - 0.03) : 0;
      if (horiz) {
        // jambs
        box([cx - WIN_W / 2 - 0.09, w.openY0 - 0.08, zA], [cx - WIN_W / 2, w.openY1 + 0.08, zA + t], 'window_frame', { uvScale: 1.6 });
        box([cx + WIN_W / 2, w.openY0 - 0.08, zA], [cx + WIN_W / 2 + 0.09, w.openY1 + 0.08, zA + t], 'window_frame', { uvScale: 1.6 });
        // sill + lintel
        box([cx - WIN_W / 2 - 0.09, w.openY0 - 0.08, zA], [cx + WIN_W / 2 + 0.09, w.openY0, zA + t], 'window_frame', { uvScale: 1.6 });
        box([cx - WIN_W / 2 - 0.09, w.openY1, zA], [cx + WIN_W / 2 + 0.09, w.openY1 + 0.08, zA + t], 'window_frame', { uvScale: 1.6 });
      } else {
        const xA = (w.side === 'w') ? X0 - WALL - 0.03 : X1 - 0.03;
        box([xA, w.openY0 - 0.08, cz - WIN_W / 2 - 0.09], [xA + t, w.openY1 + 0.08, cz - WIN_W / 2], 'window_frame', { uvScale: 1.6 });
        box([xA, w.openY0 - 0.08, cz + WIN_W / 2], [xA + t, w.openY1 + 0.08, cz + WIN_W / 2 + 0.09], 'window_frame', { uvScale: 1.6 });
        box([xA, w.openY0 - 0.08, cz - WIN_W / 2 - 0.09], [xA + t, w.openY0, cz + WIN_W / 2 + 0.09], 'window_frame', { uvScale: 1.6 });
        box([xA, w.openY1, cz - WIN_W / 2 - 0.09], [xA + t, w.openY1 + 0.08, cz + WIN_W / 2 + 0.09], 'window_frame', { uvScale: 1.6 });
      }
    }

    // ---- interior dividing wall, ground floor -----------------------------
    // Two doorways so the ground floor forms a loop you can train around.
    wall({
      axis: 'z', at: DIV, from: Z0, to: Z1, y0: 0, y1: C1,
      mat: 'wood_wall',
      holes: [
        { u0: -5.6, u1: -3.4, v0: 0, v1: 2.35 },
        { u0: 3.4, u1: 5.6, v0: 0, v1: 2.35 },
      ],
      opts: { group: 'div1' },
    });

    // ---- upper floor slabs ------------------------------------------------
    // HELP room over the main hall
    box([X0, C1, Z0], [DIV, UP, -2], 'wood_floor', { uvScale: 0.45, group: 'floor2' });
    // connector strip hugging the divider
    box([1, C1, -2], [DIV, UP, 1], 'wood_floor', { uvScale: 0.45, group: 'floor2' });
    // catwalk
    box([X0, C1, 1], [DIV, UP, 3], 'wood_floor', { uvScale: 0.45, group: 'floor2' });
    // east side, split around the stairwell opening
    box([DIV, C1, Z0], [8.2, UP, 2], 'wood_floor', { uvScale: 0.45, group: 'floor2' });
    box([8.2, C1, -2], [X1, UP, 2], 'wood_floor', { uvScale: 0.45, group: 'floor2' });

    // Exposed joists across the whole main-hall ceiling. Two short strips at
    // the broken floor edges left the largest surface in the room — the thing
    // directly above the player for the entire game — as blank planking. A
    // farmhouse of this age carries its structure on the inside, and the beams
    // are what give the ceiling depth under the swinging bulb.
    for (let x = X0 + 0.6; x < DIV; x += 1.15) {
      box([x, C1 - 0.20, Z0 + 0.1], [x + 0.16, C1, Z1 - 0.1], 'ceiling_wood',
        { uvScale: 1.2, solid: false });
    }
    // Deeper cross-beams the joists sit on, running the other way.
    for (const cz of [-5.2, -0.6, 4.4]) {
      box([X0 + 0.1, C1 - 0.32, cz], [DIV - 0.1, C1 - 0.20, cz + 0.26], 'ceiling_wood',
        { uvScale: 1.0, solid: false });
    }
    // The east rooms get the same treatment under their own ceiling.
    for (let x = DIV + 0.5; x < X1 - 0.4; x += 1.2) {
      box([x, C1 - 0.20, Z0 + 0.1], [x + 0.15, C1, Z1 - 0.1], 'ceiling_wood',
        { uvScale: 1.2, solid: false });
    }
    // And the upper floor, under the roof. The HELP room read as a solid black
    // ceiling because the joist treatment stopped at the ground floor — the
    // room you climb the stairs into had nothing overhead at all.
    for (let x = X0 + 0.6; x < X1 - 0.4; x += 1.25) {
      box([x, C2 - 0.22, Z0 + 0.1], [x + 0.17, C2, Z1 - 0.1], 'ceiling_wood',
        { uvScale: 1.2, solid: false });
    }
    for (const cz of [-5.4, -0.8, 4.0]) {
      box([X0 + 0.1, C2 - 0.34, cz], [X1 - 0.1, C2 - 0.22, cz + 0.28], 'ceiling_wood',
        { uvScale: 1.0, solid: false });
    }

    // ---- interior dividing wall, upper floor ------------------------------
    // Runs from the north wall to z = 0.8, leaving the last 1.2 m open as the
    // catwalk -> east-floor passage.
    wall({
      axis: 'z', at: DIV, from: Z0, to: 0.8, y0: UP, y1: C2,
      mat: 'wood_wall',
      holes: [{ u0: -4.6, u1: -2.6, v0: UP, v1: UP + 2.35 }],
      opts: { group: 'div2' },
    });

    // ---- HELP room south wall stub, so the room reads as a room ----------
    box([X0, UP, -2.15], [-6.4, C2, -2], 'plaster_wall', { uvScale: 0.5, group: 'help_wall' });
    // the famous scrawl, on the wall you see when you crest the stairs
    box([-5.2, UP + 0.9, -2.14], [-1.6, UP + 2.5, -2.06], 'sign_help',
      { uvScale: 1, solid: false, group: 'help_sign' });

    // ---- ceiling / roof ---------------------------------------------------
    // Roof with two blown-open holes that let the moon in.
    const roofHoles = [
      { x0: -4.5, x1: -1.2, z0: 3.6, z1: 6.8 },
      { x0: 4.8, x1: 7.2, z0: -6.4, z1: -4.0 },
    ];
    // Emit the roof as a grid, skipping cells that fall inside a hole.
    for (let x = X0; x < X1; x += 1.0) {
      for (let z = Z0; z < Z1; z += 1.0) {
        let skip = false;
        for (const h of roofHoles) {
          if (x + 1 > h.x0 && x < h.x1 && z + 1 > h.z0 && z < h.z1) { skip = true; break; }
        }
        if (skip) continue;
        box([x, C2, z], [x + 1.0, ROOF, z + 1.0], 'roof_shingle', { uvScale: 0.6, group: 'roof' });
      }
    }
    // roof beams
    for (let x = X0 + 1.4; x < X1; x += 2.6) {
      box([x, C2 - 0.24, Z0], [x + 0.20, C2, Z1], 'ceiling_wood', { uvScale: 1.0, solid: false, group: 'beams' });
    }

    // =====================================================================
    // Staircases + the 1000-point debris that gates them
    // =====================================================================
    // West stair: rises northward along the west wall, 8 -> 2, arriving on
    // the catwalk. The dividing rail stops short of the south wall so the
    // bottom of the flight stays open — that gap is the stair mouth, and the
    // debris pile is what plugs it.
    stair({ x0: X0, x1: -8.2, zFrom: 7.6, zTo: 3.0, bottom: 0, top: UP, steps: 15, group: 'stair_w' });
    box([-8.2, 0, 2.0], [-8.0, UP, 6.6], 'wood_wall', { uvScale: 0.6, group: 'stair_w_rail' });

    // East stair: rises southward along the east wall, -8 -> -2.
    stair({ x0: 8.2, x1: X1, zFrom: -7.6, zTo: -2.0, bottom: 0, top: UP, steps: 15, group: 'stair_e' });
    box([8.0, 0, -6.6], [8.2, UP, -2.0], 'wood_wall', { uvScale: 0.6, group: 'stair_e_rail' });

    // Debris piles. Tagged so removeDebris() can pull them out of the world.
    for (let i = 0; i < 5; i++) {
      const t = i / 5;
      box([X0 + rng.range(0, 0.3), 0, Z1 - 1.0 + t * 0.9],
        [-8.2 - rng.range(0, 0.3), 1.5 + rng.range(0, 0.8) - t * 0.5, Z1 - 0.9 + t * 0.9],
        'rubble', { debrisId: 'stairs_west', uvScale: 0.8, group: 'debris' });
      box([8.2 + rng.range(0, 0.3), 0, Z0 + 0.9 - t * 0.9],
        [X1 - rng.range(0, 0.3), 1.5 + rng.range(0, 0.8) - t * 0.5, Z0 + 1.0 - t * 0.9],
        'rubble', { debrisId: 'stairs_east', uvScale: 0.8, group: 'debris' });
    }

    // =====================================================================
    // Clutter — the stuff that makes it a place instead of a box.
    // Queued rather than emitted directly: anything that would land on a
    // window approach, a wall-buy, a perk machine or the spawn point gets
    // dropped once the reserved zones are known. Decoration must never cost
    // the player a barricade they cannot reach.
    // =====================================================================
    // overturned table in the main hall
    clutter([-6.4, 0, 1.2], [-4.6, 0.12, 2.6], 'wood_plank', { uvScale: 1.2 });
    clutter([-6.4, 0.12, 1.2], [-6.2, 0.95, 1.4], 'wood_plank', { uvScale: 1.4 });
    clutter([-4.8, 0.12, 2.4], [-4.6, 0.95, 2.6], 'wood_plank', { uvScale: 1.4 });
    // ammo crates
    const crates = [
      [-9.0, 0, -6.6, 0.9, 0.62, 0.7], [-8.1, 0, -6.5, 0.75, 0.55, 0.62],
      [1.2, 0, -6.9, 0.85, 0.6, 0.7], [5.6, 0, -7.2, 0.9, 0.62, 0.75],
      [-2.2, 0, 6.4, 0.8, 0.58, 0.66], [7.1, 0, 3.4, 0.85, 0.6, 0.7],
      [-9.2, UP, -5.2, 0.85, 0.6, 0.7], [4.2, UP, -6.6, 0.8, 0.58, 0.66],
    ];
    for (const c of crates) {
      clutter([c[0], c[1], c[2]], [c[0] + c[3], c[1] + c[4], c[2] + c[5]], 'crate_wood',
        { uvScale: 1.1, lowProfile: c[4] <= 0.44 });
    }
    // A dresser with its doors hanging off, against the west wall.
    clutter([X0 + 0.15, 0, -1.9], [X0 + 0.75, 1.35, -0.4], 'wood_plank', { uvScale: 1.1 });
    clutter([X0 + 0.72, 0.35, -1.85], [X0 + 0.86, 1.15, -1.15], 'wood_plank', { uvScale: 1.6 });
    // Bed frame, stripped, shoved against the north wall.
    clutter([-8.9, 0, Z0 + 0.2], [-7.1, 0.14, Z0 + 2.1], 'wood_plank', { uvScale: 1.3 });
    clutter([-8.9, 0.14, Z0 + 0.2], [-8.72, 0.86, Z0 + 2.1], 'wood_plank', { uvScale: 1.5 });
    clutter([-7.28, 0.14, Z0 + 0.2], [-7.1, 0.62, Z0 + 2.1], 'wood_plank', { uvScale: 1.5 });
    // Two chairs, one on its side.
    clutter([-2.6, 0, -2.4], [-2.1, 0.46, -1.9], 'wood_plank', { uvScale: 1.8 });
    clutter([-2.6, 0.46, -2.4], [-2.5, 1.06, -1.9], 'wood_plank', { uvScale: 2.0 });
    clutter([5.4, 0, 2.2], [6.1, 0.12, 2.7], 'wood_plank', { uvScale: 1.8 });
    clutter([5.4, 0.12, 2.6], [6.1, 0.62, 2.7], 'wood_plank', { uvScale: 2.0 });
    // A shelf unit in the north-east room.
    clutter([2.2, 0, Z0 + 0.15], [3.9, 1.65, Z0 + 0.5], 'wood_plank', { uvScale: 1.2 });
    clutter([2.2, 0.55, Z0 + 0.15], [3.9, 0.66, Z0 + 0.86], 'wood_plank', { uvScale: 1.4 });
    clutter([2.2, 1.12, Z0 + 0.15], [3.9, 1.23, Z0 + 0.86], 'wood_plank', { uvScale: 1.4 });

    // rusted barrels
    for (const b of [[-3.0, 0, -6.9], [8.6, 0, 5.6], [0.4, UP, -6.4]]) {
      clutter([b[0] - 0.32, b[1], b[2] - 0.32], [b[0] + 0.32, b[1] + 0.92, b[2] + 0.32],
        'barrel_metal', { uvScale: 1.4 });
    }
    // sandbags near a couple of windows
    for (const s of [[-7.6, 0, -6.6], [-1.2, 0, 6.8]]) {
      clutter([s[0] - 0.85, s[1], s[2] - 0.28], [s[0] + 0.85, s[1] + 0.55, s[2] + 0.28],
        'sandbag', { uvScale: 1.3, lowProfile: true });
    }
    // rubble drifts in the corners
    for (let i = 0; i < 18; i++) {
      const inHelp = i % 3 === 0;
      const y = inHelp ? UP : 0;
      const px = rng.range(X0 + 0.5, X1 - 1.2);
      const pz = inHelp ? rng.range(Z0 + 0.5, -2.6) : rng.range(Z0 + 0.5, Z1 - 1.2);
      if (inHelp && px > DIV - 0.6) continue;
      const w = rng.range(0.5, 1.5), d = rng.range(0.5, 1.3), h = rng.range(0.12, 0.42);
      clutter([px, y, pz], [px + w, y + h, pz + d], 'rubble', { uvScale: 0.9, lowProfile: true });
    }
    // torn posters
    box([-9.99, 1.15, -2.6], [-9.92, 2.15, -1.7], 'poster_faded', { uvScale: 1, solid: false });
    box([2.92, UP + 1.2, -6.2], [2.99, UP + 2.2, -5.3], 'poster_faded', { uvScale: 1, solid: false });
    // dried blood up the plaster
    box([-9.99, 0.05, 3.2], [-9.93, 1.9, 4.6], 'blood_wall', { uvScale: 1, solid: false });
    box([DIV + 0.01, 0.05, -1.4], [DIV + 0.06, 1.7, 0.2], 'blood_wall', { uvScale: 1, solid: false });

    // =====================================================================
    // Buys
    // =====================================================================
    const addBuy = (b) => { buys.push(b); return b; };

    // Wall weapons. Ground floor gets the cheap guns; the good ones live
    // upstairs so the 1000-point staircase spend actually buys you something.
    addBuy({ kind: 'weapon', id: 'kar98k', chalk: 'chalk_kar98k', cost: 200,
      pos: [-8.6, 1.45, Z0 + 0.02], yaw: 0, facing: [0, 0, 1], room: 'main',
      use: [-8.6, 0, Z0 + 1.1] });
    addBuy({ kind: 'weapon', id: 'stielhandgranate', chalk: 'chalk_grenade', cost: 250,
      pos: [X0 + 0.02, 1.45, -6.6], yaw: Math.PI / 2, facing: [1, 0, 0], room: 'main',
      use: [X0 + 1.1, 0, -6.6] });
    addBuy({ kind: 'weapon', id: 'm1a1_carbine', chalk: 'chalk_carbine', cost: 600,
      pos: [-3.8, 1.45, Z1 - 0.02], yaw: Math.PI, facing: [0, 0, -1], room: 'main',
      use: [-3.8, 0, Z1 - 1.1] });
    addBuy({ kind: 'weapon', id: 'db_shotgun', chalk: 'chalk_dbshotgun', cost: 1200,
      pos: [4.6, 1.45, Z0 + 0.02], yaw: 0, facing: [0, 0, 1], room: 'ne',
      use: [4.6, 0, Z0 + 1.1] });
    addBuy({ kind: 'weapon', id: 'gewehr43', chalk: 'chalk_gewehr43', cost: 600,
      pos: [-7.2, UP + 1.45, Z0 + 0.02], yaw: 0, facing: [0, 0, 1], room: 'help',
      use: [-7.2, UP, Z0 + 1.1] });
    addBuy({ kind: 'weapon', id: 'bar', chalk: 'chalk_bar', cost: 1800,
      pos: [X0 + 0.02, UP + 1.45, -5.6], yaw: Math.PI / 2, facing: [1, 0, 0], room: 'help',
      use: [X0 + 1.1, UP, -5.6] });
    addBuy({ kind: 'weapon', id: 'thompson', chalk: 'chalk_thompson', cost: 1200,
      pos: [X0 + 0.02, UP + 1.45, 2.4], yaw: Math.PI / 2, facing: [1, 0, 0], room: 'catwalk',
      use: [X0 + 1.1, UP, 2.4] });
    addBuy({ kind: 'weapon', id: 'sawed_off', chalk: 'chalk_sawnoff', cost: 1200,
      pos: [X1 - 0.02, UP + 1.45, -3.2], yaw: -Math.PI / 2, facing: [-1, 0, 0], room: 'east_up',
      use: [X1 - 1.1, UP, -3.2] });
    // The M1897 is one of the four wall guns the real map is known for, and it
    // had a price with nowhere to spend it. Upstairs, as on the original.
    addBuy({ kind: 'weapon', id: 'trench_gun', chalk: 'chalk_trenchgun', cost: 1500,
      pos: [5.8, UP + 1.45, Z0 + 0.02], yaw: 0, facing: [0, 0, 1], room: 'east_up',
      use: [5.8, UP, Z0 + 1.1] });

    // Ammo boxes stacked beside each wall gun. In the real map a chalk outline
    // never sits on bare plaster — there is always crate and box clutter under
    // it, which is half of why the walls read as busy. Offset along the wall so
    // they fall outside the 1.05 m reserve around the use point; clutter() culls
    // anything that intrudes anyway, so a misjudged one drops rather than
    // blocking the buy.
    for (const b of buys) {
      if (b.kind !== 'weapon' || !b.use) continue;
      const f = b.facing;
      const lx = -f[2], lz = f[0];                 // along the wall
      const fy = b.use[1];
      for (const side of [-1, 1]) {
        const cx = b.pos[0] + lx * 1.62 * side, cz = b.pos[2] + lz * 1.62 * side;
        const inward = 0.34;
        const ox = cx + f[0] * inward, oz = cz + f[2] * inward;
        if (side < 0) {
          clutter([ox - 0.42, fy, oz - 0.34], [ox + 0.42, fy + 0.42, oz + 0.34],
            'crate_wood', { uvScale: 1.1, lowProfile: true });
          // stacked, and turned a little so it is not a tower of clones
          clutter([ox - 0.28, fy + 0.42, oz - 0.26], [ox + 0.34, fy + 0.80, oz + 0.30],
            'crate_wood', { uvScale: 1.3 });
        } else {
          clutter([ox - 0.36, fy, oz - 0.30], [ox + 0.36, fy + 0.40, oz + 0.30],
            'crate_wood', { uvScale: 1.25, lowProfile: true });
        }
      }
    }

    // The HELP room's south wall stub is what a player faces cresting the
    // stairs, and it was bare concrete. Give it something to land on.
    clutter([-6.2, UP, -2.55], [-5.3, UP + 0.62, -2.05], 'crate_wood', { uvScale: 1.1 });
    clutter([-6.05, UP + 0.62, -2.5], [-5.4, UP + 1.06, -2.1], 'crate_wood', { uvScale: 1.3 });
    clutter([-4.6, UP, -2.5], [-3.9, UP + 0.5, -2.06], 'crate_wood', { uvScale: 1.2 });
    clutter([-3.1, UP, -2.52], [-2.78, UP + 0.9, -2.2], 'barrel_metal', { uvScale: 1.4 });
    clutter([-2.2, UP, -2.5], [-1.7, UP + 0.34, -2.1], 'rubble', { uvScale: 0.9 });

    // The chalk outlines are what tell the player a wall gun is even there.
    // They're real geometry rather than decals so they light and fog with the
    // wall they're drawn on.
    for (const b of buys) {
      if (b.kind !== 'weapon' || !b.chalk) continue;
      const f = b.facing;
      const h = 0.52, t = 0.035;           // square plate: exactly one tile
      const s = 1 / (h * 2);
      if (Math.abs(f[2]) > 0.5) {
        const z0 = f[2] > 0 ? b.pos[2] : b.pos[2] - t;
        box([b.pos[0] - h, b.pos[1] - h, z0], [b.pos[0] + h, b.pos[1] + h, z0 + t],
          b.chalk, {
            solid: false, uvScale: s, group: 'chalk',
            uvOffset: [-(b.pos[0] - h) * s, -(b.pos[1] - h) * s],
          });
      } else {
        const x0 = f[0] > 0 ? b.pos[0] : b.pos[0] - t;
        box([x0, b.pos[1] - h, b.pos[2] - h], [x0 + t, b.pos[1] + h, b.pos[2] + h],
          b.chalk, {
            solid: false, uvScale: s, group: 'chalk',
            uvOffset: [-(b.pos[2] - h) * s, -(b.pos[1] - h) * s],
          });
      }
    }

    // Debris. The use point sits beside the stair mouth, not on the treads.
    addBuy({ kind: 'debris', id: 'stairs_west', cost: 1000, pos: [-9.1, 1.0, Z1 - 0.5],
      room: 'main', opens: ['catwalk', 'help'], use: [-7.5, 0, 7.4],
      hint: 'Clear Debris' });
    addBuy({ kind: 'debris', id: 'stairs_east', cost: 1000, pos: [9.1, 1.0, Z0 + 0.5],
      room: 'ne', opens: ['east_up'], use: [7.5, 0, -7.4],
      hint: 'Clear Debris' });

    // =====================================================================
    // Perks, mystery box, lights
    // =====================================================================
    // Quick Revive sits near spawn; Juggernog is buried in the HELP room so
    // committing to it is a real risk. That spatial cost is the point.
    perkSpots.push({ id: 'quickrevive', pos: [-9.0, 0, -3.4], yaw: Math.PI / 2, room: 'main' });
    perkSpots.push({ id: 'juggernog', pos: [-8.2, UP, -6.9], yaw: 0, room: 'help' });
    perkSpots.push({ id: 'speedcola', pos: [7.4, UP, -7.0], yaw: 0, room: 'east_up' });
    perkSpots.push({ id: 'doubletap', pos: [8.6, 0, 6.4], yaw: -Math.PI / 2, room: 'se' });

    boxSpots.push({ pos: [-1.8, 0, 4.6], yaw: 0.3, room: 'main' });
    boxSpots.push({ pos: [-3.0, UP, -5.4], yaw: -0.4, room: 'help' });
    boxSpots.push({ pos: [6.2, UP, -0.6], yaw: 1.2, room: 'east_up' });
    boxSpots.push({ pos: [5.4, 0, 5.4], yaw: -1.1, room: 'se' });

    lights.push({ pos: [-3.2, 2.95, 0.4], color: [1.00, 0.70, 0.34], radius: 10.4,
      intensity: 1.95, flicker: 0.28, sway: 0.07, name: 'main_bulb' });
    lights.push({ pos: [8.4, 1.05, 5.9], color: [1.00, 0.48, 0.16], radius: 6.6,
      intensity: 1.55, flicker: 0.45, name: 'fire_barrel' });
    lights.push({ pos: [6.4, UP + 2.55, -4.2], color: [1.00, 0.74, 0.40], radius: 8.6,
      intensity: 1.52, flicker: 0.35, sway: 0.04, name: 'east_bulb' });
    lights.push({ pos: [-5.6, UP + 2.6, -5.0], color: [1.00, 0.68, 0.32], radius: 7.6,
      intensity: 1.16, flicker: 0.62, name: 'help_bulb' });
    lights.push({ pos: [-2.8, 4.4, 5.2], color: [0.40, 0.54, 0.90], radius: 8.4,
      intensity: 0.80, flicker: 0, name: 'moon_shaft_s' });
    lights.push({ pos: [6.0, UP + 2.4, -5.2], color: [0.38, 0.50, 0.88], radius: 6.4,
      intensity: 0.62, flicker: 0, name: 'moon_shaft_n' });
    // Four bulbs left the north-east ground room, the west wall and the
    // catwalk outside every radius, so a third of the playable floor — and
    // anything standing on it — resolved to flat black. One emitter per room.
    lights.push({ pos: [6.2, 2.90, -5.0], color: [1.00, 0.66, 0.30], radius: 9.6,
      intensity: 1.70, flicker: 0.32, sway: 0.06, name: 'ne_bulb' });
    lights.push({ pos: [-7.6, 2.85, -4.2], color: [1.00, 0.72, 0.38], radius: 9.0,
      intensity: 1.42, flicker: 0.24, sway: 0.05, name: 'west_bulb' });
    lights.push({ pos: [-7.0, 0.80, 5.8], color: [1.00, 0.45, 0.14], radius: 6.0,
      intensity: 1.15, flicker: 0.52, name: 'sw_embers' });
    lights.push({ pos: [0.8, UP + 2.45, -2.2], color: [1.00, 0.70, 0.36], radius: 7.0,
      intensity: 1.05, flicker: 0.40, sway: 0.05, name: 'catwalk_bulb' });

    // Every warm emitter was a bare point light with no geometry, so the rooms
    // had pools of amber coming from nowhere. The hanging bulb on its cord is
    // one of the most recognisable things in this map; give each ceiling light
    // a cord, a socket and a lit glass. The glass uses an emissive material so
    // it reads as the source rather than as a small pale object near it.
    for (const L of lights) {
      if (!/_bulb$/.test(L.name)) continue;         // barrels and moon shafts are not bulbs
      const [bx, by, bz] = L.pos;
      const ceil = by > UP ? C2 : C1;
      box([bx - 0.012, by + 0.115, bz - 0.012], [bx + 0.012, ceil, bz + 0.012],
        'barrel_metal', { uvScale: 6, solid: false });
      box([bx - 0.030, by + 0.045, bz - 0.030], [bx + 0.030, by + 0.125, bz + 0.030],
        'barrel_metal', { uvScale: 5, solid: false });
      box([bx - 0.052, by - 0.062, bz - 0.052], [bx + 0.052, by + 0.050, bz + 0.052],
        'bulb_glass', { uvScale: 1, solid: false });
    }

    // =====================================================================
    // Nav seeds + zombie spawn zones
    // =====================================================================
    navSeeds.push([-6, 0, 0], [-2, 0, -5], [-2, 0, 5], [1, 0, 0],
      [6, 0, -5], [6, 0, 5], [8.6, 0, 0], [4.4, 0, -4.5], [4.4, 0, 4.5],
      [-6, UP, -5], [-1, UP, -4], [2, UP, -0.5], [-6, UP, 2], [-2, UP, 2],
      [5, UP, -5], [7, UP, 0], [5.5, UP, 1.2]);
    for (const w of windows) navSeeds.push([w.inPos[0], w.floorY, w.inPos[2]]);

    // Zombies walk in out of the dark toward their window.
    for (const w of windows) {
      const n = w.normal;
      for (let k = 0; k < 3; k++) {
        const lateral = (k - 1) * 2.2;
        const px = w.out[0] - n[0] * rng.range(4.5, 8.5) + (n[2] !== 0 ? lateral : 0);
        const pz = w.out[2] - n[2] * rng.range(4.5, 8.5) + (n[0] !== 0 ? lateral : 0);
        spawnZones.push({ pos: [px, 0, pz], windowId: w.id });
      }
    }

    // ---- reserve the gameplay-critical footprints, then drop clutter -----
    const reserved = [];
    for (const w of windows) {
      // A generous slab in front of every window: the player must always be
      // able to stand there and repair, and zombies must be able to land.
      const n = w.normal;
      const c = [w.pos[0] + n[0] * 0.9, w.floorY, w.pos[2] + n[2] * 0.9];
      const along = Math.abs(n[0]) > 0.5 ? [0, 0, 1] : [1, 0, 0];
      reserved.push({
        kind: 'window', along: along,
        min: [Math.min(c[0] - along[0] * 1.1 - Math.abs(n[0]) * 1.2, c[0] - 1.0), w.floorY - 0.05,
          Math.min(c[2] - along[2] * 1.1 - Math.abs(n[2]) * 1.2, c[2] - 1.0)],
        max: [Math.max(c[0] + along[0] * 1.1 + Math.abs(n[0]) * 1.2, c[0] + 1.0), w.floorY + 2.4,
          Math.max(c[2] + along[2] * 1.1 + Math.abs(n[2]) * 1.2, c[2] + 1.0)],
      });
    }
    for (const b of buys) if (b.use) reserved.push(reserveAround(b.use, 1.05, 2.3));
    for (const p of perkSpots) reserved.push(reserveAround(p.pos, 1.5, 2.6));
    for (const s of boxSpots) reserved.push(reserveAround(s.pos, 1.5, 2.2));
    reserved.push(reserveAround([-5.5, 0, 3.0], 1.4, 2.2));   // player start
    // keep the stair mouths and the drop-through holes clear
    reserved.push({ min: [X0, 0, 6.2], max: [-7.0, 2.6, Z1] });
    reserved.push({ min: [7.0, 0, Z0], max: [X1, 2.6, -6.2] });
    emitClutter(reserved);

    const bounds = { min: [-24, -0.5, -22], max: [24, ROOF + 0.1, 22] };

    L.level = {
      brushes, meshes, windows, buys, perkSpots, boxSpots, spawnZones,
      lights, navSeeds, bounds,
      playerStart: { pos: [-5.5, 0, 3.0], yaw: Math.PI },
      rooms: {
        main: { floor: 0, locked: false },
        ne: { floor: 0, locked: false },
        se: { floor: 0, locked: false },
        help: { floor: UP, locked: true, unlockedBy: 'stairs_west' },
        catwalk: { floor: UP, locked: true, unlockedBy: 'stairs_west' },
        east_up: { floor: UP, locked: true, unlockedBy: 'stairs_east' },
      },
      debrisOpen: {},
    };
    return L.level;
  };

  // -------------------------------------------------------------------------
  // Debris removal — the only thing that changes the world at runtime.
  // Callers must re-run Z.Phys.setLevel() and Z.Render.loadLevel() afterwards.
  // -------------------------------------------------------------------------
  L.removeDebris = function (id) {
    const lv = L.level;
    if (!lv || lv.debrisOpen[id]) return false;
    const before = lv.brushes.length;
    lv.brushes = lv.brushes.filter((b) => b.debrisId !== id);
    brushes = lv.brushes;
    lv.debrisOpen[id] = true;
    for (const r in lv.rooms) {
      if (lv.rooms[r].unlockedBy === id) lv.rooms[r].locked = false;
    }
    for (const b of lv.buys) if (b.kind === 'debris' && b.id === id) b.bought = true;
    return before !== lv.brushes.length;
  };

  L.isRoomOpen = function (room) {
    const r = L.level && L.level.rooms[room];
    return !r || !r.locked;
  };

  // Which room is this point in? Used for spawn gating and audio reverb.
  L.roomAt = function (p) {
    const upper = p[1] > C1 - 0.5;
    if (!upper) {
      if (p[0] < DIV) return 'main';
      return p[2] < 0 ? 'ne' : 'se';
    }
    if (p[0] < DIV) {
      if (p[2] < -2) return 'help';
      return 'catwalk';
    }
    return 'east_up';
  };

  L.windowById = function (id) {
    return L.level.windows.find((w) => w.id === id) || null;
  };

  L.stats = function () {
    const lv = L.level;
    if (!lv) return null;
    return {
      brushes: lv.brushes.length,
      windows: lv.windows.length,
      buys: lv.buys.length,
      spawnZones: lv.spawnZones.length,
      lights: lv.lights.length,
      footprint: [(X1 - X0).toFixed(1), (Z1 - Z0).toFixed(1)],
    };
  };
}());
