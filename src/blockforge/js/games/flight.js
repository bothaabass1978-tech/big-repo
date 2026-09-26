/**
 * Flight (gameType "flight") — a flying race through a ring course. Steer with
 * WASD, boost with Shift; every ring adds points and boost fuel and builds a
 * streak, obstacles cost a heart. First across the finish wins.
 *
 * Variants (config.variant):
 *   rings     Sky Rings          glider over floating islands, balloons in the way
 *   wingsuit  Wingsuit Canyon    a fast dive down a narrow canyon (walls hurt)
 *   dragon    Dragon Riders      ride a dragon; Space breathes fire to pop target balloons
 *   jet       Jet Stunt League   jetpack over the city, boost gates chain multipliers
 *   paper     Paper Plane Pro    a paper plane in a giant house: glide, ride fan updrafts
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  const T = {
    length: 11000, speed: 430, boost: 1.65, fuel: 0.22, drain: 0.45, steer: 330, climb: 280, bounds: 330, hMin: 30, hMax: 460,
    ringR: 46, ringGap: [300, 440], hearts: 3, invuln: 1.4, fireCd: 0.6,
    rewards: { play: 12, win: 45, per: 0.02, xpPlay: 25, xpWin: 90 },
  };

  const VARIANTS = {
    rings: { preset: 'day', ground: '#5aab52', accent: '#ffd23f', obst: 'balloon', title: 'Glide through every ring', mount: 'glider' },
    wingsuit: { preset: 'sunset', ground: '#b0643a', accent: '#ff8a2e', obst: 'arch', title: 'Dive the canyon', mount: 'suit', canyon: true, dive: true, speedK: 1.25 },
    dragon: { preset: 'dusk', ground: '#3a5a3a', accent: '#ff5a2e', obst: 'rock', title: 'Pop the target balloons', mount: 'dragon', fire: true },
    jet: { preset: 'sunset', ground: '#3a3f5a', accent: '#39f3ff', obst: 'crane', title: 'Chain the boost gates', mount: 'jet', gates: true, speedK: 1.1 },
    paper: { preset: 'indoor', ground: '#c8a878', accent: '#ffffff', obst: 'furniture', title: 'Ride the fan breezes', mount: 'paper', glide: true, speedK: 0.8 },
  };

  BF.GameModules.register('flight', {
    three: true,
    maxBots: 5,
    feedTop: 0.2,
    orders: ['race', 'follow'],
    actions: { boost: ['ShiftLeft', 'ShiftRight'], special: ['Space'] },
    controls: { joystick: true, buttons: [{ act: 'boost', label: 'Boost', icon: 'rocket' }, { act: 'special', label: 'Special', icon: 'fire' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H, K = BF.arcade;
      const VAR = K.variant(ctx, VARIANTS);
      const V = ctx.g3;
      const rng = U.rng('flight:' + ctx.gameId);
      const len = T.length * (VAR.speedK || 1);
      const hAt = (z) => (VAR.dive ? 440 - (z / len) * 360 : 200);
      // course: rings, obstacles, target balloons, fans, boost gates
      const rings = [], obs = [], targets = [], fans = [], gates = [];
      let z = 600, prev = { x: 0, h: hAt(0) };
      while (z < len - 300) {
        const x = U.clamp(prev.x + (rng() - 0.5) * 300, -T.bounds + 60, T.bounds - 60);
        const h = U.clamp((VAR.dive ? hAt(z) : prev.h) + (rng() - 0.5) * 160, T.hMin + 40, T.hMax - 40);
        rings.push({ z, x, h, hit: false, missed: false });
        if (rng() < 0.75) { const ox = U.clamp(x + (rng() < 0.5 ? -1 : 1) * (90 + rng() * 120), -T.bounds, T.bounds); obs.push({ z: z + 140 + rng() * 60, x: ox, h: U.clamp(h + (rng() - 0.5) * 120, T.hMin, T.hMax), r: VAR.obst === 'balloon' ? 34 : 42 }); }
        if (VAR.fire && rng() < 0.6) targets.push({ z: z + 90, x: x + (rng() - 0.5) * 220, h: h + (rng() - 0.5) * 100, popped: false });
        if (VAR.glide && rng() < 0.45) fans.push({ z: z + 180, x: x + (rng() - 0.5) * 160 });
        if (VAR.gates && rng() < 0.4) gates.push({ z: z + 200, x, h, used: false });
        prev = { x, h };
        z += U.rand(T.ringGap[0], T.ringGap[1], rng) * (VAR.speedK || 1);
      }
      const me = { x: 0, h: hAt(0), z: 0, vx: 0, vh: 0, fuel: 0.5, hearts: T.hearts + (ctx.hasPass('glider') ? 0 : 0), inv: 0, score: 0, streak: 0, rings: 0, crashes: 0, finished: false, fireCd: 0 };
      const racers = K.crew(ctx, 5, (i) => ({ x: (i - 2) * 70, h: hAt(0) - 20 + i * 10, z: -40 - i * 30, speed: 0, finished: 0, tRing: 0 }));
      racers.forEach((r) => { r.speed = T.speed * (VAR.speedK || 1) * (0.9 + r.skill * 0.16); });
      const fireballs = [];
      let phase = 'count', countT = 2.6, clock = 0, finishOrder = [], ended = false;
      ctx.banner(ctx.game.name, VAR.title, 2200);

      function hurt(why) {
        if (me.inv > 0) return;
        me.hearts--; me.crashes++; me.inv = T.invuln; me.streak = 0;
        ctx.sfx('hurt'); if (V) V.shake(8, 0.3);
        ctx.feed(why + (me.hearts > 0 ? ' (' + me.hearts + ' hearts left)' : ''), 'leave', '#ff9d9d');
        if (me.hearts <= 0) finish(false);
      }
      function finish(made) {
        if (ended) return;
        ended = true; phase = 'over';
        const place = made ? finishOrder.indexOf('me') + 1 : 0;
        const allRings = rings.every((r) => r.hit);
        ctx.best('bestScore', me.score);
        ctx.addStat('ringsHit', me.rings);
        if (made && place === 1) ctx.badge(ctx.gameId + '_win');
        if (made && allRings) ctx.badge(ctx.gameId + '_rings');
        if (made && me.crashes === 0) ctx.badge(ctx.gameId + '_nohit');
        K.finish(ctx, { win: made && place === 1, title: !made ? 'Crashed out' : place === 1 ? 'First place!' : 'Finished #' + place, subtitle: me.rings + ' / ' + rings.length + ' rings · ' + U.fmt(me.score) + ' pts', score: me.score, place: made ? place : 0, of: racers.length + 1, stats: [['Rings', me.rings + ' / ' + rings.length], ['Score', U.fmt(me.score)], ['Crashes', me.crashes], ['Time', U.fmtClock(clock)]], rewards: T.rewards });
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        V.preset(VAR.preset, { fogNear: 1400, fogFar: 4200 });
        if (VAR.preset === 'dusk') V.stars(300);
        V.shadowSize(600);
        const r = U.rng('sky:' + ctx.gameId);
        const deco = [];
        if (VAR.mount === 'paper') {
          // a giant house: floor boards, walls, tables and shelves
          V.box(0, -40, -len / 2, 1400, 40, len + 1600, '#c8a878');
          V.box(-560, 0, -len / 2, 40, 700, len + 1600, '#e8dcc8'); V.box(560, 0, -len / 2, 40, 700, len + 1600, '#dcd0bc');
          for (let zz = 0; zz < len; zz += 900) { deco.push({ x: -380, y: 0, z: -zz, w: 160, h: 180, d: 300, color: '#8b5a2b' }); deco.push({ x: 400, y: 0, z: -zz - 450, w: 200, h: 260, d: 120, color: '#e8ecf1' }); deco.push({ x: 0, y: 690, z: -zz, w: 1100, h: 12, d: 30, color: '#f4efe4' }); }
        } else if (VAR.canyon) {
          V.box(0, -60, -len / 2, 700, 40, len + 1600, VAR.ground);
          for (let zz = -200; zz < len + 600; zz += 160) { const w1 = 180 + r() * 120, w2 = 180 + r() * 120; deco.push({ x: -T.bounds - w1 / 2 - 20, y: -60, z: -zz, w: w1, h: 520 + r() * 260, d: 170, color: U.shade(VAR.ground, r() * 0.15 - 0.08) }); deco.push({ x: T.bounds + w2 / 2 + 20, y: -60, z: -zz, w: w2, h: 520 + r() * 260, d: 170, color: U.shade(VAR.ground, r() * 0.15 - 0.08) }); }
        } else {
          V.gridFloor(-4000, -len - 3000, 4000, 3000, VAR.ground, 'rgba(0,0,0,.08)', 160, { y: -220 });
          for (let i = 0; i < 70; i++) {
            const x = (r() < 0.5 ? -1 : 1) * (500 + r() * 1400), zz = -r() * (len + 2000);
            if (VAR.mount === 'jet') { const h = 200 + r() * 600; deco.push({ x, y: -220, z: zz, w: 120, h, d: 120, color: U.shade('#3a3f5a', r() * 0.2) }); deco.push({ x, y: -220 + h, z: zz, w: 124, h: 6, d: 124, color: '#39f3ff' }); }
            else { deco.push({ x, y: -120 + r() * 200, z: zz, w: 200 + r() * 200, h: 60 + r() * 40, d: 200 + r() * 200, color: VAR.mount === 'dragon' ? '#4a6a4a' : '#6cbf5a' }); deco.push({ x, y: -220 + r() * 100, z: zz, w: 120, h: 120, d: 120, color: '#8a6a4a', rot: r() }); }
          }
          for (let i = 0; i < 40; i++) deco.push({ x: -1800 + r() * 3600, y: 500 + r() * 300, z: -r() * (len + 2000), w: 160 + r() * 200, h: 40, d: 100 + r() * 100, color: '#ffffff' });
        }
        V.boxes(deco);
        // rings, obstacles, targets, fans, gates
        for (const g of rings) { const m = V.shape('torus', g.x, g.h, -g.z, T.ringR * 2.2, T.ringR * 2.2, 40, VAR.accent, { glow: 0.9 }); g.mesh = m; }
        for (const o of obs) {
          if (VAR.obst === 'balloon') { V.shape('sphere', o.x, o.h + 10, -o.z, 60, 72, 60, U.pick(['#ff5a6a', '#46a8ff', '#b67cff'], r)); V.box(o.x, o.h - 60, -o.z, 2, 50, 2, '#ffffff'); }
          else if (VAR.obst === 'rock') V.shape('dodeca', o.x, o.h, -o.z, 84, 70, 84, '#5a5f6a');
          else if (VAR.obst === 'arch') { V.box(o.x, o.h - 40, -o.z, 90, 80, 50, U.shade(VAR.ground, -0.1)); }
          else if (VAR.obst === 'crane') { V.box(o.x, -220, -o.z, 20, o.h + 260, 20, '#ffc940'); V.box(o.x, o.h + 20, -o.z, 240, 16, 16, '#ffc940'); }
          else V.box(o.x, o.h - 42, -o.z, 84, 84, 84, U.pick(['#8b5a2b', '#e8ecf1', '#46a8ff'], r));
        }
        for (const t of targets) t.mesh = V.shape('sphere', t.x, t.h, -t.z, 44, 54, 44, '#ffd23f', { glow: 0.6 });
        for (const f of fans) { V.box(f.x, 0, -f.z, 90, 30, 90, '#8a909c'); V.shape('cyl', f.x, 200, -f.z, 90, 380, 90, '#dff4ff', { opacity: 0.14, shadow: false }); }
        for (const g of gates) g.mesh = V.box(g.x, g.h - 60, -g.z, 140, 120, 6, '#39f3ff', { glow: 1, opacity: 0.55, shadow: false });
        V.box(0, T.hMin, -len, 900, 10, 30, '#ffffff', { glow: 1 }); V.sign('FINISH', 0, T.hMax + 40, -len, { h: 60, color: '#ffe066' });
        const pool = V.pool();
        function mountMesh(kind, col) {
          const g = V.group();
          if (kind === 'dragon') { g.scale.setScalar(0.6); V.shape('sphere', 0, 0, 0, 40, 30, 110, col || '#3a8a4a', { parent: g }); V.shape('cone', 0, 8, -70, 18, 40, 18, col || '#3a8a4a', { parent: g }).rotation.x = -Math.PI / 2; for (const s of [-1, 1]) { const w = V.box(s * 60, 0, 0, 100, 4, 60, U.shade(col || '#3a8a4a', -0.15), { parent: g }); w.rotation.z = s * 0.25; } V.shape('cone', 0, 0, 70, 14, 50, 14, col || '#3a8a4a', { parent: g }).rotation.x = Math.PI / 2; }
          else if (kind === 'glider') {
            // a flat delta wing over the rider, with a strut and control bar
            V.shape('cone4', 0, 26, 0, 130, 8, 60, col || '#ffd23f', { parent: g });
            V.box(0, -6, 0, 2, 28, 2, '#3a3f4a', { parent: g });
            V.box(0, -6, 6, 36, 2, 2, '#3a3f4a', { parent: g });
          }
          else if (kind === 'jet') { V.box(0, 20, 8, 20, 26, 10, '#8a909c', { parent: g }); V.shape('cone', -6, 4, 10, 6, 16, 6, '#ff8a2e', { parent: g, glow: 1.4 }).rotation.x = Math.PI; V.shape('cone', 6, 4, 10, 6, 16, 6, '#ff8a2e', { parent: g, glow: 1.4 }).rotation.x = Math.PI; }
          else if (kind === 'paper') { const p = V.shape('cone4', 0, 0, 0, 70, 90, 12, '#f8f8f4', { parent: g }); p.rotation.x = -Math.PI / 2; p.rotation.y = Math.PI / 4; }
          else { V.box(0, 20, 0, 70, 3, 20, col || '#ff8a2e', { parent: g }); }
          return g;
        }
        return function sync() {
          const t = ctx.time;
          for (const g of rings) if (g.mesh) { g.mesh.visible = !g.hit; g.mesh.rotation.z = t * 0.5; }
          for (const tg of targets) if (tg.mesh) tg.mesh.visible = !tg.popped;
          for (const f of fireballs) pool.use('fb' + f.id, () => V.shape('sphere', 0, 0, 0, 24, 24, 24, '#ff8a2e', { glow: 1.5, shadow: false })).position.set(f.x, f.h, -f.z);
          const riders = [{ who: 'me', x: me.x, h: me.h, z: me.z, vx: me.vx, col: null }].concat(racers.map((r) => ({ who: r, x: r.x, h: r.h, z: r.z, vx: Math.sin(t + r.skill * 7) * 60, col: U.pick(['#b83a3a', '#3a6ab8', '#8a3ab8', '#b8963a'], U.rng(r.bot.id)) })));
          for (const rd of riders) {
            const id = rd.who === 'me' ? 'me' : rd.who.bot.id;
            const mount = pool.use('m' + id, () => mountMesh(VAR.mount, rd.col));
            mount.position.set(rd.x, rd.h, -rd.z);
            mount.rotation.z = -rd.vx / 900;
            if (VAR.mount === 'dragon') mount.children.forEach((c, i) => { if (i === 2 || i === 3) c.rotation.z = (i === 2 ? 1 : -1) * (0.25 + Math.sin(t * 6) * 0.35); });
            const sit = VAR.mount === 'dragon' || VAR.mount === 'paper';
            const rig = K.rig(V, ctx, rd.who, rd.x, rd.h + (sit ? 14 : -30), -rd.z, { a: -Math.PI / 2, mode: sit ? 'sit' : 'swim', scale: VAR.mount === 'paper' ? 4.5 : 7, tag: 40 });
            if (rd.who === 'me') rig.group.visible = !(me.inv > 0 && Math.sin(t * 30) > 0.4);
          }
          pool.sweep();
          const cam = VAR.mount === 'dragon' ? { d: 330, p: 0.34, ahead: 160 } : { d: 250, p: 0.24, ahead: 90 };
          V.look(me.x * 0.85, me.h + 24, -me.z - cam.ahead, { dist: cam.d, pitch: cam.p, yaw: 0, fov: 60, lerp: 0.2 }, 1 / 60);
          V.sweep();
        };
      })();

      function drawHud(g) {
        const nextRing = rings.find((r) => !r.hit && !r.missed);
        K.panel(g, ctx.game.name, U.fmt(me.score) + ' pts', me.rings + ' / ' + rings.length + ' rings' + (me.streak > 1 ? '  · streak x' + me.streak : ''), 270);
        G.text(g, '♥'.repeat(Math.max(0, me.hearts)), 22, 106, { size: 15, color: '#ff5a8a' });
        K.meter(g, 22, 130, 160, me.fuel, '#39f3ff', 'Boost');
        const pos = [{ n: ctx.player.name, v: me.z, me: true }].concat(racers.map((r) => ({ n: r.bot.displayName, v: r.z })));
        K.board(g, W, pos, { title: 'Race', fmt: (v) => Math.max(0, Math.min(100, Math.round(v / len * 100))) + '%' });
        G.bar(g, W / 2 - 150, 16, 300, 8, U.clamp(me.z / len, 0, 1), VAR.accent);
        if (phase === 'count') G.display(g, countT > 0.5 ? String(Math.ceil(countT - 0.5)) : 'GO!', W / 2, H / 2, 90, '#ffffff', 'center');
        else if (clock < 6) K.hint(g, W, H, 'WASD steer · Shift boost' + (VAR.fire ? ' · Space breathe fire' : ''));
        if (nextRing && V) { const p = V.toScreen(nextRing.x, nextRing.h, -nextRing.z); if (!p.on) K.hint(g, W, H, p.x < W / 2 ? '< next ring' : 'next ring >', VAR.accent); }
      }
      function draw2d(g) {
        g.fillStyle = '#8fd3ff'; g.fillRect(0, 0, W, H);
        const px = (x) => W / 2 + x * 1.2, py = (h) => H - 60 - h;
        for (const r of rings) if (!r.hit && r.z > me.z && r.z < me.z + 1500) { const k = 1 - (r.z - me.z) / 1500; G.ring(g, px(r.x * k + me.x * (1 - k)), py(r.h * k + me.h * (1 - k)), T.ringR * k, VAR.accent, 4); }
        G.avatarTop(g, px(me.x), py(me.h), 14, ctx.player.look, -Math.PI / 2, {});
        drawHud(g);
      }

      return {
        update(dt) {
          if (phase === 'count') { countT -= dt; if (countT <= 0) { phase = 'fly'; ctx.sfx('go'); } return; }
          if (phase !== 'fly') return;
          clock += dt;
          const inp = ctx.input;
          const ax = inp.axis();
          const steer = T.steer * (ctx.hasPass('glider') ? 1.25 : 1);
          me.vx = U.lerp(me.vx, ax.x * steer, Math.min(1, dt * 6));
          const lift = VAR.glide ? -90 : 0;
          const fanUp = VAR.glide && fans.some((f) => Math.abs(f.z - me.z) < 70 && Math.abs(f.x - me.x) < 60) ? 360 : 0;
          if (fanUp && !me.inFan) { me.inFan = true; ctx.sfx('boost'); } else if (!fanUp) me.inFan = false;
          me.vh = U.lerp(me.vh, -ax.y * T.climb + lift + fanUp, Math.min(1, dt * 5));
          if (VAR.dive) me.vh += (hAt(me.z) - me.h) * 0.6 * dt * 10;
          me.x = U.clamp(me.x + me.vx * dt, -T.bounds - 40, T.bounds + 40);
          me.h = U.clamp(me.h + me.vh * dt, T.hMin, T.hMax);
          if (VAR.canyon && Math.abs(me.x) > T.bounds - 10) { hurt('You clipped the canyon wall'); me.x = Math.sign(me.x) * (T.bounds - 60); }
          if (VAR.glide && me.h <= T.hMin + 1) { hurt('You hit the floor'); me.h = T.hMin + 90; me.vh = 0; }
          const boosting = inp.act('boost') && me.fuel > 0;
          if (boosting) me.fuel = Math.max(0, me.fuel - T.drain * dt);
          me.speedNow = T.speed * (VAR.speedK || 1) * (boosting ? T.boost : 1) * (me.inv > 0 ? 0.75 : 1) * (me.gateT > 0 ? 1.5 : 1);
          if (me.gateT > 0) me.gateT -= dt;
          me.z += me.speedNow * dt;
          if (me.inv > 0) me.inv -= dt;
          if (me.fireCd > 0) me.fireCd -= dt;
          if (VAR.fire && inp.actPressed('special') && me.fireCd <= 0) { me.fireCd = T.fireCd; fireballs.push({ id: Math.random(), x: me.x, h: me.h, z: me.z + 30, life: 1.2 }); ctx.sfx('shoot'); }
          for (let i = fireballs.length - 1; i >= 0; i--) {
            const f = fireballs[i]; f.z += (me.speedNow + 700) * dt; f.life -= dt;
            const hit = targets.find((t) => !t.popped && Math.abs(t.z - f.z) < 40 && Math.hypot(t.x - f.x, t.h - f.h) < 60);
            if (hit) { hit.popped = true; me.score += 150; ctx.sfx('explosion'); if (V) V.fx.emit(hit.x, hit.h, -hit.z, { count: 20, colors: ['#ffd23f', '#ff8a2e'], speed: 160, life: 0.6 }); fireballs.splice(i, 1); continue; }
            if (f.life <= 0) fireballs.splice(i, 1);
          }
          // rings
          const reach = T.ringR * (ctx.hasPass('wide_rings') ? 1.4 : 1);
          for (const r of rings) {
            if (r.hit || r.missed || me.z < r.z) continue;
            if (Math.hypot(r.x - me.x, r.h - me.h) < reach) { r.hit = true; me.rings++; me.streak++; me.score += 100 * Math.min(5, me.streak); me.fuel = Math.min(1, me.fuel + T.fuel * (ctx.hasPass('turbo') ? 1.5 : 1)); ctx.sfx(me.streak >= 5 ? 'powerup' : 'coin'); }
            else { r.missed = true; me.streak = 0; }
          }
          for (const g2 of gates) if (!g2.used && Math.abs(g2.z - me.z) < 20 && Math.abs(g2.x - me.x) < 80 && Math.abs(g2.h - me.h) < 70) { g2.used = true; me.gateT = 2; me.score += 120; ctx.sfx('boost'); ctx.feed('Boost gate!', 'star', '#39f3ff'); }
          for (const o of obs) if (!o.done && Math.abs(o.z - me.z) < 28 && Math.hypot(o.x - me.x, o.h - me.h) < o.r) { o.done = true; hurt(VAR.obst === 'balloon' ? 'You flew into a balloon' : 'Crash!'); if (ended) return; }
          // racers
          for (const r of racers) {
            if (r.finished) continue;
            r.z += r.speed * dt * (0.96 + Math.sin(clock * 0.7 + r.skill * 10) * 0.06);
            const next = rings.find((g2) => g2.z > r.z) || { x: 0, h: 200 };
            r.x = U.lerp(r.x, next.x + (1 - r.skill) * 40 * Math.sin(clock + r.skill * 5), Math.min(1, dt * 2));
            r.h = U.lerp(r.h, next.h, Math.min(1, dt * 2));
            if (r.z >= len) { r.finished = clock; finishOrder.push(r.bot.id); ctx.feed(r.bot.displayName + ' crossed the finish (#' + finishOrder.length + ')', 'star', '#ffd66b'); }
          }
          if (me.z >= len && !me.finished) { me.finished = true; finishOrder.push('me'); ctx.sfx('win'); finish(true); }
        },
        draw: draw2d,
        render3d() { if (view) view(); },
        hud: drawHud,
        onBotJoin(b) { const e = K.join(racers, b, 5, () => ({ x: 0, h: 200, z: me.z - 200, speed: 0, finished: 0 }), ctx); if (e) e.speed = T.speed * (VAR.speedK || 1) * (0.9 + e.skill * 0.16); },
        onBotLeave(b) { K.leave(racers, b); },
        _test: { me, rings, racers, finish, get phase() { return phase; }, set phase(v) { phase = v; }, len },
      };
    },
  });
})((window.BF = window.BF || {}));
