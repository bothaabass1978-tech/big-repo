/**
 * BlockForge — shared toolkit for the arcade game modules (runner, party, tag,
 * fishing, farm, restaurant, flight, golf, spooky, quiz).
 *
 * Each of those modules is one engine with five variants; the variant comes
 * from the game's data (`config.variant`). The kit holds what they all share:
 * bot crews that walk and follow chat orders, standard rewards, and the HUD
 * pieces (panel, score board, timer, hint line) so every game looks like part
 * of one platform.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  const K = (BF.arcade = {
    /** The variant table entry for this game (falls back to the first). */
    variant(ctx, table) {
      const v = (ctx.config && ctx.config.variant) || (ctx.game && ctx.game.config && ctx.game.config.variant);
      return table[v] || table[Object.keys(table)[0]];
    },

    /** How good a bot is at games, 0-1 (its skill with a little per-round luck). */
    skill(bot, seed) {
      const r = U.rng((bot && bot.id) + ':' + (seed || ''))();
      return U.clamp((bot && bot.skill != null ? bot.skill : 0.5) * 0.8 + r * 0.25, 0.05, 1);
    },

    /**
     * Bots taking part: [{bot, x, y, a, walk, moving, score, alive, t, skill}].
     * `place(i)` returns a start {x, y}.
     */
    crew(ctx, n, place) {
      return ctx.bots.slice(0, n).map((b, i) => Object.assign({ bot: b, a: 0, walk: 0, moving: false, score: 0, alive: true, t: Math.random(), skill: K.skill(b, ctx.gameId) }, place(i)));
    },
    /** Add a late joiner to a crew (onBotJoin). */
    join(list, b, max, place, ctx) {
      if (list.length >= max || list.some((x) => x.bot.id === b.id)) return null;
      const e = Object.assign({ bot: b, a: 0, walk: 0, moving: false, score: 0, alive: true, t: 0, skill: K.skill(b, ctx && ctx.gameId) }, place(list.length));
      list.push(e);
      return e;
    },
    leave(list, b) { const i = list.findIndex((x) => x.bot.id === b.id); if (i >= 0) list.splice(i, 1); },

    /**
     * Walk `e` toward (tx, ty) at `speed`; returns the remaining distance.
     * `bounds` {x0,y0,x1,y1} clamps the position; `blocked(x, y)` rejects moves.
     */
    steer(e, tx, ty, speed, dt, bounds, blocked) {
      const dx = tx - e.x, dy = ty - e.y, l = Math.hypot(dx, dy);
      e.moving = l > 4;
      if (!e.moving) return l;
      const step = Math.min(l, speed * dt);
      const nx = e.x + (dx / l) * step, ny = e.y + (dy / l) * step;
      if (!blocked || !blocked(nx, e.y)) e.x = nx;
      if (!blocked || !blocked(e.x, ny)) e.y = ny;
      if (bounds) { e.x = U.clamp(e.x, bounds.x0, bounds.x1); e.y = U.clamp(e.y, bounds.y0, bounds.y1); }
      e.a = Math.atan2(dy, dx);
      e.walk += dt * 10;
      return l;
    },

    /** Where a bot should walk under a chat order (follow/come/stay/leave/help), or null. */
    ordered(ctx, e, me, o) {
      const g = BF.orders ? BF.orders.goal(ctx, e.bot.id, e, me, o || { near: 50 }) : null;
      if (!g) return null;
      return g.hold ? { x: e.x, y: e.y } : { x: g.x, y: g.y };
    },

    /** Player input from the joystick/keys, plus an action. */
    move(ctx, me, speed, dt, bounds, blocked) {
      const ax = ctx.input.axis();
      me.moving = Math.hypot(ax.x, ax.y) > 0.1;
      if (!me.moving) return;
      const nx = me.x + ax.x * speed * dt, ny = me.y + ax.y * speed * dt;
      if (!blocked || !blocked(nx, me.y)) me.x = nx;
      if (!blocked || !blocked(me.x, ny)) me.y = ny;
      if (bounds) { me.x = U.clamp(me.x, bounds.x0, bounds.x1); me.y = U.clamp(me.y, bounds.y0, bounds.y1); }
      me.a = Math.atan2(ax.y, ax.x);
      me.walk = (me.walk || 0) + dt * 10;
    },

    // ------------------------------------------------------------ 3D helpers

    /** Place a rig for the player or a bot, with its name tag and chat bubble. */
    rig(V, ctx, who, x, y, z, o) {
      o = o || {};
      const isMe = who === 'me';
      const id = isMe ? 'me' : who.bot.id;
      const av = isMe ? ctx.player.avatar : who.bot.avatar;
      const rig = V.actor(id, av, { scale: o.scale || 8 });
      rig.setPos(x, y || 0, z);
      if (o.a != null) rig.faceAngle(o.a);
      rig.set({ move: o.move || 0, air: !!o.air, mode: o.mode || 'idle' });
      if (o.label !== false) V.label(x, (y || 0) + (o.tag || (o.scale || 8) * 7.4), z, { name: isMe ? ctx.player.name : who.bot.displayName, color: isMe ? '#ffb454' : '#ffffff', bubble: ctx.bubbleText(id) });
      return rig;
    },

    /** Big stylised ring of flat "stadium" lights and bunting around an arena. */
    bunting(V, cx, cz, r, colors, h) {
      const items = [];
      for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; items.push({ x: cx + Math.cos(a) * r, y: h || 90, z: cz + Math.sin(a) * r, w: 10, h: 10, d: 10, color: colors[i % colors.length], rot: a }); }
      V.boxes(items, { glow: 1, shadow: false });
    },

    // ------------------------------------------------------------ HUD

    /** Top-left panel: small caption, big line, optional sub line. */
    panel(g, caption, main, sub, w) {
      w = w || 260;
      G.panel(g, 10, 10, w, sub ? 78 : 60);
      G.text(g, caption, 22, 30, { size: 12, color: '#a1abbb' });
      // long lines shrink to fit the panel
      let size = 20;
      g.font = '800 ' + size + 'px Rubik, system-ui, sans-serif';
      while (size > 12 && g.measureText(String(main)).width > w - 28) { size -= 1; g.font = '800 ' + size + 'px Rubik, system-ui, sans-serif'; }
      G.text(g, main, 22, 55, { size, weight: 800 });
      if (sub) G.text(g, sub, 22, 76, { size: 12.5, color: '#ffd66b', weight: 700 });
    },
    /** Timer at the top centre. */
    timer(g, W, sec, warnAt) {
      const s = Math.max(0, sec);
      G.panel(g, W / 2 - 52, 10, 104, 40);
      G.text(g, U.fmtClock(s), W / 2, 37, { size: 22, weight: 800, align: 'center', color: s < (warnAt || 15) ? '#ff8b98' : '#8fd3ff' });
    },
    /** Score board at the top right: rows [{n, v, me, out}] (sorted by caller or by v desc). */
    board(g, W, rows, o) {
      o = o || {};
      const list = o.sorted ? rows : rows.slice().sort((a, b) => (o.asc ? a.v - b.v : b.v - a.v));
      const show = list.slice(0, 8);
      G.panel(g, W - 214, 10, 204, 28 + show.length * 18);
      G.text(g, o.title || 'Scores', W - 202, 29, { size: 11.5, color: '#a1abbb', weight: 700 });
      show.forEach((r, i) => {
        const y = 48 + i * 18;
        G.text(g, (i + 1) + '. ' + String(r.n).slice(0, 14), W - 202, y, { size: 12, color: r.out ? '#6b7486' : r.me ? '#ffb454' : '#e8ecf3', weight: r.me ? 800 : 600 });
        G.text(g, o.fmt ? o.fmt(r.v) : String(r.v), W - 20, y, { size: 12, align: 'right', weight: 800, color: r.out ? '#6b7486' : '#e8ecf3' });
      });
    },
    /** Hint at the bottom centre. */
    hint(g, W, H, text, color) {
      if (!text) return;
      g.font = '700 14px Rubik, system-ui, sans-serif';
      const w = Math.min(W - 40, g.measureText(text).width + 36);
      G.panel(g, W / 2 - w / 2, H - 56, w, 34, 0.7);
      G.text(g, text, W / 2, H - 34, { size: 14, weight: 700, align: 'center', color: color || '#ffffff' });
    },
    /** A horizontal meter with a label. */
    meter(g, x, y, w, pct, color, label) {
      G.bar(g, x, y, w, 10, U.clamp(pct, 0, 1), color || '#3fd08a');
      if (label) G.text(g, label, x, y - 5, { size: 11.5, color: '#cfd6e3', weight: 700 });
    },

    /**
     * End the round with standard rewards.
     * @param {{win:boolean, title?:string, subtitle?:string, score?:number, place?:number, of?:number, stats?:Array, rewards:{play:number, win:number, per?:number, xpPlay:number, xpWin:number}}} r
     */
    finish(ctx, r) {
      const rw = r.rewards;
      const place = r.place ? ' · #' + r.place + (r.of ? ' of ' + r.of : '') : '';
      ctx.end({
        outcome: r.win ? 'win' : 'lose',
        title: r.title || (r.win ? 'You win!' : 'Game over'),
        subtitle: (r.subtitle || '') + place,
        coins: Math.round(rw.play + (r.win ? rw.win : 0) + (r.score || 0) * (rw.per || 0)),
        xp: rw.xpPlay + (r.win ? rw.xpWin : 0),
        stats: r.stats || [],
        delay: r.win ? 1400 : 900,
      });
    },
  });
})((window.BF = window.BF || {}));
