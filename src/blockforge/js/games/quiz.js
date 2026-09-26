/**
 * Quiz (gameType "quiz") — a live quiz show on floating pads. Read the question,
 * stand on the right answer before the timer runs out; the wrong pads drop.
 * Right answers score 100 plus a speed bonus. Most points after the last
 * question wins. True or False Tower: every right answer climbs a floor.
 *
 * Variants (config.variant): trivia, math, science, world, truefalse.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  const T = {
    questions: 10, think: 10, reveal: 2.6, speed: 230, padGap: 190, pad: 150,
    rewards: { play: 12, win: 45, per: 0.02, xpPlay: 25, xpWin: 90 },
  };
  const PAD = [['A', '#ff4a5a'], ['B', '#3a8bff'], ['C', '#ffd23f'], ['D', '#3fd08a']];

  // [question, right answer, wrong answers...]
  const BANK = {
    trivia: [
      ['How many legs does a spider have?', '8', '6', '10', '12'], ['What colour do you get mixing blue and yellow?', 'Green', 'Purple', 'Orange', 'Brown'], ['How many days are in a leap year?', '366', '365', '364', '360'],
      ['Which animal is known as the King of the Jungle?', 'Lion', 'Tiger', 'Elephant', 'Gorilla'], ['How many sides does a hexagon have?', '6', '5', '7', '8'], ['What is frozen water called?', 'Ice', 'Steam', 'Snow globe', 'Fog'],
      ['Which is the largest ocean?', 'Pacific', 'Atlantic', 'Indian', 'Arctic'], ['How many minutes are in an hour?', '60', '100', '30', '90'], ['What do bees make?', 'Honey', 'Milk', 'Silk', 'Wax crayons'],
      ['Which planet is closest to the Sun?', 'Mercury', 'Venus', 'Earth', 'Mars'], ['How many colours are in a rainbow?', '7', '5', '6', '9'], ['What is the tallest animal?', 'Giraffe', 'Elephant', 'Horse', 'Ostrich'],
      ['What shape has three sides?', 'Triangle', 'Square', 'Circle', 'Pentagon'], ['Which instrument has 88 keys?', 'Piano', 'Guitar', 'Violin', 'Drum'], ['What is a baby cat called?', 'Kitten', 'Puppy', 'Cub', 'Calf'],
      ['How many continents are there?', '7', '5', '6', '8'], ['Which fruit is yellow and curved?', 'Banana', 'Apple', 'Grape', 'Cherry'], ['What do caterpillars turn into?', 'Butterflies', 'Beetles', 'Bees', 'Birds'],
      ['Which season comes after winter?', 'Spring', 'Summer', 'Autumn', 'Winter again'], ['How many wheels does a tricycle have?', '3', '2', '4', '1'], ['What gas do plants take in?', 'Carbon dioxide', 'Oxygen', 'Helium', 'Hydrogen'],
      ['Which bird is famous for copying speech?', 'Parrot', 'Penguin', 'Owl', 'Eagle'], ['How many hours are in a day?', '24', '12', '48', '20'], ['What is the opposite of north?', 'South', 'East', 'West', 'Up'],
    ],
    science: [
      ['What planet is called the Red Planet?', 'Mars', 'Jupiter', 'Venus', 'Saturn'], ['What is the centre of an atom called?', 'Nucleus', 'Electron', 'Shell', 'Core'], ['What force pulls things toward Earth?', 'Gravity', 'Magnetism', 'Friction', 'Wind'],
      ['Which organ pumps blood?', 'Heart', 'Lungs', 'Liver', 'Brain'], ['What is H2O?', 'Water', 'Salt', 'Air', 'Sugar'], ['Which planet has the biggest rings?', 'Saturn', 'Mars', 'Earth', 'Mercury'],
      ['What is the closest star to Earth?', 'The Sun', 'Sirius', 'Polaris', 'The Moon'], ['How many bones are in an adult human?', '206', '106', '306', '156'], ['What do plants make in photosynthesis?', 'Sugar and oxygen', 'Salt and water', 'Only water', 'Carbon'],
      ['What state of matter is steam?', 'Gas', 'Solid', 'Liquid', 'Plasma'], ['Which animal is a mammal?', 'Dolphin', 'Shark', 'Trout', 'Octopus'], ['What is the hardest natural material?', 'Diamond', 'Gold', 'Iron', 'Glass'],
      ['What part of the plant soaks up water?', 'Roots', 'Petals', 'Leaves', 'Seeds'], ['Which gas do we breathe in to live?', 'Oxygen', 'Carbon dioxide', 'Nitrogen only', 'Helium'], ['What is the largest planet?', 'Jupiter', 'Saturn', 'Neptune', 'Earth'],
      ['At what °C does water boil at sea level?', '100', '50', '0', '200'], ['What does a thermometer measure?', 'Temperature', 'Weight', 'Speed', 'Height'], ['Which is NOT a planet?', 'The Moon', 'Mars', 'Venus', 'Uranus'],
      ['What do we call animals that eat only plants?', 'Herbivores', 'Carnivores', 'Omnivores', 'Insectivores'], ['What makes a rainbow?', 'Light through raindrops', 'Wind', 'Clouds bumping', 'Thunder'],
    ],
    world: [
      ['What is the capital of France?', 'Paris', 'Lyon', 'Rome', 'Madrid'], ['What is the capital of Japan?', 'Tokyo', 'Kyoto', 'Osaka', 'Seoul'], ['Which is the largest continent?', 'Asia', 'Africa', 'Europe', 'Antarctica'],
      ['What is the capital of Australia?', 'Canberra', 'Sydney', 'Melbourne', 'Perth'], ['Which river flows through Egypt?', 'The Nile', 'The Amazon', 'The Thames', 'The Danube'], ['What is the capital of Canada?', 'Ottawa', 'Toronto', 'Vancouver', 'Montreal'],
      ['Where are the pyramids of Giza?', 'Egypt', 'Mexico', 'Peru', 'India'], ['Which country is shaped like a boot?', 'Italy', 'Spain', 'Greece', 'Chile'], ['What is the capital of Brazil?', 'Brasília', 'Rio de Janeiro', 'São Paulo', 'Lima'],
      ['Which ocean lies between Europe and America?', 'Atlantic', 'Pacific', 'Indian', 'Southern'], ['What is the tallest mountain above sea level?', 'Everest', 'K2', 'Kilimanjaro', 'Mont Blanc'], ['What is the capital of Kenya?', 'Nairobi', 'Mombasa', 'Accra', 'Cairo'],
      ['Which is the longest river in South America?', 'Amazon', 'Nile', 'Mississippi', 'Yangtze'], ['Which continent is the South Pole on?', 'Antarctica', 'Africa', 'Australia', 'South America'], ['What is the capital of Spain?', 'Madrid', 'Barcelona', 'Lisbon', 'Seville'],
      ['What is the biggest desert that is hot?', 'Sahara', 'Gobi', 'Kalahari', 'Mojave'], ['What is the capital of India?', 'New Delhi', 'Mumbai', 'Bangalore', 'Kolkata'], ['Which country has the most people?', 'India', 'USA', 'Brazil', 'Russia'],
      ['Which city has the Colosseum?', 'Rome', 'Athens', 'Paris', 'Vienna'], ['What is the capital of Germany?', 'Berlin', 'Munich', 'Hamburg', 'Frankfurt'],
    ],
    truefalse: [
      ['The Sun is a star.', 'True'], ['Bats are birds.', 'False'], ['A tomato is a fruit.', 'True'], ['Sound travels faster than light.', 'False'], ['Octopuses have three hearts.', 'True'],
      ['The Great Wall is in China.', 'True'], ['Spiders are insects.', 'False'], ['Water is made of hydrogen and oxygen.', 'True'], ['Penguins can fly.', 'False'], ['Venus is the hottest planet.', 'True'],
      ['Humans have 4 lungs.', 'False'], ['Sharks are fish.', 'True'], ['Mount Everest is in Africa.', 'False'], ['A year has 12 months.', 'True'], ['The Moon makes its own light.', 'False'],
      ['Snails can sleep for years.', 'True'], ['Lightning never strikes the same place twice.', 'False'], ['Honey never goes bad if sealed.', 'True'], ['Cows have four stomachs.', 'False'], ['Some frogs can freeze and thaw.', 'True'],
      ['There are 100 cm in a metre.', 'True'], ['Goldfish have a 3-second memory.', 'False'], ['The Pacific is the biggest ocean.', 'True'], ['Chameleons change colour only to hide.', 'False'], ['A group of lions is a pride.', 'True'],
    ],
  };
  function mathQ(n, r) {
    const lvl = Math.min(4, Math.floor(n / 2));
    const a = 2 + Math.floor(r() * (6 + lvl * 5)), b = 2 + Math.floor(r() * (5 + lvl * 4));
    const op = U.pick(lvl < 1 ? ['+', '-'] : lvl < 3 ? ['+', '-', '×'] : ['×', '÷', '+', '-'], r);
    let q, ans;
    if (op === '+') { q = a + ' + ' + b; ans = a + b; } else if (op === '-') { const hi = Math.max(a, b), lo = Math.min(a, b); q = hi + ' − ' + lo; ans = hi - lo; } else if (op === '×') { q = a + ' × ' + b; ans = a * b; } else { q = (a * b) + ' ÷ ' + b; ans = a; }
    const wrong = new Set();
    while (wrong.size < 3) { const w = ans + (Math.floor(r() * 9) - 4) * (op === '×' ? U.pick([1, b, 2], r) : 1); if (w !== ans && w >= 0) wrong.add(w); }
    return ['What is ' + q + '?', String(ans)].concat(Array.from(wrong).map(String));
  }

  const VARIANTS = {
    trivia: { preset: 'day', stage: '#e8ecf1', bank: 'trivia' },
    math: { preset: 'arena', stage: '#2a3148', bank: 'math', think: 8 },
    science: { preset: 'space', stage: '#3a3f5a', bank: 'science' },
    world: { preset: 'sunset', stage: '#e8d8b0', bank: 'world' },
    truefalse: { preset: 'day', stage: '#b67cff', bank: 'truefalse', tf: true, questions: 12 },
  };

  BF.GameModules.register('quiz', {
    three: true,
    maxBots: 7,
    feedTop: 0.36,
    orders: ['follow', 'come', 'stay', 'leave'],
    actions: {},
    controls: { joystick: true, buttons: [] },
    create(ctx) {
      const W = ctx.W, H = ctx.H, K = BF.arcade;
      const VAR = K.variant(ctx, VARIANTS);
      const V = ctx.g3;
      const rng = U.rng('quiz:' + ctx.gameId + ':' + Date.now());
      const nQ = VAR.questions || T.questions;
      const pads = (VAR.tf ? [[-1, 0], [1, 0]] : [[-1, -1], [1, -1], [-1, 1], [1, 1]]).map(([cx, cy], i) => ({ i, x: cx * T.padGap / (VAR.tf ? 1 : 1), y: cy * T.padGap * 0.8, drop: 0, letter: VAR.tf ? (i ? 'FALSE' : 'TRUE') : PAD[i][0], color: VAR.tf ? (i ? '#ff4a5a' : '#3fd08a') : PAD[i][1] }));
      const questions = VAR.bank === 'math' ? Array.from({ length: nQ }, (_, i) => mathQ(i, rng)) : U.shuffle(BANK[VAR.bank].slice(), rng).slice(0, nQ);
      const me = { x: 0, y: 40, a: -Math.PI / 2, walk: 0, points: 0, right: 0, fast: 0, floor: 0, pad: null, padAt: 0, h: 0, vh: 0, saved: ctx.hasPass('second_chance') };
      const bots = K.crew(ctx, 7, (i) => ({ x: (i - 3) * 30, y: 60 + (i % 2) * 30, points: 0, right: 0, floor: 0, choice: null, react: 0, h: 0, vh: 0 }));
      const everyone = () => [me].concat(bots);
      let qi = -1, q = null, options = [], answer = 0, phase = 'think', timeLeft = 0, reveal = 0, ended = false, fifty = [];
      const think = (VAR.think || T.think) + (ctx.hasPass('extra_time') ? 3 : 0);
      ctx.banner(ctx.game.name, VAR.tf ? 'TRUE or FALSE: stand on your answer' : 'Stand on the right answer!', 2200);

      function padAt(p) { return pads.find((d) => Math.abs(d.x - p.x) < T.pad / 2 && Math.abs(d.y - p.y) < T.pad / 2 * (VAR.tf ? 1.4 : 1)) || null; }
      function nextQuestion() {
        qi++;
        if (qi >= nQ) return finish();
        q = questions[qi];
        if (VAR.tf) { options = ['True', 'False']; answer = q[1] === 'True' ? 0 : 1; }
        else { const opts = U.shuffle(q.slice(1).slice(0, 4), rng); options = opts; answer = opts.indexOf(q[1]); }
        fifty = [];
        if (!VAR.tf && ctx.hasPass('fifty') && qi % 3 === 2) fifty = U.shuffle([0, 1, 2, 3].filter((i) => i !== answer), rng).slice(0, 2);
        pads.forEach((d) => { d.drop = 0; });
        everyone().forEach((p) => { p.h = 0; p.vh = 0; p.pad = null; p.padAt = 0; });
        bots.forEach((b) => {
          const acc = VAR.bank === 'math' ? 0.35 + b.skill * 0.6 : 0.4 + b.skill * 0.5;
          b.choice = rng() < acc ? answer : U.pick([0, 1, 2, 3].slice(0, pads.length).filter((i) => i !== answer), rng);
          b.react = 1 + rng() * (think - 3) * (1.1 - b.skill);
        });
        phase = 'think'; timeLeft = think;
        ctx.sfx('beep');
      }
      function resolve() {
        phase = 'reveal'; reveal = T.reveal;
        pads.forEach((d) => { if (d.i !== answer) d.drop = 0.001; });
        ctx.sfx('explosion');
        for (const p of everyone()) {
          const pad = padAt(p);
          const ok = pad && pad.i === answer;
          if (ok) {
            const bonus = Math.round(Math.max(0, think - (p.padAt || think)) * 10);
            p.points += 100 + bonus; p.right = (p.right || 0) + 1; p.floor = (p.floor || 0) + 1;
            if (p === me) { ctx.sfx('coin'); ctx.addStat('correct', 1); if (p.padAt <= 3) me.fast++; if (me.fast >= 5) ctx.badge(ctx.gameId + '_fast'); }
          } else {
            if (p === me && me.saved) { me.saved = false; ctx.feed('Second Chance saved you!', 'star', '#3fd08a'); continue; }
            p.floor = Math.max(0, (p.floor || 0) - (VAR.tf ? 1 : 0));
            p.falling = true;
            if (p === me) { ctx.sfx('lose'); ctx.feed('The answer was ' + (VAR.tf ? options[answer].toUpperCase() : PAD[answer][0] + ': ' + options[answer]), 'leave', '#ff9d9d'); }
          }
        }
        const rightBots = bots.filter((b) => padAt(b) && padAt(b).i === answer);
        if (rightBots.length && rng() < 0.4) ctx.botText(U.pick(rightBots, rng).bot, U.pick(['easy', 'knew it', 'big brain', 'lets gooo', 'called it']), 500);
        const wrongBot = bots.find((b) => !(padAt(b) && padAt(b).i === answer));
        if (wrongBot && rng() < 0.35) ctx.botText(wrongBot.bot, U.pick(['NOOO', 'i was so sure', 'rigged lol', 'wait what', 'my finger slipped']), 900);
      }
      function finish() {
        if (ended) return;
        ended = true; phase = 'over';
        const key = VAR.tf ? 'floor' : 'points';
        const table = everyone().slice().sort((a, b) => b[key] - a[key] || b.points - a.points);
        const place = table.indexOf(me) + 1;
        ctx.best('bestScore', me.points);
        if (place === 1) ctx.badge(ctx.gameId + '_win');
        if (me.right === nQ) ctx.badge(ctx.gameId + '_perfect');
        K.finish(ctx, { win: place === 1, title: place === 1 ? 'Quiz champion!' : 'Quiz over', subtitle: me.right + ' / ' + nQ + ' right · ' + me.points + ' pts', score: me.points, place, of: table.length, stats: [['Correct', me.right + ' / ' + nQ], ['Points', me.points]].concat(VAR.tf ? [['Floor reached', me.floor]] : []).concat([['Winner', place === 1 ? 'You' : table[0].bot.displayName]]), rewards: T.rewards });
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        V.preset(VAR.preset, { fogNear: 1500, fogFar: 4000 });
        if (VAR.preset === 'space') V.stars(300);
        V.shadowSize(500);
        V.box(0, -30, 60, 720, 30, 560, VAR.stage);
        V.box(0, -60, 60, 740, 30, 580, U.shade(VAR.stage, -0.3));
        K.bunting(V, 0, 60, 420, ['#ff4a5a', '#3a8bff', '#ffd23f', '#3fd08a'], 40);
        // host screen behind the pads
        V.box(0, -30, -300, 520, 240, 16, '#141a2a');
        V.sign(ctx.game.name.toUpperCase(), 0, 170, -290, { h: 40, color: '#ffe066' });
        if (VAR.tf) { for (let f = 0; f < 12; f++) V.box(600, -60 + f * 40, -200 + f * 8, 90, 6, 60, f % 2 ? '#b67cff' : '#ffffff', { glow: 0.2 }); V.sign('TOWER', 600, 470, -100, { h: 34, color: '#ffe066' }); }
        const padMeshes = pads.map((d) => { const g = V.group(); V.box(0, -12, 0, T.pad, 12, T.pad * (VAR.tf ? 1.4 : 1), d.color, { parent: g, glow: 0.25 }); V.sign(d.letter, 0, 30, 0, { h: 34, color: '#ffffff', parent: g }); g.position.set(d.x, 0, d.y); return g; });
        const pool = V.pool();
        return function sync() {
          const t = ctx.time;
          pads.forEach((d, i) => { padMeshes[i].position.y = -d.drop * 600; padMeshes[i].visible = d.drop < 1.2; if (fifty.includes(d.i) && phase === 'think') padMeshes[i].children[0].material.emissiveIntensity = 0.2 + (Math.sin(t * 10) > 0 ? 0.6 : 0); });
          for (const p of everyone()) {
            if (p.h < -700) continue;
            K.rig(V, ctx, p === me ? 'me' : p, p.x, p.h, p.y, { a: p.a, move: p.moving ? 1 : 0, air: p.h < -2, scale: 8, mode: p.h < -60 ? 'ko' : 'idle' });
            if (VAR.tf && p.floor) V.label(p.x, p.h + 90, p.y, { name: 'Floor ' + p.floor, color: '#ffe066', dy: -16 });
          }
          pool.sweep();
          V.look(0, 0, -30, { dist: 800, pitch: 0.95, fov: 45, lerp: 0.05 }, 1 / 60);
          V.sweep();
        };
      })();

      function drawHud(g) {
        // the question board
        const bw = Math.min(760, W - 260), bx = W / 2 - bw / 2;
        G.panel(g, bx, 12, bw, VAR.tf ? 74 : 132, 0.88);
        G.text(g, 'Question ' + (qi + 1) + ' / ' + nQ, bx + 16, 32, { size: 12, color: '#a1abbb', weight: 700 });
        G.text(g, q ? q[0] : '', W / 2, 58, { size: 20, weight: 800, align: 'center' });
        if (!VAR.tf) options.forEach((o, i) => {
          const x = bx + 16 + (i % 2) * (bw / 2), y = 84 + Math.floor(i / 2) * 26;
          const faded = fifty.includes(i) && phase === 'think';
          G.fillRR(g, x, y - 16, 26, 22, 6, faded ? '#3a3f4a' : PAD[i][1]);
          G.text(g, PAD[i][0], x + 13, y, { size: 13, weight: 900, align: 'center', color: '#141018' });
          G.text(g, o, x + 34, y, { size: 14.5, weight: 700, color: phase === 'reveal' ? (i === answer ? '#3fd08a' : '#6b7486') : faded ? '#6b7486' : '#ffffff' });
        });
        if (phase === 'think') { G.panel(g, W / 2 - 38, VAR.tf ? 92 : 150, 76, 40); G.text(g, Math.ceil(timeLeft) + 's', W / 2, VAR.tf ? 119 : 177, { size: 22, weight: 900, align: 'center', color: timeLeft < 3 ? '#ff8b98' : '#8fd3ff' }); }
        const key = VAR.tf ? 'floor' : 'points';
        K.board(g, W, everyone().map((p) => ({ n: p === me ? ctx.player.name : p.bot.displayName, v: p[key] || 0, me: p === me })), { title: VAR.tf ? 'Tower floor' : 'Points' });
        const mine = padAt(me);
        K.hint(g, W, H, phase === 'think' ? (mine ? 'You are on ' + (VAR.tf ? options[mine.i].toUpperCase() : mine.letter + ': ' + options[mine.i]) : 'Walk onto an answer pad') : phase === 'reveal' ? (mine && mine.i === answer ? 'Correct!' : 'Next question...') : '', mine && phase === 'reveal' && mine.i === answer ? '#3fd08a' : null);
      }
      function draw2d(g) {
        g.fillStyle = '#10141f'; g.fillRect(0, 0, W, H);
        g.save(); g.translate(W / 2, H / 2 + 90); g.scale(0.7, 0.7);
        for (const d of pads) if (d.drop < 0.3) { g.fillStyle = d.color; g.fillRect(d.x - T.pad / 2, d.y - T.pad / 2, T.pad, T.pad); }
        for (const p of everyone()) if (p.h > -40) G.avatarTop(g, p.x, p.y, 13, p === me ? ctx.player.look : p.bot.look, p.a, { walk: p.walk });
        g.restore();
        drawHud(g);
      }

      nextQuestion();
      return {
        update(dt) {
          if (phase === 'over') return;
          const bounds = { x0: -330, y0: -250, x1: 330, y1: 300 };
          if (phase === 'think') {
            timeLeft -= dt;
            K.move(ctx, me, T.speed, dt, bounds);
            const pd = padAt(me);
            if (pd !== me.pad) { me.pad = pd; me.padAt = think - timeLeft; }
            for (const b of bots) {
              b.react -= dt;
              const og = K.ordered(ctx, b, me, { near: 40 });
              const tgt = og || (b.react <= 0 ? pads[b.choice] : null);
              if (tgt) K.steer(b, tgt.x + ((b.skill * 97) % 1 - 0.5) * 60, tgt.y + ((b.skill * 53) % 1 - 0.5) * 60, T.speed * 0.9, dt, bounds);
              const bp = padAt(b); if (bp !== b.pad) { b.pad = bp; b.padAt = think - timeLeft; }
            }
            if (timeLeft <= 0) resolve();
          } else if (phase === 'reveal') {
            reveal -= dt;
            for (const d of pads) if (d.drop > 0) d.drop += dt * 1.4;
            for (const p of everyone()) if (p.falling) { p.vh -= 1500 * dt; p.h += p.vh * dt; }
            if (reveal <= 0) {
              for (const p of everyone()) { if (p.falling) { p.falling = false; p.x = (Math.random() - 0.5) * 120; p.y = 40 + Math.random() * 60; } p.h = 0; p.vh = 0; }
              nextQuestion();
            }
          }
        },
        draw: draw2d,
        render3d() { if (view) view(); },
        hud: drawHud,
        onBotJoin(b) { K.join(bots, b, 7, () => ({ x: 0, y: 80, points: 0, right: 0, floor: 0, choice: 0, react: 99, h: 0, vh: 0 }), ctx); },
        onBotLeave(b) { K.leave(bots, b); },
        _test: { me, bots, pads, get answer() { return answer; }, get phase() { return phase; }, get qi() { return qi; }, resolve, nextQuestion, finish, questions },
      };
    },
  });
})((window.BF = window.BF || {}));
