/**
 * Dungeon Frontier (gameType "dungeon") — room-by-room dungeon crawler.
 * Three procedurally built floors of rooms. Combat rooms lock until cleared;
 * treasure rooms hold chests; the farthest room holds the stairs, and floor 3
 * ends in the Frontier Warden's arena. Loot swords and armor, drink potions,
 * dash through attacks and pick a bonus at every level up. A party member
 * from the server fights alongside you.
 * Win: defeat the Warden. Lose: fall with no Revive Feather left.
 * Passes: heroes_kit (Steel Sword + 2 potions), double_xp (runtime).
 * Store: Revive Feather (progress.custom.revives).
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;
  const TAU = Math.PI * 2;

  const TS = 40, RW = 22, RH = 11, OX = 40, OY = 84;
  const PW = RW * TS, PH = RH * TS;
  const T = {
    floors: 3, hp: 100, speed: 175, dashSpeed: 540, dashTime: 0.18, dashCd: 0.85, swingTime: 0.22, swingCd: 0.36, reach: 64,
    arc: 1.05, iframes: 0.6, potions: 2, potionHeal: 45, crit: 0.1, critMul: 1.8,
    rewards: { play: 15, perFloor: 12, goldRate: 0.1, win: 60, xpPlay: 30, xpFloor: 40, xpWin: 150 },
  };
  const SWORDS = [
    { name: 'Rusty Sword', dmg: 10, color: '#a8826a' },
    { name: 'Iron Sword', dmg: 14, color: '#c9ced8' },
    { name: 'Steel Sword', dmg: 19, color: '#e8ecf3' },
    { name: 'Knight Blade', dmg: 25, color: '#8fd3ff' },
    { name: 'Ember Blade', dmg: 33, color: '#ff7a2e' },
  ];
  const ARMORS = [
    { name: 'Cloth Tunic', def: 0 },
    { name: 'Leather Armor', def: 0.1 },
    { name: 'Chainmail', def: 0.2 },
    { name: 'Plate Armor', def: 0.3 },
  ];
  const FOES = {
    slime: { hp: 22, hpF: 9, speed: 70, dmg: 8, xp: 8, r: 15, gold: 4 },
    bat: { hp: 12, hpF: 5, speed: 150, dmg: 6, xp: 6, r: 11, gold: 3 },
    skeleton: { hp: 36, hpF: 12, speed: 82, dmg: 12, xp: 12, r: 14, gold: 6 },
    archer: { hp: 26, hpF: 9, speed: 75, dmg: 10, xp: 12, r: 13, gold: 6 },
    knight: { hp: 72, hpF: 18, speed: 68, dmg: 16, xp: 22, r: 16, gold: 10 },
    warden: { hp: 950, hpF: 0, speed: 85, dmg: 16, xp: 220, r: 34, gold: 120 },
  };
  const ENCOUNTERS = [
    [['slime', 3], ['slime', 2, 'bat', 2], ['skeleton', 1, 'slime', 2], ['bat', 4]],
    [['skeleton', 2, 'archer', 1], ['slime', 3, 'bat', 2], ['archer', 2, 'bat', 2], ['skeleton', 3]],
    [['knight', 1, 'archer', 2], ['skeleton', 2, 'knight', 1], ['bat', 3, 'archer', 2], ['knight', 2, 'slime', 2]],
  ];
  const xpNeed = (lvl) => 30 + (lvl - 1) * 40;

  // ------------------------------------------------------------- generation
  function genFloor(seed, floor) {
    const r = U.rng(seed + ':floor' + floor);
    const N = 5, rooms = new Map();
    const key = (x, y) => x + ',' + y;
    const count = 7 + floor;
    let x = 2, y = 2;
    rooms.set(key(x, y), { gx: x, gy: y });
    let guard = 0;
    while (rooms.size < count && guard++ < 500) {
      const dir = U.pick([[1, 0], [-1, 0], [0, 1], [0, -1]], r);
      const nx = U.clamp(x + dir[0], 0, N - 1), ny = U.clamp(y + dir[1], 0, N - 1);
      if (!rooms.has(key(nx, ny))) rooms.set(key(nx, ny), { gx: nx, gy: ny });
      x = nx; y = ny;
      if (r() < 0.25) { const all = Array.from(rooms.values()); const pick = U.pick(all, r); x = pick.gx; y = pick.gy; }
    }
    const list = Array.from(rooms.values());
    // doors = adjacency
    for (const rm of list) {
      rm.doors = { n: rooms.has(key(rm.gx, rm.gy - 1)), s: rooms.has(key(rm.gx, rm.gy + 1)), w: rooms.has(key(rm.gx - 1, rm.gy)), e: rooms.has(key(rm.gx + 1, rm.gy)) };
      rm.visited = false; rm.cleared = false; rm.kind = 'combat'; rm.enemies = []; rm.chests = []; rm.blocks = [];
    }
    // distances from start
    const start = rooms.get(key(2, 2));
    const dist = new Map([[start, 0]]);
    const q = [start];
    while (q.length) {
      const c = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = rooms.get(key(c.gx + dx, c.gy + dy));
        if (n && !dist.has(n)) { dist.set(n, dist.get(c) + 1); q.push(n); }
      }
    }
    start.kind = 'start';
    const far = list.slice().sort((a, b) => dist.get(b) - dist.get(a))[0];
    far.kind = floor === 3 ? 'boss' : 'stairs';
    const deadEnds = list.filter((rm) => rm.kind === 'combat' && Object.values(rm.doors).filter(Boolean).length === 1);
    const treasure = (deadEnds.length ? deadEnds : list.filter((rm) => rm.kind === 'combat')).slice(0, 1 + (r() < 0.5 ? 1 : 0));
    treasure.forEach((rm) => { rm.kind = 'treasure'; });
    // obstacles + encounters
    for (const rm of list) {
      rm.seed = Math.floor(r() * 1e9);
      if (rm.kind === 'combat' || rm.kind === 'stairs') {
        const layout = Math.floor(r() * 4);
        const cx = RW / 2, cy = Math.floor(RH / 2);
        if (layout === 1) for (const [bx, by] of [[5, 3], [16, 3], [5, 7], [16, 7]]) rm.blocks.push([bx, by]);
        if (layout === 2) for (let i = 8; i <= 13; i++) { rm.blocks.push([i, 3]); rm.blocks.push([i, 7]); }
        if (layout === 3) for (const [bx, by] of [[cx - 1, cy - 1], [cx, cy - 1], [cx - 1, cy], [cx, cy]]) rm.blocks.push([bx, by]);
        const enc = U.pick(ENCOUNTERS[floor - 1], r);
        rm.plan = [];
        for (let i = 0; i < enc.length; i += 2) for (let k = 0; k < enc[i + 1]; k++) rm.plan.push(enc[i]);
        if (rm.kind === 'stairs' && r() < 0.5) rm.plan.push(U.pick(['skeleton', 'bat', 'slime'], r));
      }
      if (rm.kind === 'treasure') rm.chestPlan = 2;
    }
    return { rooms: list, start, byKey: rooms, key };
  }

  // 3D looks for the dungeon's foes (full avatar specs for BF.char3d)
  const FOE_LOOK = {
    skeleton: { skin: '#efeae0', equipped: { face: { style: 'fangs' }, shirt: { style: 'plain', c1: '#e8ecf3', c2: '#cfd6e2' }, pants: { style: 'plain', c1: '#d7dde6' }, shoes: { style: 'sneaker', c1: '#cfd6e2', c2: '#cfd6e2' } } },
    archer: { skin: '#efeae0', equipped: { face: { style: 'fangs' }, shirt: { style: 'plain', c1: '#4a7a3a', c2: '#2f5a2a' }, pants: { style: 'plain', c1: '#3a3f2a' }, hat: { style: 'hood', c1: '#2f5a2a' } } },
    knight: { skin: '#8a94a6', equipped: { face: { style: 'robot' }, shirt: { style: 'plain', c1: '#8a94a6', c2: '#6a707c' }, pants: { style: 'armor', c1: '#6a707c', c2: '#9aa5b5' }, hat: { style: 'helmet', c1: '#9aa5b5' }, shoulder: { style: 'pads', c1: '#6a707c' } } },
    warden: { skin: '#3a3f4b', equipped: { face: { style: 'determined' }, shirt: { style: 'plain', c1: '#2a2f3a', c2: '#6a707c' }, pants: { style: 'armor', c1: '#1b1e26', c2: '#6a707c' }, hat: { style: 'horns', c1: '#c9ced8' }, back: { style: 'cape', c1: '#8a1f2e' }, shoulder: { style: 'pads', c1: '#6a707c' } } },
  };
  const FOE_SCALE = { skeleton: 7.5, archer: 7.5, knight: 8.6, warden: 17 };

  BF.GameModules.register('dungeon', {
    three: true,
    maxBots: 1,
    feedTop: 0.16,
    actions: { attack: ['KeyJ', 'Space'], dash: ['ShiftLeft', 'ShiftRight', 'KeyK'], potion: ['KeyQ'] },
    controls: { joystick: true, buttons: [{ act: 'attack', label: 'Attack', icon: 'sword' }, { act: 'dash', label: 'Dash', icon: 'run' }, { act: 'potion', label: 'Potion', icon: 'heart' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const V = ctx.g3;
      // 3D uses room coordinates directly (X = x, Z = y); floating texts arrive in screen space
      const parts = V ? V.particles2d(14) : new BF.Particles(500);
      const floats = V ? V.floaters2d(0, (x, y) => [x - OX, 56, y - OY + 20]) : new BF.Floaters();
      const d = ctx.data;
      const kit = ctx.hasPass('heroes_kit');
      const runSeed = 'df:' + Date.now();

      let phase = 'play';
      let floorN = 1;
      let floor = genFloor(runSeed, 1);
      let room = floor.start;
      let fade = 0, fadeTo = null;
      let kills = 0, chestsOpened = 0, gold = 0;
      let pendingLevels = 0;
      let bannerFloor = true;
      let winT = 0;
      const me = {
        x: PW / 2, y: PH / 2, r: 12, a: 0, walk: 0,
        hp: T.hp, maxHp: T.hp, sword: kit ? 2 : 0, armor: 0, potions: T.potions + (kit ? 2 : 0),
        lvl: 1, xp: 0, dmgMul: 1, swingT: 0, swingCd: 0, dashT: 0, dashCd: 0, inv: 0, dx: 1, dy: 0, flash: 0,
      };
      const ally = ctx.bots[0] ? makeAlly(ctx.bots[0]) : null;
      function makeAlly(b) {
        return { bot: b, x: PW / 2 - 50, y: PH / 2 + 20, a: 0, hp: 100, maxHp: 100, down: false, swingT: 0, swingCd: 0, walk: 0, dmg: 7 + Math.floor((ctx.botLevel(b) || 10) / 6) };
      }
      let allyRef = ally;
      const shots = [];
      const waves = [];

      const blocked = (x, y) => {
        const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
        if (tx <= 0 || ty <= 0 || tx >= RW - 1 || ty >= RH - 1) return !doorAt(tx, ty);
        return room.blocks.some((b) => b[0] === tx && b[1] === ty);
      };
      function doorAt(tx, ty) {
        const open = room.cleared || room.kind === 'start' || room.kind === 'treasure';
        if (!open) return false;
        if (ty === 0 && (tx === 10 || tx === 11)) return room.doors.n;
        if (ty === RH - 1 && (tx === 10 || tx === 11)) return room.doors.s;
        if (tx === 0 && ty >= 4 && ty <= 6) return room.doors.w;
        if (tx === RW - 1 && ty >= 4 && ty <= 6) return room.doors.e;
        return false;
      }
      function moveEnt(e, vx, vy, dt, r) {
        r = r || e.r || 12;
        const nx = e.x + vx * dt, ny = e.y + vy * dt;
        const ok = (x, y) => !blocked(x - r, y - r) && !blocked(x + r, y - r) && !blocked(x - r, y + r) && !blocked(x + r, y + r);
        let moved = false;
        if (ok(nx, e.y)) { e.x = nx; moved = true; }
        if (ok(e.x, ny)) { e.y = ny; moved = true; }
        return moved;
      }

      function enterRoom(rm, fromDir) {
        room = rm;
        const entry = { n: [PW / 2, PH - TS * 1.6], s: [PW / 2, TS * 1.6], w: [PW - TS * 1.6, PH / 2], e: [TS * 1.6, PH / 2] }[fromDir] || [PW / 2, PH / 2];
        me.x = entry[0]; me.y = entry[1];
        if (allyRef && !allyRef.down) { allyRef.x = me.x - me.dx * 30; allyRef.y = me.y - me.dy * 30; }
        shots.length = 0; waves.length = 0;
        if (!rm.visited) {
          rm.visited = true;
          const r = U.rng(rm.seed);
          if (rm.plan) {
            for (const kind of rm.plan) {
              let x, y, tries = 0;
              do { x = TS * 2 + r() * (PW - TS * 4); y = TS * 2 + r() * (PH - TS * 4); tries++; } while ((U.dist(x, y, me.x, me.y) < 220 || blocked(x, y)) && tries < 40);
              spawnFoe(kind, x, y);
            }
          }
          if (rm.kind === 'boss') { spawnFoe('warden', PW / 2, PH / 2 - 40); ctx.banner('THE FRONTIER WARDEN', 'Defeat him to escape the dungeon', 2200); ctx.sfx('explosion'); }
          if (rm.kind === 'treasure') { rm.chests.push({ x: PW / 2 - 60, y: PH / 2, open: false }, { x: PW / 2 + 60, y: PH / 2, open: false }); rm.cleared = true; }
          if (rm.kind === 'start') rm.cleared = true;
          if (rm.enemies.length) { ctx.sfx('beep'); }
          else rm.cleared = true;
        }
      }
      function spawnFoe(kind, x, y) {
        const f = FOES[kind];
        const hp = f.hp + f.hpF * (floorN - 1);
        room.enemies.push({ kind, x, y, hp, maxHp: hp, r: f.r, vx: 0, vy: 0, t: Math.random() * 2, cd: 1 + Math.random(), wind: 0, flash: 0, face: 0, kx: 0, ky: 0, phase: 1, summonT: 8, charge: null });
      }

      function hurtMe(dmg, fromX, fromY) {
        if (me.inv > 0 || me.dashT > 0 || phase !== 'play') return;
        dmg = Math.max(1, Math.round(dmg * (1 - ARMORS[me.armor].def)));
        me.hp -= dmg;
        me.inv = T.iframes;
        me.flash = 0.2;
        floats.add(me.x + OX, me.y + OY - 26, '-' + dmg, '#ff8b98', 15);
        ctx.sfx('hurt');
        const a = U.angleTo(fromX, fromY, me.x, me.y);
        moveEnt(me, Math.cos(a) * 900, Math.sin(a) * 900, 0.03);
        if (me.hp <= 0) onDown();
      }
      function onDown() {
        me.hp = 0;
        if ((d.revives || 0) > 0) {
          phase = 'revive';
          ctx.ui.panel('revive', '<h3>' + BF.icon('heart', 18) + ' You fell!</h3><p>You have ' + d.revives + ' Revive Feather' + (d.revives === 1 ? '' : 's') + '. Use one to get back up with half health?</p><div class="gp-actions"><button class="btn btn-ghost" data-gact="giveup">End run</button><button class="btn btn-play" data-gact="revive">' + BF.icon('sparkle', 14) + 'Use Revive Feather</button></div>', 'center');
        } else finish(false);
      }
      function hitFoe(e, dmg, fromX, fromY, byAlly) {
        const crit = !byAlly && Math.random() < T.crit;
        let amount = dmg * (crit ? T.critMul : 1);
        if (e.kind === 'knight') { const facing = Math.cos(e.face - U.angleTo(e.x, e.y, fromX, fromY)); if (facing > 0.5) { amount *= 0.45; floats.add(e.x + OX, e.y + OY - 30, 'Blocked', '#cfd6e2', 11); } }
        amount = Math.round(amount);
        e.hp -= amount;
        e.flash = 0.12;
        const a = U.angleTo(fromX, fromY, e.x, e.y);
        const kb = e.kind === 'warden' ? 40 : 240;
        e.kx = Math.cos(a) * kb; e.ky = Math.sin(a) * kb;
        floats.add(e.x + OX, e.y + OY - e.r - 8, (crit ? 'CRIT ' : '') + amount, crit ? '#ffd66b' : '#ffffff', crit ? 16 : 13);
        parts.emit(e.x, e.y, { count: 6, color: e.kind === 'slime' ? '#6be675' : e.kind === 'bat' ? '#b67cff' : '#e8ecf3', speed: 120, life: 0.35 });
        ctx.sfx('hit');
        if (e.hp <= 0) killFoe(e);
      }
      function killFoe(e) {
        const i = room.enemies.indexOf(e);
        if (i < 0) return;
        room.enemies.splice(i, 1);
        const f = FOES[e.kind];
        kills++;
        ctx.addStat('kills', 1);
        ctx.playerStat('kills', 1);
        ctx.quest('kill', 1);
        gainXp(f.xp);
        parts.emit(e.x, e.y, { count: 18, colors: ['#e8ecf3', '#9aa5b5', '#6be675'], speed: 170, life: 0.6 });
        if (Math.random() < 0.45) { const gd = f.gold + Math.floor(Math.random() * f.gold * floorN); gold += gd; floats.add(e.x + OX, e.y + OY - 14, '+' + gd + ' gold', '#ffd66b', 12); }
        if (Math.random() < 0.06) { me.potions++; floats.add(e.x + OX, e.y + OY - 30, '+1 potion', '#ff8fa3', 12); }
        if (e.kind === 'warden') {
          ctx.quest('boss', 1);
          ctx.playerStat('bossesDefeated', 1);
          ctx.badge('df_warden');
          gold += f.gold;
          ctx.sfx('explosion');
          parts.emit(e.x, e.y, { count: 80, colors: ['#ffd66b', '#ff7a2e', '#ffffff'], speed: 300, life: 1.1 });
          phase = 'won';
          winT = 1.2;
        }
        if (!room.enemies.length && phase === 'play') roomCleared();
      }
      function roomCleared() {
        room.cleared = true;
        ctx.sfx('powerup');
        ctx.banner('Room cleared', room.kind === 'stairs' ? 'The stairs are open' : '', 1000);
        if (room.kind === 'combat' && Math.random() < 0.55) room.chests.push({ x: PW / 2, y: PH / 2, open: false });
        if (allyRef && allyRef.down) { allyRef.down = false; allyRef.hp = allyRef.maxHp * 0.5; ctx.feed(allyRef.bot.displayName + ' is back on their feet.', 'info', '#8fd3ff'); }
        if (allyRef && Math.random() < 0.3) ctx.botSay(allyRef.bot, 'any', 400);
        if (pendingLevels > 0) levelChoice();
      }
      function gainXp(n) {
        me.xp += n;
        while (me.xp >= xpNeed(me.lvl)) {
          me.xp -= xpNeed(me.lvl);
          me.lvl++;
          pendingLevels++;
          floats.add(me.x + OX, me.y + OY - 40, 'LEVEL UP!', '#7fe7ff', 18);
          ctx.sfx('levelup');
        }
        if (pendingLevels > 0 && !room.enemies.length && phase === 'play') levelChoice();
      }
      function levelChoice() {
        if (ctx.ui.has('level')) return;
        ctx.ui.panel('level', '<h3>' + BF.icon('star', 18) + ' Level ' + (me.lvl - pendingLevels + 1) + '!</h3><p>Choose a bonus for this run.</p><div class="gp-grid">' +
          '<button class="gp-card" data-gact="lv-hp"><b>Vitality</b><small>+20 max health and heal 20</small></button>' +
          '<button class="gp-card" data-gact="lv-dmg"><b>Might</b><small>+15% sword damage</small></button>' +
          '<button class="gp-card" data-gact="lv-pot"><b>Alchemy</b><small>+1 potion and heal to full</small></button></div>', 'center');
      }
      function openChest(c) {
        c.open = true;
        chestsOpened++;
        if (chestsOpened >= 10) ctx.badge('df_hoarder');
        ctx.sfx('purchase');
        parts.emit(c.x, c.y, { count: 22, colors: ['#ffd66b', '#f2a318', '#ffffff'], speed: 160, life: 0.6 });
        const roll = Math.random();
        const tier = Math.min(floorN + (Math.random() < 0.3 ? 1 : 0), 4);
        let msg;
        if (roll < 0.3 && tier > me.sword) { me.sword = tier; msg = 'Found ' + U.withArticle(SWORDS[tier].name) + '!'; }
        else if (roll < 0.52 && Math.min(tier, 3) > me.armor) { me.armor = Math.min(tier, 3); msg = 'Found ' + ARMORS[me.armor].name + '!'; }
        else if (roll < 0.75) { me.potions++; msg = 'Found a potion!'; }
        else { const gd = 15 + Math.floor(Math.random() * 25 * floorN); gold += gd; msg = '+' + gd + ' gold'; }
        floats.add(c.x + OX, c.y + OY - 30, msg, '#ffd66b', 14);
        ctx.feed(msg, 'star', '#ffd66b');
      }
      function nextFloor() {
        floorN++;
        ctx.best('highestFloor', floorN, 'max');
        if (floorN === 2) ctx.badge('df_floor2');
        ctx.xp(T.rewards.xpFloor);
        floor = genFloor(runSeed, floorN);
        fade = 0.5;
        fadeTo = () => { enterRoom(floor.start); ctx.banner('FLOOR ' + floorN, floorN === 3 ? 'The Warden waits below' : 'Deeper into the frontier', 1800); };
        ctx.sfx('go');
      }
      function finish(win) {
        if (phase === 'over') return;
        phase = 'over';
        ['level', 'revive'].forEach((id) => ctx.ui.remove(id));
        ctx.best('highestFloor', floorN, 'max');
        const coins = T.rewards.play + (floorN - 1) * T.rewards.perFloor + Math.round(gold * T.rewards.goldRate) + (win ? T.rewards.win : 0);
        ctx.end({
          outcome: win ? 'win' : 'lose',
          title: win ? 'Warden defeated!' : 'Your run has ended',
          subtitle: win ? 'You escaped the Frontier with ' + gold + ' gold.' : 'You reached floor ' + floorN + '.',
          coins,
          xp: T.rewards.xpPlay + (win ? T.rewards.xpWin : 0),
          stats: [['Floor', floorN + ' / ' + T.floors], ['Monsters defeated', kills], ['Chests opened', chestsOpened], ['Gold', gold], ['Level', me.lvl], ['Gear', SWORDS[me.sword].name + ', ' + ARMORS[me.armor].name]],
        });
      }

      ctx.ui.on((a) => {
        if (a.indexOf('lv-') === 0 && pendingLevels > 0) {
          pendingLevels--;
          if (a === 'lv-hp') { me.maxHp += 20; me.hp = Math.min(me.maxHp, me.hp + 20); }
          if (a === 'lv-dmg') me.dmgMul *= 1.15;
          if (a === 'lv-pot') { me.potions++; me.hp = me.maxHp; }
          ctx.ui.remove('level');
          ctx.sfx('powerup');
          if (pendingLevels > 0) levelChoice();
        }
        if (a === 'revive' && phase === 'revive') {
          if (ctx.useConsumable('revives')) {
            me.hp = Math.round(me.maxHp * 0.5); me.inv = 2; phase = 'play';
            ctx.ui.remove('revive'); ctx.sfx('powerup');
            parts.emit(me.x, me.y, { count: 30, colors: ['#ffffff', '#ffd66b'], speed: 160, life: 0.8 });
            ctx.feed('Revive Feather used. Back in the fight!', 'star', '#ffd66b');
          }
        }
        if (a === 'giveup' && phase === 'revive') finish(false);
      });

      // ------------------------------------------------------------ AI
      function updateFoes(dt) {
        const targets = [me].concat(allyRef && !allyRef.down ? [allyRef] : []);
        for (const e of room.enemies.slice()) {
          const f = FOES[e.kind];
          e.t += dt;
          if (e.flash > 0) e.flash -= dt;
          if (e.kx || e.ky) { moveEnt(e, e.kx, e.ky, dt); e.kx *= 0.82; e.ky *= 0.82; if (Math.abs(e.kx) + Math.abs(e.ky) < 8) { e.kx = 0; e.ky = 0; } }
          const tgt = targets.reduce((b, t) => (U.dist(t.x, t.y, e.x, e.y) < U.dist(b.x, b.y, e.x, e.y) ? t : b), targets[0]);
          const dist = U.dist(tgt.x, tgt.y, e.x, e.y);
          const a = U.angleTo(e.x, e.y, tgt.x, tgt.y);
          e.face = a;
          if (e.kind === 'slime') {
            e.cd -= dt;
            if (e.cd <= 0) { e.cd = 0.9 + Math.random() * 0.4; e.vx = Math.cos(a) * f.speed * 2.4; e.vy = Math.sin(a) * f.speed * 2.4; e.hop = 0.35; }
            if (e.hop > 0) { e.hop -= dt; moveEnt(e, e.vx, e.vy, dt); }
          } else if (e.kind === 'bat') {
            const wob = Math.sin(e.t * 6) * 0.9;
            moveEnt(e, Math.cos(a + wob) * f.speed, Math.sin(a + wob) * f.speed, dt);
          } else if (e.kind === 'skeleton' || e.kind === 'knight') {
            if (e.wind > 0) {
              e.wind -= dt;
              if (e.wind <= 0) { for (const t of targets) if (U.dist(t.x, t.y, e.x, e.y) < e.r + 46 && Math.cos(U.angleTo(e.x, e.y, t.x, t.y) - e.swingA) > 0.3) { if (t === me) hurtMe(f.dmg + floorN * 2, e.x, e.y); else hurtAlly(f.dmg); } e.cd = 1.1; e.swingShow = 0.15; }
            } else {
              e.cd -= dt;
              if (dist > e.r + 30) moveEnt(e, Math.cos(a) * f.speed, Math.sin(a) * f.speed, dt);
              else if (e.cd <= 0) { e.wind = e.kind === 'knight' ? 0.6 : 0.45; e.swingA = a; }
            }
            if (e.swingShow > 0) e.swingShow -= dt;
          } else if (e.kind === 'archer') {
            e.cd -= dt;
            const want = dist < 180 ? -1 : dist > 300 ? 1 : 0;
            moveEnt(e, Math.cos(a) * f.speed * want + Math.cos(a + Math.PI / 2) * 30 * Math.sin(e.t), Math.sin(a) * f.speed * want + Math.sin(a + Math.PI / 2) * 30 * Math.sin(e.t), dt);
            if (e.cd <= 0) { e.cd = 1.9 + Math.random() * 0.6; shots.push({ x: e.x, y: e.y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, dmg: f.dmg + floorN * 2, t: 0 }); ctx.sfx('shoot', { volume: 0.5 }); }
          } else if (e.kind === 'warden') {
            const hpPct = e.hp / e.maxHp;
            if (hpPct < 0.6 && e.phase === 1) { e.phase = 2; ctx.banner('The Warden is enraged!', 'Watch for his charge', 1500); }
            if (hpPct < 0.3 && e.phase === 2) { e.phase = 3; ctx.banner('He calls the bats!', '', 1500); }
            if (e.phase === 3) { e.summonT -= dt; if (e.summonT <= 0) { e.summonT = 7; for (let i = 0; i < 3; i++) spawnFoe('bat', e.x + (i - 1) * 50, e.y - 40); ctx.sfx('beep'); } }
            if (e.charge) {
              e.charge.t -= dt;
              if (e.charge.t > 0.7) { /* telegraph */ }
              else { moveEnt(e, Math.cos(e.charge.a) * 520, Math.sin(e.charge.a) * 520, dt, e.r * 0.8); for (const t of targets) if (U.dist(t.x, t.y, e.x, e.y) < e.r + 14) { if (t === me) hurtMe(24, e.x, e.y); else hurtAlly(24); } }
              if (e.charge.t <= 0) e.charge = null;
            } else if (e.wind > 0) {
              e.wind -= dt;
              if (e.wind <= 0) { waves.push({ x: e.x, y: e.y, r: 10, max: 190, dmg: 22, hit: new Set() }); ctx.sfx('explosion'); e.cd = 1.4; }
            } else {
              e.cd -= dt;
              moveEnt(e, Math.cos(a) * f.speed * (e.phase > 1 ? 1.2 : 1), Math.sin(a) * f.speed * (e.phase > 1 ? 1.2 : 1), dt, e.r * 0.8);
              if (e.cd <= 0) {
                if (e.phase >= 2 && Math.random() < 0.45) { e.charge = { a, t: 1.4 }; e.cd = 2; }
                else if (dist < 170) { e.wind = 0.8; }
                else e.cd = 0.5;
              }
            }
          }
          // contact damage
          if (e.kind !== 'archer') for (const t of targets) if (U.dist(t.x, t.y, e.x, e.y) < e.r + 10) { if (t === me) hurtMe(Math.round(f.dmg * 0.6) + floorN, e.x, e.y); else hurtAlly(f.dmg * 0.5); }
          e.x = U.clamp(e.x, TS + e.r * 0.5, PW - TS - e.r * 0.5); e.y = U.clamp(e.y, TS + e.r * 0.5, PH - TS - e.r * 0.5);
        }
      }
      function hurtAlly(dmg) {
        const al = allyRef;
        if (!al || al.down || al.inv > 0) return;
        al.hp -= dmg; al.inv = 0.6;
        if (al.hp <= 0) { al.down = true; al.hp = 0; ctx.feed(al.bot.displayName + ' is down! Clear the room to revive them.', 'info', '#ff8b98'); ctx.botSay(al.bot, 'lose', 300); }
      }
      function updateAlly(dt) {
        const al = allyRef;
        if (!al || al.down) return;
        if (al.inv > 0) al.inv -= dt;
        if (al.swingCd > 0) al.swingCd -= dt;
        if (al.swingT > 0) al.swingT -= dt;
        let tgt = null, bd = 220;
        for (const e of room.enemies) { const dd = U.dist(e.x, e.y, al.x, al.y); if (dd < bd) { bd = dd; tgt = e; } }
        let tx = me.x - me.dx * 44, ty = me.y - me.dy * 44;
        if (tgt) { tx = tgt.x; ty = tgt.y; }
        const dd = U.dist(tx, ty, al.x, al.y);
        if (dd > (tgt ? tgt.r + 26 : 20)) { const a = U.angleTo(al.x, al.y, tx, ty); moveEnt(al, Math.cos(a) * 160, Math.sin(a) * 160, dt, 12); al.a = a; al.walk += dt * 10; }
        if (tgt && dd < tgt.r + 44 && al.swingCd <= 0) { al.swingCd = 0.7; al.swingT = 0.2; al.a = U.angleTo(al.x, al.y, tgt.x, tgt.y); hitFoe(tgt, al.dmg + floorN * 2, al.x, al.y, true); }
      }

      // ---------------------------------------------------------- player
      function aimAngle() {
        const p = ctx.input.pointer;
        if (p.moved || p.down) me.useMouse = true;
        if (Math.hypot(ctx.input.axis().x, ctx.input.axis().y) > 0.2 && !p.down) me.useMouse = false;
        if (me.useMouse && V) { const w = ctx.pointerWorld(20); return Math.atan2(w.y - me.y, w.x - me.x); }
        return me.useMouse ? Math.atan2(p.y - OY - me.y, p.x - OX - me.x) : Math.atan2(me.dy, me.dx);
      }
      function swing() {
        me.swingT = T.swingTime; me.swingCd = T.swingCd;
        me.swingA = aimAngle();
        ctx.sfx('swing');
        const dmg = SWORDS[me.sword].dmg * me.dmgMul;
        for (const e of room.enemies.slice()) {
          const dd = U.dist(e.x, e.y, me.x, me.y);
          if (dd > T.reach + e.r) continue;
          const diff = Math.abs(U.wrapAngle(U.angleTo(me.x, me.y, e.x, e.y) - me.swingA));
          if (diff < T.arc || dd < e.r + 8) hitFoe(e, dmg, me.x, me.y, false);
        }
        for (const c of room.chests) if (!c.open && U.dist(c.x, c.y, me.x, me.y) < 56) openChest(c);
      }

      function updatePlayer(dt) {
        const inp = ctx.input;
        const ax = inp.axis();
        if (me.inv > 0) me.inv -= dt;
        if (me.flash > 0) me.flash -= dt;
        if (me.swingT > 0) me.swingT -= dt;
        if (me.swingCd > 0) me.swingCd -= dt;
        if (me.dashCd > 0) me.dashCd -= dt;
        if (Math.hypot(ax.x, ax.y) > 0.15) { const l = Math.hypot(ax.x, ax.y); me.dx = ax.x / l; me.dy = ax.y / l; }
        if (me.dashT > 0) {
          me.dashT -= dt;
          moveEnt(me, me.dx * T.dashSpeed, me.dy * T.dashSpeed, dt);
          if (Math.random() < 0.6) parts.emit(me.x, me.y, { count: 1, color: 'rgba(255,255,255,.6)', speed: 20, life: 0.25 });
        } else if (Math.hypot(ax.x, ax.y) > 0.1) {
          moveEnt(me, ax.x * T.speed, ax.y * T.speed, dt);
          me.walk += dt * 12;
        }
        me.a = me.swingT > 0 ? me.swingA : Math.atan2(me.dy, me.dx);
        if (inp.actPressed('dash') && me.dashCd <= 0) { me.dashT = T.dashTime; me.dashCd = T.dashCd; ctx.sfx('boost', { volume: 0.5 }); }
        if ((inp.actPressed('attack') || inp.pointer.pressed) && me.swingCd <= 0) swing();
        if (inp.actPressed('potion')) {
          if (me.potions > 0 && me.hp < me.maxHp) { me.potions--; me.hp = Math.min(me.maxHp, me.hp + T.potionHeal); ctx.sfx('powerup'); floats.add(me.x + OX, me.y + OY - 30, '+' + T.potionHeal + ' HP', '#6be675', 14); }
          else floats.add(me.x + OX, me.y + OY - 30, me.potions ? 'Already at full health' : 'No potions', '#cfd6e2', 12);
        }
        // doors
        const tx = Math.floor(me.x / TS), ty = Math.floor(me.y / TS);
        const go = (dir, gx, gy) => { const nr = floor.byKey.get(floor.key(room.gx + gx, room.gy + gy)); if (nr) { fade = 0.25; fadeTo = () => enterRoom(nr, dir); } };
        if (!fade) {
          if (ty <= 0 && doorAt(tx, 0)) go('n', 0, -1);
          else if (ty >= RH - 1 && doorAt(tx, RH - 1)) go('s', 0, 1);
          else if (tx <= 0 && doorAt(0, ty)) go('w', -1, 0);
          else if (tx >= RW - 1 && doorAt(RW - 1, ty)) go('e', 1, 0);
        }
        // stairs
        if (room.kind === 'stairs' && room.cleared && U.dist(me.x, me.y, PW / 2, PH / 2) < 30 && !fade) nextFloor();
      }

      // ------------------------------------------------------------ draw
      function drawFoe(g, e, t) {
        const x = e.x, y = e.y;
        const fl = e.flash > 0;
        G.shadow(g, x, y + e.r * 0.7, e.r, e.r * 0.4, 0.3);
        if (e.kind === 'slime') {
          const sq = e.hop > 0 ? 0.8 : 1 + Math.sin(t * 6 + e.x) * 0.06;
          g.fillStyle = fl ? '#ffffff' : '#6be675';
          g.beginPath(); g.ellipse(x, y, e.r / sq, e.r * sq, 0, 0, TAU); g.fill();
          G.circle(g, x - 5, y - 3, 3, '#1b1b22'); G.circle(g, x + 5, y - 3, 3, '#1b1b22');
          G.circle(g, x - 6, y - 8, 3, 'rgba(255,255,255,.6)');
        } else if (e.kind === 'bat') {
          const flap = Math.sin(t * 22 + e.x) * 0.5;
          g.fillStyle = fl ? '#ffffff' : '#7a4bd6';
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - 22, y - 8 + flap * 14); g.lineTo(x - 10, y + 4); g.closePath(); g.fill();
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + 22, y - 8 + flap * 14); g.lineTo(x + 10, y + 4); g.closePath(); g.fill();
          G.circle(g, x, y, 9, fl ? '#ffffff' : '#4b2a8a'); G.circle(g, x - 3, y - 2, 2, '#ff5a6a'); G.circle(g, x + 3, y - 2, 2, '#ff5a6a');
        } else if (e.kind === 'warden') {
          const c = fl ? '#ffffff' : '#3a3f4b';
          if (e.charge && e.charge.t > 0.7) { g.globalAlpha = 0.3; G.line(g, x, y, x + Math.cos(e.charge.a) * 400, y + Math.sin(e.charge.a) * 400, '#ff3d5a', e.r * 1.6); g.globalAlpha = 1; }
          if (e.wind > 0) { g.globalAlpha = 0.25 + (0.8 - e.wind) * 0.5; G.circle(g, x, y, 190, '#ff3d5a'); g.globalAlpha = 1; }
          G.fillRR(g, x - e.r, y - e.r, e.r * 2, e.r * 2, 12, c);
          G.fillRR(g, x - e.r + 6, y - e.r + 6, e.r * 2 - 12, 18, 6, '#1b1e26');
          G.circle(g, x - 10, y - e.r + 15, 4, e.phase > 1 ? '#ff3d5a' : '#ffd66b'); G.circle(g, x + 10, y - e.r + 15, 4, e.phase > 1 ? '#ff3d5a' : '#ffd66b');
          g.save(); g.translate(x, y); g.rotate(e.face);
          G.fillRR(g, e.r - 6, -6, 38, 12, 4, '#6a707c'); G.fillRR(g, e.r + 26, -16, 18, 32, 4, '#9aa5b5');
          g.restore();
        } else {
          const body = e.kind === 'knight' ? '#8a94a6' : '#e8ecf3';
          g.save(); g.translate(x, y); g.rotate(e.face);
          if (e.wind > 0) { g.globalAlpha = 0.4; G.circle(g, 30, 0, 18, '#ff3d5a'); g.globalAlpha = 1; }
          if (e.swingShow > 0) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, e.r + 30, -0.9, 0.9); g.stroke(); }
          G.fillRR(g, -e.r * 0.7, -e.r, e.r * 1.4, e.r * 2, 5, fl ? '#ffffff' : body);
          if (e.kind === 'knight') G.fillRR(g, e.r * 0.4, -e.r * 0.9, 7, e.r * 1.8, 3, '#39414f');
          if (e.kind === 'archer') { g.strokeStyle = '#8b5a2b'; g.lineWidth = 3; g.beginPath(); g.arc(4, 0, 14, -1.2, 1.2); g.stroke(); }
          else G.fillRR(g, 6, e.r * 0.4, 20, 4, 2, '#c9ced8');
          G.circle(g, 0, 0, e.r * 0.62, fl ? '#ffffff' : e.kind === 'knight' ? '#6a707c' : '#f4f1ea');
          G.circle(g, e.r * 0.25, -4, 2.5, '#1b1b22'); G.circle(g, e.r * 0.25, 4, 2.5, '#1b1b22');
          g.restore();
        }
        if (e.hp < e.maxHp && e.kind !== 'warden') G.bar(g, x - 18, y - e.r - 14, 36, 5, e.hp / e.maxHp, '#ff5a6a');
      }

      function drawRoom(g, t) {
        const r = U.rng(room.seed || 1);
        const tint = ['#4a4238', '#3b4150', '#3a2f45'][floorN - 1];
        for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
          const edge = x === 0 || y === 0 || x === RW - 1 || y === RH - 1;
          const px = x * TS, py = y * TS;
          const v = r();
          if (edge && !doorAt(x, y)) {
            g.fillStyle = U.shade(tint, -0.35); g.fillRect(px, py, TS, TS);
            g.fillStyle = U.shade(tint, -0.15); g.fillRect(px + 2, py + 2, TS - 4, TS - 10);
          } else {
            g.fillStyle = U.shade(tint, v * 0.12 - 0.02); g.fillRect(px, py, TS, TS);
            g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1; g.strokeRect(px + 0.5, py + 0.5, TS - 1, TS - 1);
            if (v > 0.93) { g.strokeStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.moveTo(px + 8, py + 10); g.lineTo(px + 20, py + 22); g.lineTo(px + 30, py + 18); g.stroke(); }
          }
        }
        // locked door bars
        const locked = !(room.cleared || room.kind === 'start' || room.kind === 'treasure');
        const drawDoor = (x, y, w, h) => { if (locked) { g.fillStyle = '#2a2f3a'; g.fillRect(x, y, w, h); g.fillStyle = '#9aa5b5'; if (w > h) for (let i = 6; i < w; i += 12) g.fillRect(x + i, y + 4, 4, h - 8); else for (let i = 6; i < h; i += 12) g.fillRect(x + 4, y + i, w - 8, 4); } else { g.fillStyle = '#0b0e13'; g.fillRect(x, y, w, h); } };
        if (room.doors.n) drawDoor(10 * TS, 0, 2 * TS, TS);
        if (room.doors.s) drawDoor(10 * TS, (RH - 1) * TS, 2 * TS, TS);
        if (room.doors.w) drawDoor(0, 4 * TS, TS, 3 * TS);
        if (room.doors.e) drawDoor((RW - 1) * TS, 4 * TS, TS, 3 * TS);
        // torches
        for (const [tx, ty] of [[4, 0], [17, 0], [4, RH - 1], [17, RH - 1]]) {
          const fx = tx * TS + TS / 2, fy = ty * TS + (ty ? 10 : 30);
          const glow = g.createRadialGradient(fx, fy, 4, fx, fy, 90);
          glow.addColorStop(0, 'rgba(255,180,84,' + (0.28 + Math.sin(t * 9 + tx) * 0.05) + ')');
          glow.addColorStop(1, 'rgba(255,180,84,0)');
          g.fillStyle = glow; g.fillRect(fx - 90, fy - 90, 180, 180);
          G.circle(g, fx, fy, 6 + Math.sin(t * 14 + tx) * 1.5, '#ffd66b'); G.circle(g, fx, fy + 1, 3, '#ff7a2e');
        }
        for (const b of room.blocks) { G.fillRR(g, b[0] * TS + 2, b[1] * TS + 2, TS - 4, TS - 4, 5, U.shade(tint, -0.3)); G.fillRR(g, b[0] * TS + 5, b[1] * TS + 4, TS - 10, TS - 16, 4, U.shade(tint, 0.05)); }
        if (room.kind === 'stairs' && room.cleared) {
          for (let i = 0; i < 4; i++) G.fillRR(g, PW / 2 - 28 + i * 3, PH / 2 - 22 + i * 11, 56 - i * 6, 10, 2, U.shade('#6a707c', -i * 0.15));
          G.text(g, 'Stairs down', PW / 2, PH / 2 - 34, { size: 12, align: 'center', color: '#fff', stroke: 'rgba(0,0,0,.6)', strokeW: 3 });
        }
        for (const c of room.chests) {
          G.fillRR(g, c.x - 18, c.y - 12, 36, 24, 4, c.open ? '#6b4b2a' : '#8b5a2b');
          G.fillRR(g, c.x - 18, c.y - (c.open ? 20 : 16), 36, 8, 3, '#a86b3c');
          g.fillStyle = '#ffd66b'; g.fillRect(c.x - 3, c.y - 10, 6, 8);
          if (!c.open && U.dist(c.x, c.y, me.x, me.y) < 70) G.text(g, 'Attack to open', c.x, c.y - 26, { size: 11, align: 'center', color: '#ffd66b', stroke: 'rgba(0,0,0,.6)', strokeW: 3 });
        }
      }

      enterRoom(floor.start);

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        let built = null, builtOpen = null, roomGroup = null, flames = [], lights = [];
        const foePool = V.pool(), fxPool = V.pool(), shotPool = V.pool(), chestPool = V.pool();
        const swingGeo = V.own(new THREE.RingGeometry(0.62, 1, 18, 1, 0, T.arc * 2));
        const allyArcGeo = V.own(new THREE.RingGeometry(0.62, 1, 14, 1, 0, 1.6));
        const arc = new THREE.Mesh(swingGeo, V.mat('#ffffff', { basic: true, opacity: 0.55, side: 2, depthWrite: false }));
        arc.rotation.x = -Math.PI / 2;
        V.scene.add(arc);
        const allyArc = new THREE.Mesh(allyArcGeo, V.mat('#ffffff', { basic: true, opacity: 0.45, side: 2, depthWrite: false }));
        allyArc.rotation.x = -Math.PI / 2;
        V.scene.add(allyArc);
        const rich = V.q !== 'low';
        const isOpen = () => room.cleared || room.kind === 'start' || room.kind === 'treasure';

        function rebuild() {
          built = room; builtOpen = isOpen();
          if (roomGroup) V.remove(roomGroup);
          for (const l of lights) V.remove(l);
          lights = []; flames = [];
          roomGroup = V.group();
          const tint = U.shade(['#4a4238', '#3b4150', '#3a2f45'][floorN - 1], 0.18);
          V.preset(room.kind === 'boss' ? 'dusk' : 'cave', { fogNear: 1400, fogFar: 3000 });
          V.shadowSize(520);
          const r = U.rng(room.seed || 1);
          const stairs = room.kind === 'stairs' && room.cleared;
          const tiles = [], walls = [], caps = [];
          for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
            const edge = x === 0 || y === 0 || x === RW - 1 || y === RH - 1;
            const v = r();
            const cx = x * TS + TS / 2, cz = y * TS + TS / 2;
            if (edge) {
              if (doorAt(x, y) || ((y === 0 || y === RH - 1) && (x === 10 || x === 11) && (y === 0 ? room.doors.n : room.doors.s)) || ((x === 0 || x === RW - 1) && y >= 4 && y <= 6 && (x === 0 ? room.doors.w : room.doors.e))) {
                tiles.push({ x: cx, y: -10, z: cz, w: TS, h: 10, d: TS, color: U.shade(tint, -0.25) });
                continue;
              }
              const h = y === RH - 1 ? 22 : y === 0 ? 96 : 64;
              walls.push({ x: cx, z: cz, w: TS, h, d: TS, color: U.shade(tint, -0.3 + v * 0.1) });
              caps.push({ x: cx, y: h, z: cz, w: TS + 1, h: 4, d: TS + 1, color: U.shade(tint, 0.05) });
            } else {
              if (stairs && Math.abs(cx - PW / 2) < TS && Math.abs(cz - PH / 2) < TS) continue;
              tiles.push({ x: cx, y: -10, z: cz, w: TS - 1.5, h: 10 + (v > 0.9 ? 1.5 : 0), d: TS - 1.5, color: U.shade(tint, v * 0.12 - 0.02) });
            }
          }
          V.boxes(tiles, { parent: roomGroup });
          V.boxes(walls, { parent: roomGroup });
          V.boxes(caps, { parent: roomGroup, shadow: false });
          V.ground(-900, -900, PW + 900, PH + 900, '#060708', { parent: roomGroup, y: -12, basic: true });
          // doors: dark corridors, bars while the room is locked
          const door = (x, z, w, d, horiz, bx, bz) => {
            V.box(x, -10, z, w, 2, d, '#050608', { parent: roomGroup, basic: true });
            if (!builtOpen) for (let i = 6; i < (horiz ? w : d); i += 12) V.box(horiz ? x - w / 2 + i : bx, 0, horiz ? bz : z - d / 2 + i, 4, 70, 4, '#9aa5b5', { parent: roomGroup, metal: 0.6, rough: 0.4 });
          };
          if (room.doors.n) door(11 * TS, -TS / 2, 2 * TS, TS * 2, true, 0, TS / 2);
          if (room.doors.s) door(11 * TS, PH + TS / 2, 2 * TS, TS * 2, true, 0, PH - TS / 2);
          if (room.doors.w) door(-TS / 2, 5.5 * TS, TS * 2, 3 * TS, false, TS / 2, 0);
          if (room.doors.e) door(PW + TS / 2, 5.5 * TS, TS * 2, 3 * TS, false, PW - TS / 2, 0);
          // obstacles
          V.boxes(room.blocks.map((b) => ({ x: b[0] * TS + TS / 2, z: b[1] * TS + TS / 2, w: TS - 4, h: 44, d: TS - 4, color: U.shade(tint, -0.2) })), { parent: roomGroup });
          V.boxes(room.blocks.map((b) => ({ x: b[0] * TS + TS / 2, y: 44, z: b[1] * TS + TS / 2, w: TS - 8, h: 4, d: TS - 8, color: U.shade(tint, 0.1) })), { parent: roomGroup, shadow: false });
          // stairs down
          if (stairs) {
            for (let i = 0; i < 5; i++) V.box(PW / 2 - TS + i * 16 + 8, -14 - i * 12, PH / 2, 16, 4, TS * 2, U.shade('#6a707c', -i * 0.12), { parent: roomGroup });
            V.box(PW / 2, -80, PH / 2, TS * 2, 2, TS * 2, '#050608', { parent: roomGroup, basic: true });
          }
          // torches on the back and side walls
          for (const [tx, tz] of [[4 * TS + 20, TS + 2], [17 * TS + 20, TS + 2], [TS + 2, 2.5 * TS], [PW - TS - 2, 2.5 * TS]]) {
            V.box(tx, 48, tz, 6, 16, 6, '#3a2a20', { parent: roomGroup, shadow: false });
            const f = V.shape('cone', tx, 66, tz, 10, 16, 10, '#ffb454', { parent: roomGroup, glow: 1.6, shadow: false });
            flames.push(f);
            if (rich && lights.length < 3) {
              const l = new THREE.PointLight('#ffb454', 1.2, 420, 1.4);
              l.position.set(tx, 80, tz + 30);
              V.scene.add(l);
              lights.push(l);
            }
          }
          if (room.kind === 'boss') {
            const rr = V.shape('ring', PW / 2, 0.5, PH / 2, 360, 360, 1, '#ff3d5a', { parent: roomGroup, basic: true, opacity: 0.25, side: 2, shadow: false });
            rr.rotation.x = -Math.PI / 2;
          }
        }

        function foeModel(e) {
          if (FOE_LOOK[e.kind]) return null;
          const g = V.group();
          if (e.kind === 'slime') {
            g.userData.body = V.box(0, 0, 0, 30, 26, 30, '#6be675', { parent: g, opacity: 0.88, rough: 0.2 });
            V.box(0, 4, 0, 14, 12, 14, '#2f8f47', { parent: g, shadow: false });
            for (const sd of [-1, 1]) V.box(sd * 7, 14, 15.2, 5, 7, 1, '#1b1b22', { parent: g, shadow: false });
          } else if (e.kind === 'bat') {
            V.shape('sphere', 0, 0, 0, 16, 16, 16, '#4b2a8a', { parent: g });
            for (const sd of [-1, 1]) V.box(sd * 4, 2, 7, 3, 3, 1, '#ff5a6a', { parent: g, glow: 1, shadow: false });
            g.userData.wings = [-1, 1].map((sd) => { const w = V.group(g); w.position.x = sd * 6; V.box(sd * 12, -1, 0, 24, 2, 14, '#7a4bd6', { parent: w }); return w; });
          }
          return g;
        }

        function chestModel(c) {
          const g = V.group();
          V.box(0, 0, 0, 38, 20, 26, '#8b5a2b', { parent: g });
          V.box(0, 8, 13.2, 6, 8, 1, '#ffd66b', { parent: g, glow: 0.3, shadow: false });
          const lid = V.group(g);
          lid.position.set(0, 20, -13);
          V.box(0, 0, 13, 40, 8, 28, '#a86b3c', { parent: lid });
          g.userData.lid = lid;
          return g;
        }

        return function sync(dt) {
          const t = ctx.time;
          if (built !== room || builtOpen !== isOpen()) rebuild();
          V.look(PW / 2 + (me.x - PW / 2) * 0.55, 0, PH / 2 + 30 + (me.y - PH / 2) * 0.45, { dist: 580, pitch: 1.0, fov: 45, lerp: 0.08 }, dt);
          flames.forEach((f, i) => { const k = 1 + Math.sin(t * 14 + i * 2) * 0.15; f.scale.set(10 * k, 16 * (2 - k), 10 * k); });
          lights.forEach((l, i) => { l.intensity = 1.1 + Math.sin(t * 9 + i) * 0.15; });
          // foes
          for (const e of room.enemies) {
            if (!e._id) e._id = U.uid('foe');
            const sc = FOE_SCALE[e.kind];
            if (sc) {
              const rig = V.actor(e._id, FOE_LOOK[e.kind], { scale: sc });
              const mv = e._px != null && dt > 0 ? Math.hypot(e.x - e._px, e.y - e._py) / dt : 0;
              e._px = e.x; e._py = e.y;
              rig.setPos(e.x, 0, e.y);
              rig.faceAngle(e.face);
              rig.set({ move: e.charge && e.charge.t <= 0.7 ? 1.5 : mv / 90 });
              if (!rig._held) { rig.hold(e.kind === 'warden' ? 'hammer' : e.kind === 'archer' ? null : 'sword', e.kind === 'knight' ? '#c9ced8' : '#b7a88a'); rig._held = true; }
              if (e.flash > 0.08 && !e._fl) rig.play('hit');
              e._fl = e.flash > 0.08;
              if (e.swingShow > 0 && !e._sw) rig.play('attack');
              e._sw = e.swingShow > 0;
              if (e.kind === 'warden' && e.wind > 0 && Math.random() < 0.05) rig.play('attack');
            } else {
              const m = foePool.use(e, () => foeModel(e));
              if (e.kind === 'slime') {
                const sq = e.hop > 0 ? 0.75 : 1 + Math.sin(t * 6 + e.x) * 0.06;
                m.position.set(e.x, e.hop > 0 ? Math.sin((e.hop / 0.35) * Math.PI) * 18 : 0, e.y);
                m.scale.set(1 / sq, sq, 1 / sq);
                m.userData.body.material = V.mat(e.flash > 0 ? '#ffffff' : '#6be675', { opacity: 0.88, rough: 0.2 });
              } else {
                m.position.set(e.x, 34 + Math.sin(t * 5 + e.x) * 6, e.y);
                const flap = Math.sin(t * 22 + e.x) * 0.7;
                m.userData.wings[0].rotation.z = flap; m.userData.wings[1].rotation.z = -flap;
              }
              m.rotation.y = Math.PI / 2 - e.face;
            }
            // telegraphs
            if (e.wind > 0 && e.kind !== 'warden') {
              const w = fxPool.use('w' + e._id, () => { const m = V.shape('disc', 0, 1.5, 0, 36, 36, 1, '#ff3d5a', { basic: true, opacity: 0.45, depthWrite: false, shadow: false }); m.rotation.x = -Math.PI / 2; return m; });
              w.position.set(e.x + Math.cos(e.swingA || e.face) * 30, 1.5, e.y + Math.sin(e.swingA || e.face) * 30);
            }
            if (e.kind === 'warden' && e.wind > 0) {
              const w = fxPool.use('ww', () => { const m = V.shape('disc', 0, 1.5, 0, 380, 380, 1, '#ff3d5a', { basic: true, opacity: 0.25, depthWrite: false, shadow: false }); m.rotation.x = -Math.PI / 2; return m; });
              w.position.set(e.x, 1.5, e.y);
            }
            if (e.charge && e.charge.t > 0.7) {
              const c = fxPool.use('wc', () => V.box(0, 0, 0, 400, 1, e.r * 1.6, '#ff3d5a', { basic: true, opacity: 0.3, depthWrite: false, shadow: false }));
              c.position.set(e.x + Math.cos(e.charge.a) * 200, 1.5, e.y + Math.sin(e.charge.a) * 200);
              c.rotation.y = -e.charge.a;
            }
            if (e.hp < e.maxHp && e.kind !== 'warden') V.label(e.x, e.kind === 'bat' ? 62 : (sc ? sc * 6.6 : 40), e.y, { hp: e.hp / e.maxHp, hpColor: '#ff5a6a' });
          }
          foePool.sweep();
          for (const w of waves) {
            const m = fxPool.use(w, () => { const r = V.shape('ring', 0, 2, 0, 1, 1, 1, '#ff7a2e', { basic: true, opacity: 0.8, side: 2, shadow: false }); r.rotation.x = -Math.PI / 2; return r; });
            m.position.set(w.x, 2, w.y);
            m.scale.set(w.r * 2, w.r * 2, 1);
          }
          fxPool.sweep();
          for (const sh of shots) {
            const m = shotPool.use(sh, () => V.box(0, 0, 0, 22, 2, 2, '#e8d3a8', { shadow: false }));
            m.position.set(sh.x, 28, sh.y);
            m.rotation.y = -Math.atan2(sh.vy, sh.vx);
          }
          shotPool.sweep();
          for (const c of room.chests) {
            const m = chestPool.use(c, () => chestModel(c));
            m.position.set(c.x, 0, c.y);
            m.userData.lid.rotation.x = c.open ? -1.9 : 0;
            if (!c.open && U.dist(c.x, c.y, me.x, me.y) < 70) V.label(c.x, 44, c.y, { name: 'Attack to open', color: '#ffd66b' });
          }
          chestPool.sweep();
          if (room.kind === 'stairs' && room.cleared) V.label(PW / 2, 40, PH / 2 - 30, { name: 'Stairs down', color: '#ffffff' });
          // ally
          allyArc.visible = false;
          if (allyRef) {
            const al = allyRef;
            const rig = V.actor(al.bot.id, al.bot.avatar, { scale: 8 });
            rig.setPos(al.x, 0, al.y);
            rig.faceAngle(al.a);
            const mv = al._px != null && dt > 0 ? Math.hypot(al.x - al._px, al.y - al._py) / dt : 0;
            al._px = al.x; al._py = al.y;
            rig.set({ move: mv / 160, mode: al.down ? 'ko' : 'idle' });
            if (!rig._held) { rig.hold('sword', '#c9ced8'); rig._held = true; }
            if (al.swingT > 0.18 && !al._sw) rig.play('attack');
            al._sw = al.swingT > 0.18;
            if (al.swingT > 0) { allyArc.visible = true; allyArc.position.set(al.x, 22, al.y); allyArc.scale.set(46, 46, 1); allyArc.rotation.z = -(al.a + 0.8); }
            V.label(al.x, 56, al.y, { name: al.bot.displayName, color: '#8fd3ff', hp: al.hp / al.maxHp, hpColor: '#3fd08a', bubble: ctx.bubbleText(al.bot.id) });
          }
          // me
          const rig = V.actor('me', ctx.player.avatar, { scale: 8.2 });
          rig.setPos(me.x, 0, me.y);
          rig.faceAngle(me.a);
          const mv = me._px != null && dt > 0 ? Math.hypot(me.x - me._px, me.y - me._py) / dt : 0;
          me._px = me.x; me._py = me.y;
          rig.set({ move: me.dashT > 0 ? 1.4 : mv / T.speed, mode: phase === 'revive' ? 'ko' : 'idle' });
          if (rig._sword !== me.sword) { rig.hold('sword', SWORDS[me.sword].color); rig._sword = me.sword; }
          if (me.swingT > T.swingTime - 0.03 && !me._sw) rig.play('attack');
          me._sw = me.swingT > T.swingTime - 0.03;
          if (me.flash > 0.15 && !me._fl) rig.play('hit');
          me._fl = me.flash > 0.15;
          rig.group.visible = !(me.inv > 0 && Math.sin(t * 40) > 0.3);
          arc.visible = me.swingT > 0;
          if (arc.visible) {
            arc.position.set(me.x, 22, me.y);
            arc.scale.set(T.reach, T.reach, 1);
            arc.rotation.z = -(me.swingA + T.arc);
            arc.material = V.mat(SWORDS[me.sword].color, { basic: true, opacity: 0.55, side: 2, depthWrite: false });
          }
          V.label(me.x, 56, me.y, { name: ctx.player.name, color: '#ffb454', bubble: ctx.bubbleText('me') });
          V.sweep();
        };
      })();

      return {
        update(dt) {
          parts.update(dt);
          floats.update(dt);
          if (bannerFloor) { bannerFloor = false; ctx.banner('FLOOR 1', 'Find the stairs. Defeat the Warden on floor 3.', 2000); }
          if (fade > 0) { fade -= dt; if (fade <= 0.12 && fadeTo) { const f = fadeTo; fadeTo = null; f(); } if (fade < 0) fade = 0; }
          for (const w of waves) {
            w.r += 420 * dt;
            for (const t of [me].concat(allyRef && !allyRef.down ? [allyRef] : [])) { const dd = U.dist(t.x, t.y, w.x, w.y); if (!w.hit.has(t) && Math.abs(dd - w.r) < 16) { w.hit.add(t); if (t === me) hurtMe(w.dmg, w.x, w.y); else hurtAlly(w.dmg); } }
          }
          for (let i = waves.length - 1; i >= 0; i--) if (waves[i].r > waves[i].max) waves.splice(i, 1);
          if (phase === 'won') { winT -= dt; if (winT <= 0) finish(true); return; }
          if (phase !== 'play') return;
          updatePlayer(dt);
          updateAlly(dt);
          updateFoes(dt);
          for (let i = shots.length - 1; i >= 0; i--) {
            const s = shots[i];
            s.x += s.vx * dt; s.y += s.vy * dt; s.t += dt;
            if (blocked(s.x, s.y) || s.t > 3) { shots.splice(i, 1); continue; }
            if (U.dist(s.x, s.y, me.x, me.y) < 14) { shots.splice(i, 1); hurtMe(s.dmg, s.x - s.vx, s.y - s.vy); continue; }
            if (allyRef && !allyRef.down && U.dist(s.x, s.y, allyRef.x, allyRef.y) < 14) { shots.splice(i, 1); hurtAlly(s.dmg); }
          }
        },

        draw(g) {
          const t = ctx.time;
          g.fillStyle = '#0b0d12';
          g.fillRect(0, 0, W, H);
          g.save();
          g.translate(OX, OY);
          drawRoom(g, t);
          for (const e of room.enemies) drawFoe(g, e, t);
          for (const s of shots) { const a = Math.atan2(s.vy, s.vx); G.line(g, s.x - Math.cos(a) * 12, s.y - Math.sin(a) * 12, s.x, s.y, '#e8d3a8', 3); }
          for (const w of waves) { g.globalAlpha = 1 - w.r / w.max; G.ring(g, w.x, w.y, w.r, '#ff7a2e', 8); g.globalAlpha = 1; }
          if (allyRef) {
            const al = allyRef;
            G.avatarTop(g, al.x, al.y, 12, al.bot.look, al.down ? 0 : al.a, { walk: al.walk, alpha: al.down ? 0.45 : 1 });
            if (al.swingT > 0) { g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 4; g.beginPath(); g.arc(al.x, al.y, 40, al.a - 0.8, al.a + 0.8); g.stroke(); }
            G.nameTag(g, al.x, al.y - 16, al.bot.displayName, '#8fd3ff');
            G.bar(g, al.x - 16, al.y + 16, 32, 4, al.hp / al.maxHp, '#3fd08a');
            const bb = ctx.bubbleText(al.bot.id);
            if (bb) G.bubble(g, al.x, al.y - 36, bb);
          }
          const blink = me.inv > 0 && Math.sin(t * 40) > 0;
          G.avatarTop(g, me.x, me.y, me.r, ctx.player.look, me.a, { walk: me.walk, alpha: blink ? 0.5 : 1, flash: me.flash > 0 });
          const sw = SWORDS[me.sword];
          if (me.swingT > 0) {
            const k = 1 - me.swingT / T.swingTime;
            const a0 = me.swingA - T.arc + k * T.arc * 2;
            g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 10; g.beginPath(); g.arc(me.x, me.y, T.reach - 8, me.swingA - T.arc, a0); g.stroke();
            G.line(g, me.x + Math.cos(a0) * 12, me.y + Math.sin(a0) * 12, me.x + Math.cos(a0) * T.reach, me.y + Math.sin(a0) * T.reach, sw.color, 5);
          } else {
            const a0 = me.a + 0.9;
            G.line(g, me.x + Math.cos(a0) * 10, me.y + Math.sin(a0) * 10, me.x + Math.cos(a0) * 10 + Math.cos(me.a) * 24, me.y + Math.sin(a0) * 10 + Math.sin(me.a) * 24, sw.color, 4);
          }
          G.nameTag(g, me.x, me.y - 16, ctx.player.name, '#ffb454');
          const mb = ctx.bubbleText('me');
          if (mb) G.bubble(g, me.x, me.y - 36, mb);
          parts.draw(g);
          g.restore();
          floats.draw(g);
          drawHud(g);
        },

        render3d(dt) { view(dt); },
        hud(g) { drawHud(g); },

        /** Automated-test hooks (not used by gameplay). */
        _test: {
          state: () => ({ floor: floorN, room: room.kind, enemies: room.enemies.length, hp: me.hp, kills, chests: chestsOpened, lvl: me.lvl, phase }),
          goto(kind) { const rm = floor.rooms.find((r) => r.kind === kind && !r.visited) || floor.rooms.find((r) => r.kind === kind); if (rm) enterRoom(rm, 'w'); return !!rm; },
          nextFloor() { nextFloor(); },
          heal() { me.hp = me.maxHp; },
        },
        onBotJoin(b) { if (!allyRef) { allyRef = makeAlly(b); allyRef.x = me.x - 40; allyRef.y = me.y; ctx.feed(b.displayName + ' joined your party.', 'join', '#8fd3ff'); } },
        onBotLeave(b) { if (allyRef && allyRef.bot.id === b.id) { allyRef = null; ctx.feed(b.displayName + ' left the party.', 'leave', '#cfd6e2'); } },
      };

      function drawHud(g) {
          if (fade > 0) { g.fillStyle = 'rgba(0,0,0,' + Math.min(1, (0.25 - Math.abs(fade - 0.125)) * 8) + ')'; g.fillRect(0, 0, W, H); }
          G.panel(g, 10, 8, 330, 68);
          G.text(g, 'HP', 22, 30, { size: 11, color: '#a1abbb' });
          G.bar(g, 46, 20, 170, 12, me.hp / me.maxHp, me.hp / me.maxHp < 0.3 ? '#ff5a6a' : '#3fd08a');
          G.text(g, Math.ceil(me.hp) + ' / ' + me.maxHp, 222, 31, { size: 12, color: '#fff' });
          G.text(g, 'Lv ' + me.lvl, 22, 54, { size: 12, color: '#7fe7ff', weight: 800 });
          G.bar(g, 64, 46, 152, 6, me.xp / xpNeed(me.lvl), '#7fe7ff');
          G.text(g, '♥ ' + me.potions + ' (Q)', 222, 55, { size: 12, color: '#ff8fa3' });
          G.text(g, SWORDS[me.sword].name + ' · ' + ARMORS[me.armor].name + (d.revives ? ' · Feathers ' + d.revives : ''), 22, 70, { size: 10.5, color: '#cfd6e2' });
          G.panel(g, 350, 8, 190, 68);
          G.text(g, 'Floor ' + floorN + ' / ' + T.floors, 362, 32, { size: 16, weight: 800, color: '#fff' });
          G.text(g, 'Gold ' + gold + ' · Kills ' + kills, 362, 54, { size: 12, color: '#ffd66b' });
          G.text(g, room.kind === 'boss' ? 'Warden arena' : room.kind === 'treasure' ? 'Treasure room' : room.kind === 'stairs' ? 'Stairwell' : room.enemies.length ? room.enemies.length + ' foes remain' : 'Room clear', 362, 70, { size: 10.5, color: '#a1abbb' });
          // boss bar
          const boss = room.enemies.find((e) => e.kind === 'warden');
          if (boss) { G.panel(g, W / 2 - 170, H - 34, 340, 26); G.bar(g, W / 2 - 160, H - 26, 250, 10, boss.hp / boss.maxHp, '#ff3d5a'); G.text(g, 'Frontier Warden', W / 2 + 160, H - 17, { size: 11, align: 'right', color: '#fff' }); }
          // minimap
          const cs = 14, mx = W - 5 * cs - 16, my = 10;
          G.panel(g, mx - 6, my - 4, 5 * cs + 12, 5 * cs + 8, 0.7);
          for (const rm of floor.rooms) {
            const seen = rm.visited || floor.rooms.some((o) => o.visited && Math.abs(o.gx - rm.gx) + Math.abs(o.gy - rm.gy) === 1);
            if (!seen) continue;
            g.fillStyle = rm === room ? '#ffb454' : rm.visited ? (rm.kind === 'stairs' || rm.kind === 'boss' ? '#ff5a6a' : rm.kind === 'treasure' ? '#ffd66b' : '#9aa5b5') : 'rgba(154,165,181,.3)';
            g.fillRect(mx + rm.gx * cs + 1, my + rm.gy * cs + 1, cs - 3, cs - 3);
          }
      }
    },
  });
})((window.BF = window.BF || {}));
