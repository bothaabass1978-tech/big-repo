'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootDefault } = require('./harness');

test('test_sleeping_servers_spell_the_word_in_order', () => {
  const { BF } = bootDefault();
  const letters = BF.catalog.all().map((g) => BF.secrets.sleeper(g.id)).filter(Boolean).sort((a, b) => a.index - b.index).map((s) => s.glyph).join('');
  assert.equal(letters.length, 5);
  assert.equal(BF.secrets.checkWord(letters), true);
  assert.equal(BF.secrets.checkWord(letters.toLowerCase() + ' '), true);
  assert.equal(BF.secrets.checkWord('FORGE'), false);
});

test('test_terminal_refuses_grants_while_locked', () => {
  const { BF } = bootDefault();
  assert.equal(BF.secrets.isUnlocked(), false);
  const r = BF.secrets.execute(1000);
  assert.equal(r.ok, false);
  assert.equal(BF.economy.balance(), 1500);
});

test('test_unlock_awards_badge_and_hidden_achievement_once', () => {
  const { BF } = bootDefault();
  assert.equal(BF.secrets.unlock(), true);
  assert.equal(BF.secrets.unlock(), false);
  assert.ok(BF.store.state.badges.forgecore_unlocked);
  assert.ok(BF.achievements.unlocked('forgecore'));
});

test('test_execute_grants_any_positive_amount_with_forgecore_ledger_entry', () => {
  const { BF } = bootDefault();
  BF.secrets.unlock();
  const bal = BF.economy.balance();
  const r = BF.secrets.execute('1,000,000');
  assert.equal(r.ok, true);
  assert.equal(r.amount, 1000000);
  assert.equal(BF.economy.balance(), bal + 1000000);
  const tx = BF.store.state.transactions.filter((t) => t.cat === 'forgecore').pop();
  assert.equal(tx.desc, 'FORGECORE');
  assert.equal(tx.amount, 1000000);
});

test('test_execute_rejects_zero_negative_and_non_numbers', () => {
  const { BF } = bootDefault();
  BF.secrets.unlock();
  for (const bad of ['0', '-5', 'abc', '', '1.5e']) assert.equal(BF.secrets.execute(bad).ok, false, 'input ' + JSON.stringify(bad));
});

test('test_unlock_persists_across_reload', () => {
  const first = bootDefault();
  first.BF.secrets.unlock();
  first.BF.store.save('test');
  const second = bootDefault({ storage: first.storage });
  assert.equal(second.BF.secrets.isUnlocked(), true);
});

test('test_rhythm_sequences_use_the_four_runes', () => {
  const { BF } = bootDefault();
  for (let i = 0; i < 50; i++) {
    const seq = BF.secrets.sequence(6);
    assert.equal(seq.length, 6);
    assert.ok(seq.every((v) => v >= 0 && v < BF.secrets.RUNES.length));
  }
});
