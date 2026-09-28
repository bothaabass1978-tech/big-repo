'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootDefault, createSandbox } = require('./harness');
const { createHub } = require('../mock_claude');

/** Deliver everything queued: hub deliveries, timers in every sandbox, microtasks. */
async function settle(hub, sbs) {
  for (let i = 0; i < 10; i++) {
    await hub.settle();
    for (const sb of sbs) sb.timers.flush();
    await new Promise((r) => setImmediate(r));
  }
}

/** A real person: their own BlockForge save, connected through the shared hub. */
async function player(hub, uid, name, o) {
  const sb = bootDefault();
  const { BF } = sb;
  BF.store.update('player', (s) => { s.player.username = name; s.player.displayName = name; });
  const c = hub.client(Object.assign({ uid }, o || {}));
  const ok = await BF.net.connect(c.claude);
  return { sb, BF, c, ok, name, key: null };
}

async function pair(o) {
  const hub = createHub();
  const a = await player(hub, 'u_alice', 'AliceForge', o && o.a);
  const b = await player(hub, 'u_bob', 'BobBuilds', o && o.b);
  await settle(hub, [a.sb, b.sb]);
  a.key = b.BF.net.key('u_alice');
  b.key = a.BF.net.key('u_bob');
  return { hub, a, b, all: [a.sb, b.sb] };
}

test('test_net_without_the_runtime_stays_off_and_blockforge_plays_solo', async () => {
  const { BF } = bootDefault();
  assert.equal(await BF.net.connect(), false);
  assert.equal(BF.net.state().state, 'off');
  assert.equal(BF.net.people().length, 0);
  assert.ok(BF.search.query('a', 10).players.length > 0, 'bots still searchable');
  assert.match(BF.net.request('rp-nobody').error, /not found/i);
});

test('test_net_real_players_find_each_other_by_username_and_in_search', async () => {
  const { hub, a, b } = await pair();
  assert.ok(a.ok && b.ok);
  assert.ok(hub.docs.has('p/u_alice') && hub.docs.has('p/u_bob'), 'each wrote their own player document');
  assert.equal(hub.docs.get('p/u_alice').profile.u, 'AliceForge');
  const found = b.BF.net.search('alice');
  assert.equal(found.length, 1);
  assert.equal(found[0].username, 'AliceForge');
  assert.equal(found[0].real, true);
  const r = b.BF.search.query('aliceforge', 10);
  assert.ok(r.players.some((p) => p.real && p.username === 'AliceForge'), 'global search lists the real player');
  assert.equal(b.BF.world.botStatus(a.key).state, 'online');
});

test('test_net_friend_request_accept_makes_both_friends_with_notifications', async () => {
  const { hub, a, b, all } = await pair();
  assert.equal(b.BF.net.request(a.key).ok, true);
  await settle(hub, all);
  assert.equal(a.BF.net.relation(b.key), 'incoming');
  assert.equal(b.BF.net.relation(a.key), 'outgoing');
  assert.ok(a.BF.store.state.notifications.some((n) => /real player/i.test(n.title)), 'request announced');
  assert.equal(a.BF.net.accept(b.key).ok, true);
  await settle(hub, all);
  assert.equal(a.BF.net.relation(b.key), 'friends');
  assert.equal(b.BF.net.relation(a.key), 'friends');
  assert.equal(b.BF.net.friends().length, 1);
  assert.ok(b.BF.store.state.notifications.some((n) => /now friends/.test(n.title)));
});

test('test_net_declined_or_removed_friends_do_not_come_back_as_requests', async () => {
  const { hub, a, b, all } = await pair();
  b.BF.net.request(a.key);
  await settle(hub, all);
  a.BF.net.decline(b.key);
  await settle(hub, all);
  assert.equal(a.BF.net.relation(b.key), 'none');
  assert.equal(b.BF.net.relation(a.key), 'outgoing', 'the sender still sees their request as sent');
  b.BF.net.request(a.key); // already outgoing
  a.BF.net.request(b.key);
  await settle(hub, all);
  assert.equal(a.BF.net.relation(b.key), 'friends');
  a.BF.net.unfriend(b.key);
  await settle(hub, all);
  assert.equal(a.BF.net.relation(b.key), 'none');
  assert.equal(b.BF.net.relation(a.key), 'outgoing');
});

test('test_net_messages_arrive_once_unread_and_replies_come_back', async () => {
  const { hub, a, b, all } = await pair();
  assert.equal(a.BF.net.send(b.key, 'hey want to play obby?').ok, true);
  await settle(hub, all);
  const th = b.BF.net.thread(a.key);
  assert.equal(th.msgs.length, 1);
  assert.equal(th.msgs[0].text, 'hey want to play obby?');
  assert.equal(b.BF.net.unreadCount(), 1);
  assert.ok(b.BF.messages.unreadCount() >= 1, 'counts in the Messages badge');
  b.BF.net.markRead(a.key);
  assert.equal(b.BF.net.unreadCount(), 0);
  b.BF.net.send(a.key, 'sure');
  await settle(hub, all);
  b.BF.net._process();
  assert.equal(b.BF.net.thread(a.key).msgs.length, 2, 'no duplicate after reprocessing');
  assert.equal(a.BF.net.thread(b.key).msgs.map((m) => m.from).join(','), 'me,them');
  assert.ok(b.BF.net.conversations().some((c) => c.with === a.key && c.real));
});

test('test_net_gifts_move_coins_once_and_confirm_delivery', async () => {
  const { hub, a, b, all } = await pair();
  assert.equal(a.BF.net.gift(b.key, 100).ok, false, 'friends only by default');
  a.BF.net.request(b.key);
  await settle(hub, all);
  b.BF.net.accept(a.key);
  await settle(hub, all);
  const a0 = a.BF.economy.balance(), b0 = b.BF.economy.balance();
  const r = a.BF.net.gift(b.key, 500);
  assert.equal(r.ok, true, r.error);
  await settle(hub, all);
  assert.equal(a.BF.economy.balance(), a0 - 500);
  assert.equal(b.BF.economy.balance(), b0 + 500);
  b.BF.net._process();
  a.BF.net._process();
  await settle(hub, all);
  assert.equal(b.BF.economy.balance(), b0 + 500, 'claimed exactly once');
  const g = a.BF.store.state.net.out.u_bob.gifts[0];
  assert.equal(a.BF.net.giftDelivered(b.key, g.id), true);
  assert.ok(b.BF.net.thread(a.key).msgs.some((m) => m.gift && m.gift.amount === 500));
  assert.equal(a.BF.net.gift(b.key, 10e9).ok, false);
});

test('test_net_a_second_device_does_not_claim_a_gift_again', async () => {
  const { hub, a, b, all } = await pair();
  a.BF.net.request(b.key); await settle(hub, all);
  b.BF.net.accept(a.key); await settle(hub, all);
  a.BF.net.gift(b.key, 300); await settle(hub, all);
  // Bob opens BlockForge on another device: a fresh save, same person
  const b2 = await player(hub, 'u_bob', 'BobBuilds');
  const start = b2.BF.economy.balance();
  await settle(hub, all.concat(b2.sb));
  assert.equal(b2.BF.economy.balance(), start, 'already claimed (listed in his own document)');
});

test('test_net_view_only_players_reach_others_through_presence', async () => {
  const { hub, a, b, all } = await pair({ b: { canWrite: false } });
  assert.equal(hub.docs.has('p/u_bob'), false, 'view-only: no document');
  assert.equal(a.BF.net.search('bob').length, 1, 'still found while online');
  assert.equal(b.BF.net.request(a.key).ok, true);
  b.BF.net.send(a.key, 'hi from a viewer');
  await settle(hub, all);
  assert.equal(a.BF.net.relation(b.key), 'incoming');
  assert.equal(a.BF.net.thread(b.key).msgs[0].text, 'hi from a viewer');
  assert.equal(b.BF.net.state().canWrite, false);
});

test('test_net_in_game_presence_lets_friends_join_the_same_server', async () => {
  const { hub, a, b, all } = await pair();
  a.BF.net.gameState({ g: 'block-battlegrounds', sv: '4242', pos: [120, 0, 300, 1.2, 1], sc: 10.5 });
  await settle(hub, all);
  const st = b.BF.net.status(a.key);
  assert.equal(st.state, 'ingame');
  assert.equal(st.gameId, 'block-battlegrounds');
  assert.equal(st.serverId, '4242');
  const here = b.BF.net.playersIn('block-battlegrounds', '4242');
  assert.equal(here.length, 1);
  assert.equal(here[0].pos.slice(0, 3).join(','), '120,0,300');
  const j = b.BF.world.join('block-battlegrounds', '4242');
  assert.equal(j.ok, true, 'a real player\'s server opens locally');
  assert.equal(j.server.id, '4242');
  a.BF.net.say('gg');
  await settle(hub, all);
  assert.equal(b.BF.net.playersIn('block-battlegrounds', '4242')[0].say.t, 'gg');
  a.BF.net.gameState(null);
  await settle(hub, all);
  assert.equal(b.BF.net.status(a.key).state, 'online');
});

test('test_net_invites_from_friends_are_announced_with_a_join_action', async () => {
  const { hub, a, b, all } = await pair();
  a.BF.net.request(b.key); await settle(hub, all);
  b.BF.net.accept(a.key); await settle(hub, all);
  a.BF.world.join('block-battlegrounds');
  const r = a.BF.net.invite(b.key);
  assert.equal(r.ok, true, r.error);
  await settle(hub, all);
  const n = b.BF.store.state.notifications.find((x) => x.type === 'invite');
  assert.ok(n, 'invite notification');
  assert.equal(n.action.gameId, 'block-battlegrounds');
  assert.equal(b.BF.net.isShared('block-battlegrounds', n.action.serverId), true);
});

test('test_net_players_leaving_go_offline_but_stay_remembered', async () => {
  const { hub, a, b, all } = await pair();
  a.BF.net.request(b.key); await settle(hub, all);
  b.BF.net.accept(a.key); await settle(hub, all);
  a.c.leave();
  await settle(hub, all);
  assert.equal(b.BF.net.status(a.key).state, 'offline');
  assert.equal(b.BF.net.friends().length, 1, 'friends list survives');
  assert.ok(b.BF.net.search('alice').length, 'offline players are still in the directory');
});

test('test_net_hostile_documents_are_ignored_or_clamped', async () => {
  const { hub, a, b, all } = await pair();
  hub.docs.set('p/u_mallory', { v: 1, uid: 'u_bob', profile: { u: 'Impostor' } }); // names someone else
  hub.docs.set('p/u_eve', { v: 9, uid: 'u_eve', profile: { u: 'Eve_1', dn: '<img src=x onerror=alert(1)>' + 'x'.repeat(500), lv: 1e9, av: { s: 'red;', e: ['nope', 'hat_retro', 'hat_beanie'] } }, to: { u_alice: { friend: true, at: 1, msgs: [{ id: 'bad id!', t: 'x' }, { id: 'm1', t: 'y'.repeat(5000), at: 2 }], gifts: [{ id: 'g1', n: 1e15 }] } } });
  hub.docs.set('p/u_bad', { v: 1, uid: 'u_bad', profile: { u: 'no spaces allowed' } });
  // wake the listeners with a harmless write
  a.BF.net.send(b.key, 'ping');
  await settle(hub, all);
  assert.equal(a.BF.net.search('impostor').length, 0);
  assert.equal(a.BF.net.search('no spaces').length, 0);
  const eve = a.BF.net.search('eve_1')[0];
  assert.ok(eve);
  assert.ok(eve.displayName.length <= 24);
  assert.ok(eve.level <= 999);
  assert.equal(eve.avatar.skin, a.BF.STARTER_SKIN);
  assert.equal(eve.avatar.equipped.hat, 'hat_retro', 'unknown items dropped, one per slot');
  const th = a.BF.net.thread(eve.id);
  assert.equal(th.msgs.length, 1);
  assert.ok(th.msgs[0].text.length <= 300);
  assert.equal(a.BF.store.state.net.claimed.length, 0, 'no gift from a stranger (friends only)');
});

test('test_net_invisible_players_are_not_listed', async () => {
  const { hub, a, b, all } = await pair();
  a.BF.store.update('settings', (s) => { s.settings.privacy.realPlayers = false; });
  await settle(hub, all);
  assert.equal(hub.docs.get('p/u_alice').hidden, true);
  assert.equal(hub.docs.get('p/u_alice').profile, undefined);
  b.BF.store.update('net', (s) => { delete s.net.people[a.key]; });
  b.BF.net._process();
  assert.equal(b.BF.net.search('alice').length, 0);
});

test('test_net_blocked_players_are_silenced', async () => {
  const { hub, a, b, all } = await pair();
  a.BF.net.block(b.key);
  b.BF.net.send(a.key, 'can you see this');
  b.BF.net.request(a.key);
  await settle(hub, all);
  assert.equal(a.BF.net.thread(b.key), null);
  assert.equal(a.BF.net.relation(b.key), 'blocked');
  assert.equal(a.BF.net.search('bob').length, 0);
});

test('test_net_saves_from_before_real_players_load_with_an_empty_slice', () => {
  const sb = createSandbox();
  const { BF } = sb;
  BF.accounts.ensureDefault();
  const acc = BF.accounts.list()[0];
  const fresh = BF.createInitialState(acc, { sample: true });
  delete fresh.net;
  delete fresh.settings.privacy.realPlayers;
  BF.storage.set('save:' + acc.id, fresh);
  BF.accounts.signIn(acc.id);
  const st = BF.store.load(acc.id);
  assert.equal(Object.keys(st.net).sort().join(','), 'blocked,claimed,out,people,seen,threads');
  assert.equal(st.settings.privacy.realPlayers, true);
  assert.equal(st.player.username, fresh.player.username, 'everything else kept');
});

test('test_fame_superstars_are_flooded_with_friend_requests_in_one_notification', () => {
  const { BF } = bootDefault();
  const real = BF.fame.me;
  BF.fame.me = () => Object.assign(real(), { tier: BF.fame.T.tiers.find((t) => t.id === 'superstar') });
  const before = BF.store.state.social.incoming.length;
  const notes = BF.store.state.notifications.length;
  let n = 0;
  for (let i = 0; i < 15; i++) n += BF.fame.requests(4);
  assert.ok(n >= 10, 'a minute as a Superstar brings many requests (' + n + ')');
  assert.equal(BF.store.state.social.incoming.length, before + n);
  assert.equal(BF.store.state.notifications.length, notes + 1, 'rolled into one notification');
  assert.match(BF.store.state.notifications[0].title, /new friend requests/);
  const r = BF.friends.acceptAll();
  assert.equal(r.ok, true);
  assert.equal(BF.store.state.social.incoming.length, 0);
  BF.fame.me = real;
});

test('test_fame_newcomers_get_no_extra_requests_and_privacy_stops_the_flood', () => {
  const { BF } = bootDefault();
  const real = BF.fame.me;
  BF.fame.me = () => Object.assign(real(), { tier: BF.fame.T.tiers[0] });
  assert.equal(BF.fame.requests(60), 0);
  BF.fame.me = () => Object.assign(real(), { tier: BF.fame.T.legend });
  BF.store.update('settings', (s) => { s.settings.privacy.friendRequests = 'none'; });
  assert.equal(BF.fame.requests(60), 0);
  BF.fame.me = real;
});

test('test_net_view_only_messages_wait_for_the_recipient_and_stop_after_delivery', async () => {
  const { hub, a, b, all } = await pair({ b: { canWrite: false } });
  a.c.leave(); // Alice closes BlockForge
  a.BF.net.disconnect();
  await settle(hub, all);
  b.BF.net.send(a.key, 'you there? message me back later');
  await settle(hub, all);
  // an hour later Alice is back (a fresh connection, same person)
  const a2 = hub.client({ uid: 'u_alice' });
  await a.BF.net.connect(a2.claude);
  await settle(hub, all);
  const th = a.BF.net.thread(b.key);
  assert.ok(th && th.msgs.some((m) => m.text === 'you there? message me back later'), 'delivered once both are online');
  assert.ok(a.BF.store.state.net.out.u_bob.got > 0, 'Alice acknowledges it');
  await settle(hub, all);
  const pres = hub.presenceOf('u_bob');
  assert.ok(Object.values(pres.to || {}).every((o) => !o.msgs), 'Bob stops resending what Alice already has');
  assert.ok(Object.keys(pres.to || {}).every((k) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(k)), 'presence keys are plain identifiers');
});
