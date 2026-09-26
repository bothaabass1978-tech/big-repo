/**
 * Custom game (gameType "custom") — a top-down world built tile by tile in the
 * Studio, with rules picked by its creator (ctx.config.layout.rules):
 *   goal   collect (every coin) · reach (the goal flag) · survive (until time
 *          runs out) · score (most coins when time runs out, against the bots)
 *   time, lives, player speed, enemy speed, theme, bots on/off
 * Tiles: spawn, wall, coin, gem, goal flag, lava, spike trap, patrolling enemy,
 * key + locked door, speed pad, jump pad, extra life, checkpoint.
 * Bots play too (they collect coins) and take chat orders like everywhere else.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;
  /** Tuning: speeds by setting, pad strengths, rewards. */
  const T = {
    speeds: { slow: 150, normal: 195, fast: 245 },
    enemySpeeds: { slow: 55, normal: 85, fast: 125 },
    r: 12, invuln: 1.4, speedPad: 1.7, speedTime: 2.2, jump: 2.2, spikeCycle: 2.2, spikeUp: 0.9,
    rewards: { play: 10, win: 40, perCoin: 0.2, xpPlay: 25, xpWin: 90 },
  };
  const SOLID = new Set(['wall']);

  BF.GameModules.register('custom', {
    three: true,
    maxBots: 4,
    feedTop: 0.17,
    orders: ['follow', 'come', 'stay', 'leave', 'help', 'gather'],
    actions: {},
    controls: { joystick: true, buttons: [] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const V = ctx.g3;
      const SP = BF.studio.CUSTOM, C = SP.cell;
      const layout = ctx.config.layout && ctx.config.layout.kind === 'custom' && BF.studio.validate('custom', ctx.config.layout).ok ? ctx.config.layout : BF.studio.fromGenerated('custom', ctx.config.seed || 7);
      const rules = BF.studio.rules(layout);
      const theme = SP.themes[rules.theme];
      const WW = SP.cols * C, WH = SP.rows * C;
      const parts = V ? V.particles2d(10) : new BF.Particles(300);
      const floats = V ? V.floaters2d(50) : new BF.Floaters();
      const cam = new BF.Camera(W, H);
      cam.bounds = { x: 0, y: 0, w: WW, h: WH };

      // ------------------------------------------------------------ world
      const grid = new Map();
      const items = [], enemies = [], spikes = [];
      let spawn = { x: C * 2, y: C * 2 }, goal = null;
      for (const [k, t] of BF.studio.cellMap(layout)) {
        const [c, r] = k.split(',').map(Number);
        const x = c * C + C / 2, y = r * C + C / 2;
        if (t === 'start') spawn = { x, y };
        else if (t === 'goal') goal = { x, y };
        else if (t === 'enemy') enemies.push({ x, y, x0: x, dir: (c + r) % 2 ? 1 : -1, a: 0, walk: 0 });
        else if (t === 'spikes') spikes.push({ c, r, x, y });
        else if (['coin', 'gem', 'key', 'heal', 'check'].includes(t)) items.push({ t, c, r, x, y, taken: false, spin: (c * 7 + r) % 6 });
        if (t !== 'enemy' && t !== 'coin' && t !== 'gem' && t !== 'key' && t !== 'heal') grid.set(k, t);
      }
      const coinsTotal = items.filter((i) => i.t === 'coin').length;
      const tileAt = (x, y) => { const c = Math.floor(x / C), r = Math.floor(y / C); if (c < 0 || r < 0 || c >= SP.cols || r >= SP.rows) return 'wall'; return grid.get(c + ',' + r) || null; };
      let doorsOpen = false;
      const solidAt = (x, y) => { const t = tileAt(x, y); return SOLID.has(t) || (t === 'door' && !doorsOpen); };
      function move(e, vx, vy, dt) {
        const R = T.r - 2;
        const nx = e.x + vx * dt, ny = e.y + vy * dt;
        const free = (x, y) => !solidAt(x - R, y - R) && !solidAt(x + R, y - R) && !solidAt(x - R, y + R) && !solidAt(x + R, y + R);
        if (free(nx, e.y)) e.x = nx;
        if (free(e.x, ny)) e.y = ny;
      }

      // ------------------------------------------------------------ state
      const me = { x: spawn.x, y: spawn.y, a: 0, walk: 0, lives: rules.lives, inv: 1.5, speedT: 0, keys: 0, coins: 0, check: { x: spawn.x, y: spawn.y }, hop: null };
      let phase = 'play', time = rules.time, clock = 0, spikeT = 0;
      const bots = [];
      if (rules.bots) ctx.bots.slice(0, 4).forEach((b, i) => bots.push({ bot: b, x: spawn.x + (i % 2 ? 30 : -30), y: spawn.y + (i < 2 ? 30 : -30), a: 0, walk: 0, coins: 0, tx: spawn.x, ty: spawn.y, t: Math.random() }));
      ctx.banner(ctx.game.name, SP.goals[rules.goal], 2200);

      function hurt(why) {
        if (me.inv > 0 || phase !== 'play') return;
        me.lives--;
        me.inv = T.invuln;
        ctx.sfx('hurt');
        parts.emit(me.x, me.y, { count: 16, colors: ['#ff5a6a', '#ffd66b'], speed: 140, life: 0.5 });
        floats.add(me.x, me.y - 26, why, '#ff8b98', 14);
        if (me.lives <= 0) return finish(false, 'Out of lives');
        me.x = me.check.x; me.y = me.check.y; me.hop = null;
      }
      function take(it, who) {
        it.taken = true;
        if (who === me) {
          if (it.t === 'coin') { me.coins++; ctx.sfx('coin'); floats.add(it.x, it.y - 20, '+1', '#ffd66b', 14); }
          else if (it.t === 'gem') { me.coins += 5; ctx.sfx('powerup'); floats.add(it.x, it.y - 20, '+5', '#7fe7ff', 15); }
          else if (it.t === 'key') { me.keys++; doorsOpen = true; ctx.sfx('open'); ctx.feed('Key found: every locked door is open!', 'star', '#ffc940'); }
          else if (it.t === 'heal') { me.lives++; ctx.sfx('powerup'); floats.add(it.x, it.y - 20, '+1 life', '#ff5a8a', 14); }
          parts.emit(it.x, it.y, { count: 10, color: SP.tiles[it.t].color, speed: 120, life: 0.4 });
        } else {
          who.coins += it.t === 'gem' ? 5 : 1;
          // a bot told to "help" gathers for you
          const o = ctx.botOrder(who.bot.id);
          if (o && (o.verb === 'help' || o.verb === 'gather') && (it.t === 'coin' || it.t === 'gem')) { me.coins += it.t === 'gem' ? 5 : 1; who.coins -= it.t === 'gem' ? 5 : 1; floats.add(it.x, it.y - 20, who.bot.displayName.split(' ')[0] + ' +' + (it.t === 'gem' ? 5 : 1), '#8fd3ff', 12); }
        }
      }
      function finish(win, why) {
        if (phase !== 'play') return;
        phase = 'over';
        const best = bots.reduce((a, b) => Math.max(a, b.coins), 0);
        ctx.end({
          outcome: win ? 'win' : 'lose',
          title: win ? 'You win!' : why || 'Game over',
          subtitle: SP.goals[rules.goal] + ' · ' + me.coins + ' coins',
          coins: Math.round(T.rewards.play + (win ? T.rewards.win : 0) + me.coins * T.rewards.perCoin),
          xp: T.rewards.xpPlay + (win ? T.rewards.xpWin : 0),
          stats: [['Coins', me.coins + (coinsTotal ? ' / ' + coinsTotal : '')], ['Lives left', Math.max(0, me.lives)], ['Time', U.fmtClock(clock)], ['Best bot', best + ' coins']],
          delay: win ? 1500 : 900,
        });
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        V.preset(theme.preset, { fogNear: 1600, fogFar: 4200 });
        if (theme.preset === 'space' || theme.preset === 'night') V.stars(300);
        V.shadowSize(700);
        const neon = rules.theme === 'neon' || rules.theme === 'space';
        V.ground(-400, -400, WW + 400, WH + 400, U.shade(theme.floor, -0.25), { y: -5 });
        const floor = [];
        for (let r = 0; r < SP.rows; r++) for (let c = 0; c < SP.cols; c++) floor.push({ x: c * C + C / 2, y: -4, z: r * C + C / 2, w: C, h: 4, d: C, color: U.shade(theme.floor, (c + r) % 2 ? 0.04 : -0.03) });
        V.boxes(floor, { shadow: false });
        const walls = [], lava = [], pads = [], jumps = [], checks = [];
        for (const [k, t] of grid) {
          const [c, r] = k.split(',').map(Number);
          const x = c * C + C / 2, z = r * C + C / 2;
          if (t === 'wall') walls.push({ x, z, w: C, h: 52, d: C, color: U.shade(theme.wall, ((c * 3 + r) % 4) * 0.03) });
          else if (t === 'lava') lava.push({ x, y: -3.5, z, w: C, h: 4, d: C, color: (c + r) % 2 ? '#ff3d1f' : '#ff7a2e' });
          else if (t === 'speed') pads.push({ x, y: 0.2, z, w: C - 6, h: 2, d: C - 6, color: '#39f3ff' });
          else if (t === 'bounce') jumps.push({ x, y: 0, z, w: C - 8, h: 8, d: C - 8, color: '#4ad17f' });
          else if (t === 'check') checks.push({ x, z });
        }
        V.boxes(walls);
        if (neon) V.boxes(walls.map((w) => ({ x: w.x, y: w.h, z: w.z, w: w.w + 1, h: 2, d: w.d + 1, color: '#39f3ff' })), { glow: 1, shadow: false });
        V.boxes(lava, { glow: 1, shadow: false });
        V.boxes(pads, { glow: 1, shadow: false });
        V.boxes(jumps);
        const doorMeshes = [];
        for (const [k, t] of grid) if (t === 'door') { const [c, r] = k.split(',').map(Number); doorMeshes.push(V.box(c * C + C / 2, 0, r * C + C / 2, C, 60, C - 10, '#8b5a2b')); doorMeshes.push(V.box(c * C + C / 2, 26, r * C + C / 2 + (C - 10) / 2 + 1, 8, 8, 2, '#ffc940', { metal: 0.6 })); }
        for (const ch of checks) { V.box(ch.x, 0, ch.z, 4, 60, 4, '#39414f'); V.box(ch.x + 12, 44, ch.z, 20, 14, 2, '#b67cff', { glow: 0.4 }); }
        if (goal) { V.box(goal.x, 0, goal.y, 5, 90, 5, '#e8ecf1'); V.box(goal.x + 18, 64, goal.y, 32, 22, 2, '#3fd08a', { glow: 0.5 }); V.shape('torus', goal.x, 1, goal.y, 60, 60, 12, '#ffd66b', { glow: 0.8 }).rotation.x = Math.PI / 2; }
        V.shape('cyl', spawn.x, 1, spawn.y, 44, 2, 44, '#ffffff', { opacity: 0.35 });
        const spikeMeshes = spikes.map((sp) => { const g = V.group(); g.position.set(sp.x, 0, sp.y); V.box(0, 0, 0, C - 4, 3, C - 4, '#5a5f6a', { parent: g }); const tips = V.group(g); for (let i = 0; i < 4; i++) V.shape('cone4', (i % 2 - 0.5) * 16, 9, (Math.floor(i / 2) - 0.5) * 16, 9, 18, 9, '#d7dde6', { parent: tips, metal: 0.6 }); g.userData.tips = tips; return g; });
        const itemMeshes = items.map((it) => {
          const g = V.group(); g.position.set(it.x, 0, it.y);
          if (it.t === 'coin') { const m = V.shape('cyl', 0, 18, 0, 20, 4, 20, '#ffd23f', { parent: g, metal: 0.6, glow: 0.25 }); m.rotation.x = Math.PI / 2; g.userData.spin = m; }
          else if (it.t === 'gem') g.userData.spin = V.shape('octa', 0, 20, 0, 18, 26, 18, '#7fe7ff', { parent: g, glow: 0.8, flat: true });
          else if (it.t === 'key') { const k = V.group(g); k.position.y = 18; V.shape('torus', -6, 0, 0, 14, 14, 6, '#ffc940', { parent: k, metal: 0.7 }); V.box(8, -2, 0, 18, 4, 4, '#ffc940', { parent: k, metal: 0.7 }); g.userData.spin = k; }
          else if (it.t === 'heal') { V.box(0, 10, 0, 22, 8, 8, '#ff5a8a', { parent: g, glow: 0.5 }); V.box(0, 3, 0, 8, 22, 8, '#ff5a8a', { parent: g, glow: 0.5 }); }
          return g;
        });
        const enemyMeshes = enemies.map(() => { const z = BF.props3d.zombie({ skin: rules.theme === 'space' ? '#9ab8ff' : '#8fbf6a', shirt: '#5a4a6a', eyes: '#ff3d5a' }); z.scale.setScalar(0.7); V.scene.add(z); return z; });
        return function sync() {
          const t = ctx.time;
          V.look(me.x, 0, me.y + 30, { dist: 430, pitch: 0.9, fov: 45, lerp: 0.12 }, 1 / 60);
          items.forEach((it, i) => { const g = itemMeshes[i]; g.visible = !it.taken; if (g.userData.spin) { g.userData.spin.rotation.y = t * 2 + it.spin; g.userData.spin.position.y = 18 + Math.sin(t * 3 + it.spin) * 3; } });
          doorMeshes.forEach((m) => { m.visible = !doorsOpen; });
          const up = spikeT % T.spikeCycle < T.spikeUp;
          spikeMeshes.forEach((g) => { g.userData.tips.position.y = up ? 0 : -16; });
          enemies.forEach((e, i) => { const m = enemyMeshes[i]; m.position.set(e.x, 0, e.y); m.rotation.y = Math.PI / 2 - e.a; m.userData.tick(t, true); });
          for (const b of bots) {
            const rig = V.actor(b.bot.id, b.bot.avatar, { scale: 8 });
            rig.setPos(b.x, 0, b.y); rig.faceAngle(b.a); rig.set({ move: b.moving ? 1 : 0 });
            V.label(b.x, 58, b.y, { name: b.bot.displayName, color: '#ffffff', bubble: ctx.bubbleText(b.bot.id) });
          }
          const rig = V.actor('me', ctx.player.avatar, { scale: 8 });
          rig.setPos(me.x, me.hop ? Math.sin(me.hop.k * Math.PI) * 40 : 0, me.y); rig.faceAngle(me.a);
          rig.set({ move: me.moving ? 1 : 0, air: !!me.hop });
          rig.group.visible = !(me.inv > 0 && Math.sin(t * 30) > 0.3);
          V.label(me.x, 60, me.y, { name: ctx.player.name, color: '#ffb454', bubble: ctx.bubbleText('me') });
          V.sweep();
        };
      })();

      function drawHud(g) {
        G.panel(g, 10, 10, 250, 78);
        G.text(g, SP.goals[rules.goal], 22, 30, { size: 12, color: '#a1abbb' });
        const main = rules.goal === 'collect' ? me.coins + ' / ' + coinsTotal + ' coins' : rules.goal === 'reach' ? 'Find the flag' : rules.goal === 'survive' ? 'Stay alive!' : me.coins + ' coins';
        G.text(g, main, 22, 56, { size: 20, weight: 800 });
        G.text(g, '♥'.repeat(Math.max(0, Math.min(9, me.lives))) + (me.keys ? '  🗝 ' : ''), 22, 78, { size: 13, color: '#ff5a8a' });
        G.text(g, U.fmtClock(time), 248, 56, { size: 20, weight: 800, align: 'right', color: time < 20 ? '#ff8b98' : '#8fd3ff' });
        if (rules.goal === 'score' && bots.length) {
          const rows = [{ n: ctx.player.name, c: me.coins, me: true }].concat(bots.map((b) => ({ n: b.bot.displayName, c: b.coins }))).sort((a, b) => b.c - a.c);
          G.panel(g, W - 210, 10, 200, 22 + rows.length * 18);
          rows.forEach((r, i) => { G.text(g, (i + 1) + '. ' + r.n.slice(0, 14), W - 198, 30 + i * 18, { size: 12, color: r.me ? '#ffb454' : '#e8ecf3', weight: r.me ? 800 : 600 }); G.text(g, String(r.c), W - 20, 30 + i * 18, { size: 12, align: 'right', weight: 800 }); });
        }
        parts.draw && !V && parts.draw(g);
      }

      return {
        update(dt) {
          parts.update(dt); floats.update(dt);
          if (phase !== 'play') return;
          clock += dt; time -= dt; spikeT += dt;
          if (me.inv > 0) me.inv -= dt;
          if (me.speedT > 0) me.speedT -= dt;
          // movement (a jump pad hop carries you two tiles, over lava and spikes)
          const ax = ctx.input.axis();
          const sp = T.speeds[rules.speed] * (me.speedT > 0 ? T.speedPad : 1);
          if (me.hop) {
            me.hop.k += dt / 0.55;
            const nx = U.lerp(me.hop.x0, me.hop.x1, Math.min(1, me.hop.k)), ny = U.lerp(me.hop.y0, me.hop.y1, Math.min(1, me.hop.k));
            if (!solidAt(nx, ny)) { me.x = nx; me.y = ny; }
            if (me.hop.k >= 1) me.hop = null;
          } else {
            me.moving = Math.hypot(ax.x, ax.y) > 0.1;
            if (me.moving) { move(me, ax.x * sp, ax.y * sp, dt); me.a = Math.atan2(ax.y, ax.x); me.walk += dt * 10; }
            const here = tileAt(me.x, me.y);
            if (here === 'lava') hurt('Lava!');
            if (here === 'spikes' && spikeT % T.spikeCycle < T.spikeUp) hurt('Spikes!');
            if (here === 'speed' && me.speedT <= 0) { me.speedT = T.speedTime; ctx.sfx('boost'); }
            if (here === 'bounce') { const dx = Math.cos(me.a), dy = Math.sin(me.a); me.hop = { k: 0, x0: me.x, y0: me.y, x1: me.x + dx * C * T.jump, y1: me.y + dy * C * T.jump }; ctx.sfx('jump'); }
            if (here === 'check') { const cx = Math.floor(me.x / C) * C + C / 2, cy = Math.floor(me.y / C) * C + C / 2; if (me.check.x !== cx || me.check.y !== cy) { me.check = { x: cx, y: cy }; ctx.feed('Checkpoint!', 'star', '#b67cff'); ctx.sfx('checkpoint'); } }
          }
          for (const it of items) if (!it.taken && U.dist(it.x, it.y, me.x, me.y) < 22) take(it, me);
          // enemies patrol left and right, turning at walls
          const es = T.enemySpeeds[rules.enemySpeed];
          for (const e of enemies) {
            const nx = e.x + e.dir * es * dt;
            if (solidAt(nx + e.dir * 14, e.y) || tileAt(nx + e.dir * 14, e.y) === 'lava' || Math.abs(nx - e.x0) > C * 4) e.dir *= -1; else e.x = nx;
            e.a = e.dir > 0 ? 0 : Math.PI;
            if (!me.hop && U.dist(e.x, e.y, me.x, me.y) < 24) hurt('Ouch!');
          }
          // bots: collect coins, or follow chat orders
          for (const b of bots) {
            const og = BF.orders.goal(ctx, b.bot.id, b, me, { near: 40 });
            b.t -= dt;
            if (og) { if (og.hold) { b.tx = b.x; b.ty = b.y; } else { b.tx = og.x; b.ty = og.y; } }
            else if (b.t <= 0) {
              b.t = 1.5 + Math.random() * 2;
              const left = items.filter((i) => !i.taken && (i.t === 'coin' || i.t === 'gem'));
              const target = left.sort((p, q) => U.dist(p.x, p.y, b.x, b.y) - U.dist(q.x, q.y, b.x, b.y))[Math.floor(Math.random() * 2)];
              if (target) { b.tx = target.x; b.ty = target.y; } else { b.tx = 60 + Math.random() * (WW - 120); b.ty = 60 + Math.random() * (WH - 120); }
            }
            const dx = b.tx - b.x, dy = b.ty - b.y, l = Math.hypot(dx, dy);
            b.moving = l > 6;
            if (b.moving) { const bsp = T.speeds[rules.speed] * (og ? 1 : 0.62); const px = b.x, py = b.y; move(b, (dx / l) * bsp, (dy / l) * bsp, dt); if (Math.hypot(b.x - px, b.y - py) < 0.2) b.t = 0; b.a = Math.atan2(dy, dx); b.walk += dt * 10; }
            for (const it of items) if (!it.taken && (it.t === 'coin' || it.t === 'gem') && U.dist(it.x, it.y, b.x, b.y) < 22) take(it, b);
          }
          // win and lose conditions
          const coinsLeft = items.some((i) => !i.taken && i.t === 'coin');
          if (rules.goal === 'collect' && coinsTotal && !coinsLeft) {
            const mine = me.coins;
            if (mine >= Math.ceil(coinsTotal / Math.max(1, bots.length + 1))) finish(true); else finish(false, 'The bots got more coins');
          }
          if (rules.goal === 'reach' && goal && U.dist(goal.x, goal.y, me.x, me.y) < 28) finish(true);
          if (time <= 0) {
            if (rules.goal === 'survive') finish(true);
            else if (rules.goal === 'score') { const best = bots.reduce((a, b) => Math.max(a, b.coins), 0); finish(me.coins >= best, 'A bot collected more coins'); }
            else finish(false, "Time's up");
          }
          cam.follow(me.x, me.y, dt, 0.15);
        },
        draw(g) {
          g.save(); cam.apply(g);
          g.fillStyle = theme.floor; g.fillRect(0, 0, WW, WH);
          for (const [k, t] of grid) { const [c, r] = k.split(',').map(Number); if (t === 'door' && doorsOpen) continue; g.fillStyle = (SP.tiles[t] || {}).color || '#fff'; g.fillRect(c * C + 1, r * C + 1, C - 2, C - 2); }
          for (const it of items) if (!it.taken) G.circle(g, it.x, it.y, it.t === 'gem' ? 9 : 7, SP.tiles[it.t].color);
          for (const e of enemies) G.circle(g, e.x, e.y, 12, '#8fbf6a');
          for (const b of bots) G.avatarTop(g, b.x, b.y, 10, b.bot.look, b.a, { walk: b.walk });
          G.avatarTop(g, me.x, me.y, 11, ctx.player.look, me.a, { walk: me.walk });
          parts.draw(g); floats.draw(g);
          g.restore();
          drawHud(g);
        },
        render3d(dt) { view(dt); },
        hud(g) { drawHud(g); },
        onBotJoin(b) { if (rules.bots && bots.length < 4 && !bots.some((x) => x.bot.id === b.id)) bots.push({ bot: b, x: spawn.x, y: spawn.y, a: 0, walk: 0, coins: 0, tx: spawn.x, ty: spawn.y, t: 0 }); },
        onBotLeave(b) { const i = bots.findIndex((x) => x.bot.id === b.id); if (i >= 0) bots.splice(i, 1); },
        _test: { me, items, get phase() { return phase; }, rules, enemies, finish },
      };
    },
  });
})((window.BF = window.BF || {}));
