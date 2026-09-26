/**
 * Spooky (gameType "spooky") — a kid-friendly escape in the dark. Find every
 * item on the list, then reach the exit. The monster patrols the halls; if it
 * sees you it gives chase. Hide in a locker (E) to lose it, sneak (Shift) to
 * stay quiet. Your team (the other players) searches too.
 *
 * Variants (config.variant):
 *   arcade   Nightshift Arcade   a mascot that still walks at night; find the fuses
 *   halls    Hollow Halls        endless yellow halls; find the keycards
 *   cottage  Creaky Cottage      a grumpy ghost that drifts through walls; creaky boards give you away
 *   hotel    Shadow Hotel        flickering lights and a shadow porter; find the keys
 *   frost    Frostbite Station   an arctic base in a blizzard; something big in the snow
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  const T = {
    cols: 23, rows: 15, tile: 56, speed: 190, sneak: 0.55, monster: 150, chase: 235, sight: 250, sneakSight: 120, hearing: 90,
    items: 5, lives: 3, catchR: 24, lose: 3.2, repath: 0.45, creak: 0.1,
    rewards: { play: 12, win: 50, per: 3, xpPlay: 30, xpWin: 100 },
  };

  const VARIANTS = {
    arcade: { floor: '#2a1f3a', wall: '#3a2a5a', trim: '#4a2a6a', neon: '#ff4fd8', item: 'Fuse', itemColor: '#ffd23f', monster: 'mascot', mcol: '#c8742a', light: '#fff0d0', deco: 'cabinet' },
    halls: { floor: '#8a7a3a', wall: '#d8c86a', trim: '#b8a84a', item: 'Keycard', itemColor: '#46a8ff', monster: 'tall', mcol: '#141018', light: '#fffbe0', deco: 'lamp', bright: true },
    cottage: { floor: '#5a3f2a', wall: '#7a5a3a', trim: '#4a3020', item: 'Old Key', itemColor: '#ffc940', monster: 'ghost', mcol: '#e8f4ff', light: '#ffd9a8', deco: 'candle', ghost: true, creaky: true },
    hotel: { floor: '#6a1f2a', wall: '#d8c8a8', trim: '#8a6a3a', item: 'Room Key', itemColor: '#ffe066', monster: 'porter', mcol: '#0a0a14', light: '#ffe8c0', deco: 'door', flicker: true },
    frost: { floor: '#e8f4ff', wall: '#8a9aae', trim: '#46a8ff', item: 'Beacon Part', itemColor: '#ff8a2e', monster: 'yeti', mcol: '#f4faff', light: '#dff4ff', deco: 'heater', snow: true },
  };

  /** A maze with loops and a few open rooms: grid[r][c] = 1 wall, 0 floor. */
  function makeMap(seed) {
    const r = U.rng('spooky:' + seed);
    const g = Array.from({ length: T.rows }, () => Array(T.cols).fill(1));
    const stack = [[1, 1]]; g[1][1] = 0;
    while (stack.length) {
      const [y, x] = stack[stack.length - 1];
      const dirs = U.shuffle([[0, 2], [2, 0], [0, -2], [-2, 0]], r).filter(([dy, dx]) => y + dy > 0 && y + dy < T.rows - 1 && x + dx > 0 && x + dx < T.cols - 1 && g[y + dy][x + dx] === 1);
      if (!dirs.length) { stack.pop(); continue; }
      const [dy, dx] = dirs[0];
      g[y + dy / 2][x + dx / 2] = 0; g[y + dy][x + dx] = 0;
      stack.push([y + dy, x + dx]);
    }
    // loops, so you can run around the monster
    for (let i = 0; i < 38; i++) { const y = 1 + Math.floor(r() * (T.rows - 2)), x = 1 + Math.floor(r() * (T.cols - 2)); if (g[y][x] === 1 && ((g[y - 1][x] === 0 && g[y + 1][x] === 0) || (g[y][x - 1] === 0 && g[y][x + 1] === 0))) g[y][x] = 0; }
    // open rooms
    for (let k = 0; k < 4; k++) { const cy = 3 + Math.floor(r() * (T.rows - 6)), cx = 3 + Math.floor(r() * (T.cols - 6)); for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) g[y][x] = 0; }
    return g;
  }

  BF.GameModules.register('spooky', {
    three: true,
    maxBots: 3,
    feedTop: 0.2,
    orders: ['follow', 'come', 'stay', 'leave', 'help'],
    actions: { use: ['KeyE', 'Space'], sneak: ['ShiftLeft', 'ShiftRight'] },
    controls: { joystick: true, buttons: [{ act: 'use', label: 'Grab / Hide', icon: 'door' }, { act: 'sneak', label: 'Sneak', icon: 'eyeOff' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H, K = BF.arcade;
      const VAR = K.variant(ctx, VARIANTS);
      const V = ctx.g3;
      const S = T.tile;
      const grid = makeMap(ctx.gameId + ':' + Math.floor(Date.now() / 60000));
      const rng = U.rng('spk:' + ctx.gameId + ':' + Date.now());
      const floorTiles = [];
      for (let y = 0; y < T.rows; y++) for (let x = 0; x < T.cols; x++) if (!grid[y][x]) floorTiles.push([x, y]);
      const center = (c) => ({ x: c[0] * S + S / 2, y: c[1] * S + S / 2 });
      const tileOf = (p) => [Math.floor(p.x / S), Math.floor(p.y / S)];
      const wallAt = (x, y) => { const c = Math.floor(x / S), r = Math.floor(y / S); return r < 0 || c < 0 || r >= T.rows || c >= T.cols || grid[r][c] === 1; };
      const blocked = (x, y) => wallAt(x - 11, y - 11) || wallAt(x + 11, y - 11) || wallAt(x - 11, y + 11) || wallAt(x + 11, y + 11);
      const start = center([1, 1]);
      const far = (from, minD) => { for (let i = 0; i < 200; i++) { const t = U.pick(floorTiles, rng), p = center(t); if (Math.hypot(p.x - from.x, p.y - from.y) > minD) return p; } return center(U.pick(floorTiles, rng)); };
      const exitTile = floorTiles.slice().sort((a, b) => (b[0] + b[1]) - (a[0] + a[1]))[0];
      const exit = center(exitTile);
      const items = [];
      for (let i = 0; i < T.items; i++) { const p = far(start, 260); items.push({ x: p.x, y: p.y, taken: false, by: null }); }
      const lockers = [];
      for (let i = 0; i < 12; i++) { const p = far(start, 90); if (!lockers.some((l) => Math.hypot(l.x - p.x, l.y - p.y) < 120)) lockers.push({ x: p.x, y: p.y, who: null }); }
      const creaks = VAR.creaky ? floorTiles.filter(() => rng() < T.creak).map((t) => t[0] + ',' + t[1]) : [];
      const me = { x: start.x, y: start.y, a: 0, walk: 0, lives: T.lives + (ctx.hasPass('extra_life') ? 1 : 0), hidden: null, found: 0, seen: false, spotted: 0, escaped: false };
      const team = K.crew(ctx, 3, (i) => ({ x: start.x + (i + 1) * 12, y: start.y + 20, goal: null, path: [], pathT: 0, hidden: false, escaped: false, downed: 0 }));
      const mon = Object.assign({ a: 0, state: 'patrol', path: [], pathT: 0, target: null, lostT: 0, last: null, stun: 0 }, far(start, 500));
      let phase = 'play', clock = 0, flickerT = 0, lightsOn = true, heard = null;
      ctx.banner(ctx.game.name, 'Find ' + T.items + ' ' + VAR.item.toLowerCase() + 's, then reach the exit', 2600);

      // ------------------------------------------------------------ pathfinding + sight
      function bfs(from, to) {
        const [fx, fy] = tileOf(from), [tx, ty] = tileOf(to);
        if (grid[ty] == null || grid[ty][tx] === 1) return [];
        const key = (x, y) => y * T.cols + x;
        const prev = new Map([[key(fx, fy), -1]]);
        const q = [[fx, fy]];
        while (q.length) {
          const [x, y] = q.shift();
          if (x === tx && y === ty) break;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (ny < 0 || nx < 0 || ny >= T.rows || nx >= T.cols || grid[ny][nx] === 1 || prev.has(key(nx, ny))) continue;
            prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]);
          }
        }
        const out = [];
        let k = key(tx, ty);
        if (!prev.has(k)) return [];
        while (k !== -1) { out.unshift(center([k % T.cols, Math.floor(k / T.cols)])); k = prev.get(k); }
        return out;
      }
      function los(a, b) { const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d / 14); for (let i = 1; i < n; i++) if (wallAt(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n)) return false; return true; }
      function follow(e, sp, dt, ghost) {
        if (!e.path.length) return;
        const p = e.path[0];
        const d = Math.hypot(p.x - e.x, p.y - e.y);
        if (d < 6) { e.path.shift(); return; }
        if (ghost) { e.x += (p.x - e.x) / d * sp * dt; e.y += (p.y - e.y) / d * sp * dt; e.a = Math.atan2(p.y - e.y, p.x - e.x); e.moving = true; }
        else K.steer(e, p.x, p.y, sp, dt, null, blocked);
      }

      function caught(who) {
        if (who === me) {
          me.lives--; ctx.sfx('hurt'); if (V) V.shake(10, 0.5);
          ctx.feed(me.lives > 0 ? 'Caught! Back to the start (' + me.lives + ' lives left)' : 'Caught for good...', 'leave', '#ff8b98');
          if (me.lives <= 0) return end(false);
          me.x = start.x; me.y = start.y; me.hidden = null;
        } else {
          who.downed = 3; who.x = start.x; who.y = start.y; who.path = [];
          ctx.feed(who.bot.displayName + ' was caught!', 'leave', '#ff9d9d');
          if (rng() < 0.6) ctx.botText(who.bot, U.pick(['NOOO it got me', 'RUN', 'it was so fast', 'aaaa']), 300);
        }
        mon.state = 'patrol'; mon.path = []; const p = far(start, 450); mon.x = p.x; mon.y = p.y; mon.stun = 2;
      }
      function end(win) {
        if (phase !== 'play') return;
        phase = 'over';
        const escapedTeam = team.filter((b) => b.escaped).length;
        if (win) { ctx.badge(ctx.gameId + '_escape'); if (!me.seen) ctx.badge(ctx.gameId + '_ghost'); if (team.length && escapedTeam === team.length) ctx.badge(ctx.gameId + '_team'); ctx.best('bestEscape', Math.round(clock * 1000), 'min'); }
        ctx.addStat('found', me.found);
        K.finish(ctx, { win, title: win ? 'You escaped!' : 'Caught', subtitle: items.filter((i) => i.taken).length + ' / ' + T.items + ' ' + VAR.item.toLowerCase() + 's', score: me.found, stats: [['Time', U.fmtClock(clock)], [VAR.item + 's you found', me.found], ['Teammates escaped', escapedTeam + ' / ' + team.length], ['Spotted', me.seen ? 'yes' : 'never']], rewards: T.rewards });
      }
      const allFound = () => items.every((i) => i.taken);

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        V.preset(VAR.snow ? 'night' : 'indoor', { fogNear: 250, fogFar: 900 });
        V.hemi.intensity = VAR.bright ? 0.7 : 0.28; V.sun.intensity = VAR.bright ? 0.6 : 0.2;
        V.shadowSize(400);
        V.gridFloor(0, 0, T.cols * S, T.rows * S, VAR.floor, 'rgba(0,0,0,.18)', S, { check: !VAR.snow });
        const walls = [], trims = [];
        for (let y = 0; y < T.rows; y++) for (let x = 0; x < T.cols; x++) if (grid[y][x]) { walls.push({ x: x * S + S / 2, y: 0, z: y * S + S / 2, w: S, h: 96, d: S, color: U.shade(VAR.wall, ((x * 5 + y * 3) % 5) * 0.02) }); trims.push({ x: x * S + S / 2, y: 96, z: y * S + S / 2, w: S + 1, h: 3, d: S + 1, color: VAR.trim }); }
        V.boxes(walls); V.boxes(trims, { shadow: false });
        // arcade: thin neon strips along the wall tops instead of glowing slabs
        if (VAR.neon) V.boxes(walls.filter((_, i) => i % 3 === 0).map((w) => ({ x: w.x, y: 99, z: w.z, w: S * 0.9, h: 2, d: 4, color: VAR.neon })), { glow: 1, shadow: false });
        for (const l of lockers) { V.box(l.x, 0, l.y, 30, 76, 24, VAR.snow ? '#6a7a8a' : '#5a6478'); V.box(l.x, 40, l.y + 12.5, 22, 2, 1, '#2a2f3a'); }
        for (const c of creaks) { const [cx, cy] = c.split(',').map(Number); V.box(cx * S + S / 2, 0.3, cy * S + S / 2, S - 12, 1, 10, '#3a2718', { shadow: false }); }
        const exitMesh = V.box(exit.x, 0, exit.y, 44, 90, 12, '#ff5a6a', { glow: 0.8 });
        V.sign('EXIT', exit.x, 110, exit.y, { h: 20, color: '#ff8b98' });
        const torch = new THREE.SpotLight(VAR.light, 1200, 520, ctx.hasPass('flashlight') ? 0.62 : 0.45, 0.45, 1.3);
        torch.castShadow = false; V.scene.add(torch); V.scene.add(torch.target);
        const glow = new THREE.PointLight(VAR.light, 60, 160, 1.5); V.scene.add(glow);
        const roomLights = [];
        for (let i = 0; i < 5; i++) { const p = center(U.pick(floorTiles, rng)); const l = new THREE.PointLight(VAR.light, VAR.bright ? 140 : 70, 260, 1.6); l.position.set(p.x, 80, p.y); V.scene.add(l); roomLights.push(l); V.box(p.x, 88, p.y, 16, 4, 16, VAR.light, { glow: 1, shadow: false }); }
        const pool = V.pool();
        function monsterMesh() {
          const g = V.group();
          if (VAR.monster === 'mascot') { V.box(0, 0, 0, 40, 70, 30, VAR.mcol, { parent: g }); V.box(0, 70, 0, 44, 40, 38, VAR.mcol, { parent: g }); for (const s of [-1, 1]) { V.box(s * 16, 108, 0, 12, 14, 8, VAR.mcol, { parent: g }); V.shape('sphere', s * 9, 90, 19, 8, 8, 4, '#ff2a2a', { parent: g, glow: 2 }); } V.box(0, 76, 19, 26, 6, 2, '#1a1a1a', { parent: g }); }
          else if (VAR.monster === 'tall') { V.box(0, 0, 0, 20, 150, 16, VAR.mcol, { parent: g }); V.shape('sphere', 0, 160, 0, 30, 30, 30, VAR.mcol, { parent: g }); for (const s of [-1, 1]) V.shape('sphere', s * 7, 162, 13, 5, 5, 3, '#ffffff', { parent: g, glow: 2 }); }
          else if (VAR.monster === 'ghost') { V.shape('sphere', 0, 60, 0, 50, 70, 46, VAR.mcol, { parent: g, opacity: 0.55, glow: 0.6, shadow: false }); V.shape('cone', 0, 20, 0, 50, 50, 46, VAR.mcol, { parent: g, opacity: 0.45, glow: 0.5, shadow: false }).rotation.x = Math.PI; for (const s of [-1, 1]) V.shape('sphere', s * 10, 70, 20, 8, 10, 4, '#1a1a2a', { parent: g }); }
          else if (VAR.monster === 'porter') { V.box(0, 0, 0, 34, 100, 24, VAR.mcol, { parent: g }); V.box(0, 100, 0, 30, 30, 26, VAR.mcol, { parent: g }); V.box(0, 130, 0, 36, 10, 30, '#8a1a2a', { parent: g }); for (const s of [-1, 1]) V.shape('sphere', s * 7, 116, 13, 5, 5, 3, '#ffe066', { parent: g, glow: 2 }); }
          else { V.box(0, 0, 0, 60, 90, 44, VAR.mcol, { parent: g }); V.box(0, 90, 6, 50, 40, 40, VAR.mcol, { parent: g }); for (const s of [-1, 1]) { V.box(s * 42, 30, 0, 20, 70, 20, VAR.mcol, { parent: g }); V.shape('sphere', s * 10, 110, 26, 7, 7, 3, '#46a8ff', { parent: g, glow: 2 }); } }
          return g;
        }
        const monsterG = monsterMesh();
        return function sync() {
          const t = ctx.time;
          for (const it of items) if (!it.taken) { const m = pool.use('it' + it.x + ',' + it.y, () => V.shape(VAR.item === 'Fuse' ? 'cyl' : 'box', 0, 0, 0, 14, 22, 8, VAR.itemColor, { glow: 1.2 })); m.position.set(it.x, 24 + Math.sin(t * 3 + it.x) * 4, it.y); m.rotation.y = t * 2; }
          exitMesh.material.color.set(allFound() ? '#3fd08a' : '#ff5a6a');
          pool.sweep();
          const hid = !!me.hidden;
          const rig = K.rig(V, ctx, 'me', me.x, 0, me.y, { a: me.a, move: me.moving ? (me.sneaking ? 0.5 : 1) : 0, scale: 8 });
          rig.group.visible = !hid;
          for (const b of team) { if (b.escaped) continue; const r2 = K.rig(V, ctx, b, b.x, 0, b.y, { a: b.a, move: b.moving ? 1 : 0, scale: 7.5, mode: b.downed > 0 ? 'ko' : 'idle' }); r2.group.visible = !b.hidden; }
          monsterG.position.set(mon.x, 0, mon.y); monsterG.rotation.y = Math.PI / 2 - mon.a;
          if (VAR.ghost) monsterG.position.y = 6 + Math.sin(t * 2) * 6;
          const aim = me.a;
          torch.position.set(me.x, 58, me.y); torch.target.position.set(me.x + Math.cos(aim) * 200, 0, me.y + Math.sin(aim) * 200);
          torch.visible = !hid;
          glow.position.set(me.x, 60, me.y);
          if (VAR.flicker) roomLights.forEach((l, i) => { l.intensity = lightsOn && Math.sin(t * 13 + i * 7) > -0.9 ? 70 : 4; });
          if (VAR.snow) for (let i = 0; i < 3; i++) V.fx.emit(me.x + (Math.random() - 0.5) * 600, 220, me.y + (Math.random() - 0.5) * 500, { count: 1, color: '#ffffff', speed: 30, life: 2.4, size: 3, gravity: 60 });
          V.look(me.x, 0, me.y + 30, { dist: 430, pitch: 1.12, fov: 50, lerp: 0.12 }, 1 / 60);
          V.sweep();
        };
      })();

      function drawHud(g) {
        const got = items.filter((i) => i.taken).length;
        K.panel(g, ctx.game.name, got + ' / ' + T.items + ' ' + VAR.item.toLowerCase() + 's', allFound() ? 'EXIT IS OPEN! Go!' : '♥'.repeat(Math.max(0, me.lives)), 270);
        const status = me.hidden ? 'Hiding... (E to leave)' : mon.state === 'chase' && mon.target === me ? 'IT SEES YOU! Hide in a locker!' : me.sneaking ? 'Sneaking' : '';
        if (status) K.hint(g, W, H, status, mon.state === 'chase' && mon.target === me ? '#ff8b98' : '#cfd6e3');
        else if (clock < 8) K.hint(g, W, H, 'WASD move · E grab / hide · Shift sneak');
        else { const nearL = lockers.find((l) => Math.hypot(l.x - me.x, l.y - me.y) < 40); if (nearL) K.hint(g, W, H, 'E: hide in the locker'); }
        // proximity: a heartbeat bar when the monster is near
        const d = Math.hypot(mon.x - me.x, mon.y - me.y);
        if (d < 320) K.meter(g, 22, 106, 160, 1 - d / 320, '#ff5a6a', 'Something is close...');
        K.board(g, W, [{ n: ctx.player.name, v: me.found, me: true }].concat(team.map((b) => ({ n: b.bot.displayName, v: b.found || 0, out: b.escaped }))), { title: VAR.item + 's found' });
      }
      function draw2d(g) {
        g.fillStyle = '#05060a'; g.fillRect(0, 0, W, H);
        const sc = Math.min(W / (T.cols * S), H / (T.rows * S));
        g.save(); g.scale(sc, sc);
        for (let y = 0; y < T.rows; y++) for (let x = 0; x < T.cols; x++) { g.fillStyle = grid[y][x] ? VAR.wall : VAR.floor; g.fillRect(x * S, y * S, S, S); }
        for (const it of items) if (!it.taken) G.circle(g, it.x, it.y, 8, VAR.itemColor);
        g.fillStyle = allFound() ? '#3fd08a' : '#ff5a6a'; g.fillRect(exit.x - 20, exit.y - 20, 40, 40);
        G.circle(g, mon.x, mon.y, 16, '#ff2a2a');
        if (!me.hidden) G.avatarTop(g, me.x, me.y, 14, ctx.player.look, me.a, { walk: me.walk });
        g.restore();
        drawHud(g);
      }

      return {
        update(dt) {
          if (phase !== 'play') return;
          clock += dt;
          const inp = ctx.input;
          me.sneaking = inp.act('sneak');
          // hiding
          if (inp.actPressed('use')) {
            if (me.hidden) { me.hidden.who = null; me.hidden = null; ctx.sfx('open'); }
            else {
              const it = items.find((i) => !i.taken && Math.hypot(i.x - me.x, i.y - me.y) < 36);
              const lk = lockers.find((l) => !l.who && Math.hypot(l.x - me.x, l.y - me.y) < 40);
              if (it) { it.taken = true; it.by = 'me'; me.found++; ctx.sfx('pickup'); ctx.feed('Found a ' + VAR.item.toLowerCase() + '! (' + items.filter((i) => i.taken).length + '/' + T.items + ')', 'star', VAR.itemColor); if (allFound()) { ctx.banner('The exit is open!', 'Get out!', 2000); ctx.sfx('goal'); } }
              else if (lk) { lk.who = me; me.hidden = lk; me.x = lk.x; me.y = lk.y; ctx.sfx('close'); }
            }
          }
          if (!me.hidden) {
            const sp = T.speed * (me.sneaking && !ctx.hasPass('sneakers') ? T.sneak : 1);
            K.move(ctx, me, sp, dt, null, blocked);
            for (const it of items) if (!it.taken && Math.hypot(it.x - me.x, it.y - me.y) < 22) { it.taken = true; it.by = 'me'; me.found++; ctx.sfx('pickup'); ctx.feed('Found a ' + VAR.item.toLowerCase() + '! (' + items.filter((i) => i.taken).length + '/' + T.items + ')', 'star', VAR.itemColor); if (allFound()) { ctx.banner('The exit is open!', 'Get out!', 2000); ctx.sfx('goal'); } }
            if (VAR.creaky && me.moving && !me.sneaking) { const tk = tileOf(me).join(','); if (creaks.includes(tk) && me.lastCreak !== tk) { me.lastCreak = tk; heard = { x: me.x, y: me.y, t: 4 }; ctx.sfx('click'); ctx.feed('*CREAK*', 'warn', '#ffb454'); } }
            if (allFound() && Math.hypot(exit.x - me.x, exit.y - me.y) < 36) { me.escaped = true; ctx.sfx('win'); return end(true); }
          }
          if (heard) { heard.t -= dt; if (heard.t <= 0) heard = null; }
          // team
          for (const b of team) {
            if (b.escaped) continue;
            if (b.downed > 0) { b.downed -= dt; continue; }
            const o = ctx.botOrder(b.bot.id);
            const og = K.ordered(ctx, b, me, { near: 40 });
            b.pathT -= dt;
            if (og && (!o || o.verb !== 'help')) { K.steer(b, og.x, og.y, T.speed * 0.9, dt, null, blocked); continue; }
            const danger = Math.hypot(mon.x - b.x, mon.y - b.y) < 150 && los(mon, b);
            if (danger && !b.hidden) { const lk = lockers.filter((l) => !l.who).sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0]; if (lk && Math.hypot(lk.x - b.x, lk.y - b.y) < 60) { b.hidden = lk; lk.who = b; b.hideT = 3 + rng() * 3; } }
            if (b.hidden) { b.hideT -= dt; if (b.hideT <= 0) { b.hidden.who = null; b.hidden = null; } continue; }
            if (b.pathT <= 0 || !b.path.length) {
              b.pathT = 1.2;
              const goal = allFound() ? exit : (items.filter((i) => !i.taken).sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[o && o.verb === 'help' ? 0 : Math.floor(rng() * 2)] || exit);
              b.path = bfs(b, goal);
            }
            follow(b, T.speed * (0.7 + b.skill * 0.25), dt);
            for (const it of items) if (!it.taken && Math.hypot(it.x - b.x, it.y - b.y) < 22) { it.taken = true; it.by = b.bot.id; b.found = (b.found || 0) + 1; ctx.feed(b.bot.displayName + ' found a ' + VAR.item.toLowerCase() + ' (' + items.filter((i) => i.taken).length + '/' + T.items + ')', 'star', VAR.itemColor); if (allFound()) { ctx.banner('The exit is open!', 'Get out!', 2000); ctx.sfx('goal'); } }
            if (allFound() && Math.hypot(exit.x - b.x, exit.y - b.y) < 36) { b.escaped = true; ctx.feed(b.bot.displayName + ' escaped!', 'star', '#3fd08a'); }
          }
          // the monster
          if (mon.stun > 0) { mon.stun -= dt; return; }
          const targets = [me].concat(team.filter((b) => !b.escaped && b.downed <= 0));
          const visible = targets.filter((p) => !(p === me ? me.hidden : p.hidden) && Math.hypot(p.x - mon.x, p.y - mon.y) < (p === me && me.sneaking ? T.sneakSight : T.sight) * (ctx.hasPass('flashlight') && p === me ? 1.1 : 1) && (VAR.ghost ? Math.hypot(p.x - mon.x, p.y - mon.y) < 170 || los(mon, p) : los(mon, p)));
          const prey = visible.sort((p, q) => Math.hypot(p.x - mon.x, p.y - mon.y) - Math.hypot(q.x - mon.x, q.y - mon.y))[0];
          if (prey) {
            if (mon.state !== 'chase' || mon.target !== prey) { if (prey === me) { me.seen = true; ctx.sfx('beep'); } }
            mon.state = 'chase'; mon.target = prey; mon.last = { x: prey.x, y: prey.y }; mon.lostT = T.lose;
          } else if (mon.state === 'chase') { mon.lostT -= dt; if (mon.lostT <= 0) { mon.state = 'search'; mon.path = bfs(mon, mon.last || mon); } }
          else if (heard && mon.state !== 'chase') { mon.state = 'search'; mon.path = bfs(mon, heard); heard = null; }
          mon.pathT -= dt;
          if (mon.state === 'chase') {
            if (VAR.ghost) { const d = Math.hypot(mon.target.x - mon.x, mon.target.y - mon.y) || 1; mon.x += (mon.target.x - mon.x) / d * T.chase * 0.85 * dt; mon.y += (mon.target.y - mon.y) / d * T.chase * 0.85 * dt; mon.a = Math.atan2(mon.target.y - mon.y, mon.target.x - mon.x); }
            else { if (mon.pathT <= 0) { mon.pathT = T.repath; mon.path = bfs(mon, mon.target); } follow(mon, T.chase, dt); }
            const tg = mon.target;
            if (Math.hypot(tg.x - mon.x, tg.y - mon.y) < T.catchR && !(tg === me ? me.hidden : tg.hidden)) caught(tg);
          } else {
            if (!mon.path.length) { mon.state = 'patrol'; mon.path = bfs(mon, center(U.pick(floorTiles, rng))); }
            follow(mon, T.monster, dt, VAR.ghost);
          }
          if (VAR.flicker) { flickerT -= dt; if (flickerT <= 0) { lightsOn = !lightsOn; flickerT = lightsOn ? 6 + rng() * 8 : 0.8 + rng(); } }
        },
        draw: draw2d,
        render3d() { if (view) view(); },
        hud: drawHud,
        onBotJoin(b) { K.join(team, b, 3, () => ({ x: start.x, y: start.y, goal: null, path: [], pathT: 0, hidden: false, escaped: false, downed: 0 }), ctx); },
        onBotLeave(b) { const e = team.find((x) => x.bot.id === b.id); if (e && e.hidden) e.hidden.who = null; K.leave(team, b); },
        _test: { me, mon, items, team, exit, lockers, grid, bfs, end, get phase() { return phase; } },
      };
    },
  });
})((window.BF = window.BF || {}));
