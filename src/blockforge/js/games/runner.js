/**
 * Runner (gameType "runner") — an endless three-lane dash. Switch lanes, jump
 * low barriers, slide under high ones, grab coins and power-ups; the track
 * speeds up the longer you last. The other players run their own tracks
 * beside yours and wipe out one by one: outlast everyone to win.
 *
 * Variants (config.variant):
 *   metro   Metro Dash     subway yards: trains come at you down the lanes
 *   lava    Lava Escape    a lava wall chases you; tripping lets it catch up
 *   jungle  Jungle Sprint  temple ruins with gaps to leap and vines to duck
 *   candy   Candy Rush     gumdrop pads launch you up to sky coins
 *   hyper   Hyperlane      neon space track with blinking lasers and boost pads
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  /** Tuning (data). Speeds in world units per second, distances in world units (10 = 1 m). */
  const T = {
    lane: 70, speed0: 330, accel: 7, maxSpeed: 820, jumpV: 520, gravity: 1500, slideTime: 0.65,
    chunk: 480, spawnGap: [210, 330], coinChance: 0.55, powerChance: 0.08, magnetTime: 8, x2Time: 10, boostTime: 3, shieldTime: 0,
    rewards: { play: 12, win: 45, per: 0.008, xpPlay: 25, xpWin: 90 },
  };

  const VARIANTS = {
    metro: { preset: 'day', ground: '#6b7080', lane: '#454a57', rail: '#c9ced8', accent: '#ffc940', kinds: ['low', 'high', 'block', 'train'], decor: 'city', title: 'Run the yards' },
    lava: { preset: 'dusk', ground: '#3b2c2a', lane: '#2a1f1e', rail: '#ff5a2e', accent: '#ff7a2e', kinds: ['low', 'high', 'block', 'gap'], decor: 'volcano', chase: true, title: 'Outrun the lava' },
    jungle: { preset: 'day', ground: '#8f7f5c', lane: '#6f6246', rail: '#4a8f3a', accent: '#6fd66b', kinds: ['low', 'high', 'block', 'gap', 'gap'], decor: 'jungle', title: 'Escape the temple' },
    candy: { preset: 'sunset', ground: '#ffb3d9', lane: '#ff8fc7', rail: '#ffffff', accent: '#ff5aa8', kinds: ['low', 'high', 'block', 'pad'], decor: 'candy', title: 'Sugar rush!' },
    hyper: { preset: 'space', ground: '#10142a', lane: '#161c3a', rail: '#39f3ff', accent: '#39f3ff', kinds: ['low', 'high', 'laser', 'block', 'boost'], decor: 'neon', title: 'Hit the hyperlane' },
  };
  const COLORS = { low: '#e03e3e', high: '#ffc940', block: '#5a6478', train: '#3a7bd5', laser: '#ff3df0', pad: '#7cf5ff', boost: '#39f3ff' };

  BF.GameModules.register('runner', {
    three: true,
    maxBots: 6,
    feedTop: 0.18,
    orders: ['race'],
    actions: { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], jump: ['Space', 'KeyW', 'ArrowUp'], slide: ['KeyS', 'ArrowDown', 'ShiftLeft'] },
    controls: { joystick: false, buttons: [{ act: 'left', label: 'Left', icon: 'chevronLeft' }, { act: 'right', label: 'Right', icon: 'chevronRight' }, { act: 'jump', label: 'Jump', icon: 'chevronUp' }, { act: 'slide', label: 'Slide', icon: 'chevronDown' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H, K = BF.arcade;
      const VAR = K.variant(ctx, VARIANTS);
      const V = ctx.g3;
      const rng = U.rng('runner:' + ctx.gameId + ':' + Date.now());
      const me = { lane: 0, x: 0, y: 0, vy: 0, d: 0, slide: 0, coins: 0, alive: true, shield: 0, magnet: 0, x2: 0, boost: ctx.hasPass('head_start') ? 3 : 0, inv: 0, stumbles: 0, stumbleT: 0, revive: ctx.hasPass('second_wind') };
      let speed = T.speed0, t = 0, phase = 'count', countT = 2.4, lavaGap = 420;
      const obs = [], coins = [], powers = [];
      let nextD = 700, uid = 0;
      // the other runners: own tracks beside yours, each wipes out at a distance set by skill
      const rivals = K.crew(ctx, 6, (i) => ({ side: i % 2 ? 1 : -1, row: Math.floor(i / 2), d: 0, lane: (i % 3) - 1, y: 0, crashAt: 0 }));
      const crashDist = (e) => Math.round(1500 + Math.pow(e.skill, 1.6) * 9000 * (0.55 + rng() * 0.9));
      rivals.forEach((e) => { e.crashAt = crashDist(e); });
      ctx.banner(ctx.game.name, VAR.title, 2000);

      function spawn(at) {
        const kind = U.pick(VAR.kinds, rng);
        const lane = Math.floor(rng() * 3) - 1;
        const o = { id: uid++, kind, lane, d: at, len: kind === 'train' ? 160 : kind === 'gap' ? 90 : kind === 'block' ? 50 : 24, on: true, phase: rng() * 2 };
        if (kind === 'gap') o.lane = 9; // gaps cross every lane
        if (kind === 'pad' || kind === 'boost') o.len = 30;
        obs.push(o);
        // a second blocker so there is always exactly one clear lane
        if ((kind === 'block' || kind === 'train') && rng() < 0.45) {
          const other = [-1, 0, 1].filter((l) => l !== lane)[Math.floor(rng() * 2)];
          obs.push({ id: uid++, kind: 'block', lane: other, d: at + 10, len: 50, on: true });
        }
        if (rng() < T.coinChance) {
          const cl = kind === 'gap' ? Math.floor(rng() * 3) - 1 : [-1, 0, 1].filter((l) => l !== lane)[Math.floor(rng() * 2)];
          const air = kind === 'low' || kind === 'gap';
          for (let i = 0; i < 6; i++) coins.push({ id: uid++, lane: kind === 'low' && i > 1 && i < 4 ? lane : cl, d: at - 60 + i * 32, y: air && i > 1 && i < 4 ? 55 : 14, taken: false });
        }
        if (kind === 'pad') for (let i = 0; i < 8; i++) coins.push({ id: uid++, lane, d: at + 80 + i * 36, y: 150 + Math.sin(i / 7 * Math.PI) * 60, taken: false });
        if (rng() < T.powerChance) powers.push({ id: uid++, kind: U.pick(['magnet', 'x2', 'shield'], rng), lane: Math.floor(rng() * 3) - 1, d: at + 120, taken: false });
      }

      function hit(o) {
        if (me.inv > 0) return;
        const soft = VAR.chase && (o.kind === 'low' || o.kind === 'high');
        if (soft) {
          me.stumbles = me.stumbleT > 0 ? me.stumbles + 1 : 1;
          me.stumbleT = 8; me.inv = 1; speed *= 0.8; lavaGap -= 170;
          ctx.sfx('hurt'); ctx.feed(me.stumbles > 1 ? 'The lava is right behind you!' : 'You tripped! The lava is gaining.', 'warn', '#ff8b3d');
          if (V) V.shake(6, 0.3);
          if (lavaGap <= 0) crash('The lava caught you');
          return;
        }
        if (me.shield > 0) { me.shield = 0; me.inv = 1.2; ctx.sfx('hit'); ctx.feed('Shield broke!', 'star', '#7fe7ff'); return; }
        crash(o.kind === 'gap' ? 'You fell' : o.kind === 'train' ? 'Hit by a train' : 'Wiped out');
      }
      function crash(why) {
        if (!me.alive) return;
        if (me.revive) { me.revive = false; me.inv = 2; ctx.feed('Second Wind! Back on your feet.', 'star', '#3fd08a'); ctx.sfx('powerup'); lavaGap = Math.max(lavaGap, 300); return; }
        me.alive = false; phase = 'over';
        ctx.sfx('lose'); if (V) V.shake(10, 0.4);
        const dist = Math.round(me.d / 10);
        const beaten = rivals.filter((e) => e.crashAt / 10 < dist).length;
        const place = rivals.length - beaten + 1;
        const score = dist + me.coins * 10;
        ctx.best('bestDistance', dist);
        ctx.best('bestScore', score);
        if (place === 1) ctx.badge(ctx.gameId + '_win');
        if (dist >= 1000) ctx.badge(ctx.gameId + '_1k');
        if (me.coins >= 150) ctx.badge(ctx.gameId + '_coins');
        K.finish(ctx, { win: place === 1, title: place === 1 ? 'Last one running!' : why, subtitle: U.fmt(dist) + ' m · ' + me.coins + ' coins', score, place, of: rivals.length + 1, stats: [['Distance', U.fmt(dist) + ' m'], ['Coins', me.coins], ['Score', U.fmt(score)], ['Top speed', Math.round(speed / 10) + ' m/s']], rewards: T.rewards });
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        V.preset(VAR.preset, { fogNear: 900, fogFar: 2600 });
        if (VAR.preset === 'space' || VAR.preset === 'dusk') V.stars(260);
        V.shadowSize(500);
        const chunks = V.pool(), things = V.pool();
        const lavaWall = VAR.chase ? V.box(0, -20, 0, 2400, 160, 30, '#ff4a1f', { glow: 1.2, shadow: false }) : null;
        function buildChunk(i) {
          const g = V.group();
          const z0 = -i * T.chunk;
          const r = U.rng('chunk:' + ctx.gameId + ':' + i);
          const floor = [];
          for (let s = 0; s < 3; s++) floor.push({ x: (s - 1) * T.lane, y: -6, z: z0 - T.chunk / 2, w: T.lane - 6, h: 6, d: T.chunk, color: s === 1 ? VAR.lane : U.shade(VAR.lane, 0.05) });
          floor.push({ x: -T.lane * 1.5 - 12, y: -6, z: z0 - T.chunk / 2, w: 24, h: 8, d: T.chunk, color: VAR.ground });
          floor.push({ x: T.lane * 1.5 + 12, y: -6, z: z0 - T.chunk / 2, w: 24, h: 8, d: T.chunk, color: VAR.ground });
          // side tracks where the other runners go
          floor.push({ x: -300, y: -8, z: z0 - T.chunk / 2, w: 200, h: 6, d: T.chunk, color: U.shade(VAR.lane, -0.08) });
          floor.push({ x: 300, y: -8, z: z0 - T.chunk / 2, w: 200, h: 6, d: T.chunk, color: U.shade(VAR.lane, -0.08) });
          floor.push({ x: 0, y: -40, z: z0 - T.chunk / 2, w: 1400, h: 30, d: T.chunk, color: U.shade(VAR.ground, -0.2) });
          V.boxes(floor, { parent: g });
          const rails = [];
          for (let s = -1; s <= 1; s++) for (const off of [-T.lane / 2 + 6, T.lane / 2 - 6]) rails.push({ x: s * T.lane + off, y: 0, z: z0 - T.chunk / 2, w: 3, h: 2, d: T.chunk, color: VAR.rail });
          V.boxes(rails, { parent: g, glow: VAR.decor === 'neon' || VAR.decor === 'volcano' ? 1 : 0, shadow: false });
          const deco = [];
          for (let k = 0; k < 8; k++) {
            const side = k % 2 ? 1 : -1, x = side * (470 + r() * 260), z = z0 - r() * T.chunk;
            if (VAR.decor === 'city') { const h = 120 + r() * 300; deco.push({ x, y: -10, z, w: 90 + r() * 60, h, d: 90 + r() * 60, color: U.shade('#5a6e8a', r() * 0.25 - 0.1) }); }
            else if (VAR.decor === 'volcano') deco.push({ x, y: -10, z, w: 80 + r() * 120, h: 60 + r() * 200, d: 80 + r() * 120, color: U.shade('#2a1c1a', r() * 0.1), rot: r() });
            else if (VAR.decor === 'jungle') { deco.push({ x, y: -10, z, w: 16, h: 90, d: 16, color: '#6b4226' }); deco.push({ x, y: 70, z, w: 90, h: 80, d: 90, color: U.shade('#2f8f47', r() * 0.15) }); }
            else if (VAR.decor === 'candy') { deco.push({ x, y: -10, z, w: 8, h: 110, d: 8, color: '#ffffff' }); deco.push({ x, y: 100, z, w: 60, h: 60, d: 12, color: ['#ff5aa8', '#7cf5ff', '#ffe066', '#b67cff'][k % 4] }); }
            else { const h = 100 + r() * 400; deco.push({ x, y: -10, z, w: 40, h, d: 40, color: '#161c3a' }); deco.push({ x, y: h - 12, z, w: 42, h: 4, d: 42, color: '#39f3ff' }); }
          }
          V.boxes(deco, { parent: g });
          if (VAR.decor === 'neon' || VAR.decor === 'volcano') V.boxes([{ x: 0, y: -2, z: z0 - T.chunk / 2, w: 4, h: 1, d: T.chunk, color: VAR.accent }], { parent: g, glow: 1, shadow: false });
          return g;
        }
        function buildObstacle(o) {
          const g = V.group();
          const c = COLORS[o.kind];
          if (o.kind === 'low') { V.box(0, 0, 0, T.lane - 10, 22, 12, c, { parent: g }); V.box(0, 22, 0, T.lane - 10, 4, 14, '#ffffff', { parent: g }); }
          else if (o.kind === 'high') { V.box(-T.lane / 2 + 8, 0, 0, 6, 64, 6, '#39414f', { parent: g }); V.box(T.lane / 2 - 8, 0, 0, 6, 64, 6, '#39414f', { parent: g }); V.box(0, 38, 0, T.lane - 8, 22, 8, c, { parent: g }); if (VAR.decor === 'jungle') V.box(0, 38, 0, T.lane - 6, 26, 10, '#3f9a3a', { parent: g }); }
          else if (o.kind === 'block') { V.box(0, 0, -o.len / 2, T.lane - 10, 60, o.len, VAR.decor === 'candy' ? '#b67cff' : VAR.decor === 'jungle' ? '#8a7f6a' : c, { parent: g }); }
          else if (o.kind === 'train') { V.box(0, 0, -o.len / 2, T.lane - 8, 74, o.len, c, { parent: g }); V.box(0, 42, 1, T.lane - 20, 18, 2, '#bfe6ff', { parent: g, glow: 0.4 }); V.box(0, 74, -o.len / 2, T.lane - 14, 6, o.len - 10, '#2a4f8a', { parent: g }); }
          else if (o.kind === 'gap') { V.box(0, -5, -o.len / 2, T.lane * 3 + 2, 7, o.len, VAR.chase ? '#ff4a1f' : '#0b0c10', { parent: g, glow: VAR.chase ? 1 : 0, shadow: false }); }
          else if (o.kind === 'laser') { const beam = V.box(0, 14, 0, T.lane - 6, 5, 5, c, { parent: g, glow: 1.4, shadow: false }); V.box(-T.lane / 2 + 3, 0, 0, 5, 30, 5, '#39414f', { parent: g }); V.box(T.lane / 2 - 3, 0, 0, 5, 30, 5, '#39414f', { parent: g }); g.userData.beam = beam; }
          else if (o.kind === 'pad' || o.kind === 'boost') { V.box(0, 0.5, -o.len / 2, T.lane - 16, 3, o.len, c, { parent: g, glow: 1, shadow: false }); }
          return g;
        }
        return function sync() {
          const base = Math.floor(me.d / T.chunk);
          for (let i = base - 1; i <= base + 5; i++) { const g = chunks.use('c' + i, () => buildChunk(i)); g.visible = true; }
          chunks.sweep();
          for (const o of obs) {
            if (o.d < me.d - 200 || o.d > me.d + 2600) continue;
            const g = things.use('o' + o.id, () => buildObstacle(o));
            g.position.set(o.lane === 9 ? 0 : o.lane * T.lane, 0, -o.d);
            if (g.userData.beam) g.userData.beam.visible = o.on;
          }
          for (const c of coins) {
            if (c.taken || c.d < me.d - 100 || c.d > me.d + 2400) continue;
            const m = things.use('k' + c.id, () => { const x = V.shape('cyl', 0, 0, 0, 18, 4, 18, '#ffd23f', { metal: 0.6, glow: 0.3 }); x.rotation.x = Math.PI / 2; return x; });
            m.position.set(c.lane * T.lane, c.y + 6, -c.d); m.rotation.y = t * 4 + c.id;
          }
          for (const p of powers) {
            if (p.taken || p.d < me.d - 100 || p.d > me.d + 2400) continue;
            const m = things.use('p' + p.id, () => V.shape(p.kind === 'shield' ? 'ico' : p.kind === 'magnet' ? 'torus' : 'octa', 0, 0, 0, 26, 26, 26, p.kind === 'shield' ? '#7fe7ff' : p.kind === 'magnet' ? '#ff5a6a' : '#ffd66b', { glow: 1, flat: true }));
            m.position.set(p.lane * T.lane, 22 + Math.sin(t * 3) * 4, -p.d); m.rotation.y = t * 2;
          }
          things.sweep();
          if (lavaWall) lavaWall.position.set(0, 40, -(me.d - lavaGap));
          // you
          const rig = K.rig(V, ctx, 'me', me.x, me.y, -me.d, { a: -Math.PI / 2, move: me.alive ? 1.25 : 0, air: me.y > 2, mode: me.alive ? (me.slide > 0 ? 'sit' : 'idle') : 'ko', scale: 8 });
          rig.group.visible = !(me.inv > 0 && Math.sin(t * 30) > 0.4);
          if (me.shield > 0) things.use('shield', () => V.shape('sphere', 0, 0, 0, 70, 70, 70, '#7fe7ff', { opacity: 0.25, glow: 0.6, shadow: false })).position.set(me.x, 30, -me.d);
          // rivals on the side tracks
          rivals.forEach((e) => {
            const x = e.side * (250 + e.row * 50) + e.lane * 18;
            K.rig(V, ctx, e, x, e.y, -e.d, { a: -Math.PI / 2, move: e.alive ? 1.2 : 0, air: e.y > 2, mode: e.alive ? 'idle' : 'ko', scale: 7.5 });
          });
          V.look(me.x * 0.6, 34, -me.d - 40, { dist: 240, pitch: 0.34, yaw: 0, fov: 62, lerp: 0.2 }, 1 / 60);
          V.sweep();
        };
      })();

      function draw2d(g) {
        g.fillStyle = VAR.ground; g.fillRect(0, 0, W, H);
        const cx = W / 2, sc = 1.3;
        for (let s = -1; s <= 1; s++) { g.fillStyle = VAR.lane; g.fillRect(cx + s * T.lane * sc - T.lane * sc / 2 + 3, 0, T.lane * sc - 6, H); }
        const Y = (d) => H - 90 - (d - me.d) * 0.35;
        for (const o of obs) { if (o.d < me.d - 100 || o.d > me.d + 1400) continue; g.fillStyle = COLORS[o.kind]; const y = Y(o.d); if (o.lane === 9) g.fillRect(cx - T.lane * 1.5 * sc, y - o.len * 0.35, T.lane * 3 * sc, o.len * 0.35); else g.fillRect(cx + o.lane * T.lane * sc - 30, y - o.len * 0.35, 60, Math.max(8, o.len * 0.35)); }
        for (const c of coins) if (!c.taken && c.d > me.d - 50 && c.d < me.d + 1400) G.circle(g, cx + c.lane * T.lane * sc, Y(c.d) - c.y * 0.2, 6, '#ffd23f');
        G.avatarTop(g, cx + me.x * sc, H - 90 - me.y * 0.3, 12, ctx.player.look, -Math.PI / 2, { walk: t * 12 });
        drawHud(g);
      }
      function drawHud(g) {
        const dist = Math.round(me.d / 10);
        K.panel(g, 'Distance', U.fmt(dist) + ' m', me.coins + ' coins' + (me.x2 > 0 ? '  ×2' : '') + (me.magnet > 0 ? '  magnet' : '') + (me.shield > 0 ? '  shield' : ''));
        const rows = [{ n: ctx.player.name, v: dist, me: true, out: !me.alive }].concat(rivals.map((e) => ({ n: e.bot.displayName, v: Math.round(e.d / 10), out: !e.alive })));
        K.board(g, W, rows, { title: 'Still running', fmt: (v) => U.fmt(v) + ' m' });
        if (VAR.chase) K.meter(g, 22, 104, 200, lavaGap / 420, lavaGap < 200 ? '#ff5a2e' : '#ffb454', 'Lava distance');
        if (phase === 'count') G.display(g, countT > 0.4 ? String(Math.ceil(countT - 0.4)) : 'GO!', W / 2, H / 2, 90, '#ffffff', 'center');
        else if (t < 7) K.hint(g, W, H, 'A / D switch lanes · Space jump · S slide');
      }

      function laneOf(x) { return Math.round(x / T.lane); }

      return {
        update(dt) {
          if (phase === 'count') { countT -= dt; if (countT <= 0) { phase = 'run'; ctx.sfx('go'); } return; }
          if (phase !== 'run') return;
          t += dt;
          const inp = ctx.input;
          if (inp.actPressed('left') && me.lane > -1) { me.lane--; ctx.sfx('click'); }
          if (inp.actPressed('right') && me.lane < 1) { me.lane++; ctx.sfx('click'); }
          if (inp.actPressed('jump') && me.y <= 0.5) { me.vy = T.jumpV; me.slide = 0; ctx.sfx('jump'); }
          if (inp.actPressed('slide')) { if (me.y > 0.5) me.vy = -T.jumpV * 1.2; me.slide = T.slideTime; ctx.sfx('swing'); }
          me.x += (me.lane * T.lane - me.x) * Math.min(1, dt * 14);
          me.vy -= T.gravity * dt; me.y += me.vy * dt;
          const overGap = obs.some((o) => o.kind === 'gap' && me.d > o.d && me.d < o.d + o.len);
          if (me.y <= 0 && !overGap) { me.y = 0; me.vy = 0; }
          if (me.y < -40) return crash('You fell');
          if (me.slide > 0) me.slide -= dt;
          if (me.inv > 0) me.inv -= dt;
          if (me.stumbleT > 0) me.stumbleT -= dt;
          ['magnet', 'x2', 'shield'].forEach((k) => { if (me[k] > 0 && k !== 'shield') me[k] -= dt; });
          if (me.boost > 0) me.boost -= dt;
          speed = Math.min(T.maxSpeed, speed + T.accel * dt);
          const v = speed * (me.boost > 0 ? 1.6 : 1);
          me.d += v * dt;
          if (VAR.chase) lavaGap = Math.min(520, lavaGap + dt * 10);
          while (nextD < me.d + 2600) { spawn(nextD); nextD += U.rand(T.spawnGap[0], T.spawnGap[1], rng) * (1 + speed / 1400); }
          // collisions
          const lane = laneOf(me.x);
          for (const o of obs) {
            if (o.kind === 'train') o.d -= 180 * dt * (me.d < o.d + 900 ? 1 : 0);
            if (o.kind === 'laser') o.on = Math.sin(t * 3 + o.phase * 3) > -0.2;
            if (o.done || me.d + 10 < o.d || me.d > o.d + o.len) continue;
            if (o.lane !== 9 && o.lane !== lane) continue;
            if (o.kind === 'pad') { o.done = true; me.vy = T.jumpV * 1.9; ctx.sfx('boost'); continue; }
            if (o.kind === 'boost') { o.done = true; me.boost = T.boostTime; ctx.sfx('boost'); ctx.feed('Boost!', 'star', '#39f3ff'); continue; }
            if (o.kind === 'gap') continue; // handled by falling
            if (o.kind === 'low' && me.y > 20) continue;
            if (o.kind === 'high' && me.slide > 0) continue;
            if (o.kind === 'laser' && (!o.on || me.y > 22)) continue;
            o.done = true;
            hit(o);
            if (!me.alive) return;
          }
          for (const c of coins) {
            if (c.taken) continue;
            const near = me.magnet > 0 ? Math.abs(c.d - me.d) < 120 : Math.abs(c.d - me.d) < 22 && laneOf(me.x) === c.lane && Math.abs(c.y - (me.y + 14)) < 40;
            if (near) { c.taken = true; me.coins += me.x2 > 0 ? 2 : 1; if (me.coins % 10 === 0) ctx.sfx('coin'); }
          }
          for (const p of powers) {
            if (p.taken || Math.abs(p.d - me.d) > 24 || laneOf(me.x) !== p.lane) continue;
            p.taken = true;
            if (p.kind === 'magnet') me.magnet = T.magnetTime * (ctx.hasPass('magnet') ? 2 : 1);
            if (p.kind === 'x2') me.x2 = T.x2Time;
            if (p.kind === 'shield') me.shield = 1;
            ctx.sfx('powerup'); ctx.feed({ magnet: 'Coin magnet!', x2: 'Double coins!', shield: 'Shield up!' }[p.kind], 'star', '#ffd66b');
          }
          // rivals
          for (const e of rivals) {
            if (!e.alive) { e.d += Math.max(0, (speed * 0.2) * dt); continue; }
            e.d += v * dt * (0.98 + Math.sin(t + e.skill * 9) * 0.02);
            e.y = Math.max(0, Math.sin((e.d + e.skill * 300) / 180) * 30 - 10);
            if (e.d >= e.crashAt) { e.alive = false; ctx.feed(e.bot.displayName + ' wiped out at ' + U.fmt(Math.round(e.d / 10)) + ' m', 'leave', '#ff9d9d'); if (Math.random() < 0.5) ctx.botSay(e.bot, 'lose'); }
          }
          // clean up behind
          for (let i = obs.length - 1; i >= 0; i--) if (obs[i].d + obs[i].len < me.d - 400) obs.splice(i, 1);
          for (let i = coins.length - 1; i >= 0; i--) if (coins[i].d < me.d - 300) coins.splice(i, 1);
          for (let i = powers.length - 1; i >= 0; i--) if (powers[i].d < me.d - 300) powers.splice(i, 1);
        },
        draw(g) { draw2d(g); },
        render3d() { view(); },
        hud(g) { drawHud(g); },
        onBotJoin(b) { const e = K.join(rivals, b, 6, (i) => ({ side: i % 2 ? 1 : -1, row: Math.floor(i / 2), d: me.d * 0.8, lane: 0, y: 0 }), ctx); if (e) e.crashAt = me.d + crashDist(e); },
        onBotLeave(b) { K.leave(rivals, b); },
        _test: { me, obs, coins, rivals, crash, get phase() { return phase; }, set phase(v) { phase = v; }, spawn, VAR },
      };
    },
  });
  BF.runnerVariants = VARIANTS;
})((window.BF = window.BF || {}));
