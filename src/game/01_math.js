// ---------------------------------------------------------------------------
// 01_math.js — scalar helpers, vec3 (plain arrays), mat4 (Float32Array)
// ---------------------------------------------------------------------------
(function () {
  const M = {};
  Z.M = M;

  M.TAU = Math.PI * 2;
  M.PI = Math.PI;
  M.DEG = Math.PI / 180;
  M.RAD = 180 / Math.PI;
  M.EPS = 1e-6;

  M.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  M.clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  M.lerp = (a, b, t) => a + (b - a) * t;
  M.sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  M.mix = M.lerp;

  // Framerate independent exponential approach. rate = "how fast", dt = seconds.
  M.damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);

  M.smoothstep = function (e0, e1, x) {
    const t = M.clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  };
  M.smootherstep = function (e0, e1, x) {
    const t = M.clamp01((x - e0) / (e1 - e0));
    return t * t * t * (t * (t * 6 - 15) + 10);
  };

  // Move `a` toward `b` by at most `maxDelta`.
  M.approach = function (a, b, maxDelta) {
    const d = b - a;
    if (Math.abs(d) <= maxDelta) return b;
    return a + Math.sign(d) * maxDelta;
  };

  // Shortest signed angular difference b - a, wrapped to (-PI, PI].
  M.angDiff = function (a, b) {
    let d = (b - a) % M.TAU;
    if (d > Math.PI) d -= M.TAU;
    if (d <= -Math.PI) d += M.TAU;
    return d;
  };
  M.angLerp = (a, b, t) => a + M.angDiff(a, b) * t;
  M.angDamp = (a, b, rate, dt) => a + M.angDiff(a, b) * (1 - Math.exp(-rate * dt));
  M.wrapAng = function (a) {
    a = a % M.TAU;
    if (a > Math.PI) a -= M.TAU;
    if (a <= -Math.PI) a += M.TAU;
    return a;
  };

  // -------------------------------------------------------------------------
  // vec3 — plain 3-element arrays, out-param style to stay allocation-free
  // -------------------------------------------------------------------------
  M.v3 = (x, y, z) => [x || 0, y || 0, z || 0];
  M.copy3 = (a) => [a[0], a[1], a[2]];
  M.set3 = function (o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; };
  M.cpy3 = function (o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; };
  M.add3 = function (o, a, b) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; };
  M.sub3 = function (o, a, b) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; };
  M.mul3 = function (o, a, b) { o[0] = a[0] * b[0]; o[1] = a[1] * b[1]; o[2] = a[2] * b[2]; return o; };
  M.scale3 = function (o, a, s) { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; };
  M.addScaled3 = function (o, a, b, s) { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; };
  M.dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  M.cross3 = function (o, a, b) {
    const x = a[1] * b[2] - a[2] * b[1];
    const y = a[2] * b[0] - a[0] * b[2];
    const z = a[0] * b[1] - a[1] * b[0];
    o[0] = x; o[1] = y; o[2] = z; return o;
  };
  M.len3 = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  M.len3sq = (a) => a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
  M.dist3 = function (a, b) {
    const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
    return Math.sqrt(x * x + y * y + z * z);
  };
  M.dist3sq = function (a, b) {
    const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
    return x * x + y * y + z * z;
  };
  // Horizontal (XZ) distance — used constantly by AI and gameplay.
  M.distXZ = function (a, b) {
    const x = a[0] - b[0], z = a[2] - b[2];
    return Math.sqrt(x * x + z * z);
  };
  M.distXZsq = function (a, b) {
    const x = a[0] - b[0], z = a[2] - b[2];
    return x * x + z * z;
  };
  M.norm3 = function (o, a) {
    const l = M.len3(a);
    if (l < M.EPS) { o[0] = 0; o[1] = 0; o[2] = 0; return o; }
    const s = 1 / l;
    o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s;
    return o;
  };
  M.lerp3 = function (o, a, b, t) {
    o[0] = a[0] + (b[0] - a[0]) * t;
    o[1] = a[1] + (b[1] - a[1]) * t;
    o[2] = a[2] + (b[2] - a[2]) * t;
    return o;
  };
  M.reflect3 = function (o, v, n) {
    const d = 2 * M.dot3(v, n);
    o[0] = v[0] - n[0] * d; o[1] = v[1] - n[1] * d; o[2] = v[2] - n[2] * d;
    return o;
  };
  // Remove the component of v along n (slide along a wall).
  M.clip3 = function (o, v, n, bounce) {
    const b = bounce === undefined ? 1.0 : bounce;
    const d = M.dot3(v, n) * b;
    o[0] = v[0] - n[0] * d; o[1] = v[1] - n[1] * d; o[2] = v[2] - n[2] * d;
    return o;
  };

  // Direction from yaw/pitch. yaw 0 looks down -Z.
  M.fromAngles = function (o, yaw, pitch) {
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    o[0] = -Math.sin(yaw) * cp;
    o[1] = sp;
    o[2] = -Math.cos(yaw) * cp;
    return o;
  };
  M.yawOf = (dx, dz) => Math.atan2(-dx, -dz);

  // -------------------------------------------------------------------------
  // mat4 — column-major Float32Array(16), OpenGL convention
  // -------------------------------------------------------------------------
  const m4 = {};
  M.m4 = m4;

  m4.create = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  m4.ident = function (o) {
    o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0;
    o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1;
    return o;
  };
  m4.copy = function (o, a) { o.set(a); return o; };

  m4.persp = function (o, fovyRad, aspect, near, far) {
    const f = 1 / Math.tan(fovyRad / 2);
    const nf = 1 / (near - far);
    o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = (far + near) * nf; o[11] = -1;
    o[12] = 0; o[13] = 0; o[14] = 2 * far * near * nf; o[15] = 0;
    return o;
  };

  m4.ortho = function (o, l, r, b, t, n, f) {
    const lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f);
    o[0] = -2 * lr; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = -2 * bt; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = 2 * nf; o[11] = 0;
    o[12] = (l + r) * lr; o[13] = (t + b) * bt; o[14] = (f + n) * nf; o[15] = 1;
    return o;
  };

  m4.mul = function (o, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    o[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    o[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    o[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    o[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    o[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    o[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    o[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    o[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    o[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    o[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    o[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    o[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    o[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    o[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    o[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    o[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return o;
  };

  m4.translate = function (o, x, y, z) {
    m4.ident(o); o[12] = x; o[13] = y; o[14] = z; return o;
  };
  m4.scaleM = function (o, x, y, z) {
    m4.ident(o); o[0] = x; o[5] = y; o[10] = z; return o;
  };
  m4.rotX = function (o, r) {
    const c = Math.cos(r), s = Math.sin(r);
    m4.ident(o); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o;
  };
  m4.rotY = function (o, r) {
    const c = Math.cos(r), s = Math.sin(r);
    m4.ident(o); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o;
  };
  m4.rotZ = function (o, r) {
    const c = Math.cos(r), s = Math.sin(r);
    m4.ident(o); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o;
  };

  // Compose translation * rotY * rotX * rotZ * scale in one shot (common case).
  m4.compose = function (o, px, py, pz, yaw, pitch, roll, sx, sy, sz) {
    sx = sx === undefined ? 1 : sx;
    sy = sy === undefined ? sx : sy;
    sz = sz === undefined ? sx : sz;
    const cy = Math.cos(yaw), sy_ = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    // R = Ry * Rx * Rz
    const m00 = cy * cr + sy_ * sp * sr;
    const m01 = cp * sr;
    const m02 = -sy_ * cr + cy * sp * sr;
    const m10 = -cy * sr + sy_ * sp * cr;
    const m11 = cp * cr;
    const m12 = sy_ * sr + cy * sp * cr;
    const m20 = sy_ * cp;
    const m21 = -sp;
    const m22 = cy * cp;
    o[0] = m00 * sx; o[1] = m01 * sx; o[2] = m02 * sx; o[3] = 0;
    o[4] = m10 * sy; o[5] = m11 * sy; o[6] = m12 * sy; o[7] = 0;
    o[8] = m20 * sz; o[9] = m21 * sz; o[10] = m22 * sz; o[11] = 0;
    o[12] = px; o[13] = py; o[14] = pz; o[15] = 1;
    return o;
  };

  // View matrix from eye position + yaw/pitch (no roll). Cheaper than lookAt.
  m4.view = function (o, px, py, pz, yaw, pitch, roll) {
    roll = roll || 0;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    // camera basis in world space
    let rx = cy, ry = 0, rz = -sy;                 // right
    let ux = sy * sp, uy = cp, uz = cy * sp;       // up
    let fx = -sy * cp, fy = sp, fz = -cy * cp;     // forward
    if (roll) {
      const cr = Math.cos(roll), sr = Math.sin(roll);
      const nrx = rx * cr + ux * sr, nry = ry * cr + uy * sr, nrz = rz * cr + uz * sr;
      const nux = ux * cr - rx * sr, nuy = uy * cr - ry * sr, nuz = uz * cr - rz * sr;
      rx = nrx; ry = nry; rz = nrz; ux = nux; uy = nuy; uz = nuz;
    }
    // view = transpose(basis) * translate(-eye); note back = -forward
    const bx = -fx, by = -fy, bz = -fz;
    o[0] = rx; o[1] = ux; o[2] = bx; o[3] = 0;
    o[4] = ry; o[5] = uy; o[6] = by; o[7] = 0;
    o[8] = rz; o[9] = uz; o[10] = bz; o[11] = 0;
    o[12] = -(rx * px + ry * py + rz * pz);
    o[13] = -(ux * px + uy * py + uz * pz);
    o[14] = -(bx * px + by * py + bz * pz);
    o[15] = 1;
    return o;
  };

  m4.lookAt = function (o, eye, target, up) {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
    o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
    o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    o[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    o[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    o[15] = 1;
    return o;
  };

  m4.invert = function (o, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  };

  m4.transpose = function (o, a) {
    if (o === a) {
      let t;
      t = a[1]; o[1] = a[4]; o[4] = t;
      t = a[2]; o[2] = a[8]; o[8] = t;
      t = a[3]; o[3] = a[12]; o[12] = t;
      t = a[6]; o[6] = a[9]; o[9] = t;
      t = a[7]; o[7] = a[13]; o[13] = t;
      t = a[11]; o[11] = a[14]; o[14] = t;
      return o;
    }
    o[0] = a[0]; o[1] = a[4]; o[2] = a[8]; o[3] = a[12];
    o[4] = a[1]; o[5] = a[5]; o[6] = a[9]; o[7] = a[13];
    o[8] = a[2]; o[9] = a[6]; o[10] = a[10]; o[11] = a[14];
    o[12] = a[3]; o[13] = a[7]; o[14] = a[11]; o[15] = a[15];
    return o;
  };

  m4.xformPoint = function (o, m, p) {
    const x = p[0], y = p[1], z = p[2];
    o[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    o[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    o[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    return o;
  };
  m4.xformDir = function (o, m, p) {
    const x = p[0], y = p[1], z = p[2];
    o[0] = m[0] * x + m[4] * y + m[8] * z;
    o[1] = m[1] * x + m[5] * y + m[9] * z;
    o[2] = m[2] * x + m[6] * y + m[10] * z;
    return o;
  };

  // Project a world point to normalized device coords; returns null if behind camera.
  m4.project = function (out, mvp, p) {
    const x = p[0], y = p[1], z = p[2];
    const cx = mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12];
    const cy = mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13];
    const cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
    if (cw <= 0.0001) return null;
    out[0] = cx / cw; out[1] = cy / cw;
    return out;
  };
}());
