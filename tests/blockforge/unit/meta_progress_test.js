'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootDefault } = require('./harness');

test('test_quest_and_achievement_catalogs_meet_minimums', () => {
  const { BF } = bootDefault();
  assert.ok(BF.QUESTS.length >= 20, 'quests ' + BF.QUESTS.length);
  assert.ok(BF.ACHIEVEMENTS.length >= 20, 'achievements ' + BF.ACHIEVEMENTS.length);
});

test('test_tracking_completes_quest_and_claim_pays_reward', () => {
  const { BF } = bootDefault();
  const active = BF.quests.active('daily');
  const q = active.find((x) => !x.def.game && !x.def.distinct && !x.inst.done && x.def.event !== 'coins_earned');
  assert.ok(q, 'an untargeted daily quest exists');
  BF.quests.track(q.def.event, q.def.target, {});
  const inst = BF.store.state.quests.daily.list.find((i) => i.id === q.def.id);
  assert.equal(inst.done, true);
  const bal = BF.economy.balance();
  const r = BF.quests.claim('daily', q.def.id);
  assert.equal(r.ok, true);
  assert.ok(BF.economy.balance() >= bal + q.def.reward);
  assert.equal(BF.quests.claim('daily', q.def.id).reason, 'claimed');
});

test('test_game_specific_quest_ignores_other_games', () => {
  const { BF } = bootDefault();
  BF.store.update('quests', (s) => { s.quests.daily.list.push({ id: 'd_hatch3', progress: 0, done: false, claimed: false, seen: [] }); });
  BF.quests.track('hatch', 3, { gameId: 'mega-miners' });
  const inst = BF.store.state.quests.daily.list.find((i) => i.id === 'd_hatch3');
  assert.equal(inst.progress, 0);
  BF.quests.track('hatch', 3, { gameId: 'pet-world' });
  assert.equal(inst.done, true);
});

test('test_achievement_unlock_is_once_and_pays_coins', () => {
  const { BF } = bootDefault();
  const def = BF.ACHIEVEMENTS.find((a) => !BF.achievements.unlocked(a.id) && a.reward.coins > 0 && !a.secret);
  const bal = BF.economy.balance();
  assert.equal(BF.achievements.unlock(def.id), true);
  assert.equal(BF.achievements.unlock(def.id), false);
  assert.ok(BF.economy.balance() >= bal + def.reward.coins);
});

test('test_secret_achievement_is_hidden_until_unlocked', () => {
  const { BF } = bootDefault();
  const fc = BF.ACHIEVEMENT_MAP.forgecore;
  assert.equal(fc.secret, true);
  assert.equal(fc.hiddenName, '???');
  const row = BF.achievements.list().find((a) => a.def ? a.def.id === 'forgecore' : a.id === 'forgecore');
  assert.ok(row);
});

test('test_badges_award_once_and_belong_to_their_game', () => {
  const { BF } = bootDefault();
  assert.ok(BF.badges.has('so_finish'), 'sample account starts with Cloud Walker');
  assert.equal(BF.badges.award('so_finish'), false);
  assert.equal(BF.badges.award('so_speedrun'), true);
  assert.equal(BF.badges.award('so_speedrun'), false);
  assert.equal(BF.badges.def('so_speedrun').gameId, 'sky-obby');
});
