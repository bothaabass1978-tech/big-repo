/**
 * BlockForge — canvas drawing helpers shared by every game module:
 * shapes, text, bars, block avatars (top-down and side view), name tags,
 * chat bubbles, particles, floating text and a follow camera.
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const TAU = Math.PI * 2;

  const gfx = (BF.gfx = {
    TAU,

    rr(g, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    },
    fillRR(g, x, y, w, h, r, color) {
      gfx.rr(g, x, y, w, h, r);
      g.fillStyle = color;
      g.fill();
    },
    circle(g, x, y, r, color) {
      g.beginPath();
      g.arc(x, y, Math.max(0, r), 0, TAU);
      g.fillStyle = color;
      g.fill();
    },
    ring(g, x, y, r, color, w) {
      g.beginPath();
      g.arc(x, y, Math.max(0, r), 0, TAU);
      g.strokeStyle = color;
      g.lineWidth = w || 2;
      g.stroke();
    },
    line(g, x1, y1, x2, y2, color, w) {
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.strokeStyle = color;
      g.lineWidth = w || 2;
      g.lineCap = 'round';
      g.stroke();
    },
    shadow(g, x, y, rx, ry, a) {
      g.save();
      g.globalAlpha = a == null ? 0.25 : a;
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, 0, TAU);
      g.fillStyle = '#000';
      g.fill();
      g.restore();
    },

    /**
     * Draw text. o: {size, color, align, baseline, weight, font, stroke, strokeW, alpha, shadow}
     */
    text(g, str, x, y, o) {
      o = o || {};
      g.save();
      g.font = (o.weight || 700) + ' ' + (o.size || 16) + 'px ' + (o.font || "Rubik, system-ui, 'Segoe UI', sans-serif");
      g.textAlign = o.align || 'left';
      g.textBaseline = o.baseline || 'alphabetic';
      if (o.alpha != null) g.globalAlpha = o.alpha;
      if (o.shadow) { g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = o.shadow; g.shadowOffsetY = 2; }
      if (o.stroke) { g.lineWidth = o.strokeW || 4; g.strokeStyle = o.stroke; g.lineJoin = 'round'; g.strokeText(str, x, y); }
      g.fillStyle = o.color || '#fff';
      g.fillText(str, x, y);
      g.restore();
    },
    display(g, str, x, y, size, color, align) {
      gfx.text(g, str, x, y, { size, color: color || '#fff', align: align || 'center', font: "'Russo One', 'Arial Black', Impact, sans-serif", weight: 400, stroke: 'rgba(0,0,0,.55)', strokeW: Math.max(3, size / 7), baseline: 'middle' });
    },

    /** Progress bar. */
    bar(g, x, y, w, h, pct, color, bg) {
      gfx.fillRR(g, x, y, w, h, h / 2, bg || 'rgba(0,0,0,.45)');
      if (pct > 0) gfx.fillRR(g, x, y, Math.max(h, w * U.clamp(pct, 0, 1)), h, h / 2, color || '#3fd08a');
    },

    /** Rounded HUD panel. */
    panel(g, x, y, w, h, alpha) {
      gfx.fillRR(g, x, y, w, h, 10, 'rgba(8,10,16,' + (alpha == null ? 0.62 : alpha) + ')');
    },

    /** Name tag above a character. */
    nameTag(g, x, y, name, color, level) {
      g.save();
      g.font = '700 11px Rubik, system-ui, sans-serif';
      const label = level ? name + ' ' : name;
      const w = g.measureText(label).width + (level ? g.measureText('Lv' + level).width + 6 : 0) + 12;
      gfx.fillRR(g, x - w / 2, y - 16, w, 16, 8, 'rgba(8,10,16,.62)');
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = color || '#fff';
      g.fillText(label, x - w / 2 + 6, y - 8);
      if (level) {
        g.fillStyle = '#ffc940';
        g.fillText('Lv' + level, x - w / 2 + 6 + g.measureText(label).width + 2, y - 8);
      }
      g.restore();
    },

    /** Speech bubble anchored at (x, y) (bubble sits above). */
    bubble(g, x, y, text) {
      g.save();
      g.font = '600 12px Rubik, system-ui, sans-serif';
      const words = String(text).split(' ');
      const lines = [];
      let cur = '';
      for (const wd of words) {
        const t = cur ? cur + ' ' + wd : wd;
        if (g.measureText(t).width > 170 && cur) { lines.push(cur); cur = wd; } else cur = t;
      }
      if (cur) lines.push(cur);
      const shown = lines.slice(0, 3);
      const w = Math.min(186, Math.max(...shown.map((l) => g.measureText(l).width)) + 16);
      const h = shown.length * 15 + 10;
      const bx = x - w / 2, by = y - h - 10;
      gfx.fillRR(g, bx, by, w, h, 8, 'rgba(255,255,255,.94)');
      g.beginPath();
      g.moveTo(x - 6, by + h);
      g.lineTo(x, by + h + 7);
      g.lineTo(x + 6, by + h);
      g.fill();
      g.fillStyle = '#141821';
      g.textAlign = 'center';
      g.textBaseline = 'top';
      shown.forEach((l, i) => g.fillText(l, x, by + 6 + i * 15));
      g.restore();
    },

    /**
     * Top-down block character facing `angle`.
     * @param {object} look from BF.avatar.look()
     */
    avatarTop(g, x, y, r, look, angle, o) {
      o = o || {};
      g.save();
      g.translate(x, y);
      if (o.alpha != null) g.globalAlpha = o.alpha;
      gfx.shadow(g, 0, r * 0.35, r * 1.05, r * 0.55, 0.28);
      g.rotate(angle || 0);
      const bob = o.walk ? Math.sin(o.walk) * r * 0.12 : 0;
      // hands
      g.fillStyle = look.skin;
      g.beginPath();
      g.arc(r * 0.45 + bob, -r * 0.92, r * 0.28, 0, TAU);
      g.arc(r * 0.45 - bob, r * 0.92, r * 0.28, 0, TAU);
      g.fill();
      // shoulders / torso
      gfx.fillRR(g, -r * 0.62, -r * 0.95, r * 1.1, r * 1.9, r * 0.35, look.shirt);
      g.fillStyle = look.shirt2;
      g.globalAlpha *= 0.55;
      gfx.fillRR(g, -r * 0.1, -r * 0.5, r * 0.4, r * 1.0, r * 0.12, look.shirt2);
      g.globalAlpha = o.alpha != null ? o.alpha : 1;
      if (look.back) gfx.fillRR(g, -r * 0.95, -r * 0.6, r * 0.42, r * 1.2, r * 0.15, look.back);
      // head
      gfx.circle(g, 0, 0, r * 0.62, look.skin);
      const cap = look.hat || look.hair;
      if (cap) {
        g.fillStyle = cap;
        g.beginPath();
        g.arc(-r * 0.1, 0, r * 0.62, Math.PI * 0.55, Math.PI * 1.45);
        g.closePath();
        g.fill();
        if (look.hat && look.hatStyle === 'cap') gfx.fillRR(g, r * 0.35, -r * 0.4, r * 0.4, r * 0.8, r * 0.15, U.shade(look.hat, -0.2));
      }
      // eyes
      g.fillStyle = '#1b1b22';
      g.beginPath();
      g.arc(r * 0.34, -r * 0.2, r * 0.1, 0, TAU);
      g.arc(r * 0.34, r * 0.2, r * 0.1, 0, TAU);
      g.fill();
      if (o.flash) {
        g.globalAlpha = 0.6;
        gfx.circle(g, 0, 0, r * 1.05, '#fff');
      }
      g.restore();
    },

    /**
     * Side-view block character standing with feet at (x, y).
     * o: {facing: 1|-1, walk: phase, air: bool, h: height, alpha}
     */
    avatarSide(g, x, y, h, look, o) {
      o = o || {};
      const s = h / 64;
      const f = o.facing || 1;
      g.save();
      g.translate(x, y);
      if (o.alpha != null) g.globalAlpha = o.alpha;
      if (!o.air) gfx.shadow(g, 0, 0, 13 * s, 3.5 * s, 0.25);
      g.scale(f, 1);
      const swing = o.air ? 0.5 : o.walk ? Math.sin(o.walk) * 0.6 : 0;
      const leg = (dx, a, c) => {
        g.save();
        g.translate(dx * s, -22 * s);
        g.rotate(a);
        g.fillStyle = c;
        g.fillRect(-4.5 * s, 0, 9 * s, 20 * s);
        g.fillStyle = look.shoes;
        g.fillRect(-4.5 * s, 16 * s, 11 * s, 5 * s);
        g.restore();
      };
      leg(-3, swing, U.shade(look.pants, -0.12));
      if (look.back) gfx.fillRR(g, -15 * s, -44 * s, 8 * s, 18 * s, 3 * s, look.back);
      const arm = (dx, a, c) => {
        g.save();
        g.translate(dx * s, -42 * s);
        g.rotate(a);
        g.fillStyle = c;
        g.fillRect(-3.5 * s, 0, 7 * s, 16 * s);
        g.fillStyle = look.skin;
        g.fillRect(-3.5 * s, 14 * s, 7 * s, 5 * s);
        g.restore();
      };
      arm(-2, -swing * 0.8 + (o.air ? -2.2 : 0), U.shade(look.shirt, -0.15));
      gfx.fillRR(g, -9 * s, -44 * s, 18 * s, 23 * s, 3 * s, look.shirt);
      leg(3, -swing, look.pants);
      arm(2, swing * 0.8 + (o.air ? -2.4 : 0) + (o.armAngle || 0), look.shirt);
      // head
      gfx.fillRR(g, -9 * s, -62 * s, 18 * s, 18 * s, 4 * s, look.skin);
      const cap = look.hat || look.hair;
      if (cap) gfx.fillRR(g, -9.5 * s, -63.5 * s, 19 * s, 7 * s, 3 * s, cap);
      if (look.hat && look.hatStyle === 'cap') g.fillRect(4 * s, -58.5 * s, 9 * s, 2.5 * s);
      g.fillStyle = '#1b1b22';
      g.fillRect(3 * s, -55 * s, 2.6 * s, 3.4 * s);
      if (look.acc) { g.fillStyle = look.acc; g.fillRect(-1 * s, -56 * s, 10 * s, 2 * s); }
      g.restore();
    },

    /** Deterministic colour for a name (chat, tags). */
    nameColor(name) {
      const colors = ['#ff9d5c', '#7cc6ff', '#86e3a8', '#ffd66b', '#d7a8ff', '#ff8fb3', '#6ee7e7', '#c0e87a'];
      return colors[U.hash(name) % colors.length];
    },
  });

  // ---------------------------------------------------------------- particles

  /** Lightweight particle pool. */
  function Particles(max) {
    this.list = [];
    this.max = max || 400;
  }
  Particles.prototype = {
    /**
     * Burst of particles. o: {count, color|colors, speed, life, size, gravity, spread, angle, drag, shape}
     */
    emit(x, y, o) {
      o = o || {};
      const n = o.count || 10;
      for (let i = 0; i < n && this.list.length < this.max; i++) {
        const a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread || 0.6) : Math.random() * TAU;
        const sp = (o.speed || 120) * (0.4 + Math.random() * 0.8);
        this.list.push({
          x, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: (o.life || 0.6) * (0.6 + Math.random() * 0.6), t: 0,
          size: (o.size || 4) * (0.6 + Math.random() * 0.8),
          color: o.colors ? o.colors[(Math.random() * o.colors.length) | 0] : o.color || '#ffc940',
          g: o.gravity || 0,
          drag: o.drag || 0,
          shape: o.shape || 'square',
        });
      }
    },
    update(dt) {
      const l = this.list;
      for (let i = l.length - 1; i >= 0; i--) {
        const p = l[i];
        p.t += dt;
        if (p.t >= p.life) { l[i] = l[l.length - 1]; l.pop(); continue; }
        p.vy += p.g * dt;
        if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    },
    draw(g) {
      for (const p of this.list) {
        const a = 1 - p.t / p.life;
        g.globalAlpha = a;
        g.fillStyle = p.color;
        const s = p.size * (0.5 + a * 0.5);
        if (p.shape === 'circle') { g.beginPath(); g.arc(p.x, p.y, s / 2, 0, TAU); g.fill(); }
        else g.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
      g.globalAlpha = 1;
    },
    clear() { this.list.length = 0; },
  };
  BF.Particles = Particles;

  /** Floating combat / reward text. */
  function Floaters() {
    this.list = [];
  }
  Floaters.prototype = {
    add(x, y, text, color, size) {
      this.list.push({ x, y, text, color: color || '#fff', size: size || 16, t: 0, life: 1.1 });
      if (this.list.length > 60) this.list.shift();
    },
    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const f = this.list[i];
        f.t += dt;
        f.y -= 38 * dt;
        if (f.t >= f.life) this.list.splice(i, 1);
      }
    },
    draw(g) {
      for (const f of this.list) gfx.text(g, f.text, f.x, f.y, { size: f.size, color: f.color, align: 'center', alpha: Math.min(1, (1 - f.t / f.life) * 2), stroke: 'rgba(0,0,0,.6)', strokeW: 3, weight: 800 });
    },
  };
  BF.Floaters = Floaters;

  /** Follow camera with screen shake and world bounds. */
  function Camera(W, H) {
    this.W = W;
    this.H = H;
    this.x = 0;
    this.y = 0;
    this.shakeT = 0;
    this.shakeMag = 0;
    this.bounds = null;
  }
  Camera.prototype = {
    follow(tx, ty, dt, lerp) {
      const k = lerp == null ? 1 : 1 - Math.pow(1 - lerp, dt * 60);
      this.x += (tx - this.W / 2 - this.x) * k;
      this.y += (ty - this.H / 2 - this.y) * k;
      if (this.bounds) {
        this.x = U.clamp(this.x, this.bounds.x, Math.max(this.bounds.x, this.bounds.w - this.W));
        this.y = U.clamp(this.y, this.bounds.y, Math.max(this.bounds.y, this.bounds.h - this.H));
      }
      if (this.shakeT > 0) this.shakeT -= dt;
    },
    shake(mag, t) {
      this.shakeMag = Math.max(this.shakeMag * (this.shakeT > 0 ? 1 : 0), mag);
      this.shakeT = Math.max(this.shakeT, t || 0.25);
    },
    apply(g) {
      let sx = 0, sy = 0;
      if (this.shakeT > 0) {
        sx = (Math.random() - 0.5) * this.shakeMag * 2;
        sy = (Math.random() - 0.5) * this.shakeMag * 2;
      }
      g.translate(-Math.round(this.x + sx), -Math.round(this.y + sy));
    },
    toWorld(px, py) {
      return { x: px + this.x, y: py + this.y };
    },
    visible(x, y, pad) {
      pad = pad || 64;
      return x > this.x - pad && x < this.x + this.W + pad && y > this.y - pad && y < this.y + this.H + pad;
    },
  };
  BF.Camera = Camera;
})((window.BF = window.BF || {}));
