/**
 * BlockForge — Settings: Account, Privacy, Notifications, Appearance, Gameplay,
 * Data (save / export / import / reset) and the hidden Developer panel.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const esc = U.esc;
  let buildClicks = 0;
  let buildTimer = null;

  function toggle(id, checked, label, hint) {
    return '<label class="setting-row" for="' + id + '"><span class="sr-text"><span class="sr-label">' + esc(label) + '</span>' + (hint ? '<span class="sr-hint">' + esc(hint) + '</span>' : '') + '</span><span class="switch"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '><span></span></span></label>';
  }
  function seg(id, value, options, label, hint) {
    return '<div class="setting-row"><span class="sr-text"><span class="sr-label">' + esc(label) + '</span>' + (hint ? '<span class="sr-hint">' + esc(hint) + '</span>' : '') + '</span><div class="seg" role="group" aria-label="' + esc(label) + '" data-seg="' + id + '">' + options.map((o) => '<button type="button" class="' + (o[0] === value ? 'on' : '') + '" data-val="' + o[0] + '">' + esc(o[1]) + '</button>').join('') + '</div></div>';
  }

  /** Apply appearance settings to <html>. */
  BF.applyAppearance = function () {
    const s = BF.store.state;
    if (!s) return;
    const a = s.settings.appearance;
    const root = document.documentElement;
    let theme = a.theme;
    if (theme === 'system') {
      try { theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch (e) { theme = 'dark'; }
    }
    root.dataset.bfTheme = theme;
    root.dataset.bfAccent = a.accent;
    root.dataset.bfDensity = a.density;
    root.dataset.bfMotion = a.reduceMotion || U.prefersReducedMotion() ? 'reduced' : 'full';
    root.style.fontSize = '';
    const g = s.settings.gameplay;
    BF.sfx.setVolume(g.volume);
    BF.sfx.setEnabled(g.sfx);
  };

  const TABS = [['account', 'Account', 'user'], ['privacy', 'Privacy', 'shield'], ['notifications', 'Notifications', 'bell'], ['appearance', 'Appearance', 'palette'], ['gameplay', 'Gameplay', 'gamepad'], ['data', 'Data', 'save']];

  function accountTab(s) {
    const p = s.player;
    const accounts = BF.accounts.list();
    return '<div class="settings-card"><h3>Profile</h3>' +
      '<form id="acct-form" class="form-grid" novalidate><div class="field"><label for="set-display">Display name</label><input class="input" id="set-display" maxlength="24" value="' + esc(p.displayName) + '"></div>' +
      '<div class="field"><label for="set-username">Username</label><input class="input" id="set-username" maxlength="20" value="' + esc(p.username) + '"><span class="hint">3-20 letters, numbers or underscores.</span></div>' +
      '<div class="field" style="grid-column:1/-1"><label for="set-bio">Bio</label><textarea class="textarea" id="set-bio" maxlength="200">' + esc(p.bio) + '</textarea></div>' +
      '<div class="error" id="acct-err" style="grid-column:1/-1"></div><div style="grid-column:1/-1"><button class="btn btn-primary" type="submit">' + BF.icon('save', 15) + 'Save profile</button></div></form></div>' +
      '<div class="settings-card"><h3>Account</h3><dl class="kv"><div><dt>Member since</dt><dd>' + U.fmtDate(p.joinDate) + '</dd></div><div><dt>Account type</dt><dd>Local, fictional (no password)</dd></div><div><dt>Accounts on this device</dt><dd class="num">' + accounts.length + '</dd></div></dl>' +
      '<div class="btn-row"><button class="btn btn-outline" data-act="sign-out">' + BF.icon('logout', 15) + 'Sign out / switch account</button></div></div>' +
      '<div class="settings-card"><h3>About</h3><p class="muted">BlockForge is a fictional, self-contained gaming platform demo. All games, players, items and ForgeCoins are made up and stored only in this browser.</p>' +
      '<dl class="kv"><div><dt>Version</dt><dd>' + BF.APP_VERSION + '</dd></div><div><dt>Build</dt><dd><button class="build-btn num" id="build-btn">' + BF.BUILD + '</button></dd></div><div><dt>Games</dt><dd class="num">' + BF.GAME_REGISTRY.length + ' built in</dd></div><div><dt>Avatar items</dt><dd class="num">' + BF.ITEM_LIST.length + '</dd></div></dl>' +
      '<div class="btn-row"><button class="btn btn-ghost" data-act="show-shortcuts">' + BF.icon('keyboard', 15) + 'Keyboard shortcuts</button></div></div>';
  }

  function privacyTab(s) {
    const pv = s.settings.privacy;
    return '<div class="settings-card"><h3>Communication</h3>' +
      seg('privacy.messages', pv.messages, [['everyone', 'Everyone'], ['friends', 'Friends'], ['none', 'No one']], 'Who can message me', 'Controls unsolicited private messages from other players.') +
      seg('privacy.friendRequests', pv.friendRequests, [['everyone', 'Everyone'], ['none', 'No one']], 'Who can send friend requests') +
      toggle('privacy.invites', pv.invites, 'Allow game invites', 'Friends can invite you to their servers.') + '</div>' +
      '<div class="settings-card"><h3>Visibility</h3>' + toggle('privacy.showOnline', pv.showOnline, 'Show when I am online', 'Friends see your online and in-game status.') + toggle('privacy.inventoryPublic', pv.inventoryPublic, 'Show my inventory on my profile') + '</div>' +
      '<div class="settings-card"><h3>Blocked players</h3><p class="muted">' + U.plural(s.social.blocked.length, 'player') + ' blocked.</p><div class="btn-row"><a class="btn btn-outline" href="#/friends/blocked">Manage blocked players</a></div></div>';
  }

  function notificationsTab(s) {
    const n = s.settings.notifications;
    const labels = { friend: 'Friend requests', achievement: 'Achievements and badges', invite: 'Game invites', purchase: 'Purchases', daily: 'Daily rewards', quest: 'Quest completion', bot: 'Messages from players', update: 'Game updates and creator sales', level: 'Level ups', system: 'System announcements' };
    return '<div class="settings-card"><h3>Delivery</h3>' + toggle('notifications.popups', n.popups, 'Pop-up toasts', 'Show a small popup when something happens.') + toggle('notifications.sound', n.sound, 'Notification sound') + '</div>' +
      '<div class="settings-card"><h3>Notify me about</h3>' + Object.keys(labels).map((k) => toggle('notifications.types.' + k, n.types[k], labels[k])).join('') + '</div>';
  }

  function appearanceTab(s) {
    const a = s.settings.appearance;
    const accents = [['ember', '#ff7a2e'], ['cobalt', '#3d8bff'], ['jade', '#22c38e'], ['violet', '#9b6bff'], ['rose', '#ff4f8b']];
    return '<div class="settings-card"><h3>Theme</h3>' + seg('appearance.theme', a.theme, [['dark', 'Dark'], ['light', 'Light'], ['system', 'Match system']], 'Color theme') +
      '<div class="setting-row"><span class="sr-text"><span class="sr-label">Accent color</span></span><div class="swatches">' + accents.map((c) => '<button class="swatch' + (a.accent === c[0] ? ' on' : '') + '" style="--c:' + c[1] + '" data-accent="' + c[0] + '" aria-label="' + c[0] + '"></button>').join('') + '</div></div>' +
      seg('appearance.density', a.density, [['comfortable', 'Comfortable'], ['compact', 'Compact']], 'Density', 'Compact fits more cards on screen.') + '</div>' +
      '<div class="settings-card"><h3>Motion</h3>' + toggle('appearance.reduceMotion', a.reduceMotion, 'Reduce motion', 'Turns off page transitions, coin animations and idle avatar movement.') + '</div>';
  }

  function gameplayTab(s) {
    const g = s.settings.gameplay;
    return '<div class="settings-card"><h3>Audio</h3><div class="setting-row"><span class="sr-text"><span class="sr-label">Master volume</span><span class="sr-hint" id="vol-label">' + Math.round(g.volume * 100) + '%</span></span><input type="range" class="range" id="gameplay.volume" min="0" max="1" step="0.05" value="' + g.volume + '" style="max-width:220px"></div>' +
      toggle('gameplay.sfx', g.sfx, 'Sound effects') + '</div>' +
      '<div class="settings-card"><h3>Controls</h3>' + seg('gameplay.touchControls', g.touchControls, [['auto', 'Auto'], ['on', 'Always'], ['off', 'Never']], 'On-screen touch controls', 'Auto shows them on touch devices.') + toggle('gameplay.showFps', g.showFps, 'Show FPS counter in games') + '</div>' +
      '<div class="settings-card"><h3>Servers and chat</h3>' + seg('gameplay.botChat', g.botChat, [['quiet', 'Quiet'], ['normal', 'Normal'], ['lively', 'Lively']], 'Server chat activity', 'How often other players chat, message you and send requests.') +
      toggle('gameplay.chatFilter', g.chatFilter, 'Chat filter', 'Hides rude words in chat and messages.') + toggle('gameplay.autoJoinBest', g.autoJoinBest, 'Play joins the best server', 'Otherwise Play opens the server list.') + '</div>';
  }

  function dataTab(s) {
    const bytes = BF.storage.usage();
    return '<div class="settings-card"><h3>Saving</h3><p class="muted">Progress saves automatically to this browser after every change. Last saved <b>' + (BF.store.lastSavedAt ? U.fmtDateTime(BF.store.lastSavedAt) : 'never') + '</b>.</p>' +
      toggle('data.autosave', s.settings.data.autosave, 'Automatic save', 'Recommended. Turn off only to experiment; use Save Now to keep changes.') +
      '<dl class="kv" style="margin-top:12px"><div><dt>Storage</dt><dd>' + (BF.storage.isPersistent() ? 'Browser storage (persistent)' : 'Memory only (this browser blocks storage)') + '</dd></div><div><dt>Space used</dt><dd class="num">' + (bytes / 1024).toFixed(1) + ' KB</dd></div><div><dt>Saves this session</dt><dd class="num">' + s.meta.saveCount + '</dd></div></dl>' +
      '<div class="btn-row"><button class="btn btn-primary" data-act="save-now">' + BF.icon('save', 15) + 'Save now</button></div></div>' +
      '<div class="settings-card"><h3>Export and import</h3><p class="muted">Export your save as JSON to back it up or move it to another browser. Import replaces this account’s progress.</p>' +
      '<div class="btn-row"><button class="btn btn-outline" data-export>' + BF.icon('download', 15) + 'Export save</button><button class="btn btn-outline" data-import>' + BF.icon('upload', 15) + 'Import save</button></div></div>' +
      '<div class="settings-card danger-zone"><h3>Danger zone</h3>' +
      '<div class="setting-row"><span class="sr-text"><span class="sr-label">Reset account</span><span class="sr-hint">Return ' + esc(s.player.username) + ' to its starting state. Other accounts are untouched.</span></span><button class="btn btn-danger" data-reset-account>Reset account</button></div>' +
      '<div class="setting-row"><span class="sr-text"><span class="sr-label">Reset all demo data</span><span class="sr-hint">Delete every account and save on this device and start over with the default Forge Player.</span></span><button class="btn btn-danger" data-reset-all>Reset everything</button></div></div>';
  }

  function devTab(s) {
    const games = BF.catalog.all(true);
    return '<div class="settings-card dev"><h3>' + BF.icon('bug', 17) + 'Developer tools</h3><p class="muted">Local development only. These tools edit this device’s fictional demo data directly.</p>' +
      '<div class="dev-grid">' +
      '<div class="dev-box"><b>ForgeCoins</b><div class="form-row"><input class="input" id="dev-coins" type="number" min="1" value="1000"><button class="btn btn-sm btn-primary" data-dev="add-coins">Add</button><button class="btn btn-sm btn-outline" data-dev="remove-coins">Remove</button></div></div>' +
      '<div class="dev-box"><b>Experience</b><div class="form-row"><input class="input" id="dev-xp" type="number" min="1" value="2500"><button class="btn btn-sm btn-primary" data-dev="add-xp">Add XP</button></div><div class="form-row"><input class="input" id="dev-level" type="number" min="1" max="999" value="' + s.player.level + '"><button class="btn btn-sm btn-outline" data-dev="set-level">Set level</button></div></div>' +
      '<div class="dev-box"><b>Unlocks</b><div class="btn-row"><button class="btn btn-sm btn-outline" data-dev="unlock-items">Unlock all items</button><button class="btn btn-sm btn-outline" data-dev="unlock-passes">Unlock all game passes</button><button class="btn btn-sm btn-outline" data-dev="complete-quests">Complete all quests</button></div></div>' +
      '<div class="dev-box"><b>Bots</b><div class="form-row"><input class="input" id="dev-bots" type="number" min="1" max="200" value="20" style="max-width:90px"><select class="select" id="dev-bot-game"><option value="">Any game</option>' + games.map((g) => '<option value="' + g.id + '">' + esc(g.name) + '</option>').join('') + '</select><button class="btn btn-sm btn-primary" data-dev="spawn-bots">Spawn</button></div><div class="btn-row"><button class="btn btn-sm btn-outline" data-dev="clear-bots">Clear bots</button><button class="btn btn-sm btn-outline" data-dev="bot-request">Friend request</button><button class="btn btn-sm btn-outline" data-dev="bot-dm">Bot message</button><button class="btn btn-sm btn-outline" data-dev="bot-invite">Game invite</button></div><div class="faint" style="font-size:12px">' + U.fmt(BF.world.totalOnline()) + ' players online right now.</div></div>' +
      '<div class="dev-box"><b>Time</b><div class="btn-row"><button class="btn btn-sm btn-outline" data-dev="next-day">Simulate next day</button><button class="btn btn-sm btn-ghost" data-dev="reset-day">Back to real date</button></div><div class="faint" style="font-size:12px">Today is ' + BF.clock.today() + (BF.clock.offsetDays ? ' (+' + BF.clock.offsetDays + ' days)' : '') + '.</div></div>' +
      '<div class="dev-box"><b>Reset</b><div class="btn-row"><button class="btn btn-sm btn-danger" data-dev="reset-economy">Reset economy</button><button class="btn btn-sm btn-danger" data-dev="reset-inventory">Reset inventory</button><button class="btn btn-sm btn-danger" data-dev="reset-achievements">Reset achievements</button><button class="btn btn-sm btn-danger" data-dev="reset-everything">Reset everything</button></div></div>' +
      '</div><div class="btn-row" style="margin-top:14px"><button class="btn btn-ghost btn-sm" data-dev="hide">Hide developer tools</button></div></div>';
  }

  const DEV = {
    'add-coins': (root) => {
      const n = U.parseAmount(root.querySelector('#dev-coins').value);
      if (!(n > 0)) return BF.ui.toast({ title: 'Enter a positive whole number', kind: 'error' });
      BF.economy.earn(n, 'Developer grant', 'debug');
    },
    'remove-coins': (root) => {
      const n = U.parseAmount(root.querySelector('#dev-coins').value);
      if (!(n > 0)) return BF.ui.toast({ title: 'Enter a positive whole number', kind: 'error' });
      const take = Math.min(n, BF.economy.balance());
      BF.economy.spend(take, 'Developer removal', 'debug');
    },
    'add-xp': (root) => { const n = U.parseAmount(root.querySelector('#dev-xp').value); if (n > 0) BF.progression.addXP(n, 'debug'); },
    'set-level': (root) => { BF.progression.setLevel(Number(root.querySelector('#dev-level').value)); BF.ui.toast({ title: 'Level set', kind: 'success' }); },
    'unlock-items': () => {
      BF.store.update('inventory', (s) => { BF.ITEM_LIST.forEach((i) => { if (i.cat !== 'bundle' && !s.inventory[i.id]) s.inventory[i.id] = { qty: 1, at: BF.clock.now(), fav: false, source: 'debug' }; }); });
      BF.ui.toast({ title: 'All ' + BF.ITEM_LIST.length + ' items unlocked', kind: 'success' });
    },
    'unlock-passes': () => {
      BF.store.update('passes', (s) => { BF.catalog.all(true).forEach((g) => (g.passes || []).forEach((p) => { if (!s.passes[p.id]) s.passes[p.id] = { at: BF.clock.now(), gameId: g.id }; })); });
      BF.ui.toast({ title: 'All game passes unlocked', kind: 'success' });
    },
    'complete-quests': () => {
      BF.store.update('quests', (s) => ['daily', 'weekly'].forEach((sc) => s.quests[sc].list.forEach((q) => { const d = BF.QUEST_MAP[q.id]; q.progress = d.target; q.done = true; })));
      BF.ui.toast({ title: 'All quests completed. Claim them on the Quests page.', kind: 'success' });
    },
    'spawn-bots': (root) => {
      const n = BF.world.spawnBots(Math.max(1, Math.min(200, Number(root.querySelector('#dev-bots').value) || 1)), root.querySelector('#dev-bot-game').value || null);
      BF.shell.updateLive();
      BF.ui.toast({ title: 'Spawned ' + n + ' bots', kind: 'success', icon: 'users' });
    },
    'clear-bots': () => { BF.world.clearBots(); BF.shell.updateLive(); BF.ui.toast({ title: 'All bots sent offline', kind: 'info' }); },
    'bot-request': () => {
      const cand = BF.bots.list.filter((b) => !BF.friends.isFriend(b.id) && !BF.friends.isBlocked(b.id) && !BF.friends.hasIncoming(b.id));
      if (!BF.friends.receiveRequest(U.pick(cand).id)) BF.ui.toast({ title: 'Friend requests are turned off in Privacy', kind: 'info' });
    },
    'bot-dm': () => BF.world.botDM(true),
    'bot-invite': () => BF.world.botInvite(true),
    'next-day': () => {
      BF.store.update('debug', (s) => { s.debug.dayOffset = (s.debug.dayOffset || 0) + 1; });
      BF.clock.offsetDays = BF.store.state.debug.dayOffset;
      BF.quests.ensure();
      BF.store.touch(['daily', 'quests']);
      BF.ui.toast({ title: 'It is now ' + BF.clock.today(), text: 'Daily reward and daily quests have rolled over.', kind: 'info', icon: 'calendar' });
    },
    'reset-day': () => {
      BF.store.update('debug', (s) => { s.debug.dayOffset = 0; });
      BF.clock.offsetDays = 0;
      BF.quests.ensure();
      BF.store.touch(['daily', 'quests']);
    },
    'reset-economy': async () => {
      if (!(await BF.ui.confirm({ title: 'Reset economy?', message: 'Balance returns to 1,500 and the ledger is cleared.', confirmLabel: 'Reset economy', danger: true }))) return;
      BF.store.update(['wallet', 'transactions'], (s) => {
        s.wallet = { balance: 1500, lifetimeEarned: 1500, lifetimeSpent: 0, highestBalance: 1500 };
        s.transactions = [{ id: U.uid('tx'), ts: BF.clock.now(), amount: 1500, balance: 1500, desc: 'Economy reset (developer)', cat: 'debug' }];
      });
      BF.bus.emit('wallet:changed', { delta: 0 });
    },
    'reset-inventory': async () => {
      if (!(await BF.ui.confirm({ title: 'Reset inventory?', message: 'Removes every item except the free starters and restores the starter outfit.', confirmLabel: 'Reset inventory', danger: true }))) return;
      BF.store.update(['inventory', 'avatar'], (s) => {
        s.inventory = {};
        BF.ITEM_LIST.filter((i) => i.starter).forEach((i) => { s.inventory[i.id] = { qty: 1, at: BF.clock.now(), fav: false }; });
        s.avatar = { skin: BF.STARTER_SKIN, equipped: U.clone(BF.STARTER_EQUIP) };
        s.avatar.equipped.hat = null;
      });
    },
    'reset-achievements': async () => {
      if (!(await BF.ui.confirm({ title: 'Reset achievements?', message: 'Locks every achievement and removes badges. They will re-unlock if you still meet the goals.', confirmLabel: 'Reset achievements', danger: true }))) return;
      BF.store.update(['achievements', 'badges'], (s) => { s.achievements = {}; s.badges = { pb_welcome: { at: BF.clock.now() } }; });
    },
    'reset-everything': async () => {
      if (!(await BF.ui.confirm({ title: 'Reset everything?', message: 'Deletes every account and save on this device.', confirmLabel: 'Reset everything', danger: true }))) return;
      BF.app.resetAll();
    },
    hide: () => {
      BF.store.update('debug', (s) => { s.debug.devMode = false; });
      BF.router.go('#/settings');
    },
  };

  function exportSave() {
    const data = BF.store.exportData();
    const json = JSON.stringify(data, null, 2);
    const name = 'blockforge-save-' + BF.store.state.player.username + '-' + BF.clock.today() + '.json';
    const h = BF.ui.modal({
      title: 'Export save',
      icon: 'download',
      wide: true,
      body: '<p class="muted" style="margin-bottom:10px">' + (json.length / 1024).toFixed(1) + ' KB of JSON. Download it, or copy it somewhere safe.</p><textarea class="textarea mono" id="export-json" readonly rows="10">' + esc(json) + '</textarea>',
      actions: [
        { label: 'Copy JSON', kind: 'outline', icon: 'copy', onClick: () => { U.copyText(json).then((ok) => { if (!ok) { const ta = h.el.querySelector('#export-json'); ta.focus(); ta.select(); } BF.ui.toast({ title: ok ? 'Save copied to clipboard' : 'Text selected: press Ctrl+C to copy', kind: ok ? 'success' : 'info' }); }); return false; } },
        { label: 'Download .json', kind: 'primary', icon: 'download', onClick: () => { const ok = U.downloadText(name, json); BF.ui.toast(ok ? { title: 'Download started: ' + name, text: 'No file? Some embedded views block downloads. Use Copy JSON instead.', kind: 'success' } : { title: 'Downloads are blocked here: use Copy JSON', kind: 'info' }); return false; } },
      ],
    });
  }

  function importSave() {
    const h = BF.ui.modal({
      title: 'Import save',
      icon: 'upload',
      wide: true,
      body: '<p class="muted" style="margin-bottom:10px">Choose a BlockForge save file or paste its JSON. This replaces <b>' + esc(BF.store.state.player.username) + '</b>’s current progress.</p><label class="btn btn-outline btn-sm upload-btn" style="margin-bottom:10px">' + BF.icon('upload', 14) + 'Choose file<input type="file" accept="application/json,.json" id="import-file" hidden></label><textarea class="textarea mono" id="import-json" rows="9" placeholder="Paste save JSON here"></textarea><div class="error" id="import-err" style="margin-top:8px"></div>',
      actions: [{ label: 'Cancel', kind: 'ghost' }, {
        label: 'Import', kind: 'primary', icon: 'upload', onClick: (hh) => {
          const err = hh.el.querySelector('#import-err');
          let data;
          try { data = JSON.parse(hh.el.querySelector('#import-json').value); } catch (e) { err.textContent = 'That is not valid JSON: ' + e.message; return false; }
          const v = BF.store.validateImport(data);
          if (!v.ok) { err.textContent = v.error; return false; }
          BF.store.importData(data);
          BF.app.restart();
          BF.ui.toast({ title: 'Save imported', text: 'Welcome back, ' + BF.store.state.player.displayName + '.', kind: 'success' });
          return true;
        },
      }],
    });
    h.el.querySelector('#import-file').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { h.el.querySelector('#import-json').value = await U.readFileText(f); } catch (err) { h.el.querySelector('#import-err').textContent = 'Could not read that file.'; }
    });
  }

  BF.pages.register('settings', {
    title: 'Settings',
    nav: 'settings',
    watch: (p) => (p.tab === 'account' || !p.tab ? ['debug'] : p.tab === 'data' ? ['debug'] : ['settings', 'debug']),
    render(params) {
      const s = BF.store.state;
      const dev = s.debug.devMode;
      const tabs = TABS.concat(dev ? [['developer', 'Developer', 'bug']] : []);
      const tab = tabs.some((t) => t[0] === params.tab) ? params.tab : 'account';
      const body = { account: accountTab, privacy: privacyTab, notifications: notificationsTab, appearance: appearanceTab, gameplay: gameplayTab, data: dataTab, developer: devTab }[tab](s);
      return '<div class="page-head"><div><h1 class="page-title">Settings</h1><p class="page-sub">Changes apply and save immediately.</p></div></div>' +
        '<div class="settings-layout"><nav class="settings-nav">' + tabs.map((t) => '<a href="#/settings/' + t[0] + '" class="nav-item' + (t[0] === tab ? ' active' : '') + '">' + BF.icon(t[2], 17) + '<span class="nav-text">' + t[1] + '</span></a>').join('') + '</nav><div class="settings-body">' + body + '</div></div>';
    },
    mount(root) {
      const set = (path, value) => {
        BF.store.update('settings', (s) => {
          const parts = path.split('.');
          let o = s.settings;
          while (parts.length > 1) o = o[parts.shift()];
          o[parts[0]] = value;
        });
        // the autosave switch itself must persist even when it turns background saving off
        if (path === 'data.autosave') BF.store.save('settings');
        BF.applyAppearance();
      };
      root.querySelectorAll('.switch input[id]').forEach((inp) => inp.addEventListener('change', () => { set(inp.id, inp.checked); BF.sfx.play('tab'); }));
      root.querySelectorAll('[data-seg]').forEach((g) => g.addEventListener('click', (e) => {
        const b = e.target.closest('[data-val]');
        if (!b) return;
        g.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        set(g.dataset.seg, b.dataset.val);
        BF.sfx.play('tab');
      }));
      root.querySelectorAll('[data-accent]').forEach((b) => b.addEventListener('click', () => set('appearance.accent', b.dataset.accent)));
      const vol = root.querySelector('#gameplay\\.volume');
      if (vol) {
        vol.addEventListener('input', () => { root.querySelector('#vol-label').textContent = Math.round(vol.value * 100) + '%'; BF.sfx.setVolume(Number(vol.value)); });
        vol.addEventListener('change', () => { set('gameplay.volume', Number(vol.value)); BF.sfx.play('coin'); });
      }
      const form = root.querySelector('#acct-form');
      if (form) form.addEventListener('submit', (e) => {
        e.preventDefault();
        const err = form.querySelector('#acct-err');
        const display = form.querySelector('#set-display').value.trim();
        const username = form.querySelector('#set-username').value.trim();
        const bio = form.querySelector('#set-bio').value.trim();
        if (!display || display.length > 24) { err.textContent = 'Display names need 1-24 characters.'; return; }
        const uerr = BF.accounts.validateUsername(username, BF.store.accountId);
        if (uerr) { err.textContent = uerr; return; }
        err.textContent = '';
        BF.store.update('player', (s) => { s.player.displayName = BF.dialogue.filter(display); s.player.username = username; s.player.bio = BF.dialogue.filter(bio); });
        BF.store.save('profile');
        BF.ui.toast({ title: 'Profile saved', kind: 'success' });
      });
      const build = root.querySelector('#build-btn');
      if (build) build.addEventListener('click', () => {
        if (BF.store.state.debug.devMode) { BF.ui.toast({ title: 'Developer tools are already on', kind: 'info', icon: 'bug' }); return; }
        buildClicks++;
        clearTimeout(buildTimer);
        buildTimer = setTimeout(() => { buildClicks = 0; }, 2500);
        if (buildClicks >= 3 && buildClicks < 5) BF.ui.toast({ title: (5 - buildClicks) + ' more…', kind: 'info', duration: 900 });
        if (buildClicks >= 5) {
          buildClicks = 0;
          BF.store.update('debug', (s) => { s.debug.devMode = true; });
          BF.ui.toast({ title: 'Developer tools enabled', text: 'Find them in the new Developer tab.', kind: 'success', icon: 'bug' });
          BF.router.go('#/settings/developer');
        }
      });
      root.addEventListener('click', async (e) => {
        if (e.target.closest('[data-export]')) exportSave();
        if (e.target.closest('[data-import]')) importSave();
        if (e.target.closest('[data-reset-account]')) {
          const ok = await BF.ui.confirm({ title: 'Reset ' + BF.store.state.player.username + '?', message: 'Everything on this account returns to its starting state: ForgeCoins, items, avatar, friends, messages, quests, achievements and creations.', confirmLabel: 'Reset account', danger: true });
          if (ok) { BF.store.resetAccount(); BF.app.restart(); BF.ui.toast({ title: 'Account reset', kind: 'info' }); }
        }
        if (e.target.closest('[data-reset-all]')) {
          const ok = await BF.ui.confirm({ title: 'Reset all demo data?', message: 'Every account and save on this device is deleted and BlockForge starts fresh.', confirmLabel: 'Delete everything', danger: true });
          if (ok) BF.app.resetAll();
        }
        const d = e.target.closest('[data-dev]');
        if (d && DEV[d.dataset.dev]) { await DEV[d.dataset.dev](root); if (!['next-day', 'reset-day', 'hide'].includes(d.dataset.dev)) BF.router.refresh(); }
      });
    },
  });
})((window.BF = window.BF || {}));
