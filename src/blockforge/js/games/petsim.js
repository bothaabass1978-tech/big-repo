/**
 * Pet World (gameType "petsim") — pet collecting simulator.
 * Walk three zones, send equipped pets to break coin piles for PetBucks,
 * hatch eggs (PetBucks only, odds always shown, rare-or-better guaranteed
 * every 10 hatches), level pets up, buy collars and fill the collection book.
 * Win: earn the session goal in PetBucks before the timer runs out.
 * Passes: storage (5 equipped pets instead of 3), autocollect (no orb pickup).
 * Store: PetBucks Pouch (+1,000 PetBucks, banked in progress.custom.petbucks).
 *
 * Also defines BF.PET_WORLD_SPECIES and BF.petArt(species, size) which the
 * Inventory page uses to show Pet World pets.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;
  const TAU = Math.PI * 2;

  const T = {
    session: 360, equip: 3, equipPass: 5, storage: 60, levelCap: 10, levelGain: 0.15, pity: 10,
    speed: 200, petSpeed: 280, radius: 12, magnet: 80, perZone: 14, respawn: [5, 11],
    goals: { meadow: 2500, caves: 12000, candy: 45000 },
    startBucks: 150,
    rewards: { play: 15, win: 50, xpPlay: 30, xpWin: 110, xpHatch: 4, pilesPerCoin: 10, zone: 50, page: 75,
      hatch: { common: 2, uncommon: 3, rare: 6, epic: 12, legendary: 30, mythic: 80 } },
  };

  // ------------------------------------------------------------ species

  /** Every Pet World species. power = base damage per second; value = display value. */
  const SPECIES = {
    pupper: { name: 'Pupper', rarity: 'common', power: 10, egg: 'meadow', body: '#d9a066', belly: '#f4dcb8', ears: 'flop', ear: '#a86b3c', tail: 'thin' },
    kitty: { name: 'Kitty', rarity: 'common', power: 11, egg: 'meadow', body: '#9aa5b5', belly: '#eef1f6', ears: 'point', tail: 'thin', extra: ['whiskers'] },
    bunny: { name: 'Bunny', rarity: 'uncommon', power: 16, egg: 'meadow', body: '#f4ecd0', belly: '#ffffff', ears: 'long' },
    piglet: { name: 'Piglet', rarity: 'uncommon', power: 17, egg: 'meadow', body: '#ffb6c9', belly: '#ffd6e2', ears: 'point', extra: ['snout'] },
    fox: { name: 'Meadow Fox', rarity: 'rare', power: 27, egg: 'meadow', body: '#ff7a2e', belly: '#fff3e6', ears: 'point', ear: '#e0561a', tail: 'bushy' },
    golden_pupper: { name: 'Golden Pupper', rarity: 'epic', power: 46, egg: 'meadow', body: '#ffcf4a', belly: '#fff0b8', ears: 'flop', ear: '#e6a817', tail: 'thin', glow: '#ffe27a' },
    unicorn: { name: 'Meadow Unicorn', rarity: 'legendary', power: 95, egg: 'meadow', body: '#fbfbff', belly: '#ffe9f6', ears: 'point', ear: '#efe3ff', extra: ['mane', 'horn'], glow: '#ffd1f0' },
    mole: { name: 'Rock Mole', rarity: 'common', power: 40, egg: 'crystal', body: '#7a8494', belly: '#b7c0cf', ears: 'round', extra: ['snout'], snout: '#ff9fb2' },
    bat: { name: 'Glow Bat', rarity: 'uncommon', power: 56, egg: 'crystal', body: '#6b4bd6', belly: '#a58cff', ears: 'point', extra: ['wings'], glow: '#b67cff' },
    crystal_fox: { name: 'Crystal Fox', rarity: 'rare', power: 82, egg: 'crystal', body: '#7fe7ff', belly: '#e6fbff', ears: 'point', ear: '#39c6ea', tail: 'bushy', extra: ['gems'] },
    turtle: { name: 'Gem Turtle', rarity: 'epic', power: 125, egg: 'crystal', body: '#8be0a4', belly: '#d8f7e1', ears: 'none', extra: ['shell'] },
    amethyst_dragon: { name: 'Amethyst Dragon', rarity: 'legendary', power: 250, egg: 'crystal', body: '#9b5cff', belly: '#d9c2ff', ears: 'none', tail: 'thin', extra: ['horns', 'wings'], glow: '#c9a2ff' },
    phoenix: { name: 'Prism Phoenix', rarity: 'mythic', power: 520, egg: 'crystal', body: 'rainbow', belly: '#fff6d6', ears: 'none', extra: ['crest', 'wings'], glow: '#ffe6a8' },
    gummy: { name: 'Gummy Bear', rarity: 'common', power: 150, egg: 'candy', body: '#ff5a6a', belly: '#ff9aa6', ears: 'round' },
    lamb: { name: 'Cotton Lamb', rarity: 'uncommon', power: 205, egg: 'candy', body: '#ffd1f0', belly: '#fff0fa', ears: 'flop', ear: '#f7a8d8', extra: ['fluff'] },
    lollipup: { name: 'Lollipup', rarity: 'rare', power: 300, egg: 'candy', body: '#ff9ad5', belly: '#ffffff', ears: 'flop', ear: '#e65aa8', extra: ['swirl'] },
    choco_cat: { name: 'Choco Cat', rarity: 'epic', power: 430, egg: 'candy', body: '#7a4a2a', belly: '#c89b6d', ears: 'point', tail: 'thin', extra: ['sprinkles', 'whiskers'] },
    sprinkle_dragon: { name: 'Sprinkle Dragon', rarity: 'legendary', power: 820, egg: 'candy', body: '#ff8fc8', belly: '#ffe3f2', ears: 'none', tail: 'thin', extra: ['horns', 'wings', 'sprinkles'], glow: '#ffc2e2' },
    cosmic_cat: { name: 'Cosmic Candy Cat', rarity: 'mythic', power: 1650, egg: 'candy', body: 'rainbow', belly: '#2a1f4a', ears: 'point', ear: '#3a2a6a', tail: 'thin', extra: ['stars', 'whiskers'], glow: '#b67cff' },
  };
  Object.entries(SPECIES).forEach(([id, sp]) => { sp.id = id; sp.value = sp.power * 5; });
  BF.PET_WORLD_SPECIES = SPECIES;

  const EGGS = {
    meadow: { id: 'meadow', name: 'Meadow Egg', zone: 'meadow', cost: 250, color: '#f4ecd0', spot: '#7ec850', odds: { common: 55, uncommon: 28, rare: 12, epic: 4, legendary: 1 } },
    crystal: { id: 'crystal', name: 'Crystal Egg', zone: 'caves', cost: 2000, color: '#c9f4ff', spot: '#7b5cff', odds: { common: 50, uncommon: 28, rare: 14, epic: 6, legendary: 1.8, mythic: 0.2 } },
    candy: { id: 'candy', name: 'Candy Egg', zone: 'candy', cost: 8000, color: '#ffe0f2', spot: '#ff5a9a', odds: { common: 50, uncommon: 28, rare: 14, epic: 6, legendary: 1.8, mythic: 0.2 } },
  };
  const EGG_POOL = {};
  Object.values(SPECIES).forEach((sp) => { ((EGG_POOL[sp.egg] = EGG_POOL[sp.egg] || {})[sp.rarity] = EGG_POOL[sp.egg][sp.rarity] || []).push(sp.id); });

  const COLLARS = {
    red: { name: 'Red Collar', cost: 500, bonus: 0.05, color: '#ff5a6a' },
    star: { name: 'Star Collar', cost: 1500, bonus: 0.1, color: '#ffd66b' },
    diamond: { name: 'Diamond Collar', cost: 6000, bonus: 0.2, color: '#7fe7ff' },
  };

  const rank = (r) => BF.RARITY[r].rank;
  const rollSpecies = (eggId, rng, minRank) => {
    const egg = EGGS[eggId];
    const entries = Object.entries(egg.odds).filter(([r]) => rank(r) >= (minRank || 0)).map(([r, w]) => [w, r]);
    const rarity = U.weighted(entries, rng);
    return U.pick(EGG_POOL[eggId][rarity], rng);
  };

  // --------------------------------------------------------------- pet art
  // Pets are built from primitives in a 100x100 box so the same shapes
  // render on canvas (in game) and as SVG (inventory, panels).

  function buildShapes(sp) {
    const S = [];
    const ex = sp.extra || [];
    const body = sp.body;
    const tone = (amt) => (body === 'rainbow' ? 'rainbow' : U.shade(body, amt));
    const belly = sp.belly || tone(0.35);
    const ear = sp.ear || tone(-0.12);
    const inner = '#ffb6c9';
    if (sp.glow) S.push({ t: 'c', x: 50, y: 58, r: 46, fill: sp.glow, op: 0.25 });
    if (ex.includes('wings')) {
      const wc = body === 'rainbow' ? '#ffd66b' : U.shade(body, -0.2);
      S.push({ t: 'e', x: 19, y: 46, rx: 17, ry: 9, rot: -0.55, fill: wc }, { t: 'e', x: 81, y: 46, rx: 17, ry: 9, rot: 0.55, fill: wc });
    }
    if (sp.tail === 'bushy') S.push({ t: 'e', x: 80, y: 74, rx: 15, ry: 8, rot: -0.7, fill: tone(0) }, { t: 'e', x: 89, y: 64, rx: 6, ry: 5, rot: -0.7, fill: belly });
    if (sp.tail === 'thin') S.push({ t: 'e', x: 80, y: 77, rx: 11, ry: 3.5, rot: -0.9, fill: ear });
    if (sp.ears === 'point') S.push({ t: 'p', pts: [[24, 44], [28, 13], [47, 31]], fill: ear }, { t: 'p', pts: [[76, 44], [72, 13], [53, 31]], fill: ear }, { t: 'p', pts: [[29, 38], [31, 21], [41, 31]], fill: inner }, { t: 'p', pts: [[71, 38], [69, 21], [59, 31]], fill: inner });
    if (sp.ears === 'round') S.push({ t: 'c', x: 29, y: 33, r: 10, fill: ear }, { t: 'c', x: 71, y: 33, r: 10, fill: ear }, { t: 'c', x: 29, y: 33, r: 5, fill: inner }, { t: 'c', x: 71, y: 33, r: 5, fill: inner });
    if (sp.ears === 'long') S.push({ t: 'e', x: 38, y: 16, rx: 7, ry: 19, rot: -0.12, fill: ear }, { t: 'e', x: 62, y: 16, rx: 7, ry: 19, rot: 0.12, fill: ear }, { t: 'e', x: 38, y: 17, rx: 3.5, ry: 13, rot: -0.12, fill: inner }, { t: 'e', x: 62, y: 17, rx: 3.5, ry: 13, rot: 0.12, fill: inner });
    if (ex.includes('horns')) S.push({ t: 'p', pts: [[33, 36], [26, 14], [43, 30]], fill: '#fff3c4' }, { t: 'p', pts: [[67, 36], [74, 14], [57, 30]], fill: '#fff3c4' });
    if (ex.includes('crest')) S.push({ t: 'p', pts: [[40, 32], [44, 6], [50, 26], [56, 4], [60, 32]], fill: '#ffb52e' }, { t: 'p', pts: [[45, 30], [50, 14], [55, 30]], fill: '#fff1a8' });
    if (ex.includes('mane')) S.push({ t: 'c', x: 34, y: 34, r: 9, fill: '#ff9ad5' }, { t: 'c', x: 44, y: 29, r: 9, fill: '#ffd66b' }, { t: 'c', x: 56, y: 29, r: 9, fill: '#7fe7ff' }, { t: 'c', x: 66, y: 34, r: 9, fill: '#b67cff' });
    S.push({ t: 'c', x: 50, y: 58, r: 30, fill: body });
    if (ex.includes('shell')) {
      S.push({ t: 'e', x: 50, y: 47, rx: 29, ry: 18, fill: '#2f8f57' });
      for (const [x, y] of [[38, 44], [50, 40], [62, 44], [44, 52], [56, 52]]) S.push({ t: 'c', x, y, r: 5, fill: '#7fe7ff', op: 0.85 });
    }
    if (ex.includes('fluff')) for (const [x, y] of [[30, 36], [40, 30], [50, 28], [60, 30], [70, 36]]) S.push({ t: 'c', x, y, r: 8, fill: '#fff7fc' });
    S.push({ t: 'e', x: 50, y: 71, rx: 18, ry: 13, fill: belly });
    if (sp.ears === 'flop') S.push({ t: 'e', x: 23, y: 52, rx: 8, ry: 15, rot: 0.3, fill: ear }, { t: 'e', x: 77, y: 52, rx: 8, ry: 15, rot: -0.3, fill: ear });
    if (ex.includes('swirl')) S.push({ t: 'c', x: 50, y: 72, r: 9, fill: 'none', stroke: '#ff5a9a', sw: 3 }, { t: 'c', x: 50, y: 72, r: 4, fill: 'none', stroke: '#7fe7ff', sw: 2.5 });
    if (ex.includes('sprinkles')) for (const [x, y, c] of [[34, 50, '#ffd66b'], [64, 46, '#7fe7ff'], [40, 76, '#4ad17f'], [62, 78, '#ffffff'], [70, 62, '#ff5a6a'], [30, 64, '#b67cff']]) S.push({ t: 'e', x, y, rx: 3.4, ry: 1.4, rot: x * 0.7, fill: c });
    if (ex.includes('stars')) for (const [x, y, r] of [[34, 46, 1.8], [66, 50, 2.2], [44, 80, 1.6], [58, 74, 2], [30, 70, 1.5], [70, 70, 1.6]]) S.push({ t: 'c', x, y, r, fill: '#ffffff' });
    if (ex.includes('gems')) S.push({ t: 'p', pts: [[30, 42], [34, 34], [38, 42], [34, 48]], fill: '#ffffff', op: 0.8 }, { t: 'p', pts: [[64, 40], [68, 32], [72, 40], [68, 46]], fill: '#ffffff', op: 0.8 });
    // face
    S.push({ t: 'e', x: 40, y: 56, rx: 4.6, ry: 6, fill: '#1b1b22' }, { t: 'e', x: 60, y: 56, rx: 4.6, ry: 6, fill: '#1b1b22' });
    S.push({ t: 'c', x: 41.6, y: 53.6, r: 1.9, fill: '#ffffff' }, { t: 'c', x: 61.6, y: 53.6, r: 1.9, fill: '#ffffff' });
    S.push({ t: 'e', x: 31, y: 65, rx: 5, ry: 3, fill: '#ff8fa3', op: 0.55 }, { t: 'e', x: 69, y: 65, rx: 5, ry: 3, fill: '#ff8fa3', op: 0.55 });
    if (ex.includes('snout')) S.push({ t: 'e', x: 50, y: 65, rx: 8, ry: 6, fill: sp.snout || tone(-0.08) }, { t: 'c', x: 47, y: 65, r: 1.6, fill: '#5a3040' }, { t: 'c', x: 53, y: 65, r: 1.6, fill: '#5a3040' });
    else S.push({ t: 'e', x: 50, y: 63.5, rx: 3, ry: 2.2, fill: '#3a2530' });
    if (ex.includes('whiskers')) S.push({ t: 'l', x1: 24, y1: 62, x2: 36, y2: 64, stroke: '#3a2530', sw: 1.2 }, { t: 'l', x1: 24, y1: 68, x2: 36, y2: 67, stroke: '#3a2530', sw: 1.2 }, { t: 'l', x1: 76, y1: 62, x2: 64, y2: 64, stroke: '#3a2530', sw: 1.2 }, { t: 'l', x1: 76, y1: 68, x2: 64, y2: 67, stroke: '#3a2530', sw: 1.2 });
    if (ex.includes('horn')) S.push({ t: 'p', pts: [[45, 32], [50, 5], [55, 32]], fill: '#ffd66b' }, { t: 'l', x1: 47, y1: 26, x2: 53, y2: 23, stroke: '#e0a800', sw: 1.4 }, { t: 'l', x1: 48, y1: 18, x2: 52, y2: 16, stroke: '#e0a800', sw: 1.4 });
    return S;
  }
  const SHAPES = {};
  const shapesOf = (sp) => SHAPES[sp.id] || (SHAPES[sp.id] = buildShapes(sp));

  function svgShape(s) {
    const fill = s.fill === 'rainbow' ? 'url(#pw-rainbow)' : s.fill || 'none';
    const extra = (s.op != null ? ' opacity="' + s.op + '"' : '') + (s.stroke ? ' stroke="' + s.stroke + '" stroke-width="' + (s.sw || 2) + '" stroke-linecap="round"' : '');
    if (s.t === 'c') return '<circle cx="' + s.x + '" cy="' + s.y + '" r="' + s.r + '" fill="' + fill + '"' + extra + '/>';
    if (s.t === 'e') return '<ellipse cx="' + s.x + '" cy="' + s.y + '" rx="' + s.rx + '" ry="' + s.ry + '"' + (s.rot ? ' transform="rotate(' + ((s.rot * 180) / Math.PI).toFixed(1) + ' ' + s.x + ' ' + s.y + ')"' : '') + ' fill="' + fill + '"' + extra + '/>';
    if (s.t === 'p') return '<polygon points="' + s.pts.map((p) => p.join(',')).join(' ') + '" fill="' + fill + '"' + extra + '/>';
    return '<line x1="' + s.x1 + '" y1="' + s.y1 + '" x2="' + s.x2 + '" y2="' + s.y2 + '"' + extra + '/>';
  }

  /**
   * SVG markup for a Pet World species (id or species object).
   * @param {object|string} sp
   * @param {number} [size=96] rendered size in px
   * @param {string} [collar] collar id drawn on the pet
   * @returns {string}
   */
  BF.petArt = function (sp, size, collar) {
    if (typeof sp === 'string') sp = SPECIES[sp];
    if (!sp) return '';
    size = size || 96;
    const c = collar && COLLARS[collar];
    return '<svg class="pet-art" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" aria-hidden="true"><defs><linearGradient id="pw-rainbow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7ab6"/><stop offset=".35" stop-color="#ffd66b"/><stop offset=".65" stop-color="#7fe7ff"/><stop offset="1" stop-color="#b67cff"/></linearGradient></defs>' +
      shapesOf(sp).map(svgShape).join('') + (c ? '<ellipse cx="50" cy="83" rx="17" ry="3.6" fill="' + c.color + '"/><circle cx="50" cy="87.5" r="3.4" fill="#ffd66b"/>' : '') + '</svg>';
  };

  /** Draw a pet on canvas centred at (x, y); size = width in px. */
  function drawPet(g, sp, x, y, size, t, collar) {
    const k = size / 100;
    g.save();
    g.translate(x - 50 * k, y - 60 * k);
    g.scale(k, k);
    const hue = (t * 80) % 360;
    for (const s of shapesOf(sp)) {
      const fill = s.fill === 'rainbow' ? 'hsl(' + hue + ',85%,66%)' : s.fill;
      g.globalAlpha = s.op != null ? s.op : 1;
      g.beginPath();
      if (s.t === 'c') g.arc(s.x, s.y, s.r, 0, TAU);
      else if (s.t === 'e') g.ellipse(s.x, s.y, s.rx, s.ry, s.rot || 0, 0, TAU);
      else if (s.t === 'p') { s.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); }
      else { g.moveTo(s.x1, s.y1); g.lineTo(s.x2, s.y2); }
      if (fill && fill !== 'none' && s.t !== 'l') { g.fillStyle = fill; g.fill(); }
      if (s.stroke) { g.strokeStyle = s.stroke; g.lineWidth = s.sw || 2; g.lineCap = 'round'; g.stroke(); }
    }
    g.globalAlpha = 1;
    const c = collar && COLLARS[collar];
    if (c) { g.fillStyle = c.color; g.beginPath(); g.ellipse(50, 83, 17, 3.6, 0, 0, TAU); g.fill(); G.circle(g, 50, 87.5, 3.4, '#ffd66b'); }
    g.restore();
  }

  // ----------------------------------------------------------------- world

  const ZW = 1200, WW = ZW * 3, WH = 900;
  const GATE = { y0: 370, y1: 530 };
  const ZONES = [
    { id: 'meadow', name: 'Sunny Meadow', x: 0, cost: 0, egg: 'meadow', ground: ['#7ec850', '#76c04a'], dark: false },
    { id: 'caves', name: 'Crystal Caves', x: ZW, cost: 2500, egg: 'crystal', ground: ['#3b3663', '#36315c'], dark: true },
    { id: 'candy', name: 'Candy Land', x: ZW * 2, cost: 15000, egg: 'candy', ground: ['#ffc6e4', '#ffbfe0'], dark: false },
  ];
  const PILES = {
    meadow: [{ kind: 'coins', hp: 40, value: 25, r: 18, w: 62 }, { kind: 'chest', hp: 160, value: 110, r: 22, w: 30 }, { kind: 'vault', hp: 700, value: 520, r: 28, w: 8 }],
    caves: [{ kind: 'crystal', hp: 420, value: 210, r: 20, w: 62 }, { kind: 'geode', hp: 1600, value: 900, r: 25, w: 30 }, { kind: 'vault', hp: 5200, value: 3300, r: 30, w: 8 }],
    candy: [{ kind: 'candy', hp: 2200, value: 850, r: 20, w: 62 }, { kind: 'cake', hp: 6500, value: 2900, r: 26, w: 30 }, { kind: 'vault', hp: 21000, value: 11500, r: 32, w: 8 }],
  };
  const zoneIndex = (x) => U.clamp(Math.floor(x / ZW), 0, 2);
  const STANDS = ZONES.map((z) => ({ kind: 'egg', egg: z.egg, zone: z.id, x: z.x + 600, y: 170 }));
  const SHOP = { kind: 'shop', x: 230, y: 760 };
  const SOLID = STANDS.concat([SHOP]);
  const GATES = ZONES.slice(1).map((z) => ({ kind: 'gate', zone: z.id, x: z.x, y: (GATE.y0 + GATE.y1) / 2 }));

  // static decorations (seeded, shared by every session)
  const DECOR = (() => {
    const r = U.rng('pet-world-decor');
    const out = [];
    const clearOf = (x, y) => STANDS.concat([SHOP, { x: 300, y: 450 }]).every((s) => U.dist(s.x, s.y, x, y) > 110) && GATES.every((gt) => Math.abs(gt.x - x) > 70);
    for (const z of ZONES) {
      for (let i = 0; i < 70; i++) {
        const x = z.x + 30 + r() * (ZW - 60), y = 30 + r() * (WH - 60);
        if (!clearOf(x, y)) continue;
        const edge = y < 90 || y > WH - 90;
        if (z.id === 'meadow') out.push({ z: 0, x, y, kind: edge && r() < 0.7 ? 'tree' : 'flower', c: U.pick(['#ffffff', '#ffd66b', '#ff8fa3', '#b67cff'], r), s: 0.8 + r() * 0.5 });
        else if (z.id === 'caves') out.push({ z: 1, x, y, kind: edge && r() < 0.7 ? 'spire' : 'shard', c: U.pick(['#7fe7ff', '#b67cff', '#ff8fd8'], r), s: 0.8 + r() * 0.6 });
        else out.push({ z: 2, x, y, kind: edge && r() < 0.6 ? 'lolly' : r() < 0.5 ? 'cane' : 'drop', c: U.pick(['#ff5a9a', '#7fe7ff', '#ffd66b', '#4ad17f'], r), s: 0.8 + r() * 0.5 });
      }
    }
    return out.sort((a, b) => a.y - b.y);
  })();

  BF.GameModules.register('petsim', {
    three: true,
    maxBots: 8,
    feedTop: 0.17,
    actions: { use: ['KeyE'], send: ['Space', 'KeyF'], pets: ['KeyP'], book: ['KeyB'] },
    controls: { joystick: true, buttons: [{ act: 'send', label: 'Send pets', icon: 'paw' }, { act: 'use', label: 'Use', icon: 'cursor' }, { act: 'pets', label: 'Pets', icon: 'heart' }, { act: 'book', label: 'Book', icon: 'grid' }] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const V = ctx.g3;
      const parts = V ? V.particles2d(16) : new BF.Particles(500);
      const floats = V ? V.floaters2d(56) : new BF.Floaters();
      const cam = new BF.Camera(W, H);
      cam.bounds = { x: 0, y: 0, w: WW, h: WH };
      const d = ctx.data;
      if (!Array.isArray(d.pets)) {
        d.pets = [newPet('pupper'), newPet('kitty')];
        d.equipped = d.pets.map((p) => p.id);
        d.book = { pupper: true, kitty: true };
        d.petbucks = (d.petbucks || 0) + T.startBucks;
        d.firstRun = true;
      }
      d.equipped = (d.equipped || []).filter((id) => d.pets.some((p) => p.id === id));
      d.book = d.book || {};
      d.zones = d.zones || { meadow: true };
      d.collars = d.collars || {};
      d.pity = d.pity || {};
      d.pages = d.pages || {};
      d.petbucks = d.petbucks || 0;
      ctx.save();

      const maxEquip = () => (ctx.hasPass('storage') ? T.equipPass : T.equip);
      while (d.equipped.length > maxEquip()) d.equipped.pop();
      const topZone = ZONES.filter((z) => d.zones[z.id]).pop();
      const goal = T.goals[topZone.id];

      let phase = 'play';
      let time = T.session;
      let earned = 0, pilesBroken = 0, hatched = 0, bestHatch = null, pileCoinCount = 0;
      let pendingStat = 0, saveT = 0, dirty = false;
      let goalHit = false;
      let panel = null; // {kind, arg}
      let confirmRelease = null;
      let hatchFx = null;
      let tip = d.firstRun ? true : false;
      let lastZone = -1;
      const me = { x: 300, y: 450, a: 0, walk: 0, goal: null };
      let marker = null;

      function newPet(species) {
        return { id: U.uid('pet'), species, level: 1, xp: 0, collar: null };
      }
      function petPower(p) {
        const sp = SPECIES[p.species];
        return Math.round(sp.power * (1 + T.levelGain * (p.level - 1)) * (1 + (p.collar ? COLLARS[p.collar].bonus : 0)));
      }
      const xpNeed = (lvl) => 40 * lvl;
      const markDirty = () => { dirty = true; };

      // --------------------------------------------------------- squad
      let squad = [];
      function syncSquad() {
        const old = new Map(squad.map((s) => [s.pet.id, s]));
        squad = d.equipped.map((id) => d.pets.find((p) => p.id === id)).filter(Boolean).map((pet, i) => old.get(pet.id) || { pet, x: me.x + Math.cos(i) * 30, y: me.y + 30, bob: Math.random() * 6, target: null, hitT: 0, hop: 0 });
      }
      syncSquad();
      const teamPower = () => squad.reduce((a, s) => a + petPower(s.pet), 0);

      // ---------------------------------------------------------- piles
      const piles = [];
      function spawnPile(zi, rng) {
        const z = ZONES[zi];
        const def = U.weighted(PILES[z.id].map((p) => [p.w, p]), rng);
        for (let tries = 0; tries < 60; tries++) {
          const x = z.x + 90 + (rng || Math.random)() * (ZW - 180), y = 120 + (rng || Math.random)() * (WH - 200);
          if (STANDS.concat([SHOP]).some((s) => U.dist(s.x, s.y, x, y) < 120)) continue;
          if (U.dist(x, y, 300, 450) < 90) continue;
          if (piles.some((p) => p.alive && U.dist(p.x, p.y, x, y) < 70)) continue;
          return { zi, kind: def.kind, x, y, r: def.r, hp: def.hp, hpMax: def.hp, value: def.value, alive: true, respawn: 0, dmgMe: 0, dmgBot: 0, hitters: new Set(), shake: 0, botOwner: null };
        }
        return null;
      }
      ZONES.forEach((z, zi) => { for (let i = 0; i < T.perZone; i++) { const p = spawnPile(zi); if (p) piles.push(p); } });

      const orbs = [];
      function addBucks(n, x, y) {
        n = Math.round(n);
        d.petbucks += n;
        earned += n;
        pendingStat += n;
        markDirty();
        if (x != null) floats.add(x, y - 24, '+' + U.fmt(n), '#ffd66b', 15);
        if (!goalHit && earned >= goal && phase === 'play') {
          goalHit = true;
          ctx.banner('SESSION GOAL REACHED!', 'Keep going or end the session for your rewards', 2400);
          ctx.sfx('levelup');
          tray();
        }
      }

      function breakPile(p) {
        p.alive = false;
        p.respawn = U.rand(T.respawn[0], T.respawn[1]);
        parts.emit(p.x, p.y, { count: 26, colors: pileColors(p.kind), speed: 190, life: 0.7, gravity: 260 });
        if (p.dmgBot > p.dmgMe) {
          if (p.botOwner && cam.visible(p.x, p.y)) floats.add(p.x, p.y - 26, '+' + U.fmt(p.value), '#cfd6e2', 12);
          return;
        }
        ctx.sfx('coin');
        pilesBroken++;
        pileCoinCount++;
        if (pileCoinCount >= T.rewards.pilesPerCoin) { pileCoinCount = 0; ctx.reward(1, 'coin piles'); }
        const gain = Math.max(1, Math.round(p.hpMax / 30));
        for (const s of p.hitters) {
          if (!d.pets.includes(s.pet)) continue;
          if (s.pet.level >= T.levelCap) continue;
          s.pet.xp += gain;
          while (s.pet.level < T.levelCap && s.pet.xp >= xpNeed(s.pet.level)) {
            s.pet.xp -= xpNeed(s.pet.level);
            s.pet.level++;
            floats.add(s.x, s.y - 30, SPECIES[s.pet.species].name + ' Lv ' + s.pet.level + '!', '#7fe7ff', 13);
            parts.emit(s.x, s.y, { count: 14, color: '#7fe7ff', speed: 90, life: 0.6 });
            ctx.sfx('powerup');
            if (panel && panel.kind === 'pets') renderPanel();
          }
        }
        if (ctx.hasPass('autocollect')) addBucks(p.value, p.x, p.y);
        else {
          const n = Math.min(8, 3 + Math.floor(p.value / 150));
          for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU, sp = 90 + Math.random() * 140;
            orbs.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, v: p.value / n, t: 0, fly: false });
          }
        }
        markDirty();
      }

      function pileColors(kind) {
        return { coins: ['#ffd66b', '#f2a318'], chest: ['#9a6b3c', '#ffd66b'], vault: ['#9aa5b5', '#ffd66b'], crystal: ['#7fe7ff', '#ffffff'], geode: ['#b67cff', '#7fe7ff'], candy: ['#ff5a9a', '#ffffff'], cake: ['#ffd1f0', '#ff5a6a', '#ffffff'] }[kind] || ['#ffd66b'];
      }

      function sendPets(p) {
        if (!squad.length) { floats.add(me.x, me.y - 30, 'Equip a pet first (P)', '#ff8b98', 13); ctx.sfx('error'); return; }
        squad.forEach((s) => { s.target = p; });
        p.shake = 0.2;
        ctx.sfx('click');
      }
      function sendNearest() {
        const zi = zoneIndex(me.x);
        let best = null, bd = 260;
        for (const p of piles) if (p.alive && p.zi === zi) { const dd = U.dist(p.x, p.y, me.x, me.y); if (dd < bd) { bd = dd; best = p; } }
        if (best) sendPets(best);
        else floats.add(me.x, me.y - 30, 'No piles nearby', '#cfd6e2', 12);
      }

      // --------------------------------------------------------- hatching
      function hatch(eggId, count) {
        const egg = EGGS[eggId];
        const cost = egg.cost * count;
        if (d.petbucks < cost) { ctx.toast('Not enough PetBucks', 'error'); ctx.sfx('error'); return; }
        if (d.pets.length + count > T.storage) { ctx.toast('Pet storage is full (' + T.storage + '). Release some pets first.', 'error'); ctx.sfx('error'); return; }
        d.petbucks -= cost;
        const list = [];
        for (let i = 0; i < count; i++) {
          d.pity[eggId] = (d.pity[eggId] || 0) + 1;
          const forced = d.pity[eggId] >= T.pity;
          const species = rollSpecies(eggId, Math.random, forced ? 2 : 0);
          const sp = SPECIES[species];
          if (rank(sp.rarity) >= 2) d.pity[eggId] = 0;
          const pet = newPet(species);
          const isNew = !d.book[species];
          d.book[species] = true;
          d.pets.push(pet);
          if (d.equipped.length < maxEquip()) d.equipped.push(pet.id);
          list.push({ pet, sp, isNew, forced });
          hatched++;
          if (!bestHatch || rank(sp.rarity) > rank(bestHatch.rarity)) bestHatch = sp;
          ctx.reward(T.rewards.hatch[sp.rarity], 'pet hatching');
          ctx.xp(T.rewards.xpHatch);
          if (rank(sp.rarity) >= 4) { ctx.badge('pw_legendary'); ctx.feed('You hatched ' + U.withArticle(BF.RARITY[sp.rarity].label) + ' ' + sp.name + '!', 'star', BF.RARITY[sp.rarity].color); }
        }
        ctx.addStat('pets', count);
        ctx.playerStat('petsHatched', count);
        ctx.quest('hatch', count);
        ctx.badge('pw_first_hatch');
        syncSquad();
        checkPages();
        ctx.save();
        hatchFx = { list, t: 0, egg };
        closePanels();
        ctx.sfx('hatch');
      }

      function checkPages() {
        for (const egg of Object.values(EGGS)) {
          if (d.pages[egg.id]) continue;
          const all = Object.values(SPECIES).filter((s) => s.egg === egg.id);
          if (all.every((s) => d.book[s.id])) {
            d.pages[egg.id] = true;
            ctx.reward(T.rewards.page, 'collection book');
            ctx.feed('Collection book: ' + egg.name + ' page complete!', 'star', '#ffd66b');
            setTimeout(() => ctx.banner('PAGE COMPLETE!', egg.name + ' collection finished', 2200), 2600);
          }
        }
      }

      function unlockZone(zid) {
        const z = ZONES.find((x) => x.id === zid);
        if (d.zones[zid]) return;
        const prev = ZONES[ZONES.indexOf(z) - 1];
        if (prev && !d.zones[prev.id]) { ctx.toast('Unlock ' + prev.name + ' first', 'error'); return; }
        if (d.petbucks < z.cost) { ctx.toast('Not enough PetBucks', 'error'); ctx.sfx('error'); return; }
        d.petbucks -= z.cost;
        d.zones[zid] = true;
        ctx.save();
        ctx.reward(T.rewards.zone, 'new zone');
        if (zid === 'caves') ctx.badge('pw_caves');
        ctx.sfx('purchase');
        ctx.banner(z.name.toUpperCase() + ' UNLOCKED', 'Walk through the gate', 2000);
        parts.emit(z.x, GATE.y0 + 80, { count: 40, colors: ['#ffd66b', '#ffffff', '#7fe7ff'], speed: 220, life: 0.9 });
        closePanels();
      }

      // ----------------------------------------------------------- panels
      function closePanels() {
        panel = null;
        confirmRelease = null;
        ['pets', 'book', 'egg', 'gate', 'shop', 'tip'].forEach((id) => ctx.ui.remove(id));
      }
      function openPanel(kind, arg) {
        closePanels();
        panel = { kind, arg };
        ctx.sfx('open');
        renderPanel();
      }
      const bucksHtml = (n) => '<span class="gp-price" style="color:#ffd66b">' + BF.icon('paw', 12) + U.fmt(n) + ' PetBucks</span>';

      function renderPanel() {
        if (!panel) return;
        const close = '<button class="btn btn-ghost btn-sm gp-close" data-gact="close" aria-label="Close">' + BF.icon('x', 14) + '</button>';
        if (panel.kind === 'egg') {
          const egg = EGGS[panel.arg];
          const pity = T.pity - (d.pity[egg.id] || 0);
          const odds = Object.entries(egg.odds).map(([r, w]) => {
            const names = EGG_POOL[egg.id][r].map((id) => (d.book[id] ? SPECIES[id].name : '???')).join(', ');
            return '<div class="pw-odds"><span style="color:' + BF.RARITY[r].color + '">' + BF.RARITY[r].label + '</span><span class="faint">' + names + '</span><b class="num">' + w + '%</b></div>';
          }).join('');
          ctx.ui.panel('egg', close + '<h3>' + BF.icon('gift', 18) + ' ' + egg.name + '</h3><p>Costs ' + bucksHtml(egg.cost) + ' per egg. You have ' + bucksHtml(d.petbucks) + '. Eggs only use PetBucks earned in Pet World.</p><h4>Hatch odds</h4>' + odds +
            '<p class="faint" style="margin-top:8px">Rare or better is guaranteed within ' + pity + ' more hatch' + (pity === 1 ? '' : 'es') + ' of this egg.</p>' +
            '<div class="gp-actions"><button class="btn btn-outline" data-gact="hatch3"' + (d.petbucks < egg.cost * 3 ? ' disabled' : '') + '>Hatch x3 · ' + U.fmt(egg.cost * 3) + '</button><button class="btn btn-play" data-gact="hatch1"' + (d.petbucks < egg.cost ? ' disabled' : '') + '>' + BF.icon('sparkle', 14) + 'Hatch · ' + U.fmt(egg.cost) + '</button></div>', 'center');
        } else if (panel.kind === 'gate') {
          const z = ZONES.find((x) => x.id === panel.arg);
          const prev = ZONES[ZONES.indexOf(z) - 1];
          const blocked = prev && !d.zones[prev.id];
          ctx.ui.panel('gate', close + '<h3>' + BF.icon('lock', 18) + ' ' + z.name + '</h3><p>' + (z.id === 'caves' ? 'Glittering crystals and geodes worth far more PetBucks, plus the Crystal Egg.' : 'Sweet treats worth huge piles of PetBucks, plus the Candy Egg.') + '</p><p>Unlock cost: ' + bucksHtml(z.cost) + ' · You have ' + bucksHtml(d.petbucks) + '</p>' +
            (blocked ? '<p class="faint">Unlock ' + prev.name + ' first.</p>' : '') +
            '<div class="gp-actions"><button class="btn btn-ghost" data-gact="close">Not yet</button><button class="btn btn-primary" data-gact="unlock-' + z.id + '"' + (blocked || d.petbucks < z.cost ? ' disabled' : '') + '>' + BF.icon('unlock', 14) + 'Unlock</button></div>', 'center');
        } else if (panel.kind === 'shop') {
          ctx.ui.panel('shop', close + '<h3>' + BF.icon('bag', 18) + ' Collar Stand</h3><p>Collars boost one pet\'s power. Put them on from the Pets menu (P). You have ' + bucksHtml(d.petbucks) + '.</p><div class="gp-grid">' +
            Object.entries(COLLARS).map(([k, c]) => '<div class="gp-card"><b><span class="pw-dot" style="background:' + c.color + '"></span>' + c.name + '</b><small>+' + Math.round(c.bonus * 100) + '% power · owned ' + (d.collars[k] || 0) + '</small>' + bucksHtml(c.cost) + '<button class="btn btn-sm btn-gold" data-gact="collar-' + k + '"' + (d.petbucks < c.cost ? ' disabled' : '') + '>Buy</button></div>').join('') + '</div>', 'center');
        } else if (panel.kind === 'pets') {
          const list = d.pets.slice().sort((a, b) => (d.equipped.includes(b.id) - d.equipped.includes(a.id)) || petPower(b) - petPower(a));
          const cards = list.map((p) => {
            const sp = SPECIES[p.species];
            const eq = d.equipped.includes(p.id);
            const collarOpts = Object.keys(COLLARS).filter((k) => (d.collars[k] || 0) > 0 || p.collar === k);
            return '<div class="gp-card pw-pet' + (eq ? ' on' : '') + '">' + BF.petArt(sp, 64, p.collar) + '<b>' + U.esc(sp.name) + '</b><small><span style="color:' + BF.RARITY[sp.rarity].color + '">' + BF.RARITY[sp.rarity].label + '</span> · Lv ' + p.level + ' · Power ' + U.fmt(petPower(p)) + '</small>' +
              '<div class="bar-mini"><i style="width:' + (p.level >= T.levelCap ? 100 : Math.round((p.xp / xpNeed(p.level)) * 100)) + '%"></i></div>' +
              '<div class="gp-row"><button class="btn btn-xs ' + (eq ? 'btn-outline' : 'btn-primary') + '" data-gact="equip-' + p.id + '">' + (eq ? 'Unequip' : 'Equip') + '</button>' +
              (collarOpts.length ? '<button class="btn btn-xs btn-outline" data-gact="collar-cycle-' + p.id + '">' + (p.collar ? COLLARS[p.collar].name.split(' ')[0] : 'Collar') + '</button>' : '') +
              '<button class="btn btn-xs ' + (confirmRelease === p.id ? 'btn-danger' : 'btn-ghost') + '" data-gact="release-' + p.id + '">' + (confirmRelease === p.id ? 'Confirm' : 'Release') + '</button></div></div>';
          }).join('');
          ctx.ui.panel('pets', close + '<h3>' + BF.icon('paw', 18) + ' Your pets <span class="faint" style="font-size:13px;font-weight:600">' + d.pets.length + '/' + T.storage + '</span></h3><p>Equipped ' + d.equipped.length + '/' + maxEquip() + (ctx.hasPass('storage') ? ' (Pet Storage+)' : '') + ' · Team power ' + U.fmt(teamPower()) + '. Released pets give back a quarter of their value in PetBucks.</p>' +
            '<div class="gp-actions" style="justify-content:flex-start;margin:4px 0 8px"><button class="btn btn-sm btn-primary" data-gact="equip-best">' + BF.icon('bolt', 13) + 'Equip best</button></div><div class="gp-grid">' + cards + '</div>', 'center wide');
        } else if (panel.kind === 'book') {
          const found = Object.keys(SPECIES).filter((k) => d.book[k]).length;
          const pages = Object.values(EGGS).map((egg) => {
            const all = Object.values(SPECIES).filter((s) => s.egg === egg.id);
            return '<h4>' + egg.name + ' · ' + all.filter((s) => d.book[s.id]).length + '/' + all.length + (d.pages[egg.id] ? ' ' + BF.icon('check', 12) : '') + '</h4><div class="gp-grid pw-book">' + all.map((s) => d.book[s.id]
              ? '<div class="gp-card">' + BF.petArt(s, 56) + '<b>' + U.esc(s.name) + '</b><small style="color:' + BF.RARITY[s.rarity].color + '">' + BF.RARITY[s.rarity].label + ' · power ' + s.power + '</small></div>'
              : '<div class="gp-card locked"><div class="pw-silhouette">?</div><b>???</b><small style="color:' + BF.RARITY[s.rarity].color + '">' + BF.RARITY[s.rarity].label + '</small></div>').join('') + '</div>';
          }).join('');
          ctx.ui.panel('book', close + '<h3>' + BF.icon('grid', 18) + ' Collection book <span class="faint" style="font-size:13px;font-weight:600">' + found + '/' + Object.keys(SPECIES).length + '</span></h3><p>Discover every pet on a page for a one-time ' + T.rewards.page + ' ForgeCoin bonus.</p>' + pages, 'center wide');
        }
      }

      function tray() {
        if (phase !== 'play') { ctx.ui.remove('tray'); return; }
        ctx.ui.panel('tray', '<button class="btn btn-sm" data-gact="open-pets">' + BF.icon('paw', 13) + 'Pets <kbd>P</kbd></button><button class="btn btn-sm" data-gact="open-book">' + BF.icon('grid', 13) + 'Book <kbd>B</kbd></button>' +
          (goalHit ? '<button class="btn btn-sm btn-play" data-gact="end">' + BF.icon('check', 13) + 'End session</button>' : ''), 'tray');
      }
      tray();
      if (tip) {
        ctx.ui.panel('tip', '<h3>' + BF.icon('paw', 18) + ' Welcome to Pet World!</h3><p>Pupper and Kitty are your starter pets. Click a coin pile to send them, then walk over the PetBucks they break loose.</p><p>Spend PetBucks on eggs at the egg stands (press <b>E</b> nearby), unlock new zones through the gates and reach the session goal of <b>' + U.fmt(goal) + ' PetBucks</b> before the timer runs out.</p><div class="gp-actions"><button class="btn btn-play" data-gact="tip-ok">' + BF.icon('play', 14) + "Let's go</button></div>", 'center');
      }

      ctx.ui.on((a) => {
        if (a === 'close') { closePanels(); ctx.sfx('close'); return; }
        if (a === 'tip-ok') { tip = false; d.firstRun = false; ctx.save(); ctx.ui.remove('tip'); return; }
        if (a === 'open-pets') { panel && panel.kind === 'pets' ? closePanels() : openPanel('pets'); return; }
        if (a === 'open-book') { panel && panel.kind === 'book' ? closePanels() : openPanel('book'); return; }
        if (a === 'end') { finish(false); return; }
        if (a === 'hatch1' && panel) return hatch(panel.arg, 1);
        if (a === 'hatch3' && panel) return hatch(panel.arg, 3);
        if (a.indexOf('unlock-') === 0) return unlockZone(a.slice(7));
        if (a.indexOf('collar-cycle-') === 0) {
          const p = d.pets.find((x) => x.id === a.slice(13));
          if (!p) return;
          const order = [null].concat(Object.keys(COLLARS));
          let i = order.indexOf(p.collar);
          for (let n = 0; n < order.length; n++) {
            i = (i + 1) % order.length;
            const k = order[i];
            if (k === null || (d.collars[k] || 0) > 0) break;
          }
          if (p.collar) d.collars[p.collar] = (d.collars[p.collar] || 0) + 1;
          p.collar = order[i];
          if (p.collar) d.collars[p.collar]--;
          ctx.sfx('click');
          ctx.save();
          renderPanel();
          return;
        }
        if (a.indexOf('collar-') === 0) {
          const k = a.slice(7), c = COLLARS[k];
          if (!c) return;
          if (d.petbucks < c.cost) { ctx.toast('Not enough PetBucks', 'error'); return; }
          d.petbucks -= c.cost;
          d.collars[k] = (d.collars[k] || 0) + 1;
          ctx.save();
          ctx.sfx('purchase');
          ctx.feed('Bought a ' + c.name + '. Put it on a pet from the Pets menu.', 'star', '#ffd66b');
          renderPanel();
          return;
        }
        if (a === 'equip-best') {
          d.equipped = d.pets.slice().sort((x, y) => petPower(y) - petPower(x)).slice(0, maxEquip()).map((p) => p.id);
          syncSquad(); ctx.save(); ctx.sfx('powerup'); renderPanel();
          return;
        }
        if (a.indexOf('equip-') === 0) {
          const id = a.slice(6);
          if (d.equipped.includes(id)) d.equipped = d.equipped.filter((x) => x !== id);
          else if (d.equipped.length >= maxEquip()) { ctx.toast('You can equip ' + maxEquip() + ' pets at once' + (ctx.hasPass('storage') ? '' : ' (Pet Storage+ raises it to ' + T.equipPass + ')'), 'error'); return; }
          else d.equipped.push(id);
          syncSquad(); ctx.save(); ctx.sfx('click'); renderPanel();
          return;
        }
        if (a.indexOf('release-') === 0) {
          const id = a.slice(8);
          if (confirmRelease !== id) { confirmRelease = id; renderPanel(); return; }
          if (d.pets.length <= 1) { ctx.toast('You need to keep at least one pet', 'error'); confirmRelease = null; renderPanel(); return; }
          const p = d.pets.find((x) => x.id === id);
          if (!p) return;
          if (p.collar) d.collars[p.collar] = (d.collars[p.collar] || 0) + 1;
          d.pets = d.pets.filter((x) => x !== p);
          d.equipped = d.equipped.filter((x) => x !== id);
          const back = Math.round(SPECIES[p.species].value / 4);
          d.petbucks += back;
          confirmRelease = null;
          syncSquad(); ctx.save(); ctx.sfx('coin');
          ctx.feed(SPECIES[p.species].name + ' was released (+' + back + ' PetBucks).', 'info', '#cfd6e2');
          renderPanel();
        }
      });
      const offPass = BF.bus.on('pass:purchased', () => { syncSquad(); tray(); if (panel) renderPanel(); });

      // ---------------------------------------------------------------- bots
      const bots = [];
      function addBot(b) {
        const lvl = ctx.botLevel(b);
        const zi = lvl >= 34 ? 2 : lvl >= 16 ? 1 : 0;
        const z = ZONES[zi];
        const r = U.rng(b.id + ':pet-world');
        const n = 1 + Math.floor(r() * 3);
        const pets = [];
        for (let i = 0; i < n; i++) pets.push({ sp: SPECIES[rollSpecies(z.egg, r)], x: 0, y: 0, bob: r() * 6 });
        const x = z.x + 150 + r() * (ZW - 300), y = 140 + r() * (WH - 280);
        pets.forEach((p) => { p.x = x; p.y = y; });
        bots.push({ bot: b, zi, x, y, a: 0, walk: 0, t: r() * 2, target: null, pets, hatchT: 20 + r() * 40 });
      }
      ctx.bots.forEach(addBot);
      const botPower = (bt) => bt.pets.reduce((a, p) => a + p.sp.power, 0) * 0.9;

      function updateBots(dt) {
        for (const bt of bots) {
          bt.t -= dt;
          bt.hatchT -= dt;
          if (bt.hatchT <= 0) {
            bt.hatchT = 30 + Math.random() * 60;
            const sp = SPECIES[rollSpecies(ZONES[bt.zi].egg, Math.random)];
            if (bt.pets.length < 3) bt.pets.push({ sp, x: bt.x, y: bt.y, bob: 0 });
            else bt.pets[Math.floor(Math.random() * 3)].sp = sp;
            if (rank(sp.rarity) >= 2) ctx.feed(bt.bot.displayName + ' hatched ' + U.withArticle(BF.RARITY[sp.rarity].label) + ' ' + sp.name + '!', 'star', BF.RARITY[sp.rarity].color);
            if (rank(sp.rarity) >= 4 && Math.random() < 0.7) ctx.botSay(bt.bot, 'win');
          }
          if (!bt.target || !bt.target.alive) {
            bt.target = null;
            if (bt.t <= 0) {
              bt.t = 0.6 + Math.random() * 1.8;
              const opts = piles.filter((p) => p.alive && p.zi === bt.zi && U.dist(p.x, p.y, bt.x, bt.y) < 520);
              if (opts.length) bt.target = U.pick(opts);
            }
          }
          const tx = bt.target ? bt.target.x + 40 : bt.x, ty = bt.target ? bt.target.y + 30 : bt.y;
          const dx = tx - bt.x, dy = ty - bt.y, l = Math.hypot(dx, dy);
          if (l > 6) { const k = Math.min(1, (150 * dt) / l); bt.x += dx * k; bt.y += dy * k; bt.a = Math.atan2(dy, dx); bt.walk += dt * 10; }
          bt.pets.forEach((p, i) => {
            p.bob += dt * 8;
            let px, py;
            if (bt.target && l < 120) { const a = (i / bt.pets.length) * TAU + 1; px = bt.target.x + Math.cos(a) * (bt.target.r + 10); py = bt.target.y + Math.sin(a) * (bt.target.r + 8); }
            else { const a = bt.a + Math.PI + (i - (bt.pets.length - 1) / 2) * 0.75; px = bt.x + Math.cos(a) * 44; py = bt.y + Math.sin(a) * 44; }
            const ex = px - p.x, ey = py - p.y, el = Math.hypot(ex, ey);
            if (el > 2) { const k = Math.min(1, (240 * dt) / el); p.x += ex * k; p.y += ey * k; }
          });
          if (bt.target && l < 120) {
            const dmg = botPower(bt) * dt;
            bt.target.hp -= dmg;
            bt.target.dmgBot += dmg;
            bt.target.botOwner = bt;
          }
        }
      }

      // ------------------------------------------------------------ helpers
      function blocked(x, y) {
        const R = T.radius;
        if (x < R || y < R || x > WW - R || y > WH - R) return true;
        for (const st of SOLID) if (U.dist(st.x, st.y + 18, x, y) < 44 + R) return true;
        for (let i = 1; i < ZONES.length; i++) {
          const bx = ZONES[i].x;
          if (Math.abs(x - bx) < R + 6) {
            const open = d.zones[ZONES[i].id] && y > GATE.y0 + R && y < GATE.y1 - R;
            if (!open) return true;
          }
        }
        return false;
      }
      function move(e, vx, vy, dt) {
        const nx = e.x + vx * dt, ny = e.y + vy * dt;
        if (!blocked(nx, e.y)) e.x = nx;
        if (!blocked(e.x, ny)) e.y = ny;
      }
      const stations = () => STANDS.concat([SHOP], GATES.filter((gt) => !d.zones[gt.zone]));
      function nearestStation(range) {
        let best = null, bd = range;
        for (const s of stations()) { const dd = U.dist(s.x, s.y, me.x, me.y); if (dd < bd) { bd = dd; best = s; } }
        return best;
      }
      function useStation(s) {
        if (s.kind === 'egg') {
          if (!d.zones[s.zone]) { floats.add(me.x, me.y - 30, 'Unlock this zone first', '#ff8b98', 13); return; }
          openPanel('egg', s.egg);
        } else if (s.kind === 'shop') openPanel('shop');
        else if (s.kind === 'gate') openPanel('gate', s.zone);
      }
      function worldClick(w) {
        const pile = piles.find((p) => p.alive && U.dist(p.x, p.y, w.x, w.y) < p.r + 12);
        if (pile) {
          if (pile.zi !== zoneIndex(me.x)) { floats.add(pile.x, pile.y - 30, 'Too far away', '#cfd6e2', 12); return; }
          sendPets(pile);
          return;
        }
        const st = stations().find((s) => U.dist(s.x, s.y, w.x, w.y) < (s.kind === 'gate' ? 70 : 60));
        if (st) {
          if (U.dist(st.x, st.y, me.x, me.y) < 170) useStation(st);
          else { me.goal = { x: st.x + (st.kind === 'gate' ? -60 : 0), y: st.y + (st.kind === 'gate' ? 0 : 84), use: st }; marker = { x: me.goal.x, y: me.goal.y, t: 0 }; }
          return;
        }
        me.goal = { x: w.x, y: w.y };
        marker = { x: w.x, y: w.y, t: 0 };
      }

      function finish(timeUp) {
        if (phase !== 'play') return;
        phase = 'over';
        closePanels();
        ctx.ui.remove('tray');
        for (const o of orbs) addBucks(o.v);
        orbs.length = 0;
        flush(true);
        const win = earned >= goal;
        const improved = ctx.best('bestSession', earned, 'max');
        ctx.end({
          outcome: win ? 'win' : 'lose',
          title: win ? 'Session goal reached!' : timeUp ? "Time's up!" : 'Session ended',
          subtitle: 'PetBucks earned: ' + U.fmt(earned) + ' / ' + U.fmt(goal),
          best: improved && earned > 0 ? 'New best session: ' + U.fmt(earned) + ' PetBucks' : null,
          coins: T.rewards.play + (win ? T.rewards.win : 0),
          xp: T.rewards.xpPlay + (win ? T.rewards.xpWin : 0),
          stats: [['PetBucks earned', U.fmt(earned)], ['Piles broken', pilesBroken], ['Pets hatched', hatched], ['Best hatch', bestHatch ? bestHatch.name : '—'], ['Team power', U.fmt(teamPower())], ['Collection', Object.keys(d.book).length + '/' + Object.keys(SPECIES).length]],
        });
      }

      function flush(force) {
        if (pendingStat > 0) { ctx.addStat('petbucks', pendingStat); pendingStat = 0; }
        if (dirty || force) { ctx.save(); dirty = false; }
        saveT = 0;
      }

      // --------------------------------------------------------------- draw
      function drawPile(g, p, t) {
        const x = p.x + (p.shake > 0 ? Math.sin(t * 60) * 3 : 0), y = p.y;
        G.shadow(g, x, y + p.r * 0.7, p.r * 1.1, p.r * 0.4, 0.25);
        if (p.kind === 'coins') {
          for (const [ox, oy, rr] of [[-9, 4, 9], [8, 5, 9], [0, -4, 10], [-3, -12, 8]]) { G.circle(g, x + ox, y + oy, rr, '#e0a800'); G.circle(g, x + ox, y + oy - 2, rr - 1, '#ffd66b'); G.circle(g, x + ox - 2, y + oy - 4, rr * 0.3, '#fff3c4'); }
        } else if (p.kind === 'chest') {
          G.fillRR(g, x - 20, y - 14, 40, 26, 5, '#8b5a2b'); G.fillRR(g, x - 20, y - 20, 40, 12, 6, '#a86b3c');
          g.fillStyle = '#ffd66b'; g.fillRect(x - 20, y - 9, 40, 3); g.fillRect(x - 3, y - 12, 6, 9);
        } else if (p.kind === 'vault') {
          const c = p.zi === 2 ? '#ff8fc8' : p.zi === 1 ? '#7a6ad6' : '#8a94a6';
          G.fillRR(g, x - 26, y - 26, 52, 46, 7, U.shade(c, -0.25)); G.fillRR(g, x - 22, y - 22, 44, 38, 5, c);
          G.ring(g, x, y - 3, 10, '#ffd66b', 3); G.line(g, x, y - 3, x + Math.cos(t * 2) * 8, y - 3 + Math.sin(t * 2) * 8, '#ffd66b', 2);
        } else if (p.kind === 'crystal' || p.kind === 'geode') {
          const c = p.kind === 'crystal' ? '#7fe7ff' : '#b67cff';
          if (p.kind === 'geode') { G.circle(g, x, y, p.r, '#5a5470'); G.circle(g, x, y - 2, p.r - 6, '#3a2f5c'); }
          for (const [ox, h, w] of [[-8, 26, 8], [6, 32, 9], [0, 20, 7], [12, 18, 6]]) {
            g.fillStyle = c; g.beginPath(); g.moveTo(x + ox - w, y + 6); g.lineTo(x + ox, y + 6 - h); g.lineTo(x + ox + w, y + 6); g.closePath(); g.fill();
            g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.moveTo(x + ox - w * 0.3, y + 4); g.lineTo(x + ox, y + 6 - h); g.lineTo(x + ox + w * 0.2, y + 4); g.closePath(); g.fill();
          }
        } else if (p.kind === 'candy') {
          g.fillStyle = '#ff5a9a';
          g.beginPath(); g.moveTo(x - 14, y); g.lineTo(x - 26, y - 9); g.lineTo(x - 26, y + 9); g.closePath(); g.fill();
          g.beginPath(); g.moveTo(x + 14, y); g.lineTo(x + 26, y - 9); g.lineTo(x + 26, y + 9); g.closePath(); g.fill();
          G.circle(g, x, y, 15, '#ff5a9a'); G.ring(g, x, y, 9, '#ffffff', 3); G.circle(g, x - 5, y - 6, 3, '#ffd1e6');
        } else if (p.kind === 'cake') {
          G.fillRR(g, x - 24, y - 6, 48, 20, 6, '#c89b6d'); G.fillRR(g, x - 24, y - 12, 48, 10, 5, '#ffd1f0');
          G.fillRR(g, x - 16, y - 26, 32, 16, 5, '#c89b6d'); G.fillRR(g, x - 16, y - 30, 32, 8, 4, '#ffffff');
          G.circle(g, x, y - 34, 5, '#ff3d5a');
        }
        if (p.hp < p.hpMax) G.bar(g, x - 24, y - p.r - 20, 48, 6, p.hp / p.hpMax, p.dmgBot > p.dmgMe ? '#9aa5b5' : '#3fd08a');
        if (p.kind === 'vault' && cam.visible(x, y)) G.text(g, U.fmt(p.value), x, y + p.r + 16, { size: 11, align: 'center', color: '#fff', stroke: 'rgba(0,0,0,.5)', strokeW: 3 });
      }

      function drawEgg(g, egg, x, y, s, wob) {
        g.save();
        g.translate(x, y);
        g.rotate(wob || 0);
        g.fillStyle = egg.color;
        g.beginPath(); g.ellipse(0, 0, 20 * s, 26 * s, 0, 0, TAU); g.fill();
        g.fillStyle = egg.spot;
        for (const [ox, oy, r] of [[-8, -8, 5], [7, -2, 4], [-3, 10, 5], [9, 13, 3]]) { g.beginPath(); g.arc(ox * s, oy * s, r * s, 0, TAU); g.fill(); }
        g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(-7 * s, -12 * s, 4 * s, 7 * s, -0.4, 0, TAU); g.fill();
        g.restore();
      }

      function drawDecor(g, o, t) {
        const s = o.s;
        if (o.kind === 'flower') { G.circle(g, o.x, o.y, 3.5 * s, o.c); G.circle(g, o.x, o.y, 1.6 * s, '#ffd66b'); }
        else if (o.kind === 'tree') { G.shadow(g, o.x, o.y + 18 * s, 22 * s, 7 * s, 0.25); g.fillStyle = '#7a4a2a'; g.fillRect(o.x - 4 * s, o.y, 8 * s, 18 * s); G.circle(g, o.x, o.y - 6 * s, 22 * s, '#3f9a3a'); G.circle(g, o.x - 7 * s, o.y - 12 * s, 11 * s, '#58b84f'); }
        else if (o.kind === 'shard' || o.kind === 'spire') {
          const h = (o.kind === 'spire' ? 44 : 16) * s, w = (o.kind === 'spire' ? 12 : 5) * s;
          g.globalAlpha = 0.75 + Math.sin(t * 2 + o.x) * 0.2;
          g.fillStyle = o.c; g.beginPath(); g.moveTo(o.x - w, o.y); g.lineTo(o.x, o.y - h); g.lineTo(o.x + w, o.y); g.closePath(); g.fill();
          g.globalAlpha = 1;
        } else if (o.kind === 'cane') {
          g.lineCap = 'round';
          G.line(g, o.x, o.y, o.x, o.y - 26 * s, '#ffffff', 6 * s);
          g.strokeStyle = '#ff3d5a'; g.lineWidth = 6 * s; g.beginPath(); g.arc(o.x + 7 * s, o.y - 26 * s, 7 * s, Math.PI, 0); g.stroke();
          for (let k = 0; k < 3; k++) G.line(g, o.x - 3 * s, o.y - (6 + k * 7) * s, o.x + 3 * s, o.y - (3 + k * 7) * s, '#ff3d5a', 2.5 * s);
        } else if (o.kind === 'lolly') {
          G.line(g, o.x, o.y, o.x, o.y - 30 * s, '#ffffff', 4 * s);
          G.circle(g, o.x, o.y - 38 * s, 14 * s, o.c); G.ring(g, o.x, o.y - 38 * s, 8 * s, '#ffffff', 3 * s);
        } else if (o.kind === 'drop') G.circle(g, o.x, o.y, 4 * s, o.c);
      }

      function drawBorder(g, i, t) {
        const z = ZONES[i], bx = z.x, unlocked = !!d.zones[z.id];
        const wall = i === 1 ? ['#6b6f7d', '#565a68'] : ['#f7b6d9', '#e98fc0'];
        for (let y = 0; y < WH; y += 30) {
          if (y + 30 > GATE.y0 && y < GATE.y1) continue;
          G.fillRR(g, bx - 12, y, 24, 28, 5, (y / 30) % 2 ? wall[0] : wall[1]);
        }
        g.fillStyle = unlocked ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.25)';
        g.fillRect(bx - 12, GATE.y0, 24, GATE.y1 - GATE.y0);
        if (!unlocked) {
          for (let y = GATE.y0 + 10; y < GATE.y1; y += 22) G.line(g, bx - 14, y, bx + 14, y, '#ffd66b', 4);
          const sy = GATE.y0 - 36;
          G.fillRR(g, bx - 70, sy - 20, 140, 42, 8, 'rgba(8,10,16,.85)');
          G.text(g, z.name, bx, sy - 3, { size: 12, align: 'center', color: '#fff' });
          G.text(g, U.fmt(z.cost) + ' PetBucks', bx, sy + 14, { size: 12, align: 'center', color: '#ffd66b', weight: 800 });
          if (U.dist(bx, (GATE.y0 + GATE.y1) / 2, me.x, me.y) < 170) G.text(g, 'E  Unlock', bx - 40, GATE.y1 + 26, { size: 13, align: 'center', color: '#0b0e13', weight: 900, stroke: '#ffd66b', strokeW: 8 });
        } else if (Math.sin(t * 3) > 0) {
          G.circle(g, bx, GATE.y0 + 6, 3, '#ffd66b');
          G.circle(g, bx, GATE.y1 - 6, 3, '#ffd66b');
        }
      }

      function drawStation(g, s, t) {
        if (s.kind === 'egg') {
          const egg = EGGS[s.egg];
          G.shadow(g, s.x, s.y + 36, 46, 12, 0.3);
          G.fillRR(g, s.x - 42, s.y + 8, 84, 30, 9, '#d7dde6'); G.fillRR(g, s.x - 42, s.y + 8, 84, 8, 4, '#ffffff');
          drawEgg(g, egg, s.x, s.y - 14, 1.3, Math.sin(t * 2.5) * 0.08);
          G.fillRR(g, s.x - 62, s.y - 76, 124, 34, 8, 'rgba(8,10,16,.78)');
          G.text(g, egg.name, s.x, s.y - 61, { size: 12, align: 'center', color: '#fff' });
          G.text(g, U.fmt(egg.cost) + ' PetBucks', s.x, s.y - 47, { size: 11, align: 'center', color: '#ffd66b', weight: 800 });
        } else if (s.kind === 'shop') {
          G.shadow(g, s.x, s.y + 30, 50, 12, 0.3);
          G.fillRR(g, s.x - 44, s.y - 6, 88, 36, 6, '#a86b3c');
          for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#ff5a6a'; g.fillRect(s.x - 48 + i * 16, s.y - 30, 16, 20); }
          Object.values(COLLARS).forEach((c, i) => G.ring(g, s.x - 24 + i * 24, s.y + 12, 7, c.color, 3));
          G.text(g, 'Collar Stand', s.x, s.y - 38, { size: 12, align: 'center', color: '#fff', stroke: 'rgba(0,0,0,.6)', strokeW: 3 });
        }
        if (s.kind !== 'gate' && U.dist(s.x, s.y, me.x, me.y) < 110) G.text(g, 'E', s.x + 52, s.y - 20, { size: 13, align: 'center', color: '#0b0e13', weight: 900, stroke: '#ffd66b', strokeW: 9 });
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        const PRESET = ['day', 'cave', 'day'];
        let lastPreset = -1;
        V.shadowSize(620);
        // ground: one checker floor per zone, a dim veil over locked zones
        const veils = [];
        ZONES.forEach((z, i) => {
          V.ground(z.x, 0, z.x + ZW, WH, '#ffffff', { map: BF.g3d.gridTex(z.ground[0], 'rgba(0,0,0,0)', 1, { check: z.ground[1], repeat: [ZW / 120, WH / 120], noise: true }) });
          const v = V.ground(z.x, 0, z.x + ZW, WH, '#080a10', { y: 0.6, basic: true, opacity: 0.35, depthWrite: false });
          veils.push(v);
        });
        V.ground(-2400, -2000, WW + 2400, WH + 2000, '#2a3a2a', { y: -3, map: BF.g3d.gridTex('#355e32', 'rgba(0,0,0,0)', 1, { repeat: [40, 20], noise: true }) });
        V.ground(0, GATE.y0 + 40, WW, GATE.y1 - 40, '#ffffff', { y: 0.3, basic: true, opacity: 0.14, depthWrite: false });
        // world edge fence
        const fence = [];
        for (let x = 0; x < WW; x += 60) { fence.push({ x: x + 30, z: -8, w: 58, h: 16, d: 10, color: '#8b5a2b' }); fence.push({ x: x + 30, z: WH + 8, w: 58, h: 16, d: 10, color: '#8b5a2b' }); }
        for (let z = 0; z < WH; z += 60) { fence.push({ x: -8, z: z + 30, w: 10, h: 16, d: 58, color: '#8b5a2b' }); fence.push({ x: WW + 8, z: z + 30, w: 10, h: 16, d: 58, color: '#8b5a2b' }); }
        V.boxes(fence);
        // decor
        const flowers = [], trunks = [], crowns = [], shards = [], spires = [], sticks = [], candies = [], drops = [];
        for (const o of DECOR) {
          const sc = o.s;
          if (o.kind === 'flower') { flowers.push({ x: o.x, z: o.y, w: 7 * sc, h: 5 * sc, d: 7 * sc, color: o.c }); }
          else if (o.kind === 'tree') { trunks.push({ x: o.x, z: o.y, w: 9 * sc, h: 26 * sc, d: 9 * sc, color: '#7a4a2a' }); crowns.push({ x: o.x, y: 20 * sc, z: o.y, w: 48 * sc, h: 40 * sc, d: 48 * sc, color: U.shade('#3f9a3a', (o.x % 7) / 60) }); }
          else if (o.kind === 'shard') shards.push({ x: o.x, z: o.y, w: 10 * sc, h: 22 * sc, d: 10 * sc, color: o.c, rot: o.x });
          else if (o.kind === 'spire') spires.push({ x: o.x, z: o.y, w: 26 * sc, h: 70 * sc, d: 26 * sc, color: o.c, rot: o.y });
          else if (o.kind === 'cane') { sticks.push({ x: o.x, z: o.y, w: 6 * sc, h: 34 * sc, d: 6 * sc, color: '#ffffff' }); candies.push({ x: o.x + 5 * sc, y: 30 * sc, z: o.y, w: 16 * sc, h: 8 * sc, d: 7 * sc, color: '#ff3d5a' }); }
          else if (o.kind === 'lolly') { sticks.push({ x: o.x, z: o.y, w: 4 * sc, h: 36 * sc, d: 4 * sc, color: '#ffffff' }); drops.push({ x: o.x, y: 30 * sc, z: o.y, w: 28 * sc, h: 28 * sc, d: 10 * sc, color: o.c }); }
          else drops.push({ x: o.x, z: o.y, w: 8 * sc, h: 8 * sc, d: 8 * sc, color: o.c });
        }
        V.boxes(flowers, { shadow: false });
        V.boxes(trunks, { geo: 'cylLo' });
        V.boxes(crowns, { geo: 'sphereLo' });
        V.boxes(shards, { geo: 'cone4', glow: true, shadow: false });
        V.boxes(spires, { geo: 'cone4', glow: true });
        V.boxes(sticks, { geo: 'cylLo' });
        V.boxes(candies);
        V.boxes(drops, { geo: 'sphereLo' });
        // zone walls with gates
        const bars = [];
        const walls = [];
        for (let i = 1; i < ZONES.length; i++) {
          const bx = ZONES[i].x;
          const wall = i === 1 ? ['#6b6f7d', '#565a68'] : ['#f7b6d9', '#e98fc0'];
          for (let y = 0; y < WH; y += 30) {
            if (y + 30 > GATE.y0 && y < GATE.y1) continue;
            walls.push({ x: bx, z: y + 15, w: 24, h: 44 + ((y / 30) % 2) * 8, d: 29, color: (y / 30) % 2 ? wall[0] : wall[1] });
          }
          for (const sd of [GATE.y0, GATE.y1]) walls.push({ x: bx, z: sd, w: 30, h: 70, d: 16, color: '#ffd66b' });
          const g = V.group();
          for (let y = GATE.y0 + 12; y < GATE.y1; y += 22) V.box(bx, 0, y, 8, 56, 6, '#ffd66b', { parent: g, metal: 0.4, rough: 0.4 });
          V.box(bx, 56, (GATE.y0 + GATE.y1) / 2, 10, 6, GATE.y1 - GATE.y0, '#e0a800', { parent: g });
          bars.push({ zone: ZONES[i], g });
        }
        V.boxes(walls);
        // stations
        const eggs = STANDS.map((st) => {
          const egg = EGGS[st.egg];
          V.box(st.x, 0, st.y + 10, 88, 26, 60, '#d7dde6');
          V.box(st.x, 26, st.y + 10, 90, 4, 62, '#ffffff');
          const g = V.group();
          g.position.set(st.x, 30, st.y + 10);
          V.shape('sphere', 0, 34, 0, 44, 60, 44, egg.color, { parent: g, rough: 0.5 });
          for (const [ox, oy, oz, r] of [[-12, 44, 16, 11], [14, 30, 15, 9], [-4, 18, 20, 10], [8, 52, -14, 8], [-16, 28, -12, 9]]) V.shape('sphere', ox, oy, oz, r, r, r, egg.spot, { parent: g });
          return { st, g };
        });
        V.box(SHOP.x, 0, SHOP.y, 92, 30, 44, '#a86b3c');
        for (let i = 0; i < 6; i++) V.box(SHOP.x - 40 + i * 16, 58, SHOP.y - 6, 16, 8, 58, i % 2 ? '#ffffff' : '#ff5a6a');
        for (const sd of [-1, 1]) V.box(SHOP.x + sd * 42, 0, SHOP.y - 26, 5, 60, 5, '#6b4226');
        Object.values(COLLARS).forEach((c, i) => V.shape('torus', SHOP.x - 26 + i * 26, 44, SHOP.y, 18, 18, 18, c.color, { metal: 0.3, rough: 0.35 }));

        const pilePool = V.pool(), orbPool = V.pool(), petPool = V.pool();
        const ringMark = V.shape('ring', 0, 1, 0, 30, 30, 1, '#ffffff', { basic: true, opacity: 0.8, side: 2, shadow: false });
        ringMark.rotation.x = -Math.PI / 2;

        function pileModel(p) {
          const g = V.group();
          if (p.kind === 'coins') {
            for (const [ox, oz, n] of [[-9, 4, 3], [9, 5, 2], [0, -6, 4], [-2, 12, 1]]) for (let k = 0; k < n; k++) V.shape('cylLo', ox + (k % 2), 3 + k * 5, oz, 18, 5, 18, k % 2 ? '#e0a800' : '#ffd66b', { parent: g, metal: 0.5, rough: 0.35 });
          } else if (p.kind === 'chest') {
            V.box(0, 0, 0, 42, 24, 30, '#8b5a2b', { parent: g });
            V.box(0, 24, 0, 44, 10, 32, '#a86b3c', { parent: g });
            V.box(0, 14, 15.5, 44, 4, 2, '#ffd66b', { parent: g, glow: 0.2 });
            V.box(0, 16, 16.5, 7, 9, 2, '#ffd66b', { parent: g, glow: 0.3 });
          } else if (p.kind === 'vault') {
            const c = p.zi === 2 ? '#ff8fc8' : p.zi === 1 ? '#7a6ad6' : '#8a94a6';
            V.box(0, 0, 0, 54, 50, 44, U.shade(c, -0.25), { parent: g, metal: 0.4 });
            V.box(0, 4, 22.5, 44, 40, 2, c, { parent: g, metal: 0.4 });
            V.shape('torus', 0, 24, 24, 22, 22, 22, '#ffd66b', { parent: g, metal: 0.6, rough: 0.3 });
            g.userData.dial = V.box(0, 20, 24.5, 3, 12, 2, '#ffd66b', { parent: g });
          } else if (p.kind === 'crystal' || p.kind === 'geode') {
            const c = p.kind === 'crystal' ? '#7fe7ff' : '#b67cff';
            if (p.kind === 'geode') V.shape('dodeca', 0, 16, 0, 46, 32, 46, '#5a5470', { parent: g, flat: true });
            for (const [ox, h, w, oz] of [[-9, 34, 14, 2], [7, 44, 16, -4], [0, 26, 12, 10], [13, 24, 10, 8]]) V.shape('octa', ox, h / 2 + (p.kind === 'geode' ? 12 : 0), oz, w, h, w, c, { parent: g, glow: 0.5, opacity: 0.92, flat: true, rough: 0.15 });
          } else if (p.kind === 'candy') {
            V.shape('sphere', 0, 16, 0, 30, 30, 30, '#ff5a9a', { parent: g, rough: 0.3 });
            V.shape('torus', 0, 16, 14, 16, 16, 12, '#ffffff', { parent: g });
            for (const sd of [-1, 1]) { const c = V.shape('cone4', sd * 22, 16, 0, 18, 16, 18, '#ff5a9a', { parent: g }); c.rotation.z = sd * Math.PI / 2; }
          } else if (p.kind === 'cake') {
            V.shape('cyl', 0, 11, 0, 52, 22, 52, '#c89b6d', { parent: g });
            V.shape('cyl', 0, 23, 0, 54, 4, 54, '#ffd1f0', { parent: g });
            V.shape('cyl', 0, 33, 0, 34, 18, 34, '#c89b6d', { parent: g });
            V.shape('cyl', 0, 43, 0, 36, 4, 36, '#ffffff', { parent: g });
            V.shape('sphere', 0, 51, 0, 11, 11, 11, '#ff3d5a', { parent: g, glow: 0.2 });
          }
          return g;
        }

        function petModel(sp, collar) {
          const c = collar && COLLARS[collar];
          const m = BF.pet3d.build(sp, { collar: c ? c.color : null });
          V.scene.add(m);
          return m;
        }
        function placePet(key, sp, collar, x, y, lift, size, lookA, dt) {
          const m = petPool.use(key + ':' + sp.id + ':' + (collar || ''), () => petModel(sp, collar));
          m.scale.setScalar(size);
          m.position.set(x, lift, y);
          const px = m.userData.px, py = m.userData.py;
          const u = m.userData;
          if (lookA != null) { u.a = lookA; u.idle = 0; }
          else if (px != null && Math.hypot(x - px, y - py) > 0.4) { u.a = Math.atan2(y - py, x - px); u.idle = 0; }
          else if ((u.idle = (u.idle || 0) + dt) > 0.5) {
            // resting pets turn to face the camera
            const want = Math.PI / 2, cur = u.a == null ? want : u.a;
            u.a = cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur)) * Math.min(1, dt * 4);
          }
          u.px = x; u.py = y;
          BF.pet3d.face(m, u.a == null ? Math.PI / 2 : u.a);
          m.userData.tick(ctx.time);
          return m;
        }

        return function sync(dt) {
          const t = ctx.time;
          const zi = zoneIndex(me.x);
          if (zi !== lastPreset) { lastPreset = zi; V.preset(PRESET[zi], { fogNear: 900, fogFar: 2600 }); }
          V.look(me.x, 0, me.y, { dist: 420, pitch: 0.84, fov: 45, lerp: 0.14 }, dt);
          ZONES.forEach((z, i) => { veils[i].visible = !d.zones[z.id]; });
          for (const b of bars) {
            b.g.visible = !d.zones[b.zone.id];
            if (b.g.visible) V.label(b.zone.x, 92, GATE.y0 - 10, { name: b.zone.name + ' · ' + U.fmt(b.zone.cost) + ' PetBucks' + (U.dist(b.zone.x, (GATE.y0 + GATE.y1) / 2, me.x, me.y) < 170 ? '  [E] Unlock' : ''), color: '#ffd66b' });
          }
          for (const e of eggs) {
            e.g.rotation.z = Math.sin(t * 2.5) * 0.08;
            e.g.rotation.y = Math.sin(t * 0.7) * 0.4;
            const egg = EGGS[e.st.egg];
            const near = U.dist(e.st.x, e.st.y, me.x, me.y) < 110;
            V.label(e.st.x, 120, e.st.y + 10, { name: (near ? '[E] ' : '') + egg.name + ' · ' + U.fmt(egg.cost), color: d.zones[e.st.zone] ? '#ffd66b' : '#9aa5b5' });
          }
          V.label(SHOP.x, 80, SHOP.y, { name: (U.dist(SHOP.x, SHOP.y, me.x, me.y) < 110 ? '[E] ' : '') + 'Collar Stand', color: '#ffffff' });
          for (const p of piles) {
            if (!p.alive) continue;
            if (Math.abs(p.x - me.x) > 1100 || Math.abs(p.y - me.y) > 800) continue;
            const m = pilePool.use(p, () => pileModel(p));
            m.position.set(p.x + (p.shake > 0 ? Math.sin(t * 60) * 3 : 0), 0, p.y);
            if (m.userData.dial) m.userData.dial.rotation.z = t * 2;
            if (p.hp < p.hpMax) V.label(p.x, p.r * 2 + 30, p.y, { hp: p.hp / p.hpMax, hpColor: p.dmgBot > p.dmgMe ? '#9aa5b5' : '#3fd08a' });
            else if (p.kind === 'vault') V.label(p.x, 70, p.y, { name: U.fmt(p.value), color: '#ffd66b' });
          }
          pilePool.sweep();
          for (const o of orbs) {
            const m = orbPool.use(o, () => V.shape('cylLo', 0, 0, 0, 14, 3, 14, '#ffd66b', { metal: 0.6, rough: 0.3, glow: 0.25 }));
            m.position.set(o.x, 10 + (o.t < 0.45 ? Math.sin((o.t / 0.45) * Math.PI) * 24 : 4), o.y);
            m.rotation.x = Math.PI / 2;
            m.rotation.z = t * 6 + o.v;
          }
          orbPool.sweep();
          ringMark.visible = !!marker;
          if (marker) { ringMark.position.set(marker.x, 1, marker.y); const k = 1 + marker.t * 2.5; ringMark.scale.set(16 * k, 16 * k, 1); ringMark.material = V.mat('#ffffff', { basic: true, opacity: Math.max(0.05, 1 - marker.t / 0.6), side: 2 }); }
          // bots and their pets
          for (const bt of bots) {
            if (Math.abs(bt.x - me.x) > 1300) continue;
            bt.pets.forEach((p, i) => placePet(bt.bot.id + i, p.sp, null, p.x, p.y, Math.abs(Math.sin(p.bob)) * 3, 22, null, dt));
            const rig = V.actor(bt.bot.id, bt.bot.avatar, { scale: 8.5 });
            const mv = bt._px != null && dt > 0 ? Math.hypot(bt.x - bt._px, bt.y - bt._py) / dt : 0;
            bt._px = bt.x; bt._py = bt.y;
            rig.setPos(bt.x, 0, bt.y);
            rig.faceAngle(bt.a);
            rig.set({ move: mv / 150 });
            V.label(bt.x, 60, bt.y, { name: bt.bot.displayName, color: '#ffffff', bubble: ctx.bubbleText(bt.bot.id) });
          }
          // my squad and me
          for (const sq of squad) {
            const hop = sq.hop > 0 ? Math.sin((sq.hop / 0.18) * Math.PI) * 10 : 0;
            const aim = sq.target && sq.target.alive && U.dist(sq.x, sq.y, sq.target.x, sq.target.y) < 60 ? Math.atan2(sq.target.y - sq.y, sq.target.x - sq.x) : null;
            placePet(sq.pet.id, SPECIES[sq.pet.species], sq.pet.collar, sq.x, sq.y, Math.abs(Math.sin(sq.bob)) * 3 + hop, 26, aim, dt);
          }
          petPool.sweep();
          const rig = V.actor('me', ctx.player.avatar, { scale: 8.5 });
          rig.setPos(me.x, 0, me.y);
          rig.faceAngle(me.a);
          const mv = me._px != null && dt > 0 ? Math.hypot(me.x - me._px, me.y - me._py) / dt : 0;
          me._px = me.x; me._py = me.y;
          rig.set({ move: mv / T.speed });
          V.label(me.x, 60, me.y, { name: ctx.player.name, color: '#ffb454', bubble: ctx.bubbleText('me') });
          V.sweep();
        };
      })();

      return {
        update(dt) {
          parts.update(dt);
          floats.update(dt);
          if (phase !== 'play') return;
          const inp = ctx.input;
          const t = ctx.time;
          for (const p of piles) {
            if (p.shake > 0) p.shake -= dt;
            if (p.alive && p.hp <= 0) breakPile(p);
            if (!p.alive) { p.respawn -= dt; if (p.respawn <= 0) { const i = piles.indexOf(p); const np = spawnPile(p.zi); if (np) piles[i] = np; else p.respawn = 2; } }
          }
          updateBots(dt);
          if (tip) { cam.follow(me.x, me.y, dt, 0.15); return; }
          time -= dt;
          saveT += dt;
          if (saveT > 3) flush();
          if (time <= 0) { finish(true); return; }
          if (time < 30 && Math.floor(time) !== Math.floor(time + dt) && Math.floor(time) % 10 === 0) ctx.banner(Math.floor(time) + ' seconds left!', goalHit ? 'Goal done, keep earning' : U.fmt(Math.max(0, goal - earned)) + ' PetBucks to go', 1200);

          // pets
          const n = squad.length;
          squad.forEach((s, i) => {
            s.bob += dt * 8;
            if (s.hop > 0) s.hop -= dt;
            let tx, ty;
            if (s.target && s.target.alive) { const a = (i / Math.max(1, n)) * TAU + 0.6; tx = s.target.x + Math.cos(a) * (s.target.r + 12); ty = s.target.y + Math.sin(a) * (s.target.r + 10); }
            else {
              // trail behind the player on an arc wide enough that 30 px pets never touch
              s.target = null;
              const r = 50 + Math.max(0, n - 3) * 8, step = Math.min(0.95, 44 / r);
              const a = me.a + Math.PI + (i - (n - 1) / 2) * step;
              tx = me.x + Math.cos(a) * r; ty = me.y + Math.sin(a) * r;
            }
            const dx = tx - s.x, dy = ty - s.y, l = Math.hypot(dx, dy);
            if (l > 900) { s.x = me.x; s.y = me.y; }
            else if (l > 2) { const k = Math.min(1, (T.petSpeed * (l > 260 ? 2 : 1) * dt) / l); s.x += dx * k; s.y += dy * k; }
            if (s.target && l < 12) {
              const dmg = petPower(s.pet) * dt;
              s.target.hp -= dmg;
              s.target.dmgMe += dmg;
              s.target.hitters.add(s);
              s.hitT += dt;
              if (s.hitT > 0.3) { s.hitT = 0; s.hop = 0.18; parts.emit(s.target.x + (Math.random() - 0.5) * 20, s.target.y - 6, { count: 3, colors: pileColors(s.target.kind), speed: 90, life: 0.35 }); }
            }
          });

          // keep pets from overlapping each other and the player
          for (let i = 0; i < squad.length; i++) {
            const a = squad[i];
            for (let j = i + 1; j < squad.length; j++) {
              const b = squad[j], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 0.01;
              // pets working a pile hold their slot on its ring so they keep hitting it
              if ((a.target && a.target.alive) || (b.target && b.target.alive)) continue;
              if (l < 42) { const k = (42 - l) / 2 / l; a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k; }
            }
            const dx = a.x - me.x, dy = a.y - me.y, l = Math.hypot(dx, dy) || 0.01;
            if (l < 38 && !(a.target && a.target.alive)) { const k = (38 - l) / l; a.x += dx * k; a.y += dy * k; }
          }

          // orbs
          for (let i = orbs.length - 1; i >= 0; i--) {
            const o = orbs[i];
            o.t += dt;
            if (o.t < 0.45) { o.x += o.vx * dt; o.y += o.vy * dt; o.vx *= 0.9; o.vy *= 0.9; continue; }
            const dd = U.dist(o.x, o.y, me.x, me.y);
            if (dd < T.magnet || o.t > 10) o.fly = true;
            if (o.fly) { const a = U.angleTo(o.x, o.y, me.x, me.y); const sp = 420 + o.t * 40; o.x += Math.cos(a) * sp * dt; o.y += Math.sin(a) * sp * dt; }
            if (dd < 18) { orbs.splice(i, 1); addBucks(o.v, me.x, me.y - 4); ctx.sfx('pickup'); }
          }

          if (hatchFx) {
            hatchFx.t += dt;
            if (hatchFx.t > 1.3 && (inp.pointer.pressed || inp.actPressed('use') || inp.actPressed('send'))) hatchFx = null;
            else if (hatchFx.t > 4.2) hatchFx = null;
            else if (hatchFx.t > 1.1 && !hatchFx.burst) {
              hatchFx.burst = true;
              const top = hatchFx.list.reduce((m, h) => Math.max(m, rank(h.sp.rarity)), 0);
              ctx.sfx(top >= 4 ? 'levelup' : 'powerup');
            }
            cam.follow(me.x, me.y, dt, 0.15);
            return;
          }

          if (inp.actPressed('pets')) panel && panel.kind === 'pets' ? closePanels() : openPanel('pets');
          if (inp.actPressed('book')) panel && panel.kind === 'book' ? closePanels() : openPanel('book');

          // movement
          const ax = inp.axis();
          let mx = ax.x, my = ax.y;
          if (Math.hypot(mx, my) > 0.1) { me.goal = null; if (panel && (panel.kind === 'egg' || panel.kind === 'gate' || panel.kind === 'shop')) closePanels(); }
          else if (me.goal) {
            const dx = me.goal.x - me.x, dy = me.goal.y - me.y, l = Math.hypot(dx, dy);
            if (l < 8) { const use = me.goal.use; me.goal = null; if (use) useStation(use); }
            else { mx = dx / l; my = dy / l; }
          }
          if (Math.hypot(mx, my) > 0.1) {
            const ox = me.x, oy = me.y;
            move(me, mx * T.speed, my * T.speed, dt);
            me.a = Math.atan2(my, mx);
            me.walk += dt * 12;
            if (me.goal && Math.hypot(me.x - ox, me.y - oy) < 0.5) me.goal = null;
          }
          if (marker) { marker.t += dt; if (marker.t > 0.6) marker = null; }

          if (inp.pointer.pressed) {
            if (panel) closePanels();
            else worldClick(V ? ctx.pointerWorld(0) : cam.toWorld(inp.pointer.x, inp.pointer.y));
          }
          if (inp.actPressed('use')) {
            const st = nearestStation(120);
            if (st) useStation(st);
            else sendNearest();
          }
          if (inp.actPressed('send')) sendNearest();

          const zi = zoneIndex(me.x);
          if (zi !== lastZone) { if (lastZone >= 0) ctx.banner(ZONES[zi].name, zi ? 'Stronger piles, better eggs' : '', 1400); lastZone = zi; }
          cam.follow(me.x, me.y, dt, 0.15);
        },

        draw(g) {
          const t = ctx.time;
          g.save();
          cam.apply(g);
          // ground
          const TS = 60;
          const x0 = Math.max(0, Math.floor(cam.x / TS)), y0 = Math.max(0, Math.floor(cam.y / TS));
          const x1 = Math.min(WW / TS, x0 + Math.ceil(W / TS) + 2), y1 = Math.min(WH / TS, y0 + Math.ceil(H / TS) + 2);
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const z = ZONES[zoneIndex(x * TS)];
            g.fillStyle = z.ground[(x + y) % 2];
            g.fillRect(x * TS, y * TS, TS, TS);
          }
          for (let i = 0; i < ZONES.length; i++) if (!d.zones[ZONES[i].id]) { g.fillStyle = 'rgba(8,10,16,.28)'; g.fillRect(ZONES[i].x, 0, ZW, WH); }
          // path from spawn to gates
          g.fillStyle = 'rgba(255,255,255,.12)';
          g.fillRect(0, GATE.y0 + 40, WW, GATE.y1 - GATE.y0 - 80);
          for (const o of DECOR) if (cam.visible(o.x, o.y)) drawDecor(g, o, t);
          for (let i = 1; i < ZONES.length; i++) if (cam.visible(ZONES[i].x, WH / 2, WH)) drawBorder(g, i, t);
          for (const s of STANDS.concat([SHOP])) if (cam.visible(s.x, s.y, 120)) drawStation(g, s, t);
          for (const p of piles) if (p.alive && cam.visible(p.x, p.y)) drawPile(g, p, t);
          for (const o of orbs) { if (!cam.visible(o.x, o.y)) continue; G.circle(g, o.x, o.y, 7, '#e0a800'); G.circle(g, o.x, o.y - 1, 5.5, '#ffd66b'); G.circle(g, o.x - 2, o.y - 3, 1.8, '#fff'); }
          if (marker) { g.globalAlpha = 1 - marker.t / 0.6; G.ring(g, marker.x, marker.y, 8 + marker.t * 20, '#ffffff', 2); g.globalAlpha = 1; }
          // bots
          for (const bt of bots) {
            if (!cam.visible(bt.x, bt.y, 120)) continue;
            for (const p of bt.pets) drawPet(g, p.sp, p.x, p.y - Math.abs(Math.sin(p.bob)) * 3, 30, t);
            G.avatarTop(g, bt.x, bt.y, T.radius, bt.bot.look, bt.a, { walk: bt.walk });
            G.nameTag(g, bt.x, bt.y - 16, bt.bot.displayName, '#fff');
            const bb = ctx.bubbleText(bt.bot.id);
            if (bb) G.bubble(g, bt.x, bt.y - 34, bb);
          }
          // my pets + me
          for (const s of squad) {
            const sp = SPECIES[s.pet.species];
            const hop = s.hop > 0 ? Math.sin((s.hop / 0.18) * Math.PI) * 8 : 0;
            G.shadow(g, s.x, s.y + 10, 11, 4, 0.2);
            drawPet(g, sp, s.x, s.y - Math.abs(Math.sin(s.bob)) * 3 - hop, 44, t, s.pet.collar);
          }
          G.avatarTop(g, me.x, me.y, T.radius, ctx.player.look, me.a, { walk: me.walk });
          G.nameTag(g, me.x, me.y - 16, ctx.player.name, '#ffb454');
          const mb = ctx.bubbleText('me');
          if (mb) G.bubble(g, me.x, me.y - 34, mb);
          parts.draw(g);
          floats.draw(g);
          g.restore();
          drawHud(g);
        },

        render3d(dt) { view(dt); },
        hud(g) { drawHud(g); },

        onBotJoin(b) { addBot(b); },
        onBotLeave(b) { const i = bots.findIndex((x) => x.bot.id === b.id); if (i >= 0) bots.splice(i, 1); },
        onEmote() { squad.forEach((s) => { s.hop = 0.18; }); },
        destroy() { offPass(); flush(true); },
      };

      function drawHud(g) {
          const t = ctx.time;
          G.panel(g, 10, 10, 262, 70);
          G.circle(g, 30, 32, 11, '#e0a800'); G.circle(g, 30, 31, 9, '#ffd66b');
          G.text(g, 'P', 30, 36, { size: 11, align: 'center', color: '#8a5a00', weight: 900 });
          G.text(g, U.fmt(d.petbucks), 48, 39, { size: 22, weight: 800, color: '#ffd66b' });
          G.text(g, 'PetBucks', 260, 30, { size: 11, align: 'right', color: '#a1abbb' });
          G.bar(g, 20, 54, 150, 9, earned / goal, goalHit ? '#3fd08a' : '#ffb454');
          G.text(g, U.compact(earned) + ' / ' + U.compact(goal), 262, 63, { size: 11, align: 'right', color: '#cfd6e2' });
          G.text(g, 'Session goal', 20, 76, { size: 10, color: '#a1abbb' });
          const zi = zoneIndex(me.x);
          G.panel(g, W - 210, 10, 200, 52);
          G.text(g, ZONES[zi].name, W - 198, 31, { size: 13, color: '#fff' });
          G.text(g, 'Team power ' + U.fmt(teamPower()), W - 198, 50, { size: 11, color: '#a1abbb' });
          G.text(g, U.fmtClock(Math.max(0, time)), W - 22, 43, { size: 20, weight: 800, align: 'right', color: time < 30 ? '#ff8b98' : '#8fd3ff' });

          if (hatchFx) {
            const h = hatchFx, ht = h.t;
            g.fillStyle = 'rgba(6,8,12,' + Math.min(0.78, ht * 3) + ')';
            g.fillRect(0, 0, W, H);
            const nEggs = h.list.length;
            h.list.forEach((item, i) => {
              const cx = W / 2 + (i - (nEggs - 1) / 2) * 240, cy = H / 2 - 10;
              const col = BF.RARITY[item.sp.rarity].color;
              if (ht < 1.1) {
                const wob = Math.sin(ht * (10 + ht * 18)) * (0.1 + ht * 0.25);
                drawEgg(g, h.egg, cx, cy, 2.6, wob);
              } else {
                const k = Math.min(1, (ht - 1.1) / 0.35);
                g.globalAlpha = Math.max(0, 1 - (ht - 1.1) * 2);
                G.circle(g, cx, cy, 60 + k * 80, '#ffffff');
                g.globalAlpha = 1;
                g.save(); g.globalAlpha = 0.35; g.translate(cx, cy); g.rotate(ht * 0.8);
                g.fillStyle = col;
                for (let r = 0; r < 8; r++) { g.rotate(TAU / 8); g.beginPath(); g.moveTo(0, 0); g.lineTo(-14, -150); g.lineTo(14, -150); g.closePath(); g.fill(); }
                g.restore();
                drawPet(g, item.sp, cx, cy + 10, 60 + k * 70, t);
                G.display(g, item.sp.name, cx, cy + 96, 22, '#ffffff');
                G.text(g, BF.RARITY[item.sp.rarity].label.toUpperCase() + (item.isNew ? ' · NEW!' : ''), cx, cy + 124, { size: 14, align: 'center', color: col, weight: 800, stroke: 'rgba(0,0,0,.6)', strokeW: 3 });
                if (item.forced) G.text(g, 'Guaranteed hatch', cx, cy + 144, { size: 11, align: 'center', color: '#cfd6e2' });
              }
            });
            if (ht > 1.3) G.text(g, 'Click or press E to continue', W / 2, H - 28, { size: 13, align: 'center', color: '#cfd6e2' });
          }
      }
    },
  });
})((window.BF = window.BF || {}));
