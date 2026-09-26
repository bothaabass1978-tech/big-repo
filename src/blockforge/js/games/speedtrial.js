/**
 * Speed Trials (gameType "speedtrial") — top-down time-trial racing.
 * Roll a ball through five hand-built courses of normal track, ice, mud,
 * boost arrows and tight gates. Gates must be crossed in order. Your personal
 * best is replayed as a ghost and split times turn green when you are ahead.
 * Bronze / silver / gold medals unlock the next course. Medal times are
 * calibrated at load by an autopilot that uses the same physics as players.
 * Win: finish with at least a bronze medal. Lose: finish slower than bronze.
 * Passes: turbo (launch boost), all_courses (every course unlocked).
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;
  const TAU = Math.PI * 2;

  const R = 12;
  const PHYS = {
    normal: { accel: 720, max: 430, drag: 1.1 },
    ice: { accel: 260, max: 500, drag: 0.18 },
    mud: { accel: 520, max: 165, drag: 3.6 },
  };
  const BOOST = 620, BRAKE = 4.5, WALL_BOUNCE = 0.45;
  const MEDAL_K = { gold: 1.12, silver: 1.3, bronze: 1.6 };
  const SCALE = 2; // course coordinates below are authored at half size
  const MEDALS = ['bronze', 'silver', 'gold'];
  const MEDAL_COLOR = { gold: '#ffd66b', silver: '#d7dde6', bronze: '#d9a066' };

  const COURSES = [
    { id: 'neon', name: 'Neon Sprint', width: 150, color: '#39f3ff', pts: [[200, 700], [650, 700], [950, 520], [1350, 520], [1650, 720], [1700, 1050], [1400, 1250], [950, 1250], [650, 1080], [350, 1150]], surf: {}, boosts: [[0, 0.55], [6, 0.5]], gates: [2, 4, 5, 7, 8] },
    { id: 'frost', name: 'Frost Lane', width: 140, color: '#8fd3ff', pts: [[200, 300], [700, 300], [1000, 450], [1000, 800], [700, 950], [400, 1100], [500, 1400], [1100, 1400], [1500, 1150], [1900, 1150], [2100, 900]], surf: { 1: 'ice', 2: 'ice', 3: 'ice', 6: 'ice', 7: 'ice' }, boosts: [[5, 0.4]], gates: [2, 3, 5, 6, 8, 9] },
    { id: 'mud', name: 'Mudslide Canyon', width: 150, color: '#d9a066', pts: [[200, 1300], [600, 1300], [900, 1100], [900, 700], [1200, 450], [1600, 450], [1900, 700], [1900, 1100], [2200, 1300]], surf: { 2: 'mud', 5: 'mud', 7: 'mud' }, boosts: [[1, 0.5], [4, 0.5], [6, 0.5]], gates: [2, 3, 4, 5, 6, 7] },
    { id: 'zigzag', name: 'Zigzag Gates', width: 96, color: '#ff4f9a', pts: [[150, 300], [450, 300], [600, 560], [760, 300], [920, 560], [1080, 300], [1240, 560], [1400, 300], [1560, 560], [1720, 300], [2000, 300]], surf: {}, boosts: [[9, 0.5]], gates: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    { id: 'chaos', name: 'Chaos Circuit', width: 124, color: '#b67cff', pts: [[200, 200], [800, 200], [1100, 400], [1100, 700], [800, 900], [400, 900], [300, 1200], [700, 1450], [1300, 1450], [1700, 1200], [1700, 800], [2000, 550], [2300, 550]], surf: { 2: 'ice', 5: 'mud', 8: 'ice', 10: 'mud' }, boosts: [[0, 0.5], [7, 0.5], [11, 0.4]], gates: [2, 3, 5, 6, 8, 9, 10, 11] },
  ];

  // ------------------------------------------------------------ geometry
  function prep(c) {
    c.pts = c.pts.map((p) => [p[0] * SCALE, p[1] * SCALE]);
    c.segs = [];
    let s = 0;
    for (let i = 0; i < c.pts.length - 1; i++) {
      const [x1, y1] = c.pts[i], [x2, y2] = c.pts[i + 1];
      const len = Math.hypot(x2 - x1, y2 - y1);
      c.segs.push({ x1, y1, x2, y2, len, s0: s, tx: (x2 - x1) / len, ty: (y2 - y1) / len, surf: c.surf[i] || 'normal' });
      s += len;
    }
    c.total = s;
    c.gateS = c.gates.map((i) => c.segs[i].s0).concat([c.total]);
    c.boostPads = c.boosts.map(([i, k]) => { const sg = c.segs[i]; return { x: sg.x1 + (sg.x2 - sg.x1) * k, y: sg.y1 + (sg.y2 - sg.y1) * k, dx: sg.tx, dy: sg.ty }; });
    const xs = c.pts.map((p) => p[0]), ys = c.pts.map((p) => p[1]);
    c.bounds = { x: Math.min(...xs) - 300, y: Math.min(...ys) - 300, w: Math.max(...xs) - Math.min(...xs) + 600, h: Math.max(...ys) - Math.min(...ys) + 600 };
    return c;
  }
  function nearest(c, x, y) {
    let best = null;
    for (let i = 0; i < c.segs.length; i++) {
      const sg = c.segs[i];
      let t = ((x - sg.x1) * sg.tx + (y - sg.y1) * sg.ty) / sg.len;
      t = U.clamp(t, 0, 1);
      const px = sg.x1 + (sg.x2 - sg.x1) * t, py = sg.y1 + (sg.y2 - sg.y1) * t;
      const d = Math.hypot(x - px, y - py);
      if (!best || d < best.d) best = { i, t, px, py, d, s: sg.s0 + sg.len * t, sg };
    }
    return best;
  }
  function pointAt(c, s) {
    s = U.clamp(s, 0, c.total);
    for (const sg of c.segs) if (s <= sg.s0 + sg.len) { const k = (s - sg.s0) / sg.len; return { x: sg.x1 + (sg.x2 - sg.x1) * k, y: sg.y1 + (sg.y2 - sg.y1) * k, sg }; }
    const last = c.segs[c.segs.length - 1];
    return { x: last.x2, y: last.y2, sg: last };
  }

  /** One physics step shared by players, ghosts and the autopilot. */
  function stepBall(c, b, ix, iy, brake, dt) {
    const near = nearest(c, b.x, b.y);
    const ph = PHYS[near.sg.surf];
    const il = Math.hypot(ix, iy);
    if (il > 0.05) { b.vx += (ix / Math.max(1, il)) * ph.accel * dt; b.vy += (iy / Math.max(1, il)) * ph.accel * dt; }
    const damp = ph.drag + (brake ? BRAKE : 0);
    b.vx *= Math.exp(-damp * dt); b.vy *= Math.exp(-damp * dt);
    const sp = Math.hypot(b.vx, b.vy);
    const cap = b.boostT > 0 ? Math.max(ph.max, BOOST) : ph.max;
    if (sp > cap) { const k = U.lerp(1, cap / sp, near.sg.surf === 'mud' ? 0.3 : 0.08); b.vx *= k; b.vy *= k; }
    if (b.boostT > 0) b.boostT -= dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    // walls
    const n2 = nearest(c, b.x, b.y);
    const lim = c.width / 2 - R;
    if (n2.d > lim) {
      const nx = (b.x - n2.px) / n2.d, ny = (b.y - n2.py) / n2.d;
      b.x = n2.px + nx * lim; b.y = n2.py + ny * lim;
      const vn = b.vx * nx + b.vy * ny;
      if (vn > 0) { b.vx -= (1 + WALL_BOUNCE) * vn * nx; b.vy -= (1 + WALL_BOUNCE) * vn * ny; b.bumped = true; }
    }
    for (const pad of c.boostPads) if (Math.hypot(b.x - pad.x, b.y - pad.y) < 34 && !(b.onPad === pad)) { b.onPad = pad; const along = b.vx * pad.dx + b.vy * pad.dy; const add = Math.max(0, BOOST - along); b.vx += pad.dx * add; b.vy += pad.dy * add; b.boostT = 0.9; b.boosted = true; }
    if (b.onPad && Math.hypot(b.x - b.onPad.x, b.y - b.onPad.y) > 50) b.onPad = null;
    b.s = n2.s;
    return n2;
  }

  /** Deterministic autopilot used to calibrate medal times and drive bot ghosts. */
  function autopilot(c) {
    const b = { x: c.pts[0][0], y: c.pts[0][1], vx: 0, vy: 0, s: 0, boostT: 0 };
    const dt = 1 / 60, path = [];
    let t = 0, gate = 0, rec = 0;
    while (t < 240) {
      const sp = Math.hypot(b.vx, b.vy);
      const look = pointAt(c, b.s + 70 + sp * 0.35);
      const far = pointAt(c, b.s + 60 + sp * 0.9);
      const turn = Math.abs(U.wrapAngle(Math.atan2(far.y - look.y, far.x - look.x) - Math.atan2(look.y - b.y, look.x - b.x)));
      let ix = look.x - b.x, iy = look.y - b.y;
      // counter-steer the sideways drift
      const l = Math.hypot(ix, iy) || 1; ix /= l; iy /= l;
      const along = b.vx * ix + b.vy * iy;
      const sideX = b.vx - along * ix, sideY = b.vy - along * iy;
      ix -= sideX / 300; iy -= sideY / 300;
      const brake = turn > 0.9 && sp > 260;
      stepBall(c, b, ix, iy, brake, dt);
      t += dt; rec += dt;
      if (rec >= 0.05) { rec = 0; path.push([Math.round(b.x), Math.round(b.y)]); }
      while (gate < c.gateS.length && b.s >= c.gateS[gate] - 4) gate++;
      if (gate >= c.gateS.length) break;
    }
    return { time: t, path };
  }
  COURSES.forEach((c) => {
    prep(c);
    c.auto = autopilot(c);
    c.targets = { gold: c.auto.time * MEDAL_K.gold, silver: c.auto.time * MEDAL_K.silver, bronze: c.auto.time * MEDAL_K.bronze };
  });
  BF.speedTrialCourses = COURSES;

  BF.GameModules.register('speedtrial', {
    three: true,
    maxBots: 4,
    feedTop: 0.18,
    actions: { brake: ['Space'], restart: ['KeyR'] },
    controls: { joystick: true, buttons: [{ act: 'brake', label: 'Brake', icon: 'pause' }, { act: 'restart', label: 'Restart', icon: 'refresh' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const V = ctx.g3;
      const parts = V ? V.particles2d(10) : new BF.Particles(400);
      const floats = V ? V.floaters2d(50) : new BF.Floaters();
      const cam = new BF.Camera(W, H);
      const d = ctx.data;
      d.medals = d.medals || {};
      d.pbs = d.pbs || {};
      const allCourses = ctx.hasPass('all_courses');
      const unlocked = (i) => allCourses || i === 0 || !!d.medals[COURSES[i - 1].id];
      let selIdx = Math.max(0, COURSES.findIndex((c) => c.id === d.lastCourse));
      if (!unlocked(selIdx)) selIdx = 0;
      let phase = 'lobby';
      let course = null, ball = null, countT = 0, time = 0, gate = 0, rec = 0, path = [], splits = [], lastSplit = null;
      const ghosts = [];

      function lobby() {
        const cards = COURSES.map((c, i) => {
          const lock = !unlocked(i);
          const m = d.medals[c.id];
          const pb = d.pbs[c.id];
          return '<button class="gp-card' + (i === selIdx ? ' on' : '') + (lock ? ' locked' : '') + '" data-gact="course-' + i + '"' + (lock ? ' disabled' : '') + '><b>' + (lock ? BF.icon('lock', 12) + ' ' : '') + (i + 1) + '. ' + c.name + '</b><small>' + (lock ? 'Earn a medal on ' + COURSES[i - 1].name : 'PB ' + (pb ? U.fmtTime(pb.time * 1000) : '—')) + '</small><small>' + MEDALS.slice().reverse().map((md) => '<span style="color:' + MEDAL_COLOR[md] + '">' + md[0].toUpperCase() + ' ' + U.fmtTime(c.targets[md] * 1000) + '</span>').join(' · ') + '</small>' + (m ? '<span class="pill" style="color:' + MEDAL_COLOR[m] + '">' + BF.icon('medal', 11) + m + ' medal</span>' : '') + '</button>';
        }).join('');
        ctx.ui.panel('lobby', '<h3>' + BF.icon('timer', 18) + ' Speed Trials</h3><p>Pass every gate in order. Beat bronze to earn a medal and unlock the next course. Your best run races you as a ghost.</p><div class="gp-grid">' + cards + '</div><div class="gp-actions">' +
          (!allCourses ? '<button class="btn btn-outline" data-gact="buy-all">' + BF.icon('ticket', 13) + 'All Courses</button>' : '') + (!ctx.hasPass('turbo') ? '<button class="btn btn-outline" data-gact="buy-turbo">' + BF.icon('ticket', 13) + 'Turbo Start</button>' : '') +
          '<button class="btn btn-play btn-lg" data-gact="race">' + BF.icon('play', 15) + 'Race</button></div>', 'center wide');
      }
      lobby();
      const offPass = BF.bus.on('pass:purchased', () => { if (phase === 'lobby') lobby(); });

      function start() {
        course = COURSES[selIdx];
        d.lastCourse = course.id; ctx.save();
        ctx.ui.remove('lobby');
        ball = { x: course.pts[0][0], y: course.pts[0][1], vx: 0, vy: 0, s: 0, boostT: 0 };
        cam.bounds = course.bounds;
        cam.x = ball.x - W / 2; cam.y = ball.y - H / 2;
        phase = 'count'; countT = 3; time = 0; gate = 0; rec = 0; path = []; splits = []; lastSplit = null;
        ghosts.length = 0;
        const pb = d.pbs[course.id];
        if (pb && pb.path) ghosts.push({ name: 'Your best', path: pb.path, color: '#ffb454', me: true, time: pb.time });
        ctx.bots.slice(0, 4).forEach((b) => {
          const skill = U.clamp((ctx.botLevel(b) || 10) / 55, 0.2, 0.95);
          const k = 1.02 + (1 - skill) * 0.45 + Math.random() * 0.08;
          ghosts.push({ name: b.displayName, bot: b, path: course.auto.path, scale: k, color: BF.gfx.nameColor(b.username), time: course.auto.time * k, announced: false });
        });
      }
      function ghostPos(gh, t) {
        const tt = gh.scale ? t / gh.scale : t;
        const f = tt / 0.05;
        const i = Math.floor(f);
        if (i >= gh.path.length - 1) return { x: gh.path[gh.path.length - 1][0], y: gh.path[gh.path.length - 1][1], done: true };
        const k = f - i;
        return { x: U.lerp(gh.path[i][0], gh.path[i + 1][0], k), y: U.lerp(gh.path[i][1], gh.path[i + 1][1], k) };
      }
      function finishRun() {
        phase = 'over';
        const tt = time;
        const pb = d.pbs[course.id];
        const improved = !pb || tt < pb.time;
        if (improved) d.pbs[course.id] = { time: Math.round(tt * 1000) / 1000, path, splits };
        let medal = null;
        for (const m of ['gold', 'silver', 'bronze']) if (tt <= course.targets[m]) { medal = m; break; }
        const prev = d.medals[course.id];
        if (medal && (!prev || MEDALS.indexOf(medal) > MEDALS.indexOf(prev))) d.medals[course.id] = medal;
        ctx.save();
        const count = Object.keys(d.medals).length;
        ctx.best('medals', count, 'max');
        if (course.id === 'neon') ctx.best('bestTime', Math.round(tt * 1000), 'min');
        if (d.medals[course.id] === 'gold') ctx.badge('st_gold');
        if (count >= COURSES.length) ctx.badge('st_all_medals');
        if (medal && !prev && selIdx < COURSES.length - 1) ctx.feed(COURSES[selIdx + 1].name + ' unlocked!', 'star', '#ffd66b');
        ctx.end({
          outcome: medal ? 'win' : 'lose',
          title: medal ? medal[0].toUpperCase() + medal.slice(1) + ' medal!' : 'No medal this time',
          subtitle: course.name + ' · ' + U.fmtTime(tt * 1000) + (medal ? '' : ' (bronze is ' + U.fmtTime(course.targets.bronze * 1000) + ')'),
          best: improved ? 'New personal best on ' + course.name : null,
          coins: 15 + (medal === 'gold' ? 45 : medal === 'silver' ? 30 : medal === 'bronze' ? 20 : 0),
          xp: 30 + (medal ? 60 + MEDALS.indexOf(medal) * 30 : 0),
          stats: [['Time', U.fmtTime(tt * 1000)], ['Course', course.name], ['Gold target', U.fmtTime(course.targets.gold * 1000)], ['Personal best', U.fmtTime(Math.min(tt, pb ? pb.time : tt) * 1000)]],
        });
      }

      ctx.ui.on((a) => {
        if (a.indexOf('course-') === 0 && phase === 'lobby') { const i = +a.slice(7); if (unlocked(i)) { selIdx = i; ctx.sfx('click'); lobby(); } }
        if (a === 'race' && phase === 'lobby') start();
        if (a === 'buy-all') BF.actions.run('buy-pass', null, null, { pass: 'st_all' });
        if (a === 'buy-turbo') BF.actions.run('buy-pass', null, null, { pass: 'st_turbo' });
      });

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        V.preset('night', { fogNear: 1200, fogFar: 3400 });
        V.stars(400);
        V.shadowSize(520);
        V.ground(-3000, -3000, 7000, 6000, '#ffffff', { y: -60, map: BF.g3d.gridTex('#0a0c14', 'rgba(57,243,255,0.16)', 4, { repeat: [60, 50] }), basic: true });
        let built = null, trackG = null, gateMeshes = [], padMeshes = [];
        const ghostPool = V.pool();
        const SURF_COL = { ice: '#bfe6ff', mud: '#6b4b2a', normal: '#262b3a' };
        const orb = V.group();
        const shell = V.shape('sphere', 0, 0, 0, 34, 34, 34, ctx.player.look.shirt || '#ffb454', { parent: orb, opacity: 0.42, rough: 0.05, metal: 0.2, depthWrite: false });
        shell.castShadow = true;
        const band = V.shape('torus', 0, 0, 0, 30, 30, 30, '#ffffff', { parent: orb, glow: 0.8, shadow: false });
        band.rotation.x = Math.PI / 2;
        const rig = BF.char3d.build(ctx.player.avatar);
        rig.group.scale.setScalar(3.3);
        rig.group.position.y = -12;
        orb.add(rig.group);
        const qb = new THREE.Quaternion(), axis = new THREE.Vector3();

        function rebuild() {
          built = course;
          if (trackG) V.remove(trackG);
          trackG = V.group();
          const c = course;
          const pts = c.pts.map((p) => ({ x: p[0], y: p[1] }));
          V.strip(pts, { width: c.width + 16, y: 0.4, closed: false, color: c.color, glow: 0.8, parent: trackG });
          for (const sg of c.segs) V.strip([{ x: sg.x1, y: sg.y1 }, { x: sg.x2, y: sg.y2 }], { width: c.width, y: 1, closed: false, color: SURF_COL[sg.surf], parent: trackG });
          c.pts.forEach((p, i) => { const sf = c.segs[Math.min(i, c.segs.length - 1)].surf; V.shape('cyl', p[0], 0.9, p[1], c.width, 1.4, c.width, SURF_COL[sf], { parent: trackG, shadow: false }); V.shape('cyl', p[0], 0.3, p[1], c.width + 16, 1, c.width + 16, c.color, { parent: trackG, glow: 0.8, shadow: false }); });
          // rails
          for (const sg of c.segs) {
            const len = sg.len, a = Math.atan2(sg.ty, sg.tx), nx = -sg.ty, ny = sg.tx;
            for (const sd of [-1, 1]) { const m = V.box((sg.x1 + sg.x2) / 2 + nx * sd * (c.width / 2 + 6), 0, (sg.y1 + sg.y2) / 2 + ny * sd * (c.width / 2 + 6), len, 8, 4, c.color, { parent: trackG, glow: 1, shadow: false }); m.rotation.y = -a; }
          }
          // track pillars
          const piles = [];
          for (const sg of c.segs) for (let k = 0; k < sg.len; k += 220) piles.push({ x: sg.x1 + sg.tx * k, y: -60, z: sg.y1 + sg.ty * k, w: 18, h: 60, d: 18, color: '#1b1e2a' });
          V.boxes(piles, { parent: trackG, shadow: false });
          // a neon skyline far below and around the course
          const r = U.rng('st-sky' + c.id), towers = [], caps = [];
          let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
          for (const p of c.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
          for (let i = 0; i < 70; i++) {
            const x = x0 - 500 + r() * (x1 - x0 + 1000), z = z0 - 500 + r() * (z1 - z0 + 1000);
            const gap = Math.min(...c.segs.map((sg) => BF.phys.distToSeg(x, z, sg.x1, sg.y1, sg.x2, sg.y2)));
            if (gap < c.width + 160) continue;
            // towers grow taller the farther they stand from the track, so none crowd the camera
            const w = 40 + r() * 50, h = 30 + Math.min(1, (gap - c.width - 160) / 500) * (80 + r() * 240);
            towers.push({ x, y: -60, z, w, h, d: w, color: U.shade('#161a2c', r() * 0.1) });
            caps.push({ x, y: -60 + h, z, w: w + 2, h: 3, d: w + 2, color: r() < 0.5 ? c.color : '#b67cff' });
          }
          V.boxes(towers, { parent: trackG, shadow: false });
          V.boxes(caps, { parent: trackG, shadow: false, glow: 1 });
          padMeshes = c.boostPads.map((pad) => {
            const g = V.group(trackG);
            g.position.set(pad.x, 2, pad.y);
            g.rotation.y = -Math.atan2(pad.dy, pad.dx);
            V.box(0, 0, 0, 60, 1, 48, '#ffd66b', { parent: g, basic: true, opacity: 0.2, shadow: false });
            g.userData.chev = [0, 1, 2].map(() => { const ch = V.shape('cone4', 0, 1.5, 0, 16, 18, 4, '#ffd66b', { parent: g, glow: 1.4, shadow: false }); ch.rotation.z = -Math.PI / 2; ch.rotation.x = Math.PI / 2; return ch; });
            return g;
          });
          gateMeshes = c.gateS.map((gs, i) => {
            const p = pointAt(c, gs);
            const nx = -p.sg.ty, ny = p.sg.tx, half = c.width / 2;
            const g = V.group(trackG);
            g.position.set(p.x, 0, p.y);
            g.rotation.y = -Math.atan2(ny, nx);
            for (const sd of [-1, 1]) V.box(sd * half, 0, 0, 8, 54, 8, '#ffffff', { parent: g });
            const last = i === c.gateS.length - 1;
            if (last) { for (let k = -4; k < 4; k++) V.box((k + 0.5) * (half / 4), 1.6, 0, half / 4, 1, 12, (k & 1) ? '#ffffff' : '#1b1b22', { parent: g, shadow: false }); V.box(0, 54, 0, half * 2 + 8, 10, 8, '#ffffff', { parent: g }); }
            g.userData.bar = V.box(0, 50, 0, half * 2, 6, 6, c.color, { parent: g, glow: 1, shadow: false });
            g.userData.last = last;
            return g;
          });
        }

        return function sync(dt) {
          const t = ctx.time;
          if (!course) {
            V.look(0, 0, 0, { dist: 400, pitch: 0.5, yaw: t * 0.2, fov: 45 }, dt);
            orb.position.set(0, 20, 0);
            rig.tick(dt);
            V.sweep();
            return;
          }
          if (built !== course) rebuild();
          if (ball) V.look(ball.x + ball.vx * 0.3, 0, ball.y + ball.vy * 0.3, { dist: 440, pitch: 0.82, fov: 48, lerp: 0.14 }, dt);
          padMeshes.forEach((g) => g.userData.chev.forEach((ch, k) => { ch.position.x = ((t * 60 + k * 18) % 54) - 27; }));
          gateMeshes.forEach((g, i) => { if (g.userData.last) return; g.userData.bar.material = V.mat(i === gate ? '#3fd08a' : i < gate ? '#5a606c' : course.color, { glow: i === gate ? 1.4 : 0.6 }); });
          if (ball) {
            orb.position.set(ball.x, 17, ball.y);
            const sp = Math.hypot(ball.vx, ball.vy);
            if (sp > 1) { axis.set(ball.vy, 0, -ball.vx).normalize(); qb.setFromAxisAngle(axis, (sp * dt) / 17); shell.quaternion.premultiply(qb); band.quaternion.premultiply(qb); rig.group.rotation.y = Math.PI / 2 - Math.atan2(ball.vy, ball.vx); }
            rig.set({ move: Math.min(1.5, sp / 300) });
            rig.tick(dt);
            V.label(ball.x, 44, ball.y, { name: ctx.player.name, color: '#ffb454', bubble: ctx.bubbleText('me') });
          }
          const gt = phase === 'race' ? time : 0;
          for (const gh of ghosts) {
            const p = ghostPos(gh, gt);
            const m = ghostPool.use(gh, () => V.shape('sphere', 0, 0, 0, 26, 26, 26, gh.color, { opacity: 0.4, glow: 0.4, depthWrite: false, shadow: false }));
            m.position.set(p.x, 14, p.y);
            // ghosts sitting on top of the ball (the start line) keep quiet so tags do not pile up
            const near = ball && Math.hypot(p.x - ball.x, p.y - ball.y) < 40;
            m.visible = !near;
            if (!near) V.label(p.x, 36, p.y, { name: gh.name, color: gh.color, bubble: gh.bot ? ctx.bubbleText(gh.bot.id) : null });
          }
          ghostPool.sweep();
          V.sweep();
        };
      })();

      return {
        update(dt) {
          parts.update(dt);
          floats.update(dt);
          if (phase === 'lobby' || phase === 'over' || !course) return;
          const inp = ctx.input;
          if (inp.actPressed('restart')) { start(); return; }
          if (phase === 'count') {
            const before = Math.ceil(countT);
            countT -= dt;
            if (Math.ceil(countT) !== before && countT > 0) ctx.sfx('beep');
            if (countT <= 0) {
              phase = 'race'; ctx.sfx('go');
              if (ctx.hasPass('turbo')) { const sg = course.segs[0]; ball.vx = sg.tx * 480; ball.vy = sg.ty * 480; ball.boostT = 0.6; parts.emit(ball.x, ball.y, { count: 20, color: '#ffd66b', speed: 160, life: 0.5 }); }
            }
            cam.follow(ball.x, ball.y, dt, 0.2);
            return;
          }
          time += dt;
          const ax = inp.axis();
          ball.bumped = false; ball.boosted = false;
          stepBall(course, ball, ax.x, ax.y, inp.act('brake'), dt);
          if (ball.bumped && Math.hypot(ball.vx, ball.vy) > 120) ctx.sfx('land', { volume: 0.3 });
          if (ball.boosted) { ctx.sfx('boost', { volume: 0.5 }); parts.emit(ball.x, ball.y, { count: 14, color: course.color, speed: 120, life: 0.4 }); }
          const surf = nearest(course, ball.x, ball.y).sg.surf;
          if (surf === 'mud' && Math.random() < 0.3) parts.emit(ball.x, ball.y, { count: 1, color: '#6b4b2a', speed: 40, life: 0.4 });
          if (surf === 'ice' && Math.random() < 0.2) parts.emit(ball.x, ball.y, { count: 1, color: '#e6fbff', speed: 30, life: 0.5 });
          rec += dt;
          if (rec >= 0.05) { rec = 0; path.push([Math.round(ball.x), Math.round(ball.y)]); }
          while (gate < course.gateS.length && ball.s >= course.gateS[gate] - 4) {
            const pb = d.pbs[course.id];
            const ref = pb && pb.splits ? pb.splits[gate] : null;
            splits.push(Math.round(time * 1000) / 1000);
            lastSplit = { gate, t: time, diff: ref != null ? time - ref : null, shown: 2.2 };
            gate++;
            ctx.sfx(gate >= course.gateS.length ? 'win' : 'pickup', { volume: 0.5 });
            if (gate >= course.gateS.length) { finishRun(); return; }
          }
          if (lastSplit) { lastSplit.shown -= dt; if (lastSplit.shown <= 0) lastSplit = null; }
          for (const gh of ghosts) if (gh.bot && !gh.announced && time >= gh.time) { gh.announced = true; ctx.feed(gh.name + ' finished in ' + U.fmtTime(gh.time * 1000) + '.', 'info', gh.color); }
          cam.follow(ball.x + ball.vx * 0.35, ball.y + ball.vy * 0.35, dt, 0.18);
        },

        draw(g) {
          const t = ctx.time;
          g.fillStyle = '#0a0c14'; g.fillRect(0, 0, W, H);
          g.strokeStyle = 'rgba(255,255,255,.04)'; g.lineWidth = 1;
          const ox = -((cam.x % 60) + 60) % 60, oy = -((cam.y % 60) + 60) % 60;
          for (let x = ox; x < W; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
          for (let y = oy; y < H; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
          if (!course) return;
          g.save();
          cam.apply(g);
          g.lineCap = 'round'; g.lineJoin = 'round';
          // track edges then floor per segment
          g.strokeStyle = course.color; g.lineWidth = course.width + 8; g.globalAlpha = 0.5;
          g.beginPath(); course.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
          g.globalAlpha = 1;
          for (const sg of course.segs) {
            g.strokeStyle = sg.surf === 'ice' ? '#bfe6ff' : sg.surf === 'mud' ? '#6b4b2a' : '#262b3a';
            g.lineWidth = course.width;
            g.beginPath(); g.moveTo(sg.x1, sg.y1); g.lineTo(sg.x2, sg.y2); g.stroke();
          }
          course.pts.forEach((p, i) => { const sf = course.segs[Math.min(i, course.segs.length - 1)].surf; G.circle(g, p[0], p[1], course.width / 2, sf === 'ice' ? '#bfe6ff' : sf === 'mud' ? '#6b4b2a' : '#262b3a'); });
          for (const sg of course.segs) if (sg.surf !== 'normal') { g.fillStyle = sg.surf === 'ice' ? 'rgba(255,255,255,.35)' : 'rgba(40,25,10,.4)'; for (let k = 0.1; k < 1; k += 0.18) G.circle(g, sg.x1 + (sg.x2 - sg.x1) * k + Math.sin(k * 40) * 20, sg.y1 + (sg.y2 - sg.y1) * k + Math.cos(k * 40) * 20, 6, g.fillStyle); }
          // boost pads
          for (const pad of course.boostPads) {
            const a = Math.atan2(pad.dy, pad.dx);
            g.save(); g.translate(pad.x, pad.y); g.rotate(a);
            G.fillRR(g, -30, -24, 60, 48, 8, 'rgba(255,214,107,.18)');
            for (let k = 0; k < 3; k++) { const off = ((t * 60 + k * 18) % 54) - 27; g.globalAlpha = 0.9; g.strokeStyle = '#ffd66b'; g.lineWidth = 5; g.beginPath(); g.moveTo(off - 6, -12); g.lineTo(off + 6, 0); g.lineTo(off - 6, 12); g.stroke(); }
            g.globalAlpha = 1; g.restore();
          }
          // gates
          course.gateS.forEach((s, i) => {
            const p = pointAt(course, s);
            const nx = -p.sg.ty, ny = p.sg.tx, half = course.width / 2;
            const last = i === course.gateS.length - 1;
            const done = i < gate, next = i === gate;
            if (last) { for (let k = -4; k < 4; k++) { g.fillStyle = (k & 1) ? '#ffffff' : '#1b1b22'; g.save(); g.translate(p.x, p.y); g.rotate(Math.atan2(ny, nx)); g.fillRect(k * (half / 4), -6, half / 4, 12); g.restore(); } }
            else { g.globalAlpha = done ? 0.25 : next ? 0.95 : 0.55; G.line(g, p.x - nx * half, p.y - ny * half, p.x + nx * half, p.y + ny * half, next ? '#3fd08a' : done ? '#ffffff' : course.color, next ? 6 : 4); g.globalAlpha = 1; }
            G.circle(g, p.x - nx * half, p.y - ny * half, 7, '#ffffff'); G.circle(g, p.x + nx * half, p.y + ny * half, 7, '#ffffff');
          });
          // ghosts
          const gt = phase === 'race' ? time : 0;
          for (const gh of ghosts) {
            const p = ghostPos(gh, gt);
            g.globalAlpha = 0.4; G.circle(g, p.x, p.y, R, gh.color); g.globalAlpha = 1;
            G.text(g, gh.name, p.x, p.y - 18, { size: 10, align: 'center', color: gh.color, alpha: 0.8 });
          }
          // ball
          if (ball) {
            G.shadow(g, ball.x + 3, ball.y + 5, R, R * 0.5, 0.35);
            const col = ctx.player.look.shirt || '#ffb454';
            G.circle(g, ball.x, ball.y, R, col);
            G.circle(g, ball.x - 4, ball.y - 4, R * 0.35, 'rgba(255,255,255,.7)');
            const roll = (ball.x + ball.y) * 0.05;
            g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.beginPath(); g.arc(ball.x, ball.y, R * 0.6, roll, roll + 1.5); g.stroke();
            G.text(g, ctx.player.name, ball.x, ball.y - 20, { size: 11, align: 'center', color: '#ffb454', weight: 800, stroke: 'rgba(0,0,0,.6)', strokeW: 3 });
          }
          parts.draw(g);
          floats.draw(g);
          g.restore();
          drawHud(g);
        },

        render3d(dt) { view(dt); },
        hud(g) { drawHud(g); },

        onBotJoin() {},
        onBotLeave() {},
        destroy() { offPass(); },
      };

      function drawHud(g) {
          if (phase === 'lobby' || !course) return;
          G.panel(g, 10, 10, 250, 70);
          G.text(g, U.fmtTime(time * 1000), 22, 42, { size: 26, weight: 800, color: '#fff', font: "'Rubik', system-ui, sans-serif" });
          G.text(g, course.name, 248, 30, { size: 12, align: 'right', color: course.color, weight: 800 });
          G.text(g, 'Gate ' + Math.min(gate, course.gateS.length) + ' / ' + course.gateS.length, 248, 48, { size: 12, align: 'right', color: '#cfd6e2' });
          G.text(g, 'Gold ' + U.fmtTime(course.targets.gold * 1000) + ' · Bronze ' + U.fmtTime(course.targets.bronze * 1000), 22, 68, { size: 10.5, color: '#a1abbb' });
          if (lastSplit && lastSplit.diff != null) G.display(g, (lastSplit.diff <= 0 ? '−' : '+') + Math.abs(lastSplit.diff).toFixed(2), W / 2, 90, 30, lastSplit.diff <= 0 ? '#3fd08a' : '#ff5a6a');
          else if (lastSplit) G.display(g, U.fmtTime(lastSplit.t * 1000), W / 2, 90, 26, '#ffffff');
          if (phase === 'count') G.display(g, countT > 0.1 ? String(Math.ceil(countT)) : 'GO', W / 2, H / 2 - 40, 84, '#ffffff');
          if (ball) { const sp = Math.hypot(ball.vx, ball.vy); G.panel(g, W - 130, H - 50, 120, 40); G.text(g, Math.round(sp / 4) + ' km/h', W - 20, H - 24, { size: 16, weight: 800, align: 'right', color: ball.boostT > 0 ? '#ffd66b' : '#fff' }); }
      }
    },
  });
})((window.BF = window.BF || {}));
