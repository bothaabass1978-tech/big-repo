/**
 * Treasure Tycoon (gameType "treasuretycoon") — island resource tycoon.
 * Gather wood, stone, crystal and gold ore; upgrade the mill, quarry and
 * vault (passive production); hire workers who gather on their own; unlock
 * the jungle and the volcano; build cannons and fight off pirate raids that
 * try to steal gold from the vault. Island progress is saved.
 * Win: finish the session with net gold (produced minus stolen) at or above
 * the target. Lose: fall short.
 * Passes: foreman (workers gather 2x faster), charter (+1 worker, +25% vault).
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  const WW = 2400, WH = 1400, BEACH = 1180;
  const T = {
    session: 360, speed: 175, raids: [80, 200, 320], warn: 18, workerSpeed: 115, gatherBase: 2.1,
    rewards: { play: 15, win: 50, raid: 20, xpPlay: 30, xpWin: 110, xpRaid: 40, upgrade: 4 },
  };
  const RES = { wood: { name: 'Wood', color: '#b07a45' }, stone: { name: 'Stone', color: '#9aa5b5' }, crystal: { name: 'Crystal', color: '#7fe7ff' }, gold: { name: 'Gold', color: '#ffd66b' } };
  const NODE_TYPES = {
    tree: { res: 'wood', amount: 3, time: 1.1, charges: 4, regrow: 18, r: 20 },
    rock: { res: 'stone', amount: 3, time: 1.4, charges: 4, regrow: 22, r: 18 },
    crystal: { res: 'crystal', amount: 2, time: 1.9, charges: 3, regrow: 30, r: 16 },
    goldore: { res: 'gold', amount: 12, time: 2.4, charges: 3, regrow: 35, r: 18 },
  };
  const BUILDINGS = {
    mill: { name: 'Lumber Mill', x: 320, y: 760, res: 'wood', rates: [0, 0.4, 1, 2], costs: [null, null, { wood: 60, stone: 40 }, { wood: 200, stone: 150, crystal: 30 }] },
    quarry: { name: 'Stone Quarry', x: 700, y: 760, res: 'stone', rates: [0, 0.3, 0.8, 1.6], costs: [null, null, { wood: 50, stone: 60 }, { wood: 180, stone: 220, crystal: 30 }] },
    vault: { name: 'Treasure Vault', x: 510, y: 930, res: 'gold', rates: [0, 1, 2.5, 5], costs: [null, null, { wood: 100, stone: 100, crystal: 20 }, { wood: 300, stone: 300, crystal: 120 }] },
    hut: { name: "Workers' Hut", x: 250, y: 1030 },
    cannons: { name: 'Beach Cannons', x: 770, y: 1060, costs: [{ wood: 40, stone: 60 }, { wood: 120, stone: 150 }, { wood: 250, stone: 300, crystal: 40 }] },
  };
  const ZONES = {
    jungle: { name: 'Jungle', x0: 1000, x1: 1800, cost: { wood: 150, stone: 100 }, gate: { x: 1000, y: 700 } },
    volcano: { name: 'Volcano', x0: 1800, x1: WW, cost: { wood: 300, stone: 250, crystal: 80 }, gate: { x: 1800, y: 560 } },
  };
  const HIRE = [50, 150, 400, 900];
  const CANNON_SPOTS = [{ x: 420, y: 1140 }, { x: 620, y: 1150 }, { x: 820, y: 1140 }];

  const NODES0 = (() => {
    const r = U.rng('treasure-tycoon-island');
    const out = [];
    const place = (kind, n, x0, x1, y0, y1) => {
      let guard = 0;
      while (n > 0 && guard++ < 2000) {
        const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0);
        if (Object.values(BUILDINGS).some((b) => U.dist(b.x, b.y, x, y) < 110)) continue;
        if (out.some((o) => U.dist(o.x, o.y, x, y) < 60)) continue;
        if (y > BEACH - 60) continue;
        out.push({ kind, x, y, zone: x >= 1800 ? 'volcano' : x >= 1000 ? 'jungle' : 'home' });
        n--;
      }
    };
    place('tree', 14, 80, 960, 260, 1080);
    place('rock', 9, 80, 960, 260, 1080);
    place('tree', 22, 1040, 1760, 160, 1120);
    place('crystal', 8, 1300, 1760, 200, 700);
    place('rock', 6, 1040, 1760, 700, 1120);
    place('crystal', 8, 1840, 2360, 140, 900);
    place('goldore', 7, 1840, 2360, 140, 1000);
    place('rock', 5, 1840, 2360, 900, 1120);
    return out;
  })();

  function canPay(res, cost) { return Object.entries(cost).every(([k, v]) => (res[k] || 0) >= v); }
  function pay(res, cost) { for (const [k, v] of Object.entries(cost)) res[k] -= v; }
  const costText = (cost) => Object.entries(cost).map(([k, v]) => v + ' ' + RES[k].name.toLowerCase()).join(', ');

  BF.GameModules.register('treasuretycoon', {
    orders: ['follow', 'come', 'stay', 'leave', 'help', 'gather'],
    three: true,
    maxBots: 5,
    feedTop: 0.2,
    actions: { use: ['KeyE', 'Space'] },
    controls: { joystick: true, buttons: [{ act: 'use', label: 'Gather / Hit', icon: 'hammer' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const V = ctx.g3;
      const parts = V ? V.particles2d(14) : new BF.Particles(400);
      const floats = V ? V.floaters2d(60) : new BF.Floaters();
      const cam = new BF.Camera(W, H);
      cam.bounds = { x: 0, y: 0, w: WW, h: WH };
      const d = ctx.data;
      d.res = d.res || { wood: 20, stone: 10, crystal: 0, gold: 0 };
      d.levels = d.levels || { mill: 1, quarry: 1, vault: 1, cannons: 0 };
      d.workers = d.workers || 0;
      d.zones = d.zones || {};
      ctx.save();
      const foreman = ctx.hasPass('foreman');
      const charter = ctx.hasPass('charter');
      const maxWorkers = () => 3 + (charter ? 1 : 0);
      const vaultRate = () => BUILDINGS.vault.rates[d.levels.vault] * (charter ? 1.25 : 1);
      const target = Math.max(250, Math.round((vaultRate() * T.session * 0.7) / 10) * 10);

      let phase = 'play';
      let time = 0;
      let produced = 0, stolen = 0, raidsRepelled = 0, raidIdx = 0;
      let goalHit = false;
      let panel = null;
      let raid = null;
      let gather = null;
      const me = { x: 520, y: 1060, a: 0, walk: 0, atkCd: 0, swing: 0 };
      const nodes = NODES0.map((n) => Object.assign({}, n, NODE_TYPES[n.kind], { left: NODE_TYPES[n.kind].charges, regrowT: 0 }));
      const acc = { wood: 0, stone: 0, gold: 0 };
      const balls = [];
      let saveT = 0;

      const unlocked = (n) => n.zone === 'home' || d.zones[n.zone];
      function addRes(k, n, x, y) {
        d.res[k] = (d.res[k] || 0) + n;
        if (k === 'gold') { produced += n; ctx.addStat('gold', n); }
        if (x != null) floats.add(x, y - 22, '+' + n + ' ' + RES[k].name.toLowerCase(), RES[k].color, 13);
        if (!goalHit && produced - stolen >= target) { goalHit = true; ctx.banner('TREASURE TARGET REACHED!', 'Protect it from the pirates until the end', 2200); ctx.sfx('levelup'); }
      }

      // ------------------------------------------------------------- workers
      const workers = [];
      function spawnWorker() {
        const hut = BUILDINGS.hut;
        workers.push({ x: hut.x, y: hut.y + 30, a: 0, walk: 0, state: 'idle', node: null, t: 0, carry: null, look: { skin: U.pick(['#f1c27d', '#c68642', '#8d5524', '#e0ac69']), shirt: U.pick(['#ffb454', '#4ad17f', '#46a8ff']), pants: '#5b6b3a', shoes: '#39414f', hair: '#1b1b22', hat: '#c8a46a', hatStyle: 'cap' } });
      }
      for (let i = 0; i < d.workers; i++) spawnWorker();
      function workerStep(w, dt) {
        const home = BUILDINGS.vault;
        const sp = T.workerSpeed * (foreman ? 1.3 : 1);
        if (w.state === 'idle') {
          const counts = { wood: d.res.wood, stone: d.res.stone, crystal: d.res.crystal * 3 };
          const want = Object.keys(counts).sort((a, b) => counts[a] - counts[b]);
          for (const res of want) {
            const opts = nodes.filter((n) => n.res === res && n.left > 0 && unlocked(n) && !workers.some((o) => o !== w && o.node === n));
            if (opts.length) { w.node = opts.reduce((b, n) => (U.dist(n.x, n.y, w.x, w.y) < U.dist(b.x, b.y, w.x, w.y) ? n : b), opts[0]); w.state = 'go'; break; }
          }
        } else if (w.state === 'go') {
          if (!w.node || w.node.left <= 0) { w.state = 'idle'; return; }
          if (moveTo(w, w.node.x, w.node.y + w.node.r + 8, sp, dt)) { w.state = 'work'; w.t = 0; }
        } else if (w.state === 'work') {
          w.t += dt * (foreman ? 2 : 1);
          if (Math.random() < 0.08) parts.emit(w.node.x, w.node.y, { count: 1, color: RES[w.node.res].color, speed: 60, life: 0.3 });
          if (w.t >= T.gatherBase * (ctx.hasPass('hustle') ? 0.65 : 1)) { if (w.node.left > 0) { w.node.left--; w.carry = { res: w.node.res, n: w.node.amount }; if (w.node.left <= 0) w.node.regrowT = w.node.regrow; } w.state = w.carry ? 'back' : 'idle'; }
        } else if (w.state === 'back') {
          if (moveTo(w, home.x, home.y + 50, sp, dt)) { addRes(w.carry.res, w.carry.n); w.carry = null; w.state = 'idle'; }
        }
      }
      function moveTo(e, x, y, sp, dt) {
        const dx = x - e.x, dy = y - e.y, l = Math.hypot(dx, dy);
        if (l < 6) return true;
        const k = Math.min(1, (sp * dt) / l);
        e.x += dx * k; e.y += dy * k; e.a = Math.atan2(dy, dx); e.walk += dt * 10;
        return false;
      }

      // ---------------------------------------------------------------- bots
      const bots = [];
      function addBot(b) { const r = U.rng(b.id + ':tt'); bots.push({ bot: b, x: 300 + r() * 600, y: 700 + r() * 300, a: 0, walk: 0, node: null, t: 0, atkCd: 0, lvl: ctx.botLevel(b) || 10 }); }
      ctx.bots.forEach(addBot);
      function botStep(bt, dt) {
        // orders from chat: follow/come/stay/leave move the bot; "help"/"gather" means its haul goes to you
        const ord = ctx.botOrder(bt.bot.id);
        const og = ord && !['help', 'gather', 'attack'].includes(ord.verb) ? BF.orders.goal(ctx, bt.bot.id, bt, me, { near: 45 }) : null;
        if (og && !(raid && raid.pirates.length && ord.verb === 'follow')) { if (!og.hold) moveTo(bt, og.x, og.y, T.speed, dt); return; }
        if (raid && raid.pirates.length) {
          const p = raid.pirates.reduce((best, x) => (U.dist(x.x, x.y, bt.x, bt.y) < U.dist(best.x, best.y, bt.x, bt.y) ? x : best), raid.pirates[0]);
          if (!moveTo(bt, p.x, p.y, 140, dt)) return;
          bt.atkCd -= dt;
          if (bt.atkCd <= 0) { bt.atkCd = 0.9; hitPirate(p, 10 + bt.lvl / 5, false); }
          return;
        }
        if (!bt.node || bt.node.left <= 0 || !unlocked(bt.node)) { const opts = nodes.filter((n) => n.left > 0 && n.zone === 'home'); bt.node = U.pick(opts) || null; bt.t = 0; }
        if (bt.node && moveTo(bt, bt.node.x + 24, bt.node.y + bt.node.r, 120, dt)) {
          bt.t += dt;
          if (bt.t > 3) {
            bt.t = 0;
            if (ord && (ord.verb === 'help' || ord.verb === 'gather') && bt.node.left > 0) { addRes(bt.node.res, Math.max(1, Math.round(bt.node.amount / 2)), bt.node.x, bt.node.y); ctx.feed(bt.bot.displayName + ' gathered ' + RES[bt.node.res].name.toLowerCase() + ' for you.', 'info', RES[bt.node.res].color); }
            bt.node.left = Math.max(0, bt.node.left - 1); if (bt.node.left <= 0) bt.node.regrowT = bt.node.regrow; bt.node = null;
          }
        }
      }

      // --------------------------------------------------------------- raids
      function startRaid() {
        raidIdx++;
        const n = 2 + raidIdx * 2;
        const ship = { x: 520 + (Math.random() - 0.5) * 300, y: WH + 60, ty: BEACH + 90, landed: false };
        raid = { ship, pirates: [], robbed: false, n, spawned: 0, t: 0, over: false, leaving: false };
        ctx.banner('PIRATES HAVE LANDED!', 'Defend the vault!', 1800);
        ctx.sfx('explosion');
      }
      function hitPirate(p, dmg, byMe) {
        p.hp -= dmg;
        p.flash = 0.1;
        parts.emit(p.x, p.y, { count: 5, color: '#ff5a6a', speed: 100, life: 0.3 });
        if (byMe) ctx.sfx('hit');
        if (p.hp <= 0) {
          raid.pirates.splice(raid.pirates.indexOf(p), 1);
          parts.emit(p.x, p.y, { count: 16, colors: ['#1f2a44', '#ff5a6a', '#ffffff'], speed: 160, life: 0.5 });
          if (byMe) { ctx.playerStat('kills', 1); ctx.quest('kill', 1); }
        }
      }
      function raidStep(dt) {
        const r = raid;
        r.t += dt;
        const s = r.ship;
        if (!s.landed) { s.y = Math.max(s.ty, s.y - 120 * dt); if (s.y <= s.ty) s.landed = true; }
        else if (r.spawned < r.n && r.t > 0.4 * r.spawned + 3) { r.spawned++; const hp = 45 + raidIdx * 20; r.pirates.push({ x: s.x + (Math.random() - 0.5) * 60, y: BEACH + 30, hp, maxHp: hp, a: -Math.PI / 2, walk: 0, loot: 0, flash: 0 }); }
        const vault = BUILDINGS.vault;
        for (const p of r.pirates.slice()) {
          if (p.flash > 0) p.flash -= dt;
          if (p.loot) {
            if (moveTo(p, s.x, BEACH + 30, 80, dt)) { r.pirates.splice(r.pirates.indexOf(p), 1); }
          } else if (moveTo(p, vault.x, vault.y + 40, 58 + raidIdx * 6, dt)) {
            const take = Math.min(d.res.gold, Math.max(5, Math.floor(d.res.gold * 0.08)));
            p.loot = take;
            d.res.gold -= take;
            stolen += take;
            r.robbed = true;
            floats.add(vault.x, vault.y - 50, '-' + take + ' gold stolen!', '#ff5a6a', 15);
            ctx.sfx('lose', { volume: 0.5 });
          }
        }
        // cannons
        const nc = d.levels.cannons;
        for (let i = 0; i < nc; i++) {
          const c = CANNON_SPOTS[i];
          c.cd = (c.cd || 0) - dt;
          if (c.cd > 0) continue;
          const tgt = r.pirates.filter((p) => !p.loot && U.dist(p.x, p.y, c.x, c.y) < 300).sort((a, b) => U.dist(a.x, a.y, c.x, c.y) - U.dist(b.x, b.y, c.x, c.y))[0];
          if (tgt) { c.cd = 1.5; c.aim = U.angleTo(c.x, c.y, tgt.x, tgt.y); balls.push({ x: c.x, y: c.y, tx: tgt.x, ty: tgt.y, t: 0, dur: 0.45, tgt }); ctx.sfx('shoot', { volume: 0.4 }); }
        }
        if (s.landed && r.spawned >= r.n && !r.pirates.length && !r.over) {
          r.over = true;
          if (!r.robbed) {
            raidsRepelled++;
            ctx.badge('tt_raid');
            ctx.reward(T.rewards.raid, 'pirate raids');
            ctx.xp(T.rewards.xpRaid);
            ctx.banner('RAID REPELLED!', 'The vault is safe', 1800);
            ctx.sfx('win');
            const b = U.pick(bots); if (b) ctx.botSay(b.bot, 'win', 500);
          } else { ctx.banner('The pirates sailed off', U.fmt(stolen) + ' gold stolen so far. Build more cannons!', 2000); const b = U.pick(bots); if (b) ctx.botSay(b.bot, 'lose', 500); }
        }
        if (r.over) { s.y += 90 * dt; if (s.y > WH + 120) raid = null; }
      }

      // --------------------------------------------------------------- panels
      function closePanel() { panel = null; ctx.ui.remove('bld'); }
      function openPanel(id) { panel = id; ctx.sfx('open'); renderPanel(); }
      const resRow = () => '<p class="faint">You have ' + Object.keys(RES).map((k) => '<b style="color:' + RES[k].color + '">' + Math.floor(d.res[k] || 0) + '</b> ' + RES[k].name.toLowerCase()).join(' · ') + '</p>';
      function renderPanel() {
        if (!panel) return;
        const close = '<button class="btn btn-ghost btn-sm gp-close" data-gact="close" aria-label="Close">' + BF.icon('x', 14) + '</button>';
        let html = '';
        if (panel === 'mill' || panel === 'quarry' || panel === 'vault') {
          const b = BUILDINGS[panel], lvl = d.levels[panel], next = b.costs[lvl + 1];
          html = '<h3>' + BF.icon('anvil', 18) + ' ' + b.name + ' · Level ' + lvl + '</h3><p>Produces ' + (b.rates[lvl] * (panel === 'vault' && charter ? 1.25 : 1)).toFixed(1) + ' ' + RES[b.res].name.toLowerCase() + ' per second.' + (next ? ' Level ' + (lvl + 1) + ': ' + (b.rates[lvl + 1] * (panel === 'vault' && charter ? 1.25 : 1)).toFixed(1) + ' per second.' : ' Fully upgraded!') + '</p>' + resRow() +
            (next ? '<div class="gp-actions"><button class="btn btn-primary" data-gact="up-' + panel + '"' + (canPay(d.res, next) ? '' : ' disabled') + '>Upgrade · ' + costText(next) + '</button></div>' : '');
        } else if (panel === 'hut') {
          const n = d.workers, cost = HIRE[n];
          html = '<h3>' + BF.icon('users', 18) + " Workers' Hut</h3><p>Workers gather wood, stone and crystal for you and bring it to the vault" + (foreman ? ' (Master Foreman: 2x speed)' : '') + '. Workers: <b>' + n + ' / ' + maxWorkers() + '</b>.</p>' + resRow() +
            (n < maxWorkers() ? '<div class="gp-actions"><button class="btn btn-primary" data-gact="hire"' + (d.res.gold >= cost ? '' : ' disabled') + '>Hire a worker · ' + cost + ' gold</button></div>' : '<p class="faint">All worker slots are full' + (charter ? '.' : '. The Royal Charter pass adds one more.') + '</p>');
        } else if (panel === 'cannons') {
          const lvl = d.levels.cannons, next = BUILDINGS.cannons.costs[lvl];
          html = '<h3>' + BF.icon('shield', 18) + ' Beach Cannons</h3><p>Cannons fire at pirates who come ashore. You have <b>' + lvl + ' / 3</b> cannons.</p>' + resRow() +
            (next ? '<div class="gp-actions"><button class="btn btn-primary" data-gact="cannon"' + (canPay(d.res, next) ? '' : ' disabled') + '>Build cannon ' + (lvl + 1) + ' · ' + costText(next) + '</button></div>' : '<p class="faint">The beach is fully defended.</p>');
        } else if (panel === 'jungle' || panel === 'volcano') {
          const z = ZONES[panel];
          const blocked = panel === 'volcano' && !d.zones.jungle;
          html = '<h3>' + BF.icon(panel === 'volcano' ? 'fire' : 'mapPin', 18) + ' ' + z.name + '</h3><p>' + (panel === 'jungle' ? 'Clear a path into the jungle: dense trees, rocks and a crystal cave.' : 'Build a bridge across the lava: huge crystals and gold ore.') + '</p>' + resRow() +
            (blocked ? '<p class="faint">Open the jungle first.</p>' : '<div class="gp-actions"><button class="btn btn-primary" data-gact="zone-' + panel + '"' + (canPay(d.res, z.cost) ? '' : ' disabled') + '>' + (panel === 'jungle' ? 'Clear the path' : 'Build the bridge') + ' · ' + costText(z.cost) + '</button></div>');
        }
        ctx.ui.panel('bld', close + html, 'center');
      }
      ctx.ui.on((a) => {
        if (a === 'close') return closePanel();
        if (a.indexOf('up-') === 0) {
          const id = a.slice(3), b = BUILDINGS[id], next = b.costs[d.levels[id] + 1];
          if (!next || !canPay(d.res, next)) return;
          pay(d.res, next); d.levels[id]++; ctx.save();
          ctx.sfx('build'); ctx.reward(T.rewards.upgrade, 'island upgrades'); ctx.xp(15);
          parts.emit(b.x, b.y, { count: 30, colors: ['#ffd66b', '#ffffff'], speed: 180, life: 0.6 });
          ctx.feed(b.name + ' upgraded to level ' + d.levels[id] + '!', 'star', '#ffd66b');
          renderPanel();
        }
        if (a === 'hire' && d.workers < maxWorkers() && d.res.gold >= HIRE[d.workers]) {
          d.res.gold -= HIRE[d.workers]; d.workers++; ctx.save(); spawnWorker(); ctx.sfx('purchase');
          if (d.workers >= 3) ctx.badge('tt_workers');
          ctx.feed('A new worker joined your island.', 'star', '#8fd3ff');
          renderPanel();
        }
        if (a === 'cannon') {
          const next = BUILDINGS.cannons.costs[d.levels.cannons];
          if (!next || !canPay(d.res, next)) return;
          pay(d.res, next); d.levels.cannons++; ctx.save(); ctx.sfx('build');
          ctx.feed('Cannon ' + d.levels.cannons + ' built on the beach.', 'star', '#ffd66b');
          renderPanel();
        }
        if (a.indexOf('zone-') === 0) {
          const id = a.slice(5), z = ZONES[id];
          if (d.zones[id] || !canPay(d.res, z.cost) || (id === 'volcano' && !d.zones.jungle)) return;
          pay(d.res, z.cost); d.zones[id] = true; ctx.save();
          if (id === 'volcano') ctx.badge('tt_volcano');
          ctx.sfx('powerup'); ctx.reward(10, 'island expansion');
          ctx.banner(z.name.toUpperCase() + ' UNLOCKED', '', 1800);
          closePanel();
        }
      });

      function finish() {
        if (phase !== 'play') return;
        phase = 'over';
        closePanel();
        ctx.save();
        const net = produced - stolen;
        const win = net >= target;
        ctx.best('bestScore', net, 'max');
        ctx.end({
          outcome: win ? 'win' : 'lose',
          title: win ? 'Treasure empire!' : 'Not enough treasure',
          subtitle: 'Net gold ' + U.fmt(net) + ' / ' + U.fmt(target) + ' · raids repelled ' + raidsRepelled + '/' + T.raids.length,
          coins: T.rewards.play + (win ? T.rewards.win : 0),
          xp: T.rewards.xpPlay + (win ? T.rewards.xpWin : 0),
          stats: [['Gold produced', U.fmt(produced)], ['Gold stolen', U.fmt(stolen)], ['Raids repelled', raidsRepelled + ' / ' + T.raids.length], ['Workers', d.workers], ['Vault level', d.levels.vault]],
        });
      }

      const stations = () => ['mill', 'quarry', 'vault', 'hut', 'cannons'].map((id) => ({ id, x: BUILDINGS[id].x, y: BUILDINGS[id].y })).concat(Object.entries(ZONES).filter(([id]) => !d.zones[id]).map(([id, z]) => ({ id, x: z.gate.x, y: z.gate.y })));
      function blockedX(x, y) {
        if (x < 20 || x > WW - 20 || y < 60 || y > BEACH + 60) return true;
        for (const [id, z] of Object.entries(ZONES)) if (!d.zones[id] && x > z.x0 - 14) return true;
        return false;
      }

      // ----------------------------------------------------------------- draw
      function drawNode(g, n, t) {
        if (n.left <= 0) { G.circle(g, n.x, n.y + 6, 8, 'rgba(0,0,0,.25)'); return; }
        const shake = gather && gather.node === n ? Math.sin(t * 40) * 1.5 : 0;
        const x = n.x + shake, y = n.y;
        G.shadow(g, x, y + n.r * 0.7, n.r, n.r * 0.35, 0.3);
        if (n.kind === 'tree') { const jungle = n.zone !== 'home'; g.fillStyle = '#7a4a2a'; g.fillRect(x - 4, y - 4, 8, 22); G.circle(g, x, y - 12, n.r, jungle ? '#1f7a3a' : '#2f9a47'); G.circle(g, x - 7, y - 18, n.r * 0.45, jungle ? '#2f9a4a' : '#4ab35a'); }
        else if (n.kind === 'rock') { G.fillRR(g, x - n.r, y - n.r * 0.8, n.r * 2, n.r * 1.6, 8, n.zone === 'volcano' ? '#3a3440' : '#7a8494'); G.fillRR(g, x - n.r * 0.6, y - n.r * 0.8, n.r, n.r * 0.6, 5, n.zone === 'volcano' ? '#5a5060' : '#9aa5b5'); }
        else if (n.kind === 'crystal') { for (const [ox, h] of [[-7, 26], [4, 34], [11, 20]]) { g.fillStyle = '#7fe7ff'; g.beginPath(); g.moveTo(x + ox - 6, y + 8); g.lineTo(x + ox, y + 8 - h); g.lineTo(x + ox + 6, y + 8); g.closePath(); g.fill(); } g.globalAlpha = 0.25 + Math.sin(t * 3 + x) * 0.1; G.circle(g, x, y - 6, 24, '#7fe7ff'); g.globalAlpha = 1; }
        else { G.fillRR(g, x - n.r, y - n.r * 0.8, n.r * 2, n.r * 1.6, 8, '#4a3a30'); for (const [ox, oy] of [[-6, -4], [5, 2], [0, -10]]) G.circle(g, x + ox, y + oy, 4, '#ffd66b'); }
        if (n.left < n.charges) for (let i = 0; i < n.charges; i++) G.circle(g, x - (n.charges - 1) * 4 + i * 8, y + n.r + 10, 2.5, i < n.left ? '#ffffff' : 'rgba(255,255,255,.25)');
      }
      function drawBuilding(g, id, t) {
        const b = BUILDINGS[id];
        const x = b.x, y = b.y;
        G.shadow(g, x, y + 40, 60, 14, 0.3);
        if (id === 'vault') { G.fillRR(g, x - 56, y - 40, 112, 80, 10, '#6a707c'); G.fillRR(g, x - 46, y - 30, 92, 60, 8, '#8a94a6'); G.ring(g, x, y, 20, '#ffd66b', 5); G.line(g, x, y, x + Math.cos(t) * 14, y + Math.sin(t) * 14, '#ffd66b', 3); }
        else if (id === 'hut') { G.fillRR(g, x - 50, y - 30, 100, 60, 6, '#a86b3c'); g.fillStyle = '#7a4a2a'; g.beginPath(); g.moveTo(x - 60, y - 26); g.lineTo(x, y - 62); g.lineTo(x + 60, y - 26); g.closePath(); g.fill(); }
        else if (id === 'cannons') { G.fillRR(g, x - 40, y - 24, 80, 48, 6, '#5a4a3a'); G.text(g, 'Cannons', x, y + 5, { size: 11, align: 'center', color: '#fff' }); }
        else { G.fillRR(g, x - 58, y - 38, 116, 76, 8, id === 'mill' ? '#8b5a2b' : '#6a707c'); G.fillRR(g, x - 48, y - 28, 96, 30, 6, id === 'mill' ? '#b07a45' : '#9aa5b5'); if (id === 'mill') { g.save(); g.translate(x + 40, y - 40); g.rotate(t * (0.6 + d.levels.mill * 0.4)); for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.fillStyle = '#e8d3a8'; g.fillRect(-3, 0, 6, 34); } g.restore(); } }
        const lvl = d.levels[id];
        const label = b.name + (lvl != null ? ' · L' + lvl : id === 'hut' ? ' · ' + d.workers + '/' + maxWorkers() : '');
        G.text(g, label, x, y - 52, { size: 12, align: 'center', color: '#fff', weight: 800, stroke: 'rgba(0,0,0,.6)', strokeW: 3 });
      }

      // ------------------------------------------------------------ 3D view
      const PIRATE = { skin: '#e0ac69', equipped: { face: { style: 'determined' }, shirt: { style: 'stripe', c1: '#b0412e', c2: '#f4f1ea' }, pants: { style: 'plain', c1: '#1f2a44' }, hat: { style: 'bandana', c1: '#1b1b22' } } };
      const view = !V ? null : (() => {
        V.preset('day', { fogNear: 1100, fogFar: 3000 });
        V.shadowSize(620);
        const L = BEACH + 40;
        V.ground(0, 0, 1000, L, '#ffffff', { map: BF.g3d.gridTex('#5fae52', 'rgba(0,0,0,0)', 1, { check: '#58a64b', repeat: [1000 / 160, L / 160], noise: true }) });
        V.ground(1000, 0, 1800, L, '#ffffff', { map: BF.g3d.gridTex('#2f7a3a', 'rgba(0,0,0,0)', 1, { check: '#2a7035', repeat: [800 / 160, L / 160], noise: true }) });
        V.ground(1800, 0, WW, L, '#ffffff', { map: BF.g3d.gridTex('#3a2a2a', 'rgba(0,0,0,0)', 1, { check: '#34262a', repeat: [600 / 160, L / 160], noise: true }) });
        V.ground(-600, L, WW + 600, BEACH + 120, '#e8d08a', { y: -1, map: BF.g3d.gridTex('#e8d08a', 'rgba(0,0,0,0)', 1, { repeat: [30, 2], noise: true }) });
        V.ground(-3000, -1600, WW + 3000, WH + 2600, '#16608f', { y: -14 });
        const sea = V.ground(-3000, BEACH + 110, WW + 3000, WH + 2600, '#1f7fb8', { y: -4, opacity: 0.85, rough: 0.2 });
        V.ground(-3000, -1600, 0, BEACH + 120, '#2f7a3a', { y: -0.5 });
        V.ground(WW, -1600, WW + 3000, BEACH + 120, '#3a2a2a', { y: -0.5 });
        V.ground(-600, -1600, WW + 600, 0, '#2a5a2a', { y: -0.5 });
        // lava river and the volcano
        V.box(1800, -2, (60 + BEACH + 40) / 2, 22, 3, BEACH - 20, '#ff5a1f', { glow: 1.4, shadow: false });
        const lavaCore = V.box(1800, -1, (60 + BEACH + 40) / 2, 8, 3, BEACH - 20, '#ffd66b', { glow: 1.6, shadow: false });
        const volcano = V.shape('cone', 2150, 110, 300, 460, 220, 400, '#4a2e28', { flat: true });
        volcano.receiveShadow = true;
        V.shape('cyl', 2150, 216, 300, 120, 8, 110, '#ff5a1f', { glow: 1.5, shadow: false });
        let bridge = null;
        // locked zone veils and the jungle hedge
        const veils = {};
        for (const [id, z] of Object.entries(ZONES)) {
          const g = V.group();
          V.ground(z.x0, 0, z.x1, L, '#080a10', { parent: g, y: 1, basic: true, opacity: 0.35, depthWrite: false });
          if (id === 'jungle') V.boxes(Array.from({ length: 40 }, (_, i) => ({ x: z.x0 + (i % 2) * 10, y: 0, z: 70 + i * 28, w: 44, h: 48, d: 44, color: i % 2 ? '#1f5a2a' : '#256a30' })), { parent: g, geo: 'sphereLo' });
          veils[id] = g;
        }
        // buildings
        const bg = {};
        const B = BUILDINGS;
        const mill = V.group(); mill.position.set(B.mill.x, 0, B.mill.y);
        V.box(0, 0, 0, 110, 60, 70, '#8b5a2b', { parent: mill }); V.box(0, 60, 0, 116, 10, 76, '#b07a45', { parent: mill });
        const blades = V.group(mill); blades.position.set(40, 60, 38);
        for (let i = 0; i < 4; i++) { const b2 = V.box(0, 0, 0, 8, 46, 2, '#e8d3a8', { parent: blades }); b2.geometry = BF.g3d.geo('box'); b2.position.set(0, 0, 0); b2.rotation.z = (i * Math.PI) / 2; b2.translateY(23); }
        bg.blades = blades;
        const quarry = V.group(); quarry.position.set(B.quarry.x, 0, B.quarry.y);
        V.box(0, 0, 0, 110, 50, 70, '#6a707c', { parent: quarry }); V.box(-20, 50, 0, 40, 30, 40, '#9aa5b5', { parent: quarry }); V.box(30, 0, 40, 30, 16, 20, '#9aa5b5', { parent: quarry });
        const vault = V.group(); vault.position.set(B.vault.x, 0, B.vault.y);
        V.box(0, 0, 0, 112, 70, 80, '#6a707c', { parent: vault, metal: 0.3 }); V.box(0, 70, 0, 100, 8, 70, '#8a94a6', { parent: vault });
        V.shape('torus', 0, 36, 41, 44, 44, 30, '#ffd66b', { parent: vault, metal: 0.6, rough: 0.3 });
        bg.dial = V.box(0, 30, 42, 3, 14, 2, '#ffd66b', { parent: vault });
        const hut = V.group(); hut.position.set(B.hut.x, 0, B.hut.y);
        V.box(0, 0, 0, 100, 44, 60, '#a86b3c', { parent: hut });
        for (const sd of [-1, 1]) { const slope = V.box(0, 0, 0, 112, 6, 44, '#7a4a2a', { parent: hut }); slope.position.set(0, 56, sd * 16); slope.rotation.x = sd * 0.62; }
        // closed gable ends: a diamond prism squashed into a triangle above the walls
        { const gab = V.group(hut); gab.position.y = 44; gab.scale.set(1, 0.43, 1); const pr = V.box(0, 0, 0, 98, 42.4, 42.4, '#9a6034', { parent: gab }); pr.position.y = 0; pr.rotation.x = Math.PI / 4; }
        V.box(0, 67, 0, 114, 4, 5, '#5a3a20', { parent: hut });
        for (const x of [-30, 30]) V.box(x, 16, 30.5, 16, 14, 2, '#bfe6ff', { parent: hut, shadow: false });
        V.box(0, 0, 30.5, 18, 28, 2, '#5a3a20', { parent: hut });
        const bat = V.group(); bat.position.set(B.cannons.x, 0, B.cannons.y);
        V.box(0, 0, 0, 80, 10, 48, '#5a4a3a', { parent: bat }); V.box(0, 10, -16, 80, 16, 10, '#7a6a5a', { parent: bat });
        const cannons = CANNON_SPOTS.map((c) => {
          const g = V.group(); g.position.set(c.x, 0, c.y);
          V.shape('cyl', 0, 6, 0, 28, 12, 28, '#39414f', { parent: g });
          const barrel = V.group(g); barrel.position.y = 16;
          const b2 = V.shape('cyl', 14, 0, 0, 12, 30, 12, '#2a2f3a', { parent: barrel, metal: 0.5 }); b2.rotation.z = Math.PI / 2;
          g.userData.barrel = barrel;
          return g;
        });
        const nodePool = V.pool(), ballPool = V.pool();
        let ship = null;
        function nodeModel(n) {
          const g = V.group();
          if (n.left <= 0) { V.shape('cylLo', 0, 3, 0, 16, 6, 16, n.kind === 'tree' ? '#7a4a2a' : '#6a707c', { parent: g }); return g; }
          if (n.kind === 'tree') {
            const jungle = n.zone !== 'home';
            V.shape('cylLo', 0, 16, 0, 10, 32, 10, '#7a4a2a', { parent: g });
            V.shape(jungle ? 'sphereLo' : 'cone', 0, jungle ? 42 : 50, 0, n.r * 2.6, jungle ? n.r * 2.2 : n.r * 3, n.r * 2.6, jungle ? '#1f7a3a' : '#2f9a47', { parent: g, flat: true });
          } else if (n.kind === 'rock') {
            V.shape('dodeca', 0, n.r * 0.6, 0, n.r * 2.2, n.r * 1.4, n.r * 2, n.zone === 'volcano' ? '#3a3440' : '#7a8494', { parent: g, flat: true });
          } else if (n.kind === 'crystal') {
            for (const [ox, h, oz] of [[-7, 30, 2], [5, 42, -4], [11, 24, 6]]) V.shape('octa', ox, h / 2, oz, 12, h, 12, '#7fe7ff', { parent: g, glow: 0.7, opacity: 0.92, flat: true, shadow: false });
          } else {
            V.shape('dodeca', 0, n.r * 0.6, 0, n.r * 2.2, n.r * 1.4, n.r * 2, '#4a3a30', { parent: g, flat: true });
            for (const [ox, oy, oz] of [[-6, 16, 8], [6, 10, 10], [0, 22, 2]]) V.shape('octa', ox, oy, oz, 8, 8, 8, '#ffd66b', { parent: g, metal: 0.6, rough: 0.3, glow: 0.3 });
          }
          return g;
        }
        function shipModel() {
          const g = V.group();
          V.box(0, -10, 0, 150, 30, 56, '#5a3a2a', { parent: g });
          V.box(0, 20, 0, 136, 6, 48, '#7a4a2a', { parent: g });
          V.box(62, 20, 0, 30, 20, 50, '#5a3a2a', { parent: g });
          V.box(0, 26, 0, 6, 110, 6, '#3a2a1e', { parent: g });
          V.box(4, 60, 0, 2, 60, 80, '#1b1b22', { parent: g, side: 2 });
          V.shape('sphere', 6, 92, 0, 16, 16, 4, '#f4f1ea', { parent: g, basic: true });
          return g;
        }
        const workerLook = (w) => w.look;

        return function sync(dt) {
          const t = ctx.time;
          V.look(me.x, 0, me.y, { dist: 480, pitch: 0.86, fov: 45, lerp: 0.12 }, dt);
          sea.position.y = -4 + Math.sin(t) * 1.5;
          lavaCore.material.emissiveIntensity = 1.3 + Math.sin(t * 3) * 0.4;
          for (const [id, g] of Object.entries(veils)) g.visible = !d.zones[id];
          if (d.zones.volcano && !bridge) { bridge = V.box(1800, 0, 560, 60, 4, 60, '#7a4a2a'); }
          bg.blades.rotation.z = t * (0.6 + d.levels.mill * 0.4);
          bg.dial.rotation.z = t;
          cannons.forEach((c, i) => { c.visible = i < d.levels.cannons; const cs = CANNON_SPOTS[i]; c.userData.barrel.rotation.y = -(cs.aim != null ? cs.aim : -Math.PI / 2); });
          // labels on buildings and locked gates
          for (const id of Object.keys(BUILDINGS)) {
            const b = BUILDINGS[id];
            if (Math.abs(b.x - me.x) > 700 || Math.abs(b.y - me.y) > 600) continue;
            const lvl = d.levels[id];
            const near = U.dist(b.x, b.y, me.x, me.y) < 110 && !gather;
            V.label(b.x, 100, b.y, { name: (near ? '[E] ' : '') + b.name + (lvl != null ? ' · L' + lvl : id === 'hut' ? ' · ' + d.workers + '/' + maxWorkers() : ''), color: near ? '#ffd66b' : '#ffffff' });
          }
          for (const [id, z] of Object.entries(ZONES)) if (!d.zones[id] && Math.abs(z.gate.x - me.x) < 800) V.label(z.gate.x, 70, z.gate.y, { name: z.name + ' (locked) · ' + costText(z.cost) + (U.dist(z.gate.x, z.gate.y, me.x, me.y) < 110 ? ' · [E]' : ''), color: '#ffd66b' });
          // resource nodes near the camera
          for (const n of nodes) {
            if (Math.abs(n.x - me.x) > 900 || Math.abs(n.y - me.y) > 700) continue;
            const m = nodePool.use(n.kind + (n.left > 0 ? '' : 'x') + nodes.indexOf(n), () => nodeModel(n));
            const shake = gather && gather.node === n ? Math.sin(t * 40) * 1.5 : 0;
            m.position.set(n.x + shake, 0, n.y);
            if (n.left > 0 && n.left < n.charges) V.label(n.x, n.kind === 'tree' ? 76 : 44, n.y, { hp: n.left / n.charges, hpColor: RES[n.res].color });
          }
          nodePool.sweep();
          // raid
          if (raid) {
            if (!ship) ship = shipModel();
            ship.visible = true;
            ship.position.set(raid.ship.x, Math.sin(t * 1.5) * 3, raid.ship.y);
            ship.rotation.y = Math.PI / 2;
            ship.rotation.z = Math.sin(t * 1.2) * 0.04;
            raid.pirates.forEach((p) => {
              if (!p._id) p._id = U.uid('pirate');
              const rig = V.actor(p._id, PIRATE, { scale: 7.5 });
              rig.setPos(p.x, 0, p.y);
              rig.faceAngle(p.a);
              rig.set({ move: 0.8 });
              if (!rig._held) { rig.hold('sword', '#c9ced8'); rig._held = true; }
              if (p.flash > 0.08 && !p._fl) rig.play('hit');
              p._fl = p.flash > 0.08;
              V.label(p.x, 54, p.y, { hp: p.hp / p.maxHp, hpColor: '#ff5a6a', name: p.loot ? '+' + p.loot + ' gold' : null, color: '#ffd66b' });
            });
          } else if (ship) ship.visible = false;
          for (const b of balls) {
            const m = ballPool.use(b, () => V.shape('sphere', 0, 0, 0, 10, 10, 10, '#1b1b22', { metal: 0.4 }));
            const k = b.t / b.dur;
            m.position.set(U.lerp(b.x, b.tx, k), 16 + Math.sin(k * Math.PI) * 60, U.lerp(b.y, b.ty, k));
          }
          ballPool.sweep();
          // people
          workers.forEach((w, i) => {
            const rig = V.actor('worker' + i, workerLook(w), { scale: 7 });
            rig.setPos(w.x, 0, w.y);
            rig.faceAngle(w.a);
            rig.set({ move: w.state === 'go' || w.state === 'back' ? 0.8 : 0 });
            if (w.state === 'work' && Math.random() < 0.08) rig.play('attack');
            if (!rig._held) { rig.hold('pickaxe', '#9aa5b5'); rig._held = true; }
            if (w.carry) V.label(w.x, 52, w.y, { name: '+' + w.carry.n + ' ' + RES[w.carry.res].name.toLowerCase(), color: RES[w.carry.res].color });
          });
          for (const bt of bots) {
            const rig = V.actor(bt.bot.id, bt.bot.avatar, { scale: 7.5 });
            const mv = bt._px != null && dt > 0 ? Math.hypot(bt.x - bt._px, bt.y - bt._py) / dt : 0;
            bt._px = bt.x; bt._py = bt.y;
            rig.setPos(bt.x, 0, bt.y);
            rig.faceAngle(bt.a);
            rig.set({ move: mv / 130 });
            V.label(bt.x, 54, bt.y, { name: bt.bot.displayName, color: '#ffffff', bubble: ctx.bubbleText(bt.bot.id) });
          }
          const rig = V.actor('me', ctx.player.avatar, { scale: 8 });
          rig.setPos(me.x, 0, me.y);
          rig.faceAngle(me.a);
          const mv = me._px != null && dt > 0 ? Math.hypot(me.x - me._px, me.y - me._py) / dt : 0;
          me._px = me.x; me._py = me.y;
          rig.set({ move: mv / T.speed });
          if (!rig._held) { rig.hold('pickaxe', '#ffc940'); rig._held = true; }
          if ((me.swing > 0.15 || (gather && Math.random() < 0.12)) && !me._sw) rig.play('attack');
          me._sw = me.swing > 0.15;
          V.label(me.x, 58, me.y, { name: ctx.player.name, color: '#ffb454', hp: gather ? gather.t / gather.node.time : null, hpColor: gather ? RES[gather.node.res].color : null, bubble: ctx.bubbleText('me') });
          V.sweep();
        };
      })();

      return {
        update(dt) {
          parts.update(dt);
          floats.update(dt);
          if (phase !== 'play') return;
          time += dt;
          saveT += dt;
          if (saveT > 5) { saveT = 0; ctx.save(); }
          if (time >= T.session) { finish(); return; }
          // passive production
          for (const id of ['mill', 'quarry', 'vault']) {
            const b = BUILDINGS[id];
            acc[b.res] += b.rates[d.levels[id]] * (id === 'vault' && charter ? 1.25 : 1) * dt;
            if (acc[b.res] >= 1) { const n = Math.floor(acc[b.res]); acc[b.res] -= n; addRes(b.res, n); }
          }
          // raids
          const nextRaid = T.raids[raidIdx];
          if (!raid && nextRaid != null) {
            if (time >= nextRaid - T.warn && time - dt < nextRaid - T.warn) { ctx.banner('Pirate ship spotted!', 'Raid in ' + T.warn + ' seconds. Build cannons!', 1800); ctx.sfx('beep'); }
            if (time >= nextRaid) startRaid();
          }
          if (raid) raidStep(dt);
          for (let i = balls.length - 1; i >= 0; i--) {
            const b = balls[i];
            b.t += dt;
            if (b.t >= b.dur) { balls.splice(i, 1); parts.emit(b.tx, b.ty, { count: 12, colors: ['#ffd66b', '#39414f'], speed: 140, life: 0.4 }); if (raid && raid.pirates.includes(b.tgt)) hitPirate(b.tgt, 28, false); }
          }
          // nodes regrow
          for (const n of nodes) if (n.left <= 0) { n.regrowT -= dt; if (n.regrowT <= 0) n.left = n.charges; }
          // player
          const inp = ctx.input;
          const ax = inp.axis();
          if (me.atkCd > 0) me.atkCd -= dt;
          if (me.swing > 0) me.swing -= dt;
          if (Math.hypot(ax.x, ax.y) > 0.1) {
            const nx = me.x + ax.x * T.speed * dt, ny = me.y + ax.y * T.speed * dt;
            if (!blockedX(nx, me.y)) me.x = nx;
            if (!blockedX(me.x, ny)) me.y = ny;
            me.a = Math.atan2(ax.y, ax.x); me.walk += dt * 12;
            gather = null;
            if (panel) closePanel();
          }
          // attack pirates
          const nearPirate = raid && raid.pirates.find((p) => U.dist(p.x, p.y, me.x, me.y) < 46);
          if (nearPirate && inp.actPressed('use') && me.atkCd <= 0) { me.atkCd = 0.45; me.swing = 0.2; me.a = U.angleTo(me.x, me.y, nearPirate.x, nearPirate.y); hitPirate(nearPirate, 22, true); }
          else if (inp.act('use') && !nearPirate) {
            const node = nodes.find((n) => n.left > 0 && unlocked(n) && U.dist(n.x, n.y, me.x, me.y) < n.r + 34);
            if (node) {
              if (!gather || gather.node !== node) gather = { node, t: 0 };
              gather.t += dt;
              if (Math.random() < 0.15) { parts.emit(node.x, node.y - 6, { count: 2, color: RES[node.res].color, speed: 80, life: 0.3 }); ctx.sfx(node.kind === 'tree' ? 'hit' : 'mine', { volume: 0.25 }); }
              if (gather.t >= node.time) { gather = null; node.left--; if (node.left <= 0) node.regrowT = node.regrow; addRes(node.res, node.amount, node.x, node.y); }
            } else if (inp.actPressed('use')) {
              const st = stations().find((s) => U.dist(s.x, s.y, me.x, me.y) < 110);
              if (st) openPanel(st.id);
            }
          } else gather = null;
          if (inp.pointer.pressed) {
            const w = V ? ctx.pointerWorld(0) : cam.toWorld(inp.pointer.x, inp.pointer.y);
            if (panel) closePanel();
            else {
              const st = stations().find((s) => U.dist(s.x, s.y, w.x, w.y) < 70);
              if (st) { if (U.dist(st.x, st.y, me.x, me.y) < 220) openPanel(st.id); else floats.add(w.x, w.y, 'Walk closer', '#cfd6e2', 12); }
              const p = raid && raid.pirates.find((q) => U.dist(q.x, q.y, w.x, w.y) < 22);
              if (p && U.dist(p.x, p.y, me.x, me.y) < 60 && me.atkCd <= 0) { me.atkCd = 0.45; me.swing = 0.2; hitPirate(p, 22, true); }
            }
          }
          workers.forEach((w) => workerStep(w, dt));
          bots.forEach((b) => botStep(b, dt));
          cam.follow(me.x, me.y, dt, 0.15);
        },

        draw(g) {
          const t = ctx.time;
          g.save();
          cam.apply(g);
          // ground
          const x0 = Math.floor(cam.x / 80) * 80, y0 = Math.floor(cam.y / 80) * 80;
          for (let y = y0; y < cam.y + H + 80; y += 80) for (let x = x0; x < cam.x + W + 80; x += 80) {
            let c;
            if (y >= BEACH + 40) c = y >= BEACH + 120 ? '#1f7fb8' : '#e8d08a';
            else if (x >= 1800) c = (x + y) / 80 % 2 ? '#3a2a2a' : '#34262a';
            else if (x >= 1000) c = (x + y) / 80 % 2 ? '#2f7a3a' : '#2a7035';
            else c = (x + y) / 80 % 2 ? '#5fae52' : '#58a64b';
            g.fillStyle = c; g.fillRect(x, y, 80, 80);
          }
          g.fillStyle = 'rgba(191,243,255,.25)';
          for (let x = Math.floor(cam.x / 60) * 60; x < cam.x + W; x += 60) g.fillRect(x + Math.sin(t + x) * 10, BEACH + 150 + Math.sin(t * 2 + x) * 6, 26, 3);
          // lava river + locked zones
          g.fillStyle = '#ff5a1f'; g.fillRect(1790, 60, 20, BEACH - 20);
          g.globalAlpha = 0.5 + Math.sin(t * 3) * 0.2; g.fillStyle = '#ffd66b'; g.fillRect(1796, 60, 8, BEACH - 20); g.globalAlpha = 1;
          if (d.zones.volcano) { g.fillStyle = '#7a4a2a'; g.fillRect(1780, 530, 40, 60); }
          for (const n of nodes) if (cam.visible(n.x, n.y)) drawNode(g, n, t);
          for (const [id, z] of Object.entries(ZONES)) {
            if (d.zones[id]) continue;
            g.fillStyle = 'rgba(8,10,16,.35)'; g.fillRect(z.x0, 60, z.x1 - z.x0, BEACH - 20);
            if (id === 'jungle') { g.fillStyle = '#1f5a2a'; for (let y = 80; y < BEACH; y += 30) G.circle(g, z.x0 + ((y / 30) % 2) * 8, y, 20, '#1f5a2a'); }
            G.fillRR(g, z.gate.x - 70, z.gate.y - 24, 140, 48, 8, 'rgba(8,10,16,.85)');
            G.text(g, z.name + ' (locked)', z.gate.x, z.gate.y - 4, { size: 12, align: 'center', color: '#fff' });
            G.text(g, costText(z.cost), z.gate.x, z.gate.y + 13, { size: 10, align: 'center', color: '#ffd66b' });
          }
          if (d.zones.volcano) { g.fillStyle = 'rgba(255,90,31,.15)'; G.circle(g, 2150, 300, 160, 'rgba(255,90,31,.15)'); G.circle(g, 2150, 300, 60, '#5a2a1a'); G.circle(g, 2150, 300, 34, '#ff5a1f'); }
          for (const id of Object.keys(BUILDINGS)) drawBuilding(g, id, t);
          for (let i = 0; i < d.levels.cannons; i++) { const c = CANNON_SPOTS[i]; G.circle(g, c.x, c.y, 14, '#39414f'); g.save(); g.translate(c.x, c.y); g.rotate(c.aim != null ? c.aim : -Math.PI / 2); G.fillRR(g, 0, -6, 28, 12, 4, '#2a2f3a'); g.restore(); }
          if (raid) {
            const s = raid.ship;
            G.fillRR(g, s.x - 70, s.y - 26, 140, 52, 20, '#5a3a2a'); G.fillRR(g, s.x - 60, s.y - 18, 120, 36, 16, '#7a4a2a');
            G.line(g, s.x, s.y - 20, s.x, s.y - 90, '#3a2a1e', 5); g.fillStyle = '#1b1b22'; g.fillRect(s.x - 34, s.y - 86, 68, 44);
            G.circle(g, s.x, s.y - 64, 9, '#f4f1ea');
            for (const p of raid.pirates) {
              G.avatarTop(g, p.x, p.y, 11, { skin: '#e0ac69', shirt: p.flash > 0 ? '#ffffff' : '#b0412e', shirt2: '#f4f1ea', pants: '#1f2a44', shoes: '#1b1b22', hat: '#1b1b22' }, p.a, { walk: p.walk });
              G.bar(g, p.x - 14, p.y - 22, 28, 4, p.hp / p.maxHp, '#ff5a6a');
              if (p.loot) G.circle(g, p.x + 10, p.y + 8, 6, '#ffd66b');
            }
          }
          for (const b of balls) { const k = b.t / b.dur; G.circle(g, U.lerp(b.x, b.tx, k), U.lerp(b.y, b.ty, k) - Math.sin(k * Math.PI) * 60, 5, '#1b1b22'); }
          for (const w of workers) { G.avatarTop(g, w.x, w.y, 10, w.look, w.a, { walk: w.walk }); if (w.carry) G.fillRR(g, w.x - 6, w.y - 24, 12, 10, 2, RES[w.carry.res].color); }
          for (const bt of bots) { G.avatarTop(g, bt.x, bt.y, 11, bt.bot.look, bt.a, { walk: bt.walk }); G.nameTag(g, bt.x, bt.y - 15, bt.bot.displayName, '#fff'); const b2 = ctx.bubbleText(bt.bot.id); if (b2) G.bubble(g, bt.x, bt.y - 34, b2); }
          G.avatarTop(g, me.x, me.y, 12, ctx.player.look, me.a, { walk: me.walk });
          if (me.swing > 0) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 4; g.beginPath(); g.arc(me.x, me.y, 30, me.a - 0.8, me.a + 0.8); g.stroke(); }
          G.nameTag(g, me.x, me.y - 16, ctx.player.name, '#ffb454');
          if (gather) G.bar(g, me.x - 20, me.y + 18, 40, 6, gather.t / gather.node.time, RES[gather.node.res].color);
          const mb = ctx.bubbleText('me');
          if (mb) G.bubble(g, me.x, me.y - 36, mb);
          const st = stations().find((s) => U.dist(s.x, s.y, me.x, me.y) < 110);
          if (st && !gather) G.text(g, 'E  ' + (BUILDINGS[st.id] ? BUILDINGS[st.id].name : ZONES[st.id].name), st.x, st.y + 60, { size: 12, align: 'center', color: '#0b0e13', weight: 900, stroke: '#ffd66b', strokeW: 8 });
          parts.draw(g);
          floats.draw(g);
          g.restore();
          drawHud(g);
        },

        render3d(dt) { view(dt); },
        hud(g) { drawHud(g); },

        onBotJoin(b) { addBot(b); },
        onBotLeave(b) { const i = bots.findIndex((x) => x.bot.id === b.id); if (i >= 0) bots.splice(i, 1); },
        destroy() { ctx.save(); },
      };

      function drawHud(g) {
          G.panel(g, 10, 10, 300, 78);
          Object.keys(RES).forEach((k, i) => { G.circle(g, 26 + i * 72, 30, 6, RES[k].color); G.text(g, U.compact(Math.floor(d.res[k] || 0)), 36 + i * 72, 35, { size: 14, weight: 800, color: '#fff' }); });
          G.text(g, 'Net gold', 22, 58, { size: 10, color: '#a1abbb' });
          G.bar(g, 22, 64, 180, 8, (produced - stolen) / target, goalHit ? '#3fd08a' : '#ffd66b');
          G.text(g, U.fmt(produced - stolen) + ' / ' + U.fmt(target), 298, 72, { size: 11, align: 'right', color: '#cfd6e2' });
          G.text(g, U.fmtClock(T.session - time), 298, 58, { size: 13, align: 'right', color: '#8fd3ff', weight: 800 });
          const nextRaid = T.raids[raidIdx];
          G.panel(g, W - 220, 10, 210, 44);
          G.text(g, raid ? (raid.over ? 'Pirates retreating' : 'RAID! ' + raid.pirates.length + ' pirates ashore') : nextRaid != null ? 'Next raid in ' + U.fmtClock(nextRaid - time) : 'No more raids today', W - 208, 30, { size: 13, weight: 800, color: raid ? '#ff8b98' : '#fff' });
          G.text(g, 'Cannons ' + d.levels.cannons + '/3 · workers ' + d.workers + '/' + maxWorkers(), W - 208, 47, { size: 11, color: '#a1abbb' });
      }
    },
  });
})((window.BF = window.BF || {}));
