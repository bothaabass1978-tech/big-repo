// ---------------------------------------------------------------------------
// 08_mesh.js — CPU mesh construction. Everything in this game is generated
// here: walls, stairs, rubble, zombie limbs, gun viewmodels.
// Vertex layout: pos(3) norm(3) uv(2) col(3) joint(1)
// ---------------------------------------------------------------------------
(function () {
  const Mesh = {};
  Z.Mesh = Mesh;

  const FACE_PX = 1, FACE_NX = 2, FACE_PY = 4, FACE_NY = 8, FACE_PZ = 16, FACE_NZ = 32;
  Mesh.FACE = { PX: FACE_PX, NX: FACE_NX, PY: FACE_PY, NY: FACE_NY, PZ: FACE_PZ, NZ: FACE_NZ, ALL: 63 };

  function Builder() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.col = [];
    this.jnt = [];
    this.idx = [];
    this.joint = 0;          // current joint index applied to new verts
    this.col3 = [1, 1, 1];   // current vertex colour
    // Per-vertex emissive strength. Lets one mesh carry self-lit detail —
    // zombie eyes, the box's glow, a perk machine's sign — without either a
    // second draw call or a whole-mesh emissive that lights everything.
    this.emis = [];
    this.emisV = 0;
    // optional transform stack applied to vert()/box()/cyl()
    this.xf = null;
  }
  Mesh.builder = () => new Builder();

  Builder.prototype.setColor = function (r, g, b) { this.col3[0] = r; this.col3[1] = g; this.col3[2] = b; return this; };
  Builder.prototype.setEmissive = function (e) { this.emisV = e || 0; return this; };
  Builder.prototype.setJoint = function (j) { this.joint = j | 0; return this; };
  Builder.prototype.setTransform = function (m) { this.xf = m; return this; };

  Builder.prototype.vcount = function () { return this.pos.length / 3; };

  Builder.prototype.vert = function (x, y, z, nx, ny, nz, u, v) {
    if (this.xf) {
      const m = this.xf;
      const px = m[0] * x + m[4] * y + m[8] * z + m[12];
      const py = m[1] * x + m[5] * y + m[9] * z + m[13];
      const pz = m[2] * x + m[6] * y + m[10] * z + m[14];
      const tx = m[0] * nx + m[4] * ny + m[8] * nz;
      const ty = m[1] * nx + m[5] * ny + m[9] * nz;
      const tz = m[2] * nx + m[6] * ny + m[10] * nz;
      const l = Math.hypot(tx, ty, tz) || 1;
      x = px; y = py; z = pz; nx = tx / l; ny = ty / l; nz = tz / l;
    }
    this.pos.push(x, y, z);
    this.nrm.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(this.col3[0], this.col3[1], this.col3[2]);
    this.emis.push(this.emisV);
    this.jnt.push(this.joint);
    return this.pos.length / 3 - 1;
  };

  Builder.prototype.tri = function (a, b, c) { this.idx.push(a, b, c); return this; };
  Builder.prototype.quadIdx = function (a, b, c, d) { this.idx.push(a, b, c, a, c, d); return this; };

  // Counter-clockwise quad given four corner positions and a normal.
  Builder.prototype.quad = function (p0, p1, p2, p3, n, uv0, uv1, uv2, uv3) {
    const a = this.vert(p0[0], p0[1], p0[2], n[0], n[1], n[2], uv0[0], uv0[1]);
    const b = this.vert(p1[0], p1[1], p1[2], n[0], n[1], n[2], uv1[0], uv1[1]);
    const c = this.vert(p2[0], p2[1], p2[2], n[0], n[1], n[2], uv2[0], uv2[1]);
    const d = this.vert(p3[0], p3[1], p3[2], n[0], n[1], n[2], uv3[0], uv3[1]);
    return this.quadIdx(a, b, c, d);
  };

  // Axis-aligned box. UVs are derived from WORLD size so a texture tiles at a
  // constant real-world scale no matter how big the brush is (Quake-style).
  // opts: { faces, uvScale, uvOffset:[u,v], shade:true }
  Builder.prototype.box = function (min, max, opts) {
    opts = opts || {};
    const faces = opts.faces === undefined ? 63 : opts.faces;
    const s = opts.uvScale === undefined ? 1 : opts.uvScale;
    const uo = opts.uvOffset ? opts.uvOffset[0] : 0;
    const vo = opts.uvOffset ? opts.uvOffset[1] : 0;
    const x0 = min[0], y0 = min[1], z0 = min[2];
    const x1 = max[0], y1 = max[1], z1 = max[2];
    // Per-face directional shading bakes cheap "ambient" contrast into vertex
    // colour so flat-lit surfaces still read as 3D. Matches CoD's dim interiors.
    const shade = opts.shade === false ? null : { px: 0.86, nx: 0.86, py: 1.0, ny: 0.55, pz: 0.72, nz: 0.72 };
    const base = [this.col3[0], this.col3[1], this.col3[2]];
    const setShade = (k) => {
      if (!shade) return;
      this.col3[0] = base[0] * shade[k]; this.col3[1] = base[1] * shade[k]; this.col3[2] = base[2] * shade[k];
    };

    if (faces & FACE_PX) {
      setShade('px');
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0],
        [uo + z1 * s, vo + y0 * s], [uo + z0 * s, vo + y0 * s], [uo + z0 * s, vo + y1 * s], [uo + z1 * s, vo + y1 * s]);
    }
    if (faces & FACE_NX) {
      setShade('nx');
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0],
        [uo + z0 * s, vo + y0 * s], [uo + z1 * s, vo + y0 * s], [uo + z1 * s, vo + y1 * s], [uo + z0 * s, vo + y1 * s]);
    }
    if (faces & FACE_PY) {
      setShade('py');
      this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0],
        [uo + x0 * s, vo + z1 * s], [uo + x1 * s, vo + z1 * s], [uo + x1 * s, vo + z0 * s], [uo + x0 * s, vo + z0 * s]);
    }
    if (faces & FACE_NY) {
      setShade('ny');
      this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0],
        [uo + x0 * s, vo + z0 * s], [uo + x1 * s, vo + z0 * s], [uo + x1 * s, vo + z1 * s], [uo + x0 * s, vo + z1 * s]);
    }
    if (faces & FACE_PZ) {
      setShade('pz');
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1],
        [uo + x0 * s, vo + y0 * s], [uo + x1 * s, vo + y0 * s], [uo + x1 * s, vo + y1 * s], [uo + x0 * s, vo + y1 * s]);
    }
    if (faces & FACE_NZ) {
      setShade('nz');
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1],
        [uo + x1 * s, vo + y0 * s], [uo + x0 * s, vo + y0 * s], [uo + x0 * s, vo + y1 * s], [uo + x1 * s, vo + y1 * s]);
    }
    this.col3[0] = base[0]; this.col3[1] = base[1]; this.col3[2] = base[2];
    return this;
  };

  // Oriented box centred at c, half-extents h, rotated by yaw/pitch/roll.
  Builder.prototype.obox = function (cx, cy, cz, hx, hy, hz, yaw, pitch, roll, opts) {
    const m = Z.M.m4.create();
    Z.M.m4.compose(m, cx, cy, cz, yaw || 0, pitch || 0, roll || 0, 1, 1, 1);
    const prev = this.xf;
    this.xf = prev ? Z.M.m4.mul(Z.M.m4.create(), prev, m) : m;
    this.box([-hx, -hy, -hz], [hx, hy, hz], opts);
    this.xf = prev;
    return this;
  };

  // Cylinder along +Y from y0 to y1.
  Builder.prototype.cyl = function (cx, cz, r0, r1, y0, y1, seg, opts) {
    opts = opts || {};
    seg = seg || 10;
    const caps = opts.caps !== false;
    const uvScale = opts.uvScale === undefined ? 1 : opts.uvScale;
    const ring0 = [], ring1 = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const u = (i / seg) * Math.PI * 2 * ((r0 + r1) * 0.5) * uvScale;
      // side normal accounts for the cone slope
      const slope = (r0 - r1) / Math.max(0.0001, y1 - y0);
      let nx = ca, ny = slope, nz = sa;
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      ring0.push(this.vert(cx + ca * r0, y0, cz + sa * r0, nx, ny, nz, u, y0 * uvScale));
      ring1.push(this.vert(cx + ca * r1, y1, cz + sa * r1, nx, ny, nz, u, y1 * uvScale));
    }
    for (let i = 0; i < seg; i++) this.quadIdx(ring0[i], ring0[i + 1], ring1[i + 1], ring1[i]);
    if (caps) {
      if (r1 > 0.0001) {
        const top = this.vert(cx, y1, cz, 0, 1, 0, 0, 0);
        const tr = [];
        for (let i = 0; i <= seg; i++) {
          const a = (i / seg) * Math.PI * 2;
          tr.push(this.vert(cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1, 0, 1, 0,
            Math.cos(a) * r1 * uvScale, Math.sin(a) * r1 * uvScale));
        }
        for (let i = 0; i < seg; i++) this.tri(top, tr[i], tr[i + 1]);
      }
      if (r0 > 0.0001) {
        const bot = this.vert(cx, y0, cz, 0, -1, 0, 0, 0);
        const br = [];
        for (let i = 0; i <= seg; i++) {
          const a = (i / seg) * Math.PI * 2;
          br.push(this.vert(cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0, 0, -1, 0,
            Math.cos(a) * r0 * uvScale, Math.sin(a) * r0 * uvScale));
        }
        for (let i = 0; i < seg; i++) this.tri(bot, br[i + 1], br[i]);
      }
    }
    return this;
  };

  // Low-poly capsule-ish limb: a tapered box with bevelled ends. Reads far
  // better than a plain box at the polygon budget zombies need.
  Builder.prototype.limb = function (len, r0, r1, opts) {
    opts = opts || {};
    const bevel = opts.bevel === undefined ? 0.28 : opts.bevel;
    const segs = [
      [0, r0 * (1 - bevel)],
      [len * 0.06, r0],
      [len * 0.94, r1],
      [len, r1 * (1 - bevel)],
    ];
    const sides = opts.sides || 6;
    const rings = [];
    for (let s = 0; s < segs.length; s++) {
      const ring = [];
      const y = segs[s][0], rr = segs[s][1];
      for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        ring.push(this.vert(ca * rr, y, sa * rr, ca, 0, sa, i / sides, y / Math.max(len, 0.001)));
      }
      rings.push(ring);
    }
    for (let s = 0; s < rings.length - 1; s++) {
      for (let i = 0; i < sides; i++) {
        this.quadIdx(rings[s][i], rings[s][i + 1], rings[s + 1][i + 1], rings[s + 1][i]);
      }
    }
    // caps
    const capT = this.vert(0, len, 0, 0, 1, 0, 0.5, 1);
    for (let i = 0; i < sides; i++) this.tri(capT, rings[3][i], rings[3][i + 1]);
    const capB = this.vert(0, 0, 0, 0, -1, 0, 0.5, 0);
    for (let i = 0; i < sides; i++) this.tri(capB, rings[0][i + 1], rings[0][i]);
    return this;
  };

  // Append another builder's contents, optionally transformed.
  Builder.prototype.append = function (other, m) {
    const base = this.vcount();
    const n = other.vcount();
    for (let i = 0; i < n; i++) {
      let x = other.pos[i * 3], y = other.pos[i * 3 + 1], z = other.pos[i * 3 + 2];
      let nx = other.nrm[i * 3], ny = other.nrm[i * 3 + 1], nz = other.nrm[i * 3 + 2];
      if (m) {
        const px = m[0] * x + m[4] * y + m[8] * z + m[12];
        const py = m[1] * x + m[5] * y + m[9] * z + m[13];
        const pz = m[2] * x + m[6] * y + m[10] * z + m[14];
        const tx = m[0] * nx + m[4] * ny + m[8] * nz;
        const ty = m[1] * nx + m[5] * ny + m[9] * nz;
        const tz = m[2] * nx + m[6] * ny + m[10] * nz;
        const l = Math.hypot(tx, ty, tz) || 1;
        x = px; y = py; z = pz; nx = tx / l; ny = ty / l; nz = tz / l;
      }
      this.pos.push(x, y, z);
      this.nrm.push(nx, ny, nz);
      this.uv.push(other.uv[i * 2], other.uv[i * 2 + 1]);
      this.col.push(other.col[i * 3], other.col[i * 3 + 1], other.col[i * 3 + 2]);
      this.emis.push(other.emis ? other.emis[i] : 0);
      this.jnt.push(other.jnt[i]);
    }
    for (let i = 0; i < other.idx.length; i++) this.idx.push(other.idx[i] + base);
    return this;
  };

  // Multiply every vertex colour by a scalar field — used to bake fake AO.
  Builder.prototype.shadeBy = function (fn) {
    const n = this.vcount();
    for (let i = 0; i < n; i++) {
      const k = fn(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2],
        this.nrm[i * 3], this.nrm[i * 3 + 1], this.nrm[i * 3 + 2]);
      this.col[i * 3] *= k; this.col[i * 3 + 1] *= k; this.col[i * 3 + 2] *= k;
    }
    return this;
  };

  Builder.prototype.finish = function (mat) {
    const n = this.vcount();
    const IdxType = n > 65535 ? Uint32Array : Uint16Array;
    return {
      verts: new Float32Array(this.pos),
      norms: new Float32Array(this.nrm),
      uvs: new Float32Array(this.uv),
      cols: new Float32Array(this.col),
      emis: new Float32Array(this.emis),
      joint: new Uint8Array(this.jnt),
      idx: new IdxType(this.idx),
      mat: mat || 'default',
      count: this.idx.length,
      vertCount: n,
    };
  };

  // Merge finished meshes that share a material into one draw call.
  Mesh.merge = function (meshes, mat) {
    let vc = 0, ic = 0;
    for (const m of meshes) { vc += m.vertCount; ic += m.count; }
    const IdxType = vc > 65535 ? Uint32Array : Uint16Array;
    const out = {
      verts: new Float32Array(vc * 3), norms: new Float32Array(vc * 3),
      uvs: new Float32Array(vc * 2), cols: new Float32Array(vc * 3),
      emis: new Float32Array(vc), joint: new Uint8Array(vc), idx: new IdxType(ic),
      mat: mat || (meshes[0] && meshes[0].mat) || 'default', count: ic, vertCount: vc,
    };
    let vo = 0, io = 0;
    for (const m of meshes) {
      out.verts.set(m.verts, vo * 3);
      out.norms.set(m.norms, vo * 3);
      out.uvs.set(m.uvs, vo * 2);
      out.cols.set(m.cols, vo * 3);
      if (m.emis) out.emis.set(m.emis, vo);
      out.joint.set(m.joint, vo);
      for (let i = 0; i < m.count; i++) out.idx[io + i] = m.idx[i] + vo;
      vo += m.vertCount; io += m.count;
    }
    return out;
  };

  Mesh.bounds = function (mesh) {
    const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (let i = 0; i < mesh.vertCount; i++) {
      for (let k = 0; k < 3; k++) {
        const v = mesh.verts[i * 3 + k];
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
    }
    return { min, max };
  };
}());
