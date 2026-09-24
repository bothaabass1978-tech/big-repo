/**
 * BlockForge — UI primitives (toasts, modals, menus, tooltips, banners) and
 * HTML template helpers shared by every page. Templates return strings; all
 * user-provided text is escaped with BF.util.esc.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const esc = U.esc;
  let layer = null;
  let toastsEl = null;
  let bannerEl = null;
  let tipEl = null;
  const openMenus = new Set();
  const modalStack = [];

  const ui = (BF.ui = {
    currentConversation: null,

    init() {
      layer = document.getElementById('layer-root');
      toastsEl = document.createElement('div');
      toastsEl.className = 'toasts';
      toastsEl.setAttribute('aria-live', 'polite');
      bannerEl = document.createElement('div');
      bannerEl.className = 'banner-layer';
      document.body.appendChild(toastsEl);
      document.body.appendChild(bannerEl);
      installTooltips();
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (openMenus.size) { ui.closeMenus(); e.stopPropagation(); return; }
        const top = modalStack[modalStack.length - 1];
        if (top && top.dismissible !== false) { top.close(); e.stopPropagation(); }
      }, true);
      document.addEventListener('pointerdown', (e) => {
        for (const m of Array.from(openMenus)) if (!m.el.contains(e.target) && !(m.anchor && m.anchor.contains(e.target))) m.close();
      }, true);
      window.addEventListener('resize', () => ui.closeMenus());
    },

    // ------------------------------------------------------------- toast
    /**
     * Show a toast.
     * @param {string|{title:string, text?:string, kind?:string, icon?:string, duration?:number, action?:{label:string, onClick:Function}}} o
     */
    toast(o) {
      if (typeof o === 'string') o = { title: o };
      const kind = o.kind || 'info';
      const el = document.createElement('div');
      el.className = 'toast ' + kind;
      el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
      const icon = o.icon === 'coin' || kind === 'coin' ? BF.coinIcon(18) : BF.icon(o.icon || (kind === 'success' ? 'check' : kind === 'error' ? 'warning' : 'info'), 16);
      const dur = o.duration || (kind === 'error' ? 4200 : 3200);
      el.innerHTML = '<div class="t-icon">' + icon + '</div><div class="t-body"><div class="t-title">' + esc(o.title) + '</div>' + (o.text ? '<div class="t-text">' + esc(o.text) + '</div>' : '') +
        (o.action ? '<button class="btn btn-xs btn-outline" style="margin-top:8px" data-t-act>' + esc(o.action.label) + '</button>' : '') +
        '</div><button class="icon-btn sm t-close" aria-label="Dismiss">' + BF.icon('x', 14) + '</button><div class="t-timer" style="animation-duration:' + dur + 'ms"></div>';
      const close = () => {
        if (el.classList.contains('out')) return;
        el.classList.add('out');
        setTimeout(() => el.remove(), 200);
      };
      el.querySelector('.t-close').onclick = close;
      if (o.action) el.querySelector('[data-t-act]').onclick = () => { o.action.onClick(); close(); };
      let timer = setTimeout(close, dur);
      el.addEventListener('mouseenter', () => { clearTimeout(timer); el.querySelector('.t-timer').style.animationPlayState = 'paused'; });
      el.addEventListener('mouseleave', () => { timer = setTimeout(close, 1500); });
      toastsEl.appendChild(el);
      while (toastsEl.children.length > 4) toastsEl.firstElementChild.remove();
      return { close };
    },

    // ------------------------------------------------------------- modal
    /**
     * Open a modal dialog.
     * @param {{title?:string, body:string, icon?:string, iconKind?:string, wide?:boolean|string, cls?:string,
     *   actions?:Array<{label:string, kind?:string, id?:string, onClick?:Function, disabled?:boolean}>,
     *   onOpen?:Function, onClose?:Function, dismissible?:boolean}} o
     */
    modal(o) {
      const scrim = document.createElement('div');
      scrim.className = 'modal-scrim';
      const wide = o.wide === 'x' ? ' xwide' : o.wide ? ' wide' : '';
      const titleId = U.uid('mt');
      scrim.innerHTML = '<div class="modal' + wide + (o.cls ? ' ' + o.cls : '') + '" role="dialog" aria-modal="true"' + (o.title ? ' aria-labelledby="' + titleId + '"' : '') + '>' +
        (o.title || o.icon ? '<div class="modal-head">' + (o.icon ? '<div class="modal-icon ' + (o.iconKind || '') + '">' + (o.icon === 'coin' ? BF.coinIcon(24) : BF.icon(o.icon, 22)) + '</div>' : '') + '<div class="modal-title" id="' + titleId + '">' + esc(o.title || '') + '</div>' +
        (o.dismissible === false ? '' : '<button class="icon-btn sm" data-m-close aria-label="Close">' + BF.icon('x', 16) + '</button>') + '</div>' : '') +
        '<div class="modal-body">' + (o.body || '') + '</div>' +
        (o.actions && o.actions.length ? '<div class="modal-foot">' + o.actions.map((a, i) => '<button class="btn ' + (a.kind ? 'btn-' + a.kind : '') + '" data-m-act="' + i + '"' + (a.id ? ' id="' + a.id + '"' : '') + (a.disabled ? ' disabled' : '') + '>' + (a.icon ? BF.icon(a.icon, 15) : '') + esc(a.label) + '</button>').join('') + '</div>' : '') +
        '</div>';
      const prevFocus = document.activeElement;
      const handle = {
        el: scrim.querySelector('.modal'),
        scrim,
        dismissible: o.dismissible,
        closed: false,
        close(result) {
          if (handle.closed) return;
          handle.closed = true;
          const i = modalStack.indexOf(handle);
          if (i >= 0) modalStack.splice(i, 1);
          scrim.classList.add('closing');
          setTimeout(() => scrim.remove(), 150);
          if (o.onClose) o.onClose(result);
          if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
        },
      };
      scrim.addEventListener('pointerdown', (e) => {
        if (e.target === scrim && o.dismissible !== false) handle.close();
      });
      scrim.querySelectorAll('[data-m-close]').forEach((b) => { b.onclick = () => handle.close(); });
      scrim.querySelectorAll('[data-m-act]').forEach((b) => {
        b.onclick = () => {
          const a = o.actions[Number(b.dataset.mAct)];
          const r = a.onClick ? a.onClick(handle, b) : undefined;
          if (r !== false) handle.close(a.value);
        };
      });
      layer.appendChild(scrim);
      modalStack.push(handle);
      BF.sfx.play('open');
      if (o.onOpen) o.onOpen(handle.el, handle);
      const focusable = handle.el.querySelector('[autofocus], input, textarea, select, .modal-foot .btn-primary, .modal-foot .btn');
      if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 30);
      return handle;
    },

    /** Promise-based confirmation dialog (never uses window.confirm). */
    confirm(o) {
      return new Promise((resolve) => {
        let done = false;
        ui.modal({
          title: o.title,
          icon: o.icon || (o.danger ? 'warning' : 'info'),
          iconKind: o.danger ? 'danger' : o.iconKind || '',
          body: '<p class="muted">' + (o.html || esc(o.message || '')) + '</p>',
          actions: [
            { label: o.cancelLabel || 'Cancel', kind: 'ghost', onClick: () => { done = true; resolve(false); } },
            { label: o.confirmLabel || 'Confirm', kind: o.danger ? 'danger' : 'primary', onClick: () => { done = true; resolve(true); } },
          ],
          onClose: () => { if (!done) resolve(false); },
        });
      });
    },

    closeAllModals() {
      modalStack.slice().forEach((m) => m.close());
    },

    // -------------------------------------------------------------- menus
    /**
     * Open a dropdown/context menu.
     * @param {Element|{x:number,y:number}} anchor
     * @param {Array<{label?:string, icon?:string, onClick?:Function, danger?:boolean, sep?:boolean, html?:string, hint?:string, href?:string}>} items
     * @param {{align?:'left'|'right', width?:number}} [opts]
     */
    menu(anchor, items, opts) {
      opts = opts || {};
      ui.closeMenus();
      const el = document.createElement('div');
      el.className = 'menu';
      el.setAttribute('role', 'menu');
      if (opts.width) el.style.width = opts.width + 'px';
      el.innerHTML = items.map((it, i) => {
        if (it.sep) return '<div class="menu-sep"></div>';
        if (it.html) return '<div class="menu-head">' + it.html + '</div>';
        return '<button class="menu-item' + (it.danger ? ' danger' : '') + '" role="menuitem" data-i="' + i + '">' + (it.icon ? (it.icon === 'coin' ? BF.coinIcon(15) : BF.icon(it.icon, 16)) : '') + '<span>' + esc(it.label) + '</span>' + (it.hint ? '<span class="mi-hint">' + esc(it.hint) + '</span>' : '') + '</button>';
      }).join('');
      document.body.appendChild(el);
      const r = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0 };
      const w = el.offsetWidth, h = el.offsetHeight;
      let x = opts.align === 'right' ? r.right - w : r.left;
      let y = r.bottom + 6;
      if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 6);
      x = U.clamp(x, 8, window.innerWidth - w - 8);
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      const handle = {
        el,
        anchor: anchor instanceof Element ? anchor : null,
        close() {
          openMenus.delete(handle);
          el.remove();
          if (handle.anchor) handle.anchor.setAttribute('aria-expanded', 'false');
        },
      };
      if (handle.anchor) handle.anchor.setAttribute('aria-expanded', 'true');
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-i]');
        if (!b) return;
        const it = items[Number(b.dataset.i)];
        handle.close();
        if (it.href) BF.router.go(it.href);
        if (it.onClick) it.onClick();
      });
      el.addEventListener('keydown', (e) => {
        const btns = Array.from(el.querySelectorAll('.menu-item'));
        const i = btns.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); (btns[i + 1] || btns[0]).focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); (btns[i - 1] || btns[btns.length - 1]).focus(); }
      });
      openMenus.add(handle);
      const first = el.querySelector('.menu-item');
      if (first && opts.focus !== false) setTimeout(() => first.focus({ preventScroll: true }), 10);
      return handle;
    },

    closeMenus() {
      for (const m of Array.from(openMenus)) m.close();
    },

    // ----------------------------------------------------------- banners
    /** Animated banner for achievements, badges and level-ups. */
    banner(o) {
      const el = document.createElement('div');
      el.className = 'ach-banner ' + (o.kind || '');
      el.innerHTML = '<div class="ab-icon">' + (o.icon === 'coin' ? BF.coinIcon(26) : BF.icon(o.icon || 'trophy', 24)) + '</div><div><div class="ab-kicker">' + esc(o.kicker) + '</div><div class="ab-title">' + esc(o.title) + '</div>' + (o.desc ? '<div class="ab-desc">' + esc(o.desc) + '</div>' : '') + '</div>';
      bannerEl.appendChild(el);
      setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, o.duration || 4200);
    },

    /** Fly a few coins from an element (or point) into the header balance. */
    coinFly(from, count) {
      if (document.documentElement.dataset.bfMotion === 'reduced') return;
      const target = document.querySelector('#coin-pill .fc-icon');
      if (!target) return;
      const t = target.getBoundingClientRect();
      const f = from instanceof Element ? from.getBoundingClientRect() : { left: from.x, top: from.y, width: 0, height: 0 };
      const n = Math.min(count || 6, 10);
      for (let i = 0; i < n; i++) {
        const c = document.createElement('div');
        c.className = 'coin-fly';
        c.innerHTML = BF.coinIcon(20);
        const sx = f.left + f.width / 2 + U.rand(-24, 24), sy = f.top + f.height / 2 + U.rand(-16, 16);
        c.style.left = sx + 'px';
        c.style.top = sy + 'px';
        document.body.appendChild(c);
        setTimeout(() => {
          c.style.transform = 'translate(' + (t.left - sx) + 'px,' + (t.top - sy) + 'px) scale(.7)';
          c.style.opacity = '0.3';
        }, 20 + i * 55);
        setTimeout(() => c.remove(), 900 + i * 55);
      }
    },

    /** Small floating +N / -N label. */
    floatDelta(x, y, text, color) {
      const el = document.createElement('div');
      el.className = 'float-delta';
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.color = color || 'var(--gold)';
      el.textContent = text;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1150);
    },

    /** Confetti burst inside an element (purchase confirmation). */
    burst(el, colors) {
      if (!el || document.documentElement.dataset.bfMotion === 'reduced') return;
      const b = document.createElement('div');
      b.className = 'purchase-burst';
      colors = colors || ['#ffc940', '#ff7a2e', '#46a8ff', '#4ad17f', '#b67cff'];
      for (let i = 0; i < 26; i++) {
        const p = document.createElement('i');
        const a = (i / 26) * Math.PI * 2, d = U.rand(60, 150);
        p.style.setProperty('--dx', Math.cos(a) * d + 'px');
        p.style.setProperty('--dy', Math.sin(a) * d + 'px');
        p.style.background = colors[i % colors.length];
        p.style.animationDelay = U.rand(0, 80) + 'ms';
        b.appendChild(p);
      }
      el.style.position = el.style.position || 'relative';
      el.appendChild(b);
      setTimeout(() => b.remove(), 1000);
    },

    // --------------------------------------------------------- templates
    coins(n, opts) {
      opts = opts || {};
      const sign = opts.sign ? (n > 0 ? '+' : n < 0 ? '−' : '') : '';
      return '<span class="coins' + (opts.cls ? ' ' + opts.cls : '') + '">' + BF.coinIcon(opts.size || 15) + '<span class="num">' + sign + U.fmt(Math.abs(n)) + '</span></span>';
    },
    rarityTag(r) {
      const R = BF.RARITY[r] || BF.RARITY.common;
      return '<span class="rarity-tag rar-' + R.key + '">' + R.label + '</span>';
    },
    ownedTag(label) {
      return '<span class="owned-tag">' + BF.icon('check', 11) + (label || 'Owned') + '</span>';
    },
    avatar(av, opts) {
      return BF.avatar.render(av, opts);
    },
    /** Round avatar bust with optional status dot. */
    avatarChip(av, opts) {
      opts = opts || {};
      return '<span class="avatar-wrap"><span class="avatar-chip ' + (opts.size || '') + '">' + BF.avatar.render(av, { crop: 'bust', still: true, size: 60 }) + '</span>' + (opts.status ? '<span class="status-dot ' + opts.status + '" data-live="dot:' + (opts.id || '') + '"></span>' : '') + '</span>';
    },
    statusText(st) {
      if (st.state === 'ingame') {
        const g = BF.catalog.get(st.gameId);
        return '<span class="status-text ingame">Playing ' + esc(g ? g.name : 'a game') + '</span>';
      }
      if (st.state === 'online') return '<span class="status-text online">Online</span>';
      return '<span class="status-text">Last online ' + U.timeAgo(st.lastSeen) + '</span>';
    },
    empty(o) {
      return '<div class="empty"><div class="empty-icon">' + BF.icon(o.icon || 'box', 28) + '</div><h3>' + esc(o.title) + '</h3>' + (o.text ? '<p>' + esc(o.text) + '</p>' : '') +
        (o.action ? (o.action.href ? '<a class="btn btn-primary btn-sm" href="' + o.action.href + '">' + esc(o.action.label) + '</a>' : '<button class="btn btn-primary btn-sm" data-act="' + o.action.act + '">' + esc(o.action.label) + '</button>') : '') + '</div>';
    },
    skeletonCards(n) {
      let o = '<div class="grid-cards">';
      for (let i = 0; i < n; i++) o += '<div class="skel-card"><div class="skel skel-thumb"></div><div class="skel skel-line"></div><div class="skel skel-line short"></div></div>';
      return o + '</div>';
    },
    /** Tab strip; items: [{id, label, href, count?, icon?}] */
    tabs(items, active) {
      return '<nav class="tabs" role="tablist">' + items.map((t) => '<a class="tab' + (t.id === active ? ' on' : '') + '" role="tab" aria-selected="' + (t.id === active) + '" href="' + t.href + '">' + (t.icon ? BF.icon(t.icon, 15) : '') + esc(t.label) + (t.count != null && t.count !== 0 ? '<span class="count-badge">' + U.fmt(t.count) + '</span>' : '') + '</a>').join('') + '</nav>';
    },
    bar(v, max, cls) {
      const pct = max > 0 ? U.clamp((v / max) * 100, 0, 100) : 0;
      return '<div class="bar ' + (cls || '') + '"><i style="width:' + pct.toFixed(1) + '%"></i></div>';
    },
    sectionHead(title, icon, link) {
      return '<div class="section-head"><h2 class="section-title">' + (icon ? BF.icon(icon, 18) : '') + esc(title) + '</h2>' + (link ? '<a class="section-link" href="' + link.href + '">' + esc(link.label) + BF.icon('chevronRight', 14) + '</a>' : '') + '</div>';
    },

    /** Game card: thumbnail, title, creator, players, rating, genre, favorite, like/dislike, play. */
    gameCard(g, opts) {
      opts = opts || {};
      const st = BF.catalog.stats(g.id);
      const fav = BF.catalog.isFavorite(g.id);
      const vote = BF.catalog.myVote(g.id);
      return '<article class="gcard' + (opts.compact ? ' compact' : '') + '" data-href="#/game/' + g.id + '" data-ctx="game" data-game="' + g.id + '">' +
        '<div class="gcard-thumb"><img src="' + BF.thumbs.url(g) + '" alt="" loading="lazy" draggable="false"><span class="gcard-genre">' + esc(g.genre) + '</span>' +
        '<button class="gcard-fav' + (fav ? ' on' : '') + '" data-act="fav" data-game="' + g.id + '" aria-label="' + (fav ? 'Remove from favorites' : 'Add to favorites') + '" data-tip="' + (fav ? 'Favorited' : 'Favorite') + '">' + BF.icon('heart', 16) + '</button>' +
        '<button class="btn btn-sm btn-play gcard-play" data-act="play" data-game="' + g.id + '">' + BF.icon('play', 13) + 'Play</button></div>' +
        '<div class="gcard-body"><a class="gcard-title" href="#/game/' + g.id + '">' + esc(g.name) + '</a><div class="gcard-creator">by ' + esc(g.creator) + '</div>' +
        '<div class="gcard-meta"><span class="m"><span class="live-dot"></span><span data-live="playing:' + g.id + '">' + U.compact(st.playing) + '</span> playing</span><span class="m" data-tip="Like ratio">' + BF.icon('thumbUp', 13) + Math.round(st.approval * 100) + '%</span></div>' +
        '<div class="gcard-foot"><button class="vote' + (vote === 'like' ? ' on-like' : '') + '" data-act="vote" data-game="' + g.id + '" data-vote="like" aria-label="Like" data-tip="Like">' + BF.icon('thumbUp', 14) + U.compact(st.likes) + '</button>' +
        '<button class="vote' + (vote === 'dislike' ? ' on-dislike' : '') + '" data-act="vote" data-game="' + g.id + '" data-vote="dislike" aria-label="Dislike" data-tip="Dislike">' + BF.icon('thumbDown', 14) + '</button>' +
        '<button class="btn btn-xs btn-play" data-act="play" data-game="' + g.id + '" aria-label="Play ' + esc(g.name) + '">' + BF.icon('play', 11) + 'Play</button></div></div></article>';
    },

    /** Large featured banner card. */
    featureCard(g) {
      const st = BF.catalog.stats(g.id);
      return '<article class="feature" data-href="#/game/' + g.id + '"><img src="' + BF.thumbs.url(g) + '" alt=""><div class="feature-body"><span class="eyebrow" style="color:#ffc940">Featured experience</span><h3 class="feature-title">' + esc(g.name) + '</h3><p class="feature-desc">' + esc(g.description) + '</p>' +
        '<div class="feature-meta"><span><span class="live-dot"></span> <span data-live="playing:' + g.id + '">' + U.compact(st.playing) + '</span> playing</span><span>' + BF.icon('thumbUp', 13) + ' ' + Math.round(st.approval * 100) + '%</span><span>' + U.compact(st.visits) + ' visits</span><span>' + esc(g.genre) + '</span></div>' +
        '<div style="display:flex;gap:8px;margin-top:6px"><button class="btn btn-play" data-act="play" data-game="' + g.id + '">' + BF.icon('play', 14) + 'Play</button><a class="btn btn-outline" style="color:#eef1f6;border-color:rgba(255,255,255,.3)" href="#/game/' + g.id + '">Details</a></div></div></article>';
    },

    /** Preview art for an item: avatar render or collectible glyph. */
    itemPreview(item, opts) {
      opts = opts || {};
      const R = BF.RARITY[item.rarity];
      if (item.cat === 'collectible' || item.cat === 'tool') return glyph(item.look.icon, item.look.c1 || R.color, R.color);
      const base = { skin: '#f1c27d', equipped: { head: 'head_block', face: 'face_smile', hair: null, shirt: MANNEQUIN.shirt, pants: MANNEQUIN.pants, shoes: MANNEQUIN.shoes, animation: 'anim_default' } };
      let crop = 'full';
      const eq = base.equipped;
      const cat = item.cat;
      if (cat === 'bundle') item.contents.forEach((id) => { const it = BF.ITEMS[id]; eq[BF.ITEM_CATS[it.cat].slot] = id; });
      else if (cat === 'emote' || cat === 'animation') { eq.hair = 'hair_tidy'; eq.shirt = 'shirt_forge'; eq.pants = 'pants_denim'; eq.shoes = 'shoes_sneakers'; }
      else eq[BF.ITEM_CATS[cat].slot] = item.id;
      if (['head', 'face', 'hair', 'accessory'].includes(cat)) crop = 'head';
      else if (cat === 'hat') crop = 'hat';
      else if (cat === 'neck' || cat === 'shoulder') crop = 'bust';
      if (opts.onAvatar && BF.store.state) {
        const mine = U.clone(BF.store.state.avatar);
        if (cat === 'bundle') item.contents.forEach((id) => { const it = BF.ITEMS[id]; mine.equipped[BF.ITEM_CATS[it.cat].slot] = id; });
        else if (BF.ITEM_CATS[cat].slot) mine.equipped[BF.ITEM_CATS[cat].slot] = item.id;
        return BF.avatar.render(mine, { size: opts.size || 200, emote: cat === 'emote' ? item.look.anim : null, anim: cat === 'animation' ? item.look.anim : null });
      }
      const moving = cat === 'emote' || cat === 'animation';
      return BF.avatar.render(base, {
        size: opts.size || 160,
        crop,
        still: !opts.animate && !moving,
        emote: cat === 'emote' ? item.look.anim : null,
        anim: cat === 'animation' ? item.look.anim : null,
        cls: opts.animate ? '' : 'paused',
      });
    },

    /** Shop / inventory item card. */
    itemCard(item, opts) {
      opts = opts || {};
      const owned = BF.inventory.isOwned(item);
      const price = BF.inventory.priceFor(item);
      const equipped = BF.avatar.isEquipped(item.id);
      let foot;
      if (opts.inventory) {
        foot = (opts.qty > 1 ? '<span class="pill">x' + U.fmt(opts.qty) + '</span>' : '<span class="faint" style="font-size:12px">' + esc(BF.ITEM_CATS[item.cat].label) + '</span>') +
          (BF.ITEM_CATS[item.cat].slot ? (equipped ? '<button class="btn btn-xs btn-outline" data-act="unequip" data-item="' + item.id + '">Unequip</button>' : '<button class="btn btn-xs btn-primary" data-act="equip" data-item="' + item.id + '">Equip</button>') : '');
      } else if (item.notForSale) {
        foot = '<span class="faint" style="font-size:12px">Found in game</span>';
      } else if (owned && item.cat !== 'collectible') {
        foot = ui.ownedTag() + (BF.ITEM_CATS[item.cat].slot ? (equipped ? '<span class="pill success">Equipped</span>' : '<button class="btn btn-xs btn-outline" data-act="equip" data-item="' + item.id + '">Equip</button>') : '');
      } else {
        foot = ui.coins(price) + '<button class="btn btn-xs btn-primary" data-act="buy-item" data-item="' + item.id + '">Buy</button>';
      }
      return '<article class="icard rar-' + item.rarity + '" data-act="item-detail" data-item="' + item.id + '" tabindex="0">' +
        '<div class="icard-thumb">' + ui.itemPreview(item) + ui.rarityTag(item.rarity) + (owned && !opts.inventory && item.cat !== 'collectible' ? '<span class="owned-tag">' + BF.icon('check', 11) + '</span>' : '') + (opts.fav ? '<span class="owned-tag" style="right:8px;top:8px;position:absolute;color:#ff4f7a;background:rgba(255,79,122,.14)">' + BF.icon('heart', 11) + '</span>' : '') + '</div>' +
        '<div class="icard-body"><div class="icard-name">' + esc(item.name) + '</div><div class="icard-creator">' + (item.cat === 'bundle' ? item.contents.length + ' items · ' : '') + 'by ' + esc(item.creator) + '</div><div class="icard-foot">' + foot + '</div></div></article>';
    },

    /** Row for a player (bot) with status and actions html. */
    userRow(bot, actions, opts) {
      opts = opts || {};
      const st = BF.world.botStatus(bot.id);
      return '<div class="list-row" data-ctx="user" data-bot="' + bot.id + '">' +
        '<a href="#/user/' + bot.id + '">' + ui.avatarChip(bot.avatar, { status: st.state, id: bot.id }) + '</a>' +
        '<div class="row-main"><a class="row-title" href="#/user/' + bot.id + '">' + esc(bot.displayName) + '</a><div class="row-sub">@' + esc(bot.username) + ' · <span data-live="status:' + bot.id + '">' + ui.statusText(st) + '</span>' + (opts.sub ? ' · ' + opts.sub : '') + '</div></div>' +
        '<div class="row-actions">' + (actions || '') + '</div></div>';
    },

    /** Achievement icon, supporting the ForgeCoin mark. */
    achIcon(icon, size) {
      return icon === 'coin' ? BF.coinIcon(size || 20) : BF.icon(icon, size || 20);
    },
  });

  const MANNEQUIN = {
    shirt: { style: 'logo', c1: '#5a6475', c2: '#7b8597' },
    pants: { style: 'jeans', c1: '#3b4352' },
    shoes: { style: 'sneaker', c1: '#8b95a5', c2: '#6b7585' },
  };
  BF.MANNEQUIN = MANNEQUIN;

  /** Simple glyph art for collectibles and tools. */
  function glyph(kind, color, rc) {
    const dark = U.shade(color, -0.35), light = U.shade(color, 0.35);
    const g = {
      anvil: '<path d="M10 30h40a14 14 0 0 1-14 12h-2v10h8v8H22v-8h8V42h-4A16 16 0 0 1 10 30z" fill="' + color + '"/><path d="M50 30h12l-6 6h-6z" fill="' + dark + '"/><path d="M12 30h38" stroke="' + light + '" stroke-width="2"/>',
      coin: '<circle cx="36" cy="36" r="22" fill="' + color + '" stroke="' + dark + '" stroke-width="3"/><circle cx="36" cy="36" r="14" fill="' + light + '"/><path d="M30 30h12v4H34v4h6v4h-6v6h-4z" fill="' + dark + '"/>',
      shell: '<path d="M36 14c14 6 22 20 20 34H16c-2-14 6-28 20-34z" fill="' + color + '"/><path d="M36 14v34M26 20l4 28M46 20l-4 28" stroke="' + dark + '" stroke-width="2"/><rect x="28" y="48" width="16" height="6" rx="3" fill="' + dark + '"/>',
      pearl: '<circle cx="36" cy="38" r="18" fill="' + color + '"/><circle cx="30" cy="32" r="5" fill="#fff" opacity=".8"/><path d="M14 52c10 8 34 8 44 0" stroke="' + dark + '" stroke-width="3" fill="none"/>',
      gem: '<path d="M22 18h28l10 12-24 28-24-28z" fill="' + color + '"/><path d="M12 30h48M36 58L28 30l4-12M36 58l8-28-4-12" stroke="' + light + '" stroke-width="2" fill="none"/>',
      beetle: '<ellipse cx="36" cy="40" rx="15" ry="19" fill="' + color + '"/><circle cx="36" cy="20" r="7" fill="' + dark + '"/><path d="M36 22v36M21 32l-8-4M51 32l8-4M21 44l-9 2M51 44l9 2M22 54l-6 6M50 54l6 6" stroke="' + dark + '" stroke-width="2.4"/>',
      key: '<circle cx="24" cy="36" r="11" fill="none" stroke="' + color + '" stroke-width="6"/><path d="M34 36h26v8M50 36v6" stroke="' + color + '" stroke-width="6" fill="none"/>',
      flag: '<path d="M18 60V12" stroke="' + dark + '" stroke-width="4"/><rect x="20" y="14" width="34" height="24" fill="' + color + '"/><path d="M20 14h8v8h-8zM36 14h8v8h-8zM28 22h8v8h-8zM44 22h8v8h-8zM20 30h8v8h-8zM36 30h8v8h-8z" fill="#1b1b22"/>',
      trophy: '<path d="M24 14h24v14a12 12 0 0 1-24 0z" fill="' + color + '"/><path d="M24 18h-8a8 8 0 0 0 8 10M48 18h8a8 8 0 0 1-8 10" stroke="' + color + '" stroke-width="3" fill="none"/><rect x="33" y="40" width="6" height="10" fill="' + dark + '"/><rect x="24" y="50" width="24" height="8" rx="2" fill="' + dark + '"/>',
      pickaxe: '<path d="M16 58L50 24" stroke="#8b5a2b" stroke-width="6" stroke-linecap="round"/><path d="M26 16c12-6 30-2 34 10-10-4-22-6-34-10z" fill="' + color + '" stroke="' + dark + '" stroke-width="2"/>',
      shovel: '<path d="M20 56L46 30" stroke="#8b5a2b" stroke-width="6" stroke-linecap="round"/><path d="M44 18l12 12-6 10-16-16z" fill="' + color + '" stroke="' + dark + '" stroke-width="2"/>',
      sword: '<path d="M52 14L28 38" stroke="' + color + '" stroke-width="7" stroke-linecap="round"/><path d="M20 30l14 14" stroke="' + dark + '" stroke-width="5" stroke-linecap="round"/><path d="M24 44l-8 8" stroke="#6b4226" stroke-width="6" stroke-linecap="round"/>',
      bolt: '<path d="M38 10L18 40h14l-4 22 22-32H36z" fill="' + color + '" stroke="' + dark + '" stroke-width="2"/>',
    }[kind] || '<rect x="16" y="16" width="40" height="40" rx="8" fill="' + color + '"/>';
    return '<svg class="item-glyph" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="38" r="30" fill="' + rc + '" opacity=".12"/>' + g + '</svg>';
  }
  ui.glyph = glyph;

  function installTooltips() {
    let current = null;
    let timer = null;
    const show = (target) => {
      const text = target.getAttribute('data-tip');
      if (!text) return;
      hide();
      tipEl = document.createElement('div');
      tipEl.className = 'tip';
      tipEl.textContent = text;
      document.body.appendChild(tipEl);
      const r = target.getBoundingClientRect();
      const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      let x = r.left + r.width / 2 - w / 2;
      let y = r.top - h - 8;
      if (y < 6) y = r.bottom + 8;
      tipEl.style.left = U.clamp(x, 6, window.innerWidth - w - 6) + 'px';
      tipEl.style.top = y + 'px';
      current = target;
    };
    const hide = () => {
      clearTimeout(timer);
      if (tipEl) tipEl.remove();
      tipEl = null;
      current = null;
    };
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch') return;
      const t = e.target.closest('[data-tip]');
      if (t === current) return;
      clearTimeout(timer);
      if (!t) { hide(); return; }
      timer = setTimeout(() => show(t), 350);
    });
    document.addEventListener('focusin', (e) => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (t && e.target.matches(':focus-visible')) show(t);
    });
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('scroll', hide, true);
  }
})((window.BF = window.BF || {}));
