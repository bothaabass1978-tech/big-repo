'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { bootDefault, ROOT } = require('./harness');

const base = { name: 'Studio Test Game', description: 'Hand-built level for tests. '.repeat(8), genre: 'Obby', maxPlayers: 12, template: 'obby', thumbnail: { color: '#ff7a2e', pattern: 'grid' }, visibility: 'public', difficulty: 'normal' };

function withGames() {
  const sb = bootDefault();
  const files = ['js/engine/input.js', 'js/engine/gfx.js', 'js/engine/phys.js', 'js/engine/runtime.js'].concat(fs.readdirSync(path.join(ROOT, 'js/games')).sort().map((f) => 'js/games/' + f));
  for (const rel of files) vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sb.ctx, { filename: rel });
  return sb;
}
function published(BF, patch) {
  const r = BF.creator.create(Object.assign({}, base, patch));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  BF.creator.publish(r.game.id);
  return r.game;
}

test('test_studio_blank_obby_layout_builds_a_course_with_start_and_finish', () => {
  const { BF } = bootDefault();
  const lay = BF.studio.blank('obby');
  assert.equal(BF.studio.validate('obby', lay).ok, true);
  const course = BF.studio.obbyCourse(lay);
  assert.equal(course.flags[0].cp, 0);
  assert.ok(course.portal, 'finish portal');
  assert.ok(course.portal.x > course.flags[0].x);
  assert.equal(course.stages, 1);
});

test('test_studio_obby_numbers_checkpoints_left_to_right_and_adds_hazards', () => {
  const { BF } = bootDefault();
  const m = BF.studio.cellMap(BF.studio.blank('obby'));
  for (const c of [40, 41, 42]) m.set(BF.studio.key(c, 9), 'check');
  for (const c of [12, 13]) m.set(BF.studio.key(c, 10), 'check');
  m.set(BF.studio.key(30, 8), 'kill');
  m.set(BF.studio.key(33, 8), 'bounce');
  m.set(BF.studio.key(50, 10), 'finish');
  const lay = BF.studio.pack('obby', m);
  const course = BF.studio.obbyCourse(lay);
  const cps = course.plats.filter((p) => p.tile === 'check').sort((a, b) => a.x - b.x).map((p) => p.cp);
  assert.equal(cps.join(','), '1,2');
  assert.equal(course.stages, 3);
  assert.equal(course.kills.length, 1);
  assert.equal(course.pads.length, 1);
});

test('test_studio_obby_without_a_finish_is_rejected', () => {
  const { BF } = bootDefault();
  const m = BF.studio.cellMap(BF.studio.blank('obby'));
  for (const [k, t] of Array.from(m)) if (t === 'finish') m.delete(k);
  const v = BF.studio.validate('obby', BF.studio.pack('obby', m));
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /Finish/.test(e)));
});

test('test_studio_td_road_must_run_unbroken_from_left_to_right', () => {
  const { BF } = bootDefault();
  const straight = BF.studio.blank('towerdefense');
  const tr = BF.studio.tdTrace(straight);
  assert.equal(tr.ok, true);
  assert.equal(tr.path[0][0], -1);
  assert.equal(tr.path[tr.path.length - 1][0], 20);
  const m = BF.studio.cellMap(straight);
  m.delete(BF.studio.key(10, 4));
  assert.match(BF.studio.tdTrace(BF.studio.pack('towerdefense', m)).error, /right edge|connected/);
  const b = BF.studio.cellMap(straight);
  b.set(BF.studio.key(8, 3), 'road');
  b.set(BF.studio.key(8, 5), 'road');
  assert.match(BF.studio.tdTrace(BF.studio.pack('towerdefense', b)).error, /branches/);
});

test('test_studio_td_turns_become_waypoints', () => {
  const { BF } = bootDefault();
  const m = new Map();
  for (let c = 0; c <= 5; c++) m.set(BF.studio.key(c, 1), 'road');
  for (let r = 2; r <= 6; r++) m.set(BF.studio.key(5, r), 'road');
  for (let c = 6; c < 20; c++) m.set(BF.studio.key(c, 6), 'road');
  const path = BF.studio.tdPath(BF.studio.pack('towerdefense', m));
  assert.equal(JSON.stringify(path), JSON.stringify([[-1, 1], [5, 1], [5, 6], [20, 6]]));
});

test('test_studio_arena_keeps_the_centre_clear_and_merges_runs', () => {
  const { BF } = bootDefault();
  const m = new Map();
  for (let c = 2; c < 6; c++) m.set(BF.studio.key(c, 2), 'wall');
  m.set(BF.studio.key(11, 6), 'wall');
  const rects = BF.studio.arenaRects(BF.studio.pack('arena', m));
  assert.equal(rects.length, 1, 'centre tile dropped, row merged');
  assert.equal(rects[0].w, 160);
});

test('test_studio_generated_levels_round_trip_into_valid_layouts', () => {
  const { BF } = withGames();
  for (const tpl of ['obby', 'towerdefense', 'arena']) {
    const lay = BF.studio.fromGenerated(tpl, 12345, 'normal');
    const v = BF.studio.validate(tpl, lay);
    assert.equal(v.ok, true, tpl + ': ' + v.errors.join(' '));
  }
});

test('test_creator_saves_valid_layouts_and_passes_them_to_the_game', () => {
  const { BF } = bootDefault();
  const ug = published(BF);
  const bad = BF.studio.pack('obby', new Map());
  assert.equal(BF.creator.setLayout(ug.id, bad).ok, false);
  assert.equal(BF.creator.setLayout(ug.id, BF.studio.blank('obby')).ok, true);
  assert.equal(BF.catalog.get(ug.id).config.layout.kind, 'obby');
  assert.equal(BF.creator.setLayout(ug.id, null).ok, true);
  assert.equal(BF.catalog.get(ug.id).config.layout, null);
});

test('test_ads_campaign_charges_the_budget_up_front_and_refunds_the_rest_when_stopped', () => {
  const { BF } = bootDefault();
  const ug = published(BF);
  const before = BF.economy.balance();
  const r = BF.ads.create({ gameId: ug.id, headline: 'Leap across lava in my obby!', tier: 'standard', placements: ['home', 'search'], budget: 600 });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(BF.economy.balance(), before - 600);
  BF.ads.simulate(4);
  const c = BF.ads.get(r.campaign.id);
  assert.ok(c.impressions > 0 && c.spent > 0);
  const stop = BF.ads.stop(c.id);
  assert.equal(stop.ok, true);
  assert.equal(c.status, 'stopped');
  assert.equal(BF.economy.balance(), before - 600 + Math.floor(600 - c.spent));
  assert.equal(BF.ads.boosting(ug.id), false);
});

test('test_ads_spend_the_whole_budget_and_send_visitors_who_earn_creator_revenue', () => {
  const { BF } = bootDefault();
  const ug = published(BF);
  BF.creator.addPass(ug.id, { name: 'Lava Boots', price: 120, effect: 'vip' });
  const r = BF.ads.create({ gameId: ug.id, headline: 'The hardest obby on BlockForge', tier: 'premium', placements: ['home', 'discover', 'search'], budget: 300 });
  const c = BF.ads.get(r.campaign.id);
  for (let i = 0; i < 400 && c.status === 'active'; i++) BF.ads.simulate(4);
  assert.equal(c.status, 'ended');
  assert.ok(Math.abs(c.spent - 300) < 1, 'spent ' + c.spent);
  assert.ok(c.visits > 0 && c.clicks >= c.visits);
  assert.ok(ug.visits >= c.visits);
  assert.ok(ug.adSpend > 299);
  assert.ok(ug.pending > 0 && ug.earn.visits > 0);
  assert.ok(ug.hist.some((b) => b.a > 0), 'ad visits recorded in the earnings history');
});

test('test_ads_reject_drafts_short_headlines_and_budgets_above_the_balance', () => {
  const { BF } = bootDefault();
  const draft = BF.creator.create(base).game;
  assert.ok(BF.ads.validate({ gameId: draft.id, headline: 'Play my game please', tier: 'standard', placements: ['home'], budget: 100 }).gameId);
  const ug = published(BF, { name: 'Another Studio Game' });
  const e = BF.ads.validate({ gameId: ug.id, headline: 'hi', tier: 'nope', placements: [], budget: BF.economy.balance() + 1 });
  for (const k of ['headline', 'tier', 'placements', 'budget']) assert.ok(e[k], 'error for ' + k);
});

test('test_ads_sponsored_slots_list_running_campaigns_first', () => {
  const { BF } = bootDefault();
  const ug = published(BF);
  BF.ads.create({ gameId: ug.id, headline: 'Sponsored slot test headline', tier: 'boosted', placements: ['discover'], budget: 200 });
  const d = BF.ads.sponsored('discover', 3);
  assert.equal(d[0].gameId, ug.id);
  assert.equal(d.length, 3, 'house promotions fill the rest');
  assert.ok(!BF.ads.sponsored('home', 2).some((x) => x.gameId === ug.id), 'only the chosen placements');
});

test('test_creator_collect_all_moves_pending_earnings_into_the_wallet', () => {
  const { BF } = bootDefault();
  const a = published(BF, { name: 'Collect Test One' });
  const b = published(BF, { name: 'Collect Test Two' });
  BF.creator.receiveVisits(a, 50, 'organic');
  BF.creator.receiveVisits(b, 30, 'organic');
  const want = Math.floor(a.pending) + Math.floor(b.pending);
  const before = BF.economy.balance();
  const r = BF.creator.collectAll();
  assert.equal(r.ok, true);
  assert.equal(r.amount, want);
  assert.equal(BF.economy.balance(), before + want);
  assert.equal(BF.creator.totals().visits, 80);
  assert.ok(BF.creator.series(10).some((m) => m.v > 0));
});
