/**
 * Castle Siege (gameType "siege") — side-view lane defense with an economy.
 * The army marches from the east. Build gold mines and quarries in the
 * village, keep the wall standing, fill the battlements with archer towers,
 * catapults and mage towers (Ballista with the pass), and upgrade the keep.
 * Wyverns fly over walls; waves 5, 10 and 15 bring bosses. Allied commanders
 * (bots) hold a battlement of their own.
 * Win: survive 15 waves. Lose: the keep falls.
 * Passes: treasury (+50% income), ballista (Ballista tower).
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  const GROUND = 440, WALL_X = 430, KEEP_X = 70, KEEP_W = 110;
  const T = {
    waves: 15, build: 16, startGold: 160, startStone: 60, earlyBonus: 15,
    rewards: { play: 15, perWave: 5, win: 80, xpPlay: 30, xpWave: 12, xpWin: 150 },
  };
  const TOWERS = {
    archer: { name: 'Archer Tower', color: '#8b5a2b', levels: [{ cost: { gold: 60 }, dmg: 11, rate: 0.8, range: 470, shots: 1 }, { cost: { gold: 80, stone: 20 }, dmg: 17, rate: 0.7, range: 500, shots: 1 }, { cost: { gold: 150, stone: 60 }, dmg: 24, rate: 0.6, range: 540, shots: 2 }], air: true },
    catapult: { name: 'Catapult', color: '#6a707c', levels: [{ cost: { gold: 110, stone: 40 }, dmg: 32, rate: 2.6, range: 560, splash: 55 }, { cost: { gold: 120, stone: 70 }, dmg: 50, rate: 2.4, range: 580, splash: 65 }, { cost: { gold: 220, stone: 140 }, dmg: 80, rate: 2.2, range: 600, splash: 80 }], air: false },
    mage: { name: 'Mage Tower', color: '#7a4bd6', levels: [{ cost: { gold: 140, stone: 30 }, dmg: 20, rate: 1.2, range: 480, slow: 0.4 }, { cost: { gold: 130, stone: 60 }, dmg: 32, rate: 1.1, range: 500, slow: 0.5 }, { cost: { gold: 240, stone: 120 }, dmg: 50, rate: 1, range: 520, slow: 0.6 }], air: true, magic: true },
    ballista: { name: 'Ballista', color: '#b8860b', pass: 'ballista', levels: [{ cost: { gold: 140, stone: 50 }, dmg: 42, rate: 2.2, range: 620, pierce: true }, { cost: { gold: 150, stone: 90 }, dmg: 64, rate: 2, range: 640, pierce: true }, { cost: { gold: 260, stone: 160 }, dmg: 95, rate: 1.8, range: 660, pierce: true }], air: false },
  };
  const ECON = {
    mine: { name: 'Gold Mine', res: 'gold', levels: [{ cost: { gold: 50 }, rate: 1.5 }, { cost: { gold: 90, stone: 30 }, rate: 3 }, { cost: { gold: 160, stone: 80 }, rate: 5 }] },
    quarry: { name: 'Quarry', res: 'stone', levels: [{ cost: { gold: 60 }, rate: 1 }, { cost: { gold: 90, stone: 20 }, rate: 2 }, { cost: { gold: 150, stone: 60 }, rate: 3.5 }] },
  };
  const WALLS = [{ name: 'Wooden Palisade', hp: 320 }, { name: 'Stone Wall', hp: 850, cost: { gold: 100, stone: 120 } }, { name: 'Fortress Wall', hp: 1700, cost: { gold: 250, stone: 300 } }];
  const KEEPS = [{ hp: 1000 }, { hp: 1800, cost: { gold: 200, stone: 150 }, archer: 14 }, { hp: 3000, cost: { gold: 400, stone: 350 }, archer: 26 }];
  const FOES = {
    footman: { name: 'Footman', hp: 55, speed: 38, dmg: 9, gold: 5, color: '#9a3a3a' },
    runner: { name: 'Scout', hp: 30, speed: 72, dmg: 5, gold: 4, color: '#c9703a' },
    shield: { name: 'Shieldbearer', hp: 90, speed: 30, dmg: 10, gold: 8, armor: 0.5, color: '#5a5f6a' },
    ram: { name: 'Battering Ram', hp: 220, speed: 22, dmg: 30, gold: 16, wallMult: 3, color: '#6b4b2a', w: 44 },
    wyvern: { name: 'Wyvern', hp: 70, speed: 55, dmg: 12, gold: 10, fly: true, color: '#3a8a5a' },
    ogre: { name: 'Ogre', hp: 1100, speed: 24, dmg: 40, gold: 80, boss: true, color: '#5a7a3a', w: 50 },
    giant: { name: 'Siege Giant', hp: 2600, speed: 20, dmg: 70, gold: 140, boss: true, wallMult: 2, color: '#6a5a4a', w: 60 },
    warlord: { name: 'The Warlord', hp: 4200, speed: 26, dmg: 60, gold: 250, boss: true, summon: true, color: '#3a1f4a', w: 54 },
  };
  const DEF_SLOTS = [{ x: 215, y: 360 }, { x: 275, y: 345 }, { x: 335, y: 360 }, { x: 395, y: 330 }, { x: 150, y: 250, roof: true }];
  const ECO_SLOTS = [{ x: 60, y: 500 }, { x: 150, y: 500 }, { x: 240, y: 500 }, { x: 330, y: 500 }];

  function waveList(n) {
    const list = [];
    const add = (k, c) => { for (let i = 0; i < c; i++) list.push(k); };
    add('footman', 3 + n);
    if (n >= 2) add('runner', Math.floor(n * 0.8));
    if (n >= 3) add('shield', Math.floor(n / 2));
    if (n >= 4) add('ram', Math.floor(n / 4));
    if (n >= 6) add('wyvern', Math.floor((n - 3) / 2));
    const shuffled = U.shuffle(list);
    if (n === 5) shuffled.push('ogre');
    if (n === 10) shuffled.push('giant');
    if (n === 15) shuffled.push('warlord');
    return shuffled;
  }
  const canPay = (res, c) => Object.entries(c || {}).every(([k, v]) => res[k] >= v);
  const pay = (res, c) => { for (const [k, v] of Object.entries(c || {})) res[k] -= v; };
  const costTxt = (c) => Object.entries(c || {}).map(([k, v]) => v + ' ' + k).join(' + ');

  BF.GameModules.register('siege', {
    maxBots: 2,
    feedTop: 0.19,
    actions: { next: ['Space'] },
    controls: { joystick: false, buttons: [{ act: 'next', label: 'Next wave', icon: 'play' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const parts = new BF.Particles(600);
      const floats = new BF.Floaters();
      const treasury = ctx.hasPass('treasury');
      const res = { gold: T.startGold, stone: T.startStone };
      let phase = 'build';
      let buildT = T.build + 6;
      let wave = 0;
      let spawnQ = [], spawnT = 0;
      let keepLvl = 0, keepHp = KEEPS[0].hp, keepCd = 0;
      let wallLvl = 0, wallHp = WALLS[0].hp;
      const slots = DEF_SLOTS.map((s) => Object.assign({}, s, { tower: null, lvl: 0, cd: 0, owner: null, aim: -0.3 }));
      const eco = ECO_SLOTS.map((s) => Object.assign({}, s, { kind: null, lvl: 0 }));
      const foes = [], shots = [];
      let selected = null;
      let kills = 0;

      // commanders (bots) each hold a slot
      const commanders = [];
      function addCommander(b) {
        if (commanders.some((c) => c.bot.id === b.id) || commanders.length >= 2) return;
        const slot = slots.slice().reverse().find((s) => !s.tower && !s.owner);
        if (!slot) return;
        slot.owner = b;
        commanders.push({ bot: b, slot, gold: 40, t: 6 + Math.random() * 6 });
      }
      ctx.bots.forEach(addCommander);

      const income = () => {
        const out = { gold: 0.6, stone: 0.2 };
        for (const e of eco) if (e.kind) out[ECON[e.kind].res] += ECON[e.kind].levels[e.lvl].rate;
        if (treasury) { out.gold *= 1.5; out.stone *= 1.5; }
        return out;
      };

      function startWave() {
        if (phase !== 'build') return;
        if (buildT > 2 && wave > 0) { res.gold += T.earlyBonus; floats.add(W - 120, 90, '+' + T.earlyBonus + ' gold (early)', '#ffd66b', 13); }
        wave++;
        phase = 'wave';
        spawnQ = waveList(wave);
        spawnT = 0.5;
        const boss = spawnQ.find((k) => FOES[k].boss);
        ctx.banner('WAVE ' + wave, boss ? FOES[boss].name + ' approaches!' : wave === 6 ? 'Wyverns fly over walls' : '', 1600);
        ctx.sfx(boss ? 'explosion' : 'beep');
        renderDock();
      }
      function spawnFoe(k) {
        const f = FOES[k];
        const scale = 1 + (wave - 1) * 0.14;
        foes.push({ kind: k, x: W + 30, y: f.fly ? 230 + Math.random() * 80 : GROUND, hp: f.hp * scale, max: f.hp * scale, slow: 0, slowT: 0, atk: 0, walk: Math.random() * 6, flash: 0, summonT: 6 });
      }
      function damageFoe(e, dmg, magic, slow) {
        const f = FOES[e.kind];
        const amt = f.armor && !magic ? dmg * (1 - f.armor) : dmg;
        e.hp -= amt;
        e.flash = 0.08;
        if (slow) { e.slow = slow; e.slowT = 1.5; }
        if (e.hp <= 0) {
          const i = foes.indexOf(e);
          if (i < 0) return;
          foes.splice(i, 1);
          res.gold += f.gold;
          kills++;
          floats.add(e.x, e.y - 40, '+' + f.gold, '#ffd66b', 12);
          parts.emit(e.x, e.y - 14, { count: f.boss ? 60 : 14, colors: [f.color, '#ffffff', '#ffd66b'], speed: f.boss ? 260 : 140, life: 0.6 });
          ctx.playerStat('kills', 1);
          ctx.quest('kill', 1);
          if (f.boss) { ctx.quest('boss', 1); ctx.playerStat('bossesDefeated', 1); ctx.banner(f.name + ' defeated!', '', 1600); ctx.sfx('win'); }
        }
      }
      function waveCleared() {
        phase = 'build';
        buildT = T.build;
        ctx.best('highestWave', wave, 'max');
        ctx.quest('wave', 1);
        ctx.playerStat('wavesCleared', 1);
        ctx.xp(T.rewards.xpWave);
        if (wave >= T.waves) { finish(true); return; }
        ctx.banner('Wave ' + wave + ' repelled', 'Build and upgrade · Space to call the next wave', 1600);
        ctx.sfx('powerup');
        if (Math.random() < 0.5 && commanders.length) ctx.botSay(U.pick(commanders).bot, 'win', 500);
        renderDock();
      }
      function finish(win) {
        if (phase === 'over') return;
        phase = 'over';
        ctx.ui.remove('slot'); ctx.ui.remove('dock');
        const reached = win ? T.waves : wave - 1;
        ctx.best('highestWave', Math.max(0, reached), 'max');
        if (win) ctx.badge('csg_warlord');
        ctx.end({
          outcome: win ? 'win' : 'lose',
          title: win ? 'The siege is broken!' : 'The keep has fallen',
          subtitle: win ? 'All ' + T.waves + ' waves repelled.' : 'You held out for ' + U.plural(Math.max(0, reached), 'wave') + '.',
          coins: T.rewards.play + Math.max(0, reached) * T.rewards.perWave + (win ? T.rewards.win : 0),
          xp: T.rewards.xpPlay + (win ? T.rewards.xpWin : 0),
          stats: [['Waves', Math.max(0, reached) + ' / ' + T.waves], ['Enemies defeated', kills], ['Keep level', keepLvl + 1], ['Wall', WALLS[wallLvl].name]],
          delay: 1300,
        });
      }

      // --------------------------------------------------------------- panels
      function renderDock() {
        if (phase === 'over') return;
        ctx.ui.panel('dock', '<div class="gp-row"><button class="btn btn-sm btn-play" data-gact="next"' + (phase !== 'build' ? ' disabled' : '') + '>' + BF.icon('play', 12) + (phase === 'build' ? 'Next wave' : 'Wave ' + wave + ' in progress') + '</button>' +
          '<button class="btn btn-sm" data-gact="sel-keep">' + BF.icon('crown', 12) + 'Keep L' + (keepLvl + 1) + '</button><button class="btn btn-sm" data-gact="sel-wall">' + BF.icon('shield', 12) + WALLS[wallLvl].name + '</button></div>', 'top end');
      }
      renderDock();
      function panelFor() {
        if (!selected) { ctx.ui.remove('slot'); return; }
        const close = '<button class="btn btn-ghost btn-sm gp-close" data-gact="close" aria-label="Close">' + BF.icon('x', 14) + '</button>';
        const have = '<p class="faint">Gold <b style="color:#ffd66b">' + Math.floor(res.gold) + '</b> · Stone <b style="color:#cfd6e2">' + Math.floor(res.stone) + '</b></p>';
        let html = '';
        if (selected.type === 'def') {
          const s = slots[selected.i];
          if (s.owner && !s.tower) html = '<h3>' + BF.icon('users', 18) + ' ' + U.esc(s.owner.displayName) + "'s battlement</h3><p>Your ally is saving up to build here.</p>";
          else if (s.owner) html = '<h3>' + BF.icon('users', 18) + ' ' + TOWERS[s.tower].name + ' L' + (s.lvl + 1) + '</h3><p>Built and upgraded by ' + U.esc(s.owner.displayName) + '.</p>';
          else if (!s.tower) html = '<h3>' + BF.icon('hammer', 18) + ' Empty battlement</h3>' + have + '<div class="gp-grid">' + Object.entries(TOWERS).map(([k, tw]) => {
            const locked = tw.pass && !ctx.hasPass(tw.pass);
            const c = tw.levels[0].cost;
            return '<button class="gp-card' + (locked ? ' locked' : '') + '" data-gact="build-' + k + '"' + (locked || !canPay(res, c) ? ' disabled' : '') + '><b>' + (locked ? BF.icon('lock', 12) + ' ' : '') + tw.name + '</b><small>' + (locked ? 'Ballista Blueprint pass' : costTxt(c)) + '</small><small>' + (tw.air ? 'Hits air and ground' : 'Ground only') + (tw.levels[0].splash ? ' · splash' : '') + (tw.levels[0].slow ? ' · slows' : '') + (tw.levels[0].pierce ? ' · pierces' : '') + '</small></button>';
          }).join('') + '</div>';
          else { const tw = TOWERS[s.tower], nx = tw.levels[s.lvl + 1]; html = '<h3>' + BF.icon('shield', 18) + ' ' + tw.name + ' · L' + (s.lvl + 1) + '</h3><p>Damage ' + tw.levels[s.lvl].dmg + ' every ' + tw.levels[s.lvl].rate + 's</p>' + have + '<div class="gp-actions">' + (nx ? '<button class="btn btn-primary" data-gact="upgrade"' + (canPay(res, nx.cost) ? '' : ' disabled') + '>Upgrade · ' + costTxt(nx.cost) + '</button>' : '<span class="pill gold">Max level</span>') + '</div>'; }
        } else if (selected.type === 'eco') {
          const e = eco[selected.i];
          if (!e.kind) html = '<h3>' + BF.icon('hammer', 18) + ' Village plot</h3>' + have + '<div class="gp-grid">' + Object.entries(ECON).map(([k, ec]) => '<button class="gp-card" data-gact="eco-' + k + '"' + (canPay(res, ec.levels[0].cost) ? '' : ' disabled') + '><b>' + ec.name + '</b><small>+' + ec.levels[0].rate + ' ' + ec.res + '/s · ' + costTxt(ec.levels[0].cost) + '</small></button>').join('') + '</div>';
          else { const ec = ECON[e.kind], nx = ec.levels[e.lvl + 1]; html = '<h3>' + BF.icon('wallet', 18) + ' ' + ec.name + ' · L' + (e.lvl + 1) + '</h3><p>+' + ec.levels[e.lvl].rate + ' ' + ec.res + ' per second' + (treasury ? ' (+50% Royal Treasury)' : '') + '</p>' + have + '<div class="gp-actions">' + (nx ? '<button class="btn btn-primary" data-gact="upgrade"' + (canPay(res, nx.cost) ? '' : ' disabled') + '>Upgrade to +' + nx.rate + '/s · ' + costTxt(nx.cost) + '</button>' : '<span class="pill gold">Max level</span>') + '</div>'; }
        } else if (selected.type === 'keep') {
          const nx = KEEPS[keepLvl + 1];
          html = '<h3>' + BF.icon('crown', 18) + ' The Keep · L' + (keepLvl + 1) + '</h3><p>Health ' + Math.ceil(keepHp) + ' / ' + KEEPS[keepLvl].hp + (KEEPS[keepLvl].archer ? ' · keep archers deal ' + KEEPS[keepLvl].archer : '') + '</p>' + have + '<div class="gp-actions">' + (nx ? '<button class="btn btn-primary" data-gact="keep-up"' + (canPay(res, nx.cost) ? '' : ' disabled') + '>Upgrade keep · ' + costTxt(nx.cost) + '</button>' : '<span class="pill gold">Max level</span>') + '</div>';
        } else if (selected.type === 'wall') {
          const nx = WALLS[wallLvl + 1];
          const missing = WALLS[wallLvl].hp - wallHp;
          const repairCost = { stone: Math.ceil(missing / 10) };
          html = '<h3>' + BF.icon('shield', 18) + ' ' + WALLS[wallLvl].name + '</h3><p>Health ' + Math.ceil(Math.max(0, wallHp)) + ' / ' + WALLS[wallLvl].hp + '. Enemies on foot must break it before reaching the keep.</p>' + have + '<div class="gp-actions">' + (missing > 5 ? '<button class="btn btn-outline" data-gact="repair"' + (canPay(res, repairCost) ? '' : ' disabled') + '>Repair · ' + costTxt(repairCost) + '</button>' : '') + (nx ? '<button class="btn btn-primary" data-gact="wall-up"' + (canPay(res, nx.cost) ? '' : ' disabled') + '>' + nx.name + ' · ' + costTxt(nx.cost) + '</button>' : '<span class="pill gold">Strongest wall</span>') + '</div>';
        }
        ctx.ui.panel('slot', close + html, 'right');
      }
      ctx.ui.on((a) => {
        if (a === 'close') { selected = null; panelFor(); return; }
        if (a === 'next') return startWave();
        if (a === 'sel-keep') { selected = { type: 'keep' }; return panelFor(); }
        if (a === 'sel-wall') { selected = { type: 'wall' }; return panelFor(); }
        if (!selected) return;
        if (a.indexOf('build-') === 0 && selected.type === 'def') {
          const k = a.slice(6), tw = TOWERS[k], s = slots[selected.i];
          if (s.tower || (tw.pass && !ctx.hasPass(tw.pass)) || !canPay(res, tw.levels[0].cost)) return;
          pay(res, tw.levels[0].cost); s.tower = k; s.lvl = 0; ctx.sfx('build');
          parts.emit(s.x, s.y, { count: 20, colors: ['#ffd66b', '#ffffff'], speed: 140, life: 0.5 });
        }
        if (a.indexOf('eco-') === 0 && selected.type === 'eco') {
          const k = a.slice(4), e = eco[selected.i];
          if (e.kind || !canPay(res, ECON[k].levels[0].cost)) return;
          pay(res, ECON[k].levels[0].cost); e.kind = k; e.lvl = 0; ctx.sfx('build');
        }
        if (a === 'upgrade') {
          if (selected.type === 'def') { const s = slots[selected.i], nx = TOWERS[s.tower].levels[s.lvl + 1]; if (nx && canPay(res, nx.cost)) { pay(res, nx.cost); s.lvl++; ctx.sfx('powerup'); } }
          if (selected.type === 'eco') { const e = eco[selected.i], nx = ECON[e.kind].levels[e.lvl + 1]; if (nx && canPay(res, nx.cost)) { pay(res, nx.cost); e.lvl++; ctx.sfx('powerup'); } }
        }
        if (a === 'keep-up') { const nx = KEEPS[keepLvl + 1]; if (nx && canPay(res, nx.cost)) { pay(res, nx.cost); keepLvl++; keepHp += nx.hp - KEEPS[keepLvl - 1].hp; ctx.sfx('powerup'); if (keepLvl >= 2) ctx.badge('csg_keep'); renderDock(); } }
        if (a === 'wall-up') { const nx = WALLS[wallLvl + 1]; if (nx && canPay(res, nx.cost)) { pay(res, nx.cost); wallLvl++; wallHp = nx.hp; ctx.sfx('build'); renderDock(); } }
        if (a === 'repair') { const missing = WALLS[wallLvl].hp - wallHp, c = { stone: Math.ceil(missing / 10) }; if (canPay(res, c)) { pay(res, c); wallHp = WALLS[wallLvl].hp; ctx.sfx('build'); } }
        panelFor();
      });

      function pick(px, py) {
        const di = slots.findIndex((s) => Math.abs(px - s.x) < 26 && py > s.y - 50 && py < s.y + 16);
        if (di >= 0) return { type: 'def', i: di };
        const ei = eco.findIndex((e) => Math.abs(px - e.x) < 40 && Math.abs(py - e.y) < 30);
        if (ei >= 0) return { type: 'eco', i: ei };
        if (px > KEEP_X && px < KEEP_X + KEEP_W && py > GROUND - 190 && py < GROUND) return { type: 'keep' };
        if (Math.abs(px - WALL_X) < 22 && py > GROUND - 110 && py < GROUND) return { type: 'wall' };
        return null;
      }
      function fireTower(s) {
        const tw = TOWERS[s.tower], L = tw.levels[s.lvl];
        const inRange = foes.filter((e) => (tw.air || !FOES[e.kind].fly) && e.x - s.x < L.range && e.x > s.x - 40);
        if (!inRange.length) return;
        const target = inRange.sort((a, b) => a.x - b.x)[0];
        s.aim = Math.atan2(target.y - 14 - (s.y - 40), target.x - s.x);
        if (tw.levels[0].pierce) { shots.push({ kind: 'bolt', x: s.x, y: s.y - 40, vx: 700, vy: 0, dmg: L.dmg, hit: new Set(), t: 0, laneY: target.y }); ctx.sfx('shoot', { volume: 0.35 }); return; }
        for (let i = 0; i < (L.shots || 1); i++) {
          const tgt = inRange[i] || target;
          const flight = tw.levels[0].splash ? 1.1 : 0.45;
          shots.push({ kind: tw.levels[0].splash ? 'rock' : tw.magic ? 'magic' : 'arrow', x: s.x, y: s.y - 40, sx: s.x, sy: s.y - 40, tgt, tx: tgt.x - FOES[tgt.kind].speed * flight * 0.9, ty: tgt.y - 14, t: 0, dur: flight, dmg: L.dmg, splash: L.splash, slow: L.slow, magic: tw.magic });
        }
        ctx.sfx(tw.levels[0].splash ? 'explosion' : 'shoot', { volume: 0.2 });
      }

      return {
        update(dt) {
          parts.update(dt);
          floats.update(dt);
          if (phase === 'over') return;
          const inc = income();
          res.gold += inc.gold * dt; res.stone += inc.stone * dt;
          if (phase === 'build') { buildT -= dt; if (buildT <= 0) startWave(); }
          else {
            if (spawnQ.length) { spawnT -= dt; if (spawnT <= 0) { spawnT = Math.max(0.5, 1.6 - wave * 0.05) + Math.random() * 0.6; spawnFoe(spawnQ.shift()); } }
            else if (!foes.length) waveCleared();
          }
          if (ctx.input.actPressed('next')) startWave();
          if (ctx.input.pointer.pressed) {
            const p = ctx.input.pointer;
            const hit = pick(p.x, p.y);
            selected = hit;
            if (hit) ctx.sfx('click');
            panelFor();
          }
          // commanders
          for (const c of commanders) {
            c.gold += dt * (2 + wave * 0.4);
            c.t -= dt;
            if (c.t > 0) continue;
            c.t = 8 + Math.random() * 6;
            const s = c.slot;
            if (!s.tower) { const k = U.pick(['archer', 'archer', 'mage', 'catapult']); const cost = TOWERS[k].levels[0].cost.gold; if (c.gold >= cost) { c.gold -= cost; s.tower = k; s.lvl = 0; ctx.feed(c.bot.displayName + ' built ' + U.withArticle(TOWERS[k].name) + '.', 'info', '#8fd3ff'); } }
            else if (s.lvl < 2) { const nx = TOWERS[s.tower].levels[s.lvl + 1]; if (c.gold >= nx.cost.gold) { c.gold -= nx.cost.gold; s.lvl++; ctx.feed(c.bot.displayName + ' upgraded their ' + TOWERS[s.tower].name + '.', 'info', '#8fd3ff'); } }
            if (Math.random() < 0.25) ctx.botSay(c.bot, 'any', 200);
          }
          // towers + keep archers
          for (const s of slots) { if (!s.tower) continue; s.cd -= dt; if (s.cd <= 0) { s.cd = TOWERS[s.tower].levels[s.lvl].rate; fireTower(s); } }
          if (KEEPS[keepLvl].archer) { keepCd -= dt; if (keepCd <= 0) { keepCd = 0.9; const tgt = foes.filter((e) => e.x < 700).sort((a, b) => a.x - b.x)[0]; if (tgt) shots.push({ kind: 'arrow', x: KEEP_X + 55, y: GROUND - 200, sx: KEEP_X + 55, sy: GROUND - 200, tgt, tx: tgt.x, ty: tgt.y - 14, t: 0, dur: 0.5, dmg: KEEPS[keepLvl].archer }); } }
          // foes
          for (const e of foes.slice()) {
            const f = FOES[e.kind];
            e.walk += dt * 6;
            if (e.flash > 0) e.flash -= dt;
            if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
            const sp = f.speed * (1 - e.slow);
            const wallUp = wallHp > 0;
            const stopX = f.fly ? KEEP_X + KEEP_W + 10 : wallUp ? WALL_X + 18 + (f.w || 20) / 2 : KEEP_X + KEEP_W + 10;
            if (e.x > stopX) e.x -= sp * dt;
            else {
              e.atk -= dt;
              if (e.atk <= 0) {
                e.atk = f.boss ? 1.6 : 1.1;
                if (!f.fly && wallUp) { wallHp -= f.dmg * (f.wallMult || 1); parts.emit(WALL_X + 12, GROUND - 40, { count: 5, color: wallLvl ? '#9aa5b5' : '#8b5a2b', speed: 100, life: 0.4 }); if (wallHp <= 0) { wallHp = 0; ctx.banner('THE WALL IS DOWN!', 'Repair it between waves', 1500); ctx.sfx('explosion'); } }
                else { keepHp -= f.dmg; ctx.sfx('hit', { volume: 0.3 }); if (keepHp <= 0) { keepHp = 0; finish(false); return; } }
              }
            }
            if (f.summon) { e.summonT -= dt; if (e.summonT <= 0) { e.summonT = 7; for (let i = 0; i < 3; i++) { spawnFoe('footman'); foes[foes.length - 1].x = e.x + 30 + i * 20; } ctx.feed('The Warlord calls for reinforcements!', 'info', '#ff8b98'); } }
          }
          // projectiles
          for (let i = shots.length - 1; i >= 0; i--) {
            const s = shots[i];
            s.t += dt;
            if (s.kind === 'bolt') {
              s.x += s.vx * dt;
              for (const e of foes.slice()) if (!FOES[e.kind].fly && !s.hit.has(e) && Math.abs(e.x - s.x) < 18) { s.hit.add(e); damageFoe(e, s.dmg, false); }
              if (s.x > W + 20) shots.splice(i, 1);
              continue;
            }
            if (s.t >= s.dur) {
              shots.splice(i, 1);
              if (s.splash) { for (const e of foes.slice()) if (!FOES[e.kind].fly && Math.abs(e.x - s.tx) < s.splash) damageFoe(e, s.dmg, false); parts.emit(s.tx, GROUND - 6, { count: 20, colors: ['#9aa5b5', '#8b5a2b', '#ffd66b'], speed: 150, life: 0.5 }); }
              else if (foes.includes(s.tgt)) { damageFoe(s.tgt, s.dmg, s.magic, s.slow); if (s.magic) parts.emit(s.tgt.x, s.tgt.y - 14, { count: 8, color: '#b67cff', speed: 90, life: 0.4 }); }
            }
          }
        },

        draw(g) {
          const t = ctx.time;
          const sky = g.createLinearGradient(0, 0, 0, GROUND);
          sky.addColorStop(0, '#6aa8e0'); sky.addColorStop(1, '#cfe4f2');
          g.fillStyle = sky; g.fillRect(0, 0, W, GROUND);
          g.fillStyle = '#8fb58a'; g.beginPath(); g.moveTo(0, GROUND - 60); for (let x = 0; x <= W; x += 40) g.lineTo(x, GROUND - 60 - Math.sin(x * 0.01) * 40 - 20); g.lineTo(W, GROUND); g.lineTo(0, GROUND); g.fill();
          g.fillStyle = '#6a9a5a'; g.fillRect(0, GROUND, W, 8);
          g.fillStyle = '#7a5a3a'; g.fillRect(0, GROUND + 8, W, H - GROUND);
          g.fillStyle = 'rgba(0,0,0,.12)'; for (let x = 0; x < W; x += 48) g.fillRect(x, GROUND + 8, 2, H - GROUND);
          // keep
          const kx = KEEP_X, kw = KEEP_W;
          G.fillRR(g, kx, GROUND - 190, kw, 190, 4, keepLvl === 2 ? '#8a94a6' : keepLvl === 1 ? '#7a8494' : '#6a707c');
          for (let i = 0; i < 5; i++) g.fillStyle = '#5a606c', g.fillRect(kx + i * 24, GROUND - 204, 14, 16);
          G.fillRR(g, kx + kw / 2 - 16, GROUND - 60, 32, 60, 14, '#3a2a1e');
          G.line(g, kx + kw / 2, GROUND - 204, kx + kw / 2, GROUND - 250, '#3a2a1e', 3);
          g.fillStyle = '#ff5a1f'; g.beginPath(); g.moveTo(kx + kw / 2, GROUND - 250); g.lineTo(kx + kw / 2 + 26 + Math.sin(t * 4) * 3, GROUND - 240); g.lineTo(kx + kw / 2, GROUND - 230); g.fill();
          G.bar(g, kx, GROUND - 222, kw, 7, keepHp / KEEPS[keepLvl].hp, '#3fd08a');
          // wall
          if (wallHp > 0) { const col = wallLvl === 0 ? '#8b5a2b' : wallLvl === 1 ? '#8a94a6' : '#6a707c'; for (let y = GROUND - 100; y < GROUND; y += 20) G.fillRR(g, WALL_X, y, 24, 18, 3, col); if (wallLvl === 0) for (let x = WALL_X; x < WALL_X + 24; x += 8) { g.fillStyle = col; g.beginPath(); g.moveTo(x, GROUND - 100); g.lineTo(x + 4, GROUND - 112); g.lineTo(x + 8, GROUND - 100); g.fill(); } G.bar(g, WALL_X - 14, GROUND - 124, 52, 5, wallHp / WALLS[wallLvl].hp, '#ffd66b'); }
          else { g.fillStyle = '#5a4a3a'; for (let i = 0; i < 5; i++) g.fillRect(WALL_X + i * 6 - 6, GROUND - 10 - (i % 2) * 6, 10, 10 + (i % 2) * 6); }
          // slots
          for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            if (!s.roof) G.fillRR(g, s.x - 24, s.y, 48, GROUND - s.y, 3, '#6a5a4a');
            G.fillRR(g, s.x - 28, s.y - 6, 56, 10, 3, '#8a7a6a');
            const sel = selected && selected.type === 'def' && selected.i === i;
            if (!s.tower) { g.globalAlpha = 0.5 + Math.sin(t * 3 + i) * 0.2; G.ring(g, s.x, s.y - 22, 14, s.owner ? '#8fd3ff' : '#ffffff', 2); g.globalAlpha = 1; G.text(g, '+', s.x, s.y - 16, { size: 16, align: 'center', color: '#fff', weight: 900 }); }
            else {
              const tw = TOWERS[s.tower];
              G.fillRR(g, s.x - 16, s.y - 44, 32, 40, 4, tw.color);
              for (let k = 0; k <= s.lvl; k++) G.circle(g, s.x - 8 + k * 8, s.y - 50, 3, '#ffd66b');
              g.save(); g.translate(s.x, s.y - 40); g.rotate(s.aim); G.fillRR(g, 0, -3, 26, 6, 2, '#2a2f3a'); g.restore();
            }
            if (s.owner) G.text(g, s.owner.displayName, s.x, s.y + 20, { size: 9.5, align: 'center', color: '#8fd3ff', weight: 800, stroke: 'rgba(0,0,0,.5)', strokeW: 3 });
            if (sel) G.ring(g, s.x, s.y - 22, 30, '#ffb454', 2);
          }
          for (let i = 0; i < eco.length; i++) {
            const e = eco[i];
            const sel = selected && selected.type === 'eco' && selected.i === i;
            if (!e.kind) { G.fillRR(g, e.x - 34, e.y - 20, 68, 40, 6, 'rgba(255,255,255,.1)'); G.text(g, '+ plot', e.x, e.y + 5, { size: 11, align: 'center', color: '#e8d3a8' }); }
            else if (e.kind === 'mine') { G.fillRR(g, e.x - 30, e.y - 18, 60, 36, 6, '#4a3a2a'); G.circle(g, e.x, e.y + 4, 12, '#1b1b22'); G.circle(g, e.x - 16, e.y - 8, 4, '#ffd66b'); G.circle(g, e.x + 14, e.y - 6, 4, '#ffd66b'); }
            else { G.fillRR(g, e.x - 30, e.y - 18, 60, 36, 6, '#6a707c'); G.fillRR(g, e.x - 18, e.y - 10, 16, 12, 2, '#9aa5b5'); G.fillRR(g, e.x + 2, e.y - 4, 18, 14, 2, '#9aa5b5'); }
            if (e.kind) G.text(g, ECON[e.kind].name + ' L' + (e.lvl + 1), e.x, e.y + 32, { size: 9.5, align: 'center', color: '#fff' });
            if (sel) G.ring(g, e.x, e.y, 38, '#ffb454', 2);
          }
          // foes
          for (const e of foes) {
            const f = FOES[e.kind];
            const w = f.w || 20;
            const bob = Math.sin(e.walk) * 2;
            const c = e.flash > 0 ? '#ffffff' : f.color;
            if (f.fly) {
              const flap = Math.sin(t * 14 + e.x) * 8;
              g.fillStyle = c; g.beginPath(); g.moveTo(e.x, e.y - 14); g.lineTo(e.x + 24, e.y - 28 + flap); g.lineTo(e.x + 10, e.y - 12); g.fill();
              g.beginPath(); g.moveTo(e.x, e.y - 14); g.lineTo(e.x + 20, e.y - 2 - flap); g.lineTo(e.x + 8, e.y - 10); g.fill();
              G.fillRR(g, e.x - 16, e.y - 20, 30, 12, 6, c); G.circle(g, e.x - 16, e.y - 16, 6, c); G.circle(g, e.x - 18, e.y - 18, 1.6, '#ffd66b');
            } else if (e.kind === 'ram') {
              G.fillRR(g, e.x - 22, e.y - 30, 44, 22, 4, '#8b5a2b'); G.fillRR(g, e.x - 34, e.y - 24, 20, 10, 4, '#4a3a2a'); G.circle(g, e.x - 12, e.y - 6, 7, '#3a2a1e'); G.circle(g, e.x + 12, e.y - 6, 7, '#3a2a1e');
            } else {
              const h = f.boss ? (e.kind === 'giant' ? 90 : 72) : 30;
              G.fillRR(g, e.x - w / 2, e.y - h + bob, w, h * 0.62, 5, c);
              G.circle(g, e.x - w * 0.1, e.y - h + bob, w * 0.34, f.boss ? U.shade(f.color, 0.25) : '#e0ac69');
              g.fillStyle = '#1b1b22'; g.fillRect(e.x - w * 0.3, e.y - h * 0.38 + bob, w * 0.2, h * 0.38); g.fillRect(e.x + w * 0.1, e.y - h * 0.38 - bob, w * 0.2, h * 0.38);
              if (e.kind === 'shield') G.fillRR(g, e.x - w / 2 - 8, e.y - h * 0.8, 8, h * 0.6, 2, '#9aa5b5');
              if (e.kind === 'warlord') { g.fillStyle = '#ffd66b'; g.fillRect(e.x - 14, e.y - h - 14 + bob, 28, 6); }
              if (e.slow) { g.globalAlpha = 0.5; G.circle(g, e.x, e.y - h / 2, w * 0.7, '#b67cff'); g.globalAlpha = 1; }
            }
            if (e.hp < e.max || f.boss) G.bar(g, e.x - (f.boss ? 40 : 16), e.y - (f.boss ? 110 : 44) - (f.fly ? 12 : 0), f.boss ? 80 : 32, f.boss ? 7 : 4, e.hp / e.max, '#ff5a6a');
          }
          for (const s of shots) {
            if (s.kind === 'bolt') { G.line(g, s.x - 20, s.laneY - 18, s.x, s.laneY - 18, '#ffd66b', 4); continue; }
            const k = Math.min(1, s.t / s.dur);
            const x = U.lerp(s.sx, s.tx, k), y = U.lerp(s.sy, s.ty, k) - Math.sin(k * Math.PI) * (s.kind === 'rock' ? 120 : 30);
            if (s.kind === 'rock') G.circle(g, x, y, 7, '#5a5f6a');
            else if (s.kind === 'magic') { G.circle(g, x, y, 6, '#b67cff'); G.circle(g, x, y, 3, '#ffffff'); }
            else { const a = Math.atan2(s.ty - s.sy, s.tx - s.sx); G.line(g, x - Math.cos(a) * 10, y - Math.sin(a) * 10, x, y, '#3a2a1e', 2); }
          }
          parts.draw(g);
          floats.draw(g);
          // HUD
          G.panel(g, 10, 10, 300, 58);
          G.text(g, 'Wave ' + wave + ' / ' + T.waves, 22, 36, { size: 18, weight: 800, color: '#fff' });
          G.text(g, phase === 'build' ? 'Next wave in ' + Math.ceil(buildT) + 's' : spawnQ.length + foes.length + ' enemies', 22, 56, { size: 11, color: '#cfd6e2' });
          const inc = income();
          G.text(g, Math.floor(res.gold) + ' gold', 298, 34, { size: 14, weight: 800, align: 'right', color: '#ffd66b' });
          G.text(g, Math.floor(res.stone) + ' stone · +' + inc.gold.toFixed(1) + 'g/s', 298, 54, { size: 11, align: 'right', color: '#cfd6e2' });
          if (!selected && phase === 'build' && wave === 0) G.text(g, 'Click a + slot to build · village plots below make gold and stone', W / 2, 96, { size: 13, align: 'center', color: '#1b1b22', weight: 800 });
        },

        onBotJoin(b) { addCommander(b); },
        onBotLeave(b) { const i = commanders.findIndex((c) => c.bot.id === b.id); if (i >= 0) { commanders[i].slot.owner = null; commanders.splice(i, 1); } },
      };
    },
  });
})((window.BF = window.BF || {}));
