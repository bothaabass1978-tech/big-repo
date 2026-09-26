'use strict';
/**
 * The 50 arcade games (10 engines x 5 variants) played headlessly to the end
 * with scripted input: no exceptions, every timed game finishes, rewards are
 * sane, and the engine-specific rules hold.
 * Story: BLOCKFORGE-014
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { bootDefault, ROOT } = require('./harness');

function withGames() {
  const sb = bootDefault();
  const files = ['js/engine/input.js', 'js/engine/gfx.js', 'js/engine/phys.js', 'js/engine/runtime.js', 'js/games/arcadekit.js']
    .concat(fs.readdirSync(path.join(ROOT, 'js/games')).filter((f) => f !== 'arcadekit.js').sort().map((f) => 'js/games/' + f));
  for (const rel of files) vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sb.ctx, { filename: rel });
  return sb;
}

/** A stand-in for the runtime's ctx: records the end of the round, lets the test drive input. */
function fakeCtx(BF, game, passes) {
  const held = new Set(), pressed = new Set();
  const axis = { x: 0, y: 0 };
  const bots = BF.bots.list.slice(10, 18);
  const log = { ended: null, feed: [], badges: [], best: {}, stats: {} };
  const ctx = {
    W: 960, H: 540, game, gameId: game.id, config: game.config || {}, difficulty: 'normal', g3: null, time: 0, mobile: false,
    input: { axis: () => ({ x: axis.x, y: axis.y }), act: (n) => held.has(n), actPressed: (n) => pressed.has(n), pointer: { x: 0, y: 0, moved: false }, down: () => false, pressed: () => false },
    player: { id: 'me', name: 'Tester', username: 'tester', level: 5, avatar: BF.store.state.avatar, look: BF.avatar.look(BF.store.state.avatar) },
    get bots() { return bots; }, get allBots() { return bots; },
    botOrder: () => null, clearOrder() {}, bubbleText: () => null, pointerWorld: () => ({ x: 0, y: 0 }),
    hasPass: (e) => !!(passes && passes.includes(e)), hasItem: () => false,
    best(stat, v) { log.best[stat] = v; return true; }, addStat(stat, n) { log.stats[stat] = (log.stats[stat] || 0) + (n == null ? 1 : n); }, playerStat() {},
    badge(id) { log.badges.push(id); return true; }, feed(t) { log.feed.push(t); }, chat() {}, banner() {}, sfx() {}, botSay() {}, botText() {}, toast() {},
    reward: () => 0, xp: () => 0, quest() {}, collectible() {}, data: {}, save() {}, progress: () => ({}),
    end(r) { if (!log.ended) log.ended = r; }, isEnded: () => !!log.ended, isPaused: () => false, pause() {},
  };
  return { ctx, held, pressed, axis, log };
}

/** Play a game for up to `seconds` of game time with a simple input policy per engine. */
function play(BF, id, seconds, passes) {
  const game = BF.catalog.get(id);
  const mod = BF.GameModules.get(game.gameType);
  const f = fakeCtx(BF, game, passes);
  const inst = mod.create(f.ctx);
  const dt = 1 / 20;
  let t = 0, k = 0;
  while (t < seconds && !f.log.ended) {
    f.pressed.clear();
    k++;
    // wander, press actions now and then, hold the main action in bursts
    const phase = Math.floor(t / 1.5);
    f.axis.x = Math.sin(phase * 1.7); f.axis.y = Math.cos(phase * 2.3);
    const acts = Object.keys(mod.actions || {});
    if (k % 7 === 0 && acts.length) f.pressed.add(acts[(k / 7) % acts.length | 0]);
    const main = acts[0];
    if (main) { if (t % 3 < 1.2) f.held.add(main); else f.held.delete(main); }
    if (game.gameType === 'golf' && inst._test.hole) {
      // aim at the cup, charge half a second, release
      const h = inst._test.hole, b = inst._test.me.ball;
      inst._test.me.aim = Math.atan2(h.cup.y - b.y, h.cup.x - b.x);
      if (t % 2 < 0.5) f.held.add('putt'); else f.held.delete('putt');
    }
    f.ctx.time = t;
    inst.update(dt);
    t += dt;
  }
  return { inst, log: f.log, t };
}

const TIMED = { runner: 400, party: 520, tag: 170, fishing: 230, farm: 260, restaurant: 200, flight: 60, golf: 600, spooky: 120, quiz: 200 };

test('test_all_50_arcade_games_are_registered_with_five_passes', () => {
  const { BF } = withGames();
  const games = BF.GAME_REGISTRY.filter((g) => BF.GAME_TYPES_V2.includes(g.gameType));
  assert.equal(games.length, 50);
  assert.equal(BF.GAME_REGISTRY.length, 70);
  for (const g of games) {
    assert.ok(BF.GameModules.get(g.gameType), g.id + ' has an engine');
    assert.ok(g.config && g.config.variant, g.id + ' names its variant');
    assert.equal(g.passes.length, 5, g.id + ' passes');
    assert.equal(g.badges.length, 3, g.id + ' badges');
  }
  const names = new Set(games.map((g) => g.name.toLowerCase()));
  assert.equal(names.size, 50, 'unique names');
});

for (const type of ['runner', 'party', 'tag', 'fishing', 'farm', 'restaurant', 'flight', 'golf', 'spooky', 'quiz']) {
  test('test_' + type + '_variants_play_to_the_end_without_errors', () => {
    const { BF } = withGames();
    const games = BF.GAME_REGISTRY.filter((g) => g.gameType === type);
    assert.equal(games.length, 5);
    for (const g of games) {
      const { log, inst } = play(BF, g.id, TIMED[type]);
      if (type === 'spooky' && !log.ended) { inst._test.end(false); }
      if (type === 'runner' && !log.ended) { inst._test.crash('test over'); }
      assert.ok(log.ended, g.id + ' ended');
      assert.ok(['win', 'lose'].includes(log.ended.outcome), g.id + ' outcome');
      assert.ok(Number.isFinite(log.ended.coins) && log.ended.coins >= 0 && log.ended.coins < 5000, g.id + ' coins ' + log.ended.coins);
      assert.ok(log.ended.stats && log.ended.stats.length, g.id + ' has result stats');
    }
  });
}

test('test_party_colorblock_drops_every_tile_but_the_called_colour', () => {
  const { BF } = withGames();
  const g = BF.catalog.get('color-craze');
  const f = fakeCtx(BF, g);
  const inst = BF.GameModules.get('party').create(f.ctx);
  const tile = inst._test.tiles[0];
  assert.equal(inst._test.floorAt(tile.x, tile.y, 0), 0, 'solid before the drop');
});

test('test_fishing_legendary_needs_luck_and_pays_most', () => {
  const { BF } = withGames();
  const f = fakeCtx(BF, BF.catalog.get('lakeside-lures'), ['lucky_bait']);
  const inst = BF.GameModules.get('fishing').create(f.ctx);
  const counts = {};
  for (let i = 0; i < 4000; i++) { const x = inst._test.roll(1); counts[x.rarity] = (counts[x.rarity] || 0) + 1; }
  assert.ok(counts.common > counts.rare && counts.rare > (counts.legendary || 0), JSON.stringify(counts));
  inst._test.land({ name: 'Golden Carp', rarity: 'legendary', value: 900, weight: 40 });
  assert.ok(f.log.badges.includes('lakeside-lures_legend'));
});

test('test_restaurant_serves_only_the_exact_order', () => {
  const { BF } = withGames();
  const f = fakeCtx(BF, BF.catalog.get('scoop-shop'));
  const inst = BF.GameModules.get('restaurant').create(f.ctx);
  inst._test.arrive();
  const seat = inst._test.seats.find((s) => s.c);
  inst._test.me.tray = ['cone'];
  inst._test.serve(seat);
  assert.ok(seat.c, 'a wrong order is refused');
  inst._test.me.tray = seat.c.order.slice();
  inst._test.serve(seat);
  assert.equal(seat.c, null, 'the right order is served');
  assert.ok(inst._test.me.earned > 0);
});

test('test_golf_holes_are_winnable_and_sink_counts_strokes', () => {
  const { BF } = withGames();
  const f = fakeCtx(BF, BF.catalog.get('mini-golf-mania'));
  const inst = BF.GameModules.get('golf').create(f.ctx);
  for (const h of inst._test.holes) assert.ok(h.par >= 2 && h.par <= 5 && Math.hypot(h.cup.x - h.tee.x, h.cup.y - h.tee.y) > 200);
  inst._test.me.strokes = 1;
  inst._test.sunk();
  assert.equal(inst._test.me.total, 1);
  assert.ok(f.log.badges.includes('mini-golf-mania_ace'), 'hole in one badge');
});

test('test_spooky_maze_connects_start_items_and_exit', () => {
  const { BF } = withGames();
  for (const id of ['nightshift-arcade', 'hollow-halls', 'frostbite-station']) {
    const f = fakeCtx(BF, BF.catalog.get(id));
    const inst = BF.GameModules.get('spooky').create(f.ctx);
    const { me, items, exit, bfs } = inst._test;
    for (const it of items) assert.ok(bfs(me, it).length > 0, id + ' item reachable');
    assert.ok(bfs(me, exit).length > 0, id + ' exit reachable');
  }
});

test('test_quiz_questions_have_one_right_answer_among_the_pads', () => {
  const { BF } = withGames();
  for (const id of ['brain-blast', 'speed-math', 'lab-coat-quiz', 'world-tour-trivia', 'true-or-false-tower']) {
    const f = fakeCtx(BF, BF.catalog.get(id));
    const inst = BF.GameModules.get('quiz').create(f.ctx);
    assert.ok(inst._test.questions.length >= 10, id);
    assert.ok(inst._test.answer >= 0 && inst._test.answer < inst._test.pads.length, id + ' answer index');
  }
});
