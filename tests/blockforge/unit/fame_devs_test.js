'use strict';
/**
 * Fame (BF.fame) and hireable developers (BF.devs), ADR-0014.
 * Story: BLOCKFORGE-019
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { bootDefault } = require('./harness');

const fixRandom = (sb, v) => vm.runInContext('Math.random = () => ' + v, sb.ctx);
function publish(BF, name) {
  const r = BF.creator.create({ name: name || 'Team Test', description: 'A fun obby with many stages.', genre: 'Obby', maxPlayers: 8, template: 'obby', visibility: 'public', difficulty: 'normal' });
  BF.creator.publish(r.game.id);
  return BF.creator.get(r.game.id);
}
function fakeApi(bots) {
  const log = { chat: [], follow: [], emote: [], rush: 0, banner: null, feed: [] };
  return { log, api: { bots, name: 'Forge Player', game: { name: 'Sky Obby' }, server: { num: 7 }, chat: (b, t) => log.chat.push(t), follow: (b) => log.follow.push(b.id), emote: (b, k) => log.emote.push(k), rush: (n) => { log.rush += n; }, banner: (t, d) => { log.banner = t; }, feed: (t) => log.feed.push(t) } };
}

test('test_fame_new_player_is_a_newcomer_far_down_the_board', () => {
  const { BF } = bootDefault();
  const m = BF.fame.me();
  assert.equal(m.tier.id, 'newcomer');
  assert.ok(m.rank > 500, 'rank ' + m.rank);
  assert.equal(m.total, BF.bots.list.length + 1);
  const top = BF.fame.bots()[0];
  assert.equal(BF.fame.tierOf(top.bot).id, 'legend', 'the #1 bot is the Legend');
});

test('test_fame_followers_and_fans_raise_tier_rank_and_pay_once', () => {
  const { BF } = bootDefault();
  const before = BF.economy.balance();
  BF.followers.addFans(300000);
  const m = BF.fame.me();
  assert.equal(m.tier.id, 'famous');
  assert.ok(m.rank < 100);
  BF.fame.check();
  const paid = BF.economy.balance() - before;
  assert.ok(paid >= 25000, 'tier bonuses paid: ' + paid);
  BF.fame.check();
  assert.equal(BF.economy.balance() - before, paid, 'bonuses are paid once');
  assert.ok(BF.store.state.notifications.some((n) => /You are now Famous/.test(n.title)));
});

test('test_fame_creators_are_followed_by_their_players', () => {
  const { BF } = bootDefault();
  const owner = BF.creatorEconomy.studios()[0].owner;
  assert.ok(BF.creatorEconomy.fansOf(owner.id) > 100000);
  assert.ok(BF.bots.stats(owner).followers > owner.base.followers);
});

test('test_fame_arrival_scales_with_tier', () => {
  const sb = bootDefault();
  const { BF } = sb;
  const bots = BF.bots.list.slice(10, 22);
  const quiet = fakeApi(bots);
  assert.equal(BF.fame.arrive(quiet.api, () => 0.99), 0, 'nobody knows a newcomer');
  assert.equal(quiet.log.chat.length, 0);
  BF.followers.addFans(1500000);
  const mob = fakeApi(bots);
  const lvl = BF.fame.arrive(mob.api, () => 0.3);
  assert.ok(lvl >= 3, 'superstar mob, level ' + lvl);
  assert.ok(mob.log.chat.length >= bots.length, 'everyone freaks out');
  assert.equal(mob.log.follow.length, bots.length, 'everyone swarms you');
  assert.ok(mob.log.rush > 0, 'fans pour into the server');
  assert.ok(mob.log.banner);
});

test('test_fame_chat_knows_who_you_are', () => {
  const { BF } = bootDefault();
  const bot = BF.bots.list[5];
  assert.equal(BF.chat.think(bot, 'do you know who i am', { channel: 'dm' }).intent, 'famous');
  BF.followers.addFans(300000);
  const r = BF.chat.think(bot, 'am i famous?', { channel: 'dm' });
  assert.match(r.goal, /starstruck|excited/);
});

test('test_devs_hiring_pays_first_hour_and_respects_fame_gates', () => {
  const sb = bootDefault();
  const { BF } = sb;
  const ug = publish(BF);
  BF.economy.earn(100000, 'test', 'debug');
  fixRandom(sb, 0.999); // top-skill candidates
  const c = BF.devs.candidates(true);
  assert.ok(c.every((x) => x.skill === 5 && x.locked), 'five-star devs want a Famous creator');
  assert.equal(BF.devs.hire(ug.id, c[0].botId).ok, false);
  BF.followers.addFans(300000);
  const before = BF.economy.balance();
  const r = BF.devs.hire(ug.id, BF.devs.candidates()[0].botId);
  assert.equal(r.ok, true, r.error);
  assert.equal(before - BF.economy.balance(), r.hire.salary);
  assert.equal(BF.devs.team(ug.id).length, 1);
});

test('test_devs_ship_updates_that_raise_quality_and_bring_players', () => {
  const sb = bootDefault();
  const { BF } = sb;
  const ug = publish(BF);
  BF.economy.earn(100000, 'test', 'debug');
  fixRandom(sb, 0.01);
  const c = BF.devs.candidates(true).filter((x) => BF.devs.T.roles[x.role].ships > 0 && !x.locked);
  assert.ok(c.length > 0);
  BF.devs.hire(ug.id, c[0].botId);
  const q0 = BF.creator.quality(ug), v0 = ug.version || 1, visits0 = ug.visits;
  ug.aud = 10000;
  const sh = BF.devs.ship(ug, BF.clock.now());
  assert.ok(sh && sh.notes.length);
  assert.equal(ug.version, v0 + 1);
  assert.ok(BF.creator.quality(ug) > q0, 'quality goes up');
  assert.ok(ug.visits > visits0, 'regulars rush back');
  assert.ok(BF.devs.visitMult(ug) > 1, 'hype boosts visits');
  assert.ok(Number.isFinite(BF.devs.period(ug.id)));
});

test('test_devs_salaries_come_from_earnings_then_wallet_and_unpaid_devs_quit', () => {
  const sb = bootDefault();
  const { BF } = sb;
  const ug = publish(BF);
  BF.economy.earn(100000, 'test', 'debug');
  fixRandom(sb, 0.01);
  const c = BF.devs.candidates(true).find((x) => !x.locked);
  BF.devs.hire(ug.id, c.botId);
  const h = BF.devs.team(ug.id)[0];
  ug.pending = 1e6;
  const t0 = BF.clock.now();
  BF.store.state.devs.tickAt = t0;
  BF.devs.tick(t0 + 3600 * 1000);
  assert.ok(ug.pending < 1e6, 'earnings paid the salary');
  // no earnings and an empty wallet: after the grace period the dev quits
  ug.pending = 0;
  BF.store.state.wallet.balance = 0;
  let t = t0 + 3600 * 1000;
  for (let i = 0; i < 30 && BF.devs.team(ug.id).length; i++) { t += 60000; BF.devs.tick(t); }
  assert.equal(BF.devs.team(ug.id).length, 0, h.bot.displayName + ' quit');
});

test('test_fame_and_devs_persist_in_the_save', () => {
  const sb = bootDefault();
  const ug = publish(sb.BF);
  sb.BF.economy.earn(100000, 'test', 'debug');
  vm.runInContext('Math.random = () => 0.01', sb.ctx);
  const c = sb.BF.devs.candidates(true).find((x) => !x.locked);
  sb.BF.devs.hire(ug.id, c.botId);
  sb.BF.followers.addFans(1234);
  sb.BF.store.save('test');
  const again = bootDefault({ storage: sb.storage });
  assert.equal(again.BF.devs.team(ug.id).length, 1);
  assert.equal(again.BF.store.state.social.fans, 1234);
});
