/**
 * BlockForge — centralized application state, persistence and local accounts.
 *
 * One state object per account holds everything (player, wallet, inventory,
 * avatar, progress, social, quests, settings ...). Systems mutate it only via
 * BF.store.update(keys, fn), which batches change notifications per microtask
 * and schedules an autosave. UI subscribes with BF.store.on(keys, fn).
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  BF.SAVE_VERSION = 1;
  BF.SAVE_FORMAT = 'blockforge-save';
  BF.APP_VERSION = '1.0.0';
  BF.BUILD = '2609.24';

  const DAY = 86400000;

  function defaultSettings() {
    return {
      privacy: { messages: 'everyone', friendRequests: 'everyone', showOnline: true, invites: true, inventoryPublic: true },
      notifications: {
        popups: true,
        popupMode: 'all', // all | important | off
        banners: true, // achievement, badge and level-up banners
        inGame: false, // background pop-ups while a game is running
        dnd: false, // do not disturb: no pop-ups or banners at all
        sound: true,
        types: { friend: true, achievement: true, invite: true, purchase: true, daily: true, quest: true, bot: true, update: true, level: true, system: true },
      },
      appearance: { theme: 'dark', accent: 'ember', density: 'comfortable', reduceMotion: false, fontScale: 1 },
      gameplay: { volume: 0.6, sfx: true, touchControls: 'auto', showFps: false, botChat: 'normal', chatFilter: true, autoJoinBest: true, botAI: 'smart', graphics: 'auto' },
      data: { autosave: true },
    };
  }

  function emptyStats() {
    return {
      gamesPlayed: 0, wins: 0, losses: 0, matches: 0, kills: 0, chatSent: 0, messagesSent: 0,
      questsCompleted: 0, distinctGames: [], playSeconds: 0, itemsBought: 0, itemsSold: 0, passesBought: 0,
      gamesCreated: 0, gamesPublished: 0, treasures: 0, goals: 0, blocksMined: 0, petsHatched: 0,
      wavesCleared: 0, bossesDefeated: 0, racesWon: 0, jobs: 0, coinsFromGames: 0,
    };
  }

  /**
   * Build a brand-new state for an account.
   * @param {{id:string, username:string, displayName:string}} profile
   * @param {{sample?:boolean}} [opts] sample=true seeds the rich "ForgePlayer" demo history
   */
  BF.createInitialState = function (profile, opts) {
    const sample = !!(opts && opts.sample);
    const now = BF.clock.now();
    const worldSeed = sample ? 'blockforge-world-1' : 'world-' + profile.username.toLowerCase();
    const bots = BF.bots.generate(worldSeed);
    const handcrafted = bots.filter((b) => b.handcrafted);
    const generated = bots.filter((b) => !b.handcrafted);

    const inventory = {};
    for (const it of BF.ITEM_LIST) {
      if (it.starter || (sample && it.starterOwned)) inventory[it.id] = { qty: 1, at: now - 30 * DAY, fav: false };
    }

    const state = {
      version: BF.SAVE_VERSION,
      meta: { createdAt: now, lastSaved: 0, saveCount: 0, sessions: 0, lastSeenDay: null, sample },
      player: {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        bio: sample ? 'Forging new worlds one block at a time. Racing fan, obby survivor, occasional tycoon.' : 'New to BlockForge!',
        joinDate: sample ? new Date(2024, 2, 18).getTime() : now,
        level: sample ? 12 : 1,
        xp: sample ? 2450 : 0,
        stats: emptyStats(),
      },
      wallet: { balance: 1500, lifetimeEarned: sample ? 6420 : 1500, lifetimeSpent: sample ? 4920 : 0, highestBalance: 1500 },
      transactions: [],
      inventory,
      avatar: { skin: BF.STARTER_SKIN, equipped: U.clone(BF.STARTER_EQUIP) },
      passes: {},
      progress: {},
      catalog: { favorites: [], votes: {}, visits: {} },
      recent: [],
      social: {
        friends: handcrafted.slice(0, sample ? 8 : 3).map((b) => b.id),
        incoming: [],
        outgoing: [],
        blocked: [],
        followers: [],
        following: [],
        recent: [],
      },
      messages: {},
      notifications: [],
      quests: { daily: null, weekly: null, completed: 0 },
      achievements: {},
      badges: { pb_welcome: { at: now } },
      daily: { lastClaimDay: null, streak: 0, bestStreak: 0, totalClaims: 0 },
      created: [],
      ads: { campaigns: [] },
      limiteds: {},
      updates: { seen: [], last: 0 },
      settings: defaultSettings(),
      secrets: { forgecore: { unlocked: false, at: 0, uses: 0, total: 0, wordSolved: false } },
      bots: {},
      world: { seed: worldSeed },
      chatmem: {},
      debug: { dayOffset: 0, devMode: false },
    };

    if (!sample) {
      state.social.followers = generated.slice(0, 3).map((b) => b.id);
      state.transactions.push({ id: U.uid('tx'), ts: now, amount: 1500, balance: 1500, desc: 'Welcome bonus', cat: 'gift' });
      state.notifications.push({ id: U.uid('n'), type: 'system', title: 'Welcome to BlockForge!', body: 'You start with 1,500 ForgeCoins. Claim your daily reward and jump into a game.', ts: now, read: false, icon: 'sparkle', route: '#/home' });
      state.messages.system = { with: 'system', updated: now, msgs: [{ id: U.uid('m'), from: 'them', text: 'Welcome to BlockForge, ' + profile.displayName + '! Everything here is fictional and saved on this device. Have fun forging!', ts: now, read: false }] };
      return state;
    }

    // ---- ForgePlayer sample history: a level-12 player with some miles on them.
    const s = state.player.stats;
    Object.assign(s, {
      gamesPlayed: 37, wins: 8, losses: 21, matches: 29, kills: 96, chatSent: 12, messagesSent: 4, questsCompleted: 6,
      distinctGames: ['block-battlegrounds', 'skyline-racers', 'sky-obby', 'pet-world', 'city-life'],
      playSeconds: 5400, itemsBought: 4, passesBought: 0, treasures: 0, goals: 0, blocksMined: 0, petsHatched: 3,
      wavesCleared: 0, bossesDefeated: 0, racesWon: 1, jobs: 4, coinsFromGames: 2100,
    });
    state.player.xp = 2450;
    state.social.followers = handcrafted.slice(8, 18).map((b) => b.id).concat(generated.slice(0, 13).map((b) => b.id));
    state.social.following = handcrafted.slice(0, 8).map((b) => b.id).concat(generated.slice(20, 27).map((b) => b.id));
    state.social.incoming = [{ id: handcrafted[9].id, at: now - 3600 * 1000 * 5 }, { id: handcrafted[10].id, at: now - 3600 * 1000 * 26 }];
    state.social.recent = [
      { id: handcrafted[12].id, gameId: 'block-battlegrounds', ts: now - DAY * 0.4 },
      { id: generated[30].id, gameId: 'block-battlegrounds', ts: now - DAY * 0.4 },
      { id: handcrafted[13].id, gameId: 'skyline-racers', ts: now - DAY * 1.2 },
      { id: generated[31].id, gameId: 'sky-obby', ts: now - DAY * 2.1 },
      { id: generated[32].id, gameId: 'pet-world', ts: now - DAY * 3.3 },
    ];

    const P = (id, o) => { state.progress[id] = Object.assign({ plays: 0, wins: 0, losses: 0, lastPlayed: 0, timeSec: 0, custom: {} }, o); };
    P('block-battlegrounds', { plays: 14, wins: 3, losses: 11, kills: 43, lastPlayed: now - DAY * 0.4, timeSec: 1900 });
    P('skyline-racers', { plays: 9, wins: 1, losses: 8, bestTime: 96420, lastPlayed: now - DAY * 1.2, timeSec: 1200 });
    P('sky-obby', { plays: 6, wins: 2, losses: 4, bestTime: 188300, lastPlayed: now - DAY * 2.1, timeSec: 1000 });
    P('pet-world', { plays: 5, wins: 1, losses: 4, petbucks: 18400, pets: 3, lastPlayed: now - DAY * 3.3, timeSec: 800 });
    P('city-life', { plays: 3, wins: 1, losses: 2, jobs: 4, cash: 3100, lastPlayed: now - DAY * 5.5, timeSec: 500 });
    state.recent = [
      { gameId: 'block-battlegrounds', ts: now - DAY * 0.4 },
      { gameId: 'skyline-racers', ts: now - DAY * 1.2 },
      { gameId: 'sky-obby', ts: now - DAY * 2.1 },
      { gameId: 'pet-world', ts: now - DAY * 3.3 },
      { gameId: 'city-life', ts: now - DAY * 5.5 },
    ];
    state.catalog.favorites = ['block-battlegrounds', 'skyline-racers'];
    state.catalog.votes = { 'block-battlegrounds': 'like', 'sky-obby': 'like' };

    ['first_steps', 'first_win', 'first_purchase', 'explorer', 'speed_demon', 'quest_starter'].forEach((id, i) => { state.achievements[id] = { at: now - DAY * (40 - i * 5) }; });
    state.badges.pb_veteran = { at: now - DAY * 20 };
    state.badges.bb_first_blood = { at: now - DAY * 30, gameId: 'block-battlegrounds' };
    state.badges.bb_victor = { at: now - DAY * 22, gameId: 'block-battlegrounds' };
    state.badges.sr_podium = { at: now - DAY * 9, gameId: 'skyline-racers' };
    state.badges.so_finish = { at: now - DAY * 6, gameId: 'sky-obby' };
    state.badges.pw_first_hatch = { at: now - DAY * 4, gameId: 'pet-world' };
    state.daily = { lastClaimDay: null, streak: 0, bestStreak: 4, totalClaims: 19 };

    // A short, believable ledger (oldest first) ending at exactly 1,500.
    const ledger = [
      [-DAY * 9, 50, 'Daily reward (day 1)', 'daily'],
      [-DAY * 8.8, 120, 'Block Battlegrounds match rewards', 'game'],
      [-DAY * 8, -150, 'Purchased Cozy Hoodie', 'purchase'],
      [-DAY * 6.5, 150, 'Completed Daily Challenge: Win a match', 'quest'],
      [-DAY * 5, -90, 'Purchased Retro Cap', 'purchase'],
      [-DAY * 3.2, 75, 'Pet World session rewards', 'game'],
      [-DAY * 2, 200, 'Level 12 reward + achievement bonus', 'level'],
      [-DAY * 1.1, -150, 'Purchased Cozy Scarf and Nerd Glasses', 'purchase'],
      [-DAY * 0.4, 95, 'Block Battlegrounds match rewards', 'game'],
    ];
    let bal = 1500 - ledger.reduce((a, l) => a + l[1], 0);
    state.transactions = ledger.map((l) => {
      bal += l[1];
      return { id: U.uid('tx'), ts: now + l[0], amount: l[1], balance: bal, desc: l[2], cat: l[3] };
    });

    const n = (type, title, body, ago, icon, route, read) => ({ id: U.uid('n'), type, title, body, ts: now - ago, read: !!read, icon, route });
    state.notifications = [
      n('friend', 'Friend request', handcrafted[9].displayName + ' wants to be your friend.', 3600 * 1000 * 5, 'userPlus', '#/friends/requests'),
      n('update', 'Skyline Racers updated', 'Sky Highway track added and handling reworked.', 3600 * 1000 * 20, 'refresh', '#/game/skyline-racers'),
      n('achievement', 'Achievement unlocked: Questing', 'You completed 5 quests. +150 ForgeCoins', DAY * 12, 'target', '#/achievements', true),
      n('system', 'Welcome to BlockForge!', 'Everything here is fictional and saved on this device.', DAY * 40, 'sparkle', '#/home', true),
    ];

    const convo = (botId, lines) => {
      state.messages[botId] = {
        with: botId,
        updated: now - lines[lines.length - 1][2],
        msgs: lines.map((l) => ({ id: U.uid('m'), from: l[0], text: l[1], ts: now - l[2], read: l[3] !== false })),
      };
    };
    convo(handcrafted[1].id, [
      ['them', 'yo! i just finished a new obby course in Create, want to try it?', DAY * 2],
      ['me', 'yes!! send it over', DAY * 1.9],
      ['them', 'still polishing the last stage lol. soon™', DAY * 1.8],
      ['them', 'also gg in Block Battlegrounds earlier, that hammer combo was wild', 3600 * 1000 * 7, false],
    ]);
    convo(handcrafted[0].id, [
      ['them', 'rematch in Skyline Racers? i will win this time', DAY * 1.1],
      ['me', 'you said that last time', DAY * 1.05],
      ['them', 'this time i mean it', DAY * 1],
    ]);
    state.messages.system = {
      with: 'system', updated: now - DAY * 40,
      msgs: [{ id: U.uid('m'), from: 'them', text: 'Welcome to BlockForge, Forge Player! Everything here is fictional and saved on this device. Have fun forging!', ts: now - DAY * 40, read: true }],
    };
    return state;
  };

  /** Fill in any keys missing from an older save (forward-compatible loading). */
  function deepDefaults(target, defaults) {
    for (const k of Object.keys(defaults)) {
      const dv = defaults[k];
      if (!(k in target) || target[k] === undefined) target[k] = U.clone(dv);
      else if (dv && typeof dv === 'object' && !Array.isArray(dv) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) deepDefaults(target[k], dv);
    }
    return target;
  }

  function migrate(state, profile) {
    if (!state || typeof state !== 'object') return null;
    const fresh = BF.createInitialState(profile || { id: 'acc_tmp', username: 'Player', displayName: 'Player' }, { sample: false });
    // Only structural defaults: never copy the fresh account's content lists over real data.
    const skeleton = {
      meta: fresh.meta, player: { stats: fresh.player.stats }, wallet: fresh.wallet, settings: fresh.settings,
      secrets: fresh.secrets, daily: fresh.daily, quests: { completed: 0 }, catalog: fresh.catalog,
      social: { friends: [], incoming: [], outgoing: [], blocked: [], followers: [], following: [], recent: [] },
      debug: fresh.debug, world: fresh.world, avatar: fresh.avatar,
    };
    ['transactions', 'recent', 'notifications', 'created'].forEach((k) => { if (!Array.isArray(state[k])) state[k] = []; });
    ['inventory', 'passes', 'progress', 'messages', 'achievements', 'badges', 'bots', 'chatmem'].forEach((k) => { if (!state[k] || typeof state[k] !== 'object') state[k] = {}; });
    deepDefaults(state, skeleton);
    if (state.settings.notifications.popups === false && state.settings.notifications.popupMode === 'all') state.settings.notifications.popupMode = 'off';
    if (!Array.isArray(state.player.stats.distinctGames)) state.player.stats.distinctGames = [];
    if (!state.ads || typeof state.ads !== 'object' || !Array.isArray(state.ads.campaigns)) state.ads = { campaigns: [] };
    if (!state.limiteds || typeof state.limiteds !== 'object') state.limiteds = {};
    if (!state.updates || typeof state.updates !== 'object' || !Array.isArray(state.updates.seen)) state.updates = { seen: [], last: 0 };
    state.version = BF.SAVE_VERSION;
    return state;
  }

  const pending = new Set();
  let flushQueued = false;
  let saveTimer = null;

  /** @namespace */
  const store = (BF.store = {
    state: null,
    accountId: null,
    lastSavedAt: 0,
    lastSaveResult: null,

    /** Load (or create) the state for an account id. */
    load(accountId) {
      const acc = BF.accounts.get(accountId);
      if (!acc) throw new Error('Unknown account ' + accountId);
      let saved = BF.storage.get('save:' + accountId);
      if (saved) saved = migrate(saved, acc);
      store.state = saved || BF.createInitialState(acc, { sample: !!acc.sample });
      store.accountId = accountId;
      BF.clock.offsetDays = store.state.debug.dayOffset || 0;
      store.state.meta.sessions = (store.state.meta.sessions || 0) + 1;
      store.save('load');
      BF.bus.emit('store:loaded', { accountId: store.accountId });
      return store.state;
    },

    /** Direct read access (never mutate outside update()). */
    get() {
      return store.state;
    },

    /**
     * Mutate state and announce which slices changed.
     * @param {string|string[]} keys slice names, e.g. ['wallet','transactions']
     * @param {(s:object)=>any} fn mutation
     */
    update(keys, fn) {
      if (!store.state) return undefined;
      const result = fn(store.state);
      store.touch(keys);
      return result;
    },

    /** Mark slices as changed without mutating (batched per microtask). */
    touch(keys) {
      (Array.isArray(keys) ? keys : [keys]).forEach((k) => pending.add(k));
      if (!flushQueued) {
        flushQueued = true;
        queueMicrotask(store.flush);
      }
      store.scheduleSave();
    },

    flush() {
      flushQueued = false;
      if (!pending.size) return;
      const keys = new Set(pending);
      pending.clear();
      BF.bus.emit('store:change', keys);
    },

    /**
     * Subscribe to slice changes. Returns an unsubscribe function.
     * @param {string|string[]} keys slices or '*'
     */
    on(keys, fn) {
      const list = keys === '*' ? null : Array.isArray(keys) ? keys : [keys];
      return BF.bus.on('store:change', (set) => {
        if (!list || list.some((k) => set.has(k))) fn(set);
      });
    },

    /** True when the player allows background saves (Settings > Data > Automatic save). */
    autosaveEnabled() {
      return !!(store.state && store.state.settings.data.autosave);
    },

    scheduleSave() {
      if (!store.autosaveEnabled()) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => store.save('auto'), 900);
    },

    /** Save for a background reason (interval, tab hidden, page closing). Skipped while autosave is off. */
    backgroundSave(reason) {
      if (!store.autosaveEnabled()) return { ok: false, skipped: true };
      return store.save(reason);
    },

    /** Write the current state to storage now. */
    save(reason) {
      if (!store.state || !store.accountId) return { ok: false };
      clearTimeout(saveTimer);
      const s = store.state;
      s.meta.lastSaved = Date.now();
      s.meta.saveCount = (s.meta.saveCount || 0) + 1;
      const res = BF.storage.set('save:' + store.accountId, s);
      store.lastSavedAt = s.meta.lastSaved;
      store.lastSaveResult = res;
      BF.accounts.touchProfile(store.accountId, s.player);
      BF.bus.emit('store:saved', { reason: reason || 'manual', result: res });
      return res;
    },

    /** Serialize for export. */
    exportData() {
      return {
        format: BF.SAVE_FORMAT,
        version: BF.SAVE_VERSION,
        app: BF.APP_VERSION,
        exportedAt: new Date().toISOString(),
        account: { username: store.state.player.username, displayName: store.state.player.displayName },
        state: store.state,
      };
    },

    /**
     * Validate an imported save. Returns {ok, error?, state?}.
     * @param {any} data parsed JSON
     */
    validateImport(data) {
      if (!data || typeof data !== 'object') return { ok: false, error: 'That file is not JSON save data.' };
      if (data.format !== BF.SAVE_FORMAT) return { ok: false, error: 'That JSON is not a BlockForge save (missing "format": "blockforge-save").' };
      if (typeof data.version !== 'number' || data.version > BF.SAVE_VERSION) return { ok: false, error: 'That save comes from a newer BlockForge version.' };
      const st = data.state;
      if (!st || !st.player || !st.wallet || typeof st.wallet.balance !== 'number') return { ok: false, error: 'The save is missing player or wallet data.' };
      return { ok: true, state: st };
    },

    /** Replace the signed-in account's state with an imported one. */
    importData(data) {
      const v = store.validateImport(data);
      if (!v.ok) return v;
      const acc = BF.accounts.get(store.accountId);
      const st = migrate(U.clone(v.state), acc);
      st.player.id = acc.id;
      store.state = st;
      BF.clock.offsetDays = st.debug.dayOffset || 0;
      store.save('import');
      BF.bus.emit('store:loaded', { accountId: store.accountId });
      BF.accounts.touchProfile(acc.id, st.player);
      return { ok: true };
    },

    /** Reset this account to its starting state. */
    resetAccount() {
      const acc = BF.accounts.get(store.accountId);
      store.state = BF.createInitialState(acc, { sample: !!acc.sample });
      BF.clock.offsetDays = 0;
      store.save('reset');
      BF.bus.emit('store:loaded', { accountId: store.accountId });
    },
  });

  // ------------------------------------------------------------------ accounts

  const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

  /** Fictional local profiles. No passwords or credentials are ever stored. */
  const accounts = (BF.accounts = {
    index() {
      const idx = BF.storage.get('accounts');
      return idx && Array.isArray(idx.list) ? idx : { list: [], current: null };
    },
    writeIndex(idx) {
      BF.storage.set('accounts', idx);
    },
    list() {
      return accounts.index().list;
    },
    get(id) {
      return accounts.list().find((a) => a.id === id) || null;
    },
    currentId() {
      const idx = accounts.index();
      return idx.current && accounts.get(idx.current) ? idx.current : null;
    },

    /** Returns an error message or null. */
    validateUsername(name, ignoreId) {
      name = String(name || '').trim();
      if (!USERNAME_RE.test(name)) return 'Use 3-20 letters, numbers or underscores.';
      const lower = name.toLowerCase();
      if (accounts.list().some((a) => a.username.toLowerCase() === lower && a.id !== ignoreId)) return 'That username is already used on this device.';
      if (BF.BOT_SEEDS.some((b) => b[0].toLowerCase() === lower)) return 'That username belongs to another player.';
      if (['blockforge', 'admin', 'system', 'forgecore', 'moderator'].includes(lower)) return 'That username is reserved.';
      return null;
    },

    /**
     * Create a local account and its initial save.
     * @returns {{ok:boolean, error?:string, account?:object}}
     */
    create(username, displayName, opts) {
      username = String(username || '').trim();
      displayName = String(displayName || '').trim() || username;
      const err = accounts.validateUsername(username);
      if (err) return { ok: false, error: err };
      if (displayName.length > 24) return { ok: false, error: 'Display names can be up to 24 characters.' };
      const acc = { id: U.uid('acc'), username, displayName, createdAt: Date.now(), lastLogin: 0, sample: !!(opts && opts.sample), level: 1 };
      const idx = accounts.index();
      idx.list.push(acc);
      accounts.writeIndex(idx);
      const state = BF.createInitialState(acc, { sample: acc.sample });
      acc.level = state.player.level;
      acc.avatar = state.avatar;
      BF.storage.set('save:' + acc.id, state);
      accounts.touchProfile(acc.id, state.player, state.avatar);
      return { ok: true, account: acc };
    },

    /** Make sure the default demo account exists. */
    ensureDefault() {
      if (accounts.list().length) return;
      accounts.create('ForgePlayer', 'Forge Player', { sample: true });
    },

    signIn(id) {
      const idx = accounts.index();
      const acc = idx.list.find((a) => a.id === id);
      if (!acc) return false;
      acc.lastLogin = Date.now();
      idx.current = id;
      accounts.writeIndex(idx);
      return true;
    },

    signOut() {
      if (store.state) store.save('signout');
      const idx = accounts.index();
      idx.current = null;
      accounts.writeIndex(idx);
      store.state = null;
      store.accountId = null;
    },

    remove(id) {
      const idx = accounts.index();
      idx.list = idx.list.filter((a) => a.id !== id);
      if (idx.current === id) idx.current = null;
      accounts.writeIndex(idx);
      BF.storage.remove('save:' + id);
    },

    /** Keep the sign-in screen summary in sync with the save. */
    touchProfile(id, player, avatar) {
      const idx = accounts.index();
      const acc = idx.list.find((a) => a.id === id);
      if (!acc || !player) return;
      acc.username = player.username;
      acc.displayName = player.displayName;
      acc.level = player.level;
      if (avatar || (store.state && store.accountId === id)) acc.avatar = U.clone(avatar || store.state.avatar);
      accounts.writeIndex(idx);
    },
  });
})((window.BF = window.BF || {}));
