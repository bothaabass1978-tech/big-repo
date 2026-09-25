/**
 * BlockForge — shared utilities.
 * Pure helpers with no application state. Everything hangs off window.BF so the
 * app runs from file:// without a bundler (classic scripts, load order matters).
 */
(function (BF) {
  'use strict';

  const U = (BF.util = {});

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  /** Escape any value for safe interpolation into HTML text or attributes. */
  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

  /** querySelector / querySelectorAll shorthands. */
  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

  /** 1234567 -> "1,234,567" */
  U.fmt = (n) => (Math.round(Number(n) || 0)).toLocaleString('en-US');

  /** 1234567 -> "1.2M" (compact counts for cards). */
  U.compact = (n) => {
    n = Number(n) || 0;
    const a = Math.abs(n);
    const f = (v, s) => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + s;
    if (a >= 1e12) return f(n / 1e12, 'T');
    if (a >= 1e9) return f(n / 1e9, 'B');
    if (a >= 1e6) return f(n / 1e6, 'M');
    if (a >= 1e4) return f(n / 1e3, 'K');
    return U.fmt(n);
  };

  U.pct = (v) => Math.round((Number(v) || 0) * 100) + '%';
  /** 'Iron Sword' -> 'an Iron Sword'. */
  U.withArticle = (w) => (/^[aeiou]/i.test(String(w)) ? 'an ' : 'a ') + w;
  U.plural = (n, one, many) => U.fmt(n) + ' ' + (Math.abs(n) === 1 ? one : many || one + 's');

  /** FNV-1a 32-bit string hash (unsigned). */
  U.hash = (str) => {
    let h = 0x811c9dc5;
    str = String(str);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  /** Seeded PRNG (mulberry32). Returns a function producing floats in [0,1). */
  U.rng = (seed) => {
    let a = (typeof seed === 'string' ? U.hash(seed) : seed >>> 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  U.rand = (a, b, r) => a + ((r || Math.random)() * (b - a));
  U.randInt = (a, b, r) => a + Math.floor((r || Math.random)() * (b - a + 1));
  U.chance = (p, r) => (r || Math.random)() < p;
  U.pick = (arr, r) => arr[Math.floor((r || Math.random)() * arr.length)];
  U.shuffle = (arr, r) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor((r || Math.random)() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  /** Pick from [{w, v}] (or [[w, v]]) by weight. */
  U.weighted = (entries, r) => {
    let total = 0;
    for (const e of entries) total += Array.isArray(e) ? e[0] : e.w;
    let roll = (r || Math.random)() * total;
    for (const e of entries) {
      const w = Array.isArray(e) ? e[0] : e.w;
      if ((roll -= w) <= 0) return Array.isArray(e) ? e[1] : e.v;
    }
    const last = entries[entries.length - 1];
    return Array.isArray(last) ? last[1] : last.v;
  };

  let uidCounter = 0;
  U.uid = (p) => (p || 'id') + '_' + Date.now().toString(36) + (uidCounter++).toString(36) + Math.random().toString(36).slice(2, 6);

  const pad2 = (n) => (n < 10 ? '0' : '') + n;

  /** Local calendar day key "YYYY-MM-DD". */
  U.dayKey = (t) => {
    const d = new Date(t == null ? Date.now() : t);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  };
  /** Days between two day keys (b - a). */
  U.dayDiff = (a, b) => {
    const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    const ta = Date.UTC(pa[0], pa[1] - 1, pa[2]), tb = Date.UTC(pb[0], pb[1] - 1, pb[2]);
    return Math.round((tb - ta) / 86400000);
  };
  /** ISO week key "YYYY-Www". */
  U.weekKey = (t) => {
    const d = new Date(t == null ? Date.now() : t);
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    return date.getUTCFullYear() + '-W' + pad2(week);
  };

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  U.fmtDate = (t) => {
    const d = new Date(t);
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  };
  U.fmtDateTime = (t) => {
    const d = new Date(t);
    return U.fmtDate(t) + ' · ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  };
  U.fmtClockTime = (t) => {
    const d = new Date(t);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  };
  U.timeAgo = (t, now) => {
    const s = Math.max(0, Math.round(((now || Date.now()) - t) / 1000));
    if (s < 45) return 'just now';
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    if (s < 86400 * 7) return Math.round(s / 86400) + 'd ago';
    return U.fmtDate(t);
  };
  /** 83.456s -> "1:23.45" */
  U.fmtTime = (ms) => {
    if (ms == null || !isFinite(ms)) return '—';
    const total = Math.max(0, ms) / 1000;
    const m = Math.floor(total / 60);
    const s = total - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  };
  /** 125 -> "2:05" */
  U.fmtClock = (sec) => {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ':' + pad2(sec % 60);
  };
  U.fmtDuration = (sec) => {
    sec = Math.round(sec);
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.floor(sec / 60) + 'm';
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h + 'h ' + m + 'm';
  };

  U.debounce = (fn, ms) => {
    let t = null;
    const d = function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(self, args), ms);
    };
    d.cancel = () => clearTimeout(t);
    return d;
  };
  U.throttle = (fn, ms) => {
    let last = 0, t = null;
    return function () {
      const now = Date.now(), args = arguments, self = this;
      const run = () => { last = Date.now(); t = null; fn.apply(self, args); };
      if (now - last >= ms) run();
      else if (!t) t = setTimeout(run, ms - (now - last));
    };
  };
  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Parse a user-typed amount ("1,000,000", "50 000", "1_000") into a positive
   * integer. Returns NaN for anything that is not a whole positive number.
   */
  U.parseAmount = (str) => {
    const s = String(str == null ? '' : str).trim().replace(/[\s,_]/g, '');
    if (!/^\d+$/.test(s)) return NaN;
    const n = Number(s);
    return Number.isSafeInteger(n) ? n : NaN;
  };

  U.dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  U.angleTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);
  U.wrapAngle = (a) => {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  U.approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));

  /** Color helpers. */
  U.hexToRgb = (hex) => {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  U.rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  U.mix = (a, b, t) => {
    const A = U.hexToRgb(a), B = U.hexToRgb(b);
    return U.rgbToHex(U.lerp(A.r, B.r, t), U.lerp(A.g, B.g, t), U.lerp(A.b, B.b, t));
  };
  /** shade('#ff0000', 0.3) lightens, negative darkens. */
  U.shade = (hex, amt) => (amt >= 0 ? U.mix(hex, '#ffffff', amt) : U.mix(hex, '#000000', -amt));
  U.alpha = (hex, a) => {
    const c = U.hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  };

  /** Copy text to clipboard; falls back to a hidden textarea selection. */
  U.copyText = async (text) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch (e) {
      return false;
    }
  };

  /** Trigger a file download of text content. Returns false if the host blocks it. */
  U.downloadText = (filename, text, mime) => {
    try {
      const blob = new Blob([text], { type: mime || 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    } catch (e) {
      return false;
    }
  };

  U.readFileText = (file) =>
    new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsText(file);
    });

  /** Resize an image file to a JPEG data URL (for user-uploaded thumbnails). */
  U.imageFileToDataURL = (file, maxW, maxH) =>
    new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(maxW / img.width, maxH / img.height, 1);
          const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
          const c = document.createElement('canvas');
          c.width = maxW; c.height = maxH;
          const g = c.getContext('2d');
          g.fillStyle = '#10141b';
          g.fillRect(0, 0, maxW, maxH);
          g.drawImage(img, (maxW - w) / 2, (maxH - h) / 2, w, h);
          resolve(c.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => reject(new Error('Could not read that image.'));
        img.src = String(fr.result);
      };
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });

  /** Deep clone for plain JSON data. */
  U.clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

  /** Stable ordinal suffix: 1 -> 1st */
  U.ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  U.svgData = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

  U.prefersReducedMotion = () => {
    try {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  };
})((window.BF = window.BF || {}));
