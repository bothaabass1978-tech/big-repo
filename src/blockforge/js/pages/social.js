/**
 * BlockForge — Friends, Messages and Notifications pages.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const esc = U.esc;

  // ---------------------------------------------------------------- friends

  let findQ = '';

  function friendActions(b) {
    const st = BF.world.botStatus(b.id);
    return (st.state === 'ingame' ? '<button class="btn btn-xs btn-play" data-act="join-friend" data-bot="' + b.id + '">' + BF.icon('play', 11) + 'Join</button>' : '') +
      '<a class="btn btn-xs btn-outline" href="#/messages/' + b.id + '">' + BF.icon('chat', 13) + 'Message</a>' +
      '<button class="icon-btn sm" data-act="user-menu" data-bot="' + b.id + '" aria-label="More actions for ' + esc(b.displayName) + '">' + BF.icon('dots', 16) + '</button>';
  }

  BF.pages.register('friends', {
    title: 'Friends',
    nav: 'friends',
    watch: ['social'],
    render(params) {
      const s = BF.store.state;
      const so = s.social;
      const tab = params.tab || 'friends';
      const friends = BF.friends.list().map((b) => ({ b, st: BF.world.botStatus(b.id) }));
      const order = { ingame: 0, online: 1, offline: 2 };
      friends.sort((a, b) => order[a.st.state] - order[b.st.state] || a.b.displayName.localeCompare(b.b.displayName));
      const onlineCount = friends.filter((f) => f.st.state !== 'offline').length;
      const tabs = BF.ui.tabs([
        { id: 'friends', label: 'Friends', href: '#/friends', count: so.friends.length, icon: 'users' },
        { id: 'requests', label: 'Requests', href: '#/friends/requests', count: so.incoming.length, icon: 'userPlus' },
        { id: 'recent', label: 'Recently Played', href: '#/friends/recent', icon: 'history' },
        { id: 'followers', label: 'Followers', href: '#/friends/followers', count: so.followers.length },
        { id: 'following', label: 'Following', href: '#/friends/following', count: so.following.length },
        { id: 'blocked', label: 'Blocked', href: '#/friends/blocked', count: so.blocked.length, icon: 'block' },
        { id: 'find', label: 'Find Players', href: '#/friends/find', icon: 'search' },
      ], tab);
      let body = '';
      if (tab === 'friends') {
        body = friends.length ? '<div class="friend-summary"><span><span class="status-dot ingame"></span>' + friends.filter((f) => f.st.state === 'ingame').length + ' in game</span><span><span class="status-dot online"></span>' + friends.filter((f) => f.st.state === 'online').length + ' online</span><span><span class="status-dot offline"></span>' + (friends.length - onlineCount) + ' offline</span></div><div class="list panel tight">' + friends.map((f) => BF.ui.userRow(f.b, friendActions(f.b))).join('') + '</div>'
          : BF.ui.empty({ icon: 'users', title: 'No friends yet', text: 'Add players you meet in servers, or find them by name.', action: { label: 'Find players', href: '#/friends/find' } });
      } else if (tab === 'requests') {
        const inc = so.incoming.map((r) => ({ b: BF.bots.get(r.id), at: r.at })).filter((x) => x.b);
        const out = so.outgoing.map((r) => ({ b: BF.bots.get(r.id), at: r.at })).filter((x) => x.b);
        body = '<h3 class="section-title" style="margin-bottom:10px">Received</h3>' + (inc.length ? '<div class="list panel tight">' + inc.map((x) => BF.ui.userRow(x.b, '<button class="btn btn-xs btn-primary" data-act="accept-friend" data-bot="' + x.b.id + '">' + BF.icon('check', 13) + 'Accept</button><button class="btn btn-xs btn-ghost" data-act="decline-friend" data-bot="' + x.b.id + '">Decline</button><button class="icon-btn sm" data-act="user-menu" data-bot="' + x.b.id + '" aria-label="More">' + BF.icon('dots', 16) + '</button>', { sub: U.timeAgo(x.at, BF.clock.now()) })).join('') + '</div>' : '<p class="faint" style="margin-bottom:10px">No pending requests.</p>') +
          '<h3 class="section-title" style="margin:22px 0 10px">Sent</h3>' + (out.length ? '<div class="list panel tight">' + out.map((x) => BF.ui.userRow(x.b, '<span class="pill">Pending</span><button class="btn btn-xs btn-ghost" data-act="cancel-request" data-bot="' + x.b.id + '">Cancel</button>', { sub: 'sent ' + U.timeAgo(x.at, BF.clock.now()) })).join('') + '</div>' : '<p class="faint">You have not sent any requests.</p>');
      } else if (tab === 'recent') {
        const rec = so.recent.map((r) => ({ b: BF.bots.get(r.id), r })).filter((x) => x.b && !BF.friends.isBlocked(x.b.id));
        body = rec.length ? '<div class="list panel tight">' + rec.map((x) => { const g = BF.catalog.get(x.r.gameId); return BF.ui.userRow(x.b, BF.ui.socialButtons(x.b.id) + '<button class="icon-btn sm" data-act="user-menu" data-bot="' + x.b.id + '" aria-label="More">' + BF.icon('dots', 16) + '</button>', { sub: 'met in ' + esc(g ? g.name : 'a game') + ' ' + U.timeAgo(x.r.ts, BF.clock.now()) }); }).join('') + '</div>'
          : BF.ui.empty({ icon: 'history', title: 'No one yet', text: 'Players from servers you join appear here.', action: { label: 'Play a game', href: '#/discover' } });
      } else if (tab === 'followers' || tab === 'following') {
        // newest first; long lists are capped so the page stays fast
        const all = so[tab].slice().reverse();
        const ids = all.slice(0, 150);
        let head = '';
        if (tab === 'followers' && BF.followers) {
          const m = BF.followers.nextMilestone();
          const perHour = Math.round(BF.followers.ratePerMin() * 60);
          head = '<div class="panel follow-stats"><div><b class="num">' + U.fmt(so.followers.length) + '</b><span>followers</span></div><div><b class="num">~' + U.fmt(perHour) + '</b><span>new per hour</span></div>' +
            (m ? '<div class="fs-mile"><span>Next milestone: <b>' + U.fmt(m.at) + '</b> · bonus ' + BF.ui.coins(m.reward) + '</span><div class="bar"><i style="width:' + Math.round(m.progress * 100) + '%"></i></div></div>' : '<div class="fs-mile"><span>Every milestone reached!</span></div>') +
            '<p class="faint">Level up, win, earn badges, chat and publish popular games to gain followers faster. Players of your games may follow you too.</p></div>';
        } else if (tab === 'following') {
          const sugg = BF.bots.list.filter((b) => !BF.friends.isFollowing(b.id) && !BF.friends.isBlocked(b.id)).map((b) => ({ b, f: BF.bots.stats(b).followers })).sort((x, y) => y.f - x.f).slice(0, 6);
          head = '<h3 class="section-title" style="margin-bottom:10px">Popular players to follow</h3><div class="list panel tight" style="margin-bottom:18px">' + sugg.map((x) => BF.ui.userRow(x.b, '<button class="btn btn-xs btn-outline" data-act="follow" data-bot="' + x.b.id + '">' + BF.icon('plus', 12) + 'Follow</button>', { sub: U.compact(x.f) + ' followers · ' + esc(BF.PERSONALITIES[x.b.personality].label) })).join('') + '</div><h3 class="section-title" style="margin-bottom:10px">You follow</h3>';
        }
        body = head + (ids.length ? '<div class="list panel tight">' + ids.map((id) => BF.bots.get(id)).filter(Boolean).map((b) => BF.ui.userRow(b, (tab === 'followers' ? (BF.friends.isFollowing(b.id) ? '<span class="pill">Mutual</span>' : '<button class="btn btn-xs btn-outline" data-act="follow" data-bot="' + b.id + '">Follow back</button>') : '<button class="btn btn-xs btn-ghost" data-act="unfollow" data-bot="' + b.id + '">Unfollow</button>') + BF.ui.socialButtons(b.id))).join('') + '</div>'
          + (all.length > ids.length ? '<p class="faint" style="margin-top:10px">and ' + U.fmt(all.length - ids.length) + ' more</p>' : '')
          : BF.ui.empty({ icon: 'users', title: tab === 'followers' ? 'No followers yet' : 'Not following anyone', text: 'Follow players from their profile to see them here.' }));
      } else if (tab === 'blocked') {
        body = so.blocked.length ? '<div class="list panel tight">' + so.blocked.map((id) => BF.bots.get(id)).filter(Boolean).map((b) => BF.ui.userRow(b, '<button class="btn btn-xs btn-outline" data-act="unblock" data-bot="' + b.id + '">Unblock</button>')).join('') + '</div>'
          : BF.ui.empty({ icon: 'block', title: 'Nobody is blocked', text: 'Blocked players cannot message you or send requests.' });
      } else {
        const q = findQ.trim();
        const list = q ? BF.bots.search(q, 30) : BF.bots.list.filter((b) => !BF.friends.isFriend(b.id) && BF.world.botStatus(b.id).state !== 'offline').slice(0, 24);
        body = '<div class="search-box inline" style="max-width:420px;margin-bottom:14px"><input class="input" id="find-q" type="search" placeholder="Search by username or display name" value="' + esc(findQ) + '" autocomplete="off">' + BF.icon('search', 16) + '</div>' +
          '<div class="faint" style="margin-bottom:10px;font-size:12.5px">' + (q ? U.plural(list.length, 'player') + ' found' : 'Suggested players online right now') + '</div>' +
          (list.length ? '<div class="list panel tight" id="find-results">' + list.map((b) => BF.ui.userRow(b, BF.ui.socialButtons(b.id) + '<button class="icon-btn sm" data-act="user-menu" data-bot="' + b.id + '" aria-label="More">' + BF.icon('dots', 16) + '</button>', { sub: esc(BF.PERSONALITIES[b.personality].label) + ' · Lv ' + BF.bots.level(b) })).join('') + '</div>' : BF.ui.empty({ icon: 'search', title: 'No players match “' + q + '”' }));
      }
      return '<div class="page-head"><div><h1 class="page-title">Friends</h1><p class="page-sub">' + so.friends.length + ' friends · ' + onlineCount + ' online now</p></div><a class="btn btn-primary" href="#/friends/find">' + BF.icon('userPlus', 15) + 'Add friends</a></div>' + tabs + body;
    },
    mount(root) {
      const q = root.querySelector('#find-q');
      if (q) q.addEventListener('input', U.debounce(() => { findQ = q.value; BF.router.refresh(); }, 200));
    },
  });

  // --------------------------------------------------------------- messages

  let convFilter = '';
  const drafts = {};

  function threadHtml(withId) {
    const c = BF.messages.get(withId);
    const who = withId === 'system' ? BF.SYSTEM_SENDER : BF.bots.get(withId);
    if (!who) return BF.ui.empty({ icon: 'chat', title: 'Conversation not found' });
    const isSystem = withId === 'system';
    const st = isSystem ? null : BF.world.botStatus(withId);
    const blocked = !isSystem && BF.friends.isBlocked(withId);
    let lastDay = '';
    const msgs = (c ? c.msgs : []).map((m) => {
      const day = U.fmtDate(m.ts);
      const sep = day !== lastDay ? '<div class="msg-day">' + day + '</div>' : '';
      lastDay = day;
      const invite = m.invite ? BF.catalog.get(m.invite) : null;
      return sep + '<div class="msg ' + (m.from === 'me' ? 'me' : 'them') + '" data-mid="' + m.id + '"><div class="bubble">' + esc(m.text) +
        (invite ? '<div class="msg-invite"><img src="' + BF.thumbs.url(invite) + '" alt=""><div><b>' + esc(invite.name) + '</b><span class="faint">Game invite</span></div><button class="btn btn-xs btn-play" data-act="play" data-game="' + invite.id + '">Join</button></div>' : '') +
        '</div><div class="msg-meta"><span>' + U.fmtClockTime(m.ts) + '</span><button class="msg-del" data-del="' + m.id + '" aria-label="Delete message" data-tip="Delete">' + BF.icon('trash', 12) + '</button></div></div>';
    }).join('');
    return '<div class="thread-head"><a class="icon-btn mobile-only" href="#/messages" aria-label="Back">' + BF.icon('arrowLeft', 18) + '</a>' +
      (isSystem ? '<span class="avatar-chip sys">' + BF.logoMark(26) + '</span>' : '<a href="#/user/' + withId + '">' + BF.ui.avatarChip(who.avatar, { status: st.state, id: withId }) + '</a>') +
      '<div class="row-main"><div class="row-title">' + esc(who.displayName) + (isSystem ? ' <span class="pill accent">Official</span>' : '') + '</div><div class="row-sub">' + (isSystem ? 'System messages' : '@' + esc(who.username) + ' · <span data-live="status:' + withId + '">' + BF.ui.statusText(st) + '</span>') + '</div></div>' +
      '<div class="row-actions"><button class="btn btn-xs btn-ghost" data-mark-unread>' + BF.icon('mail', 13) + 'Mark unread</button>' + (isSystem ? '' : '<button class="icon-btn sm" data-act="user-menu" data-bot="' + withId + '" aria-label="More">' + BF.icon('dots', 16) + '</button>') + '<button class="icon-btn sm" data-del-conv aria-label="Delete conversation" data-tip="Delete conversation">' + BF.icon('trash', 16) + '</button></div></div>' +
      '<div class="thread-body" id="thread-body">' + (msgs || '<div class="faint" style="text-align:center;padding:30px">Say hi to ' + esc(who.displayName) + '!</div>') + (BF.messages.isTyping(withId) ? '<div class="msg them typing"><div class="bubble"><i></i><i></i><i></i></div></div>' : '') + '</div>' +
      (isSystem ? '<div class="thread-foot faint" style="justify-content:center">You cannot reply to system messages.</div>' : blocked ? '<div class="thread-foot faint" style="justify-content:center">You blocked this player. <button class="btn btn-xs btn-outline" data-act="unblock" data-bot="' + withId + '">Unblock</button></div>' :
        '<form class="thread-foot" id="compose"><textarea class="textarea" id="compose-text" rows="1" maxlength="500" placeholder="Message ' + esc(who.displayName) + '…" aria-label="Message">' + esc(drafts[withId] || '') + '</textarea><button class="btn btn-primary" type="submit" aria-label="Send">' + BF.icon('send', 16) + '<span class="hide-phone">Send</span></button></form>');
  }

  BF.pages.register('messages', {
    title: 'Messages',
    nav: 'messages',
    watch: ['messages', 'social'],
    render(params) {
      const convs = BF.messages.conversations();
      const active = params.with;
      const q = convFilter.trim().toLowerCase();
      const list = convs.filter((c) => !q || c.who.displayName.toLowerCase().includes(q) || (c.who.username || '').toLowerCase().includes(q));
      const listHtml = list.length ? list.map((c) => '<a class="conv' + (c.with === active ? ' on' : '') + (c.unread ? ' unread' : '') + '" href="#/messages/' + c.with + '">' +
        (c.with === 'system' ? '<span class="avatar-chip sys">' + BF.logoMark(24) + '</span>' : BF.ui.avatarChip(c.who.avatar, { status: BF.world.botStatus(c.with).state, id: c.with })) +
        '<span class="conv-main"><span class="conv-top"><b>' + esc(c.who.displayName) + '</b><span class="faint">' + U.timeAgo(c.last.ts, BF.clock.now()) + '</span></span><span class="conv-last">' + (c.last.from === 'me' ? 'You: ' : '') + esc(c.last.text) + '</span></span>' + (c.unread ? '<span class="count-badge">' + c.unread + '</span>' : '') + '</a>').join('')
        : '<div class="faint" style="padding:20px;text-align:center">No conversations' + (q ? ' match' : ' yet') + '.</div>';
      return '<div class="page-head"><div><h1 class="page-title">Messages</h1><p class="page-sub">Private chats with players. Bots reply on their own time.</p></div><button class="btn btn-primary" data-new-msg>' + BF.icon('edit', 15) + 'New message</button></div>' +
        '<div class="messenger' + (active ? ' has-active' : '') + '"><aside class="conv-list"><div class="search-box inline"><input class="input" id="conv-q" type="search" placeholder="Search conversations" value="' + esc(convFilter) + '">' + BF.icon('search', 16) + '</div><div class="conv-scroll">' + listHtml + '</div></aside>' +
        '<section class="thread" id="thread">' + (active ? threadHtml(active) : BF.ui.empty({ icon: 'chat', title: 'Pick a conversation', text: 'Or start a new one with a friend.' })) + '</section></div>';
    },
    mount(root, params) {
      const active = params.with;
      BF.ui.currentConversation = active || null;
      if (active) BF.messages.markRead(active);
      const body = root.querySelector('#thread-body');
      if (body) body.scrollTop = body.scrollHeight;
      const q = root.querySelector('#conv-q');
      q.addEventListener('input', U.debounce(() => { convFilter = q.value; BF.router.refresh(); }, 180));
      const form = root.querySelector('#compose');
      if (form) {
        const ta = form.querySelector('#compose-text');
        const send = () => {
          const r = BF.messages.send(active, ta.value);
          if (!r.ok) return BF.ui.toast({ title: r.error, kind: 'error' });
          ta.value = '';
          drafts[active] = '';
          BF.sfx.play('chat');
        };
        form.addEventListener('submit', (e) => { e.preventDefault(); send(); });
        ta.addEventListener('input', () => { drafts[active] = ta.value; });
        ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
        if (window.innerWidth > 760) setTimeout(() => ta.focus({ preventScroll: true }), 30);
      }
      root.addEventListener('click', async (e) => {
        const del = e.target.closest('[data-del]');
        if (del) { BF.messages.deleteMessage(active, del.dataset.del); BF.ui.toast({ title: 'Message deleted', kind: 'info' }); return; }
        if (e.target.closest('[data-mark-unread]')) { BF.messages.markUnread(active); BF.ui.currentConversation = null; BF.router.go('#/messages'); BF.ui.toast({ title: 'Marked as unread', kind: 'info', icon: 'mail' }); return; }
        if (e.target.closest('[data-del-conv]')) {
          const ok = await BF.ui.confirm({ title: 'Delete this conversation?', message: 'All messages in it are removed from this device.', confirmLabel: 'Delete', danger: true, icon: 'trash' });
          if (ok) { BF.messages.deleteConversation(active); BF.router.go('#/messages'); }
          return;
        }
        if (e.target.closest('[data-new-msg]')) newMessage();
      });
      this._typingOff = BF.bus.on('messages:typing', (ev) => { if (ev.with === active) BF.router.refresh(); });
    },
    unmount() {
      BF.ui.currentConversation = null;
      if (this._typingOff) this._typingOff();
    },
  });

  function newMessage() {
    const friends = BF.friends.list();
    const h = BF.ui.modal({
      title: 'New message',
      icon: 'edit',
      body: friends.length ? '<div class="search-box inline" style="margin-bottom:10px"><input class="input" id="nm-q" type="search" placeholder="Search friends">' + BF.icon('search', 16) + '</div><div class="list nm-list">' + friends.map((b) => '<button class="list-row nm-row" data-to="' + b.id + '" data-name="' + esc(b.displayName.toLowerCase() + ' ' + b.username.toLowerCase()) + '">' + BF.ui.avatarChip(b.avatar, { size: 'sm' }) + '<span class="row-main" style="text-align:left"><span class="row-title">' + esc(b.displayName) + '</span><span class="row-sub">@' + esc(b.username) + '</span></span></button>').join('') + '</div>' : BF.ui.empty({ icon: 'users', title: 'Add friends first', action: { label: 'Find players', href: '#/friends/find' } }),
    });
    const q = h.el.querySelector('#nm-q');
    if (q) q.addEventListener('input', () => h.el.querySelectorAll('.nm-row').forEach((r) => { r.hidden = !r.dataset.name.includes(q.value.toLowerCase()); }));
    h.el.querySelectorAll('[data-to]').forEach((b) => b.addEventListener('click', () => { h.close(); BF.router.go('#/messages/' + b.dataset.to); }));
  }

  // ---------------------------------------------------------- notifications

  const NOTIF_TYPES = [['all', 'All'], ['unread', 'Unread'], ['friend', 'Friends'], ['achievement', 'Achievements'], ['invite', 'Invites'], ['purchase', 'Purchases'], ['daily', 'Rewards'], ['quest', 'Quests'], ['bot', 'Messages'], ['level', 'Level ups'], ['update', 'Game updates'], ['system', 'System']];
  let notifFilter = 'all';

  BF.pages.register('notifications', {
    title: 'Notifications',
    nav: 'notifications',
    watch: ['notifications', 'social'],
    render() {
      const all = BF.store.state.notifications;
      const list = all.filter((n) => notifFilter === 'all' || (notifFilter === 'unread' ? !n.read : n.type === notifFilter));
      const count = (t) => (t === 'all' ? all.length : t === 'unread' ? all.filter((n) => !n.read).length : all.filter((n) => n.type === t).length);
      const actionBtns = (n) => {
        if (n.action && n.action.kind === 'friendRequest' && BF.friends.hasIncoming(n.action.id)) return '<button class="btn btn-xs btn-primary" data-act="accept-friend" data-bot="' + n.action.id + '">Accept</button><button class="btn btn-xs btn-ghost" data-act="decline-friend" data-bot="' + n.action.id + '">Decline</button>';
        if (n.action && n.action.kind === 'invite') return '<button class="btn btn-xs btn-play" data-act="' + (n.action.serverId ? 'join-server' : 'play') + '" data-game="' + n.action.gameId + '"' + (n.action.serverId ? ' data-server="' + n.action.serverId + '"' : '') + '>Join</button>';
        return '';
      };
      return '<div class="page-head"><div><h1 class="page-title">Notifications</h1><p class="page-sub">' + count('unread') + ' unread of ' + all.length + '</p></div><div style="display:flex;gap:8px"><button class="btn btn-outline" data-act="mark-all-read">' + BF.icon('check', 15) + 'Mark all read</button><button class="btn btn-ghost" data-clear-notifs>' + BF.icon('trash', 15) + 'Clear all</button></div></div>' +
        '<div class="chips scroll" style="margin-bottom:16px">' + NOTIF_TYPES.filter((t) => t[0] === 'all' || t[0] === 'unread' || count(t[0])).map((t) => '<button class="chip' + (notifFilter === t[0] ? ' on' : '') + '" data-nf="' + t[0] + '">' + t[1] + '<span class="count">' + count(t[0]) + '</span></button>').join('') + '</div>' +
        (list.length ? '<div class="notif-list">' + list.map((n) => '<div class="notif' + (n.read ? '' : ' unread') + '" data-nid="' + n.id + '"><span class="notif-icon t-' + n.type + '">' + BF.ui.achIcon(n.icon, 18) + '</span><div class="row-main"><div class="notif-title">' + esc(n.title) + '</div><div class="notif-body">' + esc(n.body) + '</div><div class="notif-time faint">' + U.timeAgo(n.ts, BF.clock.now()) + ' · ' + U.fmtDateTime(n.ts) + '</div></div>' +
          '<div class="row-actions">' + actionBtns(n) + (n.route ? '<button class="btn btn-xs btn-outline" data-open="' + n.id + '">Open</button>' : '') + '<button class="icon-btn sm" data-toggle-read="' + n.id + '" aria-label="' + (n.read ? 'Mark unread' : 'Mark read') + '" data-tip="' + (n.read ? 'Mark unread' : 'Mark read') + '">' + BF.icon(n.read ? 'mail' : 'check', 15) + '</button><button class="icon-btn sm" data-del-notif="' + n.id + '" aria-label="Delete" data-tip="Delete">' + BF.icon('x', 15) + '</button></div></div>').join('') + '</div>'
          : BF.ui.empty({ icon: 'bell', title: notifFilter === 'unread' ? 'You are all caught up' : 'No notifications here', text: 'Friend requests, rewards, invites and game updates appear here.' }));
    },
    mount(root) {
      root.querySelectorAll('[data-nf]').forEach((b) => b.addEventListener('click', () => { notifFilter = b.dataset.nf; BF.router.refresh(); }));
      root.addEventListener('click', async (e) => {
        const tr = e.target.closest('[data-toggle-read]');
        if (tr) { const n = BF.store.state.notifications.find((x) => x.id === tr.dataset.toggleRead); if (n) (n.read ? BF.notify.markUnread : BF.notify.markRead)(n.id); return; }
        const del = e.target.closest('[data-del-notif]');
        if (del) { BF.notify.remove(del.dataset.delNotif); return; }
        const op = e.target.closest('[data-open]');
        if (op) { const n = BF.store.state.notifications.find((x) => x.id === op.dataset.open); if (n) { BF.notify.markRead(n.id); BF.router.go(n.route); } return; }
        if (e.target.closest('[data-clear-notifs]')) {
          const ok = await BF.ui.confirm({ title: 'Clear all notifications?', message: 'This removes every notification from this device.', confirmLabel: 'Clear all', danger: true, icon: 'trash' });
          if (ok) BF.notify.clear();
        }
      });
    },
  });
})((window.BF = window.BF || {}));
