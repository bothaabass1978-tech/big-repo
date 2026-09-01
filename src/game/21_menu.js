// ---------------------------------------------------------------------------
// 21_menu.js — Z.Menu. DOM-based front-end: main menu, pause, settings,
// controls (key rebinding), game-over, loading.
//
// Rendered as real DOM (injected into the #ui div) rather than canvas, so
// screen readers, native focus, and text selection semantics come for free.
// All styling is injected from a single <style> tag built in JS — no
// external CSS/fonts/images/network, matching the rest of this project.
//
// Visual language deliberately mirrors a 2008-era console shooter menu
// (think WaW/CoD4), NOT a web page: black backgrounds, one desaturated
// blood-red accent, hard edges (no border-radius, no gradient chrome, no
// drop-shadow "cards"), small-caps condensed labels, a chevron+block
// selection marker instead of a highlight pill, and segmented tick bars
// for sliders instead of smooth range inputs.
//
// Every user-facing string is routed through t(id) so a future Z.Loc module
// can be dropped in without touching markup/logic (see STR table below).
// ---------------------------------------------------------------------------
(function () {
  const Me = {};
  Z.Menu = Me;
  const M = Z.M;

  // ===========================================================================
  // Palette / type — kept close to Z.HUD's language so HUD <-> menu feels
  // like one game, not two art styles bolted together.
  // ===========================================================================
  const FONT_DISPLAY = '"Impact","Haettenschweiler","Arial Narrow Bold",sans-serif';
  const FONT_MONO = '"Consolas","Courier New",monospace';
  const COL = {
    bg: '#060402',
    accent: '#8b1a12',      // dried blood red — the ONE accent colour
    accentBright: '#b81c1c',
    titleBase: '#7a1810',
    textDim: '#a89d84',
    textBright: '#f0ead8',
    warn: '#c92a20',
    divider: 'rgba(255,255,255,0.09)',
    barEmpty: 'rgba(255,255,255,0.16)',
    ember: '#ff7a30',
  };

  const STORAGE_KEY = 'ndu_settings_v1';

  // ===========================================================================
  // Minimal self-contained string table. Every user-facing string routes
  // through t(id) so a real Z.Loc module can be substituted later without
  // touching any markup/logic below.
  // ===========================================================================
  const STR = {
    title: 'NACHT DER UNTOTEN',
    play: 'PLAY', settings: 'SETTINGS', controls: 'CONTROLS',
    resume: 'RESUME', restart: 'RESTART', quitToMenu: 'QUIT TO MAIN MENU',
    mainMenu: 'MAIN MENU', back: 'BACK', paused: 'PAUSED',
    resetDefaults: 'RESET TO DEFAULTS', pressAKey: 'PRESS A KEY…',
    roundReached: 'ROUND REACHED',
    statKills: 'KILLS', statHeadshots: 'HEADSHOTS', statAccuracy: 'ACCURACY',
    statShots: 'BULLETS FIRED', statPoints: 'POINTS EARNED',
    statTime: 'TIME SURVIVED', statDowns: 'DOWNS',
    on: 'ON', off: 'OFF',
    qLow: 'LOW', qMed: 'MEDIUM', qHigh: 'HIGH',
    sensitivity: 'MOUSE SENSITIVITY', adsSens: 'ADS SENSITIVITY',
    fov: 'FIELD OF VIEW', invertY: 'INVERT LOOK Y',
    volMaster: 'MASTER VOLUME', volSfx: 'EFFECTS VOLUME',
    volMusic: 'MUSIC VOLUME', volAmbient: 'AMBIENT VOLUME',
    grain: 'FILM GRAIN', aberration: 'CHROMATIC ABERRATION', blood: 'GORE LEVEL',
    crosshair: 'CROSSHAIR', showFps: 'SHOW FRAMERATE', quality: 'VIDEO QUALITY',
    toggleAds: 'AIM DOWN SIGHTS', toggleCrouch: 'CROUCH',
    hintNav: '▲▼ SELECT    ENTER CHOOSE    ESC BACK',
    hintAdj: '▲▼ SELECT    ◄► ADJUST    ENTER CHOOSE    ESC BACK',
    hintBind: 'ENTER TO REBIND    ESC CANCEL',
    loading: 'LOADING…',
  };
  function t(id) {
    if (Z.Loc && typeof Z.Loc.t === 'function') {
      const v = Z.Loc.t(id);
      if (v != null) return v;
    }
    return STR[id] != null ? STR[id] : id;
  }

  // ===========================================================================
  // Bindable actions — labels shown on the CONTROLS screen. Falls back to an
  // auto-generated label for any action Z.Input defines that we don't know
  // about, so this never silently drops a bindable action.
  // ===========================================================================
  const ACTION_LABELS = {
    forward: 'MOVE FORWARD', back: 'MOVE BACK', left: 'STRAFE LEFT', right: 'STRAFE RIGHT',
    jump: 'JUMP', crouch: 'CROUCH', sprint: 'SPRINT', use: 'USE / BUY / REPAIR',
    reload: 'RELOAD', melee: 'MELEE', grenade: 'GRENADE', swap: 'SWITCH WEAPON',
    pause: 'PAUSE MENU', scores: 'SCOREBOARD',
  };
  function actionLabel(id) {
    return ACTION_LABELS[id] || String(id).replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
  }
  function actionOrder() {
    const src = (Z.Input && Z.Input.binds) || {};
    const known = Object.keys(ACTION_LABELS).filter((k) => Object.prototype.hasOwnProperty.call(src, k));
    const rest = Object.keys(src).filter((k) => known.indexOf(k) < 0);
    return known.concat(rest);
  }

  // Factory bind map captured once at module load, BEFORE any rebinding can
  // mutate Z.Input.binds — this is the true "reset to defaults" target.
  function cloneBinds(src) {
    const out = {};
    for (const k in src) out[k] = src[k].slice();
    return out;
  }
  const FACTORY_BINDS = cloneBinds((Z.Input && Z.Input.binds) || {});

  // ===========================================================================
  // Settings — defaults, load/save. Never throws even if localStorage is
  // unavailable (private browsing, sandboxed iframe, etc).
  // ===========================================================================
  function defaultSettings() {
    return {
      sensitivity: 1.0, adsSensScale: 0.75, fov: 65, invertY: false,
      volMaster: 1, volSfx: 1, volMusic: 1, volAmbient: 1,
      grain: 0.4, aberration: 0.15, blood: 1, crosshair: true,
      showFps: false, quality: 'medium',
      toggleAds: false, toggleCrouch: false,
      binds: cloneBinds(FACTORY_BINDS),
    };
  }

  function loadSettings() {
    const d = defaultSettings();
    try {
      const raw = window.localStorage && localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (const k in d) {
            if (k === 'binds') continue;
            if (Object.prototype.hasOwnProperty.call(parsed, k) && typeof parsed[k] === typeof d[k]) d[k] = parsed[k];
          }
          if (parsed.binds && typeof parsed.binds === 'object') {
            for (const k in d.binds) {
              if (Array.isArray(parsed.binds[k]) && parsed.binds[k].length) d.binds[k] = parsed.binds[k].slice();
            }
          }
        }
      }
    } catch (e) { /* private mode / storage disabled — fall back to defaults */ }
    return d;
  }

  function persist() {
    try {
      if (window.localStorage) localStorage.setItem(STORAGE_KEY, JSON.stringify(Me.settings));
    } catch (e) { /* ignore — nothing we can do */ }
  }

  // ===========================================================================
  // Module state
  // ===========================================================================
  let rootEl = null;
  let callbacks = {};
  let built = false;
  let wrap = null;                 // our own top-level element inside rootEl
  const screenEls = {};            // name -> element
  const screenRows = {};           // name -> [rowDescriptor]
  const selIndex = { main: 0, pause: 0, settings: 0, controls: 0, gameover: 0 };
  let screenStack = [];
  let listening = null;            // bind row currently capturing a keypress
  let rafId = 0;
  let reducedMotion = false;
  let goRevealing = false;         // true while the game-over stat stagger plays
  let lastStats = {};

  Me.visible = false;
  Me.currentScreen = null;
  Me.settings = null;              // assigned in init()

  // ===========================================================================
  // Small DOM helpers
  // ===========================================================================
  function el(tag, cls, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(e, str) { e.textContent = str; return e; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function sfx(name) {
    try { if (Z.Audio && Z.Audio.ready && Z.Audio.play) Z.Audio.play(name); } catch (e) { /* never let a UI sound crash the menu */ }
  }

  // ===========================================================================
  // Stylesheet — injected once. Everything below is deliberately hard-edged:
  // no border-radius, no gradients used as chrome, no drop-shadows on panels.
  // ===========================================================================
  function buildCSS() {
    return '' +
    '.wa-menu, .wa-menu *{ box-sizing:border-box; border-radius:0 !important; }\n' +
    // NOTE: no background here on purpose — each screen sets its own (opaque
    // for main/settings/controls/gameover/loading, translucent for pause) so
    // the pause screen can actually let the game canvases dim through it.
    '.wa-menu{ position:absolute; inset:0; overflow:hidden; background:transparent; color:' + COL.textDim + ';\n' +
    '  font-family:' + FONT_MONO + '; -webkit-user-select:none; user-select:none; }\n' +
    '.wa-menu.is-hidden{ display:none; }\n' +
    '.wa-menu__screen{ position:absolute; inset:0; display:none; flex-direction:column; }\n' +
    '.wa-menu__screen.is-active{ display:flex; }\n' +
    '.wa-menu__screen--pause{ background:rgba(4,3,2,0.74); }\n' +
    '.wa-menu__screen--main,.wa-menu__screen--settings,.wa-menu__screen--controls,\n' +
    '.wa-menu__screen--gameover,.wa-menu__screen--loading{ background:' + COL.bg + '; }\n' +

    // grain overlay — generated noise tile, animated by stepping the offset.
    // Deliberately NOT blended with mix-blend-mode:overlay — on a near-black
    // backdrop that mode collapses to invisible; plain alpha compositing is
    // what actually reads as film grain over a dark scene.
    '.wa-menu__grain{ position:absolute; inset:-4px; pointer-events:none; opacity:0.4;\n' +
    '  background-repeat:repeat; image-rendering:pixelated;\n' +
    '  animation:waGrain 0.5s steps(1) infinite; z-index:5; }\n' +
    '@keyframes waGrain{ 0%{background-position:0 0;} 25%{background-position:-37px 19px;}\n' +
    '  50%{background-position:23px -41px;} 75%{background-position:-19px -13px;} 100%{background-position:0 0;} }\n' +

    // embers
    '.wa-menu__embers{ position:absolute; inset:0; pointer-events:none; overflow:hidden; z-index:1; }\n' +
    '.wa-ember{ position:absolute; bottom:-4%; width:3px; height:3px; background:' + COL.ember + ';\n' +
    '  transform:rotate(45deg); box-shadow:0 0 4px 1px rgba(255,122,48,0.65);\n' +
    '  animation-name:waEmberRise; animation-timing-function:linear; animation-iteration-count:infinite; }\n' +
    '@keyframes waEmberRise{ 0%{ transform:translate(0,0) rotate(45deg); opacity:0; }\n' +
    '  8%{ opacity:0.9; } 92%{ opacity:0.5; }\n' +
    '  100%{ transform:translate(var(--wa-drift,14px),-112vh) rotate(45deg); opacity:0; } }\n' +

    // title
    '.wa-menu__hero{ position:relative; z-index:2; padding-top:9vh; text-align:center; }\n' +
    // JS-scaled fit wrapper: guarantees the title never wraps or overflows at
    // any viewport width (800x600 up through 4K) — see fitTitle().
    '.wa-menu__titlefit{ display:inline-block; max-width:100%; }\n' +
    '.wa-menu__title{ font-family:' + FONT_DISPLAY + '; font-weight:900; letter-spacing:0.14em;\n' +
    '  font-size:clamp(2.2rem, 7.6vw, 6.2rem); color:' + COL.titleBase + '; white-space:nowrap;\n' +
    '  filter:contrast(1.15) saturate(0.72); margin:0; line-height:1;\n' +
    '  text-shadow: 2px 0 0 rgba(139,26,18,0.45), -2px 1px 0 rgba(60,8,6,0.55), 0 4px 0 rgba(0,0,0,0.7);\n' +
    '  animation:waTitleDrift 16s ease-in-out infinite alternate; }\n' +
    '@keyframes waTitleDrift{ 0%{ transform:translate(0,0) scale(1); } 100%{ transform:translate(3px,-2px) scale(1.006); } }\n' +
    '.wa-menu__title span:nth-child(3n){ display:inline-block; transform:translateY(-2px) rotate(-0.6deg); }\n' +
    '.wa-menu__title span:nth-child(5n){ display:inline-block; transform:translateY(1px) rotate(0.5deg); }\n' +
    '.wa-menu__subtitle{ margin-top:1.1em; font-family:' + FONT_DISPLAY + '; letter-spacing:0.5em;\n' +
    '  font-size:clamp(0.55rem,1.1vw,0.85rem); color:' + COL.textDim + '; opacity:0.65; }\n' +

    // generic vertical list
    '.wa-menu__list{ position:relative; z-index:2; margin:0 auto; width:min(92vw, 30rem); }\n' +
    '.wa-menu__list--main{ margin-top:7vh; }\n' +
    '.wa-menu__panel{ position:relative; z-index:2; width:min(94vw, 40rem); margin:6vh auto 0; flex:1 1 auto;\n' +
    '  display:flex; flex-direction:column; min-height:0; }\n' +
    '.wa-menu__heading{ font-family:' + FONT_DISPLAY + '; letter-spacing:0.22em; font-weight:700;\n' +
    '  font-size:clamp(1.3rem,3.4vw,2.1rem); color:' + COL.textBright + '; text-align:left;\n' +
    '  border-bottom:2px solid ' + COL.accent + '; padding-bottom:0.5em; margin-bottom:0.4em; }\n' +
    '.wa-menu__rows{ overflow-y:auto; flex:1 1 auto; min-height:0; }\n' +
    '.wa-menu__rows::-webkit-scrollbar{ width:6px; }\n' +
    '.wa-menu__rows::-webkit-scrollbar-thumb{ background:' + COL.accent + '; }\n' +
    '.wa-menu__rows::-webkit-scrollbar-track{ background:rgba(255,255,255,0.05); }\n' +

    // rows
    '.wa-row{ position:relative; display:flex; align-items:center; justify-content:space-between;\n' +
    '  padding:0.62em 0.2em 0.62em 1.9em; border-bottom:1px solid ' + COL.divider + ';\n' +
    '  font-family:' + FONT_DISPLAY + '; letter-spacing:0.06em; cursor:pointer; outline:none; }\n' +
    '.wa-row:last-child{ border-bottom:none; }\n' +
    '.wa-row__mark{ position:absolute; left:0.15em; top:50%; transform:translateY(-50%);\n' +
    '  display:flex; align-items:center; gap:0.35em; visibility:hidden; }\n' +
    '.wa-row.is-selected .wa-row__mark{ visibility:visible; }\n' +
    '.wa-row__chev{ width:0; height:0; border-top:0.42em solid transparent; border-bottom:0.42em solid transparent;\n' +
    '  border-left:0.55em solid ' + COL.accentBright + '; }\n' +
    '.wa-row__block{ width:4px; align-self:stretch; background:' + COL.accentBright + '; }\n' +
    '.wa-row__label{ font-size:clamp(0.78rem,1.7vw,1.05rem); color:' + COL.textDim + '; text-align:left; }\n' +
    '.wa-row.is-selected .wa-row__label{ color:' + COL.textBright + '; }\n' +
    '.wa-row.is-warn .wa-row__label{ color:#8a4b45; }\n' +
    '.wa-row.is-warn.is-selected .wa-row__label{ color:' + COL.warn + '; }\n' +
    '.wa-row__value{ font-family:' + FONT_MONO + '; font-size:clamp(0.72rem,1.5vw,0.95rem);\n' +
    '  color:' + COL.textDim + '; text-align:right; white-space:nowrap; margin-left:1em; }\n' +
    '.wa-row.is-selected .wa-row__value{ color:' + COL.accentBright + '; }\n' +
    '.wa-row__valwrap{ display:flex; align-items:center; gap:0.8em; }\n' +

    // segmented slider bar
    '.wa-bar{ display:flex; gap:2px; width:9em; height:0.85em; touch-action:none; }\n' +
    '.wa-bar__tick{ flex:1 1 0; background:' + COL.barEmpty + '; }\n' +
    '.wa-bar__tick.is-filled{ background:' + COL.accent + '; }\n' +
    '.wa-row.is-selected .wa-bar__tick.is-filled{ background:' + COL.accentBright + '; }\n' +

    // bind badge
    '.wa-key{ font-family:' + FONT_MONO + '; font-size:clamp(0.68rem,1.4vw,0.85rem); color:' + COL.textBright + ';\n' +
    '  border:1px solid ' + COL.divider + '; padding:0.15em 0.55em; min-width:2.4em; text-align:center; }\n' +
    '.wa-row.is-listening .wa-key{ border-color:' + COL.accentBright + '; color:' + COL.accentBright + '; animation:waBlink 0.85s steps(1) infinite; }\n' +
    '@keyframes waBlink{ 50%{ opacity:0.25; } }\n' +

    '.wa-menu__hints{ position:relative; z-index:2; text-align:center; padding:1.1em 0 1.6em;\n' +
    '  font-family:' + FONT_MONO + '; font-size:clamp(0.6rem,1.2vw,0.78rem); letter-spacing:0.12em;\n' +
    '  color:' + COL.textDim + '; opacity:0.7; }\n' +

    // loading
    '.wa-menu__load{ position:relative; z-index:2; margin:auto; text-align:center; width:min(80vw,34rem); }\n' +
    '.wa-menu__loadlabel{ font-family:' + FONT_DISPLAY + '; letter-spacing:0.18em; color:' + COL.textDim + ';\n' +
    '  font-size:clamp(0.8rem,1.8vw,1.1rem); margin-bottom:0.8em; }\n' +
    '.wa-loadbar{ display:flex; gap:3px; height:1.1em; }\n' +
    '.wa-loadbar__seg{ flex:1 1 0; background:' + COL.barEmpty + '; }\n' +
    '.wa-loadbar__seg.is-filled{ background:' + COL.accent + '; }\n' +
    '.wa-menu__loadpct{ margin-top:0.6em; font-family:' + FONT_MONO + '; font-size:clamp(1rem,2.4vw,1.5rem); color:' + COL.textBright + '; }\n' +

    // gameover
    '.wa-go__round{ position:relative; z-index:2; text-align:center; margin-top:8vh; }\n' +
    '.wa-go__roundlabel{ font-family:' + FONT_DISPLAY + '; letter-spacing:0.3em; color:' + COL.textDim + ';\n' +
    '  font-size:clamp(0.7rem,1.6vw,1rem); }\n' +
    '.wa-go__roundnum{ font-family:' + FONT_MONO + '; font-weight:700; color:' + COL.accentBright + ';\n' +
    '  font-size:clamp(3.4rem,11vw,7.5rem); line-height:1; }\n' +
    '.wa-go__stats{ position:relative; z-index:2; width:min(90vw,36rem); margin:4vh auto 0; }\n' +
    '.wa-stat-line{ display:flex; justify-content:space-between; padding:0.35em 0;\n' +
    '  font-family:' + FONT_DISPLAY + '; letter-spacing:0.08em; font-size:clamp(0.75rem,1.6vw,1rem);\n' +
    '  color:' + COL.textDim + '; opacity:0; animation:waLineIn 0.4s ease-out forwards;\n' +
    '  animation-delay:calc(var(--i,0) * 0.35s); }\n' +
    '.wa-stat-line__val{ font-family:' + FONT_MONO + '; color:' + COL.textBright + '; }\n' +
    '@keyframes waLineIn{ from{ opacity:0; transform:translateY(6px);} to{ opacity:1; transform:translateY(0);} }\n' +
    '.wa-menu--skip .wa-stat-line{ animation-duration:0.001s !important; animation-delay:0s !important; }\n' +
    // The RESTART / MAIN MENU choice stays hidden (and non-interactive) until
    // the stat stagger finishes, so the "cold reveal" can't be short-circuited
    // by mashing Enter — see revealGameoverActions().
    '.wa-go__actions{ position:relative; z-index:2; width:min(70vw,22rem); margin:5vh auto 0;\n' +
    '  opacity:0; pointer-events:none; transition:opacity 0.35s ease-out; }\n' +
    '.wa-go__actions.is-revealed{ opacity:1; pointer-events:auto; }\n' +
    '.wa-menu--rm .wa-go__actions{ transition:none; }\n' +

    // focus ring — hard edged, not a soft glow
    '.wa-row:focus-visible{ outline:2px solid ' + COL.accentBright + '; outline-offset:-2px; }\n' +

    // reduced motion
    '.wa-menu--rm .wa-menu__title,.wa-menu--rm .wa-menu__grain,.wa-menu--rm .wa-ember{ animation:none !important; }\n' +
    '.wa-menu--rm .wa-stat-line{ animation-duration:0.001s !important; animation-delay:0s !important; }\n' +
    '';
  }

  // ===========================================================================
  // Noise texture — generated once on a small canvas, used as the grain tile.
  // ===========================================================================
  function buildGrainDataUrl() {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 96;
    const x = c.getContext('2d');
    const img = x.createImageData(96, 96);
    const rng = Z.RNG.make(Z.ART_SEED ^ 0x9A21);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rng.i(256);
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
      img.data[i + 3] = rng.i(90);
    }
    x.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  // ===========================================================================
  // Row descriptor helpers
  // ===========================================================================
  function refreshRowValue(row) {
    if (!row.dom) return;
    if (row.type === 'slider') {
      const frac = clamp((row.get() - row.min) / (row.max - row.min), 0, 1);
      const ticks = row.dom.ticks;
      const filled = Math.round(frac * ticks.length);
      for (let i = 0; i < ticks.length; i++) ticks[i].classList.toggle('is-filled', i < filled);
      text(row.dom.val, row.fmt(row.get()));
    } else if (row.type === 'toggle') {
      text(row.dom.val, row.get() ? t('on') : t('off'));
    } else if (row.type === 'enum') {
      const cur = row.options.find((o) => o.value === row.get()) || row.options[0];
      text(row.dom.val, cur ? cur.label : '');
    } else if (row.type === 'bind') {
      const codes = (Me.settings.binds[row.action] || []);
      text(row.dom.val, codes.length ? codes.map(codeToLabel).join(' / ') : '—');
    }
  }

  function codeToLabel(code) {
    if (!code) return '—';
    const map = {
      ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
      Space: 'SPACE', ShiftLeft: 'L SHIFT', ShiftRight: 'R SHIFT',
      ControlLeft: 'L CTRL', ControlRight: 'R CTRL', AltLeft: 'L ALT', AltRight: 'R ALT',
      Tab: 'TAB', Escape: 'ESC', Enter: 'ENTER', Backquote: '`', CapsLock: 'CAPS',
    };
    if (map[code]) return map[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad/.test(code)) return 'NUM' + code.slice(6);
    if (/^Mouse\d+$/.test(code)) return 'M' + code.slice(5);
    return code.toUpperCase();
  }

  function fmtPct(v) { return Math.round(v * 100) + '%'; }
  function fmt2(v) { return v.toFixed(2); }
  function fmtInt(v) { return String(Math.round(v)); }

  // ===========================================================================
  // Row builders — build the DOM once per row, wire input handlers.
  // ===========================================================================
  function buildRow(container, screenName, row, index) {
    const r = el('div', 'wa-row' + (row.warn ? ' is-warn' : ''), container);
    r.tabIndex = -1;
    r.setAttribute('role', 'menuitem');
    r.dataset.row = row.id;

    const mark = el('div', 'wa-row__mark', r);
    el('div', 'wa-row__chev', mark);
    const label = el('div', 'wa-row__label', r);
    text(label, row.label);

    let valWrap = null, valEl = null, ticks = [];
    if (row.type !== 'action') {
      valWrap = el('div', 'wa-row__valwrap', r);
      if (row.type === 'slider') {
        const bar = el('div', 'wa-bar', valWrap);
        for (let i = 0; i < 20; i++) ticks.push(el('div', 'wa-bar__tick', bar));
        valEl = el('div', 'wa-row__value', valWrap);
        wireSliderDrag(bar, row);
      } else if (row.type === 'bind') {
        valEl = el('div', 'wa-key', valWrap);
      } else {
        valEl = el('div', 'wa-row__value', valWrap);
      }
    }
    row.dom = { root: r, label: label, val: valEl, ticks: ticks };

    r.addEventListener('mouseenter', function () { selectIndex(screenName, index, false); });
    r.addEventListener('click', function () {
      selectIndex(screenName, index, false);
      activateSelected(screenName);
    });
    r.addEventListener('focus', function () { selectIndex(screenName, index, false); });

    refreshRowValue(row);
    return r;
  }

  function wireSliderDrag(bar, row) {
    let dragging = false;
    function setFromClientX(cx) {
      const rect = bar.getBoundingClientRect();
      const frac = clamp((cx - rect.left) / Math.max(1, rect.width), 0, 1);
      let v = row.min + frac * (row.max - row.min);
      if (row.step) v = Math.round(v / row.step) * row.step;
      v = clamp(v, row.min, row.max);
      if (v !== row.get()) { row.set(v); refreshRowValue(row); onSettingsChanged(); }
    }
    bar.addEventListener('pointerdown', function (e) {
      dragging = true;
      try { bar.setPointerCapture(e.pointerId); } catch (err) { /* jsdom/harness safe */ }
      setFromClientX(e.clientX);
      e.stopPropagation();
    });
    bar.addEventListener('pointermove', function (e) { if (dragging) { setFromClientX(e.clientX); e.stopPropagation(); } });
    bar.addEventListener('pointerup', function (e) { dragging = false; e.stopPropagation(); });
    bar.addEventListener('click', function (e) { e.stopPropagation(); });
  }

  // ===========================================================================
  // Screen row definitions — built fresh each ensureBuilt() call so closures
  // always read/write the live Me.settings object.
  // ===========================================================================
  function makeMainRows() {
    return [
      { id: 'play', type: 'action', label: t('play'), run: function () { sfx('ui_click'); safeCb('onStart', Me.settings); } },
      { id: 'settings', type: 'action', label: t('settings'), run: function () { sfx('ui_click'); pushScreen('settings'); } },
      { id: 'controls', type: 'action', label: t('controls'), run: function () { sfx('ui_click'); pushScreen('controls'); } },
    ];
  }
  function makePauseRows() {
    return [
      { id: 'resume', type: 'action', label: t('resume'), run: function () { sfx('ui_click'); safeCb('onResume'); } },
      { id: 'restart', type: 'action', label: t('restart'), run: function () { sfx('ui_click'); safeCb('onRestart'); } },
      { id: 'settings', type: 'action', label: t('settings'), run: function () { sfx('ui_click'); pushScreen('settings'); } },
      { id: 'controls', type: 'action', label: t('controls'), run: function () { sfx('ui_click'); pushScreen('controls'); } },
      { id: 'quit', type: 'action', label: t('quitToMenu'), warn: true, run: function () { sfx('ui_back'); safeCb('onQuit'); } },
    ];
  }
  function makeGameoverRows() {
    return [
      { id: 'restart', type: 'action', label: t('restart'), run: function () { sfx('ui_click'); safeCb('onRestart'); } },
      { id: 'mainmenu', type: 'action', label: t('mainMenu'), run: function () { sfx('ui_back'); safeCb('onQuit'); } },
    ];
  }
  function makeSettingsRows() {
    const s = Me.settings;
    return [
      { id: 'sensitivity', type: 'slider', label: t('sensitivity'), min: 0.1, max: 4.0, step: 0.05, fmt: fmt2,
        get: () => s.sensitivity, set: (v) => { s.sensitivity = v; } },
      { id: 'adsSensScale', type: 'slider', label: t('adsSens'), min: 0.1, max: 1.0, step: 0.05, fmt: fmt2,
        get: () => s.adsSensScale, set: (v) => { s.adsSensScale = v; } },
      { id: 'fov', type: 'slider', label: t('fov'), min: 65, max: 110, step: 1, fmt: fmtInt,
        get: () => s.fov, set: (v) => { s.fov = v; } },
      { id: 'invertY', type: 'toggle', label: t('invertY'), get: () => s.invertY, set: (v) => { s.invertY = v; } },
      { id: 'volMaster', type: 'slider', label: t('volMaster'), min: 0, max: 1, step: 0.05, fmt: fmtPct,
        get: () => s.volMaster, set: (v) => { s.volMaster = v; } },
      { id: 'volSfx', type: 'slider', label: t('volSfx'), min: 0, max: 1, step: 0.05, fmt: fmtPct,
        get: () => s.volSfx, set: (v) => { s.volSfx = v; } },
      { id: 'volMusic', type: 'slider', label: t('volMusic'), min: 0, max: 1, step: 0.05, fmt: fmtPct,
        get: () => s.volMusic, set: (v) => { s.volMusic = v; } },
      { id: 'volAmbient', type: 'slider', label: t('volAmbient'), min: 0, max: 1, step: 0.05, fmt: fmtPct,
        get: () => s.volAmbient, set: (v) => { s.volAmbient = v; } },
      { id: 'grain', type: 'slider', label: t('grain'), min: 0, max: 1, step: 0.05, fmt: fmtPct,
        get: () => s.grain, set: (v) => { s.grain = v; } },
      { id: 'aberration', type: 'slider', label: t('aberration'), min: 0, max: 1, step: 0.05, fmt: fmtPct,
        get: () => s.aberration, set: (v) => { s.aberration = v; } },
      { id: 'blood', type: 'slider', label: t('blood'), min: 0, max: 1, step: 0.05, fmt: fmtPct,
        get: () => s.blood, set: (v) => { s.blood = v; } },
      { id: 'crosshair', type: 'toggle', label: t('crosshair'), get: () => s.crosshair, set: (v) => { s.crosshair = v; } },
      { id: 'showFps', type: 'toggle', label: t('showFps'), get: () => s.showFps, set: (v) => { s.showFps = v; } },
      { id: 'quality', type: 'enum', label: t('quality'),
        options: [{ value: 'low', label: t('qLow') }, { value: 'medium', label: t('qMed') }, { value: 'high', label: t('qHigh') }],
        get: () => s.quality, set: (v) => { s.quality = v; } },
      { id: 'back', type: 'action', label: t('back'), run: function () { sfx('ui_back'); popScreen(); } },
    ];
  }
  function makeControlsRows() {
    const s = Me.settings;
    const rows = actionOrder().map(function (action) {
      return { id: 'bind_' + action, type: 'bind', action: action, label: actionLabel(action) };
    });
    rows.push({ id: 'toggleAds', type: 'toggle', label: t('toggleAds'), get: () => s.toggleAds, set: (v) => { s.toggleAds = v; } });
    rows.push({ id: 'toggleCrouch', type: 'toggle', label: t('toggleCrouch'), get: () => s.toggleCrouch, set: (v) => { s.toggleCrouch = v; } });
    rows.push({ id: 'reset', type: 'action', label: t('resetDefaults'), warn: true, run: function () { sfx('ui_click'); resetBindsToDefault(); } });
    rows.push({ id: 'back', type: 'action', label: t('back'), run: function () { sfx('ui_back'); popScreen(); } });
    return rows;
  }

  function resetBindsToDefault() {
    Me.settings.binds = cloneBinds(FACTORY_BINDS);
    if (Z.Input) Z.Input.binds = cloneBinds(FACTORY_BINDS);
    screenRows.controls.forEach(function (row) { if (row.type === 'bind') refreshRowValue(row); });
    onSettingsChanged();
  }

  function safeCb(name) {
    const args = Array.prototype.slice.call(arguments, 1);
    try { if (callbacks && typeof callbacks[name] === 'function') callbacks[name].apply(null, args); }
    catch (e) { Z.log && Z.log('Menu callback ' + name + ' threw', e); }
  }

  function onSettingsChanged() {
    persist();
    safeCb('onSettingsChange', Me.settings);
  }

  // ===========================================================================
  // Navigation — keyboard, mouse, gamepad all converge on the same
  // select/adjust/activate primitives.
  // ===========================================================================
  function currentRows() { return screenRows[Me.currentScreen] || []; }

  function selectIndex(screenName, i, fromKeyboard) {
    const rows = screenRows[screenName];
    if (!rows || !rows.length) return;
    i = clamp(i, 0, rows.length - 1);
    const prev = selIndex[screenName];
    selIndex[screenName] = i;
    for (let k = 0; k < rows.length; k++) {
      if (rows[k].dom) rows[k].dom.root.classList.toggle('is-selected', k === i);
    }
    if (screenName === Me.currentScreen && rows[i] && rows[i].dom) {
      if (fromKeyboard) rows[i].dom.root.focus();
      if (prev !== i) sfx('ui_hover');
    }
  }

  function moveSelection(dir) {
    if (listening) return;
    const rows = currentRows();
    if (!rows.length) return;
    let i = selIndex[Me.currentScreen];
    for (let n = 0; n < rows.length; n++) {
      i = (i + dir + rows.length) % rows.length;
      // rows are all selectable — no disabled state currently — break immediately
      break;
    }
    selectIndex(Me.currentScreen, i, true);
  }

  function adjustSelected(dir) {
    if (listening) return;
    const rows = currentRows();
    const row = rows[selIndex[Me.currentScreen]];
    if (!row) return;
    if (row.type === 'slider') {
      row.set(clamp(row.get() + dir * row.step, row.min, row.max));
      refreshRowValue(row);
      onSettingsChanged();
      sfx('ui_hover');
    } else if (row.type === 'toggle') {
      row.set(!row.get());
      refreshRowValue(row);
      onSettingsChanged();
      sfx('ui_click');
    } else if (row.type === 'enum') {
      cycleEnum(row, dir);
    }
  }

  function cycleEnum(row, dir) {
    const opts = row.options;
    let idx = opts.findIndex((o) => o.value === row.get());
    if (idx < 0) idx = 0;
    idx = (idx + dir + opts.length) % opts.length;
    row.set(opts[idx].value);
    refreshRowValue(row);
    onSettingsChanged();
    sfx('ui_click');
  }

  function activateSelected(screenName) {
    if (listening) return;
    screenName = screenName || Me.currentScreen;
    const rows = screenRows[screenName];
    const row = rows && rows[selIndex[screenName]];
    if (!row) return;
    if (row.type === 'action') row.run();
    else if (row.type === 'toggle') { row.set(!row.get()); refreshRowValue(row); onSettingsChanged(); sfx('ui_click'); }
    else if (row.type === 'enum') cycleEnum(row, 1);
    else if (row.type === 'bind') startListening(row);
  }

  function goBack() {
    if (listening) { cancelListening(); return; }
    if (Me.currentScreen === 'settings' || Me.currentScreen === 'controls') {
      popScreen();
    } else if (Me.currentScreen === 'pause') {
      sfx('ui_back'); safeCb('onResume');
    }
    // main / gameover / loading: nothing sensible to "go back" to — no-op
  }

  function pushScreen(name) {
    screenStack.push(Me.currentScreen);
    activateScreen(name);
  }
  function popScreen() {
    const prev = screenStack.pop() || 'main';
    activateScreen(prev);
  }

  // ===========================================================================
  // Key rebinding capture
  // ===========================================================================
  function startListening(row) {
    listening = row;
    if (row.dom) row.dom.root.classList.add('is-listening');
    text(row.dom.val, t('pressAKey'));
    window.addEventListener('keydown', onListenKey, true);
    window.addEventListener('mousedown', onListenMouse, true);
  }
  function stopListeningDom(row) {
    if (row && row.dom) row.dom.root.classList.remove('is-listening');
    window.removeEventListener('keydown', onListenKey, true);
    window.removeEventListener('mousedown', onListenMouse, true);
  }
  function onListenKey(e) {
    if (!listening) return;
    e.preventDefault(); e.stopPropagation();
    const row = listening;
    if (e.code !== 'Escape') {
      Me.settings.binds[row.action] = [e.code];
      if (Z.Input && Z.Input.binds) Z.Input.binds[row.action] = [e.code];
      onSettingsChanged();
      sfx('ui_click');
    } else {
      sfx('ui_back');
    }
    listening = null;
    stopListeningDom(row);
    refreshRowValue(row);
  }
  function onListenMouse(e) {
    if (!listening) return;
    e.preventDefault(); e.stopPropagation();
    const row = listening;
    const code = 'Mouse' + e.button;
    Me.settings.binds[row.action] = [code];
    if (Z.Input && Z.Input.binds) Z.Input.binds[row.action] = [code];
    onSettingsChanged();
    sfx('ui_click');
    listening = null;
    stopListeningDom(row);
    refreshRowValue(row);
  }
  function cancelListening() {
    if (!listening) return;
    const row = listening;
    listening = null;
    stopListeningDom(row);
    refreshRowValue(row);
  }

  // ===========================================================================
  // Screen activation
  // ===========================================================================
  function activateScreen(name) {
    for (const k in screenEls) screenEls[k].classList.toggle('is-active', k === name);
    Me.currentScreen = name;
    if (screenRows[name]) {
      // refresh all values in case settings changed elsewhere (e.g. reset)
      screenRows[name].forEach(refreshRowValue);
      selectIndex(name, selIndex[name] || 0, false);
    }
  }

  // ===========================================================================
  // Global keyboard nav — a single always-attached listener guarded by
  // Me.visible, rather than add/remove churn on every show()/hide().
  // ===========================================================================
  function onKeyDown(e) {
    if (!Me.visible || listening) return;
    // First keypress while the game-over reveal is still staggering in only
    // completes the reveal — it does NOT also activate whatever row happens
    // to be selected, so an impatient Enter can't skip past seeing the stats.
    if (Me.currentScreen === 'gameover' && goRevealing) {
      skipGameoverReveal();
      e.preventDefault();
      return;
    }
    switch (e.code) {
      case 'ArrowUp': case 'KeyW': moveSelection(-1); e.preventDefault(); break;
      case 'ArrowDown': case 'KeyS': moveSelection(1); e.preventDefault(); break;
      case 'ArrowLeft': case 'KeyA': adjustSelected(-1); e.preventDefault(); break;
      case 'ArrowRight': case 'KeyD': adjustSelected(1); e.preventDefault(); break;
      case 'Enter': case 'NumpadEnter': case 'Space': activateSelected(); e.preventDefault(); break;
      case 'Escape': goBack(); e.preventDefault(); break;
      default: break;
    }
  }

  // ===========================================================================
  // Gamepad polling loop — gamepad has no native events, so this is the one
  // legitimate JS-driven per-frame loop. It only runs while the menu is
  // visible and does nothing else (no gameplay/animation work happens here;
  // all visual motion is CSS).
  // ===========================================================================
  let lastRafT = 0;
  function rafTick(ts) {
    if (!Me.visible) { rafId = 0; return; }
    const dt = lastRafT ? Math.min(0.25, (ts - lastRafT) / 1000) : 0;
    lastRafT = ts;
    pollGamepad();
    rafId = requestAnimationFrame(rafTick);
  }
  function pollGamepad() {
    if (listening) return;
    const gp = Z.Input && Z.Input.gamepad;
    if (!gp || !Z.Input.gpPressed) return;
    const anyPress = Z.Input.gpPressed(0) || Z.Input.gpPressed(1) ||
      Z.Input.gpPressed(12) || Z.Input.gpPressed(13) || Z.Input.gpPressed(14) || Z.Input.gpPressed(15);
    // Same "first press only skips" rule as the keyboard handler — see onKeyDown.
    if (Me.currentScreen === 'gameover' && goRevealing) { if (anyPress) skipGameoverReveal(); return; }
    if (Z.Input.gpPressed(12)) moveSelection(-1);
    if (Z.Input.gpPressed(13)) moveSelection(1);
    if (Z.Input.gpPressed(14)) adjustSelected(-1);
    if (Z.Input.gpPressed(15)) adjustSelected(1);
    if (Z.Input.gpPressed(0)) activateSelected();
    if (Z.Input.gpPressed(1)) goBack();
  }
  function startLoop() {
    if (rafId) return;
    lastRafT = 0;
    rafId = requestAnimationFrame(rafTick);
  }
  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  // ===========================================================================
  // Game-over stat reveal
  // ===========================================================================
  function renderGameOverStats() {
    if (!screenEls.gameover) return;
    const s = lastStats || {};
    text(document.getElementById('wa-go-round'), s.round != null ? String(s.round) : '0');
    const lines = [
      [t('statKills'), s.kills], [t('statHeadshots'), s.headshots],
      [t('statAccuracy'), typeof s.accuracy === 'number' ? Math.round(s.accuracy * 100) + '%' : null],
      [t('statShots'), s.shotsFired], [t('statPoints'), s.pointsEarned],
      [t('statTime'), typeof s.timeSurvived === 'number' ? fmtTime(s.timeSurvived) : null],
      [t('statDowns'), s.downs],
    ];
    const box = document.getElementById('wa-go-stats');
    box.innerHTML = '';
    let lastLine = null;
    lines.forEach(function (pair, i) {
      const row = el('div', 'wa-stat-line', box);
      row.style.setProperty('--i', String(i));
      const lab = el('div', '', row); text(lab, pair[0]);
      const val = el('div', 'wa-stat-line__val', row); text(val, pair[1] == null ? '—' : String(pair[1]));
      lastLine = row;
    });
    const actions = screenEls.gameover.querySelector('.wa-go__actions');
    if (actions) actions.classList.remove('is-revealed');
    goRevealing = true;
    screenEls.gameover.classList.remove('wa-menu--skip');
    // force reflow so the animation restarts if this screen was already built
    void box.offsetWidth;
    // The RESTART / MAIN MENU choice only becomes visible/interactive once the
    // last stat line's entrance animation finishes — event-driven, no timer.
    if (lastLine) {
      const onDone = function (ev) {
        if (ev.target !== lastLine) return;
        lastLine.removeEventListener('animationend', onDone);
        revealGameoverActions();
      };
      lastLine.addEventListener('animationend', onDone);
    } else {
      revealGameoverActions();
    }
  }
  function revealGameoverActions() {
    goRevealing = false;
    const actions = screenEls.gameover && screenEls.gameover.querySelector('.wa-go__actions');
    if (actions) actions.classList.add('is-revealed');
  }
  // User-triggered early skip: jumps every stat line to its final state and
  // immediately reveals the RESTART / MAIN MENU choice.
  function skipGameoverReveal() {
    if (screenEls.gameover) screenEls.gameover.classList.add('wa-menu--skip');
    revealGameoverActions();
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s2 = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s2 < 10 ? '0' : '') + s2;
  }

  // ===========================================================================
  // Screen construction
  // ===========================================================================
  function buildEmbers(parent, count) {
    const holder = el('div', 'wa-menu__embers', parent);
    const rng = Z.RNG.make(Z.ART_SEED ^ 0xE4B0);
    for (let i = 0; i < count; i++) {
      const em = el('div', 'wa-ember', holder);
      em.style.left = (rng.f() * 100).toFixed(2) + '%';
      em.style.setProperty('--wa-drift', (rng.sym(28)).toFixed(1) + 'px');
      const dur = 7 + rng.f() * 9;
      em.style.animationDuration = dur.toFixed(2) + 's';
      em.style.animationDelay = (-rng.f() * dur).toFixed(2) + 's';
      const sc = 0.6 + rng.f() * 1.1;
      em.style.width = (2.4 * sc).toFixed(1) + 'px';
      em.style.height = (2.4 * sc).toFixed(1) + 'px';
    }
  }

  function buildTitle(parent) {
    const hero = el('div', 'wa-menu__hero', parent);
    // titlefit is a plain (non-animated) wrapper JS scales down to guarantee
    // no-wrap/no-overflow at any viewport size; the drift animation lives on
    // the inner element so the two transforms never fight each other.
    const fit = el('div', 'wa-menu__titlefit', hero);
    const h1 = el('div', 'wa-menu__title', fit);
    h1.setAttribute('role', 'heading');
    h1.setAttribute('aria-level', '1');
    const str = t('title');
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const sp = document.createElement('span');
      sp.textContent = ch === ' ' ? ' ' : ch;
      h1.appendChild(sp);
    }
    const sub = el('div', 'wa-menu__subtitle', hero);
    text(sub, '\u2014 GERMANY, 1945 \u2014');
    return hero;
  }

  // Scales .wa-menu__titlefit down (never up) so the title always fits on one
  // line, from 800x600 up through 4K+. Safe to call anytime; no-ops if the
  // main screen isn't currently laid out (width would read as 0).
  function fitTitle() {
    const fit = screenEls.main && screenEls.main.querySelector('.wa-menu__titlefit');
    if (!fit) return;
    fit.style.transform = 'none';
    const hero = fit.parentElement;
    const avail = hero.clientWidth * 0.94;
    if (avail <= 0) return;
    const natural = fit.scrollWidth;
    if (natural > avail) fit.style.transform = 'scale(' + (avail / natural).toFixed(4) + ')';
  }

  function buildRowList(parent, screenName, cls) {
    const list = el('div', cls || 'wa-menu__list', parent);
    list.setAttribute('role', 'menu');
    screenRows[screenName].forEach(function (row, i) { buildRow(list, screenName, row, i); });
    return list;
  }

  function buildHints(parent, str) {
    const h = el('div', 'wa-menu__hints', parent);
    text(h, str);
    return h;
  }

  function buildScreens(wrapEl) {
    // ---- main ----
    const main = el('div', 'wa-menu__screen wa-menu__screen--main', wrapEl);
    buildEmbers(main, 26);
    buildTitle(main);
    screenRows.main = makeMainRows();
    buildRowList(main, 'main', 'wa-menu__list wa-menu__list--main');
    buildHints(main, t('hintNav'));
    screenEls.main = main;

    // ---- pause ----
    const pause = el('div', 'wa-menu__screen wa-menu__screen--pause', wrapEl);
    const pHero = el('div', 'wa-menu__hero', pause);
    const pTitle = el('div', 'wa-menu__subtitle', pHero);
    pTitle.style.letterSpacing = '0.4em';
    pTitle.style.fontSize = 'clamp(1.4rem,3.2vw,2.2rem)';
    pTitle.style.color = COL.textBright;
    pTitle.style.opacity = '0.95';
    text(pTitle, t('paused'));
    screenRows.pause = makePauseRows();
    buildRowList(pause, 'pause', 'wa-menu__list wa-menu__list--main');
    buildHints(pause, t('hintNav'));
    screenEls.pause = pause;

    // ---- settings ----
    const settings = el('div', 'wa-menu__screen wa-menu__screen--settings', wrapEl);
    const sPanel = el('div', 'wa-menu__panel', settings);
    el('div', 'wa-menu__heading', sPanel).textContent = t('settings');
    screenRows.settings = makeSettingsRows();
    const sRows = el('div', 'wa-menu__rows', sPanel);
    screenRows.settings.forEach(function (row, i) { buildRow(sRows, 'settings', row, i); });
    buildHints(settings, t('hintAdj'));
    screenEls.settings = settings;

    // ---- controls ----
    const controls = el('div', 'wa-menu__screen wa-menu__screen--controls', wrapEl);
    const cPanel = el('div', 'wa-menu__panel', controls);
    el('div', 'wa-menu__heading', cPanel).textContent = t('controls');
    screenRows.controls = makeControlsRows();
    const cRows = el('div', 'wa-menu__rows', cPanel);
    screenRows.controls.forEach(function (row, i) { buildRow(cRows, 'controls', row, i); });
    buildHints(controls, t('hintBind') + '    ' + t('hintNav'));
    screenEls.controls = controls;

    // ---- game over ----
    const gameover = el('div', 'wa-menu__screen wa-menu__screen--gameover', wrapEl);
    const goRound = el('div', 'wa-go__round', gameover);
    el('div', 'wa-go__roundlabel', goRound).textContent = t('roundReached');
    const goNum = el('div', 'wa-go__roundnum', goRound);
    goNum.id = 'wa-go-round';
    text(goNum, '0');
    const goStats = el('div', 'wa-go__stats', gameover);
    goStats.id = 'wa-go-stats';
    screenRows.gameover = makeGameoverRows();
    buildRowList(gameover, 'gameover', 'wa-go__actions');
    buildHints(gameover, t('hintNav'));
    // Any click while the stat reveal is still staggering completes it
    // instantly, same as any keyboard/gamepad press (see onKeyDown).
    gameover.addEventListener('pointerdown', function () { if (goRevealing) skipGameoverReveal(); });
    screenEls.gameover = gameover;

    // ---- loading ----
    const loading = el('div', 'wa-menu__screen wa-menu__screen--loading', wrapEl);
    const lWrap = el('div', 'wa-menu__load', loading);
    const lLabel = el('div', 'wa-menu__loadlabel', lWrap);
    lLabel.id = 'wa-load-label';
    text(lLabel, t('loading'));
    const bar = el('div', 'wa-loadbar', lWrap);
    const segs = [];
    for (let i = 0; i < 30; i++) segs.push(el('div', 'wa-loadbar__seg', bar));
    const pct = el('div', 'wa-menu__loadpct', lWrap);
    pct.id = 'wa-load-pct';
    text(pct, '0%');
    screenEls.loading = loading;
    Me._loadSegs = segs; Me._loadPct = pct; Me._loadLabel = lLabel;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================
  Me.init = function (root, cb) {
    rootEl = root;
    callbacks = cb || {};
    Me.settings = loadSettings();
    if (Z.Input && Z.Input.binds) {
      for (const k in Me.settings.binds) Z.Input.binds[k] = Me.settings.binds[k].slice();
    }

    if (!built) {
      const style = document.createElement('style');
      style.textContent = buildCSS();
      (document.head || document.documentElement).appendChild(style);

      wrap = el('div', 'wa-menu is-hidden', rootEl);

      const grain = el('div', 'wa-menu__grain', wrap);
      grain.style.backgroundImage = 'url(' + buildGrainDataUrl() + ')';

      buildScreens(wrap);

      try {
        reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      } catch (e) { reducedMotion = false; }
      wrap.classList.toggle('wa-menu--rm', reducedMotion);
      try {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const onChange = function () { reducedMotion = mq.matches; wrap.classList.toggle('wa-menu--rm', reducedMotion); };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if (mq.addListener) mq.addListener(onChange);
      } catch (e) { /* ignore */ }

      window.addEventListener('keydown', onKeyDown, false);
      window.addEventListener('resize', fitTitle, false);

      built = true;
    }
  };

  Me.show = function (screen) {
    if (!built) return;
    if (screen !== 'settings' && screen !== 'controls') screenStack.length = 0;
    activateScreen(screen);
    Me.visible = true;
    wrap.classList.remove('is-hidden');
    if (rootEl) rootEl.classList.add('on');
    if (screen === 'gameover') renderGameOverStats();
    fitTitle();
    startLoop();
  };

  Me.hide = function () {
    Me.visible = false;
    cancelListening();
    if (wrap) wrap.classList.add('is-hidden');
    if (rootEl) rootEl.classList.remove('on');
    stopLoop();
  };

  Me.setStats = function (stats) {
    lastStats = stats || {};
    if (built) renderGameOverStats();
  };

  Me.setLoading = function (fraction, label) {
    if (!built) return;
    const f = clamp(typeof fraction === 'number' ? fraction : 0, 0, 1);
    const filled = Math.round(f * Me._loadSegs.length);
    for (let i = 0; i < Me._loadSegs.length; i++) Me._loadSegs[i].classList.toggle('is-filled', i < filled);
    text(Me._loadPct, Math.round(f * 100) + '%');
    if (label != null) text(Me._loadLabel, label);
  };
}());
