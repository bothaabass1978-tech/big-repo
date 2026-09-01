// ---------------------------------------------------------------------------
// 00_prelude.js — namespace, global config, fatal error trap
// ---------------------------------------------------------------------------
const Z = {};

Z.VERSION = '1.0.0';

// Global tuning constants. Gameplay numbers live in Z.B (03_balance.js);
// these are engine-level facts about the world.
Z.C = {
  // --- world ---
  GRAVITY: 22.0,            // m/s^2 (CoD-ish: heavier than real gravity, snappier arcs)
  UNIT: 1.0,                // 1 world unit = 1 metre

  // --- player body ---
  EYE_STAND: 1.62,
  EYE_CROUCH: 1.02,
  PLAYER_RADIUS: 0.34,
  PLAYER_HEIGHT: 1.80,
  PLAYER_HEIGHT_CROUCH: 1.20,
  STEP_UP: 0.46,

  // --- camera ---
  FOV: 65,                  // vertical FOV in degrees (CoD default 65 horizontal-ish)
  FOV_ADS: 45,
  NEAR: 0.05,
  FAR: 120.0,
  PITCH_LIMIT: 89 * Math.PI / 180,

  // --- render ---
  MAX_LIGHTS: 8,
  SHADOW_SIZE: 1024,
  FOG_COLOR: [0.028, 0.030, 0.038],
  FOG_NEAR: 6.0,
  FOG_FAR: 46.0,

  // --- sim ---
  FIXED_DT: 1 / 120,        // physics tick
  MAX_STEPS: 10,            // fixed steps allowed per rendered frame
  MAX_CATCHUP_DT: 1 / 30,   // biggest single catch-up step (5.6 m/s -> 0.19 m,
                            // well under the 0.34 m player radius)
  MAX_FRAME_DT: 0.25,

  // --- debug ---
  DEBUG: false,
};

// Deterministic seed used by all procedural content so builds look identical.
Z.ART_SEED = 0x5eed1337;

Z.log = function () { if (Z.C.DEBUG) console.log.apply(console, arguments); };

Z.fatal = function (err) {
  try {
    const el = document.getElementById('fatal');
    if (el) {
      el.style.display = 'block';
      el.textContent = 'NACHT DER UNTOTEN — FATAL\n\n' + (err && err.stack ? err.stack : String(err));
    }
  } catch (e) { /* nothing left to do */ }
  console.error(err);
};

Z.assert = function (cond, msg) {
  if (!cond) throw new Error('assert: ' + (msg || 'failed'));
};
