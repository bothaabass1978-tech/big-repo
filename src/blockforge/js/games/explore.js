/**
 * Treasure Islands (gameType "explore") — top-down island exploration.
 * Dig X-marked treasure, pick up shells and gems, help Captain Marlow find his
 * map pieces, trade shells with the merchant and find the hidden islet.
 * Win: collect the target number of treasures before the tide timer ends.
 * Passes: explorer (treasure markers + sprint), magnet (auto-collect radius).
 * Tool: Golden Shovel (faster digs, more coins).
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  const TS = 32;
  const MW = 100, MH = 64;
  const T = {
    tide: 300, goal: 12, digTime: 1.2, speed: 150, sprint: 1.6, shallow: 0.55, radius: 11,
    digs: 18, pickups: 26, magnet: 120,
    rewards: { dig: [2, 6], pickup: 1, win: 40, play: 12, xpDig: 8, xpWin: 90, xpPlay: 30, marlow: 40, trade: 25 },
  };
  // tiles
  const DEEP = 0, SHALLOW = 1, SAND = 2, GRASS = 3, ROCK = 4, PALM = 5, BRIDGE = 6, BUSH = 7;
  const BLOCKED = new Set([DEEP, ROCK, PALM]);

  const ISLANDS = [
    { id: 'starfall', name: 'Starfall Beach', cx: 16, cy: 32, rx: 12, ry: 9 },
    { id: 'palm', name: 'Palm Cove', cx: 40, cy: 16, rx: 10, ry: 8 },
    { id: 'skull', name: 'Skull Rock', cx: 42, cy: 47, rx: 10, ry: 8, rocky: true },
    { id: 'crystal', name: 'Crystal Isle', cx: 70, cy: 30, rx: 12, ry: 10, crystal: true },
    { id: 'hermit', name: "Hermit's Islet", cx: 91, cy: 56, rx: 5, ry: 4, hidden: true },
  ];

  function buildWorld() {
    const r = U.rng('treasure-islands-map');
    const map = new Uint8Array(MW * MH);
    const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < MW && y < MH) map[y * MW + x] = v; };
    for (const is of ISLANDS) {
      for (let y = is.cy - is.ry - 2; y <= is.cy + is.ry + 2; y++) for (let x = is.cx - is.rx - 2; x <= is.cx + is.rx + 2; x++) {
        const dx = (x - is.cx) / is.rx, dy = (y - is.cy) / is.ry;
        const n = Math.sin(x * 0.9 + is.cx) * 0.08 + Math.cos(y * 1.1 + is.cy) * 0.08;
        const d = Math.sqrt(dx * dx + dy * dy) + n;
        if (d < 1.18 && map[y * MW + x] === DEEP) set(x, y, SHALLOW);
        if (d < 1) set(x, y, SAND);
        if (d < 0.68) set(x, y, GRASS);
      }
    }
    const bridge = (x1, y1, x2, y2) => {
      let x = x1, y = y1;
      while (x !== x2) { if (map[y * MW + x] === DEEP || map[y * MW + x] === SHALLOW) set(x, y, BRIDGE); x += Math.sign(x2 - x); }
      while (y !== y2) { if (map[y * MW + x] === DEEP || map[y * MW + x] === SHALLOW) set(x, y, BRIDGE); y += Math.sign(y2 - y); }
    };
    bridge(24, 26, 32, 16);
    bridge(24, 38, 34, 47);
    bridge(49, 18, 60, 26);
    bridge(51, 45, 62, 36);
    // hidden sandbar: behind bushes on Crystal Isle's south-east shore to the islet
    for (let i = 0; i <= 18; i++) {
      const x = 78 + i, y = 38 + Math.round(i * 0.95);
      if (map[y * MW + x] === DEEP) set(x, y, SHALLOW);
      if (map[(y + 1) * MW + x] === DEEP) set(x, y + 1, SHALLOW);
    }
    set(76, 37, BUSH); set(77, 37, BUSH); set(77, 38, BUSH); set(76, 36, BUSH); set(78, 36, BUSH);
    // secret grotto on Palm Cove behind a bush wall
    for (let x = 35; x <= 39; x++) set(x, 9, BUSH);
    // decorate
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const t = map[y * MW + x];
      const is = ISLANDS.find((i) => Math.abs(x - i.cx) <= i.rx && Math.abs(y - i.cy) <= i.ry);
      if (t === GRASS && r() < 0.07) set(x, y, PALM);
      else if (t === SAND && r() < 0.025) set(x, y, PALM);
      if (is && is.rocky && (t === GRASS || t === SAND) && r() < 0.12) set(x, y, ROCK);
    }
    // keep spawn/NPC areas clear
    const clear = (cx, cy, rad) => { for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) { const t = map[y * MW + x]; if (t === PALM || t === ROCK) set(x, y, GRASS); } };
    clear(16, 32, 3); clear(42, 17, 2); clear(91, 56, 2); clear(70, 30, 2); clear(42, 47, 2); clear(37, 11, 2);
    return map;
  }

  const MAP = buildWorld();
  const tileAt = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH ? DEEP : MAP[y * MW + x]);
  const tileAtPx = (px, py) => tileAt(Math.floor(px / TS), Math.floor(py / TS));

  const CINDER = [
    'Hm. You found the sandbar. Few do.',
    'Five embers, sleeping in five cold halls where no one ever plays.',
    'Wake them with their word, spoken at the hearth beneath the old house.',
    'The house on the hill with the moon behind it. Below its stairs, the furnace still listens.',
    'When it wakes, strike as the core remembers. It never forgets a rhythm.',
    'Now go. The tide does not wait for old men or young treasure hunters.',
  ];

  BF.GameModules.register('explore', {
    three: true,
    maxBots: 6,
    actions: { use: ['KeyE', 'Space', 'Enter'], sprint: ['ShiftLeft', 'ShiftRight'], map: ['KeyM'] },
    controls: { joystick: true, buttons: [{ act: 'use', label: 'Dig / Talk', icon: 'hammer' }, { act: 'sprint', label: 'Sprint', icon: 'run' }, { act: 'map', label: 'Map', icon: 'mapPin' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const V = ctx.g3;
      const parts = V ? V.particles2d(12) : new BF.Particles(400);
      const floats = V ? V.floaters2d(64) : new BF.Floaters();
      const cam = new BF.Camera(W, H);
      cam.bounds = { x: 0, y: 0, w: MW * TS, h: MH * TS };
      const shovel = ctx.hasItem('tool_golden_shovel');
      const d = ctx.data;
      d.marlow = d.marlow || { stage: 0, found: [] };
      d.shells = d.shells || 0;
      let phase = 'play';
      let tide = T.tide;
      let treasures = 0;
      let dig = null;
      let showMap = false;
      let dialog = null;
      let visitedHermit = false;
      const me = { x: 16 * TS, y: 33 * TS, a: 0, walk: 0 };

      function freeLand(r, minD) {
        for (let tries = 0; tries < 400; tries++) {
          const x = Math.floor(r() * MW), y = Math.floor(r() * MH);
          const t = tileAt(x, y);
          if ((t === SAND || t === GRASS) && tileAt(x + 1, y) !== PALM && U.dist(x, y, 16, 32) > (minD || 3)) return { x: x * TS + TS / 2, y: y * TS + TS / 2 };
        }
        return { x: 16 * TS, y: 30 * TS };
      }

      const rs = U.rng(Date.now());
      const digs = [];
      for (let i = 0; i < T.digs; i++) { const p = freeLand(rs, 4); digs.push({ x: p.x, y: p.y, hidden: rs() < 0.45, done: false }); }
      digs.push({ x: 37 * TS + 16, y: 7 * TS + 16, hidden: true, done: false, grotto: true });
      const MAP_PIECES = [{ island: 'palm', x: 45 * TS, y: 20 * TS }, { island: 'skull', x: 38 * TS, y: 51 * TS }, { island: 'crystal', x: 74 * TS, y: 26 * TS }];
      const pickups = [];
      for (let i = 0; i < T.pickups; i++) { const p = freeLand(rs, 2); pickups.push({ x: p.x, y: p.y, kind: rs() < 0.7 ? 'shell' : 'gem', t: rs() * 5 }); }

      const npcs = [
        { id: 'marlow', name: 'Captain Marlow', x: 18 * TS, y: 30 * TS, look: { skin: '#e0ac69', shirt: '#1d4ed8', shirt2: '#f8fafc', pants: '#1f2a44', shoes: '#39414f', hair: '#6b6b6b', hat: '#111827', hatStyle: 'cap' } },
        { id: 'coral', name: 'Coral the Merchant', x: 42 * TS, y: 17 * TS, look: { skin: '#c68642', shirt: '#ff6f61', shirt2: '#ffe66d', pants: '#f59e0b', shoes: '#7a4a2a', hair: '#1f2a44' } },
        { id: 'cinder', name: 'Old Cinder', x: 91 * TS, y: 55 * TS, look: { skin: '#a86b3c', shirt: '#4b3a2a', shirt2: '#ff7a2e', pants: '#2a2f3a', shoes: '#1b1b22', hair: '#d7dde6' } },
        { id: 'pip', name: 'Pip', x: 70 * TS, y: 31 * TS, look: { skin: '#f1c27d', shirt: '#39f3ff', shirt2: '#fff', pants: '#5b6b3a', shoes: '#e8ecf1', hair: '#ff9a3c' } },
        { id: 'moss', name: 'Moss', x: 42 * TS, y: 45 * TS, look: { skin: '#8d5524', shirt: '#4ad17f', shirt2: '#fff', pants: '#2f4a7a', shoes: '#39414f', hair: '#1b1b22' } },
      ];

      const bots = [];
      function addBot(b) {
        const p = freeLand(Math.random, 2);
        bots.push({ bot: b, x: p.x, y: p.y, tx: p.x, ty: p.y, a: 0, walk: 0, t: Math.random() * 3 });
      }
      ctx.bots.forEach(addBot);

      function canWalk(px, py) {
        const r = T.radius;
        for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) if (BLOCKED.has(tileAtPx(px + ox, py + oy))) return false;
        return true;
      }

      function moveEnt(e, vx, vy, dt) {
        const nx = e.x + vx * dt, ny = e.y + vy * dt;
        if (canWalk(nx, e.y)) e.x = nx;
        if (canWalk(e.x, ny)) e.y = ny;
      }

      function say(npc, lines, extra) {
        dialog = { npc, lines, i: 0, extra: extra || null };
        renderDialog();
      }

      function renderDialog() {
        if (!dialog) { ctx.ui.remove('dialog'); return; }
        const line = dialog.lines[dialog.i];
        const last = dialog.i >= dialog.lines.length - 1;
        ctx.ui.panel('dialog', '<div class="dialog-name">' + U.esc(dialog.npc.name) + '</div><p>' + U.esc(line) + '</p><div class="gp-actions">' + (last && dialog.extra ? dialog.extra : '') + '<button class="btn btn-primary btn-sm" data-gact="' + (last ? 'close' : 'next') + '">' + (last ? 'Close' : 'Next') + '</button></div>', 'bottom');
      }

      function talk(npc) {
        ctx.sfx('open');
        if (npc.id === 'marlow') {
          const m = d.marlow;
          if (m.stage === 0) { m.stage = 1; ctx.save(); say(npc, ['Arr, a fresh face! A storm tore my treasure map into three pieces.', 'One blew to Palm Cove, one to Skull Rock and one to Crystal Isle. Look for the torn-paper marks.', 'Bring all three back and there is gold in it for you.']); }
          else if (m.stage === 1 && m.found.length < 3) say(npc, ['Still missing ' + (3 - m.found.length) + ' piece' + (3 - m.found.length > 1 ? 's' : '') + '. Check your map (press M) for the torn-paper marks.']);
          else if (m.stage === 1) {
            m.stage = 2; ctx.save();
            ctx.reward(T.rewards.marlow, 'Captain Marlow');
            ctx.badge('ti_cartographer');
            say(npc, ['You found them all! Here, ' + T.rewards.marlow + ' ForgeCoins, as promised.', 'Now I can finally find the... wait. The map just leads back here. Bah!']);
          } else say(npc, [U.pick(['Fair winds, treasure hunter.', 'The Crystal Isle glitters at night. Worth a look.', 'Some say an old man lives past the edge of the map. Nonsense, surely.'])]);
        } else if (npc.id === 'coral') {
          const extra = d.shells >= 10 ? '<button class="btn btn-gold btn-sm" data-gact="trade">Trade 10 shells for ' + T.rewards.trade + ' FC</button>' : '';
          say(npc, ['Shells! I collect shells. You have ' + d.shells + '.', 'Bring me ten and I will pay ' + T.rewards.trade + ' ForgeCoins for them.'], extra);
        } else if (npc.id === 'cinder') {
          if (!visitedHermit) { visitedHermit = true; ctx.badge('ti_hidden'); }
          say(npc, CINDER);
        } else if (npc.id === 'pip') say(npc, [U.pick(['The crystals hum when the tide is high!', 'I saw someone walk into the sea by those bushes. Into the sea!', 'Dig where the sand sparkles.'])]);
        else say(npc, [U.pick(['Skull Rock gives me the creeps.', 'Try digging near the rocks.', 'The merchant pays well for shells.'])]);
      }

      ctx.ui.on((a) => {
        if (!dialog) return;
        if (a === 'next') { dialog.i++; renderDialog(); }
        if (a === 'close') { dialog = null; renderDialog(); }
        if (a === 'trade' && d.shells >= 10) { d.shells -= 10; ctx.save(); ctx.reward(T.rewards.trade, 'shell trade'); ctx.sfx('purchase'); dialog = null; renderDialog(); ctx.feed('Traded 10 shells with Coral.', 'coin', '#ffd66b'); }
      });

      function finishDig(s) {
        s.done = true;
        treasures++;
        let coins = U.randInt(T.rewards.dig[0], T.rewards.dig[1]) + (shovel ? 2 : 0);
        if (s.grotto) coins += 10;
        ctx.reward(coins, 'treasure digs');
        ctx.xp(T.rewards.xpDig);
        floats.add(s.x, s.y - 20, '+' + coins + ' FC', '#ffd66b', 16);
        parts.emit(s.x, s.y, { count: 20, colors: ['#ffd66b', '#f2a318', '#c8a46a'], speed: 150, life: 0.6 });
        ctx.sfx('purchase');
        ctx.addStat('treasures', 1);
        ctx.playerStat('treasures', 1);
        ctx.quest('treasure', 1);
        ctx.badge('ti_first_dig');
        const roll = Math.random();
        if (s.grotto || roll < 0.02) ctx.collectible('col_moon_pearl');
        else if (roll < 0.07) ctx.collectible('col_doubloon');
        else if (roll < 0.17) ctx.collectible('col_ruby_shell');
        if (s.grotto) ctx.feed('You found the secret grotto chest!', 'star', '#ffd66b');
      }

      function checkMapPieces() {
        if (d.marlow.stage !== 1) return;
        for (const mp of MAP_PIECES) {
          if (d.marlow.found.includes(mp.island)) continue;
          if (U.dist(me.x, me.y, mp.x, mp.y) < 26) {
            d.marlow.found.push(mp.island);
            ctx.save();
            ctx.sfx('powerup');
            ctx.feed('Map piece found (' + d.marlow.found.length + '/3)!', 'star', '#ffd66b');
            floats.add(mp.x, mp.y - 20, 'Map piece!', '#ffd66b', 16);
          }
        }
      }

      function finish(timeUp) {
        phase = 'over';
        dialog = null;
        renderDialog();
        const win = treasures >= T.goal;
        if (win) ctx.best('bestScore', treasures, 'max');
        ctx.end({
          outcome: win ? 'win' : 'lose',
          title: win ? 'Full haul!' : timeUp ? 'The tide came in' : 'Expedition over',
          subtitle: 'Treasures collected: ' + treasures + ' / ' + T.goal,
          coins: T.rewards.play + (win ? T.rewards.win : 0),
          xp: T.rewards.xpPlay + (win ? T.rewards.xpWin : 0),
          stats: [['Treasures', treasures], ['Shells carried', d.shells], ['Map pieces', d.marlow.found.length + '/3'], ['Time left', U.fmtClock(Math.max(0, tide))]],
        });
      }

      function islandAt(px, py) {
        const tx = px / TS, ty = py / TS;
        return ISLANDS.find((i) => Math.hypot((tx - i.cx) / i.rx, (ty - i.cy) / i.ry) < 1.2);
      }
      let lastIsland = null;

      // ----------------------------------------------------------------- 3D

      const LAND_H = { [SAND]: 6, [GRASS]: 10, [PALM]: 10, [BUSH]: 10, [ROCK]: 6, [BRIDGE]: 3, [SHALLOW]: -3, [DEEP]: -30 };
      /** Height of the ground under a game point (feet position in 3D). */
      function groundH(px, py) {
        const t = tileAtPx(px, py);
        return t === SHALLOW ? -4 : t === DEEP ? -8 : LAND_H[t];
      }
      const view = V && (() => {
        V.preset('day', { fogNear: 900, fogFar: 2600 });
        V.shadowSize(460);
        V.ground(-2000, -2000, MW * TS + 2000, MH * TS + 2000, '#0d4f78', { y: -40 });
        const water = V.ground(-2000, -2000, MW * TS + 2000, MH * TS + 2000, '#1c93c7', { y: 0, opacity: 0.72, rough: 0.15, metal: 0.05 });
        water.receiveShadow = false;
        const land = [], shallow = [], decks = [], trunks = [], crowns = [], rocks = [], bushes = [], nuts = [];
        for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
          const t = MAP[y * MW + x];
          const cx = x * TS + TS / 2, cz = y * TS + TS / 2;
          const chk = (x + y) % 2 ? 0.03 : -0.02;
          if (t === SHALLOW) shallow.push({ x: cx, y: -20, z: cz, w: TS, h: 16, d: TS, color: U.shade('#e8cf8a', -0.05 + chk) });
          else if (t === BRIDGE) { shallow.push({ x: cx, y: -30, z: cz, w: TS, h: 10, d: TS, color: '#c9ad6a' }); decks.push({ x: cx, y: 0, z: cz, w: TS - 2, h: 3, d: TS - 2, color: (x + y) % 2 ? '#9a6b3c' : '#8a5e33' }); }
          else if (t !== DEEP) {
            const grassy = t === GRASS || t === PALM || t === BUSH;
            land.push({ x: cx, y: -30, z: cz, w: TS, h: 30 + (grassy ? 10 : 6), d: TS, color: grassy ? U.shade('#5aab52', chk) : U.shade('#ead08a', chk) });
            if (t === PALM) {
              // a ringed trunk with six drooping fronds and coconuts
              for (let k = 0; k < 4; k++) trunks.push({ x: cx + k * 0.8, y: 10 + k * 11, z: cz, w: 7 - k * 0.6, h: 11.5, d: 7 - k * 0.6, color: k % 2 ? '#8b5a2b' : '#9c6a36' });
              for (let k = 0; k < 6; k++) {
                const a = (k / 6) * Math.PI * 2 + x * 0.7;
                crowns.push({ x: cx + 2.4 + Math.cos(a) * 12, y: 51, z: cz - Math.sin(a) * 12, w: 26, h: 2.5, d: 9, color: U.shade('#2fae62', chk * 3 + (k % 2 ? 0.06 : -0.04)), rot: a, rz: -0.38 });
              }
              nuts.push({ x: cx + 5, y: 47, z: cz + 2, w: 6, h: 6, d: 6, color: '#6b4226' }, { x: cx, y: 47, z: cz - 4, w: 6, h: 6, d: 6, color: '#5a3a22' });
            } else if (t === ROCK) rocks.push({ x: cx, y: 4, z: cz, w: 30, h: 24, d: 28, color: U.shade('#7a8494', chk * 2), rot: y });
            else if (t === BUSH) bushes.push({ x: cx, y: 8, z: cz, w: 34, h: 26, d: 34, color: '#2f8f47' });
          }
        }
        V.boxes(land);
        V.boxes(shallow, { shadow: false });
        V.boxes(decks);
        V.boxes(trunks, { geo: 'cylLo' });
        V.boxes(crowns);
        V.boxes(nuts, { geo: 'sphereLo' });
        V.boxes(rocks, { geo: 'dodeca', flat: true });
        V.boxes(bushes, { geo: 'sphereLo' });
        const crystals = [];
        const isC = ISLANDS[3];
        for (let i = 0; i < 8; i++) {
          const cx = (isC.cx - 6 + (i % 4) * 4) * TS, cz = (isC.cy - 4 + Math.floor(i / 4) * 8) * TS;
          crystals.push(V.shape('octa', cx, 34, cz, 18, 40, 18, '#7fe7ff', { glow: 0.8, opacity: 0.9, rough: 0.1, flat: true }));
        }
        const digPool = V.pool(), pickPool = V.pool(), piecePool = V.pool(), npcPool = V.pool();
        const xMark = (hidden) => {
          const g = V.group();
          for (const r of [0.785, -0.785]) { const b = V.box(0, 0, 0, 26, 2, 5, hidden ? '#b08050' : '#7a3b1f', { parent: g, shadow: false }); b.rotation.y = r; }
          return g;
        };
        return function sync(dt) {
          const explorer = ctx.hasPass('explorer');
          V.look(me.x, groundH(me.x, me.y) + 10, me.y, { dist: 470, pitch: 0.84, fov: 45, lerp: 0.12 }, dt);
          crystals.forEach((c, i) => { c.rotation.y += dt * 0.8; c.position.y = 34 + Math.sin(ctx.time * 2 + i) * 4; });
          for (const sp of digs) {
            if (sp.done) continue;
            if (sp.hidden && !explorer) continue;
            const m = digPool.use(sp.hidden ? 'h' + digs.indexOf(sp) : digs.indexOf(sp), () => xMark(sp.hidden));
            m.position.set(sp.x, groundH(sp.x, sp.y) + 1, sp.y);
          }
          digPool.sweep();
          if (d.marlow.stage === 1) for (const mp of MAP_PIECES) if (!d.marlow.found.includes(mp.island)) { const m = piecePool.use(mp.island, () => V.box(0, 0, 0, 18, 3, 14, '#f4ecd0', {})); m.position.set(mp.x, groundH(mp.x, mp.y) + 2 + Math.sin(ctx.time * 3) * 2, mp.y); m.rotation.y = ctx.time; }
          piecePool.sweep();
          for (const p of pickups) {
            const m = pickPool.use(p, () => (p.kind === 'shell' ? V.shape('sphere', 0, 0, 0, 14, 8, 14, '#ffb6c9', { rough: 0.4 }) : V.shape('octa', 0, 0, 0, 12, 18, 12, '#7fe7ff', { glow: 0.6, flat: true })));
            m.position.set(p.x, groundH(p.x, p.y) + 8 + Math.sin(p.t * 3) * 3, p.y);
            m.rotation.y = p.t * 1.5;
          }
          pickPool.sweep();
          for (const n of npcs) {
            const rig = V.actor('npc:' + n.id, n.look, { scale: 8.5 });
            const near = U.dist(n.x, n.y, me.x, me.y) < 160;
            rig.setPos(n.x, groundH(n.x, n.y), n.y);
            rig.faceAngle(near ? U.angleTo(n.x, n.y, me.x, me.y) : Math.PI / 2);
            rig.set({ move: 0 });
            V.label(n.x, groundH(n.x, n.y) + 60, n.y, { name: (U.dist(n.x, n.y, me.x, me.y) < 56 && !dialog ? '[E] ' : '') + n.name, color: '#ffd66b' });
          }
          npcPool.sweep();
          const place = (id, av, e, name, color) => {
            const rig = V.actor(id, av, { scale: 8.5 });
            const gh = groundH(e.x, e.y);
            const moving = e._px != null && dt > 0 ? Math.hypot(e.x - e._px, e.y - e._py) / dt : 0;
            e._px = e.x; e._py = e.y;
            rig.setPos(e.x, gh, e.y);
            rig.faceAngle(e.a);
            rig.set({ move: moving / T.speed, mode: gh < 0 ? 'swim' : 'idle' });
            V.label(e.x, gh + 58, e.y, { name, color, bubble: ctx.bubbleText(id) });
            return rig;
          };
          for (const b of bots) place(b.bot.id, b.bot.avatar, b, b.bot.displayName, '#ffffff');
          const rig = place('me', ctx.player.avatar, me, ctx.player.name, '#ffb454');
          if (rig._tool !== shovel) { rig.hold(shovel ? 'shovel' : null, '#ffc940'); rig._tool = shovel; }
          if (dig) { if (Math.random() < 0.15) rig.play('attack'); V.label(me.x, groundH(me.x, me.y) + 70, me.y, { hp: dig.t / (T.digTime * (shovel ? 0.5 : 1)), hpColor: '#ffd66b' }); }
          V.sweep();
        };
      })();

      return {
        update(dt) {
          parts.update(dt);
          floats.update(dt);
          if (phase !== 'play') return;
          tide -= dt;
          if (tide <= 0) { finish(true); return; }
          const inp = ctx.input;
          const ax = inp.axis();
          let sp = T.speed * (ctx.hasPass('explorer') && inp.act('sprint') ? T.sprint : 1);
          if (tileAtPx(me.x, me.y) === SHALLOW) sp *= T.shallow;
          if (!dialog && !dig) {
            moveEnt(me, ax.x * sp, ax.y * sp, dt);
            if (Math.hypot(ax.x, ax.y) > 0.1) { me.a = Math.atan2(ax.y, ax.x); me.walk += dt * 12; }
          }
          if (dig) {
            dig.t += dt;
            if (Math.hypot(ax.x, ax.y) > 0.3) dig = null;
            else if (dig.t >= T.digTime * (shovel ? 0.5 : 1)) { finishDig(dig.spot); dig = null; }
            else if (Math.random() < 0.3) { parts.emit(dig.spot.x, dig.spot.y, { count: 2, color: '#c8a46a', speed: 80, life: 0.4, gravity: 200 }); ctx.sfx('dig'); }
          }
          if (inp.actPressed('use')) {
            if (dialog) { if (dialog.i < dialog.lines.length - 1) dialog.i++; else dialog = null; renderDialog(); }
            else {
              const npc = npcs.find((n) => U.dist(n.x, n.y, me.x, me.y) < 56);
              if (npc) talk(npc);
              else {
                const spot = digs.find((s) => !s.done && U.dist(s.x, s.y, me.x, me.y) < 34);
                if (spot) { dig = { spot, t: 0 }; spot.hidden = false; }
                else floats.add(me.x, me.y - 26, 'Nothing to dig here', '#cfd6e2', 12);
              }
            }
          }
          if (inp.actPressed('map')) showMap = !showMap;
          // reveal hidden digs nearby
          for (const s of digs) if (s.hidden && U.dist(s.x, s.y, me.x, me.y) < 70) s.hidden = false;
          // pickups
          const magnet = ctx.hasPass('magnet');
          for (let i = pickups.length - 1; i >= 0; i--) {
            const p = pickups[i];
            p.t += dt;
            const dd = U.dist(p.x, p.y, me.x, me.y);
            if (magnet && dd < T.magnet) { const a = U.angleTo(p.x, p.y, me.x, me.y); p.x += Math.cos(a) * 300 * dt; p.y += Math.sin(a) * 300 * dt; }
            if (dd < 20) {
              pickups.splice(i, 1);
              treasures++;
              if (p.kind === 'shell') { d.shells++; ctx.save(); }
              ctx.reward(T.rewards.pickup, 'shells and gems');
              ctx.addStat('treasures', 1);
              ctx.playerStat('treasures', 1);
              ctx.quest('treasure', 1);
              floats.add(p.x, p.y - 16, p.kind === 'shell' ? '+1 shell' : '+gem', p.kind === 'shell' ? '#ffb6c9' : '#8fd3ff', 13);
              ctx.sfx('pickup');
              if (treasures === T.goal) { ctx.banner('GOAL REACHED!', 'Keep hunting or head home', 1800); }
            }
          }
          checkMapPieces();
          const isl = islandAt(me.x, me.y);
          if (isl && isl !== lastIsland) { lastIsland = isl; ctx.banner(isl.name, isl.hidden ? 'A place not on any map' : '', 1400); if (isl.hidden && !visitedHermit) { visitedHermit = true; ctx.badge('ti_hidden'); } }
          // bots wander and sometimes dig
          for (const b of bots) {
            b.t -= dt;
            if (b.t <= 0) {
              b.t = 2 + Math.random() * 4;
              const p = freeLand(Math.random, 0);
              if (U.dist(p.x, p.y, b.x, b.y) < 600) { b.tx = p.x; b.ty = p.y; }
              if (Math.random() < 0.08) ctx.feed(b.bot.displayName + ' dug up a treasure!', 'star', '#ffd66b');
            }
            const dx = b.tx - b.x, dy = b.ty - b.y, l = Math.hypot(dx, dy);
            if (l > 6) { moveEnt(b, (dx / l) * 110, (dy / l) * 110, dt); b.a = Math.atan2(dy, dx); b.walk += dt * 10; }
          }
          if (tide < 30 && Math.floor(tide) !== Math.floor(tide + dt) && Math.floor(tide) % 10 === 0) ctx.banner('Tide rising!', Math.floor(tide) + ' seconds left', 1200);
          cam.follow(me.x, me.y, dt, 0.15);
        },
        draw(g) {
          g.save();
          cam.apply(g);
          const x0 = Math.max(0, Math.floor(cam.x / TS) - 1), y0 = Math.max(0, Math.floor(cam.y / TS) - 1);
          const x1 = Math.min(MW, x0 + Math.ceil(W / TS) + 3), y1 = Math.min(MH, y0 + Math.ceil(H / TS) + 3);
          const t = ctx.time;
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const tile = MAP[y * MW + x];
            const px = x * TS, py = y * TS;
            if (tile === DEEP) { g.fillStyle = '#1582b8'; g.fillRect(px, py, TS, TS); if ((x + y + Math.floor(t * 2)) % 7 === 0) { g.fillStyle = 'rgba(191,243,255,.25)'; g.fillRect(px + 6, py + 12 + Math.sin(t + x) * 3, 14, 2); } }
            else if (tile === SHALLOW) { g.fillStyle = '#35a8cf'; g.fillRect(px, py, TS, TS); }
            else if (tile === BRIDGE) { g.fillStyle = '#1582b8'; g.fillRect(px, py, TS, TS); g.fillStyle = '#9a6b3c'; g.fillRect(px + 2, py + 2, TS - 4, TS - 4); g.fillStyle = '#7a4a2a'; g.fillRect(px + 2, py + 10, TS - 4, 2); g.fillRect(px + 2, py + 20, TS - 4, 2); }
            else {
              g.fillStyle = tile === GRASS || tile === PALM || tile === BUSH ? ((x + y) % 2 ? '#62b35a' : '#5aab52') : (x + y) % 2 ? '#f0d38c' : '#ead08a';
              if (tile === ROCK) g.fillStyle = '#e0c47f';
              g.fillRect(px, py, TS, TS);
            }
          }
          // decor tiles on top
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const tile = MAP[y * MW + x];
            const px = x * TS + TS / 2, py = y * TS + TS / 2;
            if (tile === PALM) { G.circle(g, px + 4, py + 6, 14, 'rgba(0,0,0,.2)'); g.fillStyle = '#8b5a2b'; g.fillRect(px - 3, py - 4, 6, 14); G.circle(g, px, py - 8, 13, '#2fae62'); G.circle(g, px - 5, py - 12, 6, '#4ad17f'); }
            else if (tile === ROCK) { G.fillRR(g, px - 13, py - 10, 26, 22, 7, '#7a8494'); G.fillRR(g, px - 9, py - 10, 14, 8, 4, '#9aa5b5'); }
            else if (tile === BUSH) { G.circle(g, px, py, 15, '#2f8f47'); G.circle(g, px - 6, py - 5, 8, '#3fb35a'); }
          }
          const isCrystal = ISLANDS[3];
          for (let i = 0; i < 8; i++) {
            const cx = (isCrystal.cx - 6 + (i % 4) * 4) * TS, cy = (isCrystal.cy - 4 + Math.floor(i / 4) * 8) * TS;
            if (!cam.visible(cx, cy)) continue;
            g.fillStyle = 'rgba(127,231,255,' + (0.6 + Math.sin(t * 2 + i) * 0.2) + ')';
            g.beginPath(); g.moveTo(cx, cy - 18); g.lineTo(cx + 8, cy); g.lineTo(cx, cy + 6); g.lineTo(cx - 8, cy); g.fill();
          }
          // digs
          const explorer = ctx.hasPass('explorer');
          for (const s of digs) {
            if (s.done || !cam.visible(s.x, s.y)) continue;
            if (s.hidden && !explorer) { if (Math.sin(t * 3 + s.x) > 0.8) G.circle(g, s.x + 4, s.y - 4, 2, '#fff'); continue; }
            g.strokeStyle = s.hidden ? 'rgba(122,74,42,.45)' : '#7a3b1f';
            g.lineWidth = 4;
            g.beginPath(); g.moveTo(s.x - 9, s.y - 9); g.lineTo(s.x + 9, s.y + 9); g.moveTo(s.x + 9, s.y - 9); g.lineTo(s.x - 9, s.y + 9); g.stroke();
          }
          if (d.marlow.stage === 1) for (const mp of MAP_PIECES) if (!d.marlow.found.includes(mp.island)) { G.fillRR(g, mp.x - 9, mp.y - 7, 18, 14, 2, '#f4ecd0'); g.strokeStyle = '#8b5a2b'; g.lineWidth = 1.5; g.strokeRect(mp.x - 9, mp.y - 7, 18, 14); }
          for (const p of pickups) {
            if (!cam.visible(p.x, p.y)) continue;
            const bob = Math.sin(p.t * 3) * 2;
            if (p.kind === 'shell') { G.circle(g, p.x, p.y + bob, 7, '#ffb6c9'); G.circle(g, p.x - 2, p.y - 2 + bob, 3, '#fff'); }
            else { g.fillStyle = '#7fe7ff'; g.beginPath(); g.moveTo(p.x, p.y - 8 + bob); g.lineTo(p.x + 6, p.y + bob); g.lineTo(p.x, p.y + 7 + bob); g.lineTo(p.x - 6, p.y + bob); g.fill(); }
          }
          for (const n of npcs) {
            if (!cam.visible(n.x, n.y)) continue;
            G.avatarTop(g, n.x, n.y, T.radius, n.look, Math.PI / 2);
            G.nameTag(g, n.x, n.y - 16, n.name, '#ffd66b');
            if (U.dist(n.x, n.y, me.x, me.y) < 56 && !dialog) G.text(g, 'E', n.x + 20, n.y - 30, { size: 12, color: '#0b0e13', align: 'center', weight: 900, stroke: '#ffd66b', strokeW: 8 });
          }
          for (const b of bots) {
            if (!cam.visible(b.x, b.y)) continue;
            G.avatarTop(g, b.x, b.y, T.radius, b.bot.look, b.a, { walk: b.walk });
            G.nameTag(g, b.x, b.y - 16, b.bot.displayName, '#fff');
            const bt = ctx.bubbleText(b.bot.id);
            if (bt) G.bubble(g, b.x, b.y - 34, bt);
          }
          G.avatarTop(g, me.x, me.y, T.radius, ctx.player.look, me.a, { walk: me.walk });
          G.nameTag(g, me.x, me.y - 16, ctx.player.name, '#ffb454');
          const mb = ctx.bubbleText('me');
          if (mb) G.bubble(g, me.x, me.y - 34, mb);
          if (dig) G.bar(g, me.x - 22, me.y + 18, 44, 6, dig.t / (T.digTime * (shovel ? 0.5 : 1)), '#ffd66b');
          parts.draw(g);
          floats.draw(g);
          g.restore();
          drawHud(g);
        },
        render3d(dt) { view(dt); },
        hud(g) { drawHud(g); },
        onBotJoin(b) { addBot(b); },
        onBotLeave(b) { const i = bots.findIndex((x) => x.bot.id === b.id); if (i >= 0) bots.splice(i, 1); },
      };

      function drawHud(g) {
          const explorer = ctx.hasPass('explorer');
          G.panel(g, 10, 10, 238, 74);
          G.text(g, 'Treasures', 22, 32, { size: 12, color: '#a1abbb' });
          G.text(g, treasures + ' / ' + T.goal, 22, 58, { size: 24, weight: 800, color: treasures >= T.goal ? '#3fd08a' : '#fff' });
          G.text(g, 'Tide in', 236, 32, { size: 12, color: '#a1abbb', align: 'right' });
          G.text(g, U.fmtClock(tide), 236, 58, { size: 24, weight: 800, align: 'right', color: tide < 30 ? '#ff8b98' : '#8fd3ff' });
          G.text(g, 'Shells ' + d.shells + (shovel ? ' · Golden Shovel' : '') + (d.marlow.stage === 1 ? ' · Map ' + d.marlow.found.length + '/3' : ''), 22, 78, { size: 11, color: '#cfd6e2' });
          // minimap / big map
          const big = showMap;
          const mw = big ? 600 : 160, mh = big ? 384 : 102, mx = big ? (W - mw) / 2 : W - mw - 10, my = big ? (H - mh) / 2 : 10;
          G.panel(g, mx - 4, my - 4, mw + 8, mh + 8, 0.8);
          const sx = mw / (MW * TS), sy = mh / (MH * TS);
          for (let y = 0; y < MH; y += big ? 1 : 2) for (let x = 0; x < MW; x += big ? 1 : 2) {
            const tile = MAP[y * MW + x];
            if (tile === DEEP) continue;
            const isl = ISLANDS[4];
            if (!visitedHermit && Math.hypot((x - isl.cx) / isl.rx, (y - isl.cy) / isl.ry) < 1.3 && !big) continue;
            g.fillStyle = tile === SHALLOW ? '#35a8cf' : tile === BRIDGE ? '#9a6b3c' : tile === GRASS || tile === PALM || tile === BUSH ? '#5aab52' : '#ead08a';
            g.fillRect(mx + x * TS * sx, my + y * TS * sy, Math.ceil(TS * sx * (big ? 1 : 2)), Math.ceil(TS * sy * (big ? 1 : 2)));
          }
          if (explorer) for (const s of digs) if (!s.done) G.circle(g, mx + s.x * sx, my + s.y * sy, big ? 4 : 2, '#ff5a1f');
          if (d.marlow.stage === 1) for (const mp of MAP_PIECES) if (!d.marlow.found.includes(mp.island)) G.fillRR(g, mx + mp.x * sx - 4, my + mp.y * sy - 3, 8, 6, 1, '#f4ecd0');
          for (const n of npcs) if (n.id !== 'cinder' || visitedHermit) G.circle(g, mx + n.x * sx, my + n.y * sy, big ? 4 : 2, '#ffd66b');
          G.circle(g, mx + me.x * sx, my + me.y * sy, big ? 5 : 3, '#ffffff');
          if (big) {
            ISLANDS.forEach((i) => { if (!i.hidden || visitedHermit) G.text(g, i.name, mx + i.cx * TS * sx, my + (i.cy - i.ry - 1) * TS * sy, { size: 12, align: 'center', color: '#fff', stroke: 'rgba(0,0,0,.6)' }); });
            G.text(g, 'Press M to close' + (explorer ? ' · orange = buried treasure (Explorer Pack)' : ''), W / 2, my + mh + 20, { size: 12, align: 'center', color: '#cfd6e2' });
          }
      }
    },
  });
})((window.BF = window.BF || {}));
