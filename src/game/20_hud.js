// ---------------------------------------------------------------------------
// 20_hud.js — Z.HUD. Draws the in-game HUD to the 2D `#hud` canvas.
//
// Everything here is hand-drawn vector art: no images, no web fonts. Numbers
// that matter (points, round, ammo, game-over stats) are rendered with a
// custom seven-segment-style vector digit font so the roll-up/bleed/reveal
// animations can be driven per-glyph. Labels use the system condensed
// stencil-ish font stack (Impact/Haettenschweiler/Arial Narrow Bold) drawn
// letter-by-letter with a hard drop shadow — never soft/blurred, never
// gradient-heavy, so it reads as a HUD and not a web page.
//
// Layout is driven from a single scale factor `s`, recomputed in resize()
// from viewport height against a 1080p reference. Expensive vector art
// (perk bottle caps, the round insignia skull, blood overlay, chalk weapon
// silhouettes, grenade icon) is pre-rendered to offscreen canvases in
// resize() and blitted every frame — draw() itself only does cheap path
// fills (digits, crosshair, thin overlays) plus image blits.
// ---------------------------------------------------------------------------
(function () {
  const H = {};
  Z.HUD = H;
  const M = Z.M;

  // ===========================================================================
  // Palette
  // ===========================================================================
  const COL = {
    pointsMain: '#e9dcb6',
    gainGreen: '#7ed453',
    lossRed: '#e3453c',
    roundRed: '#b81c1c',
    roundDeep: '#5c0c0c',
    ammoWhite: '#eee7d6',
    ammoLow: '#e3453c',
    bloodDark: '#4a0808',
    vignette: '#3f0808',
    hitWhite: '#f5f2e8',
    hitCrit: '#ff4a3c',
    crosshair: '#f2efe4',
    promptWhite: '#f0ead8',
    promptRed: '#e3453c',
    labelDim: '#b7ae95',
    perkJugg: '#a3221f', perkJuggDark: '#4a0f0d',
    perkSpeed: '#3f8f3a', perkSpeedDark: '#1c3f1a',
    perkDouble: '#c98a26', perkDoubleDark: '#5f3d10',
    perkRevive: '#2f77b0', perkReviveDark: '#173c58',
    perkGeneric: '#6f6a5c', perkGenericDark: '#302d26',
    bone: '#e8e2cf',
  };

  const FONT_STACK = '"Impact","Haettenschweiler","Arial Narrow Bold",sans-serif';

  // ===========================================================================
  // Module state
  // ===========================================================================
  let canvas = null, ctx = null;
  let dpr = 1, W = 0, Hh = 0, S = 1;
  let atlas = null; // offscreen pre-rendered art, rebuilt on resize()

  let anim = null;  // internal animation bookkeeping, see freshAnim()

  function freshAnim() {
    return {
      t: 0,                       // free-running clock (seconds), advances every draw()
      pointsShown: null,          // rolled-up displayed point value
      round: { shown: null, phase: 'idle', t: 0, from: 0, to: 0 },
      screenPulse: 0,             // 0..1, round-change dark-red screen pulse
      kick: 0,                    // 0..1, crosshair fire kick, decays
      lastMag: null, lastMagKey: null,
      bloodShown: 0,              // smoothed blood-overlay intensity
      heartbeatPhase: 0,
      promptActive: false, promptT: 0,
      lastMode: null,
      goT: 0,                     // game-over reveal timer
      events: [],                 // queue from H.notify()
      erroredOnce: false,
    };
  }

  // ===========================================================================
  // Offscreen canvas helper — keeps drawing code in CSS-pixel space while the
  // backing store matches devicePixelRatio, so everything blits crisp 1:1.
  // ===========================================================================
  function mkOff(wCss, hCss) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(wCss * dpr));
    c.height = Math.max(1, Math.round(hCss * dpr));
    const x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c: c, x: x, w: wCss, h: hCss };
  }

  // ===========================================================================
  // Vector digit font — a chunky, italic-leaned seven-segment style face used
  // for every number that "matters": points, round, ammo, game-over stats.
  // Drawn fresh each frame (cheap: a handful of filled hexagon paths per
  // glyph) rather than atlas-cached, since HUD digit counts per frame are low.
  // ===========================================================================
  const SEG = {
    '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
    '5': 'afgcd', '6': 'afgecd', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  };

  function hbar(x, cx, cy, w, t) {
    const hw = w / 2 - t * 0.28, ht = t / 2, cut = t * 0.42;
    x.moveTo(cx - hw + cut, cy - ht);
    x.lineTo(cx + hw - cut, cy - ht);
    x.lineTo(cx + hw, cy);
    x.lineTo(cx + hw - cut, cy + ht);
    x.lineTo(cx - hw + cut, cy + ht);
    x.lineTo(cx - hw, cy);
    x.closePath();
  }
  function vbar(x, cx, cy, hgt, t) {
    const hh = hgt / 2 - t * 0.28, hw = t / 2, cut = t * 0.42;
    x.moveTo(cx - hw, cy - hh + cut);
    x.lineTo(cx, cy - hh);
    x.lineTo(cx + hw, cy - hh + cut);
    x.lineTo(cx + hw, cy + hh - cut);
    x.lineTo(cx, cy + hh);
    x.lineTo(cx - hw, cy + hh - cut);
    x.closePath();
  }

  // A seven-segment '1' is only the two right-hand bars, so in a full-width
  // cell it sits hard against the right edge with dead space beside it — at
  // round 1 the counter read as a stray scratch next to the word ROUND.
  // Give it a narrow cell and centre the bars in it.
  function digitCharWidth(h, ch) { return ch === '1' ? h * 0.26 : h * 0.58; }

  // Stroke-then-fill in one pass. drawSegShape builds and fills its own paths
  // per branch, so the cheapest correct way to outline is to run it twice with
  // the composite op arranged so the stroke lands underneath.
  function drawSegShapeStroked(x, ch, w, h, t) {
    const fill = x.fillStyle;
    x.fillStyle = x.strokeStyle;
    x.save();
    x.lineWidth = x.lineWidth;
    for (const [dx, dy] of OUTLINE_OFFSETS) {
      x.save(); x.translate(dx * t * 0.22, dy * t * 0.22);
      drawSegShape(x, ch, w, h, t);
      x.restore();
    }
    x.restore();
    x.fillStyle = fill;
    drawSegShape(x, ch, w, h, t);
  }
  const OUTLINE_OFFSETS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];

  function drawSegShape(x, ch, w, h, t) {
    const mid = h / 2;
    const segs = SEG[ch];
    x.beginPath();
    if (segs) {
      if (segs.indexOf('a') >= 0) hbar(x, w / 2, t / 2, w, t);
      if (segs.indexOf('g') >= 0) hbar(x, w / 2, mid, w, t);
      if (segs.indexOf('d') >= 0) hbar(x, w / 2, h - t / 2, w, t);
      if (segs.indexOf('f') >= 0) vbar(x, t / 2, mid / 2, mid, t);
      if (segs.indexOf('b') >= 0) vbar(x, ch === '1' ? w / 2 : w - t / 2, mid / 2, mid, t);
      // A bare pair of vertical bars is not a '1' — it reads as a scratch,
      // especially at round 1 sitting on a textured wall. The angled flag off
      // the top is what makes the shape a numeral at a glance.
      if (ch === '1') {
        x.moveTo(w / 2 - t / 2, t * 0.5);
        x.lineTo(w / 2 - t * 1.35, t * 1.45);
        x.lineTo(w / 2 - t * 1.35, t * 2.30);
        x.lineTo(w / 2 - t / 2, t * 1.35);
        x.closePath();
      }
      if (segs.indexOf('e') >= 0) vbar(x, t / 2, mid + mid / 2, mid, t);
      if (segs.indexOf('c') >= 0) vbar(x, ch === '1' ? w / 2 : w - t / 2, mid + mid / 2, mid, t);
      x.fill();
      return;
    }
    if (ch === '-') { hbar(x, w / 2, mid, w, t); x.fill(); return; }
    if (ch === '+') { hbar(x, w / 2, mid, w, t); x.fill(); x.beginPath(); vbar(x, w / 2, mid, h * 0.72, t); x.fill(); return; }
    if (ch === ':') {
      const s2 = t * 1.05;
      x.rect(w / 2 - s2 / 2, mid * 0.55 - s2 / 2, s2, s2);
      x.rect(w / 2 - s2 / 2, mid * 1.45 - s2 / 2, s2, s2);
      x.fill();
      return;
    }
    if (ch === '/') {
      x.lineWidth = t * 0.85; x.lineCap = 'butt';
      x.moveTo(t * 0.3, h - t * 0.3);
      x.lineTo(w - t * 0.3, t * 0.3);
      x.strokeStyle = x.fillStyle;
      x.stroke();
      return;
    }
    if (ch === '%') {
      x.arc(w * 0.22, h * 0.22, t * 0.55, 0, M.TAU);
      x.moveTo(w * 0.78 + t * 0.55, h * 0.78);
      x.arc(w * 0.78, h * 0.78, t * 0.55, 0, M.TAU);
      x.fill();
      x.beginPath();
      x.lineWidth = t * 0.55; x.lineCap = 'round';
      x.moveTo(w * 0.12, h * 0.88); x.lineTo(w * 0.88, h * 0.12);
      x.strokeStyle = x.fillStyle;
      x.stroke();
      return;
    }
    // space / unknown: nothing
  }

  function drawDigitChar(x, ch, px, py, h, color) {
    const w = digitCharWidth(h, ch), t = Math.max(1.4, h * 0.15);
    x.save();
    x.translate(px, py);
    x.transform(1, 0, -0.16, 1, 0, 0);
    const sh = Math.max(1, h * 0.05);
    x.save(); x.translate(sh, sh);
    x.fillStyle = 'rgba(10,7,4,0.55)';
    drawSegShape(x, ch, w, h, t);
    x.restore();
    // Dark outline first. The HUD sits over the world, not over a black
    // letterbox, so a drop shadow alone leaves the numerals fighting whatever
    // wall texture happens to be behind them.
    x.strokeStyle = 'rgba(8,5,3,0.85)';
    x.lineWidth = Math.max(1.5, h * 0.10);
    x.lineJoin = 'round';
    x.fillStyle = color;
    drawSegShapeStroked(x, ch, w, h, t);
    x.restore();
  }

  function measureDigitString(str, h, spacing) {
    spacing = spacing == null ? h * 0.16 : spacing;
    let w = 0;
    for (let i = 0; i < str.length; i++) {
      w += (str[i] === ' ' ? h * 0.32 : digitCharWidth(h, str[i])) + (i < str.length - 1 ? spacing : 0);
    }
    return w;
  }

  // Draws `str` with the vector digit font. y = TOP of the glyph box.
  // align: 'left' | 'center' | 'right'. Returns total width drawn.
  function drawDigitString(x, str, px, py, h, color, align) {
    const spacing = h * 0.16;
    const totalW = measureDigitString(str, h, spacing);
    let cx = px;
    if (align === 'center') cx = px - totalW / 2;
    else if (align === 'right') cx = px - totalW;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const cw = ch === ' ' ? h * 0.32 : digitCharWidth(h, ch);
      if (ch !== ' ') drawDigitChar(x, ch, cx, py, h, color);
      cx += cw + spacing;
    }
    return totalW;
  }

  // ===========================================================================
  // Condensed label text — system font stack, manual letter-spacing, hard
  // (non-blurred) drop shadow. Used for anything that isn't "the big number".
  // ===========================================================================
  function drawLabel(x, text, px, py, sizePx, color, align, spacingPx, weight) {
    x.font = (weight || '700') + ' ' + Math.max(1, Math.round(sizePx)) + 'px ' + FONT_STACK;
    x.textBaseline = 'alphabetic';
    const sp = spacingPx == null ? sizePx * 0.09 : spacingPx;
    let total = 0;
    for (let i = 0; i < text.length; i++) total += x.measureText(text[i]).width + (i < text.length - 1 ? sp : 0);
    let cx = px;
    if (align === 'center') cx = px - total / 2;
    else if (align === 'right') cx = px - total;
    const off = Math.max(1, sizePx * 0.06);
    x.fillStyle = 'rgba(8,6,3,0.7)';
    let sx = cx;
    for (let i = 0; i < text.length; i++) { x.fillText(text[i], sx + off, py + off); sx += x.measureText(text[i]).width + sp; }
    x.fillStyle = color;
    let fx = cx;
    for (let i = 0; i < text.length; i++) { x.fillText(text[i], fx, py); fx += x.measureText(text[i]).width + sp; }
    return total;
  }

  // ===========================================================================
  // Pre-rendered vector art (built once per resize)
  // ===========================================================================
  function glyphSkull(x, cx, cy, r, color) {
    x.fillStyle = color;
    x.beginPath();
    x.arc(cx, cy - r * 0.1, r * 0.62, Math.PI, 0, false);
    x.lineTo(cx + r * 0.52, cy + r * 0.2);
    x.lineTo(cx + r * 0.34, cy + r * 0.18);
    x.lineTo(cx + r * 0.22, cy + r * 0.5);
    x.lineTo(cx + r * 0.08, cy + r * 0.2);
    x.lineTo(cx - r * 0.08, cy + r * 0.5);
    x.lineTo(cx - r * 0.22, cy + r * 0.2);
    x.lineTo(cx - r * 0.34, cy + r * 0.18);
    x.lineTo(cx - r * 0.52, cy + r * 0.2);
    x.closePath();
    x.fill();
    x.globalCompositeOperation = 'destination-out';
    x.beginPath(); x.ellipse(cx - r * 0.22, cy - r * 0.08, r * 0.16, r * 0.2, -0.15, 0, M.TAU); x.fill();
    x.beginPath(); x.ellipse(cx + r * 0.22, cy - r * 0.08, r * 0.16, r * 0.2, 0.15, 0, M.TAU); x.fill();
    x.beginPath(); x.moveTo(cx, cy + r * 0.02); x.lineTo(cx - r * 0.06, cy + r * 0.2); x.lineTo(cx + r * 0.06, cy + r * 0.2); x.closePath(); x.fill();
    x.globalCompositeOperation = 'source-over';
  }
  function glyphBolt(x, cx, cy, r, color) {
    x.fillStyle = color;
    x.beginPath();
    x.moveTo(cx + r * 0.12, cy - r * 0.85);
    x.lineTo(cx - r * 0.55, cy + r * 0.05);
    x.lineTo(cx - r * 0.06, cy + r * 0.05);
    x.lineTo(cx - r * 0.25, cy + r * 0.85);
    x.lineTo(cx + r * 0.55, cy - r * 0.12);
    x.lineTo(cx + r * 0.05, cy - r * 0.12);
    x.closePath();
    x.fill();
  }
  function glyphDoubleDots(x, cx, cy, r, color) {
    x.fillStyle = color;
    x.beginPath(); x.arc(cx - r * 0.32, cy, r * 0.36, 0, M.TAU); x.fill();
    x.beginPath(); x.arc(cx + r * 0.32, cy, r * 0.36, 0, M.TAU); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = Math.max(1, r * 0.07);
    [-1, 1].forEach(function (sgn) {
      const gx = cx + sgn * r * 0.32;
      x.beginPath(); x.moveTo(gx - r * 0.15, cy); x.lineTo(gx + r * 0.15, cy);
      x.moveTo(gx, cy - r * 0.15); x.lineTo(gx, cy + r * 0.15); x.stroke();
    });
  }
  function glyphSyringe(x, cx, cy, r, color) {
    x.strokeStyle = color; x.lineCap = 'round';
    x.lineWidth = Math.max(1, r * 0.17);
    x.beginPath(); x.moveTo(cx - r * 0.5, cy + r * 0.5); x.lineTo(cx + r * 0.3, cy - r * 0.3); x.stroke();
    x.lineWidth = Math.max(1, r * 0.06);
    x.beginPath(); x.moveTo(cx + r * 0.3, cy - r * 0.3); x.lineTo(cx + r * 0.72, cy - r * 0.72); x.stroke();
    x.lineWidth = Math.max(1, r * 0.17);
    x.beginPath(); x.moveTo(cx - r * 0.5, cy + r * 0.5); x.lineTo(cx - r * 0.74, cy + r * 0.74); x.stroke();
    x.beginPath(); x.moveTo(cx - r * 0.64, cy + r * 0.16); x.lineTo(cx - r * 0.16, cy - r * 0.32); x.stroke();
  }

  function buildCap(sizePx, base, dark, glyphFn) {
    const off = mkOff(sizePx, sizePx);
    const x = off.x;
    const cx = sizePx / 2, cy = sizePx / 2, r = sizePx / 2 - Math.max(1, sizePx * 0.02);
    const teeth = 16;
    x.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * M.TAU;
      const rr = (i % 2 === 0) ? r : r * 0.84;
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.closePath();
    x.fillStyle = dark;
    x.fill();
    x.beginPath(); x.arc(cx, cy, r * 0.8, 0, M.TAU);
    x.fillStyle = base; x.fill();
    x.lineWidth = Math.max(1, sizePx * 0.025);
    x.strokeStyle = dark; x.stroke();
    glyphFn(x, cx, cy, r * 0.46, '#f4efe0');
    x.beginPath(); x.arc(cx, cy, r * 0.78, 0, M.TAU);
    x.lineWidth = Math.max(1, sizePx * 0.045);
    x.strokeStyle = 'rgba(0,0,0,0.28)';
    x.stroke();
    return off.c;
  }

  function buildGrenadeIcon(sizePx) {
    const off = mkOff(sizePx, sizePx);
    const x = off.x;
    const cx = sizePx / 2, cy = sizePx * 0.56, r = sizePx * 0.34;
    x.fillStyle = '#3a3f30';
    x.beginPath(); x.arc(cx, cy, r, 0, M.TAU); x.fill();
    x.strokeStyle = '#20241a'; x.lineWidth = Math.max(1, sizePx * 0.035);
    for (let i = -1; i <= 1; i++) {
      x.beginPath();
      x.moveTo(cx - r * 0.9, cy + i * r * 0.32);
      x.lineTo(cx + r * 0.9, cy + i * r * 0.32);
      x.stroke();
    }
    x.beginPath();
    x.moveTo(cx, cy - r);
    x.lineTo(cx, cy - r * 0.95);
    x.moveTo(cx, cy - r);
    x.lineTo(cx, cy - r);
    x.strokeStyle = '#20241a';
    x.stroke();
    // spoon + pin ring
    x.beginPath(); x.rect(cx - r * 0.12, cy - r * 1.55, r * 0.24, r * 0.62); x.fillStyle = '#55503c'; x.fill();
    x.beginPath(); x.arc(cx + r * 0.42, cy - r * 1.35, r * 0.3, 0, M.TAU);
    x.lineWidth = Math.max(1, sizePx * 0.035); x.strokeStyle = '#8a8264'; x.stroke();
    return off.c;
  }

  function buildChalkGun(sizePx, kind) {
    const w = sizePx * 2.1, h = sizePx * 0.9;
    const off = mkOff(w, h);
    const x = off.x;
    const rng = Z.RNG.make(kind === 'pistol' ? 0xF15701 : 0xF15702);
    function chalkStroke(pathFn, passes) {
      passes = passes || 3;
      for (let p = 0; p < passes; p++) {
        x.save();
        x.translate(rng.sym(w * 0.004), rng.sym(h * 0.01));
        x.globalAlpha = 0.30 + rng.f() * 0.25;
        x.beginPath();
        pathFn();
        x.strokeStyle = '#d8d2bd';
        x.lineWidth = Math.max(1, h * 0.05);
        x.lineCap = 'round';
        x.lineJoin = 'round';
        x.setLineDash([h * 0.28, h * 0.14]);
        x.lineDashOffset = rng.f() * 10;
        x.stroke();
        x.restore();
      }
    }
    if (kind === 'pistol') {
      chalkStroke(function () {
        x.moveTo(w * 0.18, h * 0.42);
        x.lineTo(w * 0.62, h * 0.4);
        x.lineTo(w * 0.66, h * 0.3);
        x.lineTo(w * 0.2, h * 0.32);
        x.closePath();
        x.moveTo(w * 0.24, h * 0.44);
        x.lineTo(w * 0.3, h * 0.86);
        x.lineTo(w * 0.42, h * 0.86);
        x.lineTo(w * 0.42, h * 0.46);
      });
    } else {
      chalkStroke(function () {
        x.moveTo(w * 0.06, h * 0.5);
        x.lineTo(w * 0.7, h * 0.5);
        x.lineTo(w * 0.7, h * 0.34);
        x.lineTo(w * 0.86, h * 0.34);
        x.moveTo(w * 0.16, h * 0.5);
        x.lineTo(w * 0.16, h * 0.62);
        x.lineTo(w * 0.34, h * 0.62);
        x.lineTo(w * 0.34, h * 0.5);
        x.moveTo(w * 0.5, h * 0.5);
        x.lineTo(w * 0.5, h * 0.86);
        x.moveTo(w * 0.58, h * 0.5);
        x.lineTo(w * 0.58, h * 0.62);
        x.moveTo(w * 0.9, h * 0.32);
        x.lineTo(w * 0.98, h * 0.28);
      });
    }
    return { c: off.c, w: w, h: h };
  }

  function buildInsigniaSkull(sizePx) {
    const off = mkOff(sizePx, sizePx);
    glyphSkull(off.x, sizePx / 2, sizePx / 2, sizePx / 2 - 1, COL.bone);
    return off.c;
  }

  // Full-viewport blood overlay: dark irregular blobs concentrated at the
  // screen edges, baked once at full intensity; drawn with globalAlpha
  // scaled by the current damage-derived intensity so it reads continuously.
  function buildBloodOverlay(w, h) {
    const off = mkOff(w, h);
    const x = off.x;
    const rng = Z.RNG.make(Z.ART_SEED ^ 0xB100D);
    const cx = w / 2, cy = h / 2;
    x.fillStyle = COL.bloodDark;
    // Blood on a lens is wet and soft-edged. Straight lineTo() segments between
    // sampled radii gave hard-cornered hexagons the size of a fist; the ragged
    // outline needs curves through the sample points, and the whole splat needs
    // a radial falloff so it fades into the glass instead of ending on a line.
    function blob(bx, by, r) {
      const pts = 14;
      const px = [], py = [];
      for (let i = 0; i < pts; i++) {
        const a = (i / pts) * M.TAU;
        const rr = r * (0.62 + rng.f() * 0.62);
        px.push(bx + Math.cos(a) * rr); py.push(by + Math.sin(a) * rr);
      }
      x.beginPath();
      // midpoint-to-midpoint quadratics: a closed curve with no visible corners
      x.moveTo((px[pts - 1] + px[0]) / 2, (py[pts - 1] + py[0]) / 2);
      for (let i = 0; i < pts; i++) {
        const n = (i + 1) % pts;
        x.quadraticCurveTo(px[i], py[i], (px[i] + px[n]) / 2, (py[i] + py[n]) / 2);
      }
      x.closePath();
      const g = x.createRadialGradient(bx, by, r * 0.20, bx, by, r * 1.15);
      g.addColorStop(0, COL.bloodDark);
      g.addColorStop(0.62, COL.bloodDark);
      g.addColorStop(1, 'rgba(46,4,4,0)');
      x.fillStyle = g;
      x.fill();
      x.fillStyle = COL.bloodDark;
    }
    // edge-hugging clusters, denser toward corners, thin toward center
    const clusters = 30;
    for (let i = 0; i < clusters; i++) {
      const edge = rng.i(4);
      let bx, by;
      const t = rng.f();
      if (edge === 0) { bx = t * w; by = rng.f() * h * 0.22; }
      else if (edge === 1) { bx = t * w; by = h - rng.f() * h * 0.22; }
      else if (edge === 2) { bx = rng.f() * w * 0.18; by = t * h; }
      else { bx = w - rng.f() * w * 0.18; by = t * h; }
      x.globalAlpha = 0.34 + rng.f() * 0.42;
      blob(bx, by, Math.min(w, h) * (0.030 + rng.f() * 0.055));
    }
    // a soft radial vignette baked in underneath, so low intensities still read
    x.globalAlpha = 1;
    const g = x.createRadialGradient(cx, cy, Math.min(w, h) * 0.28, cx, cy, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(74,8,8,0)');
    g.addColorStop(1, 'rgba(58,6,6,0.9)');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    // a scatter of small drip specks
    for (let i = 0; i < 90; i++) {
      const edge = rng.i(4);
      let bx, by;
      if (edge === 0) { bx = rng.f() * w; by = rng.f() * h * 0.3; }
      else if (edge === 1) { bx = rng.f() * w; by = h - rng.f() * h * 0.3; }
      else if (edge === 2) { bx = rng.f() * w * 0.25; by = rng.f() * h; }
      else { bx = w - rng.f() * w * 0.25; by = rng.f() * h; }
      const r = rng.range(1.5, 5) * (w / 1920);
      x.globalAlpha = 0.4 + rng.f() * 0.5;
      x.beginPath(); x.ellipse(bx, by, r, r * (1.6 + rng.f()), rng.f() * M.TAU, 0, M.TAU); x.fill();
    }
    x.globalAlpha = 1;
    return off.c;
  }

  function rebuildAtlases() {
    const capPx = Math.round(46 * S);
    atlas = {
      capPx: capPx,
      caps: {
        jugg: buildCap(capPx, COL.perkJugg, COL.perkJuggDark, glyphSkull),
        speed: buildCap(capPx, COL.perkSpeed, COL.perkSpeedDark, glyphBolt),
        doubletap: buildCap(capPx, COL.perkDouble, COL.perkDoubleDark, glyphDoubleDots),
        quickrevive: buildCap(capPx, COL.perkRevive, COL.perkReviveDark, glyphSyringe),
      },
      capGeneric: buildCap(capPx, COL.perkGeneric, COL.perkGenericDark, function (x, cx, cy, r, c) {
        x.fillStyle = c; x.beginPath(); x.arc(cx, cy, r * 0.3, 0, M.TAU); x.fill();
      }),
      grenade: buildGrenadeIcon(Math.round(34 * S)),
      grenadePx: Math.round(34 * S),
      skull: buildInsigniaSkull(Math.round(20 * S)),
      skullPx: Math.round(20 * S),
      chalkRifle: buildChalkGun(Math.round(30 * S), 'rifle'),
      chalkPistol: buildChalkGun(Math.round(30 * S), 'pistol'),
      blood: buildBloodOverlay(Math.max(1, W), Math.max(1, Hh)),
    };
  }

  // ===========================================================================
  // Public API
  // ===========================================================================
  H.init = function (cnv) {
    canvas = cnv;
    ctx = canvas.getContext('2d');
    H.reset();
  };

  H.resize = function (w, h, d) {
    W = Math.max(1, Math.round(w));
    Hh = Math.max(1, Math.round(h));
    dpr = d || (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    S = M.clamp(Hh / 1080, 0.5, 2.4);
    if (canvas) {
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(Hh * dpr));
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    rebuildAtlases();
  };

  H.notify = function (kind, payload) {
    if (!anim) return;
    anim.events.push({ kind: kind, payload: payload || {}, age: 0 });
  };

  H.reset = function () { anim = freshAnim(); };

  H.draw = function (state, dt) {
    if (!ctx) return;
    state = state || {};
    dt = Math.min(0.25, Math.max(0, dt || 0));
    try {
      frame(state, dt);
    } catch (e) {
      if (!anim.erroredOnce) { anim.erroredOnce = true; Z.log('HUD draw error', e); }
    }
  };

  // ===========================================================================
  // Frame
  // ===========================================================================
  function frame(state, dt) {
    anim.t += dt;
    processEvents(dt);
    updatePoints(state, dt);
    updateRound(state, dt);
    anim.screenPulse = Math.max(0, anim.screenPulse - dt / 0.8);
    anim.kick = Math.max(0, anim.kick - dt * 6.5);
    updateGameOverTimer(state, dt);
    anim.lastMode = state.mode;

    ctx.save();
    ctx.clearRect(0, 0, W, Hh);

    const mode = state.mode || 'playing';

    // Nothing of the run belongs on screen before it starts. The menu draws
    // over a live render of the level, and without this the previous run's
    // points, ammo and round counter sat on top of the main menu.
    if (mode === 'menu' || mode === 'loading') {
      ctx.restore();
      return;
    }

    if (mode === 'gameover') {
      drawGameOver(state, dt);
      ctx.restore();
      return;
    }

    drawDamageOverlay(state, dt);
    drawScreenPulse();
    drawDamageDirection(state, dt);

    if (mode !== 'downed') {
      drawCrosshair(state, dt);
      drawHitmarker(state, dt);
    }

    drawPerks(state, dt);
    drawRound(state, dt);
    drawPoints(state, dt);
    // Bleeding out, the loadout is not the read — round, points and the
    // timer are. Sink the weapon block rather than cutting it, so a
    // self-revive drops you back into a HUD that never went away.
    if (mode === 'downed') { ctx.save(); ctx.globalAlpha *= 0.28; }
    drawAmmo(state, dt);
    drawGrenades(state, dt);
    if (mode === 'downed') ctx.restore();
    drawPowerups(state, dt);
    drawPrompt(state, dt);

    // Where pointer lock was refused — a sandboxed frame, mostly — the player
    // has no way of knowing the mouse works differently unless we say so.
    if (state.dragLook) {
      drawLabel(ctx, 'POINTER LOCK UNAVAILABLE \u2014 HOLD LEFT MOUSE TO LOOK',
        W / 2, 26 * S, 11 * S, COL.labelDim, 'center', 1.6 * S);
    }

    if (mode === 'downed') drawDowned(state, dt);

    drawDebug(state, dt);

    ctx.restore();
  }

  function processEvents(dt) {
    const ev = anim.events;
    for (let i = ev.length - 1; i >= 0; i--) {
      const e = ev[i];
      if (e.kind === 'fire') anim.kick = 1;
      if (e.kind === 'roundchange' || e.kind === 'round') {
        // handled primarily by updateRound()'s own diffing; this just makes
        // sure a pulse happens even if state.round hasn't ticked yet this frame.
        anim.screenPulse = Math.max(anim.screenPulse, 0.6);
      }
      ev.splice(i, 1);
    }
  }

  function updatePoints(state, dt) {
    const target = (typeof state.points === 'number') ? state.points : 0;
    if (anim.pointsShown === null) { anim.pointsShown = target; return; }
    if (anim.pointsShown !== target) {
      const diff = target - anim.pointsShown;
      const rate = Math.max(260, Math.abs(diff) * 5.2);
      anim.pointsShown = M.approach(anim.pointsShown, target, rate * dt);
    }
  }

  function updateRound(state, dt) {
    const r = (typeof state.round === 'number') ? state.round : null;
    if (r === null) return;
    const a = anim.round;
    if (a.shown === null) { a.shown = r; a.phase = 'idle'; return; }
    if (r !== a.shown && a.phase === 'idle') {
      a.phase = 'bleed'; a.t = 0; a.from = a.shown; a.to = r;
      anim.screenPulse = 1;
    }
    if (a.phase !== 'idle') {
      a.t += dt;
      if (a.phase === 'bleed' && a.t > 0.5) { a.phase = 'reveal'; a.t = 0; a.shown = a.to; }
      else if (a.phase === 'reveal' && a.t > 0.65) { a.phase = 'idle'; a.t = 0; }
    }
  }

  function updateGameOverTimer(state, dt) {
    if (state.mode === 'gameover') {
      if (anim.lastMode !== 'gameover') anim.goT = 0;
      else anim.goT += dt;
    }
  }

  // ---------------------------------------------------------------------------
  // Screen-space damage presentation
  // ---------------------------------------------------------------------------
  function drawDamageOverlay(state, dt) {
    const scr = state.screen || {};
    const health = (typeof state.health === 'number') ? state.health : 100;
    const maxHealth = (typeof state.maxHealth === 'number' && state.maxHealth > 0) ? state.maxHealth : 100;
    const fallback = M.clamp01(1 - health / maxHealth);
    const target = (typeof scr.blood === 'number') ? M.clamp01(scr.blood) : fallback;
    anim.bloodShown = M.damp(anim.bloodShown, target, 6, dt);

    if (atlas && atlas.blood && anim.bloodShown > 0.003) {
      ctx.globalAlpha = anim.bloodShown;
      ctx.drawImage(atlas.blood, 0, 0, W, Hh);
      ctx.globalAlpha = 1;
    }

    const low = !!state.lowHealth || health / maxHealth <= 0.3;
    if (low) {
      anim.heartbeatPhase += dt;
      const hb = heartbeatWave(anim.heartbeatPhase);
      const cx = W / 2, cy = Hh / 2;
      const g = ctx.createRadialGradient(cx, cy, Math.min(W, Hh) * 0.22, cx, cy, Math.max(W, Hh) * 0.62);
      const a1 = 0.18 + hb * 0.32;
      g.addColorStop(0, 'rgba(120,0,0,0)');
      g.addColorStop(1, 'rgba(90,0,0,' + a1.toFixed(3) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, Hh);
      // No blend-mode desaturation here: this canvas is a transparent overlay,
      // so compositing against it only greys its own empty pixels and lays a
      // flat slab over the frame. The renderer's post pass already pulls
      // saturation down from screen.blood, where it can see the scene.

    }

    if (typeof scr.flash === 'number' && scr.flash > 0.003) {
      ctx.fillStyle = 'rgba(255,255,255,' + M.clamp01(scr.flash).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, Hh);
    }
    if (typeof scr.fade === 'number' && scr.fade > 0.003) {
      ctx.fillStyle = 'rgba(0,0,0,' + M.clamp01(scr.fade).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, Hh);
    }
  }

  // Two quick pulses ("lub-dub") per ~0.9s cycle, output 0..1.
  function heartbeatWave(t) {
    const cycle = 0.9;
    const p = (t % cycle) / cycle;
    function pulse(center, width) {
      const d = (p - center) / width;
      return Math.exp(-d * d * 6);
    }
    return Math.max(pulse(0.06, 0.09), pulse(0.24, 0.11) * 0.75);
  }

  function drawScreenPulse() {
    if (anim.screenPulse <= 0.003) return;
    const cx = W / 2, cy = Hh / 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, Hh) * 0.75);
    const a = anim.screenPulse * 0.45;
    g.addColorStop(0, 'rgba(90,0,0,0)');
    g.addColorStop(0.7, 'rgba(90,0,0,' + (a * 0.4).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(60,0,0,' + a.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, Hh);
  }

  // ang: radians, 0 = forward/top of screen, increases clockwise.
  function drawDamageDirection(state, dt) {
    const list = state.damageDir;
    if (!list || !list.length) return;
    const cx = W / 2, cy = Hh / 2;
    const radius = Math.min(W, Hh) * 0.4;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      const t = typeof d.t === 'number' ? d.t : 0;
      const dur = 1.2;
      if (t >= dur) continue;
      const alpha = 1 - M.smoothstep(dur * 0.5, dur, t);
      const ang = d.ang || 0;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.translate(0, -radius);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#e3453c';
      const w2 = 34 * S, h2 = 26 * S;
      ctx.beginPath();
      ctx.moveTo(0, -h2 * 0.55);
      ctx.lineTo(w2 * 0.5, h2 * 0.55);
      ctx.lineTo(w2 * 0.18, h2 * 0.55);
      ctx.lineTo(0, -h2 * 0.05);
      ctx.lineTo(-w2 * 0.18, h2 * 0.55);
      ctx.lineTo(-w2 * 0.5, h2 * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // Crosshair + hitmarker
  // ---------------------------------------------------------------------------
  function drawCrosshair(state, dt) {
    const w = state.weapon;
    const ads = w ? (w.ads || 0) : 0;
    const alpha = 1 - M.smoothstep(0.35, 0.62, ads);
    if (alpha <= 0.01) return;

    if (w) {
      const key = w.id || '_';
      if (anim.lastMagKey !== key) { anim.lastMagKey = key; anim.lastMag = w.mag; }
      else if (typeof w.mag === 'number' && typeof anim.lastMag === 'number' && w.mag < anim.lastMag) { anim.kick = 1; }
      if (typeof w.mag === 'number') anim.lastMag = w.mag;
    }

    const cx = W / 2, cy = Hh / 2;
    const gap = (7 + (state.crosshairSpread || 0) * 95 + anim.kick * 14) * S;
    const len = 9 * S, thick = Math.max(1.4, 2.1 * S);

    function blade(x1, y1, x2, y2) {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = thick + 1.4;
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = COL.crosshair; ctx.lineWidth = thick;
      ctx.stroke();
    }
    ctx.globalAlpha = alpha;
    blade(cx, cy - gap - len, cx, cy - gap);
    blade(cx, cy + gap, cx, cy + gap + len);
    blade(cx - gap - len, cy, cx - gap, cy);
    blade(cx + gap, cy, cx + gap + len, cy);
    ctx.globalAlpha = 1;
  }

  function drawHitmarker(state, dt) {
    const hm = state.hitmarker;
    if (!hm || typeof hm.t !== 'number') return;
    const dur = 0.28;
    if (hm.t >= dur) return;
    const alpha = 1 - hm.t / dur;
    const crit = !!hm.crit;
    const cx = W / 2, cy = Hh / 2;
    const inner = (crit ? 7 : 5.5) * S, outer = (crit ? 16 : 12) * S;
    const thick = Math.max(1.6, (crit ? 3.2 : 2.4) * S);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = crit ? COL.hitCrit : COL.hitWhite;
    ctx.lineWidth = thick;
    ctx.lineCap = 'round';
    const dirs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < 4; i++) {
      const d = dirs[i];
      ctx.beginPath();
      ctx.moveTo(cx + d[0] * inner, cy + d[1] * inner);
      ctx.lineTo(cx + d[0] * outer, cy + d[1] * outer);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // Points (bottom-left) + floaters
  // ---------------------------------------------------------------------------
  function drawPoints(state, dt) {
    const x0 = 30 * S, yBase = Hh - 30 * S;
    const h = 34 * S;
    const shown = Math.round(anim.pointsShown == null ? (state.points || 0) : anim.pointsShown);
    drawDigitString(ctx, String(shown), x0, yBase - h, h, COL.pointsMain, 'left');

    const list = state.pointsDelta;
    if (list && list.length) {
      const fx = x0 + measureDigitString(String(shown), h) + 14 * S;
      for (let i = 0; i < list.length; i++) {
        const d = list[i];
        const t = typeof d.t === 'number' ? d.t : 0;
        const dur = 1.0;
        if (t >= dur) continue;
        const alpha = 1 - M.smoothstep(dur * 0.55, dur, t);
        const rise = t * 34 * S;
        const gain = d.v >= 0;
        const dh = (d.crit ? 22 : 17) * S;
        const str = (gain ? '+' : '-') + Math.abs(Math.round(d.v));
        ctx.globalAlpha = alpha;
        drawDigitString(ctx, str, fx, yBase - h * 0.72 - rise, dh, gain ? COL.gainGreen : COL.lossRed, 'left');
        ctx.globalAlpha = 1;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Round counter (bottom-left, above points) — the game's heartbeat.
  // ---------------------------------------------------------------------------
  function drawRound(state, dt) {
    const a = anim.round;
    // Round 0 is the pre-game lobby state and should show nothing.
    if (a.shown === null || (a.shown | 0) < 1) return;
    const x0 = 30 * S;
    // The round counter is the dominant element of this HUD — it is the number
    // a player checks constantly and the one the whole game is scored by. At
    // 30 it sat *smaller* than the points readout below it, which inverts the
    // hierarchy the original has.
    const h = 44 * S;
    const yLabel = Hh - 30 * S - 46 * S;

    drawLabel(ctx, 'ROUND', x0, yLabel, 13 * S, COL.labelDim, 'left', 2 * S);

    // Clear the label by a full line: at 2 px of separation the numeral sat
    // on top of the R and the word read as "OUND".
    const yNum = yLabel - h - 14 * S;

    if (a.phase === 'bleed') {
      const p = M.clamp01(a.t / 0.5);
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.translate(x0, yNum);
      ctx.transform(1, 0, 0, 1 + p * 0.6, 0, -p * 8 * S);
      drawDigitString(ctx, String(a.from), 0, 0, h, COL.roundDeep, 'left');
      ctx.restore();
      // drip streaks
      ctx.globalAlpha = (1 - p) * 0.8;
      ctx.strokeStyle = COL.roundDeep;
      ctx.lineWidth = Math.max(1, 2 * S);
      const dripW = measureDigitString(String(a.from), h);
      for (let i = 0; i < 4; i++) {
        const dx = x0 + (i + 0.5) * dripW / 4;
        ctx.beginPath();
        ctx.moveTo(dx, yNum + h * 0.6);
        ctx.lineTo(dx, yNum + h * 0.6 + p * 20 * S);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (a.phase === 'reveal') {
      const p = M.clamp01(a.t / 0.35);
      const scale = M.lerp(1.25, 1.0, M.smoothstep(0, 1, p));
      const w0 = measureDigitString(String(a.to), h);
      ctx.save();
      ctx.globalAlpha = M.smoothstep(0, 1, p);
      ctx.translate(x0 + w0 / 2, yNum + h / 2);
      ctx.scale(scale, scale);
      ctx.translate(-w0 / 2, -h / 2);
      drawDigitString(ctx, String(a.to), 0, 0, h, COL.roundRed, 'left');
      ctx.restore();
      // splatter burst
      if (a.t < 0.5) {
        const rng = Z.RNG.make((a.to * 7919 + 13) >>> 0);
        const burstA = 1 - M.clamp01(a.t / 0.5);
        ctx.globalAlpha = burstA;
        ctx.fillStyle = COL.roundRed;
        for (let i = 0; i < 10; i++) {
          const ang = rng.f() * M.TAU;
          const dist = (6 + rng.f() * 26) * S * (a.t / 0.5 + 0.2);
          const r = (0.8 + rng.f() * 2.2) * S;
          ctx.beginPath();
          ctx.arc(x0 + w0 / 2 + Math.cos(ang) * dist, yNum + h / 2 + Math.sin(ang) * dist, r, 0, M.TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    } else {
      drawDigitString(ctx, String(a.shown), x0, yNum, h, COL.roundRed, 'left');
    }

    // insignia: skull-bundle + tally, drawn to the right of the number
    const roundNow = (a.phase === 'bleed') ? a.from : a.shown;
    const completed = Math.max(0, roundNow - 1);
    const bundles = Math.min(3, Math.floor(completed / 5));
    const rem = completed % 5;
    let ix = x0 + measureDigitString(String(roundNow), h) + 16 * S;
    const between = state.roundPhase === 'between';
    ctx.globalAlpha = between ? (0.75 + 0.25 * Math.sin(anim.t * 6)) : 0.85;
    if (atlas && atlas.skull) {
      for (let i = 0; i < bundles; i++) {
        ctx.drawImage(atlas.skull, ix, yNum + h - atlas.skullPx, atlas.skullPx, atlas.skullPx);
        ix += atlas.skullPx + 3 * S;
      }
    }
    if (Math.floor(completed / 5) > 3) {
      ix += drawLabel(ctx, '+' + (Math.floor(completed / 5) - 3), ix, yNum + h - 3 * S, 11 * S, COL.labelDim, 'left', 1) + 4 * S;
    }
    ctx.strokeStyle = COL.roundRed;
    ctx.lineWidth = Math.max(1, 2 * S);
    ctx.lineCap = 'round';
    const tickH = 14 * S, tickGap = 3.5 * S;
    let strokes = rem;
    for (let i = 0; i < Math.min(4, strokes); i++) {
      const tx = ix + i * tickGap;
      ctx.beginPath();
      ctx.moveTo(tx, yNum + h);
      ctx.lineTo(tx, yNum + h - tickH);
      ctx.stroke();
    }
    if (strokes >= 5) {
      ctx.beginPath();
      ctx.moveTo(ix - 2 * S, yNum + h - 2 * S);
      ctx.lineTo(ix + 3 * tickGap + 2 * S, yNum + h - tickH + 2 * S);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // Perk icons (bottom-left, above round counter)
  // ---------------------------------------------------------------------------
  const PERK_KEYS = ['jugg', 'speed', 'doubletap', 'quickrevive'];
  function drawPerks(state, dt) {
    const perks = state.perks;
    if (!perks || !perks.length || !atlas) return;
    const size = atlas.capPx;
    const x0 = 30 * S;
    const y0 = Hh - 30 * S - 46 * S - 40 * S - size - 8 * S;
    let ix = x0;
    for (let i = 0; i < perks.length; i++) {
      const id = String(perks[i] || '').toLowerCase().replace(/[^a-z]/g, '');
      const img = atlas.caps[id] || atlas.capGeneric;
      ctx.drawImage(img, ix, y0, size, size);
      ix += size + 6 * S;
    }
  }

  // ---------------------------------------------------------------------------
  // Ammo (bottom-right) + weapon name + chalk silhouette
  // ---------------------------------------------------------------------------
  function drawAmmo(state, dt) {
    const w = state.weapon;
    const xR = W - 30 * S;
    const yBase = Hh - 30 * S;
    if (!w) return;

    const magSize = typeof w.magSize === 'number' ? w.magSize : null;
    const mag = typeof w.mag === 'number' ? w.mag : null;
    const reserve = typeof w.reserve === 'number' ? w.reserve : null;
    const ratio = (magSize && mag != null) ? mag / Math.max(1, magSize) : 1;
    const low = mag != null && (ratio <= 0.25 || mag <= Math.max(1, Math.ceil((magSize || 6) * 0.2)));
    const empty = mag === 0;

    drawLabel(ctx, (w.name || w.id || '').toUpperCase(), xR, yBase - 74 * S, 13 * S, COL.labelDim, 'right', 2 * S);

    if (atlas) {
      const kind = /pistol|1911|colt|revolver/i.test(w.id || w.name || '') ? 'pistol' : 'rifle';
      const chalk = kind === 'pistol' ? atlas.chalkPistol : atlas.chalkRifle;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(chalk.c, xR - chalk.w, yBase - 74 * S - chalk.h - 4 * S, chalk.w, chalk.h);
      ctx.globalAlpha = 1;
    }

    let pulse = 1;
    if (empty) pulse = 1 + Math.sin(anim.t * 11) * 0.07;

    const magH = 44 * S * pulse;
    const magStr = mag == null ? '--' : String(mag);
    const magColor = low ? COL.ammoLow : COL.ammoWhite;
    ctx.globalAlpha = empty ? (0.75 + 0.25 * Math.sin(anim.t * 11)) : 1;
    const magW = drawDigitString(ctx, magStr, xR, yBase - magH, magH, magColor, 'right');

    const slashH = 30 * S;
    const slashX = xR - magW - 6 * S;
    drawDigitString(ctx, '/', slashX, yBase - slashH - 6 * S, slashH, COL.labelDim, 'right');

    const resH = 20 * S;
    const resStr = reserve == null ? '--' : String(reserve);
    drawDigitString(ctx, resStr, slashX - 12 * S, yBase - resH - 6 * S, resH, COL.labelDim, 'right');
    ctx.globalAlpha = 1;

    if (w.reloading) {
      drawLabel(ctx, 'RELOADING', xR, yBase - magH - 10 * S, 12 * S,
        '#e9dcb6' , 'right', 2 * S);
    }
  }

  function drawGrenades(state, dt) {
    if (typeof state.grenades !== 'number' || !atlas) return;
    const size = atlas.grenadePx;
    const xR = W - 30 * S - 120 * S;
    const yBase = Hh - 30 * S;
    ctx.drawImage(atlas.grenade, xR - size, yBase - size, size, size);
    drawDigitString(ctx, String(state.grenades), xR - size - 8 * S, yBase - 22 * S, 22 * S, COL.ammoWhite, 'right');
  }

  // ---------------------------------------------------------------------------
  // Power-up timers (top-center)
  // ---------------------------------------------------------------------------
  const POWERUP_DURATION = { instakill: 30, doublepoints: 30, nuke: 0, carpenter: 0, fireworks: 30, maxammo: 0 };
  const POWERUP_LABEL = { instakill: 'INSTA-KILL', doublepoints: 'DOUBLE POINTS', fireworks: 'FIRE SALE', maxammo: 'MAX AMMO', nuke: 'NUKE', carpenter: 'CARPENTER' };
  function drawPowerups(state, dt) {
    const list = state.powerups;
    if (!list || !list.length) return;
    const size = 30 * S;
    let totalW = list.length * (size + 90 * S) - 90 * S;
    let ix = W / 2 - totalW / 2;
    const y0 = 18 * S;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const dur = POWERUP_DURATION[p.id] || 30;
      const frac = dur > 0 ? M.clamp01((p.t || 0) / dur) : 1;
      const flashing = (p.t || 0) < 5;
      const alpha = flashing ? (0.55 + 0.45 * Math.sin(anim.t * 10)) : 1;
      const cx = ix + size / 2, cy = y0 + size / 2;
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, M.TAU);
      ctx.fillStyle = 'rgba(10,8,4,0.55)'; ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2 - 3 * S, -Math.PI / 2, -Math.PI / 2 + frac * M.TAU);
      ctx.strokeStyle = '#e9c34a';
      ctx.lineWidth = Math.max(1.4, 3 * S);
      ctx.stroke();
      ctx.fillStyle = '#e9c34a';
      ctx.beginPath(); ctx.arc(cx, cy, size * 0.28, 0, M.TAU); ctx.fill();
      drawLabel(ctx, POWERUP_LABEL[p.id] || String(p.id || '').toUpperCase(), cx, y0 + size + 14 * S, 10 * S, '#e9c34a', 'center', 1.5 * S);
      ctx.globalAlpha = 1;
      ix += size + 90 * S;
    }
  }

  // ---------------------------------------------------------------------------
  // Interaction prompt (centre-bottom)
  // ---------------------------------------------------------------------------
  function drawPrompt(state, dt) {
    const p = state.prompt;
    if (!p || !p.text) { anim.promptActive = false; anim.promptT = 0; return; }
    if (!anim.promptActive) { anim.promptActive = true; anim.promptT = 0; }
    anim.promptT = Math.min(0.15, anim.promptT + dt);
    const scale = M.lerp(0.86, 1.0, M.smoothstep(0, 0.15, anim.promptT));
    const cx = W / 2, cy = Hh - 118 * S;
    const color = p.affordable === false ? COL.promptRed : COL.promptWhite;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    drawLabel(ctx, p.text, 0, 0, 20 * S, color, 'center', 1.4 * S);
    ctx.restore();

    if (typeof p.progress === 'number') {
      const r = 24 * S;
      ctx.beginPath();
      ctx.arc(cx, cy + 26 * S, r, 0, M.TAU);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = Math.max(1.4, 3 * S);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy + 26 * S, r, -Math.PI / 2, -Math.PI / 2 + M.clamp01(p.progress) * M.TAU);
      ctx.strokeStyle = COL.promptWhite;
      ctx.lineWidth = Math.max(1.4, 3 * S);
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------------------
  // Downed state
  // ---------------------------------------------------------------------------
  function drawDowned(state, dt) {
    // The world desaturation lives in the renderer's post pass — this canvas is
    // transparent, so blending here would paint a flat slab over everything.
    const cx = W / 2, cy = Hh / 2;
    const g = ctx.createRadialGradient(cx, cy, Math.min(W, Hh) * 0.35, cx, cy, Math.max(W, Hh) * 0.75);
    g.addColorStop(0, 'rgba(90,0,0,0)');
    g.addColorStop(1, 'rgba(90,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, Hh);

    const prefix = 'YOU HAVE BLED OUT';
    const size = 26 * S;
    ctx.font = '700 ' + Math.round(size) + 'px ' + FONT_STACK;
    const hasTimer = typeof state.downedTimer === 'number';
    const full = prefix + (hasTimer ? ' IN ' : '');
    let w0 = 0;
    for (let i = 0; i < full.length; i++) w0 += ctx.measureText(full[i]).width + size * 0.09;
    const timerStr = hasTimer ? String(Math.max(0, Math.ceil(state.downedTimer))) : '';
    const timerW = hasTimer ? measureDigitString(timerStr, size * 1.1) : 0;
    const totalW = w0 + timerW;
    const startX = cx - totalW / 2;
    drawLabel(ctx, full, startX, cy - 40 * S, size, '#f0dede', 'left', size * 0.09);
    if (hasTimer) drawDigitString(ctx, timerStr, startX + w0, cy - 40 * S - size * 1.1 + size * 0.18, size * 1.1, COL.roundRed, 'left');

    if (state.perks && state.perks.indexOf('quickrevive') >= 0) {
      const pulse = 0.85 + 0.15 * Math.sin(anim.t * 6);
      ctx.save();
      ctx.globalAlpha = pulse;
      drawLabel(ctx, 'PRESS [F] TO SELF-REVIVE', cx, cy + 4 * S, 16 * S, COL.promptWhite, 'center', 1.4 * S);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Game over — cold, staggered stat reveal
  // ---------------------------------------------------------------------------
  function drawGameOver(state, dt) {
    ctx.fillStyle = '#000';
    const fadeA = M.clamp01(anim.goT / 0.9);
    ctx.globalAlpha = fadeA;
    ctx.fillRect(0, 0, W, Hh);
    ctx.globalAlpha = 1;
    if (fadeA < 1) return;

    const stats = state.stats || {};
    const lines = [
      { label: 'KILLS', value: state.kills },
      { label: 'HEADSHOTS', value: state.headshots },
      { label: 'ACCURACY', value: (typeof stats.accuracy === 'number') ? Math.round(stats.accuracy * 100) + '%' : null },
      { label: 'BULLETS FIRED', value: stats.shotsFired },
      { label: 'POINTS EARNED', value: state.points },
      { label: 'TIME SURVIVED', value: (typeof stats.timeAlive === 'number') ? fmtTime(stats.timeAlive) : null },
      { label: 'DOWNS', value: state.downs },
    ];

    const t = anim.goT - 0.9;
    const cx = W / 2;

    // "ROUND REACHED" — huge, first
    const roundHold = 0.5;
    if (t > roundHold) {
      const rt = M.clamp01((t - roundHold) / 0.5);
      ctx.globalAlpha = rt;
      const headSize = 15 * S;
      drawLabel(ctx, 'ROUND REACHED', cx, Hh * 0.22, headSize, COL.labelDim, 'center', 2.5 * S);
      const numSize = 90 * S;
      drawDigitString(ctx, String(state.round != null ? state.round : 0), cx, Hh * 0.22 + 18 * S, numSize, COL.roundRed, 'center');
      ctx.globalAlpha = 1;
    }

    // The whole reveal used to take 4.7 s before the last row landed, which is
    // a long time to sit staring at a black screen after dying. Brisk enough
    // to read as a deliberate stagger, short enough not to outstay it.
    const listStart = roundHold + 0.55;
    const stagger = 0.19;
    let y = Hh * 0.52;
    const rowH = 34 * S;
    for (let i = 0; i < lines.length; i++) {
      const appearAt = listStart + i * stagger;
      if (t <= appearAt) continue;
      const a = M.clamp01((t - appearAt) / 0.35);
      ctx.globalAlpha = a;
      const ly = y + i * rowH;
      drawLabel(ctx, lines[i].label, cx - 160 * S, ly, 15 * S, COL.labelDim, 'left', 1.5 * S);
      const val = lines[i].value == null ? '--' : String(lines[i].value);
      drawDigitString(ctx, val, cx + 160 * S, ly - 16 * S, 22 * S, COL.pointsMain, 'right');
      ctx.globalAlpha = 1;
    }
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s2 = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s2 < 10 ? '0' : '') + s2;
  }

  // ---------------------------------------------------------------------------
  // Debug block
  // ---------------------------------------------------------------------------
  function drawDebug(state, dt) {
    if (!state.debug) return;
    const lines = ['FPS ' + Math.round(state.fps || 0)];
    if (typeof state.draws === 'number') lines.push('DRAWS ' + state.draws);
    if (typeof state.voices === 'number') lines.push('VOICES ' + state.voices);
    ctx.font = Math.round(12 * S) + 'px monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(8 * S, 8 * S, 110 * S, (lines.length * 14 + 6) * S);
    ctx.fillStyle = '#9fe89f';
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 12 * S, (12 + i * 14) * S);
  }
}());
