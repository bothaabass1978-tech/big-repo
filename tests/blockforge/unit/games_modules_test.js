'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { bootDefault, ROOT } = require('./harness');

function withGames() {
  const sb = bootDefault();
  const files = ['js/engine/input.js', 'js/engine/gfx.js', 'js/engine/phys.js', 'js/engine/runtime.js']
    .concat(fs.readdirSync(path.join(ROOT, 'js/games')).sort().map((f) => 'js/games/' + f));
  for (const rel of files) vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sb.ctx, { filename: rel });
  return sb;
}

test('test_all_20_games_have_a_registered_gameplay_module', () => {
  const { BF } = withGames();
  assert.equal(BF.GAME_REGISTRY.length, 20);
  const types = BF.GameModules.types();
  for (const g of BF.GAME_REGISTRY) assert.ok(types.includes(g.gameType), g.id + ' -> ' + g.gameType);
});

test('test_registry_ids_passes_and_badges_are_unique', () => {
  const { BF } = withGames();
  const seen = new Set();
  for (const g of BF.GAME_REGISTRY) {
    for (const id of [g.id].concat(g.passes.map((p) => p.id), g.badges.map((b) => b.id))) {
      assert.ok(!seen.has(id), 'duplicate id ' + id);
      seen.add(id);
    }
    assert.ok(g.passes.every((p) => p.effect && p.price > 0), g.id + ' passes need an effect and price');
  }
});

test('test_generated_obby_courses_are_always_jumpable', () => {
  const { BF } = withGames();
  const v = 760, gr = 2050, speed = 270;
  const reach = (rise, vj) => { const disc = vj * vj - 2 * gr * rise; return disc < 0 ? -1 : speed * ((vj + Math.sqrt(disc)) / gr) + 24; };
  const check = (c) => {
    for (let i = 1; i < c.plats.length; i++) {
      const a = c.plats[i - 1], b = c.plats[i];
      const aRight = a.x0 + a.w + (a.kind === 'move' && a.axis === 'x' ? a.range : 0);
      const aTop = a.kind === 'move' && a.axis === 'y' ? a.y0 + a.range : a.y0;
      const pad = c.pads.some((p) => p.x > a.x0 && p.x < a.x0 + a.w);
      const r = reach(aTop - b.y0, pad ? 1280 : v);
      assert.ok(r > 0 && b.x0 - aRight <= r * 0.92, 'unreachable jump ' + i);
    }
    assert.ok(c.portal, 'course has a finish portal');
  };
  check(BF.obbyCourse('sky-obby-v1', 10, 'normal'));
  for (let s = 1; s <= 30; s++) for (const d of ['easy', 'normal', 'hard']) check(BF.obbyCourse('obby:' + s, { easy: 6, normal: 8, hard: 10 }[d], d));
});

test('test_speed_trial_courses_are_finishable_with_ordered_medals', () => {
  const { BF } = withGames();
  assert.equal(BF.speedTrialCourses.length, 5);
  for (const c of BF.speedTrialCourses) {
    assert.ok(c.auto.time > 5 && c.auto.time < 120, c.id + ' autopilot time ' + c.auto.time);
    assert.ok(c.targets.gold < c.targets.silver && c.targets.silver < c.targets.bronze);
  }
});

test('test_pet_world_eggs_publish_odds_that_sum_to_100', () => {
  const { BF } = withGames();
  const species = Object.values(BF.PET_WORLD_SPECIES);
  assert.ok(species.length >= 15);
  for (const sp of species) assert.ok(sp.power > 0 && BF.RARITY[sp.rarity]);
  const svg = BF.petArt('unicorn', 64);
  assert.ok(svg.startsWith('<svg') && svg.includes('</svg>'));
});
