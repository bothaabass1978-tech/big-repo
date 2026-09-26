/**
 * Fishing (gameType "fishing") — cast, wait for the bite, strike, then keep
 * your marker inside the fish's moving green zone until the catch bar fills.
 * Bigger, rarer fish fight harder and are worth more. The biggest haul when
 * the trip ends wins.
 *
 * Variants (config.variant):
 *   lake  Lakeside Lures     calm lake, a legendary Golden Carp
 *   ice   Ice Hole Fishing   the hole freezes over: press E to crack it open
 *   deep  Deep Sea Legends   big ocean fish, sharks that snatch slow catches
 *   lava  Magma Fishing      a heat meter climbs while you reel
 *   koi   Koi Garden         scatter food (E) to draw rare koi
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  const T = {
    time: 210, charge: 1.1, castMin: 140, castMax: 520, bite: [2.2, 6.5], strike: 0.95,
    zone: 0.26, rise: 1.9, fall: 1.6, gain: 0.34, lose: 0.22, freeze: 24, crack: 5, heat: 0.22, cool: 0.35, feed: 2,
    rarity: [['common', 55], ['uncommon', 25], ['rare', 13], ['epic', 5], ['legendary', 2]],
    rewards: { play: 12, win: 40, per: 0.05, xpPlay: 25, xpWin: 85 },
  };
  const RCOL = { common: '#c9d1dc', uncommon: '#3fd08a', rare: '#46a8ff', epic: '#b67cff', legendary: '#ffc940' };
  const DIFF = { common: 0.8, uncommon: 1.05, rare: 1.35, epic: 1.7, legendary: 2.2 };

  const VARIANTS = {
    lake: { preset: 'day', water: '#2a8fc8', shore: '#5aab52', dock: '#8b5a2b', title: 'Lakeside Lures',
      fish: { common: [['Perch', 14], ['Bluegill', 12], ['Minnow', 6]], uncommon: [['Trout', 40], ['Bass', 45]], rare: [['Pike', 110], ['Catfish', 95]], epic: [['Sturgeon', 260]], legendary: [['Golden Carp', 900]] } },
    ice: { preset: 'day', water: '#1f5f8a', shore: '#f4faff', dock: '#e8f4ff', title: 'Ice Hole Fishing', twist: 'freeze',
      fish: { common: [['Smelt', 14], ['Ice Perch', 16]], uncommon: [['Arctic Char', 50], ['Whitefish', 44]], rare: [['Ice Pike', 130]], epic: [['Frost Salmon', 290]], legendary: [['Crystal Char', 1000]] } },
    deep: { preset: 'sunset', water: '#1a5a8a', shore: '#1a5a8a', dock: '#8b5a2b', title: 'Deep Sea Legends', twist: 'shark', boat: true,
      fish: { common: [['Mackerel', 18], ['Sardine', 10]], uncommon: [['Snapper', 55], ['Grouper', 60]], rare: [['Tuna', 160], ['Mahi-mahi', 140]], epic: [['Swordfish', 380], ['Marlin', 420]], legendary: [['Megamouth', 1300]] } },
    lava: { preset: 'dusk', water: '#ff5a1f', shore: '#2a1f1e', dock: '#3a3a3a', title: 'Magma Fishing', twist: 'heat', glow: true,
      fish: { common: [['Cinder Minnow', 16], ['Ash Perch', 18]], uncommon: [['Ember Eel', 60]], rare: [['Obsidian Bass', 170], ['Magma Ray', 150]], epic: [['Phoenix Koi', 400]], legendary: [['Volcano Leviathan', 1400]] } },
    koi: { preset: 'sunset', water: '#3aa88a', shore: '#7cc47a', dock: '#a0522d', title: 'Koi Garden', twist: 'feed', calm: true,
      fish: { common: [['Orange Koi', 16], ['White Koi', 16]], uncommon: [['Calico Koi', 50], ['Black Koi', 48]], rare: [['Butterfly Koi', 140]], epic: [['Sapphire Koi', 320]], legendary: [['Platinum Koi', 1100]] } },
  };

  BF.GameModules.register('fishing', {
    three: true,
    maxBots: 5,
    feedTop: 0.2,
    orders: ['follow', 'come', 'stay', 'leave', 'help'],
    actions: { cast: ['Space', 'Mouse0'], use: ['KeyE'] },
    controls: { joystick: false, buttons: [{ act: 'cast', label: 'Cast / Reel', icon: 'target' }, { act: 'use', label: 'Use', icon: 'sparkle' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H, K = BF.arcade;
      const VAR = K.variant(ctx, VARIANTS);
      const V = ctx.g3;
      const rng = U.rng('fish:' + ctx.gameId + ':' + Date.now());
      const me = { x: 0, y: 0, state: 'idle', power: 0, lure: null, biteT: 0, strikeT: 0, fish: null, marker: 0.3, zone: 0.4, zoneV: 0, progress: 0.3, clean: true, haul: 0, bucket: [], ice: 0, cracks: 0, heat: 0, feed: 0, reelT: 0, shark: 0, show: null };
      /** Where the other anglers stand: on the boat deck, or along the shore. */
      const SPOTS = VAR.boat ? [[-140, 150], [140, 150], [-140, 60], [140, 60], [0, 170]] : [[-150, 30], [150, 30], [-280, 30], [280, 30], [-410, 30]];
      const lureFor = (b) => (VAR.twist === 'freeze' ? { x: b.x, y: 190 } : { x: b.x + (rng() - 0.5) * 100, y: 260 + rng() * 240 });
      const bots = K.crew(ctx, 5, (i) => ({ x: SPOTS[i % 5][0], y: SPOTS[i % 5][1], haul: 0, next: 4 + Math.random() * 10, lure: { x: 0, y: 0 }, fish: null, catchT: 0 }));
      bots.forEach((b) => { b.lure = lureFor(b); });
      let time = T.time, phase = 'play', clock = 0;
      ctx.banner(VAR.title, 'Hold Space to cast. Strike when the bobber dips!', 2400);

      function roll(luck) {
        const lucky = (ctx.hasPass('lucky_bait') ? 2 : 1) * (me.feed > 0 ? 2 : 1) * (luck || 1);
        const table = T.rarity.map(([r, w]) => [r, r === 'common' ? w : r === 'uncommon' ? w * Math.min(1.5, lucky) : w * lucky]);
        const sum = table.reduce((a, x) => a + x[1], 0);
        let k = rng() * sum;
        let rar = 'common';
        for (const [r, w] of table) { if ((k -= w) <= 0) { rar = r; break; } }
        const pool = VAR.fish[rar] || VAR.fish.common;
        const [name, value] = pool[Math.floor(rng() * pool.length)];
        const weight = +(value / 12 * (0.6 + rng() * 0.9)).toFixed(1);
        return { name, rarity: rar, value: Math.round(value * (0.85 + rng() * 0.3)), weight };
      }
      function land(f) {
        me.bucket.push(f); me.haul += f.value;
        me.show = { f, t: 1.8 };
        ctx.sfx(f.rarity === 'legendary' || f.rarity === 'epic' ? 'achievement' : 'splash');
        ctx.feed('You caught a ' + f.rarity + ' ' + f.name + ' (' + f.weight + ' kg) +' + f.value, 'star', RCOL[f.rarity]);
        ctx.addStat('fishCaught', 1);
        if (f.rarity === 'legendary') { ctx.addStat('legendaries', 1); ctx.badge(ctx.gameId + '_legend'); ctx.chat('LEGENDARY! ' + ctx.player.name + ' landed a ' + f.name + '!'); }
        if (me.clean) ctx.badge(ctx.gameId + '_perfect');
        if (me.bucket.length >= 10) ctx.badge(ctx.gameId + '_ten');
        const fan = U.pick(bots, rng);
        if (fan && (f.rarity === 'rare' || f.rarity === 'epic' || f.rarity === 'legendary')) ctx.botText(fan.bot, U.pick(['WHAT a catch', 'no way a ' + f.name.toLowerCase(), 'bro how', 'teach me ur ways', 'thats huge']), 1200);
        me.state = 'idle';
      }
      function lose(why) { me.state = 'idle'; me.fish = null; ctx.sfx('lose'); ctx.feed(why, 'leave', '#ff9d9d'); }
      function end() {
        if (phase !== 'play') return;
        phase = 'over';
        const table = [{ me: true, v: me.haul }].concat(bots.map((b) => ({ v: b.haul, b }))).sort((a, b) => b.v - a.v);
        const place = table.findIndex((r) => r.me) + 1;
        ctx.best('bestHaul', me.haul);
        const best = me.bucket.slice().sort((a, b) => b.value - a.value)[0];
        K.finish(ctx, { win: place === 1, title: place === 1 ? 'Biggest haul!' : 'Trip over', subtitle: me.bucket.length + ' fish · ' + U.fmt(me.haul) + ' value', score: me.haul, place, of: table.length, stats: [['Fish caught', me.bucket.length], ['Haul value', U.fmt(me.haul)], ['Best catch', best ? best.name + ' (' + best.rarity + ')' : 'none']], rewards: T.rewards });
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        V.preset(VAR.preset, { fogNear: 1400, fogFar: 3800 });
        if (VAR.preset === 'dusk') V.stars(200);
        V.shadowSize(500);
        const waterMat = { opacity: VAR.glow ? 1 : 0.92, glow: VAR.glow ? 0.9 : 0, metal: 0.2, rough: 0.2 };
        V.box(0, -30, 800, 3600, 2, 2400, VAR.water, waterMat);
        if (VAR.twist === 'freeze') { V.box(0, -28, 700, 3600, 6, 2400, '#e8f6ff'); V.shape('cyl', 0, -25, 330, 160, 8, 160, '#1f5f8a'); }
        if (!VAR.boat) {
          V.box(0, -40, -300, 3600, 40, 700, VAR.shore);
          // the far shore, so the water reads as a lake
          V.box(0, -40, 1500, 3600, 44, 500, VAR.shore);
          const far = [];
          const fr = U.rng('farshore:' + ctx.gameId);
          for (let i = 0; i < 40; i++) { const x = -1600 + fr() * 3200, z = 1300 + fr() * 300, hh = 80 + fr() * 120; far.push({ x, y: 0, z, w: hh * 0.5, h: hh, d: hh * 0.5, color: VAR.twist === 'freeze' ? '#e8f6ff' : VAR.twist === 'heat' ? '#2a1c1a' : U.shade('#2f8f47', fr() * 0.15) }); }
          V.boxes(far, { geo: VAR.twist === 'heat' ? 'box' : 'cone' });
          const dock = [];
          for (let z = -60; z < 150; z += 22) dock.push({ x: 0, y: -12, z, w: 160, h: 6, d: 20, color: U.shade(VAR.dock, (z / 22) % 2 ? 0.05 : -0.03) });
          for (const [x, z] of [[-70, 140], [70, 140], [-70, 40], [70, 40]]) dock.push({ x, y: -60, z, w: 10, h: 50, d: 10, color: U.shade(VAR.dock, -0.2) });
          V.boxes(dock);
          const r = U.rng('shore:' + ctx.gameId);
          const deco = [];
          for (let i = 0; i < 26; i++) { const x = -1400 + r() * 2800, z = -150 - r() * 400; if (VAR.twist === 'heat') deco.push({ x, y: -20, z, w: 60 + r() * 100, h: 40 + r() * 140, d: 60 + r() * 100, color: '#2a1c1a' }); else if (VAR.twist === 'freeze') deco.push({ x, y: -20, z, w: 40, h: 120 + r() * 80, d: 40, color: '#e8f6ff' }); else { deco.push({ x, y: -20, z, w: 14, h: 70, d: 14, color: '#6b4226' }); deco.push({ x, y: 40, z, w: 70, h: 90, d: 70, color: VAR.twist === 'feed' ? U.pick(['#ff9fc7', '#f4b0d0', '#3f9a3a'], r) : U.shade('#2f8f47', r() * 0.15) }); } }
          V.boxes(deco, { geo: VAR.twist === 'freeze' ? 'cone' : 'box' });
          if (VAR.twist === 'feed') { const pads = []; for (let i = 0; i < 18; i++) pads.push({ x: -500 + r() * 1000, y: -29, z: 150 + r() * 500, w: 40, h: 1.5, d: 40, color: '#3f9a3a' }); V.boxes(pads, { geo: 'cyl' }); }
        } else {
          // the boat
          const hull = V.group();
          V.box(0, -40, 40, 360, 34, 260, '#f4f1ea', { parent: hull }); V.box(0, -8, 40, 340, 4, 240, '#b07a45', { parent: hull }); V.box(0, -6, -40, 120, 80, 90, '#e8ecf1', { parent: hull }); V.box(0, 74, -40, 130, 6, 100, '#46a8ff', { parent: hull });
          for (let i = 0; i < 20; i++) V.shape('cone', -1600 + i * 170, -30, 1400 + (i % 3) * 300, 80, 120, 80, '#2a4a6a');
        }
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#f4f1ea' }));
        V.scene.add(line); V.own(line.geometry); V.own(line.material);
        const bob = V.group(); V.shape('sphere', 0, 4, 0, 12, 12, 12, '#ff4a5a', { parent: bob }); V.shape('sphere', 0, 10, 0, 8, 8, 8, '#ffffff', { parent: bob });
        const bobs = V.pool();
        const fishPool = V.pool();
        const fishMesh = (col) => { const g = V.group(); V.shape('sphere', 0, 0, 0, 40, 18, 16, col, { parent: g }); const tail = V.shape('cone4', -26, 0, 0, 14, 16, 4, col, { parent: g }); tail.rotation.z = Math.PI / 2; V.shape('sphere', 14, 4, 6, 4, 4, 4, '#141018', { parent: g }); return g; };
        return function sync() {
          const t = ctx.time;
          const px = 0, pz = VAR.boat ? 120 : 130;
          const rig = K.rig(V, ctx, 'me', px, VAR.boat ? -4 : -6, pz, { a: Math.PI / 2, scale: 8 });
          const addRod = (r) => { if (r._rod || !r.arms) return; const rod = V.group(r.arms[1]); rod.position.set(0, -1.8, 0.3); rod.rotation.x = Math.PI / 2 - 0.4; const pole = V.box(0, 0, 0, 0.12, 5.2, 0.12, '#6b4226', { parent: rod }); pole.position.y = 2.2; r._rod = rod; };
          addRod(rig);
          if (me.state === 'reel') rig.set({ mode: 'idle', move: 0.3 });
          const lure = me.lure;
          line.visible = !!lure;
          bob.visible = !!lure;
          if (lure) {
            const dip = me.state === 'bite' ? -8 + Math.sin(t * 30) * 4 : me.state === 'reel' ? -6 : Math.sin(t * 3) * 1.5;
            const lx = me.state === 'reel' ? U.lerp(lure.x, px, me.progress * 0.8) : lure.x, lz = me.state === 'reel' ? U.lerp(lure.z, pz, me.progress * 0.8) : lure.z;
            bob.position.set(lx + (me.state === 'reel' ? Math.sin(t * 9) * 10 : 0), -30 + 6 + dip, lz);
            const pos = line.geometry.attributes.position;
            pos.setXYZ(0, px + 30, 64, pz + 30); pos.setXYZ(1, bob.position.x, bob.position.y + 6, bob.position.z); pos.needsUpdate = true;
          }
          bots.forEach((b) => {
            addRod(K.rig(V, ctx, b, b.x, VAR.boat ? -4 : 0, b.y, { a: Math.PI / 2, scale: 7.5 }));
            const m = bobs.use(b.bot.id + ':' + b.lure.x.toFixed(0), () => { const g2 = V.group(); V.shape('sphere', 0, 0, 0, 10, 10, 10, '#ff4a5a', { parent: g2 }); if (VAR.twist === 'freeze') V.shape('cyl', 0, -3, 0, 60, 3, 60, '#1f5f8a', { parent: g2, shadow: false }); return g2; });
            m.position.set(b.lure.x, (VAR.twist === 'freeze' ? -20 : -26) + Math.sin(t * 3 + b.skill * 9) * 1.5, b.lure.y);
            if (b.catchT > 0 && b.fish) { const f = fishPool.use('bf' + b.bot.id, () => fishMesh(RCOL[b.fish.rarity])); f.position.set(b.x, 70 + b.catchT * 20, b.y + 20); f.rotation.z = Math.sin(t * 20) * 0.4; }
          });
          if (me.show) { const f = fishPool.use('me' + me.show.f.name, () => fishMesh(RCOL[me.show.f.rarity])); f.position.set(px + 10, 90 + (1.8 - me.show.t) * 10, pz); f.rotation.z = Math.sin(t * 18) * 0.35; f.scale.setScalar(0.9 + Math.min(1.6, me.show.f.weight / 12)); V.label(px + 10, 130, pz, { name: me.show.f.name, color: RCOL[me.show.f.rarity] }); }
          bobs.sweep(); fishPool.sweep();
          V.look(px, 10, pz + 150, { dist: 360, pitch: 0.5, yaw: Math.PI, fov: 55, lerp: 0.1 }, 1 / 60);
          V.sweep();
        };
      })();

      function drawHud(g) {
        K.panel(g, VAR.title, U.fmt(me.haul) + ' haul value', me.bucket.length + ' fish' + (me.feed > 0 ? ' · food in the water' : ''));
        K.timer(g, W, time, 20);
        K.board(g, W, [{ n: ctx.player.name, v: me.haul, me: true }].concat(bots.map((b) => ({ n: b.bot.displayName, v: b.haul }))), { title: 'Biggest haul' });
        const recent = me.bucket.slice(-5).reverse();
        recent.forEach((f, i) => G.text(g, f.name + '  ' + f.weight + 'kg', 22, 110 + i * 17, { size: 12, color: RCOL[f.rarity], weight: 700 }));
        if (VAR.twist === 'freeze') K.meter(g, 22, 214, 160, me.ice, me.ice > 0.8 ? '#ff8b98' : '#bfe6ff', me.ice >= 1 ? 'FROZEN! Press E to crack (' + me.cracks + '/' + T.crack + ')' : 'Ice forming');
        if (VAR.twist === 'heat' && me.state === 'reel') K.meter(g, 22, 214, 160, me.heat, me.heat > 0.75 ? '#ff5a2e' : '#ffb454', 'Line heat');
        const cx = W / 2, cy = H - 80;
        if (me.state === 'idle') K.hint(g, W, H, VAR.twist === 'freeze' && me.ice >= 1 ? 'The hole froze over! Press E to crack it' : VAR.twist === 'feed' ? 'Hold Space to cast · E scatter food (' + me.feedLeft() + ' left)' : 'Hold Space to cast');
        if (me.state === 'charging') { K.meter(g, cx - 110, cy, 220, me.power, '#ffd66b', 'Cast power'); }
        if (me.state === 'wait') K.hint(g, W, H, 'Waiting for a bite...');
        if (me.state === 'bite') { G.display(g, '!', cx, H / 2 - 20, 110, '#ffd23f', 'center'); K.hint(g, W, H, 'STRIKE! Press Space', '#ffd23f'); }
        if (me.state === 'reel') {
          const bx = W - 90, by = 110, bh = 300;
          G.panel(g, bx - 16, by - 10, 62, bh + 20);
          G.fillRR(g, bx, by, 30, bh, 8, 'rgba(255,255,255,.08)');
          const zh = me.zoneW() * bh;
          G.fillRR(g, bx, by + (1 - me.zone) * bh - zh / 2, 30, zh, 6, me.shark > 0 ? 'rgba(255,90,90,.55)' : 'rgba(63,208,138,.55)');
          G.fillRR(g, bx - 4, by + (1 - me.marker) * bh - 4, 38, 8, 3, '#ffffff');
          G.bar(g, bx + 36, by, 8, bh, 0, '#000');
          g.fillStyle = '#ffd66b'; g.fillRect(bx + 36, by + (1 - me.progress) * bh, 8, me.progress * bh);
          G.text(g, me.fish ? '???' : '', bx + 15, by - 16, { size: 12, align: 'center', color: '#ffffff', weight: 800 });
          K.hint(g, W, H, me.shark > 0 ? 'SHARK! Reel harder!' : 'Hold Space to lift the marker · keep it in the green', me.shark > 0 ? '#ff8b98' : null);
        }
      }
      me.zoneW = () => T.zone * (ctx.hasPass('pro_rod') ? 1.35 : 1) * (VAR.calm ? 1.25 : 1) / Math.sqrt(me.fish ? DIFF[me.fish.rarity] : 1);
      me.feedLeft = () => T.feed - (me.fedCount || 0);

      function draw2d(g) {
        g.fillStyle = VAR.shore; g.fillRect(0, 0, W, H);
        g.fillStyle = VAR.water; g.fillRect(0, 0, W, H * 0.62);
        g.fillStyle = VAR.dock; g.fillRect(W / 2 - 50, H * 0.55, 100, H * 0.45);
        G.avatarTop(g, W / 2, H * 0.62, 14, ctx.player.look, -Math.PI / 2, {});
        if (me.lure) G.circle(g, W / 2 + me.lure.x * 0.5, H * 0.6 - (me.lure.z - 130) * 0.6, 6, '#ff4a5a');
        bots.forEach((b) => G.avatarTop(g, W / 2 + b.x * 0.9, H * 0.64, 12, b.bot.look, -Math.PI / 2, {}));
        drawHud(g);
      }

      return {
        update(dt) {
          if (phase !== 'play') return;
          clock += dt; time -= dt;
          if (time <= 0) return end();
          if (me.show) { me.show.t -= dt; if (me.show.t <= 0) me.show = null; }
          if (me.feed > 0) me.feed -= dt;
          const inp = ctx.input;
          // twists
          if (VAR.twist === 'freeze') {
            if (me.ice < 1) me.ice = Math.min(1, me.ice + dt / T.freeze);
            if (me.ice >= 1 && me.state === 'reel') lose('The hole froze and your line snapped!');
            if (me.ice >= 1 && inp.actPressed('use')) { me.cracks++; ctx.sfx('dig'); if (V) V.shake(3, 0.12); if (me.cracks >= T.crack) { me.ice = 0; me.cracks = 0; ctx.feed('Ice cracked open!', 'star', '#bfe6ff'); } }
          }
          if (VAR.twist === 'feed' && inp.actPressed('use') && me.state === 'idle' && me.feedLeft() > 0) { me.fedCount = (me.fedCount || 0) + 1; me.feed = 30; ctx.sfx('splash'); ctx.feed('You scattered food. Rare koi are drifting closer...', 'star', '#ffd66b'); }
          const frozen = VAR.twist === 'freeze' && me.ice >= 1;
          // the cast
          if (me.state === 'idle' && inp.act('cast') && !frozen) { me.state = 'charging'; me.power = 0; me.pdir = 1; }
          if (me.state === 'charging') {
            me.power += me.pdir * dt / T.charge; if (me.power >= 1) { me.power = 1; me.pdir = -1; } if (me.power <= 0) { me.power = 0; me.pdir = 1; }
            if (!inp.act('cast')) {
              const dist = T.castMin + (T.castMax - T.castMin) * me.power;
              me.lure = VAR.twist === 'freeze' ? { x: (rng() - 0.5) * 50, z: 330 + (rng() - 0.5) * 50 } : { x: (rng() - 0.5) * 120, z: 130 + dist };
              me.state = 'wait'; me.biteT = U.rand(T.bite[0], T.bite[1], rng) * (ctx.hasPass('fast_cast') ? 0.6 : 1);
              me.luck = 0.8 + me.power * 0.5;
              ctx.sfx('swing');
              if (V) V.fx.emit(me.lure.x, -24, me.lure.z, { count: 10, color: '#dff4ff', speed: 60, life: 0.5 });
            }
          } else if (me.state === 'wait') {
            me.biteT -= dt;
            if (me.biteT <= 0) { me.state = 'bite'; me.strikeT = T.strike; ctx.sfx('splash'); }
          } else if (me.state === 'bite') {
            me.strikeT -= dt;
            if (inp.actPressed('cast')) { me.fish = roll(me.luck); me.state = 'reel'; me.progress = 0.3; me.marker = 0.3; me.zone = 0.45; me.zoneV = 0; me.clean = true; me.heat = 0; me.reelT = 0; me.shark = 0; ctx.sfx('hit'); }
            else if (me.strikeT <= 0) { me.lure = null; lose('Too slow, it got away.'); }
          } else if (me.state === 'reel') {
            me.reelT += dt;
            const f = me.fish, d = DIFF[f.rarity] * (VAR.calm ? 0.8 : 1) * (me.shark > 0 ? 1.8 : 1);
            // the fish darts the zone around
            if (rng() < dt * 1.6 * d) me.zoneV = (rng() - 0.5) * 1.6 * d;
            me.zone = U.clamp(me.zone + me.zoneV * dt, me.zoneW() / 2, 1 - me.zoneW() / 2);
            if (me.zone <= me.zoneW() / 2 + 0.01 || me.zone >= 1 - me.zoneW() / 2 - 0.01) me.zoneV *= -1;
            me.marker = U.clamp(me.marker + (inp.act('cast') ? T.rise : -T.fall) * dt * 0.5, 0, 1);
            const inside = Math.abs(me.marker - me.zone) < me.zoneW() / 2;
            me.progress += (inside ? T.gain / Math.sqrt(d) : -T.lose * d * 0.7) * dt;
            if (!inside) me.clean = false;
            if (VAR.twist === 'heat') { me.heat = U.clamp(me.heat + (inp.act('cast') ? T.heat : -T.cool) * dt, 0, 1); if (me.heat >= 1) { me.lure = null; return lose('Your line burned through!'); } }
            if (VAR.twist === 'shark' && me.shark <= 0 && me.reelT > 4 && me.progress < 0.6 && rng() < dt * 0.12) { me.shark = 3; ctx.sfx('beep'); ctx.feed('A shark is circling your catch!', 'warn', '#ff8b98'); }
            if (me.shark > 0) me.shark -= dt;
            if (me.progress >= 1) { me.lure = null; land(f); }
            else if (me.progress <= 0) { me.lure = null; lose(me.shark > 0 ? 'The shark stole your ' + f.name + '!' : 'The ' + f.name + ' got away!'); }
          }
          // bots fish on their own
          for (const b of bots) {
            b.next -= dt;
            if (b.catchT > 0) b.catchT -= dt;
            if (b.next <= 0) {
              b.next = 7 + rng() * 14 / (0.5 + b.skill);
              if (rng() < 0.45 + b.skill * 0.4) {
                const f = roll(0.7 + b.skill * 0.6);
                const o = ctx.botOrder(b.bot.id);
                if (o && o.verb === 'help') { me.haul += Math.round(f.value * 0.5); ctx.feed(b.bot.displayName + ' gave you half their ' + f.name + ' (+' + Math.round(f.value * 0.5) + ')', 'star', '#8fd3ff'); b.haul += Math.round(f.value * 0.5); }
                else b.haul += f.value;
                b.fish = f; b.catchT = 1.4;
                if (f.rarity !== 'common' && f.rarity !== 'uncommon') { ctx.feed(b.bot.displayName + ' caught a ' + f.rarity + ' ' + f.name + '!', 'star', RCOL[f.rarity]); if (rng() < 0.6) ctx.botText(b.bot, U.pick(['LETS GOOO ' + f.name.toUpperCase(), 'finally a ' + f.name.toLowerCase(), 'yooo ' + f.rarity + '!!', 'ok thats a good one']), 400); }
              }
              b.lure = lureFor(b);
            }
          }
        },
        draw: draw2d,
        render3d() { if (view) view(); },
        hud: drawHud,
        onBotJoin(b) { const e = K.join(bots, b, 5, (i) => ({ x: (i % 2 ? 1 : -1) * (110 + Math.floor(i / 2) * 110), y: 10, haul: 0, next: 5, lure: { x: 0, y: 300 }, fish: null, catchT: 0 }), ctx); if (e) e.lure = { x: e.x, y: 300 }; },
        onBotLeave(b) { K.leave(bots, b); },
        _test: { me, bots, roll, land, end, get phase() { return phase; }, VAR },
      };
    },
  });
})((window.BF = window.BF || {}));
