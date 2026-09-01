// ---------------------------------------------------------------------------
// 12_render.js — forward renderer.
//
// Pass order: opaque world -> props -> skinned characters -> decals ->
// particles -> viewmodel (own depth range) -> post-process composite.
//
// Lighting is a hemispheric ambient + one weak "moon" directional + up to 8
// dynamic point lights. Nacht is a night map lit by two guttering bulbs, so the
// budget is deliberately tiny and the falloff deliberately steep.
// ---------------------------------------------------------------------------
(function () {
  const R = {};
  Z.Render = R;
  const M = Z.M;
  const m4 = M.m4;

  let gl = null;
  let progWorld = null, progSkin = null, progPart = null, progPost = null;
  let sceneFbo = null;
  const gpuTex = Object.create(null);

  R.camera = {
    pos: [0, 1.6, 0], yaw: 0, pitch: 0, roll: 0,
    fov: Z.C.FOV, near: Z.C.NEAR, far: Z.C.FAR, vmFov: 58,
  };
  const proj = m4.create(), view = m4.create(), viewProj = m4.create();
  const vmProj = m4.create();
  const tmpM = m4.create();

  R.env = {
    ambTop: [0.072, 0.074, 0.094],   // cold moonlight from above
    ambBot: [0.018, 0.017, 0.021],   // near-black bounce off the floorboards
    sunDir: [0.35, -0.82, 0.45],
    sunCol: [0.055, 0.062, 0.090],
    fogCol: Z.C.FOG_COLOR.slice(),
    fogNear: Z.C.FOG_NEAR,
    fogFar: Z.C.FOG_FAR,
    exposure: 1.30,
  };

  const MAX_L = Z.C.MAX_LIGHTS;
  const lightPosR = new Float32Array(MAX_L * 4);
  const lightColI = new Float32Array(MAX_L * 4);
  let lightCount = 0;
  const lightPool = [];   // persistent lights from the level
  const frameLights = []; // level lights + transients, rebuilt each frame

  R.quality = { grain: true, aberration: true, scale: 1.0, particles: 1.0 };
  R.hurtTint = 0;

  // =========================================================================
  // Shaders
  // =========================================================================
  const VS_SCENE = [
    'ATTR vec3 aPos;',
    'ATTR vec3 aNrm;',
    'ATTR vec2 aUv;',
    'ATTR vec3 aCol;',
    '#ifdef SKINNED',
    'ATTR float aJoint;',
    'uniform vec4 uJoints[66];',   // 22 joints as mat3x4 rows
    '#endif',
    'uniform mat4 uViewProj;',
    'uniform mat4 uModel;',
    'uniform mat3 uNormalMat;',
    'uniform vec2 uUvScroll;',
    'VARYING vec3 vWorld;',
    'VARYING vec3 vNrm;',
    'VARYING vec2 vUv;',
    'VARYING vec3 vCol;',
    'void main() {',
    '  vec3 p = aPos;',
    '  vec3 n = aNrm;',
    '#ifdef SKINNED',
    '  int j = int(aJoint + 0.5) * 3;',
    '  vec4 r0 = uJoints[j];',
    '  vec4 r1 = uJoints[j + 1];',
    '  vec4 r2 = uJoints[j + 2];',
    '  vec4 p4 = vec4(aPos, 1.0);',
    '  p = vec3(dot(r0, p4), dot(r1, p4), dot(r2, p4));',
    '  n = vec3(dot(r0.xyz, aNrm), dot(r1.xyz, aNrm), dot(r2.xyz, aNrm));',
    '#endif',
    '  vec4 wp = uModel * vec4(p, 1.0);',
    '  vWorld = wp.xyz;',
    '  vNrm = uNormalMat * n;',
    '  vUv = aUv + uUvScroll;',
    '  vCol = aCol;',
    '  gl_Position = uViewProj * wp;',
    '}',
  ].join('\n');

  const FS_SCENE = [
    'VARYING vec3 vWorld;',
    'VARYING vec3 vNrm;',
    'VARYING vec2 vUv;',
    'VARYING vec3 vCol;',
    'uniform sampler2D uTex;',
    'uniform sampler2D uNrmTex;',
    'uniform float uHasNormal;',
    'uniform vec3 uTint;',
    'uniform float uEmissive;',
    'uniform vec2 uSpec;',
    'uniform float uAlphaTest;',
    'uniform float uOpacity;',
    'uniform vec3 uAmbTop;',
    'uniform vec3 uAmbBot;',
    'uniform vec3 uSunDir;',
    'uniform vec3 uSunCol;',
    'uniform vec3 uCamPos;',
    'uniform vec3 uFogCol;',
    'uniform vec2 uFogRange;',
    'uniform int uLightCount;',
    'uniform vec4 uLightPosR[8];',
    'uniform vec4 uLightColI[8];',
    'uniform float uHurt;',
    // Build a tangent frame from screen-space derivatives. The world meshes
    // carry no tangents (they are generated brush geometry), and this costs
    // nothing to author while giving every surface real relief under the
    // moving lamps — which is most of what stops a tiled wall reading flat.
    'vec3 perturbNormal(vec3 N, vec3 V, vec2 uv) {',
    '  vec3 dp1 = dFdx(-V);',
    '  vec3 dp2 = dFdy(-V);',
    '  vec2 duv1 = dFdx(uv);',
    '  vec2 duv2 = dFdy(uv);',
    '  vec3 dp2perp = cross(dp2, N);',
    '  vec3 dp1perp = cross(N, dp1);',
    '  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;',
    '  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;',
    '  float invmax = inversesqrt(max(dot(T, T), dot(B, B)) + 1e-8);',
    '  vec3 m = TEX(uNrmTex, uv).xyz * 2.0 - 1.0;',
    '  m.xy *= 1.35;',
    '  return normalize(mat3(T * invmax, B * invmax, N) * m);',
    '}',
    'void main() {',
    '  vec4 texel = TEX(uTex, vUv);',
    '  if (texel.a < uAlphaTest) discard;',
    '  vec3 albedo = texel.rgb * uTint * vCol;',
    '  vec3 N = normalize(vNrm);',
    '  vec3 V = normalize(uCamPos - vWorld);',
    '  float dist = length(uCamPos - vWorld);',
    '  if (uHasNormal > 0.5 && dist < 26.0) {',
    '    vec3 Np = perturbNormal(N, V, vUv);',
    // fade the detail out with distance so it never aliases into noise
    '    N = normalize(mix(Np, N, clamp((dist - 9.0) / 17.0, 0.0, 1.0)));',
    '  }',
    '  float up = N.y * 0.5 + 0.5;',
    '  vec3 light = mix(uAmbBot, uAmbTop, up);',
    '  float nd = dot(N, -normalize(uSunDir));',
    '  light += uSunCol * max(0.0, nd * 0.5 + 0.5);',
    '  vec3 spec = vec3(0.0);',
    '  for (int i = 0; i < 8; i++) {',
    '    if (i >= uLightCount) break;',
    '    vec3 lp = uLightPosR[i].xyz;',
    '    float lr = uLightPosR[i].w;',
    '    vec3 Ld = lp - vWorld;',
    '    float d = length(Ld);',
    '    if (d > lr) continue;',
    '    Ld /= max(d, 0.0001);',
    '    float ndl = max(dot(N, Ld), 0.0);',
    '    float att = clamp(1.0 - d / lr, 0.0, 1.0);',
    '    att = att * att / (1.0 + d * d * 0.10);',
    '    vec3 lc = uLightColI[i].rgb * uLightColI[i].a * att;',
    '    light += lc * (ndl * 0.85 + 0.15);',
    '    if (uSpec.x > 0.0) {',
    '      vec3 H = normalize(Ld + V);',
    '      spec += lc * pow(max(dot(N, H), 0.0), uSpec.y) * uSpec.x;',
    '    }',
    '  }',
    '  vec3 col = albedo * light + spec + albedo * uEmissive;',
    '  float fogT = clamp((dist - uFogRange.x) / max(uFogRange.y - uFogRange.x, 0.001), 0.0, 1.0);',
    '  fogT = 1.0 - exp(-fogT * fogT * 3.2);',
    '  col = mix(col, uFogCol, fogT);',
    '  col = mix(col, vec3(dot(col, vec3(0.35, 0.5, 0.15))) * vec3(1.35, 0.42, 0.35), uHurt);',
    '  FRAGCOLOR = vec4(col, texel.a * uOpacity);',
    '}',
  ].join('\n');

  const VS_PART = [
    'ATTR vec3 aPos;',
    'ATTR vec2 aUv;',
    'ATTR vec4 aCol;',
    'uniform mat4 uViewProj;',
    'VARYING vec2 vUv;',
    'VARYING vec4 vCol;',
    'VARYING vec3 vWorld;',
    'void main() {',
    '  vWorld = aPos;',
    '  vUv = aUv;',
    '  vCol = aCol;',
    '  gl_Position = uViewProj * vec4(aPos, 1.0);',
    '}',
  ].join('\n');

  const FS_PART = [
    'VARYING vec2 vUv;',
    'VARYING vec4 vCol;',
    'VARYING vec3 vWorld;',
    'uniform sampler2D uTex;',
    'uniform vec3 uCamPos;',
    'uniform vec3 uFogCol;',
    'uniform vec2 uFogRange;',
    'uniform float uFogAmount;',
    'void main() {',
    '  vec4 t = TEX(uTex, vUv);',
    '  vec4 c = t * vCol;',
    '  if (c.a < 0.004) discard;',
    '  float dist = length(uCamPos - vWorld);',
    '  float fogT = clamp((dist - uFogRange.x) / max(uFogRange.y - uFogRange.x, 0.001), 0.0, 1.0);',
    '  fogT = (1.0 - exp(-fogT * fogT * 3.2)) * uFogAmount;',
    '  c.rgb = mix(c.rgb, uFogCol, fogT);',
    '  FRAGCOLOR = c;',
    '}',
  ].join('\n');

  const VS_POST = [
    'ATTR vec2 aPos;',
    'VARYING vec2 vUv;',
    'void main() {',
    '  vUv = aPos * 0.5 + 0.5;',
    '  gl_Position = vec4(aPos, 0.0, 1.0);',
    '}',
  ].join('\n');

  const FS_POST = [
    'VARYING vec2 vUv;',
    'uniform sampler2D uScene;',
    'uniform sampler2D uNoise;',
    'uniform vec2 uRes;',
    'uniform float uTime;',
    'uniform float uVignette;',
    'uniform float uGrain;',
    'uniform float uAberr;',
    'uniform float uExposure;',
    'uniform float uFade;',
    'uniform float uFlash;',
    'uniform vec3 uFlashCol;',
    'uniform float uSat;',
    'uniform float uHurtPulse;',
    // Filmic curve — crushes blacks the way CoD night maps do.
    'vec3 tonemap(vec3 x) {',
    '  x = max(vec3(0.0), x - 0.003);',
    '  return (x * (6.2 * x + 0.5)) / (x * (6.2 * x + 1.7) + 0.06);',
    '}',
    'void main() {',
    '  vec2 uv = vUv;',
    '  vec2 c = uv - 0.5;',
    '  float r2 = dot(c, c);',
    '  vec3 col;',
    '  if (uAberr > 0.0) {',
    '    float k = uAberr * (0.0016 + r2 * 0.010);',
    '    col.r = TEX(uScene, uv + c * k).r;',
    '    col.g = TEX(uScene, uv).g;',
    '    col.b = TEX(uScene, uv - c * k).b;',
    '  } else {',
    '    col = TEX(uScene, uv).rgb;',
    '  }',
    '  col *= uExposure;',
    '  col = tonemap(col);',
    '  float lum = dot(col, vec3(0.299, 0.587, 0.114));',
    '  col = mix(vec3(lum), col, uSat);',
    '  col *= vec3(0.96, 0.99, 1.06);',
    '  float vig = 1.0 - uVignette * smoothstep(0.15, 0.85, r2 * 1.6);',
    '  col *= vig;',
    '  if (uHurtPulse > 0.0) {',
    '    float edge = smoothstep(0.05, 0.5, r2);',
    '    col = mix(col, vec3(0.35, 0.02, 0.02), edge * uHurtPulse * 0.75);',
    '  }',
    '  if (uFlash > 0.0) col += uFlashCol * uFlash;',
    '  if (uGrain > 0.0) {',
    '    vec2 nuv = uv * uRes / 256.0 + vec2(fract(uTime * 13.7), fract(uTime * 7.3));',
    '    float n = TEX(uNoise, nuv).r - 0.5;',
    '    col += n * uGrain * (0.06 + 0.10 * (1.0 - lum));',
    '  }',
    '  col *= (1.0 - uFade);',
    '  FRAGCOLOR = vec4(col, 1.0);',
    '}',
  ].join('\n');

  // =========================================================================
  // Init
  // =========================================================================
  R.init = function (glCtx) {
    gl = glCtx;
    Z.GL.makeDefaults();
    Z.GL.makeFsQuad();

    progWorld = Z.GL.prog(VS_SCENE, FS_SCENE, 'world');
    progSkin = Z.GL.prog('#define SKINNED\n' + VS_SCENE, FS_SCENE, 'skin');
    progPart = Z.GL.prog(VS_PART, FS_PART, 'part');
    progPost = Z.GL.prog(VS_POST, FS_POST, 'post');

    sceneFbo = Z.GL.fbo(Math.max(2, Z.GL.W), Math.max(2, Z.GL.H));

    // Film-grain source.
    const nz = document.createElement('canvas');
    nz.width = nz.height = 256;
    const nctx = nz.getContext('2d');
    const img = nctx.createImageData(256, 256);
    const rng = Z.RNG.make(Z.ART_SEED ^ 0x9e37);
    for (let i = 0; i < 256 * 256; i++) {
      const v = (rng.f() * 255) | 0;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    nctx.putImageData(img, 0, 0);
    R.noiseTex = Z.GL.tex2D(nz, { mips: false });

    R.uploadMaterials();
    initParticleBuffers();
    return R;
  };

  R.uploadMaterials = function () {
    if (!Z.Tex || !Z.Tex.materials) return;
    for (const k in Z.Tex.materials) {
      const mat = Z.Tex.materials[k];
      if (!mat || !mat.canvas || gpuTex[k]) continue;
      gpuTex[k] = Z.GL.tex2D(mat.canvas, { clamp: mat.clamp === true });
      if (mat.normal) {
        gpuTex['n:' + k] = Z.GL.tex2D(mat.normal, { clamp: mat.clamp === true });
      }
    }
    if (Z.Tex.SPRITES) {
      for (const k in Z.Tex.SPRITES) {
        const cv = Z.Tex.SPRITES[k];
        if (cv && cv.width && !gpuTex['sprite:' + k]) {
          gpuTex['sprite:' + k] = Z.GL.tex2D(cv, { clamp: true, mips: false });
        }
      }
    }
  };

  R.texFor = (key) => gpuTex[key] || Z.GL.white;
  R.spriteTex = (key) => gpuTex['sprite:' + key] || Z.GL.white;

  R.resize = function () {
    if (sceneFbo) Z.GL.resizeFbo(sceneFbo, Math.max(2, Z.GL.W), Math.max(2, Z.GL.H));
  };

  // =========================================================================
  // GPU meshes
  // =========================================================================
  R.uploadMesh = function (mesh) {
    const interleave = new Float32Array(mesh.vertCount * 12);
    for (let i = 0; i < mesh.vertCount; i++) {
      const o = i * 12;
      interleave[o] = mesh.verts[i * 3];
      interleave[o + 1] = mesh.verts[i * 3 + 1];
      interleave[o + 2] = mesh.verts[i * 3 + 2];
      interleave[o + 3] = mesh.norms[i * 3];
      interleave[o + 4] = mesh.norms[i * 3 + 1];
      interleave[o + 5] = mesh.norms[i * 3 + 2];
      interleave[o + 6] = mesh.uvs[i * 2];
      interleave[o + 7] = mesh.uvs[i * 2 + 1];
      interleave[o + 8] = mesh.cols ? mesh.cols[i * 3] : 1;
      interleave[o + 9] = mesh.cols ? mesh.cols[i * 3 + 1] : 1;
      interleave[o + 10] = mesh.cols ? mesh.cols[i * 3 + 2] : 1;
      interleave[o + 11] = mesh.joint ? mesh.joint[i] : 0;
    }
    const vb = Z.GL.buf(interleave);
    const ib = Z.GL.buf(mesh.idx, gl.ELEMENT_ARRAY_BUFFER);
    const isU32 = mesh.idx instanceof Uint32Array;
    const g = {
      vb, ib, count: mesh.count, mat: mesh.mat,
      type: isU32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
      vertCount: mesh.vertCount,
    };
    g.vaoWorld = makeVao(g, progWorld);
    g.vaoSkin = makeVao(g, progSkin);
    return g;
  };

  function makeVao(g, prog) {
    return Z.GL.vao(function () {
      gl.bindBuffer(gl.ARRAY_BUFFER, g.vb);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib);
      const S = 12 * 4;
      bindAttr(prog, 'aPos', 3, S, 0);
      bindAttr(prog, 'aNrm', 3, S, 12);
      bindAttr(prog, 'aUv', 2, S, 24);
      bindAttr(prog, 'aCol', 3, S, 32);
      bindAttr(prog, 'aJoint', 1, S, 44);
    });
  }
  function bindAttr(prog, name, size, stride, offset) {
    const loc = prog.a[name];
    if (loc === undefined || loc < 0) return;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
  }

  // =========================================================================
  // Level
  // =========================================================================
  R.world = { chunks: [], tris: 0 };

  R.loadLevel = function (level) {
    R.world.chunks.length = 0;
    R.world.tris = 0;
    const byMat = Object.create(null);
    for (const b of level.brushes) {
      if (b.render === false) continue;
      const key = b.mat || 'concrete';
      if (!byMat[key]) byMat[key] = Z.Mesh.builder();
      const bd = byMat[key];
      if (b.tint) bd.setColor(b.tint[0], b.tint[1], b.tint[2]); else bd.setColor(1, 1, 1);
      bd.box(b.min, b.max, {
        faces: b.faces === undefined ? 63 : b.faces,
        uvScale: b.uvScale === undefined ? 1 : b.uvScale,
        uvOffset: b.uvOffset,
        shade: b.shade,
      });
    }
    for (const m of (level.meshes || [])) {
      const key = m.mat || 'concrete';
      if (!byMat[key]) byMat[key] = Z.Mesh.builder();
      byMat[key].append(rawToBuilder(m));
    }
    for (const key in byMat) {
      const finished = byMat[key].finish(key);
      if (!finished.count) continue;
      const g = R.uploadMesh(finished);
      g.bounds = Z.Mesh.bounds(finished);
      R.world.chunks.push(g);
      R.world.tris += finished.count / 3;
    }
    lightPool.length = 0;
    for (const L of (level.lights || [])) {
      const inten = L.intensity === undefined ? 1 : L.intensity;
      lightPool.push({
        pos: L.pos.slice(), home: L.pos.slice(),
        col: L.color ? L.color.slice() : [1, 0.72, 0.38],
        radius: L.radius || 7, base: inten,
        flicker: L.flicker || 0, sway: L.sway || 0,
        phase: Z.RNG.global.f() * 10,
      });
    }
    return R.world;
  };

  // Wrap a raw {verts,norms,uvs,cols,idx} mesh so append() can consume it.
  function rawToBuilder(m) {
    const b = Z.Mesh.builder();
    const n = m.verts.length / 3;
    for (let i = 0; i < n; i++) {
      b.pos.push(m.verts[i * 3], m.verts[i * 3 + 1], m.verts[i * 3 + 2]);
      b.nrm.push(m.norms ? m.norms[i * 3] : 0, m.norms ? m.norms[i * 3 + 1] : 1, m.norms ? m.norms[i * 3 + 2] : 0);
      b.uv.push(m.uvs ? m.uvs[i * 2] : 0, m.uvs ? m.uvs[i * 2 + 1] : 0);
      b.col.push(m.cols ? m.cols[i * 3] : 1, m.cols ? m.cols[i * 3 + 1] : 1, m.cols ? m.cols[i * 3 + 2] : 1);
      b.jnt.push(m.joint ? m.joint[i] : 0);
    }
    for (let i = 0; i < m.idx.length; i++) b.idx.push(m.idx[i]);
    return b;
  }
  R.rawToBuilder = rawToBuilder;

  // =========================================================================
  // Frame
  // =========================================================================
  R.time = 0;
  R.frameId = 0;

  R.beginFrame = function (dt) {
    R.time += dt;
    R.frameId++;
    Z.GL.resetStats();
    const cam = R.camera;
    m4.persp(proj, cam.fov * M.DEG, Z.GL.aspect, cam.near, cam.far);
    m4.view(view, cam.pos[0], cam.pos[1], cam.pos[2], cam.yaw, cam.pitch, cam.roll);
    m4.mul(viewProj, proj, view);
    m4.persp(vmProj, (cam.vmFov || 58) * M.DEG, Z.GL.aspect, 0.012, 12);

    frameLights.length = 0;
    for (const L of lightPool) {
      let inten = L.base;
      if (L.flicker) {
        const f = Math.sin(R.time * 11.3 + L.phase) * 0.5
          + Math.sin(R.time * 27.1 + L.phase * 2.3) * 0.35
          + Math.sin(R.time * 3.7 + L.phase) * 0.15;
        inten = L.base * (1 - L.flicker * (0.5 + 0.5 * f));
        // occasional deep drop-out, like a dying filament
        if (Math.sin(R.time * 0.7 + L.phase * 5) > 0.985) inten *= 0.15;
      }
      L.pos[0] = L.home[0]; L.pos[1] = L.home[1]; L.pos[2] = L.home[2];
      if (L.sway) {
        L.pos[0] += Math.sin(R.time * 0.9 + L.phase) * L.sway;
        L.pos[2] += Math.cos(R.time * 0.73 + L.phase) * L.sway;
      }
      frameLights.push({ pos: L.pos, col: L.col, radius: L.radius, intensity: inten });
    }
    return R;
  };

  // Transient light for this frame only (muzzle flash, explosion, ray gun).
  R.addLight = function (pos, col, radius, intensity) {
    frameLights.push({ pos, col, radius, intensity });
  };

  const scored = [];
  function selectLights(focus) {
    scored.length = 0;
    for (let i = 0; i < frameLights.length; i++) {
      const L = frameLights[i];
      const d = M.dist3sq(L.pos, focus);
      scored.push({ L, s: (L.intensity * L.radius) / (1 + d * 0.05) });
    }
    scored.sort((a, b) => b.s - a.s);
    lightCount = Math.min(MAX_L, scored.length);
    for (let i = 0; i < lightCount; i++) {
      const L = scored[i].L;
      lightPosR[i * 4] = L.pos[0]; lightPosR[i * 4 + 1] = L.pos[1];
      lightPosR[i * 4 + 2] = L.pos[2]; lightPosR[i * 4 + 3] = L.radius;
      lightColI[i * 4] = L.col[0]; lightColI[i * 4 + 1] = L.col[1];
      lightColI[i * 4 + 2] = L.col[2]; lightColI[i * 4 + 3] = L.intensity;
    }
  }

  function setSceneUniforms(prog) {
    const u = prog.u;
    gl.uniformMatrix4fv(u.uViewProj, false, viewProj);
    gl.uniform3fv(u.uAmbTop, R.env.ambTop);
    gl.uniform3fv(u.uAmbBot, R.env.ambBot);
    gl.uniform3fv(u.uSunDir, R.env.sunDir);
    gl.uniform3fv(u.uSunCol, R.env.sunCol);
    gl.uniform3fv(u.uCamPos, R.camera.pos);
    gl.uniform3fv(u.uFogCol, R.env.fogCol);
    gl.uniform2f(u.uFogRange, R.env.fogNear, R.env.fogFar);
    gl.uniform1i(u.uLightCount, lightCount);
    gl.uniform4fv(u.uLightPosR, lightPosR);
    gl.uniform4fv(u.uLightColI, lightColI);
    gl.uniform1f(u.uHurt, R.hurtTint || 0);
    gl.uniform2f(u.uUvScroll, 0, 0);
    prog.__frame = R.frameId;
  }

  const IDENT = m4.create();
  const nrmMat = new Float32Array(9);
  function normalMatFrom(m) {
    nrmMat[0] = m[0]; nrmMat[1] = m[1]; nrmMat[2] = m[2];
    nrmMat[3] = m[4]; nrmMat[4] = m[5]; nrmMat[5] = m[6];
    nrmMat[6] = m[8]; nrmMat[7] = m[9]; nrmMat[8] = m[10];
    return nrmMat;
  }

  function applyMaterial(prog, key, over) {
    const mat = (Z.Tex && Z.Tex.materials && Z.Tex.materials[key]) || null;
    Z.GL.bindTex(0, R.texFor(key));
    gl.uniform1i(prog.u.uTex, 0);
    const nrm = gpuTex['n:' + key];
    Z.GL.bindTex(2, nrm || Z.GL.flatNormal);
    gl.uniform1i(prog.u.uNrmTex, 2);
    gl.uniform1f(prog.u.uHasNormal, nrm ? 1 : 0);
    const tint = (over && over.tint) || (mat && mat.tint) || WHITE3;
    gl.uniform3fv(prog.u.uTint, tint);
    const emis = (over && over.emissive !== undefined) ? over.emissive : (mat ? (mat.emissive || 0) : 0);
    gl.uniform1f(prog.u.uEmissive, emis);
    const spec = (over && over.spec !== undefined) ? over.spec : ((mat && mat.spec) || 0);
    const gloss = (mat && mat.gloss) || 24;
    gl.uniform2f(prog.u.uSpec, spec, gloss);
    gl.uniform1f(prog.u.uAlphaTest,
      (over && over.alphaTest !== undefined) ? over.alphaTest : ((mat && mat.alphaTest) || 0.0));
    gl.uniform1f(prog.u.uOpacity, (over && over.opacity !== undefined) ? over.opacity : 1);
  }
  const WHITE3 = [1, 1, 1];

  R.beginScene = function () {
    Z.GL.bindFbo(sceneFbo);
    gl.clearColor(R.env.fogCol[0] * 0.35, R.env.fogCol[1] * 0.35, R.env.fogCol[2] * 0.35, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    selectLights(R.camera.pos);
  };

  R.drawWorld = function () {
    const prog = Z.GL.use(progWorld);
    setSceneUniforms(prog);
    gl.uniformMatrix4fv(prog.u.uModel, false, IDENT);
    gl.uniformMatrix3fv(prog.u.uNormalMat, false, normalMatFrom(IDENT));
    for (const c of R.world.chunks) {
      applyMaterial(prog, c.mat);
      c.vaoWorld.bind();
      gl.drawElements(gl.TRIANGLES, c.count, c.type, 0);
      Z.GL.stats.draws++; Z.GL.stats.tris += c.count / 3;
    }
    Z.GL.unbindVao();
  };

  R.drawMesh = function (g, model, over) {
    const prog = Z.GL.use(progWorld);
    if (prog.__frame !== R.frameId) setSceneUniforms(prog);
    gl.uniformMatrix4fv(prog.u.uModel, false, model || IDENT);
    gl.uniformMatrix3fv(prog.u.uNormalMat, false, normalMatFrom(model || IDENT));
    applyMaterial(prog, (over && over.mat) || g.mat, over);
    const cnt = (over && over.count !== undefined) ? over.count : g.count;
    g.vaoWorld.bind();
    gl.drawElements(gl.TRIANGLES, cnt, g.type, (over && over.offset) || 0);
    Z.GL.stats.draws++; Z.GL.stats.tris += cnt / 3;
    Z.GL.unbindVao();
  };

  // Skinned draw. `joints` is a Float32Array(66) of mat3x4 rows.
  R.drawSkinned = function (g, model, joints, over) {
    const prog = Z.GL.use(progSkin);
    if (prog.__frame !== R.frameId) setSceneUniforms(prog);
    gl.uniformMatrix4fv(prog.u.uModel, false, model || IDENT);
    gl.uniformMatrix3fv(prog.u.uNormalMat, false, normalMatFrom(model || IDENT));
    gl.uniform4fv(prog.u.uJoints, joints);
    applyMaterial(prog, (over && over.mat) || g.mat, over);
    const cnt = (over && over.count !== undefined) ? over.count : g.count;
    g.vaoSkin.bind();
    gl.drawElements(gl.TRIANGLES, cnt, g.type, (over && over.offset) || 0);
    Z.GL.stats.draws++; Z.GL.stats.tris += cnt / 3;
    Z.GL.unbindVao();
  };

  // =========================================================================
  // Quad soup — particles, decals, tracers, blob shadows, sprites
  // =========================================================================
  const MAX_QUADS = 3000;
  let pVerts = null, pBuf = null, pIdxBuf = null, pVao = null, pCount = 0;

  function initParticleBuffers() {
    pVerts = new Float32Array(MAX_QUADS * 4 * 9); // pos3 uv2 col4
    const idx = new Uint16Array(MAX_QUADS * 6);
    for (let i = 0; i < MAX_QUADS; i++) {
      const v = i * 4, o = i * 6;
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2;
      idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
    }
    pBuf = Z.GL.buf(pVerts, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
    pIdxBuf = Z.GL.buf(idx, gl.ELEMENT_ARRAY_BUFFER);
    pVao = Z.GL.vao(function () {
      gl.bindBuffer(gl.ARRAY_BUFFER, pBuf);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pIdxBuf);
      const S = 9 * 4;
      bindAttr(progPart, 'aPos', 3, S, 0);
      bindAttr(progPart, 'aUv', 2, S, 12);
      bindAttr(progPart, 'aCol', 4, S, 20);
    });
  }

  R.beginQuads = function () { pCount = 0; };
  R.quadCount = () => pCount;

  const rightV = [0, 0, 0], upV = [0, 0, 0];
  R.billboard = function (pos, size, col, uv0, uv1, roll) {
    if (pCount >= MAX_QUADS) return;
    const cam = R.camera;
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    let rx = cy, ry = 0, rz = -sy;
    let ux = sy * sp, uy = cp, uz = cy * sp;
    if (roll) {
      const cr = Math.cos(roll), sr = Math.sin(roll);
      const nrx = rx * cr + ux * sr, nry = ry * cr + uy * sr, nrz = rz * cr + uz * sr;
      const nux = ux * cr - rx * sr, nuy = uy * cr - ry * sr, nuz = uz * cr - rz * sr;
      rx = nrx; ry = nry; rz = nrz; ux = nux; uy = nuy; uz = nuz;
    }
    const hw = size[0] * 0.5, hh = size[1] * 0.5;
    rightV[0] = rx * hw; rightV[1] = ry * hw; rightV[2] = rz * hw;
    upV[0] = ux * hh; upV[1] = uy * hh; upV[2] = uz * hh;
    pushQuad(pos, rightV, upV, col, uv0, uv1);
  };

  R.worldQuad = function (pos, right, up, col, uv0, uv1) {
    pushQuad(pos, right, up, col, uv0, uv1);
  };

  function pushQuad(pos, r, u, col, uv0, uv1) {
    if (pCount >= MAX_QUADS) return;
    const u0 = uv0 ? uv0[0] : 0, v0 = uv0 ? uv0[1] : 0;
    const u1 = uv1 ? uv1[0] : 1, v1 = uv1 ? uv1[1] : 1;
    const cr = col[0], cg = col[1], cb = col[2], ca = col[3] === undefined ? 1 : col[3];
    const px = pos[0], py = pos[1], pz = pos[2];
    let k = pCount * 36;
    pVerts[k++] = px - r[0] - u[0]; pVerts[k++] = py - r[1] - u[1]; pVerts[k++] = pz - r[2] - u[2];
    pVerts[k++] = u0; pVerts[k++] = v1; pVerts[k++] = cr; pVerts[k++] = cg; pVerts[k++] = cb; pVerts[k++] = ca;
    pVerts[k++] = px + r[0] - u[0]; pVerts[k++] = py + r[1] - u[1]; pVerts[k++] = pz + r[2] - u[2];
    pVerts[k++] = u1; pVerts[k++] = v1; pVerts[k++] = cr; pVerts[k++] = cg; pVerts[k++] = cb; pVerts[k++] = ca;
    pVerts[k++] = px + r[0] + u[0]; pVerts[k++] = py + r[1] + u[1]; pVerts[k++] = pz + r[2] + u[2];
    pVerts[k++] = u1; pVerts[k++] = v0; pVerts[k++] = cr; pVerts[k++] = cg; pVerts[k++] = cb; pVerts[k++] = ca;
    pVerts[k++] = px - r[0] + u[0]; pVerts[k++] = py - r[1] + u[1]; pVerts[k++] = pz - r[2] + u[2];
    pVerts[k++] = u0; pVerts[k++] = v0; pVerts[k++] = cr; pVerts[k++] = cg; pVerts[k++] = cb; pVerts[k++] = ca;
    pCount++;
  }

  R.flushQuads = function (texKey, additive, fogAmount) {
    if (!pCount) return;
    Z.GL.updateBuf(pBuf, pVerts, pCount * 36);
    const prog = Z.GL.use(progPart);
    gl.uniformMatrix4fv(prog.u.uViewProj, false, viewProj);
    gl.uniform3fv(prog.u.uCamPos, R.camera.pos);
    gl.uniform3fv(prog.u.uFogCol, R.env.fogCol);
    gl.uniform2f(prog.u.uFogRange, R.env.fogNear, R.env.fogFar);
    gl.uniform1f(prog.u.uFogAmount, fogAmount === undefined ? 1 : fogAmount);
    Z.GL.bindTex(0, typeof texKey === 'string' ? R.spriteTex(texKey) : (texKey || Z.GL.white));
    gl.uniform1i(prog.u.uTex, 0);
    gl.enable(gl.BLEND);
    if (additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    pVao.bind();
    gl.drawElements(gl.TRIANGLES, pCount * 6, gl.UNSIGNED_SHORT, 0);
    Z.GL.stats.draws++; Z.GL.stats.tris += pCount * 2;
    Z.GL.unbindVao();
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    pCount = 0;
  };

  // =========================================================================
  // Viewmodel — own projection so the gun never clips into walls
  // =========================================================================
  let vmSavePos = null;
  R.beginViewmodel = function () {
    gl.clear(gl.DEPTH_BUFFER_BIT);
    m4.copy(viewProj, vmProj);   // viewmodel space IS view space
    const vmLights = [];
    const vmView = m4.view(tmpM, R.camera.pos[0], R.camera.pos[1], R.camera.pos[2],
      R.camera.yaw, R.camera.pitch, R.camera.roll);
    for (const L of frameLights) {
      const p = [0, 0, 0];
      m4.xformPoint(p, vmView, L.pos);
      vmLights.push({ pos: p, col: L.col, radius: L.radius, intensity: L.intensity });
    }
    // A dedicated soft key light so the weapon is always legible.
    // Deliberately dim: the weapon must stay legible without becoming the
    // brightest thing on screen in a map lit by two failing bulbs.
    vmLights.push({ pos: [0.42, 0.50, 0.30], col: [0.40, 0.44, 0.55], radius: 3.2, intensity: 0.42 });
    vmSavePos = R.camera.pos;
    R.camera.pos = ORIGIN;
    frameLightsSave = frameLights.slice();
    frameLights.length = 0;
    for (const L of vmLights) frameLights.push(L);
    selectLights(ORIGIN);
    R.frameId++;
  };
  const ORIGIN = [0, 0, 0];
  let frameLightsSave = null;

  R.endViewmodel = function () {
    R.camera.pos = vmSavePos;
    if (frameLightsSave) {
      frameLights.length = 0;
      for (const L of frameLightsSave) frameLights.push(L);
      frameLightsSave = null;
    }
    m4.mul(viewProj, proj, view);
    R.frameId++;
    selectLights(R.camera.pos);
  };

  R.viewProj = () => viewProj;
  R.vmProj = () => vmProj;
  R.projMat = () => proj;
  R.viewMat = () => view;

  // World -> screen pixels. Returns null when behind the camera.
  const projTmp = [0, 0];
  R.worldToScreen = function (p, out) {
    const r = m4.project(projTmp, viewProj, p);
    if (!r) return null;
    out = out || [0, 0];
    out[0] = (r[0] * 0.5 + 0.5) * Z.GL.W / Z.GL.dpr;
    out[1] = (1 - (r[1] * 0.5 + 0.5)) * Z.GL.H / Z.GL.dpr;
    return out;
  };

  // =========================================================================
  // Post
  // =========================================================================
  R.post = function (fx) {
    fx = fx || {};
    Z.GL.bindFbo(null);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    const prog = Z.GL.use(progPost);
    gl.bindBuffer(gl.ARRAY_BUFFER, Z.GL.fsQuad);
    const loc = prog.a.aPos;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    Z.GL.bindTex(0, sceneFbo.color);
    gl.uniform1i(prog.u.uScene, 0);
    Z.GL.bindTex(1, R.noiseTex);
    gl.uniform1i(prog.u.uNoise, 1);
    gl.uniform2f(prog.u.uRes, Z.GL.W, Z.GL.H);
    gl.uniform1f(prog.u.uTime, R.time);
    gl.uniform1f(prog.u.uVignette, fx.vignette === undefined ? 0.55 : fx.vignette);
    gl.uniform1f(prog.u.uGrain, R.quality.grain ? (fx.grain === undefined ? 0.55 : fx.grain) : 0);
    gl.uniform1f(prog.u.uAberr, R.quality.aberration ? (fx.aberration === undefined ? 0.5 : fx.aberration) : 0);
    gl.uniform1f(prog.u.uExposure, fx.exposure === undefined ? R.env.exposure : fx.exposure);
    gl.uniform1f(prog.u.uFade, fx.fade || 0);
    gl.uniform1f(prog.u.uFlash, fx.flash || 0);
    gl.uniform3fv(prog.u.uFlashCol, fx.flashCol || [1, 0.95, 0.85]);
    gl.uniform1f(prog.u.uSat, fx.saturation === undefined ? 0.78 : fx.saturation);
    gl.uniform1f(prog.u.uHurtPulse, fx.hurtPulse || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    Z.GL.stats.draws++;
    gl.enable(gl.DEPTH_TEST);
  };

  R.stats = function () {
    return {
      draws: Z.GL.stats.draws, tris: Z.GL.stats.tris,
      lights: lightCount, worldTris: R.world.tris, quads: pCount,
    };
  };
}());
