/**
 * BlockForge — game input: keyboard (by KeyboardEvent.code), pointer in logical
 * canvas coordinates, and virtual touch controls (joystick + action buttons).
 */
(function (BF) {
  'use strict';

  const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);

  function typing(e) {
    const t = e.target;
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} W logical width
   * @param {number} H logical height
   */
  function Input(canvas, W, H) {
    this.canvas = canvas;
    this.W = W;
    this.H = H;
    this.keys = new Set();
    this.pressedSet = new Set();
    this.releasedSet = new Set();
    this.virt = new Set();
    this.virtPressed = new Set();
    this.actions = {};
    this.joy = { x: 0, y: 0, active: false };
    this.pointer = { x: W / 2, y: H / 2, down: false, pressed: false, released: false, moved: false, touch: false };
    this.enabled = true;
    const self = this;

    this._kd = (e) => {
      if (!self.enabled || typing(e)) return;
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!self.keys.has(e.code)) self.pressedSet.add(e.code);
      self.keys.add(e.code);
    };
    this._ku = (e) => {
      self.keys.delete(e.code);
      self.releasedSet.add(e.code);
    };
    this._blur = () => { self.keys.clear(); self.virt.clear(); self.pointer.down = false; };
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      self.pointer.x = ((e.clientX - r.left) / r.width) * W;
      self.pointer.y = ((e.clientY - r.top) / r.height) * H;
    };
    this._pd = (e) => {
      if (!self.enabled) return;
      pos(e);
      self.pointer.touch = e.pointerType === 'touch';
      if (e.button === 0 || e.pointerType === 'touch') {
        self.pointer.down = true;
        self.pointer.pressed = true;
        self.pressedSet.add('Mouse0');
        self.keys.add('Mouse0');
      } else if (e.button === 2) {
        self.pressedSet.add('Mouse2');
        self.keys.add('Mouse2');
      }
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    };
    this._pm = (e) => { pos(e); self.pointer.moved = true; };
    this._pu = (e) => {
      pos(e);
      if (e.button === 2) { self.keys.delete('Mouse2'); return; }
      self.pointer.down = false;
      self.pointer.released = true;
      self.keys.delete('Mouse0');
      self.releasedSet.add('Mouse0');
    };
    this._ctx = (e) => e.preventDefault();

    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('blur', this._blur);
    canvas.addEventListener('pointerdown', this._pd);
    canvas.addEventListener('pointermove', this._pm);
    canvas.addEventListener('pointerup', this._pu);
    canvas.addEventListener('pointercancel', this._pu);
    canvas.addEventListener('contextmenu', this._ctx);
  }

  Input.prototype = {
    /** Is a key (KeyboardEvent.code) or 'Mouse0' held? */
    down(code) { return this.keys.has(code); },
    /** Went down this frame. */
    pressed(code) { return this.pressedSet.has(code); },
    released(code) { return this.releasedSet.has(code); },

    /** Bind action names to key codes: {jump:['Space','KeyW']}. */
    bind(map) {
      Object.assign(this.actions, map);
      return this;
    },
    act(name) {
      if (this.virt.has(name)) return true;
      const codes = this.actions[name];
      return !!codes && codes.some((c) => this.keys.has(c));
    },
    actPressed(name) {
      if (this.virtPressed.has(name)) return true;
      const codes = this.actions[name];
      return !!codes && codes.some((c) => this.pressedSet.has(c));
    },

    /** Movement axis from WASD / arrows / joystick, length <= 1. */
    axis() {
      let x = 0, y = 0;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
      if (this.joy.active) { x += this.joy.x; y += this.joy.y; }
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      return { x, y };
    },

    setJoy(x, y, active) {
      this.joy.x = x;
      this.joy.y = y;
      this.joy.active = active;
    },
    setVirt(name, on) {
      if (on) { if (!this.virt.has(name)) this.virtPressed.add(name); this.virt.add(name); }
      else this.virt.delete(name);
    },

    /** Call once per frame after the game update. */
    endFrame() {
      this.pressedSet.clear();
      this.releasedSet.clear();
      this.virtPressed.clear();
      this.pointer.pressed = false;
      this.pointer.released = false;
      this.pointer.moved = false;
    },

    clear() {
      this.keys.clear();
      this.virt.clear();
      this.pointer.down = false;
      this.setJoy(0, 0, false);
    },

    destroy() {
      window.removeEventListener('keydown', this._kd);
      window.removeEventListener('keyup', this._ku);
      window.removeEventListener('blur', this._blur);
      this.canvas.removeEventListener('pointerdown', this._pd);
      this.canvas.removeEventListener('pointermove', this._pm);
      this.canvas.removeEventListener('pointerup', this._pu);
      this.canvas.removeEventListener('pointercancel', this._pu);
      this.canvas.removeEventListener('contextmenu', this._ctx);
    },
  };

  BF.Input = Input;
})((window.BF = window.BF || {}));
