/**
 * BlockForge — Discover (categories, search, sort, filters), Games library,
 * global Search results and Creator pages.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const esc = U.esc;

  const SORTS = [
    ['popular', 'Most players'],
    ['trending', 'Trending'],
    ['rating', 'Top rated'],
    ['visits', 'Most visited'],
    ['favorites', 'Most favorited'],
    ['updated', 'Recently updated'],
    ['new', 'Newest'],
    ['name', 'Name A–Z'],
  ];
  const PLAYING = [['any', 'Any'], ['quiet', 'Under 10'], ['busy', '10–25'], ['packed', '25+']];
  const SIZE = [['any', 'Any size'], ['small', 'Small (≤8)'], ['medium', 'Medium (9–16)'], ['large', 'Large (17+)']];
  const POP = [['any', 'Any'], ['hits', 'Hits (10M+ visits)'], ['gems', 'Hidden gems (<10M)']];
  const AGE = [['any', 'Any age'], ['All Ages', 'All Ages'], ['9+', '9+'], ['13+', '13+']];

  const disc = {
    cat: 'All', sort: 'popular', q: '', playing: 'any', size: 'any', pop: 'any', age: 'any', recent: false,
  };

  function filtered() {
    let list = BF.catalog.all();
    const q = disc.q.trim().toLowerCase();
    if (q) list = list.filter((g) => g.name.toLowerCase().includes(q) || g.creator.toLowerCase().includes(q) || (g.categories || []).some((c) => c.toLowerCase().includes(q)) || g.description.toLowerCase().includes(q));
    if (['Popular', 'Trending', 'New'].includes(disc.cat)) list = BF.catalog.inCategory(disc.cat, list);
    else if (disc.cat !== 'All') list = list.filter((g) => (g.categories || [g.genre]).includes(disc.cat));
    list = list.filter((g) => {
      const st = BF.catalog.stats(g.id);
      if (disc.playing === 'quiet' && st.playing >= 10) return false;
      if (disc.playing === 'busy' && (st.playing < 10 || st.playing > 25)) return false;
      if (disc.playing === 'packed' && st.playing <= 25) return false;
      if (disc.size === 'small' && g.maxPlayers > 8) return false;
      if (disc.size === 'medium' && (g.maxPlayers < 9 || g.maxPlayers > 16)) return false;
      if (disc.size === 'large' && g.maxPlayers < 17) return false;
      if (disc.pop === 'hits' && st.visits < 1e7) return false;
      if (disc.pop === 'gems' && st.visits >= 1e7) return false;
      if (disc.age !== 'any' && g.ageRating !== disc.age) return false;
      if (disc.recent && BF.clock.now() - new Date(g.updatedAt).getTime() > 30 * 86400000) return false;
      return true;
    });
    if (!['Popular', 'Trending', 'New'].includes(disc.cat) || disc.sort !== 'popular') list = BF.catalog.sort(list, disc.sort);
    return list;
  }

  function activeFilterCount() {
    return ['playing', 'size', 'pop', 'age'].filter((k) => disc[k] !== 'any').length + (disc.recent ? 1 : 0);
  }

  function resultsHtml() {
    const list = filtered();
    return '<div class="results-meta"><span class="faint">' + U.plural(list.length, 'game') + (disc.cat !== 'All' ? ' in ' + esc(disc.cat) : '') + '</span>' + (activeFilterCount() || disc.q ? '<button class="btn btn-xs btn-ghost" data-disc-reset>' + BF.icon('x', 12) + 'Clear filters</button>' : '') + '</div>' +
      (list.length ? '<div class="grid-cards">' + list.map((g) => BF.ui.gameCard(g)).join('') + '</div>' : BF.ui.empty({ icon: 'search', title: 'No games match those filters', text: 'Try another category or clear a filter.' }));
  }

  function select(id, opts, val, label) {
    return '<label class="mini-select"><span>' + label + '</span><select class="select" id="' + id + '">' + opts.map((o) => '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></label>';
  }

  BF.pages.register('discover', {
    title: 'Discover',
    nav: 'discover',
    loading: () => '<div class="skel" style="height:34px;width:220px;margin-bottom:18px"></div>' + BF.ui.skeletonCards(12),
    render(params, query) {
      if (query.cat) disc.cat = query.cat;
      if (query.q != null) disc.q = query.q;
      if (query.sort) disc.sort = query.sort;
      const all = BF.catalog.all();
      const cats = ['All', 'Popular', 'Trending', 'New'].concat(BF.GAME_CATEGORIES);
      const count = (c) => (['All', 'Popular', 'Trending', 'New'].includes(c) ? all.length : all.filter((g) => (g.categories || []).includes(c)).length);
      return '<div class="page-head"><div><h1 class="page-title">Discover</h1><p class="page-sub">' + U.plural(all.length, 'experience') + ' · <span data-live="online:x">' + U.fmt(BF.world.totalOnline()) + '</span> players online now</p></div></div>' +
        '<div class="chips scroll" style="margin-bottom:14px">' + cats.map((c) => '<button class="chip' + (disc.cat === c ? ' on' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + (count(c) && !['All', 'Popular', 'Trending', 'New'].includes(c) ? '<span class="count">' + count(c) + '</span>' : '') + '</button>').join('') + '</div>' +
        '<div class="toolbar"><div class="search-box inline"><input class="input" id="disc-q" type="search" placeholder="Search games, creators or genres" value="' + esc(disc.q) + '" autocomplete="off">' + BF.icon('search', 16) + '</div>' +
        select('disc-sort', SORTS, disc.sort, 'Sort') +
        '<button class="btn btn-outline" id="disc-filter-btn" aria-expanded="false">' + BF.icon('filter', 15) + 'Filters' + (activeFilterCount() ? '<span class="count-badge" style="background:var(--accent);color:var(--accent-ink)">' + activeFilterCount() + '</span>' : '') + '</button></div>' +
        '<div class="filter-panel" id="disc-filters" hidden>' +
        select('f-playing', PLAYING, disc.playing, 'Playing now') + select('f-size', SIZE, disc.size, 'Server size') + select('f-pop', POP, disc.pop, 'Popularity') + select('f-age', AGE, disc.age, 'Age rating') +
        '<label class="check-row"><span class="switch"><input type="checkbox" id="f-recent"' + (disc.recent ? ' checked' : '') + '><span></span></span>Updated in the last 30 days</label></div>' +
        (BF.ads ? '<section class="section sponsored-row" style="margin-bottom:16px">' + BF.ui.sectionHead('Sponsored', 'megaphone', { href: '#/create', label: 'Advertise' }) + '<div class="row-scroll">' + BF.ui.sponsoredCards('discover', 3) + '</div></section>' : '') +
        '<div id="disc-results">' + resultsHtml() + '</div>';
    },
    mount(root) {
      const refresh = () => {
        root.querySelector('#disc-results').innerHTML = resultsHtml();
        const fb = root.querySelector('#disc-filter-btn');
        const n = activeFilterCount();
        fb.innerHTML = BF.icon('filter', 15) + 'Filters' + (n ? '<span class="count-badge" style="background:var(--accent);color:var(--accent-ink)">' + n + '</span>' : '');
      };
      root.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
        disc.cat = b.dataset.cat;
        root.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b));
        BF.sfx.play('tab');
        refresh();
      }));
      const q = root.querySelector('#disc-q');
      q.addEventListener('input', U.debounce(() => { disc.q = q.value; refresh(); }, 140));
      root.querySelector('#disc-sort').addEventListener('change', (e) => { disc.sort = e.target.value; refresh(); });
      const fb = root.querySelector('#disc-filter-btn');
      const panel = root.querySelector('#disc-filters');
      fb.addEventListener('click', () => { panel.hidden = !panel.hidden; fb.setAttribute('aria-expanded', String(!panel.hidden)); });
      [['f-playing', 'playing'], ['f-size', 'size'], ['f-pop', 'pop'], ['f-age', 'age']].forEach(([id, key]) => root.querySelector('#' + id).addEventListener('change', (e) => { disc[key] = e.target.value; refresh(); }));
      root.querySelector('#f-recent').addEventListener('change', (e) => { disc.recent = e.target.checked; refresh(); });
      root.addEventListener('click', (e) => {
        if (!e.target.closest('[data-disc-reset]')) return;
        Object.assign(disc, { q: '', playing: 'any', size: 'any', pop: 'any', age: 'any', recent: false });
        BF.router.refresh();
      });
    },
  });

  // ----------------------------------------------------------------- games

  BF.pages.register('games', {
    title: 'Games',
    nav: 'games',
    watch: ['catalog', 'recent', 'created'],
    render(params) {
      const s = BF.store.state;
      const tab = params.tab || 'all';
      const all = BF.catalog.all();
      const favs = s.catalog.favorites.map((id) => BF.catalog.get(id)).filter(Boolean);
      const recent = s.recent.map((r) => ({ g: BF.catalog.get(r.gameId), ts: r.ts })).filter((x) => x.g);
      const mine = s.created.filter((g) => g.published).map((g) => BF.catalog.get(g.id)).filter(Boolean);
      const tabs = BF.ui.tabs([
        { id: 'all', label: 'All Games', href: '#/games', count: all.length },
        { id: 'favorites', label: 'Favorites', href: '#/games/favorites', count: favs.length },
        { id: 'recent', label: 'Recently Played', href: '#/games/recent', count: recent.length },
        { id: 'passes', label: 'My Game Passes', href: '#/games/passes', count: Object.keys(s.passes).length },
        { id: 'created', label: 'Published by You', href: '#/games/created', count: mine.length },
      ], tab);
      let body = '';
      if (tab === 'all') {
        const groups = BF.GAME_CATEGORIES.map((c) => [c, all.filter((g) => g.genre === c)]).filter((x) => x[1].length);
        body = '<div class="grid-cards">' + BF.catalog.sort(all, 'popular').map((g) => BF.ui.gameCard(g)).join('') + '</div>' +
          '<div class="section"><h2 class="section-title" style="margin-bottom:12px">' + BF.icon('layers', 18) + 'By genre</h2><div class="genre-grid">' + groups.map(([c, list]) => '<a class="genre-tile" href="#/discover?cat=' + encodeURIComponent(c) + '"><span class="gt-thumbs">' + list.slice(0, 3).map((g) => '<img src="' + BF.thumbs.url(g) + '" alt="">').join('') + '</span><span class="gt-name">' + esc(c) + '</span><span class="faint">' + U.plural(list.length, 'game') + '</span></a>').join('') + '</div></div>';
      } else if (tab === 'favorites') {
        body = favs.length ? '<div class="grid-cards">' + favs.map((g) => BF.ui.gameCard(g)).join('') + '</div>' : BF.ui.empty({ icon: 'heart', title: 'No favorites yet', text: 'Tap the heart on any game card to keep it here.', action: { label: 'Discover games', href: '#/discover' } });
      } else if (tab === 'recent') {
        body = recent.length ? '<div class="list panel tight">' + recent.map((x) => {
          const pr = s.progress[x.g.id] || {};
          return '<div class="list-row" data-ctx="game" data-game="' + x.g.id + '"><img class="row-thumb" src="' + BF.thumbs.url(x.g) + '" alt=""><div class="row-main"><a class="row-title" href="#/game/' + x.g.id + '">' + esc(x.g.name) + '</a><div class="row-sub">Last played ' + U.timeAgo(x.ts, BF.clock.now()) + ' · ' + U.plural(pr.plays || 0, 'session') + ' · ' + U.plural(pr.wins || 0, 'win') + ' · ' + U.fmtDuration(pr.timeSec || 0) + ' played</div></div><div class="row-actions"><button class="btn btn-sm btn-play" data-act="play" data-game="' + x.g.id + '">' + BF.icon('play', 12) + 'Play</button></div></div>';
        }).join('') + '</div>' : BF.ui.empty({ icon: 'history', title: 'Nothing played yet', text: 'Games you join show up here.', action: { label: 'Find a game', href: '#/discover' } });
      } else if (tab === 'passes') {
        const owned = Object.keys(s.passes).map((pid) => BF.passes.get(pid)).filter(Boolean);
        body = owned.length ? '<div class="pass-grid">' + owned.map((p) => passCard(p)).join('') + '</div>' : BF.ui.empty({ icon: 'ticket', title: 'No game passes yet', text: 'Game passes permanently change how a game plays: double XP, new maps, faster cars and more.', action: { label: 'Browse Block Battlegrounds passes', href: '#/game/block-battlegrounds/store' } });
      } else {
        body = mine.length ? '<div class="grid-cards">' + mine.map((g) => BF.ui.gameCard(g)).join('') + '</div>' : BF.ui.empty({ icon: 'anvil', title: 'You have not published a game', text: 'Build one from a template in Create, then publish it to the platform.', action: { label: 'Open Create', href: '#/create' } });
      }
      return '<div class="page-head"><div><h1 class="page-title">Games</h1><p class="page-sub">Your library, favorites and history.</p></div><a class="btn btn-outline" href="#/discover">' + BF.icon('compass', 15) + 'Discover</a></div>' + tabs + body;
    },
  });

  /** A pass's price, showing the original struck through during an update sale. */
  function passPriceTag(p) {
    const now = BF.passes.price(p);
    return now < p.price ? '<span class="pc-sale"><s class="faint num">' + U.fmt(p.price) + '</s>' + BF.ui.coins(now) + '</span>' : BF.ui.coins(p.price);
  }

  /** Game pass card (store tab + library). */
  function passCard(p, opts) {
    opts = opts || {};
    const owned = BF.passes.owns(p.id);
    const game = BF.catalog.get(p.gameId);
    return '<div class="pass-card' + (owned ? ' owned' : '') + '"><div class="pc-icon">' + BF.icon(p.icon || 'ticket', 26) + '</div><div class="pc-main"><div class="pc-name">' + esc(p.name) + '</div>' + (opts.hideGame ? '' : '<a class="faint pc-game" href="#/game/' + p.gameId + '">' + esc(game ? game.name : '') + '</a>') + '<p class="pc-desc">' + esc(p.desc) + '</p></div>' +
      '<div class="pc-foot">' + (owned ? BF.ui.ownedTag('Owned') + (opts.hideGame ? '' : '<button class="btn btn-xs btn-play" data-act="play" data-game="' + p.gameId + '">Play</button>') : passPriceTag(p) + '<button class="btn btn-sm btn-primary" data-act="buy-pass" data-pass="' + p.id + '">Buy</button>') + '</div></div>';
  }
  BF.ui.passCard = passCard;

  // ---------------------------------------------------------------- search

  BF.pages.register('search', {
    title: (p, q) => 'Search: ' + (q.q || ''),
    nav: 'discover',
    loading: () => BF.ui.skeletonCards(8),
    render(params, query) {
      const q = query.q || '';
      const tab = query.tab || 'all';
      const r = BF.search.query(q, 60);
      const total = r.games.length + r.players.length + r.items.length + r.creators.length;
      const link = (t) => BF.router.link('/search', { q, tab: t });
      const tabs = BF.ui.tabs([
        { id: 'all', label: 'All', href: link('all'), count: total },
        { id: 'games', label: 'Games', href: link('games'), count: r.games.length },
        { id: 'players', label: 'Players', href: link('players'), count: r.players.length },
        { id: 'items', label: 'Avatar Items', href: link('items'), count: r.items.length },
        { id: 'creators', label: 'Creators', href: link('creators'), count: r.creators.length },
      ], tab);
      const games = r.games.length ? '<div class="grid-cards">' + r.games.map((g) => BF.ui.gameCard(g)).join('') + '</div>' : '';
      const players = r.players.length ? '<div class="list panel tight">' + r.players.map((p) => p.me ? '<div class="list-row">' + BF.ui.avatarChip(BF.store.state.avatar) + '<div class="row-main"><a class="row-title" href="#/profile">' + esc(p.displayName) + ' <span class="pill accent">You</span></a><div class="row-sub">@' + esc(p.username) + '</div></div></div>' : BF.ui.userRow(p, socialButtons(p.id))).join('') + '</div>' : '';
      const items = r.items.length ? '<div class="grid-cards items">' + r.items.map((i) => BF.ui.itemCard(i)).join('') + '</div>' : '';
      const creators = r.creators.length ? '<div class="creator-grid">' + r.creators.map((c) => '<a class="creator-card" href="#/creator/' + encodeURIComponent(c.name) + '"><span class="cc-mark">' + BF.icon('anvil', 22) + '</span><span><b>' + esc(c.name) + '</b><span class="faint">' + U.plural(c.games, 'game') + ' · ' + U.plural(c.items, 'avatar item') + '</span></span></a>').join('') + '</div>' : '';
      let body;
      if (!q) body = BF.ui.empty({ icon: 'search', title: 'Search BlockForge', text: 'Find games, players, avatar items and creators. Press / anywhere to jump to search.' });
      else if (!total) body = BF.ui.empty({ icon: 'search', title: 'No results for “' + q + '”', text: 'Check the spelling or try a shorter word.' });
      else if (tab === 'all') body = (BF.ads && (tab === 'all') ? '<section class="section sponsored-row">' + BF.ui.sectionHead('Sponsored', 'megaphone') + '<div class="row-scroll">' + BF.ui.sponsoredCards('search', 1) + '</div></section>' : '') + (games ? '<section class="section">' + BF.ui.sectionHead('Games', 'gamepad', r.games.length > 5 ? { href: link('games'), label: 'All ' + r.games.length } : null) + '<div class="grid-cards">' + r.games.slice(0, 5).map((g) => BF.ui.gameCard(g)).join('') + '</div></section>' : '') +
        (players ? '<section class="section">' + BF.ui.sectionHead('Players', 'users', r.players.length > 5 ? { href: link('players'), label: 'All ' + r.players.length } : null) + '<div class="list panel tight">' + r.players.slice(0, 5).map((p) => p.me ? '<div class="list-row">' + BF.ui.avatarChip(BF.store.state.avatar) + '<div class="row-main"><a class="row-title" href="#/profile">' + esc(p.displayName) + ' <span class="pill accent">You</span></a></div></div>' : BF.ui.userRow(p, socialButtons(p.id))).join('') + '</div></section>' : '') +
        (items ? '<section class="section">' + BF.ui.sectionHead('Avatar Items', 'bag', r.items.length > 6 ? { href: link('items'), label: 'All ' + r.items.length } : null) + '<div class="grid-cards items">' + r.items.slice(0, 6).map((i) => BF.ui.itemCard(i)).join('') + '</div></section>' : '') +
        (creators ? '<section class="section">' + BF.ui.sectionHead('Creators', 'anvil') + creators + '</section>' : '');
      else body = { games, players, items, creators }[tab] || BF.ui.empty({ icon: 'search', title: 'Nothing in this tab' });
      if (q && tab !== 'all' && !body) body = BF.ui.empty({ icon: 'search', title: 'No ' + tab + ' match “' + q + '”' });
      return '<div class="page-head"><div><h1 class="page-title">' + (q ? 'Results for “' + esc(q) + '”' : 'Search') + '</h1>' + (q ? '<p class="page-sub">' + U.plural(total, 'result') + '</p>' : '') + '</div></div>' + (q ? tabs : '') + body;
    },
  });

  function socialButtons(id) {
    if (BF.friends.isFriend(id)) return '<a class="btn btn-xs btn-outline" href="#/messages/' + id + '">Message</a>';
    if (BF.friends.hasOutgoing(id)) return '<span class="pill">Request sent</span>';
    if (BF.friends.hasIncoming(id)) return '<button class="btn btn-xs btn-primary" data-act="accept-friend" data-bot="' + id + '">Accept</button>';
    if (BF.friends.isBlocked(id)) return '<span class="pill danger">Blocked</span>';
    return '<button class="btn btn-xs btn-primary" data-act="add-friend" data-bot="' + id + '">' + BF.icon('userPlus', 13) + 'Add</button>';
  }
  BF.ui.socialButtons = socialButtons;

  // --------------------------------------------------------------- creator

  BF.pages.register('creatorpage', {
    title: (p) => decodeURIComponent(p.name || 'Creator'),
    nav: 'discover',
    render(params) {
      const name = params.name;
      const games = BF.catalog.all().filter((g) => g.creator === name);
      const items = BF.ITEM_LIST.filter((i) => i.creator === name && i.cat !== 'tool');
      if (!games.length && !items.length) return BF.ui.empty({ icon: 'anvil', title: 'Creator not found', action: { label: 'Back to Discover', href: '#/discover' } });
      const visits = games.reduce((a, g) => a + BF.catalog.stats(g.id).visits, 0);
      const playing = games.reduce((a, g) => a + BF.world.playerCount(g.id), 0);
      const studio = BF.creatorEconomy ? BF.creatorEconomy.studio(name) : null;
      const rank = studio ? BF.creatorEconomy.studios().indexOf(studio) + 1 : 0;
      const people = studio ? '<section class="section">' + BF.ui.sectionHead('The team', 'users') + '<div class="studio-team">' + [{ b: studio.owner, role: 'Founder and owner', share: BF.creatorEconomy.T.ownerShare }].concat(studio.team.map((b) => ({ b, role: 'Developer', share: BF.creatorEconomy.T.teamShare }))).map((x) => '<a class="team-card" href="#/user/' + x.b.id + '">' + BF.ui.avatarChip(x.b.avatar, { size: 'lg' }) + '<span><b>' + esc(x.b.displayName) + '</b><span class="faint">' + x.role + '</span><span class="num tc-worth">' + BF.coinIcon(12) + ' ' + U.compact(Math.floor(studio.lifetime * x.share)) + '</span></span></a>').join('') + '</div></section>' : '';
      const money = studio ? '<div class="studio-money"><div><span class="faint">Lifetime earnings</span><b class="num" data-live="studio-life:' + esc(name) + '">' + BF.coinIcon(16) + ' ' + U.fmt(studio.lifetime) + '</b></div><div><span class="faint">Earning right now</span><b class="num delta-pos">+' + U.fmt(Math.round(studio.perMin)) + ' / min</b></div><div><span class="faint">Creator rank</span><b class="num">#' + rank + '</b></div></div>' : '';
      return '<div class="creator-hero"><span class="ch-mark">' + BF.icon('anvil', 34) + '</span><div><div class="eyebrow">' + (studio ? 'Studio' : 'Creator') + '</div><h1 class="page-title">' + esc(name) + '</h1><div class="ch-stats"><span><b class="num">' + games.length + '</b> games</span><span><b class="num">' + items.length + '</b> avatar items</span><span><b class="num">' + U.compact(visits) + '</b> visits</span><span><b class="num">' + U.fmt(playing) + '</b> playing now</span></div>' + money + '</div></div>' + people +
        (games.length ? '<section class="section">' + BF.ui.sectionHead('Games', 'gamepad') + '<div class="grid-cards">' + games.map((g) => BF.ui.gameCard(g)).join('') + '</div></section>' : '') +
        (items.length ? '<section class="section">' + BF.ui.sectionHead('Avatar items', 'bag') + '<div class="grid-cards items">' + items.map((i) => BF.ui.itemCard(i)).join('') + '</div></section>' : '');
    },
  });
})((window.BF = window.BF || {}));
