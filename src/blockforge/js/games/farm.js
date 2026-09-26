/**
 * Farm (gameType "farm") — a one-day farming season. Till plots, plant seeds,
 * water them through each growth stage, harvest and sell at the market stand.
 * Reach the season goal before sundown. Ask bots to help and they work your
 * plots for you.
 *
 * Variants (config.variant):
 *   valley    Harvest Valley        classic crops
 *   pumpkin   Pumpkin Patch Tycoon  crows eat unguarded crops: chase them off
 *   space     Star Greenhouse       crops only grow while the oxygen pump runs (E at the pump)
 *   honey     Honey Hive            flowers bloom by themselves: collect pollen, make honey at the hive
 *   mushroom  Mushroom Grove        slugs crawl toward your crops: stomp them
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  const T = {
    time: 240, speed: 210, cell: 72, cols: 6, rows: 3, reach: 58, startCash: 80, golden: 0.05,
    crowEvery: 9, slugEvery: 8, oxygen: 26, pollenCap: 40, bloom: 9,
    rewards: { play: 12, win: 45, per: 0.02, xpPlay: 25, xpWin: 90 },
  };

  // crop: [name, seed cost, sell value, seconds per stage, colour]
  const VARIANTS = {
    valley: { preset: 'day', grass: '#6cbf5a', soil: '#7a5236', goal: 900, crops: [['Carrot', 10, 34, 5, '#ff8a2e'], ['Tomato', 16, 55, 7, '#e03e3e'], ['Corn', 22, 80, 9, '#ffd23f'], ['Blueberry', 30, 118, 11, '#4a6aff']] },
    pumpkin: { preset: 'sunset', grass: '#a8a04a', soil: '#6b4a2e', goal: 1000, twist: 'crows', crops: [['Pumpkin', 14, 48, 6, '#ff8a2e'], ['Gourd', 18, 62, 7, '#d8c14a'], ['Squash', 24, 86, 9, '#e0a23a'], ['Giant Pumpkin', 40, 170, 13, '#ff6a1a']] },
    space: { preset: 'space', grass: '#8a8f9e', soil: '#3a3f5a', goal: 1000, twist: 'oxygen', crops: [['Moon Melon', 14, 50, 6, '#bfe6ff'], ['Star Fruit', 20, 72, 8, '#ffe066'], ['Comet Corn', 26, 96, 10, '#7cf5ff'], ['Nebula Berry', 36, 140, 12, '#ff4fd8']] },
    honey: { preset: 'day', grass: '#7ccf6a', soil: '#5a8a4a', goal: 1100, twist: 'honey', crops: [['Daisy', 10, 1, 0, '#ffffff'], ['Tulip', 16, 2, 0, '#ff5aa8'], ['Sunflower', 22, 3, 0, '#ffd23f'], ['Blue Bell', 30, 4, 0, '#46a8ff']] },
    mushroom: { preset: 'night', grass: '#2a3a2a', soil: '#3a2a22', goal: 900, twist: 'slugs', glow: true, crops: [['Glowcap', 12, 42, 6, '#7cf5ff'], ['Moon Morel', 18, 62, 8, '#d8d0ff'], ['Fairy Ring', 24, 88, 10, '#ff9fe8'], ['Ember Truffle', 34, 130, 12, '#ff8a2e']] },
  };

  BF.GameModules.register('farm', {
    three: true,
    maxBots: 4,
    feedTop: 0.2,
    orders: ['follow', 'come', 'stay', 'leave', 'help', 'gather'],
    actions: { use: ['KeyE', 'Space'], s1: ['Digit1'], s2: ['Digit2'], s3: ['Digit3'], s4: ['Digit4'] },
    controls: { joystick: true, buttons: [{ act: 'use', label: 'Use', icon: 'hammer' }, { act: 's1', label: '1' }, { act: 's2', label: '2' }, { act: 's3', label: '3' }, { act: 's4', label: '4' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H, K = BF.arcade;
      const VAR = K.variant(ctx, VARIANTS);
      const V = ctx.g3;
      const rng = U.rng('farm:' + ctx.gameId + ':' + Date.now());
      const C = T.cell, FX = 300, FY = 200; // field top-left
      const MAPW = 1100, MAPH = 700;
      const honey = VAR.twist === 'honey';
      const plots = [];
      for (let r = 0; r < T.rows; r++) for (let c = 0; c < T.cols; c++) plots.push({ i: plots.length, x: FX + c * C + C / 2, y: FY + r * C + C / 2, state: honey ? 'soil' : 'grass', crop: null, stage: 0, grow: 0, wet: false, golden: false, bloom: 0 });
      const stand = { x: 180, y: 520, w: 110, h: 60 };
      const hive = { x: 900, y: 520 }, pump = { x: 880, y: 250 };
      const me = { x: 520, y: 520, a: -Math.PI / 2, walk: 0, cash: T.startCash, earned: 0, seed: 0, basket: [], pollen: 0, harvests: 0 };
      const bots = K.crew(ctx, 4, (i) => ({ x: 120 + i * 60, y: 640, earned: 0, tx: 0, ty: 0, t: 0, job: null }));
      const crows = [], slugs = [];
      let time = T.time, phase = 'play', oxygen = 1, crowT = T.crowEvery, slugT = T.slugEvery, flash = null;
      const sell = (v) => Math.round(v * (ctx.hasPass('big_basket') ? 1.25 : 1));
      ctx.banner(ctx.game.name, 'Earn ' + U.fmt(VAR.goal) + ' coins before sundown', 2400);

      function nearPlot(e) {
        const fx = e.x + Math.cos(e.a) * 26, fy = e.y + Math.sin(e.a) * 26;
        let best = null, bd = T.reach;
        for (const p of plots) { const d = Math.hypot(p.x - fx, p.y - fy); if (d < bd) { bd = d; best = p; } }
        return best;
      }
      function work(p, who) {
        const crop = VAR.crops[who === me ? me.seed : Math.floor(rng() * 2)];
        if (honey) {
          if (p.state === 'soil' && who === me) { if (me.cash < crop[1]) return msg('Not enough coins for ' + crop[0] + ' seeds'); me.cash -= crop[1]; p.state = 'flower'; p.crop = me.seed; p.bloom = 1; ctx.sfx('dig'); return; }
          return;
        }
        if (p.state === 'grass') { p.state = 'soil'; ctx.sfx('dig'); return true; }
        if (p.state === 'soil') {
          if (who !== me) return false;
          if (me.cash < crop[1]) { msg('Not enough coins for ' + crop[0] + ' seeds'); return false; }
          me.cash -= crop[1]; p.state = 'growing'; p.crop = me.seed; p.stage = 0; p.grow = 0; p.wet = ctx.hasPass('sprinkler'); p.golden = false; ctx.sfx('build'); return true;
        }
        if (p.state === 'growing' && !p.wet) { p.wet = true; ctx.sfx('splash'); if (V) V.fx.emit(p.x, 30, p.y, { count: 10, color: '#8fd3ff', speed: 60, life: 0.5 }); return true; }
        if (p.state === 'ready') {
          const c = VAR.crops[p.crop];
          const v = c[2] * (p.golden ? 5 : 1);
          me.basket.push({ name: (p.golden ? 'Golden ' : '') + c[0], v });
          me.harvests++; ctx.addStat('harvests', 1);
          if (p.golden) { ctx.badge(ctx.gameId + '_giant'); ctx.feed('A golden ' + c[0] + '! Worth 5x', 'star', '#ffd66b'); }
          p.state = 'soil'; p.crop = null; p.stage = 0; p.golden = false;
          ctx.sfx('pickup');
          if (who !== me) ctx.feed(who.bot.displayName + ' harvested your ' + c[0], 'star', '#8fd3ff');
          return true;
        }
        return false;
      }
      function msg(t) { flash = { t, time: 1.8 }; ctx.sfx('error'); }
      function sellAll() {
        let v = 0;
        if (honey) { v = Math.round(me.pollen * 6); me.pollen = 0; if (v) ctx.feed('The hive made honey worth ' + v + ' coins', 'star', '#ffc940'); }
        else { for (const it of me.basket) v += sell(it.v); if (me.basket.length) ctx.feed('Sold ' + me.basket.length + ' crops for ' + v + ' coins', 'star', '#ffd66b'); me.basket = []; }
        if (v) { me.cash += v; me.earned += v; ctx.sfx('coin'); }
        if (me.earned >= VAR.goal && !me.goalHit) { me.goalHit = true; ctx.banner('Goal reached!', 'Keep going for a bigger season', 1800); ctx.sfx('win'); }
      }
      function end() {
        if (phase !== 'play') return;
        phase = 'over';
        const win = me.earned >= VAR.goal;
        ctx.best('bestSeason', me.earned);
        if (win) ctx.badge(ctx.gameId + '_goal');
        if (me.earned >= 2000) ctx.badge(ctx.gameId + '_rich');
        const place = 1 + bots.filter((b) => b.earned > me.earned).length;
        K.finish(ctx, { win, title: win ? 'Market day!' : 'The sun went down', subtitle: U.fmt(me.earned) + ' / ' + U.fmt(VAR.goal) + ' coins', score: me.earned, place, of: bots.length + 1, stats: [['Earned', U.fmt(me.earned)], ['Harvests', me.harvests], ['Goal', U.fmt(VAR.goal)]], rewards: T.rewards });
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        V.preset(VAR.preset, { fogNear: 1500, fogFar: 4000 });
        if (VAR.preset === 'night' || VAR.preset === 'space') V.stars(300);
        V.shadowSize(650);
        V.gridFloor(-800, -800, MAPW + 800, MAPH + 800, VAR.grass, 'rgba(0,0,0,.06)', 70, { noise: true });
        if (VAR.twist === 'oxygen') { const d = V.shape('sphere', MAPW / 2, 0, MAPH / 2, 1500, 700, 1100, '#bfe6ff', { opacity: 0.12, shadow: false }); d.material.side = THREE.DoubleSide; }
        const fence = [];
        for (let x = 40; x < MAPW - 40; x += 40) { fence.push({ x, y: 0, z: 30, w: 6, h: 34, d: 6, color: '#b07a45' }); fence.push({ x, y: 0, z: MAPH - 30, w: 6, h: 34, d: 6, color: '#b07a45' }); }
        fence.push({ x: MAPW / 2, y: 20, z: 30, w: MAPW - 80, h: 5, d: 3, color: '#c89060' }, { x: MAPW / 2, y: 20, z: MAPH - 30, w: MAPW - 80, h: 5, d: 3, color: '#c89060' });
        V.boxes(fence);
        // market stand
        V.box(stand.x, 0, stand.y, stand.w, 40, stand.h, '#b07a45'); V.box(stand.x - stand.w / 2 + 4, 0, stand.y, 6, 90, 6, '#8b5a2b'); V.box(stand.x + stand.w / 2 - 4, 0, stand.y, 6, 90, 6, '#8b5a2b');
        for (let i = 0; i < 6; i++) V.box(stand.x - stand.w / 2 + 9 + i * 18.5, 88, stand.y, 18.5, 8, stand.h + 20, i % 2 ? '#ffffff' : '#e03e3e');
        V.sign(honey ? 'HIVE ->' : 'MARKET', stand.x, 120, stand.y, { h: 22, color: '#ffe066' });
        if (honey) { V.shape('dodeca', hive.x, 50, hive.y, 90, 100, 90, '#ffc940'); V.box(hive.x - 10, 0, hive.y + 40, 20, 26, 6, '#6b4226'); V.sign('HIVE', hive.x, 130, hive.y, { h: 22, color: '#ffe066' }); }
        if (VAR.twist === 'oxygen') { V.box(pump.x, 0, pump.y, 60, 80, 60, '#8a909c'); V.shape('cyl', pump.x, 100, pump.y, 30, 40, 30, '#7cf5ff', { glow: 1 }); V.sign('O2 PUMP', pump.x, 150, pump.y, { h: 20, color: '#7cf5ff' }); }
        // barn / scenery
        V.box(980, 0, 140, 160, 110, 120, VAR.twist === 'oxygen' ? '#e8ecf1' : '#b83a3a'); V.box(980, 110, 140, 170, 30, 130, VAR.twist === 'oxygen' ? '#46a8ff' : '#6b2a2a', { geo: 'cone4' });
        const trees = [];
        const r = U.rng('farmdeco:' + ctx.gameId);
        for (let i = 0; i < 30; i++) { const x = -500 + r() * (MAPW + 1000), z = r() < 0.5 ? -80 - r() * 400 : MAPH + 80 + r() * 400; trees.push([x, z, 60 + r() * 60]); }
        const trunks = [], tops = [];
        for (const [x, z, h] of trees) { trunks.push({ x, z, w: h * 0.14, h: h * 0.5, d: h * 0.14, color: '#6b4226' }); tops.push({ x, y: h * 0.35, z, w: h * 0.7, h: h * 0.8, d: h * 0.7, color: VAR.twist === 'slugs' ? U.shade('#1f3a2a', r() * 0.1) : VAR.twist === 'crows' ? U.pick(['#d87a2e', '#c8a03a', '#a0522d'], r) : U.shade('#2f8f47', r() * 0.12) }); }
        if (VAR.twist !== 'oxygen') { V.boxes(trunks, { geo: 'cylLo' }); V.boxes(tops, { geo: 'cone' }); }
        const pool = V.pool();
        function cropMesh(p) {
          const g = V.group();
          const c = VAR.crops[p.crop];
          const col = p.golden && p.state === 'ready' ? '#ffd23f' : c[4];
          if (p.state === 'flower') { V.box(0, 0, 0, 2, 24, 2, '#3f9a3a', { parent: g }); V.shape('sphere', 0, 26, 0, 16, 8, 16, col, { parent: g, glow: VAR.glow ? 0.6 : 0.1 }); V.shape('sphere', 0, 28, 0, 6, 6, 6, '#ffd23f', { parent: g }); return g; }
          const s = p.state === 'ready' ? 1 : 0.35 + p.stage * 0.3;
          for (let k = 0; k < 4; k++) {
            const ox = (k % 2 - 0.5) * 30, oz = (Math.floor(k / 2) - 0.5) * 30;
            V.box(ox, 0, oz, 3, 16 * s, 3, '#3f9a3a', { parent: g });
            V.shape('sphere', ox - 4, 12 * s, oz, 10 * s, 5 * s, 6 * s, '#4ab84a', { parent: g });
            if (p.state === 'ready') V.shape(VAR.twist === 'slugs' ? 'cone' : 'sphere', ox, 18, oz, 16, VAR.twist === 'slugs' ? 18 : 16, 16, col, { parent: g, glow: VAR.glow || p.golden ? 0.8 : 0 });
          }
          return g;
        }
        return function sync() {
          const t = ctx.time;
          for (const p of plots) {
            const soil = pool.use('s' + p.i + (p.state === 'grass' ? 'g' : p.wet ? 'w' : 'd'), () => V.box(0, 0, 0, C - 6, p.state === 'grass' ? 2 : 5, C - 6, p.state === 'grass' ? U.shade(VAR.grass, -0.08) : p.wet ? U.shade(VAR.soil, -0.3) : VAR.soil));
            soil.position.set(p.x, 0, p.y);
            if (p.state === 'growing' || p.state === 'ready' || p.state === 'flower') pool.use('c' + p.i + p.state + p.stage + (p.golden ? 'g' : '') + (p.bloom > 0 ? 'b' : ''), () => cropMesh(p)).position.set(p.x, 3, p.y);
            if (p.state === 'ready' && !honey) pool.use('!' + p.i, () => V.shape('octa', 0, 0, 0, 12, 18, 12, '#ffe066', { glow: 1.2 })).position.set(p.x, 70 + Math.sin(t * 4 + p.i) * 4, p.y);
          }
          for (const cr of crows) { const m = pool.use('crow' + cr.id, () => { const g = V.group(); V.shape('sphere', 0, 0, 0, 20, 14, 14, '#1a1a22', { parent: g }); V.shape('cone', 12, 2, 0, 5, 10, 5, '#ffb454', { parent: g }).rotation.z = -Math.PI / 2; V.box(0, 2, 0, 34, 2, 8, '#26262e', { parent: g }); return g; }); m.position.set(cr.x, cr.h, cr.y); m.rotation.y = -cr.a; }
          for (const sl of slugs) { const m = pool.use('slug' + sl.id, () => { const g = V.group(); V.shape('sphere', 0, 5, 0, 26, 10, 12, '#8a9a3a', { parent: g, glow: 0.3 }); V.box(10, 8, -3, 2, 8, 2, '#8a9a3a', { parent: g }); V.box(10, 8, 3, 2, 8, 2, '#8a9a3a', { parent: g }); return g; }); m.position.set(sl.x, 0, sl.y); m.rotation.y = -sl.a; }
          pool.sweep();
          K.rig(V, ctx, 'me', me.x, 0, me.y, { a: me.a, move: me.moving ? 1 : 0, scale: 8 });
          if (me.basket.length || me.pollen) V.label(me.x, 78, me.y, { name: honey ? Math.round(me.pollen) + ' pollen' : me.basket.length + ' crops', color: '#ffe066', dy: -18 });
          bots.forEach((b) => K.rig(V, ctx, b, b.x, 0, b.y, { a: b.a, move: b.moving ? 1 : 0, scale: 7.5 }));
          if (honey) for (let i = 0; i < 5 + Math.min(10, Math.floor(me.pollen / 4)); i++) pool.use('bee' + i, () => { const g = V.group(); V.shape('sphere', 0, 0, 0, 7, 6, 6, '#ffd23f', { parent: g }); V.box(0, 3, 0, 8, 1, 3, '#ffffff', { parent: g, opacity: 0.7 }); return g; }).position.set(me.x + Math.cos(t * 3 + i * 1.3) * (26 + i * 3), 48 + Math.sin(t * 5 + i) * 8, me.y + Math.sin(t * 3 + i * 1.3) * (26 + i * 3));
          V.look(me.x, 0, me.y + 40, { dist: 560, pitch: 0.95, fov: 45, lerp: 0.12 }, 1 / 60);
          V.sweep();
        };
      })();

      function drawHud(g) {
        K.panel(g, ctx.game.name, U.fmt(me.earned) + ' / ' + U.fmt(VAR.goal) + ' earned', 'Wallet ' + me.cash + (honey ? ' · pollen ' + Math.round(me.pollen) + '/' + T.pollenCap : ' · basket ' + me.basket.length), 280);
        K.timer(g, W, time, 30);
        // seed bar
        VAR.crops.forEach((c, i) => {
          const x = W / 2 - 220 + i * 112, y = H - 100;
          G.panel(g, x, y, 104, 40, me.seed === i ? 0.95 : 0.6);
          if (me.seed === i) G.line(g, x + 4, y + 38, x + 100, y + 38, '#ffd66b', 3);
          G.circle(g, x + 16, y + 20, 7, c[4]);
          G.text(g, (i + 1) + ' ' + c[0], x + 28, y + 17, { size: 11.5, weight: 800 });
          G.text(g, honey ? 'Seeds ' + c[1] + ' · ×' + c[2] + ' pollen' : 'Seeds ' + c[1] + ' · sells ' + sell(c[2]), x + 28, y + 32, { size: 10, color: '#a1abbb' });
        });
        K.board(g, W, [{ n: ctx.player.name, v: me.earned, me: true }].concat(bots.map((b) => ({ n: b.bot.displayName, v: b.earned }))), { title: 'Farm coins earned' });
        if (VAR.twist === 'oxygen') K.meter(g, 22, 106, 160, oxygen, oxygen < 0.25 ? '#ff8b98' : '#7cf5ff', oxygen <= 0 ? 'OXYGEN OUT: crops stopped (E at pump)' : 'Oxygen');
        const p = nearPlot(me);
        let tip = '';
        if (Math.hypot(me.x - stand.x, me.y - stand.y) < 90) tip = honey ? '' : 'Walk into the stand to sell';
        else if (honey && Math.hypot(me.x - hive.x, me.y - hive.y) < 90) tip = 'Walk into the hive to make honey';
        else if (p) tip = { grass: 'E: till the soil', soil: honey ? 'E: plant ' + VAR.crops[me.seed][0] + ' (' + VAR.crops[me.seed][1] + ')' : 'E: plant ' + VAR.crops[me.seed][0] + ' (' + VAR.crops[me.seed][1] + ' coins)', growing: p.wet ? 'Growing...' : 'E: water it', ready: 'E: harvest', flower: p.bloom > 0 ? 'Walk through to collect pollen' : 'Blooming again soon' }[p.state] || '';
        if (flash) tip = flash.t;
        K.hint(g, W, H - 84, tip, flash ? '#ff8b98' : null);
      }
      function draw2d(g) {
        g.fillStyle = VAR.grass; g.fillRect(0, 0, W, H);
        const sc = Math.min(W / MAPW, H / MAPH);
        g.save(); g.scale(sc, sc);
        for (const p of plots) { g.fillStyle = p.state === 'grass' ? U.shade(VAR.grass, -0.1) : p.wet ? U.shade(VAR.soil, -0.3) : VAR.soil; g.fillRect(p.x - C / 2 + 3, p.y - C / 2 + 3, C - 6, C - 6); if (p.crop != null && p.state !== 'soil') G.circle(g, p.x, p.y, p.state === 'ready' || p.state === 'flower' ? 14 : 6 + p.stage * 3, VAR.crops[p.crop][4]); }
        g.fillStyle = '#b07a45'; g.fillRect(stand.x - stand.w / 2, stand.y - stand.h / 2, stand.w, stand.h);
        for (const b of bots) G.avatarTop(g, b.x, b.y, 13, b.bot.look, b.a, { walk: b.walk });
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
          const inp = ctx.input;
          for (let i = 0; i < 4; i++) if (inp.actPressed('s' + (i + 1))) { me.seed = i; ctx.sfx('click'); }
          K.move(ctx, me, T.speed * (ctx.hasPass('fast_hands') ? 1.2 : 1), dt, { x0: 40, y0: 50, x1: MAPW - 40, y1: MAPH - 50 });
          if (inp.actPressed('use')) {
            if (VAR.twist === 'oxygen' && Math.hypot(me.x - pump.x, me.y - pump.y) < 80) { oxygen = 1; ctx.sfx('powerup'); ctx.feed('Oxygen pump refilled', 'star', '#7cf5ff'); }
            else { const p = nearPlot(me); if (p) work(p, me); }
          }
          // selling
          if (!honey && me.basket.length && Math.abs(me.x - stand.x) < stand.w / 2 + 16 && Math.abs(me.y - stand.y) < stand.h / 2 + 16) sellAll();
          if (honey && me.pollen >= 1 && Math.hypot(me.x - hive.x, me.y - hive.y) < 70) sellAll();
          // growth
          const speed = (ctx.hasPass('fertilizer') ? 1.35 : 1) * (VAR.twist === 'oxygen' && oxygen <= 0 ? 0 : 1);
          if (VAR.twist === 'oxygen') oxygen = Math.max(0, oxygen - dt / T.oxygen);
          for (const p of plots) {
            if (p.state === 'growing' && p.wet) {
              p.grow += dt * speed;
              const per = VAR.crops[p.crop][3];
              if (p.grow >= per) { p.grow = 0; p.stage++; p.wet = ctx.hasPass('sprinkler'); if (p.stage >= 3) { p.state = 'ready'; p.golden = rng() < T.golden; } }
            }
            if (p.state === 'flower') {
              if (p.bloom <= 0) { p.regrow = (p.regrow || 0) + dt * speed; if (p.regrow >= T.bloom) { p.bloom = 1; p.regrow = 0; } }
              else if (Math.hypot(me.x - p.x, me.y - p.y) < 34 && me.pollen < T.pollenCap) { me.pollen = Math.min(T.pollenCap, me.pollen + VAR.crops[p.crop][2] * 2); p.bloom = 0; ctx.sfx('pickup'); }
            }
          }
          if (honey) {
            // wild flowers bloom on unplanted plots too, so the swarm always has work
            for (const p of plots) if (p.state === 'soil' && rng() < dt * 0.01) { p.state = 'flower'; p.crop = 0; p.bloom = 1; }
          }
          // pests
          if (VAR.twist === 'crows') {
            crowT -= dt;
            if (crowT <= 0) { crowT = T.crowEvery * (0.6 + rng() * 0.8); const tgt = U.pick(plots.filter((p) => p.state === 'growing' || p.state === 'ready'), rng); if (tgt) crows.push({ id: Math.random(), x: tgt.x - 400, y: tgt.y - 200, h: 160, tgt, t: 0, a: 0 }); }
            for (let i = crows.length - 1; i >= 0; i--) {
              const cr = crows[i];
              const dx = cr.tgt.x - cr.x, dy = cr.tgt.y - cr.y, d = Math.hypot(dx, dy);
              if (d > 6) { cr.x += (dx / d) * 160 * dt; cr.y += (dy / d) * 160 * dt; cr.a = Math.atan2(dy, dx); cr.h = Math.max(20, cr.h - 60 * dt); }
              else { cr.t += dt; cr.h = 18; if (cr.t > 3.5 && (cr.tgt.state === 'growing' || cr.tgt.state === 'ready')) { ctx.feed('A crow ate your ' + VAR.crops[cr.tgt.crop][0] + '!', 'leave', '#ff9d9d'); cr.tgt.state = 'soil'; cr.tgt.crop = null; crows.splice(i, 1); continue; } }
              const scared = Math.hypot(me.x - cr.x, me.y - cr.y) < 70 || bots.some((b) => Math.hypot(b.x - cr.x, b.y - cr.y) < 50 && ctx.botOrder(b.bot.id));
              if (scared) { crows.splice(i, 1); ctx.sfx('swing'); }
            }
          }
          if (VAR.twist === 'slugs') {
            slugT -= dt;
            if (slugT <= 0) { slugT = T.slugEvery * (0.6 + rng() * 0.8); const tgt = U.pick(plots.filter((p) => p.state === 'growing' || p.state === 'ready'), rng); if (tgt) slugs.push({ id: Math.random(), x: rng() < 0.5 ? 40 : MAPW - 40, y: tgt.y + (rng() - 0.5) * 100, tgt, t: 0, a: 0 }); }
            for (let i = slugs.length - 1; i >= 0; i--) {
              const sl = slugs[i];
              const dx = sl.tgt.x - sl.x, dy = sl.tgt.y - sl.y, d = Math.hypot(dx, dy);
              if (d > 8) { sl.x += (dx / d) * 32 * dt; sl.y += (dy / d) * 32 * dt; sl.a = Math.atan2(dy, dx); }
              else { sl.t += dt; if (sl.t > 3 && (sl.tgt.state === 'growing' || sl.tgt.state === 'ready')) { ctx.feed('A slug munched your ' + VAR.crops[sl.tgt.crop][0], 'leave', '#ff9d9d'); sl.tgt.state = 'soil'; sl.tgt.crop = null; slugs.splice(i, 1); continue; } }
              if (Math.hypot(me.x - sl.x, me.y - sl.y) < 26 || bots.some((b) => Math.hypot(b.x - sl.x, b.y - sl.y) < 22)) { slugs.splice(i, 1); ctx.sfx('hit'); if (V) V.fx.emit(sl.x, 6, sl.y, { count: 8, color: '#8a9a3a', speed: 80, life: 0.4 }); }
            }
          }
          // bots: their own farming, or your plots when asked to help
          for (const b of bots) {
            const o = ctx.botOrder(b.bot.id);
            const helping = o && (o.verb === 'help' || o.verb === 'gather');
            const og = !helping ? K.ordered(ctx, b, me, { near: 50 }) : null;
            b.t -= dt;
            if (og) { b.tx = og.x; b.ty = og.y; }
            else if (helping) {
              if (!b.job || b.t <= 0) {
                b.t = 1.2;
                const pest = crows[0] || slugs[0];
                b.job = pest ? { x: pest.x, y: pest.y } : plots.find((p) => (p.state === 'growing' && !p.wet) || p.state === 'ready' || p.state === 'grass') || null;
              }
              if (b.job) {
                b.tx = b.job.x; b.ty = b.job.y + 30;
                if (b.job.state && Math.hypot(b.x - b.tx, b.y - b.ty) < 20) { work(b.job, b); b.job = null; }
              }
            } else if (b.t <= 0) {
              b.t = 2 + rng() * 3;
              b.tx = 80 + rng() * (MAPW - 160); b.ty = rng() < 0.5 ? 90 : MAPH - 90;
              if (rng() < 0.5) b.earned += Math.round(VAR.crops[Math.floor(rng() * 4)][2] * (0.3 + b.skill * 0.9));
            }
            K.steer(b, b.tx, b.ty, T.speed * 0.8, dt);
          }
        },
        draw: draw2d,
        render3d() { if (view) view(); },
        hud: drawHud,
        onBotJoin(b) { K.join(bots, b, 4, (i) => ({ x: 120 + i * 60, y: 640, earned: 0, tx: 200, ty: 640, t: 0, job: null }), ctx); },
        onBotLeave(b) { K.leave(bots, b); },
        _test: { me, plots, bots, work, sellAll, end, get phase() { return phase; }, VAR },
      };
    },
  });
})((window.BF = window.BF || {}));
