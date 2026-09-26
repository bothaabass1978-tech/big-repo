/**
 * BlockForge — game runtime.
 *
 * Launches a registered game module into a simulated server: builds the
 * in-game shell (canvas, chat, player list, feed, touch controls), keeps the
 * server's bots in sync with the world simulation, drives the frame loop, and
 * settles rewards, stats and quests when a round ends.
 *
 * Module contract:
 *   BF.GameModules.register(gameType, {
 *     actions: {jump: ['Space', 'KeyW']},           // input bindings
 *     controls: {joystick: true, buttons: [{act, label, icon}]},
 *     maxBots: 7,                                   // active participants (default game.activeBots)
 *     feedTop: 0.12,                                // optional feed offset (fraction of view height) to clear a HUD strip
 *     three: true,                                  // has a 3D view (ctx.g3); otherwise 2D only
 *     create(ctx) -> {update(dt), draw(g), destroy?, onBotJoin?, onBotLeave?, onEmote?, onChat?,
 *                     render3d?(dt), hud?(g)}
 *   })
 *
 * 3D mode (module.three and BF.g3d.enabled()): ctx.g3 is a BF.g3d World. Each
 * frame the runtime calls update(dt), render3d(dt) to sync the scene, animates
 * and renders it, then clears the transparent HUD canvas and draws queued
 * labels followed by hud(g). In 2D mode (Classic 2D setting or no WebGL)
 * ctx.g3 is null and draw(g) paints everything as before.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const esc = U.esc;
  const W = 960;
  const H = 540;
  const mods = {};

  BF.GameModules = {
    /** Register a gameplay module for a gameType. */
    register(type, def) {
      mods[type] = def;
    },
    get(type) {
      return mods[type] || null;
    },
    types() {
      return Object.keys(mods);
    },
  };

  let s = null; // current session

  const R = (BF.runtime = {
    active: false,
    W,
    H,

    /** Join a server of a game and start playing. */
    launch(gameId, serverId) {
      if (R.active && s) {
        if (s.gameId === gameId && (!serverId || s.server.id === serverId)) return;
        R.leave(true);
      }
      const game = BF.catalog.get(gameId);
      if (!game) return BF.ui.toast({ title: 'Game not found', kind: 'error' });
      const mod = BF.GameModules.get(game.gameType);
      if (!mod) return BF.ui.toast({ title: game.name + ' is under maintenance', text: 'Its game module did not load. Try again later.', kind: 'error' });
      const j = BF.world.join(gameId, serverId);
      if (!j.ok) {
        return BF.ui.toast({ title: j.reason === 'full' ? 'Server #' + serverId + ' is full' : 'That server has closed', text: 'Press Play to be matched to another server.', kind: 'error', icon: 'server' });
      }
      BF.ui.closeMenus();
      BF.ui.closeAllModals();
      R.active = true;
      const now = BF.clock.now();
      BF.catalog.recordVisit(gameId);
      BF.store.update(['progress', 'player'], (st) => {
        const pr = BF.progressFor(st, gameId);
        pr.plays = (pr.plays || 0) + 1;
        pr.lastPlayed = now;
        st.player.stats.gamesPlayed += 1;
        if (!st.player.stats.distinctGames.includes(gameId)) st.player.stats.distinctGames.push(gameId);
      });
      BF.quests.track('play_game', 1, { gameId });

      s = {
        game, gameId, mod, server: j.server,
        ctx: null, instance: null, input: null,
        paused: false, ended: false, loading: true, crashed: 0,
        all: [], active: [], lines: [], partner: null,
        timers: [], offs: [], orders: new Map(),
        raf: 0, lastT: 0, playTime: 0, timeBank: 0,
        pendingCoins: 0, pendingReasons: new Set(), flushTimer: null,
        bubbles: new Map(), badges: [], sessionCoins: 0, sessionXp: 0,
        fpsT: 0, fpsN: 0,
      };
      buildDom();
      syncRoster(true);
      bindWorld();
      const steps = ['Finding server…', 'Joining Server #' + s.server.id + '…', 'Loading ' + game.name + '…', 'Spawning your avatar…'];
      let i = 0;
      const stepEl = s.root.querySelector('#gr-load-step');
      const bar = s.root.querySelector('#gr-load-bar');
      const tick = () => {
        if (!s || s.gameId !== gameId) return;
        if (i < steps.length) {
          stepEl.textContent = steps[i];
          bar.style.width = ((i + 1) / steps.length) * 100 + '%';
          i++;
          s.timers.push(setTimeout(tick, 280));
        } else start();
      };
      tick();
    },

    /** Leave the current game and return to its page. */
    leave(silent) {
      if (!s) return;
      const gameId = s.gameId;
      flushRewards();
      bankTime(true);
      s.timers.forEach((t) => clearTimeout(t));
      s.offs.forEach((off) => off());
      clearTimeout(s.flushTimer);
      cancelAnimationFrame(s.raf);
      if (s.instance && s.instance.destroy) { try { s.instance.destroy(); } catch (e) { console.error(e); } }
      if (s.input) s.input.destroy();
      if (s.g3) { try { s.g3.dispose(); } catch (e) { console.error(e); } if (s.g3.canvas.parentNode) s.g3.canvas.remove(); s.g3 = null; }
      window.removeEventListener('resize', s.onResize);
      document.removeEventListener('keydown', s.onKey, true);
      document.removeEventListener('visibilitychange', s.onVis);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      if (s.active.length) BF.friends.recordRecent(s.active.map((b) => b.id).slice(0, 8), gameId);
      s.root.remove();
      document.body.classList.remove('in-game');
      BF.world.leave();
      s = null;
      R.active = false;
      BF.ui.closeAllModals();
      if (!silent) {
        BF.router.go('#/game/' + gameId);
        BF.router.refresh();
      }
    },

    /** Current session (read-only use). */
    session() {
      return s;
    },
  });

  // ------------------------------------------------------------------- DOM

  function buildDom() {
    const g = s.game;
    const root = document.createElement('div');
    root.className = 'gr';
    root.id = 'gr';
    root.setAttribute('role', 'application');
    root.setAttribute('aria-label', g.name);
    root.innerHTML =
      '<header class="gr-top"><button class="gr-btn" data-g="leave" data-tip="Leave game">' + BF.icon('door', 17) + '<span class="gr-hide-sm">Leave</span></button>' +
      '<div class="gr-title"><img src="' + BF.thumbs.url(g) + '" alt=""><div><b>' + esc(g.name) + '</b><span>Server #' + s.server.id + ' · ' + esc(s.server.region) + ' · <span class="gr-ping">' + s.server.ping + 'ms</span></span></div></div>' +
      '<div class="gr-top-right"><span class="gr-chip" data-tip="Players in this server">' + BF.icon('users', 15) + '<b id="gr-count" class="num">1/' + s.server.max + '</b></span>' +
      '<span class="gr-chip gold" data-tip="ForgeCoins">' + BF.coinIcon(15) + '<b id="gr-coins" class="num">' + U.fmt(BF.economy.balance()) + '</b></span>' +
      '<button class="gr-btn icon" data-g="emotes" data-tip="Emotes" aria-label="Emotes">' + BF.icon('emote', 18) + '</button>' +
      '<button class="gr-btn icon" data-g="side" data-tip="Chat and players (Tab)" aria-label="Chat and players">' + BF.icon('chat', 18) + '<span class="gr-dot" id="gr-chat-dot" hidden></span></button>' +
      '<button class="gr-btn icon gr-hide-sm" data-g="fullscreen" data-tip="Fullscreen" aria-label="Fullscreen">' + BF.icon('expand', 18) + '</button>' +
      '<button class="gr-btn icon" data-g="pause" data-tip="Menu (Esc)" aria-label="Menu">' + BF.icon('pause', 18) + '</button></div></header>' +
      '<div class="gr-body"><div class="gr-stage" id="gr-stage"><div class="gr-frame" id="gr-frame"><canvas id="gr-canvas" aria-label="' + esc(g.name) + ' game view"></canvas>' +
      '<div class="gr-ui" id="gr-ui"></div><div class="gr-feed" id="gr-feed" aria-live="polite"></div><div class="gr-touch" id="gr-touch"></div><div class="gr-fps" id="gr-fps" hidden></div><div class="gr-overlay" id="gr-overlay" hidden></div></div>' +
      '<div class="gr-hint">' + BF.icon('keyboard', 14) + '<span>' + esc(g.controls || 'Use the on-screen controls') + '</span><span class="faint">· Enter to chat · Esc for menu</span></div></div>' +
      '<aside class="gr-side" id="gr-side"><div class="gr-side-tabs"><button class="on" data-gtab="chat">' + BF.icon('chat', 14) + 'Chat</button><button data-gtab="players">' + BF.icon('users', 14) + 'Players <span id="gr-pcount" class="num"></span></button><button class="gr-side-close" data-g="side" aria-label="Close panel">' + BF.icon('x', 14) + '</button></div>' +
      '<div class="gr-chat" id="gr-chat-log" role="log"></div><form class="gr-chat-form" id="gr-chat-form"><input id="gr-chat-input" maxlength="120" placeholder="Press Enter to chat" autocomplete="off" aria-label="Chat message"><button type="submit" aria-label="Send">' + BF.icon('send', 15) + '</button></form>' +
      '<div class="gr-players" id="gr-players" hidden></div></aside></div>' +
      '<div class="gr-loading" id="gr-loading"><img class="gr-load-bg" src="' + BF.thumbs.url(g) + '" alt=""><div class="gr-load-card"><img src="' + BF.thumbs.url(g) + '" alt=""><h2>' + esc(g.name) + '</h2><p class="gr-load-sub">by ' + esc(g.creator) + ' · Server #' + s.server.id + ' · ' + esc(s.server.region) + '</p><div class="gr-load-track"><i id="gr-load-bar"></i></div><p id="gr-load-step" class="gr-load-step">Finding server…</p>' +
      (g.howTo ? '<p class="gr-load-tip">' + BF.icon('info', 14) + esc(g.howTo) + '</p>' : '') + '</div></div>';
    document.getElementById('game-root').appendChild(root);
    document.body.classList.add('in-game');
    s.root = root;
    s.canvas = root.querySelector('#gr-canvas');
    s.g = s.canvas.getContext('2d');
    s.use3d = !!(s.mod.three && BF.g3d && BF.g3d.enabled());
    if (s.use3d) {
      try {
        s.g3 = BF.g3d.world({ W, H });
        s.canvas.classList.add('hud');
        s.canvas.parentNode.insertBefore(s.g3.canvas, s.canvas);
      } catch (e) {
        console.warn('[BF.runtime] 3D unavailable, using 2D', e);
        s.use3d = false;
        s.g3 = null;
      }
    }
    s.frame = root.querySelector('#gr-frame');
    s.stage = root.querySelector('#gr-stage');
    s.chatLog = root.querySelector('#gr-chat-log');
    s.feedEl = root.querySelector('#gr-feed');
    if (s.mod.feedTop != null) s.feedEl.style.top = s.mod.feedTop * 100 + '%';
    s.uiEl = root.querySelector('#gr-ui');
    s.overlay = root.querySelector('#gr-overlay');
    if (window.innerWidth < 980) root.classList.add('side-closed');

    s.onResize = () => resize();
    window.addEventListener('resize', s.onResize);
    resize();

    root.addEventListener('click', onClick);
    root.querySelector('#gr-chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = root.querySelector('#gr-chat-input');
      const text = inp.value.trim();
      inp.value = '';
      if (text) userChat(text);
      inp.blur();
    });

    s.onKey = (e) => {
      if (!s) return;
      const inChat = document.activeElement && document.activeElement.id === 'gr-chat-input';
      if (document.querySelector('.modal-scrim, .fc-scrim')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (inChat) { document.activeElement.blur(); return; }
        if (s.ended || s.loading) return;
        togglePause();
      } else if (e.key === 'Enter' && !inChat && !(document.activeElement && /^(INPUT|TEXTAREA|BUTTON)$/.test(document.activeElement.tagName))) {
        e.preventDefault();
        openSide('chat');
        root.querySelector('#gr-chat-input').focus();
      } else if (e.key === 'Tab' && !inChat) {
        e.preventDefault();
        root.classList.toggle('side-closed');
        resize();
      }
    };
    document.addEventListener('keydown', s.onKey, true);
    s.onVis = () => { if (document.hidden && s && !s.paused && !s.ended && !s.loading) togglePause(true); };
    document.addEventListener('visibilitychange', s.onVis);
  }

  function resize() {
    if (!s) return;
    const r = s.stage.getBoundingClientRect();
    const availW = Math.max(200, r.width - 16);
    const availH = Math.max(120, r.height - 40);
    let w = Math.min(availW, (availH * 16) / 9);
    w = Math.floor(w);
    const h = Math.floor((w * 9) / 16);
    s.frame.style.width = w + 'px';
    s.frame.style.height = h + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    s.canvas.width = Math.round(w * dpr);
    s.canvas.height = Math.round(h * dpr);
    s.scale = s.canvas.width / W;
    s.frame.style.setProperty('--gs', (w / W).toFixed(4));
    if (s.g3) s.g3.resize(w, h, window.devicePixelRatio || 1);
  }

  function openSide(tab) {
    s.root.classList.remove('side-closed');
    s.root.querySelectorAll('[data-gtab]').forEach((b) => b.classList.toggle('on', b.dataset.gtab === tab));
    s.root.querySelector('#gr-chat-log').hidden = tab !== 'chat';
    s.root.querySelector('#gr-chat-form').hidden = tab !== 'chat';
    s.root.querySelector('#gr-players').hidden = tab !== 'players';
    if (tab === 'players') renderPlayers();
    if (tab === 'chat') s.root.querySelector('#gr-chat-dot').hidden = true;
    resize();
  }

  function onClick(e) {
    const t = e.target.closest('[data-g], [data-gtab], [data-gact], [data-pl]');
    if (!t || !s) return;
    if (t.dataset.gtab) { openSide(t.dataset.gtab); return; }
    if (t.dataset.pl) { playerCard(t.dataset.pl); return; }
    if (t.dataset.gact) {
      if (s.uiHandler) s.uiHandler(t.dataset.gact, t, e);
      return;
    }
    const a = t.dataset.g;
    BF.sfx.play('click');
    if (a === 'leave') confirmLeave();
    else if (a === 'pause') togglePause();
    else if (a === 'side') {
      const closing = !s.root.classList.contains('side-closed');
      s.root.classList.toggle('side-closed', closing);
      if (!closing) s.root.querySelector('#gr-chat-dot').hidden = true;
      resize();
    } else if (a === 'fullscreen') {
      const el = s.root;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (el.requestFullscreen) el.requestFullscreen().then(() => setTimeout(resize, 60)).catch(() => BF.ui.toast({ title: 'Fullscreen is not available here', kind: 'info' }));
    } else if (a === 'emotes') emoteMenu(t);
    else if (a === 'resume') togglePause(false);
    else if (a === 'restart') restart();
    else if (a === 'again') restart();
    else if (a === 'exit') R.leave();
    else if (a === 'howto') howTo();
  }

  // ------------------------------------------------------------ lifecycle

  function start() {
    if (!s) return;
    const loading = s.root.querySelector('#gr-loading');
    loading.classList.add('done');
    s.timers.push(setTimeout(() => loading.remove(), 400));
    s.loading = false;
    s.input = new BF.Input(s.canvas, W, H);
    s.input.bind(s.mod.actions || {});
    buildTouch();
    s.ctx = makeCtx();
    instantiate();
    feed(BF.store.state.player.displayName + ' joined the server.', 'join', '#86e3a8');
    systemChat('You joined Server #' + s.server.id + ' (' + (s.all.length + 1) + '/' + s.server.max + ' players). Say hi!');
    const greeter = U.pick(s.active.length ? s.active : s.all);
    if (greeter) s.timers.push(setTimeout(() => botChat(greeter, BF.dialogue.line(greeter, 'greet')), 1800 + Math.random() * 2000));
    scheduleBotChat();
    scheduleBotFeed();
    s.lastT = performance.now();
    s.raf = requestAnimationFrame(frame);
    const timeLoop = () => { bankTime(false); s.timers.push(setTimeout(timeLoop, 10000)); };
    s.timers.push(setTimeout(timeLoop, 10000));
  }

  function instantiate() {
    s.ended = false;
    s.paused = false;
    s.crashed = 0;
    s.uiEl.innerHTML = '';
    s.uiHandler = null;
    s.overlay.hidden = true;
    s.ctx.time = 0;
    if (s.use3d) {
      if (s.g3 && s.g3.used) {
        s.g3.dispose();
        s.g3 = BF.g3d.world({ W, H });
        resize();
      }
      s.g3.used = true;
      s.ctx.g3 = s.g3;
    }
    try {
      s.instance = s.mod.create(s.ctx);
    } catch (e) {
      console.error('[BF.runtime] create failed', e);
      crash(e);
    }
  }

  function restart() {
    if (!s) return;
    flushRewards();
    if (s.instance && s.instance.destroy) { try { s.instance.destroy(); } catch (e) { console.error(e); } }
    s.input.clear();
    instantiate();
    BF.store.update(['progress', 'player'], (st) => {
      const pr = BF.progressFor(st, s.gameId);
      pr.plays = (pr.plays || 0) + 1;
      st.player.stats.gamesPlayed += 1;
    });
    BF.quests.track('play_game', 1, { gameId: s.gameId });
  }

  function frame(t) {
    if (!s) return;
    s.raf = requestAnimationFrame(frame);
    let dt = (t - s.lastT) / 1000;
    s.lastT = t;
    if (!(dt > 0)) return;
    if (dt > 0.05) dt = 0.05;
    const inst = s.instance;
    if (!inst) return;
    if (!s.paused && !s.ended) {
      s.ctx.time += dt;
      s.playTime += dt;
      try {
        inst.update(dt);
      } catch (e) {
        crash(e);
        return;
      }
    } else if (s.ended && inst.updateEnded) {
      try { inst.updateEnded(dt); } catch (e) { /* cosmetic */ }
    }
    const g = s.g;
    g.setTransform(s.scale, 0, 0, s.scale, 0, 0);
    try {
      if (s.g3) {
        const vdt = s.paused ? 0 : dt;
        if (inst.render3d) inst.render3d(vdt);
        if (vdt > 0 && passEffect('trail')) sparkleTrail(vdt);
        s.g3.update(vdt);
        s.g3.render();
        g.clearRect(0, 0, W, H);
        s.g3.drawOverlay(g);
        if (inst.hud) inst.hud(g);
      } else inst.draw(g);
    } catch (e) {
      crash(e);
      return;
    }
    s.input.endFrame();
    if (BF.store.state.settings.gameplay.showFps) {
      s.fpsN++;
      s.fpsT += dt;
      if (s.fpsT >= 0.5) {
        const el = s.root.querySelector('#gr-fps');
        el.hidden = false;
        el.textContent = Math.round(s.fpsN / s.fpsT) + ' FPS';
        s.fpsN = 0;
        s.fpsT = 0;
      }
    }
  }

  function crash(e) {
    console.error('[BF.runtime] game error', e);
    if (!s || s.crashedShown) return;
    s.crashedShown = true;
    s.ended = true;
    cancelAnimationFrame(s.raf);
    showOverlay('<div class="gr-panel"><h2>' + BF.icon('warning', 22) + ' Something broke</h2><p class="muted">' + esc(s.game.name) + ' hit an error and stopped: ' + esc(String(e && e.message ? e.message : e)) + '</p><div class="gr-panel-actions"><button class="btn btn-primary" data-g="exit">Leave game</button></div></div>');
  }

  function togglePause(force) {
    if (!s || s.ended || s.loading) return;
    s.paused = force == null ? !s.paused : force;
    if (s.paused) {
      s.input.clear();
      const gp = BF.store.state.settings.gameplay;
      showOverlay('<div class="gr-panel pause"><h2>' + BF.icon('pause', 20) + ' Paused</h2><p class="muted">' + esc(s.game.name) + ' · Server #' + s.server.id + '</p>' +
        '<div class="gr-menu"><button class="btn btn-play btn-lg" data-g="resume">' + BF.icon('play', 15) + 'Resume</button><button class="btn btn-outline" data-g="restart">' + BF.icon('refresh', 15) + 'Restart round</button><button class="btn btn-outline" data-g="howto">' + BF.icon('info', 15) + 'How to play</button><button class="btn btn-danger" data-g="exit">' + BF.icon('door', 15) + 'Leave game</button></div>' +
        '<div class="gr-settings"><label>Volume <input type="range" class="range" id="gr-vol" min="0" max="1" step="0.05" value="' + gp.volume + '"></label><label class="check-row"><span class="switch"><input type="checkbox" id="gr-fps-toggle"' + (gp.showFps ? ' checked' : '') + '><span></span></span>Show FPS</label><label class="check-row"><span class="switch"><input type="checkbox" id="gr-touch-toggle"' + (touchOn() ? ' checked' : '') + '><span></span></span>Touch controls</label></div></div>');
      const vol = s.overlay.querySelector('#gr-vol');
      vol.addEventListener('input', () => BF.sfx.setVolume(Number(vol.value)));
      vol.addEventListener('change', () => BF.store.update('settings', (st) => { st.settings.gameplay.volume = Number(vol.value); }));
      s.overlay.querySelector('#gr-fps-toggle').addEventListener('change', (e) => {
        BF.store.update('settings', (st) => { st.settings.gameplay.showFps = e.target.checked; });
        s.root.querySelector('#gr-fps').hidden = !e.target.checked;
      });
      s.overlay.querySelector('#gr-touch-toggle').addEventListener('change', (e) => {
        BF.store.update('settings', (st) => { st.settings.gameplay.touchControls = e.target.checked ? 'on' : 'off'; });
        buildTouch();
      });
    } else {
      hideOverlay();
    }
  }

  function showOverlay(html) {
    s.overlay.innerHTML = html;
    s.overlay.hidden = false;
  }
  function hideOverlay() {
    s.overlay.hidden = true;
    s.overlay.innerHTML = '';
  }

  function howTo() {
    const g = s.game;
    BF.ui.modal({ title: 'How to play ' + g.name, icon: 'info', body: '<p class="muted">' + esc(g.description) + '</p><div class="howto"><div class="eyebrow">Objective</div><p>' + esc(g.howTo) + '</p></div><div class="howto"><div class="eyebrow">Controls</div><p>' + esc(g.controls) + '</p></div>' + ((g.passes || []).length ? '<div class="howto"><div class="eyebrow">Game passes</div><p>' + g.passes.map((p) => esc(p.name) + (BF.passes.owns(p.id) ? ' (owned)' : '') + ': ' + esc(p.desc)).join('<br>') + '</p></div>' : '') });
  }

  async function confirmLeave() {
    if (!s) return;
    if (s.ended || s.loading) { R.leave(); return; }
    const wasPaused = s.paused;
    s.paused = true;
    const ok = await BF.ui.confirm({ title: 'Leave ' + s.game.name + '?', message: 'Rewards you already earned are kept. Progress in the current round is lost.', confirmLabel: 'Leave game', icon: 'door' });
    if (!s) return;
    if (ok) R.leave();
    else s.paused = wasPaused;
  }

  // --------------------------------------------------------------- roster

  function prepBot(b) {
    if (!b.look) b.look = BF.avatar.look(b.avatar);
    return b;
  }

  function maxActive() {
    return s.mod.maxBots != null ? s.mod.maxBots : s.game.activeBots != null ? s.game.activeBots : 6;
  }

  function syncRoster(initial) {
    const srv = BF.world.sessionServer();
    if (!srv) return;
    const ids = srv.bots.filter((id) => !BF.friends.isBlocked(id));
    s.all = ids.map((id) => BF.bots.get(id)).filter(Boolean).map(prepBot);
    if (initial) s.active = s.all.slice(0, maxActive());
    updateCount();
  }

  function updateCount() {
    if (!s) return;
    const el = s.root.querySelector('#gr-count');
    if (el) el.textContent = (s.all.length + 1) + '/' + s.server.max;
    const pc = s.root.querySelector('#gr-pcount');
    if (pc) pc.textContent = s.all.length + 1;
    if (!s.root.querySelector('#gr-players').hidden) renderPlayers();
  }

  function bindWorld() {
    s.offs.push(BF.bus.on('server:join', (ev) => {
      if (!s || ev.serverId !== s.server.id || ev.gameId !== s.gameId) return;
      if (BF.friends.isBlocked(ev.bot.id)) return;
      if (s.all.some((b) => b.id === ev.bot.id)) return;
      const bot = prepBot(ev.bot);
      s.all.push(bot);
      feed(bot.displayName + ' joined the server.', 'join', '#86e3a8');
      BF.sfx.play('join');
      if (s.active.length < maxActive() && !s.active.some((b) => b.id === bot.id)) {
        s.active.push(bot);
        if (s.instance && s.instance.onBotJoin && !s.loading) { try { s.instance.onBotJoin(bot); } catch (e) { console.error(e); } }
      }
      updateCount();
      if (Math.random() < 0.6) s.timers.push(setTimeout(() => botChat(bot, BF.dialogue.line(bot, 'join', s && s.game)), 1200 + Math.random() * 2500));
    }));
    s.offs.push(BF.bus.on('server:leave', (ev) => {
      if (!s || ev.serverId !== s.server.id || ev.gameId !== s.gameId) return;
      const bot = ev.bot;
      if (Math.random() < 0.5) botChat(bot, BF.dialogue.line(bot, 'leave', s.game));
      s.all = s.all.filter((b) => b.id !== bot.id);
      const wasActive = s.active.some((b) => b.id === bot.id);
      s.active = s.active.filter((b) => b.id !== bot.id);
      feed(bot.displayName + ' left the server.', 'leave', '#ff9d9d');
      BF.sfx.play('leave');
      if (wasActive && s.instance && s.instance.onBotLeave) { try { s.instance.onBotLeave(bot); } catch (e) { console.error(e); } }
      const bench = s.all.find((b) => !s.active.some((a) => a.id === b.id));
      if (wasActive && bench) {
        s.active.push(bench);
        if (s.instance && s.instance.onBotJoin) { try { s.instance.onBotJoin(bench); } catch (e) { console.error(e); } }
      }
      updateCount();
    }));
    s.offs.push(BF.bus.on('wallet:changed', () => {
      const el = s && s.root.querySelector('#gr-coins');
      if (el) el.textContent = U.fmt(BF.economy.balance());
    }));
  }

  function renderPlayers() {
    const el = s.root.querySelector('#gr-players');
    const me = BF.store.state;
    const row = (b) => {
      const friend = BF.friends.isFriend(b.id);
      return '<button class="gr-player" data-pl="' + b.id + '">' + BF.ui.avatarChip(b.avatar, { size: 'sm' }) + '<span class="gp-main"><span class="gp-name" style="color:' + BF.gfx.nameColor(b.username) + '">' + esc(b.displayName) + '</span><span class="gp-sub">@' + esc(b.username) + ' · Lv ' + BF.bots.level(b) + (s.active.some((x) => x.id === b.id) ? '' : ' · in lobby') + '</span></span>' + (friend ? '<span class="pill success">Friend</span>' : BF.friends.hasOutgoing(b.id) ? '<span class="pill">Sent</span>' : '') + '</button>';
    };
    el.innerHTML = '<div class="gr-player me">' + BF.ui.avatarChip(me.avatar, { size: 'sm' }) + '<span class="gp-main"><span class="gp-name">' + esc(me.player.displayName) + ' <span class="pill accent">You</span></span><span class="gp-sub">@' + esc(me.player.username) + ' · Lv ' + me.player.level + '</span></span></div>' + s.all.map(row).join('');
  }

  /** In-game player card with social actions. */
  function playerCard(botId) {
    const b = BF.bots.get(botId);
    if (!b) return;
    const pers = BF.PERSONALITIES[b.personality];
    const st = BF.bots.stats(b);
    const actions = () => {
      const F = BF.friends;
      let a = '';
      if (F.isFriend(b.id)) a += '<span class="pill success" style="height:34px;padding:0 12px">' + BF.icon('userCheck', 13) + 'Friends</span>';
      else if (F.hasIncoming(b.id)) a += '<button class="btn btn-primary btn-sm" data-pc="accept">Accept request</button>';
      else if (F.hasOutgoing(b.id)) a += '<span class="pill">Request sent</span>';
      else a += '<button class="btn btn-primary btn-sm" data-pc="add">' + BF.icon('userPlus', 14) + 'Add friend</button>';
      a += F.isFollowing(b.id) ? '<button class="btn btn-ghost btn-sm" data-pc="unfollow">Following</button>' : '<button class="btn btn-outline btn-sm" data-pc="follow">Follow</button>';
      a += '<button class="btn btn-outline btn-sm" data-pc="wave">' + BF.icon('emote', 14) + 'Wave</button><button class="btn btn-danger btn-sm" data-pc="block">Block</button>';
      return a;
    };
    const h = BF.ui.modal({
      title: b.displayName,
      wide: true,
      body: '<div class="pcard"><div class="pcard-art">' + BF.avatar.render(b.avatar, { size: 170 }) + '</div><div class="pcard-info"><div class="faint">@' + esc(b.username) + ' · Level ' + st.level + '</div><p class="muted" style="margin:8px 0">' + esc(b.bio) + '</p>' +
        '<div class="pers-chip" style="--pc:' + pers.color + '">' + BF.icon(pers.icon, 14) + '<b>' + pers.label + '</b><span class="faint">' + esc(pers.blurb) + '</span></div>' +
        '<dl class="kv" style="margin-top:12px"><div><dt>Wins</dt><dd class="num">' + U.fmt(st.wins) + '</dd></div><div><dt>Games</dt><dd class="num">' + U.fmt(st.gamesPlayed) + '</dd></div><div><dt>Followers</dt><dd class="num">' + U.compact(st.followers) + '</dd></div></dl>' +
        '<div class="pcard-actions" id="pc-actions">' + actions() + '</div>' +
        '<form class="pcard-dm" id="pc-dm"><input class="input" id="pc-dm-text" maxlength="300" placeholder="Send ' + esc(b.displayName) + ' a private message" autocomplete="off"><button class="btn btn-outline btn-sm" type="submit">' + BF.icon('send', 14) + 'Send</button></form></div></div>',
    });
    h.el.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-pc]');
      if (!btn) return;
      const k = btn.dataset.pc;
      if (k === 'add') { const r = BF.friends.sendRequest(b.id); BF.ui.toast({ title: r.ok ? 'Friend request sent to ' + b.displayName : r.error, kind: r.ok ? 'success' : 'info' }); if (r.ok) botChat(b, BF.dialogue.styleFor(b, U.pick(BF.DIALOGUE.friend[b.personality])), 1400); }
      if (k === 'accept') BF.friends.accept(b.id);
      if (k === 'follow') BF.friends.follow(b.id);
      if (k === 'unfollow') BF.friends.unfollow(b.id);
      if (k === 'wave') { chatLine('me', '*waves at ' + b.displayName + '*', { emote: true }); bubble('me', '*waves*'); botChat(b, BF.dialogue.line(b, 'greet'), 1200); h.close(); return; }
      if (k === 'block') {
        h.close();
        const ok = await BF.ui.confirm({ title: 'Block ' + b.displayName + '?', message: 'They are removed from your view in this server and cannot message you.', confirmLabel: 'Block', danger: true });
        if (ok) {
          BF.friends.block(b.id);
          s.all = s.all.filter((x) => x.id !== b.id);
          const wasActive = s.active.some((x) => x.id === b.id);
          s.active = s.active.filter((x) => x.id !== b.id);
          if (wasActive && s.instance && s.instance.onBotLeave) s.instance.onBotLeave(b);
          updateCount();
          systemChat(b.displayName + ' is blocked.');
        }
        return;
      }
      h.el.querySelector('#pc-actions').innerHTML = actions();
    });
    h.el.querySelector('#pc-dm').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = h.el.querySelector('#pc-dm-text');
      const r = BF.messages.send(b.id, inp.value);
      if (r.ok) { inp.value = ''; BF.ui.toast({ title: 'Message sent to ' + b.displayName, kind: 'success', icon: 'chat' }); }
      else BF.ui.toast({ title: r.error, kind: 'error' });
    });
  }

  // ------------------------------------------------------------ chat + feed

  function chatLine(from, text, o) {
    if (!s) return;
    o = o || {};
    const me = from === 'me';
    const name = me ? BF.store.state.player.displayName : from === 'system' ? 'Server' : from.displayName;
    const color = me ? '#ffb454' : from === 'system' ? '#8fd3ff' : BF.gfx.nameColor(from.username);
    const el = document.createElement('div');
    el.className = 'gr-msg' + (from === 'system' ? ' sys' : '') + (o.emote ? ' emote' : '');
    const vipTag = me && passEffect('vip') ? '<span class="vip-tag">VIP</span> ' : '';
    el.innerHTML = from === 'system' ? esc(text) : vipTag + '<b style="color:' + color + '">[' + esc(name) + ']:</b> ' + esc(text);
    s.lines.push({ who: me ? 'me' : from === 'system' ? 'system' : from.id, text: String(text) });
    if (s.lines.length > 60) s.lines.shift();
    s.chatLog.appendChild(el);
    while (s.chatLog.children.length > 90) s.chatLog.firstElementChild.remove();
    s.chatLog.scrollTop = s.chatLog.scrollHeight;
    if (s.root.classList.contains('side-closed') && from !== 'system') s.root.querySelector('#gr-chat-dot').hidden = false;
  }

  function systemChat(text) {
    chatLine('system', text);
  }

  function bubble(id, text) {
    if (!s) return;
    s.bubbles.set(id, { text: String(text).slice(0, 90), t: s.ctx ? s.ctx.time : 0 });
  }

  function botChat(bot, text, delay) {
    if (!s || !bot) return;
    const say = () => {
      if (!s || !s.all.some((b) => b.id === bot.id) && !s.active.some((b) => b.id === bot.id)) return;
      const clean = BF.dialogue.filter(text);
      chatLine(bot, clean);
      bubble(bot.id, clean);
      BF.sfx.play('chat');
    };
    if (delay) s.timers.push(setTimeout(say, delay));
    else say();
  }

  function scheduleBotChat() {
    const scale = { quiet: 0.45, normal: 1, lively: 1.8 }[BF.store.state.settings.gameplay.botChat] || 1;
    const delay = (4500 + Math.random() * 8000) / scale;
    s.timers.push(setTimeout(() => {
      if (!s) return;
      if (!s.paused) {
        const pool = s.active.length ? s.active : s.all;
        const bot = U.pick(pool);
        if (bot && Math.random() < BF.PERSONALITIES[bot.personality].chatty * 0.8) {
          const line = BF.dialogue.line(bot, 'idle', s.game);
          botChat(bot, line);
          // other players sometimes answer each other, like a real server
          const other = U.pick(pool.filter((b) => b.id !== bot.id));
          if (other && BF.chat.banter && Math.random() < 0.38) {
            botChat(other, BF.chat.banter(other, bot, line), 1400 + Math.random() * 2200);
            if (Math.random() < 0.3) botChat(bot, BF.chat.banter(bot, other, 'lol'), 4200 + Math.random() * 2500);
          }
        }
      }
      scheduleBotChat();
    }, delay));
  }

  /** Occasional "earned ForgeCoins" style events so the server feels alive. */
  function scheduleBotFeed() {
    s.timers.push(setTimeout(() => {
      if (!s) return;
      const bot = U.pick(s.all);
      if (bot && !s.paused) {
        const amt = U.pick([10, 15, 20, 25, 30, 40, 50]);
        feed(bot.displayName + ' earned ' + amt + ' ForgeCoins.', 'coin', '#ffd66b');
        BF.bots.progress(bot.id, { coins: amt, wins: Math.random() < 0.3 ? 1 : 0 });
      }
      scheduleBotFeed();
    }, 16000 + Math.random() * 20000));
  }

  function feed(text, kind, color) {
    if (!s) return;
    const el = document.createElement('div');
    el.className = 'gr-feed-item ' + (kind || '');
    el.innerHTML = (kind === 'coin' ? BF.coinIcon(13) : kind === 'join' ? BF.icon('userPlus', 13) : kind === 'leave' ? BF.icon('door', 13) : BF.icon(kind === 'kill' ? 'crosshair' : kind === 'star' ? 'star' : 'info', 13)) + '<span style="color:' + (color || '#e8ecf3') + '">' + esc(text) + '</span>';
    s.feedEl.appendChild(el);
    while (s.feedEl.children.length > 5) s.feedEl.firstElementChild.remove();
    s.timers.push(setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 5200));
  }

  const EMOTE_TEXT = { wave: 'waves', cheer: 'cheers', salute: 'salutes', laugh: 'laughs', spin: 'spins', flex: 'flexes', dance: 'dances', jacks: 'does jumping jacks', robot: 'does the robot', meteor: 'meteor-drops' };

  function doEmote(item) {
    const verb = EMOTE_TEXT[item.look.anim] || 'emotes';
    chatLine('me', '*' + verb + '*', { emote: true });
    bubble('me', '*' + verb + '*');
    if (s.instance && s.instance.onEmote) { try { s.instance.onEmote(item.look.anim); } catch (e) { /* optional */ } }
    const bot = U.pick(s.active.length ? s.active : s.all);
    if (bot && Math.random() < 0.6) botChat(bot, BF.dialogue.styleFor(bot, U.pick(['nice moves', 'lol', 'haha', 'love that emote', 'where did you get that emote?', 'ok ' + verb.split(' ')[0] + ' back'])), 1500);
  }

  function emoteMenu(anchor) {
    const owned = BF.ITEM_LIST.filter((i) => i.cat === 'emote' && BF.inventory.owns(i.id));
    BF.ui.menu(anchor, [{ html: '<b>Emotes</b><div class="faint" style="font-size:12px">Or type /e name in chat</div>' }].concat(owned.map((i) => ({ label: i.name, icon: 'emote', onClick: () => doEmote(i) }))).concat([{ sep: true }, { label: 'Get more emotes', icon: 'bag', onClick: () => BF.ui.toast({ title: 'Emotes are in the Avatar Shop', text: 'Leave the game and open Avatar Shop > Emotes.', kind: 'info' }) }]), { align: 'right' });
  }

  function userChat(text) {
    if (!s) return;
    if (text[0] === '/') {
      const [cmd, ...rest] = text.slice(1).split(' ');
      const arg = rest.join(' ').toLowerCase();
      if (cmd === 'e' || cmd === 'emote') {
        const owned = BF.ITEM_LIST.filter((i) => i.cat === 'emote' && BF.inventory.owns(i.id));
        const item = owned.find((i) => i.look.anim === arg || i.name.toLowerCase() === arg || i.name.toLowerCase().includes(arg));
        if (item) doEmote(item);
        else systemChat('You do not own that emote. Owned: ' + owned.map((i) => i.look.anim).join(', '));
      } else if (cmd === 'help') systemChat('Commands: /e <emote>, /players, /help. Talk to bots to give orders: "Mocha follow me", "everyone come here", "team up", "fight me", "help me", "dance".');
      else if (cmd === 'players') systemChat('Players here: You, ' + s.all.map((b) => b.displayName).join(', '));
      else systemChat('Unknown command. Try /help');
      return;
    }
    const clean = BF.dialogue.filter(text);
    chatLine('me', clean);
    bubble('me', clean);
    BF.sfx.play('chat');
    BF.store.update('player', (st) => { st.player.stats.chatSent += 1; });
    BF.quests.track('chat', 1, { gameId: s.gameId });
    if (s.instance && s.instance.onChat) { try { s.instance.onChat(clean); } catch (e) { /* optional */ } }
    const pool = s.active.concat(s.all.filter((b) => !s.active.some((a) => a.id === b.id)));
    const partner = s.partner && s.ctx && s.ctx.time - s.partner.t < 45 ? s.partner : null;
    // an instruction ("Mocha follow me", "everyone come here", "fight me") is acted on, not chatted about
    const order = BF.orders && pool.length ? BF.orders.parse(clean, pool, { partner: partner && partner.id, nearest: s.active[0] }) : null;
    if (order && giveOrder(order)) return;
    BF.chat.responders(pool, clean, { partner }).list.forEach((b, i) => botAnswer(b, clean, i));
  }

  /**
   * Hand an order to the addressed bots. Emotes and jumps work in every 3D game; other
   * verbs need the module to list them in `orders`. Returns false when nothing applied.
   */
  function giveOrder(order) {
    const mod = s.mod;
    const generic = order.verb === 'emote' || order.verb === 'jump' || order.verb === 'free';
    const supported = generic || (mod.orders || []).includes(order.verb);
    if (!supported && order.targets.length > 1) return false;
    const sess = s;
    order.targets.forEach((bot, i) => {
      const ok = supported && BF.orders.willing(bot, order);
      if (ok) {
        const now = s.ctx ? s.ctx.time : 0;
        if (order.verb === 'free') s.orders.delete(bot.id);
        else s.orders.set(bot.id, { verb: order.verb, arg: order.arg, target: order.target, t: now, until: now + BF.orders.duration(order.verb) });
        if ((order.verb === 'emote' || order.verb === 'jump') && s.g3) {
          const a = s.g3.actors.get(bot.id);
          if (a) a.rig.emote(order.verb === 'jump' ? 'jacks' : order.arg || 'dance', order.verb === 'jump' ? 1.2 : 3);
        }
        if (s.instance && s.instance.onBotOrder) { try { s.instance.onBotOrder(bot, s.orders.get(bot.id) || order); } catch (e) { console.error(e); } }
      }
      const delay = 500 + i * 700 + Math.random() * 500;
      s.timers.push(setTimeout(() => { if (s === sess) { botChat(bot, BF.orders.ack(bot, order, ok, supported)); s.partner = { id: bot.id, t: s.ctx ? s.ctx.time : 0 }; } }, delay));
    });
    return true;
  }

  /** One bot answers the player's chat line: "..." bubble, then the reply and any action. */
  function botAnswer(bot, text, order) {
    const sess = s;
    const started = Date.now();
    const delay = 450 + order * 900 + Math.random() * 600;
    s.timers.push(setTimeout(() => { if (s === sess) bubble(bot.id, '...'); }, delay));
    const mine = s.lines.filter((l) => l.who === 'me' || l.who === bot.id);
    const history = mine.slice(-9, -1).map((l) => ({ from: l.who === 'me' ? 'me' : 'bot', text: l.text }));
    BF.chat.reply(bot, text, { channel: 'game', game: s.game, audience: s.all, history }).then((r) => {
      if (s !== sess || !r || !r.text) { if (s === sess) s.bubbles.delete(bot.id); return; }
      const parts = (r.parts && r.parts.length ? r.parts : [r.text]).filter(Boolean);
      const wait = Math.max(0, delay + Math.min(3000, 600 + parts[0].length * 28) - (Date.now() - started));
      let at = wait;
      parts.forEach((p, i) => {
        if (i) at += 400 + Math.min(2200, p.length * 40) + Math.random() * 400;
        s.timers.push(setTimeout(() => {
          if (s !== sess) return;
          botChat(bot, p);
          s.partner = { id: bot.id, t: s.ctx ? s.ctx.time : 0 };
        }, at));
      });
      if (r.after) s.timers.push(setTimeout(() => { if (s === sess) { try { r.after(); } catch (e) { /* best-effort action */ } } }, at));
    }, () => {});
  }

  // --------------------------------------------------------------- rewards

  /** Sparkle Trail pass: a ribbon of glitter behind the player's rig while it moves. */
  function sparkleTrail(dt) {
    const a = s.g3.actors.get('me');
    if (!a) return;
    const p = a.rig.group.position, sc = a.rig.group.scale.x;
    const last = s.trailAt;
    s.trailAt = { x: p.x, y: p.y, z: p.z };
    if (!last || Math.hypot(p.x - last.x, p.z - last.z, p.y - last.y) < sc * 0.04) return;
    s.g3.fx.emit(p.x, p.y + sc * 0.6, p.z, { count: 2, colors: ['#ffd66b', '#ff7ad9', '#7fe7ff', '#b67cff'], speed: sc * 2, life: 0.7, size: sc * 0.35, gravity: -sc * 3, up: 0.8 });
  }

  function passEffect(effect) {
    const g = s.game;
    if (BF.passes.hasEffect(s.gameId, effect)) return true;
    return !!(g.userGame && (g.passes || []).some((p) => p.effect === effect));
  }

  function flushRewards() {
    if (!s || s.pendingCoins <= 0) return;
    const amt = Math.round(s.pendingCoins);
    const reasons = Array.from(s.pendingReasons).slice(0, 3).join(', ');
    s.pendingCoins = 0;
    s.pendingReasons.clear();
    clearTimeout(s.flushTimer);
    BF.economy.earn(amt, s.game.name + ': ' + (reasons || 'game rewards'), 'game');
    BF.store.update('player', (st) => { st.player.stats.coinsFromGames = (st.player.stats.coinsFromGames || 0) + amt; });
  }

  function bankTime(final) {
    if (!s) return;
    const secs = Math.floor(s.playTime - s.timeBank);
    if (secs <= 0 && !final) return;
    if (secs > 0) {
      s.timeBank += secs;
      BF.store.update(['player', 'progress'], (st) => {
        st.player.stats.playSeconds += secs;
        BF.progressFor(st, s.gameId).timeSec += secs;
      });
      BF.quests.track('play_seconds', secs, { gameId: s.gameId });
    }
  }

  function settle(r) {
    const g = s.game;
    const outcome = r.outcome || 'complete';
    const doubleXp = passEffect('double_xp');
    const bonus = passEffect('bonus_coins');
    const vip = passEffect('vip') ? 1.5 : 1;
    const coins = Math.max(0, Math.round((r.coins || 0) * (bonus ? 1.25 : 1) * vip));
    const eventXp = BF.updates ? BF.updates.xpMult(s.gameId) : 1;
    const xp = Math.max(0, Math.round((r.xp || 0) * (doubleXp ? 2 : 1) * vip * eventXp));
    flushRewards();
    if (coins > 0) BF.economy.earn(coins, g.name + ': ' + (r.title || (outcome === 'win' ? 'Victory' : 'Match')) + ' rewards', 'game');
    // ultra-rare finds (free, earned by finishing a game)
    if (BF.limiteds) { const found = BF.limiteds.rollDrops(g.name); if (found.length) r.found = found; }
    if (xp > 0) BF.progression.addXP(xp, 'game');
    BF.store.update(['progress', 'player'], (st) => {
      const pr = BF.progressFor(st, s.gameId);
      if (outcome === 'win') { pr.wins = (pr.wins || 0) + 1; st.player.stats.wins += 1; }
      else if (outcome === 'lose') { pr.losses = (pr.losses || 0) + 1; st.player.stats.losses += 1; }
      st.player.stats.matches += 1;
      st.player.stats.coinsFromGames = (st.player.stats.coinsFromGames || 0) + coins;
    });
    BF.quests.track('match_complete', 1, { gameId: s.gameId });
    if (outcome === 'win') BF.quests.track('win', 1, { gameId: s.gameId });
    s.sessionCoins += coins;
    s.sessionXp += xp;
    return { coins, xp, doubleXp, bonus };
  }

  function showResults(r, paid) {
    const outcome = r.outcome || 'complete';
    const title = r.title || (outcome === 'win' ? 'Victory!' : outcome === 'lose' ? 'Defeat' : outcome === 'draw' ? 'Draw' : 'Complete!');
    const cls = outcome === 'win' || outcome === 'complete' ? 'win' : outcome === 'lose' ? 'lose' : 'draw';
    BF.sfx.play(cls === 'lose' ? 'lose' : 'win');
    const stats = (r.stats || []).map((x) => '<div><span class="faint">' + esc(x[0]) + '</span><b class="num">' + esc(String(x[1])) + '</b></div>').join('');
    const badges = s.badges.splice(0).map((b) => '<span class="pill gold">' + BF.icon(b.icon || 'medal', 12) + esc(b.name) + '</span>').join('');
    showOverlay('<div class="gr-panel results ' + cls + '"><div class="res-kicker">' + esc(s.game.name) + '</div><h2 class="res-title">' + esc(title) + '</h2>' + (r.subtitle ? '<p class="muted">' + esc(r.subtitle) + '</p>' : '') +
      (r.best ? '<div class="res-best">' + BF.icon('star', 14) + esc(r.best) + '</div>' : '') +
      (stats ? '<div class="res-stats">' + stats + '</div>' : '') +
      '<div class="res-rewards"><div class="rr">' + BF.coinIcon(26) + '<b class="num">+' + U.fmt(paid.coins) + '</b><span class="faint">ForgeCoins' + (paid.bonus ? ' (+25% pass)' : '') + '</span></div><div class="rr xp">' + BF.icon('star', 24) + '<b class="num">+' + U.fmt(paid.xp) + '</b><span class="faint">XP' + (paid.doubleXp ? ' (Double XP)' : '') + '</span></div></div>' +
      (badges ? '<div class="res-badges">' + badges + '</div>' : '') +
      '<div class="gr-panel-actions"><button class="btn btn-play btn-lg" data-g="again">' + BF.icon('refresh', 16) + 'Play again</button><button class="btn btn-outline btn-lg" data-g="exit">' + BF.icon('door', 16) + 'Leave</button></div></div>');
  }

  // ------------------------------------------------------------ touch pads

  function touchOn() {
    const pref = BF.store.state.settings.gameplay.touchControls;
    if (pref === 'on') return true;
    if (pref === 'off') return false;
    try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; }
  }

  function buildTouch() {
    if (!s) return;
    const el = s.root.querySelector('#gr-touch');
    el.innerHTML = '';
    const c = s.mod.controls || {};
    if (!touchOn()) { el.hidden = true; return; }
    el.hidden = false;
    if (c.joystick !== false) {
      const joy = document.createElement('div');
      joy.className = 'gr-joy';
      joy.innerHTML = '<div class="gr-knob"></div>';
      el.appendChild(joy);
      const knob = joy.firstChild;
      let id = null;
      const move = (e) => {
        const r = joy.getBoundingClientRect();
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const max = r.width / 2;
        const l = Math.hypot(dx, dy);
        if (l > max) { dx = (dx / l) * max; dy = (dy / l) * max; }
        knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        s.input.setJoy(dx / max, dy / max, true);
      };
      joy.addEventListener('pointerdown', (e) => { id = e.pointerId; joy.setPointerCapture(id); move(e); });
      joy.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
      const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; s.input.setJoy(0, 0, false); };
      joy.addEventListener('pointerup', end);
      joy.addEventListener('pointercancel', end);
    }
    const btns = document.createElement('div');
    btns.className = 'gr-tbtns';
    (c.buttons || []).forEach((b) => {
      const btn = document.createElement('button');
      btn.className = 'gr-tbtn';
      btn.innerHTML = (b.icon ? BF.icon(b.icon, 20) : '') + '<span>' + esc(b.label) + '</span>';
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); s.input.setVirt(b.act, true); btn.classList.add('on'); });
      const up = () => { s.input.setVirt(b.act, false); btn.classList.remove('on'); };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
      btns.appendChild(btn);
    });
    el.appendChild(btns);
  }

  // ------------------------------------------------------------------- ctx

  function makeCtx() {
    const st = BF.store.state;
    const game = s.game;
    const cfg = game.config || {};
    const ctx = {
      W, H,
      game,
      gameId: s.gameId,
      server: s.server,
      config: cfg,
      difficulty: cfg.difficulty || 'normal',
      input: s.input,
      /** 3D world (BF.g3d) when the module runs in 3D, else null. */
      g3: null,
      /**
       * The order the player gave a bot in chat, or null: {verb, arg, target, t, until}.
       * Verbs: follow, come, stay, leave, ally, attack, help, race, build, pass, gather.
       */
      botOrder(botId) {
        const o = s && s.orders.get(botId);
        if (!o) return null;
        if (s.ctx && s.ctx.time > o.until) { s.orders.delete(botId); return null; }
        return o;
      },
      /** Finish an order (the bot arrived, built its tower, passed the ball...). */
      clearOrder(botId) { if (s) s.orders.delete(botId); },
      /** Pointer in world coordinates: the ground point under it in 3D (height h), the screen point in 2D. */
      pointerWorld(h) {
        const p = s.input.pointer;
        if (!s.g3) return { x: p.x, y: p.y };
        const v = s.g3.groundAt(p.x, p.y, h || 0);
        return v ? { x: v.x, y: v.z } : { x: p.x, y: p.y };
      },
      canvas: s.canvas,
      time: 0,
      mobile: touchOn(),
      player: {
        id: 'me',
        name: st.player.displayName,
        username: st.player.username,
        level: st.player.level,
        avatar: st.avatar,
        look: BF.avatar.look(st.avatar),
      },
      /** Active bot participants (array is kept up to date). */
      get bots() { return s ? s.active : []; },
      /** Every bot in the server, including those waiting in the lobby. */
      get allBots() { return s ? s.all : []; },
      botLevel: (b) => BF.bots.level(b),

      /** Persistent per-game storage (progress[gameId].custom). Call save() after mutating. */
      data: BF.progressFor(st, s.gameId).custom,
      save() { BF.store.touch('progress'); },
      progress() { return BF.progressFor(BF.store.state, s.gameId); },
      /** Record a best value. order 'max' (default) or 'min'. Returns true if improved. */
      best(stat, value, order) {
        let improved = false;
        BF.store.update('progress', (x) => {
          const pr = BF.progressFor(x, s.gameId);
          const cur = pr[stat];
          if (cur == null || (order === 'min' ? value < cur : value > cur)) { pr[stat] = value; improved = true; }
        });
        return improved;
      },
      /** Add to a per-game stat (kills, treasures, goals ...). */
      addStat(stat, n) {
        BF.store.update('progress', (x) => { const pr = BF.progressFor(x, s.gameId); pr[stat] = (pr[stat] || 0) + (n == null ? 1 : n); });
      },
      /** Add to a platform-wide player stat (kills, treasures, goals, blocksMined, petsHatched, wavesCleared, bossesDefeated, jobs, racesWon). */
      playerStat(stat, n) {
        BF.store.update('player', (x) => { x.player.stats[stat] = (x.player.stats[stat] || 0) + (n == null ? 1 : n); });
      },
      hasPass(effect) { return passEffect(effect); },
      hasItem(itemId) { return BF.inventory.owns(itemId); },
      /** Consume a banked consumable (from the game store). Returns true if one was used. */
      useConsumable(key, n) {
        const c = BF.progressFor(BF.store.state, s.gameId).custom;
        n = n || 1;
        if ((c[key] || 0) < n) return false;
        c[key] -= n;
        BF.store.touch('progress');
        return true;
      },

      /** Small in-game ForgeCoin reward (batched into one ledger entry every few seconds). */
      reward(coins, reason) {
        coins = Math.round(coins);
        if (!(coins > 0) || !s) return 0;
        if (passEffect('bonus_coins')) coins = Math.round(coins * 1.25);
        if (passEffect('vip')) coins = Math.round(coins * 1.5);
        s.pendingCoins += coins;
        if (reason) s.pendingReasons.add(reason);
        clearTimeout(s.flushTimer);
        if (s.pendingCoins >= 60) flushRewards();
        else s.flushTimer = setTimeout(flushRewards, 5000);
        BF.sfx.play('coin');
        return coins;
      },
      /** Grant XP now (Double XP passes apply). */
      xp(n) {
        n = Math.round(n * (passEffect('double_xp') ? 2 : 1) * (passEffect('vip') ? 1.5 : 1) * (BF.updates && s ? BF.updates.xpMult(s.gameId) : 1));
        if (n > 0) { BF.progression.addXP(n, 'game'); if (s) s.sessionXp += n; }
        return n;
      },
      quest(event, n) { BF.quests.track(event, n == null ? 1 : n, { gameId: s.gameId }); },
      /** Award one of this game's badges (ignored for other games, e.g. a creator game built on this template). */
      badge(id) {
        const def = BF.badges.def(id);
        if (!def || !s || (def.gameId && def.gameId !== s.gameId)) return false;
        if (BF.badges.award(id)) { s.badges.push(def); return true; }
        return false;
      },
      /** Add a collectible to the platform inventory. */
      collectible(itemId, n) {
        const it = BF.ITEMS[itemId];
        if (!it) return;
        BF.inventory.add(itemId, n || 1, s.gameId);
        feed('You found ' + it.name + '! (added to Inventory)', 'star', '#ffd66b');
        BF.sfx.play('powerup');
      },

      feed: (text, kind, color) => feed(text, kind, color),
      chat: (text) => systemChat(text),
      botSay(bot, kind, delay) {
        if (!bot) return;
        botChat(bot, BF.dialogue.line(bot, kind, s.game), delay == null ? 300 + Math.random() * 1500 : delay);
      },
      /** A bot says a specific line (styled in its own voice). */
      botText(bot, text, delay) {
        if (!bot || !text) return;
        botChat(bot, BF.dialogue.styleFor(bot, text), delay == null ? 900 + Math.random() * 900 : delay);
      },
      /** Latest chat bubble text for 'me' or a bot id (4.5s lifetime). */
      bubbleText(id) {
        const b = s && s.bubbles.get(id);
        if (!b) return null;
        if (ctx.time - b.t > 4.5 || ctx.time < b.t) { s.bubbles.delete(id); return null; }
        return b.text;
      },
      toast: (title, kind) => BF.ui.toast({ title, kind: kind || 'info' }),
      sfx: (name, o) => BF.sfx.play(name, o),
      /** Big centre banner text. */
      banner(title, sub, ms) {
        if (!s) return;
        const el = document.createElement('div');
        el.className = 'gr-banner';
        el.innerHTML = '<b>' + esc(title) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '');
        s.uiEl.appendChild(el);
        s.timers.push(setTimeout(() => el.remove(), ms || 1800));
      },
      /** Finish the round: pays rewards and shows the results screen. */
      end(r) {
        if (!s || s.ended) return;
        s.ended = true;
        s.input.clear();
        const paid = settle(r || {});
        s.timers.push(setTimeout(() => { if (s) showResults(r || {}, paid); }, r && r.delay != null ? r.delay : 900));
      },
      isEnded: () => !!(s && s.ended),
      isPaused: () => !!(s && s.paused),
      pause: () => togglePause(true),

      /** DOM overlay helpers for menus and shops inside a game. */
      ui: {
        get el() { return s.uiEl; },
        /** Create/replace a panel by id; returns the element. */
        panel(id, html, cls) {
          let el = s.uiEl.querySelector('[data-panel="' + id + '"]');
          if (!el) { el = document.createElement('div'); el.dataset.panel = id; s.uiEl.appendChild(el); }
          el.className = 'gpanel ' + (cls || '');
          el.innerHTML = html;
          return el;
        },
        remove(id) {
          const el = s && s.uiEl.querySelector('[data-panel="' + id + '"]');
          if (el) el.remove();
        },
        has(id) { return !!(s && s.uiEl.querySelector('[data-panel="' + id + '"]')); },
        clear() { if (s) s.uiEl.innerHTML = ''; },
        /** Handle clicks on [data-gact] elements: fn(action, el, event). */
        on(fn) { s.uiHandler = fn; },
      },
    };
    return ctx;
  }
})((window.BF = window.BF || {}));
