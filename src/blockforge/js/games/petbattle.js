/**
 * Pet Battle Arena (gameType "petbattle") — turn-based pet battles.
 * Pick three pets and climb a five-rank ladder of trainers from your server.
 * Every pet has a type, stats and four moves: damage, burn, poison, stun,
 * shields, heals and stat stages. Faster pets act first; switching takes the
 * turn. Pets gain XP and levels that are saved between sessions.
 * Win: knock out all three enemy pets. Lose: all three of yours faint.
 * Passes: aurorix (mythic light pet), insight (exact enemy HP + effectiveness).
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;
  const TAU = Math.PI * 2;

  const TYPES = { fire: '#ff7a2e', water: '#46a8ff', grass: '#4ad17f', electric: '#ffd66b', rock: '#b48a4a', dark: '#6b4bd6', light: '#fff1a8', ice: '#7fe7ff' };
  const CHART = {
    fire: { grass: 2, ice: 2, water: 0.5, rock: 0.5, fire: 0.5 },
    water: { fire: 2, rock: 2, grass: 0.5, water: 0.5 },
    grass: { water: 2, rock: 2, fire: 0.5, grass: 0.5 },
    electric: { water: 2, rock: 0.5, grass: 0.5, electric: 0.5 },
    rock: { fire: 2, electric: 2, ice: 2, grass: 0.5 },
    dark: { light: 2, dark: 0.5 },
    light: { dark: 2, light: 0.5 },
    ice: { grass: 2, fire: 0.5, water: 0.5, ice: 0.5 },
  };
  const eff = (moveType, targetType) => (CHART[moveType] && CHART[moveType][targetType]) || 1;
  const M = (name, type, power, o) => Object.assign({ name, type, power, acc: 100 }, o || {});
  const PETS = {
    emberpup: { name: 'Emberpup', type: 'fire', hp: 78, atk: 58, def: 44, spd: 62, art: { body: '#ff7a2e', belly: '#ffe0b8', ears: 'flop', ear: '#c24a1a', tail: 'thin' }, moves: [M('Ember Bite', 'fire', 40), M('Flame Burst', 'fire', 60, { burn: 0.2 }), M('Howl', 'fire', 0, { self: { atk: 1 } }), M('Scorch', 'fire', 25, { burn: 0.7 })] },
    tidefin: { name: 'Tidefin', type: 'water', hp: 84, atk: 50, def: 56, spd: 52, art: { body: '#46a8ff', belly: '#dff4ff', ears: 'none', extra: ['wings'], tail: 'thin' }, moves: [M('Splash Jet', 'water', 40), M('Tidal Crash', 'water', 65, { acc: 85 }), M('Bubble Shield', 'water', 0, { shield: true }), M('Soak', 'water', 20, { foe: { atk: -1 } })] },
    sproutle: { name: 'Sproutle', type: 'grass', hp: 90, atk: 46, def: 60, spd: 40, art: { body: '#4ad17f', belly: '#dff7e6', ears: 'round', extra: ['fluff'] }, moves: [M('Vine Whip', 'grass', 40), M('Spore Cloud', 'grass', 0, { poison: 1, acc: 85 }), M('Sap Drain', 'grass', 35, { drain: 0.5 }), M('Bloom', 'grass', 0, { heal: 0.35 })] },
    voltwing: { name: 'Voltwing', type: 'electric', hp: 70, atk: 60, def: 40, spd: 78, art: { body: '#ffd66b', belly: '#fff6d6', ears: 'point', ear: '#e0a800', extra: ['wings'] }, moves: [M('Zap', 'electric', 40), M('Thunder Dive', 'electric', 72, { recoil: 0.15 }), M('Static Field', 'electric', 0, { stun: 0.6, acc: 90 }), M('Quick Charge', 'electric', 0, { self: { spd: 1, atk: 1 } })] },
    pebblit: { name: 'Pebblit', type: 'rock', hp: 96, atk: 56, def: 72, spd: 30, art: { body: '#9aa5b5', belly: '#d7dde6', ears: 'round', extra: ['gems'] }, moves: [M('Rock Toss', 'rock', 45), M('Boulder Slam', 'rock', 72, { acc: 80 }), M('Harden', 'rock', 0, { self: { def: 2 } }), M('Quake Stomp', 'rock', 35, { stun: 0.3 })] },
    shadewisp: { name: 'Shadewisp', type: 'dark', hp: 72, atk: 62, def: 46, spd: 70, art: { body: '#4b3a7a', belly: '#8a74c9', ears: 'point', ear: '#2a1f4a', tail: 'bushy', glow: '#6b4bd6' }, moves: [M('Shadow Claw', 'dark', 45, { crit: 0.25 }), M('Hex', 'dark', 20, { poison: 0.6 }), M('Night Veil', 'dark', 0, { shield: true }), M('Soul Drain', 'dark', 40, { drain: 0.5 })] },
    frostkit: { name: 'Frostkit', type: 'ice', hp: 76, atk: 57, def: 50, spd: 66, art: { body: '#cfefff', belly: '#ffffff', ears: 'point', ear: '#7fc9e8', tail: 'bushy', extra: ['whiskers'] }, moves: [M('Ice Shard', 'ice', 40), M('Blizzard', 'ice', 66, { acc: 85, stun: 0.2 }), M('Frost Armor', 'ice', 0, { self: { def: 1 }, shield: true }), M('Chill', 'ice', 20, { foe: { spd: -1 } })] },
    aurorix: { name: 'Aurorix', type: 'light', hp: 90, atk: 66, def: 60, spd: 72, pass: 'aurorix', mythic: true, art: { body: 'rainbow', belly: '#fffbe6', ears: 'point', ear: '#fff1a8', extra: ['horn', 'mane'], glow: '#fff1a8' }, moves: [M('Radiant Beam', 'light', 60), M('Aurora Veil', 'light', 0, { shield: true, heal: 0.2 }), M('Purify', 'light', 0, { cleanse: true, heal: 0.25 }), M('Starfall', 'light', 85, { acc: 85 })] },
  };
  Object.entries(PETS).forEach(([id, p]) => { p.id = id; p.art = Object.assign({ id: 'pb-' + id, name: p.name }, p.art); });
  const RANKS = [{ name: 'Rookie Cup', lvl: 5 }, { name: 'Bronze League', lvl: 7 }, { name: 'Silver League', lvl: 9 }, { name: 'Gold League', lvl: 11 }, { name: 'Champion Final', lvl: 14 }];
  const stage = (s) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));

  function makeFighter(id, lvl) {
    const p = PETS[id];
    const k = 1 + (lvl - 5) * 0.07;
    const maxHp = Math.round(p.hp * 1.4 * k);
    return { id, def: p, lvl, maxHp, hp: maxHp, atk: p.atk * k, dfn: p.def * k, spd: p.spd * k, st: { atk: 0, def: 0, spd: 0 }, status: null, statusT: 0, shield: 0, stunned: false };
  }

  const artCache = {};
  function artImage(p) {
    if (artCache[p.id]) return artCache[p.id];
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(BF.petArt(p.art, 200).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
    artCache[p.id] = img;
    return img;
  }

  BF.GameModules.register('petbattle', {
    three: true,
    maxBots: 5,
    feedTop: 0.3,
    actions: { m1: ['Digit1'], m2: ['Digit2'], m3: ['Digit3'], m4: ['Digit4'] },
    controls: { joystick: false, buttons: [] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const V = ctx.g3;
      // 3D stands the pets on the ground where the 2D art sits on screen (x -> X, y -> Z)
      const parts = V ? V.particles2d(46) : new BF.Particles(400);
      const floats = V ? V.floaters2d(0, (x, y) => [x, 150, y + 60]) : new BF.Floaters();
      const d = ctx.data;
      d.levels = d.levels || {};
      d.xp = d.xp || {};
      d.ladder = d.ladder || 0; // ranks cleared
      d.team = (d.team || ['emberpup', 'tidefin', 'sproutle']).filter((id) => PETS[id] && (!PETS[id].pass || ctx.hasPass(PETS[id].pass)));
      const insight = ctx.hasPass('insight');
      const roster = () => Object.values(PETS).filter((p) => !p.pass || ctx.hasPass(p.pass));
      const lvlOf = (id) => d.levels[id] || 5;

      let phase = 'lobby';
      let rank = Math.min(d.ladder, RANKS.length - 1);
      let mine = [], foes = [], mi = 0, fi = 0;
      let trainer = null;
      let queue = [], qT = 0;
      let log = '';
      let anim = { me: 0, foe: 0, meHit: 0, foeHit: 0 };
      let needSwitch = false;
      let turns = 0;

      function lobby() {
        const cards = roster().map((p) => {
          const on = d.team.includes(p.id);
          return '<button class="gp-card' + (on ? ' on' : '') + '" data-gact="pick-' + p.id + '">' + BF.petArt(p.art, 60) + '<b>' + p.name + (p.mythic ? ' ★' : '') + '</b><small><span style="color:' + TYPES[p.type] + '">' + p.type + '</span> · Lv ' + lvlOf(p.id) + '</small><small>HP ' + p.hp + ' · ATK ' + p.atk + ' · DEF ' + p.def + ' · SPD ' + p.spd + '</small></button>';
        }).join('');
        const ladder = RANKS.map((r, i) => '<span class="pill' + (i < d.ladder ? ' success' : i === rank ? ' gold' : '') + '">' + (i < d.ladder ? BF.icon('check', 11) : '') + r.name + '</span>').join(' ');
        ctx.ui.panel('lobby', '<h3>' + BF.icon('paw', 18) + ' Pet Battle Arena</h3><p>Choose three pets (' + d.team.length + '/3), then battle the next trainer on the ladder.</p><div class="gp-row" style="margin:6px 0 4px">' + ladder + '</div><div class="gp-grid">' + cards + '</div>' +
          '<div class="gp-actions">' + (!ctx.hasPass('aurorix') ? '<button class="btn btn-outline" data-gact="buy-aurorix">' + BF.icon('ticket', 13) + 'Aurorix</button>' : '') + (!insight ? '<button class="btn btn-outline" data-gact="buy-insight">' + BF.icon('ticket', 13) + "Trainer's Insight</button>" : '') +
          '<button class="btn btn-play btn-lg" data-gact="battle"' + (d.team.length === 3 ? '' : ' disabled') + '>' + BF.icon('play', 15) + 'Battle: ' + RANKS[rank].name + '</button></div>', 'center wide');
      }
      lobby();
      const offPass = BF.bus.on('pass:purchased', () => { if (phase === 'lobby') lobby(); });

      function startBattle() {
        ctx.ui.remove('lobby');
        ctx.save();
        const pool = ctx.bots.length ? ctx.bots : [];
        const bot = pool.length ? pool[rank % pool.length] : null;
        trainer = { name: bot ? bot.displayName : 'Arena Trainer', bot };
        const r = U.rng((bot ? bot.id : 'trainer') + ':' + rank);
        const ids = U.shuffle(Object.keys(PETS).filter((id) => !PETS[id].pass), r).slice(0, 3);
        const lv = RANKS[rank].lvl;
        foes = ids.map((id, i) => makeFighter(id, lv + (i === 2 ? 1 : 0)));
        mine = d.team.map((id) => makeFighter(id, lvlOf(id)));
        if (ctx.hasPass('vitality')) mine.forEach((m) => { m.maxHp = Math.round(m.maxHp * 1.15); m.hp = m.maxHp; });
        mi = 0; fi = 0; turns = 0;
        phase = 'battle';
        say(trainer.name + ' wants to battle!', 1.2);
        say('Go, ' + mine[0].def.name + '!', 0.8);
        if (bot) ctx.botSay(bot, 'start', 300);
        renderUI();
      }
      function say(text, dur, fn) { queue.push({ text, dur: dur || 0.9, fn }); }
      const busy = () => queue.length > 0;

      function speedOf(f) { return f.spd * stage(f.st.spd); }
      function calcDamage(att, tgt, mv) {
        const crit = Math.random() < (mv.crit || 1 / 16);
        const stab = mv.type === att.def.type ? 1.25 : 1;
        const e = eff(mv.type, tgt.def.type);
        const a = att.atk * stage(att.st.atk), df = tgt.dfn * stage(tgt.st.def);
        const base = ((2 * att.lvl / 5 + 2) * mv.power * (a / df)) / 50 + 2;
        return { dmg: Math.max(1, Math.floor(base * stab * e * (0.88 + Math.random() * 0.12) * (crit ? 1.5 : 1) * (att.status === 'burn' ? 0.85 : 1))), crit, e };
      }
      /** Build the event sequence for one move (runs right after the current event). */
      function moveEvents(att, tgt, mv, side) {
        const S = [];
        const add = (text, dur, fn) => S.push({ text, dur: dur == null ? 0.7 : dur, fn });
        const who = (side === 'me' ? '' : 'Foe ') + att.def.name;
        add(who + ' used ' + mv.name + '!', 0.7, () => { anim[side] = 0.35; ctx.sfx('swing', { volume: 0.5 }); });
        if (mv.acc < 100 && Math.random() * 100 > mv.acc) { add('It missed!'); return S; }
        if (mv.power > 0) {
          if (tgt.shield > 0) add(tgt.def.name + "'s shield blocked the hit!", 0.8, () => { tgt.shield = 0; ctx.sfx('hit', { volume: 0.4 }); });
          else {
            const r = calcDamage(att, tgt, mv);
            const tside = side === 'me' ? 'foe' : 'me';
            add(null, 0.45, () => {
              tgt.hp = Math.max(0, tgt.hp - r.dmg);
              anim[tside + 'Hit'] = 0.4;
              const px = tside === 'me' ? 250 : 710, py = tside === 'me' ? 330 : 200;
              floats.add(px, py - 60, '-' + r.dmg, r.e > 1 ? '#ffd66b' : '#ffffff', r.e > 1 ? 22 : 18);
              parts.emit(px, py, { count: 16, colors: [TYPES[mv.type], '#ffffff'], speed: 160, life: 0.5 });
              ctx.sfx(r.e > 1 ? 'explosion' : 'hit', { volume: 0.6 });
            });
            if (r.crit) add('A critical hit!', 0.6);
            if (r.e > 1) add("It's super effective!");
            else if (r.e < 1) add("It's not very effective...");
            if (mv.drain) add(att.def.name + ' drained some health.', 0.6, () => { att.hp = Math.min(att.maxHp, att.hp + Math.round(r.dmg * mv.drain)); });
            if (mv.recoil) add(att.def.name + ' was hurt by recoil.', 0.6, () => { att.hp = Math.max(0, att.hp - Math.round(r.dmg * mv.recoil)); });
          }
        }
        const stat = (k) => (k === 'atk' ? 'attack' : k === 'def' ? 'defense' : 'speed');
        if (mv.burn && !tgt.status && Math.random() < mv.burn) add(tgt.def.name + ' was burned!', 0.7, () => { if (tgt.hp > 0) tgt.status = 'burn'; });
        if (mv.poison && !tgt.status && Math.random() < mv.poison) add(tgt.def.name + ' was poisoned!', 0.7, () => { if (tgt.hp > 0) tgt.status = 'poison'; });
        if (mv.stun && Math.random() < mv.stun) add(tgt.def.name + ' is stunned!', 0.7, () => { if (tgt.hp > 0) tgt.stunned = true; });
        if (mv.self) for (const [k, v] of Object.entries(mv.self)) add(att.def.name + "'s " + stat(k) + (v > 1 ? ' rose sharply!' : ' rose!'), 0.6, () => { att.st[k] = U.clamp(att.st[k] + v, -4, 4); });
        if (mv.foe) for (const [k, v] of Object.entries(mv.foe)) add(tgt.def.name + "'s " + stat(k) + ' fell!', 0.6, () => { tgt.st[k] = U.clamp(tgt.st[k] + v, -4, 4); });
        if (mv.shield) add(att.def.name + ' raised a shield!', 0.6, () => { att.shield = 2; });
        if (mv.heal) add(att.def.name + ' recovered health!', 0.6, () => { att.hp = Math.min(att.maxHp, att.hp + Math.round(att.maxHp * mv.heal)); ctx.sfx('powerup', { volume: 0.5 }); });
        if (mv.cleanse) add(att.def.name + ' is cleansed.', 0.5, () => { att.status = null; att.stunned = false; });
        return S;
      }
      const next = (events) => queue.splice(1, 0, ...events);

      function aiChoose() {
        const me = mine[mi], f = foes[fi];
        // switch if badly matched and a better pet is available
        const worst = eff(me.def.type, f.def.type) >= 2 && f.hp < f.maxHp * 0.9;
        if (worst && Math.random() < 0.3) {
          const alt = foes.findIndex((x, i) => i !== fi && x.hp > 0 && eff(me.def.type, x.def.type) < 1);
          if (alt >= 0) return { switchTo: alt };
        }
        const scored = f.def.moves.map((mv) => {
          let s = 0;
          if (mv.power) s = mv.power * eff(mv.type, me.def.type) * (mv.type === f.def.type ? 1.25 : 1) * (mv.acc / 100);
          if (mv.heal && f.hp < f.maxHp * 0.45) s = 70;
          if (mv.shield && f.hp < f.maxHp * 0.5 && !f.shield) s = Math.max(s, 45);
          if (mv.self && f.hp > f.maxHp * 0.7 && turns < 3) s = Math.max(s, 40);
          if ((mv.poison || mv.burn) && !me.status && !mv.power) s = Math.max(s, 38);
          if (mv.stun && !mv.power && speedOf(f) > speedOf(me)) s = Math.max(s, 42);
          return { mv, s: s * (0.85 + Math.random() * 0.3) };
        }).sort((a, b) => b.s - a.s);
        return { move: scored[0].mv };
      }

      function takeTurn(choice) {
        if (busy() || phase !== 'battle') return;
        turns++;
        const ai = aiChoose();
        let me = mine[mi], f = foes[fi];
        // switches first
        if (choice.switchTo != null) { mi = choice.switchTo; say('Come back! Go, ' + mine[mi].def.name + '!', 0.9, () => ctx.sfx('open')); me = mine[mi]; }
        if (ai.switchTo != null) { fi = ai.switchTo; say(trainer.name + ' sent out ' + foes[fi].def.name + '!', 0.9); f = foes[fi]; }
        const acts = [];
        if (choice.move) acts.push({ side: 'me', mv: choice.move, pri: speedOf(me) });
        if (ai.move) acts.push({ side: 'foe', mv: ai.move, pri: speedOf(f) });
        acts.sort((a, b) => b.pri - a.pri || Math.random() - 0.5);
        for (const act of acts) {
          queue.push({ text: null, dur: 0, fn: () => {
            const att = act.side === 'me' ? mine[mi] : foes[fi], tgt = act.side === 'me' ? foes[fi] : mine[mi];
            if (att.hp <= 0 || tgt.hp <= 0) return;
            if (att.stunned) { att.stunned = false; next([{ text: att.def.name + ' is stunned and cannot move!', dur: 0.8 }]); return; }
            next(moveEvents(att, tgt, act.mv, act.side));
          } });
        }
        queue.push({ text: null, dur: 0, fn: endOfTurn });
        renderUI();
      }
      function endOfTurn() {
        const ev = [];
        for (const [f, side] of [[mine[mi], 'me'], [foes[fi], 'foe']]) {
          if (f.hp <= 0) continue;
          if (f.status === 'burn' || f.status === 'poison') {
            const dmg = Math.max(1, Math.round(f.maxHp * (f.status === 'burn' ? 0.06 : 0.08)));
            ev.push({ text: f.def.name + ' is hurt by ' + (f.status === 'burn' ? 'its burn' : 'poison') + '.', dur: 0.7, fn: () => { f.hp = Math.max(0, f.hp - dmg); anim[side + 'Hit'] = 0.3; } });
          }
          if (f.shield > 0) f.shield--;
        }
        ev.push({ text: null, dur: 0, fn: checkFaints });
        next(ev);
      }
      function checkFaints() {
        const ev = [];
        const f = foes[fi], me = mine[mi];
        if (f.hp <= 0) {
          ev.push({ text: 'Foe ' + f.def.name + ' fainted!', dur: 0.9, fn: () => ctx.sfx('lose', { volume: 0.4 }) });
          const nxt = foes.findIndex((x) => x.hp > 0);
          if (nxt < 0) { ev.push({ text: 'You defeated ' + trainer.name + '!', dur: 1.2, fn: () => finish(true) }); next(ev); return; }
          ev.push({ text: trainer.name + ' sent out ' + foes[nxt].def.name + '!', dur: 0.9, fn: () => { fi = nxt; } });
        }
        if (me.hp <= 0) {
          ev.push({ text: me.def.name + ' fainted!', dur: 0.9, fn: () => ctx.sfx('lose', { volume: 0.4 }) });
          if (!mine.some((x) => x.hp > 0)) { ev.push({ text: 'All your pets fainted...', dur: 1.2, fn: () => finish(false) }); next(ev); return; }
          ev.push({ text: 'Choose your next pet.', dur: 0, fn: () => { needSwitch = true; } });
        }
        next(ev);
      }

      function finish(win) {
        if (phase === 'over') return;
        phase = 'over';
        ctx.ui.remove('battle');
        const gained = [];
        if (win) {
          d.ladder = Math.max(d.ladder, rank + 1);
          ctx.best('ladder', d.ladder, 'max');
          ctx.badge('pb_first');
          if (d.ladder >= RANKS.length) ctx.badge('pb_champion');
          ctx.quest('pet_battle_win', 1);
          for (const m of mine) {
            d.xp[m.id] = (d.xp[m.id] || 0) + 45 + rank * 15;
            while (d.xp[m.id] >= 100 && lvlOf(m.id) < 25) { d.xp[m.id] -= 100; d.levels[m.id] = lvlOf(m.id) + 1; gained.push(m.def.name + ' Lv ' + d.levels[m.id]); }
          }
          if (trainer.bot) ctx.botSay(trainer.bot, 'lose', 600);
        } else if (trainer.bot) ctx.botSay(trainer.bot, 'win', 600);
        ctx.save();
        ctx.end({
          outcome: win ? 'win' : 'lose',
          title: win ? (rank === RANKS.length - 1 ? 'Arena Champion!' : RANKS[rank].name + ' cleared!') : 'Defeated by ' + trainer.name,
          subtitle: win ? (gained.length ? 'Level up: ' + gained.join(', ') : 'Your team gained experience.') : 'Try a different team or type matchups.',
          coins: 15 + (win ? 20 + rank * 12 + (rank === RANKS.length - 1 ? 60 : 0) : 0),
          xp: 30 + (win ? 60 + rank * 20 : 0),
          stats: [['Ladder', RANKS[rank].name], ['Turns', turns], ['Pets standing', mine.filter((m) => m.hp > 0).length + ' / 3']],
          delay: 900,
        });
      }

      // ------------------------------------------------------------------ UI
      function effLabel(mv, tgt) {
        if (!mv.power) return '';
        const e = eff(mv.type, tgt.def.type);
        return e > 1 ? '<em style="color:#3fd08a">Super effective</em>' : e < 1 ? '<em style="color:#ff8b98">Not very effective</em>' : '<em class="faint">Normal damage</em>';
      }
      function renderUI() {
        if (phase !== 'battle') return;
        const me = mine[mi], f = foes[fi];
        const lock = busy() && !needSwitch;
        const moves = needSwitch ? '<p><b>' + me.def.name + ' fainted.</b> Choose your next pet:</p>' : me.def.moves.map((mv, i) => '<button class="btn pb-move" data-gact="move-' + i + '"' + (lock ? ' disabled' : '') + ' style="--mt:' + TYPES[mv.type] + '"><b>' + (i + 1) + '. ' + mv.name + '</b><small>' + mv.type + (mv.power ? ' · power ' + mv.power : ' · status') + (mv.acc < 100 ? ' · ' + mv.acc + '%' : '') + '</small>' + (insight ? effLabel(mv, f) : '') + '</button>').join('');
        const team = mine.map((m, i) => '<button class="btn btn-sm pb-mate' + (i === mi ? ' on' : '') + '" data-gact="switch-' + i + '"' + (i === mi || m.hp <= 0 || (lock && !needSwitch) ? ' disabled' : '') + '>' + BF.petArt(m.def.art, 22) + m.def.name + ' <span class="faint">' + Math.ceil(m.hp) + '/' + m.maxHp + '</span></button>').join('');
        ctx.ui.panel('battle', '<div class="pb-moves">' + moves + '</div><div class="gp-row pb-team">' + team + '</div>', 'bottom pb');
      }
      ctx.ui.on((a) => {
        if (a.indexOf('pick-') === 0 && phase === 'lobby') {
          const id = a.slice(5);
          if (d.team.includes(id)) d.team = d.team.filter((x) => x !== id);
          else if (d.team.length < 3) d.team.push(id);
          else { d.team.shift(); d.team.push(id); }
          ctx.sfx('click'); lobby(); return;
        }
        if (a === 'battle' && phase === 'lobby' && d.team.length === 3) return startBattle();
        if (a === 'buy-aurorix') return BF.actions.run('buy-pass', null, null, { pass: 'pb_aurorix' });
        if (a === 'buy-insight') return BF.actions.run('buy-pass', null, null, { pass: 'pb_insight' });
        if (a.indexOf('move-') === 0 && !busy()) return takeTurn({ move: mine[mi].def.moves[+a.slice(5)] });
        if (a.indexOf('switch-') === 0) {
          const i = +a.slice(7);
          if (needSwitch) { needSwitch = false; mi = i; say('Go, ' + mine[mi].def.name + '!', 0.8); queue.push({ text: null, dur: 0, fn: renderUI }); renderUI(); return; }
          if (!busy()) takeTurn({ switchTo: i });
        }
      });

      function drawPet(g, f, x, y, flip, hitT, lunge) {
        const img = artImage(f.def);
        const shake = hitT > 0 ? Math.sin(hitT * 60) * 6 : 0;
        const dx = lunge > 0 ? Math.sin((lunge / 0.35) * Math.PI) * 40 * (flip ? -1 : 1) : 0;
        G.shadow(g, x, y + 70, 70, 16, 0.3);
        if (f.hp <= 0) g.globalAlpha = 0.25;
        if (img.complete && img.naturalWidth) {
          g.save(); g.translate(x + shake + dx, y); if (flip) g.scale(-1, 1);
          g.drawImage(img, -80, -80, 160, 160);
          g.restore();
        }
        if (hitT > 0) { g.globalAlpha = 0.4; G.circle(g, x + shake, y, 60, '#ffffff'); }
        g.globalAlpha = 1;
        if (f.shield > 0 && f.hp > 0) { g.globalAlpha = 0.25; G.circle(g, x, y, 78, '#7fe7ff'); g.globalAlpha = 1; G.ring(g, x, y, 78, '#7fe7ff', 2); }
      }
      function infoBox(g, f, x, y, exact) {
        G.panel(g, x, y, 250, 64, 0.8);
        G.text(g, f.def.name, x + 12, y + 22, { size: 15, weight: 800, color: '#fff' });
        G.text(g, 'Lv ' + f.lvl, x + 238, y + 22, { size: 12, align: 'right', color: '#cfd6e2' });
        G.fillRR(g, x + 12, y + 30, 52, 14, 7, TYPES[f.def.type]);
        G.text(g, f.def.type, x + 38, y + 41, { size: 10, align: 'center', color: '#1b1b22', weight: 800 });
        const pct = f.hp / f.maxHp;
        G.bar(g, x + 72, y + 32, 166, 10, pct, pct > 0.5 ? '#3fd08a' : pct > 0.2 ? '#ffd66b' : '#ff5a6a');
        G.text(g, exact ? Math.ceil(f.hp) + ' / ' + f.maxHp : Math.round(pct * 100) + '%', x + 238, y + 58, { size: 11, align: 'right', color: '#cfd6e2' });
        const tags = [f.status, f.stunned ? 'stunned' : null].concat(Object.entries(f.st).filter(([, v]) => v).map(([k, v]) => k + (v > 0 ? '+' : '') + v)).filter(Boolean);
        if (tags.length) G.text(g, tags.join(' · '), x + 12, y + 58, { size: 10.5, color: f.status === 'burn' ? '#ff7a2e' : f.status === 'poison' ? '#b67cff' : '#ffd66b' });
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        V.preset('dusk', { fogNear: 1400, fogFar: 3400 });
        V.stars(300);
        V.shadowSize(560);
        V.ground(-2000, -1600, 3000, 2200, '#2f6b45', { map: BF.g3d.gridTex('#2f6b45', 'rgba(0,0,0,0)', 1, { repeat: [30, 24], noise: true }) });
        const MY = { x: 250, z: 330 }, FOE = { x: 710, z: 200 };
        for (const p of [MY, FOE]) {
          V.shape('cyl', p.x, 5, p.z, 300, 10, 240, '#3a8a5a');
          V.shape('cyl', p.x, 10.5, p.z, 270, 1, 212, '#4aa86a', { shadow: false });
          const ring = V.shape('ring', p.x, 11.5, p.z, 250, 190, 1, '#ffd66b', { basic: true, opacity: 0.35, side: 2, shadow: false });
          ring.rotation.x = -Math.PI / 2;
        }
        // arena rim: lantern posts and trees
        const r = U.rng('pb3d');
        const trees = [], crowns = [];
        for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU, dd = 620 + r() * 300; const x = 480 + Math.cos(a) * dd * 1.3, z = 260 + Math.sin(a) * dd * 0.9; if (z > 520) continue; trees.push({ x, z, w: 14, h: 50, d: 14, color: '#6b4226' }); crowns.push({ x, y: 36, z, w: 90, h: 110, d: 90, color: r() < 0.5 ? '#2f7a3a' : '#3a8a4a' }); }
        V.boxes(trees, { geo: 'cylLo' });
        V.boxes(crowns, { geo: 'cone' });
        const lanterns = [];
        for (let i = 0; i < 8; i++) { const x = 60 + i * 120, z = -40; V.box(x, 0, z, 6, 90, 6, '#3a2a1e'); lanterns.push(V.shape('sphere', x, 96, z, 18, 18, 18, '#ffd66b', { glow: 1.4, shadow: false })); }
        const petPool = V.pool();
        const shields = [MY, FOE].map((p) => V.shape('sphere', p.x, 70, p.z, 200, 170, 200, '#7fe7ff', { basic: true, opacity: 0.16, depthWrite: false, shadow: false }));
        const artOf = (def) => def.art;

        function placePet(key, def, pos, face, o) {
          const m = petPool.use(key, () => { const g = BF.pet3d.build(artOf(def), {}); V.scene.add(g); return g; });
          const lunge = o.lunge > 0 ? Math.sin((o.lunge / 0.35) * Math.PI) * 70 : 0;
          const shake = o.hit > 0 ? Math.sin(o.hit * 60) * 7 : 0;
          const dirX = FOE.x - MY.x, dirZ = FOE.z - MY.z, l = Math.hypot(dirX, dirZ);
          const sgn = pos === MY ? 1 : -1;
          m.position.set(pos.x + (dirX / l) * lunge * sgn + shake, 11 + (o.fainted ? 0 : Math.abs(Math.sin(ctx.time * 3 + pos.x)) * 4), pos.z + (dirZ / l) * lunge * sgn);
          m.scale.setScalar(o.size || 120);
          BF.pet3d.face(m, face);
          m.rotation.z = o.fainted ? Math.PI / 2 : 0;
          m.userData.tick(ctx.time);
          return m;
        }

        return function sync(dt) {
          const t = ctx.time;
          V.look(480, 40, 300, { dist: 700, pitch: 0.42, yaw: 0.12, fov: 45, lerp: 0.06 }, dt);
          lanterns.forEach((l, i) => { l.scale.setScalar(18 + Math.sin(t * 3 + i) * 2); });
          const faceFoe = Math.atan2(FOE.z - MY.z, FOE.x - MY.x);
          const faceMe = faceFoe + Math.PI;
          if (phase === 'lobby') {
            (d.team || []).forEach((id, i) => { if (PETS[id]) placePet('team' + id, PETS[id], { x: MY.x - 90 + i * 90, z: MY.z }, Math.PI / 2 + 0.3, { size: 80 }); });
            shields.forEach((s2) => { s2.visible = false; });
          } else {
            const me = mine[mi], f = foes[fi];
            if (me) placePet('me' + me.id + mi, me.def, MY, faceFoe * 0.5 + Math.PI / 4, { lunge: anim.me, hit: anim.meHit, fainted: me.hp <= 0 });
            if (f) placePet('foe' + f.id + fi, f.def, FOE, faceMe * 0.6 + Math.PI / 3, { lunge: anim.foe, hit: anim.foeHit, fainted: f.hp <= 0 });
            shields[0].visible = !!(me && me.shield > 0 && me.hp > 0);
            shields[1].visible = !!(f && f.shield > 0 && f.hp > 0);
          }
          petPool.sweep();
          const rig = V.actor('me', ctx.player.avatar, { scale: 11 });
          rig.setPos(MY.x - 150, 11, MY.z + 70);
          rig.faceAngle(faceFoe - 0.4);
          if (anim.me > 0.3 && Math.random() < 0.2) rig.play('attack');
          V.label(MY.x - 150, 96, MY.z + 70, { name: ctx.player.name, color: '#ffb454', bubble: ctx.bubbleText('me') });
          if (trainer && phase !== 'lobby') {
            const tr = V.actor('trainer:' + (trainer.bot ? trainer.bot.id : 'npc'), trainer.bot ? trainer.bot.avatar : { skin: '#e0ac69', shirt: '#7a4bd6', shirt2: '#ffd66b', pants: '#2a2150', hat: '#ffd66b', hatStyle: 'cap' }, { scale: 10 });
            tr.setPos(FOE.x + 150, 11, FOE.z - 40);
            tr.faceAngle(faceMe + 0.3);
            V.label(FOE.x + 150, 86, FOE.z - 40, { name: trainer.name, color: '#e3ccff', bubble: trainer.bot ? ctx.bubbleText(trainer.bot.id) : null });
          }
          V.sweep();
        };
      })();

      return {
        update(dt) {
          parts.update(dt);
          floats.update(dt);
          for (const k of Object.keys(anim)) if (anim[k] > 0) anim[k] -= dt;
          if (phase !== 'battle') return;
          if (queue.length) {
            const ev = queue[0];
            if (!ev.started) { ev.started = true; qT = 0; if (ev.text) log = ev.text; if (ev.fn) ev.fn(); }
            qT += dt;
            if (queue[0] === ev && qT >= ev.dur) { queue.shift(); qT = 0; if (!queue.length) renderUI(); }
          } else if (!needSwitch && phase === 'battle') {
            const inp = ctx.input;
            for (let i = 1; i <= 4; i++) if (inp.actPressed('m' + i)) takeTurn({ move: mine[mi].def.moves[i - 1] });
          }
        },

        draw(g) {
          const t = ctx.time;
          const bg = g.createLinearGradient(0, 0, 0, H);
          bg.addColorStop(0, '#2a2150'); bg.addColorStop(0.6, '#4a3a7a'); bg.addColorStop(1, '#1b1630');
          g.fillStyle = bg; g.fillRect(0, 0, W, H);
          for (let i = 0; i < 18; i++) { g.globalAlpha = 0.15 + Math.sin(t * 2 + i) * 0.05; G.circle(g, (i * 97) % W, 30 + (i * 37) % 90, 18, '#ffd66b'); }
          g.globalAlpha = 1;
          g.fillStyle = '#3a8a5a'; g.beginPath(); g.ellipse(250, 400, 170, 42, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#4aa86a'; g.beginPath(); g.ellipse(250, 396, 150, 32, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#3a8a5a'; g.beginPath(); g.ellipse(710, 270, 150, 36, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#4aa86a'; g.beginPath(); g.ellipse(710, 266, 132, 28, 0, 0, Math.PI * 2); g.fill();
          if (phase === 'lobby') return;
          const me = mine[mi], f = foes[fi];
          if (f) drawPet(g, f, 710, 200, false, anim.foeHit, anim.foe);
          if (me) drawPet(g, me, 250, 330, true, anim.meHit, anim.me);
          parts.draw(g);
          floats.draw(g);
          drawHud(g);
        },

        render3d(dt) { view(dt); },
        hud(g) { drawHud(g); },

        onBotJoin() {},
        onBotLeave() {},
        destroy() { offPass(); },
      };

      function drawHud(g) {
          if (phase === 'lobby') return;
          const me = mine[mi], f = foes[fi];
          if (f) infoBox(g, f, 60, 52, insight);
          if (me) infoBox(g, me, 650, 330, true);
          G.text(g, (trainer ? trainer.name : '') + ' · ' + RANKS[rank].name, 60, 136, { size: 12, color: '#e3ccff', weight: 800 });
          if (log) { G.panel(g, 40, 8, W - 80, 30, 0.75); G.text(g, log, W / 2, 28, { size: 14, color: '#fff', weight: 700, align: 'center' }); }
          if (foes.length) foes.forEach((x, i) => G.circle(g, 76 + i * 14, 148, 5, x.hp > 0 ? '#ff5a6a' : 'rgba(255,255,255,.2)'));
          if (mine.length) mine.forEach((x, i) => G.circle(g, 666 + i * 14, 410, 5, x.hp > 0 ? '#3fd08a' : 'rgba(255,255,255,.2)'));
      }
    },
  });
})((window.BF = window.BF || {}));
