/**
 * Sky Obby (gameType "obby") — side-view parkour course.
 * The course is generated from stage segments (gaps, stairs, zigzags, moving
 * platforms, elevators, falling blocks, blinking platforms, kill bricks,
 * spinning bars and bounce pads) and ends at a golden portal. Checkpoints save
 * progress. Win: reach the portal before the time limit. Lose: time runs out.
 * Passes: double_jump, speed. Creator "Obby" template games use config.seed
 * and config.difficulty to build their own course.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;
  const P = BF.phys;

  const T = {
    gravity: 2050, jump: 760, doubleJump: 690, speed: 270, speedCoil: 1.25, accel: 2600, airCtl: 0.8,
    coyote: 0.1, buffer: 0.13, maxFall: 1350, pw: 24, ph: 46, bounce: 1280, fallDelay: 0.45, fallBack: 3,
    blinkPeriod: 3, blinkOn: 1.9, limit: 360, speedrun: 105, stages: { easy: 6, normal: 8, hard: 10 },
    rewards: { play: 15, win: 60, checkpoint: 3, flawless: 25, xpPlay: 30, xpWin: 130, xpCheckpoint: 10 },
  };

  // ------------------------------------------------------------ course
  const SEGMENTS = [
    { id: 'gaps', min: 1, build(c, r, k) {
      for (let i = 0; i < 3; i++) {
        const dy = U.rand(-50, 45, r);
        const gap = U.rand(80, dy < -30 ? 115 : 135, r) * k;
        const w = U.rand(70, 120, r);
        c.plat(c.x + gap, c.y + dy, w);
      }
    } },
    { id: 'stairs', min: 1, build(c, r, k) {
      for (let i = 0; i < 4; i++) c.plat(c.x + 55 * k, c.y - 48, 64);
    } },
    { id: 'zigzag', min: 2, build(c, r, k) {
      for (let i = 0; i < 4; i++) c.plat(c.x + U.rand(60, 90, r) * k, c.y + (i % 2 ? 60 : -60), 50);
    } },
    { id: 'mover', min: 2, build(c, r, k) {
      const span = 170 * k;
      c.plat(c.x + 40, c.y, 100, { kind: 'move', axis: 'x', range: span, period: U.rand(2.8, 3.6, r), phase: r() * 6 });
      c.x += span;
      c.plat(c.x + 90, c.y, 120);
    } },
    { id: 'elevator', min: 4, build(c, r) {
      c.plat(c.x + 50, c.y, 90, { kind: 'move', axis: 'y', range: -180, period: U.rand(3, 3.8, r), phase: r() * 6 });
      c.plat(c.x + 70, c.y - 175, 150);
    } },
    { id: 'falling', min: 3, build(c, r, k) {
      for (let i = 0; i < 4; i++) c.plat(c.x + 48 * k, c.y + U.rand(-20, 20, r), 60, { kind: 'fall' });
      c.plat(c.x + 60 * k, c.y, 110);
    } },
    { id: 'blink', min: 4, build(c, r, k) {
      for (let i = 0; i < 3; i++) c.plat(c.x + 85 * k, c.y + U.rand(-30, 30, r), 90, { kind: 'blink', off: i * 1.05 });
      c.plat(c.x + 90 * k, c.y, 110);
    } },
    { id: 'lava', min: 3, build(c, r) {
      const p = c.plat(c.x + 80, c.y, 440);
      c.kill(p.x + 120, p.y - 10, 56, 10);
      c.kill(p.x + 290, p.y - 10, 56, 10);
    } },
    { id: 'spinner', min: 5, build(c, r) {
      const p = c.plat(c.x + 80, c.y, 320);
      c.spin(p.x + 160, p.y - 42, 96, (r() < 0.5 ? -1 : 1) * U.rand(1.6, 2.3, r));
    } },
    { id: 'bounce', min: 5, build(c, r, k) {
      const p = c.plat(c.x + 60, c.y, 90);
      c.pad(p.x + 45, p.y);
      c.plat(c.x + 70 * k, c.y - 250, 160);
    } },
  ];

  function genCourse(seed, stages, diff) {
    const r = U.rng(seed);
    const k = diff === 'easy' ? 0.82 : diff === 'hard' ? 1.12 : 1;
    const plats = [], kills = [], spinners = [], pads = [], flags = [];
    const c = {
      x: 0, y: 420, stage: 0,
      plat(x, y, w, o) {
        const p = Object.assign({ x, y, w, h: 18, kind: 'static', stage: c.stage, dx: 0, dy: 0 }, o || {});
        p.x0 = p.x; p.y0 = p.y; p.py = p.y;
        plats.push(p);
        c.x = x + w;
        c.y = y;
        return p;
      },
      kill(x, y, w, h) { kills.push({ x, y, w, h, stage: c.stage }); },
      spin(x, y, len, speed) { spinners.push({ x, y, len, speed, a: r() * 6, stage: c.stage }); },
      pad(x, y) { pads.push({ x, y, t: 0 }); },
    };
    c.plat(-260, c.y, 560, { kind: 'checkpoint', cp: 0 });
    flags.push({ x: 150, y: c.y, cp: 0 });
    let portal = null;
    for (let s = 1; s <= stages; s++) {
      c.stage = s;
      const pool = SEGMENTS.filter((seg) => seg.min <= s + (diff === 'hard' ? 1 : 0));
      const count = 2 + Math.min(3, Math.floor((s + 1) / 3));
      let last = null;
      for (let i = 0; i < count; i++) {
        let seg = U.pick(pool, r);
        if (seg === last) seg = U.pick(pool, r);
        last = seg;
        seg.build(c, r, k);
        // keep the course inside a comfortable band while slowly climbing
        const target = 420 - s * 45;
        if (c.y > target + 160) c.plat(c.x + 70, c.y - 50, 90);
        if (c.y < target - 220) c.plat(c.x + 70, c.y + 60, 90);
      }
      const finish = s === stages;
      const p = c.plat(c.x + 90 * k, c.y + U.rand(-30, 20, r), finish ? 300 : 220, { kind: finish ? 'finish' : 'checkpoint', cp: s });
      if (finish) portal = { x: p.x + 200, y: p.y - 52 };
      else flags.push({ x: p.x + 110, y: p.y, cp: s });
    }
    const minX = -260, maxX = c.x + 200;
    return { plats, kills, spinners, pads, flags, portal, stages, minX, maxX };
  }

  BF.GameModules.register('obby', {
    three: true,
    maxBots: 8,
    feedTop: 0.18,
    actions: { jump: ['Space', 'KeyW', 'ArrowUp'], respawn: ['KeyR'] },
    controls: { joystick: true, buttons: [{ act: 'jump', label: 'Jump', icon: 'chevronUp' }, { act: 'respawn', label: 'Respawn', icon: 'refresh' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const custom = !!ctx.config.custom;
      const diff = custom ? ctx.difficulty : 'normal';
      const course = custom ? genCourse('obby:' + (ctx.config.seed || 7), T.stages[diff] || 8, diff) : genCourse('sky-obby-v1', 10, 'normal');
      const V = ctx.g3;
      // side view in 3D: game x -> X, game y (down) -> -Y, the course runs along Z = 0
      const parts = V ? V.particles2d(0, (x, y) => [x, -y + 6, 0]) : new BF.Particles(400);
      const floats = V ? V.floaters2d(0, (x, y) => [x, -y, 30]) : new BF.Floaters();
      const cam = new BF.Camera(W, H);
      const doubleJump = ctx.hasPass('double_jump');
      const speed = T.speed * (ctx.hasPass('speed') ? T.speedCoil : 1);
      const theme = custom && ctx.config.themeColor ? ctx.config.themeColor : '#46a8ff';

      let phase = 'countdown';
      let countT = 2.4;
      let elapsed = 0;
      let falls = 0;
      let cp = 0;
      const start = course.flags[0];
      const me = { x: start.x, y: start.y, vx: 0, vy: 0, ground: null, coyote: 0, buf: 0, used2: false, facing: 1, walk: 0, fadeT: 0 };
      cam.x = me.x - W / 2; cam.y = me.y - H * 0.6;

      // parallax clouds
      const cr = U.rng('obby-clouds');
      const clouds = Array.from({ length: 36 }, () => ({ x: cr() * 6000 - 500, y: cr() * 900 - 600, s: 0.6 + cr() * 1.2, d: 0.15 + cr() * 0.45 }));

      // ----------------------------------------------------------- bots
      const route = course.plats.slice().sort((a, b) => a.x0 - b.x0);
      const bots = [];
      function addBot(b) {
        const skill = U.clamp((ctx.botLevel(b) || 10) / 60, 0.15, 0.95);
        bots.push({ bot: b, i: 0, t: Math.random() * 2, from: null, to: null, hopT: 0, dur: 0, x: start.x - 40 - Math.random() * 120, y: start.y, skill, cp: 0, fallT: 0, facing: 1, runs: 0, doneT: 0 });
      }
      ctx.bots.forEach(addBot);
      const topOf = (p) => ({ x: p.x + p.w / 2, y: p.y });
      function botStep(bt, dt) {
        if (bt.doneT > 0) { bt.doneT -= dt; if (bt.doneT <= 0) { bt.i = 0; bt.cp = 0; bt.x = start.x - 60; bt.y = start.y; } return; }
        if (bt.fallT > 0) {
          bt.fallT -= dt;
          bt.y += 600 * dt;
          if (bt.fallT <= 0) {
            const back = route.findIndex((p) => p.kind === 'checkpoint' && p.cp === bt.cp);
            bt.i = Math.max(0, back);
            const tp = topOf(route[bt.i]);
            bt.x = tp.x; bt.y = tp.y;
          }
          return;
        }
        if (bt.to) {
          bt.hopT += dt;
          const k = Math.min(1, bt.hopT / bt.dur);
          const tp = topOf(bt.to);
          bt.x = U.lerp(bt.from.x, tp.x, k);
          bt.y = U.lerp(bt.from.y, tp.y, k) - Math.sin(k * Math.PI) * bt.arc;
          if (k >= 1) {
            if (bt.fail) { bt.fallT = 1; bt.to = null; if (Math.random() < 0.35) ctx.botSay(bt.bot, 'lose', 400); return; }
            bt.i = route.indexOf(bt.to);
            bt.to = null;
            bt.t = 0.15 + Math.random() * (1.2 - bt.skill);
            const p = route[bt.i];
            if (p.kind === 'checkpoint' && p.cp > bt.cp) { bt.cp = p.cp; if (p.cp % 3 === 0 && Math.random() < 0.5) ctx.feed(bt.bot.displayName + ' reached checkpoint ' + p.cp + '.', 'info', '#8fd3ff'); }
            if (p.kind === 'finish') {
              bt.runs++;
              bt.doneT = 5;
              const secs = 60 + (1 - bt.skill) * 180 + Math.random() * 40;
              ctx.feed(bt.bot.displayName + ' completed ' + ctx.game.name + ' in ' + U.fmtClock(secs) + '!', 'star', '#ffd66b');
              if (Math.random() < 0.6) ctx.botSay(bt.bot, 'win', 600);
            }
          }
          return;
        }
        bt.t -= dt;
        if (bt.t > 0 || bt.i >= route.length - 1) return;
        const next = route[bt.i + 1];
        if (next.kind === 'blink' && !isOn(next)) { bt.t = 0.2; return; }
        bt.from = { x: bt.x, y: bt.y };
        bt.to = next;
        bt.hopT = 0;
        const tp = topOf(next);
        bt.dur = U.clamp(Math.abs(tp.x - bt.x) / (200 + bt.skill * 90), 0.3, 1);
        bt.arc = 50 + Math.max(0, bt.y - tp.y) + Math.random() * 30;
        bt.facing = tp.x >= bt.x ? 1 : -1;
        const risky = { move: 0.06, fall: 0.05, blink: 0.07, bounce: 0.04 }[next.kind] || 0.025;
        bt.fail = Math.random() < risky * (1.3 - bt.skill) * (1 + next.stage * 0.08);
      }

      // --------------------------------------------------------- helpers
      function isOn(p) {
        return ((ctx.time + p.off) % T.blinkPeriod) < T.blinkOn;
      }
      function solid(p) {
        if (p.kind === 'blink') return isOn(p);
        if (p.kind === 'fall') return !p.trig || p.trig < T.fallDelay + 0.12;
        return true;
      }
      function deathY(x) {
        let m = -Infinity;
        for (const p of course.plats) if (p.x0 + p.w > x - 700 && p.x0 < x + 700) m = Math.max(m, p.y0);
        return (m === -Infinity ? 600 : m) + 340;
      }
      function respawn(voluntary) {
        falls++;
        const f = course.flags.find((x) => x.cp === cp) || start;
        me.x = f.x; me.y = f.y - 1; me.vx = 0; me.vy = 0; me.ground = null; me.used2 = false;
        me.fadeT = 0.5;
        ctx.sfx(voluntary ? 'click' : 'hurt');
        if (!voluntary) floats.add(me.x, me.y - 60, 'Oof!', '#ff8b98', 16);
        if (!voluntary && Math.random() < 0.3) { const b = U.pick(ctx.bots); if (b) ctx.botSay(b, 'any', 800); }
      }
      function reachCheckpoint(p) {
        if (p.cp <= cp) return;
        cp = p.cp;
        ctx.sfx('powerup');
        ctx.feed('Checkpoint ' + cp + ' / ' + (course.stages - 1) + ' reached!', 'star', '#7fe7ff');
        ctx.quest('checkpoint', 1);
        ctx.reward(T.rewards.checkpoint, 'checkpoints');
        ctx.xp(T.rewards.xpCheckpoint);
        const f = course.flags.find((x) => x.cp === cp);
        if (f) parts.emit(f.x, f.y - 50, { count: 24, colors: ['#7fe7ff', '#ffffff', '#ffd66b'], speed: 160, life: 0.7 });
      }
      function finish(win) {
        if (phase !== 'play') return;
        phase = 'over';
        if (win) {
          ctx.sfx('win');
          parts.emit(course.portal.x, course.portal.y, { count: 60, colors: ['#ffd66b', '#ffffff', '#ffb52e'], speed: 260, life: 1 });
          ctx.badge('so_finish');
          if (falls === 0) ctx.badge('so_flawless');
          if (elapsed < T.speedrun) ctx.badge('so_speedrun');
        }
        const improved = win ? ctx.best('bestTime', Math.round(elapsed * 1000), 'min') : false;
        ctx.end({
          outcome: win ? 'win' : 'lose',
          title: win ? 'Course complete!' : 'Out of time',
          subtitle: win ? 'Time ' + U.fmtTime(elapsed * 1000) + ' · ' + U.plural(falls, 'fall') : 'You reached checkpoint ' + cp + ' of ' + (course.stages - 1),
          best: improved ? 'New personal best: ' + U.fmtTime(elapsed * 1000) : null,
          coins: T.rewards.play + (win ? T.rewards.win + (falls === 0 ? T.rewards.flawless : 0) : cp * 2),
          xp: T.rewards.xpPlay + (win ? T.rewards.xpWin : cp * 8),
          stats: [['Time', U.fmtTime(elapsed * 1000)], ['Falls', falls], ['Checkpoints', cp + '/' + (course.stages - 1)], ['Course', custom ? diff[0].toUpperCase() + diff.slice(1) + ' · ' + course.stages + ' stages' : course.stages + ' stages']],
          delay: win ? 1400 : 900,
        });
      }

      function updatePlatforms(dt) {
        const t = ctx.time;
        for (const p of course.plats) {
          p.py = p.y;
          const ox = p.x, oy = p.y;
          if (p.kind === 'move') {
            const k = (Math.sin((t / p.period) * Math.PI * 2 + p.phase) + 1) / 2;
            if (p.axis === 'x') p.x = p.x0 + p.range * k;
            else p.y = p.y0 + p.range * k;
          } else if (p.kind === 'fall' && p.trig) {
            p.trig += dt;
            if (p.trig > T.fallDelay) { p.fv = (p.fv || 0) + T.gravity * 0.8 * dt; p.y += p.fv * dt; }
            if (p.trig > T.fallDelay + T.fallBack) { p.trig = 0; p.fv = 0; p.x = p.x0; p.y = p.y0; }
          }
          p.dx = p.x - ox; p.dy = p.y - oy;
        }
        for (const s of course.spinners) s.a += s.speed * dt;
        for (const pd of course.pads) if (pd.t > 0) pd.t -= dt;
      }

      function updatePlayer(dt) {
        const inp = ctx.input;
        const ax = inp.axis().x;
        if (inp.actPressed('jump')) me.buf = T.buffer;
        else me.buf -= dt;
        if (inp.actPressed('respawn')) { respawn(true); return; }
        if (me.ground) { me.x += me.ground.dx; me.y += me.ground.dy; }
        const target = ax * speed;
        const acc = T.accel * (me.ground ? 1 : T.airCtl);
        me.vx = U.approach(me.vx, target, acc * dt);
        if (Math.abs(ax) > 0.1) me.facing = ax > 0 ? 1 : -1;
        if (me.ground) { me.coyote = T.coyote; me.used2 = false; } else me.coyote -= dt;
        if (me.buf > 0 && me.coyote > 0) {
          me.vy = -T.jump; me.coyote = 0; me.buf = 0; me.ground = null;
          ctx.sfx('jump');
        } else if (me.buf > 0 && doubleJump && !me.ground && !me.used2) {
          me.vy = -T.doubleJump; me.used2 = true; me.buf = 0;
          parts.emit(me.x, me.y, { count: 12, color: '#ffffff', speed: 120, life: 0.4 });
          ctx.sfx('jump', { pitch: 1.3 });
        }
        if (!inp.act('jump') && me.vy < -280) me.vy += T.gravity * 1.1 * dt;
        me.vy = Math.min(T.maxFall, me.vy + T.gravity * dt);
        const prevY = me.y;
        me.x += me.vx * dt;
        me.y += me.vy * dt;
        me.x = U.clamp(me.x, course.minX + 20, course.maxX);
        const wasGround = me.ground;
        me.ground = null;
        if (me.vy >= 0) {
          for (const p of course.plats) {
            if (!solid(p)) continue;
            if (me.x + T.pw / 2 <= p.x || me.x - T.pw / 2 >= p.x + p.w) continue;
            if (prevY <= Math.max(p.y, p.py) + 2 && me.y >= p.y) {
              me.y = p.y; me.vy = 0; me.ground = p;
              if (!wasGround) { ctx.sfx('land'); parts.emit(me.x, me.y, { count: 5, color: 'rgba(255,255,255,.8)', speed: 60, life: 0.3 }); }
              break;
            }
          }
        }
        if (me.ground) {
          const p = me.ground;
          if (p.kind === 'fall' && !p.trig) p.trig = 0.0001;
          if (p.kind === 'checkpoint' && p.cp > cp) reachCheckpoint(p);
          me.walk += Math.abs(me.vx) * dt * 0.05;
        }
        // bounce pads
        for (const pd of course.pads) {
          if (me.vy >= 0 && Math.abs(me.x - pd.x) < 22 && Math.abs(me.y - pd.y) < 4) {
            me.vy = -T.bounce; me.ground = null; pd.t = 0.25; me.used2 = false;
            ctx.sfx('boost');
            parts.emit(pd.x, pd.y, { count: 14, color: '#4ad17f', speed: 150, life: 0.4 });
          }
        }
        // hazards
        const hx = me.x - T.pw / 2, hy = me.y - T.ph;
        for (const kz of course.kills) {
          if (hx < kz.x + kz.w && hx + T.pw > kz.x && hy < kz.y + kz.h && me.y > kz.y) { respawn(false); return; }
        }
        for (const s of course.spinners) {
          if (Math.abs(s.x - me.x) > s.len + 40) continue;
          const ex = s.x + Math.cos(s.a) * s.len, ey = s.y + Math.sin(s.a) * s.len;
          const bx = s.x - Math.cos(s.a) * s.len, by = s.y - Math.sin(s.a) * s.len;
          if (P.distToSeg(me.x, me.y - 12, bx, by, ex, ey) < 16 || P.distToSeg(me.x, me.y - 34, bx, by, ex, ey) < 16) { respawn(false); return; }
        }
        if (me.y > deathY(me.x)) { respawn(false); return; }
        if (course.portal && U.dist(me.x, me.y - 24, course.portal.x, course.portal.y) < 40) finish(true);
      }

      // ------------------------------------------------------------ draw
      function drawPlat(g, p, t) {
        if (!cam.visible(p.x + p.w / 2, p.y, p.w)) return;
        let alpha = 1;
        let top = '#6bd35a', side = '#8a6a4a';
        if (p.kind === 'checkpoint') { top = '#ffffff'; side = '#b7c0cf'; }
        else if (p.kind === 'finish') { top = '#ffd66b'; side = '#e0a800'; }
        else if (p.kind === 'move') { top = '#7fe7ff'; side = '#2f7fb8'; }
        else if (p.kind === 'fall') { top = '#f0d38c'; side = '#b48a4a'; }
        else if (p.kind === 'blink') {
          const on = isOn(p);
          const phaseT = (t + p.off) % T.blinkPeriod;
          alpha = on ? (phaseT > T.blinkOn - 0.45 && Math.sin(t * 30) > 0 ? 0.45 : 0.95) : 0.16;
          top = '#d7a8ff'; side = '#7a4bd6';
        } else if (custom) { top = U.shade(theme, 0.25); side = U.shade(theme, -0.35); }
        g.globalAlpha = alpha;
        const sx = p.kind === 'fall' && p.trig && p.trig < T.fallDelay ? Math.sin(t * 70) * 2 : 0;
        G.fillRR(g, p.x + sx, p.y, p.w, p.h, 4, side);
        G.fillRR(g, p.x + sx, p.y, p.w, 7, 3, top);
        if (p.kind === 'fall') { g.strokeStyle = 'rgba(90,60,30,.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(p.x + sx + p.w * 0.3, p.y + 7); g.lineTo(p.x + sx + p.w * 0.45, p.y + 14); g.lineTo(p.x + sx + p.w * 0.6, p.y + 9); g.stroke(); }
        if (p.kind === 'move') { g.fillStyle = 'rgba(255,255,255,.5)'; for (let i = 8; i < p.w - 4; i += 14) g.fillRect(p.x + i, p.y + 10, 6, 3); }
        g.globalAlpha = 1;
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        const DEPTH = 90;
        V.preset('day', { fogNear: 1400, fogFar: 4200 });
        V.shadowSize(700);
        const colors = (p) => {
          if (p.kind === 'checkpoint') return ['#ffffff', '#b7c0cf'];
          if (p.kind === 'finish') return ['#ffd66b', '#e0a800'];
          if (p.kind === 'move') return ['#7fe7ff', '#2f7fb8'];
          if (p.kind === 'fall') return ['#f0d38c', '#b48a4a'];
          if (p.kind === 'blink') return ['#d7a8ff', '#7a4bd6'];
          return custom ? [U.shade(theme, 0.25), U.shade(theme, -0.35)] : ['#6bd35a', '#8a6a4a'];
        };
        // static platforms are batched; moving / falling / blinking ones get their own meshes
        const statics = [], tops = [];
        const dyn = [];
        for (const p of course.plats) {
          const [top, side] = colors(p);
          if (p.kind === 'static' || p.kind === 'checkpoint' || p.kind === 'finish') {
            statics.push({ x: p.x + p.w / 2, y: -p.y - p.h, z: 0, w: p.w, h: p.h - 6, d: DEPTH, color: side });
            tops.push({ x: p.x + p.w / 2, y: -p.y - 6, z: 0, w: p.w + 2, h: 6, d: DEPTH + 2, color: top });
            if (p.kind === 'static') for (let i = 0; i < Math.floor(p.w / 70); i++) tops.push({ x: p.x + 20 + i * 70 + (i * 13) % 30, y: -p.y - p.h - 14, z: ((i * 37) % 60) - 30, w: 16, h: 14, d: 16, color: side });
          } else {
            const g = V.group();
            V.box(0, -p.h, 0, p.w, p.h - 6, DEPTH, side, { parent: g, opacity: p.kind === 'blink' ? 0.95 : 1 });
            V.box(0, -6, 0, p.w + 2, 6, DEPTH + 2, top, { parent: g, opacity: p.kind === 'blink' ? 0.95 : 1 });
            if (p.kind === 'move') for (let i = 8; i < p.w - 4; i += 16) V.box(-p.w / 2 + i + 3, -12, DEPTH / 2 + 1, 6, 3, 1, '#ffffff', { parent: g, shadow: false });
            dyn.push({ p, g, mats: g.children.map((c) => c.material) });
          }
        }
        V.boxes(statics);
        V.boxes(tops);
        // hazards
        const lavaMat = new THREE.MeshStandardMaterial({ color: '#ff3d5a', emissive: new THREE.Color('#ff3d5a'), emissiveIntensity: 0.8 });
        V.own(lavaMat);
        for (const kz of course.kills) V.box(kz.x + kz.w / 2, -kz.y - kz.h, 0, kz.w, kz.h + 2, DEPTH - 10, null, { material: lavaMat });
        const spinners = course.spinners.map((sp) => {
          V.box(sp.x, -sp.y - 42, -DEPTH / 2 + 12, 8, 42, 8, '#39414f');
          const g = V.group();
          g.position.set(sp.x, -sp.y, 0);
          V.shape('box', 0, 0, 0, sp.len * 2, 12, 12, '#ff3d5a', { parent: g, glow: 0.35 });
          V.shape('cyl', 0, 0, 0, 16, 18, 16, '#39414f', { parent: g }).rotation.x = Math.PI / 2;
          return { sp, g };
        });
        const pads = course.pads.map((pd) => {
          V.box(pd.x, -pd.y, 0, 44, 4, 44, '#2f8f47');
          const top = V.box(pd.x, -pd.y + 4, 0, 34, 7, 34, '#4ad17f', { glow: 0.3 });
          return { pd, top };
        });
        const flags = course.flags.map((f) => {
          V.box(f.x, -f.y, -DEPTH / 2 + 10, 4, 74, 4, '#39414f');
          const flag = V.box(f.x + 20, -f.y + 52, -DEPTH / 2 + 10, 38, 22, 2, '#ff5a6a', { shadow: false });
          return { f, flag };
        });
        let portal = null;
        if (course.portal) {
          const g = V.group();
          g.position.set(course.portal.x, -course.portal.y, 0);
          const rings = ['#ffd66b', '#ffb52e', '#fff3c4'].map((c, i) => V.shape('torus', 0, 0, 0, 72 - i * 16, 72 - i * 16, 40, c, { parent: g, glow: 0.7, metal: 0.4 }));
          V.shape('disc', 0, 0, 0, 58, 58, 1, '#ffe9a8', { parent: g, basic: true, opacity: 0.45, side: 2, depthWrite: false });
          portal = { g, rings };
        }
        // scenery: floating islands and clouds far behind, a cloud sea below
        const r = U.rng('obby3d');
        const isl = [], islTop = [], cl = [];
        for (let x = course.minX - 600; x < course.maxX + 900; x += 160 + r() * 200) {
          const z = -500 - r() * 1300, y = -300 + r() * 700, w = 80 + r() * 220;
          isl.push({ x, y: y - 60, z, w, h: 60, d: w * 0.8, color: '#8a6a4a', rot: r() });
          islTop.push({ x, y, z, w: w + 4, h: 10, d: w * 0.8 + 4, color: '#6bd35a', rot: isl[isl.length - 1].rot });
        }
        for (let i = 0; i < 90; i++) {
          const x = course.minX - 800 + r() * (course.maxX - course.minX + 1800), z = -200 - r() * 1600, y = -500 + r() * 1100, s = 40 + r() * 70;
          for (let k = 0; k < 3; k++) cl.push({ x: x + (k - 1) * s * 0.8, y: y + (k === 1 ? s * 0.2 : 0), z, w: s * (k === 1 ? 1.3 : 1), h: s * 0.7, d: s, color: '#ffffff' });
        }
        V.boxes(isl, { shadow: false });
        V.boxes(islTop, { shadow: false });
        V.boxes(cl, { geo: 'sphereLo', shadow: false, basic: true });
        V.ground(course.minX - 3000, -3000, course.maxX + 3000, 3000, '#f4f8ff', { y: -980, map: BF.g3d.gridTex('#eef5ff', 'rgba(0,0,0,0)', 1, { repeat: [60, 20], noise: true }) });

        return function sync(dt) {
          const t = ctx.time;
          const look = me.facing * 110;
          V.look(me.x + look, -me.y + 70, 0, { dist: 640, pitch: 0.2, yaw: -0.32, fov: 45, lerp: 0.12 }, dt);
          for (const d of dyn) {
            const p = d.p;
            const shake = p.kind === 'fall' && p.trig && p.trig < T.fallDelay ? Math.sin(t * 70) * 2 : 0;
            d.g.position.set(p.x + p.w / 2 + shake, -p.y, 0);
            if (p.kind === 'blink') {
              const on = isOn(p);
              const phaseT = (t + p.off) % T.blinkPeriod;
              const alpha = on ? (phaseT > T.blinkOn - 0.45 && Math.sin(t * 30) > 0 ? 0.45 : 0.95) : 0.14;
              const [top, side] = colors(p);
              d.g.children[0].material = V.mat(side, { opacity: alpha });
              d.g.children[1].material = V.mat(top, { opacity: alpha });
              d.g.children[0].castShadow = d.g.children[1].castShadow = on;
            }
          }
          lavaMat.emissiveIntensity = 0.55 + Math.sin(t * 8) * 0.35;
          for (const s of spinners) s.g.rotation.z = -s.sp.a;
          for (const pd of pads) { const sq = pd.pd.t > 0 ? 0.45 : 1; pd.top.scale.y = 7 * sq; pd.top.position.y = -pd.pd.y + 4 + 3.5 * sq; }
          for (const f of flags) {
            f.flag.material = V.mat(f.f.cp <= cp ? '#3fd08a' : '#ff5a6a');
            f.flag.rotation.y = Math.sin(t * 4 + f.f.x) * 0.15;
          }
          if (portal) {
            portal.rings.forEach((m, i) => { m.rotation.z = t * (0.8 + i * 0.4) * (i % 2 ? -1 : 1); m.rotation.y = Math.sin(t + i) * 0.3; });
            V.label(course.portal.x, -course.portal.y + 60, 0, { name: 'FINISH', color: '#ffd66b' });
          }
          bots.forEach((bt, i) => {
            const rig = V.actor(bt.bot.id, bt.bot.avatar, { scale: 8 });
            const z = -26 + (i % 5) * 13;
            rig.setPos(bt.x, -bt.y, z);
            rig.faceAngle(bt.facing > 0 ? 0.35 : Math.PI - 0.35);
            rig.set({ air: !!bt.to || bt.fallT > 0, move: bt.to ? 0 : 0 });
            if (bt.doneT > 0 && Math.random() < 0.01) rig.emote('cheer', 1.5);
            V.label(bt.x, -bt.y + 58, z, { name: bt.bot.displayName, color: '#ffffff', bubble: ctx.bubbleText(bt.bot.id) });
          });
          const rig = V.actor('me', ctx.player.avatar, { scale: 8 });
          rig.setPos(me.x, -me.y, 18);
          rig.faceAngle(me.facing > 0 ? 0.35 : Math.PI - 0.35);
          rig.set({ air: !me.ground, move: me.ground ? Math.min(1, Math.abs(me.vx) / speed) : 0 });
          rig.group.visible = !(me.fadeT > 0 && Math.sin(t * 40) < 0);
          V.label(me.x, -me.y + 60, 18, { name: ctx.player.name, color: '#ffb454', bubble: ctx.bubbleText('me') });
          V.sweep();
        };
      })();

      return {
        update(dt) {
          parts.update(dt);
          floats.update(dt);
          updatePlatforms(dt);
          for (const bt of bots) botStep(bt, dt);
          if (me.fadeT > 0) me.fadeT -= dt;
          if (phase === 'countdown') {
            const before = Math.ceil(countT);
            countT -= dt;
            if (Math.ceil(countT) !== before && countT > 0) ctx.sfx('beep');
            if (countT <= 0) { phase = 'play'; ctx.banner('GO!', course.stages - 1 + ' checkpoints to the golden portal', 1100); ctx.sfx('go'); }
          } else if (phase === 'play') {
            elapsed += dt;
            if (elapsed >= T.limit) { finish(false); return; }
            if (T.limit - elapsed < 30 && Math.floor(T.limit - elapsed) !== Math.floor(T.limit - elapsed + dt) && Math.floor(T.limit - elapsed) % 10 === 0) ctx.banner(Math.floor(T.limit - elapsed) + ' seconds left!', '', 1000);
            updatePlayer(dt);
          }
          const look = me.facing * 120;
          cam.follow(me.x + look, me.y - 60, dt, 0.12);
        },

        draw(g) {
          const t = ctx.time;
          const sky = g.createLinearGradient(0, 0, 0, H);
          const tint = Math.min(1, Math.max(0, (420 - me.y) / 900));
          sky.addColorStop(0, U.mix('#5fb4ff', '#2a3a8a', tint));
          sky.addColorStop(1, U.mix('#cfeaff', '#8fb0ff', tint));
          g.fillStyle = sky;
          g.fillRect(0, 0, W, H);
          for (const cl of clouds) {
            const x = ((cl.x - cam.x * cl.d) % 6000 + 6000) % 6000 - 500, y = cl.y - cam.y * cl.d * 0.6 + 260;
            if (x < -200 || x > W + 200 || y < -100 || y > H + 100) continue;
            g.globalAlpha = 0.55 + cl.d * 0.6;
            G.circle(g, x, y, 26 * cl.s, '#ffffff'); G.circle(g, x + 26 * cl.s, y + 6, 20 * cl.s, '#ffffff'); G.circle(g, x - 26 * cl.s, y + 8, 18 * cl.s, '#ffffff');
            g.globalAlpha = 1;
          }
          g.save();
          cam.apply(g);
          for (const p of course.plats) drawPlat(g, p, t);
          for (const kz of course.kills) {
            if (!cam.visible(kz.x, kz.y)) continue;
            g.shadowColor = '#ff3d5a'; g.shadowBlur = 12;
            G.fillRR(g, kz.x, kz.y, kz.w, kz.h, 3, Math.sin(t * 8) > 0 ? '#ff3d5a' : '#ff6b7d');
            g.shadowBlur = 0;
          }
          for (const s of course.spinners) {
            if (!cam.visible(s.x, s.y, s.len + 20)) continue;
            const ex = Math.cos(s.a) * s.len, ey = Math.sin(s.a) * s.len;
            g.lineCap = 'round';
            G.line(g, s.x - ex, s.y - ey, s.x + ex, s.y + ey, '#ff3d5a', 12);
            G.line(g, s.x - ex, s.y - ey, s.x + ex, s.y + ey, '#ffb3bd', 4);
            G.circle(g, s.x, s.y, 9, '#39414f');
            G.line(g, s.x, s.y, s.x, s.y + 42, '#39414f', 5);
          }
          for (const pd of course.pads) {
            if (!cam.visible(pd.x, pd.y)) continue;
            const sq = pd.t > 0 ? 4 : 0;
            G.fillRR(g, pd.x - 20, pd.y - 10 + sq, 40, 10 - sq, 4, '#4ad17f');
            G.fillRR(g, pd.x - 14, pd.y - 14 + sq, 28, 5, 2, '#b6f5c9');
          }
          for (const f of course.flags) {
            if (!cam.visible(f.x, f.y)) continue;
            const got = f.cp <= cp;
            G.line(g, f.x, f.y, f.x, f.y - 70, '#39414f', 4);
            g.fillStyle = got ? '#3fd08a' : '#ff5a6a';
            g.beginPath(); g.moveTo(f.x + 2, f.y - 70); g.lineTo(f.x + 40 + Math.sin(t * 4) * 3, f.y - 60); g.lineTo(f.x + 2, f.y - 50); g.closePath(); g.fill();
            if (f.cp > 0) G.text(g, String(f.cp), f.x + 15, f.y - 56, { size: 11, align: 'center', color: '#fff', weight: 800 });
          }
          if (course.portal) {
            const pt = course.portal;
            g.save(); g.translate(pt.x, pt.y);
            for (let i = 0; i < 3; i++) { g.rotate(t * (0.8 + i * 0.4)); G.ring(g, 0, 0, 34 - i * 8, i === 0 ? '#ffd66b' : i === 1 ? '#ffb52e' : '#fff3c4', 5 - i); }
            g.restore();
            g.globalAlpha = 0.25 + Math.sin(t * 3) * 0.1; G.circle(g, pt.x, pt.y, 30, '#ffe9a8'); g.globalAlpha = 1;
            G.text(g, 'FINISH', pt.x, pt.y - 48, { size: 13, align: 'center', color: '#fff', weight: 900, stroke: 'rgba(0,0,0,.5)', strokeW: 4 });
          }
          for (const bt of bots) {
            if (!cam.visible(bt.x, bt.y)) continue;
            G.avatarSide(g, bt.x, bt.y, 44, bt.bot.look, { facing: bt.facing, air: !!bt.to || bt.fallT > 0, walk: bt.to ? 0 : 0, alpha: 0.85 });
            G.nameTag(g, bt.x, bt.y - 50, bt.bot.displayName, '#fff');
            const bb = ctx.bubbleText(bt.bot.id);
            if (bb) G.bubble(g, bt.x, bt.y - 70, bb);
          }
          const alpha = me.fadeT > 0 ? 0.4 + Math.sin(t * 40) * 0.3 : 1;
          G.avatarSide(g, me.x, me.y, T.ph, ctx.player.look, { facing: me.facing, air: !me.ground, walk: me.ground && Math.abs(me.vx) > 20 ? me.walk : 0, alpha });
          G.nameTag(g, me.x, me.y - 52, ctx.player.name, '#ffb454');
          const mb = ctx.bubbleText('me');
          if (mb) G.bubble(g, me.x, me.y - 72, mb);
          parts.draw(g);
          floats.draw(g);
          g.restore();
          drawHud(g);
        },

        render3d(dt) { view(dt); },
        hud(g) { drawHud(g); },

        onBotJoin(b) { addBot(b); },
        onBotLeave(b) { const i = bots.findIndex((x) => x.bot.id === b.id); if (i >= 0) bots.splice(i, 1); },
      };

      function drawHud(g) {
          G.panel(g, 10, 10, 230, 76);
          G.text(g, 'Checkpoint', 22, 31, { size: 11, color: '#a1abbb' });
          G.text(g, cp + ' / ' + (course.stages - 1), 22, 58, { size: 24, weight: 800, color: '#7fe7ff' });
          G.text(g, 'Time', 228, 31, { size: 11, color: '#a1abbb', align: 'right' });
          G.text(g, U.fmtTime(elapsed * 1000), 228, 58, { size: 22, weight: 800, align: 'right', color: T.limit - elapsed < 30 ? '#ff8b98' : '#fff' });
          G.text(g, U.plural(falls, 'fall') + ' · limit ' + U.fmtClock(Math.max(0, T.limit - elapsed)), 22, 78, { size: 11, color: '#cfd6e2' });
          // race progress
          const rows = [{ name: ctx.player.name, cp, me: true }].concat(bots.map((b) => ({ name: b.bot.displayName, cp: b.cp }))).sort((a, b) => b.cp - a.cp).slice(0, 5);
          G.panel(g, W - 190, 10, 180, 22 + rows.length * 18);
          G.text(g, 'Checkpoints', W - 178, 27, { size: 11, color: '#a1abbb' });
          rows.forEach((r, i) => {
            G.text(g, r.name, W - 178, 45 + i * 18, { size: 12, color: r.me ? '#ffb454' : '#e8ecf3' });
            G.text(g, String(r.cp), W - 22, 45 + i * 18, { size: 12, align: 'right', color: '#7fe7ff', weight: 800 });
          });
          if (phase === 'countdown') G.display(g, countT > 0.1 ? String(Math.ceil(countT)) : 'GO', W / 2, H / 2 - 40, 84, '#ffffff');
          if (doubleJump || ctx.hasPass('speed')) G.text(g, [doubleJump ? 'Double Jump' : '', ctx.hasPass('speed') ? 'Speed Coil' : ''].filter(Boolean).join(' · '), 22, 102, { size: 11, color: '#ffd66b' });
      }
    },
  });

  /** Exposed for tests: build a course from a seed. */
  BF.obbyCourse = genCourse;
})((window.BF = window.BF || {}));
