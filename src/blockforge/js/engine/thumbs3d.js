/**
 * BlockForge — rendered 3D game thumbnails.
 *
 *   BF.thumb3d.get(game) -> data URL | null   a finished render, if there is one
 *   BF.thumb3d.request(game, svgUrl)          queue a render; <img>s showing svgUrl are swapped when done
 *
 * Every built-in game has a staged diorama built with the same World kit, rigs
 * and props as the games themselves, lit and framed like a key-art shot, with
 * the title lettered on top. Creator games get their template's scene in their
 * theme colour and their own name. Renders go into a private WebGL canvas one
 * per frame, are cached in memory and (best effort) in localStorage, and fall
 * back to the procedural SVG art when WebGL is not available.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const VERSION = 'v4';
  const PX_W = 640, PX_H = 360;
  const mem = new Map();
  const queue = new Map();
  let renderer = null, pumping = false, fontsReady = false;

  function setup() {
    if (renderer) return true;
    if (!BF.g3d || !BF.g3d.supported()) return false;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setPixelRatio(1);
      renderer.setSize(PX_W, PX_H, false);
    } catch (e) { renderer = null; return false; }
    return true;
  }

  // ------------------------------------------------------------ staging kit

  const pick = (seed, n) => {
    const list = (BF.bots && BF.bots.list) || [];
    const r = U.rng('thumb:' + seed);
    const out = [];
    for (let i = 0; i < n; i++) out.push(list.length ? list[Math.floor(r() * Math.min(list.length, 400))].avatar : null);
    return out;
  };

  function kit(W, seed) {
    const cast = pick(seed, 8);
    let n = 0;
    const A = {
      W,
      /** A posed avatar rig: {rot, scale, move, air, attack, emote, hold, holdColor, mode} */
      guy(x, y, z, o) {
        o = o || {};
        const av = o.av || cast[n % cast.length] || null;
        const rig = BF.char3d.build(av);
        n++;
        rig.group.scale.setScalar(o.scale || 10);
        rig.group.position.set(x, y, z);
        rig.group.rotation.y = o.rot || 0;
        if (o.hold) rig.hold(o.hold, o.holdColor);
        rig.set({ move: o.move || 0, air: !!o.air, mode: o.mode || 'idle' });
        if (o.emote) rig.emote(o.emote, 99);
        if (o.attack) rig.play('attack');
        // advance to a readable frame of the pose
        for (let i = 0; i < (o.frames || 8); i++) rig.tick(0.04);
        if (o.attack) { rig.state.attack = 0.55; rig.tick(0.001); }
        W.scene.add(rig.group);
        return rig;
      },
      box: (x, y, z, w, h, d, c, op) => W.box(x, y, z, w, h, d, c, op),
      shape: (k, x, y, z, sx, sy, sz, c, op) => W.shape(k, x, y, z, sx, sy, sz, c, op),
      glow(k, x, y, z, s, c, g) { return W.shape(k, x, y, z, s, s, s, c, { glow: g == null ? 1.2 : g, shadow: false }); },
      trees(list, tint) {
        const trunks = [], tops = [];
        for (const [x, z, h] of list) { trunks.push({ x, z, w: h * 0.12, h: h * 0.45, d: h * 0.12, color: '#6b4226' }); tops.push({ x, y: h * 0.3, z, w: h * 0.6, h: h * 0.75, d: h * 0.6, color: U.shade(tint || '#2f8f47', ((x * 7 + z) % 10) / 100) }); }
        W.boxes(trunks, { geo: 'cylLo' }); W.boxes(tops, { geo: 'cone' });
      },
      look(x, y, z, o) { W.look(x, y, z, Object.assign({ lerp: 1 }, o), 0); },
      light(x, y, z, color, power, dist) { const l = new THREE.PointLight(color, power, dist || 500, 1); l.position.set(x, y, z); W.scene.add(l); return l; },
    };
    return A;
  }

  // ------------------------------------------------------------ scenes (one per game)

  const SCENES = {
    'block-battlegrounds'(A, c) {
      const W = A.W; W.preset('arena');
      W.gridFloor(-400, -400, 1200, 1200, '#1e2433', 'rgba(255,122,46,.35)', 40);
      for (const [x, z, w, d] of [[250, 200, 60, 60], [560, 190, 80, 50], [420, 330, 50, 90], [690, 330, 60, 60]]) { A.box(x, 0, z, w, 44, d, '#3a4256'); A.box(x, 40, z, w + 2, 5, d + 2, c || '#ff7a2e', { glow: 0.6 }); }
      A.guy(410, 0, 260, { rot: 1.2, hold: 'sword', holdColor: '#ffb454', attack: true, move: 0.6 });
      A.guy(480, 0, 250, { rot: -1.9, hold: 'blaster', holdColor: '#39f3ff', move: 0.3 });
      A.guy(560, 0, 280, { rot: -2.5, hold: 'hammer', move: 0.8 });
      for (let i = 0; i < 12; i++) A.glow('box', 445 + Math.cos(i) * 22, 30 + Math.sin(i * 2) * 14, 255 + Math.sin(i) * 16, 4, i % 2 ? '#ffd66b' : '#ff7a2e', 1.5);
      A.glow('box', 340, 12, 300, 18, '#3fd08a', 0.8); A.box(335, 18, 300, 10, 4, 4, '#ffffff'); A.box(340, 13, 300, 4, 14, 4, '#ffffff');
      A.light(460, 80, 300, '#ff9a4a', 120, 500);
      A.look(460, 20, 260, { dist: 250, pitch: 0.42, yaw: 0.35, fov: 45 });
    },
    'skyline-racers'(A, c) {
      const W = A.W; W.preset('sunset');
      A.box(400, -2, 300, 3000, 2, 3000, '#3a4a3a');
      A.box(400, -1, 300, 3000, 1.5, 150, '#2a2d34');
      for (let x = -600; x < 1400; x += 40) { A.box(x, -0.4, 222, 20, 1.6, 8, (x / 40) % 2 ? '#ffffff' : '#e03e3e'); A.box(x, -0.4, 378, 20, 1.6, 8, (x / 40) % 2 ? '#ffffff' : '#e03e3e'); A.box(x, -0.3, 300, 18, 1.2, 3, '#f4d35e'); }
      const b = [];
      const r = U.rng('racer-city');
      for (let i = 0; i < 40; i++) { const x = -400 + i * 50, h = 80 + r() * 260; b.push({ x, z: 120 - r() * 200, w: 44, h, d: 44, color: U.shade('#3a3f5a', r() * 0.2) }); b.push({ x: x + 20, z: 520 + r() * 200, w: 44, h: h * 0.8, d: 44, color: U.shade('#4a3f5a', r() * 0.2) }); }
      W.boxes(b);
      const cars = [[c || '#e03e3e', 440, 262], ['#39f3ff', 380, 330], ['#ffd23f', 300, 280]];
      for (const [col, x, z] of cars) { const m = BF.props3d.car({ color: col }); m.position.set(x, 0, z); m.rotation.y = 0.05; W.scene.add(m); A.glow('cone', x - 28, 7, z, 7, '#39f3ff', 1.4).rotation.z = Math.PI / 2; }
      A.box(520, 0, 220, 6, 80, 6, '#39414f'); A.box(520, 0, 380, 6, 80, 6, '#39414f'); A.box(520, 76, 300, 6, 10, 170, '#ffd66b', { glow: 0.8 });
      A.look(420, 12, 300, { dist: 200, pitch: 0.25, yaw: -1.2, fov: 50 });
    },
    'treasure-islands'(A) {
      const W = A.W; W.preset('day');
      A.box(400, -30, 300, 3000, 2, 3000, '#2a8fc8', { opacity: 0.95 });
      A.shape('cyl', 400, -12, 300, 460, 30, 360, '#ead08a');
      A.shape('cyl', 400, 4, 290, 300, 8, 230, '#5aab52');
      for (const [x, z, a] of [[300, 240, 0.2], [520, 230, 1.4], [330, 380, 2.2]]) {
        for (let k = 0; k < 4; k++) A.box(x + k, 8 + k * 11, z, 7 - k * 0.6, 11.5, 7 - k * 0.6, k % 2 ? '#8b5a2b' : '#9c6a36');
        for (let k = 0; k < 6; k++) { const an = (k / 6) * Math.PI * 2 + a; const f = A.box(x + 3 + Math.cos(an) * 12, 50, z - Math.sin(an) * 12, 26, 2.5, 9, '#2fae62'); f.rotation.set(0, an, -0.38); }
      }
      // open chest spilling gold
      A.box(430, 8, 320, 34, 20, 22, '#7a4a2a'); A.box(430, 28, 309, 34, 20, 4, '#6b3a1a').rotation.x = -0.5;
      for (let i = 0; i < 14; i++) A.shape('cyl', 420 + (i % 5) * 5, 30 + Math.floor(i / 5) * 3, 318 + (i % 3) * 3, 6, 1.5, 6, '#ffd23f', { metal: 0.7, glow: 0.2 });
      A.glow('octa', 438, 36, 322, 8, '#7fe7ff', 0.8);
      for (const r of [0.785, -0.785]) A.box(470, 8.5, 350, 26, 1, 5, '#b23a2a').rotation.y = r;
      A.guy(395, 8, 330, { rot: 0.7, hold: 'shovel', emote: 'cheer', frames: 10 });
      A.guy(470, 8, 290, { rot: -0.6, move: 0.4 });
      const ship = BF.props3d.ship({ team: '#e03e3e' }); ship.position.set(640, -28, 180); ship.rotation.y = 2.4; W.scene.add(ship);
      A.look(430, 20, 320, { dist: 240, pitch: 0.45, yaw: 0.2, fov: 45 });
    },
    'towerfall-legends'(A) {
      const W = A.W; W.preset('day');
      A.box(400, -12, 300, 2000, 12, 2000, '#4f9a45');
      A.box(400, -11, 300, 900, 12, 60, '#b08a5a');
      A.box(300, -11, 440, 60, 12, 280, '#b08a5a');
      for (const [x, z, col] of [[360, 230, '#9aa5b5'], [470, 370, '#8a94a6'], [250, 360, '#6a7383']]) {
        A.shape('cyl', x, 25, z, 34, 50, 34, col); A.shape('cone', x, 64, z, 44, 30, 44, '#c0392b');
        for (let i = 0; i < 4; i++) A.box(x + Math.cos(i * 1.57) * 14, 50, z + Math.sin(i * 1.57) * 14, 8, 8, 8, col);
      }
      const r = U.rng('td-goblins');
      for (let i = 0; i < 6; i++) { const z2 = BF.props3d.zombie({ skin: '#6aa84a', shirt: '#8a5a2a', eyes: '#ff3d5a' }); z2.scale.setScalar(0.42); z2.position.set(200 + i * 55, 0, 295 + (r() - 0.5) * 20); z2.rotation.y = Math.PI / 2; z2.userData.tick(i, true); W.scene.add(z2); }
      A.glow('sphere', 330, 40, 280, 8, '#ff7a2e', 1.4); A.glow('sphere', 420, 50, 320, 7, '#8fd3ff', 1.2);
      for (const sd of [-1, 1]) { A.box(700, 0, 300 + sd * 45, 40, 110, 40, '#8a909c'); A.box(700, 110, 300 + sd * 45, 46, 14, 46, '#6b7383'); }
      A.box(700, 70, 300, 34, 26, 60, '#6b7383'); A.box(706, 0, 300, 10, 70, 50, '#3a2a20');
      A.guy(700, 124, 350, { rot: -1.4, hold: 'sword', emote: 'cheer' });
      A.trees([[150, 150, 60], [620, 160, 70], [120, 460, 55], [560, 470, 60], [760, 460, 65]]);
      A.look(470, 30, 320, { dist: 310, pitch: 0.42, yaw: 0.35, fov: 45 });
    },
    'pet-world'(A) {
      const W = A.W; W.preset('day');
      A.box(400, -2, 300, 2000, 2, 2000, '#7ed957');
      const sp = Object.values(BF.PET_WORLD_SPECIES || {});
      const want = ['dragon', 'unicorn', 'cat', 'dog', 'bunny', 'fox'];
      const pets = want.map((id) => sp.find((s) => s.id === id)).filter(Boolean).concat(sp).slice(0, 4);
      pets.forEach((s, i) => { const m = BF.pet3d.build(s, { collar: i === 0 ? '#ffd23f' : null }); m.scale.setScalar(i === 0 ? 38 : 26); m.position.set(360 + i * 42, 0, 300 + (i % 2) * 26); m.rotation.y = 0.3 - i * 0.15; if (m.userData.tick) m.userData.tick(0.5); W.scene.add(m); });
      for (let i = 0; i < 16; i++) A.shape('cyl', 520 + (i % 4) * 9, 3 + Math.floor(i / 4) * 5, 280 + (i % 3) * 8, 14, 4, 14, '#ffc940', { metal: 0.6, glow: 0.2 });
      A.shape('sphere', 300, 26, 260, 40, 50, 40, '#f4ecd0'); for (let i = 0; i < 5; i++) A.shape('sphere', 290 + i * 5, 30 + (i % 2) * 10, 280, 8, 8, 4, ['#ff7a8a', '#8fd3ff', '#ffd66b'][i % 3]);
      A.guy(460, 0, 250, { rot: 0.2, emote: 'cheer' });
      A.trees([[250, 150, 70], [600, 160, 80], [700, 380, 60]]);
      A.look(430, 18, 300, { dist: 250, pitch: 0.42, yaw: 0.1, fov: 45 });
    },
    'sky-obby'(A, c) {
      const W = A.W; W.preset('day'); W.fog = null;
      const cols = [c || '#ff7a2e', '#46a8ff', '#ffd23f', '#3fd08a', '#b67cff'];
      [[300, 20, 280], [380, 50, 250], [460, 30, 300], [540, 70, 260], [620, 100, 290]].forEach(([x, y, z], i) => { A.box(x, y, z, 54, 14, 54, cols[i % cols.length]); A.box(x, y - 20, z, 40, 20, 40, '#8b5a2b', { flat: true }); });
      A.box(420, 60, 370, 40, 10, 40, '#ff3d1f', { glow: 0.8 });
      A.glow('torus', 640, 150, 290, 44, '#ffd66b', 1.2).rotation.y = 1.2;
      A.box(300, 34, 262, 3, 40, 3, '#39414f'); A.box(310, 58, 262, 20, 12, 1, '#3fd08a');
      A.guy(425, 70, 272, { rot: 1.3, air: true });
      A.guy(540, 84, 262, { rot: 1.6, move: 1 });
      for (let i = 0; i < 6; i++) A.shape('sphere', 200 + i * 110, 160 + (i % 3) * 30, 120 + (i % 2) * 60, 60, 24, 40, '#ffffff', { rough: 1 });
      A.look(460, 60, 280, { dist: 300, pitch: 0.2, yaw: 0.45, fov: 45 });
    },
    'city-life'(A) {
      const W = A.W; W.preset('sunset');
      A.box(400, -2, 300, 3000, 2, 3000, '#6e7681');
      A.box(400, -1, 300, 3000, 1.5, 90, '#2a2d34');
      for (let x = -400; x < 1200; x += 50) A.box(x, -0.3, 300, 24, 1.2, 3, '#f4d35e');
      A.box(400, -1, 220, 3000, 4, 60, '#c9ccd2'); A.box(400, -1, 380, 3000, 4, 60, '#c9ccd2');
      const r = U.rng('city-thumb');
      const cols = ['#c0392b', '#2e86c1', '#8e6a4a', '#16a085', '#7d3c98'];
      for (let i = 0; i < 9; i++) {
        const x = 150 + i * 80, h = 90 + r() * 140, col = cols[i % cols.length];
        A.box(x, 0, 150, 72, h, 70, col);
        for (let fy = 20; fy < h - 10; fy += 26) for (let fx = -24; fx <= 24; fx += 16) A.box(x + fx, fy, 186, 10, 12, 1, r() < 0.5 ? '#ffd66b' : '#9fc4e0', { glow: 0.4, shadow: false });
      }
      const taxi = BF.props3d.car({ color: '#ffc940', taxi: true }); taxi.position.set(420, 0, 290); W.scene.add(taxi);
      const cop = BF.props3d.car({ color: '#f4f1ea', police: true }); cop.position.set(300, 0, 320); cop.rotation.y = Math.PI; W.scene.add(cop);
      A.guy(480, 4, 380, { rot: -0.5, move: 0.8 }); A.guy(520, 4, 390, { rot: -2.2, emote: 'wave' });
      for (const x of [350, 600]) { A.box(x, 0, 245, 4, 70, 4, '#1b1b22'); A.glow('sphere', x, 72, 245, 10, '#ffe8b0', 1.3); }
      A.look(450, 30, 320, { dist: 280, pitch: 0.35, yaw: -0.35, fov: 45 });
    },
    'dungeon-frontier'(A) {
      const W = A.W; W.preset('cave');
      A.box(400, -4, 300, 1200, 4, 1200, '#4a3a2e');
      for (let x = 200; x < 700; x += 40) A.box(x, 0, 170, 40, 120, 30, (x / 40) % 2 ? '#5a4a3e' : '#524436');
      for (const x of [260, 520]) { A.box(x, 70, 188, 6, 16, 6, '#6b4226'); A.glow('cone', x, 90, 188, 12, '#ff9a3c', 1.6); A.light(x, 92, 205, '#ff9a3c', 60, 320); }
      A.box(390, 0, 186, 70, 90, 6, '#1a120c');
      A.guy(360, 0, 300, { rot: 0.6, hold: 'sword', holdColor: '#dfe7f2', attack: true, move: 0.5 });
      const sk = BF.props3d.zombie({ skin: '#e8e2d0', shirt: '#b9b3a6', pants: '#8a8478', eyes: '#ff3d5a', arms: 'down', helmet: '#6b6b6b' }); sk.scale.setScalar(0.95); sk.position.set(450, 0, 290); sk.rotation.y = -1.2; sk.userData.tick(1, true); W.scene.add(sk);
      A.box(520, 0, 250, 40, 26, 26, '#7a4a2a'); A.box(520, 26, 250, 42, 4, 28, '#c9a227', { metal: 0.6 });
      for (let i = 0; i < 8; i++) A.shape('cyl', 505 + i * 4, 30, 262, 6, 1.5, 6, '#ffd23f', { metal: 0.7 });
      A.look(420, 30, 280, { dist: 230, pitch: 0.38, yaw: 0.2, fov: 45 });
    },
    'elemental-clash'(A) {
      const W = A.W; W.preset('dusk');
      A.shape('cyl', 400, -10, 300, 420, 20, 420, '#6a6f8a');
      A.shape('cyl', 400, 0.5, 300, 300, 1, 300, '#8a8fb0');
      for (let i = 0; i < 18; i++) A.shape('dodeca', 100 + (i * 97) % 700, 20 + (i * 37) % 120, 50 + (i * 53) % 150, 16 + (i % 4) * 6, 14, 16, '#4a4660', { flat: true });
      A.guy(320, 0, 300, { rot: 1.4, emote: 'salute' });
      A.guy(500, 0, 290, { rot: -1.6, attack: true });
      A.glow('sphere', 380, 34, 298, 26, '#ff7a2e', 1.6); A.glow('sphere', 380, 34, 298, 14, '#ffd66b', 1.8);
      for (let i = 0; i < 10; i++) A.glow('box', 350 - i * 5, 30 + Math.sin(i) * 6, 298 + Math.cos(i) * 6, 4, '#ff9a3c', 1.4);
      A.glow('sphere', 450, 34, 292, 22, '#46a8ff', 1.2);
      A.light(410, 50, 330, '#ff9a4a', 90, 300); A.light(460, 50, 330, '#46a8ff', 70, 300);
      A.look(410, 30, 300, { dist: 240, pitch: 0.25, yaw: 0.1, fov: 45 });
    },
    'zombie-outbreak'(A) {
      const W = A.W; W.preset('night');
      A.box(400, -2, 300, 2000, 2, 2000, '#2a3a2a');
      A.box(330, 0, 200, 220, 90, 120, '#6a4a3a'); A.shape('cone4', 330, 120, 200, 310, 60, 190, '#3a2a2a').rotation.y = Math.PI / 4;
      A.box(330, 30, 262, 50, 40, 2, '#ffd66b', { glow: 0.6 });
      for (let i = 0; i < 3; i++) A.box(330, 36 + i * 10, 264, 60, 5, 3, '#8b6a4a').rotation.z = (i - 1) * 0.2;
      A.guy(330, 0, 300, { rot: 0.4, hold: 'blaster', holdColor: '#ffd66b' });
      A.glow('box', 356, 34, 324, 3, '#ffd66b', 1.6);
      const r = U.rng('zthumb');
      for (let i = 0; i < 6; i++) { const z = BF.props3d.zombie({ skin: ['#8fbf6a', '#9ac77a', '#7fae5e'][i % 3], shirt: ['#5a6a7a', '#6a5040', '#7a4a4a'][i % 3] }); z.scale.setScalar(0.85); z.position.set(420 + (i % 3) * 50 + r() * 20, 0, 330 + Math.floor(i / 3) * 50); z.rotation.y = -2.3 + r() * 0.4; z.userData.tick(i * 0.7, true); W.scene.add(z); }
      A.glow('sphere', 700, 260, 60, 70, '#f4f1ea', 1);
      A.light(330, 60, 300, '#ffd9a0', 80, 300);
      A.trees([[150, 120, 90], [560, 110, 100], [650, 150, 80]], '#1f4a2f');
      A.look(420, 30, 320, { dist: 270, pitch: 0.3, yaw: -0.3, fov: 45 });
    },
    'factory-tycoon'(A) {
      const W = A.W; W.preset('indoor');
      A.box(400, -2, 300, 1400, 2, 1400, '#5a5a62');
      A.box(400, 12, 300, 360, 6, 44, '#2a2f3a'); for (let x = 230; x < 580; x += 16) A.box(x, 18, 300, 10, 1, 44, '#39414f');
      for (let i = 0; i < 8; i++) A.glow('box', 250 + i * 42, 26, 300, 12, ['#9aa5b5', '#ffd23f', '#7fe7ff', '#ff7a8a'][i % 4], 0.5);
      A.box(240, 30, 300, 50, 60, 50, '#8a909c', { metal: 0.3 }); A.box(240, 90, 300, 30, 20, 30, '#ff7a2e');
      A.box(560, 0, 300, 60, 80, 60, '#6b3a2a'); A.glow('box', 560, 20, 331, 36, '#ff7a2e', 1.4);
      A.box(400, 40, 300, 40, 40, 50, '#46a8ff', { metal: 0.3 }); A.glow('box', 400, 60, 326, 12, '#39f3ff', 1.2);
      A.guy(420, 0, 370, { rot: 2.6, emote: 'cheer' });
      for (let i = 0; i < 12; i++) A.shape('cyl', 330 + (i % 4) * 10, 3 + Math.floor(i / 4) * 5, 380, 12, 4, 12, '#3fd08a');
      A.look(400, 30, 320, { dist: 300, pitch: 0.45, yaw: 0.35, fov: 45 });
    },
    'treasure-tycoon'(A) {
      const W = A.W; W.preset('day');
      A.box(400, -2, 300, 2000, 2, 2000, '#5aab52'); A.box(400, -1.5, 520, 2000, 2, 260, '#ead08a');
      A.box(640, -20, 800, 2000, 2, 400, '#2a8fc8');
      A.box(360, 0, 250, 112, 70, 80, '#6a707c', { metal: 0.3 }); A.shape('torus', 360, 36, 291, 44, 44, 30, '#ffd66b', { metal: 0.6 });
      for (let i = 0; i < 26; i++) A.shape('cyl', 300 + (i % 7) * 12, 3 + Math.floor(i / 7) * 5, 320 + (i % 2) * 8, 12, 4, 12, '#ffd23f', { metal: 0.7, glow: 0.15 });
      for (const x of [480, 530]) { A.shape('cyl', x, 6, 400, 28, 12, 28, '#39414f'); const b = A.shape('cyl', x + 12, 18, 405, 12, 30, 12, '#2a2f3a', { metal: 0.5 }); b.rotation.z = Math.PI / 2; b.rotation.y = -0.6; }
      const ship = BF.props3d.ship({ team: '#1b1b22', sail: '#1b1b22', hull: '#5a3a22' }); ship.position.set(620, -18, 560); ship.rotation.y = 2.8; ship.scale.setScalar(1.6); W.scene.add(ship);
      A.guy(420, 0, 340, { rot: 0.6, hold: 'pickaxe', attack: true });
      A.trees([[220, 200, 70], [250, 380, 60], [500, 180, 80]]);
      A.look(430, 20, 360, { dist: 330, pitch: 0.42, yaw: 0.5, fov: 45 });
    },
    'mega-miners'(A) {
      const W = A.W; W.preset('day');
      const blocks = [];
      const r = U.rng('miner-thumb');
      for (let y = 0; y < 8; y++) for (let x = 0; x < 14; x++) {
        if (y === 2 && x > 3 && x < 9) continue; if (y === 1 && x === 6) continue; if (y > 2 && y < 5 && x === 6) continue;
        const ore = r() < 0.12;
        blocks.push({ x: 200 + x * 40, y: -y * 40 - 40, z: 300, w: 40, h: 40, d: 40, color: y === 0 ? '#5aab52' : ore ? ['#ffd23f', '#e03e3e', '#7fe7ff', '#9aa5b5'][Math.floor(r() * 4)] : U.shade(y < 3 ? '#8b5a2b' : '#6a707c', r() * 0.1 - 0.05) });
      }
      W.boxes(blocks);
      for (const b of blocks) if (['#ffd23f', '#e03e3e', '#7fe7ff'].includes(b.color)) A.glow('octa', b.x, b.y + 20, 321, 14, b.color, 0.9);
      A.guy(400, -120, 300, { rot: 0.3, hold: 'pickaxe', holdColor: '#7fe7ff', attack: true, scale: 7 });
      A.box(300, 0, 280, 60, 40, 40, '#a86b3c'); A.shape('cone4', 300, 52, 280, 90, 24, 60, '#7a4a2a').rotation.y = Math.PI / 4;
      A.trees([[500, 260, 70], [560, 270, 60], [640, 250, 80]]);
      A.light(400, -90, 340, '#ffe0a0', 60, 240);
      A.look(430, -80, 300, { dist: 330, pitch: 0.12, yaw: -0.25, fov: 45 });
    },
    'battle-boats'(A) {
      const W = A.W; W.preset('day');
      A.box(400, -2, 300, 3000, 2, 3000, '#1f7ab8');
      for (let i = 0; i < 30; i++) A.box(200 + (i * 71) % 500, -0.5, 150 + (i * 37) % 300, 30, 1, 3, '#8fd3ff', { opacity: 0.6, shadow: false });
      const a = BF.props3d.ship({ team: '#46a8ff' }); a.position.set(340, 0, 300); a.rotation.y = 0.3; a.scale.setScalar(1.6); W.scene.add(a);
      const b = BF.props3d.ship({ team: '#e03e3e' }); b.position.set(530, 0, 250); b.rotation.y = 2.9; b.scale.setScalar(1.6); W.scene.add(b);
      A.glow('sphere', 440, 40, 270, 10, '#1b1b22', 0); for (let i = 0; i < 8; i++) A.glow('sphere', 380 + i * 6, 26 + Math.sin(i) * 4, 290 - i * 3, 12 - i, '#f4f1ea', 0.4);
      A.glow('sphere', 470, 6, 240, 30, '#e8f6ff', 0.4);
      A.shape('cyl', 640, -4, 120, 200, 16, 140, '#ead08a'); A.box(640, 10, 120, 60, 40, 60, '#8a909c'); A.box(640, 50, 120, 70, 10, 70, '#6b7383');
      A.look(430, 20, 280, { dist: 330, pitch: 0.35, yaw: 0.3, fov: 45 });
    },
    'pixel-soccer'(A) {
      const W = A.W; W.preset('day');
      A.box(400, -2, 300, 2000, 2, 2000, '#3a9a4a');
      for (let x = 0; x < 20; x++) A.box(-100 + x * 60, -1.5, 300, 60, 1, 600, x % 2 ? '#3a9a4a' : '#44a856', { shadow: false });
      A.box(400, -1, 300, 4, 1, 600, '#ffffff'); A.shape('torus', 400, -0.5, 300, 120, 120, 3, '#ffffff').rotation.x = Math.PI / 2;
      A.box(640, 0, 300, 4, 50, 4, '#ffffff'); A.box(640, 0, 200, 4, 50, 4, '#ffffff'); A.box(640, 48, 250, 4, 4, 104, '#ffffff'); A.box(660, 24, 250, 40, 48, 100, '#ffffff', { opacity: 0.2, depthWrite: false });
      A.guy(480, 0, 280, { rot: 1.4, move: 1 }); A.guy(540, 0, 250, { rot: -1.6, move: 0.6 }); A.guy(400, 0, 320, { rot: 1.2, move: 0.8 });
      A.shape('sphere', 520, 16, 270, 14, 14, 14, '#ffffff'); A.shape('sphere', 523, 18, 276, 5, 5, 5, '#1b1b22');
      const crowd = [];
      for (let row = 0; row < 5; row++) for (let i = 0; i < 40; i++) crowd.push({ x: -100 + i * 26, y: row * 16, z: 60 - row * 20, w: 16, h: 20, d: 12, color: ['#e03e3e', '#46a8ff', '#ffd23f', '#f4f1ea', '#3fd08a'][(i * 3 + row) % 5] });
      W.boxes(crowd); A.box(400, 0, 60, 1400, 12, 20, '#39414f');
      A.look(500, 20, 270, { dist: 300, pitch: 0.3, yaw: 0.6, fov: 45 });
    },
    'cosmic-survival'(A) {
      const W = A.W; W.preset('space'); if (W.stars) W.stars(500);
      A.shape('sphere', 700, 60, -200, 520, 520, 520, '#4a5fd0');
      A.shape('torus', 700, 60, -200, 800, 800, 60, '#b8a0ff', { opacity: 0.6 }).rotation.x = 1.3;
      const ship = (x, y, z, col, rot) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; W.scene.add(g); W.box(0, -3, 0, 34, 6, 14, col, { parent: g, metal: 0.4 }); W.shape('cone4', 22, 0, 0, 12, 18, 12, col, { parent: g }).rotation.z = -Math.PI / 2; for (const sd of [-1, 1]) W.box(-4, -2, sd * 14, 16, 3, 16, U.shade(col, -0.2), { parent: g }); W.box(4, 3, 0, 10, 5, 8, '#8fd3ff', { parent: g, glow: 0.6 }); W.shape('cone', -22, 0, 0, 8, 14, 8, '#39f3ff', { parent: g, glow: 1.6 }).rotation.z = Math.PI / 2; };
      ship(380, 40, 300, '#e8ecf1', 0.3); ship(470, 60, 250, '#ffd23f', 0.1);
      for (let i = 0; i < 14; i++) A.shape('dodeca', 300 + (i * 83) % 400, 20 + (i * 29) % 90, 150 + (i * 47) % 220, 14 + (i % 5) * 8, 12 + (i % 3) * 6, 14 + (i % 4) * 6, '#6a5a5a', { flat: true });
      for (let i = 0; i < 4; i++) A.box(420 + i * 20, 42, 296 - i * 6, 14, 2, 2, '#39f3ff', { glow: 1.6 });
      A.look(430, 50, 285, { dist: 190, pitch: 0.25, yaw: 0.35, fov: 45 });
    },
    'castle-siege'(A) {
      const W = A.W; W.preset('sunset');
      A.box(400, -2, 300, 3000, 2, 3000, '#4f8a3f');
      A.box(300, 0, 260, 260, 70, 40, '#8a909c'); for (let x = 180; x < 430; x += 22) A.box(x, 70, 250, 12, 12, 20, '#8a909c');
      A.shape('cyl', 170, 50, 260, 70, 100, 70, '#7a808c'); A.shape('cone', 170, 125, 260, 84, 50, 84, '#c0392b');
      A.shape('cyl', 430, 50, 260, 70, 100, 70, '#7a808c'); A.shape('cone', 430, 125, 260, 84, 50, 84, '#c0392b');
      A.box(300, 0, 282, 40, 50, 4, '#3a2a20');
      A.box(430, 150, 260, 2, 40, 2, '#1b1b22'); A.box(442, 176, 260, 22, 12, 1, '#ffd23f');
      A.guy(260, 70, 262, { rot: 0.2, hold: 'sword', emote: 'salute', scale: 9 }); A.guy(330, 70, 262, { rot: -0.1, scale: 9 });
      for (let i = 0; i < 7; i++) { const z = BF.props3d.zombie({ skin: '#e0ac69', shirt: '#7a2a2a', pants: '#3a2a20', eyes: '#1b1b22', arms: 'down', helmet: '#6b6b6b' }); z.scale.setScalar(0.5); z.position.set(560 + (i % 4) * 30, 0, 330 + Math.floor(i / 4) * 30); z.rotation.y = -1.9; z.userData.tick(i, true); W.scene.add(z); }
      A.trees([[620, 140, 70], [700, 170, 80], [120, 400, 60]], '#3a7a3a');
      A.look(400, 60, 300, { dist: 300, pitch: 0.22, yaw: 0.5, fov: 45 });
    },
    'speed-trials'(A, c) {
      const W = A.W; W.preset('night'); if (W.stars) W.stars(300);
      W.ground ? W.ground(-2000, -2000, 4000, 4000, '#ffffff', { y: -60, map: BF.g3d.gridTex('#0a0c14', 'rgba(57,243,255,0.2)', 4, { repeat: [60, 60] }), basic: true }) : 0;
      const col = c || '#39f3ff';
      A.box(420, -1, 300, 900, 2, 150, '#262b3a'); for (const sd of [-1, 1]) A.box(420, 0, 300 + sd * 80, 900, 8, 4, col, { glow: 1 });
      const g = new THREE.Group(); g.position.set(420, 17, 300); W.scene.add(g);
      W.shape('sphere', 0, 0, 0, 34, 34, 34, '#ffb454', { parent: g, opacity: 0.42, rough: 0.05, depthWrite: false });
      W.shape('torus', 0, 0, 0, 30, 30, 30, '#ffffff', { parent: g, glow: 0.8 });
      A.guy(420, 5, 300, { rot: 1.5, scale: 3.3, move: 1 });
      for (const x of [560, 700]) { for (const sd of [-1, 1]) A.box(x, 0, 300 + sd * 75, 8, 54, 8, '#ffffff'); A.box(x, 50, 300, 8, 6, 150, col, { glow: 1.2 }); }
      for (let i = 0; i < 3; i++) A.box(480 + i * 18, 1.5, 300, 12, 1, 30, '#ffd66b', { glow: 1.4 });
      for (let i = 0; i < 10; i++) A.box(400 - i * 9, 17, 300, 6, 4, 4, col, { glow: 1.4, opacity: 1 - i * 0.09 });
      A.look(470, 20, 300, { dist: 200, pitch: 0.3, yaw: -1.05, fov: 50 });
    },
    'pet-battle-arena'(A) {
      const W = A.W; W.preset('dusk');
      A.box(400, -2, 300, 2000, 2, 2000, '#2a3a2a');
      for (const [x, z] of [[320, 300], [520, 300]]) { A.shape('cyl', x, 3, z, 110, 6, 110, '#3a6a5a'); A.shape('torus', x, 6, z, 100, 100, 6, '#c9a227', { glow: 0.3 }).rotation.x = Math.PI / 2; }
      const sp = Object.values(BF.PET_WORLD_SPECIES || {});
      const a = sp.find((s) => s.id === 'dragon') || sp[0], b = sp.find((s) => s.id === 'bunny') || sp[1];
      for (const [s, x, rot] of [[a, 320, 1.4], [b, 520, -1.4]]) if (s) { const m = BF.pet3d.build(s, {}); m.scale.setScalar(60); m.position.set(x, 6, 300); m.rotation.y = rot; W.scene.add(m); }
      A.glow('sphere', 420, 40, 300, 30, '#ff7a2e', 1.6); for (let i = 0; i < 12; i++) A.glow('box', 380 + i * 6, 40 + Math.sin(i) * 8, 300 + Math.cos(i * 2) * 8, 5, '#ffd66b', 1.5);
      A.guy(250, 0, 360, { rot: 1.0, emote: 'salute' }); A.guy(600, 0, 360, { rot: -1.0 });
      A.light(420, 60, 330, '#ff9a4a', 110, 400);
      A.look(420, 30, 300, { dist: 300, pitch: 0.25, yaw: 0.05, fov: 45 });
    },
    'mystery-mansion'(A) {
      const W = A.W; W.preset('night'); if (W.stars) W.stars(300);
      A.box(400, -2, 300, 2000, 2, 2000, '#1f2f22');
      A.box(400, 0, 180, 300, 160, 100, '#4a3a4a'); A.shape('cone4', 400, 200, 180, 420, 80, 150, '#2a2030').rotation.y = Math.PI / 4;
      A.box(520, 0, 180, 70, 230, 70, '#4a3a4a'); A.shape('cone4', 520, 260, 180, 100, 70, 100, '#2a2030').rotation.y = Math.PI / 4;
      for (const [x, y] of [[320, 40], [400, 40], [480, 40], [320, 100], [480, 100], [520, 170]]) { A.box(x, y, 232, 30, 36, 2, (x + y) % 3 ? '#ffd66b' : '#39414f', { glow: (x + y) % 3 ? 0.9 : 0 }); }
      A.box(400, 0, 232, 40, 60, 2, '#2a1a10');
      A.glow('sphere', 640, 300, 40, 90, '#f4f1ea', 1);
      A.guy(400, 0, 320, { rot: 0.3, hold: 'shovel', holdColor: '#ffd66b', scale: 11 });
      A.glow('sphere', 420, 30, 336, 10, '#ffd66b', 1.6); A.light(420, 40, 350, '#ffd9a0', 90, 260);
      for (let i = 0; i < 3; i++) { const bat = new THREE.Group(); bat.position.set(330 + i * 60, 230 + i * 20, 250); W.scene.add(bat); for (const sd of [-1, 1]) W.box(sd * 7, 0, 0, 12, 1, 6, '#0d0b14', { parent: bat }).rotation.z = sd * 0.4; }
      A.trees([[180, 220, 120], [640, 240, 110]], '#1a3a24');
      A.look(420, 80, 300, { dist: 290, pitch: 0.12, yaw: 0.2, fov: 45 });
    },
  };

  // ------------------------------------------------------------ scenes for the arcade engines (one per engine, themed by variant)

  const V2 = (game) => (game.config && game.config.variant) || '';
  const TYPE_SCENES = {
    runner(A, c, game) {
      const W = A.W, v = V2(game);
      const th = { metro: ['day', '#454a57', '#c9ced8'], lava: ['dusk', '#2a1f1e', '#ff5a2e'], jungle: ['day', '#6f6246', '#4a8f3a'], candy: ['sunset', '#ff8fc7', '#ffffff'], hyper: ['space', '#161c3a', '#39f3ff'] }[v] || ['day', '#454a57', '#c9ced8'];
      W.preset(th[0]); if (th[0] !== 'day') W.stars(200);
      A.box(400, -8, 0, 260, 8, 2400, th[1]);
      for (const x of [340, 400, 460]) A.box(x, 0, 0, 4, 2, 2400, th[2], { glow: v === 'hyper' || v === 'lava' ? 1 : 0 });
      const deco = [];
      const r = U.rng('rt:' + game.id);
      for (let i = 0; i < 30; i++) { const side = i % 2 ? 1 : -1, z = 300 - i * 70; deco.push({ x: 400 + side * (190 + r() * 120), y: 0, z, w: 60 + r() * 50, h: v === 'metro' ? 120 + r() * 220 : 40 + r() * 120, d: 60, color: v === 'jungle' ? '#2f8f47' : v === 'candy' ? U.pick(['#ff5aa8', '#7cf5ff', '#ffe066'], r) : v === 'lava' ? '#2a1c1a' : v === 'hyper' ? '#161c3a' : U.shade('#5a6e8a', r() * 0.2) }); }
      W.boxes(deco);
      if (v === 'metro') { A.box(460, 0, -120, 56, 74, 180, '#3a7bd5'); A.box(460, 42, -29, 44, 18, 2, '#bfe6ff', { glow: 0.5 }); }
      if (v === 'lava') A.box(400, 0, 330, 1200, 160, 30, '#ff4a1f', { glow: 1.2 });
      if (v === 'jungle') A.box(400, -6, 60, 260, 8, 70, '#0b0c10');
      if (v === 'candy') { A.shape('sphere', 340, 10, 40, 50, 30, 50, '#7cf5ff', { glow: 0.5 }); }
      if (v === 'hyper') A.box(340, 12, 20, 60, 5, 5, '#ff3df0', { glow: 1.5 });
      A.guy(400, 30, 180, { rot: Math.PI, move: 1.3, air: true, scale: 11 });
      A.guy(340, 0, 140, { rot: Math.PI, move: 1.3, scale: 10 });
      A.guy(460, 0, 120, { rot: Math.PI, move: 1.3, scale: 10 });
      for (let i = 0; i < 8; i++) { const m = A.shape('cyl', 400, 40 + Math.sin(i / 7 * Math.PI) * 40, 130 - i * 30, 14, 4, 14, '#ffd23f', { glow: 0.5, metal: 0.6 }); m.rotation.x = Math.PI / 2; }
      A.look(400, 40, 170, { dist: 190, pitch: 0.28, yaw: 0.35, fov: 55 });
    },
    party(A, c, game) {
      const W = A.W, v = V2(game);
      W.preset(v === 'hexfall' ? 'space' : v === 'meteor' ? 'sunset' : v === 'color' || v === 'sumo' ? 'arena' : 'day'); if (v === 'hexfall') W.stars(300);
      const cols = ['#ff4a5a', '#3a8bff', '#3fd08a', '#ffd23f', '#b67cff', '#ff8a2e'];
      const tiles = [];
      const r = U.rng('pt:' + game.id);
      if (v === 'sumo' || v === 'meteor') A.shape('cyl', 400, -12, 300, 460, 24, 460, v === 'sumo' ? '#e8d8b0' : '#6a5a4a');
      else for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { if (v === 'hexfall' && r() < 0.25) continue; tiles.push({ x: 225 + x * 50, y: -10, z: 125 + y * 50, w: 46, h: 10, d: 46, color: v === 'hexfall' ? '#7cf5ff' : cols[Math.floor(r() * cols.length)] }); }
      if (tiles.length) W.boxes(tiles);
      if (v === 'hexfall') { const low = []; for (let i = 0; i < 40; i++) low.push({ x: 225 + (i % 8) * 50, y: -150, z: 125 + Math.floor(i / 8) * 60, w: 46, h: 10, d: 46, color: '#b67cff' }); W.boxes(low); }
      if (v === 'meteor') for (let i = 0; i < 3; i++) { A.shape('dodeca', 330 + i * 80, 160 + i * 50, 260 - i * 30, 40, 40, 40, '#5a3a2a'); A.glow('sphere', 330 + i * 80, 172 + i * 50, 262 - i * 30, 52, '#ff7a2e', 1.2).material.opacity = 0.6; }
      if (v === 'sumo') A.shape('cyl', 400, 1, 300, 140, 2, 140, '#ffd23f', { glow: 0.6 });
      A.guy(360, 0, 300, { rot: 0.6, move: 0.8, attack: true, scale: 11 });
      A.guy(430, 40, 290, { rot: -2, air: true, scale: 11 });
      A.guy(470, 0, 350, { rot: -2.4, emote: 'cheer', scale: 11 });
      A.guy(320, 0, 380, { rot: 0.9, emote: 'dance', scale: 10 });
      for (let i = 0; i < 30; i++) A.glow('box', 250 + r() * 300, 60 + r() * 200, 200 + r() * 200, 5, cols[i % 6], 1);
      A.look(400, 30, 320, { dist: 330, pitch: 0.5, yaw: 0.3, fov: 45 });
    },
    tag(A, c, game) {
      const W = A.W, v = V2(game);
      W.preset(v === 'hide' ? 'indoor' : v === 'infection' ? 'dusk' : v === 'potato' ? 'arena' : 'day');
      W.gridFloor(-400, -400, 1200, 1200, v === 'freeze' ? '#e8f2ff' : v === 'infection' ? '#1d2a22' : v === 'hide' ? '#8a6a4a' : v === 'potato' ? '#3a3048' : '#5aab52', 'rgba(0,0,0,.1)', 40);
      A.box(300, 0, 200, 80, 50, 60, v === 'freeze' ? '#9fc6ee' : '#8a909c'); A.box(560, 0, 220, 60, 90, 60, v === 'hide' ? '#7a5236' : '#b07a45');
      A.guy(360, 0, 300, { rot: 0.3, move: 1.3, scale: 11 });
      A.guy(470, 0, 280, { rot: 2.9, move: 1.3, attack: true, scale: 11 });
      A.guy(540, 0, 340, { rot: 2.6, move: 1, scale: 10 });
      if (v === 'freeze') A.box(540, 0, 340, 34, 70, 34, '#bfe6ff', { opacity: 0.5, glow: 0.3 });
      if (v === 'infection') for (const [x, z] of [[470, 280], [540, 340]]) { const m = A.shape('ring', x, 2, z, 50, 50, 1, '#6fff8a', { glow: 1.2 }); m.rotation.x = -Math.PI / 2; }
      if (v === 'hide') { A.light(470, 70, 280, '#fff3c8', 260, 360); W.hemi.intensity = 0.5; }
      if (v === 'flag') { A.box(360, 0, 260, 4, 80, 4, '#e8ecf1'); A.box(376, 56, 260, 30, 22, 2, '#ff5a6a', { glow: 0.6 }); }
      if (v === 'potato') { A.shape('sphere', 360, 90, 300, 26, 22, 22, '#c8913a'); A.glow('sphere', 360, 108, 300, 8, '#ffd23f', 2); }
      A.look(440, 30, 300, { dist: 250, pitch: 0.42, yaw: -0.3, fov: 45 });
    },
    fishing(A, c, game) {
      const W = A.W, v = V2(game);
      W.preset(v === 'lava' ? 'dusk' : v === 'deep' || v === 'koi' ? 'sunset' : 'day');
      const water = v === 'lava' ? '#ff5a1f' : v === 'ice' ? '#1f5f8a' : v === 'koi' ? '#3aa88a' : v === 'deep' ? '#1a5a8a' : '#2a8fc8';
      A.box(400, -30, 300, 3000, 2, 3000, water, { glow: v === 'lava' ? 0.9 : 0, opacity: 0.95 });
      if (v === 'ice') A.box(400, -28, 300, 3000, 4, 3000, '#e8f6ff');
      if (v === 'ice') A.shape('cyl', 470, -26, 360, 90, 4, 90, '#1f5f8a');
      if (v === 'deep') { A.box(380, -40, 240, 260, 34, 200, '#f4f1ea'); A.box(380, -8, 240, 240, 4, 180, '#b07a45'); }
      else if (v !== 'ice') { for (let z = 160; z < 320; z += 20) A.box(380, -12, z, 120, 6, 18, v === 'lava' ? '#3a3a3a' : '#8b5a2b'); }
      if (v === 'koi') for (let i = 0; i < 8; i++) A.shape('cyl', 300 + i * 40, -28, 380 + (i % 3) * 30, 36, 2, 36, '#3f9a3a');
      const guy = A.guy(380, v === 'ice' ? -24 : -6, 280, { rot: 0, scale: 11, hold: 'shovel' });
      void guy;
      const col = { lake: '#ffc940', ice: '#bfe6ff', deep: '#b67cff', lava: '#ff8a2e', koi: '#ff8a5c' }[v] || '#ffc940';
      const fish = new THREE.Group(); fish.position.set(470, 40, 360); fish.rotation.z = 0.7; W.scene.add(fish);
      W.shape('sphere', 0, 0, 0, 70, 30, 26, col, { parent: fish, glow: 0.3 }); const tail = W.shape('cone4', -46, 0, 0, 24, 30, 6, col, { parent: fish }); tail.rotation.z = Math.PI / 2; W.shape('sphere', 24, 6, 11, 6, 6, 4, '#141018', { parent: fish });
      for (let i = 0; i < 16; i++) A.glow('sphere', 470 + Math.cos(i) * 40, -20 + (i % 4) * 8, 360 + Math.sin(i) * 40, 5, '#dff4ff', 0.8);
      A.look(420, 20, 320, { dist: 230, pitch: 0.3, yaw: -0.6, fov: 50 });
    },
    farm(A, c, game) {
      const W = A.W, v = V2(game);
      W.preset(v === 'mushroom' ? 'night' : v === 'space' ? 'space' : v === 'pumpkin' ? 'sunset' : 'day'); if (v === 'mushroom' || v === 'space') W.stars(300);
      W.gridFloor(-400, -400, 1200, 1200, v === 'space' ? '#8a8f9e' : v === 'mushroom' ? '#2a3a2a' : v === 'pumpkin' ? '#a8a04a' : '#6cbf5a', 'rgba(0,0,0,.06)', 60);
      const rows = [];
      const crop = { valley: '#ff8a2e', pumpkin: '#ff6a1a', space: '#bfe6ff', honey: '#ff5aa8', mushroom: '#7cf5ff' }[v] || '#ff8a2e';
      for (let i = 0; i < 4; i++) rows.push({ x: 280 + i * 80, y: 0, z: 330, w: 60, h: 5, d: 200, color: '#7a5236' });
      W.boxes(rows);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) A.shape(v === 'mushroom' ? 'cone' : 'sphere', 280 + i * 80, 16, 260 + j * 45, v === 'pumpkin' ? 30 : 18, v === 'pumpkin' ? 24 : 18, v === 'pumpkin' ? 30 : 18, crop, { glow: v === 'mushroom' ? 1 : 0.1 });
      if (v === 'honey') { A.shape('dodeca', 560, 50, 230, 90, 100, 90, '#ffc940'); for (let i = 0; i < 12; i++) A.glow('sphere', 380 + Math.cos(i) * 60, 70 + (i % 3) * 12, 290 + Math.sin(i) * 60, 7, '#ffd23f', 0.8); }
      else if (v === 'space') { const d = A.shape('sphere', 400, 0, 300, 700, 400, 600, '#bfe6ff', { opacity: 0.15 }); d.material.side = THREE.DoubleSide; }
      else { A.box(560, 0, 200, 140, 100, 110, '#b83a3a'); A.box(560, 100, 200, 150, 50, 120, '#6b2a2a', { geo: 'cone4' }); }
      A.guy(420, 0, 400, { rot: -2.6, move: 0.4, hold: 'shovel', scale: 11 });
      A.guy(320, 0, 420, { rot: -1.2, emote: 'wave', scale: 10 });
      A.look(420, 20, 340, { dist: 280, pitch: 0.42, yaw: -0.25, fov: 45 });
    },
    restaurant(A, c, game) {
      const W = A.W, v = V2(game);
      W.preset(v === 'icecream' ? 'day' : v === 'taco' ? 'sunset' : 'indoor');
      W.gridFloor(-400, -400, 1200, 1200, '#e8d8c0', 'rgba(0,0,0,.1)', 40, { check: true });
      A.box(400, 0, 180, 700, 160, 20, { pizza: '#c85a3a', burger: '#3a7bd5', sushi: '#2a2a2a', icecream: '#ff9fc7', taco: '#2a9a6a' }[v] || '#c85a3a');
      A.box(400, 0, 320, 420, 44, 40, '#b07a45'); A.box(400, 44, 320, 430, 5, 46, '#e8ecf1');
      const stack = { pizza: ['#f4e1b0', '#d8382a', '#ffd23f', '#b8322a'], burger: ['#e0a85a', '#8a4a2a', '#ffd23f', '#6fd66b', '#e0a85a'], sushi: ['#ffffff', '#1f3a2a', '#ff8a5c'], icecream: ['#e0a85a', '#fff4d6', '#ff7aa8', '#9fefc8'], taco: ['#f4d890', '#8a4a2a', '#e03e3e', '#ffd23f'] }[v] || ['#ffd23f'];
      for (let k = 0; k < 3; k++) stack.forEach((col, i) => A.shape(v === 'icecream' && i ? 'sphere' : 'cyl', 330 + k * 70, 52 + i * 8, 320, 36 - i * (v === 'icecream' ? 4 : 1), 8, 36 - i * (v === 'icecream' ? 4 : 1), col));
      A.guy(400, 0, 260, { rot: Math.PI / 2, move: 0.6, emote: 'cheer', scale: 11 });
      A.guy(320, 20, 390, { rot: -Math.PI / 2, mode: 'sit', scale: 10 });
      A.guy(480, 20, 390, { rot: -Math.PI / 2, mode: 'sit', scale: 10 });
      A.box(610, 0, 240, 90, 90, 80, '#5a5f6a'); A.box(610, 30, 282, 60, 30, 2, '#ff8a2e', { glow: 0.9 });
      A.look(400, 30, 320, { dist: 300, pitch: 0.55, yaw: 0.2, fov: 45 });
    },
    flight(A, c, game) {
      const W = A.W, v = V2(game);
      W.preset(v === 'dragon' ? 'dusk' : v === 'wingsuit' || v === 'jet' ? 'sunset' : v === 'paper' ? 'indoor' : 'day');
      const r = U.rng('fl:' + game.id);
      if (v === 'wingsuit') for (let i = 0; i < 16; i++) { A.box(220, -200, 400 - i * 60, 120, 400 + r() * 200, 60, '#b0643a'); A.box(580, -200, 400 - i * 60, 120, 400 + r() * 200, 60, '#a05a34'); }
      else if (v !== 'paper') for (let i = 0; i < 20; i++) A.box(200 + r() * 400, -120 - r() * 100, -200 + r() * 700, 120, 40, 120, v === 'jet' ? '#3a3f5a' : '#6cbf5a');
      else { A.box(400, -60, 300, 1400, 40, 1400, '#c8a878'); A.box(400, -40, 100, 300, 180, 60, '#8b5a2b'); }
      for (let i = 0; i < 4; i++) { const m = A.shape('torus', 400 + (i % 2 ? 40 : -40), 60 + i * 10, 250 - i * 160, 100, 100, 18, '#ffd23f', { glow: 0.9 }); m.rotation.y = 0; }
      const rider = A.guy(400, 40, 330, { rot: Math.PI, mode: v === 'dragon' || v === 'paper' ? 'sit' : 'swim', scale: 11 });
      void rider;
      if (v === 'dragon') { A.shape('sphere', 400, 20, 330, 40, 30, 110, '#3a8a4a'); for (const sd of [-1, 1]) { const w = A.box(400 + sd * 60, 20, 330, 100, 4, 60, '#2a6a3a'); w.rotation.z = sd * 0.4; } A.glow('sphere', 400, 30, 240, 26, '#ff8a2e', 1.4); }
      if (v === 'jet') for (const sd of [-1, 1]) A.glow('cone', 400 + sd * 6, 34, 342, 8, '#ff8a2e', 1.4).rotation.x = Math.PI;
      if (v === 'paper') { const p = A.shape('cone4', 400, 28, 330, 70, 90, 12, '#f8f8f4'); p.rotation.x = -Math.PI / 2; p.rotation.y = Math.PI / 4; }
      for (let i = 0; i < 12; i++) A.box(r() * 900 - 50, 180 + r() * 150, -300 + r() * 600, 120, 30, 70, '#ffffff');
      A.look(400, 60, 360, { dist: 190, pitch: 0.2, yaw: 0.4, fov: 55 });
    },
    golf(A, c, game) {
      const W = A.W, v = V2(game);
      W.preset(v === 'neon' ? 'night' : v === 'space' ? 'space' : v === 'castle' ? 'dusk' : v === 'candy' ? 'sunset' : 'day'); if (v === 'neon' || v === 'space') W.stars(300);
      const green = { classic: '#4ab84a', neon: '#141a3a', candy: '#ffb3d9', space: '#4a4f6a', castle: '#5a8a4a' }[v] || '#4ab84a';
      const wall = { classic: '#b07a45', neon: '#39f3ff', candy: '#ffffff', space: '#8a8fae', castle: '#8a8f9e' }[v] || '#b07a45';
      A.box(400, -6, 300, 520, 6, 300, U.shade(wall, -0.3)); A.box(400, -1, 300, 490, 2, 270, green, { glow: v === 'neon' ? 0.15 : 0 });
      W.boxes([{ x: 400, y: 0, z: 160, w: 520, h: 18, d: 14, color: wall }, { x: 400, y: 0, z: 440, w: 520, h: 18, d: 14, color: wall }, { x: 145, y: 0, z: 300, w: 14, h: 18, d: 270, color: wall }], { glow: v === 'neon' ? 1 : 0 });
      if (v === 'classic') { A.box(470, 0, 230, 70, 110, 40, '#e8d8c0'); for (let k = 0; k < 4; k++) { const b = A.box(470, 70, 252, 10, 60, 3, '#ffffff'); b.rotation.z = k * Math.PI / 2 + 0.3; } }
      if (v === 'castle') { A.box(470, 0, 200, 60, 140, 40, '#8a8f9e'); A.box(530, 0, 200, 60, 140, 40, '#8a8f9e'); }
      if (v === 'space') { A.glow('sphere', 460, 30, 320, 50, '#b67cff', 0.9); A.shape('torus', 460, 30, 320, 90, 90, 20, '#ffe066', { glow: 0.8 }).rotation.x = 1.2; }
      if (v === 'candy') A.shape('sphere', 430, 10, 280, 44, 30, 44, '#7cf5ff');
      if (v === 'neon') A.box(430, 0, 300, 24, 22, 60, '#ff4fd8', { glow: 1 });
      A.shape('cyl', 580, 0.6, 330, 26, 1.4, 26, '#0a0a0a'); A.box(580, 0, 330, 3, 80, 3, '#e8ecf1'); A.box(594, 60, 330, 26, 16, 1.5, '#e03e3e', { glow: 0.3 });
      A.shape('sphere', 330, 7, 330, 14, 14, 14, '#ffffff', { glow: v === 'neon' ? 0.7 : 0 });
      A.guy(300, 0, 330, { rot: 0, hold: 'hammer', holdColor: '#c8ccd4', attack: true, scale: 11 });
      A.guy(260, 0, 420, { rot: 0.4, emote: 'cheer', scale: 10 });
      A.look(420, 10, 330, { dist: 300, pitch: 0.55, yaw: 0.25, fov: 45 });
    },
    spooky(A, c, game) {
      const W = A.W, v = V2(game);
      W.preset(v === 'frost' ? 'night' : 'indoor', { fogNear: 250, fogFar: 900 }); W.hemi.intensity = 0.3; W.sun.intensity = 0.25;
      const wall = { arcade: '#3a2a5a', halls: '#d8c86a', cottage: '#7a5a3a', hotel: '#d8c8a8', frost: '#8a9aae' }[v] || '#3a2a5a';
      const floor = { arcade: '#2a1f3a', halls: '#8a7a3a', cottage: '#5a3f2a', hotel: '#6a1f2a', frost: '#e8f4ff' }[v] || '#2a1f3a';
      W.gridFloor(-400, -400, 1200, 1200, floor, 'rgba(0,0,0,.2)', 56);
      for (let i = 0; i < 10; i++) { A.box(300, 0, 500 - i * 56, 56, 110, 56, U.shade(wall, (i % 3) * 0.03)); A.box(540, 0, 500 - i * 56, 56, 110, 56, U.shade(wall, (i % 2) * 0.03)); }
      A.light(420, 70, 380, v === 'halls' ? '#fffbe0' : '#fff0d0', 220, 380);
      A.guy(420, 0, 390, { rot: -Math.PI / 2, move: 1.3, scale: 11 });
      const mcol = { arcade: '#c8742a', halls: '#141018', cottage: '#e8f4ff', hotel: '#0a0a14', frost: '#f4faff' }[v] || '#141018';
      A.box(420, 0, 200, 50, 130, 34, mcol, { opacity: v === 'cottage' ? 0.55 : 1 }); A.box(420, 130, 200, 44, 40, 34, mcol, { opacity: v === 'cottage' ? 0.55 : 1 });
      for (const sd of [-1, 1]) A.glow('sphere', 420 + sd * 10, 150, 218, 8, v === 'frost' ? '#46a8ff' : '#ff2a2a', 2.5);
      A.glow('box', 480, 20, 330, 14, { arcade: '#ffd23f', halls: '#46a8ff', cottage: '#ffc940', hotel: '#ffe066', frost: '#ff8a2e' }[v] || '#ffd23f', 1.4);
      A.look(420, 60, 420, { dist: 220, pitch: 0.25, yaw: 0, fov: 55 });
    },
    quiz(A, c, game) {
      const W = A.W, v = V2(game);
      W.preset(v === 'science' ? 'space' : v === 'world' ? 'sunset' : v === 'math' ? 'arena' : 'day'); if (v === 'science') W.stars(300);
      A.box(400, -30, 300, 560, 30, 400, v === 'math' ? '#2a3148' : '#e8ecf1');
      const pads = v === 'truefalse' ? [['#3fd08a', 320, 300], ['#ff4a5a', 480, 300]] : [['#ff4a5a', 330, 230], ['#3a8bff', 470, 230], ['#ffd23f', 330, 370], ['#3fd08a', 470, 370]];
      pads.forEach(([col, x, z], i) => A.box(x, i === 2 ? -80 : 0, z, 110, 10, 110, col, { glow: 0.3 }));
      A.box(400, -30, 60, 400, 200, 12, '#141a2a');
      A.guy(330, 10, 230, { rot: -1.4, emote: 'cheer', scale: 11 });
      A.guy(470, 10, 370, { rot: -2, emote: 'laugh', scale: 11 });
      A.guy(330, -40, 370, { rot: -1.6, air: true, scale: 10 });
      A.glow('octa', 400, 150, 70, 40, '#ffe066', 1);
      A.look(400, 20, 330, { dist: 380, pitch: 0.55, yaw: 0.15, fov: 45 });
    },
  };

  const TEMPLATE_SCENE = { arena: 'block-battlegrounds', racing: 'skyline-racers', obby: 'sky-obby', simulator: 'pet-world', towerdefense: 'towerfall-legends', custom: 'sky-obby' };

  function sceneFor(game) {
    if (SCENES[game.id]) return { fn: SCENES[game.id], color: null };
    if (TYPE_SCENES[game.gameType] && game.builtIn) return { fn: (A, c) => TYPE_SCENES[game.gameType](A, c, game), color: null };
    const tpl = TEMPLATE_SCENE[game.template] || 'block-battlegrounds';
    return { fn: SCENES[tpl], color: (game.thumbnail && game.thumbnail.color) || '#ff7a2e' };
  }

  // ------------------------------------------------------------ title lettering

  function letter(canvas, title, accent) {
    const g = canvas.getContext('2d');
    // vignette and a darker band under the title so it always reads
    const v = g.createRadialGradient(PX_W / 2, PX_H / 2, PX_H * 0.35, PX_W / 2, PX_H / 2, PX_W * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.45)');
    g.fillStyle = v; g.fillRect(0, 0, PX_W, PX_H);
    const band = g.createLinearGradient(0, PX_H * 0.52, 0, PX_H);
    band.addColorStop(0, 'rgba(0,0,0,0)'); band.addColorStop(1, 'rgba(0,0,0,.6)');
    g.fillStyle = band; g.fillRect(0, PX_H * 0.5, PX_W, PX_H * 0.5);
    const words = String(title).toUpperCase().split(/\s+/);
    const lines = [];
    const face = '"Russo One", "Arial Black", Impact, sans-serif';
    // keep the title in the left three quarters: cards put a Play button bottom-right
    const MAXW = PX_W * 0.72;
    let size = 58;
    const fit = () => {
      lines.length = 0;
      g.font = size + 'px ' + face;
      let cur = '';
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > MAXW && cur) { lines.push(cur); cur = w; } else cur = t; }
      lines.push(cur);
    };
    fit();
    while ((lines.length > 2 || lines.some((l) => g.measureText(l).width > MAXW)) && size > 30) { size -= 4; fit(); }
    const lh = size * 1.02;
    let y = PX_H - 26 - (lines.length - 1) * lh;
    g.textBaseline = 'alphabetic';
    g.lineJoin = 'round';
    for (const l of lines) {
      const x = 28;
      g.save(); g.transform(1, 0, -0.08, 1, 0, 0);
      g.fillStyle = accent || '#ff7a2e'; g.fillText(l, x + 5, y + 5);
      g.lineWidth = Math.max(6, size * 0.16); g.strokeStyle = '#141018'; g.strokeText(l, x, y);
      const grad = g.createLinearGradient(0, y - size, 0, y);
      grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#ffe7b0');
      g.fillStyle = grad; g.fillText(l, x, y);
      g.restore();
      y += lh;
    }
  }

  // ------------------------------------------------------------ rendering + cache

  function keyOf(game) {
    const custom = !SCENES[game.id] && !game.builtIn;
    return VERSION + ':' + (custom ? 'ug:' + (game.template || '') + ':' + ((game.thumbnail && game.thumbnail.color) || '') + ':' + game.name : game.id);
  }
  const storeKey = (k) => 'bf.thumb3d.' + k;
  /** Most renders kept in localStorage (the rest re-render per visit), so thumbnails never crowd out saves. */
  const STORE_MAX = 28;
  let swept = false;
  /** Drop renders from older versions of the thumbnail art (once per page load). */
  function sweepOld() {
    if (swept) return;
    swept = true;
    try {
      const dead = [];
      for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key && key.indexOf('bf.thumb3d.') === 0 && key !== 'bf.thumb3d.index' && key.indexOf('bf.thumb3d.' + VERSION + ':') !== 0) dead.push(key); }
      dead.forEach((key) => localStorage.removeItem(key));
    } catch (e) { /* no storage */ }
  }
  function persist(k, url) {
    sweepOld();
    try {
      const idx = JSON.parse(localStorage.getItem('bf.thumb3d.index') || '[]').filter((x) => x !== k);
      idx.push(k);
      while (idx.length > STORE_MAX) localStorage.removeItem(storeKey(idx.shift()));
      localStorage.setItem(storeKey(k), url);
      localStorage.setItem('bf.thumb3d.index', JSON.stringify(idx));
    } catch (e) { /* storage full or blocked: memory cache only */ }
  }

  function render(game) {
    const { fn, color } = sceneFor(game);
    const W = BF.g3d.world({ renderer, W: PX_W, H: PX_H, fov: 45 });
    W.camera.aspect = PX_W / PX_H; W.camera.updateProjectionMatrix();
    try {
      fn(kit(W, game.id), color);
      renderer.setSize(PX_W, PX_H, false);
      renderer.render(W.scene, W.camera);
      const c = document.createElement('canvas');
      c.width = PX_W; c.height = PX_H;
      c.getContext('2d').drawImage(renderer.domElement, 0, 0);
      letter(c, game.name || '', color || game.accent || '#ff7a2e');
      return c.toDataURL('image/jpeg', 0.8);
    } finally {
      W.scene.traverse((o) => { if (o.userData && o.userData.dispose) o.userData.dispose(); });
      W.dispose();
    }
  }

  function swap(from, to) {
    if (!from || typeof document === 'undefined') return;
    document.querySelectorAll('img').forEach((img) => { if (img.getAttribute('src') === from) img.setAttribute('src', to); });
  }

  function pump() {
    pumping = false;
    if (!queue.size) return;
    if (!fontsReady && document.fonts && document.fonts.ready) {
      Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(() => { fontsReady = true; schedule(); });
      return;
    }
    const [k, job] = queue.entries().next().value;
    queue.delete(k);
    let url = null;
    try { url = render(job.game); } catch (e) { console.error(e); }
    if (url) {
      mem.set(k, url);
      persist(k, url);
      job.from.forEach((f) => swap(f, url));
      if (BF.bus) BF.bus.emit('thumb3d:ready', { key: k });
    }
    schedule();
  }
  function schedule() { if (!pumping && queue.size) { pumping = true; setTimeout(() => requestAnimationFrame(pump), 16); } }

  BF.thumb3d = {
    /** A finished render for this game, or null. */
    get(game) {
      if (!game || !game.name) return null;
      const k = keyOf(game);
      if (mem.has(k)) return mem.get(k);
      try { const s = localStorage.getItem(storeKey(k)); if (s) { mem.set(k, s); return s; } } catch (e) { /* no storage */ }
      return null;
    },
    /** Queue a render; any <img> currently showing `from` is swapped when it is ready. */
    request(game, from) {
      if (!game || !game.name || !setup()) return;
      const k = keyOf(game);
      const job = queue.get(k) || { game, from: new Set() };
      if (from) job.from.add(from);
      queue.set(k, job);
      schedule();
    },
    /** Render now (tests, previews). */
    renderNow(game) { return setup() ? render(game) : null; },
    scenes: Object.keys(SCENES),
  };
})((window.BF = window.BF || {}));
