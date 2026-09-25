'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootDefault } = require('./harness');

function cheapestUnowned(BF, filter) {
  return BF.ITEM_LIST.filter((i) => i.price > 0 && !i.notForSale && !i.limited && i.cat !== 'bundle' && i.cat !== 'tool' && !BF.inventory.owns(i.id) && (!filter || filter(i))).sort((a, b) => a.price - b.price)[0];
}

test('test_catalog_has_at_least_50_items_across_all_rarities', () => {
  const { BF } = bootDefault();
  assert.ok(BF.ITEM_LIST.length >= 50);
  const rarities = new Set(BF.ITEM_LIST.map((i) => i.rarity));
  for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic']) assert.ok(rarities.has(r), 'missing rarity ' + r);
});

test('test_buy_item_deducts_price_and_adds_to_inventory', () => {
  const { BF } = bootDefault();
  const item = cheapestUnowned(BF);
  const bal = BF.economy.balance();
  const r = BF.inventory.buy(item.id);
  assert.equal(r.ok, true);
  assert.ok(BF.inventory.owns(item.id));
  assert.equal(BF.economy.balance(), bal - r.price);
});

test('test_buy_owned_item_is_refused', () => {
  const { BF } = bootDefault();
  const item = cheapestUnowned(BF);
  BF.inventory.buy(item.id);
  const r = BF.inventory.buy(item.id);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'owned');
});

test('test_buy_without_enough_coins_reports_shortfall', () => {
  const { BF } = bootDefault();
  const pricey = BF.ITEM_LIST.filter((i) => i.price > 1500 && !i.notForSale && !BF.inventory.owns(i.id))[0];
  const r = BF.inventory.buy(pricey.id);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'insufficient');
  assert.ok(!BF.inventory.owns(pricey.id));
});

test('test_equip_and_unequip_changes_avatar_slot', () => {
  const { BF } = bootDefault();
  const hat = cheapestUnowned(BF, (i) => i.cat === 'hat');
  BF.inventory.buy(hat.id);
  BF.avatar.equip(hat.id);
  assert.equal(BF.store.state.avatar.equipped.hat, hat.id);
  BF.avatar.unequip('hat');
  assert.ok(!BF.store.state.avatar.equipped.hat);
});

test('test_sell_item_refunds_part_of_price_and_removes_it', () => {
  const { BF } = bootDefault();
  const item = cheapestUnowned(BF, (i) => i.cat === 'hat');
  BF.inventory.buy(item.id);
  const bal = BF.economy.balance();
  const r = BF.inventory.sell(item.id);
  assert.equal(r.ok, true);
  assert.ok(r.value > 0 && r.value < item.price);
  assert.equal(BF.economy.balance(), bal + r.value);
  assert.ok(!BF.inventory.owns(item.id));
});

test('test_game_pass_purchase_enables_its_effect', () => {
  const { BF } = bootDefault();
  const pass = BF.catalog.get('sky-obby').passes.find((p) => p.effect === 'double_jump');
  assert.equal(BF.passes.hasEffect('sky-obby', 'double_jump'), false);
  const r = BF.passes.buy(pass.id);
  assert.equal(r.ok, true);
  assert.equal(BF.passes.hasEffect('sky-obby', 'double_jump'), true);
  assert.equal(BF.passes.buy(pass.id).reason, 'owned');
});

test('test_consumable_product_grants_game_currency', () => {
  const { BF } = bootDefault();
  const r = BF.products.buy('pet-world', 'pw_petbucks');
  assert.equal(r.ok, true);
  assert.equal(BF.progressFor(BF.store.state, 'pet-world').custom.petbucks, 1000);
});
