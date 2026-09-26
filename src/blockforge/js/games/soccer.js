/**
 * Pixel Soccer (gameType "soccer") — 3v3 arcade football.
 * You and two bot teammates (blue) against three bots (red) on a walled
 * pitch. Hold Space to charge a kick and release to shoot; Shift sprints
 * (stamina). Bots play roles: keeper, defender and forward. They pass,
 * dribble, clear and shoot. Tied at full time: golden goal overtime.
 * Win: more goals at the end. Lose: fewer. Draw: still level after overtime.
 * Passes: power_boots (+35% kick power), super_sprint (half stamina drain).
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;
  const TAU = Math.PI * 2;

  const X0 = 50, Y0 = 70, X1 = 910, Y1 = 510, GY0 = 230, GY1 = 350, GD = 34;
  const CX = (X0 + X1) / 2, CY = (Y0 + Y1) / 2;
  const T = {
    match: 180, overtime: 60, speed: 165, sprint: 1.45, stamina: 100, drain: 32, regen: 16, pr: 13, br: 8,
    kickMin: 360, kickMax: 900, charge: 0.9, reach: 30, friction: 0.55, bounce: 0.78,
    rewards: { play: 15, perGoal: 10, win: 50, draw: 20, xpPlay: 30, xpGoal: 20, xpWin: 110 },
  };
  const TEAMS = { blue: { color: '#46a8ff', dark: '#1f5f9a', dir: 1 }, red: { color: '#ff5a6a', dark: '#9a2a3a', dir: -1 } };
  const FORMATION = { gk: [0.06, 0.5], def: [0.28, 0.35], fwd: [0.42, 0.65], me: [0.38, 0.5] };

  BF.GameModules.register('soccer', {
    orders: ['pass', 'follow', 'come', 'stay', 'help'],
    three: true,
    maxBots: 5,
    feedTop: 0.13,
    actions: { kick: ['Space', 'KeyJ'], sprint: ['ShiftLeft', 'ShiftRight', 'KeyK'] },
    controls: { joystick: true, buttons: [{ act: 'kick', label: 'Kick (hold)', icon: 'ball' }, { act: 'sprint', label: 'Sprint', icon: 'run' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const V = ctx.g3;
      const parts = V ? V.particles2d(8) : new BF.Particles(300);
      const floats = V ? V.floaters2d(60) : new BF.Floaters();
      /** Pointer on the pitch (ground-picked in 3D). */
      const ptr = () => (V ? ctx.pointerWorld(8) : ctx.input.pointer);
      const powerBoots = ctx.hasPass('power_boots');
      const superSprint = ctx.hasPass('super_sprint');

      let phase = 'kickoff';
      let pauseT = 2;
      let clock = T.match;
      let overtime = false;
      const score = { blue: 0, red: 0 };
      let myGoals = 0, myShots = 0, lastTouch = null;
      let pendingKickoff = null;
      const ball = { x: CX, y: CY, vx: 0, vy: 0, spin: 0 };
      const players = [];

      function home(p) {
        const f = FORMATION[p.role];
        const fx = p.team === 'blue' ? X0 + f[0] * (X1 - X0) : X1 - f[0] * (X1 - X0);
        return { x: fx, y: Y0 + f[1] * (Y1 - Y0) };
      }
      function addPlayer(o) {
        const p = Object.assign({ x: 0, y: 0, vx: 0, vy: 0, a: 0, walk: 0, stamina: T.stamina, charge: 0, kickCd: 0, think: 0, goals: 0 }, o);
        const h = home(p); p.x = h.x; p.y = h.y; p.a = p.team === 'blue' ? 0 : Math.PI;
        players.push(p);
        return p;
      }
      const me = addPlayer({ isMe: true, team: 'blue', role: 'me', name: ctx.player.name, look: ctx.player.look, skill: 1 });
      const need = { blue: ['gk', 'def'], red: ['gk', 'def', 'fwd'] };
      function addBot(b) {
        if (players.some((p) => p.bot && p.bot.id === b.id)) return false;
        const team = need.blue.length ? 'blue' : need.red.length ? 'red' : null;
        if (!team) return false;
        const role = need[team].shift();
        addPlayer({ bot: b, team, role, name: b.displayName, look: b.look, skill: U.clamp((ctx.botLevel(b) || 10) / 55, 0.25, 0.95) });
        return true;
      }
      ctx.bots.forEach(addBot);
      const NPC = { blue: ['Coach Pip', 'Sub Ranger'], red: ['Red Striker', 'Red Wall', 'Red Keeper'] };
      for (const team of ['blue', 'red']) while (need[team].length) { const role = need[team].shift(); addPlayer({ team, role, npc: true, name: NPC[team].shift() + ' (AI)', look: { skin: '#e0ac69', shirt: TEAMS[team].color, shirt2: '#ffffff', pants: '#1f2a44', shoes: '#1b1b22', hair: '#1b1b22' }, skill: 0.45 }); }

      function resetKickoff(scoredOn) {
        ball.x = CX; ball.y = CY; ball.vx = 0; ball.vy = 0;
        for (const p of players) { const h = home(p); p.x = h.x; p.y = h.y; p.vx = 0; p.vy = 0; p.charge = 0; }
        if (scoredOn) { const taker = players.find((p) => p.team === scoredOn && p.role === 'fwd') || (scoredOn === 'blue' ? me : null); if (taker) { taker.x = CX - TEAMS[scoredOn].dir * 30; taker.y = CY; } }
        phase = 'kickoff'; pauseT = 1.6;
      }

      function kick(p, angle, power) {
        const k = powerBoots && p.isMe ? 1.35 : 1;
        ball.vx = Math.cos(angle) * power * k;
        ball.vy = Math.sin(angle) * power * k;
        ball.spin = power / 40;
        p.kickCd = 0.35;
        lastTouch = p;
        parts.emit(ball.x, ball.y, { count: 6, color: '#ffffff', speed: 80, life: 0.3 });
        ctx.sfx('hit', { volume: p.isMe ? 0.6 : 0.3 });
        if (p.isMe) myShots++;
      }
      const goalX = (team) => (team === 'blue' ? X1 : X0); // where `team` attacks
      const ownGoalX = (team) => (team === 'blue' ? X0 : X1);

      function goal(scorer, forTeam) {
        score[forTeam]++;
        phase = 'goal'; pauseT = 2.2;
        ctx.sfx('goal');
        parts.emit(ball.x, ball.y, { count: 60, colors: [TEAMS[forTeam].color, '#ffffff', '#ffd66b'], speed: 260, life: 1 });
        const own = scorer && scorer.team !== forTeam;
        ctx.banner('GOAL!', (scorer ? scorer.name + (own ? ' (own goal)' : '') : 'Deflection') + ' · Blue ' + score.blue + ' – ' + score.red + ' Red', 2000);
        if (scorer && !own) scorer.goals++;
        if (scorer && scorer.isMe && !own) {
          myGoals++;
          ctx.addStat('goals', 1); ctx.playerStat('goals', 1); ctx.quest('goal', 1); ctx.xp(T.rewards.xpGoal);
          ctx.badge('ps_first_goal');
          if (myGoals >= 3) ctx.badge('ps_hat_trick');
        }
        if (scorer && scorer.bot && Math.random() < 0.6) ctx.botSay(scorer.bot, 'win', 500);
        const conceded = forTeam === 'blue' ? 'red' : 'blue';
        pendingKickoff = conceded;
        if (overtime) { finish(); return; }
      }
      function finish() {
        if (phase === 'over') return;
        phase = 'over';
        const win = score.blue > score.red, draw = score.blue === score.red;
        if (win) ctx.badge('ps_champ');
        ctx.end({
          outcome: draw ? 'draw' : win ? 'win' : 'lose',
          title: draw ? 'Full time: a draw' : win ? 'You won the match!' : 'Defeat',
          subtitle: 'Blue ' + score.blue + ' – ' + score.red + ' Red' + (overtime ? ' (after golden goal overtime)' : ''),
          coins: T.rewards.play + myGoals * T.rewards.perGoal + (win ? T.rewards.win : draw ? T.rewards.draw : 0),
          xp: T.rewards.xpPlay + (win ? T.rewards.xpWin : 0),
          stats: [['Your goals', myGoals], ['Shots', myShots], ['Score', score.blue + ' – ' + score.red]],
          delay: 1400,
        });
      }

      // ------------------------------------------------------------------ AI
      function nearestToBall(team) {
        return players.filter((p) => p.team === team && p.role !== 'gk').sort((a, b) => U.dist(a.x, a.y, ball.x, ball.y) - U.dist(b.x, b.y, ball.x, ball.y))[0];
      }
      function botThink(p, dt) {
        const dir = TEAMS[p.team].dir;
        const d2b = U.dist(p.x, p.y, ball.x, ball.y);
        let tx, ty;
        if (p.role === 'gk') {
          const gx = ownGoalX(p.team) + dir * 22;
          tx = gx + dir * (Math.abs(ball.x - gx) < 200 ? 20 : 0);
          ty = U.clamp(ball.y, GY0 + 6, GY1 - 6);
          if (d2b < 90 && Math.sign(ball.x - gx) === dir) { tx = ball.x; ty = ball.y; }
        } else {
          const chaser = nearestToBall(p.team);
          if (chaser === p || (p.role === 'fwd' && d2b < 140)) { tx = ball.x - dir * 10; ty = ball.y; }
          else if (p.role === 'def') { tx = U.lerp(ownGoalX(p.team), ball.x, 0.35); ty = U.lerp(CY, ball.y, 0.6); }
          else { tx = U.lerp(ball.x, goalX(p.team), 0.35); ty = ball.y < CY ? CY + 70 : CY - 70; }
        }
        // orders from chat (teammates only): pass me the ball, come / follow / support me, stay
        const ord = p.bot && p.team === me.team ? ctx.botOrder(p.bot.id) : null;
        if (ord && ord.verb === 'pass') { tx = ball.x - dir * 10; ty = ball.y; }
        else if (ord && p.role !== 'gk') { const og = BF.orders.goal(ctx, p.bot.id, p, me, { near: 70, bounds: { x0: 40, y0: 40, x1: 920, y1: 500 } }); if (og) { if (og.hold) { tx = p.x; ty = p.y; } else { tx = og.x; ty = og.y; } } }
        if (ord && ord.verb === 'pass' && d2b < T.reach && p.kickCd <= 0) {
          kick(p, Math.atan2(me.y + me.vy * 0.3 - ball.y, me.x + me.vx * 0.3 - ball.x), 460 + U.dist(me.x, me.y, ball.x, ball.y) * 0.45);
          ctx.clearOrder(p.bot.id);
        }
        const dx = tx - p.x, dy = ty - p.y, l = Math.hypot(dx, dy);
        const sp = T.speed * (0.8 + p.skill * 0.25);
        if (l > 4) { p.vx = (dx / l) * sp; p.vy = (dy / l) * sp; } else { p.vx = 0; p.vy = 0; }
        // decide to kick
        if (d2b < T.reach && p.kickCd <= 0) {
          const gX = goalX(p.team);
          const toGoal = Math.atan2(CY + (Math.random() - 0.5) * (GY1 - GY0) * 0.7 - ball.y, gX - ball.x);
          const distGoal = Math.abs(gX - ball.x);
          if (p.role === 'gk') kick(p, Math.atan2((Math.random() - 0.5) * 300, dir * 400), 700);
          else if (distGoal < 320) { kick(p, toGoal + (Math.random() - 0.5) * (0.35 - p.skill * 0.25), T.kickMin + (T.kickMax - T.kickMin) * (0.6 + p.skill * 0.35)); }
          else {
            const mates = players.filter((m) => m.team === p.team && m !== p && m.role !== 'gk' && (m.x - p.x) * dir > 20);
            const pressure = players.some((o) => o.team !== p.team && U.dist(o.x, o.y, p.x, p.y) < 50);
            if (mates.length && (pressure || Math.random() < dt * 1.2)) {
              const m = mates[0];
              kick(p, Math.atan2(m.y + m.vy * 0.3 - ball.y, m.x + m.vx * 0.3 - ball.x), 460 + U.dist(m.x, m.y, ball.x, ball.y) * 0.4);
            } else if (pressure && Math.random() < 0.5) kick(p, toGoal + (Math.random() - 0.5) * 0.6, 560);
            else { // dribble: tap forward
              ball.vx = dir * (120 + p.skill * 60) + p.vx * 0.3; ball.vy = p.vy * 0.5 + (CY - ball.y) * 0.3; lastTouch = p; p.kickCd = 0.18;
            }
          }
        }
      }

      function stepPlayer(p, dt, sprinting) {
        const drain = superSprint && p.isMe ? T.drain / 2 : T.drain;
        let mult = 1;
        if (sprinting && p.stamina > 0 && Math.hypot(p.vx, p.vy) > 10) { p.stamina = Math.max(0, p.stamina - drain * dt); mult = T.sprint; }
        else p.stamina = Math.min(T.stamina, p.stamina + T.regen * (p.isMe && ctx.hasPass('endurance') ? 1.7 : 1) * dt);
        p.x += p.vx * mult * dt; p.y += p.vy * mult * dt;
        p.x = U.clamp(p.x, X0 + T.pr, X1 - T.pr); p.y = U.clamp(p.y, Y0 + T.pr, Y1 - T.pr);
        if (Math.hypot(p.vx, p.vy) > 10) { p.walk += dt * 12 * mult; if (!p.isMe || !p.aimMouse) p.a = Math.atan2(p.vy, p.vx); }
        if (p.kickCd > 0) p.kickCd -= dt;
        // soft possession: touching the ball nudges it
        const dd = U.dist(p.x, p.y, ball.x, ball.y);
        if (dd < T.pr + T.br && dd > 0) {
          const nx = (ball.x - p.x) / dd, ny = (ball.y - p.y) / dd;
          ball.x = p.x + nx * (T.pr + T.br); ball.y = p.y + ny * (T.pr + T.br);
          const rel = (p.vx * mult - ball.vx) * nx + (p.vy * mult - ball.vy) * ny;
          if (rel > 0) { ball.vx += nx * rel * 1.1; ball.vy += ny * rel * 1.1; }
          lastTouch = p;
        }
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        V.preset('day', { fogNear: 1500, fogFar: 3800 });
        V.shadowSize(600);
        const PW = X1 - X0, PH = Y1 - Y0;
        const pitch = BF.g3d.canvasTex('soccer-pitch', 1024, 512, (g2, w, h) => {
          for (let i = 0; i < 12; i++) { g2.fillStyle = i % 2 ? '#3a9a4a' : '#35914a'; g2.fillRect((i * w) / 12, 0, w / 12 + 1, h); }
          const kx = w / PW, ky = h / PH;
          g2.strokeStyle = 'rgba(255,255,255,.85)'; g2.lineWidth = 4;
          g2.strokeRect(3, 3, w - 6, h - 6);
          g2.beginPath(); g2.moveTo(w / 2, 0); g2.lineTo(w / 2, h); g2.stroke();
          g2.beginPath(); g2.arc(w / 2, h / 2, 60 * kx, 0, TAU); g2.stroke();
          g2.strokeRect(0, (CY - 110 - Y0) * ky, 110 * kx, 220 * ky); g2.strokeRect(w - 110 * kx, (CY - 110 - Y0) * ky, 110 * kx, 220 * ky);
          g2.fillStyle = '#fff'; g2.beginPath(); g2.arc(w / 2, h / 2, 5, 0, TAU); g2.fill();
        });
        V.ground(X0, Y0, X1, Y1, '#ffffff', { map: pitch, y: 0.5 });
        V.ground(-1600, -1400, W + 1600, H + 1400, '#2a7a3a', { map: BF.g3d.gridTex('#2f8040', 'rgba(0,0,0,0)', 1, { repeat: [30, 20], noise: true }) });
        // ad boards around the pitch
        const games = BF.catalog ? BF.catalog.all().slice(0, 12) : [];
        const boards = [];
        for (let x = X0; x < X1; x += 72) boards.push({ x: x + 36, z: Y0 - 22, rot: 0 }, { x: x + 36, z: Y1 + 22, rot: 0 });
        boards.forEach((b, i) => {
          const gm = games[i % Math.max(1, games.length)];
          const m = V.box(b.x, 0, b.z, 70, 16, 4, '#ffffff', { map: BF.g3d.canvasTex('ad:' + (gm ? gm.id : i), 256, 64, (g2, w, h) => { g2.fillStyle = gm && gm.color ? gm.color : i % 2 ? '#1f5f9a' : '#9a2a3a'; g2.fillRect(0, 0, w, h); g2.fillStyle = '#fff'; g2.font = '800 28px Rubik, system-ui, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText(gm ? gm.name.toUpperCase() : 'BLOCKFORGE', w / 2, h / 2 + 2, w - 20); }) });
          m.rotation.y = b.rot;
        });
        // stands with a crowd
        const r = U.rng('px3d');
        const steps = [], crowd = [];
        const stand = (x0, x1, z, dir) => {
          for (let row = 0; row < 7; row++) {
            const zz = z + dir * (row * 22 + 30);
            steps.push({ x: (x0 + x1) / 2, y: 0, z: zz, w: x1 - x0, h: 12 + row * 12, d: 22, color: row % 2 ? '#6a707c' : '#7a8494' });
            for (let x = x0 + 10; x < x1 - 6; x += 16) if (r() < 0.8) crowd.push({ x: x + r() * 4, y: 12 + row * 12, z: zz, w: 9, h: 14, d: 9, color: r() < 0.5 ? (r() < 0.5 ? TEAMS.blue.color : TEAMS.red.color) : U.pick(['#ffd66b', '#f4f1ea', '#4ad17f', '#b67cff', '#ff7a2e'], r) });
          }
        };
        stand(X0 - 40, X1 + 40, Y0 - 30, -1);
        stand(X0 - 40, X1 + 40, Y1 + 30, 1);
        V.boxes(steps);
        const crowdMesh = V.boxes(crowd, { shadow: false });
        // goals
        for (const [gx, team] of [[X0, 'blue'], [X1, 'red']]) {
          const back = gx === X0 ? gx - GD : gx + GD;
          for (const gy of [GY0, GY1]) V.box(gx, 0, gy, 5, 48, 5, '#ffffff', { rough: 0.3 });
          V.box(gx, 46, (GY0 + GY1) / 2, 5, 5, GY1 - GY0 + 5, '#ffffff', { rough: 0.3 });
          V.box((gx + back) / 2, 0, (GY0 + GY1) / 2, 1, 46, GY1 - GY0, '#ffffff', { opacity: 0.25, shadow: false, depthWrite: false }).position.x = back;
          V.box((gx + back) / 2, 44, (GY0 + GY1) / 2, GD, 1, GY1 - GY0, '#ffffff', { opacity: 0.2, shadow: false, depthWrite: false });
          for (const gy of [GY0, GY1]) V.box((gx + back) / 2, 0, gy, GD, 46, 1, '#ffffff', { opacity: 0.2, shadow: false, depthWrite: false });
          V.box(gx, 0, GY0 - 8, 10, 3, 10, TEAMS[team].color, { glow: 0.5, shadow: false });
          V.box(gx, 0, GY1 + 8, 10, 3, 10, TEAMS[team].color, { glow: 0.5, shadow: false });
        }
        // floodlights
        for (const [x, z] of [[X0 - 80, Y0 - 190], [X1 + 80, Y0 - 190], [X0 - 80, Y1 + 190], [X1 + 80, Y1 + 190]]) {
          V.box(x, 0, z, 10, 240, 10, '#39414f');
          V.box(x, 240, z, 60, 30, 10, '#fff6c8', { glow: 1.1 });
        }
        const ballTex = BF.g3d.canvasTex('soccer-ball', 128, 64, (g2, w, h) => { g2.fillStyle = '#ffffff'; g2.fillRect(0, 0, w, h); g2.fillStyle = '#1b1b22'; for (const [x, y] of [[16, 16], [48, 40], [80, 16], [112, 40], [16, 52], [80, 52]]) { g2.beginPath(); for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; g2.lineTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8); } g2.fill(); } });
        const ballMesh = V.shape('sphere', 0, 0, 0, T.br * 2.4, T.br * 2.4, T.br * 2.4, '#ffffff', { map: ballTex, rough: 0.5 });
        const aimLine = V.box(0, 0, 0, 1, 2, 3, '#ffffff', { basic: true, opacity: 0.6, shadow: false });
        const ringPool = V.pool();
        const axis = new THREE.Vector3(), qb = new THREE.Quaternion();

        return function sync(dt) {
          const t = ctx.time;
          V.look(CX + (ball.x - CX) * 0.45, 0, CY + 60 + (ball.y - CY) * 0.2, { dist: 660, pitch: 0.92, fov: 45, lerp: 0.06 }, dt);
          if (crowdMesh) crowdMesh.position.y = phase === 'goal' || Math.abs(ball.x - CX) > 380 ? Math.abs(Math.sin(t * 12)) * 3 : 0;
          // ball roll
          const sp = Math.hypot(ball.vx, ball.vy);
          ballMesh.position.set(ball.x, T.br * 1.2, ball.y);
          if (sp > 1) { axis.set(ball.vy, 0, -ball.vx).normalize(); qb.setFromAxisAngle(axis, (sp * dt) / (T.br * 1.2)); ballMesh.quaternion.premultiply(qb); }
          for (const pl of players) {
            const id = pl.isMe ? 'me' : pl.bot ? pl.bot.id : 'npc' + players.indexOf(pl);
            const rig = V.actor(id, pl.isMe ? ctx.player.avatar : pl.bot ? pl.bot.avatar : pl.look, { scale: 8 });
            rig.setPos(pl.x, 0, pl.y);
            rig.faceAngle(pl.a);
            rig.set({ move: Math.min(1.5, Math.hypot(pl.vx, pl.vy) / T.speed) });
            if (pl.kickCd > 0.2 && !pl._k) rig.play('attack');
            pl._k = pl.kickCd > 0.2;
            const ring = ringPool.use(id, () => { const m = V.shape('ring', 0, 1.2, 0, 1, 1, 1, '#ffffff', { basic: true, side: 2, shadow: false }); m.rotation.x = -Math.PI / 2; return m; });
            ring.position.set(pl.x, 1.2, pl.y);
            ring.scale.set(34, 34, 1);
            ring.material = V.mat(pl.role === 'gk' ? '#ffd66b' : TEAMS[pl.team].color, { basic: true, side: 2, opacity: 0.9 });
            V.label(pl.x, 58, pl.y, { name: pl.name, color: pl.isMe ? '#ffb454' : TEAMS[pl.team].color, hp: pl.isMe && me.charge > 0 ? me.charge / T.charge : null, hpColor: me.charge >= T.charge ? '#ff5a6a' : '#ffd66b', bubble: pl.bot ? ctx.bubbleText(pl.bot.id) : pl.isMe ? ctx.bubbleText('me') : null });
          }
          ringPool.sweep();
          aimLine.visible = me.charge > 0;
          if (aimLine.visible) {
            const q = ptr();
            const a = me.aimMouse ? Math.atan2(q.y - ball.y, q.x - ball.x) : me.a;
            const len = 40 + me.charge * 60;
            aimLine.scale.set(len, 2, 3);
            aimLine.position.set(ball.x + Math.cos(a) * len / 2, 2, ball.y + Math.sin(a) * len / 2);
            aimLine.rotation.y = -a;
          }
          V.sweep();
        };
      })();

      return {
        update(dt) {
          parts.update(dt);
          floats.update(dt);
          if (phase === 'over') return;
          if (phase === 'goal') { pauseT -= dt; if (pauseT <= 0) resetKickoff(pendingKickoff); return; }
          if (phase === 'kickoff') { pauseT -= dt; if (pauseT <= 0) { phase = 'play'; ctx.sfx('whistle'); } return; }
          clock -= dt;
          if (clock <= 0) {
            if (!overtime && score.blue === score.red) { overtime = true; clock = T.overtime; ctx.banner('GOLDEN GOAL', 'Next goal wins!', 1800); ctx.sfx('whistle'); }
            else { ctx.sfx('whistle'); finish(); return; }
          }
          // me
          const inp = ctx.input;
          const ax = inp.axis();
          me.vx = ax.x * T.speed; me.vy = ax.y * T.speed;
          const p = inp.pointer;
          if (p.moved) me.aimMouse = true;
          if (Math.hypot(ax.x, ax.y) > 0.3 && !p.down) me.aimMouse = me.aimMouse && p.moved;
          const q = ptr();
          if (me.aimMouse) me.a = Math.atan2(q.y - me.y, q.x - me.x);
          stepPlayer(me, dt, inp.act('sprint'));
          const holding = inp.act('kick') || p.down;
          if (holding) me.charge = Math.min(T.charge, me.charge + dt);
          else if (me.charge > 0) {
            if (U.dist(me.x, me.y, ball.x, ball.y) < T.reach + 6 && me.kickCd <= 0) kick(me, me.aimMouse ? Math.atan2(q.y - ball.y, q.x - ball.x) : me.a, T.kickMin + (T.kickMax - T.kickMin) * (me.charge / T.charge));
            me.charge = 0;
          }
          for (const pl of players) if (!pl.isMe) { botThink(pl, dt); stepPlayer(pl, dt, pl.role !== 'gk' && U.dist(pl.x, pl.y, ball.x, ball.y) < 160 && pl.stamina > 30); }
          // player separation
          for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
            const a = players[i], b = players[j];
            const dd = U.dist(a.x, a.y, b.x, b.y);
            if (dd < T.pr * 2 && dd > 0) { const push = (T.pr * 2 - dd) / 2, nx = (a.x - b.x) / dd, ny = (a.y - b.y) / dd; a.x += nx * push; a.y += ny * push; b.x -= nx * push; b.y -= ny * push; }
          }
          // ball
          ball.x += ball.vx * dt; ball.y += ball.vy * dt;
          const fr = Math.pow(T.friction, dt);
          ball.vx *= fr; ball.vy *= fr; ball.spin *= fr;
          const inGoalMouth = ball.y > GY0 + T.br && ball.y < GY1 - T.br;
          if (ball.x < X0 + T.br && !inGoalMouth) { ball.x = X0 + T.br; ball.vx = Math.abs(ball.vx) * T.bounce; ctx.sfx('land', { volume: 0.2 }); }
          if (ball.x > X1 - T.br && !inGoalMouth) { ball.x = X1 - T.br; ball.vx = -Math.abs(ball.vx) * T.bounce; ctx.sfx('land', { volume: 0.2 }); }
          if (ball.y < Y0 + T.br) { ball.y = Y0 + T.br; ball.vy = Math.abs(ball.vy) * T.bounce; }
          if (ball.y > Y1 - T.br) { ball.y = Y1 - T.br; ball.vy = -Math.abs(ball.vy) * T.bounce; }
          if (ball.x < X0 - 6 && inGoalMouth) goal(lastTouch, 'red');
          else if (ball.x > X1 + 6 && inGoalMouth) goal(lastTouch, 'blue');
          if (clock < 11 && Math.floor(clock) !== Math.floor(clock + dt)) ctx.sfx('beep', { volume: 0.3 });
        },

        draw(g) {
          g.fillStyle = '#1f6b3a'; g.fillRect(0, 0, W, H);
          for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#3a9a4a' : '#35914a'; g.fillRect(X0 + i * ((X1 - X0) / 12), Y0, (X1 - X0) / 12 + 1, Y1 - Y0); }
          g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 3;
          g.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
          g.beginPath(); g.moveTo(CX, Y0); g.lineTo(CX, Y1); g.stroke();
          g.beginPath(); g.arc(CX, CY, 60, 0, TAU); g.stroke();
          g.strokeRect(X0, CY - 110, 110, 220); g.strokeRect(X1 - 110, CY - 110, 110, 220);
          G.circle(g, CX, CY, 4, '#fff');
          // goals
          for (const [gx, team] of [[X0, 'blue'], [X1, 'red']]) {
            const back = gx === X0 ? gx - GD : gx;
            g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(back, GY0, GD, GY1 - GY0);
            g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1;
            for (let y = GY0; y < GY1; y += 10) { g.beginPath(); g.moveTo(back, y); g.lineTo(back + GD, y); g.stroke(); }
            g.fillStyle = TEAMS[team].color; g.fillRect(gx - 4, GY0 - 6, 8, 6); g.fillRect(gx - 4, GY1, 8, 6);
          }
          // players
          for (const p of players) {
            const tc = TEAMS[p.team];
            g.globalAlpha = 0.45; G.circle(g, p.x, p.y + 3, T.pr + 4, tc.color); g.globalAlpha = 1;
            G.avatarTop(g, p.x, p.y, T.pr, p.look, p.a, { walk: p.walk });
            if (p.role === 'gk') G.ring(g, p.x, p.y, T.pr + 6, '#ffd66b', 2);
            G.nameTag(g, p.x, p.y - 17, p.name, p.isMe ? '#ffb454' : tc.color);
            const bb = p.bot ? ctx.bubbleText(p.bot.id) : p.isMe ? ctx.bubbleText('me') : null;
            if (bb) G.bubble(g, p.x, p.y - 37, bb);
          }
          if (me.charge > 0) { G.bar(g, me.x - 22, me.y + 20, 44, 6, me.charge / T.charge, me.charge >= T.charge ? '#ff5a6a' : '#ffd66b'); const a = me.aimMouse ? Math.atan2(ctx.input.pointer.y - ball.y, ctx.input.pointer.x - ball.x) : me.a; g.globalAlpha = 0.5; G.line(g, ball.x, ball.y, ball.x + Math.cos(a) * (40 + me.charge * 60), ball.y + Math.sin(a) * (40 + me.charge * 60), '#ffffff', 3); g.globalAlpha = 1; }
          // ball
          G.shadow(g, ball.x + 2, ball.y + 4, T.br, T.br * 0.5, 0.35);
          G.circle(g, ball.x, ball.y, T.br, '#ffffff');
          g.save(); g.translate(ball.x, ball.y); g.rotate((ball.x + ball.y) * 0.08);
          G.circle(g, 0, 0, 3, '#1b1b22'); G.circle(g, 5, 3, 1.6, '#1b1b22'); G.circle(g, -4, 4, 1.6, '#1b1b22'); G.circle(g, 2, -5, 1.6, '#1b1b22');
          g.restore();
          parts.draw(g);
          floats.draw(g);
          drawHud(g);
        },

        render3d(dt) { view(dt); },
        hud(g) { drawHud(g); },

        onBotJoin(b) {
          // replace an AI filler with the joining bot
          if (players.some((p) => p.bot && p.bot.id === b.id)) return;
          const filler = players.find((p) => p.npc && !p.isMe);
          if (!filler) return;
          filler.npc = false; filler.bot = b; filler.name = b.displayName; filler.look = b.look; filler.skill = U.clamp((ctx.botLevel(b) || 10) / 55, 0.25, 0.95);
          ctx.feed(b.displayName + ' took a spot on the ' + filler.team + ' team.', 'join', TEAMS[filler.team].color);
        },
        onBotLeave(b) {
          const p = players.find((x) => x.bot && x.bot.id === b.id);
          if (!p) return;
          p.bot = null; p.npc = true; p.name = (p.team === 'blue' ? 'Blue' : 'Red') + ' Sub (AI)'; p.skill = 0.45;
        },
      };

      function drawHud(g) {
          G.panel(g, W / 2 - 150, 8, 300, 50);
          G.text(g, String(score.blue), W / 2 - 70, 44, { size: 28, weight: 900, align: 'center', color: TEAMS.blue.color });
          G.text(g, String(score.red), W / 2 + 70, 44, { size: 28, weight: 900, align: 'center', color: TEAMS.red.color });
          G.text(g, (overtime ? 'OT ' : '') + U.fmtClock(Math.max(0, clock)), W / 2, 38, { size: 17, weight: 800, align: 'center', color: overtime ? '#ffd66b' : '#fff' });
          G.text(g, 'BLUE', W / 2 - 115, 36, { size: 10, weight: 800, align: 'center', color: TEAMS.blue.color });
          G.text(g, 'RED', W / 2 + 115, 36, { size: 10, weight: 800, align: 'center', color: TEAMS.red.color });
          G.panel(g, 10, H - 30, 200, 22);
          G.text(g, 'Stamina', 18, H - 14, { size: 10, color: '#a1abbb' });
          G.bar(g, 64, H - 23, 138, 8, me.stamina / T.stamina, me.stamina < 25 ? '#ff5a6a' : '#7fe7ff');
          if (phase === 'kickoff') G.display(g, 'Kick-off', W / 2, H / 2 - 60, 30, '#ffffff');
      }
    },
  });
})((window.BF = window.BF || {}));
