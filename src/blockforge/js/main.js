/**
 * BlockForge — application boot, account lifecycle and route table.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  let routerStarted = false;
  let globalHooks = false;
  let saveInterval = null;

  const ROUTES = [
    ['/home', 'home'],
    ['/discover', 'discover'],
    ['/games/:tab?', 'games'],
    ['/game/:id/:tab?', 'game'],
    ['/shop/:tab?', 'shop'],
    ['/inventory/:tab?', 'inventory'],
    ['/avatar/:slot?', 'avatar'],
    ['/friends/:tab?', 'friends'],
    ['/messages/:with?', 'messages'],
    ['/notifications', 'notifications'],
    ['/create', 'create'],
    ['/create/new', 'createnew'],
    ['/create/:id/:tab?', 'creategame'],
    ['/profile/:tab?', 'profile'],
    ['/user/:id/:tab?', 'user'],
    ['/settings/:tab?', 'settings'],
    ['/wallet', 'wallet'],
    ['/quests', 'quests'],
    ['/achievements', 'achievements'],
    ['/leaderboards/:scope?', 'leaderboards'],
    ['/search', 'search'],
    ['/creator/:name', 'creatorpage'],
  ];

  /** Launch a game (optionally a specific server). */
  BF.play = function (gameId, serverId) {
    if (!BF.runtime) return;
    const s = BF.store.state;
    if (!serverId && s && !s.settings.gameplay.autoJoinBest && BF.catalog.get(gameId) && !BF.runtime.active) {
      BF.router.go('#/game/' + gameId + '/servers');
      BF.ui.toast({ title: 'Pick a server to join', text: 'Play is set to open the server list (Settings > Gameplay).', kind: 'info', icon: 'server' });
      return;
    }
    BF.runtime.launch(gameId, serverId);
  };

  function installGlobalHooks() {
    if (globalHooks) return;
    globalHooks = true;

    // background pop-ups: filtered by the player's settings and throttled so a burst
    // (followers, sales, updates) becomes one "N more" toast instead of a wall of them
    const POP = { gapMs: 6000 };
    let lastPop = 0, held = 0, heldTimer = null;
    const flushHeld = () => {
      heldTimer = null;
      if (!held) return;
      const n = held;
      held = 0;
      lastPop = Date.now();
      BF.ui.toast({ title: U.plural(n, 'more notification'), text: 'Open the bell to see them, or turn pop-ups down in Settings.', kind: 'info', icon: 'bell', action: { label: 'Open', onClick: () => BF.router.go('#/notifications') } });
    };
    BF.bus.on('notify:new', (n) => {
      const s = BF.store.state;
      if (!s || n.silent) return;
      const inGame = !!(BF.runtime && BF.runtime.active);
      if (!BF.notify.allowsPopup(n, inGame)) return;
      if (s.settings.notifications.sound) BF.sfx.play('notify');
      if (n.type !== 'invite' && Date.now() - lastPop < POP.gapMs) {
        held++;
        if (!heldTimer) heldTimer = setTimeout(flushHeld, POP.gapMs);
        return;
      }
      lastPop = Date.now();
      BF.ui.toast({
        title: n.title,
        text: n.body,
        kind: 'info',
        icon: n.icon,
        action: n.route ? { label: n.type === 'invite' ? 'Join' : n.type === 'friend' && n.action ? 'Review' : 'Open', onClick: () => { BF.notify.markRead(n.id); if (n.type === 'invite' && n.action) BF.play(n.action.gameId, n.action.serverId); else BF.router.go(n.route); } } : null,
      });
    });

    BF.bus.on('achievement:unlocked', ({ def }) => {
      if (!BF.notify.allowsBanner()) return;
      BF.sfx.play(def.secret ? 'secret' : 'achievement');
      BF.ui.banner({ kind: '', kicker: 'Achievement unlocked', title: def.name, desc: def.desc + (def.reward.coins ? ' · +' + U.fmt(def.reward.coins) + ' ForgeCoins' : ''), icon: def.icon });
    });
    BF.bus.on('badge:earned', ({ def }) => {
      if (!BF.notify.allowsBanner()) return;
      BF.ui.banner({ kind: '', kicker: 'Badge earned', title: def.name, desc: def.desc, icon: def.icon || 'medal', duration: 3600 });
    });
    BF.bus.on('levelup', ({ level, reward, silent }) => {
      if (silent || !BF.notify.allowsBanner()) return;
      BF.sfx.play('levelup');
      BF.ui.banner({ kind: 'level', kicker: 'Level up', title: 'You reached level ' + level + '!', desc: '+' + U.fmt(reward) + ' ForgeCoins level reward', icon: 'star' });
    });

    const EVAL_KEYS = ['player', 'wallet', 'inventory', 'avatar', 'passes', 'social', 'daily', 'badges', 'progress', 'secrets', 'created', 'quests'];
    BF.bus.on('store:change', (keys) => {
      if (EVAL_KEYS.some((k) => keys.has(k))) BF.achievements.scheduleEvaluate();
    });

    // Unlock audio on the first interaction.
    const unlock = () => { BF.sfx.unlock(); window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);

    const flush = () => BF.store.backgroundSave('unload');
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

    try {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => BF.applyAppearance());
    } catch (e) { /* old browsers */ }
  }

  BF.app = {
    /** Entry point. */
    boot() {
      BF.ui.init();
      installGlobalHooks();
      ROUTES.forEach((r) => BF.router.add(r[0], r[1]));
      try {
        BF.accounts.ensureDefault();
      } catch (e) {
        console.error(e);
      }
      document.documentElement.dataset.bfTheme = 'dark';
      const id = BF.accounts.currentId();
      if (id) BF.app.enter(id, { resume: true });
      else BF.loginScreen.render();
    },

    /** Sign in to an account and show the platform. */
    enter(accountId, opts) {
      opts = opts || {};
      BF.accounts.signIn(accountId);
      BF.store.load(accountId);
      BF.applyAppearance();
      BF.world.init();
      BF.quests.ensure();
      BF.shell.mount();
      const s = BF.store.state;
      const today = BF.clock.today();
      const firstVisitToday = s.meta.lastSeenDay !== today;
      BF.store.update('meta', (st) => { st.meta.lastSeenDay = today; });
      if (!routerStarted) { routerStarted = true; BF.router.start(); } else BF.router.handle();
      BF.achievements.evaluate();
      clearInterval(saveInterval);
      saveInterval = setInterval(() => BF.store.backgroundSave('interval'), 30000);
      if (opts.welcome) {
        BF.ui.toast({ title: 'Welcome to BlockForge, ' + s.player.displayName + '!', text: 'You start with 1,500 ForgeCoins. Claim your daily reward, then jump into a game.', kind: 'success', icon: 'sparkle', duration: 6000 });
      } else if (!opts.resume) {
        BF.ui.toast({ title: 'Welcome back, ' + s.player.displayName, kind: 'success', icon: 'user' });
      }
      if (firstVisitToday && BF.daily.status().canClaim) setTimeout(() => { if (BF.store.state && !document.querySelector('.modal-scrim')) BF.actions.run('open-daily'); }, opts.welcome ? 1400 : 700);
    },

    /** Re-initialise systems after an import or account reset. */
    restart() {
      BF.ui.closeAllModals();
      if (BF.runtime && BF.runtime.active) BF.runtime.leave(true);
      BF.clock.offsetDays = BF.store.state.debug.dayOffset || 0;
      BF.applyAppearance();
      BF.world.init();
      BF.quests.ensure();
      BF.shell.mount();
      BF.router.go('#/home');
      BF.router.handle();
      BF.achievements.evaluate();
    },

    signOut() {
      if (BF.runtime && BF.runtime.active) BF.runtime.leave(true);
      BF.ui.closeAllModals();
      BF.world.stop();
      clearInterval(saveInterval);
      BF.accounts.signOut();
      document.documentElement.dataset.bfTheme = 'dark';
      document.documentElement.dataset.bfAccent = 'ember';
      BF.loginScreen.render();
    },

    /** Wipe every account and save on this device. */
    resetAll() {
      if (BF.runtime && BF.runtime.active) BF.runtime.leave(true);
      BF.ui.closeAllModals();
      BF.world.stop();
      clearInterval(saveInterval);
      BF.store.state = null;
      BF.store.accountId = null;
      BF.storage.clearAll();
      BF.clock.offsetDays = 0;
      BF.accounts.ensureDefault();
      document.documentElement.dataset.bfTheme = 'dark';
      document.documentElement.dataset.bfAccent = 'ember';
      BF.loginScreen.render();
      BF.ui.toast({ title: 'All demo data was reset', text: 'BlockForge is back to a fresh install.', kind: 'info' });
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', BF.app.boot);
  else BF.app.boot();
})((window.BF = window.BF || {}));
