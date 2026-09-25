/**
 * Battle Boats (gameType "boats") — team naval battle.
 * Blue fleet (you + bots) against the red fleet. Boats have momentum and
 * rudder steering; fire broadsides from port (Q) or starboard (E), or click
 * to fire the side facing the cursor. Each team has three lighthouse forts
 * that shoot back. Sinking a boat = 1 point, destroying a fort = 3 points.
 * Win: destroy all three enemy forts, or lead when the clock runs out.
 * Passes: ironclad (+50% hull), twin (two cannonballs per cannon).
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;
  const TAU = Math.PI * 2;

  const MW = 2000, MH = 1200;
  const T = {
    match: 240, hull: 100, accel: 170, maxSpeed: 230, reverse: 70, drag: 0.55, turn: 1.9, reload: 2.2, ballSpeed: 520, ballLife: 0.85,
    dmg: 14, fortHp: 320, fortRange: 330, fortReload: 2.6, respawn: 4,
    rewards: { play: 15, perSink: 6, perFort: 12, win: 55, xpPlay: 30, xpWin: 120 },
  };
  const ISLANDS = [
    { x: 1000, y: 600, r: 120 }, { x: 700, y: 300, r: 70 }, { x: 1300, y: 900, r: 70 },
    { x: 650, y: 950, r: 55 }, { x: 1350, y: 280, r: 55 }, { x: 1000, y: 180, r: 45 }, { x: 1000, y: 1030, r: 45 },
  ];
  const FORTS0 = [
    { team: 'blue', x: 180, y: 250 }, { team: 'blue', x: 130, y: 600 }, { team: 'blue', x: 180, y: 950 },
    { team: 'red', x: 1820, y: 250 }, { team: 'red', x: 1870, y: 600 }, { team: 'red', x: 1820, y: 950 },
  ];
  const TEAM = { blue: { color: '#46a8ff', sail: '#dff0ff', name: 'Blue fleet' }, red: { color: '#ff5a6a', sail: '#ffe3e6', name: 'Red fleet' } };

  BF.GameModules.register('boats', {
    three: true,
    maxBots: 9,
    feedTop: 0.14,
    actions: { port: ['KeyQ'], starboard: ['KeyE'] },
    controls: { joystick: true, buttons: [{ act: 'port', label: 'Fire left', icon: 'arrowLeft' }, { act: 'starboard', label: 'Fire right', icon: 'arrowRight' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const V = ctx.g3;
      const parts = V ? V.particles2d(10) : new BF.Particles(600);
      const floats = V ? V.floaters2d(60) : new BF.Floaters();
      const cam = new BF.Camera(W, H);
      cam.bounds = { x: 0, y: 0, w: MW, h: MH };
      const hullMax = T.hull * (ctx.hasPass('ironclad') ? 1.5 : 1);
      const twin = ctx.hasPass('twin');

      let phase = 'play';
      let clock = T.match;
      const score = { blue: 0, red: 0 };
      const forts = FORTS0.map((f) => Object.assign({}, f, { hp: T.fortHp, cd: 1 + Math.random() * 2, dead: false }));
      const boats = [];
      const balls = [];
      let mySinks = 0, myForts = 0, myDeaths = 0;

      function spawnPos(team) {
        const x = team === 'blue' ? 320 : MW - 320;
        for (let i = 0; i < 30; i++) { const y = 200 + Math.random() * 800; if (boats.every((b) => b.dead || U.dist(b.x, b.y, x, y) > 70)) return { x, y }; }
        return { x, y: 600 };
      }
      function makeBoat(o) {
        const p = spawnPos(o.team);
        return Object.assign({ x: p.x, y: p.y, a: o.team === 'blue' ? 0 : Math.PI, v: 0, hp: o.isMe ? hullMax : T.hull, max: o.isMe ? hullMax : T.hull, cd: { port: 0, starboard: 0 }, dead: 0, flash: 0, sinks: 0, think: 0, target: null, wake: 0 }, o);
      }
      const me = makeBoat({ isMe: true, team: 'blue', name: ctx.player.name, look: ctx.player.look });
      boats.push(me);
      let blueCount = 1, redCount = 0;
      function addBot(b) {
        if (boats.some((x) => x.bot && x.bot.id === b.id)) return;
        const team = blueCount <= redCount ? 'blue' : 'red';
        if (team === 'blue') blueCount++; else redCount++;
        boats.push(makeBoat({ bot: b, team, name: b.displayName, look: b.look, skill: U.clamp((ctx.botLevel(b) || 10) / 55, 0.2, 0.95) }));
      }
      ctx.bots.forEach(addBot);
      // keep teams playable if the server is quiet
      const NPC = ['Harbor Pilot', 'Salt Gull', 'Deckhand Rook', 'Brine Boss'];
      while (redCount < 3) { redCount++; boats.push(makeBoat({ team: 'red', name: NPC[redCount] + ' (AI)', npc: true, skill: 0.4 })); }
      while (blueCount < 3) { blueCount++; boats.push(makeBoat({ team: 'blue', name: NPC[blueCount - 1] + ' (AI)', npc: true, skill: 0.4 })); }

      function fire(b, side) {
        if (b.dead || b.cd[side] > 0) return false;
        b.cd[side] = T.reload;
        const dir = b.a + (side === 'port' ? -Math.PI / 2 : Math.PI / 2);
        const per = b.isMe && twin ? 2 : 1;
        for (let i = -1; i <= 1; i++) for (let k = 0; k < per; k++) {
          const ox = Math.cos(b.a) * i * 14, oy = Math.sin(b.a) * i * 14;
          const spread = (Math.random() - 0.5) * 0.12 + (k ? 0.06 : 0);
          balls.push({ x: b.x + ox + Math.cos(dir) * 14, y: b.y + oy + Math.sin(dir) * 14, vx: Math.cos(dir + spread) * T.ballSpeed + Math.cos(b.a) * b.v * 0.5, vy: Math.sin(dir + spread) * T.ballSpeed + Math.sin(b.a) * b.v * 0.5, t: 0, owner: b, team: b.team });
        }
        parts.emit(b.x + Math.cos(dir) * 16, b.y + Math.sin(dir) * 16, { count: 10, colors: ['#ffffff', '#cfd6e2', '#ffd66b'], speed: 90, life: 0.5, angle: dir, spread: 0.8 });
        if (b.isMe || cam.visible(b.x, b.y)) ctx.sfx('explosion', { volume: b.isMe ? 0.5 : 0.18 });
        return true;
      }
      function hitBoat(b, dmg, by) {
        if (b.dead || phase !== 'play') return;
        b.hp -= dmg;
        b.flash = 0.12;
        parts.emit(b.x, b.y, { count: 8, colors: ['#8b5a2b', '#ffd66b', '#39414f'], speed: 120, life: 0.4 });
        if (b.isMe) { ctx.sfx('hurt', { volume: 0.6 }); cam.shake(4, 0.2); }
        if (b.hp <= 0) {
          b.dead = T.respawn;
          score[b.team === 'blue' ? 'red' : 'blue'] += 1;
          parts.emit(b.x, b.y, { count: 40, colors: ['#8b5a2b', '#ffffff', '#46a8ff'], speed: 200, life: 0.9 });
          if (by) {
            by.sinks++;
            ctx.feed(by.name + ' sank ' + b.name + '!', 'kill', TEAM[by.team].color);
            if (by.isMe) { mySinks++; ctx.addStat('sinks', 1); ctx.playerStat('kills', 1); ctx.quest('kill', 1); ctx.sfx('powerup'); }
            if (by.bot && Math.random() < 0.3) ctx.botSay(by.bot, 'win', 400);
          }
          if (b.isMe) { myDeaths++; ctx.banner('Your boat sank!', 'Respawning at the harbor', 1500); }
        }
      }
      function hitFort(f, dmg, by) {
        if (f.dead) return;
        f.hp -= dmg;
        parts.emit(f.x, f.y, { count: 6, colors: ['#9aa5b5', '#ffd66b'], speed: 100, life: 0.4 });
        if (f.hp <= 0) {
          f.dead = true;
          score[f.team === 'blue' ? 'red' : 'blue'] += 3;
          parts.emit(f.x, f.y, { count: 60, colors: ['#ffd66b', '#ff7a2e', '#9aa5b5'], speed: 260, life: 1 });
          ctx.sfx('explosion');
          cam.shake(6, 0.3);
          ctx.feed((by ? by.name : 'Cannon fire') + ' destroyed a ' + (f.team === 'blue' ? 'blue' : 'red') + ' fort!', 'star', '#ffd66b');
          if (by && by.isMe) { myForts++; ctx.badge('bt_fort'); ctx.reward(T.rewards.perFort, 'forts destroyed'); }
          const left = forts.filter((x) => x.team === f.team && !x.dead).length;
          if (!left) finish(f.team === 'blue' ? 'red' : 'blue', true);
        }
      }
      const blocked = (x, y, r) => x < r || y < r || x > MW - r || y > MH - r || ISLANDS.some((i) => U.dist(i.x, i.y, x, y) < i.r + r) || forts.some((f) => !f.dead && U.dist(f.x, f.y, x, y) < 34 + r);

      function stepBoat(b, dt, throttle, steer) {
        if (b.dead) {
          b.dead -= dt;
          if (b.dead <= 0) { const p = spawnPos(b.team); Object.assign(b, { x: p.x, y: p.y, a: b.team === 'blue' ? 0 : Math.PI, v: 0, hp: b.max, dead: 0 }); }
          return;
        }
        b.cd.port = Math.max(0, b.cd.port - dt); b.cd.starboard = Math.max(0, b.cd.starboard - dt);
        if (b.flash > 0) b.flash -= dt;
        b.v += throttle * (throttle > 0 ? T.accel : T.accel * 0.7) * dt;
        b.v -= b.v * T.drag * dt;
        b.v = U.clamp(b.v, -T.reverse, T.maxSpeed);
        b.a += steer * T.turn * dt * U.clamp(Math.abs(b.v) / 120, 0.25, 1) * Math.sign(b.v || 1);
        const nx = b.x + Math.cos(b.a) * b.v * dt, ny = b.y + Math.sin(b.a) * b.v * dt;
        if (blocked(nx, ny, 16)) { b.v *= -0.35; if (b.isMe && Math.abs(b.v) > 40) ctx.sfx('hit', { volume: 0.4 }); }
        else { b.x = nx; b.y = ny; }
        b.wake += Math.abs(b.v) * dt;
        if (b.wake > 18) { b.wake = 0; parts.emit(b.x - Math.cos(b.a) * 20, b.y - Math.sin(b.a) * 20, { count: 1, color: 'rgba(255,255,255,.6)', speed: 10, life: 1.2 }); }
      }

      function botControl(b, dt) {
        b.think -= dt;
        if (b.think <= 0 || !b.target || (b.target.hp != null && (b.target.dead === true || b.target.dead > 0))) {
          b.think = 1.5 + Math.random();
          const enemies = boats.filter((o) => o.team !== b.team && !o.dead);
          const eforts = forts.filter((f) => f.team !== b.team && !f.dead);
          const nearBoat = enemies.sort((x, y) => U.dist(x.x, x.y, b.x, b.y) - U.dist(y.x, y.y, b.x, b.y))[0];
          const nearFort = eforts.sort((x, y) => U.dist(x.x, x.y, b.x, b.y) - U.dist(y.x, y.y, b.x, b.y))[0];
          b.target = nearBoat && (!nearFort || U.dist(nearBoat.x, nearBoat.y, b.x, b.y) < 420 || Math.random() < 0.5) ? nearBoat : nearFort || nearBoat || null;
        }
        const tg = b.target;
        if (!tg) return { throttle: 0.3, steer: 0 };
        const dist = U.dist(tg.x, tg.y, b.x, b.y);
        const toT = U.angleTo(b.x, b.y, tg.x, tg.y);
        let want;
        if (dist > 260) want = toT;
        else want = toT + (U.wrapAngle(b.a - toT) > 0 ? Math.PI / 2 : -Math.PI / 2);
        // avoid islands
        const ahead = { x: b.x + Math.cos(b.a) * 90, y: b.y + Math.sin(b.a) * 90 };
        if (blocked(ahead.x, ahead.y, 20)) want = b.a + Math.PI / 2;
        const diff = U.wrapAngle(want - b.a);
        const steer = U.clamp(diff * 2, -1, 1);
        // fire when abeam
        if (dist < 330) {
          const rel = U.wrapAngle(toT - b.a);
          const aimErr = (1 - b.skill) * 0.5 + 0.2;
          if (Math.abs(rel - Math.PI / 2) < aimErr) fire(b, 'starboard');
          else if (Math.abs(rel + Math.PI / 2) < aimErr) fire(b, 'port');
        }
        return { throttle: dist > 180 ? 1 : 0.55, steer };
      }

      function finish(winner, forts3) {
        if (phase !== 'play') return;
        phase = 'over';
        const won = winner === 'blue';
        const draw = !winner;
        if (won) ctx.badge('bt_admiral');
        ctx.end({
          outcome: draw ? 'draw' : won ? 'win' : 'lose',
          title: draw ? 'Draw on the high seas' : won ? (forts3 ? 'All enemy forts destroyed!' : 'Blue fleet wins!') : 'The red fleet won',
          subtitle: 'Blue ' + score.blue + ' – ' + score.red + ' Red',
          coins: T.rewards.play + mySinks * T.rewards.perSink + (won ? T.rewards.win : 0),
          xp: T.rewards.xpPlay + (won ? T.rewards.xpWin : 0),
          stats: [['Boats sunk', mySinks], ['Forts destroyed', myForts], ['Times sunk', myDeaths], ['Final score', score.blue + ' – ' + score.red]],
        });
      }

      ctx.banner('BATTLE STATIONS!', 'Q / E fire broadsides · sink boats and forts', 1800);

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        V.preset('day', { fogNear: 1300, fogFar: 3600 });
        V.shadowSize(620);
        const waveTex = V.own(new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g2 = c.getContext('2d'); g2.fillStyle = '#1576b0'; g2.fillRect(0, 0, 128, 128); g2.strokeStyle = 'rgba(255,255,255,.18)'; g2.lineWidth = 3; for (let y = 16; y < 128; y += 32) { g2.beginPath(); for (let x = 0; x <= 128; x += 8) g2.lineTo(x, y + Math.sin((x / 128) * Math.PI * 4) * 5); g2.stroke(); } return c; })()));
        waveTex.wrapS = waveTex.wrapT = THREE.RepeatWrapping;
        waveTex.repeat.set(60, 40);
        waveTex.colorSpace = THREE.SRGBColorSpace;
        V.ground(-2500, -2000, MW + 2500, MH + 2000, '#ffffff', { map: waveTex, rough: 0.35, metal: 0.1 });
        // arena edge buoys
        const buoys = [];
        for (let x = 0; x <= MW; x += 100) buoys.push({ x, z: 0 }, { x, z: MH });
        for (let y = 100; y < MH; y += 100) buoys.push({ x: 0, z: y }, { x: MW, z: y });
        V.boxes(buoys.map((b, i) => ({ x: b.x, y: -2, z: b.z, w: 10, h: 14, d: 10, color: i % 2 ? '#ffffff' : '#ff5a6a' })), { geo: 'cylLo' });
        // islands with palms
        const palms = [], fronds = [];
        const r = U.rng('bb3d');
        for (const is of ISLANDS) {
          V.shape('cyl', is.x, -2, is.y, (is.r + 12) * 2, 10, (is.r + 12) * 2, '#e8d08a');
          V.shape('cyl', is.x, 4, is.y, (is.r - 2) * 2, 6, (is.r - 2) * 2, '#5fae52');
          const n = Math.max(1, Math.round(is.r / 35));
          for (let i = 0; i < n; i++) { const a = r() * TAU, dd = r() * is.r * 0.55; const x = is.x + Math.cos(a) * dd, z = is.y + Math.sin(a) * dd; palms.push({ x, y: 6, z, w: 7, h: 46, d: 7, color: '#8b5a2b' }); for (let k = 0; k < 4; k++) fronds.push({ x: x + Math.cos(k * 1.57) * 12, y: 50, z: z + Math.sin(k * 1.57) * 12, w: 30, h: 4, d: 10, color: '#2f9a47', rot: k * 1.57 }); }
          V.shape('dodeca', is.x + is.r * 0.3, 10, is.y + is.r * 0.2, is.r * 0.5, is.r * 0.35, is.r * 0.45, '#8a909c', { flat: true });
        }
        V.boxes(palms, { geo: 'cylLo' });
        V.boxes(fronds);
        // lighthouse forts
        const fortMeshes = forts.map((f) => {
          const g = V.group();
          g.position.set(f.x, 0, f.y);
          V.shape('cyl', 0, 2, 0, 90, 14, 90, '#9aa5b5', { parent: g });
          const alive = V.group(g);
          V.shape('cyl', 0, 45, 0, 44, 76, 44, '#f4f1ea', { parent: alive });
          for (const y of [26, 56]) V.shape('cyl', 0, y, 0, 45, 10, 45, TEAM[f.team].color, { parent: alive });
          V.shape('cyl', 0, 90, 0, 30, 14, 30, '#fff6c8', { parent: alive, glow: 1.1 });
          V.shape('cone', 0, 108, 0, 38, 20, 38, TEAM[f.team].color, { parent: alive });
          const beam = V.group(alive); beam.position.y = 90;
          const cone = V.shape('cone', 90, 0, 0, 40, 180, 40, '#fff6c8', { parent: beam, basic: true, opacity: 0.16, depthWrite: false, shadow: false });
          cone.rotation.z = Math.PI / 2;
          const rubble = V.group(g);
          for (let i = 0; i < 6; i++) V.box(Math.cos(i) * 18, 8, Math.sin(i * 1.7) * 18, 14, 10 + (i % 3) * 8, 12, '#6a707c', { parent: rubble });
          return { f, g, alive, rubble, beam };
        });
        const boatPool = V.pool(), ballPool = V.pool();
        const arcGeo = V.own(new THREE.RingGeometry(0.2, 1, 16, 1, 0, 0.7));
        const arcs = ['port', 'starboard'].map(() => { const m = new THREE.Mesh(arcGeo, V.mat('#ffffff', { basic: true, opacity: 0.25, side: 2, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 1.5; V.scene.add(m); return m; });

        return function sync(dt) {
          const t = ctx.time;
          waveTex.offset.set((t * 0.01) % 1, (t * 0.02) % 1);
          V.look(me.x + Math.cos(me.a) * me.v * 0.4, 0, me.y + Math.sin(me.a) * me.v * 0.4 + 20, { dist: 640, pitch: 0.92, fov: 45, lerp: 0.1 }, dt);
          for (const fm of fortMeshes) {
            fm.alive.visible = !fm.f.dead;
            fm.rubble.visible = fm.f.dead;
            fm.beam.rotation.y = -(t * 1.2 + (fm.f.team === 'red' ? 1 : 0));
            if (!fm.f.dead && Math.abs(fm.f.x - me.x) < 900) V.label(fm.f.x, 130, fm.f.y, { hp: fm.f.hp / T.fortHp, hpColor: TEAM[fm.f.team].color });
          }
          for (const b of boats) {
            const sinking = b.dead && b.dead > T.respawn - 1.5;
            if (b.dead && !sinking) continue;
            const m = boatPool.use(b, () => {
              const g = V.group();
              g.add(BF.props3d.ship({ team: TEAM[b.team].color, sail: TEAM[b.team].sail }));
              const av = b.isMe ? ctx.player.avatar : b.bot && b.bot.avatar;
              if (av) { const rig = BF.char3d.build(av); rig.group.scale.setScalar(3.2); rig.group.position.set(-19, 16, 0); rig.group.rotation.y = Math.PI / 2; rig.tick(0.016); g.add(rig.group); g.userData.rig = rig; }
              V.scene.add(g);
              return g;
            });
            const k = sinking ? 1 - (b.dead - (T.respawn - 1.5)) / 1.5 : 0;
            m.scale.setScalar(1.3);
            m.position.set(b.x, Math.sin(t * 2 + b.x * 0.01) * 1.5 - k * 40, b.y);
            m.rotation.set(Math.sin(t * 1.7 + b.y) * 0.04 + k * 0.6, -b.a, Math.sin(t * 1.3 + b.x) * 0.03);
            if (m.userData.rig) m.userData.rig.tick(dt);
            if (!b.dead) V.label(b.x, 70, b.y, { name: b.name, color: b.isMe ? '#ffb454' : TEAM[b.team].color, hp: b.hp / b.max, hpColor: TEAM[b.team].color, bubble: b.bot ? ctx.bubbleText(b.bot.id) : b.isMe ? ctx.bubbleText('me') : null });
          }
          boatPool.sweep();
          for (const b of balls) {
            const m = ballPool.use(b, () => V.shape('sphere', 0, 0, 0, 10, 10, 10, '#1b1b22', { metal: 0.4 }));
            const k = b.t / T.ballLife;
            m.position.set(b.x, 14 + Math.sin(k * Math.PI) * 26, b.y);
          }
          ballPool.sweep();
          [['port', -1], ['starboard', 1]].forEach(([side, sgn], i) => {
            const arc = arcs[i];
            arc.visible = !me.dead;
            if (!arc.visible) return;
            const ready = me.cd[side] <= 0;
            const dir = me.a + sgn * Math.PI / 2;
            arc.position.set(me.x, 1.5, me.y);
            arc.scale.set(100, 100, 1);
            arc.rotation.z = -(dir + 0.35);
            arc.material = V.mat(ready ? '#ffffff' : '#cfd6e2', { basic: true, opacity: ready ? 0.28 : 0.08, side: 2, depthWrite: false });
          });
          V.sweep();
        };
      })();

      return {
        update(dt) {
          parts.update(dt);
          floats.update(dt);
          if (phase !== 'play') return;
          clock -= dt;
          if (clock <= 0) { finish(score.blue > score.red ? 'blue' : score.red > score.blue ? 'red' : null); return; }
          if (clock < 11 && Math.floor(clock) !== Math.floor(clock + dt)) ctx.sfx('beep', { volume: 0.4 });
          const inp = ctx.input;
          const ax = inp.axis();
          stepBoat(me, dt, -ax.y, ax.x);
          if (!me.dead) {
            if (inp.actPressed('port')) fire(me, 'port');
            if (inp.actPressed('starboard')) fire(me, 'starboard');
            if (inp.pointer.pressed) { const w = V ? ctx.pointerWorld(0) : cam.toWorld(inp.pointer.x, inp.pointer.y); const rel = U.wrapAngle(U.angleTo(me.x, me.y, w.x, w.y) - me.a); fire(me, rel > 0 ? 'starboard' : 'port'); }
          }
          for (const b of boats) if (!b.isMe) { const c = b.dead ? { throttle: 0, steer: 0 } : botControl(b, dt); stepBoat(b, dt, c.throttle, c.steer); }
          // boat collisions
          for (let i = 0; i < boats.length; i++) for (let j = i + 1; j < boats.length; j++) {
            const a = boats[i], b = boats[j];
            if (a.dead || b.dead) continue;
            const dd = U.dist(a.x, a.y, b.x, b.y);
            if (dd < 34 && dd > 0) { const push = (34 - dd) / 2, nx = (a.x - b.x) / dd, ny = (a.y - b.y) / dd; a.x += nx * push; a.y += ny * push; b.x -= nx * push; b.y -= ny * push; a.v *= 0.9; b.v *= 0.9; }
          }
          // forts
          for (const f of forts) {
            if (f.dead) continue;
            f.cd -= dt;
            if (f.cd > 0) continue;
            const tg = boats.filter((b) => b.team !== f.team && !b.dead && U.dist(b.x, b.y, f.x, f.y) < T.fortRange).sort((a, b) => U.dist(a.x, a.y, f.x, f.y) - U.dist(b.x, b.y, f.x, f.y))[0];
            if (tg) { f.cd = T.fortReload; const lead = U.dist(tg.x, tg.y, f.x, f.y) / T.ballSpeed; const a = U.angleTo(f.x, f.y, tg.x + Math.cos(tg.a) * tg.v * lead, tg.y + Math.sin(tg.a) * tg.v * lead); balls.push({ x: f.x, y: f.y, vx: Math.cos(a) * T.ballSpeed, vy: Math.sin(a) * T.ballSpeed, t: 0, owner: null, team: f.team, fort: true }); if (cam.visible(f.x, f.y)) ctx.sfx('shoot', { volume: 0.3 }); }
          }
          // cannonballs
          for (let i = balls.length - 1; i >= 0; i--) {
            const b = balls[i];
            b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
            let hit = false;
            for (const bt of boats) { if (bt.team === b.team || bt.dead) continue; if (U.dist(bt.x, bt.y, b.x, b.y) < 18) { hitBoat(bt, b.fort ? 18 : T.dmg, b.owner); hit = true; break; } }
            if (!hit) for (const f of forts) { if (f.team === b.team || f.dead) continue; if (U.dist(f.x, f.y, b.x, b.y) < 32) { hitFort(f, T.dmg, b.owner); hit = true; break; } }
            if (!hit && ISLANDS.some((is) => U.dist(is.x, is.y, b.x, b.y) < is.r)) hit = true;
            if (hit || b.t > T.ballLife) { balls.splice(i, 1); if (!hit) parts.emit(b.x, b.y, { count: 5, color: 'rgba(255,255,255,.8)', speed: 50, life: 0.5 }); }
          }
          cam.follow(me.x + Math.cos(me.a) * me.v * 0.4, me.y + Math.sin(me.a) * me.v * 0.4, dt, 0.12);
        },

        draw(g) {
          const t = ctx.time;
          g.fillStyle = '#1576b0'; g.fillRect(0, 0, W, H);
          g.save();
          cam.apply(g);
          g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2;
          for (let y = Math.floor(cam.y / 60) * 60; y < cam.y + H + 60; y += 60) { g.beginPath(); for (let x = Math.floor(cam.x / 40) * 40; x < cam.x + W + 40; x += 40) { const yy = y + Math.sin(x * 0.02 + t * 1.5 + y) * 6; if (x === Math.floor(cam.x / 40) * 40) g.moveTo(x, yy); else g.lineTo(x, yy); } g.stroke(); }
          g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 4; g.strokeRect(2, 2, MW - 4, MH - 4);
          for (const is of ISLANDS) { if (!cam.visible(is.x, is.y, is.r + 40)) continue; G.circle(g, is.x, is.y, is.r + 10, '#e8d08a'); G.circle(g, is.x, is.y, is.r - 4, '#5fae52'); G.circle(g, is.x - is.r * 0.3, is.y - is.r * 0.2, is.r * 0.35, '#2f8f47'); }
          for (const f of forts) {
            if (!cam.visible(f.x, f.y, 80)) continue;
            G.circle(g, f.x, f.y, 40, '#9aa5b5');
            if (f.dead) { G.circle(g, f.x, f.y, 28, '#4a4f5a'); continue; }
            G.circle(g, f.x, f.y, 26, '#f4f1ea'); G.circle(g, f.x, f.y, 14, TEAM[f.team].color);
            const beam = t * 1.2 + (f.team === 'red' ? 1 : 0);
            g.globalAlpha = 0.18; g.fillStyle = '#fff6c8'; g.beginPath(); g.moveTo(f.x, f.y); g.arc(f.x, f.y, 140, beam - 0.2, beam + 0.2); g.closePath(); g.fill(); g.globalAlpha = 1;
            G.bar(g, f.x - 30, f.y - 54, 60, 6, f.hp / T.fortHp, TEAM[f.team].color);
          }
          for (const b of balls) G.circle(g, b.x, b.y, b.fort ? 5 : 4.5, '#1b1b22');
          for (const b of boats) {
            if (b.dead || !cam.visible(b.x, b.y)) continue;
            g.save(); g.translate(b.x, b.y); g.rotate(b.a);
            G.shadow(g, 3, 4, 30, 12, 0.25);
            g.fillStyle = b.flash > 0 ? '#ffffff' : '#7a4a2a';
            g.beginPath(); g.moveTo(30, 0); g.quadraticCurveTo(12, -15, -24, -12); g.lineTo(-26, 12); g.quadraticCurveTo(12, 15, 30, 0); g.closePath(); g.fill();
            g.fillStyle = '#a86b3c'; g.fillRect(-18, -8, 34, 16);
            g.fillStyle = '#39414f'; for (const i of [-10, 0, 10]) { g.fillRect(i - 3, -14, 6, 4); g.fillRect(i - 3, 10, 6, 4); }
            g.fillStyle = TEAM[b.team].sail; g.beginPath(); g.moveTo(2, -18); g.quadraticCurveTo(10, 0, 2, 18); g.lineTo(-2, 18); g.lineTo(-2, -18); g.closePath(); g.fill();
            g.fillStyle = TEAM[b.team].color; g.fillRect(-4, -3, 8, 6);
            g.restore();
            G.bar(g, b.x - 20, b.y + 22, 40, 4, b.hp / b.max, TEAM[b.team].color);
            G.nameTag(g, b.x, b.y - 24, b.name, b.isMe ? '#ffb454' : TEAM[b.team].color);
            const bb = b.bot && ctx.bubbleText(b.bot.id);
            const mb = b.isMe && ctx.bubbleText('me');
            if (bb || mb) G.bubble(g, b.x, b.y - 44, bb || mb);
          }
          if (!me.dead) {
            // broadside arcs
            for (const [side, sgn] of [['port', -1], ['starboard', 1]]) {
              const ready = me.cd[side] <= 0;
              const dir = me.a + sgn * Math.PI / 2;
              g.globalAlpha = ready ? 0.25 : 0.08;
              g.fillStyle = ready ? '#ffffff' : '#cfd6e2';
              g.beginPath(); g.moveTo(me.x, me.y); g.arc(me.x, me.y, 90, dir - 0.35, dir + 0.35); g.closePath(); g.fill();
              g.globalAlpha = 1;
            }
          }
          parts.draw(g);
          floats.draw(g);
          g.restore();
          drawHud(g);
        },

        render3d(dt) { view(dt); },
        hud(g) { drawHud(g); },

        onBotJoin(b) { addBot(b); },
        onBotLeave(b) { const i = boats.findIndex((x) => x.bot && x.bot.id === b.id); if (i >= 0) { const bt = boats[i]; boats.splice(i, 1); if (bt.team === 'blue') blueCount--; else redCount--; } },
      };

      function drawHud(g) {
          G.panel(g, W / 2 - 150, 10, 300, 52);
          G.text(g, String(score.blue), W / 2 - 60, 46, { size: 28, weight: 900, align: 'center', color: TEAM.blue.color });
          G.text(g, String(score.red), W / 2 + 60, 46, { size: 28, weight: 900, align: 'center', color: TEAM.red.color });
          G.text(g, U.fmtClock(clock), W / 2, 42, { size: 16, weight: 800, align: 'center', color: clock < 30 ? '#ff8b98' : '#fff' });
          G.text(g, 'Forts ' + forts.filter((f) => f.team === 'blue' && !f.dead).length + ' · ' + forts.filter((f) => f.team === 'red' && !f.dead).length, W / 2, 58, { size: 10, align: 'center', color: '#a1abbb' });
          G.panel(g, 10, H - 62, 250, 52);
          G.text(g, 'Hull', 22, H - 42, { size: 11, color: '#a1abbb' });
          G.bar(g, 56, H - 50, 190, 9, me.hp / me.max, me.hp / me.max < 0.3 ? '#ff5a6a' : '#3fd08a');
          G.text(g, 'Q ' + (me.cd.port > 0 ? me.cd.port.toFixed(1) + 's' : 'READY'), 22, H - 20, { size: 12, color: me.cd.port > 0 ? '#a1abbb' : '#ffd66b', weight: 800 });
          G.text(g, 'E ' + (me.cd.starboard > 0 ? me.cd.starboard.toFixed(1) + 's' : 'READY'), 140, H - 20, { size: 12, color: me.cd.starboard > 0 ? '#a1abbb' : '#ffd66b', weight: 800 });
          if (me.dead) G.display(g, 'Respawning in ' + Math.ceil(me.dead), W / 2, H / 2, 28, '#ff8b98');
          // minimap
          const mw = 170, mh = mw * (MH / MW), mx = W - mw - 10, my = H - mh - 10, k = mw / MW;
          G.panel(g, mx - 4, my - 4, mw + 8, mh + 8, 0.75);
          g.fillStyle = 'rgba(21,118,176,.8)'; g.fillRect(mx, my, mw, mh);
          for (const is of ISLANDS) G.circle(g, mx + is.x * k, my + is.y * k, Math.max(2, is.r * k), '#5fae52');
          for (const f of forts) if (!f.dead) G.circle(g, mx + f.x * k, my + f.y * k, 3.5, TEAM[f.team].color);
          for (const b of boats) if (!b.dead) G.circle(g, mx + b.x * k, my + b.y * k, b.isMe ? 3.5 : 2.2, b.isMe ? '#ffffff' : TEAM[b.team].color);
      }
    },
  });
})((window.BF = window.BF || {}));
