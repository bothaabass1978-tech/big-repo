'use strict';
/**
 * Live platform systems: developer updates, limited items, followers, chat
 * orders, custom games, crowd scale and game passes.
 * Story: BLOCKFORGE-010
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootDefault } = require('./harness');

const DAY = 86400000;

// ------------------------------------------------------------------ updates

test('test_updates_first_check_only_starts_the_schedule', () => {
  const { BF } = bootDefault();
  const t0 = BF.store.state.updates.last || 1_800_000_000_000;
  BF.store.state.updates.last = 0;
  assert.equal(BF.updates.check(t0), null);
  assert.equal(BF.store.state.updates.last, t0);
  assert.equal(BF.updates.check(t0 + DAY * 0.5), null, 'nothing before the first delay');
  const rec = BF.updates.check(t0 + DAY * BF.updates.T.firstDelayDays + 1);
  assert.ok(rec, 'first update arrives after the first delay');
  assert.equal(rec.id, BF.UPDATES[0].id);
});

test('test_updates_are_spaced_at_least_the_minimum_gap_apart', () => {
  const { BF } = bootDefault();
  let now = 1_800_000_000_000;
  BF.store.state.updates = { seen: [], last: 0 };
  BF.updates.check(now);
  const got = [];
  // poll every hour for 60 days
  for (let h = 0; h < 24 * 60; h++) { now += 3600000; const r = BF.updates.check(now); if (r) got.push(r); }
  assert.ok(got.length >= 8 && got.length <= 15, 'about one update per 4-7 days, got ' + got.length);
  for (let i = 1; i < got.length; i++) assert.ok(got[i].at - got[i - 1].at >= BF.updates.T.gapMinDays * DAY, 'gap ' + i);
});

test('test_updates_deliver_only_one_after_a_long_break', () => {
  const { BF } = bootDefault();
  const t0 = 1_800_000_000_000;
  BF.store.state.updates = { seen: [], last: 0 };
  BF.updates.check(t0);
  assert.ok(BF.updates.check(t0 + DAY * 90));
  assert.equal(BF.updates.check(t0 + DAY * 90 + 60000), null, 'second update waits for a new gap');
  assert.equal(BF.store.state.updates.seen.length, 1);
});

test('test_update_adds_changelog_event_sale_and_releases_limited_item', () => {
  const { BF } = bootDefault();
  const t0 = 1_800_000_000_000;
  const def = BF.UPDATES[0];
  const item = BF.ITEMS[def.items[0]];
  assert.equal(item.notForSale, true, 'hidden before the update');
  assert.ok(!BF.limiteds.list().includes(item));
  BF.store.state.updates = { seen: [], last: t0 - DAY * 2 };
  const rec = BF.updates.check(t0);
  const g = BF.catalog.get(def.gameId);
  assert.equal(g.changelog[0].updateId, def.id);
  assert.equal(g.changelog[0].v, rec.v);
  assert.equal(item.notForSale, false);
  assert.ok(BF.limiteds.list().includes(item));
  assert.equal(BF.updates.xpMult(def.gameId, t0 + DAY), def.event.xp);
  const pass = g.passes[0];
  assert.equal(BF.updates.passPrice(pass, t0 + DAY), Math.round(pass.price * (1 - def.sale / 100)));
  // the event ends after eventDays
  const after = t0 + DAY * (BF.updates.T.eventDays + 0.1);
  assert.equal(BF.updates.xpMult(def.gameId, after), 1);
  assert.equal(BF.updates.passPrice(pass, after), pass.price);
});

test('test_updates_reapply_after_reload_and_reset_for_other_saves', () => {
  const sb = bootDefault();
  const { BF } = sb;
  const t0 = Date.now();
  BF.store.state.updates = { seen: [], last: t0 - DAY * 2 };
  BF.updates.check(t0);
  BF.store.save('test');
  const g = BF.catalog.get(BF.UPDATES[0].gameId);
  const before = g.changelog.length;
  BF.bus.emit('store:loaded', {});
  assert.equal(g.changelog.length, before, 'no duplicate changelog entries');
  BF.store.state.updates = { seen: [], last: t0 };
  BF.updates.apply();
  assert.equal(BF.ITEMS[BF.UPDATES[0].items[0]].notForSale, true, 'a save without the update hides its item again');
  assert.ok(!g.changelog.some((c) => c.updateId), 'changelog entries removed');
});

test('test_updates_continue_with_seasonal_events_after_the_list', () => {
  const { BF } = bootDefault();
  const d = BF.updates.defAt(BF.UPDATES.length + 3);
  assert.match(d.id, /^upd_season_3$/);
  assert.ok(BF.catalog.get(d.gameId));
  assert.ok(d.title && d.notes);
});

// ------------------------------------------------------------------ limiteds

test('test_limited_purchase_assigns_serials_and_sells_out', () => {
  const { BF } = bootDefault();
  const item = BF.limiteds.list().find((i) => !BF.limiteds.soldOut(i));
  BF.economy.earn(item.price * 3, 'test', 'test');
  const left = BF.limiteds.left(item);
  const r = BF.inventory.buy(item.id);
  assert.equal(r.ok, true);
  assert.equal(BF.limiteds.left(item), left - 1);
  assert.deepEqual(Array.from(BF.limiteds.serials(item)), [r.serial]);
  assert.equal(BF.inventory.canSell(item), false, 'limiteds go to the resale market instead');
  BF.store.state.limiteds[item.id].sold = item.limitedStock;
  assert.equal(BF.inventory.canBuy(item).reason, 'soldout');
  assert.ok(BF.limiteds.offers(item).length > 0, 'resellers appear once sold out');
});

test('test_ultra_rare_drops_only_on_a_winning_roll', () => {
  const { BF } = bootDefault();
  assert.equal(BF.limiteds.rollDrops('Test', () => 0.99).length, 0);
  const got = BF.limiteds.rollDrops('Test', () => 0);
  assert.equal(got.length, BF.limiteds.drops().length);
  assert.ok(BF.inventory.owns(got[0].id));
});

// ------------------------------------------------------------------ followers

test('test_followers_gain_is_unique_and_pays_milestones', () => {
  const { BF } = bootDefault();
  BF.store.state.social.followers = [];
  BF.store.state.social.milestones = [];
  const bal = BF.economy.balance();
  const b = BF.followers.gain(BF.bots.list[5].id);
  assert.ok(b);
  assert.equal(BF.followers.gain(BF.bots.list[5].id), null, 'no duplicate followers');
  for (let i = 6; i < 20; i++) BF.followers.gain(BF.bots.list[i].id);
  assert.ok(BF.economy.balance() > bal, 'the 10-follower milestone pays out');
  assert.ok(BF.followers.ratePerMin() > 0 && BF.followers.ratePerMin() <= BF.followers.T.maxPerMin);
});

// ------------------------------------------------------------------ orders

test('test_orders_parse_verbs_names_and_groups', () => {
  const { BF } = bootDefault();
  const bots = BF.bots.list.slice(0, 4);
  const name = bots[1].displayName.split(' ')[0];
  const a = BF.orders.parse(name + ' follow me', bots);
  assert.equal(a.verb, 'follow');
  assert.equal(a.targets[0].id, bots[1].id);
  const b = BF.orders.parse('everyone dance!', bots);
  assert.equal(b.verb, 'emote');
  assert.equal(b.arg, 'dance');
  assert.equal(b.targets.length, 4);
  const c = BF.orders.parse('fight me', bots, { nearest: bots[2] });
  assert.equal(c.verb, 'attack');
  assert.equal(c.target, 'me');
  assert.equal(BF.orders.parse('what a nice day', bots), null);
});

test('test_orders_goal_keeps_followers_in_their_own_slot', () => {
  const { BF } = bootDefault();
  const ctx = { botOrder: () => ({ verb: 'follow' }), clearOrder: () => {} };
  const g = BF.orders.goal(ctx, 'b1', { x: 400, y: 400 }, { x: 100, y: 100 }, { near: 50 });
  assert.ok(Math.abs(Math.hypot(g.x - 100, g.y - 100) - 50) < 1);
  ctx.botOrder = () => ({ verb: 'stay' });
  assert.equal(BF.orders.goal(ctx, 'b1', { x: 0, y: 0 }, { x: 100, y: 100 }).hold, true);
});

// ------------------------------------------------------------------ custom games

test('test_custom_template_validates_rules_and_tiles', () => {
  const { BF } = bootDefault();
  const blank = BF.studio.blank('custom');
  const v = BF.studio.validate('custom', blank);
  assert.equal(v.ok, false, 'a blank collect game has no coins');
  const m = BF.studio.cellMap(blank);
  m.set(BF.studio.key(5, 5), 'coin');
  const lay = BF.studio.pack('custom', m);
  lay.rules = { goal: 'collect' };
  assert.equal(BF.studio.validate('custom', lay).ok, true, BF.studio.validate('custom', lay).errors.join());
  m.set(BF.studio.key(6, 6), 'door');
  const bad = BF.studio.pack('custom', m);
  assert.match(BF.studio.validate('custom', bad).errors.join(), /key/);
  const r = BF.studio.rules({ rules: { time: 99999, lives: 0, goal: 'nope' } });
  assert.equal(r.time, 900);
  assert.equal(r.lives, 1);
  assert.equal(r.goal, 'collect');
});

test('test_creator_can_make_a_custom_game_with_many_passes', () => {
  const { BF } = bootDefault();
  const r = BF.creator.create({ name: 'My Custom World', description: 'x', genre: 'Adventure', maxPlayers: 8, template: 'custom', visibility: 'public', difficulty: 'normal' });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  for (let i = 0; i < 10; i++) {
    const p = BF.creator.addPass(r.game.id, { name: 'Pass ' + i, price: 100 + i, effect: 'vip', desc: 'x' });
    assert.equal(p.ok, true, 'pass ' + i + ': ' + JSON.stringify(p));
  }
  assert.ok(BF.creator.MAX_PASSES >= 25);
});

// ------------------------------------------------------------------ scale + passes

test('test_top_games_have_hundreds_of_thousands_of_players', () => {
  const { BF } = bootDefault();
  const counts = BF.catalog.all().filter((g) => g.builtIn).map((g) => BF.world.playerCount(g.id)).sort((a, b) => b - a);
  assert.ok(counts[0] >= 200000, 'top game ' + counts[0]);
  assert.ok(BF.world.totalOnline() >= 1000000, 'platform online ' + BF.world.totalOnline());
});

test('test_every_built_in_game_has_at_least_five_passes', () => {
  const { BF } = bootDefault();
  for (const g of BF.GAME_REGISTRY) {
    assert.ok(g.passes.length >= 5, g.id + ' has ' + g.passes.length);
    assert.equal(new Set(g.passes.map((p) => p.id)).size, g.passes.length, g.id + ' duplicate pass ids');
  }
});
