/**
 * Towerfall Legends (gameType "towerdefense") — grid tower defense.
 * Build and upgrade towers along a road; survive 20 waves with boss waves.
 * Passes: tesla (unlocks the Tesla tower), warchest (+150 starting gold).
 * Allied bots on the server build their own towers. Also the Tower Defense template.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  const TS = 48, COLS = 20, ROWS = 9, TOP = 48; // grid 960x432 between a 48px HUD strip and a 60px build dock
  const T = {
    waves: 20, lives: 20, gold: 180, warchest: 150, between: 9, earlyBonus: 10,
    rewards: { wave: 4, win: 80, play: 10, xpWave: 12, xpWin: 200, xpPlay: 25 },
    sellRate: 0.7,
  };
  const TOWERS = {
    archer: { name: 'Archer', color: '#4ad17f', cost: 60, key: '1', levels: [{ dmg: 12, rate: 0.55, range: 130 }, { cost: 60, dmg: 20, rate: 0.45, range: 138 }, { cost: 100, dmg: 32, rate: 0.35, range: 150 }] },
    cannon: { name: 'Cannon', color: '#ff7a2e', cost: 100, key: '2', levels: [{ dmg: 28, rate: 1.4, range: 115, splash: 55 }, { cost: 90, dmg: 45, rate: 1.3, range: 120, splash: 60 }, { cost: 140, dmg: 70, rate: 1.2, range: 128, splash: 72 }] },
    frost: { name: 'Frost', color: '#7cc6ff', cost: 80, key: '3', levels: [{ dmg: 4, rate: 0.9, range: 110, slow: 0.45 }, { cost: 70, dmg: 6, rate: 0.8, range: 118, slow: 0.55 }, { cost: 110, dmg: 10, rate: 0.7, range: 126, slow: 0.65, area: 50 }] },
    tesla: { name: 'Tesla', color: '#ffd23f', cost: 140, key: '4', pass: 'tesla', levels: [{ dmg: 22, rate: 1.0, range: 125, chain: 3 }, { cost: 120, dmg: 32, rate: 0.9, range: 130, chain: 4 }, { cost: 170, dmg: 45, rate: 0.8, range: 140, chain: 6 }] },
  };
  const ENEMIES = {
    grunt: { hp: 40, speed: 55, gold: 6, color: '#d9384a', size: 11 },
    runner: { hp: 25, speed: 100, gold: 7, color: '#ff9d3c', size: 9 },
    knight: { hp: 95, speed: 48, gold: 11, color: '#9aa5b5', size: 12, armor: true },
    brute: { hp: 150, speed: 36, gold: 15, color: '#7a2f9e', size: 15 },
    boss: { hp: 900, speed: 30, gold: 120, color: '#3fd08a', size: 24, boss: true },
  };
  const MAPS = {
    greenvale: { name: 'Greenvale', grass: '#4f9a45', road: '#d8b878', hp: 1, path: [[-1, 2], [4, 2], [4, 7], [9, 7], [9, 1], [14, 1], [14, 6], [17, 6], [17, 3], [20, 3]] },
    frostpeak: { name: 'Frostpeak', grass: '#cfe3ef', road: '#8fa6b8', hp: 1.3, path: [[-1, 8], [3, 8], [3, 2], [7, 2], [7, 8], [11, 8], [11, 2], [15, 2], [15, 8], [18, 8], [18, 4], [20, 4]] },
  };

  function genPath(seed) {
    const r = U.rng(seed);
    const pts = [[-1, 1 + Math.floor(r() * 8)]];
    let x = 0, y = pts[0][1];
    while (x < COLS - 2) {
      x = Math.min(COLS - 1, x + 2 + Math.floor(r() * 3));
      pts.push([x, y]);
      y = U.clamp(y + (r() < 0.5 ? -1 : 1) * (2 + Math.floor(r() * 4)), 1, ROWS - 2);
      pts.push([x, y]);
    }
    pts.push([COLS, y]);
    return pts;
  }

  BF.tdGenPath = genPath;

  BF.GameModules.register('towerdefense', {
    orders: ['build'],
    three: true,
    maxBots: 2,
    feedTop: 0.1,
    actions: { next: ['Space'], speed: ['KeyF'], t1: ['Digit1'], t2: ['Digit2'], t3: ['Digit3'], t4: ['Digit4'], cancel: ['KeyX'] },
    controls: { joystick: false, buttons: [{ act: 'next', label: 'Next wave', icon: 'play' }, { act: 'speed', label: 'Speed', icon: 'bolt' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const custom = !!ctx.config.custom;
      const diff = { easy: 0.75, normal: 1, hard: 1.3 }[ctx.difficulty] || 1;
      const V = ctx.g3;
      const parts = V ? V.particles2d(16) : new BF.Particles(500);
      const floats = V ? V.floaters2d(60) : new BF.Floaters();
      let mapId = custom ? 'custom' : 'greenvale';
      let map, road = new Set(), path = [];
      let phase = 'lobby';
      let gold = 0, lives = T.lives, wave = 0, betweenT = 0, spawnQ = [], spawnT = 0, speedMul = 1;
      let towers = [], enemies = [], shots = [], bolts = [];
      let selectedType = 'archer', selectedTower = null, hover = null;
      let bossKilled = false;
      const allies = new Map();

      /** A road drawn in the Studio (null when the creation uses its generated road). */
      function studioPath() {
        const lay = ctx.config.layout;
        return lay && lay.kind === 'towerdefense' && BF.studio ? BF.studio.tdPath(lay) : null;
      }
      function setup() {
        map = mapId === 'custom' ? { name: ctx.config.name || 'Custom Valley', grass: U.shade(U.mix('#4f9a45', ctx.config.themeColor || '#4f9a45', 0.3), -0.1), road: '#d8b878', hp: 1, path: studioPath() || genPath(ctx.config.seed || 3) } : MAPS[mapId];
        road = new Set();
        path = map.path.map((p) => ({ x: p[0] * TS + TS / 2, y: TOP + p[1] * TS + TS / 2 }));
        for (let i = 0; i < map.path.length - 1; i++) {
          let [x, y] = map.path[i];
          const [x2, y2] = map.path[i + 1];
          while (x !== x2 || y !== y2) {
            road.add(x + ',' + y);
            if (x !== x2) x += Math.sign(x2 - x); else y += Math.sign(y2 - y);
          }
          road.add(x2 + ',' + y2);
        }
        gold = T.gold + (ctx.hasPass('warchest') ? T.warchest : 0);
        lives = T.lives;
        wave = 0;
        towers = []; enemies = []; shots = []; bolts = [];
        betweenT = 6;
        bossKilled = false;
        ctx.bots.forEach((b) => allies.set(b.id, { bot: b, gold: 120, t: 4 + Math.random() * 6 }));
        phase = 'build';
        ctx.banner(map.name, 'Build towers, then press Space', 1800);
      }

      function buildable(cx, cy) {
        return cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS && !road.has(cx + ',' + cy) && !towers.some((t) => t.cx === cx && t.cy === cy);
      }

      function stat(t) { return TOWERS[t.type].levels[t.level]; }

      function place(type, cx, cy, owner) {
        const def = TOWERS[type];
        const t = { type, cx, cy, x: cx * TS + TS / 2, y: TOP + cy * TS + TS / 2, level: 0, cd: 0, spent: def.cost, owner: owner || null, aim: 0 };
        towers.push(t);
        parts.emit(t.x, t.y, { count: 14, color: '#c8a46a', speed: 100, life: 0.4 });
        return t;
      }

      function startWave() {
        wave++;
        const n = wave;
        spawnQ = [];
        const count = 6 + n * 2;
        for (let i = 0; i < count; i++) {
          let type = 'grunt';
          const r = Math.random();
          if (n >= 3 && r < 0.3) type = 'runner';
          if (n >= 6 && r > 0.75) type = 'knight';
          if (n >= 9 && r > 0.9) type = 'brute';
          spawnQ.push(type);
        }
        if (n % 5 === 0) spawnQ.push('boss');
        spawnT = 0.5;
        phase = 'wave';
        ctx.banner('WAVE ' + wave, n % 5 === 0 ? 'Boss wave!' : count + ' enemies', 1500);
        ctx.sfx(n % 5 === 0 ? 'explosion' : 'go', { vol: 0.5 });
      }

      function spawnEnemy(type) {
        const e = ENEMIES[type];
        const scale = (1 + (wave - 1) * 0.2) * map.hp * diff * (type === 'boss' && wave >= 20 ? 3 : 1);
        enemies.push({ type, hp: e.hp * scale, max: e.hp * scale, speed: e.speed, seg: 0, x: path[0].x, y: path[0].y, slowT: 0, slow: 0, gold: e.gold, boss: !!e.boss, t: Math.random() * 3 });
      }

      function hurt(e, dmg, kind) {
        if (e.hp <= 0) return;
        if (ENEMIES[e.type].armor && kind === 'archer') dmg *= 0.5;
        e.hp -= dmg;
        if (e.hp <= 0) {
          gold += e.gold;
          floats.add(e.x, e.y - 14, '+' + e.gold, '#ffd66b', 13);
          parts.emit(e.x, e.y, { count: e.boss ? 40 : 10, color: ENEMIES[e.type].color, speed: e.boss ? 220 : 120, life: 0.5 });
          ctx.sfx(e.boss ? 'explosion' : 'hit', { vol: 0.4 });
          for (const a of allies.values()) a.gold += e.gold * 0.5;
          if (e.boss) {
            bossKilled = true;
            ctx.badge('tl_boss');
            ctx.quest('boss', 1);
            ctx.playerStat('bossesDefeated', 1);
            ctx.feed('Boss defeated!', 'star', '#ffd66b');
          }
        }
      }

      function fire(t, dt) {
        const s = stat(t);
        t.cd -= dt;
        if (t.cd > 0) return;
        let target = null, best = -1;
        for (const e of enemies) {
          if (e.hp <= 0) continue;
          if (U.dist(t.x, t.y, e.x, e.y) > s.range) continue;
          const prog = e.seg * 1000 + e.progress;
          if (prog > best) { best = prog; target = e; }
        }
        if (!target) return;
        t.cd = s.rate * (ctx.hasPass('sharpshooter') ? 0.8 : 1);
        t.aim = U.angleTo(t.x, t.y, target.x, target.y);
        if (t.type === 'archer') { shots.push({ kind: 'arrow', x: t.x, y: t.y, tgt: target, dmg: s.dmg, speed: 520 }); ctx.sfx('shoot', { vol: 0.25 }); }
        else if (t.type === 'cannon') { shots.push({ kind: 'ball', x: t.x, y: t.y, sx: t.x, sy: t.y, tx: target.x, ty: target.y, t: 0, dur: 0.55, dmg: s.dmg, splash: s.splash }); ctx.sfx('swing', { vol: 0.3 }); }
        else if (t.type === 'frost') {
          const hitList = s.area ? enemies.filter((e) => e.hp > 0 && U.dist(e.x, e.y, target.x, target.y) < s.area) : [target];
          for (const e of hitList) { e.slow = s.slow; e.slowT = 1.5; hurt(e, s.dmg, 'frost'); }
          bolts.push({ pts: [[t.x, t.y], [target.x, target.y]], t: 0.15, color: '#b3e5ff' });
          parts.emit(target.x, target.y, { count: 6, color: '#dff4ff', speed: 60, life: 0.4 });
        } else if (t.type === 'tesla') {
          const chain = [target];
          let cur = target;
          while (chain.length < s.chain) {
            const nxt = enemies.filter((e) => e.hp > 0 && !chain.includes(e) && U.dist(e.x, e.y, cur.x, cur.y) < 90).sort((a, b) => U.dist(a.x, a.y, cur.x, cur.y) - U.dist(b.x, b.y, cur.x, cur.y))[0];
            if (!nxt) break;
            chain.push(nxt);
            cur = nxt;
          }
          chain.forEach((e, i) => hurt(e, s.dmg * (1 - i * 0.12), 'tesla'));
          bolts.push({ pts: [[t.x, t.y - 10]].concat(chain.map((e) => [e.x, e.y])), t: 0.18, color: '#ffe066' });
          ctx.sfx('laser', { vol: 0.25 });
        }
      }

      function allyBuild(a, dt) {
        a.t -= dt;
        if (a.t > 0) return;
        a.t = 8 + Math.random() * 8;
        const types = ['archer', 'cannon', 'frost'];
        // "build a cannon" in chat picks the tower type; if they are short they build the cheapest they can
        const asked = a.want && types.find((k) => a.want.indexOf(k) === 0);
        let type = asked || U.pick(types);
        if (a.want && a.gold < TOWERS[type].cost) type = types.filter((k) => a.gold >= TOWERS[k].cost).sort((x, y) => TOWERS[x].cost - TOWERS[y].cost)[0] || type;
        a.want = null;
        if (a.gold < TOWERS[type].cost) { if (asked) ctx.botText(a.bot, 'not enough gold for that yet, need ' + TOWERS[type].cost, 400); return; }
        const spots = [];
        for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
          if (!buildable(cx, cy)) continue;
          let adj = false;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (road.has(cx + dx + ',' + (cy + dy))) adj = true;
          if (adj) spots.push([cx, cy]);
        }
        if (!spots.length) return;
        const [cx, cy] = U.pick(spots);
        a.gold -= TOWERS[type].cost;
        place(type, cx, cy, a.bot);
        ctx.feed(a.bot.displayName + ' built ' + U.withArticle(TOWERS[type].name) + ' tower.', 'info', '#8fd3ff');
        if (Math.random() < 0.3) ctx.botSay(a.bot, 'idle');
      }

      function clickTile(px, py) {
        const cx = Math.floor(px / TS), cy = Math.floor((py - TOP) / TS);
        if (py < TOP) return;
        const t = towers.find((x) => x.cx === cx && x.cy === cy);
        if (t) { selectedTower = t; towerPanel(); return; }
        selectedTower = null;
        ctx.ui.remove('tower');
        if (!buildable(cx, cy)) return;
        const def = TOWERS[selectedType];
        if (def.pass && !ctx.hasPass(def.pass)) { BF.actions.run('buy-pass', null, null, { pass: 'tl_tesla' }); return; }
        if (gold < def.cost) { floats.add(px, py, 'Need ' + def.cost + ' gold', '#ff8b98', 13); ctx.sfx('error'); return; }
        gold -= def.cost;
        place(selectedType, cx, cy, null);
        ctx.sfx('build');
      }

      function towerPanel() {
        const t = selectedTower;
        if (!t) return;
        const def = TOWERS[t.type];
        const s = stat(t);
        const nxt = def.levels[t.level + 1];
        const mine = !t.owner;
        ctx.ui.panel('tower', '<h3>' + def.name + ' tower · Lv ' + (t.level + 1) + '</h3>' + (t.owner ? '<p>Built by ' + U.esc(t.owner.displayName) + '.</p>' : '') +
          '<p>Damage ' + s.dmg + ' · Range ' + s.range + ' · every ' + s.rate + 's' + (s.splash ? ' · Splash ' + s.splash : '') + (s.slow ? ' · Slow ' + Math.round(s.slow * 100) + '%' : '') + (s.chain ? ' · Chains ' + s.chain : '') + '</p>' +
          '<div class="gp-actions">' + (mine && nxt ? '<button class="btn btn-primary btn-sm" data-gact="upgrade"' + (gold < nxt.cost ? ' disabled' : '') + '>Upgrade (' + nxt.cost + 'g)</button>' : mine ? '<span class="pill gold">Max level</span>' : '') +
          (mine ? '<button class="btn btn-ghost btn-sm" data-gact="sell">Sell (' + Math.floor(t.spent * T.sellRate) + 'g)</button>' : '') + '<button class="btn btn-ghost btn-sm" data-gact="deselect">Close</button></div>', 'right');
      }

      function lobby() {
        const tesla = ctx.hasPass('tesla');
        ctx.ui.panel('lobby', '<h3>' + BF.icon('shield', 18) + ' ' + U.esc(ctx.game.name) + '</h3><p>Survive ' + T.waves + ' waves. Enemies that reach the gate cost lives. Bosses arrive every fifth wave.' + (ctx.bots.length ? ' ' + ctx.bots.slice(0, 2).map((b) => U.esc(b.displayName)).join(' and ') + ' will build alongside you.' : '') + '</p>' +
          (custom ? '' : '<h4>Map</h4><div class="gp-grid">' + Object.entries(MAPS).map(([k, m]) => '<button class="gp-card' + (mapId === k ? ' on' : '') + '" data-gact="map-' + k + '"><b>' + m.name + '</b><small>' + (k === 'frostpeak' ? 'Tougher enemies (+30% health).' : 'The classic valley road.') + '</small></button>').join('') + '</div>') +
          '<h4>Towers</h4><div class="gp-grid">' + Object.entries(TOWERS).map(([k, d]) => '<div class="gp-card' + (d.pass && !tesla ? ' locked' : '') + '"><b>' + (d.pass && !tesla ? BF.icon('lock', 12) + ' ' : '') + d.key + ' · ' + d.name + '</b><small>' + d.cost + ' gold' + (d.pass && !tesla ? ' · Tesla Tower pass' : '') + '</small></div>').join('') + '</div>' +
          '<div class="gp-actions">' + (!tesla ? '<button class="btn btn-outline" data-gact="buy-tesla">' + BF.icon('ticket', 13) + 'Tesla Tower</button>' : '') + (!ctx.hasPass('warchest') ? '<button class="btn btn-outline" data-gact="buy-chest">' + BF.icon('ticket', 13) + 'War Chest</button>' : '') + '<button class="btn btn-play btn-lg" data-gact="start">' + BF.icon('play', 15) + 'Defend</button></div>', 'center');
      }

      ctx.ui.on((a) => {
        if (a.indexOf('map-') === 0) { mapId = a.slice(4); lobby(); }
        if (a === 'buy-tesla') BF.actions.run('buy-pass', null, null, { pass: 'tl_tesla' });
        if (a === 'buy-chest') BF.actions.run('buy-pass', null, null, { pass: 'tl_warchest' });
        if (a === 'start') { ctx.ui.remove('lobby'); setup(); }
        if (a === 'upgrade' && selectedTower) {
          const nxt = TOWERS[selectedTower.type].levels[selectedTower.level + 1];
          if (nxt && gold >= nxt.cost) { gold -= nxt.cost; selectedTower.level++; selectedTower.spent += nxt.cost; ctx.sfx('powerup'); parts.emit(selectedTower.x, selectedTower.y, { count: 16, color: '#ffd66b', speed: 120, life: 0.5 }); towerPanel(); }
        }
        if (a === 'sell' && selectedTower) { gold += Math.floor(selectedTower.spent * T.sellRate); towers = towers.filter((t) => t !== selectedTower); selectedTower = null; ctx.ui.remove('tower'); ctx.sfx('coin'); }
        if (a === 'deselect') { selectedTower = null; ctx.ui.remove('tower'); }
        if (a.indexOf('pick-') === 0) { selectedType = a.slice(5); buildBar(); }
        if (a === 'nextwave') callWave();
        if (a === 'speed') { speedMul = speedMul === 1 ? 2 : 1; buildBar(); }
      });
      const offPass = BF.bus.on('pass:purchased', () => { if (phase === 'lobby') lobby(); else buildBar(); });

      function buildBar() {
        if (phase === 'lobby' || phase === 'over') { ctx.ui.remove('bar'); return; }
        ctx.ui.panel('bar', '<div class="gp-row">' + Object.entries(TOWERS).map(([k, d]) => { const locked = d.pass && !ctx.hasPass(d.pass); return '<button class="btn btn-sm ' + (selectedType === k ? 'btn-primary' : 'btn-outline') + '" data-gact="pick-' + k + '"' + (locked ? ' title="Tesla Tower pass"' : '') + '>' + (locked ? BF.icon('lock', 12) : '') + d.key + ' ' + d.name + ' · ' + d.cost + 'g</button>'; }).join('') +
          '<button class="btn btn-sm btn-play" data-gact="nextwave"' + (phase === 'wave' ? ' disabled' : '') + '>' + BF.icon('play', 12) + 'Next wave</button><button class="btn btn-sm btn-ghost" data-gact="speed">' + speedMul + 'x</button></div>', 'dock');
      }

      function callWave() {
        if (phase !== 'build') return;
        if (betweenT > 1) { gold += T.earlyBonus; floats.add(W / 2, 90, '+' + T.earlyBonus + ' early bonus', '#ffd66b', 14); }
        startWave();
        buildBar();
      }

      function waveCleared() {
        ctx.reward(T.rewards.wave, 'waves cleared');
        ctx.xp(T.rewards.xpWave);
        ctx.quest('wave', 1);
        ctx.playerStat('wavesCleared', 1);
        ctx.best('highestWave', wave, 'max');
        gold += 25 + wave * 3;
        if (wave >= 10) ctx.badge('tl_wave10');
        if (wave >= T.waves) { finish(true); return; }
        phase = 'build';
        betweenT = T.between;
        buildBar();
      }

      function finish(win) {
        phase = 'over';
        ctx.ui.remove('bar');
        ctx.ui.remove('tower');
        if (win) ctx.badge('tl_victory');
        ctx.bots.slice(0, 2).forEach((b) => ctx.botSay(b, win ? 'win' : 'lose'));
        ctx.end({
          outcome: win ? 'win' : 'lose',
          title: win ? 'The valley holds!' : 'The gate fell',
          subtitle: map.name + ' · reached wave ' + wave + ' of ' + T.waves,
          coins: T.rewards.play + (win ? T.rewards.win : 0),
          xp: T.rewards.xpPlay + (win ? T.rewards.xpWin : 0),
          stats: [['Waves', wave], ['Lives left', lives], ['Towers built', towers.filter((t) => !t.owner).length], ['Boss defeated', bossKilled ? 'Yes' : 'No']],
        });
      }

      lobby();

      // ----------------------------------------------------------------- 3D

      const view = V && (() => {
        let builtMap = null, terrain = null;
        const towerPool = V.pool(), enemyPool = V.pool(), shotPool = V.pool(), boltPool = V.pool();
        const hoverTile = V.shape('box', 0, 1, 0, TS - 4, 2, TS - 4, '#ffffff', { basic: true, opacity: 0.3, shadow: false });
        const rangeRing = V.shape('ring', 0, 2, 0, 1, 1, 1, '#ffffff', { basic: true, opacity: 0.45, shadow: false });
        rangeRing.rotation.x = -Math.PI / 2;
        const ENEMY_H = { grunt: 22, runner: 18, knight: 26, brute: 34, boss: 56 };

        function buildTerrain() {
          const m = map || MAPS.greenvale;
          builtMap = map;
          if (terrain) V.remove(terrain);
          terrain = V.group();
          const snow = m === MAPS.frostpeak;
          V.preset(snow ? 'day' : 'sunset', { fogNear: 1300, fogFar: 3600 });
          V.shadowSize(560);
          V.ground(-1600, -1200, W + 1600, H + 1200, U.shade(m.grass, -0.2), { parent: terrain, y: -2, map: BF.g3d.gridTex(U.shade(m.grass, -0.2), 'rgba(0,0,0,0)', 1, { repeat: [40, 30], noise: true }) });
          const tiles = [];
          const rd = new Set(road);
          for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
            const isRoad = rd.has(cx + ',' + cy);
            tiles.push({ x: cx * TS + TS / 2, y: isRoad ? -12 : -12, z: TOP + cy * TS + TS / 2, w: TS, h: isRoad ? 8 : 12, d: TS, color: isRoad ? U.shade(m.road, (cx + cy) % 2 ? -0.03 : 0.02) : U.shade(m.grass, (cx + cy) % 2 ? 0.04 : -0.02) });
          }
          V.boxes(tiles, { parent: terrain });
          const r = U.rng('td-deco' + (m.name || ''));
          const deco = [], trunks = [];
          for (let i = 0; i < 70; i++) {
            const side = i % 2;
            const x = r() * (W + 600) - 300;
            const z = side ? TOP - 40 - r() * 400 : TOP + ROWS * TS + 40 + r() * 160;
            if (x < -20 && Math.abs(z - (path[0] ? path[0].y : 0)) < 60) continue;
            const h = 30 + r() * 40;
            trunks.push({ x, z, w: 7, h: h * 0.5, d: 7, color: '#6b4226' });
            deco.push({ x, y: h * 0.35, z, w: h * 0.7, h, d: h * 0.7, color: snow ? U.shade('#2f6b4a', r() * 0.1) : U.shade('#2f8f47', r() * 0.15 - 0.05) });
          }
          V.boxes(trunks, { parent: terrain, geo: 'cylLo' });
          V.boxes(deco, { parent: terrain, geo: 'cone' });
          if (snow) V.boxes(deco.map((d) => ({ x: d.x, y: d.y + d.h * 0.62, z: d.z, w: d.w * 0.5, h: d.h * 0.4, d: d.d * 0.5, color: '#f4f8ff' })), { parent: terrain, geo: 'cone' });
          if (path.length) {
            const a = path[0], e = path[path.length - 1];
            V.shape('sphere', a.x - 10, 0, a.y, 90, 80, 90, '#4a4a52', { parent: terrain, flat: true });
            V.shape('disc', a.x + 4, 20, a.y, 44, 44, 1, '#141418', { parent: terrain, basic: true }).rotation.y = Math.PI / 2;
            const gate = V.group(terrain);
            gate.position.set(W + 6, 0, e.y);
            for (const sd of [-1, 1]) { V.box(0, 0, sd * 40, 36, 90, 36, '#8a909c', { parent: gate }); V.box(0, 90, sd * 40, 40, 14, 40, '#6b7383', { parent: gate }); }
            V.box(0, 60, 0, 30, 20, 50, '#6b7383', { parent: gate });
            V.box(6, 0, 0, 10, 60, 44, '#3a2a20', { parent: gate });
            const flag = V.box(0, 104, 40, 2, 30, 2, '#1b1b22', { parent: gate });
            V.box(0, 118, 50, 1, 14, 20, '#ff7a2e', { parent: gate, glow: 0.3 });
            flag.castShadow = false;
            const plat = V.group(terrain);
            plat.position.set(W + 70, 0, e.y + 110);
            // a lookout deck big enough for the whole crew, with a railing and steps
            V.box(0, 0, 0, 150, 30, 110, '#8a909c', { parent: plat });
            V.box(0, 30, 0, 140, 3, 100, '#6b4a2a', { parent: plat });
            for (const [x, z, w, d] of [[0, -50, 140, 3], [0, 50, 140, 3], [70, 0, 3, 100]]) V.box(x, 33, z, w, 10, d, '#8b5a2b', { parent: plat });
            for (const [x, z] of [[-70, -50], [70, -50], [-70, 50], [70, 50]]) V.box(x, 33, z, 5, 14, 5, '#6b4226', { parent: plat });
            for (let i = 0; i < 3; i++) V.box(-80 - i * 9, 0, 0, 10, 30 - i * 10, 40, '#7a808c', { parent: plat });
            terrain.userData.plat = plat;
          }
        }

        function towerModel(t) {
          const d = TOWERS[t.type];
          const g = V.group();
          g.userData.lv = -1;
          g.userData.build = () => {
            while (g.children.length) g.remove(g.children[0]);
            const base = t.owner ? '#6d7c96' : '#a4abb8';
            V.box(0, 0, 0, 40, 10, 40, '#6b6f7a', { parent: g });
            V.box(0, 10, 0, 34, 24 + t.level * 12, 34, base, { parent: g });
            const top = 34 + t.level * 12;
            for (let l = 0; l <= t.level; l++) V.box(-10 + l * 10, top, 17.5, 5, 5, 2, '#ffd66b', { parent: g, glow: 0.6, shadow: false });
            const head = V.group(g);
            head.position.y = top;
            g.userData.head = head;
            if (t.type === 'archer') {
              V.box(0, 0, 0, 30, 6, 30, '#8b5a2b', { parent: head });
              V.shape('cone4', 0, 22, 0, 36, 18, 36, d.color, { parent: head }).rotation.y = Math.PI / 4;
              V.box(10, 8, 0, 18, 4, 4, '#4b3a2a', { parent: head });
            } else if (t.type === 'cannon') {
              V.shape('sphere', 0, 8, 0, 26, 18, 26, '#3a3f4b', { parent: head });
              const b = V.shape('cyl', 14, 10, 0, 10, 26, 10, '#2a2f3a', { parent: head, metal: 0.5 });
              b.rotation.z = Math.PI / 2;
              V.shape('torus', 26, 10, 0, 14, 14, 14, d.color, { parent: head }).rotation.y = Math.PI / 2;
            } else if (t.type === 'frost') {
              const c = V.shape('octa', 0, 22, 0, 20, 34, 20, d.color, { parent: head, glow: 0.9, opacity: 0.9, flat: true });
              g.userData.spin = c;
            } else {
              for (let k = 0; k < 3; k++) V.shape('torus', 0, 6 + k * 8, 0, 24 - k * 4, 24 - k * 4, 24 - k * 4, '#b88a2e', { parent: head, metal: 0.6 }).rotation.x = Math.PI / 2;
              g.userData.spin = V.shape('sphere', 0, 32, 0, 14, 14, 14, d.color, { parent: head, glow: 1.3 });
            }
            g.userData.lv = t.level;
          };
          return g;
        }

        function enemyModel(e) {
          const d = ENEMIES[e.type];
          const g = V.group();
          const h = ENEMY_H[e.type];
          const body = V.box(0, 0, 0, h * 0.9, h, h * 0.8, d.color, { parent: g });
          g.userData.body = body;
          for (const sd of [-1, 1]) {
            V.box(h * 0.2 * sd, h * 0.58, h * 0.4, h * 0.22, h * 0.24, 2, '#ffffff', { parent: g, shadow: false });
            V.box(h * 0.2 * sd, h * 0.58, h * 0.41 + 1, h * 0.1, h * 0.12, 1, '#1b1b22', { parent: g, shadow: false });
            V.box(h * 0.28 * sd, 0, 0, h * 0.24, h * 0.3, h * 0.3, U.shade(d.color, -0.3), { parent: g });
          }
          if (d.armor) { V.box(0, h, 0, h * 0.95, h * 0.28, h * 0.85, '#cfd6df', { parent: g, metal: 0.6, rough: 0.35 }); V.box(0, h * 0.4, h * 0.41, h * 0.7, h * 0.4, 2, '#9aa5b5', { parent: g, metal: 0.6 }); }
          if (d.boss) for (let k = 0; k < 5; k++) V.shape('cone4', -h * 0.36 + k * h * 0.18, h + 8, 0, 10, 16, 10, '#ffd66b', { parent: g, glow: 0.5 });
          return g;
        }

        return function sync(dt) {
          if (builtMap !== map || !terrain) buildTerrain();
          V.look(W / 2 + 40, 0, TOP + ROWS * TS / 2 + 40, { dist: 980, pitch: 1.02, fov: 42 }, dt);
          // hover and range preview
          const showHover = hover && phase !== 'lobby' && phase !== 'over' && hover.cx >= 0 && hover.cx < COLS && hover.cy >= 0 && hover.cy < ROWS;
          hoverTile.visible = !!showHover;
          if (showHover) {
            const ok = buildable(hover.cx, hover.cy);
            hoverTile.position.set(hover.cx * TS + TS / 2, 1, TOP + hover.cy * TS + TS / 2);
            hoverTile.material = V.mat(ok ? '#ffffff' : '#ff5a6a', { basic: true, opacity: 0.3 });
          }
          const ringT = selectedTower || (showHover && buildable(hover.cx, hover.cy) ? { x: hover.cx * TS + TS / 2, y: TOP + hover.cy * TS + TS / 2, r: TOWERS[selectedType].levels[0].range } : null);
          rangeRing.visible = !!ringT;
          if (ringT) { const rr = ringT.r || stat(ringT).range; rangeRing.position.set(ringT.x, 2, ringT.y); rangeRing.scale.set(rr * 2, rr * 2, 1); }
          for (const t of towers) {
            const m = towerPool.use(t, () => towerModel(t));
            if (m.userData.lv !== t.level) m.userData.build();
            m.position.set(t.x, 0, t.y);
            if (m.userData.head && t.type !== 'frost') m.userData.head.rotation.y = -t.aim;
            if (m.userData.spin) m.userData.spin.rotation.y += dt * 2;
            if (t.owner) V.label(t.x, 80 + t.level * 12, t.y, { name: t.owner.displayName.slice(0, 12), color: '#dff4ff' });
          }
          towerPool.sweep();
          for (const e of enemies) {
            const m = enemyPool.use(e, () => enemyModel(e));
            const h = ENEMY_H[e.type];
            const nx = path[Math.min(path.length - 1, e.seg + 1)];
            m.position.set(e.x, Math.abs(Math.sin(e.t * 8)) * 4, e.y);
            if (nx) m.rotation.y = -Math.atan2(nx.y - e.y, nx.x - e.x) + Math.PI / 2;
            m.userData.body.material = V.mat(e.slowT > 0 ? U.mix(ENEMIES[e.type].color, '#9fdcff', 0.55) : ENEMIES[e.type].color);
            V.label(e.x, h + 18, e.y, { hp: e.hp / e.max, hpColor: e.boss ? '#ffd66b' : '#3fd08a' });
          }
          enemyPool.sweep();
          for (const sh of shots) {
            const m = shotPool.use(sh, () => (sh.kind === 'arrow' ? V.box(0, 0, 0, 16, 2, 2, '#f4ecd0', { shadow: false }) : V.shape('sphere', 0, 0, 0, 12, 12, 12, '#2a2f3a', {})));
            if (sh.kind === 'arrow') { m.position.set(sh.x, 30, sh.y); m.rotation.y = -(sh.a || 0); }
            else { const k = Math.min(1, sh.t / sh.dur); m.position.set(U.lerp(sh.sx, sh.tx, k), 34 + Math.sin(k * Math.PI) * 80, U.lerp(sh.sy, sh.ty, k)); }
          }
          shotPool.sweep();
          for (const b of bolts) {
            const grp = boltPool.use(b, () => { const g = V.group(); for (let i = 1; i < b.pts.length; i++) V.box(0, 0, 0, 1, 3, 3, b.color, { parent: g, basic: true, shadow: false }); return g; });
            grp.children.forEach((seg, i) => {
              const p1 = b.pts[i], p2 = b.pts[i + 1];
              const x1 = p1[0], z1 = p1[1], x2 = p2[0] + (Math.random() - 0.5) * 8, z2 = p2[1] + (Math.random() - 0.5) * 8;
              const len = Math.hypot(x2 - x1, z2 - z1);
              seg.scale.set(len, 3, 3);
              seg.position.set((x1 + x2) / 2, 28, (z1 + z2) / 2);
              seg.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
            });
          }
          boltPool.sweep();
          const plat = terrain && terrain.userData.plat;
          if (plat) {
            const crew = [{ id: 'me', av: ctx.player.avatar, name: ctx.player.name }].concat(Array.from(allies.values()).map((a) => ({ id: a.bot.id, av: a.bot.avatar, name: a.bot.displayName })));
            crew.forEach((c, i) => {
              const rig = V.actor(c.id, c.av, { scale: 8 });
              // two rows of three, 40 px apart, so rigs (about 32 px across) never touch
              const x = plat.position.x - 40 + (i % 3) * 40, z = plat.position.z - 22 + Math.floor(i / 3) * 44;
              rig.setPos(x, 33, z);
              rig.faceAngle(Math.PI * 0.75);
              if (phase === 'wave' && Math.random() < 0.004) rig.emote('cheer', 1.5);
              // Only the player and whoever is talking get a tag, so the crowded platform stays readable.
              const bubble = ctx.bubbleText(c.id);
              if (c.id === 'me' || bubble) V.label(x, 86, z, { name: c.name, color: c.id === 'me' ? '#ffb454' : '#ffffff', bubble });
            });
          }
          V.sweep();
        };
      })();

      return {
        update(rawDt) {
          const dt = rawDt * speedMul;
          parts.update(dt);
          floats.update(dt);
          if (phase === 'lobby' || phase === 'over') return;
          const inp = ctx.input;
          const p = inp.pointer;
          const w = V ? (p.y > TOP ? ctx.pointerWorld(0) : { x: -1, y: -1 }) : p;
          hover = w.y > TOP ? { cx: Math.floor(w.x / TS), cy: Math.floor((w.y - TOP) / TS) } : null;
          if (p.pressed && !ctx.ui.has('lobby') && (!V || p.y > TOP)) clickTile(w.x, w.y);
          ['t1', 't2', 't3', 't4'].forEach((k, i) => { if (inp.actPressed(k)) { selectedType = Object.keys(TOWERS)[i]; buildBar(); } });
          if (inp.actPressed('next')) callWave();
          if (inp.actPressed('speed')) { speedMul = speedMul === 1 ? 2 : 1; buildBar(); }
          if (inp.actPressed('cancel')) { selectedTower = null; ctx.ui.remove('tower'); }
          if (!ctx.ui.has('bar')) buildBar();
          if (phase === 'build') { betweenT -= dt; if (betweenT <= 0) callWave(); }
          if (phase === 'wave') {
            spawnT -= dt;
            if (spawnT <= 0 && spawnQ.length) { spawnEnemy(spawnQ.shift()); spawnT = Math.max(0.35, 0.9 - wave * 0.025); }
            if (!spawnQ.length && !enemies.length) waveCleared();
          }
          for (const a of allies.values()) allyBuild(a, dt);
          for (const e of enemies) {
            e.t += dt;
            e.slowT = Math.max(0, e.slowT - dt);
            const sp = e.speed * (e.slowT > 0 ? 1 - e.slow : 1);
            let move = sp * dt;
            while (move > 0 && e.seg < path.length - 1) {
              const nx = path[e.seg + 1];
              const dd = U.dist(e.x, e.y, nx.x, nx.y);
              if (dd <= move) { e.x = nx.x; e.y = nx.y; e.seg++; move -= dd; }
              else { e.x += ((nx.x - e.x) / dd) * move; e.y += ((nx.y - e.y) / dd) * move; move = 0; }
            }
            e.progress = e.seg < path.length - 1 ? -U.dist(e.x, e.y, path[e.seg + 1].x, path[e.seg + 1].y) : 0;
            if (e.seg >= path.length - 1) {
              e.hp = 0;
              lives -= e.boss ? 5 : 1;
              ctx.sfx('hurt');
              floats.add(W - 40, TOP + 20, e.boss ? '-5' : '-1', '#ff8b98', 18);
              if (lives <= 0) { lives = 0; finish(false); return; }
            }
          }
          enemies = enemies.filter((e) => e.hp > 0);
          for (const t of towers) fire(t, dt);
          for (let i = shots.length - 1; i >= 0; i--) {
            const s = shots[i];
            if (s.kind === 'arrow') {
              if (s.tgt.hp <= 0) { shots.splice(i, 1); continue; }
              const a = U.angleTo(s.x, s.y, s.tgt.x, s.tgt.y);
              s.x += Math.cos(a) * s.speed * dt;
              s.y += Math.sin(a) * s.speed * dt;
              s.a = a;
              if (U.dist(s.x, s.y, s.tgt.x, s.tgt.y) < 10) { hurt(s.tgt, s.dmg, 'archer'); shots.splice(i, 1); }
            } else {
              s.t += dt;
              const k = Math.min(1, s.t / s.dur);
              s.x = U.lerp(s.sx, s.tx, k);
              s.y = U.lerp(s.sy, s.ty, k) - Math.sin(k * Math.PI) * 50;
              if (k >= 1) {
                for (const e of enemies) if (U.dist(e.x, e.y, s.tx, s.ty) < s.splash) hurt(e, s.dmg, 'cannon');
                parts.emit(s.tx, s.ty, { count: 16, colors: ['#ff9d3c', '#ffd66b', '#6b6b6b'], speed: 140, life: 0.4 });
                ctx.sfx('explosion', { vol: 0.25 });
                shots.splice(i, 1);
              }
            }
          }
          for (let i = bolts.length - 1; i >= 0; i--) { bolts[i].t -= dt; if (bolts[i].t <= 0) bolts.splice(i, 1); }
          if (selectedTower && ctx.ui.has('tower') && Math.random() < 0.05) towerPanel();
        },
        draw(g) {
          const m = map || MAPS.greenvale;
          g.fillStyle = m.grass;
          g.fillRect(0, 0, W, H);
          for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
            const x = cx * TS, y = TOP + cy * TS;
            if (road.has(cx + ',' + cy)) { g.fillStyle = m.road; g.fillRect(x, y, TS, TS); g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(x, y + TS - 4, TS, 4); }
            else if ((cx + cy) % 2) { g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(x, y, TS, TS); }
          }
          if (path.length) { const e = path[path.length - 1]; G.fillRR(g, W - 26, e.y - 30, 26, 60, 6, '#6b7383'); G.fillRR(g, W - 22, e.y - 22, 18, 44, 4, '#3a2a20'); }
          if (hover && phase !== 'lobby' && phase !== 'over' && hover.cx >= 0 && hover.cx < COLS && hover.cy >= 0 && hover.cy < ROWS) {
            const ok = buildable(hover.cx, hover.cy);
            g.fillStyle = ok ? 'rgba(255,255,255,.18)' : 'rgba(255,90,106,.2)';
            g.fillRect(hover.cx * TS, TOP + hover.cy * TS, TS, TS);
            if (ok) { g.globalAlpha = 0.25; G.ring(g, hover.cx * TS + TS / 2, TOP + hover.cy * TS + TS / 2, TOWERS[selectedType].levels[0].range, '#fff', 2); g.globalAlpha = 1; }
          }
          for (const t of towers) {
            const d = TOWERS[t.type];
            G.fillRR(g, t.x - 19, t.y - 17, 38, 38, 6, 'rgba(0,0,0,.25)');
            G.fillRR(g, t.x - 18, t.y - 20, 36, 36, 6, '#8b8f9a');
            G.fillRR(g, t.x - 14, t.y - 16, 28, 28, 5, t.owner ? '#5b6b82' : '#a4abb8');
            G.circle(g, t.x, t.y - 2, 10, d.color);
            g.save(); g.translate(t.x, t.y - 2); g.rotate(t.aim); g.fillStyle = '#2a2f3a'; g.fillRect(0, -3, 14, 6); g.restore();
            for (let l = 0; l <= t.level; l++) G.circle(g, t.x - 10 + l * 10, t.y + 12, 3, '#ffd66b');
            if (t === selectedTower) G.ring(g, t.x, t.y, stat(t).range, 'rgba(255,255,255,.4)', 2);
            if (t.owner) G.text(g, t.owner.displayName.slice(0, 10), t.x, t.y - 24, { size: 9, align: 'center', color: '#dff4ff', stroke: 'rgba(0,0,0,.6)', strokeW: 3 });
          }
          for (const e of enemies) {
            const d = ENEMIES[e.type];
            const bob = Math.sin(e.t * 8) * 2;
            G.shadow(g, e.x, e.y + d.size * 0.8, d.size, d.size * 0.35);
            G.circle(g, e.x, e.y + bob, d.size, e.slowT > 0 ? U.mix(d.color, '#9fdcff', 0.5) : d.color);
            G.circle(g, e.x - d.size * 0.35, e.y - 3 + bob, d.size * 0.22, '#fff');
            G.circle(g, e.x + d.size * 0.35, e.y - 3 + bob, d.size * 0.22, '#fff');
            if (d.armor) G.fillRR(g, e.x - d.size, e.y - d.size - 3 + bob, d.size * 2, 5, 2, '#cfd6df');
            if (e.boss) G.text(g, '♛', e.x, e.y - d.size - 6, { size: 16, align: 'center', color: '#ffd66b' });
            G.bar(g, e.x - 14, e.y - d.size - 10, 28, 4, e.hp / e.max, e.boss ? '#ffd66b' : '#3fd08a');
          }
          for (const s of shots) {
            if (s.kind === 'arrow') { g.save(); g.translate(s.x, s.y); g.rotate(s.a || 0); g.fillStyle = '#f4ecd0'; g.fillRect(-7, -1, 14, 2); g.restore(); }
            else G.circle(g, s.x, s.y, 6, '#2a2f3a');
          }
          for (const b of bolts) {
            g.strokeStyle = b.color;
            g.lineWidth = 3;
            g.globalAlpha = Math.min(1, b.t * 8);
            g.beginPath();
            b.pts.forEach((p, i) => { const jx = i ? (Math.random() - 0.5) * 8 : 0, jy = i ? (Math.random() - 0.5) * 8 : 0; if (i) g.lineTo(p[0] + jx, p[1] + jy); else g.moveTo(p[0], p[1]); });
            g.stroke();
            g.globalAlpha = 1;
          }
          parts.draw(g);
          floats.draw(g);
          drawHud(g);
        },
        render3d(dt) { view(dt); },
        hud(g) { drawHud(g); },
        onBotJoin(b) { if (!allies.has(b.id) && allies.size < 2) allies.set(b.id, { bot: b, gold: 60, t: 8 }); },
        /** "build a tower" in chat: the ally builds right away. */
        onBotOrder(bot, order) {
          const a = allies.get(bot.id);
          if (!a || order.verb !== 'build') return;
          a.want = String(order.arg || 'tower').replace(/s$/, '');
          a.t = 0;
          allyBuild(a, 0);
          ctx.clearOrder(bot.id);
        },
        onBotLeave(b) { allies.delete(b.id); towers.forEach((t) => { if (t.owner && t.owner.id === b.id) t.owner = null; }); },
        destroy() { offPass(); },
      };

      function drawHud(g) {
          g.fillStyle = 'rgba(8,10,16,.85)';
          g.fillRect(0, 0, W, TOP);
          if (!V) g.fillRect(0, TOP + ROWS * TS, W, H - TOP - ROWS * TS);
          G.text(g, 'Wave ' + wave + ' / ' + T.waves, 16, 31, { size: 19, weight: 800 });
          G.text(g, '♥ ' + lives, 200, 31, { size: 19, weight: 800, color: lives <= 5 ? '#ff8b98' : '#ff5a6a' });
          G.text(g, '◈ ' + Math.floor(gold) + ' gold', 290, 31, { size: 19, weight: 800, color: '#ffd66b' });
          if (phase === 'build') G.text(g, 'Next wave in ' + Math.ceil(betweenT) + 's · Space to call early (+' + T.earlyBonus + 'g)', W - 16, 31, { size: 14, align: 'right', color: '#cfd6e2' });
          if (phase === 'wave') G.text(g, enemies.length + spawnQ.length + ' enemies left', W - 16, 31, { size: 14, align: 'right', color: '#cfd6e2' });
          if (phase === 'lobby') { g.fillStyle = V ? 'rgba(6,8,12,.3)' : 'rgba(6,8,12,.5)'; g.fillRect(0, 0, W, H); }
      }
    },
  });
})((window.BF = window.BF || {}));
