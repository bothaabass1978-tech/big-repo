/**
 * Golf (gameType "golf") — six holes of mini golf. Aim with A/D (or the
 * pointer), hold Space to charge, release to putt. Walls bounce, sand and
 * syrup slow the ball, water costs a stroke. The other players post their
 * scores hole by hole; the lowest total wins.
 *
 * Variants (config.variant):
 *   classic  Mini Golf Mania    windmill, sand and ponds
 *   neon     Neon Putt          glowing walls and sliding bumpers
 *   candy    Candy Course Golf  sticky syrup and gumdrop bumpers
 *   space    Zero-G Golf        almost no friction, gravity wells bend your putts
 *   castle   Castle Putt        a drawbridge that opens and closes, and a moat
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  const T = {
    holes: 6, maxStrokes: 8, power: 900, minPower: 60, charge: 1.1, stop: 7, friction: 1.25, sand: 4.2, syrup: 6.5, cupR: 13, sinkSpeed: 470, ballR: 7,
    rewards: { play: 12, win: 45, per: 0, xpPlay: 25, xpWin: 90 },
  };
  const VARIANTS = {
    classic: { preset: 'day', green: '#4ab84a', wall: '#b07a45', rough: '#2f7f3a', hazard: 'sand', extra: 'windmill' },
    neon: { preset: 'night', green: '#141a3a', wall: '#39f3ff', rough: '#0a0d1f', hazard: 'sand', extra: 'slider', glow: true },
    candy: { preset: 'sunset', green: '#ffb3d9', wall: '#ffffff', rough: '#ff8fc7', hazard: 'syrup', extra: 'gumdrop' },
    space: { preset: 'space', green: '#4a4f6a', wall: '#8a8fae', rough: '#1a1d2e', hazard: 'none', extra: 'well', friction: 0.55 },
    castle: { preset: 'dusk', green: '#5a8a4a', wall: '#8a8f9e', rough: '#3a4a3a', hazard: 'water', extra: 'bridge' },
  };

  /** Build hole n: {w, h, tee, cup, par, walls[], zones[] (sand/syrup/water), bumpers[], movers[]} centred on (0,0). */
  function makeHole(n, VAR, seed) {
    const r = U.rng('hole:' + seed + ':' + n);
    const w = 560 + n * 20, h = 300;
    const hole = { w, h, tee: { x: -w / 2 + 50, y: 0 }, cup: { x: w / 2 - 50, y: 0 }, par: 2, walls: [], zones: [], bumpers: [], movers: [], wells: [] };
    const wall = (x, y, ww, hh) => hole.walls.push({ x, y, w: ww, h: hh });
    const kind = n % 6;
    if (kind === 0) { hole.bumpers.push({ x: 0, y: (r() - 0.5) * 60, r: 26 }); hole.par = 2; }
    else if (kind === 1) { hole.tee = { x: -w / 2 + 50, y: -h / 2 + 50 }; hole.cup = { x: w / 2 - 50, y: h / 2 - 50 }; wall(-w / 2 + 160, -20, w - 200, 24); hole.par = 3; }
    else if (kind === 2) { wall(-110, -h / 2, 24, h * 0.62); wall(110, h / 2 - h * 0.62, 24, h * 0.62); hole.par = 3; }
    else if (kind === 3) { hole.zones.push({ kind: VAR.hazard === 'none' ? 'sand' : VAR.hazard === 'water' ? 'water' : VAR.hazard, x: -60, y: -h / 2 + 20, w: 140, h: h * 0.55 }); hole.zones.push({ kind: VAR.hazard === 'syrup' ? 'syrup' : 'sand', x: 90, y: 20, w: 90, h: 100 }); hole.par = 3; }
    else if (kind === 4) { wall(-12, -h / 2, 24, h / 2 - 34); wall(-12, 34, 24, h / 2 - 34); hole.movers.push({ kind: VAR.extra === 'bridge' ? 'bridge' : VAR.extra === 'slider' ? 'slider' : 'windmill', x: 0, y: 0, t: 0 }); hole.par = 3; }
    else { for (let i = 0; i < 4; i++) hole.bumpers.push({ x: -140 + i * 95, y: (i % 2 ? 1 : -1) * (40 + r() * 50), r: 20 }); hole.zones.push({ kind: VAR.hazard === 'syrup' ? 'syrup' : 'sand', x: w / 2 - 170, y: -60, w: 70, h: 120 }); hole.par = 4; }
    if (VAR.extra === 'gumdrop' && kind !== 4) hole.bumpers.push({ x: (r() - 0.5) * 200, y: (r() - 0.5) * 140, r: 22, gum: true });
    if (VAR.extra === 'slider' && kind !== 4) hole.movers.push({ kind: 'slider', x: 60, y: 0, t: r() * 3 });
    if (VAR.extra === 'well') { hole.wells.push({ x: (r() - 0.5) * 220, y: (r() - 0.5) * 140, k: 1.1e6 }); hole.par += 1; }
    if (VAR.hazard === 'water' && kind === 0) hole.zones.push({ kind: 'water', x: -40, y: h / 2 - 70, w: 120, h: 70 });
    return hole;
  }

  BF.GameModules.register('golf', {
    three: true,
    maxBots: 3,
    feedTop: 0.24,
    orders: ['follow', 'come', 'stay'],
    actions: { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], putt: ['Space'], reset: ['KeyR'] },
    controls: { joystick: false, buttons: [{ act: 'left', label: 'Aim', icon: 'chevronLeft' }, { act: 'right', label: 'Aim', icon: 'chevronRight' }, { act: 'putt', label: 'Putt', icon: 'target' }, { act: 'reset', label: 'Reset', icon: 'refresh' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H, K = BF.arcade;
      const VAR = K.variant(ctx, VARIANTS);
      const V = ctx.g3;
      const seed = ctx.gameId;
      const holes = Array.from({ length: T.holes }, (_, i) => makeHole(i, VAR, seed));
      const rng = U.rng('golf:' + seed + ':' + Date.now());
      const players = K.crew(ctx, 3, () => ({ scores: [], total: 0 }));
      const me = { scores: [], total: 0, ball: { x: 0, y: 0, vx: 0, vy: 0 }, aim: 0, power: 0, pdir: 1, charging: false, strokes: 0, last: null, mulligan: false, aces: 0 };
      let hi = -1, hole = null, phase = 'aim', clock = 0, holeT = 0, sinkT = 0, ended = false, flash = null;
      const friction = VAR.friction || T.friction;

      function startHole() {
        hi++;
        if (hi >= holes.length) return finishRound();
        hole = holes[hi];
        me.ball = { x: hole.tee.x, y: hole.tee.y, vx: 0, vy: 0 };
        me.aim = Math.atan2(hole.cup.y - hole.tee.y, hole.cup.x - hole.tee.x);
        me.strokes = 0; me.last = { x: hole.tee.x, y: hole.tee.y }; me.mulligan = ctx.hasPass('mulligan');
        phase = 'aim'; holeT = 0;
        if (view) view.build();
        ctx.banner('Hole ' + (hi + 1) + ' · Par ' + hole.par, hi === 0 ? 'A / D aim · hold Space to charge, release to putt' : '', 1800);
      }
      function sunk() {
        me.scores.push(me.strokes); me.total += me.strokes;
        const d = me.strokes - hole.par;
        const word = me.strokes === 1 ? 'HOLE IN ONE!' : d <= -2 ? 'Eagle!' : d === -1 ? 'Birdie!' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : '+' + d;
        ctx.feed('Hole ' + (hi + 1) + ': ' + me.strokes + ' strokes (' + word + ')', 'star', d < 0 ? '#3fd08a' : '#ffd66b');
        if (me.strokes === 1) { me.aces++; ctx.badge(ctx.gameId + '_ace'); ctx.addStat('aces', 1); ctx.sfx('achievement'); ctx.banner('HOLE IN ONE!', '', 1500); } else ctx.sfx(d <= 0 ? 'win' : 'coin');
        // the others post their scores for this hole
        for (const p of players) {
          const noise = (rng() - 0.5) * 2.4 + (1 - p.skill) * 1.6 - 0.4;
          const s = U.clamp(Math.round(hole.par + noise), 1, T.maxStrokes);
          p.scores.push(s); p.total += s;
          if (s === 1) { ctx.feed(p.bot.displayName + ' got a hole in one!', 'star', '#ffd66b'); ctx.botText(p.bot, U.pick(['HOLE IN ONE LETS GO', 'did everyone see that', 'ace!!']), 600); }
          else if (s < hole.par && rng() < 0.4) ctx.botText(p.bot, 'birdie!', 900);
          else if (s > hole.par + 1 && rng() < 0.4) ctx.botText(p.bot, U.pick(['that windmill hates me', 'ugh', 'my ball has a mind of its own lol']), 900);
        }
        phase = 'sunk'; sinkT = 1.6;
      }
      function finishRound() {
        if (ended) return;
        ended = true; phase = 'over';
        const par = holes.reduce((a, h) => a + h.par, 0);
        const table = [{ me: true, v: me.total }].concat(players.map((p) => ({ v: p.total, p }))).sort((a, b) => a.v - b.v);
        const place = table.findIndex((r) => r.me) + 1;
        const win = place === 1 && (table.length < 2 || table[1].v > me.total || table.filter((r) => r.v === me.total).length === 1);
        ctx.best('bestRound', me.total, 'min');
        if (win) ctx.badge(ctx.gameId + '_win');
        if (me.total < par) ctx.badge(ctx.gameId + '_under');
        const rel = me.total - par;
        K.finish(ctx, { win, title: win ? 'Club champion!' : 'Round over', subtitle: me.total + ' strokes (' + (rel === 0 ? 'even par' : (rel > 0 ? '+' : '') + rel) + ')', place, of: table.length, stats: [['Strokes', me.total], ['Par', par], ['Holes in one', me.aces], ['Best rival', players.length ? Math.min(...players.map((p) => p.total)) : '-']], rewards: T.rewards });
      }
      function msg(t) { flash = { t, time: 1.6 }; }

      // ------------------------------------------------------------ physics
      function inRect(p, r, pad) { return p.x > r.x - pad && p.x < r.x + r.w + pad && p.y > r.y - pad && p.y < r.y + r.h + pad; }
      function moverRects() {
        const out = [];
        for (const m of hole.movers) {
          if (m.kind === 'windmill') { const a = m.t * 1.6; for (let k = 0; k < 4; k++) { const aa = a + k * Math.PI / 2; if (Math.abs(Math.cos(aa)) > 0.85) out.push({ x: m.x - 12, y: m.y - 34, w: 24, h: 68 }); } }
          if (m.kind === 'bridge') { if (Math.sin(m.t * 1.1) > 0) out.push({ x: m.x - 12, y: -34, w: 24, h: 68 }); }
          if (m.kind === 'slider') out.push({ x: m.x - 12, y: Math.sin(m.t * 1.8) * 90 - 30, w: 24, h: 60 });
        }
        return out;
      }
      function step(dt) {
        const b = me.ball;
        // zones: slow patches, water
        const zone = hole.zones.find((z) => inRect(b, z, 0));
        let k = friction;
        if (zone && zone.kind === 'sand') k = T.sand;
        if (zone && zone.kind === 'syrup') k = T.syrup;
        if (ctx.hasPass('sticky') && (zone || VAR.friction)) k *= 1.35;
        // gravity wells bend a moving ball (acceleration k / d^2); a slow ball settles instead of orbiting
        for (const wl of hole.wells) { const dx = wl.x - b.x, dy = wl.y - b.y, d2 = Math.max(900, dx * dx + dy * dy), d = Math.sqrt(d2); b.vx += (dx / d) * wl.k / d2 * dt; b.vy += (dy / d) * wl.k / d2 * dt; }
        if (Math.hypot(b.vx, b.vy) < 60) k *= 4;
        me.rollT = (me.rollT || 0) + dt;
        if (me.rollT > 12) k *= 10;
        const f = Math.exp(-k * dt);
        b.vx *= f; b.vy *= f;
        const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
        // course bounds
        const hw = hole.w / 2 - T.ballR, hh = hole.h / 2 - T.ballR;
        let x = nx, y = ny;
        if (x < -hw || x > hw) { b.vx *= -0.82; x = U.clamp(x, -hw, hw); ctx.sfx('click'); }
        if (y < -hh || y > hh) { b.vy *= -0.82; y = U.clamp(y, -hh, hh); ctx.sfx('click'); }
        for (const r of hole.walls.concat(moverRects())) {
          if (!inRect({ x, y }, r, T.ballR)) continue;
          const wasX = b.x > r.x - T.ballR && b.x < r.x + r.w + T.ballR;
          if (!wasX) { b.vx *= -0.82; x = b.x; } else { b.vy *= -0.82; y = b.y; }
          ctx.sfx('click');
        }
        for (const bp of hole.bumpers) {
          const dx = x - bp.x, dy = y - bp.y, d = Math.hypot(dx, dy);
          if (d < bp.r + T.ballR) { const nx2 = dx / (d || 1), ny2 = dy / (d || 1); const dot = b.vx * nx2 + b.vy * ny2; b.vx -= 2 * dot * nx2; b.vy -= 2 * dot * ny2; const boost = bp.gum ? 1.25 : 1; b.vx *= boost; b.vy *= boost; x = bp.x + nx2 * (bp.r + T.ballR + 1); y = bp.y + ny2 * (bp.r + T.ballR + 1); ctx.sfx('hit'); }
        }
        b.x = x; b.y = y;
        const water = hole.zones.find((z) => z.kind === 'water' && inRect(b, z, -T.ballR));
        if (water) { b.x = me.last.x; b.y = me.last.y; b.vx = b.vy = 0; me.strokes++; ctx.sfx('splash'); msg('In the water! +1 stroke'); return 'stop'; }
        const dc = Math.hypot(b.x - hole.cup.x, b.y - hole.cup.y), sp = Math.hypot(b.vx, b.vy);
        if (dc < T.cupR && sp < T.sinkSpeed) return 'sunk';
        if (dc < T.cupR + 3 && sp >= T.sinkSpeed) { b.vx *= 0.8; b.vy *= 0.8; }
        if (sp < T.stop) { b.vx = b.vy = 0; return 'stop'; }
        return 'roll';
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        V.preset(VAR.preset, { fogNear: 1500, fogFar: 3800 });
        if (VAR.preset === 'night' || VAR.preset === 'space') V.stars(300);
        V.shadowSize(500);
        V.gridFloor(-1500, -1500, 1500, 1500, VAR.rough, 'rgba(255,255,255,.04)', 80);
        let grp = null;
        const pool = V.pool();
        let ball = null, aim = null, blades = null, bridge = null, slider = [];
        function build() {
          if (grp) V.remove(grp);
          grp = V.group(); slider = []; blades = null; bridge = null;
          V.box(0, -6, 0, hole.w + 30, 6, hole.h + 30, U.shade(VAR.wall, -0.3), { parent: grp });
          V.box(0, -1, 0, hole.w, 2, hole.h, VAR.green, { parent: grp, glow: VAR.glow ? 0.15 : 0 });
          const edge = [{ x: 0, y: 0, z: -hole.h / 2 - 7, w: hole.w + 28, h: 18, d: 14 }, { x: 0, y: 0, z: hole.h / 2 + 7, w: hole.w + 28, h: 18, d: 14 }, { x: -hole.w / 2 - 7, y: 0, z: 0, w: 14, h: 18, d: hole.h }, { x: hole.w / 2 + 7, y: 0, z: 0, w: 14, h: 18, d: hole.h }].map((e) => Object.assign(e, { color: VAR.wall }));
          for (const wl of hole.walls) edge.push({ x: wl.x + wl.w / 2, y: 0, z: wl.y + wl.h / 2, w: wl.w, h: 18, d: wl.h, color: VAR.wall });
          V.boxes(edge, { parent: grp, glow: VAR.glow ? 1 : 0 });
          for (const z of hole.zones) V.box(z.x + z.w / 2, 0, z.y + z.h / 2, z.w, 1.5, z.h, z.kind === 'water' ? '#2a8fc8' : z.kind === 'syrup' ? '#c86a2a' : '#e8d8a0', { parent: grp, opacity: z.kind === 'water' ? 0.85 : 1, glow: z.kind === 'water' ? 0.3 : 0, shadow: false });
          for (const bp of hole.bumpers) V.shape(bp.gum ? 'sphere' : 'cyl', bp.x, bp.gum ? 10 : 12, bp.y, bp.r * 2, bp.gum ? 30 : 24, bp.r * 2, bp.gum ? U.pick(['#ff5aa8', '#7cf5ff', '#ffe066', '#b67cff'], U.rng(bp.x + ':' + bp.y)) : VAR.glow ? '#ff4fd8' : '#e03e3e', { parent: grp, glow: VAR.glow ? 0.8 : 0 });
          for (const wl of hole.wells) { V.shape('sphere', wl.x, 30, wl.y, 50, 50, 50, '#b67cff', { parent: grp, glow: 0.9 }); V.shape('torus', wl.x, 30, wl.y, 90, 90, 20, '#ffe066', { parent: grp, glow: 0.8 }).rotation.x = 1.2; }
          V.shape('cyl', hole.cup.x, 0.6, hole.cup.y, T.cupR * 2, 1.4, T.cupR * 2, '#0a0a0a', { parent: grp, shadow: false });
          V.box(hole.cup.x, 0, hole.cup.y, 2.5, 70, 2.5, '#e8ecf1', { parent: grp });
          V.box(hole.cup.x + 12, 52, hole.cup.y, 22, 14, 1.5, '#e03e3e', { parent: grp, glow: 0.3 });
          V.shape('cyl', hole.tee.x, 0.6, hole.tee.y, 34, 1.2, 34, '#ffffff', { parent: grp, opacity: 0.4, shadow: false });
          for (const m of hole.movers) {
            if (m.kind === 'windmill') { V.box(m.x, 0, m.y - 60, 80, 120, 40, '#e8d8c0', { parent: grp }); V.box(m.x, 120, m.y - 60, 90, 40, 50, '#b83a3a', { parent: grp, geo: 'cone4' }); blades = V.group(grp); blades.position.set(m.x, 70, m.y - 36); for (let k = 0; k < 4; k++) { const b = V.box(0, 0, 0, 10, 70, 3, '#ffffff', { parent: blades }); b.rotation.z = k * Math.PI / 2; b.position.set(Math.sin(k * Math.PI / 2) * 35, Math.cos(k * Math.PI / 2) * 35, 0); } }
            if (m.kind === 'bridge') { V.box(m.x - 40, 0, -hole.h / 2 - 20, 60, 140, 40, '#8a8f9e', { parent: grp }); V.box(m.x + 40, 0, -hole.h / 2 - 20, 60, 140, 40, '#8a8f9e', { parent: grp }); bridge = V.box(m.x, 0, 0, 24, 30, 68, '#8b5a2b', { parent: grp }); }
            if (m.kind === 'slider') slider.push({ m, mesh: V.box(m.x, 0, 0, 24, 22, 60, '#39f3ff', { parent: grp, glow: 1 }) });
          }
          ball = V.shape('sphere', 0, 0, 0, T.ballR * 2, T.ballR * 2, T.ballR * 2, '#ffffff', { parent: grp, glow: VAR.glow ? 0.7 : 0.05 });
          aim = V.group(grp);
          for (let i = 0; i < 12; i++) V.shape('sphere', 0, 0, 0, 5, 5, 5, '#ffe066', { parent: aim, glow: 1, shadow: false });
        }
        return {
          build,
          sync() {
            const b = me.ball, t = ctx.time;
            ball.position.set(b.x, T.ballR, b.y);
            if (phase === 'sunk') ball.position.y = T.ballR - (1.6 - sinkT) * 12;
            aim.visible = phase === 'aim';
            const len = (40 + me.power * 160) * (ctx.hasPass('aim_guide') ? 1.8 : 1);
            aim.children.forEach((c, i) => { const d = (i + 1) / aim.children.length * len; c.position.set(b.x + Math.cos(me.aim) * d, 4, b.y + Math.sin(me.aim) * d); c.visible = phase === 'aim'; });
            if (blades) blades.rotation.z = -holeT * 1.6;
            if (bridge) bridge.position.y = Math.sin(holeT * 1.1) > 0 ? 0 : -40;
            for (const s of slider) s.mesh.position.z = Math.sin(holeT * 1.8) * 90;
            const standX = b.x - Math.cos(me.aim) * 26, standY = b.y - Math.sin(me.aim) * 26;
            const rig = K.rig(V, ctx, 'me', standX, 0, standY, { a: me.aim, scale: 8 });
            if (!rig._club) { rig.hold('hammer', '#c8ccd4'); rig._club = true; }
            if (me.swingT > 0) rig.play('attack');
            players.forEach((p, i) => K.rig(V, ctx, p, -hole.w / 2 - 40 + i * 40, 0, hole.h / 2 + 60, { a: -Math.PI / 2, scale: 7 }));
            void t;
            pool.sweep();
            const cx = (b.x + hole.cup.x) / 2 * 0.5;
            V.look(cx, 0, 40, { dist: 560 + hi * 12, pitch: 1.0, fov: 45, lerp: 0.08 }, 1 / 60);
            V.sweep();
          },
        };
      })();

      function drawHud(g) {
        const par = hole ? hole.par : 0;
        K.panel(g, 'Hole ' + (hi + 1) + ' of ' + holes.length + ' · Par ' + par, 'Stroke ' + (me.strokes + (phase === 'aim' ? 1 : 0)), 'Total ' + me.total + (me.mulligan ? ' · mulligan ready' : ''), 250);
        const rows = [{ n: ctx.player.name, v: me.total, me: true }].concat(players.map((p) => ({ n: p.bot.displayName, v: p.total })));
        K.board(g, W, rows, { title: 'Strokes (lowest wins)', asc: true });
        if (phase === 'aim' && me.charging) K.meter(g, W / 2 - 120, H - 90, 240, me.power, me.power > 0.85 ? '#ff5a6a' : '#ffd66b', 'Power');
        let tip = phase === 'aim' ? (me.charging ? 'Release Space to putt' : 'A / D aim · hold Space to charge') : phase === 'roll' ? '' : phase === 'sunk' ? 'In the cup!' : '';
        if (flash) tip = flash.t;
        K.hint(g, W, H, tip, flash ? '#ff8b98' : null);
      }
      function draw2d(g) {
        g.fillStyle = VAR.rough; g.fillRect(0, 0, W, H);
        g.save(); g.translate(W / 2, H / 2 + 20);
        g.fillStyle = VAR.green; g.fillRect(-hole.w / 2, -hole.h / 2, hole.w, hole.h);
        g.fillStyle = VAR.wall; for (const wl of hole.walls.concat(moverRects())) g.fillRect(wl.x, wl.y, wl.w, wl.h);
        for (const z of hole.zones) { g.fillStyle = z.kind === 'water' ? '#2a8fc8' : z.kind === 'syrup' ? '#c86a2a' : '#e8d8a0'; g.fillRect(z.x, z.y, z.w, z.h); }
        for (const bp of hole.bumpers) G.circle(g, bp.x, bp.y, bp.r, '#e03e3e');
        G.circle(g, hole.cup.x, hole.cup.y, T.cupR, '#000');
        G.circle(g, me.ball.x, me.ball.y, T.ballR, '#fff');
        if (phase === 'aim') G.line(g, me.ball.x, me.ball.y, me.ball.x + Math.cos(me.aim) * (40 + me.power * 160), me.ball.y + Math.sin(me.aim) * (40 + me.power * 160), '#ffe066', 3);
        g.restore();
        drawHud(g);
      }

      startHole();
      return {
        update(dt) {
          if (phase === 'over') return;
          clock += dt; holeT += dt;
          if (hole) for (const m of hole.movers) m.t = holeT;
          if (flash) { flash.time -= dt; if (flash.time <= 0) flash = null; }
          if (me.swingT > 0) me.swingT -= dt;
          const inp = ctx.input;
          if (phase === 'aim') {
            if (inp.act('left')) me.aim -= dt * 1.8;
            if (inp.act('right')) me.aim += dt * 1.8;
            if (inp.pointer && inp.pointer.moved && V) { const p = ctx.pointerWorld(0); const a = Math.atan2(p.y - me.ball.y, p.x - me.ball.x); if (Number.isFinite(a)) me.aim = a; }
            if (inp.act('putt')) { if (!me.charging) { me.charging = true; me.power = 0; me.pdir = 1; } me.power += me.pdir * dt / T.charge; if (me.power >= 1) { me.power = 1; me.pdir = -1; } if (me.power <= 0) { me.power = 0; me.pdir = 1; } }
            else if (me.charging) {
              me.charging = false;
              const v = T.minPower + me.power * T.power;
              me.last = { x: me.ball.x, y: me.ball.y };
              me.ball.vx = Math.cos(me.aim) * v; me.ball.vy = Math.sin(me.aim) * v;
              me.strokes++; me.swingT = 0.3; me.rollT = 0; phase = 'roll'; ctx.sfx('swing');
            }
            if (inp.actPressed('reset') && me.strokes > 0) { if (me.mulligan) { me.mulligan = false; msg('Mulligan used: no penalty'); } else { me.strokes++; msg('Reset: +1 stroke'); } me.ball.x = me.last.x; me.ball.y = me.last.y; }
          } else if (phase === 'roll') {
            let res = 'roll';
            for (let i = 0; i < 3 && res === 'roll'; i++) res = step(dt / 3);
            if (res === 'sunk') sunk();
            else if (res === 'stop') {
              phase = 'aim';
              me.aim = Math.atan2(hole.cup.y - me.ball.y, hole.cup.x - me.ball.x);
              if (me.strokes >= T.maxStrokes) { msg('Max strokes: picked up'); me.strokes = T.maxStrokes; sunk(); }
            }
          } else if (phase === 'sunk') {
            sinkT -= dt;
            if (sinkT <= 0) startHole();
          }
        },
        draw: draw2d,
        render3d() { if (view) view.sync(); },
        hud: drawHud,
        onBotJoin(b) { const e = K.join(players, b, 3, () => ({ scores: [], total: 0 }), ctx); if (e) { for (let i = 0; i < Math.max(0, hi); i++) { const s = holes[i].par + 1; e.scores.push(s); e.total += s; } } },
        onBotLeave(b) { K.leave(players, b); },
        _test: { me, holes, players, get hole() { return hole; }, get phase() { return phase; }, sunk, startHole, finishRound, step },
      };
    },
  });
})((window.BF = window.BF || {}));
