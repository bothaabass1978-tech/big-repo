'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootDefault } = require('./harness');

test('test_default_account_starts_with_1500_forgecoins', () => {
  const { BF } = bootDefault();
  assert.equal(BF.economy.balance(), 1500);
  assert.equal(BF.store.state.player.username, 'ForgePlayer');
  assert.equal(BF.store.state.player.level, 12);
});

test('test_earn_credits_balance_and_writes_ledger_entry', () => {
  const { BF } = bootDefault();
  const tx = BF.economy.earn(250, 'Unit test reward', 'game');
  assert.ok(tx);
  assert.equal(BF.economy.balance(), 1750);
  const last = BF.store.state.transactions[BF.store.state.transactions.length - 1];
  assert.equal(last.amount, 250);
  assert.equal(last.balance, 1750);
  assert.equal(last.cat, 'game');
});

test('test_earn_rejects_non_positive_amounts', () => {
  const { BF } = bootDefault();
  assert.equal(BF.economy.earn(0, 'zero'), null);
  assert.equal(BF.economy.earn(-10, 'negative'), null);
  assert.equal(BF.economy.earn('abc', 'nan'), null);
  assert.equal(BF.economy.balance(), 1500);
});

test('test_spend_insufficient_fails_without_side_effects', () => {
  const { BF } = bootDefault();
  const before = BF.store.state.transactions.length;
  const r = BF.economy.spend(99999, 'Too expensive');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'insufficient');
  assert.equal(r.need, 99999 - 1500);
  assert.equal(BF.economy.balance(), 1500);
  assert.equal(BF.store.state.transactions.length, before);
});

test('test_spend_debits_and_tracks_lifetime_spent', () => {
  const { BF } = bootDefault();
  const spentBefore = BF.store.state.wallet.lifetimeSpent;
  const r = BF.economy.spend(300, 'Test purchase');
  assert.equal(r.ok, true);
  assert.equal(BF.economy.balance(), 1200);
  assert.equal(BF.store.state.wallet.lifetimeSpent, spentBefore + 300);
});

test('test_xp_rolls_over_into_level_ups_with_rewards', () => {
  const { BF } = bootDefault();
  const lvl = BF.store.state.player.level;
  const need = BF.xpForLevel(lvl) - BF.store.state.player.xp;
  const bal = BF.economy.balance();
  const gained = BF.progression.addXP(need + BF.xpForLevel(lvl + 1), 'test');
  assert.deepEqual(Array.from(gained), [lvl + 1, lvl + 2]);
  assert.equal(BF.store.state.player.level, lvl + 2);
  assert.equal(BF.economy.balance(), bal + BF.levelReward(lvl + 1) + BF.levelReward(lvl + 2));
});

test('test_daily_reward_claims_once_per_day_and_follows_the_ladder', () => {
  const { BF } = bootDefault();
  assert.deepEqual(Array.from(BF.DAILY_REWARDS), [50, 75, 100, 150, 200, 300, 500]);
  BF.store.update('daily', (s) => { s.daily.lastClaimDay = null; s.daily.streak = 0; });
  const first = BF.daily.claim();
  assert.equal(first.ok, true);
  assert.equal(first.amount, 50);
  const again = BF.daily.claim();
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'claimed');
  // next calendar day continues the streak
  BF.clock.offsetDays = 1;
  const second = BF.daily.claim();
  assert.equal(second.ok, true);
  assert.equal(second.day, 2);
  assert.equal(second.amount, 75);
});
