/**
 * Tag (gameType "tag") — playground tag games on one engine.
 *
 * Variants (config.variant):
 *   freeze     Freeze Frenzy      taggers freeze runners; touch a frozen friend to free them
 *   infection  Infection Tag      one starts infected, every tag spreads it
 *   hide       Hide & Sneak       a seeker with a flashlight hunts the hiders
 *   flag       Flag Wars          blue vs red capture the flag, first to 3
 *   potato     Hot Potato Panic   pass the ticking potato before it pops
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  const T = {
    speed: 215, botSpeed: 190, sprint: 1.45, sprintTime: 1.4, sprintCd: 3.2, reach: 26, r: 11,
    time: { freeze: 90, infection: 90, hide: 90, flag: 150, potato: 150 },
    unfreeze: 0.6, fuse: [11, 17], passCd: 0.9, sight: 250, cone: 0.62, flagsToWin: 3,
    rewards: { play: 12, win: 45, per: 2, xpPlay: 28, xpWin: 95 },
  };
  const MAPW = 1200, MAPH = 800;

  const VARIANTS = {
    freeze: { preset: 'day', floor: '#e8f2ff', line: 'rgba(120,160,220,.35)', wall: '#9fc6ee', accent: '#7fe7ff', title: 'Freeze Tag', goal: 'Keep at least one runner free until time runs out' },
    infection: { preset: 'dusk', floor: '#1d2a22', line: 'rgba(90,255,140,.25)', wall: '#35483c', accent: '#6fff8a', title: 'Infection', goal: 'Survive, or spread it to everyone' },
    hide: { preset: 'indoor', floor: '#8a6a4a', line: 'rgba(0,0,0,.12)', wall: '#d8c9ae', accent: '#ffe08a', title: 'Hide & Sneak', goal: 'Stay out of the flashlight until time runs out', dark: true },
    flag: { preset: 'day', floor: '#5aab52', line: 'rgba(255,255,255,.2)', wall: '#8a909c', accent: '#46a8ff', title: 'Capture the Flag', goal: 'Bring their flag to your base 3 times' },
    potato: { preset: 'arena', floor: '#3a3048', line: 'rgba(255,140,60,.25)', wall: '#8b5a2b', accent: '#ff8a2e', title: 'Hot Potato', goal: 'Do not be holding it when it pops' },
  };

  /** Obstacles for a variant: [{x, y, w, h, kind}] (top-left based, in map units). */
  function layout(kind, seed) {
    const r = U.rng('tagmap:' + kind + ':' + seed);
    const out = [];
    const add = (x, y, w, h, k) => out.push({ x, y, w, h, kind: k || 'box' });
    if (kind === 'hide') {
      // rooms: outer walls with doorways, then furniture to hide behind
      const wall = 14;
      for (const x of [400, 800]) { add(x - wall / 2, 0, wall, 300, 'wall'); add(x - wall / 2, 380, wall, 420, 'wall'); }
      add(0, 400 - wall / 2, 160, wall, 'wall'); add(240, 400 - wall / 2, 380, wall, 'wall'); add(700, 400 - wall / 2, 220, wall, 'wall'); add(1000, 400 - wall / 2, 200, wall, 'wall');
      const furn = [[90, 90, 120, 50, 'sofa'], [270, 180, 60, 60, 'plant'], [520, 100, 110, 60, 'bed'], [640, 250, 60, 90, 'wardrobe'], [920, 80, 140, 50, 'table'], [1080, 250, 60, 60, 'plant'], [80, 560, 60, 120, 'wardrobe'], [300, 620, 120, 60, 'sofa'], [520, 520, 100, 50, 'table'], [640, 690, 70, 70, 'box'], [880, 560, 120, 60, 'bed'], [1090, 660, 70, 70, 'box']];
      for (const f of furn) add(...f);
    } else if (kind === 'flag') {
      for (let i = 0; i < 10; i++) { const x = 180 + r() * 840, y = 60 + r() * 640; if (Math.abs(x - 600) < 40) continue; add(x, y, 40 + r() * 50, 40 + r() * 50, 'crate'); }
    } else {
      const n = kind === 'potato' ? 10 : 14;
      for (let i = 0; i < n; i++) {
        const x = 80 + r() * (MAPW - 220), y = 80 + r() * (MAPH - 220);
        if (Math.hypot(x - MAPW / 2, y - MAPH / 2) < 140) continue;
        const k = kind === 'freeze' ? U.pick(['slide', 'bench', 'tree', 'igloo'], r) : kind === 'infection' ? U.pick(['pillar', 'tank', 'crate'], r) : 'crate';
        add(x, y, k === 'bench' ? 90 : 44 + r() * 40, k === 'bench' ? 26 : 44 + r() * 40, k);
      }
    }
    return out;
  }

  BF.GameModules.register('tag', {
    three: true,
    maxBots: 7,
    feedTop: 0.19,
    orders: ['follow', 'come', 'stay', 'leave', 'help', 'ally'],
    actions: { sprint: ['ShiftLeft', 'ShiftRight'], use: ['KeyE', 'Space'] },
    controls: { joystick: true, buttons: [{ act: 'sprint', label: 'Sprint', icon: 'run' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H, K = BF.arcade;
      const VAR = K.variant(ctx, VARIANTS);
      const mode = (ctx.config && ctx.config.variant) || 'freeze';
      const V = ctx.g3;
      const rng = U.rng('tag:' + ctx.gameId + ':' + Date.now());
      const walls = layout(mode, ctx.gameId);
      const furniture = () => walls.filter((w) => w.kind !== 'wall');
      const blocked = (x, y) => x < T.r || y < T.r || x > MAPW - T.r || y > MAPH - T.r || walls.some((w) => x > w.x - T.r && x < w.x + w.w + T.r && y > w.y - T.r && y < w.y + w.h + T.r);
      const sees = (a, b) => { const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d / 14); for (let i = 1; i < n; i++) { const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n; if (walls.some((w) => x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h)) return false; } return true; };
      const free = () => { for (let i = 0; i < 60; i++) { const x = 60 + rng() * (MAPW - 120), y = 60 + rng() * (MAPH - 120); if (!blocked(x, y)) return { x, y }; } return { x: MAPW / 2, y: MAPH / 2 }; };

      const me = Object.assign({ me: true, a: 0, walk: 0, role: 'runner', team: 'blue', frozen: false, out: false, tags: 0, sprintT: 0, sprintCd: 0, shield: ctx.hasPass('decoy'), found: false, carrying: false, still: 0 }, free());
      const bots = K.crew(ctx, 7, () => Object.assign({ role: 'runner', team: 'red', frozen: false, out: false, tags: 0, sprintT: 0, sprintCd: 0, carrying: false, wait: 0, goal: null, touch: 0 }, free()));
      const everyone = () => [me].concat(bots);
      const nameOf = (p) => (p === me ? 'You' : p.bot.displayName);
      let time = T.time[mode], phase = 'play', clock = 0, holder = null, fuse = 0, passCd = 0, score = { blue: 0, red: 0 }, seeker = null, touchT = 0;
      const flags = { blue: { home: { x: 90, y: MAPH / 2 }, x: 90, y: MAPH / 2, by: null }, red: { home: { x: MAPW - 90, y: MAPH / 2 }, x: MAPW - 90, y: MAPH / 2, by: null } };

      // roles
      if (mode === 'freeze') { bots.slice(0, Math.max(1, Math.round(bots.length / 3))).forEach((b) => { b.role = 'tagger'; }); }
      if (mode === 'infection') { const first = rng() < 0.25 ? me : U.pick(bots, rng) || me; first.role = 'infected'; }
      if (mode === 'hide') { seeker = bots[0] || null; if (seeker) { seeker.role = 'seeker'; seeker.x = MAPW / 2; seeker.y = MAPH / 2; seeker.a = 0; } }
      if (mode === 'flag') { const half = Math.floor(bots.length / 2); bots.forEach((b, i) => { b.team = i < half ? 'blue' : 'red'; b.role = i % 3 === 0 ? 'defend' : 'attack'; const base = flags[b.team].home; b.x = base.x + (b.team === 'blue' ? 60 : -60); b.y = base.y + (i - 3) * 40; }); me.x = flags.blue.home.x + 70; me.y = MAPH / 2; }
      if (mode === 'potato') { holder = U.pick(everyone(), rng); fuse = U.rand(T.fuse[0], T.fuse[1], rng); }
      ctx.banner(VAR.title, VAR.goal, 2600);
      const intro = { freeze: 'You are a runner. Avoid the taggers and free frozen friends.', infection: me.role === 'infected' ? 'You are INFECTED. Tag everyone!' : 'You are a survivor. Run from the green players!', hide: 'Find a hiding spot, fast. The seeker is counting!', flag: 'You are on BLUE. Grab the red flag and bring it home!', potato: holder === me ? 'You have the potato! Tag someone, quick!' : 'Stay away from the potato holder!' }[mode];
      ctx.feed(intro, 'star', VAR.accent);

      function end(win, title) {
        if (phase !== 'play') return;
        phase = 'over';
        const survived = Math.round(clock);
        ctx.best('bestSurvival', survived);
        ctx.addStat('tags', me.tags);
        if (win) { ctx.badge(ctx.gameId + '_win'); if (time < 10 && time > 0) ctx.badge(ctx.gameId + '_clutch'); }
        if (me.tags >= 5) ctx.badge(ctx.gameId + '_tagger');
        K.finish(ctx, { win, title, subtitle: VAR.title, score: me.tags, stats: [['Mode', VAR.title], ['Tags', me.tags], ['Survived', U.fmtClock(survived)]].concat(mode === 'flag' ? [['Score', 'Blue ' + score.blue + ' - ' + score.red + ' Red']] : []), rewards: T.rewards });
      }

      function tagged(p, by) {
        if (p === me && me.shield) { me.shield = false; ctx.feed('Decoy Shield blocked the tag!', 'star', '#7fe7ff'); ctx.sfx('hit'); return false; }
        if (by === me) me.tags++;
        return true;
      }

      // ------------------------------------------------------------ bot AI
      function botAct(b, dt) {
        const o = ctx.botOrder(b.bot.id);
        const og = K.ordered(ctx, b, me, { near: 46 });
        let tx = b.x, ty = b.y, sp = T.botSpeed * (0.85 + b.skill * 0.25);
        const nearest = (list) => list.sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0];
        const flee = (from) => { const d = Math.hypot(b.x - from.x, b.y - from.y) || 1; let fx = b.x + ((b.x - from.x) / d) * 140, fy = b.y + ((b.y - from.y) / d) * 140; if (blocked(fx, fy)) { fx = b.x + ((b.y - from.y) / d) * 140; fy = b.y - ((b.x - from.x) / d) * 140; } return { x: fx, y: fy }; };
        if (b.frozen || b.out || b.found) return;
        if (mode === 'freeze') {
          if (b.role === 'tagger') { const prey = nearest(everyone().filter((p) => p.role === 'runner' && !p.frozen)); if (prey) { tx = prey.x; ty = prey.y; sp *= 1.05; } }
          else {
            const t = nearest(everyone().filter((p) => p.role === 'tagger'));
            const ice = nearest(everyone().filter((p) => p !== b && p.frozen));
            if (t && Math.hypot(t.x - b.x, t.y - b.y) < 170) ({ x: tx, y: ty } = flee(t));
            else if (ice && (b.skill > 0.4 || (o && o.verb === 'help'))) { tx = ice.x; ty = ice.y; }
            else if (og) ({ x: tx, y: ty } = og);
            else { if (!b.goal || Math.hypot(b.goal.x - b.x, b.goal.y - b.y) < 20) b.goal = free(); tx = b.goal.x; ty = b.goal.y; }
          }
        } else if (mode === 'infection') {
          if (b.role === 'infected') { const prey = nearest(everyone().filter((p) => p.role !== 'infected')); if (prey) { tx = prey.x; ty = prey.y; } }
          else { const z = nearest(everyone().filter((p) => p.role === 'infected')); if (z && Math.hypot(z.x - b.x, z.y - b.y) < 200) ({ x: tx, y: ty } = flee(z)); else if (og) ({ x: tx, y: ty } = og); else { if (!b.goal || Math.hypot(b.goal.x - b.x, b.goal.y - b.y) < 20) b.goal = free(); tx = b.goal.x; ty = b.goal.y; } }
        } else if (mode === 'hide') {
          if (b === seeker) {
            if (clock < 6) return; // counting
            const seen = everyone().filter((p) => p !== b && !p.found && canSee(b, p));
            const prey = nearest(seen);
            if (prey) { tx = prey.x; ty = prey.y; sp *= 1.15; b.chasing = prey; }
            else { b.chasing = null; if (!b.goal || Math.hypot(b.goal.x - b.x, b.goal.y - b.y) < 24 || b.wait > 4) { b.goal = rng() < 0.6 ? spotNear(U.pick(furniture(), rng)) : free(); b.wait = 0; } b.wait += dt; tx = b.goal.x; ty = b.goal.y; }
          } else {
            if (!b.goal) { const f = furniture(); b.goal = spotNear(f[(bots.indexOf(b) * 3) % f.length]); }
            if (seeker && seeker.chasing === b) ({ x: tx, y: ty } = flee(seeker));
            else { tx = b.goal.x; ty = b.goal.y; sp *= 0.8; }
          }
        } else if (mode === 'flag') {
          const enemy = b.team === 'blue' ? 'red' : 'blue';
          const intruder = nearest(everyone().filter((p) => p.team === enemy && inHalf(p, b.team)));
          if (b.carrying) { tx = flags[b.team].home.x; ty = flags[b.team].home.y; }
          else if (b.role === 'defend' || (intruder && Math.hypot(intruder.x - b.x, intruder.y - b.y) < 220)) { if (intruder) { tx = intruder.x; ty = intruder.y; } else { tx = flags[b.team].home.x + (b.team === 'blue' ? 120 : -120); ty = MAPH / 2 + Math.sin(clock + b.skill * 5) * 120; } }
          else if (og && b.team === me.team) ({ x: tx, y: ty } = og);
          else { tx = flags[enemy].x; ty = flags[enemy].y; }
        } else if (mode === 'potato') {
          if (holder === b) { const prey = nearest(everyone().filter((p) => p !== b && !p.out)); if (prey) { tx = prey.x; ty = prey.y; sp *= 1.1; } }
          else if (holder && !holder.out) { const d = Math.hypot(holder.x - b.x, holder.y - b.y); if (d < 260) ({ x: tx, y: ty } = flee(holder)); else { if (!b.goal || Math.hypot(b.goal.x - b.x, b.goal.y - b.y) < 20) b.goal = free(); tx = b.goal.x; ty = b.goal.y; } }
        }
        if (b.sprintCd <= 0 && b.sprintT <= 0 && rng() < dt * 0.4 * b.skill) { b.sprintT = T.sprintTime; b.sprintCd = T.sprintCd; }
        K.steer(b, tx, ty, sp * (b.sprintT > 0 ? T.sprint : 1), dt, null, blocked);
      }
      function spotNear(w) { const cand = [[w.x - 18, w.y + w.h / 2], [w.x + w.w + 18, w.y + w.h / 2], [w.x + w.w / 2, w.y - 18], [w.x + w.w / 2, w.y + w.h + 18]].filter(([x, y]) => !blocked(x, y)); const c = cand[Math.floor(rng() * cand.length)] || [w.x, w.y]; return { x: c[0], y: c[1] }; }
      function inHalf(p, team) { return team === 'blue' ? p.x < MAPW / 2 : p.x >= MAPW / 2; }
      function hiddenIn(p) { return walls.some((w) => w.kind !== 'wall' && Math.hypot(p.x - (w.x + w.w / 2), p.y - (w.y + w.h / 2)) < Math.max(w.w, w.h) / 2 + 22); }
      function canSee(s, p) {
        const range = T.sight * (p === me && ctx.hasPass('stealth') ? 0.7 : 1) * (hiddenIn(p) && (p.still || 0) > 0.6 ? 0.35 : 1);
        const d = Math.hypot(p.x - s.x, p.y - s.y);
        if (d > range) return false;
        let da = Math.atan2(p.y - s.y, p.x - s.x) - s.a;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        return (Math.abs(da) < T.cone || d < 40) && sees(s, p);
      }

      // ------------------------------------------------------------ rules
      function rules(dt) {
        const list = everyone();
        const close = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < T.reach;
        if (mode === 'freeze') {
          for (const t of list.filter((p) => p.role === 'tagger')) for (const p of list) if (p.role === 'runner' && !p.frozen && close(t, p) && tagged(p, t)) { p.frozen = true; ctx.sfx('hit'); ctx.feed(nameOf(p) + (p === me ? ' are' : ' is') + ' frozen!', 'leave', '#7fe7ff'); }
          for (const p of list) if (p.frozen) {
            const helper = list.find((q) => q !== p && q.role === 'runner' && !q.frozen && close(p, q));
            p.thaw = helper ? (p.thaw || 0) + dt : 0;
            if (p.thaw >= T.unfreeze) { p.frozen = false; p.thaw = 0; if (helper === me) { me.tags++; ctx.sfx('powerup'); ctx.feed('You freed ' + nameOf(p) + '!', 'star', '#3fd08a'); } }
          }
          const runners = list.filter((p) => p.role === 'runner');
          if (runners.length && runners.every((p) => p.frozen)) end(false, 'Everyone is frozen');
          if (time <= 0) end(runners.some((p) => !p.frozen), runners.some((p) => !p.frozen) ? 'The runners win!' : 'Frozen solid');
        } else if (mode === 'infection') {
          for (const z of list.filter((p) => p.role === 'infected')) for (const p of list) if (p.role !== 'infected' && close(z, p) && tagged(p, z)) { p.role = 'infected'; ctx.sfx('hit'); ctx.feed(nameOf(p) + (p === me ? ' got' : ' got') + ' infected!', 'leave', '#6fff8a'); }
          const left = list.filter((p) => p.role !== 'infected');
          if (!left.length) end(me.role === 'infected', me.role === 'infected' ? 'Everyone is infected!' : 'Infected');
          else if (time <= 0) end(me.role !== 'infected', me.role !== 'infected' ? 'You survived!' : 'Survivors held out');
        } else if (mode === 'hide') {
          if (seeker && clock > 6) for (const p of list) if (p !== seeker && !p.found && close(seeker, p)) { if (!tagged(p, seeker)) { p.x += 30; continue; } p.found = true; ctx.sfx('hit'); ctx.feed(nameOf(p) + (p === me ? ' were' : ' was') + ' found!', 'leave', '#ffe08a'); if (Math.random() < 0.5 && p !== me) ctx.botSay(p.bot, 'lose'); }
          if (me.found) end(false, 'Found!');
          else if (time <= 0) end(true, 'Never found!');
        } else if (mode === 'flag') {
          for (const team of ['blue', 'red']) {
            const enemy = team === 'blue' ? 'red' : 'blue', f = flags[enemy];
            for (const p of list.filter((q) => q.team === team)) {
              if (!f.by && !p.carrying && Math.hypot(p.x - f.x, p.y - f.y) < 26) { f.by = p; p.carrying = true; ctx.sfx('pickup'); ctx.feed(nameOf(p) + ' grabbed the ' + enemy + ' flag!', 'star', enemy === 'red' ? '#ff5a6a' : '#46a8ff'); }
              if (p.carrying && Math.hypot(p.x - flags[team].home.x, p.y - flags[team].home.y) < 40) { score[team]++; p.carrying = false; f.by = null; f.x = f.home.x; f.y = f.home.y; ctx.sfx(team === me.team ? 'goal' : 'lose'); ctx.feed((team === 'blue' ? 'BLUE' : 'RED') + ' scores! ' + score.blue + ' - ' + score.red, 'star', '#ffd66b'); if (p === me) me.tags += 2; }
            }
            // tag intruders in your half: they drop the flag and go home
            for (const d of list.filter((q) => q.team === team)) for (const p of list.filter((q) => q.team === enemy && inHalf(q, team))) if (close(d, p) && tagged(p, d)) {
              if (p.carrying) { p.carrying = false; flags[team].by = null; flags[team].x = flags[team].home.x; flags[team].y = flags[team].home.y; }
              const base = flags[enemy].home; p.x = base.x; p.y = base.y + (rng() - 0.5) * 200; if (d === me) ctx.sfx('hit');
            }
          }
          for (const team of ['blue', 'red']) { const f = flags[team]; if (f.by) { f.x = f.by.x; f.y = f.by.y; } }
          if (score.blue >= T.flagsToWin || score.red >= T.flagsToWin || time <= 0) end(score.blue > score.red, score.blue > score.red ? 'Blue team wins!' : score.blue === score.red ? 'A draw' : 'Red team wins');
        } else if (mode === 'potato') {
          passCd -= dt; fuse -= dt;
          if (holder && passCd <= 0) for (const p of list) if (p !== holder && !p.out && close(holder, p)) { if (!tagged(p, holder)) { passCd = T.passCd; break; } holder = p; passCd = T.passCd; ctx.sfx('swing'); if (p === me) ctx.feed('You have the potato!', 'warn', '#ff8a2e'); break; }
          if (fuse <= 0 && holder) {
            holder.out = true; ctx.sfx('explosion'); if (V) V.shake(8, 0.4);
            ctx.feed(nameOf(holder) + ' got potato\'d!', 'leave', '#ff8a2e');
            const alive = list.filter((p) => !p.out);
            if (me.out) return end(false, 'Potato\'d');
            if (alive.length <= 1) return end(true, 'Last one standing!');
            holder = U.pick(alive, rng); fuse = U.rand(T.fuse[0], T.fuse[1], rng); passCd = 1.2;
            if (holder === me) ctx.feed('You have the potato!', 'warn', '#ff8a2e');
          }
        }
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        V.preset(VAR.preset, { fogNear: 1600, fogFar: 4200 });
        V.shadowSize(700);
        V.gridFloor(-600, -600, MAPW + 600, MAPH + 600, U.shade(VAR.floor, -0.25), VAR.line, 60);
        V.ground(0, 0, MAPW, MAPH, VAR.floor, { y: 0.5 });
        const items = [], tops = [];
        for (const w of walls) {
          const h = w.kind === 'wall' ? 110 : w.kind === 'tree' ? 30 : w.kind === 'bench' ? 18 : w.kind === 'slide' ? 50 : w.kind === 'pillar' ? 120 : w.kind === 'tank' ? 70 : w.kind === 'plant' ? 30 : w.kind === 'wardrobe' ? 100 : w.kind === 'bed' || w.kind === 'sofa' ? 34 : w.kind === 'table' ? 30 : w.kind === 'igloo' ? 40 : 46;
          const col = { wall: VAR.wall, tree: '#6b4226', bench: '#b07a45', slide: '#ff5a6a', igloo: '#ffffff', pillar: '#4a5a50', tank: '#3fd08a', crate: VAR.wall, sofa: '#a04a5a', plant: '#8b5a2b', bed: '#6a8ad8', wardrobe: '#7a5236', table: '#8a6a4a', box: '#b0875a' }[w.kind] || VAR.wall;
          items.push({ x: w.x + w.w / 2, y: 0, z: w.y + w.h / 2, w: w.w, h, d: w.h, color: col });
          if (w.kind === 'tree') tops.push({ x: w.x + w.w / 2, y: 26, z: w.y + w.h / 2, w: w.w * 1.8, h: 80, d: w.h * 1.8, color: mode === 'freeze' ? '#e8f4ff' : '#2f8f47' });
          if (w.kind === 'plant') tops.push({ x: w.x + w.w / 2, y: 26, z: w.y + w.h / 2, w: w.w * 1.2, h: 40, d: w.h * 1.2, color: '#3f9a3a' });
          if (w.kind === 'bed') tops.push({ x: w.x + w.w / 2, y: 34, z: w.y + w.h / 2, w: w.w - 6, h: 8, d: w.h - 6, color: '#ffffff' });
        }
        V.boxes(items);
        if (tops.length) V.boxes(tops, { geo: mode === 'freeze' ? 'cone' : 'box' });
        // borders
        V.boxes([{ x: MAPW / 2, y: 0, z: -8, w: MAPW + 32, h: 30, d: 16, color: VAR.wall }, { x: MAPW / 2, y: 0, z: MAPH + 8, w: MAPW + 32, h: 30, d: 16, color: VAR.wall }, { x: -8, y: 0, z: MAPH / 2, w: 16, h: 30, d: MAPH, color: VAR.wall }, { x: MAPW + 8, y: 0, z: MAPH / 2, w: 16, h: 30, d: MAPH, color: VAR.wall }]);
        if (mode === 'flag') {
          V.box(MAPW / 4, 0.8, MAPH / 2, MAPW / 2, 1, MAPH, '#46a8ff', { opacity: 0.12, shadow: false });
          V.box(MAPW * 3 / 4, 0.8, MAPH / 2, MAPW / 2, 1, MAPH, '#ff5a6a', { opacity: 0.12, shadow: false });
          V.box(MAPW / 2, 0.9, MAPH / 2, 6, 1, MAPH, '#ffffff', { glow: 0.5, shadow: false });
          for (const team of ['blue', 'red']) V.shape('cyl', flags[team].home.x, 1, flags[team].home.y, 80, 2, 80, team === 'blue' ? '#46a8ff' : '#ff5a6a', { glow: 0.6, opacity: 0.6, shadow: false });
        }
        let lamp = null;
        if (mode === 'hide' && seeker) { lamp = new THREE.SpotLight('#fff3c8', 900, T.sight * 1.6, T.cone, 0.4, 1.2); lamp.castShadow = false; V.scene.add(lamp); V.scene.add(lamp.target); V.hemi.intensity = 0.55; V.sun.intensity = 0.5; }
        const fx = V.pool();
        return function sync() {
          const t = ctx.time;
          for (const p of everyone()) {
            if (p.out) continue;
            const infected = p.role === 'infected';
            const rig = K.rig(V, ctx, p === me ? 'me' : p, p.x, 0, p.y, { a: p.a, move: p.frozen ? 0 : p.moving ? (p.sprintT > 0 ? 1.4 : 1) : 0, scale: 8, mode: p.found ? 'sit' : 'idle' });
            const id = p === me ? 'me' : p.bot.id;
            if (p.frozen) fx.use('ice' + id, () => V.box(0, 0, 0, 30, 64, 30, '#bfe6ff', { opacity: 0.45, glow: 0.3, shadow: false })).position.set(p.x, 32, p.y);
            if (infected) fx.use('inf' + id, () => { const m = V.shape('ring', 0, 0, 0, 44, 44, 1, '#6fff8a', { glow: 1.2, shadow: false }); m.rotation.x = -Math.PI / 2; return m; }).position.set(p.x, 2, p.y);
            if (p.role === 'tagger' || p === seeker) { const m = fx.use('tg' + id, () => V.shape('cone', 0, 0, 0, 12, 14, 12, '#ff5a6a', { glow: 1, shadow: false })); m.position.set(p.x, 78 + Math.sin(t * 4) * 3, p.y); m.rotation.x = Math.PI; }
            if (holder === p) { const g = fx.use('potato', () => { const g2 = V.group(); V.shape('sphere', 0, 0, 0, 22, 18, 18, '#c8913a', { parent: g2 }); V.box(0, 8, 0, 3, 10, 3, '#39414f', { parent: g2 }); V.shape('sphere', 0, 20, 0, 6, 6, 6, '#ffd23f', { parent: g2, glow: 2 }); return g2; }); g.position.set(p.x, 80, p.y); g.scale.setScalar(1 + Math.max(0, 3 - fuse) * 0.15 * (Math.sin(t * 20) * 0.5 + 0.5)); }
            if (p.carrying) { const enemy = p.team === 'blue' ? 'red' : 'blue'; fx.use('fc' + id, () => { const g2 = V.group(); V.box(0, 0, 0, 3, 60, 3, '#e8ecf1', { parent: g2 }); V.box(10, 40, 0, 20, 14, 2, enemy === 'red' ? '#ff5a6a' : '#46a8ff', { parent: g2, glow: 0.5 }); return g2; }).position.set(p.x - 10, 20, p.y); }
            if (mode === 'flag') fx.use('tm' + id, () => { const m = V.shape('ring', 0, 0, 0, 34, 34, 1, p.team === 'blue' ? '#46a8ff' : '#ff5a6a', { glow: 1, shadow: false }); m.rotation.x = -Math.PI / 2; return m; }).position.set(p.x, 1.5, p.y);
            if (rig && p === me && mode === 'hide') rig.group.visible = true;
          }
          if (mode === 'flag') for (const team of ['blue', 'red']) { const f = flags[team]; if (f.by) continue; fx.use('flag' + team, () => { const g2 = V.group(); V.box(0, 0, 0, 4, 80, 4, '#e8ecf1', { parent: g2 }); V.box(16, 54, 0, 30, 22, 2, team === 'red' ? '#ff5a6a' : '#46a8ff', { parent: g2, glow: 0.6 }); return g2; }).position.set(f.x, 0, f.y); }
          fx.sweep();
          if (lamp && seeker) { lamp.position.set(seeker.x, 60, seeker.y); lamp.target.position.set(seeker.x + Math.cos(seeker.a) * 200, 0, seeker.y + Math.sin(seeker.a) * 200); }
          V.look(me.x, 0, me.y + 40, { dist: 560, pitch: 1.0, fov: 45, lerp: 0.12 }, 1 / 60);
          V.sweep();
        };
      })();

      function drawHud(g) {
        const status = mode === 'freeze' ? (me.frozen ? 'FROZEN: wait for a friend' : 'Runners free: ' + everyone().filter((p) => p.role === 'runner' && !p.frozen).length)
          : mode === 'infection' ? (me.role === 'infected' ? 'You are INFECTED' : 'Survivors: ' + everyone().filter((p) => p.role !== 'infected').length)
            : mode === 'hide' ? (clock < 6 ? 'Hide! Seeker counts ' + Math.ceil(6 - clock) : me.found ? 'Found' : seeker && seeker.chasing === me ? 'RUN, you were spotted!' : 'Hidden' + (hiddenIn(me) ? ' (in cover)' : ''))
              : mode === 'flag' ? 'Blue ' + score.blue + '  -  ' + score.red + ' Red'
                : holder === me ? 'YOU HAVE THE POTATO! ' + Math.max(0, fuse).toFixed(1) : 'Potato: ' + (holder ? nameOf(holder) : '-');
        K.panel(g, VAR.title, status, me.tags ? me.tags + (mode === 'freeze' ? ' rescues' : ' tags') : null, 290);
        K.timer(g, W, time, 10);
        if (me.sprintCd > 0) K.meter(g, W / 2 - 60, 66, 120, 1 - me.sprintCd / T.sprintCd, '#8fd3ff', 'Sprint');
        if (mode === 'potato') K.board(g, W, everyone().map((p) => ({ n: p === me ? ctx.player.name : p.bot.displayName, v: p.out ? 0 : 1, me: p === me, out: p.out })), { title: 'Still in', fmt: (v) => (v ? 'in' : 'out') });
        if (clock < 5) K.hint(g, W, H, 'WASD move · Shift sprint');
      }
      function draw2d(g) {
        g.fillStyle = VAR.floor; g.fillRect(0, 0, W, H);
        const sc = Math.min(W / MAPW, H / MAPH);
        g.save(); g.scale(sc, sc);
        for (const w of walls) { g.fillStyle = VAR.wall; g.fillRect(w.x, w.y, w.w, w.h); }
        if (mode === 'flag') for (const team of ['blue', 'red']) G.circle(g, flags[team].x, flags[team].y, 14, team === 'red' ? '#ff5a6a' : '#46a8ff');
        for (const p of everyone()) if (!p.out) { G.avatarTop(g, p.x, p.y, 14, p === me ? ctx.player.look : p.bot.look, p.a, { walk: p.walk }); if (p.role === 'infected') G.ring(g, p.x, p.y, 18, '#6fff8a', 3); if (p.frozen) G.ring(g, p.x, p.y, 18, '#7fe7ff', 4); if (holder === p) G.circle(g, p.x, p.y - 22, 8, '#c8913a'); }
        g.restore();
        drawHud(g);
      }

      return {
        update(dt) {
          if (phase !== 'play') return;
          clock += dt; time -= dt;
          if (me.sprintT > 0) me.sprintT -= dt;
          if (me.sprintCd > 0) me.sprintCd -= dt;
          if (ctx.input.actPressed('sprint') && me.sprintCd <= 0) { me.sprintT = T.sprintTime; me.sprintCd = T.sprintCd; ctx.sfx('boost'); }
          const px = me.x, py = me.y;
          if (!me.frozen && !me.found) K.move(ctx, me, T.speed * (ctx.hasPass('sprint') ? 1.12 : 1) * (me.sprintT > 0 ? T.sprint : 1), dt, null, blocked);
          me.still = Math.hypot(me.x - px, me.y - py) < 0.5 ? (me.still || 0) + dt : 0;
          for (const b of bots) {
            if (b.sprintT > 0) b.sprintT -= dt; if (b.sprintCd > 0) b.sprintCd -= dt;
            const bx = b.x, by = b.y;
            botAct(b, dt);
            b.still = Math.hypot(b.x - bx, b.y - by) < 0.5 ? (b.still || 0) + dt : 0;
            // stuck against something: pick somewhere else to go (hiders stay put on purpose)
            if (b.still > 0.9 && !(mode === 'hide' && b !== seeker) && !b.frozen) { b.goal = free(); b.still = 0; }
          }
          rules(dt);
        },
        draw: draw2d,
        render3d() { if (view) view(); },
        hud: drawHud,
        onBotJoin(b) { K.join(bots, b, 7, () => Object.assign({ role: mode === 'infection' ? 'infected' : 'runner', team: mode === 'flag' ? (bots.filter((x) => x.team === 'blue').length < bots.filter((x) => x.team === 'red').length ? 'blue' : 'red') : 'red', frozen: false, out: mode === 'potato', tags: 0, sprintT: 0, sprintCd: 0, carrying: false, wait: 0, goal: null }, free()), ctx); },
        onBotLeave(b) { const e = bots.find((x) => x.bot.id === b.id); if (e && holder === e) { holder = me; fuse = Math.max(fuse, 5); } if (e && e.carrying) { const f = flags[e.team === 'blue' ? 'red' : 'blue']; f.by = null; f.x = f.home.x; f.y = f.home.y; } K.leave(bots, b); },
        _test: { me, bots, walls, flags, score, get phase() { return phase; }, get holder() { return holder; }, set holder(v) { holder = v; }, set fuse(v) { fuse = v; }, get time() { return time; }, set time(v) { time = v; }, end, blocked },
      };
    },
  });
})((window.BF = window.BF || {}));
