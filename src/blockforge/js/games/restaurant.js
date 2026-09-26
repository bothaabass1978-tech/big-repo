/**
 * Restaurant (gameType "restaurant") — a kitchen shift. Customers (the other
 * players on the server) sit at the counter with an order. Collect the
 * ingredients from the stations in the right order, cook what needs cooking
 * (without burning it) and serve before their patience runs out. Tips reward
 * speed; hit the shift goal to win.
 *
 * Variants (config.variant): pizza, burger, sushi, icecream, taco.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  const T = {
    time: 180, speed: 220, reach: 74, serveReach: 125, seats: 4, arrive: [5, 9], patience: 44, trayMax: 6,
    cook: 4.5, burn: 5, grill: 3.5, grillBurn: 5, tip: 0.6,
    rewards: { play: 12, win: 45, per: 0.03, xpPlay: 25, xpWin: 90 },
  };

  // stations: [key, label, colour, kind] kind: 'item' gives an ingredient; 'cook' is the dish oven; 'grill' cooks one ingredient
  const VARIANTS = {
    pizza: { preset: 'indoor', floor: '#e8d8c0', wall: '#c85a3a', goal: 700, price: 60, dishCook: true, dish: 'Pizza',
      stations: [['dough', 'Dough', '#f4e1b0'], ['sauce', 'Sauce', '#d8382a'], ['cheese', 'Cheese', '#ffd23f'], ['pepperoni', 'Pepperoni', '#b8322a'], ['mushroom', 'Mushroom', '#c8b89a'], ['pepper', 'Pepper', '#3fbf4a']],
      make: (r) => ['dough', 'sauce', 'cheese', U.pick(['pepperoni', 'mushroom', 'pepper'], r)] },
    burger: { preset: 'indoor', floor: '#d8e0e8', wall: '#3a7bd5', goal: 700, price: 55, grill: 'patty', dish: 'Burger',
      stations: [['bun', 'Bun', '#e0a85a'], ['patty', 'Raw Patty', '#c86a6a'], ['cheese', 'Cheese', '#ffd23f'], ['lettuce', 'Lettuce', '#6fd66b'], ['tomato', 'Tomato', '#e03e3e']],
      make: (r) => { const mid = U.shuffle(['cheese', 'lettuce', 'tomato'], r).slice(0, 1 + Math.floor(r() * 2)); return ['bun', 'patty*'].concat(mid).concat(['bun']); } },
    sushi: { preset: 'indoor', floor: '#e8e0d0', wall: '#2a2a2a', goal: 650, price: 58, dishCook: 'roll', dish: 'Sushi',
      stations: [['rice', 'Rice', '#ffffff'], ['nori', 'Nori', '#1f3a2a'], ['salmon', 'Salmon', '#ff8a5c'], ['tuna', 'Tuna', '#d8384a'], ['cucumber', 'Cucumber', '#6fd66b']],
      make: (r) => ['rice', 'nori', U.pick(['salmon', 'tuna', 'cucumber'], r)] },
    icecream: { preset: 'day', floor: '#fff0f6', wall: '#ff9fc7', goal: 650, price: 40, melt: true, dish: 'Ice Cream',
      stations: [['cone', 'Cone', '#e0a85a'], ['vanilla', 'Vanilla', '#fff4d6'], ['chocolate', 'Chocolate', '#6b3a1f'], ['strawberry', 'Strawberry', '#ff7aa8'], ['mint', 'Mint', '#9fefc8'], ['sprinkles', 'Sprinkles', '#b67cff']],
      make: (r) => ['cone'].concat(Array.from({ length: 1 + Math.floor(r() * 3) }, () => U.pick(['vanilla', 'chocolate', 'strawberry', 'mint'], r))).concat(r() < 0.5 ? ['sprinkles'] : []) },
    taco: { preset: 'sunset', floor: '#e8c89a', wall: '#2a9a6a', goal: 650, price: 50, grill: 'tortilla', dish: 'Taco',
      stations: [['tortilla', 'Tortilla', '#f4d890'], ['beef', 'Beef', '#8a4a2a'], ['beans', 'Beans', '#6a3a2a'], ['salsa', 'Salsa', '#e03e3e'], ['cheese', 'Cheese', '#ffd23f'], ['lettuce', 'Lettuce', '#6fd66b']],
      make: (r) => ['tortilla*', U.pick(['beef', 'beans'], r), 'salsa'].concat(r() < 0.6 ? [U.pick(['cheese', 'lettuce'], r)] : []) },
  };

  BF.GameModules.register('restaurant', {
    three: true,
    maxBots: 3,
    feedTop: 0.26,
    orders: ['follow', 'come', 'stay', 'leave', 'help'],
    actions: { use: ['KeyE', 'Space'], bin: ['KeyQ'] },
    controls: { joystick: true, buttons: [{ act: 'use', label: 'Use', icon: 'hammer' }, { act: 'bin', label: 'Bin', icon: 'trash' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H, K = BF.arcade;
      const VAR = K.variant(ctx, VARIANTS);
      const V = ctx.g3;
      const rng = U.rng('kitchen:' + ctx.gameId + ':' + Date.now());
      const MAPW = 1000, MAPH = 720;
      const info = {};
      const stations = VAR.stations.map((s, i) => { info[s[0]] = { label: s[1], color: s[2] }; return { key: s[0], label: s[1], color: s[2], kind: 'item', x: 140 + i * (720 / Math.max(1, VAR.stations.length - 1)), y: 130 }; });
      info[(VAR.grill || 'x') + '*'] = { label: 'Cooked ' + (info[VAR.grill] ? info[VAR.grill].label.replace('Raw ', '') : ''), color: '#8a4a2a' };
      if (VAR.dishCook) stations.push({ key: 'oven', label: VAR.dishCook === 'roll' ? 'Rolling Mat' : 'Oven', color: VAR.dishCook === 'roll' ? '#b07a45' : '#5a5f6a', kind: 'cook', x: 880, y: 330, slot: null });
      if (VAR.grill) stations.push({ key: 'grill', label: 'Grill', color: '#39414f', kind: 'grill', x: 880, y: 330, slot: null });
      stations.push({ key: 'bin', label: 'Bin', color: '#6b7486', kind: 'bin', x: 110, y: 360 });
      const seats = Array.from({ length: T.seats }, (_, i) => ({ i, x: 250 + i * 170, y: 600, c: null }));
      const me = { x: 500, y: 380, a: -Math.PI / 2, walk: 0, tray: [], cooked: false, burnt: false, earned: 0, served: 0, angry: 0 };
      const helpers = K.crew(ctx, 3, (i) => ({ x: 300 + i * 200, y: 460, t: 8 + i * 3, tx: 0, ty: 0 }));
      let time = T.time, phase = 'play', nextArrive = 1.2, flash = null;
      const patience = T.patience * (ctx.hasPass('patient') ? 1.3 : 1) * (VAR.melt ? 0.8 : 1);
      ctx.banner(ctx.game.name, 'Serve ' + U.fmt(VAR.goal) + ' worth of orders this shift', 2400);

      function customerBot() {
        const busy = new Set(seats.filter((s) => s.c).map((s) => s.c.bot && s.c.bot.id));
        const pool = ctx.allBots.filter((b) => !busy.has(b.id) && !helpers.some((h) => h.bot.id === b.id));
        return pool.length ? U.pick(pool, rng) : U.pick(BF.bots.list.slice(0, 400), rng);
      }
      function arrive() {
        const free = seats.filter((s) => !s.c);
        if (!free.length) return;
        const seat = U.pick(free, rng);
        const order = VAR.make(rng);
        seat.c = { bot: customerBot(), order, wait: patience, max: patience, walkIn: 1 };
        if (rng() < 0.3) ctx.botText(seat.c.bot, U.pick(['one ' + VAR.dish.toLowerCase() + ' pls', 'im starving', 'hiii can i order', 'make it quick lol', 'extra ' + info[order[order.length - 1].replace('*', '')].label.toLowerCase() + ' pls']), 600);
      }
      const nearest = (list, r) => { let best = null, bd = r || T.reach; for (const s of list) { const d = Math.hypot(s.x - me.x, s.y - me.y); if (d < bd) { bd = d; best = s; } } return best; };
      function msg(t) { flash = { t, time: 1.8 }; ctx.sfx('error'); }
      function same(a, b) { return a.length === b.length && a.every((x, i) => x === b[i]); }
      function use() {
        const seat = nearest(seats.filter((s) => s.c), T.serveReach);
        if (seat && me.tray.length) return serve(seat);
        const st = nearest(stations);
        if (!st) return;
        if (st.kind === 'bin') { if (me.tray.length) { me.tray = []; me.cooked = me.burnt = false; ctx.sfx('swing'); } return; }
        if (st.kind === 'item') {
          if (me.cooked) return msg('Serve this one first, or bin it');
          if (me.tray.length >= T.trayMax) return msg('Your hands are full');
          if (VAR.grill && st.key === VAR.grill) { // raw item: straight to the grill
            const grill = stations.find((s) => s.kind === 'grill');
            if (grill.slot) return msg('The grill is busy');
            grill.slot = { t: 0 }; ctx.sfx('build'); ctx.feed(st.label + ' on the grill', 'star', '#ffb454'); return;
          }
          me.tray.push(st.key); ctx.sfx('pickup'); return;
        }
        if (st.kind === 'grill') {
          if (!st.slot) return msg('Grab a ' + info[VAR.grill].label.toLowerCase() + ' from its station first');
          if (st.slot.t < T.grill) return msg('Still cooking...');
          if (st.slot.t > T.grill + T.grillBurn) { st.slot = null; ctx.sfx('lose'); return msg('Burnt! Binned it.'); }
          if (me.tray.length >= T.trayMax) return msg('Your hands are full');
          me.tray.push(VAR.grill + '*'); st.slot = null; ctx.sfx('pickup'); return;
        }
        if (st.kind === 'cook') {
          if (st.slot) {
            if (st.slot.t < T.cook) return msg(VAR.dishCook === 'roll' ? 'Still rolling...' : 'Still baking...');
            if (me.tray.length) return msg('Put that down first');
            me.tray = st.slot.tray; me.cooked = true; me.burnt = VAR.dishCook !== 'roll' && st.slot.t > T.cook + T.burn; st.slot = null;
            ctx.sfx(me.burnt ? 'lose' : 'pickup'); if (me.burnt) msg('Burnt! Nobody wants that.');
            return;
          }
          if (!me.tray.length) return msg('Build the ' + VAR.dish.toLowerCase() + ' first');
          st.slot = { tray: me.tray, t: 0 }; me.tray = []; ctx.sfx('build'); return;
        }
      }
      function serve(seat) {
        const c = seat.c;
        const needsCook = !!VAR.dishCook;
        if (!same(me.tray, c.order)) return msg('That is not what they ordered');
        if (needsCook && !me.cooked) return msg(VAR.dishCook === 'roll' ? 'Roll it on the mat first' : 'It needs to go in the oven');
        if (me.burnt) return msg('It is burnt!');
        const tip = Math.round(VAR.price * T.tip * (c.wait / c.max) * (ctx.hasPass('tip_jar') ? 1.5 : 1));
        const pay = VAR.price + c.order.length * 4 + tip;
        me.earned += pay; me.served++; ctx.addStat('served', 1);
        ctx.sfx('coin'); ctx.feed('Served ' + c.bot.displayName + ': +' + pay + (tip ? ' (tip ' + tip + ')' : ''), 'star', '#ffd66b');
        if (rng() < 0.45) ctx.botText(c.bot, U.pick(['yum!!', 'thank u', '10/10', 'so good', 'fast service wow', 'coming back tmrw']), 300);
        seat.c = null; me.tray = []; me.cooked = me.burnt = false;
        if (me.served >= 12) ctx.badge(ctx.gameId + '_rush');
      }
      function end() {
        if (phase !== 'play') return;
        phase = 'over';
        const win = me.earned >= VAR.goal;
        ctx.best('bestShift', me.earned);
        if (win) ctx.badge(ctx.gameId + '_goal');
        if (win && me.angry === 0) ctx.badge(ctx.gameId + '_perfect');
        const stars = Math.max(1, Math.min(5, Math.round(me.earned / VAR.goal * 4) + (me.angry ? 0 : 1)));
        K.finish(ctx, { win, title: win ? stars + '-star shift!' : 'Closing time', subtitle: U.fmt(me.earned) + ' / ' + U.fmt(VAR.goal) + ' earned', score: me.earned, stats: [['Orders served', me.served], ['Earned', U.fmt(me.earned)], ['Angry customers', me.angry], ['Rating', '★'.repeat(stars)]], rewards: T.rewards });
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        V.preset(VAR.preset, { fog: false });
        V.shadowSize(650);
        V.gridFloor(0, 0, MAPW, MAPH, VAR.floor, 'rgba(0,0,0,.08)', 48, { check: true });
        V.boxes([{ x: MAPW / 2, y: 0, z: 40, w: MAPW, h: 160, d: 20, color: VAR.wall }, { x: 0, y: 0, z: MAPH / 2, w: 20, h: 160, d: MAPH, color: U.shade(VAR.wall, -0.1) }, { x: MAPW, y: 0, z: MAPH / 2, w: 20, h: 160, d: MAPH, color: U.shade(VAR.wall, -0.1) }]);
        // service counter between the kitchen and the seats
        V.box(MAPW / 2, 0, 540, MAPW - 120, 44, 34, '#b07a45'); V.box(MAPW / 2, 44, 540, MAPW - 110, 5, 40, '#e8ecf1');
        V.sign(ctx.game.name.toUpperCase(), MAPW / 2, 150, 52, { h: 34, color: '#ffe066', bg: 'rgba(0,0,0,.35)' });
        for (const st of stations) {
          if (st.kind === 'item') { V.box(st.x, 0, st.y, 80, 50, 60, '#8a909c'); V.box(st.x, 50, st.y, 70, 16, 50, st.color); V.sign(st.label, st.x, 96, st.y, { h: 16, color: '#ffffff' }); }
          else if (st.kind === 'cook') { V.box(st.x, 0, st.y, 110, 90, 90, st.color); if (VAR.dishCook !== 'roll') V.box(st.x, 30, st.y + 46, 70, 36, 2, '#ff8a2e', { glow: 0.8 }); V.sign(st.label, st.x, 120, st.y, { h: 18, color: '#ffe066' }); }
          else if (st.kind === 'grill') { V.box(st.x, 0, st.y, 110, 50, 80, st.color); V.box(st.x, 50, st.y, 100, 3, 70, '#1a1a1a'); V.sign(st.label, st.x, 90, st.y, { h: 18, color: '#ffe066' }); }
          else { V.shape('cyl', st.x, 25, st.y, 44, 50, 44, st.color); V.sign('BIN', st.x, 70, st.y, { h: 14, color: '#ffffff' }); }
        }
        for (const s of seats) { V.shape('cyl', s.x, 18, s.y, 34, 36, 34, '#e03e3e'); V.box(s.x, 36, s.y, 30, 4, 30, '#b8322a'); }
        const pool = V.pool();
        const blob = (col, s) => V.shape('cyl', 0, 0, 0, s || 22, 5, s || 22, col);
        function stack(list, cooked, burnt) { const g = V.group(); list.forEach((k, i) => { const m = blob(burnt ? '#2a2a2a' : cooked && VAR.dishCook !== 'roll' ? U.shade((info[k] || info[k.replace('*', '')] || { color: '#fff' }).color, -0.15) : (info[k] || { color: '#8a4a2a' }).color, 22 - i); m.position.y = i * 5; g.add(m); }); return g; }
        return function sync() {
          for (const s of seats) {
            if (!s.c) continue;
            K.rig(V, ctx, s.c, s.x, 20, s.y + 10, { a: -Math.PI / 2, mode: 'sit', scale: 7.5, label: false });
            const pct = s.c.wait / s.c.max;
            V.label(s.x, 90, s.y, { name: s.c.bot.displayName, color: pct < 0.3 ? '#ff8b98' : '#ffffff', hp: pct, hpColor: pct < 0.3 ? '#ff5a6a' : pct < 0.6 ? '#ffc940' : '#3fd08a', bubble: ctx.bubbleText(s.c.bot.id) });
          }
          for (const st of stations) if (st.slot) {
            const m = pool.use('slot' + st.key + (st.slot.tray ? st.slot.tray.join() : 'g'), () => st.slot.tray ? stack(st.slot.tray, false) : blob(info[VAR.grill].color, 26));
            const done = st.slot.t >= (st.kind === 'grill' ? T.grill : T.cook), burnt = st.slot.t > (st.kind === 'grill' ? T.grill + T.grillBurn : T.cook + T.burn) && VAR.dishCook !== 'roll';
            m.position.set(st.x, st.kind === 'grill' ? 54 : 94, st.y);
            if (done) V.label(st.x, 150, st.y, { name: burnt ? 'BURNT' : 'READY', color: burnt ? '#ff5a6a' : '#3fd08a' });
            else V.label(st.x, 150, st.y, { name: Math.ceil((st.kind === 'grill' ? T.grill : T.cook) - st.slot.t) + 's', color: '#ffe066' });
            if (!burnt && st.kind !== 'cook' && rng() < 0.3) V.fx.emit(st.x, 60, st.y, { count: 1, color: '#dddddd', speed: 20, life: 1, gravity: -1 });
          }
          if (me.tray.length) pool.use('tray' + me.tray.join() + me.cooked + me.burnt, () => stack(me.tray, me.cooked, me.burnt)).position.set(me.x + Math.cos(me.a) * 14, 50, me.y + Math.sin(me.a) * 14);
          pool.sweep();
          K.rig(V, ctx, 'me', me.x, 0, me.y, { a: me.a, move: me.moving ? 1 : 0, scale: 8 });
          helpers.forEach((h) => { if (ctx.botOrder(h.bot.id) || h.working) K.rig(V, ctx, h, h.x, 0, h.y, { a: h.a, move: h.moving ? 1 : 0, scale: 7.5 }); });
          V.look(me.x * 0.4 + MAPW * 0.3, 0, me.y * 0.3 + 360, { dist: 700, pitch: 1.05, fov: 45, lerp: 0.08 }, 1 / 60);
          V.sweep();
        };
      })();

      function drawHud(g) {
        K.panel(g, ctx.game.name, U.fmt(me.earned) + ' / ' + U.fmt(VAR.goal), me.served + ' served · ' + me.angry + ' angry', 250);
        K.timer(g, W, time, 20);
        // order tickets
        const open = seats.filter((s) => s.c);
        open.forEach((s, i) => {
          const x = 280 + i * 168, y = 60, w = 160;
          G.panel(g, x, y, w, 30 + s.c.order.length * 15, 0.85);
          G.text(g, 'Seat ' + (s.i + 1) + ' · ' + s.c.bot.displayName.split(' ')[0], x + 8, y + 16, { size: 11, weight: 800, color: '#ffe066' });
          s.c.order.forEach((k, j) => { const inf = info[k] || { label: k, color: '#fff' }; G.circle(g, x + 14, y + 30 + j * 15, 5, inf.color); G.text(g, inf.label, x + 24, y + 34 + j * 15, { size: 11, color: me.tray[j] === k ? '#3fd08a' : '#e8ecf3', weight: 700 }); });
          G.bar(g, x + 8, y + 22 + s.c.order.length * 15, w - 16, 5, s.c.wait / s.c.max, s.c.wait / s.c.max < 0.3 ? '#ff5a6a' : '#3fd08a');
        });
        if (me.tray.length) G.text(g, 'Holding: ' + me.tray.map((k) => (info[k] || { label: k }).label).join(' › ') + (me.cooked ? (me.burnt ? ' (burnt)' : ' (cooked)') : ''), 22, H - 70, { size: 13, weight: 800, color: '#ffe066' });
        const st = nearest(stations), seat = nearest(seats.filter((s) => s.c), T.serveReach);
        let tip = seat && me.tray.length ? 'E: serve seat ' + (seat.i + 1) : st ? (st.kind === 'item' ? 'E: take ' + st.label : st.kind === 'bin' ? 'E: bin what you hold' : st.kind === 'grill' ? (st.slot ? 'E: take it off the grill' : 'Grill: put a raw ' + info[VAR.grill].label.toLowerCase().replace('raw ', '') + ' on it') : st.slot ? 'E: take it out' : 'E: put the ' + VAR.dish.toLowerCase() + ' in') : '';
        if (flash) tip = flash.t;
        K.hint(g, W, H, tip, flash ? '#ff8b98' : null);
      }
      function draw2d(g) {
        g.fillStyle = VAR.floor; g.fillRect(0, 0, W, H);
        const sc = Math.min(W / MAPW, H / MAPH);
        g.save(); g.scale(sc, sc);
        for (const st of stations) { g.fillStyle = st.color; g.fillRect(st.x - 35, st.y - 25, 70, 50); G.text(g, st.label, st.x, st.y + 40, { size: 12, align: 'center', color: '#141018', weight: 800 }); }
        g.fillStyle = '#b07a45'; g.fillRect(60, 525, MAPW - 120, 30);
        for (const s of seats) if (s.c) G.avatarTop(g, s.x, s.y, 13, s.c.bot.look, -Math.PI / 2, {});
        G.avatarTop(g, me.x, me.y, 14, ctx.player.look, me.a, { walk: me.walk });
        g.restore();
        drawHud(g);
      }

      return {
        update(dt) {
          if (phase !== 'play') return;
          time -= dt;
          if (time <= 0) return end();
          if (flash) { flash.time -= dt; if (flash.time <= 0) flash = null; }
          K.move(ctx, me, T.speed * (ctx.hasPass('fast_hands') ? 1.2 : 1), dt, { x0: 50, y0: 178, x1: MAPW - 50, y1: 505 });
          if (ctx.input.actPressed('use')) use();
          if (ctx.input.actPressed('bin') && me.tray.length) { me.tray = []; me.cooked = me.burnt = false; ctx.sfx('swing'); }
          for (const st of stations) if (st.slot) st.slot.t += dt;
          nextArrive -= dt;
          if (nextArrive <= 0) { arrive(); nextArrive = U.rand(T.arrive[0], T.arrive[1], rng) * (time < 60 ? 0.75 : 1); }
          for (const s of seats) if (s.c) {
            s.c.wait -= dt;
            if (s.c.wait <= 0) { me.angry++; ctx.sfx('lose'); ctx.feed(s.c.bot.displayName + ' left angry', 'leave', '#ff9d9d'); if (rng() < 0.6) ctx.botText(s.c.bot, U.pick(['ugh too slow', 'im leaving', 'never coming back lol', 'this place is so slow']), 200); s.c = null; }
          }
          // helpers: bots asked to help cook and serve an order every so often
          for (const h of helpers) {
            const o = ctx.botOrder(h.bot.id);
            h.working = o && o.verb === 'help';
            if (h.working) {
              h.t -= dt;
              const target = seats.filter((s) => s.c).sort((a, b) => a.c.wait - b.c.wait)[0];
              if (target) { h.tx = target.x; h.ty = 500; } else { h.tx = 500; h.ty = 250; }
              if (h.t <= 0 && target) {
                h.t = 16 - h.skill * 7;
                const pay = Math.round((VAR.price + target.c.order.length * 4) * 0.7);
                me.earned += pay; me.served++;
                ctx.feed(h.bot.displayName + ' served seat ' + (target.i + 1) + ' (+' + pay + ')', 'star', '#8fd3ff');
                target.c = null;
              }
              K.steer(h, h.tx, h.ty, T.speed * 0.8, dt);
            } else {
              const og = K.ordered(ctx, h, me, { near: 50 });
              if (og) K.steer(h, og.x, og.y, T.speed * 0.8, dt);
            }
          }
        },
        draw: draw2d,
        render3d() { if (view) view(); },
        hud: drawHud,
        onBotJoin(b) { K.join(helpers, b, 3, (i) => ({ x: 300 + i * 200, y: 460, t: 10, tx: 0, ty: 0 }), ctx); },
        onBotLeave(b) { K.leave(helpers, b); for (const s of seats) if (s.c && s.c.bot.id === b.id) s.c = null; },
        _test: { me, seats, stations, use, serve, arrive, end, get phase() { return phase; }, VAR },
      };
    },
  });
})((window.BF = window.BF || {}));
