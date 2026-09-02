// ---------------------------------------------------------------------------
// 13_models.js — Z.Models: every piece of geometry in the game that is not a
// level brush. Zombies (skinned + variants), procedural animation, first
// person weapon viewmodels + arms, and world props. Nothing is loaded from
// disk; it is all generated with Z.Mesh.builder() at boot (Mo.build()).
//
// ===========================================================================
//  CONVENTIONS
// ===========================================================================
//  MODEL SPACE — same handedness as the world: +X right, +Y up, +Z south.
//  The zombie stands with feet on y=0, FACING -Z (yaw 0). cross(forward,up) =
//  +X, so the character's own RIGHT side is +X and LEFT side is -X — hence
//  joint names shoulderR/armR/... sit on +X, shoulderL/armL/... sit on -X.
//
//  VIEWMODEL SPACE (Mo.guns / Mo.arms) — origin at the camera. The barrel
//  points down -Z, the top rail/sights face +Y, the grip sits near the
//  origin. Mo.poseGun() returns the mat4 that carries gun-local space into
//  camera space (sway/bob/ADS/recoil/reload/sprint all folded in).
//
// ===========================================================================
//  SKELETON — 22 joints, rigid one-joint-per-vertex skinning
// ===========================================================================
//  The BIND POSE (every joint's own rotation channel == 0) is a plain
//  standing "attention" pose: spine straight, arms hanging at the sides,
//  legs straight, feet at y=0. Every joint's rest ORIENTATION is therefore
//  identity — only its rest POSITION (a fixed offset from its parent)
//  varies — which keeps the whole skinning derivation to a couple of lines
//  (see restPositions()/skinMatrix() below) and gives a clean, undeformed
//  "T-pose"-equivalent reference render for rig QA (feed identity matrices
//  to the renderer, i.e. don't call poseZombie at all).
//
//  All character shape — the hunch, the dragging leg, the low grasping
//  reach — is produced entirely by ANIMATION deltas layered on that bind
//  pose, never baked into the mesh. That is what lets one shared skeleton
//  and one set of inverse-bind data serve the base zombie and every variant
//  mesh (variants differ only in the geometry assigned to each joint, plus
//  an optional uniform `params.heightScale` that scales bone *offsets*
//  consistently at both mesh-build time and pose time, so tall/short
//  variants never show a seam at the joints).
//
//  Skinning is the textbook rigid form: worldPos(v) = worldJoint(j) *
//  inverseBind(j) * restPos(v), where restPos(v) is the vertex position as
//  authored (in the bind pose, in model space) and j = mesh.joint[v].
//  Because every rest orientation is identity, inverseBind(j) collapses to
//  "translate by -restPos(j)", so skinMatrix(j) = worldJoint(j) with its
//  translation column adjusted — see skinMatrix() for the closed form.
// ---------------------------------------------------------------------------
(function () {
  const Mo = {};
  Z.Models = Mo;

  const M = Z.M;
  const m4 = M.m4;
  const RNG = Z.RNG;
  const PI = Math.PI;
  const TAU = PI * 2;
  const DEG = M.DEG;
  const clamp = M.clamp;
  const clamp01 = M.clamp01;
  const lerp = M.lerp;
  const smoothstep = M.smoothstep;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, sqrt = Math.sqrt;
  const max = Math.max, min = Math.min;

  // =========================================================================
  //  Palette — every colour baked into vertex colours (see Mesh format: a
  //  vertex's colour multiplies the sampled texel, so one tiling grunge
  //  texture reads as many different materials once tinted per body part).
  // =========================================================================
  const COL = {
    // --- zombie ---
    cloth: [0.255, 0.268, 0.222],      // feldgrau greatcoat, filthy
    clothDark: [0.150, 0.160, 0.135],
    clothWorn: [0.330, 0.330, 0.262],
    clothMud: [0.205, 0.190, 0.150],
    trouser: [0.220, 0.215, 0.185],
    trouserDark: [0.140, 0.138, 0.118],
    leather: [0.100, 0.082, 0.066],    // belt, boots, straps
    leatherHi: [0.160, 0.132, 0.104],
    skin: [0.475, 0.500, 0.395],       // grey-green dead flesh
    skinPale: [0.560, 0.575, 0.470],
    skinDark: [0.185, 0.198, 0.168],
    flesh: [0.360, 0.120, 0.110],      // stumps / open wounds
    fleshDark: [0.170, 0.052, 0.050],
    fleshWet: [0.460, 0.080, 0.075],
    bone: [0.700, 0.685, 0.575],
    teeth: [0.760, 0.730, 0.610],
    eye: [0.03, 0.03, 0.03],
    // The signature read: two amber points that stay legible across a black
    // room. Emissive, so they survive the lighting falloff entirely.
    eyeGlow: [1.00, 0.62, 0.13],
    helmet: [0.176, 0.192, 0.176],     // stahlhelm, worn field grey
    helmetDark: [0.110, 0.122, 0.112],
    // --- weapons ---
    metal: [0.300, 0.312, 0.330],
    metalHi: [0.430, 0.445, 0.465],
    metalDark: [0.130, 0.138, 0.150],
    blued: [0.105, 0.110, 0.128],
    brass: [0.560, 0.430, 0.185],
    brassHi: [0.700, 0.560, 0.260],
    wood: [0.298, 0.176, 0.088],
    woodHi: [0.400, 0.256, 0.132],
    woodDark: [0.170, 0.098, 0.048],
    bakelite: [0.130, 0.100, 0.078],
    rubber: [0.075, 0.075, 0.080],
    // --- ray gun ---
    rayShell: [0.560, 0.520, 0.140],
    rayShellHi: [0.760, 0.700, 0.230],
    glowGreen: [0.35, 1.35, 0.40],     // > 1: relies on emissive add, still punchy unlit
    glowGold: [1.15, 0.90, 0.32],
    glowRed: [1.20, 0.28, 0.20],
    // --- arms (first person) ---
    sleeve: [0.270, 0.290, 0.245],
    sleeveDark: [0.180, 0.196, 0.168],
    hand: [0.560, 0.470, 0.395],
    handDark: [0.400, 0.330, 0.280],
    glove: [0.170, 0.140, 0.112],
    // --- props ---
    crate: [0.330, 0.225, 0.128],
    crateDark: [0.215, 0.140, 0.078],
    plank: [0.380, 0.276, 0.164],
    plankDark: [0.250, 0.176, 0.100],
    iron: [0.185, 0.180, 0.176],
    ironRust: [0.300, 0.176, 0.100],
    paint: [0.780, 0.760, 0.700],
    sandbag: [0.420, 0.388, 0.292],
    canvas: [0.360, 0.340, 0.280],
  };
  Mo.COL = COL;

  // =========================================================================
  //  Skeleton — 22 joints. Order is the contract; do not reorder.
  // =========================================================================
  Mo.JOINTS = [
    'root', 'pelvis', 'spine', 'chest', 'neck', 'head',
    'shoulderL', 'armL', 'foreArmL', 'handL',
    'shoulderR', 'armR', 'foreArmR', 'handR',
    'hipL', 'legL', 'shinL', 'footL',
    'hipR', 'legR', 'shinR', 'footR',
  ];
  const NJ = Mo.JOINTS.length; // 22
  const J = Object.create(null);
  Mo.JOINTS.forEach((n, i) => { J[n] = i; });
  Mo.J = J;

  // parent index per joint (-1 = root of the hierarchy)
  const PARENT = [
    -1, 0, 1, 2, 3, 4,
    3, 6, 7, 8,
    3, 10, 11, 12,
    1, 14, 15, 16,
    1, 18, 19, 20,
  ];
  Mo.PARENT = PARENT;

  // Rest offset from parent joint to this joint, in the bind ("attention")
  // pose, in metres. Feet land exactly on y = 0 by construction.
  const BASE_OFFSET = [
    [0, 0, 0],                 // root
    [0, 0.92, 0],              // pelvis (hip height)
    [0, 0.14, 0],              // spine
    [0, 0.16, 0],              // chest
    [0, 0.16, 0],              // neck
    [0, 0.10, 0],              // head
    [-0.16, 0.10, 0],          // shoulderL
    [-0.04, -0.02, 0],         // armL   (upper arm root)
    [0, -0.27, 0],             // foreArmL (== upper arm length)
    [0, -0.25, 0],             // handL  (== forearm length)
    [0.16, 0.10, 0],           // shoulderR
    [0.04, -0.02, 0],          // armR
    [0, -0.27, 0],             // foreArmR
    [0, -0.25, 0],             // handR
    [-0.10, -0.04, 0],         // hipL
    [0, -0.02, 0],             // legL   (thigh root)
    [0, -0.44, 0],             // shinL  (== thigh length)
    [0, -0.42, 0],             // footL  (== shin length)
    [0.10, -0.04, 0],          // hipR
    [0, -0.02, 0],             // legR
    [0, -0.44, 0],             // shinR
    [0, -0.42, 0],             // footR
  ];

  // Bone "reach" lengths used by mesh authoring (distance from this joint to
  // its single child along the bind pose, i.e. BASE_OFFSET of that child).
  const REACH = {
    armL: 0.27, foreArmL: 0.25, armR: 0.27, foreArmR: 0.25,
    legL: 0.44, shinL: 0.42, legR: 0.44, shinR: 0.42,
  };

  // World-space rest positions for every joint, given a uniform bone-length
  // scale `hs` (heightScale). Pure prefix-sum since rest orientation == I.
  function restPositions(hs) {
    hs = hs || 1;
    const p = new Array(NJ);
    for (let j = 0; j < NJ; j++) {
      const o = BASE_OFFSET[j], par = PARENT[j];
      if (par < 0) p[j] = [o[0] * hs, o[1] * hs, o[2] * hs];
      else {
        const pp = p[par];
        p[j] = [pp[0] + o[0] * hs, pp[1] + o[1] * hs, pp[2] + o[2] * hs];
      }
    }
    return p;
  }
  Mo.restPositions = restPositions;

  // skin(j) = worldJoint(j) * translate(-restPos(j))   (closed form; see
  // header). `W` is a full mat4 (col-major, Z.M.m4 convention), `rest` a
  // [x,y,z]. Writes into `out` (mat4).
  function skinMatrix(out, W, rest) {
    out[0] = W[0]; out[1] = W[1]; out[2] = W[2]; out[3] = W[3];
    out[4] = W[4]; out[5] = W[5]; out[6] = W[6]; out[7] = W[7];
    out[8] = W[8]; out[9] = W[9]; out[10] = W[10]; out[11] = W[11];
    const rx = rest[0], ry = rest[1], rz = rest[2];
    out[12] = W[12] - (W[0] * rx + W[4] * ry + W[8] * rz);
    out[13] = W[13] - (W[1] * rx + W[5] * ry + W[9] * rz);
    out[14] = W[14] - (W[2] * rx + W[6] * ry + W[10] * rz);
    out[15] = 1;
    return out;
  }

  // Forward kinematics. `rot` is an array of 22 {rx,ry,rz} (pitch,yaw,roll,
  // radians) ANIM DELTAS (added straight to the identity bind rotation).
  // `rootExtra` is an additional [x,y,z] translation folded into joint 0
  // only (root motion: bob, sink, crouch). Writes 22 world mat4s into the
  // provided pool `worldPool` (array of 22 Float32Array(16), reused).
  const _localFK = m4.create();
  function forwardKinematics(rot, rootExtra, hs, worldPool) {
    hs = hs || 1;
    for (let j = 0; j < NJ; j++) {
      const o = BASE_OFFSET[j];
      let ox = o[0] * hs, oy = o[1] * hs, oz = o[2] * hs;
      if (j === 0 && rootExtra) { ox += rootExtra[0]; oy += rootExtra[1]; oz += rootExtra[2]; }
      const r = rot[j];
      m4.compose(_localFK, ox, oy, oz, r.ry, r.rx, r.rz, 1, 1, 1);
      const par = PARENT[j];
      if (par < 0) m4.copy(worldPool[j], _localFK);
      else m4.mul(worldPool[j], worldPool[par], _localFK);
    }
    return worldPool;
  }

  // =========================================================================
  //  Mesh authoring helpers
  // =========================================================================

  // A tapered bevelled limb that HANGS from (ox,oy,oz) along local -Y.
  const _lm = m4.create();
  function limbDown(b, ox, oy, oz, len, r0, r1, sides) {
    m4.compose(_lm, ox, oy, oz, 0, PI, 0, 1, 1, 1);   // pitch PI: +Y -> -Y
    const prev = b.xf;
    b.setTransform(prev ? m4.mul(m4.create(), prev, _lm) : m4.copy(m4.create(), _lm));
    b.limb(len, r0, r1, { sides: sides || 6, bevel: 0.30 });
    b.setTransform(prev);
    return b;
  }

  // A cylinder running along -Z (barrels, tubes, pipes) from local origin.
  const _tmZ = m4.create();
  function tubeZ(b, x, y, z, len, r0, r1, seg, caps, uvScale) {
    m4.compose(_tmZ, x, y, z, 0, -PI / 2, 0, 1, 1, 1);
    const prev = b.xf;
    b.setTransform(prev ? m4.mul(m4.create(), prev, _tmZ) : m4.copy(m4.create(), _tmZ));
    b.cyl(0, 0, r0, r1, 0, len, seg || 8, { caps: caps !== false, uvScale: uvScale || 4 });
    b.setTransform(prev);
    return b;
  }

  // A cylinder running along +X (bolt handles, revolver cylinders, hinge pins).
  const _tmX = m4.create();
  function tubeX(b, x, y, z, len, r0, r1, seg, caps, uvScale) {
    m4.compose(_tmX, x, y, z, 0, 0, -PI / 2, 1, 1, 1);
    const prev = b.xf;
    b.setTransform(prev ? m4.mul(m4.create(), prev, _tmX) : m4.copy(m4.create(), _tmX));
    b.cyl(0, 0, r0, r1, 0, len, seg || 8, { caps: caps !== false, uvScale: uvScale || 4 });
    b.setTransform(prev);
    return b;
  }

  // Oriented box: position, half-extents, then (rx,ry,rz) pitch/yaw/roll.
  function ob(b, x, y, z, hx, hy, hz, rx, ry, rz, opts) {
    b.obox(x, y, z, hx, hy, hz, ry || 0, rx || 0, rz || 0, opts);
    return b;
  }

  // Axis-aligned box helper: colour + box() in one call.
  function box(b, x0, y0, z0, x1, y1, z1, col, opts) {
    if (col) b.setColor(col[0], col[1], col[2]);
    b.box([x0, y0, z0], [x1, y1, z1], opts);
    return b;
  }

  function tris(mesh) { return mesh.count / 3; }
  Mo.tris = tris;

  // deterministic per-call jitter, no allocation, no RNG stream object
  function h(seed, k) { return RNG.hash2((seed | 0), (k | 0)); }       // [0,1)
  function hs(seed, k) { return h(seed, k) * 2 - 1; }                  // [-1,1)

  Mo._internal = { restPositions, forwardKinematics, skinMatrix, limbDown, tubeZ, tubeX, ob, box };

  // =========================================================================
  //  ZOMBIE MESH — the most important asset in the game.
  //
  //  Wehrmacht corpse, silhouette-first: hunched forward (via animation, see
  //  below), asymmetric shoulders (baked into the mesh here), arms built to
  //  hang low and heavy, stiff legs, slack jaw. AO is baked into vertex
  //  colour (dark under the chin, in the armpits, inside the coat).
  //
  //  Single material ('zombie_skin' — a tileable grunge/bruise/tear canvas,
  //  see 06_textures.js) for the WHOLE mesh so a horde is one draw call per
  //  instance; every body part gets its real look entirely from vertex
  //  colour tinting + baked shadeBy() AO, per the Mesh format contract
  //  ("vec3 albedo = texel.rgb * uTint * vCol").
  // =========================================================================

  // opts: { heightScale, bulk, helmet, tornCoat, missingArm:'L'|'R'|null,
  //         legless (crawler stumps), seed }
  function buildZombieMesh(opts) {
    opts = opts || {};
    const hsc = opts.heightScale || 1;          // bone-length scale
    const bulk = opts.bulk || 1;                // radius/width scale only
    const rk = sqrt(bulk);                      // mild proportion coupling
    const seed = (opts.seed || 0) >>> 0;
    const rest = restPositions(hsc);
    const b = Z.Mesh.builder();

    // ---- baked AO: darker under chin, armpits, crotch, inside coat -------
    function ao(x, y, z, nx, ny, nz) {
      let k = 1.0;
      k *= lerp(0.62, 1.0, clamp01(ny * 0.5 + 0.5));          // faces pointing down are dimmer
      k *= lerp(1.0, 0.72, clamp01(1 - abs(x) * 3.2));         // seam down the centreline
      return k;
    }

    function torso() {
      const pel = rest[J.pelvis], sp = rest[J.spine], ch = rest[J.chest], nk = rest[J.neck];
      // pelvis / hip block
      b.setJoint(J.pelvis);
      box(b, -0.145 * bulk, pel[1] - 0.10, -0.145 * bulk, 0.145 * bulk, pel[1] + 0.075, 0.150 * bulk, COL.clothDark);
      // groin/crotch dark AO wedge
      box(b, -0.06 * bulk, pel[1] - 0.14, -0.05 * bulk, 0.06 * bulk, pel[1] - 0.08, 0.05 * bulk, COL.clothDark, { shade: false });

      // lower torso / abdomen — spine joint
      b.setJoint(J.spine);
      box(b, -0.155 * bulk, sp[1] - 0.02, -0.150 * bulk, 0.155 * bulk, sp[1] + 0.135, 0.156 * bulk, COL.cloth);

      // upper torso / ribcage — chest joint, ASYMMETRIC shoulders baked in
      b.setJoint(J.chest);
      box(b, -0.185 * bulk, ch[1] - 0.03, -0.165 * bulk, 0.20 * bulk, ch[1] + 0.145, 0.170 * bulk, COL.cloth);
      // right shoulder pad: bigger / higher (worn greatcoat epaulette, torn)
      box(b, 0.15 * bulk, ch[1] + 0.11, -0.135 * bulk, 0.245 * bulk, ch[1] + 0.200, 0.140 * bulk, COL.clothWorn);
      // left shoulder pad: smaller, sits lower — reads asymmetric at a glance
      box(b, -0.210 * bulk, ch[1] + 0.08, -0.115 * bulk, -0.145 * bulk, ch[1] + 0.160, 0.115 * bulk, COL.clothDark);
      // belt
      box(b, -0.165 * bulk, pel[1] + 0.055, -0.160 * bulk, 0.165 * bulk, pel[1] + 0.10, 0.166 * bulk, COL.leather);
      // buckle
      box(b, -0.028, pel[1] + 0.06, -0.170 * bulk, 0.028, pel[1] + 0.095, -0.153 * bulk, COL.brass, { shade: false });

      // damage: torso always carries some tear (corpse), variant emphasises it
      const tearBig = !!opts.tornCoat;
      const tx = -0.02 + hs(seed, 11) * 0.05, ty = sp[1] + (tearBig ? 0.07 : 0.03);
      const tw = tearBig ? 0.155 : 0.075, th = tearBig ? 0.20 : 0.09;
      box(b, tx - tw * 0.5, ty - th * 0.5, -0.13 * bulk - 0.004, tx + tw * 0.5, ty + th * 0.5, -0.13 * bulk + 0.02,
        tearBig ? COL.fleshDark : COL.flesh, { faces: Z.Mesh.FACE.NZ | Z.Mesh.FACE.PY, shade: false });
      if (tearBig) {
        // a couple of pale rib hints across the wound
        for (let i = 0; i < 3; i++) {
          const ry = ty - th * 0.28 + i * th * 0.28;
          box(b, tx - tw * 0.42, ry - 0.012, -0.13 * bulk - 0.008, tx + tw * 0.42, ry + 0.012, -0.13 * bulk + 0.006,
            COL.bone, { shade: false });
        }
      }
    }

    function neckHead() {
      const nk = rest[J.neck], hd = rest[J.head];
      b.setJoint(J.neck);
      b.setColor(COL.skinDark[0], COL.skinDark[1], COL.skinDark[2]);
      b.cyl(nk[0], nk[2], 0.066 * rk, 0.074 * rk, nk[1] - 0.015, nk[1] + 0.075, 7, { caps: false, uvScale: 3 });

      b.setJoint(J.head);
      const hx = hd[0], hy = hd[1], hz = hd[2];
      // skull block, slightly forward-heavy, narrower at jaw
      box(b, hx - 0.082 * rk, hy - 0.015, hz - 0.088 * rk, hx + 0.082 * rk, hy + 0.175, hz + 0.088 * rk, COL.skin);
      // slack lower jaw, dropped open and pushed slightly forward
      box(b, hx - 0.062 * rk, hy - 0.075, hz - 0.086 * rk, hx + 0.062 * rk, hy - 0.005, hz + 0.028 * rk, COL.skinDark);
      // exposed teeth strip where the jaw hangs open
      box(b, hx - 0.05 * rk, hy - 0.028, hz - 0.09 * rk, hx + 0.05 * rk, hy - 0.010, hz - 0.06 * rk, COL.teeth, { shade: false });
      // Brow ridge: a dark band straight across, so the whole upper face is
      // in shadow and the head stops reading as one flat lit card.
      box(b, hx - 0.084 * rk, hy + 0.118, hz - 0.094 * rk, hx + 0.084 * rk, hy + 0.150, hz - 0.062 * rk,
        COL.skinDark, { shade: false });
      // sunken eye sockets — dark recess, then a smaller glowing pupil set
      // just proud of it so the amber reads as coming from inside the skull.
      box(b, hx - 0.062 * rk, hy + 0.092, hz - 0.095 * rk, hx - 0.014 * rk, hy + 0.132, hz - 0.066 * rk, COL.eye, { shade: false });
      box(b, hx + 0.014 * rk, hy + 0.092, hz - 0.095 * rk, hx + 0.062 * rk, hy + 0.132, hz - 0.066 * rk, COL.eye, { shade: false });
      // cheekbone shadow under each socket — the hollow-cheeked corpse read
      box(b, hx - 0.070 * rk, hy + 0.040, hz - 0.092 * rk, hx - 0.020 * rk, hy + 0.078, hz - 0.070 * rk,
        COL.skinDark, { shade: false });
      box(b, hx + 0.020 * rk, hy + 0.040, hz - 0.092 * rk, hx + 0.070 * rk, hy + 0.078, hz - 0.070 * rk,
        COL.skinDark, { shade: false });
      b.setEmissive(1);
      box(b, hx - 0.050 * rk, hy + 0.106, hz - 0.098 * rk, hx - 0.026 * rk, hy + 0.124, hz - 0.086 * rk, COL.eyeGlow, { shade: false });
      box(b, hx + 0.026 * rk, hy + 0.106, hz - 0.098 * rk, hx + 0.050 * rk, hy + 0.124, hz - 0.086 * rk, COL.eyeGlow, { shade: false });
      b.setEmissive(0);
      // torn cheek patch
      box(b, hx + 0.055 * rk, hy + 0.02, hz - 0.05 * rk, hx + 0.086 * rk, hy + 0.06, hz + 0.01 * rk, COL.fleshDark, { shade: false });

      if (opts.helmet) {
        b.setColor(COL.helmet[0], COL.helmet[1], COL.helmet[2]);
        // stahlhelm shell: two stacked tapered rings + a brim skirt
        b.cyl(hx, hz, 0.02 * rk, 0.098 * rk, hy + 0.14, hy + 0.185, 8, { caps: false, uvScale: 3 });
        b.cyl(hx, hz, 0.098 * rk, 0.104 * rk, hy + 0.10, hy + 0.145, 8, { caps: true, uvScale: 3 });
        box(b, hx - 0.108 * rk, hy + 0.088, hz - 0.112 * rk, hx + 0.108 * rk, hy + 0.108, hz + 0.112 * rk, COL.helmetDark);
      }
    }

    function arm(side) {
      const L = side === 'L';
      const shJ = L ? J.shoulderL : J.shoulderR, arJ = L ? J.armL : J.armR;
      const faJ = L ? J.foreArmL : J.foreArmR, haJ = L ? J.handL : J.handR;
      const sh = rest[shJ], ar = rest[arJ], fa = rest[faJ], ha = rest[haJ];

      // sleeve cap at the shoulder socket (owned by shoulder joint — stays
      // fixed to the torso, does not swing with the arm)
      b.setJoint(shJ);
      b.setColor(COL.clothWorn[0] * 0.9, COL.clothWorn[1] * 0.9, COL.clothWorn[2] * 0.9);
      b.cyl(sh[0], sh[2], 0.005 * rk, 0.078 * rk, sh[1] - 0.03, sh[1] + 0.03, 6, { caps: true, uvScale: 3 });

      // upper arm — sleeve coloured, tapered
      b.setJoint(arJ);
      b.setColor(COL.sleeve[0], COL.sleeve[1], COL.sleeve[2]);
      limbDown(b, ar[0], ar[1], ar[2], REACH[arJ === J.armL ? 'armL' : 'armR'] * hsc, 0.068 * rk, 0.056 * rk);

      // forearm — sleeve for the top third, bare grimy skin below (rolled cuff)
      b.setJoint(faJ);
      const faLen = REACH[faJ === J.foreArmL ? 'foreArmL' : 'foreArmR'] * hsc;
      b.setColor(COL.sleeveDark[0], COL.sleeveDark[1], COL.sleeveDark[2]);
      limbDown(b, fa[0], fa[1], fa[2], faLen * 0.4, 0.056 * rk, 0.049 * rk);
      const cuffY = fa[1] - faLen * 0.4;
      b.setColor(COL.skinDark[0], COL.skinDark[1], COL.skinDark[2]);
      limbDown(b, fa[0], cuffY, fa[2], faLen * 0.6, 0.049 * rk, 0.039 * rk);

      // hand — palm paddle + three splayed clawed fingers, reaching
      b.setJoint(haJ);
      b.setColor(COL.skinDark[0], COL.skinDark[1], COL.skinDark[2]);
      ob(b, ha[0], ha[1] - 0.035, ha[2] - 0.01, 0.042 * rk, 0.052, 0.020, 0, 0, 0, {});
      for (let i = 0; i < 3; i++) {
        const spread = (i - 1) * 0.34;
        const fx = ha[0] + spread * 0.045;
        ob(b, fx, ha[1] - 0.090, ha[2] - 0.048, 0.014 * rk, 0.044, 0.014, 0.55 + spread * 0.3, spread * 0.5, spread * 0.2, {});
      }
      // thumb, angled off the side — without it the hand ended in a paddle
      ob(b, ha[0] + (L ? -0.036 : 0.036) * rk, ha[1] - 0.062, ha[2] - 0.020,
        0.013 * rk, 0.034, 0.013, 0.30, 0, (L ? -0.7 : 0.7), {});
    }

    function leg(side) {
      const L = side === 'L';
      const hpJ = L ? J.hipL : J.hipR, lgJ = L ? J.legL : J.legR;
      const shJ = L ? J.shinL : J.shinR, ftJ = L ? J.footL : J.footR;
      const lg = rest[lgJ], sh = rest[shJ], ft = rest[ftJ];

      // thigh — muddy trouser colour, tapered
      b.setJoint(lgJ);
      b.setColor(COL.trouser[0], COL.trouser[1], COL.trouser[2]);
      const thighLen = REACH[lgJ === J.legL ? 'legL' : 'legR'] * hsc;
      limbDown(b, lg[0], lg[1], lg[2], thighLen, 0.078 * rk, 0.063 * rk);

      // shin — trouser top, leather boot bottom
      b.setJoint(shJ);
      const shinLen = REACH[shJ === J.shinL ? 'shinL' : 'shinR'] * hsc;
      b.setColor(COL.trouserDark[0], COL.trouserDark[1], COL.trouserDark[2]);
      limbDown(b, sh[0], sh[1], sh[2], shinLen * 0.55, 0.063 * rk, 0.053 * rk);
      const bootY = sh[1] - shinLen * 0.55;
      b.setColor(COL.leather[0], COL.leather[1], COL.leather[2]);
      limbDown(b, sh[0], bootY, sh[2], shinLen * 0.45, 0.055 * rk, 0.050 * rk);

      // boot — wedge extending forward, dark sole
      b.setJoint(ftJ);
      b.setColor(COL.leatherHi[0], COL.leatherHi[1], COL.leatherHi[2]);
      box(b, ft[0] - 0.058 * rk, ft[1] - 0.032, ft[2] - 0.20 * rk, ft[0] + 0.058 * rk, ft[1] + 0.059, ft[2] + 0.050 * rk, null);
      b.setColor(COL.leatherHi[0] * 0.55, COL.leatherHi[1] * 0.55, COL.leatherHi[2] * 0.55);
      box(b, ft[0] - 0.066 * rk, ft[1] - 0.048, ft[2] - 0.212 * rk, ft[0] + 0.066 * rk, ft[1] - 0.028, ft[2] + 0.056 * rk, null);
    }

    function stump(joint, at, dir) {
      b.setJoint(joint);
      b.setColor(COL.fleshDark[0], COL.fleshDark[1], COL.fleshDark[2]);
      ob(b, at[0], at[1] - dir * 0.06, at[2], 0.05, 0.07, 0.05, 0, 0, 0, {});
      b.setColor(COL.bone[0], COL.bone[1], COL.bone[2]);
      ob(b, at[0], at[1] - dir * 0.10, at[2], 0.014, 0.03, 0.014, 0, 0, 0, { shade: false });
    }

    torso();
    neckHead();

    if (opts.missingArm === 'L') stump(J.shoulderL, rest[J.shoulderL], -1);
    else arm('L');
    if (opts.missingArm === 'R') stump(J.shoulderR, rest[J.shoulderR], -1);
    else arm('R');

    if (opts.legless) {
      stump(J.hipL, [rest[J.legL][0], rest[J.legL][1] - 0.05, rest[J.legL][2]], -1);
      stump(J.hipR, [rest[J.legR][0], rest[J.legR][1] - 0.05, rest[J.legR][2]], -1);
    } else {
      leg('L'); leg('R');
    }

    b.shadeBy(ao);
    const mesh = b.finish('zombie_skin');
    mesh.heightScale = hsc;
    mesh.bulk = bulk;
    return mesh;
  }
  Mo._buildZombieMesh = buildZombieMesh;

  // =========================================================================
  //  Mo.build() — zombie base mesh + variants (guns/props/arms appended by
  //  later sections of this file; this call is extended below).
  // =========================================================================
  Mo._built = false;
  Mo.build = function () {
    if (Mo._built) return Mo;

    Mo.zombie = buildZombieMesh({ seed: 1 });

    Mo.zombieVariants = [
      Object.assign(buildZombieMesh({ seed: 2, heightScale: 1.08 }), { variant: 'tall' }),
      Object.assign(buildZombieMesh({ seed: 3, heightScale: 0.92, bulk: 1.08 }), { variant: 'short' }),
      Object.assign(buildZombieMesh({ seed: 4, bulk: 1.32 }), { variant: 'bulky' }),
      Object.assign(buildZombieMesh({ seed: 5, helmet: true }), { variant: 'helmet' }),
      Object.assign(buildZombieMesh({ seed: 6, tornCoat: true }), { variant: 'tornCoat' }),
      Object.assign(buildZombieMesh({ seed: 7, missingArm: 'R' }), { variant: 'missingArmR' }),
      Object.assign(buildZombieMesh({ seed: 8, legless: true, heightScale: 0.94 }), { variant: 'crawlerLegless' }),
    ];

    Mo.guns = {};
    for (const id in GUN_SPEC) Mo.guns[id] = buildGun(id, GUN_SPEC[id]);
    for (const alias in GUN_ALIAS) Mo.guns[alias] = Mo.guns[GUN_ALIAS[alias]];
    // The knife is the arms alone; give it a stub so callers never miss.
    Mo.guns.knife = { mesh: buildGun('knife', {
      bl: 0.16, br: 0.010, rl: 0.06, rh: 0.030, rw: 0.014,
      stock: 'none', mag: 'none', ml: 0, fore: 'none', sights: 'none',
    }).mesh, muzzle: [0, 0, -0.2], ejectPort: [0, 0, 0], spec: { bl: 0.16, rl: 0.06 } };
    Mo.guns.stielhandgranate = Mo.guns.knife;

    Mo.arms = buildArms();
    Mo.props = buildProps();

    Mo._built = true;
    return Mo;
  };

  // =========================================================================
  //  ANIMATION — procedural curves (sin/cos + shaped envelopes), not
  //  keyframe tables, so everything scales with params.speed and blends.
  //
  //  Sign convention (verified against Z.M.m4's rotX/rotY/rotZ, see header):
  //    A joint whose child offset points +Y (spine/chest/neck) is an
  //    "upright" bone: NEGATIVE pitch tips it toward -Z (forward = hunch).
  //    A joint whose child offset points -Y (arm/leg segments) is a
  //    "hanging" bone: POSITIVE pitch swings it toward -Z (forward reach /
  //    forward stride). Both cases are wrapped below so anim code just
  //    reads "hunchFwd(20)" / "swingFwd(30)" and never has to think about
  //    which raw sign that needs.
  // =========================================================================
  const hunchFwd = (deg) => -deg * DEG;
  const hunchBack = (deg) => deg * DEG;
  const swingFwd = (deg) => deg * DEG;
  const swingBack = (deg) => -deg * DEG;
  const rollOut = (side, deg) => (side === 'L' ? -deg : deg) * DEG;   // abduction, away from midline
  const yawTo = (side, deg) => (side === 'L' ? deg : -deg) * DEG;      // twist toward that side

  function add(rot, j, rx, ry, rz) {
    const r = rot[j];
    r.rx += rx || 0; r.ry += ry || 0; r.rz += rz || 0;
  }
  function set(rot, j, rx, ry, rz) {
    const r = rot[j];
    r.rx = rx || 0; r.ry = ry || 0; r.rz = rz || 0;
  }
  function resetRot(rot) {
    for (let i = 0; i < NJ; i++) { const r = rot[i]; r.rx = 0; r.ry = 0; r.rz = 0; }
  }

  // Deterministic per-zombie "personality" derived from params.seed — this
  // is what keeps a horde from moving in perfect lockstep (art requirement:
  // shamble must be asymmetric and slightly randomised per zombie).
  function personality(seed) {
    return {
      limpSide: h(seed, 1) < 0.5 ? 'L' : 'R',
      limpAmt: 0.40 + h(seed, 2) * 0.45,     // 0.40..0.85 — how bad the drag is
      freqJ: 0.90 + h(seed, 3) * 0.20,       // 0.90..1.10 — stride cadence variance
      phaseOff: h(seed, 4),                  // 0..1 — desyncs the horde's footfall
      headTilt: hs(seed, 5) * 9 * DEG,
      shoulderDroop: hs(seed, 6) * 7 * DEG,
      armAsym: hs(seed, 7) * 9 * DEG,
      reachBias: hs(seed, 8) * 8 * DEG,
      yawWobble: 0.5 + h(seed, 9) * 0.8,
    };
  }

  // The "ready" low grasping-reach base pose that shamble/walk/run/stagger
  // all layer their locomotion on top of. Also what an idle T=0 frame shows.
  function basePose(rot, P, reachAmt) {
    reachAmt = reachAmt === undefined ? 1 : reachAmt;
    add(rot, J.spine, hunchFwd(11));
    add(rot, J.chest, hunchFwd(15) + P.shoulderDroop * 0.2);
    add(rot, J.neck, hunchBack(6));
    add(rot, J.head, hunchBack(10), P.headTilt, P.headTilt * 0.4);

    for (const side of ['L', 'R']) {
      const sh = side === 'L' ? J.shoulderL : J.shoulderR;
      const ar = side === 'L' ? J.armL : J.armR;
      const fa = side === 'L' ? J.foreArmL : J.foreArmR;
      const asym = (side === 'L' ? -1 : 1) * P.armAsym;
      add(rot, sh, 0, 0, (side === 'L' ? 1 : -1) * P.shoulderDroop * 0.5);
      add(rot, ar, swingFwd((58 + P.reachBias) * reachAmt) + asym * 0.3, 0, rollOut(side, 14 * reachAmt));
      add(rot, fa, swingFwd(10 + 38 * reachAmt), 0, 0);
    }
  }

  // Leg stride cycle. amp/kneeAmp in degrees, phase in [0,1). Applies the
  // per-instance limp automatically.
  function legCycle(rot, ph, amp, kneeAmp, P, hipSwayDeg) {
    for (const side of ['L', 'R']) {
      const isL = side === 'L';
      const sp = (((isL ? ph + 0.5 : ph) % 1) + 1) % 1;
      const isLimp = side === P.limpSide;
      const a = isLimp ? amp * (1 - P.limpAmt) : amp;
      const k = isLimp ? kneeAmp * (1 - P.limpAmt * 0.75) : kneeAmp;
      const swing = sin(sp * TAU);
      const lift = max(0, sin(sp * TAU));
      const legJ = J['leg' + side], shinJ = J['shin' + side], footJ = J['foot' + side], hipJ = J['hip' + side];
      add(rot, legJ, swingFwd(a * swing));
      add(rot, shinJ, swingBack(k * lift));
      add(rot, footJ, swingFwd(-0.30 * a * swing));
      if (hipSwayDeg) add(rot, hipJ, 0, 0, (isL ? -1 : 1) * hipSwayDeg * DEG * max(0, -swing));
    }
  }

  function applyHurtJitter(rot, t, hurt) {
    if (!hurt) return;
    add(rot, J.head, sin(t * 23.1) * hurt * 4 * DEG, sin(t * 13.7) * hurt * 7 * DEG, sin(t * 17.3 + 1) * hurt * 3 * DEG);
    add(rot, J.handL, sin(t * 29 + 2) * hurt * 12 * DEG, 0, sin(t * 31) * hurt * 9 * DEG);
    add(rot, J.handR, sin(t * 27 + 3) * hurt * 12 * DEG, 0, sin(t * 33 + 1) * hurt * 9 * DEG);
    add(rot, J.spine, sin(t * 19 + 1) * hurt * 3 * DEG, 0, sin(t * 15) * hurt * 2 * DEG);
  }

  function damp(rot, j, amt) { const r = rot[j]; r.rx *= amt; r.ry *= amt; r.rz *= amt; }
  function applyLimbsMissing(rot, missing) {
    if (!missing) return;
    if (missing.armL) { damp(rot, J.shoulderL, 0.3); damp(rot, J.armL, 0.15); damp(rot, J.foreArmL, 0.1); damp(rot, J.handL, 0.1); }
    if (missing.armR) { damp(rot, J.shoulderR, 0.3); damp(rot, J.armR, 0.15); damp(rot, J.foreArmR, 0.1); damp(rot, J.handR, 0.1); }
    if (missing.legL) { damp(rot, J.legL, 0.2); damp(rot, J.shinL, 0.2); damp(rot, J.footL, 0.2); }
    if (missing.legR) { damp(rot, J.legR, 0.2); damp(rot, J.shinR, 0.2); damp(rot, J.footR, 0.2); }
  }

  // Forces a low, legless-reading silhouette on top of WHATEVER anim is
  // currently playing — used when params.crawler is set so a crawler still
  // looks like a crawler mid-attack, mid-hurt, etc.
  function applyCrawlerTuck(rot, rootExtra) {
    for (const side of ['L', 'R']) {
      set(rot, J['leg' + side], swingBack(66), 0, 0);
      set(rot, J['shin' + side], swingBack(118), 0, 0);
      set(rot, J['foot' + side], swingFwd(38), 0, 0);
    }
    rootExtra[1] -= 0.56;
    add(rot, J.chest, hunchFwd(28));
    add(rot, J.spine, hunchFwd(14));
  }

  // -------------------------------------------------------------------------
  //  Per-anim functions. Signature: fn(rot, phase, localT, params, P, rootExtra)
  //  `phase` is localT/duration in [0,1). Looping anims must satisfy
  //  fn(...,phase=0,...) approx== fn(...,phase=1,...); see animDuration().
  // -------------------------------------------------------------------------
  function animShamble(rot, ph, lt, params, P, rootExtra) {
    // Arms hang heavy. rollOut() scales with this, so a high value here reads
    // as a T-pose from across the room; reaching belongs to run and attack.
    basePose(rot, P, 0.20);
    legCycle(rot, ph, 20, 34, P, 3.5);
    rootExtra[1] += -0.012 + 0.012 * sin(ph * TAU * 2 - 0.6);
    rootExtra[0] += 0.012 * sin(ph * TAU) * P.yawWobble;
    add(rot, J.chest, 0, 0.05 * sin(ph * TAU) * P.yawWobble, 0);
    add(rot, J.spine, 0, -0.03 * sin(ph * TAU), 0);
    // small idle arm sway so the reach never looks perfectly frozen
    add(rot, J.armL, swingFwd(7 * sin(ph * TAU * 2 + 1)));
    add(rot, J.armR, swingFwd(7 * sin(ph * TAU * 2 + 1 + PI)));
  }

  function animWalk(rot, ph, lt, params, P, rootExtra) {
    basePose(rot, P, 0.35);
    legCycle(rot, ph, 26, 40, P, 4.5);
    rootExtra[1] += -0.016 + 0.016 * sin(ph * TAU * 2 - 0.6);
    rootExtra[0] += 0.014 * sin(ph * TAU) * P.yawWobble;
    add(rot, J.chest, 0, 0.07 * sin(ph * TAU) * P.yawWobble, 0);
    add(rot, J.armL, swingFwd(11 * sin(ph * TAU * 2 + 1)));
    add(rot, J.armR, swingFwd(11 * sin(ph * TAU * 2 + 1 + PI)));
  }

  function animRun(rot, ph, lt, params, P, rootExtra) {
    basePose(rot, P, 0.7);
    legCycle(rot, ph, 42, 62, P, 6);
    add(rot, J.spine, hunchFwd(6));
    add(rot, J.chest, hunchFwd(8));
    rootExtra[1] += -0.03 + 0.03 * abs(sin(ph * TAU * 2));
    rootExtra[2] += -0.01 * abs(sin(ph * TAU * 2));
    // arms pump harder, more opposite-phase to legs — a manic zombie sprint
    add(rot, J.armL, swingFwd(26 * sin(ph * TAU + PI)));
    add(rot, J.armR, swingFwd(26 * sin(ph * TAU)));
    add(rot, J.foreArmL, swingFwd(14 * max(0, sin(ph * TAU + PI))));
    add(rot, J.foreArmR, swingFwd(14 * max(0, sin(ph * TAU))));
  }

  function animStagger(rot, ph, lt, params, P, rootExtra) {
    basePose(rot, P, 1);
    legCycle(rot, ph, 10, 16, P, 9);
    const wob = sin(ph * TAU);
    add(rot, J.spine, 0, 0, 10 * DEG * wob);
    add(rot, J.chest, hunchFwd(4 * sin(ph * TAU * 0.5)), 0, 8 * DEG * -wob);
    add(rot, J.head, 0, 12 * DEG * sin(ph * TAU * 1.3), 0);
    add(rot, J.armL, swingFwd(10 * sin(ph * TAU * 1.7)), 0, rollOut('L', 8 * abs(wob)));
    add(rot, J.armR, swingFwd(10 * sin(ph * TAU * 1.7 + 1)), 0, rollOut('R', 8 * abs(wob)));
    rootExtra[0] += 0.03 * wob;
    rootExtra[1] += -0.01 * abs(wob);
  }

  // Windup -> strike -> recover. Uses params.attackPhase when supplied (the
  // caller usually drives this explicitly so the "hit" instant lines up with
  // damage application); falls back to time-driven phase otherwise.
  function animAttack(rot, ph, lt, params, P, rootExtra) {
    const p = (params.attackPhase !== undefined) ? clamp01(params.attackPhase) : ph;
    basePose(rot, P, 0.5);
    let windup, strike;
    if (p < 0.42) { windup = smoothstep(0, 0.42, p); strike = 0; }
    else if (p < 0.58) { windup = 1; strike = smoothstep(0.42, 0.58, p); }
    else { windup = 1 - smoothstep(0.58, 1, p); strike = 1 - smoothstep(0.58, 1, p); }
    add(rot, J.spine, hunchBack(10 * windup) + hunchFwd(26 * strike));
    add(rot, J.chest, hunchBack(8 * windup) + hunchFwd(30 * strike));
    add(rot, J.head, hunchBack(6 * strike));
    for (const side of ['L', 'R']) {
      const ar = J['arm' + side], fa = J['foreArm' + side], sh = J['shoulder' + side];
      add(rot, ar, swingBack(46 * windup) + swingFwd(96 * strike), 0, rollOut(side, 22 * windup + 10 * strike));
      add(rot, fa, swingBack(30 * windup) + swingFwd(70 * strike));
      add(rot, sh, 0, 0, (side === 'L' ? 1 : -1) * 6 * DEG * windup);
    }
    legCycle(rot, ph * 0.3, 8, 12, P, 0);
    rootExtra[2] += -0.05 * strike;
    rootExtra[1] += -0.02 * windup;
  }

  // Repeated haul-yourself-up-and-over stroke, used while queued at a window.
  function animClimb(rot, ph, lt, params, P, rootExtra) {
    add(rot, J.spine, hunchFwd(30));
    add(rot, J.chest, hunchFwd(24));
    add(rot, J.head, hunchFwd(4));
    const pull = smoothstep(0, 0.55, ph) - smoothstep(0.55, 1, ph);
    for (const side of ['L', 'R']) {
      const lead = side === 'L' ? ph : (ph + 0.5) % 1;
      const reach = smoothstep(0, 0.5, lead) * (1 - smoothstep(0.5, 1, lead));
      const ar = J['arm' + side], fa = J['foreArm' + side];
      add(rot, ar, swingFwd(30) + swingBack(110 * reach), 0, rollOut(side, 10));
      add(rot, fa, swingFwd(20) + swingFwd(70 * reach));
    }
    // one leg drives up and over each stroke
    const driveSide = ph < 0.5 ? 'R' : 'L';
    const driveP = (ph < 0.5 ? ph : ph - 0.5) * 2;
    const kick = sin(driveP * PI);
    add(rot, J['leg' + driveSide], swingFwd(70 * kick));
    add(rot, J['shin' + driveSide], swingBack(90 * kick));
    add(rot, J['leg' + (driveSide === 'L' ? 'R' : 'L')], swingFwd(12));
    rootExtra[1] += 0.05 * pull - 0.02;
  }

  // Both arms grip a board and yank it, repeatedly.
  function animTearBoard(rot, ph, lt, params, P, rootExtra) {
    add(rot, J.spine, hunchFwd(16));
    add(rot, J.chest, hunchFwd(20));
    const grip = smoothstep(0, 0.30, ph);
    const yank = smoothstep(0.30, 0.55, ph) - smoothstep(0.55, 0.65, ph);
    const settle = smoothstep(0.65, 1, ph);
    const ext = grip - yank * 0.9 - settle * 0;
    for (const side of ['L', 'R']) {
      const ar = J['arm' + side], fa = J['foreArm' + side];
      add(rot, ar, swingFwd(70 * (1 - ext * 0.5)), 0, rollOut(side, 8));
      add(rot, fa, swingFwd(50 - 40 * (yank)));
    }
    add(rot, J.chest, hunchBack(14 * yank));
    add(rot, J.spine, hunchBack(6 * yank));
    rootExtra[2] += 0.03 * yank;
    rootExtra[1] += -0.015 * yank;
  }

  // Legless-reading drag: torso low and near-horizontal, legs tucked away,
  // arms alternately reach forward, grip, and haul the body forward.
  function animCrawler(rot, ph, lt, params, P, rootExtra) {
    add(rot, J.spine, hunchFwd(38));
    add(rot, J.chest, hunchFwd(46));
    add(rot, J.neck, hunchBack(20));
    add(rot, J.head, hunchBack(14), P.headTilt, 0);
    for (const side of ['L', 'R']) {
      const isL = side === 'L';
      const sp = (((isL ? ph : ph + 0.5) % 1) + 1) % 1;
      const reach = smoothstep(0, 0.5, sp) * (1 - smoothstep(0.5, 1, sp));
      const pull = smoothstep(0.5, 0.85, sp) - smoothstep(0.85, 1, sp);
      const ar = J['arm' + side], fa = J['foreArm' + side];
      add(rot, ar, swingFwd(30 + 55 * reach - 40 * pull), 0, rollOut(side, 16));
      add(rot, fa, swingFwd(20 + 30 * reach + 30 * pull));
    }
    for (const side of ['L', 'R']) {
      set(rot, J['leg' + side], swingBack(64), 0, 0);
      set(rot, J['shin' + side], swingBack(112), 0, 0);
      set(rot, J['foot' + side], swingFwd(34), 0, 0);
    }
    rootExtra[1] += -0.58 + 0.02 * sin(ph * TAU * 2);
    rootExtra[2] += 0.02 * sin(ph * TAU);
  }

  // ---- one-shot death / spawn curves --------------------------------------
  function animDeathFallForward(rot, ph, lt, params, P, rootExtra) {
    const c = smoothstep(0, 1, ph);
    const kick = sin(clamp01(ph * 2.4) * PI) * (1 - c) * 0.5;
    add(rot, J.spine, hunchFwd(11 + 70 * c));
    add(rot, J.chest, hunchFwd(15 + 78 * c));
    add(rot, J.neck, hunchBack(6 - 30 * c));
    add(rot, J.head, hunchBack(10 - 40 * c), P.headTilt, 0);
    for (const side of ['L', 'R']) {
      add(rot, J['arm' + side], swingFwd(58) + swingBack(40 * kick) + swingFwd(30 * c), 0, rollOut(side, 14 + 20 * c));
      add(rot, J['foreArm' + side], swingFwd(48 - 20 * c));
      add(rot, J['leg' + side], swingBack(8 * c));
      add(rot, J['shin' + side], swingBack(30 * c * (1 - c) * 2.2));
    }
    rootExtra[1] += -0.90 * c;
    rootExtra[2] += -0.34 * c;
  }

  function animDeathFallBack(rot, ph, lt, params, P, rootExtra) {
    const c = smoothstep(0, 1, ph);
    add(rot, J.spine, hunchFwd(11) + hunchBack(80 * c));
    add(rot, J.chest, hunchFwd(15) + hunchBack(88 * c));
    add(rot, J.neck, hunchBack(6 + 20 * c));
    add(rot, J.head, hunchBack(10 + 24 * c));
    for (const side of ['L', 'R']) {
      add(rot, J['arm' + side], swingFwd(58) + swingBack(90 * c), 0, rollOut(side, 14 + 26 * c));
      add(rot, J['foreArm' + side], swingFwd(48 - 30 * c));
      add(rot, J['leg' + side], swingFwd(34 * c));
      add(rot, J['shin' + side], swingBack(14 * c));
    }
    rootExtra[1] += -0.86 * c;
    rootExtra[2] += 0.30 * c;
  }

  function animDeathHeadshot(rot, ph, lt, params, P, rootExtra) {
    const snap = clamp01(ph / 0.18);
    const snapEase = snap < 1 ? sin(snap * PI * 0.5) : 1 - (snap - 1);
    const c = smoothstep(0.12, 1, ph);
    add(rot, J.neck, hunchBack(6 + 55 * snapEase * (1 - c) + 22 * c));
    add(rot, J.head, hunchBack(10 + 70 * snapEase * (1 - c) + 26 * c), 30 * DEG * snapEase * (1 - c), 18 * DEG * snapEase);
    add(rot, J.spine, hunchFwd(11) + hunchBack(70 * c));
    add(rot, J.chest, hunchFwd(15) + hunchBack(78 * c));
    for (const side of ['L', 'R']) {
      add(rot, J['arm' + side], swingFwd(58) + swingBack(80 * c), 0, rollOut(side, 14 + 24 * c));
      add(rot, J['foreArm' + side], swingFwd(48 - 26 * c));
      add(rot, J['leg' + side], swingFwd(20 * c));
      add(rot, J['shin' + side], swingBack(30 * c * (1 - c) * 2.2));
    }
    applyHurtJitter(rot, lt, (1 - c) * 0.6);
    rootExtra[1] += -0.84 * c;
    rootExtra[2] += 0.22 * c;
  }

  function animDeathGib(rot, ph, lt, params, P, rootExtra) {
    const c = 1 - smoothstep(0, 0.6, ph);   // fast burst, then held
    const burst = 1 - c;
    add(rot, J.spine, hunchBack(50 * burst));
    add(rot, J.chest, hunchBack(60 * burst));
    add(rot, J.head, hunchBack(50 * burst), 60 * DEG * burst * P.yawWobble, 40 * DEG * burst);
    for (const side of ['L', 'R']) {
      add(rot, J['arm' + side], swingBack(120 * burst), 0, rollOut(side, 70 * burst));
      add(rot, J['foreArm' + side], swingBack(60 * burst));
      add(rot, J['leg' + side], swingFwd(60 * burst), 0, rollOut(side, 40 * burst));
      add(rot, J['shin' + side], swingBack(70 * burst));
    }
    rootExtra[1] += -0.25 * burst;
  }

  function animSpawnRise(rot, ph, lt, params, P, rootExtra) {
    const r = smoothstep(0, 1, ph);
    // buried pose: curled tight, low; ready pose: normal shamble base
    basePose(rot, P, lerp(0.35, 1, r));
    for (const side of ['L', 'R']) {
      add(rot, J['leg' + side], swingBack(lerp(70, 0, r)));
      add(rot, J['shin' + side], swingBack(lerp(120, 0, r)));
      add(rot, J['arm' + side], swingFwd(lerp(40, 0, min(1, r * 1.4))));
    }
    add(rot, J.spine, hunchFwd(lerp(46, 0, min(1, r * 1.3))));
    add(rot, J.chest, hunchFwd(lerp(30, 0, min(1, r * 1.3))));
    const settle = ph > 0.92 ? sin((ph - 0.92) / 0.08 * PI) * 0.03 : 0;
    rootExtra[1] += lerp(-1.05, 0, r) + settle;
  }

  const ANIM_TABLE = {
    shamble: { dur: 1.6, loop: true, fn: animShamble },
    walk: { dur: 1.05, loop: true, fn: animWalk },
    run: { dur: 0.62, loop: true, fn: animRun },
    attack: { dur: 0.9, loop: true, fn: animAttack },
    climb: { dur: 1.4, loop: true, fn: animClimb },
    tear_board: { dur: 1.0, loop: true, fn: animTearBoard },
    crawler: { dur: 1.3, loop: true, fn: animCrawler },
    stagger: { dur: 0.8, loop: true, fn: animStagger },
    death_fall_forward: { dur: 1.1, loop: false, fn: animDeathFallForward },
    death_fall_back: { dur: 1.1, loop: false, fn: animDeathFallBack },
    death_headshot: { dur: 0.9, loop: false, fn: animDeathHeadshot },
    death_gib: { dur: 0.5, loop: false, fn: animDeathGib },
    spawn_rise: { dur: 1.8, loop: false, fn: animSpawnRise },
  };
  Mo.ANIMS = Object.keys(ANIM_TABLE);

  Mo.animDuration = function (name) {
    const def = ANIM_TABLE[name];
    return def ? def.dur : ANIM_TABLE.shamble.dur;
  };

  // -------------------------------------------------------------------------
  //  Mo.poseZombie(out, anim, t, params)
  //  out: Float32Array(NJ*3*4) = Float32Array(264) — 22 joints x mat3x4
  //  (3 rows of vec4, row-major), exactly matching VS_SCENE's `uJoints[66]`
  //  (66 vec4 = 264 floats) in 12_render.js's SKINNED branch:
  //    int j = int(aJoint+0.5)*3; r0=uJoints[j]; r1=uJoints[j+1]; r2=uJoints[j+2];
  //    outPos = vec3(dot(r0,p4), dot(r1,p4), dot(r2,p4));
  //  params = { speed, hurt, crawler, seed, attackPhase, lean, limbsMissing,
  //             heightScale (optional, default 1 — must match the mesh
  //             variant's own .heightScale so tall/short variants pose
  //             without any seam; Mo.build()'s variants carry this on the
  //             finished mesh object as mesh.heightScale) }
  // -------------------------------------------------------------------------
  const _rotPool = []; for (let i = 0; i < NJ; i++) _rotPool.push({ rx: 0, ry: 0, rz: 0 });
  const _worldPool = []; for (let i = 0; i < NJ; i++) _worldPool.push(m4.create());
  const _skinTmp = m4.create();

  Mo.poseZombie = function (out, anim, t, params) {
    params = params || {};
    const speed = params.speed == null ? 1 : params.speed;
    const seed = params.seed || 0;
    const hscale = params.heightScale || 1;
    const P = personality(seed);
    const rot = _rotPool;
    resetRot(rot);
    const rootExtra = [0, 0, 0];

    const def = ANIM_TABLE[anim] || ANIM_TABLE.shamble;
    const dur = def.dur;
    let localT;
    if (def.loop) {
      const cyc = speed * P.freqJ;
      localT = ((((t * cyc) + P.phaseOff * dur) % dur) + dur) % dur;
    } else {
      localT = clamp(t * max(speed, 0.0001), 0, dur);
    }
    const phase = localT / dur;

    def.fn(rot, phase, localT, params, P, rootExtra);
    applyHurtJitter(rot, t, params.hurt || 0);
    if (params.lean) add(rot, J.chest, -params.lean, 0, 0);
    applyLimbsMissing(rot, params.limbsMissing);
    if (params.crawler && anim !== 'crawler') applyCrawlerTuck(rot, rootExtra);

    forwardKinematics(rot, rootExtra, hscale, _worldPool);
    const rest = restPositions(hscale);
    for (let j = 0; j < NJ; j++) {
      skinMatrix(_skinTmp, _worldPool[j], rest[j]);
      const o = j * 12;
      out[o + 0] = _skinTmp[0]; out[o + 1] = _skinTmp[4]; out[o + 2] = _skinTmp[8]; out[o + 3] = _skinTmp[12];
      out[o + 4] = _skinTmp[1]; out[o + 5] = _skinTmp[5]; out[o + 6] = _skinTmp[9]; out[o + 7] = _skinTmp[13];
      out[o + 8] = _skinTmp[2]; out[o + 9] = _skinTmp[6]; out[o + 10] = _skinTmp[10]; out[o + 11] = _skinTmp[14];
    }
    return out;
  };

  // Convenience for callers that just want the raw joint WORLD matrices this
  // frame (attaching gibs / blood emitters / a headshot hit-sphere to a
  // joint) without re-deriving FK themselves. Same params as poseZombie.
  Mo.zombieJointWorld = function (anim, t, params, jointIndex) {
    const out = new Float32Array(264);
    Mo.poseZombie(out, anim, t, params);
    return _worldPool[jointIndex]; // valid until the next poseZombie call
  };

  // ===========================================================================
  //  First-person weapon viewmodels
  //
  //  Local space: origin at the grip, barrel down -Z, up +Y. Each gun is
  //  assembled from a small parts vocabulary driven by a spec table, so the
  //  silhouettes stay distinct without twenty bespoke model functions.
  // ===========================================================================
  const WOOD = 'gun_wood', METAL = 'gun_metal';

  // spec fields:
  //  bl  barrel length      br  barrel radius
  //  rl  receiver length    rh  receiver height     rw receiver width
  //  stock  'rifle'|'folding'|'wire'|'none'|'grip'
  //  mag    'stick'|'curved'|'drum'|'box'|'pistol'|'none'|'tube'
  //  ml  magazine length
  //  fore   'wood'|'grip'|'pump'|'none'
  //  extras: bipod, bolt, doubleBarrel, scope, sciFi, sawn, rocket
  const GUN_SPEC = {
    m1911: { bl: 0.13, br: 0.017, rl: 0.15, rh: 0.075, rw: 0.030, stock: 'none', mag: 'pistol', ml: 0.11, fore: 'none', slide: true, scale: 1.0 },
    magnum357: { bl: 0.16, br: 0.019, rl: 0.13, rh: 0.078, rw: 0.034, stock: 'none', mag: 'none', ml: 0, fore: 'none', cylinder: true, scale: 1.0 },

    kar98k: { bl: 0.60, br: 0.014, rl: 0.24, rh: 0.062, rw: 0.036, stock: 'rifle', mag: 'none', ml: 0, fore: 'wood', bolt: true, sights: 'iron' },
    springfield: { bl: 0.62, br: 0.014, rl: 0.24, rh: 0.062, rw: 0.036, stock: 'rifle', mag: 'none', ml: 0, fore: 'wood', bolt: true, scope: true },
    m1a1_carbine: { bl: 0.44, br: 0.013, rl: 0.22, rh: 0.058, rw: 0.032, stock: 'rifle', mag: 'stick', ml: 0.13, fore: 'wood' },
    gewehr43: { bl: 0.52, br: 0.014, rl: 0.26, rh: 0.066, rw: 0.036, stock: 'rifle', mag: 'box', ml: 0.15, fore: 'wood' },
    stg44: { bl: 0.40, br: 0.015, rl: 0.30, rh: 0.070, rw: 0.034, stock: 'rifle', mag: 'curved', ml: 0.26, fore: 'grip' },
    fg42: { bl: 0.46, br: 0.014, rl: 0.28, rh: 0.062, rw: 0.032, stock: 'rifle', mag: 'side', ml: 0.20, fore: 'grip', bipod: true },
    bar: { bl: 0.58, br: 0.017, rl: 0.32, rh: 0.078, rw: 0.040, stock: 'rifle', mag: 'box', ml: 0.19, fore: 'wood', bipod: true },
    m1919: { bl: 0.60, br: 0.019, rl: 0.34, rh: 0.090, rw: 0.052, stock: 'grip', mag: 'none', ml: 0, fore: 'none', belt: true, bipod: true },

    thompson: { bl: 0.28, br: 0.015, rl: 0.28, rh: 0.072, rw: 0.036, stock: 'rifle', mag: 'drum', ml: 0.16, fore: 'wood', foreVertical: true },
    mp40: { bl: 0.25, br: 0.013, rl: 0.26, rh: 0.058, rw: 0.028, stock: 'folding', mag: 'stick', ml: 0.24, fore: 'none' },
    type100: { bl: 0.27, br: 0.013, rl: 0.26, rh: 0.058, rw: 0.030, stock: 'rifle', mag: 'side', ml: 0.20, fore: 'wood' },

    db_shotgun: { bl: 0.56, br: 0.020, rl: 0.16, rh: 0.062, rw: 0.052, stock: 'rifle', mag: 'none', ml: 0, fore: 'wood', doubleBarrel: true, breakOpen: true },
    sawed_off: { bl: 0.20, br: 0.021, rl: 0.14, rh: 0.060, rw: 0.052, stock: 'grip', mag: 'none', ml: 0, fore: 'none', doubleBarrel: true, breakOpen: true, sawn: true },
    trench_gun: { bl: 0.46, br: 0.019, rl: 0.20, rh: 0.066, rw: 0.038, stock: 'rifle', mag: 'tube', ml: 0.40, fore: 'pump', heatShield: true },

    ptrs41: { bl: 0.95, br: 0.020, rl: 0.34, rh: 0.075, rw: 0.040, stock: 'rifle', mag: 'box', ml: 0.16, fore: 'none', bipod: true, muzzleBrake: true, scale: 1.0 },
    panzerschreck: { bl: 0.98, br: 0.048, rl: 0.10, rh: 0.050, rw: 0.048, stock: 'grip', mag: 'none', ml: 0, fore: 'grip', rocket: true, shield: true },
    m2_flamethrower: { bl: 0.34, br: 0.020, rl: 0.20, rh: 0.060, rw: 0.036, stock: 'grip', mag: 'none', ml: 0, fore: 'grip', tanks: true },
    raygun: { bl: 0.22, br: 0.030, rl: 0.22, rh: 0.090, rw: 0.046, stock: 'none', mag: 'none', ml: 0, fore: 'none', sciFi: true },
  };

  // Aliases so callers can use either the balance id or the shorter name.
  const GUN_ALIAS = {
    carbine: 'm1a1_carbine', dbshotgun: 'db_shotgun', sawnoff: 'sawed_off',
    trenchgun: 'trench_gun', browning: 'm1919', flamethrower: 'm2_flamethrower',
  };

  // Vertex colours on gun meshes are MODULATION, not albedo.
  //
  // World brushes leave vCol at 1.0 and take their albedo entirely from
  // texture x tint; the shader multiplies all three. gun_metal's texture x
  // tint already lands at 0.237 — about right for blued steel on its own — so
  // feeding it the palette's absolute-albedo values (COL.blued at 0.105)
  // multiplied it down to 0.028 and the weapon rendered as a black cut-out.
  // These are the same palette relationships expressed as multipliers around
  // the material, so the parts still separate but the gun sits where the
  // material says it should.
  const G = {
    // Near-neutral: gun_metal's own tint already leans blue, so tinting these
    // blue as well stacked into a weapon that read as cold plastic.
    blued: [0.70, 0.68, 0.66],
    metalDark: [0.88, 0.86, 0.84],
    metal: [1.18, 1.16, 1.14],
    metalHi: [1.62, 1.60, 1.56],
    brass: [1.35, 1.05, 0.48],
    wood: [1.00, 0.92, 0.82],
    woodDark: [0.66, 0.58, 0.50],
    sleeve: [0.72, 0.80, 0.66],
    glove: [0.46, 0.40, 0.34],
  };

  function buildGun(id, spec) {
    const b = Z.Mesh.builder();
    const s = spec;
    const bl = s.bl, br = s.br, rl = s.rl, rh = s.rh, rw = s.rw;
    const zBack = 0.06;                 // receiver starts just behind the grip
    const zFront = zBack - rl;          // receiver front face
    const muzzleZ = zFront - bl;

    // --- receiver ---------------------------------------------------------
    b.setColor(G.blued[0], G.blued[1], G.blued[2]);
    b.box([-rw, -rh * 0.45, zFront], [rw, rh * 0.55, zBack], { uvScale: 3 });

    // --- barrel -----------------------------------------------------------
    const barrelY = rh * 0.20;
    if (s.doubleBarrel) {
      barrelPair(b, -rw * 0.45, barrelY, zFront, muzzleZ, br);
      barrelPair(b, rw * 0.45, barrelY, zFront, muzzleZ, br);
    } else {
      tubeZ(b, 0, barrelY, zFront, muzzleZ, br, 8);
      if (s.muzzleBrake) {
        b.setColor(G.metalHi[0], G.metalHi[1], G.metalHi[2]);
        tubeZ(b, 0, barrelY, muzzleZ + 0.06, muzzleZ - 0.03, br * 2.1, 8);
        b.setColor(G.blued[0], G.blued[1], G.blued[2]);
      }
    }

    // --- heat shield / handguard ------------------------------------------
    if (s.heatShield) {
      b.setColor(G.blued[0], G.blued[1], G.blued[2]);
      tubeZ(b, 0, barrelY, zFront - 0.03, zFront - bl * 0.62, br * 1.9, 8);
      b.setColor(G.blued[0], G.blued[1], G.blued[2]);
    }

    // --- foregrip / handguard ---------------------------------------------
    if (s.fore === 'wood') {
      b.setColor(G.wood[0], G.wood[1], G.wood[2]);
      b.box([-rw * 0.95, -rh * 0.55, zFront - bl * 0.68], [rw * 0.95, rh * 0.30, zFront + 0.01], { uvScale: 3 });
      b.setColor(G.blued[0], G.blued[1], G.blued[2]);
    } else if (s.fore === 'grip') {
      b.setColor(G.metalDark[0], G.metalDark[1], G.metalDark[2]);
      b.obox(0, -rh * 0.55 - 0.05, zFront - bl * 0.35, rw * 0.5, 0.055, 0.022, 0, 0.18, 0, { uvScale: 4 });
      b.setColor(G.blued[0], G.blued[1], G.blued[2]);
    } else if (s.fore === 'pump') {
      b.setColor(G.wood[0], G.wood[1], G.wood[2]);
      b.box([-rw * 0.9, -rh * 0.75, zFront - bl * 0.60], [rw * 0.9, -rh * 0.10, zFront - bl * 0.22], { uvScale: 4 });
      b.setColor(G.blued[0], G.blued[1], G.blued[2]);
    }
    if (s.foreVertical) {
      b.setColor(G.wood[0], G.wood[1], G.wood[2]);
      b.box([-rw * 0.7, -rh * 0.55 - 0.10, zFront - bl * 0.42], [rw * 0.7, -rh * 0.45, zFront - bl * 0.22], { uvScale: 4 });
      b.setColor(G.blued[0], G.blued[1], G.blued[2]);
    }

    // --- grip -------------------------------------------------------------
    b.setColor(s.stock === 'rifle' ? 0.55 : 0.28, s.stock === 'rifle' ? 0.36 : 0.28, s.stock === 'rifle' ? 0.20 : 0.30);
    b.obox(0, -rh * 0.45 - 0.055, zBack - 0.035, rw * 0.72, 0.062, 0.026, 0, -0.34, 0, { uvScale: 4 });
    b.setColor(G.blued[0], G.blued[1], G.blued[2]);

    // --- stock ------------------------------------------------------------
    if (s.stock === 'rifle') {
      b.setColor(G.wood[0], G.wood[1], G.wood[2]);
      b.box([-rw * 0.85, -rh * 0.75, zBack], [rw * 0.85, rh * 0.45, zBack + 0.20], { uvScale: 3 });
      b.obox(0, -rh * 0.30, zBack + 0.28, rw * 0.85, 0.055, 0.085, 0, 0.10, 0, { uvScale: 3 });
      b.setColor(G.blued[0], G.blued[1], G.blued[2]);
    } else if (s.stock === 'folding') {
      // the MP40's underfolder — thin steel struts, unmistakable in silhouette
      b.setColor(G.metal[0], G.metal[1], G.metal[2]);
      b.box([-rw * 0.75, -rh * 0.9, zBack], [-rw * 0.55, -rh * 0.72, zBack + 0.20], { uvScale: 5 });
      b.box([rw * 0.55, -rh * 0.9, zBack], [rw * 0.75, -rh * 0.72, zBack + 0.20], { uvScale: 5 });
      b.box([-rw * 0.8, -rh * 1.0, zBack + 0.20], [rw * 0.8, -rh * 0.66, zBack + 0.24], { uvScale: 5 });
      b.setColor(G.blued[0], G.blued[1], G.blued[2]);
    } else if (s.stock === 'wire') {
      b.setColor(G.metal[0], G.metal[1], G.metal[2]);
      b.box([-rw * 0.7, -rh * 0.2, zBack], [-rw * 0.5, 0, zBack + 0.22], { uvScale: 5 });
      b.box([rw * 0.5, -rh * 0.2, zBack], [rw * 0.7, 0, zBack + 0.22], { uvScale: 5 });
      b.setColor(G.blued[0], G.blued[1], G.blued[2]);
    } else if (s.stock === 'grip') {
      b.setColor(G.blued[0], G.blued[1], G.blued[2]);
      b.obox(0, -rh * 0.45 - 0.05, zBack + 0.06, rw * 0.6, 0.055, 0.024, 0, -0.30, 0, { uvScale: 4 });
      b.setColor(G.blued[0], G.blued[1], G.blued[2]);
    }

    // --- magazine ---------------------------------------------------------
    const magZ = zFront + rl * 0.35;
    const magTop = -rh * 0.42;
    if (s.mag === 'stick') {
      b.setColor(G.metalDark[0], G.metalDark[1], G.metalDark[2]);
      b.box([-rw * 0.42, magTop - s.ml, magZ - 0.028], [rw * 0.42, magTop, magZ + 0.028], { uvScale: 4 });
    } else if (s.mag === 'curved') {
      b.setColor(G.metalDark[0], G.metalDark[1], G.metalDark[2]);
      // approximate the banana curve with three tilted segments
      for (let i = 0; i < 3; i++) {
        const f = i / 3;
        b.obox(0, magTop - s.ml * (f + 0.17), magZ + f * 0.030,
          rw * 0.40, s.ml * 0.19, 0.026, 0, 0, 0, { uvScale: 4 });
      }
    } else if (s.mag === 'drum') {
      b.setColor(G.metalDark[0], G.metalDark[1], G.metalDark[2]);
      // Thompson drum — a fat disc under the receiver, the whole silhouette
      b.cyl(0, magZ, 0.085, 0.085, magTop - 0.17, magTop - 0.01, 12, { uvScale: 4, caps: true });
    } else if (s.mag === 'box') {
      b.setColor(G.metalDark[0], G.metalDark[1], G.metalDark[2]);
      b.box([-rw * 0.55, magTop - s.ml, magZ - 0.040], [rw * 0.55, magTop, magZ + 0.040], { uvScale: 4 });
    } else if (s.mag === 'side') {
      b.setColor(G.metalDark[0], G.metalDark[1], G.metalDark[2]);
      b.box([-rw - s.ml * 0.8, -rh * 0.15, magZ - 0.035], [-rw * 0.6, rh * 0.25, magZ + 0.035], { uvScale: 4 });
    } else if (s.mag === 'pistol') {
      b.setColor(G.blued[0], G.blued[1], G.blued[2]);
      b.obox(0, -rh * 0.45 - 0.055, zBack - 0.035, rw * 0.55, 0.058, 0.020, 0, -0.34, 0, { uvScale: 5 });
    } else if (s.mag === 'tube') {
      b.setColor(G.metalDark[0], G.metalDark[1], G.metalDark[2]);
      tubeZ(b, 0, -rh * 0.55, zFront - 0.02, zFront - s.ml, br * 1.15, 7);
    }
    b.setColor(G.blued[0], G.blued[1], G.blued[2]);

    // --- distinctive extras ------------------------------------------------
    if (s.bolt) {
      // Kar98k turned-down bolt handle — reads instantly
      b.setColor(G.blued[0], G.blued[1], G.blued[2]);
      b.box([rw, rh * 0.05, zBack - 0.10], [rw + 0.055, rh * 0.20, zBack - 0.065], { uvScale: 5 });
      b.obox(rw + 0.055, rh * 0.02, zBack - 0.083, 0.018, 0.018, 0.018, 0, 0, 0, { uvScale: 5 });
    }
    if (s.slide) {
      b.setColor(G.metalDark[0], G.metalDark[1], G.metalDark[2]);
      b.box([-rw * 1.06, rh * 0.10, zFront - 0.02], [rw * 1.06, rh * 0.62, zBack], { uvScale: 5 });
    }
    if (s.cylinder) {
      b.setColor(G.blued[0], G.blued[1], G.blued[2]);
      b.cyl(0, zFront + rl * 0.42, 0.030, 0.030, -rh * 0.18, rh * 0.30, 8, { uvScale: 5 });
    }
    if (s.bipod) {
      b.setColor(G.metalDark[0], G.metalDark[1], G.metalDark[2]);
      const bz = zFront - bl * 0.80;
      b.obox(-0.035, -rh * 0.55 - 0.07, bz, 0.008, 0.075, 0.008, 0, 0, 0.30, { uvScale: 6 });
      b.obox(0.035, -rh * 0.55 - 0.07, bz, 0.008, 0.075, 0.008, 0, 0, -0.30, { uvScale: 6 });
    }
    if (s.belt) {
      b.setColor(G.brass[0], G.brass[1], G.brass[2]);
      b.box([-rw * 1.4, -rh * 0.5, zFront + rl * 0.3], [-rw * 0.9, -rh * 0.1, zFront + rl * 0.6], { uvScale: 5 });
    }
    if (s.shield) {
      // Panzerschreck blast shield
      b.setColor(0.192, 0.200, 0.176);
      b.box([-0.10, -0.02, zFront - bl * 0.42], [0.10, 0.17, zFront - bl * 0.40], { uvScale: 3 });
    }
    if (s.tanks) {
      b.setColor(0.160, 0.176, 0.152);
      b.cyl(-0.05, zBack + 0.16, 0.055, 0.055, -0.06, 0.16, 9, { uvScale: 4 });
      b.cyl(0.05, zBack + 0.16, 0.055, 0.055, -0.06, 0.16, 9, { uvScale: 4 });
    }
    if (s.rocket) {
      b.setColor(G.woodDark[0], G.woodDark[1], G.woodDark[2]);
      b.cyl(0, muzzleZ + 0.10, 0.038, 0.020, -0.02, 0.02, 8, { uvScale: 4 });
      b.setColor(0.168, 0.176, 0.160);
      tubeZ(b, 0, barrelY, zFront, muzzleZ, br, 10);
    }
    if (s.sciFi) {
      // The Ray Gun: fat bulb, fins, and an emissive green core.
      b.setColor(0.120, 0.136, 0.120);
      b.cyl(0, zFront - 0.04, 0.052, 0.038, -0.02, 0.02, 10, { uvScale: 4 });
      b.box([-0.055, -0.02, zFront - 0.10], [0.055, 0.075, zFront + 0.02], { uvScale: 4 });
      for (let i = 0; i < 3; i++) {
        b.box([-0.075, 0.02 + i * 0.022, zFront + 0.02 + i * 0.012],
          [0.075, 0.032 + i * 0.022, zFront + 0.05 + i * 0.012], { uvScale: 5 });
      }
      // Glowing core. The one weapon that genuinely emits, so it uses the
      // per-vertex emissive channel rather than relying on a bright albedo
      // that the room lighting would swallow.
      b.setEmissive(1);
      b.setColor(COL.glowGreen[0], COL.glowGreen[1], COL.glowGreen[2]);
      b.cyl(0, zFront - 0.02, 0.026, 0.026, -0.012, 0.012, 8, { uvScale: 3 });
      b.setEmissive(0);
      b.setColor(G.blued[0], G.blued[1], G.blued[2]);
    }
    if (s.sights !== 'none') {
      b.setColor(G.metal[0], G.metal[1], G.metal[2]);
      b.box([-0.006, rh * 0.55, zFront - bl * 0.94], [0.006, rh * 0.55 + 0.016, zFront - bl * 0.90], { uvScale: 6 });
      b.box([-0.016, rh * 0.55, zBack - 0.055], [0.016, rh * 0.55 + 0.014, zBack - 0.035], { uvScale: 6 });
    }
    if (s.scope) {
      b.setColor(G.metalDark[0], G.metalDark[1], G.metalDark[2]);
      b.cyl(0, zFront + rl * 0.35, 0.024, 0.024, rh * 0.55, rh * 0.55, 9, { uvScale: 4 });
      tubeZ(b, 0, rh * 0.62, zFront + rl * 0.55, zFront + rl * 0.05, 0.024, 9);
    }

    // Bake a little ambient occlusion so the shapes read in near-darkness.
    b.shadeBy((x, y) => 0.60 + 0.30 * Z.M.clamp01((y + 0.12) / 0.30));

    const mesh = b.finish(METAL);
    return {
      mesh,
      muzzle: [0, barrelY, muzzleZ - 0.01],
      ejectPort: [rw * 1.1, rh * 0.25, zBack - 0.08],
      gripL: [-0.02, -rh * 0.55, zFront - bl * 0.45],
      gripR: [0.0, -rh * 0.55 - 0.05, zBack - 0.04],
      emissive: s.sciFi ? 0.5 : 0,
      spec: s,
    };
  }

  function barrelPair(b, x, y, z0, z1, r) {
    const seg = 8;
    const prev = b.xf;
    tubeZ(b, x, y, z0, z1, r, seg);
    b.xf = prev;
  }

  // A cylinder running along Z (Z.Mesh.cyl only builds along Y).
  function tubeZ(b, x, y, z0, z1, r, seg) {
    const m = Z.M.m4.create();
    // rotate +Y onto -Z, then translate
    Z.M.m4.compose(m, x, y, Math.min(z0, z1), 0, Math.PI / 2, 0, 1, 1, 1);
    const prev = b.xf;
    b.xf = prev ? Z.M.m4.mul(Z.M.m4.create(), prev, m) : m;
    b.cyl(0, 0, r, r, 0, Math.abs(z1 - z0), seg || 8, { uvScale: 4, caps: true });
    b.xf = prev;
  }

  // -------------------------------------------------------------------------
  //  First-person arms
  // -------------------------------------------------------------------------
  function buildArms() {
    const b = Z.Mesh.builder();
    // Sleeve and glove are separate colours: at 0.62 flat for both, the arms
    // were one pale tan block with the hands invisible inside it. The palette
    // already carried the right values, they were simply never used.
    // right forearm coming in from the lower right toward the grip
    let m = Z.M.m4.create();
    Z.M.m4.compose(m, 0.075, -0.20, 0.16, 0.30, -0.95, 0, 1, 1, 1);
    b.setColor(G.sleeve[0], G.sleeve[1], G.sleeve[2]);
    b.setTransform(m);
    b.limb(0.30, 0.048, 0.038, { sides: 7 });
    b.setTransform(null);
    // right hand
    b.setColor(G.glove[0], G.glove[1], G.glove[2]);
    b.obox(0.028, -0.083, -0.010, 0.036, 0.028, 0.052, 0.10, -0.15, 0, { uvScale: 4 });
    // left forearm reaching across to the foregrip
    m = Z.M.m4.create();
    Z.M.m4.compose(m, -0.13, -0.22, 0.02, -0.42, -0.80, 0, 1, 1, 1);
    b.setColor(G.sleeve[0], G.sleeve[1], G.sleeve[2]);
    b.setTransform(m);
    b.limb(0.32, 0.046, 0.036, { sides: 7 });
    b.setTransform(null);
    b.setColor(G.glove[0], G.glove[1], G.glove[2]);
    b.obox(-0.030, -0.088, -0.175, 0.034, 0.026, 0.050, -0.12, 0.10, 0, { uvScale: 4 });
    b.shadeBy((x, y) => 0.68 + 0.32 * Z.M.clamp01((y + 0.30) / 0.35));
    return b.finish('hands');
  }

  // -------------------------------------------------------------------------
  //  Props
  // -------------------------------------------------------------------------
  function buildProps() {
    const props = {};

    // --- mystery box ------------------------------------------------------
    {
      const b = Z.Mesh.builder();
      b.setColor(1, 1, 1);
      b.box([-0.55, 0, -0.38], [0.55, 0.52, 0.38], { uvScale: 1.1 });
      b.setColor(0.42, 0.36, 0.28);
      // iron banding
      for (const zz of [-0.30, 0.30]) {
        b.box([-0.57, 0.02, zz - 0.035], [0.57, 0.50, zz + 0.035], { uvScale: 4 });
      }
      b.setColor(1, 1, 1);
      b.box([-0.57, 0.52, -0.40], [0.57, 0.60, 0.40], { uvScale: 1.1 });   // lid
      b.shadeBy((x, y) => 0.62 + 0.38 * Z.M.clamp01(y / 0.6));
      props.mystery_box = b.finish('mystery_box');
    }

    // --- perk machines ----------------------------------------------------
    const perkMats = { jugg: 'perk_jugg', speed: 'perk_speed', doubletap: 'perk_doubletap', revive: 'perk_revive' };
    for (const key in perkMats) {
      const b = Z.Mesh.builder();
      b.setColor(0.55, 0.55, 0.58);
      b.box([-0.42, 0, -0.30], [0.42, 1.92, 0.30], { uvScale: 0.8 });
      b.setColor(0.35, 0.35, 0.38);
      b.box([-0.44, 0.30, -0.32], [0.44, 0.36, 0.32], { uvScale: 3 });   // dispensing lip
      b.box([-0.30, 0.14, -0.34], [0.30, 0.30, -0.30], { uvScale: 3 });  // slot
      b.shadeBy((x, y) => 0.55 + 0.45 * Z.M.clamp01(y / 1.9));
      props['perk_machine_' + key] = b.finish('metal_rusty');
    }

    // --- crates / barrels / furniture -------------------------------------
    {
      const b = Z.Mesh.builder();
      b.box([-0.42, 0, -0.33], [0.42, 0.56, 0.33], { uvScale: 1.4 });
      b.shadeBy((x, y) => 0.6 + 0.4 * Z.M.clamp01(y / 0.6));
      props.ammo_crate = b.finish('crate_wood');
    }
    {
      const b = Z.Mesh.builder();
      b.cyl(0, 0, 0.30, 0.30, 0, 0.90, 12, { uvScale: 1.6 });
      b.shadeBy((x, y) => 0.6 + 0.4 * Z.M.clamp01(y / 0.95));
      props.barrel = b.finish('barrel_metal');
    }
    {
      const b = Z.Mesh.builder();
      b.box([-0.75, 0.68, -0.45], [0.75, 0.76, 0.45], { uvScale: 1.4 });
      for (const c of [[-0.66, -0.36], [0.66, -0.36], [-0.66, 0.36], [0.66, 0.36]]) {
        b.box([c[0] - 0.045, 0, c[1] - 0.045], [c[0] + 0.045, 0.68, c[1] + 0.045], { uvScale: 3 });
      }
      props.table = b.finish('wood_plank');
    }
    {
      const b = Z.Mesh.builder();
      b.obox(0, 0.22, 0, 0.20, 0.03, 0.20, 0.3, 0.5, 0.2, { uvScale: 2 });
      b.obox(-0.14, 0.11, 0.10, 0.025, 0.11, 0.025, 0, 0.2, 0, { uvScale: 3 });
      b.obox(0.16, 0.10, -0.08, 0.025, 0.10, 0.025, 0, -0.3, 0, { uvScale: 3 });
      props.chair_broken = b.finish('wood_plank');
    }
    {
      const b = Z.Mesh.builder();
      b.box([-0.42, 0, -0.16], [0.42, 0.24, 0.16], { uvScale: 2 });
      props.sandbag = b.finish('sandbag');
    }
    {
      const b = Z.Mesh.builder();
      b.box([-0.5, -0.5, -0.5], [0.5, 0.5, 0.5], { uvScale: 1 });
      props.board_plank = b.finish('wood_plank');
    }
    // Stielhandgranate — stick grenade, the correct German silhouette
    {
      const b = Z.Mesh.builder();
      b.setColor(0.48, 0.36, 0.22);
      b.cyl(0, 0, 0.016, 0.016, 0, 0.22, 8, { uvScale: 3 });
      b.setColor(0.42, 0.44, 0.40);
      b.cyl(0, 0, 0.036, 0.036, 0.22, 0.32, 9, { uvScale: 3 });
      props.grenade = b.finish('gun_metal');
    }

    // --- power-up icons (simple glowing plates; the sprite does the work) --
    for (const id of ['instakill', 'doublepoints', 'maxammo', 'nuke', 'carpenter']) {
      const b = Z.Mesh.builder();
      b.box([-0.18, -0.18, -0.02], [0.18, 0.18, 0.02], { uvScale: 1 });
      props['powerup_' + id] = b.finish('concrete');
    }

    return props;
  }

  // -------------------------------------------------------------------------
  //  Mo.poseGun — the viewmodel transform
  //
  //  This is where the gun stops being a mesh and starts feeling held: the
  //  hip/ADS blend, sway lag, walk bob, recoil kick, the reload dip and the
  //  sprint carry all compose here into one matrix.
  // -------------------------------------------------------------------------
  const HIP = [0.132, -0.168, -0.360];
  const ADS = [0.000, -0.052, -0.235];
  const _gm = m4.create();

  Mo.poseGun = function (out, weaponId, st) {
    st = st || {};
    const id = GUN_ALIAS[weaponId] || weaponId;
    const g = Mo.guns[id];
    const ads = Z.M.clamp01(st.ads || 0);
    const e = ads * ads * (3 - 2 * ads);          // same easing the FOV uses
    const sprint = Z.M.clamp01(st.sprintPhase || 0);
    const sway = st.sway || [0, 0];
    const bob = st.bob || [0, 0];

    // Long weapons sit further forward so they don't fill the screen.
    const lenAdj = g ? Z.M.clamp((g.spec.bl + g.spec.rl - 0.5) * 0.16, -0.03, 0.10) : 0;

    let px = Z.M.lerp(HIP[0], ADS[0], e);
    let py = Z.M.lerp(HIP[1], ADS[1], e);
    let pz = Z.M.lerp(HIP[2] - lenAdj, ADS[2] - lenAdj * 0.4, e);

    // sway and bob fade out heavily when aiming
    const free = 1 - e * 0.82;
    px += (sway[0] + bob[0]) * free;
    py += (sway[1] + bob[1]) * free + (st.landDip || 0);

    // recoil: back along +Z and a muzzle rise
    pz += (st.recoilPos || 0);
    let pitch = -(st.recoilRot || 0) * 0.9;
    let yaw = -sway[0] * 2.2 * free;
    let roll = bob[0] * 3.0 * free - sway[1] * 1.1 * free;

    // reload: drop the weapon out of the sightline and tilt it toward you
    const rp = st.reloading ? (st.reloadPhase || 0) : 0;
    if (rp > 0) {
      const arc = Math.sin(Math.PI * Z.M.clamp01(rp));
      py -= 0.085 * arc;
      pz += 0.045 * arc;
      roll += 0.42 * arc;
      yaw += 0.18 * arc;
      pitch -= 0.12 * arc;
    }

    // sprint carry: tucked in, angled across the body
    if (sprint > 0.01) {
      px += 0.055 * sprint;
      py -= 0.075 * sprint;
      pz += 0.045 * sprint;
      yaw += 0.55 * sprint;
      pitch -= 0.30 * sprint;
      roll += 0.30 * sprint;
    }

    // melee: a fast jab forward and across
    const mt = st.meleeT || 0;
    if (mt > 0) {
      const k = Math.sin(Math.PI * Z.M.clamp01(mt / 0.55));
      px -= 0.10 * k;
      pz -= 0.14 * k;
      yaw += 0.5 * k;
      roll -= 0.5 * k;
    }

    m4.compose(out, px, py, pz, yaw, pitch, roll, 1, 1, 1);
    return out;
  };

  Mo.gunMuzzleVM = function (weaponId) {
    const g = Mo.guns[GUN_ALIAS[weaponId] || weaponId];
    return g ? g.muzzle : [0, 0, -0.4];
  };

}());
