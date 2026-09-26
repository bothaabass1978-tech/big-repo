/**
 * BlockForge — original procedural SVG thumbnails for every game (320x180).
 * Returned as strings; BF.thumbs.url(id) caches data: URIs for <img> tags.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const n = (v) => Math.round(v * 10) / 10;

  const svg = (body, defs) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">' + (defs ? '<defs>' + defs + '</defs>' : '') + body + '</svg>';
  const stops = (list) => list.map((s) => '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"' + (s[2] != null ? ' stop-opacity="' + s[2] + '"' : '') + '/>').join('');
  const lin = (id, list, x2, y2) => '<linearGradient id="' + id + '" x1="0" y1="0" x2="' + (x2 == null ? 0 : x2) + '" y2="' + (y2 == null ? 1 : y2) + '">' + stops(list) + '</linearGradient>';
  const rad = (id, list, cx, cy, r) => '<radialGradient id="' + id + '" cx="' + (cx == null ? 0.5 : cx) + '" cy="' + (cy == null ? 0.5 : cy) + '" r="' + (r == null ? 0.5 : r) + '">' + stops(list) + '</radialGradient>';
  const rect = (x, y, w, h, fill, extra) => '<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(h) + '" fill="' + fill + '"' + (extra ? ' ' + extra : '') + '/>';
  const circ = (cx, cy, r, fill, extra) => '<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(r) + '" fill="' + fill + '"' + (extra ? ' ' + extra : '') + '/>';
  const ell = (cx, cy, rx, ry, fill, extra) => '<ellipse cx="' + n(cx) + '" cy="' + n(cy) + '" rx="' + n(rx) + '" ry="' + n(ry) + '" fill="' + fill + '"' + (extra ? ' ' + extra : '') + '/>';
  const poly = (pts, fill, extra) => '<polygon points="' + pts + '" fill="' + fill + '"' + (extra ? ' ' + extra : '') + '/>';
  const path = (d, fill, extra) => '<path d="' + d + '" fill="' + fill + '"' + (extra ? ' ' + extra : '') + '/>';
  const line = (x1, y1, x2, y2, stroke, w, extra) => '<line x1="' + n(x1) + '" y1="' + n(y1) + '" x2="' + n(x2) + '" y2="' + n(y2) + '" stroke="' + stroke + '" stroke-width="' + (w || 2) + '" stroke-linecap="round"' + (extra ? ' ' + extra : '') + '/>';
  const g = (content, transform, extra) => '<g' + (transform ? ' transform="' + transform + '"' : '') + (extra ? ' ' + extra : '') + '>' + content + '</g>';

  function stars(count, seed, h, color) {
    const r = U.rng(seed);
    let out = '';
    for (let i = 0; i < count; i++) out += circ(r() * 320, r() * (h || 180), r() * 1.2 + 0.3, color || '#fff', 'opacity="' + n(0.3 + r() * 0.7) + '"');
    return out;
  }

  /**
   * Blocky figure, feet centered at (x, y). o: {skin, shirt, pants, hair, armL, armR, hat, face}
   * armL/armR are rotation degrees (0 = hanging down, 90 = forward/outward, 180 = raised).
   */
  function guy(x, y, s, o) {
    o = Object.assign({ skin: '#f1c27d', shirt: '#23a699', pants: '#2f4a7a', hair: '#6b4226', armL: 10, armR: -10 }, o);
    const legH = 20 * s, torsoH = 22 * s, head = 18 * s, torsoW = 24 * s, legW = 11 * s, armW = 7 * s, armH = 20 * s;
    const top = y - legH - torsoH;
    let out = '';
    out += rect(x - legW - 0.5 * s, y - legH, legW, legH, o.pants);
    out += rect(x + 0.5 * s, y - legH, legW, legH, U.shade(o.pants, -0.15));
    // arms rotate around the shoulder
    const arm = (side, deg) => {
      const sx = x + side * (torsoW / 2 + armW / 2);
      return g(rect(sx - armW / 2, top, armW, armH, U.shade(o.shirt, side > 0 ? -0.12 : 0)) + rect(sx - armW / 2, top + armH - 5 * s, armW, 5 * s, o.skin), 'rotate(' + n(-side * deg) + ' ' + n(sx) + ' ' + n(top + 3 * s) + ')');
    };
    out += arm(-1, o.armL);
    out += arm(1, o.armR);
    out += rect(x - torsoW / 2, top, torsoW, torsoH, o.shirt);
    if (o.emblem) out += rect(x - 4 * s, top + 6 * s, 8 * s, 8 * s, o.emblem, 'transform="rotate(45 ' + n(x) + ' ' + n(top + 10 * s) + ')"');
    const hy = top - head;
    out += rect(x - head / 2, hy, head, head, o.skin, 'rx="' + n(2 * s) + '"');
    if (o.hair) out += rect(x - head / 2, hy - 1 * s, head, 6 * s, o.hair, 'rx="' + n(2 * s) + '"');
    out += rect(x - 5 * s, hy + 7 * s, 2.6 * s, 3.2 * s, '#1b1b22') + rect(x + 2.4 * s, hy + 7 * s, 2.6 * s, 3.2 * s, '#1b1b22');
    out += rect(x - 3.5 * s, hy + 12.5 * s, 7 * s, 1.6 * s, '#1b1b22', 'rx="' + n(0.8 * s) + '"');
    if (o.hat) out += rect(x - head / 2 - 1 * s, hy - 4 * s, head + 2 * s, 6 * s, o.hat, 'rx="' + n(1.5 * s) + '"') + rect(x - head / 2 - 1 * s, hy + 1 * s, head + 7 * s, 2.2 * s, U.shade(o.hat, -0.2));
    return out;
  }

  function cube(x, y, s, top, left, right) {
    // isometric cube, (x,y) = top vertex
    return poly(n(x) + ',' + n(y) + ' ' + n(x + s) + ',' + n(y + s * 0.5) + ' ' + n(x) + ',' + n(y + s) + ' ' + n(x - s) + ',' + n(y + s * 0.5), top) +
      poly(n(x - s) + ',' + n(y + s * 0.5) + ' ' + n(x) + ',' + n(y + s) + ' ' + n(x) + ',' + n(y + s * 2) + ' ' + n(x - s) + ',' + n(y + s * 1.5), left) +
      poly(n(x + s) + ',' + n(y + s * 0.5) + ' ' + n(x) + ',' + n(y + s) + ' ' + n(x) + ',' + n(y + s * 2) + ' ' + n(x + s) + ',' + n(y + s * 1.5), right);
  }

  function coin(x, y, r) {
    return circ(x, y, r, '#f2a318', 'stroke="#9c5704" stroke-width="' + n(r * 0.18) + '"') + circ(x, y, r * 0.6, '#ffd66b');
  }

  const ART = {};

  ART['block-battlegrounds'] = () => svg(
    rect(0, 0, 320, 180, 'url(#sky)') +
    (function () { let o = ''; const r = U.rng(3); for (let row = 0; row < 3; row++) for (let i = 0; i < 26; i++) o += rect(i * 13 - 4 + row * 5, 38 + row * 10, 9, 8, ['#ff5a6a', '#46a8ff', '#ffc940', '#4ad17f', '#b67cff'][Math.floor(r() * 5)], 'opacity="' + n(0.35 + row * 0.15) + '"'); return o; })() +
    poly('0,180 320,180 280,86 40,86', '#1c1626') +
    (function () { let o = ''; for (let i = 0; i <= 8; i++) o += line(40 + i * 30, 86, -20 + i * 45, 180, '#2e2440', 1.2); for (let j = 1; j < 5; j++) { const yy = 86 + j * j * 5.9; o += line(0, yy, 320, yy, '#2e2440', 1.2); } return o; })() +
    ell(160, 150, 120, 26, 'url(#glow)') +
    guy(108, 150, 1.45, { shirt: '#d9384a', pants: '#3a2130', hair: '#1f1a1a', armR: 150, armL: 25, emblem: '#ffd23f' }) +
    g(rect(-3, -46, 6, 46, '#dfe7f2') + rect(-8, -2, 16, 5, '#ffc940') + rect(-2, 3, 4, 9, '#6b4226'), 'translate(140 60) rotate(38)') +
    guy(214, 150, 1.45, { shirt: '#2e7bdc', pants: '#1c2a45', hair: '#ffd23f', armL: 100, armR: 12, skin: '#c68642', emblem: '#39f3ff' }) +
    rect(176, 84, 22, 9, '#39414f', 'rx="3"') + rect(168, 86, 10, 5, '#39f3ff') +
    circ(164, 88, 9, '#fff4d6', 'opacity=".95"') + path('M164 70l4 12 12 2-12 4-4 12-4-12-12-4 12-2z', '#ffd23f') +
    circ(150, 78, 2, '#ffd23f') + circ(178, 98, 2.4, '#ff7a2e') + circ(158, 104, 1.6, '#fff'),
    lin('sky', [[0, '#3b1d4f'], [0.55, '#1a1025'], [1, '#0d0a12']]) + rad('glow', [[0, '#ff7a2e', 0.55], [1, '#ff7a2e', 0]])
  );

  ART['skyline-racers'] = () => svg(
    rect(0, 0, 320, 180, 'url(#sky)') + circ(250, 70, 30, '#ffd08a', 'opacity=".9"') +
    (function () { let o = ''; const r = U.rng(11); let x = -10; while (x < 330) { const w = 18 + r() * 26, h = 40 + r() * 70; o += rect(x, 120 - h, w, h + 10, '#2a1740'); for (let yy = 124 - h; yy < 118; yy += 9) for (let xx = x + 4; xx < x + w - 4; xx += 7) if (r() > 0.45) o += rect(xx, yy, 3, 4, '#ffcf7a', 'opacity=".75"'); x += w + 3; } return o; })() +
    poly('0,180 320,180 320,126 0,120', '#1a1026') + poly('0,128 320,134 320,140 0,133', '#ff7a2e', 'opacity=".9"') +
    poly('0,150 320,158 320,180 0,180', '#241a33') +
    (function () { let o = ''; for (let i = 0; i < 8; i++) o += rect(i * 44 - 10, 160 + i * 0.3, 22, 3, '#ffd23f', 'opacity=".8"'); return o; })() +
    (function () { let o = ''; for (let i = 0; i < 7; i++) o += line(18 + i * 6, 100 + i * 7, 88 + i * 4, 100 + i * 7, '#ffffff', 1.6, 'opacity="' + n(0.15 + i * 0.05) + '"'); return o; })() +
    g(path('M0 30 L14 14 Q24 6 46 6 L78 6 Q96 6 108 18 L124 22 Q132 24 132 32 L132 38 L0 38 Z', '#ff3d5a') +
      path('M22 16 Q28 10 44 10 L74 10 Q86 10 94 18 Z', '#9fe8ff') + rect(0, 30, 132, 4, '#b8202f') +
      circ(28, 38, 11, '#15151c') + circ(28, 38, 5, '#c0c8d4') + circ(106, 38, 11, '#15151c') + circ(106, 38, 5, '#c0c8d4') +
      rect(124, 24, 8, 5, '#fff4b0'), 'translate(100 104)') +
    g(path('M0 22 L10 10 Q18 4 32 4 L54 4 Q66 4 74 12 L86 15 Q90 16 90 22 L90 26 L0 26 Z', '#2f8cff') + path('M16 11 Q20 7 31 7 L50 7 Q58 7 63 12 Z', '#bdf0ff') + circ(20, 27, 8, '#15151c') + circ(72, 27, 8, '#15151c'), 'translate(20 94) scale(.8)'),
    lin('sky', [[0, '#4b1f7a'], [0.5, '#c2437a'], [1, '#ff9a5c']])
  );

  ART['treasure-islands'] = () => svg(
    rect(0, 0, 320, 180, 'url(#sky)') + circ(58, 38, 18, '#fff3b0') +
    ell(70, 42, 30, 8, '#ffffff', 'opacity=".7"') + ell(250, 30, 36, 9, '#ffffff', 'opacity=".75"') +
    rect(0, 92, 320, 88, 'url(#sea)') +
    (function () { let o = ''; for (let i = 0; i < 12; i++) o += path('M' + (i * 30 - 6) + ' ' + (110 + (i % 3) * 22) + ' q7 -5 14 0 t14 0', 'none', 'stroke="#bff3ff" stroke-width="2" opacity=".5"'); return o; })() +
    ell(170, 128, 110, 26, '#f4d58d') + ell(170, 122, 96, 18, '#ffe3a3') +
    path('M112 124 Q108 88 122 58', 'none', 'stroke="#8b5a2b" stroke-width="7" stroke-linecap="round"') +
    path('M122 58 q-30 -8 -42 10 q22 -4 42 -10 q-14 -24 -40 -22 q26 8 40 22 q8 -26 34 -30 q-24 14 -34 30 q30 -10 44 6 q-26 -6 -44 -6z', '#2fae62') +
    g(rect(0, 12, 50, 26, '#8b5a2b', 'rx="3"') + rect(0, 20, 50, 4, '#c8963e') + path('M0 12 Q25 -8 50 12 Z', '#a0692f') + rect(21, 18, 8, 10, '#ffd23f', 'rx="1.5"') +
      ell(25, 6, 26, 12, '#ffd23f', 'opacity=".5"'), 'translate(180 88) rotate(-4)') +
    coin(196, 84, 5) + coin(214, 80, 4) + coin(226, 88, 5) + coin(240, 124, 4) +
    g(path('M0 10 L40 10 L34 20 L6 20 Z', '#7a4a2a') + line(20, 10, 20, -14, '#6b4226', 2) + poly('20,-14 20,6 36,4', '#f4f1ea'), 'translate(262 96)') +
    guy(150, 126, 0.85, { shirt: '#ff6f61', pants: '#f59e0b', hat: '#c8a46a', armR: 120 }),
    lin('sky', [[0, '#45c4ff'], [1, '#bdf0ff']]) + lin('sea', [[0, '#1fb5c9'], [1, '#0a6b8f']])
  );

  ART['towerfall-legends'] = () => svg(
    rect(0, 0, 320, 180, 'url(#sky)') +
    ell(80, 120, 160, 60, '#3f8f3a') + ell(270, 126, 140, 58, '#377f33') + rect(0, 120, 320, 60, '#3d8a38') +
    path('M-10 150 C 60 120, 90 170, 150 140 S 250 100, 330 128', 'none', 'stroke="#d8b878" stroke-width="18" stroke-linecap="round"') +
    path('M-10 150 C 60 120, 90 170, 150 140 S 250 100, 330 128', 'none', 'stroke="#c7a563" stroke-width="2" stroke-dasharray="6 8"') +
    (function () { const tw = (x, y, h, flag) => rect(x - 13, y - h, 26, h, '#9aa5b5') + rect(x - 13, y - h, 26, 5, '#b8c2cf') + rect(x - 16, y - h - 8, 6, 8, '#9aa5b5') + rect(x - 3, y - h - 8, 6, 8, '#9aa5b5') + rect(x + 10, y - h - 8, 6, 8, '#9aa5b5') + rect(x - 4, y - h * 0.6, 8, 10, '#2a2f3a', 'rx="4"') + line(x, y - h - 8, x, y - h - 30, '#6b4226', 2) + poly(n(x) + ',' + n(y - h - 30) + ' ' + n(x + 16) + ',' + n(y - h - 25) + ' ' + n(x) + ',' + n(y - h - 20), flag); return tw(70, 132, 40, '#46a8ff') + tw(186, 116, 48, '#ff7a2e') + tw(262, 146, 36, '#b67cff'); })() +
    (function () { let o = ''; const pts = [[118, 150], [132, 145], [230, 118], [246, 116], [296, 124]]; pts.forEach((p, i) => { o += ell(p[0], p[1], 7, 6, i % 2 ? '#d9384a' : '#7a2f9e') + circ(p[0] - 2, p[1] - 2, 1.4, '#fff') + circ(p[0] + 2, p[1] - 2, 1.4, '#fff') + rect(p[0] - 8, p[1] - 12, 16, 2.5, '#1b1b22') + rect(p[0] - 8, p[1] - 12, 16 * (0.3 + (i % 3) * 0.25), 2.5, '#4ad17f'); }); return o; })() +
    line(186, 70, 222, 108, '#ffe9a3', 2) + poly('222,108 214,106 219,100', '#ffe9a3') + circ(150, 52, 5, '#2a2f3a') + path('M100 60 q25 -30 50 -8', 'none', 'stroke="#fff" stroke-width="1.5" stroke-dasharray="3 4" opacity=".7"'),
    lin('sky', [[0, '#7cc7ff'], [1, '#d8f1ff']])
  );

  ART['pet-world'] = () => svg(
    rect(0, 0, 320, 180, 'url(#sky)') + ell(60, 40, 34, 10, '#fff', 'opacity=".8"') + ell(240, 28, 40, 10, '#fff', 'opacity=".8"') +
    ell(160, 190, 240, 80, '#8fdc7a') + ell(40, 150, 90, 40, '#7ccf68') +
    g(ell(0, 0, 34, 42, '#fff6e0') + circ(-12, -12, 7, '#ff9ad5') + circ(10, 6, 9, '#8fd3ff') + circ(-6, 20, 6, '#ffd23f') + circ(14, -22, 5, '#b67cff') + path('M-34 -4 l10 -8 10 8 10 -8 10 8 10 -8 10 8 8 -6', 'none', 'stroke="#e7d7b0" stroke-width="2.5"'), 'translate(160 92)') +
    (function () {
      const pet = (x, y, c, ear, s) => g(ell(0, 12, 24, 20, c) + (ear === 'cat' ? poly('-18,-2 -12,-18 -4,-4', c) + poly('18,-2 12,-18 4,-4', c) : ear === 'bunny' ? ell(-8, -14, 5, 14, c) + ell(8, -14, 5, 14, c) : ell(-18, 0, 7, 11, U.shade(c, -0.2)) + ell(18, 0, 7, 11, U.shade(c, -0.2))) +
        circ(-8, 8, 4, '#1b1b22') + circ(8, 8, 4, '#1b1b22') + circ(-6.8, 6.8, 1.4, '#fff') + circ(9.2, 6.8, 1.4, '#fff') + ell(0, 16, 3, 2, '#ff7a90') + ell(-15, 16, 4, 2.5, '#ff9ab8', 'opacity=".7"') + ell(15, 16, 4, 2.5, '#ff9ab8', 'opacity=".7"'),
        'translate(' + x + ' ' + y + ') scale(' + s + ')');
      return pet(66, 128, '#ffb870', 'cat', 1.1) + pet(250, 124, '#b9a7ff', 'bunny', 1.15) + pet(110, 150, '#8fe0ff', 'dog', 0.8) + pet(214, 154, '#ff9aa2', 'cat', 0.75);
    })() +
    coin(40, 90, 6) + coin(286, 84, 7) + coin(120, 72, 4) + coin(204, 60, 5) + path('M280 60l2 6 6 2-6 2-2 6-2-6-6-2 6-2z', '#fff'),
    lin('sky', [[0, '#ffc3e6'], [1, '#c9e8ff']])
  );

  ART['sky-obby'] = () => svg(
    rect(0, 0, 320, 180, 'url(#sky)') +
    ell(50, 150, 70, 20, '#fff', 'opacity=".9"') + ell(280, 160, 80, 22, '#fff', 'opacity=".9"') + ell(180, 30, 50, 12, '#fff', 'opacity=".8"') +
    cube(40, 118, 22, '#ff6b6b', '#d64545', '#b83232') + cube(106, 94, 20, '#ffd23f', '#e0a800', '#c28f00') + cube(172, 104, 20, '#4ad17f', '#2fae62', '#23874b') +
    cube(238, 76, 22, '#46a8ff', '#2f7fd6', '#2566b0') + cube(292, 58, 18, '#b67cff', '#8f55e0', '#743fc2') +
    rect(150, 70, 40, 6, '#ff3b3b', 'rx="2"') + circ(170, 73, 16, 'none', 'stroke="#ff3b3b" stroke-width="2" stroke-dasharray="4 5" opacity=".6"') +
    line(238, 76, 238, 44, '#e8ecf1', 2.5) + poly('238,44 262,50 238,57', '#4ad17f') +
    path('M60 100 Q100 40 138 74', 'none', 'stroke="#fff" stroke-width="2" stroke-dasharray="3 5" opacity=".8"') +
    g(guy(0, 0, 0.9, { shirt: '#ff7a2e', pants: '#2f4a7a', armL: 150, armR: 150, hat: '#ff7a2e' }), 'translate(96 66) rotate(-12)'),
    lin('sky', [[0, '#2f8cff'], [0.7, '#8fd3ff'], [1, '#d6f1ff']])
  );

  ART['city-life'] = () => svg(
    rect(0, 0, 320, 180, 'url(#sky)') +
    (function () { let o = ''; const r = U.rng(21); const cols = ['#3b4a6b', '#4b3b6b', '#2e5a6b', '#5a3b4b', '#3b5a4b']; let x = -6; while (x < 330) { const w = 34 + r() * 30, h = 60 + r() * 60; const c = cols[Math.floor(r() * cols.length)]; o += rect(x, 132 - h, w, h, c) + rect(x, 132 - h, w, 4, U.shade(c, 0.2)); for (let yy = 140 - h; yy < 124; yy += 12) for (let xx = x + 5; xx < x + w - 6; xx += 10) o += rect(xx, yy, 6, 7, r() > 0.4 ? '#ffd88a' : '#1d2436'); x += w + 2; } return o; })() +
    rect(0, 132, 320, 12, '#8a93a3') + rect(0, 144, 320, 36, '#2a2f3a') +
    (function () { let o = ''; for (let i = 0; i < 9; i++) o += rect(i * 40, 160, 22, 3, '#ffd23f'); return o; })() +
    line(66, 132, 66, 88, '#39414f', 3) + path('M66 88 q12 0 14 8', 'none', 'stroke="#39414f" stroke-width="3"') + ell(80, 97, 7, 3, '#fff3b0') + ell(80, 118, 26, 30, '#fff3b0', 'opacity=".15"') +
    g(rect(0, 8, 70, 18, '#ffd23f', 'rx="5"') + path('M12 8 Q18 -6 34 -6 L48 -6 Q58 -6 62 8 Z', '#ffe98a') + rect(18, -3, 16, 9, '#9fe8ff') + rect(38, -3, 16, 9, '#9fe8ff') + circ(16, 26, 7, '#15151c') + circ(54, 26, 7, '#15151c') + rect(28, 4, 16, 6, '#1b1b22') , 'translate(170 142)') +
    guy(120, 142, 0.75, { shirt: '#ff6f61', pants: '#2f4a7a', hair: '#1f2a44' }) + guy(140, 142, 0.7, { shirt: '#4ad17f', pants: '#5b6b3a', hair: '#ffd23f', skin: '#c68642' }) + guy(282, 142, 0.72, { shirt: '#b67cff', pants: '#22262e', hair: '#ff4fd8', skin: '#8d5524' }),
    lin('sky', [[0, '#1f2a5a'], [0.6, '#6a4c8f'], [1, '#ffa67a']])
  );

  ART['dungeon-frontier'] = () => svg(
    rect(0, 0, 320, 180, '#1a1720') +
    (function () { let o = ''; for (let row = 0; row < 12; row++) for (let i = 0; i < 12; i++) o += rect(i * 30 - (row % 2) * 15, row * 15, 28, 13, row % 3 === 0 && i % 4 === 1 ? '#2b2632' : '#26212d', 'rx="1.5"'); return o; })() +
    ell(160, 150, 150, 40, '#0d0b12', 'opacity=".7"') +
    path('M120 180 L120 80 Q160 40 200 80 L200 180 Z', '#0b0a0f') + path('M126 180 L126 82 Q160 48 194 82 L194 180', 'none', 'stroke="#3b3542" stroke-width="5"') +
    (function () { const torch = (x) => rect(x - 3, 70, 6, 18, '#6b4226') + path('M' + (x - 6) + ' 70 Q' + x + ' 50 ' + (x + 6) + ' 70 Z', '#ff9d3c') + path('M' + (x - 3) + ' 70 Q' + x + ' 58 ' + (x + 3) + ' 70 Z', '#ffe066') + circ(x, 66, 36, 'url(#torch)'); return torch(70) + torch(250); })() +
    rect(0, 150, 320, 30, '#221d29') +
    g(rect(0, 12, 44, 24, '#7a4a2a', 'rx="3"') + path('M0 12 Q22 -6 44 12 Z', '#8b5a2b') + rect(0, 18, 44, 4, '#c8963e') + rect(18, 16, 8, 10, '#ffd23f') + ell(22, 12, 30, 16, '#ffd23f', 'opacity=".25"'), 'translate(220 126)') +
    g(rect(-8, -34, 16, 16, '#e8e4d8', 'rx="3"') + rect(-5, -28, 3, 3, '#1b1b22') + rect(2, -28, 3, 3, '#1b1b22') + rect(-7, -18, 14, 18, '#d8d2c2') + line(-7, -14, 7, -14, '#9a9486', 1.5) + line(-7, -9, 7, -9, '#9a9486', 1.5) + rect(-7, 0, 5, 16, '#d8d2c2') + rect(2, 0, 5, 16, '#d8d2c2') + line(8, -16, 22, -30, '#b8c2cf', 3), 'translate(262 150)') +
    guy(94, 160, 1.2, { shirt: '#3a5a9a', pants: '#3a2a20', hair: '#c9a36b', armR: 120, armL: 40, emblem: '#ffd23f' }) +
    g(rect(-2.5, -40, 5, 40, '#dfe7f2') + rect(-7, -1, 14, 4, '#ffc940'), 'translate(118 82) rotate(55)') +
    g(path('M-12 -14 L12 -14 L12 4 Q0 16 -12 4 Z', '#b8202f') + path('M-6 -8 L6 -8 L6 2 Q0 8 -6 2 Z', '#ffd23f'), 'translate(74 122)'),
    rad('torch', [[0, '#ffb454', 0.35], [1, '#ffb454', 0]])
  );

  ART['elemental-clash'] = () => svg(
    rect(0, 0, 320, 180, 'url(#bg)') + stars(40, 5, 180, '#cfe3ff') +
    ell(160, 150, 130, 22, '#2a2140') + ell(160, 146, 118, 16, '#3a2e58') +
    (function () {
      const orb = (x, y, c1, c2) => circ(x, y, 34, 'url(#h' + c1.slice(1) + ')') + circ(x, y, 16, c2) + circ(x, y, 9, '#fff', 'opacity=".85"');
      return '<defs>' + ['#ff7a2e', '#46a8ff', '#4ad17f', '#dffaff'].map((c) => rad('h' + c.slice(1), [[0, c, 0.8], [1, c, 0]])).join('') + '</defs>' +
        path('M60 50 L160 92 L260 50', 'none', 'stroke="#ffd23f" stroke-width="3" opacity=".7"') + path('M60 134 L160 92 L260 134', 'none', 'stroke="#fff" stroke-width="2" opacity=".5"') +
        orb(60, 50, '#ff7a2e', '#ff9d3c') + orb(260, 50, '#46a8ff', '#7cc6ff') + orb(60, 134, '#4ad17f', '#86e3a8') + orb(260, 134, '#dffaff', '#e9fbff');
    })() +
    path('M160 60 l8 22 22 8 -22 8 -8 22 -8 -22 -22 -8 22 -8z', '#fff4d6') + circ(160, 92, 10, '#ffffff'),
    rad('bg', [[0, '#2e1f55'], [1, '#0d0a1a']], 0.5, 0.5, 0.75)
  );

  ART['zombie-outbreak'] = () => svg(
    rect(0, 0, 320, 180, 'url(#sky)') + circ(254, 42, 22, '#e9f0d8') + circ(262, 38, 22, '#1b2b24') + stars(30, 9, 90, '#d8ffe0') +
    path('M40 132 L40 70 L110 40 L180 70 L180 132 Z', '#1a1f1c') + rect(64, 84, 26, 24, '#f7d774', 'opacity=".85"') + line(60, 88, 94, 104, '#6b4226', 5) + line(60, 102, 94, 90, '#6b4226', 5) +
    rect(124, 88, 26, 44, '#0f1311') + rect(0, 132, 320, 48, '#1f2a22') + ell(160, 136, 200, 10, '#9fbfa8', 'opacity=".18"') +
    (function () {
      const z = (x, y, s, c) => g(rect(-6, -22, 12, 22, '#3a3f2f') + rect(-8, -44, 16, 22, c) + g(rect(-3, 0, 6, 20, c), 'translate(-9 -42) rotate(-80)') + g(rect(-3, 0, 6, 20, c), 'translate(9 -42) rotate(-100)') + rect(-8, -60, 16, 16, '#7fbf6a', 'rx="2"') + rect(-5, -54, 3, 3, '#ff4040') + rect(2, -54, 3, 3, '#ff4040') + rect(-4, -48, 8, 2, '#1b1b22'), 'translate(' + x + ' ' + y + ') scale(' + s + ')');
      return z(212, 150, 1.1, '#4a5a3a') + z(250, 158, 1.25, '#5a4a3a') + z(292, 148, 1.0, '#3a4a5a') + z(190, 160, 0.9, '#4a3a4a');
    })() +
    ell(160, 178, 190, 16, '#9fbfa8', 'opacity=".2"'),
    lin('sky', [[0, '#0b1712'], [1, '#27402f']])
  );

  ART['factory-tycoon'] = () => svg(
    rect(0, 0, 320, 180, 'url(#bg)') +
    (function () { let o = ''; for (let i = 0; i < 11; i++) o += rect(i * 32, 0, 2, 120, '#2a3342'); return o; })() +
    rect(0, 120, 320, 60, '#2b3240') + poly('0,128 320,96 320,112 0,146', '#474f5e') + poly('0,128 320,96 320,99 0,131', '#6b7383') +
    (function () { let o = ''; for (let i = 0; i < 9; i++) { const x = 8 + i * 36, y = 124 - i * 3.6; o += cube(x + 8, y - 14, 8, ['#ffd23f', '#39f3ff', '#ff7a2e'][i % 3], U.shade(['#ffd23f', '#39f3ff', '#ff7a2e'][i % 3], -0.25), U.shade(['#ffd23f', '#39f3ff', '#ff7a2e'][i % 3], -0.45)); } return o; })() +
    (function () { const dropper = (x, y) => rect(x - 18, y - 40, 36, 30, '#5b6b82') + rect(x - 18, y - 40, 36, 6, '#7a8aa3') + rect(x - 8, y - 10, 16, 10, '#39414f') + circ(x, y - 25, 6, '#4ad17f'); return dropper(70, 104) + dropper(170, 92) + dropper(262, 82); })() +
    (function () { const gear = (x, y, r, c) => { let o = circ(x, y, r, c); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; o += rect(x + Math.cos(a) * r - 3, y + Math.sin(a) * r - 3, 6, 6, c, 'transform="rotate(' + n((a * 180) / Math.PI) + ' ' + n(x + Math.cos(a) * r) + ' ' + n(y + Math.sin(a) * r) + ')"'); } return o + circ(x, y, r * 0.4, '#1a1f29'); }; return gear(40, 34, 16, '#8b95a7') + gear(66, 50, 10, '#6b7383') + gear(288, 30, 14, '#8b95a7'); })() +
    g(rect(0, 0, 48, 34, '#3fd08a', 'rx="4"') + path('M24 6 v22 M31 11 q-7 -5 -13 0 q-4 5 6 6 q10 1 6 7 q-6 5 -13 0', 'none', 'stroke="#0d3b24" stroke-width="3" stroke-linecap="round"'), 'translate(252 132)'),
    lin('bg', [[0, '#1c2230'], [1, '#141821']])
  );

  ART['treasure-tycoon'] = () => svg(
    rect(0, 0, 320, 180, '#1f9ec0') +
    (function () { let o = ''; for (let i = 0; i < 16; i++) o += path('M' + ((i * 47) % 320) + ' ' + (10 + ((i * 37) % 170)) + ' q6 -4 12 0 t12 0', 'none', 'stroke="#9fe8ff" stroke-width="1.6" opacity=".45"'); return o; })() +
    path('M40 140 Q20 80 90 60 Q150 20 230 50 Q300 70 286 130 Q270 170 170 166 Q70 170 40 140 Z', '#f0d38c') +
    path('M60 132 Q46 86 100 70 Q150 40 220 62 Q280 78 268 124 Q254 156 170 154 Q84 158 60 132 Z', '#6fbf5a') +
    ell(210, 100, 36, 20, '#4f9a45') +
    (function () { const hut = (x, y, c) => rect(x - 14, y - 14, 28, 16, '#b5773e') + poly(n(x - 18) + ',' + n(y - 14) + ' ' + n(x) + ',' + n(y - 30) + ' ' + n(x + 18) + ',' + n(y - 14), c) + rect(x - 4, y - 8, 8, 10, '#5b3a1e'); return hut(96, 104, '#d9384a') + hut(140, 88, '#2f7fd6') + hut(184, 128, '#ff9d3c'); })() +
    g(rect(-22, -10, 44, 24, '#7a6a5a', 'rx="3"') + rect(-22, -10, 44, 6, '#9a8a7a') + ell(0, -14, 20, 10, '#ffd23f') + coin(-8, -18, 4) + coin(6, -20, 4) + coin(0, -12, 4), 'translate(236 116)') +
    guy(122, 132, 0.55, { shirt: '#ff6f61', pants: '#5b6b3a' }) + guy(212, 84, 0.5, { shirt: '#ffd23f', pants: '#2f4a7a', armR: 140 }) +
    g(path('M0 8 L34 8 L28 16 L6 16 Z', '#7a4a2a') + line(17, 8, 17, -12, '#6b4226', 2) + poly('17,-12 17,4 30,2', '#f4f1ea'), 'translate(20 40)'),
    ''
  );

  ART['mega-miners'] = () => svg(
    rect(0, 0, 320, 30, '#8fd3ff') + rect(0, 26, 320, 8, '#4ad17f') + rect(0, 34, 320, 40, '#8b5a2b') + rect(0, 74, 320, 50, '#6b7383') + rect(0, 124, 320, 56, '#3b3f4f') +
    (function () {
      let o = ''; const r = U.rng(31);
      for (let row = 0; row < 12; row++) for (let i = 0; i < 20; i++) { const y = 34 + row * 12, x = i * 16; if (r() > 0.86) { const c = row < 3 ? '#2a2a2a' : row < 7 ? (r() > 0.5 ? '#d8a64b' : '#c0c8d4') : (r() > 0.5 ? '#46e0ff' : '#ff4f6a'); o += rect(x + 4, y + 3, 8, 6, c, 'rx="1.5"'); } }
      for (let row = 0; row <= 12; row++) o += line(0, 34 + row * 12, 320, 34 + row * 12, '#000', 0.6, 'opacity=".15"');
      return o;
    })() +
    rect(144, 26, 32, 110, '#1b1c24') + rect(176, 118, 64, 18, '#1b1c24') + ell(190, 126, 44, 22, '#ffd88a', 'opacity=".22"') +
    guy(196, 136, 0.62, { shirt: '#ff9d3c', pants: '#2f4a7a', hat: '#ffd23f', armR: 110 }) +
    g(line(0, 0, 0, 20, '#8b5a2b', 3) + path('M-10 2 Q0 -6 10 2', 'none', 'stroke="#cfd6df" stroke-width="3.5" stroke-linecap="round"'), 'translate(214 104) rotate(60)') +
    rect(84, 18, 40, 10, '#6b4226') + rect(88, 6, 32, 14, '#d9384a') + rect(94, 9, 20, 8, '#fff') + circ(104, 13, 2.4, '#ffd23f'),
    ''
  );

  ART['battle-boats'] = () => svg(
    rect(0, 0, 320, 180, 'url(#sea)') +
    (function () { let o = ''; for (let i = 0; i < 20; i++) o += path('M' + ((i * 53) % 320) + ' ' + (8 + ((i * 29) % 170)) + ' q6 -4 12 0 t12 0', 'none', 'stroke="#bff3ff" stroke-width="1.6" opacity=".4"'); return o; })() +
    ell(270, 150, 50, 22, '#e8d49a') + ell(268, 146, 40, 16, '#5aa84a') +
    (function () {
      const boat = (x, y, rot, hull, sail) => g(path('M-34 0 Q-30 -14 0 -14 Q30 -14 40 0 Q30 14 0 14 Q-30 14 -34 0 Z', hull) + path('M-26 0 Q-22 -9 0 -9 Q24 -9 32 0 Q24 9 0 9 Q-22 9 -26 0 Z', U.shade(hull, 0.25)) + rect(-6, -3, 12, 6, '#6b4226') + poly('0,-2 10,-26 -8,-20', sail) + rect(-20, -16, 6, 4, '#1b1b22') + rect(-20, 12, 6, 4, '#1b1b22') + rect(8, -16, 6, 4, '#1b1b22') + rect(8, 12, 6, 4, '#1b1b22'), 'translate(' + x + ' ' + y + ') rotate(' + rot + ')');
      return boat(92, 70, 18, '#2f6fe0', '#e8f3ff') + boat(214, 110, 200, '#d9384a', '#fff0f0');
    })() +
    circ(150, 88, 4, '#1b1b22') + circ(132, 82, 7, '#f0f0f0', 'opacity=".75"') + circ(124, 78, 5, '#f0f0f0', 'opacity=".5"') +
    ell(196, 124, 12, 5, '#ffffff', 'opacity=".8"') + circ(196, 116, 5, '#ff9d3c') + circ(200, 112, 3, '#ffe066'),
    lin('sea', [[0, '#1582b8'], [1, '#0b4f7a']])
  );

  ART['pixel-soccer'] = () => svg(
    rect(0, 0, 320, 180, '#2f9e44') +
    (function () { let o = ''; for (let i = 0; i < 8; i++) if (i % 2) o += rect(i * 40, 0, 40, 180, '#34ab4b'); return o; })() +
    rect(12, 12, 296, 156, 'none', 'stroke="#e8f7ea" stroke-width="3"') + line(160, 12, 160, 168, '#e8f7ea', 3) + circ(160, 90, 26, 'none', 'stroke="#e8f7ea" stroke-width="3"') +
    rect(12, 58, 36, 64, 'none', 'stroke="#e8f7ea" stroke-width="3"') + rect(272, 58, 36, 64, 'none', 'stroke="#e8f7ea" stroke-width="3"') +
    rect(2, 72, 10, 36, '#f4f4f4', 'opacity=".9"') + rect(308, 72, 10, 36, '#f4f4f4', 'opacity=".9"') +
    (function () {
      const p = (x, y, c, s) => circ(x, y + 2, 13 * s, '#000', 'opacity=".2"') + circ(x, y, 12 * s, c) + circ(x, y, 7 * s, '#f1c27d') + rect(x - 7 * s, y - 7 * s, 14 * s, 4 * s, '#3a2a20', 'rx="2"');
      return p(118, 70, '#d9384a', 1) + p(96, 118, '#d9384a', 1) + p(214, 96, '#2f6fe0', 1) + p(250, 56, '#2f6fe0', 1) + p(286, 92, '#ffd23f', 0.9);
    })() +
    circ(176, 84, 7, '#ffffff') + path('M176 79 l3 3 -1 4 h-4 l-1 -4z', '#1b1b22') + path('M150 88 q10 -2 20 -3', 'none', 'stroke="#fff" stroke-width="2" opacity=".6"'),
    ''
  );

  ART['cosmic-survival'] = () => svg(
    rect(0, 0, 320, 180, 'url(#bg)') + stars(90, 44, 180) +
    circ(262, 136, 44, 'url(#planet)') + ell(262, 136, 70, 12, 'none', 'stroke="#ffd9a3" stroke-width="3" opacity=".7" transform="rotate(-18 262 136)"') +
    (function () {
      const rock = (x, y, r, c) => path('M' + n(x - r) + ' ' + n(y) + ' L' + n(x - r * 0.5) + ' ' + n(y - r * 0.9) + ' L' + n(x + r * 0.6) + ' ' + n(y - r * 0.8) + ' L' + n(x + r) + ' ' + n(y + r * 0.1) + ' L' + n(x + r * 0.4) + ' ' + n(y + r * 0.9) + ' L' + n(x - r * 0.6) + ' ' + n(y + r * 0.7) + ' Z', c) + circ(x - r * 0.2, y - r * 0.1, r * 0.22, U.shade(c, -0.25));
      return rock(60, 40, 18, '#8a7f76') + rock(200, 36, 12, '#9a8f86') + rock(96, 132, 14, '#7a6f66') + rock(230, 70, 8, '#8a7f76') +
        path('M300 10 L250 44', 'none', 'stroke="#ffb454" stroke-width="4" opacity=".6" stroke-linecap="round"') + circ(250, 44, 5, '#ffd08a');
    })() +
    g(poly('0,-16 12,14 0,8 -12,14', '#e8ecf1') + poly('0,-16 5,0 -5,0', '#46a8ff') + poly('-5,11 5,11 0,26', '#ff7a2e') + poly('-3,11 3,11 0,20', '#ffe066'), 'translate(150 96) rotate(30)') +
    line(158, 82, 196, 52, '#39f3ff', 2.5) +
    path('M120 70 l4 -9 4 9 -4 9z', '#39f3ff') + path('M180 120 l3 -7 3 7 -3 7z', '#39f3ff') + circ(150, 96, 28, 'none', 'stroke="#46a8ff" stroke-width="2" opacity=".5"'),
    lin('bg', [[0, '#0a0b1e'], [1, '#1a1040']]) + rad('planet', [[0, '#ff9d5c'], [1, '#8a2f4a']], 0.35, 0.35, 0.7)
  );

  ART['castle-siege'] = () => svg(
    rect(0, 0, 320, 180, 'url(#sky)') + circ(250, 58, 26, '#ffe0a3', 'opacity=".9"') +
    ell(90, 150, 140, 50, '#4a6b3a') + rect(0, 150, 320, 30, '#3f5a32') +
    rect(24, 70, 100, 70, '#8b8f9a') + (function () { let o = ''; for (let i = 0; i < 9; i++) o += rect(24 + i * 11.5, 62, 7, 10, '#8b8f9a'); return o; })() +
    rect(10, 44, 30, 96, '#9aa1ad') + rect(108, 44, 30, 96, '#9aa1ad') + poly('6,44 25,18 44,44', '#d9384a') + poly('104,44 123,18 142,44', '#d9384a') +
    rect(58, 100, 30, 40, '#3a2a20', 'rx="14"') + rect(20, 70, 8, 12, '#2a2f3a') + rect(118, 70, 8, 12, '#2a2f3a') +
    line(25, 18, 25, 4, '#6b4226', 2) + poly('25,4 40,8 25,12', '#ffd23f') +
    path('M130 60 Q200 -10 262 110', 'none', 'stroke="#fff" stroke-width="2" stroke-dasharray="3 5" opacity=".8"') + circ(262, 110, 6, '#4a4a4a') +
    (function () { let o = ''; for (let i = 0; i < 9; i++) { const x = 200 + i * 13, y = 150 - (i % 2) * 3; o += rect(x - 3, y - 18, 6, 12, '#5a1f2a') + rect(x - 3, y - 24, 6, 6, '#e0ac69') + line(x + 4, y - 26, x + 4, y - 6, '#b8c2cf', 1.4); } return o; })() +
    g(rect(-20, -6, 40, 10, '#6b4226') + circ(-12, 6, 6, '#3a2a20') + circ(12, 6, 6, '#3a2a20') + line(-10, -6, 16, -30, '#8b5a2b', 4) + circ(17, -31, 5, '#4a4a4a'), 'translate(180 150)'),
    lin('sky', [[0, '#5b3a7a'], [0.6, '#ff8a5c'], [1, '#ffd08a']])
  );

  ART['speed-trials'] = () => svg(
    rect(0, 0, 320, 180, '#0b0d17') +
    (function () { let o = ''; for (let i = 0; i < 16; i++) o += line(0, i * 12, 320, i * 12, '#16203a', 1); for (let i = 0; i < 27; i++) o += line(i * 12, 0, i * 12, 180, '#16203a', 1); return o; })() +
    path('M20 150 C 80 150, 60 40, 140 40 S 220 140, 300 60', 'none', 'stroke="#1e2a4a" stroke-width="36" stroke-linecap="round"') +
    path('M20 150 C 80 150, 60 40, 140 40 S 220 140, 300 60', 'none', 'stroke="#39f3ff" stroke-width="2" stroke-dasharray="10 8" opacity=".9"') +
    path('M20 132 C 70 132, 46 22, 140 22 S 200 122, 300 42', 'none', 'stroke="#ff4fd8" stroke-width="2.5" opacity=".9"') +
    path('M20 168 C 90 168, 74 58, 140 58 S 236 158, 300 78', 'none', 'stroke="#ff4fd8" stroke-width="2.5" opacity=".9"') +
    rect(132, 14, 6, 52, '#ffd23f', 'opacity=".9"') + rect(252, 60, 6, 44, '#ffd23f', 'opacity=".9" transform="rotate(40 255 82)"') +
    circ(210, 108, 9, '#b67cff', 'opacity=".35"') + circ(190, 92, 9, '#46a8ff', 'opacity=".35"') + circ(234, 112, 10, '#ffffff') + circ(234, 112, 5, '#39f3ff') +
    rect(12, 12, 108, 30, '#0b0d17', 'rx="6" stroke="#39f3ff" stroke-width="1.5"') +
    '<text x="66" y="34" font-family="monospace" font-size="18" font-weight="700" fill="#39f3ff" text-anchor="middle">0:42.18</text>' +
    rect(248, 14, 60, 20, '#12361f', 'rx="4"') + '<text x="278" y="29" font-family="monospace" font-size="12" font-weight="700" fill="#4ad17f" text-anchor="middle">-0.84</text>',
    ''
  );

  ART['pet-battle-arena'] = () => svg(
    rect(0, 0, 320, 180, 'url(#bg)') + ell(160, 150, 170, 40, '#3a2e58') + ell(160, 150, 150, 32, '#47386b') +
    ell(80, 140, 44, 10, '#000', 'opacity=".3"') + ell(240, 140, 44, 10, '#000', 'opacity=".3"') +
    g(ell(0, 0, 34, 28, '#ff7a2e') + poly('-26,-12 -18,-40 -6,-20', '#ff7a2e') + poly('26,-12 18,-40 6,-20', '#ff7a2e') + poly('-20,-18 -18,-32 -10,-20', '#ffd23f') + ell(0, 8, 18, 12, '#ffe0b8') + circ(-11, -4, 5, '#1b1b22') + circ(11, -4, 5, '#1b1b22') + circ(-9, -6, 1.8, '#fff') + circ(13, -6, 1.8, '#fff') + path('M30 10 q18 -4 22 -24 q-2 14 -22 24', '#ff9d3c'), 'translate(82 110)') +
    g(ell(0, 0, 36, 26, '#46a8ff') + poly('-6,-24 6,-44 16,-20', '#7cc6ff') + poly('-44,-6 -34,0 -44,10', '#46a8ff') + ell(4, 8, 20, 11, '#d6f1ff') + circ(-10, -4, 5, '#1b1b22') + circ(12, -4, 5, '#1b1b22') + circ(-8, -6, 1.8, '#fff') + circ(14, -6, 1.8, '#fff'), 'translate(240 108) scale(-1 1)') +
    rect(24, 20, 110, 14, '#1b1530', 'rx="7"') + rect(28, 24, 76, 6, '#4ad17f', 'rx="3"') + rect(186, 20, 110, 14, '#1b1530', 'rx="7"') + rect(190, 24, 44, 6, '#ffb52e', 'rx="3"') +
    path('M160 52 l-10 22 h10 l-6 22 18 -28 h-10 l8 -16z', '#ffd23f') +
    '<text x="160" y="126" font-family="Arial Black, sans-serif" font-size="22" fill="#ffffff" text-anchor="middle" opacity=".9">VS</text>',
    lin('bg', [[0, '#2a1f4a'], [1, '#120d22']])
  );

  ART['mystery-mansion'] = () => svg(
    rect(0, 0, 320, 180, 'url(#sky)') + stars(26, 77, 100, '#e0d8ff') + circ(248, 44, 24, '#f4ecd0') + circ(248, 44, 30, '#f4ecd0', 'opacity=".15"') +
    path('M40 150 L40 80 L70 60 L70 34 L84 20 L98 34 L98 60 L160 40 L222 60 L222 42 L236 30 L250 42 L250 80 L280 90 L280 150 Z', '#130f1d') +
    (function () { let o = ''; const lit = [[118, 76], [196, 100]]; for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) { const x = 58 + i * 36, y = 78 + r * 24; const isLit = lit.some((p) => p[0] === x && p[1] === y); o += rect(x, y, 12, 14, isLit ? '#ffcf6a' : '#241c33', 'rx="2"'); } return o; })() +
    rect(146, 116, 28, 34, '#2a1f33', 'rx="12"') + rect(0, 150, 320, 30, '#0d0b14') +
    path('M292 150 L296 104 M296 118 L310 100 M295 130 L282 112', 'none', 'stroke="#130f1d" stroke-width="4" stroke-linecap="round"') +
    (function () { const bat = (x, y, s) => path('M' + x + ' ' + y + ' q' + 6 * s + ' ' + -6 * s + ' ' + 12 * s + ' 0 q' + 2 * s + ' ' + -4 * s + ' ' + 4 * s + ' 0 q' + 6 * s + ' ' + -6 * s + ' ' + 12 * s + ' 0 q' + -8 * s + ' ' + 2 * s + ' ' + -14 * s + ' ' + 6 * s + ' q' + -6 * s + ' ' + -4 * s + ' ' + -14 * s + ' ' + -6 * s + 'z', '#0d0b14'); return bat(170, 22, 1) + bat(200, 34, 0.7) + bat(140, 38, 0.6); })() +
    g(circ(0, 0, 18, '#bfe6ff', 'opacity=".35" stroke="#d8a64b" stroke-width="5"') + line(12, 12, 30, 30, '#6b4226', 7), 'translate(54 128)'),
    lin('sky', [[0, '#1d1233'], [1, '#4a2f63']])
  );

  /** Generic art for user-created games, by template. */
  function templateArt(template, color, pattern) {
    const c = color || '#ff7a2e';
    const dark = U.shade(c, -0.55), mid = U.shade(c, -0.25), light = U.shade(c, 0.35);
    let pat = '';
    if (pattern === 'grid') for (let i = 0; i < 20; i++) pat += line(i * 20, 0, i * 20, 180, light, 1, 'opacity=".12"') + line(0, i * 20, 320, i * 20, light, 1, 'opacity=".12"');
    else if (pattern === 'stripes') for (let i = -10; i < 30; i++) pat += line(i * 20, 0, i * 20 + 180, 180, light, 6, 'opacity=".1"');
    else if (pattern === 'dots') for (let i = 0; i < 16; i++) for (let j = 0; j < 9; j++) pat += circ(i * 20 + 10, j * 20 + 10, 2.2, light, 'opacity=".18"');
    else if (pattern === 'stars') pat += stars(60, U.hash(c), 180, light);
    let art = '';
    if (template === 'arena') art = ell(160, 140, 120, 28, mid) + guy(126, 140, 1.2, { shirt: c, pants: dark, armR: 140 }) + guy(196, 140, 1.2, { shirt: '#e8ecf1', pants: '#39414f', armL: 120, skin: '#c68642' }) + path('M160 56 l5 14 14 5 -14 5 -5 14 -5 -14 -14 -5 14 -5z', '#ffe066');
    else if (template === 'racing') art = path('M-10 160 C 80 60, 240 200, 330 90', 'none', 'stroke="' + dark + '" stroke-width="40"') + path('M-10 160 C 80 60, 240 200, 330 90', 'none', 'stroke="#fff" stroke-width="2" stroke-dasharray="10 10"') + g(rect(0, 0, 40, 20, c, 'rx="5"') + rect(8, 3, 18, 7, '#bdf0ff') + circ(9, 20, 5, '#111') + circ(31, 20, 5, '#111'), 'translate(140 96) rotate(-10)');
    else if (template === 'obby') art = cube(70, 110, 20, c, mid, dark) + cube(140, 86, 18, light, c, mid) + cube(210, 100, 20, c, mid, dark) + cube(270, 70, 16, light, c, mid) + g(guy(0, 0, 0.8, { shirt: '#e8ecf1', pants: dark, armL: 150, armR: 150 }), 'translate(150 60) rotate(-10)');
    else if (template === 'simulator') art = coin(120, 90, 30) + coin(190, 70, 20) + coin(220, 120, 24) + coin(90, 140, 14) + guy(260, 150, 0.9, { shirt: c, pants: dark, armR: 130 });
    else art = path('M-10 130 C 80 60, 180 170, 330 100', 'none', 'stroke="' + light + '" stroke-width="22" opacity=".6"') + cube(96, 60, 18, '#9aa5b5', '#7a8494', '#5d6675') + cube(210, 76, 18, '#9aa5b5', '#7a8494', '#5d6675') + circ(150, 118, 8, '#d9384a') + circ(176, 126, 8, '#d9384a') + circ(250, 104, 8, '#7a2f9e');
    return svg(rect(0, 0, 320, 180, 'url(#bg)') + pat + art, lin('bg', [[0, U.shade(c, -0.35)], [1, U.shade(c, -0.7)]], 1, 1));
  }

  /**
   * Placeholder art for games without hand-drawn SVG (the 3D render replaces
   * it): the engine's template art in a colour from the game id. The id goes
   * into the SVG so every game's placeholder is unique (renders swap <img>s by
   * their placeholder URL).
   */
  const TYPE_TEMPLATE = { runner: 'racing', party: 'arena', tag: 'arena', fishing: 'simulator', farm: 'simulator', restaurant: 'simulator', flight: 'obby', golf: 'obby', spooky: 'towerdefense', quiz: 'obby' };
  function typeArt(game) {
    const colors = ['#ff7a2e', '#46a8ff', '#4ad17f', '#b67cff', '#ff4f9a', '#ffc940', '#39f3ff', '#e03e5a'];
    const c = colors[U.hash(game.id || game.name || 'x') % colors.length];
    const out = templateArt(TYPE_TEMPLATE[game.gameType] || game.template || 'arena', c, ['grid', 'stripes', 'dots', 'stars'][U.hash(game.id || '') % 4]);
    return out.replace('</svg>', '<desc>' + String(game.id || game.name).replace(/[<>&]/g, '') + '</desc></svg>');
  }

  const cache = new Map();

  BF.thumbs = {
    /** Raw SVG for a built-in game id. */
    svg(id) {
      return ART[id] ? ART[id]() : templateArt('arena', '#ff7a2e', 'grid');
    },
    /** data: URL for an <img>, cached. Accepts a game object or id. */
    url(game) {
      if (!game) return '';
      if (typeof game === 'string') game = (BF.catalog && BF.catalog.get(game)) || { id: game };
      if (game.thumbnail && game.thumbnail.type === 'image') return game.thumbnail.data;
      // a rendered 3D key-art thumbnail when one is ready; otherwise the SVG art now and the render later
      if (BF.thumb3d && game.name) {
        const r = BF.thumb3d.get(game);
        if (r) return r;
      }
      const key = game.thumbnail ? JSON.stringify(game.thumbnail) + (game.template || '') : game.id;
      if (cache.has(key)) { if (BF.thumb3d && game.name) BF.thumb3d.request(game, cache.get(key)); return cache.get(key); }
      const src = game.thumbnail && game.thumbnail.type === 'preset'
        ? templateArt(game.template || 'arena', game.thumbnail.color, game.thumbnail.pattern).replace('</svg>', '<desc>' + String(game.id || '').replace(/[<>&]/g, '') + '</desc></svg>')
        : ART[game.id] ? BF.thumbs.svg(game.id) : typeArt(game);
      const url = U.svgData(src);
      cache.set(key, url);
      if (BF.thumb3d && game.name) BF.thumb3d.request(game, url);
      return url;
    },
    template: templateArt,
    has: (id) => !!ART[id],
  };
})((window.BF = window.BF || {}));
