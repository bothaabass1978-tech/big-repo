'use strict';
/**
 * Performance systems (BF.perf, ADR-0013): the frame-rate governor, background
 * work pacing, and world ticks that do not rebuild pages.
 * Story: BLOCKFORGE-018
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { bootDefault, ROOT } = require('./harness');

function withPerf() {
  const sb = bootDefault();
  sb.ctx.performance = { now: () => Date.now() };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/engine/perf.js'), 'utf8'), sb.ctx, { filename: 'perf.js' });
  sb.BF.perf.reset();
  return sb;
}
const fakeWorld = () => ({ levels: [], setLevel(lv) { this.levels.push(lv); } });
const run = (gov, fps, seconds) => { for (let t = 0; t < seconds; t += 1 / fps) gov.frame(1 / fps); };

test('test_perf_governor_steps_down_when_slow_and_up_when_smooth', () => {
  const { BF } = withPerf();
  BF.store.state.settings.gameplay.graphics = 'auto';
  const w = fakeWorld();
  const gov = BF.perf.governor(w);
  const start = gov.level;
  run(gov, 20, 6);
  assert.ok(gov.level > start, 'slow frames lower the level: ' + start + ' -> ' + gov.level);
  assert.equal(w.levels[w.levels.length - 1].scale, BF.perf.T.levels[gov.level].scale);
  const low = gov.level;
  run(gov, 60, 30);
  assert.ok(gov.level < low, 'smooth frames raise it again');
});

test('test_perf_governor_remembers_the_level_for_next_time', () => {
  const { BF } = withPerf();
  BF.store.state.settings.gameplay.graphics = 'auto';
  const gov = BF.perf.governor(fakeWorld());
  run(gov, 15, 8);
  assert.equal(BF.perf.learned(), gov.level);
  assert.equal(BF.perf.governor(fakeWorld()).level, gov.level, 'the next game starts there');
});

test('test_perf_high_graphics_never_changes_and_low_never_goes_sharp', () => {
  const { BF } = withPerf();
  BF.store.state.settings.gameplay.graphics = 'high';
  const hi = BF.perf.governor(fakeWorld());
  run(hi, 10, 8);
  assert.equal(hi.level, 0);
  BF.store.state.settings.gameplay.graphics = 'low';
  const lo = BF.perf.governor(fakeWorld());
  run(lo, 60, 40);
  assert.ok(lo.level >= BF.perf.T.lowStart);
});

test('test_perf_background_jobs_wait_while_a_game_runs', () => {
  const sb = withPerf();
  const { BF } = sb;
  let ran = 0;
  BF.runtime = { active: true };
  BF.perf.idle(() => { ran++; });
  for (let i = 0; i < 5; i++) sb.timers.flush();
  assert.equal(ran, 0, 'nothing renders during a game');
  BF.runtime.active = false;
  for (let i = 0; i < 5; i++) sb.timers.flush();
  assert.equal(ran, 1);
});

test('test_perf_world_tick_updates_creator_stats_without_rebuilding_pages', async () => {
  const { BF } = bootDefault();
  const r = BF.creator.create({ name: 'Tick Test', description: 'x', genre: 'Obby', maxPlayers: 8, template: 'obby', visibility: 'public', difficulty: 'normal' });
  BF.creator.publish(r.game.id);
  await new Promise((res) => setImmediate(res));
  const seen = [];
  BF.bus.on('store:change', (keys) => seen.push([...keys]));
  BF.creator.simulate();
  await new Promise((res) => setImmediate(res));
  const keys = seen.flat();
  assert.ok(keys.includes('creatorStats'));
  assert.ok(!keys.includes('created'), 'pages that list games are not rebuilt by the tick');
});
