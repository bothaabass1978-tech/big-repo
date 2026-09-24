/**
 * BlockForge — friends, followers, blocking and private messages.
 * Bot responses are scheduled locally; nothing leaves the device.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const MAX_MSGS = 200;
  const typing = new Set();

  const friends = (BF.friends = {
    list() {
      const s = BF.store.state;
      return s ? s.social.friends.map((id) => BF.bots.get(id)).filter(Boolean) : [];
    },
    isFriend(id) { return BF.store.state.social.friends.includes(id); },
    isBlocked(id) { return BF.store.state.social.blocked.includes(id); },
    hasOutgoing(id) { return BF.store.state.social.outgoing.some((r) => r.id === id); },
    hasIncoming(id) { return BF.store.state.social.incoming.some((r) => r.id === id); },
    isFollowing(id) { return BF.store.state.social.following.includes(id); },
    followsYou(id) { return BF.store.state.social.followers.includes(id); },

    /** Online / in-game / offline status for a bot. */
    status(id) {
      return BF.world.botStatus(id);
    },

    /** Send a friend request; the bot answers after a short delay. */
    sendRequest(id) {
      const bot = BF.bots.get(id);
      if (!bot) return { ok: false, error: 'Player not found.' };
      if (friends.isBlocked(id)) return { ok: false, error: 'Unblock ' + bot.displayName + ' first.' };
      if (friends.isFriend(id)) return { ok: false, error: 'You are already friends.' };
      if (friends.hasIncoming(id)) return friends.accept(id);
      if (friends.hasOutgoing(id)) return { ok: false, error: 'Request already sent.' };
      if (BF.store.state.social.friends.length >= 200) return { ok: false, error: 'Your friends list is full (200).' };
      BF.store.update('social', (s) => { s.social.outgoing.push({ id, at: BF.clock.now() }); });
      const delay = 1500 + Math.random() * 4000;
      setTimeout(() => friends.resolveOutgoing(id), delay);
      return { ok: true, pending: true };
    },

    /** Bot decides on a pending request (called by timer or the world tick). */
    resolveOutgoing(id) {
      const s = BF.store.state;
      if (!s || !friends.hasOutgoing(id)) return;
      const bot = BF.bots.get(id);
      const req = s.social.outgoing.find((r) => r.id === id);
      const accept = Math.random() < BF.PERSONALITIES[bot.personality].accept || req.retries >= 1;
      if (!accept) {
        BF.store.update('social', (st) => { const r = st.social.outgoing.find((x) => x.id === id); if (r) r.retries = (r.retries || 0) + 1; });
        return;
      }
      BF.store.update('social', (st) => {
        st.social.outgoing = st.social.outgoing.filter((r) => r.id !== id);
        if (!st.social.friends.includes(id)) st.social.friends.push(id);
        if (!st.social.followers.includes(id) && Math.random() < 0.6) st.social.followers.push(id);
      });
      BF.notify.push({ type: 'friend', title: bot.displayName + ' accepted your friend request', body: 'You are now friends. Say hi!', icon: 'userCheck', route: '#/messages/' + id });
      BF.quests.track('friend_added', 1);
      BF.bus.emit('friends:added', { bot });
      if (Math.random() < 0.55) setTimeout(() => BF.messages.receive(id, BF.dialogue.styleFor(bot, U.pick(BF.DIALOGUE.friend[bot.personality]))), 2500 + Math.random() * 4000);
    },

    /** A bot sends the player a request (world simulation). */
    receiveRequest(id) {
      const s = BF.store.state;
      const bot = BF.bots.get(id);
      if (!bot || s.settings.privacy.friendRequests === 'none') return false;
      if (friends.isFriend(id) || friends.isBlocked(id) || friends.hasIncoming(id) || friends.hasOutgoing(id)) return false;
      BF.store.update('social', (st) => { st.social.incoming.push({ id, at: BF.clock.now() }); });
      BF.notify.push({ type: 'friend', title: 'Friend request', body: bot.displayName + ' (@' + bot.username + ') wants to be your friend.', icon: 'userPlus', route: '#/friends/requests', action: { kind: 'friendRequest', id } });
      return true;
    },

    accept(id) {
      const bot = BF.bots.get(id);
      if (!bot || !friends.hasIncoming(id)) return { ok: false, error: 'No request from that player.' };
      BF.store.update('social', (s) => {
        s.social.incoming = s.social.incoming.filter((r) => r.id !== id);
        if (!s.social.friends.includes(id)) s.social.friends.push(id);
      });
      BF.quests.track('friend_added', 1);
      BF.bus.emit('friends:added', { bot });
      return { ok: true };
    },

    decline(id) {
      BF.store.update('social', (s) => { s.social.incoming = s.social.incoming.filter((r) => r.id !== id); });
      return { ok: true };
    },

    cancel(id) {
      BF.store.update('social', (s) => { s.social.outgoing = s.social.outgoing.filter((r) => r.id !== id); });
      return { ok: true };
    },

    remove(id) {
      BF.store.update('social', (s) => { s.social.friends = s.social.friends.filter((x) => x !== id); });
      return { ok: true };
    },

    block(id) {
      BF.store.update('social', (s) => {
        const so = s.social;
        so.friends = so.friends.filter((x) => x !== id);
        so.incoming = so.incoming.filter((r) => r.id !== id);
        so.outgoing = so.outgoing.filter((r) => r.id !== id);
        so.following = so.following.filter((x) => x !== id);
        so.followers = so.followers.filter((x) => x !== id);
        if (!so.blocked.includes(id)) so.blocked.push(id);
      });
      return { ok: true };
    },

    unblock(id) {
      BF.store.update('social', (s) => { s.social.blocked = s.social.blocked.filter((x) => x !== id); });
      return { ok: true };
    },

    follow(id) {
      if (friends.isBlocked(id)) return { ok: false };
      BF.store.update('social', (s) => { if (!s.social.following.includes(id)) s.social.following.push(id); });
      const bot = BF.bots.get(id);
      if (bot && Math.random() < 0.5) {
        setTimeout(() => {
          if (!BF.store.state || friends.followsYou(id)) return;
          BF.store.update('social', (s) => { s.social.followers.push(id); });
          BF.notify.push({ type: 'friend', title: bot.displayName + ' followed you back', body: '@' + bot.username + ' is now following you.', icon: 'users', route: '#/user/' + id });
        }, 3000 + Math.random() * 6000);
      }
      return { ok: true };
    },

    unfollow(id) {
      BF.store.update('social', (s) => { s.social.following = s.social.following.filter((x) => x !== id); });
      return { ok: true };
    },

    /** Remember who you played with. */
    recordRecent(botIds, gameId) {
      if (!botIds.length) return;
      BF.store.update('social', (s) => {
        const now = BF.clock.now();
        for (const id of botIds) {
          s.social.recent = s.social.recent.filter((r) => r.id !== id);
          s.social.recent.unshift({ id, gameId, ts: now });
        }
        if (s.social.recent.length > 40) s.social.recent.length = 40;
      });
    },
  });

  // ---------------------------------------------------------------- messages

  const messages = (BF.messages = {
    /** Conversations sorted by most recent activity. */
    conversations() {
      const s = BF.store.state;
      return Object.values(s.messages)
        .filter((c) => c.msgs && c.msgs.length)
        .map((c) => ({
          with: c.with,
          who: c.with === 'system' ? BF.SYSTEM_SENDER : BF.bots.get(c.with),
          last: c.msgs[c.msgs.length - 1],
          unread: c.msgs.filter((m) => m.from === 'them' && !m.read).length,
          updated: c.updated,
        }))
        .filter((c) => c.who)
        .sort((a, b) => b.updated - a.updated);
    },

    get(withId) {
      return BF.store.state.messages[withId] || null;
    },

    unreadCount() {
      const s = BF.store.state;
      if (!s) return 0;
      let n = 0;
      for (const c of Object.values(s.messages)) for (const m of c.msgs) if (m.from === 'them' && !m.read) n++;
      return n;
    },

    isTyping(withId) {
      return typing.has(withId);
    },

    canMessage(withId) {
      if (withId === 'system') return false;
      return !BF.friends.isBlocked(withId);
    },

    /** Send a message to a bot; it may reply after a pause. */
    send(withId, text) {
      text = String(text || '').trim();
      if (!text) return { ok: false, error: 'Type a message first.' };
      if (text.length > 500) return { ok: false, error: 'Messages can be up to 500 characters.' };
      if (!messages.canMessage(withId)) return { ok: false, error: 'You cannot message this player.' };
      const clean = BF.dialogue.filter(text);
      BF.store.update(['messages', 'player'], (s) => {
        const c = s.messages[withId] || (s.messages[withId] = { with: withId, msgs: [], updated: 0 });
        c.msgs.push({ id: U.uid('m'), from: 'me', text: clean, ts: BF.clock.now(), read: true });
        if (c.msgs.length > MAX_MSGS) c.msgs.splice(0, c.msgs.length - MAX_MSGS);
        c.updated = BF.clock.now();
        c.msgs.forEach((m) => { m.read = true; });
        s.player.stats.messagesSent += 1;
      });
      BF.quests.track('message_sent', 1);
      const bot = BF.bots.get(withId);
      if (bot) {
        const willReply = Math.random() < 0.9;
        if (willReply) {
          setTimeout(() => {
            typing.add(withId);
            BF.bus.emit('messages:typing', { with: withId, typing: true });
          }, 600 + Math.random() * 900);
          setTimeout(() => {
            typing.delete(withId);
            BF.bus.emit('messages:typing', { with: withId, typing: false });
            if (!BF.store.state || BF.friends.isBlocked(withId)) return;
            messages.receive(withId, BF.dialogue.dmReply(bot, clean), { quietIfOpen: true });
          }, 1900 + Math.random() * 2600);
        }
      }
      return { ok: true };
    },

    /**
     * Deliver a message from a bot (or the system account).
     * @param {string} withId
     * @param {string} text
     * @param {{invite?:string, quietIfOpen?:boolean}} [opts]
     */
    receive(withId, text, opts) {
      opts = opts || {};
      const s = BF.store.state;
      if (!s || BF.friends.isBlocked(withId)) return null;
      const openNow = BF.ui && BF.ui.currentConversation === withId;
      const msg = { id: U.uid('m'), from: 'them', text, ts: BF.clock.now(), read: !!openNow, invite: opts.invite || null };
      BF.store.update('messages', (st) => {
        const c = st.messages[withId] || (st.messages[withId] = { with: withId, msgs: [], updated: 0 });
        c.msgs.push(msg);
        if (c.msgs.length > MAX_MSGS) c.msgs.splice(0, c.msgs.length - MAX_MSGS);
        c.updated = msg.ts;
      });
      const who = withId === 'system' ? BF.SYSTEM_SENDER : BF.bots.get(withId);
      if (!openNow) {
        const game = opts.invite ? BF.catalog.get(opts.invite) : null;
        BF.notify.push({
          type: opts.invite ? 'invite' : 'bot',
          title: opts.invite ? who.displayName + ' invited you to ' + game.name : 'New message from ' + who.displayName,
          body: text,
          icon: opts.invite ? 'gamepad' : 'chat',
          route: '#/messages/' + withId,
          action: opts.invite ? { kind: 'invite', gameId: opts.invite, botId: withId } : null,
        });
      }
      BF.bus.emit('messages:received', { with: withId, msg });
      return msg;
    },

    markRead(withId) {
      const c = messages.get(withId);
      if (!c || !c.msgs.some((m) => !m.read)) return;
      BF.store.update('messages', () => c.msgs.forEach((m) => { m.read = true; }));
    },

    markUnread(withId) {
      const c = messages.get(withId);
      if (!c) return;
      const last = [...c.msgs].reverse().find((m) => m.from === 'them');
      if (last) BF.store.update('messages', () => { last.read = false; });
    },

    deleteMessage(withId, msgId) {
      BF.store.update('messages', (s) => {
        const c = s.messages[withId];
        if (!c) return;
        c.msgs = c.msgs.filter((m) => m.id !== msgId);
        if (!c.msgs.length) delete s.messages[withId];
      });
    },

    deleteConversation(withId) {
      BF.store.update('messages', (s) => { delete s.messages[withId]; });
    },
  });
})((window.BF = window.BF || {}));
