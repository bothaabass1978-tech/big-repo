// ---------------------------------------------------------------------------
// 04_input.js — keyboard / mouse / gamepad. Raw mouse deltas, pointer lock,
// edge-triggered state, rebindable actions.
// ---------------------------------------------------------------------------
(function () {
  const I = {};
  Z.Input = I;

  const keys = Object.create(null);      // code -> true while held
  // Edges are double-buffered. DOM handlers only ever write to the `pending`
  // set; update() promotes pending into the readable set at the top of a
  // frame, and nothing clears the readable set until the next promotion.
  //
  // The obvious single-buffer version — collect edges, clear them at the end
  // of the frame that consumed them — drops input. A key pressed after the
  // frame has already read its edges but before it clears them is set and
  // then destroyed unread. That window is a few milliseconds at 60 fps and
  // over a hundred on a machine struggling to hold 7, which is exactly when a
  // player is mashing the key. Reload, buy, swap, melee, grenade and pause all
  // ride on these edges, so they would intermittently do nothing at all.
  //
  // (Tagging edges with a frame counter, the other obvious approach, is worse:
  // it is off by one, because a key pressed between frames is stamped with the
  // old frame number and never matches when anything asks.)
  let edgeDown = Object.create(null);
  let edgeUp = Object.create(null);
  let pendDown = Object.create(null);
  let pendUp = Object.create(null);
  let frame = 0;

  const mouse = { buttons: 0, dx: 0, dy: 0, wheel: 0, x: 0, y: 0 };
  // Same double buffering for the mouse: `pend*` is written by the DOM, the
  // unprefixed arrays are what the frame reads.
  const mbDownEdge = [false, false, false, false, false];
  const mbUpEdge = [false, false, false, false, false];
  const mbDownPend = [false, false, false, false, false];
  const mbUpPend = [false, false, false, false, false];
  const pendMouse = { dx: 0, dy: 0, wheel: 0 };

  I.locked = false;
  // Set when pointer lock is unavailable: look by dragging with the left
  // button held instead. Off by default — it is strictly worse than a locked
  // pointer and should only engage where lock genuinely cannot be had.
  I.dragLook = false;
  let dragging = false;
  I.enabled = true;
  I.sensitivity = 1.0;       // multiplier on raw deltas
  I.adsSensScale = 0.75;
  I.invertY = false;
  I.gamepad = null;
  I.gamepadDeadzone = 0.18;
  I.lastInputWasGamepad = false;

  // Default action bindings. Z.Menu can rewrite these.
  I.binds = {
    forward: ['KeyW', 'ArrowUp'],
    back: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    jump: ['Space'],
    crouch: ['ControlLeft', 'KeyC'],
    sprint: ['ShiftLeft'],
    use: ['KeyF'],
    reload: ['KeyR'],
    melee: ['KeyV'],
    grenade: ['KeyG'],
    swap: ['KeyQ', 'Digit1', 'Digit2'],
    pause: ['Escape'],
    scores: ['Tab'],
  };

  let canvas = null;

  function onKeyDown(e) {
    if (!I.enabled) return;
    // Never swallow devtools / reload
    if (e.code === 'F5' || e.code === 'F12' || (e.ctrlKey && e.code === 'KeyR')) return;
    if (!keys[e.code]) pendDown[e.code] = true;
    keys[e.code] = true;
    I.lastInputWasGamepad = false;
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  }
  function onKeyUp(e) {
    keys[e.code] = false;
    pendUp[e.code] = true;
  }
  function onBlur() {
    for (const k in keys) keys[k] = false;
    mouse.buttons = 0;
    edgeDown = Object.create(null);
    edgeUp = Object.create(null);
    pendDown = Object.create(null);
    pendUp = Object.create(null);
  }

  function onMouseMove(e) {
    if (I.locked) {
      // movementX/Y are already raw when pointer-locked
      pendMouse.dx += e.movementX || 0;
      pendMouse.dy += e.movementY || 0;
    } else if (I.dragLook && dragging) {
      // Fallback for contexts that refuse pointer lock — a sandboxed iframe,
      // or a browser that denies the request. movementX/Y are still reported
      // for an ordinary move, so drag-to-look costs nothing extra; it is only
      // worse to play, not unplayable.
      pendMouse.dx += e.movementX || (e.clientX - mouse.x) || 0;
      pendMouse.dy += e.movementY || (e.clientY - mouse.y) || 0;
    }
    mouse.x = e.clientX; mouse.y = e.clientY;
    I.lastInputWasGamepad = false;
  }
  function onMouseDown(e) {
    if (!I.enabled) return;
    const b = e.button;
    if (!(mouse.buttons & (1 << b))) mbDownPend[b] = true;
    mouse.buttons |= (1 << b);
    I.lastInputWasGamepad = false;
    if (b === 0) dragging = true;
    if (I.locked) e.preventDefault();
  }
  function onMouseUp(e) {
    const b = e.button;
    mouse.buttons &= ~(1 << b);
    mbUpPend[b] = true;
    if (b === 0) dragging = false;
  }
  function onWheel(e) {
    pendMouse.wheel += Math.sign(e.deltaY);
    if (I.locked) e.preventDefault();
  }
  function onLockChange() {
    I.locked = (document.pointerLockElement === canvas);
    if (!I.locked && I.onUnlock) I.onUnlock();
  }

  I.init = function (cv) {
    canvas = cv;
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('contextmenu', (e) => { if (I.locked) e.preventDefault(); });
    return I;
  };

  I.lock = function () {
    if (!canvas || I.locked) return;
    if (!canvas.requestPointerLock) { I.dragLook = true; return; }
    let p = null;
    try { p = canvas.requestPointerLock({ unadjustedMovement: true }); } catch (e) { p = null; }
    if (p && p.catch) {
      p.catch(function () {
        try {
          const q = canvas.requestPointerLock();
          if (q && q.catch) q.catch(function () { I.dragLook = true; });
        } catch (e) { I.dragLook = true; }
      });
    }
    // Some engines return undefined and simply never fire pointerlockchange.
    // If we are still unlocked shortly after asking, assume it was refused.
    setTimeout(function () { if (!I.locked) I.dragLook = true; }, 700);
  };
  I.unlock = function () { if (document.exitPointerLock) document.exitPointerLock(); };

  // --- per-frame ------------------------------------------------------------
  I.update = function () {
    frame++;
    // Promote whatever the DOM has queued since the last promotion. Anything
    // that arrives later in this frame lands in the fresh pending set and is
    // read by the next one, rather than being cleared unseen.
    edgeDown = pendDown; pendDown = Object.create(null);
    edgeUp = pendUp; pendUp = Object.create(null);
    mouse.dx = pendMouse.dx; mouse.dy = pendMouse.dy; mouse.wheel = pendMouse.wheel;
    pendMouse.dx = 0; pendMouse.dy = 0; pendMouse.wheel = 0;
    for (let i = 0; i < mbDownEdge.length; i++) {
      mbDownEdge[i] = mbDownPend[i]; mbDownPend[i] = false;
      mbUpEdge[i] = mbUpPend[i]; mbUpPend[i] = false;
    }
    pollGamepad();
  };
  I.postUpdate = function () {
    // Edges are NOT cleared here — update() owns that, by promotion. Clearing
    // at end of frame is what destroyed input arriving mid-frame.
    if (I.gamepad) { I.gamepad.prevButtons = I.gamepad.buttons.slice(); }
  };

  // --- queries --------------------------------------------------------------
  // Drop an edge so nothing downstream sees it. The menu uses this for keys it
  // has already acted on: it handles Escape synchronously in its own DOM
  // listener, but the edge is still sitting in this frame's set, so the game
  // loop's global key handler would act on the very same keypress a moment
  // later — resuming and then instantly re-pausing.
  I.consume = function (code) {
    delete edgeDown[code];
    delete pendDown[code];
  };

  I.down = (code) => !!keys[code];
  I.pressed = (code) => !!edgeDown[code];
  I.released = (code) => !!edgeUp[code];
  I.mb = (n) => !!(mouse.buttons & (1 << n));
  I.mbPressed = (n) => !!mbDownEdge[n];
  I.mbReleased = (n) => !!mbUpEdge[n];
  I.wheel = () => mouse.wheel;
  I.mousePos = () => [mouse.x, mouse.y];

  I.takeMouse = function (out) {
    out = out || [0, 0];
    out[0] = mouse.dx; out[1] = mouse.dy;
    return out;
  };

  I.act = function (name) {
    const b = I.binds[name];
    if (!b) return false;
    for (let i = 0; i < b.length; i++) if (keys[b[i]]) return true;
    return false;
  };
  I.actPressed = function (name) {
    const b = I.binds[name];
    if (!b) return false;
    for (let i = 0; i < b.length; i++) if (edgeDown[b[i]]) return true;
    return false;
  };
  I.actReleased = function (name) {
    const b = I.binds[name];
    if (!b) return false;
    for (let i = 0; i < b.length; i++) if (edgeUp[b[i]]) return true;
    return false;
  };

  // Movement axes in local space: x = strafe right, y = forward.
  I.moveAxis = function (out) {
    out = out || [0, 0];
    let x = 0, y = 0;
    if (I.act('forward')) y += 1;
    if (I.act('back')) y -= 1;
    if (I.act('right')) x += 1;
    if (I.act('left')) x -= 1;
    const g = I.gamepad;
    if (g) {
      const gx = dz(g.axes[0]), gy = dz(g.axes[1]);
      if (gx || gy) { x = gx; y = -gy; I.lastInputWasGamepad = true; }
    }
    // normalise so diagonals aren't faster
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    out[0] = x; out[1] = y;
    return out;
  };

  function dz(v) {
    const d = I.gamepadDeadzone;
    if (Math.abs(v) < d) return 0;
    // rescale so the stick still reaches 1.0 and response stays smooth
    const s = (Math.abs(v) - d) / (1 - d);
    return Math.sign(v) * s * s;
  }

  function pollGamepad() {
    if (!navigator.getGamepads) { I.gamepad = null; return; }
    const pads = navigator.getGamepads();
    let pad = null;
    for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
    if (!pad) { I.gamepad = null; return; }
    const prev = I.gamepad ? I.gamepad.prevButtons : null;
    const buttons = [];
    for (let i = 0; i < pad.buttons.length; i++) buttons.push(pad.buttons[i].value);
    I.gamepad = {
      axes: pad.axes.slice(),
      buttons,
      prevButtons: prev || buttons.slice(),
      id: pad.id,
    };
  }

  // Gamepad look, applied as an additional delta each frame (out is in "mouse
  // pixels" so it flows through the same sensitivity path).
  I.gamepadLook = function (out, dt) {
    out = out || [0, 0];
    out[0] = 0; out[1] = 0;
    const g = I.gamepad;
    if (!g) return out;
    const lx = dz(g.axes[2] || 0), ly = dz(g.axes[3] || 0);
    if (lx || ly) I.lastInputWasGamepad = true;
    const rate = 1400 * dt; // deg-ish per second at full deflection
    out[0] = lx * rate;
    out[1] = ly * rate;
    return out;
  };
  I.gpButton = function (i) { return I.gamepad ? I.gamepad.buttons[i] > 0.5 : false; };
  I.gpPressed = function (i) {
    if (!I.gamepad) return false;
    return I.gamepad.buttons[i] > 0.5 && I.gamepad.prevButtons[i] <= 0.5;
  };
  I.gpAxis = function (i) { return I.gamepad ? dz(I.gamepad.axes[i] || 0) : 0; };

  I.clearAll = onBlur;
}());
