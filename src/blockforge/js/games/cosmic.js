/**
 * Cosmic Survival (gameType "cosmic") — asteroid-storm survival.
 * Fly a small ship in a wrap-around arena. Meteors split when shot and drop
 * crystals that recharge your shield. Power-ups: spread shot, rapid fire,
 * shield cells and nova bombs. Comets and meteor showers get more frequent.
 * Wingmates (bots) fight alongside you. At 3:00 an evacuation beam opens.
 * Win: survive to 3:00 (fly into the beam to leave, or stay for glory).
 * Lose: your hull is destroyed before 3:00.
 * Passes: deflector (+50% shield, starts charged), tractor (crystal magnet).
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;
  const TAU = Math.PI * 2;

  const T = {
    evac: 180, evacWindow: 30, thrust: 380, maxSpeed: 330, drag: 0.55, turn: 4.2, fire: 0.22, rapid: 0.09, bulletSpeed: 600, bulletLife: 0.85,
    shield: 100, hull: 3, crystalShield: 8, magnet: 170, powerTime: 12,
    sizes: { 3: { r: 40, pts: 20, dmg: 40 }, 2: { r: 24, pts: 50, dmg: 28 }, 1: { r: 12, pts: 100, dmg: 16 } },
    rewards: { play: 15, win: 60, perMinute: 6, xpPlay: 30, xpWin: 130 },
  };
  const POWERS = {
    spread: { name: 'Spread Shot', color: '#ffb454' },
    rapid: { name: 'Rapid Fire', color: '#ff5a6a' },
    cell: { name: 'Shield Cell', color: '#7fe7ff' },
    nova: { name: 'Nova Bomb', color: '#b67cff' },
  };
  const wrap = (v, max) => ((v % max) + max) % max;
  const STARS = (() => { const r = U.rng('cosmic-stars'); return Array.from({ length: 140 }, () => ({ x: r() * 960, y: r() * 540, z: 0.2 + r() * 0.8 })); })();

  BF.GameModules.register('cosmic', {
    maxBots: 3,
    feedTop: 0.15,
    actions: { fire: ['Space', 'KeyJ'], thrust: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'] },
    controls: { joystick: true, buttons: [{ act: 'fire', label: 'Fire', icon: 'crosshair' }, { act: 'thrust', label: 'Thrust', icon: 'rocket' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const parts = new BF.Particles(700);
      const floats = new BF.Floaters();
      const deflector = ctx.hasPass('deflector');
      const tractor = ctx.hasPass('tractor');
      const shieldMax = T.shield * (deflector ? 1.5 : 1);

      let phase = 'play';
      let time = 0, score = 0, destroyed = 0, crystals = 0;
      let spawnT = 1, eventT = 35;
      let evac = null;
      let stayed = false;
      const me = { isMe: true, x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, shield: deflector ? shieldMax : 60, hull: T.hull, cd: 0, inv: 2, power: null, powerT: 0, thrusting: false, name: ctx.player.name };
      const meteors = [], bullets = [], drops = [], comets = [];
      const mates = [];
      function addMate(b) {
        if (mates.some((m) => m.bot.id === b.id) || mates.length >= 3) return;
        mates.push({ bot: b, name: b.displayName, x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, a: 0, cd: 0, dead: 0, hp: 3, inv: 2, skill: U.clamp((ctx.botLevel(b) || 10) / 55, 0.2, 0.95), color: U.pick(['#86e3a8', '#d7a8ff', '#7cc6ff', '#ffd66b']) });
      }
      ctx.bots.forEach(addMate);

      function makeMeteor(size, x, y, speed) {
        const r = U.rng(Math.random() * 1e9);
        const n = 9 + Math.floor(r() * 4);
        const shape = Array.from({ length: n }, (_, i) => ({ a: (i / n) * TAU, k: 0.72 + r() * 0.35 }));
        const a = Math.random() * TAU;
        const sp = speed || (40 + Math.random() * 50) * (1 + time / 150);
        return { size, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: T.sizes[size].r, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 1.6, shape, hp: size };
      }
      function spawnEdgeMeteor(size) {
        const side = Math.floor(Math.random() * 4);
        const x = side === 0 ? -40 : side === 1 ? W + 40 : Math.random() * W;
        const y = side === 2 ? -40 : side === 3 ? H + 40 : Math.random() * H;
        const m = makeMeteor(size || (Math.random() < 0.5 ? 3 : 2), x, y);
        if (U.dist(m.x, m.y, me.x, me.y) < 180) return;
        meteors.push(m);
      }
      for (let i = 0; i < 4; i++) spawnEdgeMeteor(3);

      function breakMeteor(m, byMe) {
        meteors.splice(meteors.indexOf(m), 1);
        parts.emit(m.x, m.y, { count: 8 + m.size * 6, colors: ['#9a8a7a', '#cfbfa8', '#6a5a4a'], speed: 150, life: 0.6 });
        ctx.sfx('explosion', { volume: 0.25 + m.size * 0.08 });
        if (byMe) { score += T.sizes[m.size].pts; destroyed++; }
        if (m.size > 1) for (let i = 0; i < 2; i++) { const c = makeMeteor(m.size - 1, m.x, m.y, Math.hypot(m.vx, m.vy) * 1.3 + 30); meteors.push(c); }
        const nC = m.size === 3 ? 3 : m.size === 2 ? 2 : 1;
        for (let i = 0; i < nC; i++) if (Math.random() < 0.7) drops.push({ kind: 'crystal', x: m.x + (Math.random() - 0.5) * 20, y: m.y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, t: 0 });
        if (Math.random() < 0.06 + m.size * 0.02) drops.push({ kind: U.pick(Object.keys(POWERS)), x: m.x, y: m.y, vx: 0, vy: 0, t: 0 });
      }
      function fire(sh, isMe) {
        const spread = isMe && me.power === 'spread';
        const angles = spread ? [-0.18, 0, 0.18] : [0];
        for (const off of angles) {
          const a = sh.a + off;
          bullets.push({ x: sh.x + Math.cos(sh.a) * 14, y: sh.y + Math.sin(sh.a) * 14, vx: Math.cos(a) * T.bulletSpeed + sh.vx * 0.4, vy: Math.sin(a) * T.bulletSpeed + sh.vy * 0.4, t: 0, me: isMe, color: isMe ? '#ffe9a8' : sh.color });
        }
        if (isMe) ctx.sfx('laser', { volume: 0.35 });
      }
      function hurtMe(dmg, x, y) {
        if (me.inv > 0 || phase !== 'play') return;
        me.inv = 0.8;
        if (me.shield > 0) { me.shield = Math.max(0, me.shield - dmg); ctx.sfx('hit', { volume: 0.6 }); parts.emit(me.x, me.y, { count: 14, color: '#7fe7ff', speed: 140, life: 0.4 }); }
        else { me.hull--; ctx.sfx('hurt'); parts.emit(me.x, me.y, { count: 20, colors: ['#ff7a2e', '#ffd66b'], speed: 160, life: 0.5 }); floats.add(me.x, me.y - 24, 'HULL HIT!', '#ff5a6a', 15); }
        const a = U.angleTo(x, y, me.x, me.y);
        me.vx += Math.cos(a) * 160; me.vy += Math.sin(a) * 160;
        if (me.hull <= 0) finish('destroyed');
      }
      function nova(x, y) {
        parts.emit(x, y, { count: 80, colors: ['#b67cff', '#ffffff'], speed: 320, life: 0.7 });
        ctx.sfx('explosion');
        for (const m of meteors.slice()) if (U.dist(m.x, m.y, x, y) < 220) breakMeteor(m, true);
      }

      function finish(reason) {
        if (phase !== 'play') return;
        phase = 'over';
        const survived = Math.floor(time);
        const win = survived >= T.evac;
        const total = score + survived * 5;
        if (win) ctx.badge('cs_evac');
        if (survived >= 300) ctx.badge('cs_5min');
        ctx.best('bestSurvival', survived, 'max');
        ctx.best('bestScore', total, 'max');
        ctx.end({
          outcome: win ? 'win' : 'lose',
          title: reason === 'evac' ? 'Evacuated!' : win ? 'Survived the storm!' : 'Ship destroyed',
          subtitle: 'Survived ' + U.fmtClock(survived) + (reason === 'evac' ? ' and reached the evacuation beam' : win ? ' and stayed for glory' : ''),
          coins: T.rewards.play + Math.floor(survived / 60) * T.rewards.perMinute + (win ? T.rewards.win : 0),
          xp: T.rewards.xpPlay + (win ? T.rewards.xpWin : 0),
          stats: [['Survived', U.fmtClock(survived)], ['Score', U.fmt(total)], ['Meteors destroyed', destroyed], ['Crystals', crystals]],
          delay: reason === 'evac' ? 1200 : 900,
        });
      }

      function steerShip(sh, dt, turn, thrust, brake) {
        sh.a += turn * T.turn * dt;
        if (thrust) { sh.vx += Math.cos(sh.a) * T.thrust * dt; sh.vy += Math.sin(sh.a) * T.thrust * dt; }
        if (brake) { sh.vx *= Math.pow(0.1, dt); sh.vy *= Math.pow(0.1, dt); }
        sh.vx *= Math.pow(T.drag, dt); sh.vy *= Math.pow(T.drag, dt);
        const sp = Math.hypot(sh.vx, sh.vy);
        if (sp > T.maxSpeed) { sh.vx *= T.maxSpeed / sp; sh.vy *= T.maxSpeed / sp; }
        sh.x = wrap(sh.x + sh.vx * dt, W); sh.y = wrap(sh.y + sh.vy * dt, H);
      }
      function mateAI(m, dt) {
        if (m.dead > 0) { m.dead -= dt; if (m.dead <= 0) { m.hp = 3; m.inv = 2; m.x = Math.random() * W; m.y = Math.random() * H; } return; }
        if (m.inv > 0) m.inv -= dt;
        m.cd -= dt;
        const tgt = meteors.reduce((b, x) => (!b || U.dist(x.x, x.y, m.x, m.y) < U.dist(b.x, b.y, m.x, m.y) ? x : b), null);
        let turn = 0, thrust = false;
        if (tgt) {
          const dd = U.dist(tgt.x, tgt.y, m.x, m.y);
          const lead = dd / T.bulletSpeed;
          const want = U.angleTo(m.x, m.y, tgt.x + tgt.vx * lead, tgt.y + tgt.vy * lead) + (dd < tgt.r + 90 ? Math.PI : 0);
          const diff = U.wrapAngle(want - m.a);
          turn = U.clamp(diff * 3, -1, 1);
          thrust = dd > 240 || dd < tgt.r + 90;
          if (Math.abs(diff) < 0.25 - m.skill * 0.1 && m.cd <= 0 && dd < 420) { m.cd = T.fire * (1.8 - m.skill); fire(m, false); }
        }
        steerShip(m, dt, turn, thrust, false);
        for (const mt of meteors) if (m.inv <= 0 && U.dist(mt.x, mt.y, m.x, m.y) < mt.r + 10) { m.hp--; m.inv = 1; if (m.hp <= 0) { m.dead = 8; parts.emit(m.x, m.y, { count: 30, colors: ['#ff7a2e', m.color], speed: 180, life: 0.6 }); ctx.feed(m.name + "'s ship went down. Respawning soon.", 'info', '#ff9d9d'); if (Math.random() < 0.4) ctx.botSay(m.bot, 'lose', 400); } }
      }

      function drawShip(g, sh, color, t) {
        g.save(); g.translate(sh.x, sh.y); g.rotate(sh.a);
        if (sh.thrusting) { g.fillStyle = Math.sin(t * 50) > 0 ? '#ffb454' : '#ff5a1f'; g.beginPath(); g.moveTo(-10, -5); g.lineTo(-22 - Math.random() * 6, 0); g.lineTo(-10, 5); g.closePath(); g.fill(); }
        g.fillStyle = color; g.beginPath(); g.moveTo(16, 0); g.lineTo(-10, -11); g.lineTo(-6, 0); g.lineTo(-10, 11); g.closePath(); g.fill();
        G.circle(g, 3, 0, 4, 'rgba(20,30,50,.8)');
        g.restore();
      }

      ctx.banner('SURVIVE THE STORM', 'Evacuation opens at 3:00', 1800);

      return {
        update(dt) {
          parts.update(dt);
          floats.update(dt);
          if (phase !== 'play') return;
          time += dt;
          const inp = ctx.input;
          const ax = inp.axis();
          // controls: joystick/keys rotate; mouse aims
          const p = inp.pointer;
          if (p.moved) me.mouse = true;
          if (Math.abs(ax.x) > 0.3) me.mouse = false;
          let turn = ax.x;
          if (me.mouse) turn = U.clamp(U.wrapAngle(Math.atan2(p.y - me.y, p.x - me.x) - me.a) * 3, -1, 1);
          const thrust = inp.act('thrust') || ax.y < -0.4;
          me.thrusting = thrust;
          steerShip(me, dt, turn, thrust, inp.act('brake') || ax.y > 0.5);
          if (me.inv > 0) me.inv -= dt;
          me.cd -= dt;
          if ((inp.act('fire') || p.down) && me.cd <= 0) { me.cd = me.power === 'rapid' ? T.rapid : T.fire; fire(me, true); }
          if (me.powerT > 0) { me.powerT -= dt; if (me.powerT <= 0) me.power = null; }
          mates.forEach((m) => { m.thrusting = false; mateAI(m, dt); });
          // spawning
          const intensity = 1 + time / 60;
          spawnT -= dt;
          if (spawnT <= 0) { spawnT = Math.max(0.6, 3.2 / intensity); if (meteors.length < 10 + time / 12) spawnEdgeMeteor(); }
          eventT -= dt;
          if (eventT <= 0) {
            eventT = Math.max(14, 34 - time / 12);
            if (Math.random() < 0.5) {
              const y = 60 + Math.random() * (H - 120), dir = Math.random() < 0.5 ? 1 : -1;
              comets.push({ x: dir > 0 ? -200 : W + 200, y, vx: dir * 700, warn: 1.4, r: 26 });
              ctx.banner('COMET!', 'Get out of the red line', 1000); ctx.sfx('beep');
            } else {
              ctx.banner('METEOR SHOWER', '', 1000);
              const side = Math.random() < 0.5 ? -40 : W + 40;
              for (let i = 0; i < 6 + time / 30; i++) { const m = makeMeteor(1, side, Math.random() * H, 160 + Math.random() * 80); m.vx = Math.abs(m.vx) * (side < 0 ? 1 : -1); meteors.push(m); }
            }
          }
          // meteors
          for (const m of meteors) {
            m.x += m.vx * dt; m.y += m.vy * dt; m.rot += m.spin * dt;
            if (m.x < -60) m.x += W + 120; if (m.x > W + 60) m.x -= W + 120; if (m.y < -60) m.y += H + 120; if (m.y > H + 60) m.y -= H + 120;
            if (U.dist(m.x, m.y, me.x, me.y) < m.r + 10) { hurtMe(T.sizes[m.size].dmg, m.x, m.y); if (m.size === 1) breakMeteor(m, false); }
          }
          // comets
          for (let i = comets.length - 1; i >= 0; i--) {
            const c = comets[i];
            if (c.warn > 0) { c.warn -= dt; continue; }
            c.x += c.vx * dt;
            if (Math.random() < 0.8) parts.emit(c.x, c.y, { count: 2, colors: ['#8fd3ff', '#ffffff'], speed: 60, life: 0.6 });
            if (U.dist(c.x, c.y, me.x, me.y) < c.r + 10) hurtMe(50, c.x, c.y);
            for (const m of meteors.slice()) if (U.dist(c.x, c.y, m.x, m.y) < c.r + m.r) breakMeteor(m, false);
            if (c.x < -300 || c.x > W + 300) comets.splice(i, 1);
          }
          // bullets
          for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
            let hit = false;
            for (const m of meteors) if (U.dist(b.x, b.y, m.x, m.y) < m.r) { m.hp--; hit = true; if (m.hp <= 0 || m.size === 1) breakMeteor(m, b.me); else parts.emit(b.x, b.y, { count: 4, color: '#cfbfa8', speed: 80, life: 0.3 }); break; }
            if (hit || b.t > T.bulletLife) bullets.splice(i, 1);
            else { b.x = wrap(b.x, W); b.y = wrap(b.y, H); }
          }
          // drops
          for (let i = drops.length - 1; i >= 0; i--) {
            const dr = drops[i];
            dr.t += dt;
            dr.vx *= Math.pow(0.4, dt); dr.vy *= Math.pow(0.4, dt);
            const dd = U.dist(dr.x, dr.y, me.x, me.y);
            if (dr.kind === 'crystal' && tractor && dd < T.magnet) { const a = U.angleTo(dr.x, dr.y, me.x, me.y); dr.vx += Math.cos(a) * 900 * dt; dr.vy += Math.sin(a) * 900 * dt; }
            dr.x = wrap(dr.x + dr.vx * dt, W); dr.y = wrap(dr.y + dr.vy * dt, H);
            if (dd < 22) {
              drops.splice(i, 1);
              if (dr.kind === 'crystal') { crystals++; score += 10; me.shield = Math.min(shieldMax, me.shield + T.crystalShield); ctx.sfx('pickup', { volume: 0.5 }); }
              else if (dr.kind === 'cell') { me.shield = Math.min(shieldMax, me.shield + 50); ctx.sfx('powerup'); floats.add(me.x, me.y - 24, 'Shield +50', '#7fe7ff', 14); }
              else if (dr.kind === 'nova') { nova(me.x, me.y); floats.add(me.x, me.y - 24, 'NOVA!', '#b67cff', 16); }
              else { me.power = dr.kind; me.powerT = T.powerTime; ctx.sfx('powerup'); floats.add(me.x, me.y - 24, POWERS[dr.kind].name + '!', POWERS[dr.kind].color, 15); }
              continue;
            }
            if (dr.t > 14) drops.splice(i, 1);
          }
          // evacuation
          if (!evac && time >= T.evac) { evac = { x: W / 2, y: H / 2, t: 0 }; ctx.banner('EVACUATION BEAM OPEN!', 'Fly into the beam to leave · or stay for glory', 2400); ctx.sfx('levelup'); ctx.badge('cs_evac'); }
          if (evac) {
            evac.t += dt;
            if (evac.t < T.evacWindow && U.dist(me.x, me.y, evac.x, evac.y) < 46) finish('evac');
            if (evac.t >= T.evacWindow && !stayed) { stayed = true; ctx.banner('The shuttle has left', 'Endless storm: how long can you last?', 2000); }
          }
          if (time >= 300 && time - dt < 300) { ctx.badge('cs_5min'); ctx.banner('FIVE MINUTES!', 'Iron Will', 1600); }
        },

        draw(g) {
          const t = ctx.time;
          g.fillStyle = '#070912'; g.fillRect(0, 0, W, H);
          for (const s of STARS) { const x = wrap(s.x - me.x * s.z * 0.15, W), y = wrap(s.y - me.y * s.z * 0.15, H); g.globalAlpha = 0.3 + s.z * 0.6; G.circle(g, x, y, s.z * 1.6, '#ffffff'); }
          g.globalAlpha = 1;
          if (evac && evac.t < T.evacWindow) {
            const k = 1 - evac.t / T.evacWindow;
            g.globalAlpha = 0.25 + Math.sin(t * 5) * 0.1; G.circle(g, evac.x, evac.y, 60, '#8fd3ff'); g.globalAlpha = 1;
            G.ring(g, evac.x, evac.y, 46, '#8fd3ff', 3);
            G.ring(g, evac.x, evac.y, 52, 'rgba(143,211,255,.4)', 6 * k);
            G.fillRR(g, evac.x - 30, evac.y - 80, 60, 26, 10, '#d7dde6');
            G.text(g, 'EVAC · ' + Math.ceil(T.evacWindow - evac.t) + 's', evac.x, evac.y + 72, { size: 13, align: 'center', color: '#8fd3ff', weight: 800 });
          }
          for (const c of comets) { if (c.warn > 0) { g.globalAlpha = 0.25 + Math.sin(t * 20) * 0.15; g.fillStyle = '#ff3d5a'; g.fillRect(0, c.y - c.r, W, c.r * 2); g.globalAlpha = 1; } else { G.circle(g, c.x, c.y, c.r, '#bfe6ff'); G.circle(g, c.x, c.y, c.r * 0.6, '#ffffff'); } }
          for (const m of meteors) {
            g.save(); g.translate(m.x, m.y); g.rotate(m.rot);
            g.fillStyle = '#7a6a5a'; g.beginPath();
            m.shape.forEach((v, i) => { const x = Math.cos(v.a) * m.r * v.k, y = Math.sin(v.a) * m.r * v.k; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
            g.closePath(); g.fill();
            g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(m.r * 0.2, m.r * 0.15, m.r * 0.28, 0, TAU); g.fill();
            g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.arc(-m.r * 0.3, -m.r * 0.25, m.r * 0.2, 0, TAU); g.fill();
            g.restore();
          }
          for (const dr of drops) {
            if (dr.kind === 'crystal') { g.fillStyle = '#7fe7ff'; g.beginPath(); g.moveTo(dr.x, dr.y - 7); g.lineTo(dr.x + 5, dr.y); g.lineTo(dr.x, dr.y + 7); g.lineTo(dr.x - 5, dr.y); g.closePath(); g.fill(); }
            else { const pc = POWERS[dr.kind]; G.circle(g, dr.x, dr.y, 11 + Math.sin(t * 6) * 1.5, pc.color); G.text(g, dr.kind[0].toUpperCase(), dr.x, dr.y + 4, { size: 11, align: 'center', color: '#0b0e13', weight: 900 }); }
          }
          for (const b of bullets) { const a = Math.atan2(b.vy, b.vx); G.line(g, b.x - Math.cos(a) * 8, b.y - Math.sin(a) * 8, b.x, b.y, b.color, 2.5); }
          for (const m of mates) { if (m.dead > 0) continue; g.globalAlpha = m.inv > 0 && Math.sin(t * 30) > 0 ? 0.4 : 1; drawShip(g, m, m.color, t); g.globalAlpha = 1; G.nameTag(g, m.x, m.y - 16, m.name, m.color); const bb = ctx.bubbleText(m.bot.id); if (bb) G.bubble(g, m.x, m.y - 36, bb); }
          g.globalAlpha = me.inv > 0 && Math.sin(t * 30) > 0 ? 0.5 : 1;
          drawShip(g, me, '#ffb454', t);
          g.globalAlpha = 1;
          if (me.shield > 0) { g.globalAlpha = 0.12 + (me.shield / shieldMax) * 0.25; G.circle(g, me.x, me.y, 22, '#7fe7ff'); g.globalAlpha = 1; G.ring(g, me.x, me.y, 22, 'rgba(127,231,255,.6)', 1.5); }
          const mb = ctx.bubbleText('me');
          if (mb) G.bubble(g, me.x, me.y - 36, mb);
          parts.draw(g);
          floats.draw(g);
          // HUD
          G.panel(g, 10, 10, 260, 66);
          G.text(g, U.fmtClock(time), 22, 38, { size: 22, weight: 800, color: time >= T.evac ? '#3fd08a' : '#fff' });
          G.text(g, time < T.evac ? 'evac in ' + U.fmtClock(T.evac - time) : 'evac reached', 110, 34, { size: 11, color: '#a1abbb' });
          G.text(g, U.fmt(score + Math.floor(time) * 5) + ' pts', 258, 34, { size: 13, align: 'right', weight: 800, color: '#ffd66b' });
          G.text(g, 'Shield', 22, 60, { size: 10, color: '#a1abbb' });
          G.bar(g, 60, 53, 120, 8, me.shield / shieldMax, '#7fe7ff');
          for (let i = 0; i < T.hull; i++) G.fillRR(g, 196 + i * 20, 51, 14, 12, 3, i < me.hull ? '#ff5a6a' : 'rgba(255,255,255,.15)');
          if (me.power) G.text(g, POWERS[me.power].name + ' ' + Math.ceil(me.powerT) + 's', 22, 92, { size: 12, color: POWERS[me.power].color, weight: 800, stroke: 'rgba(0,0,0,.6)', strokeW: 3 });
        },

        onBotJoin(b) { addMate(b); },
        onBotLeave(b) { const i = mates.findIndex((m) => m.bot.id === b.id); if (i >= 0) mates.splice(i, 1); },
      };
    },
  });
})((window.BF = window.BF || {}));
