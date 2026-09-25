/**
 * BlockForge — merged 3D props: blocky pets and cars.
 *
 * Pets: builds a chunky pet from the same art spec the 2D pet art uses
 * ({body, belly, ears, ear, tail, extra[], glow}). Every static part of a
 * species is merged into one vertex-coloured mesh (cached per species), so a
 * pet costs one or two draw calls however many ears, horns and sprinkles it
 * has. "rainbow" bodies get their own cycling material.
 *
 * Pets face +Z (the same as avatar rigs), stand on y = 0 and are about one
 * unit tall; scale the returned group to taste.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const geoCache = new Map();
  const TAU = Math.PI * 2;

  const BASE = {};
  function baseGeo(kind) {
    if (BASE[kind]) return BASE[kind];
    let g;
    if (kind === 'box') g = new THREE.BoxGeometry(1, 1, 1);
    else if (kind === 'sphere') g = new THREE.SphereGeometry(0.5, 10, 8);
    else if (kind === 'cone4') { g = new THREE.ConeGeometry(0.5, 1, 4); g.rotateY(Math.PI / 4); }
    else if (kind === 'cone') g = new THREE.ConeGeometry(0.5, 1, 10);
    else if (kind === 'octa') g = new THREE.OctahedronGeometry(0.5, 0);
    else if (kind === 'torus') g = new THREE.TorusGeometry(0.5, 0.14, 6, 16);
    else if (kind === 'cyl') { g = new THREE.CylinderGeometry(0.5, 0.5, 1, 12); g.rotateX(Math.PI / 2); }
    else g = new THREE.BoxGeometry(1, 1, 1);
    BASE[kind] = g.index ? g.toNonIndexed() : g;
    return BASE[kind];
  }

  /**
   * Merge simple parts into one BufferGeometry with vertex colours.
   * parts: [{k:'box'|'sphere'|..., p:[x,y,z] (centre), s:[sx,sy,sz], r:[rx,ry,rz]?, c:'#hex'}]
   */
  function merge(parts) {
    let count = 0;
    for (const p of parts) count += baseGeo(p.k).attributes.position.count;
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
    const m4 = new THREE.Matrix4(), n3 = new THREE.Matrix3(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const v = new THREE.Vector3(), c = new THREE.Color();
    let o = 0;
    for (const p of parts) {
      const g = baseGeo(p.k);
      const r = p.r || [0, 0, 0];
      e.set(r[0], r[1], r[2]);
      q.setFromEuler(e);
      m4.compose(v.set(p.p[0], p.p[1], p.p[2]), q, new THREE.Vector3(p.s[0], p.s[1], p.s[2]));
      n3.getNormalMatrix(m4);
      c.set(p.c);
      const gp = g.attributes.position, gn = g.attributes.normal;
      for (let i = 0; i < gp.count; i++, o++) {
        v.fromBufferAttribute(gp, i).applyMatrix4(m4);
        pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
        v.fromBufferAttribute(gn, i).applyMatrix3(n3).normalize();
        nor[o * 3] = v.x; nor[o * 3 + 1] = v.y; nor[o * 3 + 2] = v.z;
        col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
      }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    out.userData.shared = true;
    return out;
  }

  /** Part lists for one species: {shell: parts drawn in fixed colours, body: parts in the body colour}. */
  function partsOf(sp) {
    const ex = sp.extra || [];
    const rainbow = sp.body === 'rainbow';
    const body = rainbow ? '#ffffff' : sp.body;
    const tone = (amt) => (rainbow ? '#e8e0ff' : U.shade(sp.body, amt));
    const belly = sp.belly || tone(0.35);
    const ear = sp.ear || tone(-0.12);
    const inner = '#ffb6c9';
    const S = [], B = [];
    const bodyPart = (k, p, s, r) => B.push({ k, p, s, r, c: body });
    // body + feet
    bodyPart('box', [0, 0.52, 0], [1, 0.84, 0.9]);
    for (const [x, z] of [[-0.28, 0.22], [0.28, 0.22], [-0.28, -0.24], [0.28, -0.24]]) S.push({ k: 'box', p: [x, 0.07, z], s: [0.24, 0.14, 0.24], c: tone(-0.22) });
    S.push({ k: 'box', p: [0, 0.34, 0.451], s: [0.56, 0.34, 0.02], c: belly });
    // face
    for (const sd of [-1, 1]) {
      S.push({ k: 'box', p: [sd * 0.2, 0.62, 0.455], s: [0.13, 0.18, 0.02], c: '#1b1b22' });
      S.push({ k: 'box', p: [sd * 0.2 + 0.03, 0.67, 0.466], s: [0.05, 0.05, 0.01], c: '#ffffff' });
      S.push({ k: 'box', p: [sd * 0.34, 0.48, 0.456], s: [0.12, 0.06, 0.01], c: '#ff8fa3' });
    }
    if (ex.includes('snout')) {
      S.push({ k: 'box', p: [0, 0.47, 0.5], s: [0.28, 0.18, 0.1], c: sp.snout || tone(-0.08) });
      for (const sd of [-1, 1]) S.push({ k: 'box', p: [sd * 0.05, 0.47, 0.552], s: [0.04, 0.05, 0.01], c: '#5a3040' });
    } else S.push({ k: 'box', p: [0, 0.5, 0.458], s: [0.08, 0.06, 0.02], c: '#3a2530' });
    if (ex.includes('whiskers')) for (const sd of [-1, 1]) for (const dy of [0, -0.06]) S.push({ k: 'box', p: [sd * 0.52, 0.5 + dy, 0.4], s: [0.22, 0.015, 0.015], r: [0, 0, sd * dy * 3], c: '#3a2530' });
    // ears
    if (sp.ears === 'point') for (const sd of [-1, 1]) { S.push({ k: 'cone4', p: [sd * 0.3, 1.1, 0], s: [0.3, 0.36, 0.22], c: ear }); S.push({ k: 'cone4', p: [sd * 0.3, 1.06, 0.07], s: [0.15, 0.22, 0.1], c: inner }); }
    if (sp.ears === 'round') for (const sd of [-1, 1]) { S.push({ k: 'sphere', p: [sd * 0.34, 1.0, 0], s: [0.28, 0.28, 0.16], c: ear }); S.push({ k: 'sphere', p: [sd * 0.34, 1.0, 0.05], s: [0.14, 0.14, 0.08], c: inner }); }
    if (sp.ears === 'long') for (const sd of [-1, 1]) { S.push({ k: 'box', p: [sd * 0.2, 1.2, 0], s: [0.16, 0.56, 0.1], r: [0, 0, -sd * 0.12], c: ear }); S.push({ k: 'box', p: [sd * 0.2, 1.2, 0.051], s: [0.08, 0.4, 0.01], r: [0, 0, -sd * 0.12], c: inner }); }
    if (sp.ears === 'flop') for (const sd of [-1, 1]) S.push({ k: 'box', p: [sd * 0.55, 0.72, 0.05], s: [0.12, 0.42, 0.3], r: [0, 0, sd * 0.25], c: ear });
    // tails
    if (sp.tail === 'thin') S.push({ k: 'box', p: [0, 0.55, -0.62], s: [0.09, 0.09, 0.42], r: [0.6, 0, 0], c: ear });
    if (sp.tail === 'bushy') { S.push({ k: 'box', p: [0, 0.62, -0.62], s: [0.28, 0.28, 0.5], r: [0.5, 0, 0], c: tone(0) }); S.push({ k: 'box', p: [0, 0.82, -0.84], s: [0.2, 0.2, 0.16], r: [0.5, 0, 0], c: belly }); }
    // extras
    if (ex.includes('wings')) { const wc = rainbow ? '#ffd66b' : U.shade(sp.body, -0.2); for (const sd of [-1, 1]) S.push({ k: 'box', p: [sd * 0.68, 0.72, -0.08], s: [0.5, 0.06, 0.34], r: [0, 0, sd * 0.42], c: wc }); }
    if (ex.includes('horns')) for (const sd of [-1, 1]) S.push({ k: 'cone4', p: [sd * 0.26, 1.08, -0.05], s: [0.12, 0.34, 0.12], r: [0, 0, -sd * 0.25], c: '#fff3c4' });
    if (ex.includes('horn')) { S.push({ k: 'cone', p: [0, 1.16, 0.22], s: [0.13, 0.5, 0.13], r: [0.35, 0, 0], c: '#ffd66b' }); }
    if (ex.includes('crest')) [-0.14, 0, 0.14].forEach((x, i) => S.push({ k: 'cone4', p: [x, 1.1 + (i === 1 ? 0.08 : 0), -0.05], s: [0.14, 0.34 + (i === 1 ? 0.14 : 0), 0.14], c: i === 1 ? '#fff1a8' : '#ffb52e' }));
    if (ex.includes('mane')) ['#ff9ad5', '#ffd66b', '#7fe7ff', '#b67cff'].forEach((c, i) => S.push({ k: 'box', p: [-0.3 + i * 0.2, 0.98, -0.12], s: [0.2, 0.18, 0.5], c }));
    if (ex.includes('shell')) {
      S.push({ k: 'box', p: [0, 0.86, -0.06], s: [1.06, 0.36, 0.86], c: '#2f8f57' });
      for (const [x, z] of [[-0.25, -0.2], [0.25, -0.2], [0, 0.1], [-0.25, 0.2], [0.25, 0.2]]) S.push({ k: 'box', p: [x, 1.05, z - 0.06], s: [0.14, 0.05, 0.14], c: '#7fe7ff' });
    }
    if (ex.includes('fluff')) for (let i = 0; i < 5; i++) S.push({ k: 'sphere', p: [-0.36 + i * 0.18, 0.98, -0.05 + (i % 2) * 0.1], s: [0.26, 0.22, 0.26], c: '#fff7fc' });
    if (ex.includes('swirl')) { S.push({ k: 'torus', p: [0, 0.34, 0.47], s: [0.24, 0.24, 0.2], c: '#ff5a9a' }); S.push({ k: 'torus', p: [0, 0.34, 0.48], s: [0.1, 0.1, 0.1], c: '#7fe7ff' }); }
    if (ex.includes('sprinkles')) [['#ffd66b', -0.3, 0.8, 0.3], ['#7fe7ff', 0.28, 0.86, -0.1], ['#4ad17f', -0.1, 0.95, -0.25], ['#ffffff', 0.34, 0.6, 0.46], ['#ff5a6a', -0.51, 0.6, 0.1], ['#b67cff', 0.51, 0.4, -0.2]].forEach(([c, x, y, z], i) => S.push({ k: 'box', p: [x, y, z], s: [0.12, 0.04, 0.04], r: [0, i, i * 0.7], c }));
    if (ex.includes('stars')) [[-0.3, 0.8], [0.3, 0.3], [0.1, 0.9], [-0.42, 0.3]].forEach(([x, y]) => S.push({ k: 'box', p: [x, y, 0.456], s: [0.05, 0.05, 0.01], c: '#ffffff' }));
    if (ex.includes('gems')) for (const sd of [-1, 1]) S.push({ k: 'octa', p: [sd * 0.5, 0.8, 0.1], s: [0.18, 0.26, 0.18], c: '#e6fbff' });
    return { S, B, rainbow };
  }

  const vcMat = () => (BF.pet3d._vc || (BF.pet3d._vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 })));

  /**
   * Build a pet group.
   * @param {object} sp art spec (needs a stable `id` for caching)
   * @param {{collar?:string, shadow?:boolean}} [o] collar = colour of a collar band
   * @returns {THREE.Group} with userData.tick(t) for rainbow bodies
   */
  function build(sp, o) {
    o = o || {};
    const key = sp.id || JSON.stringify(sp);
    let entry = geoCache.get(key);
    if (!entry) {
      const pr = partsOf(sp);
      entry = { shell: merge(pr.S), body: merge(pr.B), rainbow: pr.rainbow };
      geoCache.set(key, entry);
    }
    const g = new THREE.Group();
    const shell = new THREE.Mesh(entry.shell, vcMat());
    let bodyMat;
    if (entry.rainbow) bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.25 });
    const body = new THREE.Mesh(entry.body, bodyMat || vcMat());
    shell.castShadow = body.castShadow = o.shadow !== false;
    g.add(body, shell);
    if (o.collar) {
      const band = new THREE.Mesh(BF.g3d.geo('box'), BF.g3d.mat(o.collar, { rough: 0.4 }));
      band.scale.set(1.04, 0.09, 0.94);
      band.position.y = 0.2;
      const tag = new THREE.Mesh(BF.g3d.geo('box'), BF.g3d.mat('#ffd66b', { metal: 0.5, rough: 0.3 }));
      tag.scale.set(0.12, 0.12, 0.04);
      tag.position.set(0, 0.13, 0.49);
      g.add(band, tag);
    }
    if (sp.glow) {
      const halo = new THREE.Mesh(BF.g3d.geo('sphere'), BF.g3d.mat(sp.glow, { basic: true, opacity: 0.2, depthWrite: false }));
      halo.scale.setScalar(1.7);
      halo.position.y = 0.55;
      g.add(halo);
    }
    g.userData.tick = (t) => {
      if (bodyMat) { bodyMat.color.setHSL((t * 0.22) % 1, 0.85, 0.66); bodyMat.emissive.copy(bodyMat.color); }
    };
    g.userData.dispose = () => { if (bodyMat) bodyMat.dispose(); };
    return g;
  }

  /** Face a game-plane angle (x = cos a, z = sin a), same convention as avatar rigs. */
  function face(g, a) { g.rotation.y = Math.PI / 2 - a; }

  // ------------------------------------------------------------------ cars

  const carCache = new Map();
  /**
   * A blocky car as one merged mesh, facing +X with wheels on y = 0.
   * @param {{color:string, long?:boolean, taxi?:boolean, police?:boolean}} o
   * @returns {THREE.Mesh} rotate with rotation.y = -heading
   */
  function car(o) {
    const key = [o.color, o.long ? 1 : 0, o.taxi ? 1 : 0, o.police ? 1 : 0].join('|');
    let geo = carCache.get(key);
    if (!geo) {
      const L = o.long ? 46 : 40, Wd = 22, c = o.color;
      const P = [];
      P.push({ k: 'box', p: [0, 10, 0], s: [L, 9, Wd], c });
      P.push({ k: 'box', p: [0, 5.5, 0], s: [L - 2, 3, Wd - 1], c: U.shade(c, -0.35) });
      if (o.long) {
        P.push({ k: 'box', p: [L * 0.2, 17.5, 0], s: [L * 0.36, 7, Wd - 3], c: '#2a3a55' });
        P.push({ k: 'box', p: [L * 0.2, 21.5, 0], s: [L * 0.34, 1.6, Wd - 4], c });
        for (const sd of [-1, 1]) P.push({ k: 'box', p: [-L * 0.22, 16, sd * (Wd / 2 - 1)], s: [L * 0.5, 3, 2], c: U.shade(c, -0.15) });
        P.push({ k: 'box', p: [-L * 0.22, 14.6, 0], s: [L * 0.5, 0.4, Wd - 3], c: U.shade(c, -0.45) });
      } else {
        P.push({ k: 'box', p: [-L * 0.05, 17.5, 0], s: [L * 0.52, 7, Wd - 3], c: '#2a3a55' });
        P.push({ k: 'box', p: [-L * 0.05, 21.5, 0], s: [L * 0.46, 1.6, Wd - 4], c });
      }
      for (const sd of [-1, 1]) {
        P.push({ k: 'box', p: [L / 2 + 0.3, 11, sd * Wd * 0.3], s: [1, 3, 5], c: '#fff6c8' });
        P.push({ k: 'box', p: [-L / 2 - 0.3, 11, sd * Wd * 0.3], s: [1, 3, 5], c: '#ff3b3b' });
        for (const fx of [-1, 1]) {
          P.push({ k: 'cyl', p: [fx * L * 0.3, 5, sd * (Wd / 2 - 1)], s: [10, 10, 4], c: '#16181f' });
          P.push({ k: 'cyl', p: [fx * L * 0.3, 5, sd * (Wd / 2 + 1)], s: [4, 4, 1], c: '#b7c0cf' });
        }
      }
      if (o.taxi) { P.push({ k: 'box', p: [-L * 0.05, 24, 0], s: [8, 4, 12], c: '#1b1b22' }); P.push({ k: 'box', p: [-L * 0.05, 26.4, 0], s: [8.4, 0.8, 12.4], c: '#ffc940' }); }
      if (o.police) { P.push({ k: 'box', p: [-L * 0.05, 23.5, -3], s: [5, 3, 5], c: '#ff3b3b' }); P.push({ k: 'box', p: [-L * 0.05, 23.5, 3], s: [5, 3, 5], c: '#46a8ff' }); }
      geo = merge(P);
      carCache.set(key, geo);
    }
    const m = new THREE.Mesh(geo, vcMat());
    m.castShadow = true;
    return m;
  }

  // --------------------------------------------------------------- zombies

  const zCache = new Map();
  let legGeo = null, flashMat = null;
  /**
   * A shambling zombie (arms out, facing +Z, feet on y = 0, about 54 units tall):
   * one merged body mesh plus two swinging legs. Call userData.tick(t, moving, flash).
   * @param {{skin?:string, shirt?:string, pants?:string, eyes?:string}} o
   */
  function zombie(o) {
    o = o || {};
    const skin = o.skin || '#8fbf6a', shirt = o.shirt || '#5a6a7a', pants = o.pants || '#3a4250', eyes = o.eyes || '#1b1b22';
    const key = [skin, shirt, pants, eyes].join('|');
    let geo = zCache.get(key);
    if (!geo) {
      const P = [];
      P.push({ k: 'box', p: [0, 31, 0], s: [18, 20, 10], c: shirt });
      P.push({ k: 'box', p: [2, 20, 0], s: [15, 3, 9.6], c: U.shade(shirt, -0.3) });
      P.push({ k: 'box', p: [0, 48, 2], s: [15, 14, 14], r: [0.18, 0, 0.1], c: skin });
      for (const sd of [-1, 1]) {
        P.push({ k: 'box', p: [sd * 4, 49.5, 9.3], s: [3, 3, 0.6], r: [0.18, 0, 0.1], c: eyes });
        P.push({ k: 'box', p: [sd * 12.5, 37, 1], s: [6.4, 6.4, 7], c: shirt });
        P.push({ k: 'box', p: [sd * 12.5, 36 - sd, 11], s: [5.6, 5.6, 16], r: [-0.1, 0, 0], c: skin });
      }
      P.push({ k: 'box', p: [0, 44.5, 9.1], s: [7, 2, 0.6], r: [0.18, 0, 0.1], c: '#3a1f1f' });
      geo = merge(P);
      zCache.set(key, geo);
    }
    if (!legGeo) { legGeo = new THREE.BoxGeometry(7, 20, 8); legGeo.translate(0, -10, 0); legGeo.userData.shared = true; }
    if (!flashMat) { flashMat = new THREE.MeshBasicMaterial({ color: '#ffffff' }); flashMat.userData.shared = true; }
    const g = new THREE.Group();
    const body = new THREE.Mesh(geo, vcMat());
    body.castShadow = true;
    g.add(body);
    const legMat = BF.g3d.mat(pants);
    const legs = [-1, 1].map((sd) => { const l = new THREE.Mesh(legGeo, legMat); l.position.set(sd * 4.6, 21, 0); l.castShadow = true; g.add(l); return l; });
    const seed = Math.random() * 10;
    g.userData.tick = (t, moving, flash) => {
      const k = moving ? 1 : 0.15;
      legs[0].rotation.x = Math.sin(t * 7 + seed) * 0.6 * k;
      legs[1].rotation.x = -Math.sin(t * 7 + seed) * 0.6 * k;
      body.rotation.z = Math.sin(t * 3.5 + seed) * 0.08;
      body.position.y = Math.abs(Math.sin(t * 7 + seed)) * 1.5 * k;
      body.material = flash ? flashMat : vcMat();
    };
    return g;
  }

  // ----------------------------------------------------------------- ships

  const shipCache = new Map();
  /**
   * A small sailing warship as one merged mesh, bow towards +X, waterline at y = 0.
   * @param {{team?:string, sail?:string, hull?:string}} o team = accent colour
   */
  function ship(o) {
    o = o || {};
    const hull = o.hull || '#7a4a2a', team = o.team || '#46a8ff', sail = o.sail || '#f4f1ea';
    const key = [hull, team, sail].join('|');
    let geo = shipCache.get(key);
    if (!geo) {
      const P = [];
      P.push({ k: 'box', p: [0, 2, 0], s: [52, 12, 22], c: hull });
      P.push({ k: 'cone4', p: [34, 3, 0], s: [22, 18, 12], r: [0, 0, -Math.PI / 2], c: hull });
      P.push({ k: 'box', p: [0, 8.5, 0], s: [50, 1, 20], c: U.shade(hull, 0.25) });
      for (const sd of [-1, 1]) P.push({ k: 'box', p: [0, 5, sd * 11.1], s: [50, 2.6, 0.4], c: team });
      P.push({ k: 'box', p: [-19, 12, 0], s: [12, 8, 18], c: U.shade(hull, 0.1) });
      for (const x of [-8, 2, 12]) for (const sd of [-1, 1]) P.push({ k: 'box', p: [x, 10.5, sd * 11], s: [5, 3.5, 6], c: '#2a2f3a' });
      P.push({ k: 'box', p: [4, 28, 0], s: [2.4, 40, 2.4], c: '#3a2a1e' });
      P.push({ k: 'box', p: [5.5, 30, 0], s: [1.5, 24, 30], c: sail });
      P.push({ k: 'box', p: [5.6, 30, 0], s: [1.6, 5, 30.4], c: team });
      P.push({ k: 'box', p: [4, 50, 4], s: [1, 5, 8], c: team });
      geo = merge(P);
      shipCache.set(key, geo);
    }
    const m = new THREE.Mesh(geo, vcMat());
    m.castShadow = true;
    return m;
  }

  BF.pet3d = { build, face, merge, TAU };
  BF.props3d = { car, merge, pet: build, zombie, ship };
})((window.BF = window.BF || {}));
