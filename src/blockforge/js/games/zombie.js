/**
 * Zombie Outbreak (gameType "zombie") — co-op wave survival in a farmhouse.
 * Zombies tear planks off the windows and climb in. Earn points for hits,
 * kills and repairs; spend them on wall weapons, ammo and perks. Brutes
 * appear on waves 5 and 10. Squadmates (bots) fight, repair and revive.
 * Win: survive 10 waves until the rescue chopper lands. Lose: everyone down.
 * Passes: arsenal (start with a pump shotgun), fortified (planks x2 health).
 * Store: Medkit Crate (progress.custom.medkits).
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;
  const P = BF.phys;
  const TAU = Math.PI * 2;

  const T = {
    waves: 10, hp: 100, speed: 165, r: 12, regenDelay: 4, regen: 12, break: 10, prep: 6, planks: 6, plankHp: 40,
    repairT: 0.55, reviveT: 3, medkit: 60, contact: 12, contactCd: 0.8,
    points: { hit: 10, kill: 60, plank: 10 },
    rewards: { play: 15, perWave: 6, win: 70, xpPlay: 30, xpWave: 10, xpWin: 120 },
  };
  const GUNS = {
    pistol: { name: 'Pistol', dmg: 22, rate: 0.28, mag: 8, reserve: 72, reload: 1.1, spread: 0.04, pellets: 1, speed: 900 },
    smg: { name: 'SMG', dmg: 17, rate: 0.085, mag: 30, reserve: 210, reload: 1.7, spread: 0.09, pellets: 1, speed: 950, price: 1000 },
    shotgun: { name: 'Pump Shotgun', dmg: 15, rate: 0.75, mag: 6, reserve: 42, reload: 2.1, spread: 0.28, pellets: 7, speed: 820, price: 1500 },
    rifle: { name: 'Marksman Rifle', dmg: 70, rate: 0.45, mag: 10, reserve: 70, reload: 1.9, spread: 0.01, pellets: 1, speed: 1300, pierce: 3, price: 2000 },
  };
  const PERKS = { jug: { name: 'Juggernaut Tonic', price: 2500, desc: '+100 max health' }, quick: { name: 'Quick Hands', price: 2000, desc: 'Reload twice as fast' } };

  const HX0 = 170, HY0 = 100, HX1 = 790, HY1 = 460, WT = 14, WINW = 64;
  const INSIDE = { x: HX0 + WT, y: HY0 + WT, w: HX1 - HX0 - WT * 2, h: HY1 - HY0 - WT * 2 };
  const WINDOWS = [
    { id: 1, x: 320, y: HY0, side: 'n' }, { id: 2, x: 640, y: HY0, side: 'n' },
    { id: 3, x: 320, y: HY1, side: 's' }, { id: 4, x: 640, y: HY1, side: 's' },
    { id: 5, x: HX0, y: 280, side: 'w' }, { id: 6, x: HX1, y: 280, side: 'e' },
  ];
  const OUTWARD = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
  // wall rectangles (with window gaps) for bullets and movement
  const WALLS = (() => {
    const out = [];
    const hWall = (y, xs) => { let x = HX0; for (const wx of xs) { out.push({ x, y: y - WT / 2, w: wx - WINW / 2 - x, h: WT }); x = wx + WINW / 2; } out.push({ x, y: y - WT / 2, w: HX1 - x, h: WT }); };
    const vWall = (x, ys) => { let y = HY0; for (const wy of ys) { out.push({ x: x - WT / 2, y, w: WT, h: wy - WINW / 2 - y }); y = wy + WINW / 2; } out.push({ x: x - WT / 2, y, w: WT, h: HY1 - y }); };
    hWall(HY0, [320, 640]); hWall(HY1, [320, 640]); vWall(HX0, [280]); vWall(HX1, [280]);
    return out;
  })();
  const FURNITURE = [{ x: 430, y: 240, w: 100, h: 60, kind: 'table' }, { x: 250, y: 360, w: 90, h: 34, kind: 'couch' }, { x: 640, y: 170, w: 40, h: 70, kind: 'shelf' }];
  const BUYS = [
    { kind: 'gun', id: 'smg', x: 480, y: HY0 + 24 },
    { kind: 'gun', id: 'shotgun', x: HX0 + 26, y: 170 },
    { kind: 'gun', id: 'rifle', x: HX1 - 26, y: 390 },
    { kind: 'perk', id: 'jug', x: 480, y: HY1 - 24 },
    { kind: 'perk', id: 'quick', x: HX0 + 26, y: 400 },
  ];
  const TREES = (() => { const r = U.rng('zo-trees'); const out = []; while (out.length < 26) { const x = r() * 960, y = r() * 540; if (x > HX0 - 70 && x < HX1 + 70 && y > HY0 - 70 && y < HY1 + 70) continue; out.push({ x, y, s: 0.7 + r() * 0.7 }); } return out; })();

  BF.GameModules.register('zombie', {
    maxBots: 3,
    feedTop: 0.19,
    actions: { shoot: ['Space'], reload: ['KeyR'], use: ['KeyE'], medkit: ['KeyQ'], slot1: ['Digit1'], slot2: ['Digit2'] },
    controls: { joystick: true, buttons: [{ act: 'shoot', label: 'Shoot', icon: 'crosshair' }, { act: 'reload', label: 'Reload', icon: 'refresh' }, { act: 'use', label: 'Repair / Buy', icon: 'hammer' }, { act: 'medkit', label: 'Medkit', icon: 'heart' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const parts = new BF.Particles(600);
      const floats = new BF.Floaters();
      const d = ctx.data;
      const plankHp = T.plankHp * (ctx.hasPass('fortified') ? 2 : 1);
      const windows = WINDOWS.map((w) => Object.assign({}, w, { planks: T.planks, hp: plankHp, busy: 0 }));
      const gunState = (id) => ({ id, mag: GUNS[id].mag, reserve: GUNS[id].reserve });

      let phase = 'prep';
      let timer = T.prep;
      let wave = 0;
      let toSpawn = 0, spawnT = 0;
      let brutes = [];
      let kills = 0, planksFixed = 0;
      const zombies = [];
      const tracers = [];
      let chopper = null;
      const me = {
        isMe: true, name: ctx.player.name, look: ctx.player.look, x: 480, y: 330, a: -Math.PI / 2, walk: 0,
        hp: T.hp, maxHp: T.hp, hurtT: 9, down: 0, reviveT: 0, points: 500, perks: {},
        guns: [gunState('pistol')].concat(ctx.hasPass('arsenal') ? [gunState('shotgun')] : []), slot: ctx.hasPass('arsenal') ? 1 : 0,
        fireCd: 0, reloadT: 0, repairT: 0, useMouse: false, flash: 0,
      };
      const squad = [];
      function addMate(b) {
        if (squad.length >= 3 || squad.some((m) => m.bot.id === b.id)) return;
        const lvl = ctx.botLevel(b) || 10;
        const spots = [[340, 200], [620, 350], [330, 330]];
        const sp = spots[squad.length] || [480, 300];
        squad.push({ bot: b, name: b.displayName, look: b.look, x: sp[0], y: sp[1], a: 0, walk: 0, hp: T.hp, maxHp: T.hp, down: 0, gun: lvl > 25 ? 'smg' : 'pistol', mag: 0, fireCd: 0, reloadT: 0, repairT: 0, skill: U.clamp(lvl / 55, 0.2, 0.9), guard: WINDOWS[squad.length * 2 % WINDOWS.length], tx: sp[0], ty: sp[1], thinkT: 0, hurtT: 9 });
        const m = squad[squad.length - 1]; m.mag = GUNS[m.gun].mag;
      }
      ctx.bots.forEach(addMate);
      const people = () => [me].concat(squad);
      const gun = () => me.guns[me.slot];

      // ----------------------------------------------------------- helpers
      function moveInside(e, vx, vy, dt, r) {
        e.x += vx * dt; e.y += vy * dt;
        P.clampTo(e, r || T.r, INSIDE);
        P.resolve(e, r || T.r, FURNITURE);
      }
      function blockedShot(x1, y1, x2, y2) {
        for (const w of WALLS) if (P.segRect(x1, y1, x2, y2, w)) return true;
        return false;
      }
      function spawnZombie(brute) {
        const win = U.pick(windows);
        const o = OUTWARD[win.side];
        const side = Math.random();
        let x, y;
        if (win.side === 'n') { x = win.x + (side - 0.5) * 400; y = -30; }
        else if (win.side === 's') { x = win.x + (side - 0.5) * 400; y = H + 30; }
        else if (win.side === 'w') { x = -30; y = win.y + (side - 0.5) * 300; }
        else { x = W + 30; y = win.y + (side - 0.5) * 300; }
        const hp = (60 + wave * 18) * (brute ? 3.2 : 1);
        zombies.push({ x, y, win, stage: 'approach', hp, maxHp: hp, speed: Math.min(115, 38 + wave * 6 + Math.random() * 12) * (brute ? 0.8 : 1), brute, r: brute ? 19 : 13, t: Math.random() * 3, atkT: 0, climb: 0, flash: 0, hitCd: 0, tx: win.x + o[0] * 34, ty: win.y + o[1] * 34 });
      }
      function startWave() {
        wave++;
        phase = 'wave';
        toSpawn = 6 + wave * 3;
        spawnT = 0.5;
        ctx.banner('WAVE ' + wave, wave === T.waves ? 'Final wave: hold on for the chopper!' : wave === 5 ? 'Brutes are coming' : '', 1800);
        ctx.sfx('beep');
        brutes = wave === 5 ? [4] : wave === 10 ? [4, 7, 10] : [];
        squad.forEach((m) => { if (m.down) { m.down = 0; m.hp = 60; ctx.feed(m.name + ' got back up.', 'info', '#8fd3ff'); } });
      }
      function waveCleared() {
        ctx.best('highestWave', wave, 'max');
        ctx.quest('wave', 1);
        ctx.playerStat('wavesCleared', 1);
        ctx.xp(T.rewards.xpWave);
        if (wave >= 5) ctx.badge('zo_wave5');
        if (wave >= T.waves) {
          phase = 'chopper';
          chopper = { x: -120, y: 60, t: 0 };
          ctx.banner('THE CHOPPER IS HERE!', 'You survived the outbreak', 2400);
          ctx.sfx('win');
          ctx.badge('zo_rescued');
          return;
        }
        phase = 'break';
        timer = T.break;
        ctx.banner('Wave ' + wave + ' survived', 'Repair the windows and gear up', 1600);
        ctx.sfx('powerup');
        if (Math.random() < 0.6) { const m = U.pick(squad.filter((x) => !x.down)); if (m) ctx.botSay(m.bot, 'win', 600); }
      }
      function hurt(p, dmg, from) {
        if (p.down || phase === 'over' || phase === 'chopper') return;
        p.hp -= dmg;
        p.hurtT = 0;
        if (p.isMe) { me.flash = 0.25; ctx.sfx('hurt'); floats.add(p.x, p.y - 24, '-' + dmg, '#ff8b98', 14); }
        if (p.hp <= 0) {
          p.hp = 0;
          p.down = 1;
          p.reviveT = 0;
          if (p.isMe) {
            ctx.banner('You are down!', squad.some((m) => !m.down) ? 'A squadmate is coming to revive you' : 'Nobody is left to help...', 1800);
          } else {
            ctx.feed(p.name + ' is down! Hold E next to them to revive.', 'info', '#ff8b98');
            ctx.botSay(p.bot, 'lose', 300);
          }
          if (people().every((x) => x.down)) finish(false);
        }
      }
      function killZombie(z, byMe) {
        zombies.splice(zombies.indexOf(z), 1);
        parts.emit(z.x, z.y, { count: z.brute ? 40 : 18, colors: ['#5a8a3a', '#8fbf5a', '#3a2a2a'], speed: 180, life: 0.6 });
        if (byMe) {
          me.points += T.points.kill * (z.brute ? 4 : 1);
          kills++;
          ctx.addStat('kills', 1);
          ctx.playerStat('kills', 1);
          ctx.quest('kill', 1);
          if (z.brute) { ctx.quest('boss', 1); ctx.playerStat('bossesDefeated', 1); ctx.feed('You took down a Brute!', 'star', '#ffd66b'); }
        }
      }
      function damageZombie(z, dmg, byMe) {
        z.hp -= dmg;
        z.flash = 0.08;
        if (byMe) me.points += T.points.hit;
        parts.emit(z.x, z.y, { count: 3, color: '#5a8a3a', speed: 90, life: 0.3 });
        if (z.hp <= 0) killZombie(z, byMe);
      }
      function fire(p, gid, aim, isMe) {
        const g = GUNS[gid];
        const sx = p.x + Math.cos(aim) * 16, sy = p.y + Math.sin(aim) * 16;
        for (let k = 0; k < g.pellets; k++) {
          const a = aim + (Math.random() - 0.5) * g.spread * 2;
          const range = 700;
          let ex = sx + Math.cos(a) * range, ey = sy + Math.sin(a) * range;
          // walls
          let wallT = 1;
          for (const w of WALLS) if (P.segRect(sx, sy, ex, ey, w)) {
            // binary search the hit point
            let lo = 0, hi = 1;
            for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (P.segRect(sx, sy, sx + (ex - sx) * mid, sy + (ey - sy) * mid, w)) hi = mid; else lo = mid; }
            wallT = Math.min(wallT, hi);
          }
          ex = sx + (ex - sx) * wallT; ey = sy + (ey - sy) * wallT;
          const hits = zombies.map((z) => ({ z, d: P.distToSeg(z.x, z.y, sx, sy, ex, ey), t: U.dist(sx, sy, z.x, z.y) })).filter((h) => h.d < h.z.r).sort((a2, b2) => a2.t - b2.t).slice(0, g.pierce || 1);
          for (const h of hits) damageZombie(h.z, g.dmg, isMe);
          const last = hits.length && !g.pierce ? hits[0] : null;
          tracers.push({ x1: sx, y1: sy, x2: last ? last.z.x : ex, y2: last ? last.z.y : ey, t: 0.06, me: isMe });
        }
        parts.emit(sx, sy, { count: 3, colors: ['#ffd66b', '#ffffff'], speed: 120, life: 0.12 });
        if (isMe) ctx.sfx('shoot', { volume: gid === 'shotgun' ? 0.9 : 0.6 });
        else if (Math.random() < 0.4) ctx.sfx('shoot', { volume: 0.2 });
      }
      function nearWindow(p, range) {
        let best = null, bd = range;
        for (const w of windows) { const o = OUTWARD[w.side]; const ix = w.x - o[0] * 28, iy = w.y - o[1] * 28; const dd = U.dist(ix, iy, p.x, p.y); if (dd < bd) { bd = dd; best = w; } }
        return best;
      }
      function nearBuy(range) {
        let best = null, bd = range;
        for (const b of BUYS) { const dd = U.dist(b.x, b.y, me.x, me.y); if (dd < bd) { bd = dd; best = b; } }
        return best;
      }
      function buy(b) {
        if (b.kind === 'gun') {
          const g = GUNS[b.id];
          const owned = me.guns.find((x) => x.id === b.id);
          const price = owned ? Math.round(g.price / 2) : g.price;
          if (me.points < price) { floats.add(me.x, me.y - 28, 'Need ' + price + ' points', '#ff8b98', 12); ctx.sfx('error'); return; }
          me.points -= price;
          if (owned) { owned.mag = g.mag; owned.reserve = g.reserve; floats.add(me.x, me.y - 28, 'Ammo refilled', '#8fd3ff', 13); }
          else {
            if (me.guns.length < 2) { me.guns.push(gunState(b.id)); me.slot = me.guns.length - 1; }
            else me.guns[me.slot] = gunState(b.id);
            floats.add(me.x, me.y - 28, g.name + '!', '#ffd66b', 14);
          }
          me.reloadT = 0;
          ctx.sfx('purchase');
        } else {
          const pk = PERKS[b.id];
          if (me.perks[b.id]) { floats.add(me.x, me.y - 28, 'Already active', '#cfd6e2', 12); return; }
          if (me.points < pk.price) { floats.add(me.x, me.y - 28, 'Need ' + pk.price + ' points', '#ff8b98', 12); ctx.sfx('error'); return; }
          me.points -= pk.price;
          me.perks[b.id] = true;
          if (b.id === 'jug') { me.maxHp += 100; me.hp = me.maxHp; }
          ctx.sfx('powerup');
          floats.add(me.x, me.y - 28, pk.name + '!', '#b67cff', 14);
        }
      }
      function finish(win) {
        if (phase === 'over') return;
        phase = 'over';
        const reached = win ? T.waves : Math.max(0, wave - 1);
        ctx.best('highestWave', reached, 'max');
        ctx.end({
          outcome: win ? 'win' : 'lose',
          title: win ? 'Rescued!' : 'The farmhouse fell',
          subtitle: win ? 'You held out through all ' + T.waves + ' waves.' : 'You survived ' + U.plural(reached, 'wave') + '.',
          coins: T.rewards.play + reached * T.rewards.perWave + (win ? T.rewards.win : 0),
          xp: T.rewards.xpPlay + (win ? T.rewards.xpWin : 0),
          stats: [['Waves survived', reached + ' / ' + T.waves], ['Zombies defeated', kills], ['Planks repaired', planksFixed], ['Points left', U.fmt(me.points)]],
          delay: win ? 1800 : 1000,
        });
      }

      // ------------------------------------------------------------ squad AI
      function updateMate(m, dt) {
        if (m.down) return;
        m.hurtT += dt;
        if (m.hurtT > T.regenDelay) m.hp = Math.min(m.maxHp, m.hp + T.regen * dt);
        m.fireCd -= dt;
        // revive the player first
        let tx = m.tx, ty = m.ty;
        if (me.down) { tx = me.x + 20; ty = me.y; if (U.dist(m.x, m.y, me.x, me.y) < 34) { me.reviveT += dt; if (me.reviveT >= T.reviveT) { me.down = 0; me.hp = me.maxHp * 0.5; me.hurtT = 0; ctx.feed(m.name + ' revived you!', 'star', '#8fd3ff'); ctx.sfx('powerup'); } } }
        else {
          const downMate = squad.find((o) => o !== m && o.down);
          if (downMate && U.dist(m.x, m.y, downMate.x, downMate.y) < 260) { tx = downMate.x + 20; ty = downMate.y; if (U.dist(m.x, m.y, downMate.x, downMate.y) < 34) { downMate.reviveT = (downMate.reviveT || 0) + dt; if (downMate.reviveT > T.reviveT) { downMate.down = 0; downMate.hp = 50; downMate.reviveT = 0; } } }
          else {
            m.thinkT -= dt;
            if (m.thinkT <= 0) {
              m.thinkT = 2 + Math.random() * 2;
              const weak = windows.slice().sort((a, b) => a.planks - b.planks)[0];
              if (weak.planks < T.planks && phase !== 'wave') m.guard = weak;
              else if (Math.random() < 0.3) m.guard = U.pick(windows);
              const o = OUTWARD[m.guard.side];
              m.tx = m.guard.x - o[0] * 60 + (Math.random() - 0.5) * 40; m.ty = m.guard.y - o[1] * 60 + (Math.random() - 0.5) * 40;
            }
          }
        }
        const dd = U.dist(tx, ty, m.x, m.y);
        if (dd > 8) { const a = U.angleTo(m.x, m.y, tx, ty); moveInside(m, Math.cos(a) * 140, Math.sin(a) * 140, dt); m.walk += dt * 10; if (!zombies.length) m.a = a; }
        // shoot
        let target = null, best = 380;
        for (const z of zombies) { const zd = U.dist(z.x, z.y, m.x, m.y); if (zd < best && !blockedShot(m.x, m.y, z.x, z.y)) { best = zd; target = z; } }
        const g = GUNS[m.gun];
        if (m.reloadT > 0) { m.reloadT -= dt; if (m.reloadT <= 0) m.mag = g.mag; }
        else if (target) {
          m.a = U.angleTo(m.x, m.y, target.x, target.y);
          if (m.fireCd <= 0 && m.mag > 0) { m.fireCd = g.rate * (1.6 - m.skill * 0.6); m.mag--; fire(m, m.gun, m.a + (Math.random() - 0.5) * (0.3 - m.skill * 0.25), false); if (m.mag <= 0) { m.reloadT = g.reload; if (Math.random() < 0.3) ctx.botSay(m.bot, 'any', 100); } }
        } else if (phase !== 'wave' || !zombies.some((z) => z.stage !== 'approach')) {
          const w = nearWindow(m, 70);
          if (w && w.planks < T.planks && !zombies.some((z) => z.win === w && z.stage === 'attack')) { m.repairT += dt; if (m.repairT > T.repairT * 1.4) { m.repairT = 0; w.planks++; w.hp = plankHp; } }
        }
      }

      // ------------------------------------------------------------- zombies
      function updateZombie(z, dt) {
        z.t += dt;
        if (z.flash > 0) z.flash -= dt;
        if (z.hitCd > 0) z.hitCd -= dt;
        const w = z.win, o = OUTWARD[w.side];
        if (z.stage === 'approach') {
          const a = U.angleTo(z.x, z.y, z.tx, z.ty);
          z.x += Math.cos(a) * z.speed * dt; z.y += Math.sin(a) * z.speed * dt; z.a = a;
          if (U.dist(z.x, z.y, z.tx, z.ty) < 6) z.stage = w.planks > 0 ? 'attack' : 'climb';
        } else if (z.stage === 'attack') {
          z.a = Math.atan2(-o[1], -o[0]);
          if (w.planks <= 0) { z.stage = 'climb'; z.climb = 0; return; }
          z.atkT += dt;
          if (z.atkT > (z.brute ? 0.45 : 1.05)) {
            z.atkT = 0;
            w.hp -= z.brute ? 60 : 22;
            parts.emit(w.x, w.y, { count: 4, color: '#8b5a2b', speed: 110, life: 0.4 });
            if (w.hp <= 0) { w.planks--; w.hp = plankHp; ctx.sfx('hit', { volume: 0.35 }); if (w.planks === 0 && Math.random() < 0.5) { const m = U.pick(squad.filter((x) => !x.down)); if (m) ctx.feed(m.name + ': window ' + w.id + ' is open!', 'info', '#ff8b98'); } }
          }
        } else if (z.stage === 'climb') {
          z.climb += dt;
          const k = Math.min(1, z.climb / 0.8);
          z.x = w.x + o[0] * 34 * (1 - k) - o[0] * 30 * k;
          z.y = w.y + o[1] * 34 * (1 - k) - o[1] * 30 * k;
          if (k >= 1) z.stage = 'inside';
        } else {
          let tgt = null, bd = Infinity;
          for (const p of people()) { if (p.down) continue; const dd = U.dist(p.x, p.y, z.x, z.y); if (dd < bd) { bd = dd; tgt = p; } }
          if (!tgt) return;
          const a = U.angleTo(z.x, z.y, tgt.x, tgt.y);
          z.a = a;
          moveInside(z, Math.cos(a) * z.speed, Math.sin(a) * z.speed, dt, z.r);
          if (bd < z.r + T.r + 4 && z.hitCd <= 0) { z.hitCd = T.contactCd; hurt(tgt, (z.brute ? 26 : T.contact) + Math.floor(wave / 2), z); }
        }
      }

      // ---------------------------------------------------------------- draw
      function drawZombie(g, z, t) {
        G.shadow(g, z.x, z.y + z.r * 0.4, z.r, z.r * 0.5, 0.3);
        g.save();
        g.translate(z.x, z.y);
        g.rotate(z.a || 0);
        const skin = z.flash > 0 ? '#ffffff' : z.brute ? '#6a8a4a' : '#8fbf6a';
        const sway = Math.sin(z.t * 6) * 3;
        g.fillStyle = skin;
        g.fillRect(z.r * 0.3, -z.r * 0.85 + sway, z.r * 1.1, z.r * 0.36);
        g.fillRect(z.r * 0.3, z.r * 0.5 - sway, z.r * 1.1, z.r * 0.36);
        G.fillRR(g, -z.r * 0.7, -z.r * 0.9, z.r * 1.2, z.r * 1.8, z.r * 0.3, z.brute ? '#4a3a5a' : '#5a6a7a');
        G.circle(g, 0, 0, z.r * 0.62, skin);
        G.circle(g, z.r * 0.3, -z.r * 0.22, z.r * 0.12, z.brute ? '#ff3d5a' : '#1b1b22');
        G.circle(g, z.r * 0.3, z.r * 0.22, z.r * 0.12, z.brute ? '#ff3d5a' : '#1b1b22');
        g.restore();
        if (z.hp < z.maxHp) G.bar(g, z.x - 16, z.y - z.r - 10, 32, 4, z.hp / z.maxHp, '#ff5a6a');
      }
      function drawPerson(g, p, color) {
        G.avatarTop(g, p.x, p.y, T.r, p.look, p.down ? 0 : p.a, { walk: p.walk, alpha: p.down ? 0.5 : 1 });
        const gid = p.isMe ? gun().id : p.gun;
        if (!p.down) { const a = p.a; G.line(g, p.x + Math.cos(a) * 8, p.y + Math.sin(a) * 8, p.x + Math.cos(a) * (gid === 'rifle' ? 28 : gid === 'shotgun' ? 24 : 20), p.y + Math.sin(a) * (gid === 'rifle' ? 28 : gid === 'shotgun' ? 24 : 20), '#2a2f3a', gid === 'pistol' ? 4 : 5); }
        G.nameTag(g, p.x, p.y - 16, p.name, color);
        if (!p.isMe) G.bar(g, p.x - 16, p.y + 16, 32, 4, p.hp / p.maxHp, '#3fd08a');
        if (p.down) { G.text(g, 'DOWN', p.x, p.y + 30, { size: 11, align: 'center', color: '#ff8b98', weight: 900, stroke: 'rgba(0,0,0,.6)', strokeW: 3 }); if (p.reviveT) G.bar(g, p.x - 18, p.y + 36, 36, 5, p.reviveT / T.reviveT, '#8fd3ff'); }
        const bb = ctx.bubbleText(p.isMe ? 'me' : p.bot.id);
        if (bb) G.bubble(g, p.x, p.y - 36, bb);
      }

      ctx.banner('Board up!', 'The first wave arrives in ' + T.prep + ' seconds', 1800);

      return {
        update(dt) {
          parts.update(dt);
          floats.update(dt);
          for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].t -= dt; if (tracers[i].t <= 0) tracers.splice(i, 1); }
          if (phase === 'over') return;
          if (phase === 'chopper') {
            chopper.t += dt;
            chopper.x = Math.min(480, chopper.x + 260 * dt);
            chopper.y = chopper.x >= 480 ? Math.min(280, chopper.y + 60 * dt) : 60;
            for (const z of zombies.slice()) { z.hp -= 200 * dt; if (z.hp <= 0) killZombie(z, false); }
            if (chopper.t > 4) finish(true);
            return;
          }
          const inp = ctx.input;
          // phases
          if (phase === 'prep' || phase === 'break') {
            timer -= dt;
            if (timer <= 0) startWave();
          } else if (phase === 'wave') {
            if (toSpawn > 0) {
              spawnT -= dt;
              if (spawnT <= 0) { spawnT = Math.max(0.35, 1.6 - wave * 0.1) * (0.6 + Math.random() * 0.8); toSpawn--; spawnZombie(false); }
            } else if (!zombies.length && !brutes.length) waveCleared();
            for (let i = brutes.length - 1; i >= 0; i--) { brutes[i] -= dt; if (brutes[i] <= 0) { brutes.splice(i, 1); spawnZombie(true); ctx.sfx('explosion', { volume: 0.4 }); } }
          }
          // player
          if (me.flash > 0) me.flash -= dt;
          if (!me.down) {
            me.hurtT += dt;
            if (me.hurtT > T.regenDelay) me.hp = Math.min(me.maxHp, me.hp + T.regen * dt);
            const ax = inp.axis();
            if (Math.hypot(ax.x, ax.y) > 0.1) { moveInside(me, ax.x * T.speed, ax.y * T.speed, dt); me.walk += dt * 12; }
            const p = inp.pointer;
            if (p.moved || p.down) me.useMouse = true;
            if (me.useMouse) me.a = Math.atan2(p.y - me.y, p.x - me.x);
            else {
              let near = null, bd = 340;
              for (const z of zombies) { const zd = U.dist(z.x, z.y, me.x, me.y); if (zd < bd && !blockedShot(me.x, me.y, z.x, z.y)) { bd = zd; near = z; } }
              if (near) me.a = U.angleTo(me.x, me.y, near.x, near.y);
              else if (Math.hypot(ax.x, ax.y) > 0.2) me.a = Math.atan2(ax.y, ax.x);
            }
            if (inp.actPressed('slot1') && me.guns[0]) { me.slot = 0; me.reloadT = 0; }
            if (inp.actPressed('slot2') && me.guns[1]) { me.slot = 1; me.reloadT = 0; }
            const gs = gun(), gd = GUNS[gs.id];
            me.fireCd -= dt;
            if (me.reloadT > 0) {
              me.reloadT -= dt;
              if (me.reloadT <= 0) { const need = gd.mag - gs.mag, take = Math.min(need, gs.reserve); gs.mag += take; gs.reserve -= take; }
            } else {
              const wantShoot = inp.act('shoot') || p.down;
              if (wantShoot && me.fireCd <= 0) {
                if (gs.mag > 0) { gs.mag--; me.fireCd = gd.rate; fire(me, gs.id, me.a, true); }
                else if (gs.reserve > 0) me.reloadT = gd.reload / (me.perks.quick ? 2 : 1);
                else if (inp.actPressed('shoot') || p.pressed) { floats.add(me.x, me.y - 28, 'Out of ammo! Buy ammo at a wall weapon', '#ff8b98', 12); ctx.sfx('error'); }
              }
              if (inp.actPressed('reload') && gs.mag < gd.mag && gs.reserve > 0) { me.reloadT = gd.reload / (me.perks.quick ? 2 : 1); ctx.sfx('click'); }
            }
            // use: revive > buy > repair
            if (inp.act('use')) {
              const downMate = squad.find((m) => m.down && U.dist(m.x, m.y, me.x, me.y) < 40);
              const b = nearBuy(46);
              const w = nearWindow(me, 64);
              if (downMate) { downMate.reviveT = (downMate.reviveT || 0) + dt; if (downMate.reviveT >= T.reviveT) { downMate.down = 0; downMate.hp = 60; downMate.reviveT = 0; ctx.feed('You revived ' + downMate.name + '!', 'star', '#8fd3ff'); ctx.sfx('powerup'); me.points += 100; } }
              else if (b && inp.actPressed('use')) buy(b);
              else if (w && !b && w.planks < T.planks) {
                me.repairT += dt;
                if (me.repairT >= T.repairT) {
                  me.repairT = 0; w.planks++; w.hp = plankHp; planksFixed++; me.points += T.points.plank;
                  floats.add(w.x, w.y, '+' + T.points.plank, '#ffd66b', 12); ctx.sfx('build', { volume: 0.5 });
                  if (planksFixed >= 50) ctx.badge('zo_carpenter');
                }
              }
            } else me.repairT = 0;
            if (inp.actPressed('medkit')) {
              if (me.hp >= me.maxHp) floats.add(me.x, me.y - 28, 'Health is full', '#cfd6e2', 12);
              else if (ctx.useConsumable('medkits')) { me.hp = Math.min(me.maxHp, me.hp + T.medkit); ctx.sfx('powerup'); floats.add(me.x, me.y - 28, '+' + T.medkit + ' HP', '#6be675', 14); }
              else floats.add(me.x, me.y - 28, 'No medkits (get them in the game store)', '#cfd6e2', 12);
            }
          } else if (!squad.some((m) => !m.down)) finish(false);
          squad.forEach((m) => updateMate(m, dt));
          for (const z of zombies.slice()) updateZombie(z, dt);
          // zombie separation
          for (let i = 0; i < zombies.length; i++) for (let j = i + 1; j < zombies.length; j++) {
            const a = zombies[i], b = zombies[j];
            if (a.stage !== b.stage) continue;
            const dd = U.dist(a.x, a.y, b.x, b.y), min = a.r + b.r - 6;
            if (dd < min && dd > 0) { const push = (min - dd) / 2, nx = (a.x - b.x) / dd, ny = (a.y - b.y) / dd; a.x += nx * push; a.y += ny * push; b.x -= nx * push; b.y -= ny * push; }
          }
        },

        draw(g) {
          const t = ctx.time;
          // outside
          g.fillStyle = '#1f3526'; g.fillRect(0, 0, W, H);
          for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect((i * 97) % W, (i * 53) % H, 30, 18); }
          g.fillStyle = '#4a3a2a';
          for (const w of windows) { const o = OUTWARD[w.side]; if (o[0]) g.fillRect(o[0] < 0 ? 0 : w.x, w.y - 18, o[0] < 0 ? w.x : W - w.x, 36); else g.fillRect(w.x - 18, o[1] < 0 ? 0 : w.y, 36, o[1] < 0 ? w.y : H - w.y); }
          for (const tr of TREES) { G.circle(g, tr.x + 4, tr.y + 6, 20 * tr.s, 'rgba(0,0,0,.3)'); G.circle(g, tr.x, tr.y, 20 * tr.s, '#1a4a2a'); G.circle(g, tr.x - 5, tr.y - 5, 10 * tr.s, '#2a6a3a'); }
          // floor
          g.fillStyle = '#6b4b2a'; g.fillRect(HX0, HY0, HX1 - HX0, HY1 - HY0);
          g.fillStyle = 'rgba(0,0,0,.15)';
          for (let y = HY0; y < HY1; y += 24) g.fillRect(HX0, y, HX1 - HX0, 2);
          for (const f of FURNITURE) {
            if (f.kind === 'table') { G.fillRR(g, f.x, f.y, f.w, f.h, 6, '#8b5a2b'); G.fillRR(g, f.x + 6, f.y + 6, f.w - 12, f.h - 12, 4, '#a86b3c'); }
            else if (f.kind === 'couch') { G.fillRR(g, f.x, f.y, f.w, f.h, 8, '#7a3b4a'); G.fillRR(g, f.x + 6, f.y + 8, f.w - 12, f.h - 12, 5, '#9a4b5a'); }
            else { G.fillRR(g, f.x, f.y, f.w, f.h, 4, '#4a3a2a'); for (let k = 0; k < 3; k++) g.fillStyle = '#2a2018', g.fillRect(f.x + 4, f.y + 8 + k * 22, f.w - 8, 3); }
          }
          for (const w of WALLS) G.fillRR(g, w.x, w.y, w.w, w.h, 3, '#3a2a1e');
          for (const w of windows) {
            const horiz = w.side === 'n' || w.side === 's';
            g.fillStyle = 'rgba(20,30,40,.8)';
            if (horiz) g.fillRect(w.x - WINW / 2, w.y - WT / 2, WINW, WT); else g.fillRect(w.x - WT / 2, w.y - WINW / 2, WT, WINW);
            for (let i = 0; i < w.planks; i++) {
              const off = -WINW / 2 + 6 + i * ((WINW - 12) / (T.planks - 1));
              if (horiz) G.fillRR(g, w.x + off - 4, w.y - WT / 2 - 3, 8, WT + 6, 2, i === w.planks - 1 && w.hp < plankHp ? '#a86b3c' : '#c8a46a');
              else G.fillRR(g, w.x - WT / 2 - 3, w.y + off - 4, WT + 6, 8, 2, i === w.planks - 1 && w.hp < plankHp ? '#a86b3c' : '#c8a46a');
            }
            const o = OUTWARD[w.side];
            G.text(g, String(w.id), w.x - o[0] * 30, w.y - o[1] * 30 + 4, { size: 10, align: 'center', color: 'rgba(255,255,255,.35)', weight: 800 });
          }
          for (const b of BUYS) {
            const label = b.kind === 'gun' ? GUNS[b.id].name : PERKS[b.id].name;
            const price = b.kind === 'gun' ? (me.guns.some((x) => x.id === b.id) ? 'Ammo ' + Math.round(GUNS[b.id].price / 2) : GUNS[b.id].price) : me.perks[b.id] ? 'Active' : PERKS[b.id].price;
            G.fillRR(g, b.x - 20, b.y - 10, 40, 20, 4, b.kind === 'perk' ? '#4b2a8a' : 'rgba(255,255,255,.12)');
            g.strokeStyle = b.kind === 'perk' ? '#b67cff' : 'rgba(255,255,255,.7)'; g.lineWidth = 1.5; g.strokeRect(b.x - 14, b.y - 3, 28, 6);
            if (U.dist(b.x, b.y, me.x, me.y) < 90) G.text(g, label + ' · ' + price, b.x, b.y + (b.y > 300 ? -16 : 26), { size: 11, align: 'center', color: '#fff', stroke: 'rgba(0,0,0,.7)', strokeW: 3 });
          }
          for (const z of zombies) drawZombie(g, z, t);
          for (const m of squad) drawPerson(g, m, '#8fd3ff');
          if (me.flash > 0) { g.globalAlpha = me.flash; G.circle(g, me.x, me.y, 22, '#ff3d5a'); g.globalAlpha = 1; }
          drawPerson(g, me, '#ffb454');
          for (const tr of tracers) { g.globalAlpha = tr.t / 0.06; G.line(g, tr.x1, tr.y1, tr.x2, tr.y2, tr.me ? '#ffe9a8' : '#cfd6e2', tr.me ? 2 : 1.5); g.globalAlpha = 1; }
          parts.draw(g);
          floats.draw(g);
          if (chopper) {
            G.shadow(g, chopper.x, chopper.y + 60, 50, 14, 0.3);
            G.fillRR(g, chopper.x - 40, chopper.y - 16, 80, 32, 14, '#3a4a3a'); G.fillRR(g, chopper.x + 30, chopper.y - 5, 50, 10, 4, '#3a4a3a');
            G.fillRR(g, chopper.x - 30, chopper.y - 10, 26, 20, 8, 'rgba(143,211,255,.7)');
            g.save(); g.translate(chopper.x, chopper.y); g.rotate(t * 25); G.line(g, -70, 0, 70, 0, 'rgba(20,20,20,.6)', 5); g.restore();
          }
          // vignette
          const vg = g.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 620);
          vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,10,.55)');
          g.fillStyle = vg; g.fillRect(0, 0, W, H);
          // prompts
          if (!me.down) {
            const b = nearBuy(46), w = nearWindow(me, 64);
            const downMate = squad.find((m) => m.down && U.dist(m.x, m.y, me.x, me.y) < 40);
            const msg = downMate ? 'Hold E to revive ' + downMate.name : b ? 'E  Buy ' + (b.kind === 'gun' ? GUNS[b.id].name : PERKS[b.id].name) : w && w.planks < T.planks ? 'Hold E to repair window ' + w.id : '';
            if (msg) G.text(g, msg, me.x, me.y + 34, { size: 12, align: 'center', color: '#0b0e13', weight: 900, stroke: '#ffd66b', strokeW: 8 });
          }
          // HUD
          const gs = gun(), gd = GUNS[gs.id];
          G.panel(g, 10, 10, 270, 62);
          G.text(g, phase === 'wave' ? 'Wave ' + wave : phase === 'chopper' ? 'Rescue!' : 'Next wave in ' + Math.ceil(timer) + 's', 22, 34, { size: 17, weight: 800, color: '#ff8b98' });
          G.text(g, U.fmt(me.points) + ' pts', 268, 34, { size: 16, align: 'right', weight: 800, color: '#ffd66b' });
          G.bar(g, 22, 46, 150, 8, me.hp / me.maxHp, me.hp / me.maxHp < 0.3 ? '#ff5a6a' : '#3fd08a');
          G.text(g, (phase === 'wave' ? zombies.length + toSpawn + ' zombies' : 'Kills ' + kills) + ' · medkits ' + (d.medkits || 0), 268, 64, { size: 11, align: 'right', color: '#cfd6e2' });
          G.panel(g, W - 210, H - 56, 200, 46);
          G.text(g, gd.name + (me.guns.length > 1 ? '  (1/2 to switch)' : ''), W - 198, H - 36, { size: 12, color: '#fff' });
          G.text(g, me.reloadT > 0 ? 'Reloading…' : gs.mag + ' / ' + gs.reserve, W - 198, H - 18, { size: 15, weight: 800, color: gs.mag === 0 ? '#ff8b98' : '#ffd66b' });
          if (me.perks.jug || me.perks.quick) G.text(g, [me.perks.jug ? 'Jug' : '', me.perks.quick ? 'Quick' : ''].filter(Boolean).join(' · '), W - 22, H - 18, { size: 11, align: 'right', color: '#b67cff' });
          if (me.down) { g.fillStyle = 'rgba(80,0,0,.35)'; g.fillRect(0, 0, W, H); G.display(g, 'DOWN', W / 2, H / 2, 48, '#ff8b98'); }
          if (me.useMouse && !me.down) { const p = ctx.input.pointer; G.ring(g, p.x, p.y, 9, '#ffffff', 1.5); G.line(g, p.x - 14, p.y, p.x - 6, p.y, '#fff', 1.5); G.line(g, p.x + 6, p.y, p.x + 14, p.y, '#fff', 1.5); }
        },

        onBotJoin(b) { addMate(b); },
        onBotLeave(b) { const i = squad.findIndex((m) => m.bot.id === b.id); if (i >= 0) squad.splice(i, 1); },
      };
    },
  });
})((window.BF = window.BF || {}));
