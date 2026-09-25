/**
 * BlockForge — Create: My Creations, the new-game form and the game admin panel.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const esc = U.esc;
  let draft = null;
  let liveOff = null;

  function freshDraft() {
    return { name: '', description: '', genre: 'Fighting', template: 'arena', maxPlayers: 12, visibility: 'public', difficulty: 'normal', thumbnail: { type: 'preset', color: BF.creator.THUMB_COLORS[0], pattern: 'grid' } };
  }

  function statusPill(ug) {
    if (!ug.published) return '<span class="pill">Draft</span>';
    if (ug.visibility === 'private') return '<span class="pill info">Private</span>';
    if (ug.visibility === 'friends') return '<span class="pill info">Friends only</span>';
    return '<span class="pill success">' + BF.icon('globe', 11) + 'Published</span>';
  }

  // ---------------------------------------------------------- my creations

  BF.pages.register('create', {
    title: 'Create',
    nav: 'create',
    watch: [],
    render() {
      const list = BF.creator.list();
      const totals = list.reduce((a, g) => ({ visits: a.visits + g.visits, pending: a.pending + (g.pending || 0), revenue: a.revenue + (g.revenue || 0) }), { visits: 0, pending: 0, revenue: 0 });
      const templates = Object.entries(BF.creator.TEMPLATES);
      return '<div class="page-head"><div><h1 class="page-title">Create</h1><p class="page-sub">Build a game from a playable template, publish it, and watch players arrive.</p></div><a class="btn btn-primary btn-lg" href="#/create/new">' + BF.icon('plus', 17) + 'Create new game</a></div>' +
        (list.length ? '<div class="stat-strip"><div><span class="faint">Games</span><b class="num">' + list.length + '</b></div><div><span class="faint">Published</span><b class="num">' + list.filter((g) => g.published).length + '</b></div><div><span class="faint">Total visits</span><b class="num">' + U.fmt(totals.visits) + '</b></div><div><span class="faint">Lifetime revenue</span>' + BF.ui.coins(Math.floor(totals.revenue)) + '</div><div><span class="faint">Ready to collect</span>' + BF.ui.coins(Math.floor(totals.pending)) + '</div></div>' : '') +
        (list.length ? '<section class="section"><div id="earn-host">' + BF.creatorTabs.earnings(null) + '</div></section>' : '') +
        '<section class="section">' + BF.ui.sectionHead('My Creations', 'anvil') +
        (list.length ? '<div class="creations">' + list.map((ug) => {
          const listing = BF.creator.toListing(ug);
          const playing = BF.world.playerCount(ug.id);
          return '<article class="creation" data-ctx="game" data-game="' + ug.id + '"><a class="cr-thumb" href="#/create/' + ug.id + '"><img src="' + BF.thumbs.url(listing) + '" alt=""></a><div class="cr-main"><div class="cr-top"><a class="row-title" href="#/create/' + ug.id + '">' + esc(ug.name) + '</a>' + statusPill(ug) + '</div>' +
            '<div class="row-sub">' + esc(BF.creator.TEMPLATES[ug.template].label) + ' template · ' + esc(ug.genre) + ' · up to ' + ug.maxPlayers + ' players · updated ' + U.timeAgo(ug.updatedAt, BF.clock.now()) + '</div>' +
            '<div class="cr-stats"><span><span class="live-dot"></span> <span data-live="playing:' + ug.id + '">' + playing + '</span> playing</span><span>' + U.fmt(ug.visits) + ' visits</span><span>' + BF.icon('thumbUp', 12) + ' ' + U.fmt(ug.likes) + '</span><span>' + BF.icon('heart', 12) + ' ' + U.fmt(ug.favorites) + '</span><span>' + BF.coinIcon(12) + ' ' + U.fmt(Math.floor(ug.pending || 0)) + ' pending</span></div></div>' +
            '<div class="cr-actions"><button class="btn btn-sm btn-play" data-act="play" data-game="' + ug.id + '">' + BF.icon('play', 12) + 'Play</button><a class="btn btn-sm btn-outline" href="#/create/' + ug.id + '">' + BF.icon('gear', 14) + 'Manage</a><a class="btn btn-sm btn-ghost" href="#/create/' + ug.id + '/settings">' + BF.icon('edit', 14) + 'Edit</a>' +
            (ug.published ? '<button class="btn btn-sm btn-ghost" data-unpublish="' + ug.id + '">Unpublish</button>' : '<button class="btn btn-sm btn-primary" data-publish="' + ug.id + '">' + BF.icon('globe', 13) + 'Publish</button>') +
            '<button class="icon-btn sm" data-delete="' + ug.id + '" aria-label="Delete ' + esc(ug.name) + '" data-tip="Delete">' + BF.icon('trash', 15) + '</button></div></article>';
        }).join('') + '</div>' : BF.ui.empty({ icon: 'anvil', title: 'No creations yet', text: 'Pick a template, name your game, and it is instantly playable. Publish it when you are ready for players.', action: { label: 'Create your first game', href: '#/create/new' } })) + '</section>' +
        '<section class="section">' + BF.ui.sectionHead('Templates', 'layers') + '<div class="template-grid">' + templates.map(([k, t]) => '<a class="template-card" href="#/create/new?template=' + k + '"><img src="' + U.svgData(BF.thumbs.template(k, BF.creator.THUMB_COLORS[templates.findIndex((x) => x[0] === k)], 'grid')) + '" alt=""><div><b>' + esc(t.label) + '</b><p class="faint">' + esc(t.desc) + '</p></div></a>').join('') + '</div></section>';
    },
    mount(root) {
      this._off = BF.bus.on('creator:changed', () => BF.router.refresh());
      this._earn = BF.bus.on('store:change', (keys) => { if (!keys.has('created') && !keys.has('ads')) return; const h = root.querySelector('#earn-host'); if (h) h.innerHTML = BF.creatorTabs.earnings(null); });
      root.addEventListener('click', async (e) => {
        const all = e.target.closest('[data-collect-all]');
        if (all) {
          const r = BF.creator.collectAll();
          if (r.ok) { BF.ui.coinFly(all, 10); BF.ui.toast({ title: 'Collected ' + U.fmt(r.amount) + ' ForgeCoins', text: 'Creator earnings from all your games', kind: 'coin' }); }
        }
        const pub = e.target.closest('[data-publish]');
        const unp = e.target.closest('[data-unpublish]');
        const del = e.target.closest('[data-delete]');
        if (pub) { BF.creator.publish(pub.dataset.publish); BF.ui.toast({ title: 'Published!', text: 'Your game is live in Discover and search.', kind: 'success', icon: 'globe' }); }
        if (unp) { const ok = await BF.ui.confirm({ title: 'Unpublish this game?', message: 'Players in its servers are sent home and it disappears from Discover. You can publish again any time.', confirmLabel: 'Unpublish' }); if (ok) { BF.creator.unpublish(unp.dataset.unpublish); BF.ui.toast({ title: 'Unpublished', kind: 'info' }); } }
        if (del) {
          const ug = BF.creator.get(del.dataset.delete);
          const ok = await BF.ui.confirm({ title: 'Delete ' + ug.name + '?', message: 'This permanently deletes the game, its passes and its stats. Pending revenue is lost unless you collect it first.', confirmLabel: 'Delete game', danger: true, icon: 'trash' });
          if (ok) { BF.creator.remove(ug.id); BF.ui.toast({ title: 'Game deleted', kind: 'info', icon: 'trash' }); }
        }
      });
    },
    unmount() {
      if (this._off) this._off();
      if (this._earn) this._earn();
    },
  });

  // --------------------------------------------------------- game form

  function formHtml(d, errors, mode) {
    errors = errors || {};
    const err = (k) => (errors[k] ? '<span class="error">' + esc(errors[k]) + '</span>' : '');
    const listing = { id: 'preview', name: d.name || 'Untitled Game', genre: d.genre, template: d.template, thumbnail: d.thumbnail, creator: BF.store.state.player.username, maxPlayers: d.maxPlayers, builtIn: false };
    return '<form class="game-form" id="game-form" novalidate><div class="gf-fields">' +
      '<div class="field"><label for="gf-name">Game name</label><input class="input' + (errors.name ? ' invalid' : '') + '" id="gf-name" maxlength="40" value="' + esc(d.name) + '" placeholder="e.g. Lava Leap Challenge">' + err('name') + '</div>' +
      '<div class="field"><label for="gf-desc">Description</label><textarea class="textarea" id="gf-desc" maxlength="600" placeholder="What do players do? What makes it fun?">' + esc(d.description) + '</textarea><span class="hint"><span id="gf-desc-n">' + d.description.length + '</span>/600. A good description attracts more players.</span>' + err('description') + '</div>' +
      '<div class="form-grid"><div class="field"><label for="gf-genre">Genre</label><select class="select" id="gf-genre">' + BF.GAME_CATEGORIES.map((c) => '<option' + (c === d.genre ? ' selected' : '') + '>' + c + '</option>').join('') + '</select>' + err('genre') + '</div>' +
      '<div class="field"><label for="gf-max">Maximum players <b class="num" id="gf-max-n">' + d.maxPlayers + '</b></label><input class="range" type="range" id="gf-max" min="2" max="50" value="' + d.maxPlayers + '">' + err('maxPlayers') + '</div>' +
      '<div class="field"><label for="gf-vis">Visibility</label><select class="select" id="gf-vis"><option value="public"' + (d.visibility === 'public' ? ' selected' : '') + '>Public</option><option value="friends"' + (d.visibility === 'friends' ? ' selected' : '') + '>Friends only</option><option value="private"' + (d.visibility === 'private' ? ' selected' : '') + '>Private</option></select></div>' +
      '<div class="field"><label for="gf-diff">Difficulty</label><select class="select" id="gf-diff">' + ['easy', 'normal', 'hard'].map((x) => '<option value="' + x + '"' + (d.difficulty === x ? ' selected' : '') + '>' + x[0].toUpperCase() + x.slice(1) + '</option>').join('') + '</select></div></div>' +
      '<div class="field"><span class="label">Playable template</span><div class="template-pick">' + Object.entries(BF.creator.TEMPLATES).map(([k, t]) => '<button type="button" class="tp' + (d.template === k ? ' on' : '') + '" data-template="' + k + '">' + BF.icon(t.icon, 20) + '<b>' + esc(t.label) + '</b><span class="faint">' + esc(t.desc) + '</span></button>').join('') + '</div>' + err('template') + '</div>' +
      '<div class="field"><span class="label">Thumbnail</span><div class="thumb-pick"><div class="swatches">' + BF.creator.THUMB_COLORS.map((c) => '<button type="button" class="swatch' + (d.thumbnail.type === 'preset' && d.thumbnail.color === c ? ' on' : '') + '" style="--c:' + c + '" data-tcolor="' + c + '" aria-label="Color ' + c + '"></button>').join('') + '</div>' +
      '<div class="seg" role="group" aria-label="Pattern">' + BF.creator.THUMB_PATTERNS.map((p) => '<button type="button" class="' + (d.thumbnail.type === 'preset' && d.thumbnail.pattern === p ? 'on' : '') + '" data-tpattern="' + p + '">' + p[0].toUpperCase() + p.slice(1) + '</button>').join('') + '</div>' +
      '<label class="btn btn-sm btn-outline upload-btn">' + BF.icon('upload', 14) + 'Upload image<input type="file" accept="image/*" id="gf-upload" hidden></label>' + (d.thumbnail.type === 'image' ? '<span class="pill info">Custom image</span>' : '') + '</div></div>' +
      '</div><aside class="gf-preview"><div class="eyebrow" style="margin-bottom:8px">Live preview</div><div class="gf-card">' + BF.ui.gameCard(Object.assign({ description: d.description, approval: 0.8, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), categories: [d.genre] }, listing)).replace(/data-act="[^"]*"/g, '').replace(/data-href="[^"]*"/g, '') + '</div>' +
      '<p class="faint" style="font-size:12.5px;margin-top:10px">' + esc(BF.creator.TEMPLATES[d.template].desc) + ' The layout is generated from a seed, so every creation plays differently.</p>' +
      '<div class="gf-submit"><button class="btn btn-primary btn-lg btn-block" type="submit">' + BF.icon(mode === 'edit' ? 'save' : 'sparkle', 17) + (mode === 'edit' ? 'Save changes' : 'Create game') + '</button>' + (mode === 'edit' ? '<button class="btn btn-ghost btn-block" type="button" data-regen>' + BF.icon('refresh', 15) + 'Regenerate level layout</button>' : '') + '</div></aside></form>';
  }

  function bindForm(root, d, mode, onSubmit) {
    const form = root.querySelector('#game-form');
    const rerender = () => { root.querySelector('#gf-host').innerHTML = formHtml(d, null, mode); bindForm(root, d, mode, onSubmit); };
    const preview = U.debounce(() => {
      const card = root.querySelector('.gf-card');
      const listing = { id: 'preview', name: d.name || 'Untitled Game', genre: d.genre, template: d.template, thumbnail: d.thumbnail, creator: BF.store.state.player.username, maxPlayers: d.maxPlayers, builtIn: false, description: d.description, approval: 0.8, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), categories: [d.genre] };
      if (card) card.innerHTML = BF.ui.gameCard(listing).replace(/data-act="[^"]*"/g, '').replace(/data-href="[^"]*"/g, '');
    }, 120);
    form.querySelector('#gf-name').addEventListener('input', (e) => { d.name = e.target.value; preview(); });
    form.querySelector('#gf-desc').addEventListener('input', (e) => { d.description = e.target.value; form.querySelector('#gf-desc-n').textContent = d.description.length; });
    form.querySelector('#gf-genre').addEventListener('change', (e) => { d.genre = e.target.value; preview(); });
    form.querySelector('#gf-max').addEventListener('input', (e) => { d.maxPlayers = Number(e.target.value); form.querySelector('#gf-max-n').textContent = d.maxPlayers; });
    form.querySelector('#gf-vis').addEventListener('change', (e) => { d.visibility = e.target.value; });
    form.querySelector('#gf-diff').addEventListener('change', (e) => { d.difficulty = e.target.value; });
    form.querySelectorAll('[data-template]').forEach((b) => b.addEventListener('click', () => { d.template = b.dataset.template; if (mode !== 'edit') d.genre = BF.creator.TEMPLATES[d.template].genre; rerender(); }));
    form.querySelectorAll('[data-tcolor]').forEach((b) => b.addEventListener('click', () => { d.thumbnail = { type: 'preset', color: b.dataset.tcolor, pattern: d.thumbnail.pattern || 'grid' }; rerender(); }));
    form.querySelectorAll('[data-tpattern]').forEach((b) => b.addEventListener('click', () => { d.thumbnail = { type: 'preset', color: d.thumbnail.color || BF.creator.THUMB_COLORS[0], pattern: b.dataset.tpattern }; rerender(); }));
    form.querySelector('#gf-upload').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const data = await U.imageFileToDataURL(f, 480, 270);
        d.thumbnail = { type: 'image', data, color: d.thumbnail.color, pattern: d.thumbnail.pattern };
        rerender();
      } catch (err) {
        BF.ui.toast({ title: 'Could not use that image', text: err.message, kind: 'error' });
      }
    });
    const regen = form.querySelector('[data-regen]');
    if (regen) regen.addEventListener('click', () => { d.regenerate = true; BF.ui.toast({ title: 'A new layout will be generated when you save', kind: 'info', icon: 'refresh' }); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const errors = onSubmit(d);
      if (errors) { root.querySelector('#gf-host').innerHTML = formHtml(d, errors, mode); bindForm(root, d, mode, onSubmit); BF.sfx.play('error'); }
    });
  }

  BF.pages.register('createnew', {
    title: 'Create new game',
    nav: 'create',
    render(params, query) {
      draft = freshDraft();
      if (query.template && BF.creator.TEMPLATES[query.template]) { draft.template = query.template; draft.genre = BF.creator.TEMPLATES[query.template].genre; }
      return '<div class="page-head"><div><a class="section-link" href="#/create">' + BF.icon('arrowLeft', 14) + 'My Creations</a><h1 class="page-title" style="margin-top:6px">Create a new game</h1><p class="page-sub">Everything can be changed later from the admin panel.</p></div></div><div id="gf-host">' + formHtml(draft, null, 'new') + '</div>';
    },
    mount(root) {
      bindForm(root, draft, 'new', (d) => {
        const r = BF.creator.create(d);
        if (!r.ok) return r.errors;
        BF.sfx.play('purchase');
        BF.ui.toast({ title: 'Game created: ' + r.game.name, text: 'It is playable now. Publish it when you are ready.', kind: 'success', icon: 'anvil' });
        BF.router.go('#/create/' + r.game.id);
        return null;
      });
    },
  });

  // ------------------------------------------------------------ admin panel

  BF.pages.register('creategame', {
    title: (p) => { const g = BF.creator.get(p.id); return g ? 'Manage ' + g.name : 'Manage'; },
    nav: 'create',
    watch: (p) => (p.tab === 'settings' || p.tab === 'passes' || p.tab === 'studio' || p.tab === 'ads' ? [] : ['created']),
    render(params) {
      const ug = BF.creator.get(params.id);
      if (!ug) return BF.ui.empty({ icon: 'anvil', title: 'Game not found', action: { label: 'My Creations', href: '#/create' } });
      const tab = params.tab || 'overview';
      const listing = BF.creator.toListing(ug);
      const st = BF.catalog.stats(ug.id);
      const tabs = BF.ui.tabs([
        { id: 'overview', label: 'Overview', href: '#/create/' + ug.id, icon: 'podium' },
        { id: 'studio', label: 'Studio', href: '#/create/' + ug.id + '/studio', icon: 'brush' },
        { id: 'ads', label: 'Ads', href: '#/create/' + ug.id + '/ads', icon: 'megaphone', count: BF.ads.active(ug.id).length || null },
        { id: 'passes', label: 'Game Passes', href: '#/create/' + ug.id + '/passes', icon: 'ticket', count: (ug.passes || []).length },
        { id: 'servers', label: 'Servers', href: '#/create/' + ug.id + '/servers', icon: 'server' },
        { id: 'settings', label: 'Settings', href: '#/create/' + ug.id + '/settings', icon: 'gear' },
      ], tab);
      let body = '';
      if (tab === 'overview') {
        body = '<div class="admin-stats">' +
          [['Players', '<span class="live-dot"></span> <span data-live="playing:' + ug.id + '">' + st.playing + '</span>', 'users'], ['Visits', U.fmt(ug.visits), 'eye'], ['Favorites', U.fmt(st.favorites), 'heart'], ['Likes', U.fmt(st.likes) + ' <span class="faint" style="font-size:12px">/ ' + U.fmt(st.dislikes) + ' dislikes</span>', 'thumbUp'], ['Revenue', BF.ui.coins(Math.floor(ug.revenue || 0)), 'wallet'], ['Pass sales', U.fmt(ug.sales || 0), 'ticket']]
            .map((x) => '<div class="admin-stat"><span class="as-icon">' + BF.icon(x[2], 18) + '</span><span class="faint">' + x[0] + '</span><b class="num">' + x[1] + '</b></div>').join('') + '</div>' +
          '<div id="earn-host">' + BF.creatorTabs.earnings(ug) + '</div>' +
          (!ug.published ? '<div class="panel notice">' + BF.icon('info', 18) + '<div><b>This game is a draft.</b><p class="faint">Only you can play it. Publish it to list it in Discover and let bots find it.</p></div><button class="btn btn-primary" data-publish-one>' + BF.icon('globe', 14) + 'Publish</button></div>' : '') +
          '<div class="panel" style="margin-top:14px"><h3 class="panel-title">' + BF.icon('info', 17) + 'Listing</h3><dl class="kv"><div><dt>Template</dt><dd>' + esc(BF.creator.TEMPLATES[ug.template].label) + '</dd></div><div><dt>Genre</dt><dd>' + esc(ug.genre) + '</dd></div><div><dt>Max players</dt><dd class="num">' + ug.maxPlayers + '</dd></div><div><dt>Visibility</dt><dd>' + esc(ug.visibility) + '</dd></div><div><dt>Difficulty</dt><dd>' + esc(ug.difficulty) + '</dd></div><div><dt>Version</dt><dd class="num">' + ug.version + '</dd></div><div><dt>Created</dt><dd>' + U.fmtDate(ug.createdAt) + '</dd></div><div><dt>Updated</dt><dd>' + U.fmtDateTime(ug.updatedAt) + '</dd></div></dl></div>';
      } else if (tab === 'studio') {
        body = BF.creatorTabs.studio.render(ug);
      } else if (tab === 'ads') {
        body = BF.creatorTabs.ads.render(ug);
      } else if (tab === 'passes') {
        body = '<div class="about-grid"><div>' + ((ug.passes || []).length ? '<div class="list panel tight">' + ug.passes.map((p) => '<div class="list-row"><span class="pc-icon sm">' + BF.icon('ticket', 18) + '</span><div class="row-main"><div class="row-title">' + esc(p.name) + '</div><div class="row-sub">' + esc(p.desc || BF.creator.PASS_EFFECTS[p.effect] || '') + '</div></div>' + BF.ui.coins(p.price) + '<button class="icon-btn sm" data-del-pass="' + p.id + '" aria-label="Delete pass" data-tip="Delete pass">' + BF.icon('trash', 15) + '</button></div>').join('') + '</div>' : BF.ui.empty({ icon: 'ticket', title: 'No passes yet', text: 'Passes give players perks and earn you ForgeCoins when bots buy them.' })) + '</div>' +
          '<form class="panel" id="pass-form"><h3 class="panel-title">' + BF.icon('plus', 17) + 'New game pass</h3><div class="field"><label for="pf-name">Name</label><input class="input" id="pf-name" maxlength="30" placeholder="e.g. VIP Lounge"></div><div class="field" style="margin-top:10px"><label for="pf-price">Price (ForgeCoins)</label><input class="input" id="pf-price" type="number" min="10" max="100000" value="250"></div>' +
          '<div class="field" style="margin-top:10px"><label for="pf-effect">Effect</label><select class="select" id="pf-effect">' + Object.entries(BF.creator.PASS_EFFECTS).map(([k, v]) => '<option value="' + k + '">' + esc(v) + '</option>').join('') + '</select></div><div class="error" id="pf-err" style="margin-top:8px"></div><button class="btn btn-primary btn-block" style="margin-top:12px" type="submit">Add pass</button><p class="faint" style="font-size:12px;margin-top:8px">As the creator, you get every pass in your own game for free.</p></form></div>';
      } else if (tab === 'servers') {
        body = ug.published ? '<div class="server-list" id="server-list">' + BF.ui.serverRows(ug.id, { noSecret: true }) + '</div>' : BF.ui.empty({ icon: 'server', title: 'Servers start when you publish', text: 'Drafts only run a private server when you press Play.', action: { label: 'Play privately', act: 'play' } }).replace('data-act="play"', 'data-act="play" data-game="' + ug.id + '"');
      } else {
        body = '<div id="gf-host">' + formHtml(adminDraft(ug), null, 'edit') + '</div>';
      }
      return '<section class="admin-hero"><img src="' + BF.thumbs.url(listing) + '" alt=""><div class="ah-main"><a class="section-link" href="#/create">' + BF.icon('arrowLeft', 14) + 'My Creations</a><h1 class="page-title">' + esc(ug.name) + '</h1><div class="gh-tags">' + statusPill(ug) + '<span class="pill">' + esc(BF.creator.TEMPLATES[ug.template].label) + '</span><span class="pill">' + esc(ug.genre) + '</span></div></div>' +
        '<div class="ah-actions"><button class="btn btn-play" data-act="play" data-game="' + ug.id + '">' + BF.icon('play', 14) + 'Play</button>' + (ug.published ? '<a class="btn btn-outline" href="#/game/' + ug.id + '">View page</a><button class="btn btn-ghost" data-unpublish-one>Unpublish</button>' : '<button class="btn btn-primary" data-publish-one>' + BF.icon('globe', 14) + 'Publish</button>') + '<button class="btn btn-danger" data-delete-one>' + BF.icon('trash', 14) + 'Delete</button></div></section>' + tabs + body;
    },
    mount(root, params) {
      const ug = BF.creator.get(params.id);
      if (!ug) return;
      const tab = params.tab || 'overview';
      if (tab === 'settings') {
        const d = adminDraft(ug);
        bindForm(root, d, 'edit', (dd) => {
          const r = BF.creator.update(ug.id, dd);
          if (!r.ok) return r.errors;
          BF.ui.toast({ title: 'Changes saved', text: dd.regenerate ? 'A fresh level layout was generated.' : '', kind: 'success', icon: 'save' });
          dd.regenerate = false;
          BF.router.refresh();
          return null;
        });
      }
      if (tab === 'studio') BF.creatorTabs.studio.mount(root, ug);
      if (tab === 'ads') BF.creatorTabs.ads.mount(root, ug);
      if (tab === 'servers') liveOff = BF.bus.on('ui:live', () => { const l = root.querySelector('#server-list'); if (l) l.innerHTML = BF.ui.serverRows(ug.id, { noSecret: true }); });
      const pf = root.querySelector('#pass-form');
      if (pf) pf.addEventListener('submit', (e) => {
        e.preventDefault();
        const r = BF.creator.addPass(ug.id, { name: pf.querySelector('#pf-name').value, price: pf.querySelector('#pf-price').value, effect: pf.querySelector('#pf-effect').value });
        if (!r.ok) { pf.querySelector('#pf-err').textContent = r.error; return; }
        BF.ui.toast({ title: 'Pass added: ' + r.pass.name, kind: 'success', icon: 'ticket' });
        BF.router.refresh();
      });
      root.addEventListener('click', async (e) => {
        if (e.target.closest('[data-collect]')) {
          const r = BF.creator.collect(ug.id);
          if (r.ok) { BF.ui.coinFly(e.target.closest('[data-collect]'), 8); BF.ui.toast({ title: 'Collected ' + U.fmt(r.amount) + ' ForgeCoins', text: 'Creator earnings from ' + ug.name, kind: 'coin' }); }
        }
        if (e.target.closest('[data-publish-one]')) { BF.creator.publish(ug.id); BF.ui.toast({ title: 'Published!', kind: 'success', icon: 'globe' }); }
        if (e.target.closest('[data-unpublish-one]')) { const ok = await BF.ui.confirm({ title: 'Unpublish ' + ug.name + '?', message: 'It will disappear from Discover until you publish again.', confirmLabel: 'Unpublish' }); if (ok) BF.creator.unpublish(ug.id); }
        if (e.target.closest('[data-delete-one]')) {
          const ok = await BF.ui.confirm({ title: 'Delete ' + ug.name + '?', message: 'This permanently deletes the game, its passes and stats.', confirmLabel: 'Delete game', danger: true, icon: 'trash' });
          if (ok) { BF.creator.remove(ug.id); BF.router.go('#/create'); BF.ui.toast({ title: 'Game deleted', kind: 'info' }); }
        }
        const dp = e.target.closest('[data-del-pass]');
        if (dp) { const ok = await BF.ui.confirm({ title: 'Delete this pass?', message: 'Players who bought it keep it.', confirmLabel: 'Delete pass', danger: true }); if (ok) { BF.creator.removePass(ug.id, dp.dataset.delPass); BF.router.refresh(); } }
      });
    },
    unmount() {
      if (liveOff) liveOff();
      liveOff = null;
      BF.creatorTabs.ads.unmount();
    },
  });

  function adminDraft(ug) {
    return { name: ug.name, description: ug.description, genre: ug.genre, template: ug.template, maxPlayers: ug.maxPlayers, visibility: ug.visibility, difficulty: ug.difficulty || 'normal', thumbnail: U.clone(ug.thumbnail) };
  }
})((window.BF = window.BF || {}));
