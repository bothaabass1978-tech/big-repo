/**
 * BlockForge — Wallet (balance + ledger), Quests, Achievements and Leaderboards.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const esc = U.esc;

  const CAT_LABEL = { daily: 'Daily reward', game: 'Game reward', quest: 'Quest', achievement: 'Achievement', level: 'Level up', purchase: 'Avatar Shop', pass: 'Game pass', product: 'Game store', sale: 'Item sale', creator: 'Creator earnings', ads: 'Advertising', forgecore: 'FORGECORE', debug: 'Developer', gift: 'Gift', earn: 'Earned' };
  const CAT_ICON = { daily: 'gift', game: 'gamepad', quest: 'target', achievement: 'medal', level: 'star', purchase: 'bag', pass: 'ticket', product: 'bag', sale: 'refresh', creator: 'anvil', ads: 'megaphone', forgecore: 'terminal', debug: 'bug', gift: 'sparkle', earn: 'plus' };
  let txFilter = 'all';
  let txCat = 'all';
  let txLimit = 60;

  function txRows() {
    let list = BF.economy.history(txFilter);
    if (txCat !== 'all') list = list.filter((t) => t.cat === txCat);
    const shown = list.slice(0, txLimit);
    if (!list.length) return BF.ui.empty({ icon: 'wallet', title: 'No transactions match', text: 'Try another filter.' });
    return '<div class="table-wrap"><table class="table tx-table"><thead><tr><th>Amount</th><th>Description</th><th>Type</th><th>Date</th><th class="r">Balance</th></tr></thead><tbody>' +
      shown.map((t) => '<tr class="' + (t.cat === 'forgecore' ? 'tx-core' : '') + '"><td class="tx-amt ' + (t.amount >= 0 ? 'delta-pos' : 'delta-neg') + '"><span class="num">' + (t.amount >= 0 ? '+' : '−') + U.fmt(Math.abs(t.amount)) + '</span> <span class="faint" style="font-size:11px">ForgeCoins</span></td><td>' + esc(t.desc) + '</td><td><span class="pill">' + BF.icon(CAT_ICON[t.cat] || 'wallet', 11) + esc(CAT_LABEL[t.cat] || t.cat) + '</span></td><td class="faint num">' + U.fmtDateTime(t.ts) + '</td><td class="r num">' + U.fmt(t.balance) + '</td></tr>').join('') +
      '</tbody></table></div>' + (list.length > txLimit ? '<div style="text-align:center;margin-top:12px"><button class="btn btn-outline btn-sm" data-more-tx>Show more (' + (list.length - txLimit) + ' older)</button></div>' : '');
  }

  BF.pages.register('wallet', {
    title: 'Wallet',
    nav: 'wallet',
    watch: ['wallet', 'transactions', 'daily', 'quests'],
    render() {
      const s = BF.store.state;
      const w = s.wallet;
      const d = BF.daily.status();
      const claimable = BF.quests.claimable();
      const txs = s.transactions;
      const since = BF.clock.now() - 7 * 86400000;
      const week = txs.filter((t) => t.ts >= since);
      const earned7 = week.filter((t) => t.amount > 0 && t.cat !== 'forgecore' && t.cat !== 'debug').reduce((a, t) => a + t.amount, 0);
      const spent7 = week.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0);
      const cats = Array.from(new Set(txs.map((t) => t.cat)));
      const pendingCreator = s.created.reduce((a, g) => a + Math.floor(g.pending || 0), 0);
      const earn = [
        ['gift', 'Daily reward', d.canClaim ? 'Day ' + d.nextDay + ' ready: +' + U.fmt(d.nextAmount) : 'Claimed today', d.canClaim ? '<button class="btn btn-xs btn-gold" data-act="open-daily">Claim</button>' : '<span class="pill success">Done</span>'],
        ['target', 'Quests', claimable ? claimable + ' ready to claim' : 'Daily and weekly challenges', '<a class="btn btn-xs btn-outline" href="#/quests">' + (claimable ? 'Claim' : 'View') + '</a>'],
        ['gamepad', 'Play games', 'Wins, rounds and in-game finds pay out', '<a class="btn btn-xs btn-outline" href="#/discover">Play</a>'],
        ['medal', 'Achievements', 'One-time bonuses for milestones', '<a class="btn btn-xs btn-outline" href="#/achievements">View</a>'],
        ['star', 'Level ups', 'Every level pays 50 + 10 × level', '<span class="faint" style="font-size:12px">Next: +' + U.fmt(BF.levelReward(s.player.level + 1)) + '</span>'],
        ['anvil', 'Creator earnings', pendingCreator ? U.fmt(pendingCreator) + ' waiting to collect' : 'Publish games with passes', '<a class="btn btn-xs btn-outline" href="#/create">' + (pendingCreator ? 'Collect' : 'Create') + '</a>'],
      ];
      return '<div class="page-head"><div><h1 class="page-title">Wallet</h1><p class="page-sub">ForgeCoins are fictional and exist only in this demo.</p></div></div>' +
        '<section class="wallet-hero"><div class="wh-main"><div class="eyebrow">Current balance</div><div class="wh-balance">' + BF.coinIcon(46) + '<span class="num">' + U.fmt(w.balance) + '</span></div><div class="faint">ForgeCoins</div></div>' +
        '<div class="wh-stats"><div><span class="faint">Earned (7 days)</span><b class="delta-pos num">+' + U.fmt(earned7) + '</b></div><div><span class="faint">Spent (7 days)</span><b class="delta-neg num">−' + U.fmt(spent7) + '</b></div><div><span class="faint">Lifetime earned</span><b class="num">' + U.fmt(w.lifetimeEarned) + '</b></div><div><span class="faint">Lifetime spent</span><b class="num">' + U.fmt(w.lifetimeSpent) + '</b></div><div><span class="faint">Highest balance</span><b class="num">' + U.fmt(w.highestBalance || w.balance) + '</b></div></div></section>' +
        '<div class="about-grid" style="margin-top:18px"><div class="panel"><h3 class="panel-title">' + BF.icon('plus', 17) + 'Ways to earn</h3><div class="earn-list">' + earn.map((e) => '<div class="earn-row"><span class="er-icon">' + BF.icon(e[0], 17) + '</span><div class="row-main"><div class="row-title">' + e[1] + '</div><div class="row-sub">' + esc(e[2]) + '</div></div>' + e[3] + '</div>').join('') + '</div></div>' +
        '<div class="panel"><h3 class="panel-title">' + BF.icon('bag', 17) + 'Ways to spend</h3><div class="spend-grid">' +
        [['bag', 'Avatar items', '#/shop'], ['ticket', 'Game passes', '#/games/passes'], ['paw', 'Pets', '#/shop/accessories'], ['wrench', 'Game tools', '#/game/mega-miners/store'], ['emote', 'Emotes', '#/shop/emotes'], ['gift', 'Bundles', '#/shop/bundles'], ['run', 'Animations', '#/shop/animations'], ['gem', 'Collectibles', '#/shop']].map((x) => '<a class="spend-tile" href="' + x[2] + '">' + BF.icon(x[0], 20) + '<span>' + x[1] + '</span></a>').join('') + '</div></div></div>' +
        '<section class="section"><div class="section-head"><h2 class="section-title">' + BF.icon('history', 18) + 'Transaction history</h2><div class="tx-filters"><div class="seg" id="tx-seg">' + [['all', 'All'], ['in', 'Earned'], ['out', 'Spent']].map((x) => '<button class="' + (txFilter === x[0] ? 'on' : '') + '" data-tx="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
        '<select class="select" id="tx-cat" style="width:auto"><option value="all">All types</option>' + cats.map((c) => '<option value="' + c + '"' + (txCat === c ? ' selected' : '') + '>' + esc(CAT_LABEL[c] || c) + '</option>').join('') + '</select></div></div><div id="tx-list">' + txRows() + '</div></section>';
    },
    mount(root) {
      const refresh = () => { root.querySelector('#tx-list').innerHTML = txRows(); };
      root.querySelectorAll('[data-tx]').forEach((b) => b.addEventListener('click', () => { txFilter = b.dataset.tx; root.querySelectorAll('[data-tx]').forEach((x) => x.classList.toggle('on', x === b)); refresh(); }));
      root.querySelector('#tx-cat').addEventListener('change', (e) => { txCat = e.target.value; refresh(); });
      root.addEventListener('click', (e) => { if (e.target.closest('[data-more-tx]')) { txLimit += 100; refresh(); } });
    },
  });

  // ------------------------------------------------------------------ quests

  function resetIn(scope) {
    const now = new Date(BF.clock.now());
    let end;
    if (scope === 'daily') end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    else { const day = (now.getDay() + 6) % 7; end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (7 - day)); }
    const sec = (end - now) / 1000;
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h >= 24 ? Math.floor(h / 24) + 'd ' + (h % 24) + 'h' : h + 'h ' + m + 'm';
  }

  function questCard(q) {
    const { def, inst, scope } = q;
    const game = def.game ? BF.catalog.get(def.game) : null;
    return '<div class="quest-card' + (inst.done ? ' done' : '') + (inst.claimed ? ' claimed' : '') + '"><div class="qc-top"><span class="qc-icon">' + BF.icon(scope === 'daily' ? 'target' : 'calendar', 18) + '</span><div class="row-main"><div class="row-title">' + esc(def.title) + '</div><div class="row-sub">' + (game ? '<a class="link" href="#/game/' + game.id + '">' + esc(game.name) + '</a> · ' : '') + '+' + U.fmt(def.xp) + ' XP</div></div>' + BF.ui.coins(def.reward) + '</div>' +
      '<div class="qc-bar">' + BF.ui.bar(inst.progress, def.target, inst.done ? 'success' : '') + '<span class="num faint">' + (def.unit === 'sec' ? U.fmtDuration(Math.min(inst.progress, def.target)) + ' / ' + U.fmtDuration(def.target) : U.fmt(Math.min(inst.progress, def.target)) + ' / ' + U.fmt(def.target)) + '</span></div>' +
      '<div class="qc-foot">' + (inst.claimed ? '<span class="pill success">' + BF.icon('check', 11) + 'Claimed</span>' : inst.done ? '<button class="btn btn-sm btn-gold" data-act="claim-quest" data-scope="' + scope + '" data-id="' + def.id + '">' + BF.icon('gift', 14) + 'Claim reward</button>' : game ? '<button class="btn btn-sm btn-play" data-act="play" data-game="' + game.id + '">Play ' + esc(game.name) + '</button>' : '<span class="faint" style="font-size:12px">In progress</span>') + '</div></div>';
  }

  BF.pages.register('quests', {
    title: 'Quests',
    nav: 'quests',
    watch: ['quests'],
    render() {
      const daily = BF.quests.active('daily');
      const weekly = BF.quests.active('weekly');
      const claimable = BF.quests.claimable();
      const s = BF.store.state;
      return '<div class="page-head"><div><h1 class="page-title">Quests</h1><p class="page-sub">' + U.plural(s.player.stats.questsCompleted, 'quest') + ' completed so far. Progress tracks automatically as you play.</p></div>' + (claimable ? '<button class="btn btn-gold" data-act="claim-all-quests">' + BF.icon('gift', 15) + 'Claim all (' + claimable + ')</button>' : '') + '</div>' +
        '<section class="section"><div class="section-head"><h2 class="section-title">' + BF.icon('target', 18) + 'Daily Challenges</h2><span class="pill">' + BF.icon('clock', 11) + 'Resets in ' + resetIn('daily') + '</span></div><div class="quest-grid">' + daily.map(questCard).join('') + '</div></section>' +
        '<section class="section"><div class="section-head"><h2 class="section-title">' + BF.icon('calendar', 18) + 'Weekly Quests</h2><span class="pill">' + BF.icon('clock', 11) + 'Resets in ' + resetIn('weekly') + '</span></div><div class="quest-grid">' + weekly.map(questCard).join('') + '</div></section>' +
        '<p class="faint" style="margin-top:22px;font-size:12.5px">' + BF.QUESTS.length + ' quests rotate through the daily and weekly slots.</p>';
    },
  });

  // ------------------------------------------------------------ achievements

  let achFilter = 'all';

  BF.pages.register('achievements', {
    title: 'Achievements',
    nav: 'achievements',
    watch: ['achievements', 'player', 'secrets'],
    render() {
      const list = BF.achievements.list();
      const unlocked = list.filter((a) => a.unlocked).length;
      const shown = list.filter((a) => achFilter === 'all' || (achFilter === 'unlocked' ? a.unlocked : !a.unlocked));
      const pct = unlocked / list.length;
      const earnedCoins = list.filter((a) => a.unlocked).reduce((x, a) => x + a.def.reward.coins, 0);
      return '<div class="page-head"><div><h1 class="page-title">Achievements</h1><p class="page-sub">Milestones unlock automatically and pay out ForgeCoins and XP.</p></div></div>' +
        '<section class="ach-summary"><div class="ring" style="--p:' + (pct * 100).toFixed(1) + '"><span class="num">' + Math.round(pct * 100) + '%</span></div><div><div class="ach-count num"><b>' + unlocked + '</b> / ' + list.length + ' unlocked</div><div class="faint">' + U.fmt(earnedCoins) + ' ForgeCoins earned from achievements</div></div>' +
        '<div class="seg" style="margin-left:auto">' + [['all', 'All'], ['unlocked', 'Unlocked'], ['locked', 'Locked']].map((x) => '<button class="' + (achFilter === x[0] ? 'on' : '') + '" data-af="' + x[0] + '">' + x[1] + '</button>').join('') + '</div></section>' +
        '<div class="ach-grid">' + shown.map((a) => '<div class="ach-card' + (a.unlocked ? ' on' : '') + (a.hidden ? ' secret' : '') + (a.def.secret && a.unlocked ? ' core' : '') + '"><span class="ac-icon">' + (a.hidden ? BF.icon('lock', 22) : BF.ui.achIcon(a.def.icon, 22)) + '</span><div class="row-main"><div class="row-title">' + esc(a.name) + '</div><div class="ac-desc">' + esc(a.desc) + '</div>' +
          (a.unlocked ? '<div class="ac-date faint">Unlocked ' + U.fmtDate(a.at) + '</div>' : a.hidden ? '' : '<div class="ac-prog">' + BF.ui.bar(a.current, a.target, 'thin') + '<span class="faint num">' + U.fmt(a.current) + '/' + U.fmt(a.target) + (a.def.unit ? ' ' + a.def.unit : '') + '</span></div>') + '</div>' +
          '<div class="ac-reward">' + (a.def.reward.coins ? BF.ui.coins(a.def.reward.coins, { size: 13 }) : '') + (a.def.reward.xp ? '<span class="faint num" style="font-size:12px">+' + U.fmt(a.def.reward.xp) + ' XP</span>' : '') + '</div></div>').join('') + '</div>';
    },
    mount(root) {
      root.querySelectorAll('[data-af]').forEach((b) => b.addEventListener('click', () => { achFilter = b.dataset.af; BF.router.refresh(); }));
    },
  });

  // ------------------------------------------------------------ leaderboards

  /** Shared leaderboard table. */
  BF.pages.lbTable = function (rows, you, def) {
    if (!rows.length) return BF.ui.empty({ icon: 'podium', title: 'No entries yet' });
    const fmt = (v) => (def ? BF.leaderboards.format(def, v) : U.fmt(v));
    const medal = (r) => (r <= 3 ? '<span class="medal m' + r + '">' + r + '</span>' : '<span class="rank num">' + r + '</span>');
    const row = (r) => '<tr class="' + (r.me ? 'me' : '') + '"><td>' + medal(r.rank) + '</td><td>' + (r.me ? '<a class="lb-player" href="#/profile">' + BF.ui.avatarChip(BF.store.state.avatar, { size: 'sm' }) + '<span><b>' + esc(r.name) + '</b> <span class="pill accent">You</span></span></a>' : '<a class="lb-player" href="#/user/' + r.id + '">' + BF.ui.avatarChip(r.bot.avatar, { size: 'sm' }) + '<span><b>' + esc(r.name) + '</b><span class="faint"> @' + esc(r.username) + '</span></span></a>') + '</td><td class="r num"><b>' + fmt(r.value) + '</b></td></tr>';
    let body = rows.map(row).join('');
    if (you && you.rank > rows.length) body += '<tr class="gap"><td colspan="3">…</td></tr>' + row(you);
    return '<div class="table-wrap"><table class="table lb-table"><thead><tr><th style="width:70px">Rank</th><th>Player</th><th class="r">' + esc(def ? def.label : 'Value') + '</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
      (you ? '<p class="faint" style="margin-top:10px;font-size:12.5px">You are ranked <b>#' + U.fmt(you.rank) + '</b>.</p>' : '<p class="faint" style="margin-top:10px;font-size:12.5px">Play to get on this board.</p>');
  };

  let lbGlobal = 'level';
  let lbGame = 'block-battlegrounds';
  let lbGameStat = null;

  BF.pages.register('leaderboards', {
    title: 'Leaderboards',
    nav: 'leaderboards',
    render(params) {
      const scope = params.scope === 'games' ? 'games' : 'global';
      const tabs = BF.ui.tabs([{ id: 'global', label: 'Global', href: '#/leaderboards', icon: 'globe' }, { id: 'games', label: 'Games', href: '#/leaderboards/games', icon: 'gamepad' }], scope);
      let body;
      if (scope === 'global') {
        const def = BF.leaderboards.GLOBAL.find((d) => d.key === lbGlobal);
        const lb = BF.leaderboards.global(lbGlobal);
        body = '<div class="chips" style="margin-bottom:14px">' + BF.leaderboards.GLOBAL.map((d) => '<button class="chip' + (d.key === lbGlobal ? ' on' : '') + '" data-lbg="' + d.key + '">' + (d.icon === 'coin' ? BF.coinIcon(14) : BF.icon(d.icon, 14)) + esc(d.label) + '</button>').join('') + '</div>' + BF.pages.lbTable(lb.rows, lb.you, { label: def.label, format: 'num' });
      } else {
        const games = BF.catalog.all().filter((g) => (g.leaderboard || []).length);
        if (!games.some((g) => g.id === lbGame)) lbGame = games[0].id;
        const g = BF.catalog.get(lbGame);
        const stat = lbGameStat && g.leaderboard.some((d) => d.stat === lbGameStat) ? lbGameStat : g.leaderboard[0].stat;
        const lb = BF.leaderboards.game(g.id, stat);
        body = '<div class="toolbar"><label class="mini-select"><span>Game</span><select class="select" id="lb-game">' + games.map((x) => '<option value="' + x.id + '"' + (x.id === g.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></label><div class="chips">' + g.leaderboard.map((d) => '<button class="chip' + (d.stat === stat ? ' on' : '') + '" data-lbs="' + d.stat + '">' + esc(d.label) + '</button>').join('') + '</div></div>' + BF.pages.lbTable(lb.rows, lb.you, lb.def);
      }
      return '<div class="page-head"><div><h1 class="page-title">Leaderboards</h1><p class="page-sub">' + U.fmt(BF.bots.list.length + 1) + ' ranked players. Bot scores move as they play.</p></div></div>' + tabs + body;
    },
    mount(root) {
      root.querySelectorAll('[data-lbg]').forEach((b) => b.addEventListener('click', () => { lbGlobal = b.dataset.lbg; BF.router.refresh(); }));
      root.querySelectorAll('[data-lbs]').forEach((b) => b.addEventListener('click', () => { lbGameStat = b.dataset.lbs; BF.router.refresh(); }));
      const sel = root.querySelector('#lb-game');
      if (sel) sel.addEventListener('change', () => { lbGame = sel.value; lbGameStat = null; BF.router.refresh(); });
    },
  });
})((window.BF = window.BF || {}));
