/**
 * City Life (gameType "city") — open city roleplay with jobs.
 * Walk or drive around a tile city with traffic, pedestrians and neighbors.
 * Jobs: pizza delivery (timed, tips for speed), taxi fares (drive a passenger
 * across town) and park cleanup (collect litter). Spend City Cash on cars,
 * City Life outfits and coffee.
 * Win: finish 3 jobs before the shift ends. Lose: the shift ends first.
 * Passes: sports_car (Ember Roadster), vip_pay (double City Cash).
 * Store: City Cash Bundle (progress.custom.cash).
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  const TS = 40, MW = 66, MH = 42;
  const GRASS = 0, ROAD = 1, WALK = 2, BLD = 3, PARK = 4, LOT = 5, TREE = 6, WATER = 7;
  const SOLID = new Set([BLD, TREE, WATER]);
  const V_ROADS = [1, 17, 33, 49, 63];
  const H_ROADS = [1, 14, 27, 39];
  const H_NAMES = ['North Rd', 'Maple St', 'Oak Ave', 'South Rd'];

  const T = {
    shift: 360, goal: 3, walk: 150, coffee: 1.4, coffeeTime: 45, radius: 11,
    pizza: { base: 150, perPx: 0.05, tip: 4, limitBase: 16, limitPerPx: 1 / 120 },
    taxi: { base: 120, perPx: 0.09, limitBase: 20, limitPerPx: 1 / 170 },
    cleanup: { pay: 140, count: 8, limit: 45 },
    coffeePrice: 60, startCash: 500,
    rewards: { job: 4, play: 15, win: 50, xpJob: 25, xpPlay: 30, xpWin: 120 },
  };

  const CARS = {
    hatch: { name: 'Hatchback', price: 2000, speed: 330, accel: 430, color: '#46a8ff' },
    pickup: { name: 'Pickup', price: 4500, speed: 365, accel: 460, color: '#4ad17f', long: true },
    cruiser: { name: 'City Cruiser', price: 9000, speed: 410, accel: 540, color: '#b67cff' },
    roadster: { name: 'Ember Roadster', pass: 'sports_car', speed: 480, accel: 660, color: '#ff5a1f' },
    taxi: { name: 'Company Taxi', speed: 340, accel: 450, color: '#ffc940', company: true },
  };
  const OUTFITS = {
    chef: { name: 'Chef Whites', price: 300, look: { shirt: '#f8fafc', shirt2: '#e8ecf3', pants: '#39414f', hat: '#ffffff', hatStyle: 'cap' } },
    cabbie: { name: 'Cabbie Jacket', price: 450, look: { shirt: '#ffc940', shirt2: '#1f2a44', pants: '#1f2a44', hat: '#1f2a44', hatStyle: 'cap' } },
    beach: { name: 'Beach Day', price: 700, look: { shirt: '#39f3ff', shirt2: '#ffd66b', pants: '#ffb454', hat: null } },
    sporty: { name: 'Track Suit', price: 600, look: { shirt: '#ff3d5a', shirt2: '#ffffff', pants: '#ff3d5a' } },
    business: { name: 'Sharp Suit', price: 900, look: { shirt: '#1f2a44', shirt2: '#e8ecf3', pants: '#1f2a44', hat: null } },
    night: { name: 'Night Out', price: 1200, look: { shirt: '#b67cff', shirt2: '#ff4f9a', pants: '#111827', hat: null } },
  };

  // ------------------------------------------------------------- city map
  const CITY = (() => {
    const map = new Uint8Array(MW * MH);
    const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < MW && y < MH) map[y * MW + x] = v; };
    const buildings = [], houses = [], blocks = [], lotCars = [];
    let kiosk = null, fountain = null;
    for (const c of V_ROADS) for (let y = 0; y < MH; y++) { set(c, y, ROAD); set(c + 1, y, ROAD); }
    for (const r of H_ROADS) for (let x = 0; x < MW; x++) { set(x, r, ROAD); set(x, r + 1, ROAD); }
    const kinds = [['shops1', 'shops2', 'dealer', 'res'], ['res', 'park', 'res', 'res'], ['res', 'res', 'res', 'res']];
    const rr = U.rng('city-life-map');
    let houseNo = 2;
    const bld = (x0, y0, x1, y1, o) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, BLD);
      const b = Object.assign({ x0, y0, x1, y1 }, o);
      b.cx = ((x0 + x1 + 1) / 2) * TS;
      return b;
    };
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
      const c0 = V_ROADS[i] + 2, c1 = V_ROADS[i + 1] - 1, r0 = H_ROADS[j] + 2, r1 = H_ROADS[j + 1] - 1;
      const kind = kinds[j][i];
      blocks.push({ c0, c1, r0, r1, kind });
      for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) set(x, y, y === r0 || y === r1 || x === c0 || x === c1 ? WALK : kind === 'park' ? PARK : GRASS);
      if (kind === 'shops1' || kind === 'shops2' || kind === 'dealer') {
        const mid = c0 + 6;
        const names = { shops1: [['pizza', 'Pizza Palace', '#e03e5a'], ['cafe', 'Bean There Café', '#9a6b3c']], shops2: [['taxi', 'Checker Cabs', '#ffc940'], ['boutique', 'Block Boutique', '#b67cff']], dealer: [['dealer', 'Motor Mile', '#46a8ff']] }[kind];
        names.forEach((n, k) => {
          const x0 = k ? mid + 1 : c0 + 1, x1 = k ? c1 - 1 : mid;
          const b = bld(x0, r0 + 1, x1, r1 - 2, { id: n[0], name: n[1], color: n[2] });
          b.door = { x: b.cx, y: (r1 - 1) * TS + TS / 2 };
          buildings.push(b);
        });
        if (kind === 'dealer') {
          for (let y = r0 + 1; y <= r1 - 1; y++) for (let x = mid + 1; x <= c1 - 1; x++) set(x, y, LOT);
          ['hatch', 'pickup', 'cruiser'].forEach((id, k) => lotCars.push({ id, x: (mid + 3.5) * TS, y: (r0 + 2 + k * 2.6) * TS }));
        }
      } else if (kind === 'res') {
        const spots = [[c0 + 1, r0 + 1, true], [c1 - 5, r0 + 1, true], [c0 + 1, r1 - 3, false], [c1 - 5, r1 - 3, false]];
        spots.forEach(([x0, y0, top]) => {
          const b = bld(x0, y0, x0 + 4, y0 + 2, { id: 'house', color: U.pick(['#f4ecd0', '#cfe3ef', '#ffd1dc', '#d8f0c8', '#f2d6a2'], rr), roof: U.pick(['#9a3b2e', '#39414f', '#2f5f8a', '#6b4b2a'], rr) });
          b.door = { x: b.cx, y: (top ? r0 : r1) * TS + TS / 2 };
          b.top = top;
          b.address = houseNo + ' ' + H_NAMES[top ? j : j + 1];
          houseNo += 2 + Math.floor(rr() * 3);
          houses.push(b);
        });
        for (let n = 0; n < 3; n++) { const x = c0 + 2 + Math.floor(rr() * (c1 - c0 - 3)), y = r0 + 4 + Math.floor(rr() * Math.max(1, r1 - r0 - 7)); if (map[y * MW + x] === GRASS) set(x, y, TREE); }
      } else if (kind === 'park') {
        const fx = Math.floor((c0 + c1) / 2), fy = Math.floor((r0 + r1) / 2) - 1;
        set(fx, fy, WATER); set(fx + 1, fy, WATER); set(fx, fy + 1, WATER); set(fx + 1, fy + 1, WATER);
        fountain = { x: (fx + 1) * TS, y: (fy + 1) * TS };
        for (let n = 0; n < 14; n++) {
          const x = c0 + 1 + Math.floor(rr() * (c1 - c0 - 1)), y = r0 + 1 + Math.floor(rr() * (r1 - r0 - 1));
          if (Math.abs(x - fx) > 2 || Math.abs(y - fy) > 2) if (map[y * MW + x] === PARK) set(x, y, TREE);
        }
        const k = bld(fx, r1 - 2, fx + 1, r1 - 2, { id: 'kiosk', name: 'Park Rangers', color: '#2f8f47' });
        k.door = { x: k.cx, y: (r1 - 1) * TS + TS / 2 };
        set(fx, r1 - 1, PARK); set(fx + 1, r1 - 1, PARK);
        kiosk = k;
        buildings.push(k);
      }
    }
    return { map, buildings, houses, blocks, lotCars, kiosk, fountain };
  })();

  const tileAt = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH ? BLD : CITY.map[y * MW + x]);
  const tileAtPx = (px, py) => tileAt(Math.floor(px / TS), Math.floor(py / TS));
  const LANES = [];
  H_ROADS.forEach((r) => { LANES.push({ axis: 'x', pos: (r + 0.5) * TS, dir: -1 }, { axis: 'x', pos: (r + 1.5) * TS, dir: 1 }); });
  V_ROADS.forEach((c) => { LANES.push({ axis: 'y', pos: (c + 0.5) * TS, dir: 1 }, { axis: 'y', pos: (c + 1.5) * TS, dir: -1 }); });

  function drawCar(g, x, y, a, color, o) {
    o = o || {};
    const L = o.long ? 44 : 38, Wd = 21;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    G.shadow(g, 2, 3, L * 0.55, Wd * 0.6, 0.3);
    g.fillStyle = '#16181f';
    for (const [wx, wy] of [[-L * 0.3, -Wd / 2], [L * 0.3, -Wd / 2], [-L * 0.3, Wd / 2], [L * 0.3, Wd / 2]]) g.fillRect(wx - 5, wy - 2.5, 10, 5);
    G.fillRR(g, -L / 2, -Wd / 2, L, Wd, 6, color);
    G.fillRR(g, -L * 0.12, -Wd / 2 + 3, L * 0.34, Wd - 6, 3, 'rgba(20,30,50,.75)');
    if (o.long) G.fillRR(g, -L / 2 + 3, -Wd / 2 + 3, L * 0.3, Wd - 6, 2, U.shade(color, -0.25));
    else G.fillRR(g, -L * 0.38, -Wd / 2 + 3, L * 0.18, Wd - 6, 2, 'rgba(20,30,50,.55)');
    g.fillStyle = '#fff6c8';
    g.fillRect(L / 2 - 3, -Wd / 2 + 2, 3, 4); g.fillRect(L / 2 - 3, Wd / 2 - 6, 3, 4);
    if (o.taxi) { G.fillRR(g, -4, -4, 10, 8, 2, '#1b1b22'); G.text(g, 'TAXI', 1, 2.5, { size: 5, align: 'center', color: '#ffc940', weight: 900 }); }
    g.restore();
  }

  BF.GameModules.register('city', {
    orders: ['follow', 'come', 'stay', 'leave', 'help'],
    three: true,
    maxBots: 9,
    feedTop: 0.2,
    actions: { use: ['KeyE'], exit: ['KeyQ'] },
    controls: { joystick: true, buttons: [{ act: 'use', label: 'Enter', icon: 'door' }, { act: 'exit', label: 'Exit car', icon: 'arrowLeft' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const V = ctx.g3;
      const parts = V ? V.particles2d(10) : new BF.Particles(300);
      const floats = V ? V.floaters2d(50) : new BF.Floaters();
      const cam = new BF.Camera(W, H);
      cam.bounds = { x: 0, y: 0, w: MW * TS, h: MH * TS };
      const d = ctx.data;
      if (d.cash == null) d.cash = T.startCash;
      d.cars = d.cars || [];
      d.outfits = d.outfits || [];
      if (ctx.hasPass('sports_car') && !d.cars.includes('roadster')) d.cars.push('roadster');
      ctx.save();
      const vip = ctx.hasPass('vip_pay');

      let phase = 'play';
      let shift = T.shift + (ctx.hasPass('overtime') ? 90 : 0);
      let jobsDone = 0, earned = 0, goalHit = false;
      let job = null;
      let panel = null;
      let coffeeT = 0;
      const pizza = CITY.buildings.find((b) => b.id === 'pizza');
      const me = { x: pizza.door.x + 60, y: pizza.door.y + 24, a: Math.PI / 2, walk: 0 };
      let car = null; // the car the player is driving
      const parked = []; // player-owned cars on the map
      function spawnOwnCar(id, x, y) {
        const c = { id, def: CARS[id], x, y, a: 0, v: 0, mine: true };
        parked.push(c);
        return c;
      }
      if (d.car && d.cars.includes(d.car)) spawnOwnCar(d.car, me.x + 70, me.y + 6);

      const lookNow = () => (d.style && OUTFITS[d.style] && d.outfits.includes(d.style) ? Object.assign({}, ctx.player.look, OUTFITS[d.style].look) : ctx.player.look);
      let myLook = lookNow();

      // --------------------------------------------------------- traffic
      const traffic = [];
      const tr = U.rng(Date.now());
      for (let i = 0; i < 16; i++) {
        const lane = LANES[i % LANES.length];
        const along = tr() * (lane.axis === 'x' ? MW * TS : MH * TS);
        traffic.push({ lane, along, v: 110 + tr() * 70, stop: 0, color: U.pick(['#9aa5b5', '#e03e5a', '#f8fafc', '#2f7fb8', '#39414f', '#ffb454', '#4ad17f'], tr), taxi: tr() < 0.12 });
      }
      const carPos = (t) => (t.lane.axis === 'x' ? { x: t.along, y: t.lane.pos, a: t.lane.dir > 0 ? 0 : Math.PI } : { x: t.lane.pos, y: t.along, a: t.lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2 });

      // ------------------------------------------------------ pedestrians
      function ringPoint(b, t) {
        const x0 = (b.c0 + 0.5) * TS, x1 = (b.c1 + 0.5) * TS, y0 = (b.r0 + 0.5) * TS, y1 = (b.r1 + 0.5) * TS;
        const w = x1 - x0, h = y1 - y0, per = 2 * (w + h);
        let p = ((t % per) + per) % per;
        if (p < w) return { x: x0 + p, y: y0, a: 0 };
        p -= w; if (p < h) return { x: x1, y: y0 + p, a: Math.PI / 2 };
        p -= h; if (p < w) return { x: x1 - p, y: y1, a: Math.PI };
        p -= w; return { x: x0, y: y1 - p, a: -Math.PI / 2 };
      }
      const peds = [];
      for (let i = 0; i < 18; i++) {
        const look = { skin: U.pick(['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'], tr), shirt: U.pick(['#ff7a2e', '#46a8ff', '#4ad17f', '#b67cff', '#ff4f9a', '#ffc940', '#e8ecf3'], tr), pants: U.pick(['#1f2a44', '#39414f', '#5b6b3a', '#7a4a2a'], tr), shoes: '#1b1b22', hair: U.pick(['#1b1b22', '#6b4b2a', '#d7b56d', '#b0412e'], tr) };
        peds.push({ block: U.pick(CITY.blocks, tr), t: tr() * 2000, v: (30 + tr() * 30) * (tr() < 0.5 ? -1 : 1), look, walk: 0 });
      }

      // -------------------------------------------------------------- bots
      const bots = [];
      function addBot(b) {
        const r = U.rng(b.id + ':city');
        if (r() < 0.4) {
          const lane = U.pick(LANES, r);
          bots.push({ bot: b, drive: true, lane, along: r() * (lane.axis === 'x' ? MW * TS : MH * TS), v: 150 + r() * 90, color: U.pick(Object.values(CARS).map((c) => c.color), r), stop: 0, x: 0, y: 0, a: 0, jobT: 12 + r() * 30 });
        } else {
          bots.push({ bot: b, drive: false, block: U.pick(CITY.blocks, r), t: r() * 2000, v: (45 + r() * 30) * (r() < 0.5 ? -1 : 1), x: 0, y: 0, a: 0, walk: 0, jobT: 12 + r() * 30 });
        }
      }
      ctx.bots.forEach(addBot);

      // ------------------------------------------------------------ helpers
      function blockedAt(px, py, r) {
        for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) if (SOLID.has(tileAtPx(px + ox, py + oy))) return true;
        return false;
      }
      function nearestDoor(range) {
        let best = null, bd = range;
        for (const b of CITY.buildings) { const dd = U.dist(b.door.x, b.door.y, me.x, me.y); if (dd < bd) { bd = dd; best = b; } }
        return best;
      }
      function payJob(amount, what) {
        amount = Math.round(amount * (vip ? 2 : 1));
        d.cash += amount;
        earned += amount;
        jobsDone++;
        ctx.save();
        ctx.addStat('jobs', 1);
        ctx.addStat('cash', amount);
        ctx.playerStat('jobs', 1);
        ctx.quest('job', 1);
        ctx.reward(T.rewards.job, 'city jobs');
        ctx.xp(T.rewards.xpJob);
        ctx.badge('cl_first_job');
        if ((ctx.progress().jobs || 0) >= 25) ctx.badge('cl_employee');
        ctx.sfx('purchase');
        floats.add(me.x, me.y - 30, '+$' + U.fmt(amount), '#4ad17f', 18);
        ctx.feed(what + ' +$' + U.fmt(amount) + (vip ? ' (VIP Paycheck)' : ''), 'coin', '#4ad17f');
        if (!goalHit && jobsDone >= T.goal) {
          goalHit = true;
          ctx.banner('SHIFT GOAL COMPLETE!', 'Keep working or clock out for your rewards', 2200);
          ctx.sfx('levelup');
        }
        tray();
      }
      function failJob(msg) {
        job = null;
        ctx.sfx('error');
        ctx.banner('Job failed', msg, 1800);
        if (companyTaxi && !car) removeCompanyTaxi();
      }
      let companyTaxi = null;
      function removeCompanyTaxi() {
        if (!companyTaxi) return;
        if (car === companyTaxi) exitCar(true);
        const i = parked.indexOf(companyTaxi);
        if (i >= 0) parked.splice(i, 1);
        companyTaxi = null;
      }
      function randomWalkSpot(minD, maxD) {
        for (let n = 0; n < 200; n++) {
          const b = U.pick(CITY.blocks);
          const p = ringPoint(b, Math.random() * 4000);
          const dd = U.dist(p.x, p.y, me.x, me.y);
          if (dd > minD && dd < maxD) return p;
        }
        return ringPoint(CITY.blocks[0], 0);
      }

      function startJob(kind) {
        if (job) { ctx.toast('Finish your current job first', 'error'); return; }
        if (kind === 'pizza') {
          const house = U.pick(CITY.houses.filter((h) => U.dist(h.door.x, h.door.y, me.x, me.y) > 500));
          const dist = U.dist(house.door.x, house.door.y, me.x, me.y);
          job = { kind, target: { x: house.door.x, y: house.door.y, label: house.address }, limit: T.pizza.limitBase + dist * T.pizza.limitPerPx, t: 0, pay: T.pizza.base + dist * T.pizza.perPx, text: 'Deliver pizza to ' + house.address };
          ctx.banner('Pizza for ' + house.address, 'Deliver it before it gets cold!', 1800);
        } else if (kind === 'taxi') {
          if (!car && !parked.some((c) => c.mine && !c.def.company)) {
            const stand = CITY.buildings.find((b) => b.id === 'taxi');
            companyTaxi = spawnOwnCar('taxi', stand.door.x + 50, stand.door.y + 30);
            ctx.feed('Checker Cabs lent you a taxi for this fare.', 'info', '#ffc940');
          }
          const pick = randomWalkSpot(350, 1100);
          job = { kind, stage: 'pickup', target: { x: pick.x, y: pick.y, label: 'Passenger' }, limit: 60, t: 0, text: 'Pick up the passenger', passenger: { look: { skin: '#e0ac69', shirt: U.pick(['#46a8ff', '#ff7a2e', '#4ad17f']), pants: '#1f2a44', shoes: '#1b1b22', hair: '#1b1b22' } } };
          ctx.banner('Taxi fare', 'Drive to the passenger marker', 1500);
        } else if (kind === 'cleanup') {
          const park = CITY.blocks.find((b) => b.kind === 'park');
          const litter = [];
          while (litter.length < T.cleanup.count) {
            const x = park.c0 + 1 + Math.random() * (park.c1 - park.c0 - 1), y = park.r0 + 1 + Math.random() * (park.r1 - park.r0 - 1);
            if (tileAt(Math.floor(x), Math.floor(y)) === PARK) litter.push({ x: x * TS, y: y * TS, kind: Math.floor(Math.random() * 3) });
          }
          job = { kind, litter, limit: T.cleanup.limit, t: 0, text: 'Clean up the park', got: 0 };
          ctx.banner('Park cleanup', 'Collect ' + T.cleanup.count + ' pieces of litter', 1500);
        }
        closePanel();
        ctx.sfx('go');
      }

      function updateJob(dt) {
        if (!job) return;
        job.t += dt;
        const left = job.limit - job.t;
        if (left <= 0) {
          failJob(job.kind === 'pizza' ? 'The pizza got cold.' : job.kind === 'taxi' ? 'The passenger took the bus instead.' : 'The rangers wanted it done faster.');
          return;
        }
        if (job.kind === 'pizza' && U.dist(me.x, me.y, job.target.x, job.target.y) < 46) {
          const tip = Math.floor(left * T.pizza.tip);
          const pay = job.pay + tip;
          job = null;
          payJob(pay, 'Pizza delivered (tip $' + tip + ').');
        } else if (job.kind === 'taxi') {
          const near = U.dist(me.x, me.y, job.target.x, job.target.y) < 70;
          if (job.stage === 'pickup' && near) {
            if (!car) { if (Math.floor(job.t * 2) % 6 === 0) floats.add(me.x, me.y - 30, 'You need a car for this', '#ffd66b', 12); return; }
            if (Math.abs(car.v) > 80) return;
            const dest = randomWalkSpot(700, 1700);
            const dist = U.dist(dest.x, dest.y, me.x, me.y);
            job.stage = 'drop';
            job.target = { x: dest.x, y: dest.y, label: 'Drop-off' };
            job.limit = job.t + T.taxi.limitBase + dist * T.taxi.limitPerPx;
            job.pay = T.taxi.base + dist * T.taxi.perPx;
            job.text = 'Drive the passenger to the drop-off';
            ctx.sfx('open');
            ctx.feed('Passenger picked up. Head to the drop-off!', 'info', '#ffc940');
          } else if (job.stage === 'drop' && near && car && Math.abs(car.v) < 80) {
            const bonus = Math.floor(Math.max(0, job.limit - job.t) * 3);
            const pay = job.pay + bonus;
            job = null;
            payJob(pay, 'Taxi fare complete (speed bonus $' + bonus + ').');
            if (companyTaxi) setTimeout(() => { if (!job) { removeCompanyTaxi(); ctx.feed('You returned the company taxi.', 'info', '#cfd6e2'); } }, 2500);
          }
        } else if (job.kind === 'cleanup') {
          for (let i = job.litter.length - 1; i >= 0; i--) {
            const l = job.litter[i];
            if (U.dist(l.x, l.y, me.x, me.y) < 26) {
              job.litter.splice(i, 1);
              job.got++;
              ctx.sfx('pickup');
              parts.emit(l.x, l.y, { count: 8, color: '#4ad17f', speed: 80, life: 0.4 });
            }
          }
          if (!job.litter.length) { job = null; payJob(T.cleanup.pay, 'The park is spotless.'); }
        }
      }

      // ---------------------------------------------------------- driving
      function enterCar(c) {
        car = c;
        me.x = c.x; me.y = c.y;
        const i = parked.indexOf(c);
        if (i >= 0) parked.splice(i, 1);
        ctx.sfx('open');
      }
      function exitCar(silent) {
        if (!car) return;
        const c = car;
        car = null;
        c.v = 0;
        parked.push(c);
        for (const [ox, oy] of [[0, -32], [0, 32], [-40, 0], [40, 0], [0, -60], [0, 60]]) {
          const nx = c.x + Math.cos(c.a) * ox - Math.sin(c.a) * oy, ny = c.y + Math.sin(c.a) * ox + Math.cos(c.a) * oy;
          if (!blockedAt(nx, ny, T.radius)) { me.x = nx; me.y = ny; break; }
        }
        if (!silent) ctx.sfx('close');
        if (c === companyTaxi && !job) { parked.splice(parked.indexOf(c), 1); companyTaxi = null; ctx.feed('You returned the company taxi.', 'info', '#cfd6e2'); }
      }
      function driveCar(dt) {
        const inp = ctx.input;
        const ax = inp.axis();
        const def = car.def;
        const throttle = -ax.y;
        car.v += throttle * def.accel * dt;
        if (Math.abs(throttle) < 0.1) car.v = U.approach(car.v, 0, 260 * dt);
        car.v = U.clamp(car.v, -def.speed * 0.4, def.speed);
        const steer = ax.x * 2.6 * U.clamp(car.v / 160, -1, 1);
        car.a += steer * dt;
        const nx = car.x + Math.cos(car.a) * car.v * dt, ny = car.y + Math.sin(car.a) * car.v * dt;
        let hit = false;
        if (!blockedAt(nx, car.y, 14)) car.x = nx; else hit = true;
        if (!blockedAt(car.x, ny, 14)) car.y = ny; else hit = true;
        if (hit && Math.abs(car.v) > 120) { ctx.sfx('hit'); cam.shake(3, 0.15); }
        if (hit) car.v *= 0.5;
        for (const t of traffic) {
          const p = carPos(t);
          if (U.dist(p.x, p.y, car.x, car.y) < 32) {
            if (Math.abs(car.v) > 90) { ctx.sfx('hit'); cam.shake(4, 0.2); floats.add(car.x, car.y - 30, 'Honk!', '#ffd66b', 13); }
            car.v *= -0.3; t.stop = 1.2;
            const a = U.angleTo(p.x, p.y, car.x, car.y); car.x += Math.cos(a) * 6; car.y += Math.sin(a) * 6;
          }
        }
        car.x = U.clamp(car.x, 10, MW * TS - 10); car.y = U.clamp(car.y, 10, MH * TS - 10);
        me.x = car.x; me.y = car.y;
      }

      // ----------------------------------------------------------- panels
      function closePanel() { panel = null; ctx.ui.remove('bld'); }
      const cashHtml = (n) => '<span class="gp-price" style="color:#4ad17f">$' + U.fmt(n) + '</span>';
      function openBuilding(b) {
        panel = b.id;
        ctx.sfx('open');
        renderPanel();
      }
      function renderPanel() {
        if (!panel) return;
        const close = '<button class="btn btn-ghost btn-sm gp-close" data-gact="close" aria-label="Close">' + BF.icon('x', 14) + '</button>';
        const b = CITY.buildings.find((x) => x.id === panel);
        const busy = job ? '<p class="faint">You are on a job: ' + U.esc(job.text) + '.</p>' : '';
        let body = '';
        if (panel === 'pizza') body = '<p>Hot pizzas, fast. Carry a pizza to a house before the timer runs out. Faster deliveries earn bigger tips.</p><p>Base pay ' + cashHtml(T.pizza.base) + ' plus distance and tips' + (vip ? ' · <b>VIP Paycheck doubles it</b>' : '') + '.</p>' + busy + '<div class="gp-actions"><button class="btn btn-play" data-gact="job-pizza"' + (job ? ' disabled' : '') + '>' + BF.icon('play', 14) + 'Take a delivery</button></div>';
        else if (panel === 'taxi') body = '<p>Pick up a passenger and drive them across town. ' + (d.car || car ? 'You will drive your own car.' : 'No car? We will lend you a company taxi.') + '</p><p>Fares pay ' + cashHtml(T.taxi.base) + ' plus distance and a speed bonus.</p>' + busy + '<div class="gp-actions"><button class="btn btn-play" data-gact="job-taxi"' + (job ? ' disabled' : '') + '>' + BF.icon('play', 14) + 'Start a fare</button></div>';
        else if (panel === 'kiosk') body = '<p>Help the rangers keep Central Park clean. Collect ' + T.cleanup.count + ' pieces of litter in ' + T.cleanup.limit + ' seconds.</p><p>Pays ' + cashHtml(T.cleanup.pay) + '.</p>' + busy + '<div class="gp-actions"><button class="btn btn-play" data-gact="job-cleanup"' + (job ? ' disabled' : '') + '>' + BF.icon('play', 14) + 'Start cleanup</button></div>';
        else if (panel === 'cafe') body = '<p>Iced coffee gives you a spring in your step: walk ' + Math.round((T.coffee - 1) * 100) + '% faster for ' + T.coffeeTime + ' seconds.</p><p>You have ' + cashHtml(d.cash) + '.</p><div class="gp-actions"><button class="btn btn-gold" data-gact="coffee"' + (d.cash < T.coffeePrice ? ' disabled' : '') + '>Iced coffee · $' + T.coffeePrice + '</button></div>';
        else if (panel === 'dealer') body = '<p>New wheels for every budget. You have ' + cashHtml(d.cash) + '.</p><div class="gp-grid">' + Object.entries(CARS).filter(([, c]) => !c.company).map(([id, c]) => {
          const own = d.cars.includes(id);
          const btn = own ? (d.car === id ? '<span class="pill success">Selected</span>' : '<button class="btn btn-sm btn-outline" data-gact="pick-' + id + '">Drive this</button>') : c.pass ? '<span class="pill">Sports Car pass</span>' : '<button class="btn btn-sm btn-gold" data-gact="buy-' + id + '"' + (d.cash < c.price ? ' disabled' : '') + '>Buy $' + U.fmt(c.price) + '</button>';
          return '<div class="gp-card' + (d.car === id ? ' on' : '') + '"><b><span class="pw-dot" style="background:' + c.color + '"></span>' + c.name + '</b><small>Top speed ' + c.speed + ' · ' + (own ? 'Owned' : c.pass ? 'Game pass car' : '$' + U.fmt(c.price)) + '</small>' + btn + '</div>';
        }).join('') + '</div>';
        else if (panel === 'boutique') body = '<p>Outfits you buy here are worn in City Life. You have ' + cashHtml(d.cash) + '.</p><div class="gp-grid">' + Object.entries(OUTFITS).map(([id, o]) => {
          const own = d.outfits.includes(id);
          return '<div class="gp-card' + (d.style === id ? ' on' : '') + '"><b><span class="pw-dot" style="background:' + o.look.shirt + '"></span>' + o.name + '</b><small>' + (own ? 'Owned' : '$' + U.fmt(o.price)) + '</small>' + (own ? (d.style === id ? '<button class="btn btn-sm btn-ghost" data-gact="unwear">Take off</button>' : '<button class="btn btn-sm btn-outline" data-gact="wear-' + id + '">Wear</button>') : '<button class="btn btn-sm btn-gold" data-gact="outfit-' + id + '"' + (d.cash < o.price ? ' disabled' : '') + '>Buy</button>') + '</div>';
        }).join('') + '</div>';
        ctx.ui.panel('bld', close + '<h3>' + BF.icon(panel === 'dealer' ? 'key' : panel === 'boutique' ? 'shirt' : panel === 'cafe' ? 'heart' : 'door', 18) + ' ' + U.esc(b.name) + '</h3>' + body, panel === 'dealer' || panel === 'boutique' ? 'center wide' : 'center');
      }
      function tray() {
        if (phase !== 'play') { ctx.ui.remove('tray'); return; }
        if (!car && !job && !goalHit) { ctx.ui.remove('tray'); return; }
        ctx.ui.panel('tray', (car ? '<button class="btn btn-sm" data-gact="exit-car">' + BF.icon('arrowLeft', 13) + 'Exit car <kbd>Q</kbd></button>' : '') + (job ? '<button class="btn btn-sm btn-ghost" data-gact="quit-job">Quit job</button>' : '') + (goalHit ? '<button class="btn btn-sm btn-play" data-gact="clock-out">' + BF.icon('check', 13) + 'Clock out</button>' : ''), 'tray');
      }
      tray();

      ctx.ui.on((a) => {
        if (a === 'close') return closePanel();
        if (a === 'job-pizza') return startJob('pizza');
        if (a === 'job-taxi') return startJob('taxi');
        if (a === 'job-cleanup') return startJob('cleanup');
        if (a === 'exit-car') { exitCar(); tray(); return; }
        if (a === 'quit-job') { job = null; if (companyTaxi && car !== companyTaxi) removeCompanyTaxi(); ctx.feed('You quit the job.', 'info', '#cfd6e2'); tray(); return; }
        if (a === 'clock-out') return finish(false);
        if (a === 'coffee' && d.cash >= T.coffeePrice) { d.cash -= T.coffeePrice; coffeeT = T.coffeeTime; ctx.save(); ctx.sfx('purchase'); ctx.feed('Iced coffee! You feel speedy.', 'info', '#ffd66b'); closePanel(); return; }
        if (a.indexOf('buy-') === 0) {
          const id = a.slice(4), c = CARS[id];
          if (!c || c.pass || d.cash < c.price) return;
          d.cash -= c.price; d.cars.push(id); d.car = id; ctx.save();
          ctx.badge('cl_driver'); ctx.sfx('purchase');
          const dealer = CITY.buildings.find((x) => x.id === 'dealer');
          parked.filter((p) => p.mine && !p.def.company).forEach((p) => parked.splice(parked.indexOf(p), 1));
          spawnOwnCar(id, dealer.door.x, dealer.door.y + 44);
          ctx.banner(c.name + ' purchased!', 'It is parked outside. Press E to drive it.', 2000);
          ctx.feed('You bought ' + U.withArticle(c.name) + '!', 'star', '#ffd66b');
          renderPanel();
          return;
        }
        if (a.indexOf('pick-') === 0) {
          const id = a.slice(5);
          if (!d.cars.includes(id)) return;
          d.car = id; ctx.save();
          parked.filter((p) => p.mine && !p.def.company).forEach((p) => parked.splice(parked.indexOf(p), 1));
          if (car && !car.def.company) { car = null; }
          const dealer = CITY.buildings.find((x) => x.id === 'dealer');
          spawnOwnCar(id, dealer.door.x, dealer.door.y + 44);
          ctx.sfx('click');
          renderPanel();
          return;
        }
        if (a.indexOf('outfit-') === 0) {
          const id = a.slice(7), o = OUTFITS[id];
          if (!o || d.cash < o.price) return;
          d.cash -= o.price; d.outfits.push(id); d.style = id; ctx.save();
          myLook = lookNow(); ctx.sfx('purchase'); renderPanel();
          return;
        }
        if (a.indexOf('wear-') === 0) { d.style = a.slice(5); ctx.save(); myLook = lookNow(); ctx.sfx('click'); renderPanel(); return; }
        if (a === 'unwear') { d.style = null; ctx.save(); myLook = lookNow(); renderPanel(); }
      });

      function finish(timeUp) {
        if (phase !== 'play') return;
        phase = 'over';
        closePanel();
        ctx.ui.remove('tray');
        const win = jobsDone >= T.goal;
        ctx.best('bestShift', earned, 'max');
        ctx.end({
          outcome: win ? 'win' : 'lose',
          title: win ? 'Great shift!' : timeUp ? 'Shift over' : 'Clocked out',
          subtitle: 'Jobs completed: ' + jobsDone + ' / ' + T.goal,
          coins: T.rewards.play + (win ? T.rewards.win : 0),
          xp: T.rewards.xpPlay + (win ? T.rewards.xpWin : 0),
          stats: [['Jobs', jobsDone], ['City Cash earned', '$' + U.fmt(earned)], ['City Cash', '$' + U.fmt(d.cash)], ['Car', d.car ? CARS[d.car].name : 'On foot']],
        });
      }

      // -------------------------------------------------------------- draw
      let mini = null;
      function miniMap(mw, mh) {
        if (mini) return mini;
        mini = document.createElement('canvas');
        mini.width = mw * 2; mini.height = Math.ceil(mh * 2);
        const m = mini.getContext('2d');
        const k = (mw * 2) / (MW * TS);
        for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
          const tt = CITY.map[y * MW + x];
          if (tt === GRASS || tt === WALK) continue;
          m.fillStyle = tt === ROAD ? '#5a606c' : tt === BLD ? '#9aa5b5' : tt === LOT ? '#6a707c' : '#4a9a45';
          m.fillRect(x * TS * k, y * TS * k, Math.ceil(TS * k), Math.ceil(TS * k));
        }
        for (const b of CITY.buildings) { m.fillStyle = b.color; m.beginPath(); m.arc(b.door.x * k, b.door.y * k, 5, 0, Math.PI * 2); m.fill(); }
        return mini;
      }
      function drawTiles(g) {
        const x0 = Math.max(0, Math.floor(cam.x / TS) - 1), y0 = Math.max(0, Math.floor(cam.y / TS) - 1);
        const x1 = Math.min(MW, x0 + Math.ceil(W / TS) + 3), y1 = Math.min(MH, y0 + Math.ceil(H / TS) + 3);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const t = CITY.map[y * MW + x], px = x * TS, py = y * TS;
          if (t === ROAD) {
            g.fillStyle = '#3a3f4b'; g.fillRect(px, py, TS, TS);
            const vr = V_ROADS.includes(x) || V_ROADS.includes(x - 1), hr = H_ROADS.includes(y) || H_ROADS.includes(y - 1);
            g.fillStyle = 'rgba(255,214,107,.7)';
            if (vr && !hr && V_ROADS.includes(x) && y % 2 === 0) g.fillRect(px + TS - 2, py + 8, 4, 18);
            if (hr && !vr && H_ROADS.includes(y) && x % 2 === 0) g.fillRect(px + 8, py + TS - 2, 18, 4);
          } else if (t === WALK) { g.fillStyle = (x + y) % 2 ? '#c9ced8' : '#c2c7d1'; g.fillRect(px, py, TS, TS); }
          else if (t === LOT) { g.fillStyle = '#5a606c'; g.fillRect(px, py, TS, TS); g.fillStyle = 'rgba(255,255,255,.5)'; if (y % 3 === 0) g.fillRect(px, py, TS, 2); }
          else if (t === PARK || t === TREE || t === WATER) { g.fillStyle = (x + y) % 2 ? '#5fb85a' : '#58b052'; g.fillRect(px, py, TS, TS); }
          else if (t === BLD) { g.fillStyle = '#6a707c'; g.fillRect(px, py, TS, TS); }
          else { g.fillStyle = (x + y) % 2 ? '#79c76a' : '#72bf63'; g.fillRect(px, py, TS, TS); }
        }
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const t = CITY.map[y * MW + x], px = x * TS + TS / 2, py = y * TS + TS / 2;
          if (t === TREE) { G.shadow(g, px + 4, py + 8, 17, 7, 0.25); G.circle(g, px, py - 2, 17, '#2f8f47'); G.circle(g, px - 5, py - 7, 8, '#4ab35a'); }
        }
      }
      function drawBuilding(g, b) {
        const x = b.x0 * TS, y = b.y0 * TS, w = (b.x1 - b.x0 + 1) * TS, h = (b.y1 - b.y0 + 1) * TS;
        if (!cam.visible(x + w / 2, y + h / 2, Math.max(w, h))) return;
        if (b.id === 'house') {
          G.fillRR(g, x + 2, y + 2, w - 4, h - 4, 4, b.roof);
          g.fillStyle = U.shade(b.roof, 0.18); g.fillRect(x + 2, y + h / 2 - 2, w - 4, 4);
          G.fillRR(g, b.door.x - 10, b.top ? y + 2 : y + h - 10, 20, 8, 2, b.color);
          G.text(g, b.address, b.cx, b.top ? y + 20 : y + h - 14, { size: 10, align: 'center', color: '#fff', stroke: 'rgba(0,0,0,.55)', strokeW: 3 });
        } else {
          G.fillRR(g, x + 3, y + 3, w - 6, h - 6, 6, U.shade(b.color, -0.35));
          G.fillRR(g, x + 8, y + 8, w - 16, h - 22, 5, U.shade(b.color, -0.15));
          g.fillStyle = 'rgba(255,255,255,.18)';
          for (let wx = x + 16; wx < x + w - 24; wx += 30) for (let wy = y + 16; wy < y + h - 36; wy += 30) g.fillRect(wx, wy, 14, 10);
          G.fillRR(g, x + w / 2 - 70, y + h - 30, 140, 22, 6, b.color);
          G.text(g, b.name, x + w / 2, y + h - 14, { size: 12, align: 'center', color: b.id === 'taxi' ? '#1b1b22' : '#fff', weight: 800 });
          G.fillRR(g, b.door.x - 14, y + h - 6, 28, 8, 2, '#1b1b22');
        }
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        const CW = MW * TS, CH = MH * TS;
        V.preset('day', { fogNear: 1100, fogFar: 3200 });
        V.shadowSize(640);
        // ground: the tile map painted once into a texture
        const PX = 16;
        const tex = BF.g3d.canvasTex('city-ground', MW * PX, MH * PX, (g2) => {
          for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
            const tt = CITY.map[y * MW + x], px = x * PX, py = y * PX;
            g2.fillStyle = tt === ROAD ? '#3a3f4b' : tt === WALK ? '#c9ced8' : tt === LOT ? '#5a606c' : tt === BLD ? '#8a909c' : tt === PARK || tt === TREE || tt === WATER ? ((x + y) % 2 ? '#5fb85a' : '#58b052') : ((x + y) % 2 ? '#79c76a' : '#72bf63');
            g2.fillRect(px, py, PX, PX);
            if (tt === ROAD) {
              const vr = V_ROADS.includes(x) || V_ROADS.includes(x - 1), hr = H_ROADS.includes(y) || H_ROADS.includes(y - 1);
              g2.fillStyle = 'rgba(255,214,107,.85)';
              if (vr && !hr && V_ROADS.includes(x) && y % 2 === 0) g2.fillRect(px + PX - 1, py + 3, 2, 8);
              if (hr && !vr && H_ROADS.includes(y) && x % 2 === 0) g2.fillRect(px + 3, py + PX - 1, 8, 2);
              if (vr && hr) { g2.fillStyle = 'rgba(255,255,255,.35)'; for (let k = 0; k < 4; k++) g2.fillRect(px + 1 + k * 4, py + 1, 2, PX - 2); }
            }
            if (tt === LOT && y % 3 === 0) { g2.fillStyle = 'rgba(255,255,255,.6)'; g2.fillRect(px, py, PX, 1); }
          }
        });
        V.ground(0, 0, CW, CH, '#ffffff', { map: tex });
        V.ground(-2600, -2600, CW + 2600, CH + 2600, '#5a9a4a', { y: -1, map: BF.g3d.gridTex('#5fa34f', 'rgba(0,0,0,0)', 1, { repeat: [40, 40], noise: true }) });
        // curbs, trees, lamps
        const curbs = [], trunks = [], crowns = [], poles = [], lamps = [];
        const r = U.rng('city3d');
        for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
          const tt = CITY.map[y * MW + x];
          const cx = x * TS + TS / 2, cz = y * TS + TS / 2;
          if (tt === WALK) curbs.push({ x: cx, z: cz, w: TS, h: 3, d: TS, color: (x + y) % 2 ? '#d3d8e1' : '#c9ced8' });
          if (tt === TREE) { trunks.push({ x: cx, z: cz, w: 8, h: 26, d: 8, color: '#7a4a2a' }); crowns.push({ x: cx, y: 18, z: cz, w: 40 + r() * 8, h: 42 + r() * 12, d: 40, color: r() < 0.5 ? '#2f8f47' : '#3fa052' }); }
        }
        for (const b of CITY.blocks) {
          for (let x = b.c0; x <= b.c1; x += 4) for (const yy of [b.r0, b.r1]) { poles.push({ x: x * TS + 6, z: yy * TS + (yy === b.r0 ? 6 : TS - 6), w: 3, h: 58, d: 3, color: '#39414f' }); lamps.push({ x: x * TS + 6, y: 56, z: yy * TS + (yy === b.r0 ? 6 : TS - 6), w: 8, h: 5, d: 8, color: '#fff3c4' }); }
        }
        V.boxes(curbs, { shadow: false });
        V.boxes(trunks, { geo: 'cylLo' });
        V.boxes(crowns, { geo: 'sphereLo' });
        V.boxes(poles, { geo: 'cylLo' });
        V.boxes(lamps, { glow: true, shadow: false });
        // buildings
        const HEIGHT = { pizza: 96, cafe: 84, taxi: 110, boutique: 124, dealer: 76, kiosk: 40 };
        const bodies = [], windows = [], roofs = [], trims = [];
        for (const b of CITY.buildings) {
          const x = b.x0 * TS, z = b.y0 * TS, w = (b.x1 - b.x0 + 1) * TS, d = (b.y1 - b.y0 + 1) * TS, h = HEIGHT[b.id] || 80;
          bodies.push({ x: x + w / 2, z: z + d / 2, w: w - 6, h, d: d - 6, color: U.shade(b.color, -0.2) });
          trims.push({ x: x + w / 2, y: h, z: z + d / 2, w: w - 2, h: 5, d: d - 2, color: U.shade(b.color, -0.45) });
          for (let wx = x + 22; wx < x + w - 22; wx += 26) for (let wy = 30; wy < h - 12; wy += 24) windows.push({ x: wx, y: wy, z: z + d - 2.5, w: 14, h: 12, d: 2, color: '#bfe6ff' });
          trims.push({ x: x + w / 2, y: 0, z: z + d - 1, w: Math.min(w - 20, 150), h: 22, d: 6, color: b.color });
          trims.push({ x: b.door.x, y: 0, z: z + d - 2, w: 20, h: 28, d: 4, color: '#1b1b22' });
          for (let k = 0; k < 2; k++) roofs.push({ x: x + 24 + k * 34 + r() * 10, y: h, z: z + 24 + r() * (d - 48), w: 18, h: 12, d: 14, color: '#9aa5b5' });
          V.sign(b.name, b.door.x, h + 26, z + d, { h: 22, color: b.id === 'taxi' ? '#1b1b22' : '#ffffff', bg: b.id === 'taxi' ? '#ffc940' : U.shade(b.color, -0.1), px: 56 });
        }
        const houseRoofs = [];
        for (const hh of CITY.houses) {
          const x = hh.x0 * TS, z = hh.y0 * TS, w = (hh.x1 - hh.x0 + 1) * TS, d = (hh.y1 - hh.y0 + 1) * TS;
          bodies.push({ x: x + w / 2, z: z + d / 2, w: w - 12, h: 38, d: d - 12, color: hh.color });
          houseRoofs.push({ x: x + w / 2, y: 38, z: z + d / 2, w: (w - 4) * 0.75, h: 32, d: (d - 4) * 1.35, color: hh.roof, rot: Math.PI / 4 });
          const fz = hh.top ? z + 6 : z + d - 6;
          trims.push({ x: hh.door.x, y: 0, z: fz, w: 12, h: 22, d: 2, color: U.shade(hh.roof, 0.1) });
          for (const sd of [-1, 1]) windows.push({ x: hh.door.x + sd * 36, y: 14, z: fz, w: 14, h: 12, d: 2, color: '#dff4ff' });
        }
        V.boxes(bodies);
        V.boxes(trims);
        V.boxes(windows, { shadow: false, rough: 0.2 });
        V.boxes(roofs);
        const hr = V.boxes(houseRoofs, { geo: 'cone4' });
        if (hr) hr.castShadow = true;
        // fountain
        if (CITY.fountain) {
          const f = CITY.fountain;
          V.shape('cyl', f.x, 6, f.y, 76, 12, 76, '#9aa5b5');
          V.shape('cyl', f.x, 12.5, f.y, 64, 1, 64, '#46a8ff', { rough: 0.1, metal: 0.2 });
          V.shape('cyl', f.x, 22, f.y, 10, 30, 10, '#d7dde6');
          V.shape('cyl', f.x, 36, f.y, 26, 4, 26, '#d7dde6');
        }
        // dealership price tags
        for (const lc of CITY.lotCars) {
          const m = BF.props3d.car({ color: CARS[lc.id].color, long: CARS[lc.id].long });
          m.position.set(lc.x, 0, lc.y);
          V.scene.add(m);
        }

        const carPool = V.pool(), litterPool = V.pool();
        const marker = V.group();
        const markRing = V.shape('ring', 0, 1.5, 0, 90, 90, 1, '#4ad17f', { parent: marker, basic: true, opacity: 0.9, side: 2, shadow: false });
        markRing.rotation.x = -Math.PI / 2;
        const beam = V.shape('cylLo', 0, 60, 0, 70, 120, 70, '#4ad17f', { parent: marker, basic: true, opacity: 0.18, depthWrite: false, shadow: false });
        let sprayT = 0;
        const nearMe = (x, y, r2) => Math.abs(x - me.x) < r2 && Math.abs(y - me.y) < r2 * 0.8;

        function placeCar(key, def, x, y, a) {
          const m = carPool.use(key + ':' + def.color, () => { const c = BF.props3d.car(def); V.scene.add(c); return c; });
          m.position.set(x, 0, y);
          m.rotation.y = -a;
          return m;
        }

        return function sync(dt) {
          const t = ctx.time;
          V.look(me.x, 0, me.y, { dist: car ? 600 : 450, pitch: 0.84, fov: 45, lerp: 0.12 }, dt);
          // fountain spray
          sprayT -= dt;
          if (CITY.fountain && sprayT <= 0 && nearMe(CITY.fountain.x, CITY.fountain.y, 700)) { sprayT = 0.12; V.fx.emit(CITY.fountain.x, 40, CITY.fountain.y, { count: 3, color: '#dff4ff', speed: 60, life: 0.7, size: 4, gravity: 260, up: 1 }); }
          for (const c of traffic) { const p = carPos(c); placeCar('t' + traffic.indexOf(c), { color: c.taxi ? '#ffc940' : c.color, taxi: c.taxi }, p.x, p.y, p.a); }
          for (const p of parked) {
            placeCar('p' + p.id, { color: p.def.color, long: p.def.long, taxi: p.def.company }, p.x, p.y, p.a);
            if (!car && U.dist(p.x, p.y, me.x, me.y) < 60) V.label(p.x, 34, p.y, { name: '[E] Drive ' + p.def.name, color: '#ffd66b' });
          }
          for (const lc of CITY.lotCars) if (nearMe(lc.x, lc.y, 500)) V.label(lc.x, 34, lc.y, { name: CARS[lc.id].name + ' · $' + U.fmt(CARS[lc.id].price), color: '#ffffff' });
          if (car) {
            placeCar('me', { color: car.def.color, long: car.def.long, taxi: car.def.company }, car.x, car.y, car.a);
          }
          peds.forEach((p, i) => {
            const q = ringPoint(p.block, p.t);
            if (!nearMe(q.x, q.y, 650)) return;
            const rig = V.actor('ped' + i, p.look, { scale: 7.5 });
            rig.setPos(q.x, 3, q.y);
            rig.faceAngle(q.a + (p.v < 0 ? Math.PI : 0));
            rig.set({ move: Math.abs(p.v) / 90 });
          });
          for (const bt of bots) {
            if (bt.drive) { placeCar('b' + bt.bot.id, { color: bt.color }, bt.x, bt.y, bt.a); if (nearMe(bt.x, bt.y, 700)) V.label(bt.x, 40, bt.y, { name: bt.bot.displayName, color: '#ffffff', bubble: ctx.bubbleText(bt.bot.id) }); continue; }
            if (!nearMe(bt.x, bt.y, 700)) continue;
            const rig = V.actor(bt.bot.id, bt.bot.avatar, { scale: 8 });
            rig.setPos(bt.x, 3, bt.y);
            rig.faceAngle(bt.a);
            rig.set({ move: bt.free ? (bt.moving ? 1.2 : 0) : Math.abs(bt.v) / 90 });
            V.label(bt.x, 58, bt.y, { name: bt.bot.displayName, color: '#ffffff', bubble: ctx.bubbleText(bt.bot.id) });
          }
          carPool.sweep();
          // job marker, passenger and litter
          marker.visible = !!(job && job.target);
          if (job && job.target) {
            const col = job.kind === 'taxi' ? '#ffc940' : '#4ad17f';
            marker.position.set(job.target.x, 0, job.target.y);
            markRing.material = V.mat(col, { basic: true, opacity: 0.9, side: 2 });
            beam.material = V.mat(col, { basic: true, opacity: 0.16 + Math.sin(t * 4) * 0.05, depthWrite: false });
            markRing.scale.set(80 + Math.sin(t * 4) * 6, 80 + Math.sin(t * 4) * 6, 1);
            if (job.kind === 'taxi' && job.stage === 'pickup') {
              const rig = V.actor('passenger', job.passenger.look, { scale: 7.5 });
              rig.setPos(job.target.x, 3, job.target.y);
              rig.faceAngle(Math.PI / 2);
              if (Math.random() < 0.01) rig.emote('wave', 1.2);
              V.label(job.target.x, 58, job.target.y, { name: 'Waiting for a taxi', color: '#ffc940' });
            } else V.label(job.target.x, 110, job.target.y, { name: job.target.label, color: col });
          }
          if (job && job.kind === 'cleanup') {
            for (const l of job.litter) {
              const m = litterPool.use(l, () => (l.kind === 0 ? V.box(0, 0, 0, 7, 12, 7, '#e03e5a', {}) : l.kind === 1 ? V.shape('sphere', 0, 5, 0, 10, 10, 10, '#f8fafc', {}) : V.box(0, 0, 0, 14, 6, 10, '#c8a46a', {})));
              m.position.set(l.x, 0, l.y);
              m.rotation.y = l.x;
            }
          }
          litterPool.sweep();
          // me
          if (!car) {
            const rig = V.actor('me:' + (d.style || ''), d.style && d.outfits.includes(d.style) ? myLook : ctx.player.avatar, { scale: 8 });
            rig.setPos(me.x, 3, me.y);
            rig.faceAngle(me.a);
            const mv = me._px != null && dt > 0 ? Math.hypot(me.x - me._px, me.y - me._py) / dt : 0;
            rig.set({ move: mv / T.walk });
            const door = nearestDoor(56);
            if (door && door.id !== 'house') V.label(door.door.x, 70, door.door.y, { name: '[E] ' + door.name, color: '#ffd66b' });
          }
          me._px = me.x; me._py = me.y;
          V.label(me.x, car ? 44 : 60, me.y, { name: ctx.player.name, color: '#ffb454', bubble: ctx.bubbleText('me') });
          V.sweep();
        };
      })();

      return {
        update(dt) {
          parts.update(dt);
          floats.update(dt);
          const t = ctx.time;
          // traffic
          for (const c of traffic) {
            if (c.stop > 0) { c.stop -= dt; continue; }
            const p = carPos(c);
            const ahead = { x: p.x + Math.cos(p.a) * 44, y: p.y + Math.sin(p.a) * 44 };
            const blockedByMe = !car && U.dist(ahead.x, ahead.y, me.x, me.y) < 34;
            const blockedByCar = parked.some((q) => U.dist(ahead.x, ahead.y, q.x, q.y) < 30) || (car && U.dist(ahead.x, ahead.y, car.x, car.y) < 30);
            if (blockedByMe || blockedByCar) { if (blockedByMe && Math.random() < 0.01) floats.add(p.x, p.y - 24, 'Beep!', '#ffd66b', 11); continue; }
            const len = c.lane.axis === 'x' ? MW * TS : MH * TS;
            c.along = (c.along + c.lane.dir * c.v * dt + len) % len;
          }
          for (const p of peds) { p.t += p.v * dt; p.walk += dt * 8; }
          for (const bt of bots) {
            // a bot given an order in chat leaves its route (parking if it was driving) and walks freely
            const og = BF.orders.goal(ctx, bt.bot.id, bt, me, { near: 40 });
            if (og || bt.free) {
              bt.free = true; bt.drive = false;
              if (og && !og.hold) {
                const dx = og.x - bt.x, dy = og.y - bt.y, l = Math.hypot(dx, dy) || 1, sp = T.walk * 1.15 * dt;
                const nx = bt.x + (dx / l) * sp, ny = bt.y + (dy / l) * sp;
                if (!blockedAt(nx, bt.y, T.radius)) bt.x = nx;
                if (!blockedAt(bt.x, ny, T.radius)) bt.y = ny;
                bt.a = Math.atan2(dy, dx); bt.walk += dt * 9; bt.moving = true;
              } else bt.moving = false;
              continue;
            }
            if (bt.drive) { if (bt.stop > 0) bt.stop -= dt; else { const len = bt.lane.axis === 'x' ? MW * TS : MH * TS; bt.along = (bt.along + bt.lane.dir * bt.v * dt + len) % len; } const pp = carPos(bt); bt.x = pp.x; bt.y = pp.y; bt.a = pp.a; }
            else { bt.t += bt.v * dt; bt.walk += dt * 9; const pp = ringPoint(bt.block, bt.t); bt.x = pp.x; bt.y = pp.y; bt.a = pp.a + (bt.v < 0 ? Math.PI : 0); }
            bt.jobT -= dt;
            if (bt.jobT <= 0) {
              bt.jobT = 25 + Math.random() * 40;
              const r = Math.random();
              if (r < 0.45) ctx.feed(bt.bot.displayName + ' delivered a pizza to ' + U.pick(CITY.houses).address + '.', 'info', '#8fd3ff');
              else if (r < 0.75) ctx.feed(bt.bot.displayName + ' finished a taxi fare.', 'info', '#ffc940');
              else if (r < 0.88) ctx.feed(bt.bot.displayName + ' bought a ' + U.pick(['Hatchback', 'Pickup', 'City Cruiser']) + '!', 'star', '#ffd66b');
              else ctx.botSay(bt.bot, 'any', 200);
            }
          }
          if (phase !== 'play') return;
          shift -= dt;
          if (coffeeT > 0) coffeeT -= dt;
          if (shift <= 0) { finish(true); return; }
          if (shift < 30 && Math.floor(shift) !== Math.floor(shift + dt) && Math.floor(shift) % 10 === 0) ctx.banner(Math.floor(shift) + ' seconds until quitting time', goalHit ? '' : (T.goal - jobsDone) + ' more job' + (T.goal - jobsDone === 1 ? '' : 's') + ' needed', 1200);
          const inp = ctx.input;
          if (car) driveCar(dt);
          else {
            const ax = inp.axis();
            const sp = T.walk * (coffeeT > 0 ? T.coffee : 1);
            if (Math.hypot(ax.x, ax.y) > 0.1) {
              const nx = me.x + ax.x * sp * dt, ny = me.y + ax.y * sp * dt;
              if (!blockedAt(nx, me.y, T.radius)) me.x = nx;
              if (!blockedAt(me.x, ny, T.radius)) me.y = ny;
              me.a = Math.atan2(ax.y, ax.x); me.walk += dt * 12;
              if (panel) closePanel();
            }
          }
          if (inp.actPressed('exit') && car) { exitCar(); tray(); }
          if (inp.actPressed('use')) {
            if (car) { exitCar(); tray(); }
            else {
              const c = parked.find((q) => U.dist(q.x, q.y, me.x, me.y) < 50);
              const door = nearestDoor(56);
              if (door && door.id !== 'house') openBuilding(door);
              else if (c) { enterCar(c); tray(); }
              else floats.add(me.x, me.y - 28, 'Nothing here. Find a door or your car.', '#cfd6e2', 11);
            }
          }
          if (inp.pointer.pressed && panel) closePanel();
          else if (inp.pointer.pressed && !car) {
            const w = V ? ctx.pointerWorld(0) : cam.toWorld(inp.pointer.x, inp.pointer.y);
            const b = CITY.buildings.find((q) => q.id !== 'house' && w.x > q.x0 * TS && w.x < (q.x1 + 1) * TS && w.y > q.y0 * TS && w.y < (q.y1 + 1) * TS);
            if (b) { if (U.dist(b.door.x, b.door.y, me.x, me.y) < 140) openBuilding(b); else floats.add(w.x, w.y, 'Walk to the door first', '#cfd6e2', 12); }
            const c = parked.find((q) => U.dist(q.x, q.y, w.x, w.y) < 26);
            if (c && U.dist(c.x, c.y, me.x, me.y) < 70) { enterCar(c); tray(); }
          }
          const hadJob = !!job;
          updateJob(dt);
          if (hadJob !== !!job) tray();
          cam.follow(me.x, me.y, dt, car ? 0.2 : 0.15);
        },

        draw(g) {
          const t = ctx.time;
          g.save();
          cam.apply(g);
          drawTiles(g);
          if (CITY.fountain && cam.visible(CITY.fountain.x, CITY.fountain.y)) {
            const f = CITY.fountain;
            G.circle(g, f.x, f.y, 36, '#9aa5b5'); G.circle(g, f.x, f.y, 30, '#46a8ff');
            for (let i = 0; i < 6; i++) G.circle(g, f.x + Math.cos(t * 2 + i) * 12, f.y + Math.sin(t * 2 + i) * 12 - 4, 3, '#dff4ff');
            G.circle(g, f.x, f.y, 6, '#d7dde6');
          }
          for (const b of CITY.buildings) drawBuilding(g, b);
          for (const h of CITY.houses) drawBuilding(g, h);
          for (const lc of CITY.lotCars) if (cam.visible(lc.x, lc.y)) { drawCar(g, lc.x, lc.y, 0, CARS[lc.id].color, { long: CARS[lc.id].long }); G.text(g, '$' + U.fmt(CARS[lc.id].price), lc.x, lc.y + 26, { size: 10, align: 'center', color: '#fff', stroke: 'rgba(0,0,0,.6)', strokeW: 3 }); }
          if (job && job.kind === 'cleanup') for (const l of job.litter) { if (!cam.visible(l.x, l.y)) continue; if (l.kind === 0) G.fillRR(g, l.x - 5, l.y - 7, 10, 14, 2, '#e03e5a'); else if (l.kind === 1) G.circle(g, l.x, l.y, 6, '#f8fafc'); else G.fillRR(g, l.x - 7, l.y - 4, 14, 8, 2, '#c8a46a'); G.ring(g, l.x, l.y, 12 + Math.sin(t * 5) * 2, 'rgba(255,255,255,.7)', 1.5); }
          if (job && job.target) {
            const tg = job.target;
            g.globalAlpha = 0.25 + Math.sin(t * 4) * 0.1; G.circle(g, tg.x, tg.y, 40, job.kind === 'taxi' ? '#ffc940' : '#4ad17f'); g.globalAlpha = 1;
            G.ring(g, tg.x, tg.y, 40, job.kind === 'taxi' ? '#ffc940' : '#4ad17f', 3);
            if (job.kind === 'taxi' && job.stage === 'pickup') { G.avatarTop(g, tg.x, tg.y, T.radius, job.passenger.look, Math.PI / 2); G.text(g, 'Waiting for a taxi', tg.x, tg.y - 22, { size: 11, align: 'center', color: '#fff', stroke: 'rgba(0,0,0,.6)', strokeW: 3 }); }
            else G.text(g, tg.label, tg.x, tg.y - 48 + Math.sin(t * 4) * 3, { size: 13, align: 'center', color: '#fff', weight: 800, stroke: 'rgba(0,0,0,.6)', strokeW: 4 });
          }
          for (const c of traffic) { const p = carPos(c); if (cam.visible(p.x, p.y)) drawCar(g, p.x, p.y, p.a, c.taxi ? '#ffc940' : c.color, { taxi: c.taxi }); }
          for (const p of parked) { if (!cam.visible(p.x, p.y)) continue; drawCar(g, p.x, p.y, p.a, p.def.color, { long: p.def.long, taxi: p.def.company }); if (U.dist(p.x, p.y, me.x, me.y) < 60 && !car) G.text(g, 'E  Drive', p.x, p.y - 22, { size: 12, align: 'center', color: '#0b0e13', weight: 900, stroke: '#ffd66b', strokeW: 8 }); }
          for (const p of peds) { const q = ringPoint(p.block, p.t); if (cam.visible(q.x, q.y)) G.avatarTop(g, q.x, q.y, 10, p.look, q.a + (p.v < 0 ? Math.PI : 0), { walk: p.walk }); }
          for (const bt of bots) {
            if (!cam.visible(bt.x, bt.y)) continue;
            if (bt.drive) drawCar(g, bt.x, bt.y, bt.a, bt.color);
            else G.avatarTop(g, bt.x, bt.y, T.radius, bt.bot.look, bt.a, { walk: bt.walk });
            G.nameTag(g, bt.x, bt.y - (bt.drive ? 20 : 16), bt.bot.displayName, '#fff');
            const bb = ctx.bubbleText(bt.bot.id);
            if (bb) G.bubble(g, bt.x, bt.y - 36, bb);
          }
          if (car) {
            drawCar(g, car.x, car.y, car.a, car.def.color, { long: car.def.long, taxi: car.def.company });
            if (job && job.kind === 'taxi' && job.stage === 'drop') G.circle(g, car.x - Math.cos(car.a) * 4, car.y - Math.sin(car.a) * 4, 4, job.passenger.look.shirt);
          } else G.avatarTop(g, me.x, me.y, T.radius, myLook, me.a, { walk: me.walk });
          G.nameTag(g, me.x, me.y - (car ? 20 : 16), ctx.player.name, '#ffb454');
          const mb = ctx.bubbleText('me');
          if (mb) G.bubble(g, me.x, me.y - 36, mb);
          if (!car) { const door = nearestDoor(56); if (door && door.id !== 'house') G.text(g, 'E  ' + door.name, door.door.x, door.door.y - 24, { size: 12, align: 'center', color: '#0b0e13', weight: 900, stroke: '#ffd66b', strokeW: 8 }); }
          parts.draw(g);
          floats.draw(g);
          g.restore();
          drawHud(g);
        },

        render3d(dt) { view(dt); },
        hud(g) { drawHud(g); },

        onBotJoin(b) { addBot(b); },
        onBotLeave(b) { const i = bots.findIndex((x) => x.bot.id === b.id); if (i >= 0) bots.splice(i, 1); },
        destroy() { ctx.save(); },
      };

      function drawHud(g) {
          const t = ctx.time;
          // job arrow
          if (job && job.target) {
            let sx = job.target.x - cam.x, sy = job.target.y - cam.y;
            if (V) { const p = V.toScreen(job.target.x, 0, job.target.y); sx = p.x; sy = p.y; if (p.z > 1) { sx = W - sx; sy = H * 2; } }
            if (sx < 20 || sy < 20 || sx > W - 20 || sy > H - 20) {
              const a = Math.atan2(sy - H / 2, sx - W / 2);
              const ex = W / 2 + Math.cos(a) * (W / 2 - 40), ey = H / 2 + Math.sin(a) * (H / 2 - 40);
              g.save(); g.translate(ex, ey); g.rotate(a);
              g.fillStyle = job.kind === 'taxi' ? '#ffc940' : '#4ad17f';
              g.beginPath(); g.moveTo(18, 0); g.lineTo(-10, -12); g.lineTo(-4, 0); g.lineTo(-10, 12); g.closePath(); g.fill();
              g.restore();
            }
          }
          // HUD
          G.panel(g, 10, 10, 250, job ? 104 : 70);
          G.text(g, '$' + U.fmt(d.cash), 22, 38, { size: 22, weight: 800, color: '#4ad17f' });
          G.text(g, 'City Cash', 248, 30, { size: 11, align: 'right', color: '#a1abbb' });
          G.text(g, 'Jobs ' + jobsDone + ' / ' + T.goal, 22, 62, { size: 13, color: jobsDone >= T.goal ? '#3fd08a' : '#fff' });
          G.text(g, 'Shift ' + U.fmtClock(Math.max(0, shift)), 248, 62, { size: 13, align: 'right', color: shift < 30 ? '#ff8b98' : '#8fd3ff' });
          if (job) {
            const left = Math.max(0, job.limit - job.t);
            G.text(g, job.kind === 'cleanup' ? 'Litter ' + job.got + ' / ' + T.cleanup.count : job.text, 22, 86, { size: 12, color: '#ffd66b' });
            G.bar(g, 22, 94, 160, 6, left / job.limit, left < 10 ? '#ff5a6a' : '#ffd66b');
            G.text(g, U.fmtClock(left), 248, 100, { size: 12, align: 'right', color: '#fff' });
          }
          if (coffeeT > 0) G.text(g, 'Coffee rush ' + Math.ceil(coffeeT) + 's', 22, (job ? 104 : 70) + 24, { size: 11, color: '#ffd66b', stroke: 'rgba(0,0,0,.6)', strokeW: 3 });
          // minimap
          const mw = 180, mh = (MH / MW) * mw, mx = W - mw - 10, my = 10;
          G.panel(g, mx - 4, my - 4, mw + 8, mh + 8, 0.8);
          const k = mw / (MW * TS);
          g.drawImage(miniMap(mw, mh), mx, my, mw, mh);
          if (job && job.target) G.circle(g, mx + job.target.x * k, my + job.target.y * k, 4 + Math.sin(t * 6), job.kind === 'taxi' ? '#ffc940' : '#4ad17f');
          G.circle(g, mx + me.x * k, my + me.y * k, 3.5, '#ffffff');
      }
    },
  });
})((window.BF = window.BF || {}));
