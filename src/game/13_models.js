// ---------------------------------------------------------------------------
// 13_models.js — Z.Models: every piece of geometry in the game that is not a
// level brush. Zombies (skinned + gore states), first-person weapon viewmodels,
// first-person arms, and props. Nothing is loaded; it is all generated with
// Z.Mesh.builder() at boot.
//
// ===========================================================================
//  CONVENTIONS (read before consuming anything in here)
// ===========================================================================
//
//  MODEL SPACE — same handedness as the world: +X right, +Y up, +Z south.
//  A character stands with its feet on y = 0 and FACES -Z (yaw 0). Its own
//  left hand is therefore at -X and its right hand at +X.
//
//  VIEWMODEL SPACE — used by Mo.guns and Mo.arms. The origin is the camera,
//  the barrel points down -Z, sights sit on +Y. `muzzle`, `ejectPort`, `gripL`
//  and `gripR` are all offsets in the GUN's own local space; Mo.poseGun()
//  returns the matrix that takes gun-local space into camera space.
//
//  ROTATION CHANNELS — the pose system stores three Euler angles per joint,
//  fed straight into Z.M.m4.compose (R = Ry * Rx * Rz):
//      rx (pitch): tips the bone's +Y toward +Z.
//                  => an UPRIGHT bone (spine) leans BACKWARD for rx > 0
//                  => a HANGING bone (arm/leg) swings FORWARD for rx > 0
//      ry (yaw)  : + turns to the character's left
//      rz (roll) : + tips an upright bone's top to the left (-X), and swings a
//                  hanging bone toward the right (+X)
//  The named helpers (hunch/swingF/bendKnee/...) exist so animation code never
//  has to think about those signs.
//
//  SKINNING — rigid, one joint per vertex (Mesh's `joint` Uint8Array). The
//  matrices written by Mo.poseZombie() are FULL SKINNING MATRICES:
//      out[j] = worldJoint(j) * inverseBind(j)
//  so a vertex shader does exactly:  pos = skin[joint] * vec4(aPos, 1.0);
//  Pass params.worldOut (Float32Array(22*16)) if you also want the raw joint
//  world matrices (for attaching gibs, blood emitters, headshot hit spheres).
//
//  MATERIALS / UV ATLASES — a Mesh carries a single material key, and the
//  zombie must be one draw call for a 24-strong horde, so characters, guns and
//  props each use ONE atlas texture with named sub-regions (Mo.ATLAS). The
//  sub-material names from the art spec (zombie_cloth / zombie_skin /
//  zombie_face / gun_metal / gun_wood ...) survive as those region names, and
//  every mesh also records index ranges per sub-material in `.subs` for any
//  renderer that would rather bind real separate textures.
//
//  Crucially, the sub-material's base colour is ALSO baked into vertex colour
//  (together with fake AO), so a mesh drawn with a flat white texture still
//  reads correctly. That is what makes the debug/QA renders trustworthy.
// ---------------------------------------------------------------------------
(function () {
  const Mo = {};
  Z.Models = Mo;

  const M = Z.M;
  const m4 = M.m4;
  const PI = Math.PI;
  const TAU = PI * 2;
  const clamp = M.clamp;
  const clamp01 = M.clamp01;
  const lerp = M.lerp;
  const smoothstep = M.smoothstep;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, pow = Math.pow;

  // =========================================================================
  //  Palette — every colour that gets baked into vertex colours.
  // =========================================================================
  const COL = {
    // --- zombie ---
    cloth:      [0.255, 0.268, 0.222],   // feldgrau greatcoat, filthy
    clothDark:  [0.160, 0.170, 0.145],
    clothWorn:  [0.330, 0.330, 0.262],
    clothMud:   [0.205, 0.190, 0.150],
    leather:    [0.115, 0.095, 0.078],   // belt, boots, straps
    leatherHi:  [0.175, 0.145, 0.115],
    skin:       [0.475, 0.500, 0.395],   // grey-green dead flesh
    skinPale:   [0.560, 0.575, 0.470],
    skinDark:   [0.330, 0.355, 0.285],
    flesh:      [0.360, 0.120, 0.110],   // stumps / open wounds
    fleshDark:  [0.190, 0.058, 0.055],
    bone:       [0.700, 0.685, 0.575],
    helmet:     [0.192, 0.208, 0.190],   // stahlhelm, worn field grey
    helmetDark: [0.130, 0.142, 0.130],
    // --- weapons ---
    metal:      [0.300, 0.312, 0.330],
    metalHi:    [0.410, 0.425, 0.445],
    metalDark:  [0.140, 0.148, 0.160],
    blued:      [0.115, 0.120, 0.138],
    brass:      [0.520, 0.400, 0.170],
    wood:       [0.298, 0.176, 0.088],
    woodHi:     [0.390, 0.246, 0.126],
    woodDark:   [0.190, 0.108, 0.052],
    bakelite:   [0.150, 0.118, 0.090],
    rubber:     [0.090, 0.090, 0.095],
    // --- ray gun / glow ---
    rayShell:   [0.560, 0.520, 0.140],
    rayShellHi: [0.720, 0.680, 0.220],
    glowGreen:  [0.300, 1.000, 0.330],
    glowGold:   [1.000, 0.820, 0.300],
    glowRed:    [1.000, 0.260, 0.180],
    glowBlue:   [0.320, 0.640, 1.000],
    glowWhite:  [1.000, 0.960, 0.880],
    // --- arms ---
    sleeve:     [0.270, 0.290, 0.245],   // dirty grey-green field jacket
    sleeveDark: [0.180, 0.196, 0.168],
    hand:       [0.560, 0.470, 0.395],   // grimy live skin
    handDark:   [0.400, 0.330, 0.280],
    glove:      [0.180, 0.150, 0.120],
    // --- props ---
    crate:      [0.330, 0.225, 0.128],
    crateDark:  [0.215, 0.140, 0.078],
    plank:      [0.370, 0.268, 0.160],
    iron:       [0.190, 0.185, 0.180],
    ironRust:   [0.290, 0.170, 0.098],
    paint:      [0.780, 0.760, 0.700],
    concrete:   [0.360, 0.355, 0.340],
    sandbag:    [0.400, 0.370, 0.280],
    perkJugg:   [0.760, 0.120, 0.110],
    perkSpeed:  [0.180, 0.520, 0.880],
    perkDouble: [0.880, 0.640, 0.120],
    perkRevive: [0.560, 0.760, 0.960],
  };
  Mo.COL = COL;

  // =========================================================================
  //  UV atlases. [u0, v0, width, height] in 0..1 texture space.
  // =========================================================================
  const ATLAS = {
    zombie: {
      zombie_cloth: [0.00, 0.00, 0.50, 1.00],
      zombie_face:  [0.50, 0.00, 0.50, 0.50],
      zombie_skin:  [0.50, 0.50, 0.50, 0.50],
    },
    gun: {
      gun_metal: [0.00, 0.00, 0.50, 0.50],
      gun_wood:  [0.50, 0.00, 0.50, 0.50],
      gun_dark:  [0.00, 0.50, 0.50, 0.50],
      gun_glow:  [0.50, 0.50, 0.50, 0.50],
    },
    prop: {
      prop_wood:  [0.00, 0.00, 0.50, 0.50],
      prop_metal: [0.50, 0.00, 0.50, 0.50],
      prop_paint: [0.00, 0.50, 0.50, 0.50],
      prop_glow:  [0.50, 0.50, 0.50, 0.50],
    },
    arms: {
      arm_sleeve: [0.00, 0.00, 1.00, 0.50],
      arm_skin:   [0.00, 0.50, 1.00, 0.50],
    },
  };
  Mo.ATLAS = ATLAS;
  Mo.MATERIALS = ['zombie', 'gun', 'prop', 'arms'];

  const RZ = ATLAS.zombie, RG = ATLAS.gun, RP = ATLAS.prop, RA = ATLAS.arms;

  // =========================================================================
  //  Builder helpers
  // =========================================================================

  // Fold the raw UVs produced by box()/cyl()/limb() into one atlas region.
  function remapUV(b, v0, region, scale) {
    const rx = region[0], ry = region[1], rw = region[2], rh = region[3];
    const s = scale === undefined ? 1 : scale;
    const pad = 0.006;
    const n = b.vcount();
    for (let i = v0; i < n; i++) {
      let u = b.uv[i * 2] * s, v = b.uv[i * 2 + 1] * s;
      u -= Math.floor(u); v -= Math.floor(v);
      b.uv[i * 2] = rx + (pad + u * (1 - 2 * pad)) * rw;
      b.uv[i * 2 + 1] = ry + (pad + v * (1 - 2 * pad)) * rh;
    }
  }

  // A chunk of geometry belonging to one sub-material / colour / joint.
  // Records the index range so `.subs` can be handed to a multi-material renderer.
  function sect(b, subs, matName, region, col, joint, uvScale, fn) {
    const v0 = b.vcount();
    const i0 = b.idx.length;
    if (joint !== null && joint !== undefined) b.setJoint(joint);
    if (col) b.setColor(col[0], col[1], col[2]);
    fn();
    remapUV(b, v0, region, uvScale);
    if (subs) {
      const list = subs[matName] || (subs[matName] = []);
      const last = list[list.length - 1];
      if (last && last.start + last.count === i0) last.count = b.idx.length - last.start;
      else list.push({ start: i0, count: b.idx.length - i0, uvRect: region });
    }
    return v0;
  }

  // obox with a saner argument order: position, half-extents, then (rx, ry, rz).
  function ob(b, x, y, z, hx, hy, hz, rx, ry, rz, opts) {
    b.obox(x, y, z, hx, hy, hz, ry || 0, rx || 0, rz || 0, opts);
    return b;
  }

  // A tapered bevelled limb that HANGS from (ox,oy,oz) along local -Y.
  const _lm = m4.create(), _lw = m4.create();
  function limbDown(b, ox, oy, oz, len, r0, r1, sides) {
    m4.compose(_lm, ox, oy, oz, 0, PI, 0, 1, 1, 1);   // pitch PI: +Y -> -Y
    const prev = b.xf;
    b.setTransform(prev ? m4.mul(m4.create(), prev, _lm) : m4.copy(_lw, _lm));
    b.limb(len, r0, r1, { sides: sides || 5, bevel: 0.30 });
    b.setTransform(prev);
    return b;
  }

  // A cylinder running along -Z (weapon barrels, tubes, pipes).
  const _tm = m4.create();
  function tubeZ(b, x, y, z, len, r0, r1, seg, caps) {
    m4.compose(_tm, x, y, z, 0, -PI / 2, 0, 1, 1, 1);  // local +Y -> world -Z
    const prev = b.xf;
    b.setTransform(prev ? m4.mul(m4.create(), prev, _tm) : m4.copy(m4.create(), _tm));
    b.cyl(0, 0, r0, r1, 0, len, seg || 8, { caps: caps !== false, uvScale: 4 });
    b.setTransform(prev);
    return b;
  }

  // A cylinder running along +X (revolver cylinders, hinge pins, drums).
  const _xm = m4.create();
  function tubeX(b, x, y, z, len, r0, r1, seg, caps) {
    m4.compose(_xm, x, y, z, 0, 0, -PI / 2, 1, 1, 1);  // local +Y -> world +X
    const prev = b.xf;
    b.setTransform(prev ? m4.mul(m4.create(), prev, _xm) : m4.copy(m4.create(), _xm));
    b.cyl(0, 0, r0, r1, 0, len, seg || 8, { caps: caps !== false, uvScale: 4 });
    b.setTransform(prev);
    return b;
  }

  function mark(b) { return { v: b.vcount(), i: b.idx.length }; }
  function span(b, m0) {
    return { vStart: m0.v, vCount: b.vcount() - m0.v, start: m0.i, count: b.idx.length - m0.i };
  }

  // Push some vertices around after the fact (ragged hems, dents, asymmetry).
  function jitterRange(b, v0, v1, fn) {
    for (let i = v0; i < v1; i++) {
      const p = [b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]];
      const d = fn(p[0], p[1], p[2], i);
      if (d) { b.pos[i * 3] += d[0]; b.pos[i * 3 + 1] += d[1]; b.pos[i * 3 + 2] += d[2]; }
    }
  }

  function tris(mesh) { return mesh.count / 3; }
