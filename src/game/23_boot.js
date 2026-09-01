// ---------------------------------------------------------------------------
// 23_boot.js — entry point. Nothing above this line runs on its own.
// ---------------------------------------------------------------------------
(function () {
  function start() {
    try {
      Z.Game.boot({
        view: document.getElementById('view'),
        hud: document.getElementById('hud'),
        ui: document.getElementById('ui'),
      });
    } catch (err) {
      Z.fatal(err);
    }
  }

  // Expose the namespace for the headless verification harness. This is the
  // only global the page creates.
  window.__Z = Z;

  window.addEventListener('error', function (e) {
    if (!Z.Game || Z.Game.mode === 'boot' || Z.Game.mode === 'loading') Z.fatal(e.error || e.message);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
