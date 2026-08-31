// ---------------------------------------------------------------------------
// 02_rng.js — deterministic xorshift128 streams + value noise helpers
// ---------------------------------------------------------------------------
(function () {
  const RNG = {};
  Z.RNG = RNG;

  function Stream(seed) {
    // scramble the seed so nearby seeds give very different streams
    let s = (seed >>> 0) || 0x9e3779b9;
    this.a = s = (s ^ 0x9e3779b9) >>> 0;
    s = (Math.imul(s ^ (s >>> 16), 0x85ebca6b)) >>> 0; this.b = s || 1;
    s = (Math.imul(s ^ (s >>> 13), 0xc2b2ae35)) >>> 0; this.c = s || 2;
    s = (s ^ (s >>> 16)) >>> 0; this.d = s || 3;
    for (let i = 0; i < 16; i++) this.u32();
  }

  Stream.prototype.u32 = function () {
    let t = this.d;
    const s = this.a;
    this.d = this.c; this.c = this.b; this.b = s;
    t ^= t << 11; t >>>= 0;
    t ^= t >>> 8;
    this.a = (t ^ s ^ (s >>> 19)) >>> 0;
    return this.a;
  };
  // [0,1)
  Stream.prototype.f = function () { return this.u32() / 4294967296; };
  // integer [0,n)
  Stream.prototype.i = function (n) { return (this.u32() % n) | 0; };
  // float [a,b)
  Stream.prototype.range = function (a, b) { return a + (b - a) * this.f(); };
  // float [-a,a)
  Stream.prototype.sym = function (a) { return (this.f() * 2 - 1) * a; };
  Stream.prototype.bool = function (p) { return this.f() < (p === undefined ? 0.5 : p); };
  Stream.prototype.pick = function (arr) { return arr[this.i(arr.length)]; };
  Stream.prototype.shuffle = function (arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.i(i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  // Approximately normal, mean 0 sigma 1 (sum of 3 uniforms, cheap and bounded).
  Stream.prototype.gauss = function () {
    return (this.f() + this.f() + this.f() - 1.5) * 1.1547;
  };
  // Uniform point on unit sphere.
  Stream.prototype.dir3 = function (o) {
    const z = this.f() * 2 - 1;
    const a = this.f() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    o[0] = Math.cos(a) * r; o[1] = z; o[2] = Math.sin(a) * r;
    return o;
  };
  // Uniform point in unit disc — the correct distribution for bullet spread.
  Stream.prototype.disc = function (o) {
    const r = Math.sqrt(this.f());
    const a = this.f() * Math.PI * 2;
    o[0] = Math.cos(a) * r; o[1] = Math.sin(a) * r;
    return o;
  };
  Stream.prototype.reseed = function (seed) { Stream.call(this, seed); return this; };

  RNG.make = (seed) => new Stream(seed);
  RNG.global = new Stream(0xC0DE1234);

  // ---- deterministic hash noise, used by procedural textures & meshes -------
  RNG.hash2 = function (x, y) {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x2545f491);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  RNG.hash3 = function (x, y, z) {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 13), 0x85ebca6b);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  // Smooth value noise in 2D (tileable over `period` if given).
  RNG.valueNoise2 = function (x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const wrap = period ? (n) => ((n % period) + period) % period : (n) => n;
    const a = RNG.hash2(wrap(xi), wrap(yi));
    const b = RNG.hash2(wrap(xi + 1), wrap(yi));
    const c = RNG.hash2(wrap(xi), wrap(yi + 1));
    const d = RNG.hash2(wrap(xi + 1), wrap(yi + 1));
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  // Fractal Brownian motion — the workhorse for grunge/wood/plaster.
  RNG.fbm2 = function (x, y, octaves, period, gain, lacunarity) {
    octaves = octaves || 4;
    gain = gain === undefined ? 0.5 : gain;
    lacunarity = lacunarity === undefined ? 2 : lacunarity;
    let sum = 0, amp = 1, norm = 0, freq = 1;
    for (let i = 0; i < octaves; i++) {
      sum += amp * RNG.valueNoise2(x * freq, y * freq, period ? period * freq : 0);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };
}());
