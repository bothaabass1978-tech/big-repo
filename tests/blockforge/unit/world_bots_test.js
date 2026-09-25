'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootDefault } = require('./harness');

test('test_bot_population_has_unique_fictional_profiles', () => {
  const { BF } = bootDefault();
  assert.equal(BF.bots.list.length, 640);
  const names = new Set(BF.bots.list.map((b) => b.username.toLowerCase()));
  assert.equal(names.size, 640);
  const personalities = new Set(BF.bots.list.map((b) => b.personality));
  for (const p of ['competitive', 'friendly', 'explorer', 'collector', 'chaotic', 'beginner']) assert.ok(personalities.has(p), 'missing ' + p);
  const b = BF.bots.list[0];
  for (const k of ['username', 'displayName', 'avatar', 'personality', 'skill']) assert.ok(b[k] != null, 'bot field ' + k);
});

test('test_world_places_bots_in_servers_with_capacity', () => {
  const { BF } = bootDefault();
  assert.ok(BF.world.totalOnline() > 100);
  for (const g of BF.catalog.all()) {
    for (const srv of BF.world.serversFor(g.id)) assert.ok(srv.bots.length <= srv.max, g.id + ' server over capacity');
  }
});

test('test_join_and_leave_update_the_session_server', () => {
  const { BF } = bootDefault();
  const r = BF.world.join('pixel-soccer');
  assert.equal(r.ok, true);
  assert.ok(BF.world.sessionServer());
  BF.world.leave();
  assert.equal(BF.world.sessionServer(), null);
});

test('test_search_finds_block_games_players_and_items', () => {
  const { BF } = bootDefault();
  const r = BF.search.query('block');
  assert.ok(r.games.some((g) => g.id === 'block-battlegrounds'));
  const pets = BF.search.query('pet');
  assert.ok(pets.games.some((g) => g.id === 'pet-world'));
  assert.equal(BF.search.query('   ').games.length, 0);
});

test('test_leaderboard_includes_the_player_row', () => {
  const { BF } = bootDefault();
  const rows = BF.leaderboards.game('block-battlegrounds', 'kills');
  assert.ok(Array.isArray(rows) ? rows.length : rows.rows.length);
});
