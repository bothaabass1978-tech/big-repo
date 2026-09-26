/**
 * BlockForge — shared 3D kit built on three.js (vendor/three.min.js, r159).
 *
 * Games keep their simulation in the same 2D coordinates they always used
 * (pixels on a 960×540 stage or a larger map). The 3D view maps a game point
 * (x, y) to world (X = x, Y = height, Z = y), so 1 world unit = 1 game pixel.
 * Side-view games map their own axes (see BF.g3d.World#side()).
 *
 *   BF.g3d.supported()     WebGL available and three.js loaded
 *   BF.g3d.enabled()       supported and not switched to Classic 2D in Settings
 *   BF.g3d.world(opts)     a scene bound to the shared game renderer
 *
 * A World offers: lights + sky + fog presets, cached materials, boxes and
 * batched (instanced) boxes, cube particles, 3D floating text and name tags
 * drawn on the HUD canvas, camera rigs (top-down, follow, side, orbit) with
 * shake, pointer-to-ground picking, and per-frame render.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const hasThree = () => typeof THREE !== 'undefined' && THREE.WebGLRenderer;

  let supportedCache = null;
  function supported() {
    if (supportedCache != null) return supportedCache;
    if (!hasThree() || typeof document === 'undefined') return (supportedCache = false);
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      supportedCache = !!gl;
      if (gl && gl.getExtension('WEBGL_lose_context')) gl.getExtension('WEBGL_lose_context').loseContext();
    } catch (e) {
      supportedCache = false;
    }
    return supportedCache;
  }

  function quality() {
    const s = BF.store && BF.store.state;
    const q = s && s.settings.gameplay.graphics;
    if (q === 'high' || q === 'low' || q === 'classic') return q;
    const small = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 600;
    return small ? 'low' : 'high';
  }

  // ------------------------------------------------------------ shared caches

  const cache = { mats: new Map(), geos: {}, tex: new Map() };

  function geo(name) {
    if (cache.geos[name]) return cache.geos[name];
    let g;
    switch (name) {
      case 'box': g = new THREE.BoxGeometry(1, 1, 1); break;
      case 'sphere': g = new THREE.SphereGeometry(0.5, 16, 12); break;
      case 'sphereLo': g = new THREE.SphereGeometry(0.5, 8, 6); break;
      case 'cyl': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 18); break;
      case 'cylLo': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 8); break;
      case 'cone': g = new THREE.ConeGeometry(0.5, 1, 16); break;
      case 'cone4': g = new THREE.ConeGeometry(0.5, 1, 4); break;
      case 'torus': g = new THREE.TorusGeometry(0.5, 0.12, 8, 24); break;
      case 'plane': g = new THREE.PlaneGeometry(1, 1); break;
      case 'ring': g = new THREE.RingGeometry(0.42, 0.5, 32); break;
      case 'disc': g = new THREE.CircleGeometry(0.5, 32); break;
      case 'octa': g = new THREE.OctahedronGeometry(0.5, 0); break;
      case 'ico': g = new THREE.IcosahedronGeometry(0.5, 0); break;
      case 'dodeca': g = new THREE.DodecahedronGeometry(0.5, 0); break;
      default: throw new Error('unknown geometry ' + name);
    }
    g.userData.shared = true;
    cache.geos[name] = g;
    return g;
  }

  /**
   * Cached material. opts: {emissive, glow(0-1), opacity, basic, rough, metal, flat, side, map, wire}
   */
  function mat(color, opts) {
    opts = opts || {};
    const key = [color, opts.emissive || '', opts.glow || 0, opts.opacity == null ? 1 : opts.opacity, opts.basic ? 1 : 0, opts.rough == null ? '' : opts.rough, opts.metal || 0, opts.side || 0, opts.map ? opts.map.uuid : '', opts.flat ? 1 : 0, opts.depthWrite === false ? 0 : 1].join('|');
    let m = cache.mats.get(key);
    if (m) return m;
    const base = { color: new THREE.Color(color == null ? '#ffffff' : color) };
    if (opts.map) base.map = opts.map;
    if (opts.opacity != null && opts.opacity < 1) { base.transparent = true; base.opacity = opts.opacity; }
    if (opts.side) base.side = opts.side === 2 ? THREE.DoubleSide : THREE.BackSide;
    if (opts.depthWrite === false) base.depthWrite = false;
    if (opts.basic) m = new THREE.MeshBasicMaterial(base);
    else {
      base.roughness = opts.rough == null ? 0.78 : opts.rough;
      base.metalness = opts.metal || 0;
      if (opts.flat) base.flatShading = true;
      if (opts.emissive || opts.glow) {
        base.emissive = new THREE.Color(opts.emissive || color);
        base.emissiveIntensity = opts.glow == null ? 0.6 : opts.glow;
      }
      m = new THREE.MeshStandardMaterial(base);
    }
    m.userData.shared = true;
    cache.mats.set(key, m);
    return m;
  }

  /** Cached canvas texture drawn once by fn(ctx2d, w, h). */
  function canvasTex(key, w, h, fn, opts) {
    let t = cache.tex.get(key);
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    fn(c.getContext('2d'), w, h);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (opts && opts.pixel) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
    if (opts && opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]); }
    t.userData.shared = true;
    cache.tex.set(key, t);
    return t;
  }

  function gradientTex(top, bottom, mid) {
    return canvasTex('grad:' + top + bottom + (mid || ''), 4, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, top);
      if (mid) gr.addColorStop(0.55, mid);
      gr.addColorStop(1, bottom);
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
  }

  /** Grid / checker floor texture. */
  function gridTex(base, line, cells, opts) {
    opts = opts || {};
    return canvasTex('grid:' + base + line + cells + (opts.check || '') + (opts.noise ? 'n' : ''), 256, 256, (g, w, h) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      if (opts.check) {
        g.fillStyle = opts.check;
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2) g.fillRect(i * w / 2, j * h / 2, w / 2, h / 2);
      }
      if (opts.noise) {
        const r = U.rng('noise' + base);
        for (let i = 0; i < 900; i++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '255,255,255' : '0,0,0') + ',' + (0.03 + r() * 0.05) + ')'; g.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4); }
      }
      g.strokeStyle = line;
      g.lineWidth = 3;
      const step = w / (cells || 1);
      for (let i = 0; i <= (cells || 1); i++) { g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, h); g.stroke(); g.beginPath(); g.moveTo(0, i * step); g.lineTo(w, i * step); g.stroke(); }
    }, { repeat: opts.repeat || [1, 1] });
  }

  // ------------------------------------------------------------ shared renderer

  let gameRenderer = null;
  function renderer() {
    if (gameRenderer) return gameRenderer;
    const q = quality();
    gameRenderer = new THREE.WebGLRenderer({ antialias: q !== 'low', powerPreference: 'high-performance' });
    gameRenderer.outputColorSpace = THREE.SRGBColorSpace;
    gameRenderer.shadowMap.enabled = true;
    gameRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    gameRenderer.domElement.className = 'gr-3d';
    gameRenderer.domElement.setAttribute('aria-hidden', 'true');
    gameRenderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); BF.g3d.lost = true; });
    return gameRenderer;
  }

  // ------------------------------------------------------------ particles

  /** Cube particles on one InstancedMesh. */
  function Fx(world, max) {
    this.w = world;
    this.max = max || 600;
    this.list = [];
    this.mesh = new THREE.InstancedMesh(geo('box'), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color('#ffffff'));
    world.scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._c = new THREE.Color();
  }
  Fx.prototype = {
    /**
     * Burst at (x, y, z) in world units. o: {count, color|colors, speed, life, size, gravity, up, spread}
     */
    emit(x, y, z, o) {
      o = o || {};
      const n = o.count || 10;
      for (let i = 0; i < n && this.list.length < this.max; i++) {
        const a = Math.random() * Math.PI * 2;
        const el = (o.up == null ? 0.5 : o.up) * (0.3 + Math.random() * 0.9);
        const sp = (o.speed || 120) * (0.4 + Math.random() * 0.8);
        const col = o.colors ? U.pick(o.colors) : o.color || '#ffffff';
        this.list.push({
          x, y, z,
          vx: Math.cos(a) * sp * (1 - el * 0.5), vy: sp * el + (o.lift || 0), vz: Math.sin(a) * sp * (1 - el * 0.5),
          life: (o.life || 0.6) * (0.6 + Math.random() * 0.6), t: 0,
          size: (o.size || 5) * (0.6 + Math.random() * 0.8),
          g: o.gravity == null ? 380 : o.gravity,
          rot: Math.random() * 6, spin: (Math.random() - 0.5) * 12,
          col,
        });
      }
    },
    update(dt) {
      const L = this.list;
      for (let i = L.length - 1; i >= 0; i--) {
        const p = L[i];
        p.t += dt;
        if (p.t >= p.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
        p.vy -= p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0 && p.g > 0) { p.y = 0; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
        p.rot += p.spin * dt;
      }
      const n = Math.min(L.length, this.max);
      for (let i = 0; i < n; i++) {
        const p = L[i];
        const k = p.size * (1 - p.t / p.life * 0.7);
        this._e.set(p.rot, p.rot * 0.7, 0);
        this._q.setFromEuler(this._e);
        this._s.set(k, k, k);
        this._p.set(p.x, p.y, p.z);
        this._m.compose(this._p, this._q, this._s);
        this.mesh.setMatrixAt(i, this._m);
        this.mesh.setColorAt(i, this._c.set(p.col));
      }
      this.mesh.count = n;
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    },
    clear() { this.list.length = 0; this.mesh.count = 0; },
  };

  // ------------------------------------------------------------ world

  const V = () => new THREE.Vector3();

  function World(opts) {
    opts = opts || {};
    this.q = quality();
    this.renderer = renderer();
    this.canvas = this.renderer.domElement;
    this.W = opts.W || 960;
    this.H = opts.H || 540;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(opts.fov || 45, this.W / this.H, opts.near || 4, opts.far || 9000);
    this.camera.position.set(480, 700, 900);
    this.camera.lookAt(480, 0, 270);
    this.camTarget = V().set(480, 0, 270);
    this.shakeT = 0;
    this.shakeMag = 0;
    this.labels = [];
    this.texts = [];
    this.owned = [];
    this.actors = new Map();
    this.time = 0;
    this._v = V();
    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.hemi = new THREE.HemisphereLight(0xdfeeff, 0x3a3226, 1.5);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    this.sun.position.set(300, 900, 500);
    this.sun.castShadow = this.q !== 'low';
    const sm = this.q === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.shadowSize(700);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.fx = new Fx(this, this.q === 'low' ? 300 : 700);
    this.preset(opts.preset || 'day');
  }

  World.prototype = {
    // ---------------------------------------------------------- environment

    /** Lighting / sky presets: day, dusk, night, space, cave, indoor, sunset, arena, underwater. */
    preset(name, o) {
      o = o || {};
      const P = {
        day: { top: '#5fa8ff', bottom: '#cfe8ff', fog: '#cfe8ff', hemi: ['#e8f3ff', '#5a5040', 1.6], sun: ['#fff6e6', 2.6] },
        sunset: { top: '#2b3a7a', mid: '#ff8a5c', bottom: '#ffd29a', fog: '#f4b98a', hemi: ['#ffd9b8', '#3a2a40', 1.4], sun: ['#ffb070', 2.4] },
        dusk: { top: '#141a3a', mid: '#4a3a7a', bottom: '#9a6aa8', fog: '#4a3f6e', hemi: ['#a9b4ff', '#2a2030', 1.2], sun: ['#c8b8ff', 1.6] },
        night: { top: '#05070f', bottom: '#15203a', fog: '#10182c', hemi: ['#7a8cc8', '#101018', 0.9], sun: ['#9fb4ff', 1.1] },
        space: { top: '#020309', bottom: '#0b0f24', fog: null, hemi: ['#a0b4ff', '#140c20', 1.1], sun: ['#ffffff', 2.2], stars: true },
        cave: { top: '#0b0a0c', bottom: '#1a1614', fog: '#140f0c', hemi: ['#b89a7a', '#1a1410', 1.0], sun: ['#ffd9a8', 1.3] },
        indoor: { top: '#1a1622', bottom: '#2a2432', fog: '#1d1826', hemi: ['#ffe8cc', '#2a2030', 1.3], sun: ['#ffe1b0', 1.8] },
        arena: { top: '#101624', bottom: '#243148', fog: '#18202f', hemi: ['#dfe8ff', '#20242e', 1.5], sun: ['#ffffff', 2.4] },
        underwater: { top: '#0a3a5a', bottom: '#1a7a9a', fog: '#1a6a8a', hemi: ['#bfefff', '#0a2a3a', 1.4], sun: ['#dff8ff', 1.8] },
      };
      const p = Object.assign({}, P[name] || P.day, o);
      this.scene.background = gradientTex(p.top, p.bottom, p.mid);
      this.scene.fog = p.fog && o.fog !== false ? new THREE.Fog(p.fog, o.fogNear || 1400, o.fogFar || 4200) : null;
      this.hemi.color.set(p.hemi[0]);
      this.hemi.groundColor.set(p.hemi[1]);
      this.hemi.intensity = p.hemi[2];
      this.sun.color.set(p.sun[0]);
      this.sun.intensity = p.sun[1];
      if (p.stars && !this._stars) this.stars();
      return this;
    },

    /** Shadow camera half-size (world units) around the focus point. */
    shadowSize(r) {
      const c = this.sun.shadow.camera;
      c.left = -r; c.right = r; c.top = r; c.bottom = -r;
      c.near = 10; c.far = 3000;
      c.updateProjectionMatrix();
      this._shadowR = r;
    },

    /** A field of star points on a big sphere. */
    stars(n) {
      const g = new THREE.BufferGeometry();
      const pts = [];
      const r = U.rng('stars');
      for (let i = 0; i < (n || 900); i++) {
        const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), R = 5200;
        pts.push(Math.cos(th) * s * R, Math.abs(u) * R * 0.9 + 200, Math.sin(th) * s * R);
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false }));
      this.owned.push(g);
      this.scene.add(p);
      this._stars = p;
      return p;
    },

    // ---------------------------------------------------------- building

    /** Cached material / shared geometry (see BF.g3d.mat and BF.g3d.geo). */
    mat(color, opts) { return mat(color, opts); },
    geo(name) { return geo(name); },

    add(obj) { this.scene.add(obj); return obj; },
    remove(obj) { if (obj && obj.parent) obj.parent.remove(obj); },

    /** Remember a geometry/texture created for this world so it is freed on dispose. */
    own(res) { this.owned.push(res); return res; },

    group(parent) {
      const g = new THREE.Group();
      (parent || this.scene).add(g);
      return g;
    },

    /**
     * A box whose base sits at (x, y, z): w along X, h up, d along Z.
     * opts: material opts + {shadow:false, receive:true, parent, rot}
     */
    box(x, y, z, w, h, d, color, opts) {
      opts = opts || {};
      const m = new THREE.Mesh(geo(opts.geo || 'box'), opts.material || mat(color, opts));
      m.scale.set(w, h, d);
      m.position.set(x, y + h / 2, z);
      if (opts.rot) m.rotation.y = opts.rot;
      m.castShadow = opts.shadow !== false;
      m.receiveShadow = opts.receive !== false;
      (opts.parent || this.scene).add(m);
      return m;
    },

    /** A primitive mesh (sphere/cyl/cone/...) centred at (x, y, z) with size (sx, sy, sz). */
    shape(kind, x, y, z, sx, sy, sz, color, opts) {
      opts = opts || {};
      const m = new THREE.Mesh(geo(kind), opts.material || mat(color, opts));
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.castShadow = opts.shadow !== false;
      m.receiveShadow = opts.receive !== false;
      (opts.parent || this.scene).add(m);
      return m;
    },

    /** Flat ground rectangle from (x0,z0) to (x1,z1) at height y. */
    ground(x0, z0, x1, z1, color, opts) {
      opts = opts || {};
      const m = new THREE.Mesh(geo('plane'), opts.material || mat(color, opts));
      m.rotation.x = -Math.PI / 2;
      m.scale.set(x1 - x0, z1 - z0, 1);
      m.position.set((x0 + x1) / 2, opts.y || 0, (z0 + z1) / 2);
      m.receiveShadow = true;
      (opts.parent || this.scene).add(m);
      return m;
    },

    /** Floor with a repeating grid texture. */
    gridFloor(x0, z0, x1, z1, base, line, cellPx, opts) {
      opts = opts || {};
      const cells = 4;
      const tex = gridTex(base, line, cells, { repeat: [(x1 - x0) / (cellPx * cells), (z1 - z0) / (cellPx * cells)], check: opts.check, noise: opts.noise });
      return this.ground(x0, z0, x1, z1, '#ffffff', Object.assign({}, opts, { map: tex }));
    },

    /**
     * Many boxes in one draw call per geometry. items: [{x,y,z,w,h,d,color,rot?}]
     * (x,z centre, y base). Returns the InstancedMesh.
     */
    boxes(items, opts) {
      opts = opts || {};
      if (!items.length) return null;
      // emissive would ignore per-instance colours: glowing batches are drawn unlit instead
      if (opts.glow && !opts.material) opts = Object.assign({}, opts, { basic: true, glow: 0 });
      const mesh = new THREE.InstancedMesh(geo(opts.geo || 'box'), opts.material || mat('#ffffff', opts), items.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = V(), s = V(), c = new THREE.Color(), e = new THREE.Euler();
      items.forEach((it, i) => {
        e.set(it.rx || 0, it.rot || 0, it.rz || 0);
        q.setFromEuler(e);
        p.set(it.x, (it.y || 0) + it.h / 2, it.z);
        s.set(it.w, it.h, it.d);
        m4.compose(p, q, s);
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, c.set(it.color || '#ffffff'));
      });
      mesh.castShadow = opts.shadow !== false;
      mesh.receiveShadow = true;
      (opts.parent || this.scene).add(mesh);
      return mesh;
    },

    /**
     * A flat ribbon following a path of game points [{x, y}] (Z = y).
     * o: {width, offset (lateral shift), y, closed, map, texLen (world units per texture repeat), color, glow, basic, opacity}
     */
    strip(pts, o) {
      o = o || {};
      const n = pts.length;
      const closed = o.closed !== false;
      const w = (o.width || 100) / 2, off = o.offset || 0, y = o.y || 0.5;
      const pos = [], uv = [], idx = [];
      let dist = 0;
      const cnt = closed ? n + 1 : n;
      for (let k = 0; k < cnt; k++) {
        const i = k % n;
        const p = pts[i];
        const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
        const ta = !closed && i === 0 ? Math.atan2(b.y - p.y, b.x - p.x) : !closed && i === n - 1 ? Math.atan2(p.y - a.y, p.x - a.x) : Math.atan2(b.y - a.y, b.x - a.x);
        const nx = -Math.sin(ta), ny = Math.cos(ta);
        if (k > 0) { const q = pts[(k - 1) % n]; dist += Math.hypot(p.x - q.x, p.y - q.y); }
        const cx = p.x + nx * off, cy = p.y + ny * off;
        pos.push(cx - nx * w, y, cy - ny * w, cx + nx * w, y, cy + ny * w);
        const v = dist / (o.texLen || 200);
        uv.push(0, v, 1, v);
        if (k > 0) { const b0 = (k - 1) * 2; idx.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      this.owned.push(g);
      const mesh = new THREE.Mesh(g, o.material || mat(o.color || '#ffffff', { map: o.map, glow: o.glow, basic: o.basic, opacity: o.opacity, side: 2 }));
      mesh.receiveShadow = true;
      (o.parent || this.scene).add(mesh);
      return mesh;
    },

    /** Text sprite that always faces the camera (world-size h). */
    sign(text, x, y, z, o) {
      o = o || {};
      const key = 'sign:' + text + (o.color || '') + (o.bg || '') + (o.size || '');
      const tex = canvasTex(key, 512, 128, (g, w, h) => {
        if (o.bg) { g.fillStyle = o.bg; BF.gfx.rr(g, 8, 8, w - 16, h - 16, 26); g.fill(); }
        g.font = '800 ' + (o.px || 64) + 'px Rubik, system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 10;
        g.strokeStyle = 'rgba(0,0,0,.55)';
        g.strokeText(text, w / 2, h / 2 + 4);
        g.fillStyle = o.color || '#ffffff';
        g.fillText(text, w / 2, h / 2 + 4);
      });
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false }));
      sp.scale.set((o.h || 40) * 4, o.h || 40, 1);
      sp.position.set(x, y, z);
      (o.parent || this.scene).add(sp);
      this.owned.push(sp.material);
      return sp;
    },

    // ---------------------------------------------------------- 2D adapters

    /**
     * BF.Particles-compatible emitter: emit(x, y, o) in game coordinates.
     * map(x, y) -> [X, Y, Z] (default: top-down at height h).
     */
    particles2d(h, map) {
      const fx = this.fx;
      const m = map || ((x, y) => [x, h == null ? 12 : h, y]);
      return {
        emit(x, y, o) {
          o = o || {};
          const p = m(x, y);
          fx.emit(p[0], p[1], p[2], { count: o.count, color: o.color, colors: o.colors, speed: (o.speed || 120) * 0.9, life: o.life, size: (o.size || 4) * 1.3, gravity: o.gravity != null && o.gravity < 0 ? -140 : 360, up: o.gravity != null && o.gravity < 0 ? 0.9 : 0.55 });
        },
        update() {}, draw() {}, clear() { fx.clear(); },
      };
    },

    /** BF.Floaters-compatible floating text: add(x, y, text, color, size). */
    floaters2d(h, map) {
      const w = this;
      const m = map || ((x, y) => [x, h == null ? 50 : h, y]);
      return { add(x, y, text, color, size) { const p = m(x, y); w.float(p[0], p[1], p[2], text, color, size); }, update() {}, draw() {} };
    },

    /**
     * Keyed mesh pool: use(key, make) returns the object for key (made on first
     * use); sweep() removes objects not used since the last sweep.
     */
    pool() {
      const world = this;
      const map = new Map();
      return {
        use(key, make) {
          let e = map.get(key);
          if (!e) { e = { obj: make(), seen: true }; map.set(key, e); } else e.seen = true;
          return e.obj;
        },
        sweep() {
          for (const [k, e] of map) {
            if (!e.seen) { world.remove(e.obj); if (e.obj.userData && e.obj.userData.dispose) e.obj.userData.dispose(); map.delete(k); } else e.seen = false;
          }
        },
        clear() { for (const e of map.values()) { world.remove(e.obj); if (e.obj.userData && e.obj.userData.dispose) e.obj.userData.dispose(); } map.clear(); },
        get size() { return map.size; },
      };
    },

    // ---------------------------------------------------------- actors

    /**
     * A 3D avatar for an id, created on first use and kept until sweep().
     * @param {string} id
     * @param {object} avatar {skin, equipped} or a colour look
     * @param {{scale?:number}} [o] scale = world units per rig unit (default 14)
     */
    actor(id, avatar, o) {
      let a = this.actors.get(id);
      if (a) { a.seen = true; return a.rig; }
      const rig = BF.char3d.build(avatar, o);
      rig.group.scale.setScalar((o && o.scale) || 14);
      this.scene.add(rig.group);
      this.actors.set(id, { rig, seen: true, solid: !(o && o.solid === false) });
      return rig;
    },

    /** Remove actors not touched by actor() since the previous sweep. */
    sweep() {
      for (const [id, a] of this.actors) {
        if (!a.seen) { this.remove(a.rig.group); a.rig.dispose(); this.actors.delete(id); }
        else a.seen = false;
      }
    },

    dropActor(id) {
      const a = this.actors.get(id);
      if (!a) return;
      this.remove(a.rig.group);
      a.rig.dispose();
      this.actors.delete(id);
    },

    // ---------------------------------------------------------- labels and text

    /**
     * Queue a name tag / bar / bubble drawn on the HUD this frame.
     * o: {name, color, level, hp (0-1), hpColor, bubble, icon, dy}
     */
    label(x, y, z, o) {
      this.labels.push({ x, y, z, o });
    },

    /** Floating text that rises and fades (world position). */
    float(x, y, z, text, color, size) {
      this.texts.push({ x, y, z, text, color: color || '#fff', size: size || 16, t: 0 });
    },

    /** Project a world point to HUD coordinates (960×540). */
    toScreen(x, y, z) {
      const v = this._v.set(x, y, z).project(this.camera);
      return { x: (v.x + 1) / 2 * this.W, y: (1 - v.y) / 2 * this.H, z: v.z, on: v.z < 1 && v.z > -1 && v.x > -1.2 && v.x < 1.2 && v.y > -1.3 && v.y < 1.3 };
    },

    /** Draw queued labels and floating texts on the HUD canvas, then clear the queue. */
    drawOverlay(g) {
      const G = BF.gfx;
      // tags follow the personal-space nudge of the character they belong to
      const moved = [];
      for (const a of this.actors.values()) if (a.off && a.base && (a.off.x || a.off.z)) moved.push(a);
      const L = this.labels.map((l) => {
        let x = l.x, z = l.z;
        for (const a of moved) {
          const r = a.rig.group.scale.x * 1.2;
          if (Math.abs(a.base.x - x) < r && Math.abs(a.base.z - z) < r) { x += a.off.x; z += a.off.z; break; }
        }
        return Object.assign(this.toScreen(x, l.y, z), { o: l.o });
      }).filter((l) => l.on);
      // nearest first gets its spot; farther tags that would overlap it step upward
      L.sort((a, b) => a.z - b.z);
      const placed = [];
      for (const l of L) {
        const w = l.o.name ? Math.min(160, 14 + l.o.name.length * 6.5) : 40;
        let y = l.y;
        for (let tries = 0; tries < 6; tries++) {
          const hit = placed.find((p) => Math.abs(p.x - l.x) < (p.w + w) / 2 && Math.abs(p.y - y) < 17);
          if (!hit) break;
          y = hit.y - 18;
        }
        l.y = y; l.w = w;
        placed.push(l);
      }
      L.sort((a, b) => b.z - a.z);
      for (const l of L) {
        const o = l.o;
        let y = l.y + (o.dy || 0);
        if (o.hp != null) { G.bar(g, l.x - 17, y - 4, 34, 5, U.clamp(o.hp, 0, 1), o.hpColor || '#3fd08a'); y -= 6; }
        if (o.name) G.nameTag(g, l.x, y - 2, o.name, o.color || '#fff', o.level);
        if (o.bubble) G.bubble(g, l.x, y - 22, o.bubble);
      }
      this.labels.length = 0;
      for (const t of this.texts) {
        const p = this.toScreen(t.x, t.y + t.t * 60, t.z);
        if (!p.on) continue;
        g.globalAlpha = Math.max(0, 1 - t.t / 1.1);
        G.text(g, t.text, p.x, p.y, { size: t.size, align: 'center', color: t.color, weight: 800, stroke: 'rgba(0,0,0,.6)' });
        g.globalAlpha = 1;
      }
    },

    // ---------------------------------------------------------- camera

    /**
     * Look at (tx, ty, tz) from a spherical offset. o: {dist, pitch (rad above horizon), yaw (rad), lerp, fov}
     */
    look(tx, ty, tz, o, dt) {
      o = o || {};
      const dist = o.dist || 800, pitch = o.pitch == null ? 0.95 : o.pitch, yaw = o.yaw || 0;
      const k = o.lerp == null || !dt ? 1 : 1 - Math.pow(1 - o.lerp, dt * 60);
      this.camTarget.x += (tx - this.camTarget.x) * k;
      this.camTarget.y += (ty - this.camTarget.y) * k;
      this.camTarget.z += (tz - this.camTarget.z) * k;
      const t = this.camTarget;
      const cx = t.x + Math.sin(yaw) * Math.cos(pitch) * dist;
      const cy = t.y + Math.sin(pitch) * dist;
      const cz = t.z + Math.cos(yaw) * Math.cos(pitch) * dist;
      let sx = 0, sy = 0;
      if (this.shakeT > 0) { sx = (Math.random() - 0.5) * this.shakeMag * 2; sy = (Math.random() - 0.5) * this.shakeMag * 2; }
      this.camera.position.set(cx + sx, cy + sy, cz);
      if (o.fov && this.camera.fov !== o.fov) { this.camera.fov = o.fov; this.camera.updateProjectionMatrix(); }
      this.camera.lookAt(t.x + sx * 0.5, t.y + sy * 0.5, t.z);
      this.focus(t.x, t.z);
    },

    /** Whole 960×540 stage from a tilted top-down view (tilt 0 = straight down). */
    stage(o) {
      o = o || {};
      const cx = o.cx == null ? this.W / 2 : o.cx, cz = o.cz == null ? this.H / 2 : o.cz;
      this.look(cx, 0, cz + (o.offsetZ || 30), { dist: o.dist || 820, pitch: o.pitch == null ? 1.02 : o.pitch, yaw: o.yaw || 0, fov: o.fov || 45 });
    },

    /** Side view for platformers: look at (x, y) in the X/Y plane from +Z. */
    side(x, y, o, dt) {
      o = o || {};
      this.look(x, y, 0, { dist: o.dist || 700, pitch: o.pitch == null ? 0.12 : o.pitch, yaw: o.yaw || 0, lerp: o.lerp, fov: o.fov || 45 }, dt);
    },

    shake(mag, t) {
      this.shakeMag = Math.max(this.shakeT > 0 ? this.shakeMag : 0, mag);
      this.shakeT = Math.max(this.shakeT, t || 0.25);
    },

    /** Keep the shadow camera centred on the action. */
    focus(x, z) {
      this.sun.position.set(x + 320, 900, z + 520);
      this.sun.target.position.set(x, 0, z);
    },

    // ---------------------------------------------------------- picking

    ray(px, py) {
      this._ndc.set(px / this.W * 2 - 1, -(py / this.H * 2 - 1));
      this._ray.setFromCamera(this._ndc, this.camera);
      return this._ray;
    },

    /** World point where the HUD pointer (px, py) meets the horizontal plane y = h. */
    groundAt(px, py, h) {
      this._plane.constant = -(h || 0);
      const out = V();
      return this.ray(px, py).ray.intersectPlane(this._plane, out) ? out : null;
    },

    /** World point on a vertical plane z = zc (side-view games). */
    wallAt(px, py, zc) {
      const pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(zc || 0));
      const out = V();
      return this.ray(px, py).ray.intersectPlane(pl, out) ? out : null;
    },

    /** First object hit among `objects` (recursive). */
    pick(px, py, objects) {
      const hits = this.ray(px, py).intersectObjects(objects, true);
      return hits[0] || null;
    },

    // ---------------------------------------------------------- frame

    resize(cssW, cssH, dpr) {
      const pr = this.q === 'low' ? Math.min(1, dpr) * 0.85 : Math.min(this.q === 'high' ? 2 : 1.5, dpr);
      this.renderer.setPixelRatio(pr);
      this.renderer.setSize(cssW, cssH, false);
      this.canvas.style.width = cssW + 'px';
      this.canvas.style.height = cssH + 'px';
      this.camera.aspect = this.W / this.H;
      this.camera.updateProjectionMatrix();
    },

    update(dt) {
      this.time += dt;
      if (this.shakeT > 0) this.shakeT -= dt;
      this.fx.update(dt);
      for (let i = this.texts.length - 1; i >= 0; i--) { this.texts[i].t += dt; if (this.texts[i].t > 1.1) this.texts.splice(i, 1); }
      this.separate(dt);
      for (const a of this.actors.values()) a.rig.tick(dt);
    },

    /**
     * Render-only personal space: characters standing on the same spot (spawn points,
     * crowded doors, bots walking through you) are eased apart so their meshes never
     * interpenetrate. Game positions are untouched; only what is drawn this frame moves.
     */
    separate(dt) {
      const list = [];
      for (const a of this.actors.values()) {
        const g = a.rig.group;
        if (a.solid === false || !g.visible || g.parent !== this.scene) { a.off = null; continue; }
        // the game did not move this rig since last frame: undo our previous nudge first
        if (a.shown && g.position.equals(a.shown)) g.position.copy(a.base);
        a.base = (a.base || new THREE.Vector3()).copy(g.position);
        a.want = (a.want || new THREE.Vector3()).set(0, 0, 0);
        a.off = a.off || new THREE.Vector3();
        list.push(a);
      }
      for (let i = 0; i < list.length; i++) {
        const A = list[i], sa = A.rig.group.scale.x;
        for (let j = i + 1; j < list.length; j++) {
          const B = list[j], sb = B.rig.group.scale.x;
          if (Math.abs(A.base.y - B.base.y) > (sa + sb) * 3) continue;
          let dx = B.base.x - A.base.x, dz = B.base.z - A.base.z;
          const min = (sa + sb) * 1.35;
          let l = Math.hypot(dx, dz);
          if (l >= min) continue;
          // side-view games only spread along one axis so nobody is pushed off a ledge
          if (this.sepAxis === 'z') { dx = 0; if (Math.abs(dz) < 0.01) dz = (i + j) % 2 ? 1 : -1; }
          else if (this.sepAxis === 'x') { dz = 0; if (Math.abs(dx) < 0.01) dx = (i + j) % 2 ? 1 : -1; }
          else if (l < 0.01) { const k = (i * 7 + j * 13) % 8; dx = Math.cos(k); dz = Math.sin(k); }
          l = Math.hypot(dx, dz);
          const push = (min - l) / 2;
          A.want.x -= (dx / l) * push; A.want.z -= (dz / l) * push;
          B.want.x += (dx / l) * push; B.want.z += (dz / l) * push;
        }
      }
      const k = Math.min(1, dt * 10);
      for (const a of list) {
        const cap = a.rig.group.scale.x * 2.2, wl = Math.hypot(a.want.x, a.want.z);
        if (wl > cap) a.want.multiplyScalar(cap / wl);
        a.off.lerp(a.want, k);
        a.rig.group.position.set(a.base.x + a.off.x, a.base.y, a.base.z + a.off.z);
        a.shown = (a.shown || new THREE.Vector3()).copy(a.rig.group.position);
      }
    },

    render() {
      this.renderer.render(this.scene, this.camera);
    },

    /** Free everything this world created (shared caches stay). */
    dispose() {
      for (const a of this.actors.values()) a.rig.dispose();
      this.actors.clear();
      this.scene.traverse((o) => {
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
        if (o.material && !Array.isArray(o.material) && !o.material.userData.shared && o.isInstancedMesh) o.material.dispose();
      });
      for (const r of this.owned) if (r && r.dispose) r.dispose();
      this.owned.length = 0;
      this.scene.clear();
      this.renderer.renderLists.dispose();
    },
  };

  BF.g3d = {
    supported,
    quality,
    /** 3D is used unless the device lacks WebGL or the player picked Classic 2D. */
    enabled() {
      return supported() && quality() !== 'classic' && !BF.g3d.lost;
    },
    world(opts) { return new World(opts); },
    renderer,
    geo,
    mat,
    canvasTex,
    gradientTex,
    gridTex,
    lost: false,
  };
})((window.BF = window.BF || {}));
