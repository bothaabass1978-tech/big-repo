/**
 * BlockForge — avatar equipping and the layered SVG avatar renderer.
 * Every item's `look` is drawn from parametric styles, so new items only need data.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const n = (v) => Math.round(v * 10) / 10;
  const R = (x, y, w, h, fill, extra) => '<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(h) + '" fill="' + fill + '"' + (extra ? ' ' + extra : '') + '/>';
  const C = (cx, cy, r, fill, extra) => '<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(r) + '" fill="' + fill + '"' + (extra ? ' ' + extra : '') + '/>';
  const E = (cx, cy, rx, ry, fill, extra) => '<ellipse cx="' + n(cx) + '" cy="' + n(cy) + '" rx="' + n(rx) + '" ry="' + n(ry) + '" fill="' + fill + '"' + (extra ? ' ' + extra : '') + '/>';
  const P = (d, fill, extra) => '<path d="' + d + '" fill="' + fill + '"' + (extra ? ' ' + extra : '') + '/>';
  const PG = (pts, fill, extra) => '<polygon points="' + pts + '" fill="' + fill + '"' + (extra ? ' ' + extra : '') + '/>';
  const D = (hex, a) => U.shade(hex, -a);
  const L = (hex, a) => U.shade(hex, a);
  const INK = '#1b1b22';

  /** Item id -> look params. A plain look object is accepted too (mannequins, previews). */
  function lookOf(id) {
    if (id && typeof id === 'object') return id;
    const it = id && BF.ITEMS[id];
    return it ? it.look || {} : null;
  }

  // ------------------------------------------------------------ part painters

  const BACK = {
    backpack: (l) => R(24, 52, 52, 34, D(l.c1, 0.1), 'rx="6"') + R(20, 58, 6, 22, l.c2, 'rx="2" opacity=".9"') + R(74, 58, 6, 22, l.c2, 'rx="2" opacity=".9"'),
    wings: (l) => {
      const glow = l.glow ? ' filter="url(#avglow)"' : '';
      const wing = (s) => P('M' + (50 + s * 14) + ' 58 C ' + (50 + s * 40) + ' 30, ' + (50 + s * 62) + ' 40, ' + (50 + s * 58) + ' 70 C ' + (50 + s * 50) + ' 66, ' + (50 + s * 52) + ' 82, ' + (50 + s * 40) + ' 84 C ' + (50 + s * 34) + ' 76, ' + (50 + s * 26) + ' 84, ' + (50 + s * 16) + ' 80 Z', l.c1, 'stroke="' + l.c2 + '" stroke-width="1.5"' + glow);
      return '<g class="av-wings">' + wing(-1) + wing(1) + '</g>';
    },
    cape: (l) => P('M30 52 L70 52 L80 124 Q50 132 20 124 Z', l.c1) + P('M30 52 L70 52 L74 60 L26 60 Z', D(l.c1, 0.2)),
    jetpack: (l) => R(18, 50, 14, 36, l.c1, 'rx="6"') + R(68, 50, 14, 36, l.c1, 'rx="6"') + R(20, 84, 10, 5, D(l.c1, 0.3)) + R(70, 84, 10, 5, D(l.c1, 0.3)) +
      '<g class="av-flame">' + P('M21 89 Q25 104 29 89 Z', l.c2) + P('M71 89 Q75 104 79 89 Z', l.c2) + P('M23 89 Q25 97 27 89 Z', '#ffe066') + P('M73 89 Q75 97 77 89 Z', '#ffe066') + '</g>',
    sword: (l) => R(64, 26, 6, 60, l.c1, 'transform="rotate(28 67 56)" rx="2"') + R(72, 14, 4, 22, l.c2, 'transform="rotate(28 74 25)"') + R(66, 30, 14, 4, '#ffc940', 'transform="rotate(28 73 32)"'),
    shell: (l) => E(50, 70, 32, 26, l.c1) + E(50, 70, 24, 19, l.c2, 'opacity=".55"'),
  };

  const HAIR_BACK = {
    long: (c) => R(24, 18, 52, 50, D(c, 0.12), 'rx="10"'),
    ponytail: (c) => P('M70 26 Q92 40 80 72 Q76 52 66 36 Z', D(c, 0.1)),
  };

  const HEAD = {
    block: (skin) => R(30, 12, 40, 40, skin, 'rx="6"') + R(62, 12, 8, 40, D(skin, 0.08), 'rx="3" opacity=".6"'),
    round: (skin) => R(30, 12, 40, 40, skin, 'rx="19"') + P('M62 16 A19 19 0 0 1 62 48 Z', D(skin, 0.08), 'opacity=".5"'),
    pumpkin: (skin, l) => E(50, 33, 23, 20, l.c1) + P('M40 14 Q36 33 40 52 M50 13 V53 M60 14 Q64 33 60 52', 'none', 'stroke="' + D(l.c1, 0.25) + '" stroke-width="1.6"') + R(47, 7, 6, 8, '#4b7a2a', 'rx="2"'),
    robot: (skin, l) => R(30, 12, 40, 40, l.c1, 'rx="4"') + R(30, 12, 40, 6, L(l.c1, 0.2), 'rx="3"') + C(34, 16, 1.4, D(l.c1, 0.35)) + C(66, 16, 1.4, D(l.c1, 0.35)) + C(34, 48, 1.4, D(l.c1, 0.35)) + C(66, 48, 1.4, D(l.c1, 0.35)) +
      R(49, 2, 2, 10, D(l.c1, 0.3)) + C(50, 2, 3, '#ff5a6a', 'class="av-blink"'),
    crystal: (skin, l) => PG('50,8 72,20 72,44 50,56 28,44 28,20', l.c1, 'opacity=".92"') + PG('50,8 72,20 50,30 28,20', L(l.c1, 0.4), 'opacity=".9"') + PG('72,20 72,44 50,56 50,30', D(l.c1, 0.2), 'opacity=".75"'),
    void: (skin, l) => R(30, 12, 40, 40, l.c1, 'rx="6" stroke="' + l.c2 + '" stroke-width="2" filter="url(#avglow)"') + C(38, 20, 0.9, '#fff') + C(60, 18, 0.7, '#fff') + C(64, 40, 1, '#fff') + C(44, 46, 0.6, '#fff') + C(52, 24, 0.5, '#fff') + E(50, 33, 9, 3, l.c2, 'opacity=".35"'),
  };

  function eye(x, y, color) {
    return R(x - 2.4, y - 3.2, 4.8, 6.4, color || INK, 'rx="2"') + C(x + 0.9, y - 1.4, 0.9, '#fff');
  }

  const FACE = {
    smile: () => eye(42, 29) + eye(58, 29) + P('M43 38 Q50 44 57 38', 'none', 'stroke="' + INK + '" stroke-width="2.2" stroke-linecap="round"'),
    grin: () => eye(42, 28) + eye(58, 28) + P('M41 36 H59 Q58 46 50 46 Q42 46 41 36 Z', INK) + R(43, 36, 14, 3, '#fff'),
    wink: () => eye(58, 29) + P('M39 29 Q42 26 45 29', 'none', 'stroke="' + INK + '" stroke-width="2" stroke-linecap="round"') + P('M44 39 Q51 43 57 37', 'none', 'stroke="' + INK + '" stroke-width="2.2" stroke-linecap="round"'),
    sleepy: () => P('M39 30 Q42 33 45 30 M55 30 Q58 33 61 30', 'none', 'stroke="' + INK + '" stroke-width="2" stroke-linecap="round"') + E(50, 40, 2.5, 2, INK) + '<text x="64" y="20" font-size="7" font-family="sans-serif" fill="#8fd3ff" font-weight="700">z</text>',
    determined: () => eye(42, 30) + eye(58, 30) + P('M38 24 L46 26 M62 24 L54 26', 'none', 'stroke="' + INK + '" stroke-width="2.2" stroke-linecap="round"') + R(44, 39, 12, 2.2, INK, 'rx="1"'),
    robot: () => R(37, 26, 10, 5, '#39f3ff', 'rx="1.5" class="av-blink"') + R(53, 26, 10, 5, '#39f3ff', 'rx="1.5" class="av-blink"') + R(41, 38, 18, 4, D('#39f3ff', 0.55), 'rx="1"') + R(43, 39, 3, 2, '#39f3ff') + R(48, 39, 3, 2, '#39f3ff') + R(53, 39, 3, 2, '#39f3ff'),
    star: () => PG('42,24 43.6,27.6 47.5,28 44.6,30.6 45.4,34.4 42,32.5 38.6,34.4 39.4,30.6 36.5,28 40.4,27.6', '#ffd23f', 'stroke="' + INK + '" stroke-width=".6"') + PG('58,24 59.6,27.6 63.5,28 60.6,30.6 61.4,34.4 58,32.5 54.6,34.4 55.4,30.6 52.5,28 56.4,27.6', '#ffd23f', 'stroke="' + INK + '" stroke-width=".6"') + P('M43 38 Q50 46 57 38 Z', INK),
    fangs: () => eye(42, 29, '#8b1e3f') + eye(58, 29, '#8b1e3f') + P('M42 38 Q50 43 58 38', 'none', 'stroke="' + INK + '" stroke-width="2" stroke-linecap="round"') + PG('45,39.5 47,39.8 46,43', '#fff') + PG('53,39.8 55,39.5 54,43', '#fff'),
  };

  const HAIR = {
    short: (c) => P('M29 22 Q29 9 50 9 Q71 9 71 22 L71 26 Q64 18 50 18 Q36 18 29 26 Z', c),
    spiky: (c) => PG('28,26 30,12 36,16 38,4 45,12 50,2 55,12 62,4 64,16 70,12 72,26 64,18 36,18', c),
    long: (c) => P('M28 26 Q28 8 50 8 Q72 8 72 26 L72 30 Q66 18 50 18 Q34 18 28 30 Z', c),
    bun: (c) => C(50, 6, 7, c) + P('M29 22 Q29 9 50 9 Q71 9 71 22 L71 25 Q64 17 50 17 Q36 17 29 25 Z', c),
    mohawk: (c) => P('M44 18 L44 6 Q46 -2 50 -4 Q54 -2 56 6 L56 18 Z', c) + R(30, 16, 40, 3, D(c, 0.3), 'opacity=".5"'),
    curly: (c) => C(34, 16, 7, c) + C(43, 11, 8, c) + C(54, 10, 8, c) + C(64, 15, 7, c) + C(70, 22, 5, c) + C(30, 22, 5, c),
    ponytail: (c) => P('M29 22 Q29 9 50 9 Q71 9 71 22 L71 26 Q64 18 50 18 Q36 18 29 26 Z', c) + C(70, 22, 4, D(c, 0.15)),
  };

  const HAT_BACK = {
    hood: (l) => R(23, 6, 54, 52, l.c1, 'rx="18"'),
  };

  const HAT = {
    cap: (l) => P('M29 20 Q29 4 50 4 Q71 4 71 20 Z', l.c1) + R(26, 18, 50, 5, l.c2, 'rx="2"') + C(50, 5, 2, D(l.c1, 0.2)) + P('M44 10 L50 7 L56 10 L50 14 Z', l.c2, 'opacity=".9"'),
    beanie: (l) => P('M29 22 Q29 2 50 2 Q71 2 71 22 Z', l.c1) + R(28, 16, 44, 7, l.c2, 'rx="2"') + C(50, 1, 4.5, l.c2),
    explorer: (l) => E(50, 17, 34, 5, D(l.c1, 0.08)) + P('M33 17 L35 3 Q50 -1 65 3 L67 17 Z', l.c1) + R(34, 11, 32, 4, l.c2),
    ears: (l) => E(40, 2, 5, 14, l.c1) + E(60, 2, 5, 14, l.c1) + E(40, 3, 2.4, 10, l.c2) + E(60, 3, 2.4, 10, l.c2) + R(33, 12, 34, 4, l.c1, 'rx="2"'),
    headphones: (l) => P('M28 28 Q28 4 50 4 Q72 4 72 28', 'none', 'stroke="' + l.c1 + '" stroke-width="4"') + R(23, 24, 9, 16, l.c1, 'rx="3"') + R(68, 24, 9, 16, l.c1, 'rx="3"') + R(25, 28, 5, 8, l.c2, 'rx="2"') + R(70, 28, 5, 8, l.c2, 'rx="2"'),
    hood: (l) => P('M24 40 Q22 8 50 6 Q78 8 76 40 L70 40 Q70 16 50 15 Q30 16 30 40 Z', l.c1) + P('M31 36 Q32 17 50 16 Q68 17 69 36', 'none', 'stroke="' + l.c2 + '" stroke-width="1.5" opacity=".8"'),
    wizard: (l) => E(50, 16, 30, 5, l.c1) + P('M36 16 L52 -22 Q58 -26 62 -18 L56 -16 L64 16 Z', l.c1) + C(46, 4, 2, l.c2) + C(56, -6, 1.6, l.c2) + R(36, 12, 28, 4, l.c2),
    blockcrown: (l) => R(30, 8, 40, 8, l.c1) + R(30, 2, 8, 7, l.c1) + R(46, 0, 8, 9, l.c1) + R(62, 2, 8, 7, l.c1) + R(32.5, 4, 3, 3, l.c2) + R(48.5, 2, 3, 3, l.c2) + R(64.5, 4, 3, 3, l.c2) + R(30, 14, 40, 2, D(l.c1, 0.3)),
    viking: (l) => P('M29 22 Q29 4 50 4 Q71 4 71 22 Z', l.c1) + R(28, 18, 44, 5, D(l.c1, 0.2)) + R(48, 4, 4, 18, D(l.c1, 0.25)) + P('M30 16 Q18 12 16 -2 Q24 6 32 10 Z', l.c2) + P('M70 16 Q82 12 84 -2 Q76 6 68 10 Z', l.c2),
    horns: (l) => P('M34 14 Q26 2 30 -10 Q34 2 40 10 Z', l.c1, 'stroke="' + l.c2 + '" stroke-width="1"') + P('M66 14 Q74 2 70 -10 Q66 2 60 10 Z', l.c1, 'stroke="' + l.c2 + '" stroke-width="1"'),
    helmet: (l) => C(50, 32, 27, l.c2, 'opacity=".35" stroke="' + L(l.c2, 0.4) + '" stroke-width="2"') + P('M32 26 Q50 14 68 26 L68 40 Q50 48 32 40 Z', l.c1) + C(40, 30, 0.9, '#fff') + C(56, 34, 1.1, '#fff') + C(62, 28, 0.7, '#fff') + C(47, 38, 0.6, '#fff') + P('M34 28 Q42 22 50 22', 'none', 'stroke="#fff" stroke-width="1.5" opacity=".6"') + R(40, 56, 20, 4, '#9aa5b5', 'rx="2"'),
    crown: (l) => PG('30,16 30,2 38,8 44,-2 50,6 56,-2 62,8 70,2 70,16', l.c1, 'stroke="' + D(l.c1, 0.3) + '" stroke-width="1"') + R(30, 12, 40, 4, D(l.c1, 0.2)) + R(47.5, 7, 5, 5, l.c2) + R(37, 9, 4, 4, '#46a8ff') + R(59, 9, 4, 4, '#4ad17f'),
    halo: (l) => '<g class="av-halo">' + E(50, -2, 22, 5.5, 'none', 'stroke="' + l.c1 + '" stroke-width="3.5" filter="url(#avglow)"') + E(50, -2, 22, 5.5, 'none', 'stroke="' + l.c2 + '" stroke-width="1.2"') +
      P('M34 -6 Q36 -14 38 -6 Z', l.c2) + P('M48 -8 Q50 -18 52 -8 Z', l.c2) + P('M62 -6 Q64 -14 66 -6 Z', l.c2) + '</g>',
  };

  const ACC = {
    glasses: (l) => R(37, 24, 11, 10, 'none', 'stroke="' + l.c1 + '" stroke-width="2" rx="1.5"') + R(52, 24, 11, 10, 'none', 'stroke="' + l.c1 + '" stroke-width="2" rx="1.5"') + R(48, 28, 4, 1.8, l.c1),
    monocle: (l) => C(58, 29, 6, 'rgba(200,230,255,.25)', 'stroke="' + l.c1 + '" stroke-width="1.8"') + P('M64 30 Q70 42 66 52', 'none', 'stroke="' + l.c1 + '" stroke-width="1"'),
    starshades: (l) => PG('42,21 44,26.5 49.5,27 45,30.5 46.5,36 42,33 37.5,36 39,30.5 34.5,27 40,26.5', l.c1) + PG('58,21 60,26.5 65.5,27 61,30.5 62.5,36 58,33 53.5,36 55,30.5 50.5,27 56,26.5', l.c1) + R(48, 28, 4, 1.6, INK),
    goggles: (l) => R(29, 25, 42, 5, l.c1) + C(42, 29, 6.5, l.c2, 'stroke="' + l.c1 + '" stroke-width="2.4"') + C(58, 29, 6.5, l.c2, 'stroke="' + l.c1 + '" stroke-width="2.4"') + C(40, 27, 1.5, '#fff', 'opacity=".8"') + C(56, 27, 1.5, '#fff', 'opacity=".8"'),
    visor: (l) => R(33, 24, 34, 9, INK, 'rx="4"') + R(35, 26, 30, 5, l.c1, 'rx="2.5" filter="url(#avglow)" class="av-pulse"'),
    mask: (l) => P('M31 22 Q50 16 69 22 L69 34 Q60 38 50 34 Q40 38 31 34 Z', l.c1) + E(42, 28, 3.6, 2.4, l.c2, 'filter="url(#avglow)"') + E(58, 28, 3.6, 2.4, l.c2, 'filter="url(#avglow)"'),
  };

  const SHIRT = {
    logo: (l) => ({ torso: R(28, 52, 44, 38, l.c1) + P('M42 64 L50 58 L58 64 L58 70 L50 64 L42 70 Z', l.c2), arm: l.c1 }),
    stripe: (l) => ({ torso: R(28, 52, 44, 38, l.c1) + R(28, 58, 44, 4, l.c2) + R(28, 67, 44, 4, l.c2) + R(28, 76, 44, 4, l.c2) + R(28, 85, 44, 4, l.c2), arm: l.c1 }),
    hoodie: (l) => ({ torso: R(28, 52, 44, 38, l.c1) + R(38, 72, 24, 12, l.c2, 'rx="3"') + P('M44 52 L44 62 M56 52 L56 62', 'none', 'stroke="#e8ecf1" stroke-width="1.5" stroke-linecap="round"') + P('M34 52 Q50 60 66 52', l.c2), arm: l.c1 }),
    tropical: (l) => ({ torso: R(28, 52, 44, 38, l.c1) + C(36, 60, 3.5, l.c2) + C(58, 58, 3, l.c2) + C(48, 72, 4, l.c2) + C(66, 76, 3.5, l.c2) + C(34, 82, 3, l.c2) + C(36, 60, 1.2, '#fff') + C(48, 72, 1.4, '#fff') + P('M44 52 L50 60 L56 52', 'none', 'stroke="' + D(l.c1, 0.25) + '" stroke-width="2"'), arm: l.c1 }),
    jersey: (l) => ({ torso: R(28, 52, 44, 38, l.c1) + R(28, 52, 5, 38, l.c2) + R(67, 52, 5, 38, l.c2) + P('M44 52 L50 58 L56 52', 'none', 'stroke="' + l.c2 + '" stroke-width="2.5"') + '<text x="50" y="80" font-family="Arial Black, sans-serif" font-size="15" text-anchor="middle" fill="' + l.c2 + '">7</text>', arm: l.c1 }),
    tux: (l) => ({ torso: R(28, 52, 44, 38, l.c1) + PG('42,52 50,74 58,52', l.c2) + C(50, 64, 1, INK) + C(50, 69, 1, INK) + P('M45 55 L50 58 L55 55 L55 60 L50 58 L45 60 Z', '#c81d4e'), arm: l.c1 }),
    armor: (l) => ({ torso: R(28, 52, 44, 38, l.c1) + R(28, 52, 44, 12, L(l.c1, 0.15)) + R(34, 66, 32, 18, l.c2, 'rx="3"') + P('M50 68 L56 72 L50 82 L44 72 Z', '#ffc940') + C(32, 56, 1.3, D(l.c1, 0.4)) + C(68, 56, 1.3, D(l.c1, 0.4)), arm: l.c1 }),
    galaxy: (l) => ({ torso: R(28, 52, 44, 38, l.c1) + E(52, 70, 16, 8, l.c2, 'opacity=".55" transform="rotate(-20 52 70)"') + E(52, 70, 8, 3, '#ffd2f5', 'opacity=".6" transform="rotate(-20 52 70)"') + C(34, 58, 0.9, '#fff') + C(64, 60, 1.1, '#fff') + C(40, 84, 0.8, '#fff') + C(66, 82, 0.7, '#fff') + C(56, 56, 0.6, '#fff'), arm: l.c1 }),
  };

  const PANTS = {
    jeans: (l) => ({ legs: [l.c1, D(l.c1, 0.1)], detail: R(49.3, 88, 1.4, 22, D(l.c1, 0.35)) + P('M33 92 Q38 95 42 92 M58 92 Q62 95 67 92', 'none', 'stroke="' + L(l.c1, 0.25) + '" stroke-width="1"') }),
    shorts: (l) => ({ legs: [l.c1, D(l.c1, 0.1)], short: true, detail: '' }),
    cargo: (l) => ({ legs: [l.c1, D(l.c1, 0.08)], detail: R(32, 98, 7, 8, D(l.c1, 0.2), 'rx="1"') + R(61, 98, 7, 8, D(l.c1, 0.2), 'rx="1"') }),
    track: (l) => ({ legs: [l.c1, D(l.c1, 0.1)], detail: R(31, 88, 3, 32, l.c2) + R(66, 88, 3, 32, l.c2) }),
    armor: (l) => ({ legs: [l.c1, D(l.c1, 0.1)], detail: R(32, 98, 16, 6, l.c2, 'rx="2"') + R(52, 98, 16, 6, l.c2, 'rx="2"') + R(28, 88, 44, 5, D(l.c1, 0.3)) }),
  };

  const JACKET = {
    bomber: (l) => ({ over: R(28, 52, 15, 38, l.c1) + R(57, 52, 15, 38, l.c1) + R(28, 86, 44, 4, l.c2) + R(41, 52, 2, 34, l.c2) + R(57, 52, 2, 34, l.c2), arm: l.c1, cuff: l.c2 }),
    leather: (l) => ({ over: R(28, 52, 16, 38, l.c1) + R(56, 52, 16, 38, l.c1) + PG('44,52 38,60 44,64', l.c2) + PG('56,52 62,60 56,64', l.c2) + R(33, 76, 6, 1.5, '#9aa5b5'), arm: l.c1 }),
    lab: (l) => ({ over: R(28, 52, 15, 56, l.c1) + R(57, 52, 15, 56, l.c1) + R(31, 76, 8, 6, l.c2, 'rx="1"') + PG('43,52 40,62 43,66', l.c2) + PG('57,52 60,62 57,66', l.c2), arm: l.c1 }),
    puffer: (l) => ({ over: R(27, 52, 46, 40, l.c1, 'rx="5"') + R(27, 62, 46, 2, l.c2) + R(27, 72, 46, 2, l.c2) + R(27, 82, 46, 2, l.c2) + R(49, 52, 2, 40, D(l.c1, 0.3)), arm: l.c1, puffy: true }),
    vest: (l) => ({ over: R(28, 52, 15, 38, l.c1) + R(57, 52, 15, 38, l.c1) + P('M32 58 V70 H38 V82 M68 58 V66 H62 V84', 'none', 'stroke="' + l.c2 + '" stroke-width="1.3" filter="url(#avglow)"') + C(38, 82, 1.4, l.c2) + C(62, 84, 1.4, l.c2), arm: null }),
  };

  const SHOES = {
    sneaker: (l) => ({ shoe: (x) => R(x, 116, 20, 9, l.c1, 'rx="3"') + R(x, 122, 20, 3, D(l.c1, 0.25), 'rx="1.5"') + P('M' + (x + 4) + ' 120 L' + (x + 12) + ' 117 L' + (x + 16) + ' 119', 'none', 'stroke="' + l.c2 + '" stroke-width="2" stroke-linecap="round"') }),
    hightop: (l) => ({ shoe: (x) => R(x, 110, 20, 15, l.c1, 'rx="3"') + R(x, 122, 20, 3, l.c2, 'rx="1.5"') + P('M' + (x + 7) + ' 113 h6 M' + (x + 7) + ' 116 h6', 'none', 'stroke="' + l.c2 + '" stroke-width="1.2"') }),
    boot: (l) => ({ shoe: (x) => R(x, 106, 20, 19, l.c1, 'rx="3"') + R(x, 121, 20, 4, l.c2, 'rx="1.5"') + R(x, 108, 20, 3, D(l.c1, 0.2)) }),
    slipper: (l) => ({ shoe: (x) => E(x + 10, 120, 12, 6, l.c1) + C(x + 10, 116, 3, '#fff', 'opacity=".8"') }),
    rocket: (l) => ({ shoe: (x) => R(x, 110, 20, 15, l.c1, 'rx="3"') + R(x, 114, 20, 3, l.c2) + '<g class="av-flame">' + P('M' + (x + 4) + ' 125 Q' + (x + 10) + ' 140 ' + (x + 16) + ' 125 Z', l.c2) + P('M' + (x + 7) + ' 125 Q' + (x + 10) + ' 133 ' + (x + 13) + ' 125 Z', '#ffe066') + '</g>' }),
  };

  const NECK = {
    scarf: (l) => R(33, 48, 34, 8, l.c1, 'rx="3"') + R(38, 48, 5, 8, l.c2) + R(50, 48, 5, 8, l.c2) + R(56, 54, 8, 18, l.c1, 'rx="2"') + R(56, 60, 8, 3, l.c2),
    bandana: (l) => PG('34,52 66,52 50,68', l.c1) + C(46, 57, 1, '#fff') + C(54, 57, 1, '#fff') + C(50, 62, 1, '#fff'),
    bowtie: (l) => PG('42,50 50,54 42,58', l.c1) + PG('58,50 50,54 58,58', l.c1) + R(48, 52, 4, 4, D(l.c1, 0.25), 'rx="1"'),
    chain: (l) => P('M36 52 Q50 70 64 52', 'none', 'stroke="' + l.c1 + '" stroke-width="2.6" stroke-dasharray="3 1.5"') + C(50, 62, 3.5, l.c1),
    medal: (l) => PG('42,52 48,52 51,66 47,66', l.c2) + PG('58,52 52,52 49,66 53,66', D(l.c2, 0.2)) + C(50, 70, 5.5, l.c1, 'stroke="' + D(l.c1, 0.3) + '" stroke-width="1"') + PG('50,66.8 51,69 53.4,69.2 51.6,70.8 52.2,73.2 50,72 47.8,73.2 48.4,70.8 46.6,69.2 49,69', D(l.c1, 0.3)),
  };

  const SHOULDER = {
    cat: (l) => '<g class="av-pet">' + E(80, 48, 9, 7, l.c1) + C(82, 40, 6, l.c1) + PG('77,36 78,30 81,35', l.c1) + PG('83,35 86,30 87,36', l.c1) + C(80, 40, 1, INK) + C(84, 40, 1, INK) + C(82, 42, 0.8, '#ff7a90') + P('M72 50 Q66 44 70 38', 'none', 'stroke="' + l.c1 + '" stroke-width="2.4" stroke-linecap="round"') + '</g>',
    bird: (l) => '<g class="av-pet">' + E(80, 44, 7, 9, l.c1) + C(81, 36, 5, l.c1) + PG('85,35 90,37 85,39', '#ffc940') + C(82, 35, 1, INK) + P('M74 46 Q72 56 78 58', l.c2) + P('M78 52 L76 62 L80 60 Z', l.c2) + '</g>',
    fox: (l) => '<g class="av-pet">' + E(80, 48, 9, 6.5, l.c1) + C(84, 40, 6, l.c1) + PG('79,36 80,29 83,35', l.c1) + PG('85,35 89,29 90,37', l.c1) + P('M84 42 L90 41 L86 45 Z', l.c2) + C(83, 39, 1, INK) + C(87, 39, 1, INK) + P('M72 50 Q62 44 66 34 Q70 42 76 46 Z', l.c1, 'filter="url(#avglow)"') + P('M66 34 Q66 38 69 40', 'none', 'stroke="' + l.c2 + '" stroke-width="2"') + '</g>',
    dragon: (l) => '<g class="av-pet">' + E(80, 46, 9, 8, l.c1) + C(85, 37, 6, l.c1) + PG('83,32 84,26 87,31', l.c2) + PG('87,32 90,27 90,34', l.c2) + C(87, 36, 1.1, '#fff') + C(87, 36, 0.5, INK) + P('M76 42 Q66 30 70 44 Q72 38 78 46 Z', L(l.c1, 0.2)) + P('M72 52 Q66 56 68 60', 'none', 'stroke="' + l.c1 + '" stroke-width="2.6" stroke-linecap="round"') + C(91, 39, 1.2, '#ffb454', 'class="av-blink"') + '</g>',
    drone: (l) => '<g class="av-drone">' + R(72, 30, 18, 6, l.c1, 'rx="3"') + R(66, 27, 10, 2, D(l.c1, 0.2), 'rx="1"') + R(86, 27, 10, 2, D(l.c1, 0.2), 'rx="1"') + C(81, 36, 2.4, l.c2, 'filter="url(#avglow)"') + '</g>',
    pads: (l) => P('M16 54 Q16 46 28 48 L28 60 L16 60 Z', l.c1) + P('M84 54 Q84 46 72 48 L72 60 L84 60 Z', l.c1) + PG('18,48 20,40 23,47', l.c2) + PG('24,47 27,39 29,48', l.c2) + PG('82,48 80,40 77,47', l.c2) + PG('76,47 73,39 71,48', l.c2),
  };

  const HEAD_CROP = { head: '16 -14 68 72', hat: '6 -32 88 92', bust: '6 -16 88 100', full: '-14 -30 128 176' };

  /**
   * Render an avatar to an SVG string.
   * @param {{skin:string, equipped:object}} av
   * @param {{size?:number, crop?:'full'|'bust'|'head', anim?:string, emote?:string, cls?:string, still?:boolean}} [opts]
   */
  function render(av, opts) {
    opts = opts || {};
    av = av || { skin: BF.STARTER_SKIN, equipped: BF.STARTER_EQUIP };
    if (!opts.svg && BF.avatar3d && BF.avatar3d.available()) {
      const html = BF.avatar3d.image(av, opts);
      if (html) return html;
    }
    return renderSvg(av, opts);
  }

  /** The original layered SVG avatar (Classic 2D mode, no WebGL, and unit tests). */
  function renderSvg(av, opts) {
    const eq = av.equipped || {};
    const skin = av.skin || BF.STARTER_SKIN;
    const get = (slot) => lookOf(eq[slot]);

    const headL = get('head') || { shape: 'block' };
    const faceL = get('face') || { style: 'smile' };
    const hairL = get('hair');
    const shirtL = get('shirt') || lookOf('shirt_forge');
    const pantsL = get('pants') || lookOf('pants_denim');
    const jacketL = get('jacket');
    const shoesL = get('shoes');
    const hatL = get('hat');
    const backL = get('back');
    const neckL = get('neck');
    const shL = get('shoulder');
    const accL = get('accessory');

    const shirt = (SHIRT[shirtL.style] || SHIRT.logo)(shirtL);
    const pants = (PANTS[pantsL.style] || PANTS.jeans)(pantsL);
    const jacket = jacketL ? (JACKET[jacketL.style] || JACKET.bomber)(jacketL) : null;
    const armColor = jacket && jacket.arm ? jacket.arm : shirt.arm;

    let back = '';
    if (backL && BACK[backL.style]) back += BACK[backL.style](backL);
    if (hairL && HAIR_BACK[hairL.style] && !(hatL && hatL.style === 'helmet')) back += HAIR_BACK[hairL.style](hairL.c1);
    if (hatL && HAT_BACK[hatL.style]) back += HAT_BACK[hatL.style](hatL);

    // legs
    const legTop = 88, legH = 32;
    const legL = R(31, legTop, 18, legH, pants.legs[0]);
    const legR = R(51, legTop, 18, legH, pants.legs[1]);
    const shoeFn = shoesL && SHOES[shoesL.style] ? SHOES[shoesL.style](shoesL).shoe : (x) => R(x, 118, 20, 7, '#39414f', 'rx="2"');

    // arms
    const armPaint = (x) => {
      let a = R(x, 53, 12, 32, armColor, 'rx="3"');
      if (jacket && jacket.cuff) a += R(x, 79, 12, 4, jacket.cuff);
      if (jacket && jacket.puffy) a += R(x, 62, 12, 2, jacketL.c2) + R(x, 71, 12, 2, jacketL.c2);
      a += R(x + 1, 84, 10, 8, skin, 'rx="3"');
      return a;
    };

    const head = (HEAD[headL.shape] || HEAD.block)(skin, headL);
    const faceHidden = hatL && hatL.style === 'helmet';
    const face = faceHidden ? '' : (FACE[faceL.style] || FACE.smile)();
    const hair = hairL && !faceHidden && HAIR[hairL.style] ? HAIR[hairL.style](hairL.c1) : '';
    const hat = hatL && HAT[hatL.style] ? HAT[hatL.style](hatL) : '';
    const acc = accL && ACC[accL.style] && !faceHidden ? ACC[accL.style](accL) : '';
    const neck = neckL && NECK[neckL.style] ? NECK[neckL.style](neckL) : '';
    const sh = shL && SHOULDER[shL.style] ? SHOULDER[shL.style](shL) : '';

    const animItem = BF.ITEMS[eq.animation];
    const animName = opts.still ? '' : opts.emote ? 'emote-' + opts.emote : 'anim-' + ((opts.anim || (animItem && animItem.look.anim)) || 'idle');
    const size = opts.size || 160;
    const crop = HEAD_CROP[opts.crop || 'full'];
    const uid = 'av' + Math.random().toString(36).slice(2, 7);
    const defs = '<defs><filter id="avglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';

    const body =
      '<g class="av-root">' +
      '<ellipse class="av-shadow" cx="50" cy="127" rx="28" ry="4" fill="#000" opacity=".22"/>' +
      '<g class="av-body">' +
      back +
      '<g class="av-leg-l">' + legL + (pants.short ? R(33, 104, 14, 14, skin) : '') + shoeFn(30) + '</g>' +
      '<g class="av-leg-r">' + legR + (pants.short ? R(53, 104, 14, 14, D(skin, 0.06)) : '') + shoeFn(50) + '</g>' +
      pants.detail +
      '<g class="av-arm-l">' + armPaint(16) + '</g>' +
      '<g class="av-arm-r">' + armPaint(72) + '</g>' +
      '<g class="av-torso">' + shirt.torso + (jacket ? jacket.over : '') + '</g>' +
      R(42, 48, 16, 6, D(skin, 0.1)) +
      neck +
      '<g class="av-head">' + head + face + hair + acc + hat + '</g>' +
      sh +
      '</g></g>';

    const vb = crop.split(' ').map(Number);
    return '<svg class="avatar-svg crop-' + (opts.crop || 'full') + ' ' + animName + (opts.cls ? ' ' + opts.cls : '') + '" id="' + uid + '" width="' + size + '" height="' + Math.round((size * vb[3]) / vb[2]) + '" viewBox="' + crop + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + defs + body + '</svg>';
  }

  /** Compact colour set used by canvas games to draw a player or bot. */
  function look(av) {
    av = av || { skin: BF.STARTER_SKIN, equipped: BF.STARTER_EQUIP };
    const eq = av.equipped || {};
    const g = (slot) => lookOf(eq[slot]) || {};
    const shirt = g('shirt'), pants = g('pants'), hair = g('hair'), hat = g('hat'), jacket = g('jacket'), shoes = g('shoes'), head = g('head'), back = g('back'), acc = g('accessory');
    return {
      skin: head.shape === 'robot' ? head.c1 : head.shape === 'pumpkin' ? head.c1 : head.shape === 'crystal' ? head.c1 : head.shape === 'void' ? head.c1 : av.skin || BF.STARTER_SKIN,
      headShape: head.shape || 'block',
      shirt: jacket.c1 || shirt.c1 || '#23a699',
      shirt2: shirt.c2 || jacket.c2 || '#ffb454',
      pants: pants.c1 || '#2f4a7a',
      shoes: shoes.c1 || '#39414f',
      hair: hair.c1 || null,
      hat: hat.style ? hat.c1 : null,
      hatStyle: hat.style || null,
      back: back.style ? back.c1 : null,
      acc: acc.style ? acc.c1 : null,
    };
  }

  BF.avatar = {
    render,
    renderSvg,
    look,

    /** Equip an owned item into its slot. */
    equip(itemId) {
      const item = BF.ITEMS[itemId];
      if (!item) return { ok: false, error: 'Unknown item.' };
      const cat = BF.ITEM_CATS[item.cat];
      if (!cat || !cat.slot) return { ok: false, error: 'That item cannot be worn.' };
      if (!BF.inventory.owns(itemId)) return { ok: false, error: 'You do not own ' + item.name + ' yet.' };
      BF.store.update('avatar', (s) => { s.avatar.equipped[cat.slot] = itemId; });
      BF.bus.emit('avatar:equip', { item });
      BF.quests.track('equip', 1);
      return { ok: true, slot: cat.slot };
    },

    /** Unequip a slot (required slots fall back to the starter item). */
    unequip(slot) {
      const fallback = BF.REQUIRED_SLOTS[slot] || null;
      BF.store.update('avatar', (s) => { s.avatar.equipped[slot] = fallback; });
      return { ok: true, fallback };
    },

    isEquipped(itemId) {
      const s = BF.store.state;
      if (!s) return false;
      return Object.values(s.avatar.equipped).includes(itemId);
    },

    setSkin(color) {
      BF.store.update('avatar', (s) => { s.avatar.skin = color; });
    },

    /** Reset to the starter look (keeps ownership). */
    resetLook() {
      BF.store.update('avatar', (s) => {
        s.avatar.skin = BF.STARTER_SKIN;
        for (const k of Object.keys(BF.STARTER_EQUIP)) {
          const id = BF.STARTER_EQUIP[k];
          s.avatar.equipped[k] = id && s.inventory[id] ? id : BF.REQUIRED_SLOTS[k] || null;
        }
      });
    },

    /** Mix random owned items into an outfit. */
    randomize() {
      const s = BF.store.state;
      const owned = Object.keys(s.inventory).map((id) => BF.ITEMS[id]).filter((i) => i && BF.ITEM_CATS[i.cat] && BF.ITEM_CATS[i.cat].slot);
      BF.store.update('avatar', (st) => {
        for (const slot of BF.AVATAR_SLOTS) {
          const opts = owned.filter((i) => BF.ITEM_CATS[i.cat].slot === slot);
          if (!opts.length) continue;
          const optional = !BF.REQUIRED_SLOTS[slot] && slot !== 'emote';
          st.avatar.equipped[slot] = optional && Math.random() < 0.3 ? null : U.pick(opts).id;
        }
        st.avatar.skin = U.pick(BF.SKIN_TONES.slice(0, 9));
      });
    },
  };
})((window.BF = window.BF || {}));
