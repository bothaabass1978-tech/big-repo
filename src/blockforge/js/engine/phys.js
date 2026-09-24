/**
 * BlockForge — tiny 2D collision helpers shared by top-down and side-view games.
 * Rects are {x, y, w, h}; circles are {x, y, r}.
 */
(function (BF) {
  'use strict';

  const phys = (BF.phys = {
    pointInRect(x, y, r) {
      return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    },

    rectsOverlap(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    },

    /** Push vector to move a circle out of a rect, or null when not touching. */
    circleRect(cx, cy, r, rect) {
      const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
      const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
      let dx = cx - nx, dy = cy - ny;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) return null;
      if (d2 === 0) {
        // centre inside the rect: push out along the shallowest axis
        const left = cx - rect.x, right = rect.x + rect.w - cx, top = cy - rect.y, bottom = rect.y + rect.h - cy;
        const m = Math.min(left, right, top, bottom);
        if (m === left) return { x: -(left + r), y: 0 };
        if (m === right) return { x: right + r, y: 0 };
        if (m === top) return { x: 0, y: -(top + r) };
        return { x: 0, y: bottom + r };
      }
      const d = Math.sqrt(d2);
      const push = r - d;
      return { x: (dx / d) * push, y: (dy / d) * push };
    },

    /** Resolve an entity {x, y} of radius r against rects; returns true if it collided. */
    resolve(ent, r, rects) {
      let hit = false;
      for (let i = 0; i < rects.length; i++) {
        const p = phys.circleRect(ent.x, ent.y, r, rects[i]);
        if (p) { ent.x += p.x; ent.y += p.y; hit = true; }
      }
      return hit;
    },

    /** Keep a circle inside bounds {x, y, w, h}. */
    clampTo(ent, r, b) {
      let hit = false;
      if (ent.x < b.x + r) { ent.x = b.x + r; hit = true; }
      if (ent.x > b.x + b.w - r) { ent.x = b.x + b.w - r; hit = true; }
      if (ent.y < b.y + r) { ent.y = b.y + r; hit = true; }
      if (ent.y > b.y + b.h - r) { ent.y = b.y + b.h - r; hit = true; }
      return hit;
    },

    /** Does segment (x1,y1)-(x2,y2) cross the rect? (Liang–Barsky clip) */
    segRect(x1, y1, x2, y2, r) {
      let t0 = 0, t1 = 1;
      const dx = x2 - x1, dy = y2 - y1;
      const p = [-dx, dx, -dy, dy];
      const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
      for (let i = 0; i < 4; i++) {
        if (p[i] === 0) { if (q[i] < 0) return false; }
        else {
          const t = q[i] / p[i];
          if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
          else { if (t < t0) return false; if (t < t1) t1 = t; }
        }
      }
      return true;
    },

    /** Line of sight: true when no rect blocks the segment. */
    los(x1, y1, x2, y2, rects) {
      for (let i = 0; i < rects.length; i++) if (phys.segRect(x1, y1, x2, y2, rects[i])) return false;
      return true;
    },

    /** Distance from point to segment. */
    distToSeg(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1, dy = y2 - y1;
      const l2 = dx * dx + dy * dy || 1;
      let t = ((px - x1) * dx + (py - y1) * dy) / l2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    },

    /** Elastic-ish separation of two circles {x,y,vx,vy,r,m}. */
    bounceCircles(a, b, restitution) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 0.0001;
      const overlap = a.r + b.r - d;
      if (overlap <= 0) return false;
      const nx = dx / d, ny = dy / d;
      const ma = a.m || 1, mb = b.m || 1;
      a.x -= nx * overlap * (mb / (ma + mb));
      a.y -= ny * overlap * (mb / (ma + mb));
      b.x += nx * overlap * (ma / (ma + mb));
      b.y += ny * overlap * (ma / (ma + mb));
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv < 0) {
        const j = (-(1 + (restitution == null ? 0.6 : restitution)) * rv) / (1 / ma + 1 / mb);
        a.vx -= (j * nx) / ma;
        a.vy -= (j * ny) / ma;
        b.vx += (j * nx) / mb;
        b.vy += (j * ny) / mb;
      }
      return true;
    },

    /** Steer from (x,y) toward angle, sliding around rects: returns an adjusted unit vector. */
    steer(x, y, dirX, dirY, r, rects, look) {
      look = look || 28;
      const probe = (ax, ay) => {
        const px = x + ax * look, py = y + ay * look;
        for (let i = 0; i < rects.length; i++) if (phys.circleRect(px, py, r, rects[i])) return false;
        return true;
      };
      if (probe(dirX, dirY)) return { x: dirX, y: dirY };
      const angles = [0.6, -0.6, 1.2, -1.2, 1.8, -1.8];
      const base = Math.atan2(dirY, dirX);
      for (const a of angles) {
        const ax = Math.cos(base + a), ay = Math.sin(base + a);
        if (probe(ax, ay)) return { x: ax, y: ay };
      }
      return { x: -dirX, y: -dirY };
    },
  });
})((window.BF = window.BF || {}));
