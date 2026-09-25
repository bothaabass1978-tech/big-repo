/**
 * BlockForge — Studio: hand-built layouts for creator games.
 *
 * Three templates can be edited tile by tile in the Studio tab of a creation:
 *   obby          side-view course: platforms, checkpoints, hazards, pads, finish
 *   towerdefense  the road enemies march along (one unbroken path, left to right)
 *   arena         cover blocks on the battle floor
 * Layouts are small JSON objects saved on the creation (ug.layout) and handed to
 * the game module as ctx.config.layout. Without a layout the template keeps its
 * seed-generated level, so every creation always has something playable.
 */
(function (BF) {
  'use strict';

  const U = BF.util;

  const OBBY = {
    cols: 240, rows: 20, cell: 40, x0: -200, y0: -360,
    tiles: {
      ground: { label: 'Platform', color: '#6bd35a', icon: 'grid' },
      start: { label: 'Start', color: '#ffffff', icon: 'flag' },
      check: { label: 'Checkpoint', color: '#7fe7ff', icon: 'flag' },
      finish: { label: 'Finish', color: '#ffd66b', icon: 'star' },
      kill: { label: 'Lava', color: '#ff3d5a', icon: 'fire' },
      bounce: { label: 'Bounce pad', color: '#4ad17f', icon: 'chevronUp' },
      move: { label: 'Mover', color: '#46a8ff', icon: 'arrowRight' },
      fall: { label: 'Crumbling', color: '#f0d38c', icon: 'layers' },
      blink: { label: 'Blinking', color: '#d7a8ff', icon: 'eye' },
      spin: { label: 'Spinner', color: '#ff7a2e', icon: 'refresh' },
    },
  };
  const TD = { cols: 20, rows: 9, tiles: { road: { label: 'Road', color: '#d8b878', icon: 'grid' } } };
  const ARENA = { cols: 24, rows: 13, cell: 40, y0: 10, tiles: { wall: { label: 'Cover block', color: '#39465f', icon: 'grid' } } };
  const SPEC = { obby: OBBY, towerdefense: TD, arena: ARENA };
  const MAX_CELLS = { obby: 1600, towerdefense: 180, arena: 90 };

  const key = (c, r) => c + ',' + r;
  /** Cells as a Map "c,r" -> type from the compact [[c, r, type], ...] form. */
  const DEFAULT_TILE = { obby: 'ground', towerdefense: 'road', arena: 'wall' };
  function cellMap(layout) {
    const m = new Map();
    const def = DEFAULT_TILE[layout && layout.kind] || 'ground';
    for (const it of (layout && layout.cells) || []) {
      const c = it[0] | 0, r = it[1] | 0;
      m.set(key(c, r), it[2] || def);
    }
    return m;
  }
  function pack(kind, m) {
    const cells = [];
    for (const [k, t] of m) { const [c, r] = k.split(',').map(Number); cells.push(kind === 'obby' ? [c, r, t] : [c, r]); }
    cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    return { kind, cells, v: 1 };
  }

  // ------------------------------------------------------------------ obby

  /** Build an obby course (same shape as the Sky Obby generator) from a layout. */
  function obbyCourse(layout) {
    const m = cellMap(layout);
    const C = OBBY.cell;
    const plats = [], kills = [], spinners = [], pads = [], flags = [];
    let portal = null;
    const platKind = { ground: 'static', start: 'checkpoint', check: 'checkpoint', finish: 'finish', kill: 'static', bounce: 'static', move: 'move', fall: 'fall', blink: 'blink' };
    for (let r = 0; r < OBBY.rows; r++) {
      let c = 0;
      while (c < OBBY.cols) {
        const t = m.get(key(c, r));
        if (!t || t === 'spin') { if (t === 'spin') spinners.push({ x: OBBY.x0 + c * C + C / 2, y: OBBY.y0 + r * C - 10, len: 60, speed: (c + r) % 2 ? 2 : -2, a: c * 0.7, stage: 0 }); c++; continue; }
        let n = 1;
        const joins = t === 'ground' || t === 'kill' || t === 'check' || t === 'start' || t === 'finish' || t === 'blink';
        if (joins) while (c + n < OBBY.cols && m.get(key(c + n, r)) === t) n++;
        const x = OBBY.x0 + c * C, y = OBBY.y0 + r * C;
        const p = { x, y, w: n * C, h: 18, kind: platKind[t], stage: 0, dx: 0, dy: 0, tile: t };
        if (t === 'move') Object.assign(p, { axis: 'x', range: 120, period: 3.2, phase: (c * 0.9) % 6 });
        if (t === 'blink') p.off = (c * 0.35) % 3;
        p.x0 = p.x; p.y0 = p.y; p.py = p.y;
        plats.push(p);
        if (t === 'kill') kills.push({ x, y: y - 10, w: n * C, h: 12, stage: 0 });
        if (t === 'bounce') pads.push({ x: x + C / 2, y, t: 0 });
        if (t === 'finish' && !portal) portal = { x: x + (n * C) / 2, y: y - 52 };
        c += n;
      }
    }
    // checkpoints are numbered left to right; the start is checkpoint 0
    const start = plats.filter((p) => p.tile === 'start').sort((a, b) => a.x - b.x)[0];
    if (start) { start.cp = 0; flags.push({ x: start.x + Math.min(60, start.w / 2), y: start.y, cp: 0 }); }
    const checks = plats.filter((p) => p.tile === 'check').sort((a, b) => a.x - b.x);
    checks.forEach((p, i) => { p.cp = i + 1; flags.push({ x: p.x + p.w / 2, y: p.y, cp: i + 1 }); });
    const bounds = checks.map((p) => p.x);
    for (const p of plats) { p.stage = bounds.filter((bx) => bx <= p.x).length + 1; }
    const xs = plats.map((p) => p.x).concat(plats.map((p) => p.x + p.w));
    return {
      plats, kills, spinners, pads, flags, portal,
      stages: checks.length + 1,
      minX: xs.length ? Math.min(...xs) - 200 : -260,
      maxX: xs.length ? Math.max(...xs) + 200 : 800,
    };
  }

  function obbyFromCourse(course) {
    const m = new Map();
    const C = OBBY.cell;
    const col = (x) => Math.round((x - course.minX - 60) / C);
    // keep the lowest platform two rows above the bottom of the grid
    const maxY = Math.max(...course.plats.map((p) => p.y0));
    const shift = (OBBY.rows - 3) - Math.round((maxY - OBBY.y0) / C);
    const row = (y) => U.clamp(Math.round((y - OBBY.y0) / C) + shift, 0, OBBY.rows - 1);
    const set = (c, r, t) => { if (c >= 0 && c < OBBY.cols) m.set(key(c, r), t); };
    for (const p of course.plats) {
      const t = p.kind === 'checkpoint' ? (p.cp === 0 ? 'start' : 'check') : p.kind === 'finish' ? 'finish' : p.kind === 'move' ? 'move' : p.kind === 'fall' ? 'fall' : p.kind === 'blink' ? 'blink' : 'ground';
      const n = t === 'move' ? 1 : Math.max(1, Math.round(p.w / C));
      for (let i = 0; i < n; i++) set(col(p.x0) + i, row(p.y0), t);
    }
    for (const k of course.kills) for (let i = 0; i < Math.max(1, Math.round(k.w / C)); i++) set(col(k.x) + i, row(k.y + 10), 'kill');
    for (const pd of course.pads) set(col(pd.x - C / 2), row(pd.y), 'bounce');
    for (const s of course.spinners) { const c = col(s.x - C / 2), r = row(s.y + 10); if (!m.has(key(c, r))) set(c, r, 'spin'); }
    return pack('obby', m);
  }

  // ------------------------------------------------------------ tower defense

  /**
   * Trace the painted road from the left edge to the right edge.
   * @returns {{ok:boolean, path?:number[][], error?:string}} path in Towerfall waypoint form
   */
  function tdTrace(layout) {
    const m = cellMap(layout);
    const has = (c, r) => c >= 0 && r >= 0 && c < TD.cols && r < TD.rows && m.has(key(c, r));
    const starts = [];
    for (let r = 0; r < TD.rows; r++) if (has(0, r)) starts.push(r);
    if (starts.length !== 1) return { ok: false, error: starts.length ? 'The road may only enter from one tile on the left edge.' : 'Paint a road tile on the left edge where enemies enter.' };
    for (const k of m.keys()) {
      const [c, r] = k.split(',').map(Number);
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => has(c + dx, r + dy)).length;
      if (n > 2) return { ok: false, error: 'The road branches near column ' + (c + 1) + ', row ' + (r + 1) + '. Keep it one lane wide.' };
    }
    const cells = [[0, starts[0]]];
    const seen = new Set([key(0, starts[0])]);
    for (;;) {
      const [c, r] = cells[cells.length - 1];
      const next = [[1, 0], [0, -1], [0, 1], [-1, 0]].map(([dx, dy]) => [c + dx, r + dy]).find(([x, y]) => has(x, y) && !seen.has(key(x, y)));
      if (!next) break;
      seen.add(key(next[0], next[1]));
      cells.push(next);
    }
    const end = cells[cells.length - 1];
    if (end[0] !== TD.cols - 1) return { ok: false, error: 'The road has to reach the castle on the right edge.' };
    if (seen.size !== m.size) return { ok: false, error: 'Some road tiles are not connected to the main road.' };
    if (cells.length < TD.cols) return { ok: false, error: 'The road is too short.' };
    // corners only
    const path = [[-1, cells[0][1]]];
    for (let i = 1; i < cells.length - 1; i++) {
      const a = cells[i - 1], b = cells[i], c2 = cells[i + 1];
      if ((b[0] - a[0]) !== (c2[0] - b[0]) || (b[1] - a[1]) !== (c2[1] - b[1])) path.push([b[0], b[1]]);
    }
    path.push([TD.cols, end[1]]);
    return { ok: true, path, length: cells.length };
  }

  function tdFromPath(path) {
    const m = new Map();
    for (let i = 0; i < path.length - 1; i++) {
      let [x, y] = path[i];
      const [x2, y2] = path[i + 1];
      const dx = Math.sign(x2 - x), dy = Math.sign(y2 - y);
      for (;;) {
        if (x >= 0 && x < TD.cols && y >= 0 && y < TD.rows) m.set(key(x, y), 'road');
        if (x === x2 && y === y2) break;
        x += dx; y += dy;
      }
    }
    return pack('towerdefense', m);
  }

  // ------------------------------------------------------------------ arena

  const ARENA_CLEAR = (c, r) => c >= 10 && c <= 13 && r >= 5 && r <= 7;
  function arenaRects(layout) {
    const m = cellMap(layout);
    const out = [];
    for (let r = 0; r < ARENA.rows; r++) {
      let c = 0;
      while (c < ARENA.cols) {
        if (!m.has(key(c, r)) || ARENA_CLEAR(c, r)) { c++; continue; }
        let n = 1;
        while (c + n < ARENA.cols && m.has(key(c + n, r)) && !ARENA_CLEAR(c + n, r)) n++;
        out.push({ x: c * ARENA.cell, y: ARENA.y0 + r * ARENA.cell, w: n * ARENA.cell, h: ARENA.cell });
        c += n;
      }
    }
    return out;
  }
  function arenaFromRects(rects) {
    const m = new Map();
    for (const b of rects) {
      for (let c = Math.floor(b.x / ARENA.cell); c < Math.ceil((b.x + b.w) / ARENA.cell); c++) {
        for (let r = Math.floor((b.y - ARENA.y0) / ARENA.cell); r < Math.ceil((b.y + b.h - ARENA.y0) / ARENA.cell); r++) {
          if (c >= 0 && r >= 0 && c < ARENA.cols && r < ARENA.rows && !ARENA_CLEAR(c, r)) m.set(key(c, r), 'wall');
        }
      }
    }
    return pack('arena', m);
  }

  // ------------------------------------------------------------------- API

  BF.studio = {
    SPEC,
    MAX_CELLS,
    /** True when a template has a tile editor. */
    supports(template) { return !!SPEC[template]; },
    key,
    cellMap,
    pack,

    /** An empty layout for a template. */
    blank(template) {
      const m = new Map();
      if (template === 'obby') { for (let c = 2; c < 7; c++) m.set(key(c, 14), 'start'); for (let c = 20; c < 25; c++) m.set(key(c, 14), 'finish'); }
      if (template === 'towerdefense') for (let c = 0; c < TD.cols; c++) m.set(key(c, 4), 'road');
      return pack(template, m);
    },

    /** The seed-generated level of a creation, as an editable layout. */
    fromGenerated(template, seed, difficulty) {
      if (template === 'obby' && BF.obbyCourse) {
        // a short three-stage course fits the Studio grid; extend it from there
        return obbyFromCourse(BF.obbyCourse('obby:' + (seed || 7), 3, difficulty || 'normal'));
      }
      if (template === 'towerdefense' && BF.tdGenPath) return tdFromPath(BF.tdGenPath(seed || 7));
      if (template === 'arena' && BF.arenaGenMap) return arenaFromRects(BF.arenaGenMap(seed || 7));
      return BF.studio.blank(template);
    },

    /**
     * Check a layout before saving.
     * @returns {{ok:boolean, errors:string[], info:string}}
     */
    validate(template, layout) {
      const errors = [];
      const m = cellMap(layout);
      if (!SPEC[template]) return { ok: false, errors: ['This template has no Studio editor.'], info: '' };
      if (!layout || layout.kind !== template) errors.push('The layout does not match this template.');
      if (m.size > MAX_CELLS[template]) errors.push('Too many tiles (' + m.size + ' / ' + MAX_CELLS[template] + ').');
      for (const [k, t] of m) {
        const [c, r] = k.split(',').map(Number);
        if (!(c >= 0 && r >= 0 && c < SPEC[template].cols && r < SPEC[template].rows)) { errors.push('A tile is outside the map.'); break; }
        if (!SPEC[template].tiles[t]) { errors.push('Unknown tile "' + t + '".'); break; }
      }
      let info = '';
      if (template === 'obby') {
        const types = Array.from(m.values());
        if (!types.includes('start')) errors.push('Place a Start platform.');
        if (!types.includes('finish')) errors.push('Place a Finish platform.');
        const course = obbyCourse(layout);
        const start = course.plats.find((p) => p.tile === 'start');
        if (start && course.portal && course.portal.x < start.x) errors.push('The finish should be to the right of the start.');
        info = (course.stages - 1) + ' checkpoints · ' + course.plats.length + ' platforms · ' + course.kills.length + ' lava strips';
      } else if (template === 'towerdefense') {
        const tr = tdTrace(layout);
        if (!tr.ok) errors.push(tr.error);
        else info = 'Road length ' + tr.length + ' tiles · ' + (tr.path.length - 2) + ' turns';
      } else if (template === 'arena') {
        const rects = arenaRects(layout);
        info = rects.length + ' cover walls · the centre stays clear for spawns';
      }
      return { ok: !errors.length, errors, info };
    },

    obbyCourse,
    tdPath(layout) { const tr = tdTrace(layout); return tr.ok ? tr.path : null; },
    tdTrace,
    arenaRects,
  };
})((window.BF = window.BF || {}));
