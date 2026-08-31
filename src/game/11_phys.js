// ---------------------------------------------------------------------------
// 11_phys.js — AABB world collision, axis-resolved movement with step-up,
// raycasting, and a uniform-grid broadphase.
//
// Entities are axis-aligned boxes. `pos` is at the FEET (centre of the base).
// Movement is resolved one axis at a time (X, Z, then Y) which is what gives
// CoD-style clean wall sliding without the entity ever getting stuck on a seam.
// ---------------------------------------------------------------------------
(function () {
  const P = {};
  Z.Phys = P;

  const CELL = 2.0;          // broadphase cell size in metres
  const SKIN = 0.001;        // separation kept between entity and surface

  let level = null;
  let brushes = [];
  let grid = null;
  let gridMinX = 0, gridMinZ = 0, gridW = 0, gridD = 0;

  P.setLevel = function (lv) {
    level = lv;
    brushes = lv.brushes.filter((b) => b.solid !== false);
    for (let i = 0; i < brushes.length; i++) brushes[i]._i = i;
    buildGrid();
    return P;
  };
  P.level = () => level;
  P.brushes = () => brushes;

  function buildGrid() {
    const b = level.bounds;
    gridMinX = Math.floor(b.min[0] / CELL) - 1;
    gridMinZ = Math.floor(b.min[2] / CELL) - 1;
    gridW = Math.ceil((b.max[0] - b.min[0]) / CELL) + 3;
    gridD = Math.ceil((b.max[2] - b.min[2]) / CELL) + 3;
    grid = new Array(gridW * gridD);
    for (let i = 0; i < grid.length; i++) grid[i] = null;
    for (let i = 0; i < brushes.length; i++) {
      const br = brushes[i];
      const x0 = Math.max(0, Math.floor(br.min[0] / CELL) - gridMinX);
      const x1 = Math.min(gridW - 1, Math.floor(br.max[0] / CELL) - gridMinX);
      const z0 = Math.max(0, Math.floor(br.min[2] / CELL) - gridMinZ);
      const z1 = Math.min(gridD - 1, Math.floor(br.max[2] / CELL) - gridMinZ);
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const k = z * gridW + x;
          if (!grid[k]) grid[k] = [];
          grid[k].push(br);
        }
      }
    }
  }

  // Gather candidate brushes overlapping an AABB. Reuses a scratch array.
  const candidates = [];
  let candMark = 0;
  const brushMark = new Map();
  function query(minx, minz, maxx, maxz) {
    candidates.length = 0;
    candMark++;
    if (!grid) return candidates;
    const x0 = Math.max(0, Math.floor(minx / CELL) - gridMinX);
    const x1 = Math.min(gridW - 1, Math.floor(maxx / CELL) - gridMinX);
    const z0 = Math.max(0, Math.floor(minz / CELL) - gridMinZ);
    const z1 = Math.min(gridD - 1, Math.floor(maxz / CELL) - gridMinZ);
    for (let z = z0; z <= z1; z++) {
      const row = z * gridW;
      for (let x = x0; x <= x1; x++) {
        const cell = grid[row + x];
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          const br = cell[i];
          if (brushMark.get(br) === candMark) continue;
          brushMark.set(br, candMark);
          candidates.push(br);
        }
      }
    }
    return candidates;
  }
  P.query = query;

  function overlaps(ax0, ay0, az0, ax1, ay1, az1, b) {
    return ax1 > b.min[0] && ax0 < b.max[0]
      && ay1 > b.min[1] && ay0 < b.max[1]
      && az1 > b.min[2] && az0 < b.max[2];
  }

  // -------------------------------------------------------------------------
  // Entity movement
  // ent = { pos:[x,y,z] (feet), vel:[x,y,z], radius, height, onGround, stepUp,
  //         noClip, groundBrush, wallHit, ceilingHit }
  // -------------------------------------------------------------------------
  P.move = function (ent, dt) {
    if (ent.noClip) {
      ent.pos[0] += ent.vel[0] * dt;
      ent.pos[1] += ent.vel[1] * dt;
      ent.pos[2] += ent.vel[2] * dt;
      ent.onGround = false;
      return;
    }
    const r = ent.radius, h = ent.height;
    const step = ent.stepUp === undefined ? Z.C.STEP_UP : ent.stepUp;
    ent.wallHit = false;
    ent.ceilingHit = false;
    const wasGround = ent.onGround;
    ent.onGround = false;
    ent.groundBrush = null;

    // --- horizontal, with step-up ---
    const dx = ent.vel[0] * dt;
    const dz = ent.vel[2] * dt;

    const startX = ent.pos[0], startY = ent.pos[1], startZ = ent.pos[2];
    let blockedX = false, blockedZ = false;

    blockedX = moveAxis(ent, 0, dx, r, h);
    blockedZ = moveAxis(ent, 2, dz, r, h);

    // If we hit a wall while grounded, try again from a stepped-up position.
    // This is what lets the player walk over rubble, stairs and window sills
    // without a jump, exactly like CoD.
    if ((blockedX || blockedZ) && (wasGround || ent.onGroundSticky) && step > 0) {
      const saveX = ent.pos[0], saveZ = ent.pos[2];
      ent.pos[0] = startX; ent.pos[2] = startZ;
      // can we even rise?
      const rise = clearRise(ent, step, r, h);
      if (rise > 0.02) {
        ent.pos[1] = startY + rise;
        const bx = moveAxis(ent, 0, dx, r, h);
        const bz = moveAxis(ent, 2, dz, r, h);
        const gainedX = Math.abs(ent.pos[0] - startX);
        const gainedZ = Math.abs(ent.pos[2] - startZ);
        const oldGainX = Math.abs(saveX - startX);
        const oldGainZ = Math.abs(saveZ - startZ);
        if (gainedX + gainedZ > oldGainX + oldGainZ + 0.0005) {
          // settle back down onto whatever we stepped onto
          const drop = dropTo(ent, rise + 0.02, r, h);
          if (drop) {
            ent.onGround = true;
            if (ent.vel[1] < 0) ent.vel[1] = 0;
          }
          ent.wallHit = bx || bz;
        } else {
          ent.pos[0] = saveX; ent.pos[1] = startY; ent.pos[2] = saveZ;
          ent.wallHit = true;
        }
      } else {
        ent.pos[0] = saveX; ent.pos[2] = saveZ;
        ent.wallHit = true;
      }
    } else if (blockedX || blockedZ) {
      ent.wallHit = true;
    }

    // --- vertical ---
    const dy = ent.vel[1] * dt;
    const blockedY = moveAxis(ent, 1, dy, r, h);
    if (blockedY) {
      if (dy <= 0) {
        ent.onGround = true;
        ent.vel[1] = 0;
      } else {
        ent.ceilingHit = true;
        ent.vel[1] = 0;
      }
    }

    // Ground probe: stay "grounded" while walking down small slopes/steps so
    // the camera doesn't hop when descending stairs.
    if (!ent.onGround && ent.vel[1] <= 0.01) {
      const probe = 0.12;
      if (groundBelow(ent, probe, r, h)) {
        if (wasGround) {
          dropTo(ent, probe, r, h);
          ent.onGround = true;
          ent.vel[1] = 0;
        }
      }
    }
  };

  // Move along one axis, return true if we were stopped by geometry.
  function moveAxis(ent, axis, d, r, h) {
    if (d === 0) return false;
    ent.pos[axis] += d;
    const p = ent.pos;
    const minx = p[0] - r, maxx = p[0] + r;
    const miny = p[1], maxy = p[1] + h;
    const minz = p[2] - r, maxz = p[2] + r;
    const list = query(minx, minz, maxx, maxz);
    let hit = false;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!overlaps(minx, miny, minz, maxx, maxy, maxz, b)) continue;
      hit = true;
      if (axis === 0) {
        ent.pos[0] = d > 0 ? b.min[0] - r - SKIN : b.max[0] + r + SKIN;
        ent.vel[0] = 0;
        return true;
      } else if (axis === 2) {
        ent.pos[2] = d > 0 ? b.min[2] - r - SKIN : b.max[2] + r + SKIN;
        ent.vel[2] = 0;
        return true;
      } else {
        if (d > 0) ent.pos[1] = b.min[1] - h - SKIN;
        else { ent.pos[1] = b.max[1] + SKIN; ent.groundBrush = b; }
        return true;
      }
    }
    return hit;
  }

  // How far can the entity rise before its head hits something? (0..maxRise)
  function clearRise(ent, maxRise, r, h) {
    const p = ent.pos;
    const list = query(p[0] - r, p[2] - r, p[0] + r, p[2] + r);
    let allow = maxRise;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (p[0] + r <= b.min[0] || p[0] - r >= b.max[0]) continue;
      if (p[2] + r <= b.min[2] || p[2] - r >= b.max[2]) continue;
      if (b.min[1] >= p[1] + h) {
        const gap = b.min[1] - (p[1] + h);
        if (gap < allow) allow = gap;
      }
    }
    return Math.max(0, allow);
  }

  // Drop the entity down at most maxDrop until it rests on something.
  function dropTo(ent, maxDrop, r, h) {
    const p = ent.pos;
    const list = query(p[0] - r, p[2] - r, p[0] + r, p[2] + r);
    let best = -Infinity, bestBrush = null;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (p[0] + r <= b.min[0] || p[0] - r >= b.max[0]) continue;
      if (p[2] + r <= b.min[2] || p[2] - r >= b.max[2]) continue;
      if (b.max[1] <= p[1] + 0.001 && b.max[1] >= p[1] - maxDrop) {
        if (b.max[1] > best) { best = b.max[1]; bestBrush = b; }
      }
    }
    if (bestBrush) { ent.pos[1] = best + SKIN; ent.groundBrush = bestBrush; return true; }
    return false;
  }

  function groundBelow(ent, dist, r, h) {
    const p = ent.pos;
    const list = query(p[0] - r, p[2] - r, p[0] + r, p[2] + r);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (p[0] + r <= b.min[0] || p[0] - r >= b.max[0]) continue;
      if (p[2] + r <= b.min[2] || p[2] - r >= b.max[2]) continue;
      if (b.max[1] <= p[1] + 0.001 && b.max[1] >= p[1] - dist) return true;
    }
    return false;
  }
  P.groundBelow = groundBelow;

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------
  P.pointSolid = function (p) {
    const list = query(p[0], p[2], p[0], p[2]);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (p[0] >= b.min[0] && p[0] <= b.max[0]
        && p[1] >= b.min[1] && p[1] <= b.max[1]
        && p[2] >= b.min[2] && p[2] <= b.max[2]) return b;
    }
    return null;
  };

  P.boxSolid = function (p, r, h) {
    const list = query(p[0] - r, p[2] - r, p[0] + r, p[2] + r);
    for (let i = 0; i < list.length; i++) {
      if (overlaps(p[0] - r, p[1], p[2] - r, p[0] + r, p[1] + h, p[2] + r, list[i])) return list[i];
    }
    return null;
  };

  // Height of the floor under p (searching downward up to maxDrop). null if none.
  P.floorAt = function (p, maxDrop, r) {
    r = r === undefined ? 0.1 : r;
    maxDrop = maxDrop === undefined ? 6 : maxDrop;
    const list = query(p[0] - r, p[2] - r, p[0] + r, p[2] + r);
    let best = null;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (p[0] + r <= b.min[0] || p[0] - r >= b.max[0]) continue;
      if (p[2] + r <= b.min[2] || p[2] - r >= b.max[2]) continue;
      if (b.max[1] <= p[1] + 0.05 && b.max[1] >= p[1] - maxDrop) {
        if (best === null || b.max[1] > best) best = b.max[1];
      }
    }
    return best;
  };

  // Ray vs world. Slab method against every candidate brush along a DDA walk.
  const rcOut = { hit: false, t: 0, point: [0, 0, 0], normal: [0, 0, 0], brush: null };
  P.raycast = function (o, d, maxDist, filter) {
    let bestT = maxDist;
    let bestB = null, bestAxis = -1, bestSign = 0;

    // March the broadphase grid so long rays don't test the whole level.
    const stepLen = CELL * 0.9;
    let travelled = 0;
    candMark++; // fresh mark; we do our own dedupe below
    const seen = new Set();
    while (travelled < bestT) {
      const segEnd = Math.min(travelled + stepLen, bestT);
      const ax = o[0] + d[0] * travelled, az = o[2] + d[2] * travelled;
      const bx = o[0] + d[0] * segEnd, bz = o[2] + d[2] * segEnd;
      const list = query(Math.min(ax, bx) - 0.01, Math.min(az, bz) - 0.01,
        Math.max(ax, bx) + 0.01, Math.max(az, bz) + 0.01);
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (seen.has(b)) continue;
        seen.add(b);
        if (filter && !filter(b)) continue;
        // slab test
        let tmin = 0, tmax = bestT, axis = -1, sign = 0;
        let ok = true;
        for (let k = 0; k < 3; k++) {
          const dk = d[k];
          if (Math.abs(dk) < 1e-9) {
            if (o[k] < b.min[k] || o[k] > b.max[k]) { ok = false; break; }
          } else {
            const inv = 1 / dk;
            let t1 = (b.min[k] - o[k]) * inv;
            let t2 = (b.max[k] - o[k]) * inv;
            let s = -1;
            if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
            if (t1 > tmin) { tmin = t1; axis = k; sign = s; }
            if (t2 < tmax) tmax = t2;
            if (tmin > tmax) { ok = false; break; }
          }
        }
        if (ok && tmin >= 0 && tmin < bestT) {
          bestT = tmin; bestB = b; bestAxis = axis; bestSign = sign;
        }
      }
      travelled = segEnd;
      if (segEnd >= maxDist) break;
    }

    if (!bestB) { rcOut.hit = false; rcOut.brush = null; rcOut.t = maxDist; return null; }
    rcOut.hit = true;
    rcOut.t = bestT;
    rcOut.brush = bestB;
    rcOut.point[0] = o[0] + d[0] * bestT;
    rcOut.point[1] = o[1] + d[1] * bestT;
    rcOut.point[2] = o[2] + d[2] * bestT;
    rcOut.normal[0] = 0; rcOut.normal[1] = 0; rcOut.normal[2] = 0;
    if (bestAxis >= 0) rcOut.normal[bestAxis] = bestSign;
    return rcOut;
  };

  P.losClear = function (a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    const d = [dx / len, dy / len, dz / len];
    const h = P.raycast(a, d, len - 0.02);
    return !h;
  };

  // Ray vs a single AABB (used for hitbox tests against entities).
  P.rayAABB = function (o, d, min, max, maxT) {
    let tmin = 0, tmax = maxT === undefined ? Infinity : maxT;
    let axis = -1, sign = 0;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-9) {
        if (o[k] < min[k] || o[k] > max[k]) return -1;
      } else {
        const inv = 1 / d[k];
        let t1 = (min[k] - o[k]) * inv, t2 = (max[k] - o[k]) * inv, s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = k; sign = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
    }
    P.lastAxis = axis; P.lastSign = sign;
    return tmin;
  };

  // Ray vs vertical capsule (entity hitboxes) — returns t or -1.
  P.rayCapsule = function (o, d, base, radius, height, maxT) {
    // Treat as a cylinder + spherical caps; good enough for hit detection and
    // much cheaper than exact. Solve the infinite-cylinder quadratic in XZ.
    const ox = o[0] - base[0], oz = o[2] - base[2];
    const a = d[0] * d[0] + d[2] * d[2];
    const b = 2 * (ox * d[0] + oz * d[2]);
    const c = ox * ox + oz * oz - radius * radius;
    if (a < 1e-9) {
      if (c > 0) return -1;
      // vertical ray inside the cylinder footprint
      const t1 = (base[1] - o[1]) / d[1];
      const t2 = (base[1] + height - o[1]) / d[1];
      const t = Math.min(Math.max(t1, 0), Math.max(t2, 0));
      return (t >= 0 && t <= maxT) ? t : -1;
    }
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const sq = Math.sqrt(disc);
    let t = (-b - sq) / (2 * a);
    if (t < 0) t = (-b + sq) / (2 * a);
    if (t < 0 || t > maxT) return -1;
    const y = o[1] + d[1] * t;
    if (y >= base[1] && y <= base[1] + height) return t;
    // clip against the end caps
    const capY = y < base[1] ? base[1] : base[1] + height;
    if (Math.abs(d[1]) < 1e-9) return -1;
    const tc = (capY - o[1]) / d[1];
    if (tc < 0 || tc > maxT) return -1;
    const px = o[0] + d[0] * tc - base[0];
    const pz = o[2] + d[2] * tc - base[2];
    if (px * px + pz * pz <= radius * radius) return tc;
    return -1;
  };

  // Push two entities apart so a horde doesn't collapse into one point.
  P.separate = function (a, b, strength) {
    const dx = b.pos[0] - a.pos[0];
    const dz = b.pos[2] - a.pos[2];
    const d2 = dx * dx + dz * dz;
    const rr = a.radius + b.radius;
    if (d2 > rr * rr || d2 < 1e-8) return false;
    const d = Math.sqrt(d2);
    const push = (rr - d) * 0.5 * (strength === undefined ? 1 : strength);
    const nx = dx / d, nz = dz / d;
    a.pos[0] -= nx * push; a.pos[2] -= nz * push;
    b.pos[0] += nx * push; b.pos[2] += nz * push;
    return true;
  };

  P.stats = function () {
    return { brushes: brushes.length, cells: grid ? grid.length : 0 };
  };
}());
