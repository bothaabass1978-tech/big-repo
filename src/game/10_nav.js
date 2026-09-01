// ---------------------------------------------------------------------------
// 10_nav.js — layered navigation grid + A*.
//
// The map is two floors stacked on top of each other, so a flat 2D grid can't
// represent it. Instead every (x,z) column can hold several nodes, one per
// distinct walkable surface with enough headroom above it. Stairs come out as
// a diagonal ramp of nodes and connect naturally through the step-up rule.
//
// Edges ignore brushes low enough to walk over (<= STEP_UP), which is what
// stops every staircase in the game from reading as a solid wall.
// ---------------------------------------------------------------------------
(function () {
  const N = {};
  Z.Nav = N;
  const M = Z.M;

  const CELL = 0.5;
  const AGENT_R = 0.30;
  const AGENT_H = 1.75;
  const MAX_STEP = 0.46;
  const MAX_DROP = 3.9;          // a zombie will happily throw itself off the catwalk
  const HEIGHT_MERGE = 0.35;     // surfaces closer than this are the same floor

  let grid = null;               // Map<colKey, node[]>
  let nodes = [];                // flat list, node.i is its index
  let level = null;
  let minX = 0, minZ = 0, cols = 0, rows = 0;

  const colKey = (cx, cz) => cz * cols + cx;

  // -------------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------------
  N.build = function (lv) {
    level = lv;
    nodes = [];
    grid = new Map();

    const b = lv.navBounds || { min: [-20, 0, -18], max: [20, 0, 18] };
    minX = b.min[0]; minZ = b.min[2];
    cols = Math.ceil((b.max[0] - b.min[0]) / CELL);
    rows = Math.ceil((b.max[2] - b.min[2]) / CELL);

    const t0 = now();

    // --- pass 1: find every walkable surface ------------------------------
    for (let cz = 0; cz < rows; cz++) {
      for (let cx = 0; cx < cols; cx++) {
        const x = minX + (cx + 0.5) * CELL;
        const z = minZ + (cz + 0.5) * CELL;
        const heights = surfacesAt(x, z);
        if (!heights.length) continue;
        const list = [];
        for (const h of heights) {
          if (!hasHeadroom(x, h, z)) continue;
          const node = {
            i: nodes.length, x, y: h, z, cx, cz,
            edges: [], edgeCost: [],
            room: Z.Level.roomAt ? Z.Level.roomAt([x, h + 0.1, z]) : null,
            outside: isOutside(x, z),
          };
          nodes.push(node);
          list.push(node);
        }
        if (list.length) grid.set(colKey(cx, cz), list);
      }
    }

    // --- pass 2: link neighbours ------------------------------------------
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const n of nodes) {
      for (const d of DIRS) {
        const ncx = n.cx + d[0], ncz = n.cz + d[1];
        if (ncx < 0 || ncz < 0 || ncx >= cols || ncz >= rows) continue;
        const list = grid.get(colKey(ncx, ncz));
        if (!list) continue;
        const diag = d[0] !== 0 && d[1] !== 0;
        // A diagonal move must have both orthogonal neighbours open, otherwise
        // agents cut corners through door frames and wall ends.
        if (diag) {
          if (!hasNodeNear(n.cx + d[0], n.cz, n.y) || !hasNodeNear(n.cx, n.cz + d[1], n.y)) continue;
        }
        for (const m of list) {
          const dy = m.y - n.y;
          if (dy > MAX_STEP) continue;
          if (dy < -MAX_DROP) continue;
          if (blockedBetween(n, m)) continue;
          const horiz = diag ? CELL * 1.4142 : CELL;
          // Falling is cheap but not free; climbing costs extra so paths
          // prefer a ramp over vaulting up a crate.
          let cost = horiz + (dy > 0.05 ? dy * 3.0 : 0) + (dy < -0.5 ? -dy * 0.35 : 0);
          n.edges.push(m.i);
          n.edgeCost.push(cost);
        }
      }
    }

    // --- pass 3: window links (outside -> inside, through the barricade) ---
    N.windowLinks = [];
    for (const w of lv.windows) {
      const outN = N.nearest(w.out, 2.0);
      const inN = N.nearest([w.inPos[0], w.floorY + 0.05, w.inPos[2]], 2.0);
      if (!outN || !inN) {
        Z.log('nav: window ' + w.id + ' failed to link (out=' + !!outN + ' in=' + !!inN + ')');
        continue;
      }
      N.windowLinks.push({ window: w, out: outN.i, in: inN.i });
      w.navOut = outN.i;
      w.navIn = inN.i;
      // The link is traversable only by climbing, so it is NOT added as a
      // normal edge — the zombie AI handles it as an explicit state.
    }

    N.buildMs = now() - t0;
    N.stats = {
      nodes: nodes.length, cols, rows, cell: CELL,
      edges: nodes.reduce((a, n) => a + n.edges.length, 0),
      buildMs: N.buildMs,
      windowLinks: N.windowLinks.length,
    };
    Z.log('nav: ' + N.stats.nodes + ' nodes, ' + N.stats.edges + ' edges in ' + N.buildMs.toFixed(1) + 'ms');
    return N.stats;
  };

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function isOutside(x, z) {
    const d = Z.Level.DIMS;
    return x < d.X0 || x > d.X1 || z < d.Z0 || z > d.Z1;
  }

  // Distinct surface heights in this column, low to high.
  function surfacesAt(x, z) {
    const list = Z.Phys.query(x - CELL * 0.5, z - CELL * 0.5, x + CELL * 0.5, z + CELL * 0.5);
    const hs = [];
    for (let i = 0; i < list.length; i++) {
      const br = list[i];
      if (br.solid === false) continue;
      if (x + AGENT_R * 0.5 <= br.min[0] || x - AGENT_R * 0.5 >= br.max[0]) continue;
      if (z + AGENT_R * 0.5 <= br.min[2] || z - AGENT_R * 0.5 >= br.max[2]) continue;
      hs.push(br.max[1]);
    }
    if (!hs.length) return hs;
    hs.sort((a, b) => a - b);
    const out = [];
    for (const h of hs) {
      if (!out.length || h - out[out.length - 1] > HEIGHT_MERGE) out.push(h);
      else out[out.length - 1] = h;
    }
    return out;
  }

  // Is there room for a body standing on surface `y` at (x,z)?
  function hasHeadroom(x, y, z) {
    const list = Z.Phys.query(x - AGENT_R, z - AGENT_R, x + AGENT_R, z + AGENT_R);
    const lo = y + 0.12, hi = y + AGENT_H;
    for (let i = 0; i < list.length; i++) {
      const br = list[i];
      if (br.solid === false) continue;
      if (x + AGENT_R <= br.min[0] || x - AGENT_R >= br.max[0]) continue;
      if (z + AGENT_R <= br.min[2] || z - AGENT_R >= br.max[2]) continue;
      if (br.max[1] <= lo) continue;      // it's the floor or a step
      if (br.min[1] >= hi) continue;      // it's the ceiling
      return false;
    }
    return true;
  }

  function hasNodeNear(cx, cz, y) {
    const list = grid.get(colKey(cx, cz));
    if (!list) return false;
    for (const m of list) if (Math.abs(m.y - y) <= MAX_STEP) return true;
    return false;
  }

  // Sample along the segment; anything tall enough to matter blocks it.
  // Brushes whose top is within step-up of the walking surface are treated as
  // ground, not obstruction — that is what makes stairs and kerbs passable.
  function blockedBetween(a, b) {
    const steps = 3;
    for (let s = 1; s <= steps; s++) {
      const t = s / (steps + 1);
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y = Math.max(a.y, b.y);
      const list = Z.Phys.query(x - AGENT_R, z - AGENT_R, x + AGENT_R, z + AGENT_R);
      for (let i = 0; i < list.length; i++) {
        const br = list[i];
        if (br.solid === false) continue;
        if (x + AGENT_R <= br.min[0] || x - AGENT_R >= br.max[0]) continue;
        if (z + AGENT_R <= br.min[2] || z - AGENT_R >= br.max[2]) continue;
        if (br.max[1] <= y + MAX_STEP) continue;
        if (br.min[1] >= y + AGENT_H) continue;
        return true;
      }
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------
  N.node = (i) => nodes[i];
  N.nodeCount = () => nodes.length;
  N.allNodes = () => nodes;

  // Nearest walkable node to a world point.
  //
  // Straight-line distance alone is not good enough: an agent standing 0.4 m
  // from an exterior wall is *closest* to a node on the far side of it, and
  // pathing from that node to anything indoors fails instantly. So candidates
  // that aren't actually visible from the query point are only used as a last
  // resort.
  N.nearest = function (p, maxDist) {
    const md = maxDist === undefined ? 3.0 : maxDist;
    const rad = Math.ceil(md / CELL);
    const cx = Math.floor((p[0] - minX) / CELL);
    const cz = Math.floor((p[2] - minZ) / CELL);
    let best = null, bestD = md * md;
    let fallback = null, fallbackD = md * md;
    const eyeA = [p[0], p[1] + 0.9, p[2]];
    const eyeB = [0, 0, 0];

    for (let r = 0; r <= rad; r++) {
      let found = false;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          const list = grid.get(colKey(cx + dx, cz + dz));
          if (!list) continue;
          for (const n of list) {
            const ddx = n.x - p[0], ddz = n.z - p[2], ddy = (n.y - p[1]) * 1.6;
            const d = ddx * ddx + ddz * ddz + ddy * ddy;
            if (d < fallbackD) { fallbackD = d; fallback = n; }
            if (d >= bestD) continue;
            if (d > 0.36) {                 // >0.6 m away: make sure we can see it
              eyeB[0] = n.x; eyeB[1] = n.y + 0.9; eyeB[2] = n.z;
              if (!Z.Phys.losClear(eyeA, eyeB)) continue;
            }
            bestD = d; best = n; found = true;
          }
        }
      }
      if (found && r > 1) break;
    }
    return best || fallback;
  };

  // -------------------------------------------------------------------------
  // A* — binary heap, reusable scratch arrays so pathing allocates nothing
  // -------------------------------------------------------------------------
  let gScore = null, fScore = null, cameFrom = null, closed = null, stamp = null;
  let curStamp = 0;
  const heap = [];

  function ensureScratch() {
    if (gScore && gScore.length >= nodes.length) return;
    gScore = new Float32Array(nodes.length);
    fScore = new Float32Array(nodes.length);
    cameFrom = new Int32Array(nodes.length);
    closed = new Uint8Array(nodes.length);
    stamp = new Int32Array(nodes.length);
  }

  function heapPush(i, f) {
    heap.push(i);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (fScore[heap[p]] <= fScore[heap[c]]) break;
      const t = heap[p]; heap[p] = heap[c]; heap[c] = t;
      c = p;
    }
  }
  function heapPop() {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1, r = l + 1;
        let s = p;
        if (l < heap.length && fScore[heap[l]] < fScore[heap[s]]) s = l;
        if (r < heap.length && fScore[heap[r]] < fScore[heap[s]]) s = r;
        if (s === p) break;
        const t = heap[p]; heap[p] = heap[s]; heap[s] = t;
        p = s;
      }
    }
    return top;
  }

  function h(a, b) {
    const dx = a.x - b.x, dz = a.z - b.z, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dz * dz) + Math.abs(dy) * 1.2;
  }

  N.searchStats = { calls: 0, expanded: 0, failures: 0 };

  // Returns an array of node indices from `startIdx` to `goalIdx`, or null.
  N.findPath = function (startIdx, goalIdx, maxExpand) {
    ensureScratch();
    if (startIdx === goalIdx) return [startIdx];
    const start = nodes[startIdx], goal = nodes[goalIdx];
    if (!start || !goal) return null;
    curStamp++;
    heap.length = 0;
    const limit = maxExpand || 4500;
    stamp[startIdx] = curStamp;
    gScore[startIdx] = 0;
    fScore[startIdx] = h(start, goal);
    cameFrom[startIdx] = -1;
    closed[startIdx] = 0;
    heapPush(startIdx, fScore[startIdx]);
    N.searchStats.calls++;
    let expanded = 0;

    while (heap.length) {
      const cur = heapPop();
      if (closed[cur] === 1 && stamp[cur] === curStamp) continue;
      closed[cur] = 1;
      if (cur === goalIdx) {
        N.searchStats.expanded += expanded;
        const path = [];
        let n = cur;
        while (n !== -1) { path.push(n); n = cameFrom[n]; }
        path.reverse();
        return path;
      }
      if (++expanded > limit) break;
      const node = nodes[cur];
      for (let e = 0; e < node.edges.length; e++) {
        const nb = node.edges[e];
        if (stamp[nb] === curStamp && closed[nb] === 1) continue;
        const tentative = gScore[cur] + node.edgeCost[e];
        if (stamp[nb] !== curStamp || tentative < gScore[nb]) {
          stamp[nb] = curStamp;
          closed[nb] = 0;
          gScore[nb] = tentative;
          fScore[nb] = tentative + h(nodes[nb], goal);
          cameFrom[nb] = cur;
          heapPush(nb, fScore[nb]);
        }
      }
    }
    N.searchStats.failures++;
    N.searchStats.expanded += expanded;
    return null;
  };

  // Convenience: world position -> world position.
  N.pathBetween = function (from, to, maxExpand) {
    const a = N.nearest(from, 3.0);
    const b = N.nearest(to, 3.0);
    if (!a || !b) return null;
    const p = N.findPath(a.i, b.i, maxExpand);
    if (!p) return null;
    return p;
  };

  // Shorten a path by dropping waypoints that can be skipped in a straight
  // line. Without this, agents visibly zig-zag along the grid.
  N.smooth = function (path, out) {
    out = out || [];
    out.length = 0;
    if (!path || !path.length) return out;
    let i = 0;
    out.push(nodes[path[0]]);
    while (i < path.length - 1) {
      let j = path.length - 1;
      for (; j > i + 1; j--) {
        if (straightLine(nodes[path[i]], nodes[path[j]])) break;
      }
      out.push(nodes[path[j]]);
      i = j;
    }
    return out;
  };

  function straightLine(a, b) {
    // Only allow the shortcut on a single surface — never across a drop,
    // otherwise agents walk off catwalks into thin air on purpose.
    if (Math.abs(a.y - b.y) > MAX_STEP) return false;
    const dx = b.x - a.x, dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(2, Math.ceil(dist / (CELL * 0.75)));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = a.x + dx * t, z = a.z + dz * t;
      const y = a.y + (b.y - a.y) * t;
      const list = Z.Phys.query(x - AGENT_R, z - AGENT_R, x + AGENT_R, z + AGENT_R);
      let onSurface = false;
      for (let i = 0; i < list.length; i++) {
        const br = list[i];
        if (br.solid === false) continue;
        if (x + AGENT_R <= br.min[0] || x - AGENT_R >= br.max[0]) continue;
        if (z + AGENT_R <= br.min[2] || z - AGENT_R >= br.max[2]) continue;
        if (br.max[1] > y + MAX_STEP && br.min[1] < y + AGENT_H) return false;
        if (Math.abs(br.max[1] - y) <= MAX_STEP) onSurface = true;
      }
      if (!onSurface) return false;
    }
    return true;
  }

  // Rebuild after the world changes (debris cleared).
  N.rebuild = function () {
    if (level) N.build(level);
  };

  N.debugDump = function () {
    const byRoom = {};
    for (const n of nodes) {
      const k = n.outside ? 'outside' : (n.room || '?');
      byRoom[k] = (byRoom[k] || 0) + 1;
    }
    return { total: nodes.length, byRoom, stats: N.stats };
  };
}());
