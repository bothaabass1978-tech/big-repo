/**
 * BlockForge — player profiles: your own and every bot's.
 * Tabs: About, Creations, Inventory, Badges, Statistics.
 */
(function (BF) {
  'use strict';

  const live3d = () => !!(BF.avatar3d && BF.avatar3d.available());

  /** Profile hero: a live, draggable 3D avatar when WebGL is on, else the image. */
  function heroAvatar(av) {
    return live3d() ? '<div class="av-live ph-live" data-hero-live></div>' : BF.avatar.render(av, { size: 190 });
  }
  function mountHero(root, av) {
    const el = root.querySelector('[data-hero-live]');
    if (el) BF.avatar3d.live(el, av, { autoRotate: true });
  }

  const U = BF.util;
  const esc = U.esc;

  function badgeTile(b, clickable) {
    const color = b.color || (b.gameId ? 'var(--accent)' : 'var(--info)');
    return '<div class="badge-tile' + (b.secret ? ' secret' : '') + (clickable ? ' clickable' : '') + '"' + (clickable ? ' data-forgecore tabindex="0" role="button"' : '') + ' data-tip="' + esc(b.desc) + '"><span class="bt-icon" style="--bc:' + color + '">' + BF.icon(b.icon || 'medal', 22) + '</span><span class="bt-name">' + esc(b.name) + '</span>' + (b.gameName ? '<span class="bt-game faint">' + esc(b.gameName) + '</span>' : '<span class="bt-game faint">BlockForge</span>') + '</div>';
  }

  function selfProfile(tab) {
    const s = BF.store.state;
    const p = s.player;
    const need = BF.xpForLevel(p.level);
    const badges = BF.badges.earned();
    const achs = BF.achievements.list();
    const unlocked = achs.filter((a) => a.unlocked);
    const favGames = s.catalog.favorites.map((id) => BF.catalog.get(id)).filter(Boolean);
    const st = p.stats;
    const tabs = BF.ui.tabs([
      { id: 'about', label: 'About', href: '#/profile' },
      { id: 'creations', label: 'Creations', href: '#/profile/creations', count: s.created.length },
      { id: 'inventory', label: 'Inventory', href: '#/profile/inventory' },
      { id: 'badges', label: 'Badges', href: '#/profile/badges', count: badges.length },
      { id: 'statistics', label: 'Statistics', href: '#/profile/statistics' },
    ], tab);
    let body;
    if (tab === 'creations') {
      const list = s.created.map((ug) => BF.catalog.get(ug.id)).filter(Boolean);
      body = list.length ? '<div class="grid-cards">' + list.map((g) => BF.ui.gameCard(g)).join('') + '</div>' : BF.ui.empty({ icon: 'anvil', title: 'No creations yet', action: { label: 'Create a game', href: '#/create/new' } });
    } else if (tab === 'inventory') {
      const items = BF.inventory.entries().filter((e) => e.kind === 'item').sort((a, b) => BF.RARITY[b.rarity].rank - BF.RARITY[a.rarity].rank);
      body = '<div class="results-meta"><span class="faint">Showcase of ' + U.plural(items.length, 'item') + ' · collection value</span>' + BF.ui.coins(BF.inventory.collectionValue()) + '</div><div class="grid-cards items">' + items.slice(0, 30).map((e) => BF.ui.itemCard(e.item, { inventory: true, qty: e.qty })).join('') + '</div>';
    } else if (tab === 'badges') {
      body = badges.length ? '<div class="badge-grid">' + badges.map((b) => badgeTile(b, b.id === 'forgecore_unlocked')).join('') + '</div>' : BF.ui.empty({ icon: 'medal', title: 'No badges yet', text: 'Earn badges by playing games.' });
      body += '<section class="section">' + BF.ui.sectionHead('Achievements (' + unlocked.length + '/' + achs.length + ')', 'medal', { href: '#/achievements', label: 'All achievements' }) + '<div class="ach-mini-list grid">' + unlocked.map((a) => '<div class="ach-mini on"><span class="am-icon">' + BF.ui.achIcon(a.def.icon, 18) + '</span><span><b>' + esc(a.name) + '</b><span class="faint">' + esc(a.desc) + '</span></span></div>').join('') + '</div></section>';
    } else if (tab === 'statistics') {
      body = statsTable(p, s);
    } else {
      body = '<div class="about-grid"><div><div class="panel"><h3 class="panel-title">' + BF.icon('user', 17) + 'About</h3><p class="bio">' + esc(p.bio || 'No bio yet.') + '</p><button class="btn btn-sm btn-outline" data-edit-profile style="margin-top:12px">' + BF.icon('edit', 14) + 'Edit profile</button></div>' +
        '<div class="panel" style="margin-top:14px"><h3 class="panel-title">' + BF.icon('heart', 17) + 'Favorite games</h3>' + (favGames.length ? '<div class="mini-games">' + favGames.map((g) => '<a class="mini-game" href="#/game/' + g.id + '"><img src="' + BF.thumbs.url(g) + '" alt=""><span>' + esc(g.name) + '</span></a>').join('') + '</div>' : '<p class="faint">Favorite games from their pages.</p>') + '</div></div>' +
        '<div><div class="panel"><h3 class="panel-title">' + BF.icon('shirt', 17) + 'Currently wearing</h3><div class="wearing-grid">' + BF.AVATAR_SLOTS.filter((k) => s.avatar.equipped[k]).map((k) => BF.ITEMS[s.avatar.equipped[k]]).filter(Boolean).map((i) => '<button class="wear-chip rar-' + i.rarity + '" data-act="item-detail" data-item="' + i.id + '"><span class="rarity-dot rar-' + i.rarity + '"></span>' + esc(i.name) + '</button>').join('') + '</div></div>' +
        '<div class="panel" style="margin-top:14px"><h3 class="panel-title">' + BF.icon('medal', 17) + 'Badges</h3><div class="badge-grid small">' + (badges.slice(0, 6).map((b) => badgeTile(b, b.id === 'forgecore_unlocked')).join('') || '<p class="faint">No badges yet.</p>') + '</div></div></div></div>';
    }
    return '<section class="profile-hero"><div class="ph-avatar">' + heroAvatar(s.avatar) + '</div><div class="ph-main"><div class="ph-names"><h1 class="page-title">' + esc(p.displayName) + '</h1><span class="faint">@' + esc(p.username) + '</span><span class="lvl-badge">' + BF.icon('star', 13) + 'Level ' + p.level + '</span>' + (s.secrets.forgecore.unlocked ? '<span class="pill" style="background:rgba(255,95,15,.14);color:#ff7a2e" data-forgecore role="button" tabindex="0" data-tip="Forgecore">' + BF.icon('terminal', 12) + 'Forgecore</span>' : '') + '</div>' +
      '<div class="ph-xp">' + BF.ui.bar(p.xp, need, 'xp') + '<span class="faint num">' + U.fmt(p.xp) + ' / ' + U.fmt(need) + ' XP to level ' + (p.level + 1) + '</span></div>' +
      '<div class="ph-stats"><a href="#/friends"><b class="num">' + s.social.friends.length + '</b><span>Friends</span></a><a href="#/friends/followers"><b class="num">' + s.social.followers.length + '</b><span>Followers</span></a><a href="#/friends/following"><b class="num">' + s.social.following.length + '</b><span>Following</span></a><a href="#/wallet"><b class="num">' + U.fmt(s.wallet.balance) + '</b><span>ForgeCoins</span></a><a href="#/profile/creations"><b class="num">' + s.created.length + '</b><span>Games created</span></a><a href="#/achievements"><b class="num">' + unlocked.length + '</b><span>Achievements</span></a></div>' +
      '<div class="ph-meta faint">' + BF.icon('calendar', 14) + ' Joined ' + U.fmtDate(p.joinDate) + ' · ' + U.plural(st.gamesPlayed, 'game') + ' played · ' + U.fmtDuration(st.playSeconds) + ' in game</div>' +
      '<div class="ph-actions"><a class="btn btn-primary" href="#/avatar">' + BF.icon('shirt', 15) + 'Edit avatar</a><button class="btn btn-outline" data-edit-profile>' + BF.icon('edit', 15) + 'Edit profile</button><a class="btn btn-ghost" href="#/inventory">' + BF.icon('box', 15) + 'Inventory</a></div></div></section>' + tabs + body;
  }

  function statsTable(p, s) {
    const st = p.stats;
    const winRate = st.wins + st.losses ? Math.round((st.wins / (st.wins + st.losses)) * 100) + '%' : '—';
    const rows = [
      ['Level', p.level], ['Games played', U.fmt(st.gamesPlayed)], ['Different games played', st.distinctGames.length + ' / ' + BF.GAME_REGISTRY.length], ['Wins', U.fmt(st.wins)], ['Losses', U.fmt(st.losses)], ['Win rate', winRate],
      ['Eliminations', U.fmt(st.kills)], ['Time in game', U.fmtDuration(st.playSeconds)], ['ForgeCoins balance', U.fmt(s.wallet.balance)], ['ForgeCoins earned (lifetime)', U.fmt(s.wallet.lifetimeEarned)], ['ForgeCoins spent (lifetime)', U.fmt(s.wallet.lifetimeSpent)],
      ['Items bought', U.fmt(st.itemsBought)], ['Game passes bought', U.fmt(st.passesBought)], ['Quests completed', U.fmt(st.questsCompleted)], ['Achievements', Object.keys(s.achievements).length + ' / ' + BF.ACHIEVEMENTS.length], ['Badges', U.fmt(Object.keys(s.badges).length)],
      ['Treasures found', U.fmt(st.treasures)], ['Goals scored', U.fmt(st.goals)], ['Blocks mined', U.fmt(st.blocksMined)], ['Pets hatched', U.fmt(st.petsHatched)], ['Waves cleared', U.fmt(st.wavesCleared)], ['Bosses defeated', U.fmt(st.bossesDefeated)], ['Chat messages', U.fmt(st.chatSent)], ['Private messages', U.fmt(st.messagesSent)], ['Games created', U.fmt(st.gamesCreated)],
    ];
    const games = Object.entries(s.progress).map(([id, pr]) => ({ g: BF.catalog.get(id), pr })).filter((x) => x.g).sort((a, b) => (b.pr.plays || 0) - (a.pr.plays || 0));
    return '<div class="about-grid"><div class="panel"><h3 class="panel-title">' + BF.icon('podium', 17) + 'Career</h3><dl class="kv">' + rows.map((r) => '<div><dt>' + r[0] + '</dt><dd class="num">' + r[1] + '</dd></div>').join('') + '</dl></div>' +
      '<div class="panel"><h3 class="panel-title">' + BF.icon('gamepad', 17) + 'Per game</h3>' + (games.length ? '<div class="table-wrap"><table class="table"><thead><tr><th>Game</th><th class="r">Sessions</th><th class="r">Wins</th><th class="r">Best</th><th class="r">Time</th></tr></thead><tbody>' + games.map((x) => {
        const d = (x.g.leaderboard || [])[0];
        return '<tr><td><a class="link" href="#/game/' + x.g.id + '">' + esc(x.g.name) + '</a></td><td class="r">' + U.fmt(x.pr.plays || 0) + '</td><td class="r">' + U.fmt(x.pr.wins || 0) + '</td><td class="r">' + (d ? BF.leaderboards.format(d, x.pr[d.stat]) : '—') + '</td><td class="r">' + U.fmtDuration(x.pr.timeSec || 0) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="faint">No games played yet.</p>') + '</div></div>';
  }

  function botProfile(bot, tab) {
    const st = BF.bots.stats(bot);
    const roles = BF.creatorEconomy ? BF.creatorEconomy.rolesOf(bot.id) : [];
    const ownGames = BF.botGames ? BF.botGames.byCreator(bot.id) : [];
    const studioGames = roles.reduce((a, r) => a.concat(BF.GAME_REGISTRY.filter((g) => g.builtIn && g.creator === r.studio)), []);
    const status = BF.world.botStatus(bot.id);
    const F = BF.friends;
    const tabs = BF.ui.tabs([
      { id: 'about', label: 'About', href: '#/user/' + bot.id },
      { id: 'creations', label: 'Creations', href: '#/user/' + bot.id + '/creations', count: studioGames.length + ownGames.length || undefined },
      { id: 'inventory', label: 'Inventory', href: '#/user/' + bot.id + '/inventory' },
      { id: 'badges', label: 'Badges', href: '#/user/' + bot.id + '/badges' },
      { id: 'statistics', label: 'Statistics', href: '#/user/' + bot.id + '/statistics' },
    ], tab);
    const favGames = bot.favoriteGames.map((id) => BF.catalog.get(id)).filter(Boolean);
    const wearing = BF.AVATAR_SLOTS.map((k) => bot.avatar.equipped[k]).filter(Boolean).map((id) => BF.ITEMS[id]).filter(Boolean);
    const pers = BF.PERSONALITIES[bot.personality];
    const r = U.rng('bb:' + bot.id);
    const gameBadges = [];
    BF.GAME_REGISTRY.forEach((g) => g.badges.forEach((b) => { if (r() < 0.12 + st.level / 300) gameBadges.push(Object.assign({ gameName: g.name }, b)); }));
    let body;
    if (tab === 'creations' && (studioGames.length || ownGames.length)) {
      body = (roles.length ? '<div class="role-list">' + roles.map((r) => '<a class="pill ' + (r.role === 'owner' ? 'gold' : 'accent') + '" href="#/creator/' + encodeURIComponent(r.studio) + '">' + BF.icon('anvil', 12) + (r.role === 'owner' ? 'Founder of ' : 'Developer at ') + esc(r.studio) + '</a>').join('') + '</div>' : '') +
        (ownGames.length ? '<section class="section">' + BF.ui.sectionHead('Games by ' + esc(bot.displayName), 'brush') + '<div class="grid-cards">' + ownGames.map((g) => BF.ui.gameCard(g)).join('') + '</div></section>' : '') +
        (studioGames.length ? '<section class="section">' + BF.ui.sectionHead('Studio games', 'anvil') + '<div class="grid-cards">' + studioGames.map((g) => BF.ui.gameCard(g)).join('') + '</div></section>' : '');
    } else if (tab === 'creations') {
      body = bot.base.created ? '<div class="panel notice">' + BF.icon('anvil', 18) + '<div><b>' + esc(bot.displayName) + ' has ' + U.plural(bot.base.created, 'private project') + '.</b><p class="faint">Unpublished creations are only visible to their creator.</p></div></div>' : BF.ui.empty({ icon: 'anvil', title: esc(bot.displayName) + ' has no public creations' });
    } else if (tab === 'inventory') {
      body = '<p class="faint" style="margin-bottom:12px">Items ' + esc(bot.displayName) + ' is wearing right now.</p><div class="grid-cards items">' + wearing.map((i) => BF.ui.itemCard(i)).join('') + '</div>';
    } else if (tab === 'badges') {
      body = gameBadges.length ? '<div class="badge-grid">' + gameBadges.map((b) => badgeTile(b)).join('') + '</div>' : BF.ui.empty({ icon: 'medal', title: 'No badges yet' });
    } else if (tab === 'statistics') {
      body = '<div class="panel"><dl class="kv">' + [['Level', st.level], ['Games played', U.fmt(st.gamesPlayed)], ['Wins', U.fmt(st.wins)], ['ForgeCoins', U.fmt(st.coins)], ['Achievements', st.achievements + ' / ' + BF.ACHIEVEMENTS.length], ['Friends', st.friends], ['Followers', U.fmt(st.followers)], ['Following', st.following], ['Play style', pers.label], ['Skill rating', Math.round(bot.skill * 100) + ' / 100']].map((x) => '<div><dt>' + x[0] + '</dt><dd class="num">' + x[1] + '</dd></div>').join('') + '</dl></div>';
    } else {
      body = '<div class="about-grid"><div><div class="panel"><h3 class="panel-title">' + BF.icon('user', 17) + 'About</h3>' + (roles.length ? '<div class="role-list">' + roles.map((r) => '<a class="pill ' + (r.role === 'owner' ? 'gold' : 'accent') + '" href="#/creator/' + encodeURIComponent(r.studio) + '">' + BF.icon('anvil', 12) + (r.role === 'owner' ? 'Founder of ' : 'Developer at ') + esc(r.studio) + '</a>').join('') + '</div>' : '') + '<p class="bio">' + esc(bot.bio) + '</p><div class="pers-chip" style="--pc:' + pers.color + '">' + BF.icon(pers.icon, 15) + '<b>' + pers.label + '</b><span class="faint">' + esc(pers.blurb) + '</span></div></div>' +
        '<div class="panel" style="margin-top:14px"><h3 class="panel-title">' + BF.icon('heart', 17) + 'Favorite games</h3><div class="mini-games">' + favGames.map((g) => '<a class="mini-game" href="#/game/' + g.id + '"><img src="' + BF.thumbs.url(g) + '" alt=""><span>' + esc(g.name) + '</span></a>').join('') + '</div></div></div>' +
        '<div><div class="panel"><h3 class="panel-title">' + BF.icon('shirt', 17) + 'Currently wearing</h3><div class="wearing-grid">' + wearing.map((i) => '<button class="wear-chip" data-act="item-detail" data-item="' + i.id + '"><span class="rarity-dot rar-' + i.rarity + '"></span>' + esc(i.name) + '</button>').join('') + '</div></div>' +
        '<div class="panel" style="margin-top:14px"><h3 class="panel-title">' + BF.icon('medal', 17) + 'Badges</h3><div class="badge-grid small">' + (gameBadges.slice(0, 6).map((b) => badgeTile(b)).join('') || '<p class="faint">No badges yet.</p>') + '</div></div></div></div>';
    }
    let actions = '';
    if (F.isBlocked(bot.id)) actions = '<button class="btn btn-outline" data-act="unblock" data-bot="' + bot.id + '">Unblock</button>';
    else {
      if (F.isFriend(bot.id)) actions += '<span class="pill success" style="height:36px;padding:0 12px">' + BF.icon('userCheck', 14) + 'Friends</span>';
      else if (F.hasIncoming(bot.id)) actions += '<button class="btn btn-primary" data-act="accept-friend" data-bot="' + bot.id + '">' + BF.icon('userCheck', 15) + 'Accept request</button>';
      else if (F.hasOutgoing(bot.id)) actions += '<button class="btn btn-outline" data-act="cancel-request" data-bot="' + bot.id + '">Request sent · Cancel</button>';
      else actions += '<button class="btn btn-primary" data-act="add-friend" data-bot="' + bot.id + '">' + BF.icon('userPlus', 15) + 'Add friend</button>';
      actions += '<a class="btn btn-outline" href="#/messages/' + bot.id + '">' + BF.icon('chat', 15) + 'Message</a>';
      actions += F.isFollowing(bot.id) ? '<button class="btn btn-ghost" data-act="unfollow" data-bot="' + bot.id + '">Following</button>' : '<button class="btn btn-ghost" data-act="follow" data-bot="' + bot.id + '">' + BF.icon('plus', 14) + 'Follow</button>';
      if (status.state === 'ingame') actions += '<button class="btn btn-play" data-act="join-friend" data-bot="' + bot.id + '">' + BF.icon('play', 13) + 'Join game</button>';
    }
    actions += '<button class="icon-btn" data-act="user-menu" data-bot="' + bot.id + '" aria-label="More">' + BF.icon('dots', 18) + '</button>';
    return '<section class="profile-hero"><div class="ph-avatar">' + heroAvatar(bot.avatar, bot.id) + '</div><div class="ph-main"><div class="ph-names"><h1 class="page-title">' + esc(bot.displayName) + '</h1><span class="faint">@' + esc(bot.username) + '</span><span class="lvl-badge">' + BF.icon('star', 13) + 'Level ' + st.level + '</span>' + (F.followsYou(bot.id) ? '<span class="pill">Follows you</span>' : '') + '</div>' +
      '<div class="ph-status"><span class="status-dot ' + status.state + '" data-live="dot:' + bot.id + '"></span><span data-live="status:' + bot.id + '">' + BF.ui.statusText(status) + '</span></div>' +
      '<div class="ph-stats"><div><b class="num">' + st.friends + '</b><span>Friends</span></div><div><b class="num">' + U.compact(st.followers) + '</b><span>Followers</span></div><div><b class="num">' + st.following + '</b><span>Following</span></div><div><b class="num">' + U.compact(st.coins) + '</b><span>' + (roles.length || ownGames.length ? 'Net worth' : 'ForgeCoins') + '</span></div><div><b class="num">' + st.achievements + '</b><span>Achievements</span></div></div>' +
      '<div class="ph-meta faint">' + BF.icon('calendar', 14) + ' Joined ' + U.fmtDate(bot.joinDate) + ' · ' + U.plural(st.gamesPlayed, 'game') + ' played</div><div class="ph-actions">' + actions + '</div></div></section>' + tabs + body;
  }

  function editProfile() {
    const p = BF.store.state.player;
    BF.ui.modal({
      title: 'Edit profile',
      icon: 'edit',
      body: '<div class="field"><label for="ep-name">Display name</label><input class="input" id="ep-name" maxlength="24" value="' + esc(p.displayName) + '"></div><div class="field" style="margin-top:12px"><label for="ep-bio">Bio</label><textarea class="textarea" id="ep-bio" maxlength="200">' + esc(p.bio) + '</textarea><span class="hint">Up to 200 characters.</span></div><div class="error" id="ep-err"></div>',
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Save', kind: 'primary', onClick: (h) => {
          const name = h.el.querySelector('#ep-name').value.trim();
          const bio = h.el.querySelector('#ep-bio').value.trim();
          if (name.length < 1 || name.length > 24) { h.el.querySelector('#ep-err').textContent = 'Display names need 1-24 characters.'; return false; }
          BF.store.update('player', (s) => { s.player.displayName = BF.dialogue.filter(name); s.player.bio = BF.dialogue.filter(bio); });
          BF.ui.toast({ title: 'Profile updated', kind: 'success' });
          return true;
        },
      }],
    });
  }

  BF.pages.register('profile', {
    title: 'Profile',
    nav: 'profile',
    watch: ['player', 'avatar', 'badges', 'achievements', 'social', 'created', 'secrets'],
    render(params) {
      return selfProfile(params.tab || 'about');
    },
    mount(root) {
      mountHero(root, BF.store.state.avatar);
      root.querySelectorAll('[data-edit-profile]').forEach((b) => b.addEventListener('click', editProfile));
      root.querySelectorAll('[data-forgecore]').forEach((b) => {
        const open = () => { if (BF.secrets.isUnlocked() && BF.forgecore) BF.forgecore.open(); };
        b.addEventListener('click', open);
        b.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
      });
    },
  });

  BF.pages.register('user', {
    title: (p) => { const b = BF.bots.get(p.id); return b ? b.displayName : 'Player'; },
    nav: 'friends',
    watch: ['social'],
    render(params) {
      const bot = BF.bots.get(params.id);
      if (!bot) return BF.ui.empty({ icon: 'user', title: 'Player not found', action: { label: 'Find players', href: '#/friends/find' } });
      return botProfile(bot, params.tab || 'about');
    },
    mount(root, params) {
      const bot = BF.bots.get(params.id);
      if (bot) mountHero(root, bot.avatar);
    },
  });
})((window.BF = window.BF || {}));
