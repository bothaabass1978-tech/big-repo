// ---------------------------------------------------------------------------
// 07_gl.js — thin WebGL wrapper: context, programs, buffers, textures, FBOs.
// WebGL2 preferred; falls back to WebGL1 with extensions.
// ---------------------------------------------------------------------------
(function () {
  const G = {};
  Z.GL = G;

  G.gl = null;
  G.gl2 = false;
  G.W = 1; G.H = 1; G.aspect = 1; G.dpr = 1;
  G.canvas = null;
  G.maxAniso = 1;
  G.stats = { draws: 0, tris: 0, progSwaps: 0, texBinds: 0 };

  const CTX_OPTS = {
    alpha: false, antialias: false, depth: true, stencil: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: false,
    desynchronized: false, failIfMajorPerformanceCaveat: false,
  };

  G.init = function (canvas) {
    G.canvas = canvas;
    let gl = canvas.getContext('webgl2', CTX_OPTS);
    if (gl) { G.gl2 = true; } else {
      gl = canvas.getContext('webgl', CTX_OPTS) || canvas.getContext('experimental-webgl', CTX_OPTS);
      G.gl2 = false;
    }
    if (!gl) throw new Error('WebGL is not available in this browser.');
    G.gl = gl;

    if (!G.gl2) {
      G.extIndex = gl.getExtension('OES_element_index_uint');
      G.extDeriv = gl.getExtension('OES_standard_derivatives');
      G.extVao = gl.getExtension('OES_vertex_array_object');
      G.extInstance = gl.getExtension('ANGLE_instanced_arrays');
    }
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic')
      || gl.getExtension('MOZ_EXT_texture_filter_anisotropic')
      || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    if (aniso) {
      G.aniso = aniso;
      G.maxAniso = Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT));
    }
    G.floatFB = G.gl2 ? (gl.getExtension('EXT_color_buffer_float') ? true : false) : false;
    G.halfFloat = G.gl2 || !!gl.getExtension('OES_texture_half_float');

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.clearColor(0, 0, 0, 1);
    // Canvas row 0 is the top of the image, but our box UVs put v=0 at the
    // bottom of a wall. Without this flip every sign, poster and chalk price
    // in the level renders upside down.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    return gl;
  };

  G.resize = function (cssW, cssH, scale) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * (scale || 1);
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (G.canvas.width !== w || G.canvas.height !== h) {
      G.canvas.width = w; G.canvas.height = h;
    }
    G.W = w; G.H = h; G.dpr = dpr;
    G.aspect = w / h;
    return { w, h };
  };

  // --- shaders --------------------------------------------------------------
  function compile(gl, type, src, label) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      const numbered = src.split('\n').map((l, i) => String(i + 1).padStart(4) + ' | ' + l).join('\n');
      throw new Error('shader compile failed [' + label + ']\n' + log + '\n' + numbered);
    }
    return sh;
  }

  // Auto-discovers every active uniform and attribute.
  G.prog = function (vsSrc, fsSrc, label) {
    const gl = G.gl;
    const version = G.gl2 ? '#version 300 es\n' : '';
    const vs = compile(gl, gl.VERTEX_SHADER, version + G.preamble(false) + vsSrc, (label || '?') + '.vs');
    const fs = compile(gl, gl.FRAGMENT_SHADER, version + G.preamble(true) + fsSrc, (label || '?') + '.fs');
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('program link failed [' + label + ']: ' + gl.getProgramInfoLog(p));
    }
    gl.deleteShader(vs); gl.deleteShader(fs);
    const u = Object.create(null), a = Object.create(null);
    const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(p, info.name);
    }
    const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < na; i++) {
      const info = gl.getActiveAttrib(p, i);
      a[info.name] = gl.getAttribLocation(p, info.name);
    }
    return { p, u, a, label: label || '?' };
  };

  // GLSL 1.00 / 3.00 es compatibility shim so shaders can be written once.
  G.preamble = function (isFrag) {
    if (G.gl2) {
      return isFrag
        ? 'precision highp float;\nprecision highp int;\n#define VARYING in\n#define TEX texture\nout vec4 FRAGCOLOR;\n'
        : 'precision highp float;\n#define ATTR in\n#define VARYING out\n';
    }
    let s = isFrag
      ? 'precision highp float;\n#define VARYING varying\n#define TEX texture2D\n#define FRAGCOLOR gl_FragColor\n'
      : 'precision highp float;\n#define ATTR attribute\n#define VARYING varying\n';
    if (isFrag) s = '#extension GL_OES_standard_derivatives : enable\n' + s;
    return s;
  };

  let curProg = null;
  G.use = function (prog) {
    if (curProg === prog) return prog;
    G.gl.useProgram(prog.p);
    curProg = prog;
    G.stats.progSwaps++;
    return prog;
  };

  // --- buffers --------------------------------------------------------------
  G.buf = function (data, target, usage) {
    const gl = G.gl;
    const b = gl.createBuffer();
    const t = target || gl.ARRAY_BUFFER;
    gl.bindBuffer(t, b);
    gl.bufferData(t, data, usage || gl.STATIC_DRAW);
    b._target = t;
    b._size = data.byteLength;
    return b;
  };
  G.updateBuf = function (b, data, count) {
    const gl = G.gl;
    gl.bindBuffer(b._target, b);
    const view = count === undefined ? data : data.subarray(0, count);
    if (view.byteLength > b._size) {
      gl.bufferData(b._target, view, gl.DYNAMIC_DRAW);
      b._size = view.byteLength;
    } else {
      gl.bufferSubData(b._target, 0, view);
    }
  };

  // --- vertex array objects (with WebGL1 fallback that just re-binds) --------
  G.vao = function (setup) {
    const gl = G.gl;
    if (G.gl2) {
      const v = gl.createVertexArray();
      gl.bindVertexArray(v);
      setup();
      gl.bindVertexArray(null);
      return { v, setup, bind() { gl.bindVertexArray(this.v); } };
    }
    if (G.extVao) {
      const v = G.extVao.createVertexArrayOES();
      G.extVao.bindVertexArrayOES(v);
      setup();
      G.extVao.bindVertexArrayOES(null);
      return { v, setup, bind() { G.extVao.bindVertexArrayOES(this.v); } };
    }
    return { v: null, setup, bind() { this.setup(); } };
  };
  G.unbindVao = function () {
    const gl = G.gl;
    if (G.gl2) gl.bindVertexArray(null);
    else if (G.extVao) G.extVao.bindVertexArrayOES(null);
  };

  // --- textures -------------------------------------------------------------
  G.tex2D = function (source, opts) {
    const gl = G.gl;
    opts = opts || {};
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const wrap = opts.clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    if (opts.nearest) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (opts.mips === false) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      } else {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        if (G.aniso) gl.texParameterf(gl.TEXTURE_2D, G.aniso.TEXTURE_MAX_ANISOTROPY_EXT, G.maxAniso);
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    t._w = source.width; t._h = source.height;
    return t;
  };

  G.texData = function (w, h, data, opts) {
    const gl = G.gl;
    opts = opts || {};
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opts.clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    const f = opts.nearest ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.bindTexture(gl.TEXTURE_2D, null);
    t._w = w; t._h = h;
    return t;
  };

  const boundTex = [];
  G.bindTex = function (unit, tex) {
    const gl = G.gl;
    if (boundTex[unit] === tex) return;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    boundTex[unit] = tex;
    G.stats.texBinds++;
  };
  G.invalidateTexCache = function () { boundTex.length = 0; };

  G.white = null;
  G.makeDefaults = function () {
    G.white = G.texData(2, 2, new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255]), { nearest: true });
    G.flatNormal = G.texData(2, 2, new Uint8Array([128, 128, 255, 255, 128, 128, 255, 255,
      128, 128, 255, 255, 128, 128, 255, 255]), { nearest: true });
  };

  // --- framebuffers ---------------------------------------------------------
  G.fbo = function (w, h, opts) {
    const gl = G.gl;
    opts = opts || {};
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const color = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, color);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    let depth = null;
    if (opts.depth !== false) {
      depth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, G.gl2 ? gl.DEPTH_COMPONENT24 : gl.DEPTH_COMPONENT16, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    }
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error('incomplete FBO: 0x' + status.toString(16));
    return { fb, color, depth, w, h };
  };

  G.resizeFbo = function (f, w, h) {
    const gl = G.gl;
    if (f.w === w && f.h === h) return f;
    gl.bindTexture(gl.TEXTURE_2D, f.color);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    if (f.depth) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, f.depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, G.gl2 ? gl.DEPTH_COMPONENT24 : gl.DEPTH_COMPONENT16, w, h);
    }
    f.w = w; f.h = h;
    return f;
  };

  G.bindFbo = function (f) {
    const gl = G.gl;
    if (f) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb);
      gl.viewport(0, 0, f.w, f.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, G.W, G.H);
    }
  };

  // --- fullscreen triangle --------------------------------------------------
  G.fsQuad = null;
  G.makeFsQuad = function () {
    // A single oversized triangle avoids the diagonal seam a quad produces.
    G.fsQuad = G.buf(new Float32Array([-1, -1, 3, -1, -1, 3]));
  };

  G.resetStats = function () { G.stats.draws = 0; G.stats.tris = 0; G.stats.progSwaps = 0; G.stats.texBinds = 0; };

  G.checkError = function (where) {
    if (!Z.C.DEBUG) return;
    const e = G.gl.getError();
    if (e) console.warn('GL error 0x' + e.toString(16) + ' at ' + where);
  };
}());
