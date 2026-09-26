/**
 * Party (gameType "party") — rounds of minigames on a floating arena. Survive
 * (or hold the hill) to score points; most points after the last round wins.
 *
 * Minigames:
 *   colorblock  a colour is called, every other tile drops away
 *   hexfall     three layers of tiles that crumble after you step on them
 *   meteor      meteors rain down on a shrinking island: watch the shadows
 *   sumo        shove everyone off a shrinking ring
 *   koth        stand on the golden hill to earn points (shoving allowed)
 *
 * Variants (config.variant): palooza (a mix), color, hexfall, meteor, sumo.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  const T = {
    speed: 235, botSpeed: 205, jump: 470, gravity: 1650, shove: 560, shoveCd: 0.8, friction: 5,
    tile: 50, grid: 12, radius: 330, fallOut: -170,
    color: { call: 3.6, callMin: 1.4, drop: 1.6, cycles: 9 },
    hex: { crumble: 0.55, layers: 3, gap: 130, grid: 10, time: 80 },
    meteor: { every: 0.9, warn: 1.4, blast: 58, time: 60, shrink: 2.6 },
    sumo: { time: 55, shrink: 3.2, minR: 120 },
    koth: { time: 40, zone: 80 },
    rewards: { play: 12, win: 50, per: 1, xpPlay: 30, xpWin: 100 },
  };
  const PALETTE = [['Red', '#ff4a5a'], ['Blue', '#3a8bff'], ['Green', '#3fd08a'], ['Yellow', '#ffd23f'], ['Purple', '#b67cff'], ['Orange', '#ff8a2e']];
  const NAMES = { colorblock: 'Color Block', hexfall: 'Hexfall', meteor: 'Meteor Dodge', sumo: 'Sumo Ring', koth: 'King of the Hill' };
  const HOWTO = { colorblock: 'Stand on the called colour before the floor drops!', hexfall: 'Tiles crumble after you step on them. Keep moving!', meteor: 'Dodge the meteor shadows!', sumo: 'Shove (E) everyone off the ring!', koth: 'Hold the golden hill to score!' };

  const VARIANTS = {
    palooza: { preset: 'day', floor: '#f4f1ff', edge: '#ff5aa8', playlist: 'mix', rounds: 4 },
    color: { preset: 'arena', floor: '#2a3148', edge: '#39f3ff', playlist: ['colorblock', 'colorblock', 'colorblock'], rounds: 3 },
    hexfall: { preset: 'space', floor: '#7cf5ff', edge: '#b67cff', playlist: ['hexfall', 'hexfall', 'hexfall'], rounds: 3 },
    meteor: { preset: 'sunset', floor: '#6a5a4a', edge: '#ff7a2e', playlist: ['meteor', 'meteor', 'meteor'], rounds: 3 },
    sumo: { preset: 'arena', floor: '#e8d8b0', edge: '#e03e3e', playlist: ['sumo', 'koth', 'sumo'], rounds: 3 },
  };

  BF.GameModules.register('party', {
    three: true,
    maxBots: 7,
    feedTop: 0.2,
    orders: ['follow', 'come', 'stay', 'leave', 'attack', 'ally'],
    actions: { jump: ['Space'], shove: ['KeyE', 'ShiftLeft', 'ShiftRight'] },
    controls: { joystick: true, buttons: [{ act: 'jump', label: 'Jump', icon: 'chevronUp' }, { act: 'shove', label: 'Shove', icon: 'bolt' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H, K = BF.arcade;
      const VAR = K.variant(ctx, VARIANTS);
      const V = ctx.g3;
      const rng = U.rng('party:' + ctx.gameId + ':' + Date.now());
      const all = ['colorblock', 'hexfall', 'meteor', 'sumo', 'koth'];
      const playlist = VAR.playlist === 'mix' ? U.shuffle(all.slice(), rng).slice(0, VAR.rounds) : VAR.playlist.slice(0, VAR.rounds);
      const me = { me: true, x: 0, y: 0, h: 0, vh: 0, vx: 0, vy: 0, alive: true, points: 0, rounds: 0, a: 0, shoveT: 0, jumps: 0, outAt: 0, hill: 0 };
      const bots = K.crew(ctx, 7, () => ({ h: 0, vh: 0, vx: 0, vy: 0, points: 0, rounds: 0, shoveT: 0, outAt: 0, hill: 0, react: 0, target: null }));
      const everyone = () => [me].concat(bots);
      let round = -1, game = null, phase = 'intro', introT = 0, roundT = 0, outOrder = [], ended = false;
      // arena state
      const tiles = []; // colorblock / hexfall tiles: {x, y, layer, c, alive, crumble}
      let called = null, cycle = 0, callT = 0, dropT = 0, arenaR = T.radius, meteors = [];

      function placeAll() {
        const list = everyone();
        list.forEach((p, i) => { const a = (i / list.length) * Math.PI * 2; p.x = Math.cos(a) * 150; p.y = Math.sin(a) * 150; p.h = 40; p.vh = 0; p.vx = p.vy = 0; p.alive = true; p.outAt = 0; p.hill = 0; p.react = 0; });
      }
      function buildTiles() {
        tiles.length = 0;
        if (game === 'colorblock') {
          const n = T.grid, s = T.tile;
          for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) tiles.push({ x: (c - n / 2 + 0.5) * s, y: (r - n / 2 + 0.5) * s, layer: 0, c: Math.floor(rng() * PALETTE.length), alive: true, crumble: 0 });
        } else if (game === 'hexfall') {
          const n = T.hex.grid, s = T.tile * 1.15;
          for (let l = 0; l < T.hex.layers; l++) for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) tiles.push({ x: (c - n / 2 + 0.5) * s + (r % 2 ? s / 2 : 0) - s / 4, y: (r - n / 2 + 0.5) * s * 0.9, layer: l, c: l, alive: true, crumble: 0 });
        }
      }
      function nextRound() {
        round++;
        if (round >= playlist.length) return finishParty();
        game = playlist[round];
        phase = 'intro'; introT = 2.4; roundT = 0; outOrder = []; cycle = 0; called = null; callT = T.color.call; dropT = 0; arenaR = T.radius; meteors = [];
        buildTiles();
        placeAll();
        if (view) view.rebuild();
        ctx.banner('Round ' + (round + 1) + ' of ' + playlist.length + ': ' + NAMES[game], HOWTO[game], 2300);
        ctx.sfx('go');
      }
      const tileSize = () => (game === 'hexfall' ? T.tile * 1.15 : T.tile);
      function tileAt(x, y, layer) {
        const s = tileSize() / 2 + 2;
        return tiles.find((t) => t.layer === layer && t.alive && Math.abs(t.x - x) < s && Math.abs(t.y - y) < s) || null;
      }
      /** Height of the floor under (x, y) at or below height h, or null over the void. */
      function floorAt(x, y, h) {
        if (game === 'colorblock') { const t = tileAt(x, y, 0); return t && (!dropT || t.c === called) ? 0 : null; }
        if (game === 'hexfall') {
          for (let l = 0; l < T.hex.layers; l++) { const fy = -l * T.hex.gap; if (fy > h + 2) continue; if (tileAt(x, y, l)) return fy; }
          return null;
        }
        return Math.hypot(x, y) <= arenaR ? 0 : null;
      }
      function eliminate(p, why) {
        if (!p.alive) return;
        p.alive = false; p.outAt = roundT;
        outOrder.push(p);
        if (p === me) { ctx.sfx('lose'); ctx.feed('You are out: ' + why, 'leave', '#ff8b98'); }
        else ctx.feed(p.bot.displayName + ' is out', 'leave', '#ff9d9d');
      }
      function shove(p) {
        if (p.shoveT > 0) return;
        p.shoveT = T.shoveCd;
        for (const o of everyone()) {
          if (o === p || !o.alive) continue;
          const d = Math.hypot(o.x - p.x, o.y - p.y);
          if (d > 62) continue;
          const k = T.shove * (o === me && ctx.hasPass('heavy') ? 0.5 : 1) / Math.max(1, d / 30);
          o.vx += ((o.x - p.x) / (d || 1)) * k; o.vy += ((o.y - p.y) / (d || 1)) * k; o.vh = Math.max(o.vh, 180);
          if (o === me) ctx.sfx('hit');
        }
        if (p === me) ctx.sfx('swing');
        if (view) view.swing(p);
      }
      function endRound() {
        const alive = everyone().filter((p) => p.alive);
        let ranking;
        if (game === 'koth') ranking = everyone().slice().sort((a, b) => b.hill - a.hill);
        else ranking = alive.concat(outOrder.slice().reverse());
        const n = ranking.length;
        ranking.forEach((p, i) => { p.points += n - i; if (i === 0) p.rounds++; if (p.alive && p === me && ctx.hasPass('lucky')) p.points += 1; });
        const winner = ranking[0];
        if (winner === me) { ctx.badge(ctx.gameId + '_round'); ctx.addStat('roundsWon', 1); ctx.sfx('win'); }
        ctx.feed((winner === me ? 'You win' : winner.bot.displayName + ' wins') + ' ' + NAMES[game] + '!', 'star', '#ffd66b');
        if (winner !== me && Math.random() < 0.6) ctx.botSay(winner.bot, 'win');
        phase = 'between'; introT = 2.6;
      }
      function finishParty() {
        if (ended) return;
        ended = true; phase = 'over';
        const table = everyone().slice().sort((a, b) => b.points - a.points);
        const place = table.indexOf(me) + 1;
        ctx.best('bestPoints', me.points);
        if (place === 1) ctx.badge(ctx.gameId + '_win');
        if (me.rounds === playlist.length) ctx.badge(ctx.gameId + '_sweep');
        K.finish(ctx, { win: place === 1, title: place === 1 ? 'Party Champion!' : 'Party over', subtitle: me.points + ' points', score: me.points, place, of: table.length, stats: [['Points', me.points], ['Rounds won', me.rounds + ' / ' + playlist.length], ['Winner', place === 1 ? 'You' : table[0].bot.displayName]], rewards: T.rewards });
      }

      // ------------------------------------------------------------ bot brains
      function botThink(b, dt) {
        const og = K.ordered(ctx, b, me, { near: 45 });
        const o = ctx.botOrder(b.bot.id);
        let tx = b.x, ty = b.y;
        b.react -= dt;
        if (og && (!o || o.verb !== 'attack')) { tx = og.x; ty = og.y; }
        else if (game === 'colorblock') {
          // after a reaction delay (slower for weaker players) walk to the nearest tile of the called colour
          if (called != null && !b.target && b.react <= 0) {
            const wrong = rng() < (1 - b.skill) * 0.28;
            const want = wrong ? (called + 1) % PALETTE.length : called;
            const opts = tiles.filter((t) => t.c === want);
            opts.sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y));
            b.target = opts[0] || null;
          }
          if (b.target) { tx = b.target.x; ty = b.target.y; }
        } else if (game === 'hexfall') {
          const layer = Math.max(0, Math.round(-b.h / T.hex.gap));
          if (!b.target || !b.target.alive || b.target.crumble > 0 || Math.hypot(b.target.x - b.x, b.target.y - b.y) < 12) {
            const near = tiles.filter((t) => t.layer === layer && t.alive && !t.crumble).sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y));
            b.target = near[1 + Math.floor(rng() * Math.min(4, near.length - 1))] || near[0] || null;
          }
          if (b.target) { tx = b.target.x; ty = b.target.y; }
        } else if (game === 'meteor') {
          const threat = meteors.find((m) => !m.hit && Math.hypot(m.x - b.x, m.y - b.y) < T.meteor.blast + 20 && m.t < T.meteor.warn - 0.2 - (1 - b.skill) * 0.8);
          if (threat) { const d = Math.hypot(b.x - threat.x, b.y - threat.y) || 1; tx = b.x + ((b.x - threat.x) / d) * 90; ty = b.y + ((b.y - threat.y) / d) * 90; }
          else if (b.react <= 0) { b.react = 1 + rng() * 2; const a = rng() * Math.PI * 2, r = rng() * arenaR * 0.6; b.target = { x: Math.cos(a) * r, y: Math.sin(a) * r }; }
          if (!threat && b.target) { tx = b.target.x; ty = b.target.y; }
        } else if (game === 'sumo' || game === 'koth') {
          const ally = o && o.verb === 'ally';
          let prey = o && o.verb === 'attack' ? (o.target === 'me' ? me : bots.find((x) => x.bot.id === o.target)) : null;
          if (!prey) prey = everyone().filter((p) => p !== b && p.alive && !(ally && p === me)).sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0];
          if (game === 'koth' && Math.hypot(b.x, b.y) > T.koth.zone * 0.7 && rng() < 0.7) { tx = 0; ty = 0; }
          else if (prey) { tx = prey.x; ty = prey.y; if (Math.hypot(prey.x - b.x, prey.y - b.y) < 55 && rng() < dt * (1 + b.skill * 2)) shove(b); }
          // do not walk off the edge
          const d = Math.hypot(tx, ty);
          if (d > arenaR - 40) { tx *= (arenaR - 40) / d; ty *= (arenaR - 40) / d; }
        }
        K.steer(b, tx, ty, T.botSpeed * (0.8 + b.skill * 0.3), dt);
      }

      // ------------------------------------------------------------ physics
      function physics(p, dt) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        const f = Math.exp(-T.friction * dt); p.vx *= f; p.vy *= f;
        if (p.shoveT > 0) p.shoveT -= dt;
        const floor = floorAt(p.x, p.y, p.h);
        p.vh -= T.gravity * dt;
        p.h += p.vh * dt;
        if (floor != null && p.h <= floor && p.h > floor - 30 && p.vh <= 0) { p.h = floor; p.vh = 0; p.jumps = 0; p.grounded = true; } else p.grounded = false;
        if (game === 'hexfall' && p.grounded) { const t = tileAt(p.x, p.y, Math.round(-p.h / T.hex.gap)); if (t && !t.crumble) t.crumble = T.hex.crumble; }
        const bottom = game === 'hexfall' ? -(T.hex.layers - 1) * T.hex.gap : 0;
        if (p.h < bottom + T.fallOut) {
          if (game === 'koth') { p.h = 60; p.vh = 0; p.vx = p.vy = 0; const a = rng() * Math.PI * 2; p.x = Math.cos(a) * arenaR * 0.8; p.y = Math.sin(a) * arenaR * 0.8; }
          else eliminate(p, game === 'colorblock' ? 'wrong colour' : 'fell off');
        }
      }

      function update(dt) {
        if (phase === 'over') return;
        if (phase === 'intro' || phase === 'between') {
          introT -= dt;
          if (phase === 'between' && introT <= 0) return nextRound();
          if (phase === 'intro' && introT <= 0) phase = 'play';
          for (const p of everyone()) { if (p.alive) physics(p, dt); }
          return;
        }
        roundT += dt;
        // you
        if (me.alive) {
          const sp = T.speed;
          K.move(ctx, me, sp, dt);
          if (ctx.input.actPressed('jump') && (me.grounded || (ctx.hasPass('double_jump') && me.jumps < 1))) { if (!me.grounded) me.jumps++; me.vh = T.jump; ctx.sfx('jump'); }
          if (ctx.input.actPressed('shove')) shove(me);
          physics(me, dt);
        }
        for (const b of bots) if (b.alive) { botThink(b, dt); if (b.grounded && rng() < dt * 0.15) b.vh = T.jump; physics(b, dt); }
        // players who are out keep falling out of sight
        for (const p of everyone()) if (!p.alive && p.h > -900) { p.vh -= T.gravity * dt; p.h += p.vh * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
        // minigame rules
        if (game === 'colorblock') {
          const speedUp = Math.max(T.color.callMin, T.color.call - cycle * 0.3);
          if (dropT > 0) { dropT -= dt; if (dropT <= 0) { tiles.forEach((t) => { t.c = Math.floor(rng() * PALETTE.length); }); called = null; callT = speedUp; cycle++; } }
          else if (called == null) { called = Math.floor(rng() * PALETTE.length); callT = speedUp; bots.forEach((b) => { b.target = null; b.react = 0.2 + (1 - b.skill) * 1.0; }); ctx.sfx('beep'); }
          else { callT -= dt; if (callT <= 0) { dropT = T.color.drop; ctx.sfx('explosion'); } }
          if (cycle >= T.color.cycles) return endRound();
        } else if (game === 'hexfall') {
          for (const t of tiles) if (t.crumble > 0) { t.crumble -= dt; if (t.crumble <= 0) { t.alive = false; t.crumble = 0; } }
          if (roundT > T.hex.time) return endRound();
        } else if (game === 'meteor') {
          arenaR = Math.max(140, T.radius - roundT * T.meteor.shrink);
          if (rng() < dt / Math.max(0.35, T.meteor.every - roundT * 0.008)) {
            const tgt = rng() < 0.35 ? U.pick(everyone().filter((p) => p.alive), rng) : null;
            const a = rng() * Math.PI * 2, r = rng() * arenaR;
            meteors.push({ x: tgt ? tgt.x + (rng() - 0.5) * 40 : Math.cos(a) * r, y: tgt ? tgt.y + (rng() - 0.5) * 40 : Math.sin(a) * r, t: T.meteor.warn, hit: false, id: Math.random() });
          }
          for (const m of meteors) {
            m.t -= dt;
            if (!m.hit && m.t <= 0) {
              m.hit = true; m.age = 0; ctx.sfx('explosion'); if (V) V.shake(4, 0.2);
              for (const p of everyone()) if (p.alive && p.h < 40 && Math.hypot(p.x - m.x, p.y - m.y) < T.meteor.blast) { const d = Math.hypot(p.x - m.x, p.y - m.y) || 1; p.vx += ((p.x - m.x) / d) * 700; p.vy += ((p.y - m.y) / d) * 700; p.vh = 360; eliminate(p, 'hit by a meteor'); }
            }
            if (m.hit) m.age += dt;
          }
          meteors = meteors.filter((m) => !m.hit || m.age < 0.6);
          if (roundT > T.meteor.time) return endRound();
        } else if (game === 'sumo') {
          arenaR = Math.max(T.sumo.minR, T.radius - roundT * T.sumo.shrink);
          if (roundT > T.sumo.time) return endRound();
        } else if (game === 'koth') {
          const inZone = everyone().filter((p) => p.alive && p.grounded && Math.hypot(p.x, p.y) < T.koth.zone);
          for (const p of inZone) p.hill += dt / Math.max(1, inZone.length * 0.8);
          if (roundT > T.koth.time) return endRound();
        }
        const alive = everyone().filter((p) => p.alive);
        if (game !== 'koth' && alive.length <= 1 && roundT > 1) return endRound();
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        V.preset(VAR.preset, { fogNear: 1500, fogFar: 4200 });
        if (VAR.preset === 'space') V.stars(300);
        V.shadowSize(520);
        const deco = V.group();
        // floating backdrop: clouds / asteroids / crowd stands
        const bits = [];
        const r = U.rng('party-deco:' + ctx.gameId);
        for (let i = 0; i < 26; i++) { const a = r() * Math.PI * 2, d = 700 + r() * 700; bits.push({ x: Math.cos(a) * d, y: -200 + r() * 300, z: Math.sin(a) * d, w: 80 + r() * 160, h: 40 + r() * 80, d: 80 + r() * 160, color: VAR.preset === 'space' ? U.shade('#3a3f5a', r() * 0.2) : VAR.preset === 'sunset' ? U.shade('#4a3a30', r() * 0.2) : '#ffffff' }); }
        V.boxes(bits, { parent: deco, shadow: false });
        K.bunting(V, 0, 0, T.radius + 70, ['#ff5aa8', '#ffd23f', '#39f3ff', '#3fd08a', VAR.edge], 60);
        let arena = null, tileMesh = null, disc = null, zone = null;
        const meteorPool = V.pool();
        const m4 = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
        function rebuild() {
          if (arena) { V.remove(arena); arena = null; }
          arena = V.group();
          tileMesh = null; disc = null; zone = null;
          if (game === 'colorblock' || game === 'hexfall') {
            const s = tileSize();
            tileMesh = V.boxes(tiles.map((t) => ({ x: t.x, y: -t.layer * T.hex.gap - 10, z: t.y, w: s - 3, h: 10, d: s - 3, color: game === 'colorblock' ? PALETTE[t.c][1] : ['#7cf5ff', '#b67cff', '#ff5aa8'][t.layer] })), { parent: arena });
          } else {
            disc = V.shape('cyl', 0, -12, 0, 1, 24, 1, VAR.floor, { parent: arena });
            V.shape('cyl', 0, -30, 0, T.radius * 2 + 20, 10, T.radius * 2 + 20, U.shade(VAR.floor, -0.35), { parent: arena, opacity: 0.35, shadow: false });
            if (game === 'koth') { zone = V.shape('cyl', 0, 1, 0, T.koth.zone * 2, 2, T.koth.zone * 2, '#ffd23f', { parent: arena, glow: 0.8, shadow: false }); V.shape('torus', 0, 2, 0, T.koth.zone * 2.1, T.koth.zone * 2.1, 30, '#ffe066', { parent: arena, glow: 1 }).rotation.x = Math.PI / 2; }
            if (game === 'sumo') V.shape('torus', 0, 1, 0, 60, 60, 20, VAR.edge, { parent: arena, glow: 0.5 }).rotation.x = Math.PI / 2;
          }
        }
        function syncTiles() {
          if (!tileMesh) return;
          tiles.forEach((t, i) => {
            const show = t.alive && !(game === 'colorblock' && dropT > 0 && t.c !== called);
            const s = tileSize() - 3;
            const shake = t.crumble > 0 ? (Math.random() - 0.5) * 4 : 0;
            pos.set(t.x + shake, -t.layer * T.hex.gap - 5 - (t.crumble > 0 ? (T.hex.crumble - t.crumble) * 8 : 0), t.y);
            scl.set(show ? s : 0.001, show ? 10 : 0.001, show ? s : 0.001);
            m4.compose(pos, q, scl);
            tileMesh.setMatrixAt(i, m4);
            if (game === 'colorblock') { const c = PALETTE[t.c][1]; col.set(called != null && dropT <= 0 && callT < 1.2 && t.c !== called && Math.sin(ctx.time * 20) > 0 ? U.shade(c, -0.4) : c); tileMesh.setColorAt(i, col); }
            else if (t.crumble > 0) { col.set('#ffffff'); tileMesh.setColorAt(i, col); }
          });
          tileMesh.instanceMatrix.needsUpdate = true;
          if (tileMesh.instanceColor) tileMesh.instanceColor.needsUpdate = true;
        }
        const swingAt = new Map();
        return {
          rebuild,
          swing(p) { const id = p === me ? 'me' : p.bot.id; swingAt.set(id, ctx.time); },
          sync() {
            syncTiles();
            if (disc) disc.scale.set(arenaR * 2, 24, arenaR * 2);
            for (const m of meteors) {
              const g = meteorPool.use(m.id, () => { const g2 = V.group(); g2.userData.shadow = V.shape('disc', 0, 1, 0, 1, 1, 1, '#000000', { parent: g2, opacity: 0.45, shadow: false }); g2.userData.shadow.rotation.x = -Math.PI / 2; g2.userData.rock = V.shape('dodeca', 0, 0, 0, 44, 44, 44, '#5a3a2a', { parent: g2 }); g2.userData.fire = V.shape('sphere', 0, 0, 0, 58, 58, 58, '#ff7a2e', { parent: g2, glow: 1.2, opacity: 0.6, shadow: false }); return g2; });
              g.position.set(m.x, 0, m.y);
              const k = m.hit ? 1 : 1 - m.t / T.meteor.warn;
              g.userData.shadow.scale.set(T.meteor.blast * 2 * (0.3 + 0.7 * k), T.meteor.blast * 2 * (0.3 + 0.7 * k), 1);
              const hgt = m.hit ? 10 : 700 * (1 - k);
              g.userData.rock.position.y = hgt; g.userData.fire.position.y = hgt + 10; g.userData.rock.rotation.x += 0.1;
              g.userData.fire.visible = !m.hit || m.age < 0.3;
              if (m.hit) g.userData.fire.scale.setScalar(58 + m.age * 300);
            }
            meteorPool.sweep();
            for (const p of everyone()) {
              if (!p.alive && p.h < -600) continue;
              const id = p === me ? 'me' : p.bot.id;
              const rig = K.rig(V, ctx, p === me ? 'me' : p, p.x, p.h, p.y, { a: p.a, move: p.moving ? 1 : 0, air: !p.grounded, mode: p.alive ? 'idle' : 'ko', scale: 8 });
              if (swingAt.has(id) && ctx.time - swingAt.get(id) < 0.05) rig.play('attack');
            }
            V.look(me.x * 0.25, -30, me.y * 0.25 + 70, { dist: 760, pitch: 0.95, fov: 45, lerp: 0.06 }, 1 / 60);
            V.sweep();
          },
        };
      })();

      function drawHud(g) {
        const title = game ? 'Round ' + (round + 1) + '/' + playlist.length + ' · ' + NAMES[game] : 'Party';
        let main = HOWTO[game] || '';
        if (game === 'colorblock' && called != null) main = dropT > 0 ? 'DROP!' : PALETTE[called][0] + '!  ' + Math.max(0, callT).toFixed(1) + 's';
        if (game === 'koth') main = 'Hill time ' + me.hill.toFixed(1) + 's';
        K.panel(g, title, main, me.alive ? me.points + ' points' : 'Out this round · ' + me.points + ' points', 300);
        if (game === 'colorblock' && called != null && dropT <= 0) { G.fillRR(g, W / 2 - 90, 62, 180, 46, 12, PALETTE[called][1]); G.text(g, PALETTE[called][0].toUpperCase(), W / 2, 94, { size: 26, weight: 900, align: 'center', color: '#141018' }); }
        const lim = { hexfall: T.hex.time, meteor: T.meteor.time, sumo: T.sumo.time, koth: T.koth.time }[game];
        if (lim && phase === 'play') K.timer(g, W, lim - roundT, 10);
        K.board(g, W, everyone().map((p) => ({ n: p === me ? ctx.player.name : p.bot.displayName, v: p.points, me: p === me, out: !p.alive })), { title: 'Party points' });
        if (phase === 'intro') G.display(g, introT > 0.5 ? String(Math.ceil(introT - 0.5)) : 'GO!', W / 2, H / 2, 80, '#ffffff', 'center');
        else if (round === 0 && roundT < 6) K.hint(g, W, H, 'WASD move · Space jump · E shove');
        if (!me.alive && phase === 'play') K.hint(g, W, H, 'You are out this round. Watch the others fall!', '#ffd66b');
      }

      function draw2d(g) {
        g.fillStyle = '#10141f'; g.fillRect(0, 0, W, H);
        g.save(); g.translate(W / 2, H / 2 + 20); g.scale(0.7, 0.7);
        if (game === 'colorblock' || game === 'hexfall') {
          for (const t of tiles) { if (!t.alive || t.layer !== 0 && game === 'hexfall' && tiles.some((u) => u.layer < t.layer && u.alive && u.x === t.x && u.y === t.y)) continue; const show = !(game === 'colorblock' && dropT > 0 && t.c !== called); if (!show) continue; g.fillStyle = game === 'colorblock' ? PALETTE[t.c][1] : ['#7cf5ff', '#b67cff', '#ff5aa8'][t.layer]; const s = tileSize() - 3; g.fillRect(t.x - s / 2, t.y - s / 2, s, s); }
        } else { G.circle(g, 0, 0, arenaR, VAR.floor); if (game === 'koth') G.circle(g, 0, 0, T.koth.zone, '#ffd23f'); }
        for (const m of meteors) G.circle(g, m.x, m.y, T.meteor.blast * (m.hit ? 1 : 1 - m.t / T.meteor.warn), 'rgba(0,0,0,.4)');
        for (const b of bots) if (b.alive) G.avatarTop(g, b.x, b.y, 12, b.bot.look, b.a, { walk: b.walk });
        if (me.alive) G.avatarTop(g, me.x, me.y, 13, ctx.player.look, me.a, { walk: me.walk || 0 });
        g.restore();
        drawHud(g);
      }

      nextRound();
      return {
        update,
        draw: draw2d,
        render3d() { if (view) view.sync(); },
        hud: drawHud,
        onBotJoin(b) { const e = K.join(bots, b, 7, () => ({ x: 0, y: 0, h: 60, vh: 0, vx: 0, vy: 0, points: 0, rounds: 0, shoveT: 0, outAt: 0, hill: 0, react: 0, target: null }), ctx); if (e && phase === 'play') { e.alive = false; } },
        onBotLeave(b) { K.leave(bots, b); },
        _test: { me, bots, tiles, playlist, get game() { return game; }, get phase() { return phase; }, endRound, nextRound, floorAt, eliminate, finishParty },
      };
    },
  });
})((window.BF = window.BF || {}));
