/**
 * BlockForge — Communities (one per studio, with posts and giveaways) and
 * My Studio (found your studio, buy and sell other studios).
 * Story: BLOCKFORGE-020
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const esc = U.esc;

  function badge(c) {
    const color = c.mine ? c.color : '#' + (U.hash(c.name) % 0xffffff).toString(16).padStart(6, '0');
    return '<span class="com-badge" style="--cc:' + color + '">' + esc(c.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()) + '</span>';
  }
  function timeLeft(ms) {
    const m = Math.max(0, Math.ceil(ms / 60000));
    return m >= 1 ? m + ' min left' : 'ending now';
  }
  function giveawayBox(g, c) {
    if (!g) return '';
    const left = g.end - BF.clock.now();
    const each = Math.floor(g.prize / g.winners);
    const action = g.host === 'me' ? '<span class="pill accent">Your giveaway</span>' : g.entered ? '<span class="pill success">' + BF.icon('check', 11) + ' Entered · about 1 in ' + U.fmt(Math.max(1, Math.round(g.entrants / g.winners))) + '</span>' : '<button class="btn btn-gold btn-sm" data-enter="' + g.id + '">' + BF.icon('gift', 14) + 'Enter free</button>';
    return '<div class="gw-box"><div class="gw-prize">' + BF.icon('gift', 22) + '<div><b class="num">' + BF.coinIcon(16) + U.fmt(g.prize) + '</b><span>' + g.winners + ' winner' + (g.winners > 1 ? 's' : '') + ' · ' + U.fmt(each) + ' each</span></div></div><div class="gw-meta"><span data-live-gw="' + g.id + '">' + U.fmt(g.entrants) + ' entered · ' + timeLeft(left) + '</span>' + action + '</div></div>';
  }
  function postHtml(p, c) {
    const bot = p.author === 'me' ? null : BF.bots.get(p.author);
    const s = BF.store.state;
    const who = p.author === 'me' ? '<b>' + esc(s.company ? s.company.name : s.player.displayName) + '</b> <span class="pill accent">You</span>' : '<a href="#/user/' + bot.id + '"><b>' + esc(c.name) + '</b></a><span class="faint"> · ' + esc(bot.displayName) + '</span>';
    const g = p.giveaway ? BF.communities.giveaway(p.giveaway) : null;
    const kindPill = { update: 'Update', event: 'Event', teaser: 'Sneak peek', milestone: 'Milestone', poll: 'Poll', giveaway: 'Giveaway' }[p.kind];
    return '<article class="post" data-post="' + p.id + '"><div class="post-head">' + badge(c) + '<div class="row-main"><div>' + who + '</div><div class="faint" style="font-size:12px">' + U.timeAgo(p.ts, BF.clock.now()) + (kindPill ? ' · ' + kindPill : '') + '</div></div></div>' +
      '<p class="post-text">' + esc(p.text) + '</p>' + (g && !g.done ? giveawayBox(g, c) : '') +
      '<div class="post-foot"><button class="btn btn-xs ' + (p.liked ? 'btn-primary' : 'btn-ghost') + '" data-like="' + p.id + '">' + BF.icon('heart', 13) + U.compact(p.likes) + '</button><span class="faint">' + BF.icon('chat', 13) + ' ' + p.comments.length + '</span></div>' +
      (p.comments.length ? '<div class="post-comments">' + p.comments.slice(-5).map((cm) => { const b = cm.botId === 'me' ? null : BF.bots.get(cm.botId); return '<div class="pc"><b>' + (b ? '<a href="#/user/' + b.id + '">' + esc(b.displayName) + '</a>' : esc(s.player.displayName)) + '</b> ' + esc(cm.text) + '</div>'; }).join('') + '</div>' : '') +
      '<form class="pc-form" data-comment="' + p.id + '"><input class="input" maxlength="200" placeholder="Add a comment…" aria-label="Comment"><button class="btn btn-xs btn-outline" type="submit">Reply</button></form></article>';
  }

  // ------------------------------------------------------------ list

  BF.pages.register('communities', {
    title: 'Communities',
    nav: 'communities',
    watch: ['community', 'company'],
    render() {
      const C = BF.communities;
      const all = C.list();
      const s = BF.store.state;
      const mine = all.find((c) => c.mine);
      const joined = all.filter((c) => !c.mine && C.joined(c.id));
      const rest = all.filter((c) => !c.mine && !C.joined(c.id)).sort((a, b) => b.members - a.members);
      const live = all.filter((c) => c.giveaway && !c.giveaway.done);
      const card = (c) => '<a class="com-card" href="#/community/' + c.id + '">' + badge(c) + '<div class="row-main"><b>' + esc(c.name) + '</b><span class="faint">' + U.compact(c.members) + ' members · ' + U.plural(c.games.length, 'game') + (c.owned ? ' · owned by you' : '') + '</span></div>' + (c.giveaway ? '<span class="pill gold">' + BF.icon('gift', 11) + ' Giveaway</span>' : '') + '</a>';
      return '<div class="page-head"><div><h1 class="page-title">Communities</h1><p class="page-sub">Every studio has a community: updates, events, polls and giveaways.</p></div>' + (s.company ? '<a class="btn btn-primary" href="#/community/mine">' + BF.icon('flag', 15) + 'My community</a>' : '<a class="btn btn-primary" href="#/mystudio">' + BF.icon('crown', 15) + 'Found your studio</a>') + '</div>' +
        (live.length ? '<section class="section"><div class="section-head"><h2 class="section-title">' + BF.icon('gift', 18) + 'Live giveaways</h2></div><div class="com-grid">' + live.map(card).join('') + '</div></section>' : '') +
        (mine ? '<section class="section"><div class="section-head"><h2 class="section-title">' + BF.icon('crown', 18) + 'Your studio</h2></div><div class="com-grid">' + card(mine) + '</div></section>' : '') +
        (joined.length ? '<section class="section"><div class="section-head"><h2 class="section-title">' + BF.icon('check', 18) + 'Joined</h2></div><div class="com-grid">' + joined.map(card).join('') + '</div></section>' : '') +
        '<section class="section"><div class="section-head"><h2 class="section-title">' + BF.icon('compass', 18) + 'Discover communities</h2></div><div class="com-grid">' + rest.map(card).join('') + '</div></section>';
    },
  });

  // ------------------------------------------------------------ one community

  BF.pages.register('community', {
    title: (p) => { const c = BF.communities.get(p.id); return c ? c.name : 'Community'; },
    nav: 'communities',
    watch: ['community', 'company'],
    render(params) {
      const C = BF.communities;
      const c = C.get(params.id);
      if (!c) return BF.ui.empty({ icon: 'flag', title: params.id === 'mine' ? 'Found your studio first' : 'Community not found', action: { label: params.id === 'mine' ? 'Found your studio' : 'All communities', href: params.id === 'mine' ? '#/mystudio' : '#/communities' } });
      const feed = C.feed(c.id);
      const joined = C.joined(c.id);
      const T = C.T.host;
      const head = '<section class="com-hero" style="--cc:' + (c.color || '#ff7a2e') + '">' + badge(c) + '<div class="row-main"><h1 class="page-title">' + esc(c.name) + '</h1><div class="faint">' + U.fmt(c.members) + ' members · ' + U.plural(c.games.length, 'game') + (c.mine ? '' : ' · owner ' + esc(c.owner.displayName) + (c.owned ? ' (you own this studio)' : '')) + '</div>' + (c.tagline ? '<div class="com-tag">' + esc(c.tagline) + '</div>' : '') + '</div>' +
        '<div class="row-actions">' + (c.mine ? '<a class="btn btn-outline" href="#/mystudio">' + BF.icon('crown', 14) + 'Studio HQ</a>' : joined ? '<button class="btn btn-ghost" data-leave>Joined · Leave</button>' : '<button class="btn btn-primary" data-join>' + BF.icon('plus', 14) + 'Join</button>') + (c.studio ? '<a class="btn btn-ghost" href="#/creator/' + encodeURIComponent(c.name) + '">Studio page</a>' : '') + '</div></section>';
      const games = c.games.length ? '<div class="com-games">' + c.games.slice(0, 6).map((g) => '<a href="#/game/' + g.id + '" class="com-game"><img src="' + BF.thumbs.url(g) + '" alt=""><span>' + esc(g.name) + '</span></a>').join('') + '</div>' : '';
      const composer = c.mine ? '<form class="panel com-compose" id="com-post"><textarea class="textarea" rows="2" maxlength="400" placeholder="Share news with your ' + U.fmt(c.members) + ' members…" aria-label="New post"></textarea><div class="com-compose-foot"><span class="faint" id="com-post-err"></span><button class="btn btn-primary" type="submit">' + BF.icon('send', 14) + 'Post</button></div></form>' +
        (c.giveaway ? '' : '<form class="panel gw-form" id="gw-form"><h3 class="panel-title">' + BF.icon('gift', 17) + 'Host a giveaway</h3><div class="gw-fields"><label class="field"><span class="label">Prize (ForgeCoins)</span><input class="input num" id="gw-prize" type="number" min="' + T.minPrize + '" max="' + T.maxPrize + '" value="10000"></label><label class="field"><span class="label">Winners</span><input class="input num" id="gw-winners" type="number" min="' + T.winners[0] + '" max="' + T.winners[1] + '" value="5"></label><label class="field"><span class="label">Minutes</span><input class="input num" id="gw-min" type="number" min="' + T.minutes[0] + '" max="' + T.minutes[1] + '" value="10"></label></div><p class="faint" style="font-size:12.5px;margin:0">The prize leaves your wallet now and goes to the winners at the end. Bigger prizes draw more entrants: they join your community, follow you and play your games.</p><div class="com-compose-foot"><span class="faint" id="gw-err"></span><button class="btn btn-gold" type="submit">' + BF.icon('gift', 14) + 'Start giveaway</button></div></form>') : '';
      return head + (c.giveaway ? giveawayBox(c.giveaway, c) : '') + games + composer +
        '<div class="post-list">' + (feed.length ? feed.map((p) => postHtml(p, c)).join('') : BF.ui.empty({ icon: 'flag', title: c.mine ? 'Write your first post' : 'No posts yet' })) + '</div>';
    },
    mount(root, params) {
      const C = BF.communities;
      const id = params.id;
      root.addEventListener('click', (e) => {
        if (e.target.closest('[data-join]')) { C.join(id); BF.ui.toast({ title: 'Joined the community', kind: 'success', icon: 'flag' }); return; }
        if (e.target.closest('[data-leave]')) { C.leave(id); return; }
        const en = e.target.closest('[data-enter]');
        if (en) { const r = C.enter(en.dataset.enter); if (!r.ok) return BF.ui.toast({ title: r.error, kind: 'info' }); BF.sfx.play('coin'); BF.ui.toast({ title: 'You entered the giveaway', text: 'Winners are drawn when it ends. Good luck!', kind: 'success', icon: 'gift' }); return; }
        const lk = e.target.closest('[data-like]');
        if (lk) C.like(lk.dataset.like);
      });
      root.querySelectorAll('[data-comment]').forEach((f) => f.addEventListener('submit', (e) => { e.preventDefault(); const inp = f.querySelector('input'); const r = C.comment(f.dataset.comment, inp.value); if (r.ok) inp.value = ''; }));
      const pf = root.querySelector('#com-post');
      if (pf) pf.addEventListener('submit', (e) => { e.preventDefault(); const ta = pf.querySelector('textarea'); const r = C.post(ta.value); if (!r.ok) { root.querySelector('#com-post-err').textContent = r.error; return; } BF.sfx.play('chat'); });
      const gf = root.querySelector('#gw-form');
      if (gf) gf.addEventListener('submit', (e) => {
        e.preventDefault();
        const r = C.host({ prize: gf.querySelector('#gw-prize').value, winners: gf.querySelector('#gw-winners').value, minutes: gf.querySelector('#gw-min').value });
        if (!r.ok) { root.querySelector('#gw-err').textContent = r.error; BF.sfx.play('error'); return; }
        BF.sfx.play('purchase');
        BF.ui.toast({ title: 'Giveaway started!', text: 'Entrants are pouring in.', kind: 'success', icon: 'gift' });
      });
      this._live = BF.bus.on('store:change', (keys) => {
        if (!keys.has('communityStats')) return;
        root.querySelectorAll('[data-live-gw]').forEach((el) => { const g = C.giveaway(el.dataset.liveGw); if (g) el.textContent = U.fmt(g.entrants) + ' entered · ' + (g.done ? 'ended' : timeLeft(g.end - BF.clock.now())); });
      });
    },
    unmount() { if (this._live) this._live(); },
  });

  // ------------------------------------------------------------ my studio

  BF.pages.register('mystudio', {
    title: 'My Studio',
    nav: 'mystudio',
    watch: ['company'],
    render() {
      const Co = BF.company;
      const s = BF.store.state;
      const c = s.company;
      if (!c) {
        return '<div class="page-head"><div><h1 class="page-title">Found your studio</h1><p class="page-sub">Your studio owns your games, gets its own community and can buy other studios.</p></div></div>' +
          '<form class="panel studio-found" id="found-form"><label class="field"><span class="label">Studio name</span><input class="input" id="sf-name" maxlength="' + Co.T.nameLen[1] + '" placeholder="e.g. Pixel Forge Games"></label>' +
          '<label class="field"><span class="label">Tagline <span class="faint">(optional)</span></span><input class="input" id="sf-tag" maxlength="80" placeholder="We make games you cannot put down"></label>' +
          '<div class="field"><span class="label">Colour</span><div class="swatches">' + Co.T.colors.map((col, i) => '<label class="sf-swatch" style="--sw:' + col + '"><input type="radio" name="sf-color" value="' + col + '"' + (i === 0 ? ' checked' : '') + '><span></span></label>').join('') + '</div></div>' +
          '<div class="com-compose-foot"><span class="faint" id="sf-err">Founding costs ' + U.fmt(Co.T.foundCost) + ' ForgeCoins.</span><button class="btn btn-primary" type="submit">' + BF.icon('crown', 15) + 'Found studio · ' + U.fmt(Co.T.foundCost) + '</button></div></form>';
      }
      const market = Co.market();
      const owned = market.filter((m) => m.mine);
      const others = market.filter((m) => !m.mine);
      const row = (m) => '<tr><td><a class="lb-player" href="#/creator/' + encodeURIComponent(m.name) + '">' + BF.ui.avatarChip(m.studio.owner.avatar, { size: 'sm' }) + '<span><b>' + esc(m.name) + '</b><span class="faint"> · ' + (m.mine ? 'yours' : esc(m.studio.owner.displayName)) + '</span></span></a></td><td class="r num hide-sm">' + U.compact(m.studio.playing) + '</td><td class="r num hide-sm">' + BF.coinIcon(12) + U.compact(Math.round(m.income)) + '/min</td><td class="r num"><b>' + U.compact(m.value) + '</b></td><td class="r">' +
        (m.mine ? '<button class="btn btn-xs btn-ghost" data-sell="' + esc(m.name) + '">Sell · ' + U.compact(Math.round(m.value * Co.T.sellShare)) + '</button>' : '<button class="btn btn-xs ' + (BF.economy.canAfford(m.value) ? 'btn-gold' : 'btn-outline') + '" data-buy="' + esc(m.name) + '">Buy</button>') + '</td></tr>';
      const table = (list) => '<div class="table-wrap"><table class="table lb-table"><thead><tr><th>Studio</th><th class="r hide-sm">Playing</th><th class="r hide-sm">Owner income</th><th class="r">Value</th><th></th></tr></thead><tbody>' + list.map(row).join('') + '</tbody></table></div>';
      return '<section class="com-hero" style="--cc:' + c.color + '">' + badge({ name: c.name, mine: true, color: c.color }) + '<div class="row-main"><h1 class="page-title">' + esc(c.name) + '</h1><div class="faint">Founded ' + U.fmtDate(c.founded) + (c.tagline ? ' · ' + esc(c.tagline) : '') + '</div></div><div class="row-actions"><a class="btn btn-outline" href="#/community/mine">' + BF.icon('flag', 14) + 'Community</a><a class="btn btn-ghost" href="#/create">' + BF.icon('anvil', 14) + 'Games</a></div></section>' +
        '<div class="studio-money"><div><span class="faint">Studio value</span><b class="num">' + BF.coinIcon(16) + U.compact(Co.worth()) + '</b></div><div><span class="faint">Studio income</span><b class="num">' + BF.coinIcon(16) + U.compact(Math.round(Co.incomePerMin())) + '/min</b></div><div><span class="faint">Earned from studios</span><b class="num">' + BF.coinIcon(16) + U.compact(c.earned || 0) + '</b></div><div><span class="faint">Community</span><b class="num">' + U.compact(Math.round(s.community.members || 0)) + ' members</b></div></div>' +
        '<section class="section"><div class="section-head"><h2 class="section-title">' + BF.icon('crown', 18) + 'Studios you own</h2></div>' + (owned.length ? table(owned) : BF.ui.empty({ icon: 'crown', title: 'No studios yet', text: 'Buy one below: its owner share of revenue comes to you every few minutes, and its players count toward your fame.' })) + '</section>' +
        '<section class="section"><div class="section-head"><h2 class="section-title">' + BF.icon('chart', 18) + 'Studios for sale</h2><span class="faint">Price = two days of owner income + 10% of what the owner has earned</span></div>' + table(others) + '</section>';
    },
    mount(root) {
      const Co = BF.company;
      const ff = root.querySelector('#found-form');
      if (ff) ff.addEventListener('submit', (e) => {
        e.preventDefault();
        const r = Co.found({ name: ff.querySelector('#sf-name').value, tagline: ff.querySelector('#sf-tag').value, color: (ff.querySelector('input[name=sf-color]:checked') || {}).value });
        if (!r.ok) { root.querySelector('#sf-err').textContent = r.error; BF.sfx.play('error'); return; }
        BF.sfx.play('levelup');
        BF.ui.toast({ title: r.company.name + ' is open for business!', text: 'Your studio has its own community now.', kind: 'success', icon: 'crown' });
      });
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-buy]');
        if (b) {
          const x = BF.creatorEconomy.studio(b.dataset.buy);
          const price = Co.value(x);
          if (!BF.economy.canAfford(price)) return BF.ui.toast({ title: 'Not enough ForgeCoins', text: b.dataset.buy + ' costs ' + U.fmt(price) + ' ForgeCoins.', kind: 'error' });
          const ok = await BF.ui.confirm({ title: 'Buy ' + b.dataset.buy + '?', message: 'Price: ' + U.fmt(price) + ' ForgeCoins. You get the owner share (about ' + U.fmt(Math.round(Co.ownerIncome(x))) + ' a minute) and its ' + U.compact(x.playing) + ' players count toward your fame.', confirmLabel: 'Buy for ' + U.compact(price), icon: 'crown' });
          if (!ok) return;
          const r = Co.buy(b.dataset.buy);
          if (!r.ok) return BF.ui.toast({ title: r.error, kind: 'error' });
          BF.sfx.play('purchase');
          BF.ui.toast({ title: 'You own ' + b.dataset.buy + ' now', kind: 'success', icon: 'crown' });
          return;
        }
        const sb = e.target.closest('[data-sell]');
        if (sb) {
          const x = BF.creatorEconomy.studio(sb.dataset.sell);
          const ok = await BF.ui.confirm({ title: 'Sell ' + sb.dataset.sell + '?', message: 'You get ' + U.fmt(Math.round(Co.value(x) * Co.T.sellShare)) + ' ForgeCoins and stop earning its owner share.', confirmLabel: 'Sell', danger: true, icon: 'crown' });
          if (!ok) return;
          const r = Co.sell(sb.dataset.sell);
          if (r.ok) BF.ui.toast({ title: 'Sold for ' + U.fmt(r.price) + ' ForgeCoins', kind: 'coin' });
        }
      });
    },
  });
})((window.BF = window.BF || {}));
