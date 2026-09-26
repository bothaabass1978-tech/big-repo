/**
 * Block Battlegrounds (gameType "arena") — top-down arena combat.
 * Three timed rounds; most eliminations wins a round, most rounds wins the match.
 * Passes: vip_arena (VIP map with lava vents + coin drops), double_xp (runtime),
 * extra_loadout (third weapon slot: Quake Hammer). Also the Arena template for Create.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;
  const P = BF.phys;

  const T = {
    roundTime: 60, rounds: 3, countdown: 3, respawn: 3, protect: 1.5,
    radius: 14, speed: 190, hp: 100,
    dash: { speed: 560, time: 0.16, cd: 1.6 },
    weapons: {
      blade: { name: 'Blade', icon: 'sword', kind: 'melee', dmg: 34, range: 54, arc: 1.9, cd: 0.45, knock: 260 },
      blaster: { name: 'Blaster', icon: 'crosshair', kind: 'ranged', dmg: 17, speed: 560, cd: 0.28, life: 0.9 },
      hammer: { name: 'Quake Hammer', icon: 'hammer', kind: 'aoe', dmg: 46, radius: 88, cd: 1.25, knock: 420 },
    },
    pickupEvery: 7,
    pickups: { health: { color: '#3fd08a', label: '+HP' }, speed: { color: '#46a8ff', label: 'SPEED' }, damage: { color: '#ff5a6a', label: 'POWER' }, shield: { color: '#b67cff', label: 'SHIELD' } },
    buffTime: 6,
    rewards: { kill: 3, roundWin: 15, matchWin: 45, play: 10, xpKill: 6, xpWin: 70, xpPlay: 30 },
    vip: { lavaDps: 32, coin: 5, coinEvery: 4.5 },
  };

  const CLASSIC = [
    { x: 150, y: 110, w: 90, h: 40 }, { x: 720, y: 110, w: 90, h: 40 }, { x: 150, y: 390, w: 90, h: 40 }, { x: 720, y: 390, w: 90, h: 40 },
    { x: 440, y: 230, w: 80, h: 80 }, { x: 320, y: 60, w: 30, h: 110 }, { x: 610, y: 370, w: 30, h: 110 }, { x: 40, y: 240, w: 60, h: 60 }, { x: 860, y: 240, w: 60, h: 60 },
  ];
  const VIP = [
    { x: 200, y: 150, w: 60, h: 60 }, { x: 700, y: 150, w: 60, h: 60 }, { x: 200, y: 330, w: 60, h: 60 }, { x: 700, y: 330, w: 60, h: 60 },
    { x: 380, y: 60, w: 200, h: 26 }, { x: 380, y: 454, w: 200, h: 26 },
  ];
  const VENTS = [[480, 130], [480, 410], [110, 270], [850, 270], [330, 270], [630, 270]];

  function genMap(seed) {
    const r = U.rng(seed);
    const rects = [];
    for (let i = 0; i < 5; i++) {
      const w = 40 + r() * 80, h = 30 + r() * 70;
      const x = 80 + r() * (400 - w), y = 60 + r() * (420 - h);
      rects.push({ x, y, w, h }, { x: 960 - x - w, y: 540 - y - h, w, h });
    }
    return rects.filter((b) => !(b.x < 520 && b.x + b.w > 440 && b.y < 310 && b.y + b.h > 230));
  }

  BF.arenaGenMap = genMap;

  BF.GameModules.register('arena', {
    three: true,
    orders: ['follow', 'come', 'stay', 'leave', 'ally', 'attack', 'help'],
    actions: { attack: ['Space', 'Mouse0', 'KeyJ'], dash: ['ShiftLeft', 'ShiftRight', 'KeyK'], swap: ['KeyQ', 'KeyL'] },
    controls: { joystick: true, buttons: [{ act: 'attack', label: 'Attack', icon: 'sword' }, { act: 'dash', label: 'Dash', icon: 'bolt' }, { act: 'swap', label: 'Swap', icon: 'refresh' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const custom = !!ctx.config.custom;
      const theme = ctx.config.themeColor || '#ff7a2e';
      const diff = { easy: 0.75, normal: 1, hard: 1.25 }[ctx.difficulty] || 1;
      const flame = ctx.hasItem('tool_flame_blade');
      const V = ctx.g3;
      const parts = V ? V.particles2d(18) : new BF.Particles(500);
      const floats = V ? V.floaters2d(70) : new BF.Floaters();
      const bounds = { x: 16, y: 16, w: W - 32, h: H - 32 };
      let phase = 'lobby';
      let map = 'classic';
      let rects = CLASSIC;
      let fighters = [];
      let shots = [];
      let pickups = [];
      let coins = [];
      let vents = [];
      let round = 0;
      let timer = 0;
      let countdown = 0;
      let pickupT = 0;
      let coinT = 0;
      let roundWins = new Map();
      let firstBloodDone = false;
      let lastBeep = 0;
      const slots = ['blade', 'blaster'].concat(ctx.hasPass('extra_loadout') ? ['hammer'] : []);
      const spawns = [[90, 110], [W - 260, 90], [90, H - 120], [W - 90, H - 130], [W / 2, 80], [W / 2 + 120, H - 60], [40, H / 2], [W - 40, H / 2 + 20]];

      function makeFighter(src, isPlayer) {
        const f = {
          id: isPlayer ? 'me' : src.id,
          name: isPlayer ? ctx.player.name : src.displayName,
          bot: isPlayer ? null : src,
          isPlayer,
          look: isPlayer ? ctx.player.look : src.look,
          level: isPlayer ? ctx.player.level : ctx.botLevel(src),
          x: 0, y: 0, vx: 0, vy: 0, angle: 0,
          hp: T.hp, alive: false, respawnT: 0, protect: 0,
          weapon: isPlayer ? 'blade' : U.pick(['blade', 'blaster', 'blaster']),
          cd: 0, dashCd: 0, dashT: 0, dashX: 0, dashY: 0, swing: 0, walk: 0,
          kills: 0, deaths: 0, roundKills: 0, streak: 0, bestStreak: 0,
          buffs: { speed: 0, damage: 0 }, shield: 0, flash: 0,
          ai: { t: 0, target: null, strafe: Math.random() < 0.5 ? 1 : -1, wander: null, react: 0 },
        };
        return f;
      }

      function spawn(f) {
        let best = spawns[0], bestD = -1;
        for (const sp of U.shuffle(spawns)) {
          const d = fighters.filter((o) => o.alive && o !== f).reduce((m, o) => Math.min(m, U.dist(o.x, o.y, sp[0], sp[1])), 9999);
          if (d > bestD) { bestD = d; best = sp; }
        }
        f.x = best[0]; f.y = best[1]; f.vx = f.vy = 0;
        f.hp = T.hp; f.alive = true; f.protect = T.protect; f.shield = 0;
        f.buffs.speed = f.buffs.damage = 0;
        f.streak = 0;
      }

      /** Cover blocks placed in the Studio (null when the creation uses its generated map). */
      function studioRects() {
        const lay = ctx.config.layout;
        return lay && lay.kind === 'arena' && BF.studio ? BF.studio.arenaRects(lay) : null;
      }
      function setupMatch() {
        rects = custom ? (studioRects() || genMap(ctx.config.seed || 7)) : map === 'vip' ? VIP : CLASSIC;
        vents = map === 'vip' ? VENTS.map((v, i) => ({ x: v[0], y: v[1], r: 30, t: i * 0.9, state: 'idle' })) : [];
        fighters = [makeFighter(null, true)].concat(ctx.bots.map((b) => makeFighter(b, false)));
        roundWins = new Map(fighters.map((f) => [f.id, 0]));
        round = 0;
        nextRound();
        ctx.bots.slice(0, 2).forEach((b) => ctx.botSay(b, 'start', 800 + Math.random() * 1200));
      }

      function nextRound() {
        round++;
        shots = []; pickups = []; coins = [];
        fighters.forEach((f) => { f.roundKills = 0; spawn(f); });
        timer = T.roundTime;
        countdown = T.countdown;
        pickupT = 2;
        phase = 'countdown';
        ctx.banner('ROUND ' + round, 'Most eliminations wins', 1600);
      }

      function endRound() {
        const top = Math.max(...fighters.map((f) => f.roundKills));
        const leaders = fighters.filter((f) => f.roundKills === top);
        if (top > 0 && leaders.length === 1) {
          const w = leaders[0];
          roundWins.set(w.id, (roundWins.get(w.id) || 0) + 1);
          ctx.feed(w.name + ' won round ' + round + '!', 'star', '#ffd66b');
          if (w.isPlayer) { ctx.reward(T.rewards.roundWin, 'round win'); ctx.sfx('win'); }
          else if (Math.random() < 0.7) ctx.botSay(w.bot, 'win');
        } else ctx.feed('Round ' + round + ' was a draw.', 'info');
        if (round >= T.rounds) finishMatch();
        else { phase = 'intermission'; timer = 3; }
      }

      function finishMatch() {
        phase = 'over';
        const me = fighters[0];
        const myWins = roundWins.get('me') || 0;
        const others = fighters.slice(1).map((f) => roundWins.get(f.id) || 0);
        const topOther = others.length ? Math.max(...others) : 0;
        const outcome = myWins > topOther ? 'win' : myWins === topOther && myWins > 0 ? 'draw' : 'lose';
        if (outcome === 'win') {
          ctx.badge('bb_victor');
          if (!ctx.hasItem('col_arena_trophy')) ctx.collectible('col_arena_trophy');
        }
        fighters.slice(1).forEach((f) => { if ((roundWins.get(f.id) || 0) === topOther && topOther > 0 && Math.random() < 0.6) ctx.botSay(f.bot, 'win'); else if (Math.random() < 0.3) ctx.botSay(f.bot, 'lose'); });
        ctx.end({
          outcome,
          title: outcome === 'win' ? 'Victory!' : outcome === 'draw' ? 'Draw' : 'Defeat',
          subtitle: 'Rounds won: ' + myWins + ' of ' + T.rounds + (map === 'vip' ? ' · VIP Arena' : ''),
          coins: T.rewards.play + (outcome === 'win' ? T.rewards.matchWin : 0),
          xp: T.rewards.xpPlay + me.kills * T.rewards.xpKill + (outcome === 'win' ? T.rewards.xpWin : 0),
          stats: [['Eliminations', me.kills], ['Deaths', me.deaths], ['Best streak', me.bestStreak], ['Rounds won', myWins]],
        });
      }

      // ------------------------------------------------------------ combat

      function damage(target, amount, from, kx, ky) {
        if (!target.alive || target.protect > 0 || phase !== 'play') return;
        if (from && friendly(from, target)) return;
        if (from && from.buffs.damage > 0) amount *= 1.4;
        if (target.shield > 0) {
          const absorbed = Math.min(target.shield, amount);
          target.shield -= absorbed;
          amount -= absorbed;
        }
        target.hp -= amount;
        target.flash = 0.12;
        target.vx += kx || 0;
        target.vy += ky || 0;
        floats.add(target.x, target.y - 24, String(Math.round(amount)), from && from.isPlayer ? '#ffd66b' : '#fff', 14);
        parts.emit(target.x, target.y, { count: 6, color: '#ff5a6a', speed: 120, life: 0.35, size: 4 });
        if (target.isPlayer) ctx.sfx('hurt');
        else ctx.sfx('hit', { vol: from && from.isPlayer ? 1 : 0.4 });
        if (target.hp <= 0) kill(target, from);
      }

      function kill(target, killer) {
        target.alive = false;
        target.hp = 0;
        target.deaths++;
        target.streak = 0;
        target.respawnT = T.respawn;
        parts.emit(target.x, target.y, { count: 24, colors: [target.look.shirt, target.look.skin, '#fff'], speed: 220, life: 0.7, size: 6 });
        ctx.sfx('explosion', { vol: 0.5 });
        if (killer && killer !== target) {
          killer.kills++;
          killer.roundKills++;
          killer.streak++;
          killer.bestStreak = Math.max(killer.bestStreak, killer.streak);
          ctx.feed(killer.name + ' eliminated ' + target.name, 'kill', killer.isPlayer ? '#ffd66b' : target.isPlayer ? '#ff9d9d' : '#e8ecf3');
          if (killer.isPlayer) {
            ctx.reward(T.rewards.kill, 'eliminations');
            ctx.addStat('kills', 1);
            ctx.playerStat('kills', 1);
            ctx.quest('kill', 1);
            if (!firstBloodDone) { firstBloodDone = true; ctx.badge('bb_first_blood'); }
            if (killer.streak === 3) ctx.banner('TRIPLE!', '3 in a row', 1200);
            if (killer.streak >= 5) ctx.badge('bb_streak');
          } else if (Math.random() < 0.25) ctx.botSay(killer.bot, 'kill');
        }
      }

      function attack(f) {
        if (f.cd > 0 || !f.alive) return;
        const w = T.weapons[f.weapon];
        f.cd = w.cd;
        f.swing = 0.18;
        if (w.kind === 'melee') {
          ctx.sfx('swing', { vol: f.isPlayer ? 1 : 0.35 });
          for (const o of fighters) {
            if (o === f || !o.alive) continue;
            const d = U.dist(f.x, f.y, o.x, o.y);
            if (d > w.range + T.radius) continue;
            const a = Math.abs(U.wrapAngle(U.angleTo(f.x, f.y, o.x, o.y) - f.angle));
            if (a > w.arc / 2) continue;
            const kx = Math.cos(f.angle) * w.knock, ky = Math.sin(f.angle) * w.knock;
            damage(o, w.dmg, f, kx, ky);
          }
          const col = f.isPlayer && flame ? ['#ff7a2e', '#ffd66b'] : ['#dfe7f2', '#ffffff'];
          for (let i = 0; i < 6; i++) {
            const a = f.angle - w.arc / 2 + (w.arc * i) / 5;
            parts.emit(f.x + Math.cos(a) * w.range * 0.8, f.y + Math.sin(a) * w.range * 0.8, { count: f.isPlayer && flame ? 3 : 1, colors: col, speed: 40, life: 0.25, size: 4 });
          }
        } else if (w.kind === 'ranged') {
          ctx.sfx('shoot', { vol: f.isPlayer ? 1 : 0.3 });
          shots.push({ x: f.x + Math.cos(f.angle) * 18, y: f.y + Math.sin(f.angle) * 18, vx: Math.cos(f.angle) * w.speed, vy: Math.sin(f.angle) * w.speed, life: w.life, owner: f, dmg: w.dmg });
        } else {
          ctx.sfx('explosion', { vol: f.isPlayer ? 0.8 : 0.3 });
          parts.emit(f.x, f.y, { count: 30, colors: ['#c8a46a', '#8b5a2b', '#fff4d6'], speed: 260, life: 0.5, size: 5 });
          for (const o of fighters) {
            if (o === f || !o.alive) continue;
            const d = U.dist(f.x, f.y, o.x, o.y);
            if (d > w.radius) continue;
            const a = U.angleTo(f.x, f.y, o.x, o.y);
            damage(o, w.dmg * (1 - (d / w.radius) * 0.4), f, Math.cos(a) * w.knock, Math.sin(a) * w.knock);
          }
          f.shake = 0.3;
        }
      }

      function dash(f, dx, dy) {
        if (f.dashCd > 0 || !f.alive) return;
        const l = Math.hypot(dx, dy);
        if (l < 0.1) { dx = Math.cos(f.angle); dy = Math.sin(f.angle); } else { dx /= l; dy /= l; }
        f.dashT = T.dash.time;
        f.dashCd = T.dash.cd;
        f.dashX = dx; f.dashY = dy;
        parts.emit(f.x, f.y, { count: 8, color: '#ffffff', speed: 60, life: 0.3, size: 5 });
        if (f.isPlayer) ctx.sfx('boost');
      }

      /** Allies of the player (from chat orders) never fight the player or each other. */
      const allied = (f) => { const o = f.bot && ctx.botOrder(f.bot.id); return !!o && ['ally', 'help', 'follow'].includes(o.verb); };
      const friendly = (a, b) => (a.isPlayer && allied(b)) || (b.isPlayer && allied(a)) || (allied(a) && allied(b));
      function nearestEnemy(f, maxD) {
        let best = null, bd = maxD || 9999;
        for (const o of fighters) {
          if (o === f || !o.alive || friendly(f, o)) continue;
          const d = U.dist(f.x, f.y, o.x, o.y);
          if (d < bd) { bd = d; best = o; }
        }
        return best;
      }

      // ---------------------------------------------------------------- AI

      function think(f, dt) {
        const ai = f.ai;
        const bot = f.bot;
        const skill = U.clamp(bot.skill * diff, 0.1, 1);
        ai.t -= dt;
        ai.react -= dt;
        if (ai.t <= 0) {
          ai.t = 0.4 + Math.random() * 0.5;
          let target = nearestEnemy(f, 520);
          if (bot.personality === 'competitive') {
            const leader = fighters.filter((o) => o !== f && o.alive).sort((a, b) => b.roundKills - a.roundKills)[0];
            if (leader && Math.random() < 0.5) target = leader;
          }
          ai.target = target;
          if (Math.random() < 0.15) ai.strafe *= -1;
          if (f.weapon !== 'hammer' && Math.random() < 0.05) f.weapon = U.pick(['blade', 'blaster']);
          ai.goal = null;
          const wantsPickup = f.hp < 40 || bot.personality === 'collector';
          if (wantsPickup && pickups.length) {
            const pk = pickups.slice().sort((a, b) => U.dist(f.x, f.y, a.x, a.y) - U.dist(f.x, f.y, b.x, b.y))[0];
            if (pk && (f.hp < 40 ? pk.type === 'health' || Math.random() < 0.5 : true)) ai.goal = pk;
          }
          if (!ai.target && !ai.goal) ai.wander = { x: 80 + Math.random() * (W - 160), y: 80 + Math.random() * (H - 160) };
          // orders from the player's chat
          const ord = ctx.botOrder(bot.id), me = fighters.find((o) => o.isPlayer);
          ai.hold = null;
          if (ord && me) {
            if (ord.verb === 'attack') { const tg = ord.target === 'me' ? me : fighters.find((o) => o.bot && o.bot.id === ord.target); if (tg && tg.alive) { ai.target = tg; ai.goal = null; } }
            else if (ord.verb === 'leave') { ai.target = ai.target === me ? null : ai.target; ai.goal = null; ai.wander = { x: me.x < W / 2 ? W - 90 : 90, y: me.y < H / 2 ? H - 90 : 90 }; }
            else if (ord.verb === 'stay') { ai.goal = null; ai.wander = null; ai.hold = { x: f.x, y: f.y }; }
            else if (['follow', 'come', 'help'].includes(ord.verb)) {
              // stay near the player and fight whoever is closest to them
              const near = U.dist(f.x, f.y, me.x, me.y);
              const guard = fighters.filter((o) => o !== f && o.alive && !o.isPlayer && !friendly(f, o) && U.dist(o.x, o.y, me.x, me.y) < 200).sort((a, b) => U.dist(a.x, a.y, me.x, me.y) - U.dist(b.x, b.y, me.x, me.y))[0];
              ai.target = guard || (near > 70 ? null : ai.target && !friendly(f, ai.target) ? ai.target : null);
              ai.goal = null;
              if (!ai.target || near > 170) ai.wander = { x: me.x + Math.cos(U.hash(bot.id) % 6) * 55, y: me.y + Math.sin(U.hash(bot.id) % 6) * 55 };
              if (ord.verb === 'come' && near < 70) ctx.clearOrder(bot.id);
            }
          }
        }
        let mx = 0, my = 0;
        const t = ai.target && ai.target.alive ? ai.target : null;
        if (ai.goal && pickups.includes(ai.goal)) {
          mx = ai.goal.x - f.x; my = ai.goal.y - f.y;
        } else if (t) {
          const d = U.dist(f.x, f.y, t.x, t.y);
          const w = T.weapons[f.weapon];
          const ideal = w.kind === 'ranged' ? 210 : w.kind === 'aoe' ? 50 : 36;
          const ax = (t.x - f.x) / (d || 1), ay = (t.y - f.y) / (d || 1);
          if (d > ideal + 20) { mx = ax; my = ay; } else if (d < ideal - 30) { mx = -ax; my = -ay; }
          mx += -ay * ai.strafe * (w.kind === 'ranged' ? 0.9 : 0.35);
          my += ax * ai.strafe * (w.kind === 'ranged' ? 0.9 : 0.35);
          const aimErr = (1 - skill) * 0.55 * (Math.random() - 0.5);
          const lead = w.kind === 'ranged' ? d / T.weapons.blaster.speed : 0;
          f.angle = U.angleTo(f.x, f.y, t.x + t.vx * lead * skill, t.y + t.vy * lead * skill) + aimErr;
          const inRange = w.kind === 'ranged' ? d < 330 && P.los(f.x, f.y, t.x, t.y, rects) : w.kind === 'aoe' ? d < w.radius * 0.8 : d < w.range + 8;
          if (inRange && ai.react <= 0 && Math.random() < 0.5 + skill * 0.5) { attack(f); ai.react = (1 - skill) * 0.5; }
          if (f.hp < 30 && bot.personality !== 'competitive' && Math.random() < 0.02) { mx = -ax; my = -ay; }
        } else if (ai.wander) {
          mx = ai.wander.x - f.x; my = ai.wander.y - f.y;
          if (Math.hypot(mx, my) < 20) ai.wander = null;
          f.angle = Math.atan2(my, mx);
        }
        if (ai.hold) { mx = 0; my = 0; }
        if (bot.personality === 'chaotic' && Math.random() < 0.01) dash(f, Math.random() - 0.5, Math.random() - 0.5);
        if (t && f.hp < 45 && Math.random() < 0.004 * skill * 10) dash(f, -(t.x - f.x), -(t.y - f.y));
        const l = Math.hypot(mx, my);
        if (l > 0.01) {
          const s = P.steer(f.x, f.y, mx / l, my / l, T.radius, rects);
          return { x: s.x * (0.7 + skill * 0.3), y: s.y * (0.7 + skill * 0.3) };
        }
        return { x: 0, y: 0 };
      }

      // ------------------------------------------------------------- update

      function move(f, ix, iy, dt) {
        if (f.dashT > 0) {
          f.dashT -= dt;
          f.x += f.dashX * T.dash.speed * dt;
          f.y += f.dashY * T.dash.speed * dt;
        } else {
          const sp = T.speed * (f.buffs.speed > 0 ? 1.35 : 1);
          f.x += (ix * sp + f.vx) * dt;
          f.y += (iy * sp + f.vy) * dt;
        }
        f.vx *= Math.pow(0.02, dt);
        f.vy *= Math.pow(0.02, dt);
        if (Math.abs(ix) + Math.abs(iy) > 0.1) f.walk += dt * 14;
        P.resolve(f, T.radius, rects);
        P.clampTo(f, T.radius, bounds);
      }

      function updatePlay(dt) {
        const me = fighters[0];
        const inp = ctx.input;
        // player
        if (me.alive) {
          const ax = inp.axis();
          if (inp.pointer.touch || ctx.mobile) {
            const t = nearestEnemy(me, 320);
            if (t) me.angle = U.angleTo(me.x, me.y, t.x, t.y);
            else if (Math.hypot(ax.x, ax.y) > 0.2) me.angle = Math.atan2(ax.y, ax.x);
          } else { const pw = ctx.pointerWorld(24); me.angle = U.angleTo(me.x, me.y, pw.x, pw.y); }
          if (inp.act('attack')) attack(me);
          if (inp.actPressed('dash')) dash(me, ax.x, ax.y);
          if (inp.actPressed('swap')) {
            const i = slots.indexOf(me.weapon);
            me.weapon = slots[(i + 1) % slots.length];
            floats.add(me.x, me.y - 30, T.weapons[me.weapon].name, '#8fd3ff', 13);
            ctx.sfx('tab');
          }
          move(me, ax.x, ax.y, dt);
        }
        // bots
        for (let i = 1; i < fighters.length; i++) {
          const f = fighters[i];
          if (!f.alive) continue;
          const m = think(f, dt);
          move(f, m.x, m.y, dt);
        }
        // timers
        const medic = ctx.hasPass('medic');
        for (const f of fighters) {
          if (medic && f.isPlayer && f.alive) f.hp = Math.min(T.hp, f.hp + 2.5 * dt);
          f.cd = Math.max(0, f.cd - dt);
          f.dashCd = Math.max(0, f.dashCd - dt);
          f.protect = Math.max(0, f.protect - dt);
          f.swing = Math.max(0, f.swing - dt);
          f.flash = Math.max(0, f.flash - dt);
          f.buffs.speed = Math.max(0, f.buffs.speed - dt);
          f.buffs.damage = Math.max(0, f.buffs.damage - dt);
          if (!f.alive) { f.respawnT -= dt; if (f.respawnT <= 0) spawn(f); }
        }
        // shots
        for (let i = shots.length - 1; i >= 0; i--) {
          const s = shots[i];
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.life -= dt;
          let dead = s.life <= 0 || !P.pointInRect(s.x, s.y, bounds) || rects.some((r) => P.pointInRect(s.x, s.y, r));
          if (!dead) {
            for (const o of fighters) {
              if (o === s.owner || !o.alive) continue;
              if (U.dist(s.x, s.y, o.x, o.y) < T.radius + 3) {
                damage(o, s.dmg, s.owner, s.vx * 0.25, s.vy * 0.25);
                dead = true;
                break;
              }
            }
          }
          if (dead) { parts.emit(s.x, s.y, { count: 4, color: '#8fd3ff', speed: 80, life: 0.2, size: 3 }); shots.splice(i, 1); }
        }
        // pickups
        pickupT -= dt;
        if (pickupT <= 0 && pickups.length < 4) {
          pickupT = T.pickupEvery;
          const types = Object.keys(T.pickups);
          for (let tries = 0; tries < 20; tries++) {
            const x = 60 + Math.random() * (W - 120), y = 60 + Math.random() * (H - 120);
            if (!rects.some((r) => P.circleRect(x, y, 20, r))) { pickups.push({ x, y, type: U.pick(types), t: 0 }); break; }
          }
        }
        for (let i = pickups.length - 1; i >= 0; i--) {
          const pk = pickups[i];
          pk.t += dt;
          const f = fighters.find((o) => o.alive && U.dist(o.x, o.y, pk.x, pk.y) < T.radius + 14);
          if (!f) continue;
          if (pk.type === 'health') f.hp = Math.min(T.hp, f.hp + (f.isPlayer && ctx.hasPass('medic') ? 100 : 40));
          if (pk.type === 'speed') f.buffs.speed = T.buffTime;
          if (pk.type === 'damage') f.buffs.damage = T.buffTime;
          if (pk.type === 'shield') f.shield = 40;
          floats.add(pk.x, pk.y - 10, T.pickups[pk.type].label, T.pickups[pk.type].color, 13);
          parts.emit(pk.x, pk.y, { count: 12, color: T.pickups[pk.type].color, speed: 120, life: 0.4 });
          if (f.isPlayer) ctx.sfx('powerup');
          pickups.splice(i, 1);
        }
        // VIP arena: vents + coins
        for (const v of vents) {
          v.t += dt;
          const cyc = v.t % 6;
          v.state = cyc < 3.5 ? 'idle' : cyc < 4.4 ? 'warn' : 'erupt';
          if (v.state === 'erupt') {
            if (Math.random() < 0.5) parts.emit(v.x, v.y, { count: 2, colors: ['#ff7a2e', '#ffd66b', '#ff3b3b'], speed: 90, life: 0.5, size: 5, gravity: -60 });
            for (const f of fighters) if (f.alive && U.dist(f.x, f.y, v.x, v.y) < v.r + T.radius * 0.5) damage(f, T.vip.lavaDps * dt, null, 0, 0);
          }
        }
        if (map === 'vip') {
          coinT -= dt;
          if (coinT <= 0 && coins.length < 3) {
            coinT = T.vip.coinEvery;
            coins.push({ x: 100 + Math.random() * (W - 200), y: 90 + Math.random() * (H - 180), t: 0 });
          }
          for (let i = coins.length - 1; i >= 0; i--) {
            const c = coins[i];
            c.t += dt;
            const f = fighters.find((o) => o.alive && U.dist(o.x, o.y, c.x, c.y) < T.radius + 12);
            if (!f && c.t < 12) continue;
            if (f && f.isPlayer) { ctx.reward(T.vip.coin, 'VIP coins'); floats.add(c.x, c.y, '+' + T.vip.coin + ' FC', '#ffd66b', 15); }
            coins.splice(i, 1);
          }
        }
        timer -= dt;
        if (timer <= 10 && Math.ceil(timer) !== lastBeep && timer > 0) { lastBeep = Math.ceil(timer); ctx.sfx('beep', { vol: 0.5 }); }
        if (timer <= 0) endRound();
      }

      // ---------------------------------------------------------------- lobby

      function lobby() {
        const passV = ctx.hasPass('vip_arena');
        const passL = ctx.hasPass('extra_loadout');
        ctx.ui.panel('lobby', '<h3>' + BF.icon('sword', 18) + ' ' + U.esc(ctx.game.name) + '</h3><p>' + T.rounds + ' rounds of ' + T.roundTime + ' seconds against ' + ctx.bots.length + ' players on this server. Most eliminations wins each round.</p>' +
          (custom ? '' : '<h4>Map</h4><div class="gp-grid"><button class="gp-card' + (map === 'classic' ? ' on' : '') + '" data-gact="map-classic"><b>Classic Arena</b><small>Symmetric cover, four corners.</small></button>' +
            '<button class="gp-card' + (map === 'vip' ? ' on' : '') + (passV ? '' : ' locked') + '" data-gact="map-vip"><b>' + BF.icon(passV ? 'crown' : 'lock', 13) + ' VIP Arena</b><small>' + (passV ? 'Lava vents erupt every few seconds. Golden coins drop for you to grab.' : 'Requires the VIP Arena game pass.') + '</small></button></div>') +
          '<h4>Loadout</h4><div class="gp-grid">' + ['blade', 'blaster', 'hammer'].map((k) => {
            const w = T.weapons[k];
            const locked = k === 'hammer' && !passL;
            return '<div class="gp-card' + (locked ? ' locked' : ' on') + '"><b>' + BF.icon(locked ? 'lock' : w.icon, 13) + ' Slot ' + (k === 'blade' ? 1 : k === 'blaster' ? 2 : 3) + ': ' + w.name + '</b><small>' + (k === 'blade' ? 'Wide melee swing' + (flame ? ' with Flame Blade skin' : '') + '.' : k === 'blaster' ? 'Fast ranged shots.' : locked ? 'Unlock with the Extra Loadout pass.' : 'Heavy area slam with knockback.') + '</small></div>';
          }).join('') + '</div>' +
          '<div class="gp-actions">' + (!passV && !custom ? '<button class="btn btn-outline" data-gact="buy-vip">' + BF.icon('ticket', 13) + 'Get VIP Arena</button>' : '') + (!passL ? '<button class="btn btn-outline" data-gact="buy-loadout">' + BF.icon('ticket', 13) + 'Get Extra Loadout</button>' : '') + '<button class="btn btn-play btn-lg" data-gact="start">' + BF.icon('play', 15) + 'Start match</button></div>', 'center');
      }

      ctx.ui.on((a) => {
        if (a === 'map-classic') { map = 'classic'; lobby(); }
        if (a === 'map-vip') {
          if (!ctx.hasPass('vip_arena')) { BF.actions.run('buy-pass', null, null, { pass: 'bb_vip_arena' }); return; }
          map = 'vip';
          lobby();
        }
        if (a === 'buy-vip') BF.actions.run('buy-pass', null, null, { pass: 'bb_vip_arena' });
        if (a === 'buy-loadout') BF.actions.run('buy-pass', null, null, { pass: 'bb_extra_loadout' });
        if (a === 'start') {
          if (ctx.hasPass('extra_loadout') && !slots.includes('hammer')) slots.push('hammer');
          ctx.ui.remove('lobby');
          setupMatch();
        }
      });
      const offPass = BF.bus.on('pass:purchased', () => { if (phase === 'lobby') lobby(); if (ctx.hasPass('extra_loadout') && !slots.includes('hammer')) slots.push('hammer'); });
      lobby();

      // --------------------------------------------------------------- draw

      function drawFloor(g) {
        const base = map === 'vip' ? '#1e1520' : custom ? U.shade(theme, -0.78) : '#161c26';
        g.fillStyle = base;
        g.fillRect(0, 0, W, H);
        g.strokeStyle = map === 'vip' ? 'rgba(255,201,64,.07)' : 'rgba(255,255,255,.045)';
        g.lineWidth = 1;
        for (let x = 0; x <= W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
        for (let y = 0; y <= H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
        g.strokeStyle = map === 'vip' ? '#ffc940' : custom ? theme : '#ff7a2e';
        g.globalAlpha = 0.5;
        g.lineWidth = 3;
        g.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
        g.globalAlpha = 0.12;
        G.ring(g, W / 2, H / 2, 110, g.strokeStyle, 3);
        g.globalAlpha = 1;
        if (map === 'vip') {
          G.fillRR(g, W / 2 - 60, H / 2 - 40, 120, 80, 12, 'rgba(255,201,64,.10)');
          G.text(g, 'THRONE', W / 2, H / 2 + 5, { size: 14, color: 'rgba(255,201,64,.35)', align: 'center', weight: 800 });
        }
        for (const v of vents) {
          const c = v.state === 'erupt' ? '#ff5a1f' : v.state === 'warn' ? '#ff9d3c' : '#4a2a1a';
          G.circle(g, v.x, v.y, v.r, c);
          if (v.state === 'warn') G.ring(g, v.x, v.y, v.r + 4 + Math.sin(ctx.time * 20) * 3, '#ffd66b', 2);
          G.circle(g, v.x, v.y, v.r * 0.55, v.state === 'erupt' ? '#ffd66b' : '#2a1810');
        }
        for (const r of rects) {
          G.fillRR(g, r.x, r.y + 4, r.w, r.h, 6, 'rgba(0,0,0,.35)');
          G.fillRR(g, r.x, r.y, r.w, r.h, 6, map === 'vip' ? '#4b3a2a' : custom ? U.shade(theme, -0.45) : '#2d3748');
          G.fillRR(g, r.x + 3, r.y + 3, r.w - 6, 6, 3, 'rgba(255,255,255,.08)');
        }
      }

      function drawFighter(g, f) {
        if (!f.alive) return;
        const blink = f.protect > 0 && Math.floor(ctx.time * 12) % 2 === 0;
        if (f.shield > 0) G.ring(g, f.x, f.y, T.radius + 7, 'rgba(182,124,255,.8)', 3);
        if (f.buffs.damage > 0) G.ring(g, f.x, f.y, T.radius + 4, 'rgba(255,90,106,.7)', 2);
        G.avatarTop(g, f.x, f.y, T.radius, f.look, f.angle, { walk: f.walk, alpha: blink ? 0.45 : 1, flash: f.flash > 0 });
        // weapon
        const w = T.weapons[f.weapon];
        g.save();
        g.translate(f.x, f.y);
        g.rotate(f.angle + (w.kind === 'melee' ? (f.swing > 0 ? (0.18 - f.swing) * 10 - 0.9 : -0.4) : 0));
        if (w.kind === 'melee') { g.fillStyle = f.isPlayer && flame ? '#ff7a2e' : '#dfe7f2'; g.fillRect(12, -2, 26, 4); g.fillStyle = '#ffc940'; g.fillRect(10, -5, 4, 10); }
        else if (w.kind === 'ranged') { g.fillStyle = '#39414f'; g.fillRect(8, -4, 18, 8); g.fillStyle = '#39f3ff'; g.fillRect(24, -2, 4, 4); }
        else { g.fillStyle = '#8b5a2b'; g.fillRect(8, -2, 20, 4); g.fillStyle = '#9aa5b5'; g.fillRect(24, -8, 10, 16); }
        g.restore();
        if (f.swing > 0 && w.kind === 'melee') {
          g.save();
          g.globalAlpha = f.swing * 4;
          g.strokeStyle = f.isPlayer && flame ? '#ff9d3c' : '#ffffff';
          g.lineWidth = 3;
          g.beginPath();
          g.arc(f.x, f.y, w.range, f.angle - w.arc / 2, f.angle + w.arc / 2);
          g.stroke();
          g.restore();
        }
        G.bar(g, f.x - 16, f.y - T.radius - 12, 32, 4, f.hp / T.hp, f.isPlayer ? '#3fd08a' : '#ff5a6a');
        G.nameTag(g, f.x, f.y - T.radius - 14, f.name, f.isPlayer ? '#ffb454' : '#fff');
        const b = ctx.bubbleText(f.id);
        if (b) G.bubble(g, f.x, f.y - T.radius - 32, b);
      }

      function drawHud(g) {
        const me = fighters[0];
        // timer and round
        G.panel(g, W / 2 - 70, 8, 140, 44);
        G.text(g, U.fmtClock(Math.max(0, timer)), W / 2, 32, { size: 20, align: 'center', color: timer < 10 ? '#ff8b98' : '#fff', weight: 800 });
        G.text(g, 'Round ' + round + '/' + T.rounds, W / 2, 46, { size: 11, align: 'center', color: '#a1abbb' });
        // scoreboard
        const board = fighters.slice().sort((a, b) => b.roundKills - a.roundKills || b.kills - a.kills).slice(0, 6);
        G.panel(g, W - 196, 8, 188, 22 + board.length * 18);
        G.text(g, 'This round', W - 186, 24, { size: 11, color: '#a1abbb' });
        G.text(g, 'K · R', W - 18, 24, { size: 11, color: '#a1abbb', align: 'right' });
        board.forEach((f, i) => {
          const y = 42 + i * 18;
          G.text(g, (f.isPlayer ? '▸ ' : '') + f.name.slice(0, 16), W - 186, y, { size: 12, color: f.isPlayer ? '#ffb454' : '#e8ecf3', weight: f.isPlayer ? 800 : 600 });
          G.text(g, f.roundKills + ' · ' + (roundWins.get(f.id) || 0), W - 18, y, { size: 12, align: 'right', color: '#fff' });
        });
        // player status
        G.panel(g, 10, H - 70, 290, 60);
        G.text(g, 'HP', 22, H - 46, { size: 11, color: '#a1abbb' });
        G.bar(g, 46, H - 56, 150, 12, me.hp / T.hp, '#3fd08a');
        if (me.shield > 0) G.bar(g, 46, H - 40, 150 * (me.shield / 40), 5, 1, '#b67cff');
        slots.forEach((k, i) => {
          const x = 208 + i * 30, on = me.weapon === k;
          G.fillRR(g, x, H - 62, 26, 26, 6, on ? 'rgba(255,122,46,.85)' : 'rgba(255,255,255,.08)');
          G.text(g, String(i + 1), x + 13, H - 44, { size: 12, align: 'center', color: '#fff', weight: 800 });
          if (on && me.cd > 0) G.fillRR(g, x, H - 62 + 26 * (1 - me.cd / T.weapons[k].cd), 26, 26 * (me.cd / T.weapons[k].cd), 6, 'rgba(0,0,0,.45)');
        });
        G.text(g, T.weapons[me.weapon].name + ' · Q swap · Shift dash', 22, H - 20, { size: 11, color: '#cfd6e2' });
        G.text(g, 'K ' + me.kills + '  D ' + me.deaths, 294, H - 20, { size: 12, align: 'right', color: '#ffd66b', weight: 800 });
        if (me.dashCd > 0) G.bar(g, 22, H - 14, 100, 3, 1 - me.dashCd / T.dash.cd, '#8fd3ff');
        if (!me.alive && phase === 'play') G.display(g, 'Respawning in ' + Math.ceil(me.respawnT), W / 2, H / 2, 28, '#fff');
        if (phase === 'countdown') G.display(g, String(Math.ceil(countdown)), W / 2, H / 2 + 60, 64, '#ffd66b');
      }

      // ----------------------------------------------------------------- 3D

      const TOOL = { blade: 'sword', blaster: 'blaster', hammer: 'hammer' };
      const view = V && (() => {
        const built = {};
        let mapGroup = null;
        let ventMeshes = [];
        const extras = V.pool(), shotPool = V.pool(), pickPool = V.pool(), coinPool = V.pool();
        const arcGeo = V.own(new THREE.RingGeometry(0.72, 1, 20, 1, 0, T.weapons.blade.arc));
        const PICK = { health: ['box', '#3fd08a'], speed: ['cone4', '#46a8ff'], damage: ['octa', '#ff5a6a'], shield: ['sphere', '#b67cff'] };

        function rebuild() {
          built.rects = rects; built.vents = vents; built.map = map;
          if (mapGroup) V.remove(mapGroup);
          mapGroup = V.group();
          const vip = map === 'vip';
          const accent = vip ? '#ffc940' : custom ? theme : '#ff7a2e';
          const floor = vip ? '#241a26' : custom ? U.shade(theme, -0.78) : '#1b2333';
          V.preset(vip ? 'dusk' : 'arena', { fogNear: 1500, fogFar: 4200 });
          V.shadowSize(640);
          V.ground(-1400, -1000, W + 1400, H + 1000, U.shade(floor, -0.45), { parent: mapGroup, y: -1 });
          V.gridFloor(0, 0, W, H, floor, 'rgba(255,255,255,0.07)', 40, { parent: mapGroup, noise: true });
          const walls = [[W / 2, 6, W + 24, 20], [W / 2, H - 6, W + 24, 20], [6, H / 2, 20, H], [W - 6, H / 2, 20, H]];
          V.boxes(walls.map(([x, z, w, d]) => ({ x, z, w, h: 26, d, color: '#2b3448' })), { parent: mapGroup });
          V.boxes(walls.map(([x, z, w, d]) => ({ x, y: 26, z, w, h: 4, d, color: accent })), { parent: mapGroup, glow: 0.9, shadow: false });
          const ring = V.shape('ring', W / 2, 1.2, H / 2, 230, 230, 1, accent, { parent: mapGroup, basic: true, opacity: 0.28, shadow: false });
          ring.rotation.x = -Math.PI / 2;
          const col = vip ? '#5a4632' : custom ? U.shade(theme, -0.45) : '#39465f';
          V.boxes(rects.map((r) => ({ x: r.x + r.w / 2, z: r.y + r.h / 2, w: r.w, h: 54, d: r.h, color: col })), { parent: mapGroup });
          V.boxes(rects.map((r) => ({ x: r.x + r.w / 2, y: 54, z: r.y + r.h / 2, w: r.w - 8, h: 4, d: r.h - 8, color: U.shade(col, 0.3) })), { parent: mapGroup });
          V.boxes(rects.map((r) => ({ x: r.x + r.w / 2, y: 18, z: r.y + r.h / 2, w: r.w + 1, h: 5, d: r.h + 1, color: accent })), { parent: mapGroup, glow: 0.5, shadow: false });
          ventMeshes = vents.map((v) => {
            V.shape('cyl', v.x, 1, v.y, v.r * 2 + 12, 3, v.r * 2 + 12, '#2a1810', { parent: mapGroup });
            return V.shape('cyl', v.x, 2.5, v.y, v.r * 2, 3, v.r * 2, '#4a2a1a', { parent: mapGroup, shadow: false });
          });
          if (vip) {
            const th = V.box(W / 2, 0, H / 2, 120, 6, 80, '#ffc940', { parent: mapGroup, metal: 0.6, rough: 0.35 });
            th.receiveShadow = true;
          }
        }

        return function sync(dt) {
          if (built.rects !== rects || built.vents !== vents || built.map !== map) rebuild();
          const me = fighters[0];
          const follow = me && me.alive && phase !== 'lobby';
          V.look(follow ? W / 2 + (me.x - W / 2) * 0.45 : W / 2, 0, (follow ? H / 2 + (me.y - H / 2) * 0.45 : H / 2) + 20, { dist: follow ? 640 : 760, pitch: 0.96, fov: 44, lerp: 0.05 }, dt);
          vents.forEach((v, i) => {
            const m = ventMeshes[i];
            if (m) m.material = V.mat(v.state === 'erupt' ? '#ff5a1f' : v.state === 'warn' ? '#ff9d3c' : '#4a2a1a', { glow: v.state === 'erupt' ? 1.4 : v.state === 'warn' ? 0.7 : 0 });
          });
          if (phase === 'lobby') {
            const rig = V.actor('me', ctx.player.avatar, { scale: 10.5 });
            rig.setPos(W / 2, 0, H / 2);
            rig.group.rotation.y = Math.sin(ctx.time * 0.6) * 0.5;
            rig.set({ move: 0 });
          }
          for (const f of fighters) {
            const rig = V.actor(f.id, f.isPlayer ? ctx.player.avatar : f.bot.avatar, { scale: 10.5 });
            const blink = f.protect > 0 && phase === 'play' && Math.floor(ctx.time * 10 + f.name.length) % 3 === 0;
            rig.group.visible = f.alive && !blink;
            if (!f.alive) { f._px = null; continue; }
            const v = f._px != null && dt > 0 ? Math.hypot(f.x - f._px, f.y - f._py) / dt : 0;
            f._px = f.x; f._py = f.y;
            rig.setPos(f.x, 0, f.y);
            rig.faceAngle(f.angle);
            rig.set({ move: f.dashT > 0 ? 1.3 : v / T.speed });
            if (rig._w !== f.weapon) { rig.hold(TOOL[f.weapon], f.weapon === 'blade' && f.isPlayer && flame ? '#ff7a2e' : undefined); rig._w = f.weapon; }
            if (f.swing > (f._sw || 0) + 0.05) rig.play('attack');
            f._sw = f.swing;
            if (f.flash > 0.1 && !f._fl) rig.play('hit');
            f._fl = f.flash > 0.1;
            const ex = extras.use(f.id, () => {
              const g = V.group();
              g.userData.shield = V.shape('sphere', 0, 30, 0, 64, 70, 64, '#b67cff', { parent: g, opacity: 0.22, glow: 0.8, shadow: false, depthWrite: false });
              g.userData.ring = V.shape('ring', 0, 1.6, 0, 48, 48, 1, '#ff5a6a', { parent: g, basic: true, opacity: 0.85, shadow: false });
              g.userData.ring.rotation.x = -Math.PI / 2;
              const arcMesh = new THREE.Mesh(arcGeo, V.mat('#ffffff', { basic: true, opacity: 0.6, side: 2, depthWrite: false }));
              arcMesh.rotation.x = -Math.PI / 2;
              arcMesh.position.y = 20;
              g.add(arcMesh);
              g.userData.arc = arcMesh;
              return g;
            });
            ex.position.set(f.x, 0, f.y);
            ex.userData.shield.visible = f.shield > 0;
            ex.userData.ring.visible = f.buffs.damage > 0;
            const w = T.weapons[f.weapon];
            const arc = ex.userData.arc;
            arc.visible = f.swing > 0 && w.kind === 'melee';
            if (arc.visible) {
              arc.scale.set(w.range + T.radius, w.range + T.radius, 1);
              arc.rotation.z = -(f.angle + w.arc / 2);
              arc.material = V.mat(f.isPlayer && flame ? '#ff9d3c' : '#ffffff', { basic: true, opacity: Math.round(Math.min(1, f.swing * 5) * 5) / 5 || 0.2, side: 2, depthWrite: false });
            }
            V.label(f.x, 82, f.y, { name: f.name, color: f.isPlayer ? '#ffb454' : '#ffffff', hp: f.hp / T.hp, hpColor: f.isPlayer ? '#3fd08a' : '#ff5a6a', bubble: ctx.bubbleText(f.id) });
          }
          extras.sweep();
          for (const sh of shots) {
            const m = shotPool.use(sh, () => V.shape('sphere', 0, 0, 0, 10, 10, 10, sh.owner.isPlayer ? '#ffd66b' : '#8fd3ff', { glow: 1.4, shadow: false }));
            m.position.set(sh.x, 24, sh.y);
          }
          shotPool.sweep();
          for (const pk of pickups) {
            const g = pickPool.use(pk, () => {
              const grp = V.group();
              const d = PICK[pk.type];
              grp.userData.icon = V.shape(d[0], 0, 0, 0, 18, 18, 18, d[1], { parent: grp, glow: 0.7 });
              const glowDisc = V.shape('disc', 0, 1.3, 0, 40, 40, 1, d[1], { parent: grp, basic: true, opacity: 0.35, shadow: false });
              glowDisc.rotation.x = -Math.PI / 2;
              return grp;
            });
            g.position.set(pk.x, 0, pk.y);
            g.userData.icon.position.y = 22 + Math.sin(pk.t * 4) * 4;
            g.userData.icon.rotation.y = pk.t * 2;
          }
          pickPool.sweep();
          for (const c of coins) {
            const m = coinPool.use(c, () => { const k = V.shape('cyl', 0, 0, 0, 20, 4, 20, '#ffc940', { glow: 0.5, metal: 0.6, rough: 0.3 }); return k; });
            m.position.set(c.x, 18 + Math.sin(c.t * 5) * 3, c.y);
            m.rotation.set(Math.PI / 2, 0, c.t * 3);
          }
          coinPool.sweep();
          V.sweep();
        };
      })();

      return {
        render3d(dt) { view(dt); },
        hud(g) {
          if (phase !== 'lobby') drawHud(g);
          else { g.fillStyle = 'rgba(6,8,12,.28)'; g.fillRect(0, 0, W, H); }
        },
        update(dt) {
          parts.update(dt);
          floats.update(dt);
          if (phase === 'lobby' || phase === 'over') return;
          if (phase === 'countdown') {
            const prev = Math.ceil(countdown);
            countdown -= dt;
            if (Math.ceil(countdown) !== prev && countdown > 0) ctx.sfx('beep');
            if (countdown <= 0) { phase = 'play'; ctx.sfx('go'); }
            return;
          }
          if (phase === 'intermission') {
            timer -= dt;
            if (timer <= 0) nextRound();
            return;
          }
          updatePlay(dt);
        },
        draw(g) {
          drawFloor(g);
          for (const pk of pickups) {
            const c = T.pickups[pk.type].color;
            const bob = Math.sin(pk.t * 4) * 3;
            G.circle(g, pk.x, pk.y + bob, 13, 'rgba(0,0,0,.3)');
            G.circle(g, pk.x, pk.y + bob - 2, 11, c);
            G.text(g, pk.type === 'health' ? '+' : pk.type === 'speed' ? '»' : pk.type === 'damage' ? '!' : '◈', pk.x, pk.y + bob + 3, { size: 13, align: 'center', color: '#0b0e13', weight: 900 });
          }
          for (const c of coins) {
            const bob = Math.sin(c.t * 5) * 3;
            G.circle(g, c.x, c.y + bob, 10, '#f2a318');
            G.circle(g, c.x, c.y + bob, 6, '#ffd66b');
          }
          for (const s of shots) { G.circle(g, s.x, s.y, 4, s.owner.isPlayer ? '#ffd66b' : '#8fd3ff'); }
          for (let i = fighters.length - 1; i >= 0; i--) drawFighter(g, fighters[i]);
          parts.draw(g);
          floats.draw(g);
          if (phase !== 'lobby') drawHud(g);
          else {
            g.fillStyle = 'rgba(6,8,12,.45)';
            g.fillRect(0, 0, W, H);
          }
        },
        onBotJoin(bot) {
          if (phase === 'lobby' || phase === 'over') return;
          const f = makeFighter(bot, false);
          fighters.push(f);
          roundWins.set(f.id, 0);
          spawn(f);
        },
        onBotLeave(bot) {
          fighters = fighters.filter((f) => f.id !== bot.id);
          shots = shots.filter((s) => s.owner.id !== bot.id);
        },
        destroy() {
          offPass();
        },
      };
    },
  });
})((window.BF = window.BF || {}));
