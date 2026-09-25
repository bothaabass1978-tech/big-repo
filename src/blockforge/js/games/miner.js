/**
 * Mega Miners (gameType "miner") — side-view dig-down mining simulator.
 * Mine through dirt, stone, coal, iron, gold, ruby and diamond bands. Your
 * pickaxe's power decides what you can break and how fast; your backpack
 * decides how much ore you can carry. Sell on the surface, upgrade and dig
 * to the Core at 250 m. Lava pockets hurt. Upgrades and cash are saved.
 * Win: touch the Core before the session ends. Lose: time runs out.
 * Passes: mega_pack (x2 capacity), drill (+50% mining speed).
 * Store: Titan Pickaxe item (tool_titan_pickaxe, power 12).
 * Creator "Simulator" template games use config.seed / config.difficulty.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  const TS = 32, COLS = 40, SURF = 7, CORE = 250, ROWS = SURF + CORE + 6;
  const AIR = 0, DIRT = 1, STONE = 2, COAL = 3, IRON = 4, GOLD = 5, RUBY = 6, DIAMOND = 7, COREROCK = 8, BEDROCK = 9, LAVA = 10, COREGEM = 11, GRASS = 12;
  const TILES = {
    [DIRT]: { name: 'Dirt', hard: 1, color: '#8b5a2b', dark: '#6b4220' },
    [GRASS]: { name: 'Grass', hard: 1, color: '#4ab35a', dark: '#8b5a2b' },
    [STONE]: { name: 'Stone', hard: 2, color: '#6a707c', dark: '#50555f' },
    [COAL]: { name: 'Coal', hard: 2.5, color: '#6a707c', ore: '#1b1b22', value: 5 },
    [IRON]: { name: 'Iron', hard: 4, color: '#6a707c', ore: '#d9a066', value: 15 },
    [GOLD]: { name: 'Gold', hard: 6, color: '#5a5a66', ore: '#ffd66b', value: 45 },
    [RUBY]: { name: 'Ruby', hard: 9, color: '#4a4452', ore: '#ff3d5a', value: 120 },
    [DIAMOND]: { name: 'Diamond', hard: 14, color: '#3a3848', ore: '#7fe7ff', value: 350 },
    [COREROCK]: { name: 'Core Rock', hard: 20, color: '#4a2a2a', dark: '#3a1f1f' },
    [BEDROCK]: { name: 'Bedrock', hard: Infinity, color: '#1b1b22', dark: '#111116' },
    [COREGEM]: { name: 'The Core', hard: Infinity, color: '#ff7a2e' },
  };
  const PICKS = [
    { name: 'Wooden Pickaxe', power: 1, price: 0 },
    { name: 'Stone Pickaxe', power: 2, price: 150 },
    { name: 'Iron Pickaxe', power: 4, price: 800 },
    { name: 'Steel Pickaxe', power: 7, price: 3500 },
    { name: 'Titan Pickaxe', power: 12, price: 12000 },
    { name: 'Plasma Pickaxe', power: 18, price: 40000 },
    { name: 'Core Drill', power: 26, price: 120000 },
  ];
  const PACKS = [
    { name: 'Pouch', cap: 20, price: 0 },
    { name: 'Sack', cap: 50, price: 100 },
    { name: 'Backpack', cap: 120, price: 600 },
    { name: 'Big Pack', cap: 300, price: 2500 },
    { name: 'Mega Pack', cap: 800, price: 9000 },
    { name: 'Titan Pack', cap: 2000, price: 30000 },
  ];
  const ZONE_NAMES = [[0, 'Topsoil'], [25, 'Stone Layer'], [45, 'Iron Caverns'], [95, 'Gold Veins'], [145, 'Ruby Depths'], [195, 'Diamond Deep'], [240, 'The Core']];
  const T = {
    session: 480, gravity: 1500, jump: 470, speed: 150, mineBase: 0.34, minFactor: 3, hp: 100, lava: 45,
    rewards: { play: 15, win: 150, perSell: 200, maxSell: 30, xpPlay: 30, xpWin: 200, xpDepth: 2 },
  };

  function genWorld(seed, hardK) {
    const r = U.rng(seed);
    const map = new Uint8Array(COLS * ROWS);
    const set = (x, y, v) => { if (x > 0 && x < COLS - 1 && y > SURF && y < ROWS) map[y * COLS + x] = v; };
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const depth = y - SURF;
      let t = AIR;
      if (depth === 0) t = GRASS;
      else if (depth > 0) t = depth < 25 ? DIRT : depth >= 240 ? COREROCK : STONE;
      if (depth > 0 && (x === 0 || x === COLS - 1)) t = BEDROCK;
      if (y >= ROWS - 3) t = BEDROCK;
      map[y * COLS + x] = t;
    }
    const vein = (type, count, d0, d1, len) => {
      for (let i = 0; i < count; i++) {
        let x = 1 + Math.floor(r() * (COLS - 2)), y = SURF + d0 + Math.floor(r() * (d1 - d0));
        for (let k = 0; k < len; k++) { set(x, y, type); x += Math.floor(r() * 3) - 1; y += Math.floor(r() * 3) - 1; }
      }
    };
    vein(COAL, 70, 3, 80, 5);
    vein(IRON, 60, 40, 140, 4);
    vein(GOLD, 45, 90, 190, 4);
    vein(RUBY, 38, 140, 240, 3);
    vein(DIAMOND, 30, 190, 245, 3);
    // caves
    for (let i = 0; i < 30; i++) { let x = 2 + Math.floor(r() * (COLS - 4)), y = SURF + 30 + Math.floor(r() * 200); for (let k = 0; k < 14; k++) { set(x, y, AIR); x += Math.floor(r() * 3) - 1; y += Math.floor(r() * 3) - 1; } }
    // lava pockets
    for (let i = 0; i < 26; i++) { let x = 2 + Math.floor(r() * (COLS - 4)), y = SURF + 100 + Math.floor(r() * 140); for (let k = 0; k < 6; k++) { set(x, y, LAVA); x += Math.floor(r() * 3) - 1; y += r() < 0.5 ? 0 : 1; } }
    // the Core
    const cy = SURF + CORE, cx = Math.floor(COLS / 2);
    for (let y = cy - 3; y <= cy + 2; y++) for (let x = cx - 4; x <= cx + 4; x++) set(x, y, COREROCK);
    for (let y = cy; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) set(x, y, COREGEM);
    return { map, hardK: hardK || 1, core: { x: (cx + 0.5) * TS, y: (cy + 1) * TS } };
  }

  BF.GameModules.register('miner', {
    three: true,
    maxBots: 6,
    feedTop: 0.2,
    actions: { jump: ['Space', 'KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], recall: ['KeyR'], use: ['KeyE'] },
    controls: { joystick: true, buttons: [{ act: 'jump', label: 'Jump', icon: 'chevronUp' }, { act: 'down', label: 'Dig down', icon: 'chevronDown' }, { act: 'recall', label: 'Surface', icon: 'home' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const V = ctx.g3;
      // side view in 3D: X = x, Y = -y, the rock face sits on Z = 0
      const parts = V ? V.particles2d(0, (x, y) => [x, -y, 20]) : new BF.Particles(500);
      const floats = V ? V.floaters2d(0, (x, y) => [x, -y, 26]) : new BF.Floaters();
      const cam = new BF.Camera(W, H);
      cam.bounds = { x: 0, y: -260, w: COLS * TS, h: ROWS * TS + 260 };
      let mapVer = 0;
      const custom = !!ctx.config.custom;
      const diffK = custom ? { easy: 0.8, normal: 1, hard: 1.25 }[ctx.difficulty] || 1 : 1;
      const world = genWorld(custom ? 'miner:' + (ctx.config.seed || 9) : 'mega-miners:' + Math.floor(Date.now() / 1000), diffK);
      const map = world.map;
      const d = ctx.data;
      d.pick = d.pick || 0;
      d.pack = d.pack || 0;
      d.cash = d.cash || 0;
      if (ctx.hasItem('tool_titan_pickaxe') && d.pick < 4) d.pick = 4;
      ctx.save();
      const packCap = () => PACKS[d.pack].cap * (ctx.hasPass('mega_pack') ? 2 : 1);
      const power = () => PICKS[d.pick].power;
      const tileAt = (x, y) => (x < 0 || x >= COLS ? BEDROCK : y < 0 ? AIR : y >= ROWS ? BEDROCK : map[y * COLS + x]);
      const solid = (t) => t !== AIR && t !== LAVA;
      const SHOP = { x: 5 * TS, y: SURF * TS };

      let phase = 'play';
      let time = 0;
      let panel = false;
      const bag = {}; // tile type -> count
      let bagCount = 0, bagValue = 0;
      let mined = 0, sold = 0, deepest = 0;
      let mine = null; // {tx, ty, t, need}
      const me = { x: 12 * TS, y: SURF * TS - 1, vx: 0, vy: 0, w: 20, h: 28, ground: false, facing: 1, walk: 0, hp: T.hp, hurtT: 0 };
      let winT = 0;

      function hardness(t) { return TILES[t] ? TILES[t].hard * (t >= IRON ? world.hardK : 1) : 1; }
      function mineTime(t) { return Math.max(0.07, (hardness(t) / power()) * T.mineBase / (ctx.hasPass('drill') ? 1.5 : 1)); }
      function canMine(t) { return solid(t) && t !== BEDROCK && t !== COREGEM && power() * T.minFactor >= hardness(t); }

      function breakTile(tx, ty) {
        const t = tileAt(tx, ty);
        map[ty * COLS + tx] = AIR;
        mapVer++;
        mined++;
        ctx.addStat('blocks', 1);
        ctx.playerStat('blocksMined', 1);
        ctx.quest('mine', 1);
        const info = TILES[t];
        parts.emit(tx * TS + TS / 2, ty * TS + TS / 2, { count: 10, colors: [info.color, info.ore || info.dark || '#ffffff'], speed: 120, life: 0.45, gravity: 400 });
        ctx.sfx('mine', { volume: 0.35 });
        if (info.value) {
          if (bagCount >= packCap()) { floats.add(me.x, me.y - 40, 'Backpack full! Sell on the surface (R)', '#ff8b98', 13); ctx.sfx('error', { volume: 0.4 }); return; }
          bag[t] = (bag[t] || 0) + 1;
          bagCount++;
          bagValue += info.value;
          floats.add(tx * TS + TS / 2, ty * TS, '+' + info.name, info.ore, 12);
          if (t === DIAMOND) { ctx.badge('mm_diamond'); ctx.feed('You found a diamond!', 'star', '#7fe7ff'); }
          if (bagCount === packCap()) ctx.banner('Backpack full', 'Press R to return to the surface and sell', 1400);
        }
      }
      function recall() {
        me.x = 12 * TS; me.y = SURF * TS - 1; me.vx = 0; me.vy = 0; mine = null;
        parts.emit(me.x, me.y - 14, { count: 20, color: '#8fd3ff', speed: 140, life: 0.5 });
        ctx.sfx('powerup');
      }
      function sell() {
        if (!bagCount) { ctx.toast('Your backpack is empty', 'info'); return; }
        const value = bagValue;
        d.cash += value;
        sold += value;
        for (const k of Object.keys(bag)) delete bag[k];
        bagCount = 0; bagValue = 0;
        ctx.save();
        ctx.sfx('purchase');
        ctx.reward(Math.min(T.rewards.maxSell, Math.max(1, Math.floor(value / T.rewards.perSell))), 'ore sales');
        floats.add(me.x, me.y - 40, '+$' + U.fmt(value), '#4ad17f', 16);
        renderShop();
      }
      function renderShop() {
        if (!panel) return;
        const np = PICKS[d.pick + 1], nb = PACKS[d.pack + 1];
        const ores = Object.keys(bag).map((k) => '<span class="pill"><span class="pw-dot" style="background:' + TILES[k].ore + '"></span>' + bag[k] + ' ' + TILES[k].name.toLowerCase() + '</span>').join(' ');
        ctx.ui.panel('shop', '<button class="btn btn-ghost btn-sm gp-close" data-gact="close" aria-label="Close">' + BF.icon('x', 14) + '</button><h3>' + BF.icon('bag', 18) + ' Miner\'s Outpost</h3><p>Cash <b style="color:#4ad17f">$' + U.fmt(d.cash) + '</b> · Backpack ' + bagCount + ' / ' + packCap() + ' worth <b>$' + U.fmt(bagValue) + '</b></p>' + (ores ? '<div class="gp-row" style="margin:6px 0">' + ores + '</div>' : '') +
          '<div class="gp-grid"><div class="gp-card"><b>' + PICKS[d.pick].name + '</b><small>Power ' + power() + '. Breaks blocks up to hardness ' + power() * T.minFactor + '.</small>' + (np ? '<button class="btn btn-sm btn-gold" data-gact="pick"' + (d.cash >= np.price ? '' : ' disabled') + '>' + np.name + ' · $' + U.fmt(np.price) + '</button>' : '<span class="pill gold">Best pickaxe</span>') + '</div>' +
          '<div class="gp-card"><b>' + PACKS[d.pack].name + '</b><small>Holds ' + packCap() + ' ores' + (ctx.hasPass('mega_pack') ? ' (Mega Backpack x2)' : '') + '.</small>' + (nb ? '<button class="btn btn-sm btn-gold" data-gact="pack"' + (d.cash >= nb.price ? '' : ' disabled') + '>' + nb.name + ' · $' + U.fmt(nb.price) + '</button>' : '<span class="pill gold">Biggest pack</span>') + '</div></div>' +
          '<div class="gp-actions"><button class="btn btn-play" data-gact="sell"' + (bagCount ? '' : ' disabled') + '>' + BF.icon('wallet', 14) + 'Sell all ores</button></div>', 'center');
      }
      ctx.ui.on((a) => {
        if (a === 'close') { panel = false; ctx.ui.remove('shop'); }
        if (a === 'sell') sell();
        if (a === 'pick') { const np = PICKS[d.pick + 1]; if (np && d.cash >= np.price) { d.cash -= np.price; d.pick++; ctx.save(); ctx.sfx('powerup'); ctx.feed('Upgraded to the ' + np.name + '!', 'star', '#ffd66b'); renderShop(); } }
        if (a === 'pack') { const nb = PACKS[d.pack + 1]; if (nb && d.cash >= nb.price) { d.cash -= nb.price; d.pack++; ctx.save(); ctx.sfx('powerup'); ctx.feed('Upgraded to the ' + nb.name + '!', 'star', '#ffd66b'); renderShop(); } }
      });

      function finish(win) {
        if (phase === 'over') return;
        phase = 'over';
        panel = false;
        ctx.ui.remove('shop');
        ctx.best('maxDepth', deepest, 'max');
        if (win) ctx.badge('mm_core');
        ctx.end({
          outcome: win ? 'win' : 'lose',
          title: win ? 'You reached the Core!' : 'Out of time',
          subtitle: 'Deepest point this session: ' + deepest + ' m',
          coins: T.rewards.play + (win ? T.rewards.win : 0),
          xp: T.rewards.xpPlay + deepest * T.rewards.xpDepth / 10 + (win ? T.rewards.xpWin : 0),
          stats: [['Deepest', deepest + ' m'], ['Blocks mined', U.fmt(mined)], ['Ore sold', '$' + U.fmt(sold)], ['Pickaxe', PICKS[d.pick].name]],
          delay: win ? 1600 : 900,
        });
      }

      // ---------------------------------------------------------------- bots
      const bots = [];
      function addBot(b) {
        const r = U.rng(b.id + ':mm');
        const col = 2 + Math.floor(r() * (COLS - 4));
        bots.push({ bot: b, x: col * TS + TS / 2, y: SURF * TS, col, t: 0, maxDepth: 20 + (ctx.botLevel(b) || 10) * 3, found: 0, walk: 0, facing: 1, up: false });
      }
      ctx.bots.forEach(addBot);
      function botStep(bt, dt) {
        bt.t += dt;
        const row = Math.floor(bt.y / TS);
        if (bt.up) { bt.y -= 220 * dt; if (bt.y <= SURF * TS) { bt.y = SURF * TS; bt.up = false; if (Math.random() < 0.4) ctx.feed(bt.bot.displayName + ' sold a haul of ore.', 'coin', '#ffd66b'); } return; }
        if (bt.t > 0.7) {
          bt.t = 0;
          const below = tileAt(bt.col, row);
          if (row - SURF >= bt.maxDepth || below === BEDROCK || below === COREROCK || below === LAVA || below === COREGEM) { bt.up = true; return; }
          if (solid(below)) { const t = below; map[row * COLS + bt.col] = AIR; mapVer++; if (TILES[t].value && t >= GOLD && Math.random() < 0.25) ctx.feed(bt.bot.displayName + ' found ' + (t === DIAMOND ? 'a diamond' : 'some ' + TILES[t].name.toLowerCase()) + '!', 'star', TILES[t].ore); }
          bt.y = (row + 1) * TS;
        }
      }

      // ------------------------------------------------------------- physics
      function collide(axis) {
        const x0 = Math.floor((me.x - me.w / 2) / TS), x1 = Math.floor((me.x + me.w / 2 - 0.01) / TS);
        const y0 = Math.floor((me.y - me.h) / TS), y1 = Math.floor((me.y - 0.01) / TS);
        for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
          if (!solid(tileAt(tx, ty))) continue;
          if (axis === 'x') { if (me.vx > 0) me.x = tx * TS - me.w / 2; else if (me.vx < 0) me.x = (tx + 1) * TS + me.w / 2; me.vx = 0; return true; }
          if (me.vy > 0) { me.y = ty * TS; me.vy = 0; me.ground = true; } else if (me.vy < 0) { me.y = (ty + 1) * TS + me.h; me.vy = 0; }
          return true;
        }
        return false;
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        const CAP = 1400, D = TS;
        const tileMesh = new THREE.InstancedMesh(BF.g3d.geo('box'), V.mat('#ffffff', { rough: 0.9 }), CAP);
        const oreMesh = new THREE.InstancedMesh(BF.g3d.geo('box'), V.mat('#ffffff', { rough: 0.3, metal: 0.3 }), CAP);
        const lavaMesh = new THREE.InstancedMesh(BF.g3d.geo('box'), V.mat('#ff5a1f', { glow: 1.3 }), 300);
        for (const m of [tileMesh, oreMesh, lavaMesh]) { m.frustumCulled = false; m.count = 0; m.receiveShadow = true; V.scene.add(m); }
        tileMesh.castShadow = true;
        V.own(tileMesh); V.own(oreMesh); V.own(lavaMesh);
        const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), c3 = new THREE.Color();
        // back wall behind mined tunnels, sky and scenery above
        V.box(COLS * TS / 2, -ROWS * TS, -D / 2 - 2, COLS * TS, (ROWS - SURF) * TS, 4, '#1b1620', { shadow: false });
        V.ground(-2400, -1600, COLS * TS + 2400, 0, '#4ab35a', { y: -SURF * TS + 0.5 });
        const r = U.rng('mm3d');
        const hills = [], trees = [], crowns = [];
        for (let i = 0; i < 30; i++) hills.push({ x: -900 + r() * (COLS * TS + 1800), y: -SURF * TS - 40, z: -200 - r() * 900, w: 200 + r() * 300, h: 120 + r() * 200, d: 200, color: r() < 0.5 ? '#6fbf5f' : '#5aa84e', rot: r() });
        for (let i = 0; i < 26; i++) { const x = -500 + r() * (COLS * TS + 1000), z = -60 - r() * 300; if (x > 0 && x < COLS * TS && z > -80) continue; trees.push({ x, y: -SURF * TS, z, w: 10, h: 30, d: 10, color: '#7a4a2a' }); crowns.push({ x, y: -SURF * TS + 22, z, w: 50, h: 60, d: 50, color: '#2f9a47' }); }
        V.boxes(hills, { geo: 'sphereLo', shadow: false });
        V.boxes(trees, { geo: 'cylLo' });
        V.boxes(crowns, { geo: 'cone' });
        const shop = V.group(); shop.position.set(SHOP.x, -SURF * TS, 0);
        V.box(0, 0, -30, 120, 70, 60, '#8b5a2b', { parent: shop });
        V.box(0, 70, -30, 132, 14, 70, '#b07a45', { parent: shop });
        V.box(0, 0, 0.5, 28, 36, 2, '#3a2a1e', { parent: shop });
        V.sign("Miner's Outpost", SHOP.x, -SURF * TS + 104, -20, { h: 20 });
        const core = V.shape('octa', world.core.x, -world.core.y, 0, 70, 70, 70, '#ffd66b', { glow: 1.6 });
        const crack = V.box(0, 0, 0, TS, TS, 1, '#000000', { basic: true, opacity: 0.45, shadow: false });
        const lamp = new THREE.PointLight('#ffe9c4', 0, 380, 1.3);
        V.scene.add(lamp);
        let builtVer = -1, builtRow = -999, cave = false;

        function rebuild(row0) {
          builtVer = mapVer; builtRow = row0;
          let n = 0, no = 0, nl = 0;
          for (let y = Math.max(0, row0); y < Math.min(ROWS, row0 + 34); y++) for (let x = 0; x < COLS; x++) {
            const tt = map[y * COLS + x];
            if (tt === AIR) continue;
            const cx = x * TS + TS / 2, cy = -(y * TS + TS / 2);
            if (tt === LAVA) { if (nl < 300) { m4.compose(p3.set(cx, cy, 0), q0, s3.set(TS, TS, D - 4)); lavaMesh.setMatrixAt(nl++, m4); } continue; }
            if (n >= CAP) continue;
            const info = TILES[tt];
            m4.compose(p3.set(cx, cy, 0), q0, s3.set(TS, TS, D));
            tileMesh.setMatrixAt(n, m4);
            tileMesh.setColorAt(n++, c3.set(tt === GRASS ? info.dark : tt === COREGEM ? '#ff7a2e' : U.shade(info.color, ((x * 7 + y * 13) % 5) * 0.02 - 0.04)));
            if (tt === GRASS && no < CAP) { m4.compose(p3.set(cx, cy + TS / 2 - 4, 0), q0, s3.set(TS + 0.5, 9, D + 0.5)); oreMesh.setMatrixAt(no, m4); oreMesh.setColorAt(no++, c3.set(info.color)); }
            if (info.ore) for (const [ox, oy] of [[-6, 5], [6, -2], [-2, -8]]) { if (no >= CAP) break; m4.compose(p3.set(cx + ox, cy + oy, D / 2 + 1), q0, s3.set(7, 7, 4)); oreMesh.setMatrixAt(no, m4); oreMesh.setColorAt(no++, c3.set(info.ore)); }
          }
          tileMesh.count = n; oreMesh.count = no; lavaMesh.count = nl;
          for (const m of [tileMesh, oreMesh]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
          lavaMesh.instanceMatrix.needsUpdate = true;
        }

        return function sync(dt) {
          const t = ctx.time;
          const row0 = Math.floor(me.y / TS) - 16 - (Math.floor(me.y / TS) % 4);
          if (mapVer !== builtVer || row0 !== builtRow) rebuild(row0);
          const depth = Math.max(0, (me.y - SURF * TS) / TS);
          const deep = depth > 5;
          if (deep !== cave) { cave = deep; V.preset(deep ? 'cave' : 'day', { fogNear: deep ? 500 : 1400, fogFar: deep ? 1400 : 4200 }); V.shadowSize(420); }
          lamp.intensity = deep ? 1.6 : 0;
          lamp.position.set(me.x, -me.y + 30, 60);
          V.look(me.x, -me.y + 50, 0, { dist: 480, pitch: 0.12, yaw: -0.22, fov: 45, lerp: 0.14 }, dt);
          lavaMesh.material.emissiveIntensity = 1.1 + Math.sin(t * 4) * 0.3;
          core.rotation.y = t;
          core.scale.setScalar(70 + Math.sin(t * 4) * 6);
          crack.visible = !!mine;
          if (mine) { const k = mine.t / mine.need; crack.position.set(mine.tx * TS + TS / 2, -(mine.ty * TS + TS / 2), D / 2 + 0.8); crack.scale.set(TS * (0.3 + k * 0.7), TS * (0.3 + k * 0.7), 1); }
          const atShop = Math.abs(me.x - SHOP.x) < 70 && me.y <= SURF * TS + 2;
          if (atShop) V.label(SHOP.x, -SURF * TS + 130, -20, { name: '[E] Sell and upgrade', color: '#ffd66b' });
          bots.forEach((bt, i) => {
            if (Math.abs(bt.y - me.y) > 700) return;
            const rig = V.actor(bt.bot.id, bt.bot.avatar, { scale: 5.2 });
            rig.setPos(bt.x, -bt.y, -8 + (i % 3) * 5);
            rig.faceAngle(Math.PI / 2);
            rig.set({ air: bt.up, move: 0 });
            if (!rig._held) { rig.hold('pickaxe', '#9aa5b5'); rig._held = true; }
            if (bt.t < 0.1 && !bt.up) rig.play('attack');
            V.label(bt.x, -bt.y + 38, 0, { name: bt.bot.displayName, color: '#ffffff', bubble: ctx.bubbleText(bt.bot.id) });
          });
          const rig = V.actor('me', ctx.player.avatar, { scale: 5.2 });
          rig.setPos(me.x, -me.y, 4);
          rig.faceAngle(mine && mine.ty > Math.floor((me.y - 1) / TS) ? Math.PI / 2 : me.facing > 0 ? 0.35 : Math.PI - 0.35);
          rig.set({ move: me.ground ? Math.abs(me.vx) / T.speed : 0, air: !me.ground });
          if (rig._pick !== d.pick) { rig.hold('pickaxe', ['#b07a45', '#9aa5b5', '#c9ced8', '#e8ecf3', '#8fd3ff', '#ff4f9a', '#ff7a2e'][d.pick] || '#ffc940'); rig._pick = d.pick; }
          if (mine && Math.floor(t * 5) !== Math.floor((t - dt) * 5)) rig.play('attack');
          rig.group.visible = !(me.hurtT > 0 && Math.sin(t * 40) > 0.5);
          V.label(me.x, -me.y + 40, 0, { name: ctx.player.name, color: '#ffb454', bubble: ctx.bubbleText('me') });
          V.sweep();
        };
      })();

      return {
        update(dt) {
          parts.update(dt);
          floats.update(dt);
          if (phase === 'won') { winT -= dt; if (winT <= 0) finish(true); return; }
          if (phase !== 'play') return;
          time += dt;
          if (time >= T.session) { finish(false); return; }
          const inp = ctx.input;
          const ax = inp.axis();
          bots.forEach((b) => botStep(b, dt));
          if (inp.actPressed('recall')) { recall(); }
          // horizontal
          const want = Math.abs(ax.x) > 0.3 ? Math.sign(ax.x) : 0;
          if (want) me.facing = want;
          me.vx = want * T.speed;
          me.x += me.vx * dt;
          const hitX = collide('x');
          // vertical
          me.vy = Math.min(900, me.vy + T.gravity * dt);
          me.ground = false;
          me.y += me.vy * dt;
          collide('y');
          if (me.ground && inp.actPressed('jump')) { me.vy = -T.jump; ctx.sfx('jump', { volume: 0.4 }); }
          if (me.ground && Math.abs(me.vx) > 1) me.walk += dt * 10;
          // mining target
          const cx = Math.floor(me.x / TS), footRow = Math.floor((me.y + 1) / TS), midRow = Math.floor((me.y - me.h / 2) / TS);
          let target = null;
          if ((inp.act('down') || ax.y > 0.5) && me.ground) target = { tx: cx, ty: footRow };
          else if (want && hitX) target = { tx: Math.floor((me.x + want * (me.w / 2 + 4)) / TS), ty: midRow };
          else if (inp.act('jump') && me.ground && solid(tileAt(cx, Math.floor((me.y - me.h - 2) / TS)))) target = { tx: cx, ty: Math.floor((me.y - me.h - 2) / TS) };
          if (target) {
            const t = tileAt(target.tx, target.ty);
            if (!solid(t)) mine = null;
            else if (!canMine(t)) { mine = null; if (Math.random() < 0.03) floats.add(me.x, me.y - 40, t === BEDROCK ? 'Unbreakable' : 'Too hard! Upgrade your pickaxe', '#ff8b98', 12); }
            else {
              if (!mine || mine.tx !== target.tx || mine.ty !== target.ty) mine = { tx: target.tx, ty: target.ty, t: 0, need: mineTime(t) };
              mine.t += dt;
              if (Math.random() < 0.25) parts.emit(target.tx * TS + TS / 2, target.ty * TS + TS / 2, { count: 1, color: TILES[t].color, speed: 60, life: 0.25 });
              if (mine.t >= mine.need) { breakTile(mine.tx, mine.ty); mine = null; }
            }
          } else mine = null;
          // lava + core
          const bodyTiles = [tileAt(cx, footRow - 1), tileAt(cx, midRow), tileAt(cx, footRow)];
          if (bodyTiles.includes(LAVA) || tileAt(cx, Math.floor(me.y / TS)) === LAVA) {
            me.hp -= T.lava * dt; me.hurtT = 0.2;
            if (Math.random() < 0.2) ctx.sfx('hurt', { volume: 0.3 });
            if (me.hp <= 0) {
              const lost = Math.floor(bagCount / 2);
              let n = lost;
              for (const k of Object.keys(bag)) { while (bag[k] > 0 && n > 0) { bag[k]--; bagCount--; bagValue -= TILES[k].value; n--; } }
              me.hp = T.hp; recall();
              ctx.banner('Burned by lava!', lost ? 'You dropped ' + lost + ' ores' : '', 1600);
            }
          } else if (me.y <= SURF * TS + 2) me.hp = Math.min(T.hp, me.hp + 30 * dt);
          if (me.hurtT > 0) me.hurtT -= dt;
          if (U.dist(me.x, me.y - 14, world.core.x, world.core.y) < 60) {
            phase = 'won'; winT = 1.4;
            ctx.banner('THE CORE!', 'You dug all the way down', 2000);
            ctx.sfx('win');
            parts.emit(world.core.x, world.core.y, { count: 80, colors: ['#ff7a2e', '#ffd66b', '#ffffff'], speed: 320, life: 1.2 });
          }
          const depth = Math.max(0, Math.floor((me.y - SURF * TS) / TS));
          if (depth > deepest) {
            deepest = depth;
            if (deepest >= 100) ctx.badge('mm_depth100');
            if (deepest % 25 === 0) { ctx.best('maxDepth', deepest, 'max'); ctx.feed('New depth: ' + deepest + ' m', 'info', '#8fd3ff'); }
          }
          // shop
          const atShop = Math.abs(me.x - SHOP.x) < 70 && me.y <= SURF * TS + 2;
          if (atShop && inp.actPressed('use')) { panel = true; ctx.sfx('open'); renderShop(); }
          if (panel && !atShop) { panel = false; ctx.ui.remove('shop'); }
          if (inp.pointer.pressed && atShop && !panel) { panel = true; renderShop(); }
          if (time > T.session - 30 && Math.floor(T.session - time) !== Math.floor(T.session - time + dt) && Math.floor(T.session - time) % 10 === 0) ctx.banner(Math.floor(T.session - time) + ' seconds left', '', 1000);
          cam.follow(me.x, me.y - 40, dt, 0.18);
        },

        draw(g) {
          const t = ctx.time;
          const sky = g.createLinearGradient(0, -cam.y - 260, 0, -cam.y + SURF * TS);
          sky.addColorStop(0, '#5fb4ff'); sky.addColorStop(1, '#cfeaff');
          g.fillStyle = '#0b0a0e'; g.fillRect(0, 0, W, H);
          g.save();
          cam.apply(g);
          g.fillStyle = sky; g.fillRect(cam.x, cam.y, W, SURF * TS - cam.y);
          const x0 = Math.max(0, Math.floor(cam.x / TS)), y0 = Math.max(0, Math.floor(cam.y / TS));
          const x1 = Math.min(COLS, x0 + Math.ceil(W / TS) + 2), y1 = Math.min(ROWS, y0 + Math.ceil(H / TS) + 2);
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const tt = map[y * COLS + x];
            const px = x * TS, py = y * TS;
            if (tt === AIR) { if (y > SURF) { g.fillStyle = '#1b1620'; g.fillRect(px, py, TS, TS); } continue; }
            if (tt === LAVA) { g.fillStyle = '#ff5a1f'; g.fillRect(px, py, TS, TS); g.fillStyle = 'rgba(255,214,107,' + (0.4 + Math.sin(t * 4 + x + y) * 0.3) + ')'; g.fillRect(px + 4, py + 6 + Math.sin(t * 3 + x) * 3, TS - 8, 5); continue; }
            const info = TILES[tt];
            if (tt === GRASS) { g.fillStyle = info.dark; g.fillRect(px, py, TS, TS); g.fillStyle = info.color; g.fillRect(px, py, TS, 9); continue; }
            if (tt === COREGEM) { const glow = 0.7 + Math.sin(t * 4) * 0.3; g.fillStyle = 'rgba(255,122,46,' + glow + ')'; g.fillRect(px, py, TS, TS); g.fillStyle = '#ffd66b'; g.fillRect(px + 8, py + 8, TS - 16, TS - 16); continue; }
            g.fillStyle = info.color; g.fillRect(px, py, TS, TS);
            g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(px, py + TS - 3, TS, 3); g.fillRect(px + TS - 3, py, 3, TS);
            if (info.ore) { g.fillStyle = info.ore; const s = (x * 7 + y * 13) % 5; g.fillRect(px + 6 + s, py + 7, 6, 6); g.fillRect(px + 18 - s, py + 16, 7, 6); g.fillRect(px + 9, py + 21 - s, 5, 5); }
            else if (tt === DIRT && (x * 3 + y) % 7 === 0) { g.fillStyle = info.dark; g.fillRect(px + 10, py + 12, 4, 4); }
          }
          if (mine) { const k = mine.t / mine.need; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(mine.tx * TS + 6, mine.ty * TS + 6); g.lineTo(mine.tx * TS + 6 + k * 20, mine.ty * TS + 6 + k * 18); g.moveTo(mine.tx * TS + TS - 6, mine.ty * TS + 8); g.lineTo(mine.tx * TS + TS - 6 - k * 16, mine.ty * TS + 8 + k * 20); g.stroke(); }
          // surface outpost
          G.fillRR(g, SHOP.x - 60, SURF * TS - 70, 120, 70, 6, '#8b5a2b');
          G.fillRR(g, SHOP.x - 66, SURF * TS - 84, 132, 20, 6, '#b07a45');
          G.fillRR(g, SHOP.x - 14, SURF * TS - 36, 28, 36, 3, '#3a2a1e');
          G.text(g, "Miner's Outpost", SHOP.x, SURF * TS - 92, { size: 13, align: 'center', color: '#fff', weight: 800, stroke: 'rgba(0,0,0,.5)', strokeW: 3 });
          if (Math.abs(me.x - SHOP.x) < 70 && me.y <= SURF * TS + 2) G.text(g, 'E  Sell and upgrade', SHOP.x, SURF * TS - 112, { size: 12, align: 'center', color: '#0b0e13', weight: 900, stroke: '#ffd66b', strokeW: 8 });
          for (const bt of bots) {
            if (!cam.visible(bt.x, bt.y)) continue;
            G.avatarSide(g, bt.x, bt.y, 30, bt.bot.look, { facing: bt.facing, walk: 0 });
            G.nameTag(g, bt.x, bt.y - 34, bt.bot.displayName, '#fff');
            const bb = ctx.bubbleText(bt.bot.id);
            if (bb) G.bubble(g, bt.x, bt.y - 54, bb);
          }
          G.avatarSide(g, me.x, me.y, 30, ctx.player.look, { facing: me.facing, walk: me.walk, air: !me.ground, alpha: me.hurtT > 0 ? 0.6 : 1, armAngle: mine ? Math.sin(t * 20) * 0.8 - 0.6 : 0 });
          G.nameTag(g, me.x, me.y - 36, ctx.player.name, '#ffb454');
          const mb = ctx.bubbleText('me');
          if (mb) G.bubble(g, me.x, me.y - 56, mb);
          parts.draw(g);
          floats.draw(g);
          g.restore();
          drawHud(g);
        },

        render3d(dt) { view(dt); },
        hud(g) { drawHud(g); },

        onBotJoin(b) { addBot(b); },
        onBotLeave(b) { const i = bots.findIndex((x) => x.bot.id === b.id); if (i >= 0) bots.splice(i, 1); },
        destroy() { ctx.best('maxDepth', deepest, 'max'); ctx.save(); },
      };

      function drawHud(g) {
          // darkness with headlamp
          const depth = Math.max(0, (me.y - SURF * TS) / TS);
          if (depth > 4) {
            let sx = me.x - cam.x, sy = me.y - 14 - cam.y;
            if (V) { const p = V.toScreen(me.x, -me.y + 16, 0); sx = p.x; sy = p.y; }
            const dark = Math.min(0.88, 0.25 + depth / 160);
            const lamp = g.createRadialGradient(sx, sy, 40, sx, sy, 300);
            lamp.addColorStop(0, 'rgba(0,0,0,0)'); lamp.addColorStop(1, 'rgba(5,4,10,' + dark + ')');
            g.fillStyle = lamp; g.fillRect(0, 0, W, H);
          }
          // HUD
          const zone = ZONE_NAMES.filter((z) => depth >= z[0]).pop()[1];
          G.panel(g, 10, 10, 280, 84);
          G.text(g, Math.floor(depth) + ' m', 22, 40, { size: 24, weight: 800, color: '#8fd3ff' });
          G.text(g, zone, 110, 34, { size: 12, color: '#cfd6e2' });
          G.text(g, 'best ' + Math.max(deepest, ctx.progress().maxDepth || 0) + ' m', 110, 50, { size: 11, color: '#a1abbb' });
          G.text(g, '$' + U.fmt(d.cash), 278, 34, { size: 15, weight: 800, align: 'right', color: '#4ad17f' });
          G.text(g, U.fmtClock(T.session - time), 278, 52, { size: 13, align: 'right', color: '#fff' });
          G.text(g, PICKS[d.pick].name + ' (' + power() + ')', 22, 70, { size: 11, color: '#ffd66b' });
          G.bar(g, 160, 62, 118, 8, bagCount / packCap(), bagCount >= packCap() ? '#ff5a6a' : '#b67cff');
          G.text(g, 'Bag ' + bagCount + '/' + packCap() + ' · $' + U.fmt(bagValue), 160, 86, { size: 10.5, color: '#cfd6e2' });
          G.bar(g, 22, 80, 120, 6, me.hp / T.hp, me.hp < 40 ? '#ff5a6a' : '#3fd08a');
          // depth ruler
          G.panel(g, W - 34, 70, 24, 400, 0.6);
          const k = Math.min(1, depth / CORE);
          G.fillRR(g, W - 29, 76, 14, 388, 6, '#1b1620');
          for (const zn of ZONE_NAMES) { g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(W - 29, 76 + (zn[0] / CORE) * 388, 14, 1); }
          G.circle(g, W - 22, 76 + k * 388, 6, '#ffb454');
          G.circle(g, W - 22, 464, 5, '#ff7a2e');
          G.text(g, 'CORE', W - 22, 486, { size: 9, align: 'center', color: '#ff7a2e', weight: 800 });
      }
    },
  });
})((window.BF = window.BF || {}));
