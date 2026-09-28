'use strict';
/**
 * Your studio, buying studios (BF.company) and communities with giveaways
 * (BF.communities), ADR-0015.
 * Story: BLOCKFORGE-020
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootDefault } = require('./harness');

function withStudio(BF, coins) {
  BF.economy.earn(coins || 50000000, 'test', 'debug');
  const r = BF.company.found({ name: 'Pixel Forge Games', tagline: 'fun', color: '#46a8ff' });
  assert.equal(r.ok, true, r.error);
  return r.company;
}

test('test_company_found_costs_coins_and_validates_names', () => {
  const { BF } = bootDefault();
  assert.equal(BF.company.found({ name: 'Pixel Forge Games' }).ok, false, 'the sample account cannot afford it yet');
  BF.economy.earn(10000, 'test', 'debug');
  assert.equal(BF.company.found({ name: 'x' }).ok, false);
  assert.equal(BF.company.found({ name: BF.creatorEconomy.studios()[0].name }).ok, false, 'names are unique');
  const before = BF.economy.balance();
  const r = BF.company.found({ name: 'Pixel Forge Games' });
  assert.equal(r.ok, true);
  assert.equal(before - BF.economy.balance(), BF.company.T.foundCost);
  assert.equal(BF.company.found({ name: 'Another One' }).ok, false, 'one studio each');
  assert.ok(BF.communities.get('mine'));
});

test('test_company_values_follow_earnings', () => {
  const { BF } = bootDefault();
  const m = BF.company.market();
  assert.ok(m[0].value > m[m.length - 1].value);
  const top = m[0];
  assert.ok(top.value > BF.company.ownerIncome(top.studio) * BF.company.T.paybackMin);
});

test('test_company_buying_a_studio_moves_income_fame_and_pays_the_seller', () => {
  const { BF } = bootDefault();
  withStudio(BF);
  const target = BF.company.market().slice(-1)[0];
  const seller = target.studio.owner;
  const sellerBefore = BF.bots.stats(seller).coins;
  const fameBefore = BF.fame.score();
  const before = BF.economy.balance();
  const r = BF.company.buy(target.name);
  assert.equal(r.ok, true, r.error);
  assert.equal(before - BF.economy.balance(), r.price);
  assert.ok(BF.company.owns(target.name));
  assert.ok(BF.creatorEconomy.studio(target.name).mine);
  assert.ok(BF.company.incomePerMin() > 0);
  assert.ok(BF.fame.score() > fameBefore, 'its players count toward your fame');
  assert.ok(BF.bots.stats(seller).coins >= sellerBefore, 'the seller keeps the price');
  assert.equal(BF.company.buy(target.name).ok, false, 'no buying twice');
});

test('test_company_income_pays_out_and_selling_refunds_ninety_percent', () => {
  const { BF } = bootDefault();
  withStudio(BF);
  const target = BF.company.market().slice(-1)[0];
  BF.company.buy(target.name);
  const t0 = BF.clock.now();
  BF.store.state.company.tickAt = t0;
  BF.store.state.company.paidAt = t0;
  const before = BF.economy.balance();
  BF.company.tick(t0 + 6 * 60000);
  assert.ok(BF.economy.balance() > before, 'studio income arrives');
  const value = BF.company.value(BF.creatorEconomy.studio(target.name));
  const b2 = BF.economy.balance();
  const s = BF.company.sell(target.name);
  assert.equal(s.ok, true);
  assert.equal(BF.economy.balance() - b2, Math.round(value * BF.company.T.sellShare));
  assert.equal(BF.company.owns(target.name), false);
});

test('test_company_cannot_buy_without_a_studio_or_enough_coins', () => {
  const { BF } = bootDefault();
  const name = BF.company.market()[0].name;
  assert.equal(BF.company.buy(name).ok, false);
  BF.economy.earn(5000, 'test', 'debug');
  BF.company.found({ name: 'Tiny Games' });
  const r = BF.company.buy(name);
  assert.equal(r.ok, false);
  assert.ok(r.need > 0);
});

test('test_communities_one_per_studio_with_seeded_feeds', () => {
  const { BF } = bootDefault();
  const list = BF.communities.list();
  assert.equal(list.length, BF.creatorEconomy.studios().length);
  const c = list[0];
  const feed = BF.communities.feed(c.id);
  assert.ok(feed.length >= 3);
  assert.ok(feed.every((p) => p.text && p.author));
  assert.ok(c.members > 1000);
  BF.communities.join(c.id);
  assert.ok(BF.communities.joined(c.id));
  BF.communities.like(feed[0].id);
  assert.equal(BF.communities.findPost(feed[0].id).liked, true);
});

test('test_communities_your_posts_get_comments', () => {
  const sb = bootDefault();
  const { BF } = sb;
  assert.equal(BF.communities.post('hello everyone').ok, false, 'needs a studio');
  withStudio(BF);
  const r = BF.communities.post('Big update this weekend, who is ready?');
  assert.equal(r.ok, true, r.error);
  for (let i = 0; i < 12; i++) sb.timers.flush();
  const p = BF.communities.findPost(r.post.id);
  assert.ok(p.comments.length >= 2, 'members reply');
});

test('test_communities_hosted_giveaway_grows_the_community_and_pays_winners', () => {
  const { BF } = bootDefault();
  withStudio(BF);
  const before = BF.economy.balance();
  const members0 = BF.store.state.community.members;
  const fans0 = BF.followers.total();
  const r = BF.communities.host({ prize: 50000, winners: 5, minutes: 3 });
  assert.equal(r.ok, true, r.error);
  assert.equal(before - BF.economy.balance(), 50000, 'prize leaves the wallet');
  assert.equal(BF.communities.host({ prize: 100, winners: 1, minutes: 2 }).ok, false, 'one at a time');
  const g = r.giveaway;
  const t0 = BF.clock.now();
  g.tickAt = t0;
  BF.communities.tick(t0 + 60000);
  assert.ok(g.entrants > 0);
  assert.ok(BF.store.state.community.members > members0, 'entrants join');
  assert.ok(BF.followers.total() > fans0, 'entrants follow you');
  BF.communities.tick(t0 + 4 * 60000);
  assert.equal(g.done, true);
  assert.equal(g.winnerIds.length, 5);
  assert.ok(!g.winnerIds.includes('me'));
});

test('test_communities_studio_giveaway_is_free_and_fair', () => {
  const { BF } = bootDefault();
  const g = BF.communities.startStudioGiveaway(BF.clock.now(), () => 0.5);
  assert.ok(g);
  const before = BF.economy.balance();
  const r = BF.communities.enter(g.id);
  assert.equal(r.ok, true);
  assert.equal(BF.economy.balance(), before, 'entering is free');
  assert.equal(BF.communities.enter(g.id).ok, false, 'enter once');
  assert.ok(BF.communities.joined(g.cid));
  const win = BF.communities.finish(g, () => 0); // a lucky draw
  assert.equal(win.youWon, true);
  assert.equal(BF.economy.balance() - before, Math.floor(g.prize / g.winners));
  const g2 = BF.communities.startStudioGiveaway(BF.clock.now(), () => 0.3, BF.creatorEconomy.studios()[3]);
  BF.communities.enter(g2.id);
  const lose = BF.communities.finish(g2, () => 0.999);
  assert.equal(lose.youWon, false);
});

test('test_company_and_communities_persist', () => {
  const sb = bootDefault();
  withStudio(sb.BF);
  sb.BF.communities.post('Saving works?');
  sb.BF.store.save('test');
  const again = bootDefault({ storage: sb.storage });
  assert.equal(again.BF.company.mine().name, 'Pixel Forge Games');
  assert.ok(again.BF.communities.feed('mine').some((p) => p.text === 'Saving works?'));
});
