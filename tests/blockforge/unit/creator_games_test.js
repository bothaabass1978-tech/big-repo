'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootDefault } = require('./harness');

const base = { name: 'Lava Leap Test', description: 'A test obby.', genre: 'Obby', maxPlayers: 12, template: 'obby', thumbnail: { color: '#ff7a2e', pattern: 'grid' }, visibility: 'public', difficulty: 'hard' };

test('test_validation_rejects_short_names_and_official_names', () => {
  const { BF } = bootDefault();
  assert.ok(BF.creator.validate(Object.assign({}, base, { name: 'ab' })).name);
  assert.ok(BF.creator.validate(Object.assign({}, base, { name: 'Sky Obby' })).name);
  assert.ok(BF.creator.validate(Object.assign({}, base, { maxPlayers: 99 })).maxPlayers);
  assert.equal(Object.keys(BF.creator.validate(base)).length, 0);
});

test('test_create_publish_unpublish_delete_lifecycle', () => {
  const { BF } = bootDefault();
  const r = BF.creator.create(base);
  assert.equal(r.ok, true);
  const id = r.game.id;
  assert.ok(!BF.catalog.all().some((g) => g.id === id), 'unpublished games stay out of the public catalog');
  assert.equal(BF.creator.publish(id).ok, true);
  const listing = BF.catalog.get(id);
  assert.equal(listing.gameType, 'obby');
  assert.equal(listing.config.custom, true);
  assert.equal(listing.config.difficulty, 'hard');
  assert.ok(BF.catalog.all().some((g) => g.id === id));
  assert.equal(BF.creator.unpublish(id).ok, true);
  assert.ok(!BF.catalog.all().some((g) => g.id === id));
  assert.equal(BF.creator.remove(id).ok, true);
  assert.equal(BF.creator.get(id), null);
});

test('test_every_template_maps_to_a_registered_game_type', () => {
  const { BF } = bootDefault();
  const types = { arena: 'arena', racing: 'racing', obby: 'obby', simulator: 'miner', towerdefense: 'towerdefense' };
  for (const [tpl, type] of Object.entries(types)) assert.equal(BF.creator.TEMPLATES[tpl].gameType, type);
});
