/**
 * BlockForge — 3D blocky avatars.
 *
 *   BF.char3d.build(avatar, opts) -> Rig     a posable, animated character
 *   BF.avatar3d.image(avatar, opts) -> html  cached 3D render for pages
 *   BF.avatar3d.live(el, avatar, opts)       a draggable live viewer
 *
 * Proportions follow the classic blocky figure: legs 2 units, torso 2×2×1,
 * arms 1×2×1, a 1.25 head. The rig's origin is between the feet and it faces
 * +Z. Every item look ({style|shape, c1, c2, glow}) maps to parts built from
 * primitives, so new items only need data, as with the SVG renderer.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const PI = Math.PI;
  const g3 = () => BF.g3d;
  const INK = '#1b1b22';

  function lookOf(id) {
    if (id && typeof id === 'object') return id;
    const it = id && BF.ITEMS[id];
    return it ? it.look || {} : null;
  }

  /** Accept {skin, equipped} or a compact canvas-game look {skin, shirt, pants, ...}. */
  function normalize(av) {
    if (!av) return { skin: BF.STARTER_SKIN, equipped: BF.STARTER_EQUIP };
    if (av.equipped) return av;
    const l = av;
    return {
      skin: l.skin || '#f1c27d',
      equipped: {
        head: l.headShape && l.headShape !== 'block' ? { shape: l.headShape, c1: l.skin } : 'head_block',
        face: 'face_smile',
        hair: l.hair ? { style: 'short', c1: l.hair } : null,
        shirt: { style: 'logo', c1: l.shirt || '#23a699', c2: l.shirt2 || '#ffb454' },
        pants: { style: 'jeans', c1: l.pants || '#2f4a7a' },
        shoes: { style: 'sneaker', c1: l.shoes || '#39414f', c2: '#ffffff' },
        hat: l.hatStyle ? { style: l.hatStyle, c1: l.hat, c2: l.shirt2 || '#ffffff' } : null,
        back: l.back ? { style: 'backpack', c1: l.back, c2: '#39414f' } : null,
        accessory: l.acc ? { style: 'glasses', c1: l.acc } : null,
        animation: 'anim_default',
      },
    };
  }

  // ------------------------------------------------------------ textures

  function faceTex(style) {
    return g3().canvasTex('face:' + style, 128, 128, (g) => {
      const eye = (x, y, c) => {
        g.fillStyle = c || INK;
        BF.gfx.rr(g, x - 7, y - 10, 14, 20, 5); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 2.5, y - 4, 2.6, 0, PI * 2); g.fill();
      };
      const stroke = (w, c) => { g.lineWidth = w; g.lineCap = 'round'; g.strokeStyle = c || INK; };
      switch (style) {
        case 'grin':
          eye(40, 50); eye(88, 50);
          g.fillStyle = INK; g.beginPath(); g.moveTo(34, 78); g.lineTo(94, 78); g.quadraticCurveTo(90, 108, 64, 108); g.quadraticCurveTo(38, 108, 34, 78); g.fill();
          g.fillStyle = '#fff'; g.fillRect(40, 78, 48, 8);
          break;
        case 'wink':
          eye(88, 52);
          stroke(6); g.beginPath(); g.moveTo(30, 54); g.quadraticCurveTo(40, 44, 50, 54); g.stroke();
          g.beginPath(); g.moveTo(44, 86); g.quadraticCurveTo(66, 98, 86, 80); g.stroke();
          break;
        case 'sleepy':
          stroke(6); g.beginPath(); g.moveTo(30, 54); g.quadraticCurveTo(40, 62, 50, 54); g.moveTo(78, 54); g.quadraticCurveTo(88, 62, 98, 54); g.stroke();
          g.fillStyle = INK; g.beginPath(); g.ellipse(64, 88, 7, 6, 0, 0, PI * 2); g.fill();
          g.fillStyle = '#8fd3ff'; g.font = '800 22px sans-serif'; g.fillText('z', 100, 30);
          break;
        case 'determined':
          eye(40, 56); eye(88, 56);
          stroke(6); g.beginPath(); g.moveTo(26, 36); g.lineTo(52, 44); g.moveTo(102, 36); g.lineTo(76, 44); g.stroke();
          g.fillStyle = INK; BF.gfx.rr(g, 46, 86, 36, 7, 3); g.fill();
          break;
        case 'robot':
          g.fillStyle = '#39f3ff'; BF.gfx.rr(g, 24, 42, 32, 16, 5); g.fill(); BF.gfx.rr(g, 72, 42, 32, 16, 5); g.fill();
          g.fillStyle = '#0d5a66'; BF.gfx.rr(g, 36, 80, 56, 13, 3); g.fill();
          g.fillStyle = '#39f3ff'; for (let i = 0; i < 3; i++) g.fillRect(42 + i * 16, 83, 9, 7);
          break;
        case 'star': {
          const star = (cx, cy) => {
            g.beginPath();
            for (let i = 0; i < 10; i++) { const r = i % 2 ? 6 : 14, a = -PI / 2 + i * PI / 5; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
            g.closePath(); g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
          };
          star(40, 52); star(88, 52);
          g.fillStyle = INK; g.beginPath(); g.moveTo(40, 80); g.quadraticCurveTo(64, 110, 88, 80); g.closePath(); g.fill();
          break;
        }
        case 'fangs':
          eye(40, 52, '#8b1e3f'); eye(88, 52, '#8b1e3f');
          stroke(6); g.beginPath(); g.moveTo(38, 82); g.quadraticCurveTo(64, 98, 90, 82); g.stroke();
          g.fillStyle = '#fff'; g.beginPath(); g.moveTo(48, 86); g.lineTo(55, 87); g.lineTo(51, 99); g.fill(); g.beginPath(); g.moveTo(73, 87); g.lineTo(80, 86); g.lineTo(77, 99); g.fill();
          break;
        default:
          eye(40, 52); eye(88, 52);
          stroke(6.5); g.beginPath(); g.moveTo(40, 80); g.quadraticCurveTo(64, 102, 88, 80); g.stroke();
      }
    });
  }

  const SHIRT_ART = {
    logo: (g, l) => { g.fillStyle = l.c2; g.beginPath(); g.moveTo(40, 58); g.lineTo(64, 40); g.lineTo(88, 58); g.lineTo(88, 76); g.lineTo(64, 58); g.lineTo(40, 76); g.closePath(); g.fill(); },
    stripe: (g, l) => { g.fillStyle = l.c2; for (let y = 18; y < 128; y += 26) g.fillRect(0, y, 128, 11); },
    hoodie: (g, l) => {
      g.fillStyle = l.c2; BF.gfx.rr(g, 30, 72, 68, 34, 8); g.fill();
      g.fillStyle = U.shade(l.c1, -0.18); g.beginPath(); g.moveTo(20, 0); g.quadraticCurveTo(64, 34, 108, 0); g.lineTo(96, 0); g.quadraticCurveTo(64, 22, 32, 0); g.fill();
      g.strokeStyle = '#e8ecf1'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(50, 8); g.lineTo(50, 34); g.moveTo(78, 8); g.lineTo(78, 34); g.stroke();
    },
    tropical: (g, l) => {
      const r = U.rng('trop' + l.c1);
      for (let i = 0; i < 12; i++) { const x = r() * 128, y = r() * 128; g.fillStyle = l.c2; g.beginPath(); g.arc(x, y, 8 + r() * 6, 0, PI * 2); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 3, 0, PI * 2); g.fill(); }
      g.strokeStyle = U.shade(l.c1, -0.3); g.lineWidth = 5; g.beginPath(); g.moveTo(46, 0); g.lineTo(64, 24); g.lineTo(82, 0); g.stroke();
    },
    jersey: (g, l) => {
      g.fillStyle = l.c2; g.fillRect(0, 0, 14, 128); g.fillRect(114, 0, 14, 128);
      g.strokeStyle = l.c2; g.lineWidth = 7; g.beginPath(); g.moveTo(44, 0); g.lineTo(64, 20); g.lineTo(84, 0); g.stroke();
      g.fillStyle = l.c2; g.font = '900 60px Arial Black, sans-serif'; g.textAlign = 'center'; g.fillText('7', 64, 100);
    },
    tux: (g, l) => {
      g.fillStyle = l.c2; g.beginPath(); g.moveTo(40, 0); g.lineTo(64, 70); g.lineTo(88, 0); g.fill();
      g.fillStyle = INK; for (const y of [34, 50]) { g.beginPath(); g.arc(64, y, 3, 0, PI * 2); g.fill(); }
      g.fillStyle = '#c81d4e'; g.beginPath(); g.moveTo(50, 10); g.lineTo(64, 17); g.lineTo(78, 10); g.lineTo(78, 24); g.lineTo(64, 17); g.lineTo(50, 24); g.fill();
    },
    armor: (g, l) => {
      g.fillStyle = U.shade(l.c1, 0.15); g.fillRect(0, 0, 128, 36);
      g.fillStyle = l.c2; BF.gfx.rr(g, 22, 44, 84, 60, 10); g.fill();
      g.fillStyle = '#ffc940'; g.beginPath(); g.moveTo(64, 52); g.lineTo(80, 66); g.lineTo(64, 96); g.lineTo(48, 66); g.fill();
    },
    galaxy: (g, l) => {
      const gr = g.createRadialGradient(70, 64, 4, 70, 64, 60); gr.addColorStop(0, '#ffd2f5'); gr.addColorStop(0.35, l.c2); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      const r = U.rng('gal' + l.c1); g.fillStyle = '#fff'; for (let i = 0; i < 26; i++) g.fillRect(r() * 128, r() * 128, 2, 2);
    },
  };

  function shirtTex(sl, jl) {
    const key = 'shirt:' + JSON.stringify(sl) + '|' + JSON.stringify(jl || null);
    return g3().canvasTex(key, 128, 128, (g) => {
      g.fillStyle = sl.c1 || '#23a699'; g.fillRect(0, 0, 128, 128);
      (SHIRT_ART[sl.style] || SHIRT_ART.logo)(g, Object.assign({ c1: '#23a699', c2: '#ffb454' }, sl));
      if (jl) {
        const jc = jl.c1 || '#39414f', jc2 = jl.c2 || '#ffffff';
        if (jl.style === 'puffer') {
          g.fillStyle = jc; g.fillRect(0, 0, 128, 128); g.fillStyle = jc2; for (const y of [30, 62, 94]) g.fillRect(0, y, 128, 5);
          g.fillStyle = U.shade(jc, -0.3); g.fillRect(61, 0, 6, 128);
        } else {
          g.fillStyle = jc; g.fillRect(0, 0, 44, 128); g.fillRect(84, 0, 44, 128);
          if (jl.style === 'bomber') { g.fillStyle = jc2; g.fillRect(0, 116, 128, 12); g.fillRect(40, 0, 5, 116); g.fillRect(83, 0, 5, 116); }
          if (jl.style === 'leather') { g.fillStyle = jc2; g.beginPath(); g.moveTo(44, 0); g.lineTo(26, 22); g.lineTo(44, 32); g.fill(); g.beginPath(); g.moveTo(84, 0); g.lineTo(102, 22); g.lineTo(84, 32); g.fill(); }
          if (jl.style === 'lab') { g.fillStyle = jc2; g.fillRect(10, 70, 22, 16); }
          if (jl.style === 'vest') { g.strokeStyle = jc2; g.lineWidth = 3; g.beginPath(); g.moveTo(14, 20); g.lineTo(14, 60); g.lineTo(30, 60); g.lineTo(30, 100); g.moveTo(114, 20); g.lineTo(114, 50); g.lineTo(98, 50); g.lineTo(98, 104); g.stroke(); }
        }
      }
    });
  }

  function pantsTex(pl) {
    return g3().canvasTex('pants:' + JSON.stringify(pl), 64, 128, (g) => {
      const c = pl.c1 || '#2f4a7a';
      g.fillStyle = c; g.fillRect(0, 0, 64, 128);
      if (pl.style === 'jeans') { g.fillStyle = U.shade(c, 0.12); g.fillRect(8, 60, 48, 22); g.strokeStyle = U.shade(c, 0.3); g.lineWidth = 2; g.beginPath(); g.moveTo(10, 10); g.quadraticCurveTo(24, 18, 34, 10); g.stroke(); }
      if (pl.style === 'cargo') { g.fillStyle = U.shade(c, -0.2); BF.gfx.rr(g, 12, 44, 40, 30, 4); g.fill(); g.fillStyle = U.shade(c, -0.35); g.fillRect(12, 44, 40, 6); }
      if (pl.style === 'track') { g.fillStyle = pl.c2 || '#fff'; g.fillRect(0, 0, 8, 128); }
      if (pl.style === 'armor') { g.fillStyle = pl.c2 || '#9aa5b5'; BF.gfx.rr(g, 6, 56, 52, 22, 6); g.fill(); g.fillStyle = U.shade(c, -0.3); g.fillRect(0, 0, 64, 14); }
    });
  }

  // ------------------------------------------------------------ shapes

  let starGeo = null, wingGeo = null, triGeo = null, sqRing = null, arcGeo = null;
  function star() {
    if (starGeo) return starGeo;
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.22 : 0.5, a = PI / 2 + i * PI / 5; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) s.lineTo(x, y); else s.moveTo(x, y); }
    starGeo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false });
    starGeo.userData.shared = true;
    return starGeo;
  }
  function wing() {
    if (wingGeo) return wingGeo;
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.bezierCurveTo(0.6, 1.1, 1.7, 1.3, 2.3, 0.9); s.bezierCurveTo(2.0, 0.4, 2.2, -0.2, 1.8, -0.5); s.bezierCurveTo(1.3, -0.3, 1.1, -0.9, 0.6, -0.8); s.bezierCurveTo(0.4, -0.4, 0.2, -0.3, 0, 0);
    wingGeo = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false });
    wingGeo.userData.shared = true;
    return wingGeo;
  }
  function tri() {
    if (triGeo) return triGeo;
    const s = new THREE.Shape(); s.moveTo(-0.5, 0.25); s.lineTo(0.5, 0.25); s.lineTo(0, -0.5); s.lineTo(-0.5, 0.25);
    triGeo = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false });
    triGeo.userData.shared = true;
    return triGeo;
  }
  function squareRing() {
    if (sqRing) return sqRing;
    sqRing = new THREE.TorusGeometry(0.22, 0.04, 4, 4);
    sqRing.rotateZ(PI / 4);
    sqRing.userData.shared = true;
    return sqRing;
  }
  function arc() {
    if (arcGeo) return arcGeo;
    arcGeo = new THREE.TorusGeometry(0.74, 0.07, 8, 24, PI);
    arcGeo.userData.shared = true;
    return arcGeo;
  }

  // ------------------------------------------------------------ rig

  function Rig(av, opts) {
    opts = opts || {};
    this.av = normalize(av);
    this.opts = opts;
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.anims = [];
    this.state = { move: 0, air: false, mode: 'idle', attack: 0, face: 0 };
    this.phase = Math.random() * 6;
    this.t = 0;
    this.emoteT = 0;
    this.emoteName = null;
    this.emoteDur = 0;
    this.extra = [];
    this.build();
  }

  Rig.prototype = {
    m(kind, color, o) { return BF.g3d.mat(color, o); },

    part(parent, kind, sx, sy, sz, x, y, z, color, o) {
      const mesh = new THREE.Mesh(o && o.geometry ? o.geometry : BF.g3d.geo(kind), o && o.material ? o.material : BF.g3d.mat(color, o));
      mesh.scale.set(sx, sy, sz);
      mesh.position.set(x, y, z);
      mesh.castShadow = !(o && o.noShadow) && sx * sy * sz > 0.25;
      mesh.receiveShadow = false;
      parent.add(mesh);
      return mesh;
    },

    build() {
      const eq = this.av.equipped || {};
      const get = (slot) => lookOf(eq[slot]);
      const skin = this.av.skin || BF.STARTER_SKIN;
      this.skin = skin;
      const headL = get('head') || { shape: 'block' };
      const faceL = get('face') || { style: 'smile' };
      const hairL = get('hair');
      const shirtL = get('shirt') || lookOf('shirt_forge') || { style: 'logo', c1: '#23a699', c2: '#ffb454' };
      const pantsL = get('pants') || lookOf('pants_denim') || { style: 'jeans', c1: '#2f4a7a' };
      const jacketL = get('jacket');
      const shoesL = get('shoes');
      const hatL = get('hat');
      const backL = get('back');
      const neckL = get('neck');
      const shL = get('shoulder');
      const accL = get('accessory');
      const animIt = eq.animation && BF.ITEMS[eq.animation];
      this.style = (animIt && animIt.look && animIt.look.anim) || 'idle';

      const B = this.body;
      const sleeve = jacketL && jacketL.style !== 'vest' ? jacketL.c1 : shirtL.c1;
      // plain boxes plus a textured front plane: 2 draw calls instead of 6 per box
      const decal = (parent, tex, w, h, x, y, z) => {
        const m = new THREE.Mesh(BF.g3d.geo('plane'), BF.g3d.mat('#ffffff', { map: tex }));
        m.scale.set(w, h, 1);
        m.position.set(x, y, z);
        parent.add(m);
        return m;
      };

      // legs
      this.legs = [-1, 1].map((sd) => {
        const pivot = new THREE.Group();
        pivot.position.set(sd * 0.5, 2, 0);
        B.add(pivot);
        const shorts = pantsL.style === 'shorts';
        const lh = shorts ? 0.85 : 2;
        this.part(pivot, 'box', 0.98, lh, 1, 0, -lh / 2, 0, pantsL.c1 || '#2f4a7a');
        if (!shorts) decal(pivot, pantsTex(pantsL), 0.98, 2, 0, -1, 0.503);
        if (pantsL.style === 'track') this.part(pivot, 'box', 0.04, 2, 0.3, sd * 0.5, -1, 0, pantsL.c2 || '#ffffff', { noShadow: true });
        if (shorts) this.part(pivot, 'box', 0.9, 1.15, 0.92, 0, -1.43, 0, U.shade(skin, sd > 0 ? -0.04 : 0));
        this.shoe(pivot, shoesL);
        return pivot;
      });

      // torso
      const puffy = jacketL && jacketL.style === 'puffer';
      const tw = puffy ? 2.12 : 2, td = puffy ? 1.14 : 1;
      this.torso = this.part(B, 'box', tw, 2, td, 0, 3, 0, jacketL ? jacketL.c1 : shirtL.c1);
      decal(B, shirtTex(shirtL, jacketL), tw, 2, 0, 3, td / 2 + 0.004);
      if (jacketL && jacketL.style === 'lab') this.part(B, 'box', 2.04, 0.9, 1.04, 0, 1.6, 0, jacketL.c1);
      this.part(B, 'box', 0.7, 0.2, 0.6, 0, 4.05, 0, U.shade(skin, -0.1));

      // arms
      this.arms = [-1, 1].map((sd) => {
        const pivot = new THREE.Group();
        pivot.position.set(sd * 1.5, 3.9, 0);
        B.add(pivot);
        this.part(pivot, 'box', puffy ? 1.08 : 1, 1.6, puffy ? 1.08 : 1, 0, -0.7, 0, sleeve);
        if (jacketL && jacketL.style === 'bomber') this.part(pivot, 'box', 1.02, 0.22, 1.02, 0, -1.4, 0, jacketL.c2 || '#fff');
        if (puffy) { for (const y of [-0.45, -0.95]) this.part(pivot, 'box', 1.1, 0.08, 1.1, 0, y, 0, jacketL.c2 || '#fff', { noShadow: true }); }
        this.part(pivot, 'box', 0.94, 0.42, 0.94, 0, -1.72, 0, skin);
        return pivot;
      });

      // head
      const head = new THREE.Group();
      head.position.set(0, 4, 0);
      B.add(head);
      this.head = head;
      this.buildHead(head, headL, faceL, skin, !!hatL && hatL.style === 'helmet');
      if (hairL && !(hatL && ['helmet', 'hood'].includes(hatL.style))) this.hair(head, hairL, !!hatL);
      if (hatL) this.hat(head, hatL);
      if (accL) this.acc(head, accL);
      if (neckL) this.neck(B, neckL);
      if (backL) this.back(B, backL);
      if (shL) this.shoulder(B, shL);
    },

    buildHead(head, hl, fl, skin, helmet) {
      const shape = hl.shape || 'block';
      const c1 = hl.c1 || skin;
      let front = 0.63;
      if (shape === 'round') { this.part(head, 'cyl', 1.28, 1.22, 1.28, 0, 0.66, 0, skin); front = 0.645; }
      else if (shape === 'pumpkin') {
        this.part(head, 'sphere', 1.5, 1.24, 1.42, 0, 0.66, 0, c1, { rough: 0.6 });
        for (const a of [-0.5, 0, 0.5]) { const r = this.part(head, 'sphere', 0.5, 1.2, 1.4, Math.sin(a) * 0.5, 0.66, 0, U.shade(c1, -0.12)); r.rotation.y = a; }
        this.part(head, 'box', 0.2, 0.36, 0.2, 0, 1.4, 0, '#4b7a2a');
        front = 0.72;
      } else if (shape === 'robot') {
        this.part(head, 'box', 1.3, 1.26, 1.3, 0, 0.66, 0, c1, { metal: 0.4, rough: 0.45 });
        this.part(head, 'box', 1.32, 0.2, 1.32, 0, 1.2, 0, U.shade(c1, 0.2), { metal: 0.4 });
        this.part(head, 'cylLo', 0.06, 0.5, 0.06, 0, 1.55, 0, U.shade(c1, -0.3));
        const bulb = this.part(head, 'sphereLo', 0.22, 0.22, 0.22, 0, 1.82, 0, '#ff5a6a', { glow: 1 });
        this.anims.push((t) => { bulb.material = BF.g3d.mat('#ff5a6a', { glow: Math.sin(t * 5) > 0 ? 1.2 : 0.2 }); });
        front = 0.655;
      } else if (shape === 'crystal') {
        const c = this.part(head, 'octa', 1.5, 1.7, 1.5, 0, 0.7, 0, c1, { opacity: 0.9, glow: 0.35, rough: 0.2, flat: true });
        this.anims.push((t) => { c.rotation.y = t * 0.6; });
        front = 0.6;
      } else if (shape === 'void') {
        this.part(head, 'box', 1.26, 1.26, 1.26, 0, 0.66, 0, c1, { rough: 0.3 });
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(BF.g3d.geo('box')), new THREE.LineBasicMaterial({ color: hl.c2 || '#b67cff' }));
        e.scale.set(1.28, 1.28, 1.28); e.position.set(0, 0.66, 0); head.add(e); this.extra.push(e.geometry, e.material);
        const r = U.rng('void');
        for (let i = 0; i < 6; i++) this.part(head, 'box', 0.05, 0.05, 0.05, (r() - 0.5) * 1.1, 0.2 + r() * 0.9, 0.64, '#ffffff', { basic: true, noShadow: true });
        front = 0.64;
      } else {
        this.part(head, 'box', 1.25, 1.25, 1.25, 0, 0.66, 0, skin);
      }
      const faceStyle = fl.style || 'smile';
      if (!(shape === 'crystal')) {
        const tex = faceTex(faceStyle);
        const fm = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.1, roughness: 0.8, emissive: faceStyle === 'robot' ? new THREE.Color('#39f3ff') : new THREE.Color(0), emissiveMap: faceStyle === 'robot' ? tex : null, emissiveIntensity: 0.9, depthWrite: false });
        this.extra.push(fm);
        const face = new THREE.Mesh(BF.g3d.geo('plane'), fm);
        face.scale.set(1.12, 1.12, 1);
        face.position.set(0, 0.64, front + 0.012);
        head.add(face);
        this.face = face;
      }
    },

    hair(head, hl, hatOn) {
      const c = hl.c1 || '#5a3a22';
      const cap = () => this.part(head, 'box', 1.33, 0.34, 1.33, 0, 1.22, -0.02, c);
      switch (hl.style) {
        case 'spiky':
          cap();
          if (!hatOn) for (let i = 0; i < 7; i++) { const a = (i / 7) * PI * 2; const s = this.part(head, 'cone4', 0.36, 0.7, 0.36, Math.cos(a) * 0.38, 1.55, Math.sin(a) * 0.38 - 0.05, c); s.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }
          break;
        case 'long':
          cap(); this.part(head, 'box', 1.36, 1.7, 0.28, 0, 0.4, -0.62, c); this.part(head, 'box', 0.18, 1.2, 1.1, -0.66, 0.62, -0.08, c); this.part(head, 'box', 0.18, 1.2, 1.1, 0.66, 0.62, -0.08, c);
          break;
        case 'bun':
          cap(); if (!hatOn) this.part(head, 'sphere', 0.62, 0.62, 0.62, 0, 1.58, -0.25, c);
          break;
        case 'mohawk':
          if (!hatOn) this.part(head, 'box', 0.3, 0.62, 1.28, 0, 1.55, -0.02, c); this.part(head, 'box', 1.29, 0.08, 1.29, 0, 1.28, 0, U.shade(c, -0.35));
          break;
        case 'curly':
          for (let i = 0; i < 9; i++) { const a = (i / 9) * PI * 2; this.part(head, 'sphereLo', 0.55, 0.55, 0.55, Math.cos(a) * 0.52, 1.18 + (i % 2) * 0.08, Math.sin(a) * 0.5 - 0.05, c); }
          this.part(head, 'sphere', 1.1, 0.6, 1.1, 0, 1.3, 0, c);
          break;
        case 'ponytail': {
          cap(); this.part(head, 'box', 1.33, 0.7, 0.2, 0, 0.9, -0.62, c);
          const tail = this.part(head, 'box', 0.32, 1.0, 0.32, 0, 0.6, -0.9, U.shade(c, -0.1)); tail.rotation.x = 0.35;
          this.anims.push((t, rig) => { tail.rotation.x = 0.35 + Math.sin(t * 3) * 0.08 + rig.state.move * 0.4; });
          break;
        }
        default:
          cap(); this.part(head, 'box', 1.33, 0.75, 0.2, 0, 0.92, -0.62, c); this.part(head, 'box', 0.14, 0.45, 0.4, -0.66, 0.98, 0.3, c); this.part(head, 'box', 0.14, 0.45, 0.4, 0.66, 0.98, 0.3, c);
      }
    },

    hat(head, l) {
      const c1 = l.c1 || '#ff7a2e', c2 = l.c2 || '#ffffff';
      switch (l.style) {
        case 'cap':
          this.part(head, 'sphere', 1.38, 0.72, 1.38, 0, 1.26, 0, c1);
          this.part(head, 'box', 1.2, 0.08, 0.72, 0, 1.24, 0.86, c2);
          this.part(head, 'sphereLo', 0.14, 0.1, 0.14, 0, 1.62, 0, U.shade(c1, -0.2));
          break;
        case 'beanie':
          this.part(head, 'sphere', 1.42, 1.0, 1.42, 0, 1.22, 0, c1);
          this.part(head, 'cyl', 1.44, 0.3, 1.44, 0, 1.1, 0, c2);
          this.part(head, 'sphere', 0.36, 0.36, 0.36, 0, 1.78, 0, c2);
          break;
        case 'explorer':
          this.part(head, 'cyl', 2.3, 0.06, 2.3, 0, 1.28, 0, U.shade(c1, -0.08));
          this.part(head, 'cyl', 1.44, 0.62, 1.44, 0, 1.6, 0, c1);
          this.part(head, 'cyl', 1.47, 0.14, 1.47, 0, 1.36, 0, c2);
          break;
        case 'ears':
          this.part(head, 'box', 1.36, 0.14, 0.4, 0, 1.3, 0, c1);
          for (const s of [-1, 1]) { this.part(head, 'box', 0.34, 0.95, 0.16, s * 0.42, 1.78, 0, c1); this.part(head, 'box', 0.18, 0.7, 0.04, s * 0.42, 1.78, 0.09, c2, { noShadow: true }); }
          break;
        case 'headphones': {
          const a = new THREE.Mesh(arc(), BF.g3d.mat(c1)); a.position.set(0, 0.62, 0); head.add(a);
          for (const s of [-1, 1]) { const cup = this.part(head, 'cyl', 0.56, 0.24, 0.56, s * 0.72, 0.62, 0, c1); cup.rotation.z = PI / 2; const pad = this.part(head, 'cyl', 0.36, 0.04, 0.36, s * 0.85, 0.62, 0, c2, { glow: 0.5 }); pad.rotation.z = PI / 2; }
          break;
        }
        case 'hood':
          this.part(head, 'box', 1.52, 0.14, 1.5, 0, 1.36, -0.04, c1);
          this.part(head, 'box', 1.52, 1.4, 0.14, 0, 0.66, -0.72, c1);
          for (const s of [-1, 1]) this.part(head, 'box', 0.14, 1.4, 1.4, s * 0.72, 0.66, -0.05, c1);
          this.part(head, 'box', 0.05, 0.5, 0.05, -0.3, 0.2, 0.7, c2); this.part(head, 'box', 0.05, 0.5, 0.05, 0.3, 0.2, 0.7, c2);
          break;
        case 'wizard': {
          this.part(head, 'cyl', 2.3, 0.07, 2.3, 0, 1.3, 0, c1);
          const cone = this.part(head, 'cone', 1.4, 2.1, 1.4, 0, 2.35, -0.05, c1); cone.rotation.x = -0.12;
          this.part(head, 'cyl', 1.46, 0.16, 1.46, 0, 1.42, 0, c2);
          for (const p of [[-0.3, 1.9, 0.52], [0.2, 2.5, 0.35]]) { const s = new THREE.Mesh(star(), BF.g3d.mat(c2, { glow: 0.6 })); s.scale.setScalar(0.34); s.position.set(p[0], p[1], p[2]); head.add(s); }
          break;
        }
        case 'blockcrown':
          for (const [x, z, w, d] of [[0, 0.62, 1.34, 0.12], [0, -0.62, 1.34, 0.12], [0.62, 0, 0.12, 1.34], [-0.62, 0, 0.12, 1.34]]) this.part(head, 'box', w, 0.36, d, x, 1.46, z, c1, { metal: 0.6, rough: 0.35 });
          for (const x of [-0.5, 0, 0.5]) { this.part(head, 'box', 0.28, 0.32, 0.12, x, 1.8, 0.62, c1, { metal: 0.6, rough: 0.35 }); this.part(head, 'box', 0.12, 0.12, 0.06, x, 1.5, 0.7, c2, { glow: 0.5 }); }
          break;
        case 'viking':
          this.part(head, 'sphere', 1.4, 0.78, 1.4, 0, 1.24, 0, c1, { metal: 0.5, rough: 0.4 });
          this.part(head, 'cyl', 1.44, 0.18, 1.44, 0, 1.14, 0, U.shade(c1, -0.2), { metal: 0.5 });
          for (const s of [-1, 1]) { const h = this.part(head, 'cone', 0.3, 0.95, 0.3, s * 0.85, 1.55, 0, c2); h.rotation.z = -s * 0.9; }
          break;
        case 'horns':
          for (const s of [-1, 1]) { const h = this.part(head, 'cone', 0.3, 0.8, 0.3, s * 0.42, 1.62, 0, c1); h.rotation.z = -s * 0.35; this.part(head, 'cone', 0.12, 0.2, 0.12, s * 0.56, 1.98, 0, c2); }
          break;
        case 'helmet': {
          this.part(head, 'sphere', 2.05, 2.0, 2.05, 0, 0.66, 0, c2, { opacity: 0.28, rough: 0.05, noShadow: true, depthWrite: false });
          const ring = this.part(head, 'torus', 1.6, 1.6, 1.6, 0, -0.08, 0, '#9aa5b5', { metal: 0.6 }); ring.rotation.x = PI / 2;
          break;
        }
        case 'crown':
          this.part(head, 'cyl', 1.44, 0.34, 1.44, 0, 1.4, 0, c1, { metal: 0.7, rough: 0.3 });
          for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; this.part(head, 'cone', 0.22, 0.4, 0.22, Math.sin(a) * 0.62, 1.75, Math.cos(a) * 0.62, c1, { metal: 0.7, rough: 0.3 }); }
          this.part(head, 'sphereLo', 0.2, 0.2, 0.2, 0, 1.42, 0.74, c2, { glow: 0.4 });
          this.part(head, 'sphereLo', 0.16, 0.16, 0.16, 0.52, 1.42, 0.52, '#46a8ff', { glow: 0.4 });
          this.part(head, 'sphereLo', 0.16, 0.16, 0.16, -0.52, 1.42, 0.52, '#4ad17f', { glow: 0.4 });
          break;
        case 'halo': {
          const h = new THREE.Group(); h.position.set(0, 1.95, 0); head.add(h);
          const ring = this.part(h, 'torus', 1.6, 1.6, 1.6, 0, 0, 0, c1, { glow: 1.2, noShadow: true }); ring.rotation.x = PI / 2;
          for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2; this.part(h, 'cone4', 0.12, 0.3, 0.12, Math.sin(a) * 0.8, 0.18, Math.cos(a) * 0.8, c2, { glow: 0.8, noShadow: true }); }
          this.anims.push((t) => { h.rotation.y = t * 0.8; h.position.y = 1.95 + Math.sin(t * 2.4) * 0.07; });
          break;
        }
        default:
          this.part(head, 'box', 1.36, 0.4, 1.36, 0, 1.4, 0, c1);
      }
    },

    acc(head, l) {
      const c1 = l.c1 || '#1b1b22', c2 = l.c2 || '#39f3ff';
      const z = 0.66;
      switch (l.style) {
        case 'monocle': {
          const r = this.part(head, 'torus', 0.44, 0.44, 0.44, 0.26, 0.7, z + 0.03, c1, { metal: 0.6 });
          this.part(head, 'disc', 0.38, 0.38, 1, 0.26, 0.7, z + 0.02, '#c8e6ff', { opacity: 0.3, noShadow: true });
          this.part(head, 'box', 0.02, 0.5, 0.02, 0.44, 0.35, z + 0.03, c1, { noShadow: true });
          r.rotation.set(0, 0, 0);
          break;
        }
        case 'starshades':
          for (const x of [-0.26, 0.26]) { const s = new THREE.Mesh(star(), BF.g3d.mat(c1, { glow: 0.3 })); s.scale.setScalar(0.42); s.position.set(x, 0.7, z); head.add(s); }
          this.part(head, 'box', 0.14, 0.04, 0.04, 0, 0.72, z + 0.02, INK);
          break;
        case 'goggles': {
          const strap = this.part(head, 'torus', 1.34, 1.34, 1.6, 0, 0.72, 0, c1); strap.rotation.x = PI / 2;
          for (const x of [-0.26, 0.26]) { const lens = this.part(head, 'cyl', 0.44, 0.14, 0.44, x, 0.72, z + 0.02, c1); lens.rotation.x = PI / 2; this.part(head, 'disc', 0.34, 0.34, 1, x, 0.72, z + 0.1, c2, { glow: 0.5, noShadow: true }); }
          break;
        }
        case 'visor':
          this.part(head, 'box', 1.18, 0.34, 0.12, 0, 0.72, z, INK);
          this.part(head, 'box', 1.04, 0.14, 0.04, 0, 0.72, z + 0.07, c1, { glow: 1.1, noShadow: true });
          break;
        case 'mask':
          this.part(head, 'box', 1.3, 0.42, 0.08, 0, 0.74, z, c1);
          for (const x of [-0.26, 0.26]) this.part(head, 'sphereLo', 0.24, 0.14, 0.04, x, 0.74, z + 0.05, c2, { glow: 1.2, noShadow: true });
          break;
        default:
          for (const x of [-0.26, 0.26]) { const f = new THREE.Mesh(squareRing(), BF.g3d.mat(c1)); f.position.set(x, 0.7, z + 0.02); head.add(f); }
          this.part(head, 'box', 0.14, 0.04, 0.04, 0, 0.72, z + 0.02, c1);
      }
    },

    shoe(pivot, l) {
      const c1 = (l && l.c1) || '#39414f', c2 = (l && l.c2) || '#ffffff';
      const st = (l && l.style) || 'sneaker';
      if (st === 'slipper') { this.part(pivot, 'sphere', 1.1, 0.5, 1.3, 0, -1.9, 0.1, c1); this.part(pivot, 'sphere', 0.35, 0.35, 0.35, 0, -1.75, 0.55, '#ffffff'); return; }
      const h = st === 'boot' ? 0.95 : st === 'hightop' || st === 'rocket' ? 0.72 : 0.42;
      this.part(pivot, 'box', 1.04, h, 1.2, 0, -2 + h / 2, 0.1, c1);
      this.part(pivot, 'box', 1.06, 0.12, 1.24, 0, -1.94, 0.1, st === 'sneaker' ? '#f2f2f2' : c2);
      if (st === 'sneaker') this.part(pivot, 'box', 0.6, 0.06, 0.04, 0, -1.72, 0.71, c2, { noShadow: true });
      if (st === 'rocket') {
        const fl = this.part(pivot, 'cone', 0.6, 0.8, 0.6, 0, -2.4, 0.1, c2, { glow: 1.4, noShadow: true }); fl.rotation.x = PI;
        this.anims.push((t) => { fl.scale.y = 0.6 + Math.random() * 0.4; });
      }
    },

    neck(B, l) {
      const c1 = l.c1 || '#e03e5a', c2 = l.c2 || '#ffffff';
      switch (l.style) {
        case 'scarf': {
          const r = this.part(B, 'torus', 1.5, 1.5, 2.4, 0, 3.98, 0, c1); r.rotation.x = PI / 2;
          this.part(B, 'box', 0.38, 1.1, 0.12, 0.45, 3.35, 0.58, c1); this.part(B, 'box', 0.4, 0.12, 0.13, 0.45, 3.1, 0.58, c2);
          break;
        }
        case 'bandana': { const t = new THREE.Mesh(tri(), BF.g3d.mat(c1)); t.scale.set(1.4, 1.2, 1); t.position.set(0, 3.72, 0.5); B.add(t); break; }
        case 'bowtie':
          for (const s of [-1, 1]) { const w = this.part(B, 'cone4', 0.3, 0.36, 0.14, s * 0.18, 3.86, 0.55, c1); w.rotation.z = s * PI / 2; }
          this.part(B, 'box', 0.12, 0.14, 0.1, 0, 3.86, 0.57, U.shade(c1, -0.25));
          break;
        case 'chain': {
          const r = this.part(B, 'torus', 1.2, 1.2, 0.5, 0, 3.72, 0.2, c1, { metal: 0.8, rough: 0.3 }); r.rotation.x = PI / 2 + 0.5;
          this.part(B, 'sphereLo', 0.28, 0.28, 0.16, 0, 3.3, 0.55, c1, { metal: 0.8, rough: 0.3 });
          break;
        }
        case 'medal':
          this.part(B, 'box', 0.14, 0.6, 0.04, -0.12, 3.7, 0.52, c2); this.part(B, 'box', 0.14, 0.6, 0.04, 0.12, 3.7, 0.52, U.shade(c2, -0.2));
          { const d = this.part(B, 'cyl', 0.42, 0.06, 0.42, 0, 3.3, 0.54, c1, { metal: 0.7, rough: 0.3 }); d.rotation.x = PI / 2; }
          break;
        default:
          this.part(B, 'box', 1.0, 0.2, 1.0, 0, 3.98, 0, c1);
      }
    },

    back(B, l) {
      const c1 = l.c1 || '#ff7a2e', c2 = l.c2 || '#ffffff';
      switch (l.style) {
        case 'wings': {
          const mt = BF.g3d.mat(c1, l.glow ? { glow: 0.7, opacity: 0.92 } : {});
          const ws = [-1, 1].map((s) => {
            const piv = new THREE.Group(); piv.position.set(s * 0.25, 3.4, -0.55); B.add(piv);
            const w = new THREE.Mesh(wing(), mt); w.scale.set(s * 1.2, 1.2, 1); w.castShadow = true; piv.add(w);
            return { piv, s };
          });
          this.anims.push((t, rig) => { const f = Math.sin(t * (rig.state.air ? 12 : 2.2)) * (rig.state.air ? 0.5 : 0.12); for (const w of ws) w.piv.rotation.y = w.s * (0.45 + f); });
          break;
        }
        case 'cape': {
          const piv = new THREE.Group(); piv.position.set(0, 3.95, -0.55); B.add(piv);
          this.part(piv, 'box', 1.9, 2.9, 0.06, 0, -1.45, 0, c1);
          this.part(piv, 'box', 1.95, 0.24, 0.1, 0, -0.06, 0, U.shade(c1, -0.2));
          this.anims.push((t, rig) => { piv.rotation.x = 0.08 + rig.state.move * 0.55 + Math.sin(t * 3) * 0.03 + (rig.state.air ? 0.4 : 0); });
          break;
        }
        case 'jetpack':
          for (const s of [-1, 1]) {
            this.part(B, 'cyl', 0.7, 1.4, 0.7, s * 0.45, 3.1, -0.85, c1, { metal: 0.4 });
            this.part(B, 'cyl', 0.5, 0.2, 0.5, s * 0.45, 2.3, -0.85, U.shade(c1, -0.3));
            const fl = this.part(B, 'cone', 0.46, 0.8, 0.46, s * 0.45, 1.8, -0.85, c2, { glow: 1.5, noShadow: true }); fl.rotation.x = PI;
            this.anims.push((t, rig) => { fl.scale.y = (rig.state.air ? 1.4 : 0.55) * (0.7 + Math.random() * 0.4); });
          }
          break;
        case 'sword': {
          const g = new THREE.Group(); g.position.set(0, 3.1, -0.62); g.rotation.z = 0.6; B.add(g);
          this.part(g, 'box', 0.18, 2.6, 0.06, 0, 0.5, 0, c1, { metal: 0.8, rough: 0.25 });
          this.part(g, 'box', 0.7, 0.14, 0.12, 0, -0.8, 0, '#ffc940', { metal: 0.6 });
          this.part(g, 'box', 0.14, 0.6, 0.14, 0, -1.15, 0, c2);
          break;
        }
        case 'shell':
          this.part(B, 'sphere', 2.1, 2.3, 1.1, 0, 3.0, -0.6, c1);
          this.part(B, 'sphere', 1.5, 1.7, 0.9, 0, 3.0, -0.78, c2, { opacity: 0.8 });
          break;
        default:
          this.part(B, 'box', 1.6, 1.5, 0.7, 0, 3.0, -0.84, U.shade(c1, -0.1));
          this.part(B, 'box', 1.2, 0.5, 0.2, 0, 2.6, -1.22, c1);
          for (const s of [-1, 1]) this.part(B, 'box', 0.18, 1.6, 0.1, s * 0.6, 3.2, 0.52, c2);
      }
    },

    shoulder(B, l) {
      const c1 = l.c1 || '#ffb454', c2 = l.c2 || '#ffffff';
      const P = new THREE.Group(); P.position.set(1.45, 4.05, 0); B.add(P);
      const eyes = (x, y, z, sp) => { for (const s of [-1, 1]) this.part(P, 'box', 0.07, 0.09, 0.04, x + s * (sp || 0.12), y, z, INK, { noShadow: true }); };
      switch (l.style) {
        case 'bird':
          this.part(P, 'sphere', 0.55, 0.7, 0.6, 0, 0.4, 0, c1); this.part(P, 'sphere', 0.42, 0.42, 0.42, 0, 0.85, 0.08, c1);
          { const b = this.part(P, 'cone', 0.14, 0.26, 0.14, 0, 0.84, 0.36, '#ffc940'); b.rotation.x = PI / 2; }
          eyes(0, 0.9, 0.28, 0.1);
          for (const s of [-1, 1]) this.part(P, 'box', 0.08, 0.4, 0.4, s * 0.3, 0.4, -0.02, c2);
          this.anims.push((t) => { P.position.y = 4.05 + Math.abs(Math.sin(t * 3)) * 0.08; });
          break;
        case 'drone': {
          P.position.set(1.2, 5.6, -0.2);
          this.part(P, 'box', 0.9, 0.24, 0.5, 0, 0, 0, c1, { metal: 0.4 });
          this.part(P, 'sphereLo', 0.2, 0.2, 0.2, 0, -0.14, 0.22, c2, { glow: 1.4, noShadow: true });
          const rotors = [];
          for (const [x, z] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]]) { rotors.push(this.part(P, 'box', 0.5, 0.02, 0.06, x, 0.18, z, '#e8ecf1', { noShadow: true })); }
          this.anims.push((t) => { rotors.forEach((r, i) => { r.rotation.y = t * 30 + i; }); P.position.y = 5.6 + Math.sin(t * 2) * 0.15; });
          break;
        }
        case 'pads':
          P.position.set(0, 4.05, 0);
          for (const s of [-1, 1]) { this.part(P, 'box', 1.2, 0.36, 1.12, s * 1.5, 0, 0, c1, { metal: 0.3 }); for (const z of [-0.25, 0.25]) this.part(P, 'cone4', 0.2, 0.42, 0.2, s * 1.6, 0.35, z, c2, { metal: 0.3 }); }
          break;
        default: {
          const fox = l.style === 'fox', dragon = l.style === 'dragon';
          this.part(P, 'box', 0.55, 0.42, 0.85, 0, 0.3, -0.05, c1);
          this.part(P, 'box', 0.5, 0.44, 0.46, 0, 0.66, 0.34, c1);
          for (const s of [-1, 1]) { const e = this.part(P, 'cone4', 0.2, 0.3, 0.14, s * 0.16, 0.98, 0.34, dragon ? c2 : c1); if (dragon) e.rotation.x = -0.4; }
          eyes(0, 0.72, 0.58);
          if (fox) { const n = this.part(P, 'box', 0.22, 0.16, 0.16, 0, 0.6, 0.62, c2); n.castShadow = false; }
          const tail = new THREE.Group(); tail.position.set(0, 0.35, -0.45); P.add(tail);
          this.part(tail, 'box', fox ? 0.3 : 0.12, fox ? 0.3 : 0.12, 0.7, 0, 0.18, -0.3, c1, fox ? { glow: 0.25 } : {});
          if (fox) this.part(tail, 'box', 0.3, 0.3, 0.18, 0, 0.18, -0.68, '#ffffff');
          if (dragon) for (const s of [-1, 1]) { const w = this.part(P, 'box', 0.5, 0.05, 0.4, s * 0.4, 0.62, -0.1, U.shade(c1, 0.2)); w.rotation.z = s * 0.5; }
          this.anims.push((t) => { tail.rotation.y = Math.sin(t * 3.2) * 0.5; P.rotation.y = Math.sin(t * 0.7) * 0.25; });
        }
      }
    },

    /** Put a tool in the right hand: 'pickaxe' | 'shovel' | 'sword' | 'blaster' | 'hammer' | 'bolt' | null. */
    hold(kind, color) {
      if (this.tool) { this.arms[1].remove(this.tool); this.tool = null; }
      if (!kind) return;
      const g = new THREE.Group(); g.position.set(0, -1.8, 0.3); g.rotation.x = PI / 2;
      const c = color || '#dfe7f2';
      if (kind === 'sword') { this.part(g, 'box', 0.16, 2.0, 0.08, 0, 1.2, 0, c, { metal: 0.8, rough: 0.25 }); this.part(g, 'box', 0.7, 0.14, 0.16, 0, 0.18, 0, '#ffc940'); this.part(g, 'box', 0.16, 0.5, 0.16, 0, -0.15, 0, '#6b4226'); }
      else if (kind === 'pickaxe') { this.part(g, 'box', 0.14, 2.0, 0.14, 0, 0.6, 0, '#8b5a2b'); const h = this.part(g, 'box', 1.4, 0.24, 0.22, 0, 1.55, 0, c, { metal: 0.5 }); h.rotation.z = 0.12; }
      else if (kind === 'shovel') { this.part(g, 'box', 0.14, 2.0, 0.14, 0, 0.7, 0, '#8b5a2b'); this.part(g, 'box', 0.6, 0.7, 0.06, 0, 1.9, 0, c, { metal: 0.6 }); }
      else if (kind === 'hammer') { this.part(g, 'box', 0.16, 1.8, 0.16, 0, 0.6, 0, '#8b5a2b'); this.part(g, 'box', 0.9, 0.55, 0.55, 0, 1.55, 0, c, { metal: 0.5 }); }
      else if (kind === 'blaster') { this.part(g, 'box', 0.34, 0.5, 1.0, 0, 0.2, 0.25, '#39414f'); this.part(g, 'box', 0.18, 0.18, 0.5, 0, 0.35, 0.9, c, { glow: 0.8 }); g.rotation.x = 0; g.position.set(0, -1.9, 0.4); }
      else if (kind === 'bolt') { for (let i = 0; i < 3; i++) { const b = this.part(g, 'box', 0.2, 0.6, 0.12, (i % 2 ? 0.12 : -0.12), 0.3 + i * 0.45, 0, c, { glow: 1.2 }); b.rotation.z = i % 2 ? -0.5 : 0.5; } }
      this.arms[1].add(g);
      this.tool = g;
    },

    // -------------------------------------------------------------- animation

    /** Per-frame state from the game: {move 0-1, air, mode:'idle'|'sit'|'swim'|'ko'|'fly'} */
    set(st) { Object.assign(this.state, st); return this; },

    /** One-shot actions: 'attack' (arm swing), 'hit' (flinch). */
    play(name) {
      if (name === 'attack') this.state.attack = 1;
      if (name === 'hit') this.state.hit = 1;
    },

    emote(name, dur) {
      this.emoteName = name;
      this.emoteT = 0;
      this.emoteDur = dur || ({ wave: 2.2, salute: 2, laugh: 2.2, cheer: 2.4, spin: 1.6, flex: 2.2, dance: 4, jacks: 3.2, robot: 3.6, meteor: 2.2 }[name] || 2.5);
    },

    /** Advance animation by dt seconds. */
    tick(dt) {
      this.t += dt;
      const S = this.state, st = this.style;
      const t = this.t;
      const [legL, legR] = this.legs, [armL, armR] = this.arms;
      const B = this.body;
      let mv = U.clamp(S.move || 0, 0, 1.4);
      const speed = st === 'bouncy' ? 1.2 : st === 'robotic' ? 0.9 : 1;
      this.phase += dt * (4 + 7 * mv) * speed;
      const sw = Math.sin(this.phase);
      let lL = 0, lR = 0, aL = 0, aR = 0, aLz = 0, aRz = 0, bodyY = 0, lean = 0, headX = 0, twist = 0;
      const idle = Math.sin(t * 2.1);
      if (S.mode === 'sit') { lL = lR = -PI / 2; aL = aR = -0.6; bodyY = -1.0; }
      else if (S.mode === 'swim') { aL = t * 8 % (PI * 2); aR = aL + PI; lL = Math.sin(t * 8) * 0.4; lR = -lL; lean = 1.1; bodyY = 0.3; }
      else if (S.mode === 'ko') { lL = 0.2; lR = -0.2; aL = -2.6; aR = -2.4; }
      else if (S.air) { lL = -0.55; lR = 0.35; aL = -2.8; aR = -2.8; aLz = -0.25; aRz = 0.25; }
      else if (mv > 0.05) {
        const k = Math.min(1, mv) * (st === 'ninja' ? 1.1 : 0.9);
        lL = sw * k; lR = -sw * k;
        if (st === 'ninja' && mv > 0.6) { aL = aR = 1.2; lean = 0.35; }
        else { aL = -sw * k * 0.9; aR = sw * k * 0.9; }
        bodyY = Math.abs(Math.cos(this.phase)) * 0.12 * k * (st === 'bouncy' ? 3 : 1);
        lean = lean || mv * 0.08;
      } else {
        aL = idle * 0.05; aR = -idle * 0.05; aLz = -0.06; aRz = 0.06;
        bodyY = idle * 0.03;
        if (st === 'bouncy') bodyY = Math.abs(Math.sin(t * 4)) * 0.25;
        if (st === 'ninja') { bodyY = -0.25; lL = -0.35; lR = 0.25; aL = 0.5; aR = -0.3; }
        if (st === 'hero') { aLz = -0.75; aRz = 0.75; aL = aR = -0.2; lean = -0.08; }
        if (st === 'float') { bodyY = 0.5 + Math.sin(t * 1.6) * 0.18; lL = 0.25; lR = 0.1; }
      }
      // attack swing (right arm)
      if (S.attack > 0) {
        const p = 1 - S.attack;
        aR = p < 0.35 ? -2.6 * (p / 0.35) : -2.6 + (p - 0.35) / 0.65 * 3.2;
        S.attack = Math.max(0, S.attack - dt * 4.2);
      }
      // emotes
      if (this.emoteName) {
        this.emoteT += dt;
        const e = this.emoteT, n = this.emoteName;
        if (e > this.emoteDur) this.emoteName = null;
        else if (n === 'wave') { aR = -2.8; aRz = 0.3 + Math.sin(e * 10) * 0.35; }
        else if (n === 'salute') { aR = -2.4; aRz = -0.9; headX = -0.1; }
        else if (n === 'laugh') { headX = -0.35; bodyY = Math.abs(Math.sin(e * 14)) * 0.1; aL = aR = -0.4; lean = -0.15; }
        else if (n === 'cheer') { aL = aR = -2.9 + Math.sin(e * 12) * 0.3; aLz = -0.3; aRz = 0.3; bodyY = Math.abs(Math.sin(e * 6)) * 0.4; }
        else if (n === 'spin') { twist = (e / this.emoteDur) * PI * 2; aLz = -1.2; aRz = 1.2; }
        else if (n === 'flex') { aL = aR = -1.6; aLz = -1.1; aRz = 1.1; bodyY = Math.sin(e * 5) * 0.05; }
        else if (n === 'dance') { const b = Math.sin(e * 8); aL = -1.6 + b * 0.8; aR = -1.6 - b * 0.8; lL = b * 0.3; lR = -b * 0.3; twist = b * 0.25; bodyY = Math.abs(b) * 0.2; }
        else if (n === 'jacks') { const b = (Math.sin(e * 9) + 1) / 2; aLz = -0.3 - b * 2.5; aRz = 0.3 + b * 2.5; lL = 0; lR = 0; legL.rotation.z = -b * 0.35; legR.rotation.z = b * 0.35; bodyY = b * 0.5; }
        else if (n === 'robot') { const q = Math.floor(e * 4) % 4; aL = [-1.6, 0, -1.6, -0.8][q]; aR = [0, -1.6, -0.8, -1.6][q]; twist = [0.3, -0.3, 0, 0.2][q]; headX = [0.1, -0.1, 0, 0][q]; }
        else if (n === 'meteor') { const p = e / this.emoteDur; bodyY = p < 0.5 ? Math.sin(p * PI) * 4 : Math.max(0, (1 - p) * 2 - 0.2); aL = aR = p < 0.5 ? -2.8 : 0.4; lL = lR = p < 0.5 ? -0.4 : 0; }
      } else { legL.rotation.z = 0; legR.rotation.z = 0; }
      if (st === 'robotic') { const qz = (v) => Math.round(v / 0.26) * 0.26; lL = qz(lL); lR = qz(lR); aL = qz(aL); aR = qz(aR); }
      if (S.hit > 0) { lean -= S.hit * 0.3; S.hit = Math.max(0, S.hit - dt * 5); }
      legL.rotation.x = lL; legR.rotation.x = lR;
      armL.rotation.x = aL; armR.rotation.x = aR;
      armL.rotation.z = aLz; armR.rotation.z = aRz;
      B.position.y = bodyY;
      B.rotation.x = lean;
      B.rotation.y = twist;
      this.head.rotation.x = headX;
      if (S.mode === 'ko') { this.group.rotation.x = -PI / 2; } else if (this.group.rotation.x) this.group.rotation.x = 0;
      for (const a of this.anims) a(t, this);
    },

    /** Face a 2D game angle (0 = +x, y down): the rig's +Z turns towards (cos a, sin a). */
    faceAngle(a) { this.group.rotation.y = PI / 2 - a; },

    setPos(x, y, z) { this.group.position.set(x, y, z); },

    dispose() {
      for (const r of this.extra) if (r && r.dispose) r.dispose();
      this.extra.length = 0;
    },
  };

  BF.char3d = {
    build(av, opts) { return new Rig(av, opts); },
    normalize,
  };

  // ------------------------------------------------------------ thumbnails

  const CROPS = {
    // [aspect w/h, focus y (rig units), view height (rig units)]
    full: [128 / 176, 3.05, 7.6],
    bust: [88 / 100, 4.55, 3.1],
    head: [68 / 72, 4.78, 2.2],
    hat: [88 / 92, 5.05, 3.1],
    shot: [1, 4.62, 2.5],
  };

  let thumbR = null, thumbScene = null, thumbCam = null;
  const imgCache = new Map();
  const queue = new Map();
  let pumping = false;
  const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  function thumbSetup() {
    if (thumbR) return true;
    if (!BF.g3d || !BF.g3d.supported()) return false;
    thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbR.outputColorSpace = THREE.SRGBColorSpace;
    thumbR.setClearColor(0x000000, 0);
    thumbScene = new THREE.Scene();
    thumbScene.add(new THREE.HemisphereLight(0xf2f6ff, 0x4a4050, 1.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 8, 7); thumbScene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 1.1); rim.position.set(-6, 5, -6); thumbScene.add(rim);
    thumbCam = new THREE.PerspectiveCamera(24, 1, 0.5, 200);
    return true;
  }

  function lookKey(av, o) {
    const a = normalize(av);
    return JSON.stringify([a.skin, a.equipped, o.crop || 'full', o.pose || '', o.px, o.yaw == null ? '' : o.yaw]);
  }

  function renderThumb(av, o) {
    const [aspect, fy, vh] = CROPS[o.crop || 'full'] || CROPS.full;
    const pxW = o.px, pxH = Math.round(o.px / aspect);
    const rig = new Rig(av);
    rig.group.rotation.y = o.yaw == null ? -0.42 : o.yaw;
    if (o.pose) { rig.emote(o.pose, 99); rig.emoteT = o.poseT == null ? 0.45 : o.poseT; }
    rig.tick(0);
    rig.t = 0.3;
    for (const f of rig.anims) f(0.3, rig);
    thumbScene.add(rig.group);
    thumbR.setPixelRatio(1);
    thumbR.setSize(pxW, pxH, false);
    thumbCam.aspect = aspect;
    const dist = (vh / 2) / Math.tan((thumbCam.fov * PI / 180) / 2);
    thumbCam.position.set(0, fy + vh * 0.12, dist);
    thumbCam.lookAt(0, fy, 0);
    thumbCam.updateProjectionMatrix();
    thumbR.render(thumbScene, thumbCam);
    const url = thumbR.domElement.toDataURL('image/png');
    thumbScene.remove(rig.group);
    rig.dispose();
    return url;
  }

  function pump() {
    pumping = true;
    const t0 = performance.now();
    for (const [k, job] of queue) {
      if (performance.now() - t0 > 12) break;
      queue.delete(k);
      let url;
      try { url = renderThumb(job.av, job.o); } catch (e) { console.warn('[avatar3d] thumbnail failed', e); url = null; }
      if (url) {
        imgCache.set(k, url);
        if (imgCache.size > 600) imgCache.delete(imgCache.keys().next().value);
        document.querySelectorAll('img[data-avk="' + job.h + '"]').forEach((img) => { img.src = url; img.classList.remove('pending'); });
      }
    }
    if (queue.size) requestAnimationFrame(pump);
    else pumping = false;
  }

  // ------------------------------------------------------------ live viewer

  const live = { r: null, scene: null, cam: null, rig: null, key: '', el: null, yaw: -0.3, drag: null, raf: 0, last: 0, auto: true, opts: {} };

  function liveSetup() {
    if (live.r) return true;
    if (!BF.g3d || !BF.g3d.supported()) return false;
    live.r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    live.r.outputColorSpace = THREE.SRGBColorSpace;
    live.r.setClearColor(0x000000, 0);
    live.r.shadowMap.enabled = true;
    live.r.domElement.className = 'av-live-canvas';
    live.scene = new THREE.Scene();
    live.scene.add(new THREE.HemisphereLight(0xf2f6ff, 0x4a4050, 1.8));
    const key = new THREE.DirectionalLight(0xffffff, 2.3); key.position.set(4, 10, 8); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -5, right: 5, top: 8, bottom: -2, near: 1, far: 40 });
    live.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 1.2); rim.position.set(-6, 6, -6); live.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3.2, 40), new THREE.ShadowMaterial({ opacity: 0.28 }));
    floor.rotation.x = -PI / 2; floor.receiveShadow = true; live.scene.add(floor);
    const disc = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.75, 48), new THREE.MeshBasicMaterial({ color: 0xff7a2e, transparent: true, opacity: 0.45 }));
    disc.rotation.x = -PI / 2; disc.position.y = 0.01; live.scene.add(disc);
    live.cam = new THREE.PerspectiveCamera(30, 1, 0.5, 100);
    const c = live.r.domElement;
    c.addEventListener('pointerdown', (e) => { live.drag = { x: e.clientX, yaw: live.yaw }; live.auto = false; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => { if (live.drag) live.yaw = live.drag.yaw + (e.clientX - live.drag.x) * 0.012; });
    const end = () => { live.drag = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.style.touchAction = 'pan-y';
    return true;
  }

  function liveLoop(now) {
    if (!live.el || !live.el.isConnected || !live.r.domElement.isConnected) { live.raf = 0; return; }
    const dt = Math.min(0.05, (now - (live.last || now)) / 1000);
    live.last = now;
    if (live.auto && !live.rig.emoteName) live.yaw += dt * 0.25;
    live.rig.group.rotation.y = live.yaw;
    live.rig.tick(dt);
    const w = live.el.clientWidth, h = live.el.clientHeight;
    if (w && h && (live.r.domElement.width !== Math.round(w * live.pr) || live.r.domElement.height !== Math.round(h * live.pr))) {
      live.r.setSize(w, h, false);
      live.cam.aspect = w / h;
      live.cam.updateProjectionMatrix();
    }
    live.r.render(live.scene, live.cam);
    live.raf = requestAnimationFrame(liveLoop);
  }

  BF.avatar3d = {
    /** True when 3D avatar rendering can be used for images. */
    available() { return !!(BF.g3d && BF.g3d.enabled && BF.g3d.enabled()); },

    /**
     * HTML for a 3D avatar image (rendered now if cached, else filled in shortly).
     * opts: {size, crop:'full'|'bust'|'head'|'hat', pose (emote name), cls, still}
     */
    image(av, opts) {
      opts = opts || {};
      const size = Number(opts.size) || 160;
      // small round chips read best as a head-and-shoulders shot
      const crop = opts.crop === 'bust' && size <= 64 ? 'shot' : opts.crop || 'full';
      const [aspect] = CROPS[crop] || CROPS.full;
      const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
      const px = Math.min(640, Math.max(64, Math.ceil((size * dpr) / 32) * 32));
      const o = { crop, pose: opts.emote || null, px, yaw: opts.yaw };
      const key = lookKey(av, o);
      const h = 'k' + U.hash(key).toString(36);
      const height = Math.round(size / aspect);
      const cls = 'avatar-3d crop-' + crop + (opts.cls ? ' ' + opts.cls : '');
      const cached = imgCache.get(key);
      if (cached) return '<img class="' + cls + '" src="' + cached + '" width="' + size + '" height="' + height + '" alt="" draggable="false">';
      if (!thumbSetup()) return null;
      queue.set(key, { av: normalize(av), o, h });
      if (!pumping) requestAnimationFrame(pump);
      return '<img class="' + cls + ' pending" data-avk="' + h + '" src="' + PLACEHOLDER + '" width="' + size + '" height="' + height + '" alt="" draggable="false">';
    },

    /**
     * Mount (or re-mount) the single live 3D viewer into `el`.
     * opts: {emote, autoRotate (default true), zoom:'full'|'bust'}
     */
    live(el, av, opts) {
      if (!el || !liveSetup()) return false;
      opts = opts || {};
      live.opts = opts;
      live.pr = Math.min(2, window.devicePixelRatio || 1);
      live.r.setPixelRatio(live.pr);
      const key = JSON.stringify(normalize(av));
      if (!live.rig || live.key !== key) {
        if (live.rig) { live.scene.remove(live.rig.group); live.rig.dispose(); }
        live.rig = new Rig(av);
        live.scene.add(live.rig.group);
        live.key = key;
      }
      const bust = opts.zoom === 'bust';
      live.cam.position.set(0, bust ? 4.4 : 3.6, bust ? 11 : 19);
      live.cam.lookAt(0, bust ? 4.1 : 2.9, 0);
      if (opts.emote) live.rig.emote(opts.emote);
      live.auto = opts.autoRotate !== false;
      el.innerHTML = '';
      el.appendChild(live.r.domElement);
      live.el = el;
      const w = el.clientWidth || 250, h = el.clientHeight || 300;
      live.r.setSize(w, h, false);
      live.cam.aspect = w / h;
      live.cam.updateProjectionMatrix();
      if (!live.raf) { live.last = 0; live.raf = requestAnimationFrame(liveLoop); }
      return true;
    },

    /** Play an emote on the live viewer. */
    liveEmote(name) { if (live.rig) { live.rig.emote(name); live.auto = false; live.yaw = 0; } },

    CROPS,
  };
})((window.BF = window.BF || {}));
