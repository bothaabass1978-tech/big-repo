'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootDefault } = require('./harness');

const stranger = (BF) => BF.bots.list.find((b) => !BF.friends.isFriend(b.id) && !BF.friends.isBlocked(b.id) && !BF.friends.hasIncoming(b.id) && !BF.friends.hasOutgoing(b.id));

test('test_default_account_has_8_friends_23_followers_15_following', () => {
  const { BF } = bootDefault();
  const s = BF.store.state.social;
  assert.equal(s.friends.length, 8);
  assert.equal(s.followers.length, 23);
  assert.equal(s.following.length, 15);
});

test('test_incoming_request_can_be_accepted', () => {
  const { BF } = bootDefault();
  const b = stranger(BF);
  BF.friends.receiveRequest(b.id);
  assert.ok(BF.friends.hasIncoming(b.id));
  BF.friends.accept(b.id);
  assert.ok(BF.friends.isFriend(b.id));
  assert.ok(!BF.friends.hasIncoming(b.id));
});

test('test_declined_request_does_not_add_friend', () => {
  const { BF } = bootDefault();
  const b = stranger(BF);
  BF.friends.receiveRequest(b.id);
  BF.friends.decline(b.id);
  assert.ok(!BF.friends.isFriend(b.id));
  assert.ok(!BF.friends.hasIncoming(b.id));
});

test('test_block_removes_friendship_and_prevents_messages', () => {
  const { BF } = bootDefault();
  const friendId = BF.store.state.social.friends[0];
  BF.friends.block(friendId);
  assert.ok(BF.friends.isBlocked(friendId));
  assert.ok(!BF.friends.isFriend(friendId));
  const r = BF.messages.send(friendId, 'hello?');
  assert.equal(r.ok, false);
  BF.friends.unblock(friendId);
  assert.ok(!BF.friends.isBlocked(friendId));
});

test('test_message_to_friend_is_stored_in_conversation', () => {
  const { BF } = bootDefault();
  const friendId = BF.store.state.social.friends[0];
  const r = BF.messages.send(friendId, 'Want to play Pixel Soccer?');
  assert.equal(r.ok, true);
  const convo = BF.messages.get(friendId);
  assert.equal(convo.msgs[convo.msgs.length - 1].text, 'Want to play Pixel Soccer?');
});

test('test_received_message_counts_as_unread_until_read', () => {
  const { BF } = bootDefault();
  const friendId = BF.store.state.social.friends[1];
  BF.messages.markRead(friendId);
  const before = BF.messages.unreadCount();
  BF.messages.receive(friendId, 'gg!');
  assert.equal(BF.messages.unreadCount(), before + 1);
  BF.messages.markRead(friendId);
  assert.equal(BF.messages.unreadCount(), before);
});
