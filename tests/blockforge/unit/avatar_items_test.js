'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { bootDefault, ROOT } = require('./harness');

// every look the 3D rig draws: `case 'x'` branches, shirt art keys and the shoulder/back defaults
const RIG_SRC = fs.readFileSync(path.join(ROOT, 'js/engine/avatar3d.js'), 'utf8');
const RIG_STYLES = new Set([...RIG_SRC.matchAll(/case '([a-z0-9]+)'/g)].map((m) => m[1]));
for (const m of RIG_SRC.matchAll(/^\s{4}([a-z]+): \(g/gm)) RIG_STYLES.add(m[1]);
for (const m of RIG_SRC.matchAll(/(?:style|shape|st) === '([a-z]+)'/g)) RIG_STYLES.add(m[1]);
for (const s of ['cat', 'backpack', 'short', 'jeans', 'sneaker', 'block', 'bomber', 'glasses']) RIG_STYLES.add(s);

const fresh = (BF) => BF.ITEM_LIST.filter((i) => i.fresh);
const PRICE_BANDS = { common: [55, 160], uncommon: [160, 380], rare: [380, 950], epic: [950, 2600], legendary: [2600, 6500], mythic: [8000, 22000] };

test('test_avatar_items_extended_catalog_adds_hundreds_of_wearables', () => {
  const { BF } = bootDefault();
  const added = fresh(BF);
  assert.ok(added.length >= 500, 'only ' + added.length + ' new items');
  const cats = new Set(added.map((i) => i.cat));
  for (const c of ['hat', 'hair', 'face', 'head', 'shirt', 'pants', 'jacket', 'shoes', 'back', 'neck', 'shoulder', 'accessory', 'bundle']) assert.ok(cats.has(c), 'no new ' + c);
});

test('test_avatar_items_ids_and_names_are_unique', () => {
  const { BF } = bootDefault();
  const ids = BF.ITEM_LIST.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  const names = BF.ITEM_LIST.map((i) => i.name);
  assert.equal(new Set(names).size, names.length, 'duplicate item names confuse chat and search');
  assert.equal(Object.keys(BF.ITEMS).length, BF.ITEM_LIST.length);
});

test('test_avatar_items_orders_continue_after_the_handwritten_catalog', () => {
  const { BF } = bootDefault();
  const orders = BF.ITEM_LIST.map((i) => i.order);
  assert.equal(new Set(orders).size, orders.length);
  const lastHand = Math.max(...BF.ITEM_LIST.filter((i) => !i.fresh && !['hat_aurora_tiara', 'sh_starlight_owl', 'back_prism_guitar', 'hat_obsidian_knight'].includes(i.id)).map((i) => i.order));
  assert.ok(fresh(BF).every((i) => i.order > lastHand));
});

test('test_avatar_items_every_new_look_is_drawn_by_the_3d_rig', () => {
  const { BF } = bootDefault();
  for (const i of fresh(BF).filter((x) => x.cat !== 'bundle')) {
    const style = i.look.style || i.look.shape;
    assert.ok(style, i.id + ' has no style');
    assert.ok(RIG_STYLES.has(style), i.id + ' uses unknown style ' + style);
    assert.ok(BF.ITEM_CATS[i.cat].slot, i.id + ' is not wearable');
    if (i.cat !== 'face') assert.match(i.look.c1, /^#[0-9a-f]{6}$/, i.id + ' colour');
  }
});

test('test_avatar_items_prices_follow_the_rarity_bands', () => {
  const { BF } = bootDefault();
  for (const i of fresh(BF).filter((x) => x.cat !== 'bundle' && !x.limitedStock)) {
    const band = PRICE_BANDS[i.rarity];
    assert.ok(band, i.id + ' generated at ' + i.rarity);
    assert.ok(i.price >= band[0] && i.price <= band[1], i.id + ' costs ' + i.price + ' as ' + i.rarity);
  }
  // prices are stable between loads
  const again = bootDefault().BF;
  assert.equal(again.ITEMS.hat_tophat_ember ? again.ITEMS.hat_tophat_ember.price : 0, BF.ITEMS.hat_tophat_ember ? BF.ITEMS.hat_tophat_ember.price : 0);
});

test('test_avatar_items_premium_dyes_raise_rarity', () => {
  const { BF } = bootDefault();
  const rank = (id) => BF.RARITY[BF.ITEMS[id].rarity].rank;
  const tophats = fresh(BF).filter((i) => i.look.style === 'tophat');
  const byTheme = (t) => tophats.find((i) => i.id.endsWith('_' + t));
  const everyday = tophats.find((i) => BF.ITEM_THEMES[i.id.split('_').pop()][3] === 0);
  const cosmic = tophats.find((i) => BF.ITEM_THEMES[i.id.split('_').pop()][3] === 3);
  assert.ok(everyday && cosmic && byTheme(cosmic.id.split('_').pop()));
  assert.equal(rank(cosmic.id) - rank(everyday.id), 3);
  assert.ok(cosmic.look.glow || !BF.ITEM_THEMES[cosmic.id.split('_').pop()][5]);
});

test('test_avatar_items_new_bundles_contain_real_items_at_a_discount', () => {
  const { BF } = bootDefault();
  const bundles = fresh(BF).filter((i) => i.cat === 'bundle');
  assert.ok(bundles.length >= 6);
  for (const b of bundles) {
    const parts = b.contents.map((id) => BF.ITEMS[id]);
    assert.ok(parts.every(Boolean), b.id + ' has a missing part');
    assert.equal(new Set(parts.map((p) => BF.ITEM_CATS[p.cat].slot)).size, parts.length, b.id + ' puts two items in one slot');
    const sum = parts.reduce((s, p) => s + p.price, 0);
    assert.ok(b.price < sum, b.id + ' is not a discount');
    assert.ok(parts.every((p) => BF.RARITY[p.rarity].rank <= BF.RARITY[b.rarity].rank), b.id + ' is rarer inside than its label');
  }
});

test('test_avatar_items_new_limited_drops_join_the_limited_market', () => {
  const { BF } = bootDefault();
  const ids = BF.limiteds.list().map((i) => i.id);
  for (const id of ['hat_aurora_tiara', 'sh_starlight_owl', 'back_prism_guitar', 'hat_obsidian_knight']) assert.ok(ids.includes(id), id);
});

test('test_avatar_items_can_be_bought_and_worn', () => {
  const { BF } = bootDefault();
  const item = fresh(BF).filter((i) => i.cat === 'shoulder' && i.price <= BF.economy.balance()).sort((a, b) => a.price - b.price)[0];
  const r = BF.inventory.buy(item.id);
  assert.equal(r.ok, true);
  BF.avatar.equip(item.id);
  assert.equal(BF.store.state.avatar.equipped.shoulder, item.id);
});

test('test_avatar_items_bots_wear_items_from_the_extended_catalog', () => {
  const { BF } = bootDefault();
  const worn = new Set();
  for (const b of BF.bots.list) for (const id of Object.values(b.avatar.equipped)) if (id) worn.add(id);
  assert.ok([...worn].some((id) => BF.ITEMS[id] && BF.ITEMS[id].fresh), 'no bot wears a new item');
  assert.ok([...worn].every((id) => BF.ITEMS[id]), 'bots wear unknown items');
});
