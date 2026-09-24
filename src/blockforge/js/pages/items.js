/**
 * BlockForge — Avatar Shop, Inventory and the Avatar editor.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const esc = U.esc;

  // ------------------------------------------------------------------- shop

  const SHOP_TABS = [
    ['featured', 'Featured', 'sparkle'],
    ['avatar', 'Avatar', 'user'],
    ['accessories', 'Accessories', 'hat'],
    ['clothing', 'Clothing', 'shirt'],
    ['animations', 'Animations', 'run'],
    ['emotes', 'Emotes', 'emote'],
    ['bundles', 'Bundles', 'gift'],
  ];
  const SHOP_SORTS = [['featured', 'Recommended'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['rarity', 'Rarity'], ['name', 'Name A–Z']];
  const shop = { q: '', sort: 'featured', rarity: 'all', sub: 'all', hideOwned: false };

  function sortItems(list, key) {
    const r = (i) => BF.RARITY[i.rarity].rank;
    const cmp = {
      featured: (a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || a.order - b.order,
      'price-asc': (a, b) => BF.inventory.priceFor(a) - BF.inventory.priceFor(b),
      'price-desc': (a, b) => BF.inventory.priceFor(b) - BF.inventory.priceFor(a),
      rarity: (a, b) => r(b) - r(a) || b.price - a.price,
      name: (a, b) => a.name.localeCompare(b.name),
      recent: (a, b) => b.at - a.at,
      value: (a, b) => b.value - a.value,
    }[key];
    return cmp ? list.slice().sort(cmp) : list;
  }

  function shopList(tab) {
    let list = BF.ITEM_LIST.filter((i) => !i.notForSale && i.cat !== 'tool' && i.cat !== 'collectible' && i.price > 0);
    if (tab !== 'featured') list = list.filter((i) => BF.ITEM_CATS[i.cat].group === tab);
    if (shop.sub !== 'all') list = list.filter((i) => i.cat === shop.sub);
    if (shop.rarity !== 'all') list = list.filter((i) => i.rarity === shop.rarity);
    if (shop.hideOwned) list = list.filter((i) => !BF.inventory.isOwned(i));
    const q = shop.q.trim().toLowerCase();
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q) || i.creator.toLowerCase().includes(q) || BF.ITEM_CATS[i.cat].label.toLowerCase().includes(q));
    return sortItems(list, shop.sort);
  }

  function shopGrid(tab) {
    const list = shopList(tab);
    return '<div class="results-meta"><span class="faint">' + U.plural(list.length, 'item') + '</span></div>' +
      (list.length ? '<div class="grid-cards items">' + list.map((i) => BF.ui.itemCard(i)).join('') + '</div>' : BF.ui.empty({ icon: 'bag', title: 'No items match', text: 'Try a different rarity or search.' }));
  }

  function featuredTab() {
    const hero = BF.ITEMS.hat_firehalo;
    const limited = BF.ITEMS.col_founders_anvil;
    const bundles = BF.ITEM_LIST.filter((i) => i.cat === 'bundle');
    const topRare = BF.ITEM_LIST.filter((i) => !i.notForSale && ['legendary', 'mythic'].includes(i.rarity) && i.cat !== 'bundle' && i.cat !== 'collectible' && i.price > 0);
    const cheap = BF.ITEM_LIST.filter((i) => i.price > 0 && i.price <= 150 && i.cat !== 'tool' && !i.notForSale).sort((a, b) => a.price - b.price);
    const newest = BF.ITEM_LIST.filter((i) => i.price > 0 && !i.notForSale && i.cat !== 'tool' && i.cat !== 'collectible').slice(-10).reverse();
    const heroOwned = BF.inventory.owns(hero.id);
    return '<section class="shop-hero rar-mythic"><div class="sh-art">' + BF.ui.itemPreview(hero, { size: 220, onAvatar: true }) + '</div><div class="sh-info"><span class="eyebrow" style="color:var(--r-mythic)">Mythic spotlight</span><h2 class="sh-title">' + esc(hero.name) + '</h2><p class="muted">' + esc(hero.desc) + '</p>' +
      '<div class="sh-buy">' + (heroOwned ? BF.ui.ownedTag() + '<button class="btn btn-primary" data-act="equip" data-item="' + hero.id + '">Equip</button>' : BF.ui.coins(hero.price, { cls: 'lg', size: 22 }) + '<button class="btn btn-primary btn-lg" data-act="buy-item" data-item="' + hero.id + '">' + BF.icon('bag', 17) + 'Buy</button>') + '<button class="btn btn-ghost" data-act="item-detail" data-item="' + hero.id + '">Preview</button></div>' +
      '<p class="faint" style="font-size:12px">Preview shows the item on your current avatar.</p></div>' +
      '<div class="sh-limited" data-act="item-detail" data-item="' + limited.id + '" tabindex="0"><span class="pill gold">' + BF.icon('clock', 11) + 'Limited · 1 per account</span><div class="shl-art">' + BF.ui.itemPreview(limited) + '</div><b>' + esc(limited.name) + '</b>' + (BF.inventory.owns(limited.id) ? BF.ui.ownedTag() : BF.ui.coins(limited.price)) + '</div></section>' +
      '<section class="section">' + BF.ui.sectionHead('Bundles', 'gift', { href: '#/shop/bundles', label: 'All bundles' }) + '<div class="row-scroll items">' + bundles.map((i) => BF.ui.itemCard(i)).join('') + '</div></section>' +
      '<section class="section">' + BF.ui.sectionHead('Legendary & Mythic', 'crown') + '<div class="row-scroll items">' + sortItems(topRare, 'rarity').map((i) => BF.ui.itemCard(i)).join('') + '</div></section>' +
      '<section class="section">' + BF.ui.sectionHead('Great deals under 150', 'wallet') + '<div class="row-scroll items">' + cheap.map((i) => BF.ui.itemCard(i)).join('') + '</div></section>' +
      '<section class="section">' + BF.ui.sectionHead('New arrivals', 'sparkle') + '<div class="row-scroll items">' + newest.map((i) => BF.ui.itemCard(i)).join('') + '</div></section>' +
      '<section class="section">' + BF.ui.sectionHead('Everything in the shop', 'bag') + '<div id="shop-results">' + shopGrid('featured') + '</div></section>';
  }

  BF.pages.register('shop', {
    title: 'Avatar Shop',
    nav: 'shop',
    keepScrollOnParams: false,
    watch: ['inventory', 'avatar', 'wallet'],
    loading: () => '<div class="skel" style="height:220px;border-radius:16px;margin-bottom:18px"></div>' + BF.ui.skeletonCards(10),
    render(params) {
      const tab = params.tab && SHOP_TABS.some((t) => t[0] === params.tab) ? params.tab : 'featured';
      const subs = tab === 'featured' || tab === 'bundles' ? [] : Object.entries(BF.ITEM_CATS).filter(([, c]) => c.group === tab);
      if (shop.sub !== 'all' && !subs.some(([k]) => k === shop.sub)) shop.sub = 'all';
      const toolbar = '<div class="toolbar"><div class="search-box inline"><input class="input" id="shop-q" type="search" placeholder="Search items or creators" value="' + esc(shop.q) + '" autocomplete="off">' + BF.icon('search', 16) + '</div>' +
        '<label class="mini-select"><span>Sort</span><select class="select" id="shop-sort">' + SHOP_SORTS.map((s) => '<option value="' + s[0] + '"' + (shop.sort === s[0] ? ' selected' : '') + '>' + s[1] + '</option>').join('') + '</select></label>' +
        '<label class="mini-select"><span>Rarity</span><select class="select" id="shop-rarity"><option value="all">All rarities</option>' + BF.RARITY_ORDER.map((r) => '<option value="' + r + '"' + (shop.rarity === r ? ' selected' : '') + '>' + BF.RARITY[r].label + '</option>').join('') + '</select></label>' +
        '<label class="check-row"><span class="switch"><input type="checkbox" id="shop-hide"' + (shop.hideOwned ? ' checked' : '') + '><span></span></span>Hide owned</label></div>' +
        (subs.length ? '<div class="chips" style="margin-bottom:14px"><button class="chip' + (shop.sub === 'all' ? ' on' : '') + '" data-sub="all">All</button>' + subs.map(([k, c]) => '<button class="chip' + (shop.sub === k ? ' on' : '') + '" data-sub="' + k + '">' + esc(c.label) + '</button>').join('') + '</div>' : '');
      return '<div class="page-head"><div><h1 class="page-title">Avatar Shop</h1><p class="page-sub">' + BF.ITEM_LIST.filter((i) => !i.notForSale && i.cat !== 'tool').length + ' items from ' + new Set(BF.ITEM_LIST.map((i) => i.creator)).size + ' creators. Buy with ForgeCoins, wear instantly.</p></div>' +
        '<a class="balance-chip" href="#/wallet"><span class="faint">Balance</span>' + BF.ui.coins(BF.store.state.wallet.balance, { size: 17 }) + '</a></div>' +
        BF.ui.tabs(SHOP_TABS.map((t) => ({ id: t[0], label: t[1], icon: t[2], href: '#/shop' + (t[0] === 'featured' ? '' : '/' + t[0]) })), tab) +
        (tab === 'featured' ? featuredTab().replace('<div id="shop-results">', toolbar + '<div id="shop-results">') : toolbar + '<div id="shop-results">' + shopGrid(tab) + '</div>');
    },
    mount(root, params) {
      const tab = params.tab && SHOP_TABS.some((t) => t[0] === params.tab) ? params.tab : 'featured';
      const refresh = () => { const r = root.querySelector('#shop-results'); if (r) r.innerHTML = shopGrid(tab); };
      const q = root.querySelector('#shop-q');
      if (q) q.addEventListener('input', U.debounce(() => { shop.q = q.value; refresh(); }, 140));
      const bind = (id, key, prop) => { const el = root.querySelector('#' + id); if (el) el.addEventListener('change', () => { shop[key] = el[prop || 'value']; refresh(); }); };
      bind('shop-sort', 'sort');
      bind('shop-rarity', 'rarity');
      bind('shop-hide', 'hideOwned', 'checked');
      root.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => { shop.sub = b.dataset.sub; root.querySelectorAll('[data-sub]').forEach((x) => x.classList.toggle('on', x === b)); refresh(); }));
    },
  });

  // -------------------------------------------------------------- inventory

  const INV_TABS = [
    ['all', 'All', 'box'], ['avatar', 'Avatar', 'user'], ['clothing', 'Clothing', 'shirt'], ['accessories', 'Accessories', 'hat'],
    ['emotes', 'Emotes', 'emote'], ['passes', 'Game Passes', 'ticket'], ['pets', 'Pets', 'paw'], ['tools', 'Tools', 'wrench'], ['collectibles', 'Collectibles', 'gem'],
  ];
  const inv = { q: '', sort: 'recent', rarity: 'all', favOnly: false, equippedOnly: false };

  function invFiltered(tab) {
    let list = BF.inventory.entries();
    if (tab === 'avatar') list = list.filter((e) => e.group === 'avatar' || e.group === 'animations');
    else if (tab !== 'all') list = list.filter((e) => e.group === tab);
    if (inv.rarity !== 'all') list = list.filter((e) => e.rarity === inv.rarity);
    if (inv.favOnly) list = list.filter((e) => e.fav);
    if (inv.equippedOnly) list = list.filter((e) => e.equipped);
    const q = inv.q.trim().toLowerCase();
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q));
    const r = (e) => BF.RARITY[e.rarity].rank;
    const cmp = { recent: (a, b) => b.at - a.at, name: (a, b) => a.name.localeCompare(b.name), rarity: (a, b) => r(b) - r(a) || b.value - a.value, value: (a, b) => b.value - a.value, qty: (a, b) => b.qty - a.qty }[inv.sort];
    return list.sort(cmp);
  }

  function entryCard(e) {
    if (e.kind === 'item') return BF.ui.itemCard(e.item, { inventory: true, qty: e.qty, fav: e.fav });
    if (e.kind === 'pass') {
      return '<article class="icard rar-' + e.rarity + '" data-href="#/game/' + e.pass.gameId + '/store"><div class="icard-thumb pass-thumb"><img src="' + BF.thumbs.url(e.game) + '" alt=""><span class="pass-emblem">' + BF.icon(e.pass.icon || 'ticket', 30) + '</span>' + BF.ui.rarityTag(e.rarity) + '</div><div class="icard-body"><div class="icard-name">' + esc(e.name) + '</div><div class="icard-creator">Game pass · ' + esc(e.game ? e.game.name : '') + '</div><div class="icard-foot"><span class="pill success">Active</span><button class="btn btn-xs btn-play" data-act="play" data-game="' + e.pass.gameId + '">Play</button></div></div></article>';
    }
    if (e.kind === 'gamepet') {
      return '<article class="icard rar-' + e.rarity + '" data-href="#/game/pet-world"><div class="icard-thumb">' + BF.petArt(e.pet, 110) + BF.ui.rarityTag(e.rarity) + '</div><div class="icard-body"><div class="icard-name">' + esc(e.name) + '</div><div class="icard-creator">Pet World · power ' + U.fmt(e.pet.power) + '</div><div class="icard-foot"><span class="pill">x' + e.qty + '</span>' + (e.equipped ? '<span class="pill success">Following you</span>' : '<span class="faint" style="font-size:12px">In your pet book</span>') + '</div></div></article>';
    }
    return '';
  }

  function invResults(tab) {
    const list = invFiltered(tab);
    if (!list.length) {
      const hint = { passes: ['ticket', 'No game passes yet', 'Buy passes from any game’s Store tab.', '#/game/block-battlegrounds/store', 'Browse passes'], pets: ['paw', 'No pets yet', 'Shoulder pets are sold in the shop, and eggs hatch in Pet World.', '#/game/pet-world', 'Visit Pet World'], tools: ['wrench', 'No tools yet', 'Tools are sold in game stores and change how those games play.', '#/game/mega-miners/store', 'Mega Miners store'], collectibles: ['gem', 'No collectibles yet', 'Collectibles are found in games and in the Featured shop.', '#/game/treasure-islands', 'Go treasure hunting'] }[tab] || ['box', 'Nothing here', 'Try another filter or visit the Avatar Shop.', '#/shop', 'Open the shop'];
      return BF.ui.empty({ icon: hint[0], title: hint[1], text: hint[2], action: { label: hint[4], href: hint[3] } });
    }
    return '<div class="grid-cards items">' + list.map(entryCard).join('') + '</div>';
  }

  BF.pages.register('inventory', {
    title: 'Inventory',
    nav: 'inventory',
    watch: ['inventory', 'avatar', 'passes'],
    render(params) {
      const tab = params.tab && INV_TABS.some((t) => t[0] === params.tab) ? params.tab : 'all';
      const all = BF.inventory.entries();
      const count = (t) => (t === 'all' ? all.length : t === 'avatar' ? all.filter((e) => e.group === 'avatar' || e.group === 'animations').length : all.filter((e) => e.group === t).length);
      const equipped = Object.values(BF.store.state.avatar.equipped).filter(Boolean).length;
      return '<div class="page-head"><div><h1 class="page-title">Inventory</h1><p class="page-sub">Everything you own across BlockForge.</p></div><a class="btn btn-primary" href="#/avatar">' + BF.icon('shirt', 15) + 'Edit avatar</a></div>' +
        '<div class="stat-strip"><div><span class="faint">Items</span><b class="num">' + U.fmt(all.reduce((a, e) => a + e.qty, 0)) + '</b></div><div><span class="faint">Collection value</span>' + BF.ui.coins(BF.inventory.collectionValue(), { size: 16 }) + '</div><div><span class="faint">Equipped</span><b class="num">' + equipped + '</b></div><div><span class="faint">Game passes</span><b class="num">' + count('passes') + '</b></div><div><span class="faint">Rarest</span><b>' + (all.length ? BF.RARITY[all.slice().sort((a, b) => BF.RARITY[b.rarity].rank - BF.RARITY[a.rarity].rank)[0].rarity].label : '—') + '</b></div></div>' +
        BF.ui.tabs(INV_TABS.map((t) => ({ id: t[0], label: t[1], icon: t[2], href: '#/inventory' + (t[0] === 'all' ? '' : '/' + t[0]), count: count(t[0]) })), tab) +
        '<div class="toolbar"><div class="search-box inline"><input class="input" id="inv-q" type="search" placeholder="Search your items" value="' + esc(inv.q) + '" autocomplete="off">' + BF.icon('search', 16) + '</div>' +
        '<label class="mini-select"><span>Sort</span><select class="select" id="inv-sort">' + [['recent', 'Recently acquired'], ['name', 'Name A–Z'], ['rarity', 'Rarity'], ['value', 'Value'], ['qty', 'Quantity']].map((s) => '<option value="' + s[0] + '"' + (inv.sort === s[0] ? ' selected' : '') + '>' + s[1] + '</option>').join('') + '</select></label>' +
        '<label class="mini-select"><span>Rarity</span><select class="select" id="inv-rarity"><option value="all">All</option>' + BF.RARITY_ORDER.map((r) => '<option value="' + r + '"' + (inv.rarity === r ? ' selected' : '') + '>' + BF.RARITY[r].label + '</option>').join('') + '</select></label>' +
        '<label class="check-row"><span class="switch"><input type="checkbox" id="inv-eq"' + (inv.equippedOnly ? ' checked' : '') + '><span></span></span>Equipped</label>' +
        '<label class="check-row"><span class="switch"><input type="checkbox" id="inv-fav"' + (inv.favOnly ? ' checked' : '') + '><span></span></span>Favorites</label></div>' +
        '<div id="inv-results">' + invResults(tab) + '</div>';
    },
    mount(root, params) {
      const tab = params.tab && INV_TABS.some((t) => t[0] === params.tab) ? params.tab : 'all';
      const refresh = () => { root.querySelector('#inv-results').innerHTML = invResults(tab); };
      const q = root.querySelector('#inv-q');
      q.addEventListener('input', U.debounce(() => { inv.q = q.value; refresh(); }, 120));
      root.querySelector('#inv-sort').addEventListener('change', (e) => { inv.sort = e.target.value; refresh(); });
      root.querySelector('#inv-rarity').addEventListener('change', (e) => { inv.rarity = e.target.value; refresh(); });
      root.querySelector('#inv-eq').addEventListener('change', (e) => { inv.equippedOnly = e.target.checked; refresh(); });
      root.querySelector('#inv-fav').addEventListener('change', (e) => { inv.favOnly = e.target.checked; refresh(); });
    },
  });

  // ----------------------------------------------------------------- avatar

  const EDIT_CATS = ['head', 'face', 'hair', 'shirt', 'pants', 'jacket', 'shoes', 'hat', 'back', 'neck', 'shoulder', 'accessory', 'emote', 'animation', 'skin'];
  let stageEmote = null;

  BF.pages.register('avatar', {
    title: 'Avatar',
    nav: 'avatar',
    keepScrollOnParams: true,
    watch: ['avatar', 'inventory'],
    render(params) {
      const s = BF.store.state;
      const cat = EDIT_CATS.includes(params.slot) ? params.slot : 'hat';
      const eq = s.avatar.equipped;
      const wearing = BF.AVATAR_SLOTS.filter((k) => eq[k]).map((k) => BF.ITEMS[eq[k]]).filter(Boolean);
      let grid = '';
      if (cat === 'skin') {
        grid = '<p class="muted" style="margin-bottom:12px">Pick a skin tone for your block body.</p><div class="swatches">' + BF.SKIN_TONES.map((c) => '<button class="swatch' + (s.avatar.skin === c ? ' on' : '') + '" style="--c:' + c + '" data-skin="' + c + '" aria-label="Skin tone ' + c + '"></button>').join('') + '</div>';
      } else {
        const items = BF.ITEM_LIST.filter((i) => i.cat === cat);
        const owned = items.filter((i) => BF.inventory.owns(i.id));
        const notOwned = items.filter((i) => !BF.inventory.owns(i.id) && !i.notForSale);
        const optional = !BF.REQUIRED_SLOTS[cat] && cat !== 'emote';
        grid = '<div class="edit-grid">' + (optional ? '<button class="edit-tile none' + (!eq[cat] ? ' on' : '') + '" data-clear="' + cat + '"><span class="et-art">' + BF.icon('block', 30) + '</span><span class="et-name">None</span></button>' : '') +
          owned.map((i) => '<button class="edit-tile rar-' + i.rarity + (eq[BF.ITEM_CATS[i.cat].slot] === i.id ? ' on' : '') + '" data-wear="' + i.id + '"><span class="et-art">' + BF.ui.itemPreview(i, { size: 90 }) + '</span><span class="et-name">' + esc(i.name) + '</span>' + (eq[BF.ITEM_CATS[i.cat].slot] === i.id ? '<span class="et-check">' + BF.icon('check', 12) + '</span>' : '') + '</button>').join('') + '</div>' +
          (notOwned.length ? '<div class="section" style="margin-top:22px"><div class="section-head"><h3 class="section-title" style="font-size:14.5px">' + BF.icon('bag', 16) + 'More ' + esc(BF.ITEM_CATS[cat].label.toLowerCase()) + ' items in the shop</h3><a class="section-link" href="#/shop/' + BF.ITEM_CATS[cat].group + '">Open shop' + BF.icon('chevronRight', 14) + '</a></div><div class="edit-grid">' +
            notOwned.map((i) => '<button class="edit-tile locked rar-' + i.rarity + '" data-act="item-detail" data-item="' + i.id + '"><span class="et-art">' + BF.ui.itemPreview(i, { size: 90 }) + '</span><span class="et-name">' + esc(i.name) + '</span><span class="et-price">' + BF.ui.coins(i.price, { size: 12 }) + '</span></button>').join('') + '</div></div>' : '');
      }
      const emoteItem = BF.ITEMS[eq.emote];
      return '<div class="page-head"><div><h1 class="page-title">Avatar</h1><p class="page-sub">Mix and match everything you own. Changes save automatically and show up in every game.</p></div></div>' +
        '<div class="avatar-editor"><div class="ae-stage-col"><div class="ae-stage" id="avatar-stage">' + BF.avatar.render(s.avatar, { size: 250, emote: stageEmote }) + '</div>' +
        '<div class="ae-stage-actions"><button class="btn btn-sm btn-outline" data-stage-emote' + (emoteItem ? '' : ' disabled') + '>' + BF.icon('emote', 15) + (emoteItem ? 'Play ' + esc(emoteItem.name) : 'No emote') + '</button><button class="btn btn-sm btn-outline" data-randomize>' + BF.icon('refresh', 15) + 'Randomize</button><button class="btn btn-sm btn-ghost" data-reset-look>' + BF.icon('x', 15) + 'Reset</button></div>' +
        '<div class="panel tight ae-wearing"><div class="eyebrow" style="padding:4px 4px 8px">Currently wearing</div>' + wearing.map((i) => '<div class="wear-row"><span class="rarity-dot rar-' + i.rarity + '"></span><span class="wr-cat faint">' + esc(BF.ITEM_CATS[i.cat].label) + '</span><button class="wr-name" data-act="item-detail" data-item="' + i.id + '">' + esc(i.name) + '</button>' + (!BF.REQUIRED_SLOTS[BF.ITEM_CATS[i.cat].slot] && i.cat !== 'emote' ? '<button class="icon-btn sm" data-clear="' + BF.ITEM_CATS[i.cat].slot + '" aria-label="Remove ' + esc(i.name) + '" data-tip="Remove">' + BF.icon('x', 13) + '</button>' : '') + '</div>').join('') + '</div></div>' +
        '<div class="ae-picker"><div class="chips ae-cats">' + EDIT_CATS.map((c) => '<a class="chip' + (c === cat ? ' on' : '') + '" href="#/avatar/' + c + '">' + (c === 'skin' ? 'Skin tone' : esc(BF.ITEM_CATS[c].label)) + (c !== 'skin' ? '<span class="count">' + BF.ITEM_LIST.filter((i) => i.cat === c && BF.inventory.owns(i.id)).length + '</span>' : '') + '</a>').join('') + '</div>' + grid + '</div></div>';
    },
    mount(root) {
      stageEmote = null;
      root.querySelectorAll('[data-wear]').forEach((b) => b.addEventListener('click', () => {
        const item = BF.ITEMS[b.dataset.wear];
        const slot = BF.ITEM_CATS[item.cat].slot;
        const s = BF.store.state;
        if (s.avatar.equipped[slot] === item.id && !BF.REQUIRED_SLOTS[slot] && item.cat !== 'emote') BF.avatar.unequip(slot);
        else {
          BF.avatar.equip(item.id);
          if (item.cat === 'emote') stageEmote = item.look.anim;
        }
        BF.sfx.play('tab');
      }));
      root.querySelectorAll('[data-clear]').forEach((b) => b.addEventListener('click', () => { BF.avatar.unequip(b.dataset.clear); BF.sfx.play('tab'); }));
      root.querySelectorAll('[data-skin]').forEach((b) => b.addEventListener('click', () => { BF.avatar.setSkin(b.dataset.skin); BF.sfx.play('tab'); }));
      const emoteBtn = root.querySelector('[data-stage-emote]');
      if (emoteBtn) emoteBtn.addEventListener('click', () => {
        const item = BF.ITEMS[BF.store.state.avatar.equipped.emote];
        if (!item) return;
        const stage = root.querySelector('#avatar-stage');
        stage.innerHTML = BF.avatar.render(BF.store.state.avatar, { size: 250, emote: item.look.anim });
        BF.sfx.play('pickup');
      });
      root.querySelector('[data-randomize]').addEventListener('click', () => { BF.avatar.randomize(); BF.ui.toast({ title: 'Outfit randomized from your items', kind: 'info', icon: 'refresh' }); });
      root.querySelector('[data-reset-look]').addEventListener('click', async () => {
        const ok = await BF.ui.confirm({ title: 'Reset your look?', message: 'This puts your starter outfit back on. You keep every item you own.', confirmLabel: 'Reset look' });
        if (ok) BF.avatar.resetLook();
      });
    },
  });
})((window.BF = window.BF || {}));
