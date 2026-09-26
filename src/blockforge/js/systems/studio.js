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
  /** Custom games: a top-down world built from scratch, with rules chosen by the creator. */
  const CUSTOM = {
    cols: 30, rows: 18, cell: 40,
    tiles: {
      start: { label: 'Spawn', color: '#ffffff', icon: 'flag' },
      wall: { label: 'Wall', color: '#6a7383', icon: 'grid' },
      coin: { label: 'Coin', color: '#ffd23f', icon: 'star' },
      gem: { label: 'Gem (+5)', color: '#7fe7ff', icon: 'gem' },
      goal: { label: 'Goal flag', color: '#3fd08a', icon: 'flag' },
      lava: { label: 'Lava', color: '#ff3d1f', icon: 'fire' },
      spikes: { label: 'Spike trap', color: '#b9b3a6', icon: 'warning' },
      enemy: { label: 'Enemy', color: '#8fbf6a', icon: 'skull' },
      key: { label: 'Key', color: '#ffc940', icon: 'key' },
      door: { label: 'Locked door', color: '#8b5a2b', icon: 'lock' },
      speed: { label: 'Speed pad', color: '#39f3ff', icon: 'bolt' },
      bounce: { label: 'Jump pad', color: '#4ad17f', icon: 'chevronUp' },
      heal: { label: 'Extra life', color: '#ff5a8a', icon: 'heart' },
      check: { label: 'Checkpoint', color: '#b67cff', icon: 'flag' },
    },
    goals: {
      collect: 'Collect every coin',
      reach: 'Reach the goal flag',
      survive: 'Survive until the timer ends',
      score: 'Grab the most coins before time runs out',
    },
    themes: {
      grass: { label: 'Meadow', floor: '#5aab52', wall: '#8a909c', preset: 'day' },
      desert: { label: 'Desert', floor: '#e2c27a', wall: '#b07a45', preset: 'sunset' },
      snow: { label: 'Snowfield', floor: '#e8f4ff', wall: '#9aa5b5', preset: 'day' },
      space: { label: 'Space station', floor: '#1b1f3a', wall: '#5a5f8a', preset: 'space' },
      lava: { label: 'Volcano', floor: '#3a2a2a', wall: '#6a3a2a', preset: 'dusk' },
      neon: { label: 'Neon grid', floor: '#101426', wall: '#39f3ff', preset: 'night' },
    },
  };
  /** Default rules for a new custom game (all tunable in the Studio). */
  const DEFAULT_RULES = { goal: 'collect', time: 180, lives: 3, speed: 'normal', enemySpeed: 'normal', theme: 'grass', bots: true };
  const SPEC = { obby: OBBY, towerdefense: TD, arena: ARENA, custom: CUSTOM };
  const MAX_CELLS = { obby: 1600, towerdefense: 180, arena: 90, custom: 540 };

  const key = (c, r) => c + ',' + r;
  /** Cells as a Map "c,r" -> type from the compact [[c, r, type], ...] form. */
  const DEFAULT_TILE = { obby: 'ground', towerdefense: 'road', arena: 'wall', custom: 'wall' };
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
    for (const [k, t] of m) { const [c, r] = k.split(',').map(Number); cells.push(kind === 'obby' || kind === 'custom' ? [c, r, t] : [c, r]); }
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

  /** A small ready-to-play sample world (so a new custom game is fun before any editing). */
  function customSample(seed) {
    const r = U.rng('custom:' + seed);
    const m = BF.studio.cellMap(BF.studio.blank('custom'));
    for (let i = 0; i < 5; i++) { const x = 5 + i * 5, y0 = 2 + Math.floor(r() * 4); for (let y = y0; y < y0 + 7; y++) if (y > 0 && y < CUSTOM.rows - 1) m.set(key(x, y), 'wall'); }
    for (let i = 0; i < 14; i++) { const c = 2 + Math.floor(r() * 26), rr = 1 + Math.floor(r() * 16); if (!m.has(key(c, rr))) m.set(key(c, rr), 'coin'); }
    for (const [c, rr, t] of [[9, 14, 'gem'], [19, 3, 'gem'], [14, 12, 'enemy'], [22, 7, 'enemy'], [12, 5, 'lava'], [13, 5, 'lava'], [17, 13, 'speed'], [7, 12, 'heal'], [24, 12, 'spikes']]) m.set(key(c, rr), t);
    const out = pack('custom', m);
    out.rules = Object.assign({}, DEFAULT_RULES);
    return out;
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
      if (template === 'custom') { m.set(key(2, 9), 'start'); m.set(key(27, 9), 'goal'); for (let c = 0; c < CUSTOM.cols; c++) { m.set(key(c, 0), 'wall'); m.set(key(c, CUSTOM.rows - 1), 'wall'); } for (let r = 0; r < CUSTOM.rows; r++) { m.set(key(0, r), 'wall'); m.set(key(CUSTOM.cols - 1, r), 'wall'); } }
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
      if (template === 'custom') return customSample(seed || 7);
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
      } else if (template === 'custom') {
        const n = (t) => Array.from(m.values()).filter((x) => x === t).length;
        const rules = Object.assign({}, DEFAULT_RULES, (layout && layout.rules) || {});
        if (n('start') !== 1) errors.push(n('start') ? 'Only one Spawn tile.' : 'Place a Spawn tile.');
        if (rules.goal === 'collect' && !n('coin')) errors.push('Collect-every-coin games need at least one coin.');
        if (rules.goal === 'reach' && !n('goal')) errors.push('Place a Goal flag.');
        if (rules.goal === 'score' && n('coin') + n('gem') < 3) errors.push('Score games need at least 3 coins or gems.');
        if (n('door') && !n('key')) errors.push('Locked doors need a key somewhere.');
        info = CUSTOM.goals[rules.goal] + ' · ' + n('coin') + ' coins · ' + n('enemy') + ' enemies · ' + U.fmtClock(rules.time) + ' · ' + rules.lives + ' lives';
      }
      return { ok: !errors.length, errors, info };
    },

    CUSTOM,
    DEFAULT_RULES,
    /** Rules of a custom layout with defaults filled in and values clamped. */
    rules(layout) {
      const r = Object.assign({}, DEFAULT_RULES, (layout && layout.rules) || {});
      if (!CUSTOM.goals[r.goal]) r.goal = 'collect';
      if (!CUSTOM.themes[r.theme]) r.theme = 'grass';
      const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);
      r.time = U.clamp(Math.round(num(r.time, 180)), 30, 900);
      r.lives = U.clamp(Math.round(num(r.lives, 3)), 1, 9);
      if (!['slow', 'normal', 'fast'].includes(r.speed)) r.speed = 'normal';
      if (!['slow', 'normal', 'fast'].includes(r.enemySpeed)) r.enemySpeed = 'normal';
      r.bots = r.bots !== false;
      return r;
    },
    obbyCourse,
    tdPath(layout) { const tr = tdTrace(layout); return tr.ok ? tr.path : null; },
    tdTrace,
    arenaRects,
  };
})((window.BF = window.BF || {}));
