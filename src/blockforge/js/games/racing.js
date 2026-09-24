/**
 * Skyline Racers (gameType "racing") — top-down street racing.
 * Three laps through ordered checkpoints; boost pads; AI racers follow the
 * racing line. Passes: nitro (Shift meter), premium_garage (two faster cars).
 * Also the Racing template for Create (track generated from the game's seed).
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  const T = {
    laps: 3, checkpoints: 10, width: 150, countdown: 3,
    offTrack: { maxSpeed: 0.45, drag: 2.2 },
    boost: { add: 260, cap: 1.45, time: 1.1 },
    nitro: { burn: 38, refill: 7, speed: 1.4, accel: 1.8 },
    rewards: [[60, 130], [35, 90], [20, 65], [10, 40]],
  };

  const CARS = {
    coupe: { name: 'Pixel Coupe', color: '#2f8cff', max: 430, accel: 330, turn: 2.7, grip: 6.5, premium: false, blurb: 'Balanced and forgiving.' },
    runner: { name: 'Street Runner', color: '#3fd08a', max: 410, accel: 400, turn: 2.9, grip: 7, premium: false, blurb: 'Quick off the line, corners well.' },
    falcon: { name: 'Falcon GT', color: '#ff3d5a', max: 500, accel: 400, turn: 2.9, grip: 8, premium: true, blurb: 'Premium: top speed and grip.' },
    thunder: { name: 'Thunder V8', color: '#ffc940', max: 540, accel: 370, turn: 2.5, grip: 6.5, premium: true, blurb: 'Premium: the fastest straight-line car.' },
  };

  const TRACKS = {
    downtown: { name: 'Downtown Loop', ground: '#2b6b3a', pts: [[400, 400], [1300, 300], [2200, 400], [2350, 800], [2200, 1300], [1700, 1400], [1500, 1150], [1250, 1450], [700, 1450], [350, 1200], [300, 800]] },
    harbor: { name: 'Harbor Sprint', ground: '#236a8c', pts: [[300, 900], [500, 400], [1000, 300], [1300, 600], [1700, 350], [2300, 400], [2400, 900], [2000, 1100], [2300, 1500], [1600, 1650], [1100, 1300], [700, 1600], [350, 1400]] },
    highway: { name: 'Sky Highway', ground: '#3a3150', pts: [[300, 700], [900, 350], [1800, 300], [2600, 450], [2750, 900], [2500, 1300], [1800, 1350], [1500, 1000], [1300, 1350], [600, 1450], [300, 1150]] },
  };

  function genTrack(seed) {
    const r = U.rng(seed);
    const n = 9 + Math.floor(r() * 4);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rad = 520 + r() * 380;
      pts.push([1400 + Math.cos(a) * rad * 1.5, 950 + Math.sin(a) * rad]);
    }
    return { name: 'Custom Circuit', ground: '#2b5a4a', pts };
  }

  /** Closed Catmull-Rom spline -> dense path with cumulative distance. */
  function buildPath(ctrl) {
    const out = [];
    const n = ctrl.length;
    const cr = (p0, p1, p2, p3, t) => {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    };
    for (let i = 0; i < n; i++) {
      const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
      const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const steps = Math.max(8, Math.round(segLen / 24));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        out.push({ x: cr(p0[0], p1[0], p2[0], p3[0], t), y: cr(p0[1], p1[1], p2[1], p3[1], t) });
      }
    }
    let d = 0;
    for (let i = 0; i < out.length; i++) {
      out[i].d = d;
      const nx = out[(i + 1) % out.length];
      d += Math.hypot(nx.x - out[i].x, nx.y - out[i].y);
    }
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length], b = out[(i + 1) % out.length];
      out[i].a = Math.atan2(b.y - a.y, b.x - a.x);
    }
    return { pts: out, total: d };
  }

  BF.GameModules.register('racing', {
    maxBots: 5,
    actions: { gas: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown', 'Space'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], nitro: ['ShiftLeft', 'ShiftRight'] },
    controls: { joystick: true, buttons: [{ act: 'gas', label: 'Gas', icon: 'chevronUp' }, { act: 'brake', label: 'Brake', icon: 'chevronDown' }, { act: 'nitro', label: 'Nitro', icon: 'rocket' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const custom = !!ctx.config.custom;
      const diff = { easy: 0.9, normal: 1, hard: 1.07 }[ctx.difficulty] || 1;
      const glow = ctx.hasItem('tool_underglow');
      const parts = new BF.Particles(600);
      const cam = new BF.Camera(W, H);
      let phase = 'lobby';
      let trackId = custom ? 'custom' : ctx.data.lastTrack || 'downtown';
      let carId = ctx.data.lastCar && CARS[ctx.data.lastCar] && (!CARS[ctx.data.lastCar].premium || ctx.hasPass('premium_garage')) ? ctx.data.lastCar : 'coupe';
      let track = null, path = null, cps = [], pads = [], decor = [];
      let cars = [];
      let countdown = 0;
      let raceT = 0;
      let finishOrder = [];
      let endT = 0;
      let nitro = 100;
      ctx.data.bestTimes = ctx.data.bestTimes || {};

      function setupTrack() {
        track = trackId === 'custom' ? genTrack(ctx.config.seed || 5) : TRACKS[trackId];
        path = buildPath(track.pts);
        cps = [];
        for (let k = 0; k < T.checkpoints; k++) cps.push((k * path.total) / T.checkpoints);
        pads = [];
        const r = U.rng((ctx.config.seed || 1) + trackId);
        for (let k = 0; k < 5; k++) {
          const d = path.total * (0.12 + k * 0.18 + r() * 0.05);
          const p = nearestByDist(d);
          pads.push({ x: p.x + Math.cos(p.a + Math.PI / 2) * (r() - 0.5) * 60, y: p.y + Math.sin(p.a + Math.PI / 2) * (r() - 0.5) * 60, a: p.a });
        }
        decor = [];
        let tries = 0;
        while (decor.length < 90 && tries++ < 3000) {
          const x = r() * 3100 - 100, y = r() * 2000 - 100;
          if (distToPath(x, y) > T.width * 0.9) decor.push({ x, y, s: 20 + r() * 50, kind: r() < 0.55 ? 'tree' : 'block', c: U.pick(['#3b4a6b', '#4b3b6b', '#2e5a6b', '#5a3b4b', '#6b5a3b'], r) });
        }
        cam.bounds = { x: -200, y: -200, w: 3200, h: 2100 };
      }

      function nearestByDist(d) {
        d = ((d % path.total) + path.total) % path.total;
        let lo = 0;
        for (let i = 0; i < path.pts.length; i++) if (path.pts[i].d <= d) lo = i;
        return path.pts[lo];
      }

      function distToPath(x, y) {
        let best = 1e9;
        for (let i = 0; i < path.pts.length; i += 3) {
          const p = path.pts[i];
          const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
          if (d < best) best = d;
        }
        return Math.sqrt(best);
      }

      function locate(car) {
        const n = path.pts.length;
        let best = car.seg, bd = 1e12;
        for (let k = -12; k <= 40; k++) {
          const i = (car.seg + k + n) % n;
          const p = path.pts[i];
          const d = (p.x - car.x) * (p.x - car.x) + (p.y - car.y) * (p.y - car.y);
          if (d < bd) { bd = d; best = i; }
        }
        car.seg = best;
        car.off = Math.sqrt(bd) > T.width / 2;
        return path.pts[best].d;
      }

      function makeCar(src, isPlayer, slot) {
        const spec = isPlayer ? CARS[carId] : U.pick([CARS.coupe, CARS.runner, CARS.runner, CARS.coupe]);
        const skill = isPlayer ? 1 : U.clamp(src.skill, 0.2, 0.98);
        const start = nearestByDist(40 + slot * 55);
        const side = slot % 2 ? 1 : -1;
        const perp = start.a + Math.PI / 2;
        return {
          id: isPlayer ? 'me' : src.id,
          name: isPlayer ? ctx.player.name : src.displayName,
          bot: src, isPlayer,
          spec, color: isPlayer ? spec.color : U.pick(['#ff7a2e', '#b67cff', '#ffd23f', '#39f3ff', '#ff4f9a', '#4ad17f', '#e8ecf3']),
          x: start.x + Math.cos(perp) * side * 32, y: start.y + Math.sin(perp) * side * 32,
          a: start.a, vx: 0, vy: 0, speed: 0, steer: 0,
          seg: path.pts.indexOf(start), along: start.d, prevAlong: start.d,
          lap: 0, cpNext: 1, lapStart: 0, lapTimes: [], finished: false, finishT: 0,
          boostT: 0, offLap: false, off: false, r: 16,
          skill, maxF: isPlayer ? 1 : (0.82 + skill * 0.17) * diff, wobble: Math.random() * 10,
        };
      }

      function setupRace() {
        setupTrack();
        const racers = ctx.bots.slice(0, 5);
        cars = [makeCar(null, true, racers.length)].concat(racers.map((b, i) => makeCar(b, false, i)));
        finishOrder = [];
        raceT = 0;
        countdown = T.countdown;
        nitro = 100;
        phase = 'countdown';
        ctx.banner(track.name, T.laps + ' laps', 1500);
        racers.slice(0, 2).forEach((b) => ctx.botSay(b, 'start', 400 + Math.random() * 1400));
      }

      function physics(car, throttle, brake, steer, dt, useNitro) {
        const sp = car.spec;
        let max = sp.max * car.maxF;
        let acc = sp.accel;
        if (useNitro) { max *= T.nitro.speed; acc *= T.nitro.accel; }
        if (car.boostT > 0) { car.boostT -= dt; max *= T.boost.cap; }
        if (car.off) max *= T.offTrack.maxSpeed;
        if (throttle) car.speed += acc * dt;
        if (brake) car.speed -= (car.speed > 0 ? acc * 1.6 : acc * 0.6) * dt;
        car.speed -= car.speed * (car.off ? T.offTrack.drag : 0.35) * dt;
        if (car.speed > max) car.speed = U.lerp(car.speed, max, Math.min(1, dt * 3));
        car.speed = Math.max(-140, car.speed);
        const turnF = Math.min(1, Math.abs(car.speed) / 180);
        car.steer = U.lerp(car.steer, steer, Math.min(1, dt * 12));
        car.a += car.steer * sp.turn * turnF * dt * Math.sign(car.speed || 1);
        const hx = Math.cos(car.a) * car.speed, hy = Math.sin(car.a) * car.speed;
        const grip = Math.min(1, sp.grip * dt * (car.off ? 0.6 : 1));
        car.vx = U.lerp(car.vx, hx, grip);
        car.vy = U.lerp(car.vy, hy, grip);
        car.x += car.vx * dt;
        car.y += car.vy * dt;
        car.x = U.clamp(car.x, -150, 3100);
        car.y = U.clamp(car.y, -150, 2050);
        const slip = Math.hypot(car.vx - hx, car.vy - hy);
        if (slip > 70 && Math.random() < 0.6) parts.emit(car.x - Math.cos(car.a) * 14, car.y - Math.sin(car.a) * 14, { count: 1, color: 'rgba(220,220,220,.5)', speed: 20, life: 0.6, size: 7 });
        if (car.off && Math.abs(car.speed) > 80 && Math.random() < 0.5) parts.emit(car.x, car.y, { count: 1, color: '#6b4f2a', speed: 40, life: 0.4, size: 5 });
        for (const p of pads) {
          if (U.dist(car.x, car.y, p.x, p.y) < 34 && car.boostT <= 0.2) {
            car.boostT = T.boost.time;
            car.speed += T.boost.add;
            if (car.isPlayer) { ctx.sfx('boost'); cam.shake(3, 0.2); }
            parts.emit(car.x, car.y, { count: 10, colors: ['#39f3ff', '#ffffff'], speed: 120, life: 0.4 });
          }
        }
      }

      function progress(car) {
        car.prevAlong = car.along;
        car.along = locate(car);
        if (car.off) car.offLap = true;
        const cpD = cps[car.cpNext];
        if (car.cpNext < T.checkpoints && car.prevAlong < cpD && car.along >= cpD && car.along - car.prevAlong < path.total / 3) {
          car.cpNext++;
        }
        if (car.prevAlong > path.total * 0.8 && car.along < path.total * 0.2) {
          if (car.cpNext >= T.checkpoints) {
            car.lap++;
            car.cpNext = 1;
            const lt = raceT - car.lapStart;
            car.lapTimes.push(lt);
            car.lapStart = raceT;
            if (car.isPlayer) {
              if (!car.offLap) ctx.badge('sr_clean');
              const key = trackId;
              const better = !ctx.data.bestTimes[key] || lt * 1000 < ctx.data.bestTimes[key];
              if (better) { ctx.data.bestTimes[key] = Math.round(lt * 1000); ctx.save(); }
              if (car.lap < T.laps) ctx.banner('LAP ' + (car.lap + 1) + '/' + T.laps, U.fmtTime(lt * 1000) + (better ? ' · new best lap!' : ''), 1400);
              ctx.sfx('go', { vol: 0.5 });
            }
            car.offLap = false;
            if (car.lap >= T.laps && !car.finished) {
              car.finished = true;
              car.finishT = raceT;
              finishOrder.push(car);
              if (car.isPlayer) onPlayerFinish(car);
              else if (finishOrder.length === 1) ctx.feed(car.name + ' won the race!', 'star', '#ffd66b');
            }
          }
        }
      }

      function score(car) {
        return car.finished ? 1e9 - car.finishT : car.lap * path.total + car.along;
      }

      function standings() {
        return cars.slice().sort((a, b) => score(b) - score(a));
      }

      function onPlayerFinish(car) {
        const pos = finishOrder.indexOf(car) + 1;
        ctx.banner(pos === 1 ? 'YOU WIN!' : U.ordinal(pos).toUpperCase(), 'Finish time ' + U.fmtTime(car.finishT * 1000), 2200);
        phase = 'finished';
        endT = 3;
      }

      function finish() {
        phase = 'over';
        const me = cars[0];
        const order = standings();
        const pos = order.indexOf(me) + 1;
        const rw = T.rewards[Math.min(pos - 1, 3)];
        const total = Math.round(me.finishT * 1000);
        let bestNote = '';
        if (trackId === 'downtown' && me.finished && ctx.best('bestTime', total, 'min')) bestNote = 'New personal best on Downtown Loop!';
        if (pos <= 3) ctx.badge('sr_podium');
        if (pos === 1) {
          ctx.badge('sr_winner');
          ctx.quest('race_win', 1);
          ctx.playerStat('racesWon', 1);
          if (!ctx.hasItem('col_chequered_plate')) ctx.collectible('col_chequered_plate');
        }
        order.slice(0, 2).forEach((c) => { if (!c.isPlayer && Math.random() < 0.6) ctx.botSay(c.bot, order.indexOf(c) === 0 ? 'win' : 'lose'); });
        const bestLap = me.lapTimes.length ? Math.min(...me.lapTimes) : null;
        ctx.end({
          outcome: pos === 1 ? 'win' : 'lose',
          title: pos === 1 ? 'Victory!' : U.ordinal(pos) + ' place',
          subtitle: track.name + ' · ' + CARS[carId].name,
          best: bestNote,
          coins: rw[0], xp: rw[1],
          stats: [['Position', U.ordinal(pos) + ' of ' + cars.length], ['Race time', me.finished ? U.fmtTime(total) : 'DNF'], ['Best lap', bestLap ? U.fmtTime(bestLap * 1000) : '—'], ['Track record', ctx.data.bestTimes[trackId] ? U.fmtTime(ctx.data.bestTimes[trackId]) : '—']],
        });
      }

      function ai(car, dt) {
        const n = path.pts.length;
        const look = 6 + Math.round(Math.abs(car.speed) / 55);
        const tgt = path.pts[(car.seg + look) % n];
        const far = path.pts[(car.seg + look * 2 + 6) % n];
        car.wobble += dt;
        const off = car.bot.personality === 'chaotic' ? Math.sin(car.wobble * 1.7) * 40 : Math.sin(car.wobble * 0.5) * 18 * (1 - car.skill);
        const tx = tgt.x + Math.cos(tgt.a + Math.PI / 2) * off, ty = tgt.y + Math.sin(tgt.a + Math.PI / 2) * off;
        const want = Math.atan2(ty - car.y, tx - car.x);
        const diffA = U.wrapAngle(want - car.a);
        const bend = Math.abs(U.wrapAngle(far.a - tgt.a));
        const me = cars[0];
        const gap = score(me) - score(car);
        const rubber = gap > 600 ? 1.05 : gap < -900 ? 0.96 : 1;
        car.maxF = (0.82 + car.skill * 0.17) * diff * rubber;
        const brake = bend > 0.9 - car.skill * 0.25 && Math.abs(car.speed) > car.spec.max * 0.55;
        physics(car, !brake, brake, U.clamp(diffA * 2.2, -1, 1), dt, false);
      }

      function carCollisions() {
        for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
          const a = cars[i], b = cars[j];
          const A = { x: a.x, y: a.y, vx: a.vx, vy: a.vy, r: a.r, m: 1 }, B = { x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r, m: 1 };
          if (BF.phys.bounceCircles(A, B, 0.3)) {
            a.x = A.x; a.y = A.y; b.x = B.x; b.y = B.y;
            a.speed *= 0.92; b.speed *= 0.92;
            if (a.isPlayer || b.isPlayer) ctx.sfx('hit', { vol: 0.4 });
          }
        }
      }

      // ---------------------------------------------------------------- lobby
      function lobby() {
        const prem = ctx.hasPass('premium_garage');
        ctx.ui.panel('lobby', '<h3>' + BF.icon('flag', 18) + ' ' + U.esc(ctx.game.name) + '</h3><p>' + T.laps + ' laps. Pass every checkpoint in order. Hit the cyan boost pads for a burst of speed.' + (ctx.hasPass('nitro') ? ' Hold Shift for nitro.' : '') + '</p>' +
          (custom ? '' : '<h4>Track</h4><div class="gp-grid">' + Object.entries(TRACKS).map(([k, t]) => '<button class="gp-card' + (trackId === k ? ' on' : '') + '" data-gact="track-' + k + '"><b>' + t.name + '</b><small>Best lap: ' + (ctx.data.bestTimes[k] ? U.fmtTime(ctx.data.bestTimes[k]) : '—') + '</small></button>').join('') + '</div>') +
          '<h4>Car</h4><div class="gp-grid">' + Object.entries(CARS).map(([k, c]) => {
            const locked = c.premium && !prem;
            return '<button class="gp-card' + (carId === k ? ' on' : '') + (locked ? ' locked' : '') + '" data-gact="car-' + k + '"><b>' + BF.icon(locked ? 'lock' : 'rocket', 13) + ' ' + c.name + '</b><small>' + c.blurb + ' Top ' + Math.round(c.max / 2.2) + ' km/h</small></button>';
          }).join('') + '</div><div class="gp-actions">' + (!prem ? '<button class="btn btn-outline" data-gact="buy-garage">' + BF.icon('ticket', 13) + 'Premium Garage</button>' : '') + (!ctx.hasPass('nitro') ? '<button class="btn btn-outline" data-gact="buy-nitro">' + BF.icon('ticket', 13) + 'Nitro Pack</button>' : '') + '<button class="btn btn-play btn-lg" data-gact="start">' + BF.icon('play', 15) + 'Start race</button></div>', 'center');
      }
      ctx.ui.on((a) => {
        if (a.indexOf('track-') === 0) { trackId = a.slice(6); lobby(); }
        if (a.indexOf('car-') === 0) {
          const k = a.slice(4);
          if (CARS[k].premium && !ctx.hasPass('premium_garage')) { BF.actions.run('buy-pass', null, null, { pass: 'sr_premium_garage' }); return; }
          carId = k;
          lobby();
        }
        if (a === 'buy-garage') BF.actions.run('buy-pass', null, null, { pass: 'sr_premium_garage' });
        if (a === 'buy-nitro') BF.actions.run('buy-pass', null, null, { pass: 'sr_nitro' });
        if (a === 'start') {
          ctx.data.lastTrack = trackId;
          ctx.data.lastCar = carId;
          ctx.save();
          ctx.ui.remove('lobby');
          setupRace();
        }
      });
      const offPass = BF.bus.on('pass:purchased', () => { if (phase === 'lobby') lobby(); });
      setupTrack();
      lobby();

      // ---------------------------------------------------------------- draw
      function drawCar(g, c) {
        g.save();
        g.translate(c.x, c.y);
        g.rotate(c.a);
        if (c.isPlayer && glow) { g.globalAlpha = 0.5; G.circle(g, 0, 0, 30, '#39f3ff'); g.globalAlpha = 1; }
        G.shadow(g, 2, 4, 22, 12, 0.35);
        G.fillRR(g, -20, -11, 40, 22, 6, c.color);
        G.fillRR(g, -6, -9, 14, 18, 3, 'rgba(160,230,255,.85)');
        G.fillRR(g, -18, -9, 8, 18, 2, U.shade(c.color, -0.25));
        g.fillStyle = '#15151c';
        g.fillRect(-15, -13, 9, 4); g.fillRect(6, -13, 9, 4); g.fillRect(-15, 9, 9, 4); g.fillRect(6, 9, 9, 4);
        g.fillStyle = '#fff4b0';
        g.fillRect(17, -9, 3, 5); g.fillRect(17, 4, 3, 5);
        if (c.boostT > 0 || (c.isPlayer && c.nitroOn)) { g.fillStyle = '#39f3ff'; g.beginPath(); g.moveTo(-20, -6); g.lineTo(-34 - Math.random() * 10, 0); g.lineTo(-20, 6); g.fill(); }
        g.restore();
        G.nameTag(g, c.x, c.y - 22, c.name, c.isPlayer ? '#ffb454' : '#fff');
        const b = ctx.bubbleText(c.id);
        if (b) G.bubble(g, c.x, c.y - 40, b);
      }

      function drawTrack(g) {
        g.fillStyle = track.ground;
        g.fillRect(cam.x, cam.y, W, H);
        g.fillStyle = 'rgba(255,255,255,.035)';
        const gx = Math.floor(cam.x / 80) * 80, gy = Math.floor(cam.y / 80) * 80;
        for (let x = gx; x < cam.x + W; x += 80) for (let y = gy; y < cam.y + H; y += 80) if (((x + y) / 80) % 2 === 0) g.fillRect(x, y, 80, 80);
        const stroke = (w, color, dash) => {
          g.beginPath();
          path.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
          g.closePath();
          g.lineWidth = w;
          g.strokeStyle = color;
          g.lineJoin = 'round';
          g.setLineDash(dash || []);
          g.stroke();
          g.setLineDash([]);
        };
        stroke(T.width + 16, '#e8ecf1', [22, 22]);
        stroke(T.width + 14, 'rgba(214,56,74,.9)', [22, 22]);
        stroke(T.width, '#3a3f4b');
        stroke(3, 'rgba(255,255,255,.35)', [30, 30]);
        // start line
        const s = path.pts[0];
        g.save();
        g.translate(s.x, s.y);
        g.rotate(s.a);
        for (let i = -6; i < 6; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#fff' : '#111'; g.fillRect(j * 12 - 12, i * 12.5, 12, 12.5); }
        g.restore();
        // pads
        for (const p of pads) {
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.a);
          G.fillRR(g, -26, -20, 52, 40, 8, 'rgba(57,243,255,.25)');
          g.strokeStyle = '#39f3ff';
          g.lineWidth = 4;
          for (let k = 0; k < 2; k++) { g.beginPath(); g.moveTo(-14 + k * 14, -12); g.lineTo(-2 + k * 14, 0); g.lineTo(-14 + k * 14, 12); g.stroke(); }
          g.restore();
        }
        for (const d of decor) {
          if (!cam.visible(d.x, d.y, 80)) continue;
          if (d.kind === 'tree') { G.circle(g, d.x + 4, d.y + 6, d.s * 0.45, 'rgba(0,0,0,.25)'); G.circle(g, d.x, d.y, d.s * 0.45, '#2f8f47'); G.circle(g, d.x - d.s * 0.12, d.y - d.s * 0.12, d.s * 0.22, '#4ab360'); }
          else { G.fillRR(g, d.x + 6, d.y + 8, d.s, d.s, 4, 'rgba(0,0,0,.3)'); G.fillRR(g, d.x, d.y, d.s, d.s, 4, d.c); G.fillRR(g, d.x + 4, d.y + 4, d.s - 8, d.s - 8, 3, U.shade(d.c, 0.15)); }
        }
      }

      function drawMinimap(g) {
        const mw = 170, mh = 110, mx = W - mw - 10, my = 10;
        G.panel(g, mx, my, mw, mh, 0.7);
        const sx = (mw - 16) / 3000, sy = (mh - 16) / 1900;
        g.beginPath();
        path.pts.forEach((p, i) => { const x = mx + 8 + p.x * sx, y = my + 8 + p.y * sy; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.closePath();
        g.strokeStyle = 'rgba(255,255,255,.55)';
        g.lineWidth = 3;
        g.stroke();
        for (const c of cars) G.circle(g, mx + 8 + c.x * sx, my + 8 + c.y * sy, c.isPlayer ? 4 : 3, c.isPlayer ? '#ffb454' : c.color);
      }

      function drawHud(g) {
        const me = cars[0];
        const order = standings();
        const pos = order.indexOf(me) + 1;
        G.panel(g, 10, 10, 200, 92);
        G.display(g, U.ordinal(pos), 60, 44, 34, pos === 1 ? '#ffd66b' : '#fff');
        G.text(g, '/ ' + cars.length, 100, 50, { size: 16, color: '#a1abbb' });
        G.text(g, 'Lap ' + Math.min(T.laps, me.lap + 1) + '/' + T.laps, 20, 80, { size: 13, color: '#fff', weight: 700 });
        G.text(g, U.fmtTime((raceT - me.lapStart) * 1000), 200, 80, { size: 13, align: 'right', color: '#cfd6e2' });
        G.text(g, 'Best ' + (ctx.data.bestTimes[trackId] ? U.fmtTime(ctx.data.bestTimes[trackId]) : '—'), 200, 96, { size: 11, align: 'right', color: '#8b95a7' });
        G.panel(g, 10, H - 58, 170, 48);
        G.text(g, Math.round(Math.abs(me.speed) / 2.2) + ' km/h', 22, H - 26, { size: 22, color: '#fff', weight: 800 });
        if (ctx.hasPass('nitro')) {
          G.text(g, 'NITRO', 196, H - 44, { size: 11, color: '#39f3ff', weight: 800 });
          G.bar(g, 196, H - 36, 120, 10, nitro / 100, '#39f3ff');
        }
        if (me.off) G.text(g, 'Off track!', W / 2, H - 30, { size: 16, align: 'center', color: '#ff9d5c', stroke: 'rgba(0,0,0,.6)' });
        drawMinimap(g);
        // standings list
        G.panel(g, W - 180, 128, 170, 14 + order.length * 17);
        order.forEach((c, i) => G.text(g, (i + 1) + '. ' + c.name.slice(0, 15) + (c.finished ? ' ✓' : ''), W - 170, 146 + i * 17, { size: 11.5, color: c.isPlayer ? '#ffb454' : '#e8ecf3', weight: c.isPlayer ? 800 : 600 }));
        if (phase === 'countdown') G.display(g, countdown > 0.05 ? String(Math.ceil(countdown)) : 'GO!', W / 2, H / 2 - 40, 80, '#ffd66b');
      }

      return {
        update(dt) {
          parts.update(dt);
          if (phase === 'lobby' || phase === 'over') { if (path) cam.follow(path.pts[0].x, path.pts[0].y, dt, 0.05); return; }
          const me = cars[0];
          if (phase === 'countdown') {
            const prev = Math.ceil(countdown);
            countdown -= dt;
            if (Math.ceil(countdown) !== prev && countdown > 0) ctx.sfx('beep');
            if (countdown <= 0) { phase = 'race'; ctx.sfx('go'); }
            cam.follow(me.x + Math.cos(me.a) * 120, me.y + Math.sin(me.a) * 120, dt, 0.2);
            return;
          }
          raceT += dt;
          const inp = ctx.input;
          if (!me.finished) {
            const ax = inp.axis();
            const steer = inp.joy.active ? ax.x : (inp.act('left') ? -1 : 0) + (inp.act('right') ? 1 : 0);
            const gas = inp.act('gas') || (inp.joy.active && ax.y < -0.3);
            const brake = inp.act('brake') || (inp.joy.active && ax.y > 0.5);
            me.nitroOn = ctx.hasPass('nitro') && inp.act('nitro') && nitro > 1 && gas;
            if (me.nitroOn) { nitro = Math.max(0, nitro - T.nitro.burn * dt); if (Math.random() < 0.7) parts.emit(me.x - Math.cos(me.a) * 22, me.y - Math.sin(me.a) * 22, { count: 2, colors: ['#39f3ff', '#b3f7ff'], speed: 60, life: 0.35, size: 5 }); }
            else nitro = Math.min(100, nitro + T.nitro.refill * dt);
            physics(me, gas, brake, steer, dt, me.nitroOn);
          } else physics(me, false, true, 0, dt, false);
          for (let i = 1; i < cars.length; i++) {
            if (cars[i].finished) physics(cars[i], false, true, 0, dt, false);
            else ai(cars[i], dt);
          }
          carCollisions();
          cars.forEach(progress);
          cam.follow(me.x + me.vx * 0.35, me.y + me.vy * 0.35, dt, 0.12);
          if (phase === 'finished') { endT -= dt; if (endT <= 0) finish(); }
        },
        draw(g) {
          g.fillStyle = '#0b0e13';
          g.fillRect(0, 0, W, H);
          if (!path) return;
          g.save();
          cam.apply(g);
          drawTrack(g);
          parts.draw(g);
          for (const c of cars.slice().reverse()) drawCar(g, c);
          g.restore();
          if (phase !== 'lobby' && phase !== 'over' && cars.length) drawHud(g);
          if (phase === 'lobby') { g.fillStyle = 'rgba(6,8,12,.5)'; g.fillRect(0, 0, W, H); }
        },
        onBotJoin() { /* joins the next race from the lobby */ },
        onBotLeave(bot) {
          cars = cars.filter((c) => c.id !== bot.id);
        },
        destroy() { offPass(); },
      };
    },
  });
})((window.BF = window.BF || {}));
