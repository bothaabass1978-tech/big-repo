'use strict';
/**
 * Round 5 systems: pop-up controls, ad pacing, pass pricing, the creator
 * economy, bot voices, bot-made games and their ads.
 * Story: BLOCKFORGE-015
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootDefault } = require('./harness');

const DAY = 86400000;

// ------------------------------------------------------------------ pop-ups

test('test_popups_follow_mode_dnd_and_in_game_settings', () => {
  const { BF } = bootDefault();
  const ns = BF.store.state.settings.notifications;
  const sale = { type: 'update' }, invite = { type: 'invite' }, friendReq = { type: 'friend', action: {} };
  assert.equal(BF.notify.allowsPopup(sale, false), true);
  ns.popupMode = 'important';
  assert.equal(BF.notify.allowsPopup(sale, false), false, 'sales are not important');
  assert.equal(BF.notify.allowsPopup(invite, false), true);
  ns.popupMode = 'all';
  assert.equal(BF.notify.allowsPopup(sale, true), false, 'quiet while playing by default');
  assert.equal(BF.notify.allowsPopup(friendReq, true), true);
  BF.notify.toggleDnd(true);
  assert.equal(BF.notify.allowsPopup(invite, false), false);
  assert.equal(BF.notify.allowsBanner(), false);
  assert.equal(BF.notify.toggleDnd(), false);
  assert.equal(BF.notify.allowsBanner(), true);
});

test('test_old_saves_with_popups_off_migrate_to_off_mode', () => {
  const sb = bootDefault();
  const { BF } = sb;
  BF.store.state.settings.notifications.popups = false;
  delete BF.store.state.settings.notifications.popupMode;
  BF.store.save('test');
  const again = bootDefault({ storage: sb.storage });
  assert.equal(again.BF.store.state.settings.notifications.popupMode, 'off');
});

// ------------------------------------------------------------------ ads + passes

test('test_burst_campaign_spends_its_budget_in_about_30_seconds', () => {
  const { BF } = bootDefault();
  const r = BF.creator.create({ name: 'Burst Test', description: 'x', genre: 'Obby', maxPlayers: 8, template: 'obby', visibility: 'public', difficulty: 'normal' });
  BF.creator.publish(r.game.id);
  BF.economy.earn(5000, 'test', 'test');
  const c = BF.ads.create({ gameId: r.game.id, headline: 'Play my burst test now!', tier: 'standard', placements: ['home'], budget: 2000, pace: 'burst' });
  assert.equal(c.ok, true, JSON.stringify(c.errors));
  for (let t = 0; t < 40 && c.campaign.status === 'active'; t += 4) BF.ads.simulate(4);
  assert.ok(c.campaign.spent >= 2000 * 0.95, 'spent ' + c.campaign.spent);
  const slow = { budget: 2000, tier: 'standard', pace: 'steady', placements: ['home'] };
  assert.ok(BF.ads.impressionsFor(slow, 4, 0.5) < BF.ads.impressionsFor(Object.assign({}, slow, { pace: 'burst' }), 4, 0.5) / 50);
});

test('test_passes_can_cost_far_more_than_100k_and_sell_less_often', () => {
  const { BF } = bootDefault();
  const r = BF.creator.create({ name: 'Whale Game', description: 'x', genre: 'Obby', maxPlayers: 8, template: 'obby', visibility: 'public', difficulty: 'normal' });
  assert.equal(BF.creator.addPass(r.game.id, { name: 'Golden Throne', price: 5000000, effect: 'vip' }).ok, true);
  assert.equal(BF.creator.addPass(r.game.id, { name: 'Too Much', price: BF.creator.MAX_PASS_PRICE + 1, effect: 'vip' }).ok, false);
  const d = (p) => BF.creator.passDemand(p, 0.8);
  assert.ok(d(100) > d(1000) && d(1000) > d(100000) && d(100000) > d(5000000));
  assert.ok(d(5000000) > 0);
});

// ------------------------------------------------------------------ creator economy

test('test_studio_owners_earn_billions_and_top_the_richest_board', () => {
  const { BF } = bootDefault();
  const studios = BF.creatorEconomy.studios();
  assert.ok(studios.length >= 20);
  assert.ok(studios[0].lifetime > 1e9, 'top studio ' + studios[0].lifetime);
  assert.ok(studios.every((s) => s.owner && s.team.length >= 2));
  const owners = new Set(studios.map((s) => s.owner.id));
  assert.equal(owners.size, studios.length, 'one owner per studio');
  const rich = BF.leaderboards.global('coins');
  assert.ok(owners.has(rich.rows[0].id), 'the richest player owns a studio');
  assert.ok(rich.you.rank > 50, 'a new player is nowhere near the top');
  assert.ok(BF.bots.stats(studios[0].owner).coins > 1e8);
});

test('test_top_creators_board_includes_studios_bot_creators_and_you', () => {
  const { BF } = bootDefault();
  BF.botGames.tick(Date.now());
  const lb = BF.creatorEconomy.topCreators(200);
  assert.ok(lb.rows.some((r) => r.kind === 'studio'));
  assert.ok(lb.rows.some((r) => r.kind === 'bot'));
  assert.ok(lb.you, 'you are ranked');
});

test('test_live_visits_grow_with_time', () => {
  const { BF } = bootDefault();
  const now = Date.now();
  const a = BF.world.liveVisits('block-battlegrounds', now);
  const b = BF.world.liveVisits('block-battlegrounds', now + 60000);
  assert.ok(b - a > 10000, 'visits per minute ' + (b - a));
});

// ------------------------------------------------------------------ voices

test('test_bot_voice_is_stable_and_keeps_safety_lines_whole', () => {
  const { BF } = bootDefault();
  const bot = BF.bots.list[42];
  assert.equal(JSON.stringify(BF.voice.profile(bot)), JSON.stringify(BF.voice.profile(bot)));
  const fixed = () => 0.999;
  const parts = BF.voice.parts(bot, 'Hey there. That was a really fun round. Want to play again?', { rng: fixed });
  assert.ok(parts.length >= 1);
  const safe = BF.voice.parts(bot, 'Please keep personal info private. Stay safe!', { serious: true });
  assert.equal(safe.length, 1);
  assert.match(safe[0].toLowerCase(), /personal info private/);
  const name = BF.store.state.player.displayName.split(' ')[0];
  const line = BF.voice.say(BF.bots.list.find((b) => BF.voice.profile(b).lower), 'Nice one ' + name + ' that was great', { rng: fixed });
  assert.ok(line.includes(name), 'player name keeps its capitals: ' + line);
});

test('test_bots_banter_with_each_other', () => {
  const { BF } = bootDefault();
  const [a, b] = BF.bots.list.slice(3, 5);
  const reply = BF.chat.banter(a, b, 'anyone good here? 1v1 me');
  assert.ok(typeof reply === 'string' && reply.length > 0);
});

// ------------------------------------------------------------------ bot games

test('test_bot_games_seed_rise_plateau_and_fade', () => {
  const { BF } = bootDefault();
  const now = Date.now();
  BF.botGames.tick(now);
  const list = BF.botGames.list();
  assert.equal(list.length, BF.botGames.T.seed);
  assert.ok(list.every((g) => g.botGame && g.gameType));
  const L = BF.botGames.life;
  assert.ok(L(60000) < L(30 * 60000), 'rising at first');
  assert.equal(L(3 * DAY), 1);
  assert.ok(L(60 * DAY) < 0.5, 'fading later');
  const g = list[0];
  assert.equal(BF.catalog.get(g.id).id, g.id, 'catalog finds bot games');
  assert.ok(BF.catalog.all().some((x) => x.id === g.id));
  const s = BF.catalog.stats(g.id);
  assert.ok(s.visits > 0 && s.approval > 0);
});

test('test_bot_release_notifies_followers_and_adds_a_playable_listing', () => {
  const { BF } = bootDefault();
  const now = Date.now();
  BF.botGames.tick(now);
  const bot = BF.bots.list.find((b) => !b.handcrafted && b.level > 10);
  BF.friends.follow(bot.id);
  const before = BF.store.state.notifications.length;
  const g = BF.botGames.release(now + 1000, () => 0.3, bot);
  assert.ok(g && g.botGame);
  assert.equal(g.creatorId, bot.id);
  assert.ok(BF.store.state.notifications.length > before, 'followers hear about it');
  assert.ok(BF.botGames.byCreator(bot.id).some((x) => x.id === g.id));
  assert.ok(BF.botGames.feed(3)[0].text.includes(g.name));
  assert.ok(['arena', 'racing', 'obby', 'miner', 'towerdefense', 'custom', 'runner', 'party', 'tag', 'fishing', 'farm', 'restaurant', 'flight', 'golf', 'spooky', 'quiz'].includes(g.gameType));
});

test('test_bot_ads_show_in_sponsored_slots_and_creators_get_rich', () => {
  const { BF } = bootDefault();
  const now = Date.now();
  BF.botGames.tick(now);
  const rec = BF.store.state.botGames.list[0];
  rec.ad = { until: now + 60000, bid: 99, headline: 'Play it now', placements: ['home'], budget: 1000 };
  const sp = BF.ads.sponsored('home', 3);
  assert.ok(sp.some((x) => x.gameId === rec.id), 'bot campaign is in the sponsored row');
  const before = BF.botGames.earningsOf(rec.botId);
  rec.visits += 1e6;
  assert.ok(BF.botGames.earningsOf(rec.botId) > before);
  assert.ok(BF.creatorEconomy.wealthOf(rec.botId) >= BF.botGames.earningsOf(rec.botId));
});

test('test_bot_games_persist_in_the_save', () => {
  const sb = bootDefault();
  sb.BF.botGames.tick(Date.now());
  const ids = sb.BF.botGames.list().map((g) => g.id).sort();
  sb.BF.store.save('test');
  const again = bootDefault({ storage: sb.storage });
  assert.equal(JSON.stringify(again.BF.botGames.list().map((g) => g.id).sort()), JSON.stringify(ids));
});
