/**
 * BlockForge — application shell: header (logo, search, ForgeCoins, messages,
 * notifications, profile menu), sidebar navigation, mobile bottom nav, live
 * badges, animated balance and keyboard shortcuts.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const esc = U.esc;

  const NAV = [
    ['home', 'Home', 'home', '#/home'],
    ['discover', 'Discover', 'compass', '#/discover'],
    ['games', 'Games', 'gamepad', '#/games'],
    ['shop', 'Avatar Shop', 'bag', '#/shop'],
    ['inventory', 'Inventory', 'box', '#/inventory'],
    ['avatar', 'Avatar', 'shirt', '#/avatar'],
    ['friends', 'Friends', 'users', '#/friends'],
    ['messages', 'Messages', 'chat', '#/messages'],
    ['notifications', 'Notifications', 'bell', '#/notifications'],
    ['create', 'Create', 'anvil', '#/create'],
    ['profile', 'Profile', 'user', '#/profile'],
    ['settings', 'Settings', 'gear', '#/settings'],
  ];
  const NAV2 = [
    ['quests', 'Quests', 'target', '#/quests'],
    ['achievements', 'Achievements', 'medal', '#/achievements'],
    ['leaderboards', 'Leaderboards', 'podium', '#/leaderboards'],
    ['wallet', 'Wallet', 'wallet', '#/wallet'],
  ];

  let shownBalance = 0;
  let tweenRaf = 0;
  let suggestSel = -1;
  let suggestItems = [];
  let gPending = false;
  let gTimer = null;

  const shell = (BF.shell = {
    active: null,

    /** Build the shell DOM (called once after sign-in). */
    mount() {
      const app = document.getElementById('app');
      app.className = 'app';
      app.innerHTML =
        '<header class="topbar" id="topbar">' +
        '<div class="topbar-left"><button class="icon-btn mobile-only" data-act="toggle-sidebar" aria-label="Open menu">' + BF.icon('menu', 20) + '</button><a href="#/home" aria-label="BlockForge home">' + BF.logo(30) + '</a></div>' +
        '<div class="topbar-center"><div class="search-box" id="search-box"><input class="input" id="global-search" type="search" placeholder="Search games, players, items, creators" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="search-suggest" aria-label="Search BlockForge">' + BF.icon('search', 17) + '<kbd>/</kbd><div class="suggest" id="search-suggest" role="listbox" hidden></div></div></div>' +
        '<div class="topbar-right">' +
        '<button class="icon-btn mobile-only" data-act="open-search" aria-label="Search">' + BF.icon('search', 19) + '</button>' +
        '<a class="coin-pill" id="coin-pill" href="#/wallet" data-tip="Wallet and transaction history" aria-label="ForgeCoins balance">' + BF.coinIcon(22) + '<span class="cp-text"><span class="cp-label">ForgeCoins</span><span class="cp-amount" id="coin-amount">0</span></span></a>' +
        '<a class="icon-btn hide-phone" href="#/messages" data-tip="Messages" aria-label="Messages">' + BF.icon('chat', 20) + '<span class="count-badge" id="msg-badge" hidden></span></a>' +
        '<button class="icon-btn" id="notif-btn" data-act="open-notifs" data-tip="Notifications" aria-label="Notifications" aria-haspopup="menu">' + BF.icon('bell', 20) + '<span class="count-badge" id="notif-badge" hidden></span></button>' +
        '<button class="avatar-btn" id="profile-btn" data-act="open-profile-menu" aria-label="Profile menu" aria-haspopup="menu"></button>' +
        '</div></header>' +
        '<nav class="sidebar" id="sidebar" aria-label="Main">' + navHtml() + '</nav>' +
        '<div class="drawer-scrim" id="drawer-scrim" data-act="close-sidebar"></div>' +
        '<main class="main" id="main" tabindex="-1"></main>' +
        '<nav class="bottomnav" id="bottomnav" aria-label="Quick">' +
        bottomItem('home', 'Home', 'home', '#/home') + bottomItem('discover', 'Discover', 'compass', '#/discover') + bottomItem('shop', 'Shop', 'bag', '#/shop') + bottomItem('friends', 'Friends', 'users', '#/friends') +
        '<button data-act="toggle-sidebar" data-nav="more">' + BF.icon('menu', 21) + '<span>More</span><span class="nav-badge" id="more-badge" hidden></span></button></nav>';

      shownBalance = BF.store.state.wallet.balance;
      document.getElementById('coin-amount').textContent = U.fmt(shownBalance);
      shell.updateBadges();
      shell.updateAvatar();
      shell.updateSidebarFoot();
      shell.updateDnd();
      bindSearch();
      BF.store.on(['notifications', 'messages', 'social', 'quests', 'daily'], () => { shell.updateBadges(); shell.updateSidebarFoot(); });
      BF.store.on(['avatar', 'player'], shell.updateAvatar);
      BF.bus.on('wallet:changed', (e) => shell.animateBalance(e.delta));
      BF.bus.on('world:tick', () => { shell.updateLive(); shell.updateOnline(); });
      BF.bus.on('store:saved', shell.updateSaveStatus);
      BF.bus.on('store:change', (keys) => { if (keys.has('settings')) shell.updateDnd(); });
    },

    setActive(name) {
      shell.active = name;
      document.querySelectorAll('[data-nav]').forEach((el) => el.classList.toggle('active', el.dataset.nav === name));
      shell.closeSidebar();
    },

    updateBadges() {
      const s = BF.store.state;
      if (!s) return;
      const set = (id, n) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.hidden = !n;
        el.textContent = n > 99 ? '99+' : String(n);
      };
      const notif = BF.notify.unread();
      const msgs = BF.messages.unreadCount();
      const reqs = s.social.incoming.length;
      const quests = BF.quests.claimable();
      set('notif-badge', notif);
      set('msg-badge', msgs);
      set('nb-notifications', notif);
      set('nb-messages', msgs);
      set('nb-friends', reqs);
      set('nb-quests', quests);
      set('bn-friends', reqs);
      set('more-badge', notif + msgs + quests);
    },

    updateAvatar() {
      const btn = document.getElementById('profile-btn');
      if (btn) btn.innerHTML = BF.avatar.render(BF.store.state.avatar, { crop: 'bust', still: true, size: 44 });
    },

    updateSidebarFoot() {
      const el = document.getElementById('sidebar-foot');
      if (!el || !BF.store.state) return;
      const d = BF.daily.status();
      el.innerHTML =
        '<div class="sidebar-card daily-card' + (d.canClaim ? ' ready' : '') + '">' +
        '<div class="dc-top">' + BF.icon('gift', 18) + '<div><div class="dc-title">Daily reward</div><div class="dc-sub">' + (d.canClaim ? 'Day ' + d.nextDay + ' ready: ' + U.fmt(d.nextAmount) + ' FC' : 'Claimed · streak ' + d.streak) + '</div></div></div>' +
        '<button class="btn btn-sm ' + (d.canClaim ? 'btn-gold' : 'btn-ghost') + ' btn-block" data-act="open-daily">' + (d.canClaim ? 'Claim' : 'View streak') + '</button></div>' +
        '<div class="sidebar-card online-card"><span class="live-dot"></span><span id="online-count">' + U.fmt(BF.world.totalOnline()) + '</span> forgers online</div>' +
        '<div class="sidebar-card save-card" id="save-status"></div>';
      shell.updateSaveStatus();
    },

    /** Mark the bell while do-not-disturb is on. */
    updateDnd() {
      const b = document.getElementById('notif-btn');
      const on = !!(BF.store.state && BF.store.state.settings.notifications.dnd);
      if (b) { b.classList.toggle('dnd', on); b.dataset.tip = on ? 'Notifications (do not disturb)' : 'Notifications'; }
    },

    updateOnline() {
      const el = document.getElementById('online-count');
      if (el) el.textContent = U.fmt(BF.world.totalOnline());
    },

    updateSaveStatus() {
      const el = document.getElementById('save-status');
      if (!el) return;
      const ok = BF.storage.isPersistent() && (!BF.store.lastSaveResult || BF.store.lastSaveResult.ok !== false);
      el.innerHTML = BF.icon(ok ? 'save' : 'warning', 14) + '<span>' + (ok ? 'Saved ' + U.fmtClockTime(BF.store.lastSavedAt || Date.now()) : BF.storage.isPersistent() ? 'Storage full: export your save' : 'Saving to memory only') + '</span><button class="btn btn-xs btn-ghost" data-act="save-now" data-tip="Save now (Ctrl+S)">Save</button>';
    },

    /** Count the header balance up/down to the new value. */
    animateBalance(delta) {
      const el = document.getElementById('coin-amount');
      const pill = document.getElementById('coin-pill');
      if (!el || !BF.store.state) return;
      const target = BF.store.state.wallet.balance;
      const start = shownBalance;
      cancelAnimationFrame(tweenRaf);
      pill.classList.remove('bump', 'drop');
      void pill.offsetWidth;
      pill.classList.add(delta >= 0 ? 'bump' : 'drop');
      const r = pill.getBoundingClientRect();
      if (delta) BF.ui.floatDelta(r.left + 34, r.bottom - 4, (delta > 0 ? '+' : '−') + U.fmt(Math.abs(delta)), delta > 0 ? 'var(--gold)' : 'var(--danger)');
      const reduced = document.documentElement.dataset.bfMotion === 'reduced';
      const dur = reduced ? 0 : Math.min(900, 300 + Math.log10(Math.abs(target - start) + 1) * 120);
      const t0 = performance.now();
      const step = (now) => {
        const t = dur ? Math.min(1, (now - t0) / dur) : 1;
        const e = 1 - Math.pow(1 - t, 3);
        shownBalance = Math.round(start + (target - start) * e);
        el.textContent = U.fmt(shownBalance);
        if (t < 1) tweenRaf = requestAnimationFrame(step);
        else shownBalance = target;
      };
      tweenRaf = requestAnimationFrame(step);
      if (delta > 0) BF.sfx.play('coin');
    },

    /** Refresh [data-live] player counts and statuses without re-rendering pages. */
    updateLive() {
      document.querySelectorAll('[data-live]').forEach((el) => {
        const [kind, id] = el.dataset.live.split(':');
        if (kind === 'playing') el.textContent = U.compact(BF.world.playerCount(id));
        else if (kind === 'status') el.innerHTML = BF.ui.statusText(BF.world.botStatus(id));
        else if (kind === 'dot') el.className = 'status-dot ' + BF.world.botStatus(id).state;
        else if (kind === 'online') el.textContent = U.fmt(BF.world.totalOnline());
      });
      BF.bus.emit('ui:live');
    },

    toggleSidebar() {
      const sb = document.getElementById('sidebar');
      const scrim = document.getElementById('drawer-scrim');
      if (!sb) return;
      const open = !sb.classList.contains('open');
      sb.classList.toggle('open', open);
      scrim.classList.toggle('show', open);
    },
    closeSidebar() {
      const sb = document.getElementById('sidebar');
      if (sb && sb.classList.contains('open')) {
        sb.classList.remove('open');
        document.getElementById('drawer-scrim').classList.remove('show');
      }
    },

    /** Profile dropdown from the header avatar. */
    openProfileMenu(anchor) {
      const s = BF.store.state;
      const p = s.player;
      const need = BF.xpForLevel(p.level);
      BF.ui.menu(anchor, [
        { html: '<div style="display:flex;gap:10px;align-items:center">' + BF.ui.avatarChip(s.avatar, {}) + '<div style="min-width:0"><div style="font-weight:600">' + esc(p.displayName) + '</div><div class="faint" style="font-size:12px">@' + esc(p.username) + ' · Level ' + p.level + '</div></div></div><div style="margin-top:9px">' + BF.ui.bar(p.xp, need, 'xp thin') + '<div class="faint" style="font-size:11px;margin-top:4px">' + U.fmt(p.xp) + ' / ' + U.fmt(need) + ' XP</div></div>' },
        { sep: true },
        { label: 'Profile', icon: 'user', href: '#/profile' },
        { label: 'Avatar', icon: 'shirt', href: '#/avatar' },
        { label: 'Inventory', icon: 'box', href: '#/inventory' },
        { label: 'Friends', icon: 'users', href: '#/friends' },
        { label: 'Settings', icon: 'gear', href: '#/settings' },
        { sep: true },
        { label: 'Save now', icon: 'save', hint: 'Ctrl+S', onClick: () => BF.actions.run('save-now') },
        { label: 'Sign out', icon: 'logout', danger: true, onClick: () => BF.actions.run('sign-out') },
      ], { align: 'right', width: 260 });
    },

    /** Notification dropdown. */
    openNotifications(anchor) {
      const list = BF.store.state.notifications.slice(0, 8);
      const dnd = !!BF.store.state.settings.notifications.dnd;
      const items = [{ html: '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><b>Notifications</b><span style="display:flex;gap:6px"><button class="btn btn-xs ' + (dnd ? 'btn-primary' : 'btn-ghost') + '" id="nd-dnd" aria-pressed="' + dnd + '" data-tip="' + (dnd ? 'Pop-ups are off' : 'Silence pop-ups and banners') + '">' + BF.icon('moon', 12) + (dnd ? 'Quiet on' : 'Quiet') + '</button><button class="btn btn-xs btn-ghost" id="nd-readall">Mark all read</button></span></div>' }];
      if (!list.length) items.push({ html: '<div class="faint" style="padding:14px 4px;text-align:center">You are all caught up.</div>' });
      const m = BF.ui.menu(anchor, items.concat(list.map((n) => ({
        html: '<button class="notif-mini' + (n.read ? '' : ' unread') + '" data-nid="' + n.id + '"><span class="nm-icon">' + BF.ui.achIcon(n.icon, 16) + '</span><span class="nm-body"><span class="nm-title">' + esc(n.title) + '</span><span class="nm-text">' + esc(n.body) + '</span><span class="nm-time">' + U.timeAgo(n.ts, BF.clock.now()) + '</span></span></button>',
      }))).concat([{ sep: true }, { label: 'View all notifications', icon: 'bell', href: '#/notifications' }]), { align: 'right', width: 360, focus: false });
      m.el.addEventListener('click', (e) => {
        if (e.target.closest('#nd-dnd')) { const on = BF.notify.toggleDnd(); m.close(); shell.updateDnd(); BF.ui.toast({ title: on ? 'Do not disturb is on' : 'Pop-ups are back on', text: on ? 'Notifications still collect in the bell.' : '', kind: 'info', icon: on ? 'moon' : 'bell' }); return; }
        if (e.target.closest('#nd-readall')) { BF.notify.markAllRead(); m.close(); BF.ui.toast({ title: 'All notifications marked as read', kind: 'success' }); return; }
        const b = e.target.closest('[data-nid]');
        if (!b) return;
        const n = BF.store.state.notifications.find((x) => x.id === b.dataset.nid);
        m.close();
        if (n) { BF.notify.markRead(n.id); if (n.route) BF.router.go(n.route); }
      });
    },

    /** Keyboard shortcuts modal. */
    showShortcuts() {
      const rows = [['/', 'Focus search'], ['?', 'Show shortcuts'], ['g then h', 'Home'], ['g then d', 'Discover'], ['g then g', 'Games'], ['g then s', 'Avatar Shop'], ['g then i', 'Inventory'], ['g then a', 'Avatar'], ['g then f', 'Friends'], ['g then m', 'Messages'], ['g then n', 'Notifications'], ['g then c', 'Create'], ['g then p', 'Profile'], ['g then w', 'Wallet'], ['g then q', 'Quests'], ['g then l', 'Leaderboards'], ['g then t', 'Settings'], ['Ctrl+S', 'Save now'], ['Esc', 'Close menus and dialogs'], ['In game: Enter', 'Chat'], ['In game: Esc', 'Pause menu']];
      BF.ui.modal({ title: 'Keyboard shortcuts', icon: 'keyboard', wide: true, body: '<div class="shortcut-grid">' + rows.map((r) => '<div class="shortcut"><span>' + esc(r[1]) + '</span><span>' + r[0].split(' then ').map((k) => '<kbd>' + esc(k) + '</kbd>').join(' <span class="faint">then</span> ') + '</span></div>').join('') + '</div>' });
    },
  });

  function navHtml() {
    const item = (n) => '<a class="nav-item" href="' + n[3] + '" data-nav="' + n[0] + '" data-tip-side="right">' + BF.icon(n[2], 19) + '<span class="nav-text">' + n[1] + '</span><span class="nav-badge" id="nb-' + n[0] + '" hidden></span></a>';
    return NAV.map(item).join('') + '<div class="nav-label">Progress</div>' + NAV2.map(item).join('') + '<div class="sidebar-foot" id="sidebar-foot"></div>';
  }

  function bottomItem(id, label, icon, href) {
    return '<a href="' + href + '" data-nav="' + id + '">' + BF.icon(icon, 21) + '<span>' + label + '</span>' + (id === 'friends' ? '<span class="nav-badge" id="bn-friends" hidden></span>' : '') + '</a>';
  }

  // ------------------------------------------------------------------ search

  function highlight(text, q) {
    const t = String(text);
    const i = t.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0 || !q) return esc(t);
    return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length));
  }

  function bindSearch() {
    const input = document.getElementById('global-search');
    const box = document.getElementById('search-suggest');
    const close = () => {
      box.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      suggestSel = -1;
      document.getElementById('topbar').classList.remove('search-open');
    };
    const go = (it) => {
      close();
      input.blur();
      if (!it) return;
      if (it.kind === 'game') BF.router.go('#/game/' + it.id);
      else if (it.kind === 'player') BF.router.go(it.id === 'me' ? '#/profile' : '#/user/' + it.id);
      else if (it.kind === 'item') BF.actions.run('item-detail', null, null, { item: it.id });
      else if (it.kind === 'creator') BF.router.go('#/creator/' + encodeURIComponent(it.id));
      else if (it.kind === 'all') BF.router.go(BF.router.link('/search', { q: it.id }));
    };
    const render = () => {
      const q = input.value.trim();
      if (!q) { close(); return; }
      const r = BF.search.suggest(q);
      suggestItems = [];
      let html = '';
      const group = (label, list, fn) => {
        if (!list.length) return;
        html += '<div class="suggest-group">' + label + '</div>';
        list.forEach((x) => { const it = fn(x); it.idx = suggestItems.length; suggestItems.push(it); html += '<div class="suggest-item" role="option" data-si="' + it.idx + '">' + it.html + '</div>'; });
      };
      group('Games', r.games, (g) => ({ kind: 'game', id: g.id, html: '<img src="' + BF.thumbs.url(g) + '" alt=""><div><div>' + highlight(g.name, q) + '</div><div class="s-sub">' + esc(g.genre) + ' · ' + U.compact(BF.world.playerCount(g.id)) + ' playing</div></div>' }));
      group('Players', r.players, (p) => ({ kind: 'player', id: p.id, html: BF.ui.avatarChip(p.me ? BF.store.state.avatar : p.avatar, { size: 'sm' }) + '<div><div>' + highlight(p.username, q) + (p.me ? ' <span class="pill accent">You</span>' : '') + '</div><div class="s-sub">' + esc(p.displayName) + '</div></div>' }));
      group('Avatar items', r.items, (i) => ({ kind: 'item', id: i.id, html: '<span class="rar-' + i.rarity + '" style="width:32px;display:grid;place-items:center">' + BF.ui.rarityTag(i.rarity).replace(/>\w+</, '>●<') + '</span><div><div>' + highlight(i.name, q) + '</div><div class="s-sub">' + esc(BF.ITEM_CATS[i.cat].label) + ' · ' + (i.notForSale ? 'Found in game' : U.fmt(i.price) + ' FC') + '</div></div>' }));
      group('Creators', r.creators, (c) => ({ kind: 'creator', id: c.name, html: '<span class="avatar-chip sm" style="display:grid;place-items:center;color:var(--accent)">' + BF.icon('anvil', 16) + '</span><div><div>' + highlight(c.name, q) + '</div><div class="s-sub">' + U.plural(c.games, 'game') + ' · ' + U.plural(c.items, 'item') + '</div></div>' }));
      const allIdx = suggestItems.length;
      suggestItems.push({ kind: 'all', id: q });
      html += '<div class="suggest-item" data-si="' + allIdx + '">' + BF.icon('search', 16) + '<div>See all results for “' + esc(q) + '”</div></div>';
      html += '<div class="suggest-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span></div>';
      box.innerHTML = html;
      box.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      suggestSel = -1;
    };
    const debounced = U.debounce(render, 110);
    input.addEventListener('input', debounced);
    input.addEventListener('focus', () => { if (input.value.trim()) render(); });
    input.addEventListener('keydown', (e) => {
      const opts = box.querySelectorAll('[data-si]');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (box.hidden) render();
        e.preventDefault();
        suggestSel = e.key === 'ArrowDown' ? Math.min(opts.length - 1, suggestSel + 1) : Math.max(-1, suggestSel - 1);
        opts.forEach((o, i) => o.classList.toggle('sel', i === suggestSel));
        if (opts[suggestSel]) opts[suggestSel].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const q = input.value.trim();
        if (suggestSel >= 0 && suggestItems[suggestSel]) go(suggestItems[suggestSel]);
        else if (q) go({ kind: 'all', id: q });
      } else if (e.key === 'Escape') {
        close();
        input.blur();
      }
    });
    box.addEventListener('pointerdown', (e) => {
      const o = e.target.closest('[data-si]');
      if (!o) return;
      e.preventDefault();
      go(suggestItems[Number(o.dataset.si)]);
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
  }

  // --------------------------------------------------------------- shortcuts

  const G_MAP = { h: '#/home', d: '#/discover', g: '#/games', s: '#/shop', i: '#/inventory', a: '#/avatar', f: '#/friends', m: '#/messages', n: '#/notifications', c: '#/create', p: '#/profile', w: '#/wallet', q: '#/quests', l: '#/leaderboards', t: '#/settings' };

  document.addEventListener('keydown', (e) => {
    if (!BF.store.state || !document.getElementById('topbar')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      BF.actions.run('save-now');
      return;
    }
    if (BF.runtime && BF.runtime.active) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.modal-scrim, .fc-scrim')) return;
    if (gPending) {
      gPending = false;
      clearTimeout(gTimer);
      const dest = G_MAP[e.key.toLowerCase()];
      if (dest) { e.preventDefault(); BF.router.go(dest); }
      return;
    }
    if (e.key === '/') {
      e.preventDefault();
      const input = document.getElementById('global-search');
      document.getElementById('topbar').classList.add('search-open');
      input.focus();
      input.select();
    } else if (e.key === '?') {
      e.preventDefault();
      shell.showShortcuts();
    } else if (e.key.toLowerCase() === 'g') {
      gPending = true;
      gTimer = setTimeout(() => { gPending = false; }, 1200);
    }
  });
})((window.BF = window.BF || {}));
