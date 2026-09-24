/**
 * BlockForge — sign-in screen and personalised Home page.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const esc = U.esc;

  // ------------------------------------------------------------------ login

  BF.loginScreen = {
    render() {
      const app = document.getElementById('app');
      app.className = 'login';
      const accounts = BF.accounts.list().slice().sort((a, b) => (b.lastLogin || 0) - (a.lastLogin || 0));
      const showcase = ['block-battlegrounds', 'skyline-racers', 'pet-world', 'sky-obby', 'mystery-mansion', 'zombie-outbreak', 'treasure-islands', 'city-life', 'elemental-clash'];
      app.innerHTML =
        '<section class="login-brand">' +
        '<div class="login-tiles" aria-hidden="true">' + showcase.map((id, i) => '<img src="' + BF.thumbs.url(id) + '" alt="" style="--i:' + i + '">').join('') + '</div>' +
        '<div class="login-brand-inner"><div class="login-logo">' + BF.logo(54) + '</div>' +
        '<h1 class="login-headline">Build it. Play it.<br>Forge your own worlds.</h1>' +
        '<p class="login-copy">Twenty original games, live servers full of players, an avatar shop with over a hundred items, and a creator studio of your own. Everything runs on this device.</p>' +
        '<ul class="login-facts"><li>' + BF.icon('gamepad', 16) + '20 playable games</li><li>' + BF.icon('users', 16) + '420 simulated players</li><li>' + BF.coinIcon(16) + 'Fictional ForgeCoins</li></ul></div></section>' +
        '<section class="login-panel"><div class="login-card">' +
        '<h2 class="login-title">Sign in</h2><p class="muted" style="margin-bottom:16px">Choose a local account on this device.</p>' +
        '<div class="acct-list">' + (accounts.length ? accounts.map((a) => '<button class="acct" data-acct="' + a.id + '"><span class="avatar-chip lg">' + BF.avatar.render(a.avatar || { skin: BF.STARTER_SKIN, equipped: BF.STARTER_EQUIP }, { crop: 'bust', still: true, size: 80 }) + '</span><span class="acct-main"><span class="acct-name">' + esc(a.displayName) + '</span><span class="acct-sub">@' + esc(a.username) + ' · Level ' + (a.level || 1) + (a.lastLogin ? ' · last played ' + U.timeAgo(a.lastLogin) : '') + '</span></span><span class="btn btn-primary btn-sm">Continue' + BF.icon('arrowRight', 14) + '</span></button>').join('') : '<p class="faint">No accounts yet.</p>') + '</div>' +
        '<details class="acct-create"' + (accounts.length ? '' : ' open') + '><summary>' + BF.icon('userPlus', 16) + 'Create a new account</summary>' +
        '<form id="create-acct" class="acct-form" novalidate><div class="field"><label for="ca-user">Username</label><input class="input" id="ca-user" maxlength="20" placeholder="e.g. PixelPilot" autocomplete="off"><span class="hint">3-20 letters, numbers or underscores.</span></div>' +
        '<div class="field"><label for="ca-display">Display name</label><input class="input" id="ca-display" maxlength="24" placeholder="Shown on your profile"></div><div class="error" id="ca-err" role="alert"></div>' +
        '<button class="btn btn-primary btn-block" type="submit">' + BF.icon('sparkle', 15) + 'Create account and play</button></form></details>' +
        '<p class="login-note">' + BF.icon('shield', 14) + 'BlockForge is a fictional demo. There are no passwords, real accounts or real money. ForgeCoins have no real-world value.</p>' +
        '</div></section>';
      app.querySelectorAll('[data-acct]').forEach((b) => b.addEventListener('click', () => { BF.sfx.unlock(); BF.app.enter(b.dataset.acct); }));
      const form = app.querySelector('#create-acct');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        BF.sfx.unlock();
        const r = BF.accounts.create(form.querySelector('#ca-user').value, form.querySelector('#ca-display').value);
        if (!r.ok) { form.querySelector('#ca-err').textContent = r.error; form.querySelector('#ca-user').classList.add('invalid'); return; }
        BF.app.enter(r.account.id, { welcome: true });
      });
    },
  };

  // ------------------------------------------------------------------- home

  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }

  function questMini(q) {
    const { def, inst, scope } = q;
    const pct = Math.min(1, inst.progress / def.target);
    return '<div class="quest-mini' + (inst.done ? ' done' : '') + (inst.claimed ? ' claimed' : '') + '"><div class="qm-top"><span class="qm-title">' + esc(def.title) + '</span>' + BF.ui.coins(def.reward, { size: 13 }) + '</div>' +
      '<div class="qm-bar">' + BF.ui.bar(inst.progress, def.target, inst.done ? 'success thin' : 'thin') + '<span class="num">' + U.fmt(Math.min(inst.progress, def.target)) + '/' + U.fmt(def.target) + '</span>' +
      (inst.done && !inst.claimed ? '<button class="btn btn-xs btn-gold" data-act="claim-quest" data-scope="' + scope + '" data-id="' + def.id + '">Claim</button>' : inst.claimed ? '<span class="pill success">' + BF.icon('check', 11) + 'Done</span>' : '') + '</div>' + (pct >= 1 ? '' : '') + '</div>';
  }

  let featTimer = null;

  BF.pages.register('home', {
    title: 'Home',
    nav: 'home',
    watch: ['player', 'quests', 'achievements', 'daily', 'recent', 'created'],
    render() {
      const s = BF.store.state;
      const p = s.player;
      const all = BF.catalog.all();
      const need = BF.xpForLevel(p.level);
      const daily = BF.daily.status();
      const recent = s.recent.map((r) => ({ g: BF.catalog.get(r.gameId), ts: r.ts })).filter((x) => x.g);
      const popular = BF.catalog.sort(all, 'popular');
      const trending = BF.catalog.sort(all, 'trending');
      const newest = BF.catalog.sort(all, 'new');
      const featured = all.filter((g) => g.featured);
      const rec = BF.catalog.recommended();
      const friendsIn = BF.friends.list().map((b) => ({ b, st: BF.world.botStatus(b.id) })).filter((x) => x.st.state === 'ingame');
      const quests = BF.quests.active('daily');
      const claimable = BF.quests.claimable();
      const achs = BF.achievements.list();
      const unlocked = achs.filter((a) => a.unlocked).sort((a, b) => b.at - a.at);
      const next = achs.filter((a) => !a.unlocked && !a.hidden).sort((a, b) => b.current / b.target - a.current / a.target).slice(0, 3);

      let h = '<section class="home-hero">' +
        '<div class="hh-avatar"><a href="#/avatar" aria-label="Edit avatar">' + BF.avatar.render(s.avatar, { size: 150 }) + '</a></div>' +
        '<div class="hh-main"><div class="eyebrow">' + greeting() + '</div><h1 class="page-title">' + esc(p.displayName) + '</h1>' +
        '<div class="hh-level"><span class="lvl-badge">' + BF.icon('star', 13) + 'Level ' + p.level + '</span><div class="hh-xp">' + BF.ui.bar(p.xp, need, 'xp') + '<span class="faint num">' + U.fmt(p.xp) + ' / ' + U.fmt(need) + ' XP</span></div></div>' +
        '<div class="hh-stats"><a href="#/wallet" class="hh-stat"><span class="faint">ForgeCoins</span>' + BF.ui.coins(s.wallet.balance, { size: 17 }) + '</a><a href="#/friends" class="hh-stat"><span class="faint">Friends</span><b class="num">' + s.social.friends.length + '</b></a><a href="#/achievements" class="hh-stat"><span class="faint">Achievements</span><b class="num">' + unlocked.length + '/' + achs.length + '</b></a><a href="#/quests" class="hh-stat"><span class="faint">Quests ready</span><b class="num">' + claimable + '</b></a></div></div>' +
        '<div class="hh-daily' + (daily.canClaim ? ' ready' : '') + '"><div class="eyebrow">Daily reward</div><div class="hh-daily-amt">' + BF.coinIcon(30) + '<span class="num">' + U.fmt(daily.canClaim ? daily.nextAmount : BF.DAILY_REWARDS[(daily.currentIndex + 1) % 7]) + '</span></div><div class="faint" style="font-size:12.5px">' + (daily.canClaim ? 'Day ' + daily.nextDay + ' of your streak is ready' : 'Claimed today · ' + daily.streak + '-day streak') + '</div>' +
        '<button class="btn ' + (daily.canClaim ? 'btn-gold' : 'btn-outline') + ' btn-sm" data-act="open-daily">' + BF.icon('gift', 15) + (daily.canClaim ? 'Claim reward' : 'View streak') + '</button></div></section>';

      if (recent.length) {
        h += '<section class="section">' + BF.ui.sectionHead('Continue Playing', 'play', { href: '#/games/recent', label: 'See all' }) + '<div class="row-scroll">' + recent.slice(0, 8).map((x) => {
          const pr = s.progress[x.g.id] || {};
          return '<article class="continue-card" data-href="#/game/' + x.g.id + '" data-ctx="game" data-game="' + x.g.id + '"><div class="cc-thumb"><img src="' + BF.thumbs.url(x.g) + '" alt="" loading="lazy"><button class="btn btn-play btn-sm cc-play" data-act="play" data-game="' + x.g.id + '">' + BF.icon('play', 13) + 'Play</button></div><div class="cc-body"><div class="gcard-title">' + esc(x.g.name) + '</div><div class="cc-meta"><span>' + U.timeAgo(x.ts, BF.clock.now()) + '</span><span>' + U.plural(pr.plays || 0, 'play') + '</span><span>' + U.plural(pr.wins || 0, 'win') + '</span></div></div></article>';
        }).join('') + '</div></section>';
      }

      h += '<section class="section home-split"><div class="panel"><div class="section-head" style="margin-bottom:10px"><h2 class="section-title">' + BF.icon('target', 18) + 'Daily Challenges</h2><a class="section-link" href="#/quests">All quests' + BF.icon('chevronRight', 14) + '</a></div>' +
        '<div class="quest-list">' + quests.map(questMini).join('') + '</div>' + (claimable ? '<button class="btn btn-gold btn-sm btn-block" style="margin-top:10px" data-act="claim-all-quests">' + BF.icon('gift', 14) + 'Claim ' + claimable + ' reward' + (claimable > 1 ? 's' : '') + '</button>' : '') + '</div>' +
        '<div class="panel"><div class="section-head" style="margin-bottom:10px"><h2 class="section-title">' + BF.icon('medal', 18) + 'Your Achievements</h2><a class="section-link" href="#/achievements">' + unlocked.length + '/' + achs.length + BF.icon('chevronRight', 14) + '</a></div>' +
        '<div class="ach-mini-list">' + unlocked.slice(0, 3).map((a) => '<div class="ach-mini on"><span class="am-icon">' + BF.ui.achIcon(a.def.icon, 18) + '</span><span><b>' + esc(a.name) + '</b><span class="faint">' + esc(a.desc) + '</span></span><span class="faint num" style="font-size:11.5px">' + U.timeAgo(a.at, BF.clock.now()) + '</span></div>').join('') +
        next.map((a) => '<div class="ach-mini"><span class="am-icon">' + BF.ui.achIcon(a.def.icon, 18) + '</span><span><b>' + esc(a.name) + '</b><span class="faint">' + esc(a.desc) + '</span>' + BF.ui.bar(a.current, a.target, 'thin') + '</span><span class="faint num" style="font-size:11.5px">' + U.fmt(a.current) + '/' + U.fmt(a.target) + '</span></div>').join('') + '</div></div></section>';

      if (featured.length) h += '<section class="section">' + BF.ui.sectionHead('Featured Experiences', 'sparkle') + '<div class="feature-carousel" id="feature-carousel">' + featured.map((g, i) => '<div class="fc-slide' + (i === 0 ? ' on' : '') + '">' + BF.ui.featureCard(g) + '</div>').join('') + '<div class="fc-dots">' + featured.map((g, i) => '<button class="fc-dot' + (i === 0 ? ' on' : '') + '" data-slide="' + i + '" aria-label="Show ' + esc(g.name) + '"></button>').join('') + '</div></div></section>';

      h += '<section class="section">' + BF.ui.sectionHead('Recommended For You', 'star', { href: '#/discover', label: 'Discover more' }) + '<div class="row-scroll">' + rec.slice(0, 10).map((g) => BF.ui.gameCard(g)).join('') + '</div></section>';

      h += '<section class="section">' + BF.ui.sectionHead('Friends Are Playing', 'users', { href: '#/friends', label: 'All friends' }) +
        (friendsIn.length ? '<div class="friends-playing">' + friendsIn.slice(0, 8).map((x) => {
          const g = BF.catalog.get(x.st.gameId);
          return '<div class="fp-card" data-ctx="user" data-bot="' + x.b.id + '"><a href="#/user/' + x.b.id + '">' + BF.ui.avatarChip(x.b.avatar, { status: 'ingame', size: 'lg' }) + '</a><div class="fp-main"><a class="row-title" href="#/user/' + x.b.id + '">' + esc(x.b.displayName) + '</a><div class="row-sub">Playing <a href="#/game/' + g.id + '" class="link">' + esc(g.name) + '</a></div></div><button class="btn btn-sm btn-play" data-act="join-friend" data-bot="' + x.b.id + '">Join</button></div>';
        }).join('') + '</div>' : BF.ui.empty({ icon: 'users', title: 'None of your friends are in a game', text: 'When friends join a server they show up here so you can hop in with them.', action: { label: 'Find friends', href: '#/friends/find' } })) + '</section>';

      h += '<section class="section">' + BF.ui.sectionHead('Popular Right Now', 'fire', { href: '#/discover?cat=Popular', label: 'See all' }) + '<div class="grid-cards">' + popular.slice(0, 10).map((g) => BF.ui.gameCard(g)).join('') + '</div></section>';
      h += '<section class="section">' + BF.ui.sectionHead('Trending', 'bolt', { href: '#/discover?cat=Trending', label: 'See all' }) + '<div class="row-scroll">' + trending.slice(0, 10).map((g) => BF.ui.gameCard(g)).join('') + '</div></section>';
      h += '<section class="section">' + BF.ui.sectionHead('New Games', 'sparkle', { href: '#/discover?cat=New', label: 'See all' }) + '<div class="row-scroll">' + newest.slice(0, 10).map((g) => BF.ui.gameCard(g)).join('') + '</div></section>';
      if (recent.length) h += '<section class="section">' + BF.ui.sectionHead('Recently Played', 'history', { href: '#/games/recent', label: 'History' }) + '<div class="row-scroll">' + recent.slice(0, 10).map((x) => BF.ui.gameCard(x.g, { compact: true })).join('') + '</div></section>';
      return h;
    },
    mount(root) {
      const car = root.querySelector('#feature-carousel');
      if (!car) return;
      const slides = car.querySelectorAll('.fc-slide');
      const dots = car.querySelectorAll('.fc-dot');
      let i = 0;
      const show = (n) => {
        i = (n + slides.length) % slides.length;
        slides.forEach((s, k) => s.classList.toggle('on', k === i));
        dots.forEach((d, k) => d.classList.toggle('on', k === i));
      };
      dots.forEach((d) => d.addEventListener('click', (e) => { e.stopPropagation(); show(Number(d.dataset.slide)); }));
      clearInterval(featTimer);
      featTimer = setInterval(() => { if (!car.matches(':hover')) show(i + 1); }, 6500);
    },
    unmount() {
      clearInterval(featTimer);
    },
  });

  BF.pages.register('notfound', {
    title: 'Not found',
    render() {
      return BF.ui.empty({ icon: 'compass', title: 'That page does not exist', text: 'The link may be old, or the game may have been deleted by its creator.', action: { label: 'Back to Home', href: '#/home' } });
    },
  });
})((window.BF = window.BF || {}));
