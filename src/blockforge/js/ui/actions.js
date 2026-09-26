/**
 * BlockForge — delegated UI actions. Any element with data-act="name" runs
 * BF.actions[name] on click; data-* attributes become the parameters.
 * Elements with data-href navigate. Right-click on [data-ctx] opens context menus.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const esc = U.esc;
  const A = {};

  BF.actions = {
    register(name, fn) {
      A[name] = fn;
    },
    /**
     * Run an action by name.
     * @param {string} name
     * @param {Element|null} el source element (its dataset supplies params)
     * @param {Event|null} e
     * @param {object} [extra] explicit params (merged over el.dataset)
     */
    run(name, el, e, extra) {
      const fn = A[name];
      if (!fn) { console.warn('[BF.actions] unknown action', name); return; }
      const params = Object.assign({}, el ? el.dataset : {}, extra || {});
      try {
        return fn(params, el, e);
      } catch (err) {
        console.error('[BF.actions]', name, err);
        BF.ui.toast({ title: 'Something went wrong', text: String(err.message || err), kind: 'error' });
      }
    },
  };

  // ------------------------------------------------------------ delegation

  document.addEventListener('click', (e) => {
    if (!BF.store.state) return;
    const actEl = e.target.closest('[data-act]');
    if (actEl && !actEl.disabled) {
      e.preventDefault();
      e.stopPropagation();
      BF.sfx.play('click');
      BF.actions.run(actEl.dataset.act, actEl, e);
      return;
    }
    const link = e.target.closest('a[href^="#/"]');
    if (link) {
      e.preventDefault();
      BF.router.go(link.getAttribute('href'));
      return;
    }
    const hrefEl = e.target.closest('[data-href]');
    if (hrefEl && !e.target.closest('button, input, select, textarea, a')) {
      BF.router.go(hrefEl.dataset.href);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target;
    if (!t || !t.matches || !t.matches('[data-act][tabindex], [data-href][tabindex]')) return;
    e.preventDefault();
    t.click();
  });

  document.addEventListener('contextmenu', (e) => {
    if (!BF.store.state) return;
    const el = e.target.closest('[data-ctx]');
    if (!el || e.target.closest('input, textarea')) return;
    e.preventDefault();
    if (el.dataset.ctx === 'game') gameMenu({ x: e.clientX, y: e.clientY }, el.dataset.game);
    else if (el.dataset.ctx === 'user') userMenu({ x: e.clientX, y: e.clientY }, el.dataset.bot);
  });

  // ------------------------------------------------------------------ games

  function gameMenu(anchor, gameId) {
    const g = BF.catalog.get(gameId);
    if (!g) return;
    const fav = BF.catalog.isFavorite(gameId);
    BF.ui.menu(anchor, [
      { html: '<b>' + esc(g.name) + '</b><div class="faint" style="font-size:12px">by ' + esc(g.creator) + '</div>' },
      { label: 'Play', icon: 'play', onClick: () => BF.play(gameId) },
      { label: 'Open details', icon: 'info', href: '#/game/' + gameId },
      { label: 'Browse servers', icon: 'server', href: '#/game/' + gameId + '/servers' },
      { label: 'Game store', icon: 'ticket', href: '#/game/' + gameId + '/store' },
      { sep: true },
      { label: fav ? 'Remove from favorites' : 'Add to favorites', icon: 'heart', onClick: () => A.fav({ game: gameId }) },
      { label: 'Copy share link', icon: 'share', onClick: () => A.share({ game: gameId }) },
    ]);
  }

  A['game-menu'] = (p, el) => gameMenu(el, p.game);

  A.play = (p) => BF.play(p.game);
  A['join-server'] = (p) => BF.play(p.game, p.server);

  A.fav = (p) => {
    const on = BF.catalog.toggleFavorite(p.game);
    const g = BF.catalog.get(p.game);
    BF.ui.toast({ title: on ? 'Added to favorites' : 'Removed from favorites', text: g ? g.name : '', kind: on ? 'success' : 'info', icon: 'heart' });
    document.querySelectorAll('.gcard-fav[data-game="' + p.game + '"]').forEach((b) => { b.classList.toggle('on', on); b.setAttribute('data-tip', on ? 'Favorited' : 'Favorite'); });
  };

  A.vote = (p) => {
    const v = BF.catalog.vote(p.game, p.vote);
    const st = BF.catalog.stats(p.game);
    document.querySelectorAll('.vote[data-game="' + p.game + '"]').forEach((b) => {
      b.classList.toggle('on-like', b.dataset.vote === 'like' && v === 'like');
      b.classList.toggle('on-dislike', b.dataset.vote === 'dislike' && v === 'dislike');
      if (b.dataset.vote === 'like') b.innerHTML = BF.icon('thumbUp', 14) + U.compact(st.likes);
    });
  };

  A.share = (p) => {
    const g = BF.catalog.get(p.game);
    const link = 'blockforge.local/games/' + p.game;
    U.copyText(link).then((ok) => BF.ui.toast({ title: ok ? 'Share link copied' : 'Share link', text: link + (g ? ' · ' + g.name : ''), kind: 'success', icon: 'link' }));
  };

  // ------------------------------------------------------------------ items

  function purchaseResult(res, item, handle) {
    if (res.ok) {
      BF.sfx.play('purchase');
      BF.ui.toast({ title: 'Purchase successful!', text: item.name + ' is in your inventory.', kind: 'success', icon: 'bag' });
      return true;
    }
    if (res.reason === 'insufficient') {
      BF.sfx.play('error');
      BF.ui.toast({ title: 'Not enough ForgeCoins.', text: 'You need ' + U.fmt(res.need) + ' more ForgeCoins.', kind: 'error', icon: 'coin', action: { label: 'Ways to earn', onClick: () => BF.router.go('#/wallet') } });
    } else if (res.reason === 'owned') {
      BF.ui.toast({ title: 'You already own ' + item.name, kind: 'info' });
    } else if (res.reason === 'limit') {
      BF.ui.toast({ title: 'Limit reached', text: 'This limited item is one per account.', kind: 'info' });
    }
    if (handle) handle.close();
    return false;
  }

  /** Buy confirmation with balance preview; success state offers Equip. */
  A['buy-item'] = (p) => {
    const item = BF.ITEMS[p.item];
    if (!item) return;
    const check = BF.inventory.canBuy(item);
    if (check.reason === 'owned') return BF.ui.toast({ title: 'You already own ' + item.name, kind: 'info' });
    if (check.reason === 'notForSale') return BF.ui.toast({ title: item.name + ' is found in game, not sold.', kind: 'info' });
    if (check.reason === 'limit') return BF.ui.toast({ title: 'Limit reached', text: 'This limited item is one per account.', kind: 'info' });
    if (check.reason === 'soldout') return A['item-detail']({ item: item.id });
    const bal = BF.economy.balance();
    const short = check.price - bal;
    BF.ui.modal({
      title: short > 0 ? 'Not enough ForgeCoins.' : 'Confirm purchase',
      icon: short > 0 ? 'coin' : 'bag',
      iconKind: short > 0 ? 'gold' : '',
      cls: 'buy-modal',
      body: '<div class="buy-preview rar-' + item.rarity + '"><div class="bp-art">' + BF.ui.itemPreview(item, { size: 120 }) + '</div><div class="bp-info"><div class="bp-name">' + esc(item.name) + '</div><div class="bp-sub">' + BF.ui.rarityTag(item.rarity) + ' <span class="faint">' + esc(BF.ITEM_CATS[item.cat].label) + ' · by ' + esc(item.creator) + '</span></div>' +
        (item.cat === 'bundle' ? '<div class="faint" style="font-size:12px;margin-top:6px">Includes ' + item.contents.map((id) => esc(BF.ITEMS[id].name) + (BF.inventory.owns(id) ? ' (owned)' : '')).join(', ') + '</div>' : '') + '</div></div>' +
        '<div class="buy-math"><div><span>Price</span>' + BF.ui.coins(check.price) + '</div><div><span>Your balance</span>' + BF.ui.coins(bal) + '</div><div class="bm-total"><span>After purchase</span>' + (short > 0 ? '<span class="delta-neg num">Short by ' + U.fmt(short) + '</span>' : BF.ui.coins(bal - check.price)) + '</div></div>' +
        (short > 0 ? '<p class="muted" style="margin-top:12px;font-size:13px">Earn more by claiming your daily reward, finishing quests and winning games.</p>' : ''),
      actions: short > 0
        ? [{ label: 'Close', kind: 'ghost' }, { label: 'Ways to earn', kind: 'gold', icon: 'wallet', onClick: () => BF.router.go('#/wallet') }]
        : [{ label: 'Cancel', kind: 'ghost' }, {
          label: 'Buy for ' + U.fmt(check.price), kind: 'primary', icon: 'bag', onClick: (h) => {
            const res = BF.inventory.buy(item.id);
            if (!purchaseResult(res, item, h)) return false;
            showPurchased(h, item, res.serial);
            return false;
          },
        }],
    });
  };

  function showPurchased(handle, item, serial) {
    const body = handle.el.querySelector('.modal-body');
    const foot = handle.el.querySelector('.modal-foot');
    handle.el.querySelector('.modal-title').textContent = 'Purchase successful!';
    const slot = BF.ITEM_CATS[item.cat].slot;
    body.innerHTML = '<div class="bought"><div class="bought-art rar-' + item.rarity + '">' + BF.ui.itemPreview(item, { size: 150, animate: true }) + '</div><div class="bought-check">' + BF.icon('check', 22) + '</div><p><b>' + esc(item.name) + '</b>' + (serial ? ' <span class="pill gold">#' + serial + ' of ' + U.fmt(item.limitedStock) + '</span>' : '') + ' was added to your inventory.</p></div>';
    BF.ui.burst(body.querySelector('.bought-art'));
    BF.ui.coinFly(body.querySelector('.bought-art'), 4);
    foot.innerHTML = '';
    const mk = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; foot.appendChild(b); return b; };
    mk('Close', 'btn-ghost', () => handle.close());
    if (item.cat === 'bundle') mk('Open Avatar', 'btn-primary', () => { handle.close(); BF.router.go('#/avatar'); });
    else if (slot) mk('Equip now', 'btn-primary', () => { A.equip({ item: item.id }); handle.close(); });
    else mk('View inventory', 'btn-primary', () => { handle.close(); BF.router.go('#/inventory'); });
  }

  A.equip = (p) => {
    const r = BF.avatar.equip(p.item);
    const item = BF.ITEMS[p.item];
    if (!r.ok) return BF.ui.toast({ title: r.error, kind: 'error' });
    BF.sfx.play('tab');
    BF.ui.toast({ title: 'Equipped ' + item.name, kind: 'success', icon: 'shirt' });
  };

  A.unequip = (p) => {
    const item = p.item ? BF.ITEMS[p.item] : null;
    const slot = p.slot || (item && BF.ITEM_CATS[item.cat].slot);
    if (!slot) return;
    const r = BF.avatar.unequip(slot);
    BF.ui.toast({ title: item ? 'Unequipped ' + item.name : 'Slot cleared', text: r.fallback ? 'Replaced with the starter item.' : '', kind: 'info', icon: 'shirt' });
  };

  A['sell-item'] = async (p) => {
    const item = BF.ITEMS[p.item];
    if (!item || !BF.inventory.canSell(item)) return BF.ui.toast({ title: 'This item cannot be sold.', kind: 'info' });
    const value = BF.inventory.sellValue(item);
    const ok = await BF.ui.confirm({ title: 'Sell ' + item.name + '?', html: 'You will receive <b>' + U.fmt(value) + ' ForgeCoins</b>. The item will be removed from your inventory' + (BF.avatar.isEquipped(item.id) ? ' and unequipped' : '') + '.', confirmLabel: 'Sell for ' + U.fmt(value), danger: true, icon: 'coin' });
    if (!ok) return;
    const r = BF.inventory.sell(item.id);
    if (r.ok) BF.ui.toast({ title: 'Sold ' + item.name, text: '+' + U.fmt(r.value) + ' ForgeCoins', kind: 'coin' });
  };

  A['fav-item'] = (p) => {
    BF.inventory.toggleFavorite(p.item);
    const on = BF.store.state.inventory[p.item] && BF.store.state.inventory[p.item].fav;
    BF.ui.toast({ title: on ? 'Marked as favorite' : 'Removed from favorites', kind: 'info', icon: 'heart' });
  };

  /** Item details modal with try-on preview. */
  A['item-detail'] = (p) => {
    const item = BF.ITEMS[p.item];
    if (!item) return;
    let tryOn = false;
    const renderBody = () => {
      const owned = BF.inventory.isOwned(item);
      const equipped = BF.avatar.isEquipped(item.id);
      const slot = BF.ITEM_CATS[item.cat].slot;
      const price = BF.inventory.priceFor(item);
      const inv = BF.store.state.inventory[item.id];
      const game = item.gameId ? BF.catalog.get(item.gameId) : null;
      let buttons = '';
      const L = item.limitedStock && BF.limiteds ? BF.limiteds : null;
      let limitedHtml = '';
      if (L) {
        const left = L.left(item), mine = L.serials(item);
        limitedHtml = '<div class="ltd-box"><div class="ltd-head"><span class="pill gold">' + BF.icon('gem', 11) + 'Limited</span><b class="num">' + (left ? U.fmt(left) + ' of ' + U.fmt(item.limitedStock) + ' left' : 'Sold out') + '</b><span class="faint">RAP ' + U.fmt(L.rap(item)) + '</span></div>' + BF.ui.bar(item.limitedStock - left, item.limitedStock, left ? 'thin' : 'thin success') +
          (mine.length ? '<div class="ltd-serials">Your serial' + (mine.length > 1 ? 's' : '') + ': ' + mine.map((n) => '<span class="pill">#' + n + '</span>').join(' ') + '</div>' : '') +
          (!left ? '<div class="ltd-offers"><div class="faint" style="font-size:12px;margin:8px 0 4px">Resellers</div>' + L.offers(item).map((o, i) => '<div class="ltd-offer">' + BF.ui.avatarChip(o.bot.avatar, { size: 'sm' }) + '<span>@' + esc(o.bot.username) + ' <span class="faint">#' + o.serial + '</span></span>' + BF.ui.coins(o.price) + '<button class="btn btn-xs btn-primary" data-act="buy-resale" data-item="' + item.id + '" data-offer="' + i + '">Buy</button></div>').join('') + '</div>' : '') + '</div>';
        if (left) buttons += '<button class="btn btn-primary" data-act="buy-item" data-item="' + item.id + '">' + BF.icon('bag', 15) + 'Buy #' + U.fmt(item.limitedStock - left + 1) + ' for ' + U.fmt(price) + '</button>';
        if (mine.length && owned) buttons += '<button class="btn btn-ghost" data-act="sell-limited" data-item="' + item.id + '">Sell to market for ' + U.fmt(Math.floor(L.rap(item) * L.T.resaleFee)) + '</button>';
      } else if (!item.notForSale && (!owned || item.cat === 'collectible')) buttons += '<button class="btn btn-primary" data-act="buy-item" data-item="' + item.id + '">' + BF.icon('bag', 15) + 'Buy for ' + U.fmt(price) + '</button>';
      if (owned && slot) buttons += equipped ? '<button class="btn btn-outline" data-act="unequip" data-item="' + item.id + '">Unequip</button>' : '<button class="btn btn-primary" data-act="equip" data-item="' + item.id + '">' + BF.icon('shirt', 15) + 'Equip</button>';
      if (owned && item.cat === 'emote') buttons += '<button class="btn btn-outline" data-act="preview-emote" data-item="' + item.id + '">' + BF.icon('play', 13) + 'Play emote</button>';
      if (owned && inv) buttons += '<button class="btn btn-ghost" data-act="fav-item" data-item="' + item.id + '">' + BF.icon('heart', 15) + (inv.fav ? 'Unfavorite' : 'Favorite') + '</button>';
      if (owned && BF.inventory.canSell(item)) buttons += '<button class="btn btn-ghost" data-act="sell-item" data-item="' + item.id + '">Sell for ' + U.fmt(BF.inventory.sellValue(item)) + '</button>';
      return '<div class="item-detail rar-' + item.rarity + '"><div class="id-art" id="id-art">' + BF.ui.itemPreview(item, { size: 230, animate: true, onAvatar: tryOn }) +
        (slot && item.cat !== 'emote' ? '<button class="btn btn-xs btn-outline id-try" data-tryon>' + BF.icon('user', 13) + (tryOn ? 'Show on mannequin' : 'Try on your avatar') + '</button>' : '') + '</div>' +
        '<div class="id-info"><div class="id-tags">' + BF.ui.rarityTag(item.rarity) + '<span class="pill">' + esc(BF.ITEM_CATS[item.cat].label) + '</span>' + (owned ? BF.ui.ownedTag(item.cat === 'collectible' && inv ? 'Owned x' + inv.qty : 'Owned') : '') + (equipped ? '<span class="pill success">Equipped</span>' : '') + (item.limited ? '<span class="pill gold">Limited</span>' : '') + '</div>' +
        '<h2 class="id-name">' + esc(item.name) + '</h2><div class="faint">by ' + esc(item.creator) + (game ? ' · <a href="#/game/' + game.id + '" class="link">' + esc(game.name) + '</a>' : '') + '</div>' +
        '<p class="id-desc">' + esc(item.desc) + '</p>' + limitedHtml +
        (item.cat === 'bundle' ? '<div class="id-contents">' + item.contents.map((id) => { const c = BF.ITEMS[id]; return '<div class="idc rar-' + c.rarity + '">' + BF.ui.itemPreview(c, { size: 56 }) + '<span>' + esc(c.name) + '</span>' + (BF.inventory.owns(id) ? BF.icon('check', 14) : '') + '</div>'; }).join('') + '</div>' : '') +
        '<dl class="id-stats"><div><dt>Price</dt><dd>' + (item.notForSale ? 'Not sold' : BF.ui.coins(price)) + '</dd></div><div><dt>Collection value</dt><dd>' + BF.ui.coins(BF.inventory.itemValue(item)) + '</dd></div>' + (inv ? '<div><dt>Acquired</dt><dd>' + U.fmtDate(inv.at) + '</dd></div>' : '') + '</dl>' +
        '<div class="id-actions">' + buttons + '</div></div></div>';
    };
    const h = BF.ui.modal({ title: item.name, wide: true, body: renderBody(), cls: 'item-modal' });
    const body = h.el.querySelector('.modal-body');
    const rerender = () => { if (!h.closed) body.innerHTML = renderBody(); };
    body.addEventListener('click', (e) => { if (e.target.closest('[data-tryon]')) { tryOn = !tryOn; rerender(); } });
    const off = BF.store.on(['inventory', 'avatar', 'wallet', 'limiteds'], rerender);
    const origClose = h.close;
    h.close = (r) => { off(); origClose(r); };
  };

  A['buy-resale'] = async (p) => {
    const item = BF.ITEMS[p.item];
    const offer = item && BF.limiteds.offers(item)[Number(p.offer)];
    if (!offer) return BF.ui.toast({ title: 'That listing is gone', kind: 'info' });
    const ok = await BF.ui.confirm({ title: 'Buy ' + item.name + ' #' + offer.serial + '?', message: 'From @' + offer.bot.username + ' for ' + U.fmt(offer.price) + ' ForgeCoins (you have ' + U.fmt(BF.economy.balance()) + ').', confirmLabel: 'Buy for ' + U.fmt(offer.price) });
    if (!ok) return;
    const r = BF.limiteds.buyResale(item, offer);
    if (!r.ok) return BF.ui.toast({ title: r.reason === 'insufficient' ? 'Not enough ForgeCoins.' : 'Purchase failed', text: r.need ? 'You need ' + U.fmt(r.need) + ' more.' : '', kind: 'error' });
    BF.sfx.play('purchase');
    BF.ui.toast({ title: 'You own ' + item.name + ' #' + r.serial, kind: 'success', icon: 'gem' });
  };

  A['sell-limited'] = async (p) => {
    const item = BF.ITEMS[p.item];
    if (!item) return;
    const value = Math.floor(BF.limiteds.rap(item) * BF.limiteds.T.resaleFee);
    const ok = await BF.ui.confirm({ title: 'Sell ' + item.name + '?', message: 'The market pays ' + U.fmt(value) + ' ForgeCoins (70% of its recent average price). Limited stock never comes back, so you may pay more to get one again.', confirmLabel: 'Sell for ' + U.fmt(value), danger: true });
    if (!ok) return;
    const r = BF.limiteds.sellToMarket(item);
    if (r.ok) BF.ui.toast({ title: 'Sold ' + item.name + ' #' + r.serial, text: '+' + U.fmt(r.value) + ' ForgeCoins', kind: 'success' });
  };

  A['preview-emote'] = (p) => {
    const item = BF.ITEMS[p.item];
    const art = document.getElementById('id-art') || document.getElementById('avatar-stage');
    if (!art || !item) return;
    const holder = art.querySelector('.avatar-svg');
    const av = BF.store.state.avatar;
    const html = BF.avatar.render(av, { size: holder ? holder.getAttribute('width') : 230, emote: item.look.anim });
    if (holder) holder.outerHTML = html;
    BF.sfx.play('pickup');
  };

  // ------------------------------------------------------------------ passes

  A['buy-pass'] = (p) => {
    const pass = BF.passes.get(p.pass);
    if (!pass) return;
    if (BF.passes.owns(pass.id)) return BF.ui.toast({ title: 'You already own ' + pass.name, kind: 'info' });
    const game = BF.catalog.get(pass.gameId);
    const bal = BF.economy.balance();
    const price = BF.passes.price(pass);
    const short = price - bal;
    BF.ui.modal({
      title: short > 0 ? 'Not enough ForgeCoins.' : 'Buy game pass',
      icon: short > 0 ? 'coin' : 'ticket',
      iconKind: short > 0 ? 'gold' : '',
      body: '<div class="pass-confirm"><img src="' + BF.thumbs.url(game) + '" alt=""><div><div class="bp-name">' + esc(pass.name) + '</div><div class="faint" style="font-size:12.5px">' + esc(game.name) + '</div><p class="muted" style="margin-top:6px;font-size:13px">' + esc(pass.desc) + '</p></div></div>' +
        '<div class="buy-math"><div><span>Price' + (price < pass.price ? ' <s class="faint num">' + U.fmt(pass.price) + '</s>' : '') + '</span>' + BF.ui.coins(price) + '</div><div><span>Your balance</span>' + BF.ui.coins(bal) + '</div><div class="bm-total"><span>After purchase</span>' + (short > 0 ? '<span class="delta-neg num">Short by ' + U.fmt(short) + '</span>' : BF.ui.coins(bal - price)) + '</div></div>',
      actions: short > 0
        ? [{ label: 'Close', kind: 'ghost' }, { label: 'Ways to earn', kind: 'gold', onClick: () => BF.router.go('#/wallet') }]
        : [{ label: 'Cancel', kind: 'ghost' }, {
          label: 'Buy for ' + U.fmt(price), kind: 'primary', icon: 'ticket', onClick: (h) => {
            const r = BF.passes.buy(pass.id);
            if (!r.ok) { purchaseResult(r, { name: pass.name }, h); return false; }
            BF.sfx.play('purchase');
            h.el.querySelector('.modal-title').textContent = 'Pass unlocked!';
            h.el.querySelector('.modal-body').innerHTML = '<div class="bought"><div class="bought-art rar-epic" style="width:120px;height:120px">' + BF.icon(pass.icon || 'ticket', 54) + '</div><div class="bought-check">' + BF.icon('check', 22) + '</div><p><b>' + esc(pass.name) + '</b> is active in ' + esc(game.name) + '. ' + esc(pass.desc) + '</p></div>';
            BF.ui.burst(h.el.querySelector('.bought-art'));
            h.el.querySelector('.modal-foot').innerHTML = '<button class="btn btn-ghost" data-m-close2>Close</button><button class="btn btn-play" data-play2>' + BF.icon('play', 13) + 'Play ' + esc(game.name) + '</button>';
            h.el.querySelector('[data-m-close2]').onclick = () => h.close();
            h.el.querySelector('[data-play2]').onclick = () => { h.close(); BF.play(game.id); };
            BF.ui.toast({ title: 'Purchase successful!', text: pass.name + ' unlocked in ' + game.name, kind: 'success', icon: 'ticket' });
            return false;
          },
        }],
    });
  };

  A['buy-product'] = async (p) => {
    const game = BF.catalog.get(p.game);
    const prod = game && game.products.find((x) => x.id === p.product);
    if (!prod) return;
    if (prod.type === 'item') return A['buy-item']({ item: prod.id });
    if (!BF.economy.canAfford(prod.price)) return purchaseResult({ ok: false, reason: 'insufficient', need: prod.price - BF.economy.balance() }, prod);
    const ok = await BF.ui.confirm({ title: 'Buy ' + prod.name + '?', html: esc(prod.desc) + '<br><br>Price: <b>' + U.fmt(prod.price) + ' ForgeCoins</b>', confirmLabel: 'Buy for ' + U.fmt(prod.price), icon: 'bag' });
    if (!ok) return;
    const r = BF.products.buy(game.id, prod.id);
    if (r.ok) { BF.sfx.play('purchase'); BF.ui.toast({ title: 'Purchase successful!', text: prod.name + ' delivered to ' + game.name + '.', kind: 'success', icon: 'bag' }); }
    else purchaseResult(r, prod);
  };

  // ------------------------------------------------------------------ social

  function userMenu(anchor, botId) {
    const bot = BF.bots.get(botId);
    if (!bot) return;
    const F = BF.friends;
    const items = [{ html: '<b>' + esc(bot.displayName) + '</b><div class="faint" style="font-size:12px">@' + esc(bot.username) + '</div>' }, { label: 'View profile', icon: 'user', href: '#/user/' + botId }];
    if (!F.isBlocked(botId)) items.push({ label: 'Send message', icon: 'chat', href: '#/messages/' + botId });
    const st = BF.world.botStatus(botId);
    if (st.state === 'ingame' && !F.isBlocked(botId)) items.push({ label: 'Join game', icon: 'play', onClick: () => BF.play(st.gameId, st.serverId) });
    items.push({ sep: true });
    if (F.isFriend(botId)) items.push({ label: 'Remove friend', icon: 'userX', danger: true, onClick: () => A['remove-friend']({ bot: botId }) });
    else if (F.hasIncoming(botId)) items.push({ label: 'Accept friend request', icon: 'userCheck', onClick: () => A['accept-friend']({ bot: botId }) });
    else if (F.hasOutgoing(botId)) items.push({ label: 'Cancel friend request', icon: 'x', onClick: () => A['cancel-request']({ bot: botId }) });
    else if (!F.isBlocked(botId)) items.push({ label: 'Add friend', icon: 'userPlus', onClick: () => A['add-friend']({ bot: botId }) });
    items.push(F.isFollowing(botId) ? { label: 'Unfollow', icon: 'users', onClick: () => A.unfollow({ bot: botId }) } : { label: 'Follow', icon: 'users', onClick: () => A.follow({ bot: botId }) });
    items.push(F.isBlocked(botId) ? { label: 'Unblock', icon: 'block', onClick: () => A.unblock({ bot: botId }) } : { label: 'Block', icon: 'block', danger: true, onClick: () => A.block({ bot: botId }) });
    BF.ui.menu(anchor, items);
  }
  A['user-menu'] = (p, el) => userMenu(el, p.bot);

  A['add-friend'] = (p) => {
    const bot = BF.bots.get(p.bot);
    const r = BF.friends.sendRequest(p.bot);
    if (!r.ok) return BF.ui.toast({ title: r.error, kind: 'info' });
    if (r.pending) BF.ui.toast({ title: 'Friend request sent', text: 'Waiting for ' + bot.displayName + ' to respond.', kind: 'success', icon: 'userPlus' });
    else BF.ui.toast({ title: 'You are now friends with ' + bot.displayName, kind: 'success', icon: 'userCheck' });
  };
  A['accept-friend'] = (p) => {
    const bot = BF.bots.get(p.bot);
    const r = BF.friends.accept(p.bot);
    if (r.ok) { BF.sfx.play('notify'); BF.ui.toast({ title: 'You are now friends with ' + bot.displayName, kind: 'success', icon: 'userCheck' }); }
  };
  A['decline-friend'] = (p) => {
    BF.friends.decline(p.bot);
    BF.ui.toast({ title: 'Request declined', kind: 'info' });
  };
  A['cancel-request'] = (p) => {
    BF.friends.cancel(p.bot);
    BF.ui.toast({ title: 'Friend request canceled', kind: 'info' });
  };
  A['remove-friend'] = async (p) => {
    const bot = BF.bots.get(p.bot);
    const ok = await BF.ui.confirm({ title: 'Remove ' + bot.displayName + '?', message: 'They will be removed from your friends list. You can send a new request later.', confirmLabel: 'Remove friend', danger: true, icon: 'userX' });
    if (!ok) return;
    BF.friends.remove(p.bot);
    BF.ui.toast({ title: 'Removed ' + bot.displayName + ' from friends', kind: 'info' });
  };
  A.block = async (p) => {
    const bot = BF.bots.get(p.bot);
    const ok = await BF.ui.confirm({ title: 'Block ' + bot.displayName + '?', message: 'Blocked players cannot message you, send friend requests or join your servers. They are also removed from your friends.', confirmLabel: 'Block', danger: true, icon: 'block' });
    if (!ok) return;
    BF.friends.block(p.bot);
    BF.ui.toast({ title: bot.displayName + ' is blocked', kind: 'info', icon: 'block' });
  };
  A.unblock = (p) => {
    BF.friends.unblock(p.bot);
    BF.ui.toast({ title: 'Unblocked', kind: 'success' });
  };
  A.follow = (p) => {
    BF.friends.follow(p.bot);
    BF.ui.toast({ title: 'Following ' + BF.bots.get(p.bot).displayName, kind: 'success', icon: 'users' });
  };
  A.unfollow = (p) => {
    BF.friends.unfollow(p.bot);
    BF.ui.toast({ title: 'Unfollowed', kind: 'info' });
  };
  A['join-friend'] = (p) => {
    const st = BF.world.botStatus(p.bot);
    if (st.state !== 'ingame') return BF.ui.toast({ title: 'They are not in a game right now.', kind: 'info' });
    BF.play(st.gameId, st.serverId);
  };

  // ------------------------------------------------------------ daily/quests

  A['open-daily'] = () => {
    const render = () => {
      const st = BF.daily.status();
      const days = BF.DAILY_REWARDS.map((amt, i) => {
        const claimed = st.claimedToday ? i <= st.currentIndex : i < st.currentIndex;
        const today = !st.claimedToday && i === st.currentIndex;
        return '<div class="dr-day' + (claimed ? ' claimed' : '') + (today ? ' today' : '') + (i === 6 ? ' big' : '') + '"><div class="dr-label">Day ' + (i + 1) + '</div>' + BF.coinIcon(i === 6 ? 34 : 26) + '<div class="dr-amt num">' + U.fmt(amt) + '</div>' + (claimed ? '<div class="dr-check">' + BF.icon('check', 14) + '</div>' : '') + '</div>';
      }).join('');
      return '<p class="muted" style="margin-bottom:14px">Log in every day to grow your streak. Miss a day and it starts again at day 1.</p><div class="dr-grid">' + days + '</div>' +
        '<div class="dr-foot"><div><div class="eyebrow">Current streak</div><div class="dr-streak num">' + st.streak + ' ' + (st.streak === 1 ? 'day' : 'days') + '</div></div><div class="faint" style="font-size:12.5px">' + (st.claimedToday ? 'Come back tomorrow for day ' + (((st.currentIndex + 1) % 7) + 1) + '.' : 'Today: day ' + st.nextDay + '.') + '</div></div>';
    };
    const st = BF.daily.status();
    BF.ui.modal({
      title: 'Daily rewards',
      icon: 'gift',
      iconKind: 'gold',
      wide: true,
      body: '<div id="daily-body">' + render() + '</div>',
      actions: st.canClaim
        ? [{ label: 'Later', kind: 'ghost' }, {
          label: 'Claim ' + U.fmt(st.nextAmount) + ' ForgeCoins', kind: 'gold', icon: 'gift', id: 'daily-claim-btn', onClick: (h) => {
            const r = BF.daily.claim();
            if (!r.ok) return true;
            BF.sfx.play('purchase');
            h.el.querySelector('#daily-body').innerHTML = render();
            const today = h.el.querySelector('.dr-day.claimed:nth-child(' + r.day + ')') || h.el.querySelector('.dr-grid');
            BF.ui.burst(today, ['#ffc940', '#f2a318', '#fff0b8']);
            BF.ui.coinFly(today, 8);
            h.el.querySelector('.modal-foot').innerHTML = '<button class="btn btn-primary" data-dclose>Nice!</button>';
            h.el.querySelector('[data-dclose]').onclick = () => h.close();
            BF.ui.toast({ title: 'Daily reward claimed', text: '+' + U.fmt(r.amount) + ' ForgeCoins · Day ' + r.day + ' streak', kind: 'coin' });
            return false;
          },
        }]
        : [{ label: 'Close', kind: 'primary' }],
    });
  };

  A['claim-quest'] = (p, el) => {
    const r = BF.quests.claim(p.scope, p.id);
    if (!r.ok) return;
    BF.sfx.play('purchase');
    if (el) BF.ui.coinFly(el, 6);
    BF.ui.toast({ title: 'Quest reward claimed', text: '+' + U.fmt(r.reward) + ' ForgeCoins · +' + U.fmt(r.xp) + ' XP', kind: 'coin' });
  };
  A['claim-all-quests'] = (p, el) => {
    const total = BF.quests.claimAll();
    if (!total) return BF.ui.toast({ title: 'Nothing to claim yet', kind: 'info' });
    BF.sfx.play('purchase');
    if (el) BF.ui.coinFly(el, 8);
    BF.ui.toast({ title: 'All quest rewards claimed', text: '+' + U.fmt(total) + ' ForgeCoins', kind: 'coin' });
  };

  // ----------------------------------------------------------------- shell

  A['toggle-sidebar'] = () => BF.shell.toggleSidebar();
  A['close-sidebar'] = () => BF.shell.closeSidebar();
  A['open-notifs'] = (p, el) => BF.shell.openNotifications(el);
  A['open-profile-menu'] = (p, el) => BF.shell.openProfileMenu(el);
  A['open-search'] = () => {
    document.getElementById('topbar').classList.add('search-open');
    const i = document.getElementById('global-search');
    i.focus();
  };
  A['show-shortcuts'] = () => BF.shell.showShortcuts();
  A.nav = (p) => BF.router.go(p.href);
  A['mark-all-read'] = () => { BF.notify.markAllRead(); BF.ui.toast({ title: 'All notifications marked as read', kind: 'success' }); };

  A['save-now'] = () => {
    const r = BF.store.save('manual');
    if (r.ok !== false) BF.ui.toast({ title: 'Progress saved', text: BF.storage.isPersistent() ? 'Saved to this device at ' + U.fmtClockTime(Date.now()) + '.' : 'Browser storage is unavailable, so progress is kept in memory. Export a save from Settings.', kind: 'success', icon: 'save' });
    else BF.ui.toast({ title: 'Could not save', text: r.error === 'quota' ? 'Browser storage is full. Export your save from Settings > Data.' : 'Storage is unavailable.', kind: 'error' });
  };

  A['sign-out'] = async () => {
    const ok = await BF.ui.confirm({ title: 'Sign out?', message: 'Your progress is saved on this device. You can sign back in any time.', confirmLabel: 'Sign out', icon: 'logout' });
    if (ok) BF.app.signOut();
  };
})((window.BF = window.BF || {}));
