/**
 * BlockForge — Create: the Studio level editor, the Ads manager and the
 * earnings panels. Used by the creation admin panel (pages/create.js).
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const esc = U.esc;
  const tabs = (BF.creatorTabs = {});

  const coinsLabel = (n) => U.fmt(Math.round(n)) + ' ForgeCoins';

  // ------------------------------------------------------------------ earnings

  /** Earnings panel for one creation (or every creation when ug is null). */
  tabs.earnings = function (ug) {
    const series = BF.creator.series(30, ug ? ug.id : null);
    const t = ug
      ? { revenue: ug.revenue || 0, pending: ug.pending || 0, fromVisits: (ug.earn && ug.earn.visits) || 0, fromPasses: (ug.earn && ug.earn.passes) || 0, adSpend: ug.adSpend || 0, visits: ug.visits || 0, sales: ug.sales || 0 }
      : BF.creator.totals();
    const net = t.revenue - t.adSpend;
    const lastMin = series.slice(-5).reduce((a, b) => a + b.r, 0) / 5;
    return '<div class="panel earn-panel"><div class="earn-head"><h3 class="panel-title">' + BF.icon('chart', 17) + (ug ? 'Earnings' : 'Creator earnings') + '</h3><span class="faint" style="font-size:12.5px">Last 30 minutes · ' + U.fmt(Math.round(lastMin * 60)) + ' ForgeCoins/hour pace</span></div>' +
      '<div class="earn-kpis">' +
      [['Earned', BF.ui.coins(Math.floor(t.revenue))], ['From visits', BF.ui.coins(Math.floor(t.fromVisits))], ['From passes', BF.ui.coins(Math.floor(t.fromPasses)) + ' <span class="faint" style="font-size:12px">' + U.plural(t.sales, 'sale') + '</span>'], ['Ad spend', BF.ui.coins(Math.round(t.adSpend))], ['Net profit', '<b class="num ' + (net >= 0 ? 'delta-pos' : 'delta-neg') + '">' + (net >= 0 ? '+' : '−') + U.fmt(Math.abs(Math.round(net))) + '</b>']]
        .map((k) => '<div><span class="faint">' + k[0] + '</span><span class="num">' + k[1] + '</span></div>').join('') + '</div>' +
      BF.ui.barChart(series.map((b) => Math.round(b.r * 10) / 10), { h: 120, color: 'var(--gold)', labels: ['30 min ago', 'now'], fmt: (v) => U.fmt(Math.round(v)) + ' ForgeCoins', aria: 'ForgeCoins earned per minute' }) +
      '<div class="earn-legend"><span><i style="background:var(--gold)"></i>ForgeCoins earned per minute</span><span class="faint">Visitors this half hour: ' + U.fmt(series.reduce((a, b) => a + b.v, 0)) + ' (' + U.fmt(series.reduce((a, b) => a + b.a, 0)) + ' from ads)</span></div>' +
      '<div class="collect-row"><div><div class="eyebrow">Ready to collect</div>' + BF.ui.coins(Math.floor(t.pending), { cls: 'lg', size: 22 }) + '</div><button class="btn btn-gold" ' + (ug ? 'data-collect' : 'data-collect-all') + (t.pending >= 1 ? '' : ' disabled') + '>' + BF.icon('download', 15) + (ug ? 'Collect' : 'Collect all') + '</button></div></div>';
  };

  // ------------------------------------------------------------------- studio

  const ST = { id: null, layout: null, tile: null, erase: false, dirty: false, painting: false, cell: 16 };

  function studioGrid(template) {
    const spec = BF.studio.SPEC[template];
    const cell = template === 'obby' ? 16 : template === 'towerdefense' ? 34 : template === 'custom' ? 26 : 28;
    return { spec, cell, w: spec.cols * cell, h: spec.rows * cell };
  }

  function drawStudio(canvas, template) {
    const { spec, cell, w, h } = studioGrid(template);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // backdrop per template
    if (template === 'obby') { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5fb4ff'); gr.addColorStop(1, '#cfeaff'); g.fillStyle = gr; }
    else if (template === 'towerdefense') g.fillStyle = '#3e7a38';
    else if (template === 'custom') g.fillStyle = BF.studio.CUSTOM.themes[BF.studio.rules(ST.layout).theme].floor;
    else g.fillStyle = '#1b2333';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = template === 'obby' ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.08)';
    g.lineWidth = 1;
    for (let x = 0; x <= spec.cols; x++) { if (template === 'obby' && x % 10) continue; g.beginPath(); g.moveTo(x * cell + 0.5, 0); g.lineTo(x * cell + 0.5, h); g.stroke(); }
    if (template === 'obby') g.strokeStyle = 'rgba(255,255,255,.14)';
    for (let y = 0; y <= spec.rows; y++) { g.beginPath(); g.moveTo(0, y * cell + 0.5); g.lineTo(w, y * cell + 0.5); g.stroke(); }
    if (template === 'arena') { g.fillStyle = 'rgba(255,122,46,.18)'; g.fillRect(10 * cell, 5 * cell, 4 * cell, 3 * cell); g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '600 11px system-ui'; g.fillText('spawn zone', 10 * cell + 6, 6.6 * cell); }
    if (template === 'towerdefense') { g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '700 11px system-ui'; g.fillText('enemies enter', 4, 12); g.textAlign = 'right'; g.fillText('castle', w - 4, 12); g.textAlign = 'left'; }
    const m = BF.studio.cellMap(ST.layout);
    for (const [k, t] of m) {
      const [c, r] = k.split(',').map(Number);
      const info = spec.tiles[t] || { color: '#ffffff' };
      g.fillStyle = info.color;
      if (template === 'obby') { g.fillRect(c * cell, r * cell + cell * 0.25, cell, cell * 0.55); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(c * cell, r * cell + cell * 0.62, cell, cell * 0.18); }
      else if (template === 'custom' && ['coin', 'gem', 'enemy', 'key', 'heal'].includes(t)) {
        // pickups and enemies as round markers so walls read as walls
        g.beginPath(); g.arc(c * cell + cell / 2, r * cell + cell / 2, cell * (t === 'enemy' ? 0.42 : 0.3), 0, Math.PI * 2); g.fill();
        if (t === 'enemy') { g.fillStyle = '#ff3d5a'; g.fillRect(c * cell + cell * 0.3, r * cell + cell * 0.38, 3, 3); g.fillRect(c * cell + cell * 0.6, r * cell + cell * 0.38, 3, 3); }
      } else { g.fillRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2); if (template === 'towerdefense') { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(c * cell + 1, r * cell + cell - 6, cell - 2, 5); } }
      if (template === 'custom' && (t === 'start' || t === 'goal' || t === 'check')) { g.fillStyle = '#1b1b22'; g.font = '800 ' + Math.round(cell * 0.5) + 'px system-ui'; g.textAlign = 'center'; g.fillText(t === 'start' ? 'S' : t === 'goal' ? 'G' : 'C', c * cell + cell / 2, r * cell + cell * 0.68); g.textAlign = 'left'; }
      if (t === 'spin') { g.strokeStyle = '#ff3d5a'; g.lineWidth = 3; g.beginPath(); g.moveTo(c * cell, r * cell); g.lineTo(c * cell + cell, r * cell + cell); g.stroke(); g.lineWidth = 1; }
    }
    // the traced road in Tower Defense
    if (template === 'towerdefense') {
      const tr = BF.studio.tdTrace(ST.layout);
      if (tr.ok) { g.strokeStyle = 'rgba(255,255,255,.85)'; g.setLineDash([6, 5]); g.lineWidth = 2; g.beginPath(); tr.path.forEach((p, i) => { const x = (p[0] + 0.5) * cell, y = (p[1] + 0.5) * cell; if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); g.setLineDash([]); g.lineWidth = 1; }
    }
  }

  function studioStatus(root, ug) {
    const v = BF.studio.validate(ug.template, ST.layout);
    const el = root.querySelector('#studio-status');
    if (el) el.innerHTML = (v.ok ? '<span class="pill success">' + BF.icon('check', 11) + 'Ready to save</span> <span class="faint">' + esc(v.info) + '</span>' : '<span class="pill danger">' + BF.icon('warning', 11) + 'Needs work</span> ' + v.errors.map((e) => '<span class="studio-err">' + esc(e) + '</span>').join(' ')) + (ST.dirty ? ' <span class="pill info">Unsaved changes</span>' : '');
    const save = root.querySelector('[data-studio-save]');
    if (save) save.disabled = !v.ok || !ST.dirty;
  }

  /** Rules of a custom game: goal, timer, lives, speeds, theme and bots. */
  function rulesForm() {
    const r = BF.studio.rules(ST.layout), SPC = BF.studio.CUSTOM;
    const opt = (list, cur) => Object.entries(list).map(([k, v]) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(typeof v === 'string' ? v : v.label) + '</option>').join('');
    const sp = { slow: 'Slow', normal: 'Normal', fast: 'Fast' };
    return '<form class="panel studio-rules" id="studio-rules"><h3 class="panel-title">' + BF.icon('gear', 16) + 'Game rules</h3><div class="rules-grid">' +
      '<label>Goal<select class="select" name="goal">' + opt(SPC.goals, r.goal) + '</select></label>' +
      '<label>Theme<select class="select" name="theme">' + opt(SPC.themes, r.theme) + '</select></label>' +
      '<label>Time limit (seconds)<input class="input" name="time" type="number" min="30" max="900" step="10" value="' + r.time + '"></label>' +
      '<label>Lives<input class="input" name="lives" type="number" min="1" max="9" value="' + r.lives + '"></label>' +
      '<label>Player speed<select class="select" name="speed">' + opt(sp, r.speed) + '</select></label>' +
      '<label>Enemy speed<select class="select" name="enemySpeed">' + opt(sp, r.enemySpeed) + '</select></label>' +
      '<label class="check-row"><input type="checkbox" name="bots"' + (r.bots ? ' checked' : '') + '> Bots play too (they chase coins and take chat orders)</label>' +
      '</div></form>';
  }
  /** Repack cells without losing a custom game's rules. */
  const repack = (template, m) => { const rules = ST.layout && ST.layout.rules; const out = BF.studio.pack(template, m); if (rules) out.rules = rules; return out; };

  tabs.studio = {
    render(ug) {
      if (!BF.studio.supports(ug.template)) {
        return '<div class="panel notice">' + BF.icon('info', 18) + '<div><b>' + esc(BF.creator.TEMPLATES[ug.template].label) + ' levels are generated from a seed.</b><p class="faint">The Studio tile editor supports Obby, Tower Defense, Arena and Custom games. Use Settings to pick a difficulty or regenerate a fresh layout.</p></div><a class="btn btn-outline" href="#/create/' + ug.id + '/settings">' + BF.icon('gear', 14) + 'Settings</a></div>';
      }
      if (ST.id !== ug.id || !ST.layout) {
        ST.id = ug.id;
        ST.layout = ug.layout ? U.clone(ug.layout) : BF.studio.fromGenerated(ug.template, ug.seed, ug.difficulty);
        ST.dirty = !ug.layout; // a generated starting point can be saved as-is
        ST.tile = Object.keys(BF.studio.SPEC[ug.template].tiles)[0];
        ST.erase = false;
      }
      const spec = BF.studio.SPEC[ug.template];
      const palette = Object.entries(spec.tiles).map(([k, t]) => '<button type="button" class="tile-btn' + (!ST.erase && ST.tile === k ? ' on' : '') + '" data-tile="' + k + '"><i style="background:' + t.color + '"></i>' + esc(t.label) + '</button>').join('');
      const help = { obby: 'Paint platforms on the side-view grid. Players start on the Start platform and win at the Finish portal. Checkpoints are numbered left to right.', towerdefense: 'Paint one unbroken road from the left edge to the castle on the right. Towers can be built on every grass tile.', arena: 'Place cover blocks. The glowing spawn zone in the middle always stays clear.', custom: 'Build your world from above: walls, coins and gems, lava and spikes, patrolling enemies, keys and locked doors, pads, extra lives, checkpoints and a goal flag. Then choose the rules below.' }[ug.template];
      return '<div class="studio">' +
        '<div class="studio-bar panel"><div class="studio-palette">' + palette + '<button type="button" class="tile-btn' + (ST.erase ? ' on' : '') + '" data-erase>' + BF.icon('eraser', 14) + 'Erase</button></div>' +
        '<div class="studio-actions"><button class="btn btn-sm btn-ghost" data-studio-gen>' + BF.icon('refresh', 13) + 'Start from generated</button><button class="btn btn-sm btn-ghost" data-studio-clear>' + BF.icon('trash', 13) + 'Clear</button>' +
        (ug.layout ? '<button class="btn btn-sm btn-ghost" data-studio-drop>Use generated level</button>' : '') +
        '<button class="btn btn-sm btn-play" data-act="play" data-game="' + ug.id + '">' + BF.icon('play', 12) + 'Test play</button><button class="btn btn-sm btn-primary" data-studio-save>' + BF.icon('save', 13) + 'Save layout</button></div></div>' +
        '<p class="faint studio-help">' + BF.icon('brush', 13) + ' ' + esc(help) + ' Click or drag to paint; right-click erases. ' + (ug.layout ? 'This game uses your Studio layout.' : 'Until you save, the game uses its generated level.') + '</p>' +
        '<div class="studio-scroll"><canvas id="studio-canvas" class="studio-canvas"></canvas></div>' +
        '<div class="studio-status" id="studio-status"></div>' + (ug.template === 'custom' ? rulesForm() : '') + '</div>';
    },

    mount(root, ug) {
      const canvas = root.querySelector('#studio-canvas');
      if (!canvas) return;
      const redraw = () => { drawStudio(canvas, ug.template); studioStatus(root, ug); };
      redraw();
      const { spec, cell } = studioGrid(ug.template);
      const paint = (e, erase) => {
        const r = canvas.getBoundingClientRect();
        const c = Math.floor((e.clientX - r.left) / (r.width / spec.cols)), row = Math.floor((e.clientY - r.top) / (r.height / spec.rows));
        if (c < 0 || row < 0 || c >= spec.cols || row >= spec.rows) return;
        const m = BF.studio.cellMap(ST.layout);
        const k = BF.studio.key(c, row);
        const before = m.get(k);
        if (erase || ST.erase) m.delete(k);
        else {
          // only one Start in an obby: painting a new one moves it
          if (ST.tile === 'start' && before !== 'start' && !ST.painting) for (const [kk, t] of Array.from(m)) if (t === 'start') m.delete(kk);
          m.set(k, ST.tile);
        }
        if (m.get(k) === before) return;
        ST.layout = repack(ug.template, m);
        ST.dirty = true;
        redraw();
      };
      let erasing = false;
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('pointerdown', (e) => { erasing = e.button === 2; paint(e, erasing); ST.painting = true; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener('pointermove', (e) => { if (ST.painting) paint(e, erasing); });
      const up = () => { ST.painting = false; };
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      root.querySelectorAll('[data-tile]').forEach((b) => b.addEventListener('click', () => { ST.tile = b.dataset.tile; ST.erase = false; root.querySelectorAll('.tile-btn').forEach((x) => x.classList.toggle('on', x === b)); }));
      const er = root.querySelector('[data-erase]');
      if (er) er.addEventListener('click', () => { ST.erase = true; root.querySelectorAll('.tile-btn').forEach((x) => x.classList.toggle('on', x === er)); });
      root.querySelector('[data-studio-gen]').addEventListener('click', () => { ST.layout = BF.studio.fromGenerated(ug.template, ug.seed, ug.difficulty); ST.dirty = true; redraw(); });
      root.querySelector('[data-studio-clear]').addEventListener('click', () => { const rules = ST.layout && ST.layout.rules; ST.layout = BF.studio.blank(ug.template); if (rules) ST.layout.rules = rules; ST.dirty = true; redraw(); });
      const rf = root.querySelector('#studio-rules');
      if (rf) rf.addEventListener('change', () => {
        const f = new FormData(rf);
        ST.layout = Object.assign({}, ST.layout, { rules: BF.studio.rules({ rules: { goal: f.get('goal'), theme: f.get('theme'), time: f.get('time'), lives: f.get('lives'), speed: f.get('speed'), enemySpeed: f.get('enemySpeed'), bots: f.get('bots') === 'on' } }) });
        ST.dirty = true;
        redraw();
      });
      const drop = root.querySelector('[data-studio-drop]');
      if (drop) drop.addEventListener('click', async () => {
        const ok = await BF.ui.confirm({ title: 'Go back to the generated level?', message: 'Your Studio layout is removed and the game uses its seed-generated level again.', confirmLabel: 'Use generated level' });
        if (!ok) return;
        BF.creator.setLayout(ug.id, null);
        ST.layout = null;
        BF.ui.toast({ title: 'Using the generated level', kind: 'info', icon: 'refresh' });
        BF.router.refresh();
      });
      root.querySelector('[data-studio-save]').addEventListener('click', () => {
        const r = BF.creator.setLayout(ug.id, ST.layout);
        if (!r.ok) { BF.ui.toast({ title: 'Layout not saved', text: r.errors[0], kind: 'error' }); return; }
        ST.dirty = false;
        BF.sfx.play('build');
        BF.ui.toast({ title: 'Layout saved', text: 'Press Test play to try it. Published servers pick it up on the next round.', kind: 'success', icon: 'save' });
        BF.router.refresh();
      });
      // scroll the obby view to the start
      if (ug.template === 'obby') { const m = BF.studio.cellMap(ST.layout); for (const [k, t] of m) if (t === 'start') { root.querySelector('.studio-scroll').scrollLeft = Math.max(0, Number(k.split(',')[0]) * cell - 80); break; } }
    },
  };

  // ---------------------------------------------------------------------- ads

  const AD = { tier: 'boosted', placements: ['home', 'discover', 'search'], budget: 500, headline: '' };
  let adOff = null;

  function campaignRow(c) {
    const tier = BF.ads.TIERS[c.tier] || BF.ads.TIERS.standard;
    const ctr = c.impressions ? (c.clicks / c.impressions) * 100 : 0;
    const status = { active: '<span class="pill success"><span class="live-dot"></span>Running</span>', paused: '<span class="pill">Paused</span>', ended: '<span class="pill info">Finished</span>', stopped: '<span class="pill">Stopped</span>' }[c.status];
    const live = c.status === 'active' || c.status === 'paused';
    const hist = c.hist.slice(-20);
    return '<article class="campaign panel" data-campaign="' + c.id + '"><div class="cp-top"><div><b>“' + esc(c.headline) + '”</b><div class="faint" style="font-size:12px">' + tier.label + ' · ' + c.placements.map((p) => BF.ads.PLACEMENTS[p].label.split(' · ')[0]).join(', ') + ' · started ' + U.timeAgo(c.createdAt, BF.clock.now()) + '</div></div>' + status + '</div>' +
      '<div class="cp-budget"><div class="bar"><i style="width:' + Math.min(100, (c.spent / c.budget) * 100).toFixed(1) + '%"></i></div><span class="num faint">' + U.fmt(Math.round(c.spent)) + ' / ' + U.fmt(c.budget) + ' spent' + (c.refunded ? ' · ' + U.fmt(c.refunded) + ' refunded' : '') + '</span></div>' +
      '<div class="cp-stats"><div><span class="faint">Impressions</span><b class="num">' + U.fmt(c.impressions) + '</b></div><div><span class="faint">Clicks</span><b class="num">' + U.fmt(c.clicks) + '</b></div><div><span class="faint">CTR</span><b class="num">' + ctr.toFixed(2) + '%</b></div><div><span class="faint">Visits</span><b class="num">' + U.fmt(c.visits) + '</b></div><div><span class="faint">Cost / visit</span><b class="num">' + (c.visits ? (c.spent / c.visits).toFixed(2) : '—') + '</b></div></div>' +
      (hist.length > 1 ? BF.ui.barChart(hist.map((b) => b.v), { h: 60, color: 'var(--accent)', labels: ['', 'visits per minute'], aria: 'Visits per minute' }) : '') +
      (live ? '<div class="cp-actions">' + (c.status === 'active' ? '<button class="btn btn-sm btn-ghost" data-ad-pause="' + c.id + '">' + BF.icon('pause', 13) + 'Pause</button>' : '<button class="btn btn-sm btn-outline" data-ad-resume="' + c.id + '">' + BF.icon('play', 12) + 'Resume</button>') +
        '<button class="btn btn-sm btn-ghost" data-ad-topup="' + c.id + '">' + BF.icon('plus', 13) + 'Add 250</button><button class="btn btn-sm btn-ghost" data-ad-stop="' + c.id + '">' + BF.icon('x', 13) + 'Stop and refund</button></div>' : '') + '</article>';
  }

  function totalsHtml(tot) {
    return '<div><span class="faint">Running</span><b class="num">' + tot.running + '</b></div><div><span class="faint">Spent</span><b class="num">' + U.fmt(Math.round(tot.spent)) + '</b></div><div><span class="faint">Impressions</span><b class="num">' + U.fmt(tot.impressions) + '</b></div><div><span class="faint">Ad visits</span><b class="num">' + U.fmt(tot.visits) + '</b></div>';
  }

  function estimateHtml(ug) {
    const e = BF.ads.estimate(Object.assign({ gameId: ug.id }, AD));
    return '<div class="ad-est"><div><span class="faint">Impressions</span><b class="num">' + U.fmt(e.impressions) + '</b></div><div><span class="faint">Clicks</span><b class="num">≈ ' + U.fmt(e.clicks) + '</b></div><div><span class="faint">Visits</span><b class="num">≈ ' + U.fmt(e.visits) + '</b></div><div><span class="faint">Runs for</span><b class="num">≈ ' + U.plural(e.minutes, 'minute') + '</b></div><div><span class="faint">Expected earnings</span><b class="num">≈ ' + U.fmt(e.earn) + '</b></div></div>' +
      '<p class="faint" style="font-size:12px;margin-top:6px">Estimates depend on your game\'s quality: a good description, a custom thumbnail, game passes, a Studio-built level and players\' likes all raise the click rate.</p>';
  }

  tabs.ads = {
    render(ug) {
      if (!AD.headline || AD.for !== ug.id) { AD.headline = 'Play ' + ug.name + ' now!'; AD.for = ug.id; }
      const list = BF.ads.list(ug.id);
      const tot = BF.ads.totals(ug.id);
      const can = ug.published && ug.visibility !== 'private';
      const form = '<form class="panel ad-form" id="ad-form" novalidate><h3 class="panel-title">' + BF.icon('megaphone', 17) + 'New ad campaign</h3>' +
        (!can ? '<div class="notice-inline">' + BF.icon('info', 15) + ' Publish this game (public or friends only) to advertise it.</div>' : '') +
        '<div class="field"><label for="ad-headline">Headline</label><input class="input" id="ad-headline" maxlength="60" value="' + esc(AD.headline) + '"><span class="hint">Shown on the sponsored card. 16-48 characters click best.</span><span class="error" id="ad-err-headline"></span></div>' +
        '<div class="field"><span class="label">Tier</span><div class="tier-pick">' + Object.entries(BF.ads.TIERS).map(([k, t]) => '<button type="button" class="tp' + (AD.tier === k ? ' on' : '') + '" data-tier="' + k + '"><b>' + t.label + '</b><span class="faint">' + t.cpm + ' ForgeCoins per 1,000 views</span><span class="faint">' + esc(t.desc) + '</span></button>').join('') + '</div></div>' +
        '<div class="field"><span class="label">Placements</span><div class="place-pick">' + Object.entries(BF.ads.PLACEMENTS).map(([k, p]) => '<label class="check-row"><input type="checkbox" data-place="' + k + '"' + (AD.placements.includes(k) ? ' checked' : '') + '> ' + esc(p.label) + '</label>').join('') + '</div><span class="error" id="ad-err-placements"></span></div>' +
        '<div class="field"><label for="ad-budget">Budget (ForgeCoins, paid now)</label><div class="budget-row"><input class="input" id="ad-budget" type="number" min="' + BF.ads.LIMITS.minBudget + '" step="10" value="' + AD.budget + '">' + [100, 500, 2000, 10000].map((b) => '<button type="button" class="btn btn-xs btn-ghost" data-budget="' + b + '">' + U.compact(b) + '</button>').join('') + '</div><span class="hint">You have ' + coinsLabel(BF.economy.balance()) + '. Unspent budget is refunded when you stop a campaign.</span><span class="error" id="ad-err-budget"></span></div>' +
        '<div id="ad-est">' + estimateHtml(ug) + '</div><span class="error" id="ad-err-gameId"></span>' +
        '<button class="btn btn-primary btn-block" type="submit"' + (can ? '' : ' disabled') + '>' + BF.icon('megaphone', 15) + 'Launch campaign</button></form>';
      return '<div class="about-grid ads-grid"><div><div class="ad-totals panel" id="ad-totals">' + totalsHtml(tot) + '</div>' +
        '<div id="ad-list">' + (list.length ? list.map(campaignRow).join('') : BF.ui.empty({ icon: 'megaphone', title: 'No campaigns yet', text: 'Sponsored cards appear on Home, Discover and search. Players who click through visit your game and can buy its passes.' })) + '</div></div>' + form + '</div>';
    },

    mount(root, ug) {
      const form = root.querySelector('#ad-form');
      if (!form) return;
      const est = () => { const el = root.querySelector('#ad-est'); if (el) el.innerHTML = estimateHtml(ug); };
      form.querySelector('#ad-headline').addEventListener('input', (e) => { AD.headline = e.target.value; est(); });
      form.querySelector('#ad-budget').addEventListener('input', (e) => { AD.budget = Number(e.target.value) || 0; est(); });
      form.querySelectorAll('[data-budget]').forEach((b) => b.addEventListener('click', () => { AD.budget = Number(b.dataset.budget); form.querySelector('#ad-budget').value = AD.budget; est(); }));
      form.querySelectorAll('[data-tier]').forEach((b) => b.addEventListener('click', () => { AD.tier = b.dataset.tier; form.querySelectorAll('[data-tier]').forEach((x) => x.classList.toggle('on', x === b)); est(); }));
      form.querySelectorAll('[data-place]').forEach((b) => b.addEventListener('change', () => { AD.placements = Array.from(form.querySelectorAll('[data-place]:checked')).map((x) => x.dataset.place); est(); }));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        form.querySelectorAll('.error').forEach((x) => { x.textContent = ''; });
        const o = { gameId: ug.id, headline: AD.headline, tier: AD.tier, placements: AD.placements, budget: AD.budget };
        const errs = BF.ads.validate(o);
        if (Object.keys(errs).length) { for (const [k, v] of Object.entries(errs)) { const el = form.querySelector('#ad-err-' + k); if (el) el.textContent = v; } BF.sfx.play('error'); return; }
        const ok = await BF.ui.confirm({ title: 'Launch this campaign?', message: U.fmt(Math.floor(AD.budget)) + ' ForgeCoins are taken from your wallet now. Stop the campaign any time to get the unspent part back.', confirmLabel: 'Launch for ' + U.fmt(Math.floor(AD.budget)), icon: 'megaphone' });
        if (!ok) return;
        const r = BF.ads.create(o);
        if (!r.ok) { BF.ui.toast({ title: 'Campaign not started', text: Object.values(r.errors)[0], kind: 'error' }); return; }
        BF.sfx.play('purchase');
        BF.ui.toast({ title: 'Campaign live!', text: 'Your game now appears in sponsored slots.', kind: 'success', icon: 'megaphone' });
        BF.router.refresh();
      });
      root.addEventListener('click', (e) => {
        const p = e.target.closest('[data-ad-pause]'), rs = e.target.closest('[data-ad-resume]'), st = e.target.closest('[data-ad-stop]'), tu = e.target.closest('[data-ad-topup]');
        if (p) BF.ads.pause(p.dataset.adPause);
        if (rs) { const r = BF.ads.resume(rs.dataset.adResume); if (!r.ok && r.error) BF.ui.toast({ title: r.error, kind: 'error' }); }
        if (st) { const r = BF.ads.stop(st.dataset.adStop); if (r.ok) BF.ui.toast({ title: 'Campaign stopped', text: r.refund ? U.fmt(r.refund) + ' ForgeCoins refunded.' : '', kind: 'coin' }); }
        if (tu) { const r = BF.ads.topUp(tu.dataset.adTopup, 250); if (!r.ok) BF.ui.toast({ title: r.error, kind: 'error' }); }
        if (p || rs || st || tu) BF.router.refresh();
      });
      // live campaign numbers without re-rendering the form
      adOff = BF.bus.on('store:change', (keys) => {
        if (!keys.has('ads')) return;
        const list = root.querySelector('#ad-list');
        if (list) { const cs = BF.ads.list(ug.id); list.innerHTML = cs.length ? cs.map(campaignRow).join('') : list.innerHTML; }
        const tot = root.querySelector('#ad-totals');
        if (tot) tot.innerHTML = totalsHtml(BF.ads.totals(ug.id));
      });
    },

    unmount() { if (adOff) adOff(); adOff = null; },
  };
})((window.BF = window.BF || {}));
