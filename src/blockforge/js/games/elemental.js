/**
 * Elemental Clash (gameType "elemental") — free-for-all ability brawler.
 * Pick Fire, Water, Earth, Air (or Void with the pass). Each element has three
 * abilities with cooldowns and energy costs. Fight on floating platforms:
 * knockback can push rivals off the edge. Points: damage dealt + 100 per
 * elimination. Win: most points when the 3-minute timer ends.
 * Passes: void (Void element), surge (+50% energy regeneration).
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;
  const P = BF.phys;
  const TAU = Math.PI * 2;

  const T = {
    round: 180, hp: 100, energy: 100, regen: 14, surge: 1.5, speed: 185, r: 13, respawn: 3, prot: 1.5, fall: 0.6,
    koPoints: 100, credit: 4,
    rewards: { play: 15, perKo: 5, win: 55, podium: 20, xpPlay: 30, xpWin: 120, xpKo: 10 },
  };

  const A = (id, name, cd, cost, desc) => ({ id, name, cd, cost, desc });
  const ELEMENTS = {
    fire: { name: 'Fire', color: '#ff7a2e', glow: '#ffd66b', range: 260, desc: 'Explosive damage from range.', abilities: [A('fireball', 'Fireball', 0.6, 14, 'Bolt that bursts on impact.'), A('flamedash', 'Flame Dash', 5, 25, 'Dash forward, leaving burning ground.'), A('meteor', 'Meteor', 10, 50, 'Call down a meteor where you aim.')] },
    water: { name: 'Water', color: '#46a8ff', glow: '#bfe6ff', range: 230, desc: 'Pushes rivals around and heals.', abilities: [A('bolt', 'Water Bolt', 0.45, 11, 'Fast bolt with a little push.'), A('wave', 'Tidal Wave', 6, 30, 'Wide wave with huge knockback.'), A('rain', 'Healing Rain', 12, 40, 'Heal 40 over three seconds.')] },
    earth: { name: 'Earth', color: '#b48a4a', glow: '#e8d3a8', range: 220, desc: 'Heavy hits and control.', abilities: [A('rock', 'Rock Throw', 0.9, 17, 'Slow, heavy rock.'), A('wall', 'Stone Wall', 7, 25, 'Wall that blocks projectiles.'), A('quake', 'Quake', 11, 45, 'Stun and damage everyone nearby.')] },
    air: { name: 'Air', color: '#8fe3d1', glow: '#e6fffa', range: 300, desc: 'Speed, mobility and pressure.', abilities: [A('slash', 'Wind Slash', 0.35, 10, 'Fast piercing blade of wind.'), A('gust', 'Gust Dash', 4, 20, 'Blink forward, briefly untouchable.'), A('cyclone', 'Cyclone', 11, 45, 'Tornado that drags and damages.')] },
    void: { name: 'Void', color: '#b67cff', glow: '#e3ccff', range: 250, pass: 'void', desc: 'Homing orbs, rifts and singularities.', abilities: [A('orb', 'Homing Orb', 0.8, 15, 'Slow orb that seeks rivals.'), A('rift', 'Rift', 6, 30, 'Teleport to where you aim.'), A('singularity', 'Singularity', 13, 55, 'Black hole that pulls, then collapses.')] },
  };
  const BASIC = ['fire', 'water', 'earth', 'air'];

  // floating arena: discs + bridges
  const DISCS = [{ x: 480, y: 290, r: 170 }, { x: 175, y: 150, r: 78 }, { x: 785, y: 150, r: 78 }, { x: 175, y: 440, r: 78 }, { x: 785, y: 440, r: 78 }];
  const BRIDGES = DISCS.slice(1).map((dd) => ({ x1: 480, y1: 290, x2: dd.x, y2: dd.y, w: 26 }));
  const onGround = (x, y) => DISCS.some((dd) => U.dist(x, y, dd.x, dd.y) < dd.r) || BRIDGES.some((b) => P.distToSeg(x, y, b.x1, b.y1, b.x2, b.y2) < b.w);
  const STARS = (() => { const r = U.rng('ec-stars'); return Array.from({ length: 90 }, () => ({ x: r() * 960, y: r() * 540, s: r() * 1.6 + 0.4, t: r() * 6 })); })();

  BF.GameModules.register('elemental', {
    orders: ['ally', 'attack', 'help', 'follow'],
    three: true,
    maxBots: 7,
    feedTop: 0.12,
    actions: { a1: ['KeyJ', 'Digit1'], a2: ['KeyK', 'Digit2'], a3: ['KeyL', 'Digit3'] },
    controls: { joystick: true, buttons: [{ act: 'a1', label: '1', icon: 'sparkle' }, { act: 'a2', label: '2', icon: 'bolt' }, { act: 'a3', label: '3', icon: 'star' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const V = ctx.g3;
      const parts = V ? V.particles2d(22) : new BF.Particles(700);
      const floats = V ? V.floaters2d(60) : new BF.Floaters();
      /** Pointer in arena coordinates (ground-picked in 3D). */
      const ptr = () => (V ? ctx.pointerWorld(20) : ctx.input.pointer);
      const d = ctx.data;
      d.elementWins = d.elementWins || {};
      let chosen = d.lastElement && (ELEMENTS[d.lastElement] && (!ELEMENTS[d.lastElement].pass || ctx.hasPass('void'))) ? d.lastElement : 'fire';
      let phase = 'lobby';
      let clock = T.round;
      const fighters = [];
      const shots = [], zones = [], walls = [], trails = [];
      let me = null;

      function makeFighter(o) {
        return Object.assign({ x: 480, y: 290, vx: 0, vy: 0, a: 0, hp: T.hp, en: T.energy, cds: [0, 0, 0], dead: 0, falling: 0, prot: T.prot, stun: 0, score: 0, kos: 0, falls: 0, walk: 0, dashT: 0, heal: 0, lastHit: null, lastHitT: 0, flash: 0, strafe: Math.random() < 0.5 ? 1 : -1, think: 0 }, o);
      }
      function spawnPoint() {
        for (let i = 0; i < 40; i++) {
          const dd = U.pick(DISCS);
          const a = Math.random() * TAU, r = Math.random() * dd.r * 0.6;
          const x = dd.x + Math.cos(a) * r, y = dd.y + Math.sin(a) * r;
          if (fighters.every((f) => f.dead || U.dist(f.x, f.y, x, y) > 90)) return { x, y };
        }
        return { x: 480, y: 290 };
      }
      function addBot(b) {
        if (fighters.some((f) => f.bot && f.bot.id === b.id)) return;
        const r = U.rng(b.id + ':ec');
        const f = makeFighter({ bot: b, name: b.displayName, look: b.look, el: U.pick(BASIC, r), skill: U.clamp((ctx.botLevel(b) || 10) / 55, 0.2, 0.95) });
        const p = spawnPoint(); f.x = p.x; f.y = p.y;
        fighters.push(f);
      }

      function lobby() {
        const cards = Object.entries(ELEMENTS).map(([k, e]) => {
          const locked = e.pass && !ctx.hasPass(e.pass);
          return '<button class="gp-card' + (chosen === k ? ' on' : '') + (locked ? ' locked' : '') + '" data-gact="el-' + k + '"' + (locked ? ' disabled' : '') + '><b style="color:' + e.color + '">' + (locked ? BF.icon('lock', 12) + ' ' : '') + e.name + '</b><small>' + e.desc + '</small><small>' + e.abilities.map((ab, i) => (i + 1) + '. ' + ab.name).join('<br>') + '</small>' + (d.elementWins[k] ? '<small style="color:#ffd66b">' + U.plural(d.elementWins[k], 'win') + '</small>' : '') + '</button>';
        }).join('');
        ctx.ui.panel('lobby', '<h3>' + BF.icon('sparkle', 18) + ' Choose your element</h3><p>Most points in 3 minutes wins. Damage scores points, eliminations score 100. Knock rivals off the platforms!</p><div class="gp-grid">' + cards + '</div>' +
          '<div class="gp-actions">' + (!ctx.hasPass('void') ? '<button class="btn btn-outline" data-gact="buy-void">' + BF.icon('ticket', 13) + 'Void Element</button>' : '') + (!ctx.hasPass('surge') ? '<button class="btn btn-outline" data-gact="buy-surge">' + BF.icon('ticket', 13) + 'Energy Surge</button>' : '') + '<button class="btn btn-play btn-lg" data-gact="start">' + BF.icon('play', 15) + 'Fight</button></div>', 'center wide');
      }
      lobby();
      const offPass = BF.bus.on('pass:purchased', () => { if (phase === 'lobby') lobby(); });

      function start() {
        ctx.ui.remove('lobby');
        d.lastElement = chosen;
        ctx.save();
        me = makeFighter({ isMe: true, name: ctx.player.name, look: ctx.player.look, el: chosen });
        const p = spawnPoint(); me.x = p.x; me.y = p.y;
        fighters.unshift(me);
        ctx.bots.forEach(addBot);
        phase = 'play';
        ctx.banner('FIGHT!', 'You are ' + ELEMENTS[chosen].name, 1400);
        ctx.sfx('go');
        hotbar();
      }
      function hotbar() {
        if (phase !== 'play') { ctx.ui.remove('bar'); return; }
        const e = ELEMENTS[me.el];
        ctx.ui.panel('bar', '<div class="gp-row">' + e.abilities.map((ab, i) => '<button class="btn btn-sm ec-ab" data-gact="cast-' + i + '" data-i="' + i + '" title="' + U.esc(ab.desc) + '"><b>' + (i + 1) + '</b> ' + ab.name + ' <span class="faint">' + ab.cost + '</span><i class="ec-cd"></i></button>').join('') + '</div>', 'dock');
      }
      function updateHotbar() {
        const el = ctx.ui.el.querySelector('[data-panel="bar"]');
        if (!el || !me) return;
        const e = ELEMENTS[me.el];
        el.querySelectorAll('.ec-ab').forEach((b) => {
          const i = +b.dataset.i, ab = e.abilities[i];
          const cdPct = me.cds[i] > 0 ? me.cds[i] / ab.cd : 0;
          b.querySelector('.ec-cd').style.width = Math.round(cdPct * 100) + '%';
          b.classList.toggle('dim', me.cds[i] > 0 || me.en < ab.cost || !!me.dead);
        });
      }

      ctx.ui.on((a) => {
        if (a.indexOf('el-') === 0 && phase === 'lobby') { chosen = a.slice(3); ctx.sfx('click'); lobby(); }
        if (a === 'buy-void') BF.actions.run('buy-pass', null, null, { pass: 'ec_void' });
        if (a === 'buy-surge') BF.actions.run('buy-pass', null, null, { pass: 'ec_surge' });
        if (a === 'start' && phase === 'lobby') start();
        if (a.indexOf('cast-') === 0 && me && phase === 'play') tryCast(me, +a.slice(5), aimOf(me));
      });

      // ------------------------------------------------------------ combat
      function damage(t, amount, src, kbx, kby, o) {
        if (!t || t.dead || t.falling || t.prot > 0 || (t.dashT > 0 && t.el === 'air')) return;
        if (friendly(src, t)) return;
        if (t.isMe && ctx.hasPass('stoneskin')) amount *= 0.8;
        amount = Math.round(amount);
        t.hp -= amount;
        t.flash = 0.12;
        t.vx += kbx || 0; t.vy += kby || 0;
        if (o && o.stun) t.stun = Math.max(t.stun, o.stun);
        if (src && src !== t) { src.score += amount; t.lastHit = src; t.lastHitT = T.credit; }
        floats.add(t.x, t.y - 22, '-' + amount, src && src.isMe ? '#ffd66b' : '#ffffff', src && src.isMe ? 15 : 12);
        if (t.isMe || (src && src.isMe)) ctx.sfx('hit', { volume: t.isMe ? 0.8 : 0.5 });
        if (t.hp <= 0) eliminate(t, src && src !== t ? src : t.lastHit);
      }
      function eliminate(t, by) {
        if (t.dead) return;
        t.dead = T.respawn; t.hp = 0; t.falling = 0;
        t.vx = 0; t.vy = 0;
        parts.emit(t.x, t.y, { count: 30, colors: [ELEMENTS[t.el].color, '#ffffff'], speed: 220, life: 0.7 });
        if (by && by !== t && !by.dead) {
          by.score += T.koPoints; by.kos++;
          ctx.feed(by.name + ' eliminated ' + t.name + '.', 'kill', by.isMe ? '#ffd66b' : '#e8ecf3');
          if (by.isMe) { ctx.addStat('kos', 1); ctx.playerStat('kills', 1); ctx.quest('kill', 1); ctx.xp(T.rewards.xpKo); ctx.sfx('powerup'); }
          if (by.bot && Math.random() < 0.25) ctx.botSay(by.bot, 'win', 500);
        } else ctx.feed(t.name + ' fell into the void.', 'info', '#cfd6e2');
        if (t.isMe) ctx.banner(by && by !== t ? 'Eliminated by ' + by.name : 'You fell!', 'Respawning in ' + T.respawn + 's', 1500);
      }
      function aimOf(f) {
        if (!f.isMe) return f.aim || 0;
        const p = ctx.input.pointer;
        if (p.moved || p.down) f.useMouse = true;
        const ax = ctx.input.axis();
        if (Math.hypot(ax.x, ax.y) > 0.2 && !p.down && !f.useMouse) f.a = Math.atan2(ax.y, ax.x);
        if (!f.useMouse) return f.a;
        const q = ptr();
        return Math.atan2(q.y - f.y, q.x - f.x);
      }
      function shoot(f, a, o) {
        shots.push(Object.assign({ x: f.x + Math.cos(a) * 16, y: f.y + Math.sin(a) * 16, vx: Math.cos(a) * o.speed, vy: Math.sin(a) * o.speed, owner: f, life: o.life || 1.4, hit: new Set() }, o));
      }
      function tryCast(f, i, aim) {
        if (f.dead || f.falling || f.stun > 0) return false;
        const ab = ELEMENTS[f.el].abilities[i];
        if (f.cds[i] > 0 || f.en < ab.cost) { if (f.isMe) ctx.sfx('error', { volume: 0.3 }); return false; }
        if (!f.isMe && (ab.id === 'gust' || ab.id === 'rift') && !onGround(f.x + Math.cos(aim) * (ab.id === 'gust' ? 170 : 200), f.y + Math.sin(aim) * (ab.id === 'gust' ? 170 : 200))) return false;
        if (!f.isMe && ab.id === 'flamedash' && !onGround(f.x + Math.cos(aim) * 150, f.y + Math.sin(aim) * 150)) return false;
        f.cds[i] = ab.cd;
        f.en -= ab.cost;
        f.a = aim;
        cast(f, ab.id, aim);
        return true;
      }
      function cast(f, id, a) {
        const cx = Math.cos(a), cy = Math.sin(a);
        const col = ELEMENTS[f.el].color;
        if (f.isMe || Math.random() < 0.3) ctx.sfx(id === 'fireball' || id === 'rock' ? 'shoot' : id === 'meteor' || id === 'quake' || id === 'singularity' ? 'boost' : 'laser', { volume: f.isMe ? 0.7 : 0.25 });
        switch (id) {
          case 'fireball': shoot(f, a, { kind: 'fire', speed: 440, dmg: 16, kb: 160, r: 8, burst: 46, color: col }); break;
          case 'flamedash': f.dashT = 0.2; f.dashA = a; f.vx += cx * 620; f.vy += cy * 620; trails.push({ x1: f.x, y1: f.y, x2: f.x + cx * 150, y2: f.y + cy * 150, t: 3, owner: f, tick: 0 }); break;
          case 'meteor': { const dist = Math.min(f.el === 'fire' && f.isMe ? ptrDist(f) : ELEMENTS.fire.range, 320); zones.push({ kind: 'meteor', x: f.x + cx * dist, y: f.y + cy * dist, r: 70, delay: 0.85, t: 0, dmg: 42, kb: 560, owner: f }); break; }
          case 'bolt': shoot(f, a, { kind: 'water', speed: 560, dmg: 11, kb: 190, r: 7, color: col }); break;
          case 'wave': zones.push({ kind: 'wave', x: f.x, y: f.y, a, r: 150, spread: 0.75, delay: 0, t: 0, dmg: 14, kb: 700, owner: f, once: true }); break;
          case 'rain': f.heal = 3; break;
          case 'rock': shoot(f, a, { kind: 'rock', speed: 330, dmg: 22, kb: 330, r: 11, color: col }); break;
          case 'wall': { const wx = f.x + cx * 70, wy = f.y + cy * 70, px = -cy, py = cx; walls.push({ x1: wx - px * 55, y1: wy - py * 55, x2: wx + px * 55, y2: wy + py * 55, t: 4 }); break; }
          case 'quake': zones.push({ kind: 'quake', x: f.x, y: f.y, r: 125, delay: 0.25, t: 0, dmg: 30, kb: 420, stun: 0.8, owner: f, self: true }); break;
          case 'slash': shoot(f, a, { kind: 'air', speed: 700, dmg: 10, kb: 110, r: 7, pierce: true, color: col, life: 0.6 }); break;
          case 'gust': { const nx = f.x + cx * 170, ny = f.y + cy * 170; parts.emit(f.x, f.y, { count: 14, color: col, speed: 120, life: 0.4 }); f.x = nx; f.y = ny; f.dashT = 0.35; f.vx = 0; f.vy = 0; break; }
          case 'cyclone': zones.push({ kind: 'cyclone', x: f.x + cx * 40, y: f.y + cy * 40, vx: cx * 150, vy: cy * 150, r: 60, delay: 0, t: 0, dur: 3, dmg: 9, owner: f }); break;
          case 'orb': shoot(f, a, { kind: 'orb', speed: 250, dmg: 15, kb: 150, r: 9, homing: true, color: col, life: 2.6 }); break;
          case 'rift': { const dist = f.isMe ? Math.min(ptrDist(f), 260) : 200; const nx = f.x + cx * dist, ny = f.y + cy * dist; parts.emit(f.x, f.y, { count: 20, color: col, speed: 150, life: 0.5 }); f.x = nx; f.y = ny; f.vx = 0; f.vy = 0; parts.emit(nx, ny, { count: 20, color: col, speed: 150, life: 0.5 }); break; }
          case 'singularity': { const dist = f.isMe ? Math.min(ptrDist(f), 300) : 220; zones.push({ kind: 'singularity', x: f.x + cx * dist, y: f.y + cy * dist, r: 150, delay: 0, t: 0, dur: 2.4, dmg: 45, kb: 300, owner: f }); break; }
          default: break;
        }
      }
      function ptrDist(f) {
        if (!f.useMouse) return 220;
        const q = ptr();
        return U.dist(q.x, q.y, f.x, f.y);
      }

      // --------------------------------------------------------------- bots
      /** Truce from chat ("team up", "don't attack me", "follow me"): allies never hurt the player or each other. */
      const allied = (f) => { const o = f.bot && ctx.botOrder(f.bot.id); return !!o && ['ally', 'help', 'follow'].includes(o.verb); };
      const friendly = (a, b) => !!a && !!b && ((a.isMe && allied(b)) || (b.isMe && allied(a)) || (allied(a) && allied(b)));
      function nearestFoe(f) {
        const ord = f.bot && ctx.botOrder(f.bot.id);
        if (ord && ord.verb === 'attack') { const want = ord.target === 'me' ? fighters.find((o) => o.isMe) : fighters.find((o) => o.bot && o.bot.id === ord.target); if (want && !want.dead && !want.falling) return want; }
        let best = null, bd = Infinity;
        for (const o of fighters) { if (o === f || o.dead || o.falling || friendly(f, o)) continue; const dd = U.dist(o.x, o.y, f.x, f.y); if (dd < bd) { bd = dd; best = o; } }
        return best;
      }
      function botThink(f, dt) {
        const tgt = nearestFoe(f);
        let mx = 0, my = 0;
        if (tgt) {
          const dist = U.dist(tgt.x, tgt.y, f.x, f.y);
          const a = U.angleTo(f.x, f.y, tgt.x, tgt.y);
          const range = ELEMENTS[f.el].range;
          const want = dist > range + 30 ? 1 : dist < range - 90 ? -1 : 0;
          f.think -= dt;
          if (f.think <= 0) { f.think = 0.8 + Math.random() * 1.6; if (Math.random() < 0.4) f.strafe *= -1; }
          mx = Math.cos(a) * want + Math.cos(a + Math.PI / 2) * f.strafe * 0.7;
          my = Math.sin(a) * want + Math.sin(a + Math.PI / 2) * f.strafe * 0.7;
          const err = (Math.random() - 0.5) * (0.5 - f.skill * 0.4);
          const lead = dist / 450;
          f.aim = Math.atan2(tgt.y + tgt.vy * lead * 0.3 - f.y, tgt.x + tgt.vx * lead * 0.3 - f.x) + err;
          f.a = a;
          const react = Math.random() < dt * (1.5 + f.skill * 3);
          if (react && dist < range + 40) tryCast(f, 0, f.aim);
          if (Math.random() < dt * 0.6) {
            const el = f.el;
            if (el === 'fire' && dist > 120 && dist < 260) tryCast(f, 1, a);
            if (el === 'water' && dist < 150) tryCast(f, 1, a);
            if (el === 'earth' && dist < 200) tryCast(f, 1, a);
            if (el === 'air' && (f.hp < 45 || dist < 90)) tryCast(f, 1, a + Math.PI * (f.hp < 45 ? 1 : 0.5));
          }
          if (Math.random() < dt * 0.35) {
            const el = f.el;
            if (el === 'fire' && dist < 300) tryCast(f, 2, f.aim);
            if (el === 'water' && f.hp < 55) tryCast(f, 2, a);
            if (el === 'earth' && dist < 115) tryCast(f, 2, a);
            if (el === 'air' && dist < 260) tryCast(f, 2, f.aim);
          }
        }
        // stay on the platforms
        const l = Math.hypot(mx, my) || 1;
        mx /= l; my /= l;
        const ahead = { x: f.x + mx * 40, y: f.y + my * 40 };
        if (!onGround(ahead.x, ahead.y)) { const c = U.angleTo(f.x, f.y, 480, 290); mx = Math.cos(c); my = Math.sin(c); }
        if (!onGround(f.x + f.vx * 0.25, f.y + f.vy * 0.25)) { const c = U.angleTo(f.x, f.y, 480, 290); mx = Math.cos(c) * 1.2; my = Math.sin(c) * 1.2; }
        return { x: mx, y: my };
      }

      function finish() {
        if (phase !== 'play') return;
        phase = 'over';
        ctx.ui.remove('bar');
        const ranked = fighters.slice().sort((a, b) => b.score - a.score);
        const place = ranked.indexOf(me) + 1;
        const win = place === 1;
        if (win) {
          d.elementWins[me.el] = (d.elementWins[me.el] || 0) + 1;
          ctx.save();
          ctx.badge('ec_first_win');
          if (Object.keys(d.elementWins).length >= 3) ctx.badge('ec_all');
        }
        ctx.best('bestScore', me.score, 'max');
        ctx.end({
          outcome: win ? 'win' : 'lose',
          title: win ? 'Elemental champion!' : U.ordinal(place) + ' place',
          subtitle: ELEMENTS[me.el].name + ' · ' + U.fmt(me.score) + ' points · winner ' + ranked[0].name,
          coins: T.rewards.play + me.kos * T.rewards.perKo + (win ? T.rewards.win : place <= 3 ? T.rewards.podium : 0),
          xp: T.rewards.xpPlay + (win ? T.rewards.xpWin : 0),
          stats: [['Place', U.ordinal(place) + ' of ' + fighters.length], ['Points', U.fmt(me.score)], ['Eliminations', me.kos], ['Falls', me.falls]],
        });
      }

      // ------------------------------------------------------------- update
      function stepFighter(f, dt) {
        if (f.dead) {
          f.dead -= dt;
          if (f.dead <= 0) { f.dead = 0; const p = spawnPoint(); f.x = p.x; f.y = p.y; f.hp = T.hp; f.en = T.energy; f.prot = T.prot; f.vx = 0; f.vy = 0; f.stun = 0; f.lastHit = null; }
          return;
        }
        if (f.falling) { f.falling -= dt; f.x += f.vx * dt * 0.3; f.y += f.vy * dt * 0.3; if (f.falling <= 0) { f.falls++; eliminate(f, f.lastHitT > 0 ? f.lastHit : null); } return; }
        if (f.prot > 0) f.prot -= dt;
        if (f.flash > 0) f.flash -= dt;
        if (f.stun > 0) f.stun -= dt;
        if (f.dashT > 0) f.dashT -= dt;
        if (f.lastHitT > 0) f.lastHitT -= dt;
        for (let i = 0; i < 3; i++) if (f.cds[i] > 0) f.cds[i] -= dt;
        f.en = Math.min(T.energy, f.en + T.regen * (f.isMe && ctx.hasPass('surge') ? T.surge : 1) * dt);
        if (f.heal > 0) { f.heal -= dt; f.hp = Math.min(T.hp, f.hp + (40 / 3) * dt); if (Math.random() < 0.3) parts.emit(f.x + (Math.random() - 0.5) * 30, f.y - 20, { count: 1, color: '#bfe6ff', speed: 40, life: 0.5, gravity: 200 }); }
        let mv = { x: 0, y: 0 };
        if (f.stun <= 0) {
          if (f.isMe) {
            mv = ctx.input.axis();
            const inp = ctx.input;
            const aim = aimOf(f);
            if (inp.actPressed('a1') || inp.pointer.pressed) tryCast(f, 0, aim);
            if (inp.actPressed('a2')) tryCast(f, 1, aim);
            if (inp.actPressed('a3')) tryCast(f, 2, aim);
            if (!f.useMouse && Math.hypot(mv.x, mv.y) > 0.2) f.a = Math.atan2(mv.y, mv.x);
            else if (f.useMouse) f.a = aim;
          } else mv = botThink(f, dt);
        }
        const sp = T.speed * (f.el === 'air' ? 1.12 : 1);
        f.x += (mv.x * sp + f.vx) * dt;
        f.y += (mv.y * sp + f.vy) * dt;
        f.vx *= Math.pow(0.02, dt); f.vy *= Math.pow(0.02, dt);
        if (Math.hypot(mv.x, mv.y) > 0.1) f.walk += dt * 12;
        if (!onGround(f.x, f.y) && f.dashT <= 0) { f.falling = T.fall; if (f.isMe) ctx.sfx('lose', { volume: 0.4 }); }
      }

      function hitTest(s, f) {
        return f !== s.owner && !f.dead && !f.falling && !s.hit.has(f) && U.dist(s.x, s.y, f.x, f.y) < s.r + T.r;
      }
      function segHit(s) {
        for (const w of walls) if (P.distToSeg(s.x, s.y, w.x1, w.y1, w.x2, w.y2) < s.r + 5) return true;
        return false;
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        V.preset('space', { fogNear: 1400, fogFar: 3400 });
        V.stars(500);
        V.shadowSize(560);
        // floating islands and bridges
        for (const dd of DISCS) {
          V.shape('cyl', dd.x, -7, dd.y, dd.r * 2, 14, dd.r * 2, '#747c98', { rough: 0.9 });
          V.shape('cyl', dd.x, 0.5, dd.y, dd.r * 2 - 16, 1, dd.r * 2 - 16, '#848cab', { rough: 0.9, shadow: false });
          const c = V.shape('cone', dd.x, -14 - dd.r * 0.55, dd.y, dd.r * 2, dd.r * 1.1, dd.r * 2, '#3a3354', { flat: true });
          c.rotation.x = Math.PI;
          const rg = V.shape('ring', dd.x, 1.2, dd.y, dd.r * 1.25, dd.r * 1.25, 1, '#b8c0da', { basic: true, opacity: 0.22, shadow: false });
          rg.rotation.x = -Math.PI / 2;
        }
        for (const b of BRIDGES) {
          const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1), a = Math.atan2(b.y2 - b.y1, b.x2 - b.x1);
          const m = V.box((b.x1 + b.x2) / 2, -10, (b.y1 + b.y2) / 2, len, 10, b.w * 2, '#6a6f86');
          m.rotation.y = -a;
          const rail = V.box((b.x1 + b.x2) / 2, 0, (b.y1 + b.y2) / 2, len, 1, b.w * 2 - 10, '#7f86a0', { shadow: false });
          rail.rotation.y = -a;
        }
        const core = V.shape('cyl', 480, 1, 290, 52, 2, 52, '#8a92ae', { shadow: false });
        const coreRing = V.shape('ring', 480, 2.5, 290, 70, 70, 1, '#b67cff', { basic: true, opacity: 0.7, side: 2, shadow: false });
        coreRing.rotation.x = -Math.PI / 2;
        core.receiveShadow = true;
        const r = U.rng('ec3d');
        const rocks = [];
        for (let i = 0; i < 40; i++) { const a = r() * TAU, dist = 560 + r() * 700, s = 10 + r() * 40; rocks.push({ x: 480 + Math.cos(a) * dist, y: -120 - r() * 300, z: 290 + Math.sin(a) * dist * 0.7, w: s, h: s, d: s, color: r() < 0.5 ? '#3a3354' : '#4a4468', rot: r() * 6 }); }
        const rockMesh = V.boxes(rocks, { geo: 'dodeca', flat: true, shadow: false });

        const auraPool = V.pool(), shotPool = V.pool(), zonePool = V.pool(), wallPool = V.pool();
        const waveGeo = V.own(new THREE.RingGeometry(0.05, 1, 20, 1, 0, 1.5));
        const reticle = V.shape('ring', 0, 2, 0, 22, 22, 1, '#ffffff', { basic: true, side: 2, shadow: false });
        reticle.rotation.x = -Math.PI / 2;

        function shotModel(s) {
          if (s.kind === 'rock') return V.shape('dodeca', 0, 0, 0, s.r * 2.2, s.r * 2.2, s.r * 2.2, '#7a5a34', { flat: true });
          if (s.kind === 'air') { const m = V.shape('torus', 0, 0, 0, 30, 30, 10, s.color, { glow: 0.8, opacity: 0.8, shadow: false }); m.rotation.x = Math.PI / 2; const g = V.group(); g.add(m); return g; }
          const g = V.group();
          V.shape('sphere', 0, 0, 0, s.r * 2, s.r * 2, s.r * 2, '#ffffff', { parent: g, basic: true, shadow: false });
          V.shape('sphere', 0, 0, 0, s.r * 3.6, s.r * 3.6, s.r * 3.6, s.color, { parent: g, basic: true, opacity: 0.45, depthWrite: false, shadow: false });
          return g;
        }
        function zoneModel(z) {
          const g = V.group();
          if (z.kind === 'meteor') {
            const ring = V.shape('ring', 0, 1.5, 0, z.r * 2, z.r * 2, 1, '#ff7a2e', { parent: g, basic: true, side: 2, shadow: false }); ring.rotation.x = -Math.PI / 2;
            const fill = V.shape('disc', 0, 1, 0, 1, 1, 1, '#ff3d5a', { parent: g, basic: true, opacity: 0.3, depthWrite: false, shadow: false }); fill.rotation.x = -Math.PI / 2;
            g.userData.fill = fill;
            g.userData.rock = V.shape('dodeca', 0, 0, 0, 36, 36, 36, '#ff7a2e', { parent: g, glow: 1, flat: true });
          } else if (z.kind === 'quake') {
            const ring = V.shape('cyl', 0, 4, 0, z.r * 2, 8, z.r * 2, '#b48a4a', { parent: g, opacity: 0.5, shadow: false, depthWrite: false });
            g.userData.fill = ring;
          } else if (z.kind === 'wave') {
            const m = new THREE.Mesh(waveGeo, V.mat('#46a8ff', { basic: true, opacity: 0.55, side: 2, depthWrite: false }));
            m.rotation.x = -Math.PI / 2; m.position.y = 10;
            g.add(m); g.userData.fill = m;
          } else if (z.kind === 'cyclone') {
            g.userData.rings = [0, 1, 2, 3].map((k) => { const m = V.shape('torus', 0, 10 + k * 14, 0, (z.r - k * 10) * 2, (z.r - k * 10) * 2, 18, '#e6fffa', { parent: g, basic: true, opacity: 0.4, shadow: false }); m.rotation.x = Math.PI / 2; return m; });
          } else if (z.kind === 'singularity') {
            const pull = V.shape('disc', 0, 1, 0, z.r * 2, z.r * 2, 1, '#3a1f6a', { parent: g, basic: true, opacity: 0.3, depthWrite: false, shadow: false }); pull.rotation.x = -Math.PI / 2;
            g.userData.core = V.shape('sphere', 0, 26, 0, 40, 40, 40, '#0b0714', { parent: g, basic: true });
            g.userData.rings = [V.shape('torus', 0, 26, 0, 64, 64, 30, '#b67cff', { parent: g, glow: 1.2, shadow: false })];
          }
          return g;
        }

        return function sync(dt) {
          const t = ctx.time;
          const live = me && !me.dead && phase === 'play';
          if (live) V.look(480 + (me.x - 480) * 0.45, 0, 290 + (me.y - 290) * 0.4 + 20, { dist: 660, pitch: 0.98, fov: 45, lerp: 0.06 }, dt);
          else V.look(480, 0, 310, { dist: 820, pitch: 0.9, yaw: phase === 'lobby' ? Math.sin(t * 0.2) * 0.4 : 0, fov: 45, lerp: 0.05 }, dt);
          coreRing.rotation.z = t * 0.6;
          coreRing.scale.setScalar(70 + Math.sin(t * 2) * 6);
          if (rockMesh) rockMesh.rotation.y = t * 0.01;
          if (phase === 'lobby') {
            const rig = V.actor('me', ctx.player.avatar, { scale: 10 });
            rig.setPos(480, 0, 290);
            rig.group.rotation.y = Math.sin(t * 0.7) * 0.5;
            rig.set({ move: 0 });
          }
          for (const f of fighters) {
            const id = f.isMe ? 'me' : f.bot.id;
            const el = ELEMENTS[f.el];
            if (f.dead) { V.actor(id, f.isMe ? ctx.player.avatar : f.bot.avatar, { scale: 8.5 }).group.visible = false; continue; }
            const rig = V.actor(id, f.isMe ? ctx.player.avatar : f.bot.avatar, { scale: 8.5 });
            rig.group.visible = true;
            const fall = f.falling ? 1 - f.falling / T.fall : 0;
            rig.setPos(f.x, -fall * fall * 260, f.y);
            rig.group.scale.setScalar(8.5 * (1 - fall * 0.5));
            rig.faceAngle(f.a);
            const mv = f._px != null && dt > 0 ? Math.hypot(f.x - f._px, f.y - f._py) / dt : 0;
            f._px = f.x; f._py = f.y;
            rig.set({ move: Math.min(1.4, mv / T.speed), air: !!f.falling, mode: f.stun > 0 ? 'ko' : 'idle' });
            if (f.cds.some((c, i) => c > ELEMENTS[f.el].abilities[i].cd - 0.05)) rig.play('attack');
            if (f.flash > 0.1 && !f._fl) rig.play('hit');
            f._fl = f.flash > 0.1;
            const au = auraPool.use(id, () => {
              const g = V.group();
              g.userData.ring = V.shape('ring', 0, 1.6, 0, 40, 40, 1, el.color, { parent: g, basic: true, opacity: 0.8, side: 2, shadow: false });
              g.userData.ring.rotation.x = -Math.PI / 2;
              g.userData.prot = V.shape('sphere', 0, 26, 0, 58, 64, 58, '#ffffff', { parent: g, basic: true, opacity: 0.18, depthWrite: false, shadow: false });
              g.userData.stars = [0, 1, 2].map(() => V.box(0, 0, 0, 5, 5, 5, '#ffd66b', { parent: g, glow: 1, shadow: false }));
              g.userData.heal = V.shape('cylLo', 0, 40, 0, 50, 80, 50, '#bfe6ff', { parent: g, basic: true, opacity: 0.15, depthWrite: false, shadow: false });
              return g;
            });
            au.position.set(f.x, -fall * fall * 260, f.y);
            au.userData.ring.material = V.mat(el.color, { basic: true, opacity: 0.8, side: 2 });
            au.userData.ring.rotation.z = t * 2;
            au.userData.prot.visible = f.prot > 0 && !f.falling;
            au.userData.heal.visible = f.heal > 0;
            au.userData.stars.forEach((s, k) => { s.visible = f.stun > 0; s.position.set(Math.cos(t * 6 + k * 2) * 12, 52, Math.sin(t * 6 + k * 2) * 12); });
            rig.group.visible = !(f.dashT > 0 && f.el === 'air' && Math.sin(t * 50) > 0);
            if (!f.falling) V.label(f.x, 58, f.y, { name: f.name, color: f.isMe ? '#ffb454' : '#ffffff', hp: f.hp / T.hp, hpColor: f.isMe ? '#3fd08a' : '#ff5a6a', bubble: ctx.bubbleText(id) });
          }
          auraPool.sweep();
          for (const s of shots) {
            const m = shotPool.use(s, () => shotModel(s));
            m.position.set(s.x, 24, s.y);
            m.rotation.y = -Math.atan2(s.vy, s.vx);
            if (s.kind === 'rock') m.rotation.x += dt * 8;
          }
          shotPool.sweep();
          for (const z of zones) {
            const m = zonePool.use(z, () => zoneModel(z));
            m.position.set(z.x, 0, z.y);
            if (z.kind === 'meteor') {
              const k = Math.min(1, z.t / z.delay);
              m.userData.fill.scale.set(z.r * 2 * k, z.r * 2 * k, 1);
              m.userData.rock.visible = !z.done;
              m.userData.rock.position.set(-(1 - k) * 120, (1 - k) * 420 + 10, -(1 - k) * 80);
            } else if (z.kind === 'quake') {
              const k = Math.min(1, z.t * 3);
              m.userData.fill.scale.set(z.r * 2 * k, 8, z.r * 2 * k);
              m.userData.fill.material = V.mat('#b48a4a', { opacity: Math.max(0.05, 0.5 - z.t), depthWrite: false });
            } else if (z.kind === 'wave') {
              const k = Math.min(1, z.t * 5);
              m.userData.fill.scale.set(z.r * k, z.r * k, 1);
              m.userData.fill.rotation.z = -(z.a + z.spread);
            } else if (z.kind === 'cyclone') m.userData.rings.forEach((rg, k) => { rg.rotation.z = t * (6 + k); rg.position.x = Math.sin(t * 20 + k) * 4; });
            else if (z.kind === 'singularity') { m.userData.rings[0].rotation.x = t * 3; m.userData.rings[0].rotation.y = t * 2; m.userData.core.scale.setScalar(40 + Math.sin(t * 12) * 6); }
          }
          for (const tr of trails) {
            const m = zonePool.use(tr, () => { const len = Math.hypot(tr.x2 - tr.x1, tr.y2 - tr.y1); const b = V.box(0, 0, 0, len, 6, 22, '#ff7a2e', { glow: 1.2, opacity: 0.8, shadow: false }); b.position.set((tr.x1 + tr.x2) / 2, 0, (tr.y1 + tr.y2) / 2); b.rotation.y = -Math.atan2(tr.y2 - tr.y1, tr.x2 - tr.x1); return b; });
            m.scale.y = 4 + Math.sin(t * 20) * 2 + Math.min(1, tr.t) * 4;
          }
          zonePool.sweep();
          for (const w of walls) {
            // a row of uneven stone blocks that rises out of the floor
            const g = wallPool.use(w, () => {
              const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1), grp = V.group();
              grp.position.set((w.x1 + w.x2) / 2, 0, (w.y1 + w.y2) / 2);
              grp.rotation.y = -Math.atan2(w.y2 - w.y1, w.x2 - w.x1);
              const n = 5, seg = len / n;
              for (let i = 0; i < n; i++) {
                const h = 36 + ((i * 7) % 3) * 7;
                V.box(-len / 2 + seg * (i + 0.5), 0, 0, seg - 2, h, 18, U.shade('#8a7a62', (i % 2 ? -0.08 : 0.04)), { parent: grp, flat: true });
                V.box(-len / 2 + seg * (i + 0.5), h, 0, seg - 6, 4, 14, '#6f6250', { parent: grp, flat: true });
              }
              grp.userData.born = t;
              return grp;
            });
            g.position.y = -46 * Math.max(0, 1 - (t - g.userData.born) / 0.25);
          }
          wallPool.sweep();
          reticle.visible = !!(me && me.useMouse && !me.dead && phase === 'play');
          if (reticle.visible) { const q = ptr(); reticle.position.set(q.x, 2, q.y); reticle.material = V.mat(ELEMENTS[me.el].color, { basic: true, side: 2 }); }
          V.sweep();
        };
      })();

      return {
        update(dt) {
          parts.update(dt);
          floats.update(dt);
          if (phase !== 'play') return;
          clock -= dt;
          if (clock <= 0) { finish(); return; }
          if (clock < 11 && Math.floor(clock) !== Math.floor(clock + dt)) ctx.sfx('beep', { volume: 0.4 });
          for (const f of fighters) stepFighter(f, dt);
          // separation
          for (let i = 0; i < fighters.length; i++) for (let j = i + 1; j < fighters.length; j++) {
            const a = fighters[i], b = fighters[j];
            if (a.dead || b.dead || a.falling || b.falling) continue;
            const dd = U.dist(a.x, a.y, b.x, b.y);
            if (dd < T.r * 2 && dd > 0) { const push = (T.r * 2 - dd) / 2, nx = (a.x - b.x) / dd, ny = (a.y - b.y) / dd; a.x += nx * push; a.y += ny * push; b.x -= nx * push; b.y -= ny * push; }
          }
          // projectiles
          for (let i = shots.length - 1; i >= 0; i--) {
            const s = shots[i];
            s.life -= dt;
            if (s.homing) {
              const tgt = nearestFoe(s.owner);
              if (tgt && U.dist(tgt.x, tgt.y, s.x, s.y) < 320) { const want = U.angleTo(s.x, s.y, tgt.x, tgt.y), cur = Math.atan2(s.vy, s.vx); const na = cur + U.clamp(U.wrapAngle(want - cur), -3 * dt, 3 * dt); const sp = Math.hypot(s.vx, s.vy); s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp; }
            }
            s.x += s.vx * dt; s.y += s.vy * dt;
            if (Math.random() < 0.5) parts.emit(s.x, s.y, { count: 1, color: s.color, speed: 30, life: 0.3 });
            let dead = s.life <= 0 || s.x < -40 || s.y < -40 || s.x > W + 40 || s.y > H + 40 || segHit(s);
            if (!dead) for (const f of fighters) {
              if (!hitTest(s, f)) continue;
              const a = Math.atan2(s.vy, s.vx);
              damage(f, s.dmg, s.owner, Math.cos(a) * s.kb, Math.sin(a) * s.kb);
              s.hit.add(f);
              if (!s.pierce) { dead = true; break; }
            }
            if (dead) {
              if (s.burst) { for (const f of fighters) if (f !== s.owner && !s.hit.has(f) && U.dist(f.x, f.y, s.x, s.y) < s.burst) damage(f, 8, s.owner, 0, 0); parts.emit(s.x, s.y, { count: 16, colors: ['#ff7a2e', '#ffd66b'], speed: 150, life: 0.4 }); }
              else parts.emit(s.x, s.y, { count: 6, color: s.color, speed: 90, life: 0.3 });
              shots.splice(i, 1);
            }
          }
          // zones
          for (let i = zones.length - 1; i >= 0; i--) {
            const z = zones[i];
            z.t += dt;
            if (z.kind === 'meteor' || z.kind === 'quake') {
              if (z.t >= z.delay && !z.done) {
                z.done = true;
                for (const f of fighters) { if ((f === z.owner && !z.self) || f === z.owner) continue; const dd = U.dist(f.x, f.y, z.x, z.y); if (dd < z.r + T.r) { const a = U.angleTo(z.x, z.y, f.x, f.y); damage(f, z.dmg, z.owner, Math.cos(a) * z.kb, Math.sin(a) * z.kb, { stun: z.stun }); } }
                parts.emit(z.x, z.y, { count: 40, colors: z.kind === 'meteor' ? ['#ff7a2e', '#ffd66b', '#5a3a2a'] : ['#b48a4a', '#e8d3a8'], speed: 260, life: 0.7 });
                ctx.sfx('explosion', { volume: z.owner.isMe ? 0.8 : 0.35 });
              }
              if (z.t > z.delay + 0.4) zones.splice(i, 1);
            } else if (z.kind === 'wave') {
              if (!z.done) {
                z.done = true;
                for (const f of fighters) {
                  if (f === z.owner) continue;
                  const dd = U.dist(f.x, f.y, z.x, z.y);
                  if (dd < z.r && Math.abs(U.wrapAngle(U.angleTo(z.x, z.y, f.x, f.y) - z.a)) < z.spread) damage(f, z.dmg, z.owner, Math.cos(z.a) * z.kb, Math.sin(z.a) * z.kb);
                }
              }
              if (z.t > 0.35) zones.splice(i, 1);
            } else if (z.kind === 'cyclone') {
              z.x += z.vx * dt; z.y += z.vy * dt;
              for (const f of fighters) {
                if (f === z.owner || f.dead) continue;
                const dd = U.dist(f.x, f.y, z.x, z.y);
                if (dd < z.r + 30) { const a = U.angleTo(f.x, f.y, z.x, z.y); f.vx += Math.cos(a) * 520 * dt; f.vy += Math.sin(a) * 520 * dt; }
                if (dd < z.r) { z.tick = (z.tick || 0) + dt; if (z.tick > 0.33) { z.tick = 0; damage(f, z.dmg / 3 * 1.0 + 1, z.owner, 0, 0); } }
              }
              if (z.t > z.dur) zones.splice(i, 1);
            } else if (z.kind === 'singularity') {
              for (const f of fighters) {
                if (f === z.owner || f.dead) continue;
                const dd = U.dist(f.x, f.y, z.x, z.y);
                if (dd < z.r) { const a = U.angleTo(f.x, f.y, z.x, z.y); const k = 1 - dd / z.r; f.vx += Math.cos(a) * 700 * k * dt; f.vy += Math.sin(a) * 700 * k * dt; }
              }
              if (z.t > z.dur) {
                for (const f of fighters) { if (f === z.owner) continue; const dd = U.dist(f.x, f.y, z.x, z.y); if (dd < 70) { const a = U.angleTo(z.x, z.y, f.x, f.y); damage(f, z.dmg, z.owner, Math.cos(a) * z.kb, Math.sin(a) * z.kb); } }
                parts.emit(z.x, z.y, { count: 50, colors: ['#b67cff', '#ffffff', '#3a1f6a'], speed: 280, life: 0.8 });
                ctx.sfx('explosion', { volume: z.owner.isMe ? 0.8 : 0.35 });
                zones.splice(i, 1);
              }
            }
          }
          for (let i = trails.length - 1; i >= 0; i--) {
            const tr = trails[i];
            tr.t -= dt; tr.tick += dt;
            if (tr.tick > 0.4) { tr.tick = 0; for (const f of fighters) if (f !== tr.owner && P.distToSeg(f.x, f.y, tr.x1, tr.y1, tr.x2, tr.y2) < 22) damage(f, 4, tr.owner, 0, 0); }
            if (tr.t <= 0) trails.splice(i, 1);
          }
          for (let i = walls.length - 1; i >= 0; i--) { walls[i].t -= dt; if (walls[i].t <= 0) walls.splice(i, 1); }
          updateHotbar();
        },

        draw(g) {
          const t = ctx.time;
          const bg = g.createLinearGradient(0, 0, 0, H);
          bg.addColorStop(0, '#120c24'); bg.addColorStop(1, '#1d1538');
          g.fillStyle = bg; g.fillRect(0, 0, W, H);
          for (const s of STARS) { g.globalAlpha = 0.35 + Math.sin(t * 2 + s.t) * 0.25; G.circle(g, s.x, s.y, s.s, '#ffffff'); }
          g.globalAlpha = 1;
          // platforms
          for (const b of BRIDGES) { g.lineCap = 'round'; G.line(g, b.x1, b.y1 + 10, b.x2, b.y2 + 10, '#2a2140', b.w * 2); G.line(g, b.x1, b.y1, b.x2, b.y2, '#6a6f86', b.w * 2); G.line(g, b.x1, b.y1, b.x2, b.y2, '#7f86a0', b.w * 2 - 10); }
          for (const dd of DISCS) {
            G.circle(g, dd.x, dd.y + 14, dd.r, '#2a2140');
            G.circle(g, dd.x, dd.y, dd.r, '#5a6078');
            G.circle(g, dd.x, dd.y, dd.r - 8, '#747c98');
            g.globalAlpha = 0.25; G.ring(g, dd.x, dd.y, dd.r * 0.6, '#b8c0da', 2); g.globalAlpha = 1;
          }
          G.circle(g, 480, 290, 26, '#8a92ae'); g.globalAlpha = 0.5 + Math.sin(t * 2) * 0.2; G.ring(g, 480, 290, 34, '#b67cff', 2); g.globalAlpha = 1;
          for (const tr of trails) { g.globalAlpha = Math.min(1, tr.t) * 0.7; g.lineCap = 'round'; G.line(g, tr.x1, tr.y1, tr.x2, tr.y2, '#ff7a2e', 18); G.line(g, tr.x1, tr.y1, tr.x2, tr.y2, '#ffd66b', 6); g.globalAlpha = 1; }
          for (const w of walls) { g.lineCap = 'round'; G.line(g, w.x1, w.y1, w.x2, w.y2, '#7a5a34', 16); G.line(g, w.x1, w.y1 - 3, w.x2, w.y2 - 3, '#b48a4a', 10); }
          for (const z of zones) {
            if (z.kind === 'meteor') { const k = Math.min(1, z.t / z.delay); g.globalAlpha = 0.3; G.circle(g, z.x, z.y, z.r * k, '#ff3d5a'); g.globalAlpha = 1; G.ring(g, z.x, z.y, z.r, '#ff7a2e', 2); if (!z.done) G.circle(g, z.x - (1 - k) * 80, z.y - (1 - k) * 240, 16, '#ff7a2e'); }
            else if (z.kind === 'quake') { g.globalAlpha = Math.max(0, 0.5 - z.t); G.circle(g, z.x, z.y, z.r * Math.min(1, z.t * 3), '#b48a4a'); g.globalAlpha = 1; }
            else if (z.kind === 'wave') { g.globalAlpha = 0.5 * (1 - z.t / 0.35); g.fillStyle = '#46a8ff'; g.beginPath(); g.moveTo(z.x, z.y); g.arc(z.x, z.y, z.r * Math.min(1, z.t * 5), z.a - z.spread, z.a + z.spread); g.closePath(); g.fill(); g.globalAlpha = 1; }
            else if (z.kind === 'cyclone') { for (let k = 0; k < 4; k++) { g.globalAlpha = 0.35; G.ring(g, z.x, z.y - k * 8, z.r - k * 12 + Math.sin(t * 20 + k) * 4, '#e6fffa', 3); } g.globalAlpha = 1; }
            else if (z.kind === 'singularity') { g.globalAlpha = 0.25; G.circle(g, z.x, z.y, z.r, '#3a1f6a'); g.globalAlpha = 1; G.circle(g, z.x, z.y, 18 + Math.sin(t * 12) * 3, '#0b0714'); G.ring(g, z.x, z.y, 24, '#b67cff', 3); }
          }
          for (const s of shots) {
            if (s.kind === 'rock') { G.circle(g, s.x, s.y, s.r, '#7a5a34'); G.circle(g, s.x - 3, s.y - 3, s.r * 0.4, '#b48a4a'); }
            else if (s.kind === 'air') { const a = Math.atan2(s.vy, s.vx); g.strokeStyle = s.color; g.lineWidth = 4; g.beginPath(); g.arc(s.x - Math.cos(a) * 8, s.y - Math.sin(a) * 8, 14, a - 1, a + 1); g.stroke(); }
            else { g.globalAlpha = 0.35; G.circle(g, s.x, s.y, s.r * 1.8, s.color); g.globalAlpha = 1; G.circle(g, s.x, s.y, s.r, s.color); G.circle(g, s.x, s.y, s.r * 0.45, '#ffffff'); }
          }
          for (const f of fighters) {
            if (f.dead) continue;
            const scale = f.falling ? Math.max(0.1, f.falling / T.fall) : 1;
            g.save();
            g.translate(f.x, f.y); g.scale(scale, scale); g.translate(-f.x, -f.y);
            const el = ELEMENTS[f.el];
            g.globalAlpha = 0.35; G.ring(g, f.x, f.y, T.r + 5, el.color, 3); g.globalAlpha = 1;
            if (f.prot > 0) { g.globalAlpha = 0.4; G.circle(g, f.x, f.y, T.r + 9, '#ffffff'); g.globalAlpha = 1; }
            G.avatarTop(g, f.x, f.y, T.r, f.look, f.a, { walk: f.walk, flash: f.flash > 0, alpha: f.dashT > 0 && f.el === 'air' ? 0.5 : 1 });
            if (f.stun > 0) for (let k = 0; k < 3; k++) G.circle(g, f.x + Math.cos(t * 6 + k * 2) * 14, f.y - 20 + Math.sin(t * 6 + k * 2) * 4, 2.5, '#ffd66b');
            g.restore();
            if (!f.falling) {
              G.bar(g, f.x - 18, f.y + 17, 36, 4, f.hp / T.hp, f.isMe ? '#3fd08a' : '#ff5a6a');
              G.nameTag(g, f.x, f.y - 16, f.name, f.isMe ? '#ffb454' : '#fff');
              const bb = ctx.bubbleText(f.isMe ? 'me' : f.bot.id);
              if (bb) G.bubble(g, f.x, f.y - 36, bb);
            }
          }
          parts.draw(g);
          floats.draw(g);
          if (me && me.useMouse && !me.dead && phase === 'play') { const p = ctx.input.pointer; G.ring(g, p.x, p.y, 9, ELEMENTS[me.el].color, 2); G.circle(g, p.x, p.y, 2, '#fff'); }
          drawHud(g);
        },

        render3d(dt) { view(dt); },
        hud(g) { drawHud(g); },

        onBotJoin(b) { if (phase === 'play') addBot(b); },
        onBotLeave(b) { const i = fighters.findIndex((f) => f.bot && f.bot.id === b.id); if (i >= 0) fighters.splice(i, 1); },
        destroy() { offPass(); },
      };

      function drawHud(g) {
          if (phase === 'lobby' || !me) return;
          G.panel(g, 10, 10, 250, 58);
          G.text(g, U.fmtClock(clock), 22, 38, { size: 22, weight: 800, color: clock < 30 ? '#ff8b98' : '#fff' });
          G.text(g, ELEMENTS[me.el].name, 248, 30, { size: 12, align: 'right', color: ELEMENTS[me.el].color, weight: 800 });
          G.text(g, 'Energy', 100, 30, { size: 10, color: '#a1abbb' });
          G.bar(g, 100, 36, 140, 8, me.en / T.energy, '#7fe7ff');
          G.text(g, me.dead ? 'Respawning in ' + Math.ceil(me.dead) + 's' : 'HP ' + Math.ceil(me.hp), 22, 60, { size: 12, color: me.dead ? '#ff8b98' : '#cfd6e2' });
          G.text(g, U.fmt(me.score) + ' pts · ' + me.kos + ' KOs', 248, 60, { size: 12, align: 'right', color: '#ffd66b' });
          const ranked = fighters.slice().sort((a, b) => b.score - a.score);
          G.panel(g, W - 200, 10, 190, 18 + ranked.length * 18);
          ranked.forEach((f, i) => {
            G.circle(g, W - 188, 26 + i * 18, 4, ELEMENTS[f.el].color);
            G.text(g, (i + 1) + '. ' + f.name, W - 178, 31 + i * 18, { size: 12, color: f.isMe ? '#ffb454' : '#e8ecf3' });
            G.text(g, U.fmt(f.score), W - 20, 31 + i * 18, { size: 12, align: 'right', color: '#ffd66b', weight: 800 });
          });
      }
    },
  });
})((window.BF = window.BF || {}));
