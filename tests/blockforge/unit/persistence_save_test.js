'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootDefault, createSandbox } = require('./harness');

test('test_state_survives_a_reload_from_storage', () => {
  const first = bootDefault();
  first.BF.economy.earn(777, 'Persist me', 'game');
  first.BF.store.save('test');
  const second = bootDefault({ storage: first.storage });
  assert.equal(second.BF.economy.balance(), 1500 + 777);
});

test('test_export_then_import_restores_the_save', () => {
  const { BF } = bootDefault();
  const snapshot = JSON.parse(JSON.stringify(BF.store.exportData()));
  BF.economy.spend(1000, 'Lose some');
  assert.equal(BF.economy.balance(), 500);
  const r = BF.store.importData(snapshot);
  assert.equal(r.ok, true);
  assert.equal(BF.economy.balance(), 1500);
});

test('test_import_rejects_foreign_or_broken_json', () => {
  const { BF } = bootDefault();
  assert.equal(BF.store.validateImport(null).ok, false);
  assert.equal(BF.store.validateImport({ hello: 'world' }).ok, false);
  assert.equal(BF.store.validateImport({ format: BF.SAVE_FORMAT, version: 999, state: {} }).ok, false);
  assert.equal(BF.store.validateImport({ format: BF.SAVE_FORMAT, version: BF.SAVE_VERSION, state: { player: {} } }).ok, false);
});

test('test_reset_account_restores_starting_values', () => {
  const { BF } = bootDefault();
  BF.economy.spend(1200, 'Spend it');
  BF.store.resetAccount();
  assert.equal(BF.economy.balance(), 1500);
  assert.equal(BF.store.state.player.level, 12);
});

test('test_accounts_are_local_profiles_without_credentials', () => {
  const { BF } = createSandbox();
  BF.accounts.ensureDefault();
  assert.ok(BF.accounts.validateUsername('ab'));
  assert.ok(BF.accounts.validateUsername('admin'));
  assert.equal(BF.accounts.validateUsername('Brick_Builder'), null);
  const acc = BF.accounts.create('Brick_Builder', 'Brick Builder');
  const stored = JSON.stringify(BF.accounts.index());
  assert.ok(!/password|token|secret/i.test(stored));
  assert.ok(acc);
});
