/**
 * Factory Tycoon (gameType "factory") — persistent tycoon plot.
 * Droppers drop ore onto conveyor lines, upgraders multiply its value and the
 * furnace turns it into cash waiting at the collector. Stand on buy pads to
 * purchase droppers, upgraders, decor, the East Wing, the stairs to the
 * upper floor and finally the Golden Forge Monument. Everything you buy is
 * saved. Each shift has a production contract scaled to your income.
 * Win: meet the contract before the shift ends. Lose: fall short.
 * Passes: double_cash (x2 value), auto_collect (no collector trips).
 * Store: Cash Injection (progress.custom.cash).
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;
  const P = BF.phys;

  const T = {
    shift: 360, speed: 180, beltSpeed: 95, buyHold: 0.35, contractK: 0.8, contractMin: 1000,
    rewards: { play: 15, win: 50, buy: 4, bigBuy: 10, xpPlay: 30, xpWin: 110, xpBuy: 6 },
  };
  const ORES = {
    stone: { value: 4, every: 1.6, color: '#9aa5b5' },
    iron: { value: 10, every: 1.5, color: '#c98f6a' },
    gold: { value: 40, every: 1.8, color: '#ffd66b' },
    ruby: { value: 90, every: 2, color: '#ff3d5a' },
    crystal: { value: 250, every: 2.2, color: '#7fe7ff' },
  };
  const LINES = {
    main: { layer: 0, y: 380, x0: 110, x1: 700 },
    east: { layer: 0, y: 380, x0: 910, x1: 1290 },
    upper: { layer: 1, y: 380, x0: 110, x1: 700 },
  };
  const I = (id, name, price, kind, o) => Object.assign({ id, name, price, kind }, o);
  const ITEMS = [
    I('d1', 'Stone Dropper', 0, 'dropper', { line: 'main', x: 160, ore: 'stone', pad: [0, 0] }),
    I('d2', 'Stone Dropper', 150, 'dropper', { line: 'main', x: 250, ore: 'stone', req: ['d1'], pad: [120, 560] }),
    I('washer', 'Ore Washer x1.5', 400, 'upgrader', { line: 'main', x: 520, mult: 1.5, req: ['d2'], pad: [230, 560] }),
    I('d3', 'Iron Dropper', 600, 'dropper', { line: 'main', x: 340, ore: 'iron', req: ['washer'], pad: [340, 560] }),
    I('walls', 'Factory Walls (+5%)', 300, 'decor', { bonus: 0.05, req: ['d2'], pad: [120, 660] }),
    I('d4', 'Iron Dropper', 1500, 'dropper', { line: 'main', x: 430, ore: 'iron', req: ['d3'], pad: [450, 560] }),
    I('lights', 'Neon Lights (+5%)', 900, 'decor', { bonus: 0.05, req: ['walls'], pad: [230, 660] }),
    I('polisher', 'Polisher x2', 2500, 'upgrader', { line: 'main', x: 610, mult: 2, req: ['d4'], pad: [560, 560] }),
    I('plants', 'Office Plants (+5%)', 1800, 'decor', { bonus: 0.05, req: ['lights'], pad: [340, 660] }),
    I('east', 'East Wing', 5000, 'area', { req: ['polisher'], pad: [770, 660] }),
    I('e1', 'Gold Dropper', 4000, 'dropper', { line: 'east', x: 960, ore: 'gold', req: ['east'], pad: [940, 560] }),
    I('smelter', 'Smelter x3', 10000, 'upgrader', { line: 'east', x: 1210, mult: 3, req: ['e1'], pad: [1050, 560] }),
    I('e2', 'Gold Dropper', 7500, 'dropper', { line: 'east', x: 1050, ore: 'gold', req: ['smelter'], pad: [1160, 560] }),
    I('e3', 'Ruby Dropper', 15000, 'dropper', { line: 'east', x: 1140, ore: 'ruby', req: ['e2'], pad: [1270, 560] }),
    I('stairs', 'Stairs to Upper Floor', 20000, 'area', { req: ['e3'], pad: [560, 660] }),
    I('u1', 'Crystal Dropper', 30000, 'dropper', { line: 'upper', x: 200, ore: 'crystal', req: ['stairs'], layer: 1, pad: [230, 560] }),
    I('core', 'Forge Core x5', 60000, 'upgrader', { line: 'upper', x: 560, mult: 5, req: ['u1'], layer: 1, pad: [340, 560] }),
    I('u2', 'Crystal Dropper', 45000, 'dropper', { line: 'upper', x: 320, ore: 'crystal', req: ['core'], layer: 1, pad: [450, 560] }),
    I('monument', 'Golden Forge Monument', 150000, 'monument', { req: ['u2'], layer: 1, pad: [560, 560], bonus: 0.25 }),
  ];
  const BYID = Object.fromEntries(ITEMS.map((it) => [it.id, it]));
  const layerOf = (it) => (it.layer != null ? it.layer : it.line ? LINES[it.line].layer : 0);
  const STAIRS = [{ layer: 0, x: 100, y: 150 }, { layer: 1, x: 100, y: 150 }];
  const COLLECTORS = { main: { layer: 0, x: 760, y: 480 }, east: { layer: 0, x: 1340, y: 480 }, upper: { layer: 1, x: 760, y: 480 } };

  BF.GameModules.register('factory', {
    three: true,
    maxBots: 6,
    feedTop: 0.17,
    actions: { use: ['KeyE'] },
    controls: { joystick: true, buttons: [{ act: 'use', label: 'Use', icon: 'cursor' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const V = ctx.g3;
      const parts = V ? V.particles2d(24) : new BF.Particles(400);
      const floats = V ? V.floaters2d(60) : new BF.Floaters();
      const cam = new BF.Camera(W, H);
      const d = ctx.data;
      d.owned = d.owned || ['d1'];
      if (!d.owned.includes('d1')) d.owned.unshift('d1');
      if (d.cash == null) d.cash = 0;
      d.lifetime = d.lifetime || 0;
      ctx.save();
      const owns = (id) => d.owned.includes(id);
      const dbl = ctx.hasPass('double_cash');
      const auto = ctx.hasPass('auto_collect');

      let layer = 0;
      let phase = 'play';
      let shift = T.shift;
      let produced = 0, collected = 0, bought = 0;
      let goalHit = false;
      const pending = { main: 0, east: 0, upper: 0 };
      const blocks = [];
      const me = { x: 300, y: 480, a: 0, walk: 0 };
      let hold = null; // {item, t}
      let stairsCd = 0;

      const mult = () => {
        let m = dbl ? 2 : 1;
        for (const it of ITEMS) if ((it.kind === 'decor' || it.kind === 'monument') && owns(it.id)) m *= 1 + it.bonus;
        return m;
      };
      function rate() {
        let r = 0;
        for (const it of ITEMS) {
          if (it.kind !== 'dropper' || !owns(it.id)) continue;
          const ore = ORES[it.ore];
          let v = ore.value;
          for (const up of ITEMS) if (up.kind === 'upgrader' && owns(up.id) && up.line === it.line && up.x > it.x) v *= up.mult;
          r += v / ore.every;
        }
        return r * mult();
      }
      const contract = Math.max(T.contractMin, Math.round((rate() * T.shift * T.contractK) / 100) * 100);
      const droppers = () => ITEMS.filter((it) => it.kind === 'dropper' && owns(it.id));
      const timers = new Map();

      const bounds = () => ({ x: 40, y: 60, w: (layer === 0 && owns('east') ? 1400 : 840) - 40, h: 700 });
      const available = (it) => !owns(it.id) && (it.req || []).every(owns) && layerOf(it) === layer && it.pad[0];

      // --------------------------------------------------------------- bots
      const bots = [];
      function addBot(b) {
        const r = U.rng(b.id + ':ft');
        bots.push({ bot: b, x: 200 + r() * 500, y: 480 + r() * 200, tx: 0, ty: 0, t: 0, a: 0, walk: 0, value: Math.round(Math.pow(ctx.botLevel(b) || 10, 2) * 300 * (0.6 + r() * 0.8)), buyT: 20 + r() * 40 });
      }
      ctx.bots.forEach(addBot);
      const myValue = () => ITEMS.filter((it) => owns(it.id)).reduce((a, it) => a + it.price, 0);

      function buy(it) {
        if (d.cash < it.price) { floats.add(me.x, me.y - 30, 'Need $' + U.fmt(it.price - Math.floor(d.cash)) + ' more', '#ff8b98', 13); ctx.sfx('error'); return; }
        d.cash -= it.price;
        d.owned.push(it.id);
        bought++;
        ctx.save();
        ctx.sfx('purchase');
        ctx.reward(it.price >= 10000 ? T.rewards.bigBuy : T.rewards.buy, 'factory upgrades');
        ctx.xp(T.rewards.xpBuy);
        parts.emit(me.x, me.y, { count: 26, colors: ['#4ad17f', '#ffd66b', '#ffffff'], speed: 170, life: 0.6 });
        floats.add(me.x, me.y - 30, it.name + '!', '#4ad17f', 15);
        if (it.kind === 'upgrader') ctx.badge('ft_upgrader');
        if (it.id === 'east') { ctx.badge('ft_east'); ctx.banner('EAST WING OPEN', 'Gold droppers are waiting', 1800); }
        if (it.id === 'stairs') ctx.banner('UPPER FLOOR UNLOCKED', 'Take the stairs in the north-west corner', 1800);
        if (it.id === 'monument') { ctx.badge('ft_monument'); ctx.banner('THE GOLDEN FORGE MONUMENT', 'Permanent +25% income', 2600); ctx.sfx('win'); }
      }
      function collect(line) {
        const amt = Math.floor(pending[line]);
        if (amt <= 0) return;
        pending[line] -= amt;
        bank(amt, COLLECTORS[line].x, COLLECTORS[line].y);
        ctx.sfx('coin');
      }
      function bank(amt, x, y) {
        d.cash += amt;
        collected += amt;
        if (x != null) floats.add(x, y - 30, '+$' + U.fmt(amt), '#4ad17f', 16);
      }
      function produce(line, value, x, y) {
        produced += value;
        d.lifetime += value;
        if (auto) bank(value, null, null);
        else pending[line] += value;
        if (!goalHit && produced >= contract) {
          goalHit = true;
          ctx.banner('CONTRACT COMPLETE!', 'Keep producing or clock out for your rewards', 2200);
          ctx.sfx('levelup');
          tray();
        }
      }
      function tray() {
        if (phase !== 'play' || !goalHit) { ctx.ui.remove('tray'); return; }
        ctx.ui.panel('tray', '<button class="btn btn-sm btn-play" data-gact="clockout">' + BF.icon('check', 13) + 'Clock out</button>', 'tray');
      }
      ctx.ui.on((a) => { if (a === 'clockout') finish(false); });

      function finish(timeUp) {
        if (phase !== 'play') return;
        phase = 'over';
        ctx.ui.remove('tray');
        for (const k of Object.keys(pending)) { if (pending[k] > 0) { bank(Math.floor(pending[k])); pending[k] = 0; } }
        ctx.save();
        const win = produced >= contract;
        ctx.best('bestScore', Math.floor(d.lifetime), 'max');
        ctx.end({
          outcome: win ? 'win' : 'lose',
          title: win ? 'Contract fulfilled!' : timeUp ? 'Shift over' : 'Clocked out',
          subtitle: 'Produced $' + U.fmt(Math.floor(produced)) + ' of the $' + U.fmt(contract) + ' contract',
          coins: T.rewards.play + (win ? T.rewards.win : 0),
          xp: T.rewards.xpPlay + (win ? T.rewards.xpWin : 0),
          stats: [['Produced', '$' + U.fmt(Math.floor(produced))], ['Upgrades bought', bought], ['Income', '$' + U.fmt(Math.round(rate())) + '/s'], ['Lifetime cash', '$' + U.fmt(Math.floor(d.lifetime))]],
        });
      }

      // ---------------------------------------------------------------- draw
      function drawDropper(g, it, t) {
        const ln = LINES[it.line];
        const ore = ORES[it.ore];
        const x = it.x, y = ln.y - 46;
        const since = timers.get(it.id) || 0;
        G.shadow(g, x, y + 30, 28, 8, 0.3);
        G.fillRR(g, x - 24, y - 28, 48, 44, 6, '#4a5160');
        G.fillRR(g, x - 18, y - 22, 36, 18, 4, U.shade(ore.color, -0.2));
        G.fillRR(g, x - 8, y + 14, 16, 16, 3, '#2a2f3a');
        G.circle(g, x + 14, y - 30, 4, since < 0.2 ? '#4ad17f' : '#1f3a2a');
        G.text(g, it.name.replace(' Dropper', ''), x, y - 38, { size: 10, align: 'center', color: '#cfd6e2' });
      }
      function drawUpgrader(g, it, t) {
        const ln = LINES[it.line];
        const x = it.x, y = ln.y;
        const col = it.mult >= 5 ? '#ff7a2e' : it.mult >= 3 ? '#ffd66b' : it.mult >= 2 ? '#b67cff' : '#46a8ff';
        g.globalAlpha = 0.25 + Math.sin(t * 5 + x) * 0.1; G.circle(g, x, y, 40, col); g.globalAlpha = 1;
        G.fillRR(g, x - 8, y - 34, 16, 68, 4, '#39414f');
        G.fillRR(g, x - 26, y - 38, 52, 12, 4, col);
        G.fillRR(g, x - 26, y + 26, 52, 12, 4, col);
        G.text(g, 'x' + it.mult, x, y - 44, { size: 13, align: 'center', color: col, weight: 900, stroke: 'rgba(0,0,0,.6)', strokeW: 3 });
      }
      function drawLine(g, key, t) {
        const ln = LINES[key];
        if (ln.layer !== layer) return;
        const fx = ln.x1;
        G.fillRR(g, ln.x0 - 10, ln.y - 18, fx - ln.x0 + 20, 36, 6, '#22262f');
        g.fillStyle = '#343a46';
        const off = (t * T.beltSpeed) % 24;
        g.save(); g.beginPath(); g.rect(ln.x0 - 6, ln.y - 14, fx - ln.x0 + 12, 28); g.clip();
        for (let x = ln.x0 - 30 + off; x < fx + 10; x += 24) g.fillRect(x, ln.y - 14, 10, 28);
        g.restore();
        // furnace
        G.fillRR(g, fx, ln.y - 44, 80, 88, 8, '#5a3a2a');
        G.fillRR(g, fx + 10, ln.y - 24, 60, 48, 6, '#1b1b22');
        const fl = 0.6 + Math.sin(t * 12 + fx) * 0.2;
        g.globalAlpha = fl; G.circle(g, fx + 40, ln.y + 6, 18, '#ff7a2e'); G.circle(g, fx + 40, ln.y + 10, 10, '#ffd66b'); g.globalAlpha = 1;
        G.text(g, 'FURNACE', fx + 40, ln.y - 50, { size: 10, align: 'center', color: '#ffb454', weight: 800 });
        const c = COLLECTORS[key];
        G.fillRR(g, c.x - 30, c.y - 22, 60, 44, 10, auto ? '#2a3a2a' : '#1f6b3a');
        G.fillRR(g, c.x - 24, c.y - 16, 48, 32, 8, auto ? '#3a4a3a' : '#3fd08a');
        G.text(g, auto ? 'AUTO' : '$', c.x, c.y + 6, { size: auto ? 11 : 18, align: 'center', color: '#0b2a14', weight: 900 });
        if (!auto && pending[key] >= 1) G.text(g, '$' + U.fmt(Math.floor(pending[key])) + ' waiting', c.x, c.y - 30, { size: 12, align: 'center', color: '#4ad17f', weight: 800, stroke: 'rgba(0,0,0,.6)', strokeW: 3 });
      }
      function drawPad(g, it) {
        const [x, y] = it.pad;
        const can = d.cash >= it.price;
        const on = hold && hold.item === it;
        G.fillRR(g, x - 44, y - 30, 88, 60, 10, can ? 'rgba(63,208,138,.22)' : 'rgba(255,90,106,.16)');
        g.strokeStyle = can ? '#3fd08a' : '#ff5a6a'; g.lineWidth = 2; g.strokeRect(x - 40, y - 26, 80, 52);
        if (on) { g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, 30, -Math.PI / 2, -Math.PI / 2 + (hold.t / T.buyHold) * Math.PI * 2); g.stroke(); }
        G.text(g, it.name, x, y - 4, { size: 10.5, align: 'center', color: '#fff', weight: 800 });
        G.text(g, '$' + U.fmt(it.price), x, y + 14, { size: 12, align: 'center', color: can ? '#4ad17f' : '#ff8b98', weight: 900 });
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        let builtKey = null, plant = null, belts = [], lamps = [], dropLights = [], upgRings = [], furnaceGlow = [];
        const oreMesh = new THREE.InstancedMesh(BF.g3d.geo('box'), V.mat('#ffffff', { rough: 0.35, metal: 0.2 }), 240);
        oreMesh.castShadow = true;
        oreMesh.frustumCulled = false; // bounds change every frame
        oreMesh.count = 0;
        V.scene.add(oreMesh);
        const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), c3 = new THREE.Color();
        const padPool = V.pool();
        const upColor = (it) => (it.mult >= 5 ? '#ff7a2e' : it.mult >= 3 ? '#ffd66b' : it.mult >= 2 ? '#b67cff' : '#46a8ff');

        function beltTex(len) {
          const c = document.createElement('canvas');
          c.width = 64; c.height = 32;
          const g2 = c.getContext('2d');
          g2.fillStyle = '#22262f'; g2.fillRect(0, 0, 64, 32);
          g2.fillStyle = '#3a414f'; g2.fillRect(0, 0, 26, 32); g2.fillRect(32, 0, 26, 32);
          const tex = V.own(new THREE.CanvasTexture(c));
          tex.wrapS = THREE.RepeatWrapping;
          tex.repeat.set(len / 48, 1);
          tex.colorSpace = THREE.SRGBColorSpace;
          return tex;
        }

        function rebuild() {
          builtKey = layer + '|' + d.owned.join(',') + '|' + auto;
          if (plant) V.remove(plant);
          plant = V.group();
          belts = []; lamps = []; dropLights = []; upgRings = []; furnaceGlow = [];
          V.preset('indoor', { fogNear: 1400, fogFar: 3400 });
          V.shadowSize(620);
          const eastOpen = layer === 0 && owns('east');
          const x1 = layer === 0 ? (eastOpen ? 1400 : 840) : 840;
          const tiles = [];
          for (let y = 60; y < 760; y += 40) for (let x = 40; x < x1; x += 40) {
            const east = x >= 840;
            tiles.push({ x: x + 20, y: -4, z: y + 20, w: 39.5, h: 4, d: 39.5, color: layer === 1 ? ((x + y) / 40 % 2 ? '#3a3350' : '#352f4a') : east ? ((x + y) / 40 % 2 ? '#3d4450' : '#39404c') : ((x + y) / 40 % 2 ? '#4a5160' : '#454c5a') });
          }
          V.boxes(tiles, { parent: plant });
          V.ground(-1200, -1200, 2600, 2000, '#12151c', { parent: plant, y: -6, basic: true });
          const wallCol = owns('walls') ? '#6a4a8a' : '#2a2f3a';
          const wh = 90;
          V.boxes([
            { x: (30 + x1 + 10) / 2, z: 56, w: x1 - 20, h: wh, d: 12, color: wallCol },
            { x: 36, z: 410, w: 12, h: wh, d: 720, color: wallCol },
            { x: x1 + 4, z: 410, w: 12, h: wh, d: 720, color: wallCol },
            { x: (30 + x1 + 10) / 2, z: 764, w: x1 - 20, h: 14, d: 12, color: wallCol },
          ], { parent: plant });
          if (layer === 0 && !eastOpen) {
            V.box(842, 0, 410, 12, wh, 720, '#2a2f3a', { parent: plant });
            V.sign('EAST WING', 1000, 60, 410, { parent: plant, h: 30, color: 'rgba(255,255,255,.5)' });
          }
          if (owns('lights')) for (let x = 80; x < x1; x += 120) { const c = ['#ff4f9a', '#39f3ff', '#b67cff'][(x / 120) % 3 | 0]; lamps.push(V.box(x, 70, 63, 60, 6, 3, c, { parent: plant, glow: 1.2, shadow: false })); }
          if (owns('plants')) for (const [px, py] of [[70, 720], [800, 720], [70, 100]]) { V.box(px, 0, py, 20, 16, 20, '#8b5a2b', { parent: plant }); V.shape('sphereLo', px, 28, py, 32, 30, 32, '#3fb35a', { parent: plant }); }
          // lines
          for (const key of Object.keys(LINES)) {
            const ln = LINES[key];
            if (ln.layer !== layer) continue;
            if (key === 'east' && !eastOpen) continue;
            if (key === 'upper' && !owns('stairs')) continue;
            const len = ln.x1 - ln.x0 + 20;
            V.box(ln.x0 - 10 + len / 2, 0, ln.y, len, 12, 38, '#1b1e26', { parent: plant });
            const tex = beltTex(len);
            const top = V.box(ln.x0 - 10 + len / 2, 12, ln.y, len, 1, 30, '#ffffff', { parent: plant, map: tex, shadow: false });
            top.receiveShadow = true;
            belts.push(tex);
            for (let x = ln.x0; x < ln.x1; x += 80) for (const sd of [-1, 1]) V.box(x, 0, ln.y + sd * 17, 4, 12, 4, '#6a707c', { parent: plant, shadow: false });
            // furnace
            const fx = ln.x1 + 40;
            V.box(fx, 0, ln.y, 80, 70, 88, '#5a3a2a', { parent: plant });
            V.box(fx, 70, ln.y, 60, 30, 60, '#4a2e22', { parent: plant });
            V.box(fx - 10, 100, ln.y - 14, 14, 30, 14, '#3a2a20', { parent: plant });
            V.box(fx - 40.5, 8, ln.y, 1, 40, 56, '#1b1b22', { parent: plant, shadow: false });
            furnaceGlow.push(V.box(fx - 40, 12, ln.y, 2, 26, 44, '#ff7a2e', { parent: plant, glow: 1.6, shadow: false }));
            V.sign('FURNACE', fx, 130, ln.y, { parent: plant, h: 16, color: '#ffb454' });
            const c = COLLECTORS[key];
            V.box(c.x, 0, c.y, 60, 6, 44, auto ? '#2a3a2a' : '#1f6b3a', { parent: plant });
            V.box(c.x, 6, c.y, 48, 3, 32, auto ? '#3a4a3a' : '#3fd08a', { parent: plant, glow: auto ? 0 : 0.35, shadow: false });
          }
          // machines
          for (const it of ITEMS) {
            if (!owns(it.id) || layerOf(it) !== layer) continue;
            if (it.line === 'east' && !eastOpen) continue;
            const ln = LINES[it.line];
            if (it.kind === 'dropper') {
              const ore = ORES[it.ore];
              for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) V.box(it.x + dx * 20, 0, ln.y + dz * 24, 5, 58, 5, '#39414f', { parent: plant });
              V.box(it.x, 58, ln.y, 50, 34, 56, '#4a5160', { parent: plant });
              V.box(it.x, 92, ln.y, 40, 14, 44, U.shade(ore.color, -0.2), { parent: plant });
              V.box(it.x, 46, ln.y, 18, 12, 18, '#2a2f3a', { parent: plant });
              dropLights.push({ it, m: V.box(it.x + 18, 92, ln.y + 22.5, 6, 6, 2, '#1f3a2a', { parent: plant, shadow: false }) });
            } else if (it.kind === 'upgrader') {
              const col = upColor(it);
              for (const sd of [-1, 1]) V.box(it.x, 0, ln.y + sd * 30, 12, 64, 12, '#39414f', { parent: plant });
              V.box(it.x, 64, ln.y, 16, 12, 72, col, { parent: plant, glow: 0.6 });
              const ring = V.shape('torus', it.x, 32, ln.y, 60, 60, 30, col, { parent: plant, glow: 1, opacity: 0.8, shadow: false });
              ring.rotation.y = Math.PI / 2;
              upgRings.push(ring);
            }
          }
          if (layer === 1 && owns('monument')) {
            V.box(700, 0, 620, 90, 24, 90, '#b8860b', { parent: plant, metal: 0.6, rough: 0.3 });
            V.box(700, 24, 620, 40, 110, 40, '#ffd66b', { parent: plant, metal: 0.7, rough: 0.25, glow: 0.2 });
            lamps.push(V.shape('sphere', 700, 160, 620, 40, 40, 40, '#ffe9a8', { parent: plant, glow: 1.2 }));
            V.sign('GOLDEN FORGE', 700, 210, 620, { parent: plant, h: 22, color: '#ffd66b' });
          }
          if (owns('stairs')) {
            const st = STAIRS.find((s2) => s2.layer === layer);
            for (let i = 0; i < 5; i++) V.box(st.x, 0, st.y - 30 + i * 12, 56, layer ? 40 - i * 8 : 8 + i * 8, 12, U.shade('#9aa5b5', -i * 0.08), { parent: plant });
          }
        }

        return function sync(dt) {
          const t = ctx.time;
          const key = layer + '|' + d.owned.join(',') + '|' + auto;
          if (key !== builtKey) rebuild();
          V.look(me.x, 0, me.y - 50, { dist: 480, pitch: 0.86, fov: 45, lerp: 0.12 }, dt);
          for (const tex of belts) tex.offset.x = -((t * T.beltSpeed) / 48) % 1;
          lamps.forEach((l, i) => { l.material.emissiveIntensity = 0.9 + Math.sin(t * 3 + i) * 0.3; });
          furnaceGlow.forEach((f, i) => { f.scale.y = 26 * (0.8 + Math.sin(t * 12 + i) * 0.2); });
          upgRings.forEach((r2, i) => { r2.rotation.x = t * 2 + i; });
          for (const dl of dropLights) dl.m.material = V.mat((timers.get(dl.it.id) || 0) < 0.2 ? '#4ad17f' : '#1f3a2a', { glow: (timers.get(dl.it.id) || 0) < 0.2 ? 1.2 : 0 });
          // ore blocks
          let n = 0;
          for (const b of blocks) {
            if (LINES[b.line].layer !== layer || n >= 240) continue;
            const y = 13 + (b.drop > 0 ? b.drop * 150 : 0);
            p3.set(b.x, y + 8, b.y);
            q4.setFromAxisAngle(p3.clone().set(0, 1, 0), b.x * 0.02);
            const sc = b.passed.size ? 16 + b.passed.size * 2 : 16;
            m4.compose(p3, q4, s3.set(sc, sc, sc));
            oreMesh.setMatrixAt(n, m4);
            oreMesh.setColorAt(n, c3.set(b.passed.size ? U.mix(b.color, '#ffffff', 0.15 * b.passed.size) : b.color));
            n++;
          }
          oreMesh.count = n;
          oreMesh.instanceMatrix.needsUpdate = true;
          if (oreMesh.instanceColor) oreMesh.instanceColor.needsUpdate = true;
          // labels for machines near the player
          for (const it of ITEMS) {
            if (!owns(it.id) || layerOf(it) !== layer || !it.line) continue;
            if (Math.abs(it.x - me.x) > 520) continue;
            if (it.kind === 'dropper') V.label(it.x, 120, LINES[it.line].y, { name: it.name.replace(' Dropper', ''), color: '#cfd6e2' });
            if (it.kind === 'upgrader') V.label(it.x, 96, LINES[it.line].y, { name: 'x' + it.mult, color: upColor(it) });
          }
          for (const k of Object.keys(COLLECTORS)) {
            const c = COLLECTORS[k];
            if (c.layer !== layer) continue;
            if (!auto && pending[k] >= 1) V.label(c.x, 30, c.y, { name: '$' + U.fmt(Math.floor(pending[k])) + ' waiting', color: '#4ad17f' });
            else if (auto) V.label(c.x, 30, c.y, { name: 'AUTO', color: '#9aa5b5' });
          }
          // buy pads
          for (const it of ITEMS) {
            if (!available(it) || (it.id === 'east' && layer !== 0)) continue;
            const can = d.cash >= it.price;
            const m = padPool.use(it.id + (can ? 'y' : 'n'), () => { const g = V.group(); V.box(0, 0, 0, 84, 3, 56, can ? '#3fd08a' : '#ff5a6a', { parent: g, basic: true, opacity: 0.35, depthWrite: false, shadow: false }); V.box(0, 3, 0, 78, 1, 50, can ? '#3fd08a' : '#ff5a6a', { parent: g, basic: true, opacity: 0.6, shadow: false }); return g; });
            m.position.set(it.pad[0], 0, it.pad[1]);
            const on = hold && hold.item === it;
            V.label(it.pad[0], 26, it.pad[1], { name: it.name + ' · $' + U.fmt(it.price), color: can ? '#4ad17f' : '#ff8b98', hp: on ? Math.min(1, hold.t / T.buyHold) : null, hpColor: '#ffffff' });
          }
          padPool.sweep();
          if (owns('stairs')) { const st = STAIRS.find((s2) => s2.layer === layer); V.label(st.x, 70, st.y, { name: layer ? 'Down' : 'Upstairs', color: '#ffffff' }); }
          // people
          for (const bt of bots) {
            const rig = V.actor(bt.bot.id, bt.bot.avatar, { scale: 7.5 });
            rig.setPos(bt.x, 0, bt.y);
            rig.faceAngle(bt.a);
            const mv = bt._px != null && dt > 0 ? Math.hypot(bt.x - bt._px, bt.y - bt._py) / dt : 0;
            bt._px = bt.x; bt._py = bt.y;
            rig.set({ move: mv / 90 });
            V.label(bt.x, 54, bt.y, { name: bt.bot.displayName, color: '#ffffff', bubble: ctx.bubbleText(bt.bot.id) });
          }
          const rig = V.actor('me', ctx.player.avatar, { scale: 8 });
          rig.setPos(me.x, 0, me.y);
          rig.faceAngle(me.a);
          const mv = me._px != null && dt > 0 ? Math.hypot(me.x - me._px, me.y - me._py) / dt : 0;
          me._px = me.x; me._py = me.y;
          rig.set({ move: mv / T.speed });
          V.label(me.x, 58, me.y, { name: ctx.player.name, color: '#ffb454', bubble: ctx.bubbleText('me') });
          V.sweep();
        };
      })();

      return {
        update(dt) {
          parts.update(dt);
          floats.update(dt);
          if (phase !== 'play') return;
          const t = ctx.time;
          shift -= dt;
          if (shift <= 0) { finish(true); return; }
          if (stairsCd > 0) stairsCd -= dt;
          // droppers
          for (const it of droppers()) {
            const ore = ORES[it.ore];
            const since = (timers.get(it.id) || 0) + dt;
            if (since >= ore.every) { timers.set(it.id, 0); blocks.push({ line: it.line, x: it.x, y: LINES[it.line].y, v: ore.value, color: ore.color, passed: new Set(), drop: 0.25 }); }
            else timers.set(it.id, since);
          }
          // belts
          const m = mult();
          for (let i = blocks.length - 1; i >= 0; i--) {
            const b = blocks[i];
            if (b.drop > 0) { b.drop -= dt; continue; }
            b.x += T.beltSpeed * dt;
            for (const up of ITEMS) if (up.kind === 'upgrader' && up.line === b.line && owns(up.id) && !b.passed.has(up.id) && b.x >= up.x) { b.passed.add(up.id); b.v *= up.mult; if (LINES[b.line].layer === layer && Math.random() < 0.4) parts.emit(up.x, b.y, { count: 3, color: '#ffffff', speed: 60, life: 0.3 }); }
            if (b.x >= LINES[b.line].x1 + 20) { blocks.splice(i, 1); produce(b.line, b.v * m); }
          }
          // player
          const inp = ctx.input;
          const ax = inp.axis();
          if (Math.hypot(ax.x, ax.y) > 0.1) {
            me.x += ax.x * T.speed * dt; me.y += ax.y * T.speed * dt;
            me.a = Math.atan2(ax.y, ax.x); me.walk += dt * 12;
            P.clampTo(me, 12, bounds());
            for (const key of Object.keys(LINES)) { const ln = LINES[key]; if (ln.layer === layer) P.resolve(me, 12, [{ x: ln.x0 - 10, y: ln.y - 20, w: ln.x1 - ln.x0 + 90, h: 40 }]); }
          }
          // pads
          const pad = ITEMS.find((it) => available(it) && Math.abs(me.x - it.pad[0]) < 40 && Math.abs(me.y - it.pad[1]) < 28);
          if (pad) {
            if (!hold || hold.item !== pad) hold = { item: pad, t: 0 };
            hold.t += dt;
            if (hold.t >= T.buyHold && !hold.done) { hold.done = true; buy(pad); }
          } else hold = null;
          // collectors
          if (!auto) for (const key of Object.keys(COLLECTORS)) { const c = COLLECTORS[key]; if (c.layer === layer && U.dist(c.x, c.y, me.x, me.y) < 32) collect(key); }
          // stairs
          if (owns('stairs') && stairsCd <= 0) {
            const st = STAIRS.find((s) => s.layer === layer);
            if (U.dist(st.x, st.y, me.x, me.y) < 30) { layer = 1 - layer; stairsCd = 1; me.x = 150; me.y = 180; ctx.sfx('open'); ctx.banner(layer ? 'Upper Floor' : 'Ground Floor', '', 900); }
          }
          // bots
          for (const bt of bots) {
            bt.t -= dt; bt.buyT -= dt;
            if (bt.t <= 0) { bt.t = 2 + Math.random() * 4; const bb = bounds(); bt.tx = bb.x + 40 + Math.random() * (bb.w - 80); bt.ty = 460 + Math.random() * 260; }
            const ddx = bt.tx - bt.x, ddy = bt.ty - bt.y, l = Math.hypot(ddx, ddy);
            if (l > 5) { bt.x += (ddx / l) * 90 * dt; bt.y += (ddy / l) * 90 * dt; bt.a = Math.atan2(ddy, ddx); bt.walk += dt * 9; }
            if (bt.buyT <= 0) {
              bt.buyT = 30 + Math.random() * 50;
              const it = U.pick(ITEMS.filter((x) => x.price > 0 && x.price < bt.value / 2 + 5000));
              if (it) { bt.value += it.price; ctx.feed(bt.bot.displayName + ' bought ' + U.withArticle(it.name) + ' for their factory.', 'info', '#8fd3ff'); }
              else if (Math.random() < 0.5) ctx.botSay(bt.bot, 'any', 100);
            }
            bt.value += dt * 2;
          }
          if (shift < 30 && Math.floor(shift) !== Math.floor(shift + dt) && Math.floor(shift) % 10 === 0) ctx.banner(Math.floor(shift) + ' seconds left in the shift', goalHit ? '' : '$' + U.fmt(Math.max(0, Math.ceil(contract - produced))) + ' to go', 1100);
          const bb = bounds();
          cam.bounds = { x: 0, y: 0, w: Math.max(W, bb.x + bb.w + 40), h: Math.max(H, 800) };
          cam.follow(me.x, me.y - 70, dt, 0.15);
        },

        draw(g) {
          const t = ctx.time;
          g.fillStyle = '#12151c'; g.fillRect(0, 0, W, H);
          g.save();
          cam.apply(g);
          const bb = bounds();
          const eastOpen = layer === 0 && owns('east');
          // floor
          for (let y = 60; y < 760; y += 40) for (let x = 40; x < (layer === 0 ? 1400 : 840); x += 40) {
            const east = x >= 840;
            if (east && !eastOpen) continue;
            g.fillStyle = layer === 1 ? ((x + y) / 40 % 2 ? '#3a3350' : '#352f4a') : east ? ((x + y) / 40 % 2 ? '#3d4450' : '#39404c') : ((x + y) / 40 % 2 ? '#4a5160' : '#454c5a');
            g.fillRect(x, y, 40, 40);
          }
          // walls
          const wallCol = owns('walls') ? '#6a4a8a' : '#2a2f3a';
          g.fillStyle = wallCol;
          g.fillRect(30, 50, bb.w + 20, 12); g.fillRect(30, 758, bb.w + 20, 12); g.fillRect(30, 50, 12, 720); g.fillRect(bb.x + bb.w - 2, 50, 12, 720);
          if (layer === 0 && !eastOpen) { g.fillStyle = '#2a2f3a'; g.fillRect(836, 50, 12, 720); G.text(g, 'EAST WING', 900, 410, { size: 16, align: 'left', color: 'rgba(255,255,255,.25)', weight: 900 }); }
          if (owns('lights')) for (let x = 80; x < bb.x + bb.w; x += 120) { g.globalAlpha = 0.3 + Math.sin(t * 3 + x) * 0.1; G.circle(g, x, 58, 10, ['#ff4f9a', '#39f3ff', '#b67cff'][(x / 120) % 3 | 0]); g.globalAlpha = 1; }
          if (owns('plants')) for (const [px, py] of [[70, 720], [800, 720], [70, 100]]) { G.fillRR(g, px - 10, py - 4, 20, 16, 3, '#8b5a2b'); G.circle(g, px, py - 10, 14, '#3fb35a'); }
          // lines + machines
          for (const key of Object.keys(LINES)) {
            const ln = LINES[key];
            if (ln.layer !== layer) continue;
            if (key === 'east' && !eastOpen) continue;
            if (key === 'upper' && !owns('stairs')) continue;
            drawLine(g, key, t);
          }
          for (const b of blocks) {
            if (LINES[b.line].layer !== layer) continue;
            const y = b.y - (b.drop > 0 ? b.drop * 120 : 0);
            G.fillRR(g, b.x - 9, y - 9, 18, 18, 3, b.color);
            g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(b.x - 6, y - 6, 6, 4);
            if (b.passed.size) { g.globalAlpha = 0.5; G.ring(g, b.x, y, 12, '#ffffff', 1.5); g.globalAlpha = 1; }
          }
          for (const it of ITEMS) {
            if (!owns(it.id) || layerOf(it) !== layer) continue;
            if (it.line === 'east' && !eastOpen) continue;
            if (it.kind === 'dropper') drawDropper(g, it, t);
            if (it.kind === 'upgrader') drawUpgrader(g, it, t);
          }
          if (layer === 1 && owns('monument')) {
            const x = 700, y = 620;
            g.globalAlpha = 0.3 + Math.sin(t * 2) * 0.1; G.circle(g, x, y, 70, '#ffd66b'); g.globalAlpha = 1;
            G.fillRR(g, x - 40, y + 10, 80, 30, 4, '#b8860b'); G.fillRR(g, x - 18, y - 60, 36, 72, 6, '#ffd66b'); G.circle(g, x, y - 70, 18, '#ffe9a8');
            G.text(g, 'GOLDEN FORGE', x, y + 58, { size: 12, align: 'center', color: '#ffd66b', weight: 900 });
          }
          // stairs
          if (owns('stairs')) { const st = STAIRS.find((s) => s.layer === layer); for (let i = 0; i < 4; i++) G.fillRR(g, st.x - 26 + i * 4, st.y - 24 + i * 12, 52 - i * 8, 10, 2, U.shade('#9aa5b5', -i * 0.12)); G.text(g, layer ? 'Down' : 'Upstairs', st.x, st.y - 30, { size: 11, align: 'center', color: '#fff' }); }
          for (const it of ITEMS) if (available(it) && (it.id !== 'east' || layer === 0)) drawPad(g, it);
          for (const bt of bots) { G.avatarTop(g, bt.x, bt.y, 11, bt.bot.look, bt.a, { walk: bt.walk }); G.nameTag(g, bt.x, bt.y - 15, bt.bot.displayName, '#fff'); const b2 = ctx.bubbleText(bt.bot.id); if (b2) G.bubble(g, bt.x, bt.y - 34, b2); }
          G.avatarTop(g, me.x, me.y, 12, ctx.player.look, me.a, { walk: me.walk });
          G.nameTag(g, me.x, me.y - 16, ctx.player.name, '#ffb454');
          const mb = ctx.bubbleText('me');
          if (mb) G.bubble(g, me.x, me.y - 36, mb);
          parts.draw(g);
          floats.draw(g);
          g.restore();
          drawHud(g);
        },

        render3d(dt) { view(dt); },
        hud(g) { drawHud(g); },

        onBotJoin(b) { addBot(b); },
        onBotLeave(b) { const i = bots.findIndex((x) => x.bot.id === b.id); if (i >= 0) bots.splice(i, 1); },
        destroy() { for (const k of Object.keys(pending)) if (pending[k] > 0) d.cash += Math.floor(pending[k]); ctx.save(); },
      };

      function drawHud(g) {
          G.panel(g, 10, 10, 270, 84);
          G.text(g, '$' + U.fmt(Math.floor(d.cash)), 22, 40, { size: 24, weight: 800, color: '#4ad17f' });
          G.text(g, '$' + U.fmt(Math.round(rate())) + '/s', 268, 32, { size: 12, align: 'right', color: '#cfd6e2' });
          G.text(g, U.fmtClock(shift), 268, 50, { size: 14, align: 'right', color: shift < 30 ? '#ff8b98' : '#8fd3ff', weight: 800 });
          G.text(g, 'Contract', 22, 64, { size: 10, color: '#a1abbb' });
          G.bar(g, 22, 70, 170, 8, produced / contract, goalHit ? '#3fd08a' : '#ffb454');
          G.text(g, U.compact(Math.floor(produced)) + ' / ' + U.compact(contract), 268, 80, { size: 11, align: 'right', color: '#cfd6e2' });
          const rows = [{ name: ctx.player.name, v: myValue(), me: true }].concat(bots.map((b) => ({ name: b.bot.displayName, v: b.value }))).sort((a, b) => b.v - a.v).slice(0, 5);
          G.panel(g, W - 200, 10, 190, 24 + rows.length * 17);
          G.text(g, 'Factory value', W - 188, 27, { size: 11, color: '#a1abbb' });
          rows.forEach((r, i) => { G.text(g, r.name, W - 188, 45 + i * 17, { size: 11.5, color: r.me ? '#ffb454' : '#e8ecf3' }); G.text(g, '$' + U.compact(Math.floor(r.v)), W - 20, 45 + i * 17, { size: 11.5, align: 'right', color: '#4ad17f', weight: 800 }); });
          const next = ITEMS.find((it) => !owns(it.id) && (it.req || []).every(owns));
          if (next) G.text(g, 'Next: ' + next.name + ' · $' + U.fmt(next.price) + (layerOf(next) !== layer ? (layer ? ' (downstairs)' : ' (upstairs)') : ''), W / 2, H - 14, { size: 12, align: 'center', color: '#cfd6e2', stroke: 'rgba(0,0,0,.6)', strokeW: 3 });
      }
    },
  });

})((window.BF = window.BF || {}));
