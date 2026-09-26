/**
 * BlockForge — game detail page: hero, stats, PLAY, favorite / like / share and
 * the About, Store, Badges, Servers and Leaderboard tabs.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const esc = U.esc;

  /**
   * Banner for a developer update: its event while one runs in this game, or
   * any recent update when `opts.latest` (home page). Empty string when none.
   */
  BF.ui.updateBanner = function (g, opts) {
    if (!BF.updates) return '';
    opts = opts || {};
    let rec, def, game = g, until = 0;
    if (opts.latest) {
      const l = BF.updates.latest();
      if (!l || BF.clock.now() - l.rec.at > 7 * 86400000) return '';
      rec = l.rec; def = l.def; game = l.game;
      const a = BF.updates.active(game.id);
      until = a && a.rec.id === rec.id ? a.until : 0;
    } else {
      const a = BF.updates.active(g.id);
      if (!a) return '';
      rec = a.rec; def = a.def; until = a.until;
    }
    const chips = [];
    if (until && def.event && def.event.xp > 1) chips.push('<span class="pill gold">' + BF.icon('star', 11) + def.event.xp + 'x XP</span>');
    if (until && def.sale) chips.push('<a class="pill success" href="#/game/' + game.id + '/store">' + BF.icon('ticket', 11) + def.sale + '% off passes</a>');
    for (const id of def.items || []) { const it = BF.ITEMS[id]; if (it) chips.push('<button class="pill accent" data-act="item-detail" data-item="' + it.id + '">' + BF.icon('gem', 11) + 'New limited: ' + esc(it.name) + '</button>'); }
    return '<section class="update-banner"><div class="ub-icon">' + BF.icon('refresh', 22) + '</div><div class="ub-main"><div class="eyebrow">' + (opts.latest ? 'What\'s new · ' + esc(game.name) : 'Update event') + ' · v' + esc(rec.v) + '</div>' +
      '<h3 class="ub-title">' + esc(def.title) + '</h3><p class="ub-notes">' + esc(def.notes) + '</p>' +
      '<div class="ub-chips">' + chips.join('') + (until ? '<span class="faint num">Ends in ' + U.fmtDuration((until - BF.clock.now()) / 1000) + '</span>' : '<span class="faint">Released ' + U.timeAgo(rec.at, BF.clock.now()) + '</span>') + '</div></div>' +
      (opts.latest ? '<button class="btn btn-play" data-act="play" data-game="' + game.id + '">' + BF.icon('play', 14) + 'Play</button>' : '') + '</section>';
  };
  let liveOff = null;
  let lbStat = {};

  function pingBars(ping) {
    const lvl = ping < 60 ? 4 : ping < 100 ? 3 : ping < 150 ? 2 : 1;
    const color = lvl >= 3 ? 'var(--success)' : lvl === 2 ? 'var(--warning)' : 'var(--danger)';
    let o = '<span class="ping" style="color:' + color + '" aria-hidden="true">';
    for (let i = 1; i <= 4; i++) o += '<i style="height:' + (3 + i * 3) + 'px;opacity:' + (i <= lvl ? 1 : 0.22) + '"></i>';
    return o + '</span>';
  }

  /** Server browser rows (also used by the create admin panel). */
  function serverRows(gameId, opts) {
    opts = opts || {};
    const servers = BF.world.serversFor(gameId);
    const session = BF.world.session;
    const friends = new Set(BF.store.state.social.friends);
    let rows = servers.map((srv) => {
      const count = srv.bots.length + (srv.user ? 1 : 0);
      const full = count >= srv.max;
      const bots = srv.bots.map((id) => BF.bots.get(id)).filter(Boolean);
      const fr = bots.filter((b) => friends.has(b.id));
      const mine = session && session.serverId === srv.id && session.gameId === gameId;
      return '<div class="server-row' + (mine ? ' mine' : '') + '"><div class="sr-id"><span class="sr-name">Server #' + srv.id + '</span><span class="faint">' + esc(srv.region) + ' · up ' + U.fmtDuration((Date.now() - srv.createdAt) / 1000) + '</span></div>' +
        '<div class="sr-avatars">' + bots.slice(0, 5).map((b) => '<a href="#/user/' + b.id + '" data-tip="' + esc(b.displayName) + '">' + BF.ui.avatarChip(b.avatar, { size: 'sm' }) + '</a>').join('') + (bots.length > 5 ? '<span class="sr-more">+' + (bots.length - 5) + '</span>' : '') + '</div>' +
        '<div class="sr-count"><div class="num"><b>' + count + '</b>/' + srv.max + ' players</div>' + BF.ui.bar(count, srv.max, full ? 'thin' : 'success thin') + '</div>' +
        '<div class="sr-ping">' + pingBars(srv.ping) + '<span class="num">' + srv.ping + 'ms</span></div>' +
        '<div class="sr-friends">' + (fr.length ? '<span class="pill success" data-tip="' + esc(fr.map((b) => b.displayName).join(', ')) + '">' + BF.icon('users', 12) + fr.length + ' friend' + (fr.length > 1 ? 's' : '') + '</span>' : '') + '</div>' +
        '<div class="sr-act">' + (mine ? '<span class="pill accent">You are here</span>' : full ? '<button class="btn btn-sm" disabled>Full</button>' : '<button class="btn btn-sm btn-play" data-act="join-server" data-game="' + gameId + '" data-server="' + srv.id + '">Join</button>') + '</div></div>';
    }).join('');
    // the crowd's public servers: a sample of busy ones, joined through matchmaking
    const crowd = BF.world.crowd(gameId);
    if (crowd > 0 && !opts.noCrowd) {
      const g = BF.catalog.get(gameId);
      const max = (g && g.maxPlayers) || 12;
      const r = U.rng('pub:' + gameId + ':' + Math.floor(Date.now() / 60000));
      const regions = ['US-East', 'US-West', 'EU-West', 'EU-Central', 'Asia-East', 'Oceania', 'South America'];
      let pub = '';
      for (let i = 0; i < 6; i++) {
        const count = Math.max(1, max - Math.floor(r() * Math.min(4, max / 3)));
        const ping = 20 + Math.floor(r() * 140);
        pub += '<div class="server-row public"><div class="sr-id"><span class="sr-name">Server #' + (100000 + Math.floor(r() * 899999)) + '</span><span class="faint">' + regions[Math.floor(r() * regions.length)] + ' · public</span></div>' +
          '<div class="sr-avatars"><span class="faint" style="font-size:12px">' + BF.icon('users', 12) + ' ' + count + ' players</span></div>' +
          '<div class="sr-count"><div class="num"><b>' + count + '</b>/' + max + ' players</div>' + BF.ui.bar(count, max, 'success thin') + '</div>' +
          '<div class="sr-ping">' + pingBars(ping) + '<span class="num">' + ping + 'ms</span></div><div class="sr-friends"></div>' +
          '<div class="sr-act">' + (count >= max ? '<button class="btn btn-sm" disabled>Full</button>' : '<button class="btn btn-sm btn-play" data-act="play" data-game="' + gameId + '">Join</button>') + '</div></div>';
      }
      rows = '<div class="server-summary">' + BF.icon('server', 14) + '<b class="num">' + U.fmt(BF.world.serverTotal(gameId)) + '</b> servers · <b class="num">' + U.fmt(BF.world.playerCount(gameId)) + '</b> playing now</div>' + rows + pub +
        '<div class="server-summary faint">+ ' + U.fmt(Math.max(0, BF.world.serverTotal(gameId) - (BF.world.servers.get(gameId) || []).length - 6)) + ' more public servers</div>';
    }
    const sl = !opts.noSecret && BF.secrets.sleeper(gameId);
    if (sl) {
      rows += '<div class="server-row sleeping" data-sleeper><div class="sr-id"><span class="sr-name">Server #' + sl.id + '</span><span class="faint">— · up ∞</span></div>' +
        '<div class="sr-avatars"><span class="sleep-glyph" data-tip="zzz">' + esc(sl.glyph) + '</span></div>' +
        '<div class="sr-count"><div class="num"><b>0</b>/0 players</div>' + BF.ui.bar(0, 1, 'thin') + '</div>' +
        '<div class="sr-ping">' + pingBars(999) + '<span class="num">∞</span></div><div class="sr-friends"><span class="faint" style="font-size:11px">' + sl.index + '/' + sl.of + '</span></div>' +
        '<div class="sr-act"><button class="btn btn-sm btn-ghost" data-sleeper-btn>Sleeping</button></div></div>';
    }
    return rows || BF.ui.empty({ icon: 'server', title: 'No servers running', text: 'Press Play to start the first one.' });
  }
  BF.ui.serverRows = serverRows;

  function aboutTab(g, st) {
    const s = BF.store.state;
    const pr = s.progress[g.id];
    const passCount = (g.passes || []).filter((p) => BF.passes.owns(p.id)).length;
    return '<div class="about-grid"><div>' +
      '<div class="panel"><h3 class="panel-title">' + BF.icon('info', 17) + 'Description</h3><p class="game-desc">' + esc(g.description) + '</p>' +
      (g.howTo ? '<div class="howto"><div class="eyebrow">Objective</div><p>' + esc(g.howTo) + '</p></div>' : '') +
      (g.controls ? '<div class="howto"><div class="eyebrow">Controls</div><p>' + esc(g.controls) + '</p></div>' : '') +
      '<div class="chips" style="margin-top:14px">' + (g.categories || []).map((c) => '<a class="chip" href="#/discover?cat=' + encodeURIComponent(c) + '">' + esc(c) + '</a>').join('') + '</div></div>' +
      (g.changelog && g.changelog.length ? '<div class="panel" style="margin-top:14px"><h3 class="panel-title">' + BF.icon('refresh', 17) + 'Update log</h3><div class="changelog">' + g.changelog.map((c) => '<div class="cl-row"><span class="pill">v' + esc(c.v) + '</span><span class="faint num">' + esc(c.date) + '</span><p>' + esc(c.notes) + '</p></div>').join('') + '</div></div>' : '') +
      '</div><div>' +
      '<div class="panel"><h3 class="panel-title">' + BF.icon('user', 17) + 'Your progress</h3>' + (pr ? '<dl class="kv">' +
        '<div><dt>Sessions</dt><dd class="num">' + U.fmt(pr.plays || 0) + '</dd></div><div><dt>Wins</dt><dd class="num">' + U.fmt(pr.wins || 0) + '</dd></div><div><dt>Losses</dt><dd class="num">' + U.fmt(pr.losses || 0) + '</dd></div><div><dt>Time played</dt><dd>' + U.fmtDuration(pr.timeSec || 0) + '</dd></div>' +
        (g.leaderboard || []).filter((d) => d.stat !== 'wins').map((d) => '<div><dt>' + esc(d.label) + '</dt><dd class="num">' + BF.leaderboards.format(d, pr[d.stat]) + '</dd></div>').join('') +
        '<div><dt>Passes owned</dt><dd class="num">' + passCount + '/' + (g.passes || []).length + '</dd></div></dl>' : '<p class="faint">You have not played yet. Press Play to jump into a server.</p>') + '</div>' +
      '<div class="panel" style="margin-top:14px"><h3 class="panel-title">' + BF.icon('layers', 17) + 'Details</h3><dl class="kv">' +
      '<div><dt>Creator</dt><dd><a class="link" href="' + (g.userGame ? '#/profile' : '#/creator/' + encodeURIComponent(g.creator)) + '">' + esc(g.creator) + '</a></dd></div>' +
      '<div><dt>Created</dt><dd>' + U.fmtDate(g.createdAt) + '</dd></div><div><dt>Updated</dt><dd>' + U.fmtDate(g.updatedAt) + '</dd></div>' +
      '<div><dt>Genre</dt><dd>' + esc(g.genre) + '</dd></div><div><dt>Max players</dt><dd class="num">' + g.maxPlayers + '</dd></div><div><dt>Content rating</dt><dd>' + esc(g.ageRating) + '</dd></div>' +
      '<div><dt>Visits</dt><dd class="num">' + U.fmt(st.visits) + '</dd></div><div><dt>Favorites</dt><dd class="num">' + U.fmt(st.favorites) + '</dd></div></dl></div></div></div>';
  }

  function storeTab(g) {
    const passes = g.passes || [];
    const prods = g.products || [];
    return '<p class="muted" style="margin-bottom:14px">Game passes are permanent and change how ' + esc(g.name) + ' plays. Store items are delivered straight into the game. All purchases use ForgeCoins.</p>' +
      (passes.length ? '<h3 class="section-title" style="margin-bottom:10px">' + BF.icon('ticket', 18) + 'Game Passes</h3><div class="pass-grid">' + passes.map((p) => BF.ui.passCard(p, { hideGame: true })).join('') + '</div>' : BF.ui.empty({ icon: 'ticket', title: 'No game passes yet', text: g.userGame ? 'Add passes from the admin panel in Create.' : '' })) +
      (prods.length ? '<h3 class="section-title" style="margin:22px 0 10px">' + BF.icon('bag', 18) + 'Store</h3><div class="pass-grid">' + prods.map((p) => {
        const item = p.type === 'item' ? BF.ITEMS[p.id] : null;
        const owned = item && BF.inventory.owns(item.id);
        const custom = (BF.store.state.progress[g.id] || {}).custom || {};
        const stock = p.grant ? Object.entries(p.grant).map(([k]) => (custom[k] ? U.fmt(custom[k]) + ' ' + k + ' banked' : '')).filter(Boolean).join(', ') : '';
        return '<div class="pass-card' + (owned ? ' owned' : '') + '"><div class="pc-icon ' + (item ? 'rar-' + item.rarity : '') + '">' + (item ? BF.ui.glyph(item.look.icon, item.look.c1, BF.RARITY[item.rarity].color) : BF.icon('bag', 26)) + '</div><div class="pc-main"><div class="pc-name">' + esc(p.name) + '</div><div class="faint pc-game">' + (item ? 'Tool · ' + BF.RARITY[item.rarity].label : 'Consumable') + '</div><p class="pc-desc">' + esc(p.desc) + (stock ? ' <span class="faint">(' + esc(stock) + ')</span>' : '') + '</p></div>' +
          '<div class="pc-foot">' + (owned ? BF.ui.ownedTag() : BF.ui.coins(p.price) + '<button class="btn btn-sm btn-primary" data-act="buy-product" data-game="' + g.id + '" data-product="' + p.id + '">Buy</button>') + '</div></div>';
      }).join('') + '</div>' : '');
  }

  function badgeRarity(id) {
    const r = U.rng('badge:' + id)();
    return (r * 40 + 2).toFixed(1) + '% of players';
  }

  function badgesTab(g) {
    if (!g.badges.length) return BF.ui.empty({ icon: 'medal', title: 'This game has no badges yet' });
    return '<div class="badge-list">' + g.badges.map((b) => {
      const has = BF.badges.has(b.id);
      const at = has ? BF.store.state.badges[b.id].at : 0;
      return '<div class="badge-row' + (has ? ' earned' : '') + '"><span class="badge-ico">' + BF.icon(b.icon, 24) + '</span><div class="row-main"><div class="row-title">' + esc(b.name) + '</div><div class="row-sub">' + esc(b.desc) + '</div></div><div class="badge-meta"><span class="faint" style="font-size:12px">' + badgeRarity(b.id) + '</span>' + (has ? '<span class="pill success">' + BF.icon('check', 11) + 'Earned ' + U.fmtDate(at) + '</span>' : '<span class="pill">' + BF.icon('lock', 11) + 'Locked</span>') + '</div></div>';
    }).join('') + '</div>';
  }

  function serversTab(g) {
    return '<div class="servers-head"><p class="muted">Pick a server to join a specific group, or press Play to be matched to the best one.</p><div style="display:flex;gap:8px"><button class="btn btn-sm btn-outline" data-srv-refresh>' + BF.icon('refresh', 14) + 'Refresh</button><button class="btn btn-sm btn-outline" data-srv-new>' + BF.icon('plus', 14) + 'Start new server</button></div></div>' +
      '<div class="server-list" id="server-list">' + serverRows(g.id) + '</div>';
  }

  function leaderboardTab(g) {
    const defs = g.leaderboard || [];
    if (!defs.length) return BF.ui.empty({ icon: 'podium', title: 'No leaderboard for this game' });
    const stat = lbStat[g.id] || defs[0].stat;
    const lb = BF.leaderboards.game(g.id, stat);
    return '<div class="chips" style="margin-bottom:14px">' + defs.map((d) => '<button class="chip' + (d.stat === stat ? ' on' : '') + '" data-lbstat="' + d.stat + '">' + esc(d.label) + '</button>').join('') + '</div>' + BF.pages.lbTable(lb.rows, lb.you, lb.def);
  }

  BF.pages.register('game', {
    title: (p) => { const g = BF.catalog.get(p.id); return g ? g.name : 'Game'; },
    nav: 'games',
    keepScrollOnParams: true,
    watch: ['passes', 'badges', 'progress', 'catalog', 'created', 'inventory'],
    render(params) {
      const g = BF.catalog.get(params.id);
      if (!g) return BF.ui.empty({ icon: 'gamepad', title: 'Game not found', text: 'It may have been unpublished or deleted.', action: { label: 'Discover games', href: '#/discover' } });
      const tab = params.tab || 'about';
      const st = BF.catalog.stats(g.id);
      const fav = BF.catalog.isFavorite(g.id);
      const vote = BF.catalog.myVote(g.id);
      const owner = g.userGame;
      const passesOwned = (g.passes || []).filter((p) => BF.passes.owns(p.id));
      const tabs = BF.ui.tabs([
        { id: 'about', label: 'About', href: '#/game/' + g.id, icon: 'info' },
        { id: 'store', label: 'Store', href: '#/game/' + g.id + '/store', icon: 'ticket', count: (g.passes || []).length + (g.products || []).length },
        { id: 'badges', label: 'Badges', href: '#/game/' + g.id + '/badges', icon: 'medal', count: g.badges.length },
        { id: 'servers', label: 'Servers', href: '#/game/' + g.id + '/servers', icon: 'server', count: BF.world.serverTotal(g.id) },
        { id: 'leaderboard', label: 'Leaderboard', href: '#/game/' + g.id + '/leaderboard', icon: 'podium' },
      ], tab);
      const body = tab === 'store' ? storeTab(g) : tab === 'badges' ? badgesTab(g) : tab === 'servers' ? serversTab(g) : tab === 'leaderboard' ? leaderboardTab(g) : aboutTab(g, st);
      return '<section class="game-hero">' +
        '<div class="gh-thumb"><img src="' + BF.thumbs.url(g) + '" alt="' + esc(g.name) + ' thumbnail"></div>' +
        '<div class="gh-info"><div class="gh-tags"><span class="pill accent">' + esc(g.genre) + '</span><span class="pill">' + esc(g.ageRating) + '</span><span class="pill">Up to ' + g.maxPlayers + ' players</span>' + (owner ? '<span class="pill gold">Your game</span>' : '') + (passesOwned.length ? '<span class="pill success">' + BF.icon('ticket', 11) + passesOwned.length + ' pass' + (passesOwned.length > 1 ? 'es' : '') + '</span>' : '') + '</div>' +
        '<h1 class="gh-title">' + esc(g.name) + '</h1><div class="gh-creator">By <a class="link" href="' + (owner ? '#/profile' : '#/creator/' + encodeURIComponent(g.creator)) + '">' + esc(g.creator) + '</a></div>' +
        '<div class="gh-actions"><button class="btn btn-xl btn-play" data-act="play" data-game="' + g.id + '" id="play-btn">' + BF.icon('play', 20) + 'PLAY</button>' +
        '<button class="icon-btn gh-ib' + (fav ? ' fav-on' : '') + '" data-act="fav" data-game="' + g.id + '" data-tip="' + (fav ? 'Remove favorite' : 'Favorite') + '" aria-label="Favorite">' + BF.icon('heart', 20) + '</button>' +
        '<button class="icon-btn gh-ib' + (vote === 'like' ? ' on' : '') + '" data-act="vote" data-game="' + g.id + '" data-vote="like" data-tip="Like" aria-label="Like">' + BF.icon('thumbUp', 20) + '</button>' +
        '<button class="icon-btn gh-ib' + (vote === 'dislike' ? ' on' : '') + '" data-act="vote" data-game="' + g.id + '" data-vote="dislike" data-tip="Dislike" aria-label="Dislike">' + BF.icon('thumbDown', 20) + '</button>' +
        '<button class="icon-btn gh-ib" data-act="share" data-game="' + g.id + '" data-tip="Copy share link" aria-label="Share">' + BF.icon('share', 20) + '</button>' +
        (owner ? '<a class="btn btn-outline" href="#/create/' + g.id + '">' + BF.icon('anvil', 15) + 'Manage</a>' : '') + '</div>' +
        '<div class="gh-rating"><div class="ghr-bar"><i style="width:' + (st.approval * 100).toFixed(1) + '%"></i></div><span class="faint num">' + BF.icon('thumbUp', 12) + ' ' + U.compact(st.likes) + ' · ' + BF.icon('thumbDown', 12) + ' ' + U.compact(st.dislikes) + ' · ' + Math.round(st.approval * 100) + '% liked</span></div>' +
        '<div class="gh-stats"><div><span class="faint">Playing</span><b class="num"><span class="live-dot"></span> <span data-live="playing:' + g.id + '">' + U.fmt(st.playing) + '</span></b></div><div><span class="faint">Visits</span><b class="num">' + U.compact(st.visits) + '</b></div><div><span class="faint">Favorites</span><b class="num">' + U.compact(st.favorites) + '</b></div><div><span class="faint">Created</span><b>' + U.fmtDate(g.createdAt) + '</b></div><div><span class="faint">Updated</span><b>' + U.fmtDate(g.updatedAt) + '</b></div><div><span class="faint">Genre</span><b>' + esc(g.genre) + '</b></div></div>' +
        '</div></section>' + BF.ui.updateBanner(g) + tabs + '<div id="game-tab">' + body + '</div>';
    },
    mount(root, params) {
      const g = BF.catalog.get(params.id);
      if (!g) return;
      const list = root.querySelector('#server-list');
      const refreshServers = () => { const l = root.querySelector('#server-list'); if (l) l.innerHTML = serverRows(g.id); };
      if (list) {
        liveOff = BF.bus.on('ui:live', refreshServers);
        root.querySelector('[data-srv-refresh]').addEventListener('click', () => { refreshServers(); BF.ui.toast({ title: 'Server list refreshed', kind: 'info', icon: 'refresh' }); });
        root.querySelector('[data-srv-new]').addEventListener('click', () => {
          const srv = BF.world.newServer(g.id);
          BF.play(g.id, srv.id);
        });
        root.addEventListener('click', (e) => {
          if (e.target.closest('[data-sleeper-btn]')) {
            BF.ui.toast({ title: 'The server is sleeping.', text: '…the core is cold.', kind: 'info', icon: 'moon' });
          }
        });
      }
      root.querySelectorAll('[data-lbstat]').forEach((b) => b.addEventListener('click', () => { lbStat[g.id] = b.dataset.lbstat; BF.router.refresh(); }));
    },
    unmount() {
      if (liveOff) liveOff();
      liveOff = null;
    },
  });
})((window.BF = window.BF || {}));
