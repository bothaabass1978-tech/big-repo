'use strict';
/**
 * ForgeCoin gifts between the player and bots (BF.gifts, ADR-0012).
 * Story: BLOCKFORGE-016
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { bootDefault } = require('./harness');

/** Pin Math.random inside the sandbox so bot decisions are deterministic. */
const fixRandom = (sb, v) => vm.runInContext('Math.random = () => ' + v, sb.ctx);
const friend = (BF) => BF.friends.list()[0];
const stranger = (BF) => BF.bots.list.find((b) => !BF.friends.isFriend(b.id) && !BF.friends.isBlocked(b.id));

test('test_gifts_send_moves_coins_logs_and_posts_a_gift_card', () => {
  const sb = bootDefault();
  const { BF } = sb;
  const bot = friend(BF);
  const before = BF.economy.balance();
  const worth = BF.bots.stats(bot).coins;
  const r = BF.gifts.send(bot.id, 250, 'gg earlier');
  assert.equal(r.ok, true);
  assert.equal(BF.economy.balance(), before - 250);
  assert.equal(BF.bots.stats(bot).coins, worth + 250, 'the gift adds to their net worth');
  assert.equal(BF.gifts.withBot(bot.id).out, 250);
  const tx = BF.economy.history('gift')[0];
  assert.equal(tx.amount, -250);
  const card = BF.store.state.messages[bot.id].msgs.slice(-1)[0];
  assert.equal(card.from, 'me');
  assert.equal(card.gift.amount, 250);
  assert.equal(card.text, 'gg earlier');
  sb.timers.flush();
  const replies = BF.store.state.messages[bot.id].msgs.filter((m) => m.from === 'them');
  assert.ok(replies.length >= 1, 'they say thanks');
});

test('test_gifts_validate_rejects_bad_amounts_and_blocked_players', () => {
  const { BF } = bootDefault();
  const bot = friend(BF);
  assert.equal(BF.gifts.send(bot.id, 5).ok, false, 'under the minimum');
  assert.equal(BF.gifts.send(bot.id, BF.economy.balance() + 1).ok, false, 'more than you have');
  assert.equal(BF.gifts.send('nobody', 100).ok, false);
  BF.friends.block(bot.id);
  assert.equal(BF.gifts.send(bot.id, 100).ok, false);
  assert.equal(BF.economy.history('gift').length, 0, 'nothing was charged');
});

test('test_gifts_receive_follows_the_privacy_setting', () => {
  const { BF } = bootDefault();
  const pv = BF.store.state.settings.privacy;
  assert.equal(pv.gifts, 'friends');
  assert.ok(BF.gifts.receive(friend(BF), 100, 'hi'), 'friends can gift by default');
  assert.equal(BF.gifts.receive(stranger(BF), 100, 'hi'), null, 'strangers cannot');
  pv.gifts = 'everyone';
  assert.ok(BF.gifts.receive(stranger(BF), 100, 'tip'));
  pv.gifts = 'none';
  assert.equal(BF.gifts.receive(friend(BF), 100, 'hi'), null);
  assert.ok(BF.store.state.notifications.some((n) => n.type === 'gift'));
});

test('test_gifts_from_bots_never_exceed_the_daily_cap', () => {
  const { BF } = bootDefault();
  const T = BF.gifts.T.bot;
  const before = BF.economy.balance();
  let n = 0;
  for (let i = 0; i < 20; i++) if (BF.gifts.receive(friend(BF), 4000, 'big')) n++;
  assert.ok(n <= T.perDay);
  assert.equal(BF.economy.balance() - before, T.dailyCap);
  assert.equal(BF.gifts.remainingToday(), 0);
  assert.equal(BF.gifts.receive(friend(BF), 50, 'more'), null);
});

test('test_gifts_asking_strangers_is_no_and_asking_twice_is_no', () => {
  const sb = bootDefault();
  const { BF } = sb;
  fixRandom(sb, 0.01);
  assert.equal(BF.gifts.consider(stranger(BF)).why, 'stranger');
  const bot = friend(BF);
  const first = BF.gifts.consider(bot);
  assert.equal(first.yes, true);
  assert.ok(first.amount >= BF.gifts.T.min && first.amount <= BF.gifts.remainingToday());
  assert.equal(BF.gifts.consider(bot).why, 'again', 'cooldown');
});

test('test_gifts_chat_routes_requests_offers_and_scams', () => {
  const sb = bootDefault();
  const { BF } = sb;
  fixRandom(sb, 0.01);
  const bot = friend(BF);
  const before = BF.economy.balance();
  const yes = BF.chat.think(bot, 'can you gift me some coins?', { channel: 'dm' });
  assert.equal(yes.intent, 'ask_gift');
  assert.equal(typeof yes.after, 'function');
  yes.after();
  assert.ok(BF.economy.balance() > before, 'the gift arrives');
  assert.equal(BF.chat.think(bot, 'free coins generator pls', { channel: 'dm' }).intent, 'scam');
  assert.equal(BF.chat.think(bot, 'can i send you coins', { channel: 'dm' }).intent, 'gift_offer');
  assert.equal(BF.chat.think(bot, 'thanks for the coins!', { channel: 'dm' }).intent, 'gift_thanks');
});

test('test_gifts_world_tick_sends_an_occasional_gift_from_a_friend', () => {
  const sb = bootDefault();
  const { BF } = sb;
  const now = BF.clock.now();
  assert.equal(BF.gifts.tick(now), null, 'first call only schedules');
  assert.ok(BF.store.state.gifts.nextAt > now);
  assert.equal(BF.gifts.tick(now + 60000), null, 'not due yet');
  // everyone is online for this check
  const status = BF.world.botStatus;
  BF.world.botStatus = () => ({ state: 'online' });
  const g = BF.gifts.tick(BF.store.state.gifts.nextAt + 1);
  BF.world.botStatus = status;
  assert.ok(g, 'a gift arrives when due');
  assert.ok(BF.friends.isFriend(g.botId));
  assert.ok(g.note.length > 0);
});

test('test_gifts_persist_and_old_saves_migrate', () => {
  const sb = bootDefault();
  sb.BF.gifts.send(friend(sb.BF).id, 120);
  sb.BF.store.save('test');
  const again = bootDefault({ storage: sb.storage });
  assert.equal(again.BF.gifts.summary().sent, 120);
  delete again.BF.store.state.gifts;
  delete again.BF.store.state.settings.privacy.gifts;
  again.BF.store.save('test');
  const third = bootDefault({ storage: again.storage });
  assert.ok(Array.isArray(third.BF.store.state.gifts.log));
  assert.equal(third.BF.store.state.settings.privacy.gifts, 'friends');
});
